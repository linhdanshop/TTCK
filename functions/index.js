"use strict";

const { google } = require("googleapis");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { setGlobalOptions } = require("firebase-functions/v2");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

initializeApp({
  databaseURL: "https://ttck-a7176-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const db = getDatabase();

const GMAIL_CLIENT_ID = defineSecret("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = defineSecret("GMAIL_CLIENT_SECRET");
const GMAIL_REFRESH_TOKEN = defineSecret("GMAIL_REFRESH_TOKEN");

const ADMIN_EMAILS = new Set([
  "kythuatlado@gmail.com",
  "tranvanan180393@gmail.com",
]);

const STAFF_EMAILS = new Set([
  "shoplinhdan2026@gmail.com",
]);

const STAFF_AMOUNT_LIMIT = 2_000_000;
const TZ = "Asia/Ho_Chi_Minh";

const DEFAULT_EMPLOYEES = [
  { id: "nguyet", name: "Nguyệt", permission: "write", active: true },
  { id: "thuy", name: "Thủy", permission: "read", active: true },
  { id: "huyen", name: "Huyền", permission: "read", active: true },
];

exports.bootstrap = onCall(async (request) => {
  const user = requireKnownUser(request);
  await ensureDefaultEmployees();
  const profile = await ensureProfile(user);
  const employees = await readEmployees();
  return { profile, employees };
});

exports.selectEmployee = onCall(async (request) => {
  const user = requireKnownUser(request);
  const employeeId = safeString(request.data && request.data.employeeId);

  if (!employeeId && user.role !== "admin") {
    throw new HttpsError("failed-precondition", "Nhân viên phải chọn tên thao tác.");
  }

  let patch = {
    email: user.email,
    role: user.role,
    updatedAt: now(),
  };

  if (employeeId) {
    const employee = await getEmployee(employeeId);
    if (!employee || employee.active === false) {
      throw new HttpsError("not-found", "Không tìm thấy nhân viên.");
    }
    patch = {
      ...patch,
      employeeId,
      employeeName: employee.name,
      employeePermission: employee.permission,
    };
  } else {
    patch = {
      ...patch,
      employeeId: "",
      employeeName: "Admin",
      employeePermission: "write",
    };
  }

  await db.ref(`profiles/${user.uid}`).update(patch);
  const profile = await readProfile(user.uid);
  return { profile };
});

exports.searchTransactions = onCall(async (request) => {
  const user = requireKnownUser(request);
  const data = request.data || {};
  const mode = data.mode === "fuzzy" ? "fuzzy" : "exact";
  const queryText = safeString(data.query);
  const amount = parseAmount(data.amount);
  const dateKey = parseDateKey(data.date);
  const timeText = parseTimeText(data.time);

  if (!queryText && amount === null && !dateKey && !timeText) {
    return { rows: [], message: "Nhập dữ liệu để lọc." };
  }

  if (user.role !== "admin" && amount !== null && amount > STAFF_AMOUNT_LIMIT) {
    throw new HttpsError("permission-denied", "Nhân viên chỉ được lọc số tiền từ 0 đến 2.000.000.");
  }

  const rows = await getTransactionsForSearch({ dateKey, amount });
  const normalizedNeedle = normalizeText(queryText);
  const exactNeedle = normalizeExact(queryText);
  const terms = normalizedNeedle.split(/\s+/).filter(Boolean);

  const filtered = [];
  for (const row of rows) {
    if (amount !== null && Number(row.amount || 0) !== amount) continue;
    if (dateKey && row.dateKey !== dateKey) continue;
    if (timeText && !String(row.time || "").startsWith(timeText)) continue;

    if (queryText) {
      const contentNorm = row.contentNorm || normalizeText(row.content || "");
      const contentExact = row.contentExact || normalizeExact(row.content || "");
      if (mode === "exact" && !contentExact.includes(exactNeedle)) continue;
      if (mode === "fuzzy" && !terms.every((term) => contentNorm.includes(term))) continue;
    }

    filtered.push(row);
  }

  filtered.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const limited = filtered.slice(0, 500);
  const enriched = await attachActions(limited, user);

  return {
    rows: enriched,
    total: filtered.length,
    message: filtered.length > limited.length ? `Hiển thị ${limited.length}/${filtered.length} dòng mới nhất.` : "",
  };
});

exports.listTransactions = onCall(async (request) => {
  const user = requireKnownUser(request);
  requireAdmin(user);

  const limit = clampNumber(request.data && request.data.limit, 50, 1000, 500);
  const snap = await db.ref("transactions").orderByChild("timestamp").limitToLast(limit).get();
  const rows = snapshotToArray(snap);
  rows.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return { rows: rows.map(formatTransactionRow) };
});

exports.setChecked = onCall(async (request) => {
  const user = requireKnownUser(request);
  const id = requireTxId(request.data && request.data.id);
  const checked = Boolean(request.data && request.data.checked);
  const actor = await requireWriteActor(user);

  if (!checked && user.role !== "admin") {
    throw new HttpsError("permission-denied", "Chỉ admin được bỏ tích.");
  }

  const tx = await getTransaction(id);
  const actionRef = db.ref(`transactionActions/${id}`);
  const before = (await actionRef.get()).val() || {};
  const timestamp = now();

  const patch = checked
    ? {
        checked: true,
        checkedAt: timestamp,
        checkedByUid: user.uid,
        checkedByEmail: user.email,
        checkedByName: actor.name,
        updatedAt: timestamp,
        updatedByName: actor.name,
      }
    : {
        checked: false,
        checkedAt: null,
        checkedByUid: null,
        checkedByEmail: null,
        checkedByName: null,
        updatedAt: before.note ? Number(before.noteAt || timestamp) : null,
        updatedByName: before.note ? before.noteByName || actor.name : null,
      };

  await actionRef.update(patch);
  await writeHistory({
    actor,
    tx,
    action: checked ? "checked" : "unchecked",
    actionText: checked ? "Tích chọn" : "Bỏ tích",
    detail: summarizeTransaction(tx),
    before,
    after: { ...before, ...patch },
  });

  return { ok: true };
});

exports.saveNote = onCall(async (request) => {
  const user = requireKnownUser(request);
  const id = requireTxId(request.data && request.data.id);
  const note = safeString(request.data && request.data.note, 500);
  const actor = await requireWriteActor(user);
  const tx = await getTransaction(id);

  const actionRef = db.ref(`transactionActions/${id}`);
  const before = (await actionRef.get()).val() || {};
  const timestamp = now();
  const patch = {
    note,
    noteAt: note ? timestamp : null,
    noteByUid: note ? user.uid : null,
    noteByEmail: note ? user.email : null,
    noteByName: note ? actor.name : null,
    updatedAt: note ? timestamp : before.checked ? Number(before.checkedAt || timestamp) : null,
    updatedByName: note ? actor.name : before.checked ? before.checkedByName || actor.name : null,
  };

  await actionRef.update(patch);
  await writeHistory({
    actor,
    tx,
    action: "note",
    actionText: note ? "Ghi chú" : "Xóa ghi chú",
    detail: note ? `${summarizeTransaction(tx)} | ${note}` : summarizeTransaction(tx),
    before,
    after: { ...before, ...patch },
  });

  return { ok: true };
});

exports.getStats = onCall(async (request) => {
  const user = requireKnownUser(request);
  await ensureProfile(user);

  const fromKey = parseDateKey(request.data && request.data.from) || firstDayOfCurrentMonthKey();
  const toKey = parseDateKey(request.data && request.data.to) || todayKey();
  const actionsSnap = await db.ref("transactionActions").get();
  const actions = actionsSnap.val() || {};
  const rows = [];
  let checkedCount = 0;
  let noteCount = 0;
  const actorCounts = new Map();

  for (const [id, action] of Object.entries(actions)) {
    const actionTime = Math.max(Number(action.checkedAt || 0), Number(action.noteAt || 0), Number(action.updatedAt || 0));
    if (!actionTime) continue;
    const actionDateKey = dateKeyFromTimestamp(actionTime);
    if (actionDateKey < fromKey || actionDateKey > toKey) continue;
    if (!action.checked && !action.note) continue;

    const tx = await getTransaction(id, false);
    if (!tx) continue;

    if (action.checked) checkedCount++;
    if (action.note) noteCount++;
    const actorName = action.updatedByName || action.checkedByName || action.noteByName || "";
    if (actorName) actorCounts.set(actorName, (actorCounts.get(actorName) || 0) + 1);

    rows.push(formatTransactionRow({ id, ...tx }, action, user));
  }

  rows.sort((a, b) => Number(b.actionAt || 0) - Number(a.actionAt || 0));

  const actors = Array.from(actorCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));

  return {
    rows,
    summary: { checkedCount, noteCount, actors },
  };
});

exports.saveEmployees = onCall(async (request) => {
  const user = requireKnownUser(request);
  requireAdmin(user);

  const input = Array.isArray(request.data && request.data.employees) ? request.data.employees : [];
  const normalized = {};
  for (const employee of input) {
    const name = safeString(employee.name, 60);
    if (!name) continue;
    const id = safeEmployeeId(employee.id || name);
    normalized[id] = {
      id,
      name,
      permission: employee.permission === "read" ? "read" : "write",
      active: employee.active !== false,
      updatedAt: now(),
    };
  }

  await db.ref("employees").set(normalized);
  const employees = await readEmployees();
  return { employees };
});

exports.getHistory = onCall(async (request) => {
  const user = requireKnownUser(request);
  requireAdmin(user);

  const month = parseMonth(request.data && request.data.month) || currentMonthKey();
  const snap = await db.ref(`history/${month}`).orderByChild("createdAt").limitToLast(500).get();
  const rows = snapshotToArray(snap);
  rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return {
    rows: rows.map((row) => ({
      ...row,
      createdAtText: formatDateTime(row.createdAt),
    })),
  };
});

exports.deleteHistoryMonth = onCall(async (request) => {
  const user = requireKnownUser(request);
  requireAdmin(user);
  const month = parseMonth(request.data && request.data.month);
  if (!month) throw new HttpsError("invalid-argument", "Tháng không hợp lệ.");
  await db.ref(`history/${month}`).remove();
  return { ok: true };
});

exports.syncGmail = onCall({
  secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (request) => {
  const user = requireKnownUser(request);
  requireAdmin(user);

  const days = clampNumber(request.data && request.data.days, 1, 31, 1);
  const oauth = new google.auth.OAuth2(
    GMAIL_CLIENT_ID.value(),
    GMAIL_CLIENT_SECRET.value(),
  );
  oauth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN.value() });

  const gmail = google.gmail({ version: "v1", auth: oauth });
  const queryDays = days === 1 ? 2 : days + 1;
  const query = `from:mailalert@acb.com.vn newer_than:${queryDays}d`;
  const messages = await listGmailMessages(gmail, query);
  const minDateKey = days === 1 ? todayKey() : shiftDateKey(-(days - 1));
  const maxDateKey = todayKey();

  let added = 0;
  let duplicated = 0;
  let skipped = 0;
  const parseErrors = [];

  for (const item of messages) {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: item.id,
      format: "full",
    });

    const parsed = parseAcbMessage(message.data);
    if (!parsed.ok) {
      skipped++;
      if (parseErrors.length < 20) {
        parseErrors.push({ id: item.id, reason: parsed.reason, snippet: parsed.snippet });
      }
      continue;
    }

    if (parsed.data.dateKey < minDateKey || parsed.data.dateKey > maxDateKey) {
      skipped++;
      continue;
    }

    if (parsed.data.type !== "Ghi có") {
      skipped++;
      continue;
    }

    const tx = {
      ...parsed.data,
      gmailMessageId: item.id,
      gmailThreadId: item.threadId || "",
      syncedAt: now(),
    };
    const id = safeTxId(tx.transactionCode || item.id);
    const ref = db.ref(`transactions/${id}`);
    const existing = await ref.get();
    if (existing.exists()) {
      duplicated++;
      continue;
    }

    await ref.set({
      id,
      ...tx,
      contentNorm: normalizeText(tx.content),
      contentExact: normalizeExact(tx.content),
    });
    added++;
  }

  await db.ref(`syncLogs/${currentMonthKey()}`).push({
    createdAt: now(),
    actorEmail: user.email,
    days,
    query,
    totalMessages: messages.length,
    added,
    duplicated,
    skipped,
    parseErrors,
  });

  return { ok: true, added, duplicated, skipped, totalMessages: messages.length };
});

