// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• REVENUE & REPORTING â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

var RV_PANES = ['overview', 'earnings', 'reports', 'refunds', 'settings'];

var revState = {
  tab: 'overview',
  preset: '30d',        // today | 7d | 30d | 90d | custom
  from: '',
  to: '',
  fmt: 'csv',
  summary: null,
  series: null,
  overviewKey: '',
  overviewLoading: false,
  earnings: null,
  earningsKey: '',
  earningsLoading: false,
  settings: null,
  settingsDefaults: null,
  settingsLoading: false,
  settingsSaving: false,
  refunds: { page: 1, pagination: null, loaded: false, loading: false },
  exporting: false
};

var revCharts = {};
var revChartDefaults = false;
var revRefund = null;

// â”€â”€â”€ Role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function revAdminRole() {
  try {
    var u = JSON.parse(localStorage.getItem('admin_user') || '{}');
    return String(u.role || 'admin').toLowerCase();
  } catch (e) { return 'admin'; }
}

function revIsFinance() {
  return ['admin', 'superadmin', 'finance', 'owner'].indexOf(revAdminRole()) >= 0;
}

// â”€â”€â”€ Range helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function revYmd(d) {
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
}

function revPresetDates(preset) {
  var to = new Date();
  var from = new Date();
  if (preset === '7d') from.setDate(to.getDate() - 6);
  else if (preset === '30d') from.setDate(to.getDate() - 29);
  else if (preset === '90d') from.setDate(to.getDate() - 89);
  return { from: revYmd(from), to: revYmd(to) };
}

function revRangeKey() {
  if (revState.preset === 'custom' && revState.from && revState.to) {
    return 'from=' + revState.from + '&to=' + revState.to;
  }
  var p = ['today', '7d', '30d', '90d'].indexOf(revState.preset) >= 0 ? revState.preset : '30d';
  return 'preset=' + p;
}

function revRangeDates() {
  if (revState.preset === 'custom' && revState.from && revState.to) {
    return { from: revState.from, to: revState.to };
  }
  return revPresetDates(revState.preset === 'today' ? 'today' : revState.preset);
}

function revRangeLabel() {
  if (revState.preset === 'custom' && revState.from && revState.to) {
    return revState.from + ' â†’ ' + revState.to;
  }
  if (revState.preset === 'today') return 'Today';
  if (revState.preset === '7d') return 'Last 7 days';
  if (revState.preset === '90d') return 'Last 90 days';
  return 'Last 30 days';
}

function revSetLabel(text) {
  var el = document.getElementById('rv-range-label');
  if (el) el.textContent = text;
}

function rvSetRange(preset, btn) {
  var wrap = document.getElementById('rv-range-presets');
  if (wrap) {
    wrap.querySelectorAll('.rv-preset').forEach(function(b) {
      b.classList.toggle('on', b.getAttribute('data-range') === preset);
    });
  }
  var custom = document.getElementById('rv-range-custom');
  if (preset === 'custom') {
    if (custom) custom.style.display = '';
    var fromEl = document.getElementById('rv-range-from');
    var toEl = document.getElementById('rv-range-to');
    var d = revState.preset === 'custom' && revState.from ? { from: revState.from, to: revState.to } : revPresetDates(revState.preset);
    if (fromEl && !fromEl.value) fromEl.value = d.from;
    if (toEl && !toEl.value) toEl.value = d.to;
    return;
  }
  if (custom) custom.style.display = 'none';
  revState.preset = preset;
  revState.from = '';
  revState.to = '';
  revSetLabel(revRangeLabel());
  loadRevenuePanel(true);
}

function rvApplyCustom() {
  var fromEl = document.getElementById('rv-range-from');
  var toEl = document.getElementById('rv-range-to');
  var from = fromEl ? fromEl.value : '';
  var to = toEl ? toEl.value : '';
  if (!from || !to) { toast('Pick both dates', false); return; }
  if (from > to) { var t = from; from = to; to = t; if (fromEl) fromEl.value = from; if (toEl) toEl.value = to; }
  revState.preset = 'custom';
  revState.from = from;
  revState.to = to;
  revSetLabel(revRangeLabel());
  loadRevenuePanel(true);
}

