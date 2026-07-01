/***************
 * TTCK Apps Script backend
 * - Deploy as Web App, Execute as: Me, Access: Anyone
 * - The script owner should be the Gmail account that receives ACB mail:
 *   nguyenthingocnhung0703@gmail.com
 ***************/

const CONFIG = {
  TZ: 'Asia/Ho_Chi_Minh',
  ACB_FROM: 'mailalert@acb.com.vn',
  MAX_SEARCH_ROWS: 500,
  MAX_TOTAL_ROWS_FOR_SHEET: 2000,
  SESSION_SECONDS: 21600,
  DATA_SHEET: 'DATA_CK',
  LOG_SHEET: 'LOG_SYNC',
  SETTINGS_SHEET: 'CAI_DAT',
  DEBUG_SHEET: 'DEBUG_ACB',
  FIREBASE_API_KEY: 'AIzaSyDR0zkPrbqQRot8KLajCPSF9nQ3qavPlrc',
  DATABASE_URL: 'https://ttck-a7176-default-rtdb.asia-southeast1.firebasedatabase.app',
  ADMIN_EMAILS: [
    'kythuatlado@gmail.com',
    'tranvanan180393@gmail.com'
  ],
  STAFF_EMAILS: [
    'shoplinhdan2026@gmail.com'
  ],
  DEFAULT_EMPLOYEES: [
    { id: 'nguyet', name: 'Nguyệt', permission: 'write', active: true },
    { id: 'thuy', name: 'Thủy', permission: 'read', active: true },
    { id: 'huyen', name: 'Huyền', permission: 'read', active: true }
  ]
};

