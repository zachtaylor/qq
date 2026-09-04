<script lang="ts">
  import { network } from '$lib/stores/network.svelte'
</script>

{#if network.offline}
  <div
    class="fixed inset-x-0 top-0 z-20 bg-stone-800 py-1.5 text-center text-xs text-white"
  >
    Offline — showing saved quotes. Likes and downloads are unavailable.
  </div>
{/if}
