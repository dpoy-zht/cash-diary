#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""获取并优化「形象中心」所需的图片素材。

为什么素材不入库？
    「奶龙」形象版权归第七印象文化传媒（深圳）有限公司所有。为了不把第三方版权
    素材重新分发到公开仓库，图片文件已加入 .gitignore。需要预览时在本地跑一次本脚本
    即可（约下载 2.6MB，产出约 400KB WebP）。

用法：
    python fetch.py            # 下载 + 优化
    python fetch.py --only-opt # 只重跑优化（原图已存在时）

依赖：
    pip install pillow

来源：
    萌娘共享 Category:作者:第七印象
    https://commons.moegirl.org.cn/zh/Category:%E4%BD%9C%E8%80%85:%E7%AC%AC%E4%B8%83%E5%8D%B0%E8%B1%A1

⚠️ 仅限本机原型验证与个人学习，不得商用、不得公开发布或再分发。
"""
import argparse
import pathlib
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少依赖：请先执行 pip install pillow")

BASE = "https://commons.moegirl.org.cn/zh/Special:FilePath/"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "_raw"
OUT = HERE

THUMB_LONG, FULL_LONG = 420, 1000
WHITE_TOL = 240      # 三通道均 >= 此值视为"白底"
WHITE_BORDER_RATIO = 0.9  # 外圈近白像素占比超过此值，判定为白底图

SOURCES = [
    ("奶龙1.png", "nailong-1"),
    ("奶龙2.png", "nailong-2"),
    ("奶龙小七.png", "nailong-xiaoqi"),
    ("小七奶龙.png", "xiaoxi-nailong"),
    ("奶龙爆笑嘉年华.png", "carnival-1"),
    ("奶龙爆笑嘉年华2.png", "carnival-2"),
    ("奶龙搞怪大作战.png", "mischief"),
    ("大战暴暴龙.png", "vs-baobaolong"),
    ("暴暴龙.png", "baobaolong"),
]


# ---------------------------------------------------------------- 下载
def download(url: str, dest: pathlib.Path) -> None:
    """优先用 curl（本机代理环境下比 urllib 更可靠），否则退回 urllib。"""
    if shutil.which("curl"):
        r = subprocess.run(
            ["curl", "-sSL", "--max-time", "60", "-A", UA, "-o", str(dest), url],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            raise RuntimeError(f"curl 退出码 {r.returncode}")
        return
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        dest.write_bytes(resp.read())


def fetch_raw() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    ok = 0
    for src_name, slug in SOURCES:
        dest = RAW / f"{slug}{pathlib.Path(src_name).suffix}"
        try:
            download(BASE + urllib.parse.quote(src_name), dest)
            if dest.stat().st_size < 2000:
                raise RuntimeError(f"文件过小（{dest.stat().st_size}B），可能被限流")
            print(f"  OK   {slug:<18}{dest.stat().st_size / 1024:>8.0f} KB")
            ok += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL {slug:<18}{type(exc).__name__}: {exc}")
    return ok


# ---------------------------------------------------------------- 抠白底
def border_is_white(img: "Image.Image") -> bool:
    """外圈像素是否几乎全是近白——决定要不要抠图。"""
    im = img.convert("RGB")
    w, h = im.size
    px = im.load()
    ring = []
    for x in range(w):
        ring += [px[x, 0], px[x, h - 1]]
    for y in range(h):
        ring += [px[0, y], px[w - 1, y]]
    white = sum(1 for r, g, b in ring if r >= WHITE_TOL and g >= WHITE_TOL and b >= WHITE_TOL)
    return white / len(ring) >= WHITE_BORDER_RATIO


def knockout_white(img: "Image.Image") -> "Image.Image":
    """把与画面外圈连通的白色区域抠成透明。

    只做"从四边泛洪"，因此角色内部的白色高光/肚皮不会被误伤。
    随后把紧贴边缘的一圈近白像素按白度递减 alpha，消除白边。
    """
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    def near_white(x, y):
        r, g, b, _a = px[x, y]
        return r >= WHITE_TOL and g >= WHITE_TOL and b >= WHITE_TOL

    bg = bytearray(w * h)
    queue = deque()

    def push(x, y):
        i = y * w + x
        if bg[i] or not near_white(x, y):
            return
        bg[i] = 1
        queue.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    span = 255 - WHITE_TOL
    removed = 0
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if bg[i]:
                r, g, b, _a = px[x, y]
                px[x, y] = (r, g, b, 0)
                removed += 1
                continue
            # 前景像素：若四邻有背景，按"离纯白多远"给一个柔化 alpha，去掉白边
            if not ((x > 0 and bg[i - 1]) or (x < w - 1 and bg[i + 1])
                    or (y > 0 and bg[i - w]) or (y < h - 1 and bg[i + w])):
                continue
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            if m >= WHITE_TOL:
                px[x, y] = (r, g, b, max(0, round((255 - m) / span * 255)))
    return img, removed / (w * h)


# ---------------------------------------------------------------- 优化
def fit(img: "Image.Image", long_side: int) -> "Image.Image":
    w, h = img.size
    if max(w, h) <= long_side:
        return img
    s = long_side / max(w, h)
    return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


def optimize() -> None:
    rows = []
    for p in sorted(RAW.iterdir()):
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        try:
            img = Image.open(p)
            img.load()
        except Exception as exc:  # noqa: BLE001
            print(f"  跳过 {p.name}：{type(exc).__name__}")
            continue
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")

        mode, note = "poster", "彩底 → 保留原背景"
        if border_is_white(img):
            img, ratio = knockout_white(img)
            mode, note = "cutout", f"白底 → 抠透明（去掉 {ratio * 100:.0f}% 画面）"

        thumb, full = fit(img, THUMB_LONG), fit(img, FULL_LONG)
        tp, fp = OUT / f"{p.stem}-thumb.webp", OUT / f"{p.stem}-full.webp"
        thumb.save(tp, "WEBP", quality=82, method=6)
        full.save(fp, "WEBP", quality=84, method=6)
        rows.append((p.stem, mode, p.stat().st_size, tp.stat().st_size, fp.stat().st_size, note))

    if not rows:
        print("没有可优化的原图，请先不带 --only-opt 运行一次。")
        return

    print(f"\n{'slug':<18}{'模式':<9}{'原始KB':>9}{'缩略KB':>9}{'大图KB':>9}  处理")
    print("-" * 78)
    tb = tf = to = 0
    for slug, mode, ob, tb_, fb, note in rows:
        to += ob; tb += tb_; tf += fb
        print(f"{slug:<18}{mode:<9}{ob / 1024:>9.0f}{tb_ / 1024:>9.1f}{fb / 1024:>9.1f}  {note}")
    print("-" * 78)
    print(f"{'合计 ' + str(len(rows)) + ' 张':<18}{'':<9}{to / 1024:>9.0f}{tb / 1024:>9.1f}{tf / 1024:>9.1f}")
    cut = sum(1 for r in rows if r[1] == "cutout")
    print(f"\n白底抠图 {cut} 张 / 彩底海报 {len(rows) - cut} 张")
    print(f"网格只加载缩略图：{tb / 1024:.0f}KB，为原图的 {tb / to * 100:.1f}%")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-opt", action="store_true", help="跳过下载，只重跑优化")
    args = ap.parse_args()

    if not args.only_opt:
        print(f"下载 {len(SOURCES)} 个文件到 {RAW} …")
        n = fetch_raw()
        print(f"下载完成 {n}/{len(SOURCES)}")
    print("\n优化为两档 WebP（白底自动抠透明）…")
    optimize()
    print("\n完成。用浏览器打开 ../nailong-gallery.html 查看效果。")


if __name__ == "__main__":
    main()
