<template>
	<div class="h-full overflow-y-auto pt-3 pb-4">
		<div class="ss-page-frame grid grid-cols-1 gap-3 text-xl">
			<CardContainer class="local-upload-card ss-surface bg-accent rounded-md shadow-xl h-[calc(100vh-10rem)] flex flex-col">
				<template #header>
					<div class="wizard-head">
						<h2 class="wizard-main-title">Local Upload Wizard</h2>
						<ol class="wizard-stepper" aria-label="Upload steps">
							<li class="wizard-step-item">
								<div :class="stepClass(1)">1</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Select Local Files</span>
									<span class="wizard-step-help">Choose files/folders from this workstation.</span>
								</div>
							</li>
							<li class="wizard-step-divider" aria-hidden="true"></li>
							<li class="wizard-step-item">
								<div :class="stepClass(2)">2</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Choose Destination</span>
									<span class="wizard-step-help">Pick the target folder on the server.</span>
								</div>
							</li>
							<li class="wizard-step-divider" aria-hidden="true"></li>
							<li class="wizard-step-item">
								<div :class="stepClass(3)">3</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Upload</span>
									<span class="wizard-step-help">Monitor transfer progress and completion.</span>
								</div>
							</li>
						</ol>
					</div>
				</template>

				<div class="wizard-stage">

					<!-- STEP 1: Local files -->
					<section v-show="step === 1" class="wizard-pane wizard-pane--fill">

						<h2 class="wizard-heading">Pick local files</h2>

							<div class="wizard-controls">
								<div class="button-group-row">
									<button class="btn btn-primary" @click="pickFiles">Choose Files</button>
									<button class="btn btn-secondary" @click="pickFolder">Choose Folder</button>
								</div>

							<span class="wizard-muted">
								{{ selected.length ? `${selected.length} item(s) • ${formatSize(totalSelectedBytes)}` :	'No files selected' }}

							</span>

							<div class="grow"></div>
							<button class="btn btn-secondary" v-if="selected.length"
								@click="clearSelected">Clear</button>
						</div>

							<div class="wizard-table-shell"
								:class="selected.length ? 'wizard-table-shell--filled' : 'wizard-table-shell--empty'">
							<table class="wizard-table">
								<thead>
									<tr class="wizard-thead-row">
										<th scope="col" class="wizard-th">Name</th>
										<th scope="col" class="wizard-th">Size</th>
										<th scope="col" class="wizard-th text-right">Action</th>
									</tr>
								</thead>
								<tbody class="bg-accent">
									<tr v-if="!selected.length">
										<td colspan="3" class="wizard-td text-center text-muted">
											No files selected. Click <span class="font-bold">Choose Files</span> (you
											can
											select multiple),
											or <span class="font-bold">Choose Folder</span> to add its contents.
										</td>
									</tr>
									<tr v-for="f in selected" :key="f.path" class="transition border border-default">
										<td class="wizard-td">
											<div class="truncate" :title="f.path">{{ f.name }}</div>
										</td>
										<td class="wizard-td"><span class="text-sm opacity-75">{{
											formatSize(f.size) }}</span></td>
										<td class="wizard-td">
											<div class="flex justify-end">
												<button class="btn btn-secondary"
													@click="removeSelected(f)">Remove</button>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<!-- STEP 2: Destination (server) -->
					<section v-show="step === 2" class="wizard-pane wizard-pane--fill">

						<h2 class="wizard-heading">Choose destination on server</h2>

						<FolderPicker v-model="destFolderRel" :apiFetch="apiFetch" useCase="upload"
							subtitle="Pick the folder on the server where these files will be uploaded."
							:auto-detect-roots="true" :allow-entire-tree="true" v-model:project="projectBase"
							v-model:dest="destFolderRel" />
					</section>


					<!-- STEP 3: Upload progress -->
					<section v-show="step === 3" class="wizard-pane wizard-pane--fill">
						<h2 class="wizard-heading">Uploading to {{ destDir || '/' }}</h2>

						<div class="wizard-step3-body">
							<div class="wizard-table-shell wizard-table-shell--uploads">
								<table class="min-w-full text-sm border border-default border-collapse text-left">
									<thead>
										<tr class="bg-default text-default border-b border-default">
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Name</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Size</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Speed/Time</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Status</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default text-right">Action</th>
										</tr>
									</thead>
									<tbody>
										<tr v-if="!uploads.length">
											<td colspan="5" class="px-4 py-4 text-center text-muted border border-default">
												Ready to start. Click <b>Start Upload</b>.
											</td>
										</tr>
										<template v-for="u in uploads" :key="u.localKey">
											<tr class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default">
												<td class="px-4 py-2 border border-default">
													<div class="truncate font-medium" :title="u.path">{{ u.name }}</div>
													<div class="text-xs opacity-70">
														<template v-if="u.status === 'uploading'">
															{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
															<span v-if="u.speed"> • {{ u.speed }}</span>
															<span v-if="u.eta"> • ETA {{ u.eta }}</span>
														</template>
													</div>
												</td>
												<td class="px-4 py-2 border border-default">
													<span class="text-sm opacity-80">{{ formatSize(u.size) }}</span>
												</td>
												<td class="px-4 py-2 border border-default">
													<template v-if="u.status === 'uploading'">
														<span v-if="u.speed">{{ u.speed }}</span>
														<br />
														<span v-if="u.eta">ETA {{ u.eta }}</span>
													</template>
													<template v-else-if="u.status === 'done' && u.completedIn">
														Completed in {{ u.completedIn }}
													</template>
													<template v-else>
														<span>-</span>
													</template>
												</td>
												<td class="px-4 py-2 border border-default">
													<span
														class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
														:class="{
															'bg-default dark:bg-well/75 text-zinc-600 dark:text-zinc-300': u.status === 'queued',
															'bg-default dark:bg-well/75 text-blue-600 dark:text-blue-300': u.status === 'uploading',
															'bg-default dark:bg-well/75 text-green-600 dark:text-green-300': u.status === 'done',
															'bg-default dark:bg-well/75 text-amber-600 dark:text-amber-300': u.status === 'canceled',
															'bg-default dark:bg-well/75 text-red-600 dark:text-red-300': u.status === 'error',
														}">
														<template v-if="u.status === 'uploading'">
															{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
														</template>
														<template v-else>
															<span v-if="u.alreadyUploaded && u.status === 'done'">
																done (already uploaded to this folder)
															</span>
															<span v-else>{{ u.status }}</span>
														</template>
													</span>
												</td>
												<td class="px-4 py-2 border border-default">
													<div class="flex justify-end">
														<button class="btn btn-secondary" @click="cancelOne(u)"
															:disabled="u.status !== 'uploading'" title="Cancel this upload">
															Cancel
														</button>
													</div>
												</td>
											</tr>

											<tr v-if="u.status === 'uploading'">
												<td colspan="5" class="px-4 py-2 border border-default">
													<progress class="wizard-progress" :value="Number.isFinite(u.progress) ? u.progress : 0" max="100">
													</progress>
												</td>
											</tr>

											<tr v-if="u.error">
												<td colspan="5" class="px-4 py-2 border border-default text-xs text-red-400">
													{{ u.error }}
												</td>
											</tr>
										</template>
									</tbody>
								</table>
							</div>

							<div v-if="hasVideoSelected" class="advanced-video-card ss-toned-panel">
								<div class="advanced-video-header">
									<p class="font-semibold">Advanced video options</p>
									<p class="text-xs text-muted">
										{{ transcodeProxyAfterUpload || watermarkAfterUpload ? 'Proxy/watermark options enabled' : 'Configure proxy qualities and watermarking' }}
									</p>
								</div>

								<div class="advanced-video-grid">
									<div class="advanced-col">
										<div class="flex flex-wrap items-center gap-2">
											<label class="font-semibold whitespace-nowrap">Use Proxy Files:</label>
											<Switch v-model="transcodeProxyAfterUpload" :class="[
												transcodeProxyAfterUpload ? 'bg-secondary' : 'bg-well',
												'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
											]">
												<span class="sr-only">Toggle proxy file generation</span>
												<span aria-hidden="true" :class="[
													transcodeProxyAfterUpload ? 'translate-x-5' : 'translate-x-0',
													'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
												]" />
											</Switch>
											<span class="text-sm text-muted">
												{{ transcodeProxyAfterUpload ? 'Generate and use proxy files' : 'Share raw files only' }}
											</span>
										</div>

										<div class="mt-2" :class="!transcodeProxyAfterUpload ? 'opacity-60' : ''">
											<label class="font-semibold block mb-1">Proxy Qualities</label>
											<div class="flex flex-wrap gap-x-3 gap-y-2">
												<label class="inline-flex items-center gap-2 text-sm">
													<input type="checkbox" class="checkbox" value="720p" v-model="proxyQualities"
														:disabled="!transcodeProxyAfterUpload" />
													<span>720p</span>
												</label>
												<label class="inline-flex items-center gap-2 text-sm">
													<input type="checkbox" class="checkbox" value="1080p" v-model="proxyQualities"
														:disabled="!transcodeProxyAfterUpload" />
													<span>1080p</span>
												</label>
												<label class="inline-flex items-center gap-2 text-sm">
													<input type="checkbox" class="checkbox" value="original" v-model="proxyQualities"
														:disabled="!transcodeProxyAfterUpload" />
													<span>Original</span>
												</label>
											</div>
											<div class="text-xs text-slate-400 mt-2">
												These versions are used for shared links instead of original files.
											</div>
										</div>
									</div>

									<div class="advanced-col">
										<div v-if="transcodeProxyAfterUpload" class="space-y-2">
											<div class="flex flex-wrap items-center gap-2">
												<label class="font-semibold whitespace-nowrap">Watermark Videos:</label>
												<Switch v-model="watermarkAfterUpload" :class="[
													watermarkAfterUpload ? 'bg-secondary' : 'bg-well',
													'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
												]">
													<span class="sr-only">Toggle video watermarking</span>
													<span aria-hidden="true" :class="[
														watermarkAfterUpload ? 'translate-x-5' : 'translate-x-0',
														'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
													]" />
												</Switch>
												<span class="text-sm text-muted">{{ watermarkAfterUpload ? 'Apply watermark' : 'No watermark' }}</span>
											</div>

											<div v-if="watermarkAfterUpload" class="flex flex-wrap items-center gap-2">
												<button class="btn btn-secondary" @click="pickWatermark">Choose Image</button>
												<span class="text-sm truncate min-w-0" :title="watermarkFile ? watermarkFile.name : 'No image selected'">
													{{ watermarkFile ? watermarkFile.name : 'No image selected' }}
												</span>
												<select
													v-model="selectedExistingWatermark"
													class="input-textlike border rounded px-2 py-1 text-sm min-w-[16rem]"
												>
													<option value="">Select existing watermark file…</option>
													<option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">
														{{ wm }}
													</option>
												</select>
												<button class="btn btn-secondary px-2 py-1 text-xs" @click="loadExistingWatermarkFiles">Refresh</button>
											</div>

											<div v-if="watermarkAfterUpload && !watermarkFile && !selectedExistingWatermark" class="watermark-warning">
												Select a watermark image to continue.
											</div>
										</div>
										<div v-else class="text-sm text-muted">
											Enable proxy files to use watermark options.
										</div>
									</div>

									<div class="advanced-col">
										<div v-if="watermarkAfterUpload && watermarkFile?.dataUrl" class="space-y-2">
											<div class="flex items-center justify-between gap-2">
												<div class="text-xs text-slate-400">Preview (approximate)</div>
												<button v-if="watermarkFile" class="btn btn-danger" @click="clearWatermark">Clear Image</button>
											</div>
											<div class="relative aspect-video w-full max-w-[18rem] rounded-md border border-default bg-default/60 overflow-hidden">
												<div class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60"></div>
												<img :src="watermarkFile.dataUrl" alt="Watermark preview"
													class="absolute bottom-3 right-3 max-h-[35%] max-w-[35%] opacity-70 drop-shadow-md" />
											</div>
										</div>
										<div v-else class="text-xs text-muted">
											Preview appears after selecting an image.
										</div>
									</div>
								</div>
							</div>
						</div>
					</section>
				</div>
				

				<template #footer>
					<div class="wizard-footer grid grid-cols-2 items-center">
						<div class="justify-self-start">
							<button v-if="step !== 1" class="btn btn-secondary" @click="prevStep">Back</button>
						</div>

					<div class="justify-self-end">
						<button class="btn btn-primary" :disabled="nextDisabled" @click="nextStep">
							{{ nextLabel }}
						</button>
					</div>
				</div>
				</template>

			</CardContainer>
			<div class="button-group-row">
				<button @click="goBack" class="btn btn-danger justify-start">
					Return to Dashboard
				</button>
			</div>
		</div>
	</div>

