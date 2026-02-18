<template>
	<div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 ">
			<div class="grid w-full grid-cols-1 gap-4 text-xl min-w-0">
				<CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
					<template #header>
						<div class="flex flex-col gap-2 text-left min-w-0">
							<h2 class="text-xl font-semibold">Share a Folder</h2>
							<div class="text-sm opacity-80 -mt-1">
								Pick a folder on the server and generate a shareable link.
							</div>
						</div>
					</template>

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

					<div class="border-t border-default mt-4 pt-4 min-w-0">
						<CommonLinkControls>
							<template #expiry>
								<div class="flex flex-col gap-3 min-w-0">
									<div class="flex items-center gap-3 min-w-0">
										<label class="font-semibold whitespace-nowrap flex-shrink-0">Expires in:</label>
										<div class="flex items-center gap-2 min-w-0 flex-1">
											<input
												type="number"
												min="1"
												step="1"
												v-model.number="expiresValue"
												class="input-textlike border rounded px-3 py-2 w-24"
											/>
											<select v-model="expiresUnit" class="input-textlike border rounded px-3 py-2 w-32">
												<option value="hours">hours</option>
												<option value="days">days</option>
												<option value="weeks">weeks</option>
											</select>
										</div>
									</div>
									<div class="flex flex-nowrap gap-1 text-xs min-w-0">
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'hours')">1 hour</button>
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'days')">1 day</button>
										<button type="button" class="btn btn-secondary w-20" @click="setPreset(1, 'weeks')">1 week</button>
										<button type="button" class="btn btn-secondary w-20" @click="setNever()">Never</button>
									</div>
								</div>
							</template>

							<template #access>
								<div class="flex flex-col gap-1 min-w-0">
									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<span class="font-semibold sm:whitespace-nowrap">
											Network Access:
										</span>

										<div class="flex flex-wrap gap-2 min-w-0" role="radiogroup"
											aria-label="Network Access">
											<!-- Local (false) -->
											<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                -well bg-default hover:bg-well/40">
												<input type="radio" name="link-access" :value="false"
													:checked="usePublicBase === false" @change="usePublicBase = false"
													class="h-4 w-4" />
												<span class="text-sm truncate">
													Share Locally (Over LAN)
												</span>
											</label>

											<!-- External (true) -->
											<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition
                 border-well bg-default hover:bg-well/40">
												<input type="radio" name="link-access" :value="true"
													:checked="usePublicBase === true" @change="usePublicBase = true"
													class="h-4 w-4" />
												<span class="text-sm truncate">
													Share Externally (Over Internet)
												</span>
											</label>
										</div>
									</div>

									<p class="text-xs text-muted">
										External sharing needs working port forwarding.
									</p>
								</div>
							</template>

							<template #accessExtra>
								<div v-if="usePublicBase" class="flex flex-col gap-3 min-w-0">
									<CheckPortForwarding
										:apiFetch="apiFetch"
										endpoint="/api/forwarding/check"
										:autoCheckOnMount="false"
										:showDetails="true"
									/>
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

							<!-- Link Access row -->
							<template #after class="">
								<div class="border-t border-default mt-2 pt-2 min-w-0 text-left">
									<div class="rounded-md border border-default bg-accent min-w-0 p-3">
										<div class="font-semibold mb-2">Link Access Mode</div>
										<div class="grid grid-cols-3 gap-2 min-w-0">
											<div>
												<label
													class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
													<input type="radio" name="access-mode" value="open"
														v-model="accessMode" class="mt-1" />
													<span class="min-w-0">
														<span class="font-semibold block">Anyone with the
															link</span>
														<span class="text-xs text-muted block">No sign-in
															required.</span>
													</span>
												</label>

												<label
													class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
													<input type="radio" name="access-mode" value="open_password"
														v-model="accessMode" class="mt-1" />
													<span class="min-w-0">
														<span class="font-semibold block">Anyone with the link +
															password</span>
														<span class="text-xs text-muted block">One shared
															password for everyone.</span>
													</span>
												</label>

												<label
													class="flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer">
													<input type="radio" name="access-mode" value="restricted"
														v-model="accessMode" class="mt-1" />
													<span class="min-w-0">
														<span class="font-semibold block">Only invited
															users</span>
														<span class="text-xs text-muted block">Sign in with a
															user account. Permissions come from roles.</span>
													</span>
												</label>
											</div>
											<div
												class="col-span-2 border-default min-w-0 p-3 border border-default rounded-md gap-2">
												<div v-if="accessMode === 'open_password'"
													class="flex flex-col gap-2 min-w-0 mt-1">
													<div class="flex flex-row gap-6 items-center text-center">
														<label
															class="text-default font-semibold sm:whitespace-nowrap">Link
															password</label>
														<p class="text-xs text-muted">Share this password with
															anyone
															you want to access the link.</p>
													</div>

													<div class="relative flex items-center min-w-0 w-full">
														<input :type="showPassword ? 'text' : 'password'"
															v-model.trim="password"
															placeholder="Enter a password"
															class="input-textlike border rounded px-3 py-2 w-full pr-10 min-w-0" />
														<button type="button"
															@click="showPassword = !showPassword"
															class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
															<EyeIcon v-if="!showPassword" class="w-5 h-5" />
															<EyeSlashIcon v-else class="w-5 h-5" />
														</button>
													</div>
													
													<p v-if="!password" class="text-sm text-red-500">
														Password is required when protection is enabled.
													</p>
												</div>

												<div v-if="accessMode === 'restricted'"
													class="flex flex-col gap-2 min-w-0">
													<p class="text-xs text-muted">
														Invited users sign in with their own username and
														password.
														Roles control download permissions.
													</p>
													<button type="button" class="btn btn-primary"
														@click="openUserModal()">
														{{ accessCount ? 'Manage invited users' : 'Invite users…' }}
														<span v-if="accessCount"
															class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default">
															{{ accessCount }}
														</span>
													</button>
													<p class="text-xs opacity-70">Roles control permissions.</p>
													<p v-if="!accessSatisfied" class="text-sm text-red-500">
														Add at least one user to continue.
													</p>
												</div>
												<div v-if="accessMode === 'open'">
													<p class="text-2xl text-center text-warning items-center">
														WARNING! Anybody with the link can upload a file to your server!
													</p>
												</div>
											</div>
											<div class="col-span-3 grid grid-cols-3">
												<p class="mx-auto text-xs text-success">
													Access:
													{{
														accessMode === 'open'
															? 'Anyone with the link'
															: accessMode === 'open_password'
																? 'Anyone with the link + password'
																: 'Invited users only'
													}}
												</p>
											</div>
										</div>
									</div>
								</div>
							</template>
						</CommonLinkControls>
					</div>

					<AddUsersModal
						v-model="userModalOpen"
						:apiFetch="apiFetch"
						:link="linkContext"
						roleHint="upload"
						:preselected="accessUsers.map(c => ({
							id: c.id,
							username: c.username || '',
							name: c.name,
							user_email: c.user_email,
							display_color: c.display_color,
							role_id: c.role_id ?? undefined,
							role_name: c.role_name ?? undefined,
						}))"
						@apply="onApplyUsers"
					/>

					<template #footer>
						<div class="flex flex-col min-w-0">
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
										<span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										Generating…
									</span>
									<span v-else>Generate magic link</span>
								</button>
							</div>

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
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import { useHeader } from '../composables/useHeader'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useResilientNav } from '../composables/useResilientNav'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'
import type { Commenter } from '../typings/electron'

