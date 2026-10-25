/**
 * Mock 图片生成器
 * ---------------------------------------------------------------------------
 * 用 Node 原生脚本（零第三方依赖）为 mock 数据里的每张照片生成 3 个尺寸的 SVG 占位图：
 *   public/mock/photos/{id}_thumb.svg    长边 480
 *   public/mock/photos/{id}_regular.svg  长边 1200
 *   public/mock/photos/{id}_full.svg     长边 2400
 *
 * 之所以用 SVG 而不是外链图床：
 *   1. 完全离线可用，clone 下来就能跑；
 *   2. 矢量图任意缩放，缩略图和大图都能保持清晰；
 *   3. 每个 scene 有明确的色调差，方便验证「缩略图 → 大图」是否加载正确。
 *
 * 用法：npm run gen:mock
 */

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MOCK_PHOTOS } from '../src/mock/photos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'mock', 'photos')
const AVATAR_DIR = resolve(__dirname, '..', 'public', 'mock', 'avatars')

const SIZES = [
  { suffix: 'thumb', longEdge: 480 },
  { suffix: 'regular', longEdge: 1200 },
  { suffix: 'full', longEdge: 2400 }
]

function createRandom(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n = (value) => Math.round(value * 100) / 100

function defs(id, palette) {
  return `
  <defs>
    <linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette[1]}"/>
      <stop offset="55%" stop-color="${palette[2]}"/>
      <stop offset="100%" stop-color="${palette[3]}"/>
    </linearGradient>
    <linearGradient id="glow-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette[2]}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${palette[0]}" stop-opacity="0.35"/>
    </linearGradient>
    <radialGradient id="vig-${id}" cx="50%" cy="50%" r="72%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.32"/>
    </radialGradient>
  </defs>`
}

const SCENE_PAINTERS = {
  mountain(W, H, palette, random) {
    const horizon = H * 0.62
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<circle cx="${n(W * 0.72)}" cy="${n(H * 0.24)}" r="${n(Math.min(W, H) * 0.07)}" fill="${palette[2]}" opacity="0.85"/>`
    const layers = 4
    for (let i = 0; i < layers; i += 1) {
      const base = horizon + (H - horizon) * (i / layers) * 0.55
      const points = []
      const peaks = 3 + i
      for (let p = 0; p <= peaks; p += 1) {
        const x = (W / peaks) * p
        const y = base - Math.abs(Math.sin((p + i) * 1.7)) * (H * 0.18) * (1 - i * 0.18)
        points.push(`${n(x)},${n(y)}`)
      }
      out += `<polygon points="0,${n(H)} ${points.join(' ')} ${n(W)},${n(H)}" fill="${palette[i % 2 === 0 ? 0 : 3]}" opacity="${n(0.55 + i * 0.12)}"/>`
    }
    out += `<rect x="0" y="${n(horizon - H * 0.06)}" width="${W}" height="${n(H * 0.1)}" fill="${palette[2]}" opacity="0.35"/>`
    return out
  },

  lake(W, H, palette, random) {
    const horizon = H * 0.5
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<circle cx="${n(W * 0.3)}" cy="${n(H * 0.26)}" r="${n(Math.min(W, H) * 0.06)}" fill="${palette[2]}" opacity="0.7"/>`
    for (let i = 0; i < 3; i += 1) {
      const base = horizon - H * 0.08 * (3 - i)
      const y = base
      out += `<polygon points="0,${n(y)} ${n(W * 0.28)},${n(y - H * 0.22)} ${n(W * 0.52)},${n(y + H * 0.02)} ${n(W * 0.74)},${n(y - H * 0.16)} ${W},${n(y + H * 0.04)} ${W},${n(horizon)} 0,${n(horizon)}" fill="${palette[i % 2 === 0 ? 0 : 3]}" opacity="${n(0.45 + i * 0.15)}"/>`
    }
    out += `<rect x="0" y="${n(horizon)}" width="${W}" height="${n(H - horizon)}" fill="${palette[0]}" opacity="0.9"/>`
    for (let i = 0; i < 14; i += 1) {
      const y = horizon + (H - horizon) * (i / 14)
      out += `<rect x="${n(random() * W * 0.2)}" y="${n(y)}" width="${n(W * (0.3 + random() * 0.6))}" height="${n(H * 0.008)}" fill="${palette[2]}" opacity="${n(0.12 + random() * 0.18)}"/>`
    }
    return out
  },

  forest(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#glow-${this.id})"/>`
    for (let i = 0; i < 9; i += 1) {
      const x = (W / 9) * i + random() * (W * 0.04)
      const width = W * (0.012 + random() * 0.02)
      out += `<rect x="${n(x)}" y="${n(-H * 0.05)}" width="${n(width)}" height="${n(H * 1.1)}" fill="${palette[3]}" opacity="${n(0.35 + random() * 0.4)}"/>`
    }
    for (let i = 0; i < 5; i += 1) {
      const x = W * 0.1 + i * W * 0.18
      out += `<polygon points="${n(x)},${n(H * 0.18)} ${n(x + W * 0.12)},${n(H * 0.3)} ${n(x + W * 0.04)},${n(H * 0.34)}" fill="${palette[2]}" opacity="0.22"/>`
    }
    out += `<circle cx="${n(W * 0.68)}" cy="${n(H * 0.16)}" r="${n(Math.min(W, H) * 0.1)}" fill="${palette[2]}" opacity="0.4"/>`
    return out
  },

  sky(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<ellipse cx="${n(W * 0.5)}" cy="${n(H * 0.45)}" rx="${n(W * 0.6)}" ry="${n(H * 0.12)}" fill="${palette[2]}" opacity="0.18" transform="rotate(-18 ${n(W * 0.5)} ${n(H * 0.45)})"/>`
    const stars = 140
    for (let i = 0; i < stars; i += 1) {
      out += `<circle cx="${n(random() * W)}" cy="${n(random() * H * 0.9)}" r="${n(Math.max(1, Math.min(W, H) * (0.0008 + random() * 0.0022)))}" fill="#ffffff" opacity="${n(0.25 + random() * 0.7)}"/>`
    }
    return out
  },

  city(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<circle cx="${n(W * 0.78)}" cy="${n(H * 0.3)}" r="${n(Math.min(W, H) * 0.08)}" fill="${palette[3]}" opacity="0.5"/>`
    const skyline = H * 0.72
    let x = 0
    let index = 0
    while (x < W) {
      const bw = W * (0.06 + random() * 0.07)
      const bh = H * (0.2 + random() * 0.45)
      const top = skyline - bh
      out += `<rect x="${n(x)}" y="${n(top)}" width="${n(bw)}" height="${n(H - top)}" fill="${palette[0]}" opacity="${n(0.85 + (index % 3) * 0.05)}"/>`
      for (let r = 0; r < 6; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          if (random() < 0.45) continue
          out += `<rect x="${n(x + bw * (0.16 + c * 0.28))}" y="${n(top + bh * (0.08 + r * 0.15))}" width="${n(bw * 0.14)}" height="${n(bh * 0.06)}" fill="${palette[2]}" opacity="${n(0.5 + random() * 0.5)}"/>`
        }
      }
      x += bw + W * 0.008
      index += 1
    }
    return out
  },

  sea(W, H, palette, random) {
    const horizon = H * 0.55
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<circle cx="${n(W * 0.22)}" cy="${n(H * 0.28)}" r="${n(Math.min(W, H) * 0.055)}" fill="${palette[2]}" opacity="0.75"/>`
    out += `<rect x="0" y="${n(horizon)}" width="${W}" height="${n(H - horizon)}" fill="${palette[0]}" opacity="0.92"/>`
    for (let i = 0; i < 18; i += 1) {
      const y = horizon + (H - horizon) * (i / 18)
      out += `<path d="M0 ${n(y)} Q ${n(W * 0.25)} ${n(y - H * 0.015)} ${n(W * 0.5)} ${n(y)} T ${W} ${n(y)}" stroke="${palette[2]}" stroke-width="${n(H * 0.004)}" fill="none" opacity="${n(0.14 + random() * 0.2)}"/>`
    }
    out += `<polygon points="${n(W * 0.62)},${n(horizon + H * 0.02)} ${n(W * 0.72)},${n(horizon - H * 0.12)} ${n(W * 0.84)},${n(horizon + H * 0.04)}" fill="${palette[3]}" opacity="0.9"/>`
    return out
  },

  desert(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    out += `<circle cx="${n(W * 0.24)}" cy="${n(H * 0.3)}" r="${n(Math.min(W, H) * 0.07)}" fill="${palette[2]}" opacity="0.7"/>`
    for (let i = 0; i < 5; i += 1) {
      const y = H * (0.5 + i * 0.11)
      const amp = H * (0.05 + random() * 0.06)
      out += `<path d="M0 ${n(y)} Q ${n(W * 0.3)} ${n(y - amp)} ${n(W * 0.62)} ${n(y + amp * 0.4)} T ${W} ${n(y - amp * 0.3)} L ${W} ${H} L 0 ${H} Z" fill="${i % 2 === 0 ? palette[1] : palette[2]}" opacity="${n(0.5 + i * 0.08)}"/>`
    }
    return out
  },

  flower(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#glow-${this.id})"/>`
    const count = 7
    for (let i = 0; i < count; i += 1) {
      const cx = W * (0.15 + random() * 0.7)
      const cy = H * (0.2 + random() * 0.6)
      const r = Math.min(W, H) * (0.06 + random() * 0.09)
      for (let p = 0; p < 5; p += 1) {
        const angle = (Math.PI * 2 * p) / 5 + random() * 0.3
        out += `<circle cx="${n(cx + Math.cos(angle) * r * 0.72)}" cy="${n(cy + Math.sin(angle) * r * 0.72)}" r="${n(r * 0.55)}" fill="${palette[p % 2 === 0 ? 0 : 1]}" opacity="${n(0.55 + random() * 0.35)}"/>`
      }
      out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.3)}" fill="${palette[3]}" opacity="0.75"/>`
    }
    return out
  },

  portrait(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#glow-${this.id})"/>`
    const cx = W * 0.5
    const headR = Math.min(W, H) * 0.16
    out += `<ellipse cx="${n(cx)}" cy="${n(H * 0.42)}" rx="${n(headR * 0.86)}" ry="${n(headR)}" fill="${palette[0]}" opacity="0.92"/>`
    out += `<path d="M ${n(cx - headR * 2.1)} ${H} Q ${n(cx)} ${n(H * 0.6)} ${n(cx + headR * 2.1)} ${H} Z" fill="${palette[0]}" opacity="0.92"/>`
    out += `<ellipse cx="${n(cx - headR * 0.45)}" cy="${n(H * 0.42)}" rx="${n(headR * 0.66)}" ry="${n(headR * 0.8)}" fill="${palette[2]}" opacity="0.28"/>`
    return out
  },

  snow(W, H, palette, random) {
    let out = `<rect width="${W}" height="${H}" fill="url(#sky-${this.id})"/>`
    for (let i = 0; i < 4; i += 1) {
      const x = W * (0.12 + i * 0.24)
      const base = H * (0.62 + random() * 0.08)
      out += `<polygon points="${n(x)},${n(base)} ${n(x - W * 0.06)},${n(H * 0.86)} ${n(x + W * 0.06)},${n(H * 0.86)}" fill="${palette[3]}" opacity="0.8"/>`
      out += `<rect x="${n(x - W * 0.006)}" y="${n(H * 0.86)}" width="${n(W * 0.012)}" height="${n(H * 0.1)}" fill="${palette[3]}" opacity="0.8"/>`
    }
    out += `<path d="M0 ${n(H * 0.78)} Q ${n(W * 0.3)} ${n(H * 0.7)} ${n(W * 0.58)} ${n(H * 0.8)} T ${W} ${n(H * 0.74)} L ${W} ${H} L 0 ${H} Z" fill="${palette[2]}" opacity="0.95"/>`
    for (let i = 0; i < 40; i += 1) {
      out += `<circle cx="${n(random() * W)}" cy="${n(random() * H * 0.8)}" r="${n(Math.max(1, Math.min(W, H) * 0.003))}" fill="#ffffff" opacity="${n(0.3 + random() * 0.5)}"/>`
    }
    return out
  }
}

