const [qpBase64, akBase64, ssBase64] = [
  "data:image/png;base64,iVBORw0KGgo==",
  "data:image/png;base64,iVBORw0KGgo==",
  "data:image/png;base64,iVBORw0KGgo=="
];

const payload = {
  courseCode: "TEST101",
  assessmentName: "Unit Test",
  files: {
    questionPaper: qpBase64,
    answerKey: akBase64,
    studentSheet: ssBase64
  }
};

fetch('http://localhost:3000/api/grade', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}).then(res => res.json()).then(data => {
  console.log("SUCCESS:", JSON.stringify(data, null, 2));
}).catch(err => {
  console.error("FAIL:", err);
});
