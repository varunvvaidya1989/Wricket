# SportStage marketing pack

**Campaign:** Every sport. One stage.  
**Audience:** India-first adult players, scorekeepers, clubs and tournament organizers.  
**Language:** English.  
**Current CTA:** Follow for launch updates.

Open **[index.html](index.html)** in a browser to browse the graphics, play the videos and download individual assets. The gallery works locally; no deployment or account connection is needed. Open the folder after extracting the ZIP, rather than opening HTML from inside an archive.

## October 2026 refresh

Graphics, carousel, captions, calendar, subtitles and brochure were updated on 2026-10-13 to match the redesigned app (SportStage 2.0.0, new home / Start a match / racket scoring board / Performance Lab / organiser workspace). Changes:

- **Visual language** now follows the app's `StageUI` tokens: lime accent `#a6f477`, surface `#151c18`, IBM Plex Mono overlines, lime pill CTA.
- **Real screenshots** of the current app: `assets/app-home.png` (“Back to your game.”) and `assets/app-start-match.png` (“Which sport today?”), captured from the local web export without signing in. `assets/app-match-setup.png` is the old setup screen and is no longer used.
- **New concepts** replace generic ones: Performance Lab (09), knockout bracket (10), organiser workspace (05), racket score board (07). Score, chart, bracket and sponsor visuals are labelled illustrative.
- **Copy** uses current UI wording: “Start a match”, “Who’s playing?”, “Know the format.”, “Tap a score card”, “Undo” (no longer “Undo last rally”).
- **Videos: not re-rendered.** The four MP4s and covers still show the September designs. No H.264-capable FFmpeg was available on this machine. Install FFmpeg, then run `node source/render-videos.cjs` before publishing them. Subtitles (`.srt`) and video scenes in `campaign.json` are already updated.

CTA is unchanged (“Follow for launch updates”). A web build is reachable at sportstageapp.expo.app but there is no Play Store or App Store listing yet. Switch the CTA once you're ready to point people at a live destination.

## What is included

| Deliverable | Files | Format |
| --- | --- | --- |
| Feed graphics | 12 | PNG, 1440 × 1800, 4:5 |
| Square graphics | 12 | PNG, 1080 × 1080 |
| Story graphics | 12 | PNG, 1440 × 2560, 9:16 |
| Wide social graphics | 3 | PNG, 1600 × 900 |
| Matchday carousel | 6 ordered slides | PNG, 1080 × 1080 |
| Short social videos | 4 | MP4, 1080 × 1920, 30 fps, 15 seconds; H.264 + AAC |
| Video companions | 4 SRT + 4 JPG | Message subtitles and covers |
| Posting copy | 30 captions + calendar CSV | Instagram, Facebook, YouTube, LinkedIn, WhatsApp, X/Threads |
| Ad and outreach copy | 9 ad variations + outreach/profile templates | Markdown |
| Organizer brochure | 1 | One-page PDF |
| Original artwork | 3 generated sports images | PNG, source prompts included |
| Editable source | Campaign/content JSON, HTML/CSS, render scripts, fonts | Local files |

The 45 social graphics include format variations of 12 concepts and six carousel slides. Videos are designed motion-graphics films, using those campaign layouts; they are not live-action footage or recordings of an app walkthrough. There is original instrumental audio, with no spoken voiceover. The pack contains no fake testimonials, adoption statistics, pricing promises or store badges.

## Start with these three posts

1. Publish `posts/01-brand-feed.png` with day 1 from [POSTS.md](copy/POSTS.md). Pin the introductory post if useful for your profile.
2. Publish `videos/01-meet-sportstage.mp4` using day 3. Reuse the clean file on Reels and Shorts.
3. Publish `posts/carousel-01.png` through `carousel-06.png` together, in order, with day 9's badminton playbook caption.

Use [30-day-calendar.csv](copy/30-day-calendar.csv) for the full rotation. It opens in a spreadsheet and includes asset paths, copy, hashtags, optional Story stickers and the metric to watch. Choose an actual start date and add it to your scheduling tool. No posts have been uploaded or scheduled by this work.

## How to use each format

