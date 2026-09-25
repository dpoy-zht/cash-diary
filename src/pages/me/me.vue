<template>
  <view class="page">
    <nav-bar title="我的" />

    <view class="me-hero cd-card cd-glow">
      <mascot :size="64" />
      <view class="hero-main">
        <text class="hero-title">现金日记</text>
        <text class="hero-sub">今天想记点什么呢</text>
      </view>
    </view>

    <view class="me-card cd-card">
      <view class="me-row">
        <text class="mr-label">存储模式</text>
        <text class="mr-value">{{ storageLabel }}</text>
      </view>
      <view class="me-row">
        <text class="mr-label">记录条数</text>
        <text class="mr-value">{{ recordCount }}</text>
      </view>
    </view>

    <view class="me-card cd-card">
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
import { useNavScrollWatch } from '../../utils/nav-scroll.js'

const txStore = useTxStore()
const metaStore = useMetaStore()

// 内容不足一屏时不会触发滚动，也就不会采样——没有滚动开销自然无需降级
useNavScrollWatch()

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

/* ---- 顶部：吉祥物打招呼（= 参考项目 .menu-header 的渐变头图手法）---- */
.me-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 16px;
  padding: 18px;
}
.hero-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hero-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: 0.3px;
}
.hero-sub {
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink-2);
}

/* 卡片材质走全局 .cd-card（模板里已挂类名） */
.me-card {
  margin: 12px 16px;
  padding: 4px 0;
}
.me-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cd-line-ink);
}
.me-row:last-child {
  border-bottom: 0;
}
.mr-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.mr-value {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink-2);
}
/* 未上线的功能用浅鹅黄胶囊标注，视觉上"待办但不喧宾夺主" */
.badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--cd-accent-ink);
  background: rgba(255, 228, 160, 0.75);
  padding: 4px 10px;
  border-radius: var(--cd-r-pill);
}
.me-tip {
  margin: 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink-2);
  line-height: 1.8;
}
.me-version {
  text-align: center;
  color: var(--cd-ink-3);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 0 20px;
}
</style>