</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import { Switch } from '@headlessui/vue';
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import { useHeader } from '../composables/useHeader';
import { useResilientNav } from '../composables/useResilientNav'
import { onBeforeRouteLeave } from 'vue-router';
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui';
import { useTransferProgress } from '../composables/useTransferProgress'
const { to } = useResilientNav()
useHeader('Upload Files')
const transfer = useTransferProgress()

type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }

const connectionMeta = inject(connectionMetaInjectionKey)!;
const ssh = connectionMeta.value.ssh
const isUploading = ref(false)

const { apiFetch } = useApi()

/** ── Step control ───────────────────────────────────────── */
const step = ref<1 | 2 | 3>(1)

const nextLabel = computed(() => {
	if (step.value === 1) return 'Next';
	if (step.value === 2) return 'Next';
	// step 3
	return allDone.value ? 'Finish' : (isUploading.value ? 'Uploading…' : 'Start Upload');
});

const nextDisabled = computed(() => {
	if (step.value === 1) return selected.value.length === 0;
	if (step.value === 2) return !canNext.value;
	// step 3: disable while actively uploading (until done), otherwise allow Start/Finish
	if (transcodeProxyAfterUpload.value && proxyQualities.value.length === 0) return true;
	if (watermarkAfterUpload.value && !watermarkFile.value && !selectedExistingWatermark.value) return true;
	return isUploading.value && !allDone.value;
});

