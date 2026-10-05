<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">月度报告</text>
      <picker mode="month" :value="ym" @change="onPickMonth">
        <view class="month-chip">{{ chipText }}</view>
      </picker>
    </view>

    <block v-if="report">
      <!-- 概览：本月支出 + 环比 -->
      <view class="hero">
        <mascot-deco class="hero-milo" :mood="heroMood" slot-id="deco.report.hero" />
        <text class="hero-label">{{ report.label }} · 一共花了</text>
        <text class="hero-num">¥{{ fmt(report.expenseCents) }}</text>
        <view class="mom" :class="report.mom.expense.dir">
          <text class="mom-txt">{{ momText(report.mom.expense, '支出') }}</text>
        </view>
        <view class="hero-sub">
          <text class="hs-item">收入 ¥{{ fmt(report.incomeCents) }}</text>
          <text class="hs-sep">·</text>
          <text class="hs-item">结余 <text class="hs-num" :class="{ neg: report.balanceCents < 0 }">{{ balanceText(report.balanceCents) }}</text></text>
        </view>
      </view>

      <!-- 记账节奏 -->
      <view class="card">
        <text class="card-title">这个月你</text>
        <view class="grid">
          <view class="g-item">
            <text class="g-num">{{ report.recordDays }}<text class="g-unit">天</text></text>
            <text class="g-label">有记账</text>
          </view>
          <view class="g-item">
            <text class="g-num">{{ report.count }}<text class="g-unit">笔</text></text>
            <text class="g-label">共记了</text>
          </view>
          <view class="g-item">
            <text class="g-num g-num-sm">¥{{ fmt(report.avgPerDayCents) }}</text>
            <text class="g-label">日均支出</text>
          </view>
        </view>
        <text v-if="report.budget.hasBudget" class="card-foot">
          日均额度 ¥{{ fmt(report.budget.perDayCents) }}（总预算 ¥{{ fmt(report.budget.limitCents) }} ÷ {{ report.daysInMonth }} 天）·
          <text v-if="report.budget.overDays" class="foot-warn">有 {{ report.budget.overDays }} 天超了</text>
          <text v-else class="foot-ok">一天都没超，稳</text>
        </text>
        <text v-else class="card-foot">还没设总预算 —— 设一个就能看出这个月哪几天花超了</text>
      </view>

      <!-- 分类 TOP5 -->
      <view class="card">
        <text class="card-title">{{ topTitle }}</text>
        <view v-for="c in report.topCategories" :key="c.category_id" class="rank-row">
          <text class="rank-no" :class="{ top: c.rank === 1 }">{{ c.rank }}</text>
          <cat-icon :category="c" :size="32" />
          <view class="rank-main">
            <view class="rank-line">
              <text class="rank-name">{{ c.name }}</text>
              <text class="rank-amt">¥{{ fmt(c.cents) }}<text class="rank-pct">{{ Math.round(c.pct * 100) }}%</text></text>
            </view>
            <view class="bar"><view class="bar-i" :style="{ width: Math.round(c.pct * 100) + '%', background: c.color }" /></view>
          </view>
        </view>
        <view v-if="!report.topCategories.length" class="no-data">
          <text class="no-data-txt">{{ report.label }}还没有支出记录</text>
        </view>
      </view>

      <!-- 按标签看（T5.1）：一笔都没打过标签时整块不显示，不留空区块 -->
      <view v-if="report.tagTop.list.length" class="card">
        <text class="card-title">按标签看</text>
        <view v-for="t in report.tagTop.list" :key="t.tag_id" class="rank-row">
          <view class="tag-dot" :style="{ background: tagColorOf(t) }"></view>
          <view class="rank-main">
            <view class="rank-line">
              <text class="rank-name">{{ t.name }}</text>
              <text class="rank-amt">¥{{ fmt(t.cents) }}<text class="rank-pct">{{ Math.round(t.pct * 100) }}%</text></text>
            </view>
            <view class="bar"><view class="bar-i" :style="{ width: Math.round(t.pct * 100) + '%', background: tagColorOf(t) }" /></view>
          </view>
        </view>
        <text v-if="report.tagTop.overlaps" class="card-foot">一笔账可以挂多个标签，所以上面几项加起来可能超过当月总支出</text>
      </view>

      <!-- 最大一笔 -->
      <view v-if="report.biggest.expense" class="card">
        <text class="card-title">最大的一笔</text>
        <view class="big-row">
          <cat-icon :category="report.biggest.expense" :size="42" />
          <view class="big-main">
            <text class="big-amt">¥{{ fmt(report.biggest.expense.cents) }}</text>
            <text class="big-meta">{{ report.biggest.expense.name }} · {{ report.biggest.expense.dateText }}</text>
          </view>
        </view>
        <text v-if="report.biggest.expense.note" class="big-note">备注：{{ report.biggest.expense.note }}</text>

        <view v-if="report.biggest.income" class="big-row big-row-income">
          <cat-icon :category="report.biggest.income" :size="42" />
          <view class="big-main">
            <text class="big-amt inc">¥{{ fmt(report.biggest.income.cents) }}</text>
            <text class="big-meta">最大一笔收入 · {{ report.biggest.income.name }} · {{ report.biggest.income.dateText }}</text>
          </view>
        </view>
      </view>

      <text class="share-tip">截图就能分享给家人看看这个月的账</text>
    </block>

    <view v-else class="loading">
      <text class="loading-txt">奶龙正在翻账本…</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useBudgetStore } from '../../stores/budget.js'
