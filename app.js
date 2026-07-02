import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR0zkPrbqQRot8KLajCPSF9nQ3qavPlrc",
  authDomain: "ttck-a7176.firebaseapp.com",
  projectId: "ttck-a7176",
  storageBucket: "ttck-a7176.firebasestorage.app",
  messagingSenderId: "882092560518",
  appId: "1:882092560518:web:c6ff98db205ab578cb4107",
};

// Dán URL Web App Apps Script sau khi deploy.
// Ví dụ: https://script.google.com/macros/s/AKfycb.../exec
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxfSqZ9veQh1K64OY6z_15VWq0nzHxtIWXvsJQ9yIMNX4jNCfucY5F1zjrr5pdgPq2v/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STAFF_AMOUNT_LIMIT = 2_000_000;

const state = {
  mode: "exact",
  tab: "filtered",
  session: "",
  profile: null,
  employees: [],
  filteredRows: [],
  statsRows: [],
  statsSummary: null,
  statsFilter: null,
  statsLoaded: false,
  permissionDraft: [],
};

const $ = (id) => document.getElementById(id);
const elements = {
  loginScreen: $("loginScreen"),
  mainScreen: $("mainScreen"),
  loginBtn: $("loginBtn"),
  loginMessage: $("loginMessage"),
  logoutBtn: $("logoutBtn"),
  userBadge: $("userBadge"),
  syncStatus: $("syncStatus"),
  queryInput: $("queryInput"),
  amountInput: $("amountInput"),
  dateInput: $("dateInput"),
  timeInput: $("timeInput"),
  searchBtn: $("searchBtn"),
  clearFiltersBtn: $("clearFiltersBtn"),
  filteredBody: $("filteredBody"),
  filteredCount: $("filteredCount"),
  filteredMoney: $("filteredMoney"),
  statsBody: $("statsBody"),
  statsChips: $("statsChips"),
  statsFrom: $("statsFrom"),
  statsTo: $("statsTo"),
  statsLoadBtn: $("statsLoadBtn"),
  historyMonth: $("historyMonth"),
  historyBody: $("historyBody"),
  contentDialog: $("contentDialog"),
  contentFullText: $("contentFullText"),
  employeeDialog: $("employeeDialog"),
  employeeChoices: $("employeeChoices"),
  permissionsDialog: $("permissionsDialog"),
  permissionRows: $("permissionRows"),
  newEmployeeName: $("newEmployeeName"),
  newEmployeePermission: $("newEmployeePermission"),
  addEmployeeBtn: $("addEmployeeBtn"),
  saveEmployeesBtn: $("saveEmployeesBtn"),
  chooseEmployeeBtn: $("chooseEmployeeBtn"),
  permissionsBtn: $("permissionsBtn"),
  historyBtn: $("historyBtn"),
  loadHistoryBtn: $("loadHistoryBtn"),
  deleteHistoryBtn: $("deleteHistoryBtn"),
  syncTodayBtn: $("syncTodayBtn"),
  sync10DaysBtn: $("sync10DaysBtn"),
  autoSyncBtn: $("autoSyncBtn"),
  autoSyncDialog: $("autoSyncDialog"),
  toast: $("toast"),
};

await setPersistence(auth, browserLocalPersistence);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  if (isSessionExpired()) {
    await signOut(auth);
    showLogin("Phiên Gmail đã quá 1 tháng. Đăng nhập lại để tiếp tục.");
    return;
  }

  try {
    ensureApiUrl();
    markSession();
    showAppLoading(user.email || "");
    const data = await callApi("bootstrap", {}, true);
    state.session = data.session || state.session;
    state.profile = data.profile;
    state.employees = data.employees || [];
    setupDefaultDates();
    renderShell();
    showMain();
    if (state.profile && state.profile.role === "staff" && !state.profile.employeeId) {
      window.setTimeout(openEmployeeDialog, 0);
    }
  } catch (error) {
    console.error(error);
    localStorage.removeItem("ttckAppsScriptSession");
    state.session = "";
    showLogin(readError(error));
  }
});

