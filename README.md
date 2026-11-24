# Cast

Cast Social (watch, follow, talk) and Cast Studio (record, upload, publish) in one web app.
The web app works on phones (add it to your home screen) and desktop. Native iPhone and Android apps come after the beta.

## How it fits together

| Part | What it does |
| --- | --- |
| `src/app` | Pages: feed (`/`), topics, profiles (`/u/handle`), player (`/v/id`), Studio (`/studio`) |
| `src/app/api/uploads` | Starts an upload: checks who you are, creates the video record, returns a one-time Mux upload link |
| `src/app/api/webhooks/mux` | Mux tells us when a video is ready; we publish it to the feed |
| `supabase/migrations` | The database: tables, security rules (Row Level Security), counters |
| `supabase/tests` | Security tests proving users can only see and change what they should |

## Security model

- Browsers and phones only hold the public Supabase key. Row Level Security in the database decides what each user can read or change.
- Secret keys (Supabase service role, Mux) live only in server environment settings, never in the code or the browser.
- Video files go straight from the creator's device to Mux through a one-time upload link.
- Mux webhooks are verified with a signing secret before we act on them.

## Running checks

```
npm install
npm run check      # lint, type check, and database security tests
```

The database tests need PostgreSQL 16 installed locally.

## Setting up (one time)

1. Create a Supabase project, then run `supabase/migrations/*.sql` in its SQL editor (or with the Supabase CLI).
2. In Supabase, turn on Email sign-in, and Google and Apple if wanted. Set the site URL and add `<site>/auth/callback` as a redirect URL.
3. Create a Mux account, an API access token (Mux Video read and write), and a webhook pointing at `<site>/api/webhooks/mux`.
4. Copy `.env.example` to `.env.local` (and into Vercel's environment settings) with the real values.
5. `npm run dev` for local, or deploy to Vercel.
