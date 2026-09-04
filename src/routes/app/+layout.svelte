<script lang="ts">
  import TabBar from '$lib/components/TabBar.svelte'
  import TabStrip from '$lib/components/TabStrip.svelte'
  import { page } from '$app/state'
  import { onMount } from 'svelte'

  const TAB_ORDER = [
    '/app/daily',
    '/app/random',
    '/app/trending',
    '/app/settings',
  ]
  const SWIPE_THRESHOLD = 60
  const SWIPE_COMMIT_RATIO = 0.3

  function indexForPath(pathname: string): number {
    const i = TAB_ORDER.indexOf(pathname)
    return i === -1 ? 0 : i
  }

  // activeIndex is tracked locally rather than derived from page.url: tab
  // switches update the address bar directly via history.pushState (bypassing
  // SvelteKit's router, which would otherwise reconcile /app/daily <-> /app/random
  // as a real route change and remount this layout). Kept in sync with browser
  // back/forward via the popstate listener below, and with real SvelteKit
  // navigations into /app/* via the $effect further down.
  let activeIndex = $state(indexForPath(page.url.pathname))

  let touchStartX = 0
  let touchStartY = 0
  let dragX = $state(0)
  let dragging = $state(false)
  let tracking = false
  let settled = $state(true)
  let contentEl: HTMLDivElement | undefined = $state()
  let scrollToTopSignal = $state(0)
  let refreshSignal = $state(0)
  const DOUBLE_TAP_MS = 400
  let lastTapTime = 0
  let lastTapIndex = -1

  function selectTab(index: number) {
    if (index === activeIndex) {
      const now = Date.now()
      if (lastTapIndex === index && now - lastTapTime < DOUBLE_TAP_MS) {
        refreshSignal++
        lastTapTime = 0
        lastTapIndex = -1
      } else {
        scrollToTopSignal++
        lastTapTime = now
        lastTapIndex = index
      }
      return
    }
    activeIndex = index
    history.pushState(history.state, '', TAB_ORDER[index])
    // This tab switch bypasses SvelteKit's router (see comment on
    // activeIndex above), so it never reaches root +layout.svelte's
    // afterNavigate — track it explicitly instead (autotrack is disabled
    // there specifically to avoid double-counting this pushState call).
    window.umami?.track((props) => ({ ...props, url: TAB_ORDER[index] }))
    lastTapTime = 0
    lastTapIndex = -1
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    tracking = true
    dragging = false
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking) return
    const dx = e.touches[0].clientX - touchStartX
    const dy = e.touches[0].clientY - touchStartY

    if (!dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      const wantsNext = dx < 0
      const edgeBlocked =
        (wantsNext && activeIndex === TAB_ORDER.length - 1) ||
        (!wantsNext && activeIndex === 0)
      if (edgeBlocked) {
        tracking = false
        return
      }
      dragging = true
      settled = false
    }

    e.preventDefault()
    dragX = dx
  }

  function onTouchEnd(e: TouchEvent) {
    tracking = false
    if (!dragging) return
    dragging = false

    const dx = e.changedTouches[0].clientX - touchStartX
    const width = contentEl?.clientWidth ?? window.innerWidth
    const commit =
      Math.abs(dx) > SWIPE_THRESHOLD &&
      Math.abs(dx) > width * SWIPE_COMMIT_RATIO

    if (!commit) {
      settled = true
      dragX = 0
      return
    }

    const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1
    settled = true
    selectTab(nextIndex)
    dragX = 0
  }

  onMount(() => {
    const el = contentEl
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  })

  onMount(() => {
    function onPopState() {
      activeIndex = indexForPath(location.pathname)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  })

  // Covers real SvelteKit navigations into /app/* (e.g. the /app -> /app/daily
  // redirect, or landing here after a back/forward from outside /app) that
  // don't go through selectTab.
  $effect(() => {
    activeIndex = indexForPath(page.url.pathname)
  })
</script>

<div
  bind:this={contentEl}
  role="group"
  class="h-full"
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  ontouchcancel={onTouchEnd}
>
  <TabStrip {activeIndex} {dragX} {settled} {scrollToTopSignal} {refreshSignal} />
</div>

<TabBar {activeIndex} onSelect={(i) => selectTab(i)} />