elements.loginBtn.addEventListener("click", async () => {
  elements.loginMessage.textContent = "";
  elements.loginBtn.disabled = true;
  try {
    ensureApiUrl();
    await signInWithPopup(auth, provider);
    markSession();
  } catch (error) {
    elements.loginMessage.textContent = readError(error);
  } finally {
    elements.loginBtn.disabled = false;
  }
});

elements.logoutBtn.addEventListener("click", async () => {
  localStorage.removeItem("ttckLoginAt");
  localStorage.removeItem("ttckAppsScriptSession");
  state.session = "";
  await signOut(auth);
});

document.querySelectorAll(".filter-mode[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".filter-mode[data-mode]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    runSearchIfReady();
  });
});

document.querySelectorAll(".tab-btn[data-tab]").forEach((button) => {
  button.addEventListener("click", async () => {
    const tab = button.dataset.tab;
    state.tab = tab;
    switchTab(tab);
    if (tab === "stats" && !state.statsLoaded) await loadStats();
  });
});

[elements.queryInput, elements.amountInput, elements.dateInput, elements.timeInput].forEach((input) => {
  input.addEventListener("blur", runSearchIfReady);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearchIfReady();
    }
  });
});

elements.searchBtn.addEventListener("click", runSearchIfReady);
elements.clearFiltersBtn.addEventListener("click", () => {
  elements.queryInput.value = "";
  elements.amountInput.value = "";
  elements.dateInput.value = "";
  elements.timeInput.value = "";
  state.filteredRows = [];
  renderFiltered();
});

elements.amountInput.addEventListener("input", () => {
  elements.amountInput.value = formatDigitsInput(elements.amountInput.value);
});

elements.statsLoadBtn.addEventListener("click", loadStats);
[elements.statsFrom, elements.statsTo].forEach((input) => {
  input.addEventListener("change", () => {
    state.statsLoaded = false;
  });
});
elements.syncTodayBtn.addEventListener("click", () => syncGmail(1));
elements.sync10DaysBtn.addEventListener("click", () => syncGmail(10));
elements.chooseEmployeeBtn.addEventListener("click", openEmployeeDialog);
elements.permissionsBtn.addEventListener("click", openPermissionsDialog);
elements.addEmployeeBtn.addEventListener("click", addEmployeeDraft);
elements.saveEmployeesBtn.addEventListener("click", saveEmployees);
elements.historyBtn.addEventListener("click", openHistoryDialog);
elements.loadHistoryBtn.addEventListener("click", loadHistory);
elements.deleteHistoryBtn.addEventListener("click", deleteHistoryMonth);
elements.autoSyncBtn.addEventListener("click", openAutoSyncDialog);

function showLogin(message = "") {
  elements.mainScreen.classList.add("hidden");
  elements.loginScreen.classList.remove("hidden");
  elements.loginMessage.textContent = message;
  refreshIcons();
}

function showMain() {
  elements.loginScreen.classList.add("hidden");
  elements.mainScreen.classList.remove("hidden");
  refreshIcons();
}

function showAppLoading(email) {
  elements.loginScreen.classList.add("hidden");
  elements.mainScreen.classList.remove("hidden");
  elements.userBadge.textContent = `${email} | Đang kiểm tra quyền`;
  elements.syncStatus.textContent = "Đang tải quyền truy cập...";
}

function renderShell() {
  const profile = state.profile || {};
  const actor = profile.employeeName || (profile.role === "admin" ? "Admin" : "Chưa chọn");
  const roleText = profile.role === "admin" ? "Admin" : "Nhân viên";
  elements.userBadge.textContent = `${roleText} - ${actor}`;
  elements.syncStatus.textContent = "Sẵn sàng";

  document.querySelectorAll(".admin-only").forEach((item) => {
    item.classList.toggle("hidden", !isAdmin());
  });

  renderEmployeeChoices();
  refreshIcons();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  ["filtered", "stats"].forEach((name) => {
    $(`${name}Panel`).classList.toggle("active", name === tab);
  });
}

