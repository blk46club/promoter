// Kiểm phần đọc file máy bán hàng (public/xls.js) bằng file mẫu tools/mau/bao-cao-ban-hang-mau.xls.
// File mẫu là số giả "[mẫu]" làm bằng LibreOffice, cùng khuôn cột với file thật. Không bao giờ đưa file thật lên đây.
// Chạy: node tools/kiem-xls.cjs
const fs = require("fs"), path = require("path");
require(path.join(__dirname, "../public/xls.js"));
const X = globalThis.BLKXLS;
let bad = 0;
const ok = (c, m) => { console.log((c ? "đạt  " : "LỖI  ") + m); if (!c) bad++; };
const buf = fs.readFileSync(path.join(__dirname, "mau/bao-cao-ban-hang-mau.xls"));

// 1. đọc ô: tên món tiếng Việt dài, bảng chuỗi bị cắt qua nhiều bản ghi
const wb = X.readXls(buf), rows = wb.sheets[0].rows;
const names = new Set(rows.map((r) => r[7]).filter((v) => typeof v === "string" && v.startsWith("[mẫu] món")));
ok(names.size === 180, "đọc đủ 180 tên món (" + names.size + ")");
ok([...names].every((s) => /^\[mẫu\] món thử nghiệm số \d+-\d rượu vang ngọt nhẹ ấm áp đậm đà$/.test(s)), "tên món có dấu đọc đúng từng chữ");

// 2. gộp phiếu
const r = X.readPosFile(buf);
ok(r.bizDate === "2026-11-05" && r.shift === "1", "ngày kinh doanh 05/11/2026, ca 1");
ok(r.bills.length === 50 && r.skipped.length === 10 && r.skipped.every((b) => b.area === "BOD"), "50 phiếu tích điểm, 10 phiếu BOD để riêng");
ok(r.check && r.check.ok && r.check.read === 163800000, "tổng thành tiền khớp dòng tổng cuối file");
const b7 = r.bills.find((b) => b.seq === "00007");
ok(b7 && b7.amount === 2650000 && b7.discount === 50000 && b7.base === 2600000 && b7.lines === 3, "phiếu 00007: 3 món, trừ giảm giá");
ok(b7 && b7.close === "2026-11-06T03:49:31", "giờ đóng qua nửa đêm đọc đúng ngày (kiểu tháng/ngày)");
ok(r.bills.every((b, i, a) => !i || a[i - 1].close <= b.close), "phiếu xếp theo giờ đóng");
ok(!r.warn.length, "không có cảnh báo");

// 3. khuôn khác: ngày/tháng, số có dấu chấm, cột bàn, thiếu cột
const H = ["Số phiếu", "Thời gian đóng", "Khu", "Bàn", "thành tiền", "Giảm giá"];
const t = X.posBills([H, ["Ngày: 05/11/2026"], ["P-261105-00001", "05/11/2026 23:10:00", "Khu C", "C3", "1.250.000", "0"],
  ["P-261105-00001", "05/11/2026 23:10:00", "Khu C", "C3", 300000, 0], ["P-261105-00002", "06/11/2026 01:05:00", "Khu VIP", "V1", "2,000,000", "100,000"]]);
ok(t.dateOrder === "mdy" ? false : true, "ngày/tháng: nhận ra theo ngày kinh doanh");
ok(t.bills[0].base === 1550000 && t.bills[1].base === 1900000, "số tiền kiểu 1.250.000 và 2,000,000");
ok(t.bills[0].table === "C3", "có cột Bàn thì giữ số bàn");
let e = null; try { X.posBills([["Số phiếu", "Khu"], ["a", "b"]]); } catch (x) { e = x; }
ok(e && e.code === "cols" && /Thời gian đóng/.test(e.message), "thiếu cột thì báo tên cột thiếu");

// 4. file sai loại
const code = (b) => { try { X.readXls(b); return "đọc được"; } catch (x) { return x.code; } };
ok(code(Buffer.from("PK\u0003\u0004xxxx")) === "xlsx", "file .xlsx: bảo lưu lại thành .xls");
ok(code(Buffer.from("<html><table>")) === "html", "trang web đổi đuôi .xls: báo rõ");
ok(code(Buffer.alloc(600, 7)) === "notxls", "file rác: báo không phải .xls");

if (bad) { console.log(bad + " chỗ lỗi"); process.exit(1); }
console.log("ổn: phần đọc file máy bán hàng chạy đúng.");