function prevStep() {
	if (step.value > 1) goStep((step.value - 1) as 1 | 2 | 3);
}

async function nextStep() {
	if (step.value === 1) return goStep(2);
	if (step.value === 2) return goStep(3);
	// step 3
	if (allDone.value) return finish();
	return startUploads();
}

function goStep(s: 1 | 2 | 3) {
	step.value = s
	if (s === 3) {
		// build rows for review
		uploads.value = prepareRows()
	}
}
function stepClass(n: number) {
	return [
		'wizard-step-dot',
		step.value > n
			? 'wizard-step-dot--done'
			: step.value === n
				? 'wizard-step-dot--active'
				: 'wizard-step-dot--pending'
	].join(' ')
}

function joinPath(dir: string, name: string) {
	const d = String(dir || '').replace(/\/+$/, '')
	const n = String(name || '').replace(/^\/+/, '')
	return (d ? d : '/') + '/' + n
}

function rootOfServerPath(p: string) {
	const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return '/'
	const first = clean.split('/').filter(Boolean)[0] || ''
	return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRoot() {
	const base = String(projectBase.value || '').trim()
	const root = base || rootOfServerPath(normalizedDest.value)
	let abs = String(root || '/').replace(/\\/g, '/').trim()
	if (!abs) abs = '/'
	if (!abs.startsWith('/')) abs = '/' + abs
	abs = abs.replace(/\/+$/, '') || '/'
	const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
	return { abs, rel }
}

function resolveWatermarkDirRel() {
	const { rel } = resolveWatermarkStorageRoot()
	return rel ? `${rel}/.studio/watermarks` : '.studio/watermarks'
}

function resolveWatermarkUploadDir() {
	return `/${resolveWatermarkDirRel()}`
}

function resolveWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `${resolveWatermarkDirRel()}/${name}`
}

function resolveWatermarkProjectRoot() {
	return resolveWatermarkStorageRoot().abs
}

function resolveLegacyWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `.studio/watermarks/${name}`
}

