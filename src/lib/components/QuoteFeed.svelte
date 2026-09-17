<script lang="ts">
  import type { QQuote } from '$lib/types'
  import { setLiked } from '$lib/api/quotes'
  import { network } from '$lib/stores/network.svelte'
  import { feedCache, type FeedKey } from '$lib/stores/feedCache.svelte'
  import { fade } from 'svelte/transition'
  import { SvelteSet } from 'svelte/reactivity'
  import { tagQuoteTransition, tagChipTransition } from '$lib/viewTransition'
  import { afterNavigate } from '$app/navigation'
  import { getQuoteCounters } from '$lib/localdb'
  import Heart from '@lucide/svelte/icons/heart'
  import Download from '@lucide/svelte/icons/download'

  let {
    load,
    preload,
    onRefresh,
    empty = 'No quotes yet.',
    label,
    feedKey,
    active = true,
    scrollToTopSignal = 0,
    refreshSignal = 0,
  }: {
    load: () => Promise<QQuote[]>
    /** Like a page load function: an async, local-only read (e.g. straight
     *  from SQLite) awaited before first render, so a cold mount can show
     *  real data immediately instead of a spinner. Its result seeds
     *  `quotes`; `load()` still runs afterwards to reconcile/refresh. */
    preload?: () => Promise<QQuote[]>
    /** Used for an explicit pull-to-refresh instead of `load`, when a feed
     *  needs to force a real re-fetch that `load` itself wouldn't (e.g.
     *  random's staleness-gated reload). Defaults to `load`. */
    onRefresh?: () => Promise<QQuote[]>
    empty?: string
    label?: (quote: QQuote, index: number) => string
    feedKey?: FeedKey
    /** Whether this feed is the frontmost tab. Static view-transition-name
     *  fallbacks (for back-navigation) must be gated on this — every tab
     *  stays mounted at once, so an inactive tab's "active quote" would
     *  otherwise collide with the same quote's name on the visible tab. */
    active?: boolean
    /** Bumped by the parent (tab bar) when this tab's already-active button
     *  is clicked again, to scroll back to the top. */
    scrollToTopSignal?: number
    /** Bumped by the parent (tab bar) when this tab's already-active button
     *  is double-tapped, to force a refresh. */
    refreshSignal?: number
  } = $props()

  const cached = feedKey ? feedCache.get(feedKey) : undefined

  let quotes: QQuote[] = $state(cached?.quotes ?? [])
  let loading = $state(quotes.length === 0)
  let error: Error | null = $state(null)
  let scrollEl: HTMLDivElement | undefined = $state()
  let refreshing = $state(false)

  // Fetch once per mount, not once per empty result: gating on
  // quotes.length alone would re-fire forever whenever load() legitimately
  // (or due to a swallowed error) resolves to an empty array, since
  // reassigning quotes to [] still re-triggers this effect.
  let attempted = false

  async function runLoad(fetcher: () => Promise<QQuote[]> = load) {
    if (preload && quotes.length === 0) {
      try {
        const preloaded = await preload()
        if (preloaded.length > 0) {
          quotes = preloaded
          loading = false
        }
      } catch (err) {
        console.warn(`QuoteFeed(${feedKey}): preload() threw`, err)
        // preload is best-effort; load() below is the source of truth
      }
    }

    try {
      const result = await fetcher()
      quotes = result
      if (feedKey) feedCache.set(feedKey, result)
    } catch (err) {
      error = err as Error
    } finally {
      loading = false
    }
  }

  $effect(() => {
    if (attempted) return
    attempted = true
    error = null

    // A fresh cached feed (e.g. returning from a quote detail page to
    // /app/tabs/random) is reused as-is instead of re-rolling load() — only a
    // stale/empty cache or an explicit pull-to-refresh should replace it.
    if (feedKey && !feedCache.isStale(feedKey)) return

    runLoad()
  })

  async function refresh() {
    if (refreshing) return
    refreshing = true
    error = null
    try {
      await runLoad(onRefresh ?? load)
    } finally {
      refreshing = false
    }
  }

  let pullStartY = 0
  let pulling = $state(false)
  let pullDistance = $state(0)
  const PULL_THRESHOLD = 110
  // Raw drag distance is damped before being compared to PULL_THRESHOLD, so
  // it takes a noticeably longer drag to trigger a refresh than a 1:1
  // mapping would — otherwise a small downward scroll flick reads as a pull.
  const PULL_DAMPING = 0.5

  function onTouchStart(e: TouchEvent) {
    if (!scrollEl || scrollEl.scrollTop > 0) return
    pullStartY = e.touches[0].clientY
    pulling = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!pulling || !scrollEl || scrollEl.scrollTop > 0) return
    const dy = (e.touches[0].clientY - pullStartY) * PULL_DAMPING
    if (dy <= 0) {
      pullDistance = 0
      return
    }
    // Once a pull is in progress, keep the browser's own scroll/rubber-band
    // handling from taking over the gesture — otherwise reversing direction
    // (dragging back up to cancel) can hand the touch to native scrolling
    // mid-gesture, after which further touchmove deltas stop tracking the
    // finger against pullStartY the way this handler assumes.
    e.preventDefault()
    pullDistance = Math.min(dy, PULL_THRESHOLD * 1.5)
  }

  // Svelte's ontouchmove attribute binds passively, so e.preventDefault()
  // inside it throws — attach this one manually as active so we can block
  // native scroll/rubber-banding while a pull is in progress (see onTouchMove).
  $effect(() => {
    if (!scrollEl) return
    const el = scrollEl
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  })

  function onTouchEnd() {
    if (!pulling) return
    pulling = false
    if (pullDistance >= PULL_THRESHOLD) refresh()
    pullDistance = 0
  }

  $effect(() => {
    if (!scrollEl) return
    const savedTop = feedKey ? (feedCache.get(feedKey)?.scrollTop ?? 0) : 0
    if (savedTop > 0) scrollEl.scrollTop = savedTop
    updateActiveSlide()
  })

  // Which slide is currently snapped into view. Only this slide's elements
  // may carry a static view-transition-name — with one section per quote
  // in a snap-scroll list, dedup-by-author-across-the-whole-feed would
  // otherwise hand the name to an earlier, off-screen quote by the same
  // author, so the actual on-screen quote the user taps has no matching
  // source element and the transition silently no-ops/breaks.
  let activeSlideIndex = $state(0)

  function updateActiveSlide() {
    if (!scrollEl) return
    activeSlideIndex = Math.round(scrollEl.scrollTop / scrollEl.clientHeight)
  }

  function onScroll() {
    updateActiveSlide()
    if (!scrollEl || !feedKey) return
    feedCache.setScroll(feedKey, scrollEl.scrollTop)
  }

  let scrollToTopAttempted = 0
  $effect(() => {
    if (scrollToTopSignal === scrollToTopAttempted) return
    scrollToTopAttempted = scrollToTopSignal
    scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  })

  let refreshSignalAttempted = 0
  $effect(() => {
    if (refreshSignal === refreshSignalAttempted) return
    refreshSignalAttempted = refreshSignal
    if (active) refresh()
  })

  // The feed tab stays mounted while the user visits a quote detail page
  // (see app/tabs/+layout.svelte), so a like/download made there leaves this
  // component's `quotes` array holding stale counters when the user
  // navigates back. setLiked()/bumpDownloadsCount() keep localdb current as
  // the source of truth, so re-read from there rather than a full reload
  // (which would also re-roll random's ordering).
  afterNavigate(({ to }) => {
    if (!to?.url.pathname.startsWith('/app')) return
    if (quotes.length === 0) return
    getQuoteCounters(quotes.map((q) => q.id)).then((states) => {
      for (const quote of quotes) {
        const fresh = states.get(quote.id)
        if (!fresh) continue
        quote.liked_by_me = fresh.liked_by_me
        quote.like_count = fresh.like_count
        quote.downloads_count = fresh.downloads_count
      }
    })
  })

  let animatingIds = new SvelteSet<string>()

  async function toggleLike(quote: QQuote) {
    if (network.offline) return
    const wasLiked = quote.liked_by_me
    quote.liked_by_me = !quote.liked_by_me
    quote.like_count += quote.liked_by_me ? 1 : -1
    if (!wasLiked && quote.liked_by_me) {
      animatingIds.add(quote.id)
    }
    try {
      await setLiked(quote.id, quote.liked_by_me)
    } catch {
      quote.liked_by_me = !quote.liked_by_me
      quote.like_count += quote.liked_by_me ? 1 : -1
      animatingIds.delete(quote.id)
    }
  }
