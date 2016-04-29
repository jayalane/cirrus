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


var LibEntities = {};// new Object();

var MaxRequestInServQueue = 5000000;
var RequestBeingServed = 0;
var RequestInQueue = 0;


var Data = function()
{
	this.file_entity = {}; //new object();
	this.lib_entity = {}; //new object();
}

var LibEntity = function () {
	this.path = '';
	this.time_touched = 0; 
	this.user_and_weight = null;

	this.time_info_collected = null;

	this.serialized = false;

	this.data = new Data();

	this.estimated = 0;
	this.finished = 0;
};


var add_file = function (obj, name, file_info) {
//		obj.file_entity[name] = file_info;

		var file_info_tmp = obj.data.file_entity[name];
		if (file_info_tmp === undefined)
		{
			obj.data.file_entity[name] = file_info;
		}
		else
		{
			if (file_info.time_touched !== 0)
			{
				obj.data.file_entity[name] = file_info;
			}
		}
	};

var add_lib = function (obj, name, lib_info) {
//		obj.lib_entity[name] = lib_info;

		var lib_info_tmp = obj.data.lib_entity[name];
		if (lib_info_tmp === undefined)
		{
			obj.data.lib_entity[name] = lib_info;
		}
		else
		{
			if (lib_info.time_touched !== 0)
			{
				obj.data.lib_entity[name] = lib_info;
			}
		}
	};

