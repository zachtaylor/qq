<script lang="ts">
  let {
    value = $bindable(),
    disabled = false,
  }: { value: string; disabled?: boolean } = $props()

  let picker = $state<HTMLInputElement>()

  // The native picker only understands #rrggbb — seed it with the current
  // value when it looks like a hex color, otherwise leave it at its last
  // value (e.g. the user typed a gradient or an rgb()/named color).
  let pickerValue = $derived(/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000')
</script>

<div class="flex gap-1.5">
  <input
    type="text"
    bind:value
    {disabled}
    spellcheck="false"
    class="h-10 w-full min-w-0 rounded-lg border border-stone-200 px-2 text-sm disabled:opacity-40"
  />
  <button
    type="button"
    onclick={() => picker?.showPicker()}
    {disabled}
    aria-label="Pick a color"
    class="h-10 w-10 shrink-0 rounded-lg ring-1 ring-stone-200 disabled:opacity-40"
    style="background: {value};"
  ></button>
  <input
    bind:this={picker}
    type="color"
    value={pickerValue}
    {disabled}
    oninput={(e) => (value = e.currentTarget.value)}
    class="sr-only"
    tabindex="-1"
  />
</div>
