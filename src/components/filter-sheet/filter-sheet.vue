<template>
  <view class="sheet-wrap">
    <view class="mask" @click="$emit('close')"></view>
    <view class="sheet">
      <view class="sheet-grip"></view>
      <view class="sheet-title">
        <text class="sheet-title-text">筛选账单</text>
        <text class="sheet-close" @click="$emit('close')">×</text>
      </view>

      <!-- 类型 -->
      <text class="f-label">类型</text>
      <view class="seg">
        <view
          v-for="t in types"
          :key="t.key"
          class="seg-item"
          :class="{ on: type === t.key }"
          @click="pickType(t.key)"
        >{{ t.name }}</view>
      </view>

      <!-- 分类（多选；随类型联动，同类型的分类才出现） -->
      <text class="f-label">分类（可多选）</text>
      <scroll-view scroll-x class="chips">
        <view
          v-for="c in catList"
          :key="c.id"
          class="chip"
          :class="{ active: catIds.indexOf(c.id) >= 0 }"
          @click="toggleCat(c.id)"
        >
          <view class="chip-dot" :style="{ background: colorOf(c) }" />
          <text class="chip-name">{{ c.name }}</text>
        </view>
        <text v-if="!catList.length" class="chips-empty">还没有分类</text>
      </scroll-view>

      <!-- 标签（多选，任一命中即可；不随类型联动——标签不带收支类型） -->
      <template v-if="tags.length">
        <text class="f-label">标签（可多选）</text>
        <scroll-view scroll-x class="chips">
          <view
            v-for="t in tags"
            :key="t.id"
            class="chip"
            :class="{ active: tagIds.indexOf(t.id) >= 0 }"
            @click="toggleTag(t.id)"
          >
            <view class="chip-dot" :style="{ background: tagColorOf(t) }" />
            <text class="chip-name">{{ t.name }}</text>
          </view>
        </scroll-view>
      </template>

      <!-- 金额区间（元） -->
      <text class="f-label">金额区间（元）</text>
      <view class="amount-row">
        <input v-model="minStr" class="a-input" type="digit" placeholder="最低" />
        <text class="a-tilde">~</text>
        <input v-model="maxStr" class="a-input" type="digit" placeholder="最高" />
      </view>

      <!-- 日期区间（含首尾两天） -->
      <text class="f-label">日期区间</text>
      <view class="date-row">
        <picker mode="date" :value="startStr || minDate" :start="minDate" :end="todayStr" @change="onStart">
          <view class="d-pill" :class="{ set: !!startStr }">
            <text class="d-text">{{ startStr || '开始' }}</text>
            <text v-if="startStr" class="d-clear" @click.stop="startStr = ''">×</text>
          </view>
        </picker>
        <text class="a-tilde">~</text>
        <picker mode="date" :value="endStr || todayStr" :start="minDate" :end="todayStr" @change="onEnd">
          <view class="d-pill" :class="{ set: !!endStr }">
            <text class="d-text">{{ endStr || '结束' }}</text>
            <text v-if="endStr" class="d-clear" @click.stop="endStr = ''">×</text>
          </view>
        </picker>
      </view>

      <view class="sheet-actions">
        <button class="sheet-btn btn-clear" hover-class="btn-hover" @click="onClear">清空</button>
        <button class="sheet-btn btn-apply" hover-class="btn-hover" @click="onApply">应用</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { colorOf, tagColorOf } from '../../utils/palette.js'
import { parseAmountBound } from '../../utils/money.js'
import { dateStrStart, dateStrEndExclusive, toDateStr } from '../../utils/date.js'
import { minSelectableDate } from '../../utils/entry.js'

/**
 * 账单筛选面板（T4.3）：类型 / 分类多选 / 金额区间 / 日期区间。
 *
 * 组件本身**不做归一化**（反区间、脏值都由 utils/search.js 收敛）——
 * 它只负责把界面上的原始输入原样交出去，这样"界面值 → 筛选条件"的转换
 * 只有一处定义，不会被组件偷偷加工过一遍。
 */
const props = defineProps({
  filters: { type: Object, default: null },
  categories: { type: Array, default: function () { return [] } },
  tags: { type: Array, default: function () { return [] } }
})
const emit = defineEmits(['close', 'apply'])

const types = [
  { key: '', name: '全部' },
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]

const type = ref('')
const catIds = ref([])
const tagIds = ref([])
const minStr = ref('')
const maxStr = ref('')
const startStr = ref('')
const endStr = ref('')

const todayStr = toDateStr(Date.now())
const minDate = minSelectableDate(todayStr)

/** 分类列表随类型联动 */
const catList = computed(function () {
  return props.categories.filter(function (c) {
    return !type.value || c.type === type.value
  })
})

