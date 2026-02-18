<template>
    <div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
        <div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div class="grid w-full grid-cols-1 gap-4 text-2xl min-w-0">
                <CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
                    <template #header>
                        <!-- ===== Step 1: Project selection ===== -->
                        <div v-if="!projectSelected" class="flex w-full flex-col gap-3 text-left min-w-0 bg-accent rounded-md p-4">
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

                                <div class="max-h-64 overflow-auto border-default bg-accent rounded-md min-w-0">
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

                            <FileExplorer :apiFetch="apiFetch" :modelValue="files" @add="onExplorerAdd" @remove="onExplorerRemove"
                                :base="!showEntireTree ? projectBase : ''" :startDir="!showEntireTree ? projectBase : ''" />

                            <!-- Selected files panel -->
                            <div v-if="files.length" class="border border-default p-0.5 rounded bg-accent min-w-0">
                                <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-1 min-w-0">
                                    <div class="text-sm font-semibold">
                                        Selected files <span class="text-muted">({{ files.length }})</span>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2">
                                        <button class="btn btn-secondary" @click="showSelected = !showSelected">
                                            {{ showSelected ? 'Hide' : 'Show' }} list
                                        </button>
                                        <button class="btn btn-danger" @click="clearAll">Clear all</button>
                                    </div>
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
                                <CommonLinkControls class="">
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
                                        <div class="flex flex-wrap items-center gap-3 min-w-0">
                                            <label class="font-semibold sm:whitespace-nowrap" for="link-access-switch">
                                                Network Access:
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
                                        <p class="text-xs text-muted mt-1">
                                            External sharing needs working port forwarding.
                                        </p>
                                    </template>

                                    <template #accessExtra>
                                        <div v-if="usePublicBase" class="flex flex-col gap-3 min-w-0">
                                            <CheckPortForwarding :apiFetch="apiFetch"
                                                endpoint="/api/forwarding/check" :autoCheckOnMount="false"
                                                :showDetails="true" />
                                        </div>
                                    </template>

                                    <!-- Link Access row -->
                                    <template #after class="">
                                        <div class="border-t border-default mt-2 pt-2 min-w-0">
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
                                                        <div v-if="accessMode !== 'restricted'"
                                                            class="flex flex-wrap items-center gap-3 min-w-0">
                                                            <label class="font-semibold sm:whitespace-nowrap">Allow
                                                                comments</label>
                                                            <Switch id="allow-comments-switch"
                                                                v-model="allowOpenComments" :class="[
                                                                    allowOpenComments ? 'bg-secondary' : 'bg-well',
                                                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                                ]">
                                                                <span class="sr-only">Toggle comments</span>
                                                                <span aria-hidden="true" :class="[
                                                                    allowOpenComments ? 'translate-x-5' : 'translate-x-0',
                                                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                                ]" />
                                                            </Switch>
                                                            <span class="text-xs text-muted">{{ allowOpenComments ?
                                                                'Visitors can leave a name and a comment.' : 'Comments are disabled.'}}</span>
                                                        </div>
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
                                                                Roles control download and comment permissions.
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
                                 
                                        <!-- Advanced Video Options -->
                                        <div class="border-t border-default mt-2 pt-2 min-w-0">
                                            <Disclosure v-slot="{ open }" as="div" :defaultOpen="transcodeProxy || watermarkEnabled"
                                                class="rounded-md border border-default bg-accent min-w-0">
                                                <DisclosureButton
                                                    class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left min-w-0 bg-accent rounded-md">
                                                    <div class="min-w-0">
                                                        <p class="font-semibold">Advanced video options</p>
                                                        <p class="text-xs text-muted truncate">
                                                            {{ transcodeProxy || watermarkEnabled ? 'Proxy/watermark options enabled' : 'Configure proxy qualities and watermarking' }}
                                                        </p>
                                                    </div>
                                                    <ChevronDownIcon class="h-5 w-5 text-muted transition-transform duration-200"
                                                        :class="open ? 'rotate-180' : ''" />
                                                </DisclosureButton>
                                                <DisclosurePanel class="border-t border-default px-3 py-2.5 min-w-0 bg-accent rounded-b-md">
                                                    <div class="grid grid-cols-3 gap-2.5 items-start">
                                                        <div class="rounded-md p-2.5 min-w-0">
                                                            <div class="flex flex-wrap items-center gap-2 min-w-0">
                                                                <label class="font-semibold sm:whitespace-nowrap" for="transcode-switch">
                                                                    Use Proxy Files:
                                                                </label>
                                                                <Switch id="transcode-switch" v-model="transcodeProxy"
                                                                    :disabled="transcodeSwitchDisabled"
                                                                    :title="transcodeSwitchTitle" :class="[
                                                                        transcodeProxy ? 'bg-secondary' : 'bg-well',
                                                                        transcodeSwitchDisabled ? 'opacity-50 cursor-not-allowed' : '',
                                                                        'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                                    ]">
                                                                    <span class="sr-only">Toggle proxy file generation</span>
                                                                    <span aria-hidden="true" :class="[
                                                                        transcodeProxy ? 'translate-x-5' : 'translate-x-0',
                                                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                                    ]" />
                                                                </Switch>
                                                                <span class="text-sm truncate min-w-0 flex-1" :title="transcodeSwitchTitle">
                                                                    <template v-if="!canTranscodeSelected">(Only for Videos)</template>
                                                                    <template v-else-if="preflightProxyBlocked">{{ proxyBlockReason }}</template>
                                                                    <template v-else>
                                                                        {{ transcodeProxy ? (usingExistingProxy ? 'Use existing proxy files' : 'Generate and use proxy files') : 'Share raw files only' }}
                                                                    </template>
                                                                </span>
                                                            </div>
                                                            <div v-if="canTranscodeSelected && preflightProxyBlocked"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mt-2">
                                                                {{ proxyBlockReason }}
                                                            </div>

                                                            <div class="mt-2" :class="!transcodeProxy ? 'opacity-60' : ''">
                                                                <label class="font-semibold block mb-2">Proxy Qualities</label>
                                                                <div class="flex flex-wrap gap-x-3 gap-y-2">
                                                                    <label class="inline-flex items-center gap-2 text-sm">
                                                                        <input type="checkbox" class="proxy-quality-checkbox" value="720p"
                                                                            v-model="proxyQualities"
                                                                            :disabled="!transcodeProxy" />
                                                                        <span>720p</span>
                                                                    </label>
                                                                    <label class="inline-flex items-center gap-2 text-sm">
                                                                        <input type="checkbox" class="proxy-quality-checkbox" value="1080p"
                                                                            v-model="proxyQualities"
                                                                            :disabled="!transcodeProxy" />
                                                                        <span>1080p</span>
                                                                    </label>
                                                                    <label class="inline-flex items-center gap-2 text-sm">
                                                                        <input type="checkbox" class="proxy-quality-checkbox" value="original"
                                                                            v-model="proxyQualities"
                                                                            :disabled="!transcodeProxy" />
                                                                        <span>Original</span>
                                                                    </label>
                                                                </div>
                                                                <div class="text-xs text-slate-400 mt-2">
                                                                    These versions are used for shared links instead of original
                                                                    files.
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div class="rounded-md p-2.5 min-w-0">
                                                            <div v-if="hasVideoSelected && transcodeProxy"
                                                                class="flex flex-wrap items-center gap-2 mb-2">
                                                                <label class="font-semibold whitespace-nowrap">Watermark Videos:</label>
                                                                <Switch v-model="watermarkEnabled"
                                                                    :disabled="watermarkSwitchDisabled"
                                                                    :title="watermarkSwitchTitle" :class="[
                                                                        watermarkEnabled ? 'bg-secondary' : 'bg-well',
                                                                        watermarkSwitchDisabled ? 'opacity-50 cursor-not-allowed' : '',
                                                                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                                                                    ]">
                                                                    <span class="sr-only">Toggle video watermarking</span>
                                                                    <span aria-hidden="true" :class="[
                                                                        watermarkEnabled ? 'translate-x-5' : 'translate-x-0',
                                                                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                                                                    ]" />
                                                                </Switch>
                                                                <span class="text-sm truncate min-w-0 flex-1" :title="watermarkSwitchTitle">
                                                                    {{ preflightWatermarkBlocked ? watermarkBlockReason : (watermarkEnabled ? (usingExistingWatermark ? 'Use existing watermark' : 'Apply watermark') : 'No watermark') }}
                                                                </span>
                                                            </div>
                                                            <div v-else class="text-sm text-muted">
                                                                Enable proxy files and select a video to use watermark options.
                                                            </div>

                                                            <div v-if="hasVideoSelected && transcodeProxy && preflightWatermarkBlocked"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                                {{ watermarkBlockReason }}
                                                            </div>
                                                            <div v-if="hasVideoSelected && watermarkEnabled"
                                                                class="flex flex-wrap items-center gap-2 mb-2">
                                                                <button class="btn btn-secondary" @click="pickWatermark">
                                                                    {{ usingExistingWatermark ? 'Choose New Image' : 'Choose Image' }}
                                                                </button>
                                                                <span class="text-sm truncate min-w-0"
                                                                    :title="watermarkFile ? watermarkFile.name : (usingExistingWatermark ? 'Using existing watermark outputs' : 'No image selected')">
                                                                    {{ watermarkFile ? watermarkFile.name : (usingExistingWatermark ? 'Using existing watermark outputs' : 'No image selected') }}
                                                                </span>                                                       
                                                            </div>
                                                            <div v-if="hasVideoSelected && watermarkEnabled && !watermarkFile && !usingExistingWatermark"
                                                                class="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                                                Select a watermark image to continue.
                                                            </div>
                                                            
                                                        </div>
                                                        <div class="rounded-md p-2.5 min-w-0">
                                                            <div v-if="hasVideoSelected && watermarkEnabled && watermarkFile?.dataUrl"
                                                                class="mt-1">
                                                                <div class="flex items-center justify-between gap-2 mb-1">
                                                                    <div class="text-xs text-slate-400">Preview
                                                                        (approximate)</div>
                                                                    <button v-if="watermarkFile"
                                                                        class="btn btn-danger"
                                                                        @click="clearWatermark">
                                                                        Clear Image
                                                                    </button>
                                                                </div>
                                                                <div
                                                                    class="relative aspect-video w-full max-w-[18rem] rounded-md border border-default bg-default/60 overflow-hidden">
                                                                    <div
                                                                        class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60">
                                                                    </div>
                                                                    <img :src="watermarkFile.dataUrl"
                                                                        alt="Watermark preview"
                                                                        class="absolute bottom-3 right-3 max-h-[35%] max-w-[35%] opacity-70 drop-shadow-md" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </DisclosurePanel>
                                            </Disclosure>
                                        </div>
                                    </template>
                                </CommonLinkControls>
                            </div>

                            <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :link="linkContext"
                                roleHint="view" :preselected="accessUsers.map(c => ({
                                    id: c.id,
                                    username: c.username || '',
                                    name: c.name,
                                    user_email: c.user_email,
                                    display_color: c.display_color,
                                    role_id: c.role_id ?? undefined,
                                    role_name: c.role_name ?? undefined,
                                }))" @apply="onApplyUsers" />
                            <ConfirmDeleteModal
                                v-model="outputsExistModalOpen"
                                title="Outputs Already Exist"
                                message="Outputs already exist for one or more files. Overwrite them?"
                                confirmText="Overwrite"
                                cancelText="Generate Link"
                                :danger="false"
                                :closeIsCancel="false"
                                @confirm="onOutputsExistConfirm"
                                @cancel="onOutputsExistCancel"
                                @close="onOutputsExistClose"
                            />
                        </div>
                    </template>

                    <div v-if="projectSelected" class="flex flex-col min-w-0">
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
                        <div v-if="hasActiveTranscodeForSelection" class="text-xs text-amber-700 dark:text-amber-300 mt-2">
                            A transcode is already running for this selection. Please wait until it finishes, or select a different video to start another.
                        </div>
                        <div v-if="hasActiveUploadForSelection" class="text-xs text-amber-700 dark:text-amber-300 mt-2">
                            One or more selected files are still uploading. Wait for upload completion before creating a link (transcodes run after upload completes).
                        </div>
                        <div v-if="selectionProgressRows.length" class="mt-3 rounded-md border border-default bg-accent p-3">
                            <div class="text-sm font-semibold mb-2">Transcode progress</div>
                            <div v-for="row in selectionProgressRows" :key="row.taskId" class="border-t border-default first:border-t-0 pt-2 first:pt-0 mt-2 first:mt-0">
                                <div class="text-xs font-semibold truncate" :title="row.fileLabel">
                                    {{ row.fileLabel }}
                                </div>
                                <div class="text-[11px] opacity-70 mt-0.5">{{ row.kindLabel }}</div>

                                <div v-if="row.showHls" class="mt-2">
                                    <div class="flex items-center justify-between text-xs opacity-80">
                                        <span>HLS</span>
                                        <span>{{ row.hlsProgress }}%</span>
                                    </div>
                                    <progress class="mt-1 w-full h-2 rounded-lg overflow-hidden bg-default" :value="row.hlsProgress" max="100" />
                                </div>

                                <div v-if="row.showProxy && row.proxyQualities.length" class="mt-2">
                                    <div class="flex items-center justify-between text-xs opacity-80">
                                        <span>Proxy (cumulative)</span>
                                        <span>{{ row.proxyCumulativeProgress }}%</span>
                                    </div>
                                    <progress class="mt-1 w-full h-2 rounded-lg overflow-hidden bg-default" :value="row.proxyCumulativeProgress" max="100" />

                                    <div class="mt-2 space-y-1">
                                        <div v-for="q in row.proxyQualities" :key="`${row.taskId}:${q.quality}`">
                                            <div class="flex items-center justify-between text-[11px] opacity-80">
                                                <span>{{ q.label }}</span>
                                                <span>{{ q.progress }}%</span>
                                            </div>
                                            <progress class="mt-1 w-full h-1.5 rounded-lg overflow-hidden bg-default" :value="q.progress" max="100" />
                                        </div>
                                    </div>
                                </div>
                            </div>
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
import { computed, onMounted, ref, watch, inject } from 'vue'
import { useApi } from '../composables/useApi'
import FileExplorer from '../components/FileExplorer.vue'
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui'
import { useProjectChoices } from '../composables/useProjectChoices'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import type { Commenter } from '../typings/electron'
import { useHeader } from '../composables/useHeader'
import { Disclosure, DisclosureButton, DisclosurePanel, Switch } from '@headlessui/vue'
import { ChevronDownIcon, EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";
import { useResilientNav } from '../composables/useResilientNav';
import { useTransferProgress } from '../composables/useTransferProgress'
import { connectionMetaInjectionKey } from '../keys/injection-keys';

const { to } = useResilientNav()
useHeader('Select Files to Share');
const transfer = useTransferProgress()
const connectionMeta = inject(connectionMetaInjectionKey)!
const ssh = connectionMeta.value.ssh

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
type AccessMode = 'open' | 'open_password' | 'restricted'
const accessMode = ref<AccessMode>('open')
const allowOpenComments = ref(true)
const defaultAccessMode = ref<AccessMode>('open')
const defaultAllowOpenComments = ref(true)
const defaultUseProxyFiles = ref(false)
const accessCount = computed(() => accessUsers.value.length)
const protectWithPassword = computed({
    get: () => accessMode.value === 'open_password',
    set: (v: boolean) => {
        if (v) accessMode.value = 'open_password'
        else if (accessMode.value === 'open_password') accessMode.value = 'open'
    }
})
const accessSatisfied = computed(() => accessMode.value !== 'restricted' || accessCount.value > 0)
const linkTitle = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

function resetAll() {
    files.value = []
    showSelected.value = false
    expiresValue.value = 7
    expiresUnit.value = 'days'
    usePublicBase.value = defaultUsePublicBase.value
    linkTitle.value = ''
    accessUsers.value = []
    accessMode.value = defaultAccessMode.value
    allowOpenComments.value = defaultAllowOpenComments.value
    password.value = ''
    showPassword.value = false
    viewUrl.value = ''
    downloadUrl.value = ''
    error.value = null
    autoRegenerate.value = false
    transcodeProxy.value = false
    proxyQualities.value = []
    watermarkEnabled.value = false
    watermarkFile.value = null
    overwriteExisting.value = false
    resetPreflightState()
    if (regenTimer) {
        clearTimeout(regenTimer)
        regenTimer = null
    }
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
    resetPreflightState()
    // Refresh choice list (honors current checkbox)
    loadProjectChoices()
}

const autoRegenerate = ref(false)
let regenTimer: ReturnType<typeof setTimeout> | null = null

const files = ref<string[]>([])
const showSelected = ref(false)
function clearAll() {
    files.value = []
    resetPreflightState()
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
        const defaultRestrict = typeof s?.defaultRestrictAccess === 'boolean' ? s.defaultRestrictAccess : false;
        defaultAccessMode.value = defaultRestrict ? 'restricted' : 'open';
        defaultAllowOpenComments.value =
            typeof s?.defaultAllowComments === 'boolean' ? s.defaultAllowComments : true;
        defaultUseProxyFiles.value =
            typeof s?.defaultUseProxyFiles === 'boolean' ? s.defaultUseProxyFiles : false;

        accessMode.value = defaultAccessMode.value;
        allowOpenComments.value = defaultAllowOpenComments.value;
        transcodeProxy.value = defaultUseProxyFiles.value;
    } catch {
        // Keep current default if settings can't be loaded
        defaultUsePublicBase.value = true;
        usePublicBase.value = true;
        defaultAccessMode.value = 'open';
        defaultAllowOpenComments.value = true;
        defaultUseProxyFiles.value = false;
        accessMode.value = defaultAccessMode.value;
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

function onExplorerRemove(paths: string[]) {
    const removeSet = new Set(
        paths.map((p) => {
            if (!showEntireTree.value && projectBase.value) return toAbsUnder(projectBase.value, p);
            return p.startsWith('/') ? p : '/' + p.replace(/^\/+/, '');
        })
    );
    files.value = files.value.filter((f) => !removeSet.has(f));
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
    schedulePreflight()
}, { deep: true })

function isVideoPath(path: string) {
    const ext = String(path || '').toLowerCase().split('.').pop() || ''
    return videoExts.has(ext)
}

function normServerPath(p: string) {
    return String(p || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

const canTranscodeSelected = computed(() =>
    files.value.length > 0 &&
    files.value.some(isVideoPath)
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
        resetPreflightState()
        invalidateLink();
    } else {
        // Return to ZFS pool selection
        projectSelected.value = false;
        projectBase.value = '';
        resetPreflightState()
        invalidateLink();
        loadProjectChoices();
    }
});

watch(accessMode, (mode) => {
    if (mode !== 'open_password') {
        password.value = ''
        showPassword.value = false
    }
})

function extractJobInfoByVersion(
    data: any
): Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> {
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
    kind: string,
    unknownPolicy: 'queued' | 'skipped' = 'queued'
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
            if (unknownPolicy === 'queued') queued.push(vId)
            else skipped.push(vId)
        }
    }

     return { queued, active, skipped }
}


