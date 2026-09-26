<template>
  <view class="page">
    <!-- 奶黄渐变头部 -->
    <view class="add-head">
      <view class="navbar">
        <view class="icon-btn" @click="goBack"><view class="ib" :style="iconBack" /></view>
        <text class="nav-title">记一笔</text>
        <view class="icon-btn" @click="save"><view class="ib" :style="iconCheck" /></view>
      </view>
      <view class="type-switch">
        <view
          v-for="t in types"
          :key="t.key"
          class="type-item"
          :class="{ on: type === t.key }"
          @click="switchType(t.key)"
        >{{ t.name }}</view>
      </view>
      <view class="big-amount">
        <text class="yen">¥</text>
        <text>{{ amountText }}</text>
      </view>
      <view class="amount-hint">输入金额</view>
    </view>

    <!-- 备注 + 日期 -->
    <view class="meta-row">
      <input
        v-model="note"
        class="note-input"
        placeholder="加点备注…"
        placeholder-class="ph"
      />
      <picker mode="date" :value="dateStr" @change="onDateChange">
        <view class="date-btn">{{ dateStr.slice(5) }}</view>
      </picker>
    </view>

    <!-- 分类宫格 -->
    <category-grid v-model="categoryId" :categories="cats" />

    <!-- 数字键盘 -->
    <money-keyboard @key="onKey" @confirm="save" />

    <!-- 记好啦成功弹窗 -->
    <view v-if="successShow" class="mask">
      <view class="modal">
        <image class="modal-img" src="/static/milo/milo-happy.webp" mode="aspectFit" />
        <text class="modal-title">记好啦！</text>
        <text class="modal-sub">{{ lastSavedText }}</text>
        <text class="modal-tip">这笔账已经帮你存好啦~</text>
        <view class="btn-y" @click="successOK">开心回家</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useMetaStore } from '../../stores/meta.js'
import { keypadInput, parseAmountToCents, displayAmount, formatCents } from '../../utils/money.js'
import { toDateStr, tsFromDateStr } from '../../utils/date.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 记一笔（v2.0）：奶黄渐变头 + 支出/收入 + 大金额 + 备注/日期 + 分类宫格 + 奶黄键盘。
 * 参考包的"转账"页没有数据模型支撑，这里只保留 支出/收入 两个真实页签。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const metaStore = useMetaStore()

const types = [
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]

const type = ref('expense')
const current = ref('')
const categoryId = ref(null)
const note = ref('')
const dateStr = ref(toDateStr(Date.now()))
const successShow = ref(false)
const lastSaved = ref(null)

const cats = computed(function () {
  return type.value === 'expense' ? categoryStore.expenseCats : categoryStore.incomeCats
})
const amountText = computed(function () {
  return displayAmount(current.value)
})
const lastSavedText = computed(function () {
  const s = lastSaved.value
  if (!s) return ''
  const sign = s.type === 'expense' ? '-' : '+'
  return sign + '¥' + formatCents(s.cents) + ' ' + s.name
})

function switchType(t) {
  type.value = t
  const list = cats.value
  if (!list.some(function (c) { return c.id === categoryId.value })) {
    categoryId.value = list.length ? list[0].id : null
  }
}
function onKey(k) {
  current.value = keypadInput(current.value, k)
}
function onDateChange(e) {
  dateStr.value = e.detail.value
}

async function save() {
  const cents = parseAmountToCents(current.value)
  if (!cents) {
    uni.showToast({ title: '先输个金额嘛~', icon: 'none' })
    return
  }
  if (!categoryId.value) {
    uni.showToast({ title: '选一个分类嘛~', icon: 'none' })
    return
  }
  await txStore.add(metaStore.ym, {
    type: type.value,
    amount_cents: cents,
    category_id: categoryId.value,
    note: note.value.trim(),
    occurred_at: tsFromDateStr(dateStr.value)
  })
  const cat = cats.value.find(function (c) { return c.id === categoryId.value })
  lastSaved.value = { cents: cents, type: type.value, name: cat ? cat.name : '' }
  current.value = ''
  note.value = ''
  successShow.value = true
}

function successOK() {
  successShow.value = false
  uni.navigateBack()
}
function goBack() {
  uni.navigateBack()
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')
const iconCheck = svgMaskStyle('M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z')

// 初始化默认选中第一个支出分类
if (cats.value.length) categoryId.value = cats.value[0].id
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ---- 渐变头部 ----
   状态栏留白放进 head 内部，让渐变一直铺到屏幕最顶端（H5 端变量为 0） */
.add-head {
  background: var(--cd-grad-head);
  padding: calc(10px + var(--status-bar-height, 0px)) 16px 24px;
  border-radius: 0 0 28px 28px;
}
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--cd-ink);
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ib {
  width: 20px;
  height: 20px;
  background: #8a7450;
}
.type-switch {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 10px 0 14px;
}
.type-item {
  font-size: 15px;
  font-weight: 600;
  color: rgba(93, 78, 55, 0.5);
  padding: 4px 8px;
  border-bottom: 3px solid transparent;
}
.type-item.on {
  color: var(--cd-ink);
  border-bottom-color: var(--cd-ink);
}
.big-amount {
  font-size: 40px;
  font-weight: 800;
  color: var(--cd-ink);
  letter-spacing: -1px;
  text-align: center;
}
.yen {
  font-size: 24px;
  margin-right: 4px;
}
.amount-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(93, 78, 55, 0.5);
  margin-top: 2px;
}

/* ---- 备注 + 日期 ---- */
.meta-row {
  display: flex;
  gap: 8px;
  margin: 14px 16px 6px;
}
.note-input {
  flex: 1;
  min-width: 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-sm);
  padding: 12px 16px;
  font-size: 13px;
  color: var(--cd-ink);
  box-shadow: var(--cd-sh-card);
}
.ph {
  color: var(--cd-ink-2);
}
.date-btn {
  background: var(--cd-surface);
  border-radius: var(--cd-r-sm);
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
  box-shadow: var(--cd-sh-card);
  white-space: nowrap;
}

/* ---- 成功弹窗 ---- */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(93, 78, 55, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
  animation: cd-fade-in 0.2s;
}
.modal {
  background: var(--cd-surface);
  border-radius: 28px;
  width: 100%;
  max-width: 320px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: cd-pop 0.3s var(--cd-ease) both;
}
.modal-img {
  width: 140px;
  height: 140px;
  border-radius: 16px;
  margin-bottom: 12px;
}
.modal-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 6px;
}
.modal-sub {
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-income);
  margin-bottom: 4px;
}
.modal-tip {
  font-size: 12px;
  color: var(--cd-ink-2);
  margin-bottom: 18px;
}
.btn-y {
  width: 100%;
  background: var(--cd-primary);
  color: var(--cd-btn-ink);
  border-radius: var(--cd-r-pill);
  padding: 14px 0;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  box-shadow: var(--cd-sh-btn);
}
</style>
