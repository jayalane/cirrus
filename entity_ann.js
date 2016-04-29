/*global PDFinder: false*/
/*jslint regexp: false*/
/*global Buffer: false*/

var cirrus = require('./lib/cirrus');
var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var fs = require('fs');
var util  = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec;

var flr = require("./FileLineReader");

var cp = require('./lib/control-port');
var stats = require('./lib/stats');
var sanity = require('./lib/sanity');
var ml1 = require('./lib/mylog');
var ml = new ml1.Logger('CIRRUS', __filename);

require('./msgtypes');

var Messages_received = new stats.Stats('EntityAnn Messages received', 'mono');

var re_path = new RegExp(/(.*)\//);
var re_st_end = new RegExp(/^-----------/);
var re_ann = new RegExp(/(.*)\s(.*)\s(.*)/);

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

var EntityAnn = function () {
	var parent = this,
		date_sort_asc, sort_ann_weight;
	this.function_to_callback = null;
	this.ann_data = {};
	this.ann_data_sorted = [];

	this.stdout_collection = '';

	this.start_append = 0;

	this.data_collector = function (data) {
		parent.stdout_collection += data;
	};

	this.parse_and_do_cb = function (code)
	{
		//console.log("Return code" + code);
		if (code === 0) 
		{
			var lines = parent.stdout_collection.split("\n"),
				gather_data = 0, line, m, user, ann, line_txt,
				days_from_last_commit, dates, last_commit_date, sum, date_entry, d1, d2, days, date_commit, loc_date;
			for (line in lines ) {
				line_txt = lines[line];
				m = re_st_end.exec(line_txt);
				if (m !== null) {
					gather_data += 1;
				}

				if (gather_data === 1) {
					m = re_ann.exec(line_txt);
					if (m !== null) {
						user = m[2];
						date_commit = m[1];
						ann = parent.ann_data[user];
						if (ann === undefined)
						{
							parent.ann_data[user] = new AnnData();
							ann = parent.ann_data[user];
						}
						ann.dates.push(date_commit);
					}
				} else if (gather_data === 2) {
					break;
				}
			}

			parent.stdout_collection = null;
			lines = null;

			for (user in parent.ann_data)
			{
				//console.log("User + ", user);
				days_from_last_commit = 0;
				dates = parent.ann_data[user].dates;

				dates.sort(date_sort_asc);

				last_commit_date = dates[0];
				sum = 0;
				for (date_entry in dates)
				{
					loc_date = dates[date_entry];

					d1 = new Date(last_commit_date);
					d2 = new Date(loc_date);
					days = DateDiff.inDays(d1, d2);
					//console.log(last_commit_date + " " + loc_date + " " + days); 
					last_commit_date = loc_date;

					sum += Math.exp(days * 0.0002);
				}

				parent.ann_data[user].weight = sum;
			}

			for (user in parent.ann_data) {
				parent.ann_data_sorted.push([user, parent.ann_data[user]]);
			}

			parent.ann_data_sorted.sort(sort_ann_weight);

			parent.function_to_callback(parent);
		}

	};

	this.DoAnn = function (file, cb) {
		parent.function_to_callback = cb;
		var m = re_path.exec(file),
			cwd = process.cwd(), ps;
		process.chdir(m[1]);
		parent.stdout_collection = '';
		ps  = spawn("git annotate", [file]);
		process.chdir(cwd);

		ps.stdout.on('data', parent.data_collector);

		ps.stderr.on('data', function (data) {
			//console.log("##" + data + "##");
		});

		ps.on('exit', parent.parse_and_do_cb);
	};

	date_sort_asc = function (date1, date2) {
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

	sort_ann_weight = function (ann1, ann2) {
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


	this.getTopTen = function () {
		var ann_data_top_ten = [], user;
		for (user in this.ann_data_sorted)
		{
			ann_data_top_ten.push([this.ann_data_sorted[user][0], this.ann_data_sorted[user][1]]);
		}
		return ann_data_top_ten;
	};

	this.do_now = function (file_path, size) {
		/*var fd, buf;
		fd = fs.openSync(file_path, "r");
		buf = new Buffer(size);
		fs.readSync(fd, buf, 0, size, null);
		fs.close(fd);*/
		var reader = new flr.FileLineReader(file_path), gather_data;
		parent.stdout_collection = "";
		while(reader.hasNextLine())
		{
			m = re_st_end.exec(reader);
			if (m !== null) {
				gather_data += 1;
			}
			parent.stdout_collection += reader.nextLine();
			if (gather_data === 2) {
				break;
			}
		}

		reader.close();
		reader = null;
		//console.log(parent.stdout_collection);

		parent.parse_and_do_cb(0);
	};
};

exports.EntityAnn = EntityAnn;

var get_ann_info = function (msg, entity, source, ent_msg) {

	var ann = new EntityAnn(), ann_data_top_ten, out_msg, stats, stats_t, file_name_split, file_name, loc_to_check, time, time_t;

	Messages_received.incr();

	ml.info('Received request : ' + msg.file_path);

	file_name_split = msg.file_path.split('git_home/');
	file_name = file_name_split[file_name_split.length - 1];
	loc_to_check = '/example/path/' + file_name + '.ann';

	try
	{
		stats = fs.statSync(msg.file_path);
		time = new Date(stats.mtime);
	}
	catch(err)
	{
		out_msg = {};
		out_msg.ann_data_top_ten = ann.getTopTen();
		cirrus.send_entity_reply(ent_msg, out_msg);
		return;
	}

	try
	{
		stats_t = fs.statSync(loc_to_check);
		time_t = new Date(stats_t.mtime);

		if (time.getTime() === time_t.getTime())
		{
			ann.function_to_callback = function (ann) {
                var ann_data_top_ten = ann.getTopTen(),
                out_msg = {};
                out_msg.ann_data_top_ten = ann_data_top_ten;
                ml.info('Sending reply from cache : ' + msg.file_path);
                cirrus.send_entity_reply(ent_msg, out_msg);
            };
			ann.do_now(loc_to_check, stats_t.size);
			return;
		}
	} catch (err)
	{
		ml.error("To check                               :" + msg.file_path + " " + err);
	}

///*
	ann_data_top_ten = ann.getTopTen();
	out_msg = {};
	out_msg.ann_data_top_ten = ann_data_top_ten;

	cirrus.send_entity_reply(ent_msg, out_msg);

	return;
//*/


	ann.DoAnn(msg.file_path,
function (ann) {
        var ann_data_top_ten = ann.getTopTen(), fd, m,
        out_msg = {};
        out_msg.ann_data_top_ten = ann_data_top_ten;
        ml.info('Sending reply CB : ' + msg.file_path);
        cirrus.send_entity_reply(ent_msg, out_msg);
        m = re_path.exec(loc_to_check);
        try {
            fs.mkdirSync(m[1], "0777");
        } catch (err1) {}
        fd = fs.openSync(loc_to_check, "w");
        fs.writeSync(fd, ann.stdout_collection, 0);
        fs.close(fd);
        exec("/path/to/perl_script/fix_file_time.pl " + msg.file_path + " " + loc_to_check, function (error, stdout, stderr) {
        });

    });
};

cirrus.register_entity_cb(PDFinder.CTAnn.AppID, PDFinder.MsgType.MSG_TYPE_CT_ANN, PDFinder.CTAnn.MsgSubtype.MSG_SUBTYPE_GET_ANN_INFO, get_ann_info);
cp.make_cp(5051);
sanity.check();

