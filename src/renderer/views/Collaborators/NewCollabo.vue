<template>
    <CardContainer>
        <!-- Main form -->
        <div class="w-10/12 mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left: Collaborator info -->
            <section class="bg-accent rounded-lg p-6 border border-default space-y-4 text-left">
                <div class="grid grid-cols-[120px_1fr] items-center">
                    <label class="font-semibold text-default">Name</label>
                    <input v-model="form.name" class="input" placeholder="Enter name" />
                </div>

                <div class="grid grid-cols-[120px_1fr] items-center">
                    <label class="font-semibold text-default">Company</label>
                    <input v-model="form.company" class="input" placeholder="Enter company" />
                </div>

                <div class="grid grid-cols-[120px_1fr] items-center">
                    <label class="font-semibold text-default">Email</label>
                    <input v-model="form.email" type="email" class="input" placeholder="Enter email" />
                </div>

                <div class="grid grid-cols-[120px_1fr] items-center">
                    <label class="font-semibold text-default">Password</label>
                    <div class="flex items-center gap-2">
                        <input v-model="form.password" type="password" class="input flex-1"
                            placeholder="Enter password" />
                        <button type="button" class="btn btn-secondary text-sm px-3" @click="generatePassword">
                            Generate
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-4">
                    <span :class="{ 'text-muted': form.active }">Inactive</span>
                    <Switch v-model="form.active"
                        :class="[form.active ? 'bg-secondary' : 'bg-well', 'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2']">
                        <span class="sr-only">Use setting</span>
                        <span aria-hidden="true"
                            :class="[form.active ? 'translate-x-5' : 'translate-x-0', 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out']" />
                    </Switch>
                    <span :class="{ 'text-muted': !form.active }">Active</span>
                </div>

                <div class="pt-4">
                    <button @click="saveCollaborator" class="btn btn-primary w-full">
                        Save Collaborator
                    </button>
                </div>
            </section>

            <!-- Right: Add to share -->
            <section class="bg-primary/80 rounded-lg p-6 border border-default space-y-4">
                <h2 class="text-lg font-semibold text-white">Add To Existing Share</h2>
                <input v-model="search" placeholder="Search for share" class="input w-full" />
                <div class="h-48 bg-default rounded-lg overflow-y-auto p-2">
                    <ul class="space-y-2">
                        <li v-for="share in filteredShares" :key="share.id"
                            class="flex items-center justify-between p-2 bg-accent rounded">
                            <span>{{ share.name }}</span>
                            <button class="btn btn-secondary btn-sm" @click="addToShare(share)">Add</button>
                        </li>
                    </ul>
                </div>
            </section>
        </div>
    </CardContainer>
</template>

<script setup lang="ts">
import { ref, computed, inject } from "vue";
import { Switch } from '@headlessui/vue';
import { CardContainer, DynamicBrandingLogo } from "@45drives/houston-common-ui";
import { divisionCodeInjectionKey } from "../../keys/injection-keys";
import { useHeader } from "../../composables/useHeader";
useHeader('New Collaborator');

const division = inject(divisionCodeInjectionKey);

const form = ref({
    name: "",
    company: "",
    email: "",
    password: "",
    active: true,
});

const search = ref("");
const shares = ref([
    { id: 1, name: "Project Alpha" },
    { id: 2, name: "Project Beta" },
    { id: 3, name: "Project Gamma" },
]);

const filteredShares = computed(() =>
    shares.value.filter((s) =>
        s.name.toLowerCase().includes(search.value.toLowerCase())
    )
);

function generatePassword() {
    form.value.password = Math.random().toString(36).slice(-10);
}

function saveCollaborator() {
    console.log("Saving collaborator", form.value);
}

function addToShare(share: { id: number; name: string }) {
    console.log("Adding collaborator to share:", share);
}
</script>

<style scoped>
.input {
    @apply bg-default h-[3rem] rounded-lg text-default px-4 border border-default;
}
</style>
