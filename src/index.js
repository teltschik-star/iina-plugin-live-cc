const { core, mpv, event, menu, overlay, console, utils, file, preferences } = iina;

const config = require("./config.js");
const deps = require("./deps.js");
const cueStore = require("./cues.js");
const media = require("./media.js");
const languages = require("./languages.js");
const models = require("./models.js");
const scheduler = require("./scheduler.js");
const srt = require("./srt.js");

// The `.en` models are English-only and ignore the language setting entirely.
// Anything else is multilingual (~99 languages, Spanish included) and is the only
// option that honours `language` or `translate`.
const MODELS = [
  { name: "ggml-tiny.en.bin", label: "Tiny — English only (74 MB)" },
  { name: "ggml-base.en.bin", label: "Base — English only (141 MB)" },
  { name: "ggml-small.en.bin", label: "Small — English only (465 MB)" },
  { name: "ggml-medium.en.bin", label: "Medium — English only (1.5 GB)" },
  { separator: true },
  { name: "ggml-base.bin", label: "Base — multilingual (141 MB)" },
  { name: "ggml-small.bin", label: "Small — multilingual (465 MB)" },
  { name: "ggml-medium.bin", label: "Medium — multilingual (1.5 GB)" },
  {
    name: "ggml-large-v3-turbo.bin",
    label: "Large v3 Turbo — multilingual, no translation (1.5 GB)",
  },
];

// Offered when captions are started with no model installed yet.
const DEFAULT_MODEL = MODELS[1];

const MODEL_DIR = "@data/models";
const VAD_MODEL_PATH = `${MODEL_DIR}/${deps.VAD_MODEL_NAME}`;

/** A friendly label for a model filename, falling back to the bare name. */
function describeModel(filename) {
  for (const m of MODELS) {
    if (m.name === filename) return m.label;
  }
  return filename;
}

/**
 * Publish the list of downloaded models so the preferences page can offer them
 * in a dropdown. The page is a webview and cannot read the filesystem, so a
 * preference key is the channel between the two.
 */
