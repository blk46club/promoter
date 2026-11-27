/**
 * BLK46 · lưu danh sách đặt bàn mỗi đêm ra Google Sheet (Drive của blkhnoi46@gmail.com).
 *
 * Mỗi sáng chạy 1 lần: đăng nhập web promoter bằng tài khoản quản lý riêng cho script,
 * lấy mọi đặt bàn của ĐÊM HÔM TRƯỚC, ghi vào:
 *   BLK46 - Đặt bàn / 2026 / Tháng 11 / 07-11-2026 / Đặt bàn 07-11-2026 (Google Sheet)
 * Chạy lại cùng ngày thì ghi đè đúng file đó, không tạo file trùng.
 *
 * Cài đặt (làm 1 lần, xem hướng dẫn trong thread):
 *   Project Settings → Script Properties → thêm 2 dòng:
 *     BLK_EMAIL     = email tài khoản quản lý dành cho script
 *     BLK_PASSWORD  = mật khẩu tài khoản đó
 *   Rồi chạy hàm caiDatHangNgay() một lần để đặt lịch 7h sáng.
 *
 * Báo cáo tuần (thêm 14/11/2026): mỗi thứ 2 lúc 9h lưu tuần trước (thứ 2 → chủ nhật) vào
 *   BLK46 - Báo cáo tuần / 2026 / Báo cáo tuần 16-11-2026 đến 22-11-2026 (Google Sheet)
 * Chỉ có con số, không có tên hay số điện thoại khách. Chạy caiDatHangTuan() một lần để đặt lịch.
 * Muốn xem ngay tuần đang chạy: chạy baoCaoTuanNay().
 *
 * Chia sẻ quyền xem file "Đặt bàn …" (thêm 14/11/2026): mỗi lần lưu, file được chia sẻ quyền
 * Người xem cho các email trong Script Properties XEM_CUNG (nhiều email thì cách nhau dấu phẩy),
 * không gửi email thông báo. Email không nằm trong code vì repo này công khai.
 *   Cần bật 1 lần: trình soạn code → Dịch vụ (+) → Drive API → Thêm.
 *   File đã có từ trước: chạy chiaSeFileCu() một lần.
 * Script chỉ THÊM quyền xem cho đúng email đó, không đổi quyền nào khác, không bật chia sẻ bằng link.
 *
 * Nhắn Zalo xác nhận đặt bàn (thêm 27/11/2026): xem phần "Zalo" bên dưới. Mặc định tắt.
 */

const CFG = {
  apiKey: "AIzaSyDWORkNubUiMOkk429kNSVcBBIXENRw_Tc",      // khoá web công khai (giống firebase-config.js)
  projectId: "blk46-promoter",
  referer: "https://blk46club.github.io/promoter/",       // khoá web chỉ nhận request từ trang này
  rootFolder: "BLK46 - Đặt bàn",
  weekFolder: "BLK46 - Báo cáo tuần",                     // thư mục riêng: báo cáo tuần không có số điện thoại khách
  runHour: 7,                                             // giờ chạy mỗi sáng (giờ Hà Nội)
  weekHour: 9,                                            // giờ chạy báo cáo tuần, sáng thứ 2
  tz: "Asia/Ho_Chi_Minh",
};

const STATUS_VI = { requested: "chờ xác nhận", confirmed: "đã xác nhận", seated: "đã đến", cancelled: "đã huỷ" };
const HEADER = ["giờ đến", "danh xưng", "tên khách", "số điện thoại", "số người", "bàn", "promoter",
  "trạng thái", "mã bàn", "tip (đ)", "tip từng promoter", "tip đã cộng bill", "giữ bàn đến", "nguồn", "ghi chú", "gửi đặt lúc"];
// độ rộng tối thiểu từng cột (px), cùng thứ tự HEADER; cột ghi chú cố định và xuống dòng
const COL_W = [80, 95, 170, 130, 85, 70, 150, 115, 90, 100, 210, 135, 110, 160, 280, 150];

/** Chạy mỗi sáng: lưu đêm hôm qua. */
function luuDemHomQua() {
  const d = new Date(Date.now() - 24 * 3600e3);
  luuNgay(Utilities.formatDate(d, CFG.tz, "yyyy-MM-dd"));
}

/** Lưu lại 1 ngày bất kỳ, ví dụ luuNgayTay() sau khi sửa ngày bên dưới. */
function luuNgayTay() { luuNgay("2026-11-07"); }

