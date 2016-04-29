/*jslint bitwise: true, plusplus: true */

// node module
var fs = require('fs');


// my modules
var ml1   = require('./mylog');   // logging
var ml    = new ml1.Logger('STATE', __filename);
var mu    = require('./my_utils'); // utils
var Stats = require('./stats').Stats; // Stats
var delay = require('./delay');  // TODO - will be able to take hits during start up
var web   = require('./web'); // HTTPS interface - need to register
var cp    = require('./control-port'); // we define some control port commands

// config
var state_file_name = './run/state.txt.' + process.argv[2];
var tlog_file_name = '/tmp/tlog.txt.' + process.argv[2];
var secret_states = { 'passwords': { 'chris' : '1,2,3', 'jon' : '3,4,5' } };
var states = {};
var ready = false;

// the main loop needs to know if we are ok to handle work yet.  
exports.ok = function () {
    return ready;
};

var tlog = [];  // transaction log - short file written to sync 
                // and then every so often written async to big state file.  

var read_stats     = new Stats('state_file_reads', 'mono');
var read_errs      =  new Stats('state_file_read_errors', 'mono');
var read_json_errs = new Stats('state_file_json_errors', 'mono');

var read_tlog_stats      = new Stats('tlog_file_reads', 'mono');
var read_tlog_errs       = new Stats('tlog_file_read_errors', 'mono');
var read_tlog_parse_errs = new Stats('tlog_file_parse_errors', 'mono');

var write_stats = new Stats('state_file_writes', 'mono');
var write_errs  = new Stats('state_file_write_errors', 'mono');

var delete_stats      = new Stats('state_deletes', 'mono');
var delete_not_founds = new Stats('state_delete_not_found', 'mono');

var get_data_stats          = new Stats('state_gets', 'mono');
var set_data_stats          = new Stats('state_sets', 'mono');
var set_if_less_stats       = new Stats('state_set_if_lesses', 'mono');
var set_if_less_unset_stats = new Stats('state_set_if_lesses_unset', 'mono');
var set_incr_stats          = new Stats('state_set_incrs', 'mono');


// init functions are at end to make jslint happy.  

var start_put_state; // defined later below

// a little gui to explore the saved data

var dump_handler = function (action, pathname, cb) {

    var html_headers = { 'Content-Type' : 'application/xhtml+xml; charset=utf-8'}, 
        the_head = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" " + 
                       "\"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\">" + 
                       "<html xmlns='http://www.w3.org/1999/xhtml' xml:lang='en'>" + 
                       "<head><meta http-equiv='Content-Type' content='application/xhtml+xml;" + 
                       " charset=utf-8'/><meta name='generator' content='emacs,lisp'/><link href" + 
                       "='/c/lisp.css' rel='stylesheet' type='text/css'/></head><body>" + 
                       "<div id='quiz-all'>",
        output = the_head,
        p_ary = pathname.substring(1).split("/"),
        value = states,
        url,
        url_base = "/dump/",
        j, p; 

    if (pathname.slice(-1) === "/") {
        pathname = pathname.slice(0, -1);
    }
    ml.debug("Length of p_ary is " + p_ary.length);
    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p !== 0) { // the first element has the action, not the data
                if (typeof value === 'object') {
                    if (p_ary[p] !== undefined && (value.hasOwnProperty(p_ary[p]))) {
                        value = value[p_ary[p]];
                        url_base = url_base + p_ary[p] + "/";
                    } else {
                        value = "Undefined";
                        break;
                    }
                } else {
                    break;
                }
            } 
        }
    }
    ml.debug("value = " + JSON.stringify(value));

    if (typeof value === 'object') {
    
        for (j in value) {
            if (value.hasOwnProperty(j)) {
                url = url_base + j;
                if (typeof value[j] === 'object') {
                    output = output + "<p><a href='" + url + "'> Key: " + j + "</a></p>";
                } else {
                    output = output + "<p><a href='" + url + 
                                    "'> Key: " + j + "</a>&nbsp;(" + value[j] + ")</p>";
                }
            }
        }
    } else {
        output = output + "<p> Value is: " + value + "</p>";
    }
    output = output + "</div><p><a href='http://validator.w3.org/check?uri=referer'>" + 
                               "<img src='http://www.w3.org/Icons/valid-xhtml10' alt='Valid " + 
                               "XHTML 1.0 Strict' height='31' width='88' /></a></p></body></html>";
    cb(output, html_headers);
};

