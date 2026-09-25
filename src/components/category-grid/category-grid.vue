<template>
  <view class="cat-grid cd-card">
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
/* 容器只负责布局：玻璃材质走全局 .cd-card（模板里已挂类名），
   避免在一处重复玻璃配方 —— 这是"组件样式一致"的做法 */
.cat-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 4px 16px 12px;
  padding: 12px 6px 6px;
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
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  transition: transform var(--cd-dur) var(--cd-ease),
    box-shadow var(--cd-dur) var(--cd-ease-smooth);
}
.cat-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink-2);
  transition: color var(--cd-dur) var(--cd-ease-smooth);
}
/* 选中 = 加深档品牌渐变 + 白色厚描边 + 弹性放大 + 暖色光晕。
   用"尺寸 + 描边 + 填充对比 + 字重"多重线索区分，而不只靠色相 ——
   马卡龙色板里有个分类的底色本身就是鹅黄，单靠色相会分不出选没选中 */
.cat-item.active .cat-icon {
  background: var(--cd-grad-brand-deep);
  border-color: var(--cd-white);
  box-shadow: var(--cd-btn-shadow), 0 0 0 2px rgba(255, 255, 255, 0.95);
  transform: scale(1.1);
}
.cat-item.active .cat-name {
  color: var(--cd-ink);
  font-weight: 800;
}
.cat-hover .cat-icon {
  transform: scale(0.9);
}
</style>