function luuNgay(iso) {
  const token = dangNhap_();
  const idolNames = tenPromoter_(token);
  const list = layDatBan_(token, iso);
  const tips = layTip_(token, list.map((b) => b.id));
  const rows = list.map((b) => { const t = tips[b.id] || { sum: 0, by: {}, n: 0, added: 0 }; return [
    b.time || "",
    b.salutation || "",
    b.guestName || "",
    b.phone ? "'" + b.phone : "",                 // giữ số 0 đầu
    b.guests || "",
    b.table || "",
    (b.idolIds || []).map((id) => idolNames[id] || id).join(", "),
    STATUS_VI[b.status] || b.status || "",
    b.code || "",
    t.sum || "",
    Object.entries(t.by).map(([id, v]) => (idolNames[id] || id) + ": " + v.toLocaleString("vi-VN")).join(", "),
    t.n ? (t.added === t.n ? "đã cộng" : t.added ? "cộng " + t.added + "/" + t.n : "chưa cộng") : "",
    b.holdUntil ? Utilities.formatDate(new Date(Number(b.holdUntil)), CFG.tz, "HH:mm") : "",
    b.source === "web" ? "khách đặt trên web" : "quản lý tạo",
    b.note || "",
    b.createdAt ? Utilities.formatDate(new Date(Number(b.createdAt)), CFG.tz, "dd/MM/yyyy HH:mm") : "",
  ]; }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const [y, m, dd] = iso.split("-");
  const label = dd + "-" + m + "-" + y;
  const folder = thuMuc_(thuMuc_(thuMuc_(thuMuc_(DriveApp.getRootFolder(), CFG.rootFolder), y), "Tháng " + Number(m)), label);
  const ss = fileSheet_(folder, "Đặt bàn " + label);
  const loiChiaSe = chiaSeXem_(ss.getId(), "Đặt bàn " + label);   // chia sẻ ngay sau khi tạo / mở file
  const sh = ss.getSheets()[0];
  sh.clear();
  sh.setName("đặt bàn");
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight("bold");
  // chữ khách gõ luôn vào Sheet dưới dạng chữ: ô bắt đầu bằng = + - @ thì thêm dấu ' phía trước
  rows.forEach((r) => r.forEach((c, i) => { if (typeof c === "string" && /^[=+\-@\t\r\n]/.test(c)) r[i] = "'" + c; }));
  if (rows.length) sh.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
  else sh.getRange(2, 1).setValue("không có đặt bàn nào đêm này");
  if (rows.length) sh.autoResizeColumns(1, HEADER.length);
  COL_W.forEach((w, i) => sh.setColumnWidth(i + 1, i === 14 || !rows.length ? w : Math.max(w, sh.getColumnWidth(i + 1) + 20)));
  sh.getRange(1, 1, Math.max(rows.length, 1) + 1, HEADER.length).setVerticalAlignment("middle");
  sh.getRange(1, 15, Math.max(rows.length, 1) + 1, 1).setWrap(true);
  sh.setRowHeight(1, 30);
  const tong = rows.length, den = rows.filter((r) => r[7] === "đã đến").length, huy = rows.filter((r) => r[7] === "đã huỷ").length;
  const tipSum = rows.reduce((s, r) => s + (Number(r[9]) || 0), 0);
  sh.getRange(rows.length + 3, 1, 1, 2).setValues([["tổng", tong + " đơn · " + den + " đã đến · " + huy + " huỷ · tip " + tipSum.toLocaleString("vi-VN") + "đ"]]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 10, rows.length, 1).setNumberFormat("#,##0");
  sh.setFrozenRows(1);
  console.log("đã lưu " + tong + " đơn vào " + ss.getUrl());
  // file đã lưu xong; chia sẻ lỗi thì báo lỗi để Apps Script ghi vào mục lỗi (lần chạy sau sẽ thử lại)
  if (loiChiaSe.length) throw new Error("đã lưu file nhưng chưa chia sẻ được: " + loiChiaSe.join("; "));
}

/** Chạy 1 lần: chia sẻ quyền xem (không gửi email) mọi file "Đặt bàn dd-mm-yyyy" đã có trong thư mục BLK46 - Đặt bàn. */
function chiaSeFileCu() {
  const it = DriveApp.getRootFolder().getFoldersByName(CFG.rootFolder);
  if (!it.hasNext()) { console.log("chưa có thư mục " + CFG.rootFolder); return; }
  let n = 0;
  const loi = [];
  const walk = (f) => {
    const fi = f.getFiles();
    while (fi.hasNext()) {
      const x = fi.next();
      if (x.getMimeType() === MimeType.GOOGLE_SHEETS && /^Đặt bàn \d{2}-\d{2}-\d{4}$/.test(x.getName())) { n++; loi.push(...chiaSeXem_(x.getId(), x.getName())); }
    }
    const sf = f.getFolders();
    while (sf.hasNext()) walk(sf.next());
  };
  walk(it.next());
  console.log("đã kiểm " + n + " file đặt bàn");
  if (loi.length) throw new Error("chưa chia sẻ được: " + loi.join("; "));
}

/** Đặt lịch chạy mỗi sáng. Chạy hàm này 1 lần. */
function caiDatHangNgay() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "luuDemHomQua") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("luuDemHomQua").timeBased().everyDays(1).atHour(CFG.runHour).inTimezone(CFG.tz).create();
  console.log("đã đặt lịch mỗi ngày khoảng " + CFG.runHour + "h sáng");
}

/* ---------- báo cáo tuần ---------- */

/** Lịch thứ 2 hằng tuần: lưu tuần vừa hết (thứ 2 → chủ nhật). */
function baoCaoTuanTruoc() { baoCaoTuan(isoAdd_(mondayOf_(todayVN_()), -7)); }
/** Chạy tay: tuần đang chạy, số tới lúc bấm (chạy lại thì ghi đè cùng file). */
function baoCaoTuanNay() { baoCaoTuan(mondayOf_(todayVN_())); }
/** Chạy tay một tuần bất kỳ: sửa ngày thứ 2 của tuần đó bên dưới. */
function baoCaoTuanTay() { baoCaoTuan("2026-11-09"); }