function doGet(e) {
  const callback = String((e.parameter && e.parameter.callback) || '').trim();
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)
    ? callback
    : 'callback';

  let response;
  try {
    const action = String((e.parameter && e.parameter.action) || '').trim();
    const payload = parseJson_((e.parameter && e.parameter.payload) || '{}');
    const idToken = String((e.parameter && e.parameter.idToken) || '').trim();
    const session = String((e.parameter && e.parameter.session) || '').trim();
    response = route_(action, payload, idToken, session);
  } catch (err) {
    if (err && err.message === '__NEED_TOKEN__') {
      response = {
        ok: false,
        needToken: true,
        error: 'Cần làm mới phiên đăng nhập.'
      };
    } else {
    response = {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
    }
  }

  const output = safeCallback + '(' + JSON.stringify(response) + ');';
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function route_(action, payload, idToken, session) {
  const user = getUser_(idToken, session);
  let data;

  switch (action) {
    case 'bootstrap':
      ensureAll_();
      data = {
        profile: ensureProfile_(user),
        employees: readEmployees_()
      };
      break;

    case 'selectEmployee':
      data = { profile: selectEmployee_(user, payload.employeeId) };
      break;

    case 'searchTransactions':
      data = searchTransactions_(user, payload);
      break;

    case 'setChecked':
      data = setChecked_(user, payload);
      break;

    case 'saveNote':
      data = saveNote_(user, payload);
      break;

    case 'getStats':
      data = getStats_(user, payload);
      break;

    case 'saveEmployees':
      requireAdmin_(user);
      data = saveEmployees_(payload.employees);
      break;

    case 'getHistory':
      requireAdmin_(user);
      data = getHistory_(payload.month);
      break;

    case 'deleteHistoryMonth':
      requireAdmin_(user);
      data = deleteHistoryMonth_(payload.month);
      break;

    case 'syncGmail':
      requireAdmin_(user);
      data = syncGmailByDays_(Number(payload.days || 1), user.email);
      break;

    case 'setAutoSync':
      requireAdmin_(user);
      data = setAutoSync_(Number(payload.minutes || 0), user.email);
      break;

    default:
      throw new Error('Action không hợp lệ.');
  }

  const newSession = session || createSession_(user);
  return {
    ok: true,
    session: newSession,
    data: data || {}
  };
}

function getUser_(idToken, session) {
  if (session) {
    const cached = CacheService.getScriptCache().get('session_' + session);
    if (cached) return JSON.parse(cached);
  }

  if (!idToken) {
    throwNeedToken_();
  }

  const info = verifyFirebaseToken_(idToken);
  const email = String(info.email || '').toLowerCase();
  const uid = String(info.localId || '').trim();

  if (!email || !uid) throw new Error('Không đọc được email đăng nhập.');

  const role = CONFIG.ADMIN_EMAILS.indexOf(email) >= 0
    ? 'admin'
    : CONFIG.STAFF_EMAILS.indexOf(email) >= 0
      ? 'staff'
      : '';

  if (!role) throw new Error('Gmail này chưa được cấp quyền.');

  return { uid, email, role };
}

function throwNeedToken_() {
  throw new Error('__NEED_TOKEN__');
}

function verifyFirebaseToken_(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(CONFIG.FIREBASE_API_KEY);
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ idToken })
  });
  const code = res.getResponseCode();
  const data = parseJson_(res.getContentText() || '{}');
  if (code < 200 || code >= 300 || !data.users || !data.users.length) {
    throw new Error('Token đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
  return data.users[0];
}

function createSession_(user) {
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session_' + raw, JSON.stringify(user), CONFIG.SESSION_SECONDS);
  return raw;
}

function ensureAll_() {
  ensureSheets_();
  ensureEmployees_();
}

function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();
  const data = ss.getSheetByName(CONFIG.DATA_SHEET) || ss.insertSheet(CONFIG.DATA_SHEET);
  ensureHeader_(data, [
    'Ngày', 'Giờ', 'Ngày giờ', 'Loại', 'Số tiền', 'Nội dung CK', 'Mã GD',
    'Gmail Message ID', 'Đã chọn', 'Ghi chú', 'Thao tác', 'Thời gian thao tác', 'Tạo lúc'
  ]);
  data.setFrozenRows(1);
  data.getRange('A:A').setNumberFormat('dd/MM/yyyy');
  data.getRange('B:B').setNumberFormat('@');
  data.getRange('C:C').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  data.getRange('E:E').setNumberFormat('#,##0');

  const log = ss.getSheetByName(CONFIG.LOG_SHEET) || ss.insertSheet(CONFIG.LOG_SHEET);
  ensureHeader_(log, ['Thời gian', 'Loại', 'Thêm mới', 'Trùng', 'Bỏ qua', 'Ghi chú']);
  log.setFrozenRows(1);

  const settings = ss.getSheetByName(CONFIG.SETTINGS_SHEET) || ss.insertSheet(CONFIG.SETTINGS_SHEET);
  ensureHeader_(settings, ['Khóa', 'Giá trị', 'Cập nhật lúc', 'Người cập nhật']);
  settings.setFrozenRows(1);

  const debug = ss.getSheetByName(CONFIG.DEBUG_SHEET) || ss.insertSheet(CONFIG.DEBUG_SHEET);
  ensureHeader_(debug, ['Thời gian', 'Gmail ID', 'Lý do', 'Mẫu nội dung']);
  debug.setFrozenRows(1);
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (!current[i]) sheet.getRange(1, i + 1).setValue(headers[i]);
  }
}

function ensureEmployees_() {
  const existing = firebaseGet_('employees') || {};
  if (Object.keys(existing).length) return;
  const data = {};
  CONFIG.DEFAULT_EMPLOYEES.forEach(emp => {
    data[emp.id] = Object.assign({}, emp, { createdAt: now_() });
  });
  firebasePut_('employees', data);
}

