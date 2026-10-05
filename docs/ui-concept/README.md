# SmartReceipts — UI Concept

Export aus Claude Design. Referenz für jede Frontend-Arbeit: erst hier nachsehen,
bevor ein Screen von Hand gebaut wird.

## Dateien

| Datei | Zweck |
|---|---|
| `SmartReceipts UI Spec Board.html` | Aktuelles Board (v2, Stand 2026-10-05): Logo, Landing-Page, Phase-3-App-Screens. Single-File-Bundle — **im Browser öffnen**. |
| `SmartReceipts UI Spec Board v1.html` | Erstes Board (2026-09) mit den 10 Ursprungs-Screens. Für die v1-Screens unten. |
| `screens/*.html` | Aus den Bundles entpackt. Lesbares HTML — Quelle für Layout, Copy und Zustände. Rendern **nicht** standalone (`./support.js` und der DS-Bundle existieren nur im Bundle). v2-Dateien nutzen die DS-Komponenten direkt (`component-from-global-scope="SmartReceipts.Button"` usw.), ihre Zustände stehen in `data-props`. |

Beim Re-Export: Bundle ersetzen, dann `screens/` neu entpacken (Manifest-Zeile +
gzip/base64-Blob-Zeile im Bundle; `.dc.html`-Einträge sind die Screens, die
Landing-Page ist ein verschachteltes Bundle mit eigenem Manifest) und diese Datei nachziehen.

## Stand: Design vs. Code (2026-10-05)

