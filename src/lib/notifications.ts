import { Capacitor } from '@capacitor/core'
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications'
import { goto } from '$app/navigation'
import { fetchUpcomingQuoteOfDay, randomQuote } from '$lib/api/quotes'

const WINDOW_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000
const DAILY_ID_PREFIX = 10_000

function idForDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const daysSinceEpoch = Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
  const daysOffset = Math.floor(Date.UTC(2026, 7, 4) / DAY_MS)
  return DAILY_ID_PREFIX + daysSinceEpoch - daysOffset
}

const FALLBACK = {
  text: 'The unexamined life is not worth living.',
  author: 'Socrates',
}

export function notificationsAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Tapping the notification should open that day's specific quote. Registered
 * once at startup
 */
export function registerNotificationTapHandler(): void {
  if (!notificationsAvailable()) return
  LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (action) => {
      const quoteId = action.notification.extra?.quoteId
      if (quoteId) goto(`/q/${quoteId}`)
    },
  )
}

async function pendingDailyIds() {
  const pending = await LocalNotifications.getPending()
  return new Set(
    pending.notifications
      .filter((n) => n.id >= DAILY_ID_PREFIX)
      .map((n) => n.id),
  )
}

/**
 * Schedules one notification per day in the upcoming window that isn't
 * already pending
 */
export async function scheduleDaily(
  hour: number,
  minute: number,
): Promise<boolean> {
  if (!notificationsAvailable()) return false
  const perm = await LocalNotifications.requestPermissions()
  if (perm.display !== 'granted') return false

  const alreadyPending = await pendingDailyIds()
  const upcoming = await fetchUpcomingQuoteOfDay(WINDOW_DAYS).catch(() => [])
  const now = new Date()

  const notifications: LocalNotificationSchema[] = upcoming
    .filter(({ date }) => !alreadyPending.has(idForDate(date)))
    .map(({ date, quote }) => {
      const [y, m, d] = date.split('-').map(Number)
      return {
        id: idForDate(date),
        title: `qotd · ${date}`,
        body: `“${quote.text}” — ${quote.author.name}`,
        extra: { quoteId: quote.id },
        schedule: {
          at: new Date(y, m - 1, d, hour, minute),
          allowWhileIdle: true,
        },
      }
    })
    // Drop any day whose fire time already passed (only possible for
    // today, if the app is opened after today's scheduled hour:minute) —
    // scheduling a past `at:` would otherwise fire immediately.
    .filter((n) => n.schedule.at.getTime() > now.getTime())

  await LocalNotifications.schedule({ notifications })
  localStorage.setItem('qq.dailyTime', JSON.stringify({ hour, minute }))
  return true
}

export async function cancelDaily(): Promise<void> {
  if (!notificationsAvailable()) return
  const ids = await pendingDailyIds()
  if (ids.size > 0) {
    await LocalNotifications.cancel({
      notifications: [...ids].map((id) => ({ id })),
    })
  }
  localStorage.removeItem('qq.dailyTime')
}

export function getDailyTime(): { hour: number; minute: number } | null {
  try {
    const raw = localStorage.getItem('qq.dailyTime')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
