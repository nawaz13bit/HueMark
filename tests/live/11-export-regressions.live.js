setTimeout(() => { console.error("suite timeout"); process.exit(3); }, 480000).unref();
// Regressions found by running the Citation preset on real pages (PubMed, NPR, a SCOTUS PDF):
// PDF line-break hyphens, abbreviation-aware sentence splitting, cookie/"similar articles" boilerplate,
// PubMed journal casing + NLM abbreviation.
const { createRunner, waitFor, startServer, launch, setStorage, tabIdOf, mkTerms, markCount, makePdf } = require("./lib");

const WEB = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reg</title>
<meta property="og:site_name" content="PubMed">
<meta name="citation_title" content="A Heron Study">
<meta name="citation_author" content="Zhu, N"><meta name="citation_author" content="Gao, GF">
<meta name="citation_journal_title" content="The New England journal of medicine">
<meta name="citation_publisher" content="N Engl J Med">
<meta name="citation_volume" content="382"><meta name="citation_issue" content="8">
<meta name="citation_publication_date" content="2020/02/20">
</head><body><main>
<p>The vote was held on Oct. 29 and the heron flew away. Then it rested.</p>
<p>See J. Smith, 3 Int. J. Res. on the heron colony. It grew.</p>
<p>Dose was raised with vitamin C. Patients saw the heron clearly.</p>
<p>The GDPR cookie policy of the heron reserve is discussed here.</p>
<div class="cookie-banner"><p>By clicking "Accept All Cookies" you agree to heron tracking technologies.</p></div>
<div class="linked-articles"><ul><li class="full-docsum"><a class="docsum-title">Heron in a similar article title.</a></li></ul></div>
<div role="dialog"><p>A heron dialog text that is not content.</p></div>
</main></body></html>`;

const PDF = makePdf([[
  "We hold that the state consti-",
  "tution forbids segregation in public schools.",
  "The pre- and post-war segregation ended.",
  "SEGREGATION IN SCHOOLS.",
]]);

// 8 pages, one hit each: a long enough export for hash-only navigations to land while it runs.
const LONG_PDF = makePdf(Array.from({ length: 8 }, (_, i) => [`Page ${i + 1}: the court said segregation is unlawful here.`]));

// Long no-space emoji runs around a match: snippet() (70 chars) and passageOf() (1500-char cap on a
// stop-less "sentence") must not cut a surrogate pair. "x" shifts the parity so both cut positions are hit.
const EMO = "\u{1F600}";
const EMOJI = `<!doctype html><html><head><meta charset="utf-8"><title>Emoji</title></head><body><main>
<p>${EMO.repeat(800)}needle${EMO.repeat(800)}</p>
<p>x${EMO.repeat(800)}needle${EMO.repeat(800)}</p>
</main></body></html>`;

// Mixed whitespace (tab, CR/LF, NBSP, runs) inside one block; an open shadow root under a heading.
const MISC = `<!doctype html><html><head><meta charset="utf-8"><title>Misc</title></head><body><main>
<h2>Plain Section</h2>
<p>alpha\t\r\n    beta \n\t wombat  \tgamma</p>
<h2>Shadow Section</h2>
<div id="host"></div>
<script>document.getElementById("host").attachShadow({ mode: "open" }).innerHTML = "<p>The wraith sat in shadow.</p>";</script>
</main></body></html>`;
// Long judgment: the decision date sits in the signature at the very end (past the first 3000 chars), while a
// lower-court date is quoted up front. The page-meta head keeps first 3000 + last 600 chars so the date is found.
const PT_TC = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Acórdão 52/2020</title></head><body><main>
<h1>TRIBUNAL CONSTITUCIONAL</h1><h2>ACÓRDÃO Nº 52/2020</h2>
<p>O recurso incide sobre a decisão proferida em 22 de março de 2019 pelo tribunal recorrido, sobre o direito invocado.</p>
${"<p>Texto de fundamentação do acórdão sem qualquer data relevante para o caso. ".repeat(60)}</p>
<p>Lisboa, 16 de janeiro de 2020 - Maria Relatora</p>
</main></body></html>`;
const LEGAL = (lang, title, body) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title></head><body><main>${body}</main></body></html>`;
const CH_BGER = LEGAL("de", "BGer 1C_119/2014 vom 07.03.2014", `<h1>BGer 1C_119/2014 vom 07.03.2014</h1><p>Das Bundesgericht prüft die Sache. ${"Dies ist ein langer Absatz ohne Fundstelle. ".repeat(12)}</p><p>Weiter hinten wird BGE 136 I 49 zitiert, und das Gericht sieht ein Beispiel dort.</p>`);
const CH_BGE = LEGAL("de", "BGE 144 V 50", "<h1>BGE 144 V 50</h1><p>Das Bundesgericht prüft die Sache. Das Gericht sieht ein Beispiel dort.</p>");
const ES_STC = LEGAL("es", "Sentencia 196/2012", "<h1>Tribunal Constitucional</h1><h2>SENTENCIA 196/2012, de 31 de octubre</h2><p>El tribunal considera el ejemplo presentado en el recurso.</p>");
const AT_VFGH = LEGAL("de", "TE Vfgh Erkenntnis 1991/6/26 B476/90 - JUSLINE Österreich", "<p>Der Verfassungsgerichtshof hat über die Beschwerde erkannt. Der Bescheid vom 6. November 1989 ist ein Beispiel dort.</p>");
// Corte costituzionale: decision date only in "Così deciso ..." near the end, ~900 chars before a long footer.
const IT_CC = LEGAL("it", "Sentenza n. 1 del 1956", `<h1>Sentenza n. 1 del 1956</h1><p>La Corte costituzionale esamina il caso di esempio.</p><p>${"Considerato in diritto senza date. ".repeat(40)}</p><p>Così deciso in Roma, nella sede della Corte costituzionale, Palazzo della Consulta, il 5 giugno 1956.</p><p>Depositata in cancelleria il 14 giugno 1956.</p><footer>${"Note legali del sito e informazioni. ".repeat(24)}</footer>`);
// SCC-style: the page itself holds only navigation; the judgment with its neutral citation lives in an iframe.
const CA_FRAME_INNER = `<!doctype html><html><head><meta charset="utf-8"><title>inner</title></head><body><p>Citation: Canada (Minister of Citizenship and Immigration) v. Vavilov, 2019 SCC 65, [2019] 4 S.C.R. 653</p><p>The reviewing court looked at the example presented.</p></body></html>`;
const CA_FRAME = LEGAL("en", "Canada (Minister of Citizenship and Immigration) v. Vavilov - SCC Cases", `<nav>Home &gt; Decisions</nav><iframe src="/ca-inner" style="width:600px;height:300px"></iframe>`);
// Chemical formulas: a <sub> following an inline-block span (Wikipedia chemf) or plain text must stay glued.
const CHEM = `<!doctype html><html><head><meta charset="utf-8"><title>Chem</title></head><body><main>
<p>The ammonia sample held <span style="display:inline-block">NH</span><sub>3</sub> and CO<sub>2</sub> gas, plus x<sup>2</sup> terms.</p>
</main></body></html>`;
const LONE =/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const LABELS =(m) => ({ citeTitle: m("exportCiteTitle"), citeQuotes: m("exportCiteQuotes"), citeReference: m("exportCiteReference"), none: m("exportMdNoMatches"), more: m("exportMdMore") });

(async () => {
  const t = createRunner("11-export-regressions");
  const srv = await startServer({ "/web": WEB, "/emoji": EMOJI, "/misc": MISC, "/chem": CHEM,"/pt-tc": PT_TC, "/ch-bger": CH_BGER, "/ch-bge": CH_BGE, "/es-stc": ES_STC, "/at-vfgh": AT_VFGH, "/it-cc": IT_CC, "/ca-frame": CA_FRAME, "/ca-inner": CA_FRAME_INNER, "/doc.pdf": { type: "application/pdf", body: PDF }, "/long.pdf": { type: "application/pdf", body: LONG_PDF } });
  const ext = await launch();
  try {
    const probe = await ext.ctx.newPage();
    await probe.goto(ext.popupUrl);
    const exportData = (names) => probe.evaluate(async (names) => {
      await chrome.storage.session.remove("huemark_export");
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names }, { frameId: 0 }, () => { void chrome.runtime.lastError; r(); }));
      for (let i = 0; i < 100; i++) {
        const x = (await chrome.storage.session.get("huemark_export")).huemark_export;
        if (x && x.state !== "running" && x.state) return x.state === "ready" ? x.data : null;
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    }, names);
    const render = (data, names, style) => probe.evaluate(({ data, names, style }) => {
      const L = (k) => chrome.i18n.getMessage(k) || "";
      const labels = { citeTitle: L("exportCiteTitle"), citeQuotes: L("exportCiteQuotes"), citeReference: L("exportCiteReference"), none: L("exportMdNoMatches"), more: L("exportMdMore") };
      return window.__huemarkExport.toCitations(data, names, labels, { preset: "citation", mode: "sentence", style, club: true });
    }, { data, names, style });

    // ---- web
    await setStorage(ext, { huemark_terms: mkTerms("heron"), huemark_options: { enabled: true, wholeWord: true } });
    const web = await ext.ctx.newPage();
    await web.goto(srv.url("/web"));
    await waitFor(async () => (await markCount(web, "heron")) >= 1 || (await web.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
    await probe.bringToFront();
    const wd = await exportData(["heron"]);
    const apa = wd ? await render(wd, ["heron"], "apa") : "";
    await t.check("web export ready", async () => !!wd);
    await t.check("\"Oct. 29\" is not a sentence break", async () => /on Oct\. 29 and the heron flew away\./.test(apa));
    await t.check("\"Int. J. Res.\" / initials are not sentence breaks", async () => /J\. Smith, 3 Int\. J\. Res\. on the heron colony\./.test(apa));
    await t.check("\"vitamin C.\" ends a sentence (not over-merged)", async () => /“Patients saw the heron clearly\.”/.test(apa));
    await t.check("prose about a cookie policy is kept", async () => /cookie policy of the heron reserve/.test(apa));
    await t.check("cookie-banner text is not quoted", async () => !/Accept All Cookies/i.test(apa));
    await t.check("linked/similar-article titles are not quoted", async () => !/similar article/i.test(apa));
    await t.check("dialog text is not quoted", async () => !/dialog text/i.test(apa));
    await t.check("PubMed journal is title-cased in APA", async () => /The New England Journal of Medicine/.test(apa));
    await t.check("Vancouver uses the NLM abbreviation (N Engl J Med)", async () => /N Engl J Med\./.test(await render(wd, ["heron"], "vancouver")));
    await t.check("AMA uses the NLM abbreviation", async () => /N Engl J Med\./.test(await render(wd, ["heron"], "ama")));
    // No journal: APA then shows month and day, so a wrong guess would be visible.
    const amb = await render({ ...wd, meta: { ...wd.meta, journal: "", date: "03/04/2020" } }, ["heron"], "apa");
    await t.check("ambiguous 03/04/2020 keeps only the year", async () => /\(2020\)/.test(amb) && !/March|April/.test(amb));
    const dmy = await render({ ...wd, meta: { ...wd.meta, journal: "", date: "25/04/2020" } }, ["heron"], "apa");
    await t.check("25/04/2020 is unambiguous (April)", async () => /2020, April 25/.test(dmy));
    const sub = await render({ ...wd, title: "Heron Notes - A field guide", meta: { ...wd.meta, title: "", site: "Audubon" } }, ["heron"], "apa");
    await t.check("subtitle after a dash is kept", async () => /Heron Notes - A field guide/.test(sub));
    const site = await render({ ...wd, title: "Heron Notes - Audubon", meta: { ...wd.meta, title: "", site: "Audubon" } }, ["heron"], "apa");
    await t.check("site-name tail is stripped from the title", async () => /Heron Notes[.\s*]/.test(site) && !/Notes - Audubon/.test(site));
    await t.check("web quotes get a scroll-to-text link", async () => /\[↗\]\(http:\/\/[^)]*#:~:text=[^)]*heron[^)]*\)/.test(apa));
    await t.check("text-fragment links carry no raw '-' or ',' inside the quote text", async () => (apa.match(/#:~:text=([^)]*)/g) || []).every((x) => !/-/.test(x)));
    const html = await probe.evaluate(({ data }) => window.__huemarkExport.toHtml(data, ["heron"], {}, { preset: "citation", mode: "sentence", style: "apa", club: true }), { data: wd });
    await t.check("rich HTML renders the link as an anchor", async () => /<a href="http:\/\/[^"]*#:~:text=[^"]*">↗<\/a>/.test(html));
    const bb = (over) => render({ ...wd, ...over.top, meta: { ...wd.meta, ...over.meta } }, ["heron"], "bluebook");
    const c1 = await bb({ top: {}, meta: { title: "BROWN v. BOARD OF EDUCATION OF TOPEKA, 347 U.S. 483 (1954)", journal: "", authors: [] } });
    await t.check("Bluebook: SCOTUS case title becomes a case citation", async () => /\*Brown v\. Bd\. of Educ\. of Topeka\*, 347 U\.S\. 483 \(1954\)\./.test(c1));
    await t.check("Bluebook case: no web-style tail or '(at N)' pin", async () => !/<http|\(at \d/.test(c1));
    const c2 = await bb({ top: {}, meta: { title: "Roe v. Wade", head: "Syllabus 410 U.S. 113 (1973) Argued Dec. 13", journal: "", authors: [] } });
    await t.check("Bluebook: cite and year read from the page text", async () => /\*Roe v\. Wade\*, 410 U\.S\. 113 \(1973\)\./.test(c2));
    const c3 = await bb({ top: {}, meta: { title: "Smith v. Jones", head: "no reporter cite here", journal: "", authors: [] } });
    await t.check("Bluebook: 'v.' title without a reporter cite stays generic", async () => !/U\.S\./.test(c3) && /Smith v\. Jones/.test(c3));
    const c4 = await bb({ top: {}, meta: { title: "Jane ROE, et al., Appellants, v. Henry WADE.", head: "410 U.S. 113 Argued December 13, 1971 Decided Jan. 22, 1973", journal: "", authors: [] } });
    await t.check("Bluebook: Cornell-style caption cleaned (surnames, no 'et al.'/roles/period) and year from 'Decided'", async () => /\*Roe v\. Wade\*, 410 U\.S\. 113 \(1973\)\./.test(c4));
    const any = (style, meta) => render({ ...wd, meta: { ...wd.meta, journal: "", authors: [], ...meta } }, ["heron"], style);
    const c5 = await bb({ top: {}, meta: { title: "NLRB v. Jones & Laughlin Steel Corp.", head: "301 U.S. 1 (1937)", journal: "", authors: [] } });
    await t.check("Bluebook: all-caps acronym (NLRB) is kept, not title-cased", async () => /\*NLRB v\. Jones/.test(c5));
    const c6 = await bb({ top: {}, meta: { title: "Smith v. Jones", head: `${"x ".repeat(300)} as held in 410 U.S. 113 (1973)`, journal: "", authors: [] } });
    await t.check("Bluebook: a cite to another case deep in the text is not taken as this page's cite", async () => !/410 U\.S\./.test(c6));
    const eu1 = render({ ...wd, meta: { ...wd.meta, journal: "", authors: [], title: "Google Spain", head: "Court of Justice. Case C 5/10 mention. Judgment of the Court 13 May 2014 in Case C-131/12 ECLI:EU:C:2014:317. Earlier 1 January 2010" } }, ["heron"], "eu");
    const eu = await eu1;
    await t.check("EU: hyphenated number and the date after 'Judgment' are used", async () => /Judgment of 13 May 2014, C-131\/12, EU:C:2014:317/.test(eu));
    const eu2 = await render({ ...wd, meta: { ...wd.meta, journal: "", authors: [], title: "Opinion", head: "Opinion of Advocate General Kokott delivered on 8 May 2014 Case C-131/12 Court of Justice" } }, ["heron"], "eu");
    await t.check("EU: Advocate General opinion is not labelled Judgment", async () => /Opinion of Advocate General of 8 May 2014, C-131\/12/.test(eu2));
    const mx1 = await any("mx", { title: "Tesis aislada", head: "Tesis 1a. CXXX/2019 (10a.), Primera Sala, Décima Época, Registro digital: 2020001 heron" });
    await t.check("Mexico: isolated Sala thesis '1a. CXXX/2019 (10a.)' recognised", async () => /Tesis 1a\. CXXX\/2019 \(10a\.\)/.test(mx1) && /tesis aislada/.test(mx1));
    const br2 = await any("br", { title: "Supremo Tribunal Federal ADI 5766", head: "Relator(a): Min. Roberto Barroso Tribunal Pleno. Publicação: 12 de junho de 2018 heron" });
    await t.check("Brazil: 'Relator(a):' form read and the name stops before 'Tribunal Pleno'", async () => /Rel\. Min\. Roberto Barroso(,|\.| DJe)/.test(br2) && !/Tribunal Pleno/.test(br2));
    const ag4 = await any("ag", { title: "Gómez c/ Estado s/ amparo - Corte Suprema de Justicia de la Nación", head: "Buenos Aires, 3 de marzo de 2015. Fallos: 338:100. Citado: 1 de enero de 1999" });
    await t.check("Argentina: date after 'Buenos Aires,' preferred over other dates", async () => /3\/3\/2015/.test(ag4) && !/1\/1\/1999/.test(ag4));
    const co1 = await any("co", { title: "Sentencia", head: `${"x ".repeat(400)} Corte Constitucional T-086 de 2020` });
    await t.check("Colombia: court named only deep in the text is not enough", async () => !/Corte Constitucional, sentencia/.test(co1));
    const any2 = await render({ ...wd, url: "http://example.com/a>b c", meta: { ...wd.meta, title: "Tilde ~ page" } }, ["heron"], "plain");
    await t.check("Source URL: '>' and spaces are percent-encoded inside the autolink", async () => !/<http:\/\/example\.com\/a>b/.test(any2));
    const cn1 = await any("cn", { title: "指导案例96号：宋文军诉西安市大华餐饮有限公司股东资格确认纠纷案", head: "最高人民法院 发布 西安市碑林区人民法院（2014）碑民初字第01339号民事判决书 heron" });
    await t.check("China: guiding-case page cites 指导案例N号, not the quoted lower-court 案号", async () => /最高人民法院指导案例96号/.test(cn1) && !/碑民初字/.test(cn1));
    const cn2 = await any("cn", { title: "最高人民法院民事判决书", head: "最高人民法院 民事判决书 （2019）最高法民终123号" });
    await t.check("China: ordinary judgment keeps court + 案号 + document type", async () => /最高人民法院（2019）最高法民终123号民事判决书/.test(cn2));
    const ag1 = await any("ag", { title: "Mendoza, Beatriz Silvia y otros c/ Estado Nacional y otros s/ daños y perjuicios - Corte Suprema de Justicia de la Nación", head: "Buenos Aires, 8 de julio de 2008. Fallos: 331:1622" });
    await t.check("Argentina: CSJN, «caption», d/m/yyyy, Fallos: v:p", async () => /CSJN, «Mendoza, Beatriz Silvia y otros c\/ Estado Nacional y otros s\/ daños y perjuicios», 8\/7\/2008, Fallos: 331:1622\./.test(ag1));
    const ag2 = await any("ag", { title: "Sentencia", head: "Corte Suprema de Justicia de la Nación 12/03/2021 CSJ 000551/2021/RH001" });
    await t.check("Argentina: docket fallback and numeric date, no caption", async () => /CSJN, 12\/3\/2021, CSJ 000551\/2021\/RH001\./.test(ag2));
    const ag3 = await any("ag", { title: "Heron Notes", head: "Fallos: 331:1622 but no court named" });
    await t.check("Argentina: no court name -> generic web citation", async () => !/CSJN/.test(ag3));
    const cn3 = await any("cn", { title: "判决书", head: "上诉人 北京市第一中级人民法院 ... 最高人民法院 民事判决书 （2020）最高法民终456号 heron" });
    await t.check("China: court nearest before the 案号 is the issuer", async () => /最高人民法院（2020）最高法民终456号/.test(cn3));
    const cn4 = await any("cn", { title: "说明", head: "根据（2020）年第5号 通知 最高人民法院 heron" });
    await t.check("China: '（2020）年第5号' is not a 案号", async () => !/（2020）年第5号/.test(cn4));
    const ru1 = await any("ru", { title: "Постановление Конституционного Суда РФ от 2 июля 2024 г. № 34-П", head: "heron" });
    await t.check("Russia: Cyrillic court + kind + date + number matched", async () => /Постановление Конституционного Суда РФ от 2 июля 2024 г\. № 34-П/.test(ru1));
    const br1 = await any("br", { title: "Supremo Tribunal Federal ADI 5766", head: "Rel. Min. Roberto Barroso. Cita o REsp 1234567/SP. Publicação: 12 de junho de 2018" });
    await t.check("Brazil: STF page mentioning a REsp stays STF", async () => /STF, ADI 5766/.test(br1) && !/STJ/.test(br1));
    const os = (over) => render({ ...wd, ...over.top, meta: { ...wd.meta, journal: "", authors: [], ...over.meta } }, ["heron"], "oscola");
    const u1 = await os({ top: {}, meta: { title: "Miller v Secretary of State for Exiting the European Union (Respondent) [2017] UKSC 5 - UK Supreme Court" } });
    await t.check("OSCOLA: UK Supreme Court title becomes a case citation", async () => /\*Miller v Secretary of State for Exiting the European Union\* \\?\[2017\\?\] UKSC 5\./.test(u1));
    await t.check("OSCOLA case: no web-style tail", async () => !/<http|accessed/.test(u1));
    const u2 = await os({ top: {}, meta: { title: "Hughes Jarvis vSearle & Anor - Find Case Law - The National Archives", head: "Neutral Citation Number: [2019] EWCA Civ 1" } });
    await t.check("OSCOLA: 'vSearle' spacing, '& Anor' dropped, cite from page head", async () => /\*Hughes Jarvis v Searle\* \\?\[2019\\?\] EWCA Civ 1\./.test(u2));
    const u3 = await os({ top: {}, meta: { title: "R (on the application of Roberts) v Parole Board - Find Case Law - The National Archives", head: "[2004] EWCA Civ 1031" } });
    await t.check("OSCOLA: R (on the application of X) becomes R (X)", async () => /\*R \(Roberts\) v Parole Board\* \\?\[2004\\?\] EWCA Civ 1031\./.test(u3));
    const u4 = await os({ top: {}, meta: { title: "Roberts v Parole Board - Find Case Law", head: "R (Roberts) v Parole Board Neutral Citation Number: [2004] EWCA Civ 1031" } });
    await t.check("OSCOLA: dropped 'R' prefix restored from page text", async () => /\*R \(Roberts\) v Parole Board\*/.test(u4));
    const u5 = await os({ top: {}, meta: { title: "R (Miller) v Prime Minister [2016] EWHC 2768 (Admin)" } });
    await t.check("OSCOLA: EWHC cite keeps number before division", async () => /\\?\[2016\\?\] EWHC 2768 \(Admin\)/.test(u5));
    const u6 = await os({ top: {}, meta: { title: "Smith v Jones", head: "no neutral cite here", site: "Example", authors: [{ family: "Doe", given: "Jane" }] } });
    await t.check("OSCOLA: no neutral cite stays generic web format", async () => /‘Smith v Jones’/.test(u6) && /accessed \d/.test(u6) && !/UKSC|EWCA/.test(u6));
    const mg = (over) => render({ ...wd, ...over.top, meta: { ...wd.meta, journal: "", authors: [], ...over.meta } }, ["heron"], "mcgill");
    const g1 = await mg({ top: {}, meta: { title: "Radonna Investments Ltd. v. Rubin, 2012 ONCA 321 (CanLII)" } });
    await t.check("McGill: Ontario CA title becomes a case citation (no period after Ltd or v)", async () => /\*Radonna Investments Ltd v Rubin\*, 2012 ONCA 321\./.test(g1));
    await t.check("McGill case: no web-style tail", async () => !/online|<http/.test(g1));
    const g2 = await mg({ top: {}, meta: { title: "R. v. G.H.", head: "CITATION: R. v. G.H., 2020 ONCA 1" } });
    await t.check("McGill: initials lose periods, cite from 'CITATION:' line", async () => /\*R v GH\*, 2020 ONCA 1\./.test(g2));
    const g3 = await mg({ top: {}, meta: { title: "Her Majesty the Queen v. G.H., 2020 ONCA 1" } });
    await t.check("McGill: 'Her Majesty the Queen' becomes R", async () => /\*R v GH\*, 2020 ONCA 1\./.test(g3));
    const g4 = await mg({ top: {}, meta: { title: "Carter v. Canada (Attorney General), 2015 SCC 5" } });
    await t.check("McGill: SCC cite and parenthetical kept", async () => /\*Carter v Canada \(Attorney General\)\*, 2015 SCC 5\./.test(g4));
    const g5 = await mg({ top: {}, meta: { title: "Smith v. Jones", head: "no neutral cite", site: "Example", authors: [{ family: "Doe", given: "Jane" }] } });
    const ag = (over) => render({ ...wd, ...over.top, meta: { ...wd.meta, journal: "", authors: [], ...over.meta } }, ["heron"], "aglc");
    const a1 = await ag({ top: {}, meta: { title: "Northern Land Council v Quall [2020] HCA 33 - AustLII" } });
    await t.check("AGLC: High Court title becomes a case citation, no comma before the neutral cite", async () => /\*Northern Land Council v Quall\* \\?\[2020\\?\] HCA 33\./.test(a1) && !/<http/.test(a1));
    const a2 = await ag({ top: {}, meta: { title: "Smith v. Jones Pty. Ltd.", head: "Medium Neutral Citation: [2009] NSWCA 80" } });
    await t.check("AGLC: cite from the labelled line, periods dropped from v and Pty", async () => /\*Smith v Jones Pty Ltd\* \\?\[2009\\?\] NSWCA 80\./.test(a2));
    const a3 = await ag({ top: {}, meta: { title: "Smith v. Jones", head: "no cite here", site: "Example" } });
    await t.check("AGLC: no neutral cite stays generic web format", async () => /‘Smith v\. Jones’/.test(a3) && /Example/.test(a3) && !/HCA|NSWCA/.test(a3));
    await t.check("McGill: no neutral cite stays generic web format", async () => /“Smith v\. Jones”/.test(g5) && /online: Example/.test(g5) && !/ONCA|SCC/.test(g5));
    const ind = (over) => render({ ...wd, ...over.top, meta: { ...wd.meta, journal: "", authors: [], ...over.meta } }, ["heron"], "india");
    const i1 = await ind({ top: {}, meta: { title: "Kesavananda Bharati Sripadagalvaru ... vs State Of Kerala And Anr on 24 April, 1973", head: "Equivalent citations: AIR 1973 SUPREME COURT 1461, 1973 4 SCC 225" } });
    await t.check("India: Indian Kanoon title + SCC header -> 'X v Y (1973) 4 SCC 225'", async () => /\*Kesavananda Bharati Sripadagalvaru v State of Kerala\* \(1973\) 4 SCC 225\./.test(i1) && !/AIR|Anr|\.\.\./.test(i1.split("## Reference")[1] || i1));
    const i2 = await ind({ top: {}, meta: { title: "Justice K.S.Puttaswamy(Retd) And Anr. vs Union Of India And Ors. on 24 August, 2017", head: "Equivalent citations: AIR 2017 SUPREME COURT 4161, (2017) 6 BOM CR 78, 2017 (10) SCC 1" } });
    await t.check("India: '2017 (10) SCC 1' normalised, initials spaced, small words lowered", async () => /\*Justice K\.S\. Puttaswamy \(Retd\) v Union of India\* \(2017\) 10 SCC 1\./.test(i2));
    const i3 = await ind({ top: {}, meta: { title: "K. Vadivel vs K. Shanthi on 30 September, 2024", head: "Neutral citation: 2024 INSC 746" } });
    await t.check("India: neutral cite alone follows a comma", async () => /\*K\. Vadivel v K\. Shanthi\*, 2024 INSC 746\./.test(i3));
    const i4 = await ind({ top: {}, meta: { title: "Some Case vs Other Party on 1 May, 2000", head: "AIR 2000 SC (CIV) 55" } });
    await t.check("India: AIR alone becomes 'AIR year SC page'", async () => /\*Some Case v Other Party\* AIR 2000 SC 55\./.test(i4));
    const i5 = await ind({ top: {}, meta: { title: "Smith v. Jones", head: "no cite here", site: "Example", authors: [{ family: "Doe", given: "Jane" }] } });
    await t.check("India: no reporter cite stays generic web format", async () => /‘Smith v\. Jones’/.test(i5) && /accessed \d/.test(i5) && !/SCC|AIR|INSC/.test(i5));
    const de = (over) => render({ ...wd, meta: { ...wd.meta, journal: "", authors: [], ...over } }, ["heron"], "de");
    const d1 = await de({ title: "XI ZR 526/19 | Gesetze.co", head: "BGH 11. Zivilsenat Beschluss 01. Dezember 2020 XI ZR 526/19" });
    await t.check("Germany: BGH Beschluss -> 'BGH, Beschl. v. 01.12.2020 – XI ZR 526/19'", async () => /BGH, Beschl\. v\. 01\.12\.2020 – XI ZR 526\/19\./.test(d1.split("## Reference")[1] || ""));
    const d2 = await de({ title: "1 BvR 1933/08", head: "BVerfG 1. Senat 1. Kammer, Urteil 20. Dezember 2011, 1 BvR 1933/08" });
    await t.check("Germany: BVerfG Urteil with Aktenzeichen", async () => /BVerfG, Urt\. v\. 20\.12\.2011 – 1 BvR 1933\/08\./.test(d2));
    const d3 = await de({ title: "DFR - BVerfGE 65, 1 - Volkszählung", head: "Bundesverfassungsgericht Erster Senat Urteil 15. Dezember 1983 1 BvR 209, 269, 362, 420, 440, 484/83" });
    await t.check("Germany: BVerfGE reporter cite appended", async () => /BVerfG, Urt\. v\. 15\.12\.1983 – 1 BvR 209, 269, 362, 420, 440, 484\/83, BVerfGE 65, 1\./.test(d3));
    const d4 = await de({ title: "Smith v. Jones", head: "no cite here", site: "Example", authors: [{ family: "Doe", given: "Jane" }] });
    await t.check("Germany: no Aktenzeichen stays generic web format (abgerufen am)", async () => /abgerufen am \d{2}\.\d{2}\.\d{4}/.test(d4) && !/BGH|BVerfG/.test(d4.split("## Reference")[1] || d4));
    await web.close();

    // ---- surrogate pairs (snippet + passageOf)
    await setStorage(ext, { huemark_terms: mkTerms("needle"), huemark_options: { enabled: true, wholeWord: true } });
    const emo = await ext.ctx.newPage();
    await emo.goto(srv.url("/emoji"));
    await waitFor(async () => (await markCount(emo, "needle")) >= 1 || (await emo.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
    await probe.bringToFront();
    const ed = await exportData(["needle"]);
    await t.check("emoji export ready with 2 rows", async () => !!ed && ed.rows.length === 2);
    const erows = ed ? ed.rows : [];
    await t.check("snippet(): no lone surrogate in before/hit/after (both parities)", async () =>
      erows.length === 2 && erows.every((r) => !LONE.test(r.before) && !LONE.test(r.hit) && !LONE.test(r.after) && r.cutL && r.cutR && r.before.length > 0 && r.after.length > 0));
    for (const mode of ["sentence", "paragraph"]) {
      const out = ed ? await probe.evaluate(({ data, mode }) => window.__huemarkExport.toMarkdown(data, ["needle"], { none: "", more: "" }, { mode, club: true }), { data: ed, mode }) : "";
      await t.check(`passageOf(${mode}): stop-less >1500-char passage is cut without a lone surrogate`, async () =>
        out.includes("needle") && !LONE.test(out) && out.length < 4000);
    }
    await emo.close();

    // ---- collapse() whitespace + headingFinder in an open shadow root
    await setStorage(ext, { huemark_terms: mkTerms("wombat", "wraith"), huemark_options: { enabled: true, wholeWord: true } });
    const misc = await ext.ctx.newPage();
    await misc.goto(srv.url("/misc"));
    await waitFor(async () => (await markCount(misc, "wombat")) >= 1 || (await misc.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
    await probe.bringToFront();
    const md = await exportData(["wombat", "wraith"]);
    const mrow = (term) => (md ? md.rows.concat(...(md.frames || []).map((f) => f.rows)) : []).find((r) => (r.term || "").toLowerCase() === term);
    const wom = mrow("wombat");
    await t.check("collapse(): tabs/CRLF/NBSP runs become single spaces (before)", async () => !!wom && wom.before === "alpha beta ");
    await t.check("collapse(): tabs/NBSP runs become single spaces (after)", async () => !!wom && wom.after === " gamma");
    const wra = mrow("wraith");
    await t.check("headingFinder: match in an open shadow root resolves the heading above its host", async () => !!wra && wra.heading === "Shadow Section");
    await t.check("headingFinder: light-DOM match still gets its own section heading", async () => !!wom && wom.heading === "Plain Section");
    await misc.close();

    // ---- sub/sup glue: no space inserted between a text node and an adjacent <sub>/<sup>
    await setStorage(ext, { huemark_terms: mkTerms("ammonia"), huemark_options: { enabled: true, wholeWord: true } });
    const chem = await ext.ctx.newPage();
    await chem.goto(srv.url("/chem"));
    await waitFor(async () => (await markCount(chem, "ammonia")) >= 1 || (await chem.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
    await probe.bringToFront();
    const cd = await exportData(["ammonia"]);
    const cmd = cd ? await probe.evaluate(({ data }) => window.__huemarkExport.toMarkdown(data, ["ammonia"], { none: "", more: "" }, { mode: "sentence", club: true }), { data: cd }) : "";
    await t.check("sub/sup: export ready", async () => !!cd && cmd.includes("ammonia"));
    await t.check("sub/sup: <sub> after an inline-block span stays glued (NH3, not NH 3)", async () => /NH3/.test(cmd) && !/NH 3/.test(cmd));
    await t.check("sub/sup: <sub> after plain text stays glued (CO2, not CO 2)", async () => /CO2/.test(cmd) && !/CO 2/.test(cmd));
    await t.check("sub/sup: ordinary word spacing is kept", async () => /held\s+NH3 and CO2 gas/.test(cmd));
    await chem.close();

    // ---- long page: head keeps the tail so an end-of-document decision date is found (Portugal TC)
    await setStorage(ext, { huemark_terms: mkTerms("direito"), huemark_options: { enabled: true, wholeWord: true } });
    const ptp = await ext.ctx.newPage();
    await ptp.goto(srv.url("/pt-tc"));
    await waitFor(async () => (await markCount(ptp, "direito")) >= 1 || (await ptp.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
    await probe.bringToFront();
    const ptd = await exportData(["direito"]);
    const ptr = ptd ? await render(ptd, ["direito"], "pt") : "";
    await t.check("long page: head tail keeps the end-of-document decision date", async () => /Ac\. do TC n\.º 52\/2020 de 16 de janeiro de 2020/.test(ptr));
    await t.check("long page: quoted lower-court date is not used", async () => !/22 de março/.test(ptr.split("Reference")[1] || ptr.slice(-200)));
    await ptp.close();

    // ---- Legal styles on real pages (ch / es / at)
    await setStorage(ext, { huemark_terms: mkTerms("beispiel", "ejemplo", "esempio", "example"), huemark_options: { enabled: true, wholeWord: true } });
    const legal = async (path, names, style) => {
      const pg = await ext.ctx.newPage();
      await pg.goto(srv.url(path));
      await waitFor(async () => (await markCount(pg, names[0])) >= 1 || (await pg.evaluate(() => CSS.highlights && CSS.highlights.size)), { timeout: 8000 });
      await probe.bringToFront();
      const d = await exportData(names);
      const out = d ? await render(d, names, style) : "";
      await pg.close();
      return out;
    };
    const chA = await legal("/ch-bger", ["beispiel"], "ch");
    await t.check("Switzerland: BGer docket page beats a later cited BGE", async () => /Urteil \(des Bundesgerichts\) 1C\\?_119\/2014 vom 7\. März 2014/.test(chA.split("## Reference")[1] || "") &&!/BGE 136 I 49/.test(chA.split("## Reference")[1] || chA));
    const chB = await legal("/ch-bge", ["beispiel"], "ch");
    await t.check("Switzerland: page opening with BGE 144 V 50 still gives the BGE cite", async () => /BGE 144 V 50/.test(chB.split("## Reference")[1] || chB));
    const esA = await legal("/es-stc", ["ejemplo"], "es");
    await t.check("Spain: uppercase 'SENTENCIA 196/2012, de 31 de octubre' -> STC", async () => /STC 196\/2012, de 31 de octubre/.test(esA));
    const atA = await legal("/at-vfgh", ["beispiel"], "at");
    await t.check("Austria: JUSLINE VfGH title -> 'VfGH 26.6.1991, B 476/90' (not the earlier body date)", async () => /VfGH 26\.6\.1991, B 476\/90/.test(atA));

    const itA = await legal("/it-cc", ["esempio"], "it");
    await t.check("Italy: Corte cost. cite carries the decision date (not the deposit date)", async () => /Corte cost\., sent\. 5 giugno 1956, n\. 1\./.test(itA));
    const caA = await legal("/ca-frame", ["example"], "mcgill");
    await t.check("Canada: neutral citation inside an iframe reaches the McGill detector", async () => /Vavilov\*?, 2019 SCC 65\./.test(caA));

    // ---- PDF
    await setStorage(ext, { huemark_terms: mkTerms("segregation"), huemark_options: { enabled: true, wholeWord: true } });
    const pdf = await ext.ctx.newPage();
    await pdf.goto(srv.url("/doc.pdf"));
    await waitFor(() => pdf.url().includes("/vendor/pdfjs/web/viewer.html"), { timeout: 10000 });
    await waitFor(() => pdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 2), { timeout: 15000 });
    await probe.bringToFront();
    const pd = await exportData(["segregation"]);
    const pmd = pd ? await render(pd, ["segregation"], "bluebook") : "";
    await t.check("PDF export ready", async () => !!pd);
    await t.check("line-break hyphen joined (\"constitution\")", async () => /constitution forbids/.test(pmd) && !/consti-\s*tution/.test(pmd));
    await t.check("ALL-CAPS heading line is not quoted", async () => !/SEGREGATION IN SCHOOLS/.test(pmd));
    await t.check("\"pre- and post-war\" keeps its hyphen", async () => /pre- and post-war/.test(pmd));
    const prow = pd && pd.rows.find((r) => /tution forbids/.test(r.before + r.hit + r.after));
    await t.check("collectPdf row snippet (before+hit+after) is hyphen-joined", async () =>
      !!prow && /constitution forbids/.test(prow.before + prow.hit + prow.after) && !/consti-\s*tution/.test(prow.before + prow.hit + prow.after));
    await t.check("PDF quotes get no text-fragment link", async () => !/#:~:text=/.test(pmd));

    // ---- background: PDF.js changes location.hash on every page step. That fires tabs.onUpdated "loading"
    // without reloading the page, and must NOT abandon the export (background.js pings huemark:exportAlive
    // 1.2 s later and only abandons when the collector is gone). Regression for the 2026-11-02 fix.
    // The export is sent straight to this tab (not broadcast) so it is the only one running.
    const pdf2 = await ext.ctx.newPage();
    await pdf2.goto(srv.url("/long.pdf"));
    await waitFor(() => pdf2.url().includes("/vendor/pdfjs/web/viewer.html"), { timeout: 10000 });
    await waitFor(() => pdf2.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 1), { timeout: 15000 });
    const tab2 = await tabIdOf(ext, pdf2);
    await pdf2.bringToFront(); // a hidden PDF tab fails fast while rendering pages
    const alive = () => probe.evaluate((id) => new Promise((res) =>
      chrome.tabs.sendMessage(id, { type: "huemark:exportAlive" }, { frameId: 0 }, (x) => res(chrome.runtime.lastError ? null : x))), tab2);
    const aliveBefore = await alive();
    await probe.evaluate(async (id) => {
      window.__loading = 0;
      chrome.tabs.onUpdated.addListener((tabId, ch) => { if (tabId === id && ch.status === "loading") window.__loading++; });
      await chrome.storage.session.remove("huemark_export");
      chrome.tabs.sendMessage(id, { type: "huemark:export", names: ["segregation"] }, { frameId: 0 }, () => { void chrome.runtime.lastError; });
    }, tab2);
    const wasRunning = await waitFor(async () => (await probe.evaluate(async () => (await chrome.storage.session.get("huemark_export")).huemark_export))?.state === "running", { timeout: 5000, interval: 20 });
    const aliveDuring = await alive();
    // Poll the stored export state throughout: until it becomes "ready" it must stay "running" (never cleared/absent,
    // never "error"), and exportAlive must report running. Abandoning the export on "loading" clears the state, and
    // exportDone would still store "ready" afterwards, so only this running-state check can catch that.
    const violations = [];
    let finished = null;
    const getState = () => probe.evaluate(async () => (await chrome.storage.session.get("huemark_export")).huemark_export);
    const sample = async (tag) => {
      if (finished) return;
      const s1 = await getState();
      if (!s1 || s1.state !== "running") {
        if (s1 && s1.state === "ready") finished = s1; // legitimate end of the export
        else violations.push(`${tag}: state ${s1 ? s1.state : "absent"} before ready`);
        return;
      }
      const a = await alive();
      const s2 = await getState();
      if (s2 && s2.state === "running" && a?.running !== true) violations.push(`${tag}: exportAlive.running=${a?.running} while state running`);
      if (!s2) violations.push(`${tag}: state cleared while running`);
      else if (s2.state === "ready") finished = s2;
    };
    for (let i = 0; i < 6; i++) { // hash-only "navigations", as PDF.js does on each page step
      await pdf2.evaluate((n) => { location.hash = "#huemark-hash-" + n; }, i).catch(() => {});
      for (let k = 0; k < 5; k++) { await sample(`hash ${i}.${k}`); await new Promise((r) => setTimeout(r, 50)); }
    }
    // Keep sampling past the 1.2 s exportAlive ping that background.js schedules after each "loading".
    for (let k = 0; k < 40 && !finished; k++) { await sample(`tail ${k}`); await new Promise((r) => setTimeout(r, 100)); }
    const hashState = await waitFor(async () => {
      const s = await getState();
      return s && s.state !== "running" ? s : null;
    }, { timeout: 30000, interval: 300 });
    const loadingSeen = await probe.evaluate(() => window.__loading);
    const aliveAfter = await alive();
    await t.check("exportAlive: false before an export, true while it runs, false once finished", async () =>
      aliveBefore?.running === false && !!wasRunning && aliveDuring?.running === true && aliveAfter?.running === false);
    await t.check("export state stays 'running' (never cleared) and exportAlive stays true until 'ready'", async () => {
      if (violations.length) console.log("  violations:", violations.slice(0, 5).join(" | "));
      return violations.length === 0;
    });
    await t.check("hash-only navigation fires tabs.onUpdated 'loading' (precondition for the regression)", async () => loadingSeen >= 1);
    await t.check("PDF export survives hash-only navigations: state 'ready' with a row on every page", async () =>
      hashState?.state === "ready" && hashState.data.rows.length === 8 && new Set(hashState.data.rows.map((r) => r.page)).size === 8);
    await probe.evaluate(() => chrome.runtime.sendMessage({ type: "huemark:exportClear" }));
    await pdf2.close();

    // ---- background: a running export must be abandoned when its tab navigates or closes (abandonExport in background.js).
    // The PDF export takes ~1 s (page-render wait), so "running" is observable before we reload/close the tab.
    const startAndAbandon = (action) => probe.evaluate(async (action) => {
      const get = async () => (await chrome.storage.session.get("huemark_export")).huemark_export;
      await chrome.storage.session.remove("huemark_export");
      // tab.url is not exposed without the "tabs" permission, so ask every tab and follow the tabId the export records.
      for (const tab of await chrome.tabs.query({})) chrome.tabs.sendMessage(tab.id, { type: "huemark:export", names: ["segregation"] }, { frameId: 0 }, () => { void chrome.runtime.lastError; });
      let running = null;
      for (let i = 0; i < 60 && !running; i++) { const x = await get(); if (x && x.state === "running") running = x; else await new Promise((r) => setTimeout(r, 30)); }
      if (!running) return { err: "never running" };
      if (action === "reload") chrome.tabs.reload(running.tabId); else chrome.tabs.remove(running.tabId);
      let cleared = false;
      for (let i = 0; i < 40 && !cleared; i++) { await new Promise((r) => setTimeout(r, 150)); cleared = !(await get()); }
      await new Promise((r) => setTimeout(r, 1500)); // a late "done" or stray write must not resurrect it
      const after = await get();
      return { cleared, stuck: !!after && after.state === "running" };
    }, action);
    const rl = await startAndAbandon("reload");
    await t.check("Export abandoned by a reload: 'running' state is cleared, not stuck", async () => !rl.err && rl.cleared && !rl.stuck);
    if (rl.err) console.log("  reload scenario:", rl.err);
    // The reload dropped the old script; wait for the viewer to come back, then close the tab mid-export.
    await waitFor(() => pdf.evaluate(() => document.querySelectorAll("#viewer .textLayer mark.huemark-highlight").length >= 2), { timeout: 15000 }).catch(() => {});
    const cl = await startAndAbandon("close");
    await t.check("Export abandoned by closing its tab: 'running' state is cleared, not stuck", async () => !cl.err && cl.cleared && !cl.stuck);
    if (cl.err) console.log("  close scenario:", cl.err);
  } finally {
    await ext.close();
    await srv.close();
  }
  process.exit(t.summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
