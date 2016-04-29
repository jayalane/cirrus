var dgram = require("dgram");
var fs = require('fs');
var server = dgram.createSocket("udp4");

var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var sanity = require('./lib/sanity');

var log_file_path = '';
var current_file_path = '';
var log_file = null;

var Messages = new stats.Stats('Messages', 'mono');
var LoggingFailed = new stats.Stats('Logging Failed', 'mono');
var LoggingFileOpenFailed = new stats.Stats('Logging file Open Failed', 'mono');

var create_log_file = function () {
    try {
        var timestamp = new Date().getTime();
        current_file_path = log_file_path + "/log_" + timestamp + "_file.txt";
        log_file = fs.createWriteStream(current_file_path, { flags: 'w', encoding: null,  mode: '0666' });
    }
    catch (err) {
        LoggingFileOpenFailed.incr();
    }
};

var close_file = function () {
    if (log_file !== null) {
        //log_file.close()
        log_file = null;
    }
};

server.on("message", function (msg, rinfo) {
    var obj = JSON.parse(msg),
        stats = fs.statSync(current_file_path),
        timestamp = new Date().getTime(),
        log_data = "" + timestamp + " " + obj.host + " " + obj.msg + "\n";

    Messages.incr();

    if (stats.size > 1024 * 1024 * 1024) {
        close_file();
        create_log_file();
    }

    try {
        if (log_file === null) {
            create_log_file();
        }
        log_file.write(log_data);
    }
    catch (err) {
        LoggingFailed.incr();
    }
});

server.on("listening", function () {
    var address = server.address();
    console.log("Logger server listening at " + address.address + ":" + address.port);
});



function set_log_file_path(name) {
    if (name) {
        log_file_path = name; 
    } else {
        log_file_path = "/example/data/cirrus/LoggerServer";
    }
}

set_log_file_path();

exports.set_log_file_path = set_log_file_path;



create_log_file();


server.bind(5555);

cp.make_cp(5050);

cp.def_cp_cmd(function (logfilepath) {
        try {
            var stats = fs.statSync(logfilepath);
            if (stats.isDirectory()) {
                set_log_file_path(logfilepath);
                close_file();
                create_log_file();
                return "OK";
            }
            else {
                return "It is not a valid directory.";
            }
        }
        catch (err) {
            return "It is not a valid directory.";
        }
    }, 
    "log_set_path", 
    "log_set_path('/set/data/to/set') to set log path.");

sanity.check();

