const mongoose = require('mongoose');
const moment = require('moment');

const sessionSchema = mongoose.Schema(
    {
        session: {
            type: Object
        },
        sessionId: {
            type: String,
            required: true,
            default: null
        }
    },
    {
        versionKey: false,
    }
);

sessionSchema.pre('save', async function save(next) {
    const message = this;
    message.createdAt = moment().toISOString();
    return next();
});

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
