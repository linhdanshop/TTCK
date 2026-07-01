# TTCK - GitHub + Firebase Spark + Apps Script

Hướng này không dùng Cloud Functions, nên không cần nâng Firebase Blaze.

## Kiến trúc

```text
GitHub Pages Web
  -> Firebase Auth Google để đăng nhập
  -> Apps Script Web App qua JSONP
  -> Apps Script kiểm token Firebase, đọc Gmail ACB, ghi Firebase RTDB và Google Sheet
```

Realtime Database khóa đọc/ghi trực tiếp từ web. Apps Script dùng service account để ghi RTDB qua REST API.

## Tài khoản

Admin:

- `kythuatlado@gmail.com`
- `tranvanan180393@gmail.com`

Nhân viên đăng nhập:

- `shoplinhdan2026@gmail.com`

Gmail nhận mail ACB:

- `nguyenthingocnhung0703@gmail.com`

## Web không có DS Tổng

`DS TỔNG` đã bị loại khỏi web để giảm rủi ro lộ dữ liệu. Danh sách tổng nằm trong Google Sheet tab `DATA_CK`, chỉ người có quyền Sheet/Apps Script mới xem.

## Bước 1 - Firebase Auth

1. Vào Firebase Console.
2. Chọn project `ttck-a7176`.
3. Vào `Authentication`.
4. Bật provider `Google`.
5. Vào `Settings` -> `Authorized domains`.
6. Thêm:
   - `linhdanshop.github.io`
   - `localhost`

## Bước 2 - Realtime Database Rules

Deploy rules:

```powershell
firebase deploy --only database
```

Rules đang khóa client:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

Web không đọc RTDB trực tiếp. Apps Script đọc/ghi bằng service account.

## Bước 3 - Tạo Service Account Key

1. Firebase Console -> Project settings.
2. Tab `Service accounts`.
3. Bấm `Generate new private key`.
4. Tải file JSON về máy.
5. Không upload file JSON này lên GitHub.

Trong file JSON, cần 2 trường:

```json
{
  "client_email": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

## Bước 4 - Tạo Google Sheet + Apps Script

1. Đăng nhập bằng Gmail nhận ACB:
   `nguyenthingocnhung0703@gmail.com`
2. Tạo một Google Sheet mới.
3. Vào `Extensions` -> `Apps Script`.
4. Copy nội dung `apps-script/Code.gs` vào file `Code.gs`.
5. Copy nội dung `apps-script/appsscript.json` vào file manifest `appsscript.json`.

Nếu chưa thấy `appsscript.json`:

1. Trong Apps Script, bấm bánh răng `Project Settings`.
2. Bật `Show appsscript.json manifest file in editor`.

## Bước 5 - Lưu Script Properties

Trong Apps Script:

1. Bấm bánh răng `Project Settings`.
2. Kéo xuống `Script properties`.
3. Thêm:

```text
SERVICE_ACCOUNT_EMAIL = client_email trong file JSON
SERVICE_ACCOUNT_PRIVATE_KEY = private_key trong file JSON
```

Giữ nguyên dấu `\n` trong private key nếu copy một dòng. Code đã tự đổi `\n` thành xuống dòng thật.

## Bước 6 - Deploy Apps Script Web App

1. Apps Script -> `Deploy`.
2. `New deployment`.
3. Chọn loại `Web app`.
4. Description: `TTCK API`.
5. Execute as: `Me`.
6. Who has access: `Anyone`.
7. Deploy.
8. Copy URL dạng:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

Lần đầu chạy sẽ hỏi cấp quyền:

- đọc Gmail
- đọc/ghi Spreadsheet
- gọi URL Fetch
- tạo trigger

Phải cấp quyền bằng Gmail `nguyenthingocnhung0703@gmail.com`.

## Bước 7 - Dán Apps Script URL vào web

Mở `app.js`, đổi dòng:

```js
const APPS_SCRIPT_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

thành URL web app thật.

Sau đó commit/push lại GitHub.

## Bước 8 - GitHub Pages

1. Vào repo `linhdanshop/TTCK`.
2. `Settings` -> `Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/root`.
6. Save.

URL dự kiến:

```text
https://linhdanshop.github.io/TTCK/
```

## Chức năng web

- Đăng nhập Gmail, nhớ phiên 1 tháng.
- `Thoát Gmail` mới đăng xuất.
- Nhân viên đăng nhập xong chọn tên thao tác.
- `Chọn nhân viên` đổi tên thao tác, không cần thoát Gmail.
- Admin set quyền nhân viên.
- Bộ lọc chính xác/tương đối, số tiền, ngày, thời gian.
- Nhân viên chỉ nhập số tiền từ `0` đến `2.000.000`.
- Nội dung CK dài hiển thị 2 dòng, bấm để xem popup đầy đủ.
- Tab `THỐNG KÊ` hiển thị theo tháng mặc định, có lọc từ ngày đến ngày.
- Admin có `CÀI AUTO`: mỗi 1 phút, mỗi 5 phút, hoặc tắt.
- Admin có nút cập nhật hôm nay và 10 ngày trước.

## Auto Sync

Apps Script cài trigger `autoSyncToday`.

- `1 phút`: chạy cập nhật hôm nay mỗi phút.
- `5 phút`: chạy cập nhật hôm nay mỗi 5 phút.
- `Tắt`: xóa trigger.

Nếu Gmail đã có giao dịch rồi thì bỏ qua, không ghi đè tick/ghi chú/lịch sử.

## Dữ liệu trong Sheet

Apps Script tự tạo các tab:

- `DATA_CK`: DS tổng giao dịch đã sync.
- `LOG_SYNC`: lịch sử sync.
- `CAI_DAT`: trạng thái auto sync.
- `DEBUG_ACB`: mail không parse được.

## Bảo mật

- Repo public không chứa service account key.
- RTDB rules khóa đọc/ghi trực tiếp.
- Web chỉ gọi Apps Script.
- Apps Script xác thực Firebase ID token trước khi xử lý.
- Apps Script kiểm tra email admin/nhân viên ở server.
- DS tổng không nằm trên web.

Lưu ý: Apps Script Web App không phải API CORS chuẩn, nên web gọi bằng JSONP. Vì vậy dữ liệu nhạy cảm nhất không đưa vào URL; thao tác ghi chú bị giới hạn 500 ký tự.

## Kiểm tra nhanh

Sau khi deploy Apps Script và dán URL vào `app.js`:

1. Mở web GitHub Pages.
2. Đăng nhập admin.
3. Bấm `Cập nhật mới hôm nay`.
4. Vào Google Sheet kiểm tra tab `DATA_CK`.
5. Lọc số tiền/ngày/nội dung trên web.
6. Thử tick/ghi chú.
7. Mở tab `THỐNG KÊ`.
