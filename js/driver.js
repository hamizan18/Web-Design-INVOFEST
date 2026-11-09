/**
 * PORTAL DRIVER (tampilan lapangan)
 * - Driver memilih truknya (sesuai shift)
 * - Memantau muatan, menandai TPS selesai, melihat perkiraan jam tiba
 * - Peringatan prediktif kelebihan kapasitas
 * - Menuju depot dan re-routing dinamis
 * - Peta rute: seluruh rute sisa (sama dengan Dashboard Admin) dan ruas tercepat menuju tujuan berikutnya
 */
(function () {
  const { esc } = SW.ui;
  const T = SW.time;
  const $ = (id) => document.getElementById(id);

  const driverState = { vehicleId: null, refocus: false, mapFocus: 'leg' };

  /** Pilih truk yang valid: truk terpilih -> truk di dashboard admin -> truk yang punya rute -> truk aktif pertama */
  function resolveVehicle() {
    const active = SW.store.getVehicles().filter((v) => v.active !== false);
    if (!active.length) return null;
    if (driverState.vehicleId && active.some((v) => v.id === driverState.vehicleId)) return driverState.vehicleId;
    const adminId = SW.app && SW.app.currentVehicleId ? SW.app.currentVehicleId() : null;
    const pick = active.find((v) => v.id === adminId) || active.find((v) => SW.engine.hasActiveRoute(v.id)) || active[0];
    driverState.vehicleId = pick.id;
    return pick.id;
  }

  /** Peringatan dihitung dari kondisi terkini sehingga selalu konsisten, juga setelah halaman dimuat ulang. */
  function computeAlert(d) {
    if (d.route.status === 'rerouted') return null;
    const pending = d.points.filter((p) => p.status === 'pending');
    if (!pending.length) return null;
    const cap = d.vehicle.capacity;
    const load = d.vehicle.current_capacity;
    if (load >= cap) {
      return `Kapasitas ${d.vehicle.code} penuh (${load} kg dari ${cap} kg). Muatan harus segera dibongkar di depot.`;
    }
    const next = pending[0];
    if (load + next.estimated_volume > cap) {
      return `Prediksi melebihi kapasitas: ${next.name} diperkirakan ${next.estimated_volume} kg, sedangkan sisa ruang hanya ${cap - load} kg. Segera kembali ke depot untuk membongkar muatan.`;
    }
    return null;
  }

  function vehicleCardHtml() {
    const vs = SW.store.getVehicles().filter((v) => v.active !== false);
    const cur = SW.store.getVehicleById(driverState.vehicleId);
    const st = T.shiftState(cur);
    let note = '';
    if (st.key === 'belum') note = `<p class="note note-info">Shift ${esc(cur.shift.name)} dimulai pukul ${esc(cur.shift.start)}.</p>`;
    else if (st.key === 'selesai') note = `<p class="note note-warn">Shift ${esc(cur.shift.name)} berakhir pukul ${esc(cur.shift.end)}. Simulasi tetap dapat dijalankan.</p>`;
    return `
      <section class="card">
        <div class="field">
          <label for="driverVehicle">Anda mengemudikan</label>
          <select id="driverVehicle">
            ${vs.map((v) => `<option value="${esc(v.id)}" ${v.id === cur.id ? 'selected' : ''}>${esc(v.vehicle_code)} · Shift ${esc(v.shift.name)} ${esc(v.shift.start)}–${esc(v.shift.end)}</option>`).join('')}
          </select>
        </div>
        <div class="row-between">
          <span class="small">Shift <b>${esc(cur.shift.name)}</b> · ${esc(cur.shift.start)}–${esc(cur.shift.end)}</span>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        ${note}
      </section>`;
  }

  function renderEmpty(extra) {
    const cur = SW.store.getVehicleById(driverState.vehicleId);
    $('driverContainer').innerHTML = `
      <div class="driver-wrap">
        ${vehicleCardHtml()}
        <div class="card card-center">
          <div class="icon-tile" aria-hidden="true">📱</div>
          <h2 class="card-heading">${esc(cur.vehicle_code)} belum punya rute</h2>
          <p class="muted">${extra || 'Buka tab <b>Dashboard Admin</b>, pilih truk dan TPS, lalu tekan <b>Buat Rute Optimal</b> (atau <b>Bagi Otomatis</b>).'}</p>
          <button type="button" class="btn btn-primary" data-action="to-admin">Buka Dashboard Admin</button>
        </div>
      </div>`;
  }

  function renderNoVehicle() {
    $('driverContainer').innerHTML = `
      <div class="driver-wrap"><div class="card card-center">
        <div class="icon-tile" aria-hidden="true">🚛</div>
        <h2 class="card-heading">Tidak ada truk aktif</h2>
        <p class="muted">Aktifkan minimal satu truk di tab <b>Jadwal Shift</b>.</p>
        <button type="button" class="btn btn-primary" data-action="to-schedule">Buka Jadwal Shift</button>
      </div></div>`;
  }

  function render() {
    const vid = resolveVehicle();
    if (!vid) { renderNoVehicle(); return; }
    const d = SW.engine.getRouteDetails(vid);
    if (!d) { renderEmpty(); afterRender(); return; }

    const cap = d.vehicle.capacity;
    const load = d.vehicle.current_capacity;
    const pct = Math.min(100, parseFloat(((load / cap) * 100).toFixed(1)));
    const meterCls = pct >= 90 ? 'meter-red' : pct >= 60 ? 'meter-amber' : 'meter-green';
    const badgeCls = pct >= 90 ? 'badge-red' : pct >= 60 ? 'badge-amber' : 'badge-green';

    const pending = d.points.filter((p) => p.status === 'pending');
    const next = pending[0] || null;
    const finished = pending.length === 0;
    const heading = d.route.status === 'rerouted';
    const alertMsg = computeAlert(d);
    const doneCount = d.points.filter((p) => p.status === 'completed').length;

    const statusLabel = heading ? 'MENUJU DEPOT' : finished ? 'SELESAI' : 'DALAM PERJALANAN';
    const statusCls = heading ? 'badge-blue' : 'badge-green';

    let actionCard = '';
    if (heading) {
      actionCard = `
        <section class="card card-blue">
          <div class="card-center">
            <div class="icon-tile icon-blue" aria-hidden="true">🏭</div>
            <p class="eyebrow text-blue">Tujuan saat ini</p>
            <h2 class="card-heading">${esc(d.depot.name)}</h2>
            <p class="muted">Bongkar muatan sampah di fasilitas pengolahan akhir.</p>
            <div class="info-box">Muatan yang akan dibongkar: <b class="text-amber">${load} kg</b></div>
            <button type="button" class="btn btn-blue btn-block" data-action="reroute">🔄 Kosongkan muatan &amp; hitung ulang rute sisa TPS</button>
          </div>
        </section>`;
    } else if (finished) {
      actionCard = `
        <section class="card card-green">
          <div class="card-center">
            <div class="icon-tile icon-green" aria-hidden="true">🎉</div>
            <h2 class="card-heading text-green">Seluruh Rute Selesai</h2>
            <p class="muted">Semua TPS pada rute ${esc(d.vehicle.code)} telah dilayani.</p>
            <button type="button" class="btn btn-primary btn-block" data-action="summary">📊 Lihat ringkasan perjalanan</button>
          </div>
        </section>`;
    } else if (next) {
      actionCard = `
        <section class="card">
          <div class="row-between">
            <span class="eyebrow">Target pengambilan berikutnya</span>
            <span class="badge badge-cyan">STOP #${next.sequence}</span>
          </div>
          <h2 class="target-name">${esc(next.name)}</h2>
          <p class="muted small">Estimasi sampah: <b class="text-amber">${next.estimated_volume} kg</b> · Perkiraan tiba <b>${T.fmt(next.eta_min)}</b></p>
          <button type="button" class="btn btn-primary btn-block" data-action="complete" data-id="${esc(next.collection_point_id)}" data-vol="${next.estimated_volume}">✅ Selesaikan TPS ini (+${next.estimated_volume} kg)</button>
        </section>`;
    }

    const finishLine = d.route.over_shift
      ? `<p class="note note-warn">⚠ Perkiraan selesai ${T.fmt(d.route.finish_min)}, melewati akhir shift (${esc(d.vehicle.shift.end)}).</p>`
      : `<p class="note note-ok">✓ Perkiraan selesai ${T.fmt(d.route.finish_min)} (shift berakhir ${esc(d.vehicle.shift.end)}).</p>`;

    $('driverContainer').innerHTML = `
      <div class="driver-wrap">
        ${vehicleCardHtml()}

        <section class="card">
          <div class="row-between">
            <div class="driver-id">
              <div class="icon-tile icon-sm" aria-hidden="true" style="background:${esc(d.vehicle.color)}">🚛</div>
              <div>
                <div class="strong">${esc(d.vehicle.code)}</div>
                <div class="muted small">${esc(d.vehicle.plate_number)}</div>
              </div>
            </div>
            <span class="badge ${statusCls}">${statusLabel}</span>
          </div>

          <div class="info-box">
            <div class="row-between small">
              <span class="muted">Muatan terisi</span>
              <span class="strong">${load} kg <span class="muted">/ ${cap} kg</span></span>
            </div>
            <div class="meter" role="progressbar" aria-label="Muatan armada" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
              <div class="meter-bar ${meterCls}" style="width:${pct}%"></div>
            </div>
            <div class="row-between wrap-gap">
              <span class="badge ${badgeCls}">${pct}% kapasitas</span>
              <div class="quick">
                <span class="muted tiny">Atur muatan (simulasi):</span>
                ${[25, 50, 75, 100].map((p) => `<button type="button" class="chip ${p === 100 ? 'chip-red' : ''}" data-action="quick" data-kg="${Math.round(cap * p / 100)}">${p}%</button>`).join('')}
              </div>
            </div>
          </div>
          ${finished ? '' : finishLine}
        </section>

        ${alertMsg ? `
        <section class="alert-card" role="alert">
          <div class="alert-icon" aria-hidden="true">🚨</div>
          <div>
            <h3>Peringatan kapasitas</h3>
            <p>${esc(alertMsg)}</p>
            <button type="button" class="btn btn-red btn-block" data-action="to-depot">🏭 Arahkan armada ke depot sekarang</button>
          </div>
        </section>` : ''}

        ${actionCard}

        <div id="driverMapSlot"></div>

        <section class="card">
          <div class="row-between">
            <h3 class="card-title">Daftar titik penugasan</h3>
            <span class="muted tiny">${doneCount} / ${d.points.length} selesai</span>
          </div>
          <ul class="stop-list">
            ${d.points.map((p) => {
              const done = p.status === 'completed';
              const isNext = next && p.id === next.id && !heading;
              return `<li class="stop ${done ? 'is-done' : ''} ${isNext ? 'is-next' : ''}">
                <span class="stop-num ${done ? 'stop-num-done' : ''}">${done ? '✓' : p.sequence}</span>
                <span class="stop-name">${esc(p.name)}<span class="stop-eta">${done ? 'selesai' : 'tiba ± ' + T.fmt(p.eta_min) + ' · rit ' + p.trip}</span></span>
                <span class="stop-vol ${done ? 'text-green' : 'text-amber'}">${p.estimated_volume} kg</span>
              </li>`;
            }).join('')}
          </ul>
        </section>
      </div>`;
    afterRender();
  }

  function afterRender() {
    if (driverState.refocus) {
      driverState.refocus = false;
      const s = $('driverVehicle');
      if (s) s.focus();
    }
    mountMap();
  }

  /* ---------- Peta rute driver ----------
   * Kartu peta dibuat sekali dan dipindahkan ke slot setiap kali portal digambar ulang,
   * sehingga peta (zoom, tile) tidak dibuat ulang pada tiap aksi. */
  const mapView = SW.map.create({ noticeId: 'driverMapNotice' });
  let mapCard = null;
  let mapToken = 0;

  function ensureMapCard() {
    if (mapCard) return mapCard;
    mapCard = document.createElement('section');
    mapCard.className = 'card driver-map-card';
    mapCard.setAttribute('aria-labelledby', 'driverMapTitle');
    mapCard.innerHTML = `
      <div class="map-head">
        <h3 id="driverMapTitle" class="card-title">🗺️ Peta rute tercepat</h3>
        <div class="chip-group" role="group" aria-label="Cakupan peta">
          <button type="button" class="chip" data-map-focus="leg" aria-pressed="true">Menuju tujuan</button>
          <button type="button" class="chip" data-map-focus="all" aria-pressed="false">Seluruh rute</button>
        </div>
      </div>
      <div id="driverLegInfo" class="leg-info" aria-live="polite"></div>
      <div class="map-wrap">
        <div id="driverMap" class="route-map" role="application" aria-label="Peta rute untuk driver"></div>
        <div id="driverMapNotice" class="map-notice" role="status" hidden></div>
      </div>
      <ul class="legend legend-sm" aria-label="Keterangan peta">
        <li><span class="line-sample line-leg" aria-hidden="true"></span> Rute tercepat ke tujuan</li>
        <li><span class="line-sample line-rest" aria-hidden="true"></span> Sisa rute</li>
        <li><span class="dot dot-blue"></span> Depot / TPA</li>
        <li><span class="dot dot-cyan"></span> Stop (#urutan)</li>
      </ul>
      <a id="driverNavLink" class="btn btn-blue btn-block" target="_blank" rel="noopener noreferrer" hidden>🧭 Buka navigasi suara di Google Maps</a>`;
    mapCard.addEventListener('click', (e) => {
      const b = e.target.closest('[data-map-focus]');
      if (!b) return;
      driverState.mapFocus = b.dataset.mapFocus;
      syncFocusButtons();
      mapView.fit(driverState.mapFocus);
    });
    return mapCard;
  }

  function syncFocusButtons() {
    mapCard.querySelectorAll('[data-map-focus]').forEach((b) => {
      const on = b.dataset.mapFocus === driverState.mapFocus;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  const km = (m) => (m / 1000).toFixed(1);
  const minutes = (s) => Math.max(1, Math.round(s / 60));

  function legInfoHtml(leg, full) {
    if (!leg) return '<p class="muted small">Armada sudah berada di tujuan, tidak ada ruas yang perlu ditempuh.</p>';
    const target = leg.kind === 'depot'
      ? `<b>${esc(leg.to.name)}</b> <span class="muted">(bongkar muatan)</span>`
      : `<b>${esc(leg.to.name)}</b> <span class="badge badge-cyan">STOP #${leg.sequence}</span>`;
    const rest = full && full.totalDistance
      ? `<span class="muted tiny">Sisa seluruh rute ± ${km(full.totalDistance)} km</span>` : '';
    const warn = leg.isEstimate
      ? '<p class="note note-warn">Garis lurus (estimasi): layanan rute jalan sedang tidak terjangkau. Jalur sebenarnya dapat berbeda.</p>' : '';
    return `
      <div class="leg-main">
        <div class="leg-target">Menuju ${target}</div>
        <div class="leg-stats">
          <span class="leg-stat"><b>${km(leg.distance)} km</b><span class="muted tiny">jarak</span></span>
          <span class="leg-stat"><b>± ${minutes(leg.duration)} mnt</b><span class="muted tiny">waktu tempuh</span></span>
        </div>
      </div>
      <div class="muted tiny">Berangkat dari ${esc(leg.from.name)}</div>${rest}${warn}`;
  }

  /** Letakkan kartu peta di slot, lalu gambar penanda, rute sisa, dan ruas menuju tujuan berikutnya. */
  async function mountMap() {
    const slot = $('driverMapSlot');
    const vid = driverState.vehicleId;
    if (!slot || !vid) return;
    const d = SW.engine.getRouteDetails(vid);
    if (!d) return;

    const card = ensureMapCard();
    slot.appendChild(card);
    syncFocusButtons();
    if (!mapView.ready) mapView.init('driverMap');
    mapView.invalidate();

    const token = ++mapToken;
    const pending = d.points.filter((p) => p.status === 'pending');
    const heading = d.route.status === 'rerouted';

    // TPS milik truk lain ditandai ungu, sama seperti di Dashboard Admin
    const assigned = SW.store.getAssignments();
    const others = {};
    Object.keys(assigned).forEach((tid) => {
      if (assigned[tid] === vid) return;
      const ov = SW.store.getVehicleById(assigned[tid]);
      if (ov) others[tid] = { short: ov.short || ov.vehicle_code.slice(-1), color: ov.color, code: ov.vehicle_code };
    });
    mapView.renderMarkers(d.depot, SW.store.getTps(), d.points, others, {
      fit: false, highlightId: !heading && pending[0] ? pending[0].collection_point_id : null
    });

    const info = $('driverLegInfo');
    const nav = $('driverNavLink');
    info.innerHTML = '<p class="muted small"><span class="spin" aria-hidden="true">⚙️</span> Memuat rute tercepat…</p>';
    nav.hidden = true;

    let full = null;
    let leg = null;
    try {
      [full, leg] = await Promise.all([
        SW.engine.getActiveRoute(vid).catch(() => null),
        SW.engine.getNextLeg(vid).catch(() => null)
      ]);
    } catch (e) { /* peta tetap tampil tanpa garis */ }
    if (token !== mapToken) return; // portal sudah digambar ulang oleh aksi yang lebih baru

    mapView.clearRoute();
    mapView.clearLeg();
    if (full) mapView.drawRoute(full.geometry, d.vehicle.color, { fit: false, subtle: true });
    if (leg) {
      mapView.drawLeg(leg.geometry, d.vehicle.color);
      mapView.setOrigin(leg.from, {
        color: d.vehicle.color,
        label: leg.from.isDepot ? 'Armada berangkat dari depot' : 'TPS terakhir yang dilayani'
      });
      nav.href = `https://www.google.com/maps/dir/?api=1&destination=${leg.to.latitude},${leg.to.longitude}&travelmode=driving`;
      nav.hidden = false;
    } else {
      mapView.setOrigin(null);
    }
    info.innerHTML = legInfoHtml(leg, full);
    mapView.fit(driverState.mapFocus);
  }

  /* ---------- Aksi ---------- */
  function afterChange() {
    SW.app.syncMap();
    document.dispatchEvent(new CustomEvent('sw:route-changed'));
  }

  function showSummary() {
    let s;
    try { s = SW.engine.getSummary(driverState.vehicleId); } catch (e) { SW.ui.toast(e.message, 'error'); return; }
    SW.ui.modal(`
      <div class="row-between modal-head">
        <h3>📊 Ringkasan ${esc(s.vehicleCode)} · Shift ${esc(s.shift.name)}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Tutup">✕</button>
      </div>
      <div class="stat-grid">
        <div class="stat"><span class="muted tiny">TPS tuntas</span><b class="text-green">${s.completedPoints} / ${s.totalPoints}</b></div>
        <div class="stat"><span class="muted tiny">Sampah terangkut</span><b class="text-amber">${s.totalCollectedKg} kg</b></div>
        <div class="stat"><span class="muted tiny">Jarak rute terakhir</span><b class="text-cyan">${s.totalDistanceKm} km</b></div>
        <div class="stat"><span class="muted tiny">Status sesi</span><b>${s.status === 'completed' ? 'Selesai' : 'Berjalan'}</b></div>
      </div>
      <h4 class="small strong">Riwayat pengambilan</h4>
      <ul class="log-list">
        ${s.logs.map((l, i) => `<li><span>${i + 1}. ${esc(l.tps_name || 'TPS')}</span><b class="text-amber">+${l.waste_collected} kg</b><span class="muted">Muatan: ${l.capacity_after} kg</span></li>`).join('') || '<li class="muted">Belum ada riwayat.</li>'}
      </ul>
      <button type="button" class="btn btn-ghost btn-block" data-close>Tutup</button>`);
  }

  async function onAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const vid = driverState.vehicleId;

    try {
      if (action === 'to-admin') {
        SW.app.switchTab('admin');
      } else if (action === 'to-schedule') {
        SW.app.switchTab('schedule');
      } else if (action === 'complete') {
        const r = SW.engine.completePoint(vid, btn.dataset.id, parseFloat(btn.dataset.vol));
        SW.ui.toast(r.message, r.needDepotReturn ? 'warn' : 'success');
        afterChange();
      } else if (action === 'to-depot') {
        SW.engine.returnToDepot(vid);
        afterChange();
      } else if (action === 'reroute') {
        btn.disabled = true;
        btn.textContent = 'Menghitung ulang rute…';
        const r = await SW.engine.reroute(vid);
        SW.ui.toast(r.message + (r.overShift ? ' Perhatian: perkiraan selesai melewati akhir shift.' : ''), r.overShift ? 'warn' : 'success');
        afterChange();
      } else if (action === 'quick') {
        SW.engine.updateCapacity(vid, parseFloat(btn.dataset.kg));
        afterChange();
      } else if (action === 'summary') {
        showSummary();
      }
    } catch (err) {
      SW.ui.toast(err.message, 'error');
      render();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const box = $('driverContainer');
    box.addEventListener('click', onAction);
    box.addEventListener('change', (e) => {
      if (e.target.id === 'driverVehicle') {
        driverState.vehicleId = e.target.value;
        driverState.refocus = true;
        render();
      }
    });
  });
  document.addEventListener('sw:driver-opened', render);
  document.addEventListener('sw:route-changed', () => { if (!$('driverView').hidden) render(); });
  document.addEventListener('sw:config-changed', () => { if (!$('driverView').hidden) render(); });

  SW.driver = { render };
})();
