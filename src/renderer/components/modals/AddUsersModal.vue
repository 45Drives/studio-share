<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close()"></div>

    <div class="relative w-full max-w-3xl bg-accent rounded-lg shadow-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Give comment access</h3>

        <button class="btn btn-secondary" @click="close()">Close</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Existing users -->
        <div class="border rounded p-3 bg-accent/60">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold text-sm">Select existing users</div>
            <input type="text" v-model.trim="userSearch"
              class="input-textlike border rounded px-2 py-1 text-sm bg-transparent"
              placeholder="Search by name/username/email" @input="debouncedFetchUsers()" />
          </div>

          <div class="max-h-64 overflow-auto border rounded">
            <div v-for="u in users" :key="u.id ?? u.username"
              class="flex items-center justify-between px-3 py-2 border-b border-default text-sm">
              <label class="flex items-center gap-2 cursor-pointer" @click.stop>
                <input type="checkbox" :value="userKey(u)" v-model="selectedKeys" />
                <span class="inline-block h-3 w-3 rounded-full"
                  :style="{ backgroundColor: u.display_color || '#999' }"></span>
                <div class="flex flex-col">
                  <span class="font-medium">{{ u.name || u.username }}</span>
                  <span class="opacity-70">
                    @{{ u.username }}
                    <span v-if="u.user_email">• {{ u.user_email }}</span>
                  </span>
                </div>
              </label>

              <!-- Actions -->
              <div class="flex items-center gap-2">
                <button class="px-2 py-1 text-xs border rounded hover:opacity-80" @click.stop="startEdit(u)"
                  title="Edit user">
                  <FontAwesomeIcon :icon="faEdit" />
                </button>
                <button class="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-600/10"
                  @click.stop="deleteUser(u)" title="Delete user">
                  <FontAwesomeIcon :icon="faTrash" />
                </button>
              </div>
            </div>
            <div v-if="!users.length" class="px-3 py-2 text-sm opacity-70">No users.</div>
          </div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-secondary" @click="selectAll()" :disabled="!users.length">Select all</button>
            <button class="btn btn-secondary" @click="clearSelected()" :disabled="!selectedKeys.length">
              Clear
            </button>
          </div>
        </div>

        <!-- Create new user -->

        <div>
          <button v-if="!showCreate"
            class="px-3 py-2 rounded bg-[#5E56C5] text-white hover:bg-[#4d46a8] focus:outline-none focus:ring-2 focus:ring-[#5E56C5]/40 active:bg-[#433e97] transition"
            @click="openCreate()">Create new user</button>
          <button v-else
            class="px-3 py-2 rounded bg-[#E74C3C] text-white hover:bg-[#c0392b] focus:outline-none focus:ring-2 focus:ring-[#E74C3C]/40 active:bg-[#a93226] transition"
            @click="closeCreate()">
            Close create form
          </button>
        </div>
        <div v-if="showCreate" class="border rounded p-3 bg-accent/60">
          <div class="font-semibold text-sm mb-2">Create new user</div>
          <div class="flex flex-col gap-2">
            <div class="text-xs opacity-70 mb-1">A temporary PIN is required. Share it securely with the user.</div>
            <div>
              <label class="text-xs opacity-80">Name <span class="text-red-500">*</span></label>
              <input type="text" v-model.trim="newUser.name"
                class="input-textlike border rounded px-3 py-2 w-full bg-transparent" placeholder="Jane Doe" />
            </div>
            <div>
              <label class="text-xs opacity-80">Username <span class="text-red-500">*</span></label>
              <input type="text" v-model.trim="newUser.username"
                class="input-textlike border rounded px-3 py-2 w-full bg-transparent" placeholder="jane" />
            </div>
            <div>
              <label class="text-xs opacity-80">Email (optional)</label>
              <input type="email" v-model.trim="newUser.user_email"
                class="input-textlike border rounded px-3 py-2 w-full bg-transparent" placeholder="jane@example.com" />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label class="text-xs opacity-80">Temporary PIN <span class="text-red-500">*</span></label>
                <input type="password" inputmode="numeric" pattern="\d*" v-model.trim="tempPin"
                  :class="['input-textlike border rounded px-3 py-2 w-full bg-transparent', (pinFormatInvalid ? 'border-red-500' : '')]"
                  placeholder="4–8 digits" aria-invalid="true"
                  v-bind="pinFormatInvalid ? { 'aria-describedby': 'pin-format-error' } : {}" />
                <p v-if="pinFormatInvalid" id="pin-format-error" class="mt-1 text-xs text-red-500">PIN must be 4–8
                  digits.</p>
              </div>
              <div>
                <label class="text-xs opacity-80">Confirm PIN <span class="text-red-500">*</span></label>
                <input type="password" inputmode="numeric" pattern="\d*" v-model.trim="tempPinConfirm"
                  :class="['input-textlike border rounded px-3 py-2 w-full bg-transparent', (pinMismatch ? 'border-red-500' : '')]"
                  placeholder="Re-enter PIN" aria-invalid="true"
                  v-bind="pinMismatch ? { 'aria-describedby': 'pin-mismatch-error' } : {}" />
                <p v-if="pinMismatch" id="pin-mismatch-error" class="mt-1 text-xs text-red-500">PINs do not match.</p>
              </div>
            </div>
            <div>
              <label class="text-xs opacity-80">Comment color</label>
              <div class="flex items-center gap-2">
                <input type="color" v-model="newUser.display_color" class="h-8 w-10 p-0 bg-transparent border rounded"
                  title="Pick a color" />
                <input type="text" v-model.trim="newUser.display_color"
                  class="input-textlike border rounded px-3 py-2 w-full bg-transparent" placeholder="#aabbcc" />
              </div>
              <div class="text-xs opacity-70 mt-1">Used to tint this user’s comments.</div>
            </div>

            <div class="flex gap-2 mt-2">
              <button class="btn btn-primary" @click="createUser()" :disabled="!canSubmit">Create & Select</button>
              <button class="btn btn-secondary" @click="resetNewUser()">Reset</button>
            </div>

            <div v-if="error" class="text-sm text-red-500">{{ error }}</div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="close()">Cancel</button>
        <button class="btn btn-primary" @click="apply()">Add to link</button>
      </div>
    </div>
  </div>

  <!-- Edit modal -->
  <div v-if="editing" class="fixed inset-0 z-[60] flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="editing = null"></div>
    <div class="relative w-full max-w-md bg-accent rounded-lg shadow-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Edit user</h3>
        <button class="btn btn-secondary" @click="editing = null">Close</button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="text-xs opacity-80">Username</label>
          <input class="input-textlike border rounded px-3 py-2 w-full bg-gray-600/20 opacity-70"
            :value="editing.username" disabled />
        </div>
        <div>
          <label class="text-xs opacity-80">Name</label>
          <input v-model.trim="editForm.name" class="input-textlike border rounded px-3 py-2 w-full bg-transparent" />
        </div>
        <div>
          <label class="text-xs opacity-80">Email</label>
          <input v-model.trim="editForm.user_email" type="email"
            class="input-textlike border rounded px-3 py-2 w-full bg-transparent" />
        </div>
        <div>
          <label class="text-xs opacity-80">Comment color</label>
          <div class="flex items-center gap-2">
            <input type="color" v-model="editForm.display_color" class="h-8 w-10 p-0 bg-transparent border rounded" />
            <input v-model.trim="editForm.display_color"
              class="input-textlike border rounded px-3 py-2 w-full bg-transparent" />
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="editing = null">Cancel</button>
        <button class="btn btn-primary" @click="saveEdit()">Save</button>
      </div>
    </div>
  </div>
  <ConfirmDeleteModal v-model="deleteOpen" :title="'Delete user'"
    :message="userToDelete ? `Delete “${userToDelete.name || userToDelete.username}”? This cannot be undone.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete"
    cancelText="Cancel" @confirm="performDelete" />