// â”€â”€â”€ Panel / tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadRevenuePanel(force) {
  revSetLabel(revRangeLabel());
  if (revState.tab === 'overview') rvLoadOverview(force);
  else if (revState.tab === 'earnings') rvLoadEarnings(force);
  else if (revState.tab === 'refunds') rvLoadRefunds(force ? 1 : revState.refunds.page, force);
  else if (revState.tab === 'settings') rvLoadSettings(force);
}

function rvSwitchTab(tab, btn) {
  if (RV_PANES.indexOf(tab) < 0) return;
  revState.tab = tab;
  var wrap = btn && btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('.drv-tab').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
  }
  RV_PANES.forEach(function(t) {
    var el = document.getElementById('rv-pane-' + t);
    if (el) el.classList.toggle('on', t === tab);
  });
  loadRevenuePanel(false);
}

function rvSetPaneState(pane, state, message) {
  var loading = document.getElementById('rv-' + pane + '-loading');
  var error = document.getElementById('rv-' + pane + '-error');
  var content = document.getElementById('rv-' + pane + '-content');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    var msg = document.getElementById('rv-' + pane + '-error-msg');
    if (msg && state === 'error') msg.textContent = message || 'Something went wrong';
  }
  if (content) content.style.display = state === 'ready' ? '' : 'none';
}

// â”€â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function rvLoadOverview(force) {
  var key = revRangeKey();
  if (!force && revState.summary && revState.series && revState.overviewKey === key) return;
  if (revState.overviewLoading) return;
  revState.overviewLoading = true;
  rvSetPaneState('ov', 'loading');
  try {
    var r = await Promise.all([
      api('GET', '/reports/summary?' + key),
      api('GET', '/reports/timeseries?' + key)
    ]);
    revState.summary = r[0].data;
    revState.series = r[1].data;
    revState.overviewKey = key;
    rvRenderOverview();
    rvSetPaneState('ov', 'ready');
  } catch (e) {
    rvSetPaneState('ov', 'error', 'Failed to load revenue data: ' + e.message);
  } finally {
    revState.overviewLoading = false;
  }
}

