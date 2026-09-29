/* ============================================================
 * My AI Base — a fully local, API-free AI web app
 * Brain: open-source LLMs running in the browser via WebLLM
 * Tools: Wikipedia search, OpenStreetMap places, document
 *        summarization, email drafting, code writing
 * ============================================================ */
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const LS_SET = "aibase.settings.v1";
const LS_CHAT = "aibase.chat.v1";

const $ = (id) => document.getElementById(id);
const chatEl = $("chat"), inputEl = $("input"), sendEl = $("send");

let engine = null;
let busy = false;
let mode = null;           // active tool mode: search|place|doc|email|code
let docText = null;         // loaded document
let docName = "";
let history = [];           // {role, content}
let settings = { modelId: null, persona: "" };
const loadState = { loading: false };

/* ---------------- persistence ---------------- */
function loadAll() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SET) || "{}");
    if (s.modelId) settings.modelId = s.modelId;
    if (s.persona) settings.persona = s.persona;
  } catch (e) {}
  try { history = JSON.parse(localStorage.getItem(LS_CHAT) || "[]"); } catch (e) {}
  $("persona").value = settings.persona;
  if (history.length) {
    history.forEach((m) => addMsg(m.role, m.content));
  }
}
function persist() {
  localStorage.setItem(LS_SET, JSON.stringify(settings));
}
function persistChat() {
  try { localStorage.setItem(LS_CHAT, JSON.stringify(history)); } catch (e) {}
}
function done() { busy = false; sendEl.disabled = false; }

/* ---------------- UI helpers ---------------- */
function esc(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}
function fmt(text) {
  let h = esc(text);
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) =>
    "<pre><button class='copybtn' data-copy>copy</button><code>" + c.replace(/\n$/, "") + "</code></pre>");
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  return h;
}
function addMsg(role, text, opts = {}) {
  const w = $("welcome");
  if (w) w.style.display = "none";
  const d = document.createElement("div");
  d.className = "msg " + (role === "user" ? "user" : "bot") + (opts.error ? " error" : "");
  d.innerHTML = fmt(text);
  if (opts.meta) {
    const m = document.createElement("span");
    m.className = "meta";
    m.textContent = opts.meta;
    d.appendChild(m);
  }
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
  return d;
}
function addCard(title) {
  const w = $("welcome");
  if (w) w.style.display = "none";
  const c = document.createElement("div");
  c.className = "card";
  const h = document.createElement("h3");
  h.textContent = title;
  c.appendChild(h);
  chatEl.appendChild(c);
  chatEl.scrollTop = chatEl.scrollHeight;
  return c;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function setStatus(cls, text) {
  $("statusDot").className = "dot " + cls;
  $("statusText").textContent = text;
}
function typingBubble() {
  const d = document.createElement("div");
  d.className = "msg bot";
  d.innerHTML = "<span class='typing'><span></span><span></span><span></span></span>";
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
  return d;
}

/* ---------------- model loading ---------------- */
function pickDefault(list) {
  const prefs = [/Llama-3\.2-1B-Instruct-q4f32/, /Llama-3\.2-1B.*q4f16/,
    /Qwen2\.5-0\.5B-Instruct-q4f16/, /Qwen2\.5-1\.5B-Instruct-q4f16/];
  for (const p of prefs) {
    const hit = list.find((m) => p.test(m.model_id));
    if (hit) return hit.model_id;
  }
  return list.length ? list[0].model_id : "";
}

function shortName(id) {
  return (id || "").replace(/-Instruct.*/, "");
}
function populateModels() {
  let list = [];
  try { list = webllm.prebuiltAppConfig.model_list || []; } catch (e) {}
  list = list.filter((m) => m.model_id && !/embedding/i.test(m.model_id));
  list.sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0));
  const sel = $("modelSel");
  const optgroup = document.createElement("optgroup");
  list.forEach((m) => {
    const o = document.createElement("option");
    const gb = m.vram_required_MB ? (m.vram_required_MB / 1024).toFixed(1) + " GB" : "";
    o.value = m.model_id;
    o.textContent = m.model_id.replace(/-q4f(16|32)_1-MLC/, "") + (gb ? "  (~" + gb + ")" : "");
    optgroup.appendChild(o);
  });
  sel.appendChild(optgroup);
  const def = settings.modelId && list.some((m) => m.model_id === settings.modelId)
    ? settings.modelId : pickDefault(list);
  sel.value = def;
  setStatus(engine ? "ok" : "", shortName(def));
}

