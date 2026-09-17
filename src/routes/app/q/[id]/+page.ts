import * as localdb from '$lib/localdb'
import { getCachedSimilarQuotes } from '$lib/api/quotes'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params }) => {
  const quote = await localdb.getCachedQuote(params.id)
  // SvelteKit awaits this `load`, so having similar quotes ready here
  // (rather than fetched later inside QuoteList after mount) means they're
  // already in the DOM by the time a view transition's "after" snapshot is
  // taken — needed for a quote that was also visible on the previous page
  // to morph into its card here instead of just vanishing. Cache-only, so
  // this never blocks first paint on a network round-trip; the page
  // refreshes from the network itself after mount.
  const similar = quote
    ? await getCachedSimilarQuotes(quote).catch(() => [])
    : []
  return { id: params.id, quote, similar }
}
