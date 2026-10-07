<template>
  <view class="page">
    <!-- 奶黄渐变头部 -->
    <view class="add-head">
      <view class="navbar">
        <view class="icon-btn pressable" hover-class="pressable-hover" hover-stay-time="80" @click="goBack"><view class="ib" :style="iconBack" /></view>
        <text class="nav-title">记一笔</text>
        <view class="icon-btn pressable" hover-class="pressable-hover" hover-stay-time="80" @click="save"><view class="ib" :style="iconCheck" /></view>
      </view>
      <view class="type-switch">
        <view
          v-for="t in types"
          :key="t.key"
          class="type-item pressable"
          :class="{ on: type === t.key }"
          hover-class="pressable-hover"
          @click="switchType(t.key)"
        >{{ t.name }}</view>
      </view>
      <view class="big-amount">
        <text class="yen">¥</text>
        <text>{{ amountText }}</text>
      </view>
      <view class="amount-hint">{{ amountHint }}</view>
    </view>

    <!-- 备注 + 日期 -->
    <view class="meta-row">
      <input
        v-model="note"
        class="note-input"
        placeholder="加点备注…"
        placeholder-class="ph"
      />
      <picker mode="date" :value="dateStr" :start="minDateStr" :end="todayStr" @change="onDateChange">
        <view class="date-btn">{{ dateStr.slice(5) }}</view>
      </picker>
    </view>

    <!-- 分类选择：一级宫格 + 二级横条（两级结构见 utils/category-ui.js） -->
    <category-picker v-model="categoryId" :tree="tree" />

    <!-- 标签（可多选，可现场新建） -->
    <tag-chips v-model="tagIds" :tags="tagStore.list" @create="tagCreateShow = true" />

    <!-- 计算器键盘：支持 + − × ÷ 与等号，"完成"= 先结算再保存 -->
    <money-keyboard
      :can-equals="calcEqualsOn"
      :can-clear="calcClearOn"
      @key="onKey"
      @equals="onEquals"
      @clear="onClear"
      @confirm="onConfirm"
    />

    <tag-create-sheet
      v-if="tagCreateShow"
      @close="tagCreateShow = false"
      @submit="onTagCreate"
    />

    <!-- 记好啦成功弹窗 -->
    <view v-if="successShow" class="mask">
      <view class="modal">
        <asset-slot slot-id="add.success" img-class="modal-img" />
        <text class="modal-title">记好啦！</text>
        <text class="modal-sub">{{ lastSavedText }}</text>
        <text class="modal-tip">这笔账已经帮你存好啦~</text>
        <view class="btn-y pressable" hover-class="pressable-hover" @click="continueAdd">再记一笔</view>
        <view class="btn-ghost pressable" hover-class="pressable-hover" @click="successOK">开心回家</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTxStore } from '../../stores/tx.js'
import { useCategoryStore } from '../../stores/category.js'
import { useTagStore } from '../../stores/tag.js'
import TagChips from '../../components/tag-chips/tag-chips.vue'
import TagCreateSheet from '../../components/tag-create-sheet/tag-create-sheet.vue'
import { MAX_TAGS_PER_TX } from '../../utils/tag.js'
import { useMetaStore } from '../../stores/meta.js'
import { buildAddInput } from '../../services/tx.js'
import { playSfx, armOnFirstInteraction } from '../../utils/sound.js'
import { parseAmountToCents, formatCents } from '../../utils/money.js'
import {
  initialCalcState, calcKey, calcEquals, calcAmountText, calcDisplay,
  calcErrorText, canEquals, canEvaluate, canClear
} from '../../utils/calc.js'
import { toDateStr, tsFromDateStr } from '../../utils/date.js'
import { formAfterSaved, clampFutureDate, minSelectableDate } from '../../utils/entry.js'
import { haptic } from '../../utils/notify.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'

/**
 * 记一笔（v2.0）：奶黄渐变头 + 支出/收入 + 大金额 + 备注/日期 + 分类选择 + 奶黄键盘。
 * 参考包的"转账"页没有数据模型支撑，这里只保留 支出/收入 两个真实页签。
 *
 * 分类选择（v7 两级）：一级宫格 + 二级横条，组件是 `category-picker`。
 * `cats` 保留为**一级列表**，只用于"默认选中第一个"和切换收支时的兜底。
 */
const txStore = useTxStore()
const categoryStore = useCategoryStore()
const tagStore = useTagStore()
const metaStore = useMetaStore()

/** 本笔要挂的标签 id（保存时随流水一起落库） */
const tagIds = ref([])
const tagCreateShow = ref(false)

const types = [
  { key: 'expense', name: '支出' },
  { key: 'income', name: '收入' }
]

