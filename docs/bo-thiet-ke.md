# Bộ thiết kế web BLK46

Bộ này gom màu, chữ và nút đang chạy trên https://blk46club.github.io/promoter/ về một chỗ. Mục đích là để lần sau sửa giao diện không phải tự canh mã màu hay cỡ chữ cho khớp.

Bộ này chỉ dành cho web. Poster, in ấn và Canva vẫn theo `BRAND GUIDELINE V1.0`.

## Ba thứ trong repo

| File | Làm gì |
|---|---|
| `public/index.html`, khối `:root` đầu thẻ `<style>` | Nơi duy nhất khai báo màu, cỡ chữ và bóng. Mọi chỗ khác gọi `var(--…)`. |
| `tools/bo-thiet-ke.html` | Trang mẫu, hiện mọi màu (kèm tỉ lệ tương phản), thang chữ và các loại nút trên nền đen lẫn nền giấy. Trang tự đọc CSS thật nên luôn khớp với web. Trang này không đăng lên web. |
| `tools/kiem-token.cjs` | Máy kiểm. Báo lỗi khi CSS hoặc JS gõ thẳng mã màu, khi gọi biến chưa khai báo, hoặc khi số chỗ gõ cỡ chữ ngoài thang tăng lên. Chạy tự động trên mọi PR. |

Cách xem trang mẫu: ở thư mục gốc repo chạy `python3 -m http.server 8000`, rồi mở http://localhost:8000/tools/bo-thiet-ke.html.

Cách tự kiểm: chạy `node tools/kiem-token.cjs`. Lệnh này không cần cài gì thêm.

## Màu

| Token | Mã | Dùng cho |
|---|---|---|
| `--ink` | #000000 | Nền tối, chữ trên giấy, viền vé (Stark Black) |
| `--paper` | #F0ECE1 | Chữ trên nền tối, nền giấy (Distressed Paper) |
| `--acid` | #EDD029 | Hành động chính, điểm nhấn (Acid Street Yellow) |
| `--bad` | #E20810 | Viền lỗi (Vibrant Red) |
| `--concrete` | #8a8880 | Chữ phụ trên nền tối |
| `--idol-pink` | #FF5FA2 | Riêng chữ "promoter" cạnh logo |
| `--white` | #fff | Chỉ dùng ở 3 chỗ hiện có, không dùng thêm |
| `--card`, `--card-2` | #0e0e0c, #171713 | Thẻ trên nền tối |
| `--frame`, `--frame-mark` | #1c1c19, #2e2d29 | Khung ảnh trống trên nền tối |
| `--line` | rgba(240,236,225,.14) | Đường kẻ trên nền tối |
| `--paper-2`, `--paper-3` | #d8d4c9, #b9b5aa | Chữ phụ sáng và nhãn nhỏ trên nền tối |
| `--sheet`, `--sheet-2` | #F7F4EC, #FBF9F3 | Vé và thẻ đêm, mẩu đánh giá trên nền giấy |
| `--sheet-ph`, `--sheet-ph-mark` | #d9d4c7, #c3bdae | Khung ảnh trống trên giấy |
| `--muted-p` | #4a4842 | Chữ phụ trên giấy |
| `--hint-p` | #6e6a61 | Chữ gợi ý trong ô nhập |
| `--bad-text`, `--bad-p` | #ff6a6f, #b3000b | Chữ lỗi trên nền tối và trên giấy |
| `--good` | #7fd18b | Trạng thái ổn |
| `--tbl`, `--tbl-taken`, `--tbl-taken-edge` | #8a4a3a, #1c0f0c, #6b4a40 | Sơ đồ bàn |

Hai chỗ web đang lệch guideline:

- `--concrete` là #8a8880, còn guideline ghi #888888. Hai mã gần như không phân biệt được bằng mắt, nên em giữ nguyên.
- Guideline dùng BT Brik và Helvetica Now. Web dùng Anton và Be Vietnam Pro, còn BT Brik chỉ đứng dự phòng. Em chưa kiểm BT Brik có đủ dấu tiếng Việt hay không.

## Chữ

- `--display` (Anton) luôn in hoa, dùng cho tiêu đề và nút lớn.
- `--body` (Be Vietnam Pro) dùng cho chữ thường.

| Token | Cỡ | Dùng cho |
|---|---|---|
| `--fs-2xs` | 11px | Nhãn, tag |
| `--fs-xs` | 12px | Ghi chú, eyebrow |
| `--fs-sm` | 13px | Nút nhỏ, chip, menu |
| `--fs-ui` | 14px | Chữ phụ trong form |
| `--fs-body` | 15px | Chữ thường |
| `--fs-lead` | 16px | |
| `--fs-md` | 18px | Nút chữ display, câu chân trang |
| `--fs-lg` | 20px | |
| `--fs-xl` | 24px | |
| `--fs-2xl` | 28px | |

