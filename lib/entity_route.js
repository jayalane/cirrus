/*jslint
    plusplus: true
*/

// This file maps entity names to buckets and thence to nodes

// for now a map is an array to a link.  

// It knows about topo therefor.  
var ml1   = require('./mylog');
var ml    = new ml1.Logger('CIRRUS_ROUTE', __filename);
var topo = require('./topo');
var link = require('./link');
var cp   = require('./control-port');
var md5 = require('./md5');

var map = {};
var new_map = {};

if (!md5.md5_vm_test) {
    throw new Error("MD5 failed! : got" + md5.hex_md5('abc'));
}

var get_bucket = exports.get_bucket = function (name, buckets) {

    var hex_str, i, total = 0;

    hex_str = md5.hex_md5(name);
    for (i = 0; i < hex_str.length; i = i + 4) {
        total += parseInt(hex_str.toString().substr(i, 4), 16);
    }
    return (total % buckets);
};


var map_bucket = exports.link_for_bucket = function (appl_id, pool, bucket) {

    if (appl_id !== process.argv[2]) {
        appl_id = "." + appl_id;
    }

    if (appl_id === 'rm2' && process.argv[2] === 'rm2')  {
        appl_id = '.rm1';
    }

    ml.info(appl_id + " " +link.get_link_for_node(appl_id));
    return link.get_link_for_node(appl_id);

//    if (map[appl_id]) {
//       return map[appl_id][bucket];
//    }
//    ml.error('map bucket called with invalid appl_id' + appl_id);
//    return null;
};

var validate_map = function (map) {
    var i;

    for (i in map) {
        if (map.hasOwnProperty(i)) {
            // TODO 
            ml.debug("Not validating map yet");
        }
    }
    
};

exports.map_update_msg = function (link, msg) {

    var i, bucket, app;

    ml.info('Got map update :');
  
    app = msg.app;
    
    for (i in msg.map) {
        if (msg.map.hasOwnProperty(i)) {
            bucket = msg.map[i];
            new_map[app][i] = link.get_link_for_node(msg.map[i]);
        }
    }
    if (validate_map(new_map[app])) {
        map[app] = new_map[app];
    } else {
        ml.error('Bad map from ' + link.name + ' discarded!');
    }
};


var i;
map.rm1 = [];
map.rm2 = [];
for (i = 0; i < 101; i++) {
    if (i < 50) {
        map.rm1[i] = link.get_link_for_node('rm1');
    } else {
        map.rm2[i] = link.get_link_for_node('rm2');
    }
}


var i;
map.rm = [];
for (i = 0; i < 101; i++) {
    if (i < 50) {
        map.rm[i] = link.get_link_for_node('rm1');
    } else {
        map.rm[i] = link.get_link_for_node('rm2');
    }
}

var print_map = function () {

    var res, res_ary = [], i, last_node = map.rm[0];

    ml.emergency('GOT HERE');

    res = "0 ";
    
    for (i = 0; i < 101; i++) {
        ml.info('Bucket ' + i + ' link name: ' + map.rm[i].name);
        if (last_node !== map.rm[i]) {
            res = res + i + " === " + last_node.name;
            res_ary.push(res);
            res = i + " ";
            last_node = map.rm[i];
        }
    }
    res = res + i + " === " + last_node.name;
    res_ary.push(res);
    return res_ary.join("\n").toString();
};

exports.print_map = print_map;

cp.def_cp_cmd(print_map, 'pm', 'Prints the map');
