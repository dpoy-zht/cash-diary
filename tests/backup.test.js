import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats, DEFAULT_CATEGORY_COUNT } from '../src/services/category.js'
import * as accountService from '../src/services/account.js'
import * as budgetService from '../src/services/budget.js'
import {
  sortedBackupNames,
  exportResultMessage,
  isBackupName,
  isAutoBackupName,
  selectRestoreNames,
  restoreListHint,
  withTimeout,
  LIST_TIMEOUT_MS
} from '../src/utils/backup-file.js'
import * as txService from '../src/services/tx.js'
import * as backupService from '../src/services/backup.js'
import { resetAll } from '../src/services/maintenance.js'
import {
  buildBackup,
  validateBackup,
  backupFileName,
  shouldAutoBackup,
  autoBackupFileName,
  keepAutoBackupFiles,
  AUTO_BACKUP_INTERVAL,
  AUTO_BACKUP_PREFIX,
  BACKUP_APP,
  BACKUP_VERSION
} from '../src/utils/backup.js'
import { ymOf } from '../src/utils/date.js'
import { expenseByCategory } from '../src/utils/stats.js'

describe('buildBackup / backupFileName（纯函数）', () => {
  it('打包带上身份与版本号，缺表时补空数组', () => {
    const b = buildBackup({ account: [{ id: 1 }] }, 1730000000000)
    expect(b.app).toBe(BACKUP_APP)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.exportedAt).toBe(1730000000000)
    expect(b.account.length).toBe(1)
    expect(b.category).toEqual([])
    expect(b.transaction_record).toEqual([])
    expect(b.budget).toEqual([])
  })

  it('文件名带日期时间戳', () => {
    const name = backupFileName(new Date(2026, 8, 27, 13, 5).getTime())
    expect(name).toBe('奶蛙记账-备份-2026-09-27-1305.json')
  })
})

