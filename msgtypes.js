PDFinder = {
    Entity : {
        SERVER_ENTITY : "S1",
        LIB_ENTITY    : "L2",
        FILE_ENTITY   : "F3",
        CT_ANN        : "C4"
    },

    MsgType : {
        MSG_TYPE_SERVER : 1,
        MSG_TYPE_LIB    : 2,
        MSG_TYPE_FILE   : 3,
        MSG_TYPE_CT_ANN : 4
    },

    Server : { AppID : 'rm1', MsgSubtype : {
        MSG_SUBTYPE_GET_SERV_INFO           : 11,
        MSG_SUBTYPE_DUMP_SERV_INFO          : 14,
        MSG_SUBTYPE_LOAD_DUMP_SERV_INFO     : 15,
    }},

    Lib: { AppID : 'rm1', MsgSubtype : {
        MSG_SUBTYPE_GET_LIB_INFO            : 21,
        MSG_SUBTYPE_GET_LIST                : 22,
	MSG_SUBTYPE_GET_LIB_INFO_FROM_CACHE : 23,
        MSG_SUBTYPE_DUMP_LIB_INFO           : 24,
        MSG_SUBTYPE_LOAD_DUMP_LIB_INFO      : 25,
    }},

    File: {AppID : 'rm1', MsgSubtype : {
        MSG_SUBTYPE_GET_FILE_INFO            : 31,
        MSG_SUBTYPE_GET_LIST                 : 32,
	MSG_SUBTYPE_GET_FILE_INFO_FROM_CACHE : 33,
        MSG_SUBTYPE_DUMP_FILE_INFO           : 34,
        MSG_SUBTYPE_LOAD_DUMP_FILE_INFO      : 35,
    }},

    CTAnn: {AppID : 'rm2', MsgSubtype : {
        MSG_SUBTYPE_GET_ANN_INFO             : 41,
    }},
};
