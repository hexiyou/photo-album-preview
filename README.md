# 在线相册预览程序

基于 **Vue 3 + Vite** 的在线相册预览前端，同时管理**图片与视频**两类素材。

浏览与查看是主线（图片为主、视频为辅），**上传 / 重命名 / 删除**也已实现 ——
它们靠后端返回的 `permissions` 字段决定是否显示入口，后端不提供就自动隐藏，
不会出现在界面上干扰纯浏览场景。契约见 [API.md §5.11–§5.14](./API.md)。

设计取向是**以图片为主、视频为辅**：两者共用分组、标签、筛选、排序等能力，各自的专属属性（图片的 EXIF、视频的时长码率）互不污染，详情见 [API.md](./API.md)。

---

## 一、当前能力

| 能力 | 说明 |
| --- | --- |
| 缩略图网格 | 自适应列宽网格，懒加载、主色占位、加载失败兜底，悬浮显示文件名 / 分辨率 / 体积与快捷按钮 |
| 详细记录模式 | 一行一条记录，含预览图、文件名、标题、类型、相册、标签、尺寸、**时长**、大小、拍摄时间、上传者；表头可排序 |
| 大图查看 | 全屏查看器：上一张 / 下一张、滚轮以光标为锚点缩放、拖拽平移、双击 1x↔2.5x |
| 翻转与旋转 | 左转 90° / 右转 90° / 水平翻转 / 垂直翻转 / 一键复位，旋转后自动重新适配容器（仅图片） |
| 视频播放 | 点击卡片才加载播放：播放 / 暂停、进度条拖动、±5s、音量、倍速、画中画、全屏 |
| 悬停静音预览 | 鼠标停在视频卡片上 400ms 后就地静音循环播放，移开立即释放解码资源；全局同时只允许一个预览。工具栏有总开关，偏好存 `localStorage` |
| 进度预览 | 悬停 / 拖动进度条时显示那一刻的画面：有雪碧图就取格（零请求），没有就实时取帧兜底 |
| 下载 | 图片视频统一，Blob 流式下载（带百分比进度），失败自动降级为浏览器原生下载，文件名自动补扩展名 |
| 搜索 / 筛选 / 排序 | 关键词、相册、标签三维筛选，外加**类型筛选**（全部 / 图片 / 视频）；按拍摄时间 / 上传时间 / 文件名 / 大小 / 分辨率 / **时长**排序，升降序切换 |
| 元信息面板 | 图片：文件信息 / 拍摄参数 / 组织信息；视频：文件信息 / 视频信息（编码、码率、帧率、旋转、音轨）/ 组织信息 |
| 缩略图导航条 | 查看器底部胶片条，当前项高亮并自动居中滚动，视频项带时长角标 |
| 扫描本地目录 | 把硬盘上的图片 / 视频扫描入库，自动生成缩略图与时长；支持 sidecar 元数据、增量扫描 |
| 上传 | 工具栏一键上传图片 / 视频，落盘后**立即出现在列表**（无需再扫描）；支持一次多文件，单个失败不影响其他 |
| 重命名 | 查看器信息面板里改磁盘文件名。后端 id 由路径派生、改名必然换 id，前端会**就地替换**这一条，滚动位置与选中态都不丢 |
| 删除 | 单条删除 / 批量删除（批量需开启多选），操作前有二次确认。默认进**后端回收站**而不是真删 |
| 回收站还原 | 工具栏可打开回收站，看到被删文件的原位置，勾选后一键送回原处（id 也回到原值） |
| HEIC 预览 | 手机拍的 HEIC 浏览器打不开，后端转码成 JPEG 放进 `urls.preview`，大图查看优先用它；下载仍是原始 HEIC |
| 拍摄参数 | 后端读 EXIF 后自动展示相机 / 镜头 / ISO / 光圈 / 快门 / 焦距，并按 EXIF 时间排序（比文件修改时间准） |
| URL 直达 | `?view=table` 指定视图，`?photo=ph_0003` 打开某张图片，`?kind=video` 只看视频，状态回写到地址栏可分享 |
| 明 / 暗主题 | 右上角一键切换，偏好写入 `localStorage` 持久化，刷新自动恢复；未手动选择过时跟随系统偏好 |

**键盘快捷键（查看器内 · 图片）**

| 按键 | 作用 | 按键 | 作用 |
| --- | --- | --- | --- |
| `←` / `→` | 上一张 / 下一张 | `+` / `-` | 放大 / 缩小 |
| `↑` / `↓` | 放大 / 缩小 | `0` | 复位 |
| `R` | 向右旋转 90° | `I` | 显示 / 隐藏信息面板 |
| `D` | 下载当前照片 | `Esc` | 关闭查看器 |

**键盘快捷键（查看器内 · 视频）**

