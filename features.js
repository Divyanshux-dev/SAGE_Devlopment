// ══════════════════════════════════════════════
// SAGE Phase 4-7 Feature Extensions
// Login tabs, Student Portal, Bulk Upload,
// OCR, Course Templates, CSV Export,
// AI Trend Analysis, Override Notes
// ══════════════════════════════════════════════

// ─── LOGIN TAB SWITCH ─────────────────────────
function switchLoginTab(tab) {
    const isFaculty = tab === 'faculty';
    document.getElementById('panel-faculty').classList.toggle('hidden', !isFaculty);
    document.getElementById('panel-student').classList.toggle('hidden', isFaculty);
    document.getElementById('tab-faculty').className = `flex-1 py-3 text-sm font-black transition-all border-b-2 ${isFaculty ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent'}`;
    document.getElementById('tab-student').className  = `flex-1 py-3 text-sm font-black transition-all border-b-2 ${!isFaculty ? 'text-emerald-600 border-emerald-600' : 'text-slate-400 border-transparent'}`;
}

// ─── STUDENT PORTAL ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sf = document.getElementById('student-login-form');
    if (sf) sf.addEventListener('submit', async function(e) {
        e.preventDefault();
        const enroll = document.getElementById('student-enrollment').value.trim();
        if (!enroll) return;
        const btn = this.querySelector('button[type="submit"]');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Searching...';
        try {
            const res = await fetch(`http://localhost:3000/api/student/${encodeURIComponent(enroll)}`);
            const data = await res.json();
            if (!res.ok) { document.getElementById('student-error').classList.remove('hidden'); btn.innerHTML = orig; return; }
            document.getElementById('student-error').classList.add('hidden');
            btn.innerHTML = orig;
            showStudentPortalView(data, enroll);
        } catch { document.getElementById('student-error').classList.remove('hidden'); btn.innerHTML = orig; }
    });
});

function showStudentPortalView(results, enroll) {
    let existing = document.getElementById('view-student-portal');
    if (existing) existing.remove();
    const view = document.createElement('div');
    view.id = 'view-student-portal';
    view.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#f8fafc;overflow-y:auto;padding:32px;';
    view.innerHTML = `
        <div class="max-w-3xl mx-auto">
            <div class="flex items-center justify-between mb-8">
                <div><h1 class="text-2xl font-black text-slate-900">My Results</h1>
                <p class="text-sm font-bold text-slate-500">Enrollment: ${enroll}</p></div>
                <button onclick="document.getElementById('view-student-portal').remove();" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-sm font-black transition-colors">← Back</button>
            </div>
            ${results.map(a => `
            <div class="bg-white rounded-2xl border border-slate-200 p-6 mb-4 shadow-sm">
                <div class="flex items-start justify-between mb-4">
                    <div><p class="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">${a.courseCode||'N/A'} · ${a.date}</p>
                    <h2 class="text-lg font-black text-slate-900">${a.name}</h2></div>
                    <div class="text-right">
                        <p class="text-3xl font-black ${(a.result?.percentage||0)>=75?'text-emerald-600':(a.result?.percentage||0)>=50?'text-blue-600':'text-amber-600'}">${(a.result?.percentage||0).toFixed(1)}%</p>
                        <p class="text-xs font-bold text-slate-400">${a.result?.totalScore||0} / ${a.result?.maxTotalScore||0}</p>
                    </div>
                </div>
                <p class="text-sm font-medium text-slate-600 mb-4 italic">"${a.result?.overallFeedback||''}"</p>
                <div class="space-y-2">${(a.result?.questionResults||[]).map(q => `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div class="flex justify-between mb-1">
                        <span class="text-xs font-black text-slate-700">Q${q.questionNumber}</span>
                        <span class="text-xs font-black ${q.marksAwarded>=q.maxMarks?'text-emerald-600':'text-blue-600'}">${q.marksAwarded}/${q.maxMarks}</span>
                    </div>
                    <p class="text-xs text-slate-600">${q.feedback}</p>
                    ${q.override ? `<p class="text-xs text-amber-600 font-bold mt-1">⚠ Overridden by ${q.override.reviewerName}: ${q.override.note}</p>` : ''}
                </div>`).join('')}</div>
            </div>`).join('')}
        </div>`;
    document.body.appendChild(view);
}

