// v1 by divyanshu — Phase 4: Bulk Upload + Background Queue + Student Portal + AI Trends + Override
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const app = express();
const port = 3000;
const dataFile = path.join(__dirname, 'data.json');

// ──────────────────────────────────────────────
// DB Helpers
// ──────────────────────────────────────────────
function readDB() {
    if (!fs.existsSync(dataFile)) return [];
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); }
    catch { return []; }
}
function writeDB(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// ──────────────────────────────────────────────
// In-Memory Job Queue + SSE
// ──────────────────────────────────────────────
const jobQueue = [];
const jobs = new Map();
const sseClients = new Map();
let queueRunning = false;

function pushSSE(jobId, data) {
    const client = sseClients.get(jobId);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
        if (data.status === 'done' || data.status === 'error') {
            client.end();
            sseClients.delete(jobId);
        }
    }
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (jobQueue.length > 0) {
        const { jobId, payload } = jobQueue.shift();
        jobs.set(jobId, { status: 'processing' });
        pushSSE(jobId, { status: 'processing', jobId });
        try {
            const result = await runGrading(payload);
            jobs.set(jobId, { status: 'done', result });
            pushSSE(jobId, { status: 'done', jobId, result });
        } catch (err) {
            jobs.set(jobId, { status: 'error', error: err.message });
            pushSSE(jobId, { status: 'error', jobId, error: err.message });
        }
    }
    queueRunning = false;
}

// ──────────────────────────────────────────────
// Gemini Client + Grading Logic
// ──────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function prepareBase64File(dataUri) {
    if (!dataUri) return null;
    const matches = dataUri.match(/^data:(.+?);base64,(.+)$/);
    if (matches && matches.length === 3)
        return { inlineData: { mimeType: matches[1], data: matches[2] } };
    return null;
}

const GRADING_SCHEMA = {
    type: "OBJECT",
    properties: {
        totalScore: { type: "NUMBER" }, maxTotalScore: { type: "NUMBER" },
        percentage: { type: "NUMBER" }, overallFeedback: { type: "STRING" },
        questionResults: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    questionNumber: { type: "NUMBER" }, questionText: { type: "STRING" },
                    maxMarks: { type: "NUMBER" }, marksAwarded: { type: "NUMBER" },
                    conceptAnalysis: { type: "STRING" }, studentLogic: { type: "STRING" },
                    feedback: { type: "STRING" }, confidence: { type: "STRING" },
                    needsReview: { type: "BOOLEAN" }
                },
                required: ["questionNumber","maxMarks","marksAwarded","conceptAnalysis","studentLogic","feedback","confidence","needsReview"]
            }
        }
    },
    required: ["totalScore","maxTotalScore","percentage","overallFeedback","questionResults"]
};

