/**
 * 奶蛙 IP 装饰件的**规格计算**（纯函数，无副作用、无 DOM）。
 *
 * 为什么单独抽出来：`mascot-deco.vue` 里的样式绑定逻辑必须能在 Node 单测里逐字断言
 * （vitest 跑不了 .vue 的 scoped 样式，但能跑纯函数）。项目里已有同构先例：
 * `db/tx-search-sql.js` 把 SQL 拼装抽成纯函数，正是为了"转义无注入"可被测试断言。
 *
 * 视觉语言基准（对齐 demo/nailong-ledger.html 与现有 12 处用法，不要随意改）：
 * - 卡片圆角 24px、小卡 14px、圆形裁切用 aspectFill + border-radius: 999px
 * - 装饰件**永远不占布局流**：绝对定位 + pointer-events: none，不挤走任何正文
 * - 尺寸分三档：主插画 88~96 / 行内 40~44 / 边角 44（半透明）
 */

import { packSrc } from '../../utils/asset-packs.js'

/** 尺寸档 → 边长（px）。刻意收窄成三档，避免页面随手写任意尺寸破坏节奏。 */
export const DECO_SIZE_TIERS = Object.freeze({
  /** 行内点缀：横幅、标题左侧、结论行 */
  inline: 44,
  /** 边角装饰：navbar 角落，低透明度 */
  corner: 44,
  /** 主插画：空状态、头卡 */
  hero: 96
})

/** 允许的 mood（对应 src/static/milo/ 下的 9 张 webp）。 */
export const DECO_MOODS = Object.freeze([
  'milo',
  'waving',
  'happy',
  'sad',
  'innocent',
  'jump',
  'caishen',
  'gold',
  'rich'
])

/**
 * 解析 mood → 素材运行时路径。
 *
 * 路径**不在这里写死**，而是走 `utils/asset-packs.js` 的分组清单（`packSrc(mood)`）。
 * 这样新增/切换素材包只改 `ACTIVE_PACK` 一个常量，页面与组件都不用动 ——
 * 也让「原图零改动」这条约束能长期成立（新增素材只是多一个目录 + 一条清单）。
 *
 * ⚠️ 命名不齐是**两套素材共有的历史事实**：基础形象叫 `milo.webp`（没有连字符前缀），
 * 其余 8 张才是 `milo-<表情>.webp`。这与现有页面引用一致（home/stats 都写死
 * `/static/milo/milo.webp`），别"顺手统一"——一改就会和已入库文件对不上，
 * 且只有真机看得到空白图。`packSrc()` 内部已处理这个特例。
 */
export function decoSrc(mood) {
  if (DECO_MOODS.indexOf(mood) === -1) {
    throw new Error('未知奶蛙形象：' + mood + '（可选：' + DECO_MOODS.join(' / ') + '）')
  }
  return packSrc(mood)
}

/**
 * 计算根节点内联样式。
 *
 * @param {object} o
 * @param {string} o.mood    形象，见 DECO_MOODS
 * @param {number} [o.size]  边长；缺省按 tier 取
 * @param {string} [o.tier]  'inline' | 'corner' | 'hero'，size 缺省时生效
 * @param {number} [o.opacity] 0~1；边角档默认 0.5，正文档默认 1
 * @param {boolean} [o.circle] 圆形裁切（配合 mode=aspectFill，用于带场景底的彩图）
 * @returns {{width:string,height:string,opacity:number,borderRadius:string}}
 */
export function decoStyle(o) {
  const opts = o || {}
  // 非法 tier 必须回落，不能让 DECO_SIZE_TIERS[tier] 产出 undefined
  // ——undefined 会拼成 "undefinedpx"，是无效 CSS，装饰件直接消失（静默失败）。
  const tier = Object.prototype.hasOwnProperty.call(DECO_SIZE_TIERS, opts.tier)
    ? opts.tier
    : 'inline'
  const size =
    typeof opts.size === 'number' && isFinite(opts.size) && opts.size > 0
      ? opts.size
      : DECO_SIZE_TIERS[tier]
  // 边角档天生是"点缀"，默认压到半透明；其余档保持完全不透明以保证识别度
  const opacity =
    typeof opts.opacity === 'number' && isFinite(opts.opacity)
      ? opts.opacity
      : tier === 'corner'
        ? 0.5
        : 1
  return {
    width: size + 'px',
    height: size + 'px',
    opacity: opacity,
    borderRadius: opts.circle ? '999px' : 'var(--cd-r-sm)'
  }
}

/**
 * 计算配图的裁切模式。
 * 圆形裁切必须配 aspectFill（否则会被压成椭圆）；其余用 aspectFit 保持原比例。
 */
export function decoMode(o) {
  return (o || {}).circle ? 'aspectFill' : 'aspectFit'
}