function rvSetText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function rvRenderOverview() {
  var d = revState.summary;
  var t = revState.series;
  if (!d || !t) return;

  if (d.range) revSetLabel(d.range.from + ' â†’ ' + d.range.to);

  rvSetText('rv-kpi-revenue', fmtNaira(d.revenue.total));
  rvSetText('rv-kpi-gmv', fmtNaira(d.gmv.total));
  rvSetText('rv-kpi-rides', fmtNaira(d.gmv.rides));
  rvSetText('rv-kpi-food', fmtNaira(d.gmv.food));
  rvSetText('rv-kpi-deposits', fmtNaira(d.cash.deposits));
  rvSetText('rv-kpi-users', fmtNum(d.users.newInRange));

  // Revenue by source
  var srcEl = document.getElementById('rv-source-list');
  if (srcEl) {
    var parts = [
      { label: 'Ride commission', v: d.revenue.rideCommission },
      { label: 'Food platform fees', v: d.revenue.foodFees },
      { label: 'Hotel service fees', v: d.revenue.hotelServiceFee }
    ];
    var total = Number(d.revenue.total) || parts.reduce(function(a, p) { return a + (Number(p.v) || 0); }, 0);
    if (!total) {
      srcEl.innerHTML = '<div class="rv-source-empty">No platform revenue in this range.</div>';
    } else {
      srcEl.innerHTML = parts.map(function(p) {
        var v = Number(p.v) || 0;
        var pct = total > 0 ? Math.round((v / total) * 100) : 0;
        return '<div class="rv-source-row">' +
          '<div class="rv-source-name">' + esc(p.label) + '</div>' +
          '<div class="rv-source-bar"><div class="rv-source-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="rv-source-val">' + fmtNaira(v) + ' Â· ' + pct + '%</div>' +
        '</div>';
      }).join('');
    }
  }

  var granHint = t.granularity === 'hour' ? 'Hourly buckets' : (t.granularity === 'week' ? 'Weekly buckets' : 'Daily buckets');
  var hint = document.getElementById('rv-trend-hint');
  if (hint) hint.textContent = granHint;

  if (typeof Chart === 'undefined') {
    if (hint) hint.textContent = 'Charts unavailable â€” Chart.js CDN could not load';
    return;
  }

  var labels = t.labels || [];
  var s = t.series || {};
  var gmvTotals = labels.map(function(_, i) {
    return (Number(s.gmv.rides[i]) || 0) + (Number(s.gmv.food[i]) || 0) + (Number(s.gmv.hotels[i]) || 0);
  });

  revEnsureChartDefaults();

  revMakeChart('rv-chart-trend', {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Platform Revenue', data: s.revenue.platform || [], borderColor: '#E88A3A', backgroundColor: 'rgba(232,138,58,.12)', fill: true, tension: .3, pointRadius: labels.length > 40 ? 0 : 2, borderWidth: 2 },
        { label: 'GMV', data: gmvTotals, borderColor: '#3b82f6', backgroundColor: 'transparent', tension: .3, pointRadius: labels.length > 40 ? 0 : 2, borderWidth: 2 }
      ]
    },
    options: revChartOpts(true)
  });

  revMakeChart('rv-chart-orders', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Rides', data: s.orders.rides || [], backgroundColor: '#E88A3A' },
        { label: 'Food', data: s.orders.food || [], backgroundColor: '#3b82f6' },
        { label: 'Hotels', data: s.orders.hotels || [], backgroundColor: '#9b59b6' }
      ]
    },
    options: revChartOpts(false)
  });

  revMakeChart('rv-chart-signups', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'New users', data: s.users || [], backgroundColor: '#2ecc71' }]
    },
    options: revChartOpts(false)
  });

  revMakeChart('rv-chart-deposits', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Deposits', data: s.deposits || [], backgroundColor: '#2ecc71' },
        { label: 'Refunds', data: s.refunds || [], backgroundColor: '#e74c3c' }
      ]
    },
    options: revChartOpts(true)
  });
}

function revEnsureChartDefaults() {
  if (revChartDefaults) return;
  revChartDefaults = true;
  Chart.defaults.color = '#9999ad';
  Chart.defaults.font.family = "Inter, sans-serif";
  Chart.defaults.font.size = 11;
}

function revChartOpts(isMoney) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 14 } },
      tooltip: {
        backgroundColor: '#1e1e2a',
        borderColor: '#2a2a3a',
        borderWidth: 1,
        padding: 10,
        callbacks: isMoney ? {
          label: function(ctx) {
            return ' ' + ctx.dataset.label + ': ' + fmtNaira(ctx.parsed.y);
          }
        } : {}
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(42,42,58,.5)' },
        ticks: { maxTicksLimit: 12, maxRotation: 0 }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(42,42,58,.5)' },
        ticks: isMoney ? {
          callback: function(v) { return 'â‚¦' + Number(v).toLocaleString(); }
        } : {}
      }
    }
  };
}

function revMakeChart(id, config) {
  var canvas = document.getElementById(id);
  if (!canvas) return;
  if (revCharts[id]) {
    revCharts[id].destroy();
    delete revCharts[id];
  }
  try {
    revCharts[id] = new Chart(canvas.getContext('2d'), config);
  } catch (e) {
    console.warn('[Revenue] chart failed:', id, e.message);
  }
}

// â”€â”€â”€ Earnings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function rvLoadEarnings(force) {
  var key = revRangeKey();
  if (!force && revState.earnings && revState.earningsKey === key) return;
  if (revState.earningsLoading) return;
  revState.earningsLoading = true;
  rvSetPaneState('earn', 'loading');
  try {
    var res = await api('GET', '/reports/earnings?' + key);
    revState.earnings = res.data;
    revState.earningsKey = key;
    rvRenderEarnings();
    rvSetPaneState('earn', 'ready');
  } catch (e) {
    rvSetPaneState('earn', 'error', 'Failed to load earnings report: ' + e.message);
  } finally {
    revState.earningsLoading = false;
  }
}

