<template>
    <div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
        <div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div class="grid w-full grid-cols-1 gap-4 text-2xl min-w-0">
                <CardContainer class="w-full bg-accent rounded-md shadow-xl min-w-0">
                    <template #header>
                        <!-- ===== Step 1: Project selection ===== -->
                        <div v-if="!projectSelected" class="flex w-full flex-col gap-3 text-left min-w-0">
                            <h2 class="text-xl font-semibold">Select a project</h2>

                            <label class="flex items-center gap-2 text-sm cursor-pointer select-none min-w-0">
                                <input type="checkbox" v-model="showEntireTree" @change="loadProjectChoices" />
                                <span class="min-w-0">Show entire directory tree from root</span>
                            </label>

                            <!-- Mode: ROOTS -->
                            <template v-if="browseMode === 'roots'">
                                <div class="text-sm opacity-80 min-w-0">
                                    <span class="font-semibold">ZFS Pools:</span>
                                    <span v-if="detecting" class="ml-1">Detecting…</span>
                                    <span v-else-if="!projectRoots.length" class="ml-1">None detected</span>
                                </div>

                                <div class="max-h-64 overflow-auto border-default bg-default rounded-md min-w-0">
                                    <div v-for="r in projectRoots" :key="r.mountpoint"
                                        class="flex items-center justify-between gap-2 border-b border-default px-3 py-2 text-base min-w-0">
                                        <div class="min-w-0 flex-1">
                                            <code class="block truncate" :title="`${r.name} → ${r.mountpoint}`">{{
                                                r.mountpoint }}</code>
                                        </div>
                                        <div class="flex gap-2 flex-shrink-0">
                                            <button class="btn btn-primary" @click="chooseProject(r.mountpoint)">Select</button>
                                        </div>
                                    </div>
                                </div>
                            </template>

                            <div class="text-sm text-red-400" v-if="detectError">
                                {{ detectError }}
                            </div>
                        </div>

                        <!-- ===== Step 2: select file content (only after project chosen) ===== -->
                        <div v-else class="flex flex-col gap-2 text-left min-w-0">
                            <div class="text-sm text-muted -mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                                <span class="font-semibold">Project:</span>
                                <code class="min-w-0 truncate">{{ projectBase }}</code>
                                <button class="btn btn-secondary sm:ml-3" @click="resetProject">
                                    Change Project Directory
                                </button>
                            </div>

                            <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd"
                                :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />

                            <!-- Selected files panel -->
                            <div v-if="files.length" class="border rounded bg-accent min-w-0">
                                <div class="flex flex-wrap items-center gap-2 p-2 min-w-0">
                                    <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                        {{ showSelected ? 'Hide' : 'Show' }} list
                                    </button>
                                    <button class="btn btn-danger" @click="clearAll">Clear all</button>
                                </div>

                                <div v-show="showSelected" class="max-h-40 overflow-auto min-w-0">
                                    <div v-for="(f, i) in files" :key="f"
                                        class="grid items-center [grid-template-columns:minmax(0,1fr)_auto] border-t border-default text-sm min-w-0">
                                        <div class="relative px-3 py-2 rounded-md bg-default min-w-0">
                                            <span aria-hidden="true"
                                                class="pointer-events-none absolute inset-0 rounded-md bg-green-500/50 animate-pulse z-0"></span>
                                            <span class="truncate block text-default relative z-10 min-w-0">{{ f }}</span>
                                        </div>

                                        <button class="btn btn-danger m-2 px-2 py-1" @click="removeFile(i)"
                                            title="Remove">✕</button>
                                    </div>
                                </div>
                            </div>

                            <div class="border-t border-default mt-4 pt-4 min-w-0">
                                <!-- ===== Common link options ===== -->
                                <CommonLinkControls>
                                    <template #expiry>
                                        <div class="flex flex-col gap-3 min-w-0">
                                            <!-- Row 1: label + input + select (always one row; inputs stay together) -->
                                            <div class="flex items-center gap-3 min-w-0">
                                                <label class="font-semibold whitespace-nowrap flex-shrink-0">Expires
                                                    in:</label>

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

                                    <template #title>
                                        <div class="flex flex-wrap items-center gap-3 min-w-0">
                                            <label class="font-semibold sm:whitespace-nowrap">Link Title:</label>
                                            <input type="text" v-model.trim="linkTitle"
                                                class="input-textlike border rounded px-3 py-2 w-full min-w-[12rem]"
                                                placeholder="Optional title for the shared link" />
                                        </div>
                                    </template>

                                    <template #access>
                                       <!--  <div class="flex flex-wrap items-center gap-3 min-w-0 mb-2">
                                            <label class="font-semibold sm:whitespace-nowrap" for="watermark-switch">
                                                Add Watermark:
                                            </label>

                                            <Switch id="watermark-switch" v-model="useWatermark"
                                                :disabled="!canTranscodeSelected"
                                                :title="!canTranscodeSelected ? 'Only for Videos' : ''" :class="[
                                                    useWatermark ? 'bg-secondary' : 'bg-well',
                                                    !canTranscodeSelected ? 'opacity-50 cursor-not-allowed' : '',
                                                    'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                ]">
                                                <span class="sr-only">Toggle proxy file generation</span>
                                                <span aria-hidden="true" :class="[
                                                    useWatermark ? 'translate-x-5' : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                ]" />
                                            </Switch>

                                            <span class="text-sm select-none truncate min-w-0 flex-1"
                                                :title="!canTranscodeSelected ? 'Only for Videos' : ''">
                                                <template v-if="canTranscodeSelected">
                                                    {{ useWatermark ? 'Share raw + proxy files' : 'Share raw files only' }}
                                                </template>
                                                <template v-else>
                                                    (Only for Videos)
                                                </template>
                                            </span>
                                        </div> -->
                                        <div class="flex flex-wrap items-center gap-3 min-w-0 mb-2">
                                            <label class="font-semibold sm:whitespace-nowrap" for="transcode-switch">
                                                Use Proxy Files:
                                            </label>

                                            <Switch id="transcode-switch" v-model="transcodeProxy"
                                                :disabled="!canTranscodeSelected"
                                                :title="!canTranscodeSelected ? 'Only for Videos' : ''"
                                                :class="[
                                                    transcodeProxy ? 'bg-secondary' : 'bg-well',
                                                    !canTranscodeSelected ? 'opacity-50 cursor-not-allowed' : '',
                                                    'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                ]">
                                                <span class="sr-only">Toggle proxy file generation</span>
                                                <span aria-hidden="true" :class="[
                                                    transcodeProxy ? 'translate-x-5' : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                ]" />
                                            </Switch>

                                            <span class="text-sm select-none truncate min-w-0 flex-1"
                                                :title="!canTranscodeSelected ? 'Only for Videos' : ''">
                                                <template v-if="canTranscodeSelected">
                                                    {{ transcodeProxy ? 'Share raw + proxy files' : 'Share raw files only' }}
                                                </template>
                                                <template v-else>
                                                    (Only for Videos)
                                                </template>
                                            </span>
                                        </div>
                                        <div class="flex flex-wrap items-center gap-3 min-w-0">
                                            <label class="font-semibold sm:whitespace-nowrap" for="link-access-switch">
                                                Link Access:
                                            </label>

                                            <Switch id="link-access-switch" v-model="usePublicBase" :class="[
                                                usePublicBase ? 'bg-secondary' : 'bg-well',
                                                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                            ]">
                                                <span class="sr-only">Toggle link access</span>
                                                <span aria-hidden="true" :class="[
                                                    usePublicBase ? 'translate-x-5' : 'translate-x-0',
                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                ]" />
                                            </Switch>

                                            <span class="text-sm select-none truncate min-w-0 flex-1">
                                                {{ usePublicBase ? 'Share Externally (Over Internet)' : 'Share Locally (Over LAN)' }}
                                            </span>
                                        </div>
                                    </template>

                                    <template #accessExtra>
                                        <CheckPortForwarding v-if="usePublicBase" :apiFetch="apiFetch"
                                            endpoint="/api/forwarding/check" :autoCheckOnMount="false" :showDetails="true" />
                                    </template>

                                    <template #password>
                                        <div v-if="!restrictToUsers" class="flex flex-col gap-2 min-w-0">
                                            <div class="flex flex-wrap items-center gap-3 min-w-0">
                                                <label class="font-semibold sm:whitespace-nowrap">Password Protected Link:</label>

                                                <Switch id="use-password-switch" v-model="protectWithPassword" :class="[
                                                    protectWithPassword ? 'bg-secondary' : 'bg-well',
                                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                ]">
                                                    <span class="sr-only">Toggle use password</span>
                                                    <span aria-hidden="true" :class="[
                                                        protectWithPassword ? 'translate-x-5' : 'translate-x-0',
                                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                    ]" />
                                                </Switch>
                                            </div>

                                            <div class="flex flex-wrap items-center gap-3 min-w-0">
                                                <label class="text-default font-semibold sm:whitespace-nowrap">Password</label>

                                                <div class="relative flex items-center min-w-0 w-full">
                                                    <input :disabled="!protectWithPassword"
                                                        :type="showPassword ? 'text' : 'password'" v-model.trim="password"
                                                        placeholder="Enter your password"
                                                        class="input-textlike border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed w-full pr-10 min-w-0" />
                                                    <button type="button" @click="showPassword = !showPassword"
                                                        class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                                        <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                                        <EyeSlashIcon v-else class="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </template>

                                    <template #commenters>
                                        <div class="flex flex-col gap-3 min-w-0">
                                            <div class="flex flex-wrap items-center gap-3 min-w-0">
                                                <label class="font-semibold sm:whitespace-nowrap">Restrict Access to Users</label>

                                                <Switch id="restrict-access-switch" v-model="restrictToUsers" :class="[
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
                                                    Commenting and download permissions are controlled by roles.
                                                </p>
                                            </div>

                                            <div v-else class="flex flex-wrap items-center gap-3 min-w-0">
                                                <label class="font-semibold sm:whitespace-nowrap">Allow Comments</label>

                                                <Switch id="allow-comments-switch" v-model="allowOpenComments" :class="[
                                                    allowOpenComments ? 'bg-secondary' : 'bg-well',
                                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                ]">
                                                    <span class="sr-only">Toggle comments</span>
                                                    <span aria-hidden="true" :class="[
                                                        allowOpenComments ? 'translate-x-5' : 'translate-x-0',
                                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                    ]" />
                                                </Switch>
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

                            <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :link="linkContext" roleHint="view" :preselected="accessUsers.map(c => ({
                                id: c.id,
                                username: c.username || '',
                                name: c.name,
                                user_email: c.user_email,
                                display_color: c.display_color,
                                role_id: c.role_id ?? undefined,
                                role_name: c.role_name ?? undefined,
                            }))" @apply="onApplyUsers" />
                        </div>
                    </template>

                    <div v-if="projectSelected" class="flex flex-col min-w-0">
                        <!-- was: button-group-row + w-full on generate -->
                        <div class="flex flex-wrap gap-2 w-full min-w-0">
                            <button class="btn btn-secondary" :disabled="loading" @click="resetAll">
                                Reset
                            </button>
                            <button class="btn btn-secondary flex-1 min-w-[14rem]" :disabled="!canGenerate || loading"
                                @click="generateLink" title="Create a magic link with the selected options">
                                <span v-if="loading" class="inline-flex items-center gap-2">
                                    <span
                                        class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
                                    Generating…
                                </span>
                                <span v-else>Generate magic link</span>
                            </button>
                        </div>

                        <div v-if="viewUrl" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
                            <code class="max-w-full break-all">{{ viewUrl }}</code>
                            <div class="flex flex-wrap gap-2 mt-2">
                                <button class="btn btn-secondary" @click="copyLink">Copy</button>
                                <button class="btn btn-primary" @click="openInBrowser">Open</button>
                            </div>
                        </div>
                    </div>
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
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi'
import FileExplorer from '../components/FileExplorer.vue'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useProjectChoices } from '../composables/useProjectChoices'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import type { Commenter } from '../typings/electron'
import { useHeader } from '../composables/useHeader'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { useResilientNav } from '../composables/useResilientNav';
import { useTransferProgress } from '../composables/useTransferProgress'

