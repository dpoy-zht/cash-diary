/**
 * 分类业务层：内置分类种子（**两级**）+ 读取 + 增删改排序 + 一次性树迁移。
 *
 * 口径：
 * - `icon` 存的不是 emoji，而是 v2.0 参考包的分类 key（如 breakfast）。
 *   配色与图标都按这个 key 取（见 utils/palette.js），所以**新增分类必须从
 *   已有 key 里选一个**，否则取不到颜色/图标、会退回 emoji。
 * - **两级结构（v7 起）**：`parent_id` 为 null = 一级分类；非 null = 所属一级分类的 id。
 *   - 一级：能独立成为预算 / 统计里的一档
 *   - 二级：挂在某个一级下，记一笔时可选，统计里默认被汇总到一级
 *   - **收入分类保持一级平铺**（收入语义本来就扁平，强行分类反而难用）
 * - **删除保护**：分类下有流水、或一级分类下还挂着二级、
 *   或被**固定支出 / 分类预算**引用着，都不许删。
 * - 分类是**全局的**（不按账本区分）：多账本共用一套分类，符合使用直觉。
 *
 * ⚠️ 向后兼容是硬约束：`seedIfEmpty()` 只在空表播种，而用户手机上早就有真实数据，
 * 所以老库靠 `migrateCategoryTree()` 一次性补齐 —— 它**只改 category 表**
 * （补父级、连父子、规范排序），**一个字节都不动 transaction_record**。
 */
import * as categoryRepo from '../db/repository/category.js'
import * as accountRepo from '../db/repository/account.js'
import * as fixedRepo from '../db/repository/fixed.js'
import * as budgetRepo from '../db/repository/budget.js'
import { CATEGORY_ICONS, CATEGORY_ICON_GROUPS } from '../utils/palette.js'
import { TYPE_EXPENSE, TYPE_INCOME, DEFAULT_ACCOUNT_ID } from '../utils/constant.js'

/**
 * 内建**支出**分类树：一级 → 二级子类。
 * ⚠️ **这是分类体系的唯一事实源**：种子（新装机）与迁移（老库）都读它，
 * 两边共用一份定义，才不会出现"新装机和升级后分类长得不一样"。
 *
 * `aliases`：老库里用过的旧名字。迁移时按别名找到那一行，**改名**成规范名
 * （而不是新插一行、把老行留在那儿变成孤儿）。
 */
export const EXPENSE_TREE = [
  {
    name: '餐饮',
    icon: 'food',
    children: [
      { name: '早餐', icon: 'breakfast' },
      { name: '午餐', icon: 'lunch' },
      { name: '晚餐', icon: 'lunch' },
      { name: '零食', icon: 'snack' },
      { name: '奶茶', icon: 'milktea' },
      { name: '外卖', icon: 'food' }
    ]
  },
  {
    name: '交通',
    icon: 'traffic',
    children: [
      { name: '公交', icon: 'bus' },
      { name: '打车', icon: 'taxi' },
      { name: '地铁', icon: 'traffic' },
      { name: '加油', icon: 'traffic' }
    ]
  },
  {
    name: '购物',
    icon: 'shop',
    children: [
      { name: '日用', icon: 'shop' },
      { name: '服饰', icon: 'shop' },
      { name: '数码', icon: 'shop' }
    ]
  },
  {
    name: '居住',
    icon: 'home',
    aliases: ['住房'],
    children: [
      { name: '房租', icon: 'home' },
      { name: '水电', icon: 'home' },
      { name: '物业', icon: 'home' }
    ]
  },
  {
    name: '娱乐',
    icon: 'fun',
    children: [
      { name: '电影', icon: 'fun' },
      { name: '游戏', icon: 'fun' },
      { name: '运动', icon: 'fun' }
    ]
  },
  {
    name: '医疗',
    icon: 'med',
    children: [
      { name: '门诊', icon: 'med' },
      { name: '药品', icon: 'med' },
      { name: '体检', icon: 'med' }
    ]
  },
  {
    name: '教育',
    icon: 'edu',
    children: [
      { name: '书籍', icon: 'edu' },
      { name: '课程', icon: 'edu' },
      { name: '培训', icon: 'edu' }
    ]
  },
  {
    name: '通讯',
    icon: 'comm',
    children: [
      { name: '话费', icon: 'comm' },
      { name: '流量', icon: 'comm' },
      { name: '快递', icon: 'comm' }
    ]
  },
  {
    name: '人情',
    icon: 'social',
    children: [
      { name: '红包', icon: 'gift' },
      { name: '礼物', icon: 'gift' },
      { name: '请客', icon: 'social' }
    ]
  },
  {
    name: '宠物',
    icon: 'pet',
    children: [
      { name: '主粮', icon: 'pet' },
      { name: '用品', icon: 'pet' },
      { name: '保健', icon: 'pet' }
    ]
  },
  {
    name: '旅行',
    icon: 'travel',
    children: [
      { name: '机票', icon: 'travel' },
      { name: '住宿', icon: 'travel' },
      { name: '门票', icon: 'travel' }
    ]
  },
  { name: '其他', icon: 'more', children: [] }
]

