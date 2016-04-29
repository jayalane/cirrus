/*jslint 
    bitwise: true,
    plusplus: true
*/

// "cloud" handlers 



// an application has 1 primary and 2 secondary pools to perform work/backup state/backup state.
// within the primary, the work is assigned by a hash on some string - application dependant
// external clients connect to HTTPS via web.js URIs like /cirrus/app/URI
// internal communication is handled via persistant TCP connections, mesh between 
// all the components in the domain pools.  
// if the primary starts to fail, there is a one time automatic fail over to a secondary, but the
// primary won't come up without operator intervention.  

// goal is availability with some monitoring/Ops actions.  
// robust but not algorithmic recovery.  

// reads topo

// gets HTTPS requests from main interface, and either passes to handler (and dispatches to 
// secondary sites) or issues 302 to primary host.  

var web          = require('./web');
var config       = require('./config');
var topo         = require('./topo');
var link         = require('./link');
var ml1          = require('./mylog');
var ml           = new ml1.Logger('CIRRUS', __filename);

var base64       = require('./base64');
var er           = require('./entity_route');
var stats        = require('./stats');
var cp           = require('./control-port');
var migration    = require('./migration');

var cirrus_subtype = {   // for msg dispatch
    'APPL_MSG'    : 1,
    'BUCKET_INFO' : 2, 
    'MAP_INFO'    : 3,
    'FWD_MSG'     : 4
};

var bucket_state = {
    'HERE' : 1,
    'MIGRATING' : 2,
};

var ent_state = {
    'HERE'    : 1,    // can receive ent msgs
    'DELETED' : 2,    // can't receive ent msgs
    'SENT_DATA' : 3   // forward ent msgs
};



// routing tag

var string_from_type_obj = function (msg) {
    return msg.appl_id + '-' + msg.type + '-' + msg.subtype;
};

// bucket structures

var buckets = [];   // array of objects that hold entities

var num_buckets = topo.get_hash_buckets(); // default

var init_buckets = function () { 
    var i;
    for (i = 0; i < num_buckets; i++) {
        buckets[i] = {};
    }
};

init_buckets();

// some statistics

// # ents
// # ent msgs
// response time?
// # pending requests

var pend_req_stats = new stats.Stats('Pending ent msgs', 'counter');
var ent_stats      = new stats.Stats('Entities',         'counter');
var ent_msg_stats  = new stats.Stats('Ent Msgs',         'mono');
var ent_rep_stats  = new stats.Stats('Ent Msg Replies',  'mono');

// CB matrix

var cirrus_cbs = {};
var cirrus_cb_send_stats = {};
var cirrus_cb_recv_stats = {};

var send_entity_msg_internal = function (msg) {

    var dest_link;

    ml.debug('MSG: ' + JSON.stringify(msg));

    if (msg.destination.search("link:") === 0) {
        dest_link = link.get_link_for_node(msg.destination.substring("link:".length));
        return dest_link.send(msg, link.msg_type.CIRRUS, cirrus_subtype.APPL_MSG);
    }

    msg.dest_bucket = er.get_bucket(msg.destination, 
                                    topo.get_hash_buckets(msg.appl_id));
    
    dest_link = er.link_for_bucket(msg.appl_id, 
                                   topo.get_primary(msg.appl_id),
                                   msg.dest_bucket);
    
    if (dest_link) {
        ml.debug("Entity msg send is using link: " + dest_link.name);
        return dest_link.send(msg, link.msg_type.CIRRUS, cirrus_subtype.APPL_MSG);

    }
    return null;
};

var req_id = (process.pid << 16) | 1;  

var pending_reqs = {};

var del_pending_req = function (req_id) {
    pend_req_stats.decr();
    delete pending_reqs[req_id];
};

