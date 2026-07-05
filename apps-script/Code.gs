/***************
 * TTCK Apps Script backend - no Firebase Functions, no service account.
 * Deploy as Web App, Execute as: Me, Access: Anyone.
 * The script owner should be the Gmail account that receives ACB mail:
 * nguyenthingocnhung0703@gmail.com
 ***************/

const CONFIG = {
  TZ: 'Asia/Ho_Chi_Minh',
  ACB_FROM: 'mailalert@acb.com.vn',
  MAX_SEARCH_ROWS: 500,
  MAX_GMAIL_THREADS: 2000,
  FULL_SYNC_DAYS: 3650,
  DEFAULT_DAILY_SYNC_TIMES: '23:59,08:00,12:00',
  SCHEDULE_CHECK_MINUTES: 1,
  SCHEDULE_WINDOW_MINUTES: 10,
  SESSION_SECONDS: 21600,
  STAFF_AMOUNT_LIMIT: 2000000,
  FIREBASE_API_KEY: 'AIzaSyDR0zkPrbqQRot8KLajCPSF9nQ3qavPlrc',
  RTDB_URL: 'https://ttck-a7176-default-rtdb.asia-southeast1.firebasedatabase.app',
  SHEETS: {
    DATA: 'DATA_CK',
    EMPLOYEES: 'NHAN_VIEN',
    PROFILES: 'PHIEN_NGUOI_DUNG',
    HISTORY: 'LICH_SU',
    LOG: 'LOG_SYNC',
    SETTINGS: 'CAI_DAT',
    DEBUG: 'DEBUG_ACB'
  },
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

const APP_VERSION = '20260705-dedupe-no-rtdb-log';
const DATA_HEADERS = [
  'ID', 'Ngày', 'Giờ', 'Ngày giờ', 'Loại', 'Số tiền', 'Nội dung CK', 'Mã GD',
  'Gmail Message ID', 'Đã chọn', 'Ghi chú', 'Thao tác', 'Thời gian thao tác',
  'Tạo lúc', 'Email thao tác'
];
const EMPLOYEE_HEADERS = ['ID', 'Tên nhân viên', 'Quyền', 'Trạng thái', 'Cập nhật lúc'];
const PROFILE_HEADERS = ['UID', 'Email', 'Role', 'Mã nhân viên', 'Tên nhân viên', 'Cập nhật lúc'];
const HISTORY_HEADERS = ['Thời gian', 'Tháng', 'Người làm', 'Email', 'Hành động', 'Nội dung', 'ID giao dịch', 'Trước', 'Sau'];
const LOG_HEADERS = ['Thời gian', 'Loại', 'Thêm mới', 'Trùng', 'Bỏ qua', 'Ghi chú'];
const SETTINGS_HEADERS = ['Khóa', 'Giá trị', 'Cập nhật lúc', 'Người cập nhật', 'Hướng dẫn'];
const DEBUG_HEADERS = ['Thời gian', 'Gmail ID', 'Lý do', 'Mẫu nội dung'];

const OLD_DEFAULT_DAILY_SYNC_TIMES = '08:00,10:00,13:00,15:00,19:00';

const DEFAULT_SETTINGS = [
  {
    key: 'appsScriptUrl',
    value: 'https://script.google.com/macros/s/AKfycbyTY0N44s41DNl2E0KGHvpn5JM3c25a7g0dDYxopHS86HIzu9ZnY0a7WIycVFIiMjgx/exec',
    note: 'Link Deploy Web App Apps Script dang dung. Neu tao deployment moi thi dan URL /exec moi vao day va tren web.'
  },
  {
    key: 'sourceEmail',
    value: CONFIG.ACB_FROM,
    note: 'Email gửi thông báo chuyển khoản. Đổi cột Giá trị nếu Gmail nhận từ nguồn khác.'
  },
  {
    key: 'gmailExtraQuery',
    value: '',
    note: 'Điều kiện Gmail thêm, ví dụ subject:(ACB) hoặc label:TTCK. Để trống nếu không cần.'
  },
  {
    key: 'creditText',
    value: 'Ghi có',
    note: 'Chữ nhận diện tiền vào. Nếu nguồn khác dùng chữ khác thì đổi tại đây. Nhiều cụm dùng dấu |.'
  },
  {
    key: 'debitText',
    value: 'Ghi nợ',
    note: 'Chữ nhận diện tiền ra để bỏ qua. Nhiều cụm dùng dấu |.'
  },
  {
    key: 'amountRegex',
    value: '(?:\\bgiao dich moi nhat\\s*:?\\s*)?\\bghi co\\s*[^0-9+-]*\\+?\\s*([\\d,.]+)\\s*vnd',
    note: 'Regex lấy số tiền trên nội dung đã bỏ dấu. Nhóm ngoặc thứ 1 phải là số tiền.'
  },
  {
    key: 'contentStartText',
    value: 'Nội dung giao dịch',
    note: 'Cụm chữ đứng trước nội dung chuyển khoản.'
  },
  {
    key: 'contentEndRegex',
    value: 'Cảm ơn|Trân trọng|$',
    note: 'Regex đánh dấu hết nội dung chuyển khoản. Giữ $ để lấy đến cuối email nếu không gặp cụm kết thúc.'
  },
  {
    key: 'timeRegex',
    value: '(\\d{6})-(\\d{2}:\\d{2}:\\d{2})',
    note: 'Regex lấy ngày giờ trong nội dung CK. Nhóm 1 là DDMMYY, nhóm 2 là HH:mm:ss.'
  },
  {
    key: 'dailyAutoEnabled',
    value: '0',
    note: '1 là bật auto mỗi ngày khi web admin đang mở, 0 là tắt.'
  },
  {
    key: 'dailyAutoTime',
    value: '08:00',
    note: 'Giờ auto mỗi ngày theo định dạng HH:mm.'
  },
  {
    key: 'dailySyncTimes',
    value: CONFIG.DEFAULT_DAILY_SYNC_TIMES,
    note: 'Các mốc Apps Script tự lấy Gmail mỗi ngày, cách nhau bằng dấu phẩy. Mặc định 23:59,08:00,12:00; mỗi mốc chỉ chạy 1 lần/ngày. Chạy setupTTCK() một lần sau khi cập nhật code hoặc nếu trigger bị mất.'
  },
  {
    key: 'realtimeDatabaseUrl',
    value: CONFIG.RTDB_URL,
    note: 'Realtime Database URL để Apps Script đẩy dữ liệu sang web. Không cần đổi nếu vẫn dùng Firebase TTCK hiện tại.'
  },
  {
    key: 'realtimeMirrorEnabled',
    value: '1',
    note: 'Giữ để tương thích bản cũ. Web hiện tự ghi Realtime; trigger Apps Script chỉ lưu Sheet nếu serverRealtimeMirrorEnabled = 0.'
  },
  {
    key: 'serverRealtimeMirrorEnabled',
    value: '0',
    note: '0 là không cho Apps Script server ghi Realtime để tránh lỗi 401. Chỉ bật 1 khi đã có service account và rules cho phép service account đó ghi.'
  },
  {
    key: 'serviceAccountEmail',
    value: '',
    note: 'Tùy chọn cho trigger tự ghi Realtime. Dán client_email trong file service account JSON, để trống nếu chỉ dùng web admin đẩy Realtime.'
  },
  {
    key: 'serviceAccountPrivateKey',
    value: '',
    note: 'Tùy chọn cho trigger tự ghi Realtime. Dán private_key, có thể giữ dạng \\n. Không đưa khóa này lên GitHub.'
  },
  {
    key: 'autoSyncMinutes',
    value: '0',
    note: '0 là tắt auto Apps Script trigger. Mốc hợp lệ: 1, 5, 10, 15, 30 phút.'
  }
];

function setupTTCK() {
  ensureAll_(true);
  setupDefaultDailySyncTriggers_();
  const realtime = testRealtimeConnection_();
  return 'Đã tạo/cập nhật sheet TTCK, CAI_DAT và trigger tự cập nhật Gmail. ' + realtime.message;
}

function cleanupTTCKDuplicates() {
  ensureAll_();
  const result = cleanupDuplicateDataRows_();
  writeSyncLog_('Dọn trùng', 0, result.removed || 0, 0, 'Giữ dòng đã tích/ghi chú, xóa dòng trống trùng giao dịch');
  return 'Đã xóa ' + (result.removed || 0) + ' dòng trùng trong DATA_CK.';
}

function doGet(e) {
  const callback = String((e.parameter && e.parameter.callback) || '').trim();
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)
    ? callback
    : 'callback';

  let response;
  try {
    const action = String((e.parameter && e.parameter.action) || '').trim();
    if (!action || action === 'version' || action === 'ping') {
      response = {
        ok: true,
        version: APP_VERSION,
        at: new Date().toISOString(),
        message: 'TTCK Apps Script đang chạy. Web sẽ gửi token khi cần thao tác dữ liệu.'
      };
    } else {
    const payload = parseJson_((e.parameter && e.parameter.payload) || '{}');
    const idToken = String((e.parameter && e.parameter.idToken) || '').trim();
    const session = String((e.parameter && e.parameter.session) || '').trim();
    response = route_(action, payload, idToken, session);
    }
  } catch (err) {
    response = err && err.message === '__NEED_TOKEN__'
      ? { ok: false, needToken: true, error: 'Cần làm mới phiên đăng nhập.' }
      : { ok: false, error: err && err.message ? err.message : String(err) };
  }

  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(response) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function route_(action, payload, idToken, session) {
  const user = getUser_(idToken, session);
  ensureAll_();

  let data;
  switch (action) {
    case 'bootstrap':
      data = {
        profile: ensureProfile_(user),
        employees: readEmployees_(),
        settings: readSettings_()
      };
      break;

    case 'selectEmployee':
      data = { profile: selectEmployee_(user, payload.employeeId) };
      break;

    case 'searchTransactions':
      data = searchTransactions_(user, payload);
      break;

    case 'setChecked':
      data = setChecked_(user, payload, getPayloadFirebaseToken_(payload));
      break;

    case 'saveNote':
      data = saveNote_(user, payload, getPayloadFirebaseToken_(payload));
      break;

    case 'getStats':
      data = getStats_(user, payload);
      break;

    case 'saveEmployees':
      requireAdmin_(user);
      data = saveEmployees_(payload.employees, user.email);
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
      const syncAll = payload && payload.syncAll === true;
      const syncMonth = payload && payload.syncMonth === true;
      const syncDays = syncMonth ? currentMonthSyncDays_() : (syncAll ? CONFIG.FULL_SYNC_DAYS : Number(payload.days || 1));
      if (user.role !== 'admin' && (syncAll || syncMonth || syncDays !== 1)) {
        throw new Error('Nhân viên chỉ được cập nhật hôm nay.');
      }
      data = syncGmailByDays_(syncDays, user.email, {
        firebaseIdToken: getPayloadFirebaseToken_(payload),
        userRole: user.role,
        userEmail: user.email,
        syncAll,
        syncMonth,
        skipServerMirror: payload && payload.skipServerMirror === true
      });
      break;

    case 'cleanupDuplicates':
      requireAdmin_(user);
      data = cleanupDuplicateDataRows_();
      writeSyncLog_('Dọn trùng', 0, data.removed || 0, 0, user.email);
      break;

    case 'setAutoSync':
      requireAdmin_(user);
      data = setAutoSync_(Number(payload.minutes || 0), user.email);
      break;

    case 'setDailyAuto':
      requireAdmin_(user);
      data = setDailyAuto_(payload, user.email);
      break;

    case 'setDeployUrl':
      requireAdmin_(user);
      data = setDeployUrl_(payload.url, user.email);
      break;

    default:
      throw new Error('Action không hợp lệ.');
  }

  return {
    ok: true,
    session: session || createSession_(user),
    data: data || {}
  };
}

function getUser_(idToken, session) {
  if (session) {
    const cached = CacheService.getScriptCache().get('session_' + session);
    if (cached) return JSON.parse(cached);
  }
  if (!idToken) throw new Error('__NEED_TOKEN__');

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

function verifyFirebaseToken_(idToken) {
  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(CONFIG.FIREBASE_API_KEY);
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ idToken })
  });
  const data = parseJson_(res.getContentText() || '{}');
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || !data.users || !data.users.length) {
    throw new Error('Token đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
  return data.users[0];
}

function createSession_(user) {
  const raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session_' + raw, JSON.stringify(user), CONFIG.SESSION_SECONDS);
  return raw;
}

function ensureAll_(force) {
  const cache = CacheService.getScriptCache();
  const key = 'ttck_ensure_v5';
  if (!force && cache.get(key)) return;
  ensureSheets_();
  ensureEmployees_();
  ensureDefaultSettings_();
  cache.put(key, '1', 600);
}

function ensureSheets_() {
  ensureSheet_(CONFIG.SHEETS.DATA, DATA_HEADERS);
  ensureSheet_(CONFIG.SHEETS.EMPLOYEES, EMPLOYEE_HEADERS);
  ensureSheet_(CONFIG.SHEETS.PROFILES, PROFILE_HEADERS);
  ensureSheet_(CONFIG.SHEETS.HISTORY, HISTORY_HEADERS);
  ensureSheet_(CONFIG.SHEETS.LOG, LOG_HEADERS);
  ensureSheet_(CONFIG.SHEETS.SETTINGS, SETTINGS_HEADERS);
  ensureSheet_(CONFIG.SHEETS.DEBUG, DEBUG_HEADERS);

  const data = getSheet_(CONFIG.SHEETS.DATA);
  data.setFrozenRows(1);
  data.getRange('B:B').setNumberFormat('dd/MM/yyyy');
  data.getRange('C:C').setNumberFormat('@');
  data.getRange('D:D').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  data.getRange('F:F').setNumberFormat('#,##0');
  data.getRange('M:M').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  data.getRange('N:N').setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    if (name === CONFIG.SHEETS.DATA && String(sheet.getRange(1, 1).getValue()) !== 'ID') {
      sheet.insertColumnBefore(1);
    }
    const lastCol = sheet.getLastColumn();
    if (lastCol < headers.length) sheet.insertColumnsAfter(lastCol, headers.length - lastCol);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureEmployees_() {
  const sh = getSheet_(CONFIG.SHEETS.EMPLOYEES);
  if (sh.getLastRow() > 1) return;
  const now = new Date();
  const rows = CONFIG.DEFAULT_EMPLOYEES.map(emp => [
    emp.id, emp.name, emp.permission, emp.active === false ? 'inactive' : 'active', now
  ]);
  sh.getRange(2, 1, rows.length, EMPLOYEE_HEADERS.length).setValues(rows);
}

function fillMissingDataIds_() {
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const last = sh.getLastRow();
  if (last <= 1) return;
  const range = sh.getRange(2, 1, last - 1, DATA_HEADERS.length);
  const values = range.getValues();
  let changed = false;
  values.forEach(row => {
    if (!row[0]) {
      row[0] = buildId_(String(row[7] || ''), String(row[8] || ''), row[3], row[5], row[6]);
      changed = true;
    }
  });
  if (changed) range.setValues(values);
}

function readEmployees_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('ttck_employees_v1');
  if (cached) return JSON.parse(cached);
  const sh = getSheet_(CONFIG.SHEETS.EMPLOYEES);
  const values = sh.getLastRow() <= 1
    ? []
    : sh.getRange(2, 1, sh.getLastRow() - 1, EMPLOYEE_HEADERS.length).getValues();
  const employees = values
    .map(row => ({
      id: safeEmployeeId_(row[0] || row[1]),
      name: String(row[1] || '').trim(),
      permission: row[2] === 'write' ? 'write' : 'read',
      active: String(row[3] || 'active') !== 'inactive'
    }))
    .filter(emp => emp.id && emp.name && emp.active !== false);
  cache.put('ttck_employees_v1', JSON.stringify(employees), 300);
  return employees;
}

function ensureProfile_(user) {
  const sh = getSheet_(CONFIG.SHEETS.PROFILES);
  const found = findProfileRow_(user.uid);
  if (found) {
    return normalizeProfile_(user, sh.getRange(found, 1, 1, PROFILE_HEADERS.length).getValues()[0]);
  }

  const row = [user.uid, user.email, user.role, '', '', new Date()];
  sh.appendRow(row);
  return normalizeProfile_(user, row);
}

function selectEmployee_(user, employeeId) {
  const id = safeEmployeeId_(employeeId || '');
  let employeeName = '';

  if (id) {
    const employee = readEmployees_().find(emp => emp.id === id);
    if (!employee) throw new Error('Không tìm thấy nhân viên.');
    employeeName = employee.name;
  } else if (user.role !== 'admin') {
    throw new Error('Nhân viên phải chọn tên thao tác.');
  }

  const sh = getSheet_(CONFIG.SHEETS.PROFILES);
  let rowIndex = findProfileRow_(user.uid);
  if (!rowIndex) {
    sh.appendRow([user.uid, user.email, user.role, id, employeeName, new Date()]);
    rowIndex = sh.getLastRow();
  } else {
    sh.getRange(rowIndex, 1, 1, PROFILE_HEADERS.length).setValues([[
      user.uid, user.email, user.role, id, employeeName, new Date()
    ]]);
  }
  return normalizeProfile_(user, sh.getRange(rowIndex, 1, 1, PROFILE_HEADERS.length).getValues()[0]);
}

function normalizeProfile_(user, row) {
  return {
    uid: user.uid,
    email: user.email,
    role: user.role,
    employeeId: String(row[3] || '').trim(),
    employeeName: String(row[4] || '').trim()
  };
}

function findProfileRow_(uid) {
  const sh = getSheet_(CONFIG.SHEETS.PROFILES);
  const last = sh.getLastRow();
  if (last <= 1) return 0;
  const cell = sh.getRange(2, 1, last - 1, 1)
    .createTextFinder(String(uid))
    .matchEntireCell(true)
    .findNext();
  return cell ? cell.getRow() : 0;
}

function searchTransactions_(user, payload) {
  const query = String(payload.query || '').trim();
  const amount = payload.amount === '' || payload.amount === null || payload.amount === undefined
    ? null
    : Number(payload.amount);
  const dateKey = payload.date ? dateKeyFromInput_(payload.date) : '';
  const time = String(payload.time || '').trim();
  const mode = payload.mode === 'fuzzy' ? 'fuzzy' : 'exact';

  if (!query && amount === null && !dateKey && !time) {
    return { rows: [], total: 0, totalAmount: 0, message: 'Nhập dữ liệu tìm kiếm để lọc.' };
  }
  if (user.role !== 'admin' && amount !== null && amount > CONFIG.STAFF_AMOUNT_LIMIT) {
    throw new Error('Nhân viên chỉ được lọc số tiền từ 0 đến 2.000.000.');
  }

  const canWrite = isUserAllowedToWrite_(user);
  const rows = readSearchCandidateRows_(query, mode)
    .filter(row => canSeeAmount_(user, row))
    .filter(row => amount === null || Number(row.amount) === amount)
    .filter(row => !dateKey || row.dateKey === dateKey)
    .filter(row => !time || String(row.time || '').indexOf(time) === 0)
    .filter(row => matchContent_(row.content, query, mode))
    .sort((a, b) => b.timestamp - a.timestamp);

  const limited = rows.slice(0, CONFIG.MAX_SEARCH_ROWS);
  return {
    rows: limited.map(row => formatRowForWeb_(row, canWrite)),
    total: rows.length,
    totalAmount: limited.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    message: rows.length > CONFIG.MAX_SEARCH_ROWS
      ? 'Đang hiển thị 500 dòng mới nhất. Hãy lọc thêm ngày hoặc số tiền.'
      : ''
  };
}

function setChecked_(user, payload, firebaseIdToken) {
  const row = findDataRowById_(payload.id);
  if (!row) throw new Error('Không tìm thấy giao dịch.');
  const checked = !!payload.checked;
  if (!checked && user.role !== 'admin') throw new Error('Chỉ admin được bỏ tích.');
  const actor = requireWriteActor_(user);
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const before = readDataRowAt_(row);
  assertCanSeeAmount_(user, before);
  const actionAt = new Date();

  if (checked) {
    sh.getRange(row, 10, 1, 6).setValues([[true, before.note || '', actor.name, actionAt, before.createdAt || actionAt, actor.email]]);
  } else {
    sh.getRange(row, 10, 1, 6).setValues([[false, before.note || '', '', '', before.createdAt || actionAt, '']]);
  }

  const after = readDataRowAt_(row);
  writeHistory_(actor, after, checked ? 'Tích chọn' : 'Bỏ tích', after.content, before, after);
  return { row: formatRowForWeb_(after, true) };
}

function saveNote_(user, payload, firebaseIdToken) {
  const row = findDataRowById_(payload.id);
  if (!row) throw new Error('Không tìm thấy giao dịch.');
  const actor = requireWriteActor_(user);
  const note = String(payload.note || '').trim().slice(0, 500);
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const before = readDataRowAt_(row);
  assertCanSeeAmount_(user, before);
  const actionAt = note || before.checked ? new Date() : '';
  const actorName = note || before.checked ? actor.name : '';
  const actorEmail = note || before.checked ? actor.email : '';

  sh.getRange(row, 11, 1, 5).setValues([[note, actorName, actionAt, before.createdAt || new Date(), actorEmail]]);
  const after = readDataRowAt_(row);
  writeHistory_(actor, after, 'Ghi chú', note || 'Xóa ghi chú', before, after);
  return { row: formatRowForWeb_(after, true) };
}

function getStats_(user, payload) {
  const range = getStatsRange_(payload);
  const rows = readDataRows_()
    .filter(row => canSeeAmount_(user, row))
    .filter(row => row.checked || row.note)
    .filter(row => row.actionAt && row.actionAt >= range.from && row.actionAt <= range.to)
    .sort((a, b) => Number(b.actionAt || 0) - Number(a.actionAt || 0));

  const actorMap = {};
  rows.forEach(row => {
    const name = row.actorName || 'Không rõ';
    actorMap[name] = (actorMap[name] || 0) + 1;
  });

  return {
    rows: rows.map(row => formatRowForWeb_(row, isUserAllowedToWrite_(user))),
    summary: {
      checkedCount: rows.filter(row => row.checked).length,
      noteCount: rows.filter(row => row.note).length,
      actors: Object.keys(actorMap)
        .sort()
        .map(name => ({ name, count: actorMap[name] }))
    }
  };
}

function saveEmployees_(employees, actorEmail) {
  const cleaned = [];
  const used = {};
  (employees || []).forEach(item => {
    if (item && item.active === false) return;
    const name = String(item && item.name || '').trim();
    if (!name) return;
    let id = safeEmployeeId_(item.id || name);
    if (!id) id = 'nv';
    const base = id;
    let n = 2;
    while (used[id]) id = base + '_' + n++;
    used[id] = true;
    cleaned.push({
      id,
      name,
      permission: item.permission === 'write' ? 'write' : 'read',
      active: true
    });
  });
  if (!cleaned.length) throw new Error('Cần ít nhất một nhân viên.');

  const sh = getSheet_(CONFIG.SHEETS.EMPLOYEES);
  clearBody_(sh, EMPLOYEE_HEADERS.length);
  const now = new Date();
  sh.getRange(2, 1, cleaned.length, EMPLOYEE_HEADERS.length).setValues(
    cleaned.map(emp => [emp.id, emp.name, emp.permission, 'active', now])
  );
  CacheService.getScriptCache().put('ttck_employees_v1', JSON.stringify(cleaned), 300);
  writeSimpleHistory_({ name: 'Admin', email: actorEmail || '' }, 'Set quyền nhân viên', 'Cập nhật ' + cleaned.length + ' nhân viên');
  return { employees: cleaned };
}

function getHistory_(monthInput) {
  const month = String(monthInput || currentMonthKey_()).replace(/[^\d]/g, '').slice(0, 6);
  const sh = getSheet_(CONFIG.SHEETS.HISTORY);
  if (sh.getLastRow() <= 1) return { rows: [] };
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, HISTORY_HEADERS.length).getValues();
  const rows = values
    .filter(row => String(row[1] || '') === month)
    .map(row => ({
      createdAt: coerceDate_(row[0]),
      createdAtText: formatDateTime_(row[0]),
      actorName: String(row[2] || ''),
      actionText: String(row[4] || ''),
      detail: String(row[5] || '')
    }))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 500);
  return { rows };
}

