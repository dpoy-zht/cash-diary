import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import { seedIfEmpty, listAll as listCats } from '../src/services/category.js'
import { seedDefaultIfEmpty } from '../src/services/account.js'
import { useTxStore } from '../src/stores/tx.js'
import { useMetaStore } from '../src/stores/meta.js'
import { useAccountStore } from '../src/stores/account.js'
import * as txService from '../src/services/tx.js'
import * as txRepo from '../src/db/repository/tx.js'
import { ymOf } from '../src/utils/date.js'

/**
 * T3.10 —— onShow 重复全量刷新的治理。
 *
 * 契约：同一份数据（同月份/同账本/版本未变/同一天）下重复调用 refresh 不再打库；
 * 任何写操作（记账/编辑/删除/补记/恢复/重置）或切账本后必须真的重查 —— 宁可多查，不能读到旧数据。
 *
 * 这里不打桩计数，而是"绕过 store 直接改库"来观察：命中缓存时 store 数据不变，失效后才跟着变。
 */
describe('T3.10 —— txStore.refresh 的查询缓存', () => {
  let store
  let meta
  let account
  let ym
  let cat
  let accId

  beforeEach(async () => {
    globalThis.uni = {
      getStorageSync: function () { return 0 },
      setStorageSync: function () {},
      showToast: function () {}
    }
    setActivePinia(createPinia())
    resetStorageForTest()
    await getStorage().init()
    await seedIfEmpty()
    await seedDefaultIfEmpty()
    store = useTxStore()
    meta = useMetaStore()
    account = useAccountStore()
    await account.init()
    accId = account.currentId
    ym = ymOf(Date.now())
    cat = (await listCats()).find(function (c) { return c.type === 'expense' })
  })

  afterEach(() => {
    delete globalThis.uni
    vi.useRealTimers()
  })

  /** 绕过 store 写一笔（模拟"数据变了但没人调 bump"的极端场景） */
  async function addBehindStore(amount) {
    await txService.addTx({
      amountStr: amount,
      categoryId: cat.id,
      type: 'expense',
      note: '',
      ts: Date.now(),
      accountId: accId
    })
  }

  it('数据没变时重复 refresh 命中缓存，不再重查', async () => {
    await addBehindStore('10')
    await store.refresh(ym)
    expect(store.records.length).toBe(1)

    // 绕过 store 直接软删（版本号没变）
    await getStorage().txSoftDelete(store.records[0].id)

    await store.refresh(ym)
    expect(store.records.length).toBe(1) // 命中缓存：这一轮没有打库

    meta.bumpData()
    await store.refresh(ym)
    expect(store.records.length).toBe(0) // 版本变了 → 必须重查
  })

  it('store 自己的写操作（记账/编辑/删除）自动让缓存失效', async () => {
    await store.refresh(ym)
    expect(store.records.length).toBe(0)

    await store.add(ym, { amountStr: '20', categoryId: cat.id, type: 'expense', note: '', ts: Date.now() })
    expect(store.records.length).toBe(1)

    await store.update(ym, store.records[0].id, { amountStr: '30' })
    expect(store.records[0].amount_cents).toBe(3000)

    await store.remove(ym, store.records[0].id)
    expect(store.records.length).toBe(0)
  })

  it('force=true 时无视缓存强制重查', async () => {
    await addBehindStore('10')
    await store.refresh(ym)
    expect(store.records.length).toBe(1)

    await getStorage().txSoftDelete(store.records[0].id)
    await store.refresh(ym, { force: true })
    expect(store.records.length).toBe(0)
  })

  it('切换账本后缓存自动失效（键里带账本 id）', async () => {
    await addBehindStore('10')
    await store.refresh(ym)
    expect(store.records.length).toBe(1)

    const created = await account.create('测试账本')
    account.setCurrent(created)
    await store.refresh(ym)
    expect(store.records.length).toBe(0) // 新账本还没有流水

    account.setCurrent(accId)
    await store.refresh(ym)
    expect(store.records.length).toBe(1) // 切回原账本数据仍在
  })

  it('跨天后自动重查（"近两年时间戳"的窗口在移动）', async () => {
    await addBehindStore('10')
    await store.refresh(ym)
    expect(store.records.length).toBe(1)

    await getStorage().txSoftDelete(store.records[0].id)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 86400000))
    await store.refresh(ym)
    expect(store.records.length).toBe(0)
  })

  it('刷新失败不留下"已刷新"的假象，下次调用会真的重试', async () => {
    await addBehindStore('10')
    const spy = vi.spyOn(txRepo, 'listByMonth').mockRejectedValueOnce(new Error('boom'))
    await expect(store.refresh(ym)).rejects.toThrow('boom')
    spy.mockRestore()

    expect(store.records.length).toBe(0) // 上一轮确实没加载成功
    await store.refresh(ym)
    expect(store.records.length).toBe(1) // 重试后拿到数据
  })
})
