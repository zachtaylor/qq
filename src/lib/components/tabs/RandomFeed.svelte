<script lang="ts">
  import { fetchRandomFeed, getCachedRandomFeed } from '$lib/api/quotes'
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
  load={() => fetchRandomFeed()}
  onRefresh={() => fetchRandomFeed(50, true)}
  preload={() => getCachedRandomFeed()}
  empty="No quotes yet."
  feedKey="random"
  {active}
  {scrollToTopSignal}
  {refreshSignal}
/>
