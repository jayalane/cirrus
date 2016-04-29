/*jslint plusplus: true */

var ml1 = require('./mylog');
var ml  = new ml1.Logger('TEST', __filename);
var cp  = require('./control-port');

var my_tests = [];

// cb runs and returns a string, compared with result

var Tests = exports.Tests = function (name, cb, result) { 

    var date = new Date();

    this.name   = name;
    this.cb     = cb;
    this.result = result;

    my_tests.push(this);

};

Tests.prototype.run = function () {
    var me = this, the_result;

    me.cb(function (real_result) {
        if (typeof me.result === 'function') {
            the_result = me.result(real_result);
        } else {
            the_result = (real_result === me.result);
        }
        if (the_result) {
            ml.warning("TEST OK: " + me.name);
        } else {
            ml.warning("TEST FAIL: " + me.name);
            ml.info("Got {" + real_result + "} wanted {" + me.result + "}!");
        }
    });
};


exports.run_all = function () {
    var i, test, result = [], succeeds = 0, fails = 0;
    for (i = 0; i < my_tests.length; i++) {
        test = my_tests[i];
        test.run();
    }
};

cp.def_cp_cmd(exports.run_all, "run_all_tests", "Runs all tests registered with test.js");