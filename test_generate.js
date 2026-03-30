fetch('http://localhost:3000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ topic: "Basic Algebra", difficulty: "Easy" })
}).then(res => res.json()).then(data => {
  console.log("SUCCESS length:", data.generatedText.length);
}).catch(err => {
  console.error("FAIL:", err);
});
