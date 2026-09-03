<script lang="ts">
	import { page } from '$app/state';
	import { fetchQuotesByTag } from '$lib/api/quotes';
	import QuoteList from '$lib/components/QuoteList.svelte';

	let slug = $derived(page.params.slug!);
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">#{slug}</h1>
<QuoteList load={() => fetchQuotesByTag(slug)} empty="No quotes tagged #{slug} yet." />
