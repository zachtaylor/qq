<script lang="ts">
  const tabs = [
    { label: 'Today', icon: '☀' },
    { label: 'Random', icon: '❝' },
    { label: 'Trending', icon: '↗' },
    { label: 'Settings', icon: '⚙' },
  ]

  let {
    activeIndex,
    onSelect,
  }: { activeIndex: number; onSelect: (index: number) => void } = $props()
</script>

<nav
  class="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
>
  <div
    class="relative flex w-full max-w-sm rounded-full border border-white/40 bg-white/60 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150"
  >
    <div
      class="absolute inset-y-1.5 rounded-full bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out"
      style="width: calc((100% - 0.75rem) / {tabs.length}); transform: translateX(calc({activeIndex} * 100%));"
    ></div>
    {#each tabs as tab, i (tab.label)}
      <button
        onclick={() => onSelect(i)}
        class="relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors {i ===
        activeIndex
          ? 'text-accent'
          : 'text-stone-500'}"
      >
        <span class="text-lg leading-none">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </div>
</nav>
