<template>
  <view class="tags-wrap">
    <scroll-view scroll-x class="tags-scroll" :show-scrollbar="false">
      <view class="tags-row">
        <view
          v-for="t in tags"
          :key="t.id"
          class="tag-chip"
          :class="{ on: picked.indexOf(t.id) >= 0 }"
          @click="toggle(t.id)"
        >
          <view class="tag-dot" :style="{ background: tagColorOf(t) }"></view>
          <text class="tag-name">{{ t.name }}</text>
        </view>
        <view class="tag-chip tag-new" @click="$emit('create')">
          <text class="tag-new-text">＋ 标签</text>
        </view>
      </view>
    </scroll-view>
    <text v-if="!tags.length" class="tags-hint">还没有标签，点「＋ 标签」建一个</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { tagColorOf } from '../../utils/palette.js'
import { MAX_TAGS_PER_TX } from '../../utils/tag.js'

/**
 * 标签多选 chips（T5.1）。
 *
 * 记一笔页与流水编辑弹层共用这一个组件 —— 两处的选择行为必须一致，
 * 各写一遍迟早漂移（一边允许超上限、一边不允许，用户会以为遇到了 bug）。
 *
 * 组件只管"选中了哪些 id"，**不负责建标签与落库**：
 * 建标签通过 `create` 事件抛给页面（页面才知道弹什么输入框），
 * 落库由调用方在保存时统一处理。
 */
const props = defineProps({
  /** 当前账本的全部标签 */
  tags: { type: Array, default: function () { return [] } },
  /** 已选中的标签 id（v-model） */
  modelValue: { type: Array, default: function () { return [] } },
  /** 一笔最多几个（默认取项目常量） */
  max: { type: Number, default: MAX_TAGS_PER_TX }
})
const emit = defineEmits(['update:modelValue', 'create'])

const picked = computed(function () {
  return Array.isArray(props.modelValue) ? props.modelValue : []
})

function toggle(id) {
  const list = picked.value.slice()
  const i = list.indexOf(id)
  if (i >= 0) {
    list.splice(i, 1)
    emit('update:modelValue', list)
    return
  }
  if (list.length >= props.max) {
    uni.showToast({ title: '一笔最多打 ' + props.max + ' 个标签', icon: 'none' })
    return
  }
  list.push(id)
  emit('update:modelValue', list)
}
</script>

<style scoped>
.tags-wrap {
  padding: 0 16px;
}
.tags-scroll {
  width: 100%;
  white-space: nowrap;
}
.tags-row {
  display: inline-flex;
  align-items: center;
  padding: 2px 0;
}
/* 与筛选面板的 chip 保持同一套令牌与节奏，避免两处标签长得不一样 */
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-bg);
  padding: 7px 13px;
  margin-right: 8px;
  border: 1px solid var(--cd-line);
}
.tag-chip.on {
  background: var(--cd-primary);
  border-color: var(--cd-primary-deep);
}
.tag-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
.tag-new {
  border-style: dashed;
}
.tag-new-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink-2);
}
.tags-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--cd-ink-3);
}
</style>
