<template>
	<div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
			<div class="grid w-full grid-cols-1 gap-4 text-2xl min-w-0">
				<CardContainer class="w-full bg-accent rounded-md shadow-xl min-w-0">
					<template #header>
						<div class="flex flex-col gap-2 text-left min-w-0">
							<h2 class="text-xl font-semibold">Share a Folder</h2>
							<div class="text-sm opacity-80 -mt-1">
								Pick a folder on the server and generate a shareable link.
							</div>
						</div>
					</template>

					<!-- DESTINATION PICKER -->
					<div class="-mt-2 min-w-0">
						<FolderPicker
							v-model="destFolderRel"
							:apiFetch="apiFetch"
							useCase="upload"
							subtitle="Pick the folder on the server where these files will be uploaded."
							:auto-detect-roots="true"
							:allow-entire-tree="true"
							v-model:project="projectBase"
							v-model:dest="destFolderRel"
							:uploadLink="true"
						/>
					</div>

					<!-- OPTIONS -->
					<div class="border-t border-default mt-4 pt-4 min-w-0">
						<CommonLinkControls>
							<template #expiry>
								<div class="flex flex-col gap-3 min-w-0">
									<!-- Row 1: label + input + select (always one row; inputs stay together) -->
									<div class="flex items-center gap-3 min-w-0">
										<label class="font-semibold whitespace-nowrap flex-shrink-0">Expires in:</label>

										<div class="flex items-center gap-2 min-w-0 flex-1">
											<input type="number" min="1" step="1" v-model.number="expiresValue"
												class="input-textlike border rounded px-3 py-2 w-24" />

											<select v-model="expiresUnit"
												class="input-textlike border rounded px-3 py-2 w-32">
												<option value="hours">hours</option>
												<option value="days">days</option>
												<option value="weeks">weeks</option>
											</select>
										</div>
									</div>

									<!-- Row 2: preset buttons -->
									<div class="flex flex-nowrap gap-1 text-xs min-w-0">
										<button type="button" class="btn btn-secondary w-20"
											@click="setPreset(1, 'hours')">1 hour</button>
										<button type="button" class="btn btn-secondary w-20"
											@click="setPreset(1, 'days')">1 day</button>
										<button type="button" class="btn btn-secondary w-20"
											@click="setPreset(1, 'weeks')">1 week</button>
										<button type="button" class="btn btn-secondary w-20"
											@click="setNever()">Never</button>
									</div>
								</div>
							</template>

							<template #commenters>
								<div class="flex flex-col gap-3 min-w-0">
									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<label class="font-semibold sm:whitespace-nowrap">Restrict Upload to Users</label>

										<Switch id="restrict-upload-switch" v-model="restrictToUsers" :class="[
											restrictToUsers ? 'bg-secondary' : 'bg-well',
											'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
										]">
											<span class="sr-only">Toggle user access</span>
											<span aria-hidden="true" :class="[
												restrictToUsers ? 'translate-x-5' : 'translate-x-0',
												'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
											]" />
										</Switch>
									</div>

									<div v-if="restrictToUsers" class="flex flex-col gap-2 min-w-0">
										<button type="button" class="btn btn-primary" @click="openUserModal()">
											Manage Users & Roles
											<span v-if="accessCount"
												class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default">
												{{ accessCount }}
											</span>
										</button>
										<p class="text-xs opacity-70">
											Users must have upload permission on their role.
										</p>
									</div>
								</div>
							</template>

							<template #title>
								<div class="flex flex-wrap items-center gap-3 min-w-0">
									<label class="font-semibold sm:whitespace-nowrap">Link Title:</label>
									<input
										type="text"
										v-model.trim="linkTitle"
										class="input-textlike border rounded px-3 py-2 w-full min-w-[12rem]"
										placeholder="Optional title for the shared link"
									/>
								</div>
							</template>

							<template #access>
								  <div class="flex flex-wrap items-center gap-3 min-w-0 mb-2">
										<label class="font-semibold sm:whitespace-nowrap" for="link-access-switch">
											Generate Proxy Files:
										</label>

										<Switch id="link-access-switch" v-model="transcodeProxy" :class="[
											transcodeProxy ? 'bg-secondary' : 'bg-well',
											'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
										]">
											<span class="sr-only">Toggle proxy file generation</span>
											<span aria-hidden="true" :class="[
												transcodeProxy ? 'translate-x-5' : 'translate-x-0',
												'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
											]" />
										</Switch>

										<span class="text-sm select-none truncate min-w-0 flex-1">
											{{ transcodeProxy ? 'Share raw + proxy files' : 'Share raw files only' }}
										</span>
									</div>
								<div v-if="transcodeProxy" class="grid grid-cols-[auto_1fr] items-start gap-3 mb-3">
									<label class="font-semibold whitespace-nowrap pt-1">Proxy Qualities:</label>
									<div class="flex flex-col gap-2">
										<label class="inline-flex items-center gap-2 text-sm">
											<input type="checkbox" class="checkbox" value="720p" v-model="proxyQualities" />
											<span>720p</span>
										</label>
										<label class="inline-flex items-center gap-2 text-sm">
											<input type="checkbox" class="checkbox" value="1080p" v-model="proxyQualities" />
											<span>1080p</span>
										</label>
										<label class="inline-flex items-center gap-2 text-sm">
											<input type="checkbox" class="checkbox" value="original" v-model="proxyQualities" />
											<span>Original</span>
										</label>
										<div class="text-xs text-slate-400">
											These versions take extra space and are used for shared links instead of the original file.
										</div>
									</div>
								</div>
								<div v-if="transcodeProxy" class="grid grid-cols-[auto_auto_minmax(10rem,10rem)] items-center gap-3 mb-2">
									<label class="font-semibold whitespace-nowrap">
										Watermark Videos:
									</label>

									<Switch v-model="watermarkEnabled" :class="[
										watermarkEnabled ? 'bg-secondary' : 'bg-well',
										'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
									]">
										<span class="sr-only">Toggle video watermarking</span>
										<span aria-hidden="true" :class="[
											watermarkEnabled ? 'translate-x-5' : 'translate-x-0',
											'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
										]" />
									</Switch>

									<span class="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
										{{ watermarkEnabled ? 'Apply watermark to videos' : 'No watermark' }}
									</span>
								</div>
								<div v-if="watermarkEnabled" class="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 mb-2">
									<span class="text-sm font-semibold whitespace-nowrap">Watermark Image:</span>
									<button class="btn btn-secondary" @click="pickWatermark">Choose Image</button>
									<span class="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
										{{ watermarkFile ? watermarkFile.name : 'No image selected' }}
									</span>
									<button v-if="watermarkFile" class="btn btn-secondary" @click="clearWatermark">Clear</button>
								</div>
								<div v-if="watermarkEnabled && !watermarkFile" class="text-xs text-amber-300 mb-2">
									Select a watermark image to continue.
								</div>
								<div v-if="watermarkEnabled && watermarkFile?.dataUrl" class="mb-2">
									<div class="text-xs text-slate-400 mb-1">Preview (approximate)</div>
									<div class="relative aspect-video w-full max-w-sm rounded-md border border-default bg-default/60 overflow-hidden">
										<div class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60"></div>
										<img :src="watermarkFile.dataUrl" alt="Watermark preview"
											class="absolute bottom-3 right-3 max-h-[35%] max-w-[35%] opacity-70 drop-shadow-md" />
									</div>
									<div class="text-[11px] text-slate-400 mt-1">Size and position may vary by source video.</div>
								</div>
								<div class="flex flex-wrap items-center gap-3 min-w-0">
									<label class="font-semibold sm:whitespace-nowrap" for="link-access-switch">
										Link Access:
									</label>

									<Switch
										id="link-access-switch"
										v-model="usePublicBase"
										:class="[
											usePublicBase ? 'bg-secondary' : 'bg-well',
											'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2',
										]"
									>
										<span class="sr-only">Toggle link access</span>
										<span
											aria-hidden="true"
											:class="[
												usePublicBase ? 'translate-x-5' : 'translate-x-0',
												'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out',
											]"
										/>
									</Switch>

									<span class="text-sm select-none truncate min-w-0 flex-1">
										{{ usePublicBase ? 'Share Externally (Over Internet)' : 'Share Locally (Over LAN)' }}
									</span>
								</div>
							</template>

							<template #accessExtra>
								<CheckPortForwarding
									v-if="usePublicBase"
									:apiFetch="apiFetch"
									endpoint="/api/forwarding/check"
									:autoCheckOnMount="false"
									:showDetails="true"
								/>
							</template>

							<template #password>
								<div v-if="!restrictToUsers" class="flex flex-col gap-2 min-w-0">
									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<label class="font-semibold sm:whitespace-nowrap">Password Protected Link:</label>

										<Switch
											id="use-password-switch"
											v-model="protectWithPassword"
											:class="[
												protectWithPassword ? 'bg-secondary' : 'bg-well',
												'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2',
											]"
										>
											<span class="sr-only">Toggle use password</span>
											<span
												aria-hidden="true"
												:class="[
													protectWithPassword ? 'translate-x-5' : 'translate-x-0',
													'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out',
												]"
											/>
										</Switch>
									</div>

									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<label class="text-default font-semibold sm:whitespace-nowrap">Password</label>

										<div class="relative flex items-center min-w-0 w-full">
											<input
												:disabled="!protectWithPassword"
												:type="showPassword ? 'text' : 'password'"
												v-model.trim="password"
												placeholder="Enter your password"
												class="input-textlike border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed w-full pr-10 min-w-0"
											/>
											<button
												type="button"
												@click="showPassword = !showPassword"
												class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted"
											>
												<EyeIcon v-if="!showPassword" class="w-5 h-5" />
												<EyeSlashIcon v-else class="w-5 h-5" />
											</button>
										</div>
									</div>
								</div>
							</template>

							<template #errorLeft>
								<p v-if="!accessSatisfied" class="text-sm text-red-500">
									At least one user is required when access is restricted.
								</p>
							</template>

							<template #errorRight>
								<p v-if="protectWithPassword && !password" class="text-sm text-red-500">
									Password is required when protection is enabled.
								</p>
							</template>
						</CommonLinkControls>
					</div>

					<AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :link="linkContext" roleHint="upload" :preselected="accessUsers.map(c => ({
						id: c.id,
						username: c.username || '',
						name: c.name,
						user_email: c.user_email,
						display_color: c.display_color,
						role_id: c.role_id ?? undefined,
						role_name: c.role_name ?? undefined,
					}))" @apply="onApplyUsers" />

					<!-- ACTIONS -->
					<template #footer>
						<div class="flex flex-col min-w-0">
							<!-- was: button-group-row w-full + w-full on generate -->
							<div class="flex flex-wrap gap-2 w-full min-w-0">
								<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
									Reset
								</button>
								<button
									class="btn btn-secondary flex-1 min-w-[14rem]"
									:disabled="!canGenerate || loading"
									@click="generateLink"
									title="Create a magic link with the selected options"
								>
									<span v-if="loading" class="inline-flex items-center gap-2">
										<span
											class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										Generating…
									</span>
									<span v-else>Generate magic link</span>
								</button>
							</div>

							<!-- RESULT -->
							<div v-if="result" class="flex flex-col min-w-0">
								<div v-if="result.url" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
									<code class="max-w-full break-all">{{ result.url }}</code>
									<div class="flex flex-wrap gap-2 mt-2">
										<button class="btn btn-secondary" @click="copyLink">Copy</button>
										<button class="btn btn-primary" @click="openInBrowser">Open</button>
									</div>
								</div>
							</div>
						</div>
					</template>
				</CardContainer>

				<div class="button-group-row col-span-1 min-w-0">
					<button @click="goBack" class="btn btn-danger justify-start">
						Return to Dashboard
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import { useHeader } from '../composables/useHeader'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useResilientNav } from '../composables/useResilientNav'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'
import { connectionMetaInjectionKey } from '../keys/injection-keys';

