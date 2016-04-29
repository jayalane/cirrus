/*jslint bitwise: true */

var quizes = [];
var email = require("mailer");

var state = require('./state');
var stats = require('./stats');
var ml1   = require('./mylog');
var ml    = new ml1.Logger('QUIZ', __filename);

var web   = require('./web');

var the_head = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" " + 
               "\"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\"><html " + 
               "xmlns='http://www.w3.org/1999/xhtml' xml:lang='en'><head>" + 
               "<meta http-equiv='Content-Type' content='application/xhtml+xml; " + 
               "charset=utf-8'/><meta name='generator' content='emacs,lisp'/>" + 
               "<link href='/c/lisp.css' rel='stylesheet' type='text/css'/>";

var sent_mail_stats = new stats.Stats('SMTP outs', 'mono');
var sent_mail_err_stats = new stats.Stats('SMTP errors', 'mono');
var surveys_viewed_stats = new stats.Stats('Surveys viewed', 'mono');
var surveys_posted_stats = new stats.Stats('Surveys posted', 'mono');
var surveys_viewed_err = new stats.Stats('Surveys view err', 'mono');
var surveys_posted_err = new stats.Stats('Surveys post err', 'mono');

exports.register = function (quiz_data) {
    quizes[quiz_data.url] = quiz_data;
    ml.debug('Got a quiz ' + quiz_data.url);
};

var send_quiz = function (name, data, index) {
    email.send({
        host : "smtp.expample.com",              // smtp server hostname
        port : "25",                     // smtp server port
        domain : "example.com",            // domain used by client to identify itself to server
        to : "jayalane@example.com",
        from : "jayalane@example.com",
        subject : "Quiz from " + name + " for "  + index,
        body: "Hello! This is a quiz result:  " + data //,
    }, function (err, result) {
        if (err) { 
            ml.debug(err); 
            sent_mail_err_stats.incr();
            return;
        }
        sent_mail_stats.incr();
    });
};


send_quiz('jayalane', 'Likes it!', 'rmi-survey');

var my_headers = { 'Content-Type' : 'application/xhtml+xml; charset=utf-8'};

var list_quizes = function (action, pathname, cb) {
    var output = the_head + "<title>Quizes</title></head><body><div " + 
                 "id='quiz-all'><h3>List of surveys</h3>",
        q, url;
    for (q in quizes) {
        if (quizes.hasOwnProperty(q)) {
            url = "/quiz/take/" + quizes[q].url;
            output = output + "<p><a href='" + url + "'>" + quizes[q].name + " </a></p>";
	}
    }
    output = output + "</div><p><a href='http://validator.w3.org/check?uri=referer'>" + 
                      "<img src='http://www.w3.org/Icons/valid-xhtml10' alt='Valid " + 
                      "XHTML 1.0 Strict' height='31' width='88' /></a></p></body></html>";
    cb(output);
};

var get_next_survey_id = function (cb) {
    var p_ary = [];
    
    p_ary[0] = 'get';
    p_ary[1] = 'quiz-index';
    p_ary[2] = 'value';
    
    state.get_data(p_ary, false, function (value) {
        var new_value = (value|0) + 1;
        p_ary[0] = 'set';
        p_ary[3] = new_value;
        state.set_data(p_ary, false, function () {
            cb(new_value);
        });
    });
};

var post_quiz = function (action, pathname, cb, query) {

    var p_ary = pathname.substring(1).split("/"), 
        key_field, 
        output, quiz_name, quiz;

    if (p_ary.length === 2) {
        surveys_posted_err.incr();
        cb("error: URL too short");
    } else if (p_ary.length > 3) {
        surveys_posted_err.incr();
        cb("error: URL too long");
    } else {
        
        
        quiz_name = p_ary[2];
        quiz = quizes[quiz_name];

        if (quiz === undefined) {
            surveys_posted_err.incr();
            cb("quiz " + quiz_name + " not found");
            return;
        }
        surveys_posted_stats.incr();

        key_field = query[quiz.key_field];

        output = the_head + "<title>" + quiz.name + 
                            " Survey</title></head><body><div id='quiz-all'><h3>" + 
                            quiz.name + "</h3><p>Please contact " + quiz.author + 
                            " for more info</p>" + 
                            "<p><h3>Thanks for completing the survey!</h3></p>";

        get_next_survey_id(function (id) {
            var g_ary = [];
            g_ary[0] = "set";
            g_ary[1] = "quiz-" + quiz_name;
            g_ary[2] = id;
            g_ary[3] = key_field;
            g_ary[4] = JSON.stringify(query);
            output = output + "</div><p><a href='http://validator.w3.org/check?uri=referer'>" + 
                              "<img src='http://www.w3.org/Icons/valid-xhtml10' alt='Valid " + 
                              "XHTML " + 
                              "1.0 Strict' height='31' width='88' /></a></p></body></html>";
            state.set_data(g_ary, false, function () {
                cb(output);
                send_quiz(quiz_name, JSON.stringify(query), key_field);
            });
        });
    }
};


