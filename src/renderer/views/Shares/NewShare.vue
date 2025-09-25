<!-- src/views/shares/NewShare.vue -->
<template>
    <div class="h-full flex items-start justify-center pt-10">
        <div class="grid grid-cols-2 gap-10 text-xl w-10/12 mx-auto">

            <!-- LEFT: Share form -->
            <CardContainer class="col-span-1 bg-accent rounded-lg p-6 border border-default text-left space-y-6">
                <section class="space-y-4">
                    <!-- Name -->
                    <div class="space-y-2">
                        <label class="font-semibold text-default block">Name</label>
                        <input v-model.trim="form.name" class="input" placeholder="Enter share name" />
                    </div>

                    <!-- Description -->
                    <div class="space-y-2">
                        <label class="font-semibold text-default block">Description</label>
                        <textarea v-model.trim="form.description" rows="2"
                            class="bg-default rounded-lg text-default px-4 py-3 border border-default w-full"
                            placeholder="Optional description" />
                    </div>

                    <!-- Paused / Active -->
                    <div class="flex items-center gap-5 pt-2">
                        <span :class="{ 'text-muted': form.active, 'text-45d': !form.active }">Paused</span>
                        <Switch v-model="form.active"
                            :class="[form.active ? 'bg-secondary' : 'bg-well',
                                'relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2']">
                            <span class="sr-only">Toggle active</span>
                            <span aria-hidden="true"
                                :class="[form.active ? 'translate-x-7' : 'translate-x-0',
                                    'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out']" />
                        </Switch>
                        <span :class="{ 'text-muted': !form.active, 'text-success': form.active }">Active</span>
                    </div>

                    <!-- Save -->
                    <div class="pt-8">
                        <button class="btn btn-primary w-56" @click="saveShare">Save Share</button>
                    </div>
                </section>
            </CardContainer>

            <!-- RIGHT: Items panel -->
            <CardContainer class="col-span-1 bg-primary rounded-lg p-0 border border-default">
                <section class="space-y-0">

                    <!-- Items list -->
                    <div class="p-2 bg-accent rounded-md">
                        <div class="p-4 space-y-2 max-h-96 overflow-y-auto">
                            <label v-for="item in items" :key="item.id"
                                class="flex items-center gap-2 rounded-lg px-6 py-4 transition-colors bg-secondary ring-2"
                                :class="isSelected(item.id) ? 'ring-[color:var(--outline-color)]' : 'ring-transparent'">
                                <input type="checkbox" v-model="selectedIds" :value="item.id"
                                    class="input-checkbox h-6 w-6" />
                                <div class="flex-1 text-white text-xl truncate">{{ item.path }}</div>
                            </label>


                            <!-- Empty state -->
                            <div v-if="items.length === 0"
                                class="text-center text-default/70 py-16 border border-dashed border-default rounded-lg">
                                No items yet. Click <span class="font-semibold">Select More Items</span> to add files or
                                folders.
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center justify-between mt-10">
                            <button class="btn btn-danger px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                :disabled="selectedIds.length === 0" @click="removeSelected">
                                Remove Selected Items
                            </button>

                            <button class="btn btn-secondary px-6 py-3" @click="selectMore">
                                Select More Items
                            </button>
                        </div>
                    </div>
                </section>
            </CardContainer>

            <div class="col-span-2 pt-4">
                <div class="button-group-row space-x-6">
                    <button @click="goBack" class="btn btn-danger w-full">
                        Cancel
                    </button>
                    <button @click="saveShare" class="btn btn-secondary w-full">
                        Save Share
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Switch } from '@headlessui/vue'
import CardContainer from '../../components/CardContainer.vue'
import { useHeader } from '../../composables/useHeader'
import { useDrafts } from '../../../stores/useDrafts'
import { router } from '../../../app/routes'

// page title like your other view
useHeader('New Share')
const drafts = useDrafts()

type ShareItem = {
    id: number
    path: string
}

const form = ref({
    name: '',
    description: '',
    active: true,
})

/** Seed data to match mockup look */
const items = ref<ShareItem[]>([
    { id: 1, path: '/tank/dozer/videos/raw-20250903.mp4' },
    { id: 2, path: '/tank/dozer/videos/raw-20250904-b.mp4' },
    { id: 3, path: '/tank/dozer/videos/b-roll/' },
    { id: 4, path: '/tank/dozer/art/coverimage.png' },
])

const isSelected = (id: number) => selectedIds.value.includes(id)

const selectedIds = ref<number[]>([])

onMounted(() => {
    const d = drafts.consumeShareDraft()
    if (d) {
        form.value = d.form
        items.value = d.items
        selectedUserIds.value = d.selectedUserIds
    }
})

type Collaborator = { id: number; name: string; company?: string; email?: string }

const users = ref<Collaborator[]>([
    { id: 101, name: 'Jane Cooper', company: 'Acme', email: 'jane@acme.com' },
    { id: 102, name: 'Sam Fields', company: 'Fox', email: 'sam@fox.com' },
    { id: 103, name: 'Jimmy Fallon', company: 'NBC', email: 'jimmy@nbc.com' },
])

const userSearch = ref('')
const filteredUsers = computed(() =>
    users.value.filter(u =>
        `${u.name} ${u.company ?? ''} ${u.email ?? ''}`.toLowerCase().includes(userSearch.value.toLowerCase())
    )
)

const selectedUserIds = ref<number[]>([])
const isUserSelected = (id: number) => selectedUserIds.value.includes(id)


function removeSelected() {
    const set = new Set(selectedIds.value)
    items.value = items.value.filter(i => !set.has(i.id))
    selectedIds.value = []
}

function selectMore() {
    // Hook up to your file picker / server browser later.
    // For now, add a dummy item to demonstrate flow:
    const nextId = (items.value.at(-1)?.id ?? 0) + 1
    items.value.push({ id: nextId, path: `/example/path/new-item-${nextId}.mp4` })
}

function saveShare() {
    // Wire up to your API
    console.log('Saving share', {
        ...form.value,
        items: items.value.map(i => i.path),
    })
}

function goBack() {
    router.push({ name: "dashboard" })
}

</script>

<style scoped>
.input {
    @apply bg-default h-[3rem] rounded-lg text-default px-4 border border-default w-full;
}

.input-checkbox {
    @apply rounded border border-default;
}

</style>
