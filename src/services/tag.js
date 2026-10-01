/**
 * 标签业务层（T5.1）。
 *
 * 规则集中在这里，仓储只负责存取：
 * - **重名拒绝**（同名标签会让用户分不清，展示时也没有区分度）
 * - **数量上限 MAX_TAGS**（超了 chip 区被挤爆、管理页也不好翻）
 * - **一笔最多 MAX_TAGS_PER_TX 个**（再多说明标签设计过细，应该写进备注）
 * - **被引用的标签不许删**（与"有流水的分类不许删"同一条规矩，避免脏关联）
 * - **标签必须属于当前账本**（防跨账本串标签）
 *
 * 所有校验失败一律 `throw new Error('中文消息')`，由页面 catch 后 toast ——
 * 与 budget / category 服务保持一致的错误约定。
 */
import * as tagRepo from '../db/repository/tag.js'
import {
  MAX_TAGS,
  MAX_TAGS_PER_TX,
  normalizeTagName,
  parseTagInput,
  dedupeTagIds,
  pickTagColor,
  exceedsPerTxLimit
} from '../utils/tag.js'

export { MAX_TAGS, MAX_TAGS_PER_TX }

/** 当前账本的标签（已按 sort、id 排序） */
export async function list(accountId) {
  return tagRepo.list(accountId)
}

/** 排序值：追加到末尾 */
function nextSort(existing) {
  let max = 0
  existing.forEach(function (t) { if (t.sort > max) max = t.sort })
  return max + 1
}

/**
 * 新建一个标签。
 * @returns {Promise<{id:number, name:string}>}
 */
export async function create(accountId, rawName) {
  const name = normalizeTagName(rawName)
  if (!name) throw new Error('标签名不能为空')
  const existing = await tagRepo.list(accountId)
  const dup = existing.filter(function (t) { return t.name === name })
  if (dup.length) throw new Error('已经有「' + name + '」了')
  if (existing.length >= MAX_TAGS) throw new Error('标签最多 ' + MAX_TAGS + ' 个')

  const now = Date.now()
  const id = await tagRepo.insert({
    account_id: accountId,
    name: name,
    color: pickTagColor(existing.length),
    sort: nextSort(existing),
    created_at: now,
    updated_at: now
  })
  return { id: id, name: name }
}

/**
 * 一次输入多个标签（支持 `,` `，` `、` `/` 与空白分隔）。
 * 已存在的同名标签**跳过而不是报错** —— 批量场景里因为一个重名就全失败太粗暴。
 * @returns {Promise<{created:string[], skipped:string[], full:boolean}>}
 */
export async function createMany(accountId, rawInput) {
  const names = parseTagInput(rawInput)
  if (!names.length) throw new Error('请输入标签名')

  const existing = await tagRepo.list(accountId)
  const taken = {}
  existing.forEach(function (t) { taken[t.name] = 1 })

  const created = []
  const skipped = []
  let count = existing.length
  let full = false
  const now = Date.now()

  for (const name of names) {
    if (taken[name]) { skipped.push(name); continue }
    if (count >= MAX_TAGS) { full = true; skipped.push(name); continue }
    await tagRepo.insert({
      account_id: accountId,
      name: name,
      color: pickTagColor(count),
      sort: count + 1,
      created_at: now,
      updated_at: now
    })
    taken[name] = 1
    created.push(name)
    count += 1
  }
  return { created: created, skipped: skipped, full: full }
}

/** 改名 / 换色（只改传入的字段） */
export async function update(accountId, id, patch) {
  const clean = {}
  if (patch && patch.name !== undefined) {
    const name = normalizeTagName(patch.name)
    if (!name) throw new Error('标签名不能为空')
    const existing = await tagRepo.list(accountId)
    const dup = existing.filter(function (t) { return t.name === name && t.id !== Number(id) })
    if (dup.length) throw new Error('已经有「' + name + '」了')
    clean.name = name
  }
  if (patch && patch.color !== undefined) clean.color = String(patch.color || '')
  if (!Object.keys(clean).length) return
  clean.updated_at = Date.now()
  await tagRepo.update(Number(id), clean)
}

/**
 * 删除标签。**被任何未删除流水引用时拒绝**，并把引用笔数说清楚，
 * 让用户知道"要删先去把那几笔的标签取消掉"。
 */
export async function remove(accountId, id) {
  const refs = await tagRepo.refCount(id)
  if (refs > 0) throw new Error('有 ' + refs + ' 笔账在用这个标签，先去取消关联再删')
  await tagRepo.remove(Number(id))
}

/**
 * 覆写一笔流水的标签集合。
 * 校验：数量上限 + 标签必须属于本账本（防跨账本串标签）。
 * @returns {Promise<number[]>} 归一化后的 tag id（升序）
 */
export async function setTxTags(accountId, txId, tagIds) {
  const ids = dedupeTagIds(tagIds)
  if (exceedsPerTxLimit(ids)) throw new Error('一笔最多打 ' + MAX_TAGS_PER_TX + ' 个标签')
  if (ids.length) {
    const owned = {}
    ;(await tagRepo.list(accountId)).forEach(function (t) { owned[t.id] = 1 })
    const bad = ids.filter(function (i) { return !owned[i] })
    if (bad.length) throw new Error('标签不存在或不属于当前账本')
  }
  await tagRepo.setTagsForTx(Number(txId), ids)
  return ids
}

/** 一批流水的标签（列表页一次取回，避免逐条查询） */
export async function tagRowsByTxs(txIds) {
  return tagRepo.tagRowsByTxs(txIds)
}
