const state = {
  videos: [],
  lastResult: null,
  videoFilter: "all",
};

const flowSteps = [
  {
    name: "Transcription",
    text: "Whisper converts each pre-trained video into timestamped transcript segments before release.",
    example: "00:39-00:43: greet the user with good morning, good afternoon, or good evening.",
    artifacts: ["audio extracted", "timestamped JSON", "speaker text"],
  },
  {
    name: "Chunking",
    text: "Transcript segments are grouped into small semantic units so retrieval can return precise moments.",
    example: "A chunk keeps start, end, source video, and cleaned transcript text together.",
    artifacts: ["chunk id", "start and end", "clean text"],
  },
  {
    name: "Embedding",
    text: "Each chunk is represented as a vector so similar concepts can be found across all videos.",
    example: "A query about conditional logic can match if, else, elif, and exercise hints.",
    artifacts: ["query vector", "chunk vector", "cosine score"],
  },
  {
    name: "Retrieval",
    text: "The backend searches every indexed video at once and ranks transcript chunks by relevance.",
    example: "Top matches are returned with scores, timestamps, and source titles.",
    artifacts: ["top-k chunks", "video title", "match score"],
  },
  {
    name: "Context",
    text: "Only the retrieved chunks are sent into the model prompt as grounded evidence.",
    example: "The model sees transcript excerpts, not the entire raw video library.",
    artifacts: ["prompt packet", "citations", "no extra facts"],
  },
  {
    name: "LLM Response",
    text: "DeepSeek R1 answers conversationally and cites the relevant video timestamps.",
    example: "If the context is missing, the assistant says the knowledge base does not contain it.",
    artifacts: ["answer", "timestamps", "confidence"],
  },
];

const techStack = [
  {
    name: "Whisper",
    role: "Transcription",
    why: "Creates timestamped text from the original training videos.",
    benefit: "Accurate source mapping from answer back to video time.",
    code: "whisper video.mp4 --model medium --output_format json",
  },
  {
    name: "Vector Index",
    role: "Semantic Search",
    why: "Stores chunk vectors and retrieves meaning-level matches.",
    benefit: "Searches all pre-trained videos simultaneously.",
    code: "top_chunks = vector_db.search(query_embedding, top_k=6)",
  },
  {
    name: "Embeddings",
    role: "Query + Chunk Vectors",
    why: "Transforms questions and transcripts into comparable vectors.",
    benefit: "Finds related wording even when terms do not exactly match.",
    code: "embedding = embed_model.encode([question])",
  },
  {
    name: "DeepSeek R1",
    role: "Grounded Answering",
    why: "Generates the final natural-language response from retrieved context.",
    benefit: "Reasoned answers with a strict no-context, no-answer policy.",
    code: "model='deepseek-reasoner', temperature=0.2",
  },
  {
    name: "Python Backend",
    role: "RAG API",
    why: "Loads the fixed index, retrieves chunks, formats prompts, and calls the model.",
    benefit: "Simple GitHub deployment with no upload surface in V1.",
    code: "POST /api/query { question }",
  },
  {
    name: "Frontend",
    role: "Interactive UX",
    why: "Provides chat, source inspection, pipeline learning, and timestamp jumps.",
    benefit: "Feels like a product and a developer showcase.",
    code: "fetch('/api/query', { method: 'POST', body })",
  },
];

const graphNodes = [
  {
    name: "Question",
    hint: "The user asks a natural-language question.",
    answer: "The browser sends a small JSON payload to POST /api/query. The payload contains only the question, so V1 never accepts uploads or expands the dataset at runtime.",
    signal: "Input text",
  },
  {
    name: "Embedding",
    hint: "The question is converted into a searchable vector representation.",
    answer: "The backend normalizes the question, expands course-specific terms, and creates a comparable vector. This is what lets a query like if else match nearby transcript wording.",
    signal: "Query vector",
  },
  {
    name: "Vector Search",
    hint: "The index ranks transcript chunks from every pre-trained video.",
    answer: "Every searchable video chunk is scored with semantic and lexical signals. The highest scoring chunks are kept as the answer evidence.",
    signal: "Top-k scores",
  },
  {
    name: "Context",
    hint: "The top chunks become the only evidence passed to the LLM.",
    answer: "The prompt packet contains source video names, timestamps, transcript text, and scores. The model is instructed to answer only from those chunks.",
    signal: "Grounded prompt",
  },
  {
    name: "Answer",
    hint: "The model responds with source videos, timestamps, and grounded wording.",
    answer: "The final response includes a conversational answer, retrieved sources, confidence, and timestamp jump actions. Missing evidence produces a clear not-found answer.",
    signal: "Cited response",
  },
];

const qs = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function addMessage(role, text) {
  const node = el("div", `message ${role}`, text);
  qs("#chatLog").appendChild(node);
  qs("#chatLog").scrollTop = qs("#chatLog").scrollHeight;
}