// ─── BULK FILE UPLOAD HANDLERS ─────────────────
const bulkFiles = { qp: null, ak: null, zip: null };

document.addEventListener('DOMContentLoaded', () => {
    [['qp','bulk-file-qp'],['ak','bulk-file-ak'],['zip','bulk-file-zip']].forEach(([key, inputId]) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('change', function() {
            if (!this.files[0]) return;
            bulkFiles[key] = this.files[0];
            document.getElementById(`bulk-display-${key}`)?.classList.remove('hidden');
            const nameEl = document.getElementById(`bulk-name-${key}`);
            if (nameEl) nameEl.innerText = this.files[0].name;
        });
        document.getElementById(`bulk-remove-${key}`)?.addEventListener('click', () => {
            bulkFiles[key] = null; input.value = '';
            document.getElementById(`bulk-display-${key}`)?.classList.add('hidden');
        });
    });
});

async function submitBulkGrading() {
    if (!bulkFiles.qp || !bulkFiles.ak || !bulkFiles.zip) {
        alert('Upload Question Paper, Answer Key, and a ZIP of student sheets first.'); return;
    }
    const courseCode     = document.getElementById('course-code')?.value.trim() || '';
    const assessmentName = document.getElementById('assessment-name')?.value.trim() || 'Bulk Assessment';
    const totalMarks     = parseInt(document.getElementById('total-marks')?.value) || 0;
    const totalQuestions = parseInt(document.getElementById('total-questions')?.value) || 0;

    const btn = document.getElementById('btn-bulk-submit');
    if (btn) { btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg"></i> Processing ZIP...'; btn.disabled = true; }

    const [qpB64, akB64, zipB64] = await Promise.all([
        fileToBase64(bulkFiles.qp), fileToBase64(bulkFiles.ak), fileToBase64(bulkFiles.zip)
    ]);

    try {
        const res = await fetch('http://localhost:3000/api/grade/bulk', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseCode, assessmentName, totalMarks, totalQuestions,
                files: { questionPaper: qpB64, answerKey: akB64, zipFile: zipB64 } })
        });
        const data = await res.json();
        if (!res.ok) { alert('Bulk error: ' + data.error); if(btn){btn.innerHTML='<i class="ph ph-play-circle-fill text-lg"></i> Start Bulk Grading';btn.disabled=false;} return; }
        if (btn) btn.innerHTML = `<i class="ph ph-check-circle-fill text-lg"></i> ${data.total} Jobs Queued`;
        startBulkProgressBoard(data.jobs);
    } catch(err) { alert('Network error: ' + err.message); if(btn){btn.innerHTML='<i class="ph ph-play-circle-fill text-lg"></i> Start Bulk Grading';btn.disabled=false;} }
}