function refreshInstalledModels() {
  const installed = deps
    .listModels(MODEL_DIR)
    .filter((filename) => filename !== deps.VAD_MODEL_NAME)
    .map((filename) => ({
    path: `${MODEL_DIR}/${filename}`,
    label: describeModel(filename),
  }));
  // Percent-encoded, not raw JSON: IINA's preferences-page binding appears to
  // interpolate values into JS without escaping, so a payload containing double
  // quotes silently arrives empty in the webview. encodeURIComponent leaves only
  // safe ASCII, and the apostrophe is encoded too so neither quote style can
  // break the assignment.
  const encoded = encodeURIComponent(JSON.stringify(installed)).replace(/'/g, "%27");
  preferences.set("installed_models", encoded);
  preferences.sync();
  return installed;
}

const store = cueStore.createStore();

let cfg = config.read();
let overlayReady = false;
let enabled = false;
let displayTimer = null;
let lastCueText = null;
let lastStatus = null;
let detectedLanguage = null;

const worker = scheduler.create({
  getPosition: () => core.status.position || 0,
  getDuration: () => core.status.duration || 0,
  onCues: (cues) => {
    store.insertMany(cues);
    pushCue(true);
  },
  onStatus: (status) => pushStatus(status),
  onLanguage: (code) => noteLanguage(code),
});

/**
 * Whisper reports a detected language for every chunk. Only the first one is
 * shown: with `auto` each chunk detects independently, and a badge that flickered
 * between languages mid-playback would be noise rather than information.
 */
function noteLanguage(code) {
  if (detectedLanguage || !code) return;
  if (!models.detectsLanguage(cfg.modelPath)) return;
  detectedLanguage = code;
  pushLanguage();
}

// ---------------------------------------------------------------- overlay ---

/** Overlay calls are only legal once the player window exists. */
function withOverlay(fn) {
  if (!core.window.loaded) return;
  try {
    fn();
  } catch (e) {
    console.warn(`Overlay call failed: ${e}`);
  }
}

function pushConfig() {
  if (!overlayReady) return;
  overlay.postMessage("config", {
    fontSize: cfg.fontSize,
    position: cfg.position,
    showStatus: cfg.showStatus,
  });
}

function pushCue(force) {
  if (!overlayReady) return;
  const cue = enabled ? store.at(core.status.position || 0) : null;
  const text = cue ? cue.text : null;
  if (!force && text === lastCueText) return;
  lastCueText = text;
  overlay.postMessage("cue", { text });
}

function pushStatus(status) {
  if (!overlayReady) return;

  let label = null;
  if (status.active) {
    if (status.phase === "transcribing" || status.phase === "extracting") {
      const total = status.total || 0;
      label = total ? `Transcribing ${status.done + 1}/${total}` : "Transcribing…";
    } else if (status.phase === "error") {
      label = "Transcription error";
    }
  }

  if (label === lastStatus) return;
  lastStatus = label;
  overlay.postMessage("status", { text: label });
}

function pushLanguage() {
  if (!overlayReady) return;
  const translating =
    enabled && cfg.translate && models.canTranslate(cfg.modelPath);
  const text = enabled ? languages.describe(detectedLanguage, translating) : null;
  overlay.postMessage("language", { text });
}

function setupOverlay() {
  overlay.loadFile("ui/overlay.html");
}

// ------------------------------------------------------------- lifecycle ---

function startDisplayLoop() {
  if (displayTimer) return;
  displayTimer = setInterval(() => pushCue(false), 100);
}

function stopDisplayLoop() {
  if (!displayTimer) return;
  clearInterval(displayTimer);
  displayTimer = null;
}

function resetForNewFile() {
  worker.stop();
  worker.setFullFile(false);
  store.clear();
  lastCueText = null;
  lastStatus = null;
  detectedLanguage = null;
  enabled = false;
  stopDisplayLoop();
  if (overlayReady) {
    overlay.postMessage("cue", { text: null });
    overlay.postMessage("status", { text: null });
    overlay.postMessage("language", { text: null });
  }
  withOverlay(() => overlay.hide());
  updateMenu();
}

async function ensureReady() {
  cfg = config.read();
  const result = deps.check(cfg);
  if (result.ok) return result;

  if (result.missing === "model") {
    const wantsDownload = utils.ask(
      `${result.problem}\n\nDownload a model now? You can pick which one from ` +
        `Plugins → Live CC Generator → Download Speech Model.`,
    );
    if (wantsDownload) {
      await downloadModel(DEFAULT_MODEL);
      const retry = deps.check(config.read());
      if (retry.ok) return retry;
    }
    return null;
  }

  utils.ask(result.problem);
  return null;
}

async function enable() {
  if (enabled) return;

  const mediaPath = media.currentMediaPath();
  if (!mediaPath) {
    core.osd("Live CC: no file is playing.");
    return;
  }

  const ready = await ensureReady();
  if (!ready) return;

  const streamIndex = media.currentAudioStreamIndex();
  if (streamIndex === null) {
    console.warn("Could not resolve the selected audio stream; using the first one.");
  }

  // whisper silently ignores --translate on models that cannot do it, which
  // otherwise looks like the plugin failing to honour the setting.
  if (cfg.translate && !models.canTranslate(cfg.modelPath)) {
    core.osd(
      models.isEnglishOnly(cfg.modelPath)
        ? "Live CC: translation needs a multilingual model."
        : "Live CC: large-v3-turbo cannot translate — use Small or Medium.",
    );
  }

  // Starting re-transcribes from scratch (the scheduler resets its chunk state),
  // so previously collected cues have to go: they were produced under whatever
  // settings were in force last time, and keeping them would both duplicate the
  // new cues and leave stale text on screen.
  store.clear();
  lastCueText = null;
  lastStatus = null;
  detectedLanguage = null;

  enabled = true;
  withOverlay(() => overlay.show());
  pushConfig();
  startDisplayLoop();
  updateMenu();

  let vadModel = null;
  if (cfg.vad) {
    if (file.exists(VAD_MODEL_PATH)) {
      vadModel = utils.resolvePath(VAD_MODEL_PATH);
    } else {
      core.osd("Live CC: VAD model missing — download it from the plugin menu.");
    }
  }

  core.osd("Live CC: starting…");
  worker.start({
    ffmpeg: ready.ffmpeg,
    whisper: ready.whisper,
    model: ready.model,
    mediaPath,
    streamIndex,
    vadModel,
    config: cfg,
  });
}

function disable() {
  if (!enabled) return;
  enabled = false;
  worker.stop();
  stopDisplayLoop();
  lastCueText = null;
  lastStatus = null;
  detectedLanguage = null;
  if (overlayReady) {
    overlay.postMessage("cue", { text: null });
    overlay.postMessage("status", { text: null });
    overlay.postMessage("language", { text: null });
  }
  withOverlay(() => overlay.hide());
  updateMenu();
  core.osd("Live CC: stopped.");
}

function toggle() {
  if (enabled) disable();
  else enable();
}

// ----------------------------------------------------------------- models ---

async function downloadModel(model) {
  const dest = `${MODEL_DIR}/${model.name}`;
  core.osd(`Live CC: downloading ${model.label}…`);
  try {
    await deps.downloadModel(model.name, dest);
    preferences.set("model_path", dest);
    preferences.sync();
    cfg = config.read();
    rebuildMenu();
    core.osd(`Live CC: ${model.label} ready.`);
  } catch (e) {
    console.error(`Model download failed: ${e}`);
    utils.ask(`Could not download the model.\n\n${e}`);
  }
}

function selectModel(modelPath) {
  preferences.set("model_path", modelPath);
  preferences.sync();
  cfg = config.read();
  for (const entry of modelItems) {
    entry.item.selected = entry.path === modelPath;
  }
  menu.forceUpdate();
  core.osd(`Live CC: using ${describeModel(models.basename(modelPath))}`);
}

async function downloadVadModel() {
  core.osd("Live CC: downloading voice activity model…");
  try {
    await deps.downloadVadModel(VAD_MODEL_PATH);
    rebuildMenu();
    core.osd("Live CC: voice activity model ready.");
  } catch (e) {
    console.error(`VAD model download failed: ${e}`);
    utils.ask(`Could not download the voice activity model.\n\n${e}`);
  }
}

function chooseModelFile() {
  const path = utils.chooseFile("Select a whisper.cpp model (.bin)", {
    allowedFileTypes: ["bin"],
  });
  if (!path) return;
  preferences.set("model_path", path);
  preferences.sync();
  cfg = config.read();
  rebuildMenu();
  core.osd("Live CC: model updated.");
}

// ----------------------------------------------------------------- export ---

function exportSRT(alsoLoad) {
  const cues = store.all();
  if (cues.length === 0) {
    core.osd("Live CC: nothing transcribed yet.");
    return;
  }

  const mediaPath = media.currentMediaPath();
  let target;
  if (mediaPath && mediaPath.indexOf("://") === -1) {
    target = srt.siblingPath(mediaPath, ".livecc.srt");
  } else {
    target = utils.resolvePath(`@data/exports/${core.status.title || "captions"}.livecc.srt`);
  }

  try {
    file.write(target, srt.render(cues));
  } catch (e) {
    console.error(`Could not write ${target}: ${e}`);
    utils.ask(`Could not write the subtitle file.\n\n${e}`);
    return;
  }

  const partial = worker.isActive() ? " (partial — still transcribing)" : "";
  if (alsoLoad) {
    core.subtitle.loadTrack(target);
    core.osd(`Live CC: loaded as a subtitle track${partial}.`);
  } else {
    core.osd(`Live CC: saved ${target}${partial}`);
  }
}

// ------------------------------------------------------------------- menu ---

let toggleItem, fullFileItem;
/** @type {Array<{path: string, item: any}>} */
let modelItems = [];

function updateMenu() {
  if (!toggleItem) return;
  toggleItem.title = enabled ? "Stop Live Captions" : "Start Live Captions";
  if (fullFileItem) {
    fullFileItem.selected = worker.isFullFile();
    fullFileItem.enabled = enabled;
  }
  menu.forceUpdate();
}

function rebuildMenu() {
  menu.removeAllItems();
  buildMenu();
  updateMenu();
}

function buildMenu() {
  toggleItem = menu.item("Start Live Captions", toggle, {
    keyBinding: "Meta+Shift+c",
  });
  menu.addItem(toggleItem);

  fullFileItem = menu.item(
    "Transcribe Whole File in Background",
    () => {
      worker.setFullFile(!worker.isFullFile());
      updateMenu();
    },
    { enabled: false },
  );
  menu.addItem(fullFileItem);

  menu.addItem(menu.separator());

  menu.addItem(menu.item("Save Captions as .srt", () => exportSRT(false)));
  menu.addItem(menu.item("Load Captions as Subtitle Track", () => exportSRT(true)));

  menu.addItem(menu.separator());

  // A model picker that does not depend on the preferences webview.
  const activeMenu = menu.item("Active Model");
  modelItems = [];
  const installed = refreshInstalledModels();
  if (installed.length === 0) {
    activeMenu.addSubMenuItem(
      menu.item("No models downloaded", null, { enabled: false }),
    );
  } else {
    for (const model of installed) {
      const item = menu.item(model.label, () => selectModel(model.path), {
        selected: cfg.modelPath === model.path,
      });
      modelItems.push({ path: model.path, item });
      activeMenu.addSubMenuItem(item);
    }
  }
  menu.addItem(activeMenu);

  const modelsMenu = menu.item("Download Speech Model");
  for (const model of MODELS) {
    modelsMenu.addSubMenuItem(
      model.separator
        ? menu.separator()
        : menu.item(model.label, () => downloadModel(model)),
    );
  }
  menu.addItem(modelsMenu);
  menu.addItem(menu.item("Choose Model File…", chooseModelFile));
  menu.addItem(
    menu.item(
      file.exists(VAD_MODEL_PATH)
        ? "Voice Activity Model Installed"
        : "Download Voice Activity Model (864 KB)",
      file.exists(VAD_MODEL_PATH) ? null : downloadVadModel,
      { enabled: !file.exists(VAD_MODEL_PATH) },
    ),
  );
}

// ----------------------------------------------------------------- events ---

buildMenu();
refreshInstalledModels();

// The entry script normally runs before the window exists, but it also runs
// again when the user enables or reloads the plugin — at which point the window
// is already open and "iina.window-loaded" will never fire for it.
if (core.window.loaded) {
  setupOverlay();
}

event.on("iina.window-loaded", () => {
  setupOverlay();
});

event.on("iina.plugin-overlay-loaded", () => {
  overlayReady = true;
  pushConfig();
  pushCue(true);
  pushLanguage();
});

event.on("iina.file-loaded", () => {
  resetForNewFile();
  cfg = config.read();
  if (cfg.autoStart) {
    // Give mpv a moment to publish duration and the track list.
    setTimeout(() => enable(), 500);
  }
});

event.on("mpv.seek", () => {
  // The scheduler re-derives its next chunk from the playhead, so it only needs
  // a nudge; the display should update immediately rather than at the next tick.
  pushCue(true);
});

event.on("iina.window-will-close", () => {
  worker.stop();
  stopDisplayLoop();
});

console.log("Live CC Generator loaded.");