| Channel | File selection | Publishing notes |
| --- | --- | --- |
| Instagram / Facebook feed | `*-feed.png` or ordered carousel slides | Upload the supplied image; paste its caption. Add the alt text from the gallery/manifest where supported. |
| Instagram / Facebook Reels | `videos/*.mp4` | Preview the platform overlays; the layout reserves top, right and bottom space. Use the JPG cover where supported. |
| YouTube Shorts | `videos/*.mp4` | Use the video title and description in the calendar; SRT is available for the principal scene messages. |
| Instagram Stories | `*-story.png` | Add the optional poll/question sticker in the clear outer area. Check sticker and app UI overlap before publishing. |
| WhatsApp Status | `*-story.png` or MP4 | Use the Status caption provided. Group-introduction drafts are separate and begin with administrator permission. |
| LinkedIn | `*-landscape.png`, `*-square.png`, or the PDF | Use the longer organizer/club captions. Wide files are post graphics, not profile-cover templates. |
| X / Threads | `*-square.png` | Days 14, 21 and 28 contain short copy; X versions are checked against 280 characters. |

These are production sizes selected for this pack, not a promise that every account, scheduler or advertising placement accepts identical formats. The vertical videos use 9:16 and are 15 seconds long. Official references: [Meta Reels creative overview](https://www.facebook.com/business/ads/facebook-instagram-reels-ads) and [YouTube Shorts upload guidance](https://support.google.com/youtube/answer/12779649?hl=en-IN). YouTube's current guidance accepts square or vertical Shorts up to three minutes. Check placement previews when publishing; platform UI can cover different regions.

## CTA and product claims

The public website and Play availability could not be verified during this task. Therefore the ready-to-post copy asks people to follow for launch updates; it does not say “available now,” “download now,” “free,” or “on iOS.” No QR code or unverified URL is baked into the exports.

When you have the public destination, change `cta` and `destination` in `source/campaign.json`, revise the captions in `source/content.json`, then render again. The `destination` field records the publishing URL; it does not automatically print a URL, create a QR code or replace caption wording. Add the verified link to the actual social bio or appropriate post field. Use [ADS_AND_OUTREACH.md](copy/ADS_AND_OUTREACH.md) for conversion-ad variations after the destination works.

Feature wording is grounded in this repository's scoring flows, UX review and tournament sponsor implementation. The badminton setup screenshot shows demo players, and score/sponsor illustrations are labelled. Sponsor image export is not advertised across all sports: the existing export is cricket-specific. No promise is made about anonymous access to every match or tournament. Before a feature-led post accompanies a public release, ensure the deployed build includes that feature.

## Editable source and reproducibility

- `source/campaign.json`: headlines, descriptions, CTAs, scene order, alt text.
- `source/creative.html`: responsive campaign layouts, colors and typography.
- `source/content.json`: 30 captions, channel assignments and calendar rows.
- `source/render.cjs`: PNG exports, inventory, local gallery and preview.
- `source/render-videos.cjs`: camera movement, transitions, original audio, MP4s, covers and SRTs.
- `source/render-copy.cjs`: Markdown captions and spreadsheet calendar.
- `source/organizer-one-pager.html`: brochure source.
- `source/PROVENANCE.md`: exact prompts, built-in imagegen method, source asset details and audio provenance.

Rendering needs Node, Playwright with a Chromium browser, and FFmpeg with libx264. These are content-production tools; the app's dependencies and package scripts were not changed. Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the source folder; `BROWSER_CHANNEL` defaults to `msedge`. Set `FFMPEG` to your executable path when it is not on PATH.

Run in this order:

```sh
node source/render.cjs
node source/render-videos.cjs
node source/render-copy.cjs
node source/review.cjs
```

The review script exports the brochure PDF and contact sheet and checks the gallery/media locally. The generated PNGs and MP4s can be posted directly; editing the source is optional.

## Validation and handoff

The production scripts check image text bounds, browser errors, referenced asset existence, short-copy length and MP4 decoding. `video-validation.json` records video dimensions, codecs, durations and file sizes. `manifest.json` maps image files to their dimensions and alt text. `VALIDATION.json` records the final gallery/media review. Previews were visually inspected for typography, contrast and example-data labels.

Everything here is prepared for you to publish. Nothing was posted to a social account, no messages were sent and no advertising budget was spent. The previous SportStage app changes remain separate from this marketing folder.
