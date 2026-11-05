const { eq } = require("./helpers.js");
const languages = require("../src/languages.js");

eq("lang: spanish", languages.describe("es", false), "Spanish (es)");
eq("lang: spanish translating", languages.describe("es", true), "Spanish (es) → English (en)");
eq("lang: german", languages.describe("de", false), "German (de)");
eq("lang: three-letter code", languages.describe("yue", false), "Cantonese (yue)");
eq("lang: uppercase is normalised", languages.describe("ES", false), "Spanish (es)");
eq("lang: english is not translated to itself", languages.describe("en", true), "English (en)");
eq("lang: unknown code falls back to the code", languages.describe("zz", false), "ZZ (zz)");
eq("lang: null code", languages.describe(null, true), null);
eq("lang: empty code", languages.describe("", false), null);
eq("lang: name lookup", languages.name("fr"), "French");
eq("lang: name of null", languages.name(null), null);

// Every language whisper can report must render as "Name (code)".
const malformed = Object.keys(languages.NAMES).filter(
  (c) => !new RegExp(`^.+ \\(${c}\\)$`).test(languages.describe(c, false)),
);
eq("lang: every code formats correctly", malformed, []);
eq("lang: covers whisper's language set", Object.keys(languages.NAMES).length >= 99, true);
