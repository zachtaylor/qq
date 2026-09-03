<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import TabBar from '$lib/components/TabBar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="mx-auto min-h-screen max-w-lg px-4 pt-6 pb-24">
	{@render children()}
</main>

<TabBar />
