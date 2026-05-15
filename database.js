const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(os.homedir(), "mamishi-ai-workspace", "mamishi.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL DEFAULT '',
      correction TEXT NOT NULL,
      preferred_answer TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fact',
      topic TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'user',
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      backend TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_created ON corrections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preferences_created ON preferences(created_at DESC);
  `);
}

// ── Corrections ────────────────────────────────────────────────────────────

function saveCorrection(entry) {
  const d = getDb();
  const exists = d.prepare("SELECT id FROM corrections WHERE correction = ?").get(entry.correction);
  if (exists) return false;
  d.prepare(`
    INSERT INTO corrections (id, created_at, keywords, prompt, correction, preferred_answer)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.created_at,
    JSON.stringify(entry.keywords || []),
    entry.prompt || "",
    entry.correction,
    entry.preferred_answer || ""
  );
  return true;
}

function loadCorrections(limit = 200) {
  return getDb()
    .prepare("SELECT * FROM corrections ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(row => ({
      ...row,
      keywords: JSON.parse(row.keywords || "[]"),
    }));
}

function findRelevantCorrections(keywords, limit = 3) {
  if (!keywords.length) return [];
  const all = loadCorrections();
  return all
    .map(item => ({
      item,
      score: keywords.filter(k => (item.keywords || []).includes(k)).length,
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item);
}

// ── Long-term Memory (learned facts) ───────────────────────────────────────

function saveMemory(entry) {
  const d = getDb();
  const existing = d.prepare("SELECT id FROM memories WHERE content = ? AND type = ?").get(entry.content, entry.type);
  if (existing) {
    d.prepare("UPDATE memories SET updated_at = ?, access_count = access_count + 1 WHERE id = ?")
      .run(new Date().toISOString(), existing.id);
    return existing.id;
  }
  d.prepare(`
    INSERT INTO memories (id, created_at, updated_at, type, topic, content, keywords, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.created_at,
    entry.created_at,
    entry.type || "fact",
    entry.topic || "",
    entry.content,
    JSON.stringify(entry.keywords || []),
    entry.source || "user"
  );
  return entry.id;
}

function searchMemories(keywords, type = null, limit = 5) {
  if (!keywords.length) return [];
  const all = getDb()
    .prepare(type
      ? "SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC LIMIT 500"
      : "SELECT * FROM memories ORDER BY created_at DESC LIMIT 500"
    )
    .all(...(type ? [type] : []))
    .map(row => ({ ...row, keywords: JSON.parse(row.keywords || "[]") }));

  return all
    .map(item => ({
      item,
      score: keywords.filter(k => item.keywords.includes(k) || item.content.toLowerCase().includes(k)).length,
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item);
}

function getAllMemories(type = null, limit = 100) {
  const d = getDb();
  if (type) {
    return d.prepare("SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC LIMIT ?")
      .all(type, limit)
      .map(row => ({ ...row, keywords: JSON.parse(row.keywords || "[]") }));
  }
  return d.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(row => ({ ...row, keywords: JSON.parse(row.keywords || "[]") }));
}

function deleteMemory(id) {
  return getDb().prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
}

// ── Preferences ────────────────────────────────────────────────────────────

function savePreference(content) {
  const d = getDb();
  const exists = d.prepare("SELECT id FROM preferences WHERE content = ?").get(content);
  if (exists) return;
  const id = `pref-${Date.now().toString(36)}`;
  d.prepare("INSERT INTO preferences (id, created_at, content) VALUES (?, ?, ?)")
    .run(id, new Date().toISOString(), content);
}

function loadPreferences() {
  return getDb()
    .prepare("SELECT content FROM preferences ORDER BY created_at DESC LIMIT 50")
    .all()
    .map(r => r.content);
}

function clearPreferences() {
  getDb().prepare("DELETE FROM preferences").run();
}

// ── Chat history metadata ──────────────────────────────────────────────────

function saveChatSummary(entry) {
  getDb().prepare(`
    INSERT OR REPLACE INTO chat_history (id, created_at, project, title, summary, backend)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.id, entry.created_at, entry.project || "general", entry.title || "", entry.summary || "", entry.backend || "");
}

function loadChatHistory(project = null, limit = 50) {
  const d = getDb();
  if (project) {
    return d.prepare("SELECT * FROM chat_history WHERE project = ? ORDER BY created_at DESC LIMIT ?").all(project, limit);
  }
  return d.prepare("SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?").all(limit);
}

// ── Stats ──────────────────────────────────────────────────────────────────

function getMemoryStats() {
  const d = getDb();
  return {
    corrections: d.prepare("SELECT COUNT(*) as n FROM corrections").get().n,
    memories: d.prepare("SELECT COUNT(*) as n FROM memories").get().n,
    preferences: d.prepare("SELECT COUNT(*) as n FROM preferences").get().n,
    chats: d.prepare("SELECT COUNT(*) as n FROM chat_history").get().n,
    db_path: DB_PATH,
  };
}

module.exports = {
  getDb,
  saveCorrection,
  loadCorrections,
  findRelevantCorrections,
  saveMemory,
  searchMemories,
  getAllMemories,
  deleteMemory,
  savePreference,
  loadPreferences,
  clearPreferences,
  saveChatSummary,
  loadChatHistory,
  getMemoryStats,
};
