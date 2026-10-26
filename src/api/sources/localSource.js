/**
 * 本地索引数据源（配合 media/server.mjs 使用）
 * ---------------------------------------------------------------------------
 * 它复用了 HTTP 数据源的全部读取能力 —— 因为 media/server.mjs 本身就是个
 * 标准 HTTP 后端，接口契约与真实后端一致（/api/photos 也保留支持）。
 *
 * 多出来的只有两件事：
 *   · POST /api/scan     触发目录扫描
 *   · GET  /api/scan/status  查询扫描进度
 *
 * 启用方式：.env 里 VITE_DATA_SOURCE=local，并启动 npm run media:serve
 */

import request from '@/api/http'
import httpSource from './httpSource'
import { runtimeConfig } from '@/env'
import { adaptMedia } from '@/model/media'

function streamUrl(path) {
  const base = String(runtimeConfig.apiBaseUrl || '').replace(/\/+$/, '')
  return new URL(`${base}${path}`, window.location.origin).toString()
}

export const localSource = {
  ...httpSource,
  name: 'local',

  /**
   * 触发目录扫描
   * @param {{roots?: string[], recursive?: boolean, thumbs?: boolean}} payload
   * roots 留空时用服务端 .env 的 MEDIA_SCAN_ROOTS
   */
  async scanDirectory(payload = {}, options = {}) {
    return request('/scan', { method: 'POST', body: payload, signal: options.signal })
  },

  /** 扫描进度与当前索引状态 */
  async fetchScanStatus(options = {}) {
    return request('/scan/status', { signal: options.signal })
  },

  /**
   * 进度预览雪碧图
   * @returns {Promise<{state:'ready'|'generating'|'unavailable', sprite?:object, reason?:string}>}
   * 三态语义见 media/server.mjs：generating 时前端先用实时取帧顶着，稍后再来问
   */
  async fetchSprite(id, options = {}) {
    const data = await request(`/sprite/${encodeURIComponent(id)}`, { signal: options.signal })
    const state = data?.state || 'unavailable'
    return { state, sprite: data?.sprite, reason: data?.reason || '' }
  },

  /** 写回 sidecar 元数据（与源文件同目录的 *.meta.json） */
  async updateMeta(id, patch = {}, options = {}) {
    const data = await request(`/media/${encodeURIComponent(id)}/meta`, {
      method: 'PUT',
      body: patch,
      signal: options.signal
    })
    return adaptMedia(data?.media ?? data)
  },

  /**
   * 订阅扫描进度（SSE）
   * @param {{onSnapshot?, onProgress?, onLog?, onDone?, onError?}} handlers
   * @returns {EventSource|null} 环境不支持 / 连接立刻失败时返回 null，调用方自行退回轮询
   */
  openScanStream(handlers = {}) {
    if (typeof EventSource === 'undefined') return null

    const { onSnapshot, onProgress, onLog, onDone, onError } = handlers

    let source
    try {
      source = new EventSource(streamUrl('/scan/stream'))
    } catch {
      return null
    }

    const parse = (event) => {
      try {
        return JSON.parse(event.data)
      } catch {
        return null
      }
    }

    source.addEventListener('snapshot', (event) => {
      const data = parse(event)
      if (data) onSnapshot?.(data)
    })
    source.addEventListener('progress', (event) => {
      const data = parse(event)
      if (data) onProgress?.(data)
    })
    source.addEventListener('log', (event) => {
      const data = parse(event)
      if (data) onLog?.(data)
    })
    source.addEventListener('done', (event) => {
      const data = parse(event) || {}
      // done 是"扫描进程真正退出"那一刻，之后不会再有事件，收尾后关掉连接
      source.close()
      onDone?.(data)
    })

    source.onerror = () => {
      // 注意：**不要在这里 close 或重试**。
      // EventSource 重连是浏览器内置行为，提前关掉反而会丢掉后续事件；
      // 真正的失败信号交给调用方的超时逻辑去判定。
      onError?.()
    }

    return source
  }
}

export default localSource
