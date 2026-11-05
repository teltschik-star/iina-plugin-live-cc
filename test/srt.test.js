const { eq } = require("./helpers.js");
const srt = require("../src/srt.js");

eq("srt: timestamp", srt.timestamp(3661.5), "01:01:01,500");
eq("srt: timestamp zero", srt.timestamp(0), "00:00:00,000");
eq("srt: timestamp rounds milliseconds", srt.timestamp(1.2345), "00:00:01,234");
eq("srt: negative clamps to zero", srt.timestamp(-5), "00:00:00,000");

eq("srt: renders a cue", srt.render([{ start: 0, end: 1.5, text: "Hi" }]),
  "1\n00:00:00,000 --> 00:00:01,500\nHi\n");
eq("srt: numbers cues sequentially",
  srt.render([{ start: 0, end: 1, text: "a" }, { start: 1, end: 2, text: "b" }]).split("\n").filter((l) => /^\d+$/.test(l)),
  ["1", "2"]);
eq("srt: skips empty text",
  srt.render([{ start: 0, end: 1, text: "" }, { start: 1, end: 2, text: "b" }]).split("\n")[0], "1");
eq("srt: empty list", srt.render([]), "");

eq("srt: sibling path replaces the extension", srt.siblingPath("/M/Film.mkv", ".livecc.srt"), "/M/Film.livecc.srt");
eq("srt: sibling path with no extension", srt.siblingPath("/M/Film", ".livecc.srt"), "/M/Film.livecc.srt");
eq("srt: a dot in a directory name is not an extension", srt.siblingPath("/M.v2/Film", ".x"), "/M.v2/Film.x");