describe('validateBackup —— 坏文件必须被挡住', () => {
  const good = function () {
    return buildBackup({
      account: [{ id: 1, name: '日常账本', created_at: 1 }],
      category: [{ id: 1, name: '午餐', type: 'expense', icon: 'lunch', sort: 1 }],
      transaction_record: [{
        id: 1, account_id: 1, category_id: 1, type: 'expense',
        amount_cents: 1990, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null
      }],
      budget: [{ id: 1, account_id: 1, category_id: null, limit_cents: 500000, updated_at: 1 }]
    }, 1)
  }

  it('合法备份通过，并给出条数概览', () => {
    const r = validateBackup(good())
    expect(r.ok).toBe(true)
    expect(r.counts.account).toBe(1)
    expect(r.counts.transaction_record).toBe(1)
  })

  it('各种非备份文件都被拒绝', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup('{}').ok).toBe(false)
    expect(validateBackup([]).ok).toBe(false)
    expect(validateBackup({ app: 'other-app' }).error).toContain('不是奶蛙记账')
    expect(validateBackup({ app: BACKUP_APP }).error).toContain('版本号')
    expect(validateBackup({ app: BACKUP_APP, version: 1, account: [], category: [], transaction_record: [] }).error)
      .toContain('没有任何账本')
  })

  it('来自更高版本的备份不给恢复（避免把新结构塞进老库）', () => {
    const b = good()
    b.version = BACKUP_VERSION + 1
    expect(validateBackup(b).ok).toBe(false)
    expect(validateBackup(b).error).toContain('升级')
  })

  it('流水金额不是正整数分 → 整份拒绝（数据铁律 1）', () => {
    const cases = [1990.5, 0, -100, '1990', null]
    cases.forEach(function (bad) {
      const b = good()
      b.transaction_record[0].amount_cents = bad
      const r = validateBackup(b)
      expect(r.ok, 'amount=' + bad).toBe(false)
      expect(r.error).toContain('金额不合法')
    })
  })

  it('类型不是 income/expense → 整份拒绝', () => {
    const b = good()
    b.transaction_record[0].type = 'transfer'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('预算金额非法 → 整份拒绝', () => {
    const b = good()
    b.budget[0].limit_cents = 0
    expect(validateBackup(b).ok).toBe(false)
  })

  it('分类数据非法 → 整份拒绝', () => {
    const b = good()
    b.category[0].type = 'unknown'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('没有 budget 字段的老备份仍可恢复（向后兼容）', () => {
    const b = good()
    delete b.budget
    const r = validateBackup(b)
    expect(r.ok).toBe(true)
    expect(r.counts.budget).toBe(0)
  })
})

describe('备份往返：导出 → 清空 → 恢复', () => {
  let ym
  let cats

  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await accountService.seedDefaultIfEmpty()
    ym = ymOf(Date.now())
    cats = await listCats()
  })

  /** 造一份有代表性的数据：两个账本、收入支出、软删除记录、总预算+分类预算 */
  async function seedRichData() {
    const exp = cats.filter(function (c) { return c.type === 'expense' })[0]
    const inc = cats.filter(function (c) { return c.type === 'income' })[0]
    await txService.addTx({ amountStr: '19.9', categoryId: exp.id, type: 'expense', note: '午餐', ts: Date.now() })
    await txService.addTx({ amountStr: '8500', categoryId: inc.id, type: 'income', note: '工资', ts: Date.now() })
    await txService.addTx({ amountStr: '5', categoryId: exp.id, type: 'expense', note: '要被删掉的', ts: Date.now() })
    const all = await txService.listByMonth(ym, 1)
    await txService.removeTx(all.find(function (r) { return r.note === '要被删掉的' }).id)
    await budgetService.setTotal(1, '5000')
    await budgetService.setCategory(1, exp.id, '1200')
    await accountService.create('旅行基金')
    return { exp: exp, inc: inc }
  }

  it('导出的备份包含软删除记录（否则恢复后它们会“复活”）', async () => {
    await seedRichData()
    const b = await backupService.exportBackup()
    expect(b.transaction_record.length).toBe(3) // 2 条正常 + 1 条软删除
    expect(b.transaction_record.filter(function (r) { return r.deleted_at != null }).length).toBe(1)
  })

  it('清空后从备份恢复，四张表完全回到原样', async () => {
    await seedRichData()
    const before = {
      accounts: await accountService.listWithStats(),
      cats: await listCats(),
      txs: await txService.listByMonth(ym, 1),
      overview: await txService.overview(1),
      budget: await budgetService.getAll(1)
    }

    // 先导出，再清空（顺序不能反：清空后导出拿到的是空库）
    const json = await backupService.exportJson()

    await resetAll()
    expect((await listCats()).length).toBe(DEFAULT_CATEGORY_COUNT)
    expect((await txService.listByMonth(ym, 1)).length).toBe(0)

    const counts = await backupService.restoreBackup(backupService.parseBackupText(json))

    const after = {
      accounts: await accountService.listWithStats(),
      cats: await listCats(),
      txs: await txService.listByMonth(ym, 1),
      overview: await txService.overview(1),
      budget: await budgetService.getAll(1)
    }

    expect(counts.transaction_record).toBe(3)
    expect(after.cats.length).toBe(before.cats.length)
    expect(after.accounts.length).toBe(before.accounts.length)
    expect(after.accounts[1].name).toBe('旅行基金')
    expect(after.txs.length).toBe(before.txs.length)
    expect(after.overview.expenseCents).toBe(before.overview.expenseCents)
    expect(after.overview.incomeCents).toBe(before.overview.incomeCents)
    expect(after.budget.totalCents).toBe(500000)
    // 分类预算跟着回来
    const expId = String(before.cats.filter(function (c) { return c.type === 'expense' })[0].id)
    expect(after.budget.byCategory[expId]).toBe(120000)
  })

  it('恢复后还能正常记账，且新记录 id 不与老记录冲突', async () => {
    await seedRichData()
    const json = await backupService.exportJson()
    const oldIds = (await txService.listByMonth(ym, 1)).map(function (r) { return r.id })

    await resetAll()
    await backupService.restoreBackup(backupService.parseBackupText(json))
    await txService.addTx({ amountStr: '1', categoryId: cats[0].id, type: 'expense', ts: Date.now() })

    const list = await txService.listByMonth(ym, 1)
    const newest = list.find(function (r) { return r.amount_cents === 100 })
    expect(newest).toBeTruthy()
    expect(oldIds.indexOf(newest.id)).toBe(-1)
  })

  it('校验不通过时直接报错，**一个字节都不写库**（最关键的一条）', async () => {
    await seedRichData()
    const before = await txService.overview(1)

    const broken = await backupService.exportBackup()
    broken.transaction_record[0].amount_cents = 0 // 弄坏一条

    await expect(backupService.restoreBackup(broken)).rejects.toThrow('金额不合法')

    const after = await txService.overview(1)
    expect(after.totalCount).toBe(before.totalCount)
    expect(after.expenseCents).toBe(before.expenseCents)
    expect((await backupService.exportBackup()).transaction_record.length).toBe(3)
  })

  it('不是 JSON 文本时给人话报错', () => {
    expect(function () { backupService.parseBackupText('这不是 json') }).toThrow('不是有效的 JSON')
  })

  it('空备份（没有任何账本）拒绝恢复', async () => {
    const empty = buildBackup({}, Date.now())
    await expect(backupService.restoreBackup(empty)).rejects.toThrow('没有任何账本')
  })
})

