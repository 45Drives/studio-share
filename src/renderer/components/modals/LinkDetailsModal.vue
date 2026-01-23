<template>
  <div v-if="modelValue" class="fixed inset-0 z-40">
    <div class="absolute inset-0 bg-black/50" @click="close"></div>

    <div
      class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl bg-accent border border-default rounded-lg shadow-lg z-50">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-default">
        <h3 class="text-lg font-semibold">
          Link Details — {{ link?.title || (link && fallbackTitle(link)) }}
        </h3>

        <div class="flex items-center gap-2">
          <button v-if="!editMode" class="btn btn-primary" @click="beginEdit" :disabled="!link">Edit</button>

          <button v-else class="btn btn-success" @click="saveAll" :disabled="saving">
            Save Changes
          </button>
          <button v-if="editMode" class="btn btn-secondary" @click="cancelEdit" :disabled="saving">
            Cancel
          </button>

          <button class="btn btn-danger" @click="close">Close</button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-4 pt-4 pb-4 text-sm text-left space-y-6 overflow-y-auto max-h-[75vh]">
        <!-- Meta -->
        <section class="space-y-2">
          <div class="space-x-2">
            <span class="text-default font-bold">Type of Link:</span>
            <span :class="badgeClass(link?.type!)">{{ link?.type?.toUpperCase() }}</span>
          </div>

          <div class="break-all space-x-2">
            <span class="text-default font-bold">Link:</span>
            <a :href="primaryUrl" target="_blank" rel="noopener" class="hover:underline">{{ primaryUrl }}</a>
            <button class="ml-2 text-blue-500 hover:underline text-xs" @click="copy(primaryUrl)">Copy</button>
          </div>

          <div v-if="downloadUrl" class="break-all space-x-2">
            <span class="text-default font-bold">Download:</span>
            <a :href="downloadUrl" target="_blank" rel="noopener" class="hover:underline">{{ downloadUrl }}</a>
            <button class="ml-2 text-blue-500 hover:underline text-xs" @click="copy(downloadUrl)">Copy</button>
          </div>

          <div class="space-x-2">
            <span class="text-default font-bold">Created:</span>
            {{ link ? new Date(link.createdAt).toLocaleString() : '' }}
          </div>

          <div class="space-x-2">
            <span class="text-default font-bold">Expires:</span>
            {{ link?.expiresAt ? new Date(link.expiresAt).toLocaleString() : 'Never' }}
          </div>

          <div class="space-x-2">
            <span class="text-default font-bold">Status:</span>
            <span :class="statusChipClass(statusOf(link!))">{{ link ? statusOf(link).toUpperCase() : '' }}</span>
          </div>
        </section>

        <!-- Edit fields (view vs edit) -->
        <section class="space-y-3">
          <div>
            <label class="block text-default mb-1">Title</label>
            <template v-if="editMode">
              <input v-model="draftTitle" class="input-textlike bg-default w-full px-3 py-2 rounded" />
            </template>
            <template v-else>
              <div class="px-3 py-2 rounded border border-default bg-default/30">
                {{ link?.title || '—' }}
              </div>
            </template>
          </div>

          <div>
            <label class="block text-default mb-1">Notes</label>
            <template v-if="editMode">
              <textarea v-model="draftNotes" rows="3" class="input-textlike w-full px-3 py-2 rounded"></textarea>
            </template>
            <template v-else>
              <div class="px-3 py-2 rounded border border-default bg-default/30 whitespace-pre-wrap">
                {{ link?.notes || '—' }}
              </div>
            </template>
          </div>

          <!-- Download/Collection: manage files -->
          <div v-if="editMode && isDownloadish" class="pt-2 space-y-2">
            <div class="flex items-center justify-between">
              <div class="text-default font-semibold">
                Files for this link
              </div>
              <button class="btn btn-secondary" @click="openFilesEditor">
                Manage files…
              </button>
            </div>

            <div class="text-xs opacity-70">
              {{ draftFilePaths.length }} selected
              <span v-if="filesDirty" class="ml-2 text-amber-400">Pending changes</span>
            </div>

            <div v-if="draftFilePaths.length"
              class="rounded border border-default bg-default/30 max-h-40 overflow-auto">
              <div v-for="(p, i) in draftFilePaths" :key="p + ':' + i"
                class="px-3 py-2 border-b border-default break-all last:border-b-0">
                <code>{{ p }}</code>
              </div>
            </div>
            <div v-else class="text-sm opacity-70">No files selected.</div>
          </div>

          <!-- Upload: change destination -->
          <div v-if="editMode && link?.type === 'upload'" class="pt-2 space-y-2">
            <div class="text-default font-semibold">Upload destination</div>

            <div class="flex flex-col gap-2">
              <div class="text-xs opacity-70">
                Choose where uploaded files will be stored for this link.
              </div>

              <div class="flex flex-row gap-2 items-center">
                <span class="whitespace-nowrap">Destination folder:</span>
                <PathInput v-model="draftUploadDir" :apiFetch="apiFetch" :dirsOnly="true" />
              </div>

              <div class="text-xs opacity-70">
                Current: <code>{{ currentUploadDir || '—' }}</code>
                <span v-if="uploadDirDirty" class="ml-2 text-amber-400">Pending changes</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Files table (still shown in view mode; in edit mode it remains informational) -->
        <section class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold">
              {{ link?.type === 'upload' ? 'Uploaded Files' : 'Shared Files' }}
            </h4>
            <div class="text-xs opacity-70" v-if="!detailsLoading">{{ files.length }} item(s)</div>
          </div>

          <div v-if="detailsLoading" class="text-sm opacity-70">Loading…</div>
          <div v-else-if="files.length === 0" class="text-sm opacity-70">No files.</div>

          <div class="overflow-x-auto h-80 overflow-y-auto overscroll-y-contain rounded-lg border border-default mb-6">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-default text-gray-300">
                  <th class="text-left px-3 py-2 border border-default">Name</th>
                  <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">Saved As</th>
                  <th class="text-right px-3 py-2 border border-default">Size</th>
                  <th class="text-left px-3 py-2 border border-default">MIME</th>
                  <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">Uploader</th>
                  <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">IP</th>
                  <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">When</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in files" :key="f.key" class="border-t border-default">
                  <td class="px-3 py-2 break-all border border-default">{{ f.name }}</td>
                  <td v-if="link?.type === 'upload'" class="px-3 py-2 break-all border border-default">
                    {{ f.saved_as || '—' }}
                  </td>
                  <td class="px-3 py-2 text-right border border-default">{{ fmtBytes(f.size) }}</td>
                  <td class="px-3 py-2 border border-default">{{ f.mime || '—' }}</td>
                  <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">{{ f.uploader_label || '—'
                    }}</td>
                  <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">{{ f.ip || '—' }}</td>
                  <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">
                    {{ f.ts ? new Date(f.ts).toLocaleString() : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Comment access (unchanged) -->
        <section v-if="link?.type?.toUpperCase() != 'UPLOAD'" class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold">Comment access</h4>
            <div class="flex items-center gap-2">
              <span class="text-xs opacity-70" v-if="!accessLoading">{{ access.length }} user(s)</span>
              <button class="btn btn-primary" @click="openAccessModal">Add users…</button>
            </div>
          </div>

          <div v-if="accessLoading" class="text-sm opacity-70">Loading…</div>
          <div v-else-if="!access.length" class="text-sm opacity-70">No users currently have comment access.</div>

          <div v-else class="overflow-x-auto rounded-lg border border-default">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-default text-gray-300">
                  <th class="text-left px-3 py-2 border border-default">Name</th>
                  <th class="text-left px-3 py-2 border border-default">Username</th>
                  <th class="text-left px-3 py-2 border border-default">Email</th>
                  <th class="text-left px-3 py-2 border border-default">Color</th>
                  <th class="text-left px-3 py-2 border border-default">Granted</th>
                  <th class="text-right px-3 py-2 border border-default">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in access" :key="u.user_id" class="border-t border-default">
                  <td class="px-3 py-2 border border-default break-all">
                    <div class="flex items-center gap-2">
                      <span>{{ u.name || '—' }}</span>

                      <span v-if="u.is_disabled"
                        class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-default/70 text-amber-400 border border-amber-500/30"
                        title="This user account is disabled">
                        Deleted
                      </span>
                    </div>
                  </td>

                  <td class="px-3 py-2 border border-default break-all">{{ u.user_name || '—' }}</td>
                  <td class="px-3 py-2 border border-default break-all">{{ u.user_email || '—' }}</td>
                  <td class="px-3 py-2 border border-default">
                    <span v-if="u.display_color" class="inline-block w-4 h-4 rounded border align-middle"
                      :style="{ backgroundColor: u.display_color }" :title="u.display_color" />
                    <span v-else class="opacity-60">—</span>
                  </td>
                  <td class="px-3 py-2 border border-default">
                    {{ u.granted_at ? new Date(u.granted_at).toLocaleString() : '—' }}
                  </td>
                  <td class="px-3 py-2 border border-default text-right">
                    <button class="btn btn-danger px-2 py-1 text-xs" @click="removeAccess(u.user_id)">Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <AddUsersModal v-model="accessModalOpen" :apiFetch="apiFetch" :preselected="access.map(a => ({
            id: a.user_id,
            username: a.user_name || '',
            name: a.name || '',
            user_email: a.user_email || '',
            display_color: a.display_color || ''
          }))" @apply="mergeAccessFromModal" />
        </section>
      </div>

      <!-- Files editor modal -->
      <EditLinkFilesModal v-model="filesEditorOpen" :apiFetch="apiFetch"
        :linkType="(link?.type === 'download' ? 'download' : 'collection')" :initialPaths="draftFilePaths"
        :base="linkProjectBase" :startDir="linkStartDir" @apply="onApplyFilePaths" />

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AddUsersModal from './AddUsersModal.vue'
import EditLinkFilesModal from './EditLinkFilesModal.vue'
import PathInput from '../PathInput.vue'
import type { LinkItem, LinkType, AccessRow, Status } from '../../typings/electron'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

