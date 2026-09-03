import { supabase } from '$lib/supabase';
import type { Author } from '$lib/types';

export async function fetchAuthorBySlug(slug: string): Promise<Author | null> {
	const { data, error } = await supabase.from('authors').select('*').eq('slug', slug).maybeSingle();
	if (error) throw error;
	return data;
}
