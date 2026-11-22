// cf-bm: personal article bookmarks. Single-file Cloudflare Worker backed by D1 (binding: DB).
//
// Security model:
//  - The user is identified ONLY by their secret token, never by anything else in the request.
//  - D1 stores only a SHA-256 hash of each token.
//  - Every query is scoped with `WHERE user_id = ?` (the ID from the token).
//  - Browsers hold the token in an HttpOnly, Secure, SameSite=Lax cookie, set once via the login form.
//  - Every state-changing POST checks the Origin header and a CSRF value derived from the token.

const COOKIE = "bm_session";
const MAX_URL = 2048;
const MAX_TITLE = 500;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      console.error(err);
      return html("<h1>Something went wrong</h1>", 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const user = await currentUser(request, env);

  if (method === "POST") {
    if (!sameOrigin(request, url)) return text("Bad origin", 403);
    const form = await request.formData();

    if (url.pathname === "/login") return login(form, env, url);
    if (!user) return text("Not logged in", 401);
    if (form.get("csrf") !== (await csrfFor(user))) return text("Bad CSRF token", 403);

    if (url.pathname === "/save") return saveArticle(form, env, user);
    if (url.pathname === "/delete") return deleteArticle(form, env, user);
    if (url.pathname === "/logout") return logout();
    return text("Not found", 404);
  }

  if (method !== "GET") return text("Method not allowed", 405);

  if (url.pathname === "/save") {
    if (!user) return loginPage(url.pathname + url.search);
    return confirmSavePage(url, user);
  }
  if (url.pathname === "/") {
    if (!user) return loginPage("/");
    return listPage(url, env, user);
  }
  return text("Not found", 404);
}

// ---------- auth ----------

// Browsers send `Origin: null` on form POSTs from pages with a strict referrer policy,
// so also accept the browser-set Sec-Fetch-Site header, which pages cannot forge.
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== "null") return origin === url.origin;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function currentUser(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT id, name, token_hash FROM users WHERE token_hash = ?")
    .bind(hash)
    .first();
  return row || null;
}

// CSRF value bound to the user's token hash. It can't be computed without the token.
function csrfFor(user) {
  return sha256("csrf:" + user.token_hash);
}

async function login(form, env, url) {
  const token = String(form.get("token") || "").trim();
  const next = safeNext(String(form.get("next") || "/"));
  const row = token
    ? await env.DB.prepare("SELECT id FROM users WHERE token_hash = ?").bind(await sha256(token)).first()
    : null;
  if (!row) return loginPage(next, "That token isn't valid.", 401);
  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
    },
  });
}

function logout() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  });
}

// Only allow redirects to our own paths (stops open redirects via ?next=).
function safeNext(next) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// ---------- articles ----------

