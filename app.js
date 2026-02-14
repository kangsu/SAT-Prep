"use strict";

const STORAGE = {
  sources: "sat-prep.sources.v1",
  library: "sat-prep.library.v1",
  progress: "sat-prep.progress.v1"
};

const DEFAULT_SOURCES = [
  { id: "english-hard", name: "English Hard", subject: "english", path: "assets/pdfs/English Hard.pdf", pageCount: 256 },
  { id: "math-hard", name: "Math Hard", subject: "math", path: "assets/pdfs/Math Hard.pdf", pageCount: 282 }
];

const DOMAIN_SKILL_MAP = {
  english: {
    "Information and Ideas": [
      "Central Ideas and Details",
      "Command of Evidence",
      "Inferences"
    ],
    "Craft and Structure": [
      "Words in Context",
      "Text Structure and Purpose",
      "Cross-Text Connections"
    ],
    "Expression of Ideas": [
      "Rhetorical Synthesis",
      "Transitions"
    ],
    "Standard English Conventions": [
      "Boundaries",
      "Form, Structure, and Sense"
    ]
  },
  math: {
    "Algebra": [
      "Linear Equations in One Variable",
      "Linear Equations in Two Variables",
      "Linear Functions",
      "Systems of Two Linear Equations in Two Variables",
      "Linear Inequalities in One or Two Variables"
    ],
    "Advanced Math": [
      "Equivalent Expressions",
      "Nonlinear Equations in One Variable and Systems of Equations in Two Variables",
      "Nonlinear Functions"
    ],
    "Problem-Solving and Data Analysis": [
      "Ratios, Rates, Proportional Relationships, and Units",
      "Percentages",
      "One-Variable Data: Distributions and Measures of Center and Spread",
      "Two-Variable Data: Models and Scatterplots",
      "Probability and Conditional Probability",
      "Inference From Sample Statistics and Margin of Error",
      "Evaluating Statistical Claims: Observational Studies and Experiments"
    ],
    "Geometry and Trigonometry": [
      "Area and Volume",
      "Lines, Angles, and Triangles",
      "Right Triangles and Trigonometry",
      "Circles"
    ]
  }
};

const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const ANSWER_MASK_UPWARD_OFFSET_PX = 22;
const state = { sources: [], library: [], index: new Map(), progress: {}, session: null, promptToken: 0 };
const pdfDocCache = new Map();
const ui = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUi();
  loadState();
  wireEvents();
  renderAll();
}

function bindUi() {
  const ids = [
    "stat-total-questions", "stat-attempted", "stat-accuracy",
    "session-form", "session-subject", "session-status", "session-domain", "session-skill", "session-count", "type-checkboxes", "session-message",
    "question-card", "question-counter", "question-title", "question-tags", "prompt-view",
    "choice-list", "free-answer", "submit-answer-btn", "mark-correct-btn", "mark-wrong-btn",
    "reveal-answer-btn", "next-question-btn", "feedback", "hint-line", "answer-panel",
    "library-search", "library-status-filter", "library-body", "library-footnote",
    "question-form", "form-question-id", "form-subject", "form-source", "form-start-page", "form-end-page",
    "form-domain", "form-skill", "form-types", "form-choices", "form-correct-answer", "form-hint", "form-answer", "form-notes",
    "form-active", "clear-form-btn",
    "bulk-form", "bulk-source", "bulk-start", "bulk-end", "bulk-subject", "bulk-types", "bulk-apply-tags-btn", "parse-pdf-btn", "bulk-message",
    "source-form", "source-list",
    "export-btn", "import-input", "reset-progress-btn", "reset-all-btn",
    "progress-attempted", "progress-correct", "progress-incorrect", "progress-review", "progress-body",
    "domain-progress-body", "skill-progress-body"
  ];
  for (const id of ids) ui[keyOf(id)] = document.getElementById(id);
}

function keyOf(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function wireEvents() {
  ui.sessionForm.addEventListener("submit", startSession);
  ui.sessionSubject.addEventListener("change", renderDomainSkillFilters);
  ui.sessionDomain.addEventListener("change", renderDomainSkillFilters);
  ui.submitAnswerBtn.addEventListener("click", submitAnswer);
  ui.markCorrectBtn.addEventListener("click", () => manualGrade("correct"));
  ui.markWrongBtn.addEventListener("click", () => manualGrade("wrong"));
  ui.revealAnswerBtn.addEventListener("click", revealAnswer);
  ui.nextQuestionBtn.addEventListener("click", nextQuestion);

  ui.librarySearch.addEventListener("input", renderLibraryTable);
  ui.libraryStatusFilter.addEventListener("change", renderLibraryTable);
  ui.libraryBody.addEventListener("click", onLibraryClick);
  ui.libraryBody.addEventListener("change", onLibraryChange);

  ui.questionForm.addEventListener("submit", saveQuestion);
  ui.clearFormBtn.addEventListener("click", clearQuestionForm);

  ui.bulkForm.addEventListener("submit", bulkCreate);
  ui.bulkApplyTagsBtn.addEventListener("click", bulkApplyTags);
  ui.parsePdfBtn.addEventListener("click", parseAllSources);
  ui.sourceForm.addEventListener("submit", saveSources);

  ui.exportBtn.addEventListener("click", exportData);
  ui.importInput.addEventListener("change", importData);
  ui.resetProgressBtn.addEventListener("click", resetProgress);
  ui.resetAllBtn.addEventListener("click", resetAll);
}

function loadState() {
  state.sources = hydrateSources(loadJson(STORAGE.sources, []));
  state.library = hydrateLibrary(loadJson(STORAGE.library, []));
  if (!state.library.length) {
    state.library = seedFromSources(state.sources);
    saveLibrary();
  }
  state.progress = hydrateProgress(loadJson(STORAGE.progress, {}));
  sortLibrary();
  rebuildIndex();
}

function renderAll() {
  renderSourceSelects();
  renderSourceEditor();
  renderTypeFilter();
  renderDomainSkillFilters();
  renderLibraryTable();
  renderProgress();
  renderStats();
  renderCurrentQuestion();
}

function saveSourcesJson() { localStorage.setItem(STORAGE.sources, JSON.stringify(state.sources)); }
function saveLibrary() { localStorage.setItem(STORAGE.library, JSON.stringify(state.library)); }
function saveProgress() { localStorage.setItem(STORAGE.progress, JSON.stringify(state.progress)); }

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function rebuildIndex() {
  state.index = new Map(state.library.map((q) => [q.id, q]));
}

function sourceById(id) {
  return state.sources.find((s) => s.id === id) || null;
}

function sourceLabel(id) {
  return sourceById(id)?.name || id;
}

function sortLibrary() {
  const order = { english: 0, math: 1 };
  state.library.sort((a, b) => (order[a.subject] - order[b.subject]) || a.sourceId.localeCompare(b.sourceId) || ((a.startPage || a.page) - (b.startPage || b.page)) || ((a.endPage || a.page) - (b.endPage || b.page)) || a.id.localeCompare(b.id));
}

function renderSourceSelects() {
  for (const select of [ui.formSource, ui.bulkSource]) {
    const prev = select.value;
    select.innerHTML = "";
    for (const s of state.sources) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `${s.name} (${s.pageCount} pages)`;
      select.appendChild(o);
    }
    if (prev && state.sources.some((s) => s.id === prev)) select.value = prev;
  }
}

