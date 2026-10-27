#!/usr/bin/env node
/**
 * sidecar 元数据 CLI：读写与源文件同目录的 *.meta.json
 * ---------------------------------------------------------------------------
 * 与 HTTP 端点（PUT /api/media/{id}/meta）共用同一套合并策略：
 * 只覆盖传入的字段，未提及的一律保留，连人工写进去的自定义字段也不动。
 *
 * 用法：
 *   # 读取
 *   npm run media:meta -- --file "D:/素材/travel/IMG_0042.jpg"
 *
 *   # 写入（可只给部分字段）
 *   npm run media:meta -- --file "D:/素材/travel/IMG_0042.jpg" \
 *        --title "清晨的海边" --album "夏日旅行" --tags "海景,清晨"
 *
 *   # 追加标签（不动已有标签）
 *   npm run media:meta -- --file "..." --add-tag 夕阳
 *
 *   # 删除 sidecar
 *   npm run media:meta -- --file "..." --clear
 */

import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { readSidecar, writeSidecar } from './cache.js'

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue

    const [flag, inlineValue] = arg.slice(2).split('=')
    const next = argv[i + 1]
    const hasValue = inlineValue !== undefined || (next && !next.startsWith('--'))

    if (flag === 'clear') {
      options.clear = true
      continue
    }

    options[flag] = inlineValue !== undefined ? inlineValue : hasValue ? next : true
    if (inlineValue === undefined && hasValue) i += 1
  }
  return options
}

function usage() {
  console.log('用法：npm run media:meta -- --file <媒体文件> [--title <标题>] [--description <描述>]')
  console.log('                                [--album <相册>] [--taken-at <ISO时间>]')
  console.log('                                [--tags "a,b"] [--add-tag t] [--clear]')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.file) {
    usage()
    process.exitCode = 1
    return
  }

  const filePath = resolve(options.file)
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('不是文件')
  } catch {
    console.error(`[meta] 文件不存在：${filePath}`)
    process.exitCode = 1
    return
  }

  const sidecar = `${filePath}.meta.json`

  if (options.clear) {
    const { rm } = await import('node:fs/promises')
    await rm(sidecar, { force: true })
    console.log(`[meta] 已删除 sidecar：${sidecar}`)
    return
  }

  const patch = {}

  if (typeof options.title === 'string') patch.title = options.title
  if (typeof options.description === 'string') patch.description = options.description
  if (typeof options.album === 'string') patch.album = options.album
  if (typeof options['taken-at'] === 'string') patch['takenAt'] = options['taken-at']
  if (typeof options.tags === 'string') {
    patch.tags = options.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  // 追加标签：先读回现有值再合并，而不是覆盖。
  // 这样"只加一个标签"不会把人工填的其它标签冲掉。
  if (options['add-tag']) {
    const existing = (await readSidecar(filePath))?.tags || []
    const added = String(options['add-tag'])
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    patch.tags = [...new Set([...existing, ...added])]
  }

  // 没给任何写入参数就当作查询
  if (!Object.keys(patch).length) {
    const existing = await readSidecar(filePath)
    if (!existing) {
      console.log(`[meta] 尚无 sidecar：${sidecar}`)
      console.log('      可用 --title / --tags / --album 等参数写入')
      return
    }
    console.log(`[meta] ${sidecar}`)
    console.log(JSON.stringify(existing, null, 2))
    return
  }

  const next = await writeSidecar(filePath, patch)
  console.log(`[meta] 已写入 → ${sidecar}`)
  console.log(JSON.stringify(next, null, 2))
}

main().catch((error) => {
  console.error('[meta] 失败：', error?.message || error)
  process.exitCode = 1
})
