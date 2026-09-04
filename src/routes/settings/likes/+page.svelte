<script lang="ts">
  import QuoteRow from '$lib/components/QuoteRow.svelte'
  import { createTransitionKeyTracker } from '$lib/viewTransition'
  import { fetchLikedQuotes } from '$lib/api/quotes'
  import {
    userContentCache,
    loadUserContent,
  } from '$lib/stores/userContentCache.svelte'
  import { network } from '$lib/stores/network.svelte'

  let likes = $state(userContentCache.likes ?? [])

  // Fresh tracker whenever `likes` is reassigned — the effect below
  // re-renders this list twice (once from the local cache, once from the
  // network refetch), and a tracker created only once at component init
  // would treat the second render's calls as duplicates of the first,
  // permanently stripping every row's static view-transition-name once the
  // network data lands.
  let claimAuthor = $derived.by(() => {
    likes
    return createTransitionKeyTracker()
  })

  // Run once per mount, not once per reactive change (e.g. network
  // connectivity flipping) — otherwise every offline/online toggle
  // re-fires fetchLikedQuotes(), thrashing the network.
  let attempted = false
  $effect(() => {
    if (attempted) return
    attempted = true
    loadUserContent().then(() => {
      likes = userContentCache.likes ?? []
    })
    if (network.offline) return
    fetchLikedQuotes().then((result) => {
      userContentCache.setLikes(result)
      likes = result
    })
  })
</script>

<div class="mb-6 flex items-center gap-3">
  <a href="/app/settings" class="text-xl text-stone-500" aria-label="Back">←</a>
  <h1 class="text-2xl font-bold text-stone-900">Likes</h1>
</div>

{#if likes.length === 0}
  <p class="py-12 text-center text-sm text-stone-400">
    Quotes you like will show up here.
  </p>
{:else}
  <ul class="divide-y divide-stone-100">
    {#each likes as quote (quote.id)}
      <li class="py-3">
        <QuoteRow {quote} tagAuthor={claimAuthor(quote.author.slug)} />
      </li>
    {/each}
  </ul>
{/if}
