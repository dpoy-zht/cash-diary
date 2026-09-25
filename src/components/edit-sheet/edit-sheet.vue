<template>
  <view v-if="record" class="sheet-wrap">
    <view class="mask" @click="$emit('close')"></view>
    <view class="sheet">
      <view class="sheet-grip"></view>
      <view class="sheet-title">
        <text class="sheet-title-text">编辑记录</text>
        <text class="stype">{{ record.type === 'expense' ? '支出' : '收入' }}</text>
      </view>

      <input v-model="amountStr" class="sheet-input" type="digit" placeholder="金额" />

      <scroll-view scroll-x class="sheet-cats">
        <view
          v-for="c in categories"
          :key="c.id"
          class="chip"
          :class="{ active: c.id === catId }"
          @click="catId = c.id"
        >{{ c.icon }} {{ c.name }}</view>
      </scroll-view>

      <input v-model="note" class="sheet-input" type="text" placeholder="备注（可选）" maxlength="30" />

      <view class="sheet-actions">
        <button class="btn-del" hover-class="btn-hover" @click="$emit('remove')">删除</button>
        <button class="btn-save" hover-class="btn-hover" @click="onSave">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  record: { type: Object, default: null },
  categories: { type: Array, default: function () { return [] } }
})
const emit = defineEmits(['close', 'save', 'remove'])

const amountStr = ref('')
const catId = ref(null)
const note = ref('')

watch(
  function () { return props.record },
  function (r) {
    if (!r) return
    amountStr.value = (r.amount_cents / 100).toFixed(2)
    catId.value = r.category_id
    note.value = r.note || ''
  },
  { immediate: true }
)

function onSave() {
  emit('save', {
    amountStr: amountStr.value,
    categoryId: catId.value,
    note: note.value,
    type: props.record.type
  })
}
</script>

<style scoped>
.sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 99;
}
/* 暖色调遮罩，替代纯黑半透明，避免画面发灰 */
.mask {
  position: absolute;
  inset: 0;
  background: rgba(61, 42, 23, 0.42);
  animation: cd-fade-in 200ms ease both;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-lg) var(--cd-r-lg) 0 0;
  padding: 8px 16px 24px;
  /* 留出全面屏底部安全区；不支持 env() 时上一行兜底 */
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  animation: cd-sheet-up 240ms var(--cd-ease) both;
}
.sheet-grip {
  width: 44px;
  height: 5px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-line);
  margin: 4px auto 14px;
}
.sheet-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-title-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
}
.stype {
  font-size: 12px;
  color: var(--cd-ink-2);
  background: var(--cd-cream);
  padding: 3px 10px;
  border-radius: var(--cd-r-pill);
}
.sheet-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-md);
  background: var(--cd-cream-2);
  padding: 12px 14px;
  font-family: var(--cd-font);
  font-size: 16px;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}
.sheet-cats {
  white-space: nowrap;
  padding: 2px 0 10px;
}
.chip {
  display: inline-block;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-pill);
  background: var(--cd-surface);
  padding: 8px 14px;
  font-size: 13px;
  color: var(--cd-ink);
  margin-right: 8px;
  transition: background-color var(--cd-dur) var(--cd-ease),
    border-color var(--cd-dur) var(--cd-ease);
}
/* 选中的 chip 用品牌黄实底：与主按钮同一套"黄底深棕字"语言 */
.chip.active {
  border-color: var(--cd-primary-dk);
  background: var(--cd-primary);
  color: var(--cd-ink);
  font-weight: 600;
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.sheet-actions button {
  flex: 1;
  height: 46px;
  line-height: 46px;
  border-radius: var(--cd-r-md);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 700;
}
.sheet-actions button::after {
  border: none;
}
.btn-del {
  background: var(--cd-danger-lt);
  color: var(--cd-danger-ink);
}
.btn-save {
  flex: 2;
  background: var(--cd-grad-brand);
  color: var(--cd-ink);
  box-shadow: 0 3px 10px rgba(240, 165, 0, 0.28);
}
.btn-hover {
  opacity: 0.88;
  transform: scale(0.98);
}
</style>
