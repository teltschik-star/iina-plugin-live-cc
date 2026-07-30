const { mpv, utils, console } = iina;

/** The filesystem path (or URL) mpv is currently reading. */
function currentMediaPath() {
  try {
    const p = mpv.getString("path");
    return p && p.length ? p : null;
  } catch (e) {
    return null;
  }
}

/**
 * The ffmpeg stream index of the audio track the user is actually listening to.
 * mpv's track-list exposes `ff-index`, which maps straight onto ffmpeg's
 * `-map 0:<index>`. Returns null if it cannot be determined, in which case the
 * caller should fall back to the first audio stream.
 */
function currentAudioStreamIndex() {
  try {
    const tracks = mpv.getNative("track-list") || [];
    for (const t of tracks) {
      if (t && t.type === "audio" && t.selected && typeof t["ff-index"] === "number") {
        return t["ff-index"];
      }
    }
  } catch (e) {
    console.warn(`Could not read track-list: ${e}`);
  }
  return null;
}

/**
 * Decode a slice of the file's audio into 16 kHz mono PCM, which is the only
 * format whisper.cpp accepts.
 *
 * `-ss` is placed before `-i` so ffmpeg seeks the input rather than decoding
 * and discarding everything up to `start`. That keeps extraction near-constant
 * time regardless of how far into the file we are.
 */
async function extractWav(ffmpeg, input, streamIndex, start, duration, outPath) {
  const args = [
    "-nostdin",
    "-v", "error",
    "-y",
    "-ss", start.toFixed(3),
    "-t", duration.toFixed(3),
    "-i", input,
    "-vn",
    "-map", streamIndex === null ? "0:a:0" : `0:${streamIndex}`,
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    "-f", "wav",
    outPath,
  ];

  const { status, stderr } = await utils.exec(ffmpeg, args);
  if (status !== 0) {
    throw new Error(`ffmpeg exited with ${status}: ${(stderr || "").trim()}`);
  }
  return outPath;
}

module.exports = { currentMediaPath, currentAudioStreamIndex, extractWav };
