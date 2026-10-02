// Door check-in, served as one self-contained page from GET /admin/checkin.
//
// Phone-first (one column, big tap targets) and built for venue wifi: every
// check-in and undo goes into a queue in localStorage, is shown immediately,
// and is retried until the Worker accepts it. A check-in carries an id minted
// here, so a retry of one that actually landed is a no-op server-side.
//
// The page itself holds no data. It uses the portal's session cookie; a 401
// from any call shows a link to /admin to sign in. Every piece of user
// content is rendered through esc() (or textContent) — names come from
// RSVP forms and walk-ins typing on this very page.

export const CHECKIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:,">
<title>COhere — door check-in</title>
<style>
  :root {
    --ground: #f4f4f1; --surface: #fff; --surface-2: #edeee9;
    --ink: #1c2723; --ink-2: #4a5854; --ink-3: #6b7873;
    --hair: #dcdcd4; --hair-strong: #c3c5bb;
    --teal: #16776f; --teal-soft: #d3e7e3; --clay: #b24d24; --clay-soft: #f2ded3;
    --sans: ui-sans-serif, system-ui, "Avenir Next", "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #14181a; --surface: #1a1f21; --surface-2: #232a2b;
      --ink: #e7eae7; --ink-2: #a9b4b0; --ink-3: #8d9a96;
      --hair: #2c3436; --hair-strong: #3d4749;
      --teal: #4cbfb1; --teal-soft: #1e3b39; --clay: #e08b60; --clay-soft: #3a2820;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--sans);
         font-size: 17px; line-height: 1.4; -webkit-font-smoothing: antialiased; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  .hidden { display: none !important; }
  main { max-width: 40rem; margin: 0 auto; padding: 0.75rem 0.75rem 6rem; display: flex; flex-direction: column; gap: 0.75rem; }
  header { position: sticky; top: 0; z-index: 2; background: var(--surface); border-bottom: 1px solid var(--hair);
           padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  header .top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  header h1 { font-size: 1rem; margin: 0; letter-spacing: -0.01em; }
  header a { color: var(--teal); font-size: 0.85rem; }
  select, input[type="search"], input[type="text"], input[type="email"] {
    width: 100%; min-height: 44px; padding: 0.55rem 0.7rem; border: 1px solid var(--hair-strong);
    border-radius: 6px; background: var(--ground); }
  .counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--hair);
            border: 1px solid var(--hair); border-radius: 6px; overflow: hidden; }
  .counts div { background: var(--surface); padding: 0.4rem 0.5rem; text-align: center; }
  .counts b { display: block; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
  .counts span { font-size: 0.75rem; color: var(--ink-3); }
  .banner { font-size: 0.85rem; padding: 0.5rem 0.7rem; border-radius: 6px; background: var(--clay-soft); color: var(--clay); }
  .banner.ok { background: var(--teal-soft); color: var(--teal); }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); margin: 0.6rem 0 0; font-weight: 600; }
  ul.people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .person { display: flex; align-items: center; gap: 0.5rem; background: var(--surface); border: 1px solid var(--hair);
            border-radius: 8px; padding: 0.35rem 0.35rem 0.35rem 0.75rem; min-height: 60px; }
  .person.in { border-color: var(--teal); background: var(--teal-soft); }
  .person .who { flex: 1; min-width: 0; }
  .person .who b { display: block; overflow-wrap: anywhere; font-weight: 600; }
  .person .who small { display: block; color: var(--ink-3); font-size: 0.8rem; overflow-wrap: anywhere; }
  .tap { min-width: 6.5rem; min-height: 52px; border-radius: 8px; border: 0; background: var(--teal); color: #fff;
         font-weight: 650; padding: 0 0.9rem; }
  .tap.undo { background: var(--surface); color: var(--ink-2); border: 1px solid var(--hair-strong); font-weight: 500; }
  .tag { font-size: 0.7rem; padding: 0.05rem 0.35rem; border-radius: 3px; background: var(--surface-2); color: var(--ink-2); margin-left: 0.25rem; }
  .tag.pending { background: var(--clay-soft); color: var(--clay); }
  .card { background: var(--surface); border: 1px solid var(--hair); border-radius: 8px; padding: 0.75rem;
          display: flex; flex-direction: column; gap: 0.55rem; }
  .card label.check { display: flex; gap: 0.6rem; align-items: center; min-height: 44px; }
  .card label.check input { width: 1.4rem; height: 1.4rem; }
  .primary { min-height: 52px; border-radius: 8px; border: 0; background: var(--teal); color: #fff; font-weight: 650; }
  .secondary { min-height: 44px; border-radius: 8px; border: 1px solid var(--hair-strong); background: var(--surface); }
  .muted { color: var(--ink-3); font-size: 0.85rem; }
  .err { color: var(--clay); font-size: 0.9rem; }
  .signin { text-align: center; padding: 3rem 1rem; }
  .signin a { display: inline-block; margin-top: 1rem; padding: 0.8rem 1.4rem; background: var(--teal); color: #fff;
              border-radius: 8px; text-decoration: none; font-weight: 650; }
  #toast { position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); background: var(--ink); color: var(--ground);
           padding: 0.6rem 1rem; border-radius: 999px; font-size: 0.9rem; max-width: 92vw; z-index: 5; }
