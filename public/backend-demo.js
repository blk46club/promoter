// Chế độ chạy thử: không cần Firebase, không tốn tiền.
// Dữ liệu chỉ lưu trong trình duyệt đang mở (localStorage), mỗi máy một bản riêng.
// Dùng để chỉnh giao diện, đồ hoạ, tính năng trước khi nối database thật.
import { compressImage } from "./image.js";

const KEY = "blk46demo:v1";
const AUTH = "blk46demo:staff";
const subs = {};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (_) { return null; }
}
let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { const err = new Error("full"); err.code = "quota_exceeded"; throw err; }
}

// Dữ liệu mẫu: tên và số liệu là giả, chỉ để thấy bố cục. Xoá được trong trang quản lý.
function seed() {
  const now = Date.now();
  const POS = ["nhiệt tình", "nói chuyện mượt", "giữ vibe cả bàn", "thông minh, tinh ý", "nói tiếng anh tốt", "nhảy cháy"];
  const idols = {};
  const specs = [
    ["PROMOTER MẪU 01", "168", "49", "84", "60", "90", ["pha cocktail", "nhảy"], ["giữ bàn đông người"]],
    ["PROMOTER MẪU 02", "165", "47", "82", "58", "88", ["hát", "tiếng anh"], ["khách nước ngoài"]],
    ["PROMOTER MẪU 03", "170", "51", "86", "61", "91", ["nhảy", "dj cơ bản"], ["khuấy vibe cuối đêm"]],
    ["PROMOTER MẪU 04", "162", "45", "80", "57", "86", ["tiếng trung"], ["khách doanh nhân"]],
    ["PROMOTER MẪU 05", "167", "48", "83", "59", "89", ["pha shot", "game uống"], ["sinh nhật"]],
    ["PROMOTER MẪU 06", "164", "46", "81", "58", "87", ["tiếng hàn"], []],
  ];
  specs.forEach(([name, h, w, b, wa, hi, talents, forte], k) => {
    const id = "demo" + (k + 1);
    idols[id] = {
      id, stageName: name, team: "dữ liệu mẫu", height: h, weight: w, bust: b, waist: wa, hip: hi,
      talents, forte, photos: {}, show: { height: true, weight: k % 2 === 0, measurements: true },
      consent: { signed: true, adult: true, at: now }, active: true, createdAt: now, updatedAt: now,
    };
  });
  const reviews = {};
  // nhận xét mẫu, chỉ để thử giao diện
  const SAMPLE_COMMENTS = ["[nhận xét mẫu] giữ vibe cả bàn tới cuối.", "[nhận xét mẫu] nói chuyện dễ chịu, gọi đồ nhanh.", "[nhận xét mẫu] bạn nước ngoài của mình rất thích.", "[nhận xét mẫu] lần sau đặt lại."];
  let n = 0;
  const pattern = [[5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4], [5, 4, 5, 5, 4, 5, 4], [5, 5, 4, 5, 5, 5, 5, 5, 5], [4, 4, 5, 3, 4], [5, 5], []];
  pattern.forEach((stars, k) => stars.forEach((s, j) => {
    const id = "seed" + (n++);
    const comment = SAMPLE_COMMENTS[(n * 7) % SAMPLE_COMMENTS.length];
    reviews[id] = { idolId: "demo" + (k + 1), stars: s, tags: POS.filter((_, t) => ((t + 1) * (k + 2) + j) % 5 < 1 + ((t + k) % 4)), comment: j % 3 === 0 ? comment : "", createdAt: now - j * 3600e3 };
  }));
  return { idols, reviews, moderation: {}, notes: {}, bills: {}, redeemed: {}, bookings: {}, tableHolds: {}, idolLoad: {} };
}
if (!data) { data = seed(); try { save(); } catch (_) {} }

function col(name) { return (data[name] = data[name] || {}); }
function snapOf(name, filter) {
  const docs = Object.entries(col(name))
    .filter(([, d]) => !filter || filter(d))
    .map(([id, d]) => ({ id, exists: true, data: () => d }));
  return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
}
function notify(name) { (subs[name] || []).forEach((f) => f()); }

window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  data = load() || data;
  Object.keys(subs).forEach(notify);
});

