# SportStage: India launch, acquisition, and revenue plan

Prepared 22 September 2026 for Android and web with a total monthly marketing budget of ₹10,000–₹50,000. Amounts below are planning experiments, not vendor quotes, established market prices, or revenue forecasts. Read `LAUNCH_READINESS_2026-09-22.md` before activating campaigns.

## Positioning and first customers

Use one clear promise: **“Score your match. Share the action. Keep your sporting record.”**

Prioritize adult community organizers, scorers, turf operators, and badminton club managers. Begin in one city or local sports network where the founder can provide matchday support. Promote cricket and badminton first if those flows pass the field pilot; expand sport-by-sport after equivalent evidence. A multisport product does not require six simultaneous acquisition campaigns.

The initial growth mechanism is organizer → teams/players → shared score link → spectators → next organizer. Treat a match completed correctly and another match played later as stronger evidence than installs or followers. Keep basic scoring, correction/undo, and spectators' access useful enough for this loop to work.

## Channel plan

| Channel | First experiment | Cadence | Primary measure |
| --- | --- | --- | --- |
| Turf/club/academy partnerships | Personally onboard 5 adult organizers and help each run a real event. Offer a printable spectator QR code and a scorer walkthrough. | 10 qualified conversations/week; 2 demos/week | Organizers completing a first match and returning |
| WhatsApp communities | With the administrator's permission, share a short scorer guide and live score link; use opt-in updates, not scraped/bulk messaging. | Around actual matches | Referred organizers and qualified spectator visits |
| Instagram Reels + YouTube Shorts | Record a 15–30 second setup/scoring/share demo; publish an organizer testimonial with permission; show a real match result. | 3 reusable clips/week | Landing visits → first completed match by source |
| Local sports creators | Trial 2 small relevant creators. Agree on a demo deliverable, usage rights, and a trackable link. Pay for authentic work, not guaranteed reviews. | One small trial before repeat spend | Cost per activated organizer, not creator follower count |
| Website + search | Separate useful cricket/badminton landing pages; publish scoring guides and organizer case studies. Include actual screenshots, support, privacy, and working app/web CTAs. | 1 helpful article/week | Qualified organic visits and completed matches |
| Google Play listing | Match the listing to shipped sports; show setup, live scoring, sharing, and results. Replace placeholder store links. Ask for honest reviews after successful usage. | Refresh after pilot feedback | Listing conversion and subsequent activation |
| LinkedIn / corporate sports | Show a short corporate tournament case study; contact HR/sports coordinators with a specific pilot offer. | 5 relevant contacts/week | Qualified demos and paid event pilots |
| Paid media | Test one channel for one audience and one sport after link/measurement gates pass. | One controlled experiment | Cost per activated/retained organizer |

Suggested clip scripts:

1. **Scorer:** “Still updating the group after every over?” Show a delivery recorded, then the spectator view. CTA: “Try SportStage for your next match.”
2. **Badminton organizer:** “From players to first serve.” Show the three setup steps and one rally. CTA: “Set up your next club match.”
3. **Organizer:** “One event, one place for fixtures and results.” Demonstrate only available tournament features. CTA: “Book a pilot walkthrough.”

Avoid unmeasured claims such as guaranteed sub-second sync, universal offline support, or live video broadcasting. A broadcasting blueprint in the repository is not a shipped broadcast feature.

## Budget allocation

These totals cover marketing activities, not engineering salaries, backend hosting, taxes, or payment fees. Unused reserve stays unspent. If launch gates fail, retain the paid-media allocation rather than redirecting it into traffic that cannot activate.

| Monthly budget | Partnerships / pilot support | Content / creator assets | One paid channel | Reserve |
| --- | ---: | ---: | ---: | ---: |
| ₹10,000 | ₹5,000 | ₹3,000 | ₹0 initially | ₹2,000 |
| ₹30,000 | ₹10,000 | ₹8,000 | ₹10,000 | ₹2,000 |
| ₹50,000 | ₹10,000 | ₹8,000 | ₹30,000 | ₹2,000 |

At the low end, use field partnerships and organic clips. At ₹30,000, consider a focused organizer-lead or high-intent search experiment. At ₹50,000, an Android App campaign becomes a possible single paid channel, provided budget, attribution, listing availability, and activation justify it.

