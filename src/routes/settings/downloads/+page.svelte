<script lang="ts">
  import QuoteRow from '$lib/components/QuoteRow.svelte'
  import { createTransitionKeyTracker } from '$lib/viewTransition'
  import { fetchDownloadHistory } from '$lib/api/quotes'
  import {
    userContentCache,
    loadUserContent,
  } from '$lib/stores/userContentCache.svelte'
  import { network } from '$lib/stores/network.svelte'

  let downloads = $state(userContentCache.downloads ?? [])

  // Fresh trackers whenever `downloads` is reassigned — the effect below
  // re-renders this list twice (once from the local cache, once from the
  // network refetch), and a tracker created only once at component init
  // would treat the second render's calls as duplicates of the first,
  // permanently stripping every row's static view-transition-name once the
  // network data lands.
  let claimQuote = $derived.by(() => {
    downloads
    return createTransitionKeyTracker()
  })
  let claimAuthor = $derived.by(() => {
    downloads
    return createTransitionKeyTracker()
  })

  // Run once per mount, not once per reactive change (e.g. network
  // connectivity flipping) — otherwise every offline/online toggle
  // re-fires fetchDownloadHistory(), thrashing the network.
  let attempted = false
  $effect(() => {
    if (attempted) return
    attempted = true
    loadUserContent().then(() => {
      downloads = userContentCache.downloads ?? []
    })
    if (network.offline) return
    fetchDownloadHistory().then((result) => {
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
  <a href="/app/settings" class="text-xl text-stone-500" aria-label="Back">←</a>
  <h1 class="text-2xl font-bold text-stone-900">Downloads</h1>
</div>

{#if downloads.length === 0}
  <p class="py-12 text-center text-sm text-stone-400">
    Cards you download will show up here.
  </p>
{:else}
  <ul class="divide-y divide-stone-100">
    {#each downloads as download (download.createdAt)}
      <li class="py-3">
        <QuoteRow
          quote={{
            id: download.quoteId,
            text: download.quote.text,
            author: download.quote.author,
          }}
          meta={formatDate(download.createdAt)}
          tagQuoteText={claimQuote(download.quoteId)}
          tagAuthor={claimAuthor(download.quote.author.slug)}
        />
      </li>
    {/each}
  </ul>
{/if}
