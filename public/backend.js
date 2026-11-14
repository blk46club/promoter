// Lớp dữ liệu Firebase cho web idol BLK46.
// Giữ đúng hình dạng API mà index.html đang dùng (db / user / assets),
// để giao diện không phải viết lại khi đổi backend.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, query, where, onSnapshot, getDoc, setDoc, updateDoc,
  deleteDoc, runTransaction, writeBatch, connectFirestoreEmulator, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { compressImage, shrinkSrc } from "./image.js";

const app = initializeApp(firebaseConfig);
// App Check (chống bot gửi đặt bàn hàng loạt): chỉ bật khi firebase-config.js có appCheckKey (khoá reCAPTCHA Enterprise).
// Nạp lỗi (trình chặn quảng cáo, mạng chập) thì web vẫn chạy bình thường. Chỉ khi bấm "Enforce" trong Firebase
// thì request không có token mới bị chặn, nên xem số liệu App Check vài ngày rồi hãy Enforce.
if (firebaseConfig.appCheckKey && location.hostname !== "localhost") {
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } =
      await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js");
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(firebaseConfig.appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) { console.warn("App Check chưa bật được", e); }
}
const fs = getFirestore(app);
const auth = getAuth(app);
const storage = firebaseConfig.useStorage ? getStorage(app) : null;

// Chạy thử trên máy với Firebase Emulator: mở http://localhost:5000/?emu=1
if (location.hostname === "localhost" && new URLSearchParams(location.search).has("emu")) {
  connectFirestoreEmulator(fs, "127.0.0.1", 8085);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// Danh sách email quản lý nằm ở Firestore: config/staff { emails: [...] }.
// Luật bảo mật (firestore.rules) kiểm tra lại phía server, phía client chỉ để ẩn/hiện giao diện.
const authReady = new Promise((resolve) => {
  const off = onAuthStateChanged(auth, async (u) => {
    off();
    let staff = false;
    if (u && u.email) {
      try {
        const s = await getDoc(doc(fs, "config/staff"));
        const emails = (s.exists() && s.data().emails) || [];
        staff = emails.map((e) => String(e).toLowerCase()).includes(u.email.toLowerCase());
      } catch (_) { staff = false; }
    }
    resolve({ user: u, staff });
  });
});

// Hồ sơ idol tách 3 nơi:
//  - idolsPrivate/{id}: đủ mọi trường + ảnh gốc, chỉ quản lý đọc.
//  - idols/{id}: chỉ những trường idol đã đồng ý hiển thị + 1 ảnh nhỏ (thumb), khách đọc được khi public == true.
//    Mỗi lượt mở lineup tải hết các doc này, nên không để ảnh to ở đây (anh Minh 09/11: ảnh nhỏ trước, ảnh to sau).
//  - idolPhotos/{id}: ảnh to cho hồ sơ trên lineup (main = toàn thân, alt = nghiêng, close = cận),
//    chỉ tải khi khách chọn promoter đó.
export const THUMB_V = 3; // tăng số này khi đổi cách làm ảnh nhỏ hoặc hồ sơ công khai, máy quản lý sẽ tự lưu lại
// v3 (13/11): idolPhotos thêm close = ảnh cận cỡ to, vì hồ sơ giờ hiện từng ảnh một, khung to, ảnh nhỏ 320px bị mờ
// v2 (09/11): thêm ang = các góc ảnh hồ sơ có (c cận, f toàn thân, s nghiêng) để tờ hồ sơ trên lineup ghi đúng tên góc
const THUMB_SIDE = 320, THUMB_Q = 0.7;
const coverOf = (p) => p.close || p.full || p.side || "";
const spotOf = (p) => { const main = p.full || p.close || p.side || ""; return { main, alt: p.side && p.side !== main ? p.side : "", close: p.close && p.close !== main ? p.close : "" }; };
async function thumbOf(src) {
  if (!src || !src.startsWith("data:")) return src || ""; // ảnh trên Storage: dùng luôn link (Storage tính dung lượng riêng)
  try { return await shrinkSrc(src, THUMB_SIDE, THUMB_Q); } catch (_) { return src; }
}
const angOf = (p) => ["close", "full", "side"].filter((k) => p[k]).map((k) => k[0]).join("");
function publicIdol(body, thumb, hasSpot) {
  const sh = body.show || {};
  const isPublic = !!(body.consent && body.consent.signed && body.consent.adult && body.active !== false);
  const out = {
    stageName: body.stageName || "", team: body.team || "", thumb: thumb || "", hasSpot: !!hasSpot, ang: angOf(body.photos || {}),
    talents: body.talents || [], forte: body.forte || [], show: sh,
    active: body.active !== false, public: isPublic, updatedAt: Date.now(),
  };
  if (sh.height) out.height = body.height || "";
  if (sh.weight) out.weight = body.weight || "";
  if (sh.measurements) { out.bust = body.bust || ""; out.waist = body.waist || ""; out.hip = body.hip || ""; }
  return out;
}

const wrapSnap = (snap) => ({
  docs: snap.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data() })),
  metadata: { fromCache: snap.metadata.fromCache },
});

