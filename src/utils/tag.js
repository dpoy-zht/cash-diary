/**
 * 标签工具（T5.1）—— 全部纯函数，便于单测。
 *
 * 为什么把"名称归一化""颜色分配""按流水分组"这些算在纯函数里：
 * 标签要在 6 个地方出现（记一笔 / 编辑弹层 / 列表项 / 筛选面板 / 月度报告 / 标签管理），
 * 每处自己写一遍 trim 和去重必然漂移；收敛到这一份，改一处即可。
 *
 * 与分类的区别（刻意的产品区分）：
 * - 分类回答"这是什么开销"，标签回答"为什么 / 为谁花"
 * - 分类是单选且必须选，标签是多选且可空
 * - 标签可以有多个，所以列表项展示时要截断（见 summarizeTags）
 */

/** 单个账本的标签数量上限：超了 chip 区会被挤爆，管理页也不好翻 */
export const MAX_TAGS = 30
/** 标签名长度上限（中文 12 字足够表达"给妈妈买药"这类语义） */
export const MAX_TAG_NAME = 12
/** 一笔流水最多挂几个标签：再多就说明标签设计得太细，不如用备注 */
export const MAX_TAGS_PER_TX = 5

/**
 * 标签可选颜色（与设计令牌的 8 色分类色同源，见 utils/category-color 或页面令牌）。
 * 存的是 key 而不是色值：将来换配色只改映射表，历史数据不用迁移。
 */
export const TAG_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']

/** 名字里的空白全归一化：首尾去掉、中间连续空白压成一个空格 */
function collapseSpace(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
}

/**
 * 归一化标签名。
 * 规则：压空白 → 截断到 MAX_TAG_NAME → 空串视为非法（返回 ''）。
 * 不做大小写折叠：中文场景用不上，且会让"iOS"变成"ios"反而奇怪。
 * @returns {string} 合法返回归一化后的名字，非法返回空串
 */
export function normalizeTagName(raw) {
  const s = collapseSpace(raw)
  if (!s) return ''
  return s.length > MAX_TAG_NAME ? s.slice(0, MAX_TAG_NAME) : s
}

/**
 * 解析"一次性输入多个标签"的输入框内容。
 * 支持用 `,` `，` `、` `/` 或空白分隔；逐个归一化、去重、丢弃空项。
 * 去重对大小写敏感（与 normalizeTagName 一致，不做折叠）。
 * @returns {string[]}
 */
export function parseTagInput(raw) {
  const parts = String(raw == null ? '' : raw).split(/[,，、/\s]+/)
  const out = []
  for (const p of parts) {
    const n = normalizeTagName(p)
    if (n && out.indexOf(n) === -1) out.push(n)
  }
  return out
}

/** 按序号取一个色 key（超出色板长度就循环） */
export function pickTagColor(index) {
  const i = Math.floor(Number(index))
  if (!Number.isFinite(i) || i < 0) return TAG_COLORS[0]
  return TAG_COLORS[i % TAG_COLORS.length]
}

/**
 * 归一化一组 tag id：只保留正整数、去重、升序。
 * 升序是为了让"同样的标签集合"产生同样的数组 —— 便于比较与缓存键稳定。
 */
export function dedupeTagIds(list) {
  const seen = {}
  const out = []
  for (const v of (Array.isArray(list) ? list : [])) {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) continue
    if (seen[n]) continue
    seen[n] = 1
    out.push(n)
  }
  return out.sort(function (a, b) { return a - b })
}

/**
 * 列表项展示用：最多显示 max 个，其余折叠成 `+N`。
 *
 * 注意 `max == null` 必须在 Number() **之前**判断：
 * 先转数字再看是不是 null 会踩 NaN 的坑 —— `Number(undefined)` 是 NaN，
 * 而 `NaN == null` 为 false，于是 n 变成 NaN，`ids.length <= NaN` 恒为 false，
 * 结果一个都不显示。这类 bug 只在"不传 max"时出现，最容易被漏掉。
 * @returns {{shown:number[], more:number}}
 */
export function summarizeTags(tagIds, max) {
  const ids = dedupeTagIds(tagIds)
  const raw = max == null ? 2 : Number(max)
  const n = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 2))
  if (ids.length <= n) return { shown: ids, more: 0 }
  return { shown: ids.slice(0, n), more: ids.length - n }
}

/**
 * 把 junction 行（[{transaction_id, tag_id}]）按流水分组。
 * 详情页/列表页一次拿一批流水的标签，避免 N+1 查询。
 * @returns {Object<string, number[]>} txId 字符串 → tagId 升序数组
 */
export function groupTagIdsByTx(rows) {
  const map = {}
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const tx = Number(r && r.transaction_id)
    const tag = Number(r && r.tag_id)
    if (!Number.isInteger(tx) || tx <= 0) continue
    if (!Number.isInteger(tag) || tag <= 0) continue
    const k = String(tx)
    if (!map[k]) map[k] = []
    if (map[k].indexOf(tag) === -1) map[k].push(tag)
  }
  Object.keys(map).forEach(function (k) { map[k].sort(function (a, b) { return a - b }) })
  return map
}

/** 校验一批 tag id 是否超出一笔流水的上限（同样注意 `max == null` 要先判断，见上） */
export function exceedsPerTxLimit(tagIds, max) {
  const raw = max == null ? MAX_TAGS_PER_TX : Number(max)
  const n = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : MAX_TAGS_PER_TX))
  return dedupeTagIds(tagIds).length > n
}

/** CSV 导出用：标签名数组 → '|' 连接的单格文本（逗号留给 CSV 分隔符） */
export function formatTagsCell(names) {
  const list = (Array.isArray(names) ? names : [])
    .map(function (n) { return collapseSpace(n) })
    .filter(Boolean)
  return list.join('|')
}
