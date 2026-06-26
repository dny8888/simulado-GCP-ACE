import os

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace renderErrors
old_render_errors_block = """function renderErrors() {
  const list = Object.values(errors);
  const el = document.getElementById('errors-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">✓</div>
      <p>No errors logged yet.<br>Answer questions and wrong answers appear here automatically.</p>
    </div>`;
    return;
  }

  // Copy-all button
  const allText = buildAIPrompt(list);

  el.innerHTML = `
    <button class="btn-sm blue" style="margin-bottom:16px" onclick="copyAllForAI()">
      📋 Copy all ${list.length} error(s) for AI analysis
    </button>` +
    list.map(e => `
    <div class="err-card">
      <div class="err-answer-row">
        <span class="q-tag dom" style="display:inline-block;margin-bottom:6px">${escHtml(e.domain)}</span>
      </div>
      <div class="eq">${escHtml(e.question)}</div>
      <div class="err-answer-row">
        <span class="err-yours">✗ Your answer: ${e.yourAnswer}. ${escHtml(e.yourAnswerText||'')}</span>
        <span class="err-correct">✓ Correct: ${e.correct}. ${escHtml(e.correctText||'')}</span>
      </div>
      <div class="err-actions">
        <button class="btn-sm" onclick="toggleErrExp(${e.id})">💡 Explanation</button>
        <button class="btn-sm blue" onclick="copySingleForAI(${e.id})">📋 Copy for AI</button>
        <button class="btn-sm active" onclick="removeError(${e.id})">✕ Remove</button>
      </div>
      <div class="explanation" id="errexp-${e.id}">
        <strong>Explanation:</strong> ${escHtml(e.explanation||'No explanation available.')}
      </div>
    </div>`).join('');
}"""

