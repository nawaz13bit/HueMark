// Multi-language check of accent folding + matching. Pure logic, no browser:
// loads src/highlighter.js into a vm sandbox and drives buildMatcher /
// foldWithIndexes the same way highlightTextNode does.
// Run: node tests/accent-languages.test.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, document: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "highlighter.js"), "utf8"), sandbox);
const { buildMatcher } = sandbox;

// Matched substrings of the ORIGINAL text, as highlightTextNode would mark them.
function matches(term, text, { wholeWord = false, accent = true } = {}) {
  const m = buildMatcher([{ term, color: "#ff0" }], wholeWord, accent);
  if (!m) return null;
  return sandbox.findMatches(text, m).map(({ start, end }) => text.slice(start, end));
}

// [language, term, text, expected matches, options]
const cases = [
  // Latin scripts: accents fold in both directions
  ["es", "cafe", "Un café y un CAFÉ", ["café", "CAFÉ"]],
  ["es", "café", "un cafe", ["cafe"]],
  ["es", "angel", "El ángel y el Ángel", ["ángel", "Ángel"]],
  ["es", "ñandú", "nandu y ñandú", ["nandu", "ñandú"]],
  ["fr", "ecole", "École élémentaire, ecole", ["École", "ecole"]],
  ["fr", "garcon", "le garçon", ["garçon"]],
  ["fr", "coeur", "mon cœur", ["cœur"]], // œ via the fold map
  ["fr", "cœur", "mon coeur", ["coeur"]],
  ["de", "uber", "Das ist über alles", ["über"]],
  ["de", "Müller", "Mueller und Muller", ["Muller"]], // ü folds to u, not ue
  ["de", "strasse", "die Straße", ["Straße"]], // ß via the fold map
  ["de", "straße", "Strasse", ["Strasse"]],
  ["de", "stras", "Straße", ["Straß"]],         // match ending inside ß covers all of it
  ["de", "gross", "GROSS und groß", ["GROSS", "groß"]],
  ["de", "strasse", "Straße", ["Straße"], { wholeWord: true }],
  ["pt", "coracao", "o coração", ["coração"]],
  ["pt", "nao", "não e NÃO", ["não", "NÃO"]],
  ["it", "perche", "Perché no", ["Perché"]],
  ["pl", "swiety", "święty i swiety", ["święty", "swiety"]],
  ["pl", "zolw", "żółw i zolw", ["żółw", "zolw"]], // ł via the fold map
  ["pl", "lodz", "Łódź", ["Łódź"]],
  ["da", "bla", "blå og blø", ["blå"]],
  ["da", "bloed", "blød", []],                // ø -> o, not oe
  ["da", "blod", "blød", ["blød"]],
  ["is", "ordin", "orðin", ["orðin"]],
  ["tr", "kiz", "kız", ["kız"]],              // dotless ı
  ["cs", "reka", "řeka a řeka", ["řeka", "řeka"]],
  ["tr", "istanbul", "İstanbul", ["İstanbul"]],
  ["tr", "sehir", "şehir", ["şehir"]],
  ["vi", "nguyen", "Nguyễn Văn", ["Nguyễn"]], // stacked marks (ê + tilde)
  ["vi", "viet", "Việt Nam", ["Việt"]],
  ["vi", "duong", "Đường", ["Đường"]], // Đ via the fold map
  ["ro", "tara", "țara și țară", ["țara", "țară"]],
  // Greek: tonos drops, final sigma matches via /i
  ["el", "Ελλαδα", "η Ελλάδα", ["Ελλάδα"]],
  ["el", "καλημερα", "Καλημέρα", ["Καλημέρα"]],
  // Arabic / Hebrew: optional vowel points drop
  ["ar", "كتاب", "هذا كِتَابٌ جميل", ["كِتَابٌ"]],
  ["ar", "كِتَاب", "كتاب", ["كتاب"]],
  ["he", "שלום", "אמר שָׁלוֹם", ["שָׁלוֹם"]],
  // Scripts where marks carry meaning: must NOT fold
  ["ru", "еж", "ёж и еж", ["еж"]],           // ё stays distinct from е
  ["ru", "йод", "йод и иод", ["йод"]],        // й stays distinct from и
  ["hi", "कि", "कि और की", ["कि"]],           // matra preserved
  ["hi", "की", "कि और की", ["की"]],
  ["ja", "か", "か が", ["か"]],               // dakuten preserved
  ["ja", "が", "か が", ["が"]],
  ["ko", "한", "한국 하", ["한"]],
  ["zh", "中文", "学习中文很有用", ["中文"]],
  // Decomposed input (e + combining acute) behaves like precomposed
  ["nfd", "cafe", "café", ["café"]],
  ["nfd", "café", "café", ["café"]],
  // Whole-word boundaries around accented letters
  ["es", "cafe", "cafetería café", ["café"], { wholeWord: true }],
  ["es", "cafe", "décafé", [], { wholeWord: true }],
  // Wildcards across accents
  ["fr", "ele*", "élève élégant", ["élève", "élégant"]],
  ["es", "a?o", "año ano", ["año", "ano"]],
  // accent option off: exact accents required
  ["es", "cafe", "café cafe", ["cafe"], { accent: false }],
  ["es", "café", "café cafe", ["café"], { accent: false }],
];

let failed = 0;
for (const [lang, term, text, expected, opts] of cases) {
  const got = matches(term, text, opts);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${lang}] "${term}" in "${text}"` +
    (ok ? "" : ` -> got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`));
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