const { to } = useResilientNav()
useHeader('Select Files to Share');
const transfer = useTransferProgress()

const { apiFetch } = useApi()
const linkContext = { type: 'download' as const }
// ================== Project selection state ==================
const projectSelected = ref(false)
const showEntireTree = ref(false)
const projectBase = ref<string>('')
const {
    detecting, detectError, projectRoots, browseMode, loadProjectChoices,
} = useProjectChoices(showEntireTree)
const accessUsers = ref<Commenter[]>([])
const restrictToUsers = ref(false)
const allowOpenComments = ref(true)
const defaultRestrictToUsers = ref(false)
const defaultAllowOpenComments = ref(true)
const defaultUseProxyFiles = ref(false)
const accessCount = computed(() => accessUsers.value.length)
const accessSatisfied = computed(() => !restrictToUsers.value || accessCount.value > 0)
const linkTitle = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

function resetAll() {
    files.value = []
    showSelected.value = true
    expiresValue.value = 7
    expiresUnit.value = 'days'
    usePublicBase.value = defaultUsePublicBase.value
    linkTitle.value = ''
    accessUsers.value = []
    restrictToUsers.value = defaultRestrictToUsers.value
    allowOpenComments.value = defaultAllowOpenComments.value
    password.value = ''
    protectWithPassword.value = false
    showPassword.value = false
    viewUrl.value = ''
    downloadUrl.value = ''
    error.value = null
    autoRegenerate.value = false
    transcodeProxy.value = defaultUseProxyFiles.value
    if (regenTimer) {
        clearTimeout(regenTimer)
        regenTimer = null
    }
    fileMimes.value = {}
}

