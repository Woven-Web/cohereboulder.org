// The admin portal, served as a single self-contained page from GET /admin.
// No build step and no framework: it fetches the admin API with the key the
// organizer types in, held in sessionStorage for the tab's lifetime only.

import { BRAND_TOKEN_CSS } from "./brand-tokens.generated";

export const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="admin-login" content="__ADMIN_LOGIN_MODE__">
<link rel="icon" href="data:,">
<title>COhere — member portal</title>
<style>
  ${BRAND_TOKEN_CSS}
  /* The portal's own names, mapped onto the site's tokens (src/index.css). */
  :root {
    --ground: hsl(var(--background)); --surface: hsl(var(--card)); --surface-2: hsl(var(--muted));
    --ink: hsl(var(--foreground)); --ink-2: hsl(var(--muted-foreground)); --ink-3: hsl(var(--muted-foreground));
    --hair: hsl(var(--border) / 0.45); --hair-strong: hsl(var(--border));
    --teal: hsl(var(--primary)); --on-teal: hsl(var(--primary-foreground)); --teal-soft: hsl(var(--brand-deep) / 0.12);
    --clay: hsl(var(--brand-berry)); --clay-soft: hsl(var(--brand-berry) / 0.1);
    --r-md: calc(var(--radius) - 2px);
    --sans: ui-sans-serif, system-ui, "Avenir Next", "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 4.5rem; }
  body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--sans);
         font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  h1 { font-size: 1.15rem; margin: 0; letter-spacing: -0.02em; font-weight: 650; }
  button { font: inherit; cursor: pointer; }
  input, select, textarea { font: inherit; color: inherit; }

  /* The site header, as on every public page: logo, links back, who you are. */
  .site-nav { position: sticky; top: 0; z-index: 50; background: hsl(var(--background) / 0.95);
              backdrop-filter: blur(4px); border-bottom: 1px solid hsl(var(--border)); }
  .site-nav .bar { max-width: 80rem; margin: 0 auto; padding: 0 1rem; min-height: 4rem;
                   display: flex; flex-wrap: wrap; align-items: center; gap: 0 1rem; }
  .logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; min-height: 2.75rem; }
  .logo .mark { display: block; width: 3rem; height: 2.5rem; overflow: hidden; }
  .logo img { display: block; width: 3rem; max-width: none; }
  .logo .word { display: none; font-size: 1.25rem; font-weight: 700; color: var(--teal); }
  .site-links { display: flex; align-items: center; gap: 0 1.1rem; }
  .site-links a { white-space: nowrap; display: flex; align-items: center; min-height: 2.75rem; color: var(--ink-2);
                  font-weight: 500; text-decoration: none; border-bottom: 2px solid transparent; }
  .site-links a:hover { color: var(--ink); }
  .site-links a[aria-current="page"] { color: var(--teal); border-bottom-color: var(--teal); }
  .site-right { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  #whoami { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 16rem; font-size: 0.85rem; }
  .portal-bar { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between;
                max-width: 84rem; margin: 0 auto; padding: 1.25rem 1.25rem 0; }
  .portal-bar .brand { display: flex; align-items: baseline; gap: 0.6rem; }
  .portal-bar .brand span { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.12em;
                            text-transform: uppercase; color: var(--teal); }
  @media (min-width: 900px) { .logo .word { display: inline; } }
  @media (max-width: 640px) {
    .site-links { order: 3; flex-basis: 100%; overflow-x: auto; gap: 0 0.9rem; }
    #whoami { max-width: 9rem; }
  }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 2.5rem; background: var(--surface);
         color: var(--ink); border: 1px solid var(--hair-strong); border-radius: var(--r-md);
         padding: 0.4rem 0.9rem; font-size: 0.875rem; font-weight: 500; text-decoration: none; }
  .btn:hover { border-color: var(--teal); color: var(--teal); }
  .btn.primary { background: var(--teal); border-color: var(--teal); color: var(--on-teal); }
  .btn.primary:hover { opacity: 0.9; color: var(--on-teal); }
  a { color: var(--teal); }

  .wrap { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem; max-width: 84rem; margin: 0 auto; }

  /* login */
  .login { border-radius: var(--radius); max-width: 25rem; margin: 5rem auto; background: var(--surface); border: 1px solid var(--hair);
           padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .login input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--hair-strong);
                 border-radius: var(--r-md); background: var(--ground); }
  .login p { margin: 0; color: var(--ink-3); font-size: 0.85rem; }

  .stats { border-radius: var(--radius); overflow: hidden; display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 0;
           background: var(--surface); border: 1px solid var(--hair); }
  .stat { background: var(--surface); box-shadow: 0 0 0 0.5px var(--hair); padding: 0.85rem 1rem; }
  .stat .n { font-family: var(--mono); font-size: 1.5rem; font-variant-numeric: tabular-nums;
             letter-spacing: -0.03em; display: block; }
  .stat .k { font-size: 0.75rem; color: var(--ink-3); }

  .tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid var(--hair); overflow-x: auto; }
  .tab { flex-shrink: 0; white-space: nowrap; min-height: 2.75rem; background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.5rem 0.75rem;
         color: var(--ink-3); font-size: 0.9rem; }
  .tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--teal); font-weight: 600; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
  .toolbar input[type="search"] { flex: 1 1 16rem; padding: 0.45rem 0.7rem; border: 1px solid var(--hair-strong);
                                  border-radius: var(--r-md); background: var(--surface); }
  .chip { background: var(--surface); border: 1px solid var(--hair-strong); border-radius: 999px;
          padding: 0.25rem 0.7rem; font-size: 0.8rem; color: var(--ink-2); }
  .chip[aria-pressed="true"] { background: var(--teal-soft); border-color: var(--teal); color: var(--teal); font-weight: 600; }

  .table-scroll { border-radius: var(--radius); overflow-x: auto; border: 1px solid var(--hair); background: var(--surface); }
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
  .needs { display: block; margin-top: 0.2rem; font-size: 0.78rem; color: var(--clay); }

  /* detail drawer */
  .drawer-bg { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,0.35); display: none; }
  .drawer-bg.open { display: block; }
  .drawer { z-index: 61; position: fixed; top: 0; right: 0; bottom: 0; width: min(34rem, 100%); background: var(--surface);
            border-left: 1px solid var(--hair); overflow-y: auto; padding: 1.25rem; display: none;
            flex-direction: column; gap: 1rem; }
  .drawer.open { display: flex; }
  .drawer h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.02em; }
  .kv { display: grid; grid-template-columns: 8rem 1fr; gap: 0.3rem 0.8rem; font-size: 0.88rem; }
  .kv dt { color: var(--ink-3); font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em;
           text-transform: uppercase; padding-top: 0.15rem; }
  .kv dd { margin: 0; overflow-wrap: anywhere; }
  .sub { border-radius: var(--radius); border: 1px solid var(--hair); padding: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .sub .label { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase;
                color: var(--teal); }
  .answer { font-size: 0.88rem; }
  .answer b { display: block; color: var(--ink-3); font-weight: 500; font-size: 0.78rem; }
  .drawer textarea, .drawer input[type="text"] { width: 100%; padding: 0.4rem 0.55rem; border: 1px solid var(--hair-strong);
            border-radius: var(--r-md); background: var(--ground); }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

  .form-card { border-radius: var(--radius); border: 1px solid var(--hair); background: var(--surface); padding: 1rem;
               display: flex; flex-direction: column; gap: 0.7rem; }
  .form-card textarea { width: 100%; min-height: 14rem; font-family: var(--mono); font-size: 0.78rem;
                        padding: 0.6rem; border: 1px solid var(--hair-strong); border-radius: var(--r-md); background: var(--ground); }
  .muted { color: var(--ink-3); font-size: 0.85rem; }
  .err { color: var(--clay); font-size: 0.85rem; }
  /* event + access forms */
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  .field > label { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.08em;
                   text-transform: uppercase; color: var(--ink-3); }
  .field input, .field select, .field textarea { width: 100%; padding: 0.4rem 0.55rem;
            border: 1px solid var(--hair-strong); border-radius: var(--r-md); background: var(--ground); }
  .field input:disabled, .field select:disabled { opacity: 0.55; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .toolbar select, .toolbar input[type="email"] { padding: 0.45rem 0.7rem;
            border: 1px solid var(--hair-strong); border-radius: var(--r-md); background: var(--surface); }
  .note { font-size: 0.8rem; color: var(--ink-3); border-left: 2px solid var(--hair-strong);
          padding-left: 0.6rem; }
  .guests { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  td select { padding: 0.3rem 0.5rem; border: 1px solid var(--hair-strong);
              border-radius: var(--r-md); background: var(--ground); font-size: 0.85rem; }
  .nl-edit { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; align-items: start; }
  .nl-edit .nl-pane { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
  .nl-edit textarea { min-height: 28rem; font-family: var(--mono); font-size: 0.82rem; }
  .nl-edit iframe { width: 100%; height: 28rem; border: 1px solid var(--hair); background: var(--surface); }
  .nl-tools { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .nl-tools .btn { padding: 0.25rem 0.6rem; min-width: 2.2rem; }
  .nl-toggle { display: none; gap: 0.4rem; }
  .nl-terms { display: grid; grid-template-columns: 1fr auto; gap: 0.3rem 0.8rem; align-items: center;
              max-height: 14rem; overflow-y: auto; border: 1px solid var(--hair); padding: 0.5rem; }
  .nl-terms select { width: auto; }
  .nl-recips { font-size: 0.85rem; }
  .nl-recips ul { margin: 0.4rem 0 0; padding-left: 1.1rem; columns: 2; }
  .bulkbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; padding: 0.5rem 0.7rem;
             border: 1px solid var(--teal); background: var(--teal-soft); }
  .bulkbar input[type="text"] { padding: 0.35rem 0.55rem; border: 1px solid var(--hair-strong);
                                border-radius: var(--r-md); background: var(--surface); }
  th.sel, td.sel { width: 1.6rem; }
  @media (max-width: 860px) {
    .nl-edit { grid-template-columns: 1fr; }
    .nl-toggle { display: flex; }
    .nl-edit[data-view="write"] .nl-previewpane { display: none; }
    .nl-edit[data-view="preview"] .nl-writepane { display: none; }
    .nl-edit textarea, .nl-edit iframe { height: 22rem; min-height: 22rem; }
    .nl-recips ul { columns: 1; }
  }
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

</div>

<div id="app" class="hidden">
  <nav class="site-nav">
    <div class="bar">
      <a class="logo" href="/" aria-label="[CO]here">
        <span class="mark"><img src="/COHERE-Logo-Branding-2.webp" alt="[CO]here logo"></span>
        <span class="word">[CO]here</span>
      </a>
      <div class="site-links">
        <a href="/">Home</a>
        <a href="/calendar">Calendar</a>
        <a href="/co-create">Co-create</a>
        <a href="/archive">Archive</a>
        <a href="/admin" aria-current="page">Organizer</a>
      </div>
      <div class="site-right">
        <span class="muted" id="whoami"></span>
        <button class="btn" id="signout">Sign out</button>
      </div>
    </div>
  </nav>
  <div class="portal-bar">
    <div class="brand"><h1>COhere member portal</h1><span id="dbnote">loading</span></div>
    <div class="row">
      <a class="btn" href="/admin/checkin" id="checkinlink">Door check-in</a>
      <button class="btn" id="refresh">Refresh</button>
    </div>
  </div>

  <div class="wrap">
    <div class="stats" id="stats"></div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" aria-selected="true" data-tab="people">People</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="events">Events</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="proposals">Proposals<span class="pill" id="proposalbadge" style="margin-left:0.35rem"></span></button>
      <button class="tab" role="tab" aria-selected="false" data-tab="forms">Forms</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="newsletter">Newsletter</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="access">Access</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="admins">Organizers</button>
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
      <div class="bulkbar hidden" id="bulkbar" data-testid="bulk-tags">
        <b id="bulkcount"></b>
        <input type="text" id="bulktag" placeholder="tag, e.g. came-before" maxlength="64" aria-label="Tag to add or remove" list="bulktaglist">
        <datalist id="bulktaglist"></datalist>
        <button class="btn primary" id="bulkadd">Add tag</button>
        <button class="btn" id="bulkremove">Remove tag</button>
        <button class="btn" id="bulkclear">Clear selection</button>
        <span class="muted" id="bulkmsg" role="status"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th class="sel"><input type="checkbox" id="selall" aria-label="Select everyone shown"></th><th>Name</th><th>Email</th><th>Phone</th><th>Organizations</th>
            <th>Forms</th><th>Tags</th><th>Email list</th><th>Joined</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>

    <section id="tab-events" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        The COhere community calendar. It lives on the regenOS commons and is published by
        <a href="/calendar" target="_blank" rel="noopener">the public calendar page</a> —
        anything added here shows up there within a few minutes.
      </p>
      <div class="toolbar">
        <button class="btn primary" id="newevent">New event</button>
        <button class="chip" data-when="upcoming" aria-pressed="true">Upcoming</button>
        <button class="chip" data-when="past" aria-pressed="false">Past</button>
        <button class="chip" data-when="incomplete" aria-pressed="false" id="incompletechip">Needs details</button>
        <span class="muted" id="eventmsg"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>When (Boulder)</th><th>Name</th><th>Where</th><th>RSVPs</th><th>Capacity</th>
          </tr></thead>
          <tbody id="eventrows"></tbody>
        </table>
      </div>
    </section>

    <section id="tab-proposals" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        Anyone can propose an event from <a href="/propose" target="_blank" rel="noopener">the public form</a> —
        no account needed. Approving publishes it to the calendar the same way "New event" on the
        Events tab does.
      </p>
      <div class="toolbar">
        <button class="chip" data-pstatus="pending" aria-pressed="true">Pending</button>
        <button class="chip" data-pstatus="published" aria-pressed="false">Published</button>
        <button class="chip" data-pstatus="rejected" aria-pressed="false">Rejected</button>
        <span class="muted" id="proposalmsg"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>When (Boulder)</th><th>Name</th><th>Proposed by</th><th>Where</th><th></th>
          </tr></thead>
          <tbody id="proposalrows"></tbody>
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

    <section id="tab-access" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        Builders and up can add and edit events on the calendar; stewards can also manage access.
        Invite someone by email and regenOS sends them a link to join — they appear here once they accept.
      </p>
      <div class="toolbar">
        <input type="email" id="inviteemail" placeholder="their@email.com"
               style="flex:1 1 14rem;padding:0.45rem 0.7rem;border:1px solid var(--hair-strong);border-radius:3px;background:var(--surface)">
        <select id="inviterole">
          <option value="builder">Builder — can add and edit events</option>
          <option value="facilitator">Facilitator</option>
          <option value="steward">Steward — can also manage access</option>
        </select>
        <button class="btn primary" id="sendinvite">Send invite</button>
        <span class="muted" id="accessmsg"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Who</th><th>Role</th><th></th></tr></thead>
          <tbody id="accessrows"></tbody>
        </table>
      </div>
    </section>

    <section id="tab-newsletter" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted">
        Email the list from here. Sending unlocks only after you send yourself a test of the exact
        version, you type the recipient count to confirm, and then it waits 15 minutes — every
        organizer gets an email with a cancel link. Unsubscribed people and anyone tagged
        <code>undeliverable</code> are always left out. Hard bounces get that tag automatically, and
        anyone who marks a newsletter as spam is unsubscribed — both leave a dated line in their notes.
      </p>
      <div class="toolbar">
        <button class="btn primary" id="nlnew">New newsletter</button>
        <span class="muted" id="nllistmsg"></span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Subject</th><th>Audience</th><th>Status</th><th>Sent</th><th title="Reported back by Resend's webhook">Delivery</th><th>By</th><th>Updated</th></tr></thead>
          <tbody id="nlrows"></tbody>
        </table>
      </div>

      <div class="form-card hidden" id="nleditor" data-testid="nl-editor">
        <div class="row" style="justify-content:space-between">
          <strong id="nltitle">New newsletter</strong>
          <span class="pill" id="nlstatus"></span>
        </div>
        <div class="field"><label for="nlsubject">Subject</label><input type="text" id="nlsubject" maxlength="200"></div>
        <div class="field">
          <label for="nlaudience">Audience</label>
          <div class="row">
            <select id="nlaudience"></select>
            <button class="btn" id="nlpreset" type="button">Came in 2024 or 2025, not registered for 2026</button>
          </div>
          <div class="field hidden" id="nlsegment" data-testid="nl-segment">
            <span class="muted">For each form or tag choose <b>Include</b> (anyone matching any included item) or
              <b>Exclude</b> (drop anyone matching an excluded item). Nothing included means everyone subscribed.</span>
            <div class="nl-terms" id="nlterms"></div>
          </div>
          <span class="muted" id="nlcount" data-testid="nl-count"></span>
          <details class="nl-recips" id="nlrecips">
            <summary>Who gets it (first 20)</summary>
            <ul id="nlrecipslist"></ul>
            <button class="btn" id="nlcsv" type="button">Download full list (CSV)</button>
          </details>
        </div>
        <div class="field">
          <label for="nlbody">Body</label>
          <div class="nl-toggle" id="nltoggle">
            <button class="chip" type="button" data-nlview="write" aria-pressed="true">Write</button>
            <button class="chip" type="button" data-nlview="preview" aria-pressed="false">Preview</button>
          </div>
          <div class="nl-edit" id="nledit" data-view="write">
            <div class="nl-pane nl-writepane">
              <div class="nl-tools" id="nltools" role="toolbar" aria-label="Formatting">
                <button class="btn" type="button" data-md="bold" title="Bold"><b>B</b></button>
                <button class="btn" type="button" data-md="italic" title="Italic"><i>I</i></button>
                <button class="btn" type="button" data-md="link" title="Link">Link</button>
                <button class="btn" type="button" data-md="heading" title="Heading">H</button>
                <button class="btn" type="button" data-md="list" title="List">&bull; List</button>
                <button class="btn" type="button" data-md="image" title="Image">Image</button>
                <button class="btn" type="button" data-md="button" title="Button link">Button</button>
                <button class="btn" type="button" data-md="rule" title="Horizontal rule">&mdash;</button>
              </div>
              <textarea id="nlbody" spellcheck="true"></textarea>
            </div>
            <div class="nl-pane nl-previewpane">
              <iframe id="nlframe" title="Newsletter preview" sandbox=""></iframe>
            </div>
          </div>
          <details class="muted" data-testid="nl-syntax">
            <summary>Formatting help</summary>
            <p style="margin:0.4rem 0">Blank line = new paragraph. A single line break stays a line break.</p>
            <ul style="margin:0;padding-left:1.1rem;line-height:1.6">
              <li><code>## Heading</code></li>
              <li><code>**bold**</code> &middot; <code>*italic*</code></li>
              <li><code>[link text](https://…)</code> &mdash; http, https or mailto only</li>
              <li><code>- list item</code> (one per line, no blank lines between)</li>
              <li><code>![description](https://…/photo.jpg)</code> alone on its line (https images only)</li>
              <li><code>[[Register now]](https://…)</code> alone on its line &rarr; a button</li>
              <li><code>---</code> alone on its line &rarr; a horizontal rule</li>
            </ul>
            <p style="margin:0.4rem 0">The preview is the server's own renderer, so it is exactly what is sent. Each email gets the person's own unsubscribe link at the bottom.</p>
          </details>
        </div>
        <div class="row">
          <button class="btn" id="nlsave">Save draft</button>
          <button class="btn" id="nltest">Send me a test</button>
          <button class="btn primary" id="nlsend" disabled>Send…</button>
          <button class="btn hidden" id="nlcancel">Cancel send</button>
          <button class="btn hidden" id="nlreopen">Reopen as draft</button>
          <button class="btn hidden" id="nldelete">Delete draft</button>
        </div>
        <p class="note" id="nllock"></p>
        <p class="err" id="nlmsg" role="status"></p>
        <div class="sub hidden" id="nlconfirm" data-testid="nl-confirm">
          <span class="label">Confirm send</span>
          <p style="margin:0">This emails <b id="nlconfirmcount"></b> people (<span id="nlconfirmaud"></span>).
            It goes out 15 minutes after you confirm; every organizer is emailed a cancel link.</p>
          <div class="field"><label for="nlconfirminput">Type the number of recipients to confirm</label>
            <input type="text" inputmode="numeric" id="nlconfirminput" autocomplete="off"></div>
          <div class="row">
            <button class="btn primary" id="nlconfirmgo">Confirm and schedule</button>
            <button class="btn" id="nlconfirmback">Back</button>
          </div>
        </div>
      </div>

      <div class="form-card" data-testid="nl-import">
        <strong>Import subscribers from Beehiiv</strong>
        <p class="muted" style="margin:0">Upload Beehiiv's subscriber export (CSV). Matched by email: new people are
          added tagged <code>beehiiv</code> plus their Beehiiv tags; people already here get the tag. Unsubscribes win
          both ways — nobody unsubscribed here is ever re-subscribed. Preview first, then apply.</p>
        <div class="row">
          <input type="file" id="bhfile" accept=".csv,text/csv">
          <button class="btn" id="bhpreview">Preview import</button>
          <button class="btn primary" id="bhapply" disabled>Apply import</button>
        </div>
        <div id="bhresult" class="muted" role="status"></div>
      </div>
    </section>

    <section id="tab-admins" class="hidden" style="flex-direction:column;gap:1rem;">
      <p class="muted" id="admins-info-regenos">
        This portal opens with your regenOS account. Anyone who is a <b>builder</b>, <b>facilitator</b>
        or <b>steward</b> of the COhere scene can get in; only stewards can change who. Roles are managed
        in the <b>Access</b> tab.
      </p>
      <p class="muted hidden" id="admins-info-email">
        Rollback mode: anyone listed here can also sign in with their email — a one-time code and a magic
        link, both good for ten minutes.
      </p>
      <h3 style="margin:0">Organizer notification emails</h3>
      <p class="muted" style="margin:0">
        These addresses are emailed whenever a newsletter is confirmed, with a link to cancel it.
        Being listed here does not give anyone portal access.
      </p>
      <div class="toolbar" id="adminadd">
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
  var people = [], forms = [], filter = "all", query = "", selected = {};
  var events = [], eventWhen = "upcoming", rsvpCache = {}, emailRsvpCounts = {}, accessMembers = [];
  var proposals = [], proposalStatus = "pending";

  var LOGIN_MODE = (document.querySelector('meta[name="admin-login"]') || {}).content === "email" ? "email" : "regenos";
  var ME = null;
  function canManage() { return !ME || ME.canManageAccess; }
  function el(id) { return document.getElementById(id); }
  function show(id, visible) { el(id).classList.toggle("hidden", !visible); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Auth is the HttpOnly session cookie set by the emailed link or code.
  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    return fetch(path, options).then(function (r) {
      if (r.status === 401) { signOut("Your session has ended. Please sign in again."); throw new Error("unauthorized"); }
      if (!r.ok) {
        // The regenOS lane answers with a sentence an organizer can act on
        // ("only a Builder of the collective may…"). Losing it to
        // "request failed: 400" would make every upstream refusal look the same.
        return r.json().then(function (body) {
          var message = body.message || body.error || "request failed: " + r.status;
          // The site's own regenOS access was refused (siteAccess): the
          // plain sentence leads, upstream's wording follows as a detail.
          if (body.siteAccess && body.detail) message += " (regenOS said: " + body.detail + ")";
          throw new Error(message);
        }, function () {
          throw new Error("request failed: " + r.status);
        });
      }
      return r;
    });
  }

  function signOut(message) {
    // regenOS mode has no login form here: the server sends a signed-out
    // visitor to the site's own sign-in and brings them back.
    if (LOGIN_MODE === "regenos") { window.location.assign("/admin"); return; }
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

  function load() {
    return Promise.all([
      api("/api/admin/people").then(function (r) { return r.json(); }),
      api("/api/admin/forms").then(function (r) { return r.json(); })
    ]).then(function (results) {
      people = results[0].people;
      forms = results[1].forms;
      el("login").classList.add("hidden");
      el("app").classList.remove("hidden");
      el("code").value = "";
      renderStats(); renderForms(); render();
      loadPendingProposalCount();
      fetch("/api/auth/me", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (me) {
          if (me) applyMe(me);
        })
        .catch(function () { /* signed in with the key, no session to describe */ });
    }).catch(function (e) {
      if (e.message !== "unauthorized") el("loginerr").textContent = e.message;
    });
  }

  function applyMe(me) {
    ME = me;
    el("whoami").textContent = "Signed in as " + (me.handle ? "@" + me.handle : (me.name || me.email)) + (me.role ? " (" + me.role + ")" : "");
    document.querySelector('[data-tab="access"]').classList.toggle("hidden", !me.canManageAccess);
    show("adminadd", me.canManageAccess);
    show("admins-info-email", me.source === "email");
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
        '<td class="sel"><input type="checkbox" data-sel="' + esc(p.id) + '" aria-label="Select ' + esc(p.email) + '"' +
          (selected[p.id] ? " checked" : "") + "></td>" +
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
    Array.prototype.forEach.call(el("rows").querySelectorAll("[data-sel]"), function (box) {
      box.addEventListener("click", function (ev) { ev.stopPropagation(); });
      box.addEventListener("change", function () {
        if (box.checked) selected[box.getAttribute("data-sel")] = true; else delete selected[box.getAttribute("data-sel")];
        renderBulk();
      });
    });
    el("selall").checked = shown.length > 0 && shown.every(function (p) { return selected[p.id]; });
    renderBulk();
  }

  // ---- bulk tags: select rows, add or remove one tag on all of them.
  function selectedIds() { return Object.keys(selected); }
  function renderBulk() {
    var n = selectedIds().length;
    show("bulkbar", n > 0);
    el("bulkcount").textContent = n + " selected";
    var seen = {};
    people.forEach(function (p) {
      (p.tags || "").split(",").forEach(function (t) { t = t.trim().toLowerCase(); if (t) seen[t] = true; });
    });
    el("bulktaglist").innerHTML = Object.keys(seen).sort().map(function (t) {
      return '<option value="' + esc(t) + '">';
    }).join("");
  }
  function bulkTag(kind) {
    var tag = el("bulktag").value.trim();
    var ids = selectedIds();
    if (!tag || !ids.length) { el("bulkmsg").textContent = "Pick people and type a tag."; return; }
    if (!window.confirm((kind === "add" ? "Add" : "Remove") + " tag \u201c" + tag + "\u201d " +
        (kind === "add" ? "to " : "from ") + ids.length + " people?")) return;
    var body = { ids: ids };
    body[kind] = [tag];
    el("bulkmsg").textContent = "Working…";
    api("/api/admin/people/tags", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      el("bulkmsg").textContent = "Updated " + d.updated + " people.";
      selected = {};
      nlAudiences = null;
      return load();
    }).catch(function (e) { el("bulkmsg").textContent = e.message; });
  }
  el("bulkadd").addEventListener("click", function () { bulkTag("add"); });
  el("bulkremove").addEventListener("click", function () { bulkTag("remove"); });
  el("bulkclear").addEventListener("click", function () { selected = {}; render(); });
  el("selall").addEventListener("change", function () {
    var on = el("selall").checked;
    people.filter(matches).forEach(function (p) { if (on) selected[p.id] = true; else delete selected[p.id]; });
    render();
  });

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

  // ======================================================== the Events tab

  // The organizers are in Boulder and this is a Boulder calendar, so the list
  // reads in Denver time whatever the laptop's clock is set to.
  var DENVER = { timeZone: "America/Denver", weekday: "short", month: "short",
                 day: "numeric", hour: "numeric", minute: "2-digit" };

  function whenText(iso) {
    if (!iso) return "No date yet";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "No date yet";
    try { return new Intl.DateTimeFormat("en-US", DENVER).format(d); }
    catch (err) { return String(iso).slice(0, 16).replace("T", " "); }
  }

  function whereText(ev) {
    var loc = ev.location || {};
    var bits = [];
    if (loc.name) bits.push(loc.name);
    if (loc.locality) bits.push(loc.locality);
    if (bits.length) return bits.join(", ");
    if (ev.mode === "virtual") return "Online";
    return "\u2014";
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // datetime-local <-> ISO in the BROWSER's own zone, which is exactly what a
  // datetime-local input means. The AppView 400s on a datetime with no offset.
  function isoToLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function localInputToIso(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  function eventKey(ev) { return ev.did + "|" + ev.rkey; }

  function loadEvents() {
    el("eventmsg").textContent = "Loading\u2026";
    return api("/api/admin/events").then(function (r) { return r.json(); }).then(function (data) {
      events = data.events || [];
      el("eventmsg").textContent = "";
      renderEvents();
      fillRsvpColumns();
      loadEmailRsvpCounts();
    }).catch(function (e) {
      el("eventmsg").textContent = e.message;
      el("eventrows").innerHTML =
        '<tr><td colspan="5" class="muted">Could not load the calendar.</td></tr>';
    });
  }

  function shownEvents() {
    if (eventWhen === "incomplete") {
      return events.filter(function (e) { return !e.isPast && missingOf(e).length; });
    }
    return events.filter(function (e) { return eventWhen === "past" ? e.isPast : !e.isPast; });
  }

  // What an attendee would notice is missing, from the Worker's \`missing\`
  // (worker/src/event-completeness.ts). Past events are left alone.
  var MISSING_LABEL = { venue: "venue", street: "street address", description: "description" };
  function missingOf(e) { return Array.isArray(e.missing) ? e.missing : []; }
  function needsText(e) {
    return "Needs " + missingOf(e).map(function (m) { return MISSING_LABEL[m] || m; }).join(", ");
  }

  function renderIncompleteCount() {
    var n = events.filter(function (e) { return !e.isPast && missingOf(e).length; }).length;
    el("incompletechip").textContent = n ? "Needs details (" + n + ")" : "Needs details";
  }

  function renderEvents() {
    renderIncompleteCount();
    var shown = shownEvents();
    if (!shown.length) {
      el("eventrows").innerHTML = '<tr><td colspan="5" class="muted">' +
        (eventWhen === "incomplete"
          ? "Every upcoming event has a venue, street address and description."
          : eventWhen === "past"
          ? "Nothing has happened yet."
          : "Nothing on the calendar yet \u2014 add the first event.") + "</td></tr>";
      return;
    }
    el("eventrows").innerHTML = shown.map(function (e) {
      var seats = rsvpCache[eventKey(e)];
      var known = seats && !seats.unavailable;
      var rsvps = known
        ? esc(seats.confirmed + " confirmed" + (seats.attendance === "approval" ? " \u00b7 by approval" : ""))
        : (seats ? "\u2014" : '<span class="muted">\u2026</span>');
      var emailCount = emailRsvpCounts[eventKey(e)] || 0;
      if (emailCount) rsvps += '<div class="muted">+ ' + esc(String(emailCount)) + " by email</div>";
      var cap = known
        ? esc(seats.maxAttendees ? String(seats.maxAttendees) : "no limit")
        : (seats ? "\u2014" : '<span class="muted">\u2026</span>');
      return '<tr data-ev="' + esc(eventKey(e)) + '">' +
        "<td>" + esc(whenText(e.startsAt)) + "</td>" +
        "<td>" + esc(e.name) +
          (!e.isPast && missingOf(e).length ? '<span class="needs">' + esc(needsText(e)) + "</span>" : "") +
        "</td>" +
        '<td class="wrapcell">' + esc(whereText(e)) + "</td>" +
        "<td>" + rsvps + "</td>" +
        "<td>" + cap + "</td>" +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call(el("eventrows").querySelectorAll("tr[data-ev]"), function (tr) {
      tr.addEventListener("click", function () {
        var key = tr.getAttribute("data-ev");
        var found = events.filter(function (e) { return eventKey(e) === key; })[0];
        if (found) openEventDrawer(found);
      });
    });
  }

  // Email RSVPs ("RSVP \u00b7 remind me" without an account) live in D1, one
  // call for every event's count.
  function loadEmailRsvpCounts() {
    return api("/api/admin/rsvps").then(function (r) { return r.json(); }).then(function (data) {
      emailRsvpCounts = {};
      (data.counts || []).forEach(function (c) { emailRsvpCounts[c.did + "|" + c.rkey] = c.count; });
      renderEvents();
    }).catch(function () { /* the column just shows regenOS counts */ });
  }

  function fetchRsvps(ev) {
    return api("/api/admin/events/" + encodeURIComponent(ev.did) + "/" +
               encodeURIComponent(ev.rkey) + "/attendance")
      .then(function (r) { return r.json(); })
      .then(function (seats) { rsvpCache[eventKey(ev)] = seats; return seats; });
  }

  // RSVP counts and the seat policy live in a sibling record the listing does
  // not carry, so they arrive one call per row — five at a time, so a long
  // calendar doesn't open fifty sockets at once.
  function fillRsvpColumns() {
    var queue = shownEvents().filter(function (e) { return !rsvpCache[eventKey(e)]; });
    if (!queue.length) return;
    var running = 0;
    function next() {
      if (!queue.length) { if (!running) renderEvents(); return; }
      var ev = queue.shift();
      running++;
      fetchRsvps(ev).catch(function () {
        rsvpCache[eventKey(ev)] = { unavailable: true };
      }).then(function () { running--; next(); });
    }
    for (var i = 0; i < 5; i++) next();
  }

  function openEventDrawer(ev) {
    var isNew = !ev;
    var e = ev || { did: null, rkey: null, name: "", description: "", startsAt: "", endsAt: "",
                    mode: "inperson", location: null, publicPath: null, hostName: null };
    var loc = e.location || {};
    // A create defines the seat policy; an edit may only touch it once the
    // stored one has actually been read back (see the note on the panel).
    var seatsKnown = isNew;

    function opt(value, label, current) {
      return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") +
        ">" + esc(label) + "</option>";
    }

    el("drawer").innerHTML =
      '<div class="row" style="justify-content:space-between">' +
        "<h2>" + esc(isNew ? "New event" : e.name) + "</h2>" +
        '<button class="btn" id="closedrawer">Close</button>' +
      "</div>" +
      (isNew ? "" :
        '<dl class="kv">' +
          "<dt>When</dt><dd>" + esc(whenText(e.startsAt)) +
            (e.endsAt ? " \u2192 " + esc(whenText(e.endsAt)) : "") + "</dd>" +
          "<dt>Where</dt><dd>" + esc(whereText(e)) + "</dd>" +
          "<dt>Host</dt><dd>" + esc(e.hostName || "COhere Boulder") + "</dd>" +
          '<dt>On the site</dt><dd><a href="' + esc(e.publicPath || "/calendar") +
            '" target="_blank" rel="noopener">View the public page</a></dd>' +
        "</dl>") +
      (isNew ? "" :
        '<div class="sub"><label for="evphoto">Event photo</label>' +
        '<div id="evphotopreview"></div>' +
        '<input id="evphoto" type="file" accept="image/jpeg,image/png,image/webp">' +
        '<div class="row"><button class="btn" id="evphotoupload">Upload</button>' +
        '<button class="btn" id="evphotoremove">Remove photo</button></div>' +
        '<div id="evphotomsg" role="status"></div></div>') +
      (isNew ? "" :
        '<div class="sub" id="rsvppanel">' +
          '<div class="label">RSVPs</div>' +
          '<div id="rsvpbody" class="muted">Loading\u2026</div>' +
          '<div class="note">Confirmed guests only \u2014 requests and the waitlist ' +
            "aren't visible here yet; the event's host sees them on regenOS.</div>" +
          '<div class="row"><button class="btn" id="refreshrsvp">Refresh</button></div>' +
        "</div>") +
      (isNew ? "" :
        '<div class="sub" id="emailrsvppanel">' +
          '<div class="label">Email RSVPs</div>' +
          '<div id="emailrsvpbody" class="muted">Loading\u2026</div>' +
          '<div class="note">People without a COhere account who asked for a reminder. ' +
            "They get one email the morning before; the list is deleted 30 days after the event.</div>" +
          '<div class="row"><button class="btn" id="copyemailrsvp" hidden>Copy as CSV</button>' +
            '<span class="muted" id="copyemailmsg"></span></div>' +
        "</div>") +
      '<div class="sub">' +
        '<div class="label">' + (isNew ? "Details" : "Edit") + "</div>" +
        '<div class="field"><label for="evname">Name</label>' +
          '<input type="text" id="evname" value="' + esc(e.name) + '"></div>' +
        '<div class="field"><label for="evdesc">Description</label>' +
          '<textarea id="evdesc" rows="4">' + esc(e.description || "") + "</textarea></div>" +
        '<div class="grid2">' +
          '<div class="field"><label for="evstart">Starts</label>' +
            '<input type="datetime-local" id="evstart" value="' + esc(isoToLocalInput(e.startsAt)) + '"></div>' +
          '<div class="field"><label for="evend">Ends</label>' +
            '<input type="datetime-local" id="evend" value="' + esc(isoToLocalInput(e.endsAt)) + '"></div>' +
        "</div>" +
        '<div class="field"><label for="evmode">Format</label><select id="evmode">' +
          opt("inperson", "In person", e.mode || "inperson") +
          opt("virtual", "Online", e.mode) +
          opt("hybrid", "Hybrid", e.mode) +
        "</select></div>" +
        '<div class="field"><label for="evplace">Place name</label>' +
          '<input type="text" id="evplace" value="' + esc(loc.name || "") + '"></div>' +
        '<div class="field"><label for="evstreet">Street</label>' +
          '<input type="text" id="evstreet" value="' + esc(loc.street || "") + '"></div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="evcity">City</label>' +
            '<input type="text" id="evcity" value="' + esc(isNew ? "Boulder" : (loc.locality || "")) + '"></div>' +
          '<div class="field"><label for="evregion">State</label>' +
            '<input type="text" id="evregion" value="' + esc(isNew ? "CO" : (loc.region || "")) + '"></div>' +
        "</div>" +
        '<div class="grid2">' +
          '<div class="field"><label for="evpostal">Postal code</label>' +
            '<input type="text" id="evpostal" value="' + esc(loc.postalCode || "") + '"></div>' +
          '<div class="field"><label for="evcap">Capacity (0 = no limit)</label>' +
            '<input type="number" id="evcap" min="0" max="10000" value="0"></div>' +
        "</div>" +
        '<div class="field"><label for="evrsvp">RSVPs</label><select id="evrsvp">' +
          opt("open", "Open \u2014 anyone can RSVP", "open") +
          opt("approval", "By approval", "") +
        "</select></div>" +
        '<div class="row">' +
          '<button class="btn primary" id="evsave">' +
            (isNew ? "Create event" : "Save changes") + "</button>" +
          (isNew ? "" : '<button class="btn" id="evdelete">Delete</button>') +
          '<span class="err" id="evmsg"></span>' +
        "</div>" +
      "</div>";

    function renderSeats(seats) {
      var body = el("rsvpbody");
      if (!body) return;
      if (!seats || seats.unavailable) {
        body.className = "err";
        body.textContent = "Couldn't read the RSVPs for this event.";
        return;
      }
      body.className = "";
      var guests = seats.guests && seats.guests.length
        ? '<div class="guests">' + seats.guests.map(function (g) {
            return '<span class="pill">' + esc(g.handle || g.did) + "</span>";
          }).join("") + "</div>"
        : '<div class="muted">No confirmed guests yet.</div>';
      body.innerHTML =
        '<div class="row" style="margin-bottom:0.4rem">' +
          '<span class="pill on">' + esc(String(seats.confirmed)) + " confirmed</span>" +
          '<span class="pill">' + esc(String(seats.requested)) + " requested</span>" +
          '<span class="pill">' + esc(String(seats.waitlisted)) + " waitlisted</span>" +
          '<span class="pill">' + esc(seats.maxAttendees ? seats.maxAttendees + " seats" : "no limit") + "</span>" +
          '<span class="pill">' + esc(seats.attendance === "approval" ? "by approval" : "open") + "</span>" +
        "</div>" + guests;
    }

    function applySeats(seats) {
      var cap = el("evcap"), rsvp = el("evrsvp");
      if (!cap || !rsvp) return;
      if (seats && !seats.unavailable) {
        cap.value = seats.maxAttendees ? String(seats.maxAttendees) : "0";
        rsvp.value = seats.attendance === "approval" ? "approval" : "open";
        cap.disabled = false; rsvp.disabled = false;
        seatsKnown = true;
      } else {
        // Never guess these two: an invented "open" on an approval-only event
        // would quietly open the door. Grey them out and leave them off the save.
        cap.disabled = true; rsvp.disabled = true;
        seatsKnown = false;
      }
    }

    function loadSeats() {
      var body = el("rsvpbody");
      if (body) { body.className = "muted"; body.textContent = "Loading\u2026"; }
      return fetchRsvps(e).then(function (seats) {
        renderSeats(seats); applySeats(seats);
      }).catch(function () {
        rsvpCache[eventKey(e)] = { unavailable: true };
        renderSeats(null); applySeats(null);
      });
    }

    var emailRsvpCsv = "";
    function loadEmailRsvps() {
      var body = el("emailrsvpbody");
      return api("/api/admin/rsvps/" + encodeURIComponent(e.did) + "/" + encodeURIComponent(e.rkey))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var rows = data.rsvps || [];
          if (!el("emailrsvpbody")) return;
          emailRsvpCounts[eventKey(e)] = rows.length;
          if (!rows.length) { body.className = "muted"; body.textContent = "No email RSVPs yet."; return; }
          body.className = "";
          body.innerHTML = '<table><thead><tr><th>Name</th><th>Email</th><th>RSVP\u2019d</th><th>Reminded</th></tr></thead><tbody>' +
            rows.map(function (r) {
              return "<tr><td>" + esc(r.name || "") + "</td><td>" + esc(r.email) + "</td><td>" +
                esc(whenText(r.created_at)) + "</td><td>" + esc(r.reminder_sent_at ? "yes" : "\u2014") + "</td></tr>";
            }).join("") + "</tbody></table>";
          function cell(v) { v = String(v || ""); return /[",\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
          emailRsvpCsv = "name,email,rsvped_at\\n" + rows.map(function (r) {
            return [cell(r.name), cell(r.email), cell(r.created_at)].join(",");
          }).join("\\n") + "\\n";
          el("copyemailrsvp").hidden = false;
        })
        .catch(function () {
          if (body) { body.className = "err"; body.textContent = "Couldn't read the email RSVPs."; }
        });
    }

    if (!isNew) {
      loadEmailRsvps();
      el("copyemailrsvp").addEventListener("click", function () {
        var msg = el("copyemailmsg");
        navigator.clipboard.writeText(emailRsvpCsv).then(function () { msg.textContent = "Copied."; },
          function () { msg.textContent = "Couldn't copy \u2014 select the table instead."; });
      });
      var cached = rsvpCache[eventKey(e)];
      if (cached) { renderSeats(cached); applySeats(cached); } else { loadSeats(); }
      el("refreshrsvp").addEventListener("click", function () { loadSeats(); loadEmailRsvps(); });
    }

    if (!isNew) {
      function renderPhoto() {
        el("evphotopreview").innerHTML = e.imageUrl
          ? '<img src="' + esc(e.imageUrl) + '" alt="' + esc(e.name) + '" style="max-width:240px;max-height:160px">'
          : '<p class="muted">Using an automatic photo</p>';
        el("evphotoremove").disabled = !e.imageUrl;
      }
      renderPhoto();
      async function changePhoto(remove) {
        var msg = el("evphotomsg");
        var upload = el("evphotoupload");
        var removeButton = el("evphotoremove");
        upload.disabled = removeButton.disabled = true;
        msg.textContent = remove ? "Removing photo…" : "Preparing photo…";
        try {
          var body;
          if (!remove) {
            var file = el("evphoto").files[0];
            if (!file) throw new Error("Choose a photo first.");
            if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) throw new Error("Use a JPEG, PNG, or WebP image.");
            var bitmap = await createImageBitmap(file);
            try {
              var scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height);
              var canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(bitmap.width * scale));
              canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              body = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/webp", 0.85); });
            } finally { bitmap.close(); }
            if (!body || body.type !== "image/webp") throw new Error("Couldn't prepare this photo. Try another image.");
            if (body.size > 2 * 1024 * 1024) throw new Error("This photo is still over 2 MB. Choose a smaller image.");
            msg.textContent = "Uploading photo…";
          }
          var response = await api("/api/admin/events/" + encodeURIComponent(e.did) + "/" + encodeURIComponent(e.rkey) + "/image", {
            method: remove ? "DELETE" : "PUT", headers: remove ? {} : { "Content-Type": "image/webp" }, body: body
          });
          var data = await response.json();
          e.imageUrl = data.imageUrl;
          renderPhoto();
          el("evphoto").value = "";
          msg.textContent = remove ? "Photo removed. Using an automatic photo." : "Photo uploaded.";
        } catch (err) { msg.textContent = err.message || "Couldn't update the photo."; }
        finally { upload.disabled = false; removeButton.disabled = !e.imageUrl; }
      }
      el("evphotoupload").addEventListener("click", function () { changePhoto(false); });
      el("evphotoremove").addEventListener("click", function () { changePhoto(true); });
    }

    el("closedrawer").addEventListener("click", closeDrawer);

    el("evsave").addEventListener("click", function () {
      var msg = el("evmsg");
      msg.textContent = "";
      var payload = {
        name: el("evname").value.trim(),
        description: el("evdesc").value.trim(),
        startsAt: localInputToIso(el("evstart").value),
        endsAt: localInputToIso(el("evend").value),
        mode: el("evmode").value,
        placeName: el("evplace").value.trim(),
        street: el("evstreet").value.trim(),
        locality: el("evcity").value.trim(),
        region: el("evregion").value.trim(),
        postalCode: el("evpostal").value.trim()
      };
      if (seatsKnown) {
        payload.attendance = el("evrsvp").value;
        payload.maxAttendees = Number(el("evcap").value || 0);
      }
      if (!payload.name) { msg.textContent = "An event needs a name."; return; }
      if (!payload.startsAt) { msg.textContent = "An event needs a start date and time."; return; }
      el("evsave").disabled = true;
      var path = isNew
        ? "/api/admin/events"
        : "/api/admin/events/" + encodeURIComponent(e.did) + "/" + encodeURIComponent(e.rkey);
      api(path, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function () {
        if (!isNew) delete rsvpCache[eventKey(e)];
        closeDrawer();
        return loadEvents().then(function () {
          el("eventmsg").textContent = isNew ? "Event created." : "Saved.";
        });
      }).catch(function (err) {
        msg.textContent = err.message;
        var again = el("evsave");
        if (again) again.disabled = false;
      });
    });

    if (!isNew) {
      el("evdelete").addEventListener("click", function () {
        if (!confirm('Delete "' + e.name + '"? It comes off the public calendar too.')) return;
        el("evmsg").textContent = "";
        api("/api/admin/events/" + encodeURIComponent(e.did) + "/" + encodeURIComponent(e.rkey),
            { method: "DELETE" }).then(function () {
          delete rsvpCache[eventKey(e)];
          closeDrawer();
          return loadEvents().then(function () { el("eventmsg").textContent = "Event deleted."; });
        }).catch(function (err) { el("evmsg").textContent = err.message; });
      });
    }

    el("drawer").classList.add("open");
    el("drawerbg").classList.add("open");
  }

  // ====================================================== the Proposals tab

  function whereTextProposal(p) {
    var bits = [];
    if (p.place_name) bits.push(p.place_name);
    if (p.locality) bits.push(p.locality);
    if (bits.length) return bits.join(", ");
    if (p.mode === "virtual") return "Online";
    return "—";
  }

  function proposerText(p) {
    var who = p.proposer_name || (p.proposer_email ? "" : "Anonymous");
    var bits = [];
    if (who) bits.push(esc(who));
    if (p.proposer_email) bits.push('<span class="muted">' + esc(p.proposer_email) + "</span>");
    return bits.length ? bits.join(" ") : '<span class="muted">—</span>';
  }

  function renderProposalBadge() {
    var badge = el("proposalbadge");
    if (!badge) return;
    var pending = proposalStatus === "pending" ? proposals.length : null;
    if (pending === null) return; // only the pending count drives the badge
    badge.textContent = pending ? String(pending) : "";
    badge.className = pending ? "pill on" : "pill";
  }

  // Loaded once on sign-in (and after every approve/reject) so the badge is
  // right even before anyone opens the tab.
  function loadPendingProposalCount() {
    return api("/api/admin/proposals?status=pending").then(function (r) { return r.json(); }).then(function (data) {
      var badge = el("proposalbadge");
      if (!badge) return;
      var n = (data.proposals || []).length;
      badge.textContent = n ? String(n) : "";
      badge.className = n ? "pill on" : "pill";
      if (proposalStatus === "pending") { proposals = data.proposals || []; renderProposals(); }
    }).catch(function () { /* the badge just stays blank */ });
  }

  function loadProposals() {
    el("proposalmsg").textContent = "Loading…";
    return api("/api/admin/proposals?status=" + encodeURIComponent(proposalStatus))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        proposals = data.proposals || [];
        el("proposalmsg").textContent = "";
        renderProposals();
      }).catch(function (e) {
        el("proposalmsg").textContent = e.message;
        el("proposalrows").innerHTML = '<tr><td colspan="5" class="muted">Could not load proposals.</td></tr>';
      });
  }

  function renderProposals() {
    renderProposalBadge();
    if (!proposals.length) {
      el("proposalrows").innerHTML = '<tr><td colspan="5" class="muted">' +
        (proposalStatus === "pending" ? "Nothing waiting for review." : "Nothing here yet.") + "</td></tr>";
      return;
    }
    el("proposalrows").innerHTML = proposals.map(function (p) {
      var actions = p.status === "pending"
        ? '<div class="row">' +
            '<button class="btn primary" data-approve="' + esc(p.id) + '">Approve</button>' +
            '<button class="btn" data-reject="' + esc(p.id) + '">Reject</button>' +
          "</div>"
        : p.status === "published"
          ? '<span class="pill on">published</span>'
          : '<span class="pill off">rejected' + (p.review_note ? ": " + esc(p.review_note) : "") + "</span>";
      return "<tr>" +
        "<td>" + esc(whenText(p.starts_at)) + "</td>" +
        '<td class="wrapcell">' + esc(p.name) + "</td>" +
        '<td class="wrapcell">' + proposerText(p) + "</td>" +
        '<td class="wrapcell">' + esc(whereTextProposal(p)) + "</td>" +
        "<td>" + actions + "</td>" +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call(el("proposalrows").querySelectorAll("[data-approve]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-approve");
        btn.disabled = true;
        el("proposalmsg").textContent = "";
        api("/api/admin/proposals/" + encodeURIComponent(id) + "/approve", { method: "POST" })
          .then(function () {
            return loadProposals().then(loadPendingProposalCount).then(function () {
              el("proposalmsg").textContent = "Approved and published to the calendar.";
            });
          }).catch(function (err) {
            el("proposalmsg").textContent = err.message;
            btn.disabled = false;
          });
      });
    });

    Array.prototype.forEach.call(el("proposalrows").querySelectorAll("[data-reject]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-reject");
        var note = window.prompt("Reason (optional — shared with the proposer if they left an email):", "");
        if (note === null) return; // cancelled
        btn.disabled = true;
        el("proposalmsg").textContent = "";
        api("/api/admin/proposals/" + encodeURIComponent(id) + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note })
        }).then(function () {
          return loadProposals().then(loadPendingProposalCount).then(function () {
            el("proposalmsg").textContent = "Rejected.";
          });
        }).catch(function (err) {
          el("proposalmsg").textContent = err.message;
          btn.disabled = false;
        });
      });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("#tab-proposals .chip"), function (chip) {
    chip.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll("#tab-proposals .chip"), function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      proposalStatus = chip.getAttribute("data-pstatus");
      loadProposals();
    });
  });

  // ======================================================== the Access tab

  var ROLES = [["member", "Member"], ["builder", "Builder"],
               ["facilitator", "Facilitator"], ["steward", "Steward"]];

  function loadAccess() {
    return api("/api/admin/access").then(function (r) { return r.json(); }).then(function (data) {
      accessMembers = data.members || [];
      renderAccess();
    }).catch(function (e) {
      el("accessmsg").textContent = e.message;
      el("accessrows").innerHTML =
        '<tr><td colspan="3" class="muted">Could not load the roster.</td></tr>';
    });
  }

  function renderAccess() {
    if (!accessMembers.length) {
      el("accessrows").innerHTML =
        '<tr><td colspan="3" class="muted">Nobody on the roster yet.</td></tr>';
      return;
    }
    el("accessrows").innerHTML = accessMembers.map(function (m) {
      var who = esc(m.handle || m.did) +
        (m.name ? ' <span class="muted">' + esc(m.name) + "</span>" : "");
      if (m.protected) {
        return "<tr>" +
          "<td>" + who + ' <span class="muted">(' + esc(m.protectedLabel) + ")</span></td>" +
          '<td><span class="pill">' + esc(m.role || "\u2014") + "</span></td>" +
          '<td class="muted">managed outside this portal</td>' +
          "</tr>";
      }
      var options = ROLES.map(function (r) {
        return '<option value="' + r[0] + '"' + (r[0] === m.role ? " selected" : "") +
          ">" + r[1] + "</option>";
      }).join("");
      return "<tr>" +
        "<td>" + who + "</td>" +
        '<td><select data-role="' + esc(m.did) + '">' + options + "</select></td>" +
        '<td><button class="btn" data-revoke="' + esc(m.did) + '">Remove</button></td>' +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call(el("accessrows").querySelectorAll("[data-role]"), function (sel) {
      sel.addEventListener("change", function () {
        var did = sel.getAttribute("data-role");
        var member = accessMembers.filter(function (m) { return m.did === did; })[0];
        var was = member ? member.role : "";
        var label = (member && member.handle) ? member.handle : did;
        if (!confirm("Make " + label + " a " + sel.value + " of the COhere collective?")) {
          sel.value = was;
          return;
        }
        el("accessmsg").textContent = "";
        api("/api/admin/access/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ did: did, role: sel.value })
        }).then(function () {
          if (member) member.role = sel.value;
          el("accessmsg").textContent = label + " is now a " + sel.value + ".";
        }).catch(function (err) {
          sel.value = was;
          el("accessmsg").textContent = err.message;
        });
      });
    });

    Array.prototype.forEach.call(el("accessrows").querySelectorAll("[data-revoke]"), function (btn) {
      btn.addEventListener("click", function () {
        var did = btn.getAttribute("data-revoke");
        var member = accessMembers.filter(function (m) { return m.did === did; })[0];
        var label = (member && member.handle) ? member.handle : did;
        if (!confirm("Remove " + label + "? They lose the ability to add or edit events.")) return;
        el("accessmsg").textContent = "";
        api("/api/admin/access/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ did: did })
        }).then(function () {
          return loadAccess().then(function () {
            el("accessmsg").textContent = label + " was removed.";
          });
        }).catch(function (err) { el("accessmsg").textContent = err.message; });
      });
    });
  }

  function loadAdmins() {
    return api("/api/admin/admins").then(function (r) { return r.json(); }).then(function (data) {
      el("adminrows").innerHTML = data.admins.map(function (a) {
        return "<tr>" +
          "<td>" + esc(a.email) + "</td>" +
          "<td>" + esc(a.name || "—") + "</td>" +
          "<td>" + esc(a.added_by || "—") + "</td>" +
          "<td>" + esc((a.created_at || "").slice(0, 10)) + "</td>" +
          "<td>" + (canManage() ? '<button class="btn" data-remove="' + esc(a.email) + '">Remove</button>' : "") + "</td>" +
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

  // ------------------------------------------------------------ newsletter
  // The server enforces every safeguard (worker/src/newsletter.ts); this only
  // mirrors the state so the buttons say what will happen.
  var newsletters = [], nlCurrent = null, nlDirty = false, nlAudiences = null, bhCsv = null;

  // The picker's value: all | form:<slug> | tag:<tag> | segment. A segment's
  // include/exclude choices live in the #nlterms selects, one per form or tag.
  function audienceValue(a) {
    if (!a) return "all";
    return a.kind === "form" ? "form:" + a.form : a.kind === "tag" ? "tag:" + a.tag : a.kind === "segment" ? "segment" : "all";
  }
  function termKey(t) { return t.form ? "form:" + t.form : "tag:" + t.tag; }
  function termFromKey(k) { return k.indexOf("form:") === 0 ? { form: k.slice(5) } : { tag: k.slice(4) }; }
  function termLabel(k) { return k.indexOf("form:") === 0 ? "Registered: " + k.slice(5) : "Tagged: " + k.slice(4); }
  function currentAudience() {
    var v = el("nlaudience").value;
    if (v.indexOf("form:") === 0) return { kind: "form", form: v.slice(5) };
    if (v.indexOf("tag:") === 0) return { kind: "tag", tag: v.slice(4) };
    if (v === "segment") {
      var include = [], exclude = [];
      Array.prototype.forEach.call(el("nlterms").querySelectorAll("select[data-term]"), function (sel) {
        if (sel.value === "include") include.push(termFromKey(sel.getAttribute("data-term")));
        if (sel.value === "exclude") exclude.push(termFromKey(sel.getAttribute("data-term")));
      });
      return { kind: "segment", include: include, exclude: exclude };
    }
    return { kind: "all" };
  }
  // Rows for every known form and tag, plus any term the stored audience uses
  // that has since vanished from the lists, so opening a draft never drops one.
  function fillTerms(a) {
    if (!nlAudiences) return;
    var keys = [];
    nlAudiences.forms.forEach(function (f) { keys.push("form:" + f.slug); });
    nlAudiences.tags.forEach(function (t) { keys.push("tag:" + t.tag); });
    var chosen = {};
    if (a && a.kind === "segment") {
      a.include.forEach(function (t) { chosen[termKey(t)] = "include"; });
      a.exclude.forEach(function (t) { chosen[termKey(t)] = "exclude"; });
    } else {
      Array.prototype.forEach.call(el("nlterms").querySelectorAll("select[data-term]"), function (sel) {
        if (sel.value) chosen[sel.getAttribute("data-term")] = sel.value;
      });
    }
    Object.keys(chosen).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
    el("nlterms").innerHTML = keys.map(function (k) {
      return "<span>" + esc(termLabel(k)) + '</span><select data-term="' + esc(k) + '" aria-label="' + esc(termLabel(k)) + '">' +
        '<option value="">—</option>' +
        '<option value="include"' + (chosen[k] === "include" ? " selected" : "") + ">Include</option>" +
        '<option value="exclude"' + (chosen[k] === "exclude" ? " selected" : "") + ">Exclude</option></select>";
    }).join("");
    Array.prototype.forEach.call(el("nlterms").querySelectorAll("select"), function (sel) {
      sel.addEventListener("change", audienceChanged);
    });
  }
  function audienceText(a) {
    if (!a) return "—";
    if (a.kind === "segment") {
      var inc = a.include.length ? a.include.map(function (t) { return t.form || t.tag; }).join(" or ") : "everyone subscribed";
      return a.exclude.length ? inc + ", not " + a.exclude.map(function (t) { return t.form || t.tag; }).join(" or ") : inc;
    }
    return a.kind === "form" ? "registrants of " + a.form : a.kind === "tag" ? "tagged " + a.tag : "everyone subscribed";
  }
  function nlTime(iso) { return iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; }

  function loadNewsletters() {
    var audiences = nlAudiences ? Promise.resolve(nlAudiences) :
      api("/api/admin/newsletters/audiences").then(function (r) { return r.json(); }).then(function (d) { nlAudiences = d; return d; });
    return Promise.all([api("/api/admin/newsletters").then(function (r) { return r.json(); }), audiences]).then(function (res) {
      newsletters = res[0].newsletters;
      renderNewsletterRows();
      fillAudienceSelect();
    }).catch(function (e) { el("nllistmsg").textContent = e.message; });
  }

  // Filled in by Resend's webhook after a send: delivered / bounced (hard) /
  // complained (marked as spam). Blank until the first event arrives.
  function deliveryText(delivered, bounced, complained) {
    delivered = Number(delivered || 0); bounced = Number(bounced || 0); complained = Number(complained || 0);
    if (!delivered && !bounced && !complained) return "";
    return delivered + " delivered · " + bounced + " bounced · " + complained + " complained";
  }

  function renderNewsletterRows() {
    el("nlrows").innerHTML = newsletters.length ? newsletters.map(function (n) {
      var cls = n.status === "sent" ? "on" : n.status === "cancelled" ? "off" : "";
      return '<tr data-nl="' + esc(n.id) + '">' +
        '<td class="wrapcell">' + esc(n.subject) + "</td>" +
        "<td>" + esc(audienceText(n.audience)) + "</td>" +
        '<td><span class="pill ' + cls + '">' + esc(n.status) + "</span>" +
          (n.status === "scheduled" ? " " + esc(nlTime(n.scheduled_for)) : "") + "</td>" +
        '<td data-testid="nl-sent-cell">' + esc(n.sent_count) + (n.failed_count ? " (" + esc(n.failed_count) + " failed)" : "") + "</td>" +
        '<td data-testid="nl-delivery-cell">' + esc(deliveryText(n.delivered_count, n.bounced_count, n.complained_count)) + "</td>" +
        "<td>" + esc(n.confirmed_by || n.created_by) + "</td>" +
        "<td>" + esc(nlTime(n.updated_at)) + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="muted">No newsletters yet.</td></tr>';
    Array.prototype.forEach.call(el("nlrows").querySelectorAll("[data-nl]"), function (tr) {
      tr.addEventListener("click", function () { openNewsletter(tr.getAttribute("data-nl")); });
    });
  }

  function fillAudienceSelect(a) {
    if (!nlAudiences) return;
    var current = a ? audienceValue(a) : (el("nlaudience").value || "all");
    var opts = ['<option value="all">Everyone subscribed</option>'];
    nlAudiences.forms.forEach(function (f) {
      opts.push('<option value="form:' + esc(f.slug) + '">Registrants: ' + esc(f.title) + " (" + esc(f.slug) + ")</option>");
    });
    nlAudiences.tags.forEach(function (t) {
      opts.push('<option value="tag:' + esc(t.tag) + '">Tagged: ' + esc(t.tag) + " (" + esc(t.people) + ")</option>");
    });
    opts.push('<option value="segment">Custom segment (include / exclude)…</option>');
    el("nlaudience").innerHTML = opts.join("");
    el("nlaudience").value = current;
    if (el("nlaudience").value !== current) el("nlaudience").value = "all";
    fillTerms(a);
    show("nlsegment", el("nlaudience").value === "segment");
  }

  function audienceChanged() {
    nlDirty = true; show("nlconfirm", false);
    show("nlsegment", el("nlaudience").value === "segment");
    updateLock(); refreshCount();
  }

  // Count + first 20 recipients (masked), newest request wins.
  var nlCountSeq = 0;
  function refreshCount() {
    var seq = ++nlCountSeq;
    el("nlcount").textContent = "Counting…";
    api("/api/admin/newsletters/recipients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: currentAudience() })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (seq !== nlCountSeq) return;
      el("nlcount").textContent = d.count + " people would receive it right now.";
      el("nlrecipslist").innerHTML = d.recipients.length ? d.recipients.map(function (r) {
        return "<li>" + esc(r.name || "(no name)") + " &middot; " + esc(r.email) + "</li>";
      }).join("") : "<li>Nobody.</li>";
    }).catch(function (e) { if (seq === nlCountSeq) el("nlcount").textContent = e.message; });
  }

  function showNewsletter(n) {
    nlCurrent = n; nlDirty = false;
    show("nleditor", true); show("nlconfirm", false);
    el("nlmsg").textContent = "";
    el("nltitle").textContent = n ? "Newsletter" : "New newsletter";
    el("nlsubject").value = n ? n.subject : "";
    el("nlbody").value = n ? n.text : "";
    fillAudienceSelect(n ? n.audience : { kind: "all" });
    var draft = !n || n.status === "draft";
    ["nlsubject", "nlbody", "nlaudience", "nlpreset"].forEach(function (id) { el(id).disabled = !draft; });
    Array.prototype.forEach.call(document.querySelectorAll("#nlterms select, #nltools button"), function (b) { b.disabled = !draft; });
    el("nlstatus").textContent = n ? n.status + (n.status === "scheduled" ? " · goes out " + nlTime(n.scheduled_for) : "") +
      (n.counts && (n.counts.sent || n.counts.failed) ? " · " + n.counts.sent + " sent, " + n.counts.failed + " failed" : "") +
      (n.counts && deliveryText(n.counts.delivered, n.counts.bounced, n.counts.complained)
        ? " · " + deliveryText(n.counts.delivered, n.counts.bounced, n.counts.complained) : "") : "draft";
    show("nlsave", draft); show("nltest", draft); show("nlsend", draft);
    show("nlcancel", !!n && (n.status === "scheduled" || n.status === "sending"));
    show("nlreopen", !!n && n.status === "cancelled");
    show("nldelete", !!n && (n.status === "draft" || n.status === "cancelled"));
    refreshPreview();
    updateLock();
    refreshCount();
  }

  function updateLock() {
    var n = nlCurrent;
    var unlocked = !!n && n.send_unlocked && !nlDirty;
    el("nlsend").disabled = !unlocked;
    el("nllock").textContent = !n ? "Save the draft, then send yourself a test." :
      nlDirty ? "You've changed it since the last save — save and send yourself a new test before sending." :
      n.status !== "draft" ? "" :
      unlocked ? "Tested " + nlTime(n.test_sent_at) + " to " + n.test_sent_to + ". Ready to send." :
      (n.lock_reason || "Send yourself a test first.");
  }

  function openNewsletter(id) {
    api("/api/admin/newsletters/" + encodeURIComponent(id)).then(function (r) { return r.json(); })
      .then(function (d) { showNewsletter(d.newsletter); el("nleditor").scrollIntoView({ block: "start" }); })
      .catch(function (e) { el("nllistmsg").textContent = e.message; });
  }

  function saveNewsletter() {
    var payload = JSON.stringify({ subject: el("nlsubject").value, text: el("nlbody").value, audience: currentAudience() });
    var req = nlCurrent
      ? api("/api/admin/newsletters/" + encodeURIComponent(nlCurrent.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload })
      : api("/api/admin/newsletters", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    return req.then(function (r) { return r.json(); }).then(function (d) {
      showNewsletter(d.newsletter);
      loadNewsletters();
      return d.newsletter;
    });
  }

  function nlAction(button, work) {
    el("nlmsg").textContent = "";
    button.disabled = true;
    return work().catch(function (e) { el("nlmsg").textContent = e.message; })
      .then(function () { button.disabled = false; updateLock(); });
  }

  // Live preview: the server's own renderer, so what is shown is what is sent.
  // Debounced; a newer request makes older answers irrelevant.
  var nlPreviewTimer = null, nlPreviewSeq = 0;
  function refreshPreview() {
    var seq = ++nlPreviewSeq;
    api("/api/admin/newsletters/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: el("nlsubject").value, text: el("nlbody").value })
    }).then(function (r) { return r.json(); }).then(function (d) {
      // Sandboxed with no permissions: the server escapes the body, and even
      // so nothing in the preview can run script or reach this page.
      if (seq === nlPreviewSeq) el("nlframe").srcdoc = d.html;
    }).catch(function (e) { if (seq === nlPreviewSeq) el("nlmsg").textContent = e.message; });
  }
  function schedulePreview() {
    clearTimeout(nlPreviewTimer);
    nlPreviewTimer = setTimeout(refreshPreview, 350);
  }

  // Toolbar: wraps the selection (or inserts a placeholder) in markdown.
  function mdEdit(kind) {
    var ta = el("nlbody");
    if (ta.disabled) return;
    var start = ta.selectionStart, end = ta.selectionEnd, value = ta.value;
    var sel = value.slice(start, end);
    var before = "", after = "", fill = sel, block = false;
    if (kind === "bold") { before = "**"; after = "**"; fill = sel || "bold text"; }
    else if (kind === "italic") { before = "*"; after = "*"; fill = sel || "italic text"; }
    else if (kind === "link") { before = "["; after = "](https://)"; fill = sel || "link text"; }
    else if (kind === "button") { before = "[["; after = "]](https://)"; fill = sel || "Register now"; block = true; }
    else if (kind === "image") { before = "![" ; after = "](https://)"; fill = sel || "description"; block = true; }
    else if (kind === "heading") { before = "## "; fill = sel || "Heading"; block = true; }
    else if (kind === "list") {
      fill = (sel || "item").split("\\n").map(function (l) { return "- " + l.replace(/^[-*]\\s+/, ""); }).join("\\n");
      block = true;
    }
    else if (kind === "rule") {
      // Goes after the paragraph the cursor is in; never replaces a selection.
      var gap = value.indexOf("\\n\\n", end);
      start = end = gap === -1 ? value.length : gap;
      fill = "---"; block = true;
    }
    // Block elements need a blank line either side to be recognized.
    var lead = "", trail = "";
    if (block) {
      var pre = value.slice(0, start), post = value.slice(end);
      lead = !pre ? "" : /\\n\\n$/.test(pre) ? "" : /\\n$/.test(pre) ? "\\n" : "\\n\\n";
      trail = !post ? "\\n\\n" : /^\\n\\n/.test(post) ? "" : /^\\n/.test(post) ? "\\n" : "\\n\\n";
    }
    var inserted = lead + before + fill + after + trail;
    ta.focus();
    ta.setRangeText(inserted, start, end, "end");
    var from = start + lead.length + before.length;
    ta.setSelectionRange(from, from + fill.length);
    nlDirty = true; show("nlconfirm", false); updateLock(); schedulePreview();
  }
  Array.prototype.forEach.call(document.querySelectorAll("#nltools [data-md]"), function (b) {
    b.addEventListener("click", function () { mdEdit(b.getAttribute("data-md")); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-nlview]"), function (b) {
    b.addEventListener("click", function () {
      el("nledit").setAttribute("data-view", b.getAttribute("data-nlview"));
      Array.prototype.forEach.call(document.querySelectorAll("[data-nlview]"), function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      if (b.getAttribute("data-nlview") === "preview") refreshPreview();
    });
  });

  el("nlpreset").addEventListener("click", function () {
    fillAudienceSelect({ kind: "segment", include: [{ form: "register-2025" }, { tag: "cohere-2024" }], exclude: [{ form: "register-2026" }] });
    audienceChanged();
  });
  el("nlcsv").addEventListener("click", function () {
    api("/api/admin/newsletters/recipients.csv?audience=" + encodeURIComponent(JSON.stringify(currentAudience())))
      .then(function (r) { return r.blob(); }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "newsletter-recipients.csv";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }).catch(function (e) { el("nlcount").textContent = e.message; });
  });

  el("nlnew").addEventListener("click", function () { showNewsletter(null); el("nlsubject").focus(); });
  ["nlsubject", "nlbody"].forEach(function (id) {
    el(id).addEventListener("input", function () { nlDirty = true; show("nlconfirm", false); updateLock(); schedulePreview(); });
  });
  el("nlaudience").addEventListener("change", audienceChanged);

  el("nlsave").addEventListener("click", function () {
    nlAction(el("nlsave"), function () { return saveNewsletter().then(function () { el("nlmsg").textContent = "Saved."; }); });
  });

  el("nltest").addEventListener("click", function () {
    nlAction(el("nltest"), function () {
      var save = nlDirty || !nlCurrent ? saveNewsletter() : Promise.resolve(nlCurrent);
      return save.then(function (n) {
        var body = {};
        if (ME && ME.hasMailbox === false) {
          // regenOS holds no email for this account: the test must go to an
          // organizer notification address, which the server checks.
          var to = window.prompt("Your regenOS account has no email we can use. Send the test to which organizer notification address?", "");
          if (!to) throw new Error("Test not sent.");
          body.to = to.trim();
        }
        return api("/api/admin/newsletters/" + encodeURIComponent(n.id) + "/test", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
      }).then(function (r) { return r.json(); }).then(function (d) {
        showNewsletter(d.newsletter);
        el("nlmsg").textContent = "Test sent to " + d.newsletter.test_sent_to + ". Check it, then send.";
      });
    });
  });

  el("nlsend").addEventListener("click", function () {
    if (!nlCurrent || nlDirty) return;
    nlAction(el("nlsend"), function () {
      return api("/api/admin/newsletters/count", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: nlCurrent.audience })
      }).then(function (r) { return r.json(); }).then(function (d) {
        el("nlconfirmcount").textContent = d.count;
        el("nlconfirmaud").textContent = audienceText(nlCurrent.audience);
        el("nlconfirminput").value = "";
        show("nlconfirm", true);
        el("nlconfirminput").focus();
      });
    });
  });
  el("nlconfirmback").addEventListener("click", function () { show("nlconfirm", false); });

  el("nlconfirmgo").addEventListener("click", function () {
    nlAction(el("nlconfirmgo"), function () {
      return api("/api/admin/newsletters/" + encodeURIComponent(nlCurrent.id) + "/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_count: el("nlconfirminput").value.trim() })
      }).then(function (r) { return r.json(); }).then(function (d) {
        showNewsletter(d.newsletter);
        loadNewsletters();
        el("nlmsg").textContent = "Scheduled for " + nlTime(d.newsletter.scheduled_for) + ". " + d.notified +
          " organizer(s) were emailed a cancel link.";
      });
    });
  });

  el("nlcancel").addEventListener("click", function () {
    if (!confirm("Cancel this send? Anyone it already reached keeps it; nobody else gets it.")) return;
    nlAction(el("nlcancel"), function () {
      return api("/api/admin/newsletters/" + encodeURIComponent(nlCurrent.id) + "/cancel", { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (d) { showNewsletter(d.newsletter); loadNewsletters(); el("nlmsg").textContent = "Cancelled."; });
    });
  });

  el("nlreopen").addEventListener("click", function () {
    nlAction(el("nlreopen"), function () {
      return api("/api/admin/newsletters/" + encodeURIComponent(nlCurrent.id) + "/reopen", { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (d) { showNewsletter(d.newsletter); loadNewsletters(); });
    });
  });

  el("nldelete").addEventListener("click", function () {
    if (!confirm("Delete this draft?")) return;
    nlAction(el("nldelete"), function () {
      return api("/api/admin/newsletters/" + encodeURIComponent(nlCurrent.id), { method: "DELETE" })
        .then(function () { nlCurrent = null; show("nleditor", false); loadNewsletters(); });
    });
  });

  function importCountsText(c) {
    return c.rows + " rows: " + c.new + " new (" + c.new_unsubscribed + " of them unsubscribed), " +
      c.existing + " already here (" + c.existing_changed + " to update, " + c.unchanged + " unchanged), " +
      c.would_unsubscribe + " would be unsubscribed, " + c.skipped_invalid + " skipped as invalid" +
      (c.duplicates_in_file ? ", " + c.duplicates_in_file + " duplicate rows merged" : "") + ".";
  }

  el("bhfile").addEventListener("change", function () { bhCsv = null; el("bhapply").disabled = true; el("bhresult").textContent = ""; });

  el("bhpreview").addEventListener("click", function () {
    var file = el("bhfile").files[0];
    if (!file) { el("bhresult").textContent = "Choose the CSV first."; return; }
    el("bhresult").textContent = "Reading…";
    file.text().then(function (text) {
      bhCsv = text;
      return api("/api/admin/import/beehiiv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }) });
    }).then(function (r) { return r.json(); }).then(function (d) {
      el("bhresult").textContent = "Preview — nothing written yet. " + importCountsText(d.counts);
      el("bhapply").disabled = d.pending === 0;
      if (d.pending === 0) el("bhresult").textContent += " Nothing to change.";
    }).catch(function (e) { el("bhresult").textContent = e.message; });
  });

  el("bhapply").addEventListener("click", function () {
    if (!bhCsv) return;
    el("bhapply").disabled = true;
    var applied = 0, first = null;
    function step(guard) {
      return api("/api/admin/import/beehiiv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: bhCsv, apply: true }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          first = first || d.counts;
          applied += d.applied;
          el("bhresult").textContent = "Applying… " + applied + " written, " + d.pending + " to go.";
          if (d.pending > 0 && d.applied > 0 && guard < 500) return step(guard + 1);
          el("bhresult").textContent = "Imported. " + importCountsText(first) + " " + applied + " people written.";
          nlAudiences = null;
          return load();
        });
    }
    step(0).catch(function (e) { el("bhresult").textContent = e.message; });
  });

  el("sendlink").addEventListener("click", requestCode);
  el("email").addEventListener("keydown", function (e) { if (e.key === "Enter") requestCode(); });
  el("verify").addEventListener("click", verifyTypedCode);
  el("code").addEventListener("keydown", function (e) { if (e.key === "Enter") verifyTypedCode(); });
  el("startover").addEventListener("click", function () {
    show("step-code", false); show("step-email", true); el("loginerr").textContent = "";
  });
  el("signout").addEventListener("click", function () {
    if (LOGIN_MODE === "regenos") {
      // Signing out of the portal is signing out of regenOS on this site.
      fetch("/xrpc/social.scenius.logout", { method: "POST", credentials: "same-origin" })
        .catch(function () {})
        .then(function () { window.location.assign("/"); });
      return;
    }
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(function () { signOut(""); });
  });
  el("refresh").addEventListener("click", load);
  el("drawerbg").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  el("q").addEventListener("input", function (e) { query = e.target.value.trim().toLowerCase(); render(); });
  el("exportall").addEventListener("click", function () { downloadCsv("/api/admin/export.csv"); });

  // Scoped per tab: the Events tab has its own chips, and a bare ".chip"
  // selector would have each set clearing the other's pressed state.
  Array.prototype.forEach.call(document.querySelectorAll("#tab-people .chip"), function (chip) {
    chip.addEventListener("click", function () {
      filter = chip.getAttribute("data-filter");
      Array.prototype.forEach.call(document.querySelectorAll("#tab-people .chip"), function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      render();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("#tab-events .chip"), function (chip) {
    chip.addEventListener("click", function () {
      eventWhen = chip.getAttribute("data-when");
      Array.prototype.forEach.call(document.querySelectorAll("#tab-events .chip"), function (c) {
        c.setAttribute("aria-pressed", String(c === chip));
      });
      renderEvents();
      fillRsvpColumns();
    });
  });

  el("newevent").addEventListener("click", function () { openEventDrawer(null); });

  el("sendinvite").addEventListener("click", function () {
    var email = el("inviteemail").value.trim();
    if (!email) return;
    el("accessmsg").textContent = "";
    el("sendinvite").disabled = true;
    api("/api/admin/access/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, role: el("inviterole").value })
    }).then(function () {
      el("inviteemail").value = "";
      el("accessmsg").textContent =
        "Invite sent to " + email + ". They show up on the roster once they accept.";
    }).catch(function (e) {
      el("accessmsg").textContent = e.message;
    }).then(function () { el("sendinvite").disabled = false; });
  });

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
        t.setAttribute("aria-selected", String(t === tab));
      });
      ["people", "events", "proposals", "forms", "newsletter", "access", "admins"].forEach(function (n) {
        var section = el("tab-" + n);
        section.classList.toggle("hidden", n !== name);
        section.style.display = n === name ? "flex" : "none";
      });
      if (name === "admins") loadAdmins();
      if (name === "events") loadEvents();
      if (name === "proposals") loadProposals();
      if (name === "access") loadAccess();
      if (name === "newsletter") loadNewsletters();
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

  if (LOGIN_MODE === "regenos") show("login", false);

  // A magic-link callback lands here already carrying a session cookie.
  if (new URLSearchParams(location.search).get("error") === "expired") {
    el("loginerr").textContent = "That sign-in link has expired. Request a new one.";
  }
  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) {
    if (r.ok) load();
  }).catch(function () { /* not signed in; the login form is already showing */ });
})();
</script>
</body>
</html>`;
