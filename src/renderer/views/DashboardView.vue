<template>
	<CardContainer class="overflow-y-auto h-full min-h-0">
		<template #header>
			<!-- Top buttons -->
			<div class="flex justify-center gap-4">
				<button class="btn btn-primary px-6 py-3">New Collaborator</button>
				<button class="btn btn-primary px-6 py-3">Manage Collaborators</button>
				<button class="btn btn-primary px-6 py-3">New Share</button>
				<button class="btn btn-primary px-6 py-3">Manage Shares</button>
			</div>
		</template>
		<div class="flex flex-1 flex-col h-full items-stretch justify-center gap-6">
			<!-- Active links table -->
			<div class="bg-primary p-2 rounded-lg border border-default">
				<h2 class="text-center font-semibold text-lg mb-2">Currently Active Links</h2>
				<div class="overflow-x-auto bg-accent rounded-md p-1">
					<table class="min-w-full text-sm text-left">
						<thead class="sticky top-0 bg-accent">
							<tr class="border-b border-default">
								<th class="px-2 py-1">Name</th>
								<th class="px-2 py-1">Organization</th>
								<th class="px-2 py-1">Files</th>
								<th class="px-2 py-1">Expires</th>
								<th class="px-2 py-1 text-center">Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="link in activeLinks" :key="link.id" class="border-b border-default">
								<td class="px-2 py-2">{{ link.name }}</td>
								<td class="px-2 py-2">{{ link.org }}</td>
								<td class="px-2 py-2">{{ link.files }} File<span v-if="link.files > 1">s</span></td>
								<td class="px-2 py-2">
									<span :class="{
										'text-red-500 font-bold': link.expiresIn.includes('1 Day'),
										'font-bold': true
									}">
										{{ link.expiresIn }}
									</span>
								</td>
								<td class="px-2 py-2 flex gap-2 justify-center">
									<button class="bg-purple-700 text-white px-4 py-1 rounded">View</button>
									<button class="bg-red-600 text-white px-4 py-1 rounded">KILL</button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>


		</div>
		<template #footer>
			<!-- Bottom buttons -->
			<div class="flex justify-center gap-6">
				<button @click="leaveServer" class="bg-red-500 text-white px-6 py-3 rounded-lg w-40 h-16">Log
					Out</button>
				<button class="bg-purple-700 text-white px-6 py-3 rounded-lg w-40 h-16">View Logs</button>
				<button class="bg-purple-700 text-white px-6 py-3 rounded-lg w-40 h-16">Settings</button>
			</div>
		</template>
	</CardContainer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CardContainer from '../components/CardContainer.vue'
import { useHeader } from '../composables/useHeader'
import { router } from '../../app/routes'

useHeader('Dashboard')

// Dummy data until API wiring
const activeLinks = ref([
	{ id: 1, name: 'Timmy Johnson', org: 'FoxNews', files: 4, expiresIn: '6 Days' },
	{ id: 2, name: 'David Zaslav', org: 'WarnerMedia', files: 1, expiresIn: '3 Days' },
	{ id: 3, name: 'Donald Trump', org: 'FakeNews', files: 2, expiresIn: '1 Day' },
	{ id: 4, name: 'Jimmy Smith', org: 'FoxNews', files: 1, expiresIn: '3 Days' },
	{ id: 5, name: 'Harry Potter', org: 'Ministry of Magic', files: 7, expiresIn: '6 Days' },
	{ id: 6, name: 'Chris Hansen', org: 'Dateline NBC', files: 1, expiresIn: '2 Weeks' },
	{ id: 7, name: 'Snuffaluffagus', org: 'PBS', files: 1, expiresIn: '3 Days' },
])

const leaveServer = () => {
	router.push({ name: 'server-selection'});
}
</script>
