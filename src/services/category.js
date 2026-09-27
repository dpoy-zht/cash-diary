/**
 * 分类业务层：内置分类种子 + 读取 + 增删改排序。
 *
 * 口径：
 * - `icon` 存的不是 emoji，而是 v2.0 参考包的分类 key（如 breakfast）。
 *   配色与图标都按这个 key 取（见 utils/palette.js），所以**新增分类必须从
 *   已有 key 里选一个**，否则取不到颜色/图标、会退回 emoji。
 * - **删除保护**：分类下还有流水就不让删（与"只允许删空账本"同一套口径），
 *   避免产生指向不存在分类的孤儿记录。
 * - 分类是**全局的**（不按账本区分）：多账本共用一套分类，符合使用直觉。
 */
import * as categoryRepo from '../db/repository/category.js'
import { CATEGORY_ICONS } from '../utils/palette.js'
import { TYPE_EXPENSE, TYPE_INCOME } from '../utils/constant.js'

/** 内置分类：12 支出 + 8 收入（对齐 v2.0 参考包的 20 个分类） */
export const DEFAULT_CATEGORIES = [
  { name: '早餐', icon: 'breakfast', type: 'expense', sort: 1 },
  { name: '午餐', icon: 'lunch', type: 'expense', sort: 2 },
  { name: '零食', icon: 'snack', type: 'expense', sort: 3 },
  { name: '奶茶', icon: 'milktea', type: 'expense', sort: 4 },
  { name: '公交', icon: 'bus', type: 'expense', sort: 5 },
  { name: '打车', icon: 'taxi', type: 'expense', sort: 6 },
  { name: '购物', icon: 'shop', type: 'expense', sort: 7 },
  { name: '住房', icon: 'home', type: 'expense', sort: 8 },
  { name: '娱乐', icon: 'fun', type: 'expense', sort: 9 },
  { name: '医疗', icon: 'med', type: 'expense', sort: 10 },
  { name: '红包', icon: 'gift', type: 'expense', sort: 11 },
  { name: '其他', icon: 'more', type: 'expense', sort: 12 },
  { name: '工资', icon: 'salary', type: 'income', sort: 1 },
  { name: '奖金', icon: 'bonus', type: 'income', sort: 2 },
  { name: '兼职', icon: 'part', type: 'income', sort: 3 },
  { name: '理财', icon: 'invest', type: 'income', sort: 4 },
  { name: '红包', icon: 'redbag', type: 'income', sort: 5 },
  { name: '报销', icon: 'reimb', type: 'income', sort: 6 },
  { name: '二手', icon: 'sell', type: 'income', sort: 7 },
  { name: '其他', icon: 'more', type: 'income', sort: 8 }
]

/** 名称上限：宫格一行放得下 */
const MAX_NAME_LEN = 6

/** 幂等：首次启动写入内置分类，已有数据则跳过（换分类体系需清库或写迁移） */
export async function seedIfEmpty() {
  const n = await categoryRepo.count()
  if (n > 0) return
  for (const c of DEFAULT_CATEGORIES) {
    await categoryRepo.insert(c)
  }
}

export async function listAll() {
  return categoryRepo.listAll()
}

/** 列表 + 每个分类的流水笔数（分类管理页展示用） */
export async function listWithStats() {
  const [list, stats] = await Promise.all([categoryRepo.listAll(), categoryRepo.statsMap()])
  return list.map(function (c) {
    return Object.assign({}, c, { count: stats.get(c.id) || 0 })
  })
}

/** 可选图标清单（供"新建/换图标"选择器用） */
export function iconOptions() {
  return Object.keys(CATEGORY_ICONS)
}

function cleanName(name) {
  const n = String(name == null ? '' : name).trim()
  if (!n) throw new Error('分类名称不能为空')
  if (n.length > MAX_NAME_LEN) throw new Error('分类名称最多 ' + MAX_NAME_LEN + ' 个字')
  return n
}

function checkIcon(icon) {
  const k = String(icon == null ? '' : icon).trim()
  if (!k || !CATEGORY_ICONS[k]) throw new Error('请选择一个图标')
  return k
}

/** 按给定顺序重排（sort 从 1 连续编号，避免重复或空洞） */
async function reorder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await categoryRepo.update(orderedIds[i], { sort: i + 1 })
  }
}

/**
 * 新建分类，排在该类型最后。
 * @param {{name:string, type:string, icon:string}} input
 */
export async function create(input) {
  const name = cleanName(input && input.name)
  const type = input && input.type
  if (type !== TYPE_EXPENSE && type !== TYPE_INCOME) throw new Error('分类类型不合法')
  const icon = checkIcon(input && input.icon)

  const all = await categoryRepo.listAll()
  const maxSort = all
    .filter(function (c) { return c.type === type })
    .reduce(function (m, c) { return Math.max(m, c.sort) }, 0)

  await categoryRepo.insert({ name: name, type: type, icon: icon, sort: maxSort + 1 })
}

export async function rename(id, name) {
  await categoryRepo.update(id, { name: cleanName(name) })
}

export async function setIcon(id, icon) {
  await categoryRepo.update(id, { icon: checkIcon(icon) })
}

/**
 * 在同一类型内上移/下移一位（到顶/到底时静默不动，返回 false）。
 * @param {number} id
 * @param {number} dir -1 上移 / +1 下移
 */
export async function move(id, dir) {
  const all = await categoryRepo.listAll()
  const cat = all.find(function (c) { return c.id === Number(id) })
  if (!cat) throw new Error('分类不存在')
  const sameType = all.filter(function (c) { return c.type === cat.type })
  const idx = sameType.findIndex(function (c) { return c.id === cat.id })
  const target = idx + (dir < 0 ? -1 : 1)
  if (target < 0 || target >= sameType.length) return false

  const ids = sameType.map(function (c) { return c.id })
  const tmp = ids[idx]
  ids[idx] = ids[target]
  ids[target] = tmp
  await reorder(ids)
  return true
}

/** 只允许删除没有流水的分类；有记录时抛错并说明还有多少笔 */
export async function removeIfEmpty(id) {
  const all = await categoryRepo.listAll()
  const cat = all.find(function (c) { return c.id === Number(id) })
  if (!cat) throw new Error('分类不存在')

  const stats = await categoryRepo.statsMap()
  const n = stats.get(cat.id) || 0
  if (n > 0) throw new Error('这个分类下还有 ' + n + ' 笔记录，先把它们改到别的分类再删')

  await categoryRepo.remove(cat.id)
  // 删掉后把同类型的 sort 重排连续，避免留下空洞
  const rest = all.filter(function (c) { return c.type === cat.type && c.id !== cat.id })
  await reorder(rest.map(function (c) { return c.id }))
}