function makeDb(staff) {
  const filters = { idols: staff ? null : (d) => d.consent && d.consent.signed && d.consent.adult && d.active !== false };
  const docApi = (path) => {
    const [c, id] = path.split("/");
    return {
      get: async () => { const d = col(c)[id]; return { exists: !!d, data: () => d }; },
      set: async (d) => { col(c)[id] = JSON.parse(JSON.stringify(d)); save(); notify(c); },
      update: async (d) => {
        if (!col(c)[id]) { const e = new Error("missing"); e.code = "invalid_argument"; throw e; }
        col(c)[id] = { ...col(c)[id], ...JSON.parse(JSON.stringify(d)) }; save(); notify(c);
      },
      delete: async () => { delete col(c)[id]; save(); notify(c); },
    };
  };
  return {
    collection: (name) => ({
      onSnapshot: (next) => {
        const fire = () => next(snapOf(name, filters[name]));
        (subs[name] = subs[name] || []).push(fire);
        setTimeout(fire, 0);
        return () => { subs[name] = (subs[name] || []).filter((f) => f !== fire); };
      },
    }),
    doc: docApi,
    // Bàn đã có người đặt trong một ngày (tableHolds/{ngày}_{bàn}), ai cũng xem được, không kèm tên khách.
    // Trả về { table, until, seated }: until = giờ hết giữ bàn, seated = khách đã đến (giữ luôn).
    watchHolds: (date, next) => {
      const fire = () => next(Object.values(col("tableHolds")).filter((h) => h.date === date).map((h) => ({ table: h.table, until: h.until || null, seated: !!h.seated })));
      (subs.tableHolds = subs.tableHolds || []).push(fire);
      setTimeout(fire, 0);
      return () => { subs.tableHolds = (subs.tableHolds || []).filter((f) => f !== fire); };
    },
    // Lượt mở trang theo ngày (visits/{ngày} { date, n }).
    countVisit: async (date) => { const v = col("visits"); v[date] = { date, n: ((v[date] || {}).n || 0) + 1 }; save(); notify("visits"); },
    watchVisits: (fromDate, next) => {
      const fire = () => next(Object.values(col("visits")).filter((x) => x.date >= fromDate).map((x) => ({ date: x.date, n: x.n || 0 })));
      (subs.visits = subs.visits || []).push(fire);
      setTimeout(fire, 0);
      return () => { subs.visits = (subs.visits || []).filter((f) => f !== fire); };
    },
    // Số khách đặt trước đã xác nhận theo ngày (idolLoad/{ngày}), ai cũng xem được, chỉ có con số.
    watchLoads: (fromDate, next) => {
      const fire = () => next(Object.values(col("idolLoad")).filter((x) => x.date >= fromDate).map((x) => ({ date: x.date, counts: x.counts || {} })));
      (subs.idolLoad = subs.idolLoad || []).push(fire);
      setTimeout(fire, 0);
      return () => { subs.idolLoad = (subs.idolLoad || []).filter((f) => f !== fire); };
    },
    // Khách đăng ký voucher ưu đãi hằng tuần (vouchers/{id}).
    createVoucher: async (id, v) => { col("vouchers")[id] = JSON.parse(JSON.stringify(v)); save(); notify("vouchers"); },
    // Khách gửi đặt bàn kèm bàn muốn ngồi: giữ bàn và tạo đặt bàn cùng lúc, bàn đã có người giữ thì báo "taken".
    createBooking: async (bookingId, booking, holdId, hold) => {
      // Bàn đã giữ mà quá giờ giữ (quản lý chưa xếp khách vào) thì khách sau được giữ lại.
      const old = holdId && col("tableHolds")[holdId];
      if (old && (old.seated || !old.until || old.until > Date.now())) { const e = new Error("taken"); e.code = "taken"; throw e; }
      col("bookings")[bookingId] = JSON.parse(JSON.stringify(booking));
      if (holdId) col("tableHolds")[holdId] = JSON.parse(JSON.stringify(hold));
      save(); notify("bookings"); notify("tableHolds");
    },
    submitReview: async (redeemedId, reviewId, note, review) => {
      const r = col("redeemed")[redeemedId];
      if (r && r.reviewId) { const e = new Error("used"); e.code = "used"; throw e; }
      col("notes")[reviewId] = note;
      col("reviews")[reviewId] = review;
      col("redeemed")[redeemedId] = { reviewId, at: review.createdAt };
      save(); ["notes", "reviews", "redeemed"].forEach(notify);
    },
  };
}

const staffEmail = (() => { try { return localStorage.getItem(AUTH) || ""; } catch (_) { return ""; } })();
const staff = !!staffEmail;

export const backend = {
  mode: "demo",
  // Chế độ chạy thử: email, mật khẩu nào cũng vào được trang quản lý.
  login: async (email) => { localStorage.setItem(AUTH, email || "demo@blk46"); },
  logout: async () => { localStorage.removeItem(AUTH); },
  resetDemo: () => { data = seed(); save(); Object.keys(data).forEach(notify); },
  clearDemo: () => { data = { idols: {}, reviews: {}, moderation: {}, notes: {}, bills: {}, redeemed: {}, bookings: {}, tableHolds: {}, idolLoad: {} }; save(); Object.keys(data).forEach(notify); },
};

export const claude = {
  use: async (name) => {
    if (name === "db") return makeDb(staff);
    if (name === "user") return {
      canEdit: async () => staff, can: async () => staff, isOwner: async () => staff,
      email: async () => staffEmail || null,
    };
    if (name === "assets") return staff ? {
      upload: async (file) => { const url = await compressImage(file, 640, 0.7); return { id: url, url }; },
    } : null;
    return null;
  },
};
