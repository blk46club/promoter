#!/usr/bin/env python3
"""Tạo mã QR (SVG) cho link đánh giá Google ở màn cảm ơn trên tablet.

Chạy:  python3 tools/tao-qr.py
Đọc GOOGLE_REVIEW_URL trong public/index.html, ghi public/brand/google-review-qr.svg.
Chỉ dùng thư viện chuẩn của Python, không cài gì thêm.

Theo chuẩn QR (ISO/IEC 18004): chế độ byte, mức sửa lỗi M (khôi phục ~15%),
phiên bản 1–10, tự chọn mặt nạ có điểm phạt thấp nhất, viền trắng 4 ô.
Đổi link thì chạy lại lệnh này; bước "kiem" trên GitHub báo lỗi nếu ảnh và link lệch nhau.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "public" / "index.html"
OUT = ROOT / "public" / "brand" / "google-review-qr.svg"

# ---------- bảng của chuẩn, mức M, phiên bản 1..10 ----------
EC_PER_BLOCK = [None, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
NUM_BLOCKS = [None, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
ECL_M_BITS = 0  # L=1, M=0, Q=3, H=2


def raw_modules(ver):
    n = (16 * ver + 128) * ver + 64
    if ver >= 2:
        na = ver // 7 + 2
        n -= (25 * na - 10) * na - 55
        if ver >= 7:
            n -= 36
    return n


def data_codewords(ver):
    return raw_modules(ver) // 8 - EC_PER_BLOCK[ver] * NUM_BLOCKS[ver]


def align_positions(ver):
    if ver == 1:
        return []
    na = ver // 7 + 2
    step = (ver * 4 + na * 2 + 1) // (na * 2 - 2) * 2
    size = ver * 4 + 17
    return [6] + sorted(size - 7 - i * step for i in range(na - 1))


# ---------- Reed–Solomon trên GF(256), đa thức 0x11D ----------
def gf_mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z & 0xFF


def rs_divisor(degree):
    res = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            res[j] = gf_mul(res[j], root)
            if j + 1 < degree:
                res[j] ^= res[j + 1]
        root = gf_mul(root, 2)
    return res


def rs_remainder(data, divisor):
    res = [0] * len(divisor)
    for b in data:
        f = b ^ res.pop(0)
        res.append(0)
        for i, c in enumerate(divisor):
            res[i] ^= gf_mul(c, f)
    return res


# ---------- dữ liệu ----------
def encode_codewords(text):
    payload = text.encode("utf-8")
    for ver in range(1, 11):
        cap = data_codewords(ver) * 8
        cc_bits = 8 if ver <= 9 else 16
        if 4 + cc_bits + 8 * len(payload) <= cap:
            break
    else:
        sys.exit("link quá dài cho mã QR phiên bản 10")
    bits = []

    def put(val, n):
        bits.extend((val >> i) & 1 for i in range(n - 1, -1, -1))

    put(0b0100, 4)
    put(len(payload), cc_bits)
    for b in payload:
        put(b, 8)
    put(0, min(4, cap - len(bits)))
    put(0, (-len(bits)) % 8)
    pad = 0xEC
    while len(bits) < cap:
        put(pad, 8)
        pad ^= 0xEC ^ 0x11
    data = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]

    nb, ecl = NUM_BLOCKS[ver], EC_PER_BLOCK[ver]
    raw = raw_modules(ver) // 8
    n_short = nb - raw % nb
    short_len = raw // nb
    div = rs_divisor(ecl)
    blocks, k = [], 0
    for i in range(nb):
        dlen = short_len - ecl + (0 if i < n_short else 1)
        d = data[k:k + dlen]
        k += dlen
        blocks.append((d, rs_remainder(d, div)))
    out = []
    for i in range(max(len(d) for d, _ in blocks)):
        out += [d[i] for d, _ in blocks if i < len(d)]
    for i in range(ecl):
        out += [e[i] for _, e in blocks]
    assert len(out) == raw
    return ver, out


# ---------- ma trận ----------
def build(text):
    ver, cw = encode_codewords(text)
    size = ver * 4 + 17
    m = [[False] * size for _ in range(size)]  # m[y][x], y = hàng, x = cột
    fn = [[False] * size for _ in range(size)]

    def setf(x, y, dark):
        m[y][x] = dark
        fn[y][x] = True

    for i in range(size):  # vạch thời gian
        setf(6, i, i % 2 == 0)
        setf(i, 6, i % 2 == 0)
    for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4)):  # 3 ô định vị + viền tách
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < size and 0 <= y < size:
                    d = max(abs(dx), abs(dy))
                    setf(x, y, d not in (2, 4))
    al = align_positions(ver)  # ô căn chỉnh
    for i, a in enumerate(al):
        for j, b in enumerate(al):
            if (i == 0 and j == 0) or (i == 0 and j == len(al) - 1) or (i == len(al) - 1 and j == 0):
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    setf(a + dx, b + dy, max(abs(dx), abs(dy)) != 1)
    draw_format(m, fn, size, 0, setf)  # giữ chỗ
    if ver >= 7:
        rem = ver
        for _ in range(12):
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
        vbits = ver << 12 | rem
        for i in range(18):
            bit = (vbits >> i) & 1 == 1
            a, b = size - 11 + i % 3, i // 3
            setf(a, b, bit)
            setf(b, a, bit)

    # xếp dữ liệu theo đường zic-zắc
    i, right = 0, size - 1
    while right >= 1:
        if right == 6:
            right = 5
        for vert in range(size):
            for j in range(2):
                x = right - j
                upward = ((right + 1) & 2) == 0
                y = size - 1 - vert if upward else vert
                if not fn[y][x] and i < len(cw) * 8:
                    m[y][x] = (cw[i >> 3] >> (7 - (i & 7))) & 1 == 1
                    i += 1
        right -= 2
    assert i == len(cw) * 8

    best = None
    for mask in range(8):
        t = [row[:] for row in m]
        apply_mask(t, fn, size, mask)
        draw_format(t, fn, size, mask, lambda x, y, d: t[y].__setitem__(x, d))
        p = penalty(t, size)
        if best is None or p < best[0]:
            best = (p, mask, t)
    return ver, best[1], best[2]


def format_bits(mask):
    data = ECL_M_BITS << 3 | mask
    rem = data
    for _ in range(10):
        rem = (rem << 1) ^ ((rem >> 9) * 0x537)
    return (data << 10 | rem) ^ 0x5412


def draw_format(m, fn, size, mask, setf):
    bits = format_bits(mask)
    g = lambda i: (bits >> i) & 1 == 1
    for i in range(6):
        setf(8, i, g(i))
    setf(8, 7, g(6))
    setf(8, 8, g(7))
    setf(7, 8, g(8))
    for i in range(9, 15):
        setf(14 - i, 8, g(i))
    for i in range(8):
        setf(size - 1 - i, 8, g(i))
    for i in range(8, 15):
        setf(8, size - 15 + i, g(i))
    setf(8, size - 8, True)  # ô tối cố định


MASKS = [
    lambda x, y: (x + y) % 2 == 0,
    lambda x, y: y % 2 == 0,
    lambda x, y: x % 3 == 0,
    lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0,
    lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
    lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
]


def apply_mask(m, fn, size, mask):
    f = MASKS[mask]
    for y in range(size):
        for x in range(size):
            if not fn[y][x] and f(x, y):
                m[y][x] = not m[y][x]


def penalty(m, size):
    p = 0
    lines = [m[y] for y in range(size)] + [[m[y][x] for y in range(size)] for x in range(size)]
    for line in lines:  # luật 1: chuỗi ≥5 ô cùng màu; luật 3: mẫu giống ô định vị
        run, prev = 0, None
        for v in line:
            if v == prev:
                run += 1
            else:
                if run >= 5:
                    p += 3 + run - 5
                run, prev = 1, v
        if run >= 5:
            p += 3 + run - 5
        s = [False] * 4 + list(line) + [False] * 4
        for k in range(len(s) - 6):
            if s[k:k + 7] == [True, False, True, True, True, False, True]:
                before = s[max(0, k - 4):k]
                after = s[k + 7:k + 11]
                if (len(before) == 4 and not any(before)) or (len(after) == 4 and not any(after)):
                    p += 40
    for y in range(size - 1):  # luật 2: khối 2x2 cùng màu
        for x in range(size - 1):
            if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                p += 3
    dark = sum(map(sum, m))  # luật 4: tỉ lệ ô tối
    total = size * size
    k = (abs(dark * 20 - total * 10) + total - 1) // total - 1
    p += max(0, k) * 10
    return p


def svg(m, url, border=4):
    size = len(m)
    dim = size + 2 * border
    parts = []
    for y in range(size):  # gộp các ô tối liền nhau trên một hàng thành một vạch
        x = 0
        while x < size:
            if m[y][x]:
                n = 1
                while x + n < size and m[y][x + n]:
                    n += 1
                parts.append(f"M{x + border} {y + border}h{n}v1h-{n}z")
                x += n
            else:
                x += 1
    path = "".join(parts)
    esc = url.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {dim} {dim}" '
        f'shape-rendering="crispEdges" data-url="{esc}">'
        f'<rect width="{dim}" height="{dim}" fill="#fff"/><path d="{path}" fill="#000"/></svg>\n'
    )


def main():
    html = HTML.read_text(encoding="utf-8")
    hit = re.search(r'const GOOGLE_REVIEW_URL="([^"]*)"', html)
    if not hit:
        sys.exit("không thấy GOOGLE_REVIEW_URL trong public/index.html")
    url = hit.group(1)
    if not url:
        sys.exit("GOOGLE_REVIEW_URL đang để trống: điền link trước rồi chạy lại")
    ver, mask, m = build(url)
    OUT.write_text(svg(m, url), encoding="utf-8")
    print(f"đã ghi {OUT.relative_to(ROOT)}: phiên bản {ver}, mặt nạ {mask}, {len(m)}x{len(m)} ô, link {url}")


if __name__ == "__main__":
    main()
