var quiz = require('../lib/quiz');

var book_quiz = {
    name: 'Reading Groups',
    author: 'someone@example.com',
    url: "reading_groups",
    description: "Please fill in this information to make forming reading groups easier.",
    fields: { email_id: {type: 'text',
                         length: 20,
                         description: "What's your email ID?",
                         label: "User ID",
                        },
              location: {type: 'select',
                         values: [ 'Here', 'There', 
                                   'Elsewhere',
                                   'other'],
                         description: 'where do you work?',
                         label: "Location"
                        },
              days: {type: 'checkbox',
                     values: [ 'M', 'T', 'W', 'Th', 'F'],
                     description: "Which days could you make a lunch meeting?",
                     label: "Good days to meet"
                    },
              lead: {type: 'checkbox',
                     values: [ 'Yes', 'No' ],
                     description: "Would you be willing to coordinate for your site?",
                     label: "Site Coordinator"
                    },
              comments: {type: 'textarea',
                         description: "Anything else you'd like to tell me?",
                         label: "Comments"
                        }
            },
    key_field: 'email_id'
    
};

var rmi_quiz = {
    name: 'Team Feedback',
    author: 'someone@example.com',
    url: "team_feedback",
    description: "Please let us know what you'd like to see more of or less of.",
    fields: { email_id: {type: 'text',
                         length: 20,
                         description: "What's your email ID?",
                         label: "User ID",
                        },
              location: {type: 'select',
                         values: [ 'Here', 'There', 
                                   'Elsewhere',
                                   'other'],
                         description: 'where do you work?',
                         label: "Location"
                        },
              rating: {type: 'radio',
                       values: [ '0', '1', '2', '3', '4', '5' ],
                       description: "How good are we doing?",
                       label: "Overall impression of TEAM's customer service"
                      },
              comments: {type: 'textarea',
                         description: "Anything else you'd like to tell RMI?",
                         label: "Please let us know anything on your mind"
                        }
            },
    key_field: 'email_id'
};

quiz.register(book_quiz);
quiz.register(rmi_quiz);
