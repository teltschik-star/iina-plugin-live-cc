// No cue is expected to outlast a chunk plus its overlap, so a lookup never has
// to walk back further than this to find a still-open cue.
const MAX_CUE_SECONDS = 45;

/**
 * An ordered store of caption cues, kept sorted by start time so that lookup
 * during playback is a binary search rather than a scan.
 *
 * Chunks can complete out of order (a seek re-prioritises the queue), so insert
 * has to find the right slot rather than append.
 */
function createStore() {
  /** @type {Array<{start: number, end: number, text: string}>} */
  let cues = [];

  /** First index whose start is >= t. */
  function lowerBound(t) {
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** First index whose start is > t. */
  function upperBound(t) {
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function insertMany(incoming) {
    for (const c of incoming) {
      cues.splice(lowerBound(c.start), 0, c);
    }
  }

  /**
   * The cue covering `t`, or null. Scanning backwards from the latest cue that
   * has already started means the most recent one wins when cues overlap.
   */
  function at(t) {
    for (let j = upperBound(t) - 1; j >= 0; j--) {
      const c = cues[j];
      if (t < c.end) return c;
      if (t - c.start > MAX_CUE_SECONDS) break;
    }
    return null;
  }

  function clear() {
    cues = [];
  }

  function all() {
    return cues.slice();
  }

  function count() {
    return cues.length;
  }

  return { insertMany, at, clear, all, count };
}

module.exports = { createStore };