视频下 `←` `→` 让位给快退 / 快进，切换素材改用 `PageUp` / `PageDown`：

| 按键 | 作用 | 按键 | 作用 |
| --- | --- | --- | --- |
| `空格` | 播放 / 暂停 | `M` | 静音切换 |
| `←` / `→` | 快退 / 快进 5 秒 | `F` | 全屏 |
| `PageUp` / `PageDown` | 上一个 / 下一个 | `D` | 下载当前视频 |
| `I` | 显示 / 隐藏信息面板 | `Esc` | 关闭查看器 |

---

## 二、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 生成演示素材（SVG 占位图 + 演示 MP4，全部离线生成）
npm run gen:mock

# 3. 启动开发服务（默认使用内置 Mock 数据）
npm run dev
# → http://127.0.0.1:5173
```

其他命令：

```bash
npm run build       # 生产构建，输出到 dist/
npm run preview     # 预览构建产物
npm run mock:api    # 启动本地 Mock 后端（端口 8787），用于验证真实 HTTP 链路
npm run media:serve # 启动本地媒体服务（端口 8788），扫描出来的文件由它提供访问
npm run scan        # 扫描目录，把图片 / 视频纳入管理（详见第五节）
```

### 想先看看真实视频效果

```bash
npm run gen:mock && npm run dev
```

`gen:mock` 会用 ffmpeg 合成 5 段 H.264 MP4 演示素材并抽帧生成封面。**没有 ffmpeg 也不会失败**，此时视频退化为图标占位（见第五节「ffmpeg 是可选的」）。

### 主题（明 / 暗）

- 点击右上角主题按钮在明暗之间切换，偏好存入 `localStorage`（键名 `photo-album:theme`，取值 `light` / `dark`），下次打开自动应用。
- 从未手动切换过时**跟随系统**（`prefers-color-scheme`），且系统主题变化时页面实时跟随；一旦手动选择过，就以用户选择为准。
- 主题只影响 `src/styles/global.css` 里的设计令牌（`[data-theme='dark']` 覆盖一组 CSS 变量），组件样式**不写死颜色**，因此新增组件默认支持双主题。
- 首屏无闪烁：`index.html` 里的内联脚本在样式生效前就给 `<html>` 打上 `data-theme`。
- 需要新增可调色的元素时，请先复用现有令牌；确有必要再加新变量时，**明暗两套一起加**。

### 演示数据说明

- **图片 24 张 + 视频 5 段**，跨 5 个相册 / 27 个标签，日期、机型、EXIF、体积、时长均随机生成但**结果稳定**（伪随机种子固定）。
- 图片为脚本生成的 SVG 占位图（`public/mock/photos/` 下每张三档尺寸：缩略图 480 / 常规 1200 / 原图 2400），**不依赖外网**。
- 视频为 ffmpeg 合成的 H.264 MP4（`public/mock/videos/`，每段 6–15 秒，含 1 段竖拍 `rotation=90` 素材），封面由 ffmpeg 抽帧得到。
- 5 段视频的时长、编码、码率、帧率、音轨、旋转都是 ffprobe **读回真实值**后写入清单的，不是编造的。
- 若要换成真实图床 / 视频源，只需改 `src/mock/photos.js` 里的 `urls` 字段即可，前端其余部分无需改动。

---

## 三、三种数据源与切换方式

前端所有数据都通过 `src/api/photoApi.js` 这一门面获取，它背后有三个数据源实现，对外暴露完全一致的接口：

```
组件 ──► photoApi ──► mockSource   （浏览器内假数据，默认，开箱即用）
                 ├──► httpSource   （真实 HTTP 接口）
                 └──► localSource  （本地媒体服务，读取扫描结果，继承 httpSource）
```

**切换方式（二选一）**

1. 改 `.env`：`VITE_DATA_SOURCE=api` 或 `=local`
2. 启动指定环境文件：`npx vite --mode api`（读取 `.env.api`）

右上角徽标会实时显示当前数据源：🟢 HTTP 接口 / 🟡 Mock 数据 / 🔵 本地扫描。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `mock` | `mock` 内置假数据 / `api` 真实接口 / `local` 本地媒体服务 |
| `VITE_API_BASE_URL` | `/api` | 接口基础路径 |
| `VITE_MOCK_SERVER_URL` | `http://127.0.0.1:8787` | vite dev 代理目标（仅本地联调用） |
| `VITE_MEDIA_SERVER_URL` | `http://127.0.0.1:8788` | 本地媒体服务地址（`local` 模式的代理目标） |
| `VITE_API_TOKEN` | 空 | 会以 `Authorization: Bearer <token>` 发送 |
| `VITE_REQUEST_TIMEOUT` | `15000` | 请求超时（毫秒） |
| `VITE_MOCK_DELAY` | `320` | mock 模式模拟网络延迟（毫秒） |
| `MEDIA_SCAN_ROOTS` | 空 | 扫描根目录，多个用分号 / 逗号分隔（仅 Node 侧生效） |
| `MEDIA_FFMPEG_PATH` | 空 | ffmpeg 路径，留空则自动探测（仅 Node 侧） |
| `MEDIA_FFPROBE_PATH` | 空 | ffprobe 路径，留空则自动探测（仅 Node 侧） |
| `MEDIA_API_PORT` | `8788` | 本地媒体服务端口（仅 Node 侧） |

