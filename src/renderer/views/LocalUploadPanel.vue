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
											formatSize(f.size)}}</span></td>
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

					<FolderPicker v-model="destFolderRel" :apiFetch="apiFetch" useCase="upload" title="Destination" :auto-detect-roots="true"
						subtitle="Pick the folder on the server where these files will be uploaded." :key="'picker-'+step"
						:showSelection="true" @changed-cwd="v => (cwd = v)" />
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
												<template v-else>{{ u.status }}</template>
											</div>
										</td>

										<!-- Size -->
										<td class="px-4 py-2 border border-default">
											<span class="text-sm opacity-80">{{ formatSize(u.size) }}</span>
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
												}"
												>

												<template v-if="u.status === 'uploading'">
													{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
													<span v-if="u.speed" class="opacity-70">• {{ u.speed }}</span>
													<span v-if="u.eta" class="opacity-70">• ETA {{ u.eta }}</span>
												</template>

												<template v-else>{{ u.status }}</template>
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
					<div class="flex items-center gap-2">
						<!-- Back (hidden on step 1) -->
						<button v-if="step !== 1" class="btn btn-secondary" @click="prevStep">Back</button>

						<!-- spacer keeps Next on the right even when Back is hidden -->
						<div class="grow"></div>

						<!-- Next / Start Upload / Finish -->
						<button class="btn btn-primary" :disabled="nextDisabled" @click="nextStep">
							{{ nextLabel }}
						</button>
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
import CardContainer from '../components/CardContainer.vue'
import { useApi } from '../composables/useApi'
import FolderPicker from '../components/FolderPicker.vue'
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import { useHeader } from '../composables/useHeader';
import { router } from '../../app/routes'
useHeader('Upload Files')

type LocalFile = { path: string; name: string; size: number }


const connectionMeta = inject(connectionMetaInjectionKey)!;
const ssh = connectionMeta.value.ssh
const isUploading = ref(false)

const { apiFetch } = useApi()
/** ── Step control ───────────────────────────────────────── */
const step = ref<1|2|3>(1)

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

function goStep(s: 1|2|3) {
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

/** ── Step 1: local files ───────────────────────────────── */
const selected = ref<LocalFile[]>([])
function addToSelection(files?: LocalFile[]) {
const seen = new Set(selected.value.map(f => f.path))
const append: LocalFile[] = []
for (const f of (files || [])) if (!seen.has(f.path)) { append.push(f); seen.add(f.path) }
	if (append.length) selected.value = [...selected.value, ...append]
}
function pickFiles () { window.electron.pickFiles().then(addToSelection) }
function pickFolder () { window.electron.pickFolder().then(addToSelection) }
function removeSelected(file: LocalFile) { selected.value = selected.value.filter(f => f.path !== file.path) }
function clearSelected(){ selected.value = [] }

const totalSelectedBytes = computed(() =>
	selected.value.reduce((sum, f) => sum + (f.size || 0), 0)
)
function formatSize(size: number) {
	const u = ['B','KB','MB','GB','TB']
	let i=0; let v=size
	while(v>=1024&&i<u.length-1){ v/=1024; i++ }
	return `${v.toFixed(v<10&&i>0?1:0)} ${u[i]}`
}

// Step 2: destination
const cwd = ref<string>('')                 // for the breadcrumb text the picker emits
const destDir = computed(() => cwd.value) 	// alias used in UI
const destFolderRel = ref<string>('')       // FolderPicker v-model
const canNext = computed(() => !!destFolderRel.value)


/** ── Step 3: upload & progress ─────────────────────────── */	
function finish() {
	// Reset the wizard (or route away)
	selected.value = []
	uploads.value = []
	cwd.value = '/'
	isUploading.value = false

	// goStep(1)
	goBack();
}

// When user enters step 3, seed the rows once:
watch(step, (s) => {
	if (s === 3 && uploads.value.length === 0) {
		uploads.value = prepareRows()
	}
})

// ----- TYPES -----
type UploadRow = {
	localKey: string
	path: string
	name: string
	size: number
	rsyncId?: string | null,
	status: 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
	error: string | null
	progress: number
	speed: string | null
	eta: string | null
}

const uploads = ref<UploadRow[]>([])
// from step 1
const serverPort = 22
const privateKeyPath = undefined // or "~/.ssh/id_ed25519"

// Make rows once when entering Step 3
function prepareRows(): UploadRow[] {
	return selected.value.map(f => ({
		localKey: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
		path: f.path,
		name: f.name,
		size: f.size,
		rsyncId: null,
		progress: 0,
		status: 'queued',
		error: null,
		speed: null,
		eta: null,
	}))
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

const rafState = new Map<string, { p?: number; speed?: string; eta?: string; scheduled?: number }>();
	async function startUploads() {
	if (!uploads.value.length) uploads.value = prepareRows();

	for (const row of uploads.value) {
		if (row.status !== 'queued') continue;
		row.status = 'uploading';
		isUploading.value = true

		const { id, done } = await window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: row.path,
				destDir: `/${destFolderRel.value.replace(/^\/+/, '')}`,
				port: serverPort,
				keyPath: privateKeyPath,
			},
			p => {
				console.log('rsync progress', row.name, p);
				console.log("typeof",typeof p.percent, p.bytesTransferred, row.size);
				let pct: number | undefined = typeof p.percent === 'number' && !Number.isNaN(p.percent) ? p.percent : undefined;

				// Fallback: compute from bytesTransferred if present
				if (pct === undefined && typeof p.bytesTransferred === 'number' && row.size > 0) {
				pct = (p.bytesTransferred / row.size) * 100;
				}

				// parse from raw line if library sometimes only gives raw text
				if (pct === undefined && typeof p.raw === 'string') {
				const m = p.raw.match(/(\d+(?:\.\d+)?)%/);
				if (m) pct = parseFloat(m[1]);
				}

				updateRowProgress(row, pct, p.rate, p.eta);
			}
		);

		row.rsyncId = id;

		done.then(res => {
			if ((res as any).ok) {
			row.status = row.status === 'canceled' ? 'canceled' : 'done';
			row.progress = 100;
			} else if (row.status !== 'canceled') {
			row.status = 'error';
			row.error = (res as any).error || 'rsync failed';
			}
		}).catch(err => {
			isUploading.value = false
			if (row.status !== 'canceled') {
			row.status = 'error';
			row.error = err?.message || String(err);
			}
		});
	}
}

function cancelOne(row: UploadRow) {
	if (!row.rsyncId) return
	window.electron.rsyncCancel(row.rsyncId)
	row.status = 'canceled'
}

// function cancelAll() {
// 	for (const r of uploads.value) {
// 		if (r.rsyncId && r.status === 'uploading') {
// 			window.electron.rsyncCancel(r.rsyncId)
// 			r.status = 'canceled'
// 		}
// 	}
// }

const allDone = computed(() =>
	uploads.value.length > 0 &&
	uploads.value.every(u => u.status === 'done' || u.status === 'canceled')
)

function goBack() {
	router.push({ name: 'dashboard' })
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