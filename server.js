const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const app = express();

const dataFile = path.join(__dirname, 'data.json');

// Helper to read/write JSON db
function readDB() {
    if (!fs.existsSync(dataFile)) return [];
    try {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        return JSON.parse(raw);
    } catch { return []; }
}

function writeDB(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// GET all assessments
app.get('/api/assessments', (req, res) => {
    res.json(readDB());
});
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static frontend files (index.html, script.js, styling)
app.use(express.static(__dirname));

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function prepareBase64File(dataUri) {
    if (!dataUri) return null;
    // Data URIs from FileReader look like: data:image/png;base64,iVBORw0KGgo...
    const matches = dataUri.match(/^data:(.+?);base64,(.+)$/);
    if (matches && matches.length === 3) {
        return {
            inlineData: {
                mimeType: matches[1],
                data: matches[2]
            }
        };
    }
    return null;
}

app.post('/api/grade', async (req, res) => {
    try {
        const { courseCode, assessmentName, studentName, enrollmentNo, totalMarks, totalQuestions, files } = req.body;
        
        if (!files || !files.questionPaper || !files.answerKey || !files.studentSheet) {
            return res.status(400).json({ error: "Missing required files." });
        }

        console.log(`Received grading request for ${courseCode || 'Unknown'}: ${assessmentName || 'Unknown'}`);

        const qpPart = prepareBase64File(files.questionPaper);
        const akPart = prepareBase64File(files.answerKey);
        const ssPart = prepareBase64File(files.studentSheet);

        if (!qpPart || !akPart || !ssPart) {
             return res.status(400).json({ error: "Invalid file format. Must be base64 data URIs." });
        }

        const jsonSchema = {
            type: "OBJECT",
            properties: {
                totalScore:    { type: "NUMBER" },
                maxTotalScore: { type: "NUMBER" },
                percentage:    { type: "NUMBER" },
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

CONTEXT FOR THIS GRADING SESSION:
- Student Name:      ${studentName || 'Unknown'}
- Enrollment Number: ${enrollmentNo || 'Unknown'}
- Course Code:       ${courseCode || 'Unknown'}
- Assessment:        ${assessmentName || 'Unknown'}
- Total Marks:       ${totalMarks || 'Determine from question paper'}
- Total Questions:   ${totalQuestions || 'Determine from question paper'}

GRADING RULES:
1. Read the Question Paper carefully to identify EACH question and its allocated marks (e.g., "Q1 (5 marks)"). If marks are not explicitly stated, distribute ${totalMarks || 'the total'} marks evenly across ${totalQuestions || 'all'} questions.
2. For EACH question, compare the student's answer strictly against the Model Answer Key.
3. Grade semantically — correct understanding with different wording is still correct. Rote copying without understanding is penalized.
4. Use Chain-of-Thought: first complete conceptAnalysis (what the ideal answer requires), then studentLogic (what the student actually wrote and where they went right/wrong), then assign marksAwarded.
5. marksAwarded MUST be between 0 and maxMarks for that question. Never award more than maxMarks.
6. For confidence: use "HIGH" if the handwriting/text is clear, "MEDIUM" if some parts are unclear, "LOW" if illegible or ambiguous.
7. Set needsReview=true if handwriting is very unclear, the answer is borderline, or you are uncertain within ±1 mark.
8. overallFeedback should be a single honest, encouraging sentence a teacher would write on a report card.
9. totalScore = sum of all marksAwarded. maxTotalScore = sum of all maxMarks. percentage = (totalScore/maxTotalScore)*100 rounded to 2 decimal places.`;


        const contentParts = [
            { text: `Grade this student's submission for the assessment: "${assessmentName || 'Assessment'}".` },
            { text: "QUESTION PAPER (read to identify all questions and their marks):" },
            qpPart,
            { text: "MODEL ANSWER KEY (use as the marking rubric — this defines what a correct answer looks like):" },
            akPart,
            { text: "STUDENT ANSWER SHEET (this is what must be graded — compare each answer against the key):" },
            ssPart
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: contentParts }],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: jsonSchema
            }
        });

        const resultText = response.text;
        const jsonResult = JSON.parse(resultText);
        
        const db = readDB();
        
        let color = 'gray';
        if (jsonResult.percentage >= 75) color = 'green';
        else if (jsonResult.percentage >= 50) color = 'blue';
        else color = 'yellow';

        const newAssessment = {
            id:            (courseCode || 'AI').toUpperCase().substring(0, 8),
            name:          assessmentName || 'Graded Assessment',
            studentName:   studentName    || 'Unknown Student',
            enrollmentNo:  enrollmentNo   || 'N/A',
            courseCode:    courseCode     || '',
            date:          new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            papers:        1,
            status:        'Graded',
            color:         color,
            result:        jsonResult
        };

        db.unshift(newAssessment);
        writeDB(db);

        res.json(newAssessment);

    } catch (error) {
        console.error("Error during AI grading:", error);
        res.status(500).json({ error: error.message || "Failed to process grading." });
    }
});

app.post('/api/generate', async (req, res) => {

    try {
        const { topic, difficulty } = req.body;
        if (!topic) return res.status(400).json({ error: "Missing topic." });
        
        const prompt = `You are SAGE, a highly intelligent Smart Assessment & Grading Engine used by university faculty. 
Your task is to generate a short, professional academic assessment about the topic: "${topic}". 
The difficulty level should be: ${difficulty || 'Moderate'}. 

Please format your response clearly into two sections:
1. QUESTION PAPER: Provide 3 well-thought-out questions (mix of conceptual and application).
2. MODEL ANSWER KEY: Provide a comprehensive grading rubric and model answer for each question to be used by the automated grading engine.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [prompt],
            config: {
                systemInstruction: "You are an academic assistant. Keep formatting clean using standard text spacing."
            }
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