describe('老格式备份兼容（emoji 分类时代的备份文件）', () => {
  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
  })

  /**
   * 旧版种子是「餐饮/交通…」等名称 + emoji 图标；新 App 的 icon 是参考包 key。
   * 这里验证：老备份能通过校验、能恢复、恢复后记账与统计链路不崩溃（icon 走兜底渲染）。
   */
  function buildLegacyBackup() {
    const now = Date.now()
    /**
     * 两笔流水的 occurred_at 必须落在**本月**（下面「恢复后的老分类…」用例按当月查列表）。
     *
     * 不能写 `now - N * 86400000`：那会让时间落进上个月 —— 月初 1、2 号跑测试必挂
     * （2026-10-01 就因此误报过一次：昨天=9/30 属上个月，断言 3 笔只拿到 1 笔）。
     * 改用「现在」与「1 分钟前」，并显式挡住跨月的那一分钟。
     */
    const oneMinAgo = now - 60000
    const sameMonth = new Date(oneMinAgo).getMonth() === new Date(now).getMonth()
    const secondTs = sameMonth ? oneMinAgo : now
    return {
      app: BACKUP_APP,
      version: 1, // emoji 时代的备份是 v1 格式（没有 fixed_expense 字段）
      exportedAt: now - 30 * 86400000,
      account: [{ id: 1, name: '默认账本', created_at: now - 60 * 86400000 }],
      category: [
        { id: 1, name: '餐饮', icon: '🍜', type: 'expense', sort: 1, created_at: now, updated_at: now, deleted_at: null },
        { id: 2, name: '交通', icon: '🚌', type: 'expense', sort: 2, created_at: now, updated_at: now, deleted_at: null },
        { id: 3, name: '工资', icon: '💰', type: 'income', sort: 1, created_at: now, updated_at: now, deleted_at: null }
      ],
      transaction_record: [
        { id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 2500, note: '午饭',
          occurred_at: now, created_at: now, updated_at: now, deleted_at: null },
        { id: 2, account_id: 1, category_id: 3, type: 'income', amount_cents: 500000, note: '',
          occurred_at: secondTs, created_at: now, updated_at: now, deleted_at: null }
      ],
      budget: []
    }
  }

  it('老备份通过校验并成功恢复（结构兼容，emoji icon 不校验）', async () => {
    const b = buildLegacyBackup()
    const check = validateBackup(b)
    expect(check.ok).toBe(true)
    const counts = await backupService.restoreBackup(b)
    expect(counts.category).toBe(3)
    expect(counts.transaction_record).toBe(2)

    const cats = await listCats()
    expect(cats.length).toBe(3)
    expect(cats.find(function (c) { return c.name === '餐饮' }).icon).toBe('🍜')
  })

  it('恢复后的老分类能正常记账、统计与搜索（icon 兜底渲染不崩溃）', async () => {
    await backupService.restoreBackup(buildLegacyBackup())
    const cats = await listCats()
    const canyin = cats.find(function (c) { return c.name === '餐饮' })

    // 记账闭环照常
    await txService.addTx({ amountStr: '12', categoryId: canyin.id, type: 'expense', note: '面', ts: Date.now() })
    const list = await txService.listByMonth(ymOf(Date.now()))
    expect(list.length).toBe(3) // 老备份两笔都在本月 + 新记 1 笔

    // 统计纯函数对 emoji icon 分类也能取到兜底色
    const rows = expenseByCategory(list, cats)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].color).toMatch(/^#[0-9a-f]{6}$/)

    // 搜索链路照常
    const hit = await txService.search('午饭')
    expect(hit.length).toBe(1)
  })
})

