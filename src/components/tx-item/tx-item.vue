<template>
  <view
    class="tx-item"
    :class="{ 'rise-in': riseDelay >= 0 }"
    :style="riseDelay >= 0 ? { animationDelay: riseDelay + 'ms' } : null"
    hover-class="tx-hover"
    @click="$emit('click')"
  >
    <cat-icon :category="category" :size="40" />
    <view class="tx-main">
      <text class="tx-name">{{ label }}</text>
      <view v-if="showTags.length" class="tx-tags">
        <view v-for="t in showTags" :key="t.id" class="tx-tag">
          <view class="tx-tag-dot" :style="{ background: tagColorOf(t) }"></view>
          <text class="tx-tag-name">{{ t.name }}</text>
        </view>
        <text v-if="moreCount" class="tx-tag-more">+{{ moreCount }}</text>
      </view>
    </view>
    <text class="tx-amount" :class="record.type">{{ formatted }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatCents } from '../../utils/money.js'
import { tagColorOf } from '../../utils/palette.js'

/**
 * 流水条目（v2.0）：彩色圆图标 + "分类 · 备注" + 金额，下面一行是小号标签。
 * 支出金额用主文字色、收入用绿（参考包语义，取代旧的红支绿收）。
 *
 * 标签**最多显示 2 个**，其余折叠成 `+N`：一行流水的高度是固定的，
 * 标签多起来会把金额挤走；要全看就点开编辑弹层。
 */
const props = defineProps({
  record: { type: Object, required: true },
  category: { type: Object, required: true },
  /** 这笔流水的标签（对象数组，由父级批量查好传进来，组件不自己查库） */
  tags: { type: Array, default: function () { return [] } },
  /**
   * 列表下标（进场动画用，可不传 → 不做动画）。
   * 为什么由组件自己限流：父级页面有 11 个，若让它们各自算延迟，
   * 既重复又容易漏；放在组件里，一处规则保证全站一致。
   */
  index: { type: Number, default: -1 }
})
defineEmits(['click'])

const MAX_TAG_CHIPS = 2

/** 逐项进场的时间阶梯：每项延后 24ms，最多只对前 8 项生效。 */
const RISE_STEP_MS = 24
const RISE_MAX_ITEMS = 8

/**
 * 进场动画延迟（ms）；-1 表示不做动画。
 *
 * 为什么要限流到前 8 项：流水可能几十上百条，若每一项都参与级联，
 * 最后一项要等好几秒才出现，用户以为卡死了；而且逐条跑动画在低端机上
 * 也会明显掉帧。滚动加载出的条目 index 更大 → 拿不到延迟 → 天然不重播。
 */
const riseDelay = computed(function () {
  const i = props.index
  if (typeof i !== 'number' || i < 0) return -1
  return i < RISE_MAX_ITEMS ? i * RISE_STEP_MS : -1
})

const label = computed(function () {
  const note = (props.record.note || '').trim()
  return note ? props.category.name + ' · ' + note : props.category.name
})
const formatted = computed(function () {
  const sign = props.record.type === 'expense' ? '-' : '+'
  return sign + '¥' + formatCents(props.record.amount_cents)
})
const showTags = computed(function () {
  return props.tags.slice(0, MAX_TAG_CHIPS)
})
const moreCount = computed(function () {
  return Math.max(0, props.tags.length - MAX_TAG_CHIPS)
})
</script>

<style scoped>
.tx-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--cd-line);
}
.tx-item:last-child {
  border-bottom: none;
}
.tx-hover {
  background: rgba(255, 233, 168, 0.35);
}
.tx-main {
  flex: 1;
  min-width: 0;
}
.tx-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tx-tags {
  display: flex;
  align-items: center;
  margin-top: 3px;
  overflow: hidden;
}
.tx-tag {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
}
.tx-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  flex-shrink: 0;
}
.tx-tag-name {
  font-size: 11px;
  color: var(--cd-ink-2);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tx-tag-more {
  font-size: 11px;
  color: var(--cd-ink-3);
}
.tx-amount {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
}
.tx-amount.income {
  color: var(--cd-income);
}
</style>
