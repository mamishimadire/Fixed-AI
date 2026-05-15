
const STORAGE_KEY  = "mamishi_chat_history";
const ACTIVE_SESSION_KEY = "mamishi_active_session";
const BACKEND_KEY = "mamishi_selected_backend";
const THEME_KEY    = "mamishi_theme";
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 16;
const MAX_ASSISTANT_CHARS = 6000;
const MAX_USER_CHARS = 2000;
const SHOW_TOOL_TRACES = false;
const VOICE_API_BASE = "{{ voice_api_url }}";

let chatHistory    = loadHistory();
let currentSession = null;
let messages       = [];
let isStreaming    = false;
let isListening    = false;
let finalTx        = "";
let pendingFiles   = [];
let currentProj    = "general";
let currentModel   = "fast";
let currentBackend = null;
let mediaRecorder  = null;
let mediaChunks    = [];
let currentVoiceContext = null;
let pendingSpokenReply = null;
let voicePanelRecorder = null;
let voicePanelChunks = [];
let voicePanelListening = false;
let lastVoicePanelContext = null;
let ttsEnabled = false;
let isBrowserSpeaking = false;
let currentSpeechUtterance = null;
let currentSpeechBubble = null;
let preferredSpeechVoice = null;
let silenceDetectAnalyser = null;
let silenceDetectDataArray = null;
let silenceDetectTimer = null;
let silenceDetectMonitor = null;
let silenceDetectStartTime = 0;

// Voice language & streaming TTS
let voiceLanguage = localStorage.getItem("mamishi_voice_lang") || "auto";
let streamTtsSentenceBuffer = "";
let streamTtsSpeaking = false;
let streamTtsQueue = [];

const chatEl        = document.getElementById("chat");
const emptyEl       = document.getElementById("empty-state");
const chatComposer  = document.getElementById("chat-composer");
const inputEl       = document.getElementById("user-input");
const inputChatEl   = document.getElementById("user-input-chat");
const fileInput     = document.getElementById("file-input");
const previewBar    = document.getElementById("file-preview-bar");
const previewBarEmpty = document.getElementById("file-preview-bar-empty");
const recentsList   = document.getElementById("recents-list");
const recentsEmpty  = document.getElementById("recents-empty");
const footerNote    = document.getElementById("footer-note");
const backendSelect = document.getElementById("backend-select");
const memoryFolderInput = document.getElementById("memory-folder-input");
const memoryStatusEl = document.getElementById("memory-status");

function applyBackendSelectionIndicator(selectedBackend) {
  const backendKeys = ["gemini", "groq", "ollama", "openrouter", "tavily"];

  if (!selectedBackend) {
    backendKeys.forEach(key => renderStatusDot(key, true));
    currentActiveStatus = null;
    setStatusNotice("SYS");
    return;
  }

  setIdleDots();
  if (backendKeys.includes(selectedBackend)) {
    renderStatusDot(selectedBackend, true);
    currentActiveStatus = selectedBackend;
    if (selectedBackend === "openrouter") setStatusNotice("P");
    else if (selectedBackend === "gemini") setStatusNotice("G");
    else if (selectedBackend === "groq") setStatusNotice("O");
    else if (selectedBackend === "ollama") setStatusNotice("R");
    else if (selectedBackend === "tavily") setStatusNotice("T");
  }
}
const voiceLanguageSelect = document.getElementById("voice-language-select");
const voiceTranscriptEl = document.getElementById("voice-transcript");

if (backendSelect) {
  backendSelect.addEventListener("change", () => {
    currentBackend = backendSelect.value || null;
    saveSelectedBackend(currentBackend);
    applyBackendSelectionIndicator(currentBackend);
  });
}
const voicePanelStatusEl = document.getElementById("voice-panel-status");
const voicePanelMicBtn = document.getElementById("voice-panel-mic");
const voiceAutoListenEl = document.getElementById("voice-auto-listen");
const voiceAutoSpeakEl = document.getElementById("voice-auto-speak");
const ttsToggleLabel = document.getElementById("tts-toggle-label");

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(compactSessionForStorage) : [];
  } catch {
    return [];
  }
}

function loadActiveSessionId() {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

function saveActiveSessionId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
    else localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}

function loadSelectedBackend() {
  try {
    return localStorage.getItem(BACKEND_KEY);
  } catch {
    return null;
  }
}

function saveSelectedBackend(backend) {
  try {
    if (backend) localStorage.setItem(BACKEND_KEY, backend);
    else localStorage.removeItem(BACKEND_KEY);
  } catch {}
}

function saveHistory() {
  const prepared = chatHistory.slice(0, MAX_SESSIONS).map(compactSessionForStorage);
  let candidate = prepared;

  while (candidate.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      chatHistory = candidate;
      return true;
    } catch (error) {
      const lastSession = candidate[candidate.length - 1];
      if (lastSession?.messages?.length > 4) {
        lastSession.messages = lastSession.messages.slice(-Math.max(4, Math.floor(lastSession.messages.length / 2)));
      } else {
        candidate = candidate.slice(0, -1);
      }
    }
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  chatHistory = [];
  return false;
}

function compactText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? text.slice(0, limit) + "..." : text;
}

function compactContentForStorage(content) {
  if (typeof content === "string") {
    return compactText(content, MAX_ASSISTANT_CHARS);
  }
  if (!Array.isArray(content)) {
    return compactText(content, MAX_USER_CHARS);
  }

  return content.map(part => {
    if (!part || typeof part !== "object") return part;
    if (part.type === "text") {
      return { type: "text", text: compactText(part.text, MAX_USER_CHARS) };
    }
    if (part.type === "image" || part.type === "file") {
      return {
        type: part.type,
        mimeType: part.mimeType || "",
        name: part.name || "attachment",
      };
    }
    return part;
  });
}

function compactMessageForStorage(message) {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: compactContentForStorage(message.content),
  };
}

function compactSessionForStorage(session) {
  return {
    id: session.id || generateId(),
    title: compactText(session.title || "New chat", 80),
    updatedAt: session.updatedAt || Date.now(),
    messages: Array.isArray(session.messages)
      ? session.messages.slice(-MAX_MESSAGES_PER_SESSION).map(compactMessageForStorage)
      : [],
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function deriveTitleFromMessage(text) {
  const clean = text.replace(/\[.*?MODE\]\s*/i, "").replace(/\(see attached\)/i, "").trim();
  return clean.slice(0, 52) + (clean.length > 52 ? "…" : "") || "New chat";
}

function summarizeUserContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "(message)";

  const textParts = content
    .filter(part => part?.type === "text" && part.text)
    .map(part => part.text.trim())
    .filter(Boolean);
  if (textParts.length) return textParts.join(" ").trim();

  const fileNames = content
    .filter(part => (part?.type === "image" || part?.type === "file") && part.name)
    .map(part => part.name);
  if (fileNames.length) return fileNames.join(", ");

  return "(attachment)";
}

function renderSidebar() {
  const items = chatHistory.filter(session => session.messages.length > 0);
  recentsEmpty.style.display = items.length === 0 ? "block" : "none";
  [...recentsList.querySelectorAll(".recent-item")].forEach(element => element.remove());

  items.forEach(session => {
    const button = document.createElement("button");
    button.className = "recent-item" + (currentSession?.id === session.id ? " active" : "");
    button.dataset.id = session.id;
    button.innerHTML = `<span>${escHtml(session.title)}</span><button class="del-btn" title="Delete" onclick="deleteSession(event,'${session.id}')">×</button>`;
    button.onclick = event => {
      if (event.target.classList.contains("del-btn")) return;
      loadSession(session.id);
    };
    recentsList.appendChild(button);
  });
}

function deleteSession(event, id) {
  event.stopPropagation();
  chatHistory = chatHistory.filter(session => session.id !== id);
  saveHistory();
  if (currentSession?.id === id) newChat();
  else renderSidebar();
}

function loadSession(id) {
  const session = chatHistory.find(item => item.id === id);
  if (!session) return;
  currentSession = session;
  messages = [...session.messages];
  saveActiveSessionId(currentSession.id);
  renderSidebar();
  showChat();
  chatEl.innerHTML = "";
  messages.forEach(message => {
    if (message.role === "user") {
      const bubble = addRow("user");
      bubble.innerHTML = `<p>${escHtml(summarizeUserContent(message.content))}</p>`;
    } else if (message.role === "assistant") {
      const bubble = addRow("ai");
      renderMarkdown(bubble, message.content);
    }
  });
  chatEl.scrollTop = chatEl.scrollHeight;
  updateRetryButton();
}

function showChat() {
  emptyEl.style.display = "none";
  chatEl.style.display = "block";
  chatComposer.style.display = "block";
  footerNote.style.display = "none";
  updateRetryButton();
  getActiveInput().focus();
}

function showEmpty() {
  emptyEl.style.display = "flex";
  chatEl.style.display = "none";
  chatComposer.style.display = "none";
  chatEl.innerHTML = "";
  updateRetryButton();
  inputEl.focus();
}

function getActiveInput() {
  return chatEl.style.display === "block" ? inputChatEl : inputEl;
}

function restoreActiveSession() {
  try {
    const savedId = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (savedId) {
      const session = chatHistory.find(s => s.id === savedId);
      if (session) {
        loadSession(savedId);
        return;
      }
    }
  } catch {}
  currentSession = null;
  messages = [];
  showEmpty();
}

function stopStreaming() {
  if (!isStreaming) return;
  isStreaming = false;
  document.querySelectorAll("#send-btn,#send-btn-chat").forEach(b => { b.disabled = false; });
  document.getElementById("stop-btn")?.classList.remove("visible");
}

function newChat() {
  if (messages.length > 0 && currentSession) {
    currentSession.messages = [...messages];
    currentSession.updatedAt = Date.now();
    const index = chatHistory.findIndex(session => session.id === currentSession.id);
    if (index >= 0) chatHistory[index] = currentSession;
    else chatHistory.unshift(currentSession);
    saveHistory();
  }
  currentSession = null;
  messages = [];
  pendingFiles = [];
  saveActiveSessionId(null);
  renderPreviews();
  renderSidebar();
  showEmpty();
}

function startNewSession(firstMessage) {
  currentSession = {
    id: generateId(),
    title: deriveTitleFromMessage(firstMessage),
    messages: [],
    updatedAt: Date.now(),
  };
  chatHistory.unshift(currentSession);
  saveHistory();
  saveActiveSessionId(currentSession.id);
  renderSidebar();
}

function saveCurrentSession() {
  if (!currentSession) return;
  currentSession.messages = [...messages];
  currentSession.updatedAt = Date.now();
  const index = chatHistory.findIndex(session => session.id === currentSession.id);
  if (index >= 0) chatHistory[index] = currentSession;
  else chatHistory.unshift(currentSession);
  saveHistory();
  saveActiveSessionId(currentSession.id);
}

function findLastUserIndex() {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function canRetryLastTurn() {
  return findLastUserIndex() !== -1;
}

function updateRetryButton() {
  const button = document.getElementById("retry-btn");
  if (!button) return;
  button.disabled = isStreaming || !canRetryLastTurn();
}

const HLJS_DARK  = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
const HLJS_LIGHT = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";

function applyHljsTheme(theme) {
  const link = document.getElementById("hljs-theme");
  if (link) link.href = theme === "light" ? HLJS_LIGHT : HLJS_DARK;
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
  applyHljsTheme(saved);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
  applyHljsTheme(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (!icon) return;
  if (theme === "light") {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
  }
}

function openSearch() {
  document.getElementById("search-overlay").classList.add("open");
  const input = document.getElementById("search-input");
  input.value = "";
  filterSearch("");
  setTimeout(() => input.focus(), 50);
}

function openMemoryModal() {
  document.getElementById("memory-overlay").classList.add("open");
  loadMemoryStatus();
  setTimeout(() => memoryFolderInput?.focus(), 50);
}

function openVoiceModal() {
  document.getElementById("voice-overlay").classList.add("open");
  checkVoiceServer();
  setTimeout(() => voiceLanguageSelect?.focus(), 50);
}

function closeSearch() {
  document.getElementById("search-overlay").classList.remove("open");
}

function closeMemoryModal() {
  document.getElementById("memory-overlay").classList.remove("open");
}

function closeVoiceModal() {
  document.getElementById("voice-overlay").classList.remove("open");
}

function closeSearchIfOutside(event) {
  if (event.target === document.getElementById("search-overlay")) closeSearch();
}

function closeMemoryIfOutside(event) {
  if (event.target === document.getElementById("memory-overlay")) closeMemoryModal();
}

function closeVoiceIfOutside(event) {
  if (event.target === document.getElementById("voice-overlay")) closeVoiceModal();
}

document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key === "k") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape") closeSearch();
  if (event.key === "Escape") closeMemoryModal();
  if (event.key === "Escape") closeVoiceModal();
});

