// Lớp dữ liệu Firebase cho web idol BLK46.
// Giữ đúng hình dạng API mà index.html đang dùng (db / user / assets),
// để giao diện không phải viết lại khi đổi backend.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, query, where, onSnapshot, getDoc, setDoc, updateDoc,
  deleteDoc, runTransaction, writeBatch, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { compressImage } from "./image.js";

const app = initializeApp(firebaseConfig);
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

// Hồ sơ idol tách 2 nơi:
//  - idolsPrivate/{id}: đủ mọi trường, chỉ quản lý đọc.
//  - idols/{id}: chỉ những trường idol đã đồng ý hiển thị, khách đọc được khi public == true.
function publicIdol(body) {
  const sh = body.show || {};
  const isPublic = !!(body.consent && body.consent.signed && body.consent.adult && body.active !== false);
  const out = {
    stageName: body.stageName || "", team: body.team || "", photos: body.photos || {},
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
          const b = writeBatch(fs);
          b.set(doc(fs, "idolsPrivate/" + id), body);
          b.set(doc(fs, "idols/" + id), publicIdol(body));
          await b.commit();
        },
        delete: async () => {
          const b = writeBatch(fs);
          b.delete(doc(fs, "idolsPrivate/" + id));
          b.delete(doc(fs, "idols/" + id));
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