function chooseProject(dirPath: string) {
    projectBase.value = dirPath
    projectSelected.value = true
    // Optional: clear previously selected files when switching projects
    files.value = []
    invalidateLink()
}

// Allow going back to re-pick a project
function resetProject() {
    projectSelected.value = false
    projectBase.value = ''
    invalidateLink()
    files.value = []
    // Refresh choice list (honors current checkbox)
    loadProjectChoices()
}

const autoRegenerate = ref(false)
let regenTimer: ReturnType<typeof setTimeout> | null = null

const files = ref<string[]>([])
const showSelected = ref(true)
function clearAll() {
    files.value = []
    invalidateLink()
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
        defaultAllowOpenComments.value =
            typeof s?.defaultAllowComments === 'boolean' ? s.defaultAllowComments : true;
        defaultUseProxyFiles.value =
            typeof s?.defaultUseProxyFiles === 'boolean' ? s.defaultUseProxyFiles : false;

        restrictToUsers.value = defaultRestrictToUsers.value;
        allowOpenComments.value = defaultAllowOpenComments.value;
        transcodeProxy.value = defaultUseProxyFiles.value;
    } catch {
        // Keep current default if settings can't be loaded
        defaultUsePublicBase.value = true;
        usePublicBase.value = true;
        defaultRestrictToUsers.value = false;
        defaultAllowOpenComments.value = true;
        defaultUseProxyFiles.value = false;
        restrictToUsers.value = defaultRestrictToUsers.value;
        allowOpenComments.value = defaultAllowOpenComments.value;
        transcodeProxy.value = defaultUseProxyFiles.value;
    }
}

