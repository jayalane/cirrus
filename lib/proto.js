// this file knows about some link internal fields.  


// parse nput functions take self, buffer, pos, length, return bytes consumed or -1 on error

// get_header(self, buffer, pos, length);
// get_asterisk(self, buffer, pos, length);

var tests = require('./tests');
//var tests = require('./tests');
var ml1   = require('./mylog');
var ml    = new ml1.Logger('PROTO', __filename);
 
var ParseRunner = function (link, buffer, pos, len, max_msg_len) {
    var a;

    this.link = link;
    this.buffer = buffer.toString(); // TODO make this work more efficiently
    this.pos = pos;
    this.error = false;
    this.pending_msg = {};
    this.data = {};
    this.len = len;
    this.max_msg_len = max_msg_len;

    return this;
};

var make_get_thing = function (char) {
    return function (buffer, pos, len) {
        if (buffer[pos].charCodeAt(0) === char.charCodeAt(0)) {
            return { 'rc' : 1 };
        }
        ml.info(buffer[pos] + ' is not ' + char + '!');
        return { 'rc' : -1 };
    };
};

var get_asterisk = make_get_thing('*');
var get_comma = make_get_thing(',');
var get_one = make_get_thing('1');
var get_two = make_get_thing('2');

var get_number = function (buffer, pos, len) {
    var res = 0;

    res = parseInt(buffer.toString().substr(pos), 10);  

    if (isNaN(res)) {
        ml.info(buffer.toString().substr(pos) + ' is not a number!');
        return { 'rc': -1 };
    }
    return { 'rc' : (res.toString()).length, 'value' : res };
};

var get_json = function (buffer, pos, len) {
    // this one consumes the rest of the passed in len
    var res = 0;

    try {
        res = JSON.parse(buffer.toString().substr(pos, len));
    } catch (err) {
        if (err.toString().indexOf('SyntaxError') !== -1) {
             ml.info('Bad JSON');
             return { 'rc' : 'JSON' };
         }
        ml.debug2('Failed JSON short ' + err);
        return { 'rc' : 0};
    }
    return { 'rc' : len, 'value' : res};
};

ParseRunner.prototype.add = function (cb, field_name, field_name2) {

    var me, res, done_len, number, json_data, read_length;

    me = this;

    if (me.error) {
        return me;
    }
    if (me.len === 0) {
        me.error = 'SHORT';
        return me;
    }
    if (field_name2) {
        if (me.data[field_name2] > me.len) {
            ml.error('Length present ' + me.len + ' smaller than length needed ' + 
                      me.data[field_name2] + ' ' + field_name2);
            me.error = 'SHORT';
            return me;
        } 
    }
    res = cb(me.buffer, me.pos, me.data[field_name2]);

    if (res.rc === 'JSON') {
        me.error = true;
        return me;
    }

    done_len = parseInt(res.rc, 10);
    
    if (done_len === -1) {
        me.error = true;
        return me;
    }
    if (done_len === 0) { // JSON -- probably short
        me.error = 'SHORT'; 
        return me;
    }
    if (done_len > me.len) {
        ml.error('done len ' + done_len + ' greater than len ' + me.len);
        me.error = true;
        return me;
    }
    me.len = me.len - done_len;
    me.pos = me.pos + done_len;

    if (field_name) {
        if ((field_name === 'length') && (me.max_msg_len < res.value)) {
            ml.error('Incoming msg length too large!');
            me.error = true;
            return me;
        }
        me.data[field_name] = res.value;
    }
    return me;
};

var parse_msg = exports.parse_msg = function (self, buffer, pos, len) { // self is a link

    var tmp, the_parser = new ParseRunner(self, buffer, pos, len, self.max_msg_len);

    if (len < 11) { 

        the_parser.error = 'SHORT';

    } else {
        // the following code defines the wire protocol.

        tmp = the_parser.add(get_asterisk).add(get_two).add(get_comma).add(get_number, 
                                                                           'type').add(get_comma);
        tmp = tmp.add(get_number, 'sub_type').add(get_comma);
        tmp = tmp.add(get_number, 'seq_no').add(get_comma).add(get_number, 'length');
        tmp = tmp.add(get_comma).add(get_json, 'obj', 'length');

    }
    return the_parser;
};

var test_maker = function (max_msg_len, string) {

    return function (cb) {

        var parsed, obj = { max_msg_len: max_msg_len };

        parsed = parse_msg(obj, string, 0, string.length);
        if (parsed.error) {
            cb('err' + parsed.error);
        } else {
            cb('ok' + parsed.len);
        }
        
    };
};

new tests.Tests("parse full", 
                test_maker(200, 
                           '*2,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' +
                             '"destination":"test:8Gyjy","appl_id":"rm",' +
                             '"type":-1,"subtype":-1,"req_id":-1299905963,"dest_bucket":0}'), 
                "ok0").run();
new tests.Tests("parse version fail", 
                test_maker(200, 
                           '*1,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                           '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                           '"subtype":-1,"req_id":-1299905963,"dest_bucket":0}'), 
                "errtrue").run();
new tests.Tests("json fail", 
                test_maker(200, '*2,2,1,105,166,' + 
                           '^*{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                           '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                           '"subtype":-1,"req_idd:-1299905963,"dest_bucket":0}'),
                "errtrue").run();
new tests.Tests("parse partial", 
                test_maker(200, 
                           '*2,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                           '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                           '"subtype":-1,"req_id":-1299905963,"dest_bucket":0}*2,'), 
                "ok3").run();
new tests.Tests("short read", 
                test_maker(164, 
                           '*2,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                             '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                             '"subtype":-1,"req_id":-1299905963,"dest_bucket":0'), 
                           "errSHORT").run();
new tests.Tests("bad parse", 
                test_maker(200, '))))*2,2,1,105,164,' + 
                                '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                                  '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                                  '"subtype":-1,"req_id":-1299905963,"dest_bucket":0'), 
                "errtrue").run();
new tests.Tests("too long msg", 
                test_maker(20, 
                           '*2,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                             '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                             '"subtype":-1,"req_id":-1299905963,"dest_bucket":0'), 
                           "errtrue").run();
new tests.Tests("normal", 
                test_maker(164, 
                           '*2,2,1,105,164,' + 
                           '{"msg":{"send_to":"8Gyjy","generation":3},"sender":"test:0LT",' + 
                             '"destination":"test:8Gyjy","appl_id":"rm","type":-1,' + 
                             '"subtype":-1,"req_id":-1299905963,"dest_bucket":0}*1'), 
                "ok2").run();

