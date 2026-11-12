#!/usr/bin/env python3
"""Kiểm tra web promoter đã chạm, hoặc sắp chạm, hạn mức miễn phí Firebase (gói Spark) chưa.

Chạy từ thư mục gốc repo:  python3 tools/kiem-han-muc.py

Lệnh này chỉ ĐỌC. Nó gửi 3 truy vấn runQuery và 1 lệnh GET tới Firestore, không ghi, không xoá gì.
Nó không đăng nhập, nên chỉ đọc được đúng những gì trang web công khai vẫn đọc: idols, idolPhotos,
reviews, visits. Mỗi lần chạy tốn khoảng (số promoter + số ảnh to + 1 + số ngày trong tháng) lượt đọc,
rất nhỏ so với 50.000 lượt mỗi ngày của gói miễn phí.

Đây là lệnh của việc kiểm tra mỗi tối (22:47 giờ Hà Nội). Dòng cho phép trong .claude/settings.json
chỉ khớp đúng lệnh trên, nên khi chạy thật thì đừng thêm tham số.
Thử phần tính toán mà không gọi mạng:  python3 tools/kiem-han-muc.py --tu-thu-muc <thư mục>
(thư mục chứa idols.json, idolPhotos.json, reviews.json, visits.json và ma.json = {tên: mã http}).

Mã thoát: 0 bình thường, 2 hết hạn mức, 3 luật Firestore trên Firebase đang cũ, 1 lỗi khác.
Chỉ dùng thư viện chuẩn của Python và lệnh curl có sẵn, không cài gì thêm.
"""
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "public" / "firebase-config.js"
# Địa chỉ web hiện tại. Khoá API chỉ nhận yêu cầu từ địa chỉ này. Chuyển sang tên miền mới thì sửa ở đây.
REFERER = "https://blk46club.github.io/promoter/"
HAN_MUC_GB = 10    # dữ liệu tải ra mỗi tháng của gói Spark
CANH_BAO_GB = 5    # nhắc một lần khi ước tính chạm mốc này, sau đó mỗi 2 GB
VN = timezone(timedelta(hours=7))  # giờ Hà Nội, không có giờ mùa hè
TEN = ("idols", "idolPhotos", "reviews", "visits")


def doc_cau_hinh():
    js = CONFIG.read_text(encoding="utf-8")
    key = re.search(r'apiKey:\s*"([^"]+)"', js)
    pid = re.search(r'projectId:\s*"([^"]+)"', js)
    if not key or not pid:
        sys.exit("không đọc được apiKey hoặc projectId trong public/firebase-config.js")
    return key.group(1), pid.group(1)


def truy_van(tap, truong, phep, gia_tri):
    return {"structuredQuery": {
        "from": [{"collectionId": tap}],
        "where": {"fieldFilter": {"field": {"fieldPath": truong}, "op": phep, "value": gia_tri}},
    }}


def goi(url, file, body=None):
    """Gọi bằng curl, ghi nội dung ra file, trả về mã http ("000" khi lỗi mạng)."""
    cmd = ["curl", "-sS", "--max-time", "30", "-o", str(file), "-w", "%{http_code}",
           "-H", f"Referer: {REFERER}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-X", "POST", "--data-binary", json.dumps(body)]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout.strip() or "000"


def tai_ve(thu_muc, dau_thang):
    key, pid = doc_cau_hinh()
    base = f"https://firestore.googleapis.com/v1/projects/{pid}/databases/(default)/documents"
    rq = f"{base}:runQuery?key={key}"
    cong_khai = {"booleanValue": True}
    ma = {
        "idols": goi(rq, thu_muc / "idols.json", truy_van("idols", "public", "EQUAL", cong_khai)),
        "idolPhotos": goi(rq, thu_muc / "idolPhotos.json", truy_van("idolPhotos", "public", "EQUAL", cong_khai)),
        "reviews": goi(f"{base}/reviews?pageSize=1&key={key}", thu_muc / "reviews.json"),
        "visits": goi(rq, thu_muc / "visits.json",
                      truy_van("visits", "date", "GREATER_THAN_OR_EQUAL", {"stringValue": dau_thang})),
    }
    (thu_muc / "ma.json").write_text(json.dumps(ma), encoding="utf-8")


def so(v):
    v = v or {}
    for k in ("integerValue", "doubleValue"):
        if k in v:
            return float(v[k])
    return 0.0


