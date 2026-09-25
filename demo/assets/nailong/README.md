# 形象中心 · 图片素材

本目录存放 `demo/nailong-gallery.html` 用到的图片。

## ⚠️ 版权与使用范围

- 「奶龙」形象版权归 **第七印象文化传媒（深圳）有限公司** 所有。
- 素材取自 **萌娘共享**（`commons.moegirl.org.cn`）的
  [Category:作者:第七印象](https://commons.moegirl.org.cn/zh/Category:%E4%BD%9C%E8%80%85:%E7%AC%AC%E4%B8%83%E5%8D%B0%E8%B1%A1)。
- **仅限本机原型验证与个人学习使用；不得商用、不得公开发布或再分发。**
- 因此图片文件**不入库**（见仓库根 `.gitignore`）。若要将「形象中心」正式上线，
  必须替换为**自有素材或已获授权**的素材，或改用项目自带的原创吉祥物
  `src/components/mascot/`。

## 获取素材

```bash
pip install pillow
python fetch.py              # 下载 + 优化（约下载 2.6MB）
python fetch.py --only-opt   # 只重跑优化
```

## 产物命名

| 文件 | 用途 | 长边 | 典型体积 |
|---|---|---|---|
| `<slug>-thumb.webp` | 网格缩略图、灯箱首帧 | 420px | 5–24 KB |
| `<slug>-full.webp` | 形象预览、灯箱大图 | 1000px | 8–58 KB |

只加载缩略图时总量约 **120KB**，为原始 PNG/JPG（约 2.5MB）的 **4.7%**。

## 依赖关系

`demo/nailong-gallery.html` 的 `ITEMS` 数组按 `slug` 引用这些文件。
新增形象：把图片放进本目录（同名两档）→ 在 `ITEMS` 里加一条即可，无需改其他代码。
