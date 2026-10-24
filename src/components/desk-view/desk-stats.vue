<template>
  <view>
    <!-- 本期收支 -->
    <view class="desk-sec">
      <text class="desk-sec-t">本月概览</text>
      <view class="ds-sums">
        <view class="ds-sum">
          <text class="ds-sum-k">支出</text>
          <text class="ds-sum-v">¥{{ expenseFull }}</text>
        </view>
        <view class="ds-sum">
          <text class="ds-sum-k">收入</text>
          <text class="ds-sum-v income">¥{{ incomeFull }}</text>
        </view>
      </view>
    </view>

    <!-- 圆环：无支出时给空状态，不留一个空环 -->
    <view class="desk-sec">
      <text class="desk-sec-t">支出构成</text>

      <view v-if="!segments.length" class="desk-empty">
        <text class="desk-empty-t">这个月还没有支出</text>
        <text class="desk-empty-s">记一笔就能看到分类占比</text>
      </view>

      <view v-else class="ds-donut-wrap">
        <view class="ds-donut" :style="{ background: donutBg }">
          <!-- 中心留空：inset 25% 与 stats.js: DONUT_HOLE_RATIO(0.5) 是同一个几何事实 -->
          <view class="ds-hole">
            <text class="ds-hole-k">支出合计</text>
            <text class="ds-hole-v">¥{{ expenseFull }}</text>
          </view>
          <!-- 环内占比：小扇区不标（minPct 由 donutLabels 兜住），图例里仍带百分比 -->
          <text
            v-for="l in labels"
            v-show="l.show"
            :key="'l' + l.category_id"
            class="ds-lbl"
            :style="{ left: l.xPct + '%', top: l.yPct + '%', color: inkOf(l.color) }"
          >{{ l.pctText }}</text>
        </view>
      </view>
    </view>

    <!-- 分类排行 -->
    <view v-if="segments.length" class="desk-sec">
      <text class="desk-sec-t">分类排行</text>
      <view
        v-for="r in topRows"
        :key="'r' + r.category_id"
        class="ds-row"
      >
        <view class="ds-row-head">
          <view class="ds-dot" :style="{ background: r.color }" />
          <text class="ds-row-name">{{ r.name }}</text>
          <text class="ds-row-pct">{{ pctOf(r.cents) }}</text>
          <text class="ds-row-amt">¥{{ fullOf(r.cents) }}</text>
        </view>
        <view class="ds-bar">
          <view class="ds-bar-fill" :style="{ width: barWidth(r.cents), background: r.color }" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  expenseByCategory,
  donutSegments,
  conicGradient,
  donutLabels
} from '../../utils/stats.js'
import { formatCents } from '../../utils/money.js'
import { readableInk } from '../../utils/palette.js'

/**
 * 右栏统计面板（纯展示组件）。
 *
 * 分工原则：**数据与状态都在父级**（home.vue 持有 month / seg / 搜索条件，
 * 并且已经从 store 取好了 records）。这个组件只做「把 records 变成图形」，
 * 不自己取数、不发请求、不改任何全局状态 —— 所以它能被单独复用与替换。
 *
 * 统计口径全部走 utils/stats.js 的纯函数（那些函数已有 962 条测试里的覆盖），
 * 这里不重写任何聚合逻辑，避免出现"首页和小屏统计页口径不一致"。
 */
const props = defineProps({
  /** 当前周期内的流水（已由父级按月份 + 分段 + 搜索条件过滤） */
  records: { type: Array, default: function () { return [] } },
  /** 分类表（用于名字与配色） */
  categories: { type: Array, default: function () { return [] } },
  /** txStore.summary：{ incomeCents, expenseCents } */
  summary: { type: Object, default: function () { return {} } }
})

const rows = computed(function () {
  return expenseByCategory(props.records, props.categories)
})

const segments = computed(function () {
  return donutSegments(rows.value)
})

/**
 * 扇区之间那条缝用主题的卡片色。
 * utils/stats.js 默认是白色（浅色主题下的做法）—— 深色底上一圈白边会发光，
 * 看着像描边而不是分隔。传 var() 让它跟着主题走。
 */
const donutBg = computed(function () {
  return conicGradient(segments.value, { lineColor: 'var(--cd-surface)' })
})

const labels = computed(function () {
  return donutLabels(segments.value, { radius: 0.78 })
})

/** 排行只列前 6 个，其余在图例里仍可看到总量 */
const topRows = computed(function () {
  return rows.value.slice(0, 6)
})

const totalCents = computed(function () {
  return rows.value.reduce(function (s, r) { return s + r.cents }, 0)
})

const expenseFull = computed(function () {
  return formatCents(props.summary.expenseCents || 0)
})

const incomeFull = computed(function () {
  return formatCents(props.summary.incomeCents || 0)
})

function fullOf(cents) {
  return formatCents(cents)
}

function pctOf(cents) {
  if (!totalCents.value) return '0%'
  return Math.round((cents / totalCents.value) * 100) + '%'
}

/** 条形宽度：按占最大分类的比例，让最短的那条也看得见（下限 4%） */
function barWidth(cents) {
  const max = topRows.value.length ? topRows.value[0].cents : 0
  if (!max) return '0%'
  return Math.max(4, Math.round((cents / max) * 100)) + '%'
}

/** 环内文字压在分类色上，逐段挑一个读得清的字色（palette.js 已有对比度计算） */
function inkOf(hex) {
  return readableInk(hex)
}
</script>

<style scoped>
/* 颜色一律走令牌（深色由 html.cd-dark 覆盖），这里只写排版与尺寸。 */

.ds-sums {
  display: flex;
  gap: 10px;
}

.ds-sum {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--cd-r-sm);
  background: var(--cd-surface-2);
  border: 1px solid var(--cd-line-soft);
  box-sizing: border-box;
}

.ds-sum-k {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin-bottom: 3px;
}

.ds-sum-v {
  display: block;
  font-size: 17px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ds-sum-v.income {
  color: var(--cd-income);
}

/* ---- 圆环 ---- */
.ds-donut-wrap {
  display: flex;
  justify-content: center;
}

.ds-donut {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 50%;
}

.ds-hole {
  position: absolute;
  inset: 25%;
  border-radius: 50%;
  background: var(--cd-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.ds-hole-k {
  font-size: 10px;
  font-weight: 700;
  color: var(--cd-ink-2);
}

.ds-hole-v {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}

.ds-lbl {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

/* ---- 排行 ---- */
.ds-row {
  margin-bottom: 11px;
}

.ds-row:last-child {
  margin-bottom: 0;
}

.ds-row-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
}

.ds-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}

.ds-row-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ds-row-pct {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: var(--cd-ink-2);
  font-variant-numeric: tabular-nums;
}

.ds-row-amt {
  flex: none;
  font-size: 12px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}

.ds-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--cd-surface-2);
  overflow: hidden;
}

.ds-bar-fill {
  height: 100%;
  border-radius: 999px;
}
</style>
