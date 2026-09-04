<script lang="ts">
  import favicon from '$lib/assets/favicon.svg'
  import '../app.css'
  import { Capacitor } from '@capacitor/core'
  import OfflineBanner from '$lib/components/OfflineBanner.svelte'
  import { page } from '$app/state'
  import { onNavigate, afterNavigate } from '$app/navigation'
  import { clearQuoteTransitionTags } from '$lib/viewTransition'
  import { PUBLIC_UMAMI_WEBSITE_ID } from '$env/static/public'

  // Injected here (rather than a static <script> in app.html) so data-tag
  // can be set from Capacitor.getPlatform() — native builds serve from a
  // capacitor://localhost-style origin, not the real domain, so without a
  // tag there's no way to tell ios/android/web sessions apart in Umami's
  // dashboard.
  // data-auto-track="false": Umami's default autotrack patches
  // history.pushState/replaceState itself to detect SPA route changes, but
  // /app's tab bar (see app/+layout.svelte) already calls history.pushState
  // directly on every tab switch to avoid a real SvelteKit navigation —
  // autotrack would fire on that *and* our own afterNavigate below would
  // fire on real route changes, double-counting. Tracking every pageview
  // explicitly (afterNavigate here, trackTabView in app/+layout.svelte) is
  // the only way to get exactly one view per navigation.
  const umamiScript = document.createElement('script')
  umamiScript.defer = true
  umamiScript.src = 'https://cloud.umami.is/script.js'
  umamiScript.dataset.websiteId = PUBLIC_UMAMI_WEBSITE_ID
  umamiScript.dataset.tag = Capacitor.getPlatform()
  umamiScript.dataset.autoTrack = 'false'
  document.head.appendChild(umamiScript)

  // Covers real SvelteKit navigations (initial load included, since
  // autotrack is off and would otherwise never fire for it).
  afterNavigate(() => {
    window.umami?.track((props) => ({ ...props, url: page.url.pathname }))
  })

  onNavigate((navigation) => {
    if (!document.startViewTransition) return
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        // resolve() must fire first: SvelteKit's navigation is waiting on
        // this promise before it will actually render the new page, so
        // awaiting navigation.complete before calling resolve() deadlocks
        // (the transition times out with "aborted because of timeout in
        // DOM update").
        resolve()
        await navigation.complete
        // Clear imperative tags after the new page has rendered, but still
        // inside the transition's DOM-update callback — i.e. before the
        // "after" snapshot is taken. Otherwise a tag applied to a clicked
        // element (e.g. a "Similar quotes" card, which can persist across
        // same-route navigations) survives into the new render, where the
        // destination page may reactively claim the same
        // view-transition-name for its own element, producing a "duplicate
        // view-transition-name" error.
        clearQuoteTransitionTags()
      })
    })
  })

  let { children } = $props()

  let hideChrome = $derived(
    page.url.pathname === '/' ||
      page.url.pathname.startsWith('/share/') ||
      page.url.pathname.startsWith('/q/') ||
      page.url.pathname.startsWith('/app/'),
  )
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<OfflineBanner />

{#if hideChrome}
  {@render children()}
{:else}
  <main class="mx-auto min-h-screen max-w-lg px-4 py-6 lg:max-w-4xl">
    {@render children()}
  </main>
{/if}
