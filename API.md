# 照片列表 API 对接文档

> 本文定义的 JSON 结构即为前端 `src/model/photo.js` 消费的契约。后端按此实现即可直接对接；若字段名需要调整，见文末「字段容错与别名」。

---

## 一、通用约定

### 1.1 基础信息

| 项目 | 约定 |
| --- | --- |
| 基础路径 | 由前端 `VITE_API_BASE_URL` 决定，默认 `/api` |
| 请求方式 | 列表 / 详情类全部 `GET` |
| 编码 | `application/json; charset=utf-8` |
| 鉴权 | 可选。若配置 `VITE_API_TOKEN`，前端发送 `Authorization: Bearer <token>` |
| 时间格式 | ISO 8601 字符串，建议带时区，如 `2026-09-28T10:00:00+08:00` |
| 跨域 | 若前后端不同域，需开启 CORS 并允许 `Authorization` 头 |

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
| GET | `/photos` | 分页查询照片列表 | **必须实现** |
| GET | `/photos/{id}` | 单张照片详情 | 必须实现 |
| GET | `/photos/batch?ids=a,b,c` | 批量查询详情 | 可选 |
| GET | `/albums` | 相册列表（工具栏筛选） | 可选（不提供则筛选器为空） |
| GET | `/tags` | 标签列表（工具栏筛选） | 可选 |
| GET | `/photos/{id}/download` | 下载接口（可带 `Content-Disposition`） | 可选（有则体验更好） |
| POST | `/photos` | 上传 | 预留 |
| PATCH | `/photos/{id}` | 重命名 / 修改信息 | 预留 |
| DELETE | `/photos/{id}` | 删除 | 预留 |
| POST | `/photos/batch-delete` | 批量删除 | 预留 |

---

## 三、GET /photos — 照片列表

### 3.1 请求参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | int | 否 | 1 | 页码，从 1 开始 |
| `pageSize` | int | 否 | 20 | 每页条数，建议上限 100 |
| `keyword` | string | 否 | 空 | 模糊搜索：标题 / 文件名 / 描述 / 标签 / 作者 / 相册名 |
| `albumId` | string | 否 | 空 | 按相册筛选 |
| `tag` | string | 否 | 空 | 按单个标签筛选 |
| `sort` | string | 否 | `takenAt` | 排序字段：`takenAt` / `createdAt` / `fileName` / `size` / `width` |
| `order` | string | 否 | `desc` | `asc` / `desc` |
| `dateFrom` | string | 否 | 空 | 拍摄时间起（`YYYY-MM-DD`），预留 |
| `dateTo` | string | 否 | 空 | 拍摄时间止（`YYYY-MM-DD`），预留 |

空值参数不会出现在请求里（前端会过滤空串）。

### 3.2 响应示例

```json
{
  "code": 0,
  "message": "success",
  "traceId": "srv-7f31a2",
  "data": {
    "list": [
      {
        "id": "ph_0001",
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
        "urls": {
          "thumb": "https://cdn.example.com/ph_0001_thumb.jpg",
          "regular": "https://cdn.example.com/ph_0001_1080.jpg",
          "full": "https://cdn.example.com/ph_0001.jpg",
          "download": "https://cdn.example.com/ph_0001.jpg?attname=%E6%99%A8%E9%9B%BE%E4%B8%AD%E7%9A%84%E5%B1%B1%E8%B0%B7.jpg",
          "page": "https://example.com/photos/ph_0001"
        },
        "permissions": {
          "canView": true,
          "canDownload": true,
          "canEdit": false,
          "canDelete": false,
          "canShare": false
        }
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

## 四、Photo 对象字段字典

### 4.1 必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识，全站唯一。**缺失则该条数据被丢弃** |
| `urls` | object | 图片地址集合，至少提供一个可用地址 |

### 4.2 基础信息

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 照片标题；为空时前端回退用文件名 |
| `description` | string | 描述 / 备注 |
| `fileName` | string | 原始文件名，含扩展名 |
| `mimeType` | string | 如 `image/jpeg`、`image/png`、`image/webp` |

### 4.3 尺寸与体积

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `width` / `height` | int | 原图像素宽高。用于计算分辨率、像素数、查看器自适应缩放 |
| `thumbWidth` / `thumbHeight` | int | 缩略图像素宽高，用于占位避免布局抖动；缺省则用 `width/height` 推算比例 |
| `size` | int | 文件字节数。前端会格式化为 `KB / MB`，并支持按大小排序 |
| `dominantColor` | string | 主色调（`#RRGGBB`），用作图片加载前的占位底色。缺省用浅灰 |

### 4.4 地址集合 `urls`

| 字段 | 建议规格 | 用途 |
| --- | --- | --- |
| `thumb` | 长边 400–600 | 网格缩略图、表格小图、底部胶片条 |
| `regular` | 长边 1080–1600 | 查看器首屏快速出图、相邻图预加载 |
| `full` | 原图 | 查看器放大查看、下载兜底 |
| `download` | 原图 + `Content-Disposition` | 下载专用地址（可带签名）；缺省回退到 `full` |
| `page` | 页面 URL | 详情页链接，预留 |

> 降级规则：任一档缺省时，前端按 `full → regular → thumb` 顺序回退，不会显示空白。
> 建议至少提供 `thumb` 与 `full`。

### 4.5 时间

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `takenAt` | string(ISO) | 拍摄时间（EXIF）。列表默认按此排序 |
| `createdAt` | string(ISO) | 上传时间 |
| `updatedAt` | string(ISO) | 更新时间 |

> 若 `takenAt` 缺失，前端会依次回退 `createdAt` → 从文件名（如 `IMG_20260928_100000.jpg`）解析。