> 以 `VITE_` 开头的变量会暴露给浏览器，其余只在 Node 侧生效，不会进前端产物。

### 用本地 Mock 后端跑通 HTTP 链路

```bash
npm run mock:api     # 终端 1：http://127.0.0.1:8787
npx vite --mode api  # 终端 2：http://127.0.0.1:5173（.env.api 已设为 api）
```

`vite.config.js` 已配置 `/api` → `127.0.0.1:8787` 的代理；接真实后端时把代理 target 改成你的服务地址即可。

### 端口冲突

媒体服务默认占用 **8788**。若该端口已被其他程序占用（例如本地已跑了别的 API 代理），改用环境变量换端口即可：

```bash
MEDIA_API_PORT=8790 npm run media:serve
```

同时需要把 `.env` 里的 `VITE_MEDIA_SERVER_URL` 改成 `http://127.0.0.1:8790`，让 vite 代理对上。

### 配套后端：album-backend（Python + FastAPI）

除了本项目自带的两个 Node 参考实现（`mock/server.mjs` 演示用、`media/server.mjs` 扫描本地目录用），
现在还有一份**独立、可直接上线的正式后端**，位于上级目录的 `album-backend/`：

```
Workbuddy-Space/
├── photo-album-preview/   本项目（前端）
└── album-backend/         配套后端（Python + FastAPI + SQLite）
```

它实现了 `API.md` 里的全部接口：Range 206、扫描 SSE、雪碧图、sidecar 元数据，
**以及上传 / 重命名 / 删除**（P3）。另外提供 Swagger（`/docs`）与
OpenAPI（`/openapi.json`），方便第三方系统照着对接。

**接上去同样是改一个地址**：

```bash
cd album-backend
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
python scripts/scan_now.py ./sample-media     # 扫描入库
python -m app                                  # http://127.0.0.1:8791
```

```bash
# photo-album-preview/.env
VITE_DATA_SOURCE=local
VITE_MEDIA_SERVER_URL=http://127.0.0.1:8791    # 原本指向 8788 的 Node 媒体服务
```

前端一行代码都不用改——因为它认的是契约，不是实现。这也是整份设计的核心：
**这三个后端是同一份 API.md 的三种实现，彼此可以互相替换。**

想验证某个后端（包括你自己写的）到底合不合格，直接跑 album-backend 里的黑盒契约测试：

```bash
cd album-backend
ALBUM_CONTRACT_BASE=http://127.0.0.1:8791/api pytest tests/contract -v
```

70 条断言覆盖信封、错误码、Range 三种写法与 416、雪碧图三态、元数据白名单与合并、
SSE 事件序列、路径穿越，以及 P3 的上传 / 重命名 / 删除。
换了 OS、换了语言、换了作者，跑过的就算数。

（管理类用例对未实现这些接口的后端会自动跳过 —— 契约里它们是可选项，
判失败会让这套测试只能验证某一个实现。）

> Windows 上启动它**不要加 `--reload`**：uvicorn 热重载会把事件循环换成 Selector 策略，
> 而 Windows 只有 Proactor 循环支持拉起子进程，结果就是 ffprobe 调用全部失败，
> 并且失败信息是空字符串，一眼看不出原因。详见 `album-backend/README.md`。

---

## 四、扫描本地目录（把硬盘上的素材纳入管理）

这条链路让你可以直接管理硬盘上已有的图片 / 视频，不需要先做一个后端。

```bash
# 1. 扫描目录（可同时给多个根目录）
npm run scan -- --roots "D:/素材,D:/手机相册"

# 2. 启动本地媒体服务
npm run media:serve

# 3. 以 local 数据源启动前端（改 .env 的 VITE_DATA_SOURCE=local）
npm run dev
```

也可以不扫命令行，直接在页面上点工具栏的「**扫描目录**」按钮（仅 `local` 数据源下出现），按钮会在扫描结束后自动刷新列表。

