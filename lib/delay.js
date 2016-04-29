var ready = false;
var queue = [];

var Stats = require('./stats').Stats;
var delay_queue_stats = new Stats('delay_queue', 'counter');
var delay_no_queue_stats = new Stats('delay_no_queue', 'mono');
var delay_readiness_change_stats = new Stats('delay_readiness_change', 'mono');


exports.readiness = function (readiness) {
    var cb, work;
    
    if (readiness === ready) {
        return;
    }
    delay_readiness_change_stats.incr();
    if (ready) {
        ready = false;
        return;
    }
    // do work
    ready = true;
    for (work in queue) {  // todo maybe throttle this
        if (ready) {
            cb = queue[work];
            cb();
            delay_queue_stats.decr();
        }
    }
};

exports.do_if_ready = function (cb) 
{
    if (ready) {
        delay_no_queue_stats.incr();
        cb();
    } else {
        queue.push(cb);
        delay_queue_stats.incr();
    }
};