const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
// const maxDownloads = ref(5)

// password state
const password = ref('')
const showPassword = ref(false)

const viewUrl = ref('')
const downloadUrl = ref('')

const transcodeProxy = ref(false)
const proxyQualities = ref<string[]>([])
const watermarkEnabled = ref(false)
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const watermarkFile = ref<LocalFile | null>(null)
const overwriteExisting = ref(false)
const preflightLoading = ref(false)
const preflightProxyBlocked = ref(false)
const preflightWatermarkBlocked = ref(false)
const preflightProxyExistingCount = ref(0)
const preflightWatermarkExistingCount = ref(0)
const preflightTranscodeInProgressCount = ref(0)
const preflightVideoCount = ref(0)
const lastPreflightNoticeKey = ref('')
let preflightTimer: ReturnType<typeof setTimeout> | null = null
let preflightReqSeq = 0

// HLS is generated server-side; no client flag needed

const videoExts = new Set([
    'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
    'mpg', 'mpeg', 'm2v', '3gp', '3g2',
])
const hasVideoSelected = computed(() =>
    files.value.some(f => {
        const ext = String(f || '').toLowerCase().split('.').pop() || ''
        return videoExts.has(ext)
    })
)

const proxyBlockReason = computed(() => {
    if (!preflightProxyBlocked.value) return ''
    if (preflightTranscodeInProgressCount.value > 0) {
        return `A transcode is already in progress for ${preflightTranscodeInProgressCount.value} selected video(s).`
    }
    return 'Proxy generation is not available for this selection.'
})