function hasFilters() {
  return Boolean(
    elements.queryInput.value.trim() ||
      parseAmount(elements.amountInput.value) !== null ||
      elements.dateInput.value ||
      elements.timeInput.value,
  );
}

async function runSearchIfReady() {
  if (!hasFilters()) {
    state.filteredRows = [];
    renderFiltered();
    return;
  }

  const amount = parseAmount(elements.amountInput.value);
  if (!isAdmin() && amount !== null && amount > STAFF_AMOUNT_LIMIT) {
    showToast("Nhân viên chỉ được lọc số tiền từ 0 đến 2.000.000");
    return;
  }

  await searchTransactions();
}

async function searchTransactions() {
  setBusy("Đang lọc dữ liệu...");
  const parsedAmount = parseAmount(elements.amountInput.value);
  try {
    const data = await callApi("searchTransactions", {
      mode: state.mode,
      query: elements.queryInput.value.trim(),
      amount: parsedAmount === null ? "" : parsedAmount,
      date: elements.dateInput.value,
      time: elements.timeInput.value,
    });
    state.filteredRows = data.rows || [];
    renderFiltered();
    setReady(data.message || "Đã lọc xong");
  } catch (error) {
    showToast(readError(error));
    setReady("Lỗi lọc dữ liệu");
  }
}

function renderFiltered() {
  renderActionRows(elements.filteredBody, state.filteredRows);
  const total = state.filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  elements.filteredCount.textContent = `${state.filteredRows.length} dòng`;
  elements.filteredMoney.textContent = formatMoney(total);
  refreshIcons();
}

