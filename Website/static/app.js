// =====================================================================
// Saudi Tech Research Hub - Professional BI Dashboard Logic
// =====================================================================

// ---------------------------------------------------------------------
// Everything below is filled automatically from the data:
//   UNIS   -> universities found in research.final_dataset
//   YEARS  -> years found in research.final_dataset
//   FUNNEL -> cleaned / validated counts from research.source_stats
//   META   -> last update time and last quality check (research.quality_checks)
// A new university or year in the database shows up with no code change.
// ---------------------------------------------------------------------

// Display order for known universities. New ones are added after these.
const UNI_ORDER = ["KAUST", "KFUPM", "KSU", "KAU", "KKU", "PSAU"];

// Colours for universities that have no colour in style.css
const EXTRA_COLORS = ["#0891b2", "#65a30d", "#be123c", "#4f46e5", "#a16207", "#475569"];

let UNIS  = [...UNI_ORDER];
let YEARS = [2023, 2024, 2025, 2026];

// Cleaned / validated counts per university.
// Live: from research.source_stats (/api/stats). Offline: from the saved copy in data.js.
let FUNNEL = {};
for (const r of (window.SAVED_STATS || [])) FUNNEL[r.university] = { cleaned: r.cleaned, validated: r.validated };

// Last update time and last quality check. Live: /api/meta. Offline: data.js.
let META = window.SAVED_META || null;

const TOPIC_TERMS = {
  ml:    ["machine learning", "random forest"],
  dl:    ["deep learning"],
  ai:    ["artificial intelligence"],
  nn:    ["neural network", "neural networks", "ann modeling", "ann modelling", "multilayer perceptron"],
  iot:   ["iot", "internet of things"],
  sec:   ["cybersecurity", "cyber security", "intrusion detection", "cryptography", "information security"],
  bc:    ["blockchain"],
  cloud: ["edge computing", "cloud computing"],
  nlp:   ["natural language processing", "large language model", "large language models", "generative ai"],
  cv:    ["computer vision"],
  data:  ["big data", "data mining"],
  net:   ["wireless networks", "wireless network"],
  rob:   ["robot", "robots", "robotics"],
  se:    ["software engineering", "computer science"],
};
const TOPICS = Object.keys(TOPIC_TERMS);

const PER_PAGE = 10; // 10 papers per page as requested

let ROWS = [];          
let SOURCE = "";
let DB_ERROR = false;   // true when server.py runs but PostgreSQL did not answer        
let lang = "en";
let sel = null;         
const X = { q: "", uni: "", year: "", topic: "", page: 1, open: null };  

try { lang = localStorage.getItem("sth-lang") || "en"; } catch (e) {}

const T   = k => I18N[lang][k];
const fmt = n => Number(n).toLocaleString("en-US");
const $   = s => document.querySelector(s);
const col = u => {
  const extras = UNIS.filter(x => !UNI_ORDER.includes(x));
  const i = Math.max(0, extras.indexOf(u));
  return `var(--${u.toLowerCase()}, ${EXTRA_COLORS[i % EXTRA_COLORS.length]})`;
};
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byUni = u => ROWS.filter(r => !u || r.university === u);

const TERM_TO_TOPIC = {};
for (const [topic, terms] of Object.entries(TOPIC_TERMS)) terms.forEach(t => TERM_TO_TOPIC[t] = topic);
const TERM_REGEX = Object.keys(TERM_TO_TOPIC).map(t => [t, new RegExp(`(?<!\\w)${t}(?!\\w)`)]);

function findTerms(paper) {
  const text = `${paper.title || ""} ${paper.abstract || ""}`
    .toLowerCase()
    .replace(/[-_‐-―]/g, " ")
    .replace(/computer vision syndrome/g, " ")
    .replace(/\s+/g, " ");
  return TERM_REGEX.filter(([, re]) => re.test(text)).map(([t]) => t);
}

