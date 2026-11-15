/**
 * Radar 3 is a transparent, TVL-based estimate for protocols without a token.
 * It combines category multiples, recent growth, listing maturity, and a small
 * risk discount. It is a farming research aid, not investment advice.
 */

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

interface Risk {
  score: number;
  band: 'Low' | 'Moderate' | 'Elevated' | 'High';
  factors: string[];
}

interface RadarRow extends Protocol {
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number | null;
    growth_multiplier: number;
    maturity_multiplier: number;
    risk_score: number;
    risk_multiplier: number;
  };
  risk: Risk;
  signal: string;
  farm_steps: string[];
  rank: number;
}

const MODEL_VERSION = 'radar-3';
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
const VERSIONED_NAME = /(?:\bv\d+(?:\.\d+)*|\b\d+\.\d+(?:\.\d+)*)\s*$/i;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse and normalize the sealed snapshot without accepting malformed rows. */
export function parseSnapshot(text: string): Snapshot {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || !Array.isArray(value.protocols) || !Array.isArray(value.watchlist)) {
    throw new Error('snapshot must contain protocols and watchlist arrays');
  }
  const protocols: Protocol[] = value.protocols.map((raw, index) => {
    const item = raw as Record<string, unknown>;
    if (!item || typeof item.slug !== 'string' || typeof item.name !== 'string') {
      throw new Error(`invalid protocol at index ${index}`);
    }
    return {
      slug: item.slug,
      name: item.name,
      category: typeof item.category === 'string' ? item.category : null,
      chains: Array.isArray(item.chains)
        ? item.chains.filter((chain): chain is string => typeof chain === 'string')
        : [],
      tvl_usd: Math.max(0, finiteNumber(item.tvl_usd, 0)),
      change_7d: nullableNumber(item.change_7d),
      mcap_usd: nullableNumber(item.mcap_usd),
      listed_at: typeof item.listed_at === 'string' ? item.listed_at : null,
      gecko_id: typeof item.gecko_id === 'string' ? item.gecko_id : null,
      symbol: typeof item.symbol === 'string' ? item.symbol : null,
    };
  });
  return {
    as_of: typeof value.as_of === 'string' ? value.as_of : '',
    source: typeof value.source === 'string' ? value.source : '',
    floor_usd: Math.max(0, finiteNumber(value.floor_usd, 0)),
    protocols,
    watchlist: value.watchlist.filter((slug): slug is string => typeof slug === 'string'),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function categoryModel(category: string | null): { key: string; multiple: number } {
  const text = (category ?? '').toLowerCase();
  if (text.includes('dex')) return { key: 'Dexs', multiple: 0.42 };
  if (text.includes('lending')) return { key: 'Lending', multiple: 0.55 };
  if (text.includes('cdp')) return { key: 'CDP', multiple: 0.5 };
  if (text.includes('yield') || text.includes('farm')) return { key: 'Yield', multiple: 0.4 };
  if (text.includes('derivative') || text.includes('option') || text.includes('synthetic')) {
    return { key: 'Derivatives', multiple: 0.46 };
  }
  if (text.includes('bridge')) return { key: 'Bridge', multiple: 0.3 };
  if (text.includes('liquid staking')) return { key: 'Liquid Staking', multiple: 0.34 };
  if (text.includes('restaking') || text.includes('restaked')) return { key: 'Restaking', multiple: 0.44 };
  if (text.includes('rwa') || text.includes('real world')) return { key: 'RWA', multiple: 0.6 };
  if (text.includes('gaming') || text.includes('game')) return { key: 'Gaming', multiple: 0.28 };
  return { key: 'Other', multiple: 0.32 };
}

function ageDays(listedAt: string | null, asOf: string): number | null {
  if (!listedAt) return null;
  const then = Date.parse(listedAt);
  const now = Date.parse(asOf);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

function assessRisk(protocol: Protocol, age: number | null, category: string): Risk {
  let score = 30;
  const factors: string[] = ['Base pre-token execution and liquidity uncertainty: +30.'];
  if (protocol.tvl_usd < 1_000_000) {
    score += 28;
    factors.push('Shallow TVL below $1M: +28.');
  } else if (protocol.tvl_usd < 10_000_000) {
    score += 16;
    factors.push('Limited TVL below $10M: +16.');
  } else if (protocol.tvl_usd < 100_000_000) {
    score += 7;
    factors.push('Developing TVL below $100M: +7.');
  }
  if (protocol.chains.length <= 1) {
    score += 9;
    factors.push('Single-chain deployment: +9.');
  } else if (protocol.chains.length >= 3) {
    score -= 6;
    factors.push('Three or more chain deployments: -6.');
  }
  const momentum = Math.abs(protocol.change_7d ?? 0);
  if (momentum >= 40) {
    score += 12;
    factors.push('Extreme 7-day TVL momentum (40%+): +12.');
  } else if (momentum >= 15) {
    score += 5;
    factors.push('Notable 7-day TVL momentum (15%+): +5.');
  }
  if (age !== null && age < 90) {
    score += 12;
    factors.push('Listing is less than 90 days old: +12.');
  } else if (age !== null && age < 365) {
    score += 5;
    factors.push('Listing is less than one year old: +5.');
  }
  const categoryDelta: Record<string, number> = { Derivatives: 10, Gaming: 12, Lending: -6, CDP: -5, RWA: -3 };
  const delta = categoryDelta[category] ?? 0;
  if (delta !== 0) {
    score += delta;
    factors.push(`${category} category profile: ${delta > 0 ? '+' : ''}${delta}.`);
  }
  score = Math.round(clamp(score, 0, 100));
  const band: Risk['band'] = score < 25 ? 'Low' : score < 50 ? 'Moderate' : score < 75 ? 'Elevated' : 'High';
  return { score, band, factors };
}

function signal(change: number | null): string {
  if (change === null || change < -8) return 'Cooling';
  if (change < 5) return 'Steady';
  if (change < 25) return 'Building';
  return 'Surging';
}

function money(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

function farmSteps(protocol: Protocol, category: string, age: number | null, risk: Risk): string[] {
  const chain = protocol.chains[0] ?? 'the supported network';
  const chains = protocol.chains.length > 1 ? `${chain} (or another supported chain)` : chain;
  const capital = protocol.tvl_usd < 100_000_000 ? 50 : protocol.tvl_usd < 1_000_000_000 ? 100 : protocol.tvl_usd < 5_000_000_000 ? 150 : 250;
  const isCredit = category === 'Lending' || category === 'CDP';
  const isLiquidity = category === 'Dexs' || category === 'Yield';
  const isDerivative = category === 'Derivatives';
  const isStaking = category === 'Liquid Staking' || category === 'Restaking';
  const action = isCredit
    ? 'supply collateral'
    : isLiquidity
      ? 'provide a balanced LP position'
      : isDerivative
        ? 'open the smallest permitted margin position'
        : isStaking
          ? 'stake through the protocol flow'
          : 'make a protocol deposit';
  const second = isCredit
    ? 'Check borrowing capacity, make a tiny borrow only if needed, and repay it; reserve 15 minutes and no more than $5 in fees.'
    : isLiquidity
      ? 'Make one small swap and rebalance the LP range if offered; reserve 15 minutes and up to $5 in swap and gas costs.'
      : 'Use the governance or staking-extra action once if available; reserve 15 minutes and up to $5 in network fees.';
  const ordinaryHold = age === null ? 35 : age < 180 ? 60 : age < 730 ? 45 : 30;
  const hold = risk.band === 'High' ? 7 : risk.band === 'Elevated' ? 14 : ordinaryHold;
  const holdText = risk.band === 'High' || risk.band === 'Elevated'
    ? `Hold the position for ${hold} days, then perform an explicit exit check for TVL, docs, and withdrawals; spend 10 minutes and budget $5 for exit gas.`
    : `Keep the position active for ${hold} days to establish usage history; spend 5 minutes weekly and reserve $5 total for maintenance gas.`;
  const safety = risk.band === 'High'
    ? 'Verify the contract address from official docs and cap this position at the planned amount; spend 10 minutes and $0 before signing any approval.'
    : 'Verify the contract address from official docs before approvals; spend 10 minutes and $0, then revoke unused approvals after testing.';
  return [
    `Connect a fresh or limited-permission wallet on ${chains}, fund it with only ${money(capital + 10)}; allow 10 minutes and about $10 for bridge or gas costs.`,
    `${action} with about ${money(capital)} on ${chain}; allow 15 minutes and up to $8 in network and protocol costs.`,
    second,
    holdText,
    'Visit the points or rewards page once each week and record any qualifying activity; allow 5 minutes weekly and up to $2 for a check-in transaction.',
    safety,
    'Maintain a dated farm log with transactions, balances, and campaigns, then claim or exit when terms change; allow 10 minutes and reserve $5 for final gas.',
  ];
}

function eligible(protocol: Protocol): boolean {
  return protocol.mcap_usd === null &&
    protocol.gecko_id === null &&
    protocol.symbol === null &&
    !EXCLUDED_CATEGORIES.has(protocol.category ?? '') &&
    !WRAPPED_OR_STAKED.test(protocol.name) &&
    !EXCHANGE_PREFIX.test(protocol.name) &&
    !VERSIONED_NAME.test(protocol.name);
}

function makeRow(protocol: Protocol, snapshot: Snapshot): RadarRow {
  const category = categoryModel(protocol.category);
  const age = ageDays(protocol.listed_at, snapshot.as_of);
  const growth = protocol.change_7d === null ? 0 : clamp(protocol.change_7d, -60, 120);
  const growthMultiplier = 1 + growth / 200;
  const maturityMultiplier = 0.6 + Math.min(age ?? 365, 1095) / 1095 * 0.4;
  const risk = assessRisk(protocol, age, category.key);
  const riskMultiplier = 1 - risk.score * 0.0015;
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * category.multiple * growthMultiplier * maturityMultiplier * riskMultiplier),
  );
  return {
    ...protocol,
    age_days: age,
    implied_value_usd: implied,
    model: {
      category_multiple: category.multiple,
      growth_pct: protocol.change_7d,
      growth_multiplier: growthMultiplier,
      maturity_multiplier: maturityMultiplier,
      risk_score: risk.score,
      risk_multiplier: riskMultiplier,
    },
    risk,
    signal: signal(protocol.change_7d),
    farm_steps: farmSteps(protocol, category.key, age, risk),
    rank: 0,
  };
}

/** Build the ranked pre-token board and a dashboard-ready radar payload. */
export function buildRadar(snapshot: Snapshot): {
  as_of: string;
  floor_usd: number;
  model_version: string;
  model: Record<string, unknown>;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  median_implied_value: number;
  rows: RadarRow[];
  live: Protocol[];
} {
  const bySlug = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
  const watch = new Set(snapshot.watchlist);
  const selected = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = bySlug.get(slug);
    if (protocol && eligible(protocol)) selected.set(slug, protocol);
  }
  for (const protocol of snapshot.protocols) {
    if (eligible(protocol) && protocol.tvl_usd < snapshot.floor_usd && !selected.has(protocol.slug)) {
      selected.set(protocol.slug, protocol);
    }
  }
  const rows = [...selected.values()].map((protocol) => makeRow(protocol, snapshot));
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  rows.forEach((row, index) => { row.rank = index + 1; });
  const values = rows.map((row) => row.implied_value_usd).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length === 0
    ? 0
    : values.length % 2
      ? values[middle]
      : Math.round((values[middle - 1] + values[middle]) / 2);
  const live = snapshot.protocols
    .filter((protocol) => protocol.mcap_usd !== null && protocol.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24);
  return {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      category_multiples: {
        Dexs: 0.42,
        Lending: 0.55,
        CDP: 0.5,
        Yield: 0.4,
        Derivatives: 0.46,
        Bridge: 0.3,
        'Liquid Staking': 0.34,
        Restaking: 0.44,
        RWA: 0.6,
        Gaming: 0.28,
        Other: 0.32,
      },
      growth: '1 + clamp(change_7d, -60, 120) / 200',
      maturity: '0.6 + min(age_days, 1095) / 1095 * 0.4; unknown age is 365 days',
      risk: 'additive 0-100 score; implied value is discounted by 1 - score * 0.0015',
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((row) => !watch.has(row.slug)).length,
    median_implied_value: median,
    rows,
    live,
  };
}

/** Return a concise reason the board violates its delivery contract, or null. */
export function boardIssue(rows: RadarRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) {
    return `board row count ${rows.length} is outside 100..4000`;
  }
  const slugs = new Set(rows.map((row) => row.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug is missing: ${slug}`;
  }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.rank !== index + 1) return `bad rank for ${row.slug}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `bad implied value for ${row.slug}`;
    }
    if (index > 0 && row.implied_value_usd > rows[index - 1].implied_value_usd) {
      return `board is out of value order at ${row.slug}`;
    }
    const badSteps = !Array.isArray(row.farm_steps) || row.farm_steps.length !== 7 ||
      row.farm_steps.some((step) => typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600);
    if (badSteps) return `bad farm steps for ${row.slug}`;
    const badRisk = !row.risk || !Number.isInteger(row.risk.score) ||
      row.risk.score < 0 || row.risk.score > 100 || !Array.isArray(row.risk.factors);
    if (badRisk) return `bad risk assessment for ${row.slug}`;
  }
  return null;
}

/** Serialize the browser payload as a deliberately simple global assignment. */
export function dataScript(radar: unknown): string {
  return `window.RADAR = ${JSON.stringify(radar, null, 2)};\n`;
}