### 扫描命令参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--roots <路径>` | 无（必填，或从 `MEDIA_SCAN_ROOTS` 读） | 扫描根目录，多个用逗号 / 分号分隔 |
| `--recursive` / `--no-recursive` | 递归 | 是否进入子目录 |
| `--thumbs` / `--no-thumbs` | 生成 | 是否生成缩略图 |
| `--include <扩展名>` | 图片 + 视频全集 | 限定纳入的文件类型 |
| `--concurrency <n>` | `4` | 并发数，别一次性起几百个 ffprobe |
| `--out <路径>` | `data/media-index.json` | 索引输出位置 |
| `--cache <目录>` | `media-cache` | 缩略图缓存目录 |
| `--force` | 关闭 | 忽略增量缓存，全部重新解析 |

### 三条设计约束

1. **不引入数据库**：产出是一个可丢弃的 `data/media-index.json`。真相始终是磁盘上的原始文件，索引删掉重扫即可恢复。
2. **对素材目录只读**：绝不修改、移动、重命名你的原始文件，只往 `media-cache/` 写缩略图。
3. **增量扫描**：索引里记了 `mtime` + `size`，没变过的文件直接复用上次结果。实测 6 个文件二次扫描复用 5 个、耗时 0.3s。

### ffmpeg 是可选的

没有 ffmpeg 时扫描**照样能跑**，只是拿不到缩略图和时长：

| | 有 ffmpeg | 无 ffmpeg |
| --- | --- | --- |
| 文件登记 | 支持 | 支持 |
| 类型识别（图片 / 视频） | 支持 | 支持（按扩展名判定） |
| 视频缩略图 | ffmpeg 抽帧 | 无，卡片显示图标占位 |
| 视频时长、编码、码率、帧率 | ffprobe 读取 | 无，面板显示「—」 |
| 图片缩略图 | ffmpeg 生成 | 无，但卡片会直接显示原图（图片本来就显示得出来） |

> 视频**绝不**回退到用自身当缩略图 —— 那会让卡片渲染 `<img src="xxx.mp4">`，把整个视频文件当图片下载下来。宁可留空显示图标。

**安装方式（三选一，工具集按此顺序自动探测）**

1. 装进系统 `PATH`
2. 放到 `tools/media-toolkit/bin/`（如 `ffmpeg.exe` / `ffprobe.exe`）
3. 在 `.env` 里指定 `MEDIA_FFMPEG_PATH` / `MEDIA_FFPROBE_PATH`

三处都找不到时自动降级，并在扫描结束时提示你装上 ffmpeg 重跑即可。

### sidecar 元数据

想给扫描进来的文件补充标题、标签、相册、拍摄时间，在源文件**同目录**放一个 `.meta.json`：

```
D:/素材/旅行/IMG_0042.jpg
D:/素材/旅行/IMG_0042.jpg.meta.json   ← 与源文件同名，加 .meta.json
```

```json
{
  "version": 1,
  "title": "清晨的海边",
  "description": "这条元数据跟着源文件一起被拷贝 / 备份 / 迁移",
  "tags": ["海景", "清晨"],
  "album": "夏日旅行",
  "takenAt": "2026-10-01T09:00:00"
}
```

全部字段可选；不提供时相册按所在文件夹名自动归类，拍摄时间回退到文件的修改时间。这样元数据跟着文件走，换机器、换目录都不会丢。

#### 程序化写入

除了手写文件，也可以用命令行或 HTTP 端点写入，两者共用同一套**合并策略**：只覆盖你给的字段，没提到的原样保留——包括人工写进去的自定义字段。

```bash
# 命令行：只改标题和标签，description / album / takenAt 不动
npm run media:meta -- --file "D:/素材/旅行/IMG_0042.jpg" --title "清晨的海边" --tags "海景,清晨"

# 追加标签（不会冲掉已有的）
npm run media:meta -- --file "D:/素材/旅行/IMG_0042.jpg" --add-tag 夕阳

# 查看当前内容
npm run media:meta -- --file "D:/素材/旅行/IMG_0042.jpg"

# 删除 sidecar
npm run media:meta -- --file "D:/素材/旅行/IMG_0042.jpg" --clear
```

```bash
# HTTP：与 CLI 等价，返回更新后的 Media 对象
curl -X PUT http://127.0.0.1:8788/api/media/md_3ecb9b87fe/meta \
     -H "Content-Type: application/json" \
     -d '{"title":"清晨的海边","tags":["海景","清晨"]}'
```

参数白名单：`title` / `description` / `tags` / `album` / `takenAt`，其余字段一律丢弃（也就顺带挡住了原型污染）。请求体不是合法 JSON 时返回 **400**，而不是静默地什么都不做。

> 编辑入口默认不在界面上出现——本期定位仍是「浏览为主」。想试用就在地址栏加 `?feat.metaEdit=1`，信息面板会多出「元数据」一栏。

### 本地媒体服务提供的接口

启动后访问 `http://127.0.0.1:8788/` 会看到自检信息与全部端点说明。要点：