import { useMetaStore } from '../../stores/meta.js'
import { useTagStore } from '../../stores/tag.js'
import * as tagService from '../../services/tag.js'
import { buildMonthlyReport } from '../../utils/report.js'
import { formatCents } from '../../utils/money.js'
import { tagColorOf } from '../../utils/palette.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 月度报告（T4.4）：把当月流水整理成"一页看完"的复盘。
 *
 * 所有数字都来自 utils/report.js 的纯函数（在那边的注释里写清了每个口径），
 * 页面只做排版与文案 —— 这样报告里的"支出合计"与统计页必然是同一个数，
 * 不会出现两处各算一遍、慢慢算出两种结果的情况。
 *
 * 月份与其他页共用 metaStore.ym：在统计页看的哪个月，进来就是哪个月。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const budgetStore = useBudgetStore()
const metaStore = useMetaStore()
const tagStore = useTagStore()

/** 报告快照：每次 reload 整体重建，避免页面里出现半新半旧的数字 */
const report = ref(null)

const ym = computed(function () {
  return metaStore.ym
})
const chipText = computed(function () {
  const parts = String(ym.value).split('-')
  return parts[0] + '/' + Number(parts[1])
})

function load() {
  report.value = null
  return Promise.all([
    txStore.loadReport(ym.value),
    categoryStore.init(),
    budgetStore.load(),
    tagStore.load()
  ])
    .then(async function () {
      // 标签关联按当月流水一次取回（buildMonthlyReport 要的是原始关联行）
      let txTags = []
      try {
        const ids = (txStore.reportRecords || []).map(function (r) { return r.id })
        txTags = await tagService.tagRowsByTxs(ids)
      } catch (e) { /* 取不到标签不影响报告主体，标签区块自然为空 */ }
      report.value = buildMonthlyReport({
        ym: ym.value,
        records: txStore.reportRecords,
        prevRecords: txStore.reportPrevRecords,
        categories: categoryStore.list,
        totalBudgetCents: budgetStore.totalCents,
        tags: tagStore.list,
        txTags: txTags
      })
    })
    .catch(function () {
      uni.showToast({ title: '报告生成失败，请稍后再试', icon: 'none' })
    })
}

function onPickMonth(e) {
  const v = e.detail.value
  if (!/^\d{4}-\d{2}$/.test(v)) return
  metaStore.ym = v
  load()
}

function goBack() {
  uni.reLaunch({ url: '/pages/stats/stats' })
}

/** 金额（不带符号，永远正数展示） */
function fmt(cents) {
  return formatCents(Math.abs(Number(cents) || 0))
}
/** 结余：负数写成 -¥12.34，而不是 ¥-12.34 */
function balanceText(cents) {
  const v = Number(cents) || 0
  return (v < 0 ? '-¥' : '¥') + formatCents(Math.abs(v))
}
/** 环比文案：算不出涨幅（上月为 0）时说人话，不显示 NaN% */
function momText(m, what) {
  if (m.pct === null) return m.curCents ? '上月还没有' + what : '与上月持平'
  if (m.dir === 'flat') return '与上月持平'
  // 本月一笔都没有：说"跌了 100%"不如直接讲清楚
  if (!m.curCents) return '这个月还没有' + what
  return '较上月 ' + (m.dir === 'up' ? '+' : '-') + Math.abs(m.pct) + '%'
}

/** TOP 卡标题：一条支出都没有时不写"花得最多的 0 类" */
const topTitle = computed(function () {
  const n = report.value ? report.value.topCategories.length : 0
  return n ? '花得最多的 ' + n + ' 类' : '花得最多的是…'
})

