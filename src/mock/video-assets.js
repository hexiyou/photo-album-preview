/**
 * 视频演示资源清单（由 `npm run gen:mock` 自动生成，可安全删除）
 * ---------------------------------------------------------------------------
 * 存在的意义：演示视频要用 ffmpeg 才能生成（H.264 MP4 + 抽帧缩略图），
 * 而 ffmpeg 是本项目的**可选依赖**——装了才生成，没装就保持 available: false。
 *
 *   available: true  → 视频卡片显示缩略图 + 时长，点击可播放
 *   available: false → 视频卡片只显示图标（这正是无 ffmpeg 时的降级形态）
 */

export const VIDEO_ASSETS = {
  available: true,
  generatedAt: "2026-10-26T16:17:49.322Z",
  items: {
  "vd_0001": {
    "media": "/mock/videos/vd_0001.mp4",
    "poster": "/mock/videos/vd_0001_poster.jpg",
    "duration": 8.4,
    "width": 1280,
    "height": 720,
    "rotation": 0,
    "frameRate": 30,
    "bitrate": 1121240
  },
  "vd_0002": {
    "media": "/mock/videos/vd_0002.mp4",
    "poster": "/mock/videos/vd_0002_poster.jpg",
    "duration": 12.6,
    "width": 1280,
    "height": 720,
    "rotation": 0,
    "frameRate": 30,
    "bitrate": 1196266
  },
  "vd_0003": {
    "media": "/mock/videos/vd_0003.mp4",
    "poster": "/mock/videos/vd_0003_poster.jpg",
    "duration": 10.2,
    "width": 720,
    "height": 1280,
    "rotation": 0,
    "frameRate": 25,
    "bitrate": 1042565
  },
  "vd_0004": {
    "media": "/mock/videos/vd_0004.mp4",
    "poster": "/mock/videos/vd_0004_poster.jpg",
    "duration": 15.8,
    "width": 1280,
    "height": 720,
    "rotation": 0,
    "frameRate": 30,
    "bitrate": 1196137
  },
  "vd_0005": {
    "media": "/mock/videos/vd_0005.mp4",
    "poster": "/mock/videos/vd_0005_poster.jpg",
    "duration": 6.5,
    "width": 1280,
    "height": 720,
    "rotation": 90,
    "frameRate": 30,
    "bitrate": 1195473
  }
}
}

export default VIDEO_ASSETS
