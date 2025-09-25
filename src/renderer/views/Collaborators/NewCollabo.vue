<template>
    <div class="h-full flex items-start justify-center pt-10">
        <div class="grid grid-cols-2 gap-10 text-xl w-10/12 mx-auto">

            <!-- Left: Collaborator form -->
            <CardContainer class="col-span-1 bg-accent rounded-lg p-6 border border-default text-left space-y-6">
                <section class="space-y-4">
                    <!-- Name -->
                    <div class="grid grid-cols-[120px_1fr] items-center">
                        <label class="font-semibold text-default">Name</label>
                        <input v-model="form.name" class="input" placeholder="Enter name" />
                    </div>

                    <!-- Company -->
                    <div class="grid grid-cols-[120px_1fr] items-center">
                        <label class="font-semibold text-default">Company</label>
                        <input v-model="form.company" class="input" placeholder="Enter company" />
                    </div>

                    <!-- Email -->
                    <div class="grid grid-cols-[120px_1fr] items-center">
                        <label class="font-semibold text-default">Email</label>
                        <input v-model="form.email" type="email" class="input" placeholder="Enter email" />
                    </div>

                    <!-- Password -->
                    <div class="grid grid-cols-[120px_1fr] items-center">
                        <label class="font-semibold text-default">Password</label>
                        <div class="flex items-center gap-2">
                            <div class="w-full relative">
                                <input v-model="form.password" :type="showPassword ? 'text' : 'password'" class="input"
                                    placeholder="••••••••" />
                                <button type="button" @click="togglePassword"
                                    class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                                    <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                                    <EyeSlashIcon v-else class="w-5 h-5" />
                                </button>
                            </div>
                            <button type="button" class="btn btn-secondary text-sm px-3" @click="generatePassword">
                                Generate
                            </button>
                        </div>
                    </div>

                    <!-- Notes -->
                    <div class="grid grid-cols-[120px_1fr] items-center">
                        <label class="font-semibold text-default">Notes</label>
                        <textarea v-model="form.note" type="text" rows="3"
                            class="bg-default rounded-lg text-default px-4 border border-default w-full"
                            placeholder="Enter notes (optional)" />
                    </div>

                    <!-- Active/Suspended -->
                    <div class="flex items-center gap-4">
                        <span :class="{ 'text-muted': form.active, 'text-45d': !form.active }">Suspended</span>
                        <Switch v-model="form.active"
                            :class="[form.active ? 'bg-secondary' : 'bg-well', 'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2']">
                            <span class="sr-only">Use setting</span>
                            <span aria-hidden="true"
                                :class="[form.active ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out']" />
                        </Switch>
                        <span :class="{ 'text-muted': !form.active, 'text-success': form.active }">Active</span>
                    </div>

                    <!-- Save -->
                    <div class="pt-4">
                        <button @click="saveCollaborator" class="btn btn-primary w-full">
                            Save Collaborator
                        </button>
                    </div>
                </section>
            </CardContainer>

            <!-- Right: Shares + permissions -->
            <CardContainer class="col-span-1 bg-primary rounded-lg p-6 border border-default text-left space-y-6">
                <section class="space-y-4">
                    <h2 class="text-lg font-semibold text-default">Add To Existing Share</h2>

                    <!-- Search -->
                    <div class="flex items-center gap-2">
                        <input v-model="search" placeholder="Search for share" class="input flex-1" />
                        <button class="btn btn-secondary whitespace-nowrap">Add to Share</button>
                    </div>

                    <!-- Shares list -->
                    <div class="bg-default rounded-lg overflow-y-auto p-2 max-h-48">
                        <ul class="space-y-2">
                            <li v-for="share in filteredShares" :key="share.id"
                                class="flex items-center justify-between p-2 bg-accent rounded">
                                <span>{{ share.name }}</span>
                                <button class="btn btn-secondary btn-sm" @click="addToShare(share)">Select</button>
                            </li>
                        </ul>
                    </div>

                    <!-- Extra action -->
                    <button class="btn btn-secondary w-full">New Share</button>

                    <!-- Permissions -->
                    <div class="grid grid-cols-2 gap-4 bg-secondary/60 p-4 rounded-lg">
                        <label v-for="perm in permissions" :key="perm" class="flex items-center gap-2">
                            <input type="checkbox" v-model="form.permissions" :value="perm" class="input-checkbox" />
                            <span>{{ perm }}</span>
                        </label>
                    </div>
                </section>
            </CardContainer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Switch } from '@headlessui/vue';
import { EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid"
import CardContainer from '../../components/CardContainer.vue'
import { useHeader } from '../../composables/useHeader';
useHeader('New Collaborator')
const form = ref({
    name: "",
    company: "",
    email: "",
    password: "",
    note: "",
    active: true,
    permissions: [] as string[]
})

const showPassword = ref(false)
const togglePassword = () => showPassword.value = !showPassword.value

function generatePassword() {
    form.value.password = Math.random().toString(36).slice(-10)
}
function saveCollaborator() {
    console.log("Saving collaborator", form.value)
}
function addToShare(share: { id: number; name: string }) {
    console.log("Adding collaborator to share:", share)
}

const search = ref("")
const shares = ref([
    { id: 1, name: "Fox News" },
    { id: 2, name: "WarnerMedia" },
    { id: 3, name: "Jimmy’s Share" },
])
const filteredShares = computed(() =>
    shares.value.filter(s => s.name.toLowerCase().includes(search.value.toLowerCase()))
)

const permissions = [
    "View",
    "Edit",
    "Comment",
    "Download",
    "Upload",
    "Watermark",
    "No Timeout"
]
</script>

<style scoped>
.input {
    @apply bg-default h-[3rem] rounded-lg text-default px-4 border border-default w-full;
}

.input-checkbox {
    @apply h-4 w-4 rounded border border-default;
}
</style>
