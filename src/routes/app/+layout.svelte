<script lang="ts">
  // The boot loading screen (see app.html) is only removed here, since this
  // layout only mounts once +layout.ts's load() has resolved.
  import { SplashScreen } from '@capacitor/splash-screen'

  SplashScreen.hide()
  window.fadeOutBootLoading?.()

  let { children } = $props()
</script>

{@render children()}
