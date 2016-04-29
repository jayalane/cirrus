
// sync reads a config file and evals it.  

//node module
var fs = require('fs');

// my modules
var ml1 = require('./mylog');
var ml  = new ml1.Logger('CONFIG', __filename);

exports.load_config = function (file_name) {

    var a; 

    ml.emergency("About to load " + file_name + " config file!");
    a = fs.readFileSync('./config/' + file_name, 'utf8');  // BLOCKING
    ml.emergency("Finished reading " + file_name + " config file.");
    return a;

};