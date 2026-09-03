<script lang="ts">
	import { submitQuote } from '$lib/api/quotes';
	import { goto } from '$app/navigation';

	let text = $state('');
	let authorName = $state('');
	let busy = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!text.trim() || !authorName.trim()) return;
		busy = true;
		error = '';
		try {
			await submitQuote(text.trim(), authorName.trim());
			text = '';
			authorName = '';
			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
		} finally {
			busy = false;
		}
	}
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">Submit a quote</h1>

<form onsubmit={handleSubmit} class="flex flex-col gap-4">
	<div>
		<label for="text" class="mb-1 block text-sm font-medium text-stone-700">Quote</label>
		<textarea
			id="text"
			bind:value={text}
			rows="4"
			required
			class="w-full rounded-xl border border-stone-300 p-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
			placeholder="Type the quote..."
		></textarea>
	</div>
	<div>
		<label for="author" class="mb-1 block text-sm font-medium text-stone-700">Author</label>
		<input
			id="author"
			bind:value={authorName}
			required
			class="w-full rounded-xl border border-stone-300 p-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
			placeholder="Who said it?"
		/>
	</div>
	{#if error}
		<p class="text-sm text-red-500">{error}</p>
	{/if}
	<button
		type="submit"
		disabled={busy}
		class="rounded-xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50"
	>
		{busy ? 'Submitting…' : 'Submit quote'}
	</button>
</form>
