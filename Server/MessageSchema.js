const mongoose = require('mongoose');
const moment = require('moment');

const messageSchema = mongoose.Schema(
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
        }
    },
    {
        versionKey: false, 
    }
);

messageSchema.pre('save', async function save(next) {
    const message = this;
    message.createdAt = moment().toISOString();
    return next();
});

const MessageLog = mongoose.model('messagelogs', messageSchema);

module.exports = MessageLog;