/** 打开面板时用当前生效的筛选回填 */
watch(
  function () { return props.filters },
  function (f) {
    const v = f || {}
    type.value = v.type || ''
    catIds.value = Array.isArray(v.categoryIds) ? v.categoryIds.slice() : []
    tagIds.value = Array.isArray(v.tagIds) ? v.tagIds.slice() : []
    minStr.value = v.minCents === null || v.minCents === undefined ? '' : (v.minCents / 100).toFixed(2)
    maxStr.value = v.maxCents === null || v.maxCents === undefined ? '' : (v.maxCents / 100).toFixed(2)
    startStr.value = v.startTs ? toDateStr(v.startTs) : ''
    // 右端点是"次日 00:00"，回填到界面上要减回当天，否则会显示成第二天
    endStr.value = v.endTs ? toDateStr(v.endTs - 1) : ''
  },
  { immediate: true }
)

/** 换类型时，把不属于新类型的已选分类清掉 —— 否则会出现"看不见却生效"的筛选 */
function pickType(key) {
  if (key === type.value) return
  type.value = key
  const allowed = catList.value.map(function (c) { return c.id })
  catIds.value = catIds.value.filter(function (id) { return allowed.indexOf(id) >= 0 })
}

function toggleCat(id) {
  const i = catIds.value.indexOf(id)
  if (i >= 0) catIds.value.splice(i, 1)
  else catIds.value.push(id)
}

/** 标签不随类型联动：标签本身不带收支类型，切"支出/收入"不该把它清掉 */
function toggleTag(id) {
  const i = tagIds.value.indexOf(id)
  if (i >= 0) tagIds.value.splice(i, 1)
  else tagIds.value.push(id)
}

function onStart(e) {
  startStr.value = e.detail.value || ''
}

function onEnd(e) {
  endStr.value = e.detail.value || ''
}

function onApply() {
  emit('apply', {
    type: type.value,
    categoryIds: catIds.value.slice(),
    tagIds: tagIds.value.slice(),
    minCents: parseAmountBound(minStr.value),
    maxCents: parseAmountBound(maxStr.value),
    startTs: dateStrStart(startStr.value),
    endTs: dateStrEndExclusive(endStr.value)
  })
}

/** 清空 = 立刻按"无筛选"重查并收起面板（比"点了清空还要再点应用"少一步） */
function onClear() {
  emit('apply', {})
}
</script>

<style scoped>
.sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 99;
}
.mask {
  position: absolute;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  animation: cd-fade-in 200ms ease both;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cd-surface);
  border-radius: 28px 28px 0 0;
  padding: 8px 16px 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  animation: cd-sheet-up 240ms var(--cd-ease) both;
}
.sheet-grip {
  width: 44px;
  height: 5px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-line);
  margin: 4px auto 14px;
}
.sheet-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.sheet-title-text {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
}
.sheet-close {
  font-size: 22px;
  line-height: 1;
  color: var(--cd-icon-3);
  padding: 0 4px;
}
.f-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin: 12px 0 6px;
}
/* 类型分段（与首页「全部/支出/收入」同一套视觉） */
.seg {
  display: flex;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 3px;
}
.seg-item {
  flex: 1;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-icon);
  padding: 8px 0;
  border-radius: var(--cd-r-pill);
}
.seg-item.on {
  background: var(--cd-surface);
  color: var(--cd-ink);
  font-weight: 800;
}
.chips {
  white-space: nowrap;
  padding: 2px 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-bg);
  padding: 8px 14px;
  margin-right: 8px;
}
.chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.chip-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.chip.active {
  background: var(--cd-primary);
}
.chip.active .chip-name {
  font-weight: 800;
}
.chips-empty {
  font-size: 12px;
  color: var(--cd-ink-2);
}
.amount-row,
.date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.a-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 11px 14px;
  font-family: var(--cd-font);
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.a-tilde {
  color: var(--cd-icon-3);
  font-size: 14px;
}
.d-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 12px 14px;
}
.d-pill.set {
  border-color: var(--cd-primary);
}
.d-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.d-clear {
  font-size: 16px;
  line-height: 1;
  color: var(--cd-icon-3);
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
/* 用类选择器而不是 button 标签：uni-app H5 把 <button> 渲染成 <uni-button>，
   写 `button` 选择器根本匹配不到（edit-sheet 里有同样的坑，见交接记录） */
.sheet-btn {
  flex: 1;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-pill);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 800;
}
.sheet-btn::after {
  border: none;
}
.btn-clear {
  background: var(--cd-surface);
  color: var(--cd-icon);
  border: 1.5px solid var(--cd-primary);
}
.btn-apply {
  flex: 2;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  box-shadow: var(--cd-sh-btn);
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.97) translateY(1px);
}
</style>