const props = defineProps<{
  modelValue: boolean
  link: LinkItem | null
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated', payload: Partial<LinkItem> & { id: LinkItem['id'] }): void
}>()

const detailsLoading = ref(false)
const files = ref<any[]>([])
const access = ref<AccessRow[]>([])
const accessLoading = ref(false)
const accessModalOpen = ref(false)

const editMode = ref(false)
const saving = ref(false)

const draftTitle = ref('')
const draftNotes = ref('')

const filesEditorOpen = ref(false)
const draftFilePaths = ref<string[]>([])
const originalFilePaths = ref<string[]>([])

const draftUploadDir = ref('')
const originalUploadDir = ref('')

const isDownloadish = computed(() => props.link?.type === 'download' || props.link?.type === 'collection')

const currentUploadDir = computed(() => {
  const it = props.link
  if (!it || it.type !== 'upload') return ''
  return (it.target?.dirRel || (it as any).dirRel || '') as string
})

const primaryUrl = computed(() => {
  const it: any = props.link
  return (it?.url || it?.viewUrl || '') as string
})

const downloadUrl = computed(() => {
  const it: any = props.link
  return (it?.downloadUrl || '') as string
})


function canonPaths(arr: string[]) {
  return (arr || [])
    .map(normalizeAbs)
    .filter(Boolean)
    .slice()
    .sort()
}