function renderActionRows(tbody, rows) {
  tbody.innerHTML = rows
    .map((row) => {
      const canWrite = Boolean(row.canWrite);
      const checkedText = row.checked ? "." : "";
      return `
        <tr data-id="${escapeAttr(row.id)}">
          <td>${escapeHtml(row.dateText || "")}</td>
          <td>${escapeHtml(row.time || "")}</td>
          <td>${formatMoney(row.amount)}</td>
          <td><span class="content-cell" data-content="${escapeAttr(row.content || "")}">${escapeHtml(row.content || "")}</span></td>
          <td>${escapeHtml(row.type || "")}</td>
          <td>
            <input class="check-input" type="checkbox" ${row.checked ? "checked" : ""} ${canWrite || (isAdmin() && row.checked) ? "" : "disabled"} aria-label="${checkedText}">
          </td>
          <td>
            <textarea class="note-input" rows="1" ${canWrite ? "" : "disabled"}>${escapeHtml(row.note || "")}</textarea>
          </td>
          <td>${escapeHtml(row.actorName || "")}</td>
          <td>${escapeHtml(row.actionAtText || "")}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".check-input").forEach((input) => {
    input.addEventListener("change", onCheckedChange);
  });
  tbody.querySelectorAll(".note-input").forEach((input) => {
    input.addEventListener("blur", onNoteBlur);
  });
  bindContentClicks(tbody);
}

async function onCheckedChange(event) {
  const input = event.currentTarget;
  const tr = input.closest("tr");
  const id = tr.dataset.id;
  const checked = input.checked;
  input.disabled = true;
  try {
    await callApi("setChecked", { id, checked });
    await searchTransactions();
  } catch (error) {
    input.checked = !checked;
    showToast(readError(error));
  } finally {
    input.disabled = false;
  }
}

async function onNoteBlur(event) {
  const input = event.currentTarget;
  const tr = input.closest("tr");
  const id = tr.dataset.id;
  input.disabled = true;
  try {
    await callApi("saveNote", { id, note: input.value.trim() });
    await searchTransactions();
  } catch (error) {
    showToast(readError(error));
  } finally {
    input.disabled = false;
  }
}

async function loadStats() {
  if (!elements.statsFrom.value || !elements.statsTo.value) setupDefaultDates();
  setBusy("Đang tải thống kê...");
  try {
    const data = await callApi("getStats", {
      from: elements.statsFrom.value,
      to: elements.statsTo.value,
    });
    state.statsRows = data.rows || [];
    state.statsSummary = data.summary || {};
    state.statsFilter = null;
    state.statsLoaded = true;
    renderStats();
    setReady("Đã tải thống kê");
  } catch (error) {
    showToast(readError(error));
    setReady("Lỗi thống kê");
  }
}

function renderStats() {
  const summary = state.statsSummary || {};
  const actors = summary.actors || [];
  const chips = [
    { type: "checked", label: `Tích chọn ${summary.checkedCount || 0}` },
    { type: "note", label: `Ghi chú ${summary.noteCount || 0}` },
    ...actors.map((actor) => ({ type: "actor", value: actor.name, label: `${actor.name}: ${actor.count}` })),
  ];

  elements.statsChips.innerHTML = chips
    .map((chip, index) => {
      const active = state.statsFilter && state.statsFilter.type === chip.type && state.statsFilter.value === chip.value;
      return `<button class="stat-chip ${active ? "active" : ""}" type="button" data-index="${index}">${escapeHtml(chip.label)}</button>`;
    })
    .join("");

  elements.statsChips.querySelectorAll(".stat-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const chip = chips[Number(button.dataset.index)];
      state.statsFilter =
        state.statsFilter && state.statsFilter.type === chip.type && state.statsFilter.value === chip.value
          ? null
          : { type: chip.type, value: chip.value };
      renderStats();
    });
  });

  const rows = filterStatsRows(state.statsRows);
  elements.statsBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.dateText || "")}</td>
        <td>${escapeHtml(row.time || "")}</td>
        <td>${formatMoney(row.amount)}</td>
        <td><span class="content-cell" data-content="${escapeAttr(row.content || "")}">${escapeHtml(row.content || "")}</span></td>
        <td>${row.checked ? "." : ""}</td>
        <td>${escapeHtml(row.note || "")}</td>
        <td>${escapeHtml(row.actorName || "")}</td>
        <td>${escapeHtml(row.actionAtText || "")}</td>
      </tr>
    `)
    .join("");
  bindContentClicks(elements.statsBody);
}

function filterStatsRows(rows) {
  if (!state.statsFilter) return rows;
  if (state.statsFilter.type === "checked") return rows.filter((row) => row.checked);
  if (state.statsFilter.type === "note") return rows.filter((row) => row.note);
  if (state.statsFilter.type === "actor") return rows.filter((row) => row.actorName === state.statsFilter.value);
  return rows;
}

async function syncGmail(days) {
  if (!isAdmin()) return;
  const label = days === 1 ? "hôm nay" : "10 ngày trước";
  setBusy(`Đang cập nhật Gmail ${label}...`);
  try {
    const data = await callApi("syncGmail", { days });
    setReady(`Thêm mới ${data.added || 0}, trùng ${data.duplicated || 0}`);
    showToast(`Đã cập nhật: thêm ${data.added || 0}, trùng ${data.duplicated || 0}`);
    if (hasFilters()) await searchTransactions();
    state.statsLoaded = false;
  } catch (error) {
    showToast(readError(error));
    setReady("Lỗi cập nhật Gmail");
  }
}

function openEmployeeDialog() {
  renderEmployeeChoices();
  elements.employeeDialog.showModal();
  refreshIcons();
}

function renderEmployeeChoices() {
  const adminOption = isAdmin()
    ? `<button class="employee-choice" type="button" data-id="">Admin</button>`
    : "";
  const choices = state.employees
    .filter((employee) => employee.active !== false)
    .map((employee) => {
      const permission = employee.permission === "write" ? "Được thao tác" : "Chỉ xem";
      return `<button class="employee-choice" type="button" data-id="${escapeAttr(employee.id)}">${escapeHtml(employee.name)} - ${permission}</button>`;
    })
    .join("");
  elements.employeeChoices.innerHTML = adminOption + choices;
  elements.employeeChoices.querySelectorAll(".employee-choice").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const data = await callApi("selectEmployee", { employeeId: button.dataset.id });
        state.profile = data.profile;
        renderShell();
        elements.employeeDialog.close();
      } catch (error) {
        showToast(readError(error));
      }
    });
  });
}