const watermarkBlockReason = computed(() => {
    if (!preflightWatermarkBlocked.value) return ''
    if (preflightTranscodeInProgressCount.value > 0) {
        return `A transcode is already in progress for ${preflightTranscodeInProgressCount.value} selected video(s).`
    }
    return 'Watermark generation is not available for this selection.'
})

const allSelectedVideosHaveProxy = computed(() =>
    preflightVideoCount.value > 0 && preflightProxyExistingCount.value >= preflightVideoCount.value
)

const allSelectedVideosHaveWatermark = computed(() =>
    preflightVideoCount.value > 0 && preflightWatermarkExistingCount.value >= preflightVideoCount.value
)

const usingExistingProxy = computed(() =>
    !!transcodeProxy.value && allSelectedVideosHaveProxy.value
)

const usingExistingWatermark = computed(() =>
    !!watermarkEnabled.value && allSelectedVideosHaveWatermark.value
)

const transcodeSwitchDisabled = computed(() =>
    !canTranscodeSelected.value || preflightLoading.value || preflightProxyBlocked.value
)

const transcodeSwitchTitle = computed(() => {
    if (!canTranscodeSelected.value) return 'Only for Videos'
    if (preflightLoading.value) return 'Checking transcode status...'
    if (preflightProxyBlocked.value) return proxyBlockReason.value
    return ''
})

