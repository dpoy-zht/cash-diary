"""
生成服务器用的更新元数据 latest.json。

为什么需要它（2026-10-07）：
App 的检查更新要读到一个 JSON，里面有版本号、下载地址、校验值。
GitHub 的 Release API 提供这些，但**手机直连 GitHub 在用户网络里不可用**
（实测直连会随机断流，见 MEMORY）。所以自建服务器上要自己产出这份文件。

格式刻意做成「**自描述**」：下载地址写绝对 URL，App 拿到即可用，
不需要在客户端写死任何路径（换域名/端口只改服务器这一个文件）。

字段说明：
  version      资源包版本（wgt 版），App 用它判断要不要更新
  versionCode  数字版，排序用
  releasedAt   发布时间（ISO8601），App 端只显示给人看
  assets.wgt   热更包（优先）；null 表示本次没发 wgt
  assets.apk   整包；App 下载 wgt 失败时回退用它
  sha256/size  校验用 —— size 是**主校验**（App 端原生取，极快），
               sha256 仅在 App 开启严格校验时才算（纯 JS 算大文件很慢）

用法：
  python dist/dev/gen-latest-json.py --tag v2.3.10 --wgt <path> [--apk <path>] [--base http://121.40.24.123] [--out dist/release/latest.json]
"""

import argparse
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RELEASE_DIR = os.path.join(ROOT, 'dist', 'release')


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def parse_version(tag):
    """'v2.3.10' → ('2.3.10', 2310)。code 用去掉点的数字，便于比大小。"""
    v = str(tag or '').lstrip('v')
    parts = v.split('.')
    while len(parts) < 3:
        parts.append('0')
    digits = ''.join(p for p in parts if p.isdigit()) or '0'
    return v, int(digits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', required=True, help='版本号，如 v2.3.10')
    ap.add_argument('--wgt', help='wgt 文件路径')
    ap.add_argument('--apk', help='apk 文件路径')
    ap.add_argument('--base', default='http://121.40.24.123',
                    help='服务器基址（含 /update 之前的部分）')
    ap.add_argument('--out', default=os.path.join(RELEASE_DIR, 'latest.json'))
    args = ap.parse_args()

    version, code = parse_version(args.tag)
    base = args.base.rstrip('/')

    assets = {}
    notes = []
    for key, path, fname in (
        ('wgt', args.wgt, 'nailong-ledger-%s.wgt' % args.tag),
        ('apk', args.apk, 'nailong-ledger-%s.apk' % args.tag),
    ):
        if not path:
            notes.append('%s: 未提供（本次不发布）' % key)
            continue
        if not os.path.isfile(path):
            sys_exit = '找不到文件：%s' % path
            print(sys_exit)
            return 1
        assets[key] = {
            'url': '%s/update/%s' % (base, fname),
            'size': os.path.getsize(path),
            'sha256': sha256_of(path),
        }
        print('%-4s %-34s %,d B'.replace('%,d', '%d') % (key, fname, os.path.getsize(path)))
        print('     sha256 %s' % assets[key]['sha256'])

    data = {
        'version': version,
        'versionCode': code,
        'tag': args.tag,
        'assets': assets,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print('\n已写出 %s' % args.out)
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())