"use strict";

// ============================================================
// LOGGER v2.0 — Structured logging with levels, colors, categories
// ============================================================

const MAX_ENTRIES = 500;

// Log level definitions
const LEVELS = {
  debug: { priority: 0, label: "DEBUG", color: "\x1b[90m", emoji: "🔍" },
  info:  { priority: 1, label: "INFO",  color: "\x1b[36m", emoji: "ℹ️" },
  warn:  { priority: 2, label: "WARN",  color: "\x1b[33m", emoji: "⚠️" },
  error: { priority: 3, label: "ERROR", color: "\x1b[31m", emoji: "❌" },
  fatal: { priority: 4, label: "FATAL", color: "\x1b[1m\x1b[31m", emoji: "💀" },
};

const RESET = "\x1b[0m";

// Internal state
const logs = [];
const stats = {
  totalLogs: 0,
  errors: 0,
  warnings: 0,
  fatals: 0,
  lastError: null,
  lastFatal: null,
  startedAt: new Date().toISOString(),
};

/**
 * Extract category from message like "[Bot] something" -> "Bot"
 */
function extractCategory(message) {
  const match = String(message).match(/^\[([^\]]+)\]\s*/);
  return match ? match[1] : null;
}

/**
 * Format time as HH:MM:SS
 */
function formatTime(date) {
  return date.toTimeString().split(" ")[0]; // HH:MM:SS
}

/**
 * Condense a stack trace to the most useful lines
 */
function condenseStack(stack) {
  if (!stack) return null;
  const lines = stack.split("\n").slice(1); // skip the error message line
  const useful = lines
    .filter((l) => !l.includes("node_modules") && !l.includes("internal/"))
    .slice(0, 4)
    .map((l) => l.trim());
  return useful.length > 0 ? useful : lines.slice(0, 3).map((l) => l.trim());
}

/**
 * Core log function
 */
function log(level, message, errorObj) {
  const now = new Date();
  const levelDef = LEVELS[level] || LEVELS.info;
  const msgStr = String(message);
  const category = extractCategory(msgStr);

  // Build structured entry
  const entry = {
    timestamp: now.toISOString(),
    time: formatTime(now),
    level,
    priority: levelDef.priority,
    category,
    message: msgStr,
    meta: {},
  };

  // Handle error objects
  if (errorObj instanceof Error) {
    entry.meta.errorName = errorObj.name;
    entry.meta.errorMessage = errorObj.message;
    entry.meta.stack = condenseStack(errorObj.stack);
  } else if (errorObj !== undefined) {
    entry.meta.extra = errorObj;
  }

  // Format for display
  const displayMsg = `[${entry.time}] ${levelDef.emoji} ${msgStr}`;
  entry.formatted = displayMsg;

  // Console output with ANSI colors
  const coloredMsg = `${levelDef.color}[${entry.time}] [${levelDef.label}]${RESET} ${msgStr}`;

  if (level === "error" || level === "fatal") {
    console.error(coloredMsg);
    if (entry.meta.stack) {
      console.error(`${levelDef.color}  └─ ${entry.meta.stack.join("\n     ")}${RESET}`);
    }
  } else if (level === "warn") {
    console.warn(coloredMsg);
  } else if (level === "debug") {
    // Only show debug if DEBUG env is set
    if (process.env.DEBUG) {
      console.log(coloredMsg);
    }
  } else {
    console.log(coloredMsg);
  }

  // Store entry
  logs.push(entry);
  if (logs.length > MAX_ENTRIES) logs.shift();

  // Update stats
  stats.totalLogs++;
  if (level === "warn") stats.warnings++;
  if (level === "error") {
    stats.errors++;
    stats.lastError = { message: msgStr, time: now.toISOString() };
  }
  if (level === "fatal") {
    stats.fatals++;
    stats.lastFatal = { message: msgStr, time: now.toISOString() };
  }

  return entry;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Backward-compatible addLog — treats everything as "info" level.
 * Auto-detects level from message prefixes like [FATAL], [ERROR], etc.
 */
function addLog(message, errorObj) {
  const msg = String(message);

  // Auto-detect level from common prefixes
  if (msg.includes("[FATAL]")) return log("fatal", msg, errorObj);
  if (msg.includes("[ERROR]") || msg.includes("Error:")) return log("error", msg, errorObj);
  if (msg.includes("[WARN]") || msg.includes("Warning:")) return log("warn", msg, errorObj);
  if (msg.includes("[DEBUG]")) return log("debug", msg, errorObj);

  return log("info", msg, errorObj);
}

/**
 * Get formatted log strings (backward compatible with old getLogs)
 * @param {string} [minLevel] - Minimum level to include (debug|info|warn|error|fatal)
 */
function getLogs(minLevel) {
  const minPriority = minLevel ? (LEVELS[minLevel] || LEVELS.info).priority : 0;

  return logs
    .filter((entry) => entry.priority >= minPriority)
    .map((entry) => {
      const levelDef = LEVELS[entry.level];
      let line = `[${entry.time}] ${levelDef.emoji} ${entry.message}`;

      // Append condensed stack for errors
      if (entry.meta.stack && (entry.level === "error" || entry.level === "fatal")) {
        line += `\n    └─ ${entry.meta.stack[0]}`;
      }

      return line;
    });
}

/**
 * Get raw structured log objects
 * @param {string} [minLevel] - Minimum level to include
 */
function getLogsRaw(minLevel) {
  const minPriority = minLevel ? (LEVELS[minLevel] || LEVELS.info).priority : 0;
  return logs.filter((entry) => entry.priority >= minPriority);
}

/**
 * Get logging statistics
 */
function getStats() {
  return {
    ...stats,
    bufferSize: logs.length,
    maxBuffer: MAX_ENTRIES,
    uptime: Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000),
  };
}

/**
 * Logger object with level-specific methods
 */
const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, errOrMeta) => log("error", msg, errOrMeta),
  fatal: (msg, errOrMeta) => log("fatal", msg, errOrMeta),

  // Utility: log with explicit category
  withCategory: (category, level, msg, meta) => {
    return log(level || "info", `[${category}] ${msg}`, meta);
  },
};

module.exports = { addLog, getLogs, getLogsRaw, logger, getStats };