const watermarkSwitchDisabled = computed(() =>
    preflightLoading.value || preflightWatermarkBlocked.value
)

const watermarkSwitchTitle = computed(() => {
    if (preflightLoading.value) return 'Checking transcode status...'
    if (preflightWatermarkBlocked.value) return watermarkBlockReason.value
    return watermarkEnabled.value ? 'Watermark is enabled' : 'Watermark is disabled'
})

function resetPreflightState() {
    preflightLoading.value = false
    preflightProxyBlocked.value = false
    preflightWatermarkBlocked.value = false
    preflightVideoCount.value = 0
    preflightProxyExistingCount.value = 0
    preflightWatermarkExistingCount.value = 0
    preflightTranscodeInProgressCount.value = 0
}

function schedulePreflight() {
    if (preflightTimer) clearTimeout(preflightTimer)
    preflightTimer = setTimeout(() => {
        void runPreflight()
    }, 250)
}

async function runPreflight() {
    const selected = files.value.slice()
    const videoSelected = selected.filter(isVideoPath)
    if (!videoSelected.length) {
        resetPreflightState()
        return
    }

    const seq = ++preflightReqSeq
    preflightLoading.value = true
    try {
        const body: any = videoSelected.length === 1
            ? { filePath: videoSelected[0] }
            : { filePaths: videoSelected }

        const data = await apiFetch('/api/magic-link/preflight', {
            method: 'POST',
            body: JSON.stringify(body),
        })

        if (seq !== preflightReqSeq) return

        const summary = data?.summary || {}
        preflightVideoCount.value = Number(summary.videoCount || 0)
        preflightProxyBlocked.value = Number(summary.transcodeInProgressCount || 0) > 0
        preflightWatermarkBlocked.value = Number(summary.transcodeInProgressCount || 0) > 0
        preflightProxyExistingCount.value = Number(summary.proxyExistingCount || 0)
        preflightWatermarkExistingCount.value = Number(summary.watermarkExistingCount || 0)
        preflightTranscodeInProgressCount.value = Number(summary.transcodeInProgressCount || 0)

        const noticeKey = [
            videoSelected.slice().sort().join('|'),
            preflightProxyBlocked.value ? '1' : '0',
            preflightWatermarkBlocked.value ? '1' : '0',
            preflightProxyExistingCount.value,
            preflightWatermarkExistingCount.value,
            preflightTranscodeInProgressCount.value,
        ].join('::')

        if ((preflightProxyBlocked.value || preflightWatermarkBlocked.value) && noticeKey !== lastPreflightNoticeKey.value) {
            const msgParts: string[] = []
            if (preflightTranscodeInProgressCount.value > 0) {
                msgParts.push(`Transcode already in progress for ${preflightTranscodeInProgressCount.value} selected video(s).`)
            }
            const message = msgParts.length
                ? msgParts.join(' ')
                : 'Some transcode options are unavailable for the selected files.'
            pushNotification(new Notification('Transcode Options Unavailable', message, 'info', 7000))
            lastPreflightNoticeKey.value = noticeKey
        } else if (!preflightProxyBlocked.value && !preflightWatermarkBlocked.value) {
            lastPreflightNoticeKey.value = ''
        }
    } catch {
        if (seq !== preflightReqSeq) return
        resetPreflightState()
    } finally {
        if (seq === preflightReqSeq) preflightLoading.value = false
    }
}

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

watch(files, () => {
    if (!hasVideoSelected.value) {
        transcodeProxy.value = false
        watermarkEnabled.value = false
        watermarkFile.value = null
    }
}, { deep: true })