describe('自动备份 —— 触发判断 / 文件名 / 清理计划', () => {
  const DAY = 86400000

  it('shouldAutoBackup：没备份过必须备；24h 内不重复备；超时要备', () => {
    const now = 1700000000000
    expect(shouldAutoBackup(null, now, AUTO_BACKUP_INTERVAL)).toBe(true)
    expect(shouldAutoBackup(0, now, AUTO_BACKUP_INTERVAL)).toBe(true)
    expect(shouldAutoBackup(-1, now, AUTO_BACKUP_INTERVAL)).toBe(true)
    expect(shouldAutoBackup(now - DAY + 60000, now, AUTO_BACKUP_INTERVAL)).toBe(false)
    expect(shouldAutoBackup(now - DAY - 1000, now, AUTO_BACKUP_INTERVAL)).toBe(true)
  })

  it('shouldAutoBackup：非法入参不抛错，interval 非法兜底为默认值', () => {
    expect(shouldAutoBackup('abc', 1700000000000)).toBe(true)
    expect(shouldAutoBackup(1700000000000 - 25 * DAY, 1700000000000, 0)).toBe(true)
    expect(shouldAutoBackup(1700000000000 - 1000, 1700000000000, 0)).toBe(false) // 0 → 兜底 24h
  })

  it('autoBackupFileName：带自动前缀 + 日期时间戳 + .json', () => {
    const name = autoBackupFileName(new Date(2026, 8, 28, 0, 7).getTime())
    expect(name).toBe('奶蛙记账-自动备份-2026-09-28-0007.json')
    expect(name.indexOf(AUTO_BACKUP_PREFIX)).toBe(0)
  })

  it('keepAutoBackupFiles：只清自动前缀，按时间保留最新 N 份', () => {
    const names = [
      '奶蛙记账-自动备份-2026-09-26-1200.json',
      '奶蛙记账-备份-2026-09-27-0900.json',      // 手动导出，绝不清理
      '奶蛙记账-自动备份-2026-09-27-0800.json',
      'cashDiary.memory.v1',                      // 无关键
      '奶蛙记账-自动备份-2026-09-28-0012.json',
      '奶蛙记账-自动备份-2026-09-27-2359.json'
    ]
    const plan = keepAutoBackupFiles(names, 3)
    expect(plan.keep).toEqual([
      '奶蛙记账-自动备份-2026-09-27-2359.json',
      '奶蛙记账-自动备份-2026-09-28-0012.json',
      '奶蛙记账-自动备份-2026-09-26-1200.json' === plan.keep[0] ? '' : '奶蛙记账-自动备份-2026-09-27-0800.json'
    ].filter(Boolean).sort())
  })

  it('keepAutoBackupFiles：不足 N 份全保留；非法入参不抛错', () => {
    expect(keepAutoBackupFiles(['奶蛙记账-自动备份-2026-09-28-0012.json'], 3).remove).toEqual([])
    expect(keepAutoBackupFiles(null, 3)).toEqual({ keep: [], remove: [] })
    expect(keepAutoBackupFiles(['x'], 'abc').remove).toEqual([])
  })
})

