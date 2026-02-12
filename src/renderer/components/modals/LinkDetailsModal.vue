<template>
  <div v-if="modelValue" class="fixed inset-0 z-40">
    <div class="absolute inset-0 bg-black/50" @click="close"></div>

    <div
      class="absolute inset-x-0 top-12 mx-auto w-11/12 max-w-5xl bg-accent border border-default rounded-lg shadow-lg z-50">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-default">
        <h3 class="text-lg font-semibold">
          Link Details — {{ link?.title || (link && fallbackTitle(link)) }}
        </h3>

        <div class="flex items-center gap-2">
          <button v-if="!editMode" class="btn btn-primary" @click="beginEdit" :disabled="!link">Edit</button>

          <button v-else class="btn btn-success" @click="saveAll" :disabled="saveDisabled">
            Save Changes
          </button>
          <button v-if="editMode" class="btn btn-secondary" @click="cancelEdit" :disabled="saving">
            Cancel
          </button>

          <button class="btn btn-danger" @click="close">Close</button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-4 pt-4 pb-4 text-sm text-left space-y-4 overflow-y-auto max-h-[78vh]">
        <!-- Meta -->
        <section class="grid gap-3 lg:grid-cols-3">
          <div class="lg:col-span-2 rounded-lg border border-default bg-default/20 p-3 space-y-2">
            <div class="flex items-center justify-between gap-2 min-w-0">
              <div class="font-semibold text-default truncate">Primary Link</div>
              <button class="text-blue-500 hover:underline text-xs shrink-0" @click="copy(primaryUrl)">Copy</button>
            </div>
            <a :href="primaryUrl" target="_blank" rel="noopener" class="hover:underline break-all block">
              {{ primaryUrl || '—' }}
            </a>

            <div v-if="downloadUrl" class="pt-2 border-t border-default/70">
              <div class="flex items-center justify-between gap-2 min-w-0">
                <div class="font-semibold text-default truncate">Download Link</div>
                <button class="text-blue-500 hover:underline text-xs shrink-0" @click="copy(downloadUrl)">Copy</button>
              </div>
              <a :href="downloadUrl" target="_blank" rel="noopener" class="hover:underline break-all block mt-1">
                {{ downloadUrl }}
              </a>
            </div>

            <div class="pt-2 border-t border-default/70 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span class="opacity-70">Access</span>
                <div class="font-semibold">{{ currentAccessSummary }}</div>
              </div>
              <div>
                <span class="opacity-70">Proxy</span>
                <div class="font-semibold">
                  {{ currentGenerateReviewProxy ? 'Enabled' : 'Disabled' }}
                  <span v-if="currentProxyQualities.length" class="opacity-70">({{ currentProxyQualities.join(', ') }})</span>
                </div>
              </div>
              <div>
                <span class="opacity-70">Watermark</span>
                <div class="font-semibold">
                  {{ currentWatermark ? 'Enabled' : 'Disabled' }}
                  <span v-if="currentWatermarkFile" class="opacity-70">({{ currentWatermarkFile }})</span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-default bg-default/20 p-3 space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-default font-bold">Type:</span>
              <span :class="badgeClass(link?.type!)">{{ link?.type?.toUpperCase() }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-default font-bold">Status:</span>
              <span :class="statusChipClass(statusOf(link!))">{{ link ? statusOf(link).toUpperCase() : '' }}</span>
            </div>
            <div>
              <span class="text-default font-bold">Created:</span>
              <div class="opacity-90">{{ link ? new Date(link.createdAt).toLocaleString() : '—' }}</div>
            </div>
            <div>
              <span class="text-default font-bold">Expires:</span>
              <div class="opacity-90">{{ link?.expiresAt ? new Date(link.expiresAt).toLocaleString() : 'Never' }}</div>
            </div>
          </div>
        </section>

        <section class="space-y-3 rounded-lg border border-default bg-default/10 p-3">
          <div class="text-default font-semibold">Link Configuration</div>
          <div class="grid grid-cols-3">
            <div class="rounded-lg border border-default bg-default/20 p-3 space-y-3">
              <div>
                <label class="block text-default mb-1">Title</label>
                <template v-if="editMode">
                  <input v-model="draftTitle" class="input-textlike bg-default w-full px-3 py-2 rounded" />
                </template>
                <template v-else>
                  <div class="px-3 py-2 rounded border border-default bg-default/30">
                    {{ link?.title || '—' }}
                  </div>
                </template>
              </div>
              <div>
                <label class="block text-default mb-1">Notes</label>
                <template v-if="editMode">
                  <textarea v-model="draftNotes" rows="5" class="input-textlike w-full px-3 py-2 rounded"></textarea>
                </template>
                <template v-else>
                  <div class="px-3 py-2 rounded border border-default bg-default/30 whitespace-pre-wrap min-h-[7.5rem]">
                    {{ link?.notes || '—' }}
                  </div>
                </template>
              </div>
            </div>

            <div class="col-span-2 rounded-lg border border-default bg-default/20 p-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-default font-semibold">Access Settings</div>
                <button
                  v-if="editMode && effectiveAccessMode === 'restricted'"
                  class="btn btn-primary text-xs px-2 py-1"
                  @click="openAccessModal"
                >
                  Manage users…
                </button>
              </div>

              <div class="space-y-3">
                <div class="flex flex-wrap items-center gap-3 min-w-0">
                  <label class="font-semibold sm:whitespace-nowrap">Restrict Access to Users</label>

                  <template v-if="editMode">
                    <Switch id="restrict-link-access-switch" v-model="restrictAccess" :class="[
                      restrictAccess ? 'bg-secondary' : 'bg-well',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                    ]">
                      <span class="sr-only">Toggle user access</span>
                      <span aria-hidden="true" :class="[
                        restrictAccess ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                      ]" />
                    </Switch>
                    <span class="text-sm select-none truncate min-w-0 flex-1">
                      {{ restrictAccess ? 'Restricted (users only)' : accessModeOpenLabel }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-sm opacity-80">
                      {{ accessModeSummary }}
                    </span>
                  </template>
                </div>

                <div v-if="effectiveAccessMode === 'open' && link?.type !== 'upload'"
                  class="flex flex-wrap items-center gap-3 min-w-0">
                  <label class="font-semibold sm:whitespace-nowrap">Allow Comments</label>
                  <template v-if="editMode">
                    <Switch id="allow-comments-switch" v-model="draftAllowComments" :class="[
                      draftAllowComments ? 'bg-secondary' : 'bg-well',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                    ]">
                      <span class="sr-only">Toggle comments</span>
                      <span aria-hidden="true" :class="[
                        draftAllowComments ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                      ]" />
                    </Switch>
                  </template>
                  <template v-else>
                    <span class="text-sm opacity-80">{{ props.link?.allow_comments ? 'Yes' : 'No' }}</span>
                  </template>
                </div>

                <div v-if="effectiveAccessMode === 'open'" class="flex flex-col gap-2 min-w-0">
                  <div class="flex flex-wrap items-center gap-3 min-w-0">
                    <label class="font-semibold sm:whitespace-nowrap">Password Required</label>
                    <template v-if="editMode">
                      <Switch id="link-password-switch" v-model="draftUsePassword" :class="[
                        draftUsePassword ? 'bg-secondary' : 'bg-well',
                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                      ]">
                        <span class="sr-only">Toggle link password</span>
                        <span aria-hidden="true" :class="[
                          draftUsePassword ? 'translate-x-5' : 'translate-x-0',
                          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                        ]" />
                      </Switch>
                    </template>
                    <template v-else>
                      <span class="text-sm opacity-80">{{ openPasswordRequired ? 'Yes' : 'No' }}</span>
                    </template>
                  </div>

                  <div v-if="editMode && draftUsePassword" class="flex flex-col gap-1 min-w-0">
                    <label class="text-default font-semibold sm:whitespace-nowrap">New Password</label>
                    <input
                      type="password"
                      v-model.trim="draftPassword"
                      placeholder="Enter a new password"
                      class="input-textlike border rounded px-3 py-2 w-full min-w-0"
                    />
                    <p v-if="openPasswordRequired" class="text-xs opacity-70">
                      Leave blank to keep the existing password.
                    </p>
                  </div>

                  <p v-if="mustProvidePassword" class="text-xs text-red-500">
                    Password is required when protection is enabled.
                  </p>
                </div>

                <div v-if="effectiveAccessMode === 'open'" class="text-xs opacity-70">
                  Open links allow anyone with the link to access. Use restricted access to require users.
                </div>

                <div v-if="effectiveAccessMode === 'restricted'" class="space-y-2">
                  <div v-if="!accessSatisfied" class="text-sm text-red-500">
                    At least one user is required when access is restricted.
                  </div>

                  <div v-if="accessLoading" class="text-sm opacity-70">Loading…</div>
                  <div v-else-if="!access.length" class="text-sm opacity-70">No users currently have access.</div>

                  <div v-else class="overflow-x-auto rounded-lg border border-default">
                    <table class="min-w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr class="bg-default text-gray-300">
                          <th class="text-left px-3 py-2 border border-default">Name</th>
                          <th class="text-left px-3 py-2 border border-default">Username</th>
                          <th class="text-left px-3 py-2 border border-default">Role</th>
                          <th class="text-left px-3 py-2 border border-default">Granted</th>
                          <th class="text-right px-3 py-2 border border-default">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="u in access" :key="u.user_id" class="border-t border-default">
                          <td class="px-3 py-2 border border-default break-all">
                            <div class="flex items-center gap-2">
                              <span>{{ u.name || '—' }}</span>
                              <span v-if="u.is_disabled"
                                class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-default/70 text-amber-400 border border-amber-500/30"
                                title="This user account is disabled">
                                Deleted
                              </span>
                            </div>
                          </td>
                          <td class="px-3 py-2 border border-default break-all">{{ u.user_name || '—' }}</td>
                          <td class="px-3 py-2 border border-default break-all">
                            {{ u.role_name || u.role?.name || '—' }}
                          </td>
                          <td class="px-3 py-2 border border-default">
                            {{ u.granted_at ? new Date(u.granted_at).toLocaleString() : '—' }}
                          </td>
                          <td class="px-3 py-2 border border-default text-right">
                            <button v-if="editMode" class="btn btn-danger px-2 py-1 text-xs"
                              @click="removeAccess(u.user_id)">
                              Remove
                            </button>
                            <span v-else class="text-xs opacity-60">—</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div class="col-span-3 rounded-lg border border-default bg-default/20 p-3 space-y-3">
              <div class="text-default font-semibold">Media Processing</div>
              <div class="flex flex-wrap items-center gap-3 min-w-0">
                <label class="font-semibold sm:whitespace-nowrap">Generate Proxy Files</label>
                <template v-if="editMode">
                  <Switch id="link-proxy-switch" v-model="draftGenerateReviewProxy" :class="[
                    draftGenerateReviewProxy ? 'bg-secondary' : 'bg-well',
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                  ]">
                    <span class="sr-only">Toggle proxy file generation</span>
                    <span aria-hidden="true" :class="[
                      draftGenerateReviewProxy ? 'translate-x-5' : 'translate-x-0',
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                    ]" />
                  </Switch>
                </template>
                <template v-else>
                  <span class="text-sm opacity-80">{{ currentGenerateReviewProxy ? 'Enabled' : 'Disabled' }}</span>
                </template>
              </div>

              <div v-if="editMode && draftGenerateReviewProxy" class="flex flex-wrap items-center gap-3">
                <span class="text-xs opacity-80">Proxy qualities:</span>
                <label v-for="q in proxyQualityChoices" :key="q" class="inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" class="checkbox" :value="q" v-model="draftProxyQualities" />
                  <span>{{ q }}</span>
                </label>
              </div>
              <div v-else-if="!editMode && currentProxyQualities.length" class="text-xs opacity-70">
                Qualities: {{ currentProxyQualities.join(', ') }}
              </div>

              <div class="flex flex-wrap items-center gap-3 min-w-0">
                <label class="font-semibold sm:whitespace-nowrap">Apply Watermark</label>
                <template v-if="editMode">
                  <Switch id="link-watermark-switch" v-model="draftWatermarkEnabled" :disabled="!draftGenerateReviewProxy"
                    :class="[
                      draftWatermarkEnabled ? 'bg-secondary' : 'bg-well',
                      !draftGenerateReviewProxy ? 'opacity-50 cursor-not-allowed' : '',
                      'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                    ]">
                    <span class="sr-only">Toggle watermark</span>
                    <span aria-hidden="true" :class="[
                      draftWatermarkEnabled ? 'translate-x-5' : 'translate-x-0',
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                    ]" />
                  </Switch>
                </template>
                <template v-else>
                  <span class="text-sm opacity-80">{{ currentWatermark ? 'Enabled' : 'Disabled' }}</span>
                </template>
              </div>

              <div v-if="editMode && draftWatermarkEnabled" class="space-y-2">
                <div class="flex flex-col gap-1 min-w-0">
                  <label class="text-default font-semibold sm:whitespace-nowrap">Watermark File Name</label>
                  <input
                    v-model.trim="draftWatermarkFile"
                    placeholder="e.g. watermark.png"
                    class="input-textlike border rounded px-3 py-2 w-full min-w-0"
                  />
                  <p class="text-xs opacity-70">
                    Use an existing file name already available on the server.
                  </p>
                </div>
              </div>
              <div v-else-if="!editMode && currentWatermarkFile" class="text-xs opacity-70">
                File: <code>{{ currentWatermarkFile }}</code>
              </div>

              <div v-if="editMode && isDownloadish" class="pt-2 border-t border-default space-y-2">
                <div class="flex items-center justify-between">
                  <div class="text-default font-semibold">
                    Files for this link
                  </div>
                  <button class="btn btn-secondary" @click="openFilesEditor">
                    Manage files…
                  </button>
                </div>

                <div class="text-xs opacity-70">
                  {{ draftFilePaths.length }} selected
                  <span v-if="filesDirty" class="ml-2 text-amber-400">Pending changes</span>
                </div>

                <div v-if="draftFilePaths.length"
                  class="rounded border border-default bg-default/30 max-h-40 overflow-auto">
                  <div v-for="(p, i) in draftFilePaths" :key="p + ':' + i"
                    class="px-3 py-2 border-b border-default break-all last:border-b-0">
                    <code>{{ p }}</code>
                  </div>
                </div>
                <div v-else class="text-sm opacity-70">No files selected.</div>
              </div>

              <div v-if="editMode && link?.type === 'upload'" class="pt-2 border-t border-default space-y-2">
                <div class="text-default font-semibold">Upload destination</div>
                <div class="text-xs opacity-70">
                  Choose where uploaded files will be stored for this link.
                </div>
                <div class="flex flex-row gap-2 items-center">
                  <span class="whitespace-nowrap">Destination folder:</span>
                  <PathInput v-model="draftUploadDir" :apiFetch="apiFetch" :dirsOnly="true" />
                </div>
                <div class="text-xs opacity-70">
                  Current: <code>{{ currentUploadDir || '—' }}</code>
                  <span v-if="uploadDirDirty" class="ml-2 text-amber-400">Pending changes</span>
                </div>
              </div>
            </div>
          </div>

          <AddUsersModal
            v-model="accessModalOpen"
            :apiFetch="apiFetch"
            :link="link || undefined"
            :roleHint="link?.type === 'upload' ? 'upload' : 'view'"
            :preselected="access.map(a => ({
              id: a.user_id,
              username: a.user_name || '',
              name: a.name || '',
              user_email: a.user_email || '',
              display_color: a.display_color || '',
              role_id: a.role_id ?? a.role?.id ?? undefined,
              role_name: a.role_name ?? a.role?.name ?? undefined,
            }))"
            @apply="mergeAccessFromModal"
          />
        </section>

        <!-- Files table (still shown in view mode; in edit mode it remains informational) -->
        <section v-if="!editMode"  class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold">
              {{ link?.type === 'upload' ? 'Uploaded Files' : 'Shared Files' }}
            </h4>
            <div class="text-xs opacity-70" v-if="!detailsLoading">{{ displayFiles.length }} item(s)</div>
          </div>

          <div v-if="detailsLoading" class="text-sm opacity-70">Loading…</div>
          <div v-else-if="displayFiles.length === 0" class="text-sm opacity-70">No files.</div>
          <div v-else>
            <div v-if="usingFallbackFiles" class="text-xs text-amber-700 dark:text-amber-300 mb-2">
              Loaded from link summary because detailed file rows are currently unavailable.
            </div>
            <div class="overflow-x-auto max-h-[18rem] overflow-y-auto overscroll-y-contain rounded-lg border border-default">
              <table class="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr class="bg-default text-gray-300">
                    <th class="text-left px-3 py-2 border border-default">Name</th>
                    <!-- <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">Saved As</th> -->
                    <th class="text-right px-3 py-2 border border-default">Size</th>
                    <th class="text-left px-3 py-2 border border-default">MIME</th>
                    <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">Uploader</th>
                    <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">IP</th>
                    <th v-if="link?.type === 'upload'" class="text-left px-3 py-2 border border-default">When</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in displayFiles" :key="f.key" class="border-t border-default">
                    <td class="px-3 py-2 break-all border border-default">{{ f.name }}</td>
                    <!-- <td v-if="link?.type === 'upload'" class="px-3 py-2 break-all border border-default">
                      {{ f.saved_as || '—' }}
                    </td> -->
                    <td class="px-3 py-2 text-right border border-default">{{ fmtBytes(f.size) }}</td>
                    <td class="px-3 py-2 border border-default">{{ f.mime || '—' }}</td>
                    <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">{{ f.uploader_label || '—'
                      }}</td>
                    <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">{{ f.ip || '—' }}</td>
                    <td v-if="link?.type === 'upload'" class="px-3 py-2 border border-default">
                      {{ f.ts ? new Date(f.ts).toLocaleString() : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Activity -->
        <section v-if="!editMode" class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold">Access Activity</h4>
            <div class="text-xs opacity-70" v-if="!detailsLoading">{{ filteredAuditActivity.length }} item(s)</div>
          </div>

          <div class="flex flex-wrap items-center gap-2 mb-2">
            <select v-model="activityTypeFilter" class="px-2 py-1 border border-default rounded bg-default text-default">
              <option value="all">All actions</option>
              <option v-for="t in activityTypes" :key="t" :value="t">{{ activityTypeLabel(t) }}</option>
            </select>
            <input
              v-model.trim="activitySearch"
              type="text"
              class="input-textlike px-2 py-1 rounded min-w-[16rem]"
              placeholder="Filter by actor, IP, action, or details"
            />
          </div>

          <div v-if="detailsLoading" class="text-sm opacity-70">Loading…</div>
          <div v-else-if="filteredAuditActivity.length === 0" class="text-sm opacity-70">No activity found.</div>

          <div v-else class="overflow-x-auto max-h-[18rem] overflow-y-auto overscroll-y-contain rounded-lg border border-default">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-default text-gray-300">
                  <th class="text-left px-3 py-2 border border-default">When</th>
                  <th class="text-left px-3 py-2 border border-default">Action</th>
                  <th class="text-left px-3 py-2 border border-default">Actor</th>
                  <th class="text-left px-3 py-2 border border-default">Source</th>
                  <th class="text-left px-3 py-2 border border-default">Summary</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(a, idx) in filteredAuditActivity" :key="`${a.ts_ms}:${a.type}:${idx}`" class="border-t border-default align-top">
                  <td class="px-3 py-2 border border-default whitespace-nowrap">{{ formatTs(a.ts_ms) }}</td>
                  <td class="px-3 py-2 border border-default break-all">{{ activityTypeLabel(a.type) }}</td>
                  <td class="px-3 py-2 border border-default break-all">{{ actorLabel(a) }}</td>
                  <td class="px-3 py-2 border border-default break-all">{{ sourceLabel(a) }}</td>
                  <td class="px-3 py-2 border border-default break-all">
                    <div>{{ activitySummary(a) }}</div>
                    <details v-if="hasActivityDetails(a)" class="mt-1">
                      <summary class="cursor-pointer opacity-80">Details</summary>
                      <pre class="mt-1 text-xs whitespace-pre-wrap break-all">{{ activityDetailsPretty(a) }}</pre>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Versions manager -->
        <section v-if="!editMode"class="w-full">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold">Versions</h4>
            <div class="flex items-center gap-2">
              <label class="text-xs opacity-70 flex items-center gap-1">
                <input type="checkbox" v-model="restoreBackup" />
                Backup on restore
              </label>
              <select v-model="selectedVersionFileId" class="px-2 py-1 border border-default rounded bg-default text-default">
                <option v-for="f in versionFileChoices" :key="f.id" :value="f.id">
                  {{ f.name }}
                </option>
              </select>
              <button class="btn btn-secondary" @click="refreshVersions" :disabled="versionsLoading || !selectedVersionFileId">
                {{ versionsLoading ? 'Refreshing…' : 'Refresh' }}
              </button>
            </div>
          </div>

          <div v-if="versionFileChoices.length === 0" class="text-sm opacity-70">
            No version-managed files for this link.
          </div>
          <div v-else>
            <div v-if="versionsError" class="p-2 mb-2 rounded bg-red-900/30 border border-red-800 text-default">
              {{ versionsError }}
            </div>

            <div class="overflow-x-auto rounded-lg border border-default">
              <table class="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr class="bg-default text-gray-300">
                    <th class="text-left px-3 py-2 border border-default">Version</th>
                    <th class="text-left px-3 py-2 border border-default">Created</th>
                    <th class="text-left px-3 py-2 border border-default">Snapshot</th>
                    <th class="text-right px-3 py-2 border border-default">Size</th>
                    <th class="text-right px-3 py-2 border border-default">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="versionsLoading">
                    <td colspan="5" class="px-3 py-4 border border-default text-center">Loading…</td>
                  </tr>
                  <tr v-else-if="versions.length === 0">
                    <td colspan="5" class="px-3 py-4 border border-default text-center">No versions found.</td>
                  </tr>
                  <tr v-else v-for="v in versions" :key="v.asset_version_id" class="border-t border-default">
                    <td class="px-3 py-2 border border-default">v{{ v.version_index }}</td>
                    <td class="px-3 py-2 border border-default">{{ v.created_at ? new Date(v.created_at).toLocaleString() : '—' }}</td>
                    <td class="px-3 py-2 border border-default">{{ snapshotName(v.snapshot_rel) }}</td>
                    <td class="px-3 py-2 text-right border border-default">{{ fmtBytes(v.snapshot_size_bytes) }}</td>
                    <td class="px-3 py-2 border border-default text-right">
                      <div class="flex items-center justify-end gap-2">
                        <button class="btn btn-primary px-2 py-1 text-xs" @click="restoreVersion(v)">
                          Restore
                        </button>
                        <button class="btn btn-danger px-2 py-1 text-xs" :disabled="versions.length <= 1"
                          @click="deleteVersion(v)">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>

      <!-- Files editor modal -->
      <EditLinkFilesModal v-model="filesEditorOpen" :apiFetch="apiFetch"
        :linkType="(link?.type === 'download' ? 'download' : 'collection')" :initialPaths="draftFilePaths"
        :base="linkProjectBase" :startDir="linkStartDir" @apply="onApplyFilePaths" />

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AddUsersModal from './AddUsersModal.vue'
import EditLinkFilesModal from './EditLinkFilesModal.vue'
import PathInput from '../PathInput.vue'
import type { LinkItem, LinkType, AccessRow, Status, ExistingUser } from '../../typings/electron'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { Switch } from '@headlessui/vue'
import { useTransferProgress } from '../../composables/useTransferProgress'

const props = defineProps<{
  modelValue: boolean
  link: LinkItem | null
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated', payload: Partial<LinkItem> & { id: LinkItem['id'] }): void
}>()

const transfer = useTransferProgress()

const detailsLoading = ref(false)
const files = ref<any[]>([])
type AuditActivityRow = {
  type: string
  ts_ms: number
  actor_user_id: number | null
  actor_user_name: string | null
  actor_ip: string | null
  actor_user_agent: string | null
  details: any
}
const auditActivity = ref<AuditActivityRow[]>([])
const activityTypeFilter = ref('all')
const activitySearch = ref('')
const access = ref<AccessRow[]>([])
const accessLoading = ref(false)
const accessModalOpen = ref(false)
const versionsLoading = ref(false)
const versionsError = ref<string | null>(null)
const versions = ref<any[]>([])
const selectedVersionFileId = ref<number | null>(null)
const restoreBackup = ref(true)
const detailsToken = ref('')
let suppressVersionWatch = false
const proxyQualityChoices = ['720p', '1080p', 'original'] as const

const versionFileById = computed(() => {
  const map = new Map<number, any>()
  for (const f of files.value) {
    const id = toNumericFileId(f?.id)
    if (!id) continue
    map.set(id, f)
  }
  return map
})

const editMode = ref(false)
const saving = ref(false)
const saveDisabled = computed(() =>
  saving.value || (editMode.value && (!accessSatisfied.value || !passwordSatisfied.value))
)

const draftTitle = ref('')
const draftNotes = ref('')
const draftAccessMode = ref<'open' | 'restricted'>('open')
const draftAllowComments = ref(true)
const draftUsePassword = ref(false)
const draftPassword = ref('')
const draftGenerateReviewProxy = ref(false)
const draftProxyQualities = ref<string[]>([])
const draftWatermarkEnabled = ref(false)
const draftWatermarkFile = ref('')

const filesEditorOpen = ref(false)
const draftFilePaths = ref<string[]>([])
const originalFilePaths = ref<string[]>([])

const draftUploadDir = ref('')
const originalUploadDir = ref('')

const isDownloadish = computed(() => props.link?.type === 'download' || props.link?.type === 'collection')
const supportsComments = computed(() => props.link?.type !== 'upload')
const supportsPassword = computed(() => effectiveAccessMode.value === 'open')
const currentAccessMode = computed<'open' | 'restricted'>(() => props.link?.access_mode || 'open')
const effectiveAccessMode = computed<'open' | 'restricted'>(() =>
  editMode.value ? draftAccessMode.value : currentAccessMode.value
)
const restrictAccess = computed({
  get: () => draftAccessMode.value === 'restricted',
  set: (v: boolean) => {
    draftAccessMode.value = v ? 'restricted' : 'open'
  },
})
const accessSatisfied = computed(() => effectiveAccessMode.value !== 'restricted' || access.value.length > 0)
const openPasswordRequired = computed(() =>
  effectiveAccessMode.value === 'open' &&
  ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
)
const mustProvidePassword = computed(() =>
  editMode.value &&
  supportsPassword.value &&
  draftUsePassword.value &&
  !openPasswordRequired.value &&
  !draftPassword.value.trim()
)
const passwordSatisfied = computed(() => !mustProvidePassword.value)
const openPasswordEnabled = computed(() =>
  editMode.value ? (supportsPassword.value && draftUsePassword.value) : openPasswordRequired.value
)
const accessModeOpenLabel = computed(() => (openPasswordEnabled.value ? 'Open (password required)' : 'Open'))
const accessModeSummary = computed(() => {
  if (effectiveAccessMode.value === 'restricted') return 'Restricted (users only)'
  return accessModeOpenLabel.value
})
const currentAccessSummary = computed(() => {
  if (currentAccessMode.value === 'restricted') return 'Only invited users'
  if ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired) {
    return 'Anyone with the link + password'
  }
  return 'Anyone with the link'
})
const versionFileChoices = computed(() => {
  return files.value
    .map((f: any) => {
      const id = toNumericFileId(f?.id)
      if (!id) return null
      return { id, name: f?.name || f?.relPath || `File ${id}` }
    })
    .filter(Boolean) as Array<{ id: number; name: string }>
})

const fallbackLinkFiles = computed(() => {
  const src = Array.isArray(props.link?.target?.files) ? props.link?.target?.files : []
  return src.map((f: any, idx: number) => ({
    key: `fallback-${idx}`,
    id: f?.id ?? null,
    name: f?.name || `File ${idx + 1}`,
    size: typeof f?.size === 'number' ? f.size : null,
    mime: f?.mime || null,
    uploader_label: null,
    ip: null,
    ts: null,
    relPath: f?.path ?? f?.relPath ?? f?.p ?? null,
  }))
})

const displayFiles = computed(() => (files.value.length ? files.value : fallbackLinkFiles.value))
const usingFallbackFiles = computed(() => !detailsLoading.value && files.value.length === 0 && fallbackLinkFiles.value.length > 0)

const currentUploadDir = computed(() => {
  const it = props.link
  if (!it || it.type !== 'upload') return ''
  return (it.target?.dirRel || (it as any).dirRel || '') as string
})

const primaryUrl = computed(() => {
  const it: any = props.link
  return (it?.url || it?.viewUrl || '') as string
})

const downloadUrl = computed(() => {
  const it: any = props.link
  return (it?.downloadUrl || '') as string
})

const currentGenerateReviewProxy = computed(() => !!(props.link?.generateReviewProxy))
const currentProxyQualities = computed(() => normalizeQualities(props.link?.proxyQualities))
const currentWatermark = computed(() => !!(props.link?.watermark))
const currentWatermarkFile = computed(() => String(props.link?.watermarkFile || '').trim())
const mediaSettingsDirty = computed(() => {
  if (!!draftGenerateReviewProxy.value !== currentGenerateReviewProxy.value) return true
  if (!sameValues(normalizeQualities(draftProxyQualities.value), currentProxyQualities.value)) return true
  if (!!draftWatermarkEnabled.value !== currentWatermark.value) return true
  if ((draftWatermarkFile.value || '').trim() !== currentWatermarkFile.value) return true
  return false
})


function canonPaths(arr: string[]) {
  return (arr || [])
    .map(normalizeAbs)
    .filter(Boolean)
    .slice()
    .sort()
}

function normalizeQualities(v: any): string[] {
  if (!Array.isArray(v)) return []
  const allowed = new Set(proxyQualityChoices)
  const out: string[] = []
  for (const q of v) {
    const s = String(q || '').trim()
    if (!s || !allowed.has(s as any)) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function sameValues(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const as = [...a].sort()
  const bs = [...b].sort()
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false
  return true
}

function assignMediaSettingsFromSource(src: any) {
  if (!src || typeof src !== 'object' || !props.link) return
  const target: any = props.link as any

  const mediaPrefs = src.mediaPrefs ?? src.media_prefs
  if (mediaPrefs && typeof mediaPrefs === 'object') {
    const prefProxy = mediaPrefs.prefer_proxies ?? mediaPrefs.preferProxies
    if (typeof prefProxy === 'boolean') target.generateReviewProxy = prefProxy

    const allowOriginal = mediaPrefs.allow_original_download ?? mediaPrefs.allowOriginalDownload
    if (typeof allowOriginal === 'boolean') target.watermark = !allowOriginal
  }

  const prefProxy = src.prefer_proxies ?? src.preferProxies
  if (typeof prefProxy === 'boolean') target.generateReviewProxy = prefProxy

  const allowOriginal = src.allow_original_download ?? src.allowOriginalDownload
  if (typeof allowOriginal === 'boolean') target.watermark = !allowOriginal

  const proxyVal = src.generateReviewProxy ?? src.generate_review_proxy
  if (typeof proxyVal === 'boolean') target.generateReviewProxy = proxyVal

  const proxyQualities = normalizeQualities(src.proxyQualities ?? src.proxy_qualities)
  if (proxyQualities.length || Array.isArray(src.proxyQualities) || Array.isArray(src.proxy_qualities)) {
    target.proxyQualities = proxyQualities
  }

  const wmVal = src.watermark
  if (typeof wmVal === 'boolean') target.watermark = wmVal

  const wmFile = src.watermarkFile ?? src.watermark_file
  if (wmFile != null) target.watermarkFile = String(wmFile || '')
}

function isVideoishFile(f: any) {
  const mime = String(f?.mime || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  const name = String(f?.name || f?.relPath || '').toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() || '' : ''
  return ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'm2v', '3gp', '3g2'].includes(ext)
}

async function hydrateMediaSettingsFromArtifacts() {
  if (!props.link) return
  if (!detailsToken.value) return
  if (!Array.isArray(files.value) || files.value.length === 0) return
  if (statusOf(props.link) !== 'active') return

  const accessMode = props.link.access_mode || 'open'
  const authMode = props.link.auth_mode || (props.link.passwordRequired ? 'password' : 'none')
  const requiresViewerAuth =
    accessMode === 'restricted' ||
    (accessMode === 'open' && authMode === 'password')
  if (requiresViewerAuth) return

  const candidateIds = files.value
    .filter(isVideoishFile)
    .map((f: any) => toNumericFileId(f?.id))
    .filter((n: number | null): n is number => !!n)

  if (!candidateIds.length) return

  let foundProxy = false
  let foundWatermark = false
  const mergedQualities = new Set<string>(normalizeQualities((props.link as any)?.proxyQualities))

  // Keep requests bounded while still sampling enough files for mixed collections.
  const maxChecks = Math.min(candidateIds.length, 12)
  for (let i = 0; i < maxChecks; i++) {
    const fileId = candidateIds[i]
    try {
      const data = await props.apiFetch(
        `/api/token/${encodeURIComponent(detailsToken.value)}/files/${encodeURIComponent(String(fileId))}/playback?prefer=auto&audit=0`,
        { suppressAuthRedirect: true }
      )

      if (data?.hasProxy || data?.hasHls || (Array.isArray(data?.proxyQualities) && data.proxyQualities.length)) {
        foundProxy = true
      }
      if (data?.watermarkEnabled) foundWatermark = true

      for (const q of normalizeQualities(data?.proxyQualities)) mergedQualities.add(q)

      if (foundProxy && foundWatermark && mergedQualities.size > 0) break
    } catch {
      // Non-fatal; continue sampling.
    }
  }

  const target: any = props.link as any
  if (foundProxy) target.generateReviewProxy = true
  if (mergedQualities.size) target.proxyQualities = Array.from(mergedQualities)
  if (foundWatermark) target.watermark = true
}

function seedDraftMediaSettings() {
  draftGenerateReviewProxy.value = currentGenerateReviewProxy.value
  draftProxyQualities.value = currentProxyQualities.value.length
    ? currentProxyQualities.value.slice()
    : (draftGenerateReviewProxy.value ? ['720p'] : [])
  draftWatermarkEnabled.value = currentWatermark.value
  draftWatermarkFile.value = currentWatermarkFile.value
}

function computeAddedPaths(next: string[], prev: string[]) {
  const prevSet = new Set(canonPaths(prev))
  return canonPaths(next).filter(p => !prevSet.has(p))
}

const filesDirty = computed(() => {
  const a = canonPaths(draftFilePaths.value)
  const b = canonPaths(originalFilePaths.value)
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
})

const addedFilePaths = computed(() => computeAddedPaths(draftFilePaths.value, originalFilePaths.value))

const uploadDirDirty = computed(() => (draftUploadDir.value || '') !== (originalUploadDir.value || ''))
const activityTypes = computed(() => {
  return Array.from(new Set(auditActivity.value.map(a => String(a?.type || '').trim()).filter(Boolean))).sort()
})
const filteredAuditActivity = computed(() => {
  const type = activityTypeFilter.value
  const q = activitySearch.value.trim().toLowerCase()
  return auditActivity.value.filter((a) => {
    if (type !== 'all' && a.type !== type) return false
    if (!q) return true
    const hay = [
      a.type,
      activityTypeLabel(a.type),
      actorLabel(a),
      sourceLabel(a),
      activitySummary(a),
      safeStringify(a.details),
    ].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

function normalizeAbs(p: string) {
  const s = (p || '').trim()
  if (!s) return ''
  return s.startsWith('/') ? s : '/' + s.replace(/^\/+/, '')
}

function inferBaseFromPaths(paths: string[]) {
  const first = (paths || []).map(normalizeAbs).find(Boolean)
  if (!first) return ''
  const seg = first.split('/').filter(Boolean)[0]
  return seg ? '/' + seg : ''
}

const linkProjectBase = computed(() => {
  // Use whatever you actually have on LinkItem, if present.
  // Examples you might have: link.projectBase, link.target.projectBase, etc.
  const it: any = props.link as any
  const pb = (it?.projectBase || it?.target?.projectBase || '').trim()
  if (pb) return pb

  // Fallback: infer from existing draft paths or detail files
  return inferBaseFromPaths(draftFilePaths.value.length ? draftFilePaths.value : originalFilePaths.value)
})

const linkStartDir = computed(() => linkProjectBase.value || '/')

function close() {
  emit('update:modelValue', false)
}

function openAccessModal() {
  accessModalOpen.value = true
}

function badgeClass(t?: LinkType) {
  if (!t) return ''
  return t === 'upload' ? 'text-blue-500' : t === 'download' ? 'text-emerald-500' : 'text-purple-500'
}
function statusChipClass(s: Status) {
  return s === 'active' ? 'text-green-500' : s === 'expired' ? 'text-amber-500' : 'text-gray-500'
}
function statusOf(it: LinkItem): Status {
  if (it.isDisabled) return 'disabled'
  if (it.expiresAt && it.expiresAt <= Date.now()) return 'expired'
  return 'active'
}
function fallbackTitle(it: LinkItem) {
  if (it.type === 'upload') return it.target?.dirRel || '(Upload)'
  const n = it.target?.files?.length || (it.type === 'download' ? 1 : 0)
  if (n === 1) return it.target?.files?.[0]?.name || '1 File'
  return `${n} Files`
}
async function copy(txt?: string | null) {
  if (!txt) return
  await navigator.clipboard.writeText(txt)
}

function fmtBytes(n?: number) {
  if (n === undefined || n === null) return '—'
  const k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n
  while (v >= k && i < u.length - 1) { v /= k; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

function snapshotName(rel?: string | null) {
  if (!rel) return '—'
  const parts = String(rel).split('/')
  return parts[parts.length - 1] || rel
}

function toNumericFileId(v: any) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function safeStringify(v: any) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return '' }
}

function normalizeAuditRow(v: any): AuditActivityRow {
  const ts = Number(v?.ts_ms ?? v?.occurred_at_ms ?? 0)
  const actorId = Number(v?.actor_user_id)
  return {
    type: String(v?.type || v?.activity_type || '').trim(),
    ts_ms: Number.isFinite(ts) && ts > 0 ? ts : 0,
    actor_user_id: Number.isFinite(actorId) && actorId > 0 ? actorId : null,
    actor_user_name: v?.actor_user_name ? String(v.actor_user_name) : null,
    actor_ip: v?.actor_ip ? String(v.actor_ip) : null,
    actor_user_agent: v?.actor_user_agent ? String(v.actor_user_agent) : null,
    details: v?.details ?? null,
  }
}

const ACTIVITY_REASON_LABELS: Record<string, string> = {
  disabled_or_expired: 'Link is disabled or expired',
  file_missing: 'File is missing',
  bad_file_id: 'Invalid file selected',
  bad_link_type: 'Link type mismatch',
  original_download_not_allowed: 'Original file downloads are disabled',
  original_stream_not_allowed: 'Original playback is disabled',
  watermark_transcode_pending: 'Waiting for watermarked transcode output',
  range_not_satisfiable: 'Invalid byte-range request',
  read_error: 'File read failed',
  bad_auth: 'Authentication failed',
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  link_created: 'Link created',
  link_enabled: 'Link enabled',
  link_disabled: 'Link disabled',
  access_denied: 'Access denied',
  title_changed: 'Title updated',
  notes_changed: 'Notes updated',
  expiry_changed: 'Expiry updated',
  files_changed: 'Files changed',
  link_type_changed: 'Link type changed',
  password_set: 'Password set',
  password_cleared: 'Password cleared',
  stream_started: 'Playback started',
  stream_ended: 'Playback ended',
  stream_failed: 'Playback failed',
  playback_resolved: 'Playback requested',
  playback_blocked: 'Playback blocked',
  download_started: 'Download started',
  download_ended: 'Download ended',
  download_failed: 'Download failed',
  download_416_bad_range: 'Download failed (bad range)',
  upload_started: 'Upload started',
  upload_completed: 'Upload completed',
  upload_failed: 'Upload failed',
  upload_aborted: 'Upload aborted',
  'upload.failed': 'Upload failed',
  'upload.aborted': 'Upload aborted',
}

function titleCaseWords(v: string) {
  return v
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

function activityTypeLabel(type: string) {
  const t = String(type || '').trim()
  if (!t) return 'Unknown'
  return ACTIVITY_TYPE_LABELS[t] || titleCaseWords(t.replace(/_/g, ' '))
}

function detailsObj(a: AuditActivityRow): Record<string, any> | null {
  const d = a.details
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  return d as Record<string, any>
}

function detailsValue(d: Record<string, any> | null, keys: string[]) {
  if (!d) return ''
  for (const k of keys) {
    const v = d[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function reasonLabel(reason?: string) {
  const key = String(reason || '').trim()
  if (!key) return ''
  return ACTIVITY_REASON_LABELS[key] || titleCaseWords(key.replace(/_/g, ' '))
}

function compactUserAgent(ua?: string | null) {
  const s = String(ua || '').trim()
  if (!s) return ''
  const low = s.toLowerCase()
  if (low.includes('edg/')) return 'Edge'
  if (low.includes('chrome/')) return 'Chrome'
  if (low.includes('firefox/')) return 'Firefox'
  if (low.includes('safari/') && !low.includes('chrome/')) return 'Safari'
  if (low.includes('curl/')) return 'curl'
  if (low.includes('vlc')) return 'VLC'
  return s.length > 36 ? `${s.slice(0, 36)}…` : s
}

function formatTs(v: number) {
  if (!Number.isFinite(v) || v <= 0) return '—'
  return new Date(v).toLocaleString()
}

function actorLabel(a: AuditActivityRow) {
  const d = detailsObj(a)
  if (a.actor_user_name) return a.actor_user_name
  const fromDetails = detailsValue(d, ['actor_user_name', 'user_name', 'username', 'uploader_name', 'name'])
  if (fromDetails) return fromDetails
  if (a.actor_user_id != null) return `user:${a.actor_user_id}`
  return 'Guest'
}

function sourceLabel(a: AuditActivityRow) {
  const d = detailsObj(a)
  const ip = a.actor_ip || detailsValue(d, ['actor_ip', 'ip', 'remote_ip', 'client_ip'])
  const agent = compactUserAgent(a.actor_user_agent || detailsValue(d, ['actor_user_agent', 'ua', 'user_agent']))
  if (ip && agent) return `${ip} • ${agent}`
  return ip || agent || '—'
}

function hasActivityDetails(a: AuditActivityRow) {
  if (a.details == null) return false
  if (typeof a.details === 'string') return a.details.trim().length > 0
  if (Array.isArray(a.details)) return a.details.length > 0
  if (typeof a.details === 'object') return Object.keys(a.details).length > 0
  return true
}

function activityDetailsPretty(a: AuditActivityRow) {
  if (a.details == null) return ''
  if (typeof a.details === 'string') return a.details
  try { return JSON.stringify(a.details, null, 2) } catch { return String(a.details) }
}

function activitySummary(a: AuditActivityRow) {
  const d = a.details
  if (typeof d === 'string' && d.trim()) return d
  if (d && typeof d === 'object') {
    const typed = d as Record<string, any>
    const reason = reasonLabel(typed.reason)
    if (reason) {
      const file = detailsValue(typed, ['filename', 'name'])
      const variant = detailsValue(typed, ['variant', 'requested_variant'])
      if (file && variant) return `${reason} (${variant}, ${file})`
      if (file) return `${reason} (${file})`
      return reason
    }

    if (a.type === 'download_started' || a.type === 'stream_started') {
      const file = detailsValue(typed, ['filename', 'name'])
      const variant = detailsValue(typed, ['variant'])
      if (file && variant) return `${file} (${variant})`
      if (file) return file
    }

    if (a.type === 'download_ended' || a.type === 'stream_ended') {
      const completed = typed.completed === true ? 'Completed' : (typed.completed === false ? 'Stopped early' : '')
      const bytes = Number(typed.bytes_sent)
      if (completed && Number.isFinite(bytes) && bytes >= 0) return `${completed} • ${fmtBytes(bytes)} sent`
      if (completed) return completed
    }

    if (a.type === 'playback_resolved' || a.type === 'playback_blocked') {
      const file = detailsValue(typed, ['filename', 'name'])
      const source = detailsValue(typed, ['source_type', 'source'])
      const prefer = detailsValue(typed, ['prefer', 'requested_prefer'])
      if (file && source && prefer) return `${file} (${source}, prefer=${prefer})`
      if (file && source) return `${file} (${source})`
      if (file) return file
    }

    if (a.type === 'files_changed') {
      const fromCount = Number(typed.from_count || 0)
      const toCount = Number(typed.to_count || 0)
      return `Files changed (${fromCount} -> ${toCount})`
    }

    if (a.type === 'expiry_changed') {
      const fromMs = Number(typed.from_ms)
      const toMs = Number(typed.to_ms)
      const from = Number.isFinite(fromMs) && fromMs > 0 ? new Date(fromMs).toLocaleString() : 'Never'
      const to = Number.isFinite(toMs) && toMs > 0 ? new Date(toMs).toLocaleString() : 'Never'
      return `${from} -> ${to}`
    }

    if (typeof d.message === 'string' && d.message.trim()) return d.message
    if (typeof d.reason === 'string' && d.reason.trim()) return d.reason
    if (typeof d.path === 'string' && d.path.trim()) return `path=${d.path}`
    if (typeof d.filename === 'string' && d.filename.trim()) return `file=${d.filename}`
    if (typeof d.target === 'string' && d.target.trim()) return `target=${d.target}`
    const keys = Object.keys(d).slice(0, 3)
    if (keys.length) return keys.map(k => `${k}=${String((d as any)[k])}`).join(' ')
  }
  return a.type || '—'
}

function extractJobInfoByVersion(data: any): Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> {
  const map: Record<number, { queuedKinds: string[]; activeKinds: string[]; skippedKinds: string[] }> = {}
  const t = data?.transcodes
  if (!Array.isArray(t)) return map

  for (const rec of t as any[]) {
    const vId = Number(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id)
    if (!Number.isFinite(vId) || vId <= 0) continue

    map[vId] = {
      queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
      activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
      skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
    }
  }
  return map
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

function extractAssetVersionIdsFromLinkFilesResponse(data: any): number[] {
  const ids: number[] = []
  const push = (v: any) => {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) ids.push(n)
  }

  const t = data?.transcodes
  if (Array.isArray(t)) {
    for (const rec of t as any[]) {
      push(rec?.assetVersionId ?? rec?.asset_version_id ?? rec?.assetVersion?.id)
    }
  } else if (t && typeof t === 'object') {
    for (const k of Object.keys(t)) {
      push((t as any)[k]?.assetVersionId ?? (t as any)[k]?.asset_version_id ?? (t as any)[k]?.assetVersion?.id)
    }
  }

  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (Array.isArray(files)) {
    for (const f of files) {
      push(f?.assetVersionId ?? f?.asset_version_id ?? f?.assetVersion?.id)
    }
  }

  push(data?.assetVersionId ?? data?.asset_version_id)
  return Array.from(new Set(ids))
}

function extractDbFileIdsFromLinkFilesResponse(data: any): number[] {
  const ids: number[] = []
  const push = (v: any) => {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) ids.push(n)
  }

  const files = Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null
  if (Array.isArray(files)) {
    for (const f of files) {
      push(f?.id ?? f?.fileId ?? f?.file_id ?? f?.file?.id)
    }
  }

  if (Array.isArray(data?.fileIds)) {
    for (const id of data.fileIds) push(id)
  }

  push(data?.file?.id ?? data?.fileId ?? data?.file_id)
  return Array.from(new Set(ids))
}

function startLinkTranscodeTracking(opts: {
  resp: any
  wantsProxy: boolean
  wantsHls: boolean
  addedPaths: string[]
}) {
  if (!opts.wantsProxy && !opts.wantsHls) return

  const versionIds = extractAssetVersionIdsFromLinkFilesResponse(opts.resp)
  const linkTitle = (draftTitle.value || props.link?.title || (props.link ? fallbackTitle(props.link) : '') || '').trim()
  const context = {
    source: 'link' as const,
    groupId: props.link?.id != null ? `link:${props.link.id}` : undefined,
    linkUrl: primaryUrl.value || undefined,
    linkTitle: linkTitle || undefined,
    file: opts.addedPaths.length === 1 ? opts.addedPaths[0] : undefined,
    files: opts.addedPaths.length > 1 ? opts.addedPaths.slice() : undefined,
  }

  if (versionIds.length) {
    const jobInfo = extractJobInfoByVersion(opts.resp)

    if (opts.wantsProxy) {
      const proxySplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'proxy_mp4')
      const proxyCandidates = [...proxySplit.queued, ...proxySplit.active]
      const proxyActiveSplit = transfer.splitActiveTranscodeAssetVersions(proxyCandidates, 'proxy_mp4')
      const proxyToTrack = proxyActiveSplit.inactive

      if (proxyToTrack.length) {
        transfer.startAssetVersionTranscodeTask({
          apiFetch: props.apiFetch,
          assetVersionIds: proxyToTrack,
          title: 'Generating proxy files',
          detail: `Tracking ${proxyToTrack.length} asset version(s)`,
          intervalMs: 1500,
          jobKind: 'proxy_mp4',
          context,
        })
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
        )
      }
    }

    if (opts.wantsHls) {
      const hlsSplit = filterVersionIdsByJobKind(versionIds, jobInfo, 'hls')
      const hlsCandidates = [...hlsSplit.queued, ...hlsSplit.active]
      const hlsActiveSplit = transfer.splitActiveTranscodeAssetVersions(hlsCandidates, 'hls')
      const hlsToTrack = hlsActiveSplit.inactive

      if (hlsToTrack.length) {
        transfer.startAssetVersionTranscodeTask({
          apiFetch: props.apiFetch,
          assetVersionIds: hlsToTrack,
          title: 'Generating adaptive stream',
          detail: `Tracking ${hlsToTrack.length} asset version(s)`,
          intervalMs: 1500,
          jobKind: 'hls',
          context,
        })
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
        )
      }
    }

    return
  }

  const fileIds = extractDbFileIdsFromLinkFilesResponse(opts.resp)
  if (!fileIds.length) return

  const jobKind = opts.wantsProxy && !opts.wantsHls
    ? 'proxy_mp4'
    : (opts.wantsHls && !opts.wantsProxy ? 'hls' : 'any')

  transfer.startTranscodeTask({
    apiFetch: props.apiFetch,
    fileIds,
    title: jobKind === 'proxy_mp4'
      ? 'Generating proxy files'
      : (jobKind === 'hls' ? 'Generating adaptive stream' : 'Generating transcodes'),
    detail: `Tracking ${fileIds.length} file(s)`,
    intervalMs: 1500,
    jobKind,
    context,
  })
}

function normalizeAccessRow(c: any): AccessRow {
  const rawId = c?.user_id ?? c?.userId
  const nId = Number(rawId)
  return {
    user_id: Number.isFinite(nId) ? nId : 0,
    user_name: c?.user_name ?? c?.userName,
    name: c?.name,
    user_email: c?.user_email ?? c?.userEmail,
    display_color: c?.display_color ?? null,
    role_id: c?.role_id ?? null,
    role_name: c?.role_name ?? null,
    role: c?.role ?? null,
    granted_at: c?.granted_at ?? c?.created_at ?? null,
    is_disabled: !!c?.is_disabled,
  }
}

function setAccessFromResponse(resp: any) {
  const rows =
    Array.isArray(resp?.users) ? resp.users :
    Array.isArray(resp?.commenters) ? resp.commenters :
    Array.isArray(resp?.items) ? resp.items :
    []
  access.value = rows.map(normalizeAccessRow)
}

function selectDefaultVersionFile() {
  const choices = versionFileChoices.value
  if (!choices.length) {
    selectedVersionFileId.value = null
    versions.value = []
    return
  }
  if (!choices.some(c => c.id === selectedVersionFileId.value)) {
    selectedVersionFileId.value = choices[0].id
  }
}

// Add near your refs:
const noVersionsByFileId = ref<Set<number>>(new Set());

// Change loadVersions signature:
async function loadVersions(fileId: number, opts?: { force?: boolean }) {
  if (!fileId) return;

  // If we already know there are none, don't keep auto-checking
  if (!opts?.force && noVersionsByFileId.value.has(fileId)) {
    versions.value = [];
    versionsError.value = null;
    versionsLoading.value = false;
    return;
  }

  versionsLoading.value = true;
  versionsError.value = null;

  try {
    const resp = await props.apiFetch(`/api/files/${fileId}/versions`);
    const list = Array.isArray(resp?.versions) ? resp.versions : [];
    versions.value = list;

    if (list.length === 0) {
      // Sticky "none exist" so we don't keep re-fetching
      noVersionsByFileId.value.add(fileId);
    } else {
      // If versions appear later, clear the sticky empty
      noVersionsByFileId.value.delete(fileId);
    }
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e);

    // If we *already* know there are none, treat errors as non-fatal and keep UI calm
    if (noVersionsByFileId.value.has(fileId)) {
      versionsError.value = null;
      versions.value = [];
    } else {
      // Otherwise show the real error
      versionsError.value = msg;
      versions.value = [];
    }
  } finally {
    versionsLoading.value = false;
  }
}

async function refreshVersions() {
  if (!selectedVersionFileId.value) return;
  // Force refresh overrides sticky-empty cache
  await loadVersions(selectedVersionFileId.value, { force: true });
}

watch(
  () => props.link?.id,
  () => {
    noVersionsByFileId.value = new Set();
  }
);

async function restoreVersion(v: any) {
  if (!selectedVersionFileId.value) return
  const fileId = selectedVersionFileId.value
  const f = versionFileById.value.get(fileId)
  const livePath = f?.relPath || f?.name || `file ${fileId}`
  const backupDir = `.studio/backups/${fileId}/`
  const confirmLines = [
    `Restore version v${v?.version_index}?`,
    '',
    `Live file to overwrite: ${livePath}`,
    restoreBackup.value
      ? `Backup will be created under: ${backupDir} (timestamped filename)`
      : 'Backup will NOT be created.',
    '',
    'Proceed?'
  ]
  const ok = confirm(confirmLines.join('\n'))
  if (!ok) return

  try {
    const resp = await props.apiFetch(`/api/files/${selectedVersionFileId.value}/versions/${v.asset_version_id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ backup: restoreBackup.value }),
    })
    await refreshVersions()
    const backupNote = resp?.backup_rel ? ` Backup: ${resp.backup_rel}` : ''
    pushNotification(new Notification('Version Restored', `Restored v${v?.version_index}.${backupNote}`, 'success', 8000))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Restore Failed', msg, 'error', 8000))
  }
}

async function deleteVersion(v: any) {
  if (!selectedVersionFileId.value) return
  if (versions.value.length <= 1) return
  const ok = confirm(`Delete version v${v?.version_index}? This cannot be undone.`)
  if (!ok) return

  try {
    await props.apiFetch(`/api/files/${selectedVersionFileId.value}/versions/${v.asset_version_id}`, {
      method: 'DELETE',
    })
    await refreshVersions()
    pushNotification(new Notification('Version Deleted', `Deleted v${v?.version_index}.`, 'success', 6000))
  } catch (e: any) {
    const msg = e?.message || e?.error || String(e)
    pushNotification(new Notification('Delete Failed', msg, 'error', 8000))
  }
}

async function fetchDetailsFor() {
  if (!props.link) return
  detailsLoading.value = true
  files.value = []
  auditActivity.value = []
  detailsToken.value = ''
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/details`)
    assignMediaSettingsFromSource(resp?.link)
    assignMediaSettingsFromSource(resp?.settings)
    assignMediaSettingsFromSource(resp)
    detailsToken.value = String(resp?.link?.token || resp?.token || '')
    files.value = (resp.files || []).map((f: any, idx: number) => ({
      key: `f${idx}`,
      ...f,
      uploader_label: f.uploader_name,
      relPath: f.relPath ?? f.path ?? f.p ?? null
    }))
    const rawAudit = Array.isArray(resp?.auditActivity) ? resp.auditActivity : []
    auditActivity.value = rawAudit
      .map(normalizeAuditRow)
      .filter((a: AuditActivityRow) => !!a.type || a.ts_ms > 0)

    setAccessFromResponse(resp)

    suppressVersionWatch = true
    selectDefaultVersionFile()
    suppressVersionWatch = false

    await hydrateMediaSettingsFromArtifacts()

    if (selectedVersionFileId.value) await loadVersions(selectedVersionFileId.value)
  } catch {
    // Keep the modal usable even if details fetch fails; UI falls back to list-level file metadata.
    detailsToken.value = String(props.link?.token || '')
    files.value = []
    auditActivity.value = []
    versions.value = []
    selectedVersionFileId.value = null
  } finally {
    detailsLoading.value = false
  }
}

async function loadAccess() {
  if (!props.link) return
  accessLoading.value = true
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.link.id))}/access`)
    setAccessFromResponse(resp)
  } catch {
    access.value = []
  } finally {
    accessLoading.value = false
  }
}

function buildUsersPayload(users: Array<{ id?: number; username?: string; name?: string; user_email?: string; role_id?: number | null; role_name?: string | null }>) {
  return users
    .map(u => {
      const out: any = {}
      if (u.id != null) out.userId = u.id
      if (u.username) out.username = u.username
      if (u.user_email) out.user_email = u.user_email
      if (u.name) out.name = u.name
      if (u.role_id != null) out.roleId = u.role_id
      if (u.role_name) out.roleName = u.role_name
      return out
    })
    .filter(x => x.userId != null || x.username || x.user_email)
}

async function mergeAccess(users: Array<{ id?: number; username?: string; name?: string; user_email?: string; role_id?: number | null; role_name?: string | null }>) {
  if (!props.link) return
  const payload = { users: buildUsersPayload(users) }
  await props.apiFetch(`/api/links/${props.link.id}/access/merge`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  await loadAccess()
}

async function mergeAccessFromModal(users: Array<{ username: string; name?: string; user_email?: string; display_color?: string; role_id?: number | null; role_name?: string | null }>) {
  try {
    await mergeAccess(users)
    await loadAccess()
    accessModalOpen.value = false
  } catch { }
}

async function removeAccess(userId: number) {
  if (!props.link) return
  if (!confirm('Remove access for this user?')) return
  await props.apiFetch(`/api/links/${props.link.id}/access/${userId}`, { method: 'DELETE' })
  await loadAccess()
}

function beginEdit() {
  if (!props.link) return
  editMode.value = true

  draftTitle.value = props.link.title || ''
  draftNotes.value = (props.link as any).notes || ''
  draftAccessMode.value = props.link.access_mode || 'open'
  draftAllowComments.value = supportsComments.value
    ? (props.link.allow_comments ?? true)
    : false
  draftUsePassword.value =
    draftAccessMode.value === 'open' &&
    ((props.link.auth_mode || '') === 'password' || !!props.link.passwordRequired)
  draftPassword.value = ''
  if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
  seedDraftMediaSettings()

  // Seed upload destination
  if (props.link.type === 'upload') {
    const cur = currentUploadDir.value || ''
    draftUploadDir.value = cur
    originalUploadDir.value = cur
  } else {
    draftUploadDir.value = ''
    originalUploadDir.value = ''
  }

  // Seed file paths for download/collection
  if (isDownloadish.value) {
    const fromDetails = files.value
      .map(f => f?.relPath)
      .filter((p: any) => typeof p === 'string' && p.trim().length > 0) as string[]

    const seeded = fromDetails.length
      ? fromDetails
      : (props.link.target?.files || []).map((f: any) => f?.relPath || f?.path || f?.p).filter(Boolean)

    draftFilePaths.value = Array.isArray(seeded)
      ? seeded.map(normalizeAbs).filter(Boolean)
      : []
    originalFilePaths.value = draftFilePaths.value.slice()
  } else {
    draftFilePaths.value = []
    originalFilePaths.value = []
  }

}

function cancelEdit() {
  editMode.value = false

  draftTitle.value = props.link?.title || ''
  draftNotes.value = (props.link as any)?.notes || ''
  draftAccessMode.value = props.link?.access_mode || 'open'
  draftAllowComments.value = supportsComments.value
    ? (props.link?.allow_comments ?? true)
    : false
  draftUsePassword.value =
    draftAccessMode.value === 'open' &&
    ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
  draftPassword.value = ''
  if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
  seedDraftMediaSettings()

  draftFilePaths.value = originalFilePaths.value.slice()
  draftUploadDir.value = originalUploadDir.value || currentUploadDir.value || ''
}

function openFilesEditor() {
  if (!props.link) return
  if (!(props.link.type === 'download' || props.link.type === 'collection')) return
  filesEditorOpen.value = true
}

function onApplyFilePaths(paths: string[]) {
  draftFilePaths.value = paths.slice()
}

async function saveAll() {
  if (!props.link) return

  // Optional: prevent duplicate clicks
  if (saving.value) return

  saving.value = true

  // Helpers
  const id = props.link.id

  function toRel(p: string) {
    return (p || '').replace(/^\/+/, '')
  }

  function apiErrMsg(e: any) {
    return e?.message || e?.error || String(e || 'Request failed')
  }

  // Track what we actually attempted (for better messaging)
  const did = {
    details: false,
    files: false,
    uploadDest: false,
  }

  try {
    // Compute change flags up front
    const titleChanged = (draftTitle.value || '') !== (props.link.title || '')
    const notesChanged = (draftNotes.value || '') !== (((props.link as any).notes) || '')

    const currentAccessModeValue = props.link.access_mode || 'open'
    const nextAccessMode = draftAccessMode.value
    const accessModeChanged = nextAccessMode !== currentAccessModeValue
    const nextAllowComments =
      nextAccessMode === 'open' && supportsComments.value ? !!draftAllowComments.value : false
    const currentAllowComments =
      currentAccessModeValue === 'open' && supportsComments.value ? !!props.link.allow_comments : false
    const allowCommentsChanged =
      supportsComments.value && nextAccessMode === 'open' && nextAllowComments !== currentAllowComments

    const hadPassword = (props.link.auth_mode || '') === 'password' || !!props.link.passwordRequired
    const currentAuthModeValue =
      props.link.auth_mode || (hadPassword ? 'password' : 'none')
    const wantsPassword = nextAccessMode === 'open' && draftUsePassword.value
    const nextAuthMode = nextAccessMode === 'restricted'
      ? 'password'
      : (wantsPassword ? 'password' : 'none')
    const authModeChanged = nextAuthMode !== currentAuthModeValue

    const passwordInput = draftPassword.value.trim()
    const passwordWillSet = nextAccessMode === 'open' && wantsPassword && passwordInput.length > 0
    const passwordWillClear = nextAccessMode === 'open' && !wantsPassword && hadPassword
    const passwordChanged = passwordWillSet || passwordWillClear

    const shouldUpdateDetails =
      titleChanged || notesChanged || accessModeChanged || allowCommentsChanged || authModeChanged || passwordChanged || mediaSettingsDirty.value
    const shouldUpdateFiles = isDownloadish.value && filesDirty.value
    const shouldUpdateUploadDest = props.link.type === 'upload' && uploadDirDirty.value

    const addedPaths = computeAddedPaths(draftFilePaths.value, originalFilePaths.value)
    const wantsHls = addedPaths.length > 0
    const wantsProxy = wantsHls && draftGenerateReviewProxy.value
    const nextProxyQualities = normalizeQualities(draftProxyQualities.value)

    if (draftWatermarkEnabled.value && !draftGenerateReviewProxy.value) {
      pushNotification(
        new Notification(
          'Invalid Media Settings',
          'Enable proxy files before enabling watermark.',
          'warning',
          8000
        )
      )
      return
    }
    if (draftGenerateReviewProxy.value && nextProxyQualities.length === 0) {
      pushNotification(
        new Notification(
          'Proxy Quality Required',
          'Select at least one proxy quality.',
          'warning',
          8000
        )
      )
      return
    }
    if (draftWatermarkEnabled.value && !draftWatermarkFile.value.trim()) {
      pushNotification(
        new Notification(
          'Watermark File Required',
          'Enter a watermark file name.',
          'warning',
          8000
        )
      )
      return
    }

    // 1) Title/notes
    if (shouldUpdateDetails) {
      const body: any = {
        title: draftTitle.value || null,
        notes: draftNotes.value || null,
      }

      if (accessModeChanged || allowCommentsChanged || authModeChanged) {
        body.access_mode = nextAccessMode
        if (accessModeChanged || authModeChanged) body.auth_mode = nextAuthMode
        body.allow_comments = nextAllowComments
      }
      if (passwordWillSet) {
        body.password = passwordInput
      } else if (passwordWillClear) {
        body.password = ''
      }
      if (mediaSettingsDirty.value) {
        body.generateReviewProxy = !!draftGenerateReviewProxy.value
        body.proxyQualities = draftGenerateReviewProxy.value ? nextProxyQualities : []
        body.watermark = !!draftWatermarkEnabled.value
        body.watermarkFile = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
        body.watermarkProxyQualities = draftWatermarkEnabled.value ? nextProxyQualities : []
      }

      try {
        await props.apiFetch(`/api/links/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        did.details = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Save Link Details',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // 2) Files (download/collection)
    let filesResp: any | null = null
    if (shouldUpdateFiles) {
      const body: any = { filePaths: draftFilePaths.value.map(toRel) }
      if (wantsHls) {
        body.adaptiveHls = true
        body.generateReviewProxy = wantsProxy
      }

      try {
        filesResp = await props.apiFetch(`/api/links/${id}/files`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        did.files = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Update Link Files',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    if (shouldUpdateFiles && filesResp && (wantsHls || wantsProxy)) {
      startLinkTranscodeTracking({
        resp: filesResp,
        wantsProxy,
        wantsHls,
        addedPaths,
      })
    }

    // 3) Upload destination (use response for accurate rel path)
    let uploadResp: any | null = null
    if (shouldUpdateUploadDest) {
      try {
        uploadResp = await props.apiFetch(`/api/links/${id}/upload-destination`, {
          method: 'PUT',
          body: JSON.stringify({ path: draftUploadDir.value }),
        })
        did.uploadDest = true
      } catch (e: any) {
        const msg = apiErrMsg(e)
        pushNotification(
          new Notification(
            'Failed to Update Upload Destination',
            msg,
            /forbidden|denied|permission/i.test(msg) ? 'denied' : 'error',
            8000
          )
        )
        return
      }
    }

    // Refresh visible data (files table + access list)
    try {
      await fetchDetailsFor()
    } catch {
      // Non-fatal: UI can still exit edit mode since saves succeeded
    }

    // Normalize what we store as the "original" clean state
    originalFilePaths.value = draftFilePaths.value.slice()

    // If upload destination was changed, prefer server-returned rel dir
    if (did.uploadDest && uploadResp && typeof uploadResp.dirRel === 'string') {
      originalUploadDir.value = uploadResp.dirRel
      // If your UI expects PathInput to show absolute paths, don't overwrite draftUploadDir here.
      // If PathInput can display rel paths fine, you may set it too:
      // draftUploadDir.value = uploadResp.dirRel
    } else {
      originalUploadDir.value = draftUploadDir.value
    }

    // Emit accurate updated payload
    const updatedPayload: any = {
      id,
      title: draftTitle.value || null,
      notes: draftNotes.value || null,
    }

    if (accessModeChanged || allowCommentsChanged || authModeChanged) {
      updatedPayload.access_mode = nextAccessMode
      updatedPayload.allow_comments = nextAllowComments
      if (accessModeChanged || authModeChanged) updatedPayload.auth_mode = nextAuthMode
    }
    if (passwordWillSet) updatedPayload.passwordRequired = true
    if (passwordWillClear) updatedPayload.passwordRequired = false
    if (mediaSettingsDirty.value) {
      updatedPayload.generateReviewProxy = !!draftGenerateReviewProxy.value
      updatedPayload.proxyQualities = draftGenerateReviewProxy.value ? nextProxyQualities : []
      updatedPayload.watermark = !!draftWatermarkEnabled.value
      updatedPayload.watermarkFile = draftWatermarkEnabled.value ? draftWatermarkFile.value.trim() : null
      updatedPayload.watermarkProxyQualities = draftWatermarkEnabled.value ? nextProxyQualities : []
    }

    if (did.files && filesResp && typeof filesResp.type === 'string') {
      updatedPayload.type = filesResp.type
      updatedPayload.filesCount = draftFilePaths.value.length
      updatedPayload.target = { ...(props.link.target || {}), files: draftFilePaths.value.map(p => ({ p: toRel(p) })) }
    }

    emit('updated', updatedPayload)

    // Optional success notification (only if something changed)
    if (did.details || did.files || did.uploadDest) {
      close();
      pushNotification(
        new Notification(
          'Saved',
          'Link changes were saved successfully.',
          'success',
          6000
        )
      )
    }

    editMode.value = false
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      editMode.value = false
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftAccessMode.value = props.link?.access_mode || 'open'
      draftAllowComments.value = supportsComments.value
        ? (props.link?.allow_comments ?? true)
        : false
      draftUsePassword.value =
        draftAccessMode.value === 'open' &&
        ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
      draftPassword.value = ''
      if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
      seedDraftMediaSettings()
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      fetchDetailsFor()
      loadAccess()
    }
  },
  { immediate: false }
)

watch(
  () => props.link?.id,
  () => {
    if (props.modelValue) {
      editMode.value = false
      draftTitle.value = props.link?.title || ''
      draftNotes.value = (props.link as any)?.notes || ''
      draftAccessMode.value = props.link?.access_mode || 'open'
      draftAllowComments.value = supportsComments.value
        ? (props.link?.allow_comments ?? true)
        : false
      draftUsePassword.value =
        draftAccessMode.value === 'open' &&
        ((props.link?.auth_mode || '') === 'password' || !!props.link?.passwordRequired)
      draftPassword.value = ''
      if (draftAccessMode.value === 'restricted') draftAllowComments.value = false
      seedDraftMediaSettings()
      draftUploadDir.value = currentUploadDir.value || ''
      originalUploadDir.value = draftUploadDir.value
      fetchDetailsFor()
      loadAccess()
    }
  }
)

watch(
  () => selectedVersionFileId.value,
  (id) => {
    if (suppressVersionWatch || !id) return
    loadVersions(id)
  }
)

watch(
  () => draftAccessMode.value,
  (mode) => {
    if (mode === 'restricted' || !supportsComments.value) {
      draftAllowComments.value = false
    }
    if (mode === 'restricted') {
      draftUsePassword.value = false
      draftPassword.value = ''
    }
  }
)

watch(
  () => draftUsePassword.value,
  (v) => {
    if (!v) {
      draftPassword.value = ''
    }
  }
)

watch(
  () => draftGenerateReviewProxy.value,
  (v) => {
    if (v && draftProxyQualities.value.length === 0) {
      draftProxyQualities.value = ['720p']
    }
    if (!v) {
      draftProxyQualities.value = []
      draftWatermarkEnabled.value = false
      draftWatermarkFile.value = ''
    }
  }
)

watch(
  () => draftWatermarkEnabled.value,
  (v) => {
    if (!v) {
      draftWatermarkFile.value = ''
    }
  }
)
</script>