function renderSourceEditor() {
  ui.sourceList.innerHTML = "";
  for (const s of state.sources) {
    const box = document.createElement("div");
    box.className = "stack-form";
    box.dataset.sourceId = s.id;
    box.innerHTML = `
      <h4>${s.name}</h4>
      <label>PDF path or URL<input type="text" data-field="path" data-source-id="${s.id}" value="${escapeHtml(s.path)}"></label>
      <label>Page count<input type="number" min="1" data-field="pageCount" data-source-id="${s.id}" value="${s.pageCount}"></label>
      <label>Default subject
        <select data-field="subject" data-source-id="${s.id}">
          <option value="english" ${s.subject === "english" ? "selected" : ""}>English</option>
          <option value="math" ${s.subject === "math" ? "selected" : ""}>Math</option>
        </select>
      </label>`;
    ui.sourceList.appendChild(box);
  }
}

function renderTypeFilter() {
  const checked = new Set([...ui.typeCheckboxes.querySelectorAll("input:checked")].map((i) => i.value));
  const tags = [...new Set(state.library.flatMap((q) => q.types))].sort();
  ui.typeCheckboxes.innerHTML = "";
  if (!tags.length) {
    ui.typeCheckboxes.textContent = "No type tags saved yet.";
    return;
  }
  for (const tag of tags) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    input.checked = checked.has(tag);
    label.append(input, document.createTextNode(tag));
    ui.typeCheckboxes.appendChild(label);
  }
}

function renderDomainSkillFilters() {
  const selectedSubject = ui.sessionSubject.value || "all";
  const previousDomain = ui.sessionDomain.value || "all";
  const previousSkill = ui.sessionSkill.value || "all";
  const subjects = subjectsFromFilter(selectedSubject);

  const parsedDomainItems = state.library.filter((q) => {
    if (!q.active) return false;
    if (!subjects.includes(q.subject)) return false;
    return Boolean(q.domain);
  });
  const canonicalDomains = subjects.flatMap((subject) => knownDomainsForSubject(subject));
  const domains = uniqKeepCase([...canonicalDomains, ...parsedDomainItems.map((q) => q.domain)]).sort((a, b) => a.localeCompare(b));
  setFilterOptions(ui.sessionDomain, domains, "All domains", previousDomain);

  const selectedDomain = ui.sessionDomain.value || "all";
  const parsedSkillItems = state.library.filter((q) => {
    if (!q.active) return false;
    if (!subjects.includes(q.subject)) return false;
    if (!matchesDomainFilter(q, selectedDomain)) return false;
    return Boolean(q.skill);
  });
  const canonicalSkills = subjects.flatMap((subject) => knownSkillsForSubjectAndDomain(subject, selectedDomain));
  const skills = uniqKeepCase([...canonicalSkills, ...parsedSkillItems.map((q) => q.skill)]).sort((a, b) => a.localeCompare(b));
  setFilterOptions(ui.sessionSkill, skills, "All skills", previousSkill);
}

function setFilterOptions(select, values, allLabel, preferred) {
  const previous = preferred || "all";
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = allLabel;
  select.appendChild(all);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  if ([...select.options].some((opt) => opt.value === previous)) {
    select.value = previous;
  } else {
    select.value = "all";
  }
}

function renderStats() {
  const total = state.library.filter((q) => q.active).length;
  const rows = Object.values(state.progress);
  const attempted = rows.filter((r) => r.attempts > 0).length;
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const wrong = rows.reduce((n, r) => n + r.wrong, 0);
  const pct = correct + wrong ? Math.round((100 * correct) / (correct + wrong)) : 0;
  ui.statTotalQuestions.textContent = String(total);
  ui.statAttempted.textContent = String(attempted);
  ui.statAccuracy.textContent = `${pct}%`;
}

function startSession(event) {
  event.preventDefault();
  const subject = ui.sessionSubject.value;
  const status = ui.sessionStatus.value;
  const domain = ui.sessionDomain.value;
  const skill = ui.sessionSkill.value;
  const count = clampInt(ui.sessionCount.value, 1, 100, 10);
  const tags = [...ui.typeCheckboxes.querySelectorAll("input:checked")].map((i) => i.value);
  const pool = state.library.filter((q) => {
    if (!q.active) return false;
    if (subject !== "all" && q.subject !== subject) return false;
    if (!matchesDomainFilter(q, domain)) return false;
    if (!matchesSkillFilter(q, skill)) return false;
    if (tags.length && !tags.some((tag) => q.types.includes(tag))) return false;
    return matchesStatus(q.id, status);
  });
  if (!pool.length) {
    const basePool = state.library.filter((q) => {
      if (!q.active) return false;
      if (subject !== "all" && q.subject !== subject) return false;
      if (tags.length && !tags.some((tag) => q.types.includes(tag))) return false;
      return matchesStatus(q.id, status);
    });
    const domainTagged = basePool.filter((q) => Boolean(questionDomain(q))).length;
    const skillTagged = basePool.filter((q) => Boolean(String(q.skill || "").trim())).length;
    if ((domain !== "all" || skill !== "all") && (domainTagged === 0 || (skill !== "all" && skillTagged === 0))) {
      ui.sessionMessage.textContent = "No questions are tagged for that Domain/Skill yet. Run \"Parse PDFs For Domain/Skill + Ranges\" in Admin Tools.";
    } else {
      ui.sessionMessage.textContent = "No matching questions found.";
    }
    state.session = null;
    renderCurrentQuestion();
    return;
  }
  shuffle(pool);
  const ids = pool.slice(0, Math.min(count, pool.length)).map((q) => q.id);
  state.session = { ids, idx: 0, graded: {}, submitted: {}, correct: 0, wrong: 0 };
  ui.sessionMessage.textContent = `Session started with ${ids.length} questions.`;
  renderCurrentQuestion();
}

function currentQuestion() {
  if (!state.session) return null;
  return state.index.get(state.session.ids[state.session.idx]) || null;
}

function hasSubmittedCurrentQuestion() {
  const q = currentQuestion();
  if (!q || !state.session || !state.session.submitted) return false;
  return Boolean(state.session.submitted[q.id]);
}

