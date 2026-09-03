<script lang="ts">
	import type { Quote } from '$lib/types';
	import { setLiked } from '$lib/api/quotes';
	import { Share } from '@capacitor/share';

	let { quote }: { quote: Quote } = $props();

	let liked = $state(quote.liked_by_me);
	let count = $state(quote.like_count);
	let busy = $state(false);

	async function toggleLike() {
		if (busy) return;
		busy = true;
		liked = !liked;
		count += liked ? 1 : -1;
		try {
			await setLiked(quote.id, liked);
		} catch {
			liked = !liked;
			count += liked ? 1 : -1;
		} finally {
			busy = false;
		}
	}

	async function share() {
		try {
			await Share.share({ text: `“${quote.text}” — ${quote.author.name}` });
		} catch {
			await navigator.clipboard?.writeText(`“${quote.text}” — ${quote.author.name}`);
		}
	}
</script>

<article class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
	<blockquote class="font-serif text-lg leading-relaxed text-stone-800">“{quote.text}”</blockquote>
	<div class="mt-4 flex items-center justify-between">
		<a href="/authors/{quote.author.slug}" class="text-sm font-medium text-accent hover:underline">
			— {quote.author.name}
		</a>
		<div class="flex items-center gap-4">
			<button
				onclick={toggleLike}
				class="flex items-center gap-1.5 text-sm transition-colors {liked
					? 'text-accent'
					: 'text-stone-400 hover:text-stone-600'}"
				aria-pressed={liked}
				aria-label="Like"
			>
				<span class="text-base">{liked ? '♥' : '♡'}</span>{count}
			</button>
			<button onclick={share} class="text-stone-400 hover:text-stone-600" aria-label="Share">⇪</button>
		</div>
	</div>
</article>
