/**
 * Post-processing for whisper output.
 *
 * Whisper is autoregressive, so on silence, music or indistinct audio its
 * decoder can fall into a loop and emit the same phrase repeatedly, or invent
 * text outright. Decoder flags reduce how often that happens but do not
 * eliminate it, so obvious loops get cleaned up here as well.
 *
 * These functions are deliberately conservative: a false positive silently
 * deletes something the speaker actually said, which is worse than leaving an
 * occasional repeat on screen.
 */

// A phrase must repeat at least this many times before it is treated as a loop
// rather than deliberate emphasis ("no, no, no" survives; six is not speech).
const MIN_LOOP_REPEATS = 4;

// Longest phrase length, in words, considered when looking for a loop.
const MAX_PHRASE_WORDS = 6;

function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?¿¡…"'’-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse a phrase repeated consecutively many times down to a single
 * occurrence: "two plus two two plus two two plus two two plus two" → "two plus two".
 */
function collapseRepeatedPhrases(text) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length < MIN_LOOP_REPEATS) return text;

  const keys = words.map(normalise);

  for (let n = 1; n <= MAX_PHRASE_WORDS; n++) {
    if (words.length < n * MIN_LOOP_REPEATS) break;

    for (let start = 0; start + n * MIN_LOOP_REPEATS <= words.length; start++) {
      let repeats = 1;
      while (start + n * (repeats + 1) <= words.length) {
        let same = true;
        for (let k = 0; k < n; k++) {
          if (keys[start + k] !== keys[start + repeats * n + k]) {
            same = false;
            break;
          }
        }
        if (!same) break;
        repeats++;
      }

      if (repeats >= MIN_LOOP_REPEATS) {
        const head = words.slice(0, start + n);
        const tail = words.slice(start + repeats * n);
        return collapseRepeatedPhrases(head.concat(tail).join(" "));
      }
    }
  }

  return text;
}

/**
 * Drop cues that merely repeat the previous one. A loop that spans cue
 * boundaries shows up as the same line several times in a row; the first
 * occurrence is kept in case it was genuinely spoken.
 */
function dropRepeatedCues(cues) {
  const out = [];
  let runKey = null;
  let runLength = 0;

  for (const cue of cues) {
    const key = normalise(cue.text);
    if (key && key === runKey) {
      runLength++;
      // Allow one honest repeat, drop the rest of the run.
      if (runLength >= 2) continue;
    } else {
      runKey = key;
      runLength = 0;
    }
    out.push(cue);
  }

  return out;
}

/** True for cues carrying no actual words. */
function isEmpty(text) {
  return normalise(text).length === 0;
}

/** Apply the text-level cleanups to a list of cues. */
function clean(cues) {
  const collapsed = [];
  for (const cue of cues) {
    const text = collapseRepeatedPhrases(cue.text).trim();
    if (isEmpty(text)) continue;
    collapsed.push(Object.assign({}, cue, { text }));
  }
  return dropRepeatedCues(collapsed);
}

module.exports = {
  clean,
  collapseRepeatedPhrases,
  dropRepeatedCues,
  isEmpty,
  MIN_LOOP_REPEATS,
};