const filesDirty = computed(() => {
  const a = canonPaths(draftFilePaths.value)
  const b = canonPaths(originalFilePaths.value)
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
})

const uploadDirDirty = computed(() => (draftUploadDir.value || '') !== (originalUploadDir.value || ''))

function normalizeAbs(p: string) {
  const s = (p || '').trim()
  if (!s) return ''
  return s.startsWith('/') ? s : '/' + s.replace(/^\/+/, '')
}

function inferBaseFromPaths(paths: string[]) {
  const first = (paths || []).map(normalizeAbs).find(Boolean)
  if (!first) return ''
  const seg = first.split('/').filter(Boolean)[0]
  return seg ? '/' + seg : ''
}

const linkProjectBase = computed(() => {
  // Use whatever you actually have on LinkItem, if present.
  // Examples you might have: link.projectBase, link.target.projectBase, etc.
  const it: any = props.link as any
  const pb = (it?.projectBase || it?.target?.projectBase || '').trim()
  if (pb) return pb

  // Fallback: infer from existing draft paths or detail files
  return inferBaseFromPaths(draftFilePaths.value.length ? draftFilePaths.value : originalFilePaths.value)
})

const linkStartDir = computed(() => linkProjectBase.value || '/')

function close() {
  emit('update:modelValue', false)
}

function openAccessModal() {
  accessModalOpen.value = true
}

