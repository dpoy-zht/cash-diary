<template>
  <view class="cat-picker">
    <!-- 一级：4 列宫格（视觉沿用参考包的 .cat，选中 = 蛋黄环 + 放大） -->
    <view class="cat-grid">
      <view
        v-for="n in list"
        :key="n.cat.id"
        class="cat"
        :class="{ on: n.cat.id === sel.topId }"
        hover-class="cat-hover"
        hover-stay-time="80"
        @click="pickTop(n.cat.id)"
      >
        <cat-icon :category="n.cat" :size="56" class="cat-cic" />
        <text class="cat-name">{{ n.cat.name }}</text>
      </view>
    </view>

    <!-- 二级：只在"当前一级确实有子类"时出现，一级本身作为一个「全部」选项 -->
    <scroll-view
      v-if="sel.children.length"
      scroll-x
      class="sub-bar"
      :show-scrollbar="false"
    >
      <view class="sub-line">
        <view
          class="sub-chip"
          :class="{ on: sel.isTopSelected }"
          hover-class="sub-hover"
          hover-stay-time="80"
          @click="pick(sel.topId)"
        >
          <text class="sub-name">全部{{ sel.top.name }}</text>
        </view>
        <view
          v-for="c in sel.children"
          :key="c.id"
          class="sub-chip"
          :class="{ on: c.id === sel.selected }"
          hover-class="sub-hover"
          hover-stay-time="80"
          @click="pick(c.id)"
        >
          <view class="sub-dot" :style="{ background: colorOf(c) }" />
          <text class="sub-name">{{ c.name }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { colorOf } from '../../utils/palette.js'
import { selectionOf, nextOnPickTop } from '../../utils/category-ui.js'

/**
 * 两级分类选择器（v7）。
 *
 * 布局取舍：一级用 4 列宫格（和原来一致，一眼扫得完），二级用**横向 chip 条**
 * 挂在宫格下面。为什么不做"左栏一级 + 右栏二级"那种双栏：
 * 记账页已经有大键盘占掉下半屏，双栏会把金额区挤没；
 * 宫格 + 横条是"一屏内完成选择"的最省地方案。
 *
 * 手感：点一级只切一级，**不会把已选好的二级顶掉**（规则在 utils/category-ui.js）。
 */
const props = defineProps({
  /** buildTree() 的产物：[{ cat, children }] */
  tree: { type: Array, default: function () { return [] } },
  /** 当前选中的分类 id（一级或二级） */
  modelValue: { type: [Number, String], default: null }
})
const emit = defineEmits(['update:modelValue'])

const list = computed(function () {
  return (Array.isArray(props.tree) ? props.tree : []).filter(function (n) { return n && n.cat })
})
const sel = computed(function () {
  return selectionOf(props.tree, props.modelValue)
})

function pickTop(topId) {
  const next = nextOnPickTop(sel.value, topId)
  if (next == null) return
  emit('update:modelValue', next)
}
function pick(id) {
  emit('update:modelValue', id)
}
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
  box-shadow: 0 0 0 3px var(--cd-primary-deep), 0 0 0 5.5px var(--cd-surface);
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

/* ---- 二级 chip 条 ---- */
.sub-bar {
  margin: 2px 0 0;
  white-space: nowrap;
}
.sub-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 20px 2px;
}
.sub-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-surface);
  box-shadow: var(--cd-sh-card);
  transition: transform var(--cd-dur) var(--cd-ease);
  /* ⚠️ 必须锁死宽度：chip 多到超出屏幕时（餐饮有 7 个子类），
     inline-flex 的子项默认可收缩 → 文字被压成两行「早/餐」。
     真机截图实测过，不是理论问题。 */
  flex: none;
  white-space: nowrap;
}
.sub-chip.on {
  background: var(--cd-primary);
  box-shadow: 0 0 0 2px var(--cd-primary-deep);
}
.sub-hover {
  transform: scale(0.96);
}
.sub-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.sub-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-ink);
}
</style>
