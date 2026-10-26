/**
 * Mock 照片数据集（严格遵循服务端 JSON 返回格式）
 * ---------------------------------------------------------------------------
 * 这个文件被两处复用：
 *   1. 浏览器内 mock 数据源（src/api/sources/mockSource.js）
 *   2. 本地 mock 服务（mock/server.mjs，Node 原生 http）
 *
 * 因此这里必须保持"零依赖纯数据"，不要引入任何前端工具函数，
 * 也不要使用 '@/' 别名（Node 无法解析）。
 *
 * 图片资源由 `npm run gen:mock` 生成到 public/mock/photos/ 下，
 * 每个条目对应 3 个尺寸：_thumb.svg / _regular.svg / _full.svg
 * 视频资源由同一个脚本生成到 public/mock/videos/ 下（需要 ffmpeg，没有则跳过）
 */

import VIDEO_ASSETS from './video-assets.js'

/** 伪随机：保证每次启动生成的数据完全一致，便于联调与截图对比 */
function createRandom(seed) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALBUMS = [
  { id: 'al_1', name: '川西环线', coverPhotoId: 'ph_0001' },
  { id: 'al_2', name: '城市夜色', coverPhotoId: 'ph_0006' },
  { id: 'al_3', name: '山海之行', coverPhotoId: 'ph_0011' },
  { id: 'al_4', name: '春日花事', coverPhotoId: 'ph_0016' },
  { id: 'al_5', name: '家人随手拍', coverPhotoId: 'ph_0021' }
]

const AUTHORS = [
  { id: 'u_1', name: '林川', avatar: '/mock/avatars/u1.svg' },
  { id: 'u_2', name: '苏晚', avatar: '/mock/avatars/u2.svg' },
  { id: 'u_3', name: '陈默', avatar: '/mock/avatars/u3.svg' }
]

const CAMERAS = [
  { camera: 'Sony ILCE-7M4', lens: 'FE 24-70mm F2.8 GM II' },
  { camera: 'Canon EOS R6', lens: 'RF 24-105mm F4 L IS USM' },
  { camera: 'Nikon Z 6II', lens: 'NIKKOR Z 24-70mm f/2.8 S' },
  { camera: 'FUJIFILM X-T5', lens: 'XF 16-55mm F2.8 R LM WR' }
]

/**
 * 照片剧本：scene 决定占位图的画法，其余字段决定列表里展示的信息
 */
