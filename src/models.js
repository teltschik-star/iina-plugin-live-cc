/** Capability checks derived from a whisper.cpp model's filename. */

function basename(p) {
  const s = String(p || "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * Models ending in `.en` are English-only. Whisper ignores the language and
 * translate options entirely for these, transcribing everything as English.
 */
function isEnglishOnly(modelPath) {
  return /\.en(-q\d+_\d+)?\.bin$/i.test(basename(modelPath));
}

/**
 * Whether the model can honour `--translate`.
 *
 * English-only models cannot. Neither can large-v3-turbo: it is a distilled,
 * transcription-only variant, and whisper accepts the flag then silently
 * returns the source language — verified against ggml-small on the same audio.
 */
function canTranslate(modelPath) {
  const name = basename(modelPath);
  if (!name) return false;
  if (isEnglishOnly(name)) return false;
  if (/turbo/i.test(name)) return false;
  return true;
}

/** Whether whisper will report a detected language for this model. */
function detectsLanguage(modelPath) {
  return !!basename(modelPath) && !isEnglishOnly(modelPath);
}

module.exports = { basename, isEnglishOnly, canTranslate, detectsLanguage };
