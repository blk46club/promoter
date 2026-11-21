#!/usr/bin/env python3
"""Xoá ghi chú trong code trước khi đưa web lên (anh Minh chọn ngày 21/11/2026).

Chạy từ thư mục gốc repo:  python3 tools/xoa-ghi-chu.py public _site

Lệnh chép thư mục nguồn sang thư mục đích rồi xoá ghi chú trong bản chép:
- file .html: ghi chú HTML, ghi chú CSS trong <style>, ghi chú JavaScript trong <script>
  (không đụng <script type="application/ld+json"> và <script src=...>);
- file .js: ghi chú JavaScript.
Chữ trong chuỗi, template `...` và biểu thức chính quy (regex) giữ nguyên từng ký tự.
Thư mục nguồn không bị sửa.

Sau khi xoá, lệnh tự kiểm và dừng với mã thoát 1 nếu có gì sai, để bước đưa web lên không chạy:
1. đọc lại bản đã xoá: không còn ghi chú, các chuỗi / template / regex giống hệt bản gốc;
2. có node thì chạy `node --check` cho từng file .js và từng <script> trong .html, cả bản gốc lẫn bản đã xoá:
   bản gốc qua mà bản đã xoá lỗi thì dừng.
   Đặt CAN_NODE=1 (GitHub Actions có sẵn node) thì thiếu node cũng dừng.
Chỉ dùng thư viện chuẩn của Python, không cài gì thêm.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# trước dấu / mà là một trong các từ hay ký tự này thì / mở đầu regex, không phải phép chia
TU_TRUOC_REGEX = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
                  "case", "do", "else", "yield", "await"}
DAU_TRUOC_REGEX = set("(,=:[!&|?{};+-*%<>~^")
CHU = re.compile(r"[A-Za-z0-9_$\u0080-\uffff]")
CHU_CSS = re.compile(r"[A-Za-z0-9_%-]")


class Loi(Exception):
    pass


def xoa_js(s):
    """Trả về (bản đã xoá, danh sách chuỗi/template/regex, số ghi chú đã xoá)."""
    out = []
    lits = []
    n_ghi_chu = 0
    i, n = 0, len(s)
    dau_dong = 0          # vị trí trong out của đầu dòng hiện tại
    truoc = ""            # từ hoặc dấu có nghĩa ngay trước (bỏ qua khoảng trắng, ghi chú)
    ngoac = 0             # số { đang mở trong code
    tang = []             # template lồng: số { lúc vào ${

    def dong_trong():
        return all(c in " \t" for c in out[dau_dong:])

    def bo_ghi_chu(co_xuong_dong, het):
        """het = vị trí ngay sau ghi chú. Trả về vị trí đọc tiếp."""
        nonlocal dau_dong
        if dong_trong():
            # ghi chú chiếm cả dòng (hoặc phần cuối dòng trống): bỏ luôn khoảng trắng đầu dòng
            j = het
            while j < n and s[j] in " \t":
                j += 1
            if j >= n or s[j] == "\n":
                del out[dau_dong:]
                return j + 1 if j < n else j
        if het >= n or s[het] == "\n":
            while out and out[-1] in " \t":
                out.pop()
        if co_xuong_dong:
            out.append("\n")
            dau_dong = len(out)
        elif out and out[-1] not in " \t\n" and het < n and s[het] not in " \t\n":
            out.append(" ")
        return het

    def doc_template(i):
        """i ở ngay sau dấu ` hoặc sau } đóng ${...}. Trả về (vị trí, đã vào ${ hay chưa)."""
        nonlocal dau_dong
        start = i
        while i < n:
            c = s[i]
            if c == "\\":
                i += 2
                continue
            if c == "`":
                lits.append(s[start:i])
                out.extend(s[start:i + 1])
                return i + 1, False
            if c == "$" and i + 1 < n and s[i + 1] == "{":
                lits.append(s[start:i])
                out.extend(s[start:i + 2])
                return i + 2, True
            i += 1
        raise Loi("template không đóng")

    while i < n:
        c = s[i]
        if c == "\n":
            out.append(c)
            dau_dong = len(out)
            i += 1
            continue
        if c in " \t\r":
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            j = n if j < 0 else j
            n_ghi_chu += 1
            i = bo_ghi_chu(False, j)
            continue
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            if j < 0:
                raise Loi("ghi chú /* không đóng")
            n_ghi_chu += 1
            i = bo_ghi_chu("\n" in s[i:j], j + 2)
            continue
        if c in "'\"":
            j = i + 1
            while j < n and s[j] != c:
                if s[j] == "\\":
                    j += 1
                elif s[j] == "\n":
                    raise Loi("chuỗi không đóng trên một dòng")
                j += 1
            if j >= n:
                raise Loi("chuỗi không đóng")
            lits.append(s[i:j + 1])
            out.extend(s[i:j + 1])
            truoc = "lit"
            i = j + 1
            continue
        if c == "`":
            out.append(c)
            i, vao = doc_template(i + 1)
            if vao:
                tang.append(ngoac)
                truoc = "{"
            else:
                truoc = "lit"
            continue
        if c == "/":
            la_regex = truoc == "" or truoc in TU_TRUOC_REGEX or (len(truoc) == 1 and truoc in DAU_TRUOC_REGEX)
            if la_regex:
                j, lop = i + 1, False
                while j < n:
                    d = s[j]
                    if d == "\\":
                        j += 2
                        continue
                    if d == "\n":
                        raise Loi("regex không đóng trên một dòng, vị trí %d" % i)
                    if d == "[":
                        lop = True
                    elif d == "]":
                        lop = False
                    elif d == "/" and not lop:
                        break
                    j += 1
                j += 1
                while j < n and s[j].isalpha():
                    j += 1
                lits.append(s[i:j])
                out.extend(s[i:j])
                truoc = "lit"
                i = j
                continue
            out.append(c)
            truoc = c
            i += 1
            continue
        if c == "{":
            ngoac += 1
            out.append(c)
            truoc = c
            i += 1
            continue
        if c == "}":
            if tang and ngoac == tang[-1]:
                tang.pop()
                out.append(c)
                i, vao = doc_template(i + 1)
                if vao:
                    tang.append(ngoac)
                    truoc = "{"
                else:
                    truoc = "lit"
                continue
            ngoac -= 1
            out.append(c)
            truoc = c
            i += 1
            continue
        if CHU.match(c):
            j = i
            while j < n and CHU.match(s[j]):
                j += 1
            truoc = s[i:j]
            out.extend(s[i:j])
            i = j
            continue
        out.append(c)
        truoc = c
        i += 1
    if tang:
        raise Loi("template ${ không đóng")
    return "".join(out), lits, n_ghi_chu


