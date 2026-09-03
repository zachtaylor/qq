import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { randomQuote } from '$lib/api/quotes';

const DAILY_ID = 1;

const FALLBACK = { text: 'The unexamined life is not worth living.', author: 'Socrates' };

export function notificationsAvailable(): boolean {
	return Capacitor.isNativePlatform();
}

export async function scheduleDaily(hour: number, minute: number): Promise<boolean> {
	if (!notificationsAvailable()) return false;
	const perm = await LocalNotifications.requestPermissions();
	if (perm.display !== 'granted') return false;

	const quote = (await randomQuote().catch(() => null)) ?? FALLBACK;
	await LocalNotifications.schedule({
		notifications: [
			{
				id: DAILY_ID,
				title: 'qq · quote of the day',
				body: `“${quote.text}” — ${quote.author}`,
				schedule: { on: { hour, minute }, allowWhileIdle: true }
			}
		]
	});
	localStorage.setItem('qq.dailyTime', JSON.stringify({ hour, minute }));
	return true;
}

export async function cancelDaily(): Promise<void> {
	if (!notificationsAvailable()) return;
	await LocalNotifications.cancel({ notifications: [{ id: DAILY_ID }] });
	localStorage.removeItem('qq.dailyTime');
}

export function getDailyTime(): { hour: number; minute: number } | null {
	try {
		const raw = localStorage.getItem('qq.dailyTime');
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}
