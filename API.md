# 媒体列表 API 对接文档（图片 + 视频）

> 本文定义的 JSON 结构即为前端 `src/model/media.js` 消费的契约。后端按此实现即可直接对接；若字段名需要调整，见文末「字段容错与别名」。
>
> **向后兼容说明**：本文相比纯图片版本只**新增**了 `kind` 与 `video` 两个可选字段，以及 `kind` 查询参数。已有只返回图片的后端**不需要任何改动**。

---

## 一、通用约定

### 1.1 基础信息

| 项目 | 约定 |
| --- | --- |
| 基础路径 | 由前端 `VITE_API_BASE_URL` 决定，默认 `/api` |
| 请求方式 | 列表 / 详情类全部 `GET`，扫描为 `POST` |
| 编码 | `application/json; charset=utf-8` |
| 鉴权 | 可选。若配置 `VITE_API_TOKEN`，前端发送 `Authorization: Bearer <token>` |
| 时间格式 | ISO 8601 字符串，建议带时区，如 `2026-09-28T10:00:00+08:00` |
| 跨域 | 若前后端不同域，需开启 CORS 并允许 `Authorization` 与 `Range` 头 |

### 1.2 统一响应信封

**成功**

```json
{
  "code": 0,
  "message": "success",
  "traceId": "9f2c1a7b-...",
  "data": { ... }
}
```

**失败**

```json
{
  "code": 1001,
  "message": "参数错误：pageSize 超出范围",
  "traceId": "9f2c1a7b-...",
  "data": null
}
```

判定逻辑：前端只看 `code === 0` 视为成功，其余一律抛错并展示 `message`。
`traceId` 用于前后端日志串联，没有则返回空串即可。

> 前端也兼容「直接返回数组 / 裸对象」的响应（`httpSource.js` 中有兜底分支），但**建议**统一使用信封结构。

### 1.3 错误码

| code | 含义 | 建议 HTTP 状态 |
| --- | --- | --- |
| 0 | 成功 | 200 |
| 1001 | 参数错误 | 400 |
| 1003 | 未授权 / Token 失效 | 401 |
| 1004 | 无访问权限 | 403 |
| 40400 | 接口不存在 | 404 |
| 40404 | 资源不存在（照片已删除等） | 404 |
| 5000 | 服务内部错误 | 500 |

业务侧可自行扩展；前端除 0 以外都按失败处理并原样提示 `message`。

---

## 二、接口清单

| 方法 | 路径 | 说明 | 状态 |
| --- | --- | --- | --- |
| GET | `/media` 或 `/photos` | 分页查询媒体列表（图片 + 视频） | **必须实现** |
| GET | `/media/{id}` 或 `/photos/{id}` | 单个媒体详情 | 必须实现 |
| GET | `/file/{id}` | 原始文件流，**需支持 Range → 206** | 视频必需 |
| GET | `/photos/batch?ids=a,b,c` | 批量查询详情 | 可选 |
| GET | `/albums` | 相册列表（工具栏筛选） | 可选（不提供则筛选器为空） |
| GET | `/tags` | 标签列表（工具栏筛选） | 可选 |
| GET | `/media/{id}/download` | 下载接口（可带 `Content-Disposition`） | 可选（有则体验更好） |
| GET | `/sprite/{id}` | 进度预览雪碧图布局（三态） | 可选（见 5.8） |
| POST | `/scan` | 扫描目录（可选实现，见 5.7） | 可选 |
| GET | `/scan/status` | 扫描进度（轮询通路） | 可选 |
| GET | `/scan/stream` | **扫描进度 SSE**（见 5.9） | 可选 |
| PUT | `/media/{id}/meta` | 写入 sidecar 元数据（见 5.10） | 可选 |
| POST | `/photos` | 上传 | 预留 |
| PATCH | `/photos/{id}` | 重命名 / 修改信息（**即元数据写入**，见 5.10） | 预留 |
| DELETE | `/photos/{id}` | 删除 | 预留 |
| POST | `/photos/batch-delete` | 批量删除 | 预留 |

