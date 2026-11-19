# Portfolio cards — provenance

Three cards, each exactly 1000×750, rendered 2026-11-19.

| Card | Source | Clip box (logical px) | Arithmetic |
|---|---|---|---|
| cover.png | docs/cards/cover.html | 0,0,500,375 | 500×375 @ dsf 2 = 1000×750 |
| evidence.png | docs/cards/evidence.html | 0,0,500,375 | 500×375 @ dsf 2 = 1000×750 |
| instrument.png | docs/cards/instrument.html | 0,0,500,375 | 500×375 @ dsf 2 = 1000×750 |

Re-run:

```sh
python shared/cards/render.py docs/cards/<name>.html --out docs/images/portfolio/<name>.png --clip 0,0,500,375
```

Each card carries its own limit in its footer (no live Supabase/Stripe or
payments on cover; test-asserted evidence on evidence; in-memory PGlite on
instrument).