function startBulkProgressBoard(jobs) {
    const board   = document.getElementById('bulk-progress-board');
    const jobList = document.getElementById('bulk-job-list');
    if (!board || !jobList) return;
    board.classList.remove('hidden');
    let done = 0; const total = jobs.length;

    jobList.innerHTML = jobs.map(j =>
        `<div id="bj-${j.jobId}" class="flex items-center gap-2 text-slate-400 font-mono">
           <i class="ph ph-clock"></i>
           <span class="truncate flex-1">${j.studentName} (${j.enrollmentNo})</span>
           <span class="ml-auto font-black" id="bjs-${j.jobId}">Queued</span>
         </div>`).join('');
    document.getElementById('bulk-counter').innerText = `0 / ${total} graded`;

    jobs.forEach(j => {
        const evt = new EventSource(`http://localhost:3000/api/grade/status/${j.jobId}`);
        evt.onmessage = function(e) {
            const data = JSON.parse(e.data);
            const statusEl = document.getElementById(`bjs-${j.jobId}`);
            const rowEl    = document.getElementById(`bj-${j.jobId}`);
            if (data.status === 'processing') { if(statusEl) statusEl.innerText = 'Grading…'; }
            else if (data.status === 'done') {
                evt.close(); done++;
                const pct = data.result?.result?.percentage?.toFixed(1) || '?';
                if (rowEl) rowEl.innerHTML = `<i class="ph ph-check-circle-fill" style="color:#10b981"></i><span class="truncate flex-1" style="color:#10b981">${j.studentName}</span><span class="font-black" style="color:#10b981">${pct}%</span>`;
                recentAssessments.unshift(data.result);
                document.getElementById('bulk-counter').innerText = `${done} / ${total} graded`;
                document.getElementById('bulk-progress-bar').style.width = `${(done/total)*100}%`;
                if (done === total) { document.getElementById('bulk-counter').innerText = `All ${total} graded ✅`; if(typeof populateTable==='function') populateTable(); }
            } else if (data.status === 'error') {
                evt.close(); done++;
                if (rowEl) rowEl.innerHTML = `<i class="ph ph-x-circle" style="color:#ef4444"></i><span class="flex-1" style="color:#ef4444">${j.studentName}</span><span style="color:#ef4444">Error</span>`;
                document.getElementById('bulk-counter').innerText = `${done} / ${total}`;
                document.getElementById('bulk-progress-bar').style.width = `${(done/total)*100}%`;
            }
        };
        evt.onerror = () => evt.close();
    });
}

// ─── OCR PRE-PROCESSING ────────────────────────
function initOCR() {
    // Try to find the student sheet dropzone input
    const targets = ['file-ss', 'input-ss'];
    let ssInput = null;
    for (const id of targets) { const el = document.getElementById(id); if (el) { ssInput = el; break; } }
    if (!ssInput) {
        // Try to find by scanning dropzone
        const dz = document.getElementById('dropzone-ss');
        if (dz) ssInput = dz.querySelector('input[type="file"]');
    }
    if (!ssInput) return;

    ssInput.addEventListener('change', async function() {
        if (!this.files || !this.files[0]) return;
        const file = this.files[0];
        if (!file.type.startsWith('image/')) return;
        const objectUrl = URL.createObjectURL(file);
        const preview = document.getElementById('ocr-image-preview');
        const panel   = document.getElementById('ocr-panel');
        const status  = document.getElementById('ocr-status');
        const output  = document.getElementById('ocr-text-output');
        if (!panel) return;
        if (preview) preview.src = objectUrl;
        panel.classList.remove('hidden');
        if (status) status.innerHTML = '<i class="ph ph-circle-notch animate-spin"></i> Scanning…';
        if (output) output.value = '';
        try {
            const result = await Tesseract.recognize(file, 'eng', {
                logger: m => { if (m.status === 'recognizing text' && status) { status.innerHTML = `<i class="ph ph-circle-notch animate-spin"></i> ${Math.round(m.progress*100)}%`; } }
            });
            if (output) output.value = result.data.text;
            if (status) status.innerHTML = '<i class="ph ph-check-circle-fill" style="color:#10b981"></i> Done';
        } catch { if (status) status.innerHTML = '<i class="ph ph-warning"></i> OCR failed'; }
    });
}
document.addEventListener('DOMContentLoaded', initOCR);

// ─── COURSE TEMPLATES ──────────────────────────
function loadTemplates() {
    const el = document.getElementById('templates-list');
    if (!el) return;
    const templates = JSON.parse(localStorage.getItem('sage_templates') || '[]');
    if (!templates.length) {
        el.innerHTML = '<p class="text-xs text-slate-400 font-medium italic">No saved templates yet. Fill the form below and click "Save Current".</p>'; return;
    }
    el.innerHTML = templates.map((t, i) => `
        <div class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <button onclick="applyTemplate(${i})" class="text-xs font-black text-amber-800 hover:text-amber-600 transition-colors flex items-center gap-1">
                <i class="ph ph-bookmark-simple-fill"></i> ${t.name}
            </button>
            <button onclick="deleteTemplate(${i})" class="text-xs text-slate-400 hover:text-red-500 transition-colors ml-1"><i class="ph ph-x"></i></button>
        </div>`).join('');
}