function resolveCandidateServerWatermarkRelPath() {
	const selectedPath = String(watermarkFile.value?.path || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
	if (!selectedPath) return ''

	let root = String(resolveWatermarkProjectRoot() || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
	if (!root) root = '/'
	if (!root.startsWith('/')) root = '/' + root

	if (root !== '/' && (selectedPath === root || selectedPath.startsWith(root + '/'))) {
		const tail = selectedPath.slice(root.length).replace(/^\/+/, '')
		const rootRel = root.replace(/^\/+/, '')
		return tail ? `${rootRel}/${tail}` : rootRel
	}

	if (root === '/' && selectedPath.startsWith('/')) {
		return selectedPath.replace(/^\/+/, '')
	}

	return ''
}

function splitRelPath(relPath: string) {
	const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return { dir: '', name: '' }
	const idx = clean.lastIndexOf('/')
	if (idx < 0) return { dir: '', name: clean }
	return {
		dir: clean.slice(0, idx),
		name: clean.slice(idx + 1),
	}
}

async function serverFileExists(relPath: string) {
	const { dir, name } = splitRelPath(relPath)
	if (!name) return false
	try {
		const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir)}`, { method: 'GET' })
		const entries = Array.isArray(data?.entries) ? data.entries : []
		return entries.some((e: any) => !e?.isDir && String(e?.name || '') === name)
	} catch {
		return false
	}
}

async function ensureServerDirExists(dir: string) {
	const clean = String(dir || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	try {
		await apiFetch(`/api/files?dir=${encodeURIComponent(clean || '.')}&dirsOnly=1&ensure=1`, { method: 'GET' })
		return true
	} catch {
		return false
	}
}

async function resolveExistingServerWatermarkRelPath() {
	const candidate = resolveCandidateServerWatermarkRelPath()
	const rooted = resolveWatermarkRelPath()
	const legacy = resolveLegacyWatermarkRelPath()
	const candidates = Array.from(new Set([candidate, rooted, legacy].filter(Boolean)))
	for (const relPath of candidates) {
		if (await serverFileExists(relPath)) return relPath
	}
	return ''
}

function extractJobInfoByVersion(data: any): Record<number, { queuedKinds: string[]; skippedKinds: string[] }> {
	const map: Record<number, { queuedKinds: string[]; skippedKinds: string[] }> = {};
	const t = data?.transcodes;
	if (!Array.isArray(t)) return map;

	for (const rec of t as any[]) {
		const vId = Number(rec?.assetVersionId);
		if (!Number.isFinite(vId) || vId <= 0) continue;

		map[vId] = {
			queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
			skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
		};
	}
	return map;
}

function waitForIngestAndStartTranscode(opts: {
	uploadId: string
	rowName: string
	isVideo: boolean
	wantProxy: boolean
	groupId: string
	destDir: string
	destFileAbs: string
	watermarkRelPath?: string
}) {
	const chan = `upload:ingest:${opts.uploadId}`

	const startTranscodeFromPayload = (payload: any) => {
		const fileId = Number(payload.fileId);
		const assetVersionId = Number(payload.assetVersionId);

		if (!Number.isFinite(fileId) || fileId <= 0) return;

		const jobInfo = extractJobInfoByVersion(payload);
		const rec = Number.isFinite(assetVersionId) && assetVersionId > 0 ? jobInfo[assetVersionId] : null;

		const shouldTrack = (kind: string) => {
			// If we don't have job info, preserve old behavior and track.
			if (!rec) return true;

			if (rec.queuedKinds?.includes(kind)) return true;
			if (rec.skippedKinds?.includes(kind)) return false;

			// Unknown: be permissive
			return true;
		};

		// Prefer assetVersion polling when available
		const useAssetVersion = Number.isFinite(assetVersionId) && assetVersionId > 0;

		// HLS
		if (opts.isVideo && shouldTrack('hls')) {
			if (useAssetVersion) {
				transfer.startAssetVersionTranscodeTask({
					apiFetch,
					assetVersionIds: [assetVersionId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating HLS…',
					intervalMs: 1500,
					jobKind: 'hls',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: opts.wantProxy ? proxyQualities.value.slice() : [],
					},
				});
			} else {
				transfer.startTranscodeTask({
					apiFetch,
					fileIds: [fileId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating HLS…',
					intervalMs: 1500,
					jobKind: 'hls',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: opts.wantProxy ? proxyQualities.value.slice() : [],
					},
				});
			}
		}

		// Proxy (only if user asked)
		if (opts.isVideo && opts.wantProxy && shouldTrack('proxy_mp4')) {
			if (useAssetVersion) {
				transfer.startAssetVersionTranscodeTask({
					apiFetch,
					assetVersionIds: [assetVersionId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating proxy…',
					intervalMs: 1500,
					jobKind: 'proxy_mp4',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: proxyQualities.value.slice(),
					},
				});
			} else {
				transfer.startTranscodeTask({
					apiFetch,
					fileIds: [fileId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating proxy…',
					intervalMs: 1500,
					jobKind: 'proxy_mp4',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: proxyQualities.value.slice(),
					},
				});
			}
		}
	};

		const handler = async (_e: any, payload: any) => {
			try {
				if (!payload?.ok) {
					if (payload?.error === 'outputs_exist' || payload?.error === 'hls_exists') {
						const msg = 'Transcode outputs already exist for this file. Overwrite them?';
						const proceed = window.confirm(msg);
						if (proceed) {
							const params = new URLSearchParams();
							if (payload?.destRel) params.set('dest', String(payload.destRel));
							if (payload?.name) params.set('name', String(payload.name));
							if (opts.isVideo) {
								params.set('hls', '1');
								if (opts.wantProxy) params.set('proxy', '1');
								if (proxyQualities.value.length) params.set('proxyQualities', proxyQualities.value.join(','));
							}

							if (opts.isVideo && watermarkAfterUpload.value) {
								const wmRel = String(opts.watermarkRelPath || resolveWatermarkRelPath() || watermarkFile.value?.name || '').trim()
								if (wmRel) {
									params.set('watermark', '1');
									params.set('watermarkFile', wmRel);
									if (proxyQualities.value.length) {
										params.set('watermarkProxyQualities', proxyQualities.value.join(','));
									}
								}
							}

							params.set('overwrite', '1');

							const data = await apiFetch(`/api/ingest/register?${params.toString()}`, {
								method: 'POST',
							});

							startTranscodeFromPayload(data);
						} else {
							pushNotification(
								new Notification(
									'Overwrite Canceled',
									'Existing proxy outputs were kept.',
									'info',
									6000
								)
							);
						}
					} else {
						const requestSuffix = payload?.requestId ? ` (request ${String(payload.requestId)})` : '';
						pushNotification(
							new Notification(
							'Ingest Failed',
							`${payload?.error || 'Ingest failed.'}${requestSuffix}`,
							'error',
							8000
						)
					);
				}
				return;
			}

			startTranscodeFromPayload(payload);
		} finally {
			window.electron?.ipcRenderer.removeListener(chan, handler);
		}
	};

	window.electron?.ipcRenderer.on(chan, handler)
	return () => window.electron?.ipcRenderer.removeListener(chan, handler)
}


/** ── Step 1: local files ───────────────────────────────── */
const selected = ref<LocalFile[]>([])
function addToSelection(files?: LocalFile[]) {
	const seen = new Set(selected.value.map(f => f.path))
	const append: LocalFile[] = []
	for (const f of (files || [])) if (!seen.has(f.path)) { append.push(f); seen.add(f.path) }
	if (append.length) selected.value = [...selected.value, ...append]
}
function pickFiles() { window.electron.pickFiles().then(addToSelection) }
function pickFolder() { window.electron.pickFolder().then(addToSelection) }
function removeSelected(file: LocalFile) { selected.value = selected.value.filter(f => f.path !== file.path) }
function clearSelected() { selected.value = [] }
function pickWatermark() {
	window.electron.pickWatermark().then(f => {
		if (f) {
			watermarkFile.value = f;
			selectedExistingWatermark.value = '';
		}
	});
}
function clearWatermark() { watermarkFile.value = null }

async function loadExistingWatermarkFiles() {
	try {
		const dirRel = resolveWatermarkDirRel()
		const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`, { method: 'GET' })
		const entries = Array.isArray(data?.entries) ? data.entries : []
		existingWatermarkFiles.value = entries
			.filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
			.map((e: any) => `${dirRel}/${String(e.name).trim()}`)
			.sort((a: string, b: string) => a.localeCompare(b))
	} catch {
		existingWatermarkFiles.value = []
	}
}

