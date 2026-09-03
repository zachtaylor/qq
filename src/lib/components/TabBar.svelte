<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{ href: '/', label: 'Feed', icon: '❝' },
		{ href: '/trending', label: 'Trending', icon: '↗' },
		{ href: '/submit', label: 'Submit', icon: '＋' },
		{ href: '/settings', label: 'Settings', icon: '⚙' }
	];
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
>
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs {page.url.pathname === tab.href
				? 'text-accent'
				: 'text-stone-400'}"
		>
			<span class="text-lg leading-none">{tab.icon}</span>
			{tab.label}
		</a>
	{/each}
</nav>
