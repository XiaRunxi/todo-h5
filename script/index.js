const STORAGE_KEY = "todo-h5.tasks";
const THEME_KEY = "todo-h5.theme";
let tasks = loadTasks();
let currentView = "today";

const els = {
  form: document.querySelector("#taskForm"),
  input: document.querySelector("#taskInput"),
  quickPriority: document.querySelector("#quickPriority"),
  quickDate: document.querySelector("#quickDate"),
  taskList: document.querySelector("#taskList"),
  tabs: document.querySelectorAll(".tab"),
  viewTitle: document.querySelector("#viewTitle"),
  taskStats: document.querySelector("#taskStats"),
  themeToggle: document.querySelector("#themeToggle"),
  dialog: document.querySelector("#taskDialog"),
  detailForm: document.querySelector("#taskDetailForm")
};

initTheme();
bindEvents();
seedTasksIfEmpty();
render();
els.input.focus();

function bindEvents() {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = els.input.value.trim();
    if (!raw) return;
    const parsed = parseQuickText(raw);
    const date = parsed.date ?? resolveQuickDate(els.quickDate.value);
    tasks.unshift({
      id: crypto.randomUUID(),
      title: parsed.title,
      note: "",
      date,
      priority: els.quickPriority.value,
      tags: [],
      subtasks: [],
      completed: false,
      archived: false,
      createdAt: Date.now(),
      completedAt: null
    });
    saveAndRender();
    els.form.reset();
    els.quickPriority.value = "medium";
    els.quickDate.value = "today";
    els.input.focus();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      els.input.focus();
    }
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      currentView = tab.dataset.view;
      els.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      render();
    });
  });

  els.themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
  });

  document.querySelector("#dialogCancel").addEventListener("click", () => els.dialog.close());
  els.detailForm.addEventListener("submit", saveDetail);
}

