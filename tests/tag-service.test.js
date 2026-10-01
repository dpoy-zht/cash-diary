import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedDefaultIfEmpty } from '../src/services/account.js'
import * as tagService from '../src/services/tag.js'
import { MAX_TAGS, MAX_TAGS_PER_TX } from '../src/utils/tag.js'
import { useAccountStore } from '../src/stores/account.js'
import { useTagStore } from '../src/stores/tag.js'
import { useMetaStore } from '../src/stores/meta.js'

describe('services/tag —— 标签业务规则', () => {
  let s

  beforeEach(async () => {
    globalThis.uni = {
      getStorageSync: function () { return 0 },
      setStorageSync: function () {},
      showToast: function () {}
    }
    resetStorageForTest()
    s = getStorage()
    await s.init()
    await s.accountInsert({ id: 1, name: '日常账本', created_at: 1 })
  })

  afterEach(() => { delete globalThis.uni })

  it('create：名称为空被拒、首尾空白与连续空白被归一化', async () => {
    await expect(tagService.create(1, '   ')).rejects.toThrow('标签名不能为空')
    const r = await tagService.create(1, '  给  妈妈 买药 ')
    expect(r.name).toBe('给 妈妈 买药')
    const list = await tagService.list(1)
    expect(list.map(function (t) { return t.name })).toEqual(['给 妈妈 买药'])
  })

  it('create：重名被拒（含归一化后同名）', async () => {
    await tagService.create(1, '报销')
    await expect(tagService.create(1, ' 报销 ')).rejects.toThrow('已经有「报销」了')
    expect((await tagService.list(1)).length).toBe(1)
  })

  it('create：自动按序配色，超出色板循环', async () => {
    const a = await tagService.create(1, 'a')
    const b = await tagService.create(1, 'b')
    const list = await tagService.list(1)
    expect(list.find(function (t) { return t.id === a.id }).color).toBe('c1')
    expect(list.find(function (t) { return t.id === b.id }).color).toBe('c2')
  })

  it('create：达到上限后被拒', async () => {
    for (let i = 0; i < MAX_TAGS; i += 1) await tagService.create(1, 'tag' + i)
    await expect(tagService.create(1, 'one-more')).rejects.toThrow('标签最多 ' + MAX_TAGS + ' 个')
  })

  it('createMany：分隔符拆分、重名跳过、达到上限时置 full 并跳过', async () => {
    await tagService.create(1, '报销')
    // 注意：同一个输入串里的重复由 parseTagInput 先去重（'报销' 出现两次只算一个），
    // 所以 skipped 反映的是"与库里已有的重名"，不是输入串里的重复。
    const r = await tagService.createMany(1, '报销，出差、打车 报销')
    expect(r.created).toEqual(['出差', '打车'])
    expect(r.skipped).toEqual(['报销'])
    expect(r.full).toBe(false)

    // 补到上限后再批量建：新的全部跳过并标记 full
    let n = (await tagService.list(1)).length
    while (n < MAX_TAGS) { await tagService.create(1, 'fill' + n); n += 1 }
    const r2 = await tagService.createMany(1, '溢出一号 溢出二号')
    expect(r2.created).toEqual([])
    expect(r2.skipped).toEqual(['溢出一号', '溢出二号'])
    expect(r2.full).toBe(true)
  })

  it('createMany：空输入被拒', async () => {
    await expect(tagService.createMany(1, '   ')).rejects.toThrow('请输入标签名')
  })

  it('update：改名去重（与自己同名不算重复）、换色', async () => {
    const a = await tagService.create(1, '报销')
    await tagService.create(1, '出差')
    await tagService.update(1, a.id, { name: '报销' }) // 与自己同名 → 允许
    await expect(tagService.update(1, a.id, { name: '出差' })).rejects.toThrow('已经有「出差」了')
    await tagService.update(1, a.id, { color: 'c5' })
    await tagService.update(1, a.id, {})
    const t = (await tagService.list(1)).find(function (x) { return x.id === a.id })
    expect(t.color).toBe('c5')
    expect(t.name).toBe('报销')
  })

  it('remove：被未删除流水引用时拒绝并报出笔数；取消关联后可删', async () => {
    const t = await tagService.create(1, '报销')
    const tx = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    await tagService.setTxTags(1, tx, [t.id])
    await expect(tagService.remove(1, t.id)).rejects.toThrow('有 1 笔账在用这个标签')

    await tagService.setTxTags(1, tx, [])
    await tagService.remove(1, t.id)
    expect(await tagService.list(1)).toEqual([])
  })

  it('setTxTags：一笔超上限被拒、跨账本串标签被拒、正常返回升序 id', async () => {
    await s.accountInsert({ id: 2, name: '旅行', created_at: 1 })
    const mine = await tagService.create(1, '我的')
    const other = await tagService.create(2, '别人的')
    const tx = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })

    const tooMany = []
    for (let i = 0; i < MAX_TAGS_PER_TX + 1; i += 1) tooMany.push(i + 1)
    await expect(tagService.setTxTags(1, tx, tooMany)).rejects.toThrow('一笔最多打 ' + MAX_TAGS_PER_TX + ' 个标签')

    await expect(tagService.setTxTags(1, tx, [other.id])).rejects.toThrow('不属于当前账本')

    const ids = await tagService.setTxTags(1, tx, [mine.id, mine.id])
    expect(ids).toEqual([mine.id])
  })
})

