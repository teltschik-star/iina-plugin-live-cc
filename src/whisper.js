const { utils, file, console } = iina;

const cleanup = require("./cleanup.js");

// whisper.cpp emits these markers for non-speech audio. They are noise for a
// caption track.
const NOISE = /^\s*[\[(](blank_audio|silence|music|applause|inaudible|no speech)[\])]\s*$/i;

/**
 * Run whisper.cpp over a WAV file and return cues with times relative to the
 * start of that WAV.
 *
 * @param {string} bin path to whisper-cli
 * @param {string} wavPath 16 kHz mono WAV
 * @param {string} outBase output path without extension; whisper writes `${outBase}.json`
 * @param {object} opts
 * @returns {Promise<{cues: Array<{start: number, end: number, text: string}>, language: string|null}>}
 *   `language` is the code whisper detected (or was told to use), or null.
 */
async function transcribe(bin, wavPath, outBase, opts) {
  const args = [
    "-m", opts.model,
    "-f", wavPath,
    "-oj",
    "-of", outBase,
    "-np",
    // Suppress non-speech tokens. Measured on a quiet film passage this turned a
    // garbled hallucination into the dialogue that was actually spoken, and left
    // clean speech byte-identical.
    "-sns",
    "-l", opts.language && opts.language !== "" ? opts.language : "auto",
  ];

  // Voice activity detection drops non-speech audio before decoding, which is
  // where hallucinations come from. It is opt-in because it also discards quiet
  // speech: on one test passage it returned nothing at threshold 0.5 and 0.2,
  // but recovered the dialogue at 0.3 — not a behaviour to enable by default.
  if (opts.vad && opts.vadModel) {
    args.push("--vad", "-vm", opts.vadModel);
    if (opts.vadThreshold > 0) args.push("-vt", String(opts.vadThreshold));
  }

  if (opts.translate) args.push("-tr");
  if (opts.threads > 0) args.push("-t", String(Math.round(opts.threads)));
  if (opts.maxLineLength > 0) {
    // -sow splits on word boundaries so -ml does not cut words in half.
    args.push("-ml", String(Math.round(opts.maxLineLength)), "-sow");
  }

  const { status, stderr } = await utils.exec(bin, args);
  if (status !== 0) {
    throw new Error(`whisper exited with ${status}: ${(stderr || "").trim()}`);
  }

  const jsonPath = `${outBase}.json`;
  const raw = file.read(jsonPath);
  if (!raw) {
    throw new Error(`whisper produced no output at ${jsonPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`could not parse whisper output: ${e}`);
  }

  const segments = (parsed && parsed.transcription) || [];
  const cues = [];
  for (const seg of segments) {
    if (!seg || !seg.offsets) continue;
    const text = (seg.text || "").trim();
    if (!text || NOISE.test(text)) continue;
    cues.push({
      start: seg.offsets.from / 1000,
      end: seg.offsets.to / 1000,
      text,
    });
  }

  try {
    file.delete(jsonPath);
  } catch (e) {
    console.warn(`Could not remove ${jsonPath}: ${e}`);
  }

  // whisper reports the language it detected (or was given) here; it is absent
  // for English-only models, which never run detection.
  const language =
    parsed && parsed.result && parsed.result.language
      ? String(parsed.result.language).toLowerCase()
      : null;

  return { cues: cleanup.clean(cues), language };
}

module.exports = { transcribe };
