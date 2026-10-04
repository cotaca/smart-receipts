# SmartReceipts — UI Concept

Export aus Claude Design. Referenz für jede Frontend-Arbeit: erst hier nachsehen,
bevor ein Screen von Hand gebaut wird.

## Dateien

| Datei | Zweck |
|---|---|
| `SmartReceipts UI Spec Board.html` | Der gerenderte Export (Single-File-Bundle, React + Fonts inline). **Das ist die Datei zum Anschauen** — im Browser öffnen. |
| `screens/Screen-*.html` | Die 10 Einzel-Screens, aus dem Bundle entpackt. Lesbares HTML mit Inline-Styles — Quelle für Layout, Copy und Zustände. Rendern **nicht** standalone (referenzieren ein `./support.js`, das nur im Bundle existiert). |

Beim Re-Export: Bundle ersetzen, dann `screens/` neu entpacken (Manifest-Zeile +
gzip/base64-Blob-Zeile im Bundle) und diese Datei nachziehen.

## Design-Vorgaben des Exports

- Nur shadcn/ui-Patterns, keine eigenen Widgets für etwas, das ein Primitive abdeckt
- Nur die Tokens aus `frontend/src/app/globals.css` (Purple-Theme, hell + dunkel).
  Die Mockups nutzen durchgehend `var(--background)`, `--card`, `--popover`,
  `--muted-foreground`, `--border`, `--destructive` — kein hartkodiertes Hex
- Schriften: Inter (Sans) + Geist Mono (Beträge, Datumsangaben, IDs) — beide bereits
  in `frontend/src/app/layout.tsx` geladen
- Custom Tailwind nur für Layout (Flex/Grid, Spacing)
- Mobile-first: Upload passiert am Handy, Desktop ist der Analyse-Kontext

## Screens und ihre shadcn-Komponenten

`*` = noch nicht in `frontend/src/components/ui/`, muss per
`npx shadcn@latest add <name>` dazu.

### `Screen-Auth` — Login / Registrierung
Tabs („Log in" / „Create account"), Card, Label, InputGroup (Mail-/Schloss-Icon im
Feld, Passwort-Auge als Suffix), Input, Button, Spinner (Submit), Alert
(`role="alert"`, „Invalid email or password"), Empty (Erfolgszustand „Signed in →
Redirecting…"). Theme-Toggle als Text-Button im Footer.
→ vollständig mit vorhandenen Primitives baubar.

### `Screen-Dashboard` — Auswertungen (gebaut)
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

### `Screen-ReceiptsDesktop` — Liste im Zielzustand
Sidebar, Breadcrumb*, InputGroup (Suche), Popover + Calendar (Datumsbereich),
Popover (Betragsbereich), Select (Sortierung), Badge (PDF-Marker in der ersten
Spalte), Table, Pagination*, Alert (Info-Callout zu Filtern), DropdownMenu, Button.
Filter sollen laut Callout in der URL stehen (teilbar, reload-fest).

### `Screen-ReceiptsMobile` — Liste am Handy
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
npx shadcn@latest add breadcrumb pagination toggle-group
```

Nur das dazunehmen, was der gerade gebaute Screen wirklich braucht — jedes Primitive
zieht Code und teils Dependencies nach.