async function loadModel(modelId) {
  if (loadState.loading) return;
  loadState.loading = true;
  $("loadBtn").disabled = true;
  $("progwrap").classList.add("show");
  setStatus("load", "loading…");
  try {
    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (r) => {
        const pct = Math.round((r.progress || 0) * 100);
        $("progfill").style.width = pct + "%";
        $("progtext").textContent = r.text ? r.text.slice(0, 140) : pct + "%";
      },
    });
    settings.modelId = modelId;
    persist();
    setStatus("ok", shortName(modelId));
    toast("Ready ✓");
  } catch (err) {
    setStatus("err", "error");
    addMsg("assistant", "⚠ Model load failed: " + (err.message || err) +
      "\n\nTry a smaller model (Llama-3.2-1B / Qwen2.5-0.5B), close other tabs, or use Chrome/Edge.", { error: true });
  } finally {
    loadState.loading = false;
    $("loadBtn").disabled = false;
    setTimeout(() => $("progwrap").classList.remove("show"), 1500);
  }
}

/* ---------------- LLM generation ---------------- */
async function llm(messages, onUpdate, maxTokens = 1024) {
  const chunks = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.7, max_tokens: maxTokens,
  });
  let full = "";
  for await (const ch of chunks) {
    const piece = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content;
    if (piece) { full += piece; onUpdate && onUpdate(full); }
  }
  return full;
}

function systemPrompt() {
  const parts = [
    "You are My AI Base, a helpful, friendly all-round assistant running locally in the user's browser.",
    "Reply in the SAME language and script the user writes in (Malayalam, Hindi, Tamil, English, Hinglish, etc.).",
  ];
  if (settings.persona) parts.push(settings.persona);
  if (mode === "code" || /\/code\b/i.test(lastUserText || "")) {
    parts.push("The user wants code. Give complete, working, well-commented code in fenced blocks with the language name.");
  }
  parts.push("Be clear and concise. Use **bold** and code blocks where helpful.");
  return parts.join(" ");
}
let lastUserText = "";

/* ---------------- TOOL: web search (Wikipedia) ---------------- */
async function wikiSearch(query, lang) {
  const langs = lang ? [lang] : ["en", "ml", "hi"];
  for (const L of langs) {
    try {
      const u1 = "https://" + L + ".wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
        encodeURIComponent(query) + "&srlimit=3&format=json&origin=*";
      const r1 = await fetch(u1);
      if (!r1.ok) continue;
      const j1 = await r1.json();
      const hits = (j1.query && j1.query.search) || [];
      if (!hits.length) continue;
      const titles = hits.map((h) => h.title).join("|");
      const u2 = "https://" + L + ".wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1" +
        "&titles=" + encodeURIComponent(titles) + "&format=json&origin=*";
      const r2 = await fetch(u2);
      const j2 = await r2.json();
      const pages = j2.query && j2.query.pages ? Object.values(j2.query.pages) : [];
      const results = pages.filter((p) => p.extract).map((p) => ({
        title: p.title,
        extract: p.extract.slice(0, 1200),
        url: "https://" + L + ".wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")),
        lang: L,
      }));
      if (results.length) return results;
    } catch (e) { /* try next language */ }
  }
  return [];
}

