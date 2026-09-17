<script lang="ts">
  import { fetchTrending, getCachedTrending } from '$lib/api/quotes'
  import QuoteFeed from '$lib/components/QuoteFeed.svelte'

  let {
    active = true,
    scrollToTopSignal = 0,
    refreshSignal = 0,
  }: {
    active?: boolean
    scrollToTopSignal?: number
    refreshSignal?: number
  } = $props()
</script>

<QuoteFeed
  load={() => fetchTrending()}
  preload={() => getCachedTrending()}
  empty="Nothing trending yet."
  feedKey="trending"
  {active}
  {scrollToTopSignal}
  {refreshSignal}
/>