function rvRenderEarnings() {
  var d = revState.earnings;
  if (!d) return;

  var statusMap = {
    ok: { cls: 'tag-avail', label: 'Reconciled', title: 'Ledger and wallet float match' },
    warning: { cls: 'tag-pending', label: 'Warnings', title: 'Reconciliation completed with warnings' },
    error: { cls: 'tag-no', label: 'Mismatch', title: 'Ledger and wallet float do not match' }
  };
  var st = statusMap[d.status] || statusMap.ok;
  rvSetText('rv-earn-status-title', st.title);
  rvSetText('rv-earn-status-sub', d.range ? d.range.from + ' â†’ ' + d.range.to : '');
  var tag = document.getElementById('rv-earn-status-tag');
  if (tag) {
    tag.className = 'tag ' + st.cls;
    tag.textContent = st.label;
  }
  var banner = document.getElementById('rv-earn-banner');
  if (banner) banner.className = 'rv-banner rv-banner-' + (d.status || 'ok');

  var checksEl = document.getElementById('rv-earn-checks');
  if (checksEl) {
    checksEl.innerHTML = (d.checks || []).map(function(c) {
      var sev = c.severity || 'info';
      var sevCls = sev === 'error' ? 'tag-no' : (sev === 'warning' ? 'tag-pending' : 'tag-feat');
      return '<div class="rv-check ' + (c.ok ? 'ok' : 'bad') + '">' +
        '<span class="rv-check-dot"></span>' +
        '<span class="rv-check-msg">' + esc(c.message) + '</span>' +
        '<span class="tag ' + sevCls + '">' + esc(sev) + '</span>' +
      '</div>';
    }).join('');
  }

  rvSetText('rv-earn-rev-range', fmtNaira(d.revenue.range));
  rvSetText('rv-earn-rev-total', fmtNaira(d.revenue.allTime));
  rvSetText('rv-earn-cash', fmtNaira(d.integrity.walletFloat));
  var recon = document.getElementById('rv-earn-recon');
  if (recon) {
    if (d.integrity.balanced) {
      recon.textContent = 'Balanced';
      recon.className = 'rv-kv-value rv-kv-ok';
    } else {
      recon.textContent = 'Î” ' + fmtNaira(Math.abs(d.integrity.delta));
      recon.className = 'rv-kv-value rv-kv-bad';
    }
  }

  var note = '';
  if (d.note) note = d.note;
  if (d.pendingTopups && d.pendingTopups.count) {
    note += (note ? ' Â· ' : '') + 'Pending top-ups: ' + fmtNum(d.pendingTopups.count) + ' (' + fmtNaira(d.pendingTopups.amount) + ')';
    if (d.pendingTopups.staleCount) {
      note += ', ' + fmtNum(d.pendingTopups.staleCount) + ' older than 24h';
    }
  }
  rvSetText('rv-earn-note', note);
}

// â”€â”€â”€ Reports / export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rvSetFmt(fmt, btn) {
  revState.fmt = fmt;
  var wrap = document.getElementById('rv-fmt-group');
  if (wrap) {
    wrap.querySelectorAll('.rv-fmt').forEach(function(b) {
      b.classList.toggle('on', b.getAttribute('data-fmt') === fmt);
    });
  }
}

