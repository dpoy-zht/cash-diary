#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发布一个版本：创建 Release + 上传 wgt 与 apk + 写入两个 sha256 行。

为什么单独写这个（而不是复用 finish-apk.py）：
- finish-apk.py 只管 APK，且 TAG 写死在某个版本上
- 「亲友点检查更新就能更新」依赖 **wgt 资产** 与 **`wgt-sha256` 说明行** 同时在位：
  缺 wgt → 走整包下载（要手动装）；缺 sha256 → 热更时跳过校验（坏包风险）
- 所以发版必须是原子动作：三样一起到位，缺一不可

约定（与 src/utils/update.js 的解析逻辑一一对应，改这里要同步改那边）：
- wgt 资产名：`nailong-ledger-<tag>.wgt`，apk 资产名：`nailong-ledger-<tag>.apk`
- Release 说明必须含两行：
    wgt-sha256: <64位hex>
    apk-sha256: <64位hex>
  格式必须是 `wgt-sha256: <hex>`（冒号+空格），否则 parseWgtSha256 的正则匹配不到。

用法：
  python dist/dev/publish-release.py <tag> [--apply]
  不带 --apply 只预览。
"""
import hashlib
import json
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = 'dpoy-zht/cash-diary'


def sh(cmd, **kw):
    import subprocess
    return subprocess.run(cmd, **kw)


def gh(method, url, data=None, ctype='application/json'):
    """带 token 的 GitHub API 请求。token 走 git credential fill，不打印不落盘。"""
    import subprocess
    import urllib.request
    r = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True)
    m = re.search(r'^password=(.+)$', r.stdout, re.M)
    token = m.group(1).strip() if m else ''
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'cash-diary-release')
    if data is not None:
        req.add_header('Content-Type', ctype)
    proxy = {k: v for k, v in os.environ.items() if k.lower().endswith('_proxy')}
    op = urllib.request.build_opener(urllib.request.ProxyHandler(proxy))
    try:
        resp = op.open(req, timeout=60)
        return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


def sha256_of(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def delete_asset_if_exists(release_id, name, apply_):
    st, body = gh('GET', 'https://api.github.com/repos/%s/releases/%d/assets?per_page=100'
                  % (REPO, release_id))
    if st != 200:
        print('  列出资产失败:', st); return
    for a in json.loads(body):
        if a['name'] == name:
            print('  已存在同名资产，先删除: id=%d size=%d' % (a['id'], a['size']))
            if apply_:
                st2, _ = gh('DELETE', 'https://api.github.com/repos/%s/releases/assets/%d'
                            % (REPO, a['id']))
                print('    DELETE ->', st2)


def upload(release_id, path, apply_):
    """上传资产。GitHub 不允许同名资产共存 → 先删后传。"""
    name = os.path.basename(path)
    raw = open(path, 'rb').read()
    q = urllib.parse.urlencode({'name': name})
    url = 'https://uploads.github.com/repos/%s/releases/%d/assets?%s' % (REPO, release_id, q)
    st, body = gh('POST', url, raw, ctype='application/octet-stream')
    if st == 422:
        # 同名已存在：删掉重传
        delete_asset_if_exists(release_id, name, apply_)
        if not apply_:
            return 0, '（预览）将删旧重传'
        st, body = gh('POST', url, raw, ctype='application/octet-stream')
    info = json.loads(body) if body else {}
    return st, info


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    apply_ = '--apply' in sys.argv
    if not args:
        sys.exit('用法: python dist/dev/publish-release.py <tag> [--apply] [--wgt-only]')
    tag = args[0]
    # --wgt-only：只发 wgt，不要求同版本 APK。
    #
    # 为什么需要（2026-10-07）：**纯前端改动根本不需要云打包** ——
    # 云打包要 5 分钟且晚间队列拥堵（当晚连续失败 5 次），
    # 而 wgt 打包只要 17 秒。热更机制本身就是为纯前端改动准备的，
    # 却在发布环节被"必须先打 APK"卡住，等于白等。
    #
    # 同 tag 后续补发 APK 时再跑一次不带 --wgt-only 的即可；
    # 已有资产会被自动跳过（见下面 uploads 的存在性检查）。
    # ⚠️ `args` 是**过滤掉 -- 开头参数**后的列表，所以不能拿它判断开关
    # （`'--wgt-only' in args` 永远 False —— 这个坑踩过一次）。
    # 开关一律用 sys.argv 判断，和 apply_ 保持一致。
    wgt_only = '--wgt-only' in sys.argv

    # 归档文件名带 v 前缀（nailong-ledger-v2.2.8.wgt），与 tag 一致
    wgt = os.path.join(ROOT, 'dist/release/nailong-ledger-%s.wgt' % tag)
    apk = os.path.join(ROOT, 'dist/release/nailong-ledger-%s.apk' % tag)
    if not os.path.isfile(wgt):
        sys.exit('缺文件：' + wgt)
    if not wgt_only and not os.path.isfile(apk):
        sys.exit('缺文件：' + apk + '\n（纯前端改动可加 --wgt-only 跳过 APK）')

    wgt_sha = sha256_of(wgt)
    apk_sha = sha256_of(apk) if os.path.isfile(apk) else ''
    print('=' * 70)
    print('发布 %s%s' % (tag, '（仅 wgt）' if wgt_only else ''))
    print('  wgt: %-28s %,d B'.replace('%,d', '%d') % (os.path.basename(wgt), os.path.getsize(wgt)))
    print('       sha256: %s' % wgt_sha)
    if apk_sha:
        print('  apk: %-28s %,d B'.replace('%,d', '%d') % (os.path.basename(apk), os.path.getsize(apk)))
        print('       sha256: %s' % apk_sha)
    else:
        print('  apk: （跳过，本次只发 wgt）')

    if not apply_:
        print('\n（预览模式。确认后加 --apply 执行）')
        return 0

    # 1) Release 本体：没有就建，有就复用
    st, body = gh('GET', 'https://api.github.com/repos/%s/releases/tags/%s' % (REPO, tag))
    if st == 200:
        rel = json.loads(body)
        print('\n复用已有 Release id %d' % rel['id'])
    else:
        payload = json.dumps({
            'tag_name': tag,
            'name': '奶蛙记账 %s' % tag,
            'body': '## %s\n\n详见下方更新说明。\n' % tag,
            'draft': False, 'prerelease': False
        }).encode('utf-8')
        st, body = gh('POST', 'https://api.github.com/repos/%s/releases' % REPO, payload)
        rel = json.loads(body)
        print('\n新建 Release id %d (HTTP %d)' % (rel.get('id'), st))
    rid = rel['id']

    # 2) 上传资产（--wgt-only 时只有 wgt；已存在的同名资产 upload() 会自行处理）
    uploads = [wgt] + ([] if wgt_only else [apk])
    for path in uploads:
        print('\n上传 %s ...' % os.path.basename(path))
        st, info = upload(rid, path, apply_)
        if isinstance(info, dict):
            print('  ->', st, '|', info.get('name'), '|', info.get('size'), 'B |', info.get('state'))
        else:
            print('  ->', st, info)

    # 3) 写 sha256 行（wgt 那行是热更校验的依据；apk 行缺资产时就不写）
    notes = rel.get('body') or ''
    # wgt-size 也写上：App 端纯 JS 算SHA-256 太慢（会卡在「正在更新…」），
    # 原生取文件大小瞬时，且能抓住断流残包。update.js 会优先用它。
    pairs = [('wgt-sha256', wgt_sha), ('wgt-size', str(os.path.getsize(wgt)))]
    if not wgt_only:
        pairs.append(('apk-sha256', apk_sha))
    for key, val in pairs:
        line = '%s: %s' % (key, val)
        if key in notes:
            notes = re.sub(key + r':\s*[0-9a-fA-F]+', line, notes)
        else:
            notes = notes.rstrip() + '\n\n' + line + '\n'
    st, body = gh('PATCH', 'https://api.github.com/repos/%s/releases/%d' % (REPO, rid),
                  json.dumps({'body': notes}).encode('utf-8'))
    ok_wgt = ('wgt-sha256: ' + wgt_sha) in json.loads(body).get('body', '')
    print('\n更新说明: HTTP %d | wgt-sha256 在位:%s' % (st, ok_wgt))
    print('完成 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
