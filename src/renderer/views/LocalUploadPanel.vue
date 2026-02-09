<template>
	<div class="h-full flex items-start justify-center pt-6 overflow-y-auto">
		<div class="grid grid-cols-1 gap-5 text-xl w-9/12 mx-auto">
			<CardContainer class="bg-accent rounded-md shadow-xl">
				<template #header>
					<!-- Stepper -->
					<div class="flex items-center gap-3 text-sm justify-center">
						<div :class="stepClass(1)">1</div><span>Select local files</span>
						<div class="h-px w-10 bg-slate-600 mx-2"></div>
						<div :class="stepClass(2)">2</div><span>Choose destination</span>
						<div class="h-px w-10 bg-slate-600 mx-2"></div>
						<div :class="stepClass(3)">3</div><span>Upload</span>
					</div>
				</template>

				<!-- STEP 1: Local files -->
				<section v-show="step === 1" class="wizard-pane">
					<h2 class="wizard-heading">Pick local files</h2>

					<div class="wizard-controls">
						<div class="button-group-row">
							<button class="btn btn-primary" @click="pickFiles">Choose Files</button>
							<button class="btn btn-secondary" @click="pickFolder">Choose Folder</button>
						</div>

						<span class="wizard-muted">
							{{ selected.length ? `${selected.length} item(s) • ${formatSize(totalSelectedBytes)}` : 'No files selected' }}

						</span>

						<div class="grow"></div>
						<button class="btn btn-secondary" v-if="selected.length" @click="clearSelected">Clear</button>
					</div>

					<div class="wizard-table-shell">
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
										No files selected. Click <span class="font-bold">Choose Files</span> (you can
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
											<button class="btn btn-secondary" @click="removeSelected(f)">Remove</button>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</section>

				<!-- STEP 2: Destination (server) -->
				<section v-show="step === 2" class="wizard-pane">
					<h2 class="wizard-heading">Choose destination on server</h2>

					<FolderPicker v-model="destFolderRel" :apiFetch="apiFetch" useCase="upload"
						subtitle="Pick the folder on the server where these files will be uploaded."
						:auto-detect-roots="true" :allow-entire-tree="true" v-model:project="projectBase"
						v-model:dest="destFolderRel" />
				</section>


				<!-- STEP 3: Upload progress -->
				<section v-show="step === 3" class="wizard-pane">
					<h2 class="wizard-heading">Uploading to {{ destDir || '/' }}</h2>

					<div class="wizard-table-shell">
						<table class="min-w-full text-sm border border-default border-collapse text-left">
							<thead>
								<tr class="bg-default text-default border-b border-default">
									<th scope="col" class="px-4 py-2 font-semibold border border-default">Name</th>
									<th scope="col" class="px-4 py-2 font-semibold border border-default">Size</th>
									<th scope="col" class="px-4 py-2 font-semibold border border-default">Speed/Time</th>
									<th scope="col" class="px-4 py-2 font-semibold border border-default">Status</th>
									<th scope="col" class="px-4 py-2 font-semibold border border-default text-right">
										Action</th>
								</tr>
							</thead>

							<tbody class="">
								<!-- Empty state -->
								<tr v-if="!uploads.length">
									<td colspan="4" class="px-4 py-4 text-center text-muted border border-default">
										Ready to start. Click <b>Start Upload</b>.
									</td>
								</tr>

								<!-- Rows -->
								<template v-for="u in uploads" :key="u.localKey">
									<tr
										class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default">
										<!-- Name -->
										<td class="px-4 py-2 border border-default">
											<div class="truncate font-medium" :title="u.path">{{ u.name }}</div>
											<div class="text-xs opacity-70">
												<template v-if="u.status === 'uploading'">
													{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
													<span v-if="u.speed"> • {{ u.speed }}</span>
													<span v-if="u.eta"> • ETA {{ u.eta }}</span>
												</template>
												<template v-else></template>
											</div>
										</td>

										<!-- Size -->
										<td class="px-4 py-2 border border-default">
											<span class="text-sm opacity-80">{{ formatSize(u.size) }}</span>
										</td>

										<!-- Speed / Time -->
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

										<!-- Status -->
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

										<!-- Action -->
										<td class="px-4 py-2 border border-default">
											<div class="flex justify-end">
												<button class="btn btn-secondary" @click="cancelOne(u)"
													:disabled="u.status !== 'uploading'" title="Cancel this upload">
													Cancel
												</button>
											</div>
										</td>
									</tr>

									<!-- Progress row -->
									<tr v-if="u.status === 'uploading'">
										<td colspan="4" class="px-4 py-2 border border-default">
											<progress class="w-full h-2 rounded-lg overflow-hidden bg-default
											accent-[#584c91]
											[&::-webkit-progress-value]:bg-[#584c91]
											[&::-moz-progress-bar]:bg-[#584c91]" :value="Number.isFinite(u.progress) ? u.progress : 0" max="100">
											</progress>
										</td>
									</tr>

									<!-- Error row -->
									<tr v-if="u.error">
										<td colspan="4" class="px-4 py-2 border border-default text-xs text-red-400">
											{{ u.error }}
										</td>
									</tr>
								</template>
							</tbody>
						</table>
					</div>

				</section>

				<template #footer>
					<div class="grid grid-cols-[auto_1fr_auto] items-center gap-2">
						<!-- Left -->
						<div class="justify-self-start">
							<button v-if="step !== 1" class="btn btn-secondary" @click="prevStep">Back</button>
						</div>

						<!-- Center -->
						<div class="justify-self-center">
							<div v-if="step === 3" class="grid gap-2">
								<div class="grid grid-cols-[auto_auto_minmax(10rem,10rem)] items-center gap-3">
									<label class="font-semibold whitespace-nowrap">
										Generate Proxy Files:
									</label>
							<div v-if="step === 3" class="grid gap-2">
								<div class="grid grid-cols-[auto_auto_minmax(10rem,10rem)] items-center gap-3">
									<label class="font-semibold whitespace-nowrap">
										Generate Proxy Files:
									</label>

									<Switch v-model="transcodeProxyAfterUpload" :class="[
										transcodeProxyAfterUpload ? 'bg-secondary' : 'bg-well',
										'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
									]">
										<span class="sr-only">Toggle proxy file generation</span>
										<span aria-hidden="true" :class="[
											transcodeProxyAfterUpload ? 'translate-x-5' : 'translate-x-0',
											'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
										]" />
									</Switch>

									<!-- fixed width so text changes don't move anything -->
									<span class="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
										{{ transcodeProxyAfterUpload ? 'Share raw + proxy files' : 'Share raw files only' }}
									</span>
								</div>

								<div v-if="transcodeProxyAfterUpload" class="grid grid-cols-[auto_1fr] items-start gap-3">
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

								<div v-if="hasVideoSelected && transcodeProxyAfterUpload" class="grid grid-cols-[auto_auto_minmax(10rem,10rem)] items-center gap-3">
									<label class="font-semibold whitespace-nowrap">
										Watermark Videos:
									</label>

									<Switch v-model="watermarkAfterUpload" :class="[
										watermarkAfterUpload ? 'bg-secondary' : 'bg-well',
										'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
									]">
										<span class="sr-only">Toggle video watermarking</span>
										<span aria-hidden="true" :class="[
											watermarkAfterUpload ? 'translate-x-5' : 'translate-x-0',
											'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
										]" />
									</Switch>

									<span class="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
										{{ watermarkAfterUpload ? 'Apply watermark to videos' : 'No watermark' }}
									</span>
								</div>

								<div v-if="hasVideoSelected && watermarkAfterUpload" class="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3">
									<span class="text-sm font-semibold whitespace-nowrap">Watermark Image:</span>
									<button class="btn btn-secondary" @click="pickWatermark">Choose Image</button>
									<span class="text-sm whitespace-nowrap overflow-hidden text-ellipsis">
										{{ watermarkFile ? watermarkFile.name : 'No image selected' }}
									</span>
									<button v-if="watermarkFile" class="btn btn-secondary" @click="clearWatermark">Clear</button>
								</div>

								<div v-if="hasVideoSelected && watermarkAfterUpload && !watermarkFile" class="text-xs text-amber-300">
									Select a watermark image to continue.
								</div>
							</div>
						</div>

						<!-- Right -->
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

type LocalFile = { path: string; name: string; size: number }

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
	if (watermarkAfterUpload.value && !watermarkFile.value) return true;
	if (transcodeProxyAfterUpload.value && proxyQualities.value.length === 0) return true;
	if (watermarkAfterUpload.value && !watermarkFile.value) return true;
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
		'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
		step.value >= n ? 'bg-[#584c91] text-white' : 'bg-slate-700 text-slate-300'
	].join(' ')
}