/** Đặt lịch báo cáo tuần. Chạy hàm này 1 lần. */
function caiDatHangTuan() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "baoCaoTuanTruoc") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("baoCaoTuanTruoc").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(CFG.weekHour).inTimezone(CFG.tz).create();
  console.log("đã đặt lịch báo cáo tuần: thứ 2, khoảng " + CFG.weekHour + "h sáng");
}

// các bước khách đi qua trên web (web chỉ đếm, không hiện số; số chỉ xem trong báo cáo tuần này)
const FX_STEPS = [["mo", "mở web"], ["form", "mở form đặt bàn"], ["dien", "bắt đầu điền"], ["gui", "bấm gửi"], ["xong", "gửi xong"], ["goi", "bấm gọi hotline"], ["vform", "mở form voucher"], ["vc", "nhận voucher"]];
const FX_ERRS = [["e_dx", "quên chọn Mr/Miss"], ["e_ngay", "ngày sai hoặc đã qua"], ["e_gio", "giờ sai hoặc đã qua"], ["e_sdt", "số điện thoại sai"], ["e_ban", "bàn vừa có người"], ["e_full", "promoter đã kín"], ["e_mang", "lỗi mạng, chưa gửi được"]];
const SRC_NAMES = { "fb": "facebook (không gắn mã)", "ig": "instagram (không gắn mã)", "tiktok": "tiktok (không gắn mã)", "zalo": "zalo", "google": "google",
  "threads": "threads (không gắn mã)",
  "fb-ads": "quảng cáo facebook vào web", "ig-ads": "quảng cáo instagram vào web", "mess-fb": "link gửi trong tin nhắn facebook", "mess-ig": "link gửi trong tin nhắn instagram",
  "fb-bio": "trang facebook của quán", "ig-bio": "trang instagram của quán", "threads-bio": "trang threads của quán", "tiktok-bio": "trang tiktok của quán", "qr-ban": "qr tại bàn", "khong-ro": "không rõ (gõ địa chỉ, qr cũ…)", "chua-gan": "đặt khi chưa có mã nguồn", "quan-ly": "quản lý tạo (gọi điện, chat, tại quán)" };
const srcName_ = (v) => SRC_NAMES[v] || (/^nv-?\d+$/.test(v) ? "nhân viên " + v.replace(/^nv-?/, "") : v);
const WD_VI = ["chủ nhật", "thứ 2", "thứ 3", "thứ 4", "thứ 5", "thứ 6", "thứ 7"];