async function rvExport() {
  if (revState.exporting) return;
  var reportEl = document.getElementById('rv-report-type');
  var report = reportEl ? reportEl.value : 'revenue';
  var statusEl = document.getElementById('rv-export-status');
  var btn = document.getElementById('rv-export-btn');
  revState.exporting = true;
  if (btn) btn.disabled = true;
  if (statusEl) {
    statusEl.textContent = 'Generatingâ€¦';
    statusEl.className = 'rv-export-status';
  }
  try {
    var info = await apiDownload(
      '/reports/export?report=' + encodeURIComponent(report) + '&format=' + revState.fmt + '&' + revRangeKey(),
      'eb-' + report + '.' + revState.fmt
    );
    if (statusEl) {
      statusEl.textContent = 'Downloaded ' + info.filename +
        (info.rows ? ' Â· ' + Number(info.rows).toLocaleString() + ' rows' : '') +
        (info.truncated ? ' Â· truncated to 50,000 rows' : '');
      statusEl.className = 'rv-export-status ok';
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = 'Failed: ' + e.message;
      statusEl.className = 'rv-export-status err';
    }
  } finally {
    revState.exporting = false;
    if (btn) btn.disabled = false;
  }
}

// â”€â”€â”€ Refunds list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function rvLoadRefunds(page, force) {
  var l = revState.refunds;
  if (l.loading) return;
  page = Math.max(1, parseInt(page) || 1);
  l.loading = true;
  var loading = document.getElementById('rv-rf-loading');
  if (loading) loading.style.display = '';
  try {
    var params = ['page=' + page, 'limit=20'];
    var typeEl = document.getElementById('rv-rf-type');
    var qEl = document.getElementById('rv-rf-search');
    if (typeEl && typeEl.value) params.push('type=' + encodeURIComponent(typeEl.value));
    if (qEl && qEl.value.trim()) params.push('q=' + encodeURIComponent(qEl.value.trim()));
    var dates = revRangeDates();
    if (dates.from) params.push('from=' + dates.from);
    if (dates.to) params.push('to=' + dates.to);

    var res = await api('GET', '/refunds?' + params.join('&'));
    l.page = page;
    l.pagination = res.pagination || null;
    l.loaded = true;
    rvRenderRefunds(res.data.refunds || []);
  } catch (e) {
    var body = document.getElementById('rv-refunds-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="7" class="rv-cell-err">' + esc('Failed to load refunds: ' + e.message) + '</td></tr>';
    }
    var empty = document.getElementById('rv-refunds-empty');
    if (empty) empty.style.display = 'none';
    var pgEl = document.getElementById('rv-refunds-pagination');
    if (pgEl) pgEl.style.display = 'none';
  } finally {
    l.loading = false;
    if (loading) loading.style.display = 'none';
  }
}

function rvRenderRefunds(rows) {
  var body = document.getElementById('rv-refunds-body');
  var empty = document.getElementById('rv-refunds-empty');
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '';
    if (empty) empty.style.display = '';
    rvRenderRefundsPagination();
    return;
  }
  if (empty) empty.style.display = 'none';

  var typeLabel = { ride: 'Ride', food: 'Food', hotel: 'Hotel' };
  body.innerHTML = rows.map(function(r) {
    var status = String(r.status || '').toLowerCase();
    var statusCls = status === 'completed' ? 'tag-confirmed' : (status === 'failed' ? 'tag-cancelled' : 'tag-pending');
    var amountCell = fmtNaira(r.amount);
    if (r.original_amount != null && Number(r.original_amount) !== Number(r.amount)) {
      amountCell += '<div class="rv-cell-sub">of ' + fmtNaira(r.original_amount) + '</div>';
    }
    return '<tr>' +
      '<td class="rv-cell-mono">' + esc(r.refund_id || '') + '</td>' +
      '<td>' + esc(r.order_reference || '') +
        (r.user_name ? '<div class="rv-cell-sub">' + esc(r.user_name) + '</div>' : '') + '</td>' +
      '<td><span class="tag tag-feat">' + esc(typeLabel[r.order_type] || r.order_type || '') + '</span></td>' +
      '<td>' + amountCell + '</td>' +
      '<td class="rv-cell-reason">' + esc(r.reason || '') + '</td>' +
      '<td><span class="tag ' + statusCls + '">' + esc(r.status || '') + '</span></td>' +
      '<td>' + esc(r.refunded_at ? fmtDate(r.refunded_at) : '') + '</td>' +
    '</tr>';
  }).join('');

  rvRenderRefundsPagination();
}