function toAbsUnder(base: string, p: string) {
    // base: e.g. "/tank"
    const bName = (base || '').replace(/\/+$/, '').replace(/^\/+/, ''); // "tank"
    const clean = (p || '').replace(/^\/+/, '');                         // "tank/foo" or "foo"
    if (!bName) return '/' + clean;                                      // no project root picked

    // If the path already starts with the base name, don't duplicate it.
    if (clean === bName || clean.startsWith(bName + '/')) {
        return '/' + clean;                                                // "/tank/..."
    }
    return '/' + bName + '/' + clean;                                    // "/tank/foo"
}

// When FileExplorer emits @add, normalize relative paths to live under the chosen project (if restricted)
function onExplorerAdd(paths: string[]) {
    paths.forEach(p => {
        let full = p;
        if (!showEntireTree.value && projectBase.value) {
            // Always normalize to an absolute path under the chosen project root.
            full = toAbsUnder(projectBase.value, p);
        } else {
            // Ensure absolute (avoid accidental relative paths)
            full = p.startsWith('/') ? p : '/' + p.replace(/^\/+/, '');
        }
        if (!files.value.includes(full)) files.value.push(full);
    });
    invalidateLink();
    scheduleAutoRegen();
}

function removeFile(i: number) {
    files.value.splice(i, 1)
    invalidateLink()
    scheduleAutoRegen()
}