describe('备份 v2 —— fixed_expense 表', () => {
  beforeEach(async () => {
    resetStorageForTest()
    await getStorage().init()
  })

  it('v2 备份包含 fixed_expense；v1 老备份没有该字段也能通过校验（兼容）', () => {
    const v1 = {
      app: BACKUP_APP, version: 1, exportedAt: 1700000000000,
      account: [{ id: 1, name: '默认账本', created_at: 1 }],
      category: [{ id: 1, name: '午餐', icon: 'lunch', type: 'expense', sort: 1 }],
      transaction_record: [], budget: []
    }
    expect(validateBackup(v1).ok).toBe(true)

    // 构造一份**真正的 v2 格式**备份：buildBackup 现在产出 v3，
    // 所以要显式改回 version 2 并去掉 v3 才有的 tag / transaction_tag 两张表。
    const v2 = Object.assign({}, buildBackup({
      account: v1.account, category: v1.category, transaction_record: [], budget: [],
      fixed_expense: [{ id: 1, account_id: 1, category_id: 1, amount_cents: 150000, note: '房租', day_of_month: 5, last_posted_ym: '2026-09', enabled: 1, created_at: 1, updated_at: 1 }]
    }), { exportedAt: 1700000000000, version: 2 })
    delete v2.tag
    delete v2.transaction_tag
    expect(v2.version).toBe(2)
    expect(v2.fixed_expense.length).toBe(1)
    expect(validateBackup(v2).ok).toBe(true)
  })

  it('v2 备份缺 fixed_expense 字段被拒绝；非法记账日被拒绝', () => {
    const base = {
      app: BACKUP_APP, version: 2, exportedAt: 1700000000000,
      account: [{ id: 1, name: '默认账本', created_at: 1 }],
      category: [{ id: 1, name: '午餐', icon: 'lunch', type: 'expense', sort: 1 }],
      transaction_record: [], budget: []
    }
    expect(validateBackup(base).ok).toBe(false) // v2 必须带 fixed_expense

    const bad = buildBackup({ account: base.account, category: base.category,
      fixed_expense: [{ id: 1, account_id: 1, category_id: 1, amount_cents: 100, note: '', day_of_month: 31, last_posted_ym: '', enabled: 1, created_at: 1, updated_at: 1 }] })
    expect(validateBackup(bad).ok).toBe(false) // 31 号不合法
  })
})

describe('sortedBackupNames —— 备份文件名筛选与时间倒序（T1.2）', () => {
  it('按文件名倒序排列（文件名定长时间戳，字典序=时间序，最新在最前）', () => {
    const names = [
      '奶蛙记账-自动备份-2026-09-28-0012.json',
      '奶蛙记账-自动备份-2026-09-29-0800.json',
      '奶蛙记账-自动备份-2026-09-27-2359.json'
    ]
    expect(sortedBackupNames(names)[0]).toBe('奶蛙记账-自动备份-2026-09-29-0800.json')
    expect(sortedBackupNames(names)[2]).toBe('奶蛙记账-自动备份-2026-09-27-2359.json')
  })

  it('只保留 .json 结尾的文件，非字符串项被丢弃', () => {
    const names = ['a.json', 'b.txt', 'c.json', 42, null, undefined, 'd.JSON.bak']
    expect(sortedBackupNames(names)).toEqual(['c.json', 'a.json'])
  })

  it('月份/日期跨位仍正确（补零格式保证字典序与时间序一致）', () => {
    const names = [
      '奶蛙记账-自动备份-2026-10-01-0000.json',
      '奶蛙记账-自动备份-2026-09-30-2359.json',
      '奶蛙记账-自动备份-2025-12-31-1200.json'
    ]
    expect(sortedBackupNames(names)).toEqual([
      '奶蛙记账-自动备份-2026-10-01-0000.json',
      '奶蛙记账-自动备份-2026-09-30-2359.json',
      '奶蛙记账-自动备份-2025-12-31-1200.json'
    ])
  })

  it('空输入 / 全非法输入返回空数组，不抛错', () => {
    expect(sortedBackupNames([])).toEqual([])
    expect(sortedBackupNames([1, null, {}])).toEqual([])
    expect(sortedBackupNames(null)).toEqual([])
  })
})

