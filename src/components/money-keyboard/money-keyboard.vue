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
/* 键高 52px：满足 44px 最小点按面积（WCAG 2.5.5） */
.key {
  width: calc((100% - 20px) / 3);
  height: 52px;
  line-height: 52px;
  padding: 0;
  /* 玻璃键：半透明渐变 + 白描边 + 多层阴影（= 参考项目 --bg-card 观感） */
  background: var(--cd-card);
  border: 1px solid var(--cd-card-line);
  border-radius: var(--cd-r-sm);
  font-family: var(--cd-font);
  font-size: 22px;
  font-weight: 800;
  color: var(--cd-ink);
  box-shadow: var(--cd-sh-contact), var(--cd-sh-mid);
  transition: transform var(--cd-dur) var(--cd-ease),
    background-color var(--cd-dur) var(--cd-ease-smooth),
    box-shadow var(--cd-dur) var(--cd-ease-smooth);
}
.key::after {
  border: none;
}
/* 退格键做弱化处理，避免与数字键抢注意力 */
.key--del {
  background: var(--cd-glass);
  color: var(--cd-ink-2);
  font-size: 19px;
  box-shadow: var(--cd-sh-contact);
}
/* 按下反馈：弹性回缩 + 底色转品牌渐变（= 参考项目 .btn-cream:active 语言）
   放在最后，确保覆盖上面两条同权重规则 */
.key-hover {
  background: var(--cd-grad-brand);
  transform: scale(0.93);
  box-shadow: var(--cd-btn-shadow-press);
}
</style>
