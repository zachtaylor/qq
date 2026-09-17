<script lang="ts">
  import QuoteRow from '$lib/components/QuoteRow.svelte'
  import { fetchUserContentBundle } from '$lib/api/userContent'
  import {
    userContentCache,
    loadUserContent,
  } from '$lib/stores/userContentCache.svelte'
  import { network } from '$lib/stores/network.svelte'
  import { dedupeTransitionNames } from '$lib/viewTransition'
  import BackButton from '$lib/components/BackButton.svelte'

  let likes = $state(userContentCache.likes ?? [])

  const tagAuthor = $derived(
    dedupeTransitionNames(likes.map((l) => `author-${l.quote.author.slug}`)),
  )

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // Run once per mount, not once per reactive change (e.g. network
  // connectivity flipping) — otherwise every offline/online toggle
  // re-fires fetchUserContentBundle(), thrashing the network.
  let attempted = false
  $effect(() => {
    if (attempted) return
    attempted = true
    loadUserContent().then(() => {
      likes = userContentCache.likes ?? []
    })
    if (network.offline) return
    fetchUserContentBundle().then(({ likes: result, downloads }) => {
      userContentCache.setLikes(result)
      userContentCache.setDownloads(downloads)
      likes = result
    })
  })
</script>

<div class="mb-6 flex items-center gap-3">
  <BackButton />
  <h1 class="text-2xl font-bold text-stone-900">Likes</h1>
</div>

{#if likes.length === 0}
  <p class="py-12 text-center text-sm text-stone-400">
    Quotes you like will show up here.
  </p>
{:else}
  <ul class="divide-y divide-stone-100">
    {#each likes as like, i (like.quote.id)}
      <li class="py-3">
        <QuoteRow
          quote={like.quote}
          timestamp={formatDate(like.likedAt)}
          tagAuthor={tagAuthor[i]}
        />
      </li>
    {/each}
  </ul>
{/if}