// takes a string like set/key1/key2
// and deletes states['key1']['key2'] 
var delete_data_handler = function (action, pathname, cb) {

    var p_ary = pathname.substring(1).split("/"), 
        value, last_value,
        last = 1,
        p, 
        secret = false;
    if (action.slice(0, 7) === 'secret_') { // secret
        last_value = value = secret_states;
        secret = true;
    } else {
        last_value = value = states;  // persisted
    }

    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p === 0) {
                continue;
            }
            if (! secret) {
                ml.debug("Value is" + JSON.stringify(value));
            }
            ml.debug('P: ' + p + '  - p_ary.length: ' + p_ary.length + ' p_ary[p]: ' + p_ary[p]);
            if (p === p_ary.length - 1) {
                if (! secret) {
                    ml.debug("Deleting " + p_ary[last]);
                }
                delete value[p_ary[p]];
                delete_stats.incr();
                break;
            } else {
                last_value = value;
                last = p;
                if (value[p_ary[p]] === undefined) {
                    delete_not_founds.incr();
                    cb('OK - not found');
                    return;
                }
                value = value[p_ary[p]];
            }
        }
    }
    start_put_state(pathname,  function () { 
        ml.debug("Saved state - sending reply 'OK'"); // only later
        cb("OK");
    });
};


var get_data_sync = function (p_ary, secret) {
    var value, p;

    if (secret) {
        value = secret_states;
    } else {
        value = states; // persisted
    }
    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p === 0) { // the first element has the action, not the data
                continue;
            }
            if ((p_ary[p]) && 
                (typeof value === 'object') &&
                (value.hasOwnProperty(p_ary[p]))) {
                value = value[p_ary[p]];
            } else {
                value = "Undefined";
                break;
            }
        }
    }
    if (! secret) {
        ml.debug("Returning " + JSON.stringify(value));
    }
    get_data_stats.incr();
    return value;
};

exports.get_data = function (p_ary, secret, cb) {
    var value = get_data_sync(p_ary, secret);
    cb(value);
};

// takes a string like get/key1/key2
// and calls CB with states['key1']['key2']
var get_data_handler = function (action, pathname, cb) {
    
    var value, p,
        secret = false,
        p_ary = pathname.substring(1).split("/");

    if (pathname.slice(-1) === "/") {
        pathname = pathname.slice(0, -1);
    }
    ml.debug("Getting: {" + pathname + "}");

    if (action.slice(0, 7) === 'secret_') { // secret
        secret = true;
    }

    value = get_data_sync(p_ary, secret);

    cb(JSON.stringify(value));
};

var set_data_sync = function (p_ary, secret) {
    var value, p, last, last_value, temp_value_to_obj;

    if (secret) {
        last_value = value = secret_states;
    } else {
        last_value = value = states; // persisted
    }
    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p === 0) {
                continue;
            }
            if (p === p_ary.length - 1) {

                if (! secret) {
                    ml.debug("Setting " + p_ary[last] + " to " + p_ary[p]);
                } else {
                    ml.debug("Setting " + p_ary[last]);
                }
                set_data_stats.incr();
                last_value[p_ary[last]] = p_ary[p];
                break;
            } else {
                last_value = value;
                last = p; 
                if (value[p_ary[p]] === undefined) {
                    value[p_ary[p]] = {};
                } 
                if (typeof value[p_ary[p]] !== 'object') {
                    temp_value_to_obj = value[p_ary[p]];
                    value[p_ary[p]] = {};
                    value[p_ary[p]].old_value = temp_value_to_obj; // hack
                }
                value = value[p_ary[p]];
            }
        }
    }
    
};

var set_data = function (p_ary, secret, cb) {
    set_data_sync(p_ary, secret);
    start_put_state('', function () {  // do not need pathname
        ml.debug("Saved state -- running CB"); // only later
        cb("OK");
    });
    
};

exports.set_data = set_data;

// takes a string like set/key1/key2/value
// and sets states['key1']['key2'] = value
var set_data_handler = function (action, pathname, cb) {

    var p_ary = pathname.substring(1).split("/"), 
        last = 1, 
        p,
        secret = false;

    if (action.slice(0, 7) === 'secret_') { // secret
        secret = true;
    }
    set_data_sync(p_ary, secret);

    start_put_state(pathname, function () { 
        ml.debug("Saved state -- running CB"); // only later
        cb("OK");
    });
};

