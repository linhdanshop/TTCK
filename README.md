# TTCK - Tra cứu chuyển khoản ACB

Web tra cứu nội dung chuyển khoản từ Gmail ACB, dùng:

- GitHub Pages để host giao diện.
- Firebase Auth để đăng nhập Gmail.
- Firebase Cloud Functions để kiểm quyền, lọc dữ liệu, tick, ghi chú, thống kê, lịch sử.
- Firebase Realtime Database để lưu giao dịch và thao tác.

Repo public không chứa secret. Gmail token, OAuth secret và service account không được commit.

## Tài khoản mặc định

Admin:

- `kythuatlado@gmail.com`
- `tranvanan180393@gmail.com`

Nhân viên đăng nhập:

- `shoplinhdan2026@gmail.com`

Gmail nhận nội dung CK:

- `nguyenthingocnhung0703@gmail.com`

## Vì sao phải có Cloud Functions

GitHub Pages là web tĩnh. Code JS trên trình duyệt ai cũng xem được, nên không được để quyền đọc Gmail hoặc quyền đọc toàn bộ database trong frontend.

Thiết kế hiện tại khóa Realtime Database với client:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

Frontend chỉ gọi Cloud Functions. Functions kiểm tra email, role, quyền nhân viên rồi mới đọc/ghi dữ liệu.

## Cấu trúc dữ liệu chính

- `transactions/{txId}`: giao dịch sync từ Gmail.
- `transactionActions/{txId}`: trạng thái đã chọn, ghi chú, người thao tác.
- `history/{YYYYMM}/{id}`: lịch sử thao tác theo tháng.
- `employees/{employeeId}`: tên nhân viên và quyền.
- `profiles/{uid}`: email đăng nhập và tên nhân viên đang chọn.
- `syncLogs/{YYYYMM}/{id}`: log cập nhật Gmail.

## Bước 1 - Bật Firebase Auth Google

1. Vào Firebase Console.
2. Chọn project `ttck-a7176`.
3. Vào `Authentication`.
4. Tab `Sign-in method`.
5. Bật `Google`.
6. Vào tab `Settings` hoặc `Authorized domains`.
7. Thêm domain:
   - `linhdanshop.github.io`
   - `localhost`

## Bước 2 - Bật Cloud Functions

Cloud Functions thường cần project Firebase ở gói Blaze.

Nếu project chưa bật Blaze:

1. Vào Firebase Console.
2. Chọn project `ttck-a7176`.
3. Bấm `Upgrade`.
4. Chọn Blaze.
5. Gắn billing account.

Không bật Cloud Functions thì vẫn làm được web tĩnh, nhưng không đạt mức bảo mật tốt vì frontend không có nơi giấu quyền đọc dữ liệu.

## Bước 3 - Cài Firebase CLI trên máy

Mở PowerShell:

```powershell
npm install -g firebase-tools
firebase login
firebase use ttck-a7176
```

Cài dependency cho Functions:

```powershell
cd functions
npm install
cd ..
```

## Bước 4 - Tạo Gmail OAuth để đọc mail ACB

1. Vào Google Cloud Console.
2. Chọn đúng project `ttck-a7176`.
3. Vào `APIs & Services` -> `Library`.
4. Bật `Gmail API`.
5. Vào `OAuth consent screen`.
6. Điền app name nội bộ, email support.
7. Thêm scope:
   - `https://www.googleapis.com/auth/gmail.readonly`
8. Nếu đang để `Testing`, refresh token có thể bị hết hạn sau vài ngày. Nên chuyển app sang `In production` nếu Google Console cho phép.
9. Vào `Credentials`.
10. Tạo `OAuth client ID`.
11. Chọn loại `Web application`.
12. Thêm Authorized redirect URI:
    - `http://localhost:3000/oauth2callback`
13. Copy `Client ID` và `Client secret`.

Chạy tool lấy refresh token:

```powershell
$env:GMAIL_CLIENT_ID='DAN_CLIENT_ID'
$env:GMAIL_CLIENT_SECRET='DAN_CLIENT_SECRET'
node tools/gmail-oauth.js
```

Tool sẽ in link. Mở link, đăng nhập bằng Gmail:

```text
nguyenthingocnhung0703@gmail.com
```

Sau khi đồng ý, terminal sẽ in `GMAIL_REFRESH_TOKEN`.

## Bước 5 - Lưu secret vào Firebase

Chạy từng lệnh, paste giá trị khi CLI hỏi:

```powershell
firebase functions:secrets:set GMAIL_CLIENT_ID
firebase functions:secrets:set GMAIL_CLIENT_SECRET
firebase functions:secrets:set GMAIL_REFRESH_TOKEN
```

Không đưa các giá trị này lên GitHub.

## Bước 6 - Deploy rules và Functions

```powershell
firebase deploy --only database,functions
```

Sau khi deploy xong, web GitHub Pages sẽ gọi được Functions ở region `asia-southeast1`.

## Bước 7 - Bật GitHub Pages

1. Vào repo `linhdanshop/TTCK`.
2. Vào `Settings`.
3. Vào `Pages`.
4. Source chọn `Deploy from a branch`.
5. Branch chọn `main`.
6. Folder chọn `/root`.
7. Save.

URL dự kiến:

```text
https://linhdanshop.github.io/TTCK/
```

## Quyền thao tác

- Admin xem được `DS TỔNG`, set quyền nhân viên, bỏ tích, xóa lịch sử tháng.
- Nhân viên chỉ thấy chức năng theo quyền.
- `Được thao tác`: tick và ghi chú.
- `Chỉ xem`: chỉ xem, không tick, không ghi chú.
- Nhân viên có thể bấm `Chọn nhân viên` để đổi tên thao tác mà không cần thoát Gmail.
- `Thoát Gmail` mới đăng xuất Gmail.

## Sync Gmail

Trong web:

- `Cập nhật mới hôm nay`: lấy các email ACB của hôm nay.
- `Cập nhật 10 ngày trước`: lấy lại 10 ngày gần nhất.

Nếu giao dịch đã tồn tại theo mã giao dịch hoặc Gmail message id thì bỏ qua, không ghi đè tick, ghi chú hoặc lịch sử.

## Mẫu parser ACB đang hỗ trợ

Parser nhận dạng các mẫu như:

```text
Giao dịch mới nhất:Ghi có +100,000.00 VND.
Nội dung giao dịch: MBVCB.14910026604.555495.NGUYEN THI NHU THUY CHUYEN TIEN COC...ACB-GD-DASE555495-300626-21:04:39.
```

```text
Giao dịch mới nhất:Ghi có +100,000.00 VND.
Nội dung giao dịch: IBFT NGUYEN THI NGOC PHUONG CHUYEN TIEN GD 6181SGTTH2MAPRUW 300626-21:14:53.
```

```text
Giao dịch mới nhất:Ghi có +100,000.00 VND.
Nội dung giao dịch: MBVCB.14913008728.644328.LAN NGOC COC TIEN DON DON...ACB-GD-DABO644328-010726-07:38:23.
```

## Kiểm tra nhanh

```powershell
cd functions
npm run check
```

Nếu cần test local:

```powershell
firebase emulators:start --only functions,database
```

Khi test local, frontend đang trỏ Functions production. Nếu muốn dùng emulator thì cần thêm `connectFunctionsEmulator` trong `app.js`.
