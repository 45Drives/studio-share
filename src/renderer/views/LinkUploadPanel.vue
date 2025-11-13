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
						subtitle="Pick the folder on the server where these files will be uploaded."
						:auto-detect-roots="true" :allow-entire-tree="true" v-model:project="projectBase"
						v-model:dest="destFolderRel" />
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

						<div class="flex flex-row justify-between">
							<div class="flex items-center gap-3">
                                    <label class="whitespace-nowrap font-semibold" for="link-access-switch">Link Access:</label>
                                    <Switch
                                        id="link-access-switch"
                                        v-model="usePublicBase"
                                        :class="[
                                        usePublicBase ? 'bg-secondary' : 'bg-well',
                                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                        ]"
                                    >
                                        <span class="sr-only">Toggle link access</span>
                                        <span
                                        aria-hidden="true"
                                        :class="[
                                            usePublicBase ? 'translate-x-5' : 'translate-x-0',
                                            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                        ]"
                                        />
                                    </Switch>
                                    <span class="text-sm select-none">
                                        {{ usePublicBase ? 'Share Externally (Over Internet)' : 'Share Locally (Over LAN)' }}
                                    </span>
                                </div>

								<!-- Password (optional) -->
								<div class="flex items-center gap-3">
                                    <label class="whitespace-nowrap font-semibold">Use Link Password:</label>
                                    <div class="flex items-center gap-2">
                                        <Switch
                                            id="use-password-switch"
                                            v-model="protectWithPassword"
                                            :class="[
                                            protectWithPassword ? 'bg-secondary' : 'bg-well',
                                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                            ]"
                                        >
                                            <span class="sr-only">Toggle use password</span>
                                            <span
                                            aria-hidden="true"
                                            :class="[
                                                protectWithPassword ? 'translate-x-5' : 'translate-x-0',
                                                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                            ]"
                                            />
                                        </Switch>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <label class="text-default font-semibold ">Password</label>
                                        <div class="flex flex-col gap-1">
                                            <div class="relative flex items-center h-[3rem] space-x-2">
                                                <input 
                                                 :disabled="!protectWithPassword" :type="showPassword ? 'text' : 'password'"
                                                v-model.trim="password"
                                                placeholder="Enter your password"
                                                class="input-textlike border rounded px-3 py-2 bg-transparent disabled:opacity-50 disabled:cursor-not-allowed" />
                                                <button type="button" @click="showPassword = !showPassword"
                                                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                                <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                                <EyeSlashIcon v-if="showPassword" class="w-5 h-5" />
                                                </button>
                                            </div>
                                       
                                        </div>
                                    </div>
                                </div>

						</div>
						<div class="flex items-center gap-3 mt-2">
							<label class="whitespace-nowrap font-semibold">Link title:</label>
							<input type="text" v-model.trim="linkTitle"
								class="input-textlike border rounded px-3 py-2 bg-transparent"
								placeholder="Optional title for the shared link" style="min-width: 20rem" />
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
							<button class="btn btn-secondary w-full" :disabled="!canGenerate" @click="generateLink"
								title="Create a magic link with the selected options">
								Generate magic link
							</button>
						</div>

						<!-- RESULT -->
						<div v-if="result" class="flex flex-col">
							<p v-if="protectWithPassword && !password" class="text-sm text-red-500 mt-2">Password is
								required
								when protection is enabled.</p>
							<div v-if="result.url" class="p-3 border rounded space-x-2 flex flex-col items-center mt-1">
								<code>{{ result.url }}</code>
								<div class="button-group-row">
									<button class="btn btn-secondary" @click="copyLink">Copy</button>
									<button class="btn btn-primary" @click="openInBrowser">Open</button>
								</div>
							</div>
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
import { ref, computed } from 'vue'
import CardContainer from '../components/CardContainer.vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import { useHeader } from '../composables/useHeader';
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { useResilientNav } from '../composables/useResilientNav'
const { to } = useResilientNav()
import { Switch } from '@headlessui/vue'

useHeader('Upload Files via Link')

// --- Injections / API ---
const { apiFetch } = useApi()

// FolderPicker wiring
const cwd = ref<string>('')                 // purely for the breadcrumb text
const destFolderRel = ref<string>('')       // FolderPicker v-model
const usePublicBase = ref(true);

// Share options
const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)
const linkTitle = ref('')
const UNIT_TO_SECONDS = { hours: 3600, days: 86400, weeks: 604800 } as const
const expiresSec = computed(() => Math.max(1, Math.floor(expiresValue.value || 0)) * UNIT_TO_SECONDS[expiresUnit.value])
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') { expiresValue.value = v; expiresUnit.value = u }
const prettyExpiry = computed(() => {
	const v = Math.max(1, Math.floor(expiresValue.value || 0))
	const u = expiresUnit.value
	return `${v} ${v === 1 ? u.slice(0, -1) : u}`
})
const projectBase = ref<string>('')


// Link generation
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
			title: linkTitle.value || undefined,
			baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
			// baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
		}
		if (password.value) body.password = password.value

		const resp = await apiFetch('/api/create-upload-link', { method: 'POST', body: JSON.stringify(body) })
		if (!resp?.shortUrl) throw new Error(resp?.error || 'Failed to create link')
		result.value = { url: resp.shortUrl, code: resp.code, password: !!password.value, expiresAt: resp.expiresAt }
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

async function copyLink() {
	if (!result.value) return
	await navigator.clipboard.writeText(result.value.url)
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
	window.open(result.value?.url, '_blank')
}
function goBack() { 
	// router.push({ name: 'dashboard' }) 
	to('dashboard');
}
</script>
