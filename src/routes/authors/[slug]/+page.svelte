<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { fetchAuthorBySlug } from '$lib/api/authors'
  import { fetchQuotesByAuthor } from '$lib/api/quotes'
  import QuoteList from '$lib/components/QuoteList.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  let author = $state(data.author)
  let quotes = $state(data.quotes)

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

  function back() {
    history.length > 1 ? history.back() : goto('/app')
  }
</script>

{#if author}
  <button
    onclick={back}
    aria-label="Back"
    class="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg text-stone-600 shadow-sm ring-1 ring-stone-200 backdrop-blur-xl hover:text-stone-900"
  >
    ←
  </button>
  <div class="mb-6 flex flex-col items-center text-center">
    {#if author.portrait_url}
      <img
        src={author.portrait_url}
        alt={author.name}
        class="mb-3 h-24 w-24 rounded-full object-cover ring-1 ring-stone-200"
      />
    {/if}
    <h1
      class="text-2xl font-bold text-stone-900"
      style="view-transition-name: author-{author.slug}"
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
  <QuoteList {quotes} hideAuthor />
{:else}
  <p class="py-12 text-center text-sm text-stone-400">Author not found.</p>
{/if}