> `/media` 与 `/photos` 是**同一接口的两种路径写法**，任选其一实现即可，前端两者都认。

---

## 三、GET /media — 媒体列表

### 3.1 请求参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | int | 否 | 1 | 页码，从 1 开始 |
| `pageSize` | int | 否 | 20 | 每页条数，建议上限 100 |
| `kind` | string | 否 | `all` | **新增**：`all` / `image` / `video`。**值为 `all` 时前端不传此参数**，保证与未升级的后端请求完全一致 |
| `keyword` | string | 否 | 空 | 模糊搜索：标题 / 文件名 / 描述 / 标签 / 作者 / 相册名 |
| `albumId` | string | 否 | 空 | 按相册筛选 |
| `tag` | string | 否 | 空 | 按单个标签筛选 |
| `sort` | string | 否 | `takenAt` | 排序字段：`takenAt` / `createdAt` / `fileName` / `size` / `width` / **`duration`** |
| `order` | string | 否 | `desc` | `asc` / `desc` |
| `dateFrom` | string | 否 | 空 | 拍摄时间起（`YYYY-MM-DD`），预留 |
| `dateTo` | string | 否 | 空 | 拍摄时间止（`YYYY-MM-DD`），预留 |

空值参数不会出现在请求里（前端会过滤空串）。

> **后端暂不支持 `kind` 也没关系**：前端收到结果后会按 `kind` 字段在本地兜底过滤一次，只是分页总数在混合列表下会不准。

### 3.2 响应示例

图片与视频混在同一个 `list` 里，靠 `kind` 区分（下面为了紧凑省略了部分共有字段）：

```json
{
  "code": 0,
  "message": "success",
  "traceId": "srv-7f31a2",
  "data": {
    "list": [
      {
        "id": "ph_0001",
        "kind": "image",
        "title": "晨雾中的山谷",
        "description": "海拔 3200m，等了四十分钟才等到这层雾",
        "fileName": "IMG_20260928_100000.jpg",
        "mimeType": "image/jpeg",
        "size": 28582275,
        "width": 6720,
        "height": 4480,
        "thumbWidth": 480,
        "thumbHeight": 320,
        "dominantColor": "#5b7fa6",
        "createdAt": "2026-09-28T18:00:00+08:00",
        "updatedAt": "2026-09-28T18:00:00+08:00",
        "takenAt": "2026-09-28T18:00:00+08:00",
        "tags": ["风景", "日出", "徒步"],
        "author": { "id": "u_1", "name": "林川", "avatar": "https://cdn.example.com/a/u1.png" },
        "album": { "id": "al_1", "name": "川西环线", "coverPhotoId": "ph_0001" },
        "location": { "name": "四川 · 甘孜", "latitude": 30.0512, "longitude": 101.9638 },
        "exif": {
          "camera": "Canon EOS R6",
          "lens": "RF 24-105mm F4 L IS USM",
          "iso": 400,
          "fNumber": 11,
          "exposureTime": "1/4",
          "focalLength": "90mm",
          "software": "Adobe Lightroom Classic 14.1"
        },
        "video": null,
        "urls": {
          "thumb": "https://cdn.example.com/ph_0001_thumb.jpg",
          "regular": "https://cdn.example.com/ph_0001_1080.jpg",
          "full": "https://cdn.example.com/ph_0001.jpg",
          "download": "https://cdn.example.com/ph_0001.jpg?attname=...",
          "page": "https://example.com/photos/ph_0001"
        },
        "permissions": { "canView": true, "canDownload": true, "canEdit": false, "canDelete": false, "canShare": false }
      },
      {
        "id": "md_0002",
        "kind": "video",
        "title": "海边的黄昏",
        "description": "手机竖拍，容器里带 rotate=90",
        "fileName": "VID_20261001_193000.mp4",
        "mimeType": "video/mp4",
        "size": 971322,
        "width": 1280,
        "height": 720,
        "dominantColor": "#2b3a55",
        "createdAt": "2026-10-01T19:30:00+08:00",
        "updatedAt": "2026-10-01T19:30:00+08:00",
        "takenAt": "2026-10-01T19:30:00+08:00",
        "tags": ["海景", "黄昏"],
        "author": { "id": "u_1", "name": "林川" },
        "album": { "id": "al_1", "name": "川西环线" },
        "location": { "name": "", "latitude": null, "longitude": null },
        "exif": null,
        "video": {
          "duration": 6.5,
          "codec": "h264",
          "audioCodec": "aac",
          "hasAudio": true,
          "bitrate": 1195473,
          "frameRate": 30,
          "rotation": 90,
          "supported": true
        },
        "urls": {
          "poster": "https://cdn.example.com/md_0002_poster.jpg",
          "full": "https://cdn.example.com/md_0002.mp4",
          "download": "https://cdn.example.com/md_0002.mp4?download=1"
        },
        "permissions": { "canView": true, "canDownload": true }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 24,
      "totalPages": 2,
      "hasMore": true
    }
  }
}
```

