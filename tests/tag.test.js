import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import * as tagRepo from '../src/db/repository/tag.js'
import {
  normalizeTagName,
  parseTagInput,
  pickTagColor,
  dedupeTagIds,
  summarizeTags,
  groupTagIdsByTx,
  exceedsPerTxLimit,
  formatTagsCell,
  TAG_COLORS,
  MAX_TAG_NAME,
  MAX_TAGS_PER_TX
} from '../src/utils/tag.js'
import { buildBackup, validateBackup, BACKUP_VERSION, BACKUP_APP } from '../src/utils/backup.js'

describe('utils/tag 纯函数', () => {
  it('normalizeTagName：压空白、截断、空串视为非法', () => {
    expect(normalizeTagName('  报销  ')).toBe('报销')
    expect(normalizeTagName('给  妈妈   买药')).toBe('给 妈妈 买药')
    expect(normalizeTagName('')).toBe('')
    expect(normalizeTagName('   ')).toBe('')
    expect(normalizeTagName(null)).toBe('')
    expect(normalizeTagName(undefined)).toBe('')
    const long = '一二三四五六七八九十十一十二十三'
    expect(normalizeTagName(long).length).toBe(MAX_TAG_NAME)
    expect(normalizeTagName(long)).toBe(long.slice(0, MAX_TAG_NAME))
  })

  it('parseTagInput：支持多种分隔符、去重、丢空项', () => {
    expect(parseTagInput('报销，出差、给妈妈 买药')).toEqual(['报销', '出差', '给妈妈', '买药'])
    expect(parseTagInput('a,b/a，b')).toEqual(['a', 'b'])
    expect(parseTagInput('  ,  , ')).toEqual([])
    expect(parseTagInput('')).toEqual([])
    expect(parseTagInput(null)).toEqual([])
  })

  it('pickTagColor：按序取色、循环、非法输入兜底第一个', () => {
    expect(pickTagColor(0)).toBe(TAG_COLORS[0])
    expect(pickTagColor(TAG_COLORS.length)).toBe(TAG_COLORS[0])
    expect(pickTagColor(-1)).toBe(TAG_COLORS[0])
    expect(pickTagColor('abc')).toBe(TAG_COLORS[0])
  })

  it('dedupeTagIds：只留正整数、去重、升序（让同样的集合产生同样的数组）', () => {
    expect(dedupeTagIds([3, 1, 3, 2])).toEqual([1, 2, 3])
    expect(dedupeTagIds([0, -1, 2.5, '4', 4])).toEqual([4])
    expect(dedupeTagIds(null)).toEqual([])
    expect(dedupeTagIds('nope')).toEqual([])
  })

  it('summarizeTags：超出上限折叠为 +N', () => {
    expect(summarizeTags([1, 2, 3, 4], 2)).toEqual({ shown: [1, 2], more: 2 })
    expect(summarizeTags([1], 2)).toEqual({ shown: [1], more: 0 })
    expect(summarizeTags([], 2)).toEqual({ shown: [], more: 0 })
    expect(summarizeTags([1, 2], 0)).toEqual({ shown: [], more: 2 })
  })

  // 回归：不传 max 时必须走默认值 2。曾因先 Number() 再判 null（NaN == null 为 false）
  // 算出 n = NaN，导致一个标签都不显示。
  it('summarizeTags 不传 max 时用默认值 2（NaN 兜底回归）', () => {
    expect(summarizeTags([1])).toEqual({ shown: [1], more: 0 })
    expect(summarizeTags([1, 2, 3])).toEqual({ shown: [1, 2], more: 1 })
    expect(summarizeTags([1, 2, 3], null)).toEqual({ shown: [1, 2], more: 1 })
    expect(summarizeTags([1, 2, 3], 'abc')).toEqual({ shown: [1, 2], more: 1 })
  })

  it('groupTagIdsByTx：按流水分组、组内升序、丢非法行', () => {
    const map = groupTagIdsByTx([
      { transaction_id: 7, tag_id: 2 },
      { transaction_id: 7, tag_id: 1 },
      { transaction_id: 8, tag_id: 5 },
      { transaction_id: 0, tag_id: 5 },
      { transaction_id: 9, tag_id: -1 },
      { transaction_id: 7, tag_id: 2 }
    ])
    expect(map).toEqual({ 7: [1, 2], 8: [5] })
  })

  it('exceedsPerTxLimit：按一笔流水的标签数上限判断', () => {
    expect(exceedsPerTxLimit([1, 2, 3], 3)).toBe(false)
    expect(exceedsPerTxLimit([1, 2, 3, 4], 3)).toBe(true)
    expect(exceedsPerTxLimit([1, 1, 1], 3)).toBe(false)
    expect(exceedsPerTxLimit([], 3)).toBe(false)
    // 回归：不传 max 时用默认上限（曾因 NaN 兜底错误恒为 false）
    expect(exceedsPerTxLimit([1, 2, 3, 4, 5])).toBe(false)
    expect(exceedsPerTxLimit([1, 2, 3, 4, 5, 6])).toBe(true)
    expect(exceedsPerTxLimit([1, 2, 3, 4, 5, 6], null)).toBe(true)
    expect(exceedsPerTxLimit([1, 2, 3, 4, 5, 6], 'abc')).toBe(true)
    expect(new Array(MAX_TAGS_PER_TX + 1).fill(0).map(function (_, i) { return i + 1 }).length).toBe(MAX_TAGS_PER_TX + 1)
  })

  it('formatTagsCell：用 | 连接，逗号留给 CSV 分隔符', () => {
    expect(formatTagsCell(['报销', '出差'])).toBe('报销|出差')
    expect(formatTagsCell([])).toBe('')
    expect(formatTagsCell([' a ', ''])).toBe('a')
    expect(formatTagsCell(null)).toBe('')
  })
})