function resetChat() {
  qs("#chatLog").innerHTML = "";
  addMessage("assistant", "Ask me about the pre-trained video knowledge base. I will answer only from retrieved transcript context.");
  renderSources();
  qs("#promptPreview").textContent = "Run a question to see the context sent to the model.";
  qs("#confidenceMetric").textContent = "-";
  qs("#latencyMetric").textContent = "-";
  qs("#modelMetric").textContent = "-";
  state.lastResult = null;
}

async function copyLatestAnswer() {
  const answer = state.lastResult?.answer;
  if (!answer) {
    addMessage("assistant", "There is no generated answer to copy yet.");
    return;
  }
  try {
    await navigator.clipboard.writeText(answer);
    addMessage("assistant", "Copied the latest answer to your clipboard.");
  } catch {
    addMessage("assistant", "Clipboard access was blocked by the browser, but the latest answer is still visible in the chat.");
  }
}

function renderSources(chunks = []) {
  const list = qs("#sourceList");
  list.innerHTML = "";
  if (!chunks.length) {
    list.appendChild(el("p", "", "No retrieved chunks yet."));
    return;
  }

  chunks.forEach((chunk) => {
    const card = el("div", "source-card");
    const title = el("strong", "", chunk.videoTitle);
    const text = el("p", "", chunk.text);
    const meta = el("div", "source-meta");
    meta.innerHTML = `<span>${chunk.startLabel}-${chunk.endLabel}</span><span>${Math.round(chunk.score * 100)}% match</span>`;
    const button = el("button", "", "Jump to timestamp");
    button.addEventListener("click", () => jumpToVideo(chunk.videoId, chunk.start));
    card.append(title, text, meta, button);
    list.appendChild(card);
  });
}

function updateMetrics(result) {
  qs("#confidenceMetric").textContent = `${Math.round((result.confidence || 0) * 100)}%`;
  qs("#latencyMetric").textContent = `${result.latencyMs} ms`;
  qs("#modelMetric").textContent = result.usedDeepSeek ? "API" : "Local fallback";
  qs("#promptPreview").textContent = result.promptPreview || "No prompt context was created because no chunks matched.";
}

async function ask(question) {
  addMessage("user", question);
  addMessage("assistant", "Searching the indexed videos...");

  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const result = await response.json();
  state.lastResult = result;

  const messages = document.querySelectorAll(".message.assistant");
  messages[messages.length - 1].textContent = result.answer || result.error || "No answer returned.";
  renderSources(result.chunks || []);
  updateMetrics(result);
}

