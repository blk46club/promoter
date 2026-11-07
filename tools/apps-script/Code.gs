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
 */

const CFG = {
  apiKey: "AIzaSyDWORkNubUiMOkk429kNSVcBBIXENRw_Tc",      // khoá web công khai (giống firebase-config.js)
  projectId: "blk46-promoter",
  referer: "https://blk46club.github.io/promoter/",       // khoá web chỉ nhận request từ trang này
  rootFolder: "BLK46 - Đặt bàn",
  runHour: 7,                                             // giờ chạy mỗi sáng (giờ Hà Nội)
  tz: "Asia/Ho_Chi_Minh",
};

const STATUS_VI = { requested: "chờ xác nhận", confirmed: "đã xác nhận", seated: "đã đến", cancelled: "đã huỷ" };
const HEADER = ["giờ đến", "danh xưng", "tên khách", "số điện thoại", "số người", "bàn", "promoter",
  "trạng thái", "mã bàn", "giữ bàn đến", "nguồn", "ghi chú", "gửi đặt lúc"];

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
  const rows = layDatBan_(token, iso).map((b) => [
    b.time || "",
    b.salutation || "",
    b.guestName || "",
    b.phone ? "'" + b.phone : "",                 // giữ số 0 đầu
    b.guests || "",
    b.table || "",
    (b.idolIds || []).map((id) => idolNames[id] || id).join(", "),
    STATUS_VI[b.status] || b.status || "",
    b.code || "",
    b.holdUntil ? Utilities.formatDate(new Date(Number(b.holdUntil)), CFG.tz, "HH:mm") : "",
    b.source === "web" ? "khách đặt trên web" : "quản lý tạo",
    b.note || "",
    b.createdAt ? Utilities.formatDate(new Date(Number(b.createdAt)), CFG.tz, "dd/MM/yyyy HH:mm") : "",
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const [y, m, dd] = iso.split("-");
  const label = dd + "-" + m + "-" + y;
  const folder = thuMuc_(thuMuc_(thuMuc_(thuMuc_(DriveApp.getRootFolder(), CFG.rootFolder), y), "Tháng " + Number(m)), label);
  const ss = fileSheet_(folder, "Đặt bàn " + label);
  const sh = ss.getSheets()[0];
  sh.clear();
  sh.setName("đặt bàn");
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
  else sh.getRange(2, 1).setValue("không có đặt bàn nào đêm này");
  const tong = rows.length, den = rows.filter((r) => r[7] === "đã đến").length, huy = rows.filter((r) => r[7] === "đã huỷ").length;
  sh.getRange(rows.length + 3, 1, 1, 2).setValues([["tổng", tong + " đơn · " + den + " đã đến · " + huy + " huỷ"]]).setFontWeight("bold");
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, HEADER.length);
  console.log("đã lưu " + tong + " đơn vào " + ss.getUrl());
}

/** Đặt lịch chạy mỗi sáng. Chạy hàm này 1 lần. */
function caiDatHangNgay() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "luuDemHomQua") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("luuDemHomQua").timeBased().everyDays(1).atHour(CFG.runHour).inTimezone(CFG.tz).create();
  console.log("đã đặt lịch mỗi ngày khoảng " + CFG.runHour + "h sáng");
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
