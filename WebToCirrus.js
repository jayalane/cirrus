var sys = require("sys"),   
    http = require("http"),   
    url = require("url"),   
    path = require("path"),   
    fs = require("fs"),
    cirrus = require("./lib/cirrus");

require("./msgtypes");

var my_identity = '';
exports.set_my_identity = function (identity)
{
	my_identity = identity;
};

var check_load_output = function(response, filename)
{
path.exists(filename, function(exists) {   
        if(!exists) {   
            response.writeHeader(404, {"Content-Type": "text/plain"});   
            response.write("404 Not Found\n");   
            response.end();   
            return;   
        }   
  
        fs.readFile(filename, "binary", function(err, file) {   
            if(err) {   
                response.writeHeader(500, {"Content-Type": "text/plain"});   
                response.write(err + "\n");   
                response.end();   
                return;   
            }   
 
            if (filename.search('.json')>=0) 
            {	
               response.writeHeader(200, {"Content-Type": "application/json"});
            } else if (filename.search('.PNG')>=0)
            {
               response.writeHeader(200, {"Content-Type": "image/png"});
            }
            else
            {
		response.writeHeader(200);   
            }
            response.write(file, "binary");   
            response.end();   
        });   
    });
};

http.createServer(function(request, response) {   
    var uri_obj = url.parse(request.url, true);
    var uri = uri_obj.pathname;

    var q_obj = uri_obj.query;
    var q_cirrus = q_obj.cirrus;

    if (q_cirrus !== undefined)
    {
       if (q_cirrus === 'qc_list')
       {
           response.writeHeader(200, {"Content-Type": "application/json"});
           var msg = {};
           msg.pattern = q_obj.query;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'qc_list' }, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIST, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                response.end();   
           }
         );
       }
       if (q_cirrus === 'qlib_info_cache')
       {
           response.writeHeader(200, {"Content-Type": "application/json"});
           var msg = {};
           msg.lib_name = q_obj.query;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'qlib_info_cache' }, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_GET_LIB_INFO_FROM_CACHE, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                response.end();
           }
         );
       }
       if (q_cirrus === 'ctann2')
       {
		var filename = '/filepath/git_home/' + q_obj.query;
		response.writeHeader(200, {"Content-Type": "text/plain"});
		check_load_output(response, filename);
		response.end();
       }

       if (q_cirrus === 'dump')
       {
           var responses = 0;
           console.log("DUMP");
           response.writeHeader(200, {"Content-Type": "text/plain"});   
           var msg = {};
           msg.my_identity = my_identity;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.SERVER_ENTITY, PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_DUMP_SERV_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                responses++;
                if (responses === 3)
                {
                     response.end();
                }
           }
         );
           var msg = {};
           msg.my_identity = my_identity;
           msg.lib_name = q_obj.query;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_DUMP_LIB_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                responses++;
                if (responses === 3)
                {
                     response.end();
                }
           }
         );
           var msg = {};
           msg.my_identity = my_identity;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.FILE_ENTITY, PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_DUMP_FILE_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                responses++;
                if (responses === 3)
                {
                     response.end();
                }
           }
         );
       }
       if (q_cirrus === 'load_from_dump')
       {
           var responses = 0;
           response.writeHeader(200, {"Content-Type": "text/plain"});   

           var msg = {};
           msg.my_identity = my_identity;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.SERVER_ENTITY, PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_SERV_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }

                responses++;
                if (responses === 3)
                {
                     response.end();
                }
          }
         );

           var msg = {};
           msg.lib_name = q_obj.query;
           msg.my_identity = my_identity;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.LIB_ENTITY, PDFinder.Lib.AppID, PDFinder.MsgType.MSG_TYPE_LIB, PDFinder.Lib.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_LIB_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                responses++;
                if (responses === 3)
                {
                     response.end();
                }
           }
         );

           var msg = {};
           msg.my_identity = my_identity;
           cirrus.send_entity_msg(msg, {name : 'wc:' + 'dump' }, PDFinder.Entity.FILE_ENTITY, PDFinder.File.AppID, PDFinder.MsgType.MSG_TYPE_FILE, PDFinder.File.MsgSubtype.MSG_SUBTYPE_LOAD_DUMP_FILE_INFO, 1000 * 1000,
        function (error, entity_msg, msg) {
                if (!error)
                {
                     out_msg = {};
                     out_msg.ResultSet = msg;
                     response.write(JSON.stringify(out_msg));
                }
                responses++;
                if (responses === 3)
                {
                     response.end();
                }
            }
         );
 
       }
       if (q_cirrus === 'load_serv_info')
       {
        response.writeHeader(200, {"Content-Type": "text/plain"});   

	var msg = {};
	msg.file_path = q_obj.query;

	console.log("********************************************* loading serv Info");
	cirrus.send_entity_msg(msg, {name : 's:' + msg.file_path}, PDFinder.Entity.SERVER_ENTITY, PDFinder.Server.AppID, PDFinder.MsgType.MSG_TYPE_SERVER, PDFinder.Server.MsgSubtype.MSG_SUBTYPE_GET_SERV_INFO, 1000 * 1000, 
	function (error, entity_msg, msg) {
		if (!error)
		{
			console.log("Final *************************************************************");
			console.log("***8888888888888888888888888888888 got reply");
			console.log(JSON.stringify(msg.serv_info));
			console.log("***8888888888888888888888888888888 got reply from ann");
			console.log("Final *************************************************************END");

			//console.log(JSON.stringify(ServEntities));
			var out_msg = {};
			out_msg.ResultSet = "LOADED";
			response.write(JSON.stringify(out_msg)+JSON.stringify(msg));
			response.end();
		}
	}
);


       }
/*
qfile_info_cache
qserv_info_cache
dump 
load_from_dump
load_serv
load_file
load_lib*/
	return;
    }
 
    var filename = path.join(process.cwd(), uri);   
    check_load_output(response, filename);   
}).listen(9595);   
  
sys.puts("Server running at http://localhost:9595/");  
