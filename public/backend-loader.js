// Chọn nơi lưu dữ liệu:
//  - firebase-config.js còn "REPLACE_ME" → chế độ chạy thử (localStorage, miễn phí, mỗi máy một bản).
//  - đã dán config Firebase thật → dữ liệu dùng chung qua Firestore.
// Thêm ?demo=1 vào link để ép chế độ chạy thử kể cả khi đã có Firebase.
import { firebaseConfig } from "./firebase-config.js";

const forceDemo = new URLSearchParams(location.search).has("demo");
const isDemo = forceDemo || !firebaseConfig.apiKey || firebaseConfig.apiKey === "REPLACE_ME";
const mod = isDemo ? await import("./backend-demo.js") : await import("./backend.js");

export const claude = mod.claude;
export const backend = mod.backend;
