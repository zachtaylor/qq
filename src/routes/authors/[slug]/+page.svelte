<script lang="ts">
	import { page } from '$app/state';
	import { fetchAuthorBySlug } from '$lib/api/authors';
	import { fetchQuotesByAuthor } from '$lib/api/quotes';
	import QuoteList from '$lib/components/QuoteList.svelte';

	let slug = $derived(page.params.slug!);
	let authorPromise = $derived(fetchAuthorBySlug(slug));
</script>

{#await authorPromise then author}
	{#if author}
		<div class="mb-6 flex flex-col items-center text-center">
			{#if author.portrait_url}
				<img
					src={author.portrait_url}
					alt={author.name}
					class="mb-3 h-24 w-24 rounded-full object-cover ring-1 ring-stone-200"
				/>
			{/if}
			<h1 class="text-2xl font-bold text-stone-900">{author.name}</h1>
			{#if author.born_year}
				<p class="text-sm text-stone-400">
					{author.born_year}{author.died_year ? `–${author.died_year}` : ''}
				</p>
			{/if}
			{#if author.bio}
				<p class="mt-2 max-w-sm text-sm text-stone-600">{author.bio}</p>
			{/if}
		</div>
		<QuoteList load={() => fetchQuotesByAuthor(author.id)} />
	{:else}
		<p class="py-12 text-center text-sm text-stone-400">Author not found.</p>
	{/if}
{/await}