def xoa_css(s):
    out = []
    lits = []
    n_ghi_chu = 0
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c in "'\"":
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == "\\" else 1
            lits.append(s[i:j + 1])
            out.append(s[i:j + 1])
            i = j + 1
            continue
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            if j < 0:
                raise Loi("ghi chú CSS không đóng")
            n_ghi_chu += 1
            dong = "".join(out).rsplit("\n", 1)[-1]
            k = j + 2
            while k < n and s[k] in " \t":
                k += 1
            if k >= n or s[k] == "\n":
                # ghi chú ở cuối dòng: bỏ cả khoảng trắng trước nó; cả dòng chỉ có ghi chú thì bỏ cả dòng
                out = ["".join(out).rstrip(" \t")]
                i = k + 1 if dong.strip() == "" else k
                continue
            # trong CSS ghi chú không tính là khoảng trắng: ".a/**/.b" là ".a.b", nên không chèn gì.
            # riêng hai chữ dính nhau ("1px/**/2px") thì bỏ ghi chú sẽ đổi nghĩa: dừng để sửa tay.
            truoc_c = out[-1][-1:] if out else ""
            sau_c = s[j + 2:j + 3]
            if CHU_CSS.fullmatch(truoc_c) and CHU_CSS.fullmatch(sau_c):
                raise Loi("ghi chú CSS dính liền hai chữ, cần sửa tay")
            i = j + 2
            continue
        out.append(c)
        i += 1
    return "".join(out), lits, n_ghi_chu


THE = re.compile(r"<(script|style)\b([^>]*)>(.*?)</\1\s*>", re.S | re.I)
GHI_CHU_HTML = re.compile(r"^[ \t]*<!--.*?-->[ \t]*\n|<!--.*?-->", re.S | re.M)


