<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="goHome"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">奶龙算账</text>
      <!-- 期间选择器：fields 随期间切换（日/周选日期、月选月、年选年） -->
      <picker mode="date" :fields="pickerFields" :value="pickerValue" @change="onPickDate">
        <view class="month-chip">{{ pickerLabel }}</view>
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

    <!-- 期间收支合计 -->
    <view class="month-totals">
      <text class="mt-item">{{ periodName }}支出 <text class="mt-num">{{ periodExpenseText }}</text></text>
      <text class="mt-sep">·</text>
      <text class="mt-item">{{ periodName }}收入 <text class="mt-num inc">{{ periodIncomeText }}</text></text>
    </view>

    <!-- 环形图卡 -->
    <view class="donut-wrap">
      <block v-if="segments.length">
        <view class="donut" :style="{ background: donutBg }">
          <view class="donut-center">
            <image class="donut-milo" src="/static/milo/milo.webp" mode="aspectFit" />
          </view>
        </view>
        <text v-if="!conicOk" class="donut-tip">这台设备画不出圆环图，往下看「花得最多的是…」里的占比条，一样准</text>
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
        <text class="empty-title">{{ emptyTitle }}</text>
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

    <!-- 趋势柱状图（维度随期间切换：近 7 天 / 近 4 周 / 近 6 个月 / 全年逐月） -->
    <view class="trend-card">
      <view class="trend-head">
        <text class="trend-title">{{ trendTitle }}</text>
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
        <view v-for="(m, i) in trendRows" :key="m.key" class="bar-col">
          <text class="bar-amt" :class="{ max: i === trendMaxIndex }">{{ amountLabel(m) }}</text>
          <view class="bar-track">
            <view
              class="bar-fill"
              :class="{ max: i === trendMaxIndex, income: trendMode === 'income' }"
              :style="{ height: trendPercents[i] + '%' }"
            />
          </view>
          <text class="bar-label" :class="{ max: i === trendMaxIndex }">{{ bucketLabel(m.key) }}</text>
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
import { expenseByCategory, donutSegments, conicGradient, supportsConicGradient, barPercents, maxIndex } from '../../utils/stats.js'
import {
  ymLabel,
  toDateStr,
  tsFromDateStr,
  weekStart,
  dayTrendLabel,
  periodNameOf
} from '../../utils/date.js'
import { formatCents } from '../../utils/money.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 统计（v2.1）：日 / 周 / 月 / 年四种期间 —— 收支合计 + 环形图 + 分类排行 + 趋势柱状图。
 * 数据全部来自 txStore.loadStatsPeriod（一次区间查询 + JS 分桶，分桶逻辑在 utils/stats.js 纯函数）：
 * - day  → 当天，趋势看近 7 天逐日
 * - week → 本周（周一为一周之始），趋势看近 4 周逐周
 * - month→ 与首页共用 meta store 的月份，趋势看近 6 个月
 * - year → 当年，趋势看全年逐月
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
/** 日 / 周 / 年的锚点（月期间走 metaStore.ym，与首页保持同步） */
const anchorTs = ref(Date.now())

const rows = computed(function () {
  return expenseByCategory(txStore.periodRecords, categoryStore.list)
})

/* ---- 期间收支合计 ---- */
const periodName = computed(function () {
  return periodNameOf(period.value)
})
const periodExpenseText = computed(function () {
  return '¥' + formatCents(txStore.periodSummary.expenseCents)
})
const periodIncomeText = computed(function () {
  return '¥' + formatCents(txStore.periodSummary.incomeCents)
})

/* ---- 顶部选择器（胶囊 + picker，fields 随期间变化） ---- */
const DAY_MS = 86400000
const pickerFields = computed(function () {
  if (period.value === 'month') return 'month'
  if (period.value === 'year') return 'year'
  return 'day'
})
const pickerValue = computed(function () {
  if (period.value === 'month') return metaStore.ym
  if (period.value === 'year') return String(new Date(anchorTs.value).getFullYear())
  return toDateStr(anchorTs.value)
})
const pickerLabel = computed(function () {
  if (period.value === 'month') {
    const parts = metaStore.ym.split('-')
    return parts[0] + '/' + Number(parts[1])
  }
  if (period.value === 'year') return new Date(anchorTs.value).getFullYear() + '年'
  if (period.value === 'week') {
    const s = new Date(weekStart(anchorTs.value))
    const e = new Date(weekStart(anchorTs.value) + 6 * DAY_MS)
    return (s.getMonth() + 1) + '.' + s.getDate() + '-' + (e.getMonth() + 1) + '.' + e.getDate()
  }
  const d = new Date(anchorTs.value)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
})

