[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cryptode18/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cryptode18/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

Entry for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01).

A deterministic, offline launch radar for the sealed protocol snapshot. `radar-3` scores only pre-token protocols with TVL, a category-specific multiple, capped seven-day TVL momentum, and a maturity multiplier based on listing age. It applies the watchlist product exclusions: Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, and CEX categories; names with whole-word wrapped, staked, or staking; names beginning with the named exchanges; and versioned names are all excluded.

New in radar-3: every board row also carries a transparent risk assessment (0–100 score and Low/Moderate/Elevated/High band) built from TVL depth, chain diversification, momentum extremity, listing age, and category risk weight. The implied value is adjusted by a small risk multiplier, and the seven-step farm plans are composed from category- and risk-aware building blocks. The dashboard adds risk badges and a risk filter, a momentum sparkbar, and a compare tray that lines up to three protocols side by side (including implied/TVL ratio bars).

Run: `MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json`, then `node scripts/validate.mjs out path/to/snapshot.json`.
