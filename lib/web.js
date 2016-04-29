/*jslint plusplus: true */

// node packages
var http  = require('http');
var https = require('https');
var fs    = require('fs');
var util  = require('util');
var url   = require('url');

// my packages

var tests  = require('./tests');
var cp     = require('./control-port');
var ml1    = require('./mylog');
var ml     = new ml1.Logger('WEB', __filename);
var mu     = require("./my_utils");
var stats  = require('./stats');

// some stats
var connections = new stats.Stats('HTTP connections', 'counter'); // the stat for this file
var path_too_short_stats = new stats.Stats('HTTP path too short', 'mono');
var action_not_found_stats = new stats.Stats('HTTP action not found', 'mono');
var forbidden_ip_stats = new stats.Stats('HTTP request from forbidden IP', 'mono');

var IPs = { '127.0.0.1': 1,
            '10.1.10.1' : 1 };  // access list

cp.def_cp_cmd(function (ip) {
    if (IPs[ip] === 1) {
        return 'already there';
    }
    IPs[ip] = 1;
    return 'ok';
}, "ip_add", "Adds the dotted-quad IP to the access list.");

cp.def_cp_cmd(function (ip) {
    if (IPs[ip] === 1) {
        delete IPs[ip];
        return 'ok';
    }
    return 'not found';
}, "ip_del", "Deletes the dotted-quad IP from the access list.");

cp.def_cp_cmd(function () {
    return mu.keys(IPs).join("\n");
}, "ip_list", "Lists the dotted-quad IP in the access list.");


// first the callbacks to handle sets/puts of the data

var get_content_type_header = function (pathname) {
    if (pathname.match('.html$')) {
	return { 'Content-Type': "text/html"};
    }
    if (pathname.match('.js$')) {
	return { 'Content-Type': "text/javascript"};
    }
    if (pathname.match('.css$')) {
	return { 'Content-Type': "text/css"};
    }
    return { 'Content-Type': 'text/plain' };
};


var static_handler = function (pathname, request, response) {
    
    pathname = pathname.replace("..", "").replace("%", "").replace("x", "").replace(" ", "");

    fs.readFile("./htdoc/" + pathname, "binary", function (err, file) {  

        if (err) {  
            response.writeHead(500, {"Content-Type": "text/plain"});
            response.write(err + "\n");
            response.end();
            connections.decr(); 
            return;  
        }  
  
        response.writeHead(200, get_content_type_header(pathname));  
        response.write(file, "binary");  
        response.end();  
        connections.decr();
        ml.debug("Sent " + pathname + " from static handler");
    });  
};


// handler registration

var simple_dispatcher = {};

var simple_stats = {};  // filled in as used

exports.register_simple = function (path, cb) {
    if (simple_dispatcher[path] === undefined) {
        ml.info('Registering simple CB for ' + path);
        simple_dispatcher[path] = cb;
    } else {
        ml.error('Dup handler CB for ' + path);
        process.exit();
    }
};

// keep track of usage

var incr_stats = function (action, the_stats) {
    if (the_stats[action] === undefined) {
        the_stats[action] = new stats.Stats(action, 'mono');
    }
    the_stats[action].incr();
};

var incr_simple_stats = function (action) {
    incr_stats(action, simple_stats);
};


// handler for more complex cases
var fancy_dispatcher = { 
    'i' : static_handler,
    'favicon.ico' : static_handler,
    'c' : static_handler 
};

var fancy_stats = {};

var incr_fancy_stats = function (action) {
    incr_stats(action, fancy_stats);
};

var options = {
    key: fs.readFileSync('./run/server.pem'),
    cert: fs.readFileSync('./run/cert.pem')
};

// options = { }

