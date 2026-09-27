<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="goHome"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">奶龙算账</text>
      <!-- 真正的月份选择器：统计页原先只能跟随首页月份，无法自己切换 -->
      <picker mode="date" fields="month" :value="monthValue" @change="onMonthChange">
        <view class="month-chip">{{ monthLabel }}</view>
      </picker>
    </view>

    <!-- 日 / 周 / 月 / 年 -->
    <view class="seg">
      <view
        v-for="s in periods"
        :key="s.key"
        class="seg-item"
        :class="{ on: period === s.key }"
        @click="pickPeriod(s)"
      >{{ s.name }}</view>
    </view>

    <!-- 当月收支合计 -->
    <view class="month-totals">
      <text class="mt-item">本月支出 <text class="mt-num">{{ monthExpenseText }}</text></text>
      <text class="mt-sep">·</text>
      <text class="mt-item">本月收入 <text class="mt-num inc">{{ monthIncomeText }}</text></text>
    </view>

    <!-- 环形图卡 -->
    <view class="donut-wrap">
      <block v-if="segments.length">
        <view class="donut" :style="{ background: donutBg }">
          <view class="donut-center">
            <image class="donut-milo" src="/static/milo/milo.webp" mode="aspectFit" />
          </view>
        </view>
        <view class="legend">
          <view v-for="s in segments" :key="s.name" class="li">
            <view class="dot" :style="{ background: s.color }" />
            <text class="li-name">{{ s.name }}</text>
            <text class="li-pct">{{ Math.round(s.pct * 100) }}%</text>
          </view>
        </view>
      </block>
      <view v-else class="empty">
        <image class="empty-img" src="/static/milo/milo-innocent.webp" mode="aspectFit" />
        <text class="empty-title">这个月还没有支出哦~</text>
        <text class="empty-sub">记几笔，奶龙帮你看看钱花哪了</text>
      </view>
    </view>

    <!-- 排行卡 -->
    <view v-if="segments.length" class="rank-card">
      <text class="rank-title">花得最多的是…</text>
      <view v-for="s in segments" :key="s.name" class="rank-row">
        <cat-icon :category="catOf(s.name)" :size="32" />
        <view class="rank-main">
          <view class="rank-line">
            <text class="rank-name">{{ s.name }}</text>
            <text class="rank-amt">¥{{ formatCents(s.cents) }}</text>
          </view>
          <view class="bar"><view class="bar-i" :style="{ width: Math.round(s.pct * 100) + '%', background: s.color }" /></view>
        </view>
      </view>
    </view>

    <!-- 近 6 个月趋势（支出/收入可切） -->
    <view class="trend-card">
      <view class="trend-head">
        <text class="trend-title">近 6 个月</text>
        <view class="trend-seg">
          <text
            class="ts-item"
            :class="{ on: trendMode === 'expense' }"
            @click="trendMode = 'expense'"
          >支出</text>
          <text
            class="ts-item"
            :class="{ on: trendMode === 'income' }"
            @click="trendMode = 'income'"
          >收入</text>
        </view>
      </view>
      <view class="bars">
        <view v-for="(m, i) in trendRows" :key="m.ym" class="bar-col">
          <text class="bar-amt" :class="{ max: i === trendMaxIndex }">{{ amountLabel(m) }}</text>
          <view class="bar-track">
            <view
              class="bar-fill"
              :class="{ max: i === trendMaxIndex, income: trendMode === 'income' }"
              :style="{ height: trendPercents[i] + '%' }"
            />
          </view>
          <text class="bar-label" :class="{ max: i === trendMaxIndex }">{{ ymLabel(m.ym) }}</text>
        </view>
      </view>
      <text class="trend-foot">{{ trendFoot }}</text>
    </view>

    <tab-bar current="stats" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import { expenseByCategory, donutSegments, conicGradient, barPercents, maxIndex } from '../../utils/stats.js'
