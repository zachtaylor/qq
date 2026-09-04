import type { Download, LikedQuote } from '$lib/types'
import * as localdb from '$lib/localdb'

let likes: LikedQuote[] | undefined = $state(undefined)
let downloads: Download[] | undefined = $state(undefined)
let localLoadPromise: Promise<void> | null = null

export const userContentCache = {
  get likes(): LikedQuote[] | undefined {
    return likes
  },
  get downloads(): Download[] | undefined {
    return downloads
  },
  setLikes(value: LikedQuote[]): void {
    likes = value
  },
  setDownloads(value: Download[]): void {
    downloads = value
  },
  invalidate(): void {
    likes = undefined
    downloads = undefined
    localLoadPromise = null
  },
}

/** Fills the cache instantly from the on-device SQLite mirror, if not already populated. Cheap and safe to call repeatedly. */
export function loadUserContent(): Promise<void> {
  if (likes !== undefined && downloads !== undefined) return Promise.resolve()
  if (!localLoadPromise) {
    localLoadPromise = Promise.all([
      localdb.getCachedLikedQuotes(),
      localdb.getCachedDownloadHistory(),
    ]).then(([localLikes, localDownloads]) => {
      if (likes === undefined) likes = localLikes
      if (downloads === undefined) downloads = localDownloads
    })
  }
  return localLoadPromise
}
