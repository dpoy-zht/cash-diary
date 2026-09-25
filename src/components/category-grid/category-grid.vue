<template>
  <view class="cat-grid">
    <view
      v-for="c in categories"
      :key="c.id"
      class="cat-item"
      :class="{ active: c.id === modelValue }"
      hover-class="cat-hover"
      @click="$emit('update:modelValue', c.id)"
    >
      <view class="cat-icon" :style="iconStyle(c)">
        {{ c.icon }}
      </view>
      <text class="cat-name">{{ c.name }}</text>
    </view>
  </view>
</template>

<script setup>
import { tintOf } from '../../utils/palette.js'

const props = defineProps({
  categories: { type: Array, default: function () { return [] } },
  modelValue: { type: [Number, String], default: null }
})
defineEmits(['update:modelValue'])

/**
 * 未选中：按分类 id 取柔和底色（与明细列表同色，保证同一分类到处一致）。
 * 选中：不设内联底色，交给 CSS 用主黄渐变整体覆盖。
 */
function iconStyle(c) {
  return c.id === props.modelValue ? {} : { backgroundColor: tintOf(c.id) }
}
</script>

<style scoped>
.cat-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 4px 16px 10px;
  padding: 10px 6px 4px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  box-shadow: var(--cd-sh-1);
}
.cat-item {
  width: 25%;
  padding: 6px 0 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
/* 图标底统一为圆形：宫格与明细列表保持同一形状语言 */
.cat-icon {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  transition: transform var(--cd-dur) var(--cd-ease),
    box-shadow var(--cd-dur) var(--cd-ease);
}
.cat-name {
  font-size: 12px;
  color: var(--cd-ink-2);
  transition: color var(--cd-dur) var(--cd-ease);
}
/* 选中：主黄渐变 + 一圈金色描边环 + 轻微放大（用 shadow 画环，不改变盒子尺寸） */
.cat-item.active .cat-icon {
  background: var(--cd-grad-brand);
  box-shadow: 0 0 0 2px var(--cd-primary-dk), 0 3px 10px rgba(240, 165, 0, 0.3);
  transform: scale(1.06);
}
.cat-item.active .cat-name {
  color: var(--cd-ink);
  font-weight: 600;
}
.cat-hover .cat-icon {
  transform: scale(0.92);
}
</style>
