import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  NAV_TIER,
  decideNavTier,
  detectCapability,
  clearPerfMemory,
  isFrameBudgetOk,
  loadNavPref,
  loadPerfOk,
  percentile,
  saveNavPref,
  savePerfOk
} from '../utils/nav-tier.js'

/**
 * 外观 / 导航相关的 UI 状态。
 *
 * 为什么不放在 meta：meta 管的是"看哪个月"这类业务视图状态；
 * 这里管的是"这台机器能不能用毛玻璃"这类运行环境状态，混在一起会让两边都难懂。
 */
export const useUiStore = defineStore('ui', function () {
  const navPref = ref('auto')                                   // auto | blur | solid
  const cap = ref({ supportsBlur: false, reduceTransparency: false, lowEnd: false })
  const perfOk = ref(true)                                      // 滚动实测是否达标
  const perf = ref({ sampled: false, fps: null })

  let ready = false

  /** 采用哪一档：纯函数判定，模板只认这个结果 */
  const navTier = computed(function () {
    return decideNavTier({
      pref: navPref.value,
      supportsBlur: cap.value.supportsBlur,
      reduceTransparency: cap.value.reduceTransparency,
      lowEnd: cap.value.lowEnd,
      perfOk: perfOk.value
    })
  })

  const navCanBlur = computed(function () {
    return navTier.value === NAV_TIER.BLUR
  })

  /** 是否处于"自动降级"状态（用于给用户解释，而不是静默降级） */
  const navDegraded = computed(function () {
    return navPref.value === 'auto' && navTier.value === NAV_TIER.SOLID &&
      (cap.value.supportsBlur && !cap.value.reduceTransparency && !cap.value.lowEnd)
  })

  /** 启动时读一次：偏好、能力、上次的降级记忆 */
  function init() {
    if (ready) return
    ready = true
    navPref.value = loadNavPref()
    cap.value = detectCapability()
    perfOk.value = loadPerfOk()
  }

  function setNavPref(pref) {
    navPref.value = pref
    saveNavPref(pref)
    // 手动指定毛玻璃 = 用户明确要求，清掉自动降级记忆重新给它机会
    if (pref === 'blur') {
      clearPerfMemory()
      perfOk.value = true
    }
  }

  /**
   * 页面滚动时采集一段 rAF 帧间隔。
   * 只在"自动 + 还没测过"时做一次：静态页面测不出滚动合成的开销，
   * 所以必须挂在真实滚动上，而不能在 onMounted 里测。
   */
  function sampleOnScroll() {
    if (perf.value.sampled || navPref.value !== 'auto') return
    perf.value.sampled = true

    const deltas = []
    let t0 = 0
    let last = 0

    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : function (fn) { return setTimeout(function () { fn(Date.now()) }, 16) }

    function tick(t) {
      if (!t0) {
        t0 = t
        last = t
      } else {
        deltas.push(t - last)
        last = t
      }
      if (t - t0 < 700) raf(tick)
      else finish()
    }

    function finish() {
      // 前两帧常常包含首次合成，丢掉更公平
      const usable = deltas.slice(2)
      if (usable.length < 8) return
      perf.value.fps = Math.round(1000 / (percentile(usable, 0.5) || 16.7))
      perfOk.value = isFrameBudgetOk(usable)
      if (perfOk.value) return
      savePerfOk(false)
      uni.showToast({ title: '为保持流畅，已改用纯色导航栏', icon: 'none' })
    }

    raf(tick)
  }

  return {
    navPref,
    cap,
    perf,
    perfOk,
    navTier,
    navCanBlur,
    navDegraded,
    init,
    setNavPref,
    sampleOnScroll
  }
})
