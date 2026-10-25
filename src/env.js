/**
 * 运行时配置
 * ---------------------------------------------------------------------------
 * 统一收口 import.meta.env，业务代码不直接读环境变量，方便后续
 * 接入运行时配置（例如后端下发的 /config.json）或单元测试注入。
 */

const env = import.meta.env ?? {}

const toNumber = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

export const runtimeConfig = {
  /** 数据源：mock（内置假数据） | api（真实 HTTP 接口） */
  dataSource: String(env.VITE_DATA_SOURCE || 'mock').toLowerCase(),

  /** 接口基础路径 */
  apiBaseUrl: env.VITE_API_BASE_URL || '/api',

  /** 接口鉴权 Token，为空时不发送 Authorization 头 */
  apiToken: env.VITE_API_TOKEN || '',

  /** 请求超时（毫秒） */
  requestTimeout: toNumber(env.VITE_REQUEST_TIMEOUT, 15000),

  /** mock 模式下模拟的网络延迟（毫秒） */
  mockDelay: toNumber(env.VITE_MOCK_DELAY, 320),

  /** 是否开启接口调试日志 */
  debug: toBoolean(env.VITE_DEBUG, false)
}

export const isMockMode = () => runtimeConfig.dataSource !== 'api'

export default runtimeConfig