function render() {
  const list = getFilteredTasks();
  els.taskList.innerHTML = "";
  els.viewTitle.textContent = ({ today: "今日待办", inbox: "收件箱", all: "全部任务" })[currentView];
  els.taskStats.textContent = `共 ${list.length} 条`;

  if (!list.length) {
    els.taskList.innerHTML = `<li class="task-item">暂无任务 🎉</li>`;
    return;
  }

  list.forEach((task) => {
    const li = document.createElement("li");
    li.className = `task-item ${task.priority} ${task.completed ? "done" : ""} ${isOverdue(task) ? "overdue" : ""}`;
    li.innerHTML = `
      <div class="task-row">
        <label><input type="checkbox" ${task.completed ? "checked" : ""} data-action="toggle" data-id="${task.id}" /> <span class="task-title">${escapeHtml(task.title)}</span></label>
        <button class="btn-mini" data-action="detail" data-id="${task.id}">详情</button>
      </div>
      <div class="task-meta">
        <span>${formatDate(task.date)}</span>
        <span>优先级: ${priorityText(task.priority)}</span>
        ${task.tags.length ? `<span>#${task.tags.join(" #")}</span>` : ""}
        ${isOverdue(task) ? `<span>逾期</span>` : ""}
      </div>
      <div class="task-actions">
        <button class="btn-mini" data-action="postpone" data-days="1" data-id="${task.id}">明天</button>
        <button class="btn-mini" data-action="postpone" data-days="2" data-id="${task.id}">后天</button>
        <button class="btn-mini" data-action="postponeWeek" data-id="${task.id}">下周一</button>
        <button class="btn-mini" data-action="today" data-id="${task.id}">加入今日</button>
        <button class="btn-mini" data-action="archive" data-id="${task.id}">归档</button>
      </div>
    `;
    els.taskList.appendChild(li);
  });

  els.taskList.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", onTaskAction));
}

function onTaskAction(e) {
  const action = e.currentTarget.dataset.action;
  const id = e.currentTarget.dataset.id;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  if (action === "toggle") {
    task.completed = e.currentTarget.checked;
    task.completedAt = task.completed ? Date.now() : null;
    if (task.completed && currentView === "today") {
      setTimeout(render, 140);
    }
  }
  if (action === "detail") openDetail(task);
  if (action === "today") task.date = toISODate(new Date());
  if (action === "archive") task.archived = true;
  if (action === "postpone") task.date = addDays(task.date || toISODate(new Date()), Number(e.currentTarget.dataset.days));
  if (action === "postponeWeek") task.date = nextWeekday(1);

  saveAndRender();
}

function getFilteredTasks() {
  const today = toISODate(new Date());
  const visible = tasks.filter((t) => !t.archived);
  let list = visible;
  if (currentView === "today") {
    list = visible.filter((t) => !t.completed && t.date && t.date <= today);
  } else if (currentView === "inbox") {
    list = visible.filter((t) => !t.completed && !t.date);
  }

  return list.sort((a, b) => {
    if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    return b.createdAt - a.createdAt;
  });
}

function openDetail(task) {
  document.querySelector("#detailId").value = task.id;
  document.querySelector("#detailTitle").value = task.title;
  document.querySelector("#detailNote").value = task.note || "";
  document.querySelector("#detailDate").value = task.date || "";
  document.querySelector("#detailPriority").value = task.priority;
  document.querySelector("#detailTags").value = task.tags.join(",");
  document.querySelector("#detailSubtasks").value = task.subtasks.map((s) => s.text).join("\n");
  els.dialog.showModal();
}

function saveDetail(e) {
  e.preventDefault();
  const id = document.querySelector("#detailId").value;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.title = document.querySelector("#detailTitle").value.trim();
  task.note = document.querySelector("#detailNote").value.trim();
  task.date = document.querySelector("#detailDate").value || null;
  task.priority = document.querySelector("#detailPriority").value;
  task.tags = document.querySelector("#detailTags").value.split(",").map((s) => s.trim()).filter(Boolean);
  task.subtasks = document.querySelector("#detailSubtasks").value
    .split("\n").map((s) => s.trim()).filter(Boolean).map((text, idx) => ({ id: `${id}-${idx}`, text, done: false }));
  els.dialog.close();
  saveAndRender();
}

function parseQuickText(raw) {
  const now = new Date();
  const map = [
    { re: /明天/, date: addDays(toISODate(now), 1) },
    { re: /后天/, date: addDays(toISODate(now), 2) },
    { re: /今天/, date: toISODate(now) },
    { re: /下周一/, date: nextWeekday(1) },
    { re: /周五前|周五/, date: nextWeekday(5) }
  ];
  const hit = map.find((m) => m.re.test(raw));
  return { title: raw.replace(/明天|后天|今天|下周一|周五前|周五/g, "").trim() || raw, date: hit?.date || null };
}

function resolveQuickDate(v) {
  const today = toISODate(new Date());
  if (v === "today") return today;
  if (v === "tomorrow") return addDays(today, 1);
  if (v === "week") return nextWeekday(0);
  return null;
}

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  render();
}
function priorityRank(p) { return ({ high: 0, medium: 1, low: 2 })[p] ?? 3; }
function priorityText(p) { return ({ high: "高", medium: "中", low: "低" })[p] ?? "未知"; }
function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function nextWeekday(target) {
  const d = new Date();
  const day = d.getDay();
  const delta = (target + 7 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}
function isOverdue(task) {
  const today = toISODate(new Date());
  return !!task.date && !task.completed && task.date < today;
}
function formatDate(date) { return date ? `计划: ${date}` : "无日期"; }
function escapeHtml(s) {
  return s.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initTheme() {
  const t = localStorage.getItem(THEME_KEY);
  if (t === "dark") document.body.classList.add("dark");
}

function seedTasksIfEmpty() {
  if (tasks.length) return;
  const today = toISODate(new Date());
  tasks = [
    { id: crypto.randomUUID(), title: "欢迎使用：查看今日待办", note: "你可以点详情编辑", date: today, priority: "high", tags: ["引导"], subtasks: [], completed: false, archived: false, createdAt: Date.now(), completedAt: null },
    { id: crypto.randomUUID(), title: "试试输入：明天买奶茶", note: "支持自然语言日期", date: addDays(today, 1), priority: "medium", tags: ["示例"], subtasks: [], completed: false, archived: false, createdAt: Date.now() - 1, completedAt: null },
    { id: crypto.randomUUID(), title: "一个无日期任务", note: "会出现在收件箱", date: null, priority: "low", tags: ["收件箱"], subtasks: [], completed: false, archived: false, createdAt: Date.now() - 2, completedAt: null }
  ];
  saveAndRender();
}