function prepare(rows) {
  return rows.map(r => {
    const terms = r.terms && r.terms.length ? r.terms : findTerms(r);
    return {
      ...r,
      publication_year: Number(r.publication_year),
      terms,
      topics: [...new Set(terms.map(t => TERM_TO_TOPIC[t]).filter(Boolean))],
      search: [r.title, r.authors, r.journal, r.doi].join(" ").toLowerCase(),
    };
  }).sort((a, b) => b.publication_year - a.publication_year || String(a.title).localeCompare(String(b.title)));
}

async function loadData() {
  try {
    if (!location.protocol.startsWith("http")) throw new Error("opened as a file");
    const res = await fetch("/api/papers/all");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      DB_ERROR = true;
      throw new Error(body.error || "server error " + res.status);
    }
    ROWS = prepare(await res.json());
    SOURCE = "live";
  } catch (err) {
    console.warn("Using saved data.js:", err.message);
    ROWS = prepare(window.SAVED_ROWS || []);
    SOURCE = "offline";
  }
  deriveLists();
}

// Universities and years come from the data itself.
function deriveLists() {
  const present = new Set(ROWS.map(r => r.university));
  UNIS = [
    ...UNI_ORDER.filter(u => present.has(u)),
    ...[...present].filter(u => !UNI_ORDER.includes(u)).sort(),
  ];
  YEARS = [...new Set(ROWS.map(r => r.publication_year))].sort((a, b) => a - b);
}

// Cleaned / validated counts per university from research.source_stats.
async function loadStats() {
  if (SOURCE !== "live") return;
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error("stats " + res.status);
    for (const r of await res.json()) {
      FUNNEL[r.university] = { cleaned: r.cleaned, validated: r.validated };
    }
  } catch (err) {
    console.warn("Using saved funnel numbers:", err.message);
  }
}

// Last load time and last quality check result.
async function loadMeta() {
  if (SOURCE !== "live") return;
  try {
    const res = await fetch("/api/meta");
    if (!res.ok) throw new Error("meta " + res.status);
    META = await res.json();
  } catch (err) {
    console.warn("Using saved meta:", err.message);
  }
}

const fmtDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const tip = $("#tip");
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + "px";
  tip.style.top = Math.max(8, y) + "px";
}
const hideTip = () => { tip.hidden = true; };

function renderHero() {
  $("#statPapers").textContent = fmt(ROWS.length);
  $("#statUnis").textContent = UNIS.length;
  const known = UNIS.filter(u => FUNNEL[u]);
  $("#statValidated").textContent = known.length ? fmt(known.reduce((s, u) => s + (FUNNEL[u].validated || 0), 0)) : "—";

  // Architecture section: universities and years come from the data
  const unis = [...new Set(ROWS.map(r => r.university))]
    .sort((a, b) => (UNIS.indexOf(a) + 1 || 99) - (UNIS.indexOf(b) + 1 || 99));
  const years = ROWS.map(r => r.publication_year);
  $("#srcList").textContent = unis.join(", ") || "…";
  $("#timeframe").textContent = years.length ? `${Math.min(...years)} - ${Math.max(...years)}` : "…";
  // Quality KPI and last update come from the pipeline tables
  const q = META && META.quality;
  $("#lastUpdate").textContent = fmtDate(META && (META.last_loaded || META.stats_updated));

  $("#srcBadge").classList.toggle("live", SOURCE === "live");
  $("#srcText").textContent =
    !SOURCE ? T("loading") :
    SOURCE === "live" ? T("live") :
    DB_ERROR ? T("dberr") :
    T("offline");
}

function renderChips() {
  const opts = [[null, T("all")], ...UNIS.map(u => [u, u])];
  $("#uniChips").innerHTML = opts.map(([u, label]) =>
    `<button class="chip" type="button" data-u="${u || ""}" aria-pressed="${sel === u}">
       ${u ? `<i class="dot" style="background:${col(u)}"></i>` : ""}${esc(label)}
     </button>`).join("");
  $("#uniChips").querySelectorAll(".chip").forEach(b => b.onclick = () => setSel(b.dataset.u || null));
}

function topTopic(rows) {
  const c = {};
  rows.forEach(r => r.topics.forEach(t => c[t] = (c[t] || 0) + 1));
  const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  return best ? T("topic")[best] : "—";
}