async function ensureDefaultEmployees() {
  const snap = await db.ref("employees").get();
  if (snap.exists()) return;
  const data = {};
  for (const employee of DEFAULT_EMPLOYEES) {
    data[employee.id] = { ...employee, createdAt: now() };
  }
  await db.ref("employees").set(data);
}

async function ensureProfile(user) {
  const ref = db.ref(`profiles/${user.uid}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    const profile = {
      uid: user.uid,
      email: user.email,
      role: user.role,
      employeeId: user.role === "admin" ? "" : "",
      employeeName: user.role === "admin" ? "Admin" : "",
      employeePermission: user.role === "admin" ? "write" : "",
      createdAt: now(),
      updatedAt: now(),
    };
    await ref.set(profile);
    return profile;
  }

  const current = snap.val() || {};
  const patch = {
    email: user.email,
    role: user.role,
    updatedAt: now(),
  };
  if (user.role === "admin" && !current.employeeName) {
    patch.employeeName = "Admin";
    patch.employeePermission = "write";
  }
  await ref.update(patch);
  return readProfile(user.uid);
}

async function readProfile(uid) {
  const snap = await db.ref(`profiles/${uid}`).get();
  return snap.val() || {};
}

async function readEmployees() {
  const snap = await db.ref("employees").get();
  return snapshotToArray(snap)
    .filter((employee) => employee.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
}

async function getEmployee(id) {
  if (!id) return null;
  const snap = await db.ref(`employees/${safeEmployeeId(id)}`).get();
  return snap.val();
}

async function getTransaction(id, required = true) {
  const snap = await db.ref(`transactions/${safeTxId(id)}`).get();
  if (!snap.exists()) {
    if (required) throw new HttpsError("not-found", "Không tìm thấy giao dịch.");
    return null;
  }
  return snap.val();
}

async function getTransactionsForSearch({ dateKey, amount }) {
  let snap;
  if (dateKey) {
    snap = await db.ref("transactions").orderByChild("dateKey").equalTo(dateKey).get();
  } else if (amount !== null) {
    snap = await db.ref("transactions").orderByChild("amount").equalTo(amount).get();
  } else {
    snap = await db.ref("transactions").orderByChild("timestamp").get();
  }
  return snapshotToArray(snap);
}

async function attachActions(transactions, user) {
  const result = [];
  const canWrite = await isUserAllowedToWrite(user);
  for (const row of transactions) {
    const action = (await db.ref(`transactionActions/${row.id}`).get()).val() || {};
    result.push(formatTransactionRow(row, action, user, canWrite));
  }
  return result;
}

function formatTransactionRow(row, action = {}, user = null, writeFlag = false) {
  const checked = Boolean(action.checked);
  const note = safeString(action.note || "", 500);
  const actorName = action.updatedByName || action.checkedByName || action.noteByName || "";
  const actionAt = Math.max(Number(action.checkedAt || 0), Number(action.noteAt || 0), Number(action.updatedAt || 0));
  return {
    id: row.id,
    dateKey: row.dateKey || "",
    dateText: row.dateText || formatDate(row.timestamp),
    time: row.time || "",
    timestamp: row.timestamp || 0,
    amount: Number(row.amount || 0),
    content: row.content || "",
    type: row.type || "",
    transactionCode: row.transactionCode || "",
    gmailMessageId: row.gmailMessageId || "",
    checked,
    note,
    actorName,
    actionAt,
    actionAtText: actionAt ? formatDateTime(actionAt) : "",
    canWrite: user ? writeFlag : false,
  };
}

async function isUserAllowedToWrite(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const profile = await readProfile(user.uid);
  if (!profile.employeeId) return false;
  const employee = await getEmployee(profile.employeeId);
  return Boolean(employee && employee.active !== false && employee.permission === "write");
}

async function requireWriteActor(user) {
  const profile = await ensureProfile(user);
  if (user.role === "admin") {
    return {
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: profile.employeeName || "Admin",
      permission: "write",
    };
  }

  const employeeId = profile.employeeId;
  if (!employeeId) {
    throw new HttpsError("failed-precondition", "Chọn nhân viên trước khi thao tác.");
  }

  const employee = await getEmployee(employeeId);
  if (!employee || employee.active === false) {
    throw new HttpsError("failed-precondition", "Nhân viên đã bị xóa hoặc chưa có quyền.");
  }

  if (employee.permission !== "write") {
    throw new HttpsError("permission-denied", "Nhân viên này chỉ được xem.");
  }

  return {
    uid: user.uid,
    email: user.email,
    role: user.role,
    employeeId,
    name: employee.name,
    permission: employee.permission,
  };
}

async function writeHistory(entry) {
  const createdAt = now();
  const month = monthKeyFromTimestamp(createdAt);
  await db.ref(`history/${month}`).push({
    createdAt,
    actorUid: entry.actor.uid,
    actorEmail: entry.actor.email,
    actorName: entry.actor.name,
    action: entry.action,
    actionText: entry.actionText,
    txId: entry.tx.id || "",
    detail: entry.detail || "",
    before: entry.before || null,
    after: entry.after || null,
  });
}

function requireKnownUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập Gmail.");
  }
  const email = String(request.auth.token.email || "").toLowerCase();
  if (!email) throw new HttpsError("permission-denied", "Không đọc được email đăng nhập.");

  const role = ADMIN_EMAILS.has(email) ? "admin" : STAFF_EMAILS.has(email) ? "staff" : "";
  if (!role) {
    throw new HttpsError("permission-denied", "Gmail này chưa được cấp quyền.");
  }

  return {
    uid: request.auth.uid,
    email,
    role,
  };
}

function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    throw new HttpsError("permission-denied", "Chỉ admin được dùng chức năng này.");
  }
}

function requireTxId(id) {
  const safe = safeTxId(id);
  if (!safe) throw new HttpsError("invalid-argument", "Thiếu mã giao dịch.");
  return safe;
}

async function listGmailMessages(gmail, query) {
  const messages = [];
  let pageToken = undefined;
  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    messages.push(...(response.data.messages || []));
    pageToken = response.data.nextPageToken;
  } while (pageToken && messages.length < 3000);
  return messages;
}

function parseAcbMessage(message) {
  const body = extractPayloadText(message.payload || {});
  const flat = htmlToText(body)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!flat) {
    return { ok: false, reason: "Không lấy được nội dung email", snippet: "" };
  }

  const folded = foldText(flat);
  const amountMatch = folded.match(/\bgiao dich moi nhat\s*:?\s*ghi co\s*\+?\s*([\d,.]+)\s*vnd/i)
    || folded.match(/\bghi co\s*\+?\s*([\d,.]+)\s*vnd/i);

  if (!amountMatch) {
    return { ok: false, reason: "Không tìm thấy Ghi có + số tiền", snippet: flat.slice(0, 500) };
  }

  const contentMatch = flat.match(/Nội dung giao dịch\s*:?\s*([\s\S]*?)(?:Cảm ơn|Trân trọng|$)/i);
  const content = cleanContent(contentMatch ? contentMatch[1] : "");
  if (!content) {
    return { ok: false, reason: "Không tách được nội dung giao dịch", snippet: flat.slice(0, 500) };
  }

  const type = "Ghi có";
  const amount = parseMoneyText(amountMatch[1]);
  const txInfo = parseTransactionInfo(content, message.internalDate);

  return {
    ok: true,
    data: {
      type,
      amount,
      content,
      transactionCode: txInfo.transactionCode,
      dateKey: txInfo.dateKey,
      dateText: txInfo.dateText,
      time: txInfo.time,
      timestamp: txInfo.timestamp,
    },
  };
}

function parseTransactionInfo(content, internalDate) {
  let match = content.match(/\bACB-GD-([A-Z0-9]+)-(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) {
    return buildTxInfo(match[1], match[2], match[3], internalDate);
  }

  match = content.match(/\bGD\s+([A-Z0-9]+)\s+(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) {
    return buildTxInfo(match[1], match[2], match[3], internalDate);
  }

  match = content.match(/\b(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) {
    return buildTxInfo("", match[1], match[2], internalDate);
  }

  const timestamp = Number(internalDate || Date.now());
  return {
    transactionCode: "",
    dateKey: dateKeyFromTimestamp(timestamp),
    dateText: formatDate(timestamp),
    time: formatTime(timestamp),
    timestamp,
  };
}

function buildTxInfo(transactionCode, ddmmyy, time, internalDate) {
  const dd = Number(ddmmyy.slice(0, 2));
  const mm = Number(ddmmyy.slice(2, 4));
  const yy = Number(ddmmyy.slice(4, 6));
  const year = 2000 + yy;
  const [hh, mi, ss] = time.split(":").map(Number);
  const timestamp = Date.UTC(year, mm - 1, dd, hh - 7, mi, ss);
  if (!Number.isFinite(timestamp)) {
    const fallback = Number(internalDate || Date.now());
    return {
      transactionCode,
      dateKey: dateKeyFromTimestamp(fallback),
      dateText: formatDate(fallback),
      time: formatTime(fallback),
      timestamp: fallback,
    };
  }

  return {
    transactionCode,
    dateKey: `${year}${String(mm).padStart(2, "0")}${String(dd).padStart(2, "0")}`,
    dateText: `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${year}`,
    time,
    timestamp,
  };
}

function extractPayloadText(payload) {
  const pieces = [];
  walk(payload);
  return pieces.join("\n");

  function walk(part) {
    if (!part) return;
    const mimeType = String(part.mimeType || "");
    if ((mimeType.includes("text/plain") || mimeType.includes("text/html")) && part.body && part.body.data) {
      pieces.push(decodeBase64Url(part.body.data));
    }
    for (const child of part.parts || []) walk(child);
  }
}

function decodeBase64Url(value) {
  return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(value) {
  return decodeHtmlEntities(String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function cleanContent(value) {
  return String(value || "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(/[^\d]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function parseMoneyText(value) {
  let text = String(value || "").trim();
  if (/[.,]\d{2}$/.test(text)) text = text.slice(0, -3);
  return Number(text.replace(/[^\d]/g, "") || 0);
}

function parseDateKey(value) {
  const text = safeString(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}${match[2]}${match[1]}`;
  match = text.match(/^(\d{8})$/);
  if (match) return match[1];
  return "";
}

function parseTimeText(value) {
  const text = safeString(value);
  const match = text.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function parseMonth(value) {
  const text = safeString(value);
  const match = text.match(/^(\d{4})-?(\d{2})$/);
  return match ? `${match[1]}${match[2]}` : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foldText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function snapshotToArray(snap) {
  const value = snap.val() || {};
  return Object.entries(value).map(([id, row]) => ({ id, ...(row || {}) }));
}

function safeString(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeEmployeeId(value) {
  const normalized = normalizeText(value).replace(/_/g, " ").trim();
  const slug = normalized.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return slug || `nv_${now()}`;
}

function safeTxId(value) {
  return String(value || "")
    .trim()
    .replace(/[.#$\[\]\/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function summarizeTransaction(tx) {
  return `${tx.dateText || ""} ${tx.time || ""} | ${formatMoney(tx.amount)} | ${tx.content || ""}`.slice(0, 700);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function now() {
  return Date.now();
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Number(timestamp)));
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(Number(timestamp)));
}

function formatDateTime(timestamp) {
  if (!timestamp) return "";
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`;
}

function dateKeyFromTimestamp(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Number(timestamp)));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}${map.month}${map.day}`;
}

function monthKeyFromTimestamp(timestamp) {
  return dateKeyFromTimestamp(timestamp).slice(0, 6);
}

function currentMonthKey() {
  return monthKeyFromTimestamp(now());
}

function todayKey() {
  return dateKeyFromTimestamp(now());
}

function shiftDateKey(offsetDays) {
  return dateKeyFromTimestamp(now() + offsetDays * 24 * 60 * 60 * 1000);
}

function firstDayOfCurrentMonthKey() {
  const key = todayKey();
  return `${key.slice(0, 6)}01`;
}