const { to } = useResilientNav()

useHeader('Upload Files via Link')

// --- Injections / API ---
const { apiFetch } = useApi()
const connectionMeta = inject(connectionMetaInjectionKey)!
const ssh = connectionMeta.value.ssh

// FolderPicker wiring
const cwd = ref<string>('')                 // purely for the breadcrumb text
const destFolderRel = ref<string>('')       // FolderPicker v-model
const projectBase = ref<string>('')

// Share options
const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)
const linkTitle = ref('')

const transcodeProxy = ref(false)
const proxyQualities = ref<string[]>([])
const watermarkEnabled = ref(false)
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const watermarkFile = ref<LocalFile | null>(null)
const overwriteExisting = ref(false)

// HLS is generated server-side; no client flag needed

watch(transcodeProxy, (v) => {
	if (v && proxyQualities.value.length === 0) {
		proxyQualities.value = ['720p']
	}
	if (!v) {
		proxyQualities.value = []
		watermarkEnabled.value = false
		watermarkFile.value = null
		overwriteExisting.value = false
	}
})

function pickWatermark() {
	window.electron.pickWatermark().then(f => {
		if (f) watermarkFile.value = f
	})
}
function clearWatermark() { watermarkFile.value = null }

async function uploadWatermarkToDest(destDir: string) {
	if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
	const host = ssh?.server
	const user = ssh?.username
	if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

	const { done } = await window.electron.rsyncStart({
		host,
		user,
		src: watermarkFile.value.path,
		destDir,
		port: 22,
		keyPath: undefined,
	})
	const res = await done
	if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
	return { ok: true }
}

