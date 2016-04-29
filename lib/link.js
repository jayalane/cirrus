/*jslint plusplus: true */

// Handles the TCP Links (reconnects as needed, 

// link = new Link(src, dst)

// link is an event emmitter -- it emits msgs to registered listeners.   
//                              it acks msgs back to source
//                              it sends messages -- dropping them when too many un-acked.  
//                              it sits on top of some TCP streams, re-establishing them as needed.

// node modules
var net  = require('net');
var util = require('util');

// my modules
var ml1   = require('./mylog');
var ml    = new ml1.Logger('LINK', __filename);  // logging
var cp    = require('./control-port');           // to add control port commands
var ep    = require('./endpoint');               // not sure it's needed 
var stats = require('./stats');                  // stats
var proto = require('./proto');                  // parsing the protocol

// some stats
var link_connections = new stats.Stats('Link connections', 'counter'); // the stat for this file
var link_messages_stats = new stats.Stats('Link messages', 'mono');
var link_messages_bad_stats = new stats.Stats('Link messages bad', 'mono');
var link_messages_bad_sends = new stats.Stats('Link messages send failed', 'mono');
var link_messages_not_writable_sends = new stats.Stats('Link messages unwritable failed', 'mono');

var link_per_node = {};

var get_link_for_node = exports.get_link_for_node = function (node) {
    return link_per_node[node];
};

// functions are things only this module needs.  (or exported)
// prototype/methods are things callable by outside.  

var msg_type = exports.msg_type = {
    'LINK'   : 1,
    'CIRRUS' : 2
};

var link_subtypes = {
    'HELLO'       : 1,
    'KEEP_ALIVE'  : 2,  // TODO 10 minutes keep alive
    'ACK'         : 3   // TODO decide on per sequence ID acks
};

var link_callbacks = [];

var add_type_handler = function (msg_type, msg_cb) {
    link_callbacks[msg_type] = msg_cb;
};
exports.add_type_handler = add_type_handler;

var link_state = { 
    'UP' : 1,
    'PENDING_HELLO' : 2,
    'DOWN' : 3
};

var message_state = {
    'START' : 1,
    'SHORT' : 2
};

var links_array = [];  // used to get a link to send data on

var build_message = function (type, sub_type, seq_no, message) {

    var result, length; 

    // header = *1,  
    // next type
    // then ,
    // next subtype
    // then ,
    // then sequence number
    // then ,
    // then length (of message)
    // then another comma
    // then message 

    length = message.length;
    return "*2," + type + "," + sub_type + "," + seq_no + "," + length + "," + message;
};    

var teardown = function (self) {
    ml.info("Calling tear down on link: " + self.name);
    if (self.conn) {
        self.conn.destroy();
        self.conn = null;
    }
    self.link_state = link_state.DOWN;
};
   
var send = function (self, type, sub_type, json_string, cb) {
    var msg, save_msg;
    
    if (self.conn.writable) {
        msg = build_message(type, sub_type, self.seq_no, json_string);
        ml.debug2("Writing: " + self.name + ": <" + msg.toString() + ">");
        self.conn.write(build_message(type, sub_type, self.seq_no, json_string), function (err) {
            if (err) {
                ml.error('write to ' + self.dst.get_name() + ' failed! ' + err);
                link_messages_bad_sends.incr();
                teardown(self);
            }
            if (cb) {
                cb(err);
            }
        });
    } else {
        // no seq no now....
        save_msg = {};
        save_msg.type        = type;
        save_msg.sub_type    = sub_type;
        save_msg.json_string = json_string;
        save_msg.cb          = cb;
        self.saved_msgs.push(save_msg);
        ml.error('write to ' + self.dst.get_name() + ' failed - not writable - savng!');
        link_messages_not_writable_sends.incr();
        return;  // do not update seq no
    }
    
    self.seq_no ++;   // no threads -- and before above CB
    if (self.seq_no > 65535) {
        self.seq_no = 0;
    }
};

var send_handshake = function (self) {
    var type = 1, sub_type = 1, json_string = '{"src":"' + self.src.get_name() + 
                                              '","dst":"' +  self.dst.get_name() + '"}';

    send(self, type, sub_type, json_string);

};



//   handle internal link layer messages 


var link_handler = function (link, sub_type, msg) {

    switch (sub_type) {
    case link_subtypes.HELLO:
        ml.debug("Got hello for " + link.name);
        if ((msg.src === link.src.get_name()) &&
            (msg.dst === link.dst.get_name())) {

            link.link_state = link_state.UP;
            ml.debug('Link ' + link.name + ' up - post hello.');

        } else {
            ml.error('Hello failed validation {' + msg.src + ', ' + msg.dst + '} from ', link.name);
            teardown(link);
        }
        return;
    case link_subtypes.KEEP_ALIVE:
        return;
    default:
        ml.error('unknown subtype ' + sub_type + ' from ' + link.name);
    }
    
};

add_type_handler(msg_type.LINK, link_handler);




