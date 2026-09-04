<script lang="ts">
  import { fetchTrending } from '$lib/api/quotes'
  import QuoteFeed from '$lib/components/QuoteFeed.svelte'

  let {
    active = true,
    scrollToTopSignal = 0,
  }: { active?: boolean; scrollToTopSignal?: number } = $props()
</script>

<QuoteFeed
  load={() => fetchTrending()}
  empty="Nothing trending yet."
  feedKey="trending"
  {active}
  {scrollToTopSignal}
/>
