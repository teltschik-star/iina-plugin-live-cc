// Exercises the real <script> from preferences.html against a DOM stub.
//
// This page is fragile for reasons outside our control: in IINA 1.4.4 the
// callback passed to preferences.get() never fires, and preference values
// containing double quotes arrive empty because IINA interpolates them into JS
// unescaped. Both cost a lot of debugging, so the behaviours that work around
// them are pinned here.
const fs = require("fs");
const path = require("path");
const { eq } = require("./helpers.js");

const html = fs.readFileSync(path.join(__dirname, "..", "preferences.html"), "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);
eq("prefs-ui: page contains a script block", !!match, true);
const source = match[1];

const encode = (json) => encodeURIComponent(json).replace(/'/g, "%27");

function makeInput(value) {
  return {
    value,
    dispatched: [],
    addEventListener(_, fn) { this.onchange = fn; },
    dispatchEvent(e) { this.dispatched.push(e.type); return true; },
  };
}

function render(installedModels, currentPath, opts) {
  opts = opts || {};
  const select = {
    innerHTML: "", disabled: false, value: undefined, children: [],
    appendChild(o) { this.children.push(o); },
    addEventListener(_, fn) { this.onchange = fn; },
  };
  const help = { textContent: "" };
  const modelsSrc = makeInput(opts.bindLate ? "" : installedModels);
  const pathSrc = makeInput(currentPath);
  const written = {};
  const byId = { "model-select": select, "model-help": help, "models-src": modelsSrc, "model-path-src": pathSrc };

  const doc = {
    readyState: "complete",
    addEventListener() {},
    getElementById: (id) => byId[id],
    createElement: () => ({ value: "", textContent: "", disabled: false }),
  };
  const win = { iina: { preferences: { set(k, v) { written[k] = v; } } } };

  let ticks = 0;
  const setTimeoutStub = (fn) => {
    // Simulate IINA's binding landing after the first poll.
    if (++ticks === 1 && opts.bindLate) modelsSrc.value = installedModels;
    fn();
  };

  new Function("window", "document", "setTimeout", "Event", source)(
    win, doc, setTimeoutStub, function Event(type) { return { type }; },
  );
  return { select, help, modelsSrc, pathSrc, written };
}

const threeRaw = JSON.stringify([
  { path: "@data/models/ggml-base.en.bin", label: "Base — English only (141 MB)" },
  { path: "@data/models/ggml-large-v3-turbo.bin", label: "Large v3 Turbo — multilingual, no translation (1.5 GB)" },
  { path: "@data/models/ggml-small.bin", label: "Small — multilingual (465 MB)" },
]);
const three = encode(threeRaw);

// The payload must contain nothing that could terminate a JS string literal.
eq("prefs-ui: payload has no double quotes", /"/.test(three), false);
eq("prefs-ui: payload has no single quotes", /'/.test(three), false);
eq("prefs-ui: payload has no newlines", /[\r\n]/.test(three), false);
eq("prefs-ui: payload is printable ascii", /^[\x20-\x7e]*$/.test(three), true);
eq("prefs-ui: payload round-trips", JSON.parse(decodeURIComponent(three)).length, 3);

let r = render(three, "@data/models/ggml-large-v3-turbo.bin");
eq("prefs-ui: lists every installed model", r.select.children.length, 3);
eq("prefs-ui: shows friendly labels", r.select.children[2].textContent, "Small — multilingual (465 MB)");
eq("prefs-ui: selects the current model", r.select.value, "@data/models/ggml-large-v3-turbo.bin");
eq("prefs-ui: enabled when models exist", r.select.disabled, false);

r = render(three, "/Users/me/models/my-tuned.bin");
eq("prefs-ui: a model outside the data folder is added", r.select.children.length, 4);
eq("prefs-ui: it is marked custom", r.select.children[3].textContent, "my-tuned.bin (custom)");

r = render(encode("[]"), "");
eq("prefs-ui: placeholder when nothing is downloaded",
  r.select.children.map((o) => o.textContent), ["No models downloaded yet"]);
eq("prefs-ui: placeholder is disabled", r.select.disabled, true);

eq("prefs-ui: survives an undecodable payload",
  render("%ZZ-not-decodable", "@data/models/ggml-small.bin").select.children.map((o) => o.textContent),
  ["No models downloaded yet"]);

eq("prefs-ui: falls back to the first model when none is set",
  render(three, "").select.value, "@data/models/ggml-base.en.bin");

r = render(three, "@data/models/ggml-small.bin", { bindLate: true });
eq("prefs-ui: populates when IINA binds late", r.select.children.length, 3);
eq("prefs-ui: still selects the current model", r.select.value, "@data/models/ggml-small.bin");

r = render(three, "@data/models/ggml-small.bin");
r.select.value = "@data/models/ggml-base.en.bin";
r.select.onchange();
eq("prefs-ui: selection writes model_path", r.written.model_path, "@data/models/ggml-base.en.bin");
eq("prefs-ui: selection mirrors into the bound input", r.pathSrc.value, "@data/models/ggml-base.en.bin");
eq("prefs-ui: selection fires change for IINA's binding", r.pathSrc.dispatched, ["change"]);

r = render(encode("[]"), "");
r.select.value = "";
r.select.onchange();
eq("prefs-ui: the placeholder is never written as a path", r.written.model_path, undefined);
