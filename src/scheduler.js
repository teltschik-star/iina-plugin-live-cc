const { utils, file, console } = iina;

const media = require("./media.js");
const whisper = require("./whisper.js");

const MAX_ATTEMPTS = 2;

/**
 * Drives transcription of the file's audio, staying ahead of the playhead.
 *
 * The file is divided into fixed-length chunks. A single worker processes one
 * chunk at a time — whisper saturates the CPU, so running several in parallel
 * would only make the chunk the user is about to reach arrive later. After every
 * chunk the worker re-derives which chunk matters most from the *current*
 * playback position, which is what makes seeking cheap: no queue to rebuild,
 * the next pick simply lands somewhere else.
 *
 * @param {object} deps
 * @param {() => number} deps.getPosition current playback position in seconds
 * @param {() => number} deps.getDuration file duration in seconds
 * @param {(cues: Array) => void} deps.onCues called with newly transcribed cues
 * @param {(status: object) => void} deps.onStatus progress reporting
 */
function create(deps) {
  /** @type {Record<number, "running"|"done"|"error">} */
  let state = {};
  /** @type {Record<number, number>} */
  let attempts = {};

  let ctx = null;
  let active = false;
  let busy = false;
  let fullFile = false;
  let tmpDir = null;
  let ticker = null;

  function chunkLength() {
    // stop() can report before any start(), so ctx may not exist yet.
    return ctx ? ctx.config.chunkSeconds : 0;
  }

  function totalChunks() {
    const length = chunkLength();
    if (!length) return 0;
    const duration = deps.getDuration();
    if (!duration || !isFinite(duration)) return 0;
    return Math.ceil(duration / length);
  }

  function completedCount() {
    let n = 0;
    for (const k in state) if (state[k] === "done") n++;
    return n;
  }

  function report(extra) {
    if (!deps.onStatus) return;
    deps.onStatus(
      Object.assign(
        {
          active,
          busy,
          fullFile,
          done: completedCount(),
          total: totalChunks(),
        },
        extra || {},
      ),
    );
  }

  /**
   * The most useful chunk to transcribe next: the one containing the playhead,
   * then the ones just after it. In whole-file mode, any remaining gap.
   */
  function pickNext() {
    const total = totalChunks();
    if (total === 0) return null;

    const L = chunkLength();
    const pos = deps.getPosition() || 0;
    const current = Math.min(total - 1, Math.max(0, Math.floor(pos / L)));
    const ahead = fullFile
      ? total - 1
      : Math.min(total - 1, current + ctx.config.lookaheadChunks);

    for (let i = current; i <= ahead; i++) {
      if (!state[i]) return i;
    }
    if (fullFile) {
      for (let i = 0; i < current; i++) {
        if (!state[i]) return i;
      }
    }
    return null;
  }

  async function ensureTmpDir() {
    if (tmpDir) return tmpDir;
    const probe = utils.resolvePath("@tmp/livecc.wav");
    const dir = probe.slice(0, probe.lastIndexOf("/"));
    try {
      await utils.exec("/bin/mkdir", ["-p", dir]);
      tmpDir = dir;
    } catch (e) {
      console.warn(`Falling back to /tmp for scratch files: ${e}`);
      tmpDir = "/tmp";
    }
    return tmpDir;
  }

  async function processChunk(index) {
    const L = chunkLength();
    const tail = ctx.config.chunkTailSeconds;
    const duration = deps.getDuration();
    const start = index * L;
    const isLast = start + L >= duration;
    const span = Math.min(L + tail, duration - start);

    if (span <= 0.25) {
      state[index] = "done";
      return;
    }

    const dir = await ensureTmpDir();
    const wavPath = `${dir}/livecc-${index}.wav`;
    const outBase = `${dir}/livecc-${index}`;

    report({ chunk: index, phase: "extracting" });
    await media.extractWav(
      ctx.ffmpeg,
      ctx.mediaPath,
      ctx.streamIndex,
      start,
      span,
      wavPath,
    );
    if (!active) return;

    report({ chunk: index, phase: "transcribing" });
    let result;
    try {
      result = await whisper.transcribe(ctx.whisper, wavPath, outBase, {
        model: ctx.model,
        language: ctx.config.language,
        translate: ctx.config.translate,
        threads: ctx.config.threads,
        maxLineLength: ctx.config.maxLineLength,
        vad: ctx.config.vad,
        vadThreshold: ctx.config.vadThreshold,
        vadModel: ctx.vadModel,
      });
    } finally {
      try {
        file.delete(wavPath);
      } catch (e) {
        // Scratch file; a leftover is harmless.
      }
    }
    if (!active) return;

    const cues = result.cues;
    if (result.language && deps.onLanguage) deps.onLanguage(result.language);

    // The tail exists only so whisper hears the end of a sentence instead of a
    // hard cut. Cues that *start* inside the tail belong to the next chunk and
    // would otherwise be emitted twice — except in the last chunk, where there
    // is no next chunk to produce them.
    //
    // A cue that starts before the boundary but runs into the tail is kept, with
    // its end clamped to the boundary: the next chunk covers that span itself,
    // and leaving it unclamped produces overlapping cues in exported SubRip.
    const limit = isLast ? span : L;
    const absolute = [];
    for (const c of cues) {
      if (c.start >= limit) continue;
      const end = Math.min(c.end, limit);
      if (end - c.start < 0.05) continue;
      absolute.push({
        start: start + c.start,
        end: start + end,
        text: c.text,
      });
    }

    state[index] = "done";
    if (absolute.length && deps.onCues) deps.onCues(absolute);
  }

  async function pump() {
    if (!active || busy || !ctx) return;

    const index = pickNext();
    if (index === null) {
      report({ phase: "idle" });
      return;
    }

    busy = true;
    state[index] = "running";
    try {
      await processChunk(index);
    } catch (e) {
      attempts[index] = (attempts[index] || 0) + 1;
      if (attempts[index] >= MAX_ATTEMPTS) {
        state[index] = "error";
        console.error(`Chunk ${index} failed permanently: ${e}`);
        report({ phase: "error", chunk: index, message: String(e) });
      } else {
        delete state[index];
        console.warn(`Chunk ${index} failed, will retry: ${e}`);
      }
    } finally {
      busy = false;
    }

    if (active) pump();
  }

  function start(context) {
    ctx = context;
    state = {};
    attempts = {};
    active = true;
    busy = false;
    if (ticker) clearInterval(ticker);
    // A heartbeat covers the case where the worker went idle (everything in the
    // lookahead window was already done) and the playhead has since moved on.
    ticker = setInterval(pump, 1000);
    report({ phase: "starting" });
    pump();
  }

  function stop() {
    active = false;
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    report({ phase: "stopped" });
  }

  function setFullFile(value) {
    fullFile = !!value;
    if (active) pump();
  }

  function isActive() {
    return active;
  }

  function isFullFile() {
    return fullFile;
  }

  return { start, stop, setFullFile, isActive, isFullFile, report, totalChunks };
}

module.exports = { create };