function rvRenderRefundsPagination() {
  var el = document.getElementById('rv-refunds-pagination');
  if (!el) return;
  var pg = revState.refunds.pagination;
  if (!pg || !pg.totalPages || pg.totalPages <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML =
    '<button class="btn btn-ghost btn-sm" ' + (pg.page <= 1 ? 'disabled' : '') + ' onclick="rvLoadRefunds(' + (pg.page - 1) + ')">Prev</button>' +
    '<span class="um-page-info">Page ' + pg.page + ' of ' + pg.totalPages + ' Â· ' + fmtNum(pg.total) + ' refunds</span>' +
    '<button class="btn btn-ghost btn-sm" ' + (pg.page >= pg.totalPages ? 'disabled' : '') + ' onclick="rvLoadRefunds(' + (pg.page + 1) + ')">Next</button>';
}

// â”€â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function rvLoadSettings(force) {
  if (!force && revState.settings) {
    rvFillSettings();
    rvSetPaneState('set', 'ready');
    return;
  }
  if (revState.settingsLoading) return;
  revState.settingsLoading = true;
  rvSetPaneState('set', 'loading');
  try {
    var res = await api('GET', '/settings/fees');
    revState.settings = res.data.values;
    revState.settingsDefaults = res.data.defaults;
    rvFillSettings();
    rvSetPaneState('set', 'ready');
  } catch (e) {
    rvSetPaneState('set', 'error', 'Failed to load fee settings: ' + e.message);
  } finally {
    revState.settingsLoading = false;
  }
}

function rvFillSettings() {
  var values = revState.settings || {};
  var inputs = document.querySelectorAll('#rv-pane-settings input[data-key]');
  inputs.forEach(function(inp) {
    var key = inp.getAttribute('data-key');
    if (values[key] !== undefined && values[key] !== null) inp.value = values[key];
  });
  var canEdit = revIsFinance();
  var save = document.getElementById('rv-set-save');
  if (save) save.disabled = !canEdit;
  var note = document.getElementById('rv-set-role-note');
  if (note) note.style.display = canEdit ? 'none' : '';
}

async function rvSaveSettings() {
  if (revState.settingsSaving) return;
  if (!revIsFinance()) {
    var s0 = document.getElementById('rv-set-status');
    if (s0) { s0.textContent = 'Your role cannot change platform fees'; s0.className = 'rv-export-status err'; }
    return;
  }
  var statusEl = document.getElementById('rv-set-status');
  var btn = document.getElementById('rv-set-save');
  var patch = {};
  var bad = null;
  document.querySelectorAll('#rv-pane-settings input[data-key]').forEach(function(inp) {
    var raw = String(inp.value).trim();
    var v = Number(raw);
    if (raw === '' || !isFinite(v) || v < 0) { if (!bad) bad = inp; return; }
    patch[inp.getAttribute('data-key')] = v;
  });
  if (bad) {
    if (statusEl) { statusEl.textContent = 'Please enter valid numbers in every field'; statusEl.className = 'rv-export-status err'; }
    bad.focus();
    return;
  }
  revState.settingsSaving = true;
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Savingâ€¦'; statusEl.className = 'rv-export-status'; }
  try {
    var res = await api('PUT', '/settings/fees', patch);
    revState.settings = res.data.values;
    rvFillSettings();
    if (statusEl) { statusEl.textContent = 'Saved âœ“ (applies to future transactions)'; statusEl.className = 'rv-export-status ok'; }
    toast('Fee settings updated');
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.className = 'rv-export-status err'; }
  } finally {
    revState.settingsSaving = false;
    if (btn) btn.disabled = !revIsFinance();
  }
}

// â”€â”€â”€ Refund actions inside ride / order / hotel modals â”€â”€

