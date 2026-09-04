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
  import { createTransitionKeyTracker } from '$lib/viewTransition'
  import { fetchLikedQuotes, fetchDownloadHistory } from '$lib/api/quotes'
  import {
    userContentCache,
    loadUserContent,
  } from '$lib/stores/userContentCache.svelte'
  import { network } from '$lib/stores/network.svelte'

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
    Promise.all([fetchLikedQuotes(), fetchDownloadHistory()]).then(
      ([likeResult, downloadResult]) => {
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

  // Fresh trackers per render, shared across the Likes and Downloads
  // sections: a view-transition-name can only be claimed by one element on
  // the whole page at once, and the same quote/author can appear in both
  // sections (liked *and* downloaded) — per-section trackers can't see that
  // and would let both sections tag it, producing a duplicate
  // view-transition-name that aborts the transition. Recreated whenever
  // either list changes (a once-created tracker would otherwise leak claims
  // across renders once `likes`/`downloads` are replaced by refetches,
  // permanently blocking re-tagging) and whenever this tab becomes active
  // again (this panel never unmounts when the user swipes to another tab,
  // so without depending on `active` here, returning to Settings would keep
  // the same tracker instance from before — already exhausted by the
  // earlier render — and every row's static tag would silently stay
  // stripped for the next /settings/likes or /settings/downloads trip).
  let claimQuoteText = $derived.by(() => {
    likes
    downloads
    active
    return createTransitionKeyTracker()
  })
  let claimAuthor = $derived.by(() => {
    likes
    downloads
    active
    return createTransitionKeyTracker()
  })

  let email = $state('')
  let authStatus = $state('')
  let authBusy = $state(false)

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
    if (enabled) {
      const previous = getDailyTime()
      if (previous && (previous.hour !== hour || previous.minute !== minute)) {
        await cancelDaily()
      }
      const ok = await scheduleDaily(hour, minute)
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
        <button
          onclick={onGoogle}
          disabled={authBusy}
          class="flex-1 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          Continue with Google
        </button>
        <button
          onclick={onApple}
          disabled={authBusy}
          class="flex-1 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          Continue with Apple
        </button>
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
    {/if}
    {#if authStatus}
      <p class="mt-2 text-sm text-stone-500">{authStatus}</p>
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
        <input type="checkbox" bind:checked={enabled} class="accent-accent" />
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
      {/if}
      <button
        onclick={apply}
        class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Save
      </button>
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
        <a href="/settings/likes" class="text-sm text-accent hover:underline"
          >See all</a
        >
      </div>

      {#if likes.length === 0}
        <p class="text-sm text-stone-400">Quotes you like will show up here.</p>
      {:else}
        <ul class="divide-y divide-stone-100">
          {#each likes.slice(0, 3) as quote (quote.id)}
            <li class="py-3">
              <QuoteRow
                {quote}
                tagQuoteText={active && claimQuoteText(quote.id)}
                tagAuthor={active && claimAuthor(quote.author.slug)}
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
          href="/settings/downloads"
          class="text-sm text-accent hover:underline">See all</a
        >
      </div>

      {#if downloads.length === 0}
        <p class="text-sm text-stone-400">
          Cards you download will show up here.
        </p>
      {:else}
        <ul class="divide-y divide-stone-100">
          {#each downloads.slice(0, 3) as download (download.createdAt)}
            <li class="py-3">
              <QuoteRow
                quote={{
                  id: download.quoteId,
                  text: download.quote.text,
                  author: download.quote.author,
                }}
                meta={formatDate(download.createdAt)}
                tagQuoteText={active && claimQuoteText(download.quoteId)}
                tagAuthor={active &&
                  claimAuthor(download.quote.author.slug)}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>
