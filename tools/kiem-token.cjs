#!/usr/bin/env node
// Kiểm bộ thiết kế dùng chung (docs/bo-thiet-ke.md): CSS ngoài :root không được gõ mã màu,
// và số chỗ còn gõ cỡ chữ px ngoài thang không được tăng thêm.
// Chạy: node tools/kiem-token.cjs   (không cần cài gì)
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "public", "index.html");
// từ 10/11/2026 mọi cỡ chữ px đều lấy từ thang (--fs-*, --fs-d-*). tiêu đề lớn dùng clamp().
const FS_LEFT_MAX = 0;

const html = fs.readFileSync(FILE, "utf8");
const a = html.indexOf("<style>"), b = html.indexOf("</style>");
const css = html.slice(a, b);
const r0 = css.indexOf(":root{"), r1 = css.indexOf("}", r0);
const root = css.slice(r0, r1);
const lineOf = i => html.slice(0, a + i).split("\n").length;
const errs = [];

// 1. mã màu ngoài :root (bỏ qua ảnh nhiễu svg nhúng)
const body = css.slice(0, r0) + " ".repeat(r1 - r0) + css.slice(r1);
const masked = body.replace(/url\("data:[^"]*"\)/g, m => " ".repeat(m.length));
for (const m of masked.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g))
  errs.push(`dòng ${lineOf(m.index)}: mã màu ${m[0]} gõ thẳng. dùng var(--…) trong :root, thiếu màu thì thêm token mới vào :root`);

// 2. mã màu trong JS (style gắn vào thẻ)
const js = html.slice(b);
for (const m of js.matchAll(/["'`]#[0-9a-fA-F]{3,6}["'`]/g))
  errs.push(`dòng ${html.slice(0, b + m.index).split("\n").length}: mã màu ${m[0]} trong JS. dùng "var(--…)"`);

// 3. token dùng mà chưa khai báo
const defined = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]); // biến cục bộ (vd --n)
for (const m of html.matchAll(/--[\w-]+(?=\s*:)/g)) defined.add(m[0]);
for (const m of html.matchAll(/var\((--[\w-]+)/g))
  if (!defined.has(m[1])) errs.push(`var(${m[1]}) chưa có trong :root`);

// 4. cỡ chữ px ngoài thang
const left = [...css.matchAll(/font-size:\d+px/g)].length;
if (left > FS_LEFT_MAX) errs.push(`có ${left} chỗ gõ cỡ chữ px ngoài thang (tối đa ${FS_LEFT_MAX}). dùng var(--fs-…)`);

// 5. mã QR đánh giá Google phải khớp link trong GOOGLE_REVIEW_URL (tạo lại: python3 tools/tao-qr.py)
const gq = html.match(/const GOOGLE_REVIEW_URL="([^"]*)",GOOGLE_REVIEW_QR="([^"]*)"/);
if (gq && gq[1]) {
  const svgFile = path.join(__dirname, "..", "public", gq[2]);
  const svg = fs.existsSync(svgFile) ? fs.readFileSync(svgFile, "utf8") : "";
  const u = (svg.match(/data-url="([^"]*)"/) || [])[1];
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  if (!svg) errs.push(`thiếu ảnh ${gq[2]}. chạy: python3 tools/tao-qr.py`);
  else if (!u || unesc(u) !== gq[1]) errs.push(`ảnh ${gq[2]} không khớp GOOGLE_REVIEW_URL. chạy: python3 tools/tao-qr.py`);
}

if (errs.length) { console.error("Lệch bộ thiết kế:\n- " + [...new Set(errs)].join("\n- ")); process.exit(1); }
console.log(`ổn: không có mã màu gõ thẳng, ${defined.size} biến, ${left}/${FS_LEFT_MAX} chỗ cỡ chữ ngoài thang.`);