async function doSearch(query) {
  if (!engine) return noModel();
  const t = typingBubble();
  t.innerHTML = "Searching…";
  const results = await wikiSearch(query);
  if (!results.length) {
    t.remove();
    addMsg("assistant", "No results for \"" + query + "\".", { error: true });
    done();
    return;
  }
  t.innerHTML = "Reading…";
  const ctx = results.map((r, i) => "[" + (i + 1) + "] " + r.title + ": " + r.extract).join("\n\n");
  const msgs = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: "Web search results for \"" + query + "\":\n\n" + ctx +
      "\n\nUsing these results, answer the user's query. Reply in the user's language. Cite sources as [1], [2]." },
  ];
  t.innerHTML = "";
  const full = await llm(msgs, (txt) => { t.innerHTML = fmt(txt); chatEl.scrollTop = chatEl.scrollHeight; }, 900);
  attachSources(t, results);
  finishBot(t, full);
}

function attachSources(el, results) {
  const box = document.createElement("div");
  box.className = "srcbox";
  box.appendChild(document.createTextNode("Sources:"));
  results.forEach((r) => {
    const line = document.createElement("div");
    const a = document.createElement("a");
    a.href = r.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = r.title + " (" + r.lang + ".wikipedia)";
    line.appendChild(a);
    box.appendChild(line);
  });
  el.appendChild(box);
}
function finishBot(el, full) {
  const m = document.createElement("span");
  m.className = "meta";
  m.textContent = "local AI";
  el.appendChild(m);
  history.push({ role: "assistant", content: full });
  persistChat();
  chatEl.scrollTop = chatEl.scrollHeight;
  done();
}

/* ---------------- TOOL: places (OpenStreetMap) ---------------- */
async function doPlaces(query) {
  const t = typingBubble();
  t.innerHTML = "Searching…";
  try {
    const u = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(query) +
      "&format=json&limit=5&addressdetails=1";
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    const places = await r.json();
    t.remove();
    if (!places.length) {
      addMsg("assistant", "No places found.", { error: true });
      return;
    }
    const card = addCard("📍 " + places.length + " place(s) — " + query);
    places.forEach((p) => {
      const it = document.createElement("div");
      it.className = "item";
      const b = document.createElement("b");
      b.textContent = (p.name || "Place") + (p.type ? "  ·  " + p.type : "");
      const small = document.createElement("div");
      small.className = "small";
      small.textContent = p.display_name;
      const a = document.createElement("a");
      a.href = "https://www.openstreetmap.org/?mlat=" + p.lat + "&mlon=" + p.lon + "#map=15/" + p.lat + "/" + p.lon;
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "🗺 View on map";
      it.appendChild(b); it.appendChild(small); it.appendChild(a);
      card.appendChild(it);
    });
    history.push({ role: "assistant", content: "Places for \"" + query + "\": " +
      places.map((p) => p.display_name).join(" | ") });
    persistChat();
  } catch (err) {
    t.remove();
    addMsg("assistant", "⚠ " + (err.message || err), { error: true });
  }
  done();
}

/* ---------------- TOOL: document summary ---------------- */
function chunkText(text, size = 3500) {
  const paras = text.split(/\n{2,}/);
  const out = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + p).length > size && cur) { out.push(cur); cur = ""; }
    cur += p + "\n\n";
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function doDocSummary() {
  if (!docText) {
    addMsg("assistant", "Load a document first (📄).", { error: true });
    return;
  }
  const t = typingBubble();
  t.innerHTML = "Reading…";
  const chunks = chunkText(docText).slice(0, 6);
  const partSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    t.innerHTML = "Summarizing " + (i + 1) + "/" + chunks.length + "…";
    const s = await llm([
      { role: "system", content: "You summarize documents. Reply in the user's language." },
      { role: "user", content: "Summarize this part in 3-4 bullet points (- ):\n\n" + chunks[i].slice(0, 3500) },
    ], null, 400);
    partSummaries.push(s);
  }
  let final;
  if (partSummaries.length > 1) {
    t.innerHTML = "Reading…";
    final = await llm([
      { role: "system", content: "You summarize documents. Reply in the user's language." },
      { role: "user", content: "Combine these section summaries into one clear summary with the key points:\n\n" +
        partSummaries.join("\n\n") },
    ], (txt) => { t.innerHTML = fmt(txt); chatEl.scrollTop = chatEl.scrollHeight; }, 700);
  } else {
    final = partSummaries[0] || "(empty)";
    t.innerHTML = "";
  }
  t.innerHTML = fmt(final);
  finishBot(t, final);
}

