import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
OUTPUT_JSON = ROOT / "output.json"
VIDEOS_JSON = ROOT / "data" / "videos.json"
PORT = int(os.getenv("PORT", "8000"))
VECTOR_SIZE = 384
TOP_K = int(os.getenv("RAG_TOP_K", "6"))
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.05"))


TOKEN_RE = re.compile(r"[a-zA-Z0-9_+#.]+")
STOPWORDS = {
    "a",
    "about",
    "and",
    "are",
    "course",
    "does",
    "for",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "the",
    "this",
    "to",
    "was",
    "what",
    "where",
}
QUERY_EXPANSIONS = {
    "if": ["if", "else", "elif", "conditional", "condition", "efl"],
    "else": ["else", "elif", "conditional", "condition", "efl"],
    "elif": ["elif", "else", "conditional", "efl"],
    "conditional": ["if", "else", "elif", "condition", "efl"],
    "time": ["time", "strftime", "hour", "minute", "second", "timestamp"],
    "module": ["module", "import", "builtin", "pip"],
    "morning": ["morning", "afternoon", "evening", "greet", "greeting"],
}


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]


def expand_query_terms(tokens: list[str]) -> list[str]:
    expanded: list[str] = []
    for token in tokens:
        expanded.append(token)
        expanded.extend(QUERY_EXPANSIONS.get(token, []))
    return expanded


def stable_hash(value: str) -> int:
    h = 2166136261
    for char in value:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def embed_text(text: str) -> list[float]:
    vector = [0.0] * VECTOR_SIZE
    tokens = tokenize(text)
    features: list[str] = []
    features.extend(tokens)
    for token in tokens:
        if len(token) >= 4:
            features.extend(token[i : i + 4] for i in range(len(token) - 3))

    for feature in features:
        idx = stable_hash(feature) % VECTOR_SIZE
        vector[idx] += 1.0

    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def seconds_to_mmss(value: float | int) -> str:
    total = max(0, int(round(float(value))))
    minutes, seconds = divmod(total, 60)
    return f"{minutes:02d}:{seconds:02d}"


