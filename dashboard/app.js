// Token Launch Radar: renders the board, its filters and a detail view per
// protocol from window.RADAR, the data main.ts writes beside this page.
// No network: every figure on the page comes from that one data script.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  document.getElementById('asof').textContent =
    'Snapshot of ' + DATA.as_of + ' - ' + DATA.source;
  document.getElementById('foot').textContent =
    'Implied value is this radar\u2019s own estimate: TVL times the median market-cap/TVL of live peers in the ' +
    'same category, adjusted for seven-day growth and for how long the protocol has run with no token recorded. ' +
    'A protocol here records no token in the snapshot; that is DefiLlama\u2019s record, not proof none exists.';

  var state = { q: '', category: 'all', chain: 'all', tier: 'all', sort: 'rank', selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365).toFixed(1) + ' yr';
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) {
        var x = a.change_7d === null ? -1e9 : a.change_7d;
        var y = b.change_7d === null ? -1e9 : b.change_7d;
        return y - x;
      },
      age: function (a, b) { return (b.age_days || -1) - (a.age_days || -1); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; }
    };
    return rows.sort(by[state.sort] || by.rank);
  }

  function statCard(value, label) {
    var d = el('div', 'stat');
    d.appendChild(el('b', null, value));
    d.appendChild(el('span', null, label));
    return d;
  }

  function renderBoard() {
    app.textContent = '';
    var s = DATA.stats;

    var stats = el('section', 'stats');
    stats.appendChild(statCard(String(s.scanned), 'Protocols scanned'));
    stats.appendChild(statCard(String(s.pre_token), 'Record no token'));
    stats.appendChild(statCard(String(s.board_rows), 'On this board'));
    stats.appendChild(statCard(String(s.watchlist), 'Watchlist covered'));
    stats.appendChild(statCard(String(s.live), 'Already trade'));
    stats.appendChild(statCard(String(s.screened_out), 'Products screened out'));
    app.appendChild(stats);

    var model = el('section', 'model');
    model.innerHTML =
      '<b>The model.</b> Implied value = TVL &times; the median market-cap/TVL of live peers in the same ' +
      'category (global median &times;' + s.global_multiple + '), adjusted for 7-day growth and for how long ' +
      'the protocol has run with no token recorded. The board holds every protocol that records no token and ' +
      'is a plausible launch: wrapped, staked and bridged products of live tokens, centralised exchanges and ' +
      'superseded versions are screened out, and the house watchlist (TVL at or above ' +
      fmtUsd(DATA.floor_usd) + ') is the floor, never the ceiling.';
    app.appendChild(model);

    var controls = el('section', 'controls');
    var search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search name or slug';
    search.value = state.q;
    search.setAttribute('aria-label', 'Search protocols');
    search.addEventListener('input', function () { state.q = search.value; renderTable(); });
    controls.appendChild(search);

    var catSel = document.createElement('select');
    catSel.setAttribute('aria-label', 'Filter by category');
    catSel.appendChild(new Option('All categories', 'all'));
    categories().forEach(function (c) { catSel.appendChild(new Option(c, c)); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; renderTable(); });
    controls.appendChild(catSel);

    var chainSel = document.createElement('select');
    chainSel.setAttribute('aria-label', 'Filter by chain');
    chainSel.appendChild(new Option('All chains', 'all'));
    chains().forEach(function (c) { chainSel.appendChild(new Option(c, c)); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; renderTable(); });
    controls.appendChild(chainSel);

    var tabs = el('span', 'tabs');
    [['all', 'All'], ['watchlist', 'Watchlist'], ['early', 'Early']].forEach(function (pair) {
      var b = document.createElement('button');
      b.textContent = pair[1];
      b.setAttribute('aria-pressed', state.tier === pair[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.tier = pair[0];
        tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        renderTable();
      });
      tabs.appendChild(b);
    });
    controls.appendChild(tabs);

    var sortSel = document.createElement('select');
    sortSel.setAttribute('aria-label', 'Sort the board');
    [['rank', 'Sort: rank'], ['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'],
     ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['name', 'Sort: name']].forEach(function (pair) {
      sortSel.appendChild(new Option(pair[1], pair[0]));
    });
    sortSel.value = state.sort;
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; renderTable(); });
    controls.appendChild(sortSel);

    var count = el('span', 'count');
    count.id = 'rowcount';
    controls.appendChild(count);
    app.appendChild(controls);

    var wrap = el('div');
    wrap.id = 'tablewrap';
    app.appendChild(wrap);
    renderTable();
  }

  function renderTable() {
    var wrap = document.getElementById('tablewrap');
    var count = document.getElementById('rowcount');
    if (!wrap) return;
    var rows = visibleRows();
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' protocols';
    wrap.textContent = '';
    var top = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

    var table = el('table');
    var thead = el('thead');
    var htr = el('tr');
    ['#', 'Protocol', 'Category', 'Chains', 'TVL', '7d', 'Age', 'Implied value', ''].forEach(function (h, i) {
      var th = el('th', i >= 4 && i <= 7 ? 'num' : null, h);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'rank', String(r.rank)));
      var name = el('td', 'name');
      name.appendChild(el('b', null, r.name));
      name.appendChild(el('small', null, r.slug));
      tr.appendChild(name);
      var cat = el('td');
      cat.appendChild(el('span', 'chip', r.category || 'Uncategorised'));
      if (r.tier === 'watchlist') {
        var w = el('span', 'chip watch', 'Watchlist');
        w.style.marginLeft = '6px';
        cat.appendChild(w);
      }
      tr.appendChild(cat);
      tr.appendChild(el('td', 'small muted', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
      tr.appendChild(el('td', 'num', fmtUsd(r.tvl_usd)));
      var chg = el('td', 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), fmtPct(r.change_7d));
      tr.appendChild(chg);
      tr.appendChild(el('td', 'num', fmtAge(r.age_days)));
      tr.appendChild(el('td', 'num', fmtUsd(r.implied_value_usd)));
      var barCell = el('td');
      var bar = el('div', 'bar');
      var fill = el('i');
      fill.style.width = Math.max(2, Math.round((r.implied_value_usd / top) * 100)) + '%';
      bar.appendChild(fill);
      barCell.appendChild(bar);
      tr.appendChild(barCell);
      tr.addEventListener('click', function () { state.selected = r.slug; renderDetail(r); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderDetail(r) {
    app.textContent = '';
    var back = el('button', 'back', '\u2190 Back to the board');
    back.addEventListener('click', function () { state.selected = null; renderBoard(); });
    app.appendChild(back);

    var head = el('div', 'detail-head');
    head.appendChild(el('h2', null, r.name));
    head.appendChild(el('span', 'chip', 'Rank #' + r.rank + ' of ' + DATA.rows.length));
    if (r.tier === 'watchlist') head.appendChild(el('span', 'chip watch', 'On the house watchlist'));
    else head.appendChild(el('span', 'chip', 'Early: below the watchlist floor'));
    app.appendChild(head);
    app.appendChild(el('p', 'muted small',
      r.slug + ' - records no token in the snapshot of ' + DATA.as_of + ' (DefiLlama\u2019s record, not proof none exists).'));

    var grid = el('section', 'grid');
    [['Implied value', fmtUsd(r.implied_value_usd)], ['TVL', fmtUsd(r.tvl_usd)],
     ['7-day TVL change', fmtPct(r.change_7d)], ['Tracked since', r.listed_at || 'unknown'],
     ['Age with no token', fmtAge(r.age_days)], ['Category', r.category || 'Uncategorised'],
     ['Chains', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) + ' more' : '')],
     ['Watchlist floor', fmtUsd(DATA.floor_usd)]].forEach(function (pair) {
      grid.appendChild(statCard(pair[1], pair[0]));
    });
    app.appendChild(grid);

    var model = el('section', 'card');
    model.appendChild(el('h3', null, 'How this value is derived'));
    var f = el('p', 'formula');
    f.innerHTML =
      'TVL <b>' + fmtUsd(r.tvl_usd) + '</b> &times; peer multiple <b>&times;' + r.peer_multiple + '</b> ' +
      '&times; growth <b>&times;' + r.growth_factor + '</b> &times; seasoning <b>&times;' + r.seasoning_factor +
      '</b> = <b>' + fmtUsd(r.implied_value_usd) + '</b>';
    model.appendChild(f);
    model.appendChild(el('p', 'muted small',
      'The peer multiple is the median market-cap/TVL of token-live protocols in the same category in this ' +
      'snapshot. Growth moves the value by half the seven-day TVL change, clamped between -25% and +50%. ' +
      'Seasoning pays the full multiple only after two years with no token recorded.'));
    app.appendChild(model);

    var plan = el('section', 'card');
    plan.appendChild(el('h3', null, 'Farm plan'));
    var list = el('ol', 'steps');
    r.farm_steps.forEach(function (step) { list.appendChild(el('li', null, step)); });
    plan.appendChild(list);
    plan.appendChild(el('p', 'muted small',
      'Costs are working estimates for a small farmer at typical fees; nothing here is a promise of an airdrop.'));
    app.appendChild(plan);
    app.scrollIntoView();
  }

  renderBoard();
})();