var Request = function (timeout, cb) {
    if (!timeout) {
        timeout = 60 * 10;  // ctann2 -- 10 minutes (in seconds)
    }
    this.cb = cb;
    this.req_id = req_id++;
    this.timeout_h = setTimeout(function () 
                                {
                                    del_pending_req(this.req_id);
                                    
                                    if (cb) {
                                        ml.error("Got timeout in ent msg reply! - reqid " + 
                                                 this.req_id);
                                        cb("TIMEOUT");
                                    }
                                }, timeout * 1000);

    pending_reqs[this.req_id] = this;
    pend_req_stats.incr();
    return this;
};

var get_req_id = function (timeout, cb) {
    var req_id = new Request(timeout, cb).req_id;
    ml.debug("Got req id: " + req_id);
    return req_id;
};

var send_entity_msg = exports.send_entity_msg = function (
    msg, 
    src_entity, 
    dest_name, 
    appl_id, 
    msg_type, 
    msg_subtype, 
    timeout, cb) {

    var rc, out_going_msg = {};

    ml.debug("Sending msg called " + JSON.stringify(msg) + ', ' + 
             JSON.stringify(src_entity) + ', ' + dest_name + ', ' + appl_id + 
             ', ' + msg_type + ', ' + msg_subtype + ', ' + timeout + ', ' + 
             JSON.stringify(cb));

    ent_msg_stats.incr();

    if (cirrus_cb_send_stats[string_from_type_obj(msg)] !== undefined) {
        cirrus_cb_send_stats[string_from_type_obj(msg)].incr();
    }

    out_going_msg.msg         = msg;

    if (src_entity) {
        out_going_msg.sender      = src_entity.name;
    } else {
        out_going_msg.sender      = "link:" + process.argv[2];
    }
    out_going_msg.destination = dest_name;
    out_going_msg.appl_id     = appl_id;
    out_going_msg.type        = msg_type;
    out_going_msg.subtype     = msg_subtype;
    if (cb) {
        out_going_msg.req_id  = get_req_id(timeout, cb);  // could pass in timeout here
    }

    rc = send_entity_msg_internal(out_going_msg);
    
    if ((rc < 0) && (cb)) {
        cb("SEND_CONGESTED");        
        del_pending_req(out_going_msg.req_id);
    }

    return rc;
};


var send_entity_reply = exports.send_entity_reply = function (ent_msg, msg) {   
    //ent_msg from CB; msg == app data

    var out_going_msg = {};
    
    ml.debug("Sending reply called " + JSON.stringify(msg) + ', ' + JSON.stringify(ent_msg));
    
    ent_rep_stats.incr();
    
    out_going_msg.msg         = msg;
    out_going_msg.sender      = ent_msg.destination;
    out_going_msg.destination = ent_msg.sender;
    out_going_msg.appl_id     = ent_msg.appl_id;
    out_going_msg.reply       = true;
    out_going_msg.req_id      = ent_msg.req_id;
    out_going_msg.ent_msg     = ent_msg;

    return send_entity_msg_internal(out_going_msg);
};



var register_entity_cb = exports.register_entity_cb = function (app_id, msg_type, msg_subtype, cb) {
    // call this to register your application CallBack.

    var obj = { appl_id : app_id, type: msg_type, subtype: msg_subtype }, 
        cb_name = string_from_type_obj(obj);

    ml.info('Entity CB registered:' + cb_name);
    cirrus_cbs[cb_name] = cb;
    cirrus_cb_send_stats[cb_name] = new stats.Stats(cb_name + ' msg sent', 'mono');
    cirrus_cb_recv_stats[cb_name] = new stats.Stats(cb_name + ' msg recv', 'mono');
};

var get_entity_cb = function (msg) {
    // internally used to route to the above registered CBs

    ml.debug('Seeking entity CB for: ' + msg.appl_id + '-' + msg.type + '-' + msg.subtype);
    return cirrus_cbs[msg.appl_id + '-' + msg.type + '-' + msg.subtype];
};