function setVoicePanelStatus(text) {
  if (voicePanelStatusEl) voicePanelStatusEl.textContent = text;
}

function setVoicePanelListening(active) {
  voicePanelListening = Boolean(active);
  if (voicePanelMicBtn) {
    voicePanelMicBtn.classList.toggle("listening", voicePanelListening);
    voicePanelMicBtn.textContent = voicePanelListening ? "Stop microphone" : "Start microphone";
  }
}

function getSelectedVoiceLanguageCode() {
  return String(voiceLanguageSelect?.value || "auto").trim() || "auto";
}

function getSelectedVoiceLanguageName() {
  const option = voiceLanguageSelect?.selectedOptions?.[0];
  return option ? option.textContent.trim() : "Auto-detect";
}

function syncVoiceModeButtons() {
  const ttsToggle = document.getElementById("tts-toggle");
  ttsToggle?.classList.toggle("active", ttsEnabled);
  if (ttsToggleLabel) ttsToggleLabel.textContent = ttsEnabled ? "Auto-speak ON" : "Auto-speak";
}

function refreshSpeakButtons() {
  chatEl.querySelectorAll(".speak-btn").forEach(button => {
    const bubble = button.closest(".bubble.ai");
    const active = isBrowserSpeaking && bubble === currentSpeechBubble;
    button.classList.toggle("speaking", active);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> ${active ? "Stop" : "Speak"}`;
  });
}

function loadPreferredSpeechVoice() {
  preferredSpeechVoice =
    chooseSpeechSynthesisVoice("en-ZA")
    || chooseSpeechSynthesisVoice("en-GB")
    || chooseSpeechSynthesisVoice("en");
}

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  isBrowserSpeaking = false;
  currentSpeechUtterance = null;
  currentSpeechBubble = null;
  refreshSpeakButtons();
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  if (!ttsEnabled) stopSpeaking();
  syncVoiceModeButtons();
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = loadPreferredSpeechVoice;
  loadPreferredSpeechVoice();
}

async function checkVoiceServer() {
  try {
    const response = await fetch(`${VOICE_API_BASE}/health`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Voice server unavailable.");
    setVoicePanelStatus(`Voice server online.\nWhisper model: ${data.whisper_model}\nPython: ${data.python}`);
    return true;
  } catch (error) {
    setVoicePanelStatus(`Voice server offline.\n${error.message || error}\nMain chat voice fallback still available.`);
    return false;
  }
}

function formatMemoryStatus(data) {
  if (!data) return "Memory status unavailable.";
  if (data.error) return `Error: ${data.error}`;
  return [
    `ChromaDB path: ${data.chroma_dir || "N/A"}`,
    `Knowledge folder: ${data.knowledge_folder || "N/A"}`,
  ].join("\n");
}

function useDefaultKnowledgeFolder() {
  fetch("/workdir", { cache: "no-store" })
    .then(response => response.json())
    .then(data => {
      const folder = data.memory?.knowledge_folder || "";
      if (memoryFolderInput) memoryFolderInput.value = folder;
    })
    .catch(() => {});
}

async function loadMemoryStatus() {
  if (!memoryStatusEl) return;
  memoryStatusEl.textContent = "Loading memory status...";
  try {
    const response = await fetch("/memory/status", { cache: "no-store" });
    const data = await response.json();
    const memCountEl = document.getElementById("mem-count");
    const docCountEl = document.getElementById("doc-count");
    const fileCountEl = document.getElementById("file-count");
    const knowledgeFolderEl = document.getElementById("knowledge-folder");
    if (memCountEl) memCountEl.textContent = data.memory_count ?? "--";
    if (docCountEl) docCountEl.textContent = data.knowledge_chunks ?? "--";
    if (fileCountEl) fileCountEl.textContent = data.indexed_files ?? "--";
    if (knowledgeFolderEl) knowledgeFolderEl.textContent = data.knowledge_folder || "N/A";
    memoryStatusEl.textContent = formatMemoryStatus(data);
    if (memoryFolderInput && !memoryFolderInput.value && data.knowledge_folder) {
      memoryFolderInput.value = data.knowledge_folder;
    }
  } catch (error) {
    memoryStatusEl.textContent = `Error: ${error.message}`;
  }
}

async function indexKnowledgeFolder() {
  if (!memoryStatusEl) return;
  const folder = memoryFolderInput?.value.trim() || "";
  memoryStatusEl.textContent = "Indexing... this may take a while for large folders.";
  try {
    const response = await fetch("/memory/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    const data = await response.json();
    if (data.error) {
      memoryStatusEl.textContent = `Error: ${data.error}`;
      return;
    }
    const status = await fetch("/memory/status", { cache: "no-store" }).then(r => r.json());
    const memCountEl = document.getElementById("mem-count");
    const docCountEl = document.getElementById("doc-count");
    const fileCountEl = document.getElementById("file-count");
    const knowledgeFolderEl = document.getElementById("knowledge-folder");
    if (memCountEl) memCountEl.textContent = status.memory_count ?? "--";
    if (docCountEl) docCountEl.textContent = status.knowledge_chunks ?? "--";
    if (fileCountEl) fileCountEl.textContent = status.indexed_files ?? "--";
    if (knowledgeFolderEl) knowledgeFolderEl.textContent = status.knowledge_folder || "N/A";
    memoryStatusEl.textContent = `Done. Added: ${data.added ?? 0} | Updated: ${data.updated ?? 0} | Skipped: ${data.skipped ?? 0}`;
  } catch (error) {
    memoryStatusEl.textContent = `Error: ${error.message}`;
  }
}

function filterSearch(query) {
  const container = document.getElementById("search-results");
  const q = query.trim().toLowerCase();
  const sessions = chatHistory.filter(session => session.messages.length > 0);

  if (!sessions.length) {
    container.innerHTML = `<div class="search-no-results">No chat history yet</div>`;
    return;
  }

  const filtered = q
    ? sessions.filter(session =>
        session.title.toLowerCase().includes(q) ||
        session.messages.some(message => typeof message.content === "string" && message.content.toLowerCase().includes(q))
      )
    : sessions;

  if (!filtered.length) {
    container.innerHTML = `<div class="search-no-results">No results for "${escHtml(query)}"</div>`;
    return;
  }

  const now = Date.now();
  const DAY = 86400000;
  const today = filtered.filter(session => now - session.updatedAt < DAY);
  const week = filtered.filter(session => now - session.updatedAt >= DAY && now - session.updatedAt < 7 * DAY);
  const older = filtered.filter(session => now - session.updatedAt >= 7 * DAY);

  let html = "";
  function renderGroup(label, items) {
    if (!items.length) return;
    html += `<div class="search-section-label">${label}</div>`;
    items.forEach(session => {
      html += `<button class="search-result-item" onclick="loadSession('${session.id}');closeSearch()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${escHtml(session.title)}
      </button>`;
    });
  }
  renderGroup("Today", today);
  renderGroup("Previous 7 Days", week);
  renderGroup("Older", older);
  container.innerHTML = html;
}

function wireInput(element) {
  element.addEventListener("input", () => {
    element.style.height = "auto";
    element.style.height = Math.min(element.scrollHeight, 170) + "px";
  });
  element.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isStreaming) sendMessage();
    }
  });
}

wireInput(inputEl);
wireInput(inputChatEl);

const SA_LANG_MAP = {
  auto: "en-ZA", en: "en-ZA", af: "af-ZA", zu: "zu-ZA",
  xh: "xh-ZA", nso: "nso-ZA", st: "st-ZA", tn: "tn-ZA",
  ts: "ts-ZA", ve: "ve-ZA", ss: "ss-ZA", nr: "nr-ZA",
};

function onVoiceLangChange(val) {
  voiceLanguage = val;
  localStorage.setItem("mamishi_voice_lang", val);
  if (sr) sr.lang = SA_LANG_MAP[val] || "en-ZA";
}

// Restore saved language selection
(function() {
  const sel = document.getElementById("voice-lang-select");
  if (sel && voiceLanguage) sel.value = voiceLanguage;
})();

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const sr = SR ? new SR() : null;
if (sr) {
  sr.continuous = false;
  sr.interimResults = true;
  sr.lang = SA_LANG_MAP[voiceLanguage] || "en-ZA";
  sr.onstart = () => {
    isListening = true;
    document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => button.classList.add("listening"));
    setVoiceStatus("🎤 Listening...");
  };
  sr.onresult = event => {
    let interim = "";
    finalTx = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTx += text;
      else interim += text;
    }
    const spoken = (finalTx || interim).trim();
    if (spoken) {
      const input = getActiveInput();
      input.value = spoken;
      input.dispatchEvent(new Event("input"));
    }
  };
  sr.onerror = event => {
    isListening = false;
    document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => button.classList.remove("listening"));
    setVoiceStatus(event.error === "not-allowed" ? "Mic denied" : "");
    setTimeout(() => setVoiceStatus(""), 2000);
  };
  sr.onend = () => {
    const shouldSend = Boolean(finalTx.trim()) && !isStreaming;
    isListening = false;
    document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => button.classList.remove("listening"));
    setVoiceStatus("");
    if (shouldSend) {
      sendMessage();
    }
  };
} else {
  document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => { button.disabled = true; });
}

function setVoiceStatus(text) {
  document.querySelectorAll("#voice-status,#voice-status-chat").forEach(element => { element.textContent = text; });
}

function updateVoiceButtons(active) {
  document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => {
    button.classList.toggle("listening", Boolean(active));
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function normalizeVoiceReplyLanguage(language) {
  const value = String(language || "").trim();
  if (!value) return "";
  return /^sepedi$/i.test(value) ? "Sepedi" : value;
}

async function transcribeRecordedAudio(blob) {
  const audioBase64 = await blobToBase64(blob);
  const response = await fetch("/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_base64: audioBase64,
      mime_type: blob.type || "audio/webm",
      filename: `voice-${Date.now()}.webm`,
      language: voiceLanguage === "auto" ? null : voiceLanguage,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Voice transcription failed.");
  return data;
}

function stopSilenceDetection() {
  if (silenceDetectTimer) clearTimeout(silenceDetectTimer);
  if (silenceDetectMonitor) clearInterval(silenceDetectMonitor);
  silenceDetectAnalyser = null;
  silenceDetectDataArray = null;
  silenceDetectTimer = null;
  silenceDetectMonitor = null;
}

async function startRecordedVoiceInput() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return false;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  // Setup silence detection with Web Audio API
  let audioContext = null;
  let source = null;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    source = audioContext.createMediaStreamSource(stream);
    silenceDetectAnalyser = audioContext.createAnalyser();
    silenceDetectAnalyser.fftSize = 2048;
    silenceDetectAnalyser.smoothingTimeConstant = 0.4;
    source.connect(silenceDetectAnalyser);
    silenceDetectDataArray = new Uint8Array(silenceDetectAnalyser.frequencyBinCount);
  } catch (error) {
    console.warn("Silence detection setup failed:", error);
  }

  mediaChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: preferredMime });
  silenceDetectStartTime = Date.now();

  // VAD state
  let lastSoundTime = silenceDetectStartTime;
  let speechStarted = false;
  const MIN_RECORD_TIME = 800;    // never cut before 800ms
  const SILENCE_DURATION = 2500;  // 2.5s of silence after speech = done
  const CALIBRATION_MS = 500;     // learn room noise for 500ms before listening
  let calibrationSamples = [];
  let noiseFloor = 5;             // default if calibration fails

  const levelBar  = document.getElementById("voice-level-bar");
  const levelFill = document.getElementById("voice-level-fill");
  if (levelBar) levelBar.style.display = "block";

  mediaRecorder.ondataavailable = event => {
    if (event.data?.size) mediaChunks.push(event.data);
  };

  // Monitor audio levels for silence detection
  if (silenceDetectAnalyser) {
    const sampleRate = audioContext?.sampleRate || 44100;
    const binCount = silenceDetectAnalyser.frequencyBinCount;
    // Only analyse 300–3400 Hz — the human voice range
    const lowBin  = Math.floor(300  * binCount * 2 / sampleRate);
    const highBin = Math.min(binCount - 1, Math.ceil(3400 * binCount * 2 / sampleRate));

    silenceDetectMonitor = setInterval(() => {
      if (!silenceDetectAnalyser || !silenceDetectDataArray || !mediaRecorder) return;

      silenceDetectAnalyser.getByteFrequencyData(silenceDetectDataArray);

      // RMS energy in speech frequency range
      let sumSq = 0, count = 0;
      for (let i = lowBin; i <= highBin; i++) {
        sumSq += silenceDetectDataArray[i] * silenceDetectDataArray[i];
        count++;
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;

      if (levelFill) levelFill.style.width = Math.min(100, rms * 2) + "%";

      const now = Date.now();

      // Calibration phase — learn the ambient noise floor
      if (now < silenceDetectStartTime + CALIBRATION_MS) {
        calibrationSamples.push(rms);
        return;
      }
      if (calibrationSamples.length > 0) {
        const sorted = [...calibrationSamples].sort((a, b) => a - b);
        noiseFloor = sorted[Math.floor(sorted.length * 0.80)] || 5;
        calibrationSamples = [];
      }

      // Dynamic thresholds — adapt to your microphone and room
      const SPEECH_ONSET = noiseFloor * 3.5 + 5;  // clear speech: 3.5× noise floor
      const SPEECH_HOLD  = noiseFloor * 2.0 + 3;  // still talking: 2× noise floor

      const recordingTime   = now - silenceDetectStartTime;
      const silenceDuration = now - lastSoundTime;

      if (rms > SPEECH_ONSET) {
        speechStarted = true;
        lastSoundTime = now;
      } else if (speechStarted && rms > SPEECH_HOLD) {
        lastSoundTime = now; // mid-sentence pause — reset silence clock
      }

      // Only stop after speech began and a full 2.5s of silence has passed
      if (speechStarted && recordingTime > MIN_RECORD_TIME && silenceDuration > SILENCE_DURATION) {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          setVoiceStatus("Processing...");
          mediaRecorder.stop();
          stopSilenceDetection();
        }
      }
    }, 80);
  }

  mediaRecorder.onstop = async () => {
    const recorder = mediaRecorder;
    const audioBlob = new Blob(mediaChunks, { type: recorder?.mimeType || "audio/webm" });
    stream.getTracks().forEach(track => track.stop());
    stopSilenceDetection();
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
    mediaRecorder = null;
    mediaChunks = [];
    isListening = false;
    updateVoiceButtons(false);
    if (levelBar) { levelBar.style.display = "none"; if (levelFill) levelFill.style.width = "0%"; }
    setVoiceStatus("Transcribing...");
    try {
      const data = await transcribeRecordedAudio(audioBlob);
      const transcript = String(data.text || "").trim();
      const WHISPER_JUNK = /^(preserve names\.?|preserve names accurately\.?|thank you\.?|thanks\.?|you\.?|subtitles by .+|transcribed by .+|\.+)$/i;
      if (!transcript || WHISPER_JUNK.test(transcript)) {
        setVoiceStatus("No speech detected.");
        setTimeout(() => setVoiceStatus(""), 2500);
        return;
      }

      // Session-level language tracking: if user is on Auto but Whisper detected an
      // African language, silently use that code for all future recordings this session
      // so Whisper gets a correct hint and accuracy improves immediately
      const WHISPER_TO_ISO = {
        afrikaans:"af", zulu:"zu", xhosa:"xh", sepedi:"nso",
        "northern sotho":"nso", sesotho:"st", sotho:"st",
        tswana:"tn", setswana:"tn", tsonga:"ts", xitsonga:"ts",
        venda:"ve", tshivenda:"ve", swati:"ss", siswati:"ss", ndebele:"nr",
      };
      const detectedLangRaw = String(data.language_name || data.language_code || "").trim().toLowerCase();
      if (voiceLanguage === "auto" && detectedLangRaw && !detectedLangRaw.startsWith("en")) {
        const isoCode = WHISPER_TO_ISO[detectedLangRaw] || detectedLangRaw;
        voiceLanguage = isoCode; // session-only override, not saved to localStorage
        if (sr) sr.lang = SA_LANG_MAP[isoCode] || "en-ZA";
      }

      currentVoiceContext = {
        fromVoice: true,
        inputLanguageCode: data.language_code || "",
        inputLanguageName: data.language_name || "",
        preferredOutputLanguage: normalizeVoiceReplyLanguage(data.preferred_output_language || ""),
      };
      pendingSpokenReply = currentVoiceContext;
      // Auto-enable speaking for voice input
      if (currentVoiceContext.preferredOutputLanguage) {
        ttsEnabled = true;
        syncVoiceModeButtons();
      }
      const input = getActiveInput();
      input.value = transcript;
      input.dispatchEvent(new Event("input"));
      setVoiceStatus(currentVoiceContext.preferredOutputLanguage
        ? `Replying in ${currentVoiceContext.preferredOutputLanguage}...`
        : "Sending...");
      sendMessage();
    } catch (error) {
      currentVoiceContext = null;
      pendingSpokenReply = null;
      setVoiceStatus(error.message || "Voice transcription failed.");
      setTimeout(() => setVoiceStatus(""), 3000);
    }
  };

  mediaRecorder.start();
  isListening = true;
  updateVoiceButtons(true);
  setVoiceStatus("Calibrating mic...");
  setTimeout(() => {
    if (isListening) setVoiceStatus("🎤 Listening...");
  }, CALIBRATION_MS + 80);
  return true;
}

function startBrowserSpeechFallback() {
  if (!sr || isStreaming) return;
  finalTx = "";
  sr.start();
}

function chooseSpeechSynthesisVoice(language) {
  const target = String(language || "").toLowerCase();
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  return voices.find(voice => voice.lang?.toLowerCase().startsWith(target))
    || voices.find(voice => target === "nso-za" && /nso|st-za|zu-za|xh-za|en-za/i.test(voice.lang || ""))
    || voices.find(voice => /en-za/i.test(voice.lang || ""))
    || voices[0]
    || null;
}

function extractSpeechText(markdownText) {
  return String(markdownText || "")
    .replace(/<<<HTML_ARTIFACT>>>[\s\S]*?<<<END_ARTIFACT>>>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addSpeakButton(bubble, sourceText = "") {
  if (!bubble || !bubble.classList.contains("ai")) return;
  const speechText = extractSpeechText(sourceText || bubble.innerText || bubble.textContent || "");
  if (!speechText) return;
  bubble.dataset.speechText = speechText;

  let button = bubble.querySelector(".speak-btn");
  if (!button) {
    button = document.createElement("button");
    button.className = "speak-btn";
    button.type = "button";
    button.onclick = async () => {
      if (isBrowserSpeaking && currentSpeechBubble === bubble) {
        stopSpeaking();
        return;
      }
      await speakTextAloud(bubble.dataset.speechText || "", {
        bubble,
        languageCode: "en-ZA",
        onEnd: () => {},
      });
    };
    bubble.appendChild(button);
  }
  refreshSpeakButtons();
}

async function speakTextAloud(text, options = {}) {
  const cleanText = extractSpeechText(text);
  if (!cleanText || !("speechSynthesis" in window)) return false;

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 1800));
  utterance.lang = options.languageCode || "en-ZA";
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.voice = chooseSpeechSynthesisVoice(utterance.lang) || preferredSpeechVoice || null;

  currentSpeechUtterance = utterance;
  currentSpeechBubble = options.bubble || null;
  isBrowserSpeaking = true;
  refreshSpeakButtons();
  setVoiceStatus("Speaking...");

  return new Promise(resolve => {
    utterance.onend = () => {
      isBrowserSpeaking = false;
      currentSpeechUtterance = null;
      currentSpeechBubble = null;
      refreshSpeakButtons();
      setVoiceStatus("");
      if (typeof options.onEnd === "function") options.onEnd();
      resolve(true);
    };
    utterance.onerror = () => {
      isBrowserSpeaking = false;
      currentSpeechUtterance = null;
      currentSpeechBubble = null;
      refreshSpeakButtons();
      setVoiceStatus("");
      resolve(false);
    };
    window.speechSynthesis.speak(utterance);
  });
}

// ── Streaming sentence TTS — speaks each sentence as AI generates it ──────
function streamTtsFlush(force = false) {
  const sentenceEnd = /[.!?।\n]{1}(?:\s|$)/;
  let buf = streamTtsSentenceBuffer;
  if (!buf.trim()) return;

  if (!force && !sentenceEnd.test(buf)) return; // wait for sentence end

  const sentences = buf.split(/(?<=[.!?।])\s+/);
  const ready = force ? sentences : sentences.slice(0, -1);
  const leftover = force ? "" : (sentences[sentences.length - 1] || "");

  streamTtsSentenceBuffer = leftover;
  for (const s of ready) {
    const clean = extractSpeechText(s);
    if (clean && clean.length > 2) streamTtsQueue.push(clean);
  }
  if (!streamTtsSpeaking) streamTtsDrainQueue();
}

async function streamTtsDrainQueue() {
  if (streamTtsSpeaking || !streamTtsQueue.length) return;
  streamTtsSpeaking = true;
  while (streamTtsQueue.length > 0) {
    const sentence = streamTtsQueue.shift();
    await speakTextAloud(sentence, { languageCode: SA_LANG_MAP[voiceLanguage] || "en-ZA" });
    if (!ttsEnabled) break;
  }
  streamTtsSpeaking = false;
}

function streamTtsReset() {
  streamTtsSentenceBuffer = "";
  streamTtsQueue = [];
  streamTtsSpeaking = false;
}


async function speakReplyText(replyText, voiceContext) {
  const cleanText = extractSpeechText(replyText);
  if (!cleanText) return;

  const preferredLanguage = normalizeVoiceReplyLanguage(
    voiceContext?.preferredOutputLanguage || voiceContext?.inputLanguageName || ""
  );
  const targetLanguageCode = String(
    voiceContext?.targetLanguageCode || languageCodeFromName(preferredLanguage) || "en"
  ).trim().toLowerCase();
  let spokenText = cleanText;

  if (targetLanguageCode && targetLanguageCode !== "en") {
    try {
      const translated = await translateWithVoiceServer(cleanText, targetLanguageCode, "auto");
      if (translated) spokenText = translated;
    } catch {}
  }

  try {
    const serverSpeech = await speakThroughVoiceServer(spokenText, targetLanguageCode || "en");
    if (serverSpeech.supported && serverSpeech.audio_base64) {
      const audio = new Audio(`data:${serverSpeech.mime_type || "audio/mpeg"};base64,${serverSpeech.audio_base64}`);
      setVoiceStatus("Speaking...");
        await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
      setVoiceStatus("");
      return true;
    }
  } catch {}

  try {
    const response = await fetch("/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spokenText,
        language: preferredLanguage || "English",
      }),
    });
    const data = await response.json();
    if (data.supported && data.audio_base64) {
      const audio = new Audio(`data:${data.mime_type || "audio/mpeg"};base64,${data.audio_base64}`);
      setVoiceStatus("Speaking...");
        await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
      setVoiceStatus("");
      return true;
    }
  } catch {}

  if ("speechSynthesis" in window) {
    return speakTextAloud(spokenText, {
      languageCode: targetLanguageCode === "nso"
        ? "nso-ZA"
        : (targetLanguageCode ? `${targetLanguageCode}-ZA` : (preferredLanguage || "en-ZA")),
    });
  }

  setVoiceStatus(preferredLanguage
    ? `Voice playback unavailable for ${preferredLanguage}.`
    : "Voice playback unavailable.");
  setTimeout(() => setVoiceStatus(""), 3000);
  return false;
}

async function toggleVoice() {
  if (isStreaming) return;

  if (mediaRecorder && isListening) {
    mediaRecorder.stop();
    return;
  }

  try {
    const started = await startRecordedVoiceInput();
    if (started) return;
  } catch (error) {
    setVoiceStatus(error.message || "Microphone unavailable.");
    setTimeout(() => setVoiceStatus(""), 2500);
  }

  if (sr) {
    startBrowserSpeechFallback();
    return;
  }

  document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => { button.disabled = true; });
}

if (!sr && (navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== "undefined")) {
  document.querySelectorAll("#voice-btn,#voice-btn-chat").forEach(button => { button.disabled = false; });
}

async function blobToVoiceServerTranscript(blob) {
  const audioBase64 = await blobToBase64(blob);
  const response = await fetch(`${VOICE_API_BASE}/voice/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_base64: audioBase64,
      mime_type: blob.type || "audio/webm",
      filename: `voice-panel-${Date.now()}.webm`,
      language_code: getSelectedVoiceLanguageCode(),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Voice server transcription failed.");
  return data;
}

async function translateWithVoiceServer(text, targetLanguageCode, sourceLanguageCode = "auto") {
  const response = await fetch(`${VOICE_API_BASE}/voice/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source_language_code: sourceLanguageCode,
      target_language_code: targetLanguageCode,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Translation failed.");
  return String(data.translated_text || "").trim();
}

async function speakThroughVoiceServer(text, languageCode) {
  const response = await fetch(`${VOICE_API_BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language_code: languageCode,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Voice server speech failed.");
  return data;
}

async function processVoicePanelBlob(blob) {
  setVoicePanelStatus("Transcribing with voice server...");
  const payload = await blobToVoiceServerTranscript(blob);
  const transcript = String(payload.text || "").trim();
  if (!transcript) throw new Error("No speech detected.");

  const selectedCode = getSelectedVoiceLanguageCode();
  const selectedName = getSelectedVoiceLanguageName();
  const detectedCode = String(payload.detected_language_code || "").trim();
  const targetCode = selectedCode === "auto" ? (detectedCode || "en") : selectedCode;
  const targetName = targetCode === detectedCode && payload.preferred_output_language
    ? payload.preferred_output_language
    : (selectedCode === "auto" ? (payload.detected_language_name || "English") : selectedName);

  voiceTranscriptEl.value = transcript;
  voiceTranscriptEl.dispatchEvent(new Event("input"));
  lastVoicePanelContext = {
    fromVoice: true,
    inputLanguageCode: detectedCode,
    inputLanguageName: payload.detected_language_name || languageNameFromCode(detectedCode),
    preferredOutputLanguage: normalizeVoiceReplyLanguage(targetName),
    processingText: payload.processing_text || transcript,
    targetLanguageCode: targetCode,
  };
  setVoicePanelStatus(
    `Transcript ready.\nDetected: ${payload.detected_language_name || languageNameFromCode(detectedCode)}\nReply language: ${targetName}`
  );
}

function languageNameFromCode(code) {
  const value = String(code || "").trim().toLowerCase();
  const map = {
    en: "English",
    nso: "Sepedi",
    zu: "isiZulu",
    xh: "isiXhosa",
    st: "Sesotho",
    tn: "Setswana",
    af: "Afrikaans",
    ts: "Xitsonga",
    ss: "siSwati",
    ve: "Tshivenda",
    nr: "isiNdebele",
    sw: "Swahili",
    fr: "French",
    pt: "Portuguese",
    ar: "Arabic",
    hi: "Hindi",
    zh: "Chinese",
    es: "Spanish",
    de: "German",
  };
  return map[value] || value || "Unknown";
}

function languageCodeFromName(name) {
  const value = String(name || "").trim().toLowerCase();
  const map = {
    english: "en",
    sepedi: "nso",
    "sepedi (northern sotho)": "nso",
    isizulu: "zu",
    zulu: "zu",
    isixhosa: "xh",
    xhosa: "xh",
    sesotho: "st",
    sotho: "st",
    setswana: "tn",
    tswana: "tn",
    afrikaans: "af",
    xitsonga: "ts",
    tsonga: "ts",
    siswati: "ss",
    swati: "ss",
    tshivenda: "ve",
    venda: "ve",
    isindebele: "nr",
    ndebele: "nr",
    swahili: "sw",
    french: "fr",
    portuguese: "pt",
    arabic: "ar",
    hindi: "hi",
    chinese: "zh",
    spanish: "es",
    german: "de",
  };
  return map[value] || "";
}

async function handleVoicePanelRecord() {
  if (voicePanelRecorder && voicePanelListening) {
    voicePanelRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    voicePanelChunks = [];
    voicePanelRecorder = new MediaRecorder(stream, { mimeType: preferredMime });
    voicePanelRecorder.ondataavailable = event => {
      if (event.data?.size) voicePanelChunks.push(event.data);
    };
    voicePanelRecorder.onstop = async () => {
      const recorder = voicePanelRecorder;
      const blob = new Blob(voicePanelChunks, { type: recorder?.mimeType || "audio/webm" });
      stream.getTracks().forEach(track => track.stop());
      voicePanelRecorder = null;
      voicePanelChunks = [];
      setVoicePanelListening(false);
      try {
        await processVoicePanelBlob(blob);
        await sendVoicePanelTranscript();
      } catch (error) {
        setVoicePanelStatus(error.message || "Voice panel failed.");
      }
    };
    voicePanelRecorder.start();
    setVoicePanelListening(true);
    setVoicePanelStatus("Recording...");
  } catch (error) {
    setVoicePanelStatus(error.message || "Microphone unavailable.");
  }
}

async function sendVoicePanelTranscript() {
  const transcript = String(voiceTranscriptEl?.value || "").trim();
  if (!transcript || isStreaming) return;

  const selectedCode = getSelectedVoiceLanguageCode();
  const context = {
    ...(lastVoicePanelContext || {}),
    fromVoice: true,
    preferredOutputLanguage: normalizeVoiceReplyLanguage(
      lastVoicePanelContext?.preferredOutputLanguage || (selectedCode === "auto" ? "" : getSelectedVoiceLanguageName())
    ),
    targetLanguageCode: lastVoicePanelContext?.targetLanguageCode || (selectedCode === "auto" ? "en" : selectedCode),
    processingText: lastVoicePanelContext?.processingText || transcript,
  };

  const input = getActiveInput();
  input.value = transcript;
  input.dispatchEvent(new Event("input"));
  currentVoiceContext = {
    fromVoice: true,
    inputLanguageCode: context.inputLanguageCode || selectedCode,
    inputLanguageName: context.inputLanguageName || getSelectedVoiceLanguageName(),
    preferredOutputLanguage: context.preferredOutputLanguage,
    processingText: context.processingText,
  };
  pendingSpokenReply = {
    preferredOutputLanguage: context.preferredOutputLanguage,
    inputLanguageName: context.inputLanguageName,
    targetLanguageCode: context.targetLanguageCode,
  };
  setVoicePanelStatus(`Sending transcript...\nReply language: ${context.preferredOutputLanguage || "English"}`);
  await sendMessage();
}

function triggerFileInput() {
  fileInput.click();
}

fileInput.addEventListener("change", async () => {
  for (const file of Array.from(fileInput.files)) {
    const dataUrl = await toDataUrl(file);
    pendingFiles.push({
      name: file.name,
      type: file.type,
      dataUrl,
      base64: dataUrl.split(",")[1],
      mimeType: file.type,
    });
  }
  fileInput.value = "";
  renderPreviews();
});

function makePastedFileName(file) {
  if (file?.name) return file.name;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = (file?.type || "").startsWith("image/")
    ? `.${(file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "")}`
    : "";
  return `pasted-${stamp}${extension || ".bin"}`;
}

async function queueFiles(files) {
  for (const file of files) {
    if (!file) continue;
    const dataUrl = await toDataUrl(file);
    pendingFiles.push({
      name: makePastedFileName(file),
      type: file.type,
      dataUrl,
      base64: dataUrl.split(",")[1],
      mimeType: file.type,
    });
  }
  renderPreviews();
}

async function handleClipboardPaste(event) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const pastedFiles = [];
  const items = Array.from(clipboard.items || []);
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file) continue;
    if (!file.type || file.type.startsWith("image/") || file.type === "application/pdf") {
      pastedFiles.push(file);
    }
  }

  if (!pastedFiles.length) return;
  event.preventDefault();
  await queueFiles(pastedFiles);
  getActiveInput().focus();
}

inputEl.addEventListener("paste", event => {
  handleClipboardPaste(event).catch(() => {});
});
inputChatEl.addEventListener("paste", event => {
  handleClipboardPaste(event).catch(() => {});
});
document.addEventListener("paste", event => {
  const target = event.target;
  const isComposerInput = target === inputEl || target === inputChatEl;
  if (isComposerInput) return;
  handleClipboardPaste(event).catch(() => {});
});

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ficon(mimeType, name) {
  const mime = mimeType || "";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📄";
  if (name.endsWith(".csv") || name.endsWith(".xlsx")) return "📊";
  if (name.endsWith(".py")) return "🐍";
  if (name.endsWith(".sql")) return "🗄️";
  return "📁";
}

function renderPreviews() {
  [previewBar, previewBarEmpty].forEach(container => {
    if (!container) return;
    container.innerHTML = "";
    pendingFiles.forEach((file, index) => {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      chip.innerHTML = `<span>${ficon(file.mimeType, file.name)}</span><span>${escHtml(file.name)}</span><span class="chip-x" onclick="rmFile(${index})">×</span>`;
      container.appendChild(chip);
    });
  });
}

function rmFile(index) {
  pendingFiles.splice(index, 1);
  renderPreviews();
}

function buildContent(text) {
  if (!pendingFiles.length) return text;
  const parts = pendingFiles.map(file => ({
    type: (file.mimeType || "").startsWith("image/") ? "image" : "file",
    mimeType: file.mimeType,
    base64: file.base64,
    name: file.name,
  }));
  if (text) parts.push({ type: "text", text });
  return parts;
}

function quickPrompt(text) {
  const input = getActiveInput();
  input.value = text;
  input.dispatchEvent(new Event("input"));
  sendMessage();
}

function addRow(role) {
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "avatar-wrap";
  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "ai" ? "MA" : "You";
  avatarWrap.appendChild(avatar);
  if (role === "ai") {
    const providerLetter = document.createElement("div");
    providerLetter.className = "provider-letter";
    providerLetter.textContent = "";
    avatarWrap.appendChild(providerLetter);
  }
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  row.appendChild(avatarWrap);
  row.appendChild(bubble);
  wrap.appendChild(row);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}

// ── Code panel ────────────────────────────────────────────────────────────
const LANG_EXT = {
  javascript:"js", js:"js", typescript:"ts", ts:"ts", python:"py", py:"py",
  java:"java", c:"c", cpp:"cpp", "c++":"cpp", csharp:"cs", cs:"cs",
  go:"go", rust:"rs", ruby:"rb", php:"php", swift:"swift", kotlin:"kt",
  html:"html", css:"css", sql:"sql", bash:"sh", shell:"sh", sh:"sh",
  json:"json", yaml:"yml", xml:"xml", markdown:"md", r:"r",
};
const LANG_LABEL = {
  javascript:"JavaScript", js:"JavaScript", typescript:"TypeScript", ts:"TypeScript",
  python:"Python", py:"Python", java:"Java", c:"C", cpp:"C++", "c++":"C++",
  csharp:"C#", cs:"C#", go:"Go", rust:"Rust", ruby:"Ruby", php:"PHP",
  swift:"Swift", kotlin:"Kotlin", html:"HTML", css:"CSS", sql:"SQL",
  bash:"Bash", shell:"Shell", sh:"Shell", json:"JSON", yaml:"YAML",
  xml:"XML", markdown:"Markdown", r:"R",
};

let codePanelContent = "";
let codePanelCopyTimer = null;
let codePanelExt = "txt";
let codePanelLang = null;

function openCodePanel(code, lang) {
  const panel = document.getElementById("code-panel");
  const codeEl = document.getElementById("code-panel-code");
  const langEl = document.getElementById("code-panel-lang");
  const filenameEl = document.getElementById("code-panel-filename");
  if (!panel || !codeEl) return;

  const label = LANG_LABEL[lang?.toLowerCase()] || lang || "Code";
  const ext   = LANG_EXT[lang?.toLowerCase()] || (lang || "txt").toLowerCase();
  codePanelExt = ext;
  codePanelLang = lang || null;
  langEl.textContent = label;
  filenameEl.textContent = `script.${ext}`;
  const dlExt = document.getElementById("code-dl-ext");
  if (dlExt) dlExt.textContent = ext;

  codeEl.className = lang ? `language-${lang}` : "";
  codeEl.textContent = code;
  codePanelContent = code;

  try { hljs.highlightElement(codeEl); } catch {}

  // Wrap each line in a span so CSS counters can show line numbers
  const lines = codeEl.innerHTML.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  codeEl.innerHTML = lines.map(l => `<span class="cl">${l || "​"}</span>`).join("\n");

  // Restore saved panel width if any
  const savedW = localStorage.getItem("mamishi_panel_width");
  if (savedW) panel.style.width = savedW;

  panel.classList.add("open");
  document.getElementById("panel-resize-handle")?.classList.add("visible");
  document.getElementById("code-panel-body").scrollTop = 0;
  closeCodeDropdown();
}

function closeCodePanel() {
  const panel = document.getElementById("code-panel");
  panel?.classList.remove("open");
  document.getElementById("panel-resize-handle")?.classList.remove("visible");
  closeCodeDropdown();
}

function copyCodePanel() {
  const btn = document.getElementById("code-panel-copy-btn");
  navigator.clipboard.writeText(codePanelContent || "").then(() => {
    if (btn) { btn.textContent = "Copied!"; clearTimeout(codePanelCopyTimer); codePanelCopyTimer = setTimeout(() => { btn.textContent = "Copy"; }, 1600); }
  }).catch(() => {});
}

function toggleCodeDropdown(e) {
  e.stopPropagation();
  document.getElementById("code-copy-dropdown")?.classList.toggle("open");
}

function closeCodeDropdown() {
  document.getElementById("code-copy-dropdown")?.classList.remove("open");
}

function downloadCodePanel() {
  if (!codePanelContent) return;
  const blob = new Blob([codePanelContent], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `script.${codePanelExt}`;
  a.click();
  URL.revokeObjectURL(a.href);
  closeCodeDropdown();
}

function refreshCodePanel() {
  if (!codePanelContent) return;
  openCodePanel(codePanelContent, codePanelLang);
}

document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("code-copy-dropdown");
  const chevron = document.getElementById("code-copy-chevron");
  if (dropdown?.classList.contains("open") && !chevron?.contains(e.target) && !dropdown?.contains(e.target)) {
    closeCodeDropdown();
  }
});

