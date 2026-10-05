#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 src/utils/asset-slots.js 生成 docs/asset-checklist.md。

为什么不手写清单文档：登记表一改，手写文档就会漂移（尺寸对不上、位置漏了），
用户照着上传会白忙一场。所以文档必须**从代码生成**，单一事实源在 asset-slots.js。

用法：python scripts/gen-asset-checklist.py
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'asset-checklist.md'

USE = {'logo': 'Logo', 'hero': '主视觉', 'avatar': '头像', 'icon': '图标',
       'deco': '装饰图', 'empty': '空状态插画', 'banner': '横幅插图'}
CROP = {'fit': '完整显示（留白）', 'fill': '铺满裁切', 'fill-circle': '圆形裁切'}


def load():
    """跑 node 取登记表（asset-slots.js 是 ESM，python 无法直接 import）"""
    js = ('import("./src/utils/asset-slots.js").then(m=>{console.log(JSON.stringify({'
          'slots:m.SLOTS, icons:m.REQUIRED_ICONS, unique:m.uniqueFiles()}));});')
    r = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    line = next((l for l in r.stdout.splitlines() if l.startswith('{')), None)
    if not line:
        sys.exit('读取登记表失败：' + r.stderr[:400])
    return json.loads(line)


def main():
    d = load()
    S, ICONS, U = d['slots'], d['icons'], d['unique']
    L = []
    L.append('# 素材清单 · 按此上传即可\n')
    L.append('> 本清单由 `scripts/gen-asset-checklist.py` 从 `src/utils/asset-slots.js` 自动生成，**与代码永远一致**。\n')
    L.append('> 上传位置：把文件放进 `src/static/milo/`，文件名与下表一致即可。\n')
    L.append('> 替换生效：把组件的 `placeholder` 改 false，或直接改登记表里的 `file` 字段。\n')
    L.append('\n---\n')
    L.append(f'## 一、共需 {len(U)} 个文件，覆盖 {len(S)} 个位置\n')
    L.append('| 文件名 | 建议像素 | 格式 | 引用处 | 抠透明 |')
    L.append('|---|---|---|---|---|')
    for f in U:
        ss = [s for s in S if s['file'] == f['file']]
        cut = any('抠' in (s.get('note') or '') for s in ss)
        L.append(f"| `{f['file']}` | {ss[0]['size']} | WebP | {len(f['usedBy'])} 处 | "
                 f"{'**需要**' if cut else '不需要'} |")
    L.append('\n---\n')
    L.append(f'## 二、位置明细（{len(S)} 处）\n')
    L.append('| # | 位置 id | 用途 | 位置说明 | 渲染盒 | 建议素材 | 比例 | 裁切 | lazy |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for i, s in enumerate(S, 1):
        L.append(f"| {i} | `{s['id']}` | {USE[s['usage']]} | {s['where']} | "
                 f"{s['w']}×{s['h']} | {s['size']} | {s['ratio']} | "
                 f"{CROP[s['crop']]} | {'是' if s.get('lazy') else '否'} |")
    L.append('\n---\n')
    L.append(f'## 三、必配图标（{len(ICONS)} 个）\n')
    L.append('| 位置 id | 用途 | 位置 | 建议像素 | 文件名 |')
    L.append('|---|---|---|---|---|')
    for i in ICONS:
        L.append(f"| `{i['id']}` | {USE[i['usage']]} | {i['where']} | {i['size']} | `{i['file']}` |")
    L.append('\n---\n')
    L.append('## 四、为什么都不开 lazy loading\n')
    L.append('uni-app 的 `lazy-load` 只对「长列表里滚动进视口才加载」的图有意义。')
    L.append('本项目所有图位都是首屏必见的主视觉/装饰/空态，占位盒尺寸固定、')
    L.append('不存在滚动加载收益，**开 lazy 只会让真机出现明显闪烁**。')
    L.append('真正的加载优化点是控制包体（即上表的建议像素）。\n')
    L.append('> 若将来给流水列表加图（如分类图/头像），那时再单独把该插槽的 `lazy` 标 `true`。\n')
    L.append('\n---\n')
    L.append('## 五、怎么替换\n')
    L.append('1. 把素材放进 `src/static/milo/`，文件名照上表；')
    L.append('2. 打开 `src/utils/asset-slots.js`，把对应插槽的 `file` 改成新文件名；')
    L.append('3. 把组件的 `placeholder` 改成 `false`（或删掉该属性，默认即真图模式）。\n')
    L.append('> 占位框与真图**共用同一个盒子**（宽/高/圆角都取自登记表），')
    L.append('> 所以换图后排版不会动，不需要再调任何 CSS。\n')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(L), encoding='utf-8')
    print(f'已生成 {OUT.relative_to(ROOT)}：{len(U)} 个文件 / {len(S)} 个位置')


if __name__ == '__main__':
    main()