cp.def_cp_cmd(function (pathname) {

    var action = pathname.split("/")[1];

    set_data_handler(action, pathname, function () {
        ml.debug("set data done");
    });
    return "Request Pending";
}, 
              "run_url", 
              "run_url('/set/data/to/set') to simulate HTTPS call");
    
                     
// takes a string like set/key1/key2/value
// and sets states['key1']['key2'] = value, 
// but only if value is less than old value or new
var set_if_less_handler = function (action, pathname, cb) {

    var p_ary = pathname.substring(1).split("/"), 
        value, last_value,
        last = 1,
        p,
        secret = false,
        dirty = false;

    if (action.slice(0, 7) === 'secret_') { // secret
        last_value = value = secret_states;
        secret = true;
    } else {
        last_value = value = states;   // persisted
    }

    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p === 0) {
                continue;
            }
            if (p === p_ary.length - 1) {
                if ((last_value[p_ary[last]] === undefined) ||
                    (mu.is_empty(last_value[p_ary[last]])) ||
                    (parseInt(p_ary[p], 10) < parseInt(last_value[p_ary[last]], 10))) {
                    if (! secret) {
                        ml.debug("Setting " + p_ary[last] + " to " + p_ary[p]);
                    } else {
                        ml.debug("Setting " + p_ary[last]);
                    }
                    last_value[p_ary[last]] = p_ary[p];
                    dirty = true;
                }
                break;
            } else {
                last_value = value;
                last = p;
                if (value[p_ary[p]] === undefined) {
                    value[p_ary[p]] = {};
                    dirty = true;
                }
                value = value[p_ary[p]];
            }
        }
    }
    if (dirty) {
        set_if_less_stats.incr();
        start_put_state(pathname, function () { 
            ml.debug("Saved state succeed -- now running CB"); // only later
            cb("OK");
        });
    } else {
        cb("OK-nochange");
    }
};

// takes a string like set/key1/key2/value
// and sets states['key1']['key2'] = value, 
// but only if value is less than old value or new
var set_incr_handler = function (action, pathname, cb) {

    var p_ary = pathname.substring(1).split("/"), 
        value, new_value = 0,
        last = 1,
        p,
        secret = false,
        dirty = false;

    if (action.slice(0, 7) === 'secret_') { // secret
        value = secret_states;
        secret = true;
    } else {
        value = states;   // persisted
    }
    for (p in p_ary) {
        if (p_ary.hasOwnProperty(p)) {
            p = (p|0);
            if (p === 0) {
                continue;
            }
            if (p === p_ary.length - 1) {
                if ((value[p_ary[p]] === undefined) ||
                    (mu.is_empty(value[p_ary[p]]))) {

                    ml.debug("Incrementing " + p_ary[p]);
                    value[p_ary[p]] = (value[p_ary[p]] | 0);
                    value[p_ary[p]] += 1;
                    new_value = value[p_ary[p]];
                    dirty = true;

                } else {

                    ml.debug('Trying to increment empty property.');

                }
                break;
            } else {
                if (value[p_ary[p]] === undefined) {
                    value[p_ary[p]] = {};
                    dirty = true;
                }
                value = value[p_ary[p]];
            }
        }
    }
    if (dirty) {
        set_incr_stats.incr();
        start_put_state(pathname, function () { 
            ml.debug("Saved state succeed -- now running CB"); // only later
            cb(new_value.toString());
        });
    } else {
        cb("OK-nochange");
    }
};

// end of web handlers etc.  

// start of init (state reading) methods

var start_tlog_state = function (cb) {

    fs.readFile(tlog_file_name, 'utf8', function (err, data) {  // get the saved state

        var lines, p_ary, i, bak_file_comment;

        if (err) {
            read_tlog_errs.incr();
            ml.debug(JSON.stringify(err));
            // rename bad tlog and move on
            bak_file_comment = ".FAILED";
        } else {
            lines = data.split("\n");
            read_tlog_stats.incr();
            try { 
                ml.debug("About to read tlog");
                for (i = 0; i < lines.length; i++) {
                    ml.debug("Replaying: {" + lines[i] + "}");
                    p_ary = lines[i].substring(1).split("/");
                    set_data_sync(p_ary, false);
                }
            } catch (err2) {
                read_tlog_parse_errs.incr();
                ml.debug(JSON.stringify(err2));
            }
            bak_file_comment = ".ok";
        }
        fs.rename(tlog_file_name, tlog_file_name + bak_file_comment + '.startup.bak', 
                  function (err) {
                      if (cb) {
                          cb();  // lexical context will have whatever is needed
                      }
                  });
    });
};

