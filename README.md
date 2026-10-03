# cslid.

> **Status: Beta**

cslid. is a startup launchpad and founder–investor matchmaker. Founders publish a startup profile and post progress updates; investors swipe through published startups, request connections, and message founders once a connection is accepted.

**Live app:** https://dynastik.github.io/cslid./

## Features

- Email/password and Google auth via Supabase Auth (Google users can optionally set a password through password reset)
- Founder and investor roles
- Startup profile creation with public/private draft toggle
- Investor swipe deck (Match Deck) sourced from published startups
- Startup directory with sector filtering
- Journey feed for founder progress updates
- Connection requests → accept/reject → messaging (only after acceptance)
- Blocking and reporting
- Moderator-only report review queue for profile and post reports
- Launch Center with an onboarding checklist and pitch-generation tool
- Data export and account deletion (self-service)
- Light and dark themes
- Realtime updates for messages, connections, and matches (Supabase Realtime)

## Architecture

- **Frontend:** static HTML/CSS/JS, hosted on GitHub Pages. No build step.
- **Backend:** Supabase (Postgres + Auth + Realtime), accessed directly from the browser using the public anon key. All access control is enforced server-side via Postgres Row Level Security (RLS) policies and `security definer` functions — see `supabase-schema.sql`.
- **Client-side cache:** the app fetches data from Supabase and mirrors a filtered copy into `localStorage` purely so the UI can render instantly and survive refreshes. Supabase remains the source of truth; the cache is refreshed on load, every 60 seconds, on realtime events, and through the global Refresh control.

## Supabase and Google auth setup

Set the project's Supabase URL and **anon/publishable key** in `js/supabase.js`. The browser key is public by design; never put a service-role key in this repository.

Enable Google in Supabase under **Authentication → Providers → Google** and configure the OAuth client there. In Google Cloud, allow the Supabase callback URL shown by the provider setup (normally `https://<project-ref>.supabase.co/auth/v1/callback`). Add the deployed app URL, `https://dynastik.github.io/cslid./`, to the Supabase **Authentication → URL Configuration → Redirect URLs** allow list. For local testing, use a local HTTP server and add its exact origin/path to that allow list too.

Google sign-in asks the user to select a founder or investor role. The app saves the first-time user's `cslid_users` and `cslid_profiles` rows after OAuth returns; confirm the schema, RLS insert policies, and the non-destructive migration are applied before testing it.

To change Google's “Choose an account to continue to tudq…supabase.co” label, edit the OAuth app branding in **Google Cloud Console → Google Auth Platform → Branding** (older console: **APIs & Services → OAuth consent screen**). Set the app name to `cslid.`, add the logo, support email, and the verified domain you control. The Supabase callback remains the authorized redirect URI; changing the branding does not change the callback. A custom Supabase Auth domain is another option if your Supabase plan supports it, but requires updating the provider callback and redirect allow-list configuration too.

### Live beta checklist

Before inviting testers:

1. After non-destructive migration 001 is applied, run [`supabase-beta-hardening.sql`](./supabase-beta-hardening.sql) in the Supabase SQL Editor. It can be re-run safely and closes the founder-role write gap for startup updates/deletes and ties profile roles to account roles. Never run [`supabase-schema.sql`](./supabase-schema.sql) on the live project; it deletes app tables and all Auth users.
2. In **Supabase → Authentication → URL Configuration**, set the Site URL to `https://dynastik.github.io/cslid./` and add that exact URL under Redirect URLs. Add separate exact URLs for any preview or local test origins you use.
3. In **Supabase → Authentication → Providers → Google**, confirm Google is enabled and the OAuth client ID/secret are present. In Google Cloud, add the Supabase callback URL shown on that provider page as an authorized redirect URI; it is the Supabase callback, not the GitHub Pages URL.
4. Confirm the app uses the Supabase project URL and browser anon/publishable key in `js/supabase.js`. Never use a service-role/secret key in frontend code or GitHub Pages.
5. Confirm RLS is enabled on every `cslid_*` table, Realtime includes messages/connections/matches, and the policies/RPC grants from migration 001 are present. Keep the anon role unable to call account, report, block, connection, or messaging RPCs.
6. Test with separate founder and investor accounts: email verification and sign-in, Google sign-in, role persistence, private startup draft, published startup discovery, connection accept/reject/retry, messaging only after acceptance, block/report, export, and account deletion. Use test data and do not validate deletion on a real account.
7. To designate a moderator after that person has signed up, run this in the SQL Editor with their account email:
   ```sql
   insert into public.cslid_moderators (user_id)
   select id from auth.users where lower(email) = lower('moderator@example.com')
   on conflict (user_id) do nothing;
   ```
   Remove access by deleting that user's row from `public.cslid_moderators`. The Reports tab is visible only to assigned moderator accounts; report content and decisions are protected by RLS and server-side RPC checks. The queue supports profile and post reports, marking reports reviewed, dismissing reports, and recording a review note. New reports update an open moderator queue in realtime. Start with a human reviewer and do not auto-ban based solely on report counts. For email/Slack alerts, connect a Supabase Database Webhook or Edge Function to a notification provider and store credentials as Supabase secrets, never in the frontend.
8. Decide who checks the queue and how quickly, who covers absences, and how users can contact you. Configure an appropriate backup/export schedule and production email delivery in Supabase before inviting the public.

## Repository structure

```
cslid/
├── index.html              # GitHub Pages entry point and page markup
├── favicon.svg              # Website favicon
├── README.md                 # Project documentation
├── supabase-schema.sql       # Database tables, RLS policies, triggers, RPC functions
├── css/
│   └── styles.css            # Custom styles
└── js/
    ├── app.js                # Application behavior and UI logic
    └── supabase.js            # Supabase client and database helper functions
```


## Known limitations (beta)

- Posts in the journey feed are readable by anyone with the anon key, including unauthenticated visitors — there is currently no members-only visibility option for posts.
- New profiles default to public with no opt-out at signup (startups do have a public/private toggle).
- Moderation review is a small in-app queue for accounts explicitly assigned as moderators; it does not automatically send email/Slack notifications, suspend accounts, or provide an appeals workflow.
- Supabase backup availability and retention depend on the project plan; confirm the actual schedule and keep an independent export for beta data.
- Limited cross-browser and mobile testing so far.

## License

No open-source license has been selected yet. Until a license is added, all rights are reserved by the project owner.