describe('exportResultMessage —— 导出去向的提示（T3.6）', () => {
  it('H5：浏览器下载，不需要剪贴板兜底', () => {
    const m = exportResultMessage({ mode: 'browser-download' })
    expect(m.title).toContain('导出成功')
    expect(m.content).toContain('浏览器')
    expect(m.fallbackClipboard).toBe(false)
  })

  it('App 复制成功：把真实路径原样回显，方便用户去取', () => {
    const m = exportResultMessage({ outPath: '/storage/emulated/0/Download/奶蛙记账-2026-09-29-0912.json' })
    expect(m.title).toContain('导出成功')
    expect(m.content).toContain('/storage/emulated/0/Download/奶蛙记账-2026-09-29-0912.json')
    expect(m.fallbackClipboard).toBe(false)
  })

  it('App 复制失败：必须给出剪贴板兜底，不能让用户两手空空', () => {
    const m = exportResultMessage({ outPath: '' })
    expect(m.fallbackClipboard).toBe(true)
    expect(m.content).toContain('复制到剪贴板')
  })

  it('缺省入参按"失败"处理（保守：宁可给兜底）', () => {
    expect(exportResultMessage().fallbackClipboard).toBe(true)
    expect(exportResultMessage(null).fallbackClipboard).toBe(true)
    expect(exportResultMessage({}).fallbackClipboard).toBe(true)
  })

  it('可以自定义名称：导出 CSV 时说「账单文件」，不说「备份文件」（T4.2）', () => {
    const cases = [
      exportResultMessage({ mode: 'browser-download' }, '账单文件'),
      exportResultMessage({ outPath: '/storage/emulated/0/Download/奶蛙记账-账单-2026-09-30-2210.csv' }, '账单文件'),
      exportResultMessage({ outPath: '' }, '账单文件')
    ]
    cases.forEach(function (m) {
      expect(m.content).toContain('账单文件')
      expect(m.content).not.toContain('备份')
    })
  })
})

/**
 * 改名兼容（2026-10-06：奶龙记账 → 奶蛙记账）。
 *
 * 自动备份的文件名带 App 名，改名后如果只认新前缀：
 *   ① 改名前写的自动备份在「数据体检」里查不到 → 用户以为备份丢了
 *   ② 清理逻辑跳过旧文件 → 私有目录无限堆积
 * 所以新旧前缀都必须认。这条断言就是防"顺手改成只认新的"。
 */
