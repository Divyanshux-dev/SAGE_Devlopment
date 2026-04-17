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
        const token = localStorage.getItem('sage_token');
        if (!token) return;
        const res = await fetch('http://localhost:3000/api/assessments', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            recentAssessments = await res.json();
            populateTable();
        } else if (res.status === 401) {
            logout();
        }
    } catch(e) { console.error("Could not load assessments"); }
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('sage_token');
    if (token) {
        await loadAssessments();
        showView('main');
        navigate('dashboard');
    } else {
        showView('login');
    }

    const now = new Date();
    document.getElementById('last-login-date').innerText = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
});

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if(email && password) {
        const btn = this.querySelector('button');
        const origText = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Authenticating...`;
        
        try {
            const res = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                document.getElementById('login-error').classList.add('hidden');
                localStorage.setItem('sage_token', data.token);
                if(data.user) {
                    const profileNameEls = document.querySelectorAll('.profile-name, #profile-dropdown p.font-medium');
                    profileNameEls.forEach(el => el.innerText = data.user.name);
                }
                
                btn.innerHTML = origText;
                this.reset();
                await loadAssessments();
                showView('main');
                navigate('dashboard');
            } else {
                document.getElementById('login-error').innerText = data.error || "Login failed";
                document.getElementById('login-error').classList.remove('hidden');
                btn.innerHTML = origText;
            }
        } catch(err) {
            document.getElementById('login-error').innerText = "Network error. Please try again.";
            document.getElementById('login-error').classList.remove('hidden');
            btn.innerHTML = origText;
        }
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
    localStorage.removeItem('sage_token');
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
// File upload + drag-and-drop

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


// AI assessment builder

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
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('sage_token')
                },
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
            
            // Split generated text into QP and AK based on the prompt's defined headings
            const qpMatch = generatedText.match(/1\.?\s*QUESTION PAPER:?\s*([\s\S]*?)(?=2\.?\s*MODEL ANSWER KEY:?|$)/i);
            const akMatch = generatedText.match(/2\.?\s*MODEL ANSWER KEY:?\s*([\s\S]*)$/i);
            
            const qpText = qpMatch ? qpMatch[1].trim() : generatedText;
            const akText = akMatch ? akMatch[1].trim() : generatedText;

            // Trigger the Question Paper dropzone
            const mockFileQP = new File([qpText], `SAGE_AI_${topic.replace(/\s+/g, '_')}_QP.txt`, { type: 'text/plain' });
            uploadedFiles.qp = mockFileQP;
            const nameQpElem = document.getElementById('name-qp');
            if (nameQpElem) nameQpElem.textContent = mockFileQP.name;
            const displayQpElem = document.getElementById('display-qp');
            if (displayQpElem) {
                displayQpElem.classList.remove('hidden');
                displayQpElem.classList.add('inline-flex');
            }

            // Trigger the Answer Key dropzone
            const mockFileAK = new File([akText], `SAGE_AI_${topic.replace(/\s+/g, '_')}_Key.txt`, { type: 'text/plain' });
            uploadedFiles.ak = mockFileAK; 
            const nameAkElem = document.getElementById('name-ak');
            if (nameAkElem) nameAkElem.textContent = mockFileAK.name;
            const displayAkElem = document.getElementById('display-ak');
            if (displayAkElem) {
                displayAkElem.classList.remove('hidden');
                displayAkElem.classList.add('inline-flex');
            }
            
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

// Form submission — triggers grading

// 1. Base64 Conversion Helper
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 2. Grading Form Submit — Phase 2: Queue + SSE
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

    submitBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> <span>Preparing Files...</span>`;
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        const [qpBase64, akBase64, ssBase64] = await Promise.all([
            fileToBase64(uploadedFiles.qp),
            fileToBase64(uploadedFiles.ak),
            fileToBase64(uploadedFiles.ss)
        ]);

        const gradingPayload = {
            courseCode,
            assessmentName,
            studentName:    document.getElementById('student-name').value.trim(),
            enrollmentNo:   document.getElementById('enrollment-no').value.trim(),
            totalMarks:     parseInt(document.getElementById('total-marks').value) || 0,
            totalQuestions: parseInt(document.getElementById('total-questions').value) || 0,
            files: { questionPaper: qpBase64, answerKey: akBase64, studentSheet: ssBase64 }
        };

        // POST to queue — server returns 202 immediately with jobId
        const response = await fetch('http://localhost:3000/api/grade', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('sage_token')
            },
            body: JSON.stringify(gradingPayload)
        });

        if (!response.ok) throw new Error(`Server error ${response.status}`);

        const { jobId } = await response.json();
        console.log(`[SAGE] Job queued: ${jobId}`);

        // Unlock the form immediately — user is free to continue
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');

        // Reset the form fields + file zones
        document.getElementById('create-assessment-form').reset();
        ['remove-qp','remove-ak','remove-ss'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.click();
        });

        // Show floating toast + open SSE stream
        showGradingToast(jobId, assessmentName || 'Assessment');
        listenForJobResult(jobId);

    } catch (error) {
        console.error("Queue submission error:", error);
        alert("Failed to submit for grading: " + error.message);
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
});

// SSE listener for grading job updates
function listenForJobResult(jobId) {
    const evtSource = new EventSource(`http://localhost:3000/api/grade/status/${jobId}`);

    evtSource.onmessage = function(e) {
        const data = JSON.parse(e.data);
        console.log(`[SAGE SSE] ${jobId}:`, data.status);

        if (data.status === 'done') {
            evtSource.close();
            dismissGradingToast(jobId);
            const result = data.result;
            recentAssessments.unshift(result);
            populateTable();
            renderResults(result.result, result.name, result.studentName, result.enrollmentNo, result.courseCode);
        } else if (data.status === 'error') {
            evtSource.close();
            dismissGradingToast(jobId);
            alert('SAGE Grading Error: ' + data.error);
        } else {
            updateGradingToast(jobId, data.status);
        }
    };

    evtSource.onerror = function() {
        evtSource.close();
        dismissGradingToast(jobId);
    };
}

// Toast notifications
const toasts = {};

function showGradingToast(jobId, assessmentName) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:12px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.id = `toast-${jobId}`;
    toast.style.cssText = 'background:#1e293b;color:#fff;padding:16px 20px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;align-items:center;gap:14px;min-width:300px;border:1px solid rgba(255,255,255,0.08);transition:all 0.3s ease;';
    toast.innerHTML = `
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="ph ph-spinner" style="animation:spin 1s linear infinite;font-size:18px;"></i>
        </div>
        <div style="flex:1;">
            <p style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;">SAGE AI Processing</p>
            <p style="font-size:13px;font-weight:700;color:#f1f5f9;" id="toast-text-${jobId}">${assessmentName} — Queued</p>
        </div>
    `;
    container.appendChild(toast);
    toasts[jobId] = toast;
}

function updateGradingToast(jobId, status) {
    const textEl = document.getElementById(`toast-text-${jobId}`);
    const labels = { queued: 'Queued…', processing: 'AI is grading your paper…' };
    if (textEl) textEl.innerText = labels[status] || status;
}

function dismissGradingToast(jobId) {
    const toast = toasts[jobId];
    if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 400);
        delete toasts[jobId];
    }
}