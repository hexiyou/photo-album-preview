/**
 * 图片操作注册表（Actions Registry）
 * ---------------------------------------------------------------------------
 * 工具栏按钮、卡片悬浮菜单、大图查看器按钮都不再硬编码，而是从这里取。
 *
 * 后续要加「上传 / 重命名 / 删除」时，只需要：
 *   1. 在本文件的 actions 里新增一个描述对象；
 *   2. 把 features 里对应的开关打开。
 * 三处 UI（工具栏、卡片、查看器）会自动出现按钮，无需改动组件。
 */

import features from '@/config/album.config'
import { downloadPhoto, downloadPhotos } from '@/utils/download'

/**
 * @typedef {object} PhotoAction
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {'default'|'primary'|'danger'} tone
 * @property {(ctx: ActionContext) => boolean} visible
 * @property {(ctx: ActionContext) => boolean} disabled
 * @property {(ctx: ActionContext) => void|Promise<void>} run
 * @property {string[]} shortcut 键盘快捷键（查看器内生效）
 */

/**
 * @typedef {object} ActionContext
 * @property {object|null} photo
 * @property {object[]} photos
 * @property {boolean} selectedOnly
 * @property {object} toast
 * @property {Function} [refresh]
 */

const noop = () => {}

/**
 * @param {ActionContext} context
 * @returns {PhotoAction[]}
 */
export function createPhotoActions(context = {}) {
  const { photo = null, photos = [], selectedOnly = false, toast = { success: noop, error: noop } } = context
  const targets = selectedOnly && photos.length ? photos : photo ? [photo] : []

  const actions = [
    {
      id: 'download',
      label: selectedOnly ? `下载 ${photos.length} 张` : '下载照片',
      icon: 'download',
      tone: 'primary',
      visible: () => features.download && (targets.length > 0),
      disabled: () => (targets.length === 1 ? targets[0].permissions?.download === false : false),
      shortcut: ['d'],
      async run() {
        try {
          if (targets.length === 1) {
            await downloadPhoto(targets[0])
            toast.success(`已开始下载：${targets[0].downloadName}`)
          } else {
            await downloadPhotos(targets)
            toast.success(`已开始下载 ${targets.length} 张照片`)
          }
        } catch (error) {
          toast.error(`下载失败：${error?.message || '未知错误'}`)
        }
      }
    },

    // -----------------------------------------------------------------------
    // 以下动作为后续预留：开关打开后自动出现在 UI 上。
    // 接入方式：把 run 里的占位实现替换为对应的 photoApi 调用即可。
    // -----------------------------------------------------------------------
    {
      id: 'upload',
      label: '上传照片',
      icon: 'upload',
      tone: 'primary',
      visible: () => features.upload,
      disabled: () => false,
      async run() {
        toast.info('上传能力开发中：后端接口就绪后启用')
      }
    },
    {
      id: 'rename',
      label: '重命名',
      icon: 'edit',
      tone: 'default',
      visible: () => features.rename && !!photo,
      disabled: () => photo?.permissions?.edit === false,
      async run() {
        toast.info('重命名能力开发中：后端接口就绪后启用')
      }
    },
    {
      id: 'delete',
      label: '删除照片',
      icon: 'trash',
      tone: 'danger',
      visible: () => features.delete && targets.length > 0,
      disabled: () => targets.some((item) => item.permissions?.delete === false),
      async run() {
        toast.info('删除能力开发中：后端接口就绪后启用')
      }
    }
  ]

  return actions.filter((action) => typeof action.visible === 'function' ? action.visible() : true)
}

export default createPhotoActions