</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faTrash, faEdit } from '@fortawesome/free-solid-svg-icons';
export type ExistingUser = { id?: string | number; username: string; name?: string; user_email?: string; display_color?: string }
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

const props = defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
  preselected?: ExistingUser[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'apply', users: ExistingUser[]): void
}>()

// UI state
const userSearch = ref('')
const users = ref<ExistingUser[]>([])
const selectedKeys = ref<string[]>([])

const newUser = ref<ExistingUser>({ username: '', name: '', user_email: '', display_color: randomPastel() })
const error = ref('')
const tempPin = ref('')
const tempPinConfirm = ref('')
const showCreate = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const userToDelete = ref<ExistingUser | null>(null)

// Edit state
const editing = ref<ExistingUser | null>(null)
const editForm = ref<{ name: string; user_email: string; display_color: string }>({
  name: '',
  user_email: '',
  display_color: '#999999',
})

const canSubmit = computed(() => {
  const u = (newUser.value.username || '').trim()
  const p = tempPin.value.trim()
  const c = tempPinConfirm.value.trim()
  return !!u && /^\d{4,8}$/.test(p) && p === c
})
const pinMismatch = computed(() => {
  const p = tempPin.value.trim()
  const c = tempPinConfirm.value.trim()
  return p.length > 0 && c.length > 0 && p !== c
})
const pinFormatInvalid = computed(() => {
  const p = tempPin.value.trim()
  return p.length > 0 && !/^\d{4,8}$/.test(p)
})
watch([tempPin, tempPinConfirm], () => {
  if (error.value) error.value = ''
})

