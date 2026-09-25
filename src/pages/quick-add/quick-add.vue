<template>
  <view class="page">
    <view class="type-switch">
      <view class="ts-item" :class="{ on: type === 'expense', exp: type === 'expense' }" @click="setType('expense')">支出</view>
      <view class="ts-item" :class="{ on: type === 'income', inc: type === 'income' }" @click="setType('income')">收入</view>
    </view>

    <view class="amount-box">
      <text class="cur">¥</text>
      <text class="amount-text">{{ display }}</text>
    </view>

    <category-grid :categories="currentCats" v-model="catId" />

    <view class="meta-row">
      <input v-model="note" class="note-input" type="text" placeholder="备注（可选）" maxlength="30" />
      <picker mode="date" :value="dateStr" @change="onDateChange">
        <view class="date-btn">{{ dateStr }}</view>
      </picker>
    </view>

    <money-keyboard @press="onKey" />

    <button class="btn-confirm" :disabled="!canConfirm" @click="onConfirm">完成</button>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCategoryStore } from '../../stores/category.js'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { keypadInput, parseAmountToCents, displayAmount } from '../../utils/money.js'
import { toDateStr, tsFromDateStr } from '../../utils/date.js'

const categoryStore = useCategoryStore()
const txStore = useTxStore()
const metaStore = useMetaStore()

const type = ref('expense')
const catId = ref(null)
const amountStr = ref('')
const note = ref('')
const dateStr = ref(toDateStr(Date.now()))

const currentCats = computed(function () {
  return type.value === 'expense' ? categoryStore.expenseCats : categoryStore.incomeCats
})
const display = computed(function () {
  return displayAmount(amountStr.value)
})
const canConfirm = computed(function () {
  return !!parseAmountToCents(amountStr.value) && !!catId.value
})

function setType(t) {
  type.value = t
  const cat = categoryStore.list.find(function (c) { return c.id === catId.value })
  if (!cat || cat.type !== t) catId.value = null
}

function onKey(k) {
  amountStr.value = keypadInput(amountStr.value, k)
}

function onDateChange(e) {
  dateStr.value = e.detail.value
}

async function onConfirm() {
  if (!canConfirm.value) return
  try {
    await txStore.add(metaStore.ym, {
      amountStr: amountStr.value,
      categoryId: catId.value,
      type: type.value,
      note: note.value,
      ts: tsFromDateStr(dateStr.value)
    })
    uni.showToast({ title: '已记一笔', icon: 'none' })
    amountStr.value = ''
    note.value = ''
    // 保留收支类型与分类，便于连续记账（PRD §5.1）
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '记账失败', icon: 'none' })
  }
}
</script>

<style scoped>
.page {
  padding-bottom: 16px;
}
.type-switch {
  display: flex;
  background: #eceef1;
  border-radius: 10px;
  margin: 12px 16px;
  padding: 3px;
}
.ts-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  border-radius: 8px;
  color: #8a8f99;
}
.ts-item.on {
  background: #fff;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.ts-item.on.exp {
  color: #e24b4a;
}
.ts-item.on.inc {
  color: #12924f;
}
.amount-box {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  padding: 6px 20px 10px;
  gap: 6px;
}
.cur {
  font-size: 18px;
  color: #8a8f99;
}
.amount-text {
  font-size: 40px;
  font-weight: 600;
}
.meta-row {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
}
.note-input {
  flex: 1;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #fff;
}
.date-btn {
  border: 1px solid #ebedf0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  color: #222426;
  background: #fff;
}
.btn-confirm {
  margin: 10px 16px 0;
  height: 48px;
  line-height: 48px;
  border-radius: 12px;
  background: #0f6e56;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
.btn-confirm::after {
  border: none;
}
.btn-confirm[disabled] {
  background: #c4e0d7;
  color: #fff;
}
</style>
