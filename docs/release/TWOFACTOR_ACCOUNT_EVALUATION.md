# Existing 2Factor account evaluation

18 November 2026. Decision: retain Supabase Authentication and pursue 2Factor as the SMS transport. Existing account access is verified through read-only balance requests. A user-authorized single transactional-SMS trial request was rejected for a missing sender ID; its balance remained 200. SportStage SMS activation remains pending provider configuration and end-to-end acceptance.

Latest status: the new SportStage account is integrated through a deployed Supabase SMS hook. A native Supabase request was accepted, but the user received no SMS and the provider dashboard reports **NO-ANSWER**. Phone OTP is not accepted for production use. See the current [integration and verification record](SUPABASE_TWOFACTOR_PHONE_AUTH.md); the older evaluation history below is retained with its account/product boundaries.

## New SportStage account and OTP template

Subsequent to the AuctionYodha account evaluation, the user created a **separate SportStage 2Factor account** and supplied its key through ignored `.env.twofactor.local`. These are separate account balances and must not be conflated. The new account's screenshot shows SMS OTP balance 200, voice balance 50, active Y, demo N, phone verified Y and international OTP disabled. International OTP being disabled does not itself block the +91 test recipient. The screenshot exposed the key; rotation was requested, but has not been verified.

The latest dashboard screenshot confirms an **approved SMS OTP template**, exact name `SportStage Login`, sender `SSTAGE`, text `XXXX is your OTP to log in to SportStage.` This supersedes earlier assumptions about the new account having only a transactional template named `SMSTemplateSS`. It establishes provider template approval, not a blanket regulatory exemption or actual SMS delivery.

Transactional test history on the new account: a request with `SSTAGE` but no template was rejected for missing TemplateName; requests with `SMSTemplateSS`, including a retry supplying `VAR1`, were API-accepted but the delivery report returned `DLT-CNT-REJECT`, zero credits charged. No transaction acceptance was treated as delivered SMS.

