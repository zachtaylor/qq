// Fixed tag taxonomy + keyword rules for subject-tagging quotes.
// Shared conceptually with supabase/functions/ingest-zenquotes/index.ts —
// Deno edge functions can't import from scripts/, so that file keeps its
// own copy of this table. Keep the two in sync if you edit tags here.
//
// Each tag maps to word-boundary, case-insensitive regexes. A quote is
// scored per tag by number of matching patterns; the top-scoring tags
// (up to MAX_TAGS_PER_QUOTE) are applied. Quotes with no matches are left
// untagged rather than forcing a bad tag.

export const MAX_TAGS_PER_QUOTE = 3

export const TAG_RULES = {
  stoicism: [/\bstoic/i, /\bendur/i],
  mindset: [
    /\bmindset\b/,
    /\battitude\b/,
    /\bperspective\b/,
    /\bthink(ing)?\b/,
  ],
  perseverance: [
    /\bpersever/i,
    /\bpersist/i,
    /\bkeep going\b/,
    /\bnever give up\b/,
    /\bdo not stop\b/,
    /\bdon't stop\b/,
  ],
  resilience: [
    /\bresilien/i,
    /\bstronger\b/,
    /\bfall(ing)?\b.*\brising?\b/,
    /\brise\b/,
    /\bovercome\b/,
    /\brecover/i,
  ],
  courage: [
    /\bcourage/i,
    /\bbrave/i,
    /\bfear(less)?\b/,
    /\bafraid\b/,
    /\bdare\b/,
    /\bdaring\b/,
  ],
  kindness: [/\bkind(ness)?\b/, /\bgentle/i, /\bcompassion/i],
  love: [/\blove\b/, /\blov(ed|es|ing)\b/, /\bheart\b/],
  friendship: [/\bfriend(ship)?s?\b/],
  family: [
    /\bfamily\b/,
    /\bmother\b/,
    /\bfather\b/,
    /\bparent/i,
    /\bchild(ren)?\b/,
  ],
  wisdom: [/\bwisdom\b/, /\bwise\b/, /\bknowledge\b/, /\bunderstanding\b/],
  'self-knowledge': [
    /\bknow(ing)? yourself\b/,
    /\bself-knowledge\b/,
    /\bself-aware/i,
  ],
  'self-worth': [/\bself-worth\b/, /\binferior\b/, /\bworthy\b/, /\bworth\b/],
  confidence: [/\bconfiden/i, /\bself-belief\b/, /\bbelieve in yourself\b/],
  authenticity: [
    /\bauthentic/i,
    /\bbe yourself\b/,
    /\bbe one\b/,
    /\btrue to yourself\b/,
  ],
  individuality: [/\bindividual/i, /\byour own path\b/, /\bno path\b/],
  purpose: [/\bpurpose\b/, /\bmeaning\b/, /\bwhy\b.*\blive\b/, /\breason\b/],
  work: [/\bwork\b/, /\bjob\b/, /\bcareer\b/, /\blabou?r\b/],
  success: [/\bsuccess(ful)?\b/, /\bachieve/i, /\baccomplish/i],
  failure: [/\bfail(ure|ed)?\b/, /\bmistake/i],
  excellence: [/\bexcellen/i, /\bhabit\b/, /\bmastery\b/],
  habit: [/\bhabit(s)?\b/, /\brepeatedly\b/, /\brepetition\b/],
  dreams: [/\bdream(s|ing)?\b/, /\bimagined\b/, /\baspir/i],
  imagination: [/\bimagin/i, /\bcreativ/i, /\bcuriosity\b/, /\bcurious\b/],
  adventure: [/\badventure\b/, /\bjourney\b/, /\bexplor/i],
  truth: [/\btruth\b/, /\bhonest/i, /\breal(ity)?\b/],
  freedom: [/\bfreedom\b/, /\bfree\b/, /\bliberty\b/],
  change: [/\bchange\b/, /\btransform/i, /\bnew\b/],
  time: [/\btime\b/, /\bmoment\b/, /\btoday\b/, /\btomorrow\b/],
  patience: [/\bpatien/i, /\bslowly\b/, /\bwait(ing)?\b/],
  gratitude: [/\bgrateful\b/, /\bgratitude\b/, /\bthank/i, /\bappreciat/i],
  hope: [/\bhope\b/, /\bhopeful\b/, /\boptimis/i],
  happiness: [/\bhapp(y|iness)\b/, /\bjoy(ful)?\b/, /\bsmile\b/],
  unity: [/\btogether\b/, /\bunity\b/, /\balone\b/, /\bunited\b/],
  community: [/\bcommunity\b/, /\bsociety\b/, /\bpeople\b/],
  giving: [/\bgiv(e|ing)\b/, /\bgenero/i, /\bcharity\b/],
  leadership: [/\bleader(ship)?\b/, /\bcommand\b/, /\brule\b/],
  simplicity: [/\bsimpl(e|icity)\b/, /\bminimal/i],
  money: [
    /\bmoney\b/,
    /\bwealth\b/,
    /\bfortune\b/,
    /\brich(es)?\b/,
    /\bpoor\b/,
  ],
  nature: [
    /\bnature\b/,
    /\bnatural\b/,
    /\bearth\b/,
    /\bwind\b/,
    /\bocean\b/,
    /\bmountain/i,
  ],
  art: [/\bart\b/, /\bmusic\b/, /\bbeaut(y|iful)\b/, /\bpoet(ry|ic)?\b/],
  education: [
    /\beducat/i,
    /\blearn(ing)?\b/,
    /\bteach(er)?\b/,
    /\bstudent\b/,
    /\bschool\b/,
  ],
  action: [
    /\baction\b/,
    /\bact\b/,
    /\bdo(ing)?\b.*\bsomething\b/,
    /\bstep\b/,
    /\bstart(ed|ing)?\b/,
  ],
  progress: [/\bprogress\b/, /\bgrowth\b/, /\bgrow(ing)?\b/, /\bimprove/i],
  death: [/\bdeath\b/, /\bdie\b|\bdying\b/, /\bmortal/i],
  life: [/\blife\b/, /\blive\b|\bliving\b/, /\bexist(ence)?\b/],
}

/**
 * Returns up to MAX_TAGS_PER_QUOTE tag slugs matching the given text,
 * ranked by number of matching patterns within each tag.
 */
export function tagsForText(text) {
  const scored = []
  for (const [tag, patterns] of Object.entries(TAG_RULES)) {
    const score = patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
    if (score > 0) scored.push({ tag, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, MAX_TAGS_PER_QUOTE).map((s) => s.tag)
}
