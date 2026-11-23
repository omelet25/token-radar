// Token Launch Radar: the value model.
//
// The snapshot carries no ranking and no implied value: deriving them is this
// file's work. The model is built only from the snapshot's own figures, so the
// same program run on a future snapshot finds launches that do not exist yet.
//
// A protocol reaches the board when it records no token (both gecko_id and
// symbol null) and is a plausible launch candidate: not a wrapped, staked or
// bridged product of a token that already trades, not a centralised exchange,
// and not a superseded version of a protocol. The house watchlist is the
// floor: every watchlist slug is on the board, and early candidates below the
// floor stand beside them.
//
// Implied value answers "what would this protocol's token be worth if it
// launched at the multiple its live peers trade at, on today's record":
//
//   implied = TVL x peer multiple x growth factor x seasoning factor
//
// - peer multiple: the median market-cap / TVL of the token-live protocols in
//   the same category, from this snapshot (global median when a category has
//   too few live peers), clamped to [0.05, 3].
// - growth factor: the seven-day TVL change, clamped to [-25%, +50%] and
//   halved before it moves the value, so one hot week cannot double a board.
// - seasoning factor: a protocol that has run longer with no token earns the
//   full multiple over two years; a brand-new one is haircut to 0.8 of it.

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

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  peer_multiple: number;
  growth_factor: number;
  seasoning_factor: number;
  tier: 'watchlist' | 'early';
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  stats: {
    scanned: number;
    pre_token: number;
    live: number;
    screened_out: number;
    board_rows: number;
    watchlist: number;
    global_multiple: number;
  };
  rows: RadarRow[];
}

/** Parse the sealed snapshot, checking the shape the model relies on. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** A protocol records no token when both token fields are null. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * A plausible launch candidate: records no token, and is not a wrapped,
 * staked or bridged product of one that trades, not an exchange front-end
 * for an existing business, and not a superseded version. This mirrors the
 * field guide's watchlist screen, applied at every size, not only at the
 * floor.
 */
export function isLaunchCandidate(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name === prefix || p.name.startsWith(`${prefix} `)) return false;
  }
  return true;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Median live market-cap / TVL per category, with the global median as fallback. */
export function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const ratios: number[] = [];
  const grouped = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    ratios.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = grouped.get(key);
    if (list === undefined) grouped.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = ratios.length > 0 ? clamp(median(ratios), 0.05, 3) : 0.2;
  const byCategory = new Map<string, number>();
  for (const [key, list] of grouped) {
    byCategory.set(key, list.length >= 3 ? clamp(median(list), 0.05, 3) : global);
  }
  return { byCategory, global };
}

