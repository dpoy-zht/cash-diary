import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedDefaultIfEmpty } from '../src/services/account.js'
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