function renderCurrentQuestion() {
  resetFeedback();
  const q = currentQuestion();
  if (!q) {
    ui.questionCard.classList.add("hidden");
    return;
  }
  ui.questionCard.classList.remove("hidden");
  const startPage = q.startPage || q.page;
  const endPage = q.endPage || q.page;
  const pageLabel = startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}-${endPage}`;
  ui.questionCounter.textContent = `Question ${state.session.idx + 1} of ${state.session.ids.length}`;
  ui.questionTitle.textContent = `${capitalize(q.subject)} | ${sourceLabel(q.sourceId)} | ${pageLabel}`;

  ui.questionTags.innerHTML = "";
  for (const tag of q.types) ui.questionTags.appendChild(makeChip(tag));
  if (q.domain) ui.questionTags.appendChild(makeChip(`domain: ${q.domain}`));
  if (q.skill) ui.questionTags.appendChild(makeChip(`skill: ${q.skill}`));
  ui.questionTags.appendChild(makeChip(`status: ${statusText(questionStatus(q.id))}`));

  renderPrompt(q);
  renderChoices(q);

  ui.submitAnswerBtn.classList.remove("hidden");
  ui.submitAnswerBtn.disabled = false;
  ui.markCorrectBtn.classList.add("hidden");
  ui.markWrongBtn.classList.add("hidden");
  ui.revealAnswerBtn.classList.add("hidden");
  ui.nextQuestionBtn.classList.add("hidden");
  ui.nextQuestionBtn.textContent = state.session.idx === state.session.ids.length - 1 ? "Finish Session" : "Next Question";
  setAnswerDisabled(false);
}

function renderPrompt(q) {
  ui.promptView.innerHTML = "";
  const src = sourceById(q.sourceId);
  if (!src?.path) {
    const msg = document.createElement("div");
    msg.className = "empty";
    msg.textContent = "No PDF path is set for this source.";
    ui.promptView.appendChild(msg);
    return;
  }

  const startPage = q.startPage || q.page;
  const endPage = q.endPage || q.page;
  const pageUrl = pdfPageUrl(src.path, startPage);
  const showAnswers = hasSubmittedCurrentQuestion();
  if (!pageUrl) {
    const msg = document.createElement("div");
    msg.className = "empty";
    msg.textContent = "Could not resolve the PDF path for this question source.";
    ui.promptView.appendChild(msg);
    return;
  }

  const token = ++state.promptToken;
  if (!ensurePdfJs()) {
    renderIframePrompt(pageUrl, token);
    appendPromptLink(pageUrl);
    return;
  }

  renderPromptPages(src.path, startPage, endPage, token, pageUrl, showAnswers);
}

async function renderPromptPages(path, startPage, endPage, token, fallbackUrl, showAnswers) {
  const pagesWrap = document.createElement("div");
  pagesWrap.className = "prompt-pages";
  ui.promptView.appendChild(pagesWrap);
  try {
    const doc = await loadPdfDocument(path);
    if (token !== state.promptToken) return;

    const maxPage = doc.numPages;
    const safeStart = clampInt(startPage, 1, maxPage, 1);
    const safeEnd = clampInt(endPage, safeStart, maxPage, safeStart);

    for (let pageNum = safeStart; pageNum <= safeEnd; pageNum += 1) {
      if (token !== state.promptToken) return;
      const page = await doc.getPage(pageNum);
      if (token !== state.promptToken) return;
      const viewport = page.getViewport({ scale: 1.35 });
      const block = document.createElement("section");
      block.className = "prompt-page";
      const label = document.createElement("p");
      label.className = "prompt-page-label";
      label.textContent = `PDF page ${pageNum}`;
      block.appendChild(label);

      const visual = document.createElement("div");
      visual.className = "prompt-page-visual";
      block.appendChild(visual);

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      visual.appendChild(canvas);
      pagesWrap.appendChild(block);

      await page.render({ canvasContext: context, viewport }).promise;
      if (!showAnswers) {
        const textContent = await page.getTextContent();
        const maskTop = findAnswerMaskTop(textContent, viewport);
        if (maskTop !== null) {
          const mask = document.createElement("div");
          mask.className = "answer-mask";
          const adjustedTop = clampNumber(maskTop - ANSWER_MASK_UPWARD_OFFSET_PX, 0, canvas.height - 1);
          const topRatio = clampNumber(adjustedTop / Math.max(canvas.height, 1), 0, 1);
          mask.style.top = `${(topRatio * 100).toFixed(3)}%`;
          mask.innerHTML = "<span>Answer hidden until you submit</span>";
          visual.appendChild(mask);
        }
      }
    }
    appendPromptLink(pdfPageUrl(path, safeStart));
  } catch (error) {
    if (token !== state.promptToken) return;
    ui.promptView.innerHTML = "";
    renderIframePrompt(fallbackUrl, token);
    appendPromptLink(fallbackUrl);
    setBulkMsg(`PDF render fallback used: ${error.message}`);
  }
}

function renderIframePrompt(pageUrl, token) {
  if (token !== state.promptToken) return;
  const iframe = document.createElement("iframe");
  iframe.src = pageUrl;
  iframe.loading = "lazy";
  iframe.title = "Question prompt";
  ui.promptView.appendChild(iframe);
}

function appendPromptLink(pageUrl) {
  const note = document.createElement("p");
  note.className = "prompt-note";
  note.append("If preview fails, ");
  const link = document.createElement("a");
  link.href = pageUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "open this PDF page";
  note.appendChild(link);
  note.append(".");
  ui.promptView.appendChild(note);
}

function findAnswerMaskTop(textContent, viewport) {
  const items = textContent?.items || [];
  const lines = extractTextLines(items, viewport);
  if (!lines.length) return null;

  // Primary rule: mask from "Correct Answer:" line downward.
  // This avoids covering answer choices above the explanation block.
  const anchors = [];
  for (const line of lines) {
    if (hasCorrectAnswerAnchor(line.text)) {
      anchors.push(line.y);
    }
  }

  // Some PDFs split "Correct" and "Answer:" into neighboring lines.
  for (let i = 0; i < lines.length - 1; i += 1) {
    const merged = `${lines[i].text} ${lines[i + 1].text}`.replace(/\s+/g, " ").trim();
    if (hasCorrectAnswerAnchor(merged)) {
      anchors.push(Math.max(lines[i].y, lines[i + 1].y));
    }
  }

  if (!anchors.length) return null;

  // Prefer anchors in the lower part of the page, then choose the lowest one.
  const lowerAnchors = anchors.filter((y) => y >= viewport.height * 0.30);
  const pool = lowerAnchors.length ? lowerAnchors : anchors;
  const startY = Math.max(...pool);
  return clampNumber(startY, 0, viewport.height - 1);
}

function extractTextLines(items, viewport) {
  const lines = [];
  for (const item of items) {
    const text = String(item?.str || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (!Array.isArray(item.transform) || item.transform.length < 6) continue;

    const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const x = clampNumber(point[0], 0, viewport.width);
    const y = clampNumber(point[1], 0, viewport.height);

    let line = lines.find((entry) => Math.abs(entry.y - y) <= 5);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, text });
  }

  const mergedLines = lines.map((line) => {
    const merged = line.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { y: line.y, text: merged };
  });

  mergedLines.sort((a, b) => a.y - b.y);
  return mergedLines;
}

function hasCorrectAnswerAnchor(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  return /\bcorrect\s*answer\s*:/i.test(compact);
}

function renderChoices(q) {
  ui.choiceList.innerHTML = "";
  ui.freeAnswer.value = "";
  if (!q.choices.length) {
    ui.freeAnswer.classList.remove("hidden");
    return;
  }
  ui.freeAnswer.classList.add("hidden");
  q.choices.forEach((text, i) => {
    const letter = String.fromCharCode(65 + i);
    const row = document.createElement("label");
    row.className = "choice-item";
    row.innerHTML = `<input type="radio" name="choice" value="${letter}"><div>${escapeHtml(text)}</div>`;
    ui.choiceList.appendChild(row);
  });
}

function submitAnswer() {
  const q = currentQuestion();
  if (!q || state.session.graded[q.id]) return;
  const userAnswer = readAnswer(q);
  if (!userAnswer) return setFeedback("Enter an answer before checking.", "error");
  if (state.session && state.session.submitted && !state.session.submitted[q.id]) {
    state.session.submitted[q.id] = true;
    renderPrompt(q);
  }
  if (!q.correctAnswer) {
    setFeedback("Self-grade mode: check solution then mark correct or wrong.", "");
    ui.markCorrectBtn.classList.remove("hidden");
    ui.markWrongBtn.classList.remove("hidden");
    if (q.answer) ui.revealAnswerBtn.classList.remove("hidden");
    return;
  }
  finishGrade(check(userAnswer, q.correctAnswer) ? "correct" : "wrong", userAnswer, true);
}

function manualGrade(result) {
  const q = currentQuestion();
  if (!q || state.session.graded[q.id]) return;
  finishGrade(result, readAnswer(q) || "(self-graded)", false);
}

function finishGrade(result, userAnswer, auto) {
  const q = currentQuestion();
  if (!q || state.session.graded[q.id]) return;
  state.session.graded[q.id] = result;
  state.session[result === "correct" ? "correct" : "wrong"] += 1;
  trackAttempt(q.id, result, userAnswer);

  setAnswerDisabled(true);
  ui.submitAnswerBtn.disabled = true;
  ui.markCorrectBtn.classList.add("hidden");
  ui.markWrongBtn.classList.add("hidden");
  ui.nextQuestionBtn.classList.remove("hidden");
  if (result === "correct") {
    setFeedback(auto ? "Correct." : "Marked as correct.", "success");
    if (q.answer) ui.revealAnswerBtn.classList.remove("hidden");
  } else {
    setFeedback(auto ? "Not correct." : "Marked as wrong.", "error");
    ui.hintLine.textContent = q.hint ? `Hint: ${q.hint}` : "Hint: none saved.";
    if (q.answer || q.correctAnswer) ui.revealAnswerBtn.classList.remove("hidden");
  }

  saveProgress();
  renderProgress();
  renderStats();
  renderLibraryTable();
}

function revealAnswer() {
  const q = currentQuestion();
  if (!q) return;
  const lines = [];
  if (q.correctAnswer) lines.push(`Correct answer: ${q.correctAnswer}`);
  if (q.answer) lines.push("", q.answer);
  if (!lines.length) lines.push("No answer saved for this question.");
  ui.answerPanel.textContent = lines.join("\n");
  ui.answerPanel.classList.remove("hidden");
}

function nextQuestion() {
  if (!state.session) return;
  if (state.session.idx >= state.session.ids.length - 1) {
    const total = state.session.ids.length;
    const pct = total ? Math.round((100 * state.session.correct) / total) : 0;
    ui.sessionMessage.textContent = `Session complete: ${state.session.correct} correct, ${state.session.wrong} wrong (${pct}%).`;
    state.session = null;
    return renderCurrentQuestion();
  }
  state.session.idx += 1;
  renderCurrentQuestion();
  requestAnimationFrame(scrollToQuestionStart);
}

function scrollToQuestionStart() {
  const target = ui.questionCard;
  if (!target || target.classList.contains("hidden")) return;
  const top = window.scrollY + target.getBoundingClientRect().top - 10;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function resetFeedback() {
  ui.feedback.textContent = "";
  ui.feedback.className = "feedback";
  ui.hintLine.textContent = "";
  ui.answerPanel.textContent = "";
  ui.answerPanel.classList.add("hidden");
}

function setFeedback(text, tone) {
  ui.feedback.textContent = text;
  ui.feedback.className = `feedback${tone ? ` ${tone}` : ""}`;
}

function setAnswerDisabled(disabled) {
  ui.freeAnswer.disabled = disabled;
  ui.choiceList.querySelectorAll("input").forEach((el) => { el.disabled = disabled; });
}

function readAnswer(q) {
  if (q.choices.length) return ui.choiceList.querySelector("input[name='choice']:checked")?.value || "";
  return ui.freeAnswer.value.trim();
}

function check(userAnswer, answerKey) {
  const gotStrict = norm(userAnswer);
  const gotLoose = normLoose(userAnswer);
  return String(answerKey).split("|").map((x) => x.trim()).filter(Boolean).some((key) => {
    return norm(key) === gotStrict || normLoose(key) === gotLoose;
  });
}

function trackAttempt(id, result, answer) {
  const rec = state.progress[id] || { attempts: 0, correct: 0, wrong: 0, lastResult: "unattempted", lastAnswer: "", updatedAt: "" };
  rec.attempts += 1;
  rec[result === "correct" ? "correct" : "wrong"] += 1;
  rec.lastResult = result;
  rec.lastAnswer = String(answer || "");
  rec.updatedAt = new Date().toISOString();
  state.progress[id] = rec;
}

function questionStatus(id) {
  const rec = state.progress[id];
  if (!rec?.attempts) return "unattempted";
  return rec.lastResult === "correct" ? "correct" : "incorrect";
}

function matchesStatus(id, filter) {
  if (filter === "all") return true;
  const rec = state.progress[id];
  if (!rec?.attempts) return filter === "unattempted";
  if (filter === "correct") return rec.lastResult === "correct";
  if (filter === "incorrect") return rec.lastResult === "wrong";
  if (filter === "everWrong") return rec.wrong > 0;
  return true;
}

function renderLibraryTable() {
  const q = ui.librarySearch.value.trim().toLowerCase();
  const status = ui.libraryStatusFilter.value;
  const filtered = state.library.filter((item) => {
    if (!matchesStatus(item.id, status)) return false;
    if (!q) return true;
    const hay = [item.id, item.subject, sourceLabel(item.sourceId), item.startPage || item.page, item.endPage || item.page, item.domain || "", item.skill || "", item.types.join(" ")].join(" ").toLowerCase();
    return hay.includes(q);
  });

  ui.libraryBody.innerHTML = "";
  const shown = filtered.slice(0, 300);
  for (const item of shown) {
    const tr = document.createElement("tr");
    tr.append(
      td(item.id),
      td(capitalize(item.subject)),
      td(sourceInfoText(item)),
      td(item.types.join(", ")),
      td(item.domain || "n/a"),
      td(item.skill || "n/a"),
      td(statusText(questionStatus(item.id))),
      td(String(state.progress[item.id]?.attempts || 0))
    );

    const activeTd = document.createElement("td");
    const active = document.createElement("input");
    active.type = "checkbox";
    active.checked = item.active;
    active.dataset.action = "toggle-active";
    active.dataset.id = item.id;
    activeTd.appendChild(active);
    tr.appendChild(activeTd);

    const actionTd = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn";
    edit.textContent = "Edit";
    edit.dataset.action = "edit";
    edit.dataset.id = item.id;
    actionTd.appendChild(edit);
    tr.appendChild(actionTd);
    ui.libraryBody.appendChild(tr);
  }
  if (!shown.length) {
    const tr = document.createElement("tr");
    const one = document.createElement("td");
    one.colSpan = 10;
    one.textContent = "No questions match this filter.";
    tr.appendChild(one);
    ui.libraryBody.appendChild(tr);
  }
  ui.libraryFootnote.textContent = filtered.length > 300
    ? `Showing 300 of ${filtered.length}. Narrow filters to see more.`
    : `Showing ${filtered.length} questions.`;
}

function onLibraryClick(event) {
  const btn = event.target.closest("[data-action='edit']");
  if (!btn) return;
  const item = state.index.get(btn.dataset.id);
  if (!item) return;
  ui.formQuestionId.value = item.id;
  ui.formSubject.value = item.subject;
  ui.formSource.value = item.sourceId;
  ui.formStartPage.value = String(item.startPage || item.page);
  ui.formEndPage.value = String(item.endPage || item.page);
  ui.formDomain.value = item.domain || "";
  ui.formSkill.value = item.skill || "";
  ui.formTypes.value = item.types.join(", ");
  ui.formChoices.value = item.choices.join("\n");
  ui.formCorrectAnswer.value = item.correctAnswer;
  ui.formHint.value = item.hint;
  ui.formAnswer.value = item.answer;
  ui.formNotes.value = item.notes;
  ui.formActive.checked = item.active;
  ui.bulkMessage.textContent = `Editing ${item.id}`;
}

function onLibraryChange(event) {
  const input = event.target;
  if (input.dataset.action !== "toggle-active") return;
  const item = state.index.get(input.dataset.id);
  if (!item) return;
  item.active = Boolean(input.checked);
  saveLibrary();
  renderStats();
}

function clearQuestionForm() {
  ui.formQuestionId.value = "";
  ui.formSubject.value = "english";
  ui.formSource.value = state.sources[0]?.id || "";
  ui.formStartPage.value = "1";
  ui.formEndPage.value = "1";
  ui.formDomain.value = "";
  ui.formSkill.value = "";
  ui.formTypes.value = "";
  ui.formChoices.value = "";
  ui.formCorrectAnswer.value = "";
  ui.formHint.value = "";
  ui.formAnswer.value = "";
  ui.formNotes.value = "";
  ui.formActive.checked = true;
  ui.bulkMessage.textContent = "";
}

function saveQuestion(event) {
  event.preventDefault();
  const sourceId = ui.formSource.value;
  const startPage = clampInt(ui.formStartPage.value, 1, Number.MAX_SAFE_INTEGER, 1);
  const endPage = clampInt(ui.formEndPage.value, startPage, Number.MAX_SAFE_INTEGER, startPage);
  const existingId = ui.formQuestionId.value.trim();
  const now = new Date().toISOString();
  if (!sourceById(sourceId)) return setBulkMsg("Choose a valid source.");

  const patch = {
    subject: ui.formSubject.value === "math" ? "math" : "english",
    sourceId,
    page: startPage,
    startPage,
    endPage,
    domain: ui.formDomain.value.trim(),
    skill: ui.formSkill.value.trim(),
    types: tags(ui.formTypes.value).length ? tags(ui.formTypes.value) : ["mixed"],
    choices: lines(ui.formChoices.value),
    correctAnswer: ui.formCorrectAnswer.value.trim(),
    hint: ui.formHint.value.trim(),
    answer: ui.formAnswer.value.trim(),
    notes: ui.formNotes.value.trim(),
    active: ui.formActive.checked,
    updatedAt: now
  };

  if (existingId && state.index.has(existingId)) {
    Object.assign(state.index.get(existingId), patch);
    setBulkMsg(`Updated ${existingId}.`);
  } else {
    const id = uniqueId(baseId(sourceId, startPage));
    state.library.push({ id, createdAt: now, ...patch });
    ui.formQuestionId.value = id;
    setBulkMsg(`Created ${id}.`);
  }

  sortLibrary();
  rebuildIndex();
  saveLibrary();
  renderTypeFilter();
  renderDomainSkillFilters();
  renderLibraryTable();
  renderStats();
}

function bulkCreate(event) {
  event.preventDefault();
  const sourceId = ui.bulkSource.value;
  const start = clampInt(ui.bulkStart.value, 1, Number.MAX_SAFE_INTEGER, 1);
  const end = clampInt(ui.bulkEnd.value, start, Number.MAX_SAFE_INTEGER, start);
  const subject = ui.bulkSubject.value === "math" ? "math" : "english";
  const typeTags = tags(ui.bulkTypes.value).length ? tags(ui.bulkTypes.value) : ["mixed"];
  const now = new Date().toISOString();
  let created = 0;
  let skipped = 0;

  for (let page = start; page <= end; page += 1) {
    if (state.library.some((q) => q.sourceId === sourceId && q.page === page)) {
      skipped += 1;
      continue;
    }
    state.library.push({
      id: uniqueId(baseId(sourceId, page)),
      subject, sourceId, page,
      startPage: page,
      endPage: page,
      domain: "",
      skill: "",
      types: [...typeTags], choices: [], correctAnswer: "", hint: "", answer: "",
      notes: "Created by bulk tool.", active: true, createdAt: now, updatedAt: now
    });
    created += 1;
  }
  sortLibrary();
  rebuildIndex();
  saveLibrary();
  renderTypeFilter();
  renderDomainSkillFilters();
  renderLibraryTable();
  renderStats();
  setBulkMsg(`Bulk create complete: ${created} created, ${skipped} skipped.`);
}

function bulkApplyTags() {
  const sourceId = ui.bulkSource.value;
  const start = clampInt(ui.bulkStart.value, 1, Number.MAX_SAFE_INTEGER, 1);
  const end = clampInt(ui.bulkEnd.value, start, Number.MAX_SAFE_INTEGER, start);
  const subject = ui.bulkSubject.value === "math" ? "math" : "english";
  const typeTags = tags(ui.bulkTypes.value);
  let updated = 0;
  for (const q of state.library) {
    if (q.sourceId !== sourceId || q.page < start || q.page > end) continue;
    q.subject = subject;
    if (typeTags.length) q.types = uniq([...q.types, ...typeTags]);
    q.updatedAt = new Date().toISOString();
    updated += 1;
  }
  saveLibrary();
  renderTypeFilter();
  renderDomainSkillFilters();
  renderLibraryTable();
  setBulkMsg(`Updated ${updated} questions in range.`);
}

async function parseAllSources() {
  if (!ensurePdfJs()) {
    setBulkMsg("PDF parser is unavailable. Check your internet connection and reload.");
    return;
  }
  ui.parsePdfBtn.disabled = true;
  try {
    const parsedAll = [];
    for (const source of state.sources) {
      setBulkMsg(`Parsing ${source.name}...`);
      const parsed = await parseSourceQuestions(source);
      parsedAll.push(...parsed);
    }
    if (!parsedAll.length) {
      setBulkMsg("No question markers were detected in the PDFs.");
      return;
    }
    state.library = mergeParsedQuestions(parsedAll);
    state.session = null;
    sortLibrary();
    rebuildIndex();
    saveSourcesJson();
    saveLibrary();
    renderAll();
    setBulkMsg(`PDF parsing complete. Loaded ${parsedAll.length} questions with page ranges/domain/skill.`);
  } catch (error) {
    setBulkMsg(`PDF parsing failed: ${error.message}`);
  } finally {
    ui.parsePdfBtn.disabled = false;
  }
}

async function parseSourceQuestions(source) {
  const doc = await loadPdfDocument(source.path);
  source.pageCount = doc.numPages;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    if (pageNum === 1 || pageNum % 20 === 0 || pageNum === doc.numPages) {
      setBulkMsg(`Parsing ${source.name}: page ${pageNum}/${doc.numPages}`);
    }
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map((item) => String(item.str || "")).join(" ");
    pageTexts.push(text.replace(/\s+/g, " ").trim());
  }

  const markers = detectQuestionMarkers(pageTexts);
  if (!markers.length) {
    return pageTexts.map((text, i) => {
      const pageNum = i + 1;
      const meta = extractDomainSkill(text, source.subject);
      return {
        sourceId: source.id,
        subject: source.subject,
        startPage: pageNum,
        endPage: pageNum,
        domain: meta.domain,
        skill: meta.skill,
        questionNumber: null
      };
    });
  }

  const questions = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const next = markers[i + 1];
    const startPage = marker.page;
    const endPage = next ? Math.max(startPage, next.page - 1) : doc.numPages;
    const snippet = buildQuestionSnippet(pageTexts, startPage, endPage);
    const meta = extractDomainSkill(snippet, source.subject);
    questions.push({
      sourceId: source.id,
      subject: source.subject,
      startPage,
      endPage,
      domain: meta.domain,
      skill: meta.skill,
      questionNumber: marker.questionNumber
    });
  }
  return questions;
}

function detectQuestionMarkers(pageTexts) {
  const raw = [];
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageNum = index + 1;
    const text = pageTexts[index];
    const pageMarkers = [];
    let match;
    const questionRegex = /\bQuestion\s*[:#]?\s*(\d{1,3})\b/gi;
    while ((match = questionRegex.exec(text)) !== null) {
      const questionNumber = Number.parseInt(match[1], 10);
      if (Number.isFinite(questionNumber)) {
        pageMarkers.push({ page: pageNum, index: match.index, questionNumber });
      }
    }
    if (!pageMarkers.length) {
      const fallbackRegex = /\bQ\s*[:#]?\s*(\d{1,3})\b/gi;
      while ((match = fallbackRegex.exec(text)) !== null) {
        const questionNumber = Number.parseInt(match[1], 10);
        if (Number.isFinite(questionNumber)) {
          pageMarkers.push({ page: pageNum, index: match.index, questionNumber });
        }
      }
    }

    pageMarkers.sort((a, b) => a.index - b.index);
    const uniquePage = [];
    for (const marker of pageMarkers) {
      const previous = uniquePage[uniquePage.length - 1];
      if (!previous) {
        uniquePage.push(marker);
        continue;
      }
      if (previous.questionNumber === marker.questionNumber && marker.index - previous.index < 120) {
        continue;
      }
      uniquePage.push(marker);
    }
    raw.push(...uniquePage);
  }

  raw.sort((a, b) => a.page - b.page || a.index - b.index);
  const deduped = [];
  for (const marker of raw) {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(marker);
      continue;
    }
    if (marker.questionNumber === previous.questionNumber && marker.page <= previous.page + 1) {
      continue;
    }
    deduped.push(marker);
  }
  return deduped;
}

function buildQuestionSnippet(pageTexts, startPage, endPage) {
  const last = Math.min(endPage, startPage + 1);
  const parts = [];
  for (let pageNum = startPage; pageNum <= last; pageNum += 1) {
    parts.push(pageTexts[pageNum - 1] || "");
  }
  return parts.join(" ");
}

function extractDomainSkill(text, subjectHint) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  let domain = cleanExtractedLabel(
    extractLabeledValue(cleaned, "Domain", ["Skill", "Question", "Answer", "Explanation"])
  ) || findKnownDomain(cleaned);
  const skill = cleanExtractedLabel(
    extractLabeledValue(cleaned, "Skill", ["Domain", "Question", "Answer", "Explanation"])
  ) || findKnownSkill(cleaned, subjectHint);
  if (!domain && skill) {
    domain = inferDomainFromSkill(skill, subjectHint);
  }
  return { domain, skill };
}

function extractLabeledValue(text, label, stopLabels) {
  if (!text) return "";
  const stop = stopLabels.map((value) => escapeRegExp(value)).join("|");
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*[:\\-]\\s*(.+?)(?=(?:${stop})\\s*[:\\-]|$)`, "i");
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function cleanExtractedLabel(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").replace(/^[\s:|\-]+/, "").trim();
  if (!cleaned) return "";
  return cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
}

