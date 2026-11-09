// Nén ảnh ngay trên trình duyệt trước khi lưu, để chạy được trên gói miễn phí
// (ảnh nằm thẳng trong database, không cần Firebase Storage).
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Object.assign(new Error("bad image"), { code: "type_not_allowed" }));
    i.src = src;
  });
}
function toJpeg(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}
export async function compressImage(file, maxSide = 720, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    return toJpeg(await loadImg(url), maxSide, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
// Ảnh nhỏ cho ô promoter trên lineup và trang đặt bàn, làm từ ảnh đã lưu (data: URL).
export async function shrinkSrc(src, maxSide = 320, quality = 0.7) {
  return toJpeg(await loadImg(src), maxSide, quality);
}
