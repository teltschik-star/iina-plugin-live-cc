function pad(n, width) {
  let s = String(Math.floor(n));
  while (s.length < width) s = "0" + s;
  return s;
}

function timestamp(seconds) {
  const total = Math.max(0, seconds);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const whole = Math.floor(total);
  return `${pad(whole / 3600, 2)}:${pad((whole % 3600) / 60, 2)}:${pad(whole % 60, 2)},${pad(ms, 3)}`;
}

/** Render cues as SubRip text. Cues are assumed to be sorted by start time. */
function render(cues) {
  const out = [];
  let index = 1;
  for (const c of cues) {
    if (!c.text) continue;
    out.push(String(index++));
    out.push(`${timestamp(c.start)} --> ${timestamp(c.end)}`);
    out.push(c.text);
    out.push("");
  }
  return out.join("\n");
}

/**
 * Turn "/Movies/Film.mkv" into "/Movies/Film.livecc.srt".
 * Falls back to appending when the path has no extension.
 */
function siblingPath(mediaPath, suffix) {
  const slash = mediaPath.lastIndexOf("/");
  const dot = mediaPath.lastIndexOf(".");
  const stem = dot > slash ? mediaPath.slice(0, dot) : mediaPath;
  return `${stem}${suffix}`;
}

module.exports = { render, timestamp, siblingPath };