function deleteHistoryMonth_(monthInput) {
  const month = String(monthInput || '').replace(/[^\d]/g, '').slice(0, 6);
  if (!month) throw new Error('Chọn tháng cần xóa.');
  const sh = getSheet_(CONFIG.SHEETS.HISTORY);
  for (let row = sh.getLastRow(); row >= 2; row--) {
    if (String(sh.getRange(row, 2).getValue()) === month) sh.deleteRow(row);
  }
  return { ok: true };
}

function syncGmailByDays_(days, actorEmail, realtimeOptions) {
  realtimeOptions = realtimeOptions || {};
  if (realtimeOptions.lockHeld === true) {
    return syncGmailByDaysLocked_(days, actorEmail, realtimeOptions);
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return syncGmailByDaysLocked_(days, actorEmail, realtimeOptions);
  } finally {
    lock.releaseLock();
  }
}

function syncGmailByDaysLocked_(days, actorEmail, realtimeOptions) {
  realtimeOptions = realtimeOptions || {};
  const syncAll = realtimeOptions.syncAll === true;
  const syncMonth = realtimeOptions.syncMonth === true;
  days = syncAll
    ? CONFIG.FULL_SYNC_DAYS
    : Math.max(1, Math.min(CONFIG.FULL_SYNC_DAYS, Math.floor(days || 1)));
  ensureAll_();
  const start = startDateForDays_(days);
  const queryDays = Math.max(days + 1, 2);
  const syncLabel = syncMonth ? 'Tháng hiện tại' : (syncAll ? 'Tất cả' : (days === 1 ? 'Hôm nay' : days + ' ngày'));
  const settings = readSettings_();
  const query = buildGmailSearchQuery_(settings, queryDays);
  const existing = {};
  readDataRows_().forEach(row => {
    existing[row.id] = true;
    const key = canonicalDataKey_(row);
    if (key) existing[key] = true;
  });

  let added = 0;
  let duplicated = 0;
  let skipped = 0;
  const debugRows = [];
  const newRows = [];

  for (let offset = 0; offset < CONFIG.MAX_GMAIL_THREADS; offset += 100) {
    const threads = GmailApp.search(query, offset, 100);
    if (!threads.length) break;
    threads.forEach(thread => {
      thread.getMessages().forEach(msg => {
        const parsed = parseAcbEmail_(msg, settings);
        if (!parsed.ok) {
          skipped++;
          if (!parsed.silent) debugRows.push([new Date(), msg.getId(), parsed.reason, parsed.snippet || '']);
          return;
        }
        const tx = parsed.data;
        if (Number(tx.timestamp || 0) < start.getTime()) {
          skipped++;
          return;
        }
        tx.gmailMessageId = msg.getId();
        tx.id = buildId_(tx.transactionCode, tx.gmailMessageId, tx.timestamp, tx.amount, tx.content);
        const txKey = canonicalDataKey_(tx);
        if (existing[tx.id] || (txKey && existing[txKey])) {
          duplicated++;
          return;
        }
        existing[tx.id] = true;
        if (txKey) existing[txKey] = true;
        added++;
        newRows.push(transactionToSheetRow_(tx));
      });
    });
  }

  if (newRows.length) {
    const sh = getSheet_(CONFIG.SHEETS.DATA);
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, DATA_HEADERS.length).setValues(newRows);
    sortDataSheet_();
  }
  const cleanup = cleanupDuplicateDataRows_();
  if (cleanup.removed) duplicated += cleanup.removed;
  if (debugRows.length) appendRows_(getSheet_(CONFIG.SHEETS.DEBUG), debugRows);
  writeSyncLog_(syncLabel, added, duplicated, skipped, actorEmail || '');
  const autoActor = actorEmail === 'auto' || String(actorEmail || '').indexOf('schedule') === 0;
  writeSimpleHistory_(
    { name: autoActor ? 'Auto' : 'Admin', email: actorEmail || '' },
    'Cập nhật Gmail',
    syncLabel + ': thêm ' + added + ', trùng ' + duplicated + ', bỏ qua ' + skipped
  );
  const firebaseRows = readDataRows_()
    .filter(row => Number(row.timestamp || 0) >= start.getTime())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5000)
    .map(formatRowForFirebase_);
  const firebaseMirror = { ok: false, skipped: true, webFallback: true, count: 0, pathCount: 0 };
  return { added, duplicated, skipped, firebaseRows, firebaseMirror };
}

