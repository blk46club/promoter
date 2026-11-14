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

// các bước khách đi qua trên web (giống tab "nguồn khách" trong trang quản lý)
const FX_STEPS = [["mo", "mở web"], ["form", "mở form đặt bàn"], ["dien", "bắt đầu điền"], ["gui", "bấm gửi"], ["xong", "gửi xong"], ["goi", "bấm gọi hotline"], ["vform", "mở form voucher"], ["vc", "nhận voucher"]];
const FX_ERRS = [["e_dx", "quên chọn Mr/Miss"], ["e_ngay", "ngày sai hoặc đã qua"], ["e_gio", "giờ sai hoặc đã qua"], ["e_sdt", "số điện thoại sai"], ["e_ban", "bàn vừa có người"], ["e_full", "promoter đã kín"], ["e_mang", "lỗi mạng, chưa gửi được"]];
const SRC_NAMES = { "fb": "facebook (không gắn mã)", "ig": "instagram (không gắn mã)", "tiktok": "tiktok (không gắn mã)", "zalo": "zalo", "google": "google",
  "threads": "threads (không gắn mã)",
  "fb-ads": "quảng cáo facebook vào web", "ig-ads": "quảng cáo instagram vào web", "mess-fb": "quảng cáo tin nhắn facebook", "mess-ig": "quảng cáo tin nhắn instagram",
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
