<template>
	<div>
		<div class="rounded-t-lg bg-secondary text-default px-4 py-2 text-center font-semibold">
			Currently Active Links
		</div>

		<div class="p-4 bg-well rounded-md">
			<div class="flex flex-wrap gap-2 mb-3">
				<input v-model="q" type="search" placeholder="Search title / dir / file..."
					class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-default w-64" />
				<select v-model="typeFilter" class="px-3 py-2 border border-default rounded-lg bg-default">
					<option value="">All types</option>
					<option value="upload">Upload</option>
					<option value="download">Share (file)</option>
					<option value="collection">Share (collection)</option>
				</select>
				<select v-model="statusFilter" class="px-3 w-36 py-2 border border-default rounded-lg bg-default">
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
				<table class="min-w-full text-sm border border-default border-collapse">
					<thead>
						<tr class="bg-default text-default border-b border-default">
							<th class="text-left px-4 py-2 font-semibold border border-default">Title</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Type</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Short Link</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Expires</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Status</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Password</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Created</th>
							<th class="text-left px-4 py-2 font-semibold border border-default">Actions</th>
						</tr>
					</thead>

					<tbody class="bg-accent">
						<tr v-if="!loading && filteredRows.length === 0">
							<td colspan="8" class="px-4 py-4 text-center text-default font-bold border border-default">
								No links found.
							</td>
						</tr>

						<tr v-for="it in filteredRows" :key="it.id"
							class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default">
							<!-- Title -->
							<td class="px-4 py-2 border border-default">
								<div v-if="editingId !== it.id" class="flex items-center justify-between gap-2">
									<span class="font-medium cursor-pointer hover:underline" @click="openDetails(it)">
										{{ it.title || fallbackTitle(it) }}
									</span>
									<button class="text-xs text-blue-500 hover:underline" @click="startEdit(it)">Edit
										Title</button>
								</div>
								<div v-else class="flex items-center gap-2">
									<input v-model="editTitle"
										class="px-2 py-1 rounded bg-default border border-default w-56" />
									<button class="btn btn-secondary text-xs" @click=" saveTitle(it)">Save</button>
									<button class="btn btn-danger text-xs" @click="cancelEdit">Cancel</button>
								</div>
							</td>

							<!-- Type -->
							<td class="px-4 py-2 border border-default">
								<span class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="badgeClass(it.type)">{{ typeLabel(it.type) }}</span>
							</td>

							<!-- Short link -->
							<td class="px-4 py-2 border border-default">
								<div class="flex items-center gap-2 justify-between">
									<a :href="it.shortUrl" target="_blank" rel="noopener"
										class="hover:underline truncate max-w-[22rem]">
										{{ it.shortUrl }}
									</a>
									<button class="text-blue-500 hover:underline text-xs"
										@click="copy(it.shortUrl)">Copy</button>
								</div>
							</td>

							<!-- Expires -->
							<td class="px-4 py-2 border border-default ">
								<div v-if="!expEditor[it.id]?.open"
									class="flex flex-row justify-between items-center text-center">
									<div class="mx-auto" :class="expiresClass(it)">
										{{ expiresLabel(it) }}
									</div>
									<div class="button-group-row justify-between items-center gap-2 ml-auto">
										<button class="btn btn-secondary text-xs" 

											@click="makeNever(it)">
											Never
										</button>
										<button class="btn btn-primary text-xs" 
											@click="openCustom(it)">
											Custom
										</button>
									</div>
								</div>

								<!-- custom editor -->
								<div v-if="expEditor[it.id]?.open" class="flex flex-col items-center gap-1 text-xs">
									<div class="flex flex-row justify-between w-full">
										<label class="flex items-center gap-1">
											<span class="opacity-70">Days</span>
											<input type="number" min="0" class="input-textlike h-7 w-16 text-left"
												v-model.number="expEditor[it.id].days" />
										</label>
										<label class="flex items-center gap-1">
											<span class="opacity-70">Hours</span>
											<input type="number" min="0" class="input-textlike h-7 w-16 text-left"
												v-model.number="expEditor[it.id].hours" />
										</label>
									</div>
									<div class="flex flex-row justify-around w-full">
										<button class="btn btn-secondary text-xs" @click="applyCustom(it)">
											Apply
										</button>
										<button class="btn btn-danger text-xs" @click="closeCustom(it)">
											Cancel
										</button>
									</div>

								</div>
							</td>


							<!-- Status -->
							<td class="px-4 py-2 border border-default">
								<span class="bg-default dark:bg-well/75 px-2 py-0.5 rounded-full text-xs font-semibold"
									:class="statusChipClass(statusOf(it))">{{ statusOf(it).toUpperCase() }}</span>
							</td>

							<!-- Password -->
							<td class="px-4 py-2 border border-default">
								<span class="text-xs">{{ it.passwordRequired ? 'Yes' : 'No' }}</span>
								<!-- <button class="ml-2 text-blue-500 hover:underline text-xs" @click="openDetails(it)">Manage</button> -->
							</td>

							<!-- Created -->
							<td class="px-4 py-2 border border-default">
								<div>{{ new Date(it.createdAt).toLocaleDateString() }}</div>
								<div class="text-xs text-muted">{{ new
									Date(it.createdAt).toLocaleTimeString() }}</div>
							</td>

							<!-- Actions -->
							<td class="px-4 py-2 border border-default">
								<div class="flex flex-wrap justify-around items-center">
									<button class="btn btn-primary px-2 py-1 rounded-md" @click="openDetails(it)">
										View Details
									</button>
									<button :disabled="isDisabled(it)" class="btn btn-success px-2 py-1 rounded-md"
										@click="viewLink(it)">Open</button>
									<!-- <button class="btn btn-primary px-2 py-1 rounded-md"
										@click="copy(it.shortUrl)">Copy</button> -->
									<button class="btn btn-danger px-2 py-1 rounded-md" :disabled="isDisabled(it)"
										:class="statusOf(it) === 'disabled' ? '' : 'bg-yellow-50/10'"
										@click="toggleDisable(it)">
										{{ statusOf(it) === 'disabled' ? 'Enable' : 'Disable' }}
									</button>

								</div>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<!--  /////////////////////////////////////////////////////////////////////////////////////////////////////////////// -->
	<!-- Details modal -->
	<div v-if="showModal" class="fixed inset-0 z-40">
		<div class="absolute inset-0 bg-black/50" @click="closeModal"></div>

		<div class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl
			bg-well border border-default rounded-lg shadow-lg z-50">
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-default">
				<h3 class="text-lg font-semibold">
					Link Details — {{ current?.title || (current && fallbackTitle(current)) }}
				</h3>
				<button class="btn btn-danger" @click="closeModal">Close</button>
			</div>

			<!-- Meta -->
			<div class="px-4 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm text-left items-center">
				<section class="space-y-2">
					<div class="space-x-2">
						<span class="text-default font-bold">Type of Link:</span>
						<span :class="badgeClass(current?.type!)">{{ current?.type.toUpperCase() }}</span>
					</div>
					<div class="break-all space-x-2">
						<span class="text-default font-bold">Short Link:</span>
						<a :href="current?.shortUrl" target="_blank" class="hover:underline">{{ current?.shortUrl }}</a>
						<button class="ml-2 text-blue-500 hover:underline text-xs"
							@click="copy(current?.shortUrl)">Copy</button>
					</div>
					<div class="break-all space-x-2">
						<span class="text-default font-bold">Long Link:</span>
						<a :href="current?.shortUrl" target="_blank" class="hover:underline">{{ current?.longUrl }}</a>
						<button class="ml-2 text-blue-500 hover:underline text-xs"
							@click="copy(current?.shortUrl)">Copy</button>
					</div>
					<div class="space-x-2">
						<span class="text-default font-bold">Created:</span>
						{{ current ? new Date(current.createdAt).toLocaleString() : '' }}
					</div>
					<div class="space-x-2">
						<span class="text-default font-bold">Expires:</span>
						{{ current?.expiresAt ? new Date(current.expiresAt).toLocaleString() : 'Never' }}
					</div>
					<div class="space-x-2">
						<span class="text-default font-bold">Status:</span>
						<span :class="statusChipClass(statusOf(current!))">{{ current ? statusOf(current).toUpperCase()
							: '' }}</span>
					</div>

					<!-- quick edit -->
					<div class="pt-2">
						<label class="block text-default mb-1">Title</label>
						<input v-model="drawerTitle" class="input-textlike w-full px-3 py-2 rounded" />
					</div>
					<div>
						<label class="block text-default mb-1">Notes</label>
						<textarea v-model="drawerNotes" rows="3"
							class="input-textlike w-full px-3 py-2 rounded"></textarea>
					</div>
					<div class="flex gap-2 pt-2">
						<button class="px-3 py-2 rounded bg-[#5E56C5]" @click="saveDetails">Save</button>
						<button class="px-3 py-2 rounded border border-default" @click="closeModal">Cancel</button>
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
					<div
						class="overflow-x-auto h-80 overflow-y-auto overscroll-y-contain rounded-lg border border-default mb-6">
						<table class="min-w-full text-sm border-separate border-spacing-0">
							<thead>
								<tr class="bg-default text-gray-300">
									<th class="text-left px-3 py-2 border border-default">Name</th>
									<th v-if="current?.type === 'upload'"
										class="text-left px-3 py-2 border border-default">Saved As</th>
									<th class="text-right px-3 py-2 border border-default">Size</th>
									<th class="text-left px-3 py-2 border border-default">MIME</th>
									<th v-if="current?.type === 'upload'"
										class="text-left px-3 py-2 border border-default">Uploader</th>
									<th v-if="current?.type === 'upload'"
										class="text-left px-3 py-2 border border-default">IP</th>
									<th  v-if="current?.type === 'upload'" class="text-left px-3 py-2 border border-default">When</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="f in files" :key="f.key" class="border-t border-default">
									<td class="px-3 py-2 break-all border border-default">{{ f.name }}</td>
									<td v-if="current?.type === 'upload'"
										class="px-3 py-2 break-all border border-default">{{ f.saved_as || '—' }}</td>
									<td class="px-3 py-2 text-right border border-default">{{ fmtBytes(f.size) }}</td>
									<td class="px-3 py-2 border border-default">{{ f.mime || '—' }}</td>
									<td v-if="current?.type === 'upload'" class="px-3 py-2 border border-default">{{
										f.uploader_label || '—' }}</td>
									<td v-if="current?.type === 'upload'" class="px-3 py-2 border border-default">{{
										f.ip || '—' }}</td>
									<td v-if="current?.type === 'upload'" class="px-3 py-2 border border-default">{{ f.ts ? new
										Date(f.ts).toLocaleString() : '—' }}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</div>
	</div>