function openPermissionsDialog() {
  if (!isAdmin()) return;
  state.permissionDraft = state.employees.map((employee) => ({ ...employee }));
  renderPermissionRows();
  elements.permissionsDialog.showModal();
}

function renderPermissionRows() {
  elements.permissionRows.innerHTML = state.permissionDraft
    .map((employee, index) => {
      if (employee.active === false) return "";
      return `
        <div class="permission-row" data-index="${index}">
          <input type="text" value="${escapeAttr(employee.name || "")}" aria-label="Tên nhân viên" />
          <select aria-label="Quyền">
            <option value="write" ${employee.permission === "write" ? "selected" : ""}>Được thao tác</option>
            <option value="read" ${employee.permission === "read" ? "selected" : ""}>Chỉ xem</option>
          </select>
          <button class="danger-btn" type="button">Xóa</button>
        </div>
      `;
    })
    .join("");

  elements.permissionRows.querySelectorAll(".permission-row").forEach((row) => {
    const index = Number(row.dataset.index);
    const [nameInput, select, deleteBtn] = row.children;
    nameInput.addEventListener("input", () => {
      state.permissionDraft[index].name = nameInput.value;
    });
    select.addEventListener("change", () => {
      state.permissionDraft[index].permission = select.value;
    });
    deleteBtn.addEventListener("click", () => {
      state.permissionDraft[index].active = false;
      renderPermissionRows();
    });
  });
}

function addEmployeeDraft() {
  const name = elements.newEmployeeName.value.trim();
  if (!name) return;
  state.permissionDraft.push({
    id: "",
    name,
    permission: elements.newEmployeePermission.value,
    active: true,
  });
  elements.newEmployeeName.value = "";
  renderPermissionRows();
}

async function saveEmployees() {
  if (!isAdmin()) return;
  try {
    const data = await callApi("saveEmployees", {
      employees: state.permissionDraft,
    });
    state.employees = data.employees || [];
    renderShell();
    elements.permissionsDialog.close();
    showToast("Đã lưu quyền nhân viên");
  } catch (error) {
    showToast(readError(error));
  }
}

function openHistoryDialog() {
  if (!isAdmin()) return;
  if (!elements.historyMonth.value) elements.historyMonth.value = currentMonthInput();
  elements.historyDialog.showModal();
  loadHistory();
}

async function loadHistory() {
  if (!isAdmin()) return;
  try {
    const data = await callApi("getHistory", { month: normalizeMonth(elements.historyMonth.value) });
    const rows = data.rows || [];
    elements.historyBody.innerHTML = rows.length
      ? rows
      .map((row) => `
        <tr>
          <td>${escapeHtml(row.createdAtText || "")}</td>
          <td>${escapeHtml(row.actorName || "")}</td>
          <td>${escapeHtml(row.actionText || "")}</td>
          <td>${escapeHtml(row.detail || "")}</td>
        </tr>
      `)
      .join("")
      : `<tr><td colspan="4">Chưa có lịch sử trong tháng này.</td></tr>`;
  } catch (error) {
    showToast(readError(error));
  }
}

async function deleteHistoryMonth() {
  if (!isAdmin()) return;
  const month = normalizeMonth(elements.historyMonth.value);
  if (!month) return;
  if (!confirm(`Xóa lịch sử tháng ${month}?`)) return;
  try {
    await callApi("deleteHistoryMonth", { month });
    await loadHistory();
    showToast("Đã xóa lịch sử tháng đã chọn");
  } catch (error) {
    showToast(readError(error));
  }
}

function openAutoSyncDialog() {
  if (!isAdmin()) return;
  elements.autoSyncDialog.showModal();
  elements.autoSyncDialog.querySelectorAll("[data-auto]").forEach((button) => {
    button.onclick = async () => {
      const minutes = Number(button.dataset.auto || 0);
      try {
        const data = await callApi("setAutoSync", { minutes });
        showToast(data.message || "Đã cập nhật auto");
        elements.autoSyncDialog.close();
      } catch (error) {
        showToast(readError(error));
      }
    };
  });
}