const SCENARIOS = [
  { scene: 'mountain', title: '晨雾中的山谷', desc: '海拔 3200m，等了四十分钟才等到这层雾', album: 0, author: 0, tags: ['风景', '日出', '徒步'], orient: 'landscape' },
  { scene: 'mountain', title: '折多山垭口', desc: '风很大，三脚架压了石头才稳住', album: 0, author: 0, tags: ['风景', '雪山'], orient: 'landscape' },
  { scene: 'lake', title: '牛奶海倒影', desc: '无风的十分钟窗口期', album: 0, author: 1, tags: ['风景', '倒影'], orient: 'portrait' },
  { scene: 'forest', title: '冷杉林间', desc: '下午三点的丁达尔效应', album: 0, author: 1, tags: ['风景', '光影'], orient: 'portrait' },
  { scene: 'sky', title: '高原银河', desc: '30s 赤道仪跟踪，20 张堆栈', album: 0, author: 2, tags: ['星空', '长曝光', '夜景'], orient: 'landscape' },

  { scene: 'city', title: '外滩落日后的二十分钟', desc: '蓝调时刻，ISO 压到 100', album: 1, author: 1, tags: ['城市', '蓝调时刻'], orient: 'landscape' },
  { scene: 'city', title: '天桥上的车流', desc: '8s 长曝，车灯拉成了丝带', album: 1, author: 1, tags: ['城市', '长曝光', '夜景'], orient: 'landscape' },
  { scene: 'city', title: '雨夜便利店', desc: '玻璃上的水珠刚好接住霓虹', album: 1, author: 2, tags: ['街拍', '夜景'], orient: 'portrait' },
  { scene: 'city', title: '写字楼夹层', desc: '几何构图练习', album: 1, author: 2, tags: ['建筑', '几何'], orient: 'square' },
  { scene: 'city', title: '地铁末班车', desc: '1/15s 手持，靠在门框上蹭到的稳定', album: 1, author: 0, tags: ['街拍', '黑白'], orient: 'landscape' },

  { scene: 'sea', title: '礁石边的浪', desc: 'ND1000，120s 把海雾化成纱', album: 2, author: 2, tags: ['海景', '长曝光'], orient: 'landscape' },
  { scene: 'sea', title: '渔船归港', desc: '逆光，压了两档曝光', album: 2, author: 2, tags: ['海景', '人文'], orient: 'landscape' },
  { scene: 'sea', title: '灯塔与夜空', desc: '月出后半小时', album: 2, author: 0, tags: ['夜景', '海景'], orient: 'portrait' },
  { scene: 'desert', title: '沙丘的脊线', desc: '侧逆光才有的层次', album: 2, author: 0, tags: ['风景', '光影'], orient: 'landscape' },
  { scene: 'desert', title: '无人区公路', desc: '正午硬光，勉强救回来的高光', album: 2, author: 1, tags: ['旅行', '公路'], orient: 'landscape' },

  { scene: 'flower', title: '玉兰初绽', desc: '微距 90mm，F2.8 全开', album: 3, author: 1, tags: ['微距', '花卉'], orient: 'square' },
  { scene: 'flower', title: '樱花隧道', desc: '早上七点，还没有人', album: 3, author: 1, tags: ['花卉', '街拍'], orient: 'portrait' },
  { scene: 'flower', title: '油菜花田', desc: '顺光平拍，颜色有点过', album: 3, author: 2, tags: ['花卉', '风景'], orient: 'landscape' },
  { scene: 'forest', title: '雨后苔藓', desc: '趴在石头上拍的，衣服废了', album: 3, author: 2, tags: ['微距', '自然'], orient: 'square' },
  { scene: 'sky', title: '流云压城', desc: '十张包围曝光 HDR', album: 3, author: 0, tags: ['天空', '城市'], orient: 'landscape' },

  { scene: 'portrait', title: '妹妹的毕业礼', desc: '自然光，反光板补了一点面光', album: 4, author: 0, tags: ['人像', '家庭'], orient: 'portrait' },
  { scene: 'portrait', title: '外婆的午后', desc: '窗边逆光，1/125s', album: 4, author: 0, tags: ['人像', '家庭'], orient: 'portrait' },
  { scene: 'portrait', title: '年夜饭前的厨房', desc: '高 ISO 换来的现场感', album: 4, author: 1, tags: ['人像', '纪实'], orient: 'landscape' },
  { scene: 'snow', title: '初雪的院子', desc: '零下九度，快门冻得有点卡', album: 4, author: 2, tags: ['雪景', '家庭'], orient: 'square' }
]

const DIMENSIONS = {
  landscape: [[6000, 4000], [5472, 3648], [6720, 4480], [8256, 5504]],
  portrait: [[4000, 6000], [3648, 5472], [4480, 6720], [3648, 4560]],
  square: [[4500, 4500], [4000, 4000], [5000, 5000]]
}

const PALETTES = {
  mountain: ['#5b7fa6', '#8fb0cc', '#dfe9f0', '#3f5d7d'],
  lake: ['#2e6f95', '#6fb3c9', '#cfe9ec', '#1f4f6d'],
  forest: ['#2f5d3a', '#5c8f52', '#a8c98a', '#1e3f28'],
  sky: ['#1b2a4a', '#3d5a80', '#7b93b8', '#0f1a30'],
  city: ['#2b3a55', '#5a6c8d', '#cfd8e6', '#f2c14e'],
  sea: ['#1d5c7a', '#4a9bb5', '#a8dbe3', '#123c52'],
  desert: ['#8a5a34', '#c98f52', '#efd2a8', '#5d3a20'],
  flower: ['#c05a7a', '#e58ea4', '#f7d6de', '#8c3a58'],
  portrait: ['#6b5a4e', '#a98d76', '#e6d7c8', '#43372f'],
  snow: ['#7d97b0', '#b9cddd', '#f2f7fb', '#5a6d80']
}

const EXPOSURES = ['1/1000', '1/500', '1/250', '1/125', '1/60', '1/15', '1/4', '1s', '4s', '30s']
const ISO_LIST = [64, 100, 125, 200, 400, 800, 1600, 3200]

