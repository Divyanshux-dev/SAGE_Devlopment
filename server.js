// v1 by divyanshu
// Phase 2: In-memory background grading queue with SSE push notifications
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const dataFile = path.join(__dirname, 'data.json');

// ──────────────────────────────────────────────
// Simple In-Memory Job Queue
// ──────────────────────────────────────────────
const jobQueue = [];        // pending jobs
const jobs = new Map();     // jobId → { status, result, error }
const sseClients = new Map(); // jobId → res (SSE stream)

let queueRunning = false;

function readDB() {
    if (!fs.existsSync(dataFile)) return [];
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); }
    catch { return []; }
}

function writeDB(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

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
        const job = jobQueue.shift();
        const { jobId, payload } = job;

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
// Gemini Grading Logic (Extracted Worker Function)
// ──────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function prepareBase64File(dataUri) {
    if (!dataUri) return null;
    const matches = dataUri.match(/^data:(.+?);base64,(.+)$/);
    if (matches && matches.length === 3) {
        return { inlineData: { mimeType: matches[1], data: matches[2] } };
    }
    return null;
}

async function runGrading(payload) {
    const { courseCode, assessmentName, studentName, enrollmentNo, totalMarks, totalQuestions, files } = payload;

    const qpPart = prepareBase64File(files.questionPaper);
    const akPart = prepareBase64File(files.answerKey);
    const ssPart = prepareBase64File(files.studentSheet);

    if (!qpPart || !akPart || !ssPart) throw new Error("Invalid file format.");

    const jsonSchema = {
        type: "OBJECT",
        properties: {
            totalScore:      { type: "NUMBER" },
            maxTotalScore:   { type: "NUMBER" },
            percentage:      { type: "NUMBER" },
            overallFeedback: { type: "STRING" },
            questionResults: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        questionNumber:  { type: "NUMBER" },
                        questionText:    { type: "STRING" },
                        maxMarks:        { type: "NUMBER" },
                        marksAwarded:    { type: "NUMBER" },
                        conceptAnalysis: { type: "STRING" },
                        studentLogic:    { type: "STRING" },
                        feedback:        { type: "STRING" },
                        confidence:      { type: "STRING" },
                        needsReview:     { type: "BOOLEAN" }
                    },
                    required: ["questionNumber", "maxMarks", "marksAwarded", "conceptAnalysis", "studentLogic", "feedback", "confidence", "needsReview"]
                }
            }
        },
        required: ["totalScore", "maxTotalScore", "percentage", "overallFeedback", "questionResults"]
    };

    const systemInstruction = `You are SAGE, a strict but fair academic grading assistant used by university faculty in India.
CONTEXT:
- Student: ${studentName || 'Unknown'}, Enrollment: ${enrollmentNo || 'Unknown'}
- Course: ${courseCode || 'Unknown'}, Assessment: ${assessmentName || 'Unknown'}
- Total Marks: ${totalMarks || 'Determine from paper'}, Questions: ${totalQuestions || 'Determine from paper'}
RULES: Grade semantically. Use chain-of-thought. marksAwarded must be 0–maxMarks. Set needsReview=true if uncertain ±1 mark.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [
            { text: `Grade submission for: "${assessmentName || 'Assessment'}"` },
            { text: "QUESTION PAPER:" }, qpPart,
            { text: "MODEL ANSWER KEY:" }, akPart,
            { text: "STUDENT ANSWER SHEET:" }, ssPart
        ]}],
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: jsonSchema }
    });

    const jsonResult = JSON.parse(response.text);
    let color = jsonResult.percentage >= 75 ? 'green' : jsonResult.percentage >= 50 ? 'blue' : 'yellow';

    const newAssessment = {
        id:           (courseCode || 'AI').toUpperCase().substring(0, 8),
        name:         assessmentName || 'Graded Assessment',
        studentName:  studentName    || 'Unknown Student',
        enrollmentNo: enrollmentNo   || 'N/A',
        courseCode:   courseCode     || '',
        date:         new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        papers:       1,
        status:       'Graded',
        color,
        result:       jsonResult
    };

    const db = readDB();
    db.unshift(newAssessment);
    writeDB(db);
    return newAssessment;
}

// ──────────────────────────────────────────────
// Express Middleware & Static
// ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────
app.get('/api/assessments', (req, res) => {
    res.json(readDB());
});

// New: Submit a grading job — returns immediately with a jobId
app.post('/api/grade', async (req, res) => {
    const { courseCode, assessmentName, studentName, enrollmentNo, totalMarks, totalQuestions, files } = req.body;

    if (!files || !files.questionPaper || !files.answerKey || !files.studentSheet) {
        return res.status(400).json({ error: "Missing required files." });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    jobs.set(jobId, { status: 'queued' });
    jobQueue.push({ jobId, payload: req.body });

    console.log(`[QUEUE] Enqueued job ${jobId} for ${studentName}`);
    res.status(202).json({ jobId, status: 'queued' });

    // Kick off the queue processor (non-blocking)
    processQueue();
});

// New: SSE stream — browser connects here to get live job status
app.get('/api/grade/status/:jobId', (req, res) => {
    const { jobId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // If job already finished, send immediately
    const job = jobs.get(jobId);
    if (job && (job.status === 'done' || job.status === 'error')) {
        res.write(`data: ${JSON.stringify({ ...job, jobId })}\n\n`);
        res.end();
        return;
    }

    // Register SSE client and wait
    sseClients.set(jobId, res);
    res.write(`data: ${JSON.stringify({ status: job?.status || 'queued', jobId })}\n\n`);

    req.on('close', () => {
        sseClients.delete(jobId);
    });
});

app.post('/api/generate', async (req, res) => {
    try {
        const { topic, difficulty } = req.body;
        if (!topic) return res.status(400).json({ error: "Missing topic." });

        const prompt = `You are SAGE. Generate a professional academic assessment on: "${topic}" at difficulty: ${difficulty || 'Moderate'}.
Format clearly into:
1. QUESTION PAPER: 3 well-crafted questions.
2. MODEL ANSWER KEY: Comprehensive rubric and model answers for each.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [prompt],
            config: { systemInstruction: "You are an academic assistant. Keep formatting clean." }
        });

        res.json({ generatedText: response.text });
    } catch (error) {
        console.error("Error during AI generation:", error);
        res.status(500).json({ error: error.message || "Failed to generate assessment." });
    }
});

app.listen(port, () => {
    console.log(`SAGE backend running on http://localhost:${port}`);
});
