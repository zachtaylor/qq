<script lang="ts">
	import {
		notificationsAvailable,
		scheduleDaily,
		cancelDaily,
		getDailyTime
	} from '$lib/notifications';

	let saved = getDailyTime();
	let enabled = $state(saved !== null);
	let hour = $state(saved?.hour ?? 9);
	let minute = $state(saved?.minute ?? 0);
	let status = $state('');
	const available = notificationsAvailable();

	async function apply() {
		status = '';
		if (enabled) {
			const ok = await scheduleDaily(hour, minute);
			status = ok ? 'Daily quote scheduled.' : 'Notification permission denied.';
		} else {
			await cancelDaily();
			status = 'Daily notification turned off.';
		}
	}
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">Settings</h1>

<section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
	<h2 class="mb-3 font-semibold text-stone-800">Daily quote notification</h2>

	{#if !available}
		<p class="text-sm text-stone-400">Available in the installed app (not in the browser).</p>
	{:else}
		<label class="mb-3 flex items-center gap-2 text-sm text-stone-700">
			<input type="checkbox" bind:checked={enabled} class="accent-accent" />
			Send me a quote every day
		</label>
		{#if enabled}
			<div class="mb-3 flex items-center gap-2 text-sm text-stone-700">
				<input
					type="number"
					min="0"
					max="23"
					bind:value={hour}
					class="w-16 rounded-lg border border-stone-300 p-2"
				/>
				:
				<input
					type="number"
					min="0"
					max="59"
					bind:value={minute}
					class="w-16 rounded-lg border border-stone-300 p-2"
				/>
				<span class="text-stone-400">(24h, device local time)</span>
			</div>
		{/if}
		<button
			onclick={apply}
			class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
		>
			Save
		</button>
		{#if status}
			<p class="mt-2 text-sm text-stone-500">{status}</p>
		{/if}
	{/if}
</section>