</template>
	
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

type LinkType = 'upload' | 'download' | 'collection'
type Status = 'active' | 'expired' | 'disabled'
	
interface LinkItem {
		id: number | string
		type: LinkType
		title?: string | null
		notes?: string | null
		token?: string | null
		shortUrl: string
		longUrl: string
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

onMounted(refresh);

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
		? 'text-blue-500'
		: t === 'download'
			? 'text-emerald-500'
			: 'text-purple-500'
}

function isExpired(it: LinkItem) {
	return !!(it.expiresAt && it.expiresAt <= Date.now())
}

function isDisabled(it: LinkItem) {
	return !!(it.isDisabled)
}

function statusOf(it: LinkItem): Status {
	if (it.isDisabled) return 'disabled'
	if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
	return 'active'
}

function statusChipClass(s: Status) {
	return s === 'active'
		? 'text-green-500'
		: s === 'expired'
			? 'text-amber-500'
			: 'text-gray-500'
}

function expiresLabel(it: LinkItem) {
	if (!it.expiresAt) return 'Never'
	const ms = it.expiresAt - Date.now()
	if (ms <= 0) return 'Expired'

	// show minutes granularity:
	if (ms < 60e3) return '< 1 Minute'
	if (ms < 3600e3) {
	  const m = Math.max(1, Math.floor(ms / 60e3))
	  return m === 1 ? '1 Minute left' : `${m} Minutes left`
	}

	if (ms < 86400e3) {
		// round up so 59m -> 1 Hour
		const h = Math.ceil(ms / 3600e3)
		return h === 1 ? '1 Hour' : `${h} Hours`
	}

	const days = Math.floor(ms / 86400e3)
	const hours = Math.floor((ms % 86400e3) / 3600e3)
	return hours ? `${days}d ${hours}h` : (days === 1 ? '1 Day' : `${days} Days`)
}