function buildPhoto(spec, index) {
  const random = createRandom(index * 7919 + 13)
  const [w, h] = DIMENSIONS[spec.orient][Math.floor(random() * DIMENSIONS[spec.orient].length)]
  const palette = PALETTES[spec.scene] || PALETTES.mountain
  const gear = CAMERAS[Math.floor(random() * CAMERAS.length)]

  const id = `ph_${String(index + 1).padStart(4, '0')}`
  const dayOffset = index * 7 + Math.floor(random() * 5)
  const takenAt = new Date(Date.UTC(2026, 8, 28, 2, 0, 0) - dayOffset * 86400000 - Math.floor(random() * 6) * 3600000 + 8 * 3600000)
  const createdAt = new Date(takenAt.getTime() + (2 + Math.floor(random() * 30)) * 3600000)

  const megapixel = (w * h) / 1_000_000
  const byteSize = Math.round(megapixel * (0.9 + random() * 0.8) * 1024 * 1024)

  return {
    id,
    title: spec.title,
    description: spec.desc,
    fileName: `IMG_${takenAt.getUTCFullYear()}${String(takenAt.getUTCMonth() + 1).padStart(2, '0')}${String(takenAt.getUTCDate()).padStart(2, '0')}_${String(takenAt.getUTCHours()).padStart(2, '0')}${String(takenAt.getUTCMinutes()).padStart(2, '0')}${String(takenAt.getUTCSeconds()).padStart(2, '0')}.jpg`,
    mimeType: 'image/jpeg',
    size: byteSize,
    width: w,
    height: h,
    thumbWidth: 480,
    thumbHeight: spec.orient === 'portrait' ? 720 : spec.orient === 'square' ? 480 : 320,
    dominantColor: palette[0],
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    takenAt: takenAt.toISOString(),
    tags: spec.tags,
    author: AUTHORS[spec.author],
    album: ALBUMS[spec.album],
    location: {
      name: LOCATIONS[spec.album] || '',
      latitude: Number((24 + random() * 22).toFixed(4)),
      longitude: Number((100 + random() * 22).toFixed(4))
    },
    exif: {
      camera: gear.camera,
      lens: gear.lens,
      iso: ISO_LIST[Math.floor(random() * ISO_LIST.length)],
      fNumber: [1.8, 2.8, 4, 5.6, 8, 11][Math.floor(random() * 6)],
      exposureTime: EXPOSURES[Math.floor(random() * EXPOSURES.length)],
      focalLength: `${[16, 24, 35, 50, 85, 90, 105][Math.floor(random() * 7)]}mm`,
      software: 'Adobe Lightroom Classic 14.1'
    },
    urls: {
      thumb: `/mock/photos/${id}_thumb.svg`,
      regular: `/mock/photos/${id}_regular.svg`,
      full: `/mock/photos/${id}_full.svg`,
      download: `/mock/photos/${id}_full.svg`,
      page: `/photos/${id}`
    },
    permissions: {
      canView: true,
      canDownload: true,
      canEdit: false,
      canDelete: false,
      canShare: false
    },
    /** mock 专用：占位图绘制参数（真实接口不会包含该字段） */
    _mockRender: {
      scene: spec.scene,
      palette
    }
  }
}

/** 相册对应的地点，图片与视频共用 */
const LOCATIONS = ['四川 · 甘孜', '上海 · 外滩', '福建 · 东山岛', '甘肃 · 敦煌', '江苏 · 南京']

/**
 * 视频剧本
 * · duration / width / height 会在 ffmpeg 生成真实素材后被清单里的实测值覆盖
 * · rotation: 90 用来演示"容器 metadata 竖拍"的宽高归一（1920×1080 → 显示成 1080×1920）
 * · audio: 延时类视频通常没有音轨，用来演示 hasAudio 字段
 */
