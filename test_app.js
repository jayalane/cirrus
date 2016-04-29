/*jslint plusplus: false */

// sends a bunch of msgs

// NODE modules
var fs = require('fs');  

// CIRRUS modules
var stats = require('./lib/stats');
var cirrus = require('./lib/cirrus');
var ml1    = require('./lib/mylog');
var ml     = new ml1.Logger('TEST_APP', __filename);
var cp     = require('./lib/control-port');
var max_fan_out = 5;
var max_generations = 50;

var random_ent = function () { // utility to generate an entity name

    var text = "", 
        possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        i;

    for (i = 0; i < 3; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var test_cb = function (err, ent_msg, msg) {  // called back with entity msg reply
    if (err) {
        ml.info("Error for test_cb: " + err);
        return;
    }
    ml.info('Got message reply:');
    ml.info('    msg: ' + JSON.stringify(msg));
    ml.info('    ent_msg: ' + JSON.stringify(ent_msg));
};

var recv_echo_req = function (msg, entity, sender, ent_msg) {   // this sends a msg on and replies when it gets a msg

    var generation, fan_out, send_to, out_msg = {}, cb;

    send_to = msg.send_to;
    generation = msg.generation;

    ml.info('Got message:');
    ml.info('    msg: ' + JSON.stringify(msg));
    ml.info('    ent: ' + JSON.stringify(entity));
    ml.info('    sender: ' + JSON.stringify(sender));
    ml.info('    ent_msg: ' + JSON.stringify(ent_msg));
    
    if (generation > max_generations) {
        ml.info("Generation > " + max_generations + " - dropping");
        return;
    }

    out_msg.ack = true;  // this is whatever you want
    out_msg.scrommius = 3;
    out_msg.generation = generation + 1;
    // reply
    cirrus.send_entity_reply(ent_msg, out_msg);   // ent_msg from framework, out_msg with your data
    
    // sending on a new message 

    if (entity.name.length < 100) {
        // first send to send to
        msg.generation = generation + 1;
        msg.send_to = send_to;
        cirrus.send_entity_msg(msg, 
                               entity, 
                               "test:" + msg.send_to, 
                               'rm', -1, -1, 60 * 10, test_cb);

        cb = function (re, fan_item) {
            return function () {
                msg.send_to = entity.name.length + re + "-" + fan_item;
                
                cirrus.send_entity_msg(msg, 
                                       entity, 
                                       "test:" + msg.send_to, 
                                       'rm', -1, -1, 60 * 10, test_cb);
            };
        };
        for (fan_out = 0; fan_out < max_fan_out; fan_out++) {
            setTimeout(cb(random_ent(), fan_out), 1000 + Math.floor(Math.random() * 500));
        }
    }
};

var recv_echo_rep = function (msg, entity, sender, ent_msg) {  //not used yet

    ml.info('Got message:');
    ml.info('    msg: ' + JSON.stringify(msg));
    ml.info('    ent: ' + JSON.stringify(entity));
    ml.info('    sender: ' + JSON.stringify(sender));
    ml.info('    ent_msg: ' + JSON.stringify(ent_msg));
};

cirrus.register_entity_cb('rm', -1, -1, recv_echo_req);   // register the above CBs
cirrus.register_entity_cb('rm', -1, -2, recv_echo_rep);

cp.def_cp_cmd(function (a, b) { 

    if (a > 0) {
        max_fan_out = a;
    }
    if (b > 0) {
        max_generations = b;
    }
    cirrus.send_entity_msg({"send_to" : random_ent(), "generation" : 1}, null, "test:" + random_ent(), 'rm', -1, -1, 10 * 60, test_cb);

}, 'trigger_test', 'Causes a storm of traffic to be generated in test app.');

    