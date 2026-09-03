<script lang="ts">
	import { fetchFeed } from '$lib/api/quotes';
	import QuoteList from '$lib/components/QuoteList.svelte';
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">Feed</h1>
<QuoteList load={() => fetchFeed()} empty="No quotes yet. Be the first to submit one." />