function validUrl(raw) {
  if (!raw || raw.length > MAX_URL) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function saveArticle(form, env, user) {
  const url = validUrl(String(form.get("url") || ""));
  if (!url) return html(page("Not saved", `<p>Only http(s) links can be saved.</p>`), 400);
  const title = (String(form.get("title") || "").trim() || url).slice(0, MAX_TITLE);
  await env.DB.prepare(
    `INSERT INTO articles (id, user_id, url, title) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, url) DO UPDATE SET title = excluded.title, saved_at = datetime('now')`
  )
    .bind(crypto.randomUUID(), user.id, url, title)
    .run();
  return savedPage(title);
}

async function deleteArticle(form, env, user) {
  await env.DB.prepare("DELETE FROM articles WHERE id = ? AND user_id = ?")
    .bind(String(form.get("id") || ""), user.id)
    .run();
  return new Response(null, { status: 303, headers: { Location: "/" } });
}

// ---------- pages ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function page(title, body, nonce = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:1rem;color:#222;background:#fafafa}
  @media (prefers-color-scheme:dark){body{color:#ddd;background:#181818}a{color:#8ab4f8}}
  input[type=text],input[type=password],input[type=search]{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}
  button{padding:.6rem 1rem;font-size:1rem;cursor:pointer}
  ul{list-style:none;padding:0} li{padding:.6rem 0;border-bottom:1px solid #8883;display:flex;gap:.5rem;align-items:start}
  li div{flex:1;min-width:0;overflow-wrap:anywhere} small{opacity:.65}
  .row{display:flex;gap:.5rem;align-items:center;justify-content:space-between}
  .inline{display:inline;margin:0} .del{padding:.2rem .5rem;font-size:.85rem}
</style></head><body>${body}</body></html>`;
}

function html(body, status = 200, nonce = "") {
  const scriptSrc = nonce ? `'nonce-${nonce}'` : "'none'";
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    },
  });
}

function text(body, status) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function loginPage(next, error = "", status = 200) {
  return html(
    page(
      "Log in",
      `<h1>Bookmarks</h1>
<p>Paste your token to log in on this browser. You only need to do this once.</p>
${error ? `<p style="color:#c33">${esc(error)}</p>` : ""}
<form method="post" action="/login">
  <input type="hidden" name="next" value="${esc(safeNext(next))}">
  <p><input type="password" name="token" autocomplete="current-password" placeholder="Token" required></p>
  <button>Log in</button>
</form>`
    ),
    status
  );
}

async function confirmSavePage(url, user) {
  const target = String(url.searchParams.get("url") || "");
  const title = String(url.searchParams.get("title") || "").slice(0, MAX_TITLE);
  if (!validUrl(target)) return html(page("Not saved", `<p>Only http(s) links can be saved.</p>`), 400);
  return html(
    page(
      "Save article",
      `<h2>Save this article?</h2>
<form method="post" action="/save">
  <input type="hidden" name="csrf" value="${await csrfFor(user)}">
  <input type="hidden" name="url" value="${esc(target)}">
  <p><input type="text" name="title" value="${esc(title)}" aria-label="Title"></p>
  <p><small>${esc(target)}</small></p>
  <button autofocus>Save</button>
</form>`
    )
  );
}

function savedPage(title) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return html(
    page(
      "Saved",
      `<h2>Saved ✓</h2><p>${esc(title)}</p>
<p><button id="close">Close</button> <a href="/">View list</a></p>
<script nonce="${nonce}">
  document.getElementById("close").onclick = () => window.close();
  setTimeout(() => window.close(), 1500);
</script>`
    ),
    200,
    nonce
  );
}

async function listPage(url, env, user) {
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 200);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const { results } = q
    ? await env.DB.prepare(
        `SELECT id, url, title, saved_at FROM articles
         WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
         ORDER BY saved_at DESC LIMIT 500`
      ).bind(user.id, like, like).all()
    : await env.DB.prepare(
        "SELECT id, url, title, saved_at FROM articles WHERE user_id = ? ORDER BY saved_at DESC LIMIT 500"
      ).bind(user.id).all();

  const csrf = await csrfFor(user);
  const items = results
    .map(
      (a) => `<li><div><a href="${esc(a.url)}" rel="noopener noreferrer" target="_blank">${esc(a.title)}</a><br>
<small>${esc(new URL(a.url).hostname)} · ${esc(a.saved_at.slice(0, 10))}</small></div>
<form method="post" action="/delete" class="inline"><input type="hidden" name="csrf" value="${csrf}">
<input type="hidden" name="id" value="${esc(a.id)}"><button class="del" title="Delete">✕</button></form></li>`
    )
    .join("");

  return html(
    page(
      "Bookmarks",
      `<div class="row"><h1>Bookmarks</h1>
<form method="post" action="/logout" class="inline"><input type="hidden" name="csrf" value="${csrf}">
<button class="del">Log out (${esc(user.name)})</button></form></div>
<form method="get" action="/"><input type="search" name="q" value="${esc(q)}" placeholder="Search"></form>
<ul>${items || "<p>No articles yet.</p>"}</ul>`
    )
  );
}