// Units → seconds
const UNIT_TO_SECONDS = {
	hours: 3600,
	days: 86400,
	weeks: 604800,
} as const

// 0 seconds = Never, >0 = normal TTL
const expiresSec = computed(() => {
	const raw = Math.floor(expiresValue.value || 0)
	if (raw <= 0) return 0
	return raw * UNIT_TO_SECONDS[expiresUnit.value]
})

// Presets
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
	expiresValue.value = v
	expiresUnit.value = u
}

function setNever() {
	expiresValue.value = 0;
	expiresUnit.value = 'hours';
}

const usePublicBase = ref(true);
const defaultUsePublicBase = ref(true);

async function loadLinkDefaults() {
	try {
		const s = await apiFetch("/api/settings", { method: "GET" });
		const isInternal = (s?.defaultLinkAccess === "internal");
		defaultUsePublicBase.value = !isInternal;
		usePublicBase.value = defaultUsePublicBase.value;
		defaultRestrictToUsers.value =
			typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false;
		defaultUseProxyFiles.value =
			typeof s?.defaultUseProxyFiles === 'boolean' ? s.defaultUseProxyFiles : false;
		restrictToUsers.value = defaultRestrictToUsers.value;
		transcodeProxy.value = defaultUseProxyFiles.value;
	} catch {
		// Keep current default if settings can't be loaded
		defaultUsePublicBase.value = true;
		usePublicBase.value = true;
		defaultRestrictToUsers.value = false;
		defaultUseProxyFiles.value = false;
		restrictToUsers.value = defaultRestrictToUsers.value;
		transcodeProxy.value = defaultUseProxyFiles.value;
	}
}

