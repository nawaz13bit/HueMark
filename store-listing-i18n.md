# HueMark — store listing translations

Translated marketing copy for Edge Add-ons (and reusable for Chrome Web
Store / Firefox AMO listing languages later). Paste into each language's
"Store listings" tab in Partner Center. Source English copy: `store-listing.md`.

Category stays "Productivity" for every locale (not translated).

---

## Spanish (es)

**Short description**

Resalta varias palabras o frases en distintos colores, en cualquier
página y en PDFs, con navegación por teclado entre coincidencias.

**Full description**

HueMark te permite resaltar varios términos de búsqueda a la vez, cada
uno en su propio color, para seguir visualmente distintos temas en
cualquier página.

**Resalta en todas partes**
- Páginas estáticas: se resaltan en cuanto cargan.
- Páginas dinámicas y aplicaciones de una sola página: un observador en
  vivo detecta contenido nuevo a medida que aparece (scroll infinito,
  chats, feeds en vivo), así los resaltados nunca quedan desactualizados.
- PDFs: tanto en línea (http/https) como archivos locales, mediante un
  visor PDF.js integrado.
- Iframes y shadow DOM: las coincidencias dentro de frames incrustados y
  de raíces shadow también se resaltan, y una marca en la barra de
  desplazamiento señala cada coincidencia.

**Se mantiene contigo**
- Tu lista de términos y colores se guarda y se vuelve a aplicar
  automáticamente cada vez que visitas una página o reabres el navegador.
- Una paleta apta para daltónicos está a un clic en el panel emergente.
- Guarda varias listas de términos con nombre (hasta 10) y cámbialas desde
  el popup.

**Navegación por teclado**
- Salta al resultado siguiente/anterior y alterna entre términos sin
  tocar el mouse: Alt+Shift+Flecha arriba/abajo/izquierda/derecha
  (Cmd+Shift+... en Mac).
- Un contorno persistente marca tu coincidencia actual para no perder tu
  lugar al recorrer una página larga.
- En Edge, es posible que debas asignar estos atajos manualmente la
  primera vez: visita `edge://extensions/shortcuts` y configúralos allí
  si no funcionan de forma predeterminada.

**Coincidencias avanzadas**
- Comodines (`*`, `?`) y expresiones regulares (`/patrón/`).
- Los acentos se ignoran siempre, sin opción para desactivarlo. También se
  tratan letras como ß, ł, đ y œ.
- Haz clic derecho sobre una palabra seleccionada y elige «Añadir selección a HueMark».

**Copiar coincidencias**
- Haz clic una vez para recopilar las coincidencias y otra para copiarlas
  con el texto que las rodea. Se pegan como texto enriquecido o texto plano.
- Elige Fragmento, Oración o Párrafo para decidir cuánto texto rodea cada
  coincidencia.
- Estilos de cita: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA o Plain.
- Las citas de páginas web incluyen enlaces de texto desplazable; las de
  PDF, números de página.
- Nada sale de tu dispositivo. El resultado queda en el almacenamiento de
  sesión del navegador hasta que lo copias.

**Citas legales**
- Formato Legal con 22 opciones de jurisdicción, como Bluebook (EE. UU.),
  OSCOLA (Reino Unido) o McGill (Canadá).
- Verificado con sentencias reales en varias jurisdicciones; el resto está
  menos probado.
- Los formatos legales siguen la práctica habitual y no se han comprobado
  con guías de estilo oficiales.
- Lo que no se reconoce como sentencia recibe una cita web.

**Privacidad**
- Sin recopilación de datos, sin análisis, sin servidores externos. Tus
  términos de búsqueda, listas guardadas y colores se guardan localmente en
  tu dispositivo (`chrome.storage.local`) y nunca salen de él.
- HueMark está desactivado en todas las pestañas hasta que lo activas en esa
  pestaña. Recuerda qué pestañas están activadas mediante una lista en
  memoria de números de pestaña únicamente: no se guardan direcciones de
  sitios, títulos ni historial.
- Copiar coincidencias lee el texto de la página solo cuando la usas, y
  copia al portapapeles solo cuando haces clic en Copiar.

**Bueno saberlo**
- HueMark se activa por pestaña. Las pestañas nuevas empiezan desactivadas:
  abre el popup y activa «Activado en esta pestaña» (o usa el botón ⏻ de la
  barra flotante). Tras actualizar desde una versión anterior, vuelve a
  activarlo en las pestañas que quieras.
- Funciona en cualquier página cuyo texto viva en el DOM real: la gran
  mayoría de la web.
- Las apps renderizadas en canvas (Google Docs, Google Sheets) no pueden
  resaltarse con ninguna extensión de navegador, HueMark incluido; su
  contenido se dibuja en un canvas, no como texto DOM real.
- En algunas ecuaciones de Wikipedia, los subíndices y superíndices copiados
  se pegan juntos (p. ej. «CO 2carbondioxide»).

**Search terms:**
- resaltar (highlight)
- resaltador (highlighter) de (of) texto (text)
- resaltado (highlight) multicolor (multi-color)
- resaltador (highlighter) de (of) palabras (words) clave (key)
- resaltador (highlighter) de (of) PDF (PDF)
- buscar (find) y (and) resaltar (highlight)
- resaltador (highlighter) de (of) palabras (words)

---

## French (fr)

**Short description**

Surlignez plusieurs mots ou expressions dans des couleurs différentes,
sur n'importe quelle page et dans les PDF, avec navigation clavier
entre les correspondances.

**Full description**

HueMark vous permet de surligner plusieurs termes de recherche à la
fois, chacun dans sa propre couleur, pour suivre visuellement plusieurs
fils d'information sur n'importe quelle page.

**Surligne partout**
- Pages statiques — surlignées dès leur chargement.
- Pages dynamiques et applications monopage — un observateur en direct
  détecte le nouveau contenu au fur et à mesure (défilement infini,
  messageries, flux en direct), les surlignages ne sont donc jamais
  obsolètes.
- PDF — en ligne (http/https) et fichiers PDF locaux, via une visionneuse
  PDF.js intégrée.
- Iframes et shadow DOM — les correspondances dans les cadres intégrés et
  les racines shadow sont aussi surlignées, avec une marque sur la barre de
  défilement pour chacune.

**Reste avec vous**
- Votre liste de termes et de couleurs est enregistrée et réappliquée
  automatiquement à chaque visite d'une page ou réouverture du navigateur.
- Une palette adaptée au daltonisme est accessible en un clic dans le
  panneau.
