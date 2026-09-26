<template>
  <view class="keypad">
    <button
      v-for="k in keys"
      :key="k.label"
      class="key"
      :class="k.cls"
      hover-class="key-hover"
      @click="tap(k)"
    >
      <text v-if="k.key !== 'del'" class="key-text">{{ k.label }}</text>
      <view v-else class="key-del" :style="delIcon" />
    </button>
  </view>
</template>

<script setup>
/**
 * v2.0 数字键盘：4 列布局（参考包原样）：
 *   1 2 3 ⌫
 *   4 5 6 .
 *   7 8 9 0(占两格)
 *   0(续) 记好啦
 * 数字/小数点/删除走 @key，"记好啦"走 @confirm（由页面决定保存逻辑）。
 */
import { svgMaskStyle } from '../../utils/svg-icon.js'

const emit = defineEmits(['key', 'confirm'])

const keys = [
  { label: '1', key: '1' },
  { label: '2', key: '2' },
  { label: '3', key: '3' },
  { label: '⌫', key: 'del' },
  { label: '4', key: '4' },
  { label: '5', key: '5' },
  { label: '6', key: '6' },
  { label: '.', key: '.' },
  { label: '7', key: '7' },
  { label: '8', key: '8' },
  { label: '9', key: '9' },
  { label: '0', key: '0', cls: 'zero' },
  { label: '记好啦', key: 'confirm', cls: 'action' }
]

const delIcon = svgMaskStyle(
  'M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z'
)

function tap(k) {
  if (k.key === 'confirm') {
    emit('confirm')
    return
  }
  emit('key', k.key)
}
</script>

<style scoped>
/* 奶黄键盘区（= 参考包 .keypad） */
.keypad {
  margin-top: 16px;
  background: var(--cd-line);
  border-radius: var(--cd-r-card) var(--cd-r-card) 0 0;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.key {
  width: 100%; /* uni 的 button 默认不吃 grid 的 stretch，显式撑满格宽 */
  height: 52px;
  background: var(--cd-surface);
  border: none;
  border-radius: var(--cd-r-sm);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.key::after {
  border: none;
}
.key-text {
  font-size: 22px;
  font-weight: 700;
  color: var(--cd-ink);
}
.key-hover {
  background: var(--cd-primary-lt);
}
.key.zero {
  grid-column: span 2;
}
/* "记好啦"动作键：蛋黄底白字（= 参考包 .key.action） */
.key.action {
  background: var(--cd-primary);
  box-shadow: var(--cd-sh-btn);
}
.key.action .key-text {
  color: var(--cd-btn-ink);
  font-size: 16px;
  font-weight: 800;
}
.key-del {
  width: 24px;
  height: 24px;
  background: #8a7450;
}
</style>
