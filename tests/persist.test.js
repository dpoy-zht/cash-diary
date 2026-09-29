import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getStorage, resetStorageForTest } from '../src/db/index.js'
import * as catRepo from '../src/db/repository/category.js'
import { flush as flushPersist, setPersistErrorHandler } from '../src/db/memory.js'

/**
 * T3.9 —— H5（memory 适配器）落盘策略：
 * 内存即时生效、磁盘合并延迟写；写失败要能被上层感知，且内存数据不丢。
 *
 * 这里给 memory 适配器装一个"假的 localStorage"，用它观察真实落盘时机与内容。
 */
const LS_KEY = 'cashDiary.memory.v1'

let store
let writeCount
let failNext

function installStorage() {
  store = new Map()
  writeCount = 0
  failNext = false
  globalThis.localStorage = {
    getItem: function (k) { return store.has(k) ? store.get(k) : null },
    setItem: function (k, v) {
      if (failNext) {
        const e = new Error('QuotaExceededError')
        e.name = 'QuotaExceededError'
        throw e
      }
      writeCount += 1
      store.set(k, String(v))
    },
    removeItem: function (k) { store.delete(k) }
  }
}

/**
 * 磁盘上真实的分类条数（内存态不算）
 */
function persistedCatCount() {
  const raw = store.get(LS_KEY)
  if (!raw) return 0
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed.category) ? parsed.category.length : 0
}

describe('T3.9 —— 落盘防抖 / 失败可感知（memory 适配器）', () => {
  beforeEach(async () => {
    // 防抖是时间驱动的，必须用受控时钟：真实 setTimeout 在并行跑全量测试时不可靠
    vi.useFakeTimers()
    installStorage()
    setPersistErrorHandler(null)
    resetStorageForTest()
    await getStorage().init() // init 走 flush：立刻落地
  })

  afterEach(() => {
    resetStorageForTest()
    setPersistErrorHandler(null)
    delete globalThis.localStorage
    vi.useRealTimers()
  })

  it('写操作内存即时生效，磁盘按防抖延迟落盘', async () => {
    await catRepo.insert({ name: '早餐', type: 'expense', icon: 'breakfast', sort: 1 })

    // 内存里已经有了（页面读得到）
    expect(await catRepo.count()).toBe(1)
    // 磁盘还没写（防抖中）——这是"批量写只落一次盘"的前提
    expect(persistedCatCount()).toBe(0)

    flushPersist()
    expect(persistedCatCount()).toBe(1)
  })

  it('连续多次写只触发一次落盘', async () => {
    const base = writeCount
    for (let i = 0; i < 5; i += 1) {
      await catRepo.insert({ name: 'c' + i, type: 'expense', icon: 'more', sort: i + 1 })
    }
    expect(writeCount).toBe(base) // 防抖期间一次都没写

    vi.advanceTimersByTime(260)
    expect(writeCount).toBe(base + 1) // 5 次写合并成 1 次落盘
    expect(persistedCatCount()).toBe(5)
  })

  it('flush 立刻落盘，且不会留下待执行的定时器再写一遍', async () => {
    await catRepo.insert({ name: '午餐', type: 'expense', icon: 'lunch', sort: 1 })
    const afterFlush = writeCount + 1
    expect(flushPersist()).toBe(true)
    expect(writeCount).toBe(afterFlush)

    vi.advanceTimersByTime(260) // 若定时器没被清掉，这里会多写一次
    expect(writeCount).toBe(afterFlush)
  })

  it('写入失败：不抛错、内存数据不丢、通知一次并由后续 flush 补写', async () => {
    const notices = []
    setPersistErrorHandler(function (e) { notices.push(e && e.name) })

    failNext = true
    await catRepo.insert({ name: '奶茶', type: 'expense', icon: 'milktea', sort: 1 })
    expect(flushPersist()).toBe(false) // 失败但不抛
    expect(notices).toEqual(['QuotaExceededError'])

    // 内存里数据完整（页面照常可用）
    expect(await catRepo.count()).toBe(1)

    // 存储恢复后，下一次 flush 能把整库补写上去
    failNext = false
    expect(flushPersist()).toBe(true)
    expect(persistedCatCount()).toBe(1)
  })

  it('持续失败只通知一次，不会每次写操作都弹提示', async () => {
    let notices = 0
    setPersistErrorHandler(function () { notices += 1 })

    failNext = true
    await catRepo.insert({ name: 'a', type: 'expense', icon: 'more', sort: 1 })
    flushPersist()
    await catRepo.insert({ name: 'b', type: 'expense', icon: 'more', sort: 2 })
    flushPersist()
    await catRepo.insert({ name: 'c', type: 'expense', icon: 'more', sort: 3 })
    flushPersist()

    expect(notices).toBe(1)
  })

  it('事务收尾立刻落盘（备份恢复不会因为防抖丢在半路）', async () => {
    const before = writeCount
    await getStorage().transaction(async function () {
      await getStorage().categoryInsert({ name: '事务内', type: 'expense', icon: 'more', sort: 9 })
    })
    expect(writeCount).toBe(before + 1)
    expect(persistedCatCount()).toBe(1)
  })
})