function expiresClass(it: LinkItem) {
	if (!it.expiresAt) return ''
	const ms = it.expiresAt - Date.now()
	return ms <= 86400000 ? 'text-red-400 font-semibold' : ''
}

async function copy(txt?: string|null) {
	if (!txt) return
	await navigator.clipboard.writeText(txt)
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
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
	console.log('details resp', resp)
	console.log(`/api/links/`,it.id+'/details')
    // normalize uploader label (upload links only)
    files.value = (resp.files || []).map((f:any, idx:number) => ({
      key: `f${idx}`,
      ...f,
      uploader_label: f.uploader_name
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
	if (isExpired(it)) return
	ensureExpEntry(it)
	expEditor.value[it.id].open = true

	if (it.expiresAt) {
		const ms = Math.max(0, it.expiresAt - Date.now())
		let days = Math.floor(ms / 86400e3)
		let hours = Math.ceil((ms % 86400e3) / 3600e3) // round up remainder to hours

		// carry if hours rounded to 24
		if (hours >= 24) { days += 1; hours = 0 }

		// if there's any time left but < 1h, show 1 hour
		if (days === 0 && hours === 0 && ms > 0) hours = 1

		expEditor.value[it.id].days = days
		expEditor.value[it.id].hours = hours
	} else {
		expEditor.value[it.id].days = 0
		expEditor.value[it.id].hours = 1
	}
}


function closeCustom(it: LinkItem) {
	if (!expEditor.value[it.id]) return
	expEditor.value[it.id].open = false
}

async function applyCustom(it: LinkItem) {
	ensureExpEntry(it)
	let { days, hours } = expEditor.value[it.id]
	days = Number.isFinite(days) ? Number(days) : 0
	hours = Number.isFinite(hours) ? Number(hours) : 0

	const totalHours = days * 24 + hours
	if (totalHours <= 0) { await makeNever(it); closeCustom(it); return }

	const newExp = Date.now() + totalHours * 3600e3
	await patchLink(it.id, { expiresAtMs: newExp })
	it.expiresAt = newExp
	closeCustom(it)
}

async function makeNever(it: LinkItem) {

	// Clear expiry so the link never expires
	await patchLink(it.id, { expiresAtMs: null })
	it.expiresAt = null
}
</script>