// ── Sidebar resize drag ──────────────────────────────────────────────────────
(function initSidebarResize() {
  const handle  = document.getElementById("sidebar-resize-handle");
  const sidebar = document.querySelector(".sidebar");
  if (!handle || !sidebar) return;

  // Restore saved width
  const savedW = localStorage.getItem("mamishi_sidebar_width");
  if (savedW) sidebar.style.width = savedW;

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener("mousedown", e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    sidebar.style.transition = "none";
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newW  = Math.max(180, Math.min(420, startW + delta));
    sidebar.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    sidebar.style.transition = "";
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (sidebar.style.width) localStorage.setItem("mamishi_sidebar_width", sidebar.style.width);
  });
})();

// ── Panel resize drag ────────────────────────────────────────────────────────
(function initPanelResize() {
  const handle = document.getElementById("panel-resize-handle");
  const panel  = document.getElementById("code-panel");
  const body   = document.querySelector(".main-body");
  if (!handle || !panel || !body) return;

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener("mousedown", e => {
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    panel.style.transition = "none";
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const total = body.offsetWidth;
    const minW  = 280;
    const maxW  = total - 340;
    const newW  = Math.max(minW, Math.min(maxW, startW + delta));
    panel.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = "";
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (panel.style.width) localStorage.setItem("mamishi_panel_width", panel.style.width);
  });
})();

