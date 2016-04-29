/*global PDFinder: false*/

var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var cirrus = require('./lib/cirrus');
require('./msgtypes');
var fs = require('fs');

var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var sanity = require('./lib/sanity');
var ml1 = require('./lib/mylog');
var ml = new ml1.Logger('CIRRUS', __filename);

var Messages_received = new stats.Stats('FileEntity Messages received', 'mono');
var Messages_failed = new stats.Stats('FileEntity Messages failed', 'mono');

var FileEntities = {};// new Object();

var FileEntity = function () {
	this.path = '';
	this.time_touched = 0;
        this.serialized = null;
	this.user_and_weight = null;
};


var get_full_path = function (msg)
{
	var cpp = msg.file_path_in_lib.replace(".o", ".cpp"),
		path = msg.file_dir + "/" + cpp;
	try
	{
		fs.statSync(path);
		return path;
	}
	catch (err)
	{
		path = msg.build_top + "/" + cpp;
		try
		{
			fs.statSync(path);
			return path;
		}
		catch (err1)
		{
			ml.error("File not found : " + msg.file_dir + " " +  msg.build_top + " " + msg.file_path_in_lib);
		}
		return path;
	}
};



var get_file_info = function (msg_req, entity, source, ent_msg) {

	var file = get_full_path(msg_req),//msg_req.file_path,
		info = new FileEntity(),
			file_name_split, file_name, info_tmp, stat, time, msg, out_msg;

	Messages_received.incr();

	file = file.replace(".o", ".cpp");
	file_name_split = file.split('git_home/');
	file_name = file_name_split[file_name_split.length - 1];
	file_name = file_name.replace(/\//g, "_");

	ml.info('Received request :' + file_name);

	info_tmp = FileEntities['f:' + file_name];

	try {
		stat = fs.statSync(file);
		time = new Date(stat.atime);

		if (info_tmp !== undefined) {
			if (!(info_tmp.time_touched instanceof Date)) {
				info_tmp.time_touched = new Date(info_tmp.time_touched);
			}
			if (info_tmp.time_touched.getTime() === time.getTime())
			{
				ml.info("Found in cache sending from cache");
				if (info_tmp.user_and_weight == null)
				{
					info_tmp.user_and_weight =[];
				}
				out_msg = {};
				out_msg.file_info = info_tmp;
				cirrus.send_entity_reply(ent_msg, out_msg);
				return;
			}
		}

		msg = {};
		msg.name = 'f:' + file_name;
		msg.file_path = file;
		msg.time_touched = time;

		ml.info('Sending Ann request' + msg.file_path);
		cirrus.send_entity_msg(msg, {name : 'f:' + file_name}, PDFinder.Entity.CT_ANN, PDFinder.CTAnn.AppID, PDFinder.MsgType.MSG_TYPE_CT_ANN, PDFinder.CTAnn.MsgSubtype.MSG_SUBTYPE_GET_ANN_INFO, 1000 * 1000, function (error, entity_msg, msg) {
            if (!error)
            {
                var info_tmp = new FileEntity(), out_msg;
                info_tmp.path = entity_msg.file_path;
                info_tmp.time_touched = entity_msg.time_touched;
                info_tmp.user_and_weight = msg.ann_data_top_ten;

                out_msg = {};
                out_msg.file_info = info_tmp;
                out_msg.name = "f:"+file_name;

                ml.info('Sending reply :' + file_name /*+ JSON.stringify(out_msg)*/);


                cirrus.send_entity_reply(ent_msg, out_msg);

		//info_tmp.serialized = JSON.stringify(info_tmp.user_and_weight);
		//info_tmp.user_and_weight = null;
                FileEntities[entity_msg.name] = info_tmp;
            }
        }
);
	} catch (file_not_found) {
		Messages_failed.incr();
		ml.error("Sending ann request failed Error : " + file_not_found + " " + file + " " + file_name);
		out_msg = {};
		out_msg.file_info = null;
		cirrus.send_entity_reply(ent_msg, out_msg);
	}
};



var load_file_info = function (file) {
	var msg = {};
	msg.file_dir = '/example/home/path/';
        msg.build_top = '/example/home/path/git_home/';
        msg.file_path_in_lib = 'path/to_file/stuff.cpp';
	msg.name = msg.file_path_in_lib.replace("/", "_");
	msg.file_path = file;
	console.log("Sending File");
	cirrus.send_entity_msg(msg, {name : 'f:' + file}, PDFinder.Entity.FILE_ENTITY, PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_GET_FILE_INFO, 1000 * 1000, function (error, entity_msg, msg) {
		if (!error)
		{
			console.log("***8888888888888888888888888888888 got reply");
			console.log(JSON.stringify(msg.file_info));
			console.log("***8888888888888888888888888888888 got reply from ann");
		}
	}
);

};


cp.make_cp(5052);
sanity.check();

var get_list = function (msg, entity, source, ent_msg)
{	var match_list = [];
	var msg_pattern_lower = msg.pattern.toLowerCase();
	for (var file in FileEntities)
	{
		if (file.toLowerCase().search(msg_pattern_lower) >=0)
		{
			match_list.push({"entity_name":file});
		}
	}
	out_msg = {};
        out_msg.Result = match_list;
        cirrus.send_entity_reply(ent_msg, out_msg);
}

var get_file_info_if_catched = function (msg, entity, source, ent_msg)
{
	var file_name = msg.file_name;
	var file_info = FileEntities[file_name];
	if (file_info !== undefined)
	{
		out_msg = {};
		out_msg.Result = file_info;
		cirrus.send_entity_reply(ent_msg, out_msg);
	}
}

var dump_file_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/data/cirrus/dump/" + my_identity + "_file.txt";
	out_msg.Result = "FILE DUMP DONE";

	var fd;
        fd = fs.openSync(dump_file, "w");
        fs.writeSync(fd, JSON.stringify(FileEntities), 0);
        fs.close(fd);
 
	cirrus.send_entity_reply(ent_msg, out_msg);
};

var load_dump_file_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/data/cirrus/dump/" + my_identity + "_file.txt";

	var stats = fs.statSync(dump_file);

	var fd, buf;
	fd = fs.openSync(dump_file, "r");
	buf = new Buffer(stats.size);
	fs.readSync(fd, buf, 0, stats.size, null);
	fs.close(fd);

	FileEntities = JSON.parse(buf.toString());

	out_msg.Result = "FILE LOAD DUMP DONE";
	cirrus.send_entity_reply(ent_msg, out_msg);
};

cirrus.register_entity_cb(PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_DUMP_FILE_INFO, dump_file_info);
cirrus.register_entity_cb(PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_FILE_INFO, load_dump_file_info);
cirrus.register_entity_cb(PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_GET_LIST, get_list);
cirrus.register_entity_cb(PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_GET_FILE_INFO_FROM_CACHE, get_file_info_if_catched);
cirrus.register_entity_cb(PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_GET_FILE_INFO, get_file_info);

var load_info = function()
{ 
load_file_info('/path_to_files/Factory.cpp');
};
//load_info();
//setTimeout(load_info, 5000);
//setTimeout(load_info, 9000);
