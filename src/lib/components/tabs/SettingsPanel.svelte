<script lang="ts">
  import {
    notificationsAvailable,
    scheduleDaily,
    cancelDaily,
    getDailyTime,
  } from '$lib/notifications'
  import {
    auth,
    signInWithEmailOtp,
    signInWithGoogle,
    signInWithApple,
    signOut,
  } from '$lib/stores/session.svelte'
  import QuoteRow from '$lib/components/QuoteRow.svelte'
  import { dedupeTransitionNames } from '$lib/viewTransition'
  import {
    downloadDataPack,
    DATA_PACK_LIMIT,
    fetchQuoteOfDayRange,
    fetchRandomFeed,
    fetchTrending,
  } from '$lib/api/quotes'
  import { fetchUserContentBundle } from '$lib/api/userContent'
  import {
    userContentCache,
    loadUserContent,
  } from '$lib/stores/userContentCache.svelte'
  import { feedCache } from '$lib/stores/feedCache.svelte'
  import { network } from '$lib/stores/network.svelte'
  import * as localdb from '$lib/localdb'
  import type { StorageEstimate } from '$lib/localdb'

  let { active = true }: { active?: boolean } = $props()

  let likes = $state(userContentCache.likes ?? [])
  let downloads = $state(userContentCache.downloads ?? [])

  // Fetch once when the tab first becomes active, not every time the
  // fetch's own result writes back into userContentCache: loadUserContent()
  // synchronously reads userContentCache's cached likes/downloads, so
  // calling setLikes()/setDownloads() from inside this same effect would
  // otherwise re-trigger it forever.
  let attempted = false

  $effect(() => {
    if (!active || attempted) return
    attempted = true
    loadUserContent().then(() => {
      likes = userContentCache.likes ?? []
      downloads = userContentCache.downloads ?? []
    })
    if (network.offline) return
    fetchUserContentBundle().then(
      ({ likes: likeResult, downloads: downloadResult }) => {
        userContentCache.setLikes(likeResult)
        userContentCache.setDownloads(downloadResult)
        likes = likeResult
        downloads = downloadResult
      },
    )
  })

  let saved = getDailyTime()
  let enabled = $state(saved !== null)
  let hour = $state(saved?.hour ?? 9)
  let minute = $state(saved?.minute ?? 0)
  let status = $state('')
  const available = notificationsAvailable()

  let email = $state('')
  let authStatus = $state('')
  let authBusy = $state(false)

  let storage = $state<StorageEstimate | null>(null)
  let dataPackBusy = $state(false)
  let dataPackStatus = $state('')
  let clearBusy = $state(false)

  async function refreshStorage() {
    storage = await localdb.getStorageEstimate()
  }

  $effect(() => {
    if (!active) return
    refreshStorage()
  })

  const previewLikes = $derived(active ? likes.slice(0, 3) : [])
  const previewDownloads = $derived(active ? downloads.slice(0, 3) : [])
  const previewQuoteTextNames = $derived([
    ...previewLikes.map((l) => `quote-text-${l.quote.id}`),
    ...previewDownloads.map((d) => `quote-text-${d.quoteId}`),
  ])
  const previewAuthorNames = $derived([
    ...previewLikes.map((l) => `author-${l.quote.author.slug}`),
    ...previewDownloads.map((d) => `author-${d.quote.author.slug}`),
  ])
  const previewTagQuoteText = $derived(
    dedupeTransitionNames(previewQuoteTextNames),
  )
  const previewTagAuthor = $derived(dedupeTransitionNames(previewAuthorNames))

  let dataPackMaxed = $derived((storage?.quoteCount ?? 0) >= DATA_PACK_LIMIT)

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function onDownloadDataPack() {
    dataPackStatus = ''
    dataPackBusy = true
    try {
      const count = await downloadDataPack()
      dataPackStatus = `Downloaded ${count} quotes for offline use.`
      await refreshStorage()
    } catch (err) {
      dataPackStatus =
        err instanceof Error ? err.message : 'Failed to download data pack.'
    } finally {
      dataPackBusy = false
    }
  }

  async function onClearCache() {
    clearBusy = true
    try {
      await localdb.clearCache()
      const [, , , { likes: likeResult, downloads: downloadResult }] =
        await Promise.all([
          fetchQuoteOfDayRange().then((quotes) => {
            if (quotes.length > 0) feedCache.set('day', quotes)
          }),
          fetchRandomFeed(50, true).then((quotes) => {
            if (quotes.length > 0) feedCache.set('random', quotes)
          }),
          fetchTrending().then((quotes) => {
            if (quotes.length > 0) feedCache.set('trending', quotes)
          }),
          fetchUserContentBundle(true),
        ])
      userContentCache.setLikes(likeResult)
      userContentCache.setDownloads(downloadResult)
      likes = likeResult
      downloads = downloadResult
      await refreshStorage()
    } finally {
      clearBusy = false
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  async function apply() {
    status = ''
    await cancelDaily()
    const ok = await scheduleDaily(hour, minute)
    status = ok ? 'Daily quote scheduled.' : 'Notification permission denied.'
  }

  async function onToggle() {
    status = ''
    if (enabled) {
      const ok = await scheduleDaily(hour, minute)
      enabled = ok
      status = ok ? 'Daily quote scheduled.' : 'Notification permission denied.'
    } else {
      await cancelDaily()
      status = 'Daily notification turned off.'
    }
  }

  async function onSendMagicLink() {
    authStatus = ''
    authBusy = true
    try {
      await signInWithEmailOtp(email)
      authStatus = 'Check your email for a sign-in link.'
    } catch (err) {
      authStatus =
        err instanceof Error ? err.message : 'Failed to send sign-in link.'
    } finally {
      authBusy = false
    }
  }

  async function onGoogle() {
    authStatus = ''
    authBusy = true
    try {
      await signInWithGoogle()
    } catch (err) {
      authStatus = err instanceof Error ? err.message : 'Google sign-in failed.'
    } finally {
      authBusy = false
    }
  }

  async function onApple() {
    authStatus = ''
    authBusy = true
    try {
      await signInWithApple()
    } catch (err) {
      authStatus = err instanceof Error ? err.message : 'Apple sign-in failed.'
    } finally {
      authBusy = false
    }
  }
</script>

<h1 class="mb-4 text-2xl font-bold text-stone-900">Settings</h1>

<div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
  <section
    class="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 lg:col-span-2"
  >
    <h2 class="mb-3 font-semibold text-stone-800">Account</h2>

    {#if auth.user}
      <p class="mb-3 text-sm text-stone-700">
        Signed in as <span class="font-medium"
          >{auth.user.email ?? auth.user.id}</span
        >. Your likes and downloads sync across devices.
      </p>
      <button
        onclick={signOut}
        class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
      >
        Sign out
      </button>
    {:else}
      <p class="mb-3 text-sm text-stone-400">
        Sign in to sync your likes and downloads across devices. Not required —
        everything works on this device without an account.
      </p>
      <div class="mb-3 flex flex-col gap-2 sm:flex-row">
        <!-- <button
          onclick={onGoogle}
          disabled={authBusy}
          class="flex-1 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          Continue with Google
        </button> -->
        <!-- <button
          onclick={onApple}
          disabled={authBusy}
          class="flex-1 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          Continue with Apple
        </button> -->
      </div>
      <div class="flex items-center gap-2">
        <input
          type="email"
          placeholder="you@example.com"
          bind:value={email}
          class="flex-1 rounded-lg border border-stone-300 p-2 text-sm"
        />
        <button
          onclick={onSendMagicLink}
          disabled={authBusy || !email}
          class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Email me a link
        </button>
      </div>
      {#if authStatus}
        <p class="mt-2 text-sm text-stone-500">{authStatus}</p>
      {/if}
    {/if}
  </section>

  <section
    class="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 lg:col-span-2"
  >
    <div class="flex items-center justify-between">
      <h2 class="font-semibold text-stone-800">Search</h2>
      <a href="/app/settings/search" class="text-sm text-accent hover:underline"
        >Search quotes</a
      >
    </div>
  </section>

  <section
    class="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 lg:col-span-2"
  >
    <h2 class="mb-3 font-semibold text-stone-800">Offline data</h2>

    {#if storage}
      <p class="mb-3 text-sm text-stone-500">
        {storage.quoteCount} quotes, {storage.authorCount} authors cached — {formatBytes(
          storage.bytes,
        )}.
      </p>
    {/if}

    <p class="mb-3 text-sm text-stone-500">
      Your cache grows naturally as you use the app. Download a batch of quotes,
      authors, and tags for offline browsing, or clear it here.
    </p>

    {#if !auth.user}
      <p class="mb-3 text-sm text-stone-400">
        Sign in to download a data pack for better offline support.
      </p>
    {:else if dataPackMaxed}
      <p class="mb-3 text-sm text-stone-400">
        You've already got a large offline cache — no need to download more.
      </p>
    {/if}

    <div class="flex flex-wrap gap-2">
      <button
        onclick={onDownloadDataPack}
        disabled={!auth.user ||
          dataPackMaxed ||
          dataPackBusy ||
          network.offline}
        class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {dataPackBusy ? 'Downloading…' : 'Download data pack'}
      </button>
      <button
        onclick={onClearCache}
        disabled={clearBusy}
        class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
      >
        {clearBusy ? 'Clearing…' : 'Clear cache'}
      </button>
    </div>
    {#if dataPackStatus}
      <p class="mt-2 text-sm text-stone-500">{dataPackStatus}</p>
    {/if}
  </section>

  <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
    <h2 class="mb-3 font-semibold text-stone-800">Daily quote notification</h2>

    {#if !available}
      <p class="text-sm text-stone-400">
        Available in the installed app (not in the browser).
      </p>
    {:else}
      <label class="mb-3 flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          bind:checked={enabled}
          onchange={onToggle}
          class="accent-accent"
        />
        Send me a quote every day
      </label>
      {#if enabled}
        <div class="mb-3 flex items-center gap-2 text-sm text-stone-700">
          <input
            type="number"
            min="0"
            max="23"
            bind:value={hour}
            class="w-16 rounded-lg border border-stone-300 p-2"
          />
          :
          <input
            type="number"
            min="0"
            max="59"
            bind:value={minute}
            class="w-16 rounded-lg border border-stone-300 p-2"
          />
          <span class="text-stone-400">(24h, device local time)</span>
        </div>
        <button
          onclick={apply}
          class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Save
        </button>
      {/if}
      {#if status}
        <p class="mt-2 text-sm text-stone-500">{status}</p>
      {/if}
    {/if}
  </section>

  <div class="mt-4 lg:mt-0">
    <section
      class="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold text-stone-800">Likes</h2>
        <a
          href="/app/settings/likes"
          class="text-sm text-accent hover:underline">See all</a
        >
      </div>

      {#if likes.length === 0}
        <p class="text-sm text-stone-400">Quotes you like will show up here.</p>
      {:else}
        <ul class="divide-y divide-stone-100">
          {#each previewLikes as like, i (like.quote.id)}
            <li class="py-3">
              <QuoteRow
                quote={like.quote}
                timestamp={formatDate(like.likedAt)}
                tagQuoteText={previewTagQuoteText[i]}
                tagAuthor={previewTagAuthor[i]}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold text-stone-800">Downloads</h2>
        <a
          href="/app/settings/downloads"
          class="text-sm text-accent hover:underline">See all</a
        >
      </div>

      {#if downloads.length === 0}
        <p class="text-sm text-stone-400">
          Cards you download will show up here.
        </p>
      {:else}
        <ul class="divide-y divide-stone-100">
          {#each previewDownloads as download, i (download.createdAt)}
            <li class="py-3">
              <QuoteRow
                quote={{
                  id: download.quoteId,
                  text: download.quote.text,
                  author_id: download.quote.author_id,
                  author: download.quote.author,
                }}
                timestamp={formatDate(download.createdAt)}
                tagQuoteText={previewTagQuoteText[previewLikes.length + i]}
                tagAuthor={previewTagAuthor[previewLikes.length + i]}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>