function joinPath(dir: string, name: string) {
	const d = String(dir || '').replace(/\/+$/, '')
	const n = String(name || '').replace(/^\/+/, '')
	return (d ? d : '/') + '/' + n
}

function extractJobInfoByVersion(data: any): Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> {
	const map: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> = {};
	const t = data?.transcodes;
	if (!Array.isArray(t)) return map;

	for (const rec of t as any[]) {
		const vId = Number(rec?.assetVersionId);
		if (!Number.isFinite(vId) || vId <= 0) continue;

		map[vId] = {
			queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
			activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
			skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
		};
	}
	return map;
}

function waitForIngestAndStartTranscode(opts: {
	uploadId: string
	rowName: string
	wantProxy: boolean
	allowVideoTranscode: boolean
	groupId: string
	destDir: string
	destFileAbs: string
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

		// HLS (you said always)
		if (shouldTrack('hls')) {
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
					},
				});
			}
		}

		// Proxy (only if user asked)
		if (opts.wantProxy && shouldTrack('proxy_mp4')) {
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
					},
				});
			}
		}
	};

	const handler = async (_e: any, payload: any) => {
		try {
			if (!payload?.ok) {
				if (payload?.error === 'outputs_exist') {
					const msg = 'Proxy outputs already exist for this file. Overwrite them?';
					const proceed = window.confirm(msg);
					if (proceed) {
						const params = new URLSearchParams();
						if (payload?.destRel) params.set('dest', String(payload.destRel));
						if (payload?.name) params.set('name', String(payload.name));
						params.set('hls', '1');
						if (opts.wantProxy) params.set('proxy', '1');
						if (proxyQualities.value.length) params.set('proxyQualities', proxyQualities.value.join(','));

						if (watermarkAfterUpload.value) {
							params.set('watermark', '1');
							if (watermarkFile.value?.name) {
								params.set('watermarkFile', watermarkFile.value.name);
							}
							if (proxyQualities.value.length) {
								params.set('watermarkProxyQualities', proxyQualities.value.join(','));
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
					pushNotification(
						new Notification(
							'Ingest Failed',
							payload?.error || 'Ingest failed.',
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
		if (f) watermarkFile.value = f;
	});
}
function clearWatermark() { watermarkFile.value = null }
function pickWatermark() {
	window.electron.pickWatermark().then(f => {
		if (f) watermarkFile.value = f;
	});
}
function clearWatermark() { watermarkFile.value = null }

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
		watermarkAfterUpload.value = false
		watermarkFile.value = null
	}
}, { deep: true })

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

const VIDEO_EXT_RE = /\.(mp4|mkv|mov|avi|webm|m4v|wmv)$/i
function isVideoLocalFile(f: LocalFile) {
	return VIDEO_EXT_RE.test(f.name || f.path)
}

const canTranscodeSelected = computed(() =>
	selected.value.length > 0 && selected.value.every(isVideoLocalFile)
)

watch(canTranscodeSelected, (ok) => {
	if (!ok) transcodeProxyAfterUpload.value = false
})


// Step 2: destination
const cwd = ref<string>('')                 // for the breadcrumb text the picker emits
const destDir = computed(() => cwd.value) 	// alias used in UI
const destFolderRel = ref<string>('')       // FolderPicker v-model
const canNext = computed(() => !!destFolderRel.value)
const projectBase = ref<string>('')

// Normalize the destination we actually use with rsync
const normalizedDest = computed(() =>
	`/${destFolderRel.value.replace(/^\/+/, '')}`
)

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
const proxyQualities = ref<string[]>([])
const watermarkAfterUpload = ref(false)
const watermarkFile = ref<LocalFile | null>(null)
const adaptiveHls = ref(false);

watch(transcodeProxyAfterUpload, (v) => {
	if (v && proxyQualities.value.length === 0) {
		proxyQualities.value = ['720p']
	}
	if (!v) {
		proxyQualities.value = []
		watermarkAfterUpload.value = false
		watermarkFile.value = null
	}
})

watch(transcodeProxyAfterUpload, (v) => {
	if (v && proxyQualities.value.length === 0) {
		proxyQualities.value = ['720p']
	}
	if (!v) {
		proxyQualities.value = []
		watermarkAfterUpload.value = false
		watermarkFile.value = null
	}
})

function finish() {
	// Reset the wizard (or route away)
	selected.value = []
	uploads.value = []
	cwd.value = '/'
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
	cwd.value = '/';
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

	// full reset when leaving step 3 after all terminal
	/*  selected.value = [];
		uploadedRegistry.value.clear();
		destFolderRel.value = '';
		cwd.value = '/';
		projectBase.value = '';  */
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

	if (watermarkAfterUpload.value) {
		isUploading.value = true
		if (!watermarkFile.value) {
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

		const destDirAbs = uploads.value[0]?.dest || normalizedDest.value
		const { done } = await window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: watermarkFile.value.path,
				destDir: destDirAbs,
				port: serverPort,
				keyPath: privateKeyPath,
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
	}
	let startedAny = false

	if (watermarkAfterUpload.value) {
		isUploading.value = true
		if (!watermarkFile.value) {
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

		const destDirAbs = uploads.value[0]?.dest || normalizedDest.value
		const { done } = await window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: watermarkFile.value.path,
				destDir: destDirAbs,
				port: serverPort,
				keyPath: privateKeyPath,
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
	}

	for (const row of uploads.value) {
		// Ignore rows that are not queued or already uploaded
		if (row.status !== 'queued' || row.alreadyUploaded) continue;

		row.status = 'uploading';
		row.startedAt = row.startedAt ?? Date.now(); 
		isUploading.value = true
		startedAny = true
		startedAny = true

		const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)

		// Build a stable per-row absolute destination path for grouping + display
		const destDirAbs = row.dest // already normalizedDest like "/tank/Local Uploads"
		const destFileAbs = joinPath(destDirAbs, row.name)
		const allowVideoTranscode = VIDEO_EXT_RE.test(row.name || row.path)

		const taskId = transfer.createUploadTask({
			title: `Uploading: ${row.name}`,
			detail: destDirAbs,
			cancel: () => {
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

		const { id, done } = await window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: row.path,
				destDir: row.dest,
				port: serverPort,
				keyPath: privateKeyPath,
<<<<<<< HEAD
				transcodeProxy: transcodeProxyAfterUpload.value,
				proxyQualities: proxyQualities.value.slice(),
				watermark: watermarkAfterUpload.value,
				watermarkFileName: watermarkFile.value?.name,
				watermarkProxyQualities: watermarkAfterUpload.value ? proxyQualities.value.slice() : undefined,
			},
			p => {
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

		// Start listening for ingest -> fileId (so we can track transcode progress)
		const stopIngestListener = waitForIngestAndStartTranscode({
			uploadId: id,
			rowName: row.name,
			wantProxy: transcodeProxyAfterUpload.value,
			allowVideoTranscode,
			groupId,
			destDir: destDirAbs,
			destFileAbs,
		})
		row.ingestUnsub = stopIngestListener

		// Ensure we clean up no matter what
		const cleanup = () => {
			try { stopIngestListener?.(); } catch { }
		};

		done.then((res: any) => {
			cleanup();

			if (res.ok) {
				row.status = row.status === 'canceled' ? 'canceled' : 'done';
				row.progress = 100;
				transfer.finishUpload(taskId, true);

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

	if (!startedAny) {
		isUploading.value = false
	}
}


function cancelOne(row: UploadRow) {
	if (!row.rsyncId) return
	if (row.dockTaskId) transfer.cancelUpload(row.dockTaskId)
	try { row.ingestUnsub?.(); } catch { }
	row.ingestUnsub = null;
	window.electron.rsyncCancel(row.rsyncId)
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
/* Consistent page + typography + shells */
.wizard-pane {
	@apply flex flex-col gap-4 text-left;
}

.wizard-heading {
	@apply text-xl font-semibold mt-2 text-left;
}

.wizard-controls {
	@apply flex flex-row items-center gap-5;
}

.wizard-muted {
	@apply text-sm text-muted;
}

.wizard-table-shell {
	@apply border rounded overflow-auto h-[28rem];
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
</style>