watch(preflightProxyBlocked, (blocked) => {
    if (blocked) transcodeProxy.value = false
})

watch(preflightWatermarkBlocked, (blocked) => {
    if (blocked) watermarkEnabled.value = false
})

function pickWatermark() {
    window.electron.pickWatermark().then(f => {
        if (f) watermarkFile.value = f
    })
}
function clearWatermark() { watermarkFile.value = null }

function dirOfServerPath(p: string) {
    const clean = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '')
    if (!clean) return '/'
    const idx = clean.lastIndexOf('/')
    if (idx <= 0) return '/'
    return clean.slice(0, idx)
}

function rootOfServerPath(p: string) {
    const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (!clean) return '/'
    const first = clean.split('/').filter(Boolean)[0] || ''
    return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRoot() {
    const base = String(projectBase.value || '').trim()
    const root = base || rootOfServerPath(files.value[0] || '')
    let abs = String(root || '/').replace(/\\/g, '/').trim()
    if (!abs) abs = '/'
    if (!abs.startsWith('/')) abs = '/' + abs
    abs = abs.replace(/\/+$/, '') || '/'
    const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
    return { abs, rel }
}

function resolveWatermarkUploadDir() {
    const { abs } = resolveWatermarkStorageRoot()
    const cleanRoot = abs === '/' ? '' : abs
    return `${cleanRoot || ''}/flow45studio-watermarks` || '/flow45studio-watermarks'
}

function resolveWatermarkRelPath() {
    const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!name) return ''
    const { rel } = resolveWatermarkStorageRoot()
    return `${rel ? rel + '/' : ''}flow45studio-watermarks/${name}`
}

function resolveWatermarkProjectRelPath() {
    const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!name) return ''
    return `flow45studio-watermarks/${name}`
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

async function resolveExistingServerWatermarkRelPath() {
    const rooted = resolveWatermarkRelPath()
    const projectRel = resolveWatermarkProjectRelPath()
    const candidates = Array.from(new Set([rooted, projectRel].filter(Boolean)))
    for (const relPath of candidates) {
        if (await serverFileExists(relPath)) return relPath
    }
    return ''
}

function buildWatermarkFileCandidates() {
    const rooted = resolveWatermarkRelPath()
    const projectRel = resolveWatermarkProjectRelPath()
    const baseName = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    return Array.from(new Set([
        rooted,
        projectRel,
        baseName ? `flow45studio-watermarks/${baseName}` : '',
        baseName,
    ].filter(Boolean)))
}

function parseApiErrorPayload(e: any) {
    if (typeof e?.payload === 'object' && e.payload) return e.payload
    if (typeof e?.response === 'object' && e.response) return e.response
    if (typeof e?.data === 'object' && e.data) return e.data
    if (typeof e?.message === 'string' && e.message.trim()) {
        try {
            return JSON.parse(e.message)
        } catch {
            return null
        }
    }
    return null
}

function isWatermarkMissingError(e: any) {
    const payload = parseApiErrorPayload(e)
    const code = String(payload?.error || '')
    if (/watermark.*not[_\s-]*found/i.test(code)) return true
    const msg = String(e?.message || e?.error || '')
    return /watermark.*not[_\s-]*found/i.test(msg)
}

async function uploadWatermarkToProject() {
    if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
    const host = ssh?.server
    const user = ssh?.username
    if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

    const existingRelPath = await resolveExistingServerWatermarkRelPath()
    if (existingRelPath) {
        return { ok: true, relPath: existingRelPath, reused: true }
    }

    const destDir = resolveWatermarkUploadDir()
    const { done } = await window.electron.rsyncStart({
        host,
        user,
        src: watermarkFile.value.path,
        destDir,
        port: 22,
        keyPath: undefined,
        noIngest: true,
    })
    const res = await done
    if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
    return { ok: true, relPath: resolveWatermarkRelPath(), reused: false }
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
    accessSatisfied.value &&
    (!transcodeProxy.value || proxyQualities.value.length > 0) &&
    (!watermarkEnabled.value || !!watermarkFile.value || usingExistingWatermark.value) &&
    !hasActiveTranscodeForSelection.value &&
    !hasActiveUploadForSelection.value
);

function hasRequestedExistingOutputs() {
    if (!hasVideoSelected.value) return false
    if (transcodeProxy.value && preflightProxyExistingCount.value > 0) return true
    if (watermarkEnabled.value && preflightWatermarkExistingCount.value > 0) return true
    return false
}

function sameSelection(a: string[], b: string[]) {
    if (a.length !== b.length) return false
    const aset = new Set(a)
    for (const v of b) if (!aset.has(v)) return false
    return true
}

const hasActiveTranscodeForSelection = computed(() => {
    const selected = files.value.slice()
    if (!selected.length) return false

    return transfer.state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!['queued', 'running', 'unknown'].includes(t.status)) return false
        if (t.context?.source !== 'link') return false

        if (t.context?.file && selected.length === 1) {
            return t.context.file === selected[0]
        }
        if (Array.isArray(t.context?.files)) {
            return sameSelection(t.context.files, selected)
        }
        return false
    })
})

const hasActiveUploadForSelection = computed(() => {
    const selected = new Set(files.value.map(normServerPath))
    if (!selected.size) return false

    return transfer.state.tasks.some(t => {
        if (t.kind !== 'upload') return false
        if (!['queued', 'uploading'].includes(t.status)) return false
        if (t.context?.source !== 'upload') return false
        const uploadFile = normServerPath(String(t.context?.file || ''))
        if (!uploadFile) return false
        return selected.has(uploadFile)
    })
})

function fileLabelFromPath(p?: string) {
    const s = String(p || '')
    if (!s) return 'File'
    const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
    return idx >= 0 ? s.slice(idx + 1) : s
}

function qualityLabel(q: string) {
    if (q === 'original') return 'Original'
    return q
}

function normalizeQualities(list: unknown): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    const order = ['720p', '1080p', 'original']

    for (const raw of Array.isArray(list) ? list : []) {
        const q = String(raw || '').trim().toLowerCase()
        if (!q || seen.has(q)) continue
        seen.add(q)
        out.push(q)
    }

    out.sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        const sa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia
        const sb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
    })

    return out
}

function isProxyJob(j: any) {
    const k = String(j?.kind || '').toLowerCase()
    return k === 'proxy_mp4' || k.startsWith('proxy_mp4:')
}

function isHlsJob(j: any) {
    return String(j?.kind || '').toLowerCase() === 'hls'
}

