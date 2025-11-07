<template>
  <div v-if="modelValue" class="fixed inset-0 z-40">
    <div class="absolute inset-0 bg-black/50" @click="close"></div>

    <div
      class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl bg-well border border-default rounded-lg shadow-lg z-50">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-default">
        <h3 class="text-lg font-semibold">
          Link Details — {{ link?.title || (link && fallbackTitle(link)) }}
        </h3>
        <button class="btn btn-danger" @click="close">Close</button>
      </div>

      <!-- Body -->

      <div class="px-4 pt-4 pb-4 text-sm text-left space-y-6 overflow-y-auto max-h-[75vh]">
        <!-- Meta / Quick Edit -->
        <section class="space-y-2">
          <div class="space-x-2">
            <span class="text-default font-bold">Type of Link:</span>
            <span :class="badgeClass(link?.type!)">{{ link?.type?.toUpperCase() }}</span>
          </div>

          <div class="break-all space-x-2">
            <span class="text-default font-bold"> Link:</span>
            <a :href="link?.shortUrl" target="_blank" class="hover:underline">{{ link?.shortUrl }}</a>
            <button class="ml-2 text-blue-500 hover:underline text-xs" @click="copy(link?.shortUrl)">Copy</button>
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

          <div class="pt-2">
            <label class="block text-default mb-1">Title</label>
            <input v-model="drawerTitle" class="input-textlike w-full px-3 py-2 rounded" />
          </div>
          <div>
            <label class="block text-default mb-1">Notes</label>
            <textarea v-model="drawerNotes" rows="3" class="input-textlike w-full px-3 py-2 rounded"></textarea>
          </div>
          <div class="flex gap-2 pt-2">
            <button class="px-3 py-2 rounded bg-[#5E56C5]" @click="saveDetails">Save</button>
            <button class="px-3 py-2 rounded border border-default" @click="close">Cancel</button>
          </div>
        </section>

        <!-- Files table -->
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
                  <td v-if="link?.type === 'upload'" class="px-3 py-2 break-all border border-default">{{ f.saved_as ||
                    '—' }}</td>
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

        <!-- Comment access -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AddUsersModal from './AddUsersModal.vue'
import type { LinkItem, LinkType, AccessRow, Status } from '../../typings/electron'

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
const drawerTitle = ref('')
const drawerNotes = ref('')
const drawerPassword = ref('')

const access = ref<AccessRow[]>([])
const accessLoading = ref(false)
const accessModalOpen = ref(false)

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
      uploader_label: f.uploader_name
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
    // Reuse details endpoint so we source from links.js
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

async function saveDetails() {
  if (!props.link) return
  await props.apiFetch(`/api/links/${props.link.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: drawerTitle.value || null,
      notes: drawerNotes.value || null,
    })
  })
  emit('updated', { id: props.link.id, title: drawerTitle.value || null, notes: drawerNotes.value || null })
  close()
}


watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      // seed fields when opening
      drawerTitle.value = props.link?.title || ''
      drawerNotes.value = props.link?.notes || ''
      drawerPassword.value = ''
      fetchDetailsFor()
    }
  },
  { immediate: false }
)

watch(
  () => props.link?.id,
  () => {
    if (props.modelValue) {
      drawerTitle.value = props.link?.title || ''
      drawerNotes.value = props.link?.notes || ''
      fetchDetailsFor()
      loadAccess()
    }
  }
)
</script>