def parse_json_file(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_catalog() -> list[dict[str, Any]]:
    catalog = parse_json_file(VIDEOS_JSON)
    if isinstance(catalog, dict) and isinstance(catalog.get("videos"), list):
        transcript = parse_json_file(OUTPUT_JSON)
        if isinstance(transcript, list) and catalog["videos"] and not catalog["videos"][0].get("chunks"):
            catalog["videos"][0]["chunks"] = transcript
            catalog["videos"][0]["description"] = (
                catalog["videos"][0].get("description", "")
                + " Searchable transcript chunks are loaded from output.json."
            ).strip()
        return catalog["videos"]

    transcript = parse_json_file(OUTPUT_JSON)
    if isinstance(transcript, list):
        return [
            {
                "id": "python-good-morning-exercise",
                "number": "1",
                "title": "Good Morning Sir Python Exercise",
                "filename": "output.json",
                "videoUrl": "",
                "description": "Existing Whisper transcript imported from output.json.",
                "chunks": transcript,
            }
        ]

    return []


def build_index() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    videos = normalize_catalog()
    index: list[dict[str, Any]] = []

    for video in videos:
        chunks = video.get("chunks", [])
        for offset, chunk in enumerate(chunks):
            text = str(chunk.get("text", "")).strip()
            if not text:
                continue
            record = {
                "id": f"{video.get('id', video.get('number', 'video'))}-{offset}",
                "videoId": video.get("id") or str(video.get("number") or "video"),
                "videoNumber": str(video.get("number") or ""),
                "videoTitle": video.get("title") or video.get("filename") or "Untitled video",
                "videoUrl": video.get("videoUrl", ""),
                "description": video.get("description", ""),
                "start": float(chunk.get("start", 0)),
                "end": float(chunk.get("end", chunk.get("start", 0))),
                "text": text,
            }
            record["embedding"] = embed_text(
                " ".join(
                    [
                        str(record["videoTitle"]),
                        str(record["description"]),
                        text,
                    ]
                )
            )
            index.append(record)

    for video in videos:
        video["chunkCount"] = len(video.get("chunks", []))
        video["duration"] = max((float(c.get("end", 0)) for c in video.get("chunks", [])), default=0)
        video["isSearchable"] = video["chunkCount"] > 0
        for chunk in video.get("chunks", []):
            chunk["timestamp"] = seconds_to_mmss(chunk.get("start", 0))

    return videos, index


VIDEOS, CHUNK_INDEX = build_index()


def retrieve(query: str, limit: int = TOP_K) -> list[dict[str, Any]]:
    raw_tokens = tokenize(query)
    expanded_tokens = expand_query_terms(raw_tokens)
    query_embedding = embed_text(" ".join(expanded_tokens))
    query_terms = {token for token in expanded_tokens if token not in STOPWORDS}
    scored: list[dict[str, Any]] = []

    for chunk in CHUNK_INDEX:
        text_terms = set(tokenize(f"{chunk['videoTitle']} {chunk['text']}"))
        lexical = len(query_terms & text_terms) / max(1, len(query_terms))
        semantic = cosine(query_embedding, chunk["embedding"])
        phrase_bonus = 0.0
        text_blob = f"{chunk['videoTitle']} {chunk['text']}".lower()
        if "if else" in query.lower() and ("if else" in text_blob or "efl" in text_blob or "elif" in text_blob):
            phrase_bonus = 0.22
        if lexical == 0 and phrase_bonus == 0:
            continue
        score = (semantic * 0.62) + (lexical * 0.30) + phrase_bonus
        if score >= MIN_SCORE:
            result = {key: value for key, value in chunk.items() if key != "embedding"}
            result["score"] = round(score, 4)
            result["startLabel"] = seconds_to_mmss(result["start"])
            result["endLabel"] = seconds_to_mmss(result["end"])
            scored.append(result)

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def build_prompt(question: str, chunks: list[dict[str, Any]]) -> str:
    context = [
        {
            "video": chunk["videoTitle"],
            "timestamp": f"{chunk['startLabel']}-{chunk['endLabel']}",
            "text": chunk["text"],
            "score": chunk["score"],
        }
        for chunk in chunks
    ]
    return f"""You are an AI Video Assistant for a fixed, pre-trained video knowledge base.
Answer only from the retrieved transcript context. If the answer is not present, say it is not available in the video knowledge base.
Be concise, conversational, and include source video names and timestamps.

Retrieved context:
{json.dumps(context, indent=2)}

Question: {question}
"""


def call_deepseek(question: str, chunks: list[dict[str, Any]]) -> str | None:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return None

    endpoint = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-reasoner"),
        "messages": [
            {"role": "system", "content": "You answer grounded questions over transcript chunks."},
            {"role": "user", "content": build_prompt(question, chunks)},
        ],
        "temperature": 0.2,
        "stream": False,
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
    except (KeyError, TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        return None


def local_grounded_answer(question: str, chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "I could not find that information in the pre-trained video knowledge base."

    grouped: dict[str, list[dict[str, Any]]] = {}
    for chunk in chunks[:4]:
        grouped.setdefault(chunk["videoTitle"], []).append(chunk)

    lines = ["Here is what I found in the indexed videos:"]
    for title, video_chunks in grouped.items():
        stamps = ", ".join(f"{c['startLabel']}-{c['endLabel']}" for c in video_chunks)
        best_text = " ".join(c["text"] for c in video_chunks[:2]).strip()
        lines.append(f"{title} at {stamps}: {best_text}")

    lines.append("This answer is limited to the retrieved transcript chunks.")
    return "\n\n".join(lines)


def answer_query(question: str) -> dict[str, Any]:
    started = time.perf_counter()
    chunks = retrieve(question)
    answer = call_deepseek(question, chunks) if chunks else None
    if not answer:
        answer = local_grounded_answer(question, chunks)

    confidence = 0.0
    if chunks:
        confidence = min(0.98, sum(chunk["score"] for chunk in chunks[:3]) / min(3, len(chunks)))

    return {
        "answer": answer,
        "chunks": chunks,
        "confidence": round(confidence, 2),
        "latencyMs": round((time.perf_counter() - started) * 1000),
        "usedDeepSeek": bool(os.getenv("DEEPSEEK_API_KEY")) and bool(chunks),
        "promptPreview": build_prompt(question, chunks) if chunks else "",
    }


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        if path == "/":
            return str(STATIC_DIR / "index.html")
        if path.startswith("/static/"):
            return str(ROOT / path.lstrip("/"))
        return str(STATIC_DIR / path.lstrip("/"))

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.send_json({"ok": True, "videos": len(VIDEOS), "chunks": len(CHUNK_INDEX)})
            return
        if self.path == "/api/videos":
            safe_videos = []
            for video in VIDEOS:
                safe_videos.append(
                    {
                        "id": video.get("id"),
                        "number": video.get("number"),
                        "title": video.get("title"),
                        "filename": video.get("filename"),
                        "videoUrl": video.get("videoUrl", ""),
                        "description": video.get("description", ""),
                        "chunkCount": video.get("chunkCount", 0),
                        "duration": video.get("duration", 0),
                        "durationLabel": seconds_to_mmss(video.get("duration", 0)),
                        "isSearchable": video.get("isSearchable", False),
                        "chunks": video.get("chunks", []),
                    }
                )
            self.send_json({"videos": safe_videos})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/query":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.send_json({"error": "Invalid JSON body."}, 400)
            return

        question = str(payload.get("question", "")).strip()
        if not question:
            self.send_json({"error": "Question is required."}, 400)
            return
        self.send_json(answer_query(question))


if __name__ == "__main__":
    print(f"AI Video Assistant running at http://localhost:{PORT}")
    print(f"Loaded {len(VIDEOS)} video(s) and {len(CHUNK_INDEX)} transcript chunk(s).")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
