<template>
	<CardContainer class="overflow-y-auto h-full min-h-0">
		<template #header>
			<!-- Top buttons -->
			<div class="relative flex items-center w-full">
				<div class="absolute left-1/2 -translate-x-1/2 flex gap-4">
					<button @click="goToShareFiles" class="btn btn-primary px-6 py-3">New File Share Link</button>
					<button @click="goToUploadFiles" class="btn btn-primary px-6 py-3">Upload Files Locally</button>
					<button @click="goToLinkUploadPanel" class="btn btn-primary px-6 py-3">New Upload Link</button>
				</div>

				<div class="ml-auto">
					<button @click="goToSettings" title="Settings">
						<Cog6ToothIcon class="w-8 h-8 text-muted hover:text-primary" />
					</button>
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
				<!-- <button @click="viewLogs" class="btn-primary text-white px-6 py-3 rounded-lg w-40 h-16">View Logs</button> -->
				<!-- <button @click="goToSettings" class="btn-primary text-white px-6 py-3 rounded-lg w-40 h-16">Settings</button> -->
			</div>
		</template>
	</CardContainer>
	<SettingsModal v-if="showSettings" @close="showSettings = false" />

</template>

<script setup lang="ts">
import { CardContainer } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import { Cog6ToothIcon } from '@heroicons/vue/24/solid'
import { ref } from 'vue'

useHeader('Dashboard')
const { to } = useResilientNav()

const leaveServer = () => {
	// router.push({ name: 'server-selection'});
	to('server-selection');
}

const showSettings = ref(false);
const goToSettings = () => {
	showSettings.value = true;
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
