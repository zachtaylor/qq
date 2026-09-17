<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'

  function goHome() {
    goto('/')
  }
</script>

<svelte:head>
  <title>Page not found — qq</title>
  <meta
    name="description"
    content="The page you're looking for doesn't exist."
  />
</svelte:head>

<div class="flex min-h-[calc(100vh-3rem)] items-center justify-center py-12">
  <section
    class="w-full max-w-md text-center"
    aria-labelledby="not-found-title"
  >
    <div
      class="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-accent/10 text-5xl shadow-sm"
      aria-hidden="true"
    >
      ✦
    </div>

    <h1
      id="not-found-title"
      class="text-3xl font-bold tracking-tight text-stone-900"
    >
      This page wandered off
    </h1>
    <p class="mx-auto mt-4 max-w-sm text-base leading-7 text-stone-600">
      We couldn't find <span class="font-medium text-stone-800">
        {page.url.pathname}
      </span>
    </p>

    <button
      type="button"
      class="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
      onclick={goHome}
    >
      <span aria-hidden="true">←</span>
      Back home
    </button>
  </section>
</div>
