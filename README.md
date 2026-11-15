# Token Radar

A deterministic, offline launch radar for the sealed protocol snapshot. `radar-2` scores only pre-token protocols with TVL, a category-specific multiple, capped seven-day TVL momentum, and a maturity multiplier based on listing age. It applies the watchlist product exclusions: Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, and CEX categories; names with whole-word wrapped, staked, or staking; names beginning with the named exchanges; and versioned names are all excluded.

Run: `MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json`, then `node scripts/validate.mjs out path/to/snapshot.json`.