function baoCaoTuan(mon) {
  const token = dangNhap_();
  const sun = isoAdd_(mon, 6), next = isoAdd_(mon, 7), prev = isoAdd_(mon, -7);
  const ms = (iso) => Date.parse(iso + "T00:00:00+07:00");
  // tuần này + tuần trước (để so), mỗi loại một lần đọc
  let funnel = [];
  try { funnel = layKhoang_(token, "funnel", "date", { stringValue: prev }, { stringValue: next }); }
  catch (e) { console.log("chưa đọc được bộ đếm nguồn khách (chưa dán luật Firebase mới?): " + e.message); }
  const visits = layKhoang_(token, "visits", "date", { stringValue: prev }, { stringValue: next });
  const byNight = layKhoang_(token, "bookings", "date", { stringValue: prev }, { stringValue: next });
  const bySent = layKhoang_(token, "bookings", "createdAt", { integerValue: String(ms(mon)) }, { integerValue: String(ms(next)) });
  const inWeek = (iso, a) => iso >= a && iso < isoAdd_(a, 7);

  const step = (a, k) => funnel.filter((x) => inWeek(x.date, a)).reduce((t, x) => t + (Number(x[k]) || 0), 0);
  const nights = (a) => byNight.filter((b) => inWeek(b.date || "", a));
  const sum = (a) => {
    const nb = nights(a), seated = nb.filter((b) => b.status === "seated");
    return {
      visits: visits.filter((v) => inWeek(v.date, a)).reduce((t, v) => t + (Number(v.n) || 0), 0),
      mo: step(a, "mo"), form: step(a, "form"), xong: step(a, "xong"), goi: step(a, "goi"), vc: step(a, "vc"),
      don: nb.filter((b) => b.status !== "cancelled").length, web: nb.filter((b) => b.source === "web" && b.status !== "cancelled").length,
      den: seated.length, huy: nb.filter((b) => b.status === "cancelled").length,
      khach: seated.reduce((t, b) => t + (Number(b.guests) || 0), 0),
    };
  };
  const A = sum(mon), B = sum(prev);
  const pct = (x, y) => (y ? x / y : "");
  const now = Utilities.formatDate(new Date(), CFG.tz, "dd/MM/yyyy HH:mm");
  const done = Date.now() >= ms(next);
  const title = "BLK46 · báo cáo tuần " + dmy_(mon) + " đến " + dmy_(sun);
  const noFunnel = !funnel.some((x) => inWeek(x.date, mon));

  const folder = thuMuc_(thuMuc_(DriveApp.getRootFolder(), CFG.weekFolder), mon.slice(0, 4));
  const ss = fileSheet_(folder, "Báo cáo tuần " + dmy_(mon) + " đến " + dmy_(sun));

  /* 1. tổng quan: tuần này so với tuần trước */
  const ov = [
    ["lượt mở web (đếm cũ: mỗi máy 1 lần / 30 phút)", A.visits, B.visits],
    ["người mở web (bộ đếm nguồn khách)", A.mo, B.mo],
    ["mở form đặt bàn", A.form, B.form],
    ["gửi đặt bàn xong trên web", A.xong, B.xong],
    ["tỉ lệ gửi xong / mở web", pct(A.xong, A.mo), pct(B.xong, B.mo)],
    ["bấm gọi hotline", A.goi, B.goi],
    ["nhận voucher", A.vc, B.vc],
    ["bàn đặt cho các đêm trong tuần (không tính huỷ)", A.don, B.don],
    ["trong đó khách tự đặt trên web", A.web, B.web],
    ["bàn khách đã đến", A.den, B.den],
    ["tổng số người ở các bàn đã đến", A.khach, B.khach],
    ["bàn huỷ", A.huy, B.huy],
  ].map((r) => [r[0], r[1], r[2], typeof r[1] === "number" && typeof r[2] === "number" ? r[1] - r[2] : ""]);
  const s1 = tab_(ss, 0, "tổng quan");
  s1.getRange(1, 1).setValue(title).setFontWeight("bold").setFontSize(14);
  s1.getRange(2, 1).setValue((done ? "số chốt lúc " : "tuần chưa hết, số tới lúc ") + now + " · tuần trước = " + dmy_(prev) + " đến " + dmy_(isoAdd_(prev, 6)));
  if (noFunnel) s1.getRange(3, 1).setValue("tuần này chưa có số liệu bộ đếm nguồn khách (bộ đếm chạy từ khi dán luật Firebase mới).");
  s1.getRange(5, 1, 1, 4).setValues([["", "tuần này", "tuần trước", "chênh"]]).setFontWeight("bold");
  s1.getRange(6, 1, ov.length, 4).setValues(ov);
  s1.getRange(6, 2, ov.length, 3).setNumberFormat("#,##0");
  s1.getRange(10, 2, 1, 2).setNumberFormat("0%");
  s1.getRange(10, 4).setValue("");
  [380, 110, 110, 90].forEach((w, i) => s1.setColumnWidth(i + 1, w));

  /* 2. theo nguồn: khách đến từ đâu, dừng ở bước nào */
  const rows = {};
  const add = (src, k, n) => { const r = rows[src] = rows[src] || { src }; r[k] = (r[k] || 0) + n; };
  funnel.filter((x) => inWeek(x.date, mon)).forEach((x) => FX_STEPS.concat(FX_ERRS).forEach(([k]) => { if (x[k]) add(x.src || "khong-ro", k, Number(x[k])); }));
  bySent.forEach((b) => { const v = b.source === "web" ? (b.src || "chua-gan") : "quan-ly";
    add(v, "b_all", 1); if (b.status === "confirmed" || b.status === "seated") add(v, "b_ok", 1);
    if (b.status === "seated") add(v, "b_came", 1); if (b.status === "cancelled") add(v, "b_huy", 1); });
  const list = Object.values(rows).sort((a, b) => (b.mo || 0) - (a.mo || 0) || (b.b_all || 0) - (a.b_all || 0));
  const head2 = ["nguồn", "mã"].concat(FX_STEPS.map((x) => x[1]), ["gửi xong / mở web", "bàn đặt trong tuần", "quản lý xác nhận", "khách đã đến", "huỷ"]);
  const line = (r, name, code) => [name, code].concat(FX_STEPS.map(([k]) => r[k] || 0), [pct(r.xong || 0, r.mo || 0), r.b_all || 0, r.b_ok || 0, r.b_came || 0, r.b_huy || 0]);
  const tot = { src: "tổng" }; list.forEach((r) => Object.keys(r).forEach((k) => { if (k !== "src") tot[k] = (tot[k] || 0) + r[k]; }));
  const body2 = list.map((r) => line(r, srcName_(r.src), r.src));
  if (list.length > 1) body2.push(line(tot, "tổng", ""));
  const s2 = tab_(ss, 1, "theo nguồn");
  s2.getRange(1, 1).setValue(title + " · theo nguồn").setFontWeight("bold");
  s2.getRange(2, 1).setValue("bước trên web: mỗi máy đếm 1 lần mỗi bước trong một phiên, nên ≈ số người. bàn đặt: tính theo lúc gửi trong tuần, trạng thái tới lúc chạy báo cáo.");
  s2.getRange(4, 1, 1, head2.length).setValues([head2]).setFontWeight("bold").setWrap(true);
  if (body2.length) {
    s2.getRange(5, 1, body2.length, head2.length).setValues(safe_(body2));
    s2.getRange(5, 3, body2.length, head2.length - 2).setNumberFormat("#,##0");
    s2.getRange(5, 3 + FX_STEPS.length, body2.length, 1).setNumberFormat("0%");
    if (list.length > 1) s2.getRange(4 + body2.length, 1, 1, head2.length).setFontWeight("bold");
  } else s2.getRange(5, 1).setValue("chưa có số liệu tuần này");
  s2.setColumnWidth(1, 260); s2.setColumnWidth(2, 110);
  for (let c = 3; c <= head2.length; c++) s2.setColumnWidth(c, 95);
  s2.setRowHeight(4, 48); s2.setFrozenRows(4); s2.setFrozenColumns(1);

  /* 3. lỗi khi bấm gửi: ô nào làm khách bị chặn */
  const s3 = tab_(ss, 2, "lỗi khi gửi");
  s3.getRange(1, 1).setValue(title + " · khách bị chặn khi bấm gửi").setFontWeight("bold");
  const errs = FX_ERRS.map(([k, l]) => [l, step(mon, k), step(prev, k)]);
  s3.getRange(3, 1, 1, 3).setValues([["lỗi", "tuần này", "tuần trước"]]).setFontWeight("bold");
  s3.getRange(4, 1, errs.length, 3).setValues(errs);
  [260, 110, 110].forEach((w, i) => s3.setColumnWidth(i + 1, w));

  /* 4. các đêm trong tuần (theo ngày khách đến) */
  const s4 = tab_(ss, 3, "các đêm");
  s4.getRange(1, 1).setValue(title + " · từng đêm (theo ngày khách đến)").setFontWeight("bold");
  const head4 = ["đêm", "bàn đặt", "khách tự đặt web", "quản lý tạo", "đã xác nhận", "đã đến", "số người đã đến", "huỷ", "còn chờ xác nhận"];
  const body4 = [];
  for (let i = 0; i < 7; i++) {
    const d = isoAdd_(mon, i), nb = byNight.filter((b) => b.date === d);
    if (!nb.length) continue;
    const live = nb.filter((b) => b.status !== "cancelled");
    body4.push([WD_VI[new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8))).getUTCDay()] + " " + d.slice(8) + "/" + d.slice(5, 7),
      live.length, live.filter((b) => b.source === "web").length, live.filter((b) => b.source !== "web").length,
      nb.filter((b) => b.status === "confirmed").length, nb.filter((b) => b.status === "seated").length,
      nb.filter((b) => b.status === "seated").reduce((t, b) => t + (Number(b.guests) || 0), 0),
      nb.filter((b) => b.status === "cancelled").length, nb.filter((b) => b.status === "requested").length]);
  }
  s4.getRange(3, 1, 1, head4.length).setValues([head4]).setFontWeight("bold").setWrap(true);
  if (body4.length) s4.getRange(4, 1, body4.length, head4.length).setValues(body4);
  else s4.getRange(4, 1).setValue("không có bàn nào cho các đêm tuần này");
  s4.setColumnWidth(1, 130); for (let c = 2; c <= head4.length; c++) s4.setColumnWidth(c, 100);
  s4.setRowHeight(3, 48);

  ss.setActiveSheet(s1);
  console.log("đã lưu báo cáo tuần " + dmy_(mon) + " đến " + dmy_(sun) + ": " + ss.getUrl());
}

