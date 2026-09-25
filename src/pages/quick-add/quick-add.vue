<template>
  <view class="page">
    <nav-bar title="记一笔" />

    <view class="type-switch">
      <view class="ts-item" :class="{ on: type === 'expense' }" @click="setType('expense')">支出</view>
      <view class="ts-item" :class="{ on: type === 'income' }" @click="setType('income')">收入</view>
    </view>

    <view class="amount-card">
      <mascot :size="46" />
      <view class="amount-box">
        <text class="cur">¥</text>
        <text class="amount-text" :class="type">{{ display }}</text>
      </view>
    </view>

    <category-grid :categories="currentCats" v-model="catId" />

    <view class="meta-row">
      <input v-model="note" class="note-input" type="text" placeholder="备注（可选）" maxlength="30" />
      <picker mode="date" :value="dateStr" @change="onDateChange">
        <view class="date-btn">{{ dateStr }}</view>
      </picker>
    </view>

    <money-keyboard @press="onKey" />

    <button class="btn-confirm" hover-class="btn-hover" :disabled="!canConfirm" @click="onConfirm">完成</button>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCategoryStore } from '../../stores/category.js'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { keypadInput, parseAmountToCents, displayAmount } from '../../utils/money.js'
import { toDateStr, tsFromDateStr } from '../../utils/date.js'
import { useNavScrollWatch } from '../../utils/nav-scroll.js'

const categoryStore = useCategoryStore()
const txStore = useTxStore()
const metaStore = useMetaStore()

// 滚动时采集帧率，供吸顶导航决定是否退回纯色档
useNavScrollWatch()

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

/* ---- 收支分段控件：外层浅奶黄胶囊，内层选中项用品牌黄实底 ---- */
.type-switch {
  display: flex;
  background: var(--cd-cream);
  border-radius: var(--cd-r-md);
  margin: 12px 16px;
  padding: 4px;
}
.ts-item {
  flex: 1;
  text-align: center;
  padding: 9px 0;
  font-size: 14px;
  border-radius: var(--cd-r-sm);
  color: var(--cd-ink-2);
  transition: background-color var(--cd-dur) var(--cd-ease),
    color var(--cd-dur) var(--cd-ease);
}
.ts-item.on {
  background: var(--cd-grad-brand);
  color: var(--cd-ink);
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(240, 165, 0, 0.25);
}

/* ---- 金额卡：左侧吉祥物 + 右侧大金额 ---- */
.amount-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px 10px;
  padding: 14px 16px;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  box-shadow: var(--cd-sh-1);
}
.amount-box {
  flex: 1;
  min-width: 0; /* 允许收缩，极端长金额时裁切而不是撑破布局 */
  overflow: hidden;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
}
.cur {
  font-size: 18px;
  color: var(--cd-ink-2);
  font-weight: 600;
}
/* 30px 粗体：既是大字号对比度达标档，也是本页的视觉焦点 */
.amount-text {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--cd-ink);
}
.amount-text.expense {
  color: var(--cd-expense);
}
.amount-text.income {
  color: var(--cd-income);
}

/* ---- 备注 + 日期 ---- */
.meta-row {
  display: flex;
  gap: 8px;
  margin: 0 16px 12px;
}
.note-input {
  flex: 1;
  min-width: 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-md);
  padding: 12px 14px;
  font-family: var(--cd-font);
  font-size: 14px;
  color: var(--cd-ink);
  box-shadow: var(--cd-sh-1);
}
.date-btn {
  background: var(--cd-cream);
  border-radius: var(--cd-r-md);
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
  white-space: nowrap;
}

/* ---- 主按钮 ---- */
.btn-confirm {
  margin: 14px 16px 0;
  height: 50px;
  line-height: 50px;
  border-radius: var(--cd-r-md);
  background: var(--cd-grad-brand);
  color: var(--cd-ink);
  font-family: var(--cd-font);
  font-size: 17px;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(240, 165, 0, 0.3);
  transition: transform var(--cd-dur) var(--cd-ease), opacity var(--cd-dur) var(--cd-ease);
}
.btn-confirm::after {
  border: none;
}
.btn-confirm[disabled] {
  background: var(--cd-cream);
  color: var(--cd-ink-3);
  box-shadow: none;
}
.btn-hover {
  opacity: 0.9;
  transform: scale(0.985);
}
</style>
