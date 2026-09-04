import { redirect } from '@sveltejs/kit'
import { Capacitor } from '@capacitor/core'

export function load() {
  if (Capacitor.isNativePlatform()) redirect(307, '/app')
}
