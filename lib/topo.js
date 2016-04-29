/*jslint evil: true */

// this file reads the config for manipulating "instance/hash-key" -> host/port information
// An application will have three instantiations, a primary and two backups.  
// The hashing may not be implemented in first draft.  



// my stuff
var Stats  = require('./stats').Stats;
var cp     = require('./control-port');
var ml1    = require('./mylog');
var ml     = new ml1.Logger('TOPO', __filename);
var config = require('./config');
var ep     = require('./endpoint');
var link   = require('./link');



var apps = [];

var App = function (name) {
    this.pools = {};
    this.primary = '';
    this.name = name;   // node layer knows node id of this node

    apps[name] = this;
    return this;
};

App.prototype.add_pool = function (name, hosts) {
    this.pools[name] = hosts;
    return this;
};

App.prototype.make_primary = function (name) {
    this.primary = name;
    return this;
};

App.prototype.set_hash_buckets = function (num_buckets) {
    this.num_buckets = num_buckets;
    return this;
};

App.prototype.am_i_primary = function () {
    return true;
};

var create_app = function (name) {
    return new App(name);
};

var my_instance = "";
exports.instance_name = my_instance;

var set_instance = function (name) {
    my_instance = name;
};

eval(config.load_config('apps.js'));  // HMM

var a;

for (a in apps) {
    if (apps.hasOwnProperty(a)) {
        ml.emergency(apps[a].name + " created");
    }
}

exports.get_primary = function (appl_id) {
    return 'a';  //TODO
};

exports.get_hash_buckets = function (appl_id) {
    if ((appl_id) && apps[appl_id]) {  // e.g. routing
        return apps[appl_id].num_buckets;
    }
    return 101;  // TODO
};

if (my_instance === "") {
    throw "Instance must be set in apps.js!";
}

ml1.set_log_prefix(my_instance + "/" + process.argv[2]);
ep.set_my_instance(my_instance);