</style>
</head>
<body>

<section id="signedout" class="signin hidden">
  <h1>Door check-in</h1>
  <p class="muted">Organizers only. Sign in to the member portal, then come back to this page.</p>
  <a href="/admin">Sign in</a>
</section>

<div id="app" class="hidden">
  <header>
    <div class="top">
      <h1>Door check-in</h1>
      <span><span class="muted" id="sync"></span> <a href="/admin">Portal</a></span>
    </div>
    <select id="event" aria-label="Event"></select>
    <div class="counts" aria-live="polite">
      <div><b id="n-in">0</b><span>checked in</span></div>
      <div><b id="n-expected">0</b><span>expected</span></div>
      <div><b id="n-walkins">0</b><span>walk-ins</span></div>
    </div>
    <input type="search" id="q" placeholder="Search name or email…" autocomplete="off" aria-label="Search">
  </header>

  <main>
    <div id="banner" class="banner hidden"></div>

    <h2 id="h-expected">Expected</h2>
    <ul class="people" id="expected"></ul>

    <h2 id="h-registrants" class="hidden">2026 registrants</h2>
    <ul class="people" id="registrants"></ul>

    <h2 id="h-others" class="hidden">Also here</h2>
    <ul class="people" id="others"></ul>

    <h2>Walk-in</h2>
    <form class="card" id="walkin" autocomplete="off">
      <input type="text" id="w-name" placeholder="Name" maxlength="200" aria-label="Walk-in name">
      <input type="email" id="w-email" placeholder="Email (optional)" maxlength="254" aria-label="Walk-in email" inputmode="email">
      <label class="check"><input type="checkbox" id="w-sub"> Add me to the COhere email list</label>
      <button type="submit" class="primary" id="w-go">Check in walk-in</button>
      <span class="err" id="w-err"></span>
    </form>

    <button class="secondary" id="export">Export check-ins (CSV)</button>
    <p class="muted">No email is sent to anyone on check-in. Check-ins are deleted 30 days after the event.</p>
  </main>
</div>

<div id="toast" class="hidden" role="status"></div>