function renderCards() {
  const total = ROWS.length || 1;
  $("#uniCards").innerHTML = UNIS.map(u => {
    const rs = byUni(u), n = rs.length;
    const ys = [...new Set(rs.map(r => r.publication_year))].sort();
    return `<button class="uni" type="button" data-u="${u}" aria-pressed="${sel === u}" style="--c:${col(u)}">
      <div class="top">
        <div class="uni-logo-wrapper">
           <img src="${(window.UNI_LOGOS || {})[u] || u + ".png"}" alt="${u} Logo" class="uni-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';">
           <div class="uni-logo-fallback" style="display:none; background:${col(u)};">${u.charAt(0)}</div>
           <span class="code">${u}</span>
        </div>
      </div>
      <div class="big">${fmt(n)}<small>${T("papers")} · ${Math.round(n / total * 100)}% ${T("share")}</small></div>
      <div class="share"><i style="width:${n / total * 100}%"></i></div>
      <dl>
        <dt>${T("years_active")}</dt><dd class="num">${ys.length ? ys[0] + "–" + ys[ys.length - 1] : "—"}</dd>
        <dt>${T("top_domain")}</dt><dd>${esc(topTopic(rs))}</dd>
      </dl>
    </button>`;
  }).join("");
  $("#uniCards").querySelectorAll(".uni").forEach(b => b.onclick = () => setSel(sel === b.dataset.u ? null : b.dataset.u));
}

function renderYear() {
  const unis = sel ? [sel] : UNIS;
  const data = YEARS.map(y => {
    const parts = unis.map(u => ({ u, n: ROWS.filter(r => r.university === u && r.publication_year === y).length }));
    return { y, parts, t: parts.reduce((s, p) => s + p.n, 0) };
  });
  const max = Math.max(1, ...data.map(d => d.t));
  const step = max > 1000 ? 400 : max > 400 ? 100 : max > 100 ? 50 : max > 40 ? 20 : 10;
  const top = Math.ceil(max / step) * step;

  const W = Math.max(300, Math.min(640, $("#yearChart").clientWidth || 560));
  const H = W < 420 ? 240 : 280, L = 44, R = 8, Tp = 22, B = 30;
  const iw = W - L - R, ih = H - Tp - B, slot = iw / YEARS.length;
  const bw = Math.min(72, slot * 0.52), gap = 2;
  const ys = v => Tp + ih - v / top * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let v = 0; v <= top; v += step) {
    s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}"/>
          <text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  data.forEach((d, i) => {
    const cx = L + slot * (i + 0.5), x = cx - bw / 2;
    const vis = d.parts.filter(p => p.n > 0);
    let acc = 0;
    s += `<g class="col" data-k="${i}">`;
    vis.forEach((p, j) => {
      const y1 = ys(acc + p.n), y0 = ys(acc);
      acc += p.n;
      const h = Math.max(1, y0 - y1 - (j > 0 ? gap : 0));
      if (j === vis.length - 1 && h > 4) {   
        const r = 4;
        s += `<path class="seg" fill="${col(p.u)}" d="M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y1 + h} Z"/>`;
      } else {
        s += `<rect class="seg" fill="${col(p.u)}" x="${x}" y="${y1}" width="${bw}" height="${h}"/>`;
      }
    });
    s += `<text class="tot" x="${cx}" y="${ys(d.t) - 7}" text-anchor="middle">${fmt(d.t)}</text>
          <text x="${cx}" y="${H - 8}" text-anchor="middle">${d.y}</text>
          <rect class="hit" x="${cx - slot / 2}" y="${Tp}" width="${slot}" height="${ih}"/></g>`;
  });
  s += `</svg>`;

  const el = $("#yearChart");
  el.innerHTML = s;
  el.querySelectorAll(".col").forEach(g => {
    const d = data[+g.dataset.k];
    const html = `<div class="h">${d.y}</div>` +
      d.parts.map(p => `<div class="r"><span><i class="dot" style="background:${col(p.u)}"></i>${p.u}</span><span>${fmt(p.n)}</span></div>`).join("") +
      (d.parts.length > 1 ? `<div class="r" style="margin-top:4px;opacity:.8"><span>${T("total")}</span><span>${fmt(d.t)}</span></div>` : "");
    g.onmousemove = e => showTip(html, e);
    g.onmouseleave = hideTip;
  });
  $("#yearLegend").innerHTML = sel ? "" :
    UNIS.map(u => `<span><i class="dot" style="background:${col(u)}"></i>${u}</span>`).join("");
}