| 端点 | 说明 |
| --- | --- |
| `GET /api/media` | 列表，支持本文全部查询参数 |
| `GET /api/file/{id}` | 原始文件流，**支持 Range → 206**（视频拖动进度条必需） |
| `GET /api/thumb/{id}` | 缩略图（没有则返回 404） |
| `GET /api/sprite/{id}` | 进度预览雪碧图布局，三态见下 |
| `POST /api/scan` | 触发扫描 |
| `GET /api/scan/status` | 扫描进度与日志（轮询通路） |
| `GET /api/scan/stream` | **SSE 实时进度**，事件分级见下 |
| `PUT /api/media/{id}/meta` | 写入 sidecar 元数据 |

#### 进度预览雪碧图

`GET /api/sprite/{id}` 返回三态之一，前端据此决定预览方式：

| state | 含义 | 前端行为 |
| --- | --- | --- |
| `ready` | 雪碧图已缓存 | 取格显示，**零请求** |
| `generating` | 后台正在生成 | 先用实时取帧顶着，隔 2.5 秒再问（最多 3 次） |
| `unavailable` | 没装 ffmpeg 等 | 永久走实时取帧，不再询问 |

雪碧图**按需生成**：扫描阶段完全不碰它（否则每次扫描变慢、缓存也无谓变胖），只有某个视频在查看器里首次被打开时才后台现做，之后长期复用。

#### 扫描进度 SSE

`GET /api/scan/stream` 返回 `text/event-stream`，事件刻意分四级，字段各不相同：

| event | 时机 | 关键字段 |
| --- | --- | --- |
| `snapshot` | 连接建立即推 | `running`、`total`、`roots` |
| `start` | 扫描进程已拉起 | `startedAt` |
| `begin` | 候选文件清点完 | `total`、`previous` |
| `progress` | 每处理完一个文件 | `current`、`total`、`file`、`reused` |
| `summary` | 扫描自身统计完成 | `total`、`images`、`videos`、`thumbed`、`reused` |
| `done` | **进程真正退出** | `running`、`error`、`total`、`code` |

前端只在收到 `done` 时收尾刷新列表。浏览器不支持 `EventSource` 时自动退回 `GET /api/scan/status` 轮询，所以 SSE 不是唯一通路。

> 顺序很关键：**先连上、再触发**。反过来时小目录可能在连接就绪前就扫完了，一帧进度都收不到。

> 它是**可选的**：不做扫描功能时完全不需要启动，前端继续用 mock 或你自己的后端接口。

---

## 五、目录结构

```
photo-album-preview/
├── index.html
├── vite.config.js              # dev 代理（含 /media-cache）/ 别名 / 构建配置
├── .env / .env.api             # 环境变量（mock / api 两套）
├── mock/
│   └── server.mjs              # 本地 Mock 后端（Node 原生 http，零依赖）
├── media/
│   └── server.mjs              # 本地媒体服务（可选，供扫描链路使用，支持 Range）
├── scripts/
│   ├── gen-mock-images.mjs     # 生成 SVG 占位图
│   └── gen-mock-videos.mjs     # ffmpeg 合成演示 MP4 + 抽帧封面
├── tools/media-toolkit/        # ★ 与前端解耦的媒体工具集（独立 Node 包，零 npm 依赖）
│   ├── scan.mjs                #   目录扫描 CLI（含结构化进度输出）
│   ├── meta.mjs                #   sidecar 元数据 CLI（读 / 写 / 追加 / 清除）
│   ├── ffmpeg.js               #   三档探测 + ffprobe 解析 + 抽帧 + 雪碧图
│   ├── cache.js                #   缓存键 / 索引读写 / sidecar 读写
│   ├── constants.js            #   扩展名、MIME、支持矩阵
│   └── bin/                    #   可选：把 ffmpeg.exe / ffprobe.exe 放这里
├── data/media-index.json       # 扫描产出的索引（可丢弃，已 gitignore）
├── media-cache/                # 扫描产出的缩略图（可丢弃，已 gitignore）
├── public/mock/                # 生成的演示图片、视频与头像
└── src/
    ├── main.js / App.vue       # 入口与应用外壳
    ├── env.js                  # 运行时配置收口（不散落 import.meta.env）
    ├── config/album.config.js  # ★ 功能开关（上传/重命名/删除/扫描等）
    ├── model/
    │   ├── media.js            # ★ 服务端 JSON → MediaItem 领域模型的适配层
    │   └── photo.js            #   兼容出口（adaptPhoto = adaptMedia，沿用 Photo* 命名）
    ├── api/
    │   ├── http.js             # fetch 封装：超时 / 鉴权 / 统一错误（支持 POST）
    │   ├── photoApi.js         # ★ 数据门面（mock / api / local 自动切换）
    │   └── sources/
    │       ├── mockSource.js   # 浏览器内假数据（含分页筛选排序）
    │       ├── httpSource.js   # 真实接口实现
    │       └── localSource.js  # 本地媒体服务（继承 httpSource，加扫描能力）
    ├── mock/
    │   ├── photos.js           # 假数据（图片 + 视频，严格遵循服务端 JSON 格式）
    │   └── video-assets.js     # 生成的视频素材清单（ffprobe 读回的真实元数据）
    ├── stores/usePhotoStore.js # 全局状态（列表 / 查询 / 查看器 / 多选）
    ├── composables/
    │   ├── usePhotoActions.js  # ★ 操作注册表（下载 / 上传 / 重命名 / 删除）
    │   ├── useMediaPlayer.js   # ★ 播放器状态机（进度 / 音量 / 倍速 / 释放）
    │   ├── useHoverPreview.js  # ★ 卡片悬停静音预览（延迟 / 单例 / 彻底释放）
    │   ├── useScrubPreview.js  # ★ 进度条预览（雪碧图取格 / 实时取帧兜底）
    │   ├── useTheme.js         # ★ 明暗主题（读取/写入 localStorage，跟随系统）
    │   └── useToast.js
    ├── utils/
    │   ├── download.js         # 下载（进度、降级、文件名清洗）
    │   ├── viewer-transform.js # 缩放 / 旋转 / 翻转 / 平移的几何计算（仅图片）
    │   └── format.js           # 字节、时间、时长、EXIF 格式化
    ├── components/
    │   ├── AlbumToolbar.vue    # 搜索 / 筛选 / 排序 / 类型 / 扫描 / 视图切换
    │   ├── PhotoGrid.vue + PhotoCard.vue
    │   ├── PhotoTable.vue      # 详细记录模式
    │   ├── PhotoViewer.vue     # 大图查看器（舞台按类型分支）
    │   ├── VideoPlayer.vue     # 视频播放器
    │   ├── PaginationBar.vue / StatePlaceholder.vue / ThemeToggle.vue / ToastHost.vue / AppIcon.vue
    │   └── styles/global.css
```