const totalSelectedBytes = computed(() =>
	selected.value.reduce((sum, f) => sum + (f.size || 0), 0)
)
const videoExts = new Set([
	'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
	'mpg', 'mpeg', 'm2v', '3gp', '3g2',
])
const hasVideoSelected = computed(() =>
	selected.value.some(f => {
		const ext = String(f.name || '').toLowerCase().split('.').pop() || '';
		return videoExts.has(ext);
	})
)

watch(selected, () => {
	if (!hasVideoSelected.value) {
		transcodeProxyAfterUpload.value = false
		watermarkAfterUpload.value = false
		watermarkFile.value = null
	}
}, { deep: true })

function formatSize(size: number) {
	const u = ['B', 'KB', 'MB', 'GB', 'TB']
	let i = 0; let v = size
	while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
	return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));

	if (totalSeconds < 1) return 'under 1 second';
	if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes < 60) {
		if (seconds === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
		return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
	}

	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;

	if (remMinutes === 0) {
		return `${hours} hour${hours === 1 ? '' : 's'}`;
	}

	return `${hours} hour${hours === 1 ? '' : 's'} ${remMinutes} minute${remMinutes === 1 ? '' : 's'}`;
}


// Step 2: destination
const destFolderRel = ref<string>('')       // FolderPicker v-model
const canNext = computed(() => !!destFolderRel.value)
const projectBase = ref<string>('')

// Normalize the destination we actually use with rsync
const normalizedDest = computed(() =>
	`/${destFolderRel.value.replace(/^\/+/, '')}`
)
const destDir = computed(() => normalizedDest.value)

// Registry of successful uploads: key = `${path}::${dest}`
const uploadedRegistry = ref(new Set<string>())

function makeUploadKey(path: string, dest: string) {
	return `${path}::${dest}`
}

function markUploaded(path: string, dest: string) {
	uploadedRegistry.value.add(makeUploadKey(path, dest))
}

function hasAlreadyUploaded(path: string, dest: string) {
	return uploadedRegistry.value.has(makeUploadKey(path, dest))
}

/** ── Step 3: upload & progress ─────────────────────────── */
const transcodeProxyAfterUpload = ref(false)
const proxyQualities = ref<string[]>([])
const watermarkAfterUpload = ref(false)
const watermarkFile = ref<LocalFile | null>(null)
const existingWatermarkFiles = ref<string[]>([])
const selectedExistingWatermark = ref('')
const adaptiveHls = ref(false);

watch(transcodeProxyAfterUpload, (v) => {
	if (v && proxyQualities.value.length === 0) {
		proxyQualities.value = ['720p']
	}
	if (!v) {
		proxyQualities.value = []
		watermarkAfterUpload.value = false
		watermarkFile.value = null
		selectedExistingWatermark.value = ''
	}
})

