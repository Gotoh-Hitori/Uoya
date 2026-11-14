/*! LongMemory Hydrograph | CaviraOSS / nullure (c) 2026 | Apache-2.0. Built from the locally supplied source; see LICENSE and NOTICE. */

// LongMemory-main/LongMemory-main/src/core/engine/claim_extractor.ts
var preference = /\b(?:I|we)\s+(?:(?:now|also|really|especially|generally)\s+)*(?:prefer|like|love|dislike|hate)\s+(.+?)(?:\s+instead of\s+(.+))?$/i;
var moved_location = /\b(?:my\s+(?:friend|colleague|coworker|partner)\s+)?([A-Z][\p{L}'-]+)\b[^.!?]{0,80}?\bmov(?:ed|ing)\b[^.!?]{0,40}?\b(?:back\s+)?to\s+(?:the\s+)?(.+)$/iu;
var location = /\b(.+?)\s+(?:is|are|was|were)\s+(?:currently\s+|now\s+)?(?:in|at|on)\s+(.+)$/i;
var copula = /\b(.+?)\s+(?:is|are|was|were)\s+(.+)$/i;
var first_person = /^(?:(?:hi|hello|hey)[,\s]+)?(?:i\s+am|i['\u2019]m|my\s+name\s+is)\s+(.+)$/i;
var contact = /^(?:please\s+)?(?:ping|contact|message|reach)\s+me\s+(?:on|via|by)\s+(.+?)(?:\s+(?:instead of|rather than)\s+.+)?$/i;
var mode_change = /^(?:(?:actually|please|now)[,\s]+)*(?:switch|change)\s+me\s+to\s+(.+\b(?:mode|theme))$/i;
function preference_topic(object) {
  const topic = object.match(/\bas my\s+([a-z0-9_-]+)/i);
  const mode = object.match(/\b(mode|theme)\b/i);
  return topic ? `preference:${clean(topic[1])}` : mode ? `preference:${clean(mode[1])}` : "preference:general";
}
function clean(value) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").toLowerCase();
}
var table_cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
var separator_cell = (cell) => /^:?-{3,}:?$/.test(cell);
function extract_table_claims(text) {
  const lines = text.split(/\r?\n/);
  const claims = [];
  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].trim().startsWith("|")) continue;
    const separators = table_cells(lines[index]);
    if (!separators.length || !separators.every(separator_cell)) continue;
    const headers = table_cells(lines[index - 1]);
    for (let row_index = index + 1; row_index < lines.length && lines[row_index].trim().startsWith("|"); row_index++) {
      const row = table_cells(lines[row_index]);
      const subject = clean(row[0] || `row ${row_index - index}`);
      for (let column = 1; column < Math.min(headers.length, row.length); column++) {
        if (!headers[column] || !row[column]) continue;
        const heading = clean(headers[column]);
        const object = clean(row[column]);
        claims.push({
          kind: "fact",
          statement: `${subject}: ${heading} = ${object}`,
          subject,
          predicate: `table:${heading}`,
          object,
          topic: `table:${subject}:${heading}`
        });
      }
    }
  }
  return claims;
}
function extract_claims(text) {
  const table_claims = extract_table_claims(text);
  const source_role = text.match(/^\s*(user|assistant|system|tool|function):\s*/i)?.[1].toLowerCase() ?? "user";
  const prose = text.split(/\r?\n/).filter((line) => !line.trim().startsWith("|")).join("\n");
  const protected_text = prose.replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, (email) => email.replaceAll(".", "<period>").replaceAll("!", "<exclaim>").replaceAll("?", "<question>")).replace(/(?<=\d)\.(?=\d)/g, "<period>").replace(/\b(Dr|Mr|Mrs|Ms|Prof|[A-Z])\./g, "$1<period>");
  const lines = protected_text.split(/\n+/).reduce((joined, line) => {
    const candidate = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^\s*(?:user|assistant|system|tool|function):\s*/i, "").trim();
    const starts_claim = [preference, moved_location, location, copula, first_person, contact, mode_change].some((pattern) => pattern.test(candidate));
    if (!joined.length || starts_claim || /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) joined.push(line);
    else joined[joined.length - 1] += ` ${line.trim()}`;
    return joined;
  }, []);
  const statements = lines.flatMap((line) => line.split(/[.!?]+/)).flatMap((item) => item.split(/,\s*(?=(?:please\s+)?(?:ping|contact|message|reach)\s+me\b)/i)).map((item) => item.replaceAll("<period>", ".").replaceAll("<exclaim>", "!").replaceAll("<question>", "?").replace(/^\s*(?:user|assistant|system|tool|function):\s*/i, "").trim()).filter(Boolean);
  const prose_claims = statements.map((statement) => {
    const pref = statement.match(preference) ?? statement.match(mode_change);
    if (pref) {
      const object = clean(pref[1]);
      return {
        kind: "preference",
        statement,
        subject: source_role,
        predicate: "prefers",
        object,
        topic: preference_topic(object)
      };
    }
    const channel = statement.match(contact);
    if (channel) {
      return {
        kind: "fact",
        statement,
        subject: source_role,
        predicate: "contact_via",
        object: clean(channel[1]),
        topic: `contact_via:${source_role}`
      };
    }
    const profile = statement.match(first_person);
    if (profile) {
      const named = /\bname\s+is\b/i.test(statement) || /^(?:hi|hello|hey)[,\s]+/i.test(statement) && /^[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){0,3}$/u.test(profile[1]);
      const place2 = profile[1].match(/^(?:currently\s+|now\s+)?(?:in|at|on)\s+(.+)$/i);
      const role = /^(?:a\s+|an\s+|the\s+)?(?:[\p{L}-]+\s+){0,4}(?:lead|engineer|developer|designer|manager|researcher|teacher|doctor|nurse|student|director)\b/iu.test(profile[1]);
      const predicate = named ? "name" : place2 ? "located_in" : role ? "role" : "is";
      const object = clean(place2 && !named ? place2[1] : profile[1]);
      return {
        kind: "fact",
        statement,
        subject: source_role,
        predicate,
        object,
        topic: `${predicate}:${source_role}${predicate === "is" ? `:${object}` : ""}`
      };
    }
    const moved = statement.match(moved_location);
    if (moved) {
      return {
        kind: "fact",
        statement,
        subject: clean(moved[1]),
        predicate: "located_in",
        object: clean(moved[2]),
        topic: `located_in:${clean(moved[1])}`
      };
    }
    const place = statement.match(location);
    if (place) {
      return {
        kind: "fact",
        statement,
        subject: clean(place[1]),
        predicate: "located_in",
        object: clean(place[2]),
        topic: `located_in:${clean(place[1])}`
      };
    }
    const fact = statement.match(copula);
    if (fact) {
      return {
        kind: "fact",
        statement,
        subject: clean(fact[1]),
        predicate: "is",
        object: clean(fact[2]),
        topic: `is:${clean(fact[1])}`
      };
    }
    const lower = statement.toLowerCase();
    const kind = /\b(first|then|step|procedure|workflow|to fix)\b/.test(lower) ? "procedure" : /\b(realized|learned|noticed|think|believe)\b/.test(lower) ? "reflection" : "action";
    return { kind, statement, subject: source_role, predicate: kind, object: clean(statement), topic: `${kind}:${source_role}:${clean(statement)}` };
  });
  return [...table_claims, ...prose_claims];
}
function claims_conflict(left, right) {
  return left.topic === right.topic && left.object !== right.object;
}
function render_claim(claim) {
  return claim.predicate.startsWith("table:") ? `${claim.subject}: ${claim.predicate.slice(6)} = ${claim.object}` : `${claim.subject} ${claim.predicate} ${claim.object}`;
}
function summarize_claims(claims, limit = 32, context) {
  const statements = [...new Set(claims.map((claim) => context ? claim.statement.trim() || render_claim(claim) : render_claim(claim)))].slice(0, limit);
  if (!statements.length) return "";
  const labels = context ? [
    context.observed_at !== void 0 && Number.isFinite(context.observed_at) ? new Date(context.observed_at).toISOString() : "",
    context.speaker?.trim() ?? ""
  ].filter(Boolean) : [];
  return `${labels.length ? `[${labels.join(" ")}] ` : ""}${statements.join("; ")}`;
}

// LongMemory-main/LongMemory-main/src/core/i18n/script_detection.ts
var ranges = [
  ["Latin", new RegExp("\\p{Script=Latin}", "u")],
  ["Devanagari", new RegExp("\\p{Script=Devanagari}", "u")],
  ["Telugu", new RegExp("\\p{Script=Telugu}", "u")],
  ["Tamil", new RegExp("\\p{Script=Tamil}", "u")],
  ["Bengali", new RegExp("\\p{Script=Bengali}", "u")],
  ["Arabic", new RegExp("\\p{Script=Arabic}", "u")],
  ["Hiragana", new RegExp("\\p{Script=Hiragana}", "u")],
  ["Katakana", new RegExp("\\p{Script=Katakana}", "u")],
  ["Hangul", new RegExp("\\p{Script=Hangul}", "u")],
  ["Han", new RegExp("\\p{Script=Han}", "u")],
  ["Cyrillic", new RegExp("\\p{Script=Cyrillic}", "u")]
];
function ascii_script(code) {
  if (code >= 65 && code <= 90 || code >= 97 && code <= 122) return "Latin";
  return code < 32 || code === 127 ? "Unknown" : "Common";
}
function script_of_character(character) {
  const code = character.charCodeAt(0);
  if (code < 128) return ascii_script(code);
  if (/^[\p{Number}\p{Punctuation}\p{Separator}\p{Symbol}\p{Mark}]$/u.test(character)) return "Common";
  return ranges.find(([, pattern]) => pattern.test(character))?.[0] ?? "Unknown";
}
function detect_script(text) {
  let latin = 0;
  let ascii_only = true;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 128) {
      ascii_only = false;
      break;
    }
    if (code >= 65 && code <= 90 || code >= 97 && code <= 122) latin++;
  }
  if (ascii_only) {
    return latin > 0 ? { script: "Latin", scripts: [{ script: "Latin", count: latin, ratio: 1 }], direction: "ltr", confidence: 1 } : { script: "Unknown", scripts: [], direction: "neutral", confidence: 0 };
  }
  const counts = /* @__PURE__ */ new Map();
  for (const character of text) {
    const script2 = script_of_character(character);
    if (script2 === "Common" || script2 === "Unknown") continue;
    counts.set(script2, (counts.get(script2) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const scripts = [...counts.entries()].map(([script2, count]) => ({ script: script2, count, ratio: total ? count / total : 0 })).sort((left, right) => right.count - left.count);
  const dominant = scripts[0];
  const significant = scripts.filter((item) => item.ratio >= 0.15);
  const script = !dominant ? "Unknown" : significant.length > 1 ? "Mixed" : dominant.script;
  const has_rtl = scripts.some((item) => item.script === "Arabic");
  const has_ltr = scripts.some((item) => item.script !== "Arabic");
  const direction = has_rtl && has_ltr ? "mixed" : has_rtl ? "rtl" : has_ltr ? "ltr" : "neutral";
  return { script, scripts, direction, confidence: dominant?.ratio ?? 0 };
}

// LongMemory-main/LongMemory-main/src/core/i18n/language_detection.ts
var lexical = {
  en: /* @__PURE__ */ new Set(["the", "is", "are", "what", "which", "for", "with", "user", "prefer", "likes", "language", "backend", "project"]),
  es: /* @__PURE__ */ new Set(["el", "la", "los", "las", "que", "para", "con", "usuario", "prefiere", "idioma", "proyecto"]),
  fr: /* @__PURE__ */ new Set(["le", "la", "les", "que", "pour", "avec", "utilisateur", "pr\xE9f\xE8re", "langue", "projet"]),
  de: /* @__PURE__ */ new Set(["der", "die", "das", "und", "f\xFCr", "mit", "benutzer", "bevorzugt", "sprache", "projekt"]),
  nl: /* @__PURE__ */ new Set(["de", "het", "een", "voor", "met", "gebruiker", "voorkeur", "taal", "project"]),
  fi: /* @__PURE__ */ new Set(["ja", "on", "ett\xE4", "varten", "kanssa", "k\xE4ytt\xE4j\xE4", "suosii", "kieli", "projekti"]),
  pt: /* @__PURE__ */ new Set(["o", "a", "os", "as", "para", "com", "usu\xE1rio", "prefere", "idioma", "projeto"])
};
var script_language = {
  Devanagari: "hi",
  Telugu: "te",
  Tamil: "ta",
  Bengali: "bn",
  Hangul: "ko",
  Cyrillic: "ru"
};
var words = (text) => text.toLocaleLowerCase().match(new RegExp("\\p{Letter}+", "gu")) ?? [];
var arabic_language = (text) => /[ٹڈڑںھہےۓپچژگک]/u.test(text) || /\b(ہے|کے|میں|اور|مجھے)\b/u.test(text) ? "ur" : "ar";
var cjk_language = (text) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? "ja" : new RegExp("\\p{Script=Hangul}", "u").test(text) ? "ko" : "zh";
function assign_language_confidence(text, language, detected) {
  if (!text.trim() || language === "und") return 0;
  const script = detected ?? detect_script(text);
  if (language === "mixed") return Math.min(0.99, 0.6 + script.scripts.filter((item) => item.ratio >= 0.15).length * 0.1);
  if (script_language[script.script] === language) return Math.max(0.85, script.confidence);
  if ((language === "ar" || language === "ur") && script.scripts.some((item) => item.script === "Arabic")) return 0.9;
  if (["zh", "ja", "ko"].includes(language) && script.scripts.some((item) => ["Han", "Hiragana", "Katakana", "Hangul"].includes(item.script))) return 0.9;
  const dictionary = lexical[language];
  if (!dictionary) return 0.55;
  const tokens3 = words(text);
  const hits = tokens3.filter((token) => dictionary.has(token)).length;
  return Math.min(0.95, 0.5 + hits / Math.max(4, tokens3.length));
}
function detect_language(text, detected) {
  const script = detected ?? detect_script(text);
  const significant = script.scripts.filter((item) => item.ratio >= 0.15).map((item) => item.script);
  if (significant.length > 1 && significant.some((item) => item !== "Latin")) {
    const grouped = /* @__PURE__ */ new Map();
    for (const item of significant) {
      const language2 = script_language[item] ?? (item === "Arabic" ? arabic_language(text) : item === "Han" || item === "Hiragana" || item === "Katakana" ? cjk_language(text) : "en");
      grouped.set(language2, (grouped.get(language2) ?? 0) + (script.scripts.find((entry) => entry.script === item)?.ratio ?? 0));
    }
    const alternatives = [...grouped.entries()].map(([language2, confidence2]) => ({ language: language2, confidence: confidence2 })).sort((left, right) => right.confidence - left.confidence);
    if (alternatives.length === 1) return { language: alternatives[0].language, confidence: Math.max(0.85, alternatives[0].confidence), alternatives, script: script.script };
    return { language: "mixed", confidence: assign_language_confidence(text, "mixed", script), alternatives, script: script.script };
  }
  let language = script_language[script.script] ?? "und";
  if (script.script === "Arabic") language = arabic_language(text);
  else if (["Han", "Hiragana", "Katakana", "Hangul"].includes(script.script)) language = cjk_language(text);
  else if (script.script === "Latin" || script.script === "Unknown") {
    const tokens3 = words(text);
    const scores = Object.entries(lexical).map(([code, dictionary]) => ({ language: code, score: tokens3.filter((token) => dictionary?.has(token)).length }));
    scores.sort((left, right) => right.score - left.score);
    language = scores[0]?.score ? scores[0].language : "en";
    const alternatives = scores.filter((item) => item.score > 0).slice(0, 3).map((item) => ({ language: item.language, confidence: Math.min(0.9, 0.45 + item.score / Math.max(4, tokens3.length)) }));
    return { language, confidence: assign_language_confidence(text, language, script), alternatives, script: script.script };
  }
  const confidence = assign_language_confidence(text, language, script);
  return { language, confidence, alternatives: [{ language, confidence }], script: script.script };
}
var segment_language = (text, script) => {
  if (script === "Latin") return detect_language(text);
  const language = script_language[script] ?? (script === "Arabic" ? arabic_language(text) : ["Han", "Hiragana", "Katakana", "Hangul"].includes(script) ? cjk_language(text) : "und");
  return { language, confidence: assign_language_confidence(text, language), alternatives: [], script };
};
function detect_code_switching(text) {
  const segments = [];
  let start = 0;
  let current = null;
  const flush = (end) => {
    if (current === null || end <= start) return;
    const value = text.slice(start, end);
    if (!value.trim()) return;
    const detected = segment_language(value, current);
    segments.push({ text: value, start, end, language: detected.language, script: current, confidence: detected.confidence });
  };
  const characters = [...text];
  let offset = 0;
  for (const character of characters) {
    const script = script_of_character(character);
    const next = script === "Common" ? current : script;
    if (current === null) {
      current = next ?? "Common";
      start = offset;
    } else if (next && next !== current && script !== "Common") {
      flush(offset);
      start = offset;
      current = next;
    }
    offset += character.length;
  }
  flush(text.length);
  if (segments.length <= 1) return segments;
  return segments.filter((segment) => segment.text.trim());
}

// LongMemory-main/LongMemory-main/src/core/i18n/locale_context.ts
var default_locales = {
  en: "en-US",
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
  bn: "bn-IN",
  ur: "ur-PK",
  ar: "ar-SA",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  nl: "nl-NL",
  fi: "fi-FI",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  pt: "pt-BR"
};
function create_locale_context(language, script, locale, direction = script === "Arabic" ? "rtl" : "ltr") {
  const resolved = locale ?? default_locales[language] ?? "und";
  const region = resolved.includes("-") ? resolved.split("-")[1] : null;
  return { locale: resolved, language, script, region, direction, cultural_context: {} };
}

// LongMemory-main/LongMemory-main/src/core/i18n/normalization.ts
var punctuation = (text) => text.replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/[‐‑‒–—―]/g, "-").replace(/…/g, "...");
function normalize_multilingual_text(text, language = "und", locale) {
  const normalized_text = punctuation(text.normalize("NFC").replace(/[\u200B\uFEFF]/g, "").replace(/[\t\v\f ]+/g, " ").replace(/\r\n?/g, "\n").replace(/ *\n */g, "\n").trim());
  const canonical_text = normalized_text.toLocaleLowerCase(locale ?? (language === "und" || language === "mixed" ? void 0 : language)).normalize("NFC");
  const diacritic_folded_text = new RegExp("\\p{Script=Latin}", "u").test(canonical_text) ? canonical_text.normalize("NFD").replace(new RegExp("\\p{Mark}+", "gu"), "").normalize("NFC") : null;
  return { original_text: text, normalized_text, canonical_text, diacritic_folded_text };
}

// LongMemory-main/LongMemory-main/src/core/i18n/transliteration.ts
var phrases = {
  "\u0928\u0930\u0947\u0902\u0926\u094D\u0930 \u092E\u094B\u0926\u0940": "narendra modi",
  "\u0928\u0930\u0947\u0928\u094D\u0926\u094D\u0930 \u092E\u094B\u0926\u0940": "narendra modi",
  "\u0C2E\u0C4B\u0C26\u0C40": "modi",
  "\u0C2E\u0C4B\u0C21\u0C40": "modi",
  "\u0633\u0645\u0631 \u062E\u0627\u0646": "samar khan",
  "\u062B\u0645\u0631 \u062E\u0627\u0646": "samar khan"
};
var cyrillic = Object.fromEntries([...`\u0430\u0431\u0432\u0433\u0434\u0435\u0451\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F`].map((value, index) => [value, ["a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"][index]]));
var arabic = { \u0627: "a", \u0623: "a", \u0625: "i", \u0622: "aa", \u0628: "b", \u062A: "t", \u062B: "th", \u062C: "j", \u062D: "h", \u062E: "kh", \u062F: "d", \u0630: "dh", \u0631: "r", \u0632: "z", \u0633: "s", \u0634: "sh", \u0635: "s", \u0636: "d", \u0637: "t", \u0638: "z", \u0639: "'", \u063A: "gh", \u0641: "f", \u0642: "q", \u0643: "k", \u06A9: "k", \u06AF: "g", \u0644: "l", \u0645: "m", \u0646: "n", \u06BA: "n", \u0647: "h", \u06C1: "h", \u0648: "w", \u0624: "u", \u064A: "y", \u06CC: "y", \u0649: "a", \u06D2: "e", \u067E: "p", \u0686: "ch", \u0698: "zh", \u0691: "r", \u0679: "t", \u0688: "d" };
var map_characters = (text, map) => [...text.toLocaleLowerCase()].map((character) => map[character] ?? character).join("").replace(/\s+/g, " ").trim();
function transliterate(text, language = "und") {
  const exact = phrases[text.trim()];
  if (exact) return { text: exact, confidence: 0.99, scheme: "longmemory-curated" };
  if (new RegExp("\\p{Script=Cyrillic}", "u").test(text)) return { text: map_characters(text, cyrillic), confidence: 0.82, scheme: "iso-like-cyrillic" };
  if (new RegExp("\\p{Script=Arabic}", "u").test(text)) return { text: map_characters(text, arabic), confidence: language === "ur" ? 0.72 : 0.78, scheme: "buckwalter-like" };
  if (new RegExp("\\p{Script=Latin}", "u").test(text) && [...text].every((character) => ["Latin", "Common"].includes(script_of_character(character)))) return { text: text.toLocaleLowerCase(), confidence: 1, scheme: "identity-latin" };
  return null;
}
var transliteration_aliases = (values, language) => [...new Set(values.flatMap((value) => {
  const result = transliterate(value, language);
  return result && result.text.toLocaleLowerCase() !== value.toLocaleLowerCase() ? [result.text] : [];
}))];

// LongMemory-main/LongMemory-main/src/core/engine/perception_parser.ts
var entity_re = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[A-Z]\.[ ]?[A-Z][a-z]+|[A-Z][a-z]{2,})\b/g;
var emotion_re = /\b(afraid|anxious|angry|excited|happy|sad|proud|frustrated|delighted|fear|love|hate)\b/gi;
var action_re = /\b(?:I|we)\s+(?:ran|run|built|build|deployed|deploy|fixed|fix|installed|install|visited|moved|created|create)\b[^.!?]*/gi;
var procedure_re = /\b(?:first|then|next|finally|step|procedure|workflow|to fix|to deploy)\b[^.!?]*/gi;
var reflection_re = /\b(?:I|we)\s+(?:realized|learned|noticed|think|believe|understand|reflected)\b[^.!?]*/gi;
var preference_re = /\b(?:I|we)\s+(?:(?:now|also|really|especially|generally)\s+)*(?:prefer|like|love|dislike|hate)\b[^.!?]*/gi;
function infer_type(name) {
  if (/^(?:Berlin|Tokyo|Finland|Sweden|Germany|Rome|Kyoto)$/i.test(name)) return "place";
  if (/^(?:Project|LongMemory)/i.test(name)) return "project";
  if (/^[A-Z]\.|\s/.test(name)) return "person";
  return "unknown";
}
function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0].trim());
}
function parse_perception(event, now = Date.now()) {
  if (!event.user_id?.trim()) throw new Error("MemoryEvent.user_id is required");
  if (!event.text?.trim()) throw new Error("MemoryEvent.text is required");
  const at = event.at ?? now;
  const observed_at = event.observed_at ?? at;
  const valid_from = event.valid_from ?? observed_at;
  const external = event.external === true || event.zone === "exocortex" || event.source !== void 0;
  const detected_language = detect_language(event.text);
  const language = event.language ?? detected_language.language;
  const script = detect_script(event.text);
  const locale = create_locale_context(language, script.script, event.locale, script.direction);
  const normalization = normalize_multilingual_text(event.text, language, locale.locale);
  const transliteration = event.transliteration ?? (event.enable_transliteration === false ? null : transliterate(normalization.normalized_text, language)?.text ?? null);
  const speaker = event.speaker?.trim();
  const claims = extract_claims(event.text).map((claim) => {
    const subject = claim.subject === "user" && speaker ? speaker.toLocaleLowerCase() : claim.subject;
    const topic = claim.kind === "preference" ? claim.topic.replace(/^preference:/, `preference:${subject}:`) : claim.topic.replace(/:user(?=:|$)/i, `:${subject}`);
    return { ...claim, subject, topic };
  });
  const context = event.text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const named_speaker = speaker && !/^(?:user|assistant|system|tool|function|speaker)$/i.test(speaker) ? speaker : null;
  const names = [.../* @__PURE__ */ new Set([...event.text.match(entity_re) ?? [], ...named_speaker ? [named_speaker] : []])];
  const entities = [
    ...names.map((name) => ({ name, type: infer_type(name), context, observed_at })),
    ...(event.entity_hints ?? []).map((hint) => ({
      ...hint,
      aliases: [...new Set(hint.aliases ?? [])],
      observed_at: hint.observed_at ?? observed_at,
      metadata: { ...hint.metadata, language, script: script.script, transliteration_aliases: event.enable_transliteration === false ? [] : transliteration_aliases([hint.name, ...hint.aliases ?? []], language) }
    }))
  ];
  return {
    event,
    text: event.text.trim(),
    at,
    observed_at,
    valid_from,
    valid_to: event.valid_to ?? null,
    entities,
    claims,
    preferences: matches(event.text, preference_re),
    actions: matches(event.text, action_re),
    procedures: matches(event.text, procedure_re),
    emotions: matches(event.text, emotion_re),
    reflections: matches(event.text, reflection_re),
    possible_external_facts: external ? claims.map((claim) => claim.statement) : [],
    zone: external ? "exocortex" : "endocortex",
    multilingual: {
      language,
      language_confidence: event.language ? 1 : detected_language.confidence,
      script,
      original_text: event.text,
      normalization,
      translated_text: event.translated_text ?? null,
      translation_provenance: event.translation_provenance ?? null,
      transliteration,
      locale: locale.locale,
      code_switch_segments: detect_code_switching(event.text)
    }
  };
}

// LongMemory-main/LongMemory-main/src/core/types/facets.ts
function empty_facets() {
  return {
    episodic: null,
    semantic: null,
    procedural: null,
    emotional: null,
    reflective: null
  };
}

// LongMemory-main/LongMemory-main/src/core/engine/facet_extractor.ts
function extract_facets(parsed) {
  const facets = empty_facets();
  if (parsed.preferences.length > 0 || parsed.claims.some((claim) => claim.kind === "fact")) {
    facets.semantic = { value: parsed.text, weight: parsed.preferences.length > 0 ? 1 : 0.8 };
  }
  if (parsed.actions.length > 0) facets.episodic = { value: parsed.actions.join("; "), weight: 0.8 };
  if (parsed.procedures.length > 0 || parsed.claims.some((claim) => claim.kind === "procedure")) {
    facets.procedural = { value: parsed.procedures.join("; ") || parsed.text, weight: 0.9 };
  }
  if (parsed.emotions.length > 0) facets.emotional = { value: parsed.emotions.join(", "), weight: 0.9 };
  if (parsed.reflections.length > 0 || parsed.claims.some((claim) => claim.kind === "reflection")) {
    facets.reflective = { value: parsed.reflections.join("; ") || parsed.text, weight: 0.8 };
  }
  if (parsed.event.facet_hint) facets[parsed.event.facet_hint] = { value: parsed.text, weight: 0.9 };
  if (Object.values(facets).every((facet) => facet === null)) {
    facets.episodic = { value: parsed.text, weight: 0.6 };
  }
  return facets;
}

// LongMemory-main/LongMemory-main/src/core/engine/ingest_transaction.ts
var IngestTransactionError = class extends Error {
  constructor(cause) {
    super(`ingest transaction rolled back: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.cause = cause;
    this.name = "IngestTransactionError";
  }
  cause;
  rolled_back = true;
};
var IngestTransaction = class {
  constructor(stores, options = {}) {
    this.stores = stores;
    this.options = options;
  }
  stores;
  options;
  run(operation) {
    if (this.options.incremental) return this.run_incremental(operation);
    const snapshots = {
      graph: this.stores.graph.snapshot(),
      resolver: this.stores.resolver.snapshot(),
      worlds: this.stores.worlds.snapshot(),
      worlddb: this.stores.worlddb.snapshot(),
      index: this.stores.index.snapshot(),
      sketches: this.options.snapshot_sketches === false ? null : this.stores.sketches.serialize(),
      working: this.stores.working.checkpoint()
    };
    try {
      return operation();
    } catch (error) {
      this.stores.graph.restore(snapshots.graph);
      this.stores.resolver.restore(snapshots.resolver);
      this.stores.worlds.restore(snapshots.worlds);
      this.stores.worlddb.restore(snapshots.worlddb);
      this.stores.index.restore(snapshots.index);
      if (snapshots.sketches !== null) this.stores.sketches.restore(snapshots.sketches);
      this.stores.working.rollback(snapshots.working);
      throw new IngestTransactionError(error);
    }
  }
  run_incremental(operation) {
    const checkpoints = {
      graph: this.stores.graph.checkpoint(),
      worlds: this.stores.worlds.checkpoint(),
      index: this.stores.index.checkpoint(),
      resolver: this.stores.resolver.checkpoint(),
      worlddb: this.stores.worlddb.checkpoint(),
      working: this.stores.working.checkpoint()
    };
    try {
      const result = operation();
      this.stores.graph.commit(checkpoints.graph);
      this.stores.worlds.commit(checkpoints.worlds);
      this.stores.index.commit(checkpoints.index);
      this.stores.resolver.commit(checkpoints.resolver);
      this.stores.worlddb.commit(checkpoints.worlddb);
      return result;
    } catch (error) {
      this.stores.graph.rollback(checkpoints.graph);
      this.stores.worlds.rollback(checkpoints.worlds);
      this.stores.index.rollback(checkpoints.index);
      this.stores.resolver.rollback(checkpoints.resolver);
      this.stores.worlddb.rollback(checkpoints.worlddb);
      this.stores.working.rollback(checkpoints.working);
      throw new IngestTransactionError(error);
    }
  }
};

// LongMemory-main/LongMemory-main/src/core/hash/content_hash.ts
import { createHash } from "node:crypto";

// LongMemory-main/LongMemory-main/src/core/hash/canonical_json.ts
function canonicalize(value) {
  return serialize(value);
}
function serialize(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalize: non-finite number is not allowed");
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v === void 0 ? null : v)).join(",") + "]";
  }
  if (t === "object") {
    const obj = value;
    const keys = Object.keys(obj).filter((k) => obj[k] !== void 0).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`canonicalize: unsupported value of type ${t}`);
}

// LongMemory-main/LongMemory-main/src/core/hash/content_hash.ts
function sha256_hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function hash_canonical(value) {
  return sha256_hex(canonicalize(value));
}
var default_node_hash_policy = {
  content: true,
  facets: true,
  world: true,
  temporal: true,
  grounding: false,
  contract: false,
  provenance: false
};
var default_edge_hash_policy = {
  relation: true,
  temporal: true,
  handler: true,
  provenance: false
};
function project_node(node, policy2) {
  const projection = {};
  if (policy2.content) {
    projection.content = {
      raw: node.content.raw,
      canonical: node.content.canonical,
      summary: node.content.summary,
      claims: node.content.claims
    };
  }
  if (policy2.facets) {
    projection.facets = node.facets;
  }
  if (policy2.world) {
    projection.world = {
      world_id: node.world.world_id,
      parent_world_id: node.world.parent_world_id,
      zone: node.world.zone,
      scope_path: node.world.scope_path
    };
  }
  if (policy2.temporal) {
    projection.temporal = {
      valid_from: node.temporal.valid_from,
      observed_at: node.temporal.observed_at
    };
  }
  if (policy2.grounding) {
    projection.grounding = {
      worlddb_ref: node.grounding.worlddb_ref,
      source_ids: node.grounding.source_ids,
      grounding_score: node.grounding.grounding_score
    };
  }
  if (policy2.contract) {
    projection.contract = node.contract;
  }
  if (policy2.provenance) {
    projection.provenance = node.provenance;
  }
  return projection;
}
function hash_node(node, policy2 = default_node_hash_policy) {
  return hash_canonical(project_node(node, policy2));
}
function verify_node_hash(node, policy2 = default_node_hash_policy) {
  return hash_node(node, policy2) === node.content_hash;
}
function project_edge(edge, policy2) {
  const projection = {};
  if (policy2.relation) {
    projection.relation = {
      from: edge.from,
      to: edge.to,
      type: edge.type
    };
  }
  if (policy2.temporal) {
    projection.temporal = {
      valid_from: edge.temporal.valid_from,
      valid_to: edge.temporal.valid_to,
      observed_at: edge.temporal.observed_at
    };
  }
  if (policy2.handler) {
    projection.handler = edge.handler;
  }
  if (policy2.provenance) {
    projection.provenance = edge.provenance;
  }
  return projection;
}
function hash_edge(edge, policy2 = default_edge_hash_policy) {
  return hash_canonical(project_edge(edge, policy2));
}

// LongMemory-main/LongMemory-main/src/core/hash/merkle.ts
var empty = sha256_hex("merkle:empty");
var leaf_prefix = "merkle:leaf:";
var node_prefix = "merkle:node:";
function hash_merkle_children(children) {
  if (children.length === 0) return empty;
  let level = children.map((c) => sha256_hex(leaf_prefix + c));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256_hex(node_prefix + left + ":" + right));
    }
    level = next;
  }
  return level[0];
}

// LongMemory-main/LongMemory-main/src/core/memory/durable_graph.ts
function deep_freeze(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deep_freeze(value[key]);
  }
  return value;
}
function create_hydro_node(input, policy2 = default_node_hash_policy) {
  const normalized = { ...input, metadata: input.metadata ?? {} };
  const draft = { ...normalized, id: input.id ?? "", content_hash: "" };
  const content_hash = hash_node(draft, policy2);
  const node = {
    ...normalized,
    content_hash,
    id: input.id ?? `node:${content_hash}`
  };
  return deep_freeze(node);
}
function create_hydro_edge(input, policy2 = default_edge_hash_policy) {
  const draft = { ...input, id: input.id ?? "" };
  const edge_hash = hash_edge(draft, policy2);
  const edge = { ...input, id: input.id ?? `edge:${edge_hash}` };
  return deep_freeze(edge);
}
var DurableGraph = class {
  constructor(node_policy = default_node_hash_policy) {
    this.node_policy = node_policy;
  }
  node_policy;
  nodes = /* @__PURE__ */ new Map();
  edges = /* @__PURE__ */ new Map();
  checkpoints = /* @__PURE__ */ new Set();
  _revision = 0;
  /**
   * Insert a durable node. Idempotent for identical content (dedupe); throws
   * when a different node claims an existing id (no silent rewrite).
   */
  add_node(node) {
    if (!verify_node_hash(node, this.node_policy)) {
      throw new Error(`addNode: content hash does not verify for ${node.id}`);
    }
    const existing = this.nodes.get(node.id);
    if (existing) {
      if (existing.content_hash !== node.content_hash) {
        throw new Error(`addNode: refusing to overwrite immutable node ${node.id}`);
      }
      return existing;
    }
    const frozen = deep_freeze(node);
    this.track_node(frozen.id);
    this.nodes.set(frozen.id, frozen);
    this._revision++;
    return frozen;
  }
  /** Commit a new mutable-envelope version without changing durable identity. */
  apply_node_version(node) {
    if (!verify_node_hash(node, this.node_policy)) {
      throw new Error(`applyNodeVersion: content hash does not verify for ${node.id}`);
    }
    const existing = this.nodes.get(node.id);
    if (existing && existing.content_hash !== node.content_hash) {
      throw new Error(`applyNodeVersion: refusing identity change for ${node.id}`);
    }
    const frozen = deep_freeze(node);
    this.track_node(frozen.id);
    this.nodes.set(frozen.id, frozen);
    this._revision++;
    return frozen;
  }
  add_edge(edge) {
    const existing = this.edges.get(edge.id);
    if (existing) {
      if (existing.from !== edge.from || existing.to !== edge.to || existing.type !== edge.type) {
        throw new Error(`addEdge: refusing to overwrite immutable edge ${edge.id}`);
      }
      return existing;
    }
    const frozen = deep_freeze(edge);
    this.track_edge(frozen.id);
    this.edges.set(frozen.id, frozen);
    this._revision++;
    return frozen;
  }
  get_node(id) {
    return this.nodes.get(id);
  }
  has_node(id) {
    return this.nodes.has(id);
  }
  get_edge(id) {
    return this.edges.get(id);
  }
  node_count() {
    return this.nodes.size;
  }
  edge_count() {
    return this.edges.size;
  }
  get revision() {
    return this._revision;
  }
  node_list() {
    return [...this.nodes.values()];
  }
  edge_list() {
    return [...this.edges.values()];
  }
  snapshot() {
    return { nodes: new Map(this.nodes), edges: new Map(this.edges) };
  }
  checkpoint() {
    const checkpoint = { nodes: /* @__PURE__ */ new Map(), edges: /* @__PURE__ */ new Map(), revision: this._revision };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("DurableGraph: unknown checkpoint");
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("DurableGraph: unknown checkpoint");
    for (const [id, node] of checkpoint.nodes) {
      if (node === void 0) this.nodes.delete(id);
      else this.nodes.set(id, node);
    }
    for (const [id, edge] of checkpoint.edges) {
      if (edge === void 0) this.edges.delete(id);
      else this.edges.set(id, edge);
    }
    this._revision++;
  }
  restore(snapshot) {
    this.nodes.clear();
    this.edges.clear();
    for (const [id, node] of snapshot.nodes) this.nodes.set(id, node);
    for (const [id, edge] of snapshot.edges) this.edges.set(id, edge);
    this._revision++;
  }
  track_node(id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.nodes.has(id)) checkpoint.nodes.set(id, this.nodes.get(id));
    }
  }
  track_edge(id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.edges.has(id)) checkpoint.edges.set(id, this.edges.get(id));
    }
  }
  /** Deterministic, sorted list of node content hashes. */
  node_hashes() {
    return [...this.nodes.values()].map((n) => n.content_hash).sort();
  }
  /** Single Merkle integrity root over all durable node hashes. */
  merkle_root() {
    return hash_merkle_children(this.node_hashes());
  }
  /** Verify every node still matches its content hash. */
  verify_integrity() {
    for (const node of this.nodes.values()) {
      if (!verify_node_hash(node, this.node_policy)) return false;
    }
    return true;
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/edge_context.ts
var EdgeContext = class {
  nodes = /* @__PURE__ */ new Map();
  dirty_node_ids = /* @__PURE__ */ new Set();
  contradictions = /* @__PURE__ */ new Map();
  resolver = /* @__PURE__ */ new Map();
  containment = /* @__PURE__ */ new Map();
  references = /* @__PURE__ */ new Map();
  derivations = /* @__PURE__ */ new Map();
  supports = /* @__PURE__ */ new Map();
  pressure = /* @__PURE__ */ new Map();
  history = /* @__PURE__ */ new Map();
  semantic_shifts = [];
  audit = [];
  now;
  constructor(options = {}) {
    this.now = options.now ?? Date.now();
    for (const node of options.nodes ?? []) this.nodes.set(node.id, deep_freeze(node));
  }
  add_node(node) {
    this.nodes.set(node.id, deep_freeze(node));
    this.dirty_node_ids.add(node.id);
    return node;
  }
  get_node(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`EdgeContext: node not found: ${id}`);
    return node;
  }
  has_node(id) {
    return this.nodes.has(id);
  }
  node_list() {
    return [...this.nodes.values()];
  }
  changed_node_list() {
    return [...this.dirty_node_ids].map((id) => this.get_node(id));
  }
  put_node(node) {
    const frozen = deep_freeze(node);
    this.nodes.set(frozen.id, frozen);
    this.dirty_node_ids.add(frozen.id);
    return frozen;
  }
  update_node_state(id, patch) {
    const node = this.get_node(id);
    return this.put_node({ ...node, state: { ...node.state, ...patch } });
  }
  update_node_temporal(id, patch) {
    const node = this.get_node(id);
    return this.put_node({ ...node, temporal: { ...node.temporal, ...patch } });
  }
  update_node_grounding(id, patch) {
    const node = this.get_node(id);
    return this.put_node({ ...node, grounding: { ...node.grounding, ...patch } });
  }
  append_provenance_source(id, entry) {
    const node = this.get_node(id);
    const provenance = {
      ...node.provenance,
      source_trace: [...node.provenance.source_trace, entry]
    };
    return this.put_node({ ...node, provenance });
  }
  // ---- contradictions --------------------------------------------------
  add_contradiction(node_a, node_b, pressure) {
    const id = `contradiction:${node_a}|${node_b}`;
    const contradiction = {
      id,
      node_a,
      node_b,
      severity: pressure,
      created_at: this.now,
      resolved: false,
      pressure
    };
    this.contradictions.set(id, contradiction);
    return contradiction;
  }
  get_contradiction(id) {
    return this.contradictions.get(id);
  }
  unresolved_contradictions() {
    return [...this.contradictions.values()].filter((c) => !c.resolved);
  }
  bump_pressure(id, delta) {
    const next = (this.pressure.get(id) ?? 0) + delta;
    this.pressure.set(id, next);
    return next;
  }
  pressure_of(id) {
    return this.pressure.get(id) ?? 0;
  }
  // ---- entity resolution ----------------------------------------------
  set_alias(alias_id, canonical_id) {
    this.resolver.set(alias_id, canonical_id);
  }
  resolve_entity(id) {
    let current = id;
    const seen = /* @__PURE__ */ new Set();
    while (this.resolver.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.resolver.get(current);
    }
    return current;
  }
  // ---- containment / worlds -------------------------------------------
  add_containment(parent_id, child_id) {
    let set = this.containment.get(parent_id);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.containment.set(parent_id, set);
    }
    set.add(child_id);
  }
  children_of(parent_id) {
    return [...this.containment.get(parent_id) ?? /* @__PURE__ */ new Set()];
  }
  /** Merkle root over the content hashes of a parent's contained children. */
  world_merkle_root(parent_id) {
    const hashes = this.children_of(parent_id).map((id) => this.get_node(id).content_hash).sort();
    return hash_merkle_children(hashes);
  }
  // ---- references / derivations / support / drift ---------------------
  add_reference(from_id, to_id) {
    this.add_to_set_map(this.references, from_id, to_id);
  }
  add_derivation(derived_id, source_id) {
    this.add_to_set_map(this.derivations, derived_id, source_id);
  }
  sources_of(derived_id) {
    return [...this.derivations.get(derived_id) ?? /* @__PURE__ */ new Set()];
  }
  add_support(target_id, source_id) {
    const list = this.supports.get(target_id) ?? [];
    list.push(source_id);
    this.supports.set(target_id, list);
  }
  supports_of(target_id) {
    return [...this.supports.get(target_id) ?? []];
  }
  link_history(old_id, new_id) {
    this.history.set(old_id, new_id);
  }
  successor_of(old_id) {
    return this.history.get(old_id);
  }
  record_semantic_shift(from_id, to_id, note) {
    this.semantic_shifts.push({ from: from_id, to: to_id, at: this.now, note });
  }
  shifts() {
    return [...this.semantic_shifts];
  }
  add_to_set_map(map, key, value) {
    let set = map.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      map.set(key, set);
    }
    set.add(value);
  }
  // ---- audit -----------------------------------------------------------
  write_audit(edge, affected_node_ids, summary) {
    const entry = {
      edge_id: edge.id,
      edge_type: edge.type,
      at: this.now,
      affected_node_ids,
      summary
    };
    this.audit.push(entry);
    return entry;
  }
  audit_log() {
    return [...this.audit];
  }
  // ---- transaction control --------------------------------------------
  snapshot() {
    return {
      nodes: new Map(this.nodes),
      dirty_node_ids: new Set(this.dirty_node_ids),
      contradictions: new Map(this.contradictions),
      resolver: new Map(this.resolver),
      containment: clone_set_map(this.containment),
      references: clone_set_map(this.references),
      derivations: clone_set_map(this.derivations),
      supports: clone_array_map(this.supports),
      pressure: new Map(this.pressure),
      history: new Map(this.history),
      semantic_shifts: [...this.semantic_shifts],
      audit: [...this.audit]
    };
  }
  restore(snap) {
    this.nodes = new Map(snap.nodes);
    this.dirty_node_ids = new Set(snap.dirty_node_ids);
    this.contradictions = new Map(snap.contradictions);
    this.resolver = new Map(snap.resolver);
    this.containment = clone_set_map(snap.containment);
    this.references = clone_set_map(snap.references);
    this.derivations = clone_set_map(snap.derivations);
    this.supports = clone_array_map(snap.supports);
    this.pressure = new Map(snap.pressure);
    this.history = new Map(snap.history);
    this.semantic_shifts = [...snap.semantic_shifts];
    this.audit = [...snap.audit];
  }
};
function clone_set_map(map) {
  const out = /* @__PURE__ */ new Map();
  for (const [k, v] of map) out.set(k, new Set(v));
  return out;
}
function clone_array_map(map) {
  const out = /* @__PURE__ */ new Map();
  for (const [k, v] of map) out.set(k, [...v]);
  return out;
}

// LongMemory-main/LongMemory-main/src/core/edges/handlers/contains.ts
var contains_handler = {
  type: "contains",
  run(edge, ctx) {
    const parent_id = edge.from;
    const child = ctx.get_node(edge.to);
    ctx.add_containment(parent_id, child.id);
    const root = ctx.world_merkle_root(parent_id);
    return {
      affected_node_ids: [child.id],
      notes: [`parent ${parent_id} now contains ${child.id}; world root ${root}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/math/utility.ts
function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}
function memory_utility(signals) {
  return clamp01(
    0.4 * signals.recall_frequency + 0.3 * signals.task_relevance + 0.3 * signals.grounding
  );
}

// LongMemory-main/LongMemory-main/src/core/edges/handlers/contradicts.ts
var contradicts_handler = {
  type: "contradicts",
  run(edge, ctx) {
    const a = ctx.get_node(edge.from);
    const b = ctx.get_node(edge.to);
    const pressure = clamp01(edge.confidence * edge.weight) || 0.5;
    const contradiction = ctx.add_contradiction(a.id, b.id, pressure);
    ctx.bump_pressure(a.id, pressure);
    ctx.bump_pressure(b.id, pressure);
    ctx.update_node_state(a.id, { status: "contradicted" });
    ctx.update_node_state(b.id, { status: "contradicted" });
    return {
      affected_node_ids: [a.id, b.id],
      notes: [`unresolved contradiction ${contradiction.id} (pressure ${pressure})`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/derived_from.ts
var derived_from_handler = {
  type: "derived_from",
  run(edge, ctx) {
    const derived = ctx.get_node(edge.from);
    const source = ctx.get_node(edge.to);
    ctx.add_derivation(derived.id, source.id);
    ctx.append_provenance_source(derived.id, {
      source_id: source.id,
      ref: "derived_from",
      at: ctx.now
    });
    return {
      affected_node_ids: [derived.id],
      notes: [`derived ${derived.id} from ${source.id}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/grounds.ts
var grounds_handler = {
  type: "grounds",
  run(edge, ctx) {
    const endo = ctx.get_node(edge.from);
    const world = ctx.get_node(edge.to);
    const evidence = clamp01(edge.confidence * edge.weight);
    const prior = endo.grounding.grounding_score;
    const updated = clamp01(prior + (1 - prior) * evidence);
    const sourceids = endo.grounding.source_ids.includes(world.id) ? endo.grounding.source_ids : [...endo.grounding.source_ids, world.id];
    ctx.update_node_grounding(endo.id, {
      worlddb_ref: endo.grounding.worlddb_ref ?? world.id,
      grounding_score: updated,
      source_ids: sourceids
    });
    return {
      affected_node_ids: [endo.id],
      notes: [`grounding ${prior.toFixed(3)} -> ${updated.toFixed(3)} via ${world.id}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/same_as.ts
var same_as_handler = {
  type: "same_as",
  run(edge, ctx) {
    const alias = ctx.get_node(edge.from);
    const canonical = ctx.get_node(edge.to);
    ctx.set_alias(alias.id, canonical.id);
    return {
      affected_node_ids: [alias.id],
      notes: [`alias ${alias.id} -> canonical ${ctx.resolve_entity(alias.id)}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/semantic_shift.ts
var semantic_shift_handler = {
  type: "semantic_shift",
  run(edge, ctx) {
    const from = ctx.get_node(edge.from);
    const to = ctx.get_node(edge.to);
    const note = typeof edge.handler.params.note === "string" ? edge.handler.params.note : "meaning drift";
    ctx.record_semantic_shift(from.id, to.id, note);
    return {
      affected_node_ids: [from.id, to.id],
      notes: [`semantic shift ${from.id} -> ${to.id}: ${note}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/supersedes.ts
var salience_transfer = 0.3;
var supersedes_handler = {
  type: "supersedes",
  run(edge, ctx) {
    const old_node = ctx.get_node(edge.to);
    const new_node = ctx.get_node(edge.from);
    const now = ctx.now;
    if (old_node.temporal.valid_to === null || old_node.temporal.valid_to > now) {
      ctx.update_node_temporal(old_node.id, { valid_to: now });
    }
    ctx.update_node_temporal(old_node.id, { superseded_at: now });
    ctx.update_node_state(old_node.id, { status: "superseded" });
    const transferred = old_node.state.salience * salience_transfer;
    ctx.update_node_state(old_node.id, {
      salience: clamp01(old_node.state.salience - transferred)
    });
    ctx.update_node_state(new_node.id, {
      status: "active",
      salience: clamp01(new_node.state.salience + transferred)
    });
    ctx.link_history(old_node.id, new_node.id);
    return {
      affected_node_ids: [old_node.id, new_node.id],
      notes: [`superseded ${old_node.id} with ${new_node.id} at ${now}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/handlers/supports.ts
var supports_handler = {
  type: "supports",
  run(edge, ctx) {
    const source = ctx.get_node(edge.from);
    const target = ctx.get_node(edge.to);
    const evidence = clamp01(edge.confidence * edge.weight);
    const prior = target.state.confidence;
    const updated = clamp01(prior + (1 - prior) * evidence);
    ctx.update_node_state(target.id, { confidence: updated });
    ctx.add_support(target.id, source.id);
    return {
      affected_node_ids: [target.id],
      notes: [`confidence ${prior.toFixed(3)} -> ${updated.toFixed(3)} from ${source.id}`]
    };
  }
};

// LongMemory-main/LongMemory-main/src/core/edges/edge_registry.ts
var refers_to_handler = {
  type: "refers_to",
  run(edge, ctx) {
    const from = ctx.get_node(edge.from);
    const to = ctx.get_node(edge.to);
    ctx.add_reference(from.id, to.id);
    return { affected_node_ids: [], notes: [`${from.id} refers_to ${to.id}`] };
  }
};
var EdgeRegistry = class {
  handlers = /* @__PURE__ */ new Map();
  register(handler) {
    this.handlers.set(handler.type, handler);
    return this;
  }
  get(type) {
    return this.handlers.get(type);
  }
  has(type) {
    return this.handlers.has(type);
  }
  types() {
    return [...this.handlers.keys()];
  }
};
function default_edge_registry() {
  return new EdgeRegistry().register(contains_handler).register(refers_to_handler).register(same_as_handler).register(supports_handler).register(contradicts_handler).register(supersedes_handler).register(derived_from_handler).register(grounds_handler).register(semantic_shift_handler);
}

// LongMemory-main/LongMemory-main/src/core/edges/edge_runtime.ts
function validate_edge(edge) {
  if (!edge.id) throw new Error("insertEdge: edge is missing an id");
  if (!edge.from || !edge.to) throw new Error(`insertEdge: edge ${edge.id} needs both from and to`);
  if (!edge.type) throw new Error(`insertEdge: edge ${edge.id} is missing a type`);
  if (edge.confidence < 0 || edge.confidence > 1) {
    throw new Error(`insertEdge: edge ${edge.id} confidence out of range: ${edge.confidence}`);
  }
  if (edge.weight < 0) {
    throw new Error(`insertEdge: edge ${edge.id} weight must be >= 0: ${edge.weight}`);
  }
}
function insert_edge(edge, ctx, registry = default_edge_registry()) {
  validate_edge(edge);
  const handler = registry.get(edge.type);
  if (!handler) {
    throw new Error(
      `insertEdge: unknown edge type "${edge.type}". Known types: ${registry.types().sort().join(", ")}`
    );
  }
  const snap = ctx.snapshot();
  try {
    const outcome2 = handler.run(edge, ctx);
    const audit = ctx.write_audit(edge, outcome2.affected_node_ids, outcome2.notes.join("; "));
    return {
      ok: true,
      edge,
      affected_node_ids: outcome2.affected_node_ids,
      audit,
      notes: outcome2.notes
    };
  } catch (err) {
    ctx.restore(snap);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

// LongMemory-main/LongMemory-main/src/core/grounding/grounding_score.ts
var day_ms = 864e5;
var default_grounding_weights = {
  source: 0.3,
  freshness: 0.25,
  observation: 0.15,
  agreement: 0.3,
  conflict: 0.5
};
function clamp012(x) {
  return Math.min(1, Math.max(0, x));
}
function normalize_observation_count(count) {
  const c = Math.max(0, count);
  return c / (c + 3);
}
function freshness_score(observed_at, valid_to, now, halflife_days = 30) {
  const age_days = Math.max(0, (now - observed_at) / day_ms);
  let fresh = Math.exp(-age_days / halflife_days);
  if (valid_to !== null && now >= valid_to) fresh *= 0.2;
  return clamp012(fresh);
}
function compute_grounding_score(memory_id, fact_ref, signals, weights = default_grounding_weights, at = Date.now()) {
  const obs = normalize_observation_count(signals.observation_count);
  const parts = {
    source: weights.source * signals.source_reliability,
    freshness: weights.freshness * signals.freshness,
    observation: weights.observation * obs,
    agreement: weights.agreement * signals.external_agreement,
    conflict: weights.conflict * signals.conflict
  };
  const linear = parts.source + parts.freshness + parts.observation + parts.agreement - parts.conflict;
  const grounding_score = clamp012(sigmoid(linear));
  const explanation = [
    `source_reliability ${signals.source_reliability.toFixed(2)} * w ${weights.source} = ${parts.source.toFixed(3)}`,
    `freshness ${signals.freshness.toFixed(2)} * w ${weights.freshness} = ${parts.freshness.toFixed(3)}`,
    `observation ${obs.toFixed(2)} (count ${signals.observation_count}) * w ${weights.observation} = ${parts.observation.toFixed(3)}`,
    `external_agreement ${signals.external_agreement.toFixed(2)} * w ${weights.agreement} = ${parts.agreement.toFixed(3)}`,
    `conflict ${signals.conflict.toFixed(2)} * w ${weights.conflict} = -${parts.conflict.toFixed(3)}`,
    `linear ${linear.toFixed(3)} -> sigmoid -> grounding_score ${grounding_score.toFixed(3)}`
  ];
  return { memory_id, fact_ref, signals, weights, linear, grounding_score, explanation, at };
}

// LongMemory-main/LongMemory-main/src/core/grounding/worlddb_adapter.ts
var token_re = /[a-z0-9]+/g;
function tokens(text) {
  return new Set((text || "").toLowerCase().match(token_re) ?? []);
}
var InMemoryWorldDB = class {
  constructor(now_fn = () => Date.now()) {
    this.now_fn = now_fn;
  }
  now_fn;
  facts = /* @__PURE__ */ new Map();
  subscribers = [];
  checkpoints = /* @__PURE__ */ new Set();
  get(ref) {
    return this.facts.get(ref) ?? null;
  }
  search(query) {
    const q = tokens(query);
    const scored = [];
    for (const fact of this.facts.values()) {
      const ft = tokens(fact.statement);
      let overlap = 0;
      for (const t of q) if (ft.has(t)) overlap++;
      if (overlap > 0) scored.push({ fact, score: overlap });
    }
    scored.sort((a, b) => b.score - a.score || (a.fact.ref < b.fact.ref ? -1 : 1));
    return scored.map((s) => s.fact);
  }
  validate(ref) {
    return this.facts.has(ref);
  }
  snapshot() {
    return structuredClone(this.facts);
  }
  checkpoint() {
    const checkpoint = { facts: /* @__PURE__ */ new Map() };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("InMemoryWorldDB: unknown checkpoint");
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("InMemoryWorldDB: unknown checkpoint");
    for (const [ref, fact] of checkpoint.facts) {
      if (fact === void 0) this.facts.delete(ref);
      else this.facts.set(ref, fact);
    }
  }
  restore(snapshot) {
    this.facts = structuredClone(snapshot);
  }
  subscribe(handler) {
    this.subscribers.push(handler);
    return () => {
      this.subscribers = this.subscribers.filter((h) => h !== handler);
    };
  }
  upsert(fact) {
    this.track_fact(fact.ref);
    const kind = this.facts.has(fact.ref) ? "updated" : "added";
    this.facts.set(fact.ref, fact);
    this.emit({ ref: fact.ref, kind, fact, at: this.now_fn() });
    return fact;
  }
  expire(ref, at) {
    const fact = this.facts.get(ref);
    if (!fact) return;
    this.track_fact(ref);
    const updated = { ...fact, valid_to: at };
    this.facts.set(ref, updated);
    this.emit({ ref, kind: "expired", fact: updated, at });
  }
  remove(ref, at) {
    this.track_fact(ref);
    if (this.facts.delete(ref)) {
      this.emit({ ref, kind: "removed", fact: null, at });
    }
  }
  emit(event) {
    for (const handler of [...this.subscribers]) handler(event);
  }
  track_fact(ref) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.facts.has(ref)) checkpoint.facts.set(ref, this.facts.get(ref));
    }
  }
};

// LongMemory-main/LongMemory-main/src/core/grounding/exocortex.ts
function create_exocortex_fact(input) {
  const observed_at = input.observed_at ?? Date.now();
  const ref = input.ref ?? `fact:${sha256_hex(`${input.statement}|${input.source.id}|${observed_at}`).slice(0, 16)}`;
  return {
    ref,
    statement: input.statement,
    vector: input.vector ?? null,
    source: input.source,
    observed_at,
    valid_from: input.valid_from ?? observed_at,
    valid_to: input.valid_to ?? null,
    observation_count: input.observation_count ?? 1,
    metadata: input.metadata ?? {}
  };
}

// LongMemory-main/LongMemory-main/src/core/types/entity.ts
function entity_context(entity) {
  const ctx = entity.metadata["context"];
  return Array.isArray(ctx) ? ctx : [];
}

// LongMemory-main/LongMemory-main/src/core/resolver/entity_score.ts
var day_ms2 = 864e5;
var default_score_weights = {
  name: 0.4,
  vector: 0.3,
  context: 0.2,
  temporal: 0.1,
  conflict: 0.5
};
var default_thresholds = {
  merge: 0.82,
  candidate: 0.55
};
function clamp013(x) {
  return Math.min(1, Math.max(0, x));
}
function normalize_name(s) {
  return s.normalize("NFC").toLocaleLowerCase().replace(/[^\p{Letter}\p{Mark}\p{Number}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function bigrams(s) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}
function dice_coefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total_a = 0;
  for (const v of ga.values()) total_a += v;
  let total_b = 0;
  for (const [g, v] of gb) {
    total_b += v;
    const av = ga.get(g);
    if (av) overlap += Math.min(av, v);
  }
  return 2 * overlap / (total_a + total_b);
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function name_similarity(a, b) {
  const na = normalize_name(a);
  const nb = normalize_name(b);
  if (na === nb) return 1;
  const dice = dice_coefficient(na.replace(/ /g, ""), nb.replace(/ /g, ""));
  const token_jac = jaccard(new Set(na.split(" ")), new Set(nb.split(" ")));
  return clamp013(0.5 * dice + 0.5 * token_jac);
}
function vector_similarity(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot3 = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot3 += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot3 / (Math.sqrt(na) * Math.sqrt(nb));
  return clamp013(cos);
}
function context_overlap(a, b) {
  const sa = new Set((a ?? []).map((t) => t.toLowerCase()));
  const sb = new Set((b ?? []).map((t) => t.toLowerCase()));
  return jaccard(sa, sb);
}
function temporal_compatibility(a, b) {
  if (a === void 0 || b === void 0) return 0.5;
  const days = Math.abs(a - b) / day_ms2;
  return clamp013(Math.exp(-days / 90));
}
function meta_value(meta, key) {
  const v = meta?.[key];
  return typeof v === "string" ? v : void 0;
}
function conflict_penalty(mention, entity) {
  if (mention.type && entity.type !== "unknown" && mention.type !== entity.type) return 1;
  for (const key of ["domain", "disambiguator"]) {
    const m = meta_value(mention.metadata, key);
    const e = meta_value(entity.metadata, key);
    if (m && e && m !== e) return 1;
  }
  if (mention.context && mention.context.length > 0) {
    const overlap = context_overlap(mention.context, entity_context(entity));
    if (overlap === 0) return 0.3;
  }
  return 0;
}
function score_entity_match(mention, entity, weights = default_score_weights) {
  const name = name_similarity(mention.name, entity.canonical_name);
  const vector = vector_similarity(mention.vector ?? null, entity.vector);
  const context = context_overlap(mention.context, entity_context(entity));
  const temporal = temporal_compatibility(mention.observed_at, entity.updated_at);
  const conflict = conflict_penalty(mention, entity);
  const score = weights.name * name + weights.vector * vector + weights.context * context + weights.temporal * temporal - weights.conflict * conflict;
  return { score, name, vector, context, temporal, conflict };
}

// LongMemory-main/LongMemory-main/src/core/i18n/multilingual_entity_resolver.ts
var metadata_context = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
function resolve_multilingual_entity(resolver, input) {
  const direct = resolver.canonical_id_for(input.name);
  if (direct) return resolver.resolve(input);
  const language = detect_language(input.name).language;
  const transliteration = transliterate(input.name, language);
  if (transliteration && transliteration.confidence >= 0.7) {
    const alias_id = resolver.canonical_id_for(transliteration.text);
    const entity = alias_id ? resolver.get_entity(alias_id) : void 0;
    if (entity) {
      const explicit_alias = entity.aliases.some((alias) => normalize_name(alias) === normalize_name(transliteration.text));
      const overlap = context_overlap(input.context, metadata_context(entity.metadata.context));
      const opted_in = input.metadata?.allow_transliteration_match === true;
      if (explicit_alias || overlap >= 0.25 || opted_in) {
        const resolved = resolver.resolve({
          ...input,
          name: transliteration.text,
          aliases: [.../* @__PURE__ */ new Set([...input.aliases ?? [], input.name])],
          metadata: { ...input.metadata, original_name: input.name, original_language: language, transliteration_confidence: transliteration.confidence }
        });
        if (resolved.action === "resolved") resolver.add_alias(resolved.entity.id, input.name);
        return resolved;
      }
    }
  }
  return resolver.resolve({
    ...input,
    metadata: {
      ...input.metadata,
      language,
      transliteration: transliteration?.text ?? null,
      transliteration_confidence: transliteration?.confidence ?? 0
    }
  });
}

// LongMemory-main/LongMemory-main/src/core/math/count_min.ts
var default_width = 1024;
var default_depth = 4;
var max_counter = 4294967295;
function seed_for(row) {
  return (2654435769 ^ Math.imul(row + 1, 2246822507)) >>> 0;
}
function hash(value, seed) {
  let out = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619) >>> 0;
  }
  out ^= out >>> 16;
  out = Math.imul(out, 2146121005) >>> 0;
  out ^= out >>> 15;
  return out >>> 0;
}
function positive_int(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
var CountMinSketch = class _CountMinSketch {
  width;
  depth;
  seeds;
  tables;
  _total = 0;
  constructor(width_or_options = {}, depth = default_depth) {
    const options = typeof width_or_options === "number" ? { width: width_or_options, depth } : width_or_options;
    this.width = positive_int(options.width ?? default_width, "width");
    this.depth = positive_int(options.depth ?? default_depth, "depth");
    const seeds = options.seeds ?? Array.from({ length: this.depth }, (_, row) => seed_for(row));
    if (seeds.length !== this.depth) throw new Error("seeds length must equal depth");
    this.seeds = seeds.map((seed) => seed >>> 0);
    this.tables = Array.from({ length: this.depth }, () => new Uint32Array(this.width));
  }
  get total() {
    return this._total;
  }
  get cells() {
    return this.width * this.depth;
  }
  add(key, count = 1) {
    if (!Number.isFinite(count) || count < 0) throw new Error("count must be finite and non-negative");
    const amount = Math.floor(count);
    if (amount === 0) return this;
    for (let row = 0; row < this.depth; row++) {
      const column = hash(key, this.seeds[row]) % this.width;
      this.tables[row][column] = Math.min(max_counter, this.tables[row][column] + amount);
    }
    this._total += amount;
    return this;
  }
  estimate(key) {
    let estimate = max_counter;
    for (let row = 0; row < this.depth; row++) {
      const column = hash(key, this.seeds[row]) % this.width;
      estimate = Math.min(estimate, this.tables[row][column]);
    }
    return estimate;
  }
  merge(other) {
    if (other.width !== this.width || other.depth !== this.depth) {
      throw new Error("cannot merge Count-Min sketches with different dimensions");
    }
    if (other.seeds.some((seed, row) => seed !== this.seeds[row])) {
      throw new Error("cannot merge Count-Min sketches with different seeds");
    }
    const data = other.snapshot();
    for (let row = 0; row < this.depth; row++) {
      for (let column = 0; column < this.width; column++) {
        this.tables[row][column] = Math.min(
          max_counter,
          this.tables[row][column] + data.tables[row][column]
        );
      }
    }
    this._total += other.total;
    return this;
  }
  snapshot() {
    return {
      kind: "count-min",
      version: 1,
      width: this.width,
      depth: this.depth,
      seeds: [...this.seeds],
      tables: this.tables.map((row) => Array.from(row)),
      total: this._total
    };
  }
  serialize() {
    return JSON.stringify(this.snapshot());
  }
  static deserialize(value) {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (data.kind !== "count-min" || data.version !== 1) throw new Error("unsupported Count-Min serialization");
    if (data.tables.length !== data.depth || data.tables.some((row) => row.length !== data.width)) {
      throw new Error("invalid Count-Min table dimensions");
    }
    const sketch = new _CountMinSketch({ width: data.width, depth: data.depth, seeds: data.seeds });
    for (let row = 0; row < data.depth; row++) sketch.tables[row].set(data.tables[row]);
    sketch._total = data.total;
    return sketch;
  }
};

// LongMemory-main/LongMemory-main/src/core/math/frequent_directions.ts
function positive_int2(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function dot(left, right) {
  let out = 0;
  for (let i = 0; i < left.length; i++) out += left[i] * right[i];
  return out;
}
function norm(vector) {
  return Math.sqrt(dot(vector, vector));
}
function eigen_symmetric(input) {
  const size = input.length;
  const matrix = input.map((row) => [...row]);
  const vectors = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_2, column) => row === column ? 1 : 0));
  const max_iterations = Math.max(16, size * size * 32);
  for (let iteration = 0; iteration < max_iterations; iteration++) {
    let p = 0;
    let q = 0;
    let largest = 0;
    for (let row = 0; row < size; row++) {
      for (let column = row + 1; column < size; column++) {
        const value = Math.abs(matrix[row][column]);
        if (value > largest) {
          largest = value;
          p = row;
          q = column;
        }
      }
    }
    if (largest < 1e-10) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const cosine3 = Math.cos(angle);
    const sine = Math.sin(angle);
    const pp = matrix[p][p];
    const qq = matrix[q][q];
    const pq = matrix[p][q];
    matrix[p][p] = cosine3 * cosine3 * pp - 2 * sine * cosine3 * pq + sine * sine * qq;
    matrix[q][q] = sine * sine * pp + 2 * sine * cosine3 * pq + cosine3 * cosine3 * qq;
    matrix[p][q] = 0;
    matrix[q][p] = 0;
    for (let index = 0; index < size; index++) {
      if (index !== p && index !== q) {
        const ip = matrix[index][p];
        const iq = matrix[index][q];
        matrix[index][p] = cosine3 * ip - sine * iq;
        matrix[p][index] = matrix[index][p];
        matrix[index][q] = sine * ip + cosine3 * iq;
        matrix[q][index] = matrix[index][q];
      }
      const vp = vectors[index][p];
      const vq = vectors[index][q];
      vectors[index][p] = cosine3 * vp - sine * vq;
      vectors[index][q] = sine * vp + cosine3 * vq;
    }
  }
  return Array.from({ length: size }, (_, index) => ({
    value: Math.max(0, matrix[index][index]),
    vector: vectors.map((row) => row[index])
  })).sort((left, right) => right.value - left.value);
}
var FrequentDirections = class _FrequentDirections {
  dimension;
  max_rows;
  rows = [];
  _updates = 0;
  constructor(dimension, max_rows = 8) {
    this.dimension = positive_int2(dimension, "dimension");
    this.max_rows = positive_int2(max_rows, "maxRows");
  }
  get size() {
    return this.rows.length;
  }
  get updates() {
    return this._updates;
  }
  get matrix() {
    return this.rows.map((row) => [...row]);
  }
  update(vector, weight = 1) {
    if (vector.length !== this.dimension) throw new Error("vector dimension mismatch");
    if (!vector.every(Number.isFinite)) throw new Error("vector must contain finite values");
    if (!Number.isFinite(weight) || weight < 0) throw new Error("weight must be finite and non-negative");
    if (weight === 0) return this;
    const scale = Math.sqrt(weight);
    this.rows.push(vector.map((value) => value * scale));
    this._updates++;
    if (this.rows.length > this.max_rows) this.compress();
    return this;
  }
  merge(other) {
    if (other.dimension !== this.dimension) throw new Error("cannot merge matrix sketches with different dimensions");
    const prior_updates = this._updates;
    for (const row of other.matrix) this.update(row);
    this._updates = prior_updates + other.updates;
    return this;
  }
  /** Dominant compressed concept direction, normalized to unit length. */
  concept_vector() {
    if (this.rows.length === 0) return new Array(this.dimension).fill(0);
    const gram = this.row_gram();
    const principal = eigen_symmetric(gram)[0];
    if (!principal || principal.value <= 1e-12) return new Array(this.dimension).fill(0);
    const out = new Array(this.dimension).fill(0);
    for (let row = 0; row < this.rows.length; row++) {
      for (let column = 0; column < this.dimension; column++) {
        out[column] += this.rows[row][column] * principal.vector[row];
      }
    }
    const length2 = norm(out);
    return length2 === 0 ? out : out.map((value) => value / length2);
  }
  row_gram() {
    return this.rows.map((left) => this.rows.map((right) => dot(left, right)));
  }
  compress() {
    const source = this.rows;
    const pairs = eigen_symmetric(this.row_gram());
    const delta = pairs[Math.min(this.max_rows, pairs.length - 1)]?.value ?? 0;
    const compressed = [];
    for (const pair of pairs.slice(0, this.max_rows)) {
      if (pair.value <= 1e-12) continue;
      const right = new Array(this.dimension).fill(0);
      const sigma = Math.sqrt(pair.value);
      for (let row = 0; row < source.length; row++) {
        for (let column = 0; column < this.dimension; column++) {
          right[column] += source[row][column] * pair.vector[row] / sigma;
        }
      }
      const shrunk = Math.sqrt(Math.max(0, pair.value - delta));
      const output = right.map((value) => value * shrunk);
      if (norm(output) > 1e-10) compressed.push(output);
    }
    this.rows = compressed;
  }
  snapshot() {
    return {
      kind: "frequent-directions",
      version: 1,
      dimension: this.dimension,
      max_rows: this.max_rows,
      updates: this._updates,
      matrix: this.matrix
    };
  }
  serialize() {
    return JSON.stringify(this.snapshot());
  }
  static deserialize(value) {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (data.kind !== "frequent-directions" || data.version !== 1) throw new Error("unsupported matrix sketch serialization");
    if (data.matrix.length > data.max_rows || data.matrix.some((row) => row.length !== data.dimension)) {
      throw new Error("invalid matrix sketch dimensions");
    }
    const sketch = new _FrequentDirections(data.dimension, data.max_rows);
    sketch.rows = data.matrix.map((row) => [...row]);
    sketch._updates = data.updates;
    return sketch;
  }
};

// LongMemory-main/LongMemory-main/src/core/math/oja.ts
function length(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}
function unit(vector) {
  const norm2 = length(vector);
  return norm2 === 0 ? [...vector] : vector.map((value) => value / norm2);
}
var OjaTracker = class _OjaTracker {
  dimension;
  learning_rate;
  normalize;
  concept;
  _observations = 0;
  constructor(dimension, options = {}) {
    if (!Number.isInteger(dimension) || dimension <= 0) throw new Error("dimension must be a positive integer");
    const rate = options.learning_rate ?? 0.05;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error("learningRate must be in (0,1]");
    const initial = options.initial ?? new Array(dimension).fill(1 / Math.sqrt(dimension));
    if (initial.length !== dimension || !initial.every(Number.isFinite)) throw new Error("invalid initial concept vector");
    this.dimension = dimension;
    this.learning_rate = rate;
    this.normalize = options.normalize ?? true;
    this.concept = this.normalize ? unit(initial) : [...initial];
  }
  get vector() {
    return [...this.concept];
  }
  get observations() {
    return this._observations;
  }
  update(input, weight = 1) {
    if (input.length !== this.dimension) throw new Error("vector dimension mismatch");
    if (!input.every(Number.isFinite)) throw new Error("vector must contain finite values");
    if (!Number.isFinite(weight) || weight < 0) throw new Error("weight must be finite and non-negative");
    if (weight === 0) return this;
    let projection = 0;
    for (let i = 0; i < this.dimension; i++) projection += this.concept[i] * input[i];
    const rate = this.learning_rate * weight;
    const next = this.concept.map((value, index) => value + rate * projection * (input[index] - projection * value));
    this.concept = this.normalize ? unit(next) : next;
    this._observations++;
    return this;
  }
  merge(other, other_weight) {
    if (other.dimension !== this.dimension) throw new Error("cannot merge Oja trackers with different dimensions");
    const right = other_weight ?? other.observations;
    const left = this.observations;
    const total = left + right;
    if (total <= 0) return this;
    const mixed = this.concept.map((value, index) => (value * left + other.concept[index] * right) / total);
    this.concept = this.normalize ? unit(mixed) : mixed;
    this._observations += other.observations;
    return this;
  }
  snapshot() {
    return {
      kind: "oja",
      version: 1,
      dimension: this.dimension,
      learning_rate: this.learning_rate,
      normalize: this.normalize,
      observations: this._observations,
      vector: this.vector
    };
  }
  serialize() {
    return JSON.stringify(this.snapshot());
  }
  static deserialize(value) {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (data.kind !== "oja" || data.version !== 1) throw new Error("unsupported Oja serialization");
    const tracker = new _OjaTracker(data.dimension, {
      learning_rate: data.learning_rate,
      initial: data.vector,
      normalize: data.normalize
    });
    tracker.concept = [...data.vector];
    tracker._observations = data.observations;
    return tracker;
  }
};

// LongMemory-main/LongMemory-main/src/core/math/sketches.ts
var frequency_domains = [
  "entities",
  "tags",
  "relations",
  "worlds",
  "patterns"
];
var defaults = {
  width: 1024,
  depth: 4,
  vector_dimension: 8,
  world_rows: 8,
  oja_learning_rate: 0.05
};
var MemorySketches = class _MemorySketches {
  options;
  frequencies;
  worlds = /* @__PURE__ */ new Map();
  drift = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.frequencies = Object.fromEntries(
      frequency_domains.map((domain) => [domain, new CountMinSketch(this.options.width, this.options.depth)])
    );
  }
  add(domain, key, count = 1) {
    this.frequencies[domain].add(key, count);
    return this;
  }
  apply_operation(operation) {
    if (operation.type === "frequency") return this.add(operation.domain, operation.key);
    if (operation.type === "world") return this.update_world(operation.id, operation.vector);
    return this.update_drift(operation.id, operation.vector);
  }
  estimate(domain, key) {
    return this.frequencies[domain].estimate(key);
  }
  relevance(domain, keys) {
    if (keys.length === 0) return 0;
    const sketch = this.frequencies[domain];
    const estimate = Math.max(...keys.map((key) => sketch.estimate(key)));
    if (estimate <= 0 || sketch.total <= 0) return 0;
    return Math.min(1, Math.log1p(estimate) / Math.log1p(sketch.total));
  }
  update_world(world_id, vector, weight = 1) {
    const sketch = this.worlds.get(world_id) ?? new FrequentDirections(
      this.options.vector_dimension,
      this.options.world_rows
    );
    sketch.update(vector, weight);
    this.worlds.set(world_id, sketch);
    this.add("worlds", world_id, weight);
    return this;
  }
  world_sketch(world_id) {
    return this.worlds.get(world_id);
  }
  update_drift(concept_id, vector, weight = 1) {
    const tracker = this.drift.get(concept_id) ?? new OjaTracker(this.options.vector_dimension, {
      learning_rate: this.options.oja_learning_rate
    });
    tracker.update(vector, weight);
    this.drift.set(concept_id, tracker);
    return this;
  }
  drift_tracker(concept_id) {
    return this.drift.get(concept_id);
  }
  rank_candidates(candidates, domain = "patterns", weight = 0.15) {
    return candidates.map((candidate) => {
      const sketch_score = this.relevance(domain, candidate.keys);
      return { ...candidate, sketch_score, score: candidate.base_score + weight * sketch_score };
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  }
  prune_candidates(candidates, limit, domain = "patterns", weight = 0.15) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error("limit must be a non-negative integer");
    return this.rank_candidates(candidates, domain, weight).slice(0, limit);
  }
  merge(other) {
    if (other.options.vector_dimension !== this.options.vector_dimension) {
      throw new Error("cannot merge sketch layers with different vector dimensions");
    }
    for (const domain of frequency_domains) this.frequencies[domain].merge(other.frequencies[domain]);
    for (const [world_id, source] of other.worlds) {
      const target = this.worlds.get(world_id) ?? new FrequentDirections(this.options.vector_dimension, this.options.world_rows);
      target.merge(source);
      this.worlds.set(world_id, target);
    }
    for (const [concept_id, source] of other.drift) {
      const target = this.drift.get(concept_id) ?? OjaTracker.deserialize(source.serialize());
      if (this.drift.has(concept_id)) target.merge(source);
      this.drift.set(concept_id, target);
    }
    return this;
  }
  snapshot() {
    return {
      kind: "memory-sketches",
      version: 1,
      options: { ...this.options },
      frequencies: Object.fromEntries(
        frequency_domains.map((domain) => [domain, this.frequencies[domain].snapshot()])
      ),
      worlds: Object.fromEntries([...this.worlds].map(([id, sketch]) => [id, sketch.snapshot()])),
      drift: Object.fromEntries([...this.drift].map(([id, tracker]) => [id, tracker.snapshot()]))
    };
  }
  serialize() {
    return JSON.stringify(this.snapshot());
  }
  restore(value) {
    const restored = _MemorySketches.deserialize(value);
    if (restored.options.vector_dimension !== this.options.vector_dimension) {
      throw new Error("cannot restore sketch layer with different vector dimensions");
    }
    this.frequencies = restored.frequencies;
    this.worlds = restored.worlds;
    this.drift = restored.drift;
  }
  static deserialize(value) {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    if (data.kind !== "memory-sketches" || data.version !== 1) throw new Error("unsupported sketch-layer serialization");
    const sketches = new _MemorySketches(data.options);
    sketches.frequencies = Object.fromEntries(
      frequency_domains.map((domain) => [domain, CountMinSketch.deserialize(data.frequencies[domain])])
    );
    sketches.worlds = new Map(Object.entries(data.worlds).map(([id, item]) => [id, FrequentDirections.deserialize(item)]));
    sketches.drift = new Map(Object.entries(data.drift).map(([id, item]) => [id, OjaTracker.deserialize(item)]));
    return sketches;
  }
};

// LongMemory-main/LongMemory-main/src/core/types/contract.ts
function default_contract() {
  return {
    use_for_reasoning: true,
    use_for_personalization: false,
    use_for_prediction: false,
    use_for_emotional_context: false,
    use_for_associative_recall: true,
    requires_grounding: false,
    expires_if_unconfirmed: false,
    privacy_level: "private",
    max_valid_duration: null,
    source_required: false,
    source_permission: null,
    preserve_exact_language: false,
    translation_allowed: true,
    transliteration_allowed: true
  };
}

// LongMemory-main/LongMemory-main/src/core/types/node_state.ts
function default_node_state() {
  return {
    status: "active",
    confidence: 1,
    salience: 0.5,
    activation: 0.5,
    decay_rate: 0.05,
    decay_updated_at: null,
    last_reinforced_at: null,
    reinforcement_count: 0
  };
}

// LongMemory-main/LongMemory-main/src/core/types/provenance.ts
function manual_provenance(created_by, at) {
  return {
    created_by,
    extraction_method: "manual",
    source_trace: [{ source_id: created_by, ref: null, at }]
  };
}

// LongMemory-main/LongMemory-main/src/core/memory/reconsolidation.ts
function create_derived_from_edge(summary_id, original_id, at, provenance) {
  return create_hydro_edge({
    from: summary_id,
    to: original_id,
    type: "derived_from",
    confidence: 1,
    weight: 1,
    temporal: { valid_from: at, valid_to: null, observed_at: at, recorded_at: at },
    handler: { handler: null, params: {} },
    provenance: provenance ?? manual_provenance("reconsolidation", at)
  });
}

// LongMemory-main/LongMemory-main/src/core/memory/pattern_detector.ts
var token_re2 = /[a-z0-9]+/g;
var procedure_re2 = /\b(fail(?:ed|ure)?|error|mistake|retry|fix(?:ed)?|succeed(?:ed)?|worked|resolved|step|workflow)\b/i;
var stop = /* @__PURE__ */ new Set(["i", "we", "the", "a", "an", "my", "our", "again", "today", "yesterday", "once"]);
var outcome = /* @__PURE__ */ new Set(["failed", "failure", "error", "mistake", "retry", "fixed", "succeeded", "worked", "resolved"]);
var tokens2 = (text) => text.toLowerCase().match(token_re2) ?? [];
function pattern_key(node, procedural) {
  const drop = procedural ? /* @__PURE__ */ new Set([...stop, ...outcome]) : stop;
  const kept = tokens2(node.content.canonical).filter((word) => !drop.has(word));
  return kept.join(" ");
}
function lexical_coherence(nodes) {
  if (nodes.length < 2) return 1;
  const sets = nodes.map((node) => new Set(tokens2(node.content.canonical)));
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < sets.length; left++) {
    for (let right = left + 1; right < sets.length; right++) {
      const union = /* @__PURE__ */ new Set([...sets[left], ...sets[right]]);
      let overlap = 0;
      for (const word of sets[left]) if (sets[right].has(word)) overlap++;
      total += union.size === 0 ? 1 : overlap / union.size;
      pairs++;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}
function avg(nodes, value) {
  if (nodes.length === 0) return 0;
  return nodes.reduce((sum, node) => sum + value(node), 0) / nodes.length;
}
function consolidation_signals(nodes, contradictions = []) {
  const ids = new Set(nodes.map((node) => node.id));
  const related = contradictions.filter(
    (item) => !item.resolved && ids.has(item.node_a) && ids.has(item.node_b)
  );
  const repetition = clamp01(nodes.length / 3);
  const salience = avg(nodes, (node) => clamp01(node.state.salience));
  const grounding = avg(nodes, (node) => clamp01(node.grounding.grounding_score));
  const confidence = avg(nodes, (node) => clamp01(node.state.confidence));
  const contradiction = related.length === 0 ? avg(nodes, (node) => node.state.status === "contradicted" ? 0.5 : 0) : related.reduce((sum, item) => sum + clamp01(item.pressure), 0) / related.length;
  const noise = clamp01(1 - lexical_coherence(nodes));
  const utility = memory_utility({
    recall_frequency: repetition,
    task_relevance: salience,
    grounding
  });
  const score = repetition + salience + grounding + utility + confidence - contradiction - noise;
  return { repetition, salience, grounding, utility, confidence, contradiction, noise, score };
}
function best_statement(nodes) {
  return [...nodes].sort((left, right) => right.temporal.observed_at - left.temporal.observed_at)[0]?.content.summary ?? "";
}
function repeated_patterns(nodes, ctx) {
  const min = Math.max(2, ctx.min_repetitions ?? 2);
  const groups = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (node.facets.episodic === null) continue;
    const kind = procedure_re2.test(node.content.canonical) ? "procedural" : "semantic";
    const key = `${kind}:${pattern_key(node, kind === "procedural")}`;
    const group = groups.get(key) ?? { kind, nodes: [] };
    group.nodes.push(node);
    groups.set(key, group);
  }
  const out = [];
  for (const [id, group] of groups) {
    if (group.nodes.length < min) continue;
    out.push({
      id,
      kind: group.kind,
      sources: group.nodes,
      statement: best_statement(group.nodes),
      signals: consolidation_signals(group.nodes, ctx.contradictions),
      fact: null
    });
  }
  return out;
}
function reflection_patterns(nodes, contradictions) {
  const by_id = new Map(nodes.map((node) => [node.id, node]));
  const pending = contradictions.filter((item) => !item.resolved);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const start of pending) {
    if (seen.has(start.id)) continue;
    const member_ids = /* @__PURE__ */ new Set([start.node_a, start.node_b]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of pending) {
        if (!member_ids.has(item.node_a) && !member_ids.has(item.node_b)) continue;
        seen.add(item.id);
        if (!member_ids.has(item.node_a)) {
          member_ids.add(item.node_a);
          changed = true;
        }
        if (!member_ids.has(item.node_b)) {
          member_ids.add(item.node_b);
          changed = true;
        }
      }
    }
    const sources = [...member_ids].map((id) => by_id.get(id)).filter((node) => node !== void 0);
    if (sources.length < 2) continue;
    out.push({
      id: `reflection:${[...member_ids].sort().join(":")}`,
      kind: "reflection",
      sources,
      statement: sources.map((node) => node.content.summary).join(" | "),
      signals: consolidation_signals(sources, pending),
      fact: null
    });
  }
  return out;
}
function corrected_patterns(nodes, corrections) {
  const by_id = new Map(nodes.map((node) => [node.id, node]));
  return corrections.flatMap((item) => {
    const sources = item.source_memory_ids.map((id) => by_id.get(id)).filter((node) => node !== void 0);
    if (sources.length === 0) return [];
    const signals = consolidation_signals(sources);
    signals.repetition = 1;
    signals.grounding = item.fact.source.reliability;
    signals.utility = memory_utility({ recall_frequency: 1, task_relevance: signals.salience, grounding: signals.grounding });
    signals.score = signals.repetition + signals.salience + signals.grounding + signals.utility + signals.confidence - signals.contradiction - signals.noise;
    return [{
      id: `corrected:${item.fact.ref}`,
      kind: "corrected_belief",
      sources,
      statement: item.fact.statement,
      signals,
      fact: item.fact
    }];
  });
}
function detect_consolidation_patterns(nodes, ctx = {}) {
  const contradictions = ctx.contradictions ?? [];
  return [
    ...repeated_patterns(nodes, ctx),
    ...reflection_patterns(nodes, contradictions),
    ...corrected_patterns(nodes, ctx.world_corrections ?? [])
  ];
}

// LongMemory-main/LongMemory-main/src/core/memory/procedure_builder.ts
function newest_source(sources) {
  return [...sources].sort((left, right) => right.temporal.observed_at - left.temporal.observed_at)[0];
}
function build_procedure_memory(pattern, ctx) {
  if (pattern.kind !== "procedural") throw new Error("buildProcedureMemory requires a procedural pattern");
  const newest = newest_source(pattern.sources);
  const statement = `Procedure learned from repeated outcomes: ${pattern.statement}`;
  return create_hydro_node({
    content: { raw: statement, canonical: statement.toLowerCase(), summary: statement },
    facets: { ...empty_facets(), procedural: { value: statement, weight: 1 } },
    world: newest.world,
    temporal: {
      valid_from: ctx.now,
      valid_to: null,
      observed_at: newest.temporal.observed_at,
      recorded_at: ctx.now,
      superseded_at: null
    },
    contract: ctx.contract,
    grounding: { worlddb_ref: null, source_ids: [], grounding_score: 0 },
    state: {
      ...default_node_state(),
      confidence: Math.min(1, pattern.signals.confidence + 0.1),
      salience: Math.min(1, pattern.signals.salience + 0.1)
    },
    vectors: { semantic: ctx.vector, type_vector: null, world_vector: newest.vectors.world_vector },
    provenance: ctx.provenance
  });
}

// LongMemory-main/LongMemory-main/src/core/memory/reflection_builder.ts
function build_reflection_memory(pattern, ctx) {
  if (pattern.kind !== "reflection") throw new Error("buildReflectionMemory requires a reflection pattern");
  const newest = [...pattern.sources].sort(
    (left, right) => right.temporal.observed_at - left.temporal.observed_at
  )[0];
  const claims = pattern.sources.map((node) => `"${node.content.summary}"`).join(" conflicts with ");
  const statement = `Reflection: ${claims}. Preserve both as historical context; do not treat either as settled truth.`;
  return create_hydro_node({
    content: { raw: statement, canonical: statement.toLowerCase(), summary: statement },
    facets: { ...empty_facets(), reflective: { value: statement, weight: 1 } },
    world: newest.world,
    temporal: {
      valid_from: ctx.now,
      valid_to: null,
      observed_at: newest.temporal.observed_at,
      recorded_at: ctx.now,
      superseded_at: null
    },
    contract: { ...ctx.contract, use_for_reasoning: false, use_for_prediction: false },
    grounding: { worlddb_ref: null, source_ids: [], grounding_score: 0 },
    state: {
      ...default_node_state(),
      confidence: Math.min(1, pattern.signals.confidence),
      salience: Math.min(1, pattern.signals.salience + 0.2)
    },
    vectors: { semantic: ctx.vector, type_vector: null, world_vector: newest.vectors.world_vector },
    provenance: ctx.provenance
  });
}

// LongMemory-main/LongMemory-main/src/core/memory/consolidation.ts
var default_threshold = 0.5;
var preference_re2 = /\b(prefer|preference|favorite|favourite|like|love|dislike|hate)\b/i;
var privacy_rank = { public: 0, private: 1, sensitive: 2, secret: 3 };
function most_private(values) {
  return [...values].sort((left, right) => privacy_rank[right] - privacy_rank[left])[0] ?? "private";
}
function derive_contract(pattern, override = {}) {
  const sources = pattern.sources;
  const base = default_contract();
  const inherited = {
    ...base,
    use_for_reasoning: sources.every((node) => node.contract.use_for_reasoning),
    use_for_personalization: sources.every((node) => node.contract.use_for_personalization),
    use_for_prediction: sources.every((node) => node.contract.use_for_prediction),
    use_for_emotional_context: sources.some((node) => node.contract.use_for_emotional_context),
    use_for_associative_recall: sources.every((node) => node.contract.use_for_associative_recall),
    requires_grounding: pattern.kind === "corrected_belief" || sources.some((node) => node.contract.requires_grounding),
    expires_if_unconfirmed: sources.some((node) => node.contract.expires_if_unconfirmed),
    privacy_level: most_private(sources.map((node) => node.contract.privacy_level)),
    max_valid_duration: sources.reduce((limit, node) => {
      const next = node.contract.max_valid_duration;
      if (next === null) return limit;
      return limit === null ? next : Math.min(limit, next);
    }, null),
    source_required: true
  };
  return { ...inherited, ...override };
}
function derived_provenance(pattern, now) {
  const source_trace = pattern.sources.flatMap((node) => [
    ...node.provenance.source_trace,
    { source_id: node.id, ref: node.content_hash, at: node.temporal.recorded_at }
  ]);
  return { created_by: "consolidation", extraction_method: "heuristic", source_trace };
}
function avg_vector(nodes) {
  const vectors = nodes.map((node) => node.vectors.semantic).filter((item) => item !== null);
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const same = vectors.filter((vector) => vector.length === dim);
  const out = new Array(dim).fill(0);
  for (const vector of same) for (let i = 0; i < dim; i++) out[i] += vector[i];
  return out.map((value) => value / same.length);
}
function newest_source2(pattern) {
  return [...pattern.sources].sort(
    (left, right) => right.temporal.observed_at - left.temporal.observed_at
  )[0];
}
function sources_stale(pattern, now) {
  return pattern.sources.every(
    (node) => node.state.status === "superseded" || node.state.status === "expired" || node.temporal.superseded_at !== null || node.temporal.valid_to !== null && now >= node.temporal.valid_to
  );
}
function grounding_for(pattern, ctx) {
  if (pattern.fact) {
    const current2 = pattern.fact.valid_to === null || ctx.now < pattern.fact.valid_to;
    return {
      worlddb_ref: pattern.fact.ref,
      source_ids: [pattern.fact.source.id],
      grounding_score: current2 ? pattern.fact.source.reliability : 0,
      current: current2
    };
  }
  const grounded = [...pattern.sources].sort((left, right) => right.grounding.grounding_score - left.grounding.grounding_score).find((node) => node.grounding.worlddb_ref !== null);
  if (!grounded) return { worlddb_ref: null, source_ids: [], grounding_score: 0, current: false };
  const fact = grounded.grounding.worlddb_ref && ctx.worlddb ? ctx.worlddb.get(grounded.grounding.worlddb_ref) : null;
  const current = fact ? fact.valid_to === null || ctx.now < fact.valid_to : !ctx.worlddb && !sources_stale(pattern, ctx.now);
  return {
    worlddb_ref: grounded.grounding.worlddb_ref,
    source_ids: grounded.grounding.source_ids,
    grounding_score: current ? grounded.grounding.grounding_score : 0,
    current
  };
}
function build_semantic(pattern, ctx) {
  const newest = newest_source2(pattern);
  const stale = sources_stale(pattern, ctx.now);
  const grounding = grounding_for(pattern, ctx);
  const preference2 = preference_re2.test(pattern.statement);
  const factual = !preference2 && (pattern.sources.some((node) => node.contract.requires_grounding) || grounding.worlddb_ref !== null);
  const stale_fact = stale || factual && !grounding.current;
  const statement = `Stable semantic memory: ${pattern.statement}`;
  const contract = derive_contract(pattern, ctx.contract);
  return create_hydro_node({
    content: { raw: statement, canonical: statement.toLowerCase(), summary: statement },
    facets: { ...empty_facets(), semantic: { value: pattern.statement, weight: 1 } },
    world: newest.world,
    temporal: {
      valid_from: ctx.now,
      valid_to: stale_fact ? ctx.now : null,
      observed_at: newest.temporal.observed_at,
      recorded_at: ctx.now,
      superseded_at: stale_fact ? ctx.now : null
    },
    contract: { ...contract, requires_grounding: factual || contract.requires_grounding },
    grounding: {
      worlddb_ref: grounding.worlddb_ref,
      source_ids: grounding.source_ids,
      grounding_score: grounding.grounding_score
    },
    state: {
      ...default_node_state(),
      status: stale_fact ? "superseded" : "active",
      confidence: Math.min(1, pattern.signals.confidence + 0.1),
      salience: Math.min(1, pattern.signals.salience + 0.1)
    },
    vectors: { semantic: avg_vector(pattern.sources), type_vector: null, world_vector: newest.vectors.world_vector },
    provenance: derived_provenance(pattern, ctx.now)
  });
}
function build_corrected(pattern, ctx) {
  if (!pattern.fact || pattern.fact.valid_to !== null && ctx.now >= pattern.fact.valid_to) return null;
  const newest = newest_source2(pattern);
  const statement = `Corrected grounded belief: ${pattern.fact.statement}`;
  return create_hydro_node({
    content: { raw: statement, canonical: statement.toLowerCase(), summary: statement },
    facets: { ...empty_facets(), semantic: { value: pattern.fact.statement, weight: 1 } },
    world: newest.world,
    temporal: {
      valid_from: pattern.fact.valid_from,
      valid_to: pattern.fact.valid_to,
      observed_at: pattern.fact.observed_at,
      recorded_at: ctx.now,
      superseded_at: null
    },
    contract: derive_contract(pattern, { ...ctx.contract, requires_grounding: true, source_required: true }),
    grounding: {
      worlddb_ref: pattern.fact.ref,
      source_ids: [pattern.fact.source.id],
      grounding_score: pattern.fact.source.reliability
    },
    state: {
      ...default_node_state(),
      confidence: pattern.fact.source.reliability,
      salience: Math.min(1, pattern.signals.salience + 0.1)
    },
    vectors: { semantic: pattern.fact.vector, type_vector: null, world_vector: newest.vectors.world_vector },
    provenance: derived_provenance(pattern, ctx.now)
  });
}
function consolidate_memories(sources, ctx) {
  const patterns = detect_consolidation_patterns(sources, ctx);
  const memories = [];
  const edges = [];
  const skipped = [];
  for (const pattern of patterns) {
    if (pattern.signals.score < (ctx.threshold ?? default_threshold)) {
      skipped.push({ pattern, reason: `trigger score ${pattern.signals.score.toFixed(3)} below threshold` });
      continue;
    }
    const contract = derive_contract(pattern, ctx.contract);
    const provenance = derived_provenance(pattern, ctx.now);
    const vector = avg_vector(pattern.sources);
    let memory;
    if (pattern.kind === "procedural") {
      memory = build_procedure_memory(pattern, { now: ctx.now, contract, provenance, vector });
    } else if (pattern.kind === "reflection") {
      memory = build_reflection_memory(pattern, { now: ctx.now, contract, provenance, vector });
    } else if (pattern.kind === "corrected_belief") {
      memory = build_corrected(pattern, ctx);
    } else {
      memory = build_semantic(pattern, ctx);
    }
    if (!memory) {
      skipped.push({ pattern, reason: "external correction is already stale" });
      continue;
    }
    memories.push(memory);
    for (const source of pattern.sources) {
      edges.push(create_derived_from_edge(memory.id, source.id, ctx.now, provenance));
    }
  }
  return { memories, edges, patterns, skipped, source_count: sources.length };
}

// LongMemory-main/LongMemory-main/src/core/memory/working_memory.ts
var WorkingMemory = class {
  constructor(capacity = 128) {
    this.capacity = capacity;
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("working memory capacity must be positive");
  }
  capacity;
  entries = [];
  sequence = 0;
  push(event, received_at = Date.now()) {
    const entry = { sequence: ++this.sequence, received_at, event: structuredClone(event) };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    return entry;
  }
  recent(limit = this.capacity) {
    return this.entries.slice(-Math.max(0, limit)).map((entry) => structuredClone(entry));
  }
  get size() {
    return this.entries.length;
  }
  snapshot() {
    return { sequence: this.sequence, entries: structuredClone(this.entries) };
  }
  checkpoint() {
    return { sequence: this.sequence, entries: this.entries.slice() };
  }
  rollback(checkpoint) {
    this.sequence = checkpoint.sequence;
    this.entries = checkpoint.entries.slice();
  }
  restore(snapshot) {
    this.sequence = snapshot.sequence;
    this.entries = structuredClone(snapshot.entries);
  }
};

// LongMemory-main/LongMemory-main/src/core/i18n/multilingual_tokenizer.ts
var cjk_pattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{Script=Latin}\p{Number}_+#.-]+/gu;
var default_pattern = /[\p{Letter}\p{Mark}\p{Number}_+#.-]+/gu;
function resolve(text, language, script) {
  if (language !== void 0 && script !== void 0) return { language, script };
  const detected = detect_script(text);
  return { language: language ?? detect_language(text, detected).language, script: script ?? detected.script };
}
function pattern_for(language, script) {
  const cjk = language === "zh" || language === "ja" || language === "ko" || script === "Han" || script === "Hiragana" || script === "Katakana" || script === "Hangul";
  return cjk ? cjk_pattern : default_pattern;
}
function tokenize(text, language, script) {
  const resolved = resolve(text, language, script);
  const pattern = pattern_for(resolved.language, resolved.script);
  pattern.lastIndex = 0;
  const tokens3 = [];
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    tokens3.push({ value: match[0].toLocaleLowerCase(), start: match.index, end: match.index + match[0].length, language: resolved.language, script: resolved.script });
  }
  return tokens3;
}
function count_multilingual_tokens(text, language, script) {
  const resolved = resolve(text, language, script);
  const pattern = pattern_for(resolved.language, resolved.script);
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count++;
  return count;
}

// LongMemory-main/LongMemory-main/src/core/recall/recall_text.ts
import { stemmer } from "stemmer";
var stopwords = /* @__PURE__ */ new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "could", "did", "do", "does", "for", "from", "had", "has", "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "should", "that", "the", "to", "was", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your"]);
var document_cache = /* @__PURE__ */ new WeakMap();
var strict_document_cache = /* @__PURE__ */ new WeakMap();
var subject_document_cache = /* @__PURE__ */ new WeakMap();
var vector_cache = /* @__PURE__ */ new WeakMap();
var doubled_consonant = /([bdfgmnprt])\1$/;
function undouble(stem) {
  return doubled_consonant.test(stem) ? stem.slice(0, -1) : stem;
}
function normalize_recall_token(value) {
  if (!/^[a-z]+$/.test(value) || value.length <= 3 || stopwords.has(value)) return value;
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 5 && value.endsWith("ing")) return undouble(value.slice(0, -3));
  if (value.length > 4 && value.endsWith("ed")) return undouble(value.slice(0, -2));
  if (value.length > 4 && value.endsWith("ly")) return value.slice(0, -2);
  if (value.endsWith("s") && !/(?:ss|us|is)$/.test(value)) return normalize_recall_token(value.slice(0, -1));
  if (value.endsWith("e") && stemmer(`${value}d`) === stemmer(value)) return value.slice(0, -1);
  return value;
}
function split_speaker(text) {
  const match = /^\s*([^:\n]{1,32}):\s+([\s\S]*)$/.exec(text || "");
  if (!match) return { speaker: "", body: text || "" };
  const candidate = match[1].trim();
  if (!candidate || /[.!?,;]/.test(candidate) || candidate.split(/\s+/).length > 2) return { speaker: "", body: text || "" };
  return { speaker: candidate, body: match[2] };
}
function recall_tokens(text) {
  return tokenize(text || "").map((token) => normalize_recall_token(token.value)).filter((value) => !stopwords.has(value));
}
function strict_recall_tokens(text) {
  return tokenize(text || "").map((token) => token.value);
}
function canonical_entity_names(node) {
  const entities = Array.isArray(node.metadata.resolved_entities) ? node.metadata.resolved_entities : [];
  return [...new Set(entities.flatMap((entity) => {
    if (!entity || typeof entity !== "object") return [];
    const name = entity.name;
    return typeof name === "string" ? [name] : [];
  }))];
}
function recall_document(node) {
  const cached = document_cache.get(node);
  if (cached) return cached;
  const canonical = split_speaker(node.content.canonical);
  const declared_speaker = typeof node.metadata.speaker === "string" ? node.metadata.speaker : "";
  const speaker_terms = new Set(recall_tokens(`${declared_speaker} ${canonical.speaker}`));
  const terms = recall_tokens(`${canonical.body} ${node.content.summary}`).filter((term) => !speaker_terms.has(term));
  const present = /* @__PURE__ */ new Set([...terms, ...speaker_terms]);
  for (const term of new Set(recall_tokens(canonical_entity_names(node).join(" ")))) {
    if (!present.has(term)) terms.push(term);
  }
  const frequencies = /* @__PURE__ */ new Map();
  for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const document = { terms, frequencies, length: terms.length, speaker_terms };
  document_cache.set(node, document);
  return document;
}
function strict_recall_document(node) {
  const cached = strict_document_cache.get(node);
  if (cached) return cached;
  const terms = new Set(strict_recall_tokens(
    `${node.content.canonical_text ?? node.content.canonical} ${node.content.summary} ${node.content.transliteration ?? ""} ${canonical_entity_names(node).join(" ")}`
  ));
  const document = { terms };
  strict_document_cache.set(node, document);
  return document;
}
function subject_recall_document(node) {
  const cached = subject_document_cache.get(node);
  if (cached) return cached;
  const document = { terms: new Set(strict_recall_tokens(`${node.content.canonical} ${node.content.summary} ${canonical_entity_names(node).join(" ")}`)) };
  subject_document_cache.set(node, document);
  return document;
}
function recall_vector(vector) {
  if (!vector?.length) return null;
  const cached = vector_cache.get(vector);
  if (cached) return cached;
  const values = Array.from(vector);
  let squared = 0;
  for (let index = 0; index < values.length; index++) squared += values[index] * values[index];
  const prepared = { values, norm: Math.sqrt(squared) };
  vector_cache.set(vector, prepared);
  return prepared;
}
function prepare_recall_node(node) {
  recall_document(node);
  strict_recall_document(node);
  subject_recall_document(node);
  recall_vector(node.vectors.semantic);
}

// LongMemory-main/LongMemory-main/src/core/recall/candidate_selection.ts
var InMemoryRecallIndex = class {
  constructor(hot, cold = []) {
    this.cold = cold;
    for (const node of hot) this.set_node(node);
  }
  cold;
  _cold_scans = 0;
  hot_by_id = /* @__PURE__ */ new Map();
  hot_by_world = /* @__PURE__ */ new Map();
  checkpoints = /* @__PURE__ */ new Set();
  active_nodes(world_ids) {
    if (world_ids === null) return [...this.hot_by_id.values()];
    if (world_ids.length === 1) return [...this.hot_by_world.get(world_ids[0])?.values() ?? []];
    const set = new Set(world_ids);
    return [...this.hot_by_id.values()].filter((node) => set.has(node.world.world_id));
  }
  get cold_scans() {
    return this._cold_scans;
  }
  add(node) {
    this.set_node(node);
  }
  snapshot() {
    return [...this.hot_by_id.values()];
  }
  checkpoint() {
    const checkpoint = { nodes: /* @__PURE__ */ new Map() };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("InMemoryRecallIndex: unknown checkpoint");
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("InMemoryRecallIndex: unknown checkpoint");
    for (const [id, node] of checkpoint.nodes) {
      this.delete_node(id);
      if (node) this.set_node(node);
    }
  }
  restore(snapshot) {
    this.hot_by_id.clear();
    this.hot_by_world.clear();
    for (const node of snapshot) this.set_node(node);
  }
  scan_cold() {
    this._cold_scans++;
    return [...this.cold];
  }
  set_node(node) {
    prepare_recall_node(node);
    const prior = this.hot_by_id.get(node.id);
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.nodes.has(node.id)) checkpoint.nodes.set(node.id, prior);
    }
    if (prior && prior.world.world_id !== node.world.world_id) {
      const prior_world = this.hot_by_world.get(prior.world.world_id);
      prior_world?.delete(node.id);
      if (prior_world?.size === 0) this.hot_by_world.delete(prior.world.world_id);
    }
    this.hot_by_id.set(node.id, node);
    let world = this.hot_by_world.get(node.world.world_id);
    if (!world) {
      world = /* @__PURE__ */ new Map();
      this.hot_by_world.set(node.world.world_id, world);
    }
    world.set(node.id, node);
  }
  delete_node(id) {
    const prior = this.hot_by_id.get(id);
    if (!prior) return;
    this.hot_by_id.delete(id);
    const world = this.hot_by_world.get(prior.world.world_id);
    world?.delete(id);
    if (world?.size === 0) this.hot_by_world.delete(prior.world.world_id);
  }
};

// LongMemory-main/LongMemory-main/src/core/resolver/alias_index.ts
var AliasIndex = class {
  index = /* @__PURE__ */ new Map();
  checkpoints = /* @__PURE__ */ new Set();
  add(alias, entity_id2) {
    const key = normalize_name(alias);
    if (key.length === 0) return;
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.values.has(key)) checkpoint.values.set(key, this.index.get(key));
    }
    this.index.set(key, entity_id2);
  }
  lookup(name) {
    return this.index.get(normalize_name(name));
  }
  has(name) {
    return this.index.has(normalize_name(name));
  }
  entries_for(entity_id2) {
    const out = [];
    for (const [alias, id] of this.index) if (id === entity_id2) out.push(alias);
    return out.sort();
  }
  snapshot() {
    return new Map(this.index);
  }
  checkpoint() {
    const checkpoint = { values: /* @__PURE__ */ new Map() };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("AliasIndex: unknown checkpoint");
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("AliasIndex: unknown checkpoint");
    for (const [key, value] of checkpoint.values) {
      if (value === void 0) this.index.delete(key);
      else this.index.set(key, value);
    }
  }
  restore(snap) {
    this.index = new Map(snap);
  }
};

// LongMemory-main/LongMemory-main/src/core/resolver/candidate_merge.ts
function entity_id(name, type, at, discriminator = "") {
  const digest = sha256_hex(`${normalize_name(name)}|${type}|${at}|${discriminator}`);
  return `entity:${digest.slice(0, 16)}`;
}
function create_entity_candidate(input, at) {
  const type = input.type ?? "unknown";
  const aliases = [...new Set((input.aliases ?? []).map((a) => a))];
  const domain = typeof input.metadata?.["domain"] === "string" ? input.metadata["domain"] : "";
  const disambiguator = typeof input.metadata?.["disambiguator"] === "string" ? input.metadata["disambiguator"] : "";
  const discriminator = `${domain}|${disambiguator}|${input.world_id ?? ""}`;
  return {
    id: entity_id(input.name, type, at, discriminator),
    canonical_name: input.name,
    aliases,
    type,
    created_at: at,
    updated_at: at,
    world_ids: input.world_id ? [input.world_id] : [],
    vector: input.vector ?? null,
    metadata: { ...input.metadata ?? {}, context: input.context ?? [] },
    drift_history: [],
    confidence: input.type ? 0.6 : 0.5
  };
}
function create_merge_candidate(mention, candidate_entity, canonical, breakdown, at) {
  return {
    id: `candidate:${candidate_entity.id}->${canonical.id}`,
    mention_name: mention.name,
    candidate_entity_id: candidate_entity.id,
    canonical_entity_id: canonical.id,
    score: breakdown.score,
    breakdown,
    created_at: at,
    resolved: false
  };
}
function prevent_unsafe_merge(entity_a, entity_b) {
  if (entity_a.type !== "unknown" && entity_b.type !== "unknown" && entity_a.type !== entity_b.type) {
    return true;
  }
  for (const key of ["domain", "disambiguator"]) {
    const a = entity_a.metadata[key];
    const b = entity_b.metadata[key];
    if (typeof a === "string" && typeof b === "string" && a !== b) return true;
  }
  return false;
}
function create_same_as_edge(candidate, canonical, at) {
  return create_hydro_edge({
    from: candidate.id,
    to: canonical.id,
    type: "same_as",
    confidence: 0.99,
    weight: 1,
    temporal: { valid_from: at, valid_to: null, observed_at: at, recorded_at: at },
    handler: { handler: "same_as", params: { alias: candidate.canonical_name } },
    provenance: manual_provenance("entity-resolver", at)
  });
}

// LongMemory-main/LongMemory-main/src/core/resolver/semantic_drift.ts
var default_drift_threshold = 0.5;
function detect_semantic_drift(entity, new_context, threshold = default_drift_threshold) {
  const prev = entity_context(entity);
  const overlap = context_overlap(prev, new_context.context);
  const vec_sim = entity.vector && new_context.vector ? vector_similarity(entity.vector, new_context.vector) : 1;
  const similarity = 0.5 * overlap + 0.5 * vec_sim;
  const drift = 1 - similarity;
  return {
    drifted: drift >= threshold,
    drift_score: drift,
    from_context: prev.join(","),
    to_context: (new_context.context ?? []).join(","),
    note: `context drift ${drift.toFixed(3)}`
  };
}
function create_semantic_shift_edge(entity, drift, at) {
  return create_hydro_edge({
    from: entity.id,
    to: `${entity.id}@${at}`,
    type: "semantic_shift",
    confidence: 0.9,
    weight: 1,
    temporal: { valid_from: at, valid_to: null, observed_at: at, recorded_at: at },
    handler: {
      handler: "semantic_shift",
      params: { note: drift.note, drift_score: drift.drift_score }
    },
    provenance: manual_provenance("entity-resolver", at)
  });
}

// LongMemory-main/LongMemory-main/src/core/resolver/entity_candidate_index.ts
function name_keys(name) {
  const normalized = normalize_name(name);
  if (!normalized) return [];
  const keys = new Set(normalized.split(" ").filter(Boolean).map((token) => `token:${token}`));
  const compact = normalized.replaceAll(" ", "");
  for (let index = 0; index < compact.length - 1; index++) keys.add(`bigram:${compact.slice(index, index + 2)}`);
  return [...keys];
}
var entity_candidate_index = class {
  ids_by_key = /* @__PURE__ */ new Map();
  keys_by_id = /* @__PURE__ */ new Map();
  ids_by_type = /* @__PURE__ */ new Map();
  ids_by_metadata = /* @__PURE__ */ new Map();
  ids_without_metadata = /* @__PURE__ */ new Map();
  add_entity(entity) {
    this.add_name(entity.id, entity.canonical_name);
    for (const alias of entity.aliases) this.add_name(entity.id, alias);
    let type_ids = this.ids_by_type.get(entity.type);
    if (!type_ids) {
      type_ids = /* @__PURE__ */ new Set();
      this.ids_by_type.set(entity.type, type_ids);
    }
    type_ids.add(entity.id);
    for (const key of ["domain", "disambiguator"]) {
      const value = entity.metadata[key];
      if (typeof value === "string") this.metadata_bucket(key, value).add(entity.id);
      else this.missing_metadata_bucket(key).add(entity.id);
    }
  }
  add_name(entity_id2, name) {
    for (const key of name_keys(name)) {
      let ids = this.ids_by_key.get(key);
      if (!ids) {
        ids = /* @__PURE__ */ new Set();
        this.ids_by_key.set(key, ids);
      }
      ids.add(entity_id2);
      let keys = this.keys_by_id.get(entity_id2);
      if (!keys) {
        keys = /* @__PURE__ */ new Set();
        this.keys_by_id.set(entity_id2, keys);
      }
      keys.add(key);
    }
  }
  candidates(input) {
    const query_keys = name_keys(input.name);
    const constraints = [];
    if (input.type && input.type !== "unknown") {
      constraints.push(/* @__PURE__ */ new Set([...this.ids_by_type.get(input.type) ?? [], ...this.ids_by_type.get("unknown") ?? []]));
    }
    for (const key of ["domain", "disambiguator"]) {
      const value = input.metadata?.[key];
      if (typeof value !== "string") continue;
      constraints.push(/* @__PURE__ */ new Set([
        ...this.metadata_bucket(key, value),
        ...this.missing_metadata_bucket(key)
      ]));
    }
    if (constraints.length) {
      constraints.sort((left, right) => left.size - right.size);
      const candidates2 = new Set(constraints[0]);
      for (const constraint of constraints.slice(1)) this.intersect(candidates2, constraint);
      for (const id of candidates2) {
        const keys = this.keys_by_id.get(id);
        if (!keys || !query_keys.some((key) => keys.has(key))) candidates2.delete(id);
      }
      return candidates2;
    }
    const candidates = /* @__PURE__ */ new Set();
    for (const key of query_keys) {
      for (const id of this.ids_by_key.get(key) ?? []) candidates.add(id);
    }
    return candidates;
  }
  clear() {
    this.ids_by_key.clear();
    this.keys_by_id.clear();
    this.ids_by_type.clear();
    this.ids_by_metadata.clear();
    this.ids_without_metadata.clear();
  }
  metadata_bucket(key, value) {
    const bucket_key = `${key}\0${value}`;
    let ids = this.ids_by_metadata.get(bucket_key);
    if (!ids) {
      ids = /* @__PURE__ */ new Set();
      this.ids_by_metadata.set(bucket_key, ids);
    }
    return ids;
  }
  missing_metadata_bucket(key) {
    let ids = this.ids_without_metadata.get(key);
    if (!ids) {
      ids = /* @__PURE__ */ new Set();
      this.ids_without_metadata.set(key, ids);
    }
    return ids;
  }
  intersect(target, allowed) {
    for (const id of target) if (!allowed.has(id)) target.delete(id);
  }
};

// LongMemory-main/LongMemory-main/src/core/resolver/entity_resolver.ts
var EntityResolver = class {
  entities = /* @__PURE__ */ new Map();
  candidates = /* @__PURE__ */ new Map();
  alias_index = new AliasIndex();
  merged_into = /* @__PURE__ */ new Map();
  candidate_index = new entity_candidate_index();
  checkpoints = /* @__PURE__ */ new Set();
  now;
  weights;
  thresholds;
  constructor(options = {}) {
    this.now = options.now ?? Date.now();
    this.weights = options.weights ?? default_score_weights;
    this.thresholds = options.thresholds ?? default_thresholds;
  }
  register_entity(entity) {
    this.track_entity(entity.id);
    this.entities.set(entity.id, entity);
    this.alias_index.add(entity.canonical_name, entity.id);
    this.candidate_index.add_entity(entity);
    for (const alias of entity.aliases) this.alias_index.add(alias, entity.id);
    return entity;
  }
  add_entity(input) {
    const at = input.observed_at ?? this.now;
    return this.register_entity(create_entity_candidate(input, at));
  }
  get_entity(id) {
    return this.entities.get(id);
  }
  entity_list() {
    return [...this.entities.values()];
  }
  canonical_id_for(name) {
    const direct = this.alias_index.lookup(name);
    if (!direct) return void 0;
    return this.merged_into.get(direct) ?? direct;
  }
  resolve(input) {
    const at = input.observed_at ?? this.now;
    const mention_entity = create_entity_candidate(input, at);
    const alias_id = this.canonical_id_for(input.name);
    if (alias_id) {
      const entity = this.entities.get(alias_id);
      if (entity && !prevent_unsafe_merge(mention_entity, entity)) {
        this.absorb_mention(entity, input, at);
        return { action: "resolved", entity, score: 1, matched: entity };
      }
    }
    let best;
    let best_breakdown;
    for (const entity of this.match_candidates(input)) {
      const breakdown = score_entity_match(input, entity, this.weights);
      if (!best_breakdown || breakdown.score > best_breakdown.score || breakdown.score === best_breakdown.score && entity.id < best.id) {
        best = entity;
        best_breakdown = breakdown;
      }
    }
    if (best && best_breakdown) {
      const unsafe = prevent_unsafe_merge(mention_entity, best);
      if (!unsafe && best_breakdown.score >= this.thresholds.merge) {
        this.absorb_mention(best, input, at);
        return {
          action: "resolved",
          entity: best,
          score: best_breakdown.score,
          breakdown: best_breakdown,
          matched: best
        };
      }
      if (best_breakdown.score >= this.thresholds.candidate) {
        this.register_entity(mention_entity);
        const candidate = create_merge_candidate(input, mention_entity, best, best_breakdown, at);
        this.track_candidate(candidate.id);
        this.candidates.set(candidate.id, candidate);
        return {
          action: "candidate",
          entity: mention_entity,
          score: best_breakdown.score,
          breakdown: best_breakdown,
          matched: best,
          candidate
        };
      }
    }
    this.register_entity(mention_entity);
    return {
      action: "created",
      entity: mention_entity,
      score: best_breakdown?.score ?? 0,
      breakdown: best_breakdown,
      matched: best
    };
  }
  absorb_mention(entity, input, at) {
    this.track_entity(entity.id);
    this.add_alias(entity.id, input.name);
    for (const alias of input.aliases ?? []) this.add_alias(entity.id, alias);
    if (input.world_id && !entity.world_ids.includes(input.world_id)) {
      entity.world_ids.push(input.world_id);
    }
    entity.updated_at = at;
  }
  add_alias(entity_id2, alias) {
    const entity = this.entities.get(entity_id2);
    if (!entity) throw new Error(`addAlias: unknown entity ${entity_id2}`);
    this.track_entity(entity_id2);
    const normalized_existing = new Set(entity.aliases.map((a) => a.toLowerCase()));
    if (alias.toLowerCase() !== entity.canonical_name.toLowerCase() && !normalized_existing.has(alias.toLowerCase())) {
      entity.aliases.push(alias);
    }
    this.alias_index.add(alias, entity_id2);
    this.candidate_index.add_name(entity_id2, alias);
    entity.updated_at = Math.max(entity.updated_at, this.now);
    return entity;
  }
  // ---- manual merge ----------------------------------------------------
  /** Confirm a merge: emit a same_as edge and update the canonical mapping. */
  create_same_as_edge(candidate, canonical) {
    const at = this.now;
    this.track_entity(candidate.id);
    this.track_entity(canonical.id);
    const edge = create_same_as_edge(candidate, canonical, at);
    this.add_alias(canonical.id, candidate.canonical_name);
    for (const alias of candidate.aliases) this.add_alias(canonical.id, alias);
    this.alias_index.add(candidate.canonical_name, canonical.id);
    this.track_merged(candidate.id);
    this.merged_into.set(candidate.id, canonical.id);
    for (const c of this.candidates.values()) {
      if (c.candidate_entity_id === candidate.id && c.canonical_entity_id === canonical.id) {
        this.track_candidate(c.id);
        c.resolved = true;
      }
    }
    canonical.updated_at = at;
    return edge;
  }
  // ---- drift -----------------------------------------------------------
  detect_drift(entity, new_context) {
    return detect_semantic_drift(entity, new_context);
  }
  /** Record drift as a semantic_shift edge + drift_history entry (no overwrite). */
  record_semantic_drift(entity, new_context) {
    const drift = detect_semantic_drift(entity, new_context);
    if (!drift.drifted) return { drift, edge: null };
    this.track_entity(entity.id);
    const at = new_context.at ?? this.now;
    const edge = create_semantic_shift_edge(entity, drift, at);
    const entry = {
      at,
      from_context: drift.from_context,
      to_context: drift.to_context,
      note: drift.note,
      drift_score: drift.drift_score,
      shift_edge_id: edge.id
    };
    entity.drift_history.push(entry);
    entity.updated_at = at;
    return { drift, edge };
  }
  candidate_list() {
    return [...this.candidates.values()];
  }
  snapshot() {
    return {
      entities: structuredClone(this.entities),
      candidates: structuredClone(this.candidates),
      aliases: this.alias_index.snapshot(),
      merged_into: new Map(this.merged_into)
    };
  }
  checkpoint() {
    const checkpoint = {
      entities: /* @__PURE__ */ new Map(),
      candidates: /* @__PURE__ */ new Map(),
      merged_into: /* @__PURE__ */ new Map(),
      aliases: this.alias_index.checkpoint()
    };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("EntityResolver: unknown checkpoint");
    this.alias_index.commit(checkpoint.aliases);
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("EntityResolver: unknown checkpoint");
    for (const [id, entity] of checkpoint.entities) {
      if (entity === void 0) this.entities.delete(id);
      else this.entities.set(id, entity);
    }
    for (const [id, candidate] of checkpoint.candidates) {
      if (candidate === void 0) this.candidates.delete(id);
      else this.candidates.set(id, candidate);
    }
    for (const [id, canonical] of checkpoint.merged_into) {
      if (canonical === void 0) this.merged_into.delete(id);
      else this.merged_into.set(id, canonical);
    }
    this.alias_index.rollback(checkpoint.aliases);
    this.rebuild_candidate_index();
  }
  restore(snapshot) {
    this.entities = structuredClone(snapshot.entities);
    this.candidates = structuredClone(snapshot.candidates);
    this.alias_index.restore(snapshot.aliases);
    this.merged_into = new Map(snapshot.merged_into);
    this.rebuild_candidate_index();
  }
  match_candidates(input) {
    const vector_max = input.vector?.length ? this.weights.vector : 0;
    const context_max = input.context?.length ? this.weights.context : 0;
    const non_name_max = vector_max + context_max + this.weights.temporal;
    if (this.weights.name <= 0 || non_name_max >= this.thresholds.candidate) return this.entities.values();
    const required_name = (this.thresholds.candidate - non_name_max) / this.weights.name;
    if (required_name > 1) return [];
    return [...this.candidate_index.candidates(input)].flatMap((id) => this.entities.get(id) ?? []);
  }
  track_entity(id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.entities.has(id)) {
        const entity = this.entities.get(id);
        checkpoint.entities.set(id, entity ? structuredClone(entity) : void 0);
      }
    }
  }
  track_candidate(id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.candidates.has(id)) {
        const candidate = this.candidates.get(id);
        checkpoint.candidates.set(id, candidate ? structuredClone(candidate) : void 0);
      }
    }
  }
  track_merged(id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.merged_into.has(id)) checkpoint.merged_into.set(id, this.merged_into.get(id));
    }
  }
  rebuild_candidate_index() {
    this.candidate_index.clear();
    for (const entity of this.entities.values()) this.candidate_index.add_entity(entity);
  }
};

// LongMemory-main/LongMemory-main/src/core/types/world.ts
function empty_ontology() {
  return { types: [], terms: [] };
}

// LongMemory-main/LongMemory-main/src/core/worlds/world_embedding.ts
function zeros(dim) {
  return new Array(dim).fill(0);
}
function scale_add(acc, v, scale) {
  const n = Math.min(acc.length, v.length);
  for (let i = 0; i < n; i++) acc[i] += v[i] * scale;
}
function normalize_vector(v) {
  let norm2 = 0;
  for (const x of v) norm2 += x * x;
  norm2 = Math.sqrt(norm2);
  if (norm2 === 0) return v.slice();
  return v.map((x) => x / norm2);
}
function average_vectors(vectors, dim) {
  if (vectors.length === 0) return null;
  const acc = zeros(dim);
  for (const v of vectors) scale_add(acc, v, 1);
  for (let i = 0; i < acc.length; i++) acc[i] /= vectors.length;
  return acc;
}
var token_re3 = /[a-z0-9]+/g;
function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function text_to_vector(text, dim) {
  const vec = zeros(dim);
  const tokens3 = (text || "").toLowerCase().match(token_re3) ?? [];
  for (const tok of tokens3) {
    const h = hash32(tok);
    const idx = h % dim;
    const sign = (h & 256) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  return normalize_vector(vec);
}
function ontology_to_vector(ontology, dim) {
  const text = [...ontology.types, ...ontology.terms].join(" ");
  return text_to_vector(text, dim);
}

// LongMemory-main/LongMemory-main/src/core/worlds/world_composer.ts
var default_world_embedding_weights = {
  node: 0.4,
  child_world: 0.25,
  relation: 0.15,
  grounding: 0.1,
  ontology: 0.1
};
function collect(ids, get) {
  const out = [];
  for (const id of ids) {
    const v = get(id);
    if (v) out.push(v);
  }
  return out;
}
function compose_world_embedding(world, sources, weights = default_world_embedding_weights) {
  const dim = sources.dim;
  const acc = zeros(dim);
  const add_group = (vectors, weight) => {
    const avg2 = average_vectors(vectors, dim);
    if (avg2) scale_add(acc, avg2, weight);
  };
  add_group(collect(world.node_refs, sources.node_vector), weights.node);
  add_group(collect(world.child_world_ids, sources.child_world_vector), weights.child_world);
  if (sources.relation_vector) {
    add_group(collect(world.edge_refs, sources.relation_vector), weights.relation);
  }
  const grounding = sources.grounding_vector?.(world) ?? null;
  if (grounding) scale_add(acc, grounding, weights.grounding);
  scale_add(acc, ontology_to_vector(world.ontology, dim), weights.ontology);
  return normalize_vector(acc);
}

// LongMemory-main/LongMemory-main/src/core/worlds/world_contracts.ts
function resolve_world_contracts(chain, base = default_contract()) {
  let effective = { ...base };
  for (const world of chain) {
    effective = { ...effective, ...world.contracts };
  }
  return effective;
}

// LongMemory-main/LongMemory-main/src/core/worlds/recursive_world.ts
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
var digest_modulus = 1n << 256n;
var incremental_set_digest = class {
  values = /* @__PURE__ */ new Map();
  sum = 0n;
  xor = 0n;
  constructor(values = []) {
    for (const value of values) this.add(value);
  }
  add(value) {
    if (this.values.has(value)) return false;
    const hashed = BigInt(`0x${hash_canonical(["world-reference", value])}`);
    this.values.set(value, hashed);
    this.sum = (this.sum + hashed) % digest_modulus;
    this.xor ^= hashed;
    return true;
  }
  delete(value) {
    const hashed = this.values.get(value);
    if (hashed === void 0) return false;
    this.values.delete(value);
    this.sum = (this.sum - hashed + digest_modulus) % digest_modulus;
    this.xor ^= hashed;
    return true;
  }
  digest() {
    return hash_canonical({
      count: this.values.size,
      sum: this.sum.toString(16).padStart(64, "0"),
      xor: this.xor.toString(16).padStart(64, "0")
    });
  }
};
var incremental_map_digest = class {
  values = /* @__PURE__ */ new Map();
  sum = 0n;
  xor = 0n;
  set(key, value) {
    const current = this.values.get(key);
    if (current?.value === value) return false;
    if (current) {
      this.sum = (this.sum - current.hashed + digest_modulus) % digest_modulus;
      this.xor ^= current.hashed;
    }
    const hashed = BigInt(`0x${hash_canonical(["world-child", key, value])}`);
    this.values.set(key, { value, hashed });
    this.sum = (this.sum + hashed) % digest_modulus;
    this.xor ^= hashed;
    return true;
  }
  digest() {
    return hash_canonical({
      count: this.values.size,
      sum: this.sum.toString(16).padStart(64, "0"),
      xor: this.xor.toString(16).padStart(64, "0")
    });
  }
};
var WorldGraph = class {
  worlds = /* @__PURE__ */ new Map();
  world_ids_by_name = /* @__PURE__ */ new Map();
  primary_worlds = /* @__PURE__ */ new Map();
  placement_history = [];
  node_digests = /* @__PURE__ */ new Map();
  edge_digests = /* @__PURE__ */ new Map();
  child_digests = /* @__PURE__ */ new Map();
  checkpoints = /* @__PURE__ */ new Set();
  now;
  dim;
  node_vector;
  embedding_weights;
  constructor(options = {}) {
    this.now = options.now ?? Date.now();
    this.dim = options.dim ?? 8;
    this.node_vector = options.node_vector ?? (() => null);
    this.embedding_weights = options.embedding_weights;
  }
  create_world(input, options = {}) {
    const at = input.at ?? this.now;
    const world = {
      id: `world:${hash_canonical([slug(input.name), input.parent_world_id ?? null, at]).slice(0, 16)}`,
      name: input.name,
      parent_world_id: input.parent_world_id ?? null,
      scope_path: input.scope_path ?? [slug(input.name)],
      ontology: input.ontology ?? empty_ontology(),
      contracts: input.contracts ?? {},
      zone: input.zone ?? "mixed",
      child_world_ids: [],
      node_refs: [],
      edge_refs: [],
      world_vector: null,
      content_hash: "",
      created_at: at,
      updated_at: at,
      metadata: input.metadata ?? {}
    };
    this.track_world(world.id);
    this.worlds.set(world.id, world);
    const normalized_name = world.name.toLowerCase();
    if (!this.world_ids_by_name.has(normalized_name)) this.world_ids_by_name.set(normalized_name, world.id);
    this.initialize_membership(world);
    if (!options.defer_hash) this.recompute_world_hash(world.id);
    return world;
  }
  create_child_world(parent_id, input, options = {}) {
    const parent = this.require_world(parent_id);
    const child = this.create_world({
      ...input,
      parent_world_id: parent.id,
      scope_path: [...parent.scope_path, slug(input.name)]
    }, options);
    this.track_world(parent.id);
    parent.child_world_ids.push(child.id);
    if (!options.defer_hash) {
      this.require_child_digest(parent.id).set(child.id, child.content_hash);
      this.propagate_from(parent.id);
    }
    return child;
  }
  // ---- membership ------------------------------------------------------
  add_node_to_world(world_id, node_id, opts = {}) {
    const world = this.require_world(world_id);
    this.track_world(world_id);
    const primary = opts.primary ?? true;
    const changed = this.require_node_digest(world_id).add(node_id);
    if (changed) world.node_refs.push(node_id);
    if (primary) {
      const from = this.primary_worlds.get(node_id) ?? null;
      this.track_primary(node_id);
      this.primary_worlds.set(node_id, world_id);
      this.placement_history.push({ node_id, from_world_id: from, to_world_id: world_id, at: this.now });
    }
    if (changed) this.propagate_from(world_id);
  }
  add_edge_to_world(world_id, edge_id) {
    const world = this.require_world(world_id);
    this.track_world(world_id);
    if (this.require_edge_digest(world_id).add(edge_id)) {
      world.edge_refs.push(edge_id);
      this.propagate_from(world_id);
    }
  }
  /** Move a node's primary placement, keeping the prior placement in history. */
  move_node_between_worlds(node_id, from_world_id, to_world_id) {
    const from = this.require_world(from_world_id);
    const to = this.require_world(to_world_id);
    this.track_world(from.id);
    this.track_world(to.id);
    this.track_primary(node_id);
    if (this.require_node_digest(from.id).delete(node_id)) from.node_refs = from.node_refs.filter((id) => id !== node_id);
    if (this.require_node_digest(to.id).add(node_id)) to.node_refs.push(node_id);
    this.primary_worlds.set(node_id, to.id);
    const entry = {
      node_id,
      from_world_id: from.id,
      to_world_id: to.id,
      at: this.now
    };
    this.placement_history.push(entry);
    this.propagate_from(from.id);
    this.propagate_from(to.id);
    return entry;
  }
  // ---- queries ---------------------------------------------------------
  get_world(world_id) {
    return this.worlds.get(world_id);
  }
  get_world_by_name(name) {
    const id = this.world_ids_by_name.get(name.toLowerCase());
    return id ? this.worlds.get(id) : void 0;
  }
  primary_world_of(node_id) {
    return this.primary_worlds.get(node_id);
  }
  placement_history_for(node_id) {
    return this.placement_history.filter((p) => p.node_id === node_id);
  }
  world_list() {
    return [...this.worlds.values()];
  }
  snapshot() {
    return {
      worlds: new Map([...this.worlds].map(([id, world]) => [id, clone_world(world)])),
      primary_world_of: new Map(this.primary_worlds),
      placement_history: this.placement_history.map((placement) => ({ ...placement }))
    };
  }
  checkpoint() {
    const checkpoint = {
      worlds: /* @__PURE__ */ new Map(),
      primary_worlds: /* @__PURE__ */ new Map(),
      placement_history_length: this.placement_history.length
    };
    this.checkpoints.add(checkpoint);
    return checkpoint;
  }
  commit(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("WorldGraph: unknown checkpoint");
  }
  rollback(checkpoint) {
    if (!this.checkpoints.delete(checkpoint)) throw new Error("WorldGraph: unknown checkpoint");
    for (const [id, world] of checkpoint.worlds) {
      if (world === void 0) {
        this.worlds.delete(id);
        this.node_digests.delete(id);
        this.edge_digests.delete(id);
        this.child_digests.delete(id);
      } else {
        const restored = clone_world(world);
        this.worlds.set(id, restored);
        this.initialize_membership(restored);
      }
    }
    for (const [node_id, world_id] of checkpoint.primary_worlds) {
      if (world_id === void 0) this.primary_worlds.delete(node_id);
      else this.primary_worlds.set(node_id, world_id);
    }
    this.placement_history.length = checkpoint.placement_history_length;
    this.rebuild_name_index();
  }
  restore(snapshot) {
    this.worlds = new Map([...snapshot.worlds].map(([id, world]) => [id, clone_world(world)]));
    this.primary_worlds = new Map(snapshot.primary_world_of);
    this.placement_history = snapshot.placement_history.map((placement) => ({ ...placement }));
    this.rebuild_name_index();
    this.node_digests.clear();
    this.edge_digests.clear();
    this.child_digests.clear();
    for (const world of this.worlds.values()) this.initialize_membership(world);
  }
  /** Root -> ... -> target world chain. */
  get_world_path(world_id) {
    const chain = [];
    let current = world_id;
    const seen = /* @__PURE__ */ new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const world = this.require_world(current);
      chain.push(world);
      current = world.parent_world_id;
    }
    return chain.reverse();
  }
  /** All world ids and node ids in a world's subtree (world included). */
  query_world_subtree(world_id) {
    const world_ids = [];
    const node_ids = /* @__PURE__ */ new Set();
    const stack = [world_id];
    const seen = /* @__PURE__ */ new Set();
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const world = this.require_world(id);
      world_ids.push(id);
      for (const n of world.node_refs) node_ids.add(n);
      for (const c of world.child_world_ids) stack.push(c);
    }
    return { world_ids: world_ids.sort(), node_ids: [...node_ids].sort() };
  }
  /** Effective contract for a world, inherited/overridden down the tree. */
  resolve_contracts(world_id) {
    return resolve_world_contracts(this.get_world_path(world_id));
  }
  // ---- hashing + embedding --------------------------------------------
  recompute_world_hash(world_id) {
    const world = this.require_world(world_id);
    this.track_world(world_id);
    const projection = {
      hash_version: 3,
      name: world.name,
      parent_world_id: world.parent_world_id,
      scope_path: world.scope_path,
      ontology: world.ontology,
      contracts: world.contracts,
      zone: world.zone,
      child_worlds_hash: this.require_child_digest(world_id).digest(),
      node_refs_hash: this.require_node_digest(world_id).digest(),
      edge_refs_hash: this.require_edge_digest(world_id).digest()
    };
    world.content_hash = hash_canonical(projection);
    world.updated_at = this.now;
    return world.content_hash;
  }
  /** Recompute a world's embedding (children first) and return it. */
  compose_world_embedding(world_id, recurse = true) {
    const world = this.require_world(world_id);
    this.track_world(world_id);
    if (recurse) {
      for (const child_id of world.child_world_ids) this.compose_world_embedding(child_id, true);
    }
    const vector = compose_world_embedding(
      world,
      {
        dim: this.dim,
        node_vector: (id) => this.node_vector(id),
        child_world_vector: (id) => this.worlds.get(id)?.world_vector ?? null
      },
      this.embedding_weights
    );
    world.world_vector = vector;
    return vector;
  }
  // ---- internals -------------------------------------------------------
  require_world(world_id) {
    const world = this.worlds.get(world_id);
    if (!world) throw new Error(`WorldGraph: world not found: ${world_id}`);
    return world;
  }
  rebuild_name_index() {
    this.world_ids_by_name.clear();
    for (const world of this.worlds.values()) {
      const normalized_name = world.name.toLowerCase();
      if (!this.world_ids_by_name.has(normalized_name)) this.world_ids_by_name.set(normalized_name, world.id);
    }
  }
  initialize_membership(world) {
    this.node_digests.set(world.id, new incremental_set_digest(world.node_refs));
    this.edge_digests.set(world.id, new incremental_set_digest(world.edge_refs));
    const children = new incremental_map_digest();
    for (const child_id of world.child_world_ids) children.set(child_id, this.worlds.get(child_id)?.content_hash ?? "");
    this.child_digests.set(world.id, children);
  }
  require_node_digest(world_id) {
    const digest = this.node_digests.get(world_id);
    if (!digest) throw new Error(`WorldGraph: node digest not found: ${world_id}`);
    return digest;
  }
  require_edge_digest(world_id) {
    const digest = this.edge_digests.get(world_id);
    if (!digest) throw new Error(`WorldGraph: edge digest not found: ${world_id}`);
    return digest;
  }
  require_child_digest(world_id) {
    const digest = this.child_digests.get(world_id);
    if (!digest) throw new Error(`WorldGraph: child digest not found: ${world_id}`);
    return digest;
  }
  track_world(world_id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.worlds.has(world_id)) {
        const world = this.worlds.get(world_id);
        checkpoint.worlds.set(world_id, world ? clone_world(world) : void 0);
      }
    }
  }
  track_primary(node_id) {
    for (const checkpoint of this.checkpoints) {
      if (!checkpoint.primary_worlds.has(node_id)) checkpoint.primary_worlds.set(node_id, this.primary_worlds.get(node_id));
    }
  }
  /** Recompute hashes from a world up to the root so parents pick up changes. */
  propagate_from(world_id) {
    let current = world_id;
    const seen = /* @__PURE__ */ new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const hash2 = this.recompute_world_hash(current);
      const parent_id = this.worlds.get(current)?.parent_world_id ?? null;
      if (parent_id) this.require_child_digest(parent_id).set(current, hash2);
      current = parent_id;
    }
  }
};
function clone_world(world) {
  return {
    ...world,
    scope_path: [...world.scope_path],
    ontology: structuredClone(world.ontology),
    contracts: structuredClone(world.contracts),
    child_world_ids: [...world.child_world_ids],
    node_refs: [...world.node_refs],
    edge_refs: [...world.edge_refs],
    world_vector: world.world_vector ? [...world.world_vector] : null,
    metadata: structuredClone(world.metadata)
  };
}

// LongMemory-main/LongMemory-main/src/core/engine/ingest_engine.ts
var result_sketch_operations = /* @__PURE__ */ new WeakMap();
function sketch_operations_for(result) {
  return result_sketch_operations.get(result) ?? [];
}
function relation_edge(type, from, to, at) {
  return create_hydro_edge({
    from,
    to,
    type,
    confidence: 0.9,
    weight: 1,
    temporal: { valid_from: at, valid_to: null, observed_at: at, recorded_at: at },
    handler: { handler: type, params: {} },
    provenance: manual_provenance("ingest", at)
  });
}
function node_claims(node) {
  return node.content.claims ?? extract_claims(node.content.raw);
}
function claim_by_topic(node, topic) {
  return node_claims(node).find((claim) => claim.topic === topic);
}
function relationship_key(world_id, user_id, value) {
  return JSON.stringify([world_id, user_id, value]);
}
var IngestEngine = class {
  graph;
  resolver;
  worlds;
  worlddb;
  index;
  sketches;
  working;
  edge_registry;
  auto_consolidate;
  now;
  root_world_id;
  current_claim_nodes = /* @__PURE__ */ new Map();
  grounding_nodes = /* @__PURE__ */ new Map();
  conversation_nodes = /* @__PURE__ */ new Map();
  conversation_members = /* @__PURE__ */ new Set();
  relationship_graph_revision = -1;
  constructor(options = {}) {
    this.now = options.now ?? (() => Date.now());
    const at = this.now();
    this.graph = options.graph ?? new DurableGraph();
    this.resolver = options.resolver ?? new EntityResolver({ now: at });
    this.worlds = options.worlds ?? new WorldGraph({ now: at, dim: options.vector_dimension ?? 8 });
    this.worlddb = options.worlddb ?? new InMemoryWorldDB(this.now);
    this.index = options.index ?? new InMemoryRecallIndex([]);
    this.sketches = options.sketches ?? new MemorySketches({ vector_dimension: options.vector_dimension ?? 8 });
    this.working = options.working ?? new WorkingMemory(options.working_memory_capacity ?? 128);
    this.edge_registry = options.edge_registry ?? default_edge_registry();
    this.auto_consolidate = options.auto_consolidate ?? false;
    const existing_root = this.worlds.world_list().find((world) => world.parent_world_id === null);
    this.root_world_id = existing_root?.id ?? this.worlds.create_world({ name: "Memory", zone: "mixed", at }).id;
    this.rebuild_relationship_indexes();
  }
  ingest(event) {
    const transaction = new IngestTransaction({
      graph: this.graph,
      resolver: this.resolver,
      worlds: this.worlds,
      worlddb: this.worlddb,
      index: this.index,
      sketches: this.sketches,
      working: this.working
    }, { snapshot_sketches: false, incremental: true });
    return transaction.run(() => this.ingest_atomic(event));
  }
  ingest_atomic(event) {
    const trace = [];
    const at = event.at ?? this.now();
    trace.push({ step: 1, name: "accept", detail: `accepted raw event ${event.id ?? "(content-addressed)"}` });
    const working_entry = this.working.push(event, at);
    trace.push({ step: 2, name: "working_memory", detail: `buffered sequence ${working_entry.sequence}` });
    const parsed = parse_perception(event, at);
    trace.push({ step: 3, name: "parse", detail: `${parsed.entities.length} entities, ${parsed.claims.length} claims, zone ${parsed.zone}` });
    const resolved = parsed.entities.map((mention) => ({ mention, result: resolve_multilingual_entity(this.resolver, mention) }));
    trace.push({ step: 4, name: "entity_resolution", detail: resolved.map((item) => `${item.mention.name}->${item.result.entity.id}`).join(", ") || "no entities" });
    const facets = extract_facets(parsed);
    trace.push({ step: 5, name: "facets", detail: Object.entries(facets).filter(([, value]) => value !== null).map(([name]) => name).join(", ") });
    const world = this.select_world(parsed);
    trace.push({ step: 6, name: "world", detail: `${world.name} (${world.id})` });
    const fact = parsed.zone === "exocortex" ? this.create_fact(parsed) : null;
    const grounding = this.find_grounding(parsed, fact);
    const contract = this.contract_for(parsed, world, grounding !== null);
    const draft = this.create_node(
      parsed,
      facets,
      world,
      contract,
      fact,
      grounding,
      resolved.map(({ mention, result: result2 }) => ({ id: result2.entity.id, name: result2.entity.canonical_name, mention: mention.name }))
    );
    trace.push({ step: 7, name: "node_staged", detail: `${draft.id} created after entity resolution` });
    const existing = this.graph.get_node(draft.id);
    if (existing) {
      if (existing.content_hash !== draft.content_hash || existing.world.world_id !== draft.world.world_id || (existing.metadata.user_id ?? existing.provenance.created_by) !== parsed.event.user_id) {
        throw new Error(`ingest: refusing identity or scope change for ${draft.id}`);
      }
      trace.push({ step: 14, name: "memory_diff", detail: "existing durable event reused; lifecycle preserved" });
      return {
        node: existing,
        changed_nodes: [],
        nodes: [],
        edges: [],
        trace,
        diff: {
          created_node_ids: [],
          updated_node_ids: [],
          created_edge_ids: [],
          resolved_entities: [],
          world_ids: [existing.world.world_id],
          worlddb_refs: [],
          index_updates: [],
          sketch_updates: [],
          consolidated_node_ids: []
        }
      };
    }
    if (fact) this.worlddb.upsert(fact);
    const staged_edges = this.relationships_for(draft, parsed, grounding);
    const context_nodes = this.auto_consolidate ? this.graph.node_list() : [...new Set(staged_edges.flatMap((edge) => [edge.from, edge.to]))].flatMap((id) => this.graph.get_node(id) ?? []);
    const context = new EdgeContext({ now: at, nodes: context_nodes });
    context.add_node(draft);
    for (const edge of staged_edges) insert_edge(edge, context, this.edge_registry);
    trace.push({ step: 8, name: "edges_executed", detail: staged_edges.map((edge) => edge.type).join(", ") || "none" });
    trace.push({ step: 9, name: "bitemporal_mvcc", detail: `valid ${parsed.valid_from}..${parsed.valid_to ?? "open"}, recorded ${parsed.at}` });
    trace.push({ step: 10, name: "grounding", detail: grounding ? `attached ${grounding.ref}` : "no external grounding attached" });
    trace.push({ step: 11, name: "contract", detail: `reasoning=${contract.use_for_reasoning}, requires_grounding=${contract.requires_grounding}` });
    const sketch_operations = this.sketch_operations(parsed, world, resolved, staged_edges);
    trace.push({ step: 12, name: "indexes_and_sketches", detail: `indexed ${draft.id}; updated ${resolved.length} entity frequencies` });
    const consolidated_ids = [];
    if (this.auto_consolidate) {
      const consolidated = consolidate_memories(context.node_list(), {
        now: at,
        contradictions: context.unresolved_contradictions(),
        worlddb: this.worlddb
      });
      for (const node of consolidated.memories) {
        context.add_node(node);
        consolidated_ids.push(node.id);
      }
      for (const edge of consolidated.edges) {
        insert_edge(edge, context, this.edge_registry);
        staged_edges.push(edge);
      }
    }
    trace.push({ step: 13, name: "consolidation", detail: this.auto_consolidate ? `${consolidated_ids.length} derived nodes` : "disabled" });
    const changed_nodes = context.changed_node_list();
    const created = changed_nodes.filter((node) => !this.graph.has_node(node.id)).map((node) => node.id);
    const updated = changed_nodes.filter((node) => this.graph.has_node(node.id)).map((node) => node.id);
    const created_edges = staged_edges.filter((edge) => !this.graph.get_edge(edge.id));
    for (const node of changed_nodes) this.graph.apply_node_version(node);
    for (const edge of staged_edges) this.graph.add_edge(edge);
    for (const node of changed_nodes) this.index.add(node);
    this.worlds.add_node_to_world(world.id, draft.id);
    for (const id of consolidated_ids) this.worlds.add_node_to_world(world.id, id);
    for (const edge of staged_edges) this.worlds.add_edge_to_world(world.id, edge.id);
    this.apply_sketch_operations(sketch_operations);
    for (const node of changed_nodes) this.register_relationship_node(node);
    this.relationship_graph_revision = this.graph.revision;
    const committed = this.graph.get_node(draft.id);
    const diff = {
      created_node_ids: created,
      updated_node_ids: updated,
      created_edge_ids: created_edges.map((edge) => edge.id),
      resolved_entities: resolved.map((item) => ({ mention: item.mention.name, id: item.result.entity.id, action: item.result.action })),
      world_ids: [world.id],
      worlddb_refs: fact ? [fact.ref] : grounding ? [grounding.ref] : [],
      index_updates: [.../* @__PURE__ */ new Set([...created, ...updated])],
      sketch_updates: [
        ...resolved.map((item) => `entities:${item.result.entity.id}`),
        ...(parsed.event.tags ?? []).map((tag) => `tags:${tag}`),
        ...staged_edges.map((edge) => `relations:${edge.type}`),
        `worlds:${world.id}`,
        ...parsed.claims.map((claim) => `patterns:${claim.topic}`)
      ],
      consolidated_node_ids: consolidated_ids
    };
    trace.push({ step: 14, name: "memory_diff", detail: `${created.length} created, ${updated.length} updated, ${created_edges.length} edges` });
    const created_set = new Set(created);
    const result = {
      node: committed,
      changed_nodes,
      nodes: changed_nodes.filter((node) => created_set.has(node.id)),
      edges: created_edges,
      diff,
      trace
    };
    result_sketch_operations.set(result, sketch_operations);
    return result;
  }
  select_world(parsed) {
    if (parsed.event.world_id) {
      const selected = this.worlds.get_world(parsed.event.world_id);
      if (!selected) throw new Error(`unknown world: ${parsed.event.world_id}`);
      return selected;
    }
    const name = parsed.event.world ?? `${parsed.event.user_id}:${parsed.zone}`;
    const existing = this.worlds.get_world_by_name(name);
    return existing ?? this.worlds.create_child_world(this.root_world_id, {
      name,
      zone: parsed.zone,
      at: parsed.at
    }, { defer_hash: true });
  }
  create_fact(parsed) {
    const source = parsed.event.source ?? { id: "manual-external", kind: "manual", reliability: 0.7 };
    return create_exocortex_fact({
      ref: parsed.event.grounding_ref,
      statement: parsed.text,
      source,
      vector: parsed.event.vector ?? null,
      observed_at: parsed.observed_at,
      valid_from: parsed.valid_from,
      valid_to: parsed.valid_to,
      metadata: { ...parsed.event.metadata, user_id: parsed.event.user_id }
    });
  }
  find_grounding(parsed, fact) {
    if (fact) return fact;
    if (parsed.event.grounding_ref) return this.worlddb.get(parsed.event.grounding_ref);
    return this.worlddb.search(parsed.text)[0] ?? null;
  }
  contract_for(parsed, world, grounded) {
    const inherited = this.worlds.resolve_contracts(world.id);
    const factual = parsed.claims.some((claim) => claim.kind === "fact");
    return {
      ...default_contract(),
      ...inherited,
      requires_grounding: parsed.zone === "endocortex" && factual ? true : inherited.requires_grounding,
      source_required: parsed.zone === "exocortex" || grounded || inherited.source_required,
      ...parsed.event.contract
    };
  }
  create_node(parsed, facets, world, contract, fact, grounding, resolved_entities) {
    const input = {
      id: parsed.event.id ?? fact?.ref,
      content: {
        raw: parsed.multilingual.original_text,
        canonical: parsed.multilingual.normalization.canonical_text,
        summary: summarize_claims(parsed.claims, parsed.claims.length, {
          speaker: parsed.event.speaker,
          observed_at: parsed.observed_at
        }) || parsed.multilingual.normalization.canonical_text,
        claims: parsed.claims,
        language: parsed.multilingual.language,
        script: parsed.multilingual.script.script,
        direction: parsed.multilingual.script.direction,
        original_text: parsed.multilingual.original_text,
        canonical_text: parsed.multilingual.normalization.canonical_text,
        translated_text: parsed.multilingual.translated_text,
        transliteration: parsed.multilingual.transliteration,
        locale: parsed.multilingual.locale,
        code_switch_segments: parsed.multilingual.code_switch_segments,
        language_confidence: parsed.multilingual.language_confidence,
        translation_provenance: parsed.multilingual.translation_provenance
      },
      facets,
      world: {
        world_id: world.id,
        parent_world_id: world.parent_world_id,
        zone: parsed.zone,
        scope_path: world.scope_path
      },
      temporal: {
        valid_from: parsed.valid_from,
        valid_to: parsed.valid_to,
        observed_at: parsed.observed_at,
        recorded_at: parsed.at,
        superseded_at: null
      },
      contract,
      grounding: {
        worlddb_ref: grounding?.ref ?? null,
        source_ids: grounding ? [grounding.source.id] : [],
        grounding_score: grounding?.source.reliability ?? 0
      },
      state: default_node_state(),
      vectors: { semantic: parsed.event.vector ?? null, type_vector: null, world_vector: world.world_vector },
      provenance: {
        ...manual_provenance(parsed.event.source?.id ?? parsed.event.user_id, parsed.observed_at),
        source_trace: [{ source_id: parsed.event.source?.id ?? parsed.event.user_id, ref: parsed.event.source_ref ?? null, at: parsed.observed_at }]
      },
      metadata: {
        ...parsed.event.metadata ?? {},
        user_id: parsed.event.user_id,
        ...parsed.event.conversation_id ? { conversation_id: parsed.event.conversation_id } : {},
        resolved_entities,
        ...parsed.event.speaker ? { speaker: parsed.event.speaker } : {}
      }
    };
    return create_hydro_node(input);
  }
  relationships_for(draft, parsed, grounding) {
    this.ensure_relationship_indexes();
    const edges = [];
    const behavior = parsed.event.conflict_behavior ?? "auto";
    if (behavior !== "none") {
      const conflicted_targets = /* @__PURE__ */ new Set();
      for (const incoming of parsed.claims) {
        const related_id = this.current_claim_nodes.get(relationship_key(draft.world.world_id, parsed.event.user_id, incoming.topic));
        if (!related_id || conflicted_targets.has(related_id)) continue;
        const related_node = this.graph.get_node(related_id);
        const related_claim = related_node ? claim_by_topic(related_node, incoming.topic) : void 0;
        if (related_node && related_claim && related_node.state.status === "active" && related_node.temporal.superseded_at === null && (behavior !== "auto" || parsed.valid_from >= related_node.temporal.valid_from) && claims_conflict(incoming, related_claim)) {
          const type = behavior === "supersede" ? "supersedes" : behavior === "contradict" ? "contradicts" : incoming.kind === "preference" || parsed.zone === "exocortex" ? "supersedes" : "contradicts";
          edges.push(relation_edge(type, draft.id, related_node.id, parsed.at));
          conflicted_targets.add(related_id);
        }
      }
    }
    if (parsed.zone === "endocortex" && grounding) {
      const target_id = this.grounding_nodes.get(grounding.ref);
      const target = target_id ? this.graph.get_node(target_id) : void 0;
      if (target) edges.push(relation_edge("grounds", draft.id, target.id, parsed.at));
    }
    const conversation_id = parsed.event.conversation_id;
    if (conversation_id) {
      const previous = this.previous_conversation_node(relationship_key(draft.world.world_id, parsed.event.user_id, conversation_id), parsed.observed_at, draft.id);
      if (previous) edges.push(relation_edge("refers_to", draft.id, previous.id, parsed.at));
    }
    return edges;
  }
  register_relationship_node(node) {
    if (node.state.status === "active" && node.temporal.superseded_at === null) {
      for (const claim of node_claims(node)) {
        const key2 = relationship_key(node.world.world_id, node.metadata.user_id ?? node.provenance.created_by, claim.topic);
        const prior_id = this.current_claim_nodes.get(key2);
        const prior = prior_id ? this.graph.get_node(prior_id) : void 0;
        if (!prior || prior.state.status !== "active" || prior.temporal.superseded_at !== null || prior.temporal.valid_from < node.temporal.valid_from || prior.temporal.valid_from === node.temporal.valid_from && prior.temporal.observed_at <= node.temporal.observed_at) {
          this.current_claim_nodes.set(key2, node.id);
        }
      }
    }
    if (node.world.zone === "exocortex" && node.grounding.worlddb_ref) this.grounding_nodes.set(node.grounding.worlddb_ref, node.id);
    const conversation_id = typeof node.metadata.conversation_id === "string" ? node.metadata.conversation_id : "";
    if (!conversation_id) return;
    const key = relationship_key(node.world.world_id, node.metadata.user_id ?? node.provenance.created_by, conversation_id);
    const values = this.conversation_nodes.get(key) ?? [];
    if (this.conversation_members.has(node.id)) {
      const existing = values.at(-1)?.id === node.id ? values.length - 1 : values.findIndex((item) => item.id === node.id);
      if (existing >= 0) values.splice(existing, 1);
    }
    this.conversation_members.add(node.id);
    if (!values.length || values[values.length - 1].temporal.observed_at <= node.temporal.observed_at) {
      values.push(node);
      this.conversation_nodes.set(key, values);
      return;
    }
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if (values[middle].temporal.observed_at <= node.temporal.observed_at) low = middle + 1;
      else high = middle;
    }
    values.splice(low, 0, node);
    this.conversation_nodes.set(key, values);
  }
  previous_conversation_node(conversation_id, observed_at, exclude_id) {
    const values = this.conversation_nodes.get(conversation_id) ?? [];
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if (values[middle].temporal.observed_at <= observed_at) low = middle + 1;
      else high = middle;
    }
    if (low > 0 && values[low - 1].id === exclude_id) low--;
    return low > 0 ? values[low - 1] : void 0;
  }
  ensure_relationship_indexes() {
    if (this.relationship_graph_revision !== this.graph.revision) this.rebuild_relationship_indexes();
  }
  rebuild_relationship_indexes() {
    this.current_claim_nodes.clear();
    this.grounding_nodes.clear();
    this.conversation_nodes.clear();
    this.conversation_members.clear();
    for (const node of this.graph.node_list().sort((left, right) => left.temporal.observed_at - right.temporal.observed_at)) {
      this.register_relationship_node(node);
    }
    this.relationship_graph_revision = this.graph.revision;
  }
  sketch_operations(parsed, world, resolved, edges) {
    const operations = [
      ...resolved.map((item) => ({ type: "frequency", domain: "entities", key: item.result.entity.id })),
      ...(parsed.event.tags ?? []).map((tag) => ({ type: "frequency", domain: "tags", key: tag })),
      ...edges.map((edge) => ({ type: "frequency", domain: "relations", key: edge.type })),
      ...parsed.claims.map((claim) => ({ type: "frequency", domain: "patterns", key: claim.topic })),
      { type: "frequency", domain: "worlds", key: world.id }
    ];
    const vector = parsed.event.vector;
    if (vector && vector.length === this.sketches.options.vector_dimension) {
      if (!vector.every(Number.isFinite)) throw new Error("event vector must contain finite values");
      operations.push({ type: "world", id: world.id, vector });
      operations.push(...resolved.map((item) => ({ type: "drift", id: item.result.entity.id, vector })));
    }
    return operations;
  }
  apply_sketch_operations(operations) {
    for (const operation of operations) this.sketches.apply_operation(operation);
  }
};

// LongMemory-main/LongMemory-main/src/core/invariants.ts
var hydrograph_invariants = [
  "durable nodes are immutable",
  "every durable node is content-addressed",
  "every durable fact is bitemporal",
  "edges are executable",
  "subjective memory and external world truth are separate",
  "worlds are recursive containers, not flat sectors",
  "facets are cognitive attributes, not storage buckets",
  "strict recall cannot use superseded facts",
  "strict recall cannot use unresolved contradictions",
  "world-grounded recall requires grounding",
  "associative recall may use superseded/emotional residue but must label it",
  "compression cannot override truth",
  "api server and cli must use the same createMemory engine",
  "benchmarks define correctness"
];

// LongMemory-main/LongMemory-main/src/core/math/decay.ts
function retention(s) {
  return sigmoid(
    s.importance + s.surprise + s.grounding + s.emotional_intensity + s.utility + s.confirmation - s.noise
  );
}
function decay_rate(i) {
  return i.base_lambda * (1 + i.noise + i.conflict) / (1 + i.retention + i.reinforcement);
}

// LongMemory-main/LongMemory-main/src/core/memory/decay_engine.ts
var day_ms3 = 864e5;
var default_decay_policy = Object.freeze({
  hot_lambda: 5e-3,
  warm_lambda: 0.02,
  cold_lambda: 0.05,
  hot_days: 7,
  warm_days: 30,
  activation_floor: 0.05,
  reinforcement_gain: 0.2
});
var policy = (overrides = {}) => {
  const value = { ...default_decay_policy, ...overrides };
  if (![value.hot_lambda, value.warm_lambda, value.cold_lambda].every((item) => Number.isFinite(item) && item >= 0)) {
    throw new Error("decay lambdas must be finite non-negative numbers");
  }
  if (!Number.isFinite(value.hot_days) || !Number.isFinite(value.warm_days) || value.hot_days < 0 || value.warm_days < value.hot_days) {
    throw new Error("decay tier windows must be finite and ordered");
  }
  if (!Number.isFinite(value.activation_floor) || value.activation_floor < 0 || value.activation_floor > 1) {
    throw new Error("activation_floor must be between 0 and 1");
  }
  if (!Number.isFinite(value.reinforcement_gain) || value.reinforcement_gain < 0 || value.reinforcement_gain > 1) {
    throw new Error("reinforcement_gain must be between 0 and 1");
  }
  return value;
};
var reinforcement_count = (node) => Math.max(0, node.state.reinforcement_count ?? 0);
var reference_at = (node) => node.state.last_reinforced_at ?? node.temporal.observed_at;
var tier_at = (node, at, cfg) => {
  const age_days = Math.max(0, at - reference_at(node)) / day_ms3;
  const strong = reinforcement_count(node) >= 3 || node.state.salience >= 0.75;
  if (strong && age_days < cfg.hot_days) return "hot";
  if (age_days < cfg.warm_days) return "warm";
  return "cold";
};
var node_retention = (node) => retention({
  importance: clamp01(node.state.salience),
  surprise: 0,
  grounding: clamp01(node.grounding.grounding_score),
  emotional_intensity: clamp01(node.facets.emotional?.weight ?? 0),
  utility: clamp01(node.facets.procedural?.weight ?? 0),
  confirmation: clamp01(node.grounding.source_ids.length / 3),
  noise: clamp01(1 - node.state.confidence)
});
var rate_for = (node, tier, keep, cfg) => decay_rate({
  base_lambda: tier === "hot" ? cfg.hot_lambda : tier === "warm" ? cfg.warm_lambda : cfg.cold_lambda,
  noise: clamp01(1 - node.state.confidence),
  conflict: node.state.status === "contradicted" ? 1 : 0,
  retention: keep,
  reinforcement: Math.min(2, Math.log1p(reinforcement_count(node)) / 2)
});
function project_node_decay(node, at, overrides = {}) {
  if (!Number.isFinite(at)) throw new Error("decay time must be finite");
  const cfg = policy(overrides);
  const anchor = node.state.decay_updated_at ?? node.temporal.observed_at;
  const end = Math.max(anchor, at);
  const elapsed_days = (end - anchor) / day_ms3;
  const keep = node_retention(node);
  const reference = reference_at(node);
  const boundaries = [anchor, end, reference + cfg.hot_days * day_ms3, reference + cfg.warm_days * day_ms3].filter((value) => value > anchor && value < end).sort((left, right) => left - right);
  const points = [anchor, ...boundaries, end];
  let exponent = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const stop2 = points[index + 1];
    const tier2 = tier_at(node, start + (stop2 - start) / 2, cfg);
    exponent += rate_for(node, tier2, keep, cfg) * ((stop2 - start) / day_ms3);
  }
  const floor = cfg.activation_floor;
  const initial = Math.max(floor, clamp01(node.state.activation));
  const activation2 = floor + (initial - floor) * Math.exp(-exponent);
  const tier = tier_at(node, end, cfg);
  return {
    activation: clamp01(activation2),
    decay_rate: rate_for(node, tier, keep, cfg),
    elapsed_days,
    retention: keep,
    tier
  };
}
function decay_node(node, at, overrides = {}) {
  const projected = project_node_decay(node, at, overrides);
  return {
    ...node,
    state: {
      ...node.state,
      activation: projected.activation,
      decay_rate: projected.decay_rate,
      decay_updated_at: Math.max(node.state.decay_updated_at ?? node.temporal.observed_at, at)
    }
  };
}
function reinforce_node(node, at, amount, overrides = {}) {
  const cfg = policy(overrides);
  const gain = amount ?? cfg.reinforcement_gain;
  if (!Number.isFinite(at)) throw new Error("reinforcement time must be finite");
  if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error("reinforcement amount must be between 0 and 1");
  const effective_at = Math.max(node.state.decay_updated_at ?? node.temporal.observed_at, at);
  const projected = project_node_decay(node, effective_at, cfg);
  const activation2 = projected.activation + gain * (1 - projected.activation);
  const reinforced = {
    ...node,
    state: {
      ...node.state,
      activation: clamp01(activation2),
      decay_updated_at: effective_at,
      last_reinforced_at: effective_at,
      reinforcement_count: reinforcement_count(node) + 1
    }
  };
  return {
    ...reinforced,
    state: { ...reinforced.state, decay_rate: project_node_decay(reinforced, effective_at, cfg).decay_rate }
  };
}

// LongMemory-main/LongMemory-main/src/core/math/activation.ts
var default_decay = 0.5;
function base_activation(time_since_accesses, d = default_decay) {
  let sum = 0;
  for (const t of time_since_accesses) {
    const tt = Math.max(1e-6, t);
    sum += Math.pow(tt, -d);
  }
  if (sum <= 0) return Number.NEGATIVE_INFINITY;
  return Math.log(sum);
}
function activation(t) {
  return t.base + t.context_association + t.task_relevance + t.grounding_relevance - t.contradiction_penalty;
}
function compute_activation(time_since_accesses, terms, d = default_decay) {
  return activation({ base: base_activation(time_since_accesses, d), ...terms });
}

// LongMemory-main/LongMemory-main/src/core/types/recall_mode.ts
var default_gate_thresholds = {
  min_confidence: 0.5,
  grounding_threshold: 0.6,
  min_freshness: 0.3,
  min_source_reliability: 0.5
};

// LongMemory-main/LongMemory-main/src/core/recall/activation_spread.ts
var default_alpha = 0.8;
var default_max_hops = 2;
var default_min_activation = 1e-3;
var default_relation_weights = {
  refers_to: 1,
  supports: 0.9,
  derived_from: 0.75,
  same_as: 0.65,
  grounds: 0.55,
  supersedes: 0.35,
  contradicts: 0.25,
  semantic_shift: 0.2
};
function build_transitions(edges, bidirectional, relation_weights) {
  const raw = /* @__PURE__ */ new Map();
  const push = (from, to, weight) => {
    if (weight <= 0 || from === to) return;
    const list = raw.get(from) ?? [];
    list.push({ to, weight });
    raw.set(from, list);
  };
  for (const edge of edges) {
    const relation = relation_weights[edge.type] ?? 0.2;
    const w = relation * Math.max(0, edge.weight) * Math.max(0, Math.min(1, edge.confidence));
    push(edge.from, edge.to, w);
    if (bidirectional) push(edge.to, edge.from, w);
  }
  const degree = /* @__PURE__ */ new Map();
  for (const [from, list] of raw) {
    degree.set(from, (degree.get(from) ?? 0) + list.reduce((sum, item) => sum + item.weight, 0));
    for (const item of list) degree.set(item.to, degree.get(item.to) ?? 0);
  }
  const normalized = /* @__PURE__ */ new Map();
  for (const [from, list] of raw) {
    const from_degree = degree.get(from) ?? 0;
    if (from_degree <= 0) continue;
    normalized.set(
      from,
      list.map((item) => ({
        to: item.to,
        weight: item.weight / Math.sqrt(from_degree * Math.max(epsilon, degree.get(item.to) ?? 0))
      }))
    );
  }
  return normalized;
}
function build_legacy_transitions(edges, bidirectional) {
  const raw = /* @__PURE__ */ new Map();
  const push = (from, to, weight) => {
    if (weight <= 0 || from === to) return;
    const list = raw.get(from) ?? [];
    list.push({ to, weight });
    raw.set(from, list);
  };
  for (const edge of edges) {
    const weight = Math.max(0, edge.weight) * Math.max(0, Math.min(1, edge.confidence));
    push(edge.from, edge.to, weight);
    if (bidirectional) push(edge.to, edge.from, weight);
  }
  const normalized = /* @__PURE__ */ new Map();
  for (const [from, list] of raw) {
    const total = list.reduce((sum, item) => sum + item.weight, 0);
    if (total > 0) normalized.set(from, list.map((item) => ({ to: item.to, weight: item.weight / total })));
  }
  return normalized;
}
var epsilon = 1e-12;
function distribution(values) {
  const positive = [...values].filter((value) => value > 0 && Number.isFinite(value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { entropy: 0, peak: 0 };
  let entropy = 0;
  let peak = 0;
  for (const value of positive) {
    const probability = value / total;
    entropy -= probability * Math.log(probability);
    if (probability > peak) peak = probability;
  }
  return { entropy: positive.length > 1 ? entropy / Math.log(positive.length) : 0, peak };
}
function bounded_neighbourhood(seeds, transitions, max_hops) {
  const allowed = new Set(seeds);
  const frontier_by_hop = [[...seeds]];
  let frontier = [...seeds];
  for (let hop = 1; hop <= max_hops; hop++) {
    const next = [];
    for (const node of frontier) {
      for (const t of transitions.get(node) ?? []) {
        if (!allowed.has(t.to)) {
          allowed.add(t.to);
          next.push(t.to);
        }
      }
    }
    frontier_by_hop.push(next);
    if (next.length === 0) break;
    frontier = next;
  }
  return { allowed, frontier_by_hop };
}
function spread_activation(seeds, edges, options = {}) {
  const alpha = options.alpha ?? default_alpha;
  const max_hops = Math.max(0, options.max_hops ?? default_max_hops);
  const min_activation = options.min_activation ?? default_min_activation;
  const bidirectional = options.bidirectional ?? true;
  const transitions = build_transitions(edges, bidirectional, { ...default_relation_weights, ...options.relation_weights });
  const seed_ids = [...seeds.keys()];
  const { allowed, frontier_by_hop } = bounded_neighbourhood(seed_ids, transitions, max_hops);
  const seed_total = [...seeds.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  const seed_of = (id) => seed_total > 0 ? Math.max(0, seeds.get(id) ?? 0) / seed_total : 0;
  let current = /* @__PURE__ */ new Map();
  for (const id of allowed) current.set(id, seed_of(id));
  const accumulated = /* @__PURE__ */ new Map();
  for (let hop = 0; hop <= max_hops; hop++) {
    for (const [id, value] of current) accumulated.set(id, (accumulated.get(id) ?? 0) + (1 - alpha) * value);
    if (hop === max_hops) break;
    const next = /* @__PURE__ */ new Map();
    for (const [from, act] of current) {
      if (act === 0) continue;
      for (const t of transitions.get(from) ?? []) {
        if (!allowed.has(t.to)) continue;
        next.set(t.to, (next.get(t.to) ?? 0) + alpha * t.weight * act);
      }
    }
    current = next;
  }
  const spread_distribution = distribution(accumulated.values());
  const max_entropy = options.max_entropy ?? 0.9;
  const bypassed = accumulated.size > Math.max(8, seeds.size * 4) && spread_distribution.entropy > max_entropy;
  const activation2 = /* @__PURE__ */ new Map();
  const maximum = Math.max(0, ...accumulated.values());
  if (!bypassed && maximum > 0) {
    for (const [id, value] of accumulated) {
      const normalized = value / maximum;
      if (normalized >= min_activation) activation2.set(id, normalized);
    }
  }
  return {
    activation: activation2,
    hops: max_hops,
    visited: [...allowed],
    frontier_by_hop,
    entropy: spread_distribution.entropy,
    peak: spread_distribution.peak,
    bypassed
  };
}
function legacy_spread_activation(seeds, edges, options = {}) {
  const alpha = options.alpha ?? default_alpha;
  const max_hops = Math.max(0, options.max_hops ?? default_max_hops);
  const min_activation = options.min_activation ?? default_min_activation;
  const bidirectional = options.bidirectional ?? true;
  const transitions = build_legacy_transitions(edges, bidirectional);
  const seed_ids = [...seeds.keys()];
  const { allowed, frontier_by_hop } = bounded_neighbourhood(seed_ids, transitions, max_hops);
  const seed_of = (id) => seeds.get(id) ?? 0;
  let current = /* @__PURE__ */ new Map();
  for (const id of allowed) current.set(id, seed_of(id));
  for (let hop = 0; hop < max_hops; hop++) {
    const incoming = /* @__PURE__ */ new Map();
    for (const [from, activation3] of current) {
      if (activation3 === 0) continue;
      for (const transition of transitions.get(from) ?? []) {
        if (!allowed.has(transition.to)) continue;
        incoming.set(transition.to, (incoming.get(transition.to) ?? 0) + transition.weight * activation3);
      }
    }
    const next = /* @__PURE__ */ new Map();
    for (const id of allowed) next.set(id, (1 - alpha) * seed_of(id) + alpha * (incoming.get(id) ?? 0));
    current = next;
  }
  const activation2 = /* @__PURE__ */ new Map();
  for (const [id, value] of current) if (value >= min_activation) activation2.set(id, value);
  const summary = distribution(activation2.values());
  return {
    activation: activation2,
    hops: max_hops,
    visited: [...allowed],
    frontier_by_hop,
    entropy: summary.entropy,
    peak: summary.peak,
    bypassed: false
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/evidence.ts
function memory_status_of(node) {
  if (node.temporal.superseded_at !== null || node.state.status === "superseded") return "superseded";
  if (node.state.status === "contradicted") return "contradicted";
  return "current";
}
function memory_speaker_of(node) {
  const speaker = node.metadata.speaker ?? node.metadata.role;
  return typeof speaker === "string" && speaker.trim() ? speaker.trim() : null;
}
function iso_date(at) {
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : "undated";
}
function present_claim(claim) {
  return claim.statement.trim() || render_claim(claim);
}
function claim_body(node, query_terms, max_claims) {
  const claims = node.content.claims ?? [];
  if (claims.length === 0) return "";
  const terms = new Set(query_terms.map((term) => term.toLowerCase()));
  const seen = /* @__PURE__ */ new Set();
  const unique = claims.map((claim, order) => ({ text: present_claim(claim), order })).filter((claim) => claim.text && !seen.has(claim.text) && Boolean(seen.add(claim.text)));
  const scored = unique.map(({ text, order }) => {
    let overlap = 0;
    for (const token of new Set(strict_recall_tokens(text))) if (terms.has(token)) overlap++;
    return { text, overlap, order };
  });
  scored.sort((left, right) => right.overlap - left.overlap || left.order - right.order);
  const relevant = scored.filter((claim) => claim.overlap > 0);
  const inferential_query = [...terms].some((term) => ["why", "how", "career", "besides", "activities", "all", "always", "every", "ever"].includes(term));
  const neighbour_orders = /* @__PURE__ */ new Set();
  if (inferential_query) {
    for (const claim of relevant) {
      neighbour_orders.add(claim.order - 1);
      neighbour_orders.add(claim.order + 1);
    }
  }
  const selected = relevant.length ? [
    ...relevant,
    ...scored.filter((claim) => claim.overlap === 0 && neighbour_orders.has(claim.order)).sort((left, right) => left.order - right.order),
    ...scored.filter((claim) => claim.overlap === 0 && !neighbour_orders.has(claim.order)).sort((left, right) => left.order - right.order)
  ] : scored;
  return selected.slice(0, max_claims).map((claim) => claim.text).join("; ");
}
function memory_evidence_text(node, options = {}) {
  const body = options.prefer_raw ? node.content.raw : claim_body(node, options.query_terms ?? [], options.max_claims ?? 8) || node.content.summary || node.content.canonical || node.content.raw;
  const status = memory_status_of(node);
  const speaker = options.include_speaker === false ? null : memory_speaker_of(node);
  const labels = [];
  if (options.include_time !== false) labels.push(iso_date(node.temporal.observed_at));
  if (speaker) labels.push(speaker);
  if (options.include_status !== false && status !== "current") labels.push(status);
  return labels.length ? `[${labels.join(" ")}] ${body}` : body;
}
function memory_evidence_of(node, options = {}) {
  return {
    id: node.id,
    text: memory_evidence_text(node, options),
    observed_at: node.temporal.observed_at,
    status: memory_status_of(node),
    speaker: memory_speaker_of(node),
    sources: [{ id: node.id, content_hash: node.content_hash, source_ref: typeof node.metadata.source_ref === "string" ? node.metadata.source_ref : null }]
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/context_builder.ts
function code_point_length(text) {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 55296 && code <= 56319 && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 56320 && next <= 57343) index++;
    }
    count++;
  }
  return count;
}
function count_tokens(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  return Math.max(1, count_multilingual_tokens(t), Math.ceil(code_point_length(t) / 4));
}
function build_context_packet(scored, budget, options = {}) {
  const items = [];
  const evidence = [];
  const lines = [];
  const claim_cache = /* @__PURE__ */ new Map();
  const raw_cache = /* @__PURE__ */ new Map();
  const render = (node, prefer_raw) => {
    const cache = prefer_raw ? raw_cache : claim_cache;
    const cached = cache.get(node);
    if (cached) return cached;
    const value = memory_evidence_of(node, { query_terms: options.query_terms, prefer_raw });
    cache.set(node, value);
    return value;
  };
  let tokens_used = 0;
  let bundled_items = 0;
  for (const candidate of scored) {
    let bundle = [...new Map((options.bundles?.get(candidate.node.id) ?? []).filter((node) => node.id !== candidate.node.id && node.world.world_id === candidate.node.world.world_id && (node.metadata.user_id ?? node.provenance.created_by) === (candidate.node.metadata.user_id ?? candidate.node.provenance.created_by) && node.metadata.conversation_id === candidate.node.metadata.conversation_id && (node.temporal.observed_at <= candidate.node.temporal.observed_at || options.forward_bundle_ids?.has(node.id))).map((node) => [node.id, node])).values()];
    let item_evidence = render(candidate.node, bundle.length > 0);
    let evidence_items = [...bundle.map((node) => render(node, true)), item_evidence];
    let evidence_text = bundle.length ? [...evidence_items].sort((left, right) => left.observed_at - right.observed_at).map((item) => item.text).join(" | ") : item_evidence.text;
    let rendered = `- ${evidence_text}`;
    let cost = count_tokens(rendered) + Number(lines.length > 0);
    if (tokens_used + cost > budget && bundle.length) {
      bundle = [];
      item_evidence = render(candidate.node, false);
      evidence_items = [item_evidence];
      evidence_text = item_evidence.text;
      rendered = `- ${evidence_text}`;
      cost = count_tokens(rendered) + Number(lines.length > 0);
    }
    if (tokens_used + cost > budget) continue;
    items.push(candidate.node);
    evidence.push({ ...item_evidence, text: evidence_text, sources: evidence_items.flatMap((item) => item.sources ?? []) });
    lines.push(rendered);
    tokens_used += cost;
    bundled_items += bundle.length;
  }
  return {
    text: lines.join("\n"),
    tokens_used,
    budget,
    items,
    evidence,
    within_budget: tokens_used <= budget,
    bundled_items
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/evidence_selection.ts
var normalize = (values) => {
  if (values.length === 0) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high - low <= 1e-12) return values.map(() => 0.5);
  return values.map((value) => (value - low) / (high - low));
};
function select_evidence_set(items, options) {
  const limit = Math.min(items.length, Math.max(0, options.limit ?? items.length));
  if (limit === 0 || items.length === 0) return [];
  const token_budget = options.token_budget ?? Number.POSITIVE_INFINITY;
  const coverage_weight = options.coverage_weight ?? 0.22;
  const redundancy_weight = options.redundancy_weight ?? 0.08;
  const polarity_weight = options.exception_query ? options.polarity_weight ?? 0.9 : 0;
  const aspects = [...new Set(options.query_terms)];
  const item_terms = items.map(options.terms);
  const document_frequency = new Map(aspects.map((aspect) => [aspect, item_terms.reduce((sum, terms) => sum + Number(terms.has(aspect)), 0)]));
  const aspect_weights = new Map(aspects.map((aspect) => [aspect, Math.log(1 + (items.length + 0.5) / ((document_frequency.get(aspect) ?? 0) + 0.5))]));
  const aspect_total = [...aspect_weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  const relevance = normalize(items.map(options.relevance));
  const costs = items.map((item) => Math.max(0, options.token_cost(item)));
  const polarities = items.map(options.polarity);
  const item_groups = items.map((item) => options.group?.(item));
  const similarity_sums = new Array(items.length).fill(0);
  const similarity_counts = new Array(items.length).fill(0);
  const remaining = new Set(items.map((_, index) => index));
  const selected = [];
  const coverage = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Set();
  let polarity_covered = false;
  let tokens_used = 0;
  while (selected.length < limit && remaining.size > 0) {
    let best = -1;
    let best_gain = Number.NEGATIVE_INFINITY;
    for (const index of remaining) {
      const cost = costs[index];
      if (tokens_used + cost > token_budget) continue;
      let coverage_gain = 0;
      for (const aspect of aspects) {
        if (!item_terms[index].has(aspect)) continue;
        const before = coverage.get(aspect) ?? 0;
        coverage_gain += (aspect_weights.get(aspect) ?? 0) / aspect_total * (Math.exp(-before) - Math.exp(-(before + 1)));
      }
      while (similarity_counts[index] < selected.length) {
        const prior = selected[similarity_counts[index]++];
        similarity_sums[index] += Math.max(0, options.similarity(items[index], items[prior]));
      }
      const redundancy = selected.length > 0 ? similarity_sums[index] / selected.length : 0;
      const polarity_gain = polarity_covered ? 0 : Math.max(0, polarities[index]);
      const group2 = item_groups[index];
      const group_gain = group2 && !groups.has(group2) ? coverage_weight / (groups.size + 1) : 0;
      const gain = relevance[index] + coverage_weight * coverage_gain + group_gain + polarity_weight * polarity_gain - redundancy_weight * redundancy;
      if (gain > best_gain || gain === best_gain && (best < 0 || index < best)) {
        best = index;
        best_gain = gain;
      }
    }
    if (best < 0) break;
    selected.push(best);
    remaining.delete(best);
    const group = item_groups[best];
    if (group) groups.add(group);
    tokens_used += costs[best];
    for (const aspect of aspects) if (item_terms[best].has(aspect)) coverage.set(aspect, (coverage.get(aspect) ?? 0) + 1);
    if (polarities[best] > 0) polarity_covered = true;
  }
  return selected.map((index) => items[index]);
}

// LongMemory-main/LongMemory-main/src/core/recall/hopfield_recall.ts
var default_beta = 8;
function dot2(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
function softmax(scores) {
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / total);
}
function hopfield_recall(query, memories, beta = default_beta) {
  if (memories.length === 0) {
    return { retrieved: [], weights: [], best: null };
  }
  const scores = memories.map((m) => beta * dot2(m.key, query));
  const attention = softmax(scores);
  const dim = memories[0].value.length;
  const retrieved = new Array(dim).fill(0);
  for (let i = 0; i < memories.length; i++) {
    const v = memories[i].value;
    const w = attention[i];
    for (let d = 0; d < dim; d++) retrieved[d] += w * (v[d] ?? 0);
  }
  const weights = memories.map((m, i) => ({ id: m.id, weight: attention[i] }));
  let best = weights[0];
  for (const w of weights) if (w.weight > best.weight) best = w;
  return { retrieved, weights, best };
}

// LongMemory-main/LongMemory-main/src/core/temporal/bitemporal.ts
function is_valid_at(node, valid_time) {
  const { valid_from, valid_to } = node.temporal;
  return valid_from <= valid_time && (valid_to === null || valid_time < valid_to);
}
function is_recorded_at(node, recorded_time) {
  const { recorded_at, superseded_at } = node.temporal;
  return recorded_at <= recorded_time && (superseded_at === null || recorded_time < superseded_at);
}
function is_current(node, now) {
  return node.temporal.superseded_at === null && node.temporal.recorded_at <= now && is_valid_at(node, now);
}

// LongMemory-main/LongMemory-main/src/core/recall/mode_gates.ts
function thresholds(ctx) {
  return { ...default_gate_thresholds, ...ctx.thresholds ?? {} };
}
function is_superseded(node) {
  return node.temporal.superseded_at !== null || node.state.status === "superseded";
}
function is_contradicted(node) {
  return node.state.status === "contradicted";
}
function is_expired(node, now) {
  if (node.temporal.valid_to !== null && now >= node.temporal.valid_to) return true;
  const max = node.contract.max_valid_duration;
  if (max !== null && now >= node.temporal.valid_from + max) return true;
  return false;
}
function has_source(node) {
  return node.provenance.source_trace.length > 0 || node.grounding.source_ids.length > 0;
}
function grounding_of(node, ctx) {
  return ctx.grounding_score ?? node.grounding.grounding_score;
}
function status_label(node) {
  if (is_superseded(node)) return "superseded";
  if (is_contradicted(node)) return "contradicted";
  return "active";
}
function can_access_node(node, ctx) {
  const permission = node.contract.source_permission;
  if (!permission || permission.scope === "public") return { allowed: true, reason: null };
  const access = ctx.permission_context;
  if (!access) return { allowed: false, reason: `permission context required for ${permission.scope}` };
  if (permission.scope === "private") return access.allow_private ? { allowed: true, reason: null } : { allowed: false, reason: "private source permission denied" };
  if (permission.scope === "user_only") {
    return access.user_id && permission.user_ids.includes(access.user_id) ? { allowed: true, reason: null } : { allowed: false, reason: "user-only source permission denied" };
  }
  if (permission.scope === "team") {
    return (access.team_ids ?? []).some((id) => permission.team_ids.includes(id)) ? { allowed: true, reason: null } : { allowed: false, reason: "team source permission denied" };
  }
  if (permission.scope === "project") {
    return (access.project_ids ?? []).some((id) => permission.project_ids.includes(id)) ? { allowed: true, reason: null } : { allowed: false, reason: "project source permission denied" };
  }
  return permission.source_id && (access.source_ids ?? []).includes(permission.source_id) ? { allowed: true, reason: null } : { allowed: false, reason: "source-restricted permission denied" };
}
function can_use_in_strict_recall(node, ctx) {
  const t = thresholds(ctx);
  const reasons = [];
  if (is_superseded(node)) reasons.push("superseded");
  if (is_contradicted(node)) reasons.push("contradicted");
  if (ctx.unresolved_contradiction) reasons.push("unresolved contradiction");
  if (node.state.confidence < t.min_confidence) reasons.push(`low confidence ${node.state.confidence}`);
  if (!node.contract.use_for_reasoning) reasons.push("contract forbids reasoning");
  const grounding = grounding_of(node, ctx);
  if (node.contract.requires_grounding && grounding < t.grounding_threshold) {
    reasons.push("ungrounded but grounding required");
  }
  const expired = is_expired(node, ctx.now);
  if (expired && node.contract.expires_if_unconfirmed && grounding < t.grounding_threshold) {
    reasons.push("expired and unconfirmed");
  } else if (expired) {
    reasons.push("expired (no longer valid)");
  }
  if (node.contract.source_required && !has_source(node)) reasons.push("source required but missing");
  const access = can_access_node(node, ctx);
  if (!access.allowed) reasons.push(access.reason);
  return { allowed: reasons.length === 0, mode: "strict", label: status_label(node), reasons };
}
function can_use_in_associative_recall(node, ctx) {
  const t = thresholds(ctx);
  const reasons = [];
  if (!node.contract.use_for_associative_recall) reasons.push("contract forbids associative recall");
  if (node.contract.privacy_level === "secret") reasons.push("secret privacy level");
  const access = can_access_node(node, ctx);
  if (!access.allowed) reasons.push(access.reason);
  let label = "active";
  if (node.facets.emotional !== null || node.contract.use_for_emotional_context) {
    label = "emotional_residue";
  } else if (is_superseded(node)) {
    label = "superseded";
  } else if (node.state.confidence < t.min_confidence) {
    label = "weak_pattern";
  }
  return { allowed: reasons.length === 0, mode: "associative", label, reasons };
}
function can_use_in_world_grounded_recall(node, ctx) {
  const t = thresholds(ctx);
  const reasons = [];
  const grounding = grounding_of(node, ctx);
  if (node.grounding.worlddb_ref === null || grounding < t.grounding_threshold) {
    reasons.push("not grounded to an external fact");
  }
  if ((ctx.freshness ?? 0) < t.min_freshness) reasons.push("grounding not fresh enough");
  if (!has_source(node)) reasons.push("provenance/source missing");
  if ((ctx.source_reliability ?? 0) < t.min_source_reliability) reasons.push("source reliability too low");
  const access = can_access_node(node, ctx);
  if (!access.allowed) reasons.push(access.reason);
  return { allowed: reasons.length === 0, mode: "world_grounded", label: "grounded", reasons };
}

// LongMemory-main/LongMemory-main/src/core/recall/recall_planner.ts
var capitalized_re = /\b([A-Z][a-zA-Z]+)\b/g;
var latest_re = /\b(?:latest|newest|current|currently|now|nowadays|recent|recently|these days|still|last time|most recent|up to date|updated)\b/i;
var earliest_re = /\b(?:first|firstly|originally|original|initially|initial|earliest|at the start|back then|used to)\b/i;
var non_entity_words = /* @__PURE__ */ new Set(["what", "when", "where", "which", "who", "whom", "whose", "why", "how", "did", "does", "do", "is", "are", "was", "were", "can", "could", "should", "would", "will", "the", "a", "an"]);
function parse_temporal_preference(text) {
  const latest = latest_re.test(text || "");
  const earliest = earliest_re.test(text || "");
  if (latest === earliest) return null;
  return latest ? "latest" : "earliest";
}
function parse_query_intent(query) {
  const terms = tokenize(query.text || "").map((token) => token.value);
  const parsed = ((query.text || "").match(capitalized_re) ?? []).filter((name) => !non_entity_words.has(name.toLocaleLowerCase()));
  const entity_names = [.../* @__PURE__ */ new Set([...query.entity_names ?? [], ...parsed])];
  return { terms, entity_names, temporal: parse_temporal_preference(query.text) };
}
function plan_strict_recall(query, deps) {
  const intent = parse_query_intent(query);
  const resolved_entities = [];
  for (const name of intent.entity_names) {
    const id = deps.resolver?.canonical_id_for(name);
    const entity = id ? deps.resolver?.get_entity(id) : void 0;
    resolved_entities.push(entity?.canonical_name ?? name);
  }
  let world_ids = null;
  if (query.world_id && deps.world_graph) {
    world_ids = deps.world_graph.query_world_subtree(query.world_id).world_ids;
  }
  return { intent, resolved_entities, world_ids };
}

// LongMemory-main/LongMemory-main/src/core/recall/fusion.ts
var default_fusion_k = 60;
var default_fusion_depth = 64;
function rank_indices(scores) {
  const order = [];
  for (let index = 0; index < scores.length; index++) order.push(index);
  order.sort((left, right) => scores[right] - scores[left] || left - right);
  return order;
}
function reciprocal_rank_fusion(rankings, size, k = default_fusion_k, depth = default_fusion_depth) {
  const fused = new Float64Array(size);
  if (size === 0) return fused;
  for (const ranking of rankings) {
    const limit = Math.min(ranking.length, depth);
    for (let position = 0; position < limit; position++) {
      const index = ranking[position];
      if (index >= 0 && index < size) fused[index] += 1 / (k + position + 1);
    }
  }
  let max = 0;
  for (let index = 0; index < fused.length; index++) if (fused[index] > max) max = fused[index];
  if (max > 0) for (let index = 0; index < fused.length; index++) fused[index] /= max;
  return fused;
}
function select_diverse(items, options) {
  const limit = Math.min(options.limit ?? items.length, items.length);
  const lambda = Math.min(1, Math.max(0, options.lambda ?? 0.75));
  if (limit <= 1 || lambda >= 1) return items.slice(0, limit);
  const count = items.length;
  const pool = new Int32Array(count);
  for (let index = 0; index < count; index++) pool[index] = index;
  const redundancy = new Float64Array(count);
  const selected = [];
  let size = count;
  while (selected.length < limit && size > 0) {
    let best = 0;
    let best_value = Number.NEGATIVE_INFINITY;
    for (let position = 0; position < size; position++) {
      const index = pool[position];
      const value = lambda * (1 - index / count) - (1 - lambda) * redundancy[index];
      if (value > best_value || value === best_value && index < pool[best]) {
        best_value = value;
        best = position;
      }
    }
    const picked = pool[best];
    selected.push(items[picked]);
    size--;
    pool[best] = pool[size];
    for (let position = 0; position < size; position++) {
      const candidate = pool[position];
      const similarity = options.similarity(items[candidate], items[picked]);
      if (similarity > redundancy[candidate]) redundancy[candidate] = similarity;
    }
  }
  return selected;
}

// LongMemory-main/LongMemory-main/src/core/recall/matrix_fusion.ts
var epsilon2 = 1e-9;
function select_sparse_seeds(ids, scores, options = {}) {
  if (ids.length !== scores.length) throw new Error("seed ids and scores must have equal lengths");
  if (ids.length === 0) return { seeds: /* @__PURE__ */ new Map(), threshold: 0, density: 0 };
  const quantile = Math.max(0, Math.min(1, options.quantile ?? 0.9));
  const max_seeds = Math.max(1, Math.floor(options.max_seeds ?? 32));
  const max_density = Math.max(0, Math.min(1, options.max_density ?? 0.15));
  const quantile_count = Math.max(1, Math.ceil(ids.length * (1 - quantile)));
  const density_count = Math.max(1, Math.floor(ids.length * max_density));
  const count = Math.min(ids.length, max_seeds, quantile_count, density_count);
  const ranked = ids.map((id, index) => ({ id, index, score: Number(scores[index]) || 0 })).sort((left, right) => right.score - left.score || left.index - right.index);
  const threshold = ranked[count]?.score ?? ranked[count - 1].score;
  const seeds = /* @__PURE__ */ new Map();
  for (const item of ranked.slice(0, count)) seeds.set(item.id, Math.max(epsilon2, item.score - threshold));
  return { seeds, threshold, density: seeds.size / ids.length };
}
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >>> 1;
  return sorted.length % 2 ? sorted[middle] : 0.5 * (sorted[middle - 1] + sorted[middle]);
}
function empirical(values) {
  if (values.length <= 1) return values.map(() => 0);
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value || left.index - right.index);
  const output = new Array(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start + 1;
    while (end < order.length && order[end].value === order[start].value) end++;
    const rank = 0.5 * (start + end - 1);
    const value = 2 * rank / (order.length - 1) - 1;
    for (let index = start; index < end; index++) output[order[index].index] = value;
    start = end;
  }
  return output;
}
function calibrate(values, clip) {
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  if (mad <= epsilon2) return empirical(values);
  const scale = 1.4826 * mad + epsilon2;
  return values.map((value) => Math.max(-clip, Math.min(clip, (value - center) / scale)));
}
function identity(size) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_2, column) => row === column ? 1 : 0));
}
function covariance(matrix, regularization) {
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  const output = Array.from({ length: columns }, () => new Array(columns).fill(0));
  const denominator = Math.max(1, rows - 1);
  for (let left = 0; left < columns; left++) {
    for (let right = left; right < columns; right++) {
      let value = 0;
      for (let row = 0; row < rows; row++) value += matrix[row][left] * matrix[row][right];
      value /= denominator;
      output[left][right] = value;
      output[right][left] = value;
    }
    output[left][left] += regularization;
  }
  return output;
}
function eigen_symmetric2(input) {
  const size = input.length;
  const matrix = input.map((row) => [...row]);
  const vectors = identity(size);
  const iterations = Math.max(24, size * size * 48);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let p = 0;
    let q = 0;
    let largest = 0;
    for (let row = 0; row < size; row++) {
      for (let column = row + 1; column < size; column++) {
        const value = Math.abs(matrix[row][column]);
        if (value > largest) {
          largest = value;
          p = row;
          q = column;
        }
      }
    }
    if (largest < 1e-10) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const cosine3 = Math.cos(angle);
    const sine = Math.sin(angle);
    const pp = matrix[p][p];
    const qq = matrix[q][q];
    const pq = matrix[p][q];
    matrix[p][p] = cosine3 * cosine3 * pp - 2 * sine * cosine3 * pq + sine * sine * qq;
    matrix[q][q] = sine * sine * pp + 2 * sine * cosine3 * pq + cosine3 * cosine3 * qq;
    matrix[p][q] = 0;
    matrix[q][p] = 0;
    for (let index = 0; index < size; index++) {
      if (index !== p && index !== q) {
        const ip = matrix[index][p];
        const iq = matrix[index][q];
        matrix[index][p] = cosine3 * ip - sine * iq;
        matrix[p][index] = matrix[index][p];
        matrix[index][q] = sine * ip + cosine3 * iq;
        matrix[q][index] = matrix[index][q];
      }
      const vp = vectors[index][p];
      const vq = vectors[index][q];
      vectors[index][p] = cosine3 * vp - sine * vq;
      vectors[index][q] = sine * vp + cosine3 * vq;
    }
  }
  return Array.from({ length: size }, (_, index) => ({
    value: Math.max(epsilon2, matrix[index][index]),
    vector: vectors.map((row) => row[index])
  })).sort((left, right) => right.value - left.value);
}
function inverse_square_root(matrix) {
  const pairs = eigen_symmetric2(matrix);
  const size = matrix.length;
  const output = Array.from({ length: size }, () => new Array(size).fill(0));
  for (const pair of pairs) {
    const scale = 1 / Math.sqrt(pair.value);
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        output[row][column] += scale * pair.vector[row] * pair.vector[column];
      }
    }
  }
  return output;
}
function multiply(left, right) {
  const rows = left.length;
  const inner = right.length;
  const columns = right[0]?.length ?? 0;
  const output = Array.from({ length: rows }, () => new Array(columns).fill(0));
  for (let row = 0; row < rows; row++) {
    for (let middle = 0; middle < inner; middle++) {
      const value = left[row][middle];
      if (value === 0) continue;
      for (let column = 0; column < columns; column++) output[row][column] += value * right[middle][column];
    }
  }
  return output;
}
function matrix_fusion(features, options = {}) {
  const regularization = options.regularization ?? 0.2;
  const temperature = options.temperature ?? 0.65;
  const clip = options.clip ?? 4;
  if (!Number.isFinite(regularization) || regularization <= 0) throw new Error("regularization must be positive");
  if (!Number.isFinite(temperature) || temperature <= 0) throw new Error("temperature must be positive");
  const active = features.filter((feature) => feature.weight > 0 && feature.values.length > 0);
  const rows = active[0]?.values.length ?? 0;
  if (active.some((feature) => feature.values.length !== rows)) throw new Error("matrix feature row counts must match");
  if (rows === 0 || active.length === 0) return {
    scores: new Float64Array(rows),
    calibrated: [],
    whitened: [],
    covariance: [],
    active_features: [],
    regularization,
    temperature
  };
  const columns = active.map((feature) => calibrate(Array.from(feature.values), clip));
  const calibrated = Array.from({ length: rows }, (_, row) => columns.map((column) => column[row]));
  const feature_covariance = covariance(calibrated, regularization);
  const whitened = multiply(calibrated, inverse_square_root(feature_covariance));
  const adjusted_weights = active.map((feature, column) => {
    let redundancy = 1;
    for (let other = 0; other < active.length; other++) {
      if (other === column) continue;
      const denominator = Math.sqrt(feature_covariance[column][column] * feature_covariance[other][other]);
      const correlation = denominator > 0 ? feature_covariance[column][other] / denominator : 0;
      redundancy += Math.max(0, correlation);
    }
    return feature.weight / redundancy;
  });
  const weight_total = adjusted_weights.reduce((sum, weight) => sum + weight, 0);
  const weights = adjusted_weights.map((weight) => weight / weight_total);
  const fused = new Float64Array(rows);
  for (let row = 0; row < rows; row++) {
    let maximum = Number.NEGATIVE_INFINITY;
    for (let column = 0; column < active.length; column++) {
      const value = calibrated[row][column] / temperature + Math.log(weights[column]);
      if (value > maximum) maximum = value;
    }
    let mass = 0;
    for (let column = 0; column < active.length; column++) {
      mass += Math.exp(calibrated[row][column] / temperature + Math.log(weights[column]) - maximum);
    }
    fused[row] = temperature * (maximum + Math.log(mass));
  }
  const low = Math.min(...fused);
  const high = Math.max(...fused);
  const scores = new Float64Array(rows);
  if (high - low <= epsilon2) scores.fill(0.5);
  else for (let row = 0; row < rows; row++) scores[row] = (fused[row] - low) / (high - low);
  return {
    scores,
    calibrated,
    whitened,
    covariance: feature_covariance,
    active_features: active.map((feature) => feature.name),
    regularization,
    temperature
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/rerank.ts
var default_rerank_weights = {
  coverage: 0.18,
  phrase: 0.12
};
var months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
var calendar_pattern = new RegExp(`\\b(${months.join("|")})(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?,?)?\\s+(\\d{4})\\b`, "gi");
function query_calendar_window(text) {
  const matches2 = [...text.matchAll(calendar_pattern)];
  if (matches2.length !== 1 || /\b(?:before|after|since|until|between|from)\b/i.test(text)) return null;
  const [, month_name, day_text, year_text] = matches2[0];
  const month = months.indexOf(month_name.toLowerCase());
  const year = Number(year_text);
  const day = day_text ? Number(day_text) : 1;
  if (year < 1e3 || day < 1 || day > 31) return null;
  const from = Date.UTC(year, month, day);
  if (new Date(from).getUTCMonth() !== month) return null;
  return { from, to: day_text ? Date.UTC(year, month, day + 1) : Date.UTC(year, month + 1, 1) };
}
function calendar_relevance(window, node) {
  if (!window || !Number.isFinite(node.temporal.observed_at)) return 0;
  const at = node.temporal.observed_at;
  const observed = new Date(at);
  const contains = (value) => value >= window.from && value < window.to;
  const mentions = [...node.content.raw.matchAll(calendar_pattern)];
  if (mentions.some((match) => {
    const explicit = query_calendar_window(match[0]);
    return explicit !== null && explicit.from < window.to && explicit.to > window.from;
  })) return 1;
  const prior_month = /\blast month\b/i.test(node.content.raw);
  const prior_week = /\blast week\b/i.test(node.content.raw);
  const yesterday = /\byesterday\b/i.test(node.content.raw);
  if (prior_month) {
    const from = Date.UTC(observed.getUTCFullYear(), observed.getUTCMonth() - 1, 1);
    const to = Date.UTC(observed.getUTCFullYear(), observed.getUTCMonth(), 1);
    if (from < window.to && to > window.from) return 1;
  }
  if (prior_week && contains(at - 7 * 864e5)) return 0.75;
  if (yesterday && contains(at - 864e5)) return 1;
  if (contains(at) && !prior_month && !prior_week && !yesterday && !mentions.length) return 0.75;
  return 0;
}
function bigrams2(terms) {
  const pairs = /* @__PURE__ */ new Set();
  for (let index = 1; index < terms.length; index++) pairs.add(`${terms[index - 1]} ${terms[index]}`);
  return pairs;
}
function rerank_features(query_terms, query_bigrams, document) {
  if (query_terms.length === 0) return { coverage: 0, phrase: 0 };
  let matched = 0;
  for (const term of query_terms) if (document.frequencies.has(term) || document.speaker_terms.has(term)) matched++;
  const coverage = matched / query_terms.length;
  if (query_bigrams.size === 0) return { coverage, phrase: 0 };
  const document_bigrams = bigrams2(document.terms);
  let phrase_hits = 0;
  for (const pair of query_bigrams) if (document_bigrams.has(pair)) phrase_hits++;
  return { coverage, phrase: phrase_hits / query_bigrams.size };
}
function prepare_rerank_query(query_terms) {
  const terms = [...new Set(query_terms)];
  return { terms, pairs: bigrams2(query_terms) };
}
function rerank_score(base, features, weights = default_rerank_weights) {
  return base + weights.coverage * features.coverage + weights.phrase * features.phrase;
}
var evidence_cache = /* @__PURE__ */ new WeakMap();
var generic_terms = /* @__PURE__ */ new Set(["activiti", "activity", "item", "thing", "many", "total", "list", "beside", "apart", "other", "except"]);
var escape_pattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var evidence_tokens = (text) => recall_tokens(text.replace(/[^\p{L}\p{N}'_-]+/gu, " "));
function related_word(left, right) {
  if (left === right || !/^[a-z]{6,}$/.test(left) || !/^[a-z]{6,}$/.test(right)) return false;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return longer.startsWith(shorter) && /^(?:ation|ations|ion|ions|ment|ments|al|ally|ness)$/.test(longer.slice(shorter.length));
}
function speaker_of(node) {
  const declared = node.metadata.speaker ?? node.metadata.role;
  return typeof declared === "string" ? declared.trim().toLowerCase() : "";
}
function evidence_document_of(node) {
  const cached = evidence_cache.get(node);
  if (cached) return cached;
  const speaker = speaker_of(node);
  const prefix = speaker ? new RegExp(`^\\s*${escape_pattern(speaker)}:\\s*`, "i") : null;
  const body = prefix ? node.content.raw.replace(prefix, "") : node.content.raw;
  const statements = body.split(/(?<=[.!?])\s+|\n+/).map((value) => value.trim()).filter(Boolean);
  const assertions = statements.filter((statement) => !statement.endsWith("?"));
  const document = {
    speaker,
    assertions,
    assertion_terms: new Set(assertions.flatMap(evidence_tokens)),
    speaker_terms: new Set(evidence_tokens(speaker)),
    terms: new Set(evidence_tokens(body))
  };
  evidence_cache.set(node, document);
  return document;
}
function prepare_evidence_query(text, nodes) {
  const words2 = ` ${strict_recall_tokens(text).join(" ")} `;
  const speakers = new Set(nodes.map(speaker_of).filter((speaker) => speaker && !/^(?:user|assistant|system|tool|function|speaker)$/.test(speaker)));
  const mentioned = [...speakers].filter((speaker) => words2.includes(` ${strict_recall_tokens(speaker).join(" ")} `));
  const subject = mentioned.length === 1 ? mentioned[0] : /\b(?:i|me|my|mine)\b/i.test(text) && !/\b(?:you|your|assistant)\b/i.test(text) ? "user" : null;
  const exclusion = /\b(?:besides|apart from|other than|except for)\s+(.+?)[?.!]*$/i.exec(text);
  const excluded = new Set(exclusion ? evidence_tokens(exclusion[1]).filter((term) => !generic_terms.has(term)) : []);
  const subject_terms = new Set(subject ? evidence_tokens(subject) : []);
  const terms = new Set(evidence_tokens(exclusion ? text.slice(0, exclusion.index) : text).filter((term) => !subject_terms.has(term) && !generic_terms.has(term)));
  const named_subject_query = subject !== null && subject !== "user";
  return {
    subject,
    terms,
    excluded,
    aggregate: named_subject_query || /\b(?:how many|list|which (?:items|events|activities|places)|what activities)\b/i.test(text)
  };
}
function evidence_support(query, node, derivation_enabled = true) {
  const document = evidence_document_of(node);
  const assertions = document.assertions;
  const subject_pattern = query.subject && query.subject !== "user" ? new RegExp(`(?:^|[.!?]\\s+)(?:my (?:friend|colleague|partner) )?${escape_pattern(query.subject)}(?:'s)?\\s+(?![,!?])`, "i") : null;
  const explicit_subject = subject_pattern ? assertions.some((statement) => subject_pattern.test(statement)) : false;
  const attribution = !query.subject ? 0 : document.speaker === query.subject || explicit_subject ? 1 : document.speaker ? -1 : 0;
  const supported_terms = document.assertion_terms;
  const derivation = derivation_enabled && [...query.terms].some((term) => !supported_terms.has(term) && [...supported_terms].some((token) => related_word(term, token))) ? 1 : 0;
  const positive_match = derivation > 0 || [...query.terms].some((term) => supported_terms.has(term));
  const assertion = assertions.length === 0 ? -1 : query.terms.size === 0 ? 0 : positive_match ? 1 : 0;
  const excluded_match = [...query.excluded].some((term) => document.terms.has(term));
  return { attribution, assertion, excluded_only: excluded_match && !positive_match, derivation };
}
var default_evidence_weights = {
  attribution: 0.24,
  assertion: 0.06,
  excluded_only: 0.16,
  derivation: 0.12
};
function evidence_adjustment(features, weights = default_evidence_weights) {
  return weights.attribution * features.attribution + weights.assertion * features.assertion - (features.excluded_only ? weights.excluded_only : 0) + weights.derivation * (features.derivation ?? 0);
}
function order_evidence(items, query, counterevidence) {
  const ordered = [...items].sort((left, right) => right.score - left.score);
  if (counterevidence) {
    const position = ordered.indexOf(counterevidence);
    if (position > 2) ordered.splice(2, 0, ...ordered.splice(position, 1));
  }
  if (!query.aggregate || ordered.length < 2) return ordered;
  const terms = ordered.map((item) => {
    const document = evidence_document_of(item.node);
    const speaker_terms = document.speaker_terms;
    return new Set([...document.terms].filter((term) => !query.terms.has(term) && !speaker_terms.has(term)));
  });
  const remaining = new Set(ordered.map((_, index) => index));
  const redundancy = new Array(ordered.length).fill(0);
  const selected = [];
  while (remaining.size) {
    let best = -1;
    let score = -Infinity;
    for (const index of remaining) {
      const value = ordered[index].score - 0.12 * redundancy[index];
      if (value > score) {
        best = index;
        score = value;
      }
    }
    selected.push(ordered[best]);
    remaining.delete(best);
    for (const index of remaining) {
      let overlap = 0;
      for (const term of terms[index]) if (terms[best].has(term)) overlap++;
      const similarity = overlap / (terms[index].size + terms[best].size - overlap || 1);
      redundancy[index] = Math.max(redundancy[index], similarity);
    }
  }
  if (counterevidence) {
    const position = selected.indexOf(counterevidence);
    if (position > 2) selected.splice(2, 0, ...selected.splice(position, 1));
  }
  return selected;
}

// LongMemory-main/LongMemory-main/src/core/recall/associative_recall.ts
var day_ms4 = 864e5;
var length_prior_saturation = 8;
var default_associative_weights = {
  vector: 0.28,
  lexical: 0.2,
  entity: 0.12,
  activation: 0.15,
  spread: 0.15,
  emotional: 0.1,
  speaker: 0.06,
  preference: 0.08,
  status_penalty: 0.2,
  fusion: 0,
  recency: 0,
  session: 0
};
function default_associative_policy() {
  return {
    weights: { ...default_associative_weights },
    flags: {
      matrix_retrieval: true,
      rm3: false,
      evidence_rerank: true,
      calendar_rerank: true,
      derivation_rerank: true,
      hopfield: false,
      session_coverage: false
    },
    hopfield_beta: 8,
    columns: {
      vector: 0.28,
      lexical: 0.2,
      activation: 0.15,
      speaker: 0.06,
      temporal: 0,
      polarity: 0.18,
      preference: 0.08
    },
    seeds: {
      quantile: 0.9,
      max_seeds: 32,
      max_density: 0.15,
      legacy_threshold: 0.05
    },
    evidence: {
      coverage: 0.18,
      phrase: 0.12,
      attribution: 0.24,
      assertion: 0.06,
      excluded_only: 0.16,
      derivation: 0.12,
      calendar: 0.2
    },
    budgets: {
      rerank_depth: 50,
      aggregate_rerank_depth: 200,
      rm3_feedback_docs: 10,
      rm3_feedback_terms: 12,
      rm3_original_weight: 0.6,
      evidence_selection_depth: 64
    },
    diversity_lambda: 0.85
  };
}
function associative_policy_from_env(env = process.env, overrides) {
  const policy2 = default_associative_policy();
  policy2.flags.matrix_retrieval = env.OM_MATRIX_RETRIEVAL !== "0";
  policy2.flags.rm3 = env.OM_RM3 === "1";
  policy2.flags.evidence_rerank = env.LONGMEMORY_EVIDENCE_RERANK !== "0";
  policy2.flags.calendar_rerank = env.LONGMEMORY_CALENDAR_RERANK !== "0";
  policy2.flags.derivation_rerank = env.LONGMEMORY_DERIVATION_RERANK !== "0";
  policy2.flags.session_coverage = env.LONGMEMORY_SESSION_COVERAGE === "1";
  return {
    ...policy2,
    ...overrides,
    weights: { ...policy2.weights, ...overrides?.weights },
    flags: { ...policy2.flags, ...overrides?.flags },
    columns: { ...policy2.columns, ...overrides?.columns },
    seeds: { ...policy2.seeds, ...overrides?.seeds },
    evidence: { ...policy2.evidence, ...overrides?.evidence },
    budgets: { ...policy2.budgets, ...overrides?.budgets }
  };
}
function cosine(a, b) {
  if (!a || !b || a.values.length !== b.values.length) return 0;
  let dot3 = 0;
  for (let index = 0; index < a.values.length; index++) dot3 += a.values[index] * b.values[index];
  return a.norm === 0 || b.norm === 0 ? 0 : clamp01(dot3 / (a.norm * b.norm));
}
function is_superseded2(node) {
  return node.temporal.superseded_at !== null || node.state.status === "superseded";
}
function conversation_of(node) {
  return typeof node.metadata.conversation_id === "string" ? node.metadata.conversation_id : "";
}
function session_relevance(nodes, relevance) {
  const grouped = /* @__PURE__ */ new Map();
  for (let index = 0; index < nodes.length; index++) {
    const key = conversation_of(nodes[index]);
    if (!key) continue;
    const bucket = grouped.get(key) ?? [];
    bucket.push(relevance[index]);
    grouped.set(key, bucket);
  }
  const scores = /* @__PURE__ */ new Map();
  let max = 0;
  for (const [key, values] of grouped) {
    values.sort((left, right) => right - left);
    let total = 0;
    for (let index = 0; index < Math.min(3, values.length); index++) total += values[index];
    scores.set(key, total);
    if (total > max) max = total;
  }
  if (max > 0) for (const [key, value] of scores) scores.set(key, value / max);
  return scores;
}
function memory_similarity(left, right) {
  const left_vector = recall_vector(left.vectors.semantic);
  const right_vector = recall_vector(right.vectors.semantic);
  if (left_vector && right_vector && left_vector.values.length === right_vector.values.length) {
    return cosine(left_vector, right_vector);
  }
  const left_terms = recall_document(left).frequencies;
  const right_terms = recall_document(right).frequencies;
  if (left_terms.size === 0 || right_terms.size === 0) return 0;
  let shared = 0;
  for (const term of left_terms.keys()) if (right_terms.has(term)) shared++;
  return shared / (left_terms.size + right_terms.size - shared);
}
function is_contradicted2(node) {
  return node.state.status === "contradicted";
}
function is_emotional(node) {
  return node.facets.emotional !== null || node.contract.use_for_emotional_context;
}
var exception_query_re = /\b(?:all|always|any|ever|every|never|none|only|smoothly|without (?:a )?(?:problem|issue))\b/i;
var exception_evidence_terms = ["except", "fail", "failed", "failure", "problem", "issue", "tough", "challenge", "difficult", "disappointed", "disappointing", "wrong", "weird", "broke", "broken", "unable"];
var exception_evidence_tokens = new Set(exception_evidence_terms.flatMap(recall_tokens));
function polarity_relevance(node, enabled, query_terms) {
  if (!enabled) return 0;
  const evidence_terms = new Set(recall_tokens(`${node.content.raw} ${node.content.summary}`));
  const failure_strength = [...exception_evidence_tokens].reduce((sum, term) => sum + Number(evidence_terms.has(term)), 0);
  if (failure_strength === 0) return 0;
  const ignored = /* @__PURE__ */ new Set(["all", "always", "any", "ever", "every", "never", "none", "only", "smooth", "without"]);
  const document = recall_document(node);
  let overlap = 0;
  for (const term of new Set(query_terms)) {
    if (!ignored.has(term) && document.frequencies.has(term)) overlap++;
  }
  return overlap >= 2 ? Math.min(1, failure_strength / 3) : 0;
}
var referential_turn_re = /\b(?:did it|did that|just did it|just did that|that one|this one|the same (?:thing|place|one)|so did i|me too)\b/i;
var pronoun_turn_re = /^(?:[^:\n]{1,32}:\s+)?(?:it|he|she|they|this|that|those|these)\b/i;
var question_turn_re = /\?\s*$/;
var aggregate_query_re = /\b(?:how many|total|list|which (?:items|events|activities|places)|what activities|all (?:the |of )?(?:items|events|activities|places))\b/i;
function conversation_bundles(anchors, nodes, edges, anchor_limit = 8, max_depth = 2) {
  const by_id = new Map(nodes.map((node) => [node.id, node]));
  const predecessor = /* @__PURE__ */ new Map();
  const successor = /* @__PURE__ */ new Map();
  for (const edge of edges) if (edge.type === "refers_to") {
    predecessor.set(edge.from, edge.to);
    if (!successor.has(edge.to)) successor.set(edge.to, edge.from);
  }
  const bundles = /* @__PURE__ */ new Map();
  const forward_ids = /* @__PURE__ */ new Set();
  for (const anchor of anchors.slice(0, anchor_limit)) {
    const explicit = referential_turn_re.test(anchor.node.content.raw);
    const is_question = question_turn_re.test(anchor.node.content.raw);
    if (!explicit && !is_question && !(anchor.node.content.raw.length <= 512 && pronoun_turn_re.test(anchor.node.content.raw))) continue;
    const conversation = conversation_of(anchor.node);
    if (!conversation) continue;
    const neighbours = [];
    const visited = /* @__PURE__ */ new Set([anchor.node.id]);
    let tokens3 = 0;
    const same_scope = (candidate) => conversation_of(candidate) === conversation && candidate.world.world_id === anchor.node.world.world_id && candidate.metadata.user_id === anchor.node.metadata.user_id;
    if (is_question) {
      let current2 = anchor.node.id;
      for (let depth = 0; depth < max_depth; depth++) {
        const next_id = successor.get(current2);
        const next = next_id ? by_id.get(next_id) : void 0;
        if (!next || visited.has(next.id) || !same_scope(next) || next.temporal.observed_at < anchor.node.temporal.observed_at) break;
        visited.add(next.id);
        tokens3 += count_tokens(memory_evidence_text(next, { prefer_raw: true }));
        if (tokens3 > 256) break;
        neighbours.push(next);
        forward_ids.add(next.id);
        current2 = next.id;
      }
    }
    let current = anchor.node.id;
    for (let depth = 0; depth < max_depth; depth++) {
      const previous_id = predecessor.get(current);
      const previous = previous_id ? by_id.get(previous_id) : void 0;
      if (!previous || visited.has(previous.id) || !same_scope(previous) || previous.temporal.observed_at > anchor.node.temporal.observed_at) break;
      visited.add(previous.id);
      tokens3 += count_tokens(memory_evidence_text(previous, { prefer_raw: true }));
      if (!explicit && tokens3 > 256) break;
      neighbours.push(previous);
      current = previous.id;
    }
    if (neighbours.length > 0) bundles.set(anchor.node.id, neighbours);
  }
  return { bundles, forward_ids };
}
function status_label_for(node, min_confidence) {
  if (is_superseded2(node)) return "superseded";
  if (is_contradicted2(node)) return "contradicted";
  if (is_emotional(node)) return "emotional_residue";
  if (node.state.confidence < min_confidence) return "weak_pattern";
  return "active";
}
function bm25_weighted(query_weights, docs, k1 = 1.5, b = 0.75) {
  const scores = new Float64Array(docs.length);
  if (docs.length === 0 || query_weights.size === 0) return scores;
  const unique_query_terms = [...query_weights.keys()];
  const df = new Map(unique_query_terms.map((term) => [term, 0]));
  let total_len = 0;
  for (const doc of docs) {
    total_len += doc.length;
    for (const term of unique_query_terms) if (doc.frequencies.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avg_len = total_len / docs.length || 1;
  const document_count = docs.length;
  let max = 0;
  for (let doc_index = 0; doc_index < docs.length; doc_index++) {
    const doc = docs[doc_index];
    let s = 0;
    for (const q of unique_query_terms) {
      const document_frequency = df.get(q) ?? 0;
      if (document_frequency === 0) continue;
      const idf = Math.log(1 + (document_count - document_frequency + 0.5) / (document_frequency + 0.5));
      const f = doc.frequencies.get(q) ?? 0;
      if (f === 0) continue;
      s += (query_weights.get(q) ?? 0) * idf * (f * (k1 + 1) / (f + k1 * (1 - b + b * (doc.length / avg_len))));
    }
    scores[doc_index] = s * (doc.length / (doc.length + length_prior_saturation));
    if (scores[doc_index] > max) max = scores[doc_index];
  }
  if (max > 0) for (let index = 0; index < scores.length; index++) scores[index] /= max;
  return scores;
}
function relevance_model(query_weights, docs, base, feedback_docs, feedback_terms, original_weight) {
  const ranked = [];
  for (let index = 0; index < base.length; index++) if (base[index] > 0) ranked.push(index);
  if (ranked.length === 0) return query_weights;
  ranked.sort((left, right) => base[right] - base[left]);
  const feedback = ranked.slice(0, feedback_docs);
  let mass = 0;
  for (const index of feedback) mass += base[index];
  if (mass <= 0) return query_weights;
  const model = /* @__PURE__ */ new Map();
  for (const index of feedback) {
    const doc = docs[index];
    if (doc.length === 0) continue;
    const weight = base[index] / mass;
    for (const [term, frequency] of doc.frequencies) {
      if (term.length <= 2 || query_weights.has(term)) continue;
      model.set(term, (model.get(term) ?? 0) + weight * frequency / doc.length);
    }
  }
  if (model.size === 0) return query_weights;
  const expansion = [...model.entries()].sort((left, right) => right[1] - left[1]).slice(0, feedback_terms);
  let expansion_mass = 0;
  for (const [, weight] of expansion) expansion_mass += weight;
  if (expansion_mass <= 0) return query_weights;
  let query_mass = 0;
  for (const [, weight] of query_weights) query_mass += weight;
  if (query_mass <= 0) return query_weights;
  const merged = /* @__PURE__ */ new Map();
  for (const [term, weight] of query_weights) merged.set(term, original_weight * weight / query_mass);
  for (const [term, weight] of expansion) merged.set(term, (1 - original_weight) * weight / expansion_mass);
  return merged;
}
function bm25_scores(query_terms, docs, rm3, k1 = 1.5, b = 0.75) {
  const normalized = query_terms.map(normalize_recall_token);
  const query_weights = /* @__PURE__ */ new Map();
  for (const term of normalized) query_weights.set(term, (query_weights.get(term) ?? 0) + 1);
  if (query_weights.size === 0 || docs.length === 0) return new Float64Array(docs.length);
  const base = bm25_weighted(query_weights, docs, k1, b);
  if (!rm3.enabled) return base;
  const expanded = relevance_model(query_weights, docs, base, rm3.feedback_docs, rm3.feedback_terms, rm3.original_weight);
  if (expanded === query_weights) return base;
  return bm25_weighted(expanded, docs, k1, b);
}
function entity_overlap(entities, document) {
  if (entities.length === 0) return 0;
  let matched = 0;
  for (const entity of entities) {
    const parts = recall_tokens(entity);
    if (parts.length > 0 && parts.every((part) => document.frequencies.has(part) || document.speaker_terms.has(part))) matched++;
  }
  return matched / entities.length;
}
function associative_recall(query, deps, policy2 = default_associative_policy()) {
  const at = query.at ?? query.now;
  const weights = policy2.weights;
  const min_confidence = query.min_confidence ?? default_gate_thresholds.min_confidence;
  const first_person_query = /\b(?:i|me|my|mine)\b/i.test(query.text);
  const emotional_query = /\b(?:feel|feeling|felt|emotion|emotional|happy|sad|afraid|anxious|angry|love|hate|mood)\b/i.test(query.text);
  const recommendation_query = /\b(?:recommend|recommendation|suggest|suggestion|personalize|tailor)\b/i.test(query.text);
  const exception_query = exception_query_re.test(query.text);
  const plan_query = {
    text: query.text,
    now: query.now,
    at,
    world_id: query.world_id,
    entity_names: query.entity_names,
    vector: query.vector
  };
  const plan = plan_strict_recall(plan_query, deps);
  const query_vector = query.vector ?? deps.embed_query?.(query.text) ?? null;
  const retrieved = deps.index.active_nodes(plan.world_ids);
  const admitted = [];
  const candidates = [];
  for (const node of retrieved) {
    const gate_ctx = { now: at, thresholds: { min_confidence }, permission_context: query.permission_context };
    const gate = can_use_in_associative_recall(node, gate_ctx);
    if (gate.allowed) {
      admitted.push(node);
    } else {
      candidates.push({
        id: node.id,
        admitted: false,
        label: gate.label,
        score: null,
        included: false,
        reasons: gate.reasons
      });
    }
  }
  const evidence_enabled = policy2.flags.evidence_rerank;
  const evidence_query = evidence_enabled ? prepare_evidence_query(query.text, admitted) : null;
  const rerank_depth = evidence_query?.aggregate ? Math.max(policy2.budgets.rerank_depth, policy2.budgets.aggregate_rerank_depth) : policy2.budgets.rerank_depth;
  const documents = admitted.map((node) => recall_document(node));
  const bm25 = bm25_scores(plan.intent.terms, documents, {
    enabled: policy2.flags.rm3,
    feedback_docs: policy2.budgets.rm3_feedback_docs,
    feedback_terms: policy2.budgets.rm3_feedback_terms,
    original_weight: policy2.budgets.rm3_original_weight
  });
  const prepared_query = recall_vector(query_vector);
  const vector_scores = new Float64Array(admitted.length);
  const entity_scores = new Float64Array(admitted.length);
  const direct_relevance = new Float64Array(admitted.length);
  const spread_enabled = Boolean(deps.edges?.length);
  let oldest_observed = Number.POSITIVE_INFINITY;
  let newest_observed = Number.NEGATIVE_INFINITY;
  for (let node_index = 0; node_index < admitted.length; node_index++) {
    const node = admitted[node_index];
    const document = documents[node_index];
    const vector = cosine(prepared_query, recall_vector(node.vectors.semantic));
    const lexical2 = bm25[node_index];
    const entity = entity_overlap(plan.resolved_entities, document);
    vector_scores[node_index] = vector;
    entity_scores[node_index] = entity;
    const rel = clamp01(0.5 * vector + 0.35 * lexical2 + 0.15 * entity);
    direct_relevance[node_index] = rel;
    if (node.temporal.observed_at < oldest_observed) oldest_observed = node.temporal.observed_at;
    if (node.temporal.observed_at > newest_observed) newest_observed = node.temporal.observed_at;
  }
  const fusion_weight = weights.fusion ?? 0;
  const fusion_scores = fusion_weight > 0 && admitted.length > 1 ? reciprocal_rank_fusion([rank_indices(vector_scores), rank_indices(bm25)], admitted.length) : new Float64Array(admitted.length);
  const recency_weight = plan.intent.temporal ? weights.recency ?? 0 : 0;
  const observed_span = newest_observed - oldest_observed;
  const session_weight = weights.session ?? 0;
  const session_scores = session_weight > 0 ? session_relevance(admitted, direct_relevance) : null;
  const activation_scores = new Float64Array(admitted.length);
  const emotional_scores = new Float64Array(admitted.length);
  const speaker_scores = new Float64Array(admitted.length);
  const preference_scores = new Float64Array(admitted.length);
  const recency_scores = new Float64Array(admitted.length);
  const polarity_scores = new Float64Array(admitted.length);
  const entity_gates = new Float64Array(admitted.length);
  for (let node_index = 0; node_index < admitted.length; node_index++) {
    const node = admitted[node_index];
    const vector = vector_scores[node_index];
    const lexical2 = bm25[node_index];
    const entity = entity_scores[node_index];
    const pressure = clamp01(deps.contradiction_pressure_of?.(node.id) ?? 0);
    const age_days = Math.max(0, (at - node.temporal.observed_at) / day_ms4);
    const memory_strength = deps.decay_policy ? project_node_decay(node, at, deps.decay_policy).activation : node.state.salience;
    const actr_raw = compute_activation([age_days + 1], {
      context_association: 0.5 * (node.state.salience + memory_strength),
      task_relevance: 0.5 * (vector + lexical2),
      grounding_relevance: node.grounding.grounding_score,
      contradiction_penalty: pressure
    });
    activation_scores[node_index] = clamp01(sigmoid(actr_raw));
    emotional_scores[node_index] = emotional_query && is_emotional(node) ? (node.facets.emotional?.weight ?? 0.5) * Math.max(vector, lexical2, entity) : 0;
    const role = typeof node.metadata.role === "string" ? node.metadata.role.toLowerCase() : "";
    speaker_scores[node_index] = first_person_query ? role === "user" ? 1 : role === "assistant" ? 0 : 0.5 : 0;
    preference_scores[node_index] = recommendation_query && node.content.claims?.some((claim) => claim.kind === "preference") ? 1 : 0;
    const observed_position = observed_span > 0 ? (node.temporal.observed_at - oldest_observed) / observed_span : 0;
    recency_scores[node_index] = plan.intent.temporal === "latest" ? observed_position : plan.intent.temporal === "earliest" ? 1 - observed_position : 0;
    polarity_scores[node_index] = polarity_relevance(node, exception_query, recall_tokens(query.text));
    entity_gates[node_index] = plan.resolved_entities.length === 0 ? 1 : 0.35 + 0.65 * sigmoid(8 * (entity - 0.5));
  }
  const matrix = matrix_fusion([
    { name: "vector", values: vector_scores, weight: policy2.columns.vector },
    { name: "lexical", values: bm25, weight: policy2.columns.lexical },
    { name: "activation", values: activation_scores, weight: policy2.columns.activation },
    { name: "speaker", values: speaker_scores, weight: first_person_query ? policy2.columns.speaker : 0 },
    { name: "temporal", values: recency_scores, weight: plan.intent.temporal ? policy2.columns.temporal : 0 },
    { name: "polarity", values: polarity_scores, weight: exception_query ? policy2.columns.polarity : 0 },
    { name: "preference", values: preference_scores, weight: recommendation_query ? policy2.columns.preference : 0 }
  ]);
  const matrix_scores = new Float64Array(admitted.length);
  for (let index = 0; index < admitted.length; index++) matrix_scores[index] = matrix.scores[index] * entity_gates[index];
  const sparse = select_sparse_seeds(admitted.map((node) => node.id), matrix_scores, {
    quantile: policy2.seeds.quantile,
    max_seeds: policy2.seeds.max_seeds,
    max_density: policy2.seeds.max_density
  });
  const legacy_seeds = /* @__PURE__ */ new Map();
  if (!policy2.flags.matrix_retrieval) {
    for (let index = 0; index < admitted.length; index++) {
      if (direct_relevance[index] > policy2.seeds.legacy_threshold) legacy_seeds.set(admitted[index].id, direct_relevance[index]);
    }
  }
  const matrix_query = policy2.flags.matrix_retrieval && exception_query;
  if (!matrix_query) {
    for (let index = 0; index < admitted.length; index++) {
      if (direct_relevance[index] > policy2.seeds.legacy_threshold) legacy_seeds.set(admitted[index].id, direct_relevance[index]);
    }
  }
  const seeds = matrix_query ? sparse.seeds : legacy_seeds;
  const seed_count = seeds.size;
  const spread = spread_enabled && seeds.size > 0 ? matrix_query ? spread_activation(seeds, deps.edges) : legacy_spread_activation(seeds, deps.edges) : { activation: /* @__PURE__ */ new Map(), hops: 2, visited: [], frontier_by_hop: [[]], entropy: 0, peak: 0, bypassed: false };
  const limit = query.k == null ? null : Math.max(0, query.k);
  const rerank_query = prepare_rerank_query(recall_tokens(query.text));
  const calendar = policy2.flags.calendar_rerank ? query_calendar_window(query.text) : null;
  const candidate_limit = limit === null || limit === 0 || rerank_query.terms.length === 0 ? limit : Math.max(limit, rerank_depth);
  const ranked_entries = [];
  for (let node_index = 0; node_index < admitted.length; node_index++) {
    const node = admitted[node_index];
    const vector = vector_scores[node_index];
    const lexical2 = bm25[node_index];
    const entity = entity_scores[node_index];
    const spread_value = clamp01(spread.activation.get(node.id) ?? 0);
    const activation2 = activation_scores[node_index];
    const emotional = emotional_scores[node_index];
    const speaker = speaker_scores[node_index];
    const preference2 = preference_scores[node_index];
    const polarity = polarity_scores[node_index];
    const entity_gate = entity_gates[node_index];
    const label = status_label_for(node, min_confidence);
    const status_penalty = label === "superseded" || label === "contradicted" && !exception_query ? weights.status_penalty : 0;
    const fusion = fusion_scores[node_index];
    const recency = recency_scores[node_index];
    const session = session_scores?.get(conversation_of(node)) ?? 0;
    const direct_score = weights.vector * vector + weights.lexical * lexical2 + weights.entity * entity + weights.activation * activation2 + weights.emotional * emotional + weights.speaker * speaker + weights.preference * preference2 + fusion_weight * fusion + recency_weight * recency + session_weight * session - status_penalty;
    const matrix_score = matrix_scores[node_index];
    const graph_gain = matrix_query && !seeds.has(node.id) ? weights.spread * spread_value : 0;
    const matrix_residual = 0.04 * (matrix_score - 0.5);
    const polarity_gain = matrix_query ? 0.2 * polarity : 0;
    const calendar_adjustment = policy2.evidence.calendar * calendar_relevance(calendar, node);
    const score = (matrix_query ? direct_score + matrix_residual + graph_gain + polarity_gain : direct_score + weights.spread * spread_value) + calendar_adjustment;
    if (limit === 0) continue;
    const last = ranked_entries.at(-1);
    if (candidate_limit !== null && ranked_entries.length >= candidate_limit && last && score <= last.item.score) continue;
    const item = {
      node,
      score,
      label,
      breakdown: {
        vector,
        lexical: lexical2,
        entity,
        activation: activation2,
        spread: spread_value,
        emotional,
        speaker,
        preference: preference2,
        fusion,
        recency,
        session,
        status_penalty,
        matrix: matrix_score,
        polarity,
        entity_gate,
        graph_gain,
        calendar_adjustment,
        score
      }
    };
    if (candidate_limit === null) {
      ranked_entries.push({ item, order: node_index });
      continue;
    }
    let low = 0;
    let high = ranked_entries.length;
    while (low < high) {
      const middle = low + high >>> 1;
      const current = ranked_entries[middle];
      if (score > current.item.score || score === current.item.score && node_index < current.order) high = middle;
      else low = middle + 1;
    }
    ranked_entries.splice(low, 0, { item, order: node_index });
    if (ranked_entries.length > candidate_limit) ranked_entries.pop();
  }
  if (limit === null) ranked_entries.sort((left, right) => right.item.score - left.item.score || left.order - right.order);
  const ranked = ranked_entries.map((entry) => entry.item);
  const rerank_weights = { coverage: policy2.evidence.coverage, phrase: policy2.evidence.phrase };
  const evidence_weights = {
    attribution: policy2.evidence.attribution,
    assertion: policy2.evidence.assertion,
    excluded_only: policy2.evidence.excluded_only,
    derivation: policy2.evidence.derivation
  };
  if (rerank_query.terms.length > 0 && ranked.length > 1) {
    const head = ranked.slice(0, Math.min(rerank_depth, ranked.length));
    let strongest;
    let strongest_score = -Infinity;
    for (const item of head) {
      const features = rerank_features(rerank_query.terms, rerank_query.pairs, recall_document(item.node));
      item.score = rerank_score(item.score, features, rerank_weights);
      if (item.score > strongest_score) {
        strongest = item;
        strongest_score = item.score;
      }
      if (evidence_query) {
        const adjustment = evidence_adjustment(evidence_support(evidence_query, item.node, policy2.flags.derivation_rerank), evidence_weights);
        item.score += adjustment;
        item.breakdown.evidence_adjustment = adjustment;
      }
      item.breakdown.score = item.score;
    }
    const counterevidence = evidence_query?.subject && evidence_query.subject !== "user" && strongest && evidence_support(evidence_query, strongest.node).attribution < 0 ? strongest : void 0;
    const ordered = evidence_query ? order_evidence(head, evidence_query, counterevidence) : head.sort((left, right) => right.score - left.score);
    for (let index = 0; index < ordered.length; index++) ranked[index] = ordered[index];
  }
  const current_query = /\b(?:now|currently|current|latest)\b/i.test(query.text) && !/\b(?:before|previously|formerly|historical|history|then|changed|evolved)\b/i.test(query.text) && (query.at === void 0 || query.at >= query.now);
  const replacements = current_query ? (deps.edges ?? []).filter((edge) => edge.type === "supersedes") : [];
  const predecessors = /* @__PURE__ */ new Map();
  for (const edge of replacements) predecessors.set(edge.from, [...predecessors.get(edge.from) ?? [], edge.to]);
  const current_terms = new Set(plan.intent.terms);
  const promote_current = (items) => {
    if (!current_query) return;
    const by_id = new Map(items.map((item) => [item.node.id, item]));
    for (const replacement of [...items]) {
      if (is_superseded2(replacement.node)) continue;
      const pending = [...predecessors.get(replacement.node.id) ?? []];
      const visited = /* @__PURE__ */ new Set([replacement.node.id]);
      let before = items.indexOf(replacement);
      while (pending.length) {
        const id = pending.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        pending.push(...predecessors.get(id) ?? []);
        const previous = by_id.get(id);
        if (!previous || !is_superseded2(previous.node) || previous.node.world.world_id !== replacement.node.world.world_id || previous.node.metadata.user_id !== replacement.node.metadata.user_id) continue;
        const topics = new Set(previous.node.content.claims?.map((claim) => claim.topic));
        const relevant = replacement.node.content.claims?.some((claim) => topics.has(claim.topic) && recall_tokens(`${claim.kind} ${claim.predicate} ${claim.object}`).some((term) => current_terms.has(term)));
        if (relevant) before = Math.min(before, items.indexOf(previous));
      }
      const after = items.indexOf(replacement);
      if (after > before) {
        items.splice(after, 1);
        items.splice(before, 0, replacement);
      }
    }
  };
  promote_current(ranked);
  const aggregate_query = policy2.flags.session_coverage && aggregate_query_re.test(query.text);
  if (limit !== null && !aggregate_query) ranked.splice(limit);
  const diverse = policy2.flags.matrix_retrieval && (exception_query || aggregate_query) ? (() => {
    const depth = Math.min(policy2.budgets.evidence_selection_depth, ranked.length);
    const head = ranked.slice(0, depth);
    const selected = select_evidence_set(head, {
      limit: aggregate_query ? Math.min(limit ?? head.length, head.length) : head.length,
      token_budget: query.token_budget ?? Number.POSITIVE_INFINITY,
      query_terms: recall_tokens(query.text),
      exception_query,
      terms: (item) => /* @__PURE__ */ new Set([...recall_document(item.node).frequencies.keys(), ...recall_document(item.node).speaker_terms]),
      similarity: (left, right) => memory_similarity(left.node, right.node),
      token_cost: (item) => count_tokens(memory_evidence_text(item.node, { query_terms: plan.intent.terms })),
      polarity: (item) => item.breakdown.polarity,
      relevance: (item) => item.score,
      group: aggregate_query ? (item) => conversation_of(item.node) || null : void 0
    });
    const selected_ids = new Set(selected.map((item) => item.node.id));
    return [...selected, ...head.filter((item) => !selected_ids.has(item.node.id)), ...ranked.slice(depth)];
  })() : evidence_query?.aggregate || calendar !== null ? ranked : select_diverse(ranked, {
    lambda: policy2.diversity_lambda,
    similarity: (left, right) => memory_similarity(left.node, right.node)
  });
  promote_current(diverse);
  if (limit !== null) diverse.splice(limit);
  const { bundles, forward_ids } = policy2.flags.matrix_retrieval && deps.edges?.length ? conversation_bundles(diverse, admitted, deps.edges) : { bundles: /* @__PURE__ */ new Map(), forward_ids: /* @__PURE__ */ new Set() };
  const context = build_context_packet(diverse, query.token_budget ?? Number.POSITIVE_INFINITY, { query_terms: plan.intent.terms, bundles, forward_bundle_ids: forward_ids });
  const included_ids = new Set(context.items.map((n) => n.id));
  for (const item of ranked) {
    candidates.push({
      id: item.node.id,
      admitted: true,
      label: item.label,
      score: item.score,
      included: included_ids.has(item.node.id),
      reasons: []
    });
  }
  let hopfield = null;
  if (policy2.flags.hopfield && query_vector) {
    const memories = admitted.filter((n) => n.vectors.semantic && n.vectors.semantic.length === query_vector.length).map((n) => ({ id: n.id, key: n.vectors.semantic, value: n.vectors.semantic }));
    hopfield = hopfield_recall(query_vector, memories, policy2.hopfield_beta);
  }
  const trace = {
    query: query.text,
    now: query.now,
    intent: plan.intent,
    resolved_entities: plan.resolved_entities,
    selected_worlds: plan.world_ids,
    retrieved: retrieved.length,
    admitted: admitted.length,
    rejected: retrieved.length - admitted.length,
    spread: {
      hops: spread.hops,
      visited: spread_enabled ? spread.visited.length : seed_count,
      seeds: seed_count,
      seed_density: admitted.length > 0 ? seed_count / admitted.length : 0,
      entropy: spread.entropy,
      peak: spread.peak,
      bypassed: spread.bypassed
    },
    matrix: {
      enabled: matrix_query,
      features: matrix.active_features,
      regularization: matrix.regularization,
      temperature: matrix.temperature,
      seed_threshold: policy2.flags.matrix_retrieval ? sparse.threshold : policy2.seeds.legacy_threshold
    },
    candidates,
    context_tokens: context.tokens_used,
    budget: context.budget,
    cold_scans: deps.index.cold_scans,
    evidence_rerank: {
      enabled: evidence_enabled,
      candidates: rerank_query.terms.length > 0 && ranked_entries.length > 1 ? Math.min(rerank_depth, ranked_entries.length) : 0,
      subject: evidence_query?.subject ?? null,
      aggregate: evidence_query?.aggregate ?? false
    }
  };
  return { items: ranked, context, trace, hopfield };
}

// LongMemory-main/LongMemory-main/src/core/recall/subject_relevance.ts
var stopwords2 = /* @__PURE__ */ new Set([
  "what",
  "who",
  "when",
  "where",
  "which",
  "do",
  "does",
  "did",
  "i",
  "is",
  "are",
  "was",
  "were",
  "the",
  "a",
  "an",
  "of",
  "to",
  "my",
  "me",
  "in",
  "on",
  "at",
  "and",
  "or"
]);
function prepare_subject_relevance(terms, entities) {
  return {
    meaningful_terms: terms.filter((term) => !stopwords2.has(term)),
    entity_terms: entities.map((entity) => strict_recall_tokens(entity))
  };
}
function is_subject_relevant(node, query) {
  if (query.meaningful_terms.length === 0 && query.entity_terms.length === 0) return true;
  const node_terms = subject_recall_document(node).terms;
  for (const term of query.meaningful_terms) if (node_terms.has(term)) return true;
  for (const parts of query.entity_terms) {
    if (parts.length > 0 && parts.every((part) => node_terms.has(part))) return true;
  }
  return false;
}

// LongMemory-main/LongMemory-main/src/core/recall/grounded_recall.ts
function cosine01(a, b) {
  if (!a || !b || a.values.length !== b.values.length) return 0.5;
  let dot3 = 0;
  for (let index = 0; index < a.values.length; index++) dot3 += a.values[index] * b.values[index];
  if (a.norm === 0 || b.norm === 0) return 0.5;
  return Math.min(1, Math.max(0, dot3 / (a.norm * b.norm)));
}
function reconcile(grounded, agreement) {
  if (!grounded) return "subjective_only";
  if (agreement >= 0.7) return "confirmed";
  if (agreement <= 0.3) return "contradicted";
  return "unconfirmed";
}
function grounded_recall(query, deps) {
  const at = query.now;
  const weights = deps.weights ?? default_grounding_weights;
  const plan = plan_strict_recall(
    { text: query.text, now: query.now, world_id: query.world_id, entity_names: query.entity_names },
    deps
  );
  const retrieved = deps.index.active_nodes(plan.world_ids);
  const relevance = prepare_subject_relevance(plan.intent.terms, plan.resolved_entities);
  const endocortex = retrieved.filter(
    (node) => node.world.zone === "endocortex" && is_subject_relevant(node, relevance)
  );
  const fact_ref_of = /* @__PURE__ */ new Map();
  for (const edge of deps.grounds_edges ?? []) {
    if (edge.type === "grounds") fact_ref_of.set(edge.from, edge.to);
  }
  const thresholds2 = {
    minFreshness: query.min_freshness,
    minSourceReliability: query.min_source_reliability,
    groundingThreshold: query.grounding_threshold
  };
  const items = [];
  const candidates = [];
  for (const node of endocortex) {
    const fact_ref = fact_ref_of.get(node.id) ?? node.grounding.worlddb_ref;
    const fact = fact_ref ? deps.worlddb.get(fact_ref) : null;
    if (!fact) {
      candidates.push({
        memory_id: node.id,
        grounded: false,
        fact_ref: fact_ref ?? null,
        source_id: null,
        source_kind: null,
        source_reliability: null,
        freshness: 0,
        grounding_score: 0,
        reconciliation: "subjective_only",
        accepted: false,
        reasons: ["not grounded to an external fact"]
      });
      continue;
    }
    const freshness = freshness_score(fact.observed_at, fact.valid_to, at);
    const reliability = fact.source.reliability;
    const agreement = cosine01(recall_vector(node.vectors.semantic), recall_vector(fact.vector));
    const trace2 = compute_grounding_score(
      node.id,
      fact.ref,
      {
        source_reliability: reliability,
        freshness,
        observation_count: fact.observation_count,
        external_agreement: agreement,
        conflict: 0
      },
      weights,
      at
    );
    const reconciliation = reconcile(true, agreement);
    const gate_ctx = {
      now: at,
      grounding_score: trace2.grounding_score,
      freshness,
      source_reliability: reliability,
      thresholds: {
        ...thresholds2.minFreshness != null ? { min_freshness: thresholds2.minFreshness } : {},
        ...thresholds2.minSourceReliability != null ? { min_source_reliability: thresholds2.minSourceReliability } : {},
        ...thresholds2.groundingThreshold != null ? { grounding_threshold: thresholds2.groundingThreshold } : {}
      },
      permission_context: query.permission_context
    };
    const gate = can_use_in_world_grounded_recall(node, gate_ctx);
    candidates.push({
      memory_id: node.id,
      grounded: true,
      fact_ref: fact.ref,
      source_id: fact.source.id,
      source_kind: fact.source.kind,
      source_reliability: reliability,
      freshness,
      grounding_score: trace2.grounding_score,
      reconciliation,
      accepted: gate.allowed,
      reasons: gate.reasons
    });
    if (gate.allowed) {
      items.push({
        node,
        fact_ref: fact.ref,
        grounding_score: trace2.grounding_score,
        freshness,
        reconciliation
      });
    }
  }
  items.sort((a, b) => b.grounding_score - a.grounding_score || b.freshness - a.freshness);
  const ranked = query.k != null ? items.slice(0, query.k) : items;
  const context = build_context_packet(ranked, query.token_budget ?? Number.POSITIVE_INFINITY);
  const trace = {
    query: query.text,
    now: at,
    intent: plan.intent,
    resolved_entities: plan.resolved_entities,
    selected_worlds: plan.world_ids,
    retrieved: retrieved.length,
    endocortex: endocortex.length,
    grounded_accepted: ranked.length,
    rejected: candidates.filter((c) => !c.accepted).length,
    candidates
  };
  return { items: ranked, context, trace };
}

// LongMemory-main/LongMemory-main/src/core/recall/timeline_builder.ts
function build_supersession_chains(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const successor = /* @__PURE__ */ new Map();
  const predecessor = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (edge.type !== "supersedes") continue;
    const old_id = edge.to;
    const new_id = edge.from;
    successor.set(old_id, new_id);
    predecessor.set(new_id, old_id);
  }
  const chains = [];
  const visited = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    const start = node.id;
    if (visited.has(start)) continue;
    const pred = predecessor.get(start);
    if (pred && ids.has(pred)) continue;
    const ordered = [];
    let current = start;
    while (current && ids.has(current) && !visited.has(current)) {
      ordered.push(current);
      visited.add(current);
      current = successor.get(current);
    }
    if (ordered.length >= 2) chains.push({ ordered });
  }
  return chains;
}
function build_timeline(nodes, edges, opts) {
  const entries = nodes.map((node) => {
    const t = node.temporal;
    return {
      id: node.id,
      node,
      valid_from: t.valid_from,
      valid_to: t.valid_to,
      observed_at: t.observed_at,
      recorded_at: t.recorded_at,
      superseded_at: t.superseded_at,
      status: node.state.status,
      is_current: is_current(node, opts.now),
      valid_at_query: opts.valid_time !== void 0 ? is_valid_at(node, opts.valid_time) : false,
      believed_at_query: opts.recorded_time !== void 0 ? is_recorded_at(node, opts.recorded_time) : false
    };
  });
  entries.sort((a, b) => a.valid_from - b.valid_from || a.recorded_at - b.recorded_at);
  return {
    entries,
    chains: build_supersession_chains(nodes, edges),
    world_truth_at_time: opts.valid_time !== void 0 ? nodes.filter((n) => is_valid_at(n, opts.valid_time)) : [],
    agent_belief_at_time: opts.recorded_time !== void 0 ? nodes.filter((n) => is_recorded_at(n, opts.recorded_time)) : [],
    current_truth: nodes.filter((n) => is_current(n, opts.now))
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/historical_recall.ts
function historical_recall(query, deps) {
  const plan = plan_strict_recall(
    { text: query.text, now: query.now, world_id: query.world_id, entity_names: query.entity_names },
    deps
  );
  const retrieved = deps.index.active_nodes(plan.world_ids);
  const relevance = prepare_subject_relevance(plan.intent.terms, plan.resolved_entities);
  const relevant = retrieved.filter((node) => can_access_node(node, { now: query.now, permission_context: query.permission_context }).allowed && is_subject_relevant(node, relevance));
  const timeline = build_timeline(relevant, deps.supersedes_edges ?? [], {
    now: query.now,
    valid_time: query.valid_time,
    recorded_time: query.recorded_time
  });
  const trace = {
    query: query.text,
    now: query.now,
    valid_time: query.valid_time,
    recorded_time: query.recorded_time,
    intent: plan.intent,
    resolved_entities: plan.resolved_entities,
    selected_worlds: plan.world_ids,
    retrieved: retrieved.length,
    relevant: relevant.length,
    world_truth_count: timeline.world_truth_at_time.length,
    agent_belief_count: timeline.agent_belief_at_time.length,
    current_truth_count: timeline.current_truth.length,
    chains: timeline.chains,
    entries: timeline.entries
  };
  return { timeline, trace };
}

// LongMemory-main/LongMemory-main/src/core/recall/scoring.ts
var day_ms5 = 864e5;
var default_strict_scoring_weights = {
  vector: 0.25,
  lexical: 0.15,
  entity: 0.15,
  temporal: 0.1,
  confidence: 0.1,
  grounding: 0.1,
  provenance: 0.05,
  utility: 0.05,
  contradiction: 0.3,
  staleness: 0.2
};
function clamp014(x) {
  return Math.min(1, Math.max(0, x));
}
function cosine2(a, b) {
  if (!a || !b || a.values.length !== b.values.length) return 0;
  let dot3 = 0;
  for (let index = 0; index < a.values.length; index++) dot3 += a.values[index] * b.values[index];
  if (a.norm === 0 || b.norm === 0) return 0;
  return clamp014(dot3 / (a.norm * b.norm));
}
var method_reliability = {
  manual: 0.8,
  llm: 0.6,
  heuristic: 0.5,
  import: 0.7,
  synthetic: 0.3
};
function lexical_score_of(query_terms, node_terms) {
  if (query_terms.length === 0) return 0.5;
  let hits = 0;
  for (const t of query_terms) if (node_terms.has(t)) hits++;
  return hits / query_terms.length;
}
function entity_match_of(entity_terms, node_terms) {
  if (entity_terms.length === 0) return 0.5;
  let matched = 0;
  for (const parts of entity_terms) {
    if (parts.length > 0 && parts.every((p) => node_terms.has(p))) matched++;
  }
  return matched / entity_terms.length;
}
function provenance_quality_of(node) {
  let q = method_reliability[node.provenance.extraction_method] ?? 0.5;
  if (node.provenance.source_trace.length === 0) q *= 0.5;
  return clamp014(q);
}
function score_candidate(node, ctx, weights = default_strict_scoring_weights) {
  const node_terms = strict_recall_document(node).terms;
  const age_days = Math.max(0, (ctx.at - node.temporal.observed_at) / day_ms5);
  const query_vector = ctx.prepared_query_vector === void 0 ? recall_vector(ctx.query_vector) : ctx.prepared_query_vector;
  const entity_terms = ctx.resolved_entity_terms ?? ctx.resolved_entities.map((entity) => strict_recall_tokens(entity));
  const semantic_similarity = cosine2(query_vector, recall_vector(node.vectors.semantic));
  const lexical_score = lexical_score_of(ctx.query_terms, node_terms);
  const entity_match = entity_match_of(entity_terms, node_terms);
  const temporal_relevance = clamp014(Math.exp(-age_days / 90));
  const confidence = clamp014(node.state.confidence);
  const grounding_score = clamp014(node.grounding.grounding_score);
  const provenance_quality = provenance_quality_of(node);
  const utility = clamp014(node.state.salience);
  const contradiction_pressure = clamp014(ctx.contradiction_pressure);
  const staleness = clamp014(age_days / 365);
  const score = weights.vector * semantic_similarity + weights.lexical * lexical_score + weights.entity * entity_match + weights.temporal * temporal_relevance + weights.confidence * confidence + weights.grounding * grounding_score + weights.provenance * provenance_quality + weights.utility * utility - weights.contradiction * contradiction_pressure - weights.staleness * staleness;
  return {
    score,
    semantic_similarity,
    lexical_score,
    entity_match,
    temporal_relevance,
    confidence,
    grounding_score,
    provenance_quality,
    utility,
    sketch_boost: 0,
    contradiction_pressure,
    staleness
  };
}

// LongMemory-main/LongMemory-main/src/core/recall/strict_recall.ts
function strict_recall(query, deps, options = {}) {
  const at = query.at ?? query.now;
  const weights = options.weights ?? default_strict_scoring_weights;
  const plan = plan_strict_recall(query, deps);
  const retrieved = deps.index.active_nodes(plan.world_ids);
  const query_vector = query.vector ?? deps.embed_query?.(query.text) ?? null;
  const prepared_query_vector = recall_vector(query_vector);
  const resolved_entity_terms = plan.resolved_entities.map((entity) => strict_recall_tokens(entity));
  const accepted = [];
  const trace_candidates = [];
  for (const node of retrieved) {
    const gate_ctx = {
      now: at,
      grounding_score: node.grounding.grounding_score,
      unresolved_contradiction: deps.unresolved_contradiction?.(node.id) ?? false,
      thresholds: query.min_confidence != null ? { min_confidence: query.min_confidence } : void 0,
      permission_context: query.permission_context
    };
    const gate = can_use_in_strict_recall(node, gate_ctx);
    if (gate.allowed) {
      accepted.push(node);
    } else {
      trace_candidates.push({
        id: node.id,
        accepted: false,
        label: gate.label,
        score: null,
        reasons: gate.reasons,
        included: false
      });
    }
  }
  const limit = query.k == null ? null : Math.max(0, query.k);
  const ranked_entries = [];
  for (let node_index = 0; node_index < accepted.length; node_index++) {
    const node = accepted[node_index];
    const base = score_candidate(
      node,
      {
        at,
        query_terms: plan.intent.terms,
        query_vector,
        resolved_entities: plan.resolved_entities,
        contradiction_pressure: deps.contradiction_pressure_of?.(node.id) ?? 0,
        prepared_query_vector,
        resolved_entity_terms
      },
      weights
    );
    const sketch_boost = Math.min(
      0.2,
      Math.max(0, deps.sketch_relevance_of?.(node, plan.intent.terms) ?? 0)
    );
    const score = base.score + sketch_boost;
    if (limit === 0) continue;
    const last = ranked_entries.at(-1);
    if (limit !== null && ranked_entries.length >= limit && last && score <= last.candidate.score) continue;
    const candidate = {
      node,
      score,
      breakdown: { ...base, sketch_boost, score }
    };
    if (limit === null) {
      ranked_entries.push({ candidate, order: node_index });
      continue;
    }
    let low = 0;
    let high = ranked_entries.length;
    while (low < high) {
      const middle = low + high >>> 1;
      const current = ranked_entries[middle];
      if (score > current.candidate.score || score === current.candidate.score && node_index < current.order) high = middle;
      else low = middle + 1;
    }
    ranked_entries.splice(low, 0, { candidate, order: node_index });
    if (ranked_entries.length > limit) ranked_entries.pop();
  }
  if (limit === null) ranked_entries.sort((left, right) => right.candidate.score - left.candidate.score || left.order - right.order);
  const items = ranked_entries.map((entry) => entry.candidate);
  const context = build_context_packet(items, query.token_budget ?? Number.POSITIVE_INFINITY);
  const included_ids = new Set(context.items.map((n) => n.id));
  for (const candidate of items) {
    trace_candidates.push({
      id: candidate.node.id,
      accepted: true,
      label: "active",
      score: candidate.score,
      reasons: [],
      included: included_ids.has(candidate.node.id)
    });
  }
  const trace = {
    query: query.text,
    at,
    intent: plan.intent,
    resolved_entities: plan.resolved_entities,
    selected_worlds: plan.world_ids,
    retrieved: retrieved.length,
    accepted: accepted.length,
    rejected: retrieved.length - accepted.length,
    candidates: trace_candidates,
    context_tokens: context.tokens_used,
    budget: context.budget,
    cold_scans: deps.index.cold_scans
  };
  return { items, context, trace };
}

// LongMemory-main/LongMemory-main/src/core/connectors/permission.ts
function permission_contract(permission) {
  return {
    privacy_level: permission.scope === "public" ? "public" : "private",
    source_permission: {
      scope: permission.scope,
      user_ids: [...permission.user_ids],
      team_ids: [...permission.team_ids],
      project_ids: [...permission.project_ids],
      source_id: permission.source_id
    }
  };
}

// LongMemory-main/LongMemory-main/src/stores/sqlite/sqlite_store.ts
import Database from "better-sqlite3";

// LongMemory-main/LongMemory-main/src/stores/sqlite/integrity.ts
function decode_node_safely(row, record_id, issues) {
  try {
    const parsed = JSON.parse(row.node_json);
    const node = parsed.metadata === void 0 ? { ...parsed, metadata: {} } : parsed;
    if (node.id !== record_id) {
      issues?.push({ table: "hydro_nodes", record_id, code: "id_mismatch", message: `payload id ${node.id}` });
      return null;
    }
    if (node.content_hash !== row.content_hash || !verify_node_hash(node)) {
      issues?.push({ table: "hydro_nodes", record_id, code: "hash_mismatch", message: "content hash does not verify" });
      return null;
    }
    return node;
  } catch (error) {
    issues?.push({
      table: "hydro_nodes",
      record_id,
      code: "invalid_json",
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}
function validate_sketch(state) {
  const data = JSON.parse(state);
  if (data.kind === "memory-sketches") MemorySketches.deserialize(data);
  else if (data.kind === "count-min") CountMinSketch.deserialize(data);
  else if (data.kind === "frequent-directions") FrequentDirections.deserialize(data);
  else if (data.kind === "oja") OjaTracker.deserialize(data);
  else throw new Error(`unknown sketch kind ${String(data.kind)}`);
}
function check_sqlite_integrity(db, scope) {
  const issues = [];
  const quick = db.pragma("quick_check");
  for (const row of quick) {
    if (row.quick_check !== "ok") {
      issues.push({ table: "sqlite", record_id: "database", code: "sqlite", message: row.quick_check });
    }
  }
  const node_rows = db.prepare(`SELECT node_id, node_json, content_hash FROM hydro_nodes
        WHERE tenant_id = ? AND user_id = ?`).all(scope.tenant_id, scope.user_id);
  const node_ids = /* @__PURE__ */ new Set();
  for (const row of node_rows) {
    if (decode_node_safely(row, row.node_id, issues)) node_ids.add(row.node_id);
  }
  const world_ids = new Set(
    db.prepare("SELECT world_id FROM worlds WHERE tenant_id = ? AND user_id = ?").all(scope.tenant_id, scope.user_id).map((row) => row.world_id)
  );
  const entity_ids = new Set(
    db.prepare("SELECT entity_id FROM entities WHERE tenant_id = ? AND user_id = ?").all(scope.tenant_id, scope.user_id).map((row) => row.entity_id)
  );
  const fact_refs = new Set(
    db.prepare("SELECT fact_ref FROM grounded_facts WHERE tenant_id = ? AND user_id = ?").all(scope.tenant_id, scope.user_id).map((row) => row.fact_ref)
  );
  const endpoint_exists = (id) => node_ids.has(id) || world_ids.has(id) || entity_ids.has(id) || fact_refs.has(id);
  const edge_rows = db.prepare(`SELECT edge_id, from_id, to_id, edge_json FROM hydro_edges
        WHERE tenant_id = ? AND user_id = ?`).all(scope.tenant_id, scope.user_id);
  for (const row of edge_rows) {
    try {
      const edge = JSON.parse(row.edge_json);
      if (edge.id !== row.edge_id || edge.from !== row.from_id || edge.to !== row.to_id) {
        issues.push({ table: "hydro_edges", record_id: row.edge_id, code: "id_mismatch", message: "edge payload does not match indexed columns" });
      }
      if (!endpoint_exists(row.from_id)) {
        issues.push({ table: "hydro_edges", record_id: row.edge_id, code: "dangling_edge", message: `missing from endpoint ${row.from_id}` });
      }
      if (!endpoint_exists(row.to_id)) {
        issues.push({ table: "hydro_edges", record_id: row.edge_id, code: "dangling_edge", message: `missing to endpoint ${row.to_id}` });
      }
    } catch (error) {
      issues.push({
        table: "hydro_edges",
        record_id: row.edge_id,
        code: "invalid_json",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const sketch_rows = db.prepare(`SELECT sketch_key, state_json FROM sketch_states
        WHERE tenant_id = ? AND user_id = ?`).all(scope.tenant_id, scope.user_id);
  for (const row of sketch_rows) {
    try {
      validate_sketch(row.state_json);
    } catch (error) {
      issues.push({
        table: "sketch_states",
        record_id: row.sketch_key,
        code: "invalid_sketch",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    ok: issues.length === 0,
    checked_nodes: node_rows.length,
    checked_edges: edge_rows.length,
    checked_sketches: sketch_rows.length,
    issues
  };
}

// LongMemory-main/LongMemory-main/src/stores/sqlite/migrations.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
function load_schema_sql() {
  return readFileSync(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8");
}
function migrations() {
  return [
    { version: 1, name: "initial_hydrograph_schema", sql: load_schema_sql() },
    {
      version: 2,
      name: "incremental_sketch_journal",
      sql: `ALTER TABLE sketch_states ADD COLUMN applied_operation_id INTEGER NOT NULL DEFAULT 0;
                CREATE TABLE sketch_operations (
                    operation_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    sketch_key TEXT NOT NULL,
                    operation_json TEXT NOT NULL,
                    recorded_at INTEGER NOT NULL
                );
                CREATE INDEX idx_sketch_operations_scope
                    ON sketch_operations (tenant_id, user_id, sketch_key, operation_id);`
    },
    {
      version: 3,
      name: "normalized_world_memberships",
      sql: `CREATE TABLE IF NOT EXISTS world_node_refs (
                    tenant_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    world_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, user_id, world_id, node_id)
                );
                CREATE TABLE IF NOT EXISTS world_edge_refs (
                    tenant_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    world_id TEXT NOT NULL,
                    edge_id TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, user_id, world_id, edge_id)
                );
                INSERT OR IGNORE INTO world_node_refs (tenant_id, user_id, world_id, node_id)
                    SELECT worlds.tenant_id, worlds.user_id, worlds.world_id, value
                    FROM worlds, json_each(worlds.world_json, '$.node_refs');
                INSERT OR IGNORE INTO world_edge_refs (tenant_id, user_id, world_id, edge_id)
                    SELECT worlds.tenant_id, worlds.user_id, worlds.world_id, value
                    FROM worlds, json_each(worlds.world_json, '$.edge_refs');
                UPDATE worlds SET world_json = json_set(
                    world_json,
                    '$.node_refs', json('[]'),
                    '$.edge_refs', json('[]')
                );
                CREATE INDEX IF NOT EXISTS idx_world_node_refs_node
                    ON world_node_refs (tenant_id, user_id, node_id);
                CREATE INDEX IF NOT EXISTS idx_world_edge_refs_edge
                    ON world_edge_refs (tenant_id, user_id, edge_id);`
    }
  ];
}
function apply_migrations(db, now = Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
    )`);
  const applied = new Set(
    db.prepare("SELECT version FROM migrations").all().map((row) => row.version)
  );
  const completed = [];
  for (const migration of migrations()) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, now);
    })();
    completed.push(migration.version);
  }
  return completed;
}

// LongMemory-main/LongMemory-main/src/stores/sqlite/queries.ts
var queries = {
  load_node: `SELECT node_id, node_json, content_hash FROM hydro_nodes
        WHERE tenant_id = ? AND user_id = ? AND node_id = ?`,
  load_edge: `SELECT edge_json FROM hydro_edges
        WHERE tenant_id = ? AND user_id = ? AND edge_id = ?`,
  current_truth: `SELECT node_id, node_json, content_hash FROM hydro_nodes
        WHERE tenant_id = @tenant_id AND user_id = @user_id
          AND valid_from <= @at AND (valid_to IS NULL OR valid_to > @at)
          AND (superseded_at IS NULL OR superseded_at > @at)
          AND status = 'active'
          AND (@world_id IS NULL OR world_id = @world_id)
        ORDER BY recorded_at DESC LIMIT @limit`,
  historical_truth: `SELECT node_id, node_json, content_hash FROM hydro_nodes
        WHERE tenant_id = @tenant_id AND user_id = @user_id
          AND valid_from <= @at AND (valid_to IS NULL OR valid_to > @at)
          AND (@world_id IS NULL OR world_id = @world_id)
        ORDER BY valid_from DESC, recorded_at DESC LIMIT @limit`,
  strict_candidates: `SELECT n.node_id, n.node_json, n.content_hash FROM hydro_nodes n
        WHERE n.tenant_id = @tenant_id AND n.user_id = @user_id
          AND n.valid_from <= @at AND (n.valid_to IS NULL OR n.valid_to > @at)
          AND (n.superseded_at IS NULL OR n.superseded_at > @at)
          AND n.status = 'active' AND n.use_for_reasoning = 1
          AND n.confidence >= @min_confidence
          AND (
              json_extract(n.node_json, '$.contract.max_valid_duration') IS NULL
              OR n.valid_from + json_extract(n.node_json, '$.contract.max_valid_duration') > @at
          )
          AND (n.requires_grounding = 0 OR n.grounding_score >= @grounding_threshold)
          AND (
              n.source_required = 0
              OR n.grounding_ref IS NOT NULL
              OR json_array_length(json_extract(n.node_json, '$.provenance.source_trace')) > 0
          )
          AND (@world_id IS NULL OR n.world_id = @world_id)
          AND NOT EXISTS (
              SELECT 1 FROM contradictions c
              WHERE c.tenant_id = n.tenant_id AND c.user_id = n.user_id
                AND c.resolved = 0 AND (c.node_a = n.node_id OR c.node_b = n.node_id)
          )
        ORDER BY n.confidence DESC, n.grounding_score DESC, n.recorded_at DESC
        LIMIT @limit`,
  aliases_for_entity: `SELECT alias FROM entity_aliases
        WHERE tenant_id = ? AND user_id = ? AND entity_id = ? ORDER BY normalized_alias`,
  canonical_alias: `SELECT entity_id FROM entity_aliases
        WHERE tenant_id = ? AND user_id = ? AND normalized_alias = ?`
};

// LongMemory-main/LongMemory-main/src/stores/sqlite/sqlite_store.ts
function normalize_alias(value) {
  return value.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}
function sketch_kind(state) {
  return String(JSON.parse(state).kind ?? "unknown");
}
var SqliteStore = class {
  kind = "sqlite";
  tenant_id;
  user_id;
  database;
  startup_integrity_report;
  now;
  runtime_issues = [];
  statements = /* @__PURE__ */ new Map();
  constructor(path = ":memory:", options = {}) {
    this.tenant_id = options.tenant_id ?? "default";
    this.user_id = options.user_id ?? "default";
    this.now = options.now ?? (() => Date.now());
    this.database = new Database(path, {
      readonly: options.readonly ?? false,
      fileMustExist: options.file_must_exist ?? false
    });
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    if (!(options.readonly ?? false)) {
      if (path !== ":memory:") this.database.pragma("journal_mode = WAL");
      this.database.pragma("synchronous = NORMAL");
      apply_migrations(this.database, this.now());
    }
    this.startup_integrity_report = options.startup_integrity_check === false ? { ok: true, checked_nodes: 0, checked_edges: 0, checked_sketches: 0, issues: [] } : this.check_integrity();
  }
  transaction(operation) {
    return this.database.transaction(operation)();
  }
  prepare(sql) {
    const cached = this.statements.get(sql);
    if (cached) return cached;
    const statement = this.database.prepare(sql);
    this.statements.set(sql, statement);
    return statement;
  }
  save_node(node) {
    this.transaction(() => this.save_node_internal(node));
  }
  save_node_internal(node) {
    this.prepare(`INSERT INTO hydro_nodes (
            tenant_id, user_id, node_id, content_hash, content_json, facets_json, node_json,
            world_id, parent_world_id, zone, status, confidence, salience,
            valid_from, valid_to, observed_at, recorded_at, superseded_at,
            grounding_ref, grounding_score, requires_grounding, use_for_reasoning, source_required
        ) VALUES (
            @tenant_id, @user_id, @node_id, @content_hash, @content_json, @facets_json, @node_json,
            @world_id, @parent_world_id, @zone, @status, @confidence, @salience,
            @valid_from, @valid_to, @observed_at, @recorded_at, @superseded_at,
            @grounding_ref, @grounding_score, @requires_grounding, @use_for_reasoning, @source_required
        ) ON CONFLICT (tenant_id, user_id, node_id) DO UPDATE SET
            node_json = excluded.node_json,
            status = excluded.status,
            confidence = excluded.confidence,
            salience = excluded.salience,
            valid_to = excluded.valid_to,
            recorded_at = excluded.recorded_at,
            superseded_at = excluded.superseded_at,
            grounding_ref = excluded.grounding_ref,
            grounding_score = excluded.grounding_score,
            requires_grounding = excluded.requires_grounding,
            use_for_reasoning = excluded.use_for_reasoning,
            source_required = excluded.source_required`).run({
      tenant_id: this.tenant_id,
      user_id: this.user_id,
      node_id: node.id,
      content_hash: node.content_hash,
      content_json: JSON.stringify(node.content),
      facets_json: JSON.stringify(node.facets),
      node_json: JSON.stringify(node),
      world_id: node.world.world_id,
      parent_world_id: node.world.parent_world_id,
      zone: node.world.zone,
      status: node.state.status,
      confidence: node.state.confidence,
      salience: node.state.salience,
      valid_from: node.temporal.valid_from,
      valid_to: node.temporal.valid_to,
      observed_at: node.temporal.observed_at,
      recorded_at: node.temporal.recorded_at,
      superseded_at: node.temporal.superseded_at,
      grounding_ref: node.grounding.worlddb_ref,
      grounding_score: node.grounding.grounding_score,
      requires_grounding: Number(node.contract.requires_grounding),
      use_for_reasoning: Number(node.contract.use_for_reasoning),
      source_required: Number(node.contract.source_required)
    });
    this.prepare(`INSERT INTO memory_contracts (tenant_id, user_id, node_id, contract_json)
            VALUES (?, ?, ?, ?) ON CONFLICT (tenant_id, user_id, node_id)
            DO UPDATE SET contract_json = excluded.contract_json`).run(this.tenant_id, this.user_id, node.id, JSON.stringify(node.contract));
  }
  load_node(node_id) {
    const row = this.prepare(queries.load_node).get(this.tenant_id, this.user_id, node_id);
    return row ? decode_node_safely(row, row.node_id, this.runtime_issues) : null;
  }
  load_edge(edge_id) {
    const row = this.prepare(queries.load_edge).get(this.tenant_id, this.user_id, edge_id);
    if (!row) return null;
    try {
      const edge = JSON.parse(row.edge_json);
      return edge.id === edge_id ? edge : null;
    } catch (error) {
      this.runtime_issues.push({
        table: "hydro_edges",
        record_id: edge_id,
        code: "invalid_json",
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  load_nodes() {
    const rows = this.prepare(`SELECT node_id, node_json, content_hash FROM hydro_nodes
            WHERE tenant_id = ? AND user_id = ? ORDER BY recorded_at, node_id`).all(this.tenant_id, this.user_id);
    return rows.flatMap((row) => {
      const node = decode_node_safely(row, row.node_id, this.runtime_issues);
      return node ? [node] : [];
    });
  }
  load_edges() {
    const rows = this.prepare(`SELECT edge_id, edge_json FROM hydro_edges
            WHERE tenant_id = ? AND user_id = ? ORDER BY recorded_at, edge_id`).all(this.tenant_id, this.user_id);
    return rows.flatMap((row) => {
      try {
        const edge = JSON.parse(row.edge_json);
        return edge.id === row.edge_id ? [edge] : [];
      } catch {
        return [];
      }
    });
  }
  load_worlds() {
    const rows = this.prepare(`SELECT world_json FROM worlds
            WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at, world_id`).all(this.tenant_id, this.user_id);
    const worlds = rows.flatMap((row) => {
      try {
        return [JSON.parse(row.world_json)];
      } catch {
        return [];
      }
    });
    const normalized = this.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='world_node_refs'`).get();
    if (!normalized) return worlds;
    const by_id = new Map(worlds.map((world) => [world.id, world]));
    for (const world of worlds) {
      world.node_refs = [];
      world.edge_refs = [];
    }
    const node_refs = this.prepare(`SELECT world_id, node_id FROM world_node_refs
            WHERE tenant_id=? AND user_id=? ORDER BY world_id, node_id`).all(this.tenant_id, this.user_id);
    for (const ref of node_refs) by_id.get(ref.world_id)?.node_refs.push(ref.node_id);
    const edge_refs = this.prepare(`SELECT world_id, edge_id FROM world_edge_refs
            WHERE tenant_id=? AND user_id=? ORDER BY world_id, edge_id`).all(this.tenant_id, this.user_id);
    for (const ref of edge_refs) by_id.get(ref.world_id)?.edge_refs.push(ref.edge_id);
    return worlds;
  }
  load_entities() {
    const rows = this.prepare(`SELECT entity_json FROM entities
            WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at, entity_id`).all(this.tenant_id, this.user_id);
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.entity_json)];
      } catch {
        return [];
      }
    });
  }
  load_grounded_facts() {
    const rows = this.prepare(`SELECT fact_json FROM grounded_facts
            WHERE tenant_id = ? AND user_id = ? ORDER BY observed_at, fact_ref`).all(this.tenant_id, this.user_id);
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.fact_json)];
      } catch {
        return [];
      }
    });
  }
  save_batch(nodes, edges = []) {
    this.transaction(() => {
      for (const node of nodes) this.save_node_internal(node);
      for (const edge of edges) this.save_edge(edge);
    });
  }
  persist_maintenance(nodes, event) {
    this.transaction(() => {
      for (const node of nodes) this.save_node_internal(node);
      this.prepare(`INSERT INTO audit_log
                (tenant_id, user_id, edge_id, edge_type, at, affected_node_ids_json, summary, audit_json)
                VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`).run(
        this.tenant_id,
        this.user_id,
        event.kind,
        event.at,
        JSON.stringify(event.node_ids),
        `${event.kind} updated ${event.node_ids.length} node(s)`,
        JSON.stringify(event)
      );
    });
  }
  persist_ingest(result) {
    const persist = () => {
      for (const node of result.changed_nodes) this.save_node_internal(node);
      for (const edge of result.edges) this.save_edge(edge);
      this.prepare(`INSERT INTO audit_log
                (tenant_id, user_id, edge_id, edge_type, at, affected_node_ids_json, summary, audit_json)
                VALUES (?, ?, NULL, 'ingest', ?, ?, ?, ?)`).run(
        this.tenant_id,
        this.user_id,
        result.node.temporal.recorded_at,
        JSON.stringify(result.diff.index_updates),
        `ingest committed ${result.diff.created_node_ids.length} nodes and ${result.diff.created_edge_ids.length} edges`,
        JSON.stringify({ diff: result.diff, trace: result.trace })
      );
      for (const operation of sketch_operations_for(result)) this.save_sketch_operation("global", operation, result.node.temporal.recorded_at);
    };
    if (this.database.inTransaction) persist();
    else this.transaction(persist);
  }
  save_edge(edge) {
    this.prepare(`INSERT OR IGNORE INTO hydro_edges (
            tenant_id, user_id, edge_id, from_id, to_id, edge_type, confidence, weight,
            valid_from, valid_to, observed_at, recorded_at, handler, edge_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      this.tenant_id,
      this.user_id,
      edge.id,
      edge.from,
      edge.to,
      edge.type,
      edge.confidence,
      edge.weight,
      edge.temporal.valid_from,
      edge.temporal.valid_to,
      edge.temporal.observed_at,
      edge.temporal.recorded_at,
      edge.handler.handler,
      JSON.stringify(edge)
    );
  }
  execute_edge_transaction(edge, registry = default_edge_registry()) {
    return this.transaction(() => {
      const from = this.load_node(edge.from);
      const to = this.load_node(edge.to);
      if (!from || !to) throw new Error(`edge endpoints must be valid stored nodes: ${edge.from}, ${edge.to}`);
      const context = new EdgeContext({ now: edge.temporal.recorded_at, nodes: [from, to] });
      const result = insert_edge(edge, context, registry);
      for (const node of context.node_list()) this.save_node_internal(node);
      this.save_edge(edge);
      for (const contradiction of context.unresolved_contradictions()) this.save_contradiction(contradiction);
      this.save_audit(result.audit);
      return result;
    });
  }
  query_current_truth(options) {
    return this.query_nodes(queries.current_truth, options);
  }
  query_historical_truth(options) {
    return this.query_nodes(queries.historical_truth, options);
  }
  query_strict_candidates(options) {
    const rows = this.prepare(queries.strict_candidates).all({
      tenant_id: this.tenant_id,
      user_id: this.user_id,
      at: options.at,
      world_id: options.world_id ?? null,
      limit: options.limit ?? 100,
      min_confidence: options.min_confidence ?? 0.5,
      grounding_threshold: options.grounding_threshold ?? 0.6
    });
    return rows.flatMap((row) => {
      const node = decode_node_safely(row, row.node_id, this.runtime_issues);
      return node ? [node] : [];
    });
  }
  query_nodes(sql, options) {
    const rows = this.prepare(sql).all({
      tenant_id: this.tenant_id,
      user_id: this.user_id,
      at: options.at,
      world_id: options.world_id ?? null,
      limit: options.limit ?? 100
    });
    return rows.flatMap((row) => {
      const node = decode_node_safely(row, row.node_id, this.runtime_issues);
      return node ? [node] : [];
    });
  }
  save_world(world, sync_references = true) {
    const compact = { ...world, node_refs: [], edge_refs: [] };
    this.prepare(`INSERT INTO worlds
            (tenant_id, user_id, world_id, parent_world_id, name, zone, content_hash, world_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id, user_id, world_id) DO UPDATE SET
                parent_world_id=excluded.parent_world_id, name=excluded.name, zone=excluded.zone,
                content_hash=excluded.content_hash, world_json=excluded.world_json, updated_at=excluded.updated_at`).run(this.tenant_id, this.user_id, world.id, world.parent_world_id, world.name, world.zone, world.content_hash, JSON.stringify(compact), world.updated_at);
    if (!sync_references) return;
    this.prepare(`DELETE FROM world_node_refs WHERE tenant_id=? AND user_id=? AND world_id=?`).run(this.tenant_id, this.user_id, world.id);
    this.prepare(`DELETE FROM world_edge_refs WHERE tenant_id=? AND user_id=? AND world_id=?`).run(this.tenant_id, this.user_id, world.id);
    for (const node_id of world.node_refs) this.add_world_node_ref(world.id, node_id);
    for (const edge_id of world.edge_refs) this.add_world_edge_ref(world.id, edge_id);
  }
  add_world_node_ref(world_id, node_id) {
    this.prepare(`INSERT OR IGNORE INTO world_node_refs (tenant_id, user_id, world_id, node_id)
            VALUES (?, ?, ?, ?)`).run(this.tenant_id, this.user_id, world_id, node_id);
  }
  add_world_edge_ref(world_id, edge_id) {
    this.prepare(`INSERT OR IGNORE INTO world_edge_refs (tenant_id, user_id, world_id, edge_id)
            VALUES (?, ?, ?, ?)`).run(this.tenant_id, this.user_id, world_id, edge_id);
  }
  save_entity(entity) {
    this.transaction(() => {
      this.prepare(`INSERT INTO entities
                (tenant_id, user_id, entity_id, canonical_name, entity_type, confidence, entity_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (tenant_id, user_id, entity_id) DO UPDATE SET
                    canonical_name=excluded.canonical_name, entity_type=excluded.entity_type,
                    confidence=excluded.confidence, entity_json=excluded.entity_json, updated_at=excluded.updated_at`).run(this.tenant_id, this.user_id, entity.id, entity.canonical_name, entity.type, entity.confidence, JSON.stringify(entity), entity.updated_at);
      for (const alias of [entity.canonical_name, ...entity.aliases]) {
        this.prepare(`INSERT INTO entity_aliases
                    (tenant_id, user_id, normalized_alias, entity_id, alias) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (tenant_id, user_id, normalized_alias) DO UPDATE SET entity_id=excluded.entity_id, alias=excluded.alias`).run(this.tenant_id, this.user_id, normalize_alias(alias), entity.id, alias);
      }
    });
  }
  load_entity(entity_id2) {
    const row = this.prepare(`SELECT entity_json FROM entities
            WHERE tenant_id=? AND user_id=? AND entity_id=?`).get(this.tenant_id, this.user_id, entity_id2);
    if (!row) return null;
    try {
      return JSON.parse(row.entity_json);
    } catch {
      return null;
    }
  }
  canonical_entity_id(alias) {
    const row = this.prepare(queries.canonical_alias).get(this.tenant_id, this.user_id, normalize_alias(alias));
    return row?.entity_id ?? null;
  }
  save_grounded_fact(fact) {
    this.prepare(`INSERT INTO grounded_facts
            (tenant_id, user_id, fact_ref, statement, source_id, source_kind, source_reliability,
             observed_at, valid_from, valid_to, fact_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id, user_id, fact_ref) DO UPDATE SET
                statement=excluded.statement, source_id=excluded.source_id, source_kind=excluded.source_kind,
                source_reliability=excluded.source_reliability, observed_at=excluded.observed_at,
                valid_from=excluded.valid_from, valid_to=excluded.valid_to, fact_json=excluded.fact_json`).run(
      this.tenant_id,
      this.user_id,
      fact.ref,
      fact.statement,
      fact.source.id,
      fact.source.kind,
      fact.source.reliability,
      fact.observed_at,
      fact.valid_from,
      fact.valid_to,
      JSON.stringify(fact)
    );
  }
  load_grounded_fact(ref) {
    const row = this.prepare(`SELECT fact_json FROM grounded_facts
            WHERE tenant_id=? AND user_id=? AND fact_ref=?`).get(this.tenant_id, this.user_id, ref);
    if (!row) return null;
    try {
      return JSON.parse(row.fact_json);
    } catch {
      return null;
    }
  }
  save_sketch_state(key, sketches, at = this.now()) {
    this.transaction(() => {
      const state = sketches.serialize();
      const row = this.prepare(`SELECT COALESCE(MAX(operation_id), 0) AS operation_id FROM sketch_operations
                WHERE tenant_id=? AND user_id=? AND sketch_key=?`).get(this.tenant_id, this.user_id, key);
      this.prepare(`INSERT INTO sketch_states
            (tenant_id, user_id, sketch_key, sketch_kind, state_json, updated_at, applied_operation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id, user_id, sketch_key) DO UPDATE SET
                sketch_kind=excluded.sketch_kind, state_json=excluded.state_json,
                updated_at=excluded.updated_at, applied_operation_id=excluded.applied_operation_id`).run(this.tenant_id, this.user_id, key, sketch_kind(state), state, at, row.operation_id);
      this.prepare(`DELETE FROM sketch_operations
                WHERE tenant_id=? AND user_id=? AND sketch_key=? AND operation_id<=?`).run(this.tenant_id, this.user_id, key, row.operation_id);
    });
  }
  load_sketch_state(key) {
    const row = this.prepare(`SELECT state_json, applied_operation_id FROM sketch_states
            WHERE tenant_id=? AND user_id=? AND sketch_key=?`).get(this.tenant_id, this.user_id, key);
    if (!row) return null;
    try {
      const sketches = MemorySketches.deserialize(row.state_json);
      const operations = this.prepare(`SELECT operation_json FROM sketch_operations
                WHERE tenant_id=? AND user_id=? AND sketch_key=? AND operation_id>?
                ORDER BY operation_id`).all(this.tenant_id, this.user_id, key, row.applied_operation_id);
      for (const operation of operations) sketches.apply_operation(JSON.parse(operation.operation_json));
      return sketches;
    } catch (error) {
      this.runtime_issues.push({
        table: "sketch_states",
        record_id: key,
        code: "invalid_sketch",
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  save_sketch_operation(key, operation, recorded_at) {
    this.prepare(`INSERT INTO sketch_operations
            (tenant_id, user_id, sketch_key, operation_json, recorded_at) VALUES (?, ?, ?, ?, ?)`).run(this.tenant_id, this.user_id, key, JSON.stringify(operation), recorded_at);
  }
  append_cold_log(payload, event_id, recorded_at = this.now()) {
    const result = this.prepare(`INSERT INTO cold_logs
            (tenant_id, user_id, event_id, recorded_at, payload_json) VALUES (?, ?, ?, ?, ?)`).run(this.tenant_id, this.user_id, event_id ?? null, recorded_at, JSON.stringify(payload));
    return Number(result.lastInsertRowid);
  }
  save_contradiction(contradiction) {
    this.prepare(`INSERT INTO contradictions
            (tenant_id, user_id, contradiction_id, node_a, node_b, severity, pressure, resolved, created_at, contradiction_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (tenant_id, user_id, contradiction_id) DO UPDATE SET
                severity=excluded.severity, pressure=excluded.pressure, resolved=excluded.resolved,
                contradiction_json=excluded.contradiction_json`).run(
      this.tenant_id,
      this.user_id,
      contradiction.id,
      contradiction.node_a,
      contradiction.node_b,
      contradiction.severity,
      contradiction.pressure,
      Number(contradiction.resolved),
      contradiction.created_at,
      JSON.stringify(contradiction)
    );
  }
  save_audit(audit) {
    this.prepare(`INSERT INTO audit_log
            (tenant_id, user_id, edge_id, edge_type, at, affected_node_ids_json, summary, audit_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      this.tenant_id,
      this.user_id,
      audit.edge_id,
      audit.edge_type,
      audit.at,
      JSON.stringify(audit.affected_node_ids),
      audit.summary,
      JSON.stringify(audit)
    );
  }
  check_integrity() {
    const report = check_sqlite_integrity(this.database, { tenant_id: this.tenant_id, user_id: this.user_id });
    if (this.runtime_issues.length === 0) return report;
    return { ...report, ok: false, issues: [...report.issues, ...this.runtime_issues] };
  }
  corruption_issues() {
    return [...this.runtime_issues];
  }
  close() {
    this.database.close();
  }
};

// LongMemory-main/LongMemory-main/src/core/i18n/crosslingual_recall.ts
var nodes_from_result = (result) => {
  if (Array.isArray(result?.items)) return result.items.map((item) => item.node).filter(Boolean);
  if (Array.isArray(result?.timeline?.entries)) return result.timeline.entries.map((item) => item.node).filter(Boolean);
  return [];
};
async function format_crosslingual_recall(original_result, query, options) {
  const threshold = query.translation_confidence_threshold ?? 0.7;
  const budget = query.token_budget ?? Number.POSITIVE_INFINITY;
  const items = [];
  let tokens_used = 0;
  for (const node of nodes_from_result(original_result)) {
    const language = node.content.language ?? "und";
    const original_text = node.content.original_text ?? node.content.raw;
    let display_text = original_text;
    let translation_used = false;
    let translation_confidence = null;
    let translation_provenance = node.content.translation_provenance ?? null;
    const may_translate = options.enable_translation && query.enable_translation !== false && options.translation_provider && language !== options.output_language && node.contract.translation_allowed && !node.contract.preserve_exact_language;
    if (may_translate) {
      if (node.content.translated_text && translation_provenance?.target_language === options.output_language && translation_provenance.confidence >= threshold) {
        display_text = node.content.translated_text;
        translation_confidence = translation_provenance.confidence;
        translation_used = true;
      } else {
        const translated = await options.translation_provider.translate(original_text, language, options.output_language);
        translation_confidence = translated.confidence;
        if (translated.confidence >= threshold) {
          display_text = translated.text;
          translation_used = true;
          translation_provenance = {
            provider: translated.provider ?? options.translation_provider.name ?? "translation-provider",
            target_language: options.output_language,
            confidence: translated.confidence,
            derived_at: Date.now(),
            source_text_hash: node.content_hash
          };
        }
      }
    }
    const cost = count_multilingual_tokens(display_text, translation_used ? options.output_language : language, node.content.script);
    if (tokens_used + cost > budget) continue;
    tokens_used += cost;
    items.push({ node, original_text, display_text, language, output_language: options.output_language, translation_used, translation_confidence, translation_provenance, provenance: node.provenance });
  }
  return {
    items,
    context: { text: items.map((item) => `- ${item.display_text}`).join("\n"), items, tokens_used, budget, within_budget: tokens_used <= budget },
    original_result,
    query_language: options.query_language,
    output_language: options.output_language
  };
}

// LongMemory-main/LongMemory-main/src/core/i18n/multilingual_embeddings.ts
import { createHash as createHash2 } from "node:crypto";
var concepts = [
  ["prefer", ["prefer", "preference", "likes", "\u092A\u0938\u0902\u0926", "\u092A\u0938\u0902\u0926 \u0939\u0948", "\u0C07\u0C37\u0C4D\u0C1F\u0C02", "\u0BB5\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0BAE\u0BCD", "\u09AA\u099B\u09A8\u09CD\u09A6", "\u067E\u0633\u0646\u062F", "\u064A\u0641\u0636\u0644", "prefiere", "pr\xE9f\xE8re", "bevorzugt", "voorkeur", "suosii", "\u559C\u6B22", "\u597D\u307F", "\uC120\uD638", "\u043F\u0440\u0435\u0434\u043F\u043E\u0447\u0438\u0442\u0430\u0435\u0442", "prefere"]],
  ["language", ["language", "\u092D\u093E\u0937\u093E", "\u092D\u0C3E\u0C37", "\u0BAE\u0BCA\u0BB4\u0BBF", "\u09AD\u09BE\u09B7\u09BE", "\u0632\u0628\u0627\u0646", "\u0644\u063A\u0629", "idioma", "langue", "sprache", "taal", "kieli", "\u8BED\u8A00", "\u8A00\u8A9E", "\uC5B8\uC5B4", "\u044F\u0437\u044B\u043A"]],
  ["backend", ["backend", "\u092C\u0948\u0915\u090F\u0902\u0921", "\u0C2C\u0C4D\u0C2F\u0C3E\u0C15\u0C46\u0C02\u0C21\u0C4D", "\u0BAA\u0BBF\u0BA9\u0BCD\u0BA4\u0BB3\u0BAE\u0BCD", "\u09AC\u09CD\u09AF\u09BE\u0995\u098F\u09A8\u09CD\u09A1", "\u0628\u06CC\u06A9 \u0627\u06CC\u0646\u0688", "\u062E\u0644\u0641\u064A\u0629", "servidor", "backend-entwicklung", "\u540E\u7AEF", "\u30D0\u30C3\u30AF\u30A8\u30F3\u30C9", "\uBC31\uC5D4\uB4DC", "\u0431\u044D\u043A\u0435\u043D\u0434"]],
  ["project", ["project", "\u092A\u0930\u093F\u092F\u094B\u091C\u0928\u093E", "\u0C2A\u0C4D\u0C30\u0C3E\u0C1C\u0C46\u0C15\u0C4D\u0C1F\u0C4D", "\u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD", "\u09AA\u09CD\u09B0\u0995\u09B2\u09CD\u09AA", "\u0645\u0646\u0635\u0648\u0628\u06C1", "\u0645\u0634\u0631\u0648\u0639", "proyecto", "projet", "projekt", "hanke", "\u9879\u76EE", "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8", "\uD504\uB85C\uC81D\uD2B8", "\u043F\u0440\u043E\u0435\u043A\u0442", "projeto"]],
  ["user", ["user", "\u0909\u092A\u092F\u094B\u0917\u0915\u0930\u094D\u0924\u093E", "\u0C35\u0C3F\u0C28\u0C3F\u0C2F\u0C4B\u0C17\u0C26\u0C3E\u0C30\u0C41", "\u0BAA\u0BAF\u0BA9\u0BB0\u0BCD", "\u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0\u0995\u09BE\u09B0\u09C0", "\u0635\u0627\u0631\u0641", "\u0645\u0633\u062A\u062E\u062F\u0645", "usuario", "utilisateur", "benutzer", "gebruiker", "k\xE4ytt\xE4j\xE4", "\u7528\u6237", "\u30E6\u30FC\u30B6\u30FC", "\uC0AC\uC6A9\uC790", "\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C"]],
  ["typescript", ["typescript", "\u091F\u093E\u0907\u092A\u0938\u094D\u0915\u094D\u0930\u093F\u092A\u094D\u091F", "\u0C1F\u0C48\u0C2A\u0C4D\u200C\u0C38\u0C4D\u0C15\u0C4D\u0C30\u0C3F\u0C2A\u0C4D\u0C1F\u0C4D", "\u0B9F\u0BC8\u0BAA\u0BCD\u0BB8\u0BCD\u0B95\u0BBF\u0BB0\u0BBF\u0BAA\u0BCD\u0B9F\u0BCD", "\u099F\u09BE\u0987\u09AA\u09B8\u09CD\u0995\u09CD\u09B0\u09BF\u09AA\u09CD\u099F", "\u0679\u0627\u0626\u067E \u0627\u0633\u06A9\u0631\u067E\u0679", "\u062A\u0627\u064A\u0628 \u0633\u0643\u0631\u064A\u0628\u062A"]]
];
var canonical_concepts = (text) => {
  const lower = text.toLocaleLowerCase();
  const found = concepts.filter(([, variants]) => variants.some((variant) => lower.includes(variant.toLocaleLowerCase()))).map(([concept]) => concept);
  return [.../* @__PURE__ */ new Set([...found, ...tokenize(text).map((token) => token.value)])];
};
var deterministic_multilingual_embeddings = class {
  constructor(dimension = 8) {
    this.dimension = dimension;
  }
  dimension;
  embed(text) {
    const vector = new Array(this.dimension).fill(0);
    for (const token of canonical_concepts(text)) {
      const digest = createHash2("sha256").update(token).digest();
      for (let index = 0; index < this.dimension; index++) vector[index] += digest[index % digest.length] / 255 * 2 - 1;
    }
    const norm2 = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm2 ? vector.map((value) => value / norm2) : vector;
  }
};

// LongMemory-main/LongMemory-main/src/core/create_memory.ts
var defaults2 = {
  store: "memory",
  db_path: "./longmemory.db",
  default_world: "memory",
  max_context_tokens: 2048,
  strict_confidence_threshold: 0.5,
  grounding_threshold: 0.6,
  enable_cold_log: false,
  enable_consolidation: false,
  benchmark_mode: false,
  tenant_id: "default",
  user_id: "default",
  embedding_dimension: 8,
  embedding_cache_size: 2048,
  default_language: "en",
  preserve_original_text: true,
  enable_translation: false,
  enable_transliteration: true,
  fallback_language: "en"
};
var bounded_embedding_cache = class {
  constructor(capacity) {
    this.capacity = capacity;
  }
  capacity;
  values = /* @__PURE__ */ new Map();
  async get(key, load) {
    if (this.capacity === 0) return load();
    const cached = this.values.get(key);
    if (cached) {
      this.values.delete(key);
      this.values.set(key, cached);
      const vector = await cached;
      return vector ? [...vector] : null;
    }
    const pending = Promise.resolve(load()).then((vector) => vector ? [...vector] : null);
    this.values.set(key, pending);
    while (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value);
    try {
      const vector = await pending;
      return vector ? [...vector] : null;
    } catch (error) {
      if (this.values.get(key) === pending) this.values.delete(key);
      throw error;
    }
  }
};
var embed = async (provider, multilingual, cache, text, language, purpose) => cache.get(`${purpose ?? "document"}:${language}:${sha256_hex(text)}`, async () => {
  if (provider) return typeof provider === "function" ? provider(text) : provider.embed(text, { language, purpose });
  return multilingual.embed(text, language);
});
function create_memory(config = {}) {
  const cfg = { ...defaults2, ...config };
  if (!Number.isInteger(cfg.embedding_cache_size) || cfg.embedding_cache_size < 0) throw new Error("embedding_cache_size must be a non-negative integer");
  const recall_policy = associative_policy_from_env(process.env, config.associative_policy);
  const multilingual_embeddings = config.multilingual_embedding_provider ?? new deterministic_multilingual_embeddings(cfg.embedding_dimension);
  const embedding_cache = new bounded_embedding_cache(cfg.embedding_cache_size);
  let store = null;
  if (cfg.store === "sqlite") {
    store = new SqliteStore(cfg.db_path, {
      tenant_id: cfg.tenant_id,
      user_id: cfg.user_id,
      readonly: config.readonly ?? false,
      file_must_exist: config.readonly ?? false,
      startup_integrity_check: true
    });
  }
  const recovered_nodes = store?.load_nodes() ?? [];
  const recovered_edges = store?.load_edges() ?? [];
  const recovered_worlds = store?.load_worlds() ?? [];
  const graph = new DurableGraph();
  const index = new InMemoryRecallIndex([]);
  const resolver = new EntityResolver();
  const worlddb = new InMemoryWorldDB();
  const recovered_sketches = store?.load_sketch_state("global");
  const sketches = recovered_sketches?.options.vector_dimension === cfg.embedding_dimension ? recovered_sketches : new MemorySketches({ vector_dimension: cfg.embedding_dimension });
  if (store && !recovered_sketches && config.readonly !== true) store.save_sketch_state("global", sketches);
  const worlds = new WorldGraph({ dim: sketches.options.vector_dimension });
  for (const node of recovered_nodes) {
    graph.apply_node_version(node);
    index.add(node);
  }
  for (const edge of recovered_edges) graph.add_edge(edge);
  for (const entity of store?.load_entities() ?? []) resolver.register_entity(entity);
  for (const fact of store?.load_grounded_facts() ?? []) worlddb.upsert(fact);
  if (recovered_worlds.length > 0) {
    worlds.restore({
      worlds: new Map(recovered_worlds.map((world) => [world.id, world])),
      primary_world_of: new Map(recovered_nodes.map((node) => [node.id, node.world.world_id])),
      placement_history: recovered_nodes.map((node) => ({
        node_id: node.id,
        from_world_id: null,
        to_world_id: node.world.world_id,
        at: node.temporal.recorded_at
      }))
    });
  }
  const engine = new IngestEngine({
    graph,
    index,
    resolver,
    worlds,
    worlddb,
    sketches,
    auto_consolidate: cfg.enable_consolidation
  });
  const traces = /* @__PURE__ */ new Map();
  let closed = false;
  const ensure_open = () => {
    if (closed) throw new Error("longmemory instance is closed");
  };
  const deps = () => ({
    index: engine.index,
    world_graph: engine.worlds,
    resolver: engine.resolver,
    contradiction_pressure_of: (id) => engine.graph.get_node(id)?.state.status === "contradicted" ? 1 : 0,
    unresolved_contradiction: (id) => engine.graph.get_node(id)?.state.status === "contradicted",
    sketch_relevance_of: (_node, terms) => engine.sketches.relevance("patterns", terms),
    decay_policy: cfg.decay_policy
  });
  const commit_node_versions = (nodes, event) => {
    if (!nodes.length) return;
    const graph_checkpoint = engine.graph.checkpoint();
    const index_checkpoint = engine.index.checkpoint();
    try {
      const versions = nodes.map((node) => engine.graph.apply_node_version(node));
      for (const node of versions) engine.index.add(node);
      store?.persist_maintenance(versions, { ...event, node_ids: versions.map((node) => node.id) });
      engine.graph.commit(graph_checkpoint);
      engine.index.commit(index_checkpoint);
    } catch (error) {
      engine.graph.rollback(graph_checkpoint);
      engine.index.rollback(index_checkpoint);
      throw error;
    }
  };
  const import_transaction = () => new IngestTransaction({
    graph: engine.graph,
    resolver: engine.resolver,
    worlds: engine.worlds,
    worlddb: engine.worlddb,
    index: engine.index,
    sketches: engine.sketches,
    working: engine.working
  });
  const import_edge = (edge, node_ids, context) => {
    const from = node_ids.get(edge.from) ?? edge.from;
    const to = node_ids.get(edge.to) ?? edge.to;
    const hydro_edge = create_hydro_edge({
      from,
      to,
      type: edge.type,
      confidence: edge.confidence,
      weight: edge.weight,
      temporal: {
        valid_from: edge.valid_from,
        valid_to: edge.valid_to,
        observed_at: edge.observed_at,
        recorded_at: edge.recorded_at
      },
      handler: { handler: edge.type, params: { connector_edge_key: edge.key, ...edge.metadata } },
      provenance: manual_provenance(`connector:${edge.key}`, edge.recorded_at)
    });
    insert_edge(hydro_edge, context, engine.edge_registry);
    return hydro_edge;
  };
  const api = {
    async ingest(event) {
      ensure_open();
      const language = event.language ?? detect_language(event.text).language ?? cfg.default_language;
      let translated_text = event.translated_text ?? null;
      let translation_provenance = event.translation_provenance ?? null;
      const translation_target = cfg.output_language;
      const translation_allowed = event.contract?.translation_allowed !== false && event.contract?.preserve_exact_language !== true;
      if (!translated_text && cfg.enable_translation && cfg.translation_provider && translation_target && translation_target !== language && translation_allowed) {
        const translated = await cfg.translation_provider.translate(event.text, language, translation_target);
        translated_text = translated.text;
        translation_provenance = {
          provider: translated.provider ?? cfg.translation_provider.name ?? "translation-provider",
          target_language: translation_target,
          confidence: translated.confidence,
          derived_at: event.at ?? Date.now(),
          source_text_hash: sha256_hex(event.text)
        };
      }
      const vector = event.vector ?? await embed(cfg.embedding_provider, multilingual_embeddings, embedding_cache, event.text, language, "document");
      const result = engine.ingest({
        ...event,
        world: event.world ?? cfg.default_world,
        vector,
        language,
        locale: event.locale,
        translated_text,
        translation_provenance,
        enable_transliteration: cfg.enable_transliteration
      });
      for (const node of result.changed_nodes) traces.set(node.id, result);
      if (store) {
        store.transaction(() => {
          store.persist_ingest(result);
          const worlds2 = new Map(result.diff.world_ids.flatMap((world_id) => engine.worlds.get_world_path(world_id)).map((world) => [world.id, world]));
          for (const world of worlds2.values()) store.save_world(world, false);
          for (const node_id of result.diff.created_node_ids) {
            const node = engine.graph.get_node(node_id);
            if (node) store.add_world_node_ref(node.world.world_id, node.id);
          }
          for (const edge of result.edges) {
            const source = engine.graph.get_node(edge.from);
            if (source) store.add_world_edge_ref(source.world.world_id, edge.id);
          }
          for (const entity_id2 of new Set(result.diff.resolved_entities.map((item) => item.id))) {
            const entity = engine.resolver.get_entity(entity_id2);
            if (entity) store.save_entity(entity);
          }
          for (const ref of new Set(result.diff.worlddb_refs)) {
            const fact = engine.worlddb.get(ref);
            if (fact) store.save_grounded_fact(fact);
          }
          if (cfg.enable_cold_log) store.append_cold_log(event, event.id, event.at);
        });
      }
      return result;
    },
    async recall(query) {
      ensure_open();
      const now = query.now ?? Date.now();
      const mode = query.mode ?? "strict";
      if (mode === "historical") {
        return historical_recall({
          text: query.text,
          now,
          valid_time: query.valid_time ?? query.at,
          recorded_time: query.recorded_time,
          world_id: query.world_id,
          entity_names: query.entity_names,
          permission_context: query.permission_context
        }, { ...deps(), supersedes_edges: engine.graph.edge_list() });
      }
      if (mode === "world_grounded") {
        return grounded_recall({
          text: query.text,
          now,
          world_id: query.world_id,
          entity_names: query.entity_names,
          k: query.k,
          token_budget: query.token_budget ?? cfg.max_context_tokens,
          min_freshness: query.min_freshness,
          min_source_reliability: query.min_source_reliability,
          grounding_threshold: query.grounding_threshold ?? cfg.grounding_threshold,
          permission_context: query.permission_context
        }, { ...deps(), worlddb: engine.worlddb, grounds_edges: engine.graph.edge_list() });
      }
      const query_language = detect_language(query.text).language;
      const vector = query.vector ?? await embed(cfg.embedding_provider, multilingual_embeddings, embedding_cache, query.text, query_language, "query");
      if (mode === "associative") {
        return associative_recall({
          text: query.text,
          now,
          at: query.at,
          world_id: query.world_id,
          entity_names: query.entity_names,
          vector,
          k: query.k,
          token_budget: query.token_budget ?? cfg.max_context_tokens,
          min_confidence: query.min_confidence,
          permission_context: query.permission_context
        }, { ...deps(), edges: engine.graph.edge_list() }, recall_policy);
      }
      return strict_recall({
        text: query.text,
        now,
        at: query.at,
        world_id: query.world_id,
        entity_names: query.entity_names,
        vector,
        k: query.k,
        token_budget: query.token_budget ?? cfg.max_context_tokens,
        min_confidence: query.min_confidence ?? cfg.strict_confidence_threshold,
        permission_context: query.permission_context
      }, deps());
    },
    async explain(id) {
      ensure_open();
      const edges = engine.graph.edge_list();
      return {
        id,
        node: engine.graph.get_node(id) ?? store?.load_node(id) ?? null,
        incoming_edges: edges.filter((edge) => edge.to === id),
        outgoing_edges: edges.filter((edge) => edge.from === id),
        ingest: traces.get(id) ?? null
      };
    },
    async getWorld(id) {
      ensure_open();
      return engine.worlds.get_world(id) ?? null;
    },
    async listWorlds(params = {}) {
      ensure_open();
      return engine.worlds.world_list().filter((world) => params.parent_world_id === void 0 || world.parent_world_id === params.parent_world_id).filter((world) => params.zone === void 0 || world.zone === params.zone).sort((left, right) => left.scope_path.join("/").localeCompare(right.scope_path.join("/"))).slice(0, params.limit ?? Number.POSITIVE_INFINITY);
    },
    async getEntity(id) {
      ensure_open();
      return engine.resolver.get_entity(id) ?? null;
    },
    async resolveEntity(input) {
      ensure_open();
      const result = resolve_multilingual_entity(engine.resolver, input);
      if (store) store.save_entity(result.entity);
      return result;
    },
    async getTimeline(params = {}) {
      ensure_open();
      return historical_recall({
        text: params.text ?? "",
        now: params.now ?? Date.now(),
        valid_time: params.valid_time,
        recorded_time: params.recorded_time,
        world_id: params.world_id,
        entity_names: params.entity_names,
        permission_context: params.permission_context
      }, { ...deps(), supersedes_edges: engine.graph.edge_list() });
    },
    async getStats() {
      return {
        store: cfg.store,
        nodes: engine.graph.node_count(),
        edges: engine.graph.edge_count(),
        worlds: engine.worlds.world_list().length,
        entities: engine.resolver.entity_list().length,
        grounded_facts: engine.graph.node_list().filter((node) => node.world.zone === "exocortex").length,
        working_memory: engine.working.size,
        cold_log_enabled: cfg.enable_cold_log,
        consolidation_enabled: cfg.enable_consolidation,
        closed
      };
    },
    async recallMultilingual(query) {
      ensure_open();
      const query_language = detect_language(query.text).language;
      const output_language = query.output_language ?? cfg.output_language ?? query_language ?? cfg.fallback_language;
      const result = await api.recall(query);
      return format_crosslingual_recall(result, query, {
        query_language,
        output_language,
        translation_provider: cfg.translation_provider,
        enable_translation: query.enable_translation ?? cfg.enable_translation
      });
    },
    async applyImportPlan(plan) {
      ensure_open();
      if (config.readonly === true) throw new Error("connector import is unavailable in readonly mode");
      if (!plan.connector_id || !plan.source_type || !plan.sync_item_id) throw new Error("connector plan identity is required");
      for (const node of plan.nodes_to_create) {
        if (!node.source_type || !node.external_id || !node.recorded_at || !node.provenance) {
          throw new Error(`connector node ${node.key} is missing source identity, recorded_at, or provenance`);
        }
      }
      const vectors = /* @__PURE__ */ new Map();
      for (const node of plan.nodes_to_create) {
        const language = detect_language(node.content).language ?? cfg.default_language;
        vectors.set(node, await embed(cfg.embedding_provider, multilingual_embeddings, embedding_cache, node.content, language, "document"));
      }
      return import_transaction().run(() => {
        const before_nodes = new Set(engine.graph.node_list().map((node) => node.id));
        const before_edges = new Set(engine.graph.edge_list().map((edge) => edge.id));
        const before_worlds = new Set(engine.worlds.world_list().map((world) => world.id));
        const before_entities = new Set(engine.resolver.entity_list().map((entity) => entity.id));
        const nodes_to_persist = /* @__PURE__ */ new Map();
        const edges_to_persist = /* @__PURE__ */ new Map();
        const touched_world_ids = /* @__PURE__ */ new Set();
        const touched_entity_ids = /* @__PURE__ */ new Set();
        const touched_fact_refs = /* @__PURE__ */ new Set();
        const created_node_ids = /* @__PURE__ */ new Set();
        const created_edge_ids = /* @__PURE__ */ new Set();
        const touch_world_path = (world_id) => {
          for (const world of engine.worlds.get_world_path(world_id)) touched_world_ids.add(world.id);
        };
        const collect_ingest = (result) => {
          for (const node of result.changed_nodes) nodes_to_persist.set(node.id, node);
          for (const edge of result.edges) edges_to_persist.set(edge.id, edge);
          for (const id of result.diff.created_node_ids) created_node_ids.add(id);
          for (const id of result.diff.created_edge_ids) created_edge_ids.add(id);
          for (const id of result.diff.world_ids) touch_world_path(id);
          for (const entity of result.diff.resolved_entities) touched_entity_ids.add(entity.id);
          for (const ref of result.diff.worlddb_refs) touched_fact_refs.add(ref);
        };
        const root = engine.worlds.world_list().find((world) => world.parent_world_id === null);
        if (!root) throw new Error("connector import requires a root world");
        const world_ids = /* @__PURE__ */ new Map();
        const pending_worlds = [...plan.worlds_to_create];
        while (pending_worlds.length) {
          const next = pending_worlds.findIndex((world2) => world2.parent_key === null || world_ids.has(world2.parent_key));
          if (next < 0) throw new Error("connector plan has an unresolved or cyclic world parent");
          const world = pending_worlds.splice(next, 1)[0];
          const existing = engine.worlds.world_list().find((item) => item.metadata.connector_id === plan.connector_id && item.metadata.connector_key === world.key);
          const parent_id = world.parent_key ? world_ids.get(world.parent_key) : world.parent_world_id ?? root.id;
          if (!engine.worlds.get_world(parent_id)) throw new Error(`connector world ${world.key} references unknown parent ${parent_id}`);
          const created = existing ?? engine.worlds.create_child_world(parent_id, {
            name: world.name,
            zone: world.zone,
            contracts: world.contracts,
            metadata: { ...world.metadata, connector_id: plan.connector_id, connector_key: world.key },
            at: world.created_at
          });
          world_ids.set(world.key, created.id);
          if (!existing) touch_world_path(created.id);
        }
        for (const mention of plan.entities_to_resolve) {
          const resolved = engine.resolver.resolve(mention);
          touched_entity_ids.add(resolved.entity.id);
        }
        const node_ids = /* @__PURE__ */ new Map();
        for (const node of plan.nodes_to_create) {
          const world_id = world_ids.get(node.world_key) ?? engine.worlds.world_list().find((world) => world.metadata.connector_id === plan.connector_id && world.metadata.connector_key === node.world_key)?.id;
          if (!world_id) throw new Error(`connector node ${node.key} references unknown world ${node.world_key}`);
          const result = engine.ingest({
            id: node.id,
            user_id: cfg.user_id,
            text: node.content,
            vector: vectors.get(node),
            at: node.recorded_at,
            observed_at: node.observed_at,
            valid_from: node.valid_from,
            valid_to: node.valid_to,
            world_id,
            facet_hint: node.facet,
            external: node.zone === "exocortex",
            source: node.zone === "exocortex" ? node.grounding_source : void 0,
            grounding_ref: node.zone === "exocortex" ? `connector:${plan.connector_id}:${node.external_id}:${node.checksum}` : void 0,
            entity_hints: node.entities,
            contract: {
              source_required: node.zone === "exocortex",
              expires_if_unconfirmed: node.zone === "exocortex",
              ...permission_contract(node.permission),
              ...node.contract
            },
            metadata: {
              ...node.metadata,
              connector_id: plan.connector_id,
              source_type: node.source_type,
              external_id: node.external_id,
              title: node.title,
              url: node.url,
              version: node.version,
              checksum: node.checksum,
              timestamp_seconds: node.timestamp_seconds,
              connector_provenance: node.provenance
            },
            conflict_behavior: node.conflict_behavior ?? "auto"
          });
          traces.set(result.node.id, result);
          collect_ingest(result);
          node_ids.set(node.key, result.node.id);
        }
        const endpoint_ids = /* @__PURE__ */ new Set();
        for (const edge of plan.edges_to_create) {
          endpoint_ids.add(node_ids.get(edge.from) ?? edge.from);
          endpoint_ids.add(node_ids.get(edge.to) ?? edge.to);
        }
        for (const action of plan.deletion_or_supersession_actions) {
          endpoint_ids.add(action.target_node_id);
          if (action.replacement_node_key) endpoint_ids.add(node_ids.get(action.replacement_node_key) ?? action.replacement_node_key);
        }
        const edge_context = new EdgeContext({
          now: plan.recorded_at,
          nodes: [...endpoint_ids].flatMap((id) => engine.graph.get_node(id) ?? [])
        });
        const explicit_edges = plan.edges_to_create.map((edge) => import_edge(edge, node_ids, edge_context));
        const deletion_replacements = /* @__PURE__ */ new Map();
        for (const action of plan.deletion_or_supersession_actions) {
          let replacement = action.replacement_node_key ? node_ids.get(action.replacement_node_key) : void 0;
          if (!replacement && action.type === "source_deleted") {
            replacement = deletion_replacements.get(action.external_id);
          }
          if (!replacement && action.type === "source_deleted") {
            const target = engine.graph.get_node(action.target_node_id);
            if (!target) throw new Error(`connector deletion target not found: ${action.target_node_id}`);
            const tombstone = engine.ingest({
              id: `connector-deleted:${plan.connector_id}:${action.external_id}:${action.recorded_at}`,
              user_id: cfg.user_id,
              text: `Source item deleted: ${action.external_id}`,
              at: action.recorded_at,
              observed_at: action.recorded_at,
              valid_from: action.recorded_at,
              world_id: target.world.world_id,
              facet_hint: "reflective",
              external: true,
              source: { id: plan.connector_id, kind: "api", reliability: 0.8 },
              contract: { use_for_reasoning: false, use_for_personalization: false, expires_if_unconfirmed: true },
              metadata: { source_deleted: true, external_id: action.external_id, reason: action.reason }
            });
            replacement = tombstone.node.id;
            deletion_replacements.set(action.external_id, replacement);
            edge_context.add_node(tombstone.node);
            collect_ingest(tombstone);
          }
          if (!replacement) throw new Error(`connector supersession replacement not found for ${action.external_id}`);
          explicit_edges.push(import_edge({
            key: `action:${action.type}:${action.external_id}`,
            from: replacement,
            to: action.target_node_id,
            type: "supersedes",
            confidence: 1,
            weight: 1,
            valid_from: action.recorded_at,
            valid_to: null,
            observed_at: action.recorded_at,
            recorded_at: action.recorded_at,
            metadata: { action: action.type, reason: action.reason }
          }, node_ids, edge_context));
        }
        for (const node of edge_context.changed_node_list()) {
          engine.graph.apply_node_version(node);
          engine.index.add(node);
          nodes_to_persist.set(node.id, node);
        }
        for (const edge of explicit_edges) {
          engine.graph.add_edge(edge);
          const from = engine.graph.get_node(edge.from);
          if (from) {
            engine.worlds.add_edge_to_world(from.world.world_id, edge.id);
            touch_world_path(from.world.world_id);
          }
          if (!before_edges.has(edge.id)) {
            edges_to_persist.set(edge.id, edge);
            created_edge_ids.add(edge.id);
          }
        }
        if (store) store.transaction(() => {
          store.save_batch([...nodes_to_persist.values()], [...edges_to_persist.values()]);
          for (const world_id of touched_world_ids) {
            const world = engine.worlds.get_world(world_id);
            if (world) store.save_world(world, false);
          }
          for (const node_id of created_node_ids) {
            const node = engine.graph.get_node(node_id);
            if (node) store.add_world_node_ref(node.world.world_id, node.id);
          }
          for (const edge_id of created_edge_ids) {
            const edge = engine.graph.get_edge(edge_id);
            const source = edge ? engine.graph.get_node(edge.from) : void 0;
            if (source) store.add_world_edge_ref(source.world.world_id, edge_id);
          }
          for (const entity_id2 of touched_entity_ids) {
            const entity = engine.resolver.get_entity(entity_id2);
            if (entity) store.save_entity(entity);
          }
          for (const ref of touched_fact_refs) {
            const fact = engine.worlddb.get(ref);
            if (fact) store.save_grounded_fact(fact);
          }
          store.save_sketch_state("global", engine.sketches, plan.recorded_at);
        });
        return {
          plan_id: plan.sync_item_id,
          node_ids: engine.graph.node_list().filter((node) => !before_nodes.has(node.id)).map((node) => node.id),
          edge_ids: engine.graph.edge_list().filter((edge) => !before_edges.has(edge.id)).map((edge) => edge.id),
          world_ids: engine.worlds.world_list().filter((world) => !before_worlds.has(world.id)).map((world) => world.id),
          entity_ids: engine.resolver.entity_list().filter((entity) => !before_entities.has(entity.id)).map((entity) => entity.id)
        };
      });
    },
    async runDecay(params = {}) {
      ensure_open();
      if (config.readonly === true) throw new Error("decay maintenance is unavailable in readonly mode");
      const at = params.now ?? Date.now();
      if (!Number.isFinite(at)) throw new Error("decay time must be finite");
      const limit = params.limit ?? 256;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1e4) throw new Error("decay limit must be an integer between 1 and 10000");
      const min_change = params.min_change ?? 1e-6;
      if (!Number.isFinite(min_change) || min_change < 0 || min_change > 1) throw new Error("min_change must be between 0 and 1");
      const decay_world_ids = params.world_id === void 0 ? null : new Set(engine.worlds.query_world_subtree(params.world_id).world_ids);
      const candidates = engine.graph.node_list().filter((node) => decay_world_ids === null || decay_world_ids.has(node.world.world_id)).filter((node) => params.after_id === void 0 || node.id.localeCompare(params.after_id) > 0).sort((left, right) => left.id.localeCompare(right.id));
      const batch = candidates.slice(0, limit);
      const tiers = { hot: 0, warm: 0, cold: 0 };
      const changed = [];
      for (const node of batch) {
        const version = decay_node(node, at, cfg.decay_policy);
        const projection = project_node_decay(version, at, cfg.decay_policy);
        tiers[projection.tier]++;
        if (Math.abs(version.state.activation - node.state.activation) >= min_change || Math.abs(version.state.decay_rate - node.state.decay_rate) >= min_change) changed.push(version);
      }
      commit_node_versions(changed, { kind: "decay", at, details: { tiers, scanned: batch.length } });
      const complete = candidates.length <= limit;
      return {
        at,
        scanned: batch.length,
        updated: changed.length,
        node_ids: changed.map((node) => node.id),
        next_cursor: complete ? null : batch.at(-1)?.id ?? null,
        complete,
        tiers
      };
    },
    async reinforce(id, params = {}) {
      ensure_open();
      if (config.readonly === true) throw new Error("reinforcement is unavailable in readonly mode");
      const node = engine.graph.get_node(id);
      if (!node) throw new Error(`memory ${id} was not found`);
      const at = params.at ?? Date.now();
      const version = reinforce_node(node, at, params.amount, cfg.decay_policy);
      commit_node_versions([version], {
        kind: "reinforce",
        at: version.state.last_reinforced_at ?? at,
        details: { amount: params.amount ?? cfg.decay_policy?.reinforcement_gain ?? 0.2 }
      });
      return engine.graph.get_node(id);
    },
    async close() {
      if (closed) return;
      if (store && config.readonly !== true) store.save_sketch_state("global", engine.sketches);
      store?.close();
      closed = true;
    },
    status: () => ({ name: "longmemory-hydrograph", phase: "phase-19-public-api", ready: !closed, store: cfg.store }),
    invariants: () => hydrograph_invariants
  };
  return api;
}
export {
  count_tokens,
  create_memory as createMemory
};