const { to } = useResilientNav()
useHeader('Upload Files via Link')

const { apiFetch } = useApi()
const linkContext = { type: 'upload' as const }

const destFolderRel = ref<string>('')
const projectBase = ref<string>('')

const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const password = ref('')
const showPassword = ref(false)
const linkTitle = ref('')
const accessUsers = ref<Commenter[]>([])
const usePublicBase = ref(true)
const defaultUsePublicBase = ref(true)

type AccessMode = 'open' | 'open_password' | 'restricted'
const accessMode = ref<AccessMode>('open')
const defaultAccessMode = ref<AccessMode>('open')

const accessCount = computed(() => accessUsers.value.length)
const accessSatisfied = computed(() => accessMode.value !== 'restricted' || accessCount.value > 0)
const passwordRequired = computed(() => accessMode.value === 'open_password' && !password.value.trim())

const UNIT_TO_SECONDS = {
	hours: 3600,
	days: 86400,
	weeks: 604800,
} as const

const expiresSec = computed(() => {
	const raw = Math.floor(expiresValue.value || 0)
	if (raw <= 0) return 0
	return raw * UNIT_TO_SECONDS[expiresUnit.value]
})

function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
	expiresValue.value = v
	expiresUnit.value = u
}

function setNever() {
	expiresValue.value = 0
	expiresUnit.value = 'hours'
}

