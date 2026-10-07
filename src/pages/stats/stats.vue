<template>
  <view class="page">
    <!-- 顶部导航 -->
    <view class="navbar">
      <view class="icon-btn" @click="goHome"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">奶蛙算账</text>
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

    <!-- 环形图卡：圆环 + 圆心合计/环比 + 分类占比列表（点任意一行筛选下方明细） -->
    <view class="donut-wrap">
      <block v-if="segments.length">
        <view class="donut" :style="{ background: donutBg }" @click="onDonutTap">
          <view class="donut-center">
            <asset-slot slot-id="stats.donut" img-class="donut-milo" />
            <view class="dc-text">
              <text class="dc-label">{{ centerLabel }}</text>
              <text class="dc-value" :class="centerValueSize">{{ centerValue }}</text>
              <text v-if="mom.text" class="dc-mom" :class="mom.dir">{{ mom.text }} {{ momLabel }}</text>
            </view>
          </view>
        </view>
        <text v-if="!conicOk" class="donut-tip">这台设备画不出圆环图，看下面的分类占比条，一样准</text>

        <view class="donut-list">
          <text class="dl-title">{{ listTitle }}</text>
          <!-- 下钻头：点它 = 选整个一级（含所有二级） -->
          <view
            v-if="drill"
            class="dl-row pressable"
            :class="{ on: activeId === drill.topId }"
            hover-class="pressable-hover"
            hover-stay-time="80"
            @click="toggleCategory(drill.topId)"
          >
            <cat-icon :category="drill.topCat" :size="32" />
            <view class="dl-main">
              <view class="dl-line">
                <text class="dl-name">全部{{ drill.topCat.name }}</text>
                <text class="dl-amt">¥{{ formatCents(drill.total) }}</text>
              </view>
              <view class="dl-bar">
                <view class="dl-bar-i" :style="{ width: '100%', background: drill.topColor }" />
              </view>
            </view>
            <text class="dl-pct">{{ pctText(1) }}</text>
          </view>
          <view
            v-for="s in listRows"
            :key="s.category_id"
            class="dl-row pressable"
            :class="{ on: s.category_id === activeId }"
            hover-class="pressable-hover"
            hover-stay-time="80"
            @click="toggleCategory(s.category_id)"
          >
            <cat-icon :category="catOf(s.category_id)" :size="32" />
            <view class="dl-main">
              <view class="dl-line">
                <text class="dl-name">{{ s.name }}</text>
                <text class="dl-amt">¥{{ formatCents(s.cents) }}</text>
              </view>
              <view class="dl-bar">
                <view class="dl-bar-i" :style="{ width: barWidth(s), background: s.color }" />
              </view>
            </view>
            <text class="dl-pct">{{ pctText(s.pct) }}</text>
          </view>
        </view>
      </block>
      <view v-else class="empty">
        <asset-slot slot-id="stats.empty" img-class="empty-img" />
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-sub">记几笔，奶蛙帮你看看钱花哪了</text>
      </view>
    </view>

    <!-- 明细：点扇区/占比行筛选，再点一次取消 -->
    <view v-if="segments.length" class="detail-card">
      <view class="detail-head">
        <text class="detail-title">本期明细</text>
        <view v-if="activeId != null" class="detail-chip pressable" hover-class="pressable-hover" hover-stay-time="80" @click="clearSelect">
          <text class="dc-chip-text">{{ activeName }}</text>
          <text class="dc-chip-x">×</text>
        </view>
        <text v-else class="detail-count">共 {{ detailAll.length }} 笔</text>
      </view>
      <view v-if="detailRows.length" class="detail-list">
        <view v-for="r in detailRows" :key="r.id" class="dt-row">
          <cat-icon :category="catOf(r.category_id)" :size="30" />
          <view class="dt-main">
            <text class="dt-name">{{ nameOf(r) }}</text>
            <text class="dt-sub">{{ shortDateTime(r.occurred_at) }}{{ noteOf(r) }}</text>
          </view>
          <text class="dt-amt" :class="{ inc: r.type === 'income' }">
            {{ r.type === 'income' ? '+' : '-' }}¥{{ formatCents(r.amount_cents) }}
          </text>
        </view>
        <text v-if="detailMore > 0" class="dt-more">还有 {{ detailMore }} 笔没显示，缩小期间区间就能看全</text>
      </view>
      <view v-else class="detail-empty">
        <text class="dt-empty-text">{{ activeId == null ? '这个期间还没有记录' : '「' + activeName + '」本期没有记录' }}</text>
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

    <!-- 月度报告入口（T4.4）：把"这个月过得怎么样"整理成一页 -->
    <view class="report-entry" @click="goReport">
      <view class="re-main">
        <text class="re-title">月度报告</text>
        <text class="re-sub">{{ reportEntrySub }}</text>
      </view>
      <view class="re-arrow" :style="iconArrow" />
    </view>

    <tab-bar current="stats" />
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import {
  expenseByCategory,
  donutSegments,
  conicGradient,
  supportsConicGradient,
  sectorAtPoint,
  momOf,
  momLabelOf,
  pctText,
  filterByCategoryIds,
  barPercents,
  maxIndex,
  rollupToTopLevel,
  drillSegments,
  subtreeIds
} from '../../utils/stats.js'
import {
  ymLabel,
  toDateStr,
  tsFromDateStr,
  weekStart,
  dayTrendLabel,
  periodNameOf,
  shortDateTime
} from '../../utils/date.js'
import { formatCents, groupThousands } from '../../utils/money.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 统计（v2.1）：日 / 周 / 月 / 年四种期间 —— 收支合计 + 环形图 + 分类占比 + 明细 + 趋势柱状图。
 * 数据全部来自 txStore.loadStatsPeriod（一次区间查询 + JS 分桶，分桶逻辑在 utils/stats.js 纯函数）：
 * - day  → 当天，趋势看近 7 天逐日
 * - week → 本周（周一为一周之始），趋势看近 4 周逐周
 * - month→ 与首页共用 meta store 的月份，趋势看近 6 个月
 * - year → 当年，趋势看全年逐月
 *
 * 环形图交互（2026-10-07）：
 * - 圆心 = 期间支出合计 + 环比（较昨日/上周/上月/去年）
 * - 扇区与占比列表都能点：点中 → 下方明细只留该分类；再点一次取消
 * - 点扇区靠**角度换算**（App 端没有 hover，也没有可点的 svg 分段），
 *   几何都在 utils/stats.js: sectorAtPoint（纯函数、可单测）
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
  // ⚠️ 圆环按**一级**汇总：升级后支出有 12 个一级 + 37 个二级，
  // 直接画 49 个分类会切成一堆碎扇形。点开某个一级再看它的二级（下钻）。
  return expenseByCategory(
    rollupToTopLevel(txStore.periodRecords, categoryStore.list),
    categoryStore.list
  )
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

