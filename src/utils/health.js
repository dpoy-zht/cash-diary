/**
 * 数据体检（T4.6）：把整库数据过一遍，找出"不对劲但平时看不出来"的记录。
 *
 * 为什么要有这一层：这些记录平时完全不影响使用 —— 直到某天导出备份被拒
 * （validateBackup 会拦下非法金额）、或者某笔账突然从统计里消失。
 * 与其等用户在恢复时撞上，不如主动扫出来。
 *
 * 两条原则：
 * 1. **报警必须可解释**：每条问题都给"几条、什么样的、为什么要紧"，
 *    只说"有 3 个问题"等于没说。
 * 2. **修复必须可预期**：能修的只做"有唯一正确答案"的修复
 *    （孤儿指向改到「其他」、非整数金额取整），拿不准的一律只提示不代劳 ——
 *    删用户的钱是绝不允许"顺手帮忙"的。
 *
 * 纯函数：输入四张表 + 备份时间，输出问题清单与修复计划，不碰存储。
 */
import { CATEGORY_ICONS } from './palette.js'
import { toDateStr } from './date.js'
import { formatCents } from './money.js'

/** 多久没备份就算"过旧"（天） */
export const STALE_BACKUP_DAYS = 7

/** 严重程度：high 会让备份/恢复出问题，mid 是数据语义脏，low 只是提醒 */
export const SEVERITY = { HIGH: 'high', MID: 'mid', LOW: 'low' }

/** 最多展示几条样例（弹窗/页面放不下更多，也不需要） */
const MAX_SAMPLES = 3

function liveTx(rows) {
  return (Array.isArray(rows) ? rows : []).filter(function (r) {
    return r && r.deleted_at == null
  })
}

/** 需要怎么处理这条记录的金额：'' = 正常，'round' = 取整写回，'delete' = 没救了 */
function amountFix(v) {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return 'delete'
  if (typeof v !== 'number' || !Number.isInteger(n)) return 'round'
  return ''
}

/** 孤儿记录要落到的分类：优先「其他」，其次该类型第一个分类；一个都没有 → null */
function fallbackCategory(categories, type) {
  const same = (Array.isArray(categories) ? categories : []).filter(function (c) {
    return c && c.type === type
  })
  if (!same.length) return null
  return same.find(function (c) { return c.name === '其他' }) || same[0]
}

/** 孤儿记录要落到的账本：优先默认账本 1，其次第一个账本 */
function fallbackAccount(accounts) {
  const list = Array.isArray(accounts) ? accounts : []
  if (!list.length) return null
  return list.find(function (a) { return Number(a.id) === 1 }) || list[0]
}

function txLine(t, catById) {
  const cat = catById.get(t.category_id)
  const who = cat ? cat.name : '分类已不存在'
  const cents = Number(t.amount_cents)
  const money = isFinite(cents) ? '¥' + formatCents(Math.abs(cents)) : String(t.amount_cents)
  return toDateStr(Number(t.occurred_at) || 0) + ' ' + who + ' ' + money
}

function issue(o) {
  return {
    key: o.key,
    severity: o.severity,
    title: o.title,
    count: o.count,
    samples: (o.samples || []).slice(0, MAX_SAMPLES),
    fixable: !!o.fixable,
    fixHint: o.fixHint || '',
    advice: o.advice || '',
    payload: o.payload || null
  }
}

/**
 * 扫描体检。
 *
 * @param {object} input
 * @param {object} input.tables { account, category, transaction_record, budget, fixed_expense }
 * @param {number} [input.lastBackupAt] 上次备份时间（毫秒；0/缺省 = 从未）
 * @param {number} [input.nowTs] 当前时间（测试注入）
 * @param {number} [input.staleBackupDays] 备份过旧阈值
 * @returns {{stats:object, issues:Array, healthy:boolean, fixableCount:number}}
 */