- Enregistrez plusieurs listes de termes sous un nom (jusqu'à 10) et passez
  de l'une à l'autre dans le panneau.

**Navigation au clavier en priorité**
- Passez au résultat suivant/précédent et changez de terme sans toucher
  la souris : Alt+Maj+Haut/Bas/Gauche/Droite (Cmd+Maj+... sur Mac).
- Un contour persistant marque votre correspondance actuelle pour ne
  jamais perdre votre position sur une longue page.
- Sur Edge, il peut être nécessaire d'attribuer ces raccourcis
  manuellement la première fois : rendez-vous sur
  `edge://extensions/shortcuts` pour les configurer s'ils ne
  fonctionnent pas par défaut.

**Correspondances avancées**
- Jokers (`*`, `?`) et expressions régulières (`/motif/`).
- Les accents sont toujours ignorés, sans option pour les désactiver. Des
  lettres comme ß, ł, đ et œ sont aussi prises en charge.
- Faites un clic droit sur un mot sélectionné et choisissez « Ajouter la sélection à HueMark ».

**Copier les occurrences**
- Un clic pour rassembler les occurrences, un second pour les copier avec le
  texte qui les entoure. Elles se collent en texte enrichi ou en texte brut.
- Choisissez Extrait, Phrase ou Paragraphe pour définir la quantité de texte
  autour de chaque occurrence.
- Styles de citation : APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA ou Plain.
- Les citations de pages web incluent des liens vers le texte ; celles des
  PDF, les numéros de page.
- Rien ne quitte votre appareil. Le résultat reste dans le stockage de
  session du navigateur jusqu'à la copie.

**Citations juridiques**
- Format Legal avec 22 options de juridiction, par exemple Bluebook (US),
  OSCOLA (Royaume-Uni) et McGill (Canada).
- Vérifié sur de vraies décisions de justice pour plusieurs juridictions ;
  les autres sont moins testées.
- Les formats juridiques suivent les usages courants et ne sont pas vérifiés
  par rapport aux guides de style officiels.
- Ce qui n'est pas reconnu comme une décision reçoit une citation web.

**Confidentialité**
- Aucune collecte de données, aucune analyse, aucun serveur externe. Vos
  termes de recherche, listes enregistrées et couleurs sont stockés
  localement sur votre appareil (`chrome.storage.local`) et n'en sortent
  jamais.
- HueMark est désactivé dans chaque onglet tant que vous ne l'activez pas
  pour cet onglet. Il retient quels onglets sont activés sous la forme d'une
  liste en mémoire de numéros d'onglet uniquement : aucune adresse de site,
  aucun titre ni historique n'est stocké.
- Copier les occurrences lit le texte de la page uniquement lorsque vous
  l'utilisez, et ne copie dans le presse-papiers que lorsque vous cliquez
  sur Copier.

**Bon à savoir**
- HueMark s'active onglet par onglet. Les nouveaux onglets démarrent
  désactivés : ouvrez la fenêtre contextuelle et activez « Activé pour cet
  onglet » (ou utilisez le bouton ⏻ de la barre flottante). Après une mise à
  jour depuis une version antérieure, réactivez-le dans les onglets voulus.
- Fonctionne sur toute page dont le texte réside dans le DOM réel — la
  grande majorité du web.
- Les applications rendues en canvas (Google Docs, Google Sheets) ne
  peuvent être surlignées par aucune extension de navigateur, HueMark
  compris ; leur contenu est dessiné sur un canvas, pas en texte DOM réel.
- Dans certaines équations Wikipédia, les indices et exposants copiés se
  collent les uns aux autres (ex. « CO 2carbondioxide »).

**Search terms:**
- surligner (highlight)
- surligneur (highlighter) de (of) texte (text)
- surlignage (highlight) multicolore (multi-color)
- surligneur (highlighter) de (of) mots-clés (keywords)
- surligneur (highlighter) PDF (PDF)
- rechercher (find) et (and) surligner (highlight)
- surligneur (highlighter) de (of) mots (words)

---

## German (de)

**Short description**

Markieren Sie mehrere Wörter oder Phrasen in verschiedenen Farben, auf
jeder Seite und in PDFs – mit Tastaturnavigation zwischen den Treffern.

**Full description**

Mit HueMark markieren Sie mehrere Suchbegriffe gleichzeitig, jeden in
einer eigenen Farbe, um mehrere Informationsstränge auf jeder Seite
visuell zu verfolgen.

**Markiert überall**
- Statische Seiten — werden sofort beim Laden markiert.
- Dynamische Seiten und Single-Page-Apps — ein Live-Beobachter erkennt
  neuen Inhalt, sobald er erscheint (endloses Scrollen, Chat-Apps,
  Live-Feeds), sodass Markierungen nie veralten.
- PDFs — sowohl online (http/https) als auch lokale PDF-Dateien, über
  einen integrierten PDF.js-Viewer.
- Iframes und Shadow DOM — Treffer in eingebetteten Frames und Shadow Roots
  werden ebenfalls markiert, und eine Markierung an der Bildlaufleiste zeigt
  jeden Treffer an.

**Bleibt bei Ihnen**
- Ihre Begriffsliste und Farben werden gespeichert und bei jedem
  erneuten Besuch einer Seite oder Neustart des Browsers automatisch
  wieder angewendet.
- Eine farbenblindengerechte Palette ist im Popup nur einen Klick
  entfernt.
- Speichern Sie mehrere Begriffslisten unter einem Namen (bis zu 10) und
  wechseln Sie im Popup zwischen ihnen.

**Tastatur zuerst**
- Springen Sie ohne Maus zum nächsten/vorherigen Treffer und wechseln
  Sie zwischen Begriffen: Alt+Umschalt+Pfeil hoch/runter/links/rechts
  (Cmd+Umschalt+... auf dem Mac).
- Ein bleibender Umriss markiert Ihren aktuellen Treffer, damit Sie beim
  Scannen einer langen Seite nie die Orientierung verlieren.
- Unter Edge müssen diese Tastenkombinationen beim ersten Mal
  möglicherweise manuell zugewiesen werden: Rufen Sie
  `edge://extensions/shortcuts` auf und legen Sie sie dort fest, falls
  sie nicht von selbst funktionieren.

**Erweitertes Suchen**
- Platzhalter (`*`, `?`) und reguläre Ausdrücke (`/Muster/`).
- Akzente werden immer ignoriert, eine Option zum Ausschalten gibt es nicht.
  Buchstaben wie ß, ł, đ und œ werden ebenfalls berücksichtigt.
- Klicken Sie mit der rechten Maustaste auf ein markiertes Wort und wählen Sie „Auswahl zu HueMark hinzufügen“.

**Treffer kopieren**
- Ein Klick sammelt die Treffer, ein zweiter kopiert sie mit dem umgebenden
  Text. Sie lassen sich als Rich Text oder Klartext einfügen.
- Wählen Sie Ausschnitt, Satz oder Absatz, um festzulegen, wie viel Text
  jeden Treffer umgibt.
- Zitierstile: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA oder Plain.
- Zitate aus Webseiten enthalten Scroll-to-Text-Links, Zitate aus PDFs
  Seitenzahlen.
- Nichts verlässt Ihr Gerät. Das Ergebnis bleibt im Sitzungsspeicher des
  Browsers, bis Sie es kopieren.

**Juristische Zitate**
- Juristisches Format mit 22 Auswahlmöglichkeiten, z. B. Bluebook (USA),
  OSCOLA (UK) und McGill (Kanada).
- An echten Gerichtsseiten für mehrere Rechtsordnungen geprüft; die übrigen
  sind weniger getestet.
- Die Formate folgen gängiger Praxis und wurden nicht mit offiziellen
  Stilrichtlinien abgeglichen.
- Was nicht als Entscheidung erkannt wird, erhält eine Webzitierung.

**Datenschutz**
- Keine Datenerfassung, keine Analysen, keine externen Server. Ihre
  Suchbegriffe und Farben werden lokal auf Ihrem Gerät gespeichert
  (`chrome.storage.local`) und verlassen es nie.
- HueMark ist in jedem Tab ausgeschaltet, bis Sie es für diesen Tab
  einschalten. Welche Tabs aktiv sind, merkt es sich nur als Liste von
  Tab-Nummern im Arbeitsspeicher: Es werden keine Website-Adressen, Titel
  oder Verlaufsdaten gespeichert.
- Treffer kopieren liest den Text der Seite nur, wenn Sie es verwenden, und
  schreibt nur beim Klick auf Kopieren in die Zwischenablage.

**Gut zu wissen**
- HueMark wird pro Tab eingeschaltet. Neue Tabs starten ausgeschaltet: Öffnen
  Sie das Popup und aktivieren Sie „Für diesen Tab aktiviert“ (oder nutzen
  Sie die ⏻-Schaltfläche in der schwebenden Leiste). Schalten Sie es nach
  einem Update von einer früheren Version in den gewünschten Tabs erneut ein.
- Funktioniert auf jeder Seite, deren Text im echten DOM steht — der
  überwiegende Teil des Webs.
- Canvas-gerenderte Apps (Google Docs, Google Sheets) können von keiner
  Browser-Erweiterung markiert werden, auch nicht von HueMark — ihr
  Inhalt wird auf einem Canvas gezeichnet, nicht als echter DOM-Text.
- In manchen Wikipedia-Formeln werden kopierte tief- und hochgestellte
  Zeichen zusammengeschrieben (z. B. „CO 2carbondioxide“).

**Search terms:**
- markieren (highlight)
- texthervorhebung (text highlighter)
- mehrfarbige (multi-color) markierung (highlight)
- schlagwort (keyword) markierung (highlight)
- pdf (PDF) markierung (highlight)
- suchen (search) und (and) markieren (highlight)
- wort (word) markierung (highlight)

---

## Japanese (ja)

**Short description**

任意のページやPDFで、複数の単語やフレーズをそれぞれ異なる色でハイライト。
キーボードで一致箇所間を移動できます。

**Full description**

HueMarkを使えば、複数の検索語を一度にそれぞれ別の色でハイライトでき、
どんなページでも複数の情報の流れを視覚的に追跡できます。

**どこでもハイライト**
- 静的なページ — 読み込まれた瞬間にハイライトされます。
- 動的なページやシングルページアプリ — ライブ監視が新しいコンテンツを
  検知します（無限スクロール、チャットアプリ、ライブフィードなど）の
  で、ハイライトが古くなることはありません。
- PDF — オンライン（http/https）とローカルのPDFファイルの両方に対応、
  内蔵のPDF.jsビューアーを使用します。
- iframe と shadow DOM — 埋め込みフレームや shadow root 内の一致箇所も
  ハイライトされ、スクロールバーに一致箇所ごとの目印が表示されます。

**設定が保持される**
- 用語リストと色は保存され、ページを再訪問したりブラウザを再起動した
  りするたびに自動的に再適用されます。
- 色覚多様性に配慮したパレットをポップアップからワンクリックで切り替
  えられます。
- 用語リストに名前を付けて最大10件まで保存し、ポップアップで切り替えられます。

**キーボード操作優先**
- マウスを使わずに次/前の一致箇所へジャンプし、用語を切り替えられます：
  Alt+Shift+上/下/左/右（Macでは Cmd+Shift+...）。
- 現在の一致箇所には常に枠線が表示されるため、長いページをスキャンして
  も自分の位置を見失いません。
- Edgeでは、これらのショートカットを初回に手動で割り当てる必要がある
  場合があります。標準で動作しない場合は `edge://extensions/shortcuts`
  にアクセスして設定してください。

**一致の高度な検索**
- ワイルドカード（`*`、`?`）と正規表現（`/パターン/`）に対応。
- アクセントは常に無視されます（オフにする設定はありません）。ß、ł、đ、œ なども対応します。
- 選択した単語を右クリックし、「選択範囲を HueMark に追加」を選ぶと用語として追加できます。

**一致箇所をコピー**
- 1回目のクリックで一致箇所を収集し、2回目のクリックで前後のテキストと一緒にコピーします。リッチテキストまたはプレーンテキストとして貼り付けられます。
- スニペット、文、段落から、各一致の前後に含めるテキストの量を選べます。
- 引用スタイル：APA、MLA、Chicago、Harvard、IEEE、Vancouver、AMA、Plain。
- Web の引用にはテキストフラグメントのリンク、PDF の引用にはページ番号が付きます。
- データは端末の外に出ません。結果はコピーするまでブラウザのセッションストレージに保持されます。

**法律の引用**
- 22 の法域オプションを持つ Legal 形式（例：Bluebook（米国）、OSCOLA（英国）、McGill（カナダ））。
- 複数の法域で実際の判決ページを使って確認済み。その他は検証が少ないです。
- 法律形式は一般的な慣行に基づくもので、公式のスタイルガイドとの照合は行っていません。
- 判例として認識されないものは Web の引用になります。

**プライバシー**
- データ収集なし、分析なし、外部サーバーなし。検索語、保存したリスト、色はお使いのデバイスにローカル保存され（`chrome.storage.local`）、外部に送信される
  ことはありません。
- HueMarkは、そのタブでオンにするまで、すべてのタブでオフです。どのタブがオンかは、タブ番号のみをメモリ上のリストとして記憶します。サイトのアドレス、タイトル、履歴は保存されません。
- 「一致箇所をコピー」は、使用時にのみページのテキストを読み取り、「コピー」をクリックしたときだけクリップボードに書き込みます。

**知っておくと良いこと**
- HueMarkはタブごとにオンにします。新しいタブはオフの状態で始まります。ポップアップを開いて「このタブで有効」をオンにしてください（またはフローティングバーの ⏻ ボタンを使用）。以前のバージョンから更新した後は、必要なタブで再度オンにしてください。
- テキストが実際のDOMに存在するページであればどこでも動作します —
  ウェブの大部分がこれに該当します。
- Canvasで描画されるアプリ（Google Docs、Google Sheetsなど）は、
  HueMarkを含むどのブラウザ拡張機能でもハイライトできません。これら
  のコンテンツは実際のDOMテキストではなくCanvasに描画されるためです。
- 一部の Wikipedia の数式では、コピーした下付き・上付き文字が続けて貼り付けられます（例：「CO 2carbondioxide」）。

**Search terms:**
- ハイライト (highlight)
- テキスト (text) ハイライター (highlighter)
- マルチカラー (multi-color) ハイライト (highlight)
- キーワード (keyword) ハイライター (highlighter)
- PDF (PDF) ハイライター (highlighter)
- 検索して (search) ハイライト (highlight)
- 単語 (word) ハイライター (highlighter)

---

## Arabic (ar)

**Short description**

تُمكّنك من تمييز عدة كلمات أو عبارات بألوان مختلفة، في أي صفحة وفي ملفات
PDF، مع التنقل بينها باستخدام لوحة المفاتيح.

**Full description**

HueMark يتيح لك تمييز عدة مصطلحات بحث في وقت واحد، كل واحد بلونه الخاص،
لتتبع عدة مواضيع بصريًا على أي صفحة.

**يُميّز في كل مكان**
- الصفحات الثابتة — يتم تمييزها فور تحميلها.
- الصفحات الديناميكية وتطبيقات الصفحة الواحدة — مراقب مباشر يرصد المحتوى
  الجديد فور ظهوره (التمرير اللانهائي، تطبيقات الدردشة، الموجزات
  المباشرة)، بحيث لا يصبح التمييز قديمًا أبدًا.
- ملفات PDF — عبر الإنترنت (http/https) والملفات المحلية، من خلال عارض
  PDF.js مدمج.
- التضمينات (iframes) وShadow DOM: تُميَّز التطابقات داخل الإطارات المضمنة وجذور Shadow أيضًا، مع علامة على شريط التمرير لكل تطابق.

**يبقى معك**
- تُحفظ قائمة المصطلحات والألوان الخاصة بك ويُعاد تطبيقها تلقائيًا في كل
  مرة تزور فيها صفحة أو تعيد فتح المتصفح.
- لوحة ألوان مناسبة لعمى الألوان متاحة بنقرة واحدة في النافذة المنبثقة.
- احفظ عدة قوائم مصطلحات بأسماء (حتى 10) وبدِّل بينها من النافذة المنبثقة.

**التنقل بلوحة المفاتيح أولاً**
- انتقل إلى التطابق التالي/السابق وتنقل بين المصطلحات دون لمس الفأرة:
  Alt+Shift+سهم لأعلى/لأسفل/لليسار/لليمين (Cmd+Shift+... على Mac).
- إطار ثابت يحدد تطابقك الحالي حتى لا تفقد مكانك أثناء تصفح صفحة طويلة.
- في Edge، قد تحتاج إلى تعيين هذه الاختصارات يدويًا في المرة الأولى:
  انتقل إلى `edge://extensions/shortcuts` واضبطها هناك إذا لم تعمل
  تلقائيًا.

**تمييز متقدم**
- أحرف البدل (`*`، `?`) والتعبيرات النمطية (`/نمط/`).
- تُتجاهل علامات الحروف (مثل النبر) دائمًا، بلا خيار لإيقافها. كما تُعالج حروف مثل ß وł وđ وœ.
- انقر بزر الفأرة الأيمن على كلمة محددة واختر «إضافة التحديد إلى HueMark».

**نسخ التطابقات**
- انقر مرة لجمع التطابقات ومرة أخرى لنسخها مع النص المحيط بكل تطابق. تُلصَق كنص منسق أو نص عادي.
- اختر مقتطفًا أو جملة أو فقرة لتحديد مقدار النص المحيط بكل تطابق.
- أنماط الاستشهاد: APA وMLA وChicago وHarvard وIEEE وVancouver وAMA وPlain.
- تتضمن الاقتباسات من صفحات الويب روابط للنص، واقتباسات PDF أرقام الصفحات.
- لا يغادر شيء جهازك. تبقى النتيجة في تخزين الجلسة في المتصفح إلى أن تنسخها.

**الاستشهادات القانونية**
- تنسيق قانوني بخيارات لـ22 ولاية قضائية، مثل Bluebook (الولايات المتحدة) وOSCOLA (المملكة المتحدة) وMcGill (كندا).
- تم التحقق من صفحات أحكام حقيقية لعدة ولايات قضائية؛ والبقية أقل اختبارًا.
- تتبع التنسيقات القانونية الممارسات الشائعة ولم تُقارن بأدلة الأسلوب الرسمية.
- ما لا يُعرف كحكم قضائي يحصل على استشهاد ويب بدلًا من ذلك.

**الخصوصية**
- لا جمع بيانات، لا تحليلات، لا خوادم خارجية. تُخزَّن مصطلحات البحث
  والقوائم المحفوظة والألوان الخاصة بك محليًا على جهازك (`chrome.storage.local`)
  ولا تغادره أبدًا.
- HueMark متوقف في كل تبويب إلى أن تشغّله لذلك التبويب. يتذكر التبويبات
  المفعّلة كقائمة في الذاكرة تضم أرقام التبويبات فقط: لا تُخزَّن عناوين
  المواقع ولا العناوين ولا سجل التصفح.
- يقرأ «نسخ التطابقات» نص الصفحة فقط عند استخدامه، ولا يكتب في الحافظة إلا عند النقر على «نسخ».

**من الجيد معرفته**
- يُفعَّل HueMark لكل تبويب على حدة. تبدأ التبويبات الجديدة متوقفة: افتح
  النافذة المنبثقة وشغّل «مفعّل لهذا التبويب» (أو استخدم زر ⏻ في الشريط
  العائم). بعد التحديث من إصدار سابق، شغّله مجددًا في التبويبات التي تريدها.
- يعمل على أي صفحة يكون نصها موجودًا في DOM الفعلي — الغالبية العظمى من
  الويب.
- التطبيقات المرسومة على Canvas (مثل Google Docs وGoogle Sheets) لا يمكن
  تمييزها بأي إضافة متصفح، بما في ذلك HueMark — لأن محتواها يُرسم على
  Canvas وليس كنص DOM فعلي.
- في بعض معادلات ويكيبيديا، تلتصق الأدلة السفلية والعلوية عند النسخ (مثل: "CO 2carbondioxide").

**Search terms:**
- تمييز (highlight)
- مميز (highlighter) النص (the text)
- تمييز (highlight) متعدد الألوان (multi-color)
- تمييز (highlight) الكلمات (words) المفتاحية (key)
- تمييز (highlight) PDF (PDF)
- البحث (search) و (and) التمييز (highlight)
- مميز (highlighter) الكلمات (words)

---

## Hindi (hi)

**Short description**

कई शब्दों या वाक्यांशों को अलग-अलग रंगों में हाइलाइट करें, किसी भी पेज
पर और PDF में — मिलानों के बीच कीबोर्ड नेविगेशन के साथ।

**Full description**

HueMark आपको एक साथ कई खोज शब्दों को हाइलाइट करने देता है, प्रत्येक अपने
रंग में, ताकि आप किसी भी पेज पर कई जानकारी की धाराओं को नेत्रहीन रूप से
ट्रैक कर सकें।

**हर जगह हाइलाइट करता है**
- स्थिर पेज — लोड होते ही हाइलाइट हो जाते हैं।
- डायनामिक पेज और सिंगल-पेज ऐप्स — एक लाइव वॉचर नई सामग्री को दिखते ही
  पकड़ लेता है (इनफिनिट स्क्रॉल, चैट ऐप्स, लाइव फीड), इसलिए हाइलाइट्स
  कभी पुराने नहीं पड़ते।
- PDF — ऑनलाइन (http/https) और लोकल PDF फ़ाइलें दोनों, एक बिल्ट-इन
  PDF.js व्यूअर के जरिए।
- iframes और shadow DOM — एम्बेड किए गए फ़्रेम और shadow roots के अंदर के मिलान भी हाइलाइट होते हैं, और स्क्रॉल-बार पर हर मिलान का एक निशान दिखता है।

**आपके साथ बना रहता है**
- आपकी टर्म लिस्ट और रंग सेव हो जाते हैं और हर बार जब आप किसी पेज पर
  दोबारा जाते हैं या ब्राउज़र फिर से खोलते हैं तो अपने आप फिर से लागू हो
  जाते हैं।
- रंग-अंधता के अनुकूल पैलेट पॉपअप में एक क्लिक दूर है।
- कई टर्म लिस्ट को नाम से सेव करें (अधिकतम 10) और पॉपअप में उनके बीच स्विच करें।

**कीबोर्ड-फर्स्ट नेविगेशन**
- माउस छुए बिना अगले/पिछले मिलान पर जाएं और शब्दों के बीच साइकल करें:
  Alt+Shift+ऊपर/नीचे/बाएं/दाएं (Mac पर Cmd+Shift+...)।
- एक स्थायी आउटलाइन आपके वर्तमान मिलान को चिह्नित करता है ताकि लंबे पेज
  को स्कैन करते समय आप अपनी जगह न खोएं।
- Edge में, इन शॉर्टकट्स को पहली बार मैन्युअल रूप से असाइन करना पड़ सकता
  है: यदि ये अपने आप काम न करें तो `edge://extensions/shortcuts` पर
  जाकर इन्हें सेट करें।

**उन्नत मिलान**
- वाइल्डकार्ड (`*`, `?`) और रेगुलर एक्सप्रेशन (`/पैटर्न/`)।
- एक्सेंट हमेशा अनदेखे किए जाते हैं, इसे बंद करने का विकल्प नहीं है। ß, ł, đ और œ जैसे अक्षर भी शामिल हैं।
- किसी चुने हुए शब्द पर राइट-क्लिक करें और «HueMark में चयन जोड़ें» चुनें।

**मैच कॉपी करें**
- एक बार क्लिक करके मैच इकट्ठे करें, फिर दोबारा क्लिक करके उन्हें आसपास के टेक्स्ट के साथ कॉपी करें। ये रिच टेक्स्ट या सादे टेक्स्ट के रूप में पेस्ट होते हैं।
- हर मैच के आसपास कितना टेक्स्ट हो, यह स्निपेट, वाक्य या पैराग्राफ़ से चुनें।
- उद्धरण शैलियाँ: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA या Plain।
- वेब उद्धरणों में स्क्रॉल-टू-टेक्स्ट लिंक और PDF उद्धरणों में पेज नंबर मिलते हैं।
- कुछ भी आपके डिवाइस से बाहर नहीं जाता। कॉपी करने तक नतीजा ब्राउज़र के सेशन स्टोरेज में रहता है।

**कानूनी उद्धरण**
- 22 क्षेत्राधिकार विकल्पों वाला Legal फ़ॉर्मैट, जैसे Bluebook (US), OSCOLA (UK) और McGill (Canada)।
- कई क्षेत्राधिकारों के लिए असली कोर्ट पेजों पर जाँचा गया है; बाकी कम परखे गए हैं।
- कानूनी फ़ॉर्मैट आम प्रचलन पर आधारित हैं और आधिकारिक स्टाइल गाइड से मिलाए नहीं गए हैं।
- जिसे फ़ैसले के रूप में नहीं पहचाना जाता, उसे वेब उद्धरण मिलता है।

**गोपनीयता**
- कोई डेटा संग्रह नहीं, कोई एनालिटिक्स नहीं, कोई बाहरी सर्वर नहीं। आपके
  खोज शब्द और रंग आपके डिवाइस पर लोकल रूप से सेव होते हैं
  (`chrome.storage.local`) और कभी बाहर नहीं जाते।
- HueMark हर टैब में बंद रहता है, जब तक आप उस टैब के लिए इसे चालू नहीं करते। यह कौन-से टैब चालू हैं, यह केवल टैब नंबरों की इन-मेमोरी सूची के रूप में याद रखता है: साइट के पते, शीर्षक या इतिहास सेव नहीं किए जाते।
- मैच कॉपी करें पेज का टेक्स्ट केवल तब पढ़ता है जब आप इसे इस्तेमाल करते हैं, और क्लिपबोर्ड में केवल कॉपी पर क्लिक करने पर लिखता है।

**जानना अच्छा है**
- HueMark हर टैब के लिए अलग से चालू होता है। नए टैब बंद स्थिति में शुरू होते हैं: पॉपअप खोलें और “इस टैब के लिए चालू” को चालू करें (या फ़्लोटिंग बार के ⏻ बटन का उपयोग करें)। पिछले संस्करण से अपडेट करने के बाद, जिन टैब में चाहें उनमें इसे फिर से चालू करें।
- किसी भी ऐसे पेज पर काम करता है जिसका टेक्स्ट असली DOM में मौजूद हो —
  वेब का बड़ा हिस्सा इसी तरह का है।
- Canvas पर रेंडर होने वाले ऐप्स (Google Docs, Google Sheets) को कोई भी
  ब्राउज़र एक्सटेंशन हाइलाइट नहीं कर सकता, HueMark सहित — इनकी सामग्री
  असली DOM टेक्स्ट के बजाय Canvas पर बनाई जाती है।
- कुछ Wikipedia समीकरणों में कॉपी किए गए सब्सक्रिप्ट और सुपरस्क्रिप्ट आपस में जुड़ जाते हैं (जैसे “CO 2carbondioxide”)।

**Search terms:**
- हाइलाइट (highlight)
- टेक्स्ट (text) हाइलाइटर (highlighter)
- मल्टी-कलर (multi-color) हाइलाइट (highlight)
- कीवर्ड (keyword) हाइलाइटर (highlighter)
- पीडीएफ (PDF) हाइलाइटर (highlighter)
- खोजें (find) और (and) हाइलाइट करें (highlight)
- शब्द (word) हाइलाइटर (highlighter)

---

## Italian (it)

**Short description**

Evidenzia più parole o frasi in colori diversi, su qualsiasi pagina e nei
PDF — con navigazione da tastiera tra le corrispondenze.

**Full description**

HueMark ti permette di evidenziare più termini di ricerca
contemporaneamente, ciascuno con il proprio colore, per seguire
visivamente più filoni di informazione su qualsiasi pagina.

**Evidenzia ovunque**
- Pagine statiche — evidenziate nel momento in cui si caricano.
- Pagine dinamiche e app a pagina singola — un osservatore live rileva i
  nuovi contenuti man mano che arrivano (scroll infinito, app di chat,
  feed in diretta), così le evidenziazioni non sono mai obsolete.
- PDF — sia online (http/https) che file PDF locali, tramite un
  visualizzatore PDF.js integrato.
- iframe e shadow DOM — anche le corrispondenze dentro i frame incorporati e le shadow root vengono evidenziate, e un segno sulla barra di scorrimento indica ciascuna corrispondenza.

**Resta con te**
- La tua lista di termini e colori viene salvata e riapplicata
  automaticamente ogni volta che rivisiti una pagina o riapri il browser.
- Una tavolozza per daltonici è a un clic di distanza nel popup.
- Salva più liste di termini con un nome (fino a 10) e passa dall'una all'altra nel popup.

**Navigazione da tastiera**
- Salta alla corrispondenza successiva/precedente e passa da un termine
  all'altro senza toccare il mouse: Alt+Maiusc+Su/Giù/Sinistra/Destra
  (Cmd+Maiusc+... su Mac).
- Un contorno persistente segna la tua corrispondenza attuale, così non
  perdi mai il tuo punto mentre scorri una pagina lunga.
- Su Edge, potrebbe essere necessario assegnare manualmente queste
  scorciatoie la prima volta: visita `edge://extensions/shortcuts` e
  impostale lì se non funzionano immediatamente.

**Corrispondenze avanzate**
- Caratteri jolly (`*`, `?`) ed espressioni regolari (`/schema/`).
- Gli accenti vengono sempre ignorati, senza opzione per disattivarlo. Sono gestite anche lettere come ß, ł, đ e œ.
- Fai clic destro su una parola selezionata e scegli «Aggiungi selezione a HueMark».

**Copia le corrispondenze**
- Un clic raccoglie le corrispondenze, un altro le copia con il testo che le circonda. Si incollano come testo formattato o testo semplice.
- Scegli Frammento, Frase o Paragrafo per decidere quanto testo circonda ogni corrispondenza.
- Stili di citazione: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA o Plain.
- Le citazioni da pagine web includono link al testo; quelle dai PDF includono i numeri di pagina.
- Nulla lascia il tuo dispositivo. Il risultato resta nell'archiviazione di sessione del browser finché non lo copi.

**Citazioni legali**
- Formato Legal con 22 opzioni di giurisdizione, come Bluebook (USA), OSCOLA (Regno Unito) e McGill (Canada).
- Verificato su pagine reali di sentenze per diverse giurisdizioni; le altre sono testate meno.
- I formati legali seguono la prassi comune e non sono stati verificati con guide di stile ufficiali.
- Ciò che non viene riconosciuto come sentenza riceve una citazione web.

**Privacy**
- Nessuna raccolta dati, nessuna analisi, nessun server esterno. I tuoi
  termini di ricerca, le liste salvate e i colori sono salvati localmente sul
  tuo dispositivo (`chrome.storage.local`) e non ne escono mai.
- HueMark è disattivato in ogni scheda finché non lo attivi per quella scheda. Ricorda quali schede sono attive solo come elenco in memoria di numeri di scheda: non vengono salvati indirizzi di siti, titoli o cronologia.
- Copia le corrispondenze legge il testo della pagina solo quando lo usi, e scrive negli appunti solo quando fai clic su Copia.

**Buono a sapersi**
- HueMark si attiva per scheda. Le nuove schede partono disattivate: apri il popup e attiva «Attivo per questa scheda» (oppure usa il pulsante ⏻ sulla barra mobile). Dopo l'aggiornamento da una versione precedente, riattivalo nelle schede desiderate.
- Funziona su qualsiasi pagina il cui testo risieda nel DOM reale — la
  grande maggioranza del web.
- Le app renderizzate su canvas (Google Docs, Google Sheets) non possono
  essere evidenziate da nessuna estensione del browser, HueMark incluso —
  il loro contenuto è disegnato su un canvas, non come testo DOM reale.
- In alcune formule di Wikipedia, pedici ed esponenti copiati risultano attaccati tra loro (es. «CO 2carbondioxide»).

**Search terms:**
- evidenziare (highlight)
- evidenziatore (highlighter) di (of) testo (text)
- evidenziazione (highlight) multicolore (multi-color)
- evidenziatore (highlighter) di (of) parole (words) chiave (key)
- evidenziatore (highlighter) PDF (PDF)
- cerca (find) ed (and) evidenzia (highlight)
- evidenziatore (highlighter) di (of) parole (words)

---

## Korean (ko)

**Short description**

여러 단어나 구문을 서로 다른 색으로 강조 표시하세요. 모든 페이지와
PDF에서, 일치 항목 간 키보드 탐색과 함께.

**Full description**

HueMark를 사용하면 여러 검색어를 한 번에 각각 다른 색으로 강조
표시하여 어떤 페이지에서든 여러 정보 흐름을 시각적으로 추적할 수
있습니다.

**어디서나 강조 표시**
- 정적 페이지 — 로드되는 즉시 강조 표시됩니다.
- 동적 페이지와 싱글 페이지 앱 — 실시간 감시기가 새 콘텐츠가 나타나는
  즉시 감지하므로(무한 스크롤, 채팅 앱, 실시간 피드) 강조 표시가
  오래되는 일이 없습니다.
- PDF — 온라인(http/https)과 로컬 PDF 파일 모두, 내장된 PDF.js 뷰어를
  통해 지원됩니다.
- iframe 및 shadow DOM — 포함된 프레임과 shadow root 안의 일치 항목도 강조 표시되며, 스크롤 막대에 각 일치 항목의 표시가 나타납니다.

**설정이 유지됩니다**
- 용어 목록과 색상이 저장되어 페이지를 다시 방문하거나 브라우저를 다시
  열 때마다 자동으로 다시 적용됩니다.
- 색약자 친화 팔레트를 팝업에서 클릭 한 번으로 전환할 수 있습니다.
- 용어 목록을 이름과 함께 최대 10개까지 저장하고 팝업에서 전환할 수 있습니다.

**키보드 우선 탐색**
- 마우스를 사용하지 않고 다음/이전 일치 항목으로 이동하고 용어 간
  전환: Alt+Shift+위/아래/왼쪽/오른쪽(Mac에서는 Cmd+Shift+...).
- 지속적인 윤곽선이 현재 일치 항목을 표시하여 긴 페이지를 스캔하는
  동안 위치를 잃지 않습니다.
- Edge에서는 이러한 단축키를 처음에 수동으로 지정해야 할 수 있습니다.
  기본적으로 작동하지 않으면 `edge://extensions/shortcuts`로 이동하여
  설정하세요.

**고급 일치**
- 와일드카드(`*`, `?`)와 정규식(`/패턴/`)을 지원합니다.
- 악센트는 항상 무시되며 끌 수 있는 설정은 없습니다. ß, ł, đ, œ 같은 문자도 처리합니다.
- 선택한 단어를 마우스 오른쪽 클릭하고 “HueMark에 선택 항목 추가”를 고르세요.

**일치 항목 복사**
- 한 번 클릭하면 일치 항목을 수집하고, 다시 클릭하면 주변 텍스트와 함께 복사합니다. 서식 있는 텍스트 또는 일반 텍스트로 붙여넣을 수 있습니다.
- 스니펫, 문장, 단락 중에서 각 일치 항목 주변에 포함할 텍스트 양을 고르세요.
- 인용 스타일: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA 또는 Plain.
- 웹 인용문에는 텍스트 조각 링크가, PDF 인용문에는 페이지 번호가 붙습니다.
- 데이터는 기기 밖으로 나가지 않습니다. 결과는 복사할 때까지 브라우저 세션 저장소에 보관됩니다.

**법률 인용**
- 22개 관할 옵션이 있는 Legal 형식(예: Bluebook(미국), OSCOLA(영국), McGill(캐나다)).
- 여러 관할권에 대해 실제 판결 페이지로 확인했으며, 나머지는 덜 검증되었습니다.
- 법률 형식은 일반적인 관행을 따르며 공식 스타일 가이드와 대조하지 않았습니다.
- 판례로 인식되지 않는 항목은 웹 인용으로 대체됩니다.

**개인정보 보호**
- 데이터 수집 없음, 분석 없음, 외부 서버 없음. 검색어와 색상은 기기에
  로컬로 저장되며(`chrome.storage.local`) 외부로 전송되지 않습니다.
- HueMark는 해당 탭에서 켜기 전까지 모든 탭에서 꺼져 있습니다. 어떤 탭이 켜져 있는지는 탭 번호만 담은 메모리 내 목록으로 기억하며, 사이트 주소, 제목, 방문 기록은 저장되지 않습니다.
- 검색어, 저장된 목록, 색상은 기기 안에만 머무릅니다.
- 일치 항목 복사는 사용할 때만 페이지 텍스트를 읽고, 복사를 누를 때만 클립보드에 씁니다.

**알아두면 좋은 점**
- HueMark는 탭별로 켭니다. 새 탭은 꺼진 상태로 시작합니다. 팝업을 열고 "이 탭에서 사용 중"을 켜세요(또는 플로팅 바의 ⏻ 버튼 사용). 이전 버전에서 업데이트한 후에는 원하는 탭에서 다시 켜세요.
- 텍스트가 실제 DOM에 존재하는 모든 페이지에서 작동합니다 — 웹의
  대부분이 여기에 해당합니다.
- Canvas로 렌더링되는 앱(Google Docs, Google Sheets)은 HueMark를
  포함한 어떤 브라우저 확장 프로그램으로도 강조 표시할 수 없습니다 —
  콘텐츠가 실제 DOM 텍스트가 아닌 캔버스에 그려지기 때문입니다.
- 일부 Wikipedia 수식에서는 복사한 아래첨자와 위첨자가 붙어서 나옵니다(예: “CO 2carbondioxide”).

**Search terms:**
- 하이라이트 (highlight)
- 텍스트 (text) 하이라이터 (highlighter)
- 멀티컬러 (multi-color) 하이라이트 (highlight)
- 키워드 (keyword) 하이라이터 (highlighter)
- PDF (PDF) 하이라이터 (highlighter)
- 검색 (search) 후 (then) 강조 표시 (highlight)
- 단어 (word) 하이라이터 (highlighter)

---

## Portuguese - Brazil (pt_BR)

**Short description**

Destaque várias palavras ou frases em cores diferentes, em qualquer
página e em PDFs — com navegação por teclado entre as correspondências.

**Full description**

O HueMark permite destacar vários termos de pesquisa ao mesmo tempo,
cada um em sua própria cor, para acompanhar visualmente várias linhas de
informação em qualquer página.

**Destaca em todo lugar**
- Páginas estáticas — destacadas assim que carregam.
- Páginas dinâmicas e aplicativos de página única — um observador em
  tempo real detecta novo conteúdo conforme ele aparece (rolagem
  infinita, apps de chat, feeds ao vivo), então os destaques nunca ficam
  desatualizados.
- PDFs — tanto online (http/https) quanto arquivos PDF locais, por meio
  de um visualizador PDF.js integrado.
- Iframes e shadow DOM — as correspondências dentro de frames incorporados e de shadow roots também são destacadas, e uma marca na barra de rolagem indica cada uma.

**Permanece com você**
- Sua lista de termos e cores é salva e reaplicada automaticamente toda
  vez que você revisita uma página ou reabre o navegador.
- Uma paleta para daltônicos está a um clique de distância no pop-up.
- Salve várias listas de termos com nome (até 10) e alterne entre elas no pop-up.

**Navegação por teclado em primeiro lugar**
- Pule para a correspondência seguinte/anterior e alterne entre termos
  sem tocar no mouse: Alt+Shift+Cima/Baixo/Esquerda/Direita (Cmd+Shift+...
  no Mac).
- Um contorno persistente marca sua correspondência atual para que você
  nunca perca seu lugar ao percorrer uma página longa.
- No Edge, pode ser necessário atribuir esses atalhos manualmente na
  primeira vez: acesse `edge://extensions/shortcuts` e configure-os lá
  se não funcionarem automaticamente.

**Correspondências avançadas**
- Curingas (`*`, `?`) e expressões regulares (`/padrão/`).
- Acentos são sempre ignorados, sem opção para desativar. Letras como ß, ł, đ e œ também são tratadas.
- Clique com o botão direito em uma palavra selecionada e escolha «Adicionar seleção ao HueMark».

**Copiar ocorrências**
- Um clique reúne as ocorrências e outro as copia com o texto ao redor. Elas são coladas como texto formatado ou texto simples.
- Escolha Trecho, Frase ou Parágrafo para definir quanto texto envolve cada ocorrência.
- Estilos de citação: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA ou Plain.
- Citações de páginas da web têm links para o texto; citações de PDFs têm números de página.
- Nada sai do seu dispositivo. O resultado fica no armazenamento de sessão do navegador até você copiá-lo.

**Citações jurídicas**
- Formato Legal com 22 opções de jurisdição, como Bluebook (EUA), OSCOLA (Reino Unido) e McGill (Canadá).
- Verificado em páginas reais de tribunais para várias jurisdições; as demais foram menos testadas.
- Os formatos jurídicos seguem práticas comuns e não foram conferidos com guias de estilo oficiais.
- O que não for reconhecido como decisão recebe uma citação de página da web.

**Privacidade**
- Sem coleta de dados, sem análises, sem servidores externos. Seus termos
  de pesquisa, listas salvas e cores são armazenados localmente no seu
  dispositivo (`chrome.storage.local`) e nunca saem dele.
- O HueMark fica desativado em todas as guias até você ativá-lo para aquela guia. Ele lembra quais guias estão ativadas apenas como uma lista em memória de números de guia: nenhum endereço de site, título ou histórico é armazenado.
- Copiar ocorrências lê o texto da página somente quando você usa o recurso, e grava na área de transferência somente quando você clica em Copiar.

**Bom saber**
- O HueMark é ativado por guia. Novas guias começam desativadas: abra o popup e ative «Ativado nesta guia» (ou use o botão ⏻ da barra flutuante). Após atualizar de uma versão anterior, ative-o novamente nas guias que quiser.
- Funciona em qualquer página cujo texto esteja no DOM real — a grande
  maioria da web.
- Aplicativos renderizados em canvas (Google Docs, Google Sheets) não
  podem ser destacados por nenhuma extensão de navegador, incluindo o
  HueMark — seu conteúdo é desenhado em um canvas, não como texto DOM
  real.
- Em algumas equações da Wikipédia, subscritos e sobrescritos copiados aparecem colados (ex.: «CO 2carbondioxide»).

**Search terms:**
- destacar (highlight)
- destacador (highlighter) de (of) texto (text)
- destaque (highlight) multicolorido (multi-color)
- destacador (highlighter) de (of) palavras-chave (keywords)
- destacador (highlighter) de (of) PDF (PDF)
- pesquisar (search) e (and) destacar (highlight)
- destacador (highlighter) de (of) palavras (words)

---

## Russian (ru)

**Short description**

Подсвечивайте несколько слов или фраз разными цветами на любой странице
и в PDF — с навигацией по совпадениям с клавиатуры.

**Full description**

HueMark позволяет подсвечивать несколько поисковых запросов
одновременно, каждый своим цветом, чтобы визуально отслеживать
несколько тем на любой странице.

**Подсвечивает везде**
- Статические страницы — подсвечиваются сразу после загрузки.
- Динамические страницы и одностраничные приложения — наблюдатель в
  реальном времени обнаруживает новый контент по мере его появления
  (бесконечная прокрутка, чаты, живые ленты), поэтому подсветка никогда
  не устаревает.
- PDF — как онлайн (http/https), так и локальные PDF-файлы, через
  встроенный просмотрщик PDF.js.
- iframe и shadow DOM — совпадения внутри встроенных фреймов и shadow root тоже подсвечиваются, а на полосе прокрутки отмечено каждое совпадение.

**Остаётся с вами**
- Ваш список терминов и цветов сохраняется и автоматически применяется
  заново при каждом посещении страницы или перезапуске браузера.
- Палитра для дальтоников доступна одним кликом во всплывающем окне.
- Сохраняйте несколько списков терминов с названиями (до 10) и переключайтесь между ними во всплывающем окне.

**Навигация с клавиатуры в приоритете**
- Переходите к следующему/предыдущему совпадению и переключайтесь между
  терминами, не касаясь мыши: Alt+Shift+Вверх/Вниз/Влево/Вправо
  (Cmd+Shift+... на Mac).
- Постоянная обводка отмечает текущее совпадение, чтобы вы не теряли
  своё место при просмотре длинной страницы.
- В Edge эти сочетания клавиш может потребоваться назначить вручную при
  первом использовании: перейдите на `edge://extensions/shortcuts` и
  настройте их там, если они не работают по умолчанию.

**Расширенный поиск**
- Подстановочные знаки (`*`, `?`) и регулярные выражения (`/шаблон/`).
- Диакритические знаки всегда игнорируются, отключить это нельзя. Учитываются также буквы ß, ł, đ и œ.
- Щёлкните правой кнопкой по выделенному слову и выберите «Добавить выделение в HueMark».

**Скопировать совпадения**
- Первый щелчок собирает совпадения, второй копирует их вместе с окружающим текстом. Вставляются как форматированный или обычный текст.
- Выберите «Фрагмент», «Предложение» или «Абзац», чтобы задать объём текста вокруг каждого совпадения.
- Стили ссылок: APA, MLA, Chicago, Harvard, IEEE, Vancouver, AMA или Plain.
- Цитаты с веб-страниц получают ссылки на текст, цитаты из PDF — номера страниц.
- Ничто не покидает ваше устройство. Результат хранится в сессионном хранилище браузера, пока вы его не скопируете.

**Юридические ссылки**
- Формат Legal с 22 вариантами юрисдикции, например Bluebook (США), OSCOLA (Великобритания) и McGill (Канада).
- Проверено на реальных страницах судебных решений для нескольких юрисдикций; остальные проверены меньше.
- Юридические форматы основаны на распространённой практике и не сверены с официальными руководствами по стилю.
- То, что не распознано как судебное решение, получает ссылку на веб-страницу.

**Конфиденциальность**
- Никакого сбора данных, аналитики и внешних серверов. Ваши поисковые запросы, сохранённые списки и цвета хранятся локально на вашем устройстве (`chrome.storage.local`) и никогда его не покидают.
- HueMark выключен во всех вкладках, пока вы не включите его для этой вкладки. Он запоминает, какие вкладки включены, только в виде списка номеров вкладок в памяти: адреса сайтов, заголовки и история не сохраняются.
- «Скопировать совпадения» читает текст страницы только когда вы этим пользуетесь, и записывает в буфер обмена только после нажатия «Скопировать».

**Полезно знать**
- HueMark включается для каждой вкладки отдельно. Новые вкладки изначально выключены: откройте всплывающее окно и включите «Включено для этой вкладки» (или используйте кнопку ⏻ на плавающей панели). После обновления с предыдущей версии включите его снова в нужных вкладках.
- Работает на любой странице, текст которой находится в настоящем DOM —
  подавляющее большинство веба.
- Приложения, отрисовываемые на canvas (Google Docs, Google Sheets), не
  может подсвечивать ни одно расширение браузера, включая HueMark — их
  содержимое рисуется на canvas, а не как настоящий текст DOM.
- В некоторых формулах Википедии скопированные подстрочные и надстрочные знаки склеиваются (например, «CO 2carbondioxide»).

**Search terms:**
- подсветка (highlight)
- подсветка (highlight) текста (of text)
- многоцветная (multi-color) подсветка (highlight)
- подсветка (highlight) ключевых (key) слов (words)
- подсветка (highlight) PDF (PDF)
- поиск (search) и (and) подсветка (highlight)
- подсветка (highlight) слов (of words)

---

## Chinese - Simplified (zh_CN)

**Short description**

在任意网页和 PDF 中，以不同颜色高亮多个词语或短语 —— 支持键盘在匹配项
之间导航。

**Full description**

HueMark 让你可以同时高亮多个搜索词，每个词使用自己的颜色，从而在任意
页面上直观地追踪多条信息线索。

**随处高亮**
- 静态页面 —— 加载后立即高亮。
- 动态页面和单页应用 —— 实时监视器会在新内容出现时立即捕获（无限滚动、
  聊天应用、实时信息流），因此高亮永远不会过时。
- PDF —— 支持在线（http/https）和本地 PDF 文件，通过内置的 PDF.js
  查看器实现。
- iframe 和 shadow DOM —— 嵌入框架和 shadow root 中的匹配项也会被高亮，滚动条上还会标出每个匹配项的位置。

**设置保持不变**
- 你的词语列表和颜色会被保存，并在你每次重新访问页面或重启浏览器时
  自动重新应用。
- 色盲友好调色板只需在弹出窗口中点击一下即可切换。
- 可以为多组词语列表命名保存（最多 10 组），并在弹出窗口中切换。

**键盘优先导航**
- 无需使用鼠标即可跳转到下一个/上一个匹配项并在词语之间切换：
  Alt+Shift+上/下/左/右（Mac 上为 Cmd+Shift+...）。
- 持续显示的轮廓会标记你当前的匹配项，让你在浏览长页面时不会迷失
  位置。
- 在 Edge 中，这些快捷键可能需要在首次使用时手动分配：如果默认不
  生效，请访问 `edge://extensions/shortcuts` 进行设置。

**高级匹配**
- 支持通配符（`*`、`?`）和正则表达式（`/模式/`）。
- 始终忽略重音符号，无法关闭。也支持 ß、ł、đ、œ 等字母。
- 在网页上选中词语后右键点击，选择“将所选内容添加到 HueMark”即可添加为词语。

**复制匹配项**
- 点击一次收集匹配项，再点击一次即可连同周围文字一起复制。可粘贴为富文本或纯文本。
- 可选择“片段”“句子”或“段落”，决定每个匹配项周围包含多少文字。
- 引用样式：APA、MLA、Chicago、Harvard、IEEE、Vancouver、AMA 或 Plain。
- 网页引文会带有滚动到文本的链接；PDF 引文会带有页码。
- 内容不会离开您的设备。结果会保存在浏览器的会话存储中，直到您复制为止。

**法律引用**
- 提供包含 22 个法域选项的 Legal 格式，例如 Bluebook（美国）、OSCOLA（英国）和 McGill（加拿大）。
- 部分法域已在真实法院页面上验证；其余验证较少。
- 法律格式遵循常见做法，未对照官方格式指南核验。
- 未被识别为判例的内容会改用网页引用。

**隐私**
- 不收集数据，不进行分析，不使用外部服务器。你的搜索词和颜色仅保存在
  本地设备上（`chrome.storage.local`），绝不会离开设备。
- 在你于某个标签页中开启 HueMark 之前，它在每个标签页中都处于关闭状态。它只以内存列表的形式记住哪些标签页已开启，列表中仅有标签页编号：不会存储网站地址、标题或历史记录。
- 复制匹配项仅在您使用时读取页面文字，只有点击“复制”后才会写入剪贴板。

**须知**
- HueMark 按标签页开启。新标签页默认关闭：打开弹出窗口并开启“已在此标签页启用”（或使用浮动栏上的 ⏻ 按钮）。从旧版本更新后，请在需要的标签页中重新开启。
- 适用于文本存在于真实 DOM 中的任意页面 —— 这涵盖了网络上的绝大多数
  内容。
- 以 canvas 渲染的应用（如 Google Docs、Google Sheets）无法被任何浏
  览器扩展高亮，包括 HueMark —— 因为它们的内容是绘制在 canvas 上，而不是
  真实的 DOM 文本。
- 某些维基百科公式中，复制出的下标和上标会连在一起（例如“CO 2carbondioxide”）。

**Search terms:**
- 高亮 (highlight)
- 文本 (text) 高亮工具 (highlighter)
- 多色 (multi-color) 高亮 (highlight)
- 关键词 (keyword) 高亮工具 (highlighter)
- PDF (PDF) 高亮工具 (highlighter)
- 搜索 (search) 并 (and) 高亮 (highlight)
- 词语 (word) 高亮工具 (highlighter)

---

## Chinese - Traditional (zh_TW)

**Short description**

在任何網頁和 PDF 中，以不同顏色標示多個詞語或片語 —— 支援鍵盤在相符
項目間導覽。

**Full description**

HueMark 讓你可以同時標示多個搜尋詞，每個詞使用自己的顏色，讓你在任何
頁面上都能直觀地追蹤多條資訊脈絡。

**隨處標示**
- 靜態網頁 —— 載入後立即標示。
- 動態網頁與單頁應用程式 —— 即時監視器會在新內容出現時立即偵測（無限
  捲動、聊天應用程式、即時動態），因此標示永遠不會過時。
- PDF —— 支援線上（http/https）與本機 PDF 檔案，透過內建的 PDF.js
  檢視器實現。
- iframe 與 shadow DOM —— 嵌入框架與 shadow root 中的相符項目也會標示，捲軸上也會標出每個相符項目的位置。

**設定會保留**
- 你的詞語清單與顏色會被儲存，並在你每次重新造訪頁面或重新開啟瀏覽器
  時自動重新套用。
- 色盲友善調色盤只需在彈出視窗中點擊一下即可切換。
- 可為多組詞語清單命名儲存（最多 10 組），並在彈出視窗中切換。

**鍵盤優先導覽**
- 不需使用滑鼠即可跳到下一個/上一個相符項目並在詞語間切換：
  Alt+Shift+上/下/左/右（Mac 上為 Cmd+Shift+...）。
- 持續顯示的外框會標示你目前的相符項目，讓你在瀏覽長頁面時不會迷失
  位置。
- 在 Edge 中，這些快捷鍵可能需要在首次使用時手動指定：如果預設無法
  運作，請造訪 `edge://extensions/shortcuts` 進行設定。

**進階比對**
- 支援萬用字元（`*`、`?`）與正規表示式（`/模式/`）。
- 一律忽略重音符號，無法關閉。ß、ł、đ、œ 等字母也會處理。
- 在網頁上選取詞語後按右鍵，選擇「將所選內容加入 HueMark」即可新增為詞語。

**複製符合項目**
- 按一次收集相符項目，再按一次即可連同周圍文字一起複製。可貼上為格式化文字或純文字。
- 可選擇「片段」「句子」或「段落」，決定每個相符項目周圍包含多少文字。
- 引用樣式：APA、MLA、Chicago、Harvard、IEEE、Vancouver、AMA 或 Plain。
- 網頁引文會附上捲動至文字的連結；PDF 引文會附上頁碼。
- 內容不會離開您的裝置。結果會保存在瀏覽器的工作階段儲存空間中，直到您複製為止。

**法律引用**
- 提供含 22 個法域選項的 Legal 格式，例如 Bluebook（美國）、OSCOLA（英國）與 McGill（加拿大）。
- 部分法域已在真實法院頁面上驗證；其餘驗證較少。
- 法律格式遵循常見做法，未與官方格式指南比對。
- 未被辨識為判決的內容會改用網頁引用。

**隱私**
- 不收集資料、不進行分析、不使用外部伺服器。你的搜尋詞和顏色僅儲存在
  本機裝置上（`chrome.storage.local`），絕不會離開裝置。
- 在你於某個分頁中開啟 HueMark 之前，它在每個分頁中都處於關閉狀態。它只以記憶體清單的形式記住哪些分頁已開啟，清單中僅有分頁編號：不會儲存網站網址、標題或瀏覽記錄。
- 您的搜尋詞、已儲存的清單與顏色僅儲存在本機裝置上。
- 複製符合項目僅在您使用時讀取頁面文字，且只有按下「複製」後才會寫入剪貼簿。

**須知**
- HueMark 依分頁開啟。新分頁預設為關閉：開啟彈出視窗並啟用「已在此分頁啟用」（或使用浮動列上的 ⏻ 按鈕）。從舊版更新後，請在需要的分頁中重新開啟。
- 適用於文字存在於真實 DOM 中的任何網頁 —— 這涵蓋了網路上的絕大多數
  內容。
- 以 canvas 繪製的應用程式（如 Google Docs、Google Sheets）無法被任何
  瀏覽器擴充功能標示，包括 HueMark —— 因為它們的內容是繪製在 canvas
  上，而非真實的 DOM 文字。
- 部分維基百科公式中，複製出的下標與上標會黏在一起（例如「CO 2carbondioxide」）。

**Search terms:**
- 標示 (highlight)
- 文字 (text) 螢光筆 (highlighter)
- 多色 (multi-color) 標示 (highlight)
- 關鍵字 (keyword) 螢光筆 (highlighter)
- PDF (PDF) 螢光筆 (highlighter)
- 搜尋 (search) 並 (and) 標示 (highlight)
- 詞語 (word) 螢光筆 (highlighter)

---

## How to apply

For each language in Partner Center's Store listings tab:
1. Add the language
2. Paste the matching short description, full description, and search
   terms from this file
3. Screenshots/promo assets can be reused as-is (no localized text
   baked into them) — only the popup UI shown in the screenshots is
   already localized via `_locales/`, if you want to re-capture screenshots
   per-language later that's a separate, lower-priority pass

**All 12 translated languages** (plus English in `store-listing.md`, 13 locales in total)
have short description, full description, and search terms drafted, using the
same vocabulary as each language's in-product UI strings
(`_locales/<code>/messages.json`) for consistency.
These are AI-drafted translations, not reviewed by a native speaker —
worth a quick sanity check (or a native speaker's once-over) before
publishing, especially for Arabic and Hindi where I have less confidence
in idiomatic phrasing. The additions dated 2026-11-01 (saved lists, Copy
matches, Legal citations, matching, iframes/shadow DOM, privacy) follow the
same rule: AI-drafted, not native-reviewed.

**Search term format:** each entry shows the term as a user would type it,
with individual words broken out and glossed in parentheses immediately
next to that word, e.g. `resaltador (highlighter) de (of) texto (text)` —
so you can identify which part of a multi-word term means what without
needing the whole phrase translated separately. Single-word terms (and
German compounds, which don't split like phrases) are glossed as one unit.