/** 期间或锚点变化后统一走这里；月期间的锚点从 metaStore.ym 派生 */
function reload() {
  const anchor = period.value === 'month' ? ymToAnchor(metaStore.ym) : anchorTs.value
  txStore.loadStatsPeriod(period.value, anchor).catch(function () {
    // 查询失败（如桥接异常）时保留旧数据继续展示，别把页面刷成空白
    uni.showToast({ title: '统计加载失败，已保留上次数据', icon: 'none' })
  })
}
function ymToAnchor(ym) {
  const p = String(ym || '').split('-').map(Number)
  return new Date(p[0], (p[1] || 1) - 1, 15).getTime()
}

/** 选择器回调：月 → 'YYYY-MM'；年 → 'YYYY'；日 / 周 → 'YYYY-MM-DD' */
function onPickDate(e) {
  const v = e.detail.value
  if (period.value === 'month') {
    if (!/^\d{4}-\d{2}$/.test(v)) return
    metaStore.ym = v
  } else if (period.value === 'year') {
    if (!/^\d{4}$/.test(v)) return
    anchorTs.value = new Date(Number(v), 5, 15).getTime()
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return
    anchorTs.value = tsFromDateStr(v)
  }
  reload()
}

function pickPeriod(s) {
  if (period.value === s.key) return
  period.value = s.key
  reload()
}

const segments = computed(function () {
  return donutSegments(rows.value)
})
/**
 * 老 WebView（Chrome < 69）不支持 conic-gradient，行内样式会被忽略、环形图整块空白（T3.7）。
 * 检测一次即可（同一台设备的渲染引擎不会中途变），不支持时返回空背景，
 * 让 CSS 里那层纯色环兜底，并在环下方给出"看占比条"的指引。
 */
const conicOk = ref(supportsConicGradient())
const donutBg = computed(function () {
  return conicOk.value ? conicGradient(segments.value) : ''
})

/* ---- 空状态文案随期间变化 ---- */
const EMPTY_PREFIX = { day: '这一天', week: '这一周', month: '这个月', year: '这一年' }
const emptyTitle = computed(function () {
  return EMPTY_PREFIX[period.value] + '还没有支出哦~'
})

/* ---- 趋势柱状图（维度随期间切换） ---- */
const TREND_META = {
  day: { title: '近 7 天', span: '这 7 天', unit: '天' },
  week: { title: '近 4 周', span: '这 4 周', unit: '周' },
  month: { title: '近 6 个月', span: '6 个月', unit: '个月' },
  year: { title: '全年逐月', span: '这一年', unit: '个月' }
}
const trendMode = ref('expense')
const trendRows = computed(function () {
  return txStore.periodTrend
})
const trendTitle = computed(function () {
  if (period.value === 'year') return new Date(anchorTs.value).getFullYear() + ' 年逐月'
  return TREND_META[period.value].title
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
/** 柱子底部的标签：日/周桶键是时间戳 → '9/21'；月/年桶键是 'YYYY-MM' → '9月' */
function bucketLabel(key) {
  if (period.value === 'day' || period.value === 'week') return dayTrendLabel(key)
  return ymLabel(key)
}
const trendFoot = computed(function () {
  const meta = TREND_META[period.value]
  const total = trendValues.value.reduce(function (s, v) { return s + v }, 0)
  const word = trendMode.value === 'income' ? '收入' : '支出'
  if (!total) return meta.span + '还没有' + word + '记录'
  const n = trendRows.value.filter(function (m) {
    return (trendMode.value === 'income' ? m.incomeCents : m.expenseCents) > 0
  }).length
  return meta.span + '共' + word + ' ¥' + formatCents(total) + '（有记录的 ' + n + ' ' + meta.unit + '）'
})
/** 金额紧凑写法：0 → ¥0；< 1 万 → ¥1,234；≥ 1 万 → ¥1.8万 */
function compactYuan(cents) {
  const c = Math.max(0, Number(cents) || 0)
  if (!c) return '¥0'
  const yuan = c / 100
  if (yuan < 10000) return '¥' + Math.round(yuan).toLocaleString('en-US')
  return '¥' + (yuan / 10000).toFixed(1) + '万'
}

function catOf(name) {
  return categoryStore.list.find(function (c) { return c.name === name }) || { name: name, icon: '📦' }
}
function goHome() {
  uni.reLaunch({ url: '/pages/home/home' })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

onShow(function () {
  reload()
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
  background: var(--cd-icon);
}
/* 月份胶囊：统计页自己选分析哪个月 */
.month-chip {
  background: var(--cd-primary-lt);
  color: var(--cd-icon);
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
  color: var(--cd-icon-2);
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
  /* 兜底底色：设备画不了 conic-gradient 时，这里就是那圈"素色环"（T3.7） */
  background: var(--cd-primary-lt);
}
/* 降级提示：环画不出来时，把用户引到排行卡的占比条 */
.donut-tip {
  display: block;
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
.donut-center {
  position: absolute;
  inset: 25%;
  background: var(--cd-primary-mid);
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
  color: var(--cd-icon-2);
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
  background: var(--cd-primary-mid);
  transition: height 240ms var(--cd-ease);
}
.bar-fill.max {
  background: var(--cd-primary-deep);
}
.bar-fill.income {
  background: var(--cd-income-lt);
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
