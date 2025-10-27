<template>
	<div class="h-full flex items-start justify-center pt-6 overflow-y-auto">
		<div class="grid grid-cols-1 gap-5 text-xl w-9/12 mx-auto">
			<CardContainer class="bg-accent rounded-md shadow-xl">
				<template #header>
					<!-- Heading -->
					<div class="flex flex-col gap-2 text-left">
						<h1 class="text-xl font-semibold">Share a Folder</h1>
						<div class="text-sm opacity-80 -mt-1">
							Pick a folder on the server and generate a shareable link.
						</div>
					</div>
				</template>
				<!-- DESTINATION PICKER -->
				<div class="-mt-2">
					<FolderPicker v-model="destFolderRel" :apiFetch="apiFetch" useCase="upload"
						title="Choose destination on server"
						subtitle="Pick the folder on the server where these files will be uploaded."
						@changed-cwd="val => (cwd = val)" />
				</div>

				<!-- OPTIONS -->
				<div class="flex flex-col gap-3 text-left mt-2">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
						<!-- Expiration -->
						<div class="flex items-center gap-3">
							<label class="whitespace-nowrap font-semibold">Expires in:</label>

							<div class="flex flex-wrap gap-2 text-sm">
								<button type="button" class="btn btn-secondary" @click="setPreset(1, 'hours')">1
									hour</button>
								<button type="button" class="btn btn-secondary" @click="setPreset(1, 'days')">1
									day</button>
								<button type="button" class="btn btn-secondary" @click="setPreset(1, 'weeks')">1
									week</button>
							</div>

							<input type="number" min="1" step="1" v-model.number="expiresValue"
								class="input-textlike border rounded px-3 py-2 w-32 bg-transparent" />

							<select v-model="expiresUnit" class="input-textlike border rounded px-3 py-2 bg-transparent"
								style="min-width: 8rem">
								<option value="hours">hours</option>
								<option value="days">days</option>
								<option value="weeks">weeks</option>
							</select>

							<span class="text-sm opacity-75">({{ prettyExpiry }})</span>
						</div>

						<!-- Password (optional) -->
						<div class="flex items-center gap-3">
							<label class="whitespace-nowrap font-semibold">Password:</label>
							<div class="flex items-center gap-2">
								<input id="pw-enabled" type="checkbox" v-model="protectWithPassword" />
								<label for="pw-enabled" class="text-sm">Protect with password</label>
							</div>
							<input :disabled="!protectWithPassword" :type="showPassword ? 'text' : 'password'"
								v-model.trim="password"
								class="input-textlike border rounded px-3 py-2 bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
								placeholder="Enter password" style="min-width: 16rem" />
							<button type="button" class="btn btn-secondary" @click="showPassword = !showPassword"
								:disabled="!protectWithPassword">
								{{ showPassword ? 'Hide' : 'Show' }}
							</button>
						</div>
					</div>
				</div>


				<!-- ACTIONS -->
				<template #footer>
					<div class="flex flex-col">
						<div class="button-group-row w-full">
							<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
								Reset
							</button>
							<button class="btn btn-primary grow" :disabled="!canGenerate || loading"
								@click="generateLink" title="Create a magic link with the selected options">
								{{ loading ? 'Generating…' : 'Generate Link' }}
							</button>
						</div>

						<!-- RESULT -->
						<div v-if="result" class="p-3 border rounded bg-accent mt-3">
							<div class="flex flex-col items-center gap-2">
								<code class="font-mono break-all text-base">{{ result.url }}</code>

								<div class="button-group-row">
									<button class="btn btn-secondary" @click="copy(result.url)">Copy</button>
									<a class="btn btn-primary text-center" :href="result.url" target="_blank"
										rel="noreferrer">Open</a>
								</div>

								<div class="text-xs opacity-70 mt-1 text-center">
									<div v-if="result.expiresAt">Expires at: {{ fmtDate(result.expiresAt) }}</div>
									<div v-if="result.code">Code: {{ result.code }}</div>
									<div v-if="result.password">Password required</div>
								</div>
							</div>

							<div v-if="error" class="text-red-400 text-sm mt-2 text-center">{{ error }}</div>
						</div>
					</div>
				</template>
			</CardContainer>
			<div class="button-group-row col-span-1">
				<button @click="goBack" class="btn btn-danger justify-start">
					Return to Dashboard
				</button>
			</div>
		</div>
	</div>