---

## 四、Media 对象字段字典

> 图片与视频共用同一套字段。共用字段语义一致（比如 `width/height` 对照片是 6000×4000，对视频是 1920×1080），各自专属的字段收进 `exif` / `video` 子对象。

### 4.1 必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识，全站唯一。**缺失则该条数据被丢弃** |
| `urls` | object | 地址集合，至少提供一个可用地址 |

### 4.2 类型判别 `kind`（新增，可选）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | string | `image` / `video`。**新增可选字段**，缺省时前端按 `mimeType` → 文件扩展名自动推断 |

推断顺序：`kind` 声明 → `mimeType` 前缀（`video/` / `image/`）→ 扩展名 → 兜底为 `image`。

### 4.3 基础信息

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 标题；为空时前端回退用文件名 |
| `description` | string | 描述 / 备注 |
| `fileName` | string | 原始文件名，含扩展名 |
| `mimeType` | string | 如 `image/jpeg`、`image/png`、`image/webp`、`video/mp4` |

### 4.4 尺寸与体积

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `width` / `height` | int | 原始像素宽高。用于计算分辨率、像素数、查看器自适应缩放 |
| `thumbWidth` / `thumbHeight` | int | 缩略图像素宽高，用于占位避免布局抖动；缺省则用 `width/height` 推算比例 |
| `size` | int | 文件字节数。前端会格式化为 `KB / MB`，并支持按大小排序 |
| `dominantColor` | string | 主色调（`#RRGGBB`），用作加载前的占位底色。缺省用浅灰 |

> **视频的 `width/height` 请返回容器里的原始值**，不要自行交换。竖拍视频的旋转交给 `video.rotation`，前端会自己交换宽高显示。

### 4.5 地址集合 `urls`

| 字段 | 建议规格 | 用途 |
| --- | --- | --- |
| `thumb` | 长边 400–600 | 网格缩略图、表格小图、底部胶片条 |
| `poster` | 长边 400–600 | **新增**：视频封面图。缺省回退到 `thumb` |
| `regular` | 长边 1080–1600 | 查看器首屏快速出图、相邻图预加载 |
| `full` | 原图 / 原始视频 | 查看器放大查看、视频播放源、下载兜底 |
| `download` | 原文件 + `Content-Disposition` | 下载专用地址（可带签名）；缺省回退到 `full` |
| `page` | 页面 URL | 详情页链接，预留 |

**降级规则（重要）**

- 图片：任一档缺省时按 `full → regular → thumb` 回退，不会显示空白。
- 视频：`thumb` / `poster` 都没有时**留空即可，切勿回退成视频文件本身**。前端遇到空值会显示图标占位；如果回退成 MP4，卡片会渲染 `<img src="xxx.mp4">`，把整个视频文件当图片下载下来。

建议至少提供 `thumb`（图片）与 `poster` + `full`（视频）。

### 4.6 视频专属字段 `video`（新增，可选）