const type = ref('expense')
const current = ref('')
/** 计算器状态（算式 + 上一次运算信息）；所有运算规则都在 utils/calc.js 里，这里只存状态 */
const calc = ref(initialCalcState())
const categoryId = ref(null)
const note = ref('')
const dateStr = ref(toDateStr(Date.now()))
/** 可选日期上界 = 今天；记账记的是"已经发生"的收支，未来日期一律拦掉（T3.3） */
const todayStr = ref(toDateStr(Date.now()))
/** 可选日期下界：今天往前 5 年，避免 picker 年份列滑到 1970 后回不来 */
const minDateStr = ref(minSelectableDate(todayStr.value))
const successShow = ref(false)
const lastSaved = ref(null)
const saving = ref(false)

/** 一级分类列表：默认选中第一项 / 切换收支时兜底用 */
const cats = computed(function () {
  return type.value === 'expense' ? categoryStore.expenseTops : categoryStore.incomeTops
})
/** 两级树：交给 category-picker 渲染 */
const tree = computed(function () {
  return type.value === 'expense' ? categoryStore.expenseTree : categoryStore.incomeTree
})
const calcEqualsOn = computed(function () {
  return canEquals(calc.value)
})
const calcClearOn = computed(function () {
  return canClear(calc.value)
})
/** 顶部金额展示：空 → 0.00、算式中 → 表达式、结果 → 千分位金额（千分位手写，不依赖 Intl） */
const amountText = computed(function () {
  return calcDisplay(calc.value)
})
const amountHint = computed(function () {
  return calcEqualsOn.value ? '点 = 算出结果，再点完成保存' : '输入金额'
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
/**
 * 键盘按键。运算规则全在 utils/calc.js（纯函数），页面只存状态、
 * 并把"当前可提交的金额"同步到 current —— 保存流程照旧用 current，不受影响。
 */
function onKey(k) {
  haptic(10) // 按键轻振：形成"输入生效了"的手感（不支持振动的环境静默）
  const r = calcKey(calc.value, k)
  if (r.error) { uni.showToast({ title: calcErrorText(r.error), icon: 'none' }); return }
  calc.value = r.state
  current.value = calcAmountText(r.state)
}

function onEquals() {
  haptic(10)
  const r = calcEquals(calc.value)
  if (r.error) { uni.showToast({ title: calcErrorText(r.error), icon: 'none' }); return }
  calc.value = r.state
  current.value = calcAmountText(r.state)
}

function onClear() {
  haptic(20)
  calc.value = initialCalcState()
  current.value = ''
}

/**
 * 「完成」= 先结算（等同自动按一次 =）再走原保存流程。
 * 这样用户可以直接输 12.5×3 然后点完成，不必先按 =。
 */
function onConfirm() {
  if (!settle()) return
  save()
}

/**
 * 结算：算式完整就等于一下。返回 false 表示算不出来（已给过提示）。
 * 判据必须用 canEvaluate 而不是 canEquals —— 后者在「刚算完」时也为真，
 * 拿它当判据会让「完成」把上一步运算再重放一次（算完 8，点完成却存成 13）。
 */
function settle() {
  if (!canEvaluate(calc.value)) return true
  const r = calcEquals(calc.value)
  if (r.error) { uni.showToast({ title: calcErrorText(r.error), icon: 'none' }); return false }
  calc.value = r.state
  current.value = calcAmountText(r.state)
  return true
}
function onDateChange(e) {
  // picker 的 start/end 各端支持度不完全一致，返回值再钳一次兜底
  dateStr.value = clampFutureDate(e.detail.value, todayStr.value)
}

/**
 * 页面可能长时间挂在后台（晚上打开、第二天早上接着记），"今天"要跟着现实走。
 * 只把"一直没动过日期"的用户带着前进；自己选过日期的（补记）保持不动。
 */
onShow(function () {
  // 音效门闩：挂首次交互监听（只挂一次）。用户点「+」进本页也算一次交互，
  // 所以进页面时 armed 已经是 true，保存成功就能响。
  armOnFirstInteraction()
  // 标签列表可能被「标签管理」页改过（改名/删除），每次进页面重取一次
  tagStore.load().catch(function () { /* 取不到不阻塞记账 */ })
  const t = toDateStr(Date.now())
  if (t === todayStr.value) return
  if (dateStr.value === todayStr.value) dateStr.value = t
  todayStr.value = t
  minDateStr.value = minSelectableDate(t)
})

/**
 * 现场新建标签：建完**自动勾上**（用户建它就是为了马上用），
 * 但要受"一笔最多 N 个"的限制；已达上限的就不再自动勾。
 */
async function onTagCreate(names) {
  try {
    const r = await tagStore.createMany(names.join(','))
    tagCreateShow.value = false
    const wanted = {}
    r.created.forEach(function (n) { wanted[n] = 1 })
    const next = tagIds.value.slice()
    tagStore.list.forEach(function (t) {
      if (wanted[t.name] && next.indexOf(t.id) < 0 && next.length < MAX_TAGS_PER_TX) next.push(t.id)
    })
    tagIds.value = next
    if (r.created.length) {
      uni.showToast({ title: '已新建 ' + r.created.length + ' 个标签', icon: 'none' })
    } else if (r.full) {
      uni.showToast({ title: '标签数量已达上限', icon: 'none' })
    } else {
      uni.showToast({ title: '这些标签已经有了', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '新建失败', icon: 'none' })
  }
}

async function save() {
  if (saving.value) return // 防连点：写库期间再点不重复提交
  if (!settle()) return // 算式没算完/算不出来：先提示，不进保存
  const cents = parseAmountToCents(current.value)
  if (!cents) {
    uni.showToast({ title: '先输个金额嘛~', icon: 'none' })
    return
  }
  if (!categoryId.value) {
    uni.showToast({ title: '选一个分类嘛~', icon: 'none' })
    return
  }

  const cat = categoryStore.byId(categoryId.value)
  saving.value = true
  try {
    // 字段名映射统一走 services/tx.js 的 buildAddInput，页面不直接拼字段；
    // 标签随流水在同一次调用里落库（见 stores/tx.js: add）
    await txStore.add(
      metaStore.ym,
      buildAddInput({
        amountText: current.value,
        categoryId: categoryId.value,
        type: type.value,
        note: note.value.trim(),
        ts: tsFromDateStr(dateStr.value)
      }),
      tagIds.value
    )
    lastSaved.value = { cents: cents, type: type.value, name: cat ? cat.name : '' }
    resetFormAfterSaved()
    successShow.value = true
    haptic(30) // 保存成功长振一下，跟按键的轻振区分开
    playSfx('success') // 记账成功「叮」：与长振同时，构成"记上了"的确认感
  } catch (err) {
    // 关键：异常一定要变成用户看得见的提示，否则表现就是"点了没反应"
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

/**
 * 表单收敛：清空金额与备注，保留类型/分类/日期（契约见 utils/entry.js）。
 * save() 与"再记一笔"共用，保证两条路径的收尾行为不会漂移。
 */
function resetFormAfterSaved() {
  const next = formAfterSaved({
    type: type.value,
    categoryId: categoryId.value,
    dateStr: dateStr.value
  })
  type.value = next.type
  categoryId.value = next.categoryId
  dateStr.value = next.dateStr
  current.value = next.amount
  calc.value = initialCalcState()
  note.value = next.note
}

/** 再记一笔：只关弹窗，类型/分类/日期原样保留，接着输入金额即可 */
function continueAdd() {
  successShow.value = false
  haptic(10)
}
function successOK() {
  successShow.value = false
  goHome()
}
function goBack() {
  goHome()
}
/** 返回首页：正常是有返回栈的（navigateTo 进来），栈空时兜底 reLaunch */
function goHome() {
  uni.navigateBack({
    fail: function () {
      uni.reLaunch({ url: '/pages/home/home' })
    }
  })
}

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')
const iconCheck = svgMaskStyle('M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z')

/**
 * 默认选中第一个一级分类。
 * 必须用 watch 而不是 setup 里判一次：分类是异步从库里读的（App 端 SQLite 更慢），
 * setup 执行时 cats 往往还是空的，那样 categoryId 会一直是 null → 点"记好啦"只会提示"选一个分类"。
 *
 * ⚠️ 合法性判据必须遍历**整棵树**（一级 + 二级），不能只看一级列表 ——
 * 否则用户选好「早餐」之后，分类表任何一次刷新都会把他退回「餐饮」。
 */
watch(
  tree,
  function (nodes) {
    const ids = []
    ;(Array.isArray(nodes) ? nodes : []).forEach(function (n) {
      ids.push(Number(n.cat.id))
      ;(n.children || []).forEach(function (c) { ids.push(Number(c.id)) })
    })
    if (!ids.length) return
    if (ids.indexOf(Number(categoryId.value)) === -1) categoryId.value = ids[0]
  },
  { immediate: true }
)
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
  background: var(--cd-icon);
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
/* 次要动作：不加底色，避免和主按钮抢注意力 */
.btn-ghost {
  width: 100%;
  margin-top: 8px;
  padding: 12px 0;
  border-radius: var(--cd-r-pill);
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-ink-2);
  text-align: center;
}


</style>