var html_types = { 
    text: function (field, id) {
        var output;
        output = "<p id='" + id + "'>" + field.label + ": <input name='" + id + 
                 "' type='text' size='" + field.length + "' /></p>";
        return output;
    },
    textarea: function (field, id) {
        var output = "<div id='" + id + "'><p> " + field.label + 
                     ": </p><textarea name='" + id + "' rows='30'" + 
                     " cols='40'></textarea></div>";
        return output;
    },
    checkbox: function (field, id) {
        var b, val, output; 
        output = "<p id='" + id + "'>" + field.label + ":";
        for (b in field.values) {
            if (field.values.hasOwnProperty(b)) {
                val = field.values[b];
                output = output + "<input type='checkbox' name='" + id + 
                                  "' value='" + val + "'/>" + val + "&nbsp;";
            }
        }
        return output + "</p>";
    },
    radio: function (field, id) {
        var output, b, val;
        output = "<p id='" + id + "'>" + field.label + ":";
        for (b in field.values) {
            if (field.values.hasOwnProperty(b)) {
                val = field.values[b];
                output = output + "<input type='radio' name='" + id + 
                                  "' value='" + val + "'/>" + val + "&nbsp;";
            }
        }
        return output + "</p>";
    },
    select: function (field, id) {
        var b, val, 
            output = "<p id='" + id + "'>" + field.label + ":";
        output = output + "<select name='" + id + "'>";
        field.values.sort();
        for (b in field.values) {
            if (field.values.hasOwnProperty(b)) {
                val = field.values[b];
                output = output + "<option value='" + val + "'> " + val + "</option>";
            }
        }
        return output + "</select></p>";
    },
    default: function (field, id) {
        var output = "<p id='" + id + "'>" + field.label + 
                     ": <input name='" + id + "' type='text' /></p>";
        return output;
    },
};
    

var take_quiz = function (action, pathname, cb) {
    
    var p_ary = pathname.substring(1).split("/"),
        quiz, quiz_name, output, id, f;

    if (p_ary.length === 2) {

        surveys_viewed_err.incr();
        cb("error: URL too short");

    } else if (p_ary.length > 3) {

        surveys_viewed_err.incr();
        cb("error: URL too long");

    } else {

        quiz_name = p_ary[2];
        quiz = quizes[quiz_name];

        if (quiz === undefined) {
            cb("quiz " + quiz_name + " not found");
            surveys_viewed_err.incr();
            return;
        }
        surveys_viewed_stats.incr();

        output = the_head + "<title>" + quiz.name + 
                     " Survey</title></head><body><div><h3>" + quiz.name + 
                     "</h3><p>Please contact " + quiz.author + 
                     " for more info</p><form id='quiz' action ='/quiz/post/" + 
                     quiz_name + "'>" + "<div>" + quiz.description + "</div>";

        for (id in quiz.fields) {
            if (quiz.fields.hasOwnProperty(id)) {
                f = quiz.fields[id];
                if (html_types[f.type] === undefined) {
                    output = output + html_types.default(f, id);
                } else {
                    output = output + html_types[f.type](f, id);
                } 
            }
        }
        output = output + "<p id='quiz-submit'><input type='submit' value='Submit'/>" + 
                          "</p></form></div>" + 
                          "<p><a href='http://validator.w3.org/check?uri=referer'>" + 
                          "<img src='http://www.w3.org/Icons/valid-xhtml10' alt='Valid " + 
                          "XHTML 1.0 Strict' height='31' width='88' /></a></p></body></html>";

        cb(output);
    }
};

var my_dispatcher = { 
    'take': take_quiz,
    'list': list_quizes,
    'post': post_quiz
};

var quiz_handler = function (action, pathname, cb, query) {
    
    var finish_request = function (output) { // start with the end
        cb(output, my_headers);
    }, p_ary = pathname.substring(1).split("/"), quiz_action;

    if ((p_ary.length === 1) ||
        (p_ary[1] === '')) {
        ml.debug("Default quiz action");
        return list_quizes(null, null, finish_request);
    } 
    
    quiz_action = p_ary[1];
    ml.debug("Got quiz action " + quiz_action);
    if (my_dispatcher.hasOwnProperty(quiz_action)) {  //dispatch on path
        my_dispatcher[quiz_action](quiz_action, 
                                   pathname, 
                                   finish_request, 
                                   query); // pass in CB for async action
    } else {
        finish_request("quiz error: action " + quiz_action + "not found"); // not found
    }
};

web.register_simple('quiz', quiz_handler);
