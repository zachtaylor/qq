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

  let downloads = $state(userContentCache.downloads ?? [])

  const tagQuoteText = $derived(
    dedupeTransitionNames(downloads.map((d) => `quote-text-${d.quoteId}`)),
  )
  const tagAuthor = $derived(
    dedupeTransitionNames(
      downloads.map((d) => `author-${d.quote.author.slug}`),
    ),
  )

  // Run once per mount, not once per reactive change (e.g. network
  // connectivity flipping) — otherwise every offline/online toggle
  // re-fires fetchUserContentBundle(), thrashing the network.
  let attempted = false
  $effect(() => {
    if (attempted) return
    attempted = true
    loadUserContent().then(() => {
      downloads = userContentCache.downloads ?? []
    })
    if (network.offline) return
    fetchUserContentBundle().then(({ likes, downloads: result }) => {
      userContentCache.setLikes(likes)
      userContentCache.setDownloads(result)
      downloads = result
    })
  })

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
</script>

<div class="mb-6 flex items-center gap-3">
  <BackButton />
  <h1 class="text-2xl font-bold text-stone-900">Downloads</h1>
</div>

{#if downloads.length === 0}
  <p class="py-12 text-center text-sm text-stone-400">
    Cards you download will show up here.
  </p>
{:else}
  <ul class="divide-y divide-stone-100">
    {#each downloads as download, i (download.createdAt)}
      <li class="py-3">
        <QuoteRow
          quote={{
            id: download.quoteId,
            text: download.quote.text,
            author_id: download.quote.author_id,
            author: download.quote.author,
          }}
          timestamp={formatDate(download.createdAt)}
          tagQuoteText={tagQuoteText[i]}
          tagAuthor={tagAuthor[i]}
        />
      </li>
    {/each}
  </ul>
{/if}
