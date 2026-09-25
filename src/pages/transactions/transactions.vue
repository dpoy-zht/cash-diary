<template>
  <view class="page">
    <view class="month-bar">
      <view class="mb-btn" @click="metaStore.shift(-1)">‹</view>
      <text class="mb-label">{{ monthLabel }}</text>
      <view class="mb-btn" @click="metaStore.shift(1)">›</view>
    </view>

    <view class="month-summary">
      <text class="ms-item">支出 <text class="sum expense">{{ formatCents(summary.expenseCents) }}</text></text>
      <text class="ms-item">收入 <text class="sum income">{{ formatCents(summary.incomeCents) }}</text></text>
    </view>

    <scroll-view scroll-y class="list-scroll">
      <view v-if="!groups.length" class="empty">这个月还没有记录，去「记一笔」补上吧</view>
      <block v-for="g in groups" :key="g.day">
        <view class="day-head">{{ dayLabel(g.day) }}</view>
        <tx-item
          v-for="r in g.items"
          :key="r.id"
          :record="r"
          :category="catOf(r.category_id)"
          @click="openEdit(r)"
        />
      </block>
    </scroll-view>

    <edit-sheet
      :record="editing"
      :categories="editingCats"
      @close="editing = null"
      @save="onSave"
      @remove="onRemove"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useMetaStore } from '../../stores/meta.js'
import { useCategoryStore } from '../../stores/category.js'
import { groupByDay, dayLabel } from '../../utils/date.js'
import { formatCents } from '../../utils/money.js'

const txStore = useTxStore()
const metaStore = useMetaStore()
const categoryStore = useCategoryStore()

const editing = ref(null)

const monthLabel = computed(function () {
  return metaStore.ym.replace('-', '年') + '月'
})
const summary = computed(function () {
  return txStore.summary
})
const groups = computed(function () {
  return groupByDay(txStore.records)
})
const editingCats = computed(function () {
  if (!editing.value) return []
  return editing.value.type === 'expense' ? categoryStore.expenseCats : categoryStore.incomeCats
})

function catOf(id) {
  const c = categoryStore.list.find(function (item) { return item.id === id })
  return c || { icon: '❓', name: '未知' }
}

function openEdit(r) {
  editing.value = r
}

async function refresh() {
  await txStore.loadMonth(metaStore.ym)
}

async function onSave(payload) {
  try {
    await txStore.update(metaStore.ym, editing.value.id, payload)
    editing.value = null
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  }
}

function onRemove() {
  uni.showModal({
    title: '删除记录',
    content: '确定删除这条记录吗？',
    success: function (res) {
      if (!res.confirm) return
      const id = editing.value.id
      editing.value = null
      txStore.remove(metaStore.ym, id).then(function () {
        uni.showToast({ title: '已删除', icon: 'none' })
      })
    }
  })
}

onShow(function () {
  refresh()
})
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.month-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 4px;
  flex: none;
}
.mb-btn {
  font-size: 22px;
  color: #8a8f99;
  padding: 4px 14px;
}
.mb-label {
  font-size: 15px;
  font-weight: 600;
  color: #222426;
}
.month-summary {
  display: flex;
  gap: 16px;
  padding: 2px 16px 10px;
  font-size: 13px;
  color: #8a8f99;
  border-bottom: 1px solid #ebedf0;
  background: #fff;
  flex: none;
}
.sum {
  font-weight: 600;
}
.sum.expense {
  color: #e24b4a;
}
.sum.income {
  color: #12924f;
}
.list-scroll {
  flex: 1;
}
.day-head {
  font-size: 12px;
  color: #8a8f99;
  padding: 14px 16px 6px;
}
.empty {
  text-align: center;
  color: #8a8f99;
  font-size: 13px;
  padding: 60px 32px;
  line-height: 2;
}
</style>
