const { eq } = require("./helpers.js");
const models = require("../src/models.js");

eq("models: basename from a path", models.basename("/a/b/ggml-small.bin"), "ggml-small.bin");
eq("models: basename of a bare name", models.basename("ggml-small.bin"), "ggml-small.bin");

eq("models: small is multilingual", models.isEnglishOnly("@data/models/ggml-small.bin"), false);
eq("models: small.en is english-only", models.isEnglishOnly("@data/models/ggml-small.en.bin"), true);
eq("models: quantised .en is english-only", models.isEnglishOnly("ggml-base.en-q5_1.bin"), true);

eq("models: small can translate", models.canTranslate("@data/models/ggml-small.bin"), true);
eq("models: medium can translate", models.canTranslate("ggml-medium.bin"), true);
eq("models: large-v3 can translate", models.canTranslate("ggml-large-v3.bin"), true);
// Verified empirically: turbo accepts --translate and returns the source language.
eq("models: turbo cannot translate", models.canTranslate("@data/models/ggml-large-v3-turbo.bin"), false);
eq("models: quantised turbo cannot translate", models.canTranslate("ggml-large-v3-turbo-q5_0.bin"), false);
eq("models: english-only cannot translate", models.canTranslate("ggml-medium.en.bin"), false);
eq("models: empty path cannot translate", models.canTranslate(""), false);

eq("models: turbo still detects language", models.detectsLanguage("ggml-large-v3-turbo.bin"), true);
eq("models: english-only does not detect", models.detectsLanguage("ggml-base.en.bin"), false);
