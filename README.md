# blk46 idol lineup

Web công khai cho khách xem lineup idol, đặt bàn kèm idol, và tablet của quán để khách chấm sao, nhắn idol, tip vào bill.

- `public/index.html`: toàn bộ giao diện (lineup kiểu màn chọn nhân vật, đặt bàn, tablet đánh giá, trang quản lý).
- `public/backend.js`: nối giao diện với Firebase (Firestore, Auth, Storage).
- `public/firebase-config.js`: thông tin project Firebase (không phải mật khẩu).
- `firestore.rules`, `storage.rules`: luật bảo mật. Đây là thứ thật sự giữ số điện thoại khách, lời nhắn và tip khỏi người ngoài.
- `.github/workflows/deploy.yml`: merge vào `main` là web tự cập nhật.

## Hai chế độ chạy

| | Chạy thử (thêm `?demo=1`) | Firebase (đang dùng) |
|---|---|---|
| Chi phí | 0đ, không cần tài khoản | gói Spark miễn phí, không cần thẻ |
| Ở đâu | https://blk46club.github.io/promoter/?demo=1 | https://blk46club.github.io/promoter/ (project Firebase `blk46-promoter`, gói Spark) |
| Dữ liệu | lưu trong trình duyệt đang mở, mỗi máy một bản | dùng chung: khách, tablet, quản lý cùng thấy |
| Đăng nhập quản lý | email, mật khẩu bất kỳ | tài khoản tạo trong Firebase |
| Ảnh idol | nén và lưu trong trình duyệt | nén và lưu trong Firestore (không cần Storage, không cần Blaze) |

Web tự chọn chế độ: `public/firebase-config.js` còn `REPLACE_ME` thì là chạy thử. Dán config Firebase thật vào là chuyển sang dữ liệu dùng chung. Thêm `?demo=1` vào link để quay lại chạy thử bất cứ lúc nào.

Chạy thử hợp để chỉnh giao diện, đồ hoạ, tính năng. Không dùng cho đêm thật, vì điện thoại khách và tablet quầy không thấy dữ liệu của nhau.

## Ai thấy gì

| Dữ liệu | Khách | Quản lý |
|---|---|---|
| Lineup, ảnh, sao, chỉ số | thấy | thấy |
| Chiều cao, cân nặng, số đo | chỉ trường idol bật hiển thị | thấy hết |
| Giấy đồng ý, trường đang ẩn | không | thấy |
| Đặt bàn, số điện thoại | chỉ gửi yêu cầu mới, không đọc được | thấy, sửa |
| Lời nhắn, tag góp ý, tip | không | thấy |
| Chấm sao | không tự gửi được, chỉ qua tablet đã đăng nhập | gửi từ tablet |

## Cài lần đầu

### 1. Firebase console (chủ quán làm)

1. https://console.firebase.google.com → Create project.
2. Build → **Firestore Database** → Create database, vùng `asia-southeast1`.
3. Build → **Authentication** → Get started → bật **Email/Password**.
   Vào tab Settings → User actions → **bỏ tick "Enable create (sign-up)"**, để người ngoài không tự tạo tài khoản.
4. Không cần nâng Blaze. Ảnh được nén và lưu trong Firestore. Khi nào muốn dùng Storage (ảnh nặng hơn, nhiều idol hơn) thì nâng Blaze, bật Storage và thêm `useStorage: true` vào `public/firebase-config.js`.
5. Authentication → Users → Add user: tạo tài khoản cho từng quản lý (email + mật khẩu).
6. Firestore → Start collection `config` → document id `staff` → trường `emails` kiểu **array**, mỗi phần tử là email quản lý, **viết thường**.
7. Project settings → Your apps → Web app → copy khối `firebaseConfig` vào `public/firebase-config.js`, và project id vào `.firebaserc`.

### 2. Tự deploy từ GitHub

1. Google Cloud console → IAM & Admin → Service accounts → chọn `firebase-adminsdk-…` → Keys → Add key → JSON. File này là **mật khẩu**, không gửi qua chat.
2. Repo GitHub → Settings → Secrets and variables → Actions → New repository secret:
   - `FIREBASE_SERVICE_ACCOUNT`: dán toàn bộ nội dung file JSON.
   - `FIREBASE_PROJECT_ID`: project id.
3. Actions → "Đẩy luật bảo mật Firestore lên Firebase (bấm tay)" → Run workflow. Không có khoá thì dán tay `firestore.rules` vào Firestore → Rules → Publish cũng được (cách đang dùng).

Nếu lần đầu tải ảnh idol báo lỗi quyền: vào Storage → Rules, bấm cấp quyền cho Storage đọc Firestore khi console hỏi (luật ảnh kiểm tra danh sách quản lý trong Firestore).

## Quy trình ở quán

1. Quán gửi link cho khách. Khách xem lineup, bấm "đặt [idol]", gửi tên, số điện thoại, giờ đến.
2. Quản lý → tab **đặt bàn**: xác nhận yêu cầu, hoặc tự tạo đặt bàn khi khách nhắn Zalo.
3. Khách đến, gọi đồ: gõ số bàn, bấm **khách đã đến · tạo mã bàn**.
4. Tính tiền: bấm **mở màn đánh giá** trên tablet. Khách chấm sao, nhắn, tip cho từng idol của bàn.
5. Thu ngân xem tổng tip ở tab **đặt bàn** hoặc **đánh giá & tip**, viết tay vào bill, bấm **đã cộng vào bill**.

## Chạy thử trên máy

```bash
npm i -g firebase-tools
firebase emulators:start --only firestore,auth,hosting --project demo-blk
# mở http://localhost:5000/?emu=1
```