---

## 六、数据契约

完整 JSON 格式、字段字典、错误码与对接说明见 **[API.md](./API.md)**。

图片与视频共用同一套契约，靠 `kind` 字段区分。最简形态（视频）：

```jsonc
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "md_0001",
        "kind": "video",                        // ← 新增：image / video，缺省按 mimeType / 扩展名推断
        "title": "海边的黄昏",
        "fileName": "VID_20261001_193000.mp4",
        "mimeType": "video/mp4",
        "size": 971322,
        "width": 1280,
        "height": 720,
        "takenAt": "2026-10-01T19:30:00+08:00",
        "tags": ["海景", "黄昏"],
        "album": { "id": "al_1", "name": "旅行" },
        "exif": null,                           // 图片专属，视频一律为 null
        "urls": {
          "thumb": "https://cdn.example.com/md_0001_poster.jpg",
          "poster": "https://cdn.example.com/md_0001_poster.jpg",
          "full": "https://cdn.example.com/md_0001.mp4",
          "download": "https://cdn.example.com/md_0001.mp4?download=1"
        },
        "video": {                              // ← 新增：视频外挂属性，图片一律为 null
          "duration": 6.5,
          "codec": "h264",
          "audioCodec": "aac",
          "hasAudio": true,
          "bitrate": 1195473,
          "frameRate": 30,
          "rotation": 90,
          "supported": true
        },
        "permissions": { "canView": true, "canDownload": true }
      }
    ],
    "pagination": { "page": 1, "pageSize": 20, "total": 24, "totalPages": 2, "hasMore": true }
  }
}
```

**向后兼容**：`kind` 与 `video` 都是**新增可选字段**。老后端只返回图片时一字不用改，前端照常工作。

**字段容错**：前端适配层 `src/model/media.js` 支持常见别名（`size` / `byteSize` / `fileSize` 互通，`duration` / `durationSec` 互通，`rotation` / `rotate` 互通等），后端字段命名不必与示例完全一致；全部缺省字段都有兜底，缺失字段不会导致页面报错。

---

## 七、管理功能（上传 / 重命名 / 删除）

### 7.1 后端不实现时会怎样

**入口自动隐藏，没有任何副作用。**

这三个能力由后端返回的 `permissions` 门控（见 [API.md §4.10](./API.md)）：
`canEdit` / `canDelete` 都默认 `false`，后端必须显式给 `true`，前端才显示对应入口。
所以只实现了浏览接口的后端可以直接对接 —— 前端不会发出任何管理类请求。

已有的两个参考实现的表现：

| 后端 | 管理入口 |
| --- | --- |
| `album-backend`（Python） | 默认可用；设 `ALBUM_ENABLE_WRITE=false` 进入只读后自动隐藏 |
| `media/server.mjs`（Node） | 未实现，入口不显示 |

