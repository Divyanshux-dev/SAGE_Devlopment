/**
 * SAGE E2E Test - verifies full grading pipeline
 * Uses real text files (Gemini can read text/plain as inline data)
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  
  let errors = [];
  let logs = [];
  page.on('console', msg => { logs.push(msg.text()); process.stdout.write('LOG: ' + msg.text() + '\n'); });
  page.on('pageerror', error => { errors.push(error.message); process.stderr.write('ERR: ' + error.message + '\n'); });

  console.log('-- Opening SAGE at localhost:3000 --');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 10000 });

  // Bypass login
  await page.evaluate(() => {
    showView('main');
    navigate('dashboard');
    populateTable();
  });
  await new Promise(r => setTimeout(r, 500));

  // Go to create
  await page.evaluate(() => navigate('create'));
  await new Promise(r => setTimeout(r, 500));

  // Fill form
  await page.type('#course-code', 'CS101');
  await page.type('#assessment-name', 'Python Midterm Test');

  // Inject files via JS (simulating file upload)
  await page.evaluate(() => {
    const makeFile = (content, name, type) => new File([content], name, { type });
    uploadedFiles.qp = makeFile(
      'Q1. What is polymorphism in OOP? (5 marks)\nQ2. Explain the difference between a list and a tuple in Python. (5 marks)\nQ3. What is a decorator in Python? (5 marks)',
      'question_paper.txt', 'text/plain'
    );
    uploadedFiles.ak = makeFile(
      'A1. Polymorphism allows objects of different classes to be treated as a single type. It enables method overriding and duck typing. (5 marks)\nA2. Lists are mutable, tuples are immutable. Lists use [], tuples use (). (5 marks)\nA3. A decorator is a function that wraps another function, modifying its behaviour. Used with @ syntax. (5 marks)',
      'answer_key.txt', 'text/plain'
    );
    uploadedFiles.ss = makeFile(
      'Q1 Answer: Polymorphism means many forms. A function can work differently based on the object it is called on.\nQ2 Answer: Lists can be changed after creation but tuples cannot. Lists use square brackets.\nQ3 Answer: Decorators add extra functionality to a function without changing its code, using the @ symbol.',
      'student_sheet.txt', 'text/plain'
    );
    // Update UI to reflect upload
    ['qp','ak','ss'].forEach(key => {
      document.getElementById(`name-${key}`).textContent = uploadedFiles[key].name;
      document.getElementById(`display-${key}`).classList.remove('hidden');
      document.getElementById(`display-${key}`).classList.add('inline-flex');
    });
    console.log('Files injected OK');
  });

  await new Promise(r => setTimeout(r, 500));
  
  // Screenshot before submit
  await page.screenshot({ path: path.join(__dirname, 'before_submit.png') });
  console.log('Screenshot saved: before_submit.png');

  // Submit
  console.log('-- Clicking Grade with SAGE AI --');
  await page.click('#create-assessment-form button[type="submit"]');
  
  // Wait up to 60s for navigation to results view
  console.log('-- Waiting for results (up to 60s)... --');
  let elapsed = 0;
  while (elapsed < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    elapsed += 2000;
    const currentView = await page.evaluate(() => {
      const r = document.getElementById('content-results');
      return r && !r.classList.contains('hidden') ? 'RESULTS_VISIBLE' : 'NOT_YET';
    });
    const btnText = await page.evaluate(() => {
      const btn = document.querySelector('#create-assessment-form button[type="submit"]');
      return btn ? btn.innerText : 'NOT_FOUND';
    });
    console.log(`[${elapsed/1000}s] Status: ${currentView} | Button: "${btnText}"`);
    if (currentView === 'RESULTS_VISIBLE') {
      console.log('SUCCESS - Results view is visible!');
      break;
    }
  }

  // Final screenshot
  await page.screenshot({ path: path.join(__dirname, 'final_state.png') });
  console.log('Screenshot saved: final_state.png');

  // Print any page errors
  if (errors.length) console.error('PAGE ERRORS:', errors);
  
  await browser.close();
  console.log('-- Test complete --');
})();