function refundActionsHtml(type, reference, opts) {
  opts = opts || {};
  var ref = String(reference || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!ref) return '';
  var paid = String(opts.paymentStatus || '').toLowerCase();
  var done = paid === 'refunded';
  var btn = done
    ? '<button type="button" class="btn btn-ghost btn-sm" disabled>Already Refunded</button>'
    : '<button type="button" class="btn btn-red btn-sm" onclick="openRefundModal(\'' + type + '\',\'' + ref + '\')">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
      'Issue Refund</button>';
  var hint = done
    ? 'This payment has already been refunded to the customer wallet.'
    : 'Returns the paid amount to the customerâ€™s wallet from the platform float.';
  return '<div class="order-detail-section rf-actions">' +
    '<div class="order-detail-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Refund</div>' +
    '<div class="order-actions">' + btn +
      '<div class="order-actions-hint">' + esc(hint) + '</div>' +
    '</div>' +
  '</div>';
}

function openRefundModal(type, reference) {
  type = String(type || '').toLowerCase();
  reference = String(reference || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!reference) return;
  revRefund = { type: type, reference: reference, preview: null, token: {} };

  var modal = document.getElementById('refundModal');
  if (modal) modal.classList.add('on');

  var summary = document.getElementById('rf-summary');
  if (summary) summary.innerHTML = '<div class="rv-loading-row">Checking refund eligibilityâ€¦</div>';
  var amount = document.getElementById('rf-amount');
  if (amount) { amount.value = ''; amount.disabled = true; amount.max = ''; amount.placeholder = 'Full refundable amount'; }
  var reason = document.getElementById('rf-reason');
  if (reason) reason.value = '';
  var err = document.getElementById('rf-err');
  if (err) err.textContent = '';
  var desc = document.getElementById('rf-desc');
  if (desc) desc.textContent = 'Refund the ' + type + ' payment for ' + reference + ' back to the customerâ€™s wallet.';
  var confirm = document.getElementById('rf-confirm');
  var label = document.getElementById('rf-confirm-label');
  if (confirm) confirm.disabled = true;
  if (label) label.textContent = 'Loadingâ€¦';

  var token = revRefund.token;
  api('GET', '/refunds/preview?type=' + encodeURIComponent(type) + '&reference=' + encodeURIComponent(reference))
    .then(function(res) {
      if (!revRefund || revRefund.token !== token) return;
      revRefund.preview = res.data;
      rvRenderRefundPreview(res.data);
    })
    .catch(function(e) {
      if (!revRefund || revRefund.token !== token) return;
      rvRefundSummaryError(e.message);
    });
}

function rvRefundSummaryError(message) {
  var summary = document.getElementById('rf-summary');
  if (summary) summary.innerHTML = '<div class="rf-preview-bad">' + esc(message) + '</div>';
  var confirm = document.getElementById('rf-confirm');
  var label = document.getElementById('rf-confirm-label');
  if (confirm) confirm.disabled = true;
  if (label) label.textContent = 'Confirm Refund';
}

function rvRenderRefundPreview(d) {
  var summary = document.getElementById('rf-summary');
  var amount = document.getElementById('rf-amount');
  var confirm = document.getElementById('rf-confirm');
  var label = document.getElementById('rf-confirm-label');

  function row(k, v, cls) {
    return '<div class="rf-preview-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(k) + '</span><strong>' + v + '</strong></div>';
  }

  var html = '';
  if (d.user) html += row('Customer', esc(d.user.name || d.user.email || d.user.id || 'â€”'));
  if (d.status) html += row('Status', esc(d.status));
  html += row('Amount paid', fmtNaira(d.originalAmount));
  if (d.alreadyRefunded > 0) html += row('Already refunded', fmtNaira(d.alreadyRefunded));
  if (d.walletBalance !== null && d.walletBalance !== undefined) html += row('Wallet balance', fmtNaira(d.walletBalance));

  if (!d.refundable) {
    html += '<div class="rf-preview-bad">' + esc(d.notRefundableReason || 'This payment is not refundable.') + '</div>';
    if (d.previousRefund) {
      html += '<div class="rf-preview-row"><span>Previous refund</span><strong>' + fmtNaira(d.previousRefund.amount) + '</strong></div>';
    }
    if (summary) summary.innerHTML = html;
    if (amount) amount.disabled = true;
    if (confirm) confirm.disabled = true;
    if (label) label.textContent = 'Confirm Refund';
    return;
  }

  html += row('Refundable amount', fmtNaira(d.refundableAmount), 'rf-preview-strong');
  if (summary) summary.innerHTML = html;

  if (amount) {
    amount.disabled = false;
    amount.max = String(d.refundableAmount);
    amount.placeholder = String(d.refundableAmount);
  }
  if (confirm) confirm.disabled = !revIsFinance();
  if (label) label.textContent = 'Confirm Refund';
  if (!revIsFinance()) {
    var err = document.getElementById('rf-err');
    if (err) err.textContent = 'Your admin role is not authorized to issue refunds.';
  }
}