/** Whole days between the day DefiLlama began tracking a protocol and the snapshot's date. */
export function ageDays(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const start = Date.parse(`${p.listed_at}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return 1 + clamp(change7d, -25, 50) / 200;
}

export function seasoningFactor(age: number | null): number {
  if (age === null) return 0.9;
  return 0.8 + 0.2 * Math.min(age / 730, 1);
}

// ---------------------------------------------------------------------------
// Farm plans. Each plan is five concrete steps, written from the protocol's
// own category, main chain and size: what to do, what it costs, how long it
// takes. Costs are working estimates for a small farmer, stated as such.
// ---------------------------------------------------------------------------

interface ChainCost {
  gas: string;
  note: string;
}

function chainCost(chain: string): ChainCost {
  switch (chain) {
    case 'Ethereum':
      return { gas: '$5-25 of ETH per transaction at typical fees', note: 'Ethereum mainnet' };
    case 'Solana':
      return { gas: 'a few cents of SOL per transaction', note: 'Solana' };
    case 'Bitcoin':
      return { gas: '$1-5 of BTC per transaction', note: 'Bitcoin' };
    case 'BSC':
    case 'Binance':
      return { gas: 'under $0.50 of BNB per transaction', note: chain };
    default:
      return { gas: 'under $1 per transaction in gas', note: chain };
  }
}

function sizeTier(tvl: number): string {
  if (tvl >= 1_000_000_000) return 'one of the largest protocols on this board';
  if (tvl >= 100_000_000) return 'a large, well-capitalised protocol';
  if (tvl >= 25_000_000) return 'a mid-sized protocol with real usage';
  return 'an early protocol where small wallets are a visible share of activity';
}

const CORE_ACTIONS: Record<string, { core: string; second: string; risk: string }> = {
  Dexs: {
    core: 'make real swaps in both directions across its main pairs, $100-500 a trade, so your volume looks like usage and not wash trading',
    second: 'add a small two-sided liquidity position in a flagship pair and leave it in range, rebalancing about once a week',
    risk: 'impermanent loss on the liquidity position and the usual smart-contract risk',
  },
  Derivatives: {
    core: 'open and close modest perpetual positions with strict size limits, trading both long and short across several sessions a week',
    second: 'keep a steady margin balance deposited so your open interest and tenure register week after week',
    risk: 'liquidation risk on leveraged positions: size small, use low leverage and never chase losses',
  },
  Lending: {
    core: 'supply a blue-chip asset (ETH or a major stablecoin) and keep it supplied, adding on dips rather than moving it in and out',
    second: 'take a small, well-collateralised borrow against the supply and repay it in cycles, keeping the health factor comfortably high',
    risk: 'liquidation if collateral falls: keep the health factor above 2 and check it weekly',
  },
  CDP: {
    core: 'open a vault with a conservative collateral ratio and mint a modest amount of the protocol stablecoin against it',
    second: 'use the minted stablecoin inside the protocol own markets and repay and redraw in slow cycles over several weeks',
    risk: 'liquidation if the collateral ratio slips: stay far above the minimum and watch it weekly',
  },
  Yield: {
    core: 'deposit into its main vault or strategy and leave the position untouched so your tenure and average balance build',
    second: 'claim and re-deposit rewards on a weekly rhythm instead of selling them, which compounds both yield and activity',
    risk: 'strategy and smart-contract risk: a vault can underperform or be paused, so split size across weeks',
  },
  'Yield Aggregator': {
    core: 'deposit into two or three of its vaults rather than one, favouring the flagship strategies it promotes',
    second: 'rotate a small share between vaults monthly as strategies change, keeping a continuous balance the whole time',
    risk: 'underlying strategy risk sits below the aggregator: read which protocols each vault routes into',
  },
  Farm: {
    core: 'stake into the pools it currently incentivises, in the sizes a normal user would, and harvest on a weekly rhythm',
    second: 'keep part of the position in its longest-running pool so your history predates any snapshot it may take',
    risk: 'reward-token price moves and pool churn: harvest regularly and do not over-concentrate',
  },
  'Leveraged Farming': {
    core: 'open a small leveraged position at the lowest leverage tier and let it run, topping up collateral before it is at risk',
    second: 'close and reopen positions in slow cycles across several weeks so activity spans time, not one day',
    risk: 'leveraged positions can be liquidated in a fast move: lowest tier only, with alerts set',
  },
  'Risk Curators': {
    core: 'allocate to the flagship curated vaults rather than the long tail, in sizes a normal allocator would use',
    second: 'spread a second allocation across a different curator vault on the same protocol to build breadth of usage',
    risk: 'curator strategy risk: a vault can take losses its curator chose, so read the vault mandate first',
  },
  'Onchain Capital Allocator': {
    core: 'allocate capital through its main vaults and keep the allocation live across many weeks, adding in tranches',
    second: 'use more than one of its markets or vaults so your history shows the product range, not a single deposit',
    risk: 'strategy and counterparty risk inside each allocation: diversify across its vaults',
  },
  RWA: {
    core: 'complete its onboarding or KYC if it asks for one, then hold a position in its main real-world-asset product',
    second: 'add in regular monthly tranches so your holding history is long and steady rather than a single spike',
    risk: 'off-chain and custody risk sits behind the tokenised asset: read its attestations before sizing up',
  },
  'Liquidity Manager': {
    core: 'deposit into its managed ranges on a flagship pair and leave the position to be rebalanced by the manager',
    second: 'hold a second, smaller position on a different pair so your usage covers more of the product',
    risk: 'range and impermanent-loss risk remains yours even when a manager rebalances: check the range monthly',
  },
};

const FALLBACK_ACTION = {
  core: 'use its main product the way a normal user would, in modest size, on a repeating weekly rhythm rather than in one burst',
  second: 'cover a second feature of the product (a second market, chain or vault) so your history shows real breadth of use',
  risk: 'the usual smart-contract risk of a young protocol: start small and size up only after weeks of clean operation',
};

export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const cost = chainCost(chain);
  const action = CORE_ACTIONS[p.category ?? ''] ?? FALLBACK_ACTION;
  const multi = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(' and ')}, where fees are usually lower.` : '';
  return [
    `Set up a dedicated wallet and fund it on ${cost.note}: ${cost.gas}, plus $300-1,000 of working capital. ${p.name} is ${sizeTier(p.tvl_usd)}, so a normal user's footprint is the goal.${multi}`,
    `Start with the core action: ${action.core}. Budget about 15 minutes a session, 3 sessions a week, and keep each position modest and repeatable.`,
    `Add the second leg: ${action.second}. This takes about 10 minutes a week once it is running and matters more than any single large deposit.`,
    `Keep the routine for 6-10 weeks: check the protocol's own points, rewards or announcement pages once a week (10 minutes), note your balances, and never move everything in or out on one day.`,
    `Mind the risks: ${action.risk}. Keep only money you can leave idle until a launch window, and if a token is ever announced, use only the protocol's official claim page.`,
  ];
}

// ---------------------------------------------------------------------------

/** Score every launch candidate and return the ranked board plus the page's data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const watchlist = new Set(snapshot.watchlist);
  const { byCategory, global } = peerMultiples(snapshot);
  const rows: RadarRow[] = [];
  let preToken = 0;
  let screenedOut = 0;
  for (const p of snapshot.protocols) {
    if (!recordsNoToken(p)) continue;
    preToken += 1;
    if (!isLaunchCandidate(p)) {
      screenedOut += 1;
      continue;
    }
    const multiple = byCategory.get(p.category ?? 'Uncategorised') ?? global;
    const age = ageDays(p, snapshot.as_of);
    const growth = growthFactor(p.change_7d);
    const seasoning = seasoningFactor(age);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * seasoning));
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: age,
      peer_multiple: round3(multiple),
      growth_factor: round3(growth),
      seasoning_factor: round3(seasoning),
      tier: watchlist.has(p.slug) ? 'watchlist' : 'early',
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));
  const radar: Radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    stats: {
      scanned: snapshot.protocols.length,
      pre_token: preToken,
      live: snapshot.protocols.length - preToken,
      screened_out: screenedOut,
      board_rows: rows.length,
      watchlist: snapshot.watchlist.length,
      global_multiple: round3(global),
    },
    rows,
  };
  return { board, radar };
}

/** The data script the dashboard reads: the same figures the board was ranked on. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Check a board against the gate's shape; return the first problem, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const known = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) return `row names a protocol the snapshot does not: ${row.slug}`;
    if (seen.has(row.slug)) return `slug appears twice: ${row.slug}`;
    seen.add(row.slug);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug}: ${row.farm_steps.length} farm steps, outside 3-12`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug}: a farm step of ${len} characters, outside 20-600`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol missing from the board: ${slug}`;
  }
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `ranks are not exactly 1 to N at position ${i + 1}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${i + 1}`;
    }
  }
  if (board.length > 1 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'every implied value is the same: not a ranking';
  }
  return null;
}