exports.make_webs = function (port) {

    var read, test_maker, tests_1, tests_2, run_tests;

    https.createServer(options, function (req, res) {
    
        var action,   // used for dispatch
            uri, 
            finish_request = function (out_string, headers) {

                if (headers === null) {
                    headers = {'Content-Type': 'application/json'};
                }
                ml.debug("Finishing response - web");
                res.writeHead(200, headers);
                res.write(out_string);
                res.end();
                connections.decr();
            };  // first, the end of the work
        
        connections.incr();
        
        ml.debug("Got HTTPS Connection from " + req.connection.socket.remoteAddress);
        
        // TODO if not ready, do later when ready - add to pending request array
        
        // if ((require('os').hostname() !== 'hyper88') && 
        //      !(req.connection.socket.remoteAddress in IPs)) {

            // finish_request("Invalid call"); // same error msg either case
            
        // } else {
            uri = url.parse(req.url, true);  //get path
            
            if (uri.pathname.split("/").length < 2) {         
                finish_request("error: path too short"); // illegal
                path_too_short_stats.incr();
            } else {                                                    
                action = uri.pathname.split("/")[1];
                if (simple_dispatcher.hasOwnProperty(action)) {  //dispatch on path
                    ml.debug(action + " process requested");
                    simple_dispatcher[action](action, uri.pathname, 
                                              finish_request, uri.query); 
                                               // pass in CB for async action
                    incr_simple_stats(action);
                } else if (fancy_dispatcher.hasOwnProperty(action)) {
                                    // dispatch on path but better CB
                    ml.debug(action + " fancy process requested");
                    fancy_dispatcher[action](uri.pathname, req, res);
                    incr_fancy_stats(action);
                } else {
                    finish_request("error: action not found"); // not found
                    action_not_found_stats.incr();
                }
            }
        // }
    }).listen(port, function () {
        ml.info('HTTPS Server running at ' + port);
    });
    // util function to read from localhost
    read = function (application, callback) {
        
        https.get({host: "127.0.0.1",
                   path : "/" + application,
                   port: port }, function (res) {

                        var responseBody = '';
                       
                        res.addListener("error", function (res) {
                            ml.debug("error giving up on " + application);
                        });
                        res.addListener("closed", function (res) {
                            ml.debug("error giving up on " + application);
                        });
                        res.addListener("data", function (chunk) {
                            responseBody += chunk;
                        });
                        res.addListener("end", function () {
                            callback(responseBody);
                        });
                    });
        
    };

    // has to be async so listen has succeeded

    test_maker = function (string) {
        return function (cb) { 
            read(string, cb);
        };
    };
    
    tests_1 = [new tests.Tests('get names', test_maker("get/names"), 
                               '{"old_value":"jon","jon":"okdokey"}'),
               new tests.Tests('get names chris', test_maker("get/names/chris"), '"Undefined"'),
               new tests.Tests('get names jon', test_maker("get/names/jon"), '"okdokey"'),
               new tests.Tests('get staters', test_maker("get/staters"), '"Undefined"'),
               new tests.Tests('set statersasdf abc', test_maker("set/statersasdf/abc"), 'OK'),
               new tests.Tests('dump', test_maker("dump"), function (answer) { 
                    return answer.length > 400; 
                }),
               new tests.Tests('set', test_maker("set"), 'OK'),
               new tests.Tests('set names jon okdokey', test_maker("set/names/jon/okdokey"), 'OK')];
    
    // once the above sets, do get to see
    
    tests_2 = [new tests.Tests('get statersasdf', test_maker("get/statersasdf"), '"abc"'),
               new tests.Tests('get names jon', test_maker("get/names/jon"), '"okdokey"'),
               new tests.Tests('/cirrus/rm/1/1/s:paymentserv/eyJoaSI6MX0=', 
                               test_maker("cirrus/rm/1/1/s:paymentserv/eyJoaSI6MX0="), 'OK'),
               new tests.Tests('get names jon /', test_maker("get/names/jon/"), '"Undefined"')];

    run_tests = function (tests_ary) {
        var i;
        
        for (i = 0; i < tests_ary.length; i++) {
            tests_ary[i].run();
        }
    };

/*    setTimeout(function () { 
        run_tests(tests_1);
    }, 5000);
    
    setTimeout(function () { 
        run_tests(tests_2);
    }, 10000);
*/
  
};


// Now for some start-up unit tests - 

var crypto = require('crypto');

var securityCert = "-----BEGIN CERTIFICATE-----\n" +
"-----END CERTIFICATE-----";

var credentials = crypto.createCredentials({});


