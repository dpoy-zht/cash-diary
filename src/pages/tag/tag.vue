<template>
  <view class="page">
    <view class="navbar">
      <mascot-deco class="nav-milo" mood="waving" tier="corner" />
      <view class="icon-btn" hover-class="ib-hover" @click="goBack"><view class="ib" :style="iconBack" /></view>
      <text class="nav-title">标签管理</text>
      <view class="icon-btn" style="visibility:hidden"><view class="ib" /></view>
    </view>

    <view class="list-card">
      <view
        v-for="t in list"
        :key="t.id"
        class="row"
        hover-class="row-hover"
        @click="openActions(t)"
      >
        <!-- 圆点单独可点：换颜色不必先展开操作菜单 -->
        <view class="dot-btn" hover-class="dot-hover" @click.stop="openColors(t)">
          <view class="dot" :style="{ background: tagColorOf(t) }"></view>
        </view>
        <view class="row-main">
          <text class="row-name">{{ t.name }}</text>
          <text class="row-sub">{{ usageOf(t.id) ? usageOf(t.id) + ' 笔账在用' : '还没用过' }}</text>
        </view>
        <text class="row-arrow">›</text>
      </view>
      <view v-if="!list.length" class="row-empty">
        <mascot-deco class="empty-milo" mood="innocent" tier="hero" />
        <text class="row-hint">还没有标签，点下面新建一个</text>
      </view>
    </view>

    <text class="foot">点一行可以改名或删除，点左边的圆点换颜色。已经有账目在用的标签不能删——先去那些账目里取消关联。</text>

    <view class="create-wrap">
      <view class="create-btn" hover-class="create-hover" @click="createShow = true">
        <text class="create-t">+ 新建标签</text>
      </view>
    </view>

    <tag-create-sheet
      v-if="createShow"
      title="新建标签"
      @close="createShow = false"
      @submit="onCreate"
    />

    <tag-create-sheet
      v-if="renameShow"
      title="重命名标签"
      placeholder="新的名字"
      tip="只改名字，已经打了这个标签的账目会一起跟着变"
      @close="renameShow = false"
      @submit="onRename"
    />

    <!-- 换颜色：8 色色板 -->
    <view v-if="colorShow" class="mask" @click="colorShow = false">
      <view class="panel" @click.stop>
        <text class="panel-title">给「{{ colorTarget ? colorTarget.name : '' }}」换个颜色</text>
        <view class="colors">
          <view
            v-for="c in TAG_COLORS"
            :key="c"
            class="color-cell"
            :class="{ on: colorTarget && colorTarget.color === c }"
            @click="pickColor(c)"
          >
            <view class="color-dot" :style="{ background: tagColorOf({ id: 1, color: c }) }"></view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTagStore } from '../../stores/tag.js'
import { svgMaskStyle } from '../../utils/svg-icon.js'
import { tagColorOf } from '../../utils/palette.js'
import { TAG_COLORS } from '../../utils/tag.js'
import TagCreateSheet from '../../components/tag-create-sheet/tag-create-sheet.vue'

/**
 * 标签管理（T5.1）。
 *
 * 与「分类管理」同一套交互习惯（点行开操作菜单、底部大按钮新建），
 * 但有一处刻意的不同：**颜色不是图标**，所以换色做成点左边的圆点直接开色板，
 * 不用先进操作菜单再选二级项 —— 换色是高频小动作，值得少一步。
 */
const tagStore = useTagStore()

const createShow = ref(false)
const renameShow = ref(false)
const colorShow = ref(false)
const colorTarget = ref(null)
const renameTarget = ref(null)

const list = computed(function () { return tagStore.list })

const iconBack = svgMaskStyle('M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z')

function goBack() {
  uni.navigateBack({ fail: function () { uni.reLaunch({ url: '/pages/me/me' }) } })
}

async function refresh() {
  try {
    await tagStore.load()
    await tagStore.loadUsage()
  } catch (e) {
    uni.showToast({ title: '标签加载失败', icon: 'none' })
  }
}

onShow(function () { refresh() })

function usageOf(id) {
  return tagStore.usageOf(id)
}

function openActions(t) {
  const used = usageOf(t.id)
  uni.showActionSheet({
    itemList: ['重命名', used ? '删除（有 ' + used + ' 笔在用，删不了）' : '删除'],
    success: function (res) {
      if (res.tapIndex === 0) {
        renameTarget.value = t
        renameShow.value = true
        return
      }
      if (res.tapIndex === 1) confirmRemove(t)
    },
    fail: function () { /* 用户取消，什么都不做 */ }
  })
}

