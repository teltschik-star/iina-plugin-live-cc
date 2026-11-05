const { eq } = require("./helpers.js");
const c = require("../src/cleanup.js");
const cue = (text, start) => ({ start, end: start + 1, text });

// Loops whisper falls into on silence or music.
eq("cleanup: single-word loop", c.collapseRepeatedPhrases("okay okay okay okay okay okay"), "okay");
eq("cleanup: phrase loop",
  c.collapseRepeatedPhrases("two plus two two plus two two plus two two plus two"), "two plus two");
eq("cleanup: loop with a real tail",
  c.collapseRepeatedPhrases("hello yes yes yes yes yes goodbye"), "hello yes goodbye");
eq("cleanup: punctuation does not hide a loop",
  c.collapseRepeatedPhrases("No. No. No. No. No."), "No.");

// Real speech that must survive. Emphasis of three is common and deliberate.
eq("cleanup: three repeats are emphasis, not a loop", c.collapseRepeatedPhrases("no no no"), "no no no");
eq("cleanup: real Spanish line survives",
  c.collapseRepeatedPhrases("Mira, mira, mira este para qué es."), "Mira, mira, mira este para qué es.");
eq("cleanup: ordinary sentence untouched",
  c.collapseRepeatedPhrases("They're going to figure this out."), "They're going to figure this out.");
eq("cleanup: non-adjacent repeats survive",
  c.collapseRepeatedPhrases("yes I said yes to that yes indeed yes"), "yes I said yes to that yes indeed yes");
eq("cleanup: empty input", c.collapseRepeatedPhrases(""), "");
// An observed hallucination that is not a loop must be left alone.
eq("cleanup: non-looping hallucination is not altered",
  c.collapseRepeatedPhrases("incorrect you have been in an inch"), "incorrect you have been in an inch");

eq("cleanup: drops a run of identical cues",
  c.dropRepeatedCues([cue("hi", 0), cue("hi", 1), cue("hi", 2), cue("hi", 3), cue("bye", 4)]).map((x) => x.text),
  ["hi", "hi", "bye"]);
eq("cleanup: distinct cues are kept",
  c.dropRepeatedCues([cue("a", 0), cue("b", 1), cue("a", 2)]).map((x) => x.text), ["a", "b", "a"]);
eq("cleanup: a run restarts after a different cue",
  c.dropRepeatedCues([cue("a", 0), cue("a", 1), cue("a", 2), cue("b", 3), cue("a", 4), cue("a", 5)]).map((x) => x.text),
  ["a", "a", "b", "a", "a"]);

eq("cleanup: clean collapses loops and drops empties",
  c.clean([cue("ha ha ha ha ha ha", 0), cue("...", 1), cue("real speech", 2)]).map((x) => x.text),
  ["ha", "real speech"]);
eq("cleanup: clean preserves timings", c.clean([cue("yes yes yes yes yes", 5)])[0].start, 5);
eq("cleanup: clean on an empty list", c.clean([]), []);
eq("cleanup: isEmpty on punctuation only", c.isEmpty("..."), true);
eq("cleanup: isEmpty on words", c.isEmpty("hi"), false);
