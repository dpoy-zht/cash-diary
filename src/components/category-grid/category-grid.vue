<template>
  <view class="cat-grid">
    <view
      v-for="c in categories"
      :key="c.id"
      class="cat"
      :class="{ on: c.id === modelValue }"
      hover-class="cat-hover"
      @click="$emit('update:modelValue', c.id)"
    >
      <cat-icon :category="c" :size="56" class="cat-cic" />
      <text class="cat-name">{{ c.name }}</text>
    </view>
  </view>
</template>

<script setup>
/**
 * v2.0 分类宫格：4 列，彩色圆底白图标（cat-icon），直接铺在奶油底上（无卡片容器）。
 * 选中 = 蛋黄描边环 + 放大 1.08（= 参考包 .cat.on，用 box-shadow 画环保证跨端一致）。
 */
defineProps({
  categories: { type: Array, default: function () { return [] } },
  modelValue: { type: [Number, String], default: null }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.cat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 8px 20px;
}
.cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.cat-cic {
  transition: transform var(--cd-dur) var(--cd-ease);
}
.cat.on .cat-cic {
  box-shadow: 0 0 0 3px var(--cd-primary-deep), 0 0 0 5.5px #ffffff;
  transform: scale(1.08);
}
.cat-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink);
}
.cat-hover .cat-cic {
  transform: scale(0.94);
}
.cat.on.cat-hover .cat-cic {
  transform: scale(1.04);
}
</style>
