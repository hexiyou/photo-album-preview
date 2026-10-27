/**
 * 缓存键、缩略图路径与索引读写
 * ---------------------------------------------------------------------------
 * 贯穿整个工具集的一条规则：**一切缓存都可丢弃**。
 * media-cache/ 与 data/media-index.json 删掉后重扫即可全量恢复，
 * 所以它们是"派生产物"而不是数据库 —— 真相永远是磁盘上的原始文件。
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

/** 缓存键 = 绝对路径的 sha1 前 16 位；路径不变则键不变 */
export function cacheKey(filePath) {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 16)
}

/** 媒体 id 也由路径派生，保证同一文件每次扫描得到同一个 id */
export function mediaId(filePath) {
  return `md_${cacheKey(filePath).slice(0, 10)}`
}

/** 缩略图按前两位分目录，避免单目录文件过多 */
export function posterPath(key, cacheDir) {
  return join(cacheDir, key.slice(0, 2), `${key}.poster.jpg`)
}

/** 进度预览雪碧图（与缩略图同目录同命名风格） */
export function spritePath(key, cacheDir) {
  return join(cacheDir, key.slice(0, 2), `${key}.sprite.jpg`)
}

/** 雪碧图的格子布局元数据，和图放在一起、一起可丢弃 */
export function spriteMetaPath(key, cacheDir) {
  return join(cacheDir, key.slice(0, 2), `${key}.sprite.json`)
}

/** 绝对路径 → 可通过 HTTP 访问的 URL */
export function toCacheUrl(absolutePath, cacheDir) {
  const rel = relative(cacheDir, absolutePath).split(sep).join('/')
  return `/media-cache/${rel}`
}

export async function ensurePosterDir(key, cacheDir) {
  await mkdir(join(cacheDir, key.slice(0, 2)), { recursive: true })
}

/** 读取旧索引，返回 id → item 的映射，用于增量扫描 */
export async function loadIndex(indexFile) {
  try {
    const data = JSON.parse(await readFile(indexFile, 'utf8'))
    if (!Array.isArray(data?.items)) return new Map()
    return new Map(data.items.map((item) => [item.id, item]))
  } catch {
    return new Map()
  }
}

export async function saveIndex(indexFile, { roots, items, stats }) {
  await mkdir(dirname(indexFile), { recursive: true })
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    roots,
    items,
    stats
  }
  await writeFile(indexFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

/**
 * 读取 sidecar 元数据：IMG_0042.jpg.meta.json
 * 这样整个素材目录拷走 / 备份 / 换机器时，标签与分组也会跟着走。
 */
export async function readSidecar(filePath) {
  const sidecar = `${filePath}.meta.json`
  try {
    const data = JSON.parse(await readFile(sidecar, 'utf8'))
    return {
      title: String(data.title || ''),
      description: String(data.description || ''),
      tags: Array.isArray(data.tags) ? data.tags.filter(Boolean).map(String) : [],
      album: String(data.album || ''),
      takenAt: String(data.takenAt || '')
    }
  } catch {
    return null
  }
}

/**
 * 写回 sidecar 元数据（与 readSidecar 成对）
 *
 * 合并策略：**先读现有的，只覆盖传入的字段，未提及的一律保留**。
 * 这样人工或别的工具往这个文件里写的自定义内容不会被抹掉，
 * 也支持"只改标签不动标题"这种局部更新。
 *
 * @param {string} filePath 源媒体文件绝对路径
 * @param {object} patch    只允许 title / description / tags / album / takenAt
 */
export async function writeSidecar(filePath, patch = {}) {
  const sidecar = `${filePath}.meta.json`

  let existing = {}
  try {
    const parsed = JSON.parse(await readFile(sidecar, 'utf8'))
    if (parsed && typeof parsed === 'object') existing = parsed
  } catch {
    existing = {}
  }

  const next = { ...existing, version: existing.version ?? 1 }

  const ALLOWED = ['title', 'description', 'tags', 'album', 'takenAt']
  for (const key of ALLOWED) {
    const value = patch[key]
    if (value === undefined) continue
    next[key] = value
  }

  // 没有留痕就无法判断"人改过还是机器写的"，记一笔成本很低
  next.updatedAt = new Date().toISOString()

  await writeFile(sidecar, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/** 相册名缺省用所在目录名，比"未分组"更有信息量 */
export function albumFromPath(filePath, override = '') {
  const name = override || basename(dirname(filePath))
  return { id: `al_${cacheKey(`album:${name}`).slice(0, 8)}`, name }
}

export default {
  cacheKey,
  mediaId,
  posterPath,
  spritePath,
  spriteMetaPath,
  toCacheUrl,
  ensurePosterDir,
  loadIndex,
  saveIndex,
  readSidecar,
  writeSidecar,
  albumFromPath
}
