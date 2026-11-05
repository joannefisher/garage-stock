# Moving Rivermead Stock Manager to a new Supabase project

Use this with `rivermead-full-schema.sql`. That script rebuilds the whole database structure and its permissions in one run. These steps cover what a SQL script can't do: logins, settings, keys, and pointing the app at the new project.

Old project: `phqeftsowmorrsbbsrkn` (region eu-west-1, Ireland). Leave it running until step 9 is done.

---

## 1. Create the new project

1. Sign in to supabase.com with the **new** login and create a new project.
2. **Region:** pick the same one as before (West EU / Ireland, `eu-west-1`) or London. Both are fine for a UK garage.
3. Save the **database password** in your password manager. You'll only need it for direct database tools, not for the app.

## 2. Build the database

1. In the new project go to **SQL Editor → New query**.
2. Open `rivermead-full-schema.sql`, copy **all** of it, paste it in, and click **Run**.
3. You should see "Success. No rows returned".
   - If it errors, nothing has been created, because the whole script runs as one transaction. Send me the error.
   - If it says `public.stock_items already exists`, you're in a project that already has the tables. Check you're in the new one.

This creates all 20 tables, 6 report views, every constraint and index, the 6 functions and 17 triggers, Row Level Security on every table with all 46 policies, and the same grants as today. I checked it against the live project and it matches exactly.

## 3. Authentication settings

In **Authentication**:

1. **Turn off public sign-ups.** Under Sign In / Providers, switch off **"Allow new users to sign up"**. Staff accounts are only ever created by an admin, same as now.
2. Under **URL Configuration**, set **Site URL** to the app's live address (your Vercel URL or custom domain). Add the same address under **Redirect URLs**, plus `http://localhost:3000` for local testing.

## 4. Check the JWT signing key (affects speed, not correctness)

The app checks logins locally, which is the fast path from the September performance work. That only works when the project signs its logins with an **asymmetric** key (ECC P-256 / ES256).

1. Go to **Project Settings → JWT Keys**.
2. If the current key is **ECC (P-256)** or another asymmetric key, you're done.
3. If it's the **legacy HS256 secret**, create an asymmetric standby key and rotate to it. Supabase walks you through this on the same page.

If you skip this, the app still works. It just falls back to the slower check and pages feel like they did before the speed fixes.

## 5. Create staff logins

1. Go to **Authentication → Users → Add user → Create new user**. Enter the email and password and tick **Auto Confirm User**.
2. A staff profile is created automatically, with role **mechanic**. To make someone an admin or manager, run this in the SQL Editor (change the email and name):

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Joanne Fisher'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

   Roles are `admin`, `manager` and `mechanic`.

Passwords don't carry over from the old project. Everyone gets a new account here.

## 6. Bring the data across (if needed)

The script creates **structure only**. The old project currently holds about **22 products (18 parts, 4 tyres), 7 suppliers, 8 jobs, 15 stock lots, 37 stock movements, 13 stocktakes and 2 Black Circle lots**.

- If that's test data, skip this step and start fresh.
- If you want to keep it, a data script can copy it across. It has to swap the old staff ID for the new one wherever records say who did what. **Do this after step 5 and before anyone uses the new project.**

## 7. Point the app at the new project

### 7a. Get the new keys

Go to **Project Settings → API Keys** (and **Data API** for the URL). You need three values:

| App setting | Where to find it in the new project |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **anon** key (under "Legacy API keys") or the **publishable** key (`sb_publishable_…`). Either works. |
| `SUPABASE_SERVICE_ROLE_KEY` | The **service_role** key (legacy tab) or a **secret** key (`sb_secret_…`). Keep it private. It's only used by the `seed:test-user` script. |

### 7b. Your computer

In `C:\Users\JoanneFisher\Documents\GitHub\garage-stock\.env.local`, replace those three values. Leave the `DVSA_MOT_HISTORY_*` and `AUTH_AUTO_LOGIN*` lines as they are. Then restart `npm run dev`.

### 7c. Vercel (the live app)

1. Open the project in Vercel and go to **Settings → Environment Variables**.
2. Edit the same three variables for **Production** (and **Preview / Development** if they're set there).
3. Go to **Deployments**, open the latest one, click **⋯ → Redeploy**.

   **The redeploy is required.** The two `NEXT_PUBLIC_…` values are built into the app when it's built, so changing them alone does nothing until it rebuilds.

### 7d. Everyone signs in again

Existing logins belong to the old project, so everyone will be sent to the login page. They sign in with their new account from step 5. If a browser keeps behaving oddly, clear cookies for the site.

## 8. Test it

Sign in as an admin on the live site and check:

- [ ] Overview loads with no errors
- [ ] Settings → Suppliers: add a supplier
- [ ] Stock → Add product: create a part and a tyre
- [ ] Quick Stock Add: receive stock, and the quantity goes up
- [ ] Orders → New order, then receive it from the Orders page
- [ ] Jobs: open a job, add a part, fill in tyre pressures, tread depth, discs/pads, checks, then close it
- [ ] Stocktakes: start one, record a count, complete it
- [ ] Sign in as a **mechanic** account: you land on My Jobs and can't reach Settings or Orders

## 9. Afterwards

- **Reconnect Claude's Supabase connector** to the new login. The current connection belongs to the old account, so I can't apply future database changes to the new project until it's reconnected.
- **Old project:** once you're happy (say a week of normal use), **pause** it from its settings, then delete it later.
- **Future database changes** carry on as numbered files in `supabase/migrations/` from `0025` onwards. `rivermead-full-schema.sql` is equivalent to running `0001`–`0024`.
- The project id `phqeftsowmorrsbbsrkn` appears in some notes and comments in the repo. They're history only, and nothing in the running app depends on them.
