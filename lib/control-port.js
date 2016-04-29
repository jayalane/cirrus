// This establishes a control port for examing the process state.  
// modules can call def_cp_cmd to register functions for this task.  
// This module registers the logging commands, so that logging doesn't
// depend on control port.  Also the stats commands.  



// node stuff
var net = require('net');
var repl = require('repl');
var util = require('util');


// my stuff
var ml1         = require('./mylog');
var ml          = new ml1.Logger('CP', __filename);
var pad          = require('./my_utils').pad;
var stats       = require('./stats');
var connections = new stats.Stats('CP Connections', 'counter');

var saved_vars = [];

var cp_cmds = [];

var cp_num = 1;

exports.save_var = function (obj) {
    saved_vars.push(obj);
};

exports.def_cp_cmd = function (cb, name, help_text) {
    ml.info('Adding CP Command: ' + name + ' ' + help_text);
    cp_cmds.push({ cb: cb, name: name, help_text: help_text});
};

var new_cmd = exports.def_cp_cmd;

new_cmd(function (a) { 
    return stats.list(true, a);
}, 'stats', 'Print out stats gathered to data');

new_cmd(function (log_level) { 
            return ml1.set_log_level(log_level);
}, 'll', "ll('log level') sets the global log level");

new_cmd(function () { 
    return ml1.list_log_dests();
}, 'lld', 'lld lists the log destinations');

new_cmd(function (name, log_level) { 
    return ml1.set_dest_log_level(name, log_level);
}, 'lls', "lls('stdout', 'INFO') sets the per-destination log level");

new_cmd(function (log_level) { 
            return ml1.udp_logging();
}, 'lu', "lu() enables UDP logging (not unsettable)");


new_cmd(function (log_debug) { 
    return ml1.set_debug_mode(log_debug);
}, 'ld', "ld(true) turns on debug logging; ld(false) turns it off.");

new_cmd(function () { 
    return ml1.kl_db();
}, 'kl_db', "'kl_db()' returns the latest in memory log msgs");

exports.def_cp_cmd(function () {
    var i, res = [];
    for (i in cp_cmds) {
        if (cp_cmds.hasOwnProperty(i)) {
            res.push(pad(cp_cmds[i].name, -40));
            res.push(cp_cmds[i].help_text);
            res.push("\n");
        }
    }
    return res.join("");
}, 'help', "Lists many registered commands.");



var make_handler = function (a_repl, c) {

    return function (cp_cmd_i) {


        var cp_cmd, i = 0;
        
        ml.info('Adding CP Cmd : ' + cp_cmd_i.name);
        a_repl.context[cp_cmd_i.name] = function (rg1, rg2, rg3, rg4) {

            var res;
            
            res = cp_cmd_i.cb(rg1, rg2, rg3, rg4);
            c.write(res + '\n');
        };
    };
};        

exports.make_cp = function (port) {

    var the_cp = net.createServer(function (c) {
        var a_repl, i, dummy_f;
        
        ml.info("Got CP Connection from: " + c.remoteAddress);
        if (c.remoteAddress !== '127.0.0.1') {
            ml.error("Destroying illegal connection.");
            connections.decr();
            c.destroy();
        }
        c.setEncoding('utf8');
        c.on('close', function () { 
            connections.decr(); 
            ml1.remove_stream(c); 
            ml.debug("Closing CP");
        });
        c.on('error', function (err) { 
            connections.decr(); 
            ml1.remove_stream(c); 
            ml.error("Error in  CP" + err);
        });
        ml1.add_stream(c, "cp" + cp_num, ml1.log_levels.INFO);
        connections.incr();
        a_repl = repl.start(process.argv[2] + "> ", c);
        a_repl.context.sv = saved_vars;
        a_repl.context.nl = function () { 
            ml1.remove_stream(c);
            return "Closing logging to CP stream"; 
        };
        a_repl.context.yl = function () { 
            ml1.add_stream(c, 'cp' + cp_num, ml1.log_levels.DEBUG2);
            return "Opening logging to CP stream"; 
        };
        // TODO add help command
        for (i in cp_cmds) {
            if (cp_cmds.hasOwnProperty(i)) {
                dummy_f = make_handler(a_repl, c); 
                dummy_f(cp_cmds[i]);
            }
        }
    });
    
    the_cp.listen(port, '127.0.0.1');
};
