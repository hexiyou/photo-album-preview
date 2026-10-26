# 在线相册预览程序

基于 **Vue 3 + Vite** 的在线相册预览前端。当前版本聚焦「浏览与查看」链路，上传 / 重命名 / 删除等管理能力已在架构上预留好位置，后端接口就绪后可低成本接入。

---

## 一、当前能力

| 能力 | 说明 |
| --- | --- |
| 缩略图网格 | 自适应列宽网格，懒加载、主色占位、加载失败兜底，悬浮显示文件名 / 分辨率 / 体积与快捷按钮 |
| 详细记录模式 | 一行一条记录，含预览图、文件名、标题、相册、标签、尺寸、大小、拍摄时间、上传者；表头可排序 |
| 大图查看 | 全屏查看器：上一张 / 下一张、滚轮以光标为锚点缩放、拖拽平移、双击 1x↔2.5x |
| 翻转与旋转 | 左转 90° / 右转 90° / 水平翻转 / 垂直翻转 / 一键复位，旋转后自动重新适配容器 |
| 下载照片 | Blob 流式下载（带百分比进度），失败自动降级为浏览器原生下载，文件名自动补扩展名 |
| 搜索 / 筛选 / 排序 | 关键词、相册、标签三维筛选；按拍摄时间 / 上传时间 / 文件名 / 大小 / 分辨率排序，升降序切换 |
| 元信息面板 | 文件信息、拍摄参数（相机 / 镜头 / 焦距 / 光圈 / ISO）、组织信息（相册 / 上传者 / 地点 / 标签） |
| 缩略图导航条 | 查看器底部胶片条，当前项高亮并自动居中滚动 |
| URL 直达 | `?view=table` 指定视图，`?photo=ph_0003` 直接打开某张照片，状态回写到地址栏可分享 |
| 明 / 暗主题 | 右上角一键切换，偏好写入 `localStorage` 持久化，刷新自动恢复；未手动选择过时跟随系统偏好 |

**键盘快捷键（查看器内）**

| 按键 | 作用 | 按键 | 作用 |
| --- | --- | --- | --- |
| `←` / `→` | 上一张 / 下一张 | `+` / `-` | 放大 / 缩小 |
| `↑` / `↓` | 放大 / 缩小 | `0` | 复位 |
| `R` | 向右旋转 90° | `I` | 显示 / 隐藏信息面板 |
| `D` | 下载当前照片 | `Esc` | 关闭查看器 |

---

## 二、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 生成演示用的占位图（SVG，离线可用，约 500KB）
npm run gen:mock

# 3. 启动开发服务（默认使用内置 Mock 数据）
npm run dev
# → http://127.0.0.1:5173
```

其他命令：

```bash
npm run build     # 生产构建，输出到 dist/
npm run preview   # 预览构建产物
npm run mock:api  # 启动本地 Mock 后端（端口 8787），用于验证真实 HTTP 链路
```

### 主题（明 / 暗）

- 点击右上角主题按钮在明暗之间切换，偏好存入 `localStorage`（键名 `photo-album:theme`，取值 `light` / `dark`），下次打开自动应用。
- 从未手动切换过时**跟随系统**（`prefers-color-scheme`），且系统主题变化时页面实时跟随；一旦手动选择过，就以用户选择为准。
- 主题只影响 `src/styles/global.css` 里的设计令牌（`[data-theme='dark']` 覆盖一组 CSS 变量），组件样式**不写死颜色**，因此新增组件默认支持双主题。
- 首屏无闪烁：`index.html` 里的内联脚本在样式生效前就给 `<html>` 打上 `data-theme`。
- 需要新增可调色的元素时，请先复用现有令牌；确有必要再加新变量时，**明暗两套一起加**。

### 演示数据说明

- 24 张照片，跨 5 个相册 / 27 个标签，日期、机型、EXIF、体积均随机生成但**结果稳定**（伪随机种子固定）。
- 图片为脚本生成的 SVG 占位图（`public/mock/photos/` 下每张三档尺寸：缩略图 480 / 常规 1200 / 原图 2400），**不依赖外网**。
- 若要换成真实图床，只需改 `src/mock/photos.js` 里的 `urls` 字段即可，前端其余部分无需改动。

---

## 三、两种数据源与切换方式

前端所有数据都通过 `src/api/photoApi.js` 这一门面获取，它背后有两个数据源实现，对外暴露完全一致的接口：

```
组件 ──► photoApi ──► mockSource  （浏览器内假数据，默认）
                 └──► httpSource  （真实 HTTP 接口）