// keep reading the state file at start up until it is ok 
var start_get_state = function (cb) { 
    fs.readFile(state_file_name, 'utf8', function (err, data) {  // get the saved state
        if (err) {
            read_errs.incr();
            ml.debug(JSON.stringify(err));
            setTimeout(start_get_state, 60000);
            return;
        }
        read_stats.incr();
        try {
            states = JSON.parse(data);
        } catch (err2) {
            read_json_errs.incr();
            ml.debug(JSON.stringify(err2));
            setTimeout(start_get_state, 60000);
            return;
        }
        start_tlog_state(function () {
            ml.debug("Got my state");
            ready = true;
            delay.readiness(ready);
            if (cb) {
                cb();  // lexical context will have whatever is needed
            }
        });
    });
};

// todo - maybe
var watch_state_file = function () {
    fs.watchFile(state_file_name, { 
        persistent: true, 
        delay: 60000 
    }, function () {
        start_get_state();
    });
};

// write the state back out to disk 
var timer_id = false;

var real_put_state = function (cb) {

    if (!ready) {
        setTimeout(function () { 
            real_put_state(cb);
        }, 
                   2000);
        ml.debug("Can't put state - not ready - try again in 2");
        return; // don't mess with state now
    }
    fs.rename(tlog_file_name, tlog_file_name + '.okrunning.bak', function (err) {

        if (err) {
            write_errs.incr();
            ml.debug("Can't rename tlog file - oh well.");
        }

        ml.debug('rename of tlog complete');

        if (timer_id) {
            clearTimeout(timer_id);
            timer_id = false;
        }
        fs.rename(state_file_name, state_file_name + '.bak', function (err) {
            
            // this occurs when the rename is complete
            
            if (err) {
                write_errs.incr();
                ml.debug("Can't rename state file - oh well.");
            }
            ml.debug('rename of state complete');
            
            fs.writeFile(state_file_name, JSON.stringify(states), 'utf8', 
                         function (err, data) {  // get the saved state
                
                if (err) {
                    write_errs.incr();
                    ml.debug("Can't save state file - trying again in 60 seconds");
                    ml.debug(JSON.stringify(err));
                    setTimeout(function () { 
                        real_put_state(cb); 
                    }, 
                               60000);
                    return;
                }
                write_stats.incr();
                ml.debug("Saved my state");

                if (cb) {
                    ml.debug("Running cb");
                    cb();  // lexical context will have whatever is needed
                }
            });
            tlog = [];  // after write starts 
        });
    });
};

start_put_state = function (pathname, cb) { 

    var fd;

    if (pathname === '') {
        ml.info('Skipping tlog for emtpy pathname');
        real_put_state(cb);
    } else {

        tlog.push(pathname);

        if (tlog.length > 10) {
            real_put_state(cb);
        } else {  // could put logic here to only write out tlog so often but dangerous
            ml.debug("Starting sync write of tlog!");
            fd = fs.openSync(tlog_file_name, "a");    // BLOCKING
            fs.writeSync(fd, tlog.join("\n") + "\n", 0, 'utf8'); // BLOCKING
            fs.closeSync(fd);                         // BLOCKING
            ml.debug("Whew, ended sync write of tlog.");
            cb();

            tlog = [];  // start over - plus state always has it.  
            
            timer_id = setTimeout(function () {
                ml.debug("Now saving consolidated state.");
                timer_id = false;
                real_put_state();
            }, 30000); // msecs not secs
        }
    }
};


// reload from disk if edited

var reload_state_handler = function (action, pathname, cb) {
    start_get_state('', function () {
        cb("OK");
    });
};

// end of startup functions

// register with web.js for the above handlers

var web_handlers = {
    'get' :         get_data_handler,
    'secret_get' :  get_data_handler,
    'set' :         set_data_handler,
    'secret_set' :  set_data_handler,
    'set_if_less' : set_if_less_handler,
    'set_incr' :    set_incr_handler,
    'reload' :      reload_state_handler,
    'delete' :      delete_data_handler,
    'dump'   :      dump_handler
};

exports.init = function () {
    var i;
    start_get_state();  // put watch here eventually
    for (i in web_handlers) {
        if (web_handlers.hasOwnProperty(i)) {
            web.register_simple(i, web_handlers[i]);
        }
    }
};

