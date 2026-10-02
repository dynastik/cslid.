# cslid.

> **Status: Beta**

cslid. is a startup launchpad and founder–investor matchmaker. Founders publish a startup profile and post progress updates; investors swipe through published startups, request connections, and message founders once a connection is accepted.

**Live app:** https://dynastik.github.io/cslid./

## Features

- Email/password and Google auth via Supabase Auth (password-reset email, session persistence)
- Founder and investor roles
- Startup profile creation with public/private draft toggle
- Investor swipe deck (Match Deck) sourced from published startups
- Startup directory with sector filtering
- Journey feed for founder progress updates
- Connection requests → accept/reject → messaging (only after acceptance)
- Blocking and reporting
- Launch Center with an onboarding checklist and pitch-generation tool
- Data export and account deletion (self-service)
- Light and dark themes
- Realtime updates for messages, connections, and matches (Supabase Realtime)

## Architecture

- **Frontend:** static HTML/CSS/JS, hosted on GitHub Pages. No build step.
- **Backend:** Supabase (Postgres + Auth + Realtime), accessed directly from the browser using the public anon key. All access control is enforced server-side via Postgres Row Level Security (RLS) policies and `security definer` functions — see `supabase-schema.sql`.
- **Client-side cache:** the app fetches data from Supabase and mirrors a filtered copy into `localStorage` purely so the UI can render instantly and survive refreshes. Supabase remains the source of truth; the cache is refreshed on load, every 60 seconds, and on realtime events.

## Supabase and Google auth setup

Set the project's Supabase URL and **anon/publishable key** in `js/supabase.js`. The browser key is public by design; never put a service-role key in this repository.

Enable Google in Supabase under **Authentication → Providers → Google** and configure the OAuth client there. In Google Cloud, allow the Supabase callback URL shown by the provider setup (normally `https://<project-ref>.supabase.co/auth/v1/callback`). Add the deployed app URL, `https://dynastik.github.io/cslid./`, to the Supabase **Authentication → URL Configuration → Redirect URLs** allow list. For local testing, use a local HTTP server and add its exact origin/path to that allow list too.

Google sign-in asks the user to select a founder or investor role. The app saves the first-time user's `cslid_users` and `cslid_profiles` rows after OAuth returns; confirm the schema, RLS insert policies, and the non-destructive migration are applied before testing it.

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
- No admin/moderation dashboard yet — reports and blocks are recorded in the database but need to be reviewed directly in Supabase.
- No automated backups configured beyond Supabase's own defaults.
- Limited cross-browser and mobile testing so far.

## License

No open-source license has been selected yet. Until a license is added, all rights are reserved by the project owner.