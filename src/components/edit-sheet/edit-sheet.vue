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
        >
          <view class="chip-dot" :style="{ background: colorOf(c) }" />
          <text class="chip-name">{{ c.name }}</text>
        </view>
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
import { colorOf } from '../../utils/palette.js'

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
  background: rgba(93, 78, 55, 0.45);
  animation: cd-fade-in 200ms ease both;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cd-surface);
  border-radius: 28px 28px 0 0;
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
  font-weight: 800;
  color: var(--cd-ink);
}
.stype {
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-ink);
  background: var(--cd-primary-lt);
  padding: 3px 10px;
  border-radius: var(--cd-r-pill);
}
.sheet-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cd-line);
  border-radius: var(--cd-r-sm);
  background: var(--cd-bg);
  padding: 12px 14px;
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 700;
  color: var(--cd-ink);
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
}
.sheet-cats {
  white-space: nowrap;
  padding: 2px 0 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-bg);
  padding: 8px 14px;
  margin-right: 8px;
  transition: transform var(--cd-dur) var(--cd-ease);
}
.chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.chip-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-ink);
}
/* 选中的 chip：蛋黄实底深棕字（= 参考包选中语言） */
.chip.active {
  background: var(--cd-primary);
}
.chip.active .chip-name {
  font-weight: 800;
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.sheet-actions button {
  flex: 1;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-pill);
  font-family: var(--cd-font);
  font-size: 16px;
  font-weight: 800;
}
.sheet-actions button::after {
  border: none;
}
.btn-del {
  background: var(--cd-surface);
  color: var(--cd-danger-ink);
  border: 1.5px solid var(--cd-primary);
}
.btn-save {
  flex: 2;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  box-shadow: var(--cd-sh-btn);
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.97) translateY(1px);
}
</style>
