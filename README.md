# My AI Base 🧠

A **100% local, API-free AI assistant** that runs entirely in your browser.
Open-source AI models (Llama, Qwen, etc.) are downloaded once and executed
locally using **WebGPU** — no API keys, no server, no monthly cost, and your
conversations never leave your device.

## ✨ Features

| Feature | How it works |
|---|---|
| 💬 Local AI chat | Open-source LLMs run in-browser via [WebLLM](https://github.com/mlc-ai/web-llm) |
| 💻 Code writing | Ask for code in any language — copy button on every code block |
| 🔍 Web search | Wikipedia API (English, Malayalam, Hindi) with cited sources |
| 📍 Places | OpenStreetMap Nominatim search with map links |
| 📄 Document summary | Upload .txt/.md/.csv and get map-reduce summaries |
| ✉️ Email drafts | AI drafts the mail, opens it in your email app |
| 🌍 Multi-language | Replies in whatever language/script you write in |

## 🚀 How to run

1. Open the site in **Chrome or Edge** (WebGPU required).
2. Click **⚙ Model**, choose a small model (e.g. `Llama-3.2-1B-Instruct` ~ 700 MB),
   press **Load** — the download happens once and is cached by the browser.
3. Chat! Use the toolbar buttons or slash commands:
   - `/search topic` — web search
   - `/place name` — find places
   - `/email describe` — draft an email
   - `/summarize` — summarize the loaded document
   - `/help` — show all commands

## 🛠 Local development

Just a static site — serve it any way you like:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 📐 Architecture

```
Browser (GitHub Pages static hosting)
 ├── app.js .................. routing, UI, tool logic (vanilla JS)
 ├── WebLLM (CDN) ........... model runtime on WebGPU
 ├── en/ml/hindi.wikipedia.org  → web search
 ├── nominatim.openstreetmap.org → places
 └── localStorage ............ chat history + settings
```

**No backend. No API keys. No telemetry.**

## 📝 Notes & limits

- First model download needs a decent internet connection (700 MB–2 GB).
- Quality depends on the chosen model — small models are fast but simple;
  1B–3B models are a good balance on most laptops.
- Browsers without WebGPU (Firefox/Safari on some systems) cannot run the
  model — use Chrome/Edge.
- Wikipedia/OpenStreetMap are free public APIs: be reasonable with usage.

## 📄 License

MIT — do whatever you like, attribution appreciated.