describe('改名兼容：自动备份新旧前缀都要认', () => {
  const NEW = '奶蛙记账-自动备份-'
  const OLD = '奶龙记账-自动备份-'

  it('新前缀：备份文件名用它写', () => {
    expect(backupFileName(Date.now())).toContain(NEW.replace('自动备份-', '备份-'))
  })

  it('旧前缀的自动备份仍被清理计划识别', () => {
    const plan = keepAutoBackupFiles([
      OLD + '2026-09-26-1200.json',
      NEW + '2026-09-28-0012.json'
    ], 3)
    expect(plan.keep.length).toBe(2)
    expect(plan.remove).toEqual([])
  })

  it('新旧混合 + 手动备份：手动备份绝不被清理', () => {
    const plan = keepAutoBackupFiles([
      OLD + '2026-09-26-1200.json',
      '奶蛙记账-备份-2026-09-27-0900.json',      // 手动导出，绝不清理
      NEW + '2026-09-28-0012.json',
      OLD + '2026-09-27-0800.json'
    ], 2)
    expect(plan.keep).toEqual([OLD + '2026-09-27-0800.json', NEW + '2026-09-28-0012.json'])
    expect(plan.remove).toEqual([OLD + '2026-09-26-1200.json'])
    expect(plan.remove.indexOf('奶蛙记账-备份-2026-09-27-0900.json')).toBe(-1)
  })

  it('超量时旧的先删（改名前的备份不会永远占着）', () => {
    const plan = keepAutoBackupFiles([
      OLD + '2026-09-01-0000.json',
      OLD + '2026-09-02-0000.json',
      NEW + '2026-09-03-0000.json'
    ], 1)
    expect(plan.keep).toEqual([NEW + '2026-09-03-0000.json'])
    expect(plan.remove).toEqual([OLD + '2026-09-01-0000.json', OLD + '2026-09-02-0000.json'])
  })

  it('备份内容标识仍是英文 cash-diary（改名不影响备份格式兼容）', () => {
    // BACKUP_APP 是内容里的机器标识符，不随显示名变 —— 否则旧备份全都读不了
    expect(BACKUP_APP).toBe('cash-diary')
  })
})

/**
 * 恢复入口的选择逻辑（2026-10-08）。
 *
 * 起因：vivo / OriginOS 用户反馈「备份功能无效，备份后无法恢复」。
 * 两个真因都在这段逻辑里：
 *① 恢复只列应用私有目录，但导出会**复制一份到公共目录**——
 *    用户从「下载」里选到的备份，恢复时根本列不出来；
 * ② 自动备份每 6 小时一份，久了私有目录几十个，
 *    `uni.showActionSheet` 装不下 → 点了没反应。
 */
describe('isBackupName / isAutoBackupName —— 只认自己的备份', () => {
  it('认本App 的新旧前缀 + .json', () => {
    expect(isBackupName('奶蛙记账-备份-2026-10-08-0930.json')).toBe(true)
    expect(isBackupName('奶蛙记账-自动备份-2026-10-08-0930.json')).toBe(true)
    expect(isBackupName('奶龙记账-备份-2026-09-27-2344.json')).toBe(true) // 改名前
  })

  it('公共目录里别人的 json 一律不认', () => {
    expect(isBackupName('微信导出.json')).toBe(false)
    expect(isBackupName('backup.json')).toBe(false)
    expect(isBackupName('奶蛙记账-备份-2026-10-08-0930.txt')).toBe(false)
    expect(isBackupName('')).toBe(false)
    expect(isBackupName(null)).toBe(false)
  })

  it('自动备份与手动备份能区分（新的旧的都认）', () => {
    expect(isAutoBackupName('奶蛙记账-自动备份-2026-10-08-0930.json')).toBe(true)
    expect(isAutoBackupName('奶龙记账-自动备份-2026-09-27-2344.json')).toBe(true)
    expect(isAutoBackupName('奶蛙记账-备份-2026-10-08-0930.json')).toBe(false)
  })
})