/** 内建**收入**分类：一级平铺（对齐 v2.0 参考包） */
export const INCOME_CATEGORIES = [
  { name: '工资', icon: 'salary' },
  { name: '奖金', icon: 'bonus' },
  { name: '兼职', icon: 'part' },
  { name: '理财', icon: 'invest' },
  { name: '红包', icon: 'redbag' },
  { name: '报销', icon: 'reimb' },
  { name: '二手', icon: 'sell' },
  { name: '其他', icon: 'more' }
]

/**
 * 老库里这些名字在 v7 之后**应该变成二级**。
 * 用它们当"是否还需要迁移"的判据（而不是另存一个迁移标记）：
 * 迁移跑完后它们全都挂到了父级下，判据自然变假，于是**天然幂等**；
 * 而且用户后来手工删掉「餐饮」也不会被重新塞回来 —— 判据只认这批老叶子的上级状态。
 */
const LEGACY_LEAF_NAMES = ['早餐', '午餐', '零食', '奶茶', '公交', '打车', '住房', '红包']

/** 扁平化的内置分类清单（一级在前，父级紧跟子级），供测试与展示层核对 */
export const DEFAULT_CATEGORIES = buildDefaults()

function buildDefaults() {
  const out = []
  let sort = 0
  EXPENSE_TREE.forEach(function (p) {
    sort += 1
    out.push({ name: p.name, type: TYPE_EXPENSE, icon: p.icon, sort: sort, parentName: null })
    p.children.forEach(function (ch, i) {
      out.push({ name: ch.name, type: TYPE_EXPENSE, icon: ch.icon, sort: i + 1, parentName: p.name })
    })
  })
  INCOME_CATEGORIES.forEach(function (c, i) {
    out.push({ name: c.name, type: TYPE_INCOME, icon: c.icon, sort: i + 1, parentName: null })
  })
  return out
}

/** 名称上限：宫格一行放得下 */
const MAX_NAME_LEN = 6

/**
 * 内置分类规模（**单一事实源**）：测试与文档一律引用这里，别到处硬编码数字 ——
 * 往 EXPENSE_TREE 里加一个子类就要改一堆断言的活，谁都不想干第二次。
 */
export const DEFAULT_CATEGORY_COUNT = DEFAULT_CATEGORIES.length
export const DEFAULT_EXPENSE_COUNT = DEFAULT_CATEGORIES.filter(function (c) {
  return c.type === TYPE_EXPENSE
}).length
export const DEFAULT_INCOME_COUNT = DEFAULT_CATEGORIES.filter(function (c) {
  return c.type === TYPE_INCOME
}).length

function isExpense(t) { return t === TYPE_EXPENSE }
function bySortId(a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id }
function rowKey(type, name) { return type + '|' + String(name == null ? '' : name) }

/** 一级分类 = parent_id 为空 */
export function isTopLevel(cat) {
  return !cat || cat.parent_id == null
}

/**
 * 把扁平的分类数组组装成两级树（纯函数，方便测试）。
 * 找不到父级的二级会被**提升为一级**返回，保证不丢分类（脏数据兜底）。
 *
 * @param {Array} list 分类数组
 * @param {string} [type] 只取该类型
 * @returns {Array<{cat:object, children:object[]}>}
 */
