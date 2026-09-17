<script lang="ts">
  import favicon from '$lib/assets/favicon.svg'
  import '../app.css'
  import { Capacitor } from '@capacitor/core'
  import OfflineBanner from '$lib/components/OfflineBanner.svelte'
  import { page } from '$app/state'
  import { onNavigate, afterNavigate } from '$app/navigation'
  import { clearQuoteTransitionTags } from '$lib/viewTransition'
  import { PUBLIC_UMAMI_WEBSITE_ID } from '$env/static/public'
  import { dev } from '$app/environment'

  // Boot loading screen isn't faded out here: this layout mounts before
  // /app's boot load() resolves, so app/+layout.svelte owns the fade instead
  // (it only mounts once that load() has resolved).
  console.debug('[boot] root +layout.svelte mounted', performance.now())

  // Injected here (not a static <script> in app.html) so data-tag can be set
  // from Capacitor.getPlatform(). data-auto-track="false": /app's tab bar
  // calls history.pushState directly on tab switches (see
  // app/tabs/+layout.svelte), which would double-count against Umami's own
  // autotrack — pageviews are tracked explicitly instead (afterNavigate
  // here, trackTabView there). Skipped in dev, so window.umami stays
  // undefined and every .track() call below silently no-ops.
  if (!dev) {
    const umamiScript = document.createElement('script')
    umamiScript.defer = true
    umamiScript.src = 'https://cloud.umami.is/script.js'
    umamiScript.dataset.websiteId = PUBLIC_UMAMI_WEBSITE_ID
    umamiScript.dataset.tag = Capacitor.getPlatform()
    umamiScript.dataset.autoTrack = 'false'
    // `defer` means window.umami isn't defined until this load fires — the
    // very first afterNavigate (the initial 'enter' navigation) runs long
    // before that, so window.umami?.track() below would silently no-op on a
    // quick open-then-close. Firing the first pageview from onload instead
    // guarantees it's sent as soon as the tracker actually exists.
    umamiScript.onload = () => {
      window.umami?.track((props) => ({ ...props, url: page.url.pathname }))
    }
    document.head.appendChild(umamiScript)
  }

  // Covers subsequent real SvelteKit navigations. The initial 'enter'
  // navigation is skipped here since umamiScript.onload above already
  // covers it (and typically fires first anyway).
  afterNavigate((navigation) => {
    console.debug(
      '[nav] afterNavigate',
      navigation.type,
      page.url.pathname,
      performance.now(),
    )
    if (navigation.type === 'enter') return
    window.umami?.track((props) => ({ ...props, url: page.url.pathname }))
  })

  onNavigate((navigation) => {
    console.debug(
      '[nav] onNavigate start',
      navigation.from?.url.pathname,
      '->',
      navigation.to?.url.pathname,
      performance.now(),
    )
    if (!document.startViewTransition) return
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve()
        await navigation.complete
        console.debug('[nav] complete', performance.now())
        clearQuoteTransitionTags()
      })
      transition.finished.then(() =>
        console.debug('[nav] view transition finished', performance.now()),
      )
    })
  })

  let { children } = $props()

  let hideChrome = $derived(
    page.url.pathname === '/' || page.url.pathname.startsWith('/app/'),
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