function openColors(t) {
  colorTarget.value = t
  colorShow.value = true
}

async function pickColor(c) {
  const t = colorTarget.value
  colorShow.value = false
  if (!t || t.color === c) return
  try {
    await tagStore.setColor(t.id, c)
    colorTarget.value = null
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '换色失败', icon: 'none' })
  }
}

async function onCreate(names) {
  try {
    const r = await tagStore.createMany(names.join(','))
    createShow.value = false
    await tagStore.loadUsage()
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

async function onRename(names) {
  const t = renameTarget.value
  renameShow.value = false
  if (!t) return
  try {
    await tagStore.rename(t.id, names[0])
    uni.showToast({ title: '已改名', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '改名失败', icon: 'none' })
  } finally {
    renameTarget.value = null
  }
}

function confirmRemove(t) {
  uni.showModal({
    title: '删除标签',
    content: '确定删除「' + t.name + '」吗？这个标签本身会被移除，已经打过它的账目不受影响（只是少了这个标签）。',
    confirmText: '删除',
    success: async function (res) {
      if (!res.confirm) return
      try {
        await tagStore.remove(t.id)
        await tagStore.loadUsage()
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        // 被引用时服务层会拒绝，这里把原因如实转达（用户需要知道"先去哪取消"）
        uni.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40px;
  /* navigationStyle:custom 下页面从 y=0 开始，自己让出状态栏 */
  padding-top: var(--status-bar-height, 0px);
}
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px;
  position: relative;
}
.nav-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--cd-ink);
}
.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ib {
  width: 22px;
  height: 22px;
  background-color: var(--cd-ink);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
.ib-hover {
  opacity: 0.6;
}

.list-card {
  margin: 8px 16px 0;
  background: var(--cd-surface);
  border-radius: var(--cd-r-card);
  box-shadow: var(--cd-sh-card);
  padding: 0 14px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--cd-line);
}
.row:last-child {
  border-bottom: none;
}
.row-hover {
  background: rgba(255, 233, 168, 0.35);
}
.dot-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.dot-hover {
  background: rgba(255, 233, 168, 0.6);
}
.dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-name {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--cd-ink);
}
.row-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--cd-ink-3);
}
.row-arrow {
  font-size: 18px;
  color: var(--cd-ink-3);
}
.row-empty {
  padding: 22px 0;
  text-align: center;
}
.row-hint {
  font-size: 13px;
  color: var(--cd-ink-3);
}

.foot {
  display: block;
  margin: 12px 22px 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--cd-ink-3);
}

.create-wrap {
  margin: 18px 16px 0;
}
.create-btn {
  height: 46px;
  border-radius: var(--cd-r-pill);
  background: var(--cd-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--cd-sh-btn);
}
.create-hover {
  opacity: 0.88;
}
.create-t {
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-btn-ink);
}

/* 换色板 */
.mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: rgba(93, 78, 55, 0.45);
  animation: cd-fade-in 200ms ease both;
  display: flex;
  align-items: flex-end;
}
.panel {
  width: 100%;
  background: var(--cd-surface);
  border-radius: var(--cd-r-card) var(--cd-r-card) 0 0;
  padding: 18px 16px calc(18px + var(--status-bar-height, 0px));
  box-shadow: var(--cd-sh-pop);
}
.panel-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--cd-ink);
  margin-bottom: 14px;
}
.colors {
  display: flex;
  justify-content: space-between;
}
.color-cell {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
}
.color-cell.on {
  border-color: var(--cd-ink-2);
}
.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}


/* ---- 奶龙 IP 边角装饰 ----
   navbar 是 flex + space-between，装饰件绝对定位后自动退出 flex 流，
   因此右侧按钮排布完全不变（不遮不挤）。top 偏移让它从导航条上缘探出一点，
   与页面主插画呼应。pointer-events:none 由组件保证，压到按钮上也不抢点击。 */
.nav-milo {
  top: -6px;
  right: -4px;
}

/* 空状态插画：奶龙站在文案上方。组件根节点是 absolute，这里改 relative
   让它"占位参与排版"，用 auto margin 水平居中，文案位置不会被挤动。 */
.row-empty {
  position: relative;
}
.empty-milo {
  position: relative;
  display: block;
  margin: 4px auto 10px;
}

</style>
