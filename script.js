let recentAssessments = [];

function getStatusBadge(status, color) {
    const colors = {
        green:  'bg-emerald-100 text-emerald-800 border border-emerald-200',
        blue:   'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse',
        gray:   'bg-slate-100 text-slate-800 border border-slate-200',
        yellow: 'bg-amber-100 text-amber-800 border border-amber-200'
    };
    return `<span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${colors[color] || colors.gray}">${status}</span>`;
}

async function loadAssessments() {
    try {
        const res = await fetch('http://localhost:3000/api/assessments');
        if (res.ok) {
            recentAssessments = await res.json();
            populateTable();
        }
    } catch(e) { console.error("Could not load assessments"); }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadAssessments();
    const isLoggedIn = localStorage.getItem('sage_session_active');
    if (isLoggedIn === 'true') {
        showView('main');
        navigate('dashboard');
    } else {
        showView('login');
    }

    const now = new Date();
    document.getElementById('last-login-date').innerText = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
});

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if(email && password) {
        document.getElementById('login-error').classList.add('hidden');
        localStorage.setItem('sage_session_active', 'true');
        
        const btn = this.querySelector('button');
        const origText = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Authenticating...`;
        
        setTimeout(() => {
            btn.innerHTML = origText;
            this.reset();
            showView('main');
            navigate('dashboard');
            populateTable();
        }, 600);
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

function showView(viewId) {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-main').classList.add('hidden');
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
}

function navigate(page) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-academic-700', 'text-white');
        el.classList.add('text-gray-300');
    });
    
    document.getElementById(`content-${page}`).classList.remove('hidden');
    const activeNav = document.getElementById(`nav-${page}`);
    if(activeNav) {
        activeNav.classList.remove('text-gray-300');
        activeNav.classList.add('bg-academic-700', 'text-white');
    }
    
    document.getElementById('page-title').innerText = page.charAt(0).toUpperCase() + page.slice(1);

    closeMobileSidebar();
    
    profileDropdown.classList.add('hidden');
}

function logout() {
    localStorage.removeItem('sage_session_active');
    showView('login');
}

function populateTable() {
    const tbody = document.getElementById('table-body');
    const rtbody = document.getElementById('reports-table-body');
    if (tbody) tbody.innerHTML = '';
    if (rtbody) rtbody.innerHTML = '';
    
    // Default stats
    const statObj = document.getElementById('total-assessments-stat');
    if(statObj) statObj.innerText = recentAssessments.length;
    
    const studentsObj = document.getElementById('students-evaluated-stat');
    if(studentsObj) {
        let totalPapers = recentAssessments.reduce((acc, curr) => acc + (curr.papers || 0), 0);
        studentsObj.innerText = totalPapers;
    }
    
    const avgScoreObj = document.getElementById('avg-score-stat');
    if(avgScoreObj && recentAssessments.length > 0) {
        let totalPct = recentAssessments.reduce((acc, curr) => acc + ((curr.result && curr.result.percentage) ? curr.result.percentage : 0), 0);
        avgScoreObj.innerText = Math.round(totalPct / recentAssessments.length) + '%';
    } else if (avgScoreObj) {
        avgScoreObj.innerText = '0%';
    }
    
    if (recentAssessments.length === 0) {
        const emptyState = `
            <tr>
                <td colspan="6" class="px-6 py-20 text-center">
                    <div class="flex flex-col items-center justify-center space-y-4">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                            <i class="ph ph-folder-open text-3xl"></i>
                        </div>
                        <div>
                            <p class="text-slate-900 font-bold text-lg">No assessments found</p>
                            <p class="text-slate-500 text-sm">Upload your first paper to begin AI grading.</p>
                        </div>
                        <button onclick="navigate('create')" class="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">
                            + Start New Assessment
                        </button>
                    </div>
                </td>
            </tr>
        `;
        if (tbody) tbody.innerHTML = emptyState;
        if (rtbody) rtbody.innerHTML = emptyState;
        return;
    }

    recentAssessments.forEach((item, index) => {
        const rowHTML = `
            <td class="px-8 py-5 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-11 w-11 sapphire-gradient rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-md">
                        ${item.id}
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-bold text-slate-900">${item.name}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-semibold text-gray-900">${item.studentName || '—'}</div>
                <div class="text-xs text-gray-500">${item.enrollmentNo || '—'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${item.date}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${item.papers} submissions
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${getStatusBadge(item.status, item.color)}
            </td>
            <td class="px-8 py-5 whitespace-nowrap text-right text-sm font-bold">
                <button onclick="viewAssessment(${index})" class="text-blue-600 hover:text-blue-900 transition-colors flex items-center gap-1 ml-auto">
                    View Report <i class="ph ph-arrow-square-out font-bold"></i>
                </button>
            </td>
        `;

        if (tbody) {
            const tr1 = document.createElement('tr');
            tr1.innerHTML = rowHTML;
            tbody.appendChild(tr1);
        }
        if (rtbody) {
            const tr2 = document.createElement('tr');
            tr2.innerHTML = rowHTML;
            rtbody.appendChild(tr2);
        }
    });
}

window.viewAssessment = function(index) {
    const item = recentAssessments[index];
    if (item && item.result) {
        renderResults(
            item.result, 
            item.name, 
            item.studentName, 
            item.enrollmentNo, 
            item.courseCode
        );
    } else {
        alert("This assessment doesn't have an AI report attached yet.");
    }
};

function renderResults(result, title, studentName, enrollmentNo, courseCode) {
    navigate('results');
    document.getElementById('results-subtitle').innerText = title || 'Comprehensive Assessment Analysis';

    // --- Student identity card ---
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val || '—'; };
    setEl('res-student-name',   studentName  || result.studentName  || '—');
    setEl('res-enrollment-no',  enrollmentNo || result.enrollmentNo || '—');
    setEl('res-course-code',    courseCode   || result.courseCode   || '—');
    setEl('res-assessment-name', title || (result.assessmentName || '—'));

    // --- Scoreboard Calculations ---
    const totalScore = result.totalScore   ?? 0;
    const maxScore   = result.maxTotalScore ?? result.maxScore ?? 100;
    const pct        = result.percentage   ?? Math.round((totalScore / maxScore) * 100);

    // Update Percentage Text
    const pctEl = document.getElementById('res-percentage');
    if (pctEl) pctEl.innerText = `${pct.toFixed ? pct.toFixed(1) : pct}% Mastery`;

    // Update Score Text
    const scoreEl = document.getElementById('res-score');
    if (scoreEl) scoreEl.innerText = `${totalScore}`;

    // Update Overall Feedback
    const feedbackEl = document.getElementById('res-feedback');
    if (feedbackEl) feedbackEl.innerText = result.overallFeedback || result.feedback || 'Pedagogical evaluation completed successfully.';

    // --- Score Progress Bar (Linear) ---
    const barEl = document.getElementById('res-progress-bar');
    if (barEl) {
        barEl.style.width = '0%'; // Reset for animation
        setTimeout(() => {
            barEl.style.width = Math.min(pct, 100) + '%';
        }, 100);
    }

    // --- Score Circle (Circular Progress) ---
    const circle = document.getElementById('res-score-circle');
    if (circle) {
        const radius = 58;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (pct / 100) * circumference;
        circle.style.strokeDasharray = `${circumference}`;
        circle.style.strokeDashoffset = `${circumference}`; // Reset
        setTimeout(() => {
            circle.style.strokeDashoffset = offset;
        }, 300);
    }

    // --- Grade label ---
    const gradeEl = document.getElementById('res-grade-label');
    if (gradeEl) {
        let grade = 'F';
        if (pct >= 90) grade = 'A+';
        else if (pct >= 80) grade = 'A';
        else if (pct >= 70) grade = 'B+';
        else if (pct >= 60) grade = 'B';
        else if (pct >= 50) grade = 'C';
        gradeEl.innerText = grade;
    }

    // --- Needs-review status ---
    const reviewResults = (result.questionResults || []).filter(q => q.needsReview);
    const reviewCount = reviewResults.length;
    const reviewBadge = document.getElementById('res-review-count');
    const reviewText  = document.getElementById('res-review-text');
    
    if (reviewBadge) {
        if (reviewCount > 0) {
            reviewBadge.classList.remove('hidden');
            if (reviewText) reviewText.innerText = `${reviewCount} FLAG${reviewCount > 1 ? 'S' : ''} NEED REVIEW`;
        } else {
            reviewBadge.classList.add('hidden');
        }
    }

    // --- Question Breakdown ---
    const breakdown = document.getElementById('results-breakdown');
    breakdown.innerHTML = '';

    if (!result.questionResults || !Array.isArray(result.questionResults)) {
        breakdown.innerHTML = '<div class="premium-card p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No unit-level analysis data found.</div>';
        return;
    }

    result.questionResults.forEach((q, i) => {
        const qNum   = q.questionNumber || (i + 1);
        const marks  = q.marksAwarded   ?? 0;
        const maxQ   = q.maxMarks       ?? q.maxScore ?? '?';
        
        // Confidence badge
        const conf      = (q.confidence || 'HIGH').toUpperCase();
        const confColor = conf === 'HIGH' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                         conf === 'MEDIUM' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                         'bg-rose-50 text-rose-600 border-rose-100';
        
        const confBadge = `
            <span class="px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest border ${confColor} flex items-center gap-2 uppercase shadow-sm">
                <i class="ph ${conf === 'HIGH' ? 'ph-seal-check-fill' : 'ph-warning-octagon-fill'} text-base"></i> ${conf} CONFIDENCE
            </span>
        `;

        const card = document.createElement('div');
        card.className = 'premium-card p-8 bg-white slide-up border border-slate-100 relative group overflow-hidden';
        card.style.animationDelay = (i * 0.1) + 's';
        
        card.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 sapphire-gradient opacity-[0.02] -mr-16 -mt-16 group-hover:opacity-[0.05] transition-opacity duration-500 rounded-full"></div>
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 border-b border-slate-50 pb-8 relative z-10">
                <div class="flex items-center gap-5">
                    <div class="w-14 h-14 rounded-2xl sapphire-gradient flex items-center justify-center text-white shadow-xl ring-8 ring-blue-500/5 transition-transform group-hover:scale-110 duration-500">
                        <span class="text-xl font-black text-white">#${qNum}</span>
                    </div>
                    <div>
                        <h4 class="text-2xl font-black text-slate-900 font-professional tracking-tight">Question Unit ${qNum}</h4>
                        <div class="flex items-center gap-3 mt-1.5">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weightage: ${maxQ} Points</p>
                            <span class="w-1 h-1 bg-slate-200 rounded-full"></span>
                            <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
                                <i class="ph ph-magic-wand-fill"></i> AI Evaluation Ready
                            </p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Awarded Marks</p>
                        <p class="text-4xl font-black text-slate-900 font-professional tracking-tighter">${marks}<span class="text-slate-300 text-lg font-bold ml-1">/ ${maxQ}</span></p>
                    </div>
                    ${confBadge}
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 relative z-10">
                <div class="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 shadow-inner hover:bg-white hover:shadow-2xl hover:border-blue-100/50 transition-all duration-500">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i class="ph ph-brain-fill text-blue-600 text-base"></i> Pedagogical Matrix Analysis
                    </p>
                    <p class="text-sm text-slate-700 leading-relaxed font-bold italic">${q.conceptAnalysis || 'Evaluation engine provided no concept specifics.'}</p>
                </div>
                <div class="bg-blue-50/30 rounded-3xl p-6 border border-blue-100/50 shadow-inner hover:bg-white hover:shadow-2xl hover:border-blue-200/50 transition-all duration-500">
                    <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i class="ph ph-quotes-fill text-blue-700 text-base"></i> Identified Student Logic
                    </p>
                    <div class="text-sm text-slate-700 leading-relaxed font-black border-l-4 border-blue-300/50 pl-6 py-1">
                        "${q.studentLogic || 'Direct student context extraction unavailable.'}"
                    </div>
                </div>
            </div>

            <div class="bg-emerald-50/40 rounded-3xl p-8 border border-emerald-100 relative z-10 shadow-sm">
                <div class="flex items-center justify-between mb-4">
                    <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                        <i class="ph ph-chat-circle-dots-fill text-xl text-emerald-600"></i> Narrative Feedback
                    </p>
                    <i class="ph ph-check-circle-fill text-emerald-400 text-2xl"></i>
                </div>
                <div class="text-base text-slate-900 font-bold leading-relaxed tracking-tight">
                    "${q.feedback || 'The student demonstrated standard proficiency in this area.'}"
                </div>
            </div>

            ${q.needsReview ? `
                <div class="mt-8 p-6 bg-rose-50 border-2 border-rose-100 rounded-3xl flex items-center gap-6 text-rose-900 shadow-xl shadow-rose-500/5 relative z-10 animate-pulse">
                    <div class="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0 shadow-inner">
                        <i class="ph ph-warning-octagon-fill text-4xl"></i>
                    </div>
                    <div>
                        <p class="text-sm font-black uppercase tracking-tight">Teacher Intervention Required</p>
                        <p class="text-xs font-bold opacity-75 mt-1 leading-relaxed">
                            Algorithmic confidence is below threshold. Discrepancies in handwriting or logic ambiguity 
                            require manual validation to ensure grading integrity.
                        </p>
                    </div>
                </div>
            ` : ''}
        `;
        breakdown.appendChild(card);
    });
}