function readEmployees_() {
  ensureEmployees_();
  const employees = firebaseGet_('employees') || {};
  return Object.keys(employees)
    .map(id => Object.assign({ id }, employees[id]))
    .filter(emp => emp.active !== false)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

function ensureProfile_(user) {
  const path = 'profiles/' + safeKey_(user.uid);
  let profile = firebaseGet_(path);
  if (!profile) {
    profile = {
      uid: user.uid,
      email: user.email,
      role: user.role,
      employeeId: '',
      employeeName: user.role === 'admin' ? 'Admin' : '',
      employeePermission: user.role === 'admin' ? 'write' : '',
      createdAt: now_(),
      updatedAt: now_()
    };
    firebasePut_(path, profile);
    return profile;
  }

  profile.email = user.email;
  profile.role = user.role;
  if (user.role === 'admin' && !profile.employeeName) {
    profile.employeeName = 'Admin';
    profile.employeePermission = 'write';
  }
  profile.updatedAt = now_();
  firebasePatch_(path, profile);
  return profile;
}

function selectEmployee_(user, employeeId) {
  const id = String(employeeId || '').trim();
  const profile = ensureProfile_(user);

  if (!id && user.role !== 'admin') throw new Error('Nhân viên phải chọn tên thao tác.');

  if (!id) {
    profile.employeeId = '';
    profile.employeeName = 'Admin';
    profile.employeePermission = 'write';
  } else {
    const employee = firebaseGet_('employees/' + safeEmployeeId_(id));
    if (!employee || employee.active === false) throw new Error('Không tìm thấy nhân viên.');
    profile.employeeId = employee.id || safeEmployeeId_(id);
    profile.employeeName = employee.name;
    profile.employeePermission = employee.permission;
  }

  profile.updatedAt = now_();
  firebasePut_('profiles/' + safeKey_(user.uid), profile);
  return profile;
}

function searchTransactions_(user, payload) {
  ensureAll_();
  payload = payload || {};
  const mode = payload.mode === 'fuzzy' ? 'fuzzy' : 'exact';
  const query = String(payload.query || '').trim();
  const amount = parseAmountInput_(payload.amount);
  const dateKey = parseDateKey_(payload.date);
  const timeText = parseTimeText_(payload.time);

  if (!query && amount === null && !dateKey && !timeText) {
    return { rows: [], message: 'Nhập dữ liệu để lọc.' };
  }
  if (user.role !== 'admin' && amount !== null && amount > 2000000) {
    throw new Error('Nhân viên chỉ được lọc số tiền từ 0 đến 2.000.000.');
  }

  let rows = [];
  if (dateKey) {
    rows = firebaseQuery_('transactions', { orderBy: 'dateKey', equalTo: dateKey });
  } else if (amount !== null) {
    rows = firebaseQuery_('transactions', { orderBy: 'amount', equalTo: amount });
  } else {
    rows = firebaseQuery_('transactions', { orderBy: 'timestamp', limitToLast: CONFIG.MAX_TOTAL_ROWS_FOR_SHEET });
  }

  const exactNeedle = normalizeExact_(query);
  const terms = normalizeText_(query).split(/\s+/).filter(Boolean);
  const filtered = [];

  rows.forEach(row => {
    if (amount !== null && Number(row.amount || 0) !== amount) return;
    if (dateKey && row.dateKey !== dateKey) return;
    if (timeText && String(row.time || '').indexOf(timeText) !== 0) return;
    if (query) {
      const content = String(row.content || '');
      if (mode === 'exact' && normalizeExact_(content).indexOf(exactNeedle) < 0) return;
      if (mode === 'fuzzy') {
        const haystack = row.contentNorm || normalizeText_(content);
        if (!terms.every(term => haystack.indexOf(term) >= 0)) return;
      }
    }
    filtered.push(row);
  });

  filtered.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const limited = filtered.slice(0, CONFIG.MAX_SEARCH_ROWS);
  const canWrite = isUserAllowedToWrite_(user);

  return {
    rows: limited.map(row => formatRowForWeb_(row, firebaseGet_('transactionActions/' + safeKey_(row.id)) || {}, canWrite)),
    total: filtered.length,
    message: filtered.length > limited.length ? 'Hiển thị ' + limited.length + '/' + filtered.length + ' dòng mới nhất.' : ''
  };
}

function setChecked_(user, payload) {
  const id = safeKey_(payload && payload.id);
  if (!id) throw new Error('Thiếu mã giao dịch.');
  const checked = !!(payload && payload.checked);
  const actor = requireWriteActor_(user);
  if (!checked && user.role !== 'admin') throw new Error('Chỉ admin được bỏ tích.');

  const tx = firebaseGet_('transactions/' + id);
  if (!tx) throw new Error('Không tìm thấy giao dịch.');
  const before = firebaseGet_('transactionActions/' + id) || {};
  const ts = now_();
  const patch = checked
    ? {
        checked: true,
        checkedAt: ts,
        checkedByUid: user.uid,
        checkedByEmail: user.email,
        checkedByName: actor.name,
        updatedAt: ts,
        updatedByName: actor.name
      }
    : {
        checked: false,
        checkedAt: null,
        checkedByUid: null,
        checkedByEmail: null,
        checkedByName: null,
        updatedAt: before.note ? Number(before.noteAt || ts) : null,
        updatedByName: before.note ? before.noteByName || actor.name : null
      };
  firebasePatch_('transactionActions/' + id, patch);
  writeHistory_(actor, tx, checked ? 'checked' : 'unchecked', checked ? 'Tích chọn' : 'Bỏ tích', summarizeTx_(tx), before, Object.assign({}, before, patch));
  updateSheetAction_(id);
  return { ok: true };
}

function saveNote_(user, payload) {
  const id = safeKey_(payload && payload.id);
  if (!id) throw new Error('Thiếu mã giao dịch.');
  const note = String((payload && payload.note) || '').trim().slice(0, 500);
  const actor = requireWriteActor_(user);
  const tx = firebaseGet_('transactions/' + id);
  if (!tx) throw new Error('Không tìm thấy giao dịch.');
  const before = firebaseGet_('transactionActions/' + id) || {};
  const ts = now_();
  const patch = {
    note,
    noteAt: note ? ts : null,
    noteByUid: note ? user.uid : null,
    noteByEmail: note ? user.email : null,
    noteByName: note ? actor.name : null,
    updatedAt: note ? ts : before.checked ? Number(before.checkedAt || ts) : null,
    updatedByName: note ? actor.name : before.checked ? before.checkedByName || actor.name : null
  };
  firebasePatch_('transactionActions/' + id, patch);
  writeHistory_(actor, tx, 'note', note ? 'Ghi chú' : 'Xóa ghi chú', note ? summarizeTx_(tx) + ' | ' + note : summarizeTx_(tx), before, Object.assign({}, before, patch));
  updateSheetAction_(id);
  return { ok: true };
}

function getStats_(user, payload) {
  ensureProfile_(user);
  const fromKey = parseDateKey_(payload && payload.from) || firstDayOfMonthKey_();
  const toKey = parseDateKey_(payload && payload.to) || todayKey_();
  const actions = firebaseGet_('transactionActions') || {};
  const rows = [];
  const actorCounts = {};
  let checkedCount = 0;
  let noteCount = 0;

  Object.keys(actions).forEach(id => {
    const action = actions[id] || {};
    const actionAt = Math.max(Number(action.checkedAt || 0), Number(action.noteAt || 0), Number(action.updatedAt || 0));
    if (!actionAt) return;
    const actionDateKey = dateKeyFromTs_(actionAt);
    if (actionDateKey < fromKey || actionDateKey > toKey) return;
    if (!action.checked && !action.note) return;
    const tx = firebaseGet_('transactions/' + safeKey_(id));
    if (!tx) return;
    if (action.checked) checkedCount++;
    if (action.note) noteCount++;
    const actor = action.updatedByName || action.checkedByName || action.noteByName || '';
    if (actor) actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    rows.push(formatRowForWeb_(tx, action, false));
  });

  rows.sort((a, b) => Number(b.actionAt || 0) - Number(a.actionAt || 0));
  const actors = Object.keys(actorCounts)
    .map(name => ({ name, count: actorCounts[name] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));

  return {
    rows,
    summary: { checkedCount, noteCount, actors }
  };
}

function saveEmployees_(employees) {
  const input = Array.isArray(employees) ? employees : [];
  const data = {};
  input.forEach(emp => {
    const name = String(emp.name || '').trim().slice(0, 60);
    if (!name) return;
    const id = safeEmployeeId_(emp.id || name);
    data[id] = {
      id,
      name,
      permission: emp.permission === 'read' ? 'read' : 'write',
      active: emp.active !== false,
      updatedAt: now_()
    };
  });
  firebasePut_('employees', data);
  return { employees: readEmployees_() };
}

function getHistory_(monthInput) {
  const month = parseMonth_(monthInput) || currentMonthKey_();
  const rows = firebaseQuery_('history/' + month, { orderBy: 'createdAt', limitToLast: 500 });
  rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return {
    rows: rows.map(row => Object.assign({}, row, { createdAtText: formatDateTime_(row.createdAt) }))
  };
}

function deleteHistoryMonth_(monthInput) {
  const month = parseMonth_(monthInput);
  if (!month) throw new Error('Tháng không hợp lệ.');
  firebaseDelete_('history/' + month);
  return { ok: true };
}

function syncGmailByDays_(days, actorEmail) {
  ensureAll_();
  days = Math.max(1, Math.min(31, Number(days || 1)));

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Đang có lượt cập nhật khác chạy.');
  }

  try {
    const minKey = days === 1 ? todayKey_() : shiftDateKey_(days - 1);
    const maxKey = todayKey_();
    const query = 'from:' + CONFIG.ACB_FROM + ' newer_than:' + (days === 1 ? 2 : days + 1) + 'd';
    const threads = GmailApp.search(query, 0, 500);
    let added = 0;
    let duplicated = 0;
    let skipped = 0;
    const debug = [];

    threads.forEach(thread => {
      thread.getMessages().forEach(msg => {
        const parsed = parseAcbEmail_(msg);
        if (!parsed.ok) {
          skipped++;
          if (debug.length < 30) debug.push([new Date(), msg.getId(), parsed.reason, parsed.snippet || '']);
          return;
        }
        const tx = parsed.data;
        if (tx.dateKey < minKey || tx.dateKey > maxKey) {
          skipped++;
          return;
        }
        if (tx.type !== 'Ghi có') {
          skipped++;
          return;
        }

        const id = safeKey_(tx.transactionCode || msg.getId());
        if (firebaseGet_('transactions/' + id)) {
          duplicated++;
          return;
        }

        tx.id = id;
        tx.gmailMessageId = msg.getId();
        tx.gmailThreadId = thread.getId();
        tx.syncedAt = now_();
        tx.contentNorm = normalizeText_(tx.content);
        tx.contentExact = normalizeExact_(tx.content);
        firebasePut_('transactions/' + id, tx);
        appendTransactionToSheet_(tx);
        added++;
      });
    });

    if (debug.length) appendDebug_(debug);
    writeSyncLog_('sync ' + days + ' ngày', added, duplicated, skipped, 'query=' + query + ' actor=' + (actorEmail || 'auto'));
    firebasePush_('syncLogs/' + currentMonthKey_(), {
      createdAt: now_(),
      actorEmail: actorEmail || 'auto',
      days,
      query,
      added,
      duplicated,
      skipped
    });
    sortDataSheet_();
    return { added, duplicated, skipped };
  } finally {
    lock.releaseLock();
  }
}

function autoSyncToday() {
  syncGmailByDays_(1, 'auto');
}

function setAutoSync_(minutes, actorEmail) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'autoSyncToday') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  if (minutes === 1 || minutes === 5) {
    ScriptApp.newTrigger('autoSyncToday').timeBased().everyMinutes(minutes).create();
    updateSetting_('autoSyncMinutes', String(minutes), actorEmail);
    return { message: 'Đã bật auto cập nhật mỗi ' + minutes + ' phút.' };
  }

  updateSetting_('autoSyncMinutes', '0', actorEmail);
  return { message: 'Đã tắt auto cập nhật.' };
}