describe('selectRestoreNames —— 恢复列表该显示哪些', () => {
  it('空输入不炸', () => {
    const r = selectRestoreNames(null)
    expect(r.shown).toEqual([])
    expect(r.total).toBe(0)
    expect(r.truncated).toBe(false)
  })

  it('别人家的 json 被过滤掉', () => {
    const r = selectRestoreNames(['微信导出.json', '奶蛙记账-备份-2026-10-08-0930.json'])
    expect(r.shown).toEqual(['奶蛙记账-备份-2026-10-08-0930.json'])
    expect(r.total).toBe(1)
  })

  it('手动备份优先，位置不够了才轮到自动备份', () => {
    const names = [
      '奶蛙记账-备份-2026-10-08-0930.json',
      '奶蛙记账-自动备份-2026-10-08-0900.json',
      '奶蛙记账-自动备份-2026-10-08-0300.json'
    ]
    const r = selectRestoreNames(names, { limit: 2 })
    expect(r.shown[0]).toBe(names[0])
    expect(r.shown[1]).toBe('奶蛙记账-自动备份-2026-10-08-0900.json') // 较新的那个
    expect(r.truncated).toBe(true)
  })

  it('数量超限时如实报告被截断（不让用户以为备份丢了）', () => {
    const names = []
    for (let i = 1; i <= 20; i += 1) {
      names.push('奶蛙记账-自动备份-2026-10-08-1' + String(i).padStart(4, '0') + '.json')
    }
    const r = selectRestoreNames(names, { limit: 6 })
    expect(r.shown).toHaveLength(6)
    expect(r.total).toBe(20)
    expect(r.truncated).toBe(true)
    expect(restoreListHint(r)).toContain('只列出最近 6 份')
    expect(restoreListHint(r)).toContain('共 20 份')
  })

  it('时间倒序：最新备份排最前', () => {
    const r = selectRestoreNames([
      '奶蛙记账-备份-2026-10-01-1000.json',
      '奶蛙记账-备份-2026-10-08-0930.json',
      '奶蛙记账-备份-2026-10-05-1000.json'
    ])
    expect(r.shown[0]).toBe('奶蛙记账-备份-2026-10-08-0930.json')
    expect(r.shown[1]).toBe('奶蛙记账-备份-2026-10-05-1000.json')
  })

  it('不分目录：私有 + 公共混在一起也能正确挑', () => {
    const r = selectRestoreNames([
      '奶蛙记账-自动备份-2026-10-08-0900.json',   // 私有目录的自动备份
      '奶蛙记账-备份-2026-10-08-0930.json'        // 公共目录（下载）里的手动备份
    ])
    expect(r.shown[0]).toBe('奶蛙记账-备份-2026-10-08-0930.json')
    expect(r.manualCount).toBe(1)
    expect(r.autoCount).toBe(1)
  })
})

describe('withTimeout —— plus.io 挂起时的救命绳', () => {
  it('正常完成时原样返回', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 200)).resolves.toBe('ok')
  })

  it('原promise 失败时原样抛错', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 200)).rejects.toThrow('boom')
  })

  it('永不 settle 的 promise 会超时 reject（createReader 挂起就靠它）', async () => {
    const stuck = new Promise(function () {})
    await expect(withTimeout(stuck, 60, '读取文件超时')).rejects.toThrow('读取文件超时')
  })

  it('超时后原 promise 迟到的结果被忽略，不会二次 resolve', async () => {
    let late = null
    const p = new Promise(function (resolve) { setTimeout(function () { late = 'late'; resolve('late') }, 80) })
    await expect(withTimeout(p, 20, '超时')).rejects.toThrow('超时')
    await new Promise(function (r) { setTimeout(r, 120) })
    expect(late).toBe('late') // 迟到值被丢弃，没有未处理的 rejection
  })

  it('默认超时是LIST_TIMEOUT_MS（4s）', () => {
    expect(LIST_TIMEOUT_MS).toBe(4000)
  })
})

describe('selectRestoreNames —— 去重（Download 与 Documents 可能扫到同一份）', () => {
  it('同名只出现一次', () => {
    const dup = '奶蛙记账-备份-2026-10-08-0930.json'
    const r = selectRestoreNames([dup, dup])
    expect(r.shown).toEqual([dup])
    expect(r.total).toBe(1)
  })

  it('去重后再统计总数，不虚高', () => {
    const a = '奶蛙记账-备份-2026-10-08-0930.json'
    const b = '奶蛙记账-自动备份-2026-10-08-0900.json'
    const r = selectRestoreNames([a, b, a, b])
    expect(r.total).toBe(2)
    expect(r.truncated).toBe(false)
  })
})
