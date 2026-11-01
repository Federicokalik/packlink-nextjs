<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Federicokalik/packlink-nextjs@main/assets/logo.svg" alt="packlink-nextjs" width="160">
</p>

<h1 align="center">packlink-nextjs</h1>

<p align="center">
  <strong>Integrazione non ufficiale di Packlink PRO per Next.js.</strong><br>
  Quotazioni live, punti di ritiro, etichette e sincronizzazione pianificata degli stati. TypeScript, nessuna dipendenza a runtime.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/packlink-nextjs"><img alt="Versione npm" src="https://img.shields.io/npm/v/packlink-nextjs"></a>
  <img alt="Stato: beta" src="https://img.shields.io/badge/stato-beta-yellow">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6">
  <img alt="Next.js App Router" src="https://img.shields.io/badge/Next.js-App%20Router-black">
  <img alt="Node.js 20 o successivo" src="https://img.shields.io/badge/node-%E2%89%A5%2020-339933">
  <img alt="Licenza: MIT" src="https://img.shields.io/badge/licenza-MIT-blue">
</p>

[Packlink PRO](https://pro.packlink.com) non ha un SDK ufficiale per JavaScript o Next.js. Questo pacchetto è
stato estratto da un e-commerce in produzione (Next.js 16, App Router) e reso
indipendente dal suo database, dal catalogo e dall'hosting.

> **In produzione.** L'integrazione è implementata e testata da due mesi
> (da agosto 2026) su [creattivamente.shop](https://creattivamente.shop), con
> ordini reali: quotazioni live al checkout, punti di ritiro, etichette create
> dal gestionale e sincronizzazione pianificata degli stati.

[Read in English](./README.md) — la versione inglese è quella di riferimento
ed è più dettagliata sulle API.

> Non affiliato né approvato da Packlink. "Packlink" è un marchio del rispettivo
> titolare, citato solo per indicare il servizio a cui il pacchetto si collega.

- **Client tipizzato** per l'API Packlink PRO: servizi, punti di ritiro, CAP, creazione / lettura / annullo spedizioni, etichette. Nessuna dipendenza a runtime.
- **Checkout che non si rompe mai**: gratis sopra soglia → quota live (netto + IVA + margine) → tariffa flat se Packlink è lento o giù.
- **Dal carrello a un collo**: peso e ingombro dai dati prodotto, con un modello di imballo che sbaglia dal lato giusto.
- **Punti di ritiro**: route handler, hook React e mappa Leaflet opzionale.
- **CAP**: verifica del CAP con città e provincia prima della quota, oppure autocompletamento su CAP o città.
- **Sync degli stati con qualsiasi scheduler**: motore indipendente dallo storage e route protetta, con template pronti per Cloudflare Workers Cron, Vercel Cron, GitHub Actions e crontab.

## Installazione

```bash
npm install packlink-nextjs
# oppure
pnpm add packlink-nextjs
yarn add packlink-nextjs
bun add packlink-nextjs
```

Tutti installano dal registry npm.

| Import                  | Contenuto                                          | Peer dependency        |
| ----------------------- | -------------------------------------------------- | ---------------------- |
| `packlink-nextjs`       | Client, checkout, calcolo del collo, sync stati    | —                      |
| `packlink-nextjs/next`  | Factory dei route handler (`Request` → `Response`) | —                      |
| `packlink-nextjs/react` | Hook `useDropoffPoints`                            | `react` ≥ 18           |
| `packlink-nextjs/map`   | `<DropoffPointMap>`                                | `react`, `leaflet` 1.9 |

Serve Node.js 20 o successivo.

## Avvio rapido

L'esempio completo, verificato dal typecheck, è in
[`examples/nextjs-app-router`](./examples/nextjs-app-router).

### 1. Configurazione

```bash
# .env.local — solo server, mai NEXT_PUBLIC_
PACKLINK_API_KEY=la-tua-api-key-packlink-pro
PACKLINK_FROM_ZIP=03100
PACKLINK_FROM_COUNTRY=IT
# L'indirizzo completo del mittente serve solo per creare spedizioni:
PACKLINK_FROM_NAME=Il tuo negozio
PACKLINK_FROM_STREET=Via Roma 1
PACKLINK_FROM_CITY=Frosinone
PACKLINK_FROM_PHONE=+39...
PACKLINK_FROM_EMAIL=ordini@example.com
```

```ts
// lib/packlink.ts
import "server-only";
import { createPacklinkClientFromEnv, type ShippingRules } from "packlink-nextjs";

export const packlink = createPacklinkClientFromEnv();

export const shippingRules: ShippingRules = {
  flatRateCents: 990, // se la quota live è spenta o non disponibile
  freeThresholdCents: 7900, // consegna gratuita da 79 €
  vatPct: 22, // i prezzi Packlink sono netti
  markupPct: 10, // il tuo margine
};
```

### 2. Opzioni di spedizione

Il browser manda le righe del carrello e la destinazione; prezzi, pesi e misure
si leggono **sempre** dal tuo catalogo, lato server.

```ts
// app/api/packlink/shipping-options/route.ts
import { createShippingOptionsRoute } from "packlink-nextjs/next";
import { packlink, shippingRules } from "@/lib/packlink";
import { loadCart } from "@/lib/cart";

export const dynamic = "force-dynamic";

export const { POST } = createShippingOptionsRoute({
  client: packlink,
  resolveCart: loadCart,
  rules: shippingRules,
  extraOptions: [{ id: "pickup", label: "Ritiro in negozio", amountCents: 0, kind: "custom" }],
});
```

> **Addebita quello che hai quotato.** Alla creazione dell'ordine richiama
> `resolveShippingOptions` lato server e cerca l'`id` scelto nella lista appena
> calcolata. Non fidarti mai di un importo rimandato dal browser.

### 3. Punti di ritiro

```ts
// app/api/packlink/dropoffs/route.ts
import { createDropoffsRoute } from "packlink-nextjs/next";
import { packlink } from "@/lib/packlink";

export const dynamic = "force-dynamic";
export const { GET } = createDropoffsRoute({ client: packlink });
```

```tsx
"use client";
import "leaflet/dist/leaflet.css";
import { useDropoffPoints } from "packlink-nextjs/react";
import { DropoffPointMap } from "packlink-nextjs/map";

const { points, selectedId, select } = useDropoffPoints({
  serviceId: option?.packlinkServiceId,
  zip,
  country,
  enabled: Boolean(option?.requiresDropoffPoint),
});

<DropoffPointMap points={points} selectedId={selectedId} onSelect={select} />;
```

Blocca il pagamento finché un'opzione con `requiresDropoffPoint` non ha un punto
scelto, e salva `selectedId` con l'ordine: serve per l'etichetta.

`requiresDropoffPoint` viene dal campo Packlink `delivery_to_parcelshop`. Da non
confondere con il flag `dropoff` (qui `senderDropoff`), che significa che è **il
negozio** a portare il pacco in un punto invece di farlo ritirare: il cliente lo
riceve comunque a casa.

### 4. CAP

```ts
// app/api/packlink/postal-codes/route.ts
import { createPostalCodesRoute } from "packlink-nextjs/next";
import { packlink } from "@/lib/packlink";

export const dynamic = "force-dynamic";
export const { GET } = createPostalCodesRoute({ client: packlink });
```

- `GET ?country=IT&zip=03100` → `{ valid, postalCodes }`: verifica il CAP prima
  della quota e compila città e provincia.
- `GET ?country=IT&q=frosi` → `{ postalCodes }`: autocompletamento su CAP o città.

Lato server: `client.lookupPostalCode({ country, zip })` e
`client.searchPostalCodes({ country, query })`. La ricerca gira in tutte le zone
postali del paese (penisola, isole…), con l'elenco delle zone in cache per 24 ore.
Se Packlink non risponde la route dà 502: meglio lasciar proseguire il cliente
che bloccare il checkout su una verifica.

## Creare le spedizioni

Creare una spedizione si paga, e **Packlink accetta volentieri il doppione**:
due click sono due etichette. Prima di chiamare `createShipment`, "prenota"
l'ordine nel database con un update condizionale (`SET packlink_reference =
'pending:<id>' WHERE id = ? AND packlink_reference IS NULL`) e fermati se non
ha toccato righe. Dopo un timeout (`code: "network"`) non si può sapere se la
spedizione esiste: lascia la prenotazione e controlla il pannello Packlink.

Inoltre:

- **ri-quota** con `listServices` subito prima di creare: la tariffa che paga il
  negozio è quella di oggi, e il servizio scelto dal cliente deve esistere ancora;
- **prima annulla, poi libera**: azzera l'ordine solo se `cancelShipment` è
  riuscito, o resta un'etichetta viva e pagata che nessuno sa di avere.

Lo schema completo è in
[`create-shipment.ts`](./examples/nextjs-app-router/lib/create-shipment.ts).

L'etichetta non fa parte della spedizione ed esiste solo dopo il pagamento su
Packlink: si legge con `getLabels(reference)` o
`getShipment(reference, { includeLabels: true })`. La sincronizzazione la
recupera da sola finché non è salvata.

## Sincronizzazione degli stati (cron)

Packlink dice dov'è un pacco solo se glielo chiedi. `syncShipments` interroga un
piccolo lotto di spedizioni aperte, salva le novità e chiama `onTransition`
quando il pacco passa da `pending` a `shipped`, `delivered` o `terminal`: è lì
che aggiorni l'ordine e mandi l'email al cliente.

```ts
// app/api/jobs/packlink-sync/route.ts
import { syncShipments } from "packlink-nextjs";
import { createSyncRoute } from "packlink-nextjs/next";
import { packlink } from "@/lib/packlink";
import { shipmentStore, onTransition } from "@/lib/shipment-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute({
  secret: process.env.PACKLINK_SYNC_CRON_SECRET,
  run: () => syncShipments({ client: packlink, store: shipmentStore, onTransition }),
});
```

Lo store è una piccola interfaccia sulle tue tabelle
([esempio SQL](./examples/nextjs-app-router/lib/shipment-store.ts)). Il motore
garantisce:

- **un lotto per esecuzione** (`limit`, default 20), dal meno aggiornato;
- **un errore non ferma il giro**: viene contato e riportato in `errors`;
- **transizioni almeno una volta**: `onTransition` gira prima del salvataggio; se
  fallisce non si salva niente e il giro dopo riprova. Rendila idempotente;
- **uno stato sconosciuto non muove mai un ordine**: gli stati Packlink sono
  testo libero e si classificano solo quelli non ambigui;
- **l'etichetta arriva da sola**: finché un record non ha `labelUrl`, ogni giro
  la richiede (`includeLabels: false` per disattivarlo).

Lo scheduler è a scelta: basta chiamare la route con
`Authorization: Bearer <segreto>`.

| Scheduler                                         | Template                                             |
| ------------------------------------------------- | ---------------------------------------------------- |
| Cloudflare Workers Cron Triggers                  | [`cron/cloudflare-worker`](./cron/cloudflare-worker) |
| Vercel Cron Jobs (GET + `CRON_SECRET`)            | [`cron/vercel`](./cron/vercel)                       |
| GitHub Actions                                    | [`cron/github-actions`](./cron/github-actions)       |
| crontab, Kubernetes, cron-job.org, script diretto | [`cron/generic`](./cron/generic)                     |

Ogni 15 minuti basta e avanza. Su Vercel Hobby i cron girano al massimo una
volta al giorno: lì conviene Cloudflare o GitHub Actions.

## Unità e convenzioni

- Pesi in **grammi**, misure in **millimetri**, importi in **centesimi interi**.
  La conversione in kg, cm ed euro avviene solo all'ultimo, verso Packlink.
- Un collo senza misure viene quotato come scatola **20 × 20 × 20 cm**: per
  questo il checkout usa la quota live solo se `combineParcel(...).complete` è
  vero. Un prodotto senza dati farebbe sembrare il collo più piccolo, e la
  differenza la fattura il corriere al negozio.
- `netCents` è il `base_price` di Packlink, IVA esclusa.

## Errori

Ogni metodo del client lancia un `PacklinkError` con un `code`:
`not_configured`, `invalid_input`, `http` (con `status` e `body`), `network`,
`invalid_response`. Usa `isPacklinkError(error)` invece di `instanceof`.

## Da dove vengono le forme dell'API

Nomi dei campi ed endpoint seguono due fonti:

1. **L'uso in produzione** su creattivamente.shop: quote, punti di ritiro,
   creazione e annullo spedizioni, sincronizzazione degli stati.
2. **Il modulo open source di Packlink**,
   [packlink-dev/ecommerce_module_core](https://github.com/packlink-dev/ecommerce_module_core)
   (la libreria comune ai plugin ufficiali WooCommerce, PrestaShop e Magento):
   il suo proxy HTTP e le risposte dell'API nelle fixture dei test.

CAP, `getLabels`, i numeri di tracking da `trackings` e il flag
`delivery_to_parcelshop` vengono solo dalla seconda fonte e non hanno ancora
girato in produzione. Se una risposta reale è diversa,
[apri una issue](https://github.com/federicokalik/packlink-nextjs/issues) con il
payload, senza dati personali.

Escluso di proposito: la **lista** delle spedizioni. Né il modulo ufficiale né
l'uso in produzione la chiamano, quindi non c'è un endpoint confermato.

## Confronto con packlink-js

[packlink-js](https://github.com/MwSpaceLLC/packlink-js) (MwSpace, Apache-2.0)
è l'altro client JavaScript non ufficiale per Packlink PRO. Alla versione 1.0.48
(ottobre 2026):

|                                                    | packlink-nextjs                                     | packlink-js                            |
| -------------------------------------------------- | --------------------------------------------------- | -------------------------------------- |
| Linguaggio                                         | TypeScript, ESM + CJS, con tipi                     | JavaScript (CommonJS), senza tipi      |
| Dipendenze a runtime                               | nessuna (Fetch API)                                 | `axios`, `qs`                          |
| Configurazione                                     | un client per istanza                               | una sola API key per tutto il processo |
| Errori                                             | lancia `PacklinkError` con `code`, `status`, `body` | li stampa e restituisce `{ error }`    |
| Timeout                                            | 6 s in lettura, 20 s in scrittura                   | nessuno impostato                      |
| Servizi / quote                                    | ✓ normalizzati, dal più economico, filtro corrieri  | ✓ risposta grezza                      |
| Collo senza misure                                 | 20 × 20 × 20 cm                                     | 5 × 5 × 5 cm (`Carrier.quote`)         |
| Punti di ritiro                                    | ✓ con route, hook React e mappa                     | —                                      |
| Crea / leggi / annulla spedizioni                  | ✓                                                   | ✓                                      |
| Etichette                                          | ✓                                                   | —                                      |
| Lista spedizioni                                   | — (vedi sopra)                                      | ✓ (`GET /shipments`)                   |
| CAP                                                | verifica esatta + ricerca per zona postale          | ricerca nel paese configurato          |
| Magazzini (indirizzi mittente salvati su Packlink) | — (il mittente viene dalla tua config)              | ✓ lista, crea, modifica, elimina       |
| Statistiche del pannello                           | —                                                   | ✓                                      |
| Checkout (soglia gratis, IVA, margine, ripiego)    | ✓                                                   | —                                      |
| Route handler Next.js                              | ✓                                                   | —                                      |
| Sync stati pianificata + template scheduler        | ✓                                                   | —                                      |
| Test                                               | ✓ vitest, CI su Node 20/22/24                       | nessuno nel repository                 |
| Licenza                                            | MIT                                                 | Apache-2.0                             |

Se ti servono gestione dei magazzini o statistiche del pannello, packlink-js le
ha già pronte; qui sono a una chiamata `client.request()`, senza tipi.

## Agenti AI

È il 2026, quindi sì: questo pacchetto è stato realizzato con l'assistenza di
agenti AI. Decisioni, revisione e responsabilità restano umane: il codice è
coperto da test (`fetch` simulato, mai l'API reale), verificato in CI a ogni
push, e gira in produzione su creattivamente.shop.

Usi un agente per integrare il pacchetto nella tua app o per lavorare su questo
repository? Indicagli [AGENTS.md](./AGENTS.md): entry point, regole da non
violare (API key solo lato server, ricalcolo del prezzo all'ordine, spedizioni a
pagamento) e comandi del repository. Il file è incluso anche nel pacchetto, in
`node_modules/packlink-nextjs/AGENTS.md`.

## Sviluppo

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Licenza

[MIT](./LICENSE)
