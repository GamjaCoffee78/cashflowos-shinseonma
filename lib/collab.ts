import type { Rec } from './records'

// Reels kept OUT of the Content tab's "Ads suggestion": past brand
// collaborations whose offer is over, so boosting them now makes no sense.
// This list only excludes them — it doesn't change their "collab" label,
// which still comes from meta.collab (posted from the founder's account).
//
// To add one, paste the first words of its caption — emoji, punctuation and
// case don't matter.
export const PAST_COLLABS = [
  'Please comment what are the 3 menus you want them to stay permanently @familymartmy',
  'I never thought I’d have to make a video like this. I am so, so sorry',
  'Try my fav collab menu!',
]

const norm = (s: string) =>
  s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
const WANT = PAST_COLLABS.map(norm)

// True when the post's title or caption starts with one of the listed
// captions. A title cut short by the import still matches, as long as at
// least 15 characters of it are left.
export function isPastCollab(r: Rec): boolean {
  for (const text of [r.title, r.meta?.caption]) {
    const t = norm(String(text ?? ''))
    if (!t) continue
    if (WANT.some(w => t.startsWith(w) || (t.length >= 15 && w.startsWith(t)))) return true
  }
  return false
}
