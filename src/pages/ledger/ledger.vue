<template>
  <view class="page">
    <view class="navbar"><text class="nav-title">我的账本</text></view>

    <!-- 当前账本卡（财神奶龙圆形裁切后趴在右上角） -->
    <view class="ledger-card">
      <view class="caishen">
        <image class="caishen-img" src="/static/milo/milo-caishen.webp" mode="aspectFit" />
      </view>
      <text class="lc-label">当前账本</text>
      <text class="lc-name">{{ ledgerName }}</text>
      <text class="lc-num">¥{{ balanceText }}</text>
      <view class="lc-row">
        <text class="inc">已存 ¥{{ incomeText }}</text>
        <text class="exp">已花 ¥{{ expenseText }}</text>
      </view>
    </view>

    <!-- 账本统计 -->
    <view class="info-card">
      <view class="info-row">
        <text class="ir-label">累计记录</text>
        <text class="ir-value">{{ overview.totalCount }} 笔</text>
      </view>
      <view class="info-row">
        <text class="ir-label">最早一笔</text>
        <text class="ir-value">{{ firstText }}</text>
      </view>
      <view class="info-row">
        <text class="ir-label">最近一笔</text>
        <text class="ir-value">{{ lastText }}</text>
      </view>
    </view>

    <view v-if="!overview.totalCount" class="tip-card cd-empty">
      <image class="tip-img" src="/static/milo/milo-innocent.webp" mode="aspectFit" />
      <text class="tip-text">这个账本还是空的，去记一笔吧~</text>
    </view>

    <!-- 多账本：诚实说明，不摆点了没反应的按钮 -->
    <view class="tip-card">
      <text class="tip-text">
        多账本（如「日常」「旅行基金」分开记）还在计划里，做好后可以在这里新建与切换。
      </text>
    </view>

    <tab-bar current="ledger" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { formatCents } from '../../utils/money.js'
import { balanceCents } from '../../utils/stats.js'

/**
 * 账本页（v2.0 风格）。
 *
 * 诚实说明：当前数据层还没有多账本（schema 里没有 account 表，MVP 时省掉了），
 * 所以这一页是「当前账本 + 全量统计」的真实数据版；多账本属于后续功能。
 * 页面上不放"新建账本"按钮——没实现的功能不摆按钮。
 */
const txStore = useTxStore()
const metaStore = useMetaStore()

const ledgerName = '日常账本'

/** 全量概览（模板里直接用 overview.xxx，所以要在脚本里显式暴露一个绑定） */
const overview = computed(function () {
  return txStore.overview
})

const balanceText = computed(function () {
  return formatCents(balanceCents(txStore.overview))
})
const incomeText = computed(function () {
  return formatCents(txStore.overview.incomeCents)
})
const expenseText = computed(function () {
  return formatCents(txStore.overview.expenseCents)
})

function shortDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}
const firstText = computed(function () {
  return shortDate(txStore.overview.firstAt)
})
const lastText = computed(function () {
  return shortDate(txStore.overview.lastAt)
})

onShow(function () {
  txStore.refresh(metaStore.ym)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 90px;
  /* navigationStyle:custom 下页面从 y=0 开始，自己让出状态栏 */
  padding-top: var(--status-bar-height, 0px);
}

.navbar {
  padding: 12px 20px 4px;
}
.nav-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--cd-ink);
}

/* ---- 当前账本卡 ---- */
.ledger-card {
  margin: 12px 16px;
  padding: 20px;
  border-radius: var(--cd-r-card);
  background: var(--cd-grad-brand);
  box-shadow: 0 10px 24px rgba(255, 217, 61, 0.35);
  position: relative;
}
/* 场景底图用圆形裁切 + 白描边，避免方形照片边角 */
.caishen {
  position: absolute;
  top: -18px;
  right: 14px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #ffffff;
  background: var(--cd-primary-lt);
  box-shadow: 0 4px 10px rgba(93, 78, 55, 0.18);
}
.caishen-img {
  width: 100%;
  height: 100%;
}
.lc-label {
  font-size: 12px;
  color: #8a7450;
}
.lc-name {
  display: block;
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
  margin: 4px 0 2px;
}
.lc-num {
  display: block;
  font-size: 30px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}
.lc-row {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
}
.inc {
  color: var(--cd-income);
  font-weight: 700;
}
.exp {
  color: var(--cd-ink);
}

/* ---- 统计卡 ---- */
.info-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 4px 16px;
  box-shadow: var(--cd-sh-card);
}
.info-row {
  display: flex;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--cd-line);
}
.info-row:last-child {
  border-bottom: none;
}
.ir-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.ir-value {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink-2);
  font-variant-numeric: tabular-nums;
}

/* ---- 说明 / 空态卡 ---- */
.tip-card {
  margin: 12px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 16px;
  box-shadow: var(--cd-sh-card);
}
.cd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px;
}
.tip-img {
  width: 110px;
  height: 110px;
  border-radius: 16px;
  margin-bottom: 8px;
}
.tip-text {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--cd-ink-2);
}
</style>
