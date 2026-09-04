import { supabase } from '$lib/supabase'
import { network } from '$lib/stores/network.svelte'
import * as localdb from '$lib/localdb'
import type { Author } from '$lib/types'

/** How long a cached author profile is considered fresh enough to skip a
 *  network refetch — profile fields (bio/portrait/years) rarely change. */
export const AUTHOR_STALE_MS = 30 * 60 * 1000

/**
 * Fetches an author profile, unless `force` is false and the cached copy
 * is still within AUTHOR_STALE_MS — in which case the cached profile is
 * returned as-is (no network call). `force: true` always refetches.
 */
export async function fetchAuthorBySlug(
  slug: string,
  force = false,
): Promise<Author | null> {
  if (network.offline) return localdb.getCachedAuthorBySlug(slug)
  if (!force) {
    const age = await localdb.getAuthorAge(slug)
    if (age !== null && age < AUTHOR_STALE_MS) {
      const cached = await localdb.getCachedAuthorBySlug(slug)
      if (cached) return cached
    }
  }
  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (data) {
    localdb.cacheAuthor(data)
    localdb.markAuthorFetched(slug)
  }
  return data
}
