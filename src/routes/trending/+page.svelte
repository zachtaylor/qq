<script lang="ts">
	import { fetchTrending } from '$lib/api/quotes';
	import QuoteList from '$lib/components/QuoteList.svelte';
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">Trending</h1>
<QuoteList load={() => fetchTrending()} empty="Nothing trending yet." />