function hbars(el, items, color) {
  const max = Math.max(1, ...items.map(i => i.n));
  el.innerHTML = items.map(i => `
    <div class="hb">
      <span class="lbl">${esc(i.label)}</span>
      <span class="trk"><i style="width:${i.n / max * 100}%;--bc:${color}"></i></span>
      <span class="val">${fmt(i.n)}</span>
    </div>`).join("");
}

function renderTopics() {
  const c = {};
  byUni(sel).forEach(r => r.topics.forEach(t => c[t] = (c[t] || 0) + 1));
  const items = TOPICS.filter(k => c[k])
    .map(k => ({ label: T("topic")[k], n: c[k] }))
    .sort((a, b) => b.n - a.n).slice(0, 5); // تم التخفيض إلى 5 كما هو مطلوب في الـ Dashboard
  hbars($("#topicBars"), items, sel ? col(sel) : "var(--bar)");
}

function renderJournals() {
  const c = {};
  byUni(sel).forEach(r => {
    if (r.journal) { const k = r.journal.trim().toUpperCase(); c[k] = (c[k] || 0) + 1; }
  });
  const items = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, n]) => ({ label, n }));
  hbars($("#journalBars"), items, sel ? col(sel) : "var(--bar)");
}

function renderFunnel() {
  $("#funnelBody").innerHTML = UNIS.map(u => {
    const t = byUni(u).length;
    const has = !!FUNNEL[u];                                // no stats yet -> show "—"
    const f = FUNNEL[u] || { cleaned: t, validated: t };
    const c = f.cleaned || 1;
    const dim = sel && sel !== u ? ' style="opacity:.4"' : "";
    return `<tr${dim}>
      <td><span class="pill"><i class="dot" style="background:${col(u)}"></i>${u}</span></td>
      <td class="n">${has ? fmt(c) : "—"}</td><td class="n">${has ? fmt(f.validated) : "—"}</td><td class="n" style="color:var(--accent)"><b>${fmt(t)}</b></td></tr>`;
  }).join("");
}

function setSel(u) { sel = u; renderDash(); }
function renderDash() { renderChips(); renderCards(); renderYear(); renderTopics(); renderJournals(); renderFunnel(); }

function fillSelects() {
  $("#q").placeholder = T("search");
  $("#fUni").innerHTML = `<option value="">${T("all")}</option>` + UNIS.map(u => `<option value="${u}">${u}</option>`).join("");
  $("#fYear").innerHTML = `<option value="">${T("allYears")}</option>` + YEARS.map(y => `<option value="${y}">${y}</option>`).join("");
  $("#fTopic").innerHTML = `<option value="">${T("allTopics")}</option>` + TOPICS.map(k => `<option value="${k}">${esc(T("topic")[k])}</option>`).join("");
  $("#fUni").value = X.uni; $("#fYear").value = X.year; $("#fTopic").value = X.topic;
}

function filtered() {
  const words = X.q.toLowerCase().split(/\s+/).filter(Boolean);
  return ROWS.filter(r =>
    (!X.uni   || r.university === X.uni) &&
    (!X.year  || r.publication_year === +X.year) &&
    (!X.topic || r.topics.includes(X.topic)) &&
    words.every(w => r.search.includes(w)));
}

function shortAuthors(a) {
  if (!a) return "";
  const p = a.split(/;\s*/);
  return p.length > 4 ? p.slice(0, 4).join("; ") + " et al." : a;
}

