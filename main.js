
// node depends

var os = require('os');
var fs = require('fs');

// my modules

var ml1     = require('./lib/mylog');

// now set up logging

ml1.set_log_level('INFO');
if (process.argv[3] === 'debug') {
    ml1.set_debug_mode(true);
    ml1.set_log_level('DEBUG2');
}

var ml     = new ml1.Logger('MAIN', __filename);

var topo   = require('./lib/topo.js');
var cp     = require('./lib/control-port');
var ep     = require('./lib/endpoint');
var sanity = require('./lib/sanity');

var cirrus = require('./lib/cirrus');  
var noc    = require('./lib/noc.js'); // not right


var web = require('./lib/web');

var state = require('./lib/state');
var stats = require('./lib/stats');

///var test_cirrus = require('./test_app.js');

//var mq = require('./config/my_quiz'); // config/app specific - not module

var hosts_for_debugging = {'hyperlvs80' : 1};

if (hosts_for_debugging[os.hostname()] !== 1) {
    // don't hose job for exception in production
    process.on('uncaughtException', function (err) {
        ml.emergency("Caught exception: " + err);
    });
}

var ticks = new stats.Stats('Main Ticks', 'mono');

var countTicks = function () {
    process.nextTick(countTicks);
    ticks.incr();
};

// process.nextTick(countTicks); // take out until this doesn't cause high spinning

var https_port = ep.get_my_node().https_port;
ml.emergency('https_port is ' + https_port)
var cp_port    = https_port + 1;
if ("rm1" === process.argv[2])
{
	wtc = require('./WebToCirrus');
	wtc.set_my_identity(process.argv[2]);
}

// require('./serv_entity');
// require('./lib_entity');
// require('./file_entity');
// require('./entity_ann');


sanity.check();        // keeps multiple processes from running
cp.make_cp(cp_port);  // control port for debugging/stats
state.init();        // read disk for persistant data
ml1.udp_logging();
web.make_webs(https_port);