### 4.6 组织维度

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tags` | string[] | 标签，列表展示最多 3 个，超出折叠为 `+N` |
| `album` | object | `{ id, name }`，工具栏相册筛选的数据来源 |
| `author` | object | `{ id, name, avatar? }`，上传者 |
| `location` | object | `{ name?, latitude?, longitude? }`，拍摄地点 |

### 4.7 EXIF `exif`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `camera` | string | 相机型号 |
| `lens` | string | 镜头型号 |
| `iso` | int | 感光度 |
| `fNumber` | number | 光圈值，如 `2.8` → 展示 `f/2.8` |
| `exposureTime` | string \| number | 快门。字符串 `1/250`、`8s` 原样展示；数字按秒换算 |
| `focalLength` | string \| number | 焦距，如 `35mm` 或 `35` |
| `software` | string | 后期软件 |

### 4.8 权限 `permissions`

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

### 5.1 GET /photos/{id}

```json
{
  "code": 0,
  "message": "success",
  "data": { "photo": { /* Photo 对象 */ } }
}
```

也兼容 `data` 直接是 Photo 对象。

### 5.2 GET /photos/batch?ids=ph_0001,ph_0002

```json
{ "code": 0, "message": "success", "data": { "list": [ /* Photo 对象 */ ] } }
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

### 5.5 GET /photos/{id}/download

直接返回文件流，建议带响应头：

```
Content-Type: image/jpeg
Content-Length: 28582275
Content-Disposition: attachment; filename="晨雾中的山谷.jpg"; filename*=UTF-8''%E6%99%A8%E9%9B%BE...
```

前端会优先用响应头里的文件名，其次用 `photo.downloadName`。

### 5.6 预留接口（本期不调用）

```http
POST   /photos            multipart/form-data: files[], albumId   → 201 { code, data: { list: Photo[] } }
PATCH  /photos/{id}       { "title": "新标题", "description": "", "tags": [] }  → 200 { code, data: { photo: Photo } }
DELETE /photos/{id}       → 200 { code, data: { id } }
POST   /photos/batch-delete  { "ids": ["ph_0001"] } → 200 { code, data: { deleted: 1 } }
```

前端对应实现位置：`src/api/sources/httpSource.js` 中已预留同名方法（当前抛出 `501`）。

---

## 六、对接步骤（后端同学看这里）

1. 按本文实现 `GET /api/photos`，返回上文信封结构；字段可先给最小集（`id` / `urls.thumb` / `urls.full`），其余字段缺失不影响页面运行。
2. 前端把 `.env` 的 `VITE_DATA_SOURCE` 改为 `api`，`VITE_API_BASE_URL` 改为你的接口地址（若跨域，配置 `vite.config.js` 的 `server.proxy`，或在网关层做反向代理 / 开启 CORS）。
3. 启动 `npm run dev`，右上角徽标变为「HTTP 接口」即表示已走真实链路。
4. 需要鉴权时配置 `VITE_API_TOKEN`；生产环境建议改为登录态 Cookie 并在 `src/api/http.js` 里补 `credentials` 设置。

**联调自检清单**

- [ ] `code` 为 0，`data.list` 为数组（空列表时返回 `[]` 而非 `null`）
- [ ] 每条至少有一个可用 `urls` 地址，且图片能跨域访问（下载需要 `Access-Control-Allow-Origin`）
- [ ] `pagination.total` 正确，否则分页控件页码会异常
- [ ] 时间字段为 ISO 8601 字符串
- [ ] `sort=takenAt&order=desc` 生效（默认排序）

---

## 七、字段容错与别名

前端适配层 `src/model/photo.js` 对常见命名做了兼容，后端沿用自家规范一般无需改造：

| 语义 | 可识别的字段名（按顺序取第一个非空） |
| --- | --- |
| ID | `id` / `photoId` / `photo_id` / `uid` |
| 体积 | `size` / `byteSize` / `fileSize` |
| 宽度 | `width` / `imageWidth` / `pixelWidth` |
| 文件名 | `fileName` / `file_name` / `name` / `filename` |
| 拍摄时间 | `takenAt` / `shootTime` / `shotAt` / `taken_at` |
| 上传时间 | `createdAt` / `createTime` / `created_at` / `uploadedAt` |
| 缩略图 | `urls.thumb` / `thumbUrl` / `thumbnail` |
| 原图 | `urls.full` / `fullUrl` / `original` / `raw` / `src` |
| 标签 | `tags`（数组）或 `labels`，也支持逗号分隔字符串 |
| 相册 | `album` / `folder` |
| 上传者 | `author` / `uploader` |
| 权限 | `permissions` 对象，或平铺的 `canDownload` 等字段 |

其余规则：

- 相对路径地址会自动补全为绝对地址（以 `window.location.origin` 为基准）。
- `list` 也兼容 `items` / `records`；`pagination` 兼容 `pager`，`total` 兼容 `totalCount`，`totalPages` 兼容 `pageCount`。
- `id` 为空或数据不是对象时，该条会被跳过并记录，不会导致整页崩溃。
- 原始报文会挂在 `photo.raw` 上，自定义字段可从这里取，无需改适配层。

---

## 八、Mock 后端

项目内置一个零依赖的 Node Mock 服务（`mock/server.mjs`），返回值严格遵循本文契约，可直接作为后端的实现参考：

```bash
npm run mock:api
curl http://127.0.0.1:8787/api/photos?page=1&pageSize=2
```

数据源为 `src/mock/photos.js`，与浏览器内 mock 共用同一份，保证两种方式行为一致。