export function buildTree(list, type) {
  const all = (Array.isArray(list) ? list : []).filter(function (c) {
    return !type || c.type === type
  })
  const tops = all.filter(isTopLevel).sort(bySortId)
  return tops.map(function (p) {
    const children = all
      .filter(function (c) { return c.parent_id === p.id })
      .sort(bySortId)
    return { cat: p, children: children }
  })
}

/** 取某个（或全部）类型的**一级**分类 */
export function topLevelOf(list, type) {
  return (Array.isArray(list) ? list : []).filter(function (c) {
    return (!type || c.type === type) && isTopLevel(c)
  }).sort(bySortId)
}

/** 取某个一级分类下的**二级**分类 */
export function childrenOf(list, parentId) {
  const pid = Number(parentId)
  return (Array.isArray(list) ? list : [])
    .filter(function (c) { return c.parent_id === pid })
    .sort(bySortId)
}

/* ---------------- 播种 / 迁移 ---------------- */

/** 幂等：首次启动写入内置分类（**两级**），已有数据则跳过 */
export async function seedIfEmpty() {
  const n = await categoryRepo.count()
  if (n > 0) return
  await insertFullTree()
}

/** 按事实源把整套内置分类插进空库：先一级（拿到 id），再挂二级 */
async function insertFullTree() {
  for (let i = 0; i < EXPENSE_TREE.length; i += 1) {
    const p = EXPENSE_TREE[i]
    await categoryRepo.insert({
      name: p.name,
      type: TYPE_EXPENSE,
      icon: p.icon,
      sort: i + 1,
      parent_id: null
    })
  }
  // ⚠️ 不能靠 insert 的返回值拿 id（App 端 plus.sqlite 拿不到 lastInsertRowid）→ 重新读一次
  const tops = await categoryRepo.listAll()
  const pidOf = new Map()
  tops.forEach(function (c) {
    if (isExpense(c.type) && isTopLevel(c)) pidOf.set(c.name, c.id)
  })

  for (let i = 0; i < EXPENSE_TREE.length; i += 1) {
    const p = EXPENSE_TREE[i]
    const children = p.children || []
    for (let j = 0; j < children.length; j += 1) {
      const ch = children[j]
      await categoryRepo.insert({
        name: ch.name,
        type: TYPE_EXPENSE,
        icon: ch.icon,
        sort: j + 1,
        parent_id: pidOf.get(p.name)
      })
    }
  }
  await insertFlatIncome()
}

async function insertFlatIncome() {
  for (let i = 0; i < INCOME_CATEGORIES.length; i += 1) {
    const c = INCOME_CATEGORIES[i]
    await categoryRepo.insert({
      name: c.name,
      type: TYPE_INCOME,
      icon: c.icon,
      sort: i + 1,
      parent_id: null
    })
  }
}

/** 在给定清单里按 (type, name) 找一行；`names` 是允许的名字集合（首个命中优先） */
function pickByNames(list, type, names) {
  for (const n of names) {
    const hit = list.find(function (c) { return c.type === type && c.name === n })
    if (hit) return hit
  }
  return null
}

/**
 * 老库一次性迁移到两级结构。**幂等**（跑完判据自动变假），**只碰 category 表**。
 *
 * 做什么：
 * 1. 老叶子（早餐/午餐/…）按名字挂到新一级下（餐饮/交通/人情…）
 * 2. 老的一级（住房）按别名**改名**成规范名（居住），而不是新插一行留个孤儿
 * 3. 缺失的一级 / 二级补插
 * 4. 按事实源规范每组排序号
 *
 * 不做什么：**不新建、不删除、不修改任何 transaction_record**。
 *
 * @returns {Promise<boolean>} 是否真的执行了迁移
 */
