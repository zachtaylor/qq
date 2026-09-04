<script lang="ts">
  import type { Quote } from '$lib/types'
  import { tagQuoteTransition } from '$lib/viewTransition'

  let {
    quote,
    timestamp,
    tagQuoteText = true,
    tagAuthor = true,
  }: {
    quote: Pick<Quote, 'id' | 'text' | 'author'>
    timestamp?: string
    /** Whether this row may claim the static quote-text-{id}/author-{slug}
     *  view-transition-names. A list can contain the same quote or author
     *  more than once (e.g. downloading a quote twice), and only one
     *  element can carry a given name at once — callers should dedupe by
     *  quote id / author slug across the list and pass false for repeats. */
    tagQuoteText?: boolean
    tagAuthor?: boolean
  } = $props()
</script>

<a
  href="/q/{quote.id}"
  class="block"
  onclick={(e) =>
    tagQuoteTransition(e.currentTarget, quote.id, quote.author.slug)}
>
  <p
    data-transition="quote-text"
    class="line-clamp-2 font-serif text-sm text-stone-800"
    style={tagQuoteText ? `view-transition-name: quote-text-${quote.id}` : ''}
  >
    "{quote.text}"
  </p>
  <p
    data-transition="author"
    class="mt-1 text-xs text-stone-400"
    style={tagAuthor ? `view-transition-name: author-${quote.author.slug}` : ''}
  >
    — {quote.author.name}{timestamp ? ` · ${timestamp}` : ''}
  </p>
</a>
