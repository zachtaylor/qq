import type { Session } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';

let session = $state<Session | null>(null);
let ready = $state(false);

supabase.auth.getSession().then(({ data }) => {
	session = data.session;
	ready = true;
});

supabase.auth.onAuthStateChange((_event, s) => {
	session = s;
});

/** Returns the current session, signing in anonymously on first use. */
export async function ensureSession(): Promise<Session> {
	if (session) return session;
	const { data, error } = await supabase.auth.signInAnonymously();
	if (error || !data.session) throw error ?? new Error('anonymous sign-in failed');
	session = data.session;
	return data.session;
}

export const auth = {
	get session() {
		return session;
	},
	get ready() {
		return ready;
	},
	get userId() {
		return session?.user.id ?? null;
	}
};