export async function migrateCategoryTree() {
  let list = await categoryRepo.listAll()
  const needs = list.some(function (c) {
    return isExpense(c.type) && isTopLevel(c) && LEGACY_LEAF_NAMES.indexOf(c.name) !== -1
  })
  if (!needs) return false

  const refresh = async function () { list = await categoryRepo.listAll() }

  for (const p of EXPENSE_TREE) {
    const names = [p.name].concat(p.aliases || [])
    let prow = pickByNames(list, TYPE_EXPENSE, names)

    if (!prow) {
      await categoryRepo.insert({
        name: p.name, type: TYPE_EXPENSE, icon: p.icon, sort: 0, parent_id: null
      })
      await refresh()
      prow = pickByNames(list, TYPE_EXPENSE, [p.name])
    } else {
      // 一级必须是规范名、且 parent_id 为空（万一是被别人挂走的行，先纠正）
      const patch = {}
      if (prow.name !== p.name) patch.name = p.name
      if (!isTopLevel(prow)) patch.parent_id = null
      if (Object.keys(patch).length) {
        await categoryRepo.update(prow.id, patch)
        await refresh()
      }
    }
    if (!prow) continue

    for (const ch of (p.children || [])) {
      const crow = pickByNames(list, TYPE_EXPENSE, [ch.name])
      if (!crow) {
        await categoryRepo.insert({
          name: ch.name, type: TYPE_EXPENSE, icon: ch.icon, sort: 0, parent_id: prow.id
        })
        await refresh()
      } else if (crow.parent_id !== prow.id) {
        await categoryRepo.update(crow.id, { parent_id: prow.id })
        await refresh()
      }
    }
  }

  await applyTreeSort()
  return true
}

/**
 * 规范排序号（纯函数，便于测试）：
 * - 支出：一级按事实源顺序 1..n；每个一级下二级按事实源顺序 1..m；
 *   **用户自建的**（不在事实源里）按 (sort, id) 追加在该组末尾，不会被吞掉
 * - 收入：一级（及各自的二级）同样按 (sort, id) 规范成 1..n
 *
 * @returns {Array<{id:number, sort:number}>}
 */
export function treeSortPlan(all) {
  const rows = Array.isArray(all) ? all : []
  const byKey = new Map()
  rows.forEach(function (c) {
    const k = rowKey(c.type, c.name)
    if (!byKey.has(k)) byKey.set(k, c)
  })
  const plan = []
  const claimed = new Set()

  /** 把 parentId 下所有还没被认领的二级按 (sort,id) 追加成 1..m */
  function appendGroup(parentId) {
    rows
      .filter(function (c) { return c.parent_id === parentId && !claimed.has(c.id) })
      .sort(bySortId)
      .forEach(function (c, i) {
        plan.push({ id: c.id, sort: i + 1 })
        claimed.add(c.id)
      })
  }

  EXPENSE_TREE.forEach(function (p, pi) {
    const prow = byKey.get(rowKey(TYPE_EXPENSE, p.name))
    if (!prow) return
    plan.push({ id: prow.id, sort: pi + 1 })
    claimed.add(prow.id)

    const kids = []
    ;(p.children || []).forEach(function (ch) {
      const crow = byKey.get(rowKey(TYPE_EXPENSE, ch.name))
      if (crow && !claimed.has(crow.id)) { kids.push(crow); claimed.add(crow.id) }
    })
    // 该一级下用户自建的二级 → 追加
    const extras = rows
      .filter(function (c) { return c.parent_id === prow.id && !claimed.has(c.id) })
      .sort(bySortId)
    extras.forEach(function (c) { claimed.add(c.id) })
    kids.concat(extras).forEach(function (c, i) {
      plan.push({ id: c.id, sort: i + 1 })
    })
  })

  // 用户自建的支出一级（不在事实源里）→ 追加在末尾
  const extraTops = rows.filter(function (c) {
    return isExpense(c.type) && isTopLevel(c) && !claimed.has(c.id)
  }).sort(bySortId)
  extraTops.forEach(function (c, i) {
    plan.push({ id: c.id, sort: EXPENSE_TREE.length + i + 1 })
    claimed.add(c.id)
    appendGroup(c.id)
  })

  // 收入：平铺，按 (sort, id) 规范
  const incomeTops = rows.filter(function (c) {
    return c.type === TYPE_INCOME && isTopLevel(c) && !claimed.has(c.id)
  }).sort(bySortId)
  incomeTops.forEach(function (c, i) {
    plan.push({ id: c.id, sort: i + 1 })
    claimed.add(c.id)
    appendGroup(c.id)
  })

  return plan
}

/** 把 treeSortPlan 的结果写库（只写 sort 有变化的行） */
async function applyTreeSort() {
  const plan = treeSortPlan(await categoryRepo.listAll())
  for (const item of plan) {
    await categoryRepo.update(item.id, { sort: item.sort })
  }
}

/* ---------------- 读取 ---------------- */

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

