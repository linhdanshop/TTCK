# TTCK - GitHub + Apps Script + Sheet

Bản này không dùng Firebase Functions, không dùng Service Account, không cần nâng Firebase Blaze.

## Kiến trúc

```text
GitHub Pages Web
  -> Firebase Auth Google từ config web hiện có
  -> Apps Script Web App qua JSONP
  -> Apps Script kiểm token đăng nhập
  -> Apps Script đọc Gmail ACB và lưu dữ liệu vào Google Sheet
```

Realtime Database không được dùng để chứa dữ liệu nhạy cảm trong bản này, vì nếu chưa kiểm soát rules thì đưa DS tổng lên RTDB sẽ không an toàn. Firebase config hiện chỉ dùng cho đăng nhập Gmail.

## Tài khoản

Admin:

- `kythuatlado@gmail.com`
- `tranvanan180393@gmail.com`

Nhân viên đăng nhập:

- `shoplinhdan2026@gmail.com`

Gmail nhận mail chuyển khoản:

- `nguyenthingocnhung0703@gmail.com`

## Web không có DS Tổng

`DS TỔNG` đã bị loại khỏi web. Danh sách tổng chỉ nằm trong Google Sheet tab `DATA_CK`, do Gmail gốc/Apps Script quản lý.

## Cài Apps Script

1. Đăng nhập Gmail nhận mail ACB: `nguyenthingocnhung0703@gmail.com`.
2. Tạo một Google Sheet mới.
3. Vào `Extensions` -> `Apps Script`.
4. Copy `apps-script/Code.gs` vào file `Code.gs`.
5. Bật manifest nếu chưa thấy:
   - Apps Script -> bánh răng `Project Settings`
   - bật `Show appsscript.json manifest file in editor`
6. Copy `apps-script/appsscript.json` vào file `appsscript.json`.
7. Bấm Save.

Không cần thêm Script Properties.

## Deploy Apps Script Web App

1. Apps Script -> `Deploy`.
2. `New deployment`.
3. Chọn loại `Web app`.
4. Execute as: `Me`.
5. Who has access: `Anyone`.
6. Deploy.
7. Cấp quyền khi Google hỏi:
   - đọc Gmail
   - đọc/ghi Spreadsheet
   - gọi URL ngoài để kiểm token Firebase
   - tạo trigger auto sync
8. Copy URL dạng:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## Dán URL vào web

Mở `app.js`, đổi dòng:

```js
const APPS_SCRIPT_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

thành URL `/exec` của Apps Script rồi commit/push lên GitHub.

## Sheet Apps Script tự tạo

- `DATA_CK`: danh sách tổng giao dịch đã sync.
- `NHAN_VIEN`: tên và quyền nhân viên.
- `PHIEN_NGUOI_DUNG`: tên thao tác đang chọn theo Gmail đăng nhập.
- `LICH_SU`: lịch sử tick/ghi chú.
- `LOG_SYNC`: lịch sử cập nhật Gmail.
- `CAI_DAT`: trạng thái auto sync.
- `DEBUG_ACB`: mail ACB không tách được dữ liệu.

## Chức năng

- Đăng nhập Gmail, nhớ phiên 1 tháng trên máy.
- `Thoát Gmail` mới đăng xuất.
- Nhân viên đăng nhập xong tự bật chọn tên thao tác.
- Có nút `Chọn nhân viên` để đổi tên thao tác.
- Admin set quyền nhân viên: `Được thao tác` / `Chỉ xem`.
- Bộ lọc chính xác/tương đối, số tiền, ngày, thời gian.
- Nhân viên chỉ lọc số tiền từ `0` đến `2.000.000`.
- Nội dung CK dài xuống 2 dòng, bấm để xem đầy đủ.
- `THỐNG KÊ` mặc định theo tháng, có lọc từ ngày đến ngày.
- Admin có `Lịch sử tổng`, xóa lịch sử theo tháng.
- Admin có `CÀI AUTO`: tắt / mỗi 1 phút / mỗi 5 phút.
- `Cập nhật mới hôm nay` và `Cập nhật 10 ngày trước` chỉ thêm giao dịch mới, gặp trùng thì bỏ qua.

## Kiểm tra

1. Deploy Apps Script và dán URL vào `app.js`.
2. Mở GitHub Pages.
3. Đăng nhập admin.
4. Bấm `Cập nhật mới hôm nay`.
5. Kiểm tra tab `DATA_CK` trong Sheet.
6. Lọc thử theo tên/số tiền/ngày.
7. Tick và ghi chú thử một dòng.
8. Xem `THỐNG KÊ` và `Lịch sử tổng`.