watch(files, () => {
    // This catches adds/removes done outside the helpers (e.g., FileExplorer @add)
    invalidateLink()
    scheduleAutoRegen()
    refreshFileMimes()
}, { deep: true })


const canTranscodeSelected = computed(() =>
    files.value.length > 0 &&
    files.value.every(p => isVideoByMimeOrExt(p, fileMimes.value[p]))
)

// const canTranscodeSelected = true;
watch(canTranscodeSelected, (ok) => {
    if (!ok) transcodeProxy.value = false
})

watch(showEntireTree, (v) => {
    if (v) {
        // Bypass the project picker and jump straight to the normal file selector
        projectBase.value = '';          // no restriction
        projectSelected.value = true;    // show step 2
        invalidateLink();
    } else {
        // Return to ZFS pool selection
        projectSelected.value = false;
        projectBase.value = '';
        invalidateLink();
        loadProjectChoices();
    }
});
watch(restrictToUsers, (v) => {
    if (v) {
        protectWithPassword.value = false
        password.value = ''
    }
});
watch(
    accessUsers,
    (arr) => {
        if (arr.length > 0) restrictToUsers.value = true
    },
    { deep: true }
)

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

function filterVersionIdsByJobKind(
    versionIds: number[],
    jobInfo: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }>,
    kind: string
) {
    const queued: number[] = []
    const active: number[] = []
    const skipped: number[] = []

    for (const vId of versionIds) {
        const rec = jobInfo[vId]
        if (rec?.activeKinds?.includes(kind)) active.push(vId)
        else if (rec?.queuedKinds?.includes(kind)) queued.push(vId)
        else if (rec?.skippedKinds?.includes(kind)) skipped.push(vId)
        else {
            // Unknown: server didn't tell us. Treat as queued to preserve existing behavior.
            queued.push(vId)
        }
    }

    return { queued, active, skipped }
}


const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

// password state
const protectWithPassword = ref(false)
const password = ref('')
const showPassword = ref(false)

const viewUrl = ref('')
const downloadUrl = ref('')

const transcodeProxy = ref(false)

// Always on for share links
const adaptiveHls = computed(() => true)

type FileMimeMap = Record<string, string | null>
const fileMimes = ref<FileMimeMap>({})
let mimeLoadSeq = 0

