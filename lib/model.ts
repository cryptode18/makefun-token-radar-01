export interface Protocol { slug:string; name:string; category:string|null; chains:string[]; tvl_usd:number; change_7d:number|null; mcap_usd:number|null; listed_at:string|null; gecko_id:string|null; symbol:string|null }
export interface Snapshot { as_of:string; source:string; floor_usd:number; protocols:Protocol[]; watchlist:string[] }
export const MODEL_VERSION='radar-2';
const DAY=86400000;
const multiples:Record<string,number>={Dexs:.42,Lending:.55,CDP:.5,Yield:.4,Derivatives:.46,Bridge:.3,'Liquid Staking':.34,Restaking:.44,RWA:.6,Gaming:.28,Other:.32};
const key=(c:string|null)=>{const x=(c||'Other').toLowerCase();if(x.includes('lend'))return'Lending';if(x.includes('cdp')||x.includes('stable'))return'CDP';if(x.includes('dex'))return'Dexs';if(x.includes('yield'))return'Yield';if(x.includes('derivative')||x.includes('perpetual'))return'Derivatives';if(x.includes('bridge'))return'Bridge';if(x.includes('liquid staking'))return'Liquid Staking';if(x.includes('restak'))return'Restaking';if(x.includes('rwa'))return'RWA';if(x.includes('gaming')||x.includes('game'))return'Gaming';return'Other'};
const versioned=/\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
const excludedCategories=new Set(['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX']);
const productName=/\b(?:wrapped|staked|staking)\b/i;
const exchangeName=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
export const preToken=(p:Protocol)=>p.mcap_usd===null&&p.gecko_id===null&&p.symbol===null;
// Match the watchlist product exclusions so a wrapped or staked traded token is never ranked as a future launch.
export const rankable=(p:Protocol)=>preToken(p)&&!excludedCategories.has(p.category||'')&&!productName.test(p.name)&&!exchangeName.test(p.name)&&!versioned.test(p.name);
const age=(asof:string,listed:string|null)=>{if(!listed)return null;const n=(Date.parse(asof+'T00:00:00Z')-Date.parse(listed+'T00:00:00Z'))/DAY;return Number.isFinite(n)?Math.max(0,Math.floor(n)):null};
const signal=(n:number|null)=>n===null||n< -8?'Cooling':n<5?'Steady':n<25?'Building':'Surging';
const cap=(p:Protocol)=>p.tvl_usd>=5e9?250:p.tvl_usd>=1e9?150:p.tvl_usd>=1e8?100:50;
const action=(p:Protocol,c:number,chain:string)=>{const x=(p.category||'').toLowerCase();if(x.includes('lend')||x.includes('cdp'))return`Supply $${c} of stable collateral on ${p.name} via ${chain}.`;if(x.includes('dex')||x.includes('yield'))return`Provide $${c} of balanced liquidity in ${p.name}'s core market on ${chain}.`;if(x.includes('derivative'))return`Deposit $${c} as conservative margin on ${p.name} using ${chain}.`;if(x.includes('stake')||x.includes('restak'))return`Stake $${c} of the network asset through ${p.name} on ${chain}.`;if(x.includes('bridge'))return`Bridge $${c} of stable value through ${p.name} to ${chain}, then make one use.`;return`Deposit $${c} into ${p.name}'s core product on ${chain}.`};
const steps=(p:Protocol,a:number|null)=>{const c=cap(p),chain=p.chains[0]||'the main chain',hold=a===null?35:a<180?60:a<730?45:30;return[
`Create a fresh farm wallet, record its purpose offline, and fund it only with the amount reserved for ${chain}. Cost: about $3 gas. Time: 10 minutes.`,
`${action(p,c,chain)} Keep transaction notes and verify the completed position in the interface. Cost: $${c} capital plus about $5 gas. Time: 20 minutes.`,
`Make a second qualifying ${p.category&&/lend|cdp/i.test(p.category)?'borrow or repay':p.category&&/dex|yield/i.test(p.category)?'swap or rebalance':'stake, vote, or swap'} action each week to establish a regular cadence. Cost: about $4 gas weekly. Time: 10 minutes weekly.`,
`Hold the position for ${hold} days unless your risk limits require an exit; do not churn activity just for points. Cost: $${c} remains allocated. Time: ${hold} days.`,
`Check the protocol's own points or rewards page weekly and screenshot the displayed balance for your records. Cost: no deposit required. Time: 8 minutes weekly.`,
`Safety review: re-check the contract address from the protocol's official page before any new deposit, and never sign blind. Cost: no financial cost. Time: 5 minutes.`,
`Maintain a farm log with dates and balances, then claim or exit only after checking eligibility and your risk plan. Cost: possible network gas. Time: 10 minutes.`];}; 
export function parseSnapshot(text:string):Snapshot {const x=JSON.parse(text);if(!x||!Array.isArray(x.protocols)||!Array.isArray(x.watchlist)||typeof x.as_of!=='string')throw Error('invalid snapshot');return x as Snapshot}
export function buildRadar(s:Snapshot){
 const chosen=new Map<string,Protocol>(),idx=new Map(s.protocols.map(p=>[p.slug,p]));
 s.watchlist.forEach(x=>{const p=idx.get(x);if(p&&rankable(p))chosen.set(x,p)});
 const score=(p:Protocol)=>{const g=Math.max(-60,Math.min(120,p.change_7d??0)),a=age(s.as_of,p.listed_at);return p.tvl_usd*(1+g/200)*(.6+Math.min(a??365,1095)/1095*.4)};
 const candidates=s.protocols.filter(p=>!chosen.has(p.slug)&&rankable(p)&&p.tvl_usd<s.floor_usd).sort((a,b)=>score(b)-score(a)||a.slug.localeCompare(b.slug));
 for(const p of candidates)chosen.set(p.slug,p);
 const rows=[...chosen.values()].map(p=>{const a=age(s.as_of,p.listed_at),growth=Math.max(-60,Math.min(120,p.change_7d??0)),gm=1+growth/200,mm=.6+Math.min(a??365,1095)/1095*.4,cm=multiples[key(p.category)];return{slug:p.slug,name:p.name,category:p.category||'Other',chains:p.chains,tvl_usd:p.tvl_usd,change_7d:p.change_7d,mcap_usd:p.mcap_usd,listed_at:p.listed_at,age_days:a,implied_value_usd:Math.max(1,Math.round(p.tvl_usd*cm*gm*mm)),model:{category_multiple:cm,growth_pct:growth,growth_multiplier:gm,maturity_multiplier:mm},signal:signal(p.change_7d),farm_steps:steps(p,a)}}).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||a.slug.localeCompare(b.slug)).map((r,i)=>({...r,rank:i+1}));
 const live=s.protocols.filter(p=>!preToken(p)&&p.category!=='CEX').sort((a,b)=>(b.mcap_usd||0)-(a.mcap_usd||0)||a.slug.localeCompare(b.slug)).slice(0,24),early=rows.filter(r=>!s.watchlist.includes(r.slug)).length,vals=rows.map(r=>r.implied_value_usd).sort((a,b)=>a-b);
 return{board:rows,radar:{as_of:s.as_of,floor_usd:s.floor_usd,model_version:MODEL_VERSION,model:{category_multiples:multiples,default_multiple:.32,growth:'1 + clamp(change_7d,-60,120)/100 × 0.5',maturity:'0.6 + min(age_days,1095)/1095 × 0.4'},watchlist_size:s.watchlist.length,board_size:rows.length,early_size:early,median_implied_value:vals[Math.floor(vals.length/2)],rows,live}}}
export function boardIssue(rows:any[],s:Snapshot){if(rows.length<100||rows.length>4000)return'row count';const have=new Set(rows.map(r=>r.slug));if(s.watchlist.some(x=>!have.has(x)))return'watchlist coverage';for(let i=0;i<rows.length;i++){const r=rows[i];if(r.rank!==i+1||!Number.isInteger(r.implied_value_usd)||r.implied_value_usd<1||(i&&r.implied_value_usd>rows[i-1].implied_value_usd)||!Array.isArray(r.farm_steps)||r.farm_steps.length!==7)return'row order or shape'}return null}
export const dataScript=(radar:any)=>'window.RADAR='+JSON.stringify(radar)+';\n';