def cac_doc(noi_dung):
    try:
        data = json.loads(noi_dung)
    except ValueError:
        return []
    if isinstance(data, list):
        return [x["document"] for x in data if isinstance(x, dict) and "document" in x]
    return []


def gb(b):
    if b < 1e9:
        return f"{b / 1e6:.0f} MB"
    return f"{b / 1e9:.2f}".replace(".", ",") + " GB"


def ngan(n):
    return f"{int(round(n)):,}".replace(",", ".")


def phan_tich(thu_muc, hom_nay, dau_thang):
    ma = json.loads((thu_muc / "ma.json").read_text(encoding="utf-8"))
    raw = {}
    for t in TEN:
        f = thu_muc / f"{t}.json"
        raw[t] = f.read_bytes() if f.exists() else b""
    txt = {t: raw[t].decode("utf-8", "replace") for t in TEN}

    def het_han_muc(t):
        if ma[t] == "200":
            return False
        return ma[t] == "429" or "RESOURCE_EXHAUSTED" in txt[t] or "quota" in txt[t].lower()

    het = [t for t in ("idols", "idolPhotos", "reviews") if het_han_muc(t)]
    luat_cu = [t for t in ("idolPhotos", "visits") if ma[t] == "403"]
    loi = [t for t in TEN if ma[t] != "200" and t not in het and t not in luat_cu]

    idols = cac_doc(txt["idols"])
    anh = cac_doc(txt["idolPhotos"])
    tb_anh = len(raw["idolPhotos"]) / len(anh) if anh else 0
    ngay = {}
    for d in cac_doc(txt["visits"]):
        f = d.get("fields", {})
        ngay[(f.get("date") or {}).get("stringValue", "")] = so(f.get("n"))
    tong = sum(ngay.values())
    uoc_tinh = tong * (len(raw["idols"]) + tb_anh + 600) * 1.1

    if het:
        ket_qua, thoat = "het-han-muc", 2
    elif luat_cu:
        ket_qua, thoat = "luat-cu", 3
    elif loi:
        ket_qua, thoat = "loi", 1
    else:
        ket_qua, thoat = "binh-thuong", 0

    print(f"KẾT QUẢ: {ket_qua}")
    if het:
        print("hết hạn mức ở: " + ", ".join(f"{t} (mã {ma[t]})" for t in het))
    if luat_cu:
        print("bị chặn đọc (luật cũ) ở: " + ", ".join(luat_cu))
    if loi:
        print("lỗi khác ở: " + ", ".join(f"{t} (mã {ma[t]})" for t in loi))
    print(f"idols: mã {ma['idols']}, {len(idols)} hồ sơ, {ngan(len(raw['idols']))} byte")
    print(f"idolPhotos: mã {ma['idolPhotos']}, {len(anh)} doc ảnh to, trung bình {ngan(tb_anh)} byte mỗi doc")
    print(f"reviews: mã {ma['reviews']}")
    print(f"visits: mã {ma['visits']}, từ {dau_thang}: {ngan(tong)} lượt mở, "
          f"hôm nay {hom_nay}: {ngan(ngay.get(hom_nay, 0))}")
    print(f"ước tính dữ liệu tải ra tháng này: {gb(uoc_tinh)} trên {HAN_MUC_GB} GB "
          "(ước tính, thấp hơn thật: khách xem nhiều promoter thì tải thêm ảnh to)")
    if uoc_tinh >= CANH_BAO_GB * 1e9:
        moc = CANH_BAO_GB + 2 * int((uoc_tinh / 1e9 - CANH_BAO_GB) // 2)
        print(f"CẢNH BÁO: đã qua mốc {moc} GB")
    return thoat


def main():
    now = datetime.now(VN)
    hom_nay = now.strftime("%Y-%m-%d")
    dau_thang = now.strftime("%Y-%m-01")
    if len(sys.argv) == 3 and sys.argv[1] == "--tu-thu-muc":
        sys.exit(phan_tich(Path(sys.argv[2]), hom_nay, dau_thang))
    if len(sys.argv) != 1:
        sys.exit(__doc__)
    with tempfile.TemporaryDirectory() as tmp:
        tai_ve(Path(tmp), dau_thang)
        sys.exit(phan_tich(Path(tmp), hom_nay, dau_thang))


if __name__ == "__main__":
    main()
