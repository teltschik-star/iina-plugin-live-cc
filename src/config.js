const { preferences } = iina;

const DEFAULTS = {
  whisperPath: "",
  modelPath: "@data/models/ggml-base.en.bin",
  language: "auto",
  translate: false,
  vad: false,
  vadThreshold: 0.5,
  chunkSeconds: 30,
  chunkTailSeconds: 3,
  lookaheadChunks: 2,
  threads: 0,
  maxLineLength: 52,
  fontSize: 28,
  position: "bottom",
  autoStart: false,
  showStatus: true,
};

function asNumber(value, fallback, min, max) {
  const n = parseFloat(value);
  if (!isFinite(n)) return fallback;
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
}

function asBool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function asString(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * Read the current preference values, coerced and clamped to sane ranges.
 * Preference pages hand back strings, so nothing here can be trusted to be typed.
 */
function read() {
  return {
    whisperPath: asString(preferences.get("whisper_path"), DEFAULTS.whisperPath),
    modelPath: asString(preferences.get("model_path"), DEFAULTS.modelPath),
    language: asString(preferences.get("language"), DEFAULTS.language),
    translate: asBool(preferences.get("translate"), DEFAULTS.translate),
    vad: asBool(preferences.get("vad"), DEFAULTS.vad),
    vadThreshold: asNumber(preferences.get("vad_threshold"), DEFAULTS.vadThreshold, 0.05, 0.95),
    chunkSeconds: asNumber(preferences.get("chunk_seconds"), DEFAULTS.chunkSeconds, 10, 300),
    chunkTailSeconds: asNumber(
      preferences.get("chunk_tail_seconds"),
      DEFAULTS.chunkTailSeconds,
      0,
      15,
    ),
    lookaheadChunks: asNumber(
      preferences.get("lookahead_chunks"),
      DEFAULTS.lookaheadChunks,
      0,
      20,
    ),
    threads: asNumber(preferences.get("threads"), DEFAULTS.threads, 0, 64),
    maxLineLength: asNumber(preferences.get("max_line_length"), DEFAULTS.maxLineLength, 0, 200),
    fontSize: asNumber(preferences.get("font_size"), DEFAULTS.fontSize, 10, 96),
    position: preferences.get("position") === "top" ? "top" : DEFAULTS.position,
    autoStart: asBool(preferences.get("auto_start"), DEFAULTS.autoStart),
    showStatus: asBool(preferences.get("show_status"), DEFAULTS.showStatus),
  };
}

module.exports = { read, DEFAULTS };