// lifecycle
onMounted(() => {
  if (props.modelValue) fetchUsers()
})

watch(
  () => props.modelValue,
  v => {
    if (v) {
      userSearch.value = ''
      error.value = ''
      selectedKeys.value = (props.preselected || [])
      .map(p => userKey(p))
       .filter(Boolean)
      fetchUsers()
    }
  }
)

// API helpers
function userKey(u: ExistingUser) {
  return u.id != null ? String(u.id) : (u.username || '').toLowerCase()
}

async function fetchUsers() {
  try {
    const q = userSearch.value ? `?q=${encodeURIComponent(userSearch.value)}` : ''
    const data = await props.apiFetch(`/api/users${q}`, { method: 'GET' })
    users.value = Array.isArray(data) ? data : []
    // ensure selected keys still exist; keep them even if not in the current page
    selectedKeys.value = Array.from(new Set(selectedKeys.value))
  } catch {
    users.value = []
  }
}

let t: any = null
function debouncedFetchUsers() {
  if (t) clearTimeout(t)
  t = setTimeout(fetchUsers, 250)
}

async function createUser() {
  error.value = ''
  const payload: any = {
    username: newUser.value.username.trim(),
    name: (newUser.value.name || '').trim(),
    user_email: (newUser.value.user_email || '').trim() || undefined,
    display_color: normalizeHex(newUser.value.display_color) || randomPastel(),
  }
  if (!payload.username) {
    error.value = 'Username is required.'
    return
  }

  const pin = tempPin.value.trim()
  const pin2 = tempPinConfirm.value.trim()
  if (!/^\d{4,8}$/.test(pin)) {
    error.value = 'Temporary PIN must be 4–8 digits.'
    return
  }
  if (pin !== pin2) {
    error.value = 'PINs do not match.'
    return
  }

  payload.pin = pin
  payload.temporary_pin = pin

  try {
    const created = await props.apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    // set the PIN (best-effort)
    try {
      await props.apiFetch(`/api/users/${created.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ new_pin: pin }),
      })
    } catch {}

    const u: ExistingUser = {
      id: created.id,
      username: created.username || payload.username,
      name: created.name ?? payload.name,
      user_email: created.user_email ?? payload.user_email,
      display_color: created.display_color ?? payload.display_color,
    }
    const k = userKey(u)           // <- one canonical key
if (!selectedKeys.value.includes(k)) {
  selectedKeys.value.push(k)   // <- push the same canonical key
}
    await fetchUsers()
    resetNewUser()
  } catch (e: any) {
    error.value = e?.message || 'Failed to create user.'
  }
}

// Edit / Delete helpers
function startEdit(u: ExistingUser) {
  editing.value = u
  editForm.value = {
    name: u.name || '',
    user_email: u.user_email || '',
    display_color: normalizeHex(u.display_color) || '#999999',
  }
}

async function saveEdit() {
  if (!editing.value) return
  try {
   const id = Number(editing.value.id)
   if (!Number.isFinite(id)) throw new Error('Missing numeric user id')

   const payload: any = {}
      if (editForm.value.name.trim() !== (editing.value.name || '')) {
        payload.name = editForm.value.name.trim()
      }
      const newEmail = editForm.value.user_email.trim() || null
      if ((newEmail || null) !== (editing.value.user_email ?? null)) {
        payload.user_email = newEmail
      }
      const newColor = normalizeHex(editForm.value.display_color)
      if (newColor && newColor !== (editing.value.display_color || null)) {
        payload.display_color = newColor
      }
   await props.apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    await fetchUsers()
    editing.value = null
  } catch (e: any) {
    error.value = e?.message || 'Failed to update user.'
  }
}


async function deleteUser(u: ExistingUser) {
  openDelete(u)
}

function openDelete(u: ExistingUser) {
  userToDelete.value = u
  deleteError.value = null
  deleteOpen.value = true
}
async function performDelete() {
  if (!userToDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    const idOrUsername = userToDelete.value.id ?? userToDelete.value.username
    await props.apiFetch(`/api/users/${idOrUsername}`, { method: 'DELETE' })

    const k = userKey(userToDelete.value)
    selectedKeys.value = selectedKeys.value.filter(x => x !== k)

    await fetchUsers()
    deleteOpen.value = false
    userToDelete.value = null
  } catch (e: any) {
    deleteError.value = e?.message || 'Failed to delete user.'
  } finally {
    deleting.value = false
  }
}
// UX helpers
function selectAll() {
  selectedKeys.value = users.value.map(userKey).filter(Boolean)

}
function clearSelected() {
  selectedKeys.value = []
}

function resetNewUser() {
  newUser.value = { username: '', name: '', user_email: '', display_color: randomPastel() }
  tempPin.value = ''
  tempPinConfirm.value = ''
  error.value = ''
}

function close() {
  emit('update:modelValue', false)
}
function apply() {
  const byKey = (arr: ExistingUser[]) => {
    const m = new Map<string, ExistingUser>()
    arr.forEach(u => {
      const k = userKey(u)
      if (k) m.set(k, u)
    })
    return m
  }
  const mapUsers = byKey(users.value)
  const mapPre   = byKey(props.preselected || [])
  const chosen: ExistingUser[] = []
  for (const k of selectedKeys.value) {
    chosen.push(mapUsers.get(k) || mapPre.get(k)!)
  }
    emit('apply', chosen)
  close()
}

function openCreate() {
  showCreate.value = true
  // clear any stale values each time it opens
  resetNewUser()
}
function closeCreate() {
  showCreate.value = false
}

// utils
function randomPastel() {
  const h = Math.floor(Math.random() * 360)
  const s = 60 + Math.floor(Math.random() * 20)
  const l = 70 + Math.floor(Math.random() * 10)
  function h2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const H = h / 360,
    S = s / 100,
    L = l / 100
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const r = Math.round(h2rgb(p, q, H + 1 / 3) * 255)
  const g = Math.round(h2rgb(p, q, H) * 255)
  const b = Math.round(h2rgb(p, q, H - 1 / 3) * 255)
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function normalizeHex(x?: string) {
  const s = (x || '').trim()
  if (!s) return undefined
  const m = s.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
  if (!m) return undefined
  const v = m[1]
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v
  return `#${full.toLowerCase()}`
}
</script>
