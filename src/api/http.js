/**
 * 极简 HTTP 客户端
 * ---------------------------------------------------------------------------
 * 只做三件事：超时控制、统一错误形态、统一解包。
 * 不引入 axios —— 相册场景只需要 GET + 少量幂等请求，保持零额外依赖。
 */

import { runtimeConfig } from '@/env'

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? -1
    this.status = options.status ?? 0
    this.traceId = options.traceId ?? ''
    this.payload = options.payload ?? null
  }
}

/**  {code,message,data} 业务约定 */
export const SUCCESS_CODE = 0

function buildUrl(path, query = {}) {
  const base = String(runtimeConfig.apiBaseUrl || '').replace(/\/+$/, '')
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${normalizedPath}`, window.location.origin)

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      if (!value.length) return
      url.searchParams.set(key, value.join(','))
      return
    }
    url.searchParams.set(key, String(value))
  })

  return url.toString()
}

/**
 * @template T
 * @param {string} path
 * @param {{query?: object, signal?: AbortSignal, headers?: object, timeout?: number,
 *          method?: string, body?: object}} options
 * @returns {Promise<T>}
 */
export async function request(path, options = {}) {
  const { query = {}, signal, headers = {}, timeout, method = 'GET', body } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeout ?? runtimeConfig.requestTimeout)

  if (signal) {
    if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
    }
  }

  const url = buildUrl(path, query)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(runtimeConfig.apiToken ? { Authorization: `Bearer ${runtimeConfig.apiToken}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new ApiError(`请求失败（HTTP ${response.status}）`, {
        status: response.status,
        code: response.status,
        payload: await safeText(response)
      })
    }

    const payload = await response.json()

    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (Number(payload.code) !== SUCCESS_CODE) {
        throw new ApiError(payload.message || '接口返回错误', {
          code: Number(payload.code),
          status: response.status,
          traceId: payload.traceId || '',
          payload
        })
      }
      return payload.data
    }

    // 兼容直接返回数组 / 裸对象的后端
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error?.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', { code: 408, status: 408 })
    }
    throw new ApiError(error?.message || '网络异常', { code: -1 })
  } finally {
    clearTimeout(timer)
  }
}

async function safeText(response) {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

export default request