import { ymLabel } from '../../utils/date.js'
import { formatCents } from '../../utils/money.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 统计（v2.0）：当月收支合计 + 环形图（conic-gradient，中心放奶龙）+ 分类排行 + 近 6 个月趋势柱状图。
 * 全部数据来自 store：当月部分看 txStore.records / summary，趋势看 txStore.trend（近 6 个月分桶）。
 * 日/周/年暂未实现（参考包也只有月有真实数据），点按提示规划中。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const metaStore = useMetaStore()

const periods = [
  { key: 'day', name: '日' },
  { key: 'week', name: '周' },
  { key: 'month', name: '月' },
  { key: 'year', name: '年' }
]
const period = ref('month')

const rows = computed(function () {
  return expenseByCategory(txStore.records, categoryStore.list)
})

/* ---- 当月收支合计 ---- */
const monthExpenseText = computed(function () {
  return '¥' + formatCents(txStore.summary.expenseCents)
})
const monthIncomeText = computed(function () {
  return '¥' + formatCents(txStore.summary.incomeCents)
})

/* ---- 近 6 个月趋势 ---- */
const trendMode = ref('expense')
const trendRows = computed(function () {
  return txStore.trend
})
const trendValues = computed(function () {
  const key = trendMode.value === 'income' ? 'incomeCents' : 'expenseCents'
  return trendRows.value.map(function (m) { return m[key] })
})
const trendPercents = computed(function () {
  return barPercents(trendValues.value)
})
const trendMaxIndex = computed(function () {
  return maxIndex(trendValues.value)
})
/** 柱子上方的金额：过千走紧凑写法（¥1.8万），小屏一列放得下 */
function amountLabel(m) {
  const cents = trendMode.value === 'income' ? m.incomeCents : m.expenseCents
  return compactYuan(cents)
}
const trendFoot = computed(function () {
  const total = trendValues.value.reduce(function (s, v) { return s + v }, 0)
  const word = trendMode.value === 'income' ? '收入' : '支出'
  if (!total) return '这 6 个月还没有' + word + '记录'
  const months = trendRows.value.filter(function (m) {
    return (trendMode.value === 'income' ? m.incomeCents : m.expenseCents) > 0
  }).length
  return '6 个月共' + word + ' ¥' + formatCents(total) + '（有记录的 ' + months + ' 个月）'
})
/** 金额紧凑写法：0 → ¥0；< 1 万 → ¥1,234；≥ 1 万 → ¥1.8万 */
function compactYuan(cents) {
  const c = Math.max(0, Number(cents) || 0)
  if (!c) return '¥0'
  const yuan = c / 100
  if (yuan < 10000) return '¥' + Math.round(yuan).toLocaleString('en-US')
  return '¥' + (yuan / 10000).toFixed(1) + '万'
}
const monthLabel = computed(function () {
  const parts = metaStore.ym.split('-')
  return parts[0] + '/' + Number(parts[1])
})
const monthValue = computed(function () {
  return metaStore.ym
})
/** 换月后立刻重算，统计页与首页共用 meta store 的月份，保持一致 */
function onMonthChange(e) {
  const v = e.detail.value
  if (!/^\d{4}-\d{2}$/.test(v)) return
  metaStore.ym = v
  txStore.loadMonth(v)
}
const segments = computed(function () {
  return donutSegments(rows.value)
})
const donutBg = computed(function () {
  return conicGradient(segments.value)
})

