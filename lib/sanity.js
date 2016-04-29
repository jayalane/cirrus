var fs   = require('fs');

exports.check = function () {

    var already_running = true, rc, stats;

    // have to have argv[2] - its our node name

    if (process.argv[2] === undefined) {
        console.error("Run like node main.js $node_id");
        process.exit();
    }

    process.title = 'bucky-' + process.argv[2];

    process.on('exit', function () {
        fs.unlinkSync("/tmp/cirrus-locks/" + process.argv[2]);
    });


    // each node can only run once

    try {
        stats = fs.statSync("/tmp/cirrus-locks/" + process.argv[2]);
    } catch (err) {
        already_running = false;
    } 

    if (already_running) {
        console.error(process.argv[2] + ": already running!");
        process.exit();
    }

    // TODO mkdir cirrus locks it not there ?
    rc = fs.writeFileSync("/tmp/cirrus-locks/" + process.argv[2], process.pid.toString(), 'utf8');

    if (rc < 0) {
        console.error("Couldn't write file /tmp/cirrus-locks/" + process.argv[2] + ": " + rc);
        process.exit();
    }    


};