| 字段 | 类型 | 单位 / 取值 | 说明 |
| --- | --- | --- | --- |
| `duration` | number | **秒**，可为小数 | 时长。前端格式化为 `00:06` / `01:02:05`。缺失时前端在 `loadedmetadata` 后自行补获 |
| `codec` | string | `h264` / `hevc` / `av1`… | 视频编码。当前只有 `h264` 保证可播 |
| `audioCodec` | string | `aac` / `mp3`… | 音频编码，无音轨则给空串 |
| `hasAudio` | bool \| null | | 是否有音轨。缺省时按 `audioCodec` 是否存在推断 |
| `bitrate` | int \| null | **bits/s**（注意不是 kbps） | 总码率。前端展示时除以 1000 显示为 kbps |
| `frameRate` | number \| null | fps | 帧率，可为小数（如 `29.97`） |
| `rotation` | int | `0` / `90` / `180` / `270` | 容器里的旋转标记。非 90/270 时前端会交换宽高显示 |
| `supported` | bool | | 是否可直接播放。缺省时按「容器 + 编码」推断 |
| `previewUrl` | string | | 预留：雪碧图 / 预览帧地址 |

**图片项的 `video` 一律为 `null`**，视频项的 `exif` 一律为 `null`。两者互不污染，后端可以只填一边。

### 4.7 时间

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `takenAt` | string(ISO) | 拍摄时间。列表默认按此排序 |
| `createdAt` | string(ISO) | 上传时间 |
| `updatedAt` | string(ISO) | 更新时间 |

> 若 `takenAt` 缺失，前端会依次回退 `createdAt` → 从文件名（如 `IMG_20260928_100000.jpg`）解析。

### 4.8 组织维度

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tags` | string[] | 标签，列表展示最多 3 个，超出折叠为 `+N` |
| `album` | object | `{ id, name }`，工具栏相册筛选的数据来源 |
| `author` | object | `{ id, name, avatar? }`，上传者 |
| `location` | object | `{ name?, latitude?, longitude? }`，拍摄地点 |

> 相册、标签是**图片与视频共用**的：一个相册里可以同时有照片和视频，标签也同理。

### 4.9 EXIF `exif`（图片专属）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `camera` | string | 相机型号 |
| `lens` | string | 镜头型号 |
| `iso` | int | 感光度 |
| `fNumber` | number | 光圈值，如 `2.8` → 展示 `f/2.8` |
| `exposureTime` | string \| number | 快门。字符串 `1/250`、`8s` 原样展示；数字按秒换算 |
| `focalLength` | string \| number | 焦距，如 `35mm` 或 `35` |
| `software` | string | 后期软件 |

> 视频项给 `null` 即可，前端不会展示视频的拍摄参数分段。

### 4.10 权限 `permissions`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `canView` | bool | true | 是否可查看 |
| `canDownload` | bool | true | 为 `false` 时下载按钮置灰 |
| `canEdit` | bool | false | 预留：重命名 / 编辑 |
| `canDelete` | bool | false | 预留：删除 |
| `canShare` | bool | false | 预留：分享 |

> 权限是「管理功能上线」的开关依据：前端按钮的可用性由这些字段决定，**不需要前端单独写死逻辑**。

---

## 五、其他接口

### 5.1 GET /media/{id}

```json
{
  "code": 0,
  "message": "success",
  "data": { "media": { /* Media 对象 */ } }
}
```

也兼容 `data` 直接是 Media 对象，或 `data.photo`（旧命名）。

### 5.2 GET /photos/batch?ids=ph_0001,ph_0002

```json
{ "code": 0, "message": "success", "data": { "list": [ /* Media 对象 */ ] } }
```

### 5.3 GET /albums

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      { "id": "al_1", "name": "川西环线", "coverPhotoId": "ph_0001", "photoCount": 5 }
    ]
  }
}
```