onMounted(async () => {
	await loadLinkDefaults();
})

// Pretty text like "3 days" / "Never"
const prettyExpiry = computed(() => {
	if (expiresSec.value === 0) return 'Never'
	const v = Math.max(1, Math.floor(expiresValue.value || 0))
	const u = expiresUnit.value
	const label = v === 1 ? u.slice(0, -1) : u
	return `${v} ${label}`
})

// Link generation
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)

const canGenerate = computed(() =>
	!!destFolderRel.value &&
	(!transcodeProxy.value || proxyQualities.value.length > 0) &&
	(!watermarkEnabled.value || !!watermarkFile.value)
)

async function generateLink() {
	if (!canGenerate.value) {
		pushNotification(
			new Notification(
				'Cannot Generate Link',
				'Pick a destination folder on the server before generating an upload link.',
				'denied',
				8000,
			),
		)
		return
	}

	if (protectWithPassword.value && !password.value) {
		pushNotification(
			new Notification(
				'Password Required',
				'Enter a password or turn off link password protection.',
				'warning',
				8000,
			),
		)
		return
	}

	if (watermarkEnabled.value && !watermarkFile.value) {
		pushNotification(
			new Notification(
				'Watermark Image Required',
				'Please choose a watermark image before creating a link.',
				'warning',
				8000,
			),
		)
		return
	}

	loading.value = true
	error.value = null
	result.value = null

	try {
		const body: any = {
			path: '/' + destFolderRel.value.replace(/^\/+/, ''),
			kind: 'folder',
			allowUpload: true,
			// 0 = never, >0 = TTL in seconds
			expiresIn: Number(expiresSec.value) || 0,
			title: linkTitle.value || undefined,
			baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
		}
		if (password.value) body.password = password.value

		body.generateReviewProxy = !!transcodeProxy.value
		if (transcodeProxy.value) {
			body.proxyQualities = proxyQualities.value.slice()
			body.overwrite = !!overwriteExisting.value
		}
		if (watermarkEnabled.value && watermarkFile.value?.name) {
			body.watermark = true
			body.watermarkFile = watermarkFile.value.name
			body.watermarkProxyQualities = proxyQualities.value.slice()
		}

		if (watermarkEnabled.value && watermarkFile.value) {
			const destAbs = '/' + destFolderRel.value.replace(/^\/+/, '')
			const up = await uploadWatermarkToDest(destAbs)
			if (!up.ok) {
				pushNotification(
					new Notification(
						'Watermark Upload Failed',
						up.error || 'Unable to upload the watermark image.',
						'error',
						8000,
					),
				)
				loading.value = false
				return
			}
		}

		console.log('[create-upload-link] request body', JSON.stringify(body))
		const resp = await apiFetch('/api/create-upload-link', {
			method: 'POST',
			body: JSON.stringify(body),
		})

		if (!resp?.url) throw new Error(resp?.error || 'Failed to create link')

		result.value = {
			url: resp.url,
			code: resp.code,
			password: !!password.value,
			expiresAt: resp.expiresAt,
		}

		const modeLabel = usePublicBase.value ? 'external (Internet)' : 'local (LAN)'

		pushNotification(
			new Notification(
				'Upload Link Created',
				`An ${modeLabel} upload link was created for “/${destFolderRel.value.replace(/^\/+/, '')}”.`,
				'success',
				8000,
			),
		)
	} catch (e: any) {
		const msg = e?.message || e?.error || String(e)
		const level: 'error' | 'denied' =
			/forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

		error.value = msg

		pushNotification(
			new Notification(
				'Failed to Create Upload Link',
				msg,
				level,
				8000,
			),
		)
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
	protectWithPassword.value = false
	showPassword.value = false
	linkTitle.value = ''
	transcodeProxy.value = false
	proxyQualities.value = []
	watermarkEnabled.value = false
	watermarkFile.value = null
	overwriteExisting.value = false
	result.value = null
	error.value = null
	usePublicBase.value = defaultUsePublicBase.value
	transcodeProxy.value = defaultUseProxyFiles.value
}

async function copyLink() {
	if (!result.value) return
	await navigator.clipboard.writeText(result.value.url)
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
	if (!result.value?.url) return
	window.open(result.value.url, '_blank')

	pushNotification(
		new Notification(
			'Opening Link',
			'Upload link opened in your default browser.',
			'info',
			4000,
		),
	)
}

function goBack() {
	to('dashboard')
}

watch(restrictToUsers, (v) => {
	if (v) {
		protectWithPassword.value = false
		password.value = ''
	}
})

watch(
	accessUsers,
	(arr) => {
		if (arr.length > 0) restrictToUsers.value = true
	},
	{ deep: true }
)

function openUserModal() {
	userModalOpen.value = true
}

function makeKey(name?: string, user_email?: string, username?: string) {
	const u = (username ?? '').trim().toLowerCase()
	const e = (user_email ?? '').trim().toLowerCase()
	const n = (name ?? '').trim().toLowerCase()
	return (u || n) + '|' + e
}

function onApplyUsers(users: any[]) {
	const next = users.map(u => {
		const username = (u.username || '').trim()
		const name = (u.name || username).trim()
		const user_email = u.user_email?.trim() || undefined
		const display_color = u.display_color
		const key = makeKey(name, user_email, username)
		return {
			key,
			id: u.id,
			username,
			name,
			user_email,
			display_color,
			role_id: u.role_id ?? null,
			role_name: u.role_name ?? null,
		}
	})

	const seen = new Set<string>()
	const dedup: typeof next = []
	for (const c of next) {
		if (seen.has(c.key)) continue
		seen.add(c.key)
		dedup.push(c)
	}

	accessUsers.value = dedup
}
</script>
