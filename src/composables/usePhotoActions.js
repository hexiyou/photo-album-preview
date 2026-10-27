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
import photoApi from '@/api/photoApi'
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
 * @property {Function} [confirm] 删除前的二次确认，返回 Promise<boolean>
 * @property {Function} [prompt]  重命名输入框，返回 Promise<string|null>
 * @property {Function} [pickFiles] 打开文件选择器，返回 Promise<File[]|null>
 * @property {Function} [onUploaded] 上传完成（拿到新记录列表）
 * @property {Function} [onRenamed]  重命名完成（旧 id + 新记录，因为 id 会变）
 * @property {Function} [onDeleted]  删除完成（被删 id 列表）
 */

const noop = () => {}

/**
 * @param {ActionContext} context
 * @returns {PhotoAction[]}
 */
export function createPhotoActions(context = {}) {
  const {
    photo = null,
    photos = [],
    selectedOnly = false,
    toast = { success: noop, error: noop, info: noop },
    // 交互钩子由 UI 层提供：原生 confirm / prompt 不能跟随主题，也不好定制文案
    confirm = () => Promise.resolve(false),
    prompt = () => Promise.resolve(null),
    pickFiles = () => Promise.resolve(null),
    onUploaded = noop,
    onRenamed = noop,
    onDeleted = noop,
    albumId = ''
  } = context

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
    // -----------------------------------------------------------------------
    // 管理能力（P3）：契约见 API.md §5.11–§5.14
    // 入口是否出现由后端返回的 permissions 决定（§4.10），
    // 后端没给权限就整个隐藏，而不是显示成灰按钮让人以为只是暂时不可用。
    // -----------------------------------------------------------------------
    {
      id: 'upload',
      label: '上传',
      icon: 'upload',
      tone: 'primary',
      visible: () => features.upload,
      disabled: () => false,
      async run() {
        const files = await pickFiles({ multiple: true })
        if (!files?.length) return

        try {
          const result = await photoApi.uploadPhotos(files, { albumId })
          const uploaded = result?.list ?? []
          const failed = result?.failed ?? []

          if (uploaded.length) {
            onUploaded(uploaded)
            toast.success(failed.length ? `已上传 ${uploaded.length} 个，${failed.length} 个失败` : `已上传 ${uploaded.length} 个文件`)
          }
          // 每一条失败都单独提示 —— 契约是"部分成功仍返回 201"
          failed.forEach((item) => toast.error(`${item.fileName || '文件'}：${item.message || '上传失败'}`))
          if (!uploaded.length && !failed.length) toast.info('没有可上传的文件')
        } catch (error) {
          toast.error(`上传失败：${error?.message || '未知错误'}`)
        }
      }
    },
    {
      id: 'rename',
      label: '重命名',
      icon: 'edit',
      tone: 'default',
      // permissions.edit 为 true 才出现（adaptMedia 默认给 false）
      visible: () => features.rename && !!photo && photo.permissions?.edit === true,
      disabled: () => false,
      async run() {
        if (!photo) return

        const name = await prompt({
          title: '重命名',
          message: '修改磁盘上的文件名，扩展名保持不变。',
          label: '文件名',
          value: photo.fileName || photo.displayName || '',
          placeholder: '例如：清晨的海边.jpg'
        })

        if (!name || name === photo.fileName) return

        try {
          const result = await photoApi.renamePhoto(photo.id, name)
          // 后端 id 由路径派生，改名后 id 会变 —— 用 previousId 定位旧记录做替换
          onRenamed(result.previousId || photo.id, result.media)
          toast.success('已重命名')
        } catch (error) {
          toast.error(`重命名失败：${error?.message || '未知错误'}`)
        }
      }
    },
    {
      id: 'delete',
      label: selectedOnly && targets.length > 1 ? `删除 ${targets.length} 个` : '删除',
      icon: 'trash',
      tone: 'danger',
      visible: () => features.delete && targets.length > 0 && targets.every((item) => item.permissions?.delete === true),
      disabled: () => false,
      async run() {
        if (!targets.length) return

        const single = targets.length === 1
        const ok = await confirm({
          title: single ? '删除文件' : `删除 ${targets.length} 个文件`,
          message: single
            ? `「${targets[0].fileName || targets[0].displayName || targets[0].id}」将被移入回收站。\n原目录不再有它，需要时可从回收站找回。`
            : `${targets.length} 个文件将被移入回收站。\n原目录不再有它们，需要时可从回收站找回。`,
          tone: 'danger',
          confirmText: '移入回收站'
        })
        if (!ok) return

        const ids = targets.map((item) => item.id)
        try {
          const result = await photoApi.deletePhotos(ids)
          onDeleted(ids)
          const count = Number(result?.deleted ?? ids.length)
          toast.success(count > 1 ? `已移入回收站：${count} 个文件` : '已移入回收站')
          if (result?.failed?.length) {
            result.failed.forEach((item) => toast.error(`${item.id}：${item.message || '删除失败'}`))
          }
        } catch (error) {
          toast.error(`删除失败：${error?.message || '未知错误'}`)
        }
      }
    }
  ]

  return actions.filter((action) => typeof action.visible === 'function' ? action.visible() : true)
}

export default createPhotoActions
