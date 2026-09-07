# Deploying the Schoolagy beta

Two things get deployed, as two separate Cloudflare Workers:

| What | Repo | Domain |
|---|---|---|
| The app | `schoolagy-app` | `app.schoolagy.io` |
| The Schoology proxy | `schoolagy-api` | `api.schoolagy.io` |

They're separate because the API holds secrets and the app doesn't, and because
each should be redeployable without touching the other. This is the same setup
pattern that already works for `schoolagy-landing`.

---

## 1. Deploy the API first

The app's sign-in has nothing to talk to until this exists. (Mock mode works
without it, but real sign-in won't.)

1. **Push `schoolagy-api` to a new GitHub repo** — e.g. `Schoolagy/schoolagy-api`.

2. **Set the session secret.** This is required; without it sign-in deliberately
   returns a 500 rather than issuing sessions sealed with an undefined key.

   ```bash
   cd schoolagy-api
   npm install
   npx wrangler secret put SESSION_SECRET
   ```

   Paste a long random string when prompted. To generate one:

   ```bash
   node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   ```

   Keep a copy somewhere safe — changing it later signs everyone out at once.

3. **Deploy.** Either `npx wrangler deploy` from your machine, or connect the
   repo in the Cloudflare dashboard (Workers & Pages → Create application →
   from Git) with build command `npm install` and deploy command
   `npx wrangler deploy`.

4. **Attach the domain.** On the Worker → Settings → Domains & Routes → add
   Custom Domain → `api.schoolagy.io`. Cloudflare creates the DNS record itself.

5. **Check it.** `https://api.schoolagy.io/` should return
   `{"service":"schoolagy-api","status":"ok"}`.

## 2. Deploy the app

1. **Push `schoolagy-app` to a new GitHub repo** — e.g. `Schoolagy/schoolagy-app`.

2. **Create the Worker.** Cloudflare → Workers & Pages → Create application →
   connect that repo. Same settings as the landing page:

   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`

   `wrangler.jsonc` already declares `name: schoolagy-app` and
   `assets.directory: ./out`, so Wrangler knows what to upload and won't try to
   auto-convert the project to a server-rendered setup.

3. **Attach the domain:** Custom Domain → `app.schoolagy.io`.

4. **Check it.** `https://app.schoolagy.io` shows the login screen. Press
   **Escape** — you should land in onboarding, then the full app on demo data.

## 3. Verify the beta end to end

**Mock mode** (no Schoology account needed — this is the beta-tester path):

1. Open `app.schoolagy.io`
2. Press **Escape** → onboarding
3. Complete onboarding → Home, populated with sample data, "Beta · demo data"
   badge in the corner
4. Click through Courses, Grades, Assignments, Calendar, Messages, Settings
5. Settings → try uploading a profile photo → it should scan before accepting
6. Profile menu → Sign out → back to login

**Live mode** (needs a real key):

1. In Schoology, go to your school's `/api` page and generate a personal API key
   + secret (any user can do this — no admin needed)
2. On the login screen, "Continue with API keys", paste both, Connect
3. A wrong key should now say *why* it failed rather than just turning red
4. On success you land in onboarding (first time) or Home (returning), showing
   your real courses and grades

---

## Notes and gotchas

**The build fails loudly on purpose.** `npm run build` regenerates the routes
from `pages-src/*.html` and then verifies them. If an edit to a source page
breaks one of the wiring transforms, the deploy fails instead of silently
shipping an app whose NSFW filter or live-data wiring does nothing. If you see a
build fail with `Transform "..." matched nothing`, that's this working — the fix
goes in `scripts/port-pages.mjs`.

**Edit `pages-src/*.html`, never `app/*/page.tsx`.** The latter are generated on
every build and gitignored; edits there are lost.

**First upload on a device is slower.** It downloads the ~2.6MB NSFW model, then
caches it in IndexedDB. Later uploads are fast.

**Sessions last 30 days**, and Schoology expires its own API tokens after 90, so
users will need to re-key occasionally.

**Cookies need both subdomains on `schoolagy.io`.** The session cookie is set on
`.schoolagy.io` so `app.` and `api.` share it. Serving the app from a different
registrable domain would need `SameSite=None` and a rethink.

## If something breaks

| Symptom | Likely cause |
|---|---|
| Sign-in returns 500 | `SESSION_SECRET` was never set on the API Worker |
| Sign-in returns 401 with a correct key | Key/secret mismatch, or the key was revoked/expired (90-day limit) |
| App loads but every page is empty in live mode | API unreachable or CORS — check `ALLOWED_ORIGINS` in `schoolagy-api/wrangler.jsonc` |
| Uploads always rejected with "couldn't run the image check" | Model files missing from `public/models/mobilenet_v2/` — screening fails closed by design |
| Signed in but bounced back to login | Session expired; the app clears its local flag on a 401 |