### 5.4 GET /tags

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      { "id": "tag_1", "name": "风景", "photoCount": 8 }
    ]
  }
}
```

> `albums` / `tags` 若返回数组（`data` 直接为数组）前端同样兼容。

### 5.5 GET /file/{id} — 原始文件流（视频必需，支持 Range）

这是**视频能拖动进度条的前提**，务必实现。同一接口也用于图片，图片不强制要求 Range。

请求示例：

```http
GET /api/file/md_0002
Range: bytes=0-1023
```

正确响应：

```http
HTTP/1.1 206 Partial Content
Content-Type: video/mp4
Accept-Ranges: bytes
Content-Length: 1024
Content-Range: bytes 0-1023/971322
```

必须正确处理三种 Range 写法：

| 请求头 | 含义 | 正确响应 |
| --- | --- | --- |
| `bytes=0-1023` | 闭区间 | `Content-Range: bytes 0-1023/971322`，长度 1024 |
| `bytes=1000-` | 从 1000 到文件末尾 | `bytes 1000-971321/971322` |
| `bytes=-500` | **最后 500 字节**（后缀区间） | `bytes 970822-971321/971322`，长度 500 |

> **后缀区间 `bytes=-N` 是最容易实现错的一种**，也最关键：手机 / 相机拍的 MP4 常把 `moov` 索引放在文件尾部，浏览器必须先取到它才能播放。若把它当成 `bytes=0-N` 处理，这类视频会直接播放失败。
>
> 越界时返回 `416 Range Not Satisfiable` 并带 `Content-Range: bytes */971322`。

不带 Range 时按普通 `200` 返回整个文件，并始终带上 `Accept-Ranges: bytes`。

### 5.6 GET /media/{id}/download

直接返回文件流，建议带响应头：

```
Content-Type: video/mp4
Content-Length: 971322
Content-Disposition: attachment; filename*=UTF-8''VID_20261001_193000.mp4
```

前端会优先用响应头里的文件名，其次用 `media.downloadName`（标题优先于原始文件名，如「清晨的海边.jpg」）。

中文文件名请用 RFC 5987 编码（`filename*=UTF-8''<urlencoded>`），否则会乱码。

### 5.7 扫描接口（可选）

想让前端的「扫描目录」按钮可用时实现；不实现也没关系，按钮不会出现在工具栏。

```http
POST /api/scan
{ "roots": ["D:/素材"], "recursive": true, "thumbs": true }
→ 202 { "code": 0, "data": { "running": true, "startedAt": "..." } }
```

```http
GET /api/scan/status
→ 200 {
    "code": 0,
    "data": {
      "running": false,
      "startedAt": "...",
      "finishedAt": "...",
      "error": null,
      "logs": "[scan] 共 6 个文件…",
      "total": 6,
      "loadedAt": "...",
      "roots": ["D:/素材"]
    }
  }
```

前端以 700ms 间隔轮询直到 `running === false`，再刷新列表。

### 5.8 GET /sprite/{id} — 进度预览雪碧图

拖动 / 悬停进度条时想看到"那一刻的画面"。若靠实时 seek 会连发一串 Range 请求；
雪碧图把 N 帧拼成一张网格图，取格只是挪 `background-position` —— **零请求**。

```http
GET /api/sprite/md_9cf5eff23f
```

返回三种状态之一：

| state | 含义 | 前端行为 |
| --- | --- | --- |
| `ready` | 雪碧图已缓存 | 按 `cellWidth/cellHeight` 取格显示 |
| `generating` | 后台正在生成 | 先用实时取帧顶着，隔 2.5 秒再问一次（最多 3 次） |
| `unavailable` | 没装 ffmpeg / 非视频 | 永久走实时取帧，不再询问 |

`ready` 时的完整结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "state": "ready",
    "sprite": {
      "image": "/media-cache/9c/9cf5eff23f09e5aa.sprite.jpg",
      "cols": 10,
      "rows": 2,
      "count": 16,
      "interval": 0.5,
      "cellWidth": 160,
      "cellHeight": 284,
      "width": 1600,
      "height": 568
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `image` | 雪碧图地址，走 `/media-cache` 静态路由 |
| `cols` / `rows` | 网格列数 / 行数 |
| `count` | 实际有效格数（≤ `cols*rows`，末尾可能有空位） |
| `interval` | 相邻两帧的时间间隔（秒） |
| `cellWidth` / `cellHeight` | 单格像素尺寸 |
| `width` / `height` | 整张雪碧图的像素尺寸 |

前端取第 `i` 格：

```js
const index = Math.min(sprite.count - 1, Math.floor(time / sprite.interval))
const x = (index % sprite.cols) * sprite.cellWidth
const y = Math.floor(index / sprite.cols) * sprite.cellHeight
```

> **雪碧图按需生成**：扫描阶段完全不碰它。某个视频在查看器里首次被打开时才后台现做，做好缓存下来，之后再打开就是 `ready`。

### 5.9 GET /scan/stream — 扫描进度 SSE

轮询只能拿到 `running` 与日志，拿不到"第几个 / 共几个"。SSE 把逐文件进度推出来。

响应头：

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

事件共六级，**字段各不相同，刻意不合并**：

| event | 时机 | 关键字段 |
| --- | --- | --- |
| `snapshot` | 连接建立即推，无需等待 | `running`、`total`、`roots`、`progress` |
| `start` | 扫描进程已拉起 | `startedAt` |
| `begin` | 候选文件清点完毕 | `total`、`previous` |
| `progress` | 每处理完一个文件 | `current`、`total`、`file`、`reused`、`skipped` |
| `log` | 扫描进程每输出一行 | `text` |
| `summary` | 扫描自身统计完成 | `total`、`images`、`videos`、`thumbed`、`reused` |
| `done` | **进程真正退出** | `running`、`error`、`total`、`code` |

```
event: snapshot
data: {"running":false,"total":30,"roots":[".scan-demo"],"progress":null}

