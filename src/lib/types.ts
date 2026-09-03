export interface Author {
	id: string;
	name: string;
	slug: string;
	bio: string | null;
	portrait_url: string | null;
	born_year: number | null;
	died_year: number | null;
}

export interface Quote {
	id: string;
	text: string;
	author_id: string;
	created_at: string;
	author: Pick<Author, 'name' | 'slug'>;
	like_count: number;
	liked_by_me: boolean;
}
