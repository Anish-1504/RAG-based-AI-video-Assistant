# AI Video Assistant

Production-ready V1 web app for asking questions over a fixed, pre-trained video RAG knowledge base.

This release intentionally does not include video uploads or dynamic dataset expansion. Users ask natural-language questions, the backend retrieves relevant transcript chunks from the existing indexed videos, and the assistant returns grounded answers with source videos and timestamps.

## Features

- Chat assistant over pre-trained videos
- Retrieval across all videos at once
- Source video names, timestamps, confidence, and jump buttons
- Strict grounded-answer prompt for DeepSeek R1
- Interactive "How it Works" RAG pipeline
- Tech stack explorer
- RAG pipeline visualizer
- Video knowledge base explorer
- Live query playground showing retrieved context vs final answer
- Zero required Python package installation for the default demo path

## Run Locally

```bash
python app.py
```

Open [http://localhost:8000](http://localhost:8000).

## Configure DeepSeek

Copy `.env.example` to `.env` or set environment variables in your host.

```bash
set DEEPSEEK_API_KEY=your_deepseek_api_key
python app.py
```

PowerShell:

```powershell
$env:DEEPSEEK_API_KEY="your_deepseek_api_key"
python app.py
```

If `DEEPSEEK_API_KEY` is not set, the app still runs with a local extractive fallback so the UI and retrieval can be tested.

## Add Your 10-20 Pre-Trained Videos

The app reads the fixed V1 video catalog from `data/videos.json`. The current catalog contains the YouTube links provided for the trained knowledge base. One duplicate YouTube video ID was kept only once.

Use the shape in `data/videos.example.json` when adding the already-preprocessed transcript chunks for each video.

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

When `data/videos.json` exists and its first video has no chunks, the backend imports the existing `output.json` transcript into that first video so the assistant remains immediately searchable. Add the rest of your preprocessed chunks under the matching video objects to search all videos.

YouTube timestamp jumps work through each video's `videoUrl`. Source buttons open the embedded player at the retrieved timestamp and also provide an "Open on YouTube" link.

## Deployment Notes

The app is GitHub-ready:

- Commit the source files, `output.json`, and `data/videos.example.json`.
- Do not commit `.env`, raw local videos, generated MP3 files, or large private indexes.
- For production, set `DEEPSEEK_API_KEY` as a secret in the deployment environment.
- If you host videos separately, set each `videoUrl` to the hosted URL.

## V1 Boundary

- No upload UI
- No user-driven re-indexing
- No runtime expansion of the dataset
- Only the existing pre-trained, timestamped knowledge base is queried