function badgeClass(t?: LinkType) {
  if (!t) return ''
  return t === 'upload' ? 'text-blue-500' : t === 'download' ? 'text-emerald-500' : 'text-purple-500'
}
function statusChipClass(s: Status) {
  return s === 'active' ? 'text-green-500' : s === 'expired' ? 'text-amber-500' : 'text-gray-500'
}
function statusOf(it: LinkItem): Status {
  if (it.isDisabled) return 'disabled'
  if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
  return 'active'
}
function fallbackTitle(it: LinkItem) {
  if (it.type === 'upload') return it.target?.dirRel || '(Upload)'
  const n = it.target?.files?.length || (it.type === 'download' ? 1 : 0)
  if (n === 1) return it.target?.files?.[0]?.name || '1 File'
  return `${n} Files`
}
async function copy(txt?: string | null) {
  if (!txt) return
  await navigator.clipboard.writeText(txt)
}

function fmtBytes(n?: number) {
  if (n === undefined || n === null) return '—'
  const k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n
  while (v >= k && i < u.length - 1) { v /= k; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

async function fetchDetailsFor() {
  if (!props.link) return
  detailsLoading.value = true
  files.value = []
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/details`)
    files.value = (resp.files || []).map((f: any, idx: number) => ({
      key: `f${idx}`,
      ...f,
      uploader_label: f.uploader_name,
      relPath: f.relPath ?? f.path ?? f.p ?? null
    }))

    if (Array.isArray(resp.commenters)) {
      access.value = resp.commenters.map((c: any) => ({
        user_id: c.user_id,
        user_name: c.user_name,
        name: c.name,
        user_email: c.user_email,
        display_color: c.display_color ?? null,
        granted_at: c.granted_at ?? null,
        is_disabled: !!c.is_disabled,
      }))
    } else {
      access.value = []
    }
  } finally {
    detailsLoading.value = false
  }
}

async function loadAccess() {
  if (!props.link) return
  accessLoading.value = true
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/details`)
    access.value = Array.isArray(resp.commenters)
      ? resp.commenters.map((c: any) => ({
        user_id: c.user_id,
        user_name: c.user_name,
        name: c.name,
        user_email: c.user_email,
        display_color: c.display_color ?? null,
        granted_at: c.granted_at ?? null,
        is_disabled: !!c.is_disabled,
      }))
      : []
  } catch {
    access.value = []
  } finally {
    accessLoading.value = false
  }
}

function buildCommentersPayload(users: Array<{ id?: number; username?: string; name?: string; user_email?: string }>) {
  return users
    .map(u => {
      const out: any = {}
      if (u.id != null) out.userId = u.id
      if (u.username) out.username = u.username
      if (u.user_email) out.user_email = u.user_email
      if (u.name) out.name = u.name
      return out
    })
    .filter(x => x.userId != null || x.username || x.user_email)
}

