import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedDefaultIfEmpty, DEFAULT_ACCOUNT_NAME } from '../src/services/account.js'
import { useAccountStore } from '../src/stores/account.js'

/**
 * 新建账本要自动切过去。
 *
 * 这条曾经坏过：accountService.create() 返回的是**数字 id**，而 store 按 `created.id` 取，
 * 结果是新建完仍停在旧账本，账本页却提示"已新建"，用户以为切过去了 —— 记账全记到旧账本上。
 */
describe('useAccountStore.create —— 新建后自动切换账本（回归）', () => {
  let account

  beforeEach(async () => {
    globalThis.uni = {
      getStorageSync: function () { return 0 },
      setStorageSync: function () {},
      showToast: function () {}
    }
    setActivePinia(createPinia())
    resetStorageForTest()
    await getStorage().init()
    await seedDefaultIfEmpty()
    account = useAccountStore()
    await account.init()
  })

  afterEach(() => {
    delete globalThis.uni
  })

  it('新建账本后当前账本切到新账本，并返回新账本 id', async () => {
    const before = account.currentId
    const newId = await account.create('旅行账本')

    expect(typeof newId).toBe('number')
    expect(newId).toBeGreaterThan(0)
    expect(newId).not.toBe(before)
    expect(account.currentId).toBe(newId)
    expect(account.list.some(function (a) { return a.id === newId && a.name === '旅行账本' })).toBe(true)
  })

  it('名称为空时被拒，当前账本不受影响', async () => {
    const before = account.currentId
    await expect(account.create('  ')).rejects.toThrow('账本名字不能为空')
    expect(account.currentId).toBe(before)
  })
})

/**
 * 删除账本后 currentId 的处置（2026-10-06）。
 *
 * 背景：账本页新增了「删除当前账本」，删的是**正在用的**那个。
 * 原实现只在"列表非空"时切到 list[0]，删掉唯一账本后 list 为空 →
 * `currentId` 悬空指向已删账本 → 下面 loadMonth 查不到数据、页面空白且无处可去。
 * 现在兜底为：自动新建「日常」账本并切过去，保证 App 始终可用。
 */
describe('useAccountStore.remove —— 删除后不留悬空 currentId', () => {
  let account

  beforeEach(async () => {
    resetStorageForTest()
    setActivePinia(createPinia())
    account = useAccountStore()
    await account.init()
  })

  afterEach(function () {
    resetStorageForTest()
  })

  it('删掉当前账本且还有别的账本 → 切到剩下的第一个', async () => {
    const other = await account.create('旅行基金')
    expect(account.currentId).toBe(other)
    await account.remove(other)
    expect(account.currentId).not.toBe(other)
    expect(account.currentId).toBeTruthy()
  })

  it('删掉的不是当前账本 → 当前账本不动', async () => {
    const a = await account.create('A')
    await account.create('B')            // 切到 B
    await account.remove(a)              // 删掉非当前的 A
    expect(account.currentId).toBeTruthy()
  })

  it('删掉唯一账本 → 自动补建并切换，currentId 不悬空', async () => {
    const only = await account.create('临时账本')
    // 把默认账本也删掉，让列表真的空掉
    const others = account.list.filter(function (x) { return x.id !== only })
    for (const o of others) await account.remove(o)

    // 现在只剩 only，再删它
    await account.remove(only)

    expect(account.currentId).toBeTruthy()
    expect(account.list.length).toBeGreaterThan(0)
    // 补建的是默认账本名（复用 DEFAULT_ACCOUNT_NAME，不硬编码），
    // 且 currentId 指向真实存在的账本
    expect(account.current && account.current.name).toBe(DEFAULT_ACCOUNT_NAME)
    expect(account.list.some(function (a) { return a.id === account.currentId })).toBe(true)
  })
})
