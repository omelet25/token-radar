# Token Launch Radar

[![Competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/omelet25/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/omelet25/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty.

The program reads the sealed DefiLlama snapshot (758 protocols at or above $5M TVL, frozen 2026-11-14), finds the protocols that record no token yet, and ranks the plausible launches by an implied value derived from the snapshot's own figures. It writes a static, no-network dashboard: the ranked board, a detail view per protocol with its farm plan, and filters by text, category, chain and tier.

## The model

Implied value = **TVL × peer multiple × growth factor × seasoning factor**

- **Peer multiple** — the median market-cap/TVL of the token-live protocols in the same category in this snapshot (the global median, ×0.214, when a category has too few live peers), clamped to [0.05, 3]. A protocol is priced the way its live peers are priced, not from a hand-kept list of names.
- **Growth factor** — half the seven-day TVL change, clamped to [−25%, +50%], so one hot week cannot double a board.
- **Seasoning factor** — a protocol earns the full multiple over two years of running with no token recorded; a brand-new one is haircut to 0.8 of it.

The board holds every protocol that records no token and is a plausible launch: wrapped, staked and bridged products of tokens that already trade, centralised exchanges and superseded versions are screened out (144 of them). All 40 protocols on the house watchlist are covered, beside 158 early candidates below the $50M floor — 198 rows in all. A protocol here *records no token* in the snapshot; that is DefiLlama's record, not proof none exists.

Each row carries a five-step farm plan written from the protocol's category, main chain and size: what to do, what it costs, and how long to keep it up.

## Run it

Requires Node.js 22.18 or later; the standard library is all it uses.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

This writes `board.json` (the ranked board), `data.js` (the dashboard's data), `dashboard/` (the page), `screenshots/` and `dossier.json` (the summary the judge reads, built with the vendored make.fun library) into `out/`. The run is deterministic: the same snapshot always writes the same bytes.

## Layout

- `main.ts` — the entry point: read, score, write, copy, dossier.
- `lib/model.ts` — the value model, the launch-candidate screen and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`. Renders with no network.
- `screenshots/` — the board, a detail view and the watchlist filter, drawn from the same data the page renders.

## License

MIT — see `LICENSE`.
