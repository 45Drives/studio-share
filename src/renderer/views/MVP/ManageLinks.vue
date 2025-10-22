<template>
    <div class="min-h-screen bg-[#1f2125] text-gray-100">
      <section class="mx-auto w-11/12 xl:w-9/12 mt-8 bg-[#24272e] rounded-lg border border-[#5E56C5]/60 shadow">
        <div class="rounded-t-lg bg-[#5E56C5] text-white px-4 py-2 text-center font-semibold">
          Currently Active Links
        </div>
  
        <div class="p-4">
          <div class="flex flex-wrap gap-2 mb-3">
            <input v-model="q" type="search" placeholder="Search title / dir / file..."
                   class="px-3 py-2 border border-[#2a2d33] rounded-lg text-white  w-64"  style="background-color: #1f2125; color:white"/>
            <select v-model="typeFilter" class="px-3 py-2 border border-[#2a2d33] rounded-lg bg-[#1f2125]">
              <option value="">All types</option>
              <option value="upload">Upload</option>
              <option value="download">Share (file)</option>
              <option value="collection">Share (collection)</option>
            </select>
            <select v-model="statusFilter" class="px-3 py-2 border border-[#2a2d33] rounded-lg bg-[#1f2125]">
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="disabled">Disabled</option>
            </select>

          </div>
  
          <!-- errors -->
          <div v-if="error" class="p-3 rounded bg-red-900/30 text-red-200 border border-red-800 mb-3">
            {{ error }}
          </div>
          <div v-if="loading" class="p-3 text-sm opacity-80">Loading…</div>
  
          <!-- table -->
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm border border-[#2a2d33] border-collapse">
              <thead>
                <tr class="bg-[#2a2d33] text-gray-300 border-b border-[#2a2d33]">
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Title</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Type</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Short Link</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Expires</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Status</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Password</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Created</th>
                  <th class="text-left px-4 py-2 font-semibold border border-[#2a2d33]">Actions</th>
                </tr>
              </thead>

              <tbody>
                <tr v-if="!loading && filteredRows.length === 0">
                  <td colspan="8" class="px-4 py-6 text-center text-gray-400 border border-[#2a2d33]">
                    No links found.
                  </td>
                </tr>

                <tr v-for="it in filteredRows" :key="it.id"
                    class="hover:bg-white/5 transition border border-[#2a2d33]">
                  <!-- Title -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <div v-if="editingId !== it.id" class="flex items-center gap-2">
                      <span class="font-medium cursor-pointer" @click="openDetails(it)">
                        {{ it.title || fallbackTitle(it) }}
                      </span>
                      <button class="text-xs text-blue-300 hover:underline" @click="startEdit(it)">Edit</button>
                    </div>
                    <div v-else class="flex items-center gap-2">
                      <input v-model="editTitle" class="px-2 py-1 rounded bg-[#1f2125] border border-[#2a2d33] w-56" />
                      <button class="px-2 py-1 rounded bg-[#5E56C5]" @click="saveTitle(it)">Save</button>
                      <button class="px-2 py-1 rounded border border-[#2a2d33]" @click="cancelEdit">Cancel</button>
                    </div>
                  </td>

                  <!-- Type -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                          :class="badgeClass(it.type)">{{ typeLabel(it.type) }}</span>
                  </td>

                  <!-- Short link -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <div class="flex items-center gap-2">
                      <a :href="it.shortUrl" target="_blank" rel="noopener" class="underline truncate max-w-[22rem]">
                        {{ it.shortUrl }}
                      </a>
                      <button class="text-blue-300 hover:underline text-xs" @click="copy(it.shortUrl)">Copy</button>
                    </div>
                  </td>

                  <!-- Expires -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <div :class="expiresClass(it)">{{ expiresLabel(it) }}</div>

                    <!-- quick actions -->
                    <div class="flex flex-wrap items-center gap-1 mt-1">
                      <button class="px-1.5 py-0.5 text-xs rounded border border-[#2a2d33] text-red-300" @click="makeNever(it)">Never</button>
                      <button class="px-1.5 py-0.5 text-xs rounded border border-[#2a2d33]" @click="openCustom(it)">Custom</button>
                    </div>

                    <!-- custom editor -->
                    <div v-if="expEditor[it.id]?.open" class="mt-2 flex items-center gap-2 text-xs">
                      <label class="flex items-center gap-1">
                        <span class="opacity-70">Days</span>
                        <input
                          type="number" min="0"
                          class="w-16 px-2 py-1 rounded bg-[#1f2125] border border-[#2a2d33]"  style="background-color: #1f2125; color:white"
                          v-model.number="expEditor[it.id].days"
                        />
                      </label>
                      <label class="flex items-center gap-1">
                        <span class="opacity-70">Hours</span>
                        <input
                          type="number" min="0"
                          class="w-16 px-2 py-1 rounded bg-[#1f2125] border border-[#2a2d33]" style="background-color: #1f2125; color:white"
                          v-model.number="expEditor[it.id].hours"
                        />
                      </label>
                      <button
                        class="px-2 py-1 rounded bg-[#5E56C5]"
                        @click="applyCustom(it)"
                      >
                        Apply
                      </button>
                      <button
                        class="px-2 py-1 rounded border border-[#2a2d33]"
                        @click="closeCustom(it)"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>


                  <!-- Status -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                          :class="statusChipClass(statusOf(it))">{{ statusOf(it) }}</span>
                  </td>

                  <!-- Password -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <span class="text-xs">{{ it.passwordRequired ? 'Yes' : 'No' }}</span>
                    <!-- <button class="ml-2 text-blue-300 hover:underline text-xs" @click="openDetails(it)">Manage</button> -->
                  </td>

                  <!-- Created -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <div>{{ new Date(it.createdAt).toLocaleDateString() }}</div>
                    <div class="text-xs text-gray-500">{{ new Date(it.createdAt).toLocaleTimeString() }}</div>
                  </td>

                  <!-- Actions -->
                  <td class="px-4 py-2 border border-[#2a2d33]">
                    <div class="flex flex-wrap gap-2">
                      <button class="px-2 py-1 rounded bg-[#5E56C5]" @click="viewLink(it)">Open</button>
                      <button class="px-2 py-1 rounded border border-[#2a2d33]" @click="copy(it.shortUrl)">Copy</button>
                      <button class="px-2 py-1 rounded border border-[#2a2d33]"
                              :class="statusOf(it) === 'disabled' ? '' : 'bg-yellow-50/10'"
                              @click="toggleDisable(it)">
                        {{ statusOf(it) === 'disabled' ? 'Enable' : 'Disable' }}
                      </button>
                      <button class="px-2 py-1 rounded border border-[#2a2d33]" @click="openDetails(it)">
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
  
      <!-- Footer -->
      <footer class="mt-10 mb-8 flex items-center justify-center gap-6">
        <button class="px-6 py-2.5 rounded-lg bg-[#d61d4a]">Log Out</button>
        <button class="px-6 py-2.5 rounded-lg bg-[#5E56C5]">Settings</button>
      </footer>
      <!-- Details modal -->
      <div v-if="showModal" class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>

      <div class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl
                  bg-[#24272e] border border-[#2a2d33] rounded-lg shadow-lg z-50">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-[#2a2d33]">
          <h3 class="text-lg font-semibold">
            Link Details — {{ current?.title || (current && fallbackTitle(current)) }}
          </h3>
          <button class="px-2 py-1 rounded border border-[#2a2d33]" @click="closeModal">Close</button>
        </div>

        <!-- Meta -->
        <div class="px-4 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
          <section class="space-y-2">
            <div><span class="text-gray-400">Type:</span> {{ current?.type }}</div>
            <div class="break-all">
              <span class="text-gray-400">Short Link:</span>
              <a :href="current?.shortUrl" target="_blank" class="underline">{{ current?.shortUrl }}</a>
              <button class="ml-2 text-blue-300 hover:underline text-xs" @click="copy(current?.shortUrl)">Copy</button>
            </div>
            <div><span class="text-gray-400">Created:</span> {{ current ? new Date(current.createdAt).toLocaleString() : '' }}</div>
            <div><span class="text-gray-400">Expires:</span> {{ current?.expiresAt ? new Date(current.expiresAt).toLocaleString() : 'Never' }}</div>
            <div><span class="text-gray-400">Status:</span> {{ current ? statusOf(current) : '' }}</div>

            <!-- quick edit -->
            <div class="pt-2">
              <label class="block text-gray-300 mb-1">Title</label>
              <input v-model="drawerTitle" class="w-full px-3 py-2 rounded bg-[#1f2125] border border-[#2a2d33]" />
            </div>
            <div>
              <label class="block text-gray-300 mb-1">Notes</label>
              <textarea v-model="drawerNotes" rows="3" class="w-full px-3 py-2 rounded bg-[#1f2125] border border-[#2a2d33]"></textarea>
            </div>
            <div class="flex gap-2 pt-2">
              <button class="px-3 py-2 rounded bg-[#5E56C5]" @click="saveDetails">Save</button>
              <button class="px-3 py-2 rounded border border-[#2a2d33]" @click="closeModal">Cancel</button>
            </div>
          </section>

          <!-- Files table -->
          <section class="lg:col-span-2">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-semibold">
                {{ current?.type === 'upload' ? 'Uploaded Files' : 'Shared Files' }}
              </h4>
              <div class="text-xs opacity-70" v-if="!detailsLoading">{{ files.length }} item(s)</div>
            </div>

            <div v-if="detailsLoading" class="text-sm opacity-70">Loading…</div>
            <div v-else-if="files.length === 0" class="text-sm opacity-70">No files.</div>
            <div class="overflow-x-auto h-80 overflow-y-auto overscroll-y-contain rounded-lg border border-[#2a2d33] mb-6">
                <table class="min-w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr class="bg-[#2a2d33] text-gray-300">
                      <th class="text-left px-3 py-2 border border-[#2a2d33]">Name</th>
                      <th v-if="current?.type==='upload'" class="text-left px-3 py-2 border border-[#2a2d33]">Saved As</th>
                      <th class="text-right px-3 py-2 border border-[#2a2d33]">Size</th>
                      <th class="text-left px-3 py-2 border border-[#2a2d33]">MIME</th>
                      <th v-if="current?.type==='upload'" class="text-left px-3 py-2 border border-[#2a2d33]">Uploader</th>
                      <th v-if="current?.type==='upload'" class="text-left px-3 py-2 border border-[#2a2d33]">IP</th>
                      <th class="text-left px-3 py-2 border border-[#2a2d33]">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in files" :key="f.key" class="border-t border-[#2a2d33]">
                      <td class="px-3 py-2 break-all border border-[#2a2d33]">{{ f.name }}</td>
                      <td v-if="current?.type==='upload'" class="px-3 py-2 break-all border border-[#2a2d33]">{{ f.saved_as || '—' }}</td>
                      <td class="px-3 py-2 text-right border border-[#2a2d33]">{{ fmtBytes(f.size) }}</td>
                      <td class="px-3 py-2 border border-[#2a2d33]">{{ f.mime || '—' }}</td>
                      <td v-if="current?.type==='upload'" class="px-3 py-2 border border-[#2a2d33]">{{ f.uploader_label || '—' }}</td>
                      <td v-if="current?.type==='upload'" class="px-3 py-2 border border-[#2a2d33]">{{ f.ip || '—' }}</td>
                      <td class="px-3 py-2 border border-[#2a2d33]">{{ f.ts ? new Date(f.ts).toLocaleString() : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>


    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, onMounted, watch } from 'vue'
  import { useApi } from '../../composables/useApi'
  
  type LinkType = 'upload' | 'download' | 'collection'
  type Status = 'active' | 'expired' | 'disabled'
  
  interface LinkItem {
    id: number | string
    type: LinkType
    title?: string | null
    notes?: string | null
    token?: string | null          // include if your API wants to expose it in details
    shortUrl: string
    createdAt: number
    expiresAt: number | null
    isDisabled: boolean
    passwordRequired?: boolean
    createdIp?: string | null
    createdUa?: string | null
    owner?: { id?: number|string|null, username?: string|null, display_name?: string|null }
    target?: { dirRel?: string; allowUpload?: boolean; files?: Array<{ id?: string; name?: string; size?: number; mime?: string }> }
  }
  
  const { apiFetch } = useApi()
  async function refresh() {
  loading.value = true
  error.value = null
  try {
    const { items } = await listLinks({
      q: q.value.trim() || undefined,
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      limit: pageSize.value,
    })
    rows.value = items
  } catch (e:any) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}
// const showDrawer = ref(false)
const showModal = ref(false)
const expEditor = ref<Record<string | number, { days: number; hours: number; open: boolean }>>({})

onMounted(refresh)

  /* ----------- fetch/list endpoints ----------- */
  async function listLinks(params: { q?: string; type?: ''|LinkType; status?: ''|Status; limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.type) qs.set('type', params.type)
    if (params.status) qs.set('status', params.status)
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    return apiFetch(`/api/links?${qs.toString()}`)
  }

  async function patchLink(id: number|string, body: any) {
    return apiFetch(`/api/links/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
//   async function deleteLink(id: number|string) {
//     return apiFetch(`/api/links/${id}`, { method: 'DELETE' })
//   }
  
  /* ------------------- state ------------------- */
  const loading = ref(false)
  const error = ref<string|null>(null)
  const rows = ref<LinkItem[]>([])
  const q = ref('')
  const typeFilter = ref<''|LinkType>('')
  const statusFilter = ref<''|Status>('active') // match “Currently Active Links” by default
  const pageSize = ref(200)
  const detailsLoading = ref(false)
  const files = ref<any[]>([])

  watch([q, typeFilter, statusFilter], refresh)

  /* ------------------- mappers/helpers ------------------- */
  function fallbackTitle(it: LinkItem) {
    if (it.type === 'upload') return it.target?.dirRel || '(Upload)'
    const n = it.target?.files?.length || (it.type === 'download' ? 1 : 0)
    if (n === 1) return it.target?.files?.[0]?.name || '1 File'
    return `${n} Files`
  }
  function typeLabel(t: LinkType) {
    return t === 'upload' ? 'Upload' : t === 'download' ? 'Share (file)' : 'Share (collection)'
  }
  function badgeClass(t: LinkType) {
    return t === 'upload'
      ? 'bg-blue-100/20 text-blue-300'
      : t === 'download'
        ? 'bg-emerald-100/20 text-emerald-300'
        : 'bg-purple-100/20 text-purple-300'
  }
  function statusOf(it: LinkItem): Status {
    if (it.isDisabled) return 'disabled'
    if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
    return 'active'
  }
  function statusChipClass(s: Status) {
    return s === 'active'
      ? 'bg-green-100/20 text-green-300'
      : s === 'expired'
        ? 'bg-amber-100/20 text-amber-300'
        : 'bg-gray-200/20 text-gray-300'
  }
  function expiresLabel(it: LinkItem) {
    if (!it.expiresAt) return 'Never'
    const ms = it.expiresAt - Date.now()
    const days = Math.ceil(ms / 86400000)
    if (days <= 0) return 'Expired'
    return days === 1 ? '1 Day' : `${days} Days`
  }
  function expiresClass(it: LinkItem) {
    if (!it.expiresAt) return ''
    const ms = it.expiresAt - Date.now()
    return ms <= 86400000 ? 'text-red-400 font-semibold' : ''
  }
  async function copy(txt?: string|null) {
    if (!txt) return
    await navigator.clipboard.writeText(txt)
  }
  
  /* ------------------- table actions ------------------- */
  async function toggleDisable(it: LinkItem) {
    const disable = statusOf(it) !== 'disabled'
    await patchLink(it.id, { isDisabled: disable })
    it.isDisabled = disable
  }
//   async function remove(it: LinkItem) {
//     if (!confirm('Delete this link? This action cannot be undone.')) return
//     await deleteLink(it.id)
//     rows.value = rows.value.filter(r => r.id !== it.id)
//   }
  function viewLink(it: LinkItem) {
    if (it.shortUrl) window.open(it.shortUrl, '_blank', 'noopener,noreferrer')
  }
  async function extend(it: LinkItem, deltaMs: number) {
    const base = Math.max(it.expiresAt || 0, Date.now())
    const newExp = base + deltaMs
    await patchLink(it.id, { expiresAtMs: newExp })
    it.expiresAt = newExp
  }
  
  /* ------------------- inline title edit ------------------- */
  const editingId = ref<number|string|null>(null)
  const editTitle = ref('')
  function startEdit(it: LinkItem) {
    editingId.value = it.id
    editTitle.value = it.title || ''
  }
  function cancelEdit() {
    editingId.value = null
    editTitle.value = ''
  }
  async function saveTitle(it: LinkItem) {
    await patchLink(it.id, { title: editTitle.value || null })
    it.title = editTitle.value || null
    cancelEdit()
  }
  
  /* ------------------- details drawer ------------------- */
  const showDrawer = ref(false)
  const current = ref<LinkItem|null>(null)
  const drawerTitle = ref('')
  const drawerNotes = ref('')
  const drawerPassword = ref('')
  
  async function fetchDetailsFor(it: LinkItem) {
  detailsLoading.value = true; files.value = []
  try {
    const resp = await apiFetch(`/api/links/${encodeURIComponent(String(it.id))}/details`)
    // normalize uploader label (upload links only)
    files.value = (resp.files || []).map((f:any, idx:number) => ({
      key: `f${idx}`,
      ...f,
      uploader_label: f.uploader_display_name || f.uploader_username || f.uploader_id || null
    }))
  } finally {
    detailsLoading.value = false
  }
}


function fmtBytes(n?: number) {
  if (n === undefined || n === null) return '—'
  const k = 1024, u = ['B','KB','MB','GB','TB']; let i=0, v=n
  while (v>=k && i<u.length-1) { v/=k; i++ }
  return `${v.toFixed(v>=10||i===0?0:1)} ${u[i]}`
}
  async function openDetails(it: LinkItem) {
  current.value = it
  drawerTitle.value = it.title || ''
  drawerNotes.value = it.notes || ''
  drawerPassword.value = ''
  showModal.value = true
  await fetchDetailsFor(it)
}


function closeModal() {
  showModal.value = false
  current.value = null
}
  async function saveDetails() {
    if (!current.value) return
    await patchLink(current.value.id, {
      title: drawerTitle.value || null,
      notes: drawerNotes.value || null
    })
    current.value.title = drawerTitle.value || null
    current.value.notes = drawerNotes.value || null
    // reflect in table
    const r = rows.value.find(r => r.id === current.value!.id)
    if (r) { r.title = current.value.title; r.notes = current.value.notes }
  }
  async function savePassword() {
    if (!current.value) return
    await patchLink(current.value.id, { password: drawerPassword.value }) // server hashes → password_hash
    drawerPassword.value = ''
    // Optional: set passwordRequired flag true
    const r = rows.value.find(r => r.id === current.value!.id)
    if (r) r.passwordRequired = true
  }
  async function clearPassword() {
    if (!current.value) return
    await patchLink(current.value.id, { password: '' })
    const r = rows.value.find(r => r.id === current.value!.id)
    if (r) r.passwordRequired = false
  }
  
  /* ------------------- filters ------------------- */
  const filteredRows = computed(() => {
    // table shows all rows matching filters; default status=active to match heading
    return rows.value
      .filter(r => (typeFilter.value ? r.type === typeFilter.value : true))
      .filter(r => {
        const s = statusOf(r)
        return statusFilter.value ? s === statusFilter.value : true
      })
      .filter(r => {
        const needle = q.value.trim().toLowerCase()
        if (!needle) return true
        const hay =
          (r.title || '') + ' ' +
          (r.target?.dirRel || '') + ' ' +
          JSON.stringify(r.target?.files || [])
        return hay.toLowerCase().includes(needle)
      })
      .sort((a,b) => {
        // soonest expiring first (Never at end)
        const ea = a.expiresAt ?? Number.POSITIVE_INFINITY
        const eb = b.expiresAt ?? Number.POSITIVE_INFINITY
        return ea - eb
      })
  })

  function ensureExpEntry(it: LinkItem) {
  if (!expEditor.value[it.id]) {
    expEditor.value[it.id] = { days: 0, hours: 1, open: false } // default: +1h
  }
}

function openCustom(it: LinkItem) {
  ensureExpEntry(it)
  expEditor.value[it.id].open = true
}
function closeCustom(it: LinkItem) {
  if (!expEditor.value[it.id]) return
  expEditor.value[it.id].open = false
}

async function extendCustom(it: LinkItem, days: number, hours: number) {
  const totalHours = (Number(days) || 0) * 24 + (Number(hours) || 0)
  if (totalHours <= 0) return
  const deltaMs = totalHours * 3600e3
  const base = Math.max(it.expiresAt || 0, Date.now())
  const newExp = base + deltaMs
  await patchLink(it.id, { expiresAtMs: newExp })
  it.expiresAt = newExp
}

async function applyCustom(it: LinkItem) {
  ensureExpEntry(it)
  const { days, hours } = expEditor.value[it.id]
  await extendCustom(it, days, hours)
  closeCustom(it)
}

async function makeNever(it: LinkItem) {
  // Clear expiry so the link never expires
  await patchLink(it.id, { expiresAtMs: null })
  it.expiresAt = null
}
  </script>
  
  <style scoped>
  /* Utility if not using Tailwind plugins */
  </style>
  