function jobProgressPercent(j: any) {
    const st = String(j?.status || '').toLowerCase()
    if (st === 'done') return 100
    const p = Number(j?.progress)
    if (!Number.isFinite(p)) return 0
    const pct = (p > 0 && p <= 1) ? (p * 100) : p
    return Math.max(0, Math.min(100, pct))
}

function proxyQualityFromJob(j: any) {
    const rawQuality = j?.quality
        ?? j?.proxyQuality
        ?? j?.targetQuality
        ?? j?.outputQuality
        ?? j?.meta?.quality
        ?? j?.metadata?.quality
        ?? j?.payload?.quality
        ?? j?.params?.quality
        ?? j?.options?.quality
        ?? j?.job_data?.quality
    const direct = String(rawQuality || '').trim().toLowerCase()
    if (direct) return direct
    const kind = String(j?.kind || '').toLowerCase()
    const m = kind.match(/^proxy_mp4[:_/-]([a-z0-9]+p?|original)$/i)
    return m?.[1] ? String(m[1]).toLowerCase() : ''
}

function expandQualitiesFromCumulative(cumulative: number, qualities: string[]) {
    const count = qualities.length || 1
    const chunk = 100 / count
    return qualities.map((q, idx) => {
        const start = idx * chunk
        const end = start + chunk
        let progress = 0
        if (cumulative >= end) progress = 100
        else if (cumulative > start) progress = ((cumulative - start) / chunk) * 100
        return {
            quality: q,
            label: qualityLabel(q),
            progress: Math.round(Math.max(0, Math.min(100, progress))),
        }
    })
}

function taskProgressRows(task: any) {
    const items = Array.isArray(task?.items) ? task.items : []
    const jobs = items.flatMap((it: any) => (Array.isArray(it?.jobs) ? it.jobs : []))
    const jk = String(task?.jobKind || 'any').toLowerCase()
    const showHls = jk === 'any' || jk === 'hls'
    const showProxy = jk === 'any' || jk === 'proxy_mp4'

    const hlsJobs = jobs.filter(isHlsJob)
    const hlsProgress = hlsJobs.length
        ? Math.round(hlsJobs.reduce((sum: number, j: any) => sum + jobProgressPercent(j), 0) / hlsJobs.length)
        : 0

    const proxyJobs = jobs.filter(isProxyJob)
    const requestedQualities = normalizeQualities(task?.context?.proxyQualities)
    const discoveredQualities = normalizeQualities(proxyJobs.map(proxyQualityFromJob).filter(Boolean))
    const qualities = requestedQualities.length ? requestedQualities : discoveredQualities

    let proxyCumulativeProgress = 0
    if (qualities.length) {
        const byQuality = new Map<string, number>()
        let matchedQualityJobs = 0
        for (const q of qualities) byQuality.set(q, 0)
        for (const j of proxyJobs) {
            const q = proxyQualityFromJob(j)
            if (!q || !byQuality.has(q)) continue
            const p = jobProgressPercent(j)
            if (p > (byQuality.get(q) || 0)) byQuality.set(q, p)
            matchedQualityJobs++
        }

        if (matchedQualityJobs === 0) {
            proxyCumulativeProgress = Math.round(
                Math.max(
                    0,
                    Math.min(100, proxyJobs.reduce((sum: number, j: any) => sum + jobProgressPercent(j), 0) / proxyJobs.length)
                )
            )
        } else {
            let sum = 0
            for (const q of qualities) sum += byQuality.get(q) || 0
            proxyCumulativeProgress = Math.round(Math.max(0, Math.min(100, sum / qualities.length)))
        }
    } else if (proxyJobs.length) {
        proxyCumulativeProgress = Math.round(
            Math.max(
                0,
                Math.min(100, proxyJobs.reduce((sum: number, j: any) => sum + jobProgressPercent(j), 0) / proxyJobs.length)
            )
        )
    }

    const proxyQualities = requestedQualities.length
        ? expandQualitiesFromCumulative(proxyCumulativeProgress, requestedQualities)
        : []

    return {
        taskId: String(task.taskId),
        fileLabel: fileLabelFromPath(task?.context?.file),
        kindLabel: jk === 'hls' ? 'HLS' : (jk === 'proxy_mp4' ? 'Proxy' : 'Transcode'),
        showHls,
        showProxy,
        hlsProgress,
        proxyCumulativeProgress,
        proxyQualities,
    }
}

const selectionProgressRows = computed(() => {
    const selected = new Set(files.value.map(normServerPath))
    if (!selected.size) return []

    return transfer.state.tasks
        .filter((t: any) => {
            if (t.kind !== 'transcode') return false
            if (!['queued', 'running', 'unknown'].includes(t.status)) return false
            if (t.context?.source !== 'link') return false
            const file = normServerPath(String(t.context?.file || ''))
            return !!file && selected.has(file)
        })
        .map(taskProgressRows)
})

watch(hasActiveUploadForSelection, (active, wasActive) => {
    if (active && !wasActive) {
        pushNotification(
            new Notification(
                'Upload In Progress',
                'Selected file is still uploading. Wait for upload and transcode completion before sharing.',
                'info',
                6000
            )
        )
    }
})

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
    } else if (t && typeof t === "object") {
        for (const k of Object.keys(t)) push((t as any)[k]?.fileId);
    }

    // single-file response shape
    push(data?.file?.id);

    // collection response shape
    if (Array.isArray(data?.files)) {
        for (const f of data.files) push(f?.id);
    }

    return Array.from(new Set(ids));
}

