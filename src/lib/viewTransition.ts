/**
 * Tags the quote-text/author elements inside a clicked link with a
 * view-transition-name right before navigation, instead of tagging them
 * statically in markup. Static tagging breaks when the same quote/author
 * appears in more than one place at once (e.g. a permanently-mounted tab
 * panel behind a routed detail page) — the browser throws "duplicate
 * view-transition-name" because every copy carries the name all the time.
 * Tagging imperatively on click means only the element the user actually
 * interacted with ever carries the name, so duplicates elsewhere are inert.
 *
 * Back-navigation has no click to hook, so callers should also statically
 * tag every row on the page being returned to (see `dedupeTransitionKey`),
 * rather than guessing which one was clicked — this function's inline style
 * just takes precedence for forward navigation.
 */
const imperativelyTagged = new Set<HTMLElement>()

export function tagQuoteTransition(
  container: HTMLElement,
  quoteId: string,
  authorSlug: string,
) {
  const textEl = container.querySelector<HTMLElement>(
    '[data-transition="quote-text"]',
  )
  const authorEl = container.querySelector<HTMLElement>(
    '[data-transition="author"]',
  )
  // If the clicked element already carries a Svelte-managed static name
  // (e.g. the row is on a page like Settings where it's also eligible for
  // static tagging), leave it alone entirely — setting the same value is
  // redundant, and registering it here would make clearQuoteTransitionTags
  // blank out a name Svelte still expects to be there.
  //
  // Also check the rest of the document for another element already
  // holding the same name: a list can render the same quote/author more
  // than once (e.g. the Likes list showing two quotes by one author), and
  // the static tagger only ever claims the *first* occurrence — a later,
  // untagged occurrence must not imperatively claim a name some other
  // element on the page still holds, or the browser throws "duplicate
  // view-transition-name".
  const quoteTextName = `quote-text-${quoteId}`
  const authorName = `author-${authorSlug}`
  if (
    textEl &&
    !textEl.style.viewTransitionName &&
    !document.querySelector(`[style*="view-transition-name: ${quoteTextName}"]`)
  ) {
    textEl.style.viewTransitionName = quoteTextName
    imperativelyTagged.add(textEl)
  }
  if (
    authorEl &&
    !authorEl.style.viewTransitionName &&
    !document.querySelector(`[style*="view-transition-name: ${authorName}"]`)
  ) {
    authorEl.style.viewTransitionName = authorName
    imperativelyTagged.add(authorEl)
  }
}

/**
 * Clears inline view-transition-names set by `tagQuoteTransition`, once the
 * transition has settled. Only clears elements tagged *imperatively* here —
 * elements carrying a static, Svelte-managed view-transition-name (the
 * `style={...}` props on QuoteRow/QuoteFeed) must be left alone. Svelte only
 * rewrites a `style` attribute when its derived value changes between
 * renders; clearing it out from under Svelte via direct DOM mutation would
 * leave it permanently blank on any later render where the derived value is
 * unchanged (e.g. navigating back to the same list) — which is exactly the
 * bug this used to cause.
 */
export function clearQuoteTransitionTags() {
  for (const el of imperativelyTagged) {
    el.style.viewTransitionName = ''
  }
  imperativelyTagged.clear()
}

/**
 * Tracks keys (e.g. quote ids, author slugs) already claimed by a static
 * view-transition-name tag within one render pass of a list. A list can
 * contain the same quote/author more than once (e.g. downloading the same
 * quote twice) — only the first occurrence of each key should get the name,
 * since two elements can't carry the same view-transition-name at once.
 * Construct one fresh per list render (it's a plain Set, not a store).
 */
export function createTransitionKeyTracker() {
  const seen = new Set<string>()
  return (key: string) => (seen.has(key) ? false : (seen.add(key), true))
}