/**
 * 分类管理页用的树：一级 + 其二级，且每级带上 `count` 与 `total`（含子级笔数）。
 * 一级的 `total` = 自己 + 所有子级，用于"这个一级下还有 N 笔，不能删"的提示。
 */
export async function listTreeWithStats(type) {
  const [list, stats] = await Promise.all([categoryRepo.listAll(), categoryRepo.statsMap()])
  const cnt = function (id) { return stats.get(id) || 0 }
  const all = list.filter(function (c) { return !type || c.type === type })
  return topLevelOf(all).map(function (p) {
    const children = childrenOf(all, p.id).map(function (c) {
      return Object.assign({}, c, { count: cnt(c.id), total: cnt(c.id) })
    })
    const total = children.reduce(function (s, c) { return s + c.total }, cnt(p.id))
    return { cat: Object.assign({}, p, { count: cnt(p.id), total: total }), children: children }
  })
}

/**
 * 可选图标清单（供"新建/换图标"选择器用）。
 *
 * 传 type 时只返回该类型语义匹配的图标（T3.4）：支出里不该出现「工资」这种收入图标。
 * 顺序按 CATEGORY_ICONS 的声明顺序过滤得出，保证选择器里图标位置稳定、不随分组表漂移。
 * 不传 type / 类型非法时返回全部（兼容旧调用方）。
 *
 * @param {string} [type] 'expense' | 'income'
 * @returns {string[]} icon key 列表
 */
export function iconOptions(type) {
  const all = Object.keys(CATEGORY_ICONS)
  if (type !== TYPE_EXPENSE && type !== TYPE_INCOME) return all
  const picked = (CATEGORY_ICON_GROUPS[type] || []).concat(CATEGORY_ICON_GROUPS.common || [])
  return all.filter(function (k) { return picked.indexOf(k) !== -1 })
}

/* ---------------- 校验 ---------------- */

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

/**
 * 解析 parentId：空/未传 → null（建一级）；否则必须是**同类型的、存在的一级分类**。
 * 只允许挂一级（不做三级 —— 树再深，宫格也放不下）。
 */
async function resolveParent(type, parentId) {
  if (parentId == null || parentId === '' || parentId === 0) return null
  const all = await categoryRepo.listAll()
  const p = all.find(function (c) { return c.id === Number(parentId) })
  if (!p) throw new Error('上级分类不存在')
  if (p.type !== type) throw new Error('不能挂到其它类型的分类下')
  if (!isTopLevel(p)) throw new Error('最多两级，不能挂在二级分类下')
  return p.id
}

/** 同组内重排：sort 从 1 连续编号，避免重复或空洞 */
async function reorderGroup(orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await categoryRepo.update(orderedIds[i], { sort: i + 1 })
  }
}

/** 取出同组（type + 同父）的分类，按 (sort, id) 升序 */
async function siblingsOf(cat) {
  const all = await categoryRepo.listAll()
  return all
    .filter(function (c) {
      return c.type === cat.type && (c.parent_id == null ? null : c.parent_id) === (cat.parent_id == null ? null : cat.parent_id)
    })
    .sort(bySortId)
}

/* ---------------- 增删改 ---------------- */

/**
 * 新建分类，排在**同级最后**。
 * @param {{name:string, type:string, icon:string, parentId?:number|null}} input
 */
export async function create(input) {
  const name = cleanName(input && input.name)
  const type = input && input.type
  if (type !== TYPE_EXPENSE && type !== TYPE_INCOME) throw new Error('分类类型不合法')
  const icon = checkIcon(input && input.icon)
  const parentId = await resolveParent(type, input && input.parentId)

  const all = await categoryRepo.listAll()
  const maxSort = all
    .filter(function (c) {
      return c.type === type && (c.parent_id == null ? null : c.parent_id) === parentId
    })
    .reduce(function (m, c) { return Math.max(m, c.sort) }, 0)

  await categoryRepo.insert({ name: name, type: type, icon: icon, sort: maxSort + 1, parent_id: parentId })
}

export async function rename(id, name) {
  await categoryRepo.update(id, { name: cleanName(name) })
}

export async function setIcon(id, icon) {
  await categoryRepo.update(id, { icon: checkIcon(icon) })
}

