import * as localdb from '$lib/localdb'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params }) => {
  const author = await localdb.getCachedAuthorBySlug(params.slug)
  const quotes = author ? await localdb.getCachedQuotesByAuthor(author.id) : []
  return { slug: params.slug, author, quotes }
}