function autoSyncToday() {
  syncGmailByDays_(1, 'auto', { skipServerMirror: true });
}

function scheduledSyncToday() {
  runScheduledSyncDispatcher_();
}

function runScheduledSyncDispatcher_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    ensureAll_();
    const settings = readSettings_();
    const times = getDailySyncTimes_(settings);
    const now = new Date();
    const today = Utilities.formatDate(now, CONFIG.TZ, 'yyyyMMdd');
    const yesterday = Utilities.formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000), CONFIG.TZ, 'yyyyMMdd');
    const currentMinutes = Number(Utilities.formatDate(now, CONFIG.TZ, 'H')) * 60
      + Number(Utilities.formatDate(now, CONFIG.TZ, 'm'));
    const props = PropertiesService.getScriptProperties();
    cleanupScheduleRunKeys_(props, today, yesterday);

    times.forEach(time => {
      const due = getScheduleDue_(time, currentMinutes, today, yesterday);
      if (!due.due) return;

      const runKey = 'ttck_scheduled_sync_' + due.dateKey + '_' + time.replace(':', '');
      if (props.getProperty(runKey)) return;
      props.setProperty(runKey, String(Date.now()));
      try {
        syncGmailByDays_(1, 'schedule ' + time, { skipServerMirror: true, scheduledTime: time, lockHeld: true });
      } catch (err) {
        props.deleteProperty(runKey);
        writeSyncLog_('Lỗi lịch ' + time, 0, 0, 0, err && err.message ? err.message : String(err));
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function setupDefaultDailySyncTriggers_() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'scheduledSyncToday') ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('scheduledSyncToday')
    .timeBased()
    .everyMinutes(CONFIG.SCHEDULE_CHECK_MINUTES)
    .create();
}

function getDailySyncTimes_(settings) {
  const seen = {};
  return normalizeSyncTimesText_(settings.dailySyncTimes || CONFIG.DEFAULT_DAILY_SYNC_TIMES)
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => normalizeTime_(item))
    .filter(time => {
      if (seen[time]) return false;
      seen[time] = true;
      return true;
    });
}

