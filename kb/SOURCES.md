# KB Legal Log — Servant Assistant (مساعد الخادم)

This file is the **mandatory legal log** for every text in `kb/`.
Rule: **no text enters `kb/` without a dated entry here stating its origin and why it is safe to redistribute.**

Last reviewed: 2026-09-09 (Phase 1 — sample dataset only).

---

## 1. Bible samples — `kb/bible/sample/*.json`

**Translation used:** Smith & Van Dyck Arabic Bible, first complete edition **1865**
(American Presbyterian Mission Press, Beirut — translators Eli Smith †1857 and Cornelius Van Alen Van Dyck).

**Status: PUBLIC DOMAIN (translation itself).**
- The 1865 translation long predates any copyright term; both translators died in the 19th century
  (Smith 1857, Van Dyck 1895).
- Corroboration: Digital Bible Society lng/ARB page lists the Van Dyck (ARBVDV, 1865) as a
  public-domain text; the Internet Archive item `svd_20220402` (Smith–Van Dyck scans) is marked
  public domain (accessed September 2026).

**Electronic text transcribed from (Phase 1 samples ONLY — 20 verses total):**
- Mirror: `https://github.com/thiagobodruk/bible` → `json/ar_svd.json` (file `ar_svd`,
  fetched 2026-09-09), an **unvocalized** transcription in the lineage of the older
  Unbound-Bible/CrossWire releases that were distributed as **Public Domain**
  (per the bible-discovery CrossWire-mirror record: *Distribution license: Public Domain*).
- Passages copied **verbatim, wording and punctuation preserved exactly**
  (only invisible Unicode directional marks U+200E were removed; see each file's `source.notes`):
  - `psalm-23.json` — Psalm 23:1–6 (6 verses).
  - `john-1.json` — John 1:1–14 (14 verses, marked `partial: true`).

**Explicitly NOT used — restricted edition (do not copy from it):**
- The current CrossWire `AraSVD` Sword module (v1.5+, vocalized text sourced from
  arabicbible.com / Arabic Bible Outreach Ministry) is licensed
  *"Copyrighted; Permission granted to distribute non-commercially in SWORD format"* and its
  `About` field states: *"Conversion to other formats is not permitted without express
  permission of the copyright holder."* (Read from `arasvd.conf`, Version 2.3, 2026-09-09.)
  Its vocalized text was **not** used. Its binary ztext files cannot be converted anyway.

**Before ANY full-corpus import (Phase 2+ gate):**
1. Re-verify edition identity, canonical coverage (66-book vs. Coptic canon + deuterocanon),
   and redistribution terms against a primary source (e.g. an 1865 print or a distributor
   with written PD confirmation such as eBible.org's terms for that text).
2. Never mix vocalized text from the restricted CrossWire/arabicbible.com edition.
3. Record the new verification in this log with date + URL before importing.

---

## 2. Hymns — `kb/hymns/sample/*.json`

**Policy: metadata + original explanation ONLY. No copied hymn text.**
- `epouro.json` (لحن إبؤورو): liturgical **facts only** — Arabic/Coptic title, transliterated
  title, occasions, feast, liturgical context, when-sung note in our own words, and an
  **original explanation** written for this project (2026-09-09).
- `textCoptic`, `textArabic`, `notation` are `null` with rights notes. Full hymn texts,
  translations, published explanations, musical notation, and recordings are **not**
  redistributable here: tasbeha.org republishing permission is ambiguous (community
  discussion c. 2019, no clear grant), and most printed/audio hymn resources are copyrighted.
- Hymn **facts** (which hymn is sung on which occasion) need review by a church cantor/
  servant before the dataset grows (`source.notes` flag on each file).

## 3. Lessons — `kb/lessons/sample/*.json`

- `lesson-ps23-kids-001.json`: **100% original** lesson written for this project (2026-09-09):
  story retelling in our own words, explanation, activities, questions, application.
- Only the cited memory verse (Psalm 23:1) is quoted, from the public-domain Van Dyck text above.
- No copied material from any published curriculum.

## 4. Synaxarium — `kb/synaxarium/sample/*.json`

- `tout-01.json`: **original summary** written for this project (2026-09-09). Dates, saint names,
  and event names are facts; all prose is our own wording.
- **Not copied** from any published Synaxarium: the complete English translation (St. Mark
  Chicago, 3 vols., ISBN 978-1-938423-02-4) is a commercial copyrighted work, and the Arabic
  daily texts on church websites have no clear redistribution grant — treat all as non-copyable.
- Day/event facts should be cross-checked against the church's printed Synaxarium before expansion.

## 5. Rites / Feasts — `kb/rites/sample/*.json`

- `nativity.json`: **original explanation** written for this project (2026-09-09). Feast dates,
  reading references (citations only, not quoted text), and hymn names (titles only) are facts;
  all prose is our own wording. No liturgical text is quoted beyond short public-domain
  verse citations.

## 6. Registries — `kb/bible/books.json`, `kb/synonyms.json`, `kb/manifest.json`

- `books.json`: book names + chapter counts are **facts** (not copyrightable). Compiled from
  the standard 66-book canon table; chapter counts cross-checked against the sample mirror's
  structure. Carries a `canonNote` flagging the Coptic deuterocanon gap.
- `synonyms.json`: short Arabic synonym pairs compiled for this project (functional search data).
- `manifest.json`: project configuration (no third-party content).

---

## Standing rules for future contributors

1. **Bible:** Van Dyck 1865 public-domain text only, unless a new translation ships with a
   written license recorded here. Never rewrite or paraphrase verse text — quote verbatim.
2. **Hymns:** the 14-field schema is ready, but text/translation/notation/recording fields stay
   `null` until each item has a named, dated, written permission logged here.
3. **Synaxarium/lessons/rites:** original prose only; cite published books by title/author,
   never copy from them.
4. **Short quotations** of public-domain works: allowed with `source` attribution in the item.
5. This log must be updated **in the same change** as any `kb/` content addition.