function renderList() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (X.page > pages) X.page = pages;
  const slice = list.slice((X.page - 1) * PER_PAGE, X.page * PER_PAGE);

  $("#xcount").textContent = T("showing")(fmt(list.length), fmt(ROWS.length));
  $("#pinfo").textContent = T("page")(X.page, pages);
  $("#prev").disabled = X.page <= 1;
  $("#next").disabled = X.page >= pages;
  $("#xclear").hidden = !(X.q || X.uni || X.year || X.topic);

  if (!slice.length) { $("#xlist").innerHTML = `<div class="empty">${T("empty")}</div>`; return; }

  $("#xlist").innerHTML = slice.map(r => {
    const open = X.open === r.research_id;
    const detail = !open ? "" : `
      <div class="detail">
        <p class="abs">${r.abstract ? esc(r.abstract) : `<span style="color:var(--muted)">${T("noAbs")}</span>`}</p>
        <div class="kv">
          ${r.journal ? `<span>${T("journal")}: <b>${esc(r.journal)}</b></span>` : ""}
          <span>${T("doi")}: <a class="mono" href="https://doi.org/${esc(r.doi)}" target="_blank" rel="noopener">${esc(r.doi)}</a></span>
          <span>${T("src")}: <b>${esc(r.source)}</b></span>
        </div>
        ${r.terms.length ? `<div class="kv"><span>${T("kw")}:</span><span class="kw">${r.terms.map(k => `<span>${esc(k)}</span>`).join("")}</span></div>` : ""}
      </div>`;
    return `<div class="item">
      <button type="button" data-row="${esc(r.research_id)}" aria-expanded="${open}">
        <span class="t">${esc(r.title)}</span>
        <span class="side"><span class="pill"><i class="dot" style="background:${col(r.university)}"></i>${r.university}</span><span class="yr">${r.publication_year}</span></span>
        <span class="a">${esc(shortAuthors(r.authors))}</span>
      </button>${detail}</div>`;
  }).join("");

  $("#xlist").querySelectorAll(".item>button").forEach(b => b.onclick = () => {
    X.open = X.open === b.dataset.row ? null : b.dataset.row;
    renderList();
  });
}

function resetPage() { X.page = 1; X.open = null; renderList(); }

let typing;
$("#q").addEventListener("input", e => { clearTimeout(typing); typing = setTimeout(() => { X.q = e.target.value.trim(); resetPage(); }, 150); });
$("#fUni").onchange   = e => { X.uni = e.target.value; resetPage(); };
$("#fYear").onchange  = e => { X.year = e.target.value; resetPage(); };
$("#fTopic").onchange = e => { X.topic = e.target.value; resetPage(); };
$("#prev").onclick = () => { X.page--; X.open = null; renderList(); $("#explorer").scrollIntoView(); };
$("#next").onclick = () => { X.page++; X.open = null; renderList(); $("#explorer").scrollIntoView(); };
$("#xclear").onclick = () => {
  Object.assign(X, { q: "", uni: "", year: "", topic: "", page: 1, open: null });
  $("#q").value = "";
  fillSelects();
  renderList();
};

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  
  // every element with data-i="key" takes its text from i18n.js
  document.querySelectorAll("[data-i]").forEach(el => {
    const v = I18N[lang][el.dataset.i];
    if (typeof v !== "string") return;
    if (el.hasAttribute("data-html")) el.innerHTML = v; else el.textContent = v;
  });
  
  const langBtn = $("#langBtn");
  if (langBtn) langBtn.textContent = lang === "en" ? "العربية" : "English";
  
  fillSelects();
  renderHero();
  renderDash();
  renderList();
}

$("#langBtn").onclick = () => {
  lang = lang === "en" ? "ar" : "en";
  try { localStorage.setItem("sth-lang", lang); } catch (e) {}
  applyLang();
};

let resizing;
addEventListener("resize", () => { clearTimeout(resizing); resizing = setTimeout(renderYear, 150); });

applyLang();                          
loadData().then(loadStats).then(loadMeta).then(applyLang);           

// background particles: see particles.js (they follow the theme on their own)

// ---------------- dark / light switch ----------------
$("#themeBtn").onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("diraya-theme", next); } catch (e) {}
};

