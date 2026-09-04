<script lang="ts">
  import { page } from '$app/state'
  import { goto, invalidate } from '$app/navigation'
  import { fetchQuoteById, recordDownload } from '$lib/api/quotes'
  import {
    renderCard,
    shareCardImage,
    fileToBackgroundImage,
    CARD_PRESETS,
    FONT_OPTIONS,
    LAYOUT_OPTIONS,
    FONT_SIZE_OPTIONS,
    type CardStyle,
  } from '$lib/shareCard'
  import ColorField from '$lib/components/ColorField.svelte'

  let id = $derived(page.params.id!)
  let quotePromise = $derived(fetchQuoteById(id))

  let activePreset = $state(CARD_PRESETS[0])
  let style = $state<CardStyle>({ ...CARD_PRESETS[0].style })
  let canvas = $state<HTMLCanvasElement>()
  let busy = $state(false)
  let error = $state('')
  let loadedQuote = $state<{ text: string; author: { name: string } } | null>(
    null,
  )

  function selectPreset(preset: (typeof CARD_PRESETS)[number]) {
    // Only overwrite fields the user hasn't already customized away from
    // the current preset's default — so e.g. picking a new font and then
    // switching style presets keeps the font choice.
    const next = { ...style }
    for (const key of Object.keys(preset.style) as (keyof CardStyle)[]) {
      if (style[key] === activePreset.style[key]) {
        ;(next[key] as CardStyle[typeof key]) = preset.style[key]
      }
    }
    activePreset = preset
    style = next
  }

  function resetField(key: keyof CardStyle) {
    style = { ...style, [key]: activePreset.style[key] }
  }

  let imageBusy = $state(false)

  async function onImageSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    imageBusy = true
    try {
      style = { ...style, backgroundImage: await fileToBackgroundImage(file) }
    } catch {
      error = 'Could not load that image.'
    } finally {
      imageBusy = false
      ;(e.target as HTMLInputElement).value = ''
    }
  }

  function clearImage() {
    style = { ...style, backgroundImage: null }
  }

  $effect(() => {
    quotePromise.then((quote) => {
      loadedQuote = quote
    })
  })

  $effect(() => {
    const quote = loadedQuote
    const currentCanvas = canvas
    // Snapshot every field explicitly — reading the `style` object
    // reference alone doesn't register per-property deps reliably enough
    // here since it's passed on into an async function boundary.
    const currentStyle: CardStyle = {
      background: style.background,
      backgroundImage: style.backgroundImage,
      textColor: style.textColor,
      accentColor: style.accentColor,
      font: style.font,
      authorFont: style.authorFont,
      layout: style.layout,
      fontSize: style.fontSize,
      authorFontSize: style.authorFontSize,
    }
    if (!quote || !currentCanvas) return
    const signal = { cancelled: false }
    renderCard(
      currentCanvas,
      { text: quote.text, authorName: quote.author.name },
      currentStyle,
      signal,
    )
    return () => {
      signal.cancelled = true
    }
  })

  function back() {
    history.length > 1 ? history.back() : goto('/app')
  }

  async function onShare() {
    if (!canvas || !loadedQuote) return
    if (busy) return
    busy = true
    error = ''
    try {
      await shareCardImage(canvas)
      recordDownload(id, style)
        .then(() => invalidate(`quote:${id}`))
        .catch((e) => console.error('recordDownload failed', e))
    } catch {
      error = 'Could not share the card. Try again.'
    } finally {
      busy = false
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="mx-auto max-w-lg px-4 pt-6 pb-6 lg:max-w-4xl">
    <div class="mb-4 flex items-center gap-2">
      <button
        onclick={back}
        aria-label="Back"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg text-stone-600 shadow-sm ring-1 ring-stone-200 backdrop-blur-xl hover:text-stone-900"
      >
        ←
      </button>
      <h1 class="flex-1 text-center text-xl font-bold text-stone-900">
        Share this quote
      </h1>
      <div class="w-10 shrink-0"></div>
    </div>

    {#if loadedQuote}
      <div class="lg:grid lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-8">
        <div class="lg:sticky lg:top-6">
          <div
            class="mb-5 overflow-hidden rounded-2xl shadow-sm ring-1 ring-stone-200 lg:mb-0"
          >
            <canvas bind:this={canvas} class="block w-full"></canvas>
          </div>

          {#if error}
            <p class="mt-3 hidden text-sm text-red-600 lg:block">{error}</p>
          {/if}

          <button
            onclick={onShare}
            disabled={busy}
            class="mt-5 hidden w-full rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-50 lg:block"
          >
            {busy ? 'Preparing…' : 'Share card'}
          </button>
        </div>

        <div>
          <div class="mb-5">
            <p class="mb-2 text-sm font-medium text-stone-600">Style</p>
            <div class="flex flex-wrap gap-2">
              {#each CARD_PRESETS as preset (preset.name)}
                <button
                  onclick={() => selectPreset(preset)}
                  class="rounded-full px-3 py-1.5 text-sm ring-1 transition-colors {activePreset.name ===
                  preset.name
                    ? 'ring-2 ring-accent'
                    : 'ring-stone-200 hover:ring-stone-300'}"
                  style="background: {preset.style.background}; color: {preset
                    .style.textColor};"
                >
                  {preset.name}
                </button>
              {/each}
            </div>
          </div>

          <div class="mb-5">
            <span
              class="mb-2 flex items-center justify-between text-sm font-medium text-stone-600"
            >
              Background image
              {#if style.backgroundImage}
                <button
                  onclick={clearImage}
                  class="text-xs text-accent hover:underline"
                >
                  Remove
                </button>
              {/if}
            </span>
            <label
              class="flex h-24 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-400 hover:border-stone-400"
            >
              {#if imageBusy}
                Loading…
              {:else if style.backgroundImage}
                <img
                  src={style.backgroundImage}
                  alt=""
                  class="h-full w-full rounded-xl object-cover"
                />
              {:else}
                Tap to upload a photo
              {/if}
              <input
                type="file"
                accept="image/*"
                class="hidden"
                onchange={onImageSelected}
              />
            </label>
          </div>

          <div class="mb-6 grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Background
                {#if style.background !== activePreset.style.background}
                  <button
                    onclick={() => resetField('background')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <ColorField
                bind:value={style.background}
                disabled={!!style.backgroundImage}
              />
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Text
                {#if style.textColor !== activePreset.style.textColor}
                  <button
                    onclick={() => resetField('textColor')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <ColorField bind:value={style.textColor} />
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Accent
                {#if style.accentColor !== activePreset.style.accentColor}
                  <button
                    onclick={() => resetField('accentColor')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <ColorField bind:value={style.accentColor} />
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Layout
                {#if style.layout !== activePreset.style.layout}
                  <button
                    onclick={() => resetField('layout')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <select
                bind:value={style.layout}
                class="h-10 w-full rounded-lg ring-1 ring-stone-200"
              >
                {#each LAYOUT_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Quote font
                {#if style.font !== activePreset.style.font}
                  <button
                    onclick={() => resetField('font')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <select
                bind:value={style.font}
                class="h-10 w-full rounded-lg ring-1 ring-stone-200"
              >
                {#each FONT_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Author font
                {#if style.authorFont !== activePreset.style.authorFont}
                  <button
                    onclick={() => resetField('authorFont')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <select
                bind:value={style.authorFont}
                class="h-10 w-full rounded-lg ring-1 ring-stone-200"
              >
                {#each FONT_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Quote size
                {#if style.fontSize !== activePreset.style.fontSize}
                  <button
                    onclick={() => resetField('fontSize')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <select
                bind:value={style.fontSize}
                class="h-10 w-full rounded-lg ring-1 ring-stone-200"
              >
                {#each FONT_SIZE_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="flex flex-col gap-1 text-sm text-stone-600">
              <span class="flex items-center justify-between">
                Author size
                {#if style.authorFontSize !== activePreset.style.authorFontSize}
                  <button
                    onclick={() => resetField('authorFontSize')}
                    class="text-xs text-accent hover:underline"
                  >
                    Reset
                  </button>
                {/if}
              </span>
              <select
                bind:value={style.authorFontSize}
                class="h-10 w-full rounded-lg ring-1 ring-stone-200"
              >
                {#each FONT_SIZE_OPTIONS as opt (opt.value)}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
          </div>

          {#if error}
            <p class="mb-3 text-sm text-red-600 lg:hidden">{error}</p>
          {/if}
        </div>
      </div>

      <div class="h-20 lg:hidden"></div>
    {:else}
      <p class="py-12 text-center text-sm text-stone-400">Quote not found.</p>
    {/if}
  </div>

  {#if loadedQuote}
    <div
      class="fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 py-6 lg:hidden"
    >
      <button
        onclick={onShare}
        disabled={busy}
        class="w-full max-w-lg rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-50"
      >
        {busy ? 'Preparing…' : 'Share card'}
      </button>
    </div>
  {/if}
</div>
