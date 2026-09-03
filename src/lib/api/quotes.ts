import { supabase } from '$lib/supabase';
import { auth, ensureSession } from '$lib/stores/session.svelte';
import type { Quote } from '$lib/types';

const QUOTE_SELECT = 'id, text, author_id, created_at, author:authors(name, slug), likes(user_id)';

function toQuote(row: any): Quote {
	const likes: { user_id: string }[] = row.likes ?? [];
	return {
		id: row.id,
		text: row.text,
		author_id: row.author_id,
		created_at: row.created_at,
		author: row.author,
		like_count: row.like_count ?? likes.length,
		liked_by_me: likes.some((l) => l.user_id === auth.userId)
	};
}

export async function fetchFeed(limit = 50): Promise<Quote[]> {
	const { data, error } = await supabase
		.from('quotes')
		.select(QUOTE_SELECT)
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) throw error;
	return data.map(toQuote);
}

export async function fetchTrending(limit = 25): Promise<Quote[]> {
	const { data, error } = await supabase.rpc('trending_quotes', { max_rows: limit });
	if (error) throw error;
	const ids = (data as { id: string; like_count: number }[]).map((r) => r.id);
	if (ids.length === 0) return [];
	const counts = new Map((data as any[]).map((r) => [r.id, r.like_count]));
	const { data: rows, error: err2 } = await supabase.from('quotes').select(QUOTE_SELECT).in('id', ids);
	if (err2) throw err2;
	return rows
		.map((r) => toQuote({ ...r, like_count: counts.get(r.id) }))
		.sort((a, b) => b.like_count - a.like_count);
}

export async function fetchQuotesByAuthor(authorId: string): Promise<Quote[]> {
	const { data, error } = await supabase
		.from('quotes')
		.select(QUOTE_SELECT)
		.eq('author_id', authorId)
		.order('created_at', { ascending: false });
	if (error) throw error;
	return data.map(toQuote);
}

export async function setLiked(quoteId: string, liked: boolean): Promise<void> {
	const session = await ensureSession();
	if (liked) {
		const { error } = await supabase
			.from('likes')
			.upsert({ quote_id: quoteId, user_id: session.user.id });
		if (error) throw error;
	} else {
		const { error } = await supabase
			.from('likes')
			.delete()
			.eq('quote_id', quoteId)
			.eq('user_id', session.user.id);
		if (error) throw error;
	}
}

export async function submitQuote(text: string, authorName: string): Promise<void> {
	const session = await ensureSession();
	const { data: author, error } = await supabase
		.rpc('get_or_create_author', { author_name: authorName })
		.single();
	if (error) throw error;
	const { error: err2 } = await supabase.from('quotes').insert({
		text,
		author_id: (author as { id: string }).id,
		submitted_by: session.user.id
	});
	if (err2) throw err2;
}

export async function randomQuote(): Promise<{ text: string; author: string } | null> {
	const { data } = await supabase.rpc('random_quote').single();
	if (!data) return null;
	const d = data as { text: string; author_name: string };
	return { text: d.text, author: d.author_name };
}