var dispatch_data = function (self, type, sub_type, msg) {

    if (link_callbacks[type]) {
        link_callbacks[type](self, sub_type, msg);
        link_messages_stats.incr();
    } else {
        ml.info('Msg with no callback registered type :' + type);
        link_messages_bad_stats.incr();
    }
};

var read_data = function (self, msg, recur) {

    // this function reads and saves the message until we have a complete message
    // it has to handle the case where the end of a message is in the middle of a 
    // segment

    var parsed_msg, type, sub_type, other_seq_no, dispatch_msg;

    ml.debug2("Read data " + self.name + " called with length " + msg.length);

    if (self.msg_state === message_state.START) {

        parsed_msg = proto.parse_msg(self, msg, 0, msg.length);
        
        if (parsed_msg.error === true) {

            ml.error('bad message {' + msg + '} from ' + self.name);
            link_messages_bad_stats.incr();
            teardown(self);

        } else if (parsed_msg.error === 'SHORT') {

            ml.debug2('short read on link ' + self.name);
            ml.debug2('saving: ' + msg.length + ' bytes');
            self.msg_state   = message_state.SHORT;
            self.pending_msg = msg;

        } else {  // should be ok then 

            type         = parsed_msg.data.type;
            sub_type     = parsed_msg.data.sub_type;
            msg          = parsed_msg.data.obj;
            other_seq_no = parsed_msg.data.seq_no;

            // check sequence no for sanity

            if (self.other_seq_no) {
                if ((other_seq_no !== self.other_seq_no + 1) || 
                    ((other_seq_no === 0) &&
                     (self.other_seq_no === 65535))) {
                    
                    ml.error('bad sequence number {' + other_seq_no + '} from ' + self.name);
                    ml.error('        wanted {' + (self.other_seq_no + 1) + 
                             '} from ' + self.name);
                    link_messages_bad_stats.incr();
                    teardown(self);

                } else {

                    self.other_seq_no = other_seq_no;

                }
            } else {
                self.other_seq_no = other_seq_no;
            }
            // whew, ok to dispatch
            dispatch_data(self, type, sub_type, msg);

            // now check to see if more data ...

            if ((false === parsed_msg.error) &&
                (parsed_msg.len > 0)) {
                ml.debug2("More data to parse [" + 
                          (parsed_msg.len - parsed_msg.pos) + "]");
                //recur ok and expected
                return read_data(self, parsed_msg.buffer.substr(parsed_msg.pos)); 
            }
        } // parse msg ok

    } else if (self.msg_state === message_state.SHORT) {
        // I think I have to cat the strings here. 

        msg = self.pending_msg + msg;
        self.msg_state = message_state.START;
        if (recur === 1) {
            ml.error('read data trying to call itself twice');
        } else {
            read_data(self, msg, 1);
        }
    } 

};

var set_up_call_backs = function (self, tofrom) {

    if (self.conn) {

        self.msg_state = message_state.START;

        self.conn.on('data', function (msg) {
            ml.debug2("Type of msg: " + typeof msg);
            msg = msg.toString();  // TODO this sucks
            ml.debug2("Data fired on " + self.name + ": " + msg.length + " bytes");
            read_data(self, msg);
        });
        self.conn.on('drain', function () {
            var i, msg, saved_msgs = self.saved_msgs;

            self.saved_msgs = [];
            ml.debug2("Drain fired on " + self.name);
            for (i = 0; i < saved_msgs.length; i++) {
                msg = saved_msgs[i];
                send(self, msg.type, msg.sub_type, msg.json_string, msg.cb);
            }
        });
        self.conn.on('connect', function () {
            link_connections.incr();
            ml.debug('link up: ' + self.name);
            self.src.mark_up();
            self.dst.mark_up();
            self.link_state = link_state.PENDING_HELLO;
            // handshake
            send_handshake(self);
        });
        self.conn.on('close', function () {
            ml.debug('Close TCP connection ' + tofrom + ' ' + self.name); 
            link_connections.decr();
            self.src.mark_down();
            self.link_state = link_state.DOWN;
            self.other_seq_no = null;
        });
        self.conn.on('error', function (err) {
            ml.debug('Error on TCP connection ' + tofrom + ' ' + self.name + ' ' + err); 
            self.src.mark_down();
            link_connections.decr();
            self.link_state = link_state.DOWN;
            self.other_seq_no = null;
        });
    } else {
        ml.warning('Trying to set callbacks for link ' + self.name + ' with no connection!');
    }
};

var Link = exports.Link = function (src, dst, port, max_msg_size, max_buf_size) {

    var me = this;

    me.name = src.get_name() + '/' + dst.get_name();
    me.src = src;  // a node
    me.dst = dst;  // a node
    me.port = port;
    me.max_msg_size = max_msg_size;
    me.max_buf_size = max_buf_size;
    me.seq_no = Math.floor(Math.random() * 65535);
    me.saved_msgs = [];
    links_array.push(me);
    if ((port === 0) && 
        (me.src.name === me.dst.name) && 
        (me.src.name === process.argv[2])) {  // loopback 

        me.link_state = link_state.UP;
        link_per_node[process.argv[2]] = me;
        ml.debug2("Loopback is " + me.name);

    } else {

        me.link_state = link_state.DOWN;

        if (me.src === ep.get_my_node()) {
            ml.debug("Adding local link" +  me.name + " dst " + me.dst.get_name());
            link_per_node[me.dst.get_name()] = me;
        }
        if (me.dst === ep.get_my_node()) {
            ml.debug("Adding local link" +  me.name + " src " + me.src.get_name());
            link_per_node[me.src.get_name()] = me;
        }
        ml.debug2('Making link ' + me.name);
    }
    // don't bring up until topo sync --?  
};

