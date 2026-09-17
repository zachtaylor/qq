export interface Author {
  id: string
  name: string
  slug: string
  bio: string | null
  portrait_url: string | null
  born_year: number | null
  died_year: number | null
}

export interface Tag {
  id: string
  name: string
  slug: string
}

export interface Quote {
  id: string
  text: string
  author_id: string
  created_at: string
  like_count: number
  liked_by_me: boolean
  downloads_count: number
}

export interface QQuote extends Quote {
  author: Author
  tags: Tag[]
}

export interface Download {
  quoteId: string
  quote: Pick<QQuote, 'id' | 'text' | 'author_id' | 'author'>
  style: import('$lib/shareCard').CardStyle | null
  createdAt: string
}

export interface LikedQuote {
  quote: QQuote
  likedAt: string
}
