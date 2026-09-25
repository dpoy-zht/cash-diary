<template>
  <view class="page">
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
.me-card {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  margin: 12px 16px;
}
.me-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #ebedf0;
}
.me-row:last-child {
  border-bottom: 0;
}
.mr-label {
  font-size: 15px;
  color: #222426;
}
.mr-value {
  margin-left: auto;
  font-size: 13px;
  color: #8a8f99;
}
.badge {
  margin-left: auto;
  font-size: 11px;
  color: #8a8f99;
  background: #f1f2f4;
  padding: 2px 8px;
  border-radius: 999px;
}
.me-tip {
  margin: 16px;
  font-size: 12px;
  color: #8a8f99;
  line-height: 1.7;
}
.me-version {
  text-align: center;
  color: #c0c4cb;
  font-size: 12px;
  padding: 8px 0 20px;
}
</style>
