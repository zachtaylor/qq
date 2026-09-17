<script lang="ts">
  import { page } from '$app/state'
  import { fetchQuotesByTag } from '$lib/api/quotes'
  import QuoteList from '$lib/components/QuoteList.svelte'
  import BackButton from '$lib/components/BackButton.svelte'
  import DetailShell from '$lib/components/DetailShell.svelte'

  let slug = $derived(page.params.slug!)
  const tagName = $derived(`tag-${slug}`)
</script>

{#key slug}
  <DetailShell>
    <div class="mb-4 flex items-center gap-3">
      <BackButton />
      <h1
        class="text-2xl font-bold text-stone-900"
        style="view-transition-name: {tagName}"
      >
        #{slug}
      </h1>
    </div>
    <QuoteList
      load={() => fetchQuotesByTag(slug)}
      key={slug}
      empty="No quotes tagged #{slug} yet."
      takenTagNames={[tagName]}
    />
  </DetailShell>
{/key}