function findKnownDomain(text) {
  const domains = [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry"
  ];
  const lower = String(text || "").toLowerCase();
  for (const domain of domains) {
    if (lower.includes(domain.toLowerCase())) return domain;
  }
  return "";
}

function findKnownSkill(text, subjectHint) {
  const lower = String(text || "").toLowerCase();
  const subjects = subjectsFromFilter(subjectHint || "all");
  for (const subject of subjects) {
    const domainMap = DOMAIN_SKILL_MAP[subject] || {};
    for (const skills of Object.values(domainMap)) {
      for (const skill of skills) {
        if (lower.includes(skill.toLowerCase())) {
          return skill;
        }
      }
    }
  }
  return "";
}

function inferDomainFromSkill(skill, subjectHint) {
  const target = normLoose(skill);
  if (!target) return "";
  const subjects = subjectsFromFilter(subjectHint || "all");
  for (const subject of subjects) {
    const domainMap = DOMAIN_SKILL_MAP[subject] || {};
    for (const [domain, skills] of Object.entries(domainMap)) {
      if (skills.some((value) => normLoose(value) === target)) {
        return domain;
      }
    }
  }
  return "";
}

function questionDomain(q) {
  return String(q?.domain || inferDomainFromSkill(q?.skill || "", q?.subject || "all") || "").trim();
}