function renderMarkdown(element, text) {
  const artifact = text.match(/<<<HTML_ARTIFACT>>>([\s\S]*?)<<<END_ARTIFACT>>>/);
  if (artifact) {
    const before = text.substring(0, text.indexOf("<<<HTML_ARTIFACT>>>")).trim();
    element.innerHTML = before ? DOMPurify.sanitize(marked.parse(before)) : "";
    upgradeLinks(element);
    renderArtifact(element, artifact[1].trim());
    if (element.classList.contains("ai")) addSpeakButton(element, text);
    return;
  }

  element.innerHTML = DOMPurify.sanitize(marked.parse(text));
  upgradeLinks(element);

  // Replace each code block with a compact reference card + open in panel
  let lastCodeBlock = null;
  let lastCodeLang = null;
  element.querySelectorAll("pre").forEach(pre => {
    if (pre.closest(".code-ref-card")) return;
    const codeEl = pre.querySelector("code");
    const langClass = (codeEl?.className || "").match(/language-(\w+)/);
    const lang = langClass ? langClass[1] : null;
    const label = LANG_LABEL[lang?.toLowerCase()] || lang || "Code";
    const ext   = LANG_EXT[lang?.toLowerCase()] || (lang || "txt").toLowerCase();
    const code  = codeEl?.textContent || "";

    // Build compact reference card
    const card = document.createElement("div");
    card.className = "code-ref-card";
    card.innerHTML = `
      <div class="code-ref-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </div>
      <div class="code-ref-info">
        <div class="code-ref-lang">${escHtml(label)}</div>
        <div class="code-ref-name">script.${escHtml(ext)}</div>
      </div>
      <button class="code-ref-open" title="Open in panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open
      </button>`;

    card.dataset.code = code;
    card.dataset.lang = lang || "";

    card.onclick = () => openCodePanel(card.dataset.code, card.dataset.lang);
    card.querySelector(".code-ref-open").onclick = e => { e.stopPropagation(); openCodePanel(card.dataset.code, card.dataset.lang); };

    pre.parentNode.replaceChild(card, pre);

    lastCodeBlock = code;
    lastCodeLang = lang || "";
  });

  // Auto-open last code block in panel for AI messages
  if (element.classList.contains("ai") && lastCodeBlock) {
    openCodePanel(lastCodeBlock, lastCodeLang);
  }

  if (element.classList.contains("ai")) addSpeakButton(element, text);
}