<script>
(function () {
  var QUEUE_KEY = "cohere-checkin-queue-v1";
  var EVENT_KEY = "cohere-checkin-event";
  var events = [], current = null, roster = null, query = "", registrants = [], regFor = "";
  var queue = loadQueue(), flushing = false, signedOut = false;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }
  function evKey(e) { return e.did + "|" + e.rkey; }
  function evPath(e) { return "/api/admin/checkin/" + encodeURIComponent(e.did) + "/" + encodeURIComponent(e.rkey); }
  function toast(msg) {
    var t = el("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }

  var DENVER = { timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  function whenText(iso) {
    if (!iso) return "No date";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "No date";
    try { return new Intl.DateTimeFormat("en-US", DENVER).format(d); } catch (e) { return iso.slice(0, 16); }
  }

  function showSignedOut() {
    signedOut = true;
    el("app").classList.add("hidden");
    el("signedout").classList.remove("hidden");
  }

  // Resolves with the parsed body; rejects with {status, message}. status 0 = network.
  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    return fetch(path, options).then(function (r) {
      if (r.status === 401) { showSignedOut(); throw { status: 401, message: "signed out" }; }
      var type = r.headers.get("Content-Type") || "";
      var body = type.indexOf("json") !== -1 ? r.json() : r.text();
      return body.then(function (data) {
        if (!r.ok) throw { status: r.status, message: (data && data.error) || ("request failed: " + r.status) };
        return data;
      });
    }, function () { throw { status: 0, message: "offline" }; });
  }

  // ------------------------------------------------------------ the queue

  function loadQueue() {
    try { var q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); return Array.isArray(q) ? q : []; }
    catch (e) { return []; }
  }
  function saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) { /* private mode: memory only */ }
    renderSync();
  }
  function renderSync() {
    el("sync").textContent = queue.length ? queue.length + " waiting to sync" : "";
  }

  function flush() {
    if (flushing || !queue.length || signedOut) return;
    flushing = true;
    var op = queue[0];
    op.tried = true; saveQueue();         // it may land even if the reply is lost
    var req = op.type === "in"
      ? api(op.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op.body) })
      : api(op.path + "/" + encodeURIComponent(op.id), { method: "DELETE" });
    req.then(function (data) {
      queue.shift();
      // Another door phone may already have checked this person in under a
      // different id. Any undo queued during our retry must target that row.
      if (op.type === "in" && data && data.checkin) {
        queue.forEach(function (later) {
          if (later.type === "undo" && later.path === op.path && later.id === op.body.id) later.id = data.checkin.id;
        });
      }
      saveQueue();
      if (op.type === "in" && op.body.subscribe && data && data.subscribed === false) {
        toast("Checked in. They'd unsubscribed before, so they stay off the list.");
      }
      flushing = false;
      if (queue.length) flush(); else refresh();
    }, function (err) {
      flushing = false;
      if (err.status === 0 || err.status >= 500 || err.status === 429) {
        renderSync();
        setTimeout(flush, 4000);          // venue wifi: keep trying
        return;
      }
      if (err.status === 401) return;     // keeps the queue for after sign-in
      queue.shift(); saveQueue();          // a real refusal: drop it and say why
      toast("Not saved: " + err.message);
      refresh();
    });
  }
  window.addEventListener("online", flush);

  function enqueue(op) { queue.push(op); saveQueue(); render(); flush(); }

  // ------------------------------------------------------------- loading

  function loadEvents() {
    return api("/api/admin/checkin/events").then(function (data) {
      events = data.events || [];
      var saved = null;
      try { saved = sessionStorage.getItem(EVENT_KEY); } catch (e) { /* fine */ }
      var pick = (saved && events.some(function (e) { return evKey(e) === saved; })) ? saved : data.defaultKey;
      if (!pick && events.length) pick = evKey(events.filter(function (e) { return !e.isPast; })[0] || events[0]);
      el("event").innerHTML = events.map(function (e) {
        var label = (e.now ? "Now · " : e.today ? "Today · " : "") + whenText(e.startsAt) + " — " + e.name;
        return '<option value="' + esc(evKey(e)) + '"' + (evKey(e) === pick ? " selected" : "") + ">" + esc(label) + "</option>";
      }).join("") || '<option value="">No events on the calendar</option>';
      el("app").classList.remove("hidden");
      selectEvent(pick);
    }, function (err) {
      if (err.status === 401) return;
      el("app").classList.remove("hidden");
      banner("Couldn't load the calendar (" + err.message + "). Pull to refresh when you have signal.");
    });
  }

  function selectEvent(key) {
    current = events.filter(function (e) { return evKey(e) === key; })[0] || null;
    try { if (key) sessionStorage.setItem(EVENT_KEY, key); } catch (e) { /* fine */ }
    roster = null; registrants = []; regFor = "";
    render();
    refresh();
  }

  function refresh() {
    if (!current) return Promise.resolve();
    var want = evKey(current);
    return api(evPath(current)).then(function (data) {
      if (!current || evKey(current) !== want) return;
      roster = data;
      if (data.regenos && !data.regenos.ok) banner("regenOS isn't answering, so its RSVPs are missing from the list. Email RSVPs, search and walk-ins still work.");
      else if (data.eventGone) banner("This event is no longer on the calendar.");
      else banner("");
      render();
    }, function (err) {
      if (err.status === 401) return;
      banner(roster ? "Offline — showing the last list. Check-ins are saved on this phone and sync when you're back." :
        "Couldn't load the list (" + err.message + ").");
    });
  }
  setInterval(function () { if (!document.hidden && !queue.length) refresh(); }, 20000);

  function banner(msg) {
    el("banner").textContent = msg;
    el("banner").classList.toggle("hidden", !msg);
  }

  // ---------------------------------------------------------- rendering

  // Server state, then what this phone has queued on top of it.
  function view() {
    var expected = (roster ? roster.expected : []).map(function (x) {
      return { key: x.key, source: x.source, name: x.name, email: x.email, guestDid: x.guestDid, handle: x.handle,
               checkinId: x.checkinId, pending: false };
    });
    var others = (roster ? roster.others : []).map(function (c) {
      return { key: "c:" + c.id, source: c.source, name: c.name, email: c.email, guestDid: c.guest_did, handle: null,
               checkinId: c.id, pending: false };
    });
    var path = current ? evPath(current) : "";
    queue.forEach(function (op) {
      if (op.path !== path) return;
      if (op.type === "in") {
        var b = op.body;
        var hit = expected.filter(function (x) {
          return (b.email && x.email === b.email) || (b.guestDid && x.guestDid === b.guestDid);
        })[0];
        if (hit) { hit.checkinId = b.id; hit.pending = true; }
        else if (!others.some(function (o) { return o.checkinId === b.id || (b.email && o.email === b.email); })) {
          others.push({ key: "c:" + b.id, source: b.source, name: b.name, email: b.email, guestDid: null, handle: null,
                        checkinId: b.id, pending: true });
        }
      } else {
        expected.forEach(function (x) { if (x.checkinId === op.id) { x.checkinId = null; x.pending = false; } });
        others = others.filter(function (o) { return o.checkinId !== op.id; });
      }
    });
    return { expected: expected, others: others };
  }

  function matches(p) {
    if (!query) return true;
    return [p.name, p.email, p.handle].join(" ").toLowerCase().indexOf(query) !== -1;
  }

  var SOURCE = { rsvp_email: "email RSVP", rsvp_regenos: "regenOS", registrant: "registrant", walkin: "walk-in" };
  var lastView = { expected: [], others: [] };

  function row(p, list, i) {
    var title = p.name || p.handle || p.email || "Guest";
    var sub = [p.name && p.email ? p.email : "", p.name && p.handle ? "@" + p.handle : "", !p.name && !p.handle && !p.email && p.guestDid ? p.guestDid : ""]
      .filter(Boolean).join(" · ");
    var isIn = !!p.checkinId;
    return '<li class="person' + (isIn ? " in" : "") + '" data-testid="person">' +
      '<div class="who"><b>' + esc(title) + '<span class="tag">' + esc(SOURCE[p.source] || p.source) + "</span>" +
        (p.pending ? '<span class="tag pending">syncing</span>' : "") + "</b>" +
        (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" +
      (isIn
        ? '<button class="tap undo" data-list="' + list + '" data-i="' + i + '" data-act="undo" aria-label="Undo check-in for ' + esc(title) + '">Undo</button>'
        : '<button class="tap" data-list="' + list + '" data-i="' + i + '" data-act="in" aria-label="Check in ' + esc(title) + '">Check in</button>') +
      "</li>";
  }

  function render() {
    renderSync();
    var v = view();
    lastView = v;
    var inCount = v.expected.filter(function (x) { return x.checkinId; }).length + v.others.length;
    el("n-in").textContent = String(inCount);
    el("n-expected").textContent = String(v.expected.length);
    el("n-walkins").textContent = String(v.others.filter(function (o) { return o.source === "walkin"; }).length);

    var shown = v.expected.map(function (p, i) { return [p, i]; }).filter(function (t) { return matches(t[0]); });
    el("expected").innerHTML = roster
      ? (shown.length ? shown.map(function (t) { return row(t[0], "expected", t[1]); }).join("")
        : '<li class="muted">' + (query ? "Nobody on the RSVP list matches." : "No RSVPs for this event yet.") + "</li>")
      : '<li class="muted">' + (current ? "Loading…" : "Pick an event.") + "</li>";

    var others = v.others.map(function (p, i) { return [p, i]; }).filter(function (t) { return matches(t[0]); });
    el("h-others").classList.toggle("hidden", !others.length);
    el("others").innerHTML = others.map(function (t) { return row(t[0], "others", t[1]); }).join("");

    var known = {};
    v.expected.concat(v.others).forEach(function (p) { if (p.email) known[p.email] = true; });
    var regs = query.length >= 2 ? registrants.filter(function (r) { return !known[r.email]; }) : [];
    el("h-registrants").classList.toggle("hidden", !regs.length);
    el("registrants").innerHTML = regs.map(function (r) {
      return '<li class="person" data-testid="person"><div class="who"><b>' + esc(r.name || r.email) +
        '<span class="tag">registrant</span></b>' + (r.name ? "<small>" + esc(r.email) + "</small>" : "") + "</div>" +
        '<button class="tap" data-reg="' + esc(r.email) + '" aria-label="Check in ' + esc(r.name || r.email) + '">Check in</button></li>';
    }).join("");
    lastView.registrants = regs;
  }

  function checkIn(p) {
    if (!current) return;
    enqueue({ type: "in", path: evPath(current), body: {
      id: uuid(), source: p.source, email: p.email || null, guestDid: p.source === "rsvp_regenos" ? p.guestDid : null,
      name: p.name || p.handle || null, subscribe: !!p.subscribe,
      event: { name: current.name, startsAt: current.startsAt }
    } });
  }

  function undo(p) {
    if (!current || !p.checkinId) return;
    var path = evPath(current);
    // Never sent from this phone? Then undo is just forgetting it. Once a
    // send was attempted it may have landed, so undo goes to the server too.
    var idx = -1;
    queue.forEach(function (op, i) {
      if (op.type === "in" && op.body.id === p.checkinId && op.path === path && !op.tried) idx = i;
    });
    if (idx !== -1) { queue.splice(idx, 1); saveQueue(); render(); return; }
    enqueue({ type: "undo", path: path, id: p.checkinId });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    if (btn.hasAttribute("data-reg")) {
      var r = (lastView.registrants || []).filter(function (x) { return x.email === btn.getAttribute("data-reg"); })[0];
      if (r) { checkIn({ source: "registrant", email: r.email, name: r.name }); toast("Checked in " + (r.name || r.email)); }
      return;
    }
    var list = btn.getAttribute("data-list");
    if (!list) return;
    var p = lastView[list][Number(btn.getAttribute("data-i"))];
    if (!p) return;
    if (btn.getAttribute("data-act") === "in") { checkIn(p); toast("Checked in " + (p.name || p.handle || p.email || "guest")); }
    else undo(p);
  });

  var searchTimer = null;
  el("q").addEventListener("input", function (e) {
    query = e.target.value.trim().toLowerCase();
    render();
    clearTimeout(searchTimer);
    if (query.length < 2) { registrants = []; return; }
    searchTimer = setTimeout(function () {
      var asked = query;
      api("/api/admin/checkin/registrants?q=" + encodeURIComponent(asked)).then(function (data) {
        if (asked !== query) return;
        registrants = data.registrants || []; regFor = asked; render();
      }, function () { /* offline: the RSVP list still filters */ });
    }, 250);
  });

  el("event").addEventListener("change", function (e) { el("q").value = ""; query = ""; selectEvent(e.target.value); });

  el("walkin").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = el("w-name").value.trim(), email = el("w-email").value.trim().toLowerCase(), sub = el("w-sub").checked;
    el("w-err").textContent = "";
    if (!name && !email) { el("w-err").textContent = "Add a name or an email."; return; }
    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) { el("w-err").textContent = "That email doesn't look right."; return; }
    if (sub && !email) { el("w-err").textContent = "Joining the email list needs an email."; return; }
    checkIn({ source: "walkin", name: name || null, email: email || null, subscribe: sub });
    el("w-name").value = ""; el("w-email").value = ""; el("w-sub").checked = false;
    toast("Walk-in checked in" + (sub ? " and added to the list" : ""));
  });

  el("export").addEventListener("click", function () {
    if (!current) return;
    fetch(evPath(current) + "/export.csv", { credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) { showSignedOut(); throw new Error("signed out"); }
      if (!r.ok) throw new Error("export failed: " + r.status);
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "checkins-" + current.rkey.replace(/[^A-Za-z0-9._-]/g, "_") + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (err) { toast(err.message); });
  });

  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) {
    if (!r.ok) { showSignedOut(); return; }
    loadEvents();
    flush();
  }, function () {
    el("app").classList.remove("hidden");
    banner("No connection. Check-ins already on this phone will sync when you're back online.");
  });
})();
</script>
</body>
</html>`;
