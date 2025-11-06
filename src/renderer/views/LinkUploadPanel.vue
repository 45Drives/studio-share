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
						title="Choose destination on server" :auto-detect-roots="true"
						subtitle="Pick the folder on the server where these files will be uploaded." />
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
						<!-- <div class="flex items-center gap-3">
							<label class="whitespace-nowrap font-semibold">Link Network Availability:</label>
							<label class="flex items-center gap-2 text-sm cursor-pointer select-none">
								<input type="checkbox" v-model="usePublicBase" />
								<span>{{ usePublicBase ? 'External Internet Access' : 'LAN Access' }}</span>
							</label>
						</div> -->

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
import { ref, computed, inject, Ref, onMounted, watch } from 'vue'
import CardContainer from '../components/CardContainer.vue'
import { useApi } from '../composables/useApi'
import { connectionMetaInjectionKey } from '../keys/injection-keys'
import FolderPicker from '../components/FolderPicker.vue'
import { useHeader } from '../composables/useHeader';
import { router } from '../../app/routes'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

useHeader('Upload Files via Link')

// --- Injections / API ---
const { apiFetch } = useApi()

// FolderPicker wiring
const cwd = ref<string>('')                 // purely for the breadcrumb text
const destFolderRel = ref<string>('')       // FolderPicker v-model

// Share options (unchanged)
const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)
const UNIT_TO_SECONDS = { hours: 3600, days: 86400, weeks: 604800 } as const
const expiresSec = computed(() => Math.max(1, Math.floor(expiresValue.value || 0)) * UNIT_TO_SECONDS[expiresUnit.value])
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') { expiresValue.value = v; expiresUnit.value = u }
const prettyExpiry = computed(() => {
	const v = Math.max(1, Math.floor(expiresValue.value || 0))
	const u = expiresUnit.value
	return `${v} ${v === 1 ? u.slice(0, -1) : u}`
})

// Link generation (unchanged)
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)
const canGenerate = computed(() => !!destFolderRel.value)
// const usePublicBase = ref(true);
async function generateLink() {
	if (!canGenerate.value) return
	loading.value = true; error.value = null; result.value = null
	try {
		const body: any = {
			path: '/' + destFolderRel.value.replace(/^\/+/, ''),
			kind: 'folder',
			allowUpload: true,
			expiresSec: Number(expiresSec.value) || 0,
			// baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
		}
		if (password.value) body.password = password.value

		const resp = await apiFetch('/api/create-upload-link', { method: 'POST', body: JSON.stringify(body) })
		if (!resp?.url) throw new Error(resp?.error || 'Failed to create link')
		result.value = { url: resp.url, code: resp.code, password: !!password.value, expiresAt: resp.expiresAt }
	} catch (e: any) {
		error.value = e?.message || String(e)
	} finally {
		loading.value = false
	}
}

function resetAll() {
	destFolderRel.value = ''
	cwd.value = '/'
	expiresValue.value = 7
	expiresUnit.value = 'days'
	password.value = ''
	result.value = null
	error.value = null
}

function copy(text: string) { navigator.clipboard?.writeText(text).catch(() => { }); pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000)) }
function fmtDate(iso?: string) { if (!iso) return ''; try { return new Date(iso).toLocaleString() } catch { return iso } }
function goBack() { router.push({ name: 'dashboard' }) }
</script>
