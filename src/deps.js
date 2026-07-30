const { utils, file, http, console } = iina;

// IINA is a GUI app, so its PATH usually does not include Homebrew. Absolute
// candidates are tried first, and the bare names last as a fallback for users
// who launch IINA from a shell.
const WHISPER_CANDIDATES = [
  "/opt/homebrew/bin/whisper-cli",
  "/usr/local/bin/whisper-cli",
  "/opt/homebrew/bin/whisper-cpp",
  "/usr/local/bin/whisper-cpp",
  "whisper-cli",
  "whisper-cpp",
];

const FFMPEG_CANDIDATES = [
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "ffmpeg",
];

const MODEL_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

// The VAD model lives in a different repository from the speech models.
const VAD_MODEL_NAME = "ggml-silero-v5.1.2.bin";
const VAD_MODEL_URL =
  "https://huggingface.co/ggml-org/whisper-vad/resolve/main/" + VAD_MODEL_NAME;

function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (utils.fileInPath(c)) return c;
    } catch (e) {
      // fileInPath throws on some malformed paths; just keep looking.
    }
  }
  return null;
}

function findWhisper(preferred) {
  if (preferred) {
    const resolved = utils.resolvePath(preferred);
    if (utils.fileInPath(resolved)) return resolved;
    if (utils.fileInPath(preferred)) return preferred;
    return null;
  }
  return firstExisting(WHISPER_CANDIDATES);
}

function findFfmpeg() {
  return firstExisting(FFMPEG_CANDIDATES);
}

function modelPresent(modelPath) {
  if (!modelPath) return false;
  return file.exists(modelPath);
}

/**
 * Filenames of the `.bin` models sitting in a directory.
 * The preferences page is a webview with no filesystem access, so the plugin
 * script has to enumerate these and pass them across via a preference key.
 */
function listModels(dir) {
  try {
    const entries = file.list(dir, {}) || [];
    return entries
      .filter((e) => e && !e.isDir && /\.bin$/i.test(e.filename))
      .map((e) => e.filename)
      .sort();
  } catch (e) {
    // The directory does not exist until the first model is downloaded.
    return [];
  }
}

/**
 * Download a ggml model from the whisper.cpp model repository.
 * @param {string} name e.g. "ggml-base.en.bin"
 * @param {string} dest a plugin path such as "@data/models/ggml-base.en.bin"
 */
async function downloadModel(name, dest) {
  const url = MODEL_BASE_URL + name;
  console.log(`Downloading model ${name} to ${dest}`);
  await http.download(url, dest);
  if (!file.exists(dest)) {
    throw new Error("Download finished but the model file is missing.");
  }
  return dest;
}

/** Download the Silero VAD model used by whisper's --vad option. */
async function downloadVadModel(dest) {
  console.log(`Downloading VAD model to ${dest}`);
  await http.download(VAD_MODEL_URL, dest);
  if (!file.exists(dest)) {
    throw new Error("Download finished but the VAD model is missing.");
  }
  return dest;
}

/**
 * Resolve everything the pipeline needs, or explain what is missing.
 * @returns {{ok: boolean, ffmpeg?: string, whisper?: string, model?: string, problem?: string, missing?: string}}
 */
function check(config) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    return {
      ok: false,
      missing: "ffmpeg",
      problem:
        "ffmpeg was not found. Install it with:\n\n    brew install ffmpeg",
    };
  }

  const whisper = findWhisper(config.whisperPath);
  if (!whisper) {
    return {
      ok: false,
      missing: "whisper",
      problem:
        "whisper-cli was not found. Install it with:\n\n    brew install whisper-cpp\n\n" +
        "If it is installed somewhere else, set the full path in the plugin preferences.",
    };
  }

  if (!modelPresent(config.modelPath)) {
    return {
      ok: false,
      missing: "model",
      problem: `No speech model at ${config.modelPath}.`,
      ffmpeg,
      whisper,
    };
  }

  return {
    ok: true,
    ffmpeg,
    whisper,
    model: utils.resolvePath(config.modelPath),
  };
}

module.exports = {
  check,
  downloadModel,
  downloadVadModel,
  VAD_MODEL_NAME,
  findWhisper,
  findFfmpeg,
  modelPresent,
  listModels,
};