/* đọc một khoảng [lo, hi) của một trường, ví dụ date từ thứ 2 tới thứ 2 tuần sau */
function layKhoang_(token, col, field, lo, hi) {
  const f = (op, value) => ({ fieldFilter: { field: { fieldPath: field }, op, value } });
  const res = fs_(token, ":runQuery", { structuredQuery: { from: [{ collectionId: col }],
    where: { compositeFilter: { op: "AND", filters: [f("GREATER_THAN_OR_EQUAL", lo), f("LESS_THAN", hi)] } } } });
  return res.filter((x) => x.document).map((x) => doc_(x.document));
}

/* lấy tab thứ i (tạo nếu chưa có), xoá sạch, đặt tên */
function tab_(ss, i, name) {
  const all = ss.getSheets();
  const sh = all[i] || ss.insertSheet(name, i);
  sh.clear(); sh.setName(name);
  return sh;
}
/* chữ đưa vào Sheet: ô bắt đầu bằng = + - @ thì thêm dấu ' để Sheet không coi là công thức */
const safe_ = (rows) => rows.map((r) => r.map((c) => (typeof c === "string" && /^[=+\-@\t\r\n]/.test(c) ? "'" + c : c)));
const todayVN_ = () => Utilities.formatDate(new Date(), CFG.tz, "yyyy-MM-dd");
const isoAdd_ = (iso, n) => { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
const mondayOf_ = (iso) => { const p = iso.split("-").map(Number); const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); return isoAdd_(iso, -((dow + 6) % 7)); };
const dmy_ = (iso) => iso.slice(8) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4);

/* ---------- Zalo: nhắn xác nhận đặt bàn cho khách (thêm 27/11/2026) ----------
 * Khi quản lý bấm "xác nhận" một đặt bàn trên web, trong vòng ~5 phút khách nhận 1 tin Zalo
 * theo mẫu đã được Zalo duyệt (ZBS template, trước gọi là ZNS). Mỗi đặt bàn chỉ gửi 1 lần.
 * Mặc định TẮT: thiếu Script Properties bên dưới thì không gửi gì, không báo lỗi.
 *
 * Script Properties (Project Settings → Script Properties). Không dán các giá trị này vào chat hay repo:
 *   ZALO_APP_ID      App ID của app trên developers.zalo.me
 *   ZALO_SECRET      Khóa bí mật (Secret Key) của app đó
 *   ZALO_REFRESH     Refresh Token lấy ở API Explorer. Script tự thay bằng token mới mỗi lần làm mới
 *   ZNS_TEMPLATE_ID  ID mẫu "xác nhận đặt bàn" sau khi Zalo duyệt
 *   ZNS_CHI_GUI      chạy thử: chỉ gửi cho các số này (cách nhau dấu phẩy), số khác bỏ qua
 *   ZNS_BAT          = co  → gửi cho mọi khách. Chưa có dòng này thì chỉ gửi cho số trong ZNS_CHI_GUI
 * Script tự ghi thêm: ZALO_ACCESS, ZALO_ACCESS_HET (token dùng tạm, 25 giờ) và ZNS_<mã đặt bàn> (đã gửi chưa).
 *
 * Cách bật: thuZaloMot() gửi 1 tin mẫu tới số đầu tiên trong ZNS_CHI_GUI → nhận được thì chạy caiDatZalo()
 * (lịch 5 phút/lần). Tắt hẳn: chạy tatZalo().
 */