function isUserAllowedToWrite_(user) {
  if (user.role === 'admin') return true;
  const profile = ensureProfile_(user);
  if (!profile.employeeId) return false;
  const employee = firebaseGet_('employees/' + safeEmployeeId_(profile.employeeId));
  return !!(employee && employee.active !== false && employee.permission === 'write');
}

function requireWriteActor_(user) {
  const profile = ensureProfile_(user);
  if (user.role === 'admin') {
    return {
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: profile.employeeName || 'Admin',
      permission: 'write'
    };
  }

  if (!profile.employeeId) throw new Error('Chọn nhân viên trước khi thao tác.');
  const employee = firebaseGet_('employees/' + safeEmployeeId_(profile.employeeId));
  if (!employee || employee.active === false) throw new Error('Nhân viên đã bị xóa hoặc chưa có quyền.');
  if (employee.permission !== 'write') throw new Error('Nhân viên này chỉ được xem.');

  return {
    uid: user.uid,
    email: user.email,
    role: user.role,
    employeeId: profile.employeeId,
    name: employee.name,
    permission: employee.permission
  };
}

function requireAdmin_(user) {
  if (!user || user.role !== 'admin') throw new Error('Chỉ admin được dùng chức năng này.');
}

function formatRowForWeb_(row, action, canWrite) {
  action = action || {};
  const actionAt = Math.max(Number(action.checkedAt || 0), Number(action.noteAt || 0), Number(action.updatedAt || 0));
  return {
    id: row.id,
    dateKey: row.dateKey || '',
    dateText: row.dateText || formatDate_(row.timestamp),
    time: row.time || '',
    timestamp: row.timestamp || 0,
    amount: Number(row.amount || 0),
    content: row.content || '',
    type: row.type || '',
    transactionCode: row.transactionCode || '',
    checked: !!action.checked,
    note: String(action.note || ''),
    actorName: action.updatedByName || action.checkedByName || action.noteByName || '',
    actionAt,
    actionAtText: actionAt ? formatDateTime_(actionAt) : '',
    canWrite: !!canWrite
  };
}