Cỡ chữ display (Anton) cho số, tên đêm và tiêu đề khối:

| Token | Cỡ | Dùng cho |
|---|---|---|
| `--fs-d-xs` | 22px | Tên trong thẻ, ô ưu đãi, nút gửi |
| `--fs-d-s` | 30px | Số liệu hồ sơ, tiêu đề bước |
| `--fs-d-m` | 36px | Ngày trong lịch |
| `--fs-d-l` | 44px | Tên thứ, số bước, sao chấm |
| `--fs-d-xl` | 56px | Số hạng, số bước trên máy tính |
| `--fs-d-2xl` | 84px | Điểm sao lớn trên hồ sơ |

Tiêu đề lớn dùng `clamp()` theo bề rộng màn hình, không cần token.

Từ 10/11, 32 chỗ cỡ chữ lẻ đã được gom vào thang. Những chỗ đổi cỡ thấy được:

| Chỗ | Trước | Sau |
|---|---|---|
| Tên thứ trong lịch | 40px | 44px |
| Tên promoter trên thẻ, máy tính | 26px | 28px |
| Nút gửi đặt bàn, điện thoại | 21px | 22px |
| Chữ "promoter" cạnh logo, điện thoại | 19px | 18px |
| Nút "đổi người" | 17px | 18px |
| Ô mã bàn trên tablet | 40px | 44px |

Ngoài ra còn vài chỗ chỉ lệch 1px hoặc chỉ nằm trong trang quản lý: 10→11, 17→18, 64→56. Máy kiểm sẽ báo đỏ nếu có ai gõ cỡ chữ px mới.

## Bóng

Bóng dùng kiểu tem dán: `box-shadow:var(--hard) <màu>` (5px), còn khi bấm thì dùng `var(--hard-press)` (3px).

## Nút

| Class | Vai trò |
|---|---|
| `.btn-acid` | Hành động chính lớn (ĐẶT BÀN, GIỮ BÀN). Một màn chỉ có một nút này. |
| `button.btn-line`, `a.btn-line` | Hành động phụ đặt cạnh nút chính |
| `.cta` | Hành động chính nhỏ (form, quản lý) |
| `.cta.cta-line` | Hành động phụ nhỏ |
| `.ghostbtn`, `.ghostbtn.danger` | Thao tác trong bảng; danger dùng cho xoá, huỷ |
| `.chip` | Lọc, chọn một trong nhiều |
| `.tqb`, `.bsal` | Chọn nhanh trong vé đặt bàn |
| `.promo-go` | Nút trong ô ưu đãi |
| `.ev-mp` | Tem vàng "XEM POSTER LỊCH THÁNG 11" |
| `.pill`, `.tag` | Trạng thái và nhãn, không bấm được |
| `footer.foot .soc a` | Ô mạng xã hội 52px |

Từ PR sửa theo bản soi (10/11):

- Trên trang khách (nền giấy), `.cta` mang cùng kiểu với `.btn-acid`. Nút gửi trong vé vẫn là nút đen chữ vàng. Trang quản lý giữ `.cta` nhỏ.
- `.ev-mp` (poster lịch tháng) hạ xuống thành nút viền đen, không còn tem vàng nổi.
- Vùng bấm được nới bằng lớp `::after` vô hình. Bàn trên sơ đồ nới theo khoảng trống giữa các bàn (`.tspot.k-*`), được khoảng 43–63px, riêng SV2 và SV4 rộng 32px.

## Khung nổi

| Class | Dùng cho |
|---|---|
| `.pdlg` | Xem to poster đêm, poster lịch tháng, poster ưu đãi |
| `.sdlg` | Hồ sơ promoter, mở khi khách bấm thẻ ở lineup (từ 10/11). Dưới 900px phủ kín màn, từ 900px là khung giữa màn. Nút đặt bàn luôn dính ở đáy khung. Nút back trên điện thoại chỉ đóng khung. |

## Luật

1. Không gõ mã màu hay cỡ chữ mới. Lấy token trong `:root`; thiếu thì thêm token có chú thích rồi mới dùng.
2. Vàng acid dành cho hành động chính. Một màn có một nút vàng là đủ.
3. Vùng bấm trên điện thoại tối thiểu 44 × 44px.
4. Link nằm trong câu thì gạch chân. Số điện thoại thì không gạch.
5. Chữ thân viết thường, tiêu đề in hoa, không dùng dấu chấm than.
6. Chữ thường cần độ tương phản từ 4,5:1 trở lên. `--hint-p` đã đậm lên #6e6a61, đạt 4,9:1 trên vé.
7. Mọi thay đổi nhìn thấy được đều phải có ảnh xem trước trên máy tính 1280 và điện thoại 390 trước khi merge.
