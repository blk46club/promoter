// Dán khối firebaseConfig từ Firebase console > Project settings > Your apps > Web app.
// Các giá trị này không phải mật khẩu: chúng luôn nằm công khai trong mọi web dùng Firebase.
// Bảo mật dữ liệu nằm ở firestore.rules và storage.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDWORkNubUiMOkk429kNSVcBBIXENRw_Tc",
  authDomain: "blk46-promoter.firebaseapp.com",
  projectId: "blk46-promoter",
  storageBucket: "blk46-promoter.firebasestorage.app",
  messagingSenderId: "919107563680",
  appId: "1:919107563680:web:8792ca6013ec8352c399c5",
  // Khoá reCAPTCHA Enterprise cho App Check (công khai, không phải mật khẩu). Để trống = tắt App Check.
  appCheckKey: "",
};