const VIDEO_EXT_RE = /\.(mp4|mkv|mov|avi|webm|m4v|wmv)$/i
function isVideoByMimeOrExt(path: string, mime?: string | null) {
    if (mime && /^video\//i.test(mime)) return true
    // Fall back to extension if mime is missing or generic.
    const generic =
        !mime ||
        /^application\/octet-stream$/i.test(mime) ||
        /^application\/mp4$/i.test(mime)
    return generic ? VIDEO_EXT_RE.test(path) : false
}

async function refreshFileMimes() {
    const paths = files.value.slice()
    const seq = ++mimeLoadSeq

    const next: FileMimeMap = { ...fileMimes.value }
    for (const k of Object.keys(next)) {
        if (!paths.includes(k)) delete next[k]
    }

    if (!paths.length) {
        fileMimes.value = next
        return
    }

    try {
        const data = await apiFetch('/api/mime', {
            method: 'POST',
            body: JSON.stringify({ paths })
        })
        const mimes = data?.mimes || {}
        for (const p of paths) {
            if (Object.prototype.hasOwnProperty.call(mimes, p)) next[p] = mimes[p] ?? null
            else next[p] = next[p] ?? null
        }
    } catch {
        for (const p of paths) next[p] = next[p] ?? null
    }

    if (seq === mimeLoadSeq) fileMimes.value = next
}


// Map units → seconds
const UNIT_TO_SECONDS = {
    hours: 60 * 60,
    days: 24 * 60 * 60,
    weeks: 7 * 24 * 60 * 60,
} as const


// Compute the seconds value we send to the server
const expiresSec = computed(() => {
    const raw = Math.floor(expiresValue.value || 0);

    // 0 → Never
    if (raw <= 0) return 0;

    return raw * UNIT_TO_SECONDS[expiresUnit.value];
});


// Pretty text like "3 days" / "2 weeks"
const prettyExpiry = computed(() => {
    if (expiresSec.value === 0) return 'Never';

    const v = Math.max(1, Math.floor(expiresValue.value || 0));
    const u = expiresUnit.value;
    const label = v === 1 ? u.slice(0, -1) : u;
    return `${v} ${label}`;
});

const canGenerate = computed(() =>
    files.value.length > 0 &&
    Number.isFinite(expiresValue.value) &&
    expiresValue.value >= 0 && // 0 = never, >=1 = normal
    (!protectWithPassword.value || !!password.value) &&
    accessSatisfied.value
);

function invalidateLink() {
    viewUrl.value = ''
    downloadUrl.value = ''
}

function scheduleAutoRegen() {
    // avoid spamming the server if multiple mutations happen quickly
    if (regenTimer) clearTimeout(regenTimer)
    regenTimer = setTimeout(async () => {
        if (autoRegenerate.value && canGenerate.value) {
            await generateLink()
        }
    }, 350)
}


// Set preset helper
function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
    expiresValue.value = v
    expiresUnit.value = u
}

function setNever() {
    expiresValue.value = 0;
    expiresUnit.value = 'hours';
}

type MagicLinkTranscode = {
    fileId?: string | number;
    assetVersionId?: string | number;
    jobs?: any;
};

function extractAssetVersionIdsFromMagicLinkResponse(data: any): number[] {
    const ids: number[] = [];
    const push = (v: any) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    };

    const t = data?.transcodes;

    if (Array.isArray(t)) {
        for (const rec of t as MagicLinkTranscode[]) push(rec?.assetVersionId);
    } else if (t && typeof t === "object") {
        for (const k of Object.keys(t)) push((t as any)[k]?.assetVersionId);
    }

    return Array.from(new Set(ids));
}

function extractDbFileIdsFromMagicLinkResponse(data: any): number[] {
    const ids: number[] = [];
    const push = (v: any) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) ids.push(n);
    };

    const t = data?.transcodes;
    if (Array.isArray(t)) {
        for (const rec of t as MagicLinkTranscode[]) push(rec?.fileId);
    }

    // single-file response shape
    push(data?.file?.id);

    // collection response shape
    if (Array.isArray(data?.files)) {
        for (const f of data.files) push(f?.id);
    }

    return Array.from(new Set(ids));
}