function parseAcbEmail_(msg) {
  let raw = '';
  try { raw += '\n' + (msg.getPlainBody() || ''); } catch (err) {}
  try { raw += '\n' + htmlToText_(msg.getBody() || ''); } catch (err) {}
  raw = decodeHtml_(raw);

  const flat = String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!flat) return { ok: false, reason: 'Không lấy được nội dung email', snippet: '' };

  const folded = foldText_(flat);
  const amountMatch = folded.match(/\bgiao dich moi nhat\s*:?\s*ghi co\s*\+?\s*([\d,.]+)\s*vnd/i)
    || folded.match(/\bghi co\s*\+?\s*([\d,.]+)\s*vnd/i);
  if (!amountMatch) return { ok: false, reason: 'Không tìm thấy Ghi có + số tiền', snippet: flat.slice(0, 500) };

  const contentMatch = flat.match(/Nội dung giao dịch\s*:?\s*([\s\S]*?)(?:Cảm ơn|Trân trọng|$)/i);
  const content = cleanContent_(contentMatch ? contentMatch[1] : '');
  if (!content) return { ok: false, reason: 'Không tách được nội dung giao dịch', snippet: flat.slice(0, 500) };

  const txInfo = parseTxInfo_(content, msg.getDate());
  return {
    ok: true,
    data: {
      type: 'Ghi có',
      amount: parseMoneyText_(amountMatch[1]),
      content,
      transactionCode: txInfo.transactionCode,
      dateKey: txInfo.dateKey,
      dateText: txInfo.dateText,
      time: txInfo.time,
      timestamp: txInfo.timestamp
    }
  };
}