### 7.2 让管理功能可用的开关

编辑 `src/config/album.config.js`：

```js
upload: true,    // 上传（默认开：按钮常驻，后端不支持时点击会明确报错）
rename: true,    // 重命名（还要看 permissions.canEdit）
delete: true,    // 删除（还要看 permissions.canDelete）
selection: false // 多选；打开后才会出现「批量删除」按钮
```

`rename` / `delete` 是"前端有无此能力"的总闸，真正显示与否还要看每条数据的
`permissions` —— 两道门都开才出现按钮。

URL 参数可临时覆盖，方便联调演示：

```
http://127.0.0.1:5173/?feat.selection=1   # 打开多选，试批量删除
```

### 7.3 后端要实现的端点

契约与响应格式见 [API.md §5.11–§5.14](./API.md)，要点三条：

1. **上传** `POST /media/upload`（multipart），**部分成功仍返回 201**，
   失败的进 `failed` 数组；全部失败才 400。
2. **重命名** `POST /media/{id}/rename`：id 由路径派生，改名必然换 id，
   所以响应要同时给 `id`（新）与 `previousId`（旧）。
3. **删除** `DELETE /media/{id}` 与 `POST /media/batch-delete`：
   默认进回收站（不要真删），`permanent=true` 才彻底删除。

### 7.4 EXIF 与 HEIC（契约 §4.5 / §4.9）

这两件事**前端本来就支持，只差后端给数据**：

- `exif` 字段：信息面板的「拍摄参数」分段早已写好，后端返回就有，没有就整段不显示。
- `urls.preview`：HEIC 这类浏览器打不开的格式，后端放转码后的 JPEG，
  前端 `displayUrl = urls.preview || urls.full`，组件不需要判断格式。

顺带一提 `urls.full` 与 `download` 仍然指向原始 HEIC ——
**预览看转码版本、下载拿无损原件**，两边各取所需。

### 7.5 其他常见拓展点

| 想做什么 | 改哪里 |
| --- | --- |
| 后端字段改名 / 新增字段（如「收藏状态」） | `src/model/media.js` 的 `adaptMedia()`，加字段与派生值 |
| 给视频加外挂属性（如章节、字幕轨） | `src/model/media.js` 的 `adaptVideo()`，图片路径不受影响 |
| 增加筛选维度（如日期区间、作者） | `src/api/sources/httpSource.js` 拼参数 + `AlbumToolbar.vue` 加控件 + store 的 `query` |
| 扫描时用 EXIF / 地理位置充实元数据 | `tools/media-toolkit/scan.mjs` 的 `buildItem()`，sidecar 已留好口子 |
| 后端自己实现扫描 | 参考 `media/server.mjs` 的 `POST /api/scan`，前端 `localSource.js` 无需改动 |
| 增加第四种视图（如时间轴） | 新建 `components/PhotoTimeline.vue`，在 `App.vue` 的 `viewMode` 分支与工具栏分段控件里加一项 |
| 换 UI 组件库（Element Plus 等） | 只影响 `src/components/**`，store / api / model 三层无需改动 |
| 换成 Pinia / 服务端状态管理 | 替换 `src/stores/usePhotoStore.js`，导出同名 API 即可 |
| 服务端下发配置（不再用 .env） | 改 `src/env.js` 一处即可 |
| 加第三种主题（如「护眼」「高对比」） | 在 `styles/global.css` 增一组 `[data-theme='xxx']` 令牌，再在 `useTheme.js` 的取值里加一个选项 |
| 支持更多视频编码（H.265 / AV1） | `tools/media-toolkit/constants.js` 的 `SUPPORTED_CODECS`，不支持的会被标记 `supported=false` 并提示 |

---

## 八、注意事项