describe('标签数据层（memory 适配器全链路）', () => {
  let s

  beforeEach(async () => {
    resetStorageForTest()
    s = getStorage()
    await s.init()
    await s.accountInsert({ id: 1, name: '日常账本', created_at: 1 })
  })

  function tagRow(name, sort) {
    return { account_id: 1, name: name, color: '', sort: sort == null ? 0 : sort, created_at: 100, updated_at: 100 }
  }

  it('新增/列出：按 sort 再 id 升序', async () => {
    const b = await tagRepo.insert(tagRow('出差', 2))
    const a = await tagRepo.insert(tagRow('报销', 1))
    const list = await tagRepo.list(1)
    expect(list.map(function (t) { return t.id })).toEqual([a, b])
    expect(list.map(function (t) { return t.name })).toEqual(['报销', '出差'])
  })

  it('改名与换色：只改传入的字段', async () => {
    const id = await tagRepo.insert(tagRow('报销', 0))
    await tagRepo.update(id, { name: '公司报销', updated_at: 200 })
    const t = (await tagRepo.list(1))[0]
    expect(t.name).toBe('公司报销')
    expect(t.updated_at).toBe(200)
  })

  it('挂标签：覆写语义——重复设置同一集合不会累积', async () => {
    const t1 = await tagRepo.insert(tagRow('报销', 0))
    const t2 = await tagRepo.insert(tagRow('出差', 1))
    const txId = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })

    await tagRepo.setTagsForTx(txId, [t1, t2])
    await tagRepo.setTagsForTx(txId, [t1, t2])
    expect(groupTagIdsByTx(await tagRepo.tagRowsByTxs([txId]))[txId]).toEqual([t1, t2])

    await tagRepo.setTagsForTx(txId, [t2])
    expect(groupTagIdsByTx(await tagRepo.tagRowsByTxs([txId]))[txId]).toEqual([t2])

    await tagRepo.setTagsForTx(txId, [])
    expect(await tagRepo.tagRowsByTxs([txId])).toEqual([])
  })

  it('tagRowsByTxs：一次取一批流水的标签（避免 N+1），空入参不查库', async () => {
    const t1 = await tagRepo.insert(tagRow('报销', 0))
    const base = { account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', created_at: 1, updated_at: 1, deleted_at: null }
    const tx1 = await s.txInsert(Object.assign({}, base, { occurred_at: 1 }))
    const tx2 = await s.txInsert(Object.assign({}, base, { occurred_at: 2 }))
    await tagRepo.setTagsForTx(tx1, [t1])
    const map = groupTagIdsByTx(await tagRepo.tagRowsByTxs([tx1, tx2]))
    expect(map[tx1]).toEqual([t1])
    expect(map[tx2]).toBeUndefined()
    expect(await tagRepo.tagRowsByTxs([])).toEqual([])
    expect(await tagRepo.tagRowsByTxs(null)).toEqual([])
  })

  it('refCount 只算未删除的流水；关联行随流水软删除一起被忽略', async () => {
    const t1 = await tagRepo.insert(tagRow('报销', 0))
    const base = { account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', created_at: 1, updated_at: 1, deleted_at: null }
    const tx1 = await s.txInsert(Object.assign({}, base, { occurred_at: 1 }))
    const tx2 = await s.txInsert(Object.assign({}, base, { occurred_at: 2 }))
    await tagRepo.setTagsForTx(tx1, [t1])
    await tagRepo.setTagsForTx(tx2, [t1])
    expect(await tagRepo.refCount(t1)).toBe(2)

    await s.txSoftDelete(tx1) // 软删除后关联行还在，但不应再算引用
    expect(await tagRepo.refCount(t1)).toBe(1)
  })

  it('删标签：连同关联一起删，不留脏关联', async () => {
    const t1 = await tagRepo.insert(tagRow('报销', 0))
    const txId = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    await tagRepo.setTagsForTx(txId, [t1])
    await tagRepo.remove(t1)
    expect(await tagRepo.list(1)).toEqual([])
    expect(await tagRepo.tagRowsByTxs([txId])).toEqual([])
  })

  it('两适配器的表清单一致：dumpAll 必须带上新表', async () => {
    const dump = await s.dumpAll()
    expect(Array.isArray(dump.tag)).toBe(true)
    expect(Array.isArray(dump.transaction_tag)).toBe(true)
  })
})

