import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { defineCustomElements as initJeepSqlite } from 'jeep-sqlite/loader'
import { setupNotifications } from '$lib/notifications'
import { ready as localdbReady } from '$lib/localdb'

console.debug('[boot]', performance.now(), 'start')

// Kick off the SQLite connection
localdbReady().then((ok) =>
  console.debug('[boot]', performance.now(), 'localdbReady', ok),
)

if (Capacitor.isNativePlatform()) {
  // Capacitor's default Android back-button behavior exits the app
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back()
    else App.exitApp()
  })

  setupNotifications()

  // App is light-mode only
  StatusBar.setStyle({ style: Style.Light })
} else {
  initJeepSqlite(window)
}
