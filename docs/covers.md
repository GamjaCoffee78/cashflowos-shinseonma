# Post covers

Each card on **Content** shows the post's cover. It comes from one of two places,
in this order:

1. `meta.thumbnail_url` on the record, if something wrote one.
2. `public/covers/<ig_id>.jpg` — a file committed to this repo.

A post with neither shows a small "no cover" placeholder, never a broken image.

## Why files and not URLs

Instagram's CDN links are signed and expire within days. A URL saved into the
`records` table looks fine the afternoon you save it and is a broken image by the
weekend. The files here were fetched once and keep working with no token, no API
call, and nothing to refresh.

They're small on purpose: 400px on the long edge, JPEG quality 65, about 30KB
each — enough for a card, and 138 of them come to roughly 4MB.

## Adding covers for newer posts

1. Get the media list for the account from the Instagram Graph API, asking for
   `id,permalink,media_type,media_url,thumbnail_url`.
2. For each post, the cover is `thumbnail_url` (videos and reels) or `media_url`
   (images and carousels).
3. Save it as `public/covers/<id>.jpg`, resized — `sips -s format jpeg -s
   formatOptions 65 -Z 400 in.img --out public/covers/<id>.jpg` does it on a Mac.
4. Add the id to the list in `lib/covers.ts`.

The filename is the post's `meta.ig_id`, which is the same value the Graph API
returns as the media `id` — they matched on all 138 rows of the first import.