async function handleDocFile(file) {
  docName = file.name;
  docText = await file.text();
  const card = addCard("📄 " + docName);
  const info = document.createElement("div");
  info.className = "small";
  info.style.color = "var(--muted)";
  info.textContent = docText.length.toLocaleString() + " characters — summarize or ask anything";
  const row = document.createElement("div");
  row.className = "btnrow";
  const b1 = document.createElement("button");
  b1.className = "btn primary";
  b1.textContent = "Summarize now";
  b1.onclick = () => { sendMessage("/summarize"); };
  const b2 = document.createElement("button");
  b2.className = "btn";
  b2.textContent = "Clear document";
  b2.onclick = () => { docText = null; card.remove(); toast("Document cleared"); };
  row.appendChild(b1); row.appendChild(b2);
  card.appendChild(info); card.appendChild(row);
}

/* ---------------- TOOL: email draft ---------------- */
async function doEmail(requestText) {
  if (!engine) return noModel();
  const t = typingBubble();
  t.innerHTML = "Drafting…";
  let raw = "";
  try {
    raw = await llm([
      { role: "system", content: "You write professional email drafts. Reply ONLY with JSON, no markdown: " +
        '{"subject": "...", "body": "..."}. Write the email in the language of the request.' },
      { role: "user", content: "Draft an email for this request: " + requestText },
    ], null, 700);
  } catch (err) {
    t.remove();
    addMsg("assistant", "⚠ " + (err.message || err), { error: true });
    done();
    return;
  }
  t.remove();
  let data = null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(m ? m[0] : raw);
  } catch (e) {}
  if (!data || !data.body) {
    addMsg("assistant", raw || "(empty)");
    history.push({ role: "assistant", content: raw });
    persistChat(); done();
    return;
  }
  const card = addCard("✉️ Email draft");
  const subj = document.createElement("div");
  subj.className = "item";
  subj.innerHTML = "<b>Subject</b>";
  const subjText = document.createElement("div");
  subjText.textContent = data.subject || "(no subject)";
  subj.appendChild(subjText);
  const body = document.createElement("div");
  body.className = "item";
  body.innerHTML = "<b>Body</b>";
  const ta = document.createElement("textarea");
  ta.value = data.body;
  body.appendChild(ta);
  const row = document.createElement("div");
  row.className = "btnrow";
  const open = document.createElement("button");
  open.className = "btn primary";
  open.textContent = "Open in email app";
  open.onclick = () => {
    window.location.href = "mailto:?subject=" + encodeURIComponent(data.subject || "") +
      "&body=" + encodeURIComponent(ta.value);
  };
  const copy = document.createElement("button");
  copy.className = "btn";
  copy.textContent = "Copy text";
  copy.onclick = () => { navigator.clipboard.writeText(ta.value); toast("Copied ✓"); };
  row.appendChild(open); row.appendChild(copy);
  card.appendChild(subj); card.appendChild(body); card.appendChild(row);
  history.push({ role: "assistant", content: "Email draft — Subject: " + (data.subject || "") + "\n" + data.body });
  persistChat();
  done();
}

/* ---------------- routing ---------------- */
function noModel() {
  addMsg("assistant", "Load a model first — ⚙ → Load.", { error: true });
  $("modelPanel").classList.add("open");
  $("overlay").classList.add("open");
  done();
}

