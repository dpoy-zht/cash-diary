<template>
  <view class="ci" :style="{ background: color, width: size + 'px', height: size + 'px' }">
    <view v-if="mask" class="ci-glyph" :style="mask" />
    <text v-else class="ci-emoji">{{ emoji }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { colorOf, iconMaskStyle } from '../../utils/palette.js'

/**
 * 分类图标：v2.0 风格 = 彩色正圆底 + 白色面性图标（CSS mask 渲染）。
 * 老数据里没有 SVG 映射的分类名，自动退回 emoji（category.icon 字段）。
 * 尺寸由 size  prop 控制（正圆），父级也可直接覆盖。
 */
const props = defineProps({
  category: { type: Object, default: () => ({}) },
  size: { type: Number, default: 40 }
})

const color = computed(function () {
  return colorOf(props.category)
})
const mask = computed(function () {
  return iconMaskStyle(props.category)
})
const emoji = computed(function () {
  return (props.category && props.category.icon) || '•'
})
</script>

<style scoped>
.ci {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
/* 白色 glyph：mask 裁出图标形状，元素本身纯白 */
.ci-glyph {
  width: 56%;
  height: 56%;
  background: #ffffff;
}
.ci-emoji {
  font-size: 55%;
  line-height: 1;
}
</style>