/* ---- 圆心：合计 + 环比 ---- */
const centerLabel = computed(function () {
  return periodName.value + '支出'
})
/** 环内直径只有 100px：位数多了就换紧凑写法，不让数字挤出圆心 */
const centerValue = computed(function () {
  const txt = periodExpenseText.value
  return txt.length <= 9 ? txt : compactYuan(txStore.periodSummary.expenseCents)
})
const centerValueSize = computed(function () {
  const n = centerValue.value.length
  if (n >= 10) return 'sm'
  if (n >= 8) return 'md'
  return ''
})
const mom = computed(function () {
  return momOf(txStore.periodSummary.expenseCents, txStore.periodPrevSummary.expenseCents)
})
const momLabel = computed(function () {
  return momLabelOf(period.value)
})

/* ---- 选中分类 → 筛选下方明细（一级可下钻到二级） ---- */
/**
 * `activeId` 既可能是一级也可能是二级：
 * - 点圆环扇区 / 一级行 → 一级（明细收敛到**整棵子树**）
 * - 下钻列表里点某个二级 → 二级（明细只留这一个）
 * 再点一次同一个 → 全部取消。
 */
const activeId = ref(null)

/** 当前选中项对应的分类对象（查不到 = 已被删/换期间，视作未选中） */
const activeCat = computed(function () {
  if (activeId.value == null) return null
  return categoryStore.byId(activeId.value)
})
const activeName = computed(function () {
  const c = activeCat.value
  return c ? c.name : ''
})

/**
 * 正在下钻的一级：选中项是一级就用它自己，是二级就取其父级。
 * 只有在"该一级确实有子类"时才算下钻，否则列表还是原来的一级排行。
 */
const drill = computed(function () {
  const c = activeCat.value
  if (!c) return null
  const top = c.parent_id == null ? c : categoryStore.byId(c.parent_id)
  if (!top) return null
  const hasChild = categoryStore.list.some(function (x) { return Number(x.parent_id) === Number(top.id) })
  if (!hasChild) return null
  const sub = drillSegments(txStore.periodRecords, categoryStore.list, top.id)
  if (!sub.rows.length) return null
  const hit = segments.value.find(function (s) { return s.category_id === Number(top.id) })
  return {
    topId: Number(top.id),
    topCat: top,
    topColor: hit ? hit.color : '',
    total: sub.total,
    rows: sub.rows
  }
})