function makeDb(staff) {
  const colRef = (name) => {
    if (name === "idols") {
      return staff ? collection(fs, "idolsPrivate") : query(collection(fs, "idols"), where("public", "==", true));
    }
    return collection(fs, name);
  };
  const docApi = (path) => {
    const [c, id] = path.split("/");
    if (c === "idols") {
      return {
        get: async () => { const s = await getDoc(doc(fs, (staff ? "idolsPrivate/" : "idols/") + id)); return { exists: s.exists(), data: () => s.data() }; },
        set: async (body) => {
          const p = body.photos || {};
          const thumb = await thumbOf(coverOf(p));
          const sp = spotOf(p);
          const pub = publicIdol(body, thumb, !!sp.main);
          const b = writeBatch(fs);
          b.set(doc(fs, "idolsPrivate/" + id), { ...body, thumb, thumbV: THUMB_V });
          b.set(doc(fs, "idols/" + id), pub);
          if (sp.main) b.set(doc(fs, "idolPhotos/" + id), { public: pub.public, main: sp.main, alt: sp.alt, close: sp.close, updatedAt: Date.now() });
          else b.delete(doc(fs, "idolPhotos/" + id));
          await b.commit();
        },
        delete: async () => {
          const b = writeBatch(fs);
          b.delete(doc(fs, "idolsPrivate/" + id));
          b.delete(doc(fs, "idols/" + id));
          b.delete(doc(fs, "idolPhotos/" + id));
          await b.commit();
        },
      };
    }
    const r = doc(fs, path);
    return {
      get: async () => { const s = await getDoc(r); return { exists: s.exists(), data: () => s.data() }; },
      set: (d) => setDoc(r, d),
      update: (d) => updateDoc(r, d),
      delete: () => deleteDoc(r),
    };
  };
  return {
    collection: (name) => ({
      onSnapshot: (next, err) => onSnapshot(colRef(name), (s) => next(wrapSnap(s)), err),
    }),
    doc: docApi,
    // Ảnh to của một promoter cho khung lớn trên lineup: chỉ gọi khi khách chọn người đó.
    getSpot: async (id) => { const s = await getDoc(doc(fs, "idolPhotos/" + id)); return s.exists() ? s.data() : null; },
    thumbV: THUMB_V,
    // Bàn đã có người đặt trong một ngày (tableHolds/{ngày}_{bàn}): công khai, chỉ có ngày + số bàn.
    watchHolds: (date, next, err) => onSnapshot(
      query(collection(fs, "tableHolds"), where("date", "==", date)),
      (s) => next(s.docs.map((d) => { const h = d.data(); return { table: h.table, until: h.until || null, seated: !!h.seated }; })), err),
    // Lượt mở trang theo ngày (visits/{ngày} { date, n }): khách chỉ được cộng 1, chỉ quản lý đọc.
    countVisit: (date) => setDoc(doc(fs, "visits/" + date), { date, n: increment(1) }, { merge: true }),
    watchVisits: (fromDate, next, err) => onSnapshot(
      query(collection(fs, "visits"), where("date", ">=", fromDate)),
      (s) => next(s.docs.map((d) => { const x = d.data(); return { date: x.date, n: x.n || 0 }; })), err),
    // Phễu đặt bàn theo nguồn (funnel/{ngày}_{nguồn} { date, src, <bước>: số }): khách chỉ được cộng 1 vào một bước; script Google đọc để làm báo cáo tuần.
    countStep: (date, src, step) => setDoc(doc(fs, "funnel/" + date + "_" + src), { date, src, [step]: increment(1) }, { merge: true }),
    // Số khách đặt trước đã xác nhận theo ngày (idolLoad/{ngày}): công khai, chỉ có con số theo promoter.
    watchLoads: (fromDate, next, err) => onSnapshot(
      query(collection(fs, "idolLoad"), where("date", ">=", fromDate)),
      (s) => next(s.docs.map((d) => { const x = d.data(); return { date: x.date, counts: x.counts || {} }; })), err),
    // Khách đăng ký voucher ưu đãi hằng tuần (vouchers/{id}): khách chỉ được tạo, chỉ quản lý đọc.
    createVoucher: (id, v) => setDoc(doc(fs, "vouchers/" + id), v),
    // Khách gửi đặt bàn kèm bàn muốn ngồi: ghi đặt bàn + giữ bàn trong một lần.
    // Luật bảo mật chặn giữ trùng: khách chỉ ghi đè được bàn đã quá giờ giữ mà chưa xếp khách vào.
    createBooking: async (bookingId, booking, holdId, hold) => {
      if (!holdId) return setDoc(doc(fs, "bookings/" + bookingId), booking);
      const hr = doc(fs, "tableHolds/" + holdId);
      const taken = () => { const e = new Error("taken"); e.code = "taken"; return e; };
      const active = (snap) => { if (!snap || !snap.exists()) return false; const h = snap.data(); return !!(h.seated || !h.until || h.until > Date.now()); };
      if (active(await getDoc(hr))) throw taken();
      const b = writeBatch(fs);
      b.set(doc(fs, "bookings/" + bookingId), booking);
      b.set(hr, hold);
      try { await b.commit(); }
      catch (e) { const cur = await getDoc(hr).catch(() => null); if (cur && cur.exists() && cur.data().bookingId !== bookingId) throw taken(); throw e; }
    },
    // Gửi một lượt đánh giá: khoá mã bàn + idol, ghi lời nhắn và điểm trong cùng một giao dịch.
    submitReview: (redeemedId, reviewId, note, review) => runTransaction(fs, async (tx) => {
      const red = doc(fs, "redeemed/" + redeemedId);
      const cur = await tx.get(red);
      if (cur.exists() && cur.data().reviewId) { const e = new Error("used"); e.code = "used"; throw e; }
      tx.set(doc(fs, "notes/" + reviewId), note);
      tx.set(doc(fs, "reviews/" + reviewId), review);
      tx.set(red, { reviewId, at: review.createdAt });
    }),
  };
}

function makeAssets() {
  return {
    upload: async (file) => {
      // Gói miễn phí (Spark): nén ảnh và lưu thẳng trong Firestore.
      // Khi đã bật Blaze + Storage, đặt useStorage: true trong firebase-config.js.
      if (!firebaseConfig.useStorage) {
        const url = await compressImage(file, 640, 0.7);
        return { id: url, url };
      }
      const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().toLowerCase() : "jpg";
      const path = "idols/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      const r = ref(storage, path);
      await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
      const url = await getDownloadURL(r);
      return { id: url, url };
    },
  };
}

export const backend = {
  mode: "firebase",
  ready: authReady,
  login: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
  logout: () => signOut(auth),
};

export const claude = {
  use: async (name) => {
    const { user, staff } = await authReady;
    if (name === "db") return makeDb(staff);
    if (name === "user") return {
      canEdit: async () => staff,
      can: async () => staff,
      isOwner: async () => staff,
      email: async () => (user && user.email) || null,
    };
    if (name === "assets") return staff ? makeAssets() : null;
    return null;
  },
};