/**
 * 头卡右上角的表情，跟着支出环比走：
 * 一笔没记 → innocent；比上月少花 → caishen 财神（"我省了"）；
 * 持平 → milo；比上月多花 → sad。
 * 直接读 report.mom.expense.dir，与下方环比文案同源，不另立判断标准。
 */
const heroMood = computed(function () {
  const r = report.value
  if (!r) return 'milo'
  if (!r.count) return 'innocent'
  const dir = r.mom.expense.dir
  if (dir === 'down') return 'caishen'
  if (dir === 'up') return 'sad'
  return 'milo'
})

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

onShow(function () {
  load()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40px;
  /* 让出状态栏（与其余页面一致） */
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
.month-chip {
  background: var(--cd-primary-lt);
  color: var(--cd-icon);
  font-size: 13px;
  font-weight: 700;
  padding: 7px 12px;
  border-radius: var(--cd-r-pill);
  font-variant-numeric: tabular-nums;
}

/* ---- 概览卡 ---- */
.hero {
  margin: 12px 16px;
  border-radius: var(--cd-r-card);
  padding: 22px 20px;
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
  overflow: hidden;
  position: relative;
}
.hero-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
.hero-num {
  display: block;
  margin-top: 4px;
  font-size: 34px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.mom {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-surface);
}
.mom-txt {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
/* 支出涨了需要留意，掉了是好事 —— 用颜色把这个意思直接表达出来 */
.mom.up .mom-txt {
  color: var(--cd-danger-ink);
}
.mom.down .mom-txt {
  color: var(--cd-income);
}
.hero-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
}
.hs-item {
  font-size: 13px;
  color: var(--cd-ink-2);
}
.hs-num {
  font-size: 13px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.hs-num.neg {
  color: var(--cd-danger-ink);
}
.hs-sep {
  font-size: 12px;
  color: var(--cd-ink-2);
}

/* ---- 通用白卡 ---- */
.card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.card-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 10px;
}
.card-foot {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
.foot-warn {
  font-weight: 800;
  color: var(--cd-danger-ink);
}
.foot-ok {
  font-weight: 800;
  color: var(--cd-income);
}

/* ---- 三格数字 ---- */
.grid {
  display: flex;
}
.g-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.g-num {
  font-size: 22px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
/* 金额比"天数/笔数"长，单独降一档字号，免得撑破格子 */
.g-num-sm {
  font-size: 17px;
}
.g-unit {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink-2);
  margin-left: 1px;
}
.g-label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--cd-ink-2);
}

/* ---- 分类排行 ---- */
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
/* 标签行的色点：宽度与 .rank-no 一致，让"分类 TOP"与"按标签看"两组排行的左边缘对齐 */
.tag-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rank-no {
  width: 16px;
  font-size: 13px;
  font-weight: 800;
  color: var(--cd-icon-3);
  font-variant-numeric: tabular-nums;
}
.rank-no.top {
  color: var(--cd-primary-deep);
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
  font-variant-numeric: tabular-nums;
}
/* 注意：金额与百分比之间靠这里的 margin 拉开，不要依赖模板里的空格 ——
   uni-app 编译模板时会把嵌套 <text> 前的空白吃掉，写成 "> {{ }}" 会贴成
   "¥1,800.0064%" 这种读不出金额的样式（H5 DOM 实测确认）。 */
.rank-pct {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-ink-2);
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
.no-data {
  padding: 12px 0;
}
.no-data-txt {
  font-size: 12px;
  color: var(--cd-ink-2);
}

/* ---- 最大一笔 ---- */
.big-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.big-row-income {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--cd-line);
}
.big-main {
  flex: 1;
  min-width: 0;
}
.big-amt {
  display: block;
  font-size: 20px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.big-amt.inc {
  color: var(--cd-income);
}
.big-meta {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--cd-ink-2);
}
.big-note {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--cd-ink-2);
  line-height: 1.6;
}

.share-tip {
  display: block;
  margin: 18px 16px 0;
  text-align: center;
  font-size: 11px;
  color: var(--cd-ink-2);
}

.loading {
  padding: 60px 16px;
  text-align: center;
}
.loading-txt {
  font-size: 13px;
  color: var(--cd-ink-2);
}



/* 财神奶龙探出卡片右上角。报告是"回顾"性质的页面，用财神图比默认表情更贴题；
   金额 34px 是全页最大字号，装饰件压到 58px 且绝对定位，不会盖住数字。 */
.hero-milo {
  top: 8px;
  right: 12px;
  opacity: 0.95;
}

</style>
