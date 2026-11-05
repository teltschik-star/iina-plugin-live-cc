const { eq } = require("./helpers.js");
const { createStore } = require("../src/cues.js");

const cue = (text, start, end) => ({ start, end: end === undefined ? start + 1 : end, text });

// Chunks can finish out of order after a seek, so insertion must sort.
let s = createStore();
s.insertMany([cue("C", 10, 12), cue("D", 12, 14)]);
s.insertMany([cue("A", 0, 2), cue("B", 2, 4)]);
eq("cues: kept sorted across out-of-order inserts", s.all().map((c) => c.text), ["A", "B", "C", "D"]);
eq("cues: count", s.count(), 4);

// Lookup boundaries. A cue starting exactly at t must match; its end is exclusive.
eq("cues: start boundary is inclusive", s.at(2).text, "B");
eq("cues: end boundary is exclusive", s.at(4), null);
eq("cues: t=0", s.at(0).text, "A");
eq("cues: mid-cue", s.at(3.9).text, "B");
eq("cues: gap between cues", s.at(6), null);
eq("cues: before everything", s.at(-1), null);
eq("cues: after everything", s.at(99), null);
eq("cues: last cue", s.at(13).text, "D");

// Overlapping cues: the most recently started one wins.
const o = createStore();
o.insertMany([cue("long", 0, 10), cue("short", 5, 7)]);
eq("cues: overlap prefers the later start", o.at(6).text, "short");
eq("cues: overlap falls back to the enclosing cue", o.at(8).text, "long");

// A long cue that genuinely spans t still matches: the lookback bound limits how
// far back the scan walks looking for an overlap, it does not reject the cue.
const long = createStore();
long.insertMany([cue("spans everything", 0, 1000)]);
eq("cues: a long cue covering t matches", long.at(900).text, "spans everything");

// But a stale cue that has ended must not be returned long afterwards, and the
// scan must give up rather than walking the whole store.
const stale = createStore();
stale.insertMany([cue("old", 0, 1)]);
eq("cues: an ended cue is not returned later", stale.at(900), null);

s.clear();
eq("cues: clear empties the store", s.count(), 0);
eq("cues: lookup on empty store", s.at(1), null);