For context, Google recommends daily install-campaign budgets of at least 50 times the target CPI. A hypothetical ₹20 target CPI therefore implies ₹1,000/day, roughly ₹30,000 over 30 days. This is a planning example, not a prediction that SportStage can buy installs for ₹20. Splitting that same amount across several app campaigns would weaken the experiment. [Google App campaign guidance](https://support.google.com/google-ads/answer/6167156?hl=en).

## Buying ads to acquire users

1. **Choose the conversion.** For organizers, count an organizer who completes a valid first match. For spectators, use a separate audience and returning-live-viewer measure. Do not mix them into a single activation rate.
2. **Fix the destination.** Use a functioning Play listing or a useful sport-specific landing page with an install/web CTA. For prelaunch, label a pilot signup honestly; do not run an install promise into a placeholder.
3. **Instrument the journey.** Add mobile and web event collection plus the chosen ad platform's supported conversion connection. Test the events in that platform before optimizing against them. Meta app-event measurement supports optimization and reporting, but implementation must be verified for the campaign chosen. [Meta app-events training](https://www.facebookblueprint.com/student/path/253008-use-app-events-to-target-optimize-measure?sid=f9332978-e8e2-4ec1-a4a1-d19eaac894d1&sid_i=0).
4. **Start narrow.** One city/region, one sport, adult organizers/scorers, 3 creatives demonstrating the same outcome. Use the locally appropriate language alongside English. Separate other audiences later.
5. **Choose one paid route.** Google App campaigns for a public Android app; Meta app promotion after app-event integration; organizer lead campaigns or intent-based Google Search to a measured web signup/demo for an earlier pilot.
6. **Set an absolute spend cap and an evaluation window.** Agree on a target activation cost before launch, derived from measured customer value. Avoid daily large campaign edits. Google's guide recommends allowing a learning period, commonly 7–14 days; use a staged experiment rather than claiming success from a handful of installs. [Campaign guidance](https://support.google.com/google-ads/answer/6167156?hl=en).
7. **Scale retained usage.** Compare channels on first-match completion, recurring organizers, support burden, and contribution margin. Stop a broken destination immediately. Pause a campaign if its predetermined cap is exhausted without sufficient activation evidence.

Example source tags: `utm_source=instagram&utm_medium=organic_social&utm_campaign=india_badminton_pilot&utm_content=setup_demo_01`. Use distinct links/codes for each venue and creator. Web UTM tags alone do not establish mobile post-install attribution; implement install attribution separately and reconcile with server-side match activity.

Minimum events: `signup_completed`, `sport_selected`, `match_setup_started`, `match_created`, `first_point_recorded`, `match_completed`, `score_link_shared`, `spectator_opened`, `organizer_returned`, and eventually `subscription_started`, `subscription_renewed`, `refund`, `ad_impression`, `ad_revenue`. Capture sport, platform, campaign source, app version, and anonymous/pseudonymous identifiers; keep player names, emails, phone numbers, and private match content out of advertising events.

Weekly dashboard:

- New qualified organizer signups by source.
- First-match activation: new organizers completing a match within 7 days / new qualified organizer signups.
- Four-week repeat use: activated organizers completing another match in days 8–28 / eligible activated organizers. Weekly sport schedules make this more useful than daily streaks.
- Acquisition cost per activated organizer and per new paying organizer, including paid media and allocated creator/partnership costs.
- Correctly completed matches, save failures, sync latency, crash-free sessions, and support incidents.
- Subscription/event revenue, sponsorship, and ad earnings separately; refunds, store/payment fees, hosting and delivery/support costs separately.

## Earning money inside SportStage

Recommended order: **validate organizer payments → sell measured sponsorships → add ad income as usage grows**. Ads can support a free product but should not be assumed to fund early acquisition.

| Model | Proposed experiment | What must exist before charging |
| --- | --- | --- |
| Free core | Basic match scoring and sharing | A reliable first-match experience and clear free limits |
| Organizer plan | Test ₹499–₹1,499/month; use ₹999 as an interview anchor | A differentiated paid package, e.g. organizer reporting/export or branding, plus billing, entitlements, restore/cancel/refund handling. These premium capabilities are proposals, not confirmed shipped features. |
| Per-event package | Test ₹1,499–₹4,999 for occasional organizers | A clear event limit, agreed deliverables, support scope, and correct billing treatment. Avoid billing subscribers twice for included events. |
| Local sponsorship | Test ₹5,000–₹20,000 for a defined event/campaign | Approved sponsor inventory or collateral, placement duration, audience estimate, labeling, and a delivery report. Sell actual reach and placement, never guaranteed clicks. |
| Programmatic ads | Android AdMob first; web separately | Publisher/store verification, consent and audience treatment, test configuration, monitoring, and safe placements |

Start by interviewing 10 organizers and securing 3–5 concrete paid-pilot commitments before building a large premium tier. A manually agreed service pilot must describe the actual service; renaming a digital feature fee as a service does not avoid store billing rules.

In a Play-distributed Android app, digital feature upgrades and subscriptions generally require Play Billing unless an applicable permitted alternative is implemented. India has an alternative-billing program with additional requirements; it is not simply a UPI button to bypass store rules. For independent web sales, design server-side entitlements and check the app's purchase-link restrictions before connecting flows. [Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en), [India alternative billing](https://support.google.com/googleplay/android-developer/answer/13306652?hl=en).

## Making the existing AdMob integration earn revenue

1. Confirm ownership of the configured Android app/banner units and complete account identity/payment setup in AdMob.
2. Publish/link the supported store listing and fix the developer website. Add the exact AdMob publisher record as a real root `app-ads.txt` file. Serve it consistently at the developer domain AdMob crawls. [Verification](https://support.google.com/admob/answer/14538460?hl=en).
3. Complete app verification and readiness review. Source-code IDs and successful test ads are not monetization approval. [Readiness process](https://support.google.com/admob/answer/10564477?hl=en-GB).
4. Make test/preview builds use demo units or approved test-app/test-device settings. Do not click your own live ads or ask testers to do so. [Test ads](https://support.google.com/admob/answer/9388275?hl=en).
5. Configure applicable privacy messages, verify consent acceptance/rejection/error paths, and keep privacy options reachable. Resolve age-audience treatment before exposing ads to youth accounts. [UMP](https://developers.google.com/admob/android/privacy), [Families requirements](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en).
6. Start with a separated banner in discovery/history or results. Keep ads away from run, wicket, rally, undo, and other high-frequency controls. Do not interrupt an over or rally with an interstitial. Add another format only after retention and accidental-tap risk are assessed.
7. Measure eligible impressions, fill, publisher eCPM, revenue by platform/sport, and retention impact. Add error/retry observability; the current component silently hides itself after failure.
8. Treat web monetization separately. The web banner currently returns null. Direct sponsorship may be simpler initially; AdSense requires a separate suitable site and approval. Original content, navigation, and useful pages matter. [AdSense site readiness](https://support.google.com/adsense/answer/7299563?hl=en).

## Revenue model: transparent assumptions

Monthly ad earnings ≈ daily active users × actual filled impressions per active user/day × days × realized publisher eCPM / 1,000.

Illustration only: assume **2 filled impressions per daily active user**, **30 days**, and **₹40 publisher eCPM**. These are not measured Indian benchmarks or promised results. If only some users visit ad-bearing pages, use that eligible population or reduce the per-user impression assumption.

| Daily active users | Monthly filled impressions | Illustrative monthly ad earnings |
| ---: | ---: | ---: |
| 1,000 | 60,000 | ₹2,400 |
| 5,000 | 300,000 | ₹12,000 |
| 10,000 | 600,000 | ₹24,000 |

At those assumptions, earning ₹50,000/month from ads alone would require 1.25 million filled impressions, roughly 20,834 daily active users. This excludes your operating costs and taxes. Do not fund paid acquisition assuming an ad-only return before measuring user lifetime activity and realized earnings.

An alternative illustrative mix is 20 organizer subscriptions × ₹999 = ₹19,980; 4 separate non-subscriber event packages × ₹2,499 = ₹9,996; and one delivered ₹5,000 sponsorship, totaling **₹34,976 before expenses, applicable fees/taxes, refunds, and support costs**. This is arithmetic for a sales target, not evidence of demand. Against a ₹50,000 marketing budget, it would not by itself cover marketing spend.

Compute allowable paid-customer acquisition cost from expected lifetime contribution after hosting, support, refunds, and fees. Set a payback limit that fits cash reserves. Revenue is not profit.

## First 30 days, gated by readiness

| Period | Work | Exit evidence |
| --- | --- | --- |
| Week 1 | Repair domains/downloads, finish release gates, define target audience, instrument funnel, interview organizers. | New users can enter the correct flow and a test conversion is measurable. |
| Week 2 | Run at least 20 supervised matches with 5 organizers; produce 3 demo clips and one case study. | Correct scores, recoverable errors, working shared links; no unresolved critical issue. |
| Week 3 | Start one measured acquisition experiment if the store/testing gates permit; test paid-pilot proposals. | Actual activation cost, paid willingness, and support effort recorded. |
| Week 4 | Compare returning-organizer cohorts, collect honest reviews, review ad eligibility/retention, choose one repeatable channel. | Decide increase / hold / stop from measured outcomes. |

This is a work sequence, not a promise that store approval or the required closed-testing period will fit within 30 days. If a gate remains open, continue the pilot and preserve the advertising budget.