| Bereich | Design | Code |
|---|---|---|
| Logo | v2 01, final | nicht gebaut — überall noch die `Invoice01Icon`-Kachel, Next-Default-`favicon.ico` |
| Landing-Page | v2 02, freigegeben | nicht gebaut, keine öffentliche Route (siehe [Entscheidungen](#entscheidungen-zu-v2-2026-10-05)) |
| Belegliste mit Filtern, Monatsgruppen | v2 03, im Review | Suche nur Händler; Zeitraum + Sortierung, keine URL-Parameter |
| Mobile Bottom-Nav | v2 03, im Review | Sidebar als Offcanvas-Sheet |
| Registrierung mit Inline-Validierung | v2 03, im Review | Fehler nur vom Server, oben als Alert |
| Dashboard | v2-Datei = gebauter Stand | gebaut |
| Upload-/Bearbeiten-Dialog | v2 `Screen-ReceiptForm` = gebauter Stand | gebaut |
| Login, Detail, Löschen, Settings | v1 | gebaut |

### Was v2 an schon gebauten Screens ändert
- **Logo-Mark statt Invoice-Kachel**: Sidebar-Header (`app-sidebar.tsx`) und
  Login-Karte (`login/page.tsx`). `Invoice01Icon` bleibt als Nav-Icon „Receipts" und im
  Empty-State der Liste — das Board ersetzt nur die Marken-Kachel.
- **Bottom-Nav unter `md`** betrifft jede App-Seite (Dashboard, Settings, Liste), nicht
  nur die Liste: `app-shell.tsx` blendet Sidebar und `SidebarTrigger` unten aus, Konto
  (Theme, Sign out) wandert in ein Avatar-Menü in der Top-Bar.
- **Login-Seite**: Tab „Create account" bekommt die Phase-3-Validierung und soll per
  `?tab=register` direkt öffnen (Ziel der Landing-CTAs).
- **Favicon/Meta**: `favicon.svg`, `apple-touch-icon.png` (180), `og-image.png`
  (1200×630) und der Meta-Block aus Board 2c. In `frontend/public/` liegen nur die
  ungenutzten Next-Scaffolding-SVGs.

## v2 — aktuelles Board

### 01 Logo — `screens/Logo-Mark.html` (final)
Richtung **A** („Torn Edge": Bon mit Zackenrand, Knock-out-Zeilen) überall —
Favicon 16/32/180, Sidebar-Lockup (24 px Mark + „SmartReceipts" Inter 600) ersetzt die
Invoice-Icon-Kachel. Landing-Hero nutzt Bs Thermobon-Optik mit A-Mark. Nur Tokens.
SVG-Dateien stecken inline in `Logo-Mark.html` (Props `dir`, `v`, `tone`, `size`).

### 02 Landing-Page — `screens/Landing-Page.html` (2a freigegeben)
Öffentliche Seite, mobile-first, EN/DE (informelles „du"), hell/dunkel. Header,
Hero, „So funktioniert's", fünf Features, Privacy, Produktvorschau (Laptop mit
`Screen-Dashboard`, Handy mit `Screen-ReceiptForm`), FAQ, CTA-Band, Footer
(Impressum/Datenschutz verlinkt, Seiten selbst out of scope). Keine Zahlen,
Testimonials, Preise. Meta-Block + og:image 1200×630 stehen im Board (2c).
Abweichungen laut Board: 44-px-Touch-Targets unter 640 px (vorgeschlagen:
Button-Variante `size="touch"`), Display-Größen 36–58 px, FAQ als natives
`details/summary` (kein Accordion im DS), CTA-Band auf `--primary`.

### 03 Phase 3 — App-Screens (offen zum Review)
- **`Screen-ReceiptsList`** (`chrome` desktop/mobile, `state` default/filtered/popover/search/nomatch/sheet) —
  löst `Screen-ReceiptsDesktop`/`-Mobile` (v1) ab. Suche über Händler, Positionen und
  Notizen; Zeitraum inkl. „Custom range…" (DatePicker); Betrag min/max; Dateityp
  (Fotos/PDFs); aktive Filter als Chips + „Clear all"; Monatsgruppen mit Summe; Filter
  per `replaceState` in der URL. Mobile: Bottom-Nav (Dashboard, Receipts, Upload,
  Settings) ersetzt unter `md` den Sidebar-Trigger, Filter im Bottom-Sheet, Tabs statt
  ToggleGroup.
- **`Screen-Register`** (`state` empty/typing/invalid/toolong/taken/loading/generic, `mobile`) —
  Inline-Validierung für „Create account": Passwort-Hinweis vor dem Tippen, E-Mail
  on blur, 72-Byte-Limit clientseitig, 409 am E-Mail-Feld mit „Log in instead".
  Mindestlänge 8: entschieden, siehe [Entscheidungen](#entscheidungen-zu-v2-2026-10-05) Nr. 4.
- Die neuen EN/DE-Strings, Verhalten und Abweichungen listet das Board im Review-Block von 03.

### Weitere v2-Dateien
- `Screen-Dashboard` — ersetzt die v1-Datei; DS-Version des gebauten Dashboards (`chrome`, `state` filled/empty/loading/error).
- `Screen-ReceiptForm` — DS-Version des gebauten Upload-Dialogs (`state` empty/scanning/review/lowquality/pdf/edit), im Board nur als Landing-Vorschau.

## Entscheidungen zu v2 (2026-10-05)

Vom Repo-Owner entschieden, noch nicht gebaut. Beim Bau wandert jede Entscheidung in
die Regel ihres Bereichs (`.claude/rules/`), dann hier streichen.

1. **Landing auf `/`, Belegliste nach `/receipts`.** Sidebar-Links, Dashboard-Links
   (`/?receipt=` → `/receipts?receipt=`) und Redirects nach Login ziehen mit um.
   Verworfen: `/welcome` (schlechtere Einstiegs-URL), `/` je nach Login-Status (Status
   ist erst im Client bekannt, verhindert serverseitiges Rendern).
2. **Landing serverseitig gerendert**, eigene Route außerhalb von `(pages)`, ohne
   Auth-Guard, mit `metadata` (Meta-Block + og:image aus Board 2c). Sprache ohne Konto
   kommt schon heute aus Locale-Cookie bzw. `Accept-Language` (`src/i18n/request.ts`);
   der EN/DE-Schalter setzt nur den Cookie.
3. **`/impressum` und `/datenschutz` als einfache Server-Seiten mit Platzhaltern.** Den
   Text liefert der Betreiber; die Landing geht erst live, wenn er drin ist.
4. **Passwort mindestens 8 Zeichen**, in `NewPassword` (Registrierung und
   Passwortwechsel). Login bleibt ungeprüft, ältere kurze Passwörter funktionieren weiter.
5. **Bottom-Nav statt Sidebar-Sheet unter `md`**, wie im Board (Dashboard, Receipts,
   Upload, Settings; Konto per Avatar-Menü in der Top-Bar). Ersetzt beim Bau die
   Shell-Regel in `.claude/rules/frontend/shell-auth.md`.
6. **Listenfilter in der URL** via `replaceState`, gleiches Muster wie `?receipt=` (beim
   Start lesen, danach nur schreiben). Filtern bleibt clientseitig. Ersetzt beim Bau
   „keine Query-Params" in `.claude/rules/frontend/receipts-list.md`.
7. **`size="touch"`-Variante** (44 px unter 640 px) in `button.tsx` und `input.tsx`, nicht
   als Inline-Klassen. Wie `Alert variant="warning"` nach jedem shadcn-Regenerieren
   wieder ergänzen.
8. **FAQ als natives `details/summary`**, kein Accordion.
9. **Logo-SVGs aus `screens/Logo-Mark.html` übernehmen** (Richtung A, alle Größen),
   kein separater Export. Den Hero-Bon mit Pfaden statt Live-Text beim Landing-Bau
   erzeugen. `favicon.ico` und die ungenutzten Next-SVGs in `public/` ersetzen bzw. löschen.

## Design-Vorgaben des Exports

- Nur shadcn/ui-Patterns, keine eigenen Widgets für etwas, das ein Primitive abdeckt
- Nur die Tokens aus `frontend/src/app/globals.css` (neutrale Grautöne für Flächen und Text, Lila als Akzent; hell + dunkel).
  Die Mockups nutzen durchgehend `var(--background)`, `--card`, `--popover`,
  `--muted-foreground`, `--border`, `--destructive` — kein hartkodiertes Hex
- Schriften: Inter (Sans) + Geist Mono (Beträge, Datumsangaben, IDs) — beide bereits
  in `frontend/src/app/layout.tsx` geladen
- Custom Tailwind nur für Layout (Flex/Grid, Spacing)
- Mobile-first: Upload passiert am Handy, Desktop ist der Analyse-Kontext

## v1 — Ursprungs-Screens und ihre shadcn-Komponenten

Stand des ersten Boards (`SmartReceipts UI Spec Board v1.html`). Wo v2 eine Datei
ersetzt oder ablöst, steht es dabei.

`*` = noch nicht in `frontend/src/components/ui/`, muss per
`npx shadcn@latest add <name>` dazu.

### `Screen-Auth` — Login / Registrierung
Tabs („Log in" / „Create account"), Card, Label, InputGroup (Mail-/Schloss-Icon im
Feld, Passwort-Auge als Suffix), Input, Button, Spinner (Submit), Alert
(`role="alert"`, „Invalid email or password"), Empty (Erfolgszustand „Signed in →
Redirecting…"). Theme-Toggle als Text-Button im Footer.
→ vollständig mit vorhandenen Primitives baubar.

### `Screen-Dashboard` — Auswertungen (gebaut; Datei jetzt v2)
Sidebar, Avatar, DropdownMenu (Account), Card (3 KPI-Tiles: Monatsausgaben,
Durchschnittsbon, häufigster Händler), Tabs (Monthly / Quarterly), Chart (Spend
per month, Recharts), Progress (Top-Merchant-Balken), Table (Most-bought
products), Separator, Badge, Select (Zeitraum „Last 12 months"). Mobile: Bottom-Nav
als eigenes Layout + Sheet für das Menü.
Der Mobile-Bottom-Nav des Mockups ist nicht gebaut; die Sidebar der Shell reicht.
Siehe `.claude/rules/dashboard.md`.

### `Screen-ReceiptsToday` — Liste im heutigen Umfang
Card, InputGroup (Suche), Select (Zeitraum, Sortierung), Button („Upload receipt"),
Table, DropdownMenu (Row-Actions), Avatar, Skeleton (Ladezustand), Empty („No
receipts yet" + „Upload your first receipt").
→ am nächsten am aktuellen Stand; vollständig mit vorhandenen Primitives baubar.

### `Screen-ReceiptsDesktop` — Liste im Zielzustand (abgelöst durch v2 `Screen-ReceiptsList`)
Sidebar, Breadcrumb*, InputGroup (Suche), Popover + Calendar (Datumsbereich),
Popover (Betragsbereich), Select (Sortierung), Badge (PDF-Marker in der ersten
Spalte), Table, Pagination*, Alert (Info-Callout zu Filtern), DropdownMenu, Button.
Filter sollen laut Callout in der URL stehen (teilbar, reload-fest).

### `Screen-ReceiptsMobile` — Liste am Handy (abgelöst durch v2 `Screen-ReceiptsList`)
Sheet (Filter-Drawer von unten **und** Navigations-Drawer von links), Badge
(aktive Filter als Chips), ToggleGroup* (Month / Quarter / Year / Custom), Input,
Label, Button, Separator, DropdownMenu. Bottom-Nav + Gruppenkopf („September 2026 ·
248.55 EUR") als eigenes Layout.

### `Screen-UploadInline` — Upload-Dialog (Weiterentwicklung des heutigen)
Dialog, Label, Input, Select (Currency), Textarea (Notes), Button, Spinner,
Badge („Suggested" / „Confirmed" pro Feld), Progress („Reading your receipt… 2 of
3"), Alert (drei Varianten: Scan läuft, „2 fields suggested from the scan", „Nothing
readable in this scan" + Retry).
Kernidee, die zur bestehenden Implementierung passt: Vorschläge überschreiben nie,
was der Nutzer selbst getippt hat („You can start typing — anything you fill in
yourself is never overwritten").

### `Screen-UploadReview` — Upload-Dialog, zweispaltig
Dialog (breit: Vorschau links, Felder rechts), Alert, Badge, Progress, Skeleton
(Felder während des Scans), Input, Label, Select, Textarea, Button, Spinner.
Enthält den PDF-Zweig: „1 page · 84 KB · text layer found, no OCR needed" — der
PDF-Upload ist gebaut, dieser PDF-spezifische Review-Text noch nicht (siehe
`.claude/rules/frontend/receipt-dialog.md`).

### `Screen-Detail` — Beleg-Detailansicht
Dialog, Badge (Bild/PDF), Button, DropdownMenu, Separator, Card, Table
(Line-Items: Description / Qty / Unit / Total). PDF-Variante zeigt statt der
Bildvorschau eine Datei-Kachel mit „Open PDF" / „Download". Gebaut ist stattdessen
ein eingebetteter PDF-Viewer plus „Download"; das Bild/PDF-Badge fehlt noch (siehe
`.claude/rules/frontend/receipt-dialog.md`).

### `Screen-Delete` — Löschbestätigung
AlertDialog, Button (destructive), Spinner, plus eine kleine Beleg-Vorschauzeile im
Dialog (Thumbnail, Händler, „2026-09-14 · 42,18 EUR").
→ vollständig mit vorhandenen Primitives baubar.

### `Screen-Settings` — Kontoeinstellungen (gebaut)
Sidebar, Card (Abschnitte Appearance / Amounts / Account), ToggleGroup* (Theme
Light/Dark/System, Zahlenformat `1.234,56` vs `1,234.56`), Select (Sprache,
Default-Währung), Separator, Button, Alert, Label.
Deckt exakt die vier Settings ab (Theme, Sprache, Zahlenformat,
Default-Währung) und stellt klar: „These settings live on your account, not in this
browser."

## Sammel-Liste der fehlenden Primitives

```
npx shadcn@latest add toggle-group accordion
```

`toggle-group` war für v1 vorgesehen; v2 nutzt stattdessen Tabs. `accordion` schlägt
das Board für das Landing-FAQ vor (bis dahin `details/summary`). `breadcrumb` und
`pagination` brauchte nur das abgelöste `Screen-ReceiptsDesktop`.

Nur das dazunehmen, was der gerade gebaute Screen wirklich braucht — jedes Primitive
zieht Code und teils Dependencies nach.