const profileBtn = document.getElementById('profile-menu-btn');

const profileDropdown = document.getElementById('profile-dropdown');

profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
});

window.addEventListener('click', () => {
    if (!profileDropdown.classList.contains('hidden')) {
        profileDropdown.classList.add('hidden');
    }
});

const openSidebarBtn = document.getElementById('open-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

function openMobileSidebar() {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
}

openSidebarBtn.addEventListener('click', openMobileSidebar);
closeSidebarBtn.addEventListener('click', closeMobileSidebar);
overlay.addEventListener('click', closeMobileSidebar);
// ==========================================
// FILE UPLOAD & DRAG-AND-DROP LOGIC
// ==========================================

// Store our uploaded files in an object
const uploadedFiles = {
    qp: null, // Question Paper
    ak: null, // Answer Key
    ss: null  // Student Sheet
};

// A reusable function to set up multiple drag-and-drop zones
function setupDropzone(type, dropzoneId, inputId, displayId, nameId, removeBtnId) {
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(inputId);
    const fileDisplay = document.getElementById(displayId);
    const fileNameDisplay = document.getElementById(nameId);
    const removeBtn = document.getElementById(removeBtnId);

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight dropzone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('border-academic-500', 'bg-academic-50'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('border-academic-500', 'bg-academic-50'), false);
    });

    // Handle dropped files
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFile(files[0]);
    }, false);

    // Handle clicked files
    fileInput.addEventListener('change', function() {
        handleFile(this.files[0]);
    });

    function handleFile(file) {
        if (file) {
            uploadedFiles[type] = file; // Save to our global object
            fileNameDisplay.textContent = file.name;
            fileDisplay.classList.remove('hidden');
            fileDisplay.classList.add('inline-flex');
            document.getElementById('create-error').classList.add('hidden'); // Hide errors
        }
    }

    // Handle removing the file
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        e.preventDefault();
        uploadedFiles[type] = null;
        fileInput.value = '';
        fileDisplay.classList.add('hidden');
        fileDisplay.classList.remove('inline-flex');
    });
}