function saveCurrentAsTemplate() {
    const courseCode     = document.getElementById('course-code')?.value.trim();
    const assessmentName = document.getElementById('assessment-name')?.value.trim() || '';
    const totalMarks     = document.getElementById('total-marks')?.value || '';
    const totalQuestions = document.getElementById('total-questions')?.value || '';
    if (!courseCode) { alert('Fill in at least the Course Code to save a template.'); return; }
    const name = `${courseCode}${assessmentName ? ' – '+assessmentName : ''}`;
    const templates = JSON.parse(localStorage.getItem('sage_templates') || '[]');
    templates.unshift({ name, courseCode, assessmentName, totalMarks, totalQuestions });
    localStorage.setItem('sage_templates', JSON.stringify(templates));
    loadTemplates();
}

function applyTemplate(i) {
    const templates = JSON.parse(localStorage.getItem('sage_templates') || '[]');
    const t = templates[i]; if (!t) return;
    if (document.getElementById('course-code'))     document.getElementById('course-code').value = t.courseCode;
    if (document.getElementById('assessment-name')) document.getElementById('assessment-name').value = t.assessmentName;
    if (document.getElementById('total-marks'))     document.getElementById('total-marks').value = t.totalMarks;
    if (document.getElementById('total-questions')) document.getElementById('total-questions').value = t.totalQuestions;
}

function deleteTemplate(i) {
    const templates = JSON.parse(localStorage.getItem('sage_templates') || '[]');
    templates.splice(i, 1);
    localStorage.setItem('sage_templates', JSON.stringify(templates));
    loadTemplates();
}

document.addEventListener('DOMContentLoaded', loadTemplates);

