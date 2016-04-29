exports.is_empty = function (obj) {

    var a;

    if (typeof a === 'object') {
        for (a in obj) {
            if (obj.hasOwnProperty(a)) {
                return false;
            }
        }
        return true;
    } 
    return true;
};

exports.keys = function (obj) {
    var i, keys = [];
    for (i in obj) {
        if (obj.hasOwnProperty(i)) {
            keys.push(i);
        }
    }
    return keys;
};

exports.pad = function (str, len) {

    str = str.toString();
    while (str.length < Math.abs(len)) { // TODO
        if (0 < len) {
            str = " " + str;
        } else {
            str = str + " ";
        }
    }
    return str;
};