async function runGrading(payload) {
    const { courseCode, assessmentName, studentName, enrollmentNo, totalMarks, totalQuestions, files } = payload;
    const qpPart = prepareBase64File(files.questionPaper);
    const akPart = prepareBase64File(files.answerKey);
    const ssPart = prepareBase64File(files.studentSheet);
    if (!qpPart || !akPart || !ssPart) throw new Error("Invalid file format.");

    const systemInstruction = `You are SAGE, a strict but fair academic grading assistant used by university faculty in India.
CONTEXT: Student: ${studentName||'Unknown'}, Enrollment: ${enrollmentNo||'Unknown'}, Course: ${courseCode||'Unknown'}, Assessment: ${assessmentName||'Unknown'}, Total Marks: ${totalMarks||'Determine'}, Questions: ${totalQuestions||'Determine'}
RULES: 1. Identify each question and its marks. 2. Compare against answer key semantically. 3. Use Chain-of-Thought. 4. marksAwarded 0–maxMarks. 5. needsReview=true if uncertain ±1 mark. 6. overallFeedback = one encouraging sentence. 7. totalScore=sum(marksAwarded), percentage=(totalScore/maxTotalScore)*100 rounded 2dp.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [
            { text: `Grade submission for "${assessmentName||'Assessment'}".` },
            { text: "QUESTION PAPER:" }, qpPart,
            { text: "MODEL ANSWER KEY:" }, akPart,
            { text: "STUDENT ANSWER SHEET:" }, ssPart
        ]}],
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: GRADING_SCHEMA }
    });

    const jsonResult = JSON.parse(response.text);
    const color = jsonResult.percentage >= 75 ? 'green' : jsonResult.percentage >= 50 ? 'blue' : 'yellow';

    const newAssessment = {
        id: (courseCode||'AI').toUpperCase().substring(0,8),
        name: assessmentName||'Graded Assessment',
        studentName: studentName||'Unknown Student',
        enrollmentNo: enrollmentNo||'N/A',
        courseCode: courseCode||'',
        date: new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}),
        papers: 1, status: 'Graded', color, result: jsonResult
    };

    const db = readDB();
    db.unshift(newAssessment);
    writeDB(db);
    return newAssessment;
}

// ──────────────────────────────────────────────
// Express Setup
// ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '200mb' }));  // Increased for ZIP uploads
app.use(express.static(__dirname));

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

// GET all assessments
app.get('/api/assessments', (req, res) => res.json(readDB()));

// GET student portal — filter by enrollment number
app.get('/api/student/:enrollmentNo', (req, res) => {
    const db = readDB();
    const results = db.filter(a => a.enrollmentNo && 
        a.enrollmentNo.toLowerCase() === req.params.enrollmentNo.toLowerCase());
    if (!results.length) return res.status(404).json({ error: 'No records found for this enrollment number.' });
    res.json(results);
});

// POST single grade job (queue)
app.post('/api/grade', async (req, res) => {
    const { files } = req.body;
    if (!files?.questionPaper || !files?.answerKey || !files?.studentSheet)
        return res.status(400).json({ error: "Missing required files." });

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
    jobs.set(jobId, { status: 'queued' });
    jobQueue.push({ jobId, payload: req.body });
    console.log(`[QUEUE] Single job enqueued: ${jobId}`);
    res.status(202).json({ jobId, status: 'queued' });
    processQueue();
});

// POST bulk grade — accepts ZIP + shared QP + AK
app.post('/api/grade/bulk', async (req, res) => {
    const { courseCode, assessmentName, totalMarks, totalQuestions, files } = req.body;
    if (!files?.questionPaper || !files?.answerKey || !files?.zipFile)
        return res.status(400).json({ error: "Missing ZIP, question paper, or answer key." });

    try {
        // Decode the ZIP from base64
        const zipBase64 = files.zipFile.replace(/^data:.+;base64,/, '');
        const zipBuffer = Buffer.from(zipBase64, 'base64');
        const zip = await JSZip.loadAsync(zipBuffer);

        const fileEntries = Object.values(zip.files).filter(f => 
            !f.dir && /\.(jpg|jpeg|png|pdf)$/i.test(f.name));

        if (!fileEntries.length)
            return res.status(400).json({ error: "No valid image/PDF files found in ZIP." });

        const jobIds = [];

        for (const entry of fileEntries) {
            const fileData = await entry.async('base64');
            const ext = path.extname(entry.name).toLowerCase();
            const mimeMap = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.pdf':'application/pdf' };
            const mimeType = mimeMap[ext] || 'image/jpeg';
            const dataUri = `data:${mimeType};base64,${fileData}`;

            // Extract student name/enrollment from filename (e.g. "John_Doe_CS501.jpg")
            const nameParts = path.basename(entry.name, ext).split('_');
            const studentName = nameParts.slice(0, -1).join(' ') || entry.name;
            const enrollmentNo = nameParts[nameParts.length - 1] || 'N/A';

            const jobId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
            jobs.set(jobId, { status: 'queued' });
            jobQueue.push({
                jobId,
                payload: {
                    courseCode, assessmentName, studentName, enrollmentNo,
                    totalMarks, totalQuestions,
                    files: { questionPaper: files.questionPaper, answerKey: files.answerKey, studentSheet: dataUri }
                }
            });
            jobIds.push({ jobId, fileName: entry.name, studentName, enrollmentNo });
        }

        console.log(`[BULK] Enqueued ${jobIds.length} jobs for ${assessmentName}`);
        res.status(202).json({ total: jobIds.length, jobs: jobIds });
        processQueue();

    } catch (err) {
        console.error('[BULK] Error processing ZIP:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET SSE stream for a single job
app.get('/api/grade/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const job = jobs.get(jobId);
    if (job && (job.status === 'done' || job.status === 'error')) {
        res.write(`data: ${JSON.stringify({ ...job, jobId })}\n\n`);
        return res.end();
    }

    sseClients.set(jobId, res);
    res.write(`data: ${JSON.stringify({ status: job?.status || 'queued', jobId })}\n\n`);
    req.on('close', () => sseClients.delete(jobId));
});

// POST AI assessment generation
app.post('/api/generate', async (req, res) => {
    try {
        const { topic, difficulty } = req.body;
        if (!topic) return res.status(400).json({ error: "Missing topic." });
        const prompt = `You are SAGE. Generate a professional academic assessment on: "${topic}" at difficulty: ${difficulty||'Moderate'}.
Format as:
1. QUESTION PAPER: 3 well-crafted questions.
2. MODEL ANSWER KEY: Comprehensive rubric and model answers.`;
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", contents: [prompt],
            config: { systemInstruction: "You are an academic assistant. Keep formatting clean." }
        });
        res.json({ generatedText: response.text });
    } catch (error) {
        res.status(500).json({ error: error.message || "Failed to generate." });
    }
});

// POST AI Trend Analysis — class-wide insights for a course
app.post('/api/analyse', async (req, res) => {
    try {
        const { courseCode } = req.body;
        const db = readDB();
        const courseData = courseCode
            ? db.filter(a => a.courseCode?.toLowerCase() === courseCode.toLowerCase())
            : db;

        if (courseData.length < 2)
            return res.status(400).json({ error: "Need at least 2 graded assessments to analyse." });

        // Build summary for Gemini
        const summaryLines = courseData.map(a => {
            const qs = (a.result?.questionResults || []).map(q =>
                `Q${q.questionNumber}: ${q.marksAwarded}/${q.maxMarks}`).join(', ');
            return `Student: ${a.studentName} (${a.enrollmentNo}) — Total: ${a.result?.percentage?.toFixed(1)}% — ${qs}`;
        }).join('\n');

        const prompt = `You are SAGE, an academic analytics engine. Analyse the following class grading data for course "${courseCode||'All Courses'}":

${summaryLines}

Provide a structured class-wide insight report including:
1. Overall class performance summary
2. Questions that were most difficult (low average marks) — explain why students likely struggled
3. Questions that were easiest — confirm understanding
4. Specific teaching recommendations for the professor
5. Any patterns in student errors worth noting

Be direct, specific, and actionable. Format with clear sections.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', contents: [prompt],
            config: { systemInstruction: "You are an expert educational data analyst." }
        });
        res.json({ insights: response.text, studentsAnalysed: courseData.length });
    } catch (error) {
        res.status(500).json({ error: error.message || "Failed to analyse." });
    }
});