Link.prototype.bring_up = function () {
    
    var me = this;
    ml.debug('bring_up session');
    if (me.src === ep.get_my_node()) {
        
        ml.debug('connecting to ' + me.dst.get_host() + ' {' + 
                 me.dst.get_name() + '} port (' + me.port + ')');
        me.conn = net.createConnection(me.port,
                                       me.dst.get_host());
        set_up_call_backs(me, 'to');

    }

    if (me.dst === ep.get_my_node()) {

        if (!me.server) { 
            ml.debug('listening for ' + me.src.get_host() + '/' + 
                     me.src.get_name() + ' on port (' + me.port + ')');
            me.server = net.createServer(function (conn) { 
                
                //if (conn.remoteAddress !== me.src.get_ip()) {  // not very loosely coupled.
                //      conn.destroy();
                //      return;
                //}
                
                if (me.conn) {
                    me.conn.destroy();
                    link_connections.decr();
                }
                me.conn = conn;  // overwriting old conns?  
                link_connections.incr();
                set_up_call_backs(me, 'from');
            });
            me.server.listen(me.port);
            me.server.maxConnections = 2;
            me.server.on('error', function (err) {
                ml.debug('Lost TCP Listen for ' + me.port + ' ' + err); 
                me.src.mark_down();
                me.link_state = link_state.DOWN;
            });
        }
    }
    // if neither src nor dst, nothing to do 

};


Link.prototype.send = function (msg, type, sub_type, cb) {  

    var me = this;

    if (me.link_state !== link_state.UP) {
        // TODO logging?  Not too much
        ml.debug2("Link " + me.name + " down - dropping msg");
        return -1;
    }
    if (me.port === 0) {
        // loop back, just dispatch ....
        ml.debug2("Deferring loop back.");
        // TODO incr stat
        process.nextTick(function () 
                            {
                                // TODO decr stat
                                ml.debug2("Sending deferred loop back.");
                                dispatch_data(me, type, sub_type, msg);
                                if (cb) {
                                    cb();
                                }
                            });
        return 0;
    }
    if (me.conn.bufferSize > me.max_buffer_size) {
        // TODO logging?  Not too much
        ml.debug2("Link " + me.name + " congested - dropping msg");
        return -2;
    }
    return send(me, type, sub_type, JSON.stringify(msg), cb);

};

var port_calc = function (i, j) {
    return Math.pow(2, i) * Math.pow(3, j) % 1999;
};

exports.mesh_link = function () {

    var the_args = arguments, 
        i, j, loop_link, src_node,
        dst_node,
        port, max_buf_size, max_msg_size;

    max_buf_size = parseInt(the_args[the_args.length - 1], 10);
    max_msg_size = parseInt(the_args[the_args.length - 2], 10);

    for (i = 0; (i < (the_args.length) - 2); i++) {
        
        src_node = ep.get_node_by_name(the_args[i]);

        for (j = 0; j <= i; j++) { 

            dst_node = ep.get_node_by_name(the_args[j]);

            if (dst_node && src_node) {
                if (dst_node !== src_node) {
                    port = 30000 + port_calc(i, j);
                } else {
                    port = 0; // loopback
                }
                ml.debug("src " + src_node.get_name() + "dst "+dst_node.get_name()+ "port "+port);
                loop_link = new Link(src_node, dst_node, port, max_buf_size); 
            }
        }
    }
};

var topo_sync = exports.topo_sync = function () {

    var i, link;

    ml.info('starting topo sync');
    
    for (i = 0; i < links_array.length; i++) {
        link = links_array[i];
        if (link.link_state === link_state.DOWN) {
            link.bring_up();
        }
    }
    return "OK";
};


var topo_sync_timer_cb = function () {

    setTimeout(topo_sync_timer_cb, 5000);
    topo_sync();

};

setTimeout(topo_sync_timer_cb, 5000);


cp.def_cp_cmd(topo_sync, 'topo_sync', "Reconnect all the down links");


cp.def_cp_cmd(function () {

    var i, result = [], temp_str = '', link;

    for (i = 0; i < links_array.length; i++) {
        link = links_array[i];
        if ((link.src.name === process.argv[2]) ||
            (link.dst.name === process.argv[2])) {
            temp_str = link.name + '; state ';
            if (link.link_state === link_state.UP) {
                temp_str += 'UP'; 
            } else if (link.link_state === link_state.PENDING_HELLO) {
                temp_str += 'PENDING_HELLO'; 
            } else {
                temp_str += 'DOWN';
            }
            result.push(temp_str);
        }
    }
    return result.join("\n");
}, 'link_list', "List all Links in system");
