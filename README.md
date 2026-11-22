# cf-bm: cross-browser article bookmarks

The bookmarklet opens a popup that saves the article to your Cloudflare Worker, and the Worker stores it in D1. The list page shows your articles on any device. Each user only ever sees and changes their own list.

## 1. Fill in `.env`

Open `.env` and fill in:

- **CLOUDFLARE_API_TOKEN**: dashboard → My Profile → API Tokens → Create Token → Custom. Give it these permissions:
  - Account · **Workers Scripts** · Edit
  - Account · **D1** · Edit
- **TF_VAR_account_id**: dashboard → Workers & Pages (it's in the right sidebar).
- **TF_VAR_workers_subdomain**: the `xxx` in `*.xxx.workers.dev`. You'll find it under Workers & Pages → Settings. You may need to claim one first.

## 2. Deploy (when you're ready)

```sh
set -a; source .env; set +a
cd terraform
terraform init
terraform plan        # review this
terraform apply
cd ..
scripts/migrate.sh              # creates the tables
scripts/add-user.sh {user}       # prints your token ONCE. Save it in a password manager.
terraform -chdir=terraform output url
```

Terraform reuploads the Worker whenever `worker/src/index.js` changes, so for code changes you just run `terraform apply` again.

Other users: run `scripts/add-user.sh <name>` and send them their token privately. There is no public sign-up.
If a token leaks: run `scripts/rotate-token.sh <name>`. The old token stops working immediately.

## 3. Make your bookmarklet

Copy the single line in `bookmarklet.js` and replace `https://YOUR-WORKER-URL` with your `url` output. Leave off the trailing slash.
The bookmarklet contains **no secret**, so it's safe to share.

## 4. Desktop browser setup (Firefox / Safari on Mac)

**Log in once:** open your Worker URL, paste your token and press Log in. The browser stays logged in for a year.

**Firefox**
1. Show the toolbar with Ctrl+Shift+B (⌘⇧B on Mac).
2. Right-click the toolbar → **Add Bookmark…**
3. Name: `Save article`. URL: paste the bookmarklet line. Save it.

**Safari (Mac)**
1. Show the toolbar with View → Show Favorites Bar.
2. Bookmark any page (⌘D) and put it in **Favorites**.
3. Bookmarks → Edit Bookmarks, then right-click the new bookmark → **Edit Address**. Paste the bookmarklet line, and rename the bookmark to `Save article`.

Bookmark the Worker URL itself too. That's your list.

## 5. iPad Safari setup

1. Open your Worker URL in Safari and **log in with your token** (you only do this once).
2. While you're on that page, tap the **Share** button → **Add Bookmark**. Name it `Bookmarks` and save it to **Favorites**. That's your list.
3. Tap Share → **Add Bookmark** again. Name this one `Save article` and save it to Favorites.
4. Open the bookmarks (book icon) → **Edit** → tap `Save article`. Replace its address with the bookmarklet line → **Done**.
   - Tip: to get the line onto the iPad, AirDrop or Notes-sync it from your Mac, then long-press → Select All → Copy.
5. To use it: open an article, tap the address bar and tap `Save article` under Favorites (or open it from the bookmarks list). A new tab opens. Tap **Save** and close the tab.

If the iPad's settings for "Block Pop-ups" stop the save tab from opening, allow pop-ups or open the bookmarklet from the Bookmarks list.

## Security summary

- You're identified only by your token. D1 stores only its SHA-256 hash.
- Every query includes `WHERE user_id = ?` (the ID from the token), so other users can't read, add or delete your articles.
- The token is kept in an HttpOnly, Secure, SameSite=Lax cookie. Page scripts can't read it, and it's never in the bookmarklet or in URLs.
- Saving needs a click on **Save**. Every POST checks the Origin header and a CSRF value, so other sites can't add to your list.
- Only http(s) URLs are accepted. Output is HTML-escaped and pages send a strict Content-Security-Policy.
- Not in v1: rate limiting. Tokens are 256-bit random, so they can't be guessed. You can add rate limiting later with Cloudflare's rate-limiting rules.