```

**切换方式（二选一）**

1. 改 `.env`：`VITE_DATA_SOURCE=api`
2. 启动指定环境文件：`npx vite --mode api`（读取 `.env.api`）

右上角徽标会实时显示当前数据源：<span>🟢 HTTP 接口</span> / 🟡 Mock 数据。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `mock` | `mock` 内置假数据 / `api` 真实接口 |
| `VITE_API_BASE_URL` | `/api` | 接口基础路径 |
| `VITE_MOCK_SERVER_URL` | `http://127.0.0.1:8787` | vite dev 代理目标（仅本地联调用） |
| `VITE_API_TOKEN` | 空 | 会以 `Authorization: Bearer <token>` 发送 |
| `VITE_REQUEST_TIMEOUT` | `15000` | 请求超时（毫秒） |
| `VITE_MOCK_DELAY` | `320` | mock 模式模拟网络延迟（毫秒） |

### 用本地 Mock 后端跑通 HTTP 链路

```bash
npm run mock:api     # 终端 1：http://127.0.0.1:8787
npx vite --mode api  # 终端 2：http://127.0.0.1:5173（.env.api 已设为 api）
```

`vite.config.js` 已配置 `/api` → `127.0.0.1:8787` 的代理；接真实后端时把代理 target 改成你的服务地址即可。

---

## 四、目录结构

```
photo-album-preview/
├── index.html
├── vite.config.js              # dev 代理 / 别名 / 构建配置
├── .env / .env.api             # 环境变量（mock / api 两套）
├── mock/
│   └── server.mjs              # 本地 Mock 后端（Node 原生 http，零依赖）
├── scripts/
│   └── gen-mock-images.mjs     # 生成 SVG 占位图
├── public/mock/                # 生成的演示图片与头像
└── src/
    ├── main.js / App.vue       # 入口与应用外壳
    ├── env.js                  # 运行时配置收口（不散落 import.meta.env）
    ├── config/album.config.js  # ★ 功能开关（上传/重命名/删除等）
    ├── model/photo.js          # ★ 服务端 JSON → Photo 领域模型的适配层
    ├── api/
    │   ├── http.js             # fetch 封装：超时 / 鉴权 / 统一错误
    │   ├── photoApi.js         # ★ 数据门面（mock / api 自动切换）
    │   └── sources/
    │       ├── mockSource.js   # 浏览器内假数据（含分页筛选排序）
    │       └── httpSource.js   # 真实接口实现
    ├── mock/photos.js          # 假数据（严格遵循服务端 JSON 格式）
    ├── stores/usePhotoStore.js # 全局状态（列表 / 查询 / 查看器 / 多选）
    ├── composables/
    │   ├── usePhotoActions.js  # ★ 操作注册表（下载 / 上传 / 重命名 / 删除）
    │   ├── useTheme.js         # ★ 明暗主题（读取/写入 localStorage，跟随系统）
    │   └── useToast.js
    ├── utils/
    │   ├── download.js         # 下载（进度、降级、文件名清洗）
    │   ├── viewer-transform.js # 缩放 / 旋转 / 翻转 / 平移的几何计算
    │   └── format.js           # 字节、时间、EXIF 格式化
    ├── components/
    │   ├── AlbumToolbar.vue    # 搜索 / 筛选 / 排序 / 视图切换
    │   ├── PhotoGrid.vue + PhotoCard.vue
    │   ├── PhotoTable.vue      # 详细记录模式
    │   ├── PhotoViewer.vue     # 大图查看器
    │   ├── PaginationBar.vue / StatePlaceholder.vue / ThemeToggle.vue / ToastHost.vue / AppIcon.vue
    │   └── styles/global.css
```

---

## 五、数据契约

完整 JSON 格式、字段字典、错误码与对接说明见 **[API.md](./API.md)**。

最简形态：