const ZNS = {
  sendUrl: "https://business.openapi.zalo.me/message/template",
  tokenUrl: "https://oauth.zaloapp.com/v4/oa/access_token",
  lookbackMin: 90,        // xem lại các đặt bàn được sửa trong 90 phút gần nhất (lịch chạy 5 phút, dư phòng khi lỡ lượt)
  maxDaysAhead: 7,        // Zalo chỉ cho gửi trong 7 ngày quanh ngày giao dịch
  maxTries: 3,            // gửi lỗi thì thử lại tối đa 3 lượt rồi thôi
  keepDays: 10,           // xoá dấu "đã gửi" cũ hơn 10 ngày cho gọn Script Properties
};

/** Lịch 5 phút/lần: tìm đặt bàn vừa được xác nhận và nhắn Zalo. */
function guiZaloXacNhan() {
  const p = PropertiesService.getScriptProperties();
  const cfg = znsCfg_(p);
  if (!cfg) return;                                        // chưa cài đủ → không làm gì
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;                         // lượt trước chưa chạy xong
  try {
    const now = Date.now(), today = todayVN_(), last = isoAdd_(today, ZNS.maxDaysAhead);
    const token = dangNhapNhanh_();
    const list = layKhoang_(token, "bookings", "updatedAt",
      { integerValue: String(now - ZNS.lookbackMin * 60e3) }, { integerValue: String(now + 60e3) });
    let gui = 0, loi = 0, bo = 0;
    list.forEach((b) => {
      if (b.status !== "confirmed" || !b.date || b.date < today || b.date > last) return;
      if (!arrivalMs_(b) || arrivalMs_(b) <= now) return;  // giờ đến đã qua (khách vãng lai quản lý tạo lúc xếp bàn)
      const key = "ZNS_" + b.id, st = JSON.parse(p.getProperty(key) || "{}");
      if (st.ok || (st.n || 0) >= ZNS.maxTries) return;
      const phone = phone84_(b.phone);
      if (!phone) { p.setProperty(key, JSON.stringify({ at: now, n: ZNS.maxTries, err: "số điện thoại không hợp lệ" })); bo++; return; }
      if (!cfg.all && !cfg.only.includes(phone)) return;  // đang chạy thử: số khác bỏ qua, không đánh dấu
      const r = guiMau_(p, cfg, phone, duLieuMau_(b), b.id);
      p.setProperty(key, JSON.stringify(r.ok ? { at: now, ok: 1 } : { at: now, n: (st.n || 0) + 1, err: r.err }));
      r.ok ? gui++ : loi++;
      console.log((r.ok ? "đã gửi Zalo " : "chưa gửi được Zalo ") + b.id + " · " + an_(phone) + (r.ok ? "" : " · " + r.err));
    });
    if (gui || loi || bo) console.log("Zalo: " + gui + " gửi được · " + loi + " lỗi · " + bo + " số sai");
    donDauCu_(p, now);
  } finally { lock.releaseLock(); }
}

/** Chạy tay sau khi Zalo duyệt mẫu: gửi 1 tin mẫu (dữ liệu giả) tới số đầu tiên trong ZNS_CHI_GUI. */
function thuZaloMot() {
  const p = PropertiesService.getScriptProperties();
  const cfg = znsCfg_(p);
  if (!cfg) throw new Error("chưa đủ Script Properties: ZALO_APP_ID, ZALO_SECRET, ZALO_REFRESH, ZNS_TEMPLATE_ID");
  if (!cfg.only.length) throw new Error("điền số của anh vào ZNS_CHI_GUI trước, ví dụ 0912345678");
  const d = new Date(Date.now() + 24 * 3600e3), iso = Utilities.formatDate(d, CFG.tz, "yyyy-MM-dd");
  const mau = { id: "bthuzalo" + Utilities.formatDate(new Date(), CFG.tz, "HHmmss"), salutation: "Mr", guestName: "Thử Zalo",
    date: iso, time: "22:30", guests: "4", table: "V1", holdUntil: new Date(iso + "T23:00:00+07:00").getTime() };
  const r = guiMau_(p, cfg, cfg.only[0], duLieuMau_(mau), mau.id);
  console.log(r.ok ? "đã gửi tin thử tới " + an_(cfg.only[0]) + ". mở Zalo trên máy đó để xem." : "chưa gửi được: " + r.err);
}

/** Chạy 1 lần để bật lịch 5 phút/lần. Chạy lại không tạo trùng. */
function caiDatZalo() {
  tatZalo();
  ScriptApp.newTrigger("guiZaloXacNhan").timeBased().everyMinutes(5).create();
  console.log("đã đặt lịch gửi Zalo 5 phút/lần");
}