async function mergeAccess(users: Array<{ id?: number; username?: string; name?: string; user_email?: string }>) {
  if (!props.link) return
  const payload = { commenters: buildCommentersPayload(users) }
  await props.apiFetch(`/api/links/${props.link.id}/access/merge`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  await loadAccess()
}

async function mergeAccessFromModal(users: Array<{ username: string; name?: string; user_email?: string; display_color?: string }>) {
  try {
    await mergeAccess(users)
    await loadAccess()
    accessModalOpen.value = false
  } catch { }
}

async function removeAccess(userId: number) {
  if (!props.link) return
  if (!confirm('Remove comment access for this user?')) return
  await props.apiFetch(`/api/links/${props.link.id}/access/${userId}`, { method: 'DELETE' })
  await loadAccess()
}

function beginEdit() {
  if (!props.link) return
  editMode.value = true

  draftTitle.value = props.link.title || ''
  draftNotes.value = (props.link as any).notes || ''

  // Seed upload destination
  if (props.link.type === 'upload') {
    const cur = currentUploadDir.value || ''
    draftUploadDir.value = cur
    originalUploadDir.value = cur
  } else {
    draftUploadDir.value = ''
    originalUploadDir.value = ''
  }

  // Seed file paths for download/collection
  if (isDownloadish.value) {
    const fromDetails = files.value
      .map(f => f?.relPath)
      .filter((p: any) => typeof p === 'string' && p.trim().length > 0) as string[]

    const seeded = fromDetails.length
      ? fromDetails
      : (props.link.target?.files || []).map((f: any) => f?.relPath || f?.path || f?.p).filter(Boolean)

    draftFilePaths.value = Array.isArray(seeded)
      ? seeded.map(normalizeAbs).filter(Boolean)
      : []
    originalFilePaths.value = draftFilePaths.value.slice()
  } else {
    draftFilePaths.value = []
    originalFilePaths.value = []
  }
}

function cancelEdit() {
  editMode.value = false

  draftTitle.value = props.link?.title || ''
  draftNotes.value = (props.link as any)?.notes || ''

  draftFilePaths.value = originalFilePaths.value.slice()
  draftUploadDir.value = originalUploadDir.value || currentUploadDir.value || ''
}

function openFilesEditor() {
  if (!props.link) return
  if (!(props.link.type === 'download' || props.link.type === 'collection')) return
  filesEditorOpen.value = true
}

function onApplyFilePaths(paths: string[]) {
  draftFilePaths.value = paths.slice()
}

async function saveAll() {
  if (!props.link) return

  // Optional: prevent duplicate clicks
  if (saving.value) return

  saving.value = true

  // Helpers
  const id = props.link.id

  function toRel(p: string) {
    return (p || '').replace(/^\/+/, '')
  }

  function apiErrMsg(e: any) {
    return e?.message || e?.error || String(e || 'Request failed')
  }

  // Track what we actually attempted (for better messaging)
  const did = {
    details: false,
    files: false,
    uploadDest: false,
  }

  try {
    // Compute change flags up front
    const titleChanged = (draftTitle.value || '') !== (props.link.title || '')
    const notesChanged = (draftNotes.value || '') !== (((props.link as any).notes) || '')

    const shouldUpdateDetails = titleChanged || notesChanged
    const shouldUpdateFiles = isDownloadish.value && filesDirty.value
    const shouldUpdateUploadDest = props.link.type === 'upload' && uploadDirDirty.value

    // 1) Title/notes
    if (shouldUpdateDetails) {
      try {
        await props.apiFetch(`/api/links/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: draftTitle.value || null,
            notes: draftNotes.value || null,
          }),
        })
        did.details = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Save Link Details',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 2) Files (download/collection)
    let filesResp: any | null = null
    if (shouldUpdateFiles) {
      const body = { filePaths: draftFilePaths.value.map(toRel) }

      try {
        filesResp = await props.apiFetch(`/api/links/${id}/files`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        did.files = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Update Link Files',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 3) Upload destination (use response for accurate rel path)
    let uploadResp: any | null = null
    if (shouldUpdateUploadDest) {
      try {
        uploadResp = await props.apiFetch(`/api/links/${id}/upload-destination`, {
          method: 'PUT',
          body: JSON.stringify({ path: draftUploadDir.value }),
        })
        did.uploadDest = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Update Upload Destination',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // Refresh visible data (files table + commenters)
    try {
      await fetchDetailsFor()
    } catch {
      // Non-fatal: UI can still exit edit mode since saves succeeded
    }

    // Normalize what we store as the "original" clean state
    originalFilePaths.value = draftFilePaths.value.slice()

    // If upload destination was changed, prefer server-returned rel dir
    if (did.uploadDest && uploadResp && typeof uploadResp.dirRel === 'string') {
      originalUploadDir.value = uploadResp.dirRel
      // If your UI expects PathInput to show absolute paths, don't overwrite draftUploadDir here.
      // If PathInput can display rel paths fine, you may set it too:
      // draftUploadDir.value = uploadResp.dirRel
    } else {
      originalUploadDir.value = draftUploadDir.value
    }

    // Emit accurate updated payload
    const updatedPayload: any = {
      id,
      title: draftTitle.value || null,
      notes: draftNotes.value || null,
    }

    if (did.files && filesResp && typeof filesResp.type === 'string') {
      updatedPayload.type = filesResp.type
      updatedPayload.filesCount = draftFilePaths.value.length
      updatedPayload.target = { ...(props.link.target || {}), files: draftFilePaths.value.map(p => ({ p: toRel(p) })) }
    }

    emit('updated', updatedPayload)

    // Optional success notification (only if something changed)
    if (did.details || did.files || did.uploadDest) {
      close();
      pushNotification(
        new Notification(
          'Saved',
          'Link changes were saved successfully.',
          'success',
          6000
        )
      )
    }

    editMode.value = false
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      editMode.value = false
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      fetchDetailsFor()
      loadAccess()
    }
  },
  { immediate: false }
)

watch(
  () => props.link?.id,
  () => {
    if (props.modelValue) {
      editMode.value = false
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      fetchDetailsFor()
      loadAccess()
    }
  }
)
</script>