def xoa_html(s):
    """Trả về (bản đã xoá, [(loại, gốc, đã xoá)...], số ghi chú)."""
    out, phan, dem, vt = [], [], 0, 0
    for m in THE.finditer(s):
        ngoai = s[vt:m.start()]
        dem += len(GHI_CHU_HTML.findall(ngoai))
        out.append(GHI_CHU_HTML.sub("", ngoai))
        ten, thuoc_tinh, than = m.group(1).lower(), m.group(2), m.group(3)
        if ten == "style":
            moi, _, k = xoa_css(than)
            loai = "css"
        elif "ld+json" in thuoc_tinh.lower() or "src=" in thuoc_tinh.lower():
            moi, k, loai = than, 0, "giu"
        else:
            moi, _, k = xoa_js(than)
            loai = "module" if "module" in thuoc_tinh.lower() else "script"
        dem += k
        phan.append((loai, than, moi))
        out.append(s[m.start():m.start(3)])
        out.append(moi)
        out.append(s[m.end(3):m.end()])
        vt = m.end()
    ngoai = s[vt:]
    dem += len(GHI_CHU_HTML.findall(ngoai))
    out.append(GHI_CHU_HTML.sub("", ngoai))
    return "".join(out), phan, dem


def kiem_lai(goc, moi, xoa):
    """Đọc lại bản đã xoá: không còn ghi chú, chữ trong chuỗi/template/regex không đổi, chạy lần 2 không đổi."""
    _, lit1, _ = xoa(goc)
    lai, lit2, con = xoa(moi)
    if con:
        raise Loi("bản đã xoá vẫn còn %d ghi chú" % con)
    if lit1 != lit2:
        raise Loi("chữ trong chuỗi / template / regex bị đổi")
    if lai != moi:
        raise Loi("chạy lần 2 ra kết quả khác")


def node_check(code, module):
    """True nếu node đọc được cú pháp, None nếu máy không có node."""
    node = shutil.which("node")
    if not node:
        return None
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / ("x.mjs" if module else "x.cjs")
        f.write_text(code, encoding="utf-8")
        r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True)
        return r.returncode == 0


def kiem_cu_phap(ten, goc, moi, module):
    a = node_check(goc, module)
    if a is None:
        if os.environ.get("CAN_NODE"):
            raise Loi("máy này không có node để kiểm cú pháp (CAN_NODE=1)")
        return "bỏ qua (không có node)"
    if not a:
        return "bỏ qua (bản gốc node cũng không đọc được)"
    if not node_check(moi, module):
        raise Loi(f"{ten}: bản gốc chạy được nhưng bản đã xoá lỗi cú pháp")
    return "đạt"


def so(x):
    return f"{x:,}".replace(",", ".")


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    nguon, dich = Path(argv[1]), Path(argv[2])
    if dich.exists():
        shutil.rmtree(dich)
    shutil.copytree(nguon, dich)
    tong_truoc = tong_sau = 0
    ten = ""
    try:
        for f in sorted(dich.rglob("*")):
            if f.suffix not in (".html", ".js"):
                continue
            goc = f.read_text(encoding="utf-8")
            ten = str(f.relative_to(dich))
            if f.suffix == ".js":
                moi, _, dem = xoa_js(goc)
                kiem_lai(goc, moi, xoa_js)
                module = "import " in goc or "export " in goc
                kq = kiem_cu_phap(ten, goc, moi, module)
            else:
                moi, phan, dem = xoa_html(goc)
                kq_list = []
                for loai, a, b in phan:
                    if loai == "css":
                        kiem_lai(a, b, xoa_css)
                    elif loai in ("module", "script"):
                        kiem_lai(a, b, xoa_js)
                        kq_list.append(kiem_cu_phap(ten, a, b, loai == "module"))
                kq = ", ".join(kq_list) or "không có script"
            f.write_text(moi, encoding="utf-8")
            tb, ts = len(goc.encode("utf-8")), len(moi.encode("utf-8"))
            tong_truoc += tb
            tong_sau += ts
            print(f"{ten}: bỏ {dem} ghi chú, {so(tb)} → {so(ts)} byte, cú pháp: {kq}")
    except Loi as e:
        print(f"LỖI ở {ten}: {e}. Không đưa bản này lên.")
        return 1
    print(f"tổng: {so(tong_truoc)} → {so(tong_sau)} byte")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
