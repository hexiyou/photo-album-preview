/**
 * 主题管理（明 / 暗）
 * ---------------------------------------------------------------------------
 * 规则：
 *   1. 用户在界面上手动切换 → 写入 localStorage 持久化，下次打开自动应用；
 *   2. 从未手动切换过 → 跟随系统偏好（prefers-color-scheme），并实时响应系统切换；
 *   3. 首屏无闪烁：index.html 里的内联脚本会提前给 <html> 打上 data-theme，
 *      本模块只负责"运行时"的读、写、订阅。
 *
 * 主题本身只影响 CSS 变量（见 styles/global.css 的 [data-theme='dark']），
 * 组件里不要写死颜色，这样新增组件自动支持双主题。
 */

import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'photo-album:theme'
const THEME_META_COLOR = { light: '#ffffff', dark: '#0e1116' }

/** 'light' | 'dark' | 'system' —— system 表示跟随系统 */
const preference = ref(readStored() ?? 'system')

const systemPrefersDark = ref(getSystemPrefersDark())

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    // 隐私模式 / 禁用存储时静默降级为跟随系统
    return null
  }
}

function persist(value) {
  try {
    if (value === 'light' || value === 'dark') localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 忽略存储失败，不影响本次会话的切换效果 */
  }
}

/** 最终生效的主题 */
const theme = computed(() => (preference.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : preference.value))

const isDark = computed(() => theme.value === 'dark')

function applyTheme(next) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', next)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_META_COLOR[next] || THEME_META_COLOR.light)
}

/** 切换瞬间挂过渡类，避免全站长期挂着 transition */
let animateTimer = null
function playTransition() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.add('theme-animate')
  clearTimeout(animateTimer)
  animateTimer = setTimeout(() => root.classList.remove('theme-animate'), 240)
}

function setTheme(value) {
  preference.value = value === 'light' || value === 'dark' ? value : 'system'
  persist(preference.value)
  playTransition()
}

function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

/** 跟随系统 */
function followSystem() {
  setTheme('system')
}

watch(
  theme,
  (next) => {
    // 首次进入时 index.html 的内联脚本已设置好，这里无需重播过渡动画
    applyTheme(next)
  },
  { immediate: true }
)

// 仅在没有显式偏好时才让系统变化影响页面
if (typeof window !== 'undefined' && window.matchMedia) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (event) => {
    systemPrefersDark.value = event.matches
  }

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange)
  } else if (typeof media.addListener === 'function') {
    media.addListener(onChange)
  }
}

export function useTheme() {
  return {
    /** 'light' | 'dark' | 'system' */
    preference,
    /** 实际生效的主题 */
    theme,
    isDark,
    setTheme,
    toggleTheme,
    followSystem
  }
}

export default useTheme
