<script lang="ts">
  import DetailShell from '$lib/components/DetailShell.svelte'

  let { children }: { children: import('svelte').Snippet } = $props()
</script>

<DetailShell>
  {@render children()}
</DetailShell>