</script>

{#if loading}
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-stone-400">Loading…</p>
  </div>
{:else if error}
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-red-500">Failed to load: {error.message}</p>
  </div>
{:else}
  {#if quotes.length === 0}
    <div class="flex h-full items-center justify-center">
      <p class="text-sm text-stone-400">{empty}</p>
    </div>
  {:else}
    <div
      bind:this={scrollEl}
      role="feed"
      onscroll={onScroll}
      ontouchstart={onTouchStart}
      ontouchend={onTouchEnd}
      ontouchcancel={onTouchEnd}
      class="relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
    >
      {#if pullDistance > 0 || refreshing}
        <div
          transition:fade={{ duration: 100 }}
          class="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 pt-4 text-xs text-stone-400"
        >
          {refreshing
            ? 'Refreshing…'
            : pullDistance >= PULL_THRESHOLD
              ? 'Release to refresh'
              : 'Pull to refresh'}
        </div>
      {/if}
      {#each quotes as quote, i (quote.id)}
        {@const author = quote.author}
        <section
          class="flex h-full snap-start snap-always flex-col items-center justify-center px-6 pb-24"
        >
          <div class="flex w-full max-w-md flex-col items-center text-center">
            {#if label}
              <p
                class="mb-4 text-xs font-medium tracking-wide text-stone-400 uppercase"
              >
                {label(quote, i)}
              </p>
            {/if}
            <a
              href="/app/q/{quote.id}"
              class="block"
              onclick={(e) =>
                tagQuoteTransition(
                  e.currentTarget.parentElement!,
                  quote.id,
                  author.slug,
                )}
            >
              <blockquote
                data-transition="quote-text"
                class="font-serif text-3xl leading-snug text-stone-800 sm:text-4xl"
                style={active && i === activeSlideIndex
                  ? `view-transition-name: quote-text-${quote.id}`
                  : ''}
              >
                "{quote.text}"
              </blockquote>
            </a>
            <a
              href="/app/authors/{author.slug}"
              data-transition="author"
              class="mt-6 text-base font-medium text-accent hover:underline"
              style={active && i === activeSlideIndex
                ? `view-transition-name: author-${author.slug}`
                : ''}
              onclick={(e) =>
                tagQuoteTransition(
                  e.currentTarget.parentElement!,
                  quote.id,
                  author.slug,
                )}
            >
              — {author.name}
            </a>
            {#if quote.tags.length > 0}
              <div class="mt-4 flex flex-wrap justify-center gap-1.5">
                {#each quote.tags as tag (tag.id)}
                  <a
                    href="/app/tags/{tag.slug}"
                    class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200"
                    style={active && i === activeSlideIndex
                      ? `view-transition-name: tag-${tag.slug}`
                      : ''}
                    onclick={(e) =>
                      tagChipTransition(e.currentTarget, tag.slug)}
                  >
                    #{tag.name}
                  </a>
                {/each}
              </div>
            {/if}
            <div class="mt-8 flex items-center gap-6">
              <button
                onclick={() => toggleLike(quote)}
                disabled={network.offline}
                class="flex items-center gap-2 text-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 {quote.liked_by_me
                  ? 'text-accent'
                  : 'text-stone-400 hover:text-stone-600'}"
                aria-pressed={quote.liked_by_me}
                aria-label="Like"
              >
                <Heart
                  class="size-5 {animatingIds.has(quote.id)
                    ? 'animate-like-pop'
                    : ''}"
                  onanimationend={() => animatingIds.delete(quote.id)}
                  fill={quote.liked_by_me ? 'currentColor' : 'none'}
                />{quote.like_count}
              </button>
              {#if network.offline}
                <span
                  class="text-xl text-stone-300"
                  aria-label="Share unavailable offline"
                >
                  <Download class="size-5" />
                </span>
              {:else}
                <a
                  href="/app/share/{quote.id}"
                  class="flex items-center gap-2 text-lg text-stone-400 hover:text-stone-600"
                  aria-label="Share"
                >
                  <Download class="size-5" />{quote.downloads_count}
                </a>
              {/if}
            </div>
          </div>
        </section>
      {/each}
    </div>
  {/if}
{/if}
