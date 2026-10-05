/**
 * 占位框的渲染计算（纯函数，无副作用、无 DOM）。
 *
 * 核心约束：**占位框的盒子必须与真图完全一致**（宽/高/圆角/裁切方式），
 * 这样用户上传素材后只需改 slots.js 里的 file 名，视觉与排版都不会动。
 * 一旦占位与真图用了两套尺寸，替换素材时就会位移 —— 这是本文件存在的全部理由。
 *
 * 另一个刻意的决定：**占位框不参与任何可交互状态**。
 * 它是 `pointer-events: none` 的纯展示层，不会挡住下层按钮；
 * 且不写死任何 min-height，靠外部容器原有布局撑开。
 */

/** 用途 → 语义色（只用项目已有令牌，不引入新色） */
export const TONE_VARS = Object.freeze({
  primary: 'var(--cd-primary)',
  icon: 'var(--cd-icon-3)',
  ghost: 'var(--cd-icon-2)',
  ink3: 'var(--cd-ink-3)',
  blush: 'var(--cd-heart)'
})

/** 裁切方式 → image mode。空占位不设 mode（没有图可裁），仅在有图时才用。 */
export function cropToMode(crop) {
  if (crop === 'fill') return 'aspectFill'
  if (crop === 'fill-circle') return 'aspectFill'
  return 'aspectFit'
}

/** 裁切方式 → border-radius。圆形裁切必须配 aspectFill，否则角色被压成椭圆。 */
export function cropToRadius(crop, cardRadius) {
  if (crop === 'fill-circle') return '999px'
  if (crop === 'fill') return cardRadius || 'var(--cd-r-sm)'
  return '0'
}

/**
 * 计算占位框样式。
 * @param {object} o
 * @param {number} o.w 宽（px）—— 与真图同一个盒子
 * @param {number} o.h 高（px）
 * @param {string} [o.tone]  用途语义色，见 TONE_VARS
 * @param {string} [o.crop]  裁切方式，见 cropToRadius
 * @param {number} [o.opacity] 装饰件可压低透明度
 * @returns {{width:string,height:string,borderRadius:string,borderColor:string,background:string,opacity:number}}
 */
export function placeholderStyle(o) {
  const opts = o || {}
  const w = num(opts.w, 96)
  const h = num(opts.h, 96)
  const tone = Object.prototype.hasOwnProperty.call(TONE_VARS, opts.tone)
    ? opts.tone
    : 'ghost'
  const color = TONE_VARS[tone]
  return {
    width: w + 'px',
    height: h + 'px',
    // 圆角沿用真图规格，占位与真图才一致
    borderRadius: cropToRadius(opts.crop, opts.cardRadius),
    borderColor: color,
    background: opts.solid === false ? 'transparent' : 'var(--cd-primary-lt)',
    opacity: num(opts.opacity, 1)
  }
}

/**
 * 占位框内的说明文字（短，不能糊住页面）。
 * 刻意做短：只给「用途 + 尺寸」，其余信息在 slots.js 与清单文档里。
 */
export function placeholderLabel(o) {
  const opts = o || {}
  const w = num(opts.w, 96)
  const h = num(opts.h, 96)
  const use = opts.usage || '素材'
  return use + ' ' + w + '×' + h
}

/**
 * 建议素材的展示尺寸（给人看的，附在占位框 title 上）。
 * 盒子很小时（≤40px）不显示建议尺寸，否则文字比框还宽。
 */
export function showHint(o) {
  const opts = o || {}
  return num(opts.w, 96) >= 48 && !!opts.size
}

/** 统一的安全数字：非有限数/负数一律回落，避免产出 'NaNpx' 这种无效 CSS */
function num(v, fallback) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : fallback
}