async function send(text) {
  if (!text || busy) return;
  busy = true; sendEl.disabled = true;
  addMsg("user", text);
  try {
    const cmd = text.match(/^\/(\w+)\s*(.*)$/);

    if (cmd && ["search", "web"].includes(cmd[1])) return await doSearch(cmd[2] || text);
    if (cmd && cmd[1] === "place") return await doPlaces(cmd[2] || text);
    if (cmd && cmd[1] === "email") return await doEmail(cmd[2] || text);
    if (cmd && cmd[1] === "summarize") return await doDocSummary();
    if (cmd && cmd[1] === "help") {
      addMsg("assistant",
        "`/search` · `/place` · `/email` · `/summarize`\nToolbar buttons do the same.");
      done();
      return;
    }
    // "search:" / "place:" natural prefixes and active mode
    if (/^place\s*:/i.test(text) || (mode === "place" && !cmd)) {
      return await doPlaces(text.replace(/^place\s*:/i, "").trim() || text);
    }
    if (/^search\s*:/i.test(text) || (mode === "search" && !cmd)) {
      return await doSearch(text.replace(/^search\s*:/i, "").trim() || text);
    }
    if (mode === "email" && !cmd) return await doEmail(text);

    // ---- plain LLM chat ----
    if (!engine) return noModel();
    lastUserText = text;
    history.push({ role: "user", content: text });
    persistChat();
    const t = typingBubble();
    t.innerHTML = "";
    const msgs = [{ role: "system", content: systemPrompt() }];
    if (docText) msgs.push({ role: "system", content: "The user has loaded this document (" + docName + "). Use it when relevant:\n" + docText.slice(0, 3000) });
    msgs.push(...history.slice(-20));
    const full = await llm(msgs, (txt) => { t.innerHTML = fmt(txt); chatEl.scrollTop = chatEl.scrollHeight; });
    finishBot(t, full);
  } catch (err) {
    addMsg("assistant", "⚠ " + (err.message || err), { error: true });
    done();
  }
}

function sendMessage(text) { send(text); }

/* ---------------- event wiring ---------------- */
sendEl.addEventListener("click", () => {
  const t = inputEl.value.trim();
  inputEl.value = ""; autoGrow();
  send(t);
});
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendEl.click(); }
});
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}
inputEl.addEventListener("input", autoGrow);

document.querySelectorAll(".chip").forEach((c) =>
  c.addEventListener("click", () => send(c.textContent.trim())));

document.querySelectorAll(".tool").forEach((btn) =>
  btn.addEventListener("click", () => {
    const tool = btn.dataset.tool;
    if (tool === "doc") {
      $("fileInput").click();
      return;
    }
    if (mode === tool) { mode = null; btn.classList.remove("on"); }
    else {
      mode = tool;
      document.querySelectorAll(".tool").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    }

  }));

$("fileInput").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) handleDocFile(f);
  e.target.value = "";
});

function openPanel() { $("modelPanel").classList.add("open"); $("overlay").classList.add("open"); }
function closePanel() { $("modelPanel").classList.remove("open"); $("overlay").classList.remove("open"); }
$("openPanel").addEventListener("click", openPanel);
$("modelChip").addEventListener("click", openPanel);
$("closePanel").addEventListener("click", closePanel);
$("overlay").addEventListener("click", closePanel);

$("loadBtn").addEventListener("click", () => loadModel($("modelSel").value));
$("modelSel").addEventListener("change", () => {
  if (engine) toast("Press Load to switch");
});
$("savePersona").addEventListener("click", () => {
  settings.persona = $("persona").value.trim();
  persist();
  toast("Saved ✓");
});

$("newChat").addEventListener("click", () => {
  if (busy && !confirm("Still generating. Start a new chat anyway?")) return;
  history = []; docText = null;
  persistChat();
  chatEl.innerHTML = "";
  location.reload();
});

// copy buttons for code blocks (event delegation)
chatEl.addEventListener("click", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("copybtn")) {
    const code = e.target.parentElement.querySelector("code");
    if (code) { navigator.clipboard.writeText(code.textContent); e.target.textContent = "copied ✓"; }
  }
});

/* ---------------- boot ---------------- */
if (!navigator.gpu) {
  const n = $("notice");
  n.classList.add("show");
  n.textContent = "WebGPU not available — use Chrome or Edge.";
}
populateModels();
loadAll();