event: begin
data: {"phase":"begin","total":30,"previous":30}

event: progress
data: {"phase":"probing","current":7,"total":30,"file":"VID_EXTRA_0001.mp4","reused":false,"skipped":false}

event: summary
data: {"phase":"summary","total":30,"images":2,"videos":28,"thumbed":30,"reused":30,"durationMs":649}

event: done
data: {"running":false,"error":null,"total":30,"code":0}
```

**前端约定**

1. **先连上、再触发扫描**。反过来时小目录可能在连接就绪前就扫完，一帧进度都收不到。
2. 只在收到 `done` 时收尾刷新列表 —— 它带着退出码与最终错误，是唯一权威信号。
3. `onerror` 里**不要 close 也不要重试**：浏览器内置了自动重连，提前关掉反而丢事件；真正的失败交给调用方的超时逻辑判定。
4. 组件卸载时必须 `close()`，否则连接会一直挂着。

心跳为每 15 秒一行 `: ping` 注释帧，用于穿透会掐断长连接的中间代理。

**降级**：浏览器不支持 `EventSource` 时，`openScanStream()` 返回 `null`，前端自动退回 `GET /scan/status` 轮询。

### 5.10 PUT /media/{id}/meta — 写入 sidecar 元数据

把标题、描述、标签、相册、拍摄时间写回与源文件同目录的 `*.meta.json`。

```http
PUT /api/media/md_3ecb9b87fe/meta
Content-Type: application/json