watch(selectedExistingWatermark, (v) => {
	if (String(v || '').trim()) watermarkFile.value = null
})

watch(watermarkAfterUpload, (enabled) => {
	if (enabled) void loadExistingWatermarkFiles()
	else selectedExistingWatermark.value = ''
})

function finish() {
	// Reset the wizard (or route away)
	selected.value = []
	uploads.value = []
	isUploading.value = false

	uploadedRegistry.value.clear()
	// goStep(1)
	goBack();
}

onBeforeRouteLeave((_to, _from, next) => {
	resetUploadState();
	selected.value = [];
	uploadedRegistry.value.clear();
	destFolderRel.value = '';
	projectBase.value = '';
	next();
});

const allTerminal = computed(() =>
	uploads.value.length > 0 &&
	uploads.value.every(u =>
		u.status === 'done' ||
		u.status === 'canceled' ||
		u.status === 'error'
	)
)

watch(step, (s, old) => {
	if (s === 3 && uploads.value.length === 0) {
		uploads.value = prepareRows()
	}

	if (old === 3 && s !== 3 && allTerminal.value) {
		resetUploadState()
	}
})


// ----- TYPES -----
type UploadRow = {
	localKey: string
	path: string
	name: string
	size: number
	dest: string
	rsyncId?: string | null
	status: 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
	error: string | null
	progress: number
	speed: string | null
	eta: string | null
	alreadyUploaded?: boolean
	startedAt?: number | null
	completedAt?: number | null
	completedIn?: string | null
	dockTaskId?: string | null
	ingestUnsub?: (() => void) | null

}
const uploads = ref<UploadRow[]>([])

const hasRunOnce = computed(() =>
	uploads.value.some(u => u.status !== 'queued')
)

function resetUploadState() {
	uploads.value = []
	isUploading.value = false
	rafState.clear()
}

// from step 1
const serverPort = 22
const privateKeyPath = undefined // or "~/.ssh/id_ed25519"

// Make rows once when entering Step 3
function prepareRows(): UploadRow[] {
	const dest = normalizedDest.value

	return selected.value.map(f => {
		const already = hasAlreadyUploaded(f.path, dest)

		return {
			localKey: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
			path: f.path,
			name: f.name,
			size: f.size,
			dest,
			rsyncId: null,
			progress: already ? 100 : 0,
			status: already ? 'done' : 'queued',
			error: null,
			speed: null,
			eta: null,
			alreadyUploaded: already,
			startedAt: null,
			completedAt: already ? Date.now() : null,
			completedIn: already ? 'already uploaded' : null,
		}
	})
}

function updateRowProgress(row: UploadRow, p?: number, speed?: string, eta?: string) {
	// Coalesce many rsync ticks into one animation frame update
	const prev = rafState.get(row.localKey) || {
		p: typeof row.progress === 'number' ? row.progress : undefined,
		speed: row.speed,
		eta: row.eta,
		scheduled: 0 as number | 0,
	};

	// Only update fields we actually received
	if (typeof p === 'number' && !Number.isNaN(p)) {
		prev.p = Math.max(0, Math.min(100, p));
	}
	if (typeof speed === 'string') prev.speed = speed;
	if (typeof eta === 'string') prev.eta = eta;

	if (!prev.scheduled) {
		prev.scheduled = requestAnimationFrame(() => {
			if (typeof prev.p === 'number') row.progress = prev.p;
			if (typeof prev.speed !== 'undefined') row.speed = prev.speed;
			if (typeof prev.eta !== 'undefined') row.eta = prev.eta;
			prev.scheduled = 0;
		});
	}

	rafState.set(row.localKey, prev);
}

const rafState = new Map<
	string,
	{ p?: number; speed?: string | null; eta?: string | null; scheduled?: number }
>()