export function scanHealth(input) {
  const src = input || {}
  const tables = src.tables || {}
  const accounts = Array.isArray(tables.account) ? tables.account : []
  const categories = Array.isArray(tables.category) ? tables.category : []
  const budgets = Array.isArray(tables.budget) ? tables.budget : []
  const fixed = Array.isArray(tables.fixed_expense) ? tables.fixed_expense : []
  const now = Number(src.nowTs == null ? Date.now() : src.nowTs)
  const staleDays = Math.max(1, Math.floor(Number(src.staleBackupDays) || STALE_BACKUP_DAYS))

  const catById = new Map(categories.map(function (c) { return [c.id, c] }))
  const accIds = new Set(accounts.map(function (a) { return a.id }))
  const live = liveTx(tables.transaction_record)

  const issues = []

  /* ---- 1. 流水的分类已不存在 ---- */
  const orphanCat = live.filter(function (t) { return !catById.has(t.category_id) })
  if (orphanCat.length) {
    const patches = []
    orphanCat.forEach(function (t) {
      const fb = fallbackCategory(categories, t.type)
      if (fb) patches.push({ id: t.id, patch: { category_id: fb.id } })
    })
    const fixable = patches.length > 0
    issues.push(issue({
      key: 'orphan-tx-category',
      severity: SEVERITY.HIGH,
      title: '有流水的分类已经不存在了',
      count: orphanCat.length,
      samples: orphanCat.map(function (t) { return txLine(t, catById) }),
      fixable: fixable,
      fixHint: fixable ? '把这些流水归到同类型的「其他」分类' : '',
      advice: fixable ? '' : '分类表里一个同类分类都没有，请先在「分类管理」里建一个',
      payload: fixable ? { txPatches: patches } : null
    }))
  }

  /* ---- 2. 流水的账本已不存在 ---- */
  const orphanAcc = live.filter(function (t) { return !accIds.has(t.account_id) })
  if (orphanAcc.length) {
    const fb = fallbackAccount(accounts)
    issues.push(issue({
      key: 'orphan-tx-account',
      severity: SEVERITY.HIGH,
      title: '有流水挂在不存在的账本上',
      count: orphanAcc.length,
      samples: orphanAcc.map(function (t) { return txLine(t, catById) + '（账本 #' + t.account_id + '）' }),
      fixable: !!fb,
      fixHint: fb ? '把这些流水归到「' + fb.name + '」' : '',
      advice: fb ? '' : '账本表是空的，请先新建一个账本',
      payload: fb ? { txPatches: orphanAcc.map(function (t) { return { id: t.id, patch: { account_id: fb.id } } }) } : null
    }))
  }

  /* ---- 3. 金额不合法（备份/恢复会直接拒绝整份文件） ---- */
  const roundable = []
  const hopeless = []
  live.forEach(function (t) {
    const f = amountFix(t.amount_cents)
    if (f === 'round') roundable.push(t)
    else if (f === 'delete') hopeless.push(t)
  })
  if (roundable.length) {
    issues.push(issue({
      key: 'amount-round',
      severity: SEVERITY.HIGH,
      title: '有流水的金额不是整数分',
      count: roundable.length,
      samples: roundable.map(function (t) { return txLine(t, catById) + '（原值 ' + t.amount_cents + '）' }),
      fixable: true,
      fixHint: '四舍五入到整数分',
      payload: { txPatches: roundable.map(function (t) { return { id: t.id, patch: { amount_cents: Math.round(Number(t.amount_cents)) } } }) }
    }))
  }
  if (hopeless.length) {
    issues.push(issue({
      key: 'amount-bad',
      severity: SEVERITY.HIGH,
      title: '有流水的金额读不出来（0 或非数字）',
      count: hopeless.length,
      samples: hopeless.map(function (t) { return txLine(t, catById) + '（原值 ' + t.amount_cents + '）' }),
      fixable: true,
      fixHint: '删掉这些没有金额的流水',
      advice: '金额已经丢失，无法猜回原值；删掉后统计与备份才能恢复正常',
      payload: { txDeletes: hopeless.map(function (t) { return t.id }) }
    }))
  }

  /* ---- 4. 预算挂在已删除的分类上 ---- */
  const orphanBudget = budgets.filter(function (b) {
    return b && b.category_id != null && !catById.has(b.category_id)
  })
  if (orphanBudget.length) {
    issues.push(issue({
      key: 'orphan-budget',
      severity: SEVERITY.MID,
      title: '有分类预算指向已经不存在的分类',
      count: orphanBudget.length,
      samples: orphanBudget.map(function (b) {
        return '分类 #' + b.category_id + ' 预算 ¥' + formatCents(Number(b.limit_cents) || 0)
      }),
      fixable: true,
      fixHint: '删掉这些失效的预算',
      payload: {
        budgetDeletes: orphanBudget.map(function (b) {
          return { account_id: b.account_id, category_id: b.category_id }
        })
      }
    }))
  }

  /* ---- 5. 固定支出挂在已删除的分类上（不修的话每月都会补记到不存在的分类） ---- */
  const orphanFixed = fixed.filter(function (f) {
    return f && f.category_id != null && !catById.has(f.category_id)
  })
  if (orphanFixed.length) {
    issues.push(issue({
      key: 'orphan-fixed',
      severity: SEVERITY.MID,
      title: '有固定支出指向已经不存在的分类',
      count: orphanFixed.length,
      samples: orphanFixed.map(function (f) {
        return '每月 ' + Number(f.day_of_month) + ' 日 ¥' + formatCents(Number(f.amount_cents) || 0)
      }),
      fixable: true,
      fixHint: '删掉这些失效的固定支出配置',
      advice: '留着的话每个月都会自动补记到不存在的分类上',
      payload: { fixedDeletes: orphanFixed.map(function (f) { return f.id }) }
    }))
  }

  /* ---- 6. 分类图标的 key 不在词表里（只会显示成怪字符，改不改为用户决定） ---- */
  const badIcon = categories.filter(function (c) {
    return c && c.icon && !CATEGORY_ICONS[c.icon]
  })
  if (badIcon.length) {
    issues.push(issue({
      key: 'bad-icon',
      severity: SEVERITY.LOW,
      title: '有分类的图标取不到（会显示成怪字符）',
      count: badIcon.length,
      samples: badIcon.map(function (c) { return (c.name || '未命名') + '（icon: ' + c.icon + '）' }),
      fixable: true,
      fixHint: '换成通用图标',
      payload: { categoryPatches: badIcon.map(function (c) { return { id: c.id, patch: { icon: 'more' } } }) }
    }))
  }

  /* ---- 7. 时间明显在未来的流水（多半是选错了日期） ---- */
  const future = live.filter(function (t) {
    const ts = Number(t.occurred_at) || 0
    return ts > now + 86400000
  })
  if (future.length) {
    issues.push(issue({
      key: 'future-tx',
      severity: SEVERITY.LOW,
      title: '有流水的时间在将来（可能日期选错了）',
      count: future.length,
      samples: future.map(function (t) { return txLine(t, catById) }),
      fixable: false,
      advice: '请到流水列表里核对这几笔的日期（也可能是提前记的账，那就不用管）'
    }))
  }

  /* ---- 8. 备份过旧 ---- */
  const lastBackupAt = Number(src.lastBackupAt) || 0
  if (!lastBackupAt) {
    issues.push(issue({
      key: 'no-backup',
      severity: SEVERITY.LOW,
      title: '还没有备份过',
      count: 1,
      fixable: false,
      advice: '到「数据备份与恢复」导出一次，或者配上「云备份」自动存一份'
    }))
  } else {
    const days = Math.floor((now - lastBackupAt) / 86400000)
    if (days >= staleDays) {
      issues.push(issue({
        key: 'stale-backup',
        severity: SEVERITY.LOW,
        title: '备份已经是 ' + days + ' 天前的了',
        count: 1,
        samples: [toDateStr(lastBackupAt) + ' 备份过'],
        fixable: false,
        advice: '到「数据备份与恢复」再导出一份'
      }))
    }
  }

  const fixableCount = issues.filter(function (it) { return it.fixable }).length
  return {
    stats: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: live.length,
      deletedTransactions: (Array.isArray(tables.transaction_record) ? tables.transaction_record.length : 0) - live.length,
      budgets: budgets.length,
      fixedExpenses: fixed.length,
      lastBackupAt: lastBackupAt
    },
    issues: issues,
    healthy: issues.length === 0,
    fixableCount: fixableCount
  }
}

/**
 * 把问题清单合并成一份待执行的修复计划。
 * 只收集 fixable 的项；执行顺序由 services 层决定（先改后删，改不会失败）。
 * @returns {{txPatches:Array, txDeletes:Array, budgetDeletes:Array, fixedDeletes:Array, categoryPatches:Array, summary:Array}}
 */
export function collectFixes(scan) {
  const out = {
    txPatches: [],
    txDeletes: [],
    budgetDeletes: [],
    fixedDeletes: [],
    categoryPatches: [],
    summary: []
  }
  const issues = (scan && scan.issues) || []
  issues.forEach(function (it) {
    if (!it || !it.fixable || !it.payload) return
    const p = it.payload
    out.txPatches = out.txPatches.concat(p.txPatches || [])
    out.txDeletes = out.txDeletes.concat(p.txDeletes || [])
    out.budgetDeletes = out.budgetDeletes.concat(p.budgetDeletes || [])
    out.fixedDeletes = out.fixedDeletes.concat(p.fixedDeletes || [])
    out.categoryPatches = out.categoryPatches.concat(p.categoryPatches || [])
    if (it.fixHint) out.summary.push(it.fixHint)
  })
  return out
}
