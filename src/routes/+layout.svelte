<script lang="ts">
  import favicon from '$lib/assets/favicon.svg'
  import '../app.css'
  import OfflineBanner from '$lib/components/OfflineBanner.svelte'
  import { page } from '$app/state'
  import { onNavigate } from '$app/navigation'
  import { clearQuoteTransitionTags } from '$lib/viewTransition'

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
  <main class="mx-auto min-h-screen max-w-lg px-4 pt-6 pb-6 lg:max-w-4xl">
    {@render children()}
  </main>
{/if}