function normalizeSyncTimesText_(value) {
  const seen = {};
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => normalizeTime_(item))
    .filter(time => {
      if (seen[time]) return false;
      seen[time] = true;
      return true;
    })
    .join(',');
}

function timeToMinutes_(time) {
  const parts = normalizeTime_(time).split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function getScheduleDue_(time, currentMinutes, today, yesterday) {
  const targetMinutes = timeToMinutes_(time);
  let diff = currentMinutes - targetMinutes;
  let dateKey = today;
  if (diff < 0) {
    diff += 24 * 60;
    dateKey = yesterday;
  }
  return {
    due: diff >= 0 && diff < CONFIG.SCHEDULE_WINDOW_MINUTES,
    dateKey
  };
}

function cleanupScheduleRunKeys_(props, today, yesterday) {
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    const isScheduleKey = key.indexOf('ttck_scheduled_sync_') === 0;
    const isToday = key.indexOf('ttck_scheduled_sync_' + today + '_') === 0;
    const isYesterday = key.indexOf('ttck_scheduled_sync_' + yesterday + '_') === 0;
    if (isScheduleKey && !isToday && !isYesterday) {
      props.deleteProperty(key);
    }
  });
}

function buildGmailSearchQuery_(settings, queryDays) {
  const sourceEmail = String(settings.sourceEmail || CONFIG.ACB_FROM).trim();
  const extraQuery = String(settings.gmailExtraQuery || '').trim();
  const parts = [];
  if (sourceEmail) parts.push(sourceEmail.indexOf(':') >= 0 ? sourceEmail : 'from:' + sourceEmail);
  parts.push('newer_than:' + queryDays + 'd');
  if (extraQuery) parts.push(extraQuery);
  return parts.join(' ');
}

