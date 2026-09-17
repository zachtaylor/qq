<script lang="ts">
  import { tagQuoteTransition } from '$lib/viewTransition'
  import * as localdb from '$lib/localdb'
  import type { QQuote } from '$lib/types'
  import BackButton from '$lib/components/BackButton.svelte'

  let term = $state('')
  let results = $state<QQuote[]>([])
  let searched = $state(false)
  let debounceTimeout: ReturnType<typeof setTimeout> | undefined
  let inputEl = $state<HTMLInputElement>()

  $effect(() => {
    inputEl?.focus()
  })

  async function runSearch(value: string) {
    if (value.trim().length === 0) {
      results = []
      searched = false
      return
    }
    results = await localdb.searchQuotes(value)
    searched = true
  }

  function onInput() {
    if (debounceTimeout) clearTimeout(debounceTimeout)
    debounceTimeout = setTimeout(() => runSearch(term), 250)
  }

  function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  /** Wraps every case-insensitive match of the current search term in <mark>, HTML-escaping the rest so unrelated `<`/`&` in quote text can't break the markup. */
  function highlight(text: string): string {
    const trimmed = term.trim()
    if (trimmed.length === 0) return escapeHtml(text)
    const re = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
    return escapeHtml(text)
      .split(re)
      .map((part, i) =>
        i % 2 === 1
          ? `<mark class="bg-accent/30 text-stone-900">${part}</mark>`
          : part,
      )
      .join('')
  }
</script>

<div class="mb-6 flex items-center gap-3">
  <BackButton />
  <h1 class="text-2xl font-bold text-stone-900">Search</h1>
</div>

<input
  bind:this={inputEl}
  type="search"
  placeholder="Search quotes or authors…"
  bind:value={term}
  oninput={onInput}
  class="mb-4 w-full rounded-xl border border-stone-300 p-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
/>

{#if !searched}
  <p class="py-12 text-center text-sm text-stone-400">
    Searches quotes you've already downloaded to this device.
  </p>
{:else if results.length === 0}
  <p class="py-12 text-center text-sm text-stone-400">No matches found.</p>
{:else}
  <ul class="divide-y divide-stone-100">
    {#each results as quote (quote.id)}
      {@const author = quote.author}
      <li class="py-3">
        <a
          href="/app/q/{quote.id}"
          class="block"
          onclick={(e) =>
            tagQuoteTransition(e.currentTarget, quote.id, author.slug)}
        >
          <p class="line-clamp-2 font-serif text-sm text-stone-800">
            "{@html highlight(quote.text)}"
          </p>
          <p class="mt-1 text-xs text-stone-400">
            — {@html highlight(author.name)}
          </p>
        </a>
      </li>
    {/each}
  </ul>
{/if}
