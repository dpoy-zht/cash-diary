<template>
  <view class="keypad">
    <button
      v-for="k in keys"
      :key="k"
      class="key"
      :class="{ 'key--del': k === 'del' }"
      hover-class="key-hover"
      @click="onPress(k)"
    >{{ k === 'del' ? '⌫' : k }}</button>
  </view>
</template>

<script setup>
const emit = defineEmits(['press'])
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

function onPress(k) {
  emit('press', k)
}
</script>

<style scoped>
.keypad {
  display: flex;
  flex-wrap: wrap;
  padding: 0 16px;
  gap: 10px;
}
/* 键高 50px：满足 44px 最小点按面积（WCAG 2.5.5） */
.key {
  width: calc((100% - 20px) / 3);
  height: 50px;
  line-height: 50px;
  padding: 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-sm);
  font-family: var(--cd-font);
  font-size: 21px;
  font-weight: 700;
  color: var(--cd-ink);
  box-shadow: var(--cd-sh-1);
  transition: transform var(--cd-dur) var(--cd-ease),
    background-color var(--cd-dur) var(--cd-ease);
}
.key::after {
  border: none;
}
/* 退格键做弱化处理，避免与数字键抢注意力 */
.key--del {
  background: var(--cd-cream);
  color: var(--cd-ink-2);
  font-size: 19px;
  box-shadow: none;
}
/* 按下反馈：轻微回弹（放在最后，确保覆盖上面两条同权重规则） */
.key-hover {
  background: var(--cd-primary-lt);
  transform: scale(0.94);
}
</style>
