<template>
  <view class="page">
    <view class="me-hero">
      <mascot :size="64" />
      <view class="hero-main">
        <text class="hero-title">现金日记</text>
        <text class="hero-sub">今天想记点什么呢</text>
      </view>
    </view>

    <view class="me-card">
      <view class="me-row">
        <text class="mr-label">存储模式</text>
        <text class="mr-value">{{ storageLabel }}</text>
      </view>
      <view class="me-row">
        <text class="mr-label">记录条数</text>
        <text class="mr-value">{{ recordCount }}</text>
      </view>
    </view>

    <view class="me-card">
      <view class="me-row">
        <text class="mr-label">分类管理</text>
        <text class="badge">P1 敬请期待</text>
      </view>
      <view class="me-row">
        <text class="mr-label">预算提醒</text>
        <text class="badge">P1 敬请期待</text>
      </view>
      <view class="me-row">
        <text class="mr-label">数据备份</text>
        <text class="badge">P2 敬请期待</text>
      </view>
      <view class="me-row">
        <text class="mr-label">统计图表</text>
        <text class="badge">P1 敬请期待</text>
      </view>
    </view>

    <view class="me-tip">{{ tip }}</view>
    <view class="me-version">现金日记 v0.1.0 · MVP</view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'

const txStore = useTxStore()
const metaStore = useMetaStore()

const isApp = computed(function () {
  return typeof plus !== 'undefined' && !!plus.sqlite
})
const storageLabel = computed(function () {
  return isApp.value ? 'SQLite 本地数据库' : '浏览器演示存储'
})
const recordCount = computed(function () {
  return txStore.records.length + ' 条（' + metaStore.ym + '）'
})
const tip = computed(function () {
  return isApp.value
    ? '离线优先：所有数据保存在本机 SQLite，无网络也可记账与查看。'
    : '当前运行在浏览器演示存储（内存/localStorage），正式使用请在 HBuilderX 中运行到手机。'
})
</script>

<style scoped>
.page {
  padding-bottom: 20px;
}

/* ---- 顶部：吉祥物打招呼 ---- */
.me-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 16px;
  padding: 16px;
  background: linear-gradient(135deg, var(--cd-cream) 0%, var(--cd-surface) 60%);
  border-radius: var(--cd-r-lg);
  box-shadow: var(--cd-sh-1);
}
.hero-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hero-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--cd-ink);
}
.hero-sub {
  font-size: 12px;
  color: var(--cd-ink-2);
}

.me-card {
  background: var(--cd-surface);
  border-radius: var(--cd-r-lg);
  overflow: hidden;
  margin: 12px 16px;
  box-shadow: var(--cd-sh-1);
}
.me-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cd-line);
}
.me-row:last-child {
  border-bottom: 0;
}
.mr-label {
  font-size: 15px;
  color: var(--cd-ink);
}
.mr-value {
  margin-left: auto;
  font-size: 13px;
  color: var(--cd-ink-2);
}
/* 未上线的功能用浅奶黄胶囊标注，视觉上"待办但不喧宾夺主" */
.badge {
  margin-left: auto;
  font-size: 11px;
  color: var(--cd-ink-2);
  background: var(--cd-cream);
  padding: 3px 10px;
  border-radius: var(--cd-r-pill);
}
.me-tip {
  margin: 16px;
  font-size: 12px;
  color: var(--cd-ink-2);
  line-height: 1.8;
}
.me-version {
  text-align: center;
  color: var(--cd-ink-3);
  font-size: 12px;
  padding: 8px 0 20px;
}
</style>
