const { eq, stubIina } = require("./helpers.js");

// Preference pages hand values back as strings, so coercion is where bugs hide.
let prefs = {};
stubIina({ preferences: { get: (k) => prefs[k], set: () => {}, sync: () => {} } });
const config = require("../src/config.js");

const read = (values) => {
  prefs = values || {};
  return config.read();
};

const d = read({});
eq("config: default model", d.modelPath, "@data/models/ggml-base.en.bin");
eq("config: default language", d.language, "auto");
eq("config: default translate", d.translate, false);
eq("config: default vad off", d.vad, false);
// 0.5 (whisper's own default) produced no output at all on the test passage.
eq("config: default vad threshold", d.vadThreshold, 0.3);
eq("config: default chunk length", d.chunkSeconds, 30);
eq("config: default position", d.position, "bottom");

eq("config: string 'true' becomes true", read({ translate: "true" }).translate, true);
eq("config: string 'false' becomes false", read({ translate: "false" }).translate, false);
eq("config: real boolean passes through", read({ vad: true }).vad, true);
eq("config: garbage falls back to the default", read({ translate: "yes please" }).translate, false);

eq("config: numeric string is parsed", read({ chunk_seconds: "45" }).chunkSeconds, 45);
eq("config: chunk length clamps low", read({ chunk_seconds: "2" }).chunkSeconds, 10);
eq("config: chunk length clamps high", read({ chunk_seconds: "9999" }).chunkSeconds, 300);
eq("config: non-numeric falls back", read({ chunk_seconds: "soon" }).chunkSeconds, 30);
eq("config: vad threshold clamps low", read({ vad_threshold: "0" }).vadThreshold, 0.05);
eq("config: vad threshold clamps high", read({ vad_threshold: "5" }).vadThreshold, 0.95);
eq("config: threads clamp", read({ threads: "999" }).threads, 64);
eq("config: font size clamps low", read({ font_size: "1" }).fontSize, 10);

eq("config: position top is honoured", read({ position: "top" }).position, "top");
eq("config: unknown position falls back to bottom", read({ position: "sideways" }).position, "bottom");
eq("config: blank string falls back", read({ language: "   " }).language, "auto");
eq("config: value is trimmed", read({ language: " de " }).language, "de");
