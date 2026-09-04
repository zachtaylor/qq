<script lang="ts">
  import {
    fetchQuoteOfDayRange,
    getCachedQuoteOfDayRange,
  } from '$lib/api/quotes'
  import QuoteFeed from '$lib/components/QuoteFeed.svelte'

  function dayLabel(_quote: unknown, index: number): string {
    if (index === 0) return 'Today'
    if (index === 1) return 'Yesterday'
    const d = new Date()
    d.setDate(d.getDate() - index)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  let {
    active = true,
    scrollToTopSignal = 0,
  }: { active?: boolean; scrollToTopSignal?: number } = $props()
</script>

<QuoteFeed
  load={() => fetchQuoteOfDayRange()}
  preload={() => getCachedQuoteOfDayRange()}
  empty="No quote of the day yet."
  label={dayLabel}
  feedKey="day"
  {active}
  {scrollToTopSignal}
/>