function closeRefundModal() {
  var modal = document.getElementById('refundModal');
  if (modal) modal.classList.remove('on');
  revRefund = null;
}

async function submitRefund() {
  if (!revRefund || !revRefund.preview) return;
  var reasonEl = document.getElementById('rf-reason');
  var amountEl = document.getElementById('rf-amount');
  var err = document.getElementById('rf-err');
  var confirm = document.getElementById('rf-confirm');
  var label = document.getElementById('rf-confirm-label');

  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (reason.length < 3) {
    if (err) err.textContent = 'A refund reason (at least 3 characters) is required.';
    if (reasonEl) reasonEl.focus();
    return;
  }
  var amountRaw = amountEl ? String(amountEl.value).trim() : '';
  var amount = null;
  if (amountRaw !== '') {
    amount = Number(amountRaw);
    if (!isFinite(amount) || amount <= 0) {
      if (err) err.textContent = 'Amount must be a positive number.';
      if (amountEl) amountEl.focus();
      return;
    }
    if (amount > Number(amountEl.max || amount)) {
      if (err) err.textContent = 'Amount cannot exceed ' + fmtNaira(amountEl.max) + '.';
      return;
    }
  }
  if (err) err.textContent = '';

  var ctx = revRefund;
  if (confirm) confirm.disabled = true;
  if (amountEl) amountEl.disabled = true;
  if (reasonEl) reasonEl.disabled = true;
  if (label) label.textContent = 'Processingâ€¦';

  try {
    var body = { type: ctx.type, reference: ctx.reference, reason: reason };
    if (amount !== null) body.amount = amount;
    var res = await api('POST', '/refunds', body);
    var paid = res.data && res.data.refund && res.data.refund.amount ? res.data.refund.amount : amount;
    toast('Refund issued' + (paid ? ' â€” ' + fmtNaira(paid) : ''));
    closeRefundModal();
    revRefreshAfterRefund(ctx.type);
    if (revState.refunds.loaded) rvLoadRefunds(revState.refunds.page, true);
  } catch (e) {
    if (err) err.textContent = e.message;
    if (confirm) confirm.disabled = false;
  } finally {
    if (amountEl) amountEl.disabled = false;
    if (reasonEl) reasonEl.disabled = false;
    if (label) label.textContent = 'Confirm Refund';
  }
}

function revRefreshAfterRefund(type) {
  try {
    if (type === 'ride' && typeof rdActiveRideId !== 'undefined' && rdActiveRideId !== null && typeof openRideModal === 'function') {
      openRideModal(rdActiveRideId);
    } else if (type === 'food' && typeof orderModalActiveId !== 'undefined' && orderModalActiveId !== null && typeof openOrderModal === 'function') {
      openOrderModal(orderModalActiveId);
    } else if (type === 'hotel' && typeof hbActiveBooking !== 'undefined' && hbActiveBooking && typeof reloadHotelBookingDetails === 'function') {
      reloadHotelBookingDetails();
    }
  } catch (e) {
    console.warn('[Revenue] modal refresh after refund failed:', e.message);
  }
}