/** Tắt gửi Zalo (xoá lịch). Script Properties giữ nguyên. */
function tatZalo() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "guiZaloXacNhan").forEach((t) => ScriptApp.deleteTrigger(t));
}

/* tên tham số phải trùng đúng tên trong mẫu đăng ký với Zalo */
function duLieuMau_(b) {
  const ngay = b.date.slice(8) + "/" + b.date.slice(5, 7) + "/" + b.date.slice(0, 4);
  return {
    ten_khach: ((b.salutation ? b.salutation + " " : "") + (b.guestName || "")).trim().slice(0, 30) || "quý khách",
    ma_dat: String(b.id).slice(-6).toUpperCase(),
    ngay_den: ngay,
    gio_den: b.time || "",
    so_khach: String(b.guests || "").slice(0, 3) || "chưa rõ",
    ban: String(b.table || "").toUpperCase().slice(0, 10) || "xếp khi đến",
    giu_den: b.holdUntil ? Utilities.formatDate(new Date(Number(b.holdUntil)), CFG.tz, "HH:mm") : (b.time || ""),
  };
}

function znsCfg_(p) {
  const v = (k) => String(p.getProperty(k) || "").trim();
  if (!v("ZALO_APP_ID") || !v("ZALO_SECRET") || !v("ZALO_REFRESH") || !v("ZNS_TEMPLATE_ID")) return null;
  return { appId: v("ZALO_APP_ID"), template: v("ZNS_TEMPLATE_ID"), all: v("ZNS_BAT").toLowerCase() === "co",
    only: v("ZNS_CHI_GUI").split(/[,;\n]+/).map(phone84_).filter(Boolean) };   // số có dấu cách vẫn được
}

/* gửi 1 tin; token hết hạn giữa chừng thì làm mới và thử lại 1 lần */
function guiMau_(p, cfg, phone, data, trackingId) {
  for (let lan = 0; lan < 2; lan++) {
    const r = UrlFetchApp.fetch(ZNS.sendUrl, { method: "post", contentType: "application/json", muteHttpExceptions: true,
      headers: { access_token: tokenZalo_(p, lan > 0) },
      payload: JSON.stringify({ phone, template_id: cfg.template, template_data: data, tracking_id: String(trackingId).slice(0, 48) }) });
    let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { j = { error: "http" + r.getResponseCode(), message: r.getContentText().slice(0, 120) }; }
    if (Number(j.error) === 0) return { ok: true, msgId: (j.data || {}).msg_id };
    const tokenLoi = /token/i.test(String(j.message || "")) || [-124, -216].includes(Number(j.error));
    if (!tokenLoi || lan > 0) return { ok: false, err: String(j.error) + " " + String(j.message || "").slice(0, 120) };
  }
}

/* access token dùng tạm 25 giờ; còn dưới 1 giờ thì đổi refresh token lấy cặp mới (refresh token cũ hết dùng được) */
function tokenZalo_(p, ep) {
  const het = Number(p.getProperty("ZALO_ACCESS_HET") || 0);
  if (!ep && p.getProperty("ZALO_ACCESS") && het - Date.now() > 3600e3) return p.getProperty("ZALO_ACCESS");
  const r = UrlFetchApp.fetch(ZNS.tokenUrl, { method: "post", muteHttpExceptions: true,
    contentType: "application/x-www-form-urlencoded", headers: { secret_key: p.getProperty("ZALO_SECRET") },
    payload: { refresh_token: p.getProperty("ZALO_REFRESH"), app_id: p.getProperty("ZALO_APP_ID"), grant_type: "refresh_token" } });
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { /* để báo lỗi bên dưới */ }
  if (!j.access_token || !j.refresh_token) {
    // không in token ra nhật ký; chỉ in mã lỗi Zalo trả về
    throw new Error("không làm mới được token Zalo (" + (j.error || r.getResponseCode()) + " " + String(j.error_description || j.message || "").slice(0, 120) +
      "). lấy Refresh Token mới ở API Explorer rồi dán đè vào ZALO_REFRESH.");
  }
  p.setProperties({ ZALO_ACCESS: j.access_token, ZALO_REFRESH: j.refresh_token,
    ZALO_ACCESS_HET: String(Date.now() + (Number(j.expires_in) || 90000) * 1000) });
  return j.access_token;
}

/* đăng nhập Firebase, nhớ 50 phút để lịch 5 phút không phải đăng nhập lại mỗi lượt */
function dangNhapNhanh_() {
  const c = CacheService.getScriptCache(), t = c.get("BLK_ID_TOKEN");
  if (t) return t;
  const token = dangNhap_();
  c.put("BLK_ID_TOKEN", token, 50 * 60);
  return token;
}

/* 0912345678 / +84 912 345 678 / 84912345678 → 84912345678; sai thì "" */
function phone84_(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) d = "84" + d.slice(1);
  return /^84\d{9}$/.test(d) ? d : "";
}
const an_ = (phone) => phone.slice(0, 4) + "•••" + phone.slice(-3);   // nhật ký không in đủ số khách
const arrivalMs_ = (b) => /^\d{2}:\d{2}$/.test(b.time || "") ? new Date(b.date + "T" + b.time + ":00+07:00").getTime() : 0;