web.register_simple('cirrus', function (action, pathname, cb, query) {
    // for testing
    // URIs look like /cirrus/app/type/subtype/key/base64(JSON)

    var app, type, sub_type, key, json_string, json_base64, json_obj, p_ary;

    p_ary = pathname.substring(1).split("/");
    app  = p_ary[1];
    type = parseInt(p_ary[2], 10);
    sub_type = parseInt(p_ary[3], 10);
    key = p_ary[4];
    try {
        json_obj = JSON.parse(base64.base64_decode(p_ary[5]));
    } catch (err) {
        return cb("JSON error" + JSON.stringify(err));
    }
    
    send_entity_msg(json_obj, 'link:' + process.argv[2], 
                    key, app, type, sub_type, 60, 
                    function (e, m) {
                        cb("OK - " + JSON.stringify(m));
                    });


});

var Entity = function (name) {
    this.name      = name;
    this.ent_state = ent_state.HERE;
    this.data      = {};
    this.bucket    = er.get_bucket(name);

    if (typeof buckets[this.bucket] === 'undefined') {

        buckets[this.bucket] = {};
        buckets[this.bucket].ents = [];
        buckets[this.bucket].bucket_state = bucket_state.HERE;

    }
    buckets[this.bucket].ents.push(this);
    ent_stats.incr();
};

var get_or_create_entity = function (entity_name, dest_bucket) {

    var the_entity;

    if (dest_bucket !== er.get_bucket(entity_name, num_buckets)) {
        return null;
    }

    the_entity = buckets[dest_bucket].entity_name;

    if (the_entity) {
        return the_entity;
    }

    the_entity = new Entity(entity_name);
    
    return the_entity;
        
};

exports.get_or_create_entity = get_or_create_entity;

var cirrus_msg_handler = function (link, sub_type, msg) {

    // CB from link layer - msg already parsed, just dispatch

    var entity, rc, cb, req, ent_msg;

    
    switch (sub_type) {
    case cirrus_subtype.APPL_MSG:
        if (msg.reply) {

            ent_rep_stats.incr();

            if (pending_reqs[msg.req_id] !== undefined) {
                req = pending_reqs[msg.req_id];
                clearTimeout(req.timeout_h);
                rc = req.cb(false, msg.ent_msg.msg, msg.msg);
                if (rc < 0) {
                    ml.info("Error for cirrus CB: " + msg.destination);
                }
                pend_req_stats.decr();
                delete pending_reqs[msg.req_id];
            } else { // reply but no CB
                ml.info("Error: reply CB but no req id pending! " + msg.req_id);
            }
        } else {
            ent_msg_stats.incr();

            entity = get_or_create_entity(msg.destination, msg.dest_bucket);
            
            if (entity) {
                ent_msg = {};
                cb = get_entity_cb(msg);
                if (cb) {
                    cirrus_cb_recv_stats[string_from_type_obj(msg)].incr();
                    rc = cb(msg.msg, 
                            entity, 
                            msg.sender, 
                            msg); // msg === ent msg, used to send reply, and get CB data 
                    if (rc < 0) {
                        ml.info("Error for cirrus CB: " + msg.destination);
                    }
                } else {
                    ml.info("Error: no CB for entity" + msg.destination + " from " + msg.sender);
                    return;
                }
            } else {  // not entity
                ml.info("Error: bucket mismatch; ent not found. " + msg.destination);
            }
        }
        return;

    case cirrus_subtype.KEEP_ALIVE:
        return;

    case cirrus_subtype.MAP_INFO:
        migration.cb_map_info_msg(link, msg);
        return;

    case cirrus_subtype.ENT_INFO:
        migration.cb_ent_info_msg(link, msg);
        return;

    case cirrus_subtype.FWD_MSG:
        migration.cb_fwd_msg(link, msg);
        return;

    default:
        ml.error('unknown subtype ' + sub_type + ' from ' + link.name);
        return;
    }
};


link.add_type_handler(link.msg_type.CIRRUS, cirrus_msg_handler);