```jsonc
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "ph_0001",
        "title": "晨雾中的山谷",
        "fileName": "IMG_20260928_100000.jpg",
        "size": 28582275,
        "width": 6720,
        "height": 4480,
        "takenAt": "2026-09-28T10:00:00+08:00",
        "tags": ["风景", "日出"],
        "album": { "id": "al_1", "name": "川西环线" },
        "exif": { "camera": "Canon EOS R6", "iso": 400 },
        "urls": {
          "thumb": "https://cdn.example.com/ph_0001_thumb.jpg",
          "regular": "https://cdn.example.com/ph_0001_1080.jpg",
          "full": "https://cdn.example.com/ph_0001.jpg",
          "download": "https://cdn.example.com/ph_0001?attname=..."
        },
        "permissions": { "canView": true, "canDownload": true, "canEdit": false, "canDelete": false }
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 24, "totalPages": 2, "hasMore": true }
  }
}
```

**字段容错**：前端适配层 `src/model/photo.js` 支持常见别名（`size` / `byteSize` / `fileSize` 互通，`takenAt` / `shootTime` 互通，`urls.thumb` / `thumbUrl` / `thumbnail` 互通等），后端字段命名不必与示例完全一致；全部缺省字段都有兜底，缺失字段不会导致页面报错。

---

## 六、拓展指南（后续接入管理功能）

### 6.1 打开功能开关

编辑 `src/config/album.config.js`：

```js
upload: true,    // 上传
rename: true,    // 重命名
delete: true,    // 删除
selection: true, // 多选（批量操作依赖）
```

也可以用 URL 参数临时开启，方便联调演示：

```
http://127.0.0.1:5173/?feat.upload=1&feat.delete=1&feat.selection=1
```

### 6.2 三步接入一个新能力（以「删除」为例）

1. **接口层**：在 `src/api/sources/httpSource.js` 实现 `deletePhotos(ids)`，替换掉 `throw new ApiError(...)` 占位；
2. **动作层**：在 `src/composables/usePhotoActions.js` 里把 `delete` 动作的 `run()` 换成真实调用（可加二次确认、可加 `context.refresh()` 刷新列表）；
3. **开关层**：`features.delete = true`。

工具栏、卡片悬浮菜单、查看器都会自动出现对应按钮 —— 因为三处 UI 都是遍历动作注册表渲染的，不需要改组件。

### 6.3 其他常见拓展点

| 想做什么 | 改哪里 |
| --- | --- |
| 后端字段改名 / 新增字段（如「收藏状态」） | `src/model/photo.js` 的 `adaptPhoto()`，加字段与派生值 |
| 增加筛选维度（如日期区间、作者） | `src/api/sources/httpSource.js` 拼参数 + `AlbumToolbar.vue` 加控件 + store 的 `query` |
| 增加第三种视图（如时间轴） | 新建 `components/PhotoTimeline.vue`，在 `App.vue` 的 `viewMode` 分支与工具栏分段控件里加一项 |
| 换 UI 组件库（Element Plus 等） | 只影响 `src/components/**`，store / api / model 三层无需改动 |
| 换成 Pinia / 服务端状态管理 | 替换 `src/stores/usePhotoStore.js`，导出同名 API 即可 |
| 服务端下发配置（不再用 .env） | 改 `src/env.js` 一处即可 |
| 加第三种主题（如「护眼」「高对比」） | 在 `styles/global.css` 增一组 `[data-theme='xxx']` 令牌，再在 `useTheme.js` 的取值里加一个选项 |

---

## 七、注意事项

- **跨域下载**：下载走 `fetch → Blob`，图片服务需允许跨域（`Access-Control-Allow-Origin`）才能拿到进度；不允许时会自动降级为浏览器原生下载（此时文件名可能由浏览器决定）。建议后端提供带 `Content-Disposition: attachment; filename=...` 的 `urls.download` 地址。
- **图片尺寸建议**：`thumb` 长边 400–600（列表用），`regular` 长边 1080–1600（查看器首屏，加载快），`full` 原图（放大与下载用）。查看器优先加载 `full`。
- **鉴权**：图片若需要鉴权，建议 `urls` 返回带签名的临时 URL（如对象存储预签名地址），前端不参与密钥管理。
- **分页上限**：前端默认每页 20 条，后端 `pageSize` 建议限制在 100 以内。
- **浏览器支持**：面向现代浏览器（Chrome / Edge / Firefox / Safari 近两年版本），使用了 `aspect-ratio`、`ResizeObserver`、`Intersection` 无关的原生懒加载。

---

## 八、技术栈

- Vue 3（`<script setup>` + Composition API）
- Vite 8（开发服务 + 生产构建）
- 零 UI 框架 / 零状态库 / 零 HTTP 库依赖，运行时依赖只有 `vue`
