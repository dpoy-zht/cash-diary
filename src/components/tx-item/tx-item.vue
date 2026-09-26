<template>
  <view class="tx-item" hover-class="tx-hover" @click="$emit('click')">
    <cat-icon :category="category" :size="40" />
    <text class="tx-name">{{ label }}</text>
    <text class="tx-amount" :class="record.type">{{ formatted }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatCents } from '../../utils/money.js'

/**
 * 流水条目（v2.0）：彩色圆图标 + "分类 · 备注" + 金额。
 * 支出金额用主文字色、收入用绿（参考包语义，取代旧的红支绿收）。
 */
const props = defineProps({
  record: { type: Object, required: true },
  category: { type: Object, required: true }
})
defineEmits(['click'])

const label = computed(function () {
  const note = (props.record.note || '').trim()
  return note ? props.category.name + ' · ' + note : props.category.name
})
const formatted = computed(function () {
  const sign = props.record.type === 'expense' ? '-' : '+'
  return sign + '¥' + formatCents(props.record.amount_cents)
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
.tx-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
