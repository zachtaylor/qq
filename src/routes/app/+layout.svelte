<script lang="ts">
  // The boot loading screen (see app.html) is only removed here, since this
  // layout only mounts once +layout.ts's load() — localdb + auth + feed
  // seeding — has resolved. See the comment on that load() for why.
  window.fadeOutBootLoading?.()

  let { children } = $props()
</script>

{@render children()}
