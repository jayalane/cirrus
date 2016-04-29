var ml1 = require('./mylog');
var ml  = new ml1.Logger('STATS', __filename);
var mu  = require('./my_utils');

var my_stats = {};

var Stats = exports.Stats = function (name, type) {

    var date = new Date();
    this.type = type;
    this.name = name;
    my_stats[name] = this;
    if (type === 'counter') {
        this.max = 0;
        this.num = 0;
        this.incrs = 0;
        this.decrs = 0;
        this.tod_of_max = date.getTime() / 1000.0;
        this.tod_create = date.getTime() / 1000.0;
    } else if (type === 'mono') {
        this.num = 0;
        this.tod_create = date.getTime() / 1000.0;
    } else {
        ml.debug("Stat: unknown stats type: " + type + " with name " + name);
    }
};

Stats.prototype.incr = function () {
    if (this.type === 'mono') {
        this.num += 1;
    } else {
        this.num += 1;
        this.incrs += 1;
        if (this.num > this.max) {
            var date = new Date();
            this.max = this.num;
            this.tod_of_max = date.getTime() / 1000.0;
        }
    }
};

Stats.prototype.decr = function () {
    if (this.type === 'mono') {
        ml.debug('decrement called on a monotonically increasing stat:' + this.name);
    } else {
        this.num -= 1;
        this.decrs += 1;
        if (this.num < 0) {
            ml.debug('Too many decrements for ' + this.name);
            this.num = 0;
        }
    }
};

var pad = mu.pad;

exports.list = function (cp, long_fmt) {

    var s, result = []; 

    result.push("\n");

    if (!long_fmt) {
        result.push("                         Name        Val     Max     Inc     Dec\n");
    }

    for (s in my_stats) {
        if (long_fmt) {
            result.push("Stat: " + my_stats[s].name + "\n");
            if (my_stats[s].type === 'counter') {
                result.push("    Value  : " + my_stats[s].num + "\n");
                result.push("    Created: " + Date(my_stats[s].num.tod_create * 1000) + "\n");
                result.push("    Max    : " + my_stats[s].max + "\n");
                result.push("    When   : " + Date(my_stats[s].tod_of_max * 1000) + "\n");
                result.push("    Incr   : " + my_stats[s].incrs + "\n");
                result.push("    Decr   : " + my_stats[s].decrs + "\n");
                result.push("\n");
            } else if (my_stats[s].type === 'mono') {
                result.push("    Value  :" + my_stats[s].name);
            }
        } else {
            if (my_stats[s].type === 'counter') {
                result.push(pad(my_stats[s].name, 32));
                result.push(pad(my_stats[s].num, 8));
                result.push(pad(my_stats[s].max, 8));
                result.push(pad(my_stats[s].incrs, 8));
                result.push(pad(my_stats[s].decrs, 8));
                result.push("\n");
            } else if (my_stats[s].type === 'mono') {
                result.push(pad(my_stats[s].name, 32));
                result.push(pad(my_stats[s].num, 8));
                result.push("\n");
            }
        }
    }
    
    return result.join("");
};