function catOf(name) {
  return categoryStore.list.find(function (c) { return c.name === name }) || { name: name, icon: '📦' }
}
function pickPeriod(s) {
  if (s.key !== 'month') {
    uni.showToast({ title: s.name + '视图规划中', icon: 'none' })
    return
  }
  period.value = s.key
}
function goHome() {
  uni.reLaunch({ url: '/pages/home/home' })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

onShow(function () {
  // 用 refresh 而不是 loadMonth：趋势卡要的是近 6 个月的分桶数据
  txStore.refresh(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  /* 让出状态栏（同首页说明） */
  padding-top: var(--status-bar-height, 0px);
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px;
}
.nav-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--cd-ink);
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--cd-primary-lt);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ib {
  width: 18px;
  height: 18px;
  background: #8a7450;
}
/* 月份胶囊：统计页自己选分析哪个月 */
.month-chip {
  background: var(--cd-primary-lt);
  color: #8a7450;
  font-size: 13px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: var(--cd-r-pill);
  font-variant-numeric: tabular-nums;
}

.seg {
  margin: 8px 16px;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 4px;
  display: flex;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  border-radius: var(--cd-r-pill);
  font-size: 14px;
  font-weight: 700;
  color: #b89968;
}
.seg-item.on {
  background: var(--cd-primary);
  color: var(--cd-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

/* ---- 环形图卡 ---- */
.donut-wrap {
  margin: 12px 16px;
  border-radius: var(--cd-r-card);
  padding: 20px;
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
}
.donut {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  margin: 0 auto;
  position: relative;
  background: var(--cd-primary-lt);
}
.donut-center {
  position: absolute;
  inset: 25%;
  background: #ffe082;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.donut-milo {
  width: 82%;
  height: 82%;
}
.legend {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.li-name {
  font-size: 12px;
  color: var(--cd-ink);
  flex: 1;
}
.li-pct {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
}

/* ---- 空状态 ---- */
.empty {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-img {
  width: 120px;
  height: 120px;
  border-radius: 16px;
  margin-bottom: 10px;
}
.empty-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 12px;
  color: rgba(93, 78, 55, 0.75);
}

/* ---- 排行卡 ---- */
.rank-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.rank-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  display: block;
  margin-bottom: 10px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.rank-main {
  flex: 1;
  min-width: 0;
}
.rank-line {
  display: flex;
  justify-content: space-between;
}
.rank-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
}
.rank-amt {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--cd-line);
  margin-top: 5px;
  overflow: hidden;
}
.bar-i {
  height: 100%;
  border-radius: 3px;
}

/* ---- 当月收支合计 ---- */
.month-totals {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 16px 0;
}
.mt-item {
  font-size: 13px;
  color: var(--cd-ink-2);
}
.mt-num {
  font-size: 14px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.mt-num.inc {
  color: var(--cd-income);
}
.mt-sep {
  color: var(--cd-ink-2);
  font-size: 12px;
}

/* ---- 近 6 个月趋势 ---- */
.trend-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trend-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
}
.trend-seg {
  display: flex;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 3px;
}
.ts-item {
  font-size: 12px;
  font-weight: 700;
  color: #b89968;
  padding: 4px 12px;
  border-radius: var(--cd-r-pill);
}
.ts-item.on {
  background: var(--cd-primary);
  color: var(--cd-ink);
}
/* 柱子靠底对齐：每列内部让 bar-track 撑满剩余高度 */
.bars {
  display: flex;
  align-items: stretch;
  gap: 8px;
  height: 168px;
  margin-top: 14px;
}
.bar-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bar-amt {
  font-size: 11px;
  color: var(--cd-ink-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* 最高那根用主文字色加重，一眼看出峰值 */
.bar-amt.max {
  color: var(--cd-ink);
  font-weight: 800;
}
.bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  padding: 4px 0;
}
.bar-fill {
  width: 100%;
  border-radius: 8px 8px 3px 3px;
  background: #ffe082;
  transition: height 240ms var(--cd-ease);
}
.bar-fill.max {
  background: #ffc93c;
}
.bar-fill.income {
  background: #a5d6a7;
}
.bar-fill.income.max {
  background: var(--cd-income);
}
.bar-label {
  font-size: 12px;
  color: var(--cd-ink-2);
}
.bar-label.max {
  color: var(--cd-ink);
  font-weight: 700;
}
.trend-foot {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  color: var(--cd-ink-2);
  line-height: 1.6;
}
</style>
