<script lang="ts">
	import type { Quote } from '$lib/types';
	import QuoteCard from './QuoteCard.svelte';

	let { load, empty = 'No quotes yet.' }: { load: () => Promise<Quote[]>; empty?: string } =
		$props();
</script>

{#await load()}
	<p class="py-12 text-center text-sm text-stone-400">Loading…</p>
{:then quotes}
	{#if quotes.length === 0}
		<p class="py-12 text-center text-sm text-stone-400">{empty}</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each quotes as quote (quote.id)}
				<QuoteCard {quote} />
			{/each}
		</div>
	{/if}
{:catch err}
	<p class="py-12 text-center text-sm text-red-500">Failed to load: {err.message}</p>
{/await}
