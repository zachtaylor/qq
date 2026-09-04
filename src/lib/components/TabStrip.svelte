<script lang="ts">
  import DayFeed from '$lib/components/tabs/DayFeed.svelte'
  import RandomFeed from '$lib/components/tabs/RandomFeed.svelte'
  import TrendingFeed from '$lib/components/tabs/TrendingFeed.svelte'
  import SettingsPanel from '$lib/components/tabs/SettingsPanel.svelte'

  let {
    activeIndex,
    dragX,
    settled,
    scrollToTopSignal,
    refreshSignal,
  }: {
    activeIndex: number
    dragX: number
    settled: boolean
    scrollToTopSignal: number
    refreshSignal: number
  } = $props()

  let settingsScrollEl: HTMLDivElement | undefined = $state()
  let settingsScrollAttempted = 0
  $effect(() => {
    if (scrollToTopSignal === settingsScrollAttempted) return
    settingsScrollAttempted = scrollToTopSignal
    settingsScrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  })
</script>

<div class="h-full overflow-hidden">
  <div
    class="flex h-full w-full"
    style="transform: translateX(calc(-{activeIndex *
      100}% + {dragX}px)); transition: {settled
      ? 'transform 0.25s ease-out'
      : 'none'};"
  >
    <div class="h-full w-full shrink-0">
      <DayFeed active={activeIndex === 0} {scrollToTopSignal} />
    </div>
    <div class="h-full w-full shrink-0">
      <RandomFeed active={activeIndex === 1} {scrollToTopSignal} {refreshSignal} />
    </div>
    <div class="h-full w-full shrink-0">
      <TrendingFeed active={activeIndex === 2} {scrollToTopSignal} {refreshSignal} />
    </div>
    <div bind:this={settingsScrollEl} class="h-full w-full shrink-0 overflow-y-auto">
      <div class="mx-auto max-w-lg px-4 pt-6 pb-24 lg:max-w-4xl">
        <SettingsPanel active={activeIndex === 3} />
      </div>
    </div>
  </div>
</div>