async function loadLinkDefaults() {
	try {
		const s = await apiFetch('/api/settings', { method: 'GET' })
		const isInternal = s?.defaultLinkAccess === 'internal'
		defaultUsePublicBase.value = !isInternal
		usePublicBase.value = defaultUsePublicBase.value

		const defaultRestrict = typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false
		defaultAccessMode.value = defaultRestrict ? 'restricted' : 'open'

		accessMode.value = defaultAccessMode.value
	} catch {
		defaultUsePublicBase.value = true
		usePublicBase.value = true
		defaultAccessMode.value = 'open'
		accessMode.value = defaultAccessMode.value
	}
}

onMounted(async () => {
	await loadLinkDefaults()
})

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<null | { url: string; code?: string; password?: boolean; expiresAt?: string }>(null)

const canGenerate = computed(() =>
	!!destFolderRel.value &&
	!passwordRequired.value &&
	accessSatisfied.value
)

async function generateLink() {
	if (!canGenerate.value) {
		pushNotification(
			new Notification(
				'Cannot Generate Link',
				'Pick a destination folder on the server and fix access settings before generating an upload link.',
				'denied',
				8000,
			),
		)
		return
	}

	if (passwordRequired.value) {
		pushNotification(
			new Notification(
				'Password Required',
				'Enter a password or switch access mode.',
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
			expiresIn: Number(expiresSec.value) || 0,
			title: linkTitle.value || undefined,
			baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
			access_mode: accessMode.value === 'restricted' ? 'restricted' : 'open',
			auth_mode: accessMode.value === 'open' ? 'none' : 'password',
		}

		if (accessMode.value === 'open_password') {
			body.password = password.value.trim()
		}

		if (accessMode.value === 'restricted' && accessUsers.value.length) {
			body.users = accessUsers.value.map((c: any) => {
				const out: any = {}
				if (c.id != null) out.userId = c.id
				if (c.username) out.username = c.username
				if (c.user_email) out.user_email = c.user_email
				if (c.name) out.name = c.name
				if (c.role_id != null) out.roleId = c.role_id
				if (c.role_name) out.roleName = c.role_name
				return out
			})
		}

		// console.log('[create-upload-link] request body', JSON.stringify(body))
		const resp = await apiFetch('/api/create-upload-link', {
			method: 'POST',
			body: JSON.stringify(body),
		})

		if (!resp?.url) throw new Error(resp?.error || 'Failed to create link')

		result.value = {
			url: resp.url,
			code: resp.code,
			password: accessMode.value === 'open_password',
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
		const level: 'error' | 'denied' = /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'
		error.value = msg
		pushNotification(new Notification('Failed to Create Upload Link', msg, level, 8000))
	} finally {
		loading.value = false
	}
}

function resetAll() {
	destFolderRel.value = ''
	expiresValue.value = 7
	expiresUnit.value = 'days'
	password.value = ''
	showPassword.value = false
	linkTitle.value = ''
	accessUsers.value = []
	accessMode.value = defaultAccessMode.value
	result.value = null
	error.value = null
	usePublicBase.value = defaultUsePublicBase.value
}

async function copyLink() {
	if (!result.value) return
	await navigator.clipboard.writeText(result.value.url)
	pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
	if (!result.value?.url) return
	window.open(result.value.url, '_blank')
	pushNotification(new Notification('Opening Link', 'Upload link opened in your default browser.', 'info', 4000))
}

function goBack() {
	to('dashboard')
}

watch(accessMode, (mode) => {
	if (mode !== 'open_password') {
		password.value = ''
		showPassword.value = false
	}
})

watch(
	accessUsers,
	(arr) => {
		if (arr.length > 0 && accessMode.value !== 'restricted') accessMode.value = 'restricted'
	},
	{ deep: true },
)

const userModalOpen = ref(false)

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
	const next = users.map((u: any) => {
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
