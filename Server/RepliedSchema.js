const mongoose = require('mongoose');
const moment = require('moment');
const Message = require('./messageSchema'); 

const repliedSchema = mongoose.Schema(
    {
        from: {
            type: String,
            required: true,
            trim: true
        },
        to: {
            type: String,
            required: true,
            trim: true
        },
        userId: {
            type: String, required: true, default: null
        },
        sessionId: {
            type: String,
            required: true,
            default: null
        },
        messageId: {
            type: String,
            required: true,
        },
        createdAt: {
            type: String,
            default: null
        },
        deviceType: {
            type: String,
            default: null
        },
        body: {
            type: String,
            default: null
        },
        _data: {
            type: Object,
            default: {}
        },
        id: {
            type: Object,
            default: {}
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
    },
    {
        versionKey: false, 
    }
);

repliedSchema.pre('save', async function save(next) {
    const repliedMessage = this;
    repliedMessage.createdAt = moment().toISOString();
    
    // Find the corresponding message and set its _id as parentId
    const message = await Message.findOne({ messageId: repliedMessage.messageId });
    if (message) {
        repliedMessage.parentId = message._id;
    }
    
    return next();
});

const RepliedMessage = mongoose.model('repliedlogs', repliedSchema);

module.exports = RepliedMessage;