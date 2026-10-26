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
  generatedAt: "2026-10-26T18:06:53.759Z",
  items: {
  "vd_0001": {
    "media": "/mock/videos/vd_0001.mp4",
    "poster": "/mock/videos/vd_0001_poster.jpg",
    "sprite": {
      "image": "/mock/videos/vd_0001_sprite.jpg",
      "cols": 10,
      "rows": 2,
      "count": 16,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 90,
      "width": 1600,
      "height": 180
    },
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
    "sprite": {
      "image": "/mock/videos/vd_0002_sprite.jpg",
      "cols": 10,
      "rows": 3,
      "count": 25,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 90,
      "width": 1600,
      "height": 270
    },
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
    "sprite": {
      "image": "/mock/videos/vd_0003_sprite.jpg",
      "cols": 10,
      "rows": 2,
      "count": 20,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 284,
      "width": 1600,
      "height": 568
    },
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
    "sprite": {
      "image": "/mock/videos/vd_0004_sprite.jpg",
      "cols": 10,
      "rows": 4,
      "count": 31,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 90,
      "width": 1600,
      "height": 360
    },
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
    "sprite": {
      "image": "/mock/videos/vd_0005_sprite.jpg",
      "cols": 10,
      "rows": 2,
      "count": 13,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 284,
      "width": 1600,
      "height": 568
    },
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
