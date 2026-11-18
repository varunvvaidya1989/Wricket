# Twilio SMS trial for SportStage

18 November 2026. Status: account creation required; no real SMS or Supabase OTP test performed. User confirmed that a new Twilio account is needed. No credentials, sender, destination or account-specific route approval are configured locally. No Twilio connector was found in the plugin search.

## Important route qualification

Twilio's India guidance distinguishes domestic DLT-registered traffic from international traffic. Its separate traffic-classification guidance defines domestic/international by the customer's business headquarters relative to the destination country. Choosing a foreign sender number or using a US-headquartered provider does not itself make an India-based customer's messages international.

SportStage's legal entity/headquarters and route eligibility have not been established. Twilio must confirm the supported India route and registration requirements for the actual business before this is treated as a way to launch without DLT. Earlier suggestions that international sending was readily available were too broad.

## Bounded first test

1. Create a [Twilio trial account](https://www.twilio.com/try-twilio) with accurate business/country information. The owner completes email/phone verification and account terms.
2. Open the SMS Messaging trial. Verify the owner's intended test destination and follow the Console's available sender/content controls. Current trials can require predefined content and restrict sending to the signup country. Legacy account instructions can differ; do not assume a trial allows arbitrary SportStage OTP text.
3. Before buying a number or upgrading, obtain account-specific confirmation from Twilio on India route eligibility and DLT requirements.
4. If available in the trial, send one provider-supported diagnostic SMS to the owner's verified phone. Record its delivery status and human receipt. A queued/accepted API response is insufficient. This test is delivery-only and does not establish Supabase OTP acceptance.
5. If the route supports production use, configure the supported Twilio provider in an isolated Supabase test project, using server-side Console secrets. Start with Twilio Programmable Messaging for Supabase-generated codes; Twilio Verify has different code ownership/settings and is not interchangeable configuration.
6. Test `signInWithOtp` then `verifyOtp(type: 'sms')` before exposing phone login in SportStage. Confirm new-profile onboarding, explicit linking for existing email users, duplicate/expired/wrong-code handling and account identity preservation. Keep the existing email login available.
7. Rehearse parent player registration, organiser assignment and scorer/viewer permissions on Android and web before production enablement.

Draft question for Twilio (not sent):

> SportStage serves parents of players in Indian community cricket tournaments. Our business is headquartered in [actual country]. We want to send authentication SMS to +91 numbers through Supabase Auth. Do we qualify for your international India SMS route, or must we complete domestic DLT registration? Which sender/product is supported, what trial restrictions apply, and what are the applicable setup and per-message costs?

## Credentials and cost

No credentials should be pasted into chat or committed. After an account exists, place test credentials in ignored `.env.twilio.local` if local API checks are needed. Do not use `EXPO_PUBLIC_` for the Auth Token. Use a dedicated server secret for production and avoid reusing AuctionYodha credentials.

The public India Programmable Messaging price page currently lists USD 0.0832 per outbound SMS segment for international numbers. This is not an account-specific quote; sender charges, taxes and other applicable fees can add cost. Trial delivery does not prove production route eligibility. Buying/upgrading is not necessary for the initial account eligibility assessment.

## References

- [Twilio India SMS guidelines](https://www.twilio.com/en-us/guidelines/in/sms)
- [Domestic versus international traffic classification](https://help.twilio.com/articles/25724588501147)
- [Current Twilio trial restrictions](https://www.twilio.com/docs/usage/trials)
- [India Programmable Messaging pricing](https://www.twilio.com/en-us/sms/pricing/in)
- [Supabase phone-provider setup](https://supabase.com/docs/guides/auth/phone-login?showSmsProvider=Twilio)