export const VIDEO_SCENARIOS = [
  { title: '海边日落延时', desc: '120 张照片合成的 8 秒', album: 2, author: 2, tags: ['延时', '海景'], duration: 8.4, width: 1280, height: 720, fps: 30, audio: false, rotation: 0 },
  { title: '天桥车流 60fps', desc: '手持稳定器，后期降到 30p 更稳', album: 1, author: 1, tags: ['城市', '夜景', '稳定器'], duration: 12.6, width: 1280, height: 720, fps: 30, audio: true, rotation: 0 },
  { title: '玉兰花开的十秒', desc: '固定机位，每 5 分钟一张', album: 3, author: 1, tags: ['微距', '花卉', '延时'], duration: 10.2, width: 720, height: 1280, fps: 25, audio: false, rotation: 0 },
  { title: '雪山云海航拍', desc: '4K 拍摄，导出时压到 1080p', album: 0, author: 0, tags: ['风景', '航拍'], duration: 15.8, width: 1280, height: 720, fps: 30, audio: true, rotation: 0 },
  { title: '年夜饭的厨房', desc: '手机竖拍，客厅灯光', album: 4, author: 1, tags: ['家庭', '纪实'], duration: 6.5, width: 1280, height: 720, fps: 30, audio: true, rotation: 90 }
]

function buildVideo(spec, index) {
  const random = createRandom(index * 4211 + 977)
  const id = `vd_${String(index + 1).padStart(4, '0')}`

  // 真实素材由 ffmpeg 生成；没有 ffmpeg 时清单里没有这一项，自动退化为图标模式
  const asset = VIDEO_ASSETS.items?.[id] || {}

  const dayOffset = index * 3 + Math.floor(random() * 3)
  const takenAt = new Date(Date.UTC(2026, 9, 20, 2, 0, 0) - dayOffset * 86400000 + 8 * 3600000)
  const createdAt = new Date(takenAt.getTime() + (1 + Math.floor(random() * 20)) * 3600000)

  const duration = Number(asset.duration ?? spec.duration)
  const width = Number(asset.width ?? spec.width)
  const height = Number(asset.height ?? spec.height)

  // H.264 1080p 典型码率 2~8 Mbps，用它反推一个合理的体积
  const bitrate = 2_000_000 + Math.round(random() * 6_000_000)
  const byteSize = Math.round((duration * bitrate) / 8)

  return {
    id,
    kind: 'video',
    title: spec.title,
    description: spec.desc,
    fileName: `VID_${takenAt.getUTCFullYear()}${String(takenAt.getUTCMonth() + 1).padStart(2, '0')}${String(takenAt.getUTCDate()).padStart(2, '0')}_${String(takenAt.getUTCHours()).padStart(2, '0')}${String(takenAt.getUTCMinutes()).padStart(2, '0')}${String(takenAt.getUTCSeconds()).padStart(2, '0')}.mp4`,
    mimeType: 'video/mp4',
    size: byteSize,
    width,
    height,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    takenAt: takenAt.toISOString(),
    tags: spec.tags,
    author: AUTHORS[spec.author],
    album: ALBUMS[spec.album],
    location: {
      name: LOCATIONS[spec.album] || '',
      latitude: Number((24 + random() * 22).toFixed(4)),
      longitude: Number((100 + random() * 22).toFixed(4))
    },
    urls: {
      thumb: asset.poster || '',
      poster: asset.poster || '',
      full: asset.media || '',
      download: asset.media || '',
      page: `/media/${id}`
    },
    video: {
      duration,
      codec: 'h264',
      audioCodec: spec.audio ? 'aac' : '',
      hasAudio: spec.audio,
      bitrate,
      frameRate: spec.fps,
      rotation: Number(asset.rotation ?? spec.rotation),
      supported: true
    },
    // 视频没有 EXIF，与图片共用同一套字段位
    exif: null,
    permissions: {
      canView: true,
      canDownload: true,
      canEdit: false,
      canDelete: false,
      canShare: false
    }
  }
}

export const MOCK_PHOTOS = SCENARIOS.map(buildPhoto)
export const MOCK_VIDEOS = VIDEO_SCENARIOS.map(buildVideo)

/** 图片 + 视频的混合列表，顺序按拍摄时间倒序，与真实接口返回一致 */
export const MOCK_MEDIA = [...MOCK_PHOTOS, ...MOCK_VIDEOS].sort((a, b) => b.takenAt.localeCompare(a.takenAt))

export const MOCK_ALBUMS = ALBUMS.map((album) => ({
  ...album,
  photoCount: MOCK_MEDIA.filter((media) => media.album?.id === album.id).length
}))

export const MOCK_TAGS = [...new Set(MOCK_MEDIA.flatMap((media) => media.tags))].sort().map((name, index) => ({
  id: `tag_${index + 1}`,
  name,
  photoCount: MOCK_MEDIA.filter((media) => media.tags.includes(name)).length
}))

export default MOCK_MEDIA