/** 列表内容：下钻时看二级，否则看一级排行 */
const listRows = computed(function () {
  return drill.value ? drill.value.rows : segments.value
})
const barMax = computed(function () {
  const list = listRows.value
  return list.length ? list[0].cents : 0
})
const listTitle = computed(function () {
  if (activeId.value == null) return '按分类看（点一下筛明细）'
  if (drill.value) {
    return activeCat.value && activeCat.value.parent_id != null
      ? '「' + activeName.value + '」在「' + drill.value.topCat.name + '」里，再点一次取消'
      : '看「' + drill.value.topCat.name + '」的明细，再点一次取消'
  }
  return '正在看「' + activeName.value + '」，再点一次取消'
})

/**
 * 期间/数据变化后，原来选中的分类可能已经不在本期里（切了月份、删了记录）。
 * 不自动清掉的话，用户会看到一个"筛不出任何东西"的列表却不知道为什么。
 * 一级按它自己判断，二级按它所属的一级判断（一级本期没数据，其子类必然也没有）。
 */
watch(segments, function (list) {
  if (activeId.value == null) return
  const c = activeCat.value
  if (!c) { activeId.value = null; return }
  const topId = c.parent_id == null ? Number(c.id) : Number(c.parent_id)
  const still = list.some(function (s) { return s.category_id === topId })
  if (!still) activeId.value = null
})

/** 点圆环扇区 / 一级行 / 下钻行 —— 同一个再点一次就取消 */
function toggleCategory(id) {
  const n = Number(id)
  activeId.value = activeId.value === n ? null : n
}
function clearSelect() {
  activeId.value = null
}

/**
 * 点圆环：把触点换算成"相对圆心"的偏移，交给纯函数判扇区。
 *
 * 跨端坐标口径不完全一致（`detail.x/y` 与 `touches[0].clientX/Y` 都是视口坐标，
 * `pageX/pageY` 是文档坐标），所以：**先取视口坐标，取不到就不处理**。
 * 宁可点击无反应（还有旁边的占比行可点），也不要按错误的坐标选中一个不相干的分类。
 */
function onDonutTap(e) {
  if (!conicOk.value) return
  const p = viewportPoint(e)
  if (!p) return
  let box = null
  try {
    uni.createSelectorQuery().select('.donut').boundingClientRect(function (res) {
      box = res
    }).exec()
  } catch (err) {
    return
  }
  if (!box || !box.width) return
  const hit = sectorAtPoint(
    segments.value,
    p.x - (box.left + box.width / 2),
    p.y - (box.top + box.height / 2),
    box.width / 2
  )
  if (!hit) return
  toggleCategory(hit.category_id)
}

function viewportPoint(e) {
  const d = e && e.detail
  if (d && typeof d.x === 'number' && typeof d.y === 'number') return { x: d.x, y: d.y }
  const t = (e && e.touches && e.touches[0]) ||
    (e && e.changedTouches && e.changedTouches[0]) || null
  if (t && typeof t.clientX === 'number') return { x: t.clientX, y: t.clientY }
  return null
}

/* ---- 分类取用与占比条 ---- */
const catMap = computed(function () {
  const m = new Map()
  categoryStore.list.forEach(function (c) { m.set(Number(c.id), c) })
  return m
})
function catOf(id) {
  return catMap.value.get(Number(id)) || { id: Number(id), name: '其他', icon: 'more' }
}
function nameOf(r) {
  const c = catMap.value.get(Number(r.category_id))
  return c ? c.name : '其他'
}
function noteOf(r) {
  const n = String(r.note || '').trim()
  return n ? ' · ' + n : ''
}
function barWidth(s) {
  const max = barMax.value
  if (!max) return '0%'
  return Math.max(3, Math.round((s.cents / max) * 100)) + '%'
}

/* ---- 明细列表 ---- */
/** 一次最多渲染多少条：一年期间可能几百笔，全铺出来会把列表渲染成本推爆 */
const DETAIL_LIMIT = 60
/**
 * 筛选口径：
 * - 未选中 → 全部
 * - 选中一级 → **整棵子树**（自己 + 所有二级），否则直接记在一级上的那些流水会漏掉
 * - 选中二级 → 只有它自己
 */
