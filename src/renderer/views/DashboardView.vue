<template>
	<CardContainer class="overflow-y-auto h-full min-h-0">
		<template #header>
			<!-- Top buttons -->
			<div class="relative flex items-center w-full">
				<div class="mr-auto button-group-row">
					<button @click="goToManageUsers" class="btn btn-secondary px-6 py-3">Manage Users</button>
				</div>

				<div class="absolute left-1/2 -translate-x-1/2 flex gap-4">
					<button @click="goToShareFiles" class="btn btn-primary px-6 py-3">New File Share Link</button>
					<button @click="goToUploadFiles" class="btn btn-primary px-6 py-3">Upload Files Locally</button>
					<button @click="goToLinkUploadPanel" class="btn btn-primary px-6 py-3">New Upload Link</button>
				</div>

				<div class="ml-auto  button-group-row">
					<button @click="goToLogs" class="btn btn-secondary px-6 py-3">View Logs</button>
					<button @click="goToSettings" class="btn btn-secondary px-6 py-3">Settings</button>
					
					<!-- <button @click="goToSettings" title="Settings">
						<Cog6ToothIcon class="w-8 h-8 text-muted hover:text-default"/>
					</button> -->
				</div>
			</div>
		</template>
		<div>
			<ManageLinks/>
		</div>
		<template #footer>
			<!-- Bottom buttons -->
			<div class="flex justify-start gap-6">
				<button @click="leaveServer" class="btn-danger text-default px-6 py-3 rounded-lg w-40 h-16">
					Log Out
				</button>
			</div>
		</template>
	</CardContainer>
	<SettingsModal v-if="showSettings" @close="showSettings = false" />
	<LogViewModal v-if="showLogs" @close="showLogs = false" />
	<AddUsersModal v-model="usersModalOpen" :apiFetch="apiFetch" />

</template>

<script setup lang="ts">
import { CardContainer } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import LogViewModal from '../components/modals/LogViewModal.vue'
// import { Cog6ToothIcon } from '@heroicons/vue/24/solid'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch } = useApi()

const leaveServer = () => {
	// router.push({ name: 'server-selection'});
	to('server-selection');
}

const showSettings = ref(false);
const goToSettings = () => {
	showSettings.value = true;
}

const showLogs = ref(false);
const goToLogs = () => {
	showLogs.value = true;
}

const usersModalOpen = ref(false);
const goToManageUsers = () => {
	usersModalOpen.value = true;
}

const goToShareFiles = () => {
	// router.push({ name: 'select-file'})
	to('select-file');
}

const goToUploadFiles = () => {
	// router.push({ name: 'upload-file'});
	to('upload-file');

}

const goToLinkUploadPanel = () => {
	// router.push({ name: 'create-upload-link' });
	to('create-upload-link');
}

</script>
