import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as tagService from '../services/tag.js'
import { groupTagIdsByTx } from '../utils/tag.js'
import { useAccountStore } from './account.js'
import { useMetaStore } from './meta.js'

/**
 * 标签状态（T5.1）。
 *
 * 与 tx / budget store 同一约定：账本从 account store 取，页面不感知多账本。
 *
 * 写操作后统一 `meta.bumpData()`：标签变了，列表项上的标签 chip 就得重画，
 * 而列表数据本身来自 tx store 的查询缓存 —— 不 bump 就会看到旧标签。
 */
export const useTagStore = defineStore('tag', function () {
  /** 当前账本的标签（已排序） */
  const list = ref([])

  const byId = computed(function () {
    const m = {}
    list.value.forEach(function (t) { m[t.id] = t })
    return m
  })

  const count = computed(function () {
    return list.value.length
  })

  const isFull = computed(function () {
    return list.value.length >= tagService.MAX_TAGS
  })

  function currentAccount() {
    return useAccountStore().currentId
  }

  async function load() {
    list.value = await tagService.list(currentAccount())
    return list.value
  }

  /** 取标签对象（没找到返回 null，页面自行兜底显示） */
  function tagOf(id) {
    return byId.value[Number(id)] || null
  }

  /** 标签名（找不到时给一个中性占位，不显示 undefined） */
  function nameOf(id) {
    const t = tagOf(id)
    return t ? t.name : '已删除的标签'
  }

  function colorOf(id) {
    const t = tagOf(id)
    return t ? t.color : ''
  }

  /** 一次新建（重名/上限会抛错，由页面 toast） */
  async function create(name) {
    const r = await tagService.create(currentAccount(), name)
    await load()
    return r
  }

  /** 一次输入多个（批量场景里重名跳过而不报错） */
  async function createMany(rawInput) {
    const r = await tagService.createMany(currentAccount(), rawInput)
    await load()
    return r
  }

  async function rename(id, name) {
    await tagService.update(currentAccount(), id, { name: name })
    await load()
    useMetaStore().bumpData()
  }

  async function setColor(id, color) {
    await tagService.update(currentAccount(), id, { color: color })
    await load()
  }

  async function remove(id) {
    await tagService.remove(currentAccount(), id)
    await load()
    useMetaStore().bumpData()
  }

  /** 覆写一笔流水的标签 */
  async function setTxTags(txId, tagIds) {
    const ids = await tagService.setTxTags(currentAccount(), txId, tagIds)
    useMetaStore().bumpData()
    return ids
  }

  /** 一批流水的标签：txId → tagId[]（列表页用） */
  async function mapByTxs(txIds) {
    return groupTagIdsByTx(await tagService.tagRowsByTxs(txIds))
  }

  return {
    list,
    byId,
    count,
    isFull,
    load,
    tagOf,
    nameOf,
    colorOf,
    create,
    createMany,
    rename,
    setColor,
    remove,
    setTxTags,
    mapByTxs
  }
})