const detailIds = computed(function () {
  const c = activeCat.value
  if (!c) return null
  if (c.parent_id != null) return [Number(c.id)]
  return subtreeIds(categoryStore.list, c.id)
})
const detailAll = computed(function () {
  return filterByCategoryIds(txStore.periodRecords, detailIds.value)
})
const detailRows = computed(function () {
  return detailAll.value
    .slice()
    .sort(function (a, b) { return b.occurred_at - a.occurred_at })
    .slice(0, DETAIL_LIMIT)
})
const detailMore = computed(function () {
  return Math.max(0, detailAll.value.length - DETAIL_LIMIT)
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
  if (yuan < 10000) return '¥' + groupThousands(Math.round(yuan))
  return '¥' + (yuan / 10000).toFixed(1) + '万'
}

function goHome() {
  uni.reLaunch({ url: '/pages/home/home' })
}
/** 月度报告入口（T4.4）：报告页与其他页共用 metaStore.ym，进去看到的就是当前这个月 */
function goReport() {
  uni.reLaunch({ url: '/pages/report/report' })
}
const reportEntrySub = computed(function () {
  return ymLabel(metaStore.ym) + '的收支、环比、花得最多的几类…一页看完'
})

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')
const iconArrow = svgMaskStyle('M8.6 7.4L7.2 8.8 10.4 12 7.2 15.2l1.4 1.4L13.2 12z')

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
/* 降级提示：环画不出来时，把用户引到下面的占比列表 */
.donut-tip {
  display: block;
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: var(--cd-ink);
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
/* 圆心 IP：垫在数字后面当水印。
   ⚠️ 宽高由插槽登记表给（asset-slot 写行内样式），这里只加定位与透明度 ——
   页面类再写 width/height 会和登记表的盒子打架。 */
.donut-milo {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.18;
}
.dc-text {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
/* 圆心底色是 --cd-primary-mid：小字一律用 --cd-ink（实测 6.2:1），
   --cd-ink-2 在这个底色上只有 3.7:1，不达 AA，不能承载正文 */
.dc-label {
  font-size: 10px;
  line-height: 1.3;
  color: var(--cd-ink);
}
.dc-value {
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.dc-value.md {
  font-size: 15px;
}
.dc-value.sm {
  font-size: 13px;
}
.dc-mom {
  font-size: 10px;
  line-height: 1.4;
  font-weight: 700;
  color: var(--cd-ink);
}
/* 环比方向：花得更多用 --cd-danger-ink（在 --cd-primary-mid 上 4.6:1，达 AA）；
   「花得更少」是好消息，不抢注意力，用主文字色 + ↓ 箭头表达。
   --cd-income 在这个底色上只有 3.3:1，达不到 AA，所以不用它。 */
.dc-mom.up {
  color: var(--cd-danger-ink);
}

/* ---- 分类占比列表（环图的"图例 + 排行"） ---- */
.donut-list {
  margin-top: 16px;
}
.dl-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
  margin-bottom: 8px;
}
.dl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--cd-r-sm);
}
/* 选中态：蛋黄底 + 描边，和"点开筛选"的语义绑定 */
.dl-row.on {
  background: rgba(255, 255, 255, 0.65);
  box-shadow: inset 0 0 0 2px var(--cd-primary-deep);
}
.dl-main {
  flex: 1;
  min-width: 0;
}
.dl-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.dl-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
}
.dl-amt {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.dl-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.6);
  margin-top: 5px;
  overflow: hidden;
}
.dl-bar-i {
  height: 100%;
  border-radius: 3px;
}
.dl-pct {
  width: 42px;
  text-align: right;
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  flex: none;
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
  color: var(--cd-ink);
}

/* ---- 明细卡 ---- */
.detail-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.detail-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
}
.detail-count {
  font-size: 12px;
  color: var(--cd-ink-2);
}
/* 筛选态胶囊：点它取消筛选（等价于点一次已选中的扇区） */
.detail-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--cd-primary-lt);
  border-radius: var(--cd-r-pill);
  padding: 4px 10px;
}
.dc-chip-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-icon);
}
.dc-chip-x {
  font-size: 13px;
  line-height: 1;
  color: var(--cd-ink-2);
}
.detail-list {
  margin-top: 6px;
}
.dt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--cd-line);
}
.dt-row:last-child {
  border-bottom: none;
}
.dt-main {
  flex: 1;
  min-width: 0;
}
/* <text> 在横向 flex 里必须显式 block，否则两行会挤成一行 */
.dt-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
}
.dt-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--cd-ink-2);
}
.dt-amt {
  flex: none;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.dt-amt.inc {
  color: var(--cd-income);
}
.dt-more {
  display: block;
  margin-top: 10px;
  font-size: 11px;
  color: var(--cd-ink-2);
}
.detail-empty {
  padding: 18px 0 6px;
  text-align: center;
}
.dt-empty-text {
  font-size: 12px;
  color: var(--cd-ink-2);
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

/* ---- 月度报告入口 ---- */
.report-entry {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
  display: flex;
  align-items: center;
  gap: 10px;
}
.re-main {
  flex: 1;
  min-width: 0;
}
.re-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
}
.re-sub {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--cd-ink-2);
}
.re-arrow {
  width: 18px;
  height: 18px;
  background: var(--cd-icon-3);
  flex: none;
}
</style>