// PATCH override a specific question's marks
app.patch('/api/assessments/:index/override', (req, res) => {
    try {
        const idx = parseInt(req.params.index);
        const { questionNumber, newMarks, note, reviewerName } = req.body;
        const db = readDB();
        if (idx < 0 || idx >= db.length) return res.status(404).json({ error: "Assessment not found." });

        const assessment = db[idx];
        const question = assessment.result?.questionResults?.find(q => q.questionNumber === questionNumber);
        if (!question) return res.status(404).json({ error: "Question not found." });

        const originalMarks = question.marksAwarded;
        question.override = {
            originalMarks,
            newMarks,
            note: note || '',
            reviewerName: reviewerName || 'Faculty',
            overriddenAt: new Date().toISOString()
        };
        question.marksAwarded = newMarks;

        // Recalculate totals
        const qResults = assessment.result.questionResults;
        const totalScore = qResults.reduce((s, q) => s + (q.marksAwarded || 0), 0);
        const maxTotalScore = qResults.reduce((s, q) => s + (q.maxMarks || 0), 0);
        assessment.result.totalScore = totalScore;
        assessment.result.percentage = parseFloat(((totalScore / maxTotalScore) * 100).toFixed(2));
        assessment.color = assessment.result.percentage >= 75 ? 'green' : assessment.result.percentage >= 50 ? 'blue' : 'yellow';

        writeDB(db);
        res.json({ success: true, updatedAssessment: assessment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`SAGE backend running on http://localhost:${port}`);
});
