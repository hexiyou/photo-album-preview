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
  }
}

export default localSource