function donDauCu_(p, now) {
  const all = p.getProperties();
  Object.keys(all).filter((k) => k.indexOf("ZNS_") === 0 && k !== "ZNS_TEMPLATE_ID" && k !== "ZNS_CHI_GUI" && k !== "ZNS_BAT").forEach((k) => {
    try { if (now - (JSON.parse(all[k]).at || 0) > ZNS.keepDays * 864e5) p.deleteProperty(k); } catch (e) { /* bỏ qua dòng lạ */ }
  });
}

/* ---------- phần bên dưới không cần sửa ---------- */

function dangNhap_() {
  const p = PropertiesService.getScriptProperties();
  const email = p.getProperty("BLK_EMAIL"), pass = p.getProperty("BLK_PASSWORD");
  if (!email || !pass) throw new Error("chưa điền BLK_EMAIL / BLK_PASSWORD trong Script Properties");
  const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + CFG.apiKey, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Referer: CFG.referer },
    payload: JSON.stringify({ email, password: pass, returnSecureToken: true }),
  });
  const j = JSON.parse(r.getContentText());
  if (!j.idToken) throw new Error("đăng nhập không được: " + r.getContentText().slice(0, 300));
  return j.idToken;
}

function fs_(token, path, body) {
  const base = "https://firestore.googleapis.com/v1/projects/" + CFG.projectId + "/databases/(default)/documents";
  const opt = { method: body ? "post" : "get", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token, Referer: CFG.referer } };
  if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch(base + path, opt);
  if (r.getResponseCode() !== 200) throw new Error("Firestore " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText());
}

function val_(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val_);
  if ("mapValue" in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => o[k] = val_(x)); return o; }
  return null;
}
const doc_ = (d) => { const o = {}; Object.entries(d.fields || {}).forEach(([k, x]) => o[k] = val_(x)); o.id = d.name.split("/").pop(); return o; };

function layDatBan_(token, iso) {
  const res = fs_(token, ":runQuery", { structuredQuery: {
    from: [{ collectionId: "bookings" }],
    where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: iso } } },
  } });
  return res.filter((x) => x.document).map((x) => doc_(x.document));
}

/* Tip khách để lại khi chấm điểm (notes/*: bookingId, idolId, tip, tipAdded). Chỉ quản lý đọc được. */
function layTip_(token, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const res = fs_(token, ":runQuery", { structuredQuery: {
      from: [{ collectionId: "notes" }],
      where: { fieldFilter: { field: { fieldPath: "bookingId" }, op: "IN",
        value: { arrayValue: { values: chunk.map((x) => ({ stringValue: x })) } } } },
    } });
    res.filter((x) => x.document).map((x) => doc_(x.document)).forEach((n) => {
      const tip = Number(n.tip) || 0; if (!tip) return;
      const o = out[n.bookingId] || (out[n.bookingId] = { sum: 0, by: {}, n: 0, added: 0 });
      o.sum += tip; o.by[n.idolId] = (o.by[n.idolId] || 0) + tip; o.n++; if (n.tipAdded) o.added++;
    });
  }
  return out;
}

function tenPromoter_(token) {
  const out = {};
  let page = "";
  do {
    const j = fs_(token, "/idolsPrivate?pageSize=300&mask.fieldPaths=stageName" + (page ? "&pageToken=" + page : ""));
    (j.documents || []).forEach((d) => { out[d.name.split("/").pop()] = val_((d.fields || {}).stageName) || ""; });
    page = j.nextPageToken || "";
  } while (page);
  return out;
}

/* thêm quyền Người xem cho các email trong XEM_CUNG, không gửi email thông báo. trả về danh sách lỗi (rỗng = ổn).
   ai đã có quyền (xem, sửa hay chủ file) thì bỏ qua, nên không bao giờ hạ hay nâng quyền của ai. */
function chiaSeXem_(fileId, name) {
  const emails = String(PropertiesService.getScriptProperties().getProperty("XEM_CUNG") || "")
    .split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!emails.length) return [];
  if (typeof Drive === "undefined" || !Drive.Permissions) return [name + ": chưa bật dịch vụ Drive API (trình soạn code → Dịch vụ + → Drive API → Thêm)"];
  const v3 = typeof Drive.Permissions.create === "function";   // dịch vụ Drive bản v3 (mặc định) hoặc v2
  let have;
  try {
    const r = v3 ? Drive.Permissions.list(fileId, { fields: "permissions(emailAddress,role)" }) : Drive.Permissions.list(fileId);
    have = ((v3 ? r.permissions : r.items) || []).map((p) => String(p.emailAddress || "").toLowerCase());
  } catch (e) { return [name + ": không đọc được danh sách chia sẻ (" + e.message + ")"]; }
  const loi = [];
  emails.forEach((e) => {
    if (have.includes(e)) { console.log(name + ": " + e + " đã có quyền, giữ nguyên"); return; }
    try {
      if (v3) Drive.Permissions.create({ role: "reader", type: "user", emailAddress: e }, fileId, { sendNotificationEmail: false });
      else Drive.Permissions.insert({ role: "reader", type: "user", value: e }, fileId, { sendNotificationEmails: false });
      console.log(name + ": đã chia sẻ quyền xem cho " + e + " (không gửi email)");
    } catch (err) { loi.push(name + " → " + e + ": " + err.message); }
  });
  return loi;
}

function thuMuc_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function fileSheet_(folder, name) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss;
}