function parseTxInfo_(content, fallbackDate) {
  let match = String(content || '').match(/\bACB-GD-([A-Z0-9]+)-(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) return buildTxInfo_(match[1], match[2], match[3], fallbackDate);

  match = String(content || '').match(/\bGD\s+([A-Z0-9]+)\s+(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) return buildTxInfo_(match[1], match[2], match[3], fallbackDate);

  match = String(content || '').match(/\b(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) return buildTxInfo_('', match[1], match[2], fallbackDate);

  const d = fallbackDate || new Date();
  return {
    transactionCode: '',
    dateKey: dateKeyFromDate_(d),
    dateText: Utilities.formatDate(d, CONFIG.TZ, 'dd/MM/yyyy'),
    time: Utilities.formatDate(d, CONFIG.TZ, 'HH:mm:ss'),
    timestamp: d.getTime()
  };
}

function buildTxInfo_(transactionCode, ddmmyy, time, fallbackDate) {
  const dd = Number(ddmmyy.slice(0, 2));
  const mm = Number(ddmmyy.slice(2, 4));
  const yy = Number(ddmmyy.slice(4, 6));
  const year = 2000 + yy;
  const parts = time.split(':').map(Number);
  const d = new Date(year, mm - 1, dd, parts[0], parts[1], parts[2]);
  if (isNaN(d.getTime())) {
    return parseTxInfo_('', fallbackDate || new Date());
  }
  return {
    transactionCode,
    dateKey: Utilities.formatDate(d, CONFIG.TZ, 'yyyyMMdd'),
    dateText: Utilities.formatDate(d, CONFIG.TZ, 'dd/MM/yyyy'),
    time,
    timestamp: d.getTime()
  };
}

function appendTransactionToSheet_(tx) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.DATA_SHEET);
  sh.appendRow([
    tx.dateText,
    tx.time,
    new Date(Number(tx.timestamp || now_())),
    tx.type,
    tx.amount,
    tx.content,
    tx.transactionCode,
    tx.gmailMessageId,
    '',
    '',
    '',
    '',
    new Date()
  ]);
}

function updateSheetAction_(id) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.DATA_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getRange(2, 7, sh.getLastRow() - 1, 2).getValues();
  const action = firebaseGet_('transactionActions/' + safeKey_(id)) || {};
  for (let i = 0; i < values.length; i++) {
    const code = safeKey_(values[i][0]);
    const gmailId = safeKey_(values[i][1]);
    if (code === id || gmailId === id) {
      const row = i + 2;
      sh.getRange(row, 9, 1, 4).setValues([[
        action.checked ? '.' : '',
        action.note || '',
        action.updatedByName || action.checkedByName || action.noteByName || '',
        action.updatedAt ? new Date(Number(action.updatedAt)) : ''
      ]]);
      break;
    }
  }
}

function sortDataSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.DATA_SHEET);
  if (!sh || sh.getLastRow() < 3) return;
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort([{ column: 3, ascending: false }]);
}

function writeHistory_(actor, tx, action, actionText, detail, before, after) {
  const createdAt = now_();
  firebasePush_('history/' + monthKeyFromTs_(createdAt), {
    createdAt,
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorName: actor.name,
    action,
    actionText,
    txId: tx.id || '',
    detail: String(detail || '').slice(0, 900),
    before: before || null,
    after: after || null
  });
}

function writeSyncLog_(type, added, duplicated, skipped, note) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.LOG_SHEET);
  sh.appendRow([new Date(), type, added || 0, duplicated || 0, skipped || 0, note || '']);
}

function appendDebug_(rows) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.DEBUG_SHEET);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function updateSetting_(key, value, actorEmail) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SETTINGS_SHEET);
  const last = sh.getLastRow();
  if (last >= 2) {
    const keys = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0] || ''));
    const index = keys.indexOf(key);
    if (index >= 0) {
      sh.getRange(index + 2, 2, 1, 3).setValues([[value, new Date(), actorEmail || '']]);
      return;
    }
  }
  sh.appendRow([key, value, new Date(), actorEmail || '']);
}

function firebaseGet_(path) {
  return firebaseRequest_(path, 'get');
}

function firebasePut_(path, value) {
  return firebaseRequest_(path, 'put', value);
}

function firebasePatch_(path, value) {
  return firebaseRequest_(path, 'patch', value);
}

function firebasePush_(path, value) {
  return firebaseRequest_(path, 'post', value);
}

function firebaseDelete_(path) {
  return firebaseRequest_(path, 'delete');
}

function firebaseQuery_(path, query) {
  const result = firebaseRequest_(path, 'get', null, query) || {};
  return Object.keys(result).map(id => Object.assign({ id }, result[id] || {}));
}

function firebaseRequest_(path, method, value, query) {
  const token = getServiceAccountAccessToken_();
  let url = CONFIG.DATABASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\/+/, '') + '.json?access_token=' + encodeURIComponent(token);
  if (query) {
    Object.keys(query).forEach(key => {
      let v = query[key];
      if (key === 'orderBy') v = JSON.stringify(v);
      if (key === 'equalTo') v = JSON.stringify(v);
      url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(v);
    });
  }
  const options = {
    method,
    muteHttpExceptions: true
  };
  if (value !== undefined && value !== null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(value);
  }
  const res = UrlFetchApp.fetch(url, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Firebase RTDB lỗi ' + code + ': ' + text);
  }
  return text ? parseJson_(text) : null;
}

function getServiceAccountAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('firebase_access_token');
  if (cached) return cached;

  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty('SERVICE_ACCOUNT_EMAIL');
  let privateKey = props.getProperty('SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!clientEmail || !privateKey) {
    throw new Error('Thiếu SERVICE_ACCOUNT_EMAIL hoặc SERVICE_ACCOUNT_PRIVATE_KEY trong Script Properties.');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600
  };
  const unsigned = base64Url_(JSON.stringify(header)) + '.' + base64Url_(JSON.stringify(claim));
  const signature = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const jwt = unsigned + '.' + base64UrlBytes_(signature);
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  const data = parseJson_(res.getContentText() || '{}');
  if (!data.access_token) throw new Error('Không lấy được Firebase access token: ' + res.getContentText());
  cache.put('firebase_access_token', data.access_token, 3300);
  return data.access_token;
}

function base64Url_(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function base64UrlBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function parseJson_(text) {
  try { return JSON.parse(text); } catch (err) { return {}; }
}

function parseAmountInput_(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d]/g, ''));
  return isFinite(n) ? n : null;
}

function parseMoneyText_(value) {
  let s = String(value || '').trim();
  if (/[.,]\d{2}$/.test(s)) s = s.slice(0, -3);
  return Number(s.replace(/[^\d]/g, '') || 0);
}

function parseDateKey_(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + m[2] + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + m[2] + m[1];
  m = s.match(/^(\d{8})$/);
  if (m) return m[1];
  return '';
}

function parseTimeText_(value) {
  const m = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  return m ? m[1] + ':' + m[2] : '';
}

function parseMonth_(value) {
  const m = String(value || '').trim().match(/^(\d{4})-?(\d{2})$/);
  return m ? m[1] + m[2] : '';
}

function safeKey_(value) {
  return String(value || '')
    .trim()
    .replace(/[.#$\[\]\/]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
}

function safeEmployeeId_(value) {
  const slug = normalizeText_(value).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return slug || ('nv_' + now_());
}

function normalizeText_(value) {
  return removeTone_(String(value || ''))
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExact_(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function foldText_(value) {
  return removeTone_(String(value || '')).toLowerCase().replace(/\s+/g, ' ').trim();
}

function removeTone_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function cleanContent_(value) {
  return String(value || '').replace(/\*/g, '').replace(/\s+/g, ' ').replace(/\.+$/g, '').trim();
}

function htmlToText_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtml_(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function(_, dec) { return String.fromCharCode(Number(dec)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}

function summarizeTx_(tx) {
  return String((tx.dateText || '') + ' ' + (tx.time || '') + ' | ' + formatMoney_(tx.amount) + ' | ' + (tx.content || '')).slice(0, 700);
}

function formatMoney_(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function now_() {
  return Date.now();
}

function dateKeyFromDate_(d) {
  return Utilities.formatDate(d, CONFIG.TZ, 'yyyyMMdd');
}

function dateKeyFromTs_(ts) {
  return Utilities.formatDate(new Date(Number(ts)), CONFIG.TZ, 'yyyyMMdd');
}

function monthKeyFromTs_(ts) {
  return Utilities.formatDate(new Date(Number(ts)), CONFIG.TZ, 'yyyyMM');
}

function currentMonthKey_() {
  return monthKeyFromTs_(now_());
}

function todayKey_() {
  return dateKeyFromTs_(now_());
}

function firstDayOfMonthKey_() {
  return todayKey_().slice(0, 6) + '01';
}

function shiftDateKey_(daysBack) {
  return dateKeyFromTs_(now_() - Number(daysBack || 0) * 24 * 60 * 60 * 1000);
}

function formatDate_(ts) {
  return ts ? Utilities.formatDate(new Date(Number(ts)), CONFIG.TZ, 'dd/MM/yyyy') : '';
}

function formatDateTime_(ts) {
  return ts ? Utilities.formatDate(new Date(Number(ts)), CONFIG.TZ, 'dd/MM/yyyy HH:mm:ss') : '';
}
