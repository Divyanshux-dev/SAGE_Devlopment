const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
    id: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    studentName: String,
    enrollmentNo: String,
    courseCode: String,
    date: String,
    papers: Number,
    status: String,
    color: String,
    result: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Assessment', assessmentSchema);
