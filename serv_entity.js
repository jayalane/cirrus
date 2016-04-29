/*global PDFinder: false*/
/*global Buffer: false*/
/*jslint regexp: false*/

var cirrus = require('./lib/cirrus');
var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var fs = require('fs');

var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var sanity = require('./lib/sanity');
var ml1 = require('./lib/mylog');
var ml = new ml1.Logger('CIRRUS', __filename);

var Messages_received = new stats.Stats('LibEntity Messages received', 'mono');
var Messages_failed = new stats.Stats('LibEntity Messages failed', 'mono');

var re_lib = new RegExp(/^library\s+(.*)$/);
var re_file = new RegExp(/^object\s+(.*)$/);
var re_path = new RegExp(/^(.*)\//);

require('./msgtypes');

var ServEntities = {};// new Object();

var ServEntity = function () {
	this.path = '';
	this.time_touched = 0; 
	this.user_and_weight = null;

	this.time_info_collected = null;
};

var get_serv_info = function (msg, entity, source, ent_msg) {
	var serv_file = msg.file_path, serv_file_name_split, serv_file_name, out_msg, serv_info_tmp;

	Messages_received.incr();

	ml.info("processing " + serv_file);

	//lib_file = lib_file.replace(".a", ".lib_def");
	serv_file_name_split = serv_file.split('git_home/');
	serv_file_name = serv_file_name_split[serv_file_name_split.length - 1];
	serv_file_name = serv_file_name.replace(/\//g, "_");
	serv_file_name = serv_file_name.replace(".exe_def", ".exe");

	serv_info_tmp = ServEntities['s:' + serv_file_name];

	if (serv_info_tmp !== undefined)
	{
		ml.debug("found in cache : " + serv_file_name);

		out_msg = {};
		out_msg.serv_info = serv_info_tmp;

		/*if (serv_info_tmp.time_touched === 0)
		{
			check_and_reply(ent_msg, serv_file_name);
			return;
		}*/

		if ((new Date().getTime() - serv_info_tmp.time_info_collected) < 3600 * 1000)
		{
			cirrus.send_entity_reply(ent_msg, out_msg);
			return;
		}
	}
	else
	{
		ServEntities['s:' + serv_file_name] = new ServEntity();
		serv_info_tmp = ServEntities['s:' + serv_file_name];
		serv_info_tmp.time_info_collected = new Date().getTime();
	}

	try
	{
		stats = fs.statSync(serv_file);
		msg.file_path = serv_file;
		msg.ent_name = serv_file_name;
		cirrus.send_entity_msg(msg, {name : 's:' + serv_file_name}, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO, 1000 * 1000, 
	function (error, entity_msg, msg) {
            if (!error)
            {
                out_msg = {};
                out_msg.serv_info = msg.lib_info;
                ServEntities['s:' + serv_file_name] = msg.lib_info;
                cirrus.send_entity_reply(ent_msg, out_msg);
            }
        }
);

	} catch (file_not_found) {
		ml.error("Sending ann request failed Error : " + file_not_found + " " + serv_file + " " + serv_file_name);
		Messages_failed.incr();
		out_msg = {};
		out_msg.serv_info = null;
		cirrus.send_entity_reply(ent_msg, out_msg);
	}
};

var load_serv_info = function (file) {
	var msg = {};
	msg.file_path = file;

	console.log("********************************************* loading serv Info");
	cirrus.send_entity_msg(msg, {name : 's:' + file}, PDFinder.Entity.SERVER_ENTITY, PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_GET_SERV_INFO, 1000 * 1000, 
	function (error, entity_msg, msg) {
		if (!error)
		{
			console.log("Final *************************************************************");
			console.log("***8888888888888888888888888888888 got reply");
			console.log(JSON.stringify(msg.serv_info));
			console.log("***8888888888888888888888888888888 got reply from ann");
			console.log("Final *************************************************************END");

			console.log(JSON.stringify(ServEntities));
		}
	}
);

};

var dump_serv_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/data/cirrus/dump/" + my_identity + "_server.txt";
	out_msg.Result = "SERVER DUMP DONE";

	var fd;
        fd = fs.openSync(dump_file, "w");
        fs.writeSync(fd, JSON.stringify(ServEntities), 0);
        fs.close(fd);
 
	cirrus.send_entity_reply(ent_msg, out_msg);
};

var load_dump_serv_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/data/cirrus/dump/" + my_identity + "_server.txt";

	var stats = fs.statSync(dump_file);

	var fd, buf;
	fd = fs.openSync(dump_file, "r");
	buf = new Buffer(stats.size);
	fs.readSync(fd, buf, 0, stats.size, null);
	fs.close(fd);

	ServEntities = JSON.parse(buf.toString());

	out_msg.Result = "SERVER LOAD DUMP DONE";
	cirrus.send_entity_reply(ent_msg, out_msg);
};

cirrus.register_entity_cb(PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_DUMP_SERV_INFO, dump_serv_info);
cirrus.register_entity_cb(PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_SERV_INFO, load_dump_serv_info);
cirrus.register_entity_cb(PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_GET_SERV_INFO, get_serv_info);

//load_serv_info('/path/to_check/example.exe_def');