{ "title": "清晨的海边", "tags": ["海景", "清晨"] }
```

```json
{ "code": 0, "message": "success", "data": { "media": { /* 更新后的 Media 对象 */ } } }
```

**只允许这五个字段**，其余一律丢弃：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 标题，留空则用文件名 |
| `description` | string | 描述 / 备注 |
| `tags` | string[] | 标签，去重后最多 50 个 |
| `album` | string | 相册名，留空则用所在目录名 |
| `takenAt` | string(ISO) | 拍摄时间 |

**合并策略**：只覆盖请求里出现的字段，没提到的原样保留——**包括人工写进文件的自定义字段**（比如 `customField`）。所以"只改标签"不会冲掉标题。字段白名单同时挡住了原型污染。

响应码：

| 情况 | 响应 |
| --- | --- |
| 成功 | `200` + 更新后的 media |
| 请求体不是合法 JSON | `400`（code `40001`） |
| id 不存在 | `404` |
| 方法不是 PUT / PATCH | `405` |

> 命令行等价操作：`npm run media:meta -- --file "D:/素材/travel/IMG_0042.jpg" --title "清晨的海边" --add-tag 夕阳`
>
> 若后端提供 `PATCH /photos/{id}`，前端的 `httpSource.updateMeta()` 会优先走它（见 §5.11 预留接口）。

### 5.11 预留接口（本期不调用）

```http
POST   /photos            multipart/form-data: files[], albumId   → 201 { code, data: { list: Media[] } }
PATCH  /photos/{id}       { "title": "新标题", "description": "", "tags": [] }  → 200 { code, data: { photo: Media } }
DELETE /photos/{id}       → 200 { code, data: { id } }
POST   /photos/batch-delete  { "ids": ["ph_0001"] } → 200 { code, data: { deleted: 1 } }
```

前端对应实现位置：`src/api/sources/httpSource.js` 中已预留同名方法（当前抛出 `501`）。

---

## 六、对接步骤（后端同学看这里）

1. 按本文实现 `GET /api/media`，返回上文信封结构；字段可先给最小集（`id` / `kind` / `urls.thumb` / `urls.full`），其余字段缺失不影响页面运行。
2. **如果要支持视频**，额外实现 `GET /api/file/{id}` 并支持 Range（§5.5）—— 这是视频能拖动进度条的前提。
3. 前端把 `.env` 的 `VITE_DATA_SOURCE` 改为 `api`，`VITE_API_BASE_URL` 改为你的接口地址（若跨域，配置 `vite.config.js` 的 `server.proxy`，或在网关层做反向代理 / 开启 CORS，并放行 `Range` 头）。
4. 启动 `npm run dev`，右上角徽标变为「HTTP 接口」即表示已走真实链路。
5. 需要鉴权时配置 `VITE_API_TOKEN`；生产环境建议改为登录态 Cookie 并在 `src/api/http.js` 里补 `credentials` 设置。

**联调自检清单**

通用：

- [ ] `code` 为 0，`data.list` 为数组（空列表时返回 `[]` 而非 `null`）
- [ ] 每条至少有一个可用 `urls` 地址，且文件能跨域访问（下载需要 `Access-Control-Allow-Origin`）
- [ ] `pagination.total` 正确，否则分页控件页码会异常
- [ ] 时间字段为 ISO 8601 字符串
- [ ] `sort=takenAt&order=desc` 生效（默认排序）

视频专项：

- [ ] 视频项返回了 `kind: "video"`（或 `mimeType` 为 `video/mp4`）
- [ ] `urls.poster` 有值时卡片显示封面；**没有值时保持为空，不要填成 MP4 地址**
- [ ] `GET /api/file/{id}` 支持 Range，`bytes=0-N` 返回 **206** 且 `Content-Range` 正确
- [ ] **后缀区间 `bytes=-500` 返回的是最后 500 字节**（不是开头 500 字节）
- [ ] 接口返回 `Accept-Ranges: bytes`
- [ ] 编码为 H.264 的 MP4 能真正播放并拖动进度条
- [ ] 竖拍视频返回容器原始宽高 + `video.rotation`，不要自行交换

---

## 七、字段容错与别名

前端适配层 `src/model/media.js` 对常见命名做了兼容，后端沿用自家规范一般无需改造：

| 语义 | 可识别的字段名（按顺序取第一个非空） |
| --- | --- |
| ID | `id` / `mediaId` / `photoId` / `photo_id` / `uid` |
| 类型 | `kind` / `mediaType` / `media_type`（值也认 `image` / `photo` / `picture` / `img` 与 `video` / `clip` / `movie` / `film`） |
| 体积 | `size` / `byteSize` / `fileSize` |
| 宽度 | `width` / `imageWidth` / `pixelWidth` |
| 文件名 | `fileName` / `file_name` / `name` / `filename` |
| 拍摄时间 | `takenAt` / `shootTime` / `shotAt` / `taken_at` |
| 上传时间 | `createdAt` / `createTime` / `created_at` / `uploadedAt` |
| 缩略图 | `urls.thumb` / `thumbUrl` / `thumbnail` |
| 视频封面 | `urls.poster` / `posterUrl` / `cover` / `coverUrl` |
| 原图 / 播放源 | `urls.full` / `fullUrl` / `original` / `raw` / `src` |
| 时长 | `video.duration` / `durationSec` / `durationSeconds` / `length` |
| 视频编码 | `video.codec` / `codecName` / `videoCodec` / `codec_name` |
| 音轨编码 | `video.audioCodec` / `audio_codec` / `audioCodecName` |
| 码率 | `video.bitrate` / `bit_rate` / `bitRate` |
| 帧率 | `video.frameRate` / `fps` / `r_frame_rate` / `avgFrameRate` |
| 旋转 | `video.rotation` / `rotate` / `rotationMeta` |
| 标签 | `tags`（数组）或 `labels`，也支持逗号分隔字符串 |
| 相册 | `album` / `folder` |
| 上传者 | `author` / `uploader` |
| 权限 | `permissions` 对象，或平铺的 `canDownload` 等字段 |

其余规则：

- 相对路径地址会自动补全为绝对地址（以 `window.location.origin` 为基准）。
- 视频专属字段既可以放在 `video` 子对象里，也可以平铺在顶层，两者都认（**子对象优先**）。
- `list` 也兼容 `items` / `records`；`pagination` 兼容 `pager`，`total` 兼容 `totalCount`，`totalPages` 兼容 `pageCount`。
- `id` 为空或数据不是对象时，该条会被跳过并记录，不会导致整页崩溃。
- 原始报文会挂在 `media.raw` 上，自定义字段可从这里取，无需改适配层。

---

## 八、参考实现

目前有三个服务实现了本文契约，任选其一即可驱动前端，彼此可以互相替换。

### 8.1 Mock 后端（演示数据，Node）

```bash
npm run mock:api
curl "http://127.0.0.1:8787/api/photos?page=1&pageSize=2"
curl "http://127.0.0.1:8787/api/media?kind=video"
```

数据源为 `src/mock/photos.js`，与浏览器内 mock 共用同一份，保证两种方式行为一致。

### 8.2 媒体服务（真实文件 + Range + 扫描，Node）

```bash
npm run scan -- --roots "D:/素材"
npm run media:serve
curl "http://127.0.0.1:8788/api/media?kind=video"
curl -H "Range: bytes=0-1023" -i "http://127.0.0.1:8788/api/file/md_xxx"
```

它是零依赖的 Node 原生 http 实现，包含本文全部视频相关约定，包括 §5.5 的 Range 处理，可直接照抄。

### 8.3 album-backend（正式后端，Python + FastAPI）

独立的同级项目，实现了本文**全部**接口（含 §5.8 雪碧图、§5.9 SSE、§5.10 元数据写入），
并提供 Swagger 与 OpenAPI 用于第三方对接：

```bash
cd album-backend
python -m app                                   # http://127.0.0.1:8791
curl "http://127.0.0.1:8791/api/media?kind=video"
curl -H "Range: bytes=-500" -i "http://127.0.0.1:8791/api/file/md_xxx"
```

详细信息见 `album-backend/README.md`。

### 换后端的唯一门槛：跑过契约测试

`album-backend/tests/contract/` 是一套**黑盒**契约测试——只发 HTTP 请求，不依赖任何实现代码。
因此它天然可以用来检验任意一个后端实现（包括你正在写的那个）：

```bash
cd album-backend
ALBUM_CONTRACT_BASE=http://127.0.0.1:8791/api pytest tests/contract -v
```

把 `--base-url` 换成你的服务地址即可。57 条断言覆盖本文的关键约定，尤其是这几条最容易踩的：

- Range 三种写法，特别是后缀区间 `bytes=-N` 必须返回文件**尾部**
- 越界返回 416 且带 `Content-Range: bytes */size`
- 视频没有封面时 `urls.thumb/poster` 必须为空，不得回退成 MP4
- 竖拍视频返回容器原始宽高 + `video.rotation`，不要自行交换
- 元数据写入只覆盖传入字段，自定义字段必须保留
- 路径穿越（含编码后的 `%2e%2e%2f`）必须被拦截

跑过了，前端就能直接用；跑不过的条目，改的就是后端而不是前端。