new_render_errors_block = """let openErrorGroups = {};
let filterSessionId = null;

function filterErrorsBySession(id) {
  filterSessionId = id;
  openErrorGroups[id] = true;
  renderErrors();
  setTimeout(() => {
    const el = document.getElementById(`err-group-container-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function toggleErrorGroup(id) {
  openErrorGroups[id] = !openErrorGroups[id];
  const el = document.getElementById(`err-group-container-${id}`);
  if (el) {
    el.classList.toggle('open', openErrorGroups[id]);
  }
}

function removeSimulationError(sessionId, qId) {
  const h = history.find(x => x.id === sessionId);
  if (h) {
    h.removedErrors = h.removedErrors || [];
    if (!h.removedErrors.includes(qId)) {
      h.removedErrors.push(qId);
      save(STORE_HISTORY, history);
      renderErrors();
      renderErrorBadge();
      renderHomeStats();
      toast('Erro removido do log');
    }
  }
}

function copySimulationErrorsForAI(sessionId) {
  const h = history.find(x => x.id === sessionId);
  if (!h) return;
  
  const list = [];
  Object.entries(h.answers).forEach(([qId, ans]) => {
    const id = parseInt(qId);
    if (!ans.correct && !(h.removedErrors && h.removedErrors.includes(id))) {
      const q = questions.find(x => x.id === id);
      if (q) {
        list.push({
          question: q.text,
          domain: q.domain,
          options: q.options,
          yourAnswer: Array.isArray(ans.chosen) ? ans.chosen.sort().join(', ') : ans.chosen,
          yourAnswerText: Array.isArray(ans.chosen) ? ans.chosen.map(c => q.options[c]).join(' | ') : q.options[ans.chosen],
          correct: q.answer,
          correctText: q.answer.split(',').map(c => q.options[c.trim()]).join(' | '),
          explanation: q.explanation
        });
      }
    }
  });

  const text = buildAIPrompt(list);
  navigator.clipboard.writeText(text).then(() => toast(`Copied ${list.length} errors to clipboard!`));
}

function copySingleForAISim(sessionId, qId) {
  const h = history.find(x => x.id === sessionId);
  if (!h) return;
  const ans = h.answers[qId];
  const q = questions.find(x => x.id === qId);
  if (!q || !ans) return;

  const chosenStr = Array.isArray(ans.chosen) ? ans.chosen.sort().join(', ') : ans.chosen;
  const chosenText = Array.isArray(ans.chosen) ? ans.chosen.map(c => q.options[c]).join(' | ') : q.options[ans.chosen];
  const correctArr = q.answer.split(',').map(c => c.trim());
  const correctText = correctArr.map(c => q.options[c]).join(' | ');

  const text = buildAIPrompt([{
    question: q.text,
    domain: q.domain,
    options: q.options,
    yourAnswer: chosenStr,
    yourAnswerText: chosenText,
    correct: q.answer,
    correctText: correctText,
    explanation: q.explanation
  }]);
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'));
}

function renderErrors() {
  const el = document.getElementById('errors-list');
  el.innerHTML = '';

  const studyErrors = Object.values(errors);
  const groups = [];
  
  history.forEach(h => {
    if (!h.answers) return;
    const simErrors = [];
    Object.entries(h.answers).forEach(([qId, ans]) => {
      const id = parseInt(qId);
      if (!ans.correct && !(h.removedErrors && h.removedErrors.includes(id))) {
        const q = questions.find(x => x.id === id);
        if (q) {
          simErrors.push({ q, ans });
        }
      }
    });
    if (simErrors.length > 0) {
      groups.push({
        id: h.id,
        date: h.date,
        pct: h.pct,
        mode: h.mode,
        errors: simErrors
      });
    }
  });

  const totalErrors = studyErrors.length + groups.reduce((acc, g) => acc + g.errors.length, 0);

  if (totalErrors === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">✓</div>
      <p>Nenhum erro registrado.<br>As questões que você errar nos simulados ou no Modo Estudo aparecerão aqui.</p>
    </div>`;
    return;
  }

  let html = '';

  if (studyErrors.length > 0) {
    const isOpened = openErrorGroups['study'] !== false;
    openErrorGroups['study'] = isOpened;
    const openClass = isOpened ? 'open' : '';
    
    html += `
    <div class="error-group ${openClass}" id="err-group-container-study">
      <div class="error-group-header" onclick="toggleErrorGroup('study')">
        <div class="error-group-title">
          <span>📚 Erros do Modo Estudo (${studyErrors.length})</span>
        </div>
        <div class="error-group-header-actions" onclick="event.stopPropagation()">
          <button class="btn-sm blue" onclick="copyAllForAI()">📋 Copiar todos</button>
        </div>
      </div>
      <div class="error-group-content">
        ${studyErrors.map(e => `
          <div class="err-card">
            <div class="err-answer-row">
              <span class="q-tag dom" style="display:inline-block;margin-bottom:6px">${escHtml(e.domain)}</span>
            </div>
            <div class="eq">${escHtml(e.question)}</div>
            <div class="err-answer-row">
              <span class="err-yours">✗ Sua Resposta: ${e.yourAnswer}. ${escHtml(e.yourAnswerText||'')}</span>
              <span class="err-correct">✓ Correta: ${e.correct}. ${escHtml(e.correctText||'')}</span>
            </div>
            <div class="err-actions">
              <button class="btn-sm" onclick="toggleErrExp(${e.id})">💡 Explicação</button>
              <button class="btn-sm blue" onclick="copySingleForAI(${e.id})">📋 Copiar para IA</button>
              <button class="btn-sm active" onclick="removeError(${e.id})">✕ Remover</button>
            </div>
            <div class="explanation" id="errexp-${e.id}">
              <strong>Explicação:</strong> ${escHtml(e.explanation||'Sem explicação.')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  groups.forEach(g => {
    const isOpened = !!openErrorGroups[g.id];
    const openClass = isOpened ? 'open' : '';
    const modeLabel = g.mode === 'exam' ? 'Prova' : 'Estudo';
    
    html += `
    <div class="error-group ${openClass}" id="err-group-container-${g.id}">
      <div class="error-group-header" onclick="toggleErrorGroup('${g.id}')">
        <div class="error-group-title">
          <span>📝 Simulado · ${g.date} (${modeLabel} - ${g.pct}%) · ${g.errors.length} erros</span>
        </div>
        <div class="error-group-header-actions" onclick="event.stopPropagation()">
          <button class="btn-sm blue" onclick="copySimulationErrorsForAI('${g.id}')">📋 Copiar erros</button>
        </div>
      </div>
      <div class="error-group-content">
        ${g.errors.map(({ q, ans }) => {
          const chosenStr = Array.isArray(ans.chosen) ? ans.chosen.sort().join(', ') : ans.chosen;
          const chosenText = Array.isArray(ans.chosen) ? ans.chosen.map(c => q.options[c]).join(' | ') : q.options[ans.chosen];
          const correctArr = q.answer.split(',').map(c => c.trim());
          const correctText = correctArr.map(c => q.options[c]).join(' | ');
          
          return `
          <div class="err-card">
            <div class="err-answer-row">
              <span class="q-tag dom" style="display:inline-block;margin-bottom:6px">${escHtml(q.domain)}</span>
            </div>
            <div class="eq">${escHtml(q.text)}</div>
            <div class="err-answer-row">
              <span class="err-yours">✗ Sua Resposta: ${chosenStr}. ${escHtml(chosenText||'')}</span>
              <span class="err-correct">✓ Correta: ${q.answer}. ${escHtml(correctText||'')}</span>
            </div>
            <div class="err-actions">
              <button class="btn-sm" onclick="toggleErrExp(${q.id})">💡 Explicação</button>
              <button class="btn-sm blue" onclick="copySingleForAISim('${g.id}', ${q.id})">📋 Copiar para IA</button>
              <button class="btn-sm active" onclick="removeSimulationError('${g.id}', ${q.id})">✕ Remover</button>
            </div>
            <div class="explanation" id="errexp-${q.id}">
              <strong>Explicação:</strong> ${escHtml(q.explanation||'Sem explicação.')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  el.innerHTML = html;
}"""

js = js.replace(old_render_errors_block, new_render_errors_block)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("renderErrors updated.")