/**
 * 在**同组内**（同类型 + 同父级）上移/下移一位（到顶/到底时静默不动，返回 false）。
 * @param {number} id
 * @param {number} dir -1 上移 / +1 下移
 */
export async function move(id, dir) {
  const all = await categoryRepo.listAll()
  const cat = all.find(function (c) { return c.id === Number(id) })
  if (!cat) throw new Error('分类不存在')
  const sibs = await siblingsOf(cat)
  const idx = sibs.findIndex(function (c) { return c.id === cat.id })
  const target = idx + (dir < 0 ? -1 : 1)
  if (target < 0 || target >= sibs.length) return false

  const ids = sibs.map(function (c) { return c.id })
  const tmp = ids[idx]
  ids[idx] = ids[target]
  ids[target] = tmp
  await reorderGroup(ids)
  return true
}

/**
 * 数出「有多少固定支出 / 分类预算在用这个分类」。
 *
 * 纯函数（不碰 DB），方便直接单测各分支。
 *
 * ⚠️ **分类是全局的，固定支出和预算是按账本存的** —— 所以引用可能出现在
 * *任意*账本下，不只是当前账本。调用方需把所有账本的配置都传进来，
 * 否则会出现「在 A 账本删分类、把 B 账本的固定支出搞成孤儿」。
 *
 * @param {Array} fixedList 固定支出配置（跨账本合并）
 * @param {Array} budgetList 预算配置（跨账本合并，category_id 为 null 的是总预算，不计）
 * @param {number} categoryId 被引用的分类 id
 */
export function countRefs(fixedList, budgetList, categoryId) {
  const cid = Number(categoryId)
  const fixed = (Array.isArray(fixedList) ? fixedList : [])
    .filter(function (f) { return Number(f.category_id) === cid }).length
  // 总预算的 category_id 是 null，必须排除，否则 null===0 会误判
  const budget = (Array.isArray(budgetList) ? budgetList : [])
    .filter(function (b) { return b.category_id != null && Number(b.category_id) === cid }).length
  return { fixed: fixed, budget: budget }
}

/**
 * 只允许删除**没有流水、没有子级、也没有被固定支出/预算引用**的分类。
 * 有记录 / 有子级 / 被引用时抛错并说清原因 —— 避免产生孤儿记录、
 * 突然消失的一整组分类，或固定支出悄悄退化成「其他」。
 */
export async function removeIfEmpty(id) {
  const all = await categoryRepo.listAll()
  const cat = all.find(function (c) { return c.id === Number(id) })
  if (!cat) throw new Error('分类不存在')

  const kids = all.filter(function (c) { return c.parent_id === cat.id })
  if (kids.length) throw new Error('这个分类下还有 ' + kids.length + ' 个子分类，先删掉它们再删这个')

  const stats = await categoryRepo.statsMap()
  const n = stats.get(cat.id) || 0
  if (n > 0) throw new Error('这个分类下还有 ' + n + ' 笔记录，先把它们改到别的分类再删')

  // 固定支出 / 预算的引用：**跨所有账本**查（分类是全局的，引用不是）
  const accounts = await accountRepo.listAll()
  // 兜底带上 DEFAULT：正常情况一定有默认账本，但万一account 表空/种子失败，
  // 也不能因此「查不到引用」就把保护整个跳过 —— 那等于静默放开删除。
  const ids = accounts.length ? accounts.map(function (a) { return a.id }) : [DEFAULT_ACCOUNT_ID]
  const fixedAll = []
  const budgetAll = []
  for (const accId of ids) {
    const fs = await fixedRepo.list(accId)
    const bs = await budgetRepo.listByAccount(accId)
    for (const f of fs) fixedAll.push(f)
    for (const b of bs) budgetAll.push(b)
  }
  const refs = countRefs(fixedAll, budgetAll, cat.id)
  if (refs.fixed > 0) {
    throw new Error('有 ' + refs.fixed + ' 笔固定支出在用这个分类，先改掉它们再删')
  }
  if (refs.budget > 0) {
    throw new Error('这个分类还设着预算，先取消预算再删')
  }

  await categoryRepo.remove(cat.id)
  // 删掉后把同组的 sort 重排连续，避免留下空洞
  const rest = (await siblingsOf(cat)).filter(function (c) { return c.id !== cat.id })
  await reorderGroup(rest.map(function (c) { return c.id }))
}
