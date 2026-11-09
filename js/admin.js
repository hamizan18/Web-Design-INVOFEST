/**
 * DASHBOARD ADMIN & KONTROL APLIKASI
 * Mengatur pemilihan depot/truk/TPS, pembuatan rute per truk, KPI, itinerary, dan peta.
 */
(function () {
  const { esc } = SW.ui;
  const T = SW.time;

  const state = {
    selectedTpsIds: [],
    currentTab: 'admin'
  };

  const $ = (id) => document.getElementById(id);
  const vid = () => $('vehicleSelect').value;
  let drawToken = 0;

  /* ---------- Pilihan depot & armada ---------- */
  function renderSelectors() {
    $('depotSelect').innerHTML = SW.store.getDepots()
      .map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    renderVehicleSelect();
  }

  function renderVehicleSelect() {
    const keep = $('vehicleSelect').value;
    const vs = SW.store.getVehicles();
    $('vehicleSelect').innerHTML = vs.map((v) => `
      <option value="${esc(v.id)}" ${v.active === false ? 'disabled' : ''}>
        ${esc(v.vehicle_code)} · Shift ${esc(v.shift.name)} ${esc(v.shift.start)}–${esc(v.shift.end)}${v.active === false ? ' (nonaktif)' : ''}
      </option>`).join('');
    const stillOk = vs.find((v) => v.id === keep && v.active !== false);
    const first = vs.find((v) => v.active !== false);
    $('vehicleSelect').value = stillOk ? keep : (first ? first.id : '');
  }

  function renderShiftInfo() {
    const el = $('shiftInfo');
    const v = SW.store.getVehicleById(vid());
    if (!v) { el.innerHTML = '<p class="muted small">Tidak ada armada aktif. Aktifkan minimal satu truk di tab Jadwal Shift.</p>'; return; }
    const st = T.shiftState(v);
    const d = SW.engine.getRouteDetails(v.id);
    let finish = '';
    if (d && d.route.status !== 'completed') {
      const r = d.route;
      finish = r.over_shift
        ? `<p class="tiny text-red">⚠ Perkiraan selesai ${T.fmt(r.finish_min)}, melewati akhir shift (${esc(v.shift.end)}). Kurangi TPS atau perpanjang shift.</p>`
        : `<p class="tiny text-green">✓ Perkiraan selesai ${T.fmt(r.finish_min)}, masih dalam shift.</p>`;
    }
    el.innerHTML = `
      <div class="row-between">
        <span class="strong small">Shift ${esc(v.shift.name)} · ${esc(v.shift.start)}–${esc(v.shift.end)}</span>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      <p class="muted tiny">Kapasitas ${v.capacity} kg · Plat ${esc(v.plate_number)}</p>${finish}`;
  }

  /* ---------- Daftar TPS ---------- */
  function availableForCurrent() {
    const assigned = SW.store.getAssignments();
    const v = vid();
    return SW.store.getTps().filter((t) => t.status !== 'completed' && (!assigned[t.id] || assigned[t.id] === v));
  }

  function selectDefaultFor(vehicleId) {
    const d = vehicleId ? SW.engine.getRouteDetails(vehicleId) : null;
    if (d && d.route.status !== 'completed') {
      state.selectedTpsIds = d.points.filter((p) => p.status === 'pending').map((p) => p.collection_point_id);
    } else {
      state.selectedTpsIds = availableForCurrent().map((t) => t.id);
    }
  }

  function renderTpsChecklist() {
    const assigned = SW.store.getAssignments();
    const v = vid();
    $('tpsChecklist').innerHTML = SW.store.getTps().map((t) => {
      const done = t.status === 'completed';
      const ownerId = assigned[t.id];
      const owner = ownerId && ownerId !== v ? SW.store.getVehicleById(ownerId) : null;
      const disabled = done || Boolean(owner);
      const checked = !disabled && state.selectedTpsIds.includes(t.id);
      const statusHtml = done
        ? '<span class="text-green">Selesai</span>'
        : owner ? `<span class="text-purple">Ditugaskan ke ${esc(owner.vehicle_code)}</span>`
        : '<span class="text-amber">Terjadwal</span>';
      return `
        <label class="tps-item ${disabled ? 'is-done' : ''}">
          <span class="tps-main">
            <input type="checkbox" class="tps-checkbox" value="${esc(t.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>
              <span class="tps-name">${esc(t.name)}</span>
              <span class="tps-meta">Status: ${statusHtml}</span>
            </span>
          </span>
          <span class="badge ${done ? 'badge-green' : owner ? 'badge-purple' : 'badge-amber'}">${t.estimated_volume} kg</span>
        </label>`;
    }).join('');
    updateSelectedVolume();
  }

  function validSelected() {
    const ok = new Set(availableForCurrent().map((t) => t.id));
    return state.selectedTpsIds.filter((id) => ok.has(id));
  }

  function updateSelectedVolume() {
    const ids = validSelected();
    const total = ids.reduce((s, id) => s + SW.store.getTpsById(id).estimated_volume, 0);
    $('totalSelectedVolume').textContent = `${total} kg`;
    $('selectedCount').textContent = String(ids.length);
  }

  /* ---------- KPI & itinerary ---------- */
  function sourceNote(isEstimate) {
    return isEstimate
      ? { text: '≈ Estimasi garis lurus (OSRM tidak terjangkau)', cls: 'text-amber' }
      : { text: '✓ Berbasis jaringan jalan nyata (OSRM)', cls: 'text-green' };
  }

  function setNote(id, text, cls) {
    const el = $(id);
    el.textContent = text;
    el.className = 'kpi-note ' + cls;
  }

  function resetKpis() {
    $('kpiDistance').textContent = '- km';
    $('kpiDuration').textContent = '-';
    $('kpiEfficiency').textContent = '0%';
    $('kpiTotalWaste').textContent = '- kg';
    const v = SW.store.getVehicleById(vid());
    $('kpiWasteNote').textContent = v ? `Kapasitas ${v.vehicle_code}: ${v.capacity} kg` : '';
    setNote('kpiDistanceNote', 'Menunggu rute dibuat', 'text-muted');
    setNote('kpiDurationNote', 'Termasuk waktu layanan & bongkar', 'text-muted');
  }

  function renderKpis() {
    const d = SW.engine.getRouteDetails(vid());
    if (!d) { resetKpis(); return; }
    const r = d.route;
    $('kpiDistance').textContent = `${(r.total_distance / 1000).toFixed(2)} km`;
    $('kpiDuration').textContent = T.fmtDuration(r.finish_min - r.start_min);
    $('kpiEfficiency').textContent = r.tsp_gain || '0%';
    $('kpiTotalWaste').textContent = `${r.total_volume} kg`;
    $('kpiWasteNote').textContent = `Kapasitas ${d.vehicle.capacity} kg · ≈ ${r.estimated_trips} rit`;
    const n = sourceNote(r.is_estimate);
    setNote('kpiDistanceNote', n.text, n.cls);
    setNote('kpiDurationNote',
      `${T.fmt(r.start_min)} → ${T.fmt(r.finish_min)} · ${r.over_shift ? '⚠ melewati shift' : '✓ dalam shift'}`,
      r.over_shift ? 'text-red' : 'text-green');
  }

  function renderTimeline() {
    const box = $('routeTimeline');
    const d = SW.engine.getRouteDetails(vid());
    if (!d) {
      box.innerHTML = '<p class="empty">Truk ini belum punya rute. Pilih TPS lalu tekan “Buat Rute Optimal”, atau gunakan “Bagi Otomatis ke Semua Truk”.</p>';
      return;
    }
    let html = `<ol class="timeline">
      <li class="tl-item"><span class="tl-dot tl-depot">D</span>
        <div class="tl-title text-blue">Berangkat dari ${esc(d.depot.name)}</div>
        <div class="tl-sub">${T.fmt(d.route.start_min)} · muatan 0 kg</div></li>`;
    d.points.forEach((p) => {
      const done = p.status === 'completed';
      html += `<li class="tl-item ${done ? 'is-done' : ''}">
        <span class="tl-dot ${done ? 'tl-done' : 'tl-stop'}">${done ? '✓' : p.sequence}</span>
        <div class="tl-row"><span class="tl-title">${esc(p.name)}</span><span class="tl-vol">+${p.estimated_volume} kg</span></div>
        <div class="tl-sub">Tiba ± ${T.fmt(p.eta_min)} · Rit ${p.trip} · ${done ? 'selesai dilayani' : 'menunggu'}</div></li>`;
    });
    html += `<li class="tl-item"><span class="tl-dot tl-depot">D</span>
        <div class="tl-title text-blue">Kembali ke ${esc(d.depot.name)}</div>
        <div class="tl-sub">Selesai ± ${T.fmt(d.route.finish_min)} · bongkar muatan di TPA</div></li></ol>`;
    box.innerHTML = html;
  }

  /* ---------- Peta ---------- */
  function syncMap() {
    const v = vid();
    const d = SW.engine.getRouteDetails(v);
    const depot = d ? d.depot : SW.store.getDepotById($('depotSelect').value);
    const assigned = SW.store.getAssignments();
    const others = {};
    Object.keys(assigned).forEach((tid) => {
      if (assigned[tid] === v) return;
      const ov = SW.store.getVehicleById(assigned[tid]);
      if (ov) others[tid] = { short: ov.short || ov.vehicle_code.slice(-1), color: ov.color, code: ov.vehicle_code };
    });
    SW.map.renderMarkers(depot, SW.store.getTps(), d ? d.points : [], others);
  }

  async function redrawRoute() {
    const token = ++drawToken;
    SW.map.clearRoute();
    const v = vid();
    const d = SW.engine.getRouteDetails(v);
    if (!d || d.route.status === 'completed') { syncMap(); return; }
    try {
      const g = await SW.engine.getActiveGeometry(v);
      if (token === drawToken && g) SW.map.drawRoute(g, d.vehicle.color);
    } catch (e) { /* peta tetap tampil tanpa garis */ }
    if (token === drawToken) syncMap();
  }

  /* ---------- Render menyeluruh ---------- */
  function refreshAll() {
    renderVehicleSelect();
    renderShiftInfo();
    renderTpsChecklist();
    renderKpis();
    renderTimeline();
    syncMap();
  }

  /* ---------- Aksi ---------- */
  async function handleGenerate() {
    const btn = $('btnGenerateRoute');
    const original = btn.innerHTML;
    const ids = validSelected();
    if (!ids.length) { SW.ui.toast('Pilih minimal 1 TPS yang tersedia.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spin" aria-hidden="true">⚙️</span> Menghitung rute…';
    try {
      const v = SW.store.getVehicleById(vid());
      const result = await SW.engine.generateRoute({ vehicleId: v.id, depotId: $('depotSelect').value, tpsIds: ids });
      SW.map.drawRoute(result.geometry, v.color);
      selectDefaultFor(v.id);
      refreshAll();
      document.dispatchEvent(new CustomEvent('sw:route-changed'));
      if (result.summary.overShift) {
        SW.ui.toast(`Rute ${v.vehicle_code} dibuat, tetapi perkiraan selesai ${T.fmt(result.summary.finishMin)} melewati akhir shift.`, 'warn');
      } else if (result.summary.isEstimate) {
        SW.ui.toast('Rute dibuat memakai estimasi jarak (OSRM tidak terjangkau).', 'warn');
      } else {
        SW.ui.toast(`Rute ${v.vehicle_code} dibuat: ${result.summary.totalDistanceKm} km, ${result.summary.totalTpsCount} TPS.`, 'success');
      }
    } catch (err) {
      SW.ui.toast('Gagal membuat rute: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  async function handleAutoAssign() {
    const btn = $('btnAutoAssign');
    const original = btn.innerHTML;
    let plan;
    try { plan = SW.engine.autoAssign(); } catch (err) { SW.ui.toast(err.message, 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spin" aria-hidden="true">⚙️</span> Membagi & menghitung…';
    const done = [];
    const late = [];
    try {
      for (const p of plan) {
        const res = await SW.engine.generateRoute({ vehicleId: p.vehicleId, depotId: $('depotSelect').value, tpsIds: p.tpsIds });
        const v = SW.store.getVehicleById(p.vehicleId);
        done.push(v.vehicle_code);
        if (res.summary.overShift) late.push(v.vehicle_code);
      }
    } catch (err) {
      SW.ui.toast('Pembagian otomatis terhenti: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
    if (done.length) {
      $('vehicleSelect').value = SW.store.getVehicleById(plan[0].vehicleId).id;
      selectDefaultFor(vid());
      refreshAll();
      await redrawRoute();
      document.dispatchEvent(new CustomEvent('sw:route-changed'));
      SW.ui.toast(
        late.length ? `Rute dibuat untuk ${done.join(', ')}. Perhatian: ${late.join(', ')} diperkirakan melewati akhir shift.` : `Rute dibuat untuk ${done.join(', ')}.`,
        late.length ? 'warn' : 'success'
      );
    }
  }

  async function handleReset() {
    const ok = await SW.ui.confirm('Reset simulasi?', 'Seluruh rute, muatan, dan status TPS dikembalikan ke kondisi awal. Jadwal shift dan pengaturan waktu TIDAK dihapus.', 'Ya, reset');
    if (!ok) return;
    SW.store.reset();
    SW.map.clearRoute();
    selectDefaultFor(vid());
    refreshAll();
    document.dispatchEvent(new CustomEvent('sw:route-changed'));
    SW.ui.toast('Simulasi dikembalikan ke kondisi awal.', 'success');
  }

  function switchTab(tab) {
    state.currentTab = tab;
    const views = { admin: 'adminView', schedule: 'scheduleView', driver: 'driverView' };
    const tabs = { admin: 'tabAdmin', schedule: 'tabSchedule', driver: 'tabDriver' };
    Object.keys(views).forEach((k) => {
      $(views[k]).hidden = k !== tab;
      $(tabs[k]).setAttribute('aria-selected', String(k === tab));
    });
    if (tab === 'admin') {
      refreshAll();
      SW.map.refresh();
      redrawRoute(); // rute dan penanda mengikuti kemajuan yang dicatat driver
    } else if (tab === 'schedule') {
      document.dispatchEvent(new CustomEvent('sw:schedule-opened'));
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
    $('btnSelectAll').addEventListener('click', () => { state.selectedTpsIds = availableForCurrent().map((t) => t.id); renderTpsChecklist(); });
    $('btnDeselectAll').addEventListener('click', () => { state.selectedTpsIds = []; renderTpsChecklist(); });
    $('btnGenerateRoute').addEventListener('click', handleGenerate);
    $('btnAutoAssign').addEventListener('click', handleAutoAssign);
    $('btnReset').addEventListener('click', handleReset);
    $('tabAdmin').addEventListener('click', () => switchTab('admin'));
    $('tabSchedule').addEventListener('click', () => switchTab('schedule'));
    $('tabDriver').addEventListener('click', () => switchTab('driver'));
    $('vehicleSelect').addEventListener('change', () => {
      selectDefaultFor(vid());
      refreshAll();
      redrawRoute();
    });
    // Jadwal diubah di tab Jadwal Shift
    document.addEventListener('sw:config-changed', () => { if (state.currentTab === 'admin') refreshAll(); });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    SW.map.init('map');
    renderSelectors();
    selectDefaultFor(vid());
    refreshAll();
    bindEvents();
    await redrawRoute();
  });

  SW.app = { state, switchTab, syncMap, refreshAll, currentVehicleId: vid };
})();