function setAutoSync_(minutes, actorEmail) {
  minutes = Math.floor(Number(minutes || 0));
  const allowed = [0, 1, 5, 10, 15, 30];
  if (allowed.indexOf(minutes) < 0) {
    throw new Error('Auto phút chỉ hỗ trợ 0, 1, 5, 10, 15 hoặc 30 phút.');
  }

  let message = 'Đã tắt auto cập nhật theo phút.';
  updateSetting_('autoSyncMinutes', String(minutes), actorEmail);

  try {
    ScriptApp.getProjectTriggers().forEach(trigger => {
      if (trigger.getHandlerFunction() === 'autoSyncToday') ScriptApp.deleteTrigger(trigger);
    });

    if (minutes > 0) {
      ScriptApp.newTrigger('autoSyncToday').timeBased().everyMinutes(minutes).create();
      message = 'Đã bật auto cập nhật mỗi ' + minutes + ' phút.';
    }
  } catch (err) {
    message = 'Đã lưu CAI_DAT, nhưng Apps Script chưa tạo được trigger: ' + (err && err.message ? err.message : err);
  }

  writeSimpleHistory_({ name: 'Admin', email: actorEmail || '' }, 'Cài auto phút', message);
  return { minutes, settings: readSettings_(), message };
}

function setDailyAuto_(payload, actorEmail) {
  const enabled = payload && payload.enabled === true;
  const time = normalizeTime_(payload && payload.time || '08:00');
  updateSetting_('dailyAutoEnabled', enabled ? '1' : '0', actorEmail);
  updateSetting_('dailyAutoTime', time, actorEmail);
  const message = enabled
    ? 'Đã bật auto mỗi ngày lúc ' + time + ' khi web admin đang mở.'
    : 'Đã tắt auto mỗi ngày khi web admin đang mở.';
  writeSimpleHistory_({ name: 'Admin', email: actorEmail || '' }, 'Cài auto ngày', message);
  const settings = readSettings_();
  settings.dailyAutoEnabled = enabled;
  settings.dailyAutoTime = time;
  return { settings, message };
}

function setDeployUrl_(url, actorEmail) {
  const cleanUrl = normalizeAppsScriptExecUrl_(url);
  updateSetting_('appsScriptUrl', cleanUrl, actorEmail);
  const message = 'Đã lưu link Deploy Apps Script.';
  writeSimpleHistory_({ name: 'Admin', email: actorEmail || '' }, 'Cài link Deploy', cleanUrl);
  const settings = readSettings_();
  settings.appsScriptUrl = cleanUrl;
  return { settings, message };
}

function normalizeAppsScriptExecUrl_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec/i);
  if (!match) throw new Error('Link Deploy phải có dạng https://script.google.com/macros/s/.../exec');
  return match[0];
}

function isUserAllowedToWrite_(user) {
  if (user.role === 'admin') return true;
  const profile = ensureProfile_(user);
  if (!profile.employeeId) return false;
  const employee = readEmployees_().find(emp => emp.id === profile.employeeId);
  return !!employee && employee.permission === 'write';
}

function requireWriteActor_(user) {
  if (!isUserAllowedToWrite_(user)) {
    throw new Error('Tài khoản này chỉ được xem hoặc chưa chọn nhân viên.');
  }
  const profile = ensureProfile_(user);
  return {
    name: profile.employeeName || (user.role === 'admin' ? 'Admin' : ''),
    email: user.email
  };
}

function requireAdmin_(user) {
  if (!user || user.role !== 'admin') throw new Error('Chỉ admin được thao tác mục này.');
}

function canSeeAmount_(user, row) {
  return user && (user.role === 'admin' || Number(row.amount || 0) <= CONFIG.STAFF_AMOUNT_LIMIT);
}

function assertCanSeeAmount_(user, row) {
  if (!canSeeAmount_(user, row)) {
    throw new Error('Nhân viên không có quyền xem hoặc thao tác đơn trên 2.000.000.');
  }
}

function readDataRows_() {
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const last = sh.getLastRow();
  if (last <= 1) return [];
  const values = sh.getRange(2, 1, last - 1, DATA_HEADERS.length).getValues();
  return values
    .map((row, index) => sheetRowToObject_(row, index + 2))
    .filter(row => row.id);
}

function readSearchCandidateRows_(query, mode) {
  const needle = searchCandidateNeedle_(query, mode);
  if (!needle || needle.length < 3) return readDataRows_();

  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const last = sh.getLastRow();
  if (last <= 1) return [];

  const ranges = sh.getRange(2, 7, last - 1, 1)
    .createTextFinder(needle)
    .matchCase(false)
    .findAll();

  if (!ranges.length || ranges.length > 500) return readDataRows_();

  const rows = [];
  const seen = {};
  ranges.forEach(range => {
    const rowNumber = range.getRow();
    if (seen[rowNumber]) return;
    seen[rowNumber] = true;
    const values = sh.getRange(rowNumber, 1, 1, DATA_HEADERS.length).getValues()[0];
    const row = sheetRowToObject_(values, rowNumber);
    if (row.id) rows.push(row);
  });
  return rows;
}

function searchCandidateNeedle_(query, mode) {
  const text = String(query || '').trim();
  if (!text) return '';
  if (mode === 'exact') return text;
  const tokens = text.split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .sort((a, b) => b.length - a.length);
  return tokens[0] || text;
}

function readDataRowAt_(sheetRow) {
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  return sheetRowToObject_(sh.getRange(sheetRow, 1, 1, DATA_HEADERS.length).getValues()[0], sheetRow);
}

function sheetRowToObject_(row, sheetRow) {
  const date = coerceDate_(row[1] || row[3]);
  const timestampDate = coerceDate_(row[3] || row[1]);
  const actionAt = coerceDate_(row[12]);
  const createdAt = coerceDate_(row[13]);
  return {
    sheetRow,
    id: String(row[0] || '').trim(),
    date,
    dateKey: date ? dateKeyFromDate_(date) : '',
    dateText: row[1] ? formatDate_(row[1]) : '',
    time: String(row[2] || ''),
    timestamp: timestampDate ? timestampDate.getTime() : 0,
    type: String(row[4] || ''),
    amount: Number(row[5] || 0),
    content: String(row[6] || ''),
    transactionCode: String(row[7] || ''),
    gmailMessageId: String(row[8] || ''),
    checked: row[9] === true || String(row[9]).toLowerCase() === 'true' || String(row[9]) === '.',
    note: String(row[10] || ''),
    actorName: String(row[11] || ''),
    actionAt,
    createdAt,
    actorEmail: String(row[14] || '')
  };
}