describe('备份 v3 —— 标签随备份走，且老备份仍能恢复', () => {
  it('buildBackup 输出标签两张表，版本号为 3', () => {
    const b = buildBackup({
      account: [{ id: 1, name: 'a', created_at: 1 }],
      category: [],
      transaction_record: [],
      budget: [],
      fixed_expense: [],
      tag: [{ id: 1, name: '报销' }],
      transaction_tag: [{ transaction_id: 1, tag_id: 1 }]
    }, 1)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.tag.length).toBe(1)
    expect(b.transaction_tag.length).toBe(1)
  })

  it('v3 备份缺 tag 表 → 判为不完整（不能静默丢标签）', () => {
    const b = buildBackup({ account: [{ id: 1, name: 'a', created_at: 1 }] }, 1)
    delete b.tag
    const r = validateBackup(b)
    expect(r.ok).toBe(false)
  })

  it('v2 老备份（没有 tag 字段）仍能通过校验，counts 里标签计 0', () => {
    const legacy = {
      app: BACKUP_APP,
      version: 2,
      exportedAt: 1,
      account: [{ id: 1, name: '默认账本', created_at: 1 }],
      category: [{ id: 1, name: '餐饮', type: 'expense', icon: '🍜', sort: 1 }],
      transaction_record: [{ id: 1, account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null }],
      budget: [],
      fixed_expense: []
    }
    const r = validateBackup(legacy)
    expect(r.ok).toBe(true)
    expect(r.counts.tag).toBe(0)
    expect(r.counts.transaction_tag).toBe(0)
  })

  it('标签数据非法（缺名字）→ 整份拒绝', () => {
    const b = buildBackup({ account: [{ id: 1, name: 'a', created_at: 1 }], tag: [{ id: 1, name: '' }] }, 1)
    expect(validateBackup(b).ok).toBe(false)
  })

  it('标签关联行不合法（tag_id 为 0）→ 整份拒绝', () => {
    const b = buildBackup({
      account: [{ id: 1, name: 'a', created_at: 1 }],
      tag: [{ id: 1, name: '报销' }],
      transaction_tag: [{ transaction_id: 1, tag_id: 0 }]
    }, 1)
    expect(validateBackup(b).ok).toBe(false)
  })
})