One test then used the **SMS OTP API**, with a locally generated six-digit code and approved template `SportStage Login`. The provider returned Success; the immediate OTP balance read was 200 before and after. The user confirmed that **nothing had arrived yet**. No further send was attempted. This proves only API acceptance of that manual-code request; delivery is unconfirmed and it is not a Supabase session acceptance result. No code or key is included in the report. Ignored evidence: `.e2e/twofactor/manual-otp-trial.json`. Provider documentation for application-generated codes: [manual OTP flow](https://dial2verify.com/corp/support-system/tkt/knowledgebase.php?article=19). The transactional delivery report is not evidence for this separate OTP request; obtain its specific status from the SMS OTP dashboard report or provider support.

If receipt is confirmed, integrate the approved **OTP** template through Supabase's SMS hook, supplying Supabase's code through the manual-code OTP API. `AUTOGEN` and the rejected transactional `SMSTemplateSS` route are not the selected integration.

## Verified account evidence

The local AuctionYodha checkout contains a configured server-variable entry for 2Factor. The key was read in process, not copied into this document or into SportStage configuration. Two HTTPS provider balance requests succeeded:

| Provider balance bucket | Reported balance | Result |
| --- | ---: | --- |
| SMS OTP | 9,619 | HTTP 200, provider Success |
| Transactional SMS | 200 | HTTP 200, provider Success |

These are provider-reported balances at the time of the check, not a price quote, purchased-volume guarantee, approval or delivery test. No OTP, voice call, verification, purchase, template request, account mutation, production configuration change or deployment was performed. The sanitized balance evidence is in ignored `.e2e/twofactor/account-check.json`.

### Transactional trial attempt

The user selected the existing 200-credit trial and supplied an authorized Indian recipient. One request was submitted to the transactional `ADDON_SERVICES/SEND/TSMS` endpoint with a plain diagnostic message, leaving sender selection to an account default if supported. No sender/header or template was fabricated. The provider returned HTTP 200 with `Status: Error` and `Missing 'From' parameter value`; this is a rejected request, not successful delivery. Transactional balance was 200 before and after. The request was not retried, and there was no fallback to the separate OTP pool. Local ignored evidence: `.e2e/twofactor/transactional-trial.json`.

The user checked the transactional dashboard and confirmed **no Sender ID is listed**. The selected 200-credit transactional trial is therefore blocked on sender provisioning; there is no available sender to supply on a retry. Generic OTP SMS delivery in AuctionYodha does not establish that the transactional product has a default sender. The provider's account setup must establish a sender or the user must select a different trial route. This trial does not establish whether the generic manual-OTP endpoint works. Using the separate OTP pool would be a change from the user's selected 200-credit trial and has not been attempted.

The user subsequently clarified that AuctionYodha has **no custom template or own DLT registration**, and that users receive a generic SMS without AuctionYodha branding. This supersedes the earlier interpretation that an AuctionYodha template was approved. The source code's template-name parameter is not approval evidence. The delivery arrangement and whether the same service supports application-supplied OTPs remain unverified; provider balance reads do not expose those details.

The Cloudflare CLI's cached authentication failed to refresh. This prevented checking deployed secret names/settings. It did not prevent the direct provider balance checks. No 2Factor/Cloudflare connector was found in the plugin search, and no connected debugging browser session was available.

## Integration to implement

Use the native Supabase phone auth flow:

1. Client calls `signInWithOtp` with the parent's normalized E.164 phone.
2. Supabase generates the code and calls an authenticated Send SMS Hook.
3. The server hook verifies the Standard Webhooks signature and validates the payload before contacting 2Factor. It supplies Supabase's code to the provider's manual-OTP API using the approved SportStage template. Do not use `AUTOGEN`, since a separately generated code would not match Supabase's verification state.
4. The client calls `verifyOtp` with type `sms`; Supabase issues its normal session, retaining existing UUID account identity and permissions.
5. A new parent completes the one-player profile selected for this tournament. Existing accounts require an explicit ownership-proving phone-link flow; never silently merge accounts based on editable phone metadata.

This avoids Firebase identity/session migration. The existing AuctionYodha verification handler is not reused. Phone authentication does not by itself register the player in a tournament: player-pool registration/approval/allocation or the existing-team roster flow still applies. Direct organiser submission on behalf of a parent is a separate product increment if required.

Provider credentials and hook signing secrets must stay server-side. Redact the provider request URL because the legacy manual-OTP endpoint includes both API key and code in its path. Use bounded requests, generic client errors, Supabase rate limits, appropriate abuse controls and failed-provider response handling. Do not log code, phone, credential or full provider response. Automatic retries need care because a timeout does not prove that the provider failed to send.

## Account action needed

First confirm with 2Factor whether the currently used generic SMS service can send Supabase-generated OTPs without a custom template or own DLT registration. Do not infer approval or exemption from successful SMS delivery alone. If that service cannot send application-supplied codes, establish the supported registration/template requirements before requesting a SportStage template through **OTP Services → Manage → Manage OTP Templates**. No applicable approved entity/header is currently established.

Suggested template name: `SportStage_Login`.

Suggested message wording (the OTP marker below is illustrative; use the exact variable syntax required by 2Factor/DLT):

> {OTP} is your SportStage sign-in code. Do not share it.

Do not add an expiry promise until it matches Supabase's configured OTP expiry. Do not reuse an Auction Yodha-branded message for SportStage login. The exact approved template name, sender/header, content and manual-OTP support must be recorded before activation. Account support/contact messages have not been sent.

## Credential finding

The working 2Factor credential is present in a Git-tracked AuctionYodha development configuration file. Treat it as exposed and rotate it before production enablement. Coordinate replacement in AuctionYodha's deployed server secrets as well, to preserve existing login. Use the new credential only in server secret storage; an unprefixed variable is not automatically bundled by Vite, but tracking it in Git still exposes it to repository readers/history. Removing it from the current file does not remove historical copies. No rotation, history rewrite or AuctionYodha code change was performed in this read-only evaluation.

## Acceptance still required

- SportStage template and relevant provider/DLT approvals confirmed.
- Credential rotation coordinated and new secret installed on the intended servers.
- Hook signature validation and invalid payload/provider failures tested without sending paid SMS.
- Signup, existing-account linking, resend, wrong/expired OTP and duplicate submissions tested in isolation.
- Actual approved-template SMS delivery checked on the intended Indian carriers.
- Parent profile → organiser roster → nine-player, five-over scoring rehearsal with independent Android/web viewers passes.

## References

- [Supabase Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)
- [Supabase Auth Hooks plan availability](https://supabase.com/docs/guides/auth/auth-hooks)
- [2Factor manual OTP/custom template documentation](https://dial2verify.com/corp/support-system/tkt/knowledgebase.php?article=21)
- [2Factor current SMS and DLT guidance](https://2factor.in/v4/services/bulk-sms-api.html)