function extractLinkTokenFromResponse(data: any): string {
    const direct = String(data?.token || data?.link?.token || '').trim()
    if (direct) return direct
    const u = String(data?.viewUrl || '').trim()
    if (!u) return ''
    try {
        const parsed = new URL(u)
        const parts = parsed.pathname.split('/').filter(Boolean)
        const idx = parts.findIndex(p => p.toLowerCase() === 'token')
        if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim()
        return String(parts[parts.length - 1] || '').trim()
    } catch {
        return ''
    }
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

    if (watermarkEnabled.value) {
        if (!watermarkFile.value && !usingExistingWatermark.value) {
            pushNotification(
                new Notification(
                    'Watermark Image Required',
                    'Please choose a watermark image before creating a link (or use files that already have watermark outputs).',
                    'warning',
                    8000
                )
            )
            return
        }
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

    let keepExistingOutputs = false
    let forceOverwrite = false

    if (hasRequestedExistingOutputs()) {
        const action = await confirmOutputsExistOverwrite()
        if (action === 'close') {
            loading.value = false
            return
        }
        if (action === 'overwrite') {
            if (watermarkEnabled.value && preflightWatermarkExistingCount.value > 0 && !watermarkFile.value?.name) {
                pushNotification(
                    new Notification(
                        'Watermark Image Required',
                        'Choose a new watermark image to overwrite existing watermark outputs.',
                        'warning',
                        8000
                    )
                )
                loading.value = false
                return
            }
            forceOverwrite = true
            overwriteExisting.value = true
        } else {
            keepExistingOutputs = true
            overwriteExisting.value = false
        }
    }

    const body: any = {
        expiresInSeconds: expiresSec.value,
        projectBase: projectBase.value || undefined,
        baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
        title: linkTitle.value || undefined,
    }

    if (files.value.length === 1) body.filePath = files.value[0]
    else body.filePaths = files.value.slice()

    if (accessMode.value === 'open_password' && password.value) {
        body.password = password.value
    }

    body.access_mode = accessMode.value === 'restricted' ? 'restricted' : 'open'
    body.auth_mode = accessMode.value === 'open' ? 'none' : 'password'
    if (accessMode.value !== 'restricted') {
        body.allow_comments = !!allowOpenComments.value
    }

    if (accessMode.value === 'restricted' && accessUsers.value.length) {
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

    body.generateReviewProxy = !!transcodeProxy.value
    if (transcodeProxy.value) {
        body.proxyQualities = proxyQualities.value.slice()
    }
    if (forceOverwrite || overwriteExisting.value) {
        body.overwrite = true
    }
    if (keepExistingOutputs) {
        body.keepExistingOutputs = true
    }
    const useExistingWatermarkOnly =
        watermarkEnabled.value && !watermarkFile.value?.name && usingExistingWatermark.value

    const keepExistingWatermark = keepExistingOutputs && watermarkEnabled.value && preflightWatermarkExistingCount.value > 0

    if (watermarkEnabled.value && watermarkFile.value?.name && !keepExistingWatermark) {
        body.watermark = true
        body.watermarkFile = resolveWatermarkRelPath() || watermarkFile.value.name
        body.watermarkProxyQualities = proxyQualities.value.slice()
    } else if (useExistingWatermarkOnly || keepExistingWatermark) {
        body.watermark = true
        body.keepExistingOutputs = true
        body.allowExistingOutputs = true
        body.watermarkProxyQualities = proxyQualities.value.slice()
    }

    try {
        if (watermarkEnabled.value && watermarkFile.value && !keepExistingWatermark) {
            const up = await uploadWatermarkToProject()
            if (!up.ok) {
                pushNotification(
                    new Notification(
                        'Watermark Upload Failed',
                        up.error || 'Unable to upload the watermark image.',
                        'error',
                        8000
                    )
                )
                return
            }
            if ((up as any).relPath) body.watermarkFile = (up as any).relPath
        }

        console.log('[magic-link] request body', JSON.stringify(body))
        let data: any
        const watermarkFileCandidates = buildWatermarkFileCandidates()
        const tryRequest = async () => {
            return apiFetch('/api/magic-link', {
                method: 'POST',
                body: JSON.stringify(body),
            })
        }
        try {
            data = await tryRequest()
        } catch (e: any) {
            if (e?.status === 409) {
                let payload: any = null
                try { payload = JSON.parse(e?.message) } catch { }

                if (payload?.error === 'outputs_exist' || payload?.error === 'hls_exists') {
                    const action = await confirmOutputsExistOverwrite()
                    if (action === 'overwrite') {
                        overwriteExisting.value = true
                        body.overwrite = true
                        console.log('[magic-link] retry with overwrite', JSON.stringify(body))
                        data = await tryRequest()
                    } else if (action === 'generate') {
                        body.keepExistingOutputs = true
                        body.overwrite = false
                        console.log('[magic-link] retry keeping existing outputs', JSON.stringify(body))
                        data = await tryRequest()
                        pushNotification(
                            new Notification(
                                'Overwrite Canceled',
                                'Existing outputs were kept and the link was created.',
                                'info',
                                6000
                            )
                        )
                    } else {
                        // Closed the dialog; cancel flow.
                        return
                    }
                } else {
                    throw e
                }
            } else if (body.watermark && isWatermarkMissingError(e)) {
                const current = String(body.watermarkFile || '').trim()
                const fallback = watermarkFileCandidates.find((c) => c && c !== current) || ''
                if (!fallback) throw e
                body.watermarkFile = fallback
                data = await tryRequest()
            } else {
                throw e
            }
        }

        viewUrl.value = data.viewUrl
        downloadUrl.value = data.downloadUrl

        // Only apply overwrite for the retry; reset for subsequent requests
        overwriteExisting.value = false

        const wantsHls = hasVideoSelected.value
        if (transcodeProxy.value || wantsHls) {
            const versionIds = extractAssetVersionIdsFromMagicLinkResponse(data);
            const jobInfo = extractJobInfoByVersion(data)
            const unknownPolicy = body.keepExistingOutputs ? 'skipped' : 'queued'
            const hlsSplit = wantsHls
                ? filterVersionIdsByJobKind(versionIds, jobInfo, 'hls', unknownPolicy)
                : { queued: [] as number[], active: [] as number[], skipped: [] as number[] }
            const proxySplit = transcodeProxy.value
                ? filterVersionIdsByJobKind(versionIds, jobInfo, 'proxy_mp4', unknownPolicy)
                : { queued: [] as number[], active: [] as number[], skipped: [] as number[] }
            const hlsTrackSet = new Set<number>([...hlsSplit.queued, ...hlsSplit.active])
            const proxyTrackSet = new Set<number>([...proxySplit.queued, ...proxySplit.active])

            if (versionIds.length) {
                const groupId = `link:${data.viewUrl}`;
                const fileRecords = Array.isArray(data?.files) ? data.files : [];
                const started = new Set<number>();
                const token = extractLinkTokenFromResponse(data)

                const getFileLabel = (rec: any) =>
                    rec?.name || rec?.relPath || rec?.path || rec?.p || 'File';

                if (fileRecords.length) {
                    for (const rec of fileRecords) {
                        const recPath = String(rec?.path || rec?.relPath || rec?.p || rec?.name || '')
                        if (!isVideoPath(recPath)) continue
                        const assetVersionId = Number(
                            rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id
                        );
                        if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue;
                        if (!versionIds.includes(assetVersionId)) continue;
                        const shouldTrackHls = wantsHls && hlsTrackSet.has(assetVersionId)
                        const shouldTrackProxy = transcodeProxy.value && proxyTrackSet.has(assetVersionId)
                        if (!shouldTrackHls && !shouldTrackProxy) continue

                        started.add(assetVersionId);
                        const context = {
                            source: 'link' as const,
                            groupId,
                            linkUrl: data.viewUrl,
                            linkTitle: linkTitle.value || undefined,
                            file: rec?.path || rec?.relPath || rec?.p || rec?.name,
                            files: files.value.slice(),
                            proxyQualities: transcodeProxy.value ? proxyQualities.value.slice() : [],
                        }
                        const fileId = Number(rec?.id ?? rec?.fileId ?? rec?.file_id ?? rec?.file?.id)
                        const canUsePlayback = !!token && Number.isFinite(fileId) && fileId > 0
                        const playbackPath = canUsePlayback
                            ? `/api/token/${encodeURIComponent(token)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
                            : ''

                        if (shouldTrackHls && canUsePlayback) {
                            transfer.startPlaybackTranscodeTask({
                                title: `Transcoding: ${getFileLabel(rec)}`,
                                detail: 'Tracking HLS',
                                intervalMs: 1500,
                                jobKind: 'hls',
                                context,
                                fetchSnapshot: async () => {
                                    const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
                                    const j = payload?.transcodes?.hls || payload?.transcodes?.HLS || null
                                    return {
                                        status: j?.status ?? payload?.hlsStatus ?? payload?.status,
                                        progress: j?.progress ?? payload?.hlsProgress ?? 0,
                                    }
                                }
                            })
                        } else if (shouldTrackHls) {
                            transfer.startAssetVersionTranscodeTask({
                                apiFetch,
                                assetVersionIds: [assetVersionId],
                                title: `Transcoding: ${getFileLabel(rec)}`,
                                detail: 'Tracking HLS',
                                intervalMs: 1500,
                                jobKind: 'hls',
                                context,
                            });
                        }

                        if (shouldTrackProxy) {
                            if (canUsePlayback) {
                                transfer.startPlaybackTranscodeTask({
                                    title: `Transcoding: ${getFileLabel(rec)}`,
                                    detail: 'Tracking proxy',
                                    intervalMs: 1500,
                                    jobKind: 'proxy_mp4',
                                    context,
                                    fetchSnapshot: async () => {
                                        const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
                                        const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
                                        return {
                                            status: j?.status ?? payload?.proxyStatus ?? payload?.status,
                                            progress: j?.progress ?? payload?.proxyProgress ?? 0,
                                            qualityOrder: j?.quality_order ?? j?.qualityOrder ?? payload?.quality_order ?? payload?.qualityOrder,
                                            activeQuality: j?.active_quality ?? j?.activeQuality ?? payload?.active_quality ?? payload?.activeQuality,
                                            perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress ?? payload?.per_quality_progress ?? payload?.perQualityProgress,
                                        }
                                    }
                                })
                            } else {
                                transfer.startAssetVersionTranscodeTask({
                                    apiFetch,
                                    assetVersionIds: [assetVersionId],
                                    title: `Transcoding: ${getFileLabel(rec)}`,
                                    detail: 'Tracking proxy',
                                    intervalMs: 1500,
                                    jobKind: 'proxy_mp4',
                                    context,
                                });
                            }
                        }
                    }
                }

                // Fallback: if version IDs exist but no per-file task could be started,
                // create an aggregate tracker so the Transfers panel still reflects server work.
                if (!started.size && (hlsTrackSet.size || proxyTrackSet.size)) {
                    const trackableVersionIds = Array.from(new Set([
                        ...hlsTrackSet,
                        ...proxyTrackSet,
                    ]))
                    transfer.startAssetVersionTranscodeTask({
                        apiFetch,
                        assetVersionIds: trackableVersionIds,
                        title: "Generating transcodes",
                        detail: `Tracking ${trackableVersionIds.length} version(s)`,
                        intervalMs: 1500,
                        jobKind: 'any',
                        context: {
                            source: 'link',
                            groupId: `link:${data.viewUrl}`,
                            linkUrl: data.viewUrl,
                            linkTitle: linkTitle.value || undefined,
                            files: files.value.slice(),
                            proxyQualities: transcodeProxy.value ? proxyQualities.value.slice() : [],
                        },
                    });
                }
            } else {
                // fallback (only if server didn't return transcodes for some reason)
                const fileIds = extractDbFileIdsFromMagicLinkResponse(data);

                if (fileIds.length && hasVideoSelected.value && !body.keepExistingOutputs) {
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
        window.appLog?.error('share.create.failed', {
            files: files.value.length,
            error: msg
        })
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
        // Keep overwrite as a one-shot retry flag only.
        overwriteExisting.value = false
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

const outputsExistModalOpen = ref(false)
let outputsExistResolver: ((v: 'overwrite' | 'generate' | 'close') => void) | null = null

function confirmOutputsExistOverwrite(): Promise<'overwrite' | 'generate' | 'close'> {
    outputsExistModalOpen.value = true
    return new Promise(resolve => {
        outputsExistResolver = resolve
    })
}

function resolveOutputsExist(next: 'overwrite' | 'generate' | 'close') {
    if (outputsExistResolver) {
        outputsExistResolver(next)
        outputsExistResolver = null
    }
    outputsExistModalOpen.value = false
}

function onOutputsExistConfirm() {
    resolveOutputsExist('overwrite')
}

function onOutputsExistCancel() {
    resolveOutputsExist('generate')
}

function onOutputsExistClose() {
    resolveOutputsExist('close')
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

<style scoped>
.proxy-quality-checkbox {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
    border: 1px solid #ffffff;
    background-color: #ffffff;
    cursor: pointer;
    box-shadow: 0 0 0 0 transparent;
}

.proxy-quality-checkbox:checked {
    background-color: var(--btn-primary-bg);
    border-color: var(--btn-primary-border);
}

.proxy-quality-checkbox:checked::after {
    content: "";
    display: block;
    width: 0.25rem;
    height: 0.5rem;
    border: 2px solid #fff;
    border-top: 0;
    border-left: 0;
    transform: translate(0.20rem, -0.05rem) rotate(45deg);
    box-sizing: content-box;
}

.proxy-quality-checkbox:focus-visible {
    outline: 2px solid #22c55e;
    outline-offset: 2px;
}

.proxy-quality-checkbox:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
