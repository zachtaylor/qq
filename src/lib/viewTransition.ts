/**
 * Deduplicates a list of view-transition-name candidates: the View
 * Transitions API throws if the same name is assigned to more than one
 * element at once, and this app can render the same quote/author in
 * several places on one page (a "Similar quotes" list repeating an
 * author, a permanently-mounted tab panel behind a routed detail page,
 * etc). Pure and synchronous — call it once per render (typically from a
 * `$derived`) over every candidate name a component is about to assign,
 * in the order they'll render. The first occurrence of each name wins;
 * later duplicates get `false` and must render with no
 * `view-transition-name` at all.
 *
 * `taken` seeds the dedupe with names some other part of the page has
 * already claimed (e.g. a detail page's own header), so a list rendered
 * underneath it never re-claims one of those — see `QuoteList`.
 */
export function dedupeTransitionNames(
  names: readonly string[],
  taken: ReadonlySet<string> = new Set(),
): boolean[] {
  const seen = new Set(taken)
  return names.map((name) => {
    if (!name || seen.has(name)) return false
    seen.add(name)
    return true
  })
}

/**
 * Tags the quote-text/author elements inside a clicked link with a
 * view-transition-name right before navigation, instead of relying only on
 * static tagging. Static tagging alone breaks when the same quote/author
 * appears in more than one place at once and neither copy is "the" static
 * winner (e.g. a permanently-mounted tab panel behind a routed detail
 * page) — the browser throws "duplicate view-transition-name" because both
 * copies would carry the name. Tagging imperatively on click means the
 * element the user actually interacted with always gets the name,
 * regardless of what static tagging decided elsewhere.
 *
 * Back-navigation has no click to hook, so pages also statically tag their
 * own elements (see `dedupeTransitionNames`) for that direction — this
 * function's inline style just takes precedence for forward navigation.
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
 * elements carrying a static, Svelte-managed view-transition-name must be
 * left alone. Svelte only rewrites a `style` attribute when its derived
 * value changes between renders; clearing it out from under Svelte via
 * direct DOM mutation would leave it permanently blank on any later render
 * where the derived value is unchanged (e.g. navigating back to the same
 * list) — which is exactly the bug this used to cause.
 */
export function clearQuoteTransitionTags() {
  for (const el of imperativelyTagged) {
    el.style.viewTransitionName = ''
  }
  imperativelyTagged.clear()
}

/**
 * Same idea as `tagQuoteTransition`, but for a single clicked tag chip
 * (`#tag` link) rather than a quote-text/author pair. Tag chips repeat far
 * more than quotes/authors do — the same tag can appear on every card in a
 * feed — so the clicked chip must always win the name regardless of which
 * copy static tagging picked as "the" first instance.
 */
export function tagChipTransition(chipEl: HTMLElement, tagSlug: string) {
  const name = `tag-${tagSlug}`
  if (
    chipEl.style.viewTransitionName ||
    document.querySelector(`[style*="view-transition-name: ${name}"]`)
  ) {
    return
  }
  chipEl.style.viewTransitionName = name
  imperativelyTagged.add(chipEl)
}