describe('useTagStore —— 状态层', () => {
  let tagStore
  let metaStore
  let s

  beforeEach(async () => {
    globalThis.uni = {
      getStorageSync: function () { return 0 },
      setStorageSync: function () {},
      showToast: function () {}
    }
    setActivePinia(createPinia())
    resetStorageForTest()
    s = getStorage()
    await s.init()
    await seedDefaultIfEmpty()
    const account = useAccountStore()
    await account.init()
    tagStore = useTagStore()
    metaStore = useMetaStore()
    await tagStore.load()
  })

  afterEach(() => { delete globalThis.uni })

  it('create 后列表自动刷新，count / isFull 正确', async () => {
    expect(tagStore.count).toBe(0)
    expect(tagStore.isFull).toBe(false)
    await tagStore.create('报销')
    expect(tagStore.count).toBe(1)
    expect(tagStore.list[0].name).toBe('报销')
  })

  it('nameOf / colorOf 对未知 id 不返回 undefined', async () => {
    const t = await tagStore.create('出差')
    expect(tagStore.nameOf(t.id)).toBe('出差')
    expect(tagStore.nameOf(99999)).toBe('已删除的标签')
    expect(tagStore.colorOf(99999)).toBe('')
    expect(tagStore.tagOf(99999)).toBe(null)
  })

  it('setTxTags 会 bumpData（让列表页的标签 chip 重画）', async () => {
    const t = await tagStore.create('报销')
    const tx = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    const before = metaStore.dataVersion
    await tagStore.setTxTags(tx, [t.id])
    expect(metaStore.dataVersion).toBeGreaterThan(before)
    expect(await tagStore.mapByTxs([tx])).toEqual({ [tx]: [t.id] })
  })

  it('rename 会 bumpData；remove 之后 list 同步', async () => {
    const t = await tagStore.create('报销')
    const before = metaStore.dataVersion
    await tagStore.rename(t.id, '公司报销')
    expect(metaStore.dataVersion).toBeGreaterThan(before)
    expect(tagStore.nameOf(t.id)).toBe('公司报销')

    await tagStore.remove(t.id)
    expect(tagStore.count).toBe(0)
  })

  it('被引用的标签删除会抛错，页面可 catch 后 toast', async () => {
    const t = await tagStore.create('报销')
    const tx = await s.txInsert({ account_id: 1, category_id: 1, type: 'expense', amount_cents: 100, note: '', occurred_at: 1, created_at: 1, updated_at: 1, deleted_at: null })
    await tagStore.setTxTags(tx, [t.id])
    await expect(tagStore.remove(t.id)).rejects.toThrow('先去取消关联再删')
    expect(tagStore.count).toBe(1)
  })
})
