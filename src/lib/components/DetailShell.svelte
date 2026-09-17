<script lang="ts">
  let { children }: { children: import('svelte').Snippet } = $props()
</script>

<div class="mx-auto h-full max-w-lg overflow-y-auto px-4 py-6 lg:max-w-4xl">
  {@render children()}
</div>
