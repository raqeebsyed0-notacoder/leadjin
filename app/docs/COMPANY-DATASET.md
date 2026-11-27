# LeadJin Company Dataset — Retrieval Contract

## What this dataset is

`/home/euphoria/euphoria-v2/work/leadjin/intelligence/` is the authoritative
company-intelligence set for LeadJin. It holds the canonical deduplicated
company records (`canonical/companies.jsonl`, **6,701 records**), the Jin
retrieval index (`exports/jin-retrieval.jsonl`), the Laya decision export
(`exports/laya-decisions.jsonl`, **190 rows**), the model-style training
splits (`training/`), and the licence coverage (`coverage/`). The app had
**zero** references to it; `intelligenceHub.ts` is the separate SQLite
pipeline and is out of scope for this node. This node wires the JSONL set
to the product behind a retrieval-only API.

## Contents and measured counts

| Item | File | Rows |
|---|---|---|
| Canonical companies | `canonical/companies.jsonl` | 6,701 |
| Jin retrieval index | `exports/jin-retrieval.jsonl` | 6,701 |
| Laya decision export | `exports/laya-decisions.jsonl` | 190 |
| Training (train) | `training/train.jsonl` | 127 |
| Training (dev) | `training/heldout.jsonl` | 39 |
| Training (test) | `training/classify.jsonl` | 24 |

## Licence split

Every canonical record is tagged by its reuse clearance. The tag is derived
from the `sources` array and the `reuse_cleared` flag of the matching row in
`exports/jin-retrieval.jsonl` (joined on `company_id`):

| Licence tier | Source profile | Rows | Default-visible? |
|---|---|---|---|
| `cc0` | GLEIF + Wikidata only | 6,520 | **Yes** |
| `dbpedia-cc-by-sa` | DBpedia (attribution-bound CC-BY-SA) | 48 | No, unless `includeRestricted:true` |
| `research-only` | Directory sources with no reuse grant | 133 | No, unless `includeRestricted:true` |

- **`cc0` (6,520)** — GLEIF + Wikidata source records. Cleared for reuse.
- **`dbpedia-cc-by-sa` (48)** — attribution-bound. Reuse requires attribution;
  these records are *not* cleared by default and must never appear as cleared
  intelligence.
- **`research-only` (133)** — directory sources (e.g. Saudidir, FindSaudi,
  ListInSaudi, Gludo, Business Yellowpages) that state no reuse grant. They
  are **research-only**: exempt from collection, but never reusable or
  trainable.

**Total: 6,520 + 48 + 133 = 6,701** (canonical records).

## Retrieval contract

`searchCompanies({ query, sector, city, limit, includeRestricted })`
returns cleared records only by default.

Each hit is:

```ts
{ cr, name, sector, city, licence, retrieval_text?, score? }
```

- `cr` — `company_id` (canonical identity).
- `licence` — one of `cc0`, `research-only`, `dbpedia-cc-by-sa`.
- `retrieval_text` — flattened index text (name, categories, city, website,
  activities, products/services) used for the query match.
- `score` — relevance weight: name match +3, sector/city/industry +2, text
  match +1 per term.

By default the returned set is the **6,520 CC0 records only**. Passing
`includeRestricted:true` additionally returns the 48 `dbpedia-cc-by-sa` and
133 `research-only` records, each carrying its `licence` label so they are
never presented as cleared intelligence.

`searchCompanies` never throws: if the dataset directory or a file is missing
it returns an empty `hits` list with a typed `reason`.

## Decision contract

`datasetStats()` returns the measured counts (computed from files, not a
constant):

```ts
{
  canonical_records, cleared, restricted,
  retrieval_rows, decisions,
  training: { train, dev, test }
}
```

- `cleared` = 6,568 (all non-research-only records).
- `restricted` = 133.
- `cleared + restricted` **must equal** `canonical_records` (6,701).

`companyDataset.ts` exposes `searchCompanies`, `getCompany(idOrCr, { includeRestricted })`
and `datasetStats()`. `getCompany` returns a cleared record by default and a
restricted record only when `includeRestricted:true` is passed explicitly.

## How Jin is meant to use it

- Jin **retrieves** from this dataset only. It never writes, mutates, or
  trains on it.
- Jin queries `GET /api/dataset/search` (auth-gated) for cleared
  intelligence to feed its retrieval/selection steps.
- Jin **must not** train on `research-only` or `dbpedia-cc-by-sa` records.
  Restricted records are not cleared intelligence.

## Explicit rule

> Restricted records (`research-only` and `dbpedia-cc-by-sa`) are **never**
> returned as cleared intelligence and **never** used for training without
> written authorisation from the Founder. When they are surfaced (via the
> `includeRestricted`/explicit-flag paths) they carry their licence label
> (`licence:'research-only'`, `licence:'dbpedia-cc-by-sa'`).

## Routing

The dataset router is mounted at `/api/dataset` next to the existing routers:

```ts
app.use('/api/dataset', createDatasetRouter({ getUserFromToken: getUserFromTokenCached }));
```

Routes:

- `GET /api/dataset/search?q=&sector=&city=&limit=` — auth required, cleared
  records only.
- `GET /api/dataset/company/:id` — auth required, cleared record only by
  default.

No write endpoints.