function findDataRowById_(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return 0;
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  if (sh.getLastRow() <= 1) return 0;
  const found = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(safeId)
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : 0;
}

function formatRowForWeb_(row, canWrite) {
  return {
    id: row.id,
    dateText: row.dateText,
    time: row.time,
    amount: row.amount,
    content: row.content,
    type: row.type,
    checked: !!row.checked,
    note: row.note || '',
    actorName: row.actorName || '',
    actionAtText: row.actionAt ? formatDateTime_(row.actionAt) : '',
    canWrite: !!canWrite
  };
}

function formatRowForFirebase_(row) {
  return {
    id: row.id,
    dateText: row.dateText,
    dateKey: row.dateKey,
    time: row.time,
    timestamp: Number(row.timestamp || 0),
    amount: Number(row.amount || 0),
    content: row.content || '',
    type: row.type || 'Ghi có',
    checked: !!row.checked,
    note: row.note || '',
    actorName: row.actorName || '',
    actionAtText: row.actionAt ? formatDateTime_(row.actionAt) : '',
    createdAt: row.createdAt ? row.createdAt.getTime() : Date.now()
  };
}

function mirrorRowsToRealtimeSafely_(rows, options) {
  return {
    ok: true,
    skipped: true,
    disabled: true,
    webFallback: true,
    count: 0,
    pathCount: 0,
    message: 'Apps Script server mirror đã tắt; web dùng Firebase Auth để ghi Realtime.'
  };
}

function mirrorRowsToRealtime_(rows, settings, options) {
  return mirrorRowsToRealtimeSafely_(rows, options);
}

function testRealtimeConnection_() {
  return {
    ok: true,
    skipped: true,
    message: 'Realtime server mirror đã tắt; web dùng Firebase Auth để ghi Realtime.'
  };
}

function requestRealtime_(path, method, payload, settings, options) {
  return {
    getResponseCode: function() { return 204; },
    getContentText: function() { return '{"skipped":true,"reason":"serverRealtimeMirrorDisabled"}'; }
  };
}

function getRealtimeBaseUrl_(settings) {
  const url = String(settings && settings.realtimeDatabaseUrl || CONFIG.RTDB_URL || '').trim();
  return url.replace(/\/+$/, '');
}

function getRealtimeAuth_(settings, options) {
  // Browser actions already mirror Realtime with Firebase Auth directly.
  // Apps Script only mirrors in unattended triggers when a service account is configured.
  const serviceToken = getServiceAccountAccessToken_(settings);
  if (serviceToken) return { type: 'oauth', token: serviceToken };

  return null;
}

function getPayloadFirebaseToken_(payload) {
  return String(payload && payload.firebaseIdToken || '').trim();
}

function getServiceAccountAccessToken_(settings) {
  const email = String(settings && settings.serviceAccountEmail || '').trim();
  const privateKey = normalizePrivateKey_(settings && settings.serviceAccountPrivateKey);
  if (!email || !privateKey) return '';

  const cache = CacheService.getScriptCache();
  const cached = cache.get('ttck_service_account_access_token');
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = base64Url_(JSON.stringify(header)) + '.' + base64Url_(JSON.stringify(claim));
  const signature = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const assertion = unsigned + '.' + base64Url_(signature);
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Không lấy được service account token (' + code + '): ' + text.slice(0, 300));
  }
  const data = JSON.parse(text || '{}');
  if (!data.access_token) throw new Error('Service account không trả access_token.');
  cache.put('ttck_service_account_access_token', data.access_token, Math.max(60, Number(data.expires_in || 3600) - 120));
  return data.access_token;
}

function normalizePrivateKey_(value) {
  const key = String(value || '').trim();
  return key ? key.replace(/\\n/g, '\n') : '';
}