function matchesDomainFilter(q, selectedDomain) {
  if (!selectedDomain || selectedDomain === "all") return true;
  const candidate = questionDomain(q);
  return labelMatches(candidate, selectedDomain);
}

function matchesSkillFilter(q, selectedSkill) {
  if (!selectedSkill || selectedSkill === "all") return true;
  const candidate = String(q?.skill || "").trim();
  return labelMatches(candidate, selectedSkill);
}

function labelMatches(candidateRaw, selectedRaw) {
  const candidate = normLoose(candidateRaw);
  const selected = normLoose(selectedRaw);
  if (!selected) return true;
  if (!candidate) return false;
  if (candidate === selected) return true;
  if (candidate.includes(selected) || selected.includes(candidate)) return true;

  const segments = String(candidateRaw || "")
    .split(/[|,;/]/)
    .map((part) => normLoose(part))
    .filter(Boolean);
  return segments.some((segment) => segment === selected || segment.includes(selected) || selected.includes(segment));
}

function mergeParsedQuestions(parsedQuestions) {
  const now = new Date().toISOString();
  const oldById = new Map(state.library.map((q) => [q.id, q]));
  const parsedSourceIds = new Set(parsedQuestions.map((q) => q.sourceId));
  const merged = [];
  const usedIds = new Set();

  for (const parsed of parsedQuestions) {
    const startPage = clampInt(parsed.startPage, 1, Number.MAX_SAFE_INTEGER, 1);
    const endPage = clampInt(parsed.endPage, startPage, Number.MAX_SAFE_INTEGER, startPage);
    const base = baseId(parsed.sourceId, startPage);
    const id = nextUniqueId(base, usedIds);
    const existing = oldById.get(id);
    merged.push({
      id,
      subject: parsed.subject,
      sourceId: parsed.sourceId,
      page: startPage,
      startPage,
      endPage,
      questionNumber: parsed.questionNumber,
      domain: parsed.domain || existing?.domain || "",
      skill: parsed.skill || existing?.skill || "",
      types: existing?.types?.length ? existing.types : ["mixed"],
      choices: existing?.choices || [],
      correctAnswer: existing?.correctAnswer || "",
      hint: existing?.hint || "",
      answer: existing?.answer || "",
      notes: existing?.notes || "Auto-parsed from PDF text.",
      active: existing ? existing.active !== false : true,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
  }

  for (const question of state.library) {
    if (!parsedSourceIds.has(question.sourceId)) {
      merged.push(question);
    }
  }
  return merged;
}

function saveSources(event) {
  event.preventDefault();
  for (const box of ui.sourceList.querySelectorAll("[data-source-id]")) {
    const source = sourceById(box.dataset.sourceId);
    if (!source) continue;
    source.path = box.querySelector("[data-field='path']").value.trim();
    source.pageCount = clampInt(box.querySelector("[data-field='pageCount']").value, 1, 5000, source.pageCount);
    source.subject = box.querySelector("[data-field='subject']").value === "math" ? "math" : "english";
  }
  pdfDocCache.clear();
  saveSourcesJson();
  renderSourceSelects();
  renderCurrentQuestion();
  setBulkMsg("Source settings saved.");
}

function renderProgress() {
  const rows = Object.entries(state.progress).filter(([, r]) => r.attempts > 0).sort((a, b) => {
    const ta = Date.parse(a[1].updatedAt || "") || 0;
    const tb = Date.parse(b[1].updatedAt || "") || 0;
    return tb - ta;
  });
  const attempted = rows.length;
  const correct = rows.reduce((n, [, r]) => n + r.correct, 0);
  const wrong = rows.reduce((n, [, r]) => n + r.wrong, 0);
  const review = rows.reduce((n, [, r]) => n + (r.wrong > 0 ? 1 : 0), 0);
  ui.progressAttempted.textContent = String(attempted);
  ui.progressCorrect.textContent = String(correct);
  ui.progressIncorrect.textContent = String(wrong);
  ui.progressReview.textContent = String(review);

  ui.progressBody.innerHTML = "";
  const shown = rows.slice(0, 200);
  for (const [id, r] of shown) {
    const tr = document.createElement("tr");
    tr.append(td(id), td(String(r.attempts)), td(String(r.correct)), td(String(r.wrong)), td(statusText(r.lastResult)), td(formatDate(r.updatedAt)));
    ui.progressBody.appendChild(tr);
  }
  if (!shown.length) {
    const tr = document.createElement("tr");
    const one = document.createElement("td");
    one.colSpan = 6;
    one.textContent = "No attempts recorded yet.";
    tr.appendChild(one);
    ui.progressBody.appendChild(tr);
  }

  if (ui.domainProgressBody && ui.skillProgressBody) {
    const domainStats = aggregatePerformance(rows, (question) => question?.domain || "Uncategorized");
    const skillStats = aggregatePerformance(rows, (question) => question?.skill || "Uncategorized");
    renderPerformanceBreakdown(ui.domainProgressBody, domainStats, "No domain data yet.");
    renderPerformanceBreakdown(ui.skillProgressBody, skillStats, "No skill data yet.");
  }
}

function aggregatePerformance(progressRows, keySelector) {
  const aggregates = new Map();
  for (const [questionId, record] of progressRows) {
    const question = state.index.get(questionId);
    if (!question) continue;
    const key = String(keySelector(question) || "Uncategorized").trim() || "Uncategorized";
    const existing = aggregates.get(key) || { label: key, attempts: 0, correct: 0, wrong: 0 };
    existing.attempts += record.attempts;
    existing.correct += record.correct;
    existing.wrong += record.wrong;
    aggregates.set(key, existing);
  }

  const items = [...aggregates.values()];
  items.sort((a, b) => {
    const aAcc = a.attempts > 0 ? a.correct / a.attempts : 0;
    const bAcc = b.attempts > 0 ? b.correct / b.attempts : 0;
    return aAcc - bAcc || b.wrong - a.wrong || b.attempts - a.attempts || a.label.localeCompare(b.label);
  });
  return items;
}

function renderPerformanceBreakdown(body, stats, emptyText) {
  body.innerHTML = "";
  const top = stats.slice(0, 12);
  if (!top.length) {
    const tr = document.createElement("tr");
    const tdOne = document.createElement("td");
    tdOne.colSpan = 5;
    tdOne.textContent = emptyText;
    tr.appendChild(tdOne);
    body.appendChild(tr);
    return;
  }

  for (const item of top) {
    const accuracy = item.attempts > 0 ? Math.round((100 * item.correct) / item.attempts) : 0;
    const tr = document.createElement("tr");
    tr.append(
      td(item.label),
      td(String(item.attempts)),
      td(String(item.correct)),
      td(String(item.wrong)),
      td(`${accuracy}%`)
    );
    body.appendChild(tr);
  }
}

function exportData() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), sources: state.sources, library: state.library, progress: state.progress };
  downloadJson(`sat-prep-export-${stamp()}.json`, payload);
  setBulkMsg("Export complete.");
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    state.sources = hydrateSources(payload.sources || []);
    state.library = hydrateLibrary(payload.library || []);
    state.progress = hydrateProgress(payload.progress || {});
    if (!state.library.length) state.library = seedFromSources(state.sources);
    sortLibrary();
    rebuildIndex();
    saveSourcesJson();
    saveLibrary();
    saveProgress();
    renderAll();
    setBulkMsg("Import complete.");
  } catch (err) {
    setBulkMsg(`Import failed: ${err.message}`);
  } finally {
    ui.importInput.value = "";
  }
}