async function startUploads() {
	if (!uploads.value.length) uploads.value = prepareRows();
	let startedAny = false
	let watermarkRelPathForIngest = ''

	if (watermarkAfterUpload.value) {
		isUploading.value = true
		const selectedServerWatermark = String(selectedExistingWatermark.value || '').trim()
		if (!watermarkFile.value && !selectedServerWatermark) {
			pushNotification(
				new Notification(
					'Watermark Image Required',
					'Please choose a watermark image before starting the upload.',
					'warning',
					8000
				)
			)
			isUploading.value = false
			return
		}

		if (selectedServerWatermark) {
			watermarkRelPathForIngest = selectedServerWatermark
		} else {
			watermarkRelPathForIngest = await resolveExistingServerWatermarkRelPath()
		}
		if (!watermarkRelPathForIngest && watermarkFile.value) {
			const watermarkDestDir = resolveWatermarkUploadDir()
			const ensured = await ensureServerDirExists(watermarkDestDir)
			if (!ensured) {
				pushNotification(
					new Notification(
						'Watermark Upload Failed',
						'Unable to prepare the remote watermark directory.',
						'error',
						8000
					)
				)
				isUploading.value = false
				return
			}
			const { done } = await window.electron.rsyncStart(
				{
					host: ssh?.server,
					user: ssh?.username,
					src: watermarkFile.value.path,
					destDir: watermarkDestDir,
					port: serverPort,
					keyPath: privateKeyPath,
					noIngest: true,
				}
			)
			const res = await done
			if (!res?.ok) {
				pushNotification(
					new Notification(
						'Watermark Upload Failed',
						res?.error || 'Unable to upload the watermark image.',
						'error',
						8000
					)
				)
				isUploading.value = false
				return
			}
			watermarkRelPathForIngest = resolveWatermarkRelPath() || String(watermarkFile.value?.name || '').trim()
		}
	}

	for (const row of uploads.value) {
		// Ignore rows that are not queued or already uploaded
		if (row.status !== 'queued' || row.alreadyUploaded) continue;

		row.status = 'uploading';
		row.startedAt = row.startedAt ?? Date.now();
		isUploading.value = true
		startedAny = true

		const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)

		// Build a stable per-row absolute destination path for grouping + display
		const destDirAbs = row.dest // already normalizedDest like "/tank/Local Uploads"
		const destFileAbs = joinPath(destDirAbs, row.name)

		const taskId = transfer.createUploadTask({
			title: `Uploading: ${row.name}`,
			detail: destDirAbs,
			cancel: () => {
				row.status = 'canceled'
				try { row.ingestUnsub?.(); } catch { }
				row.ingestUnsub = null
				if (row.rsyncId) window.electron.rsyncCancel(row.rsyncId)
			},
			context: {
				source: 'upload',
				groupId,
				destDir: destDirAbs,
				file: destFileAbs,
			},
		})
		row.dockTaskId = taskId

		const enableWatermark = watermarkAfterUpload.value && !!watermarkRelPathForIngest
		const { id, done } = await window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: row.path,
				destDir: row.dest,
				port: serverPort,
				keyPath: privateKeyPath,
				transcodeProxy: transcodeProxyAfterUpload.value,
				proxyQualities: proxyQualities.value.slice(),
				watermark: enableWatermark,
				watermarkFileName: enableWatermark ? watermarkRelPathForIngest : undefined,
				watermarkProxyQualities: enableWatermark ? proxyQualities.value.slice() : undefined,
			},
			p => {
				if (row.status === 'canceled' || row.status === 'done' || row.status === 'error') return

				let pct: number | undefined =
					typeof p.percent === 'number' && !Number.isNaN(p.percent) ? p.percent : undefined;

				if (pct === undefined && typeof p.bytesTransferred === 'number' && row.size > 0) {
					pct = (p.bytesTransferred / row.size) * 100;
				}

				if (pct === undefined && typeof p.raw === 'string') {
					const m = p.raw.match(/(\d+(?:\.\d+)?)%/);
					if (m) pct = parseFloat(m[1]);
				}

				updateRowProgress(row, pct, p.rate, p.eta);

				transfer.updateUpload(taskId, {
					status: 'uploading',
					progress: typeof pct === 'number' ? pct : row.progress,
					speed: p.rate ?? null,
					eta: p.eta ?? null,
				});
			}
		);

		row.rsyncId = id;
		if (row.status === 'canceled') {
			window.electron.rsyncCancel(id)
		}

		// Start listening for ingest -> fileId (so we can track transcode progress)
		const stopIngestListener = waitForIngestAndStartTranscode({
			uploadId: id,
			rowName: row.name,
			isVideo: videoExts.has(String(row.name || '').toLowerCase().split('.').pop() || ''),
			wantProxy: transcodeProxyAfterUpload.value,
			groupId,
			destDir: destDirAbs,
			destFileAbs,
			watermarkRelPath: watermarkRelPathForIngest,
		})
		row.ingestUnsub = stopIngestListener

		// Ensure we clean up no matter what
		const cleanup = () => {
			try { stopIngestListener?.(); } catch { }
		};

		done.then((res: any) => {
			cleanup();

			if (res.ok) {
				if (row.status === 'canceled') {
					transfer.updateUpload(taskId, { status: 'canceled', completedAt: Date.now() })
				} else {
					row.status = 'done';
					row.progress = 100;
					transfer.finishUpload(taskId, true);
				}

				if (row.status === 'done') {
					markUploaded(row.path, row.dest);
					const end = Date.now();
					const start = row.startedAt ?? end;
					row.completedAt = end;
					row.completedIn = formatDuration(end - start);

					pushNotification(
						new Notification('Upload Completed', `File was uploaded successfully: ${row.name}.`, 'success', 8000)
					);
				}
			} else if (row.status !== 'canceled') {
				row.status = 'error';
				row.error = res.error || 'rsync failed';
				transfer.finishUpload(taskId, false, res.error || 'rsync failed');

				pushNotification(
					new Notification('Upload Failed', `File upload failed: ${row.name}.`, 'error', 8000)
				);
			}
		}).catch((err: any) => {
			cleanup();
			isUploading.value = false;

			if (row.status !== 'canceled') {
				row.status = 'error';
				row.error = err?.message || String(err);
				transfer.finishUpload(taskId, false, err?.message || 'rsync failed');

				pushNotification(
					new Notification('Upload Failed', `File upload failed: ${row.name}.`, 'error', 8000)
				);
			}
		});
	}

	if (!startedAny) {
		isUploading.value = false
	}
}


function cancelOne(row: UploadRow) {
	if (row.dockTaskId) {
		transfer.cancelUpload(row.dockTaskId)
	} else if (row.rsyncId) {
		window.electron.rsyncCancel(row.rsyncId)
	}
	try { row.ingestUnsub?.(); } catch { }
	row.ingestUnsub = null;
	row.status = 'canceled'
}

const allDone = computed(() =>
	uploads.value.length > 0 &&
	uploads.value.every(u => u.status === 'done' || u.status === 'canceled')
)

function goBack() {
	// router.push({ name: 'dashboard' })
	to('dashboard');
}
</script>

<style lang="css" scoped>
.wizard-head {
	display: grid;
	gap: 0.75rem;
}

.wizard-main-title {
	font-size: 1.18rem;
	font-weight: 700;
	line-height: 1.2;
}

