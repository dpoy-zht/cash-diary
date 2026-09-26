<template>
  <view class="tabbar">
    <view
      v-for="t in tabs"
      :key="t.key"
      class="tab"
      :class="{ on: t.key === current }"
      @click="go(t)"
    >
      <template v-if="t.key === 'add'">
        <view class="plus"><text class="plus-i">+</text></view>
      </template>
      <template v-else>
        <view class="t-ic" :style="iconStyle(t.icon)" />
        <text class="t-label">{{ t.name }}</text>
      </template>
    </view>
  </view>
</template>

<script setup>
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * v2.0 底部导航：5 项，中间凸起 +（进记一笔）。
 * 替代原生 tabBar（原生做不出中间凸起的 +）。
 * 首页 / 统计 / 我的 是平级页面，用 reLaunch 互切（状态在 Pinia，重渲染无负担）；
 * 记一笔是推入页（navigateTo，自带返回）。
 */
const props = defineProps({
  current: { type: String, default: 'home' }
})

const tabs = [
  { key: 'home', name: '首页', icon: 'M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3l9-8z' },
  { key: 'stats', name: '统计', icon: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z' },
  { key: 'add', name: '' },
  { key: 'ledger', name: '账本', icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 8h14v-2H7v2zm0-4h14v-2H7v2zm0-6v2h14V7H7z' },
  { key: 'me', name: '我的', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4z' }
]

function iconStyle(d) {
  return svgMaskStyle(d)
}

function go(t) {
  if (t.key === 'add') {
    uni.navigateTo({ url: '/pages/add/add' })
    return
  }
  if (t.key === props.current) return
  const url = t.key === 'home' ? '/pages/home/home' : '/pages/' + t.key + '/' + t.key
  uni.reLaunch({ url: url })
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: var(--cd-surface);
  border-top: 1px solid var(--cd-line);
  display: flex;
  align-items: flex-end;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 0;
  cursor: pointer;
  color: var(--cd-ink-2);
}
.t-ic {
  width: 22px;
  height: 22px;
  background: currentColor;
}
.t-label {
  font-size: 10px;
  font-weight: 600;
}
.tab.on {
  color: #e8a317;
}
/* 中间凸起的 + */
.plus {
  width: 48px;
  height: 48px;
  margin-top: -26px;
  border-radius: 50%;
  background: var(--cd-primary);
  box-shadow: var(--cd-sh-btn);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plus-i {
  color: var(--cd-btn-ink);
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  margin-top: -2px;
}
</style>
