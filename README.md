# AI Video Assistant

Ever wish you could just *ask* a stack of videos a question instead of scrubbing through them looking for the one moment that matters? That's what this is.

AI Video Assistant is a chat-based guide to a curated library of pre-trained videos. Instead of watching everything hoping to stumble on the answer, you type a question in plain English, and the assistant digs through every video at once, finds the exact moments that actually answer it, and hands you a clear response — with links straight to the source, timestamp and all.

Think of it less like a search bar and more like a research assistant who has already watched every video in the collection, taken detailed notes, and is just waiting for you to ask.

## What You Can Do With It

- **Ask anything, get a grounded answer.** Chat naturally with the assistant about the topics covered in the video library. It only answers from what's actually in the videos — no guessing, no making things up.
- **Jump straight to the moment.** Every answer comes with source clips and clickable timestamps, so you can watch the exact moment a claim comes from instead of taking it on faith.
- **See how confident it is.** Each source shows a confidence score, so you know whether you're looking at a strong match or a loose one.
- **Peek behind the curtain.** A built-in "How it Works" explainer walks you through the retrieval pipeline step by step, and a tech stack explorer shows what's powering things under the hood — great if you're curious, not required if you're not.
- **Browse the knowledge base.** Explore the full video library on its own, independent of asking questions, to see what's actually in there.
- **Watch it think.** A live query playground shows you the raw context the assistant retrieved *before* it wrote its answer, so you can see the reasoning, not just the result.

## How It Works, in Plain Terms

The library is fixed — a hand-picked set of videos that have already been transcribed and indexed ahead of time. There's no upload button and no way to add a video on the fly in this version; the knowledge base is intentionally locked to what's already been prepared, so answers stay reliable and consistent.

When you ask a question, the assistant searches across every video simultaneously, pulls out the passages most relevant to what you asked, and writes a grounded answer using only that material. If it can't find a good answer in the videos, it won't pretend to.

## Getting Started

You don't need to install a pile of packages to try it out — the demo path works out of the box. Just run:

```bash
python app.py
```

Then open [http://localhost:8000](http://localhost:8000) and start asking questions.

For sharper, more nuanced answers, you can plug in a DeepSeek API key (see the setup notes below). Without one, the assistant still works, just using a simpler built-in fallback so you can try the experience immediately.

<details>
<summary>Setup details (for hosting your own copy)</summary>

### Configure DeepSeek

Copy `.env.example` to `.env`, or set the key directly in your environment:

```bash
set DEEPSEEK_API_KEY=your_deepseek_api_key
python app.py
```

PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="your_deepseek_api_key"
python app.py
```

If `DEEPSEEK_API_KEY` isn't set, the app runs on a local extractive fallback so the UI and retrieval are still fully testable.

### Building Your Own Video Library

The video catalog lives in `data/videos.json`, holding 10–20 pre-trained videos with their preprocessed transcript chunks. Use `data/videos.example.json` as the template:

```json
{
  "videos": [
    {
      "id": "stable-video-id",
      "number": "1",
      "title": "Video title",
      "filename": "video-file.mp4",
      "videoUrl": "/static/videos/video-file.mp4",
      "description": "Short topic description",
      "chunks": [
        { "start": 0.0, "end": 12.5, "text": "Transcript chunk text" }
      ]
    }
  ]
}
```

If `data/videos.json` exists and its first video has no chunks yet, the backend automatically imports the existing `output.json` transcript into it, so there's always something searchable out of the box. Add your remaining preprocessed chunks under the matching video entries to make the rest searchable too.

Timestamp jumps work through each video's `videoUrl`, and every source button also links out to "Open on YouTube."

### Deploying

- Commit the source files, `output.json`, and `data/videos.example.json`.
- Don't commit `.env`, raw local videos, generated MP3s, or large private indexes.
- Set `DEEPSEEK_API_KEY` as a secret in your production environment.
- If videos are hosted elsewhere, point each `videoUrl` at the hosted location.

</details>

## What's Not Here Yet (By Design)

This first version is deliberately locked down to a fixed library:

- No video upload UI
- No user-triggered re-indexing
- No expanding the dataset at runtime

Just a focused, dependable assistant for the videos already on file — nothing more, nothing less.
