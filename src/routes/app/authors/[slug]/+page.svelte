<script lang="ts">
  import { onMount } from 'svelte'
  import { fetchAuthorBySlug } from '$lib/api/authors'
  import { fetchQuotesByAuthor } from '$lib/api/quotes'
  import QuoteList from '$lib/components/QuoteList.svelte'
  import BackButton from '$lib/components/BackButton.svelte'
  import DetailShell from '$lib/components/DetailShell.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  let author = $state(data.author)
  let quotes = $state(data.quotes)

  const authorName = $derived(author ? `author-${author.slug}` : '')
  const authorPortraitName = $derived(
    author ? `author-portrait-${author.slug}` : '',
  )

  $effect(() => {
    author = data.author
    quotes = data.quotes
  })

  onMount(() => {
    // Background refresh: reconciles bio/portrait/quote list against the
    // network, and covers a cache miss (data.author from the local-first
    // load() above). Cached data (if any) is already showing.
    fetchAuthorBySlug(data.slug)
      .then(async (fresh) => {
        if (!fresh) return
        author = fresh
        quotes = await fetchQuotesByAuthor(fresh.id)
      })
      .catch(() => {})
  })
</script>

{#key data.slug}
  {#if author}
    <DetailShell>
      <BackButton />
      <div class="mt-4 mb-6 flex flex-col items-center text-center">
        {#if author.portrait_url}
          <img
            src={author.portrait_url}
            alt={author.name}
            class="mb-3 h-24 w-24 rounded-full object-cover ring-1 ring-stone-200"
            style={authorPortraitName
              ? `view-transition-name: ${authorPortraitName}`
              : ''}
          />
        {/if}
        <h1
          class="text-2xl font-bold text-stone-900"
          style={authorName ? `view-transition-name: ${authorName}` : ''}
        >
          {author.name}
        </h1>
        {#if author.born_year}
          <p class="text-sm text-stone-400">
            {author.born_year}{author.died_year ? `–${author.died_year}` : ''}
          </p>
        {/if}
        {#if author.bio}
          <p class="mt-2 max-w-sm text-sm text-stone-600">{author.bio}</p>
        {/if}
      </div>
      <QuoteList {quotes} takenAuthorNames={authorName ? [authorName] : []} />
    </DetailShell>
  {:else}
    <p class="py-12 text-center text-sm text-stone-400">Author not found.</p>
  {/if}
{/key}