</template>

  
<script setup lang="ts">
import { ref, computed, inject, Ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import CardContainer from '../components/CardContainer.vue'
import { useApi } from '../composables/useApi'
import { connectionMetaInjectionKey } from '../keys/injection-keys'
import FolderPicker from '../components/FolderPicker.vue'
import { useHeader } from '../composables/useHeader';
import { router } from '../../app/routes'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
useHeader('Upload Files via Link')

// --- Injections / API ---
const connectionMeta = inject(connectionMetaInjectionKey)!
const { apiFetch } = useApi()

// --- Tree / folder selection ---
const cwd = ref<string>('')
const rootRel = computed(() => (cwd.value || '').replace(/^\/+/, '').replace(/\/+$/, ''))
const internalSelected = ref<Set<string>>(new Set())
const selectedVersion = ref(0)
const expandCache = new Map<string, string[]>()
const destFolderRel = ref<string>('')

const selectedAbs = computed(() => {
if (!destFolderRel.value) return ''
const abs = '/' + destFolderRel.value.replace(/^\/+/, '')
return abs.endsWith('/') ? abs : abs + '/'
})

async function getFilesForFolder(folder: string): Promise<string[]> {
if (expandCache.has(folder)) return expandCache.get(folder)!
try {
	const resp = await apiFetch('/api/expand-paths', { method: 'POST', body: JSON.stringify({ paths: [folder] }) })
	const files: string[] = resp.files || []
	expandCache.set(folder, files)
	return files
} catch {
	expandCache.set(folder, [])
	return []
}
}

function onChoose(pick: { path: string; isDir: boolean }) {
if (pick.isDir) {
	cwd.value = pick.path.endsWith('/') ? pick.path : pick.path + '/'
} else {
	const parent = pick.path.replace(/\/[^/]+$/, '') || '/'
	cwd.value = parent.endsWith('/') ? parent : parent + '/'
}
}

function navigateTo(rel: string) {
const absLike = '/' + rel.replace(/^\/+/, '')
cwd.value = absLike.endsWith('/') ? absLike : absLike + '/'
}

async function togglePath({ path, isDir }: { path: string; isDir: boolean }) {
if (!isDir) return
await getFilesForFolder(path)
}

function clearTreeCache() { expandCache.clear(); selectedVersion.value++ }

const canGoUp = computed(() => cwd.value && cwd.value !== '/' && cwd.value !== '')
function parentPath(absLike: string): string {
	const p = (absLike || '/').replace(/\/+$/, '')
	if (!p || p === '/') return '/'
	const parent = p.replace(/\/[^/]*$/, '') || '/'
	return parent.endsWith('/') ? parent : parent + '/'
}
function goUpOne() { cwd.value = parentPath(cwd.value || '/') }

function onSelectFolder(rel: string) {
	destFolderRel.value = rel
	const abs = '/' + rel.replace(/^\/+/, '')
	cwd.value = abs.endsWith('/') ? abs : abs + '/'
}

// --- Share options ---
const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)

// Map units → seconds
const UNIT_TO_SECONDS = {
	hours: 60 * 60,
	days: 24 * 60 * 60,
	weeks: 7 * 24 * 60 * 60,
} as const


// Computed seconds and milliseconds (so you can pick which one to send)
const expiresSec = computed(() => {
	const v = Math.max(1, Math.floor(expiresValue.value || 0))
	return v * UNIT_TO_SECONDS[expiresUnit.value]
})

function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
	expiresValue.value = v
	expiresUnit.value = u
}

// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
	const v = Math.max(1, Math.floor(expiresValue.value || 0))
	const u = expiresUnit.value
	const label = v === 1 ? u.slice(0, -1) : u
	return `${v} ${label}`
})


const allowUpload = ref<boolean>(true)
const readOnly = ref<boolean>(false)

// --- Generate link ---
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)

const canGenerate = computed(() => !!destFolderRel.value)

async function generateLink() {
	if (!canGenerate.value) return
	loading.value = true
	error.value = null
	result.value = null
	try {
		const body: any = {
			path: '/' + destFolderRel.value.replace(/^\/+/, ''),
			kind: 'folder',
			allowUpload: readOnly.value ? false : !!allowUpload.value,
			expiresSec: Number(expiresSec.value) || 0,
		}
		if (password.value) body.password = password.value

		// POST to your API that creates a magic link for a folder
		// Expected response shape: { url: string, code?: string, expiresAt?: string }
		const resp = await apiFetch('/api/create-upload-link', {
			method: 'POST',
			body: JSON.stringify(body),
		})

		if (!resp || !resp.url) throw new Error(resp?.error || 'Failed to create link')

			result.value = {
			url: resp.url,
			code: resp.code,
			password: !!password.value,
			expiresAt: resp.expiresAt,
		}
	} catch (e: any) {
		error.value = e?.message || String(e)
	} finally {
		loading.value = false
	}
}

function resetAll() {
	destFolderRel.value = ''
	cwd.value = '/'
	expiresSec.value = 604800
	password.value = ''
	allowUpload.value = true
	readOnly.value = false
	result.value = null
	error.value = null
clearTreeCache()
}

function copy(text: string) {
	navigator.clipboard?.writeText(text).catch(() => {})
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function fmtDate(iso?: string) {
	if (!iso) return ''
	try { return new Date(iso).toLocaleString() } catch { return iso }
}

function goBack() {
	router.push({ name: 'dashboard' })
}
</script>
