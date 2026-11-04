/**
 * DASHBOARD ADMIN & KONTROL APLIKASI
 * Mengatur pemilihan depot/armada/TPS, pembuatan rute, KPI, itinerary, dan peta.
 */
(function () {
  const { esc } = SW.ui;

  const state = {
    selectedTpsIds: [],
    currentTab: 'admin'
  };

  const $ = (id) => document.getElementById(id);

  function fmtDuration(minutes) {
    if (!minutes && minutes !== 0) return '-';
    if (minutes < 60) return `${minutes} mnt`;
    const h = Math.floor(minutes / 60);
    const m = String(minutes % 60).padStart(2, '0');
    return `${h} j ${m} mnt`;
  }

  /* ---------- Master data ---------- */
  function renderSelectors() {
    $('depotSelect').innerHTML = SW.store.getDepots()
      .map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    $('vehicleSelect').innerHTML = SW.store.getVehicles()
      .map((v) => `<option value="${esc(v.id)}">${esc(v.vehicle_code)} · ${esc(v.plate_number)} (kapasitas ${v.capacity} kg)</option>`).join('');
  }

  function statusText(status) {
    return status === 'completed' ? 'Selesai' : 'Terjadwal';
  }

  function renderTpsChecklist() {
    const list = SW.store.getTps();
    $('tpsChecklist').innerHTML = list.map((t) => {
      const done = t.status === 'completed';
      const checked = !done && state.selectedTpsIds.includes(t.id);
      return `
        <label class="tps-item ${done ? 'is-done' : ''}">
          <span class="tps-main">
            <input type="checkbox" class="tps-checkbox" value="${esc(t.id)}" ${checked ? 'checked' : ''} ${done ? 'disabled' : ''}>
            <span>
              <span class="tps-name">${esc(t.name)}</span>
              <span class="tps-meta">Status: <span class="${done ? 'text-green' : 'text-amber'}">${statusText(t.status)}</span></span>
            </span>
          </span>
          <span class="badge ${done ? 'badge-green' : 'badge-amber'}">${t.estimated_volume} kg</span>
        </label>`;
    }).join('');
    updateSelectedVolume();
  }

  function updateSelectedVolume() {
    const total = SW.store.getTps()
      .filter((t) => state.selectedTpsIds.includes(t.id) && t.status !== 'completed')
      .reduce((s, t) => s + t.estimated_volume, 0);
    $('totalSelectedVolume').textContent = `${total} kg`;
    $('selectedCount').textContent = String(state.selectedTpsIds.filter((id) => {
      const t = SW.store.getTpsById(id); return t && t.status !== 'completed';
    }).length);
  }

  function selectAllAvailable() {
    state.selectedTpsIds = SW.store.getTps().filter((t) => t.status !== 'completed').map((t) => t.id);
  }

  /* ---------- KPI & itinerary ---------- */
  function sourceNote(isEstimate) {
    return isEstimate
      ? { text: '≈ Estimasi garis lurus (OSRM tidak terjangkau)', cls: 'text-amber' }
      : { text: '✓ Berbasis jaringan jalan nyata (OSRM)', cls: 'text-green' };
  }

  function resetKpis() {
    $('kpiDistance').textContent = '- km';
    $('kpiDuration').textContent = '-';
    $('kpiEfficiency').textContent = '0%';
    $('kpiTotalWaste').textContent = '- kg';
    const vehicle = SW.store.getVehicleById($('vehicleSelect').value);
    $('kpiWasteNote').textContent = vehicle ? `Kapasitas armada: ${vehicle.capacity} kg` : '';
    const note = $('kpiDistanceNote');
    note.textContent = 'Menunggu rute dibuat';
    note.className = 'kpi-note text-muted';
  }

  function renderKpis() {
    const d = SW.engine.getRouteDetails();
    if (!d) { resetKpis(); return; }
    const r = d.route;
    $('kpiDistance').textContent = `${(r.total_distance / 1000).toFixed(2)} km`;
    $('kpiDuration').textContent = fmtDuration(Math.round(r.total_duration / 60));
    $('kpiEfficiency').textContent = r.tsp_gain || '0%';
    $('kpiTotalWaste').textContent = `${r.total_volume} kg`;
    $('kpiWasteNote').textContent = `Kapasitas armada ${d.vehicle.capacity} kg · ≈ ${r.estimated_trips} rit`;
    const n = sourceNote(r.is_estimate);
    const el = $('kpiDistanceNote');
    el.textContent = n.text;
    el.className = 'kpi-note ' + n.cls;
  }

  function renderTimeline() {
    const box = $('routeTimeline');
    const d = SW.engine.getRouteDetails();
    if (!d) {
      box.innerHTML = '<p class="empty">Belum ada rute aktif. Tekan “Buat Rute Optimal” untuk memulai.</p>';
      return;
    }
    const trips = SW.engine.planTrips(d.points.map((p) => p.estimated_volume), d.vehicle.capacity);
    let html = `<ol class="timeline">
      <li class="tl-item"><span class="tl-dot tl-depot">D</span>
        <div class="tl-title text-blue">Titik awal: ${esc(d.depot.name)}</div>
        <div class="tl-sub">Armada berangkat dengan muatan 0 kg</div></li>`;
    d.points.forEach((p, i) => {
      const done = p.status === 'completed';
      html += `<li class="tl-item ${done ? 'is-done' : ''}">
        <span class="tl-dot ${done ? 'tl-done' : 'tl-stop'}">${done ? '✓' : p.sequence}</span>
        <div class="tl-row"><span class="tl-title">${esc(p.name)}</span><span class="tl-vol">+${p.estimated_volume} kg</span></div>
        <div class="tl-sub">Rit ${trips[i]} · ${done ? 'selesai dilayani' : 'menunggu'}</div></li>`;
    });
    html += `<li class="tl-item"><span class="tl-dot tl-depot">D</span>
        <div class="tl-title text-blue">Titik akhir: kembali ke ${esc(d.depot.name)}</div>
        <div class="tl-sub">Bongkar muatan di TPA</div></li></ol>`;
    box.innerHTML = html;
  }

  /* ---------- Peta ---------- */
  function syncMap() {
    const d = SW.engine.getRouteDetails();
    const depot = d ? d.depot : SW.store.getDepotById($('depotSelect').value);
    SW.map.renderMarkers(depot, SW.store.getTps(), d ? d.points : []);
  }

  /* ---------- Aksi ---------- */
  async function handleGenerate() {
    const btn = $('btnGenerateRoute');
    const original = btn.innerHTML;
    const ids = state.selectedTpsIds.filter((id) => { const t = SW.store.getTpsById(id); return t && t.status !== 'completed'; });
    if (!ids.length) { SW.ui.toast('Pilih minimal 1 TPS yang belum selesai.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spin" aria-hidden="true">⚙️</span> Menghitung rute…';
    try {
      const result = await SW.engine.generateRoute({
        vehicleId: $('vehicleSelect').value,
        depotId: $('depotSelect').value,
        tpsIds: ids
      });
      SW.map.drawRoute(result.geometry);
      syncMap();
      renderKpis();
      renderTimeline();
      renderTpsChecklist();
      document.dispatchEvent(new CustomEvent('sw:route-changed'));
      SW.ui.toast(
        result.summary.isEstimate
          ? 'Rute dibuat memakai estimasi jarak (OSRM tidak terjangkau).'
          : `Rute optimal dibuat: ${result.summary.totalDistanceKm} km, ${result.summary.totalTpsCount} TPS.`,
        result.summary.isEstimate ? 'warn' : 'success'
      );
    } catch (err) {
      SW.ui.toast('Gagal membuat rute: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  async function handleReset() {
    const ok = await SW.ui.confirm('Reset simulasi?', 'Seluruh rute, muatan, dan status TPS akan dikembalikan ke kondisi awal.', 'Ya, reset');
    if (!ok) return;
    SW.store.reset();
    SW.map.clearRoute();
    selectAllAvailable();
    renderSelectors();
    renderTpsChecklist();
    renderKpis();
    renderTimeline();
    syncMap();
    document.dispatchEvent(new CustomEvent('sw:route-changed'));
    SW.ui.toast('Simulasi dikembalikan ke kondisi awal.', 'success');
  }

  function switchTab(tab) {
    state.currentTab = tab;
    const isAdmin = tab === 'admin';
    $('adminView').hidden = !isAdmin;
    $('driverView').hidden = isAdmin;
    $('tabAdmin').setAttribute('aria-selected', String(isAdmin));
    $('tabDriver').setAttribute('aria-selected', String(!isAdmin));
    if (isAdmin) {
      renderTpsChecklist();
      renderKpis();
      renderTimeline();
      syncMap();
      SW.map.refresh();
    } else {
      document.dispatchEvent(new CustomEvent('sw:driver-opened'));
    }
    window.scrollTo({ top: 0 });
  }

  function bindEvents() {
    $('tpsChecklist').addEventListener('change', (e) => {
      if (!e.target.classList.contains('tps-checkbox')) return;
      const id = e.target.value;
      if (e.target.checked) { if (!state.selectedTpsIds.includes(id)) state.selectedTpsIds.push(id); }
      else state.selectedTpsIds = state.selectedTpsIds.filter((i) => i !== id);
      updateSelectedVolume();
    });
    $('btnSelectAll').addEventListener('click', () => { selectAllAvailable(); renderTpsChecklist(); });
    $('btnDeselectAll').addEventListener('click', () => { state.selectedTpsIds = []; renderTpsChecklist(); });
    $('btnGenerateRoute').addEventListener('click', handleGenerate);
    $('btnReset').addEventListener('click', handleReset);
    $('tabAdmin').addEventListener('click', () => switchTab('admin'));
    $('tabDriver').addEventListener('click', () => switchTab('driver'));
    $('vehicleSelect').addEventListener('change', () => { if (!SW.store.getRoute()) resetKpis(); });
  }

  async function restoreActiveRoute() {
    const d = SW.engine.getRouteDetails();
    if (!d || d.route.status === 'completed') return;
    try {
      const geometry = await SW.engine.getActiveGeometry();
      if (geometry) SW.map.drawRoute(geometry);
    } catch (e) { /* peta tetap tampil tanpa garis */ }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    SW.map.init('map');
    selectAllAvailable();
    renderSelectors();
    renderTpsChecklist();
    renderKpis();
    renderTimeline();
    syncMap();
    bindEvents();
    await restoreActiveRoute();
  });

  SW.app = { state, switchTab, syncMap, renderKpis, renderTimeline, renderTpsChecklist };
})();
