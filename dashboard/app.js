(() => {
  'use strict';

  const radar = window.RADAR || { rows: [], live: [] };
  const state = { tab: 'radar', search: '', category: '', chain: '', signal: '', risk: '', floor: false, sort: 'rank', direction: 'asc', selected: new Set() };
  const money = (value) => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const number = (value) => value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  const date = (value) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  const byId = (id) => document.getElementById(id);
  const optionList = (values) => [...new Set(values.flat().filter(Boolean))].sort().map((v) => `<option value="${escape(v)}">${escape(v)}</option>`).join('');

  function readHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith('category=')) { state.category = hash.slice(9); render(); }
    if (hash.startsWith('p=')) openDrawer(hash.slice(2), false);
  }
  function writeHash() {
    const fragment = state.category ? `#category=${encodeURIComponent(state.category)}` : '';
    history.replaceState(null, '', `${location.pathname}${location.search}${fragment}`);
  }
  function filteredRows() {
    const query = state.search.toLowerCase();
    return radar.rows.filter((row) => (!query || `${row.name} ${row.category} ${(row.chains || []).join(' ')}`.toLowerCase().includes(query)) && (!state.category || row.category === state.category) && (!state.chain || (row.chains || []).includes(state.chain)) && (!state.signal || row.signal === state.signal) && (!state.risk || row.risk.band === state.risk) && (!state.floor || row.tvl_usd >= radar.floor_usd)).sort((a, b) => {
      const av = a[state.sort] ?? 0; const bv = b[state.sort] ?? 0;
      if (typeof av === 'string') return state.direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return state.direction === 'asc' ? av - bv : bv - av;
    });
  }
  function riskBadge(risk) { return `<span class="risk ${risk.band.toLowerCase()}">${escape(risk.band)} ${risk.score}</span>`; }
  function momentum(value) {
    if (value == null) return '<span class="momentum muted">—</span>';
    const kind = value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted';
    return `<span class="momentum ${kind}"><span>${value > 0 ? '+' : ''}${value.toFixed(1)}%</span><span class="momentum-bar"><i style="width:${Math.min(Math.abs(value), 60) / 60 * 100}%"></i></span></span>`;
  }
  function sortable(key, label) { return `<button class="sort ${state.sort === key ? 'active' : ''}" data-sort="${key}">${label} ${state.sort === key ? (state.direction === 'asc' ? '↑' : '↓') : '↕'}</button>`; }
  function radarRow(row) {
    const selected = state.selected.has(row.slug);
    return `<tr data-slug="${escape(row.slug)}" class="${selected ? 'selected' : ''}"><td>${row.rank}</td><td><span class="name">${escape(row.name)}</span><span class="subtext">${escape(row.category)} · ${(row.chains || []).map(escape).join(', ')}</span></td><td>${money(row.tvl_usd)}</td><td>${momentum(row.change_7d)}</td><td>${row.age_days == null ? '—' : `${number(row.age_days)}d`}</td><td>${money(row.implied_value_usd)}</td><td><span class="signal ${row.signal.toLowerCase()}">${escape(row.signal)}</span></td><td>${riskBadge(row.risk)}</td><td><button class="compare-button ${selected ? 'selected' : ''}" data-compare="${escape(row.slug)}">${selected ? '✓ Added' : '+ Compare'}</button></td></tr>`;
  }
  function liveRow(row) { return `<tr><td><span class="name">${escape(row.name)}</span><span class="subtext">${escape(row.slug)}</span></td><td>${escape(row.category)}</td><td>${money(row.tvl_usd)}</td><td>${momentum(row.change_7d)}</td><td>${money(row.mcap_usd)}</td><td>${date(row.listed_at)}</td></tr>`; }
  function compareTray() {
    const rows = radar.rows.filter((row) => state.selected.has(row.slug));
    if (!rows.length) return '<section id="compare-tray" class="compare-tray" hidden></section>';
    const ratios = rows.map((r) => r.tvl_usd ? r.implied_value_usd / r.tvl_usd : 0); const max = Math.max(...ratios, 1);
    const cells = (field) => rows.map((row, i) => `<td>${field(row, ratios[i], max)}</td>`).join('');
    return `<section id="compare-tray" class="compare-tray"><div class="tray-head"><div><span class="tray-title">Compare protocols</span>${rows.length < 3 ? `<span class="tray-hint">pick up to ${3 - rows.length} more to compare</span>` : ''}</div><button class="clear-button" data-clear>Clear</button></div><table class="compare-table"><tbody><tr><th>Protocol</th>${cells((r) => `<span class="compare-name">${escape(r.name)}</span> <button class="remove" data-remove="${escape(r.slug)}">×</button>`)}</tr><tr><th>Rank</th>${cells((r) => `#${r.rank}`)}</tr><tr><th>Category</th>${cells((r) => escape(r.category))}</tr><tr><th>TVL</th>${cells((r) => money(r.tvl_usd))}</tr><tr><th>7d change</th>${cells((r) => momentum(r.change_7d))}</tr><tr><th>Age</th>${cells((r) => `${number(r.age_days)}d`)}</tr><tr><th>Implied value</th>${cells((r) => money(r.implied_value_usd))}</tr><tr><th>Implied / TVL</th>${cells((r, ratio, high) => `<div class="ratio">${(ratio * 100).toFixed(1)}%<div class="ratio-bar"><i style="width:${ratio / high * 100}%"></i></div></div>`)}</tr><tr><th>Signal</th>${cells((r) => escape(r.signal))}</tr><tr><th>Risk</th>${cells((r) => riskBadge(r.risk))}</tr></tbody></table></section>`;
  }
  function render() {
    const categories = optionList(radar.rows.map((r) => r.category)); const chains = optionList(radar.rows.map((r) => r.chains || []));
    const rows = filteredRows();
    byId('app').innerHTML = `<div class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">TR</span> Token Radar</div><div class="meta">Updated ${escape(radar.as_of || '—')} · ${escape(radar.model_version || 'Model')}</div></header><section class="hero"><div class="eyebrow">Early launch intelligence</div><h1>Find the protocols before the token.</h1><p>Ranked by an implied-value model, with momentum and risk context for an actionable research queue.</p></section><section class="kpis"><article class="kpi"><span>Radar board</span><strong>${number(radar.board_size)}</strong></article><article class="kpi"><span>Watchlist</span><strong>${number(radar.watchlist_size)}</strong></article><article class="kpi"><span>Early finds</span><strong>${number(radar.early_size)}</strong></article><article class="kpi"><span>Median implied value</span><strong>${money(radar.median_implied_value)}</strong></article><article class="kpi"><span>TVL floor</span><strong>${money(radar.floor_usd)}</strong></article></section><nav class="tabs"><button class="tab ${state.tab === 'radar' ? 'active' : ''}" data-tab="radar">Radar</button><button class="tab ${state.tab === 'live' ? 'active' : ''}" data-tab="live">Live <span class="subtext">already-tokenized</span></button></nav>${state.tab === 'radar' ? `${compareTray()}<section class="panel"><div class="controls"><input id="search" value="${escape(state.search)}" placeholder="Search protocols, categories, chains"><select id="category"><option value="">All categories</option>${categories}</select><select id="chain"><option value="">All chains</option>${chains}</select><select id="signal"><option value="">All signals</option>${optionList(['Cooling', 'Steady', 'Building', 'Surging'])}</select><select id="risk"><option value="">All risk bands</option>${optionList(['Low', 'Moderate', 'Elevated', 'High'])}</select><label><input id="floor" type="checkbox" ${state.floor ? 'checked' : ''}> Watchlist floor</label></div><div class="table-wrap"><table><thead><tr><th>${sortable('rank', 'Rank')}</th><th>${sortable('name', 'Protocol')}</th><th>${sortable('tvl_usd', 'TVL')}</th><th>${sortable('change_7d', '7d')}</th><th>${sortable('age_days', 'Age')}</th><th>${sortable('implied_value_usd', 'Implied value')}</th><th>Signal</th><th>Risk</th><th>Compare</th></tr></thead><tbody>${rows.length ? rows.map(radarRow).join('') : '<tr><td colspan="9" class="empty">No protocols match these filters.</td></tr>'}</tbody></table></div></section>` : `<section class="panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Category</th><th>TVL</th><th>7d change</th><th>Market cap</th><th>Listed</th></tr></thead><tbody>${(radar.live || []).map(liveRow).join('') || '<tr><td colspan="6" class="empty">No live protocols in this snapshot.</td></tr>'}</tbody></table></div></section>`}</div><div class="drawer-backdrop" hidden></div><aside class="drawer" hidden></aside>`;
    ['category', 'chain', 'signal', 'risk'].forEach((key) => { byId(key).value = state[key]; });
    bindEvents();
  }
  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));
    const search = byId('search'); if (search) search.addEventListener('input', (e) => { state.search = e.target.value; render(); writeHash(); });
    ['category', 'chain', 'signal', 'risk'].forEach((key) => { const el = byId(key); if (el) el.addEventListener('change', (e) => { state[key] = e.target.value; render(); writeHash(); }); });
    const floor = byId('floor'); if (floor) floor.addEventListener('change', (e) => { state.floor = e.target.checked; render(); writeHash(); });
    document.querySelectorAll('[data-sort]').forEach((el) => el.addEventListener('click', () => { const key = el.dataset.sort; state.direction = state.sort === key && state.direction === 'asc' ? 'desc' : 'asc'; state.sort = key; render(); }));
    document.querySelectorAll('[data-compare]').forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); const slug = el.dataset.compare; if (state.selected.has(slug)) state.selected.delete(slug); else if (state.selected.size < 3) state.selected.add(slug); render(); }));
    document.querySelectorAll('tbody tr[data-slug]').forEach((el) => el.addEventListener('click', () => openDrawer(el.dataset.slug)));
    document.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', () => { state.selected.delete(el.dataset.remove); render(); }));
    document.querySelectorAll('[data-clear]').forEach((el) => el.addEventListener('click', () => { state.selected.clear(); render(); }));
  }
  function openDrawer(slug, push = true) {
    const row = radar.rows.find((item) => item.slug === slug); if (!row) return;
    if (!byId('app').querySelector('.drawer')) render();
    const drawer = document.querySelector('.drawer'); const backdrop = document.querySelector('.drawer-backdrop');
    drawer.innerHTML = `<div class="drawer-head"><div><div class="eyebrow">#${row.rank} · ${escape(row.category)}</div><h2>${escape(row.name)}</h2><p>${(row.chains || []).map(escape).join(' · ')} · listed ${date(row.listed_at)}</p></div><button class="icon-button close" aria-label="Close">×</button></div><h3>Model breakdown</h3><div class="drawer-grid"><div class="drawer-stat"><span>Implied value</span><strong>${money(row.implied_value_usd)}</strong></div><div class="drawer-stat"><span>TVL</span><strong>${money(row.tvl_usd)}</strong></div><div class="drawer-stat"><span>Category multiple</span><strong>${row.model.category_multiple}×</strong></div><div class="drawer-stat"><span>Growth</span><strong>${row.model.growth_pct}% / ${row.model.growth_multiplier}×</strong></div><div class="drawer-stat"><span>Maturity multiplier</span><strong>${row.model.maturity_multiplier}×</strong></div><div class="drawer-stat"><span>Signal</span><strong>${escape(row.signal)}</strong></div></div><h3>Risk assessment</h3><div class="drawer-grid"><div class="drawer-stat"><span>Score</span><strong>${row.risk.score}/100</strong></div><div class="drawer-stat"><span>Band</span><strong>${riskBadge(row.risk)}</strong></div><div class="drawer-stat"><span>Risk multiplier</span><strong>${row.model.risk_multiplier}×</strong></div></div><ul class="risk-list">${row.risk.factors.map((factor) => `<li>${escape(factor)}</li>`).join('')}</ul><h3>Seven-step farm plan</h3><ol class="steps">${row.farm_steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>`;
    drawer.hidden = false; backdrop.hidden = false;
    const close = () => { drawer.hidden = true; backdrop.hidden = true; history.replaceState(null, '', `${location.pathname}${location.search}${state.category ? `#category=${encodeURIComponent(state.category)}` : ''}`); };
    drawer.querySelector('.close').addEventListener('click', close); backdrop.addEventListener('click', close, { once: true });
    if (push) history.replaceState(null, '', `#p=${encodeURIComponent(slug)}`);
  }
  render();
  readHash();
  window.addEventListener('hashchange', readHash);
})();
