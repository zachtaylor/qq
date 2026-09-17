<script lang="ts">
  import { goto } from '$app/navigation'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'

  function back() {
    history.length > 1 ? history.back() : goto('/app')
  }
</script>

<button
  onclick={back}
  aria-label="Back"
  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-stone-600 shadow-sm ring-1 ring-stone-200 backdrop-blur-xl hover:text-stone-900"
>
  <ArrowLeft class="h-5 w-5" />
</button>
