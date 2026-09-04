<script lang="ts">
  import type { Quote } from '$lib/types'
  import { setLiked } from '$lib/api/quotes'
  import { network } from '$lib/stores/network.svelte'
  import { tagQuoteTransition } from '$lib/viewTransition'

  let {
    quote,
    hideAuthor = false,
    nameTransition = true,
  }: {
    quote: Quote
    hideAuthor?: boolean
    nameTransition?: boolean
  } = $props()

  let liked = $state(quote.liked_by_me)
  let count = $state(quote.like_count)
  let busy = $state(false)
  let animateLike = $state(false)

  let articleEl: HTMLElement | undefined

  function onNavigateClick() {
    if (articleEl) tagQuoteTransition(articleEl, quote.id, quote.author.slug)
  }

  async function toggleLike() {
    if (busy || network.offline) return
    busy = true
    const wasLiked = liked
    liked = !liked
    count += liked ? 1 : -1
    if (!wasLiked && liked) {
      animateLike = true
    }
    try {
      await setLiked(quote.id, liked)
    } catch {
      liked = !liked
      count += liked ? 1 : -1
      animateLike = false
    } finally {
      busy = false
    }
  }
</script>

<article
  bind:this={articleEl}
  class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200"
>
  <a href="/q/{quote.id}" class="block" onclick={onNavigateClick}>
    <blockquote
      data-transition="quote-text"
      class="font-serif text-xl leading-relaxed text-stone-800"
      style="view-transition-name: quote-text-{quote.id}"
    >
      “{quote.text}”
    </blockquote>
  </a>
  {#if quote.tags.length > 0}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each quote.tags as tag (tag.id)}
        <a
          href="/tags/{tag.slug}"
          class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200"
        >
          #{tag.name}
        </a>
      {/each}
    </div>
  {/if}
  <div class="mt-4 flex items-center justify-between">
    {#if !hideAuthor}
      <a
        href="/authors/{quote.author.slug}"
        data-transition="author"
        class="text-sm font-medium text-accent hover:underline"
        style={nameTransition
          ? `view-transition-name: author-${quote.author.slug}`
          : ''}
        onclick={onNavigateClick}
      >
        — {quote.author.name}
      </a>
    {/if}
    <div class="ml-auto flex items-center gap-4">
      <button
        onclick={toggleLike}
        disabled={network.offline}
        class="flex items-center gap-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 {liked
          ? 'text-accent'
          : 'text-stone-400 hover:text-stone-600'}"
        aria-pressed={liked}
        aria-label="Like"
      >
        <span
          class="text-base"
          class:animate-like-pop={animateLike}
          onanimationend={() => (animateLike = false)}>{liked ? '♥' : '♡'}</span
        >{count}
      </button>
      {#if network.offline}
        <span class="text-stone-300" aria-label="Share unavailable offline"
          >⇪</span
        >
      {:else}
        <a
          href="/share/{quote.id}"
          class="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600"
          aria-label="Share"
        >
          <span class="text-base">⇪</span>{quote.downloads_count}
        </a>
      {/if}
    </div>
  </div>
</article>
