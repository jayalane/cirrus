// handles the state and moves stuff around.

var ml1    = require('./mylog');
var ml     = new ml1.Logger('CIRRUS_MIGR', __filename);

var cirrus = require('./cirrus');

exports.cb_ent_info_msg = function (link, msg) {
    // wants:  
    // entity_name
    // entity data
    // bucket #
    // calculcates:  
    //     bucket
    //     state

    var ent; 

    ent = cirrus.get_or_create_entity(msg.entity_name, 
                               msg.bucket_num);
    if (! ent) {
        ml.error('Failed to get entitiy for ' + msg.entity_name + ' from ' + link.name);
        return -1;
    }
};