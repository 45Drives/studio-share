<template>
	<CardContainer class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<h2 class="dashboard-title">Control Center</h2>
					<p class="dashboard-subtitle">Create links, monitor activity, and manage access from one place.</p>
				</div>

				<div class="dashboard-utility button-group-row">
					<button @click="goToManageUsers" class="btn btn-secondary px-5 py-2.5">Manage Users</button>
					<button @click="goToLogs" class="btn btn-secondary px-5 py-2.5">View Logs</button>
					<button @click="goToSettings" class="btn btn-secondary px-5 py-2.5">Settings</button>
				</div>
			</div>

			<div class="dashboard-actions">
				<button @click="goToShareFiles" class="btn btn-primary dashboard-action">
					<span class="dashboard-action-title">New File Share Link</span>
					<span class="dashboard-action-copy">Generate a secure download or review link.</span>
				</button>
				<button @click="goToUploadFiles" class="btn btn-primary dashboard-action">
					<span class="dashboard-action-title">Upload Files Locally</span>
					<span class="dashboard-action-copy">Send files from this workstation to the server.</span>
				</button>
				<button @click="goToLinkUploadPanel" class="btn btn-primary dashboard-action">
					<span class="dashboard-action-title">New Upload Link</span>
					<span class="dashboard-action-copy">Create an intake link for collaborators.</span>
				</button>
			</div>
		</template>

		<div class="dashboard-links-wrap">
			<ManageLinks/>
		</div>

		<template #footer>
			<div class="dashboard-footer">
				<button @click="leaveServer" class="btn btn-danger px-6 py-2.5 rounded-md">
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

<style scoped>
.dashboard-shell {
	--local-border: color-mix(in srgb, var(--btn-primary-bg) 28%, #545463);
	background: color-mix(in srgb, var(--ui-panel-bg) 0%, transparent) !important;
}

.dashboard-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem;
	justify-content: space-between;
	margin-bottom: 0.9rem;
}

.dashboard-intro {
	min-width: 0;
}

.dashboard-title {
	font-size: 1.3rem;
	line-height: 1.2;
	font-weight: 700;
}

.dashboard-subtitle {
	margin-top: 0.2rem;
	font-size: 0.9rem;
	opacity: 0.95;
}

.dashboard-utility {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.95rem;
}

.dashboard-action {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	text-align: left;
	gap: 0.25rem;
	padding: 0.8rem 0.95rem;
	border: 1px solid var(--local-border);
	border-radius: 0.72rem;
}

.dashboard-action-title {
	font-size: 0.95rem;
	font-weight: 700;
	line-height: 1.25;
}

.dashboard-action-copy {
	font-size: 0.76rem;
	line-height: 1.3;
	opacity: 0.86;
}

.dashboard-links-wrap {
	border: 1px solid var(--local-border);
	border-radius: 0.85rem;
	padding: 0.45rem;
	background: color-mix(in srgb, var(--btn-primary-bg) 8%, transparent);
}

.dashboard-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

@media (max-width: 1100px) {
	.dashboard-actions {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 780px) {
	.dashboard-actions {
		grid-template-columns: minmax(0, 1fr);
	}

	.dashboard-title {
		font-size: 1.15rem;
	}
}
</style>