- **Range 是刚需**：视频要能拖动进度条，文件流接口**必须**支持 `Range` 请求并返回 `206 Partial Content`。特别要注意后缀区间 `bytes=-N`（取最后 N 字节）—— 手机拍的 MP4 常把 `moov` 放在文件尾部，浏览器就靠这种请求去取索引，处理错了会直接播放失败。
- **跨域下载**：下载走 `fetch → Blob`，文件服务需允许跨域（`Access-Control-Allow-Origin`）才能拿到进度；不允许时会自动降级为浏览器原生下载（此时文件名可能由浏览器决定）。建议后端提供带 `Content-Disposition: attachment; filename=...` 的 `urls.download` 地址。
- **图片尺寸建议**：`thumb` 长边 400–600（列表用），`regular` 长边 1080–1600（查看器首屏，加载快），`full` 原图（放大与下载用）。查看器优先加载 `full`。
- **视频编码**：当前只保证 **H.264 MP4**（`mp4` / `m4v`）可直接播放。其他容器 / 编码也允许登记进来，但会标记 `supported=false` 并在卡片上显示提示。
- **竖拍视频**：容器带 `rotate=90` 的视频，扫描时记录原始宽高 + 旋转角，前端显示时交换宽高（1280×720 + 90° 显示为 720×1280）。浏览器自身也会应用这个标记。
- **时长是双通道获取的**：后端给了 `video.duration` 就直接显示；后端没给，点开视频后 `<video>` 的 `loadedmetadata` 事件会拿到时长并回写。**所以即便完全不装 ffmpeg，打开视频后时长依然会显示出来**，只是列表页要等打开过才知道。
- **鉴权**：文件若需要鉴权，建议 `urls` 返回带签名的临时 URL（如对象存储预签名地址），前端不参与密钥管理。
- **分页上限**：前端默认每页 20 条，后端 `pageSize` 建议限制在 100 以内。
- **浏览器支持**：面向现代浏览器（Chrome / Edge / Firefox / Safari 近两年版本），使用了 `aspect-ratio`、`ResizeObserver`、原生懒加载与 `<video>` 标准能力。

---

## 九、技术栈

- Vue 3（`<script setup>` + Composition API）
- Vite 8（开发服务 + 生产构建）
- 零 UI 框架 / 零状态库 / 零 HTTP 库依赖，运行时依赖只有 `vue`
- 媒体工具集（`tools/media-toolkit`）与媒体服务（`media/server.mjs`）均为 Node 原生实现，零 npm 依赖；ffmpeg 按需引入，不存在时自动降级

---

## 附录：设计决策记录

### 关键决策

| 决策项 | 结论 | 主要理由 |
| --- | --- | --- |
| 阶段范围 | **P0 视频能力 + P1 扫描链路** | 一期就把「纳入外部文件」这条主场景跑通 |
| 扫描文件的访问方式 | **本地 media server**（`media/server.mjs`） | 视频拖动强依赖 206，自建服务最可控；且它是可选的，不做扫描时整个后端可以不存在 |
| ffmpeg 引入方式 | **三档探测 + 优雅降级**，零 npm 依赖 | `ffmpeg-static` 之类会塞进 30MB 二进制并强耦合；降级后功能可用而非报错 |
| 文件命名 | **保留 `Photo*` 命名** | 改动面最小、回归风险最低，符合「以图片为主」；真正实现放在 `model/media.js`，`photo.js` 转为 re-export 兼容出口，老代码零改动 |

### 三条贯穿始终的原则

1. **向后兼容**：API 契约只**新增** `kind` / `video` 两个可选字段，不改任何既有字段的含义。只返回图片的后端一字不用改。
2. **可丢弃即可重建**：`data/media-index.json` 与 `media-cache/` 删掉重扫即全量恢复，因此它们不构成"数据库"，引入强依赖也就没有必要。
3. **可选依赖**：ffmpeg 缺失时降级而非报错，前端自动切到图标模式。

### 设计权衡

| 项 | 取舍 |
| --- | --- |
| ffprobe 性能 | 单文件 50–100ms，并发 4 时 1000 个文件约 15–25s；靠增量缓存把二次扫描压到 1s 内 |
| 非 H.264 MP4 | 纳入列表但标记 `supported=false` 并提示，不静默丢弃 |
| 大文件切片 | 不做（视频通常不大）；下载走 blob 流式 + 进度，播放靠 Range 拖动 |
| 缓存膨胀 | `media-cache/` 可随时清空；poster 约 10–30KB，1000 个素材约 20MB |
| 路径安全 | media server 只暴露 `media-cache/` 与索引内的路径，`..` 穿越会被挡下 |

### 阶段划分

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0 视频能力** | 统一模型 + kind、卡片 / 表格 / 查看器三处适配、播放器、下载、类型筛选、API 契约与文档 | 已完成 |
| **P1 扫描链路** | media-toolkit + scan CLI + 索引 + 缩略图流水线 + media server（Range） | 已完成 |
| **P2 增强** | hover 静音预览、雪碧图进度预览、sidecar 元数据写入、扫描进度 SSE | 已完成 |

四条增强在**两个通路**上都可用：mock 演示数据里雪碧图已预生成（永远是 `ready`），
本地扫描通路则是按需生成（首次打开才现做，之后复用）。

| P2 项 | 有 ffmpeg | 无 ffmpeg |
| --- | --- | --- |
| 卡片悬停预览 | 静音循环播放 | 同样可用（与缩略图无关） |
| 进度条画面预览 | 雪碧图取格（零请求） | 实时取帧兜底 |
| 缩略图 / 时长 | 抽帧 + ffprobe | 图标占位 + 播放时补全 |
| 扫描进度 | SSE 实时 / 轮询 | 同上 |