function base64Url_(value) {
  const bytes = typeof value === 'string' ? Utilities.newBlob(value).getBytes() : value;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function cleanRealtimeTransaction_(row) {
  return {
    id: String(row.id || ''),
    dateText: String(row.dateText || ''),
    dateKey: String(row.dateKey || dateKeyFromText_(row.dateText || '')),
    time: String(row.time || ''),
    timestamp: Number(row.timestamp || 0),
    amount: Number(row.amount || 0),
    content: String(row.content || ''),
    type: String(row.type || 'Ghi có'),
    createdAt: Number(row.createdAt || Date.now())
  };
}

function cleanRealtimeAction_(row) {
  if (!row.checked && !row.note && !row.actorName && !row.actionAtText) return null;
  return {
    checked: !!row.checked,
    note: String(row.note || ''),
    actorName: String(row.actorName || ''),
    actionAtText: String(row.actionAtText || ''),
    updatedAt: Date.now()
  };
}

function firebaseKey_(value) {
  return String(value || '').replace(/[.#$\[\]\/]/g, '_');
}

function parseAcbEmail_(msg, settings) {
  settings = settings || readSettings_();
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

  const folded = foldText_(flat).replace(/\*/g, ' ');
  const debitTerms = splitSettingList_(settings.debitText).map(foldText_).filter(Boolean);
  if (debitTerms.some(term => folded.indexOf(term) >= 0)) {
    return { ok: false, silent: true, reason: 'Bỏ qua ' + settings.debitText, snippet: '' };
  }

  const amountResult = matchAmount_(folded, settings);
  if (amountResult.error) return { ok: false, reason: amountResult.error, snippet: flat.slice(0, 500) };
  if (!amountResult.match) return { ok: false, reason: 'Không tìm thấy ' + settings.creditText + ' + số tiền', snippet: flat.slice(0, 500) };

  const contentResult = extractConfiguredContent_(flat, settings);
  if (contentResult.error) return { ok: false, reason: contentResult.error, snippet: flat.slice(0, 500) };
  const content = cleanContent_(contentResult.content || '');
  if (!content) return { ok: false, reason: 'Không tách được nội dung giao dịch', snippet: flat.slice(0, 500) };

  const txInfo = parseTxInfo_(content, msg.getDate(), settings);
  return {
    ok: true,
    data: {
      type: settings.creditText || 'Ghi có',
      amount: parseMoneyText_(amountResult.match[1]),
      content,
      transactionCode: txInfo.transactionCode,
      dateKey: txInfo.dateKey,
      dateText: txInfo.dateText,
      time: txInfo.time,
      timestamp: txInfo.timestamp
    }
  };
}

function matchAmount_(foldedText, settings) {
  const regexText = String(settings.amountRegex || '').trim();
  if (regexText) {
    try {
      return { match: String(foldedText || '').match(new RegExp(regexText, 'i')) };
    } catch (err) {
      return { error: 'amountRegex không hợp lệ: ' + err.message };
    }
  }

  const terms = splitSettingList_(settings.creditText)
    .map(foldText_)
    .filter(Boolean)
    .map(escapeRegex_);
  const termPattern = terms.length ? terms.join('|') : 'ghi co';
  const fallbackRegex = new RegExp('(?:giao dich moi nhat\\s*:?\\s*)?(?:' + termPattern + ')\\s*[^0-9+-]*\\+?\\s*([\\d,.]+)\\s*vnd', 'i');
  return { match: String(foldedText || '').match(fallbackRegex) };
}

function extractConfiguredContent_(flatText, settings) {
  const startText = String(settings.contentStartText || '').trim();
  const endRegex = String(settings.contentEndRegex || '$').trim() || '$';
  const startPattern = startText ? escapeRegex_(startText).replace(/\s+/g, '\\s*') + '\\s*:?\\s*' : '';
  try {
    const regex = new RegExp(startPattern + '([\\s\\S]*?)(?:' + endRegex + ')', 'i');
    const match = String(flatText || '').match(regex);
    return { content: match ? match[1] : '' };
  } catch (err) {
    return { error: 'contentEndRegex không hợp lệ: ' + err.message };
  }
}

function parseTxInfo_(content, fallbackDate, settings) {
  let match = String(content || '').match(/\bACB-GD-([A-Z0-9]+)-(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) return buildTxInfo_(match[1], match[2], match[3], fallbackDate);

  match = String(content || '').match(/\bGD\s+([A-Z0-9]+)\s+(\d{6})-(\d{2}:\d{2}:\d{2})\b/i);
  if (match) return buildTxInfo_(match[1], match[2], match[3], fallbackDate);

  const configuredTime = parseConfiguredTxTime_(content, fallbackDate, settings);
  if (configuredTime) return configuredTime;

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

function parseConfiguredTxTime_(content, fallbackDate, settings) {
  const regexText = settings && String(settings.timeRegex || '').trim();
  if (!regexText) return null;
  try {
    const match = String(content || '').match(new RegExp(regexText, 'i'));
    if (match && match[1] && match[2]) return buildTxInfo_('', String(match[1]), String(match[2]), fallbackDate);
  } catch (err) {}
  return null;
}

function buildTxInfo_(transactionCode, ddmmyy, time, fallbackDate) {
  const dd = Number(ddmmyy.slice(0, 2));
  const mm = Number(ddmmyy.slice(2, 4));
  const yy = Number(ddmmyy.slice(4, 6));
  const parts = time.split(':').map(Number);
  const d = new Date(2000 + yy, mm - 1, dd, parts[0], parts[1], parts[2]);
  if (isNaN(d.getTime())) return parseTxInfo_('', fallbackDate || new Date());
  return {
    transactionCode,
    dateKey: dateKeyFromDate_(d),
    dateText: Utilities.formatDate(d, CONFIG.TZ, 'dd/MM/yyyy'),
    time,
    timestamp: d.getTime()
  };
}

function transactionToSheetRow_(tx) {
  const ts = new Date(Number(tx.timestamp || Date.now()));
  const id = tx.id || buildId_(tx.transactionCode, tx.gmailMessageId, tx.timestamp, tx.amount, tx.content);
  return [
    id,
    ts,
    tx.time || Utilities.formatDate(ts, CONFIG.TZ, 'HH:mm:ss'),
    ts,
    tx.type || 'Ghi có',
    Number(tx.amount || 0),
    tx.content || '',
    tx.transactionCode || '',
    tx.gmailMessageId || '',
    false,
    '',
    '',
    '',
    new Date(),
    ''
  ];
}

function sortDataSheet_() {
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  if (sh.getLastRow() <= 2) return;
  sh.getRange(2, 1, sh.getLastRow() - 1, DATA_HEADERS.length)
    .sort({ column: 4, ascending: false });
}

function cleanupDuplicateDataRows_() {
  const sh = getSheet_(CONFIG.SHEETS.DATA);
  const last = sh.getLastRow();
  if (last <= 2) return { removed: 0 };

  const values = sh.getRange(2, 1, last - 1, DATA_HEADERS.length).getValues();
  const groups = {};
  values.forEach((row, index) => {
    const obj = sheetRowToObject_(row, index + 2);
    const key = canonicalDataKey_(obj);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ rowNumber: index + 2, values: row, object: obj });
  });

  const rowsToDelete = [];
  Object.keys(groups).forEach(key => {
    const items = groups[key];
    if (items.length <= 1) return;
    const keeper = chooseDuplicateKeeper_(items);
    const merged = mergeDuplicateRows_(keeper, items);
    sh.getRange(keeper.rowNumber, 1, 1, DATA_HEADERS.length).setValues([merged]);
    items.forEach(item => {
      if (item.rowNumber !== keeper.rowNumber) rowsToDelete.push(item.rowNumber);
    });
  });

  rowsToDelete
    .sort((a, b) => b - a)
    .forEach(rowNumber => sh.deleteRow(rowNumber));

  if (rowsToDelete.length) sortDataSheet_();
  return { removed: rowsToDelete.length };
}

function chooseDuplicateKeeper_(items) {
  return items.slice().sort((a, b) => duplicateRowScore_(b.object) - duplicateRowScore_(a.object))[0];
}

function duplicateRowScore_(row) {
  const actionTime = row.actionAt ? row.actionAt.getTime() : 0;
  const createdTime = row.createdAt ? row.createdAt.getTime() : 0;
  return (row.checked ? 1000000000000000 : 0)
    + (row.note ? 500000000000000 : 0)
    + (row.actorName ? 200000000000000 : 0)
    + Math.max(actionTime, createdTime, Number(row.timestamp || 0));
}

function mergeDuplicateRows_(keeper, items) {
  const merged = keeper.values.slice();
  const checkedItem = items
    .filter(item => item.object.checked)
    .sort((a, b) => duplicateRowScore_(b.object) - duplicateRowScore_(a.object))[0];
  const noteItem = items
    .filter(item => item.object.note)
    .sort((a, b) => duplicateRowScore_(b.object) - duplicateRowScore_(a.object))[0];
  const actorItem = items
    .filter(item => item.object.actorName || item.object.actionAt || item.object.actorEmail)
    .sort((a, b) => duplicateRowScore_(b.object) - duplicateRowScore_(a.object))[0];
  const createdItems = items
    .filter(item => item.object.createdAt)
    .sort((a, b) => a.object.createdAt.getTime() - b.object.createdAt.getTime());

  merged[9] = !!checkedItem;
  if (noteItem) merged[10] = noteItem.values[10] || '';
  if (actorItem) {
    merged[11] = actorItem.values[11] || '';
    merged[12] = actorItem.values[12] || '';
    merged[14] = actorItem.values[14] || '';
  }
  if (createdItems.length) merged[13] = createdItems[0].values[13] || merged[13];
  return merged;
}

function writeHistory_(actor, tx, actionText, detail, before, after) {
  const createdAt = new Date();
  getSheet_(CONFIG.SHEETS.HISTORY).appendRow([
    createdAt,
    monthKeyFromDate_(createdAt),
    actor.name || '',
    actor.email || '',
    actionText,
    detail || '',
    tx.id || '',
    JSON.stringify(historySnapshot_(before)),
    JSON.stringify(historySnapshot_(after))
  ]);
}

function writeSimpleHistory_(actor, actionText, detail) {
  const createdAt = new Date();
  getSheet_(CONFIG.SHEETS.HISTORY).appendRow([
    createdAt,
    monthKeyFromDate_(createdAt),
    actor.name || '',
    actor.email || '',
    actionText,
    detail || '',
    '',
    '',
    ''
  ]);
}

function historySnapshot_(row) {
  return {
    checked: !!(row && row.checked),
    note: row && row.note || '',
    actorName: row && row.actorName || '',
    actionAt: row && row.actionAt ? row.actionAt.getTime() : ''
  };
}

function writeSyncLog_(type, added, duplicated, skipped, note) {
  if (foldText_(type) === 'realtime loi') return;
  getSheet_(CONFIG.SHEETS.LOG).appendRow([new Date(), type, added, duplicated, skipped, note || '']);
}

function updateSetting_(key, value, actorEmail) {
  const sh = getSheet_(CONFIG.SHEETS.SETTINGS);
  const last = sh.getLastRow();
  let row = 0;
  if (last > 1) {
    const found = sh.getRange(2, 1, last - 1, 1)
      .createTextFinder(key)
      .matchEntireCell(true)
      .findNext();
    row = found ? found.getRow() : 0;
  }
  const defaultSetting = DEFAULT_SETTINGS.find(item => item.key === key);
  const currentNote = row && sh.getLastColumn() >= 5 ? String(sh.getRange(row, 5).getValue() || '') : '';
  const data = [key, value, new Date(), actorEmail || '', currentNote || (defaultSetting && defaultSetting.note) || ''];
  if (row) sh.getRange(row, 1, 1, SETTINGS_HEADERS.length).setValues([data]);
  else sh.appendRow(data);
  CacheService.getScriptCache().remove('ttck_settings_v2');
}

function ensureDefaultSettings_() {
  const sh = getSheet_(CONFIG.SHEETS.SETTINGS);
  const last = sh.getLastRow();
  const existing = {};
  let migrated = false;
  if (last > 1) {
    const defaultMap = {};
    DEFAULT_SETTINGS.forEach(item => defaultMap[item.key] = item);
    sh.getRange(2, 1, last - 1, SETTINGS_HEADERS.length)
      .getValues()
      .forEach((row, index) => {
        const key = String(row[0] || '');
        existing[key] = true;
        if (key === 'dailySyncTimes' && normalizeSyncTimesText_(row[1]) === OLD_DEFAULT_DAILY_SYNC_TIMES) {
          sh.getRange(index + 2, 2, 1, 3).setValues([[CONFIG.DEFAULT_DAILY_SYNC_TIMES, new Date(), 'system']]);
          migrated = true;
        }
        if (defaultMap[key] && !String(row[4] || '').trim()) {
          sh.getRange(index + 2, 5).setValue(defaultMap[key].note);
        }
      });
  }

  const now = new Date();
  const rows = DEFAULT_SETTINGS
    .filter(item => !existing[item.key])
    .map(item => [item.key, item.value, now, 'system', item.note]);

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);
    CacheService.getScriptCache().remove('ttck_settings_v2');
  } else if (migrated) {
    CacheService.getScriptCache().remove('ttck_settings_v2');
  }
}

function readSettings_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('ttck_settings_v2');
  if (cached) return JSON.parse(cached);
  const sh = getSheet_(CONFIG.SHEETS.SETTINGS);
  const values = sh.getLastRow() <= 1
    ? []
    : sh.getRange(2, 1, sh.getLastRow() - 1, SETTINGS_HEADERS.length).getValues();
  const map = {};
  DEFAULT_SETTINGS.forEach(item => map[item.key] = String(item.value || ''));
  const seen = {};
  values.forEach(row => {
    const key = String(row[0] || '');
    if (key && !seen[key]) {
      map[key] = String(row[1] || '');
      seen[key] = true;
    }
  });
  const settings = {
    appsScriptUrl: String(map.appsScriptUrl || '').trim(),
    autoSyncMinutes: Number(map.autoSyncMinutes || 0),
    dailyAutoEnabled: map.dailyAutoEnabled === '1',
    dailyAutoTime: normalizeTime_(map.dailyAutoTime || '08:00'),
    dailySyncTimes: String(map.dailySyncTimes || CONFIG.DEFAULT_DAILY_SYNC_TIMES).trim(),
    realtimeDatabaseUrl: String(map.realtimeDatabaseUrl || CONFIG.RTDB_URL).trim() || CONFIG.RTDB_URL,
    realtimeMirrorEnabled: map.realtimeMirrorEnabled !== '0',
    serverRealtimeMirrorEnabled: false,
    serviceAccountEmail: String(map.serviceAccountEmail || '').trim(),
    serviceAccountPrivateKey: String(map.serviceAccountPrivateKey || '').trim(),
    sourceEmail: String(map.sourceEmail || CONFIG.ACB_FROM).trim() || CONFIG.ACB_FROM,
    gmailExtraQuery: String(map.gmailExtraQuery || '').trim(),
    creditText: String(map.creditText || 'Ghi có').trim() || 'Ghi có',
    debitText: String(map.debitText || 'Ghi nợ').trim() || 'Ghi nợ',
    amountRegex: String(map.amountRegex || '').trim(),
    contentStartText: String(map.contentStartText || 'Nội dung giao dịch').trim(),
    contentEndRegex: String(map.contentEndRegex || '$').trim() || '$',
    timeRegex: String(map.timeRegex || '').trim()
  };
  cache.put('ttck_settings_v2', JSON.stringify(settings), 60);
  return settings;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function clearBody_(sheet, width) {
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, width).clearContent();
}

function getSheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function matchContent_(content, query, mode) {
  if (!query) return true;
  const source = foldText_(content);
  const needle = foldText_(query);
  if (!needle) return true;
  if (mode === 'exact') return source.indexOf(needle) >= 0;
  return needle.split(/\s+/).filter(Boolean).every(token => source.indexOf(token) >= 0);
}

function splitSettingList_(value) {
  return String(value || '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

function escapeRegex_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStatsRange_(payload) {
  const now = new Date();
  const from = payload && payload.from ? parseInputDate_(payload.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = payload && payload.to ? parseInputDate_(payload.to) : now;
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function startDateForDays_(days) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (days > 1) start.setDate(start.getDate() - days + 1);
  return start;
}

function currentMonthSyncDays_() {
  const now = new Date();
  return Math.max(1, now.getDate());
}

function canonicalDataKey_(row) {
  if (!row) return '';
  const transactionCode = String(row.transactionCode || '').trim();
  if (transactionCode) return 'code:' + safeKey_(transactionCode);
  const timestamp = Number(row.timestamp || 0);
  const amount = Number(row.amount || 0);
  const content = normalizeDuplicateContent_(row.content || '');
  if (!timestamp || !amount || !content) {
    const id = String(row.id || '').trim();
    return id ? 'id:' + safeKey_(id) : '';
  }
  return 'tx:' + safeKey_([timestamp, amount, content].join('|'));
}

function normalizeDuplicateContent_(content) {
  return foldText_(String(content || ''))
    .replace(/\*/g, ' ')
    .replace(/\b(gd|ma gd|ct tu|toi|tai acb|nhtmcp a chau acb)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function buildId_(transactionCode, messageId, timestamp, amount, content) {
  if (transactionCode) return safeKey_(transactionCode);
  const duplicateKey = canonicalDataKey_({ transactionCode, timestamp, amount, content });
  const raw = duplicateKey || [messageId || '', timestamp || '', amount || ''].join('|');
  return safeKey_(raw || Utilities.getUuid());
}

function safeKey_(value) {
  const folded = foldText_(String(value || '').trim());
  const clean = folded.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 140);
  return clean || ('id_' + Utilities.getUuid().replace(/-/g, ''));
}

function safeEmployeeId_(value) {
  if (!String(value || '').trim()) return '';
  return safeKey_(value).slice(0, 60);
}

function dateKeyFromInput_(value) {
  return String(value || '').replace(/[^\d]/g, '').slice(0, 8);
}

function dateKeyFromText_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return dateKeyFromInput_(value);
  return String(match[3]) + String(match[2]).padStart(2, '0') + String(match[1]).padStart(2, '0');
}

function parseInputDate_(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function normalizeTime_(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '08:00';
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function dateKeyFromDate_(date) {
  return Utilities.formatDate(coerceDate_(date) || new Date(), CONFIG.TZ, 'yyyyMMdd');
}

function monthKeyFromDate_(date) {
  return Utilities.formatDate(coerceDate_(date) || new Date(), CONFIG.TZ, 'yyyyMM');
}

function currentMonthKey_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMM');
}

function formatDate_(date) {
  const d = coerceDate_(date);
  return d ? Utilities.formatDate(d, CONFIG.TZ, 'dd/MM/yyyy') : '';
}

function formatDateTime_(date) {
  const d = coerceDate_(date);
  return d ? Utilities.formatDate(d, CONFIG.TZ, 'dd/MM/yyyy HH:mm:ss') : '';
}

function coerceDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function parseMoneyText_(value) {
  let text = String(value || '').trim();
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot > lastComma) text = text.replace(/,/g, '').replace(/\.\d+$/, '');
  else text = text.replace(/\./g, '').replace(/,\d+$/, '');
  return Number(text.replace(/[^\d]/g, '') || 0);
}

function cleanContent_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^\*+|\*+$/g, '')
    .replace(/[.。]+$/g, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
}

function foldText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtml_(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseJson_(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (err) {
    return {};
  }
}
