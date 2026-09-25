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
        <button class="btn-del" @click="$emit('remove')">删除</button>
        <button class="btn-save" @click="onSave">保存</button>
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
.mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 8px 16px 24px;
}
.sheet-grip {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #e3e5e9;
  margin: 4px auto 12px;
}
.sheet-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.sheet-title-text {
  font-size: 15px;
  font-weight: 600;
  color: #222426;
}
.stype {
  font-size: 12px;
  color: #fff;
  background: #8a8f99;
  padding: 2px 10px;
  border-radius: 999px;
}
.sheet-input {
  border: 1px solid #ebedf0;
  border-radius: 10px;
  padding: 12px;
  font-size: 16px;
  margin-bottom: 10px;
}
.sheet-cats {
  white-space: nowrap;
  padding: 2px 0 10px;
}
.chip {
  display: inline-block;
  border: 1px solid #ebedf0;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  color: #222426;
  margin-right: 8px;
}
.chip.active {
  border-color: #0f6e56;
  color: #0f6e56;
  background: #e7f5f0;
}
.sheet-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.sheet-actions button {
  flex: 1;
  height: 44px;
  line-height: 44px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
}
.sheet-actions button::after {
  border: none;
}
.btn-del {
  background: #fdf0ef;
  color: #e24b4a;
}
.btn-save {
  flex: 2;
  background: #0f6e56;
  color: #fff;
}
</style>
