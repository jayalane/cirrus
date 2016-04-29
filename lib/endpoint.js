
// this file creates a node endpoint layer.  It keeps track of up/down/cycled.  
// It reads argv to get the node name for this process.


// node modules
// uses process global
var dns = require('dns');

// my stuff
var Stats = require('./stats').Stats;
var cp    = require('./control-port');
var ml1   = require('./mylog');
var ml    = new ml1.Logger('ENDPOINT', __filename);
var topo  = require('./topo');

var my_instance = "";
exports.set_my_instance = function (instance) {
    ml.emergency("My instance of cirrus is called: " + instance);
    my_instance = instance;
};

var my_node;

var nodes = [];

var states = { 
    'DOWN'   : 1,
    'NO_DNS' : 2,
    'UP'     : 3
};

var get_ip = function (host_name, node) {
    ml.info("DNS lookup for endpoint " + node.name + " host " + node.host);
    dns.resolve4(host_name, function (err, addresses) {
        if (err) {
            ml.error("DNS error for " + host_name + ': ' + err);
            setTimeout(function () {
                get_ip(host_name, node);
            }, 60000);
            return;
        }
        ml.info("Endpoint " + node.name + " host " + node.host + 
                " resolved to {" + addresses[0] + "}");
        node.ip = addresses[0];
    });
};
               
var Node;

var Node = exports.Node = function (index, name, host, https_port) {
    ml.info("Creating node: " + name);
    this.name       = name;
    this.index      = index;
    this.host       = host;
    this.https_port = https_port;
    this.state      = states.NO_DNS;

    nodes[name] = this;

    if (name === process.argv[2]) {
        my_node = this;
        ml.emergency("Running as " + this.name);
    }
    ml.debug("Made node: " + name + " " + host);
//  get_ip(host, this);
    return this;
};


Node.prototype.get_index = function () {
    return this.index;
};

Node.prototype.get_ip = function () {
    return this.ip;
};
Node.prototype.get_name = function () {
    return my_instance + "." + this.name;
};

Node.prototype.get_host = function () {
    return this.host;
};

Node.prototype.mark_down = function (index) {
    var date = new Date();
    this.state = states.DOWN;
    this.state_change = date.getTime() / 1000.0;
    return this;
};

Node.prototype.mark_up = function (index) {
    var date = new Date();
    this.state = states.UP;
    this.state_change = date.getTime() / 1000.0;
    return this;
};

exports.node_add = function (index, name, host, https_port) {
    return new Node(index, name, host, https_port);
};

exports.get_node_by_name = function (name) {
    return nodes[name];
};

exports.get_my_node = function () {
    return my_node;
};

cp.def_cp_cmd(function () { 
    return "TODO";
}, 'node_stats', 'Lists the known network endpoints.');