async function generateLink() {
    if (!canGenerate.value) {
        // Safety guard – normally prevented by disabled button
        pushNotification(
            new Notification(
                'Cannot Generate Link',
                'Please select at least one file and fix any validation errors before creating a link.',
                'denied',
                8000,
            )
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
            )
        )
        return
    }

    loading.value = true
    error.value = null
    viewUrl.value = ''
    downloadUrl.value = ''

    const body: any = {
        expiresInSeconds: expiresSec.value,
        projectBase: projectBase.value || undefined,
        baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
        title: linkTitle.value || undefined,
    }

    if (files.value.length === 1) body.filePath = files.value[0]
    else body.filePaths = files.value.slice()

    if (protectWithPassword.value && password.value) {
        body.password = password.value
    }

    body.access_mode = restrictToUsers.value ? 'restricted' : 'open'
    body.auth_mode = restrictToUsers.value
        ? 'password'
        : (protectWithPassword.value ? 'password' : 'none')
    if (!restrictToUsers.value) {
        body.allow_comments = !!allowOpenComments.value
    }

    if (restrictToUsers.value && accessUsers.value.length) {
        (body as any).users = accessUsers.value.map(c => {
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

    const wantsProxy = canTranscodeSelected.value && !!transcodeProxy.value
    const wantsHls = canTranscodeSelected.value && !!adaptiveHls.value

    const proxyAlreadyActiveForAll =
        wantsProxy &&
        files.value.length > 0 &&
        files.value.every(f => transfer.hasActiveTranscodeForFile(f, 'proxy_mp4'))

    const hlsAlreadyActiveForAll =
        wantsHls &&
        files.value.length > 0 &&
        files.value.every(f => transfer.hasActiveTranscodeForFile(f, 'hls'))

    const requestProxy = wantsProxy && !proxyAlreadyActiveForAll
    const requestHls = wantsHls && !hlsAlreadyActiveForAll

    body.generateReviewProxy = requestProxy
    body.adaptiveHls = requestHls

    if (proxyAlreadyActiveForAll) {
        pushNotification(
            new Notification(
                'Proxy Already In Progress',
                'Proxy generation is already running for the selected file(s), so a new request was skipped.',
                'info',
                6000
            )
        )
    }

    if (hlsAlreadyActiveForAll) {
        pushNotification(
            new Notification(
                'Stream Already In Progress',
                'Adaptive stream generation is already running for the selected file(s), so a new request was skipped.',
                'info',
                6000
            )
        )
    }

    try {
        const data = await apiFetch('/api/magic-link', {
            method: 'POST',
            body: JSON.stringify(body),
        })

        viewUrl.value = data.viewUrl
        downloadUrl.value = data.downloadUrl

        if (requestProxy || requestHls) {
            const versionIds = extractAssetVersionIdsFromMagicLinkResponse(data);

            if (versionIds.length) {
                const jobInfo = extractJobInfoByVersion(data);

                const proxySplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'proxy_mp4');
                const hlsSplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'hls');

                const groupId = `link:${data.viewUrl}`;
                const fileForTask = files.value.length === 1 ? files.value[0] : undefined;

                // Proxy: only track versions that were actually queued
                if (requestProxy) {
                    const proxyCandidates = [...proxySplit.queued, ...proxySplit.active]
                    const proxyActiveSplit = transfer.splitActiveTranscodeAssetVersions(proxyCandidates, 'proxy_mp4')
                    const proxyToTrack = proxyActiveSplit.inactive

                    if (proxyToTrack.length) {
                        transfer.startAssetVersionTranscodeTask({
                            apiFetch,
                            assetVersionIds: proxyToTrack,
                            title: 'Generating proxy files',
                            detail: `Tracking ${proxyToTrack.length} asset version(s)`,
                            intervalMs: 1500,
                            jobKind: 'proxy_mp4',
                            context: {
                                source: 'link',
                                groupId,
                                linkUrl: data.viewUrl,
                                linkTitle: linkTitle.value || undefined,
                                file: fileForTask,
                                files: files.value.slice(),
                            },
                        });
                    }

                    const proxyInProgressIds = Array.from(new Set([
                        ...proxySplit.active,
                        ...proxyActiveSplit.active,
                    ]))

                    if (proxyInProgressIds.length) {
                        pushNotification(
                            new Notification(
                                'Proxy Already In Progress',
                                `Proxy generation is already in progress for ${proxyInProgressIds.length} item(s).`,
                                'info',
                                6000
                            )
                        )
                    } else if (proxySplit.skipped.length) {
                        pushNotification(
                            new Notification(
                                'Proxy Already Available',
                                `Proxy generation was skipped for ${proxySplit.skipped.length} item(s) (already exists).`,
                                'info',
                                6000
                            )
                        );
                    }
                }

                // HLS: only track versions that were actually queued
                if (requestHls) {
                    const hlsCandidates = [...hlsSplit.queued, ...hlsSplit.active]
                    const hlsActiveSplit = transfer.splitActiveTranscodeAssetVersions(hlsCandidates, 'hls')
                    const hlsToTrack = hlsActiveSplit.inactive

                    if (hlsToTrack.length) {
                        transfer.startAssetVersionTranscodeTask({
                            apiFetch,
                            assetVersionIds: hlsToTrack,
                            title: 'Generating adaptive stream',
                            detail: `Tracking ${hlsToTrack.length} asset version(s)`,
                            intervalMs: 1500,
                            jobKind: 'hls',
                            context: {
                                source: 'link',
                                groupId,
                                linkUrl: data.viewUrl,
                                linkTitle: linkTitle.value || undefined,
                                file: fileForTask,
                                files: files.value.slice(),
                            },
                        });
                    }

                    const hlsInProgressIds = Array.from(new Set([
                        ...hlsSplit.active,
                        ...hlsActiveSplit.active,
                    ]))

                    if (hlsInProgressIds.length) {
                        pushNotification(
                            new Notification(
                                'Stream Already In Progress',
                                `Adaptive stream generation is already in progress for ${hlsInProgressIds.length} item(s).`,
                                'info',
                                6000
                            )
                        )
                    } else if (hlsSplit.skipped.length) {
                        pushNotification(
                            new Notification(
                                'Stream Already Available',
                                `Adaptive stream generation was skipped for ${hlsSplit.skipped.length} item(s) (already exists).`,
                                'info',
                                6000
                            )
                        );
                    }
                }
            } else {
                // fallback (only if server didn't return transcodes for some reason)
                const fileIds = extractDbFileIdsFromMagicLinkResponse(data);

                if (fileIds.length) {
                    // NOTE: fileId polling can't separate proxy vs hls unless you also add jobKind support to summarize()
                    // If you want two rows even in fallback mode, you need the deterministic taskId approach or extend startTranscodeTask similarly.
                    transfer.startTranscodeTask({
                        apiFetch,
                        fileIds,
                        title: "Generating transcodes",
                        detail: `Tracking ${fileIds.length} file(s)`,
                        intervalMs: 1500,
                    });

                    pushNotification(
                        new Notification(
                            "Transcode Tracking Limited",
                            "The server did not return asset version IDs, so progress tracking may be less detailed.",
                            "warning",
                            8000
                        )
                    );
                } else {
                    pushNotification(
                        new Notification(
                            "Transcode Generation Requested",
                            "Transcode generation was requested, but the server did not return tracking IDs.",
                            "warning",
                            8000
                        )
                    );
                }
            }
        }

        const label = usePublicBase.value ? 'external (Internet)' : 'local (LAN)'
        const titlePart = linkTitle.value ? ` for “${linkTitle.value}”` : ''

        pushNotification(
            new Notification(
                'Magic Link Created',
                `A ${label} magic link was created${titlePart}.`,
                'success',
                8000,
            )
        )
    } catch (e: any) {
        const msg = e?.message || e?.error || String(e)
        const level: 'error' | 'denied' =
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error'

        error.value = msg

        pushNotification(
            new Notification(
                'Failed to Create Magic Link',
                msg,
                level,
                8000,
            )
        )
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    await loadLinkDefaults();
    loadProjectChoices();
})

async function copyLink() {
    if (!viewUrl.value) return
    await navigator.clipboard.writeText(viewUrl.value)
    pushNotification(new Notification('Copied!', 'Link copied to clipboard', 'success', 8000))
}

function openInBrowser() {
    if (!viewUrl.value) return
    window.open(viewUrl.value, '_blank')

    pushNotification(
        new Notification(
            'Opening Link',
            'Magic link opened in your default browser.',
            'info',
            4000,
        )
    )
}


async function goBack() {
    to('dashboard');
}

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

function onApplyUsers(
    users: any[]
) {
    // Normalize the selection coming back from the modal
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

    // Dedupe by key just in case
    const seen = new Set<string>()
    const dedup: typeof next = []
    for (const c of next) {
        if (seen.has(c.key)) continue
        seen.add(c.key)
        dedup.push(c)
    }

    // REPLACE (not merge): reflect exactly what's selected in the modal
    accessUsers.value = dedup

    invalidateLink()
    scheduleAutoRegen()
}


</script>
