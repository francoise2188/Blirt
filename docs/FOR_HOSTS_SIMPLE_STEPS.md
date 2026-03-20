# Blirt — simple setup steps (hosts)

## 1) Run the database script (one time)

1. Open **Supabase** (your project).
2. Go to **SQL Editor**.
3. Open the file **`supabase/HOST_SETUP.sql`** from this project (copy/paste into the editor).
4. Click **Run**.
5. If you see errors about a policy already existing, tell Cursor/AI or remove the old policy in Supabase (**Authentication → Policies** or Table **events / blirts**) and run again.

## 2) Link your account to an event (if you already had events)

New events you create after logging in will attach to you automatically.

For an **old** event row (created before host login):

1. In Supabase → **Authentication → Users**, copy your user **UUID**.
2. Run in SQL Editor (replace the IDs):

   `UPDATE events SET owner_id = 'YOUR_USER_UUID' WHERE id = 'YOUR_EVENT_UUID';`

## 3) Allow magic-link sign-in

In Supabase → **Authentication** → **URL configuration**:

- **Site URL**: your main app URL (e.g. `http://localhost:3001`).
- **Redirect URLs**: add  
  `http://localhost:3001/auth/callback`  
  and your LAN/production URLs the same way (`http://YOUR-IP:3011/auth/callback`, etc.).

## 4) Optional: stable links in QR codes

In `.env.local` set:

`NEXT_PUBLIC_APP_URL=http://YOUR-COMPUTER-IP:3011`

(or your real domain).  
That way QR codes use the same base URL even if you open the host dashboard from a different place.

## 5) Use the app

- **Guests**: `/guest?event=EVENT_ID`
- **Hosts**: **Host login** on the home page → create event → **Guest link & QR** tab.

Stripe comes later, as planned.