function resetProgress() {
  if (!window.confirm("Reset right/wrong history?")) return;
  state.progress = {};
  saveProgress();
  renderProgress();
  renderStats();
  renderLibraryTable();
  setBulkMsg("Progress reset.");
}

function resetAll() {
  if (!window.confirm("Reset all local data (library, progress, sources)?")) return;
  localStorage.removeItem(STORAGE.sources);
  localStorage.removeItem(STORAGE.library);
  localStorage.removeItem(STORAGE.progress);
  state.sources = hydrateSources([]);
  state.library = seedFromSources(state.sources);
  state.progress = {};
  state.session = null;
  sortLibrary();
  rebuildIndex();
  saveSourcesJson();
  saveLibrary();
  saveProgress();
  clearQuestionForm();
  renderAll();
  setBulkMsg("All data reset.");
}

function seedFromSources(sources) {
  const now = new Date().toISOString();
  const out = [];
  for (const s of sources) {
    for (let page = 1; page <= s.pageCount; page += 1) {
      out.push({
        id: baseId(s.id, page),
        subject: s.subject,
        sourceId: s.id,
        page,
        startPage: page,
        endPage: page,
        questionNumber: null,
        domain: "",
        skill: "",
        types: ["mixed", "auto-imported"],
        choices: [],
        correctAnswer: "",
        hint: "",
        answer: "",
        notes: "Auto-imported from PDF page. Add answer and tags in the editor.",
        active: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return out;
}

function hydrateSources(input) {
  const map = new Map(DEFAULT_SOURCES.map((s) => [s.id, { ...s }]));
  if (Array.isArray(input)) {
    for (const s of input) {
      if (!s || typeof s.id !== "string") continue;
      const base = map.get(s.id) || { id: s.id, name: s.id, path: "", pageCount: 1, subject: "english" };
      map.set(s.id, {
        id: s.id,
        name: s.name || base.name,
        subject: s.subject === "math" ? "math" : "english",
        path: typeof s.path === "string" ? s.path : base.path,
        pageCount: clampInt(s.pageCount, 1, 5000, base.pageCount)
      });
    }
  }
  return [...map.values()];
}

function hydrateLibrary(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((q) => q && typeof q.id === "string" && typeof q.sourceId === "string").map((q) => ({
    page: clampInt(q.startPage ?? q.page, 1, Number.MAX_SAFE_INTEGER, 1),
    startPage: clampInt(q.startPage ?? q.page, 1, Number.MAX_SAFE_INTEGER, 1),
    endPage: clampInt(q.endPage ?? q.startPage ?? q.page, clampInt(q.startPage ?? q.page, 1, Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER, clampInt(q.startPage ?? q.page, 1, Number.MAX_SAFE_INTEGER, 1)),
    id: q.id,
    subject: q.subject === "math" ? "math" : "english",
    sourceId: q.sourceId,
    questionNumber: q.questionNumber == null ? null : clampInt(q.questionNumber, 1, Number.MAX_SAFE_INTEGER, null),
    domain: String(q.domain || ""),
    skill: String(q.skill || ""),
    types: tags(q.types),
    choices: lines(q.choices),
    correctAnswer: String(q.correctAnswer || ""),
    hint: String(q.hint || ""),
    answer: String(q.answer || ""),
    notes: String(q.notes || ""),
    active: q.active !== false,
    createdAt: String(q.createdAt || ""),
    updatedAt: String(q.updatedAt || "")
  }));
}

function hydrateProgress(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, r] of Object.entries(input)) {
    out[id] = {
      attempts: clampInt(r?.attempts, 0, Number.MAX_SAFE_INTEGER, 0),
      correct: clampInt(r?.correct, 0, Number.MAX_SAFE_INTEGER, 0),
      wrong: clampInt(r?.wrong, 0, Number.MAX_SAFE_INTEGER, 0),
      lastResult: r?.lastResult === "correct" ? "correct" : r?.lastResult === "wrong" ? "wrong" : "unattempted",
      lastAnswer: String(r?.lastAnswer || ""),
      updatedAt: String(r?.updatedAt || "")
    };
  }
  return out;
}

function sourceInfoText(item) {
  const start = item.startPage || item.page;
  const end = item.endPage || item.page;
  const range = start === end ? `p.${start}` : `p.${start}-${end}`;
  return `${sourceLabel(item.sourceId)} ${range}`;
}

function subjectsFromFilter(subjectFilter) {
  if (subjectFilter === "english" || subjectFilter === "math") {
    return [subjectFilter];
  }
  return ["english", "math"];
}

function knownDomainsForSubject(subject) {
  return Object.keys(DOMAIN_SKILL_MAP[subject] || {});
}

function knownSkillsForSubjectAndDomain(subject, domainFilter) {
  const map = DOMAIN_SKILL_MAP[subject] || {};
  if (!map) return [];
  if (!domainFilter || domainFilter === "all") {
    return Object.values(map).flat();
  }
  const matchedDomain = Object.keys(map).find((domain) => normLoose(domain) === normLoose(domainFilter));
  if (!matchedDomain) return [];
  return map[matchedDomain];
}

function baseId(sourceId, page) { return `${sourceId}-p${String(page).padStart(3, "0")}`; }
function uniqueId(base) { if (!state.index.has(base)) return base; let n = 2; while (state.index.has(`${base}-${n}`)) n += 1; return `${base}-${n}`; }
function nextUniqueId(base, used) { if (!used.has(base)) { used.add(base); return base; } let n = 2; while (used.has(`${base}-${n}`)) n += 1; used.add(`${base}-${n}`); return `${base}-${n}`; }
function tags(v) { return uniq((Array.isArray(v) ? v : String(v || "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean)); }
function lines(v) { return (Array.isArray(v) ? v : String(v || "").split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean); }
function uniq(arr) { return [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))]; }
function uniqKeepCase(arr) {
  const out = [];
  const seen = new Set();
  for (const value of arr) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
function norm(v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, " "); }
function normLoose(v) { return norm(v).replace(/[^a-z0-9]/g, ""); }
function statusText(s) { return s === "correct" ? "Right" : s === "incorrect" || s === "wrong" ? "Wrong" : "Unattempted"; }
function capitalize(v) { return v ? v[0].toUpperCase() + v.slice(1) : ""; }
function td(text) { const el = document.createElement("td"); el.textContent = text; return el; }
function makeChip(text) { const el = document.createElement("span"); el.className = "chip"; el.textContent = text; return el; }
function clampInt(v, min, max, fallback) { const n = Number.parseInt(String(v), 10); if (!Number.isFinite(n)) return fallback; return Math.min(max, Math.max(min, n)); }
function clampNumber(v, min, max) { const n = Number(v); if (!Number.isFinite(n)) return min; return Math.min(max, Math.max(min, n)); }
function setBulkMsg(text) { ui.bulkMessage.textContent = text; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
function formatDate(v) { const d = new Date(v || ""); return Number.isNaN(d.getTime()) ? "n/a" : d.toLocaleString(); }
function stamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`; }
function ensurePdfJs() {
  const lib = window.pdfjsLib;
  if (!lib) return false;
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  }
  return true;
}

async function loadPdfDocument(path) {
  if (!ensurePdfJs()) {
    throw new Error("PDF.js is not loaded");
  }
  const normalized = normalizePath(path);
  if (!normalized) {
    throw new Error("Invalid source path");
  }
  const cached = pdfDocCache.get(normalized);
  if (cached) return cached;

  const promise = window.pdfjsLib.getDocument({ url: normalized, withCredentials: false }).promise;
  pdfDocCache.set(normalized, promise);
  try {
    return await promise;
  } catch (error) {
    pdfDocCache.delete(normalized);
    throw error;
  }
}

function pdfPageUrl(path, page) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const safePage = clampInt(page, 1, Number.MAX_SAFE_INTEGER, 1);
  return `${encodeURI(normalized)}#page=${safePage}&zoom=page-fit`;
}

function normalizePath(path) {
  let p = String(path || "").trim();
  if (!p) return "";
  p = p.replace(/\\/g, "/");

  // Convert local absolute paths and file:// URLs to the local assets folder.
  // This avoids browser restrictions when the app runs on http://localhost.
  if (/^file:\/\//i.test(p)) {
    p = p.replace(/^file:\/\/\/?/i, "");
    p = decodeURIComponent(p);
    const name = p.split("/").pop();
    return name ? `assets/pdfs/${name}` : "";
  }
  if (/^[a-zA-Z]:\//.test(p)) {
    const name = p.split("/").pop();
    return name ? `assets/pdfs/${name}` : "";
  }

  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/")) return p;
  if (p.startsWith("./") || p.startsWith("../")) return p;
  return `/${p}`;
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(text) { return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;"); }

function downloadJson(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
