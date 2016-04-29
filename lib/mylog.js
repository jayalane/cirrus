/*jslint
    plusplus: true
*/

// Logging functionality.   

// node requires
var console = require('console');
var dgram = require('dgram');

// TODO  add in per stream level, format

var dgram_dest;

var streams = {};

var log_levels = { 
    EMERGENCY : 1,
    ERROR     : 2,
    WARNING   : 3,
    INFO      : 4,
    DEBUG     : 5,
    DEBUG2    : 6
};
exports.log_levels = log_levels;


var circ_buffer = [];

// thing to set log prefix

var log_prefix = process.argv[2];

exports.set_log_prefix = function (prefix) { 
    log_prefix = prefix;
};


var log_labels = [ '0', 'EMERGENCY', 'ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEBUG2' ];

var debug_mode = false;
var the_log_level = log_levels.INFO;

var num_logs = 1;

var logging = function (level, the_string) {

    var json_message, json_obj, dest, stream_obj, date, date_str;

    if (level <= the_log_level) {

        date = new Date();
        date_str = date.getDate() + "/" + date.getHours() + ":" + 
                   date.getMinutes() + ":" + date.getSeconds() + "." + 
                   date.getMilliseconds() + ": ";

        if (typeof the_string === 'function') {
            the_string = the_string();
        }
        
        the_string = date_str + log_labels[level] + ': ' + the_string;  
        // TODO add this to a separate write maybe ?
        
        if (debug_mode) {
            console.error(the_string);    
        }  // else stdout is log destination already

        circ_buffer[num_logs % 100] = the_string;
        num_logs ++;

        for (dest in streams) {
            if (streams.hasOwnProperty(dest)) {
                stream_obj = streams[dest];
                if (level <= stream_obj.log_level) {
                    try {
                        // don't care about success - no cb
                        stream_obj.stream.write(log_prefix + 
                                                ': ' + the_string + '\n');
                    } catch (err2) {
                        console.error("Exception writing to log destination: " + JSON.stringify(err2));
                    }
                }
            }
        }
        if (dgram_dest) {
            json_obj = {};
            json_obj.host = process.argv[2];
            json_obj.msg  = the_string;
            json_message = new Buffer(JSON.stringify(json_obj));
            // TODO this can't be the best way to generate an UDP buffer
            dgram_dest.send(json_message, 0, json_message.length, 5555, "localhost");
        }
    }
};

// now a thing to construct all the .info and .debug2 methods

var make_logger_logger = function (level) {

    var num_level = log_levels[level];

    return function (the_string) {
        if (num_level <= the_log_level) {
            if (typeof the_string === 'function') {
                the_string = the_string();
            }
            logging(num_level, this.module + ': ' + this.file_name + ': ' + the_string);
        }  // else do nothing
    };  
};

// to grab module and file name of source 
var Logger = function (module, file_name) {
    console.error("Creating logger with " + module + "/" + file_name);
    this.module = module;
    this.file_name = file_name.split("/");
    this.file_name = this.file_name[this.file_name.length - 1];
    return this;
};

exports.Logger = Logger;


// simpler .info and .error methods
var make_logger = function (level) {
    return function (the_string) {
        logging(level, the_string);
    };
};

var lvl;
// this bit creates ml.log and ml.debug2 etc.  - thanks lisp
for (lvl in log_levels) {
    if (log_levels.hasOwnProperty(lvl)) {
        exports[lvl.toLowerCase()] = make_logger(log_levels[lvl]);
        Logger.prototype[lvl.toLowerCase()] = make_logger_logger(lvl);
    }
}


// a control port command
var set_dest_log_level = function (the_stream, level) {

    var str, found = false; 

    if (log_levels[level] === undefined) {
        return "Level not found!";
    }
    for (str in streams) {
        if (streams[str].name === the_stream) {
            streams[str].log_level = log_levels[level];
            found = true;
            break;
        }
    }   
    return (found ? "OK" : "Stream not found.");
};

exports.set_dest_log_level = set_dest_log_level;

var list_log_dests = function () {
    var result = [], i;
    for (i in streams) {
        if (streams.hasOwnProperty(i)) {
            result.push(streams[i].name + "   " + log_labels[streams[i].log_level]);
        }
    }
    return result.join("\n");
};

exports.list_log_dests = list_log_dests;

var remove_stream = function (the_stream) {

    var str; 

    for (str in streams) {
        if (streams[str].stream === the_stream) {
            delete streams[str];
            break;
        }
    }   
};

exports.remove_stream = remove_stream;

exports.add_stream = function (the_stream, name, def_log_level) {
    var stream_obj = { 
        stream: the_stream,
        name: name
    };
    if (name === undefined) {
        return "Need a name for a stream";
    }
    if (def_log_level) {
        stream_obj.log_level = log_levels[def_log_level];
    } else {
        stream_obj.log_level = the_log_level;
    }
    the_stream.on('close', function () { 
        remove_stream(stream_obj);
    });
    streams[name] = stream_obj;
};

exports.add_stream(process.stdout, 'stdout', 'INFO');

exports.udp_logging = function () {
    dgram_dest = dgram.createSocket("udp4");
    return 'OK';
};

exports.set_log_level = function (level) {

    if (log_levels[level] === undefined) {
        return "Level not found!";
    }
    the_log_level = log_levels[level];
    return "OK";
};


exports.set_debug_mode = function (true_or_false) {
    debug_mode = true_or_false;
};

exports.kl_db = function () {
    return circ_buffer.join('\n');
};