// Initialize all three dropzones
setupDropzone('qp', 'dropzone-qp', 'file-qp', 'display-qp', 'name-qp', 'remove-qp');
setupDropzone('ak', 'dropzone-ak', 'file-ak', 'display-ak', 'name-ak', 'remove-ak');
setupDropzone('ss', 'dropzone-ss', 'file-ss', 'display-ss', 'name-ss', 'remove-ss');


// ==========================================
// GEMINI AI ASSESSMENT BUILDER LOGIC
// ==========================================

const btnGenerateAi = document.getElementById('btn-generate-ai');
if (btnGenerateAi) {
    btnGenerateAi.addEventListener('click', async () => {
        const topic = document.getElementById('ai-topic').value.trim();
        const difficulty = document.getElementById('ai-difficulty').value;
        const errorBox = document.getElementById('ai-error');
        const errorText = document.getElementById('ai-error-text');
        
        errorBox.classList.add('hidden');

        if(!topic) {
            errorText.innerText = "Please enter an assessment topic to generate content.";
            errorBox.classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('btn-generate-ai');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> <span>Drafting Assessment...</span>`;
        btn.disabled = true;
        btn.classList.add('opacity-80', 'cursor-not-allowed');

        try {
            const response = await fetch('http://localhost:3000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, difficulty })
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const data = await response.json();
            const generatedText = data.generatedText;
            
            if (!generatedText) throw new Error("No content generated.");

            document.getElementById('ai-result-container').classList.remove('hidden');
            document.getElementById('ai-generated-content').value = generatedText;
            
            if(!document.getElementById('assessment-name').value) {
                document.getElementById('assessment-name').value = `${topic} Assessment`;
            }
            
            // Mocking the file upload to the Answer Key Dropzone automatically
            const mockFile = new File([generatedText], `SAGE_AI_${topic.replace(/\s+/g, '_')}_Key.txt`, { type: 'text/plain' });
            
            // Manually trigger the answer key dropzone to show this file
            uploadedFiles.ak = mockFile; 
            document.getElementById('name-ak').textContent = mockFile.name;
            document.getElementById('display-ak').classList.remove('hidden');
            document.getElementById('display-ak').classList.add('inline-flex');
            
        } catch (error) {
            errorText.innerText = "SAGE AI encountered a communication error. Please try again.";
            errorBox.classList.remove('hidden');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.classList.remove('opacity-80', 'cursor-not-allowed');
        }
    });
}

const btnCopyAi = document.getElementById('btn-copy-ai');
if (btnCopyAi) {
    btnCopyAi.addEventListener('click', () => {
        const textarea = document.getElementById('ai-generated-content');
        textarea.select();
        document.execCommand('copy');
        
        const btn = document.getElementById('btn-copy-ai');
        const orig = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-check text-green-600"></i> <span class="text-green-600">Copied!</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
    });
}

// ==========================================
// FORM SUBMISSION (AI GRADING TRIGGER)
// ==========================================

// 1. Base64 Conversion Helper
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 2. Update the Form Submission Logic to async
document.getElementById('create-assessment-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Validate that all required files exist
    if(!uploadedFiles.qp || !uploadedFiles.ak || !uploadedFiles.ss) {
        const errorMsg = document.getElementById('create-error-msg');
        if (errorMsg) errorMsg.innerText = "Please upload the Question Paper, Answer Key, AND Student Sheet to start AI grading.";
        document.getElementById('create-error').classList.remove('hidden');
        return;
    }

    const courseCode      = document.getElementById('course-code').value.trim();
    const assessmentName  = document.getElementById('assessment-name').value.trim();
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    
    // 3. Lock the UI State (Pre-Processing)
    submitBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> <span>AI is Analyzing...</span>`;
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

    // Disable or hide the 'remove' buttons
    const removeBtns = ['remove-qp', 'remove-ak', 'remove-ss'];
    removeBtns.forEach(id => document.getElementById(id).classList.add('hidden'));

    // Disable dropzone inputs
    const dropzones = ['dropzone-qp', 'dropzone-ak', 'dropzone-ss'];
    dropzones.forEach(id => document.getElementById(id).classList.add('pointer-events-none', 'opacity-50'));
    
    try {
        // 4. Generate the Payload
        const [qpBase64, akBase64, ssBase64] = await Promise.all([
            fileToBase64(uploadedFiles.qp),
            fileToBase64(uploadedFiles.ak),
            fileToBase64(uploadedFiles.ss)
        ]);

        const gradingPayload = {
            courseCode:      courseCode,
            assessmentName:  assessmentName,
            studentName:     document.getElementById('student-name').value.trim(),
            enrollmentNo:    document.getElementById('enrollment-no').value.trim(),
            totalMarks:      parseInt(document.getElementById('total-marks').value) || 0,
            totalQuestions:  parseInt(document.getElementById('total-questions').value) || 0,
            files: {
                questionPaper: qpBase64,
                answerKey:     akBase64,
                studentSheet:  ssBase64
            }
        };

        // 5. Send Payload to Backend
        console.log("Sending Payload to Backend...");
        const response = await fetch('http://localhost:3000/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gradingPayload)
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        const newAssessmentData = await response.json();
        console.log("Final Grading Results:", newAssessmentData);
        
        // Push and populate without reloading
        recentAssessments.unshift(newAssessmentData);
        populateTable();
        
        // Clear forms
        document.getElementById('create-assessment-form').reset();
        document.getElementById('remove-qp').click();
        document.getElementById('remove-ak').click();
        document.getElementById('remove-ss').click();
        
        // Visually load the results page
        renderResults(newAssessmentData.result, newAssessmentData.name, newAssessmentData.studentName, newAssessmentData.enrollmentNo, newAssessmentData.courseCode);
        
    } catch (error) {
        console.error("Error during file conversion:", error);
        alert("An error occurred while preparing the files for AI processing. " + error.message);
    } finally {
        // Unlock the UI State
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');

        removeBtns.forEach(id => document.getElementById(id).classList.remove('hidden'));
        dropzones.forEach(id => document.getElementById(id).classList.remove('pointer-events-none', 'opacity-50'));
    }
});