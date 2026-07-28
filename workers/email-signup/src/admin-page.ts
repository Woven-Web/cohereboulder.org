// The admin portal, served as a single self-contained page from GET /admin.
// No build step and no framework: it fetches the admin API with the key the
// organizer types in, held in sessionStorage for the tab's lifetime only.

export const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:,">
<title>COhere — member portal</title>
<style>
  :root {
    --ground: #f4f4f1; --surface: #fff; --surface-2: #edeee9;
    --ink: #1c2723; --ink-2: #4a5854; --ink-3: #78847f;
    --hair: #dcdcd4; --hair-strong: #c3c5bb;
    --teal: #16776f; --teal-soft: #d3e7e3; --clay: #c2562a; --clay-soft: #f2ded3;
    --sans: ui-sans-serif, system-ui, "Avenir Next", "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #14181a; --surface: #1a1f21; --surface-2: #232a2b;
      --ink: #e7eae7; --ink-2: #a9b4b0; --ink-3: #7d8a86;
      --hair: #2c3436; --hair-strong: #3d4749;
      --teal: #4cbfb1; --teal-soft: #1e3b39; --clay: #e08b60; --clay-soft: #3a2820;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--sans);
         font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  h1 { font-size: 1.15rem; margin: 0; letter-spacing: -0.02em; font-weight: 650; }
  button { font: inherit; cursor: pointer; }
  input, select, textarea { font: inherit; color: inherit; }

  header { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between;
           padding: 0.9rem 1.25rem; border-bottom: 1px solid var(--hair); background: var(--surface); }
  header .brand { display: flex; align-items: baseline; gap: 0.6rem; }
  header .brand span { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.12em;
                       text-transform: uppercase; color: var(--teal); }
  .btn { background: var(--surface-2); color: var(--ink); border: 1px solid var(--hair-strong);
         border-radius: 3px; padding: 0.35rem 0.7rem; font-size: 0.85rem; }
  .btn:hover { border-color: var(--teal); color: var(--teal); }
  .btn.primary { background: var(--teal); border-color: var(--teal); color: #fff; }
  .btn.primary:hover { opacity: 0.9; color: #fff; }
  a { color: var(--teal); }

  .wrap { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem; max-width: 84rem; margin: 0 auto; }

  /* login */
  .login { max-width: 25rem; margin: 5rem auto; background: var(--surface); border: 1px solid var(--hair);
           padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .login input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--hair-strong);
                 border-radius: 3px; background: var(--ground); }
  .login p { margin: 0; color: var(--ink-3); font-size: 0.85rem; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 1px;
           background: var(--hair); border: 1px solid var(--hair); }
  .stat { background: var(--surface); padding: 0.85rem 1rem; }
  .stat .n { font-family: var(--mono); font-size: 1.5rem; font-variant-numeric: tabular-nums;
             letter-spacing: -0.03em; display: block; }
  .stat .k { font-size: 0.75rem; color: var(--ink-3); }

  .tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--hair); }
  .tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.5rem 0.75rem;
         color: var(--ink-3); font-size: 0.9rem; }
  .tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--teal); font-weight: 600; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
  .toolbar input[type="search"] { flex: 1 1 16rem; padding: 0.45rem 0.7rem; border: 1px solid var(--hair-strong);
                                  border-radius: 3px; background: var(--surface); }
  .chip { background: var(--surface); border: 1px solid var(--hair-strong); border-radius: 999px;
          padding: 0.25rem 0.7rem; font-size: 0.8rem; color: var(--ink-2); }
  .chip[aria-pressed="true"] { background: var(--teal-soft); border-color: var(--teal); color: var(--teal); font-weight: 600; }

  .table-scroll { overflow-x: auto; border: 1px solid var(--hair); background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
  th, td { text-align: left; padding: 0.5rem 0.8rem; border-bottom: 1px solid var(--hair); white-space: nowrap; }
  th { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.09em; text-transform: uppercase;
       color: var(--ink-3); font-weight: 400; position: sticky; top: 0; background: var(--surface); }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--surface-2); }
  tbody tr:last-child td { border-bottom: 0; }
  td.wrapcell { white-space: normal; max-width: 22rem; }
  .pill { font-family: var(--mono); font-size: 0.68rem; padding: 0.1rem 0.4rem; border-radius: 2px;
          background: var(--surface-2); color: var(--ink-2); }
  .pill.on { background: var(--teal-soft); color: var(--teal); }
  .pill.off { background: var(--clay-soft); color: var(--clay); }

  /* detail drawer */
  .drawer-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: none; }
  .drawer-bg.open { display: block; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(34rem, 100%); background: var(--surface);
            border-left: 1px solid var(--hair); overflow-y: auto; padding: 1.25rem; display: none;
            flex-direction: column; gap: 1rem; }
  .drawer.open { display: flex; }
  .drawer h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.02em; }
  .kv { display: grid; grid-template-columns: 8rem 1fr; gap: 0.3rem 0.8rem; font-size: 0.88rem; }
  .kv dt { color: var(--ink-3); font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em;
           text-transform: uppercase; padding-top: 0.15rem; }
  .kv dd { margin: 0; overflow-wrap: anywhere; }
  .sub { border: 1px solid var(--hair); padding: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .sub .label { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase;
                color: var(--teal); }
  .answer { font-size: 0.88rem; }
  .answer b { display: block; color: var(--ink-3); font-weight: 500; font-size: 0.78rem; }
  .drawer textarea, .drawer input[type="text"] { width: 100%; padding: 0.4rem 0.55rem; border: 1px solid var(--hair-strong);
            border-radius: 3px; background: var(--ground); }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

  .form-card { border: 1px solid var(--hair); background: var(--surface); padding: 1rem;
               display: flex; flex-direction: column; gap: 0.7rem; }
  .form-card textarea { width: 100%; min-height: 14rem; font-family: var(--mono); font-size: 0.78rem;
                        padding: 0.6rem; border: 1px solid var(--hair-strong); border-radius: 3px; background: var(--ground); }
  .muted { color: var(--ink-3); font-size: 0.85rem; }
  .err { color: var(--clay); font-size: 0.85rem; }
  .hidden { display: none !important; }
</style>
</head>
<body>

<div id="login" class="login">
  <h1>COhere member portal</h1>

  <div id="step-email">
    <p>Sign in with your email. We'll send a link and a one-time code.</p>
    <input id="email" type="email" placeholder="you@example.com" autocomplete="email">
    <button class="btn primary" id="sendlink" style="margin-top:0.7rem;width:100%">Email me a code</button>
  </div>

  <div id="step-code" class="hidden">
    <p>We sent a code to <b id="sentto"></b>. Enter it below, or just click the link in the email.</p>
    <input id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" maxlength="6">
    <button class="btn primary" id="verify" style="margin-top:0.7rem;width:100%">Sign in</button>
    <button class="btn" id="startover" style="margin-top:0.5rem;width:100%">Use a different email</button>
  </div>

  <p id="loginerr" class="err"></p>

  <details style="margin-top:0.5rem">
    <summary class="muted" style="cursor:pointer;font-size:0.82rem">Trouble with email? Use the admin key</summary>
    <input id="key" type="password" placeholder="Admin key" autocomplete="current-password" style="margin-top:0.6rem">
    <button class="btn" id="signinkey" style="margin-top:0.5rem;width:100%">Sign in with key</button>
  </details>
</div>

<div id="app" class="hidden">
  <header>
    <div class="brand"><h1>COhere member portal</h1><span id="dbnote">loading</span></div>
    <div class="row">
      <span class="muted" id="whoami"></span>
      <button class="btn" id="refresh">Refresh</button>
      <button class="btn" id="signout">Sign out</button>
    </div>
  </header>

  <div class="wrap">
    <div class="stats" id="stats"></div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" aria-selected="true" data-tab="people">People</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="forms">Forms</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="admins">Who can sign in</button>
    </div>

    <section id="tab-people" style="display:flex;flex-direction:column;gap:1rem;">
      <div class="toolbar">
        <input type="search" id="q" placeholder="Search name, email, org, or any answer…">
        <button class="chip" data-filter="all" aria-pressed="true">Everyone</button>
        <button class="chip" data-filter="register-2025" aria-pressed="false">Registered 2025</button>
        <button class="chip" data-filter="signup-2026" aria-pressed="false">2026 list</button>
        <button class="chip" data-filter="host" aria-pressed="false">Offered to host</button>
        <button class="chip" data-filter="unsubscribed" aria-pressed="false">Unsubscribed</button>
        <button class="btn" id="exportall">Export CSV</button>
      </div>
      <div class="muted" id="count"></div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Organizations</th>
            <th>Forms</th><th>Tags</th><th>Email list</th><th>Joined</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>

    <section id="tab-forms" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        Questions live in the database, not in code. Edit the JSON below and save to change a form —
        no deploy required. Each field takes <code>key</code>, <code>label</code>, optional
        <code>help</code>, a <code>type</code> of text / textarea / email / tel / radio / checkboxes,
        and <code>options</code> for the choice types.
      </p>
      <div id="forms"></div>
    </section>

    <section id="tab-admins" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        Anyone listed here can sign in with their email — no password, no account to create.
        They get a one-time code and a magic link, both good for ten minutes.
      </p>
      <div class="toolbar">
        <input type="email" id="newadmin" placeholder="their@email.com"
               style="flex:1 1 14rem;padding:0.45rem 0.7rem;border:1px solid var(--hair-strong);border-radius:3px;background:var(--surface)">
        <input type="text" id="newadminname" placeholder="Name (optional)"
               style="flex:1 1 10rem;padding:0.45rem 0.7rem;border:1px solid var(--hair-strong);border-radius:3px;background:var(--surface)">
        <button class="btn primary" id="addadmin">Add</button>
        <span class="muted" id="adminmsg"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Email</th><th>Name</th><th>Added by</th><th>Since</th><th></th></tr></thead>
          <tbody id="adminrows"></tbody>
        </table>
      </div>
    </section>
  </div>
</div>

<div class="drawer-bg" id="drawerbg"></div>
<aside class="drawer" id="drawer"></aside>

<script>
(function () {
  var KEY_STORE = "cohere_admin_key";
  var people = [], forms = [], filter = "all", query = "";

  function key() { return sessionStorage.getItem(KEY_STORE) || ""; }
  function el(id) { return document.getElementById(id); }
  function show(id, visible) { el(id).classList.toggle("hidden", !visible); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // The session lives in an HttpOnly cookie; the bearer key is only used when
  // someone falls back to it, so it is attached only when present.
  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (key()) options.headers.Authorization = "Bearer " + key();
    return fetch(path, options).then(function (r) {
      if (r.status === 401) { signOut("Your session has ended. Please sign in again."); throw new Error("unauthorized"); }
      if (!r.ok) throw new Error("request failed: " + r.status);
      return r;
    });
  }

  function signOut(message) {
    sessionStorage.removeItem(KEY_STORE);
    el("app").classList.add("hidden");
    el("login").classList.remove("hidden");
    show("step-email", true);
    show("step-code", false);
    el("loginerr").textContent = message || "";
  }

  function requestCode() {
    var email = el("email").value.trim();
    if (!email) return;
    el("loginerr").textContent = "";
    el("sendlink").disabled = true;
    el("sendlink").textContent = "Sending…";
    fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || "could not send");
        el("sentto").textContent = email;
        show("step-email", false);
        show("step-code", true);
        el("code").focus();
      });
    }).catch(function (e) {
      el("loginerr").textContent = e.message;
    }).then(function () {
      el("sendlink").disabled = false;
      el("sendlink").textContent = "Email me a code";
    });
  }

  function verifyTypedCode() {
    var email = el("email").value.trim();
    var code = el("code").value.trim();
    if (code.length < 6) return;
    el("loginerr").textContent = "";
    fetch("/api/auth/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, code: code })
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || "could not verify");
        load();
      });
    }).catch(function (e) { el("loginerr").textContent = e.message; });
  }

  function signInWithKey() {
    var value = el("key").value.trim();
    if (!value) return;
    sessionStorage.setItem(KEY_STORE, value);
    el("loginerr").textContent = "";
    load();
  }

  function load() {
    return Promise.all([
      api("/api/admin/people").then(function (r) { return r.json(); }),
      api("/api/admin/forms").then(function (r) { return r.json(); })
    ]).then(function (results) {
      people = results[0].people;
      forms = results[1].forms;
      el("login").classList.add("hidden");
      el("app").classList.remove("hidden");
      el("key").value = "";
      el("code").value = "";
      renderStats(); renderForms(); render();
      fetch("/api/auth/me", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (me) {
          if (me) el("whoami").textContent = "Signed in as " + (me.name || me.email);
        })
        .catch(function () { /* signed in with the key, no session to describe */ });
    }).catch(function (e) {
      if (e.message !== "unauthorized") el("loginerr").textContent = e.message;
    });
  }

  function submissionOf(person, slug) {
    for (var i = 0; i < person.submissions.length; i++) {
      if (person.submissions[i].form_slug === slug) return person.submissions[i];
    }
    return null;
  }

  function wantsToHost(person) {
    var s = submissionOf(person, "register-2025");
    if (!s) return false;
    var interests = s.data.co_creating_interests || [];
    return interests.join(" ").toLowerCase().indexOf("host") !== -1;
  }

  function renderStats() {
    var subscribed = people.filter(function (p) { return p.subscribed; }).length;
    var reg2025 = people.filter(function (p) { return submissionOf(p, "register-2025"); }).length;
    var sig2026 = people.filter(function (p) { return submissionOf(p, "signup-2026"); }).length;
    var hosts = people.filter(wantsToHost).length;
    var tiles = [
      [people.length, "people"],
      [subscribed, "on the email list"],
      [reg2025, "registered in 2025"],
      [sig2026, "on the 2026 list"],
      [hosts, "offered to host"]
    ];
    el("stats").innerHTML = tiles.map(function (t) {
      return '<div class="stat"><span class="n">' + t[0] + '</span><span class="k">' + t[1] + "</span></div>";
    }).join("");
    el("dbnote").textContent = people.length + " people · " + forms.length + " forms";
  }

  function matches(person) {
    if (filter === "register-2025" && !submissionOf(person, "register-2025")) return false;
    if (filter === "signup-2026" && !submissionOf(person, "signup-2026")) return false;
    if (filter === "host" && !wantsToHost(person)) return false;
    if (filter === "unsubscribed" && person.subscribed) return false;
    if (!query) return true;
    var hay = [person.name, person.email, person.orgs, person.tags, person.internal_notes]
      .concat(person.submissions.map(function (s) { return JSON.stringify(s.data); }))
      .join(" ").toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function render() {
    var shown = people.filter(matches);
    el("count").textContent = shown.length + " of " + people.length + " people";
    el("rows").innerHTML = shown.map(function (p, i) {
      var slugs = p.submissions.map(function (s) {
        return '<span class="pill">' + esc(s.form_slug) + "</span>";
      }).join(" ");
      return '<tr data-email="' + esc(p.email) + '">' +
        "<td>" + esc(p.name || "—") + "</td>" +
        "<td>" + esc(p.email) + "</td>" +
        "<td>" + esc(p.phone || "") + "</td>" +
        '<td class="wrapcell">' + esc(p.orgs || "") + "</td>" +
        "<td>" + slugs + "</td>" +
        "<td>" + esc(p.tags || "") + "</td>" +
        "<td>" + (p.subscribed
          ? '<span class="pill on">subscribed</span>'
          : '<span class="pill off">opted out</span>') + "</td>" +
        "<td>" + esc((p.created_at || "").slice(0, 10)) + "</td>" +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call(el("rows").querySelectorAll("tr"), function (tr) {
      tr.addEventListener("click", function () { openDrawer(tr.getAttribute("data-email")); });
    });
  }

  function fieldLabel(slug, fieldKey) {
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].slug !== slug) continue;
      var fields = forms[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        if (fields[j].key === fieldKey) return fields[j].label;
      }
    }
    return fieldKey;
  }

  function openDrawer(email) {
    var person = people.filter(function (p) { return p.email === email; })[0];
    if (!person) return;

    var subs = person.submissions.map(function (s) {
      var answers = Object.keys(s.data).map(function (k) {
        var v = s.data[k];
        if (Array.isArray(v)) v = v.length ? v.join(" · ") : "—";
        if (v === "" || v === null || v === undefined) v = "—";
        return '<div class="answer"><b>' + esc(fieldLabel(s.form_slug, k)) + "</b>" + esc(v) + "</div>";
      }).join("");
      return '<div class="sub"><div class="label">' + esc(s.form_slug) +
        " · " + esc((s.created_at || "").slice(0, 10)) + "</div>" + answers + "</div>";
    }).join("");

    el("drawer").innerHTML =
      '<div class="row" style="justify-content:space-between">' +
        "<h2>" + esc(person.name || person.email) + "</h2>" +
        '<button class="btn" id="closedrawer">Close</button>' +
      "</div>" +
      '<dl class="kv">' +
        "<dt>Email</dt><dd>" + esc(person.email) + "</dd>" +
        "<dt>Phone</dt><dd>" + esc(person.phone || "—") + "</dd>" +
        "<dt>Orgs</dt><dd>" + esc(person.orgs || "—") + "</dd>" +
        "<dt>Source</dt><dd>" + esc(person.source || "—") + "</dd>" +
        "<dt>Joined</dt><dd>" + esc((person.created_at || "").slice(0, 10)) + "</dd>" +
      "</dl>" +
      subs +
      '<div class="sub">' +
        '<div class="label">Organizer notes</div>' +
        '<label class="muted" for="tags">Tags (comma separated)</label>' +
        '<input type="text" id="tags" value="' + esc(person.tags || "") + '">' +
        '<label class="muted" for="notes">Internal notes</label>' +
        '<textarea id="notes" rows="3">' + esc(person.internal_notes || "") + "</textarea>" +
        '<label class="row"><input type="checkbox" id="subbed"' + (person.subscribed ? " checked" : "") +
          "> On the email list</label>" +
        '<div class="row"><button class="btn primary" id="save">Save</button>' +
        '<span class="muted" id="savemsg"></span></div>' +
      "</div>";

    el("drawer").classList.add("open");
    el("drawerbg").classList.add("open");
    el("closedrawer").addEventListener("click", closeDrawer);
    el("save").addEventListener("click", function () {
      api("/api/admin/people/" + encodeURIComponent(person.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: el("tags").value,
          internal_notes: el("notes").value,
          subscribed: el("subbed").checked
        })
      }).then(function () {
        el("savemsg").textContent = "Saved";
        person.tags = el("tags").value;
        person.internal_notes = el("notes").value;
        person.subscribed = el("subbed").checked ? 1 : 0;
        render(); renderStats();
      }).catch(function (e) { el("savemsg").textContent = e.message; });
    });
  }

  function closeDrawer() {
    el("drawer").classList.remove("open");
    el("drawerbg").classList.remove("open");
  }

  function loadAdmins() {
    return api("/api/admin/admins").then(function (r) { return r.json(); }).then(function (data) {
      el("adminrows").innerHTML = data.admins.map(function (a) {
        return "<tr>" +
          "<td>" + esc(a.email) + "</td>" +
          "<td>" + esc(a.name || "—") + "</td>" +
          "<td>" + esc(a.added_by || "—") + "</td>" +
          "<td>" + esc((a.created_at || "").slice(0, 10)) + "</td>" +
          '<td><button class="btn" data-remove="' + esc(a.email) + '">Remove</button></td>' +
          "</tr>";
      }).join("");
      Array.prototype.forEach.call(el("adminrows").querySelectorAll("[data-remove]"), function (btn) {
        btn.addEventListener("click", function () {
          var email = btn.getAttribute("data-remove");
          if (!confirm("Remove " + email + "'s access to this portal?")) return;
          api("/api/admin/admins/" + encodeURIComponent(email), { method: "DELETE" })
            .then(loadAdmins)
            .catch(function (e) { el("adminmsg").textContent = e.message; });
        });
      });
    });
  }

  function renderForms() {
    el("forms").innerHTML = forms.map(function (f, i) {
      return '<div class="form-card">' +
        '<div class="row" style="justify-content:space-between">' +
          "<strong>" + esc(f.title) + "</strong>" +
          '<span class="pill ' + (f.active ? "on" : "") + '">' +
            esc(f.slug) + " · " + f.submission_count + " responses" +
            (f.active ? " · open" : " · closed") + "</span>" +
        "</div>" +
        '<textarea data-form="' + esc(f.slug) + '">' + esc(JSON.stringify(f.fields, null, 2)) + "</textarea>" +
        '<div class="row">' +
          '<button class="btn primary" data-save="' + esc(f.slug) + '">Save questions</button>' +
          '<button class="btn" data-export="' + esc(f.slug) + '">Export responses CSV</button>' +
          '<span class="muted" data-msg="' + esc(f.slug) + '"></span>' +
        "</div>" +
      "</div>";
    }).join("");

    Array.prototype.forEach.call(el("forms").querySelectorAll("[data-save]"), function (btn) {
      btn.addEventListener("click", function () {
        var slug = btn.getAttribute("data-save");
        var form = forms.filter(function (f) { return f.slug === slug; })[0];
        var box = el("forms").querySelector('[data-form="' + slug + '"]');
        var msg = el("forms").querySelector('[data-msg="' + slug + '"]');
        var fields;
        try { fields = JSON.parse(box.value); }
        catch (e) { msg.textContent = "That is not valid JSON"; return; }
        api("/api/admin/forms/" + encodeURIComponent(slug), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, event: form.event, active: !!form.active, fields: fields })
        }).then(function () { msg.textContent = "Saved"; form.fields = fields; })
          .catch(function (e) { msg.textContent = e.message; });
      });
    });

    Array.prototype.forEach.call(el("forms").querySelectorAll("[data-export]"), function (btn) {
      btn.addEventListener("click", function () {
        downloadCsv("/api/admin/export.csv?form=" + encodeURIComponent(btn.getAttribute("data-export")));
      });
    });
  }

  function downloadCsv(path) {
    api(path).then(function (r) { return r.blob(); }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = path.indexOf("form=") === -1 ? "cohere-people.csv" : "cohere-" + path.split("form=")[1] + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  }

  el("sendlink").addEventListener("click", requestCode);
  el("email").addEventListener("keydown", function (e) { if (e.key === "Enter") requestCode(); });
  el("verify").addEventListener("click", verifyTypedCode);
  el("code").addEventListener("keydown", function (e) { if (e.key === "Enter") verifyTypedCode(); });
  el("startover").addEventListener("click", function () {
    show("step-code", false); show("step-email", true); el("loginerr").textContent = "";
  });
  el("signinkey").addEventListener("click", signInWithKey);
  el("key").addEventListener("keydown", function (e) { if (e.key === "Enter") signInWithKey(); });
  el("signout").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(function () { signOut(""); });
  });
  el("refresh").addEventListener("click", load);
  el("drawerbg").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  el("q").addEventListener("input", function (e) { query = e.target.value.trim().toLowerCase(); render(); });
  el("exportall").addEventListener("click", function () { downloadCsv("/api/admin/export.csv"); });

  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
    chip.addEventListener("click", function () {
      filter = chip.getAttribute("data-filter");
      Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      render();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
        t.setAttribute("aria-selected", String(t === tab));
      });
      ["people", "forms", "admins"].forEach(function (n) {
        var section = el("tab-" + n);
        section.classList.toggle("hidden", n !== name);
        section.style.display = n === name ? "flex" : "none";
      });
      if (name === "admins") loadAdmins();
    });
  });

  el("addadmin").addEventListener("click", function () {
    var email = el("newadmin").value.trim();
    if (!email) return;
    el("adminmsg").textContent = "";
    api("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, name: el("newadminname").value.trim() })
    }).then(function () {
      el("newadmin").value = ""; el("newadminname").value = "";
      return loadAdmins();
    }).catch(function (e) { el("adminmsg").textContent = e.message; });
  });

  // A magic-link callback lands here already carrying a session cookie.
  if (new URLSearchParams(location.search).get("error") === "expired") {
    el("loginerr").textContent = "That sign-in link has expired. Request a new one.";
  }
  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) {
    if (r.ok) load();
    else if (key()) load();
  }).catch(function () { if (key()) load(); });
})();
</script>
</body>
</html>`;
