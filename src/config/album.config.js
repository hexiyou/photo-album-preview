/**
 * 相册功能开关（Feature Flags）
 * ---------------------------------------------------------------------------
 * 当前版本只开放「预览类」能力，上传 / 重命名 / 删除等管理类能力全部关闭。
 * 后续后端接口就绪时，只需把对应开关置为 true，UI（工具栏按钮、卡片悬浮菜单、
 * 右键菜单、详情页操作区）会自动出现，无需改动业务组件。
 *
 * 开关也可以通过 URL query 覆盖，便于联调演示：
 *   http://localhost:5173/?feat.upload=1&feat.delete=1
 */

const DEFAULT_FEATURES = {
  /** 缩略图网格视图 */
  grid: true,
  /** 详细记录（表格）视图 */
  table: true,
  /** 大图查看器 */
  viewer: true,
  /** 下载单张 */
  download: true,
  /** 批量下载（依赖多选） */
  batchDownload: false,
  /** 多选模式 */
  selection: false,
  /** 收藏 */
  favorite: false,
  /** 分享链接 */
  share: false,
  /** 上传（后端 POST /api/photos 就绪后开启） */
  upload: false,
  /** 重命名（后端 PATCH /api/photos/{id} 就绪后开启） */
  rename: false,
  /** 删除（后端 DELETE /api/photos/{id} 就绪后开启） */
  delete: false,
  /** 相册 / 标签筛选 */
  filter: true,
  /** 类型筛选（全部 / 图片 / 视频） */
  kindFilter: true,
  /** 视频播放（查看器内走 <video>，关闭则视频项只显示缩略图） */
  video: true,
  /**
   * 卡片悬停静音预览
   * 关掉后卡片就只显示缩略图。这个开关是"能力是否存在"的总闸，
   * 用户自己的偏好另有一套（工具栏按钮 + localStorage），两者都关才不预览
   */
  hoverPreview: true,
  /** 进度条拖动时的画面预览（按需雪碧图 / 实时取帧兜底） */
  scrubPreview: true,
  /**
   * sidecar 元数据编辑（写入与源文件同目录的 *.meta.json）
   * 默认关：本期定位仍是"浏览为主"，管理类能力不主动暴露。
   * 需要时访问 ?feat.metaEdit=1 打开
   */
  metaEdit: false,
  /**
   * 目录扫描（依赖本地 media server：media/server.mjs）
   * 按钮只在 VITE_DATA_SOURCE=local 时出现，其他数据源下自动隐藏
   */
  scan: true,
  /** 搜索 */
  search: true,
  /** 排序 */
  sort: true,
  /** EXIF / 元信息面板 */
  metaPanel: true,
  /** 底部缩略图导航条 */
  filmstrip: true
}

function readOverrides() {
  const overrides = {}
  if (typeof window === 'undefined') return overrides

  const query = new URLSearchParams(window.location.search)
  query.forEach((value, key) => {
    if (!key.startsWith('feat.')) return
    const name = key.slice(5)
    overrides[name] = ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
  })
  return overrides
}

export const features = { ...DEFAULT_FEATURES, ...readOverrides() }

export const isEnabled = (name) => features[name] === true

/** 管理类能力是否开放（用于批量渲染占位 UI） */
export const managementFeatures = ['upload', 'rename', 'delete']

export const hasAnyManagementFeature = () => managementFeatures.some((key) => isEnabled(key))

export default features
