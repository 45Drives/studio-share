<template>
	<CardContainer class="overflow-y-auto h-full min-h-0">
		<template #header>
			<!-- Top buttons -->
			<div class="flex justify-center gap-4">
				<button @click="goToShareFiles" class="btn btn-primary px-6 py-3">New Link</button>
				<button @click="goToUploadFiles" class="btn btn-primary px-6 py-3">Upload Files</button>
				<button @click="goToClientUploadLocation" class="btn btn-primary px-6 py-3">Client Upload
					Location</button>
				<button @click="goToUploadFilesViaLinks" class="btn btn-primary px-6 py-3">Upload Files via
					Links</button>
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
				<!-- <button @click="viewLogs" class="btn-primary text-white px-6 py-3 rounded-lg w-40 h-16">View Logs</button>
				<button @click="viewSettings" class="btn-primary text-white px-6 py-3 rounded-lg w-40 h-16">Settings</button> -->
			</div>
		</template>
	</CardContainer>
</template>

<script setup lang="ts">
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { router } from '../../app/routes'
import ManageLinks from './ManageLinks.vue'

useHeader('Dashboard')

const leaveServer = () => {
	router.push({ name: 'server-selection'});
}

const goToShareFiles = () => {
	router.push({ name: 'select-file'})
}

const goToUploadFiles = () => {
	router.push({ name: 'upload-file'});
}

const goToClientUploadLocation = () => {
	router.push({ name: 'client-upload-location' });
}

const goToUploadFilesViaLinks = () => {
	router.push({ name: 'upload-destination' });
}

</script>