var file_to_lib_entity_name = function (file_path) {
	var lib_file_name_split = file_path.split('git_home/'),
	lib_file_name = lib_file_name_split[lib_file_name_split.length - 1];
	lib_file_name = lib_file_name.replace(/\//g, "_");
	lib_file_name = lib_file_name.replace(".lib_def", ".a");
	return "l:" + lib_file_name;
};


var receive_file_info = function (error, entity_msg, msg) {
	var info_tmp = {}, info_tmp_parent, out_msg;
	info_tmp_parent = LibEntities[entity_msg.parent];

	//console.log("msg" + JSON.stringify(msg) + "\n enn_msg :" + JSON.stringify(entity_msg));
	if (info_tmp_parent === undefined) {
		info_tmp_parent = new LibEntity();
		info_tmp_parent.time_info_collected = new Date().getTime();
		LibEntities[entity_msg.parent] = info_tmp_parent;
	}


	if (!error && msg.file_info !== null)
	{
		info_tmp.path = entity_msg.file_path;
		info_tmp.time_touched = msg.file_info.time_touched;
		info_tmp.user_and_weight = msg.file_info.user_and_weight;

		add_file(info_tmp_parent, msg.name, info_tmp);
	}

	info_tmp_parent.finished += 1;

};

var receive_lib_info_1 = function (error, entity_msg, msg) {
                    var info_tmp = {}, info_tmp_parent, out_msg;

                    info_tmp_parent = LibEntities[entity_msg.parent];

                    if (info_tmp_parent === undefined) {
                        info_tmp_parent = new LibEntity();
                        info_tmp_parent.time_info_collected = new Date().getTime();
                        LibEntities[entity_msg.parent] = info_tmp_parent;
                    }

    
                    if (!error && msg.lib_info !== null)
                    {
                        info_tmp.path = entity_msg.file_path;
                        info_tmp.time_touched = msg.lib_info.time_touched;
                        info_tmp.user_and_weight = msg.lib_info.user_and_weight;

                        add_lib(info_tmp_parent, entity_msg.name, info_tmp);
                    }

                    info_tmp_parent.finished += 1;
                };



var check_and_reply = function (ent_msg, lib_name)
{
	var ent_msg_p = ent_msg, count = 0, out_msg = {}, check_and_reply_1, lib_info_tmp;

	out_msg.lib_info = null;
	check_and_reply_1 = function ()
	{
		ml.info("Waiting for lib : " + lib_name + " (to avoid multiple ctann request)");
		if (count === 5000)
		{
			out_msg = {};
			out_msg.lib_info = null;
			ml.error("Not found during wait " + lib_name);
                        RequestBeingServed--;
			cirrus.send_entity_reply(ent_msg_p, out_msg);
			return;
		}

		lib_info_tmp = LibEntities['l:' + lib_name];
		if (lib_info_tmp.time_touched === 0 || this.user_and_weight === null)
		{
			count += 1;
			setTimeout(check_and_reply_1, 1000);
		}
		else
		{
			out_msg = {};
			out_msg.lib_info = lib_info_tmp;
                        RequestBeingServed--;
			cirrus.send_entity_reply(ent_msg_p, out_msg);
		}
	};
	setTimeout(check_and_reply_1, 1000);
};


var DateDiff = {
 
    inDays: function (d1, d2) {
        var t2 = d2.getTime(),
        t1 = d1.getTime();
 
        return parseInt((t2 - t1) / (24 * 3600 * 1000), 10);
    },
 
    inWeeks: function (d1, d2) {
        var t2 = d2.getTime(),
        t1 = d1.getTime();
 
        return parseInt((t2 - t1) / (24 * 3600 * 1000 * 7), 10);
    },
 
    inMonths: function (d1, d2) {
        var d1Y = d1.getFullYear(),
        d2Y = d2.getFullYear(),
        d1M = d1.getMonth(),
        d2M = d2.getMonth();
 
        return (d2M + 12 * d2Y) - (d1M + 12 * d1Y);
    },
 
    inYears: function (d1, d2) {
        return d2.getFullYear() - d1.getFullYear();
    }
};


var AnnData = function () {
	this.weight = 0;
	this.dates = [];
};

var date_sort_asc = function (date1, date2) {
	var d1 = new Date(date1),
		d2 = new Date(date2);

	if (d1.getTime() > d2.getTime())
	{
		return 1;
	}
	if (d1.getTime() < d2.getTime())
	{
		return -1;
	}
	return 0;
};

var sort_ann_weight = function (ann1, ann2) {
	if (ann1[1].weight < ann2[1].weight)
	{
	    return 1;
	}
	if (ann1[1].weight > ann2[1].weight)
	{
	    return -1;
	}
	return 0;
};


var collect_weights = function (lib_info_tmp) {
	var hash_user_weights = {}, ann_data_sorted = [], user, detail_info_sub_lib, each_user_weight, lib_info_t, file_info_t, ann, dates,
		last_commit_date, detail_info_sub_file, date_entry, sum, days_from_last_commit, d1, d2, loc_date, ann_data_top_ten, days;

//	try
//	{
	for (each_user_weight in lib_info_tmp.user_and_weight)
	{
		user = lib_info_tmp.user_and_weight[each_user_weight];

//		if (user[0] == 'pperiasamy') 
//		{
//			ml.info("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& self");
//		}
		ann = hash_user_weights[user[0]];
		if (ann === undefined)
		{
			hash_user_weights[user[0]] = new AnnData();
			ann = hash_user_weights[user[0]];
		}
		ann.dates = ann.dates.concat(user[1].dates);
	}

	for (lib_info_t in lib_info_tmp.data.lib_entity)
	{
		detail_info_sub_lib = lib_info_tmp.data.lib_entity[lib_info_t];
		if (detail_info_sub_lib.time_touched !== 0 || detail_info_sub_lib.user_and_weight !== null)
		{
			for (each_user_weight in detail_info_sub_lib.user_and_weight)
			{
				user = detail_info_sub_lib.user_and_weight[each_user_weight];
//		if (user[0] == 'pperiasamy') 
//		{
//			ml.info("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& iib");
//		}
	
				ann = hash_user_weights[user[0]];
				if (ann === undefined)
				{
					hash_user_weights[user[0]] = new AnnData();
					ann = hash_user_weights[user[0]];
				}
				ann.dates = ann.dates.concat(user[1].dates);
			}
		} else {
			ml.error("Missing data**********************************************" + lib_info_tmp);
		}
	}

	for (file_info_t in lib_info_tmp.data.file_entity)
	{
		detail_info_sub_file = lib_info_tmp.data.file_entity[file_info_t];
		if (detail_info_sub_file.time_touched !== 0 || detail_info_sub_lib.user_and_weight !== null)
		{
			for (each_user_weight in detail_info_sub_file.user_and_weight)
			{
				user = detail_info_sub_file.user_and_weight[each_user_weight];

//		if (user[0] == 'pperiasamy') 
//		{
//			ml.info("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& file");
//		}
	
				ann = hash_user_weights[user[0]];
				if (ann === undefined)
				{
					hash_user_weights[user[0]] = new AnnData();
					ann = hash_user_weights[user[0]];
				}
				ann.dates = ann.dates.concat(user[1].dates);
			}
		} else {
			ml.error("Missing data**********************************************" + file_info_t);
		}
	}

	for (user in hash_user_weights)
	{
		days_from_last_commit = 0;
		dates = hash_user_weights[user].dates;

		dates.sort(date_sort_asc);

		last_commit_date = dates[0];
		sum = 0;
		for (date_entry in dates)
		{
			loc_date = dates[date_entry];

			d1 = new Date(last_commit_date);
			d2 = new Date(loc_date);
			days = DateDiff.inDays(d1, d2);
			last_commit_date = loc_date;

			sum += Math.exp(days * 0.004);
		}

		hash_user_weights[user].weight = sum;

//		if (user == 'pperiasamy') 
//		{
//			ml.info("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& sum" + sum);
//		}
	
	}


	for (user in hash_user_weights) {
		ann_data_sorted.push([user, hash_user_weights[user]]);
	}

	ann_data_sorted = ann_data_sorted.sort(sort_ann_weight);

	ann_data_top_ten = [];
	for (user in ann_data_sorted)
	{
		ann_data_top_ten.push([ann_data_sorted[user][0], ann_data_sorted[user][1]]);
	}

	lib_info_tmp.user_and_weight = ann_data_top_ten;

//	} catch (err)
//	{
//		ml.error("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&" + err);
//	}
};

var get_lib_info_1 = function (msg, entity, source, ent_msg) {
	RequestInQueue += 1;
	if (RequestBeingServed < MaxRequestInServQueue)
	{
		get_lib_info_3(msg, entity, source, ent_msg);
	}
	else
	{
		var get_lib_info_2 = function ()
{
    ml.info("RequestBeingServed : " + RequestBeingServed + " RequestInQueue : " + RequestInQueue);
    if (RequestBeingServed < MaxRequestInServQueue)
    {
        get_lib_info_3(msg, entity, source, ent_msg);
    }
    else
    {
        setTimeout(get_lib_info_2, 3000);
    }
}
		setTimeout(get_lib_info_2, 3000);
	}
};

var get_lib_info = function (msg, entity, source, ent_msg) {
	var lib_file = msg.file_path,
		lib_relative = msg.file_path,
		lib_file_name_split, lib_file_name, lib_info_tmp, m, out_msg, path, path_in_lib,
		check_if_finished, detail_info_sub_lib, lib_ent_name,
		detail_info_sub_lib_1, info_tmp,
		fd, time, stats, buf,
		data, lines, line;

	RequestInQueue -= 1;
	RequestBeingServed += 1;
	Messages_received.incr();

	ml.info("processing " + lib_file);

	lib_file = lib_file.replace(".a", ".lib_def");
	lib_file_name_split = lib_file.split('git_home/');
	lib_file_name = lib_file_name_split[lib_file_name_split.length - 1];
	lib_file_name = lib_file_name.replace(/\//g, "_");
	lib_file_name = lib_file_name.replace(".lib_def", ".a");

	m = re_path.exec(lib_relative);

	if (m !== null)
	{
		lib_relative = m[1];
	}

	lib_info_tmp = LibEntities['l:' + lib_file_name];

	if (lib_info_tmp !== undefined)
	{
		ml.debug("found in cache : " + lib_file_name);

		out_msg = {};
		out_msg.lib_info = lib_info_tmp;

		if (lib_info_tmp.time_touched === 0)
		{
			check_and_reply(ent_msg, lib_file_name);
			return;
		}


		if ((new Date().getTime() - lib_info_tmp.time_info_collected) < 3600 * 1000)
		{
                        RequestBeingServed --;
			cirrus.send_entity_reply(ent_msg, out_msg);
			return;
		}
	}
	else
	{
		LibEntities['l:' + lib_file_name] = new LibEntity();
		lib_info_tmp = LibEntities['l:' + lib_file_name];
		lib_info_tmp.time_info_collected = new Date().getTime();
	}

	try
	{
		stats = fs.statSync(lib_file);
		time = new Date(stats.atime);
		fd = fs.openSync(lib_file, "r");
		buf = new Buffer(stats.size);
		fs.readSync(fd, buf, 0, stats.size, null);
		fs.close(fd);
	
		data = buf.toString();
		lines = data.split('\n');

		for (line in lines) {
			m = re_lib.exec(lines[line]);
			if (m === null) {
				m = re_file.exec(lines[line]);
				if (m !== null) { //Source file
					lib_info_tmp.estimated += 1;
					//Query file entity and get the details

					msg = {};

					msg.file_dir = lib_relative;
					msg.build_top = lib_file_name_split[0] + 'git_home/all';
					msg.file_path_in_lib = m[1];
					msg.name = m[1].replace("/", "_");
					msg.parent = "l:" + lib_file_name;


					ml.debug("Sub file " + path + " " + msg.file_path);

					cirrus.send_entity_msg(msg, {name : 'f:' + msg.name}, PDFinder.Entity.FILE_ENTITY, PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_GET_FILE_INFO, 1000 * 1000, receive_file_info);

				}
			}
			else { //Library
				lib_info_tmp.estimated += 1;

				msg = {};
				path_in_lib = m[1].replace(".a", ".lib_def");
				path = lib_relative + "/" + path_in_lib;
				try
				{
					fs.statSync(path);
					msg.file_path = path;
				}
				catch (err)
				{
					msg.file_path = lib_file_name_split[0] + 'git_home/' + path_in_lib;
				}
				msg.name = file_to_lib_entity_name(msg.file_path);
				msg.parent = "l:" + lib_file_name;

				ml.debug("Sub Lib " + path + " " + msg.file_path);

				cirrus.send_entity_msg(msg, {name : msg.name}, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO, 1000 * 1000, receive_lib_info_1);
			}
		}


		msg = {};
		msg.name = 'l:' + lib_file_name;
		msg.file_path = lib_file;
		msg.time_touched = time;

		cirrus.send_entity_msg(msg, {name : 'l:' + lib_file_name}, PDFinder.Entity.CT_ANN, PDFinder.CTAnn.AppID, PDFinder.MsgType.MSG_TYPE_CT_ANN, PDFinder.CTAnn.MsgSubtype.MSG_SUBTYPE_GET_ANN_INFO, 1000 * 1000, 
	function (error, entity_msg, msg) {
                if (!error)
                {
                    lib_ent_name = entity_msg.name;
                    check_if_finished =  null;
                    info_tmp = LibEntities[entity_msg.name];

                    ml.debug(entity_msg.name);

                    if (info_tmp === undefined) {
                        info_tmp = new LibEntity();
                        info_tmp.time_info_collected = new Date().getTime();
                        LibEntities[entity_msg.name] = info_tmp;
                    }
                    info_tmp.path = entity_msg.file_path;
                    info_tmp.time_touched = entity_msg.time_touched;
                    info_tmp.user_and_weight = msg.ann_data_top_ten;

                    check_if_finished = function () {
                        lib_info_tmp = LibEntities[lib_ent_name];

                        ml.debug("Waiting ... for " + lib_ent_name);

                        if (lib_info_tmp !== undefined)
                        {
                            ml.debug(lib_ent_name + " " + lib_info_tmp.estimated + "===" + lib_info_tmp.finished + " " + lib_info_tmp.path);
                            if (lib_info_tmp.estimated === lib_info_tmp.finished) {

                                out_msg = {};

                                /*if (lib_info_tmp.data === null && ib_info_tmp.serialized == true)
                                {
                                    //try
                                    // {
                                    var file_name_split11 = lib_info_tmp.path.split('git_home/');
                                    var file_name11 = file_name_split11[file_name_split11.length - 1];
                                    var loc_to_check11 = '/example/path/git_home' + file_name11 + '.info';

	                            var stats = fs.statSync(loc_to_check11);
                                    var fd, buf;
                                    fd = fs.openSync(loc_to_check11, "r");
                                    buf = new Buffer(stats.size);
                                    fs.readSync(fd, buf, 0, stats.size, null);
                                    fs.close(fd);
                                    /*} catch (err)
                                    {
                                           setTimeout(check_if_finished, 1000);
                                           return;
                                    }*
                                    lib_info_tmp.data = JSON.parse(buf.toString());
                                }*/

				if (lib_info_tmp.data !== null) {
                                if (lib_info_tmp.data.file_entity === null) lib_info_tmp.data.file_entity = {};
                                if (lib_info_tmp.data.lib_entity === null) lib_info_tmp.data.lib_entity = {};

                                for (var lib_info_t in lib_info_tmp.data.lib_entity)
                                {
                                    detail_info_sub_lib = lib_info_tmp.data.lib_entity[lib_info_t];
                                    if (detail_info_sub_lib.time_touched === 0 || detail_info_sub_lib.user_and_weight === null)
				    {
                                        detail_info_sub_lib_1 = LibEntities[lib_info_t];
                                        if (detail_info_sub_lib_1 !== undefined)
					{	
                                            if (detail_info_sub_lib_1.time_touched === 0 || detail_info_sub_lib.user_and_weight === null)
					    {
                                                ml.error("LIBRARY info missing : " + lib_info_t + " " + detail_info_sub_lib.path);
                                            } else {
                                                detail_info_sub_lib.time_touched = detail_info_sub_lib_1.time_touched;
                                                detail_info_sub_lib.user_and_weight = detail_info_sub_lib_1.time_touched;
                                                detail_info_sub_lib.path = detail_info_sub_lib_1.path;
                                            }
                                        } else {
                                            ml.error("LIBRARY info missing - not found in cache : " + lib_info_t + " " + detail_info_sub_lib.path);
                                        }
                                    }
                                }


                                collect_weights(lib_info_tmp);

                                /*if (lib_info_tmp.serialized === false && lib_info_tmp.data !== null)
                                {

                                    var file_name_split11 = lib_info_tmp.path.split('git_home/');
                                    var file_name11 = file_name_split11[file_name_split11.length - 1];
                                    var loc_to_check11 = '/example/data/git_home/' + file_name11 + '.info';

                                    var fd;
                                    fd = fs.openSync(loc_to_check11, "w");
                                    fs.writeSync(fd, JSON.stringify(lib_info_tmp.data), 0);
                                    fs.close(fd);

                                    lib_info_tmp.serialized = true;
                                    lib_info_tmp.data = null;
                                } else if (lib_info_tmp.serialized === true && lib_info_tmp.data !== null)
                                {
                                    lib_info_tmp.data = null;
                                }*/
                                out_msg.lib_info = lib_info_tmp;
                                RequestBeingServed --;
                                cirrus.send_entity_reply(ent_msg, out_msg);
                                }
                            }
                            else
                            {
                                setTimeout(check_if_finished, 1000);
                            }
                        }
	                else
                        {
                            setTimeout(check_if_finished, 1000);
                        }
                    };

                    setTimeout(check_if_finished(entity_msg.name), 1000);
                }
                else
                {
                    ml.error("Response with Error : " + error + " " + lib_file + " " + lib_file_name);
                    out_msg = {};
                    out_msg.lib_info = null;
                    RequestBeingServed --;
                    cirrus.send_entity_reply(ent_msg, out_msg);
                }
            }
);
	} catch (file_not_found) {
		ml.error("Sending ann request failed Error : " + file_not_found + " " + lib_file + " " + lib_file_name);
		Messages_failed.incr();
		out_msg = {};
		out_msg.lib_info = null;
		RequestBeingServed --;
		cirrus.send_entity_reply(ent_msg, out_msg);
	}
};

//================================TEST=====================================
//=========================================================================
var load_lib_info = function (file) {
	var msg = {};
	msg.file_path = file;

	console.log("********************************************* loading lib Info");
	cirrus.send_entity_msg(msg, {name : 'l:' + file}, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO, 1000 * 1000, 
	function (error, entity_msg, msg) {
		if (!error)
		{
			console.log("Final *************************************************************");
			console.log("***8888888888888888888888888888888 got reply");
			console.log(JSON.stringify(msg.lib_info));
			console.log("***8888888888888888888888888888888 got reply from ann");
			console.log("Final *************************************************************END");

			console.log(JSON.stringify(LibEntities));
			console.log(LibEntities);
		}
	}
);

};

var to_call = function() {
    //load_lib_info('/example/path/git_home/test.lib_def');
//================================TEST=====================================
//=========================================================================
};

setTimeout(to_call, 6000); 

var get_list = function (msg, entity, source, ent_msg)
{	var match_list = [];
	var msg_pattern_lower = msg.pattern.toLowerCase();
	for (var lib in LibEntities)
	{
		if (lib.toLowerCase().search(msg_pattern_lower) >=0)
		{
			match_list.push({"entity_name":lib});
		}
	}
	out_msg = {};
        out_msg.Result = match_list;
        cirrus.send_entity_reply(ent_msg, out_msg);
}

var get_lib_info_if_catched = function (msg, entity, source, ent_msg)
{
	var lib_name = msg.lib_name;
	var lib_info = LibEntities[lib_name];
	if (lib_info !== undefined)
	{
		out_msg = {};
		out_msg.Result = lib_info;
		cirrus.send_entity_reply(ent_msg, out_msg);
	}
}

var dump_lib_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/cirrus/dump/" + my_identity + "_lib.txt";
	out_msg.Result = "LIB DUMP DONE";

	var fd;
        fd = fs.openSync(dump_file, "w");
        fs.writeSync(fd, JSON.stringify(LibEntities), 0);
        fs.close(fd);
 
	cirrus.send_entity_reply(ent_msg, out_msg);
};

var load_dump_lib_info = function (msg, entity, source, ent_msg) {
	var out_msg = {};
	var my_identity = msg.my_identity;
	var dump_file = "/example/data/cirrus/dump/" + my_identity + "_lib.txt";

	var stats = fs.statSync(dump_file);
	var fd, buf;
	fd = fs.openSync(dump_file, "r");
	buf = new Buffer(stats.size);
	fs.readSync(fd, buf, 0, stats.size, null);
	fs.close(fd);

	LibEntities = JSON.parse(buf.toString());

	out_msg.Result = "LIB LOAD DUMP DONE";
	cirrus.send_entity_reply(ent_msg, out_msg);
};

cirrus.register_entity_cb(PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_DUMP_LIB_INFO, dump_lib_info);
cirrus.register_entity_cb(PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_LIB_INFO, load_dump_lib_info);
cirrus.register_entity_cb(PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIST, get_list);
cirrus.register_entity_cb(PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO_FROM_CACHE, get_lib_info_if_catched);
cirrus.register_entity_cb(PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO, get_lib_info);

