/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const STORE_ERRORS  = 'gcp-ace-errors-v2';
const STORE_HISTORY = 'gcp-ace-history-v2';
const STORE_SESSION = 'gcp-ace-session-v2';
const PER_PAGE = 1;

let questions   = [];     // loaded from JSON
let session     = null;   // current exam session
let currentPage = 0;

// Persistent stores
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let errors  = load(STORE_ERRORS,  {});  // { qId: { question, domain, yourAnswer, correct, options } }
let history = load(STORE_HISTORY, []);  // [{ date, size, correct, total, pct }]

/* ══════════════════════════════════════════════
   LOAD QUESTIONS
══════════════════════════════════════════════ */
async function loadQuestions() {
  try {
    const r = await fetch('questions.json');
    const data = await r.json();
    questions = data.questions;
    init();
  } catch(e) {
    document.body.innerHTML = `<div style="padding:40px;color:#ea4335;font-family:monospace">
      Failed to load questions.json.<br>Make sure you're running via a local server:<br><br>
      <code>npx serve .</code> or <code>python3 -m http.server</code>
    </div>`;
  }
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
function checkActiveSession() {
  const saved = load(STORE_SESSION, null);
  if (saved && !saved.finished) {
    session = saved;
    document.getElementById('resume-banner').style.display = 'block';
    if(document.getElementById('home-config')) document.getElementById('home-config').style.display = 'none';
  } else {
    document.getElementById('resume-banner').style.display = 'none';
    if(document.getElementById('home-config')) document.getElementById('home-config').style.display = 'block';
  }
}

function init() {
  const isLight = load('gcp-ace-theme', 'dark') === 'light';
  if (isLight) {
    document.body.classList.add('light-theme');
    document.getElementById('theme-btn').textContent = '🌙';
  }
  renderDistGrid(30);
  renderHomeStats();
  renderErrorBadge();
  checkActiveSession();
}

/* ══════════════════════════════════════════════
   SIZE SELECTION
══════════════════════════════════════════════ */
let selectedSize = 30;
let selectedMode = 'exam';

function selectMode(m) {
  selectedMode = m;
  document.getElementById('btn-mode-practice').classList.toggle('selected', m==='practice');
  document.getElementById('btn-mode-exam').classList.toggle('selected', m==='exam');
}

function resumeExam() {
  document.getElementById('resume-banner').style.display = 'none';
  goScreen('exam');
  renderExam();
  if (session.mode === 'exam') startTimer();
}

function discardSession() {
  session = null;
  save(STORE_SESSION, null);
  checkActiveSession();
  toast('Sessão descartada.');
}

function selectSize(n) {
  selectedSize = n;
  document.getElementById('btn30').classList.toggle('selected', n===30);
  document.getElementById('btn60').classList.toggle('selected', n===60);
  renderDistGrid(n);
}

const SECTIONS = [
  { key: 'Setting up a cloud solution environment',        pct: .17 },
  { key: 'Planning and configuring a cloud solution',      pct: .17 },
  { key: 'Deploying and implementing a cloud solution',    pct: .25 },
  { key: 'Ensuring successful operation',                  pct: .20 },
  { key: 'Configuring access and security',               pct: .20 },
];

function renderDistGrid(n) {
  const el = document.getElementById('dist-grid');
  el.innerHTML = SECTIONS.map(s => {
    const count = Math.round(s.pct * n);
    const w = Math.round(s.pct * 100);
    return `<div class="dist-row">
      <span class="dist-label">${s.key}</span>
      <div class="dist-bar-wrap"><div class="dist-bar" style="width:${w}%"></div></div>
      <span class="dist-count">${count}q</span>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   HOME STATS
══════════════════════════════════════════════ */
function renderHomeStats() {
  const total = history.reduce((a,h)=>a+h.total,0);
  const correct = history.reduce((a,h)=>a+h.correct,0);
  const avgPct = history.length ? Math.round(history.reduce((a,h)=>a+h.pct,0)/history.length) : 0;
  
  // Calculate unique error count
  const uniqueErrorIds = new Set(Object.keys(errors).map(Number));
  history.forEach(h => {
    if (h.answers) {
      Object.entries(h.answers).forEach(([qId, ans]) => {
        const id = parseInt(qId);
        if (!ans.correct && !(h.removedErrors && h.removedErrors.includes(id))) {
          uniqueErrorIds.add(id);
        }
      });
    }
  });
  const errCount = uniqueErrorIds.size;
  
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-box blue"><div class="val">${history.length}</div><div class="lbl">Exams taken</div></div>
    <div class="stat-box green"><div class="val">${correct}</div><div class="lbl">Total correct</div></div>
    <div class="stat-box ${avgPct>=70?'green':'red'}"><div class="val">${history.length?avgPct+'%':'—'}</div><div class="lbl">Average score</div></div>
    <div class="stat-box red"><div class="val">${errCount}</div><div class="lbl">Logged errors</div></div>
  `;
}

/* ══════════════════════════════════════════════
   BUILD EXAM SESSION
══════════════════════════════════════════════ */
function startExam() {
  if (!questions.length) return;

  // Proportional sampling by section
  const pool = [...questions];
  let picked = [];
  SECTIONS.forEach(s => {
    const target = Math.round(s.pct * selectedSize);
    const bucket = pool.filter(q => q.section && q.section.startsWith(s.key.split(' ')[0]));
    // fallback: use domain if section match insufficient
    const fallback = pool.filter(q => !picked.find(p=>p.id===q.id));
    const source = bucket.length >= target ? bucket : fallback;
    const shuffled = shuffle(source.filter(q => !picked.find(p=>p.id===q.id)));
    picked.push(...shuffled.slice(0, target));
  });

  // Fill remainder if needed
  const remaining = shuffle(pool.filter(q => !picked.find(p=>p.id===q.id)));
  while (picked.length < selectedSize && remaining.length) {
    picked.push(remaining.shift());
  }
  picked = picked.slice(0, selectedSize);
  picked = shuffle(picked);

  session = {
    questions: picked,
    answers: {},      
    review: {},       // qId → true/false
    size: selectedSize,
    mode: selectedMode,
    finished: false,
    startedAt: Date.now()
  };
  if (selectedMode === 'exam') {
    const mins = selectedSize === 30 ? 45 : 120;
    session.endTime = Date.now() + mins * 60 * 1000;
  }
  save(STORE_SESSION, session);
  currentPage = 0;
  document.getElementById('resume-banner').style.display = 'none';
  goScreen('exam');
  renderExam();
  if (selectedMode === 'exam') startTimer();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ══════════════════════════════════════════════
   RENDER EXAM
══════════════════════════════════════════════ */
function renderExam() {
  if (!session) return;

  const total  = session.questions.length;
  const answered = Object.keys(session.answers).length;
  const pct    = Math.round(answered/total*100);

  document.getElementById('exam-title').textContent =
    `Simulado · ${answered} / ${total} answered`;
  document.getElementById('exam-prog').style.width = pct + '%';

  // Finish banner
  const banner = document.getElementById('finish-banner');
  if (session.finished) {
    clearInterval(timerInterval);
    document.getElementById('exam-timer').style.display = 'none';
    const correct = session.questions.filter(q=>session.answers[q.id]?.correct).length;
    const score = Math.round(correct/total*100);
    document.getElementById('finish-score').textContent =
      `Score: ${score}% (${correct}/${total})`;
    document.getElementById('finish-msg').textContent =
      score >= 70 ? '🎉 Passing score! You\'re ready for the real exam.' :
                    `${70-score} percentage points to go. Focus on your error log.`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }

  renderPage();
}

function renderPage() {
  const qs = session.questions;
  const total = qs.length;
  const totalPages = Math.ceil(total / PER_PAGE);
  const start = currentPage * PER_PAGE;
  const pageQs = qs.slice(start, start + PER_PAGE);

  document.getElementById('page-info').textContent =
    `Questão ${currentPage+1} de ${totalPages}`;
  document.getElementById('btn-prev').disabled = currentPage === 0;
  document.getElementById('btn-next').disabled = currentPage >= totalPages-1;

  const container = document.getElementById('questions-container');
  container.innerHTML = '';

  pageQs.forEach((q, idx) => {
    const globalIdx = start + idx + 1;
    const ans = session.answers[q.id];
    const diffClass = q.difficulty === 'hard' ? 'hard' : q.difficulty === 'easy' ? 'easy' : 'med';

    const correctArr = q.answer.split(',').map(s=>s.trim());
    const isEvaluated = ans && (ans.evaluated || session.finished);

    const optsHTML = Object.entries(q.options).map(([letter, text]) => {
      let cls = 'opt';
      
      let isChosen = false;
      if (ans) {
        if (Array.isArray(ans.chosen)) {
          isChosen = ans.chosen.includes(letter);
        } else {
          isChosen = ans.chosen === letter; // backward compat
        }
      }

      if (isEvaluated) {
        cls += ' disabled';
        if (correctArr.includes(letter))    cls += ' correct';
        else if (isChosen)                  cls += ' wrong';
      } else {
        if (isChosen)                       cls += ' selected-opt';
      }
      
      const canClick = !session.finished && (!ans || !ans.evaluated);
      const click = canClick ? `onclick="answer(${q.id},'${letter}')" onkeydown="handleKey(event, ${q.id}, '${letter}')" tabindex="0" role="button"` : '';
      return `<div class="${cls}" ${click}>
        <span class="letter">${letter}</span>
        <span>${escHtml(text)}</span>
      </div>`;
    }).join('');

    let resultHTML = '';
    if (isEvaluated) {
      if (ans.correct) {
        resultHTML = `<div class="q-result ok">
          ${iconCheck()} Correct! Well done.
        </div>`;
      } else {
        const correctText = correctArr.map(c => `<strong>${c}: ${escHtml(q.options[c])}</strong>`).join('<br>');
        resultHTML = `<div class="q-result bad">
          ${iconX()} Incorrect — correct answer(s):<br>${correctText}
        </div>`;
      }
    }

    let actionsHTML = '';
    if ((session.mode === 'practice' && isEvaluated) || session.finished) {
      actionsHTML = `
      <div class="q-actions">
        <button class="btn-sm ${errors[q.id] ? 'active' : ''}" onclick="toggleError(${q.id})">
          ${errors[q.id] ? '✕ Remove from errors' : '＋ Log error'}
        </button>
        <button class="btn-sm" onclick="toggleExplanation(${q.id})">
          💡 Explanation
        </button>
        <button class="btn-sm" onclick="copyForAI(${q.id})">
          📋 Copy for AI
        </button>
      </div>
      <div class="explanation" id="exp-${q.id}">
        <strong>Explanation:</strong> ${escHtml(q.explanation || 'No explanation available.')}
      </div>`;
    } else if (session.mode === 'exam' && !session.finished) {
      const isReview = session.review && session.review[q.id];
      actionsHTML = `
      <div class="q-actions">
        <button class="btn-sm ${isReview ? 'active' : ''}" onclick="toggleReview(${q.id})">
          ${isReview ? '🚩 Desmarcar Revisão' : '🏳️ Marcar Revisão'}
        </button>
      </div>`;
    }

    const card = document.createElement('div');
    card.className = 'q-card';
    card.innerHTML = `
      <div class="q-meta">
        <span class="q-tag num">Q${globalIdx}</span>
        <span class="q-tag dom">${escHtml(q.domain)}</span>
        <span class="q-tag ${diffClass}">${q.difficulty || 'medium'}</span>
        ${(session.review && session.review[q.id]) ? '<span class="q-tag" style="background:var(--yellow-dim); color:var(--yellow); border:1px solid var(--yellow);">🚩 Revisão</span>' : ''}
      </div>
      <div class="q-text">${escHtml(q.text)}</div>
      <div class="opts">${optsHTML}</div>
      ${resultHTML}
      ${actionsHTML}`;
    container.appendChild(card);
  });
}

function changePage(dir) {
  currentPage += dir;
  renderPage();
  updateTitle();
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateTitle() {
  if (!session) return;
  const answered = Object.keys(session.answers).length;
  document.getElementById('exam-title').textContent =
    `Simulado · ${answered} / ${session.questions.length} answered`;
  const pct = Math.round(answered/session.questions.length*100);
  document.getElementById('exam-prog').style.width = pct + '%';
}

/* ══════════════════════════════════════════════
   ANSWER
══════════════════════════════════════════════ */
function answer(qId, letter) {
  if (!session || session.finished) return;
  const q = session.questions.find(x=>x.id===qId);
  if (!q) return;

  const correctAnswers = q.answer.split(',').map(s => s.trim());
  const numCorrect = correctAnswers.length;

  let currentAns = session.answers[qId] || { chosen: [] };
  // backward compat
  if (typeof currentAns.chosen === 'string') currentAns.chosen = [currentAns.chosen];

  if (session.mode === 'practice') {
    if (currentAns.evaluated) return; // already answered
    
    // Toggle
    if (currentAns.chosen.includes(letter)) {
      currentAns.chosen = currentAns.chosen.filter(x => x !== letter);
    } else {
      currentAns.chosen.push(letter);
    }
    
    if (currentAns.chosen.length === numCorrect) {
      currentAns.evaluated = true;
      const isCorrect = currentAns.chosen.every(c => correctAnswers.includes(c)) && currentAns.chosen.length === numCorrect;
      currentAns.correct = isCorrect;
      session.answers[qId] = currentAns;
      if (!isCorrect) logErrorObj(q, currentAns.chosen);
    } else {
      session.answers[qId] = currentAns;
    }
  } else {
    // Exam mode
    if (currentAns.chosen.includes(letter)) {
      currentAns.chosen = currentAns.chosen.filter(x => x !== letter);
    } else {
      if (currentAns.chosen.length >= numCorrect) currentAns.chosen.shift();
      currentAns.chosen.push(letter);
    }
    session.answers[qId] = currentAns;
  }

  save(STORE_SESSION, session);
  renderPage();
  updateTitle();
}

function logErrorObj(q, chosenArr) {
  let chosenStr = 'N/A';
  let chosenText = 'Nenhuma resposta';
  if (chosenArr && chosenArr.length > 0) {
    let arr = Array.isArray(chosenArr) ? chosenArr : [chosenArr];
    chosenStr = arr.sort().join(', ');
    chosenText = arr.map(c => q.options[c]).join(' | ');
  }
  
  const correctArr = q.answer.split(',').map(s => s.trim());
  const correctText = correctArr.map(c => q.options[c]).join(' | ');

  errors[q.id] = {
    id: q.id,
    question: q.text,
    domain: q.domain,
    options: q.options,
    yourAnswer: chosenStr,
    yourAnswerText: chosenText,
    correct: q.answer,
    correctText: correctText,
    explanation: q.explanation || '',
    loggedAt: new Date().toISOString()
  };
  save(STORE_ERRORS, errors);
  renderErrorBadge();
}

function toggleReview(qId) {
  if (!session || session.finished) return;
  session.review = session.review || {};
  session.review[qId] = !session.review[qId];
  save(STORE_SESSION, session);
  renderPage();
}

let timerInterval;
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function updateTimer() {
  if (!session || session.finished || session.mode !== 'exam') {
    document.getElementById('exam-timer').style.display = 'none';
    return;
  }
  document.getElementById('exam-timer').style.display = 'inline';
  const now = Date.now();
  const left = session.endTime - now;
  if (left <= 0) {
    clearInterval(timerInterval);
    document.getElementById('exam-timer').textContent = "00:00";
    finishExam(true);
    return;
  }
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  document.getElementById('exam-timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

/* ══════════════════════════════════════════════
   FINISH
══════════════════════════════════════════════ */
function finishExam(force = false) {
  if (!session) return;
  const unanswered = session.questions.filter(q=>!session.answers[q.id]).length;
  if (unanswered > 0 && !force) {
    if (!confirm(`Você tem ${unanswered} questão(ões) sem resposta. Enviar mesmo assim?`)) return;
  }
  session.finished = true;
  
  if (session.mode === 'exam') {
    session.questions.forEach(q => {
      const correctArr = q.answer.split(',').map(s => s.trim());
      const ans = session.answers[q.id] || { chosen: [] };
      if (typeof ans.chosen === 'string') ans.chosen = [ans.chosen];
      
      const isCorrect = ans.chosen.every(c => correctArr.includes(c)) && ans.chosen.length === correctArr.length;
      ans.correct = isCorrect;
      ans.evaluated = true;
      session.answers[q.id] = ans;
      
      // Exam errors are tracked inside the session answers in historyEntry.
      // We do not add them to the global errors object to avoid duplication.
    });
  }
  
  save(STORE_SESSION, session);

  const total = session.questions.length;
  const correct = session.questions.filter(q=>session.answers[q.id]?.correct).length;
  const pct = Math.round(correct/total*100);

  // Calculate themes/sections stats
  const themes = {};
  session.questions.forEach(q => {
    const ans = session.answers[q.id];
    const section = q.section || 'Uncategorized';
    if (!themes[section]) {
      themes[section] = { correct: 0, total: 0 };
    }
    themes[section].total++;
    if (ans && ans.correct) {
      themes[section].correct++;
    }
  });

  const historyEntry = {
    id: `sim-${Date.now()}`,
    date: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    size: total,
    correct,
    total,
    pct,
    mode: session.mode,
    questionIds: session.questions.map(q => q.id),
    answers: JSON.parse(JSON.stringify(session.answers)),
    themes,
    removedErrors: []
  };

  history.unshift(historyEntry);
  if (history.length > 50) history.pop();
  save(STORE_HISTORY, history);

  currentPage = 0;
  renderExam();
  toast(`Exam finished: ${pct}% (${correct}/${total})`);
}

/* ══════════════════════════════════════════════
   ERROR LOG
══════════════════════════════════════════════ */
function toggleError(qId) {
  if (errors[qId]) {
    delete errors[qId];
    toast('Removed from error log');
  } else {
    const q = session?.questions.find(x=>x.id===qId);
    const ans = session?.answers[qId];
    if (!q || !ans) return;
    errors[qId] = {
      id: qId,
      question: q.text,
      domain: q.domain,
      options: q.options,
      yourAnswer: ans.chosen,
      yourAnswerText: q.options[ans.chosen],
      correct: q.answer,
      correctText: q.options[q.answer],
      explanation: q.explanation || '',
      loggedAt: new Date().toISOString()
    };
    toast('Added to error log');
  }
  save(STORE_ERRORS, errors);
  renderErrorBadge();
  renderPage();
}

function toggleExplanation(qId) {
  const el = document.getElementById(`exp-${qId}`);
  if (el) el.classList.toggle('show');
}

function copyForAI(qId) {
  const q = session?.questions.find(x=>x.id===qId);
  if (!q) return;
  const ans = session?.answers[qId];
  const text = buildAIPrompt([errors[qId] || {
    question: q.text, domain: q.domain, options: q.options,
    yourAnswer: ans?.chosen, yourAnswerText: q.options[ans?.chosen],
    correct: q.answer, correctText: q.options[q.answer]
  }]);
  navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard!'));
}

let openErrorGroups = {};

function toggleErrorGroup(groupId) {
  const el = document.getElementById(groupId);
  if (el) {
    const isOpen = el.classList.toggle('open');
    openErrorGroups[groupId] = isOpen;
  }
}

function filterErrorsBySession(sessionId) {
  openErrorGroups = {};
  openErrorGroups[`error-group-${sessionId}`] = true;
  renderErrors();
  setTimeout(() => {
    const el = document.getElementById(`error-group-${sessionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function getGroupErrors(sessionId) {
  if (sessionId === 'study') {
    return Object.values(errors);
  }
  const h = history.find(item => item.id === sessionId);
  if (!h || !h.answers) return [];
  
  const list = [];
  Object.entries(h.answers).forEach(([qId, ans]) => {
    const id = Number(qId);
    if (!ans.correct && !(h.removedErrors && h.removedErrors.includes(id))) {
      const q = questions.find(item => item.id === id);
      if (q) {
        let chosenStr = 'N/A';
        let chosenText = 'Nenhuma resposta';
        if (ans.chosen && ans.chosen.length > 0) {
          const arr = Array.isArray(ans.chosen) ? ans.chosen : [ans.chosen];
          chosenStr = arr.sort().join(', ');
          chosenText = arr.map(c => q.options[c]).join(' | ');
        }
        const correctArr = q.answer.split(',').map(s => s.trim());
        const correctText = correctArr.map(c => q.options[c]).join(' | ');

        list.push({
          id: q.id,
          question: q.text,
          domain: q.domain,
          options: q.options,
          yourAnswer: chosenStr,
          yourAnswerText: chosenText,
          correct: q.answer,
          correctText: correctText,
          explanation: q.explanation || ''
        });
      }
    }
  });
  return list;
}

function copyGroupErrorsForAI(sessionId) {
  const list = getGroupErrors(sessionId);
  if (!list.length) return;
  const text = buildAIPrompt(list);
  navigator.clipboard.writeText(text).then(() => toast(`Copiado ${list.length} erro(s) para o clipboard!`));
}

function renderErrorCard(e, sessionId) {
  return `
    <div class="err-card">
      <div class="err-answer-row">
        <span class="q-tag dom" style="display:inline-block;margin-bottom:6px">${escHtml(e.domain)}</span>
      </div>
      <div class="eq">${escHtml(e.question)}</div>
      <div class="err-answer-row">
        <span class="err-yours">✗ Sua resposta: ${escHtml(e.yourAnswer)}. ${escHtml(e.yourAnswerText || '')}</span>
        <span class="err-correct">✓ Correta: ${escHtml(e.correct)}. ${escHtml(e.correctText || '')}</span>
      </div>
      <div class="err-actions">
        <button class="btn-sm" onclick="toggleErrExp(${e.id}, '${sessionId}')">💡 Explicação</button>
        <button class="btn-sm blue" onclick="copySingleForAI(${e.id}, '${sessionId}')">📋 Copiar para IA</button>
        <button class="btn-sm active" onclick="removeError(${e.id}, '${sessionId}')">✕ Remover</button>
      </div>
      <div class="explanation" id="errexp-${sessionId}-${e.id}">
        <strong>Explicação:</strong> ${escHtml(e.explanation || 'Sem explicação disponível.')}
      </div>
    </div>
  `;
}

function renderErrors() {
  const el = document.getElementById('errors-list');
  
  const studyErrorsList = Object.values(errors);
  
  const simGroups = [];
  history.forEach(h => {
    if (h.answers && h.mode === 'exam') {
      const errList = getGroupErrors(h.id);
      if (errList.length > 0) {
        simGroups.push({
          id: h.id,
          date: h.date,
          pct: h.pct,
          correct: h.correct,
          total: h.total,
          mode: h.mode,
          errors: errList
        });
      }
    }
  });

  const totalErrorsCount = studyErrorsList.length + simGroups.reduce((acc, g) => acc + g.errors.length, 0);

  if (totalErrorsCount === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">✓</div>
      <p>Nenhum erro registrado.<br>Erros em simulados ou no Modo Estudo aparecerão aqui automaticamente.</p>
    </div>`;
    return;
  }

  let html = `
    <button class="btn-sm blue" style="margin-bottom:16px; width:100%; justify-content: center;" onclick="copyAllForAI()">
      📋 Copiar todos os ${totalErrorsCount} erro(s) para análise na IA
    </button>
  `;

  if (studyErrorsList.length > 0) {
    const groupId = 'error-group-study';
    const isOpen = openErrorGroups[groupId] !== false; // open by default unless collapsed
    
    html += `
      <div class="error-group ${isOpen ? 'open' : ''}" id="${groupId}">
        <div class="error-group-header" onclick="toggleErrorGroup('${groupId}')">
          <div class="error-group-title">
            <span>📁 Modo Estudo (Erros Avulsos)</span>
            <span class="badge" style="background:var(--red-dim);color:var(--red);padding:2px 6px;border-radius:10px;font-size:11px;">${studyErrorsList.length}</span>
          </div>
          <div class="error-group-header-actions" onclick="event.stopPropagation()">
            <button class="btn-sm blue" onclick="copyGroupErrorsForAI('study')">📋 Copiar Grupo</button>
          </div>
        </div>
        <div class="error-group-content">
          ${studyErrorsList.map(e => renderErrorCard(e, 'study')).join('')}
        </div>
      </div>
    `;
  }

  simGroups.forEach(g => {
    const groupId = `error-group-${g.id}`;
    const isOpen = !!openErrorGroups[groupId]; // closed by default
    const modeLabel = g.mode === 'exam' ? 'Prova' : 'Estudo';

    html += `
      <div class="error-group ${isOpen ? 'open' : ''}" id="${groupId}">
        <div class="error-group-header" onclick="toggleErrorGroup('${groupId}')">
          <div class="error-group-title">
            <span>📝 Simulado (${g.date}) - ${g.pct}% (${g.correct}/${g.total}) [${modeLabel}]</span>
            <span class="badge" style="background:var(--red-dim);color:var(--red);padding:2px 6px;border-radius:10px;font-size:11px;">${g.errors.length}</span>
          </div>
          <div class="error-group-header-actions" onclick="event.stopPropagation()">
            <button class="btn-sm blue" onclick="copyGroupErrorsForAI('${g.id}')">📋 Copiar Grupo</button>
          </div>
        </div>
        <div class="error-group-content">
          ${g.errors.map(e => renderErrorCard(e, g.id)).join('')}
        </div>
      </div>
    `;
  });

  el.innerHTML = html;
}

function toggleErrExp(id, sessionId) {
  const el = document.getElementById(`errexp-${sessionId}-${id}`);
  if (el) el.classList.toggle('show');
}

function removeError(id, sessionId) {
  if (sessionId === 'study') {
    delete errors[id];
    save(STORE_ERRORS, errors);
  } else {
    const h = history.find(item => item.id === sessionId);
    if (h) {
      if (!h.removedErrors) h.removedErrors = [];
      h.removedErrors.push(id);
      save(STORE_HISTORY, history);
    }
  }
  renderErrorBadge();
  renderErrors();
  renderHomeStats();
}

function clearErrors() {
  if (!confirm('Deseja limpar todos os logs de erro (incluindo erros de simulados finalizados)?')) return;
  
  errors = {};
  save(STORE_ERRORS, errors);
  
  history.forEach(h => {
    if (h.answers) {
      const qIds = Object.keys(h.answers).map(Number);
      h.removedErrors = qIds;
    }
  });
  save(STORE_HISTORY, history);

  renderErrorBadge();
  renderErrors();
  renderHomeStats();
  toast('Log de erros limpo');
}

function copyAllForAI() {
  const allList = [];
  allList.push(...Object.values(errors));
  history.forEach(h => {
    if (h.answers && h.mode === 'exam') {
      allList.push(...getGroupErrors(h.id));
    }
  });

  if (!allList.length) {
    toast('Nenhum erro registrado.');
    return;
  }
  const text = buildAIPrompt(allList);
  navigator.clipboard.writeText(text).then(() => toast(`Copiado total de ${allList.length} erro(s) para o clipboard!`));
}

function copySingleForAI(id, sessionId) {
  let e;
  if (sessionId === 'study') {
    e = errors[id];
  } else {
    const list = getGroupErrors(sessionId);
    e = list.find(item => item.id === id);
  }
  if (!e) return;
  const text = buildAIPrompt([e]);
  navigator.clipboard.writeText(text).then(() => toast('Copiado para o clipboard!'));
}

function buildAIPrompt(list) {
  const lines = [
    'I am preparing for the Google Cloud Associate Cloud Engineer (GCP ACE) exam.',
    'I answered the following questions incorrectly. Please explain:',
    '1. WHY the correct answer is right',
    '2. WHY each incorrect option is wrong',
    '3. The key concept I should study to avoid this mistake',
    '',
    '---',
    ''
  ];
  list.forEach((e, i) => {
    lines.push(`QUESTION ${i+1} [${e.domain}]`);
    lines.push(e.question);
    lines.push('');
    lines.push('Options:');
    if (e.options) {
      Object.entries(e.options).forEach(([k,v]) => {
        lines.push(`  ${k}. ${v}`);
      });
    }
    lines.push('');
    lines.push(`My answer:     ${e.yourAnswer}. ${e.yourAnswerText||''}`);
    lines.push(`Correct answer: ${e.correct}. ${e.correctText||''}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

function renderErrorBadge() {
  const uniqueErrorIds = new Set(Object.keys(errors).map(Number));
  history.forEach(h => {
    if (h.mode === 'exam' && h.answers) {
      Object.entries(h.answers).forEach(([qId, ans]) => {
        const id = parseInt(qId);
        if (!ans.correct && !(h.removedErrors && h.removedErrors.includes(id))) {
          uniqueErrorIds.add(id);
        }
      });
    }
  });
  const count = uniqueErrorIds.size;
  const badge = document.getElementById('err-count-badge');
  badge.textContent = count ? `(${count})` : '';
  badge.style.color = 'var(--red)';
}

/* ══════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════ */
let openHistoryDetails = {};

function toggleHistoryDetails(id) {
  openHistoryDetails[id] = !openHistoryDetails[id];
  const el = document.getElementById(`hist-details-${id}`);
  if (el) {
    el.style.display = openHistoryDetails[id] ? 'block' : 'none';
  }
}

function renderHistory() {
  const el = document.getElementById('history-list');
  const statsCard = document.getElementById('history-stats-card');
  
  if (!history.length) {
    statsCard.style.display = 'none';
    el.innerHTML = `<div class="empty-state">
      <div class="icon">📋</div>
      <p>Nenhum simulado finalizado ainda.</p>
    </div>`;
    return;
  }
  
  statsCard.style.display = 'block';
  drawTotalEvolutionChart();
  drawThemeEvolutionGrid();
  
  el.innerHTML = history.map(h => {
    const isExpanded = openHistoryDetails[h.id] ? 'block' : 'none';
    const modeLabel = h.mode === 'exam' ? 'Prova' : 'Estudo';
    
    // Build theme layout
    let themesHTML = '';
    if (h.themes) {
      themesHTML = Object.entries(h.themes).map(([theme, val]) => {
        const p = val.total ? Math.round(val.correct/val.total*100) : 0;
        return `<div class="hist-theme-row">
          <span>${theme}</span>
          <strong>${p}% (${val.correct}/${val.total})</strong>
        </div>`;
      }).join('');
    }
    
    return `
    <div class="hist-card" onclick="toggleHistoryDetails('${h.id}')">
      <div class="hist-card-summary">
        <span class="hist-date">${h.date}</span>
        <span class="hist-score ${h.pct>=70?'pass':'fail'}">${h.pct}%</span>
        <span class="hist-detail">
          <span>${h.correct}/${h.total} acertos</span>
          <span>${h.size} questões (${modeLabel})</span>
          <span style="color:${h.pct>=70?'var(--green)':'var(--red)'}">${h.pct>=70?'PASS':'FAIL'}</span>
        </span>
      </div>
      <div class="hist-card-details" id="hist-details-${h.id}" style="display:${isExpanded};" onclick="event.stopPropagation()">
        <div class="hist-theme-list">
          <h4>Desempenho por Tema:</h4>
          ${themesHTML || '<p style="font-size:11px;color:var(--text3)">Estatísticas por tema indisponíveis para este simulado antigo.</p>'}
        </div>
        <button class="btn-sm blue" style="margin-top:12px; width:100%; justify-content: center;" onclick="goScreen('errors'); filterErrorsBySession('${h.id}');">
          Ver erros desta iteração →
        </button>
      </div>
    </div>`;
  }).join('');
}

function clearHistory() {
  if (!confirm('Clear exam history?')) return;
  history = [];
  save(STORE_HISTORY, history);
  renderHistory();
  renderHomeStats();
  toast('History cleared');
}

/* ══════════════════════════════════════════════
   SCREENS
══════════════════════════════════════════════ */
function goScreen(name) {
  ['home','exam','errors','history'].forEach(s => {
    document.getElementById(`screen-${s}`).style.display = 'none';
    document.getElementById(`nav-${s}`).classList.remove('active');
  });
  document.getElementById(`screen-${name}`).style.display = 'block';
  document.getElementById(`nav-${name}`).classList.add('active');

  if (name === 'errors')  renderErrors();
  if (name === 'history') renderHistory();
  if (name === 'home')    { renderHomeStats(); renderDistGrid(selectedSize); checkActiveSession(); }
  if (name === 'exam' && session) renderExam();
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function iconCheck() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}
function iconX() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 2500);
}

/* ══════════════════════════════════════════════
   EVOLUTION CHARTS & STATS
══════════════════════════════════════════════ */
function drawTotalEvolutionChart() {
  const container = document.getElementById('total-evolution-chart');
  if (!container) return;

  const last10 = history.slice(0, 10).reverse();
  const N = last10.length;

  const width = 500;
  const height = 160;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 25;
  const effW = width - paddingLeft - paddingRight;
  const effH = height - paddingTop - paddingBottom;
  const baseY = height - paddingBottom; // 135

  const points = last10.map((h, i) => {
    const x = N === 1 ? paddingLeft + effW / 2 : paddingLeft + (i / (N - 1)) * effW;
    const y = baseY - (h.pct / 100) * effH;
    return { x, y, pct: h.pct, date: h.date };
  });

  // Grid and Y labels
  let svgContent = `
    <defs>
      <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--blue)" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    <!-- Y Grid Lines -->
    <line x1="${paddingLeft}" y1="15" x2="${width - paddingRight}" y2="15" stroke="var(--border)" stroke-dasharray="3,3" />
    <line x1="${paddingLeft}" y1="51" x2="${width - paddingRight}" y2="51" stroke="var(--green)" stroke-dasharray="4,4" stroke-width="1.2" />
    <text x="${width - paddingRight}" y="47" text-anchor="end" fill="var(--green)" font-size="9" font-weight="600">Meta (70%)</text>
    <line x1="${paddingLeft}" y1="75" x2="${width - paddingRight}" y2="75" stroke="var(--border)" stroke-dasharray="3,3" />
    <line x1="${paddingLeft}" y1="${baseY}" x2="${width - paddingRight}" y2="${baseY}" stroke="var(--text3)" stroke-width="1" />

    <!-- Y Labels -->
    <text x="35" y="19" text-anchor="end" fill="var(--text3)" font-size="9" font-family="var(--mono)">100%</text>
    <text x="35" y="55" text-anchor="end" fill="var(--green)" font-size="9" font-family="var(--mono)" font-weight="600">70%</text>
    <text x="35" y="79" text-anchor="end" fill="var(--text3)" font-size="9" font-family="var(--mono)">50%</text>
    <text x="35" y="139" text-anchor="end" fill="var(--text3)" font-size="9" font-family="var(--mono)">0%</text>
  `;

  if (points.length > 0) {
    let linePathD = '';
    let areaPathD = '';

    points.forEach((p, i) => {
      if (i === 0) {
        linePathD += `M ${p.x},${p.y}`;
        areaPathD += `M ${p.x},${baseY} L ${p.x},${p.y}`;
      } else {
        linePathD += ` L ${p.x},${p.y}`;
        areaPathD += ` L ${p.x},${p.y}`;
      }
    });

    if (points.length === 1) {
      linePathD = `M ${points[0].x - 15},${points[0].y} L ${points[0].x + 15},${points[0].y}`;
      areaPathD = `M ${points[0].x - 15},${baseY} L ${points[0].x - 15},${points[0].y} L ${points[0].x + 15},${points[0].y} L ${points[0].x + 15},${baseY} Z`;
    } else {
      areaPathD += ` L ${points[points.length - 1].x},${baseY} Z`;
    }

    svgContent += `
      <!-- Area Fill -->
      <path d="${areaPathD}" fill="url(#chart-grad)" />
      <!-- Line -->
      <path d="${linePathD}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;

    points.forEach(p => {
      const shortDate = p.date.split(',')[0].trim().slice(0, 5); // DD/MM
      svgContent += `
        <!-- X Label -->
        <text x="${p.x}" y="152" text-anchor="middle" fill="var(--text3)" font-size="9" font-family="var(--mono)">${shortDate}</text>
        
        <!-- Score Label -->
        <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="700" font-family="var(--mono)">${p.pct}%</text>
        
        <!-- Dot Halo -->
        <circle cx="${p.x}" cy="${p.y}" r="6" fill="var(--blue)" opacity="0.15" />
        <!-- Dot -->
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--bg)" stroke="var(--blue)" stroke-width="2.5" />
      `;
    });
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:100%; overflow:visible;">
      ${svgContent}
    </svg>
  `;
}

function drawThemeEvolutionGrid() {
  const container = document.getElementById('theme-evolution-grid');
  if (!container) return;

  const sections = [
    'Setting up a cloud solution environment',
    'Planning and configuring a cloud solution',
    'Deploying and implementing a cloud solution',
    'Ensuring successful operation of a cloud solution',
    'Configuring access and security'
  ];

  const cumulative = {};
  sections.forEach(s => {
    cumulative[s] = { correct: 0, total: 0 };
  });

  history.forEach(h => {
    if (h.themes) {
      Object.entries(h.themes).forEach(([section, val]) => {
        if (!cumulative[section]) {
          cumulative[section] = { correct: 0, total: 0 };
        }
        cumulative[section].correct += val.correct;
        cumulative[section].total += val.total;
      });
    }
  });

  const translationMap = {
    'Setting up a cloud solution environment': '1. Configurando o Ambiente de Nuvem',
    'Planning and configuring a cloud solution': '2. Planejando e Configurando Soluções',
    'Deploying and implementing a cloud solution': '3. Implantando e Implementando Soluções',
    'Ensuring successful operation of a cloud solution': '4. Garantindo a Operação Bem-sucedida',
    'Configuring access and security': '5. Configurando Acesso e Segurança'
  };

  let html = '';
  const allSections = Array.from(new Set([...sections, ...Object.keys(cumulative)]));

  allSections.forEach(section => {
    const stats = cumulative[section] || { correct: 0, total: 0 };
    const hasData = stats.total > 0;
    const pct = hasData ? Math.round((stats.correct / stats.total) * 100) : 0;
    
    let statusClass = 'empty';
    if (hasData) {
      statusClass = pct >= 70 ? 'pass' : 'fail';
    }

    const title = translationMap[section] || section;
    const subText = hasData 
      ? `${stats.correct} de ${stats.total} acertos` 
      : 'Nenhuma questão respondida';

    html += `
      <div class="theme-progress-card">
        <div class="theme-progress-header">
          <div class="theme-progress-label">${escHtml(title)}</div>
          <div class="theme-progress-pct ${statusClass}">${hasData ? pct + '%' : '--'}</div>
        </div>
        <div class="theme-progress-bar-wrap">
          <div class="theme-progress-bar ${statusClass}" style="width: ${hasData ? pct : 0}%"></div>
        </div>
        <div class="theme-progress-sub">${subText}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/* ══════════════════════════════════════════════
   GIT META
══════════════════════════════════════════════ */
const BUILT_COMMIT_SHA = '__COMMIT_SHA__';

async function loadGitMeta() {
  const el = document.getElementById('footer-commit-meta');
  const link = document.getElementById('footer-repo-link');
  if (!el) return;

  const owner = "dny8888";
  const repo = "simulado-GCP-ACE";

  let finalOwner = owner;
  let finalRepo = repo;
  if (window.location.hostname.endsWith('github.io')) {
    const user = window.location.hostname.split('.')[0];
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (user && pathParts.length > 0) {
      finalOwner = user;
      finalRepo = pathParts[0];
    }
  }

  if (link) {
    link.href = `https://github.com/${finalOwner}/${finalRepo}`;
    link.textContent = `📦 ${finalOwner}/${finalRepo}`;
  }

  // Se o SHA foi injetado no build (GitHub Actions), usamos diretamente!
  // Isso garante 100% de precisão sobre a versão do PWA que está rodando localmente.
  if (BUILT_COMMIT_SHA !== '__COMMIT_SHA__') {
    const shortSha = BUILT_COMMIT_SHA.slice(0, 7);
    const url = `https://github.com/${finalOwner}/${finalRepo}/commit/${BUILT_COMMIT_SHA}`;
    renderGitMeta(shortSha, url);
    return;
  }

  const cacheKey = 'gcp-ace-git-meta';
  const cached = load(cacheKey, null);
  const now = Date.now();

  if (cached && (now - cached.timestamp < 3600000)) {
    renderGitMeta(cached.sha, cached.url);
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${finalOwner}/${finalRepo}/commits`);
    if (!res.ok) throw new Error('API error');
    const commits = await res.json();
    if (commits && commits.length > 0) {
      const sha = commits[0].sha.slice(0, 7);
      const url = commits[0].html_url;
      const meta = { sha, url, timestamp: now };
      save(cacheKey, meta);
      renderGitMeta(sha, url);
    } else {
      throw new Error('No commits found');
    }
  } catch (err) {
    if (cached) {
      renderGitMeta(cached.sha, cached.url);
    } else {
      el.innerHTML = `<span style="color:var(--text3)">offline / local</span>`;
    }
  }
}

function renderGitMeta(sha, url) {
  const el = document.getElementById('footer-commit-meta');
  if (el) {
    el.innerHTML = `<a href="${url}" target="_blank" class="footer-link" style="font-family:inherit;font-weight:inherit;">SHA: ${sha}</a>`;
  }
}

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
loadQuestions();
loadGitMeta();

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  save('gcp-ace-theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-btn').textContent = isLight ? '🌙' : '☀️';
  document.querySelector('meta[name="theme-color"]').setAttribute("content", isLight ? "#f6f8fa" : "#0d1117");
}

function handleKey(e, qId, letter) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    answer(qId, letter);
  }
}


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });

  // Recarrega a página automaticamente quando a nova versão (v2) assume o controle
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}