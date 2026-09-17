import { redirect } from '@sveltejs/kit'
import { TAB_ORDER, lastTabKey } from '$lib/lastTab'

export function load() {
  const last = localStorage.getItem(lastTabKey)
  const target = last && TAB_ORDER.includes(last) ? last : '/app/tabs/daily'
  redirect(307, target)
}