function bindContentClicks(root) {
  root.querySelectorAll(".content-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      elements.contentFullText.textContent = cell.dataset.content || "";
      elements.contentDialog.showModal();
      refreshIcons();
    });
  });
}

async function callApi(action, payload = {}, forceToken = false) {
  ensureApiUrl();
  if (!state.session) {
    state.session = localStorage.getItem("ttckAppsScriptSession") || "";
  }

  const params = {
    action,
    payload,
    session: state.session,
  };

  if (forceToken || !state.session) {
    const user = auth.currentUser;
    if (!user) throw new Error("Cần đăng nhập Gmail.");
    params.idToken = await user.getIdToken(true);
  }

  const result = await apiRequest(params);
  if (!result || result.ok === false) {
    if (result && result.needToken && !forceToken) {
      return callApi(action, payload, true);
    }
    throw new Error((result && result.error) || "Apps Script API lỗi.");
  }

  if (result.session) {
    state.session = result.session;
    localStorage.setItem("ttckAppsScriptSession", result.session);
  }

  return result.data || {};
}

async function apiRequest(params) {
  try {
    return await fetchRequest(params);
  } catch (error) {
    console.warn("Fetch Apps Script failed, fallback to JSONP", error);
    return jsonpRequest(params);
  }
}

async function fetchRequest(params) {
  const callback = `__ttck_fetch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = buildApiUrl(params, callback);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
    return parseJsonpEnvelope(text, callback);
  } finally {
    clearTimeout(timer);
  }
}

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callback = `__ttck_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = buildApiUrl(params, callback);

    const script = document.createElement("script");
    const timer = setTimeout(() => cleanup(() => reject(new Error("Apps Script phản hồi quá lâu."))), 45000);

    window[callback] = (data) => cleanup(() => resolve(data));
    script.onerror = () => cleanup(() => reject(new Error("Không gọi được Apps Script Web App.")));
    script.src = url.toString();
    document.head.appendChild(script);

    function cleanup(done) {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
      done();
    }
  });
}

function buildApiUrl(params, callback) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set("callback", callback);
  url.searchParams.set("action", params.action);
  url.searchParams.set("payload", JSON.stringify(params.payload || {}));
  if (params.session) url.searchParams.set("session", params.session);
  if (params.idToken) url.searchParams.set("idToken", params.idToken);
  return url;
}

function parseJsonpEnvelope(text, callback) {
  const source = String(text || "").trim();
  const prefix = `${callback}(`;
  if (!source.startsWith(prefix) || !source.endsWith(");")) {
    throw new Error("Apps Script trả dữ liệu không hợp lệ.");
  }
  return JSON.parse(source.slice(prefix.length, -2));
}

function ensureApiUrl() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("PASTE_APPS_SCRIPT")) {
    throw new Error("Chưa cấu hình Apps Script Web App URL trong app.js.");
  }
}

function isAdmin() {
  return state.profile && state.profile.role === "admin";
}

function isSessionExpired() {
  const loginAt = Number(localStorage.getItem("ttckLoginAt") || 0);
  if (!loginAt) {
    markSession();
    return false;
  }
  return Date.now() - loginAt > SESSION_MS;
}

function markSession() {
  localStorage.setItem("ttckLoginAt", String(Date.now()));
}

function setupDefaultDates() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  elements.statsFrom.value = toInputDate(first);
  elements.statsTo.value = toInputDate(now);
  elements.historyMonth.value = currentMonthInput();
}

function toInputDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonth(value) {
  return String(value || "").replace("-", "");
}

function parseAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function formatDigitsInput(value) {
  const parsed = parseAmount(value);
  return parsed === null ? "" : formatMoney(parsed);
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString("vi-VN");
}

function setBusy(text) {
  elements.syncStatus.textContent = text;
}

function setReady(text) {
  elements.syncStatus.textContent = text || "Sẵn sàng";
}

let toastTimer = null;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 4200);
}

function readError(error) {
  const raw = error && (error.message || error.code || String(error));
  return raw ? raw.replace(/^Firebase:\s*/i, "") : "Có lỗi xảy ra";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
