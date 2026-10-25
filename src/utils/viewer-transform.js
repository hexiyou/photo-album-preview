/**
 * 查看器「缩放 / 旋转 / 翻转 / 平移」状态机（纯函数）
 * ---------------------------------------------------------------------------
 * 布局采用：先平移、再旋转、最后缩放翻转。
 *   screenVec = R(rotate) · diag(flipX·scale, flipY·scale) · imageVec + offset
 *
 * 之所以自己实现坐标换算而不是直接用 DOM 矩阵，是为了：
 *   1. 支持「以光标为锚点」缩放；
 *   2. 旋转 90° 后自动重新适配容器并保持视觉中心；
 *   3. 平移边界可控，图片不会被拖出视野。
 */

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 8
export const ZOOM_STEP = 1.25

export function createViewerTransform() {
  return {
    /** 用户缩放系数，1 = 自适应/原始尺寸 */
    scale: 1,
    /** 旋转角度，仅支持 90 的整数倍 */
    rotate: 0,
    flipH: false,
    flipV: false,
    /** 平移（屏幕像素） */
    offsetX: 0,
    offsetY: 0
  }
}

export function resetViewerTransform(transform) {
  Object.assign(transform, createViewerTransform())
  return transform
}

/** 旋转：delta 为 ±90 */
export function rotateViewerTransform(transform, delta) {
  transform.rotate = normalizeRotate(transform.rotate + delta)

  // 旋转后平移向量也要跟着转，保证「看到的仍是同一块区域」
  const rad = toRadian(delta)
  const { offsetX, offsetY } = transform
  transform.offsetX = offsetX * Math.cos(rad) - offsetY * Math.sin(rad)
  transform.offsetY = offsetX * Math.sin(rad) + offsetY * Math.cos(rad)

  return transform
}

export function normalizeRotate(deg) {
  const value = ((deg % 360) + 360) % 360
  return Math.round(value / 90) * 90 % 360
}

function toRadian(deg) {
  return (deg * Math.PI) / 180
}

function flipFactors(transform) {
  return {
    fx: transform.flipH ? -1 : 1,
    fy: transform.flipV ? -1 : 1
  }
}

/**
 * 计算「适应容器」的基础缩放比
 * @param {number} naturalWidth 图片原始宽
 * @param {number} naturalHeight 图片原始高
 * @param {number} containerWidth 容器宽
 * @param {number} containerHeight 容器高
 * @param {number} rotate 当前旋转角
 * @param {boolean} upscale 是否允许放大到超过原始尺寸
 */
export function computeFitScale(naturalWidth, naturalHeight, containerWidth, containerHeight, rotate = 0, upscale = false) {
  if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) return 1

  const swapped = normalizeRotate(rotate) % 180 !== 0
  const targetWidth = swapped ? naturalHeight : naturalWidth
  const targetHeight = swapped ? naturalWidth : naturalHeight

  const raw = Math.min(containerWidth / targetWidth, containerHeight / targetHeight)
  return upscale ? raw : Math.min(raw, 1)
}

/** 图片在当前状态下的屏幕占位尺寸（未加 ROI 偏移） */
export function measureVisualBox({ naturalWidth, naturalHeight, fitScale, scale, rotate }) {
  const baseWidth = naturalWidth * fitScale
  const baseHeight = naturalHeight * fitScale
  const swapped = normalizeRotate(rotate) % 180 !== 0

  return {
    width: (swapped ? baseHeight : baseWidth) * scale,
    height: (swapped ? baseWidth : baseHeight) * scale
  }
}

/** 把偏移限制在「图片不会飞出视野」的范围内 */
export function clampOffset(transform, visualBox, containerSize) {
  const overflowX = Math.max(0, (visualBox.width - containerSize.width) / 2)
  const overflowY = Math.max(0, (visualBox.height - containerSize.height) / 2)

  transform.offsetX = Math.min(overflowX, Math.max(-overflowX, transform.offsetX))
  transform.offsetY = Math.min(overflowY, Math.max(-overflowY, transform.offsetY))
  return transform
}

/**
 * 以某个屏幕锚点为基准缩放（滚轮、双击、按钮均可复用）
 * @param {object} transform 当前状态（原地修改）
 * @param {number} nextScale 目标缩放
 * @param {{px:number, py:number}} anchor 锚点，相对于容器中心
 */
export function zoomViewerAt(transform, nextScale, anchor = { px: 0, py: 0 }) {
  const { fx, fy } = flipFactors(transform)
  const rad = toRadian(transform.rotate)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // inverse: u = diag(1/(fx·s), 1/(fy·s)) · R⁻¹ · (v - offset)
  const vx = anchor.px - transform.offsetX
  const vy = anchor.py - transform.offsetY
  const rx = vx * cos + vy * sin
  const ry = -vx * sin + vy * cos
  const ux = rx / (fx * transform.scale)
  const uy = ry / (fy * transform.scale)

  transform.scale = clampScale(nextScale)

  // forward: v' = R · diag(fx·s', fy·s') · u + offset'
  const sx = fx * transform.scale * ux
  const sy = fy * transform.scale * uy
  transform.offsetX = anchor.px - (sx * cos - sy * sin)
  transform.offsetY = anchor.py - (sx * sin + sy * cos)

  return transform
}

export function clampScale(scale) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale))
}

export function zoomByStep(transform, direction, anchor) {
  const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
  return zoomViewerAt(transform, clampScale(transform.scale * factor), anchor)
}

/** 生成可直接绑定到 :style 的 transform */
export function transformToCss(transform) {
  const { fx, fy } = flipFactors(transform)
  return {
    transform: `translate3d(${transform.offsetX}px, ${transform.offsetY}px, 0) rotate(${normalizeRotate(transform.rotate)}deg) scale(${fx * transform.scale}, ${fy * transform.scale})`
  }
}

/** 判断是否处于「未做任何变换」的默认状态 */
export function isDefaultTransform(transform) {
  return (
    Math.abs(transform.scale - 1) < 0.001 &&
    transform.rotate === 0 &&
    !transform.flipH &&
    !transform.flipV &&
    Math.abs(transform.offsetX) < 0.5 &&
    Math.abs(transform.offsetY) < 0.5
  )
}

export default {
  createViewerTransform,
  resetViewerTransform,
  rotateViewerTransform,
  zoomViewerAt,
  zoomByStep,
  clampOffset,
  clampScale,
  computeFitScale,
  measureVisualBox,
  transformToCss,
  normalizeRotate,
  isDefaultTransform,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP
}