function buildSvg(photo, targetWidth, targetHeight) {
  const render = photo._mockRender || { scene: 'mountain', palette: PALETTES_FALLBACK }
  const painter = SCENE_PAINTERS[render.scene] || SCENE_PAINTERS.mountain
  const random = createRandom(hashSeed(photo.id))
  const W = Math.round(targetWidth)
  const H = Math.round(targetHeight)

  const body = painter.call({ id: photo.id }, W, H, render.palette, random)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(photo.title)}">
${defs(photo.id, render.palette)}
  <g>${body}</g>
  <rect width="${W}" height="${H}" fill="url(#vig-${photo.id})"/>
</svg>
`
}

const PALETTES_FALLBACK = ['#5b7fa6', '#8fb0cc', '#dfe9f0', '#3f5d7d']

function escapeXml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hashSeed(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

async function generate() {
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(AVATAR_DIR, { recursive: true })

  let count = 0

  for (const photo of MOCK_PHOTOS) {
    const ratio = photo.width / photo.height

    for (const size of SIZES) {
      const longEdge = size.longEdge
      const target = ratio >= 1
        ? { width: longEdge, height: longEdge / ratio }
        : { width: longEdge * ratio, height: longEdge }

      const svg = buildSvg(photo, target.width, target.height)
      await writeFile(resolve(OUT_DIR, `${photo.id}_${size.suffix}.svg`), svg, 'utf8')
      count += 1
    }
  }

  for (const author of [{ id: 'u1', name: '林', color: '#4a6fa5' }, { id: 'u2', name: '苏', color: '#a5544a' }, { id: 'u3', name: '陈', color: '#4a9a76' }]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${author.color}"/><text x="48" y="49" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="40" fill="#fff">${author.name}</text></svg>`
    await writeFile(resolve(AVATAR_DIR, `${author.id}.svg`), svg, 'utf8')
    count += 1
  }

  console.log(`[gen:mock] 已生成 ${count} 个文件 → public/mock/`)
}

generate().catch((error) => {
  console.error('[gen:mock] 生成失败：', error)
  process.exit(1)
})