.wizard-stepper {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: center;
	gap: 0.45rem;
}

.wizard-step-item {
	display: flex;
	align-items: center;
	gap: 0.52rem;
	min-width: 0;
}

.wizard-step-divider {
	height: 1px;
	width: 2rem;
	background: color-mix(in srgb, var(--btn-primary-bg) 28%, #56566a);
}

.wizard-step-copy {
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.wizard-step-label {
	font-size: 0.8rem;
	font-weight: 700;
	line-height: 1.2;
}

.wizard-step-help {
	font-size: 0.68rem;
	opacity: 0.78;
	line-height: 1.3;
}

.wizard-step-dot {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.7rem;
	height: 1.7rem;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 36%, #616172);
	font-size: 0.76rem;
	font-weight: 800;
	flex-shrink: 0;
}

.wizard-step-dot--pending {
	color: #c8cad2;
	background: color-mix(in srgb, #2c2f3a 86%, transparent);
}

.wizard-step-dot--active {
	color: white;
	background: var(--btn-primary-bg);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--btn-primary-bg) 34%, transparent);
}

.wizard-step-dot--done {
	color: #0a2a1c;
	background: #4ade80;
}

.wizard-stage {
	@apply flex flex-col flex-1 min-h-0 overflow-hidden;
}

.wizard-pane {
	@apply flex flex-col gap-4 text-left flex-1 min-h-0;
}

.wizard-pane--fill {
	@apply flex-1 min-h-0 overflow-hidden;
}

.wizard-heading {
	@apply text-xl font-semibold mt-1 text-left;
}

.wizard-controls {
	@apply flex flex-wrap items-center gap-3;
}

.wizard-muted {
	@apply text-sm text-muted;
}

.wizard-table-shell {
	@apply border rounded overflow-auto flex-1 min-h-0;
	border-color: color-mix(in srgb, var(--btn-primary-bg) 24%, #4f5160);
}

.wizard-table-shell--filled {
	@apply flex-1 min-h-0;
}

.wizard-table-shell--empty {
	@apply flex-1 min-h-0;
}

.wizard-table-shell--uploads {
	@apply flex-1 min-h-[16rem];
}

.wizard-step3-body {
	@apply flex flex-col flex-1 min-h-0 gap-3;
}

.advanced-video-card {
	@apply shrink-0 p-3 rounded-md border;
	border-color: color-mix(in srgb, var(--btn-primary-bg) 22%, #c8ced9);
	background:
		linear-gradient(135deg, color-mix(in srgb, #ffffff 92%, #edf3ff) 0%, color-mix(in srgb, #ffffff 86%, #e4eeff) 100%),
		radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--btn-primary-bg) 10%, transparent) 0%, transparent 55%);
}

.advanced-video-header {
	@apply mb-2;
}

.advanced-video-grid {
	@apply grid gap-3 items-start;
	grid-template-columns: repeat(1, minmax(0, 1fr));
}

.advanced-col {
	@apply rounded-md p-2 min-w-0;
}

.watermark-warning {
	@apply text-xs font-semibold;
	color: #9a6a00;
	background: color-mix(in srgb, #ffda7a 20%, transparent);
	padding: 0.25rem 0.4rem;
	border-radius: 0.35rem;
}

@media (min-width: 1024px) {
	.advanced-video-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

.wizard-footer {
	@apply relative z-20;
}

.local-upload-card :deep(> div:nth-child(2)) {
	@apply min-h-0 overflow-hidden flex flex-col;
}

.wizard-table {
	@apply min-w-full text-sm border border-default border-collapse text-left;
}

.wizard-thead-row {
	@apply bg-default text-default border-b border-default;
}

.wizard-th {
	@apply px-4 py-2 font-semibold border border-default;
}

.wizard-td {
	@apply px-4 py-2 border border-default;
}

.wizard-progress {
	width: 100%;
	height: 0.5rem;
	border-radius: 0.5rem;
	overflow: hidden;
	background: color-mix(in srgb, var(--btn-success-bg, #22c55e) 18%, #d7dce4);
	accent-color: var(--btn-success-bg, #22c55e);
}

.wizard-progress::-webkit-progress-bar {
	background: color-mix(in srgb, var(--btn-success-bg, #22c55e) 18%, #d7dce4);
}

.wizard-progress::-webkit-progress-value {
	background: var(--btn-success-bg, #22c55e);
}

.wizard-progress::-moz-progress-bar {
	background: var(--btn-success-bg, #22c55e);
}

:global(.dark) .wizard-progress {
	background: color-mix(in srgb, var(--btn-success-bg, #22c55e) 18%, #11151d);
}

:global(.dark) .wizard-progress::-webkit-progress-bar {
	background: color-mix(in srgb, var(--btn-success-bg, #22c55e) 18%, #11151d);
}

:global(.dark) .advanced-video-card {
	border-color: color-mix(in srgb, var(--btn-primary-bg) 40%, #55607a);
	background:
		linear-gradient(135deg, color-mix(in srgb, #1b2333 88%, #2f3c55) 0%, color-mix(in srgb, #202a3f 86%, #35486b) 100%),
		radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--btn-primary-bg) 16%, transparent) 0%, transparent 55%);
}

:global(.dark) .watermark-warning {
	color: #ffd772;
	background: color-mix(in srgb, #ffd772 20%, transparent);
}

@media (max-width: 920px) {
	.wizard-stepper {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.45rem;
	}

	.wizard-step-divider {
		display: none;
	}

	.wizard-step-help {
		display: none;
	}
}

</style>