function renderFlow() {
  const steps = qs("#flowSteps");
  const detail = qs("#flowDetail");
  const setActive = (idx) => {
    [...steps.children].forEach((child, childIdx) => child.classList.toggle("active", childIdx === idx));
    const item = flowSteps[idx];
    detail.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.text}</p>
      <strong>System example</strong>
      <p>${item.example}</p>
      <div class="evidence-grid">
        ${item.artifacts.map((artifact) => `<span>${artifact}</span>`).join("")}
      </div>
    `;
  };

  flowSteps.forEach((item, idx) => {
    const button = el("button", "flow-step", item.name);
    button.addEventListener("click", () => setActive(idx));
    steps.appendChild(button);
  });
  setActive(0);
}

function renderTech() {
  const grid = qs("#techGrid");
  const detail = qs("#techDetail");
  const setActive = (idx) => {
    [...grid.children].forEach((child, childIdx) => child.classList.toggle("active", childIdx === idx));
    const item = techStack[idx];
    detail.innerHTML = `
      <h3>${item.name}</h3>
      <p><strong>${item.role}</strong></p>
      <p>${item.why}</p>
      <p>${item.benefit}</p>
      <pre><code>${item.code}</code></pre>
    `;
  };

  techStack.forEach((item, idx) => {
    const card = el("button", "tech-card");
    card.innerHTML = `<strong>${item.name}</strong><span>${item.role}</span>`;
    card.addEventListener("click", () => setActive(idx));
    grid.appendChild(card);
  });
  setActive(0);
}

function closeGraphPopout() {
  document.querySelector(".graph-popout")?.remove();
  document.querySelectorAll(".graph-node").forEach((item) => item.classList.remove("active"));
}

function renderGraph() {
  const graph = qs("#ragGraph");
  graphNodes.forEach((item, idx) => {
    const node = el("div", "graph-node");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.innerHTML = `<span>${String(idx + 1).padStart(2, "0")}</span><strong>${item.name}</strong><p>${item.hint}</p>`;
    const openPopout = () => {
      closeGraphPopout();
      node.classList.add("active");
      qs("#graphHint").textContent = item.hint;
      const popout = el("div", "graph-popout");
      popout.innerHTML = `
        <button class="popout-close" aria-label="Close runtime detail">x</button>
        <small>${item.signal}</small>
        <h3>${item.name}</h3>
        <p>${item.answer}</p>
      `;
      popout.querySelector(".popout-close").addEventListener("click", closeGraphPopout);
      node.appendChild(popout);
    };
    node.addEventListener("click", openPopout);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPopout();
      }
    });
    graph.appendChild(node);
  });
}

function renderVideos(filter = "") {
  const list = qs("#videoList");
  const needle = filter.trim().toLowerCase();
  list.innerHTML = "";
  const videos = state.videos.filter((video) => {
    const haystack = `${video.title} ${video.description} ${(video.chunks || []).map((chunk) => chunk.text).join(" ")}`.toLowerCase();
    const matchesSearch = !needle || haystack.includes(needle);
    const matchesFilter =
      state.videoFilter === "all" ||
      (state.videoFilter === "searchable" && video.isSearchable) ||
      (state.videoFilter === "play-only" && !video.isSearchable);
    return matchesSearch && matchesFilter;
  });

  if (!videos.length) {
    const empty = el("div", "empty-state");
    empty.textContent = "No videos match the current search and filter.";
    list.appendChild(empty);
    return;
  }

  videos.forEach((video) => {
    const card = el("article", "video-card");
    const status = video.isSearchable ? `${video.chunkCount} searchable chunks` : "playable source";
    card.innerHTML = `
      <h3>${video.title}</h3>
      <p>${video.description || "Pre-trained indexed video"} - ${status} - ${video.durationLabel}</p>
    `;
    const play = el("button", "", "Play video");
    play.addEventListener("click", () => jumpToVideo(video.id, 0));
    const openOriginal = el("button", "", "Open original");
    openOriginal.addEventListener("click", () => {
      window.open(video.videoUrl, "_blank", "noopener,noreferrer");
    });
    const chunks = el("div", "chunk-list");
    (video.chunks || []).slice(0, 18).forEach((chunk) => {
      const row = el("div", "chunk-row");
      row.innerHTML = `<span>${chunk.timestamp}</span><p>${chunk.text}</p>`;
      row.addEventListener("click", () => jumpToVideo(video.id, chunk.start));
      chunks.appendChild(row);
    });
    if (video.isSearchable) {
      const toggle = el("button", "", "Show transcript chunks");
      toggle.addEventListener("click", () => {
        card.classList.toggle("open");
        toggle.textContent = card.classList.contains("open") ? "Hide transcript chunks" : "Show transcript chunks";
      });
      card.append(play, openOriginal, toggle, chunks);
    } else {
      card.classList.add("play-only");
      card.append(play, openOriginal);
    }
    list.appendChild(card);
  });
}

function getYouTubeId(url = "") {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function jumpToVideo(videoId, seconds) {
  const video = state.videos.find((item) => item.id === videoId);
  const frame = qs("#videoFrame");
  const openLink = qs("#youtubeOpenLink");
  if (video && video.videoUrl) {
    const start = Math.max(0, Math.round(Number(seconds) || 0));
    const youtubeId = getYouTubeId(video.videoUrl);
    if (youtubeId) {
      frame.src = `https://www.youtube.com/embed/${youtubeId}?start=${start}&autoplay=1`;
      openLink.href = `https://www.youtube.com/watch?v=${youtubeId}&t=${start}s`;
    } else {
      frame.src = video.videoUrl;
      openLink.href = video.videoUrl;
    }
    qs("#playerEmpty").textContent = `${video.title} at ${start} seconds`;
  } else {
    qs("#playerEmpty").textContent = "This video does not have a playable URL yet.";
  }
}

async function boot() {
  renderFlow();
  renderTech();
  renderGraph();
  renderSources();

  const health = await fetch("/api/health").then((res) => res.json());
  qs("#healthText").textContent = "Index ready";
  qs("#videoCount").textContent = health.videos;
  qs("#chunkCount").textContent = health.chunks;

  const data = await fetch("/api/videos").then((res) => res.json());
  state.videos = data.videos || [];
  renderVideos();

  qs("#queryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = qs("#questionInput");
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    ask(question);
  });

  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.getAttribute("data-question");
      qs("#questionInput").value = question;
      ask(question);
    });
  });

  qs("#clearChatBtn").addEventListener("click", resetChat);
  qs("#copyAnswerBtn").addEventListener("click", copyLatestAnswer);

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.videoFilter = button.getAttribute("data-filter");
      renderVideos(qs("#videoSearch").value);
    });
  });

  qs("#videoSearch").addEventListener("input", (event) => renderVideos(event.target.value));
  resetChat();
}

boot().catch((error) => {
  qs("#healthText").textContent = "Backend unavailable";
  addMessage("assistant", `Startup error: ${error.message}`);
});