function upgradeLinks(container) {
  container.querySelectorAll("a").forEach(link => {
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
}

function prepareArtifactHtml(html) {
  const baseTag = '<base target="_blank">';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  return `${baseTag}${html}`;
}

function renderArtifact(container, html) {
  const block = document.createElement("div");
  block.className = "artifact-block";
  const header = document.createElement("div");
  header.className = "artifact-header";
  header.innerHTML = `<span>🎨 Live Preview</span><div class="artifact-actions"><button class="artifact-btn" onclick="expandArtifact(this)">Expand</button><button class="artifact-btn" onclick="downloadArtifact(this)">Download</button></div>`;
  const frame = document.createElement("iframe");
  frame.className = "artifact-frame";
  frame.style.height = "400px";
  frame.sandbox = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";
  frame.srcdoc = prepareArtifactHtml(html);
  frame.dataset.html = prepareArtifactHtml(html);
  block.appendChild(header);
  block.appendChild(frame);
  container.appendChild(block);
}

function expandArtifact(button) {
  const frame = button.closest(".artifact-block").querySelector("iframe");
  const height = frame.style.height === "400px" ? "700px" : "400px";
  frame.style.height = height;
  button.textContent = height === "700px" ? "Collapse" : "Expand";
}

function downloadArtifact(button) {
  const frame = button.closest(".artifact-block").querySelector("iframe");
  const blob = new Blob([frame.dataset.html], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "mamishi-output.html";
  link.click();
}

function escHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeAssistantUiText(text) {
  return String(text || "")
    .replace(/^\s*\{\s*"action"\s*:\s*"(search|web_search|read_file|write_file|execute_command|list_dir|analyze_data|create_document)"[\s\S]*?\}\s*$/gim, "")
    .replace(/^\s*(we need to|use web search|search web|assuming we have a tool|we will attempt to|we need to execute|current time in [^\n]+)\b.*$/gim, "")
    .trim();
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const TICONS = {
  execute_command: "⚡",
  read_file: "📖",
  write_file: "✏️",
  list_dir: "📁",
  web_search: "🔍",
  analyze_data: "📊",
  create_document: "📄",
};

function lastAiBubble() {
  const rows = chatEl.querySelectorAll(".message-row.ai");
  return rows.length ? rows[rows.length - 1].querySelector(".bubble") : null;
}

function addToolBlock(name, input) {
  let container = lastAiBubble();
  if (!container) container = addRow("ai");
  const block = document.createElement("div");
  block.className = "tool-block";
  const cmd = input.command || input.query || input.path || input.file_path || input.filename || (input.doc_type ? "Creating " + input.doc_type : "(workspace)");
  block.innerHTML = `<div class="tool-header"><span>${TICONS[name] || "🔧"}</span><span class="tool-name-label">${escHtml(name)}</span><span class="tool-status running">running</span></div><div class="tool-cmd">${escHtml(cmd)}</div><div class="tool-output">Working...</div>`;
  container.appendChild(block);
  chatEl.scrollTop = chatEl.scrollHeight;
  return block;
}

function renderTableOutput(container, csv) {
  try {
    const lines = csv.trim().split("\n").filter(line => line.trim());
    if (lines.length < 2) {
      container.textContent = csv;
      return;
    }
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map(line => line.split(","));
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(header => {
      const th = document.createElement("th");
      th.textContent = header.trim();
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.slice(0, 20).forEach(row => {
      const tr = document.createElement("tr");
      row.forEach(cell => {
        const td = document.createElement("td");
        td.textContent = cell.trim();
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);
    if (rows.length > 20) {
      const note = document.createElement("div");
      note.style.cssText = "padding:4px 10px;color:var(--muted);font-size:10px;";
      note.textContent = `Showing 20 of ${rows.length} rows`;
      container.appendChild(note);
    }
  } catch {
    container.textContent = csv;
  }
}

function renderAnalysisResult(block, result) {
  const output = block.querySelector(".tool-output");
  const columns = Object.keys(result.summary || {});
  let html = `<div style="color:#cdd6f4;padding:4px 0;"><strong>📊 ${result.rows} rows × ${result.columns} columns</strong></div>`;
  html += `<div style="color:var(--muted);font-size:11px;margin-top:4px;">Columns: ${(result.column_names || []).join(", ")}</div>`;
  if (columns.length) {
    html += `<div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;">`;
    columns.forEach(column => {
      const stats = result.summary[column];
      html += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:8px;border:1px solid #333;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;">${column}</div><div style="font-size:15px;font-weight:600;color:#f28c38;margin-top:2px;">${stats.mean}</div><div style="font-size:10px;color:var(--muted);">min ${stats.min} · max ${stats.max}</div></div>`;
    });
    html += `</div>`;
  }
  output.innerHTML = html;
  output.classList.add("search-out");
  if (result.chart_path) {
    const note = document.createElement("div");
    note.style.cssText = "padding:8px 14px;font-size:12px;color:#a6e3a1;border-top:1px solid var(--tool-line);";
    note.textContent = `📈 Chart saved: ${result.chart_path.split(/[/\\]/).pop()}`;
    block.appendChild(note);
  }
}

function updateToolBlock(block, result) {
  const status = block.querySelector(".tool-status");
  const output = block.querySelector(".tool-output");
  let text = "";
  let isError = false;

  if (result.error) {
    text = "Error: " + result.error;
    isError = true;
  } else if (result.results) {
    text = result.results.map(item => `📰 ${item.title}\n🔗 ${item.url}\n${item.content}`).join("\n\n");
    output.classList.add("search-out");
  } else if (result.rows !== undefined) {
    renderAnalysisResult(block, result);
    status.textContent = "done";
    status.className = "tool-status done";
    chatEl.scrollTop = chatEl.scrollHeight;
    return;
  } else if (result.stdout !== undefined) {
    const raw = result.stdout || "(no output)";
    text = result.stderr ? raw + "\n[stderr] " + result.stderr : raw;
    if (result.returncode !== 0) isError = true;
    if (raw.includes(",") && raw.split("\n").length > 2) {
      renderTableOutput(output, raw);
      status.textContent = isError ? "error" : "done";
      status.className = "tool-status " + (isError ? "error" : "done");
      if (isError) output.classList.add("error-out");
      chatEl.scrollTop = chatEl.scrollHeight;
      return;
    }
  } else if (result.content !== undefined) {
    text = result.content.slice(0, 1500) + (result.content.length > 1500 ? "\n…(truncated)" : "");
  } else if (result.entries !== undefined) {
    text = result.entries.map(entry => `${entry.type === "dir" ? "📁" : "📄"} ${entry.name}${entry.size != null ? ` (${fmtBytes(entry.size)})` : ""}`).join("\n") || "(empty)";
  } else if (result.bytes_written !== undefined) {
    text = `✅ Wrote ${fmtBytes(result.bytes_written)} → ${result.path}`;
  } else if (result.created) {
    text = `✅ ${result.message}\n📂 ${result.path}`;
  } else if (result.message) {
    text = result.message;
  } else {
    text = JSON.stringify(result, null, 2);
  }

  status.textContent = isError ? "error" : "done";
  status.className = "tool-status " + (isError ? "error" : "done");
  output.textContent = text;
  if (isError) output.classList.add("error-out");
  chatEl.scrollTop = chatEl.scrollHeight;
}

const statusCounts = { gemini: 0, groq: 0, ollama: 0, openrouter: 0, tavily: 0 };
let statusTimer = null;

function setActiveDot(name) {
  ["gemini", "groq", "ollama", "openrouter", "tavily"].forEach(key => {
    const element = document.getElementById("sd-" + key);
    if (element) element.className = "status-dot";
  });

  const element = document.getElementById("sd-" + name);
  if (element) {
    element.className = `status-dot ${name} active`;
    if (statusCounts[name] !== undefined) {
      statusCounts[name] += 1;
      const count = document.getElementById("ct-" + name);
      if (count) count.textContent = statusCounts[name];
    }
  }

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => resetDots(), 3000);
}

function resetDots() {
  ["gemini", "groq", "ollama", "openrouter", "tavily"].forEach(key => {
    const element = document.getElementById("sd-" + key);
    if (element) element.className = "status-dot";
  });
  setStatusNotice("");
}

function setStatusNotice(text) {
  const element = document.getElementById("status-notice");
  if (element) element.textContent = text;
}

function handleBackendEvent(data) {
  if (data.backend_info) {
    if (data.backend_info.includes("Gemini")) setActiveDot("gemini");
    else if (data.backend_info.includes("Groq")) setActiveDot("groq");
    else if (data.backend_info === "P" || data.backend_info.includes("OpenRouter")) setActiveDot("openrouter");
    else if (data.backend_info.includes("Ollama")) setActiveDot("ollama");
  }
  if (data.notice) {
    if (data.notice.includes("Groq")) setActiveDot("groq");
    if (data.notice.includes("OpenRouter") || data.notice.includes("P ")) setActiveDot("openrouter");
    if (data.notice.includes("Ollama")) setActiveDot("ollama");
    if (data.notice.includes("Gemini")) setActiveDot("gemini");
    setStatusNotice(
      data.notice.includes("Gemini") && data.notice.includes("Groq") ? "G -> O" :
      data.notice.includes("Groq") && (data.notice.includes("OpenRouter") || data.notice.includes("P ")) ? "O -> P" :
      data.notice.includes("Groq") && data.notice.includes("Ollama") ? "O -> R" :
      (data.notice.includes("OpenRouter") || data.notice.includes("P ")) && data.notice.includes("Ollama") ? "P -> R" :
      data.notice.includes("Gemini") ? "G" :
      data.notice.includes("Groq") ? "O" :
      data.notice.includes("Ollama") ? "R" :
      (data.notice.includes("OpenRouter") || data.notice.includes("P ")) ? "P" :
      data.notice.includes("Tavily") ? "T" : ""
    );
  }
  if (data.backend) {
    setActiveDot(data.backend);
  }
  if (data.tool_start && data.tool_start.name === "web_search") {
    setActiveDot("tavily");
    setStatusNotice("Searching web...");
  }
  if (data.tool_end && data.tool_end.name === "web_search") {
    setStatusNotice("");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => resetDots(), 2000);
  }
}

async function initBackendStatus() {
  try {
    const response = await fetch("/workdir");
    const data = await response.json();
    if (data.backends?.gemini?.available || data.backends?.gemini?.ready || data.backends?.gemini?.key) {
      const dot = document.getElementById("sd-gemini");
      if (dot) dot.className = "status-dot gemini";
    }
    if (data.backends?.groq?.available || data.backends?.groq?.ready || data.backends?.groq?.key) {
      const dot = document.getElementById("sd-groq");
      if (dot) dot.className = "status-dot groq";
    }
    if (data.backends?.ollama?.available || data.backends?.ollama?.ready) {
      const dot = document.getElementById("sd-ollama");
      if (dot) dot.className = "status-dot ollama";
    }
    if (data.backends?.tavily?.available || data.backends?.tavily?.ready) {
      const dot = document.getElementById("sd-tavily");
      if (dot) dot.className = "status-dot tavily";
    }
  } catch {
    return;
  }
}

async function sendMessage() {
  const input = getActiveInput();
  const text = input.value.trim();
  if ((!text && !pendingFiles.length) || isStreaming) return;

  const fullText = text || "(see attached)";
  const voiceContext = currentVoiceContext;
  currentVoiceContext = null;

  if (!currentSession) startNewSession(fullText);

  messages.push({ role: "user", content: buildContent(fullText) });

  showChat();
  const userBubble = addRow("user");
  for (const file of pendingFiles) {
    if ((file.mimeType || "").startsWith("image/")) {
      const img = document.createElement("img");
      img.src = file.dataUrl;
      img.className = "msg-image";
      userBubble.appendChild(img);
    } else {
      const badge = document.createElement("div");
      badge.className = "msg-file";
      badge.innerHTML = `${ficon(file.mimeType, file.name)} ${escHtml(file.name)}`;
      userBubble.appendChild(badge);
    }
  }
  if (text) {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = escHtml(text).replace(/\n/g, "<br>");
    userBubble.appendChild(paragraph);
  }

  input.value = "";
  input.style.height = "auto";
  pendingFiles = [];
  renderPreviews();

  await streamAssistantResponse(voiceContext);
}

async function streamAssistantResponse(voiceContext = null) {
  const aiBubble = addRow("ai");
  const providerBadge = aiBubble.closest(".message-row").querySelector(".provider-letter");
  const typingDots = document.createElement("div");
  typingDots.className = "typing-dots";
  typingDots.innerHTML = '<span></span><span></span><span></span>';
  const responseContent = document.createElement("div");
  responseContent.className = "assistant-response-content";
  aiBubble.appendChild(typingDots);
  aiBubble.appendChild(responseContent);

  isStreaming = true;
  if (ttsEnabled) streamTtsReset();
  document.querySelectorAll("#send-btn,#send-btn-chat").forEach(button => { button.disabled = true; });
  document.getElementById("stop-btn")?.classList.add("visible");
  updateRetryButton();
  let fullResp = "";
  let typingGone = false;
  const blocks = {};
  lastNoticeMessage = "";
  lastBackendError = "";

  function clearTyping() {
    if (!typingGone) {
      typingDots.remove();
      typingGone = true;
    }
  }

  try {
    const selectedBackend = backendSelect?.value || currentBackend;
    currentBackend = selectedBackend || null;
      const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, project: currentProj, model: currentModel, backend: currentBackend, voice: voiceContext }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let data;
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (data.error) {
          clearTyping();
          const errorParagraph = document.createElement("p");
          errorParagraph.style.color = "var(--danger)";
          const rawError = String(data.error || "");
          const isTechnicalError = rawError.includes("All backends failed") || rawError.includes(":502") || rawError.includes(":5");
          const isPBackendError = /(?:P|OpenRouter|fetch failed|ENOTFOUND|EAI_|ECONNREFUSED|ECONNRESET|socket hang up)/i.test(rawError);
          const formattedError = isTechnicalError
            ? "Service temporarily unavailable. Please try again later."
            : isPBackendError
              ? "Please use System Default. P is not available at the moment. Try it later."
              : rawError;
          if (formattedError !== lastBackendError) {
            lastBackendError = formattedError;
            errorParagraph.textContent = formattedError;
            responseContent.appendChild(errorParagraph);
          }
        }
        if (data.text) {
          clearTyping();
          fullResp += data.text;
          const safeResp = sanitizeAssistantUiText(fullResp);
          if (safeResp) {
            renderMarkdown(responseContent, safeResp);
          }
          if (ttsEnabled && !voiceContext) {
            streamTtsSentenceBuffer += data.text;
            streamTtsFlush();
          }
        }
        handleBackendEvent(data, providerBadge, responseContent);
        if (data.tool_start && SHOW_TOOL_TRACES) {
          clearTyping();
          blocks[data.tool_start.name] = addToolBlock(data.tool_start.name, data.tool_start.input);
        }
        if (data.tool_end && SHOW_TOOL_TRACES) {
          const block = blocks[data.tool_end.name];
          if (block) updateToolBlock(block, data.tool_end.result);
        }
      }
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    const safeResp = sanitizeAssistantUiText(fullResp);
    messages.push({ role: "assistant", content: safeResp || "(used tools)" });
    saveCurrentSession();
    renderSidebar();
    updateRetryButton();
    let spokeReply = false;
    if (safeResp && voiceContext && pendingSpokenReply && (voiceAutoSpeakEl?.checked ?? true)) {
      const replyVoiceContext = pendingSpokenReply;
      pendingSpokenReply = null;
      spokeReply = await speakReplyText(safeResp, replyVoiceContext);
      setVoicePanelStatus(spokeReply
        ? `Reply delivered in ${replyVoiceContext.preferredOutputLanguage || "the requested language"}.`
        : "Reply generated, but voice playback was unavailable.");
      if (voiceAutoListenEl?.checked && document.getElementById("voice-overlay")?.classList.contains("open")) {
        setTimeout(() => { handleVoicePanelRecord(); }, 700);
      }
    } else if (safeResp && ttsEnabled && !voiceContext) {
      streamTtsFlush(true);
      await streamTtsDrainQueue();
      spokeReply = true;
    } else if (voiceContext) {
      pendingSpokenReply = null;
    } else if (!voiceContext) {
      pendingSpokenReply = null;
    }
  } catch (error) {
    clearTyping();
    aiBubble.innerHTML += `<p style="color:var(--danger)">Connection error: ${escHtml(error.message)}</p>`;
    updateRetryButton();
    pendingSpokenReply = null;
  } finally {
    isStreaming = false;
    document.querySelectorAll("#send-btn,#send-btn-chat").forEach(button => { button.disabled = false; });
    document.getElementById("stop-btn")?.classList.remove("visible");
    updateRetryButton();
    getActiveInput().focus();
  }
}

async function retryLastTurn() {
  if (isStreaming) return;

  const lastUserIndex = findLastUserIndex();
  if (lastUserIndex === -1) return;

  messages = messages.slice(0, lastUserIndex + 1);
  const lastAiRow = chatEl.querySelector(".message-row.ai:last-of-type");
  if (lastAiRow) {
    lastAiRow.closest(".msg-wrap")?.remove();
  } else {
    const aiRows = chatEl.querySelectorAll(".message-row.ai");
    if (aiRows.length) {
      aiRows[aiRows.length - 1].closest(".msg-wrap")?.remove();
    }
  }

  saveCurrentSession();
  renderSidebar();
  showChat();
  resetTurnUsageSeen();
  await streamAssistantResponse();
}

const statusCounterLabels = { gemini: "G", groq: "O", ollama: "R", openrouter: "P", tavily: "T" };
let turnUsageSeen = { gemini: false, groq: false, ollama: false, openrouter: false, tavily: false };
let backendAvailability = { gemini: false, groq: false, ollama: false, openrouter: false, tavily: false };
let lastNoticeMessage = "";
let lastBackendError = "";
let currentActiveStatus = null;
let backendStatusPollTimer = null;

function updateStatusCounter(name) {
  const element = document.getElementById("ct-" + name);
  if (element) element.textContent = `${statusCounterLabels[name]}:${statusCounts[name]}`;
}

function markStatusUsage(name, oncePerTurn = true) {
  if (statusCounts[name] === undefined) return;
  if (oncePerTurn && turnUsageSeen[name]) return;
  if (oncePerTurn) turnUsageSeen[name] = true;
  statusCounts[name] += 1;
  updateStatusCounter(name);
}

function resetTurnUsageSeen() {
  turnUsageSeen = { gemini: false, groq: false, ollama: false, openrouter: false, tavily: false };
}

function renderStatusDot(name, active = false) {
  const element = document.getElementById("sd-" + name);
  if (!element) return;
  if (active) {
    element.className = `status-dot ${name} active`;
    return;
  }
  element.className = backendAvailability[name] ? `status-dot ${name}` : "status-dot off";
}

function setIdleDots() {
  ["gemini", "groq", "ollama", "openrouter", "tavily"].forEach(key => {
    renderStatusDot(key, false);
  });
}

setActiveDot = function(name) {
  currentActiveStatus = name;
  setIdleDots();
  renderStatusDot(name, true);

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => resetDots(), 3000);
};

resetDots = function() {
  currentActiveStatus = null;
  setIdleDots();
  setStatusNotice(currentBackend === null ? "SYS" : "");
};

setStatusNotice = function(text) {
  const element = document.getElementById("status-notice");
  if (element) element.textContent = text;
};

handleBackendEvent = function(data, providerBadge = null, responseContent = null) {
  const pMode = currentBackend === "openrouter";
  const sysMode = currentBackend === null;

  const determineLetter = () => {
    if (data.backend_info) {
      if (data.backend_info.includes("Gemini")) return "G";
      if (data.backend_info.includes("Groq")) return "O";
      if (data.backend_info === "P" || data.backend_info.includes("OpenRouter")) return "P";
      if (data.backend_info.includes("Ollama")) return "R";
      if (data.backend_info.includes("Tavily")) return "T";
    }
    if (data.backend) {
      if (data.backend === "gemini") return "G";
      if (data.backend === "groq") return "O";
      if (data.backend === "openrouter") return "P";
      if (data.backend === "ollama") return "R";
      if (data.backend === "tavily") return "T";
    }
    if (data.notice) {
      if (data.notice.includes("OpenRouter") || data.notice.includes("P ")) return "P";
      if (data.notice.includes("Groq")) return "O";
    }
    return "";
  };

  const backendLetter = determineLetter();
  if (providerBadge && backendLetter) {
    providerBadge.textContent = `[${backendLetter}]`;
  }

  if (data.backend_info) {
    if (data.backend_info.includes("Gemini")) {
      if (!pMode && !sysMode) {
        markStatusUsage("gemini");
        setActiveDot("gemini");
        setStatusNotice("G");
      }
    } else if (data.backend_info.includes("Groq")) {
      if (!pMode && !sysMode) {
        markStatusUsage("groq");
        setActiveDot("groq");
        setStatusNotice("O");
      }
    } else if (data.backend_info === "P" || data.backend_info.includes("OpenRouter")) {
      markStatusUsage("openrouter");
      if (!sysMode) {
        setActiveDot("openrouter");
        setStatusNotice("P");
      }
    } else if (data.backend_info.includes("Ollama")) {
      if (!pMode && !sysMode) {
        markStatusUsage("ollama");
        setActiveDot("ollama");
        setStatusNotice("R");
      }
    }
  }
  if (data.notice) {
    const rawNotice = String(data.notice || "");
    const hideOpenRouter = /\bOpenRouter\b/i.test(rawNotice);
    const hidePModelNotice = /\bP\b.*\b(?:llama-\d+\.\d+-\d+b|gemma-\d+-\d+b|qwen(?:3)?(?:-[^\s]+)?|minimax-[^\s]+|deepseek-[^\s]+|trinity-[^\s]+|lfm\d+\.[^\s]+|nvidia-[^\s]+|venice-[^\s]+|hermes-[^\s]+|qianfan-[^\s]+|nemotron-[^\s]+)\b/i.test(rawNotice);
    const sanitizedNotice = hideOpenRouter || hidePModelNotice
      ? "Please use System Default. P is not available at the moment. Try it later."
      : rawNotice;
    if (responseContent && sanitizedNotice.includes("Please use System Default")) {
      if (sanitizedNotice !== lastNoticeMessage) {
        const noticeBlock = document.createElement("div");
        noticeBlock.className = "assistant-note";
        noticeBlock.textContent = sanitizedNotice;
        responseContent.appendChild(noticeBlock);
        lastNoticeMessage = sanitizedNotice;
      }
    }
    if (sanitizedNotice.includes("Groq") && !pMode && !sysMode) {
      markStatusUsage("groq");
      setActiveDot("groq");
    }
    if (data.notice.includes("Ollama") && !pMode && !sysMode) {
      markStatusUsage("ollama");
      setActiveDot("ollama");
    }
    if (data.notice.includes("OpenRouter") || data.notice.includes("P ")) {
      markStatusUsage("openrouter");
      if (!sysMode) {
        setActiveDot("openrouter");
      }
    }
    if (data.notice.includes("Gemini") && !pMode && !sysMode) {
      markStatusUsage("gemini");
      setActiveDot("gemini");
    }
    if (!sysMode) {
      setStatusNotice(
        data.notice.includes("Gemini") && data.notice.includes("Groq") ? "G -> O" :
        data.notice.includes("Groq") && (data.notice.includes("OpenRouter") || data.notice.includes("P ")) ? "O -> P" :
        data.notice.includes("Groq") && data.notice.includes("Ollama") ? "O -> R" :
        (data.notice.includes("OpenRouter") || data.notice.includes("P ")) && data.notice.includes("Ollama") ? "P -> R" :
        data.notice.includes("Gemini") ? "G" :
        data.notice.includes("Groq") ? "O" :
        data.notice.includes("Ollama") ? "R" :
        (data.notice.includes("OpenRouter") || data.notice.includes("P ")) ? "P" :
        data.notice.includes("Tavily") ? "T" : ""
      );
    }
  }
  if (data.backend) {
    if (!sysMode && (!pMode || data.backend === "openrouter")) {
      markStatusUsage(data.backend);
      setActiveDot(data.backend);
      if (data.backend === "gemini") setStatusNotice("G");
      if (data.backend === "groq") setStatusNotice("O");
      if (data.backend === "ollama") setStatusNotice("R");
      if (data.backend === "openrouter") setStatusNotice("P");
    }
  }
  if (data.tool_start && data.tool_start.name === "web_search") {
    if (!pMode && !sysMode) {
      markStatusUsage("tavily", false);
      setActiveDot("tavily");
      setStatusNotice("T");
    }
  }
  if (data.tool_end && data.tool_end.name === "web_search") {
    setStatusNotice("");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => resetDots(), 2000);
  }
};

async function refreshBackendStatus() {
  try {
    const response = await fetch("/workdir", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    backendAvailability = {
      gemini: Boolean(data.backends?.gemini?.ready),
      groq: Boolean(data.backends?.groq?.ready),
      openrouter: Boolean(data.backends?.openrouter?.ready),
      ollama: Boolean(data.backends?.ollama?.ready),
      tavily: Boolean(data.backends?.tavily?.ready),
    };
    if (currentActiveStatus) renderStatusDot(currentActiveStatus, true);
    else setIdleDots();
    const pOption = backendSelect?.querySelector('option[value="openrouter"]');
    if (pOption) {
      if (backendAvailability.openrouter) {
        pOption.style.display = "block";
      } else {
        pOption.style.display = "none";
        if (currentBackend === "openrouter") {
          currentBackend = null;
          if (backendSelect) backendSelect.value = "";
          saveSelectedBackend(null);
          applyBackendSelectionIndicator(null);
        }
      }
    }
  } catch {
    return;
  }
}

initBackendStatus = async function() {
  ["gemini", "groq", "ollama", "openrouter", "tavily"].forEach(updateStatusCounter);
  await refreshBackendStatus();
  setStatusNotice("");
  if (!backendStatusPollTimer) {
    backendStatusPollTimer = setInterval(refreshBackendStatus, 5000);
  }
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshBackendStatus();
});

const originalSendMessage = sendMessage;
sendMessage = async function() {
  resetTurnUsageSeen();
  return originalSendMessage.apply(this, arguments);
};

const selectedBackend = loadSelectedBackend();
if (selectedBackend && selectedBackend !== "openrouter") {
  currentBackend = selectedBackend;
  if (backendSelect) backendSelect.value = selectedBackend;
}
if (chatHistory.length) saveHistory();
renderSidebar();
renderPreviews();
applyBackendSelectionIndicator(currentBackend);
restoreActiveSession();
syncVoiceModeButtons();
initBackendStatus();
