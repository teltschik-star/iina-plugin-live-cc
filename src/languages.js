// Whisper's language set, keyed by the ISO code it reports in its JSON output.
const NAMES = {
  en: "English", zh: "Chinese", de: "German", es: "Spanish", ru: "Russian",
  ko: "Korean", fr: "French", ja: "Japanese", pt: "Portuguese", tr: "Turkish",
  pl: "Polish", ca: "Catalan", nl: "Dutch", ar: "Arabic", sv: "Swedish",
  it: "Italian", id: "Indonesian", hi: "Hindi", fi: "Finnish", vi: "Vietnamese",
  he: "Hebrew", uk: "Ukrainian", el: "Greek", ms: "Malay", cs: "Czech",
  ro: "Romanian", da: "Danish", hu: "Hungarian", ta: "Tamil", no: "Norwegian",
  th: "Thai", ur: "Urdu", hr: "Croatian", bg: "Bulgarian", lt: "Lithuanian",
  la: "Latin", mi: "Maori", ml: "Malayalam", cy: "Welsh", sk: "Slovak",
  te: "Telugu", fa: "Persian", lv: "Latvian", bn: "Bengali", sr: "Serbian",
  az: "Azerbaijani", sl: "Slovenian", kn: "Kannada", et: "Estonian",
  mk: "Macedonian", br: "Breton", eu: "Basque", is: "Icelandic", hy: "Armenian",
  ne: "Nepali", mn: "Mongolian", bs: "Bosnian", kk: "Kazakh", sq: "Albanian",
  sw: "Swahili", gl: "Galician", mr: "Marathi", pa: "Punjabi", si: "Sinhala",
  km: "Khmer", sn: "Shona", yo: "Yoruba", so: "Somali", af: "Afrikaans",
  oc: "Occitan", ka: "Georgian", be: "Belarusian", tg: "Tajik", sd: "Sindhi",
  gu: "Gujarati", am: "Amharic", yi: "Yiddish", lo: "Lao", uz: "Uzbek",
  fo: "Faroese", ht: "Haitian Creole", ps: "Pashto", tk: "Turkmen",
  nn: "Nynorsk", mt: "Maltese", sa: "Sanskrit", lb: "Luxembourgish",
  my: "Burmese", bo: "Tibetan", tl: "Tagalog", mg: "Malagasy", as: "Assamese",
  tt: "Tatar", haw: "Hawaiian", ln: "Lingala", ha: "Hausa", ba: "Bashkir",
  jw: "Javanese", su: "Sundanese", yue: "Cantonese",
};

/** English name for a language code, falling back to the code itself. */
function name(code) {
  if (!code) return null;
  const key = String(code).toLowerCase();
  return NAMES[key] || key.toUpperCase();
}

/**
 * The badge text for a detected language, e.g. "Spanish (es)", or
 * "Spanish (es) → English (en)" when the output is being translated.
 */
function describe(code, translating) {
  if (!code) return null;
  const key = String(code).toLowerCase();
  const label = `${name(key)} (${key})`;
  // Translating English to English would be a confusing thing to display.
  if (translating && key !== "en") {
    return `${label} → ${NAMES.en} (en)`;
  }
  return label;
}

module.exports = { name, describe, NAMES };