// ─── CSV EXPORT ────────────────────────────────
function exportToCSV() {
    if (!recentAssessments.length) { alert('No graded assessments to export yet.'); return; }
    const grade = p => p >= 90 ? 'A+' : p >= 80 ? 'A' : p >= 70 ? 'B+' : p >= 60 ? 'B' : p >= 50 ? 'C' : 'F';
    const header = ['Student Name','Enrollment No','Course Code','Assessment','Score','Max Score','Percentage','Grade','Date'];
    const rows = recentAssessments.map(a => [
        `"${(a.studentName||'').replace(/"/g,"'")}"`,
        `"${a.enrollmentNo||''}"`,
        `"${a.courseCode||''}"`,
        `"${(a.name||'').replace(/"/g,"'")}"`,
        a.result?.totalScore ?? 0,
        a.result?.maxTotalScore ?? 0,
        ((a.result?.percentage)||0).toFixed(2),
        grade(a.result?.percentage||0),
        `"${a.date||''}"`
    ]);
    const csv  = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `SAGE_Grades_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── AI TREND ANALYSIS ─────────────────────────
async function runAITrendAnalysis() {
    const courseCode = document.getElementById('an-course-filter')?.value?.trim() || '';
    const btn = document.getElementById('btn-ai-trends');
    if (btn) { btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Analysing...'; btn.disabled = true; }
    try {
        const res = await fetch('http://localhost:3000/api/analyse', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseCode })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); } else { showInsightsModal(data.insights, data.studentsAnalysed, courseCode); }
    } catch(err) { alert('Error: ' + err.message); }
    if (btn) { btn.innerHTML = '<i class="ph ph-sparkle-fill"></i> Run AI Trend Analysis'; btn.disabled = false; }
}

function showInsightsModal(text, count, courseCode) {
    let modal = document.getElementById('ai-insights-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'ai-insights-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:24px;';
    const safeText = text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    modal.innerHTML = `
        <div style="background:#fff;border-radius:24px;max-width:760px;width:100%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 120px rgba(0,0,0,0.3);">
            <div style="padding:24px 28px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <p style="font-size:10px;font-weight:900;color:#3b82f6;text-transform:uppercase;letter-spacing:.15em;margin-bottom:4px;">SAGE AI Insights</p>
                    <h2 style="font-size:18px;font-weight:900;color:#0f172a;">${courseCode?'Course: '+courseCode:'All Courses'} — ${count} Students</h2>
                </div>
                <button onclick="document.getElementById('ai-insights-modal').remove()" style="width:36px;height:36px;border-radius:10px;background:#f1f5f9;border:none;cursor:pointer;font-size:18px;">✕</button>
            </div>
            <div style="padding:24px 28px;overflow-y:auto;flex:1;font-size:14px;font-family:Inter,sans-serif;line-height:1.8;color:#334155;">${safeText}</div>
            <div style="padding:16px 28px;border-top:1px solid #e2e8f0;display:flex;gap:12px;">
                <button onclick="window.print()" style="background:#3b82f6;color:#fff;border:none;border-radius:12px;padding:10px 20px;font-size:12px;font-weight:900;cursor:pointer;">Print Report</button>
                <button onclick="document.getElementById('ai-insights-modal').remove()" style="background:#f1f5f9;color:#475569;border:none;border-radius:12px;padding:10px 20px;font-size:12px;font-weight:900;cursor:pointer;">Close</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ─── QUESTION OVERRIDE ─────────────────────────
function showOverridePanel(assessmentIndex, questionNumber, currentMarks, maxMarks) {
    const panelId = `override-panel-${assessmentIndex}-${questionNumber}`;
    const existing = document.getElementById(panelId);
    if (existing) { existing.classList.toggle('hidden'); return; }
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl';
    panel.innerHTML = `
        <p class="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Override Q${questionNumber}</p>
        <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-2">
                <label class="text-xs font-bold text-slate-600">New Marks (max ${maxMarks}):</label>
                <input id="override-marks-${assessmentIndex}-${questionNumber}" type="number" min="0" max="${maxMarks}" step="0.5" value="${currentMarks}" class="w-20 px-2 py-1 border border-amber-300 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-amber-400">
            </div>
            <div class="flex items-center gap-2 flex-1">
                <label class="text-xs font-bold text-slate-600">Note:</label>
                <input id="override-note-${assessmentIndex}-${questionNumber}" type="text" placeholder="Reason for override..." class="flex-1 px-3 py-1 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400">
            </div>
            <button onclick="submitOverride(${assessmentIndex},${questionNumber})" class="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl transition-colors">Apply</button>
            <button onclick="document.getElementById('${panelId}').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xs font-bold">Cancel</button>
        </div>`;
    const card = document.getElementById(`q-card-${assessmentIndex}-${questionNumber}`);
    if (card) card.appendChild(panel);
}

async function submitOverride(assessmentIndex, questionNumber) {
    const newMarks = parseFloat(document.getElementById(`override-marks-${assessmentIndex}-${questionNumber}`)?.value);
    const note     = document.getElementById(`override-note-${assessmentIndex}-${questionNumber}`)?.value.trim() || '';
    if (isNaN(newMarks)) { alert('Enter valid marks.'); return; }
    try {
        const res = await fetch(`http://localhost:3000/api/assessments/${assessmentIndex}/override`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionNumber, newMarks, note, reviewerName: 'Dr. Faculty' })
        });
        const data = await res.json();
        if (!res.ok) { alert('Override failed: ' + data.error); return; }
        recentAssessments[assessmentIndex] = data.updatedAssessment;
        const a = data.updatedAssessment;
        if (typeof renderResults === 'function') renderResults(a.result, a.name, a.studentName, a.enrollmentNo, a.courseCode);
        alert(`Override applied! New total: ${data.updatedAssessment.result.totalScore}/${data.updatedAssessment.result.maxTotalScore} (${data.updatedAssessment.result.percentage}%)`);
    } catch(err) { alert('Network error: ' + err.message); }
}
