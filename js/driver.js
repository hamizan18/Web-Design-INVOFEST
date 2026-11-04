/**
 * PORTAL DRIVER (tampilan lapangan)
 * - Memantau muatan armada
 * - Menandai TPS selesai
 * - Peringatan prediktif kelebihan kapasitas
 * - Menuju depot dan re-routing dinamis
 */
(function () {
  const { esc } = SW.ui;
  const $ = (id) => document.getElementById(id);

  /** Peringatan dihitung dari kondisi terkini sehingga selalu konsisten, juga setelah halaman dimuat ulang. */
  function computeAlert(d) {
    if (d.route.status === 'rerouted') return null;
    const pending = d.points.filter((p) => p.status === 'pending');
    if (!pending.length) return null;
    const cap = d.vehicle.capacity;
    const load = d.vehicle.current_capacity;
    if (load >= cap) {
      return `Kapasitas armada penuh (${load} kg dari ${cap} kg). Muatan harus segera dibongkar di depot.`;
    }
    const next = pending[0];
    if (load + next.estimated_volume > cap) {
      return `Prediksi melebihi kapasitas: ${next.name} diperkirakan ${next.estimated_volume} kg, sedangkan sisa ruang hanya ${cap - load} kg. Segera kembali ke depot untuk membongkar muatan.`;
    }
    return null;
  }

  function renderEmpty() {
    $('driverContainer').innerHTML = `
      <div class="driver-wrap">
        <div class="card card-center">
          <div class="icon-tile" aria-hidden="true">📱</div>
          <h2 class="card-heading">Belum Ada Rute Aktif</h2>
          <p class="muted">Buka tab <b>Dashboard Admin</b>, pilih TPS yang akan dilayani, lalu tekan <b>Buat Rute Optimal</b>.</p>
          <button type="button" class="btn btn-primary" data-action="to-admin">Buka Dashboard Admin</button>
        </div>
      </div>`;
  }

  function render() {
    const d = SW.engine.getRouteDetails();
    if (!d) { renderEmpty(); return; }

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
            <p class="muted">Semua TPS pada rute ini telah dilayani.</p>
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
          <p class="muted small">Estimasi sampah: <b class="text-amber">${next.estimated_volume} kg</b></p>
          <button type="button" class="btn btn-primary btn-block" data-action="complete" data-id="${esc(next.collection_point_id)}" data-vol="${next.estimated_volume}">✅ Selesaikan TPS ini (+${next.estimated_volume} kg)</button>
        </section>`;
    }

    $('driverContainer').innerHTML = `
      <div class="driver-wrap">
        <section class="card">
          <div class="row-between">
            <div class="driver-id">
              <div class="icon-tile icon-sm" aria-hidden="true">🚛</div>
              <div>
                <div class="strong">Driver Lapangan</div>
                <div class="muted small">${esc(d.vehicle.code)} · ${esc(d.vehicle.plate_number)}</div>
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
                <span class="stop-name">${esc(p.name)}</span>
                <span class="stop-vol ${done ? 'text-green' : 'text-amber'}">${p.estimated_volume} kg</span>
              </li>`;
            }).join('')}
          </ul>
        </section>
      </div>`;
  }

  /* ---------- Aksi ---------- */
  function afterChange() {
    render();
    SW.app.syncMap();
    document.dispatchEvent(new CustomEvent('sw:route-changed'));
  }

  function showSummary() {
    let s;
    try { s = SW.engine.getSummary(); } catch (e) { SW.ui.toast(e.message, 'error'); return; }
    SW.ui.modal(`
      <div class="row-between modal-head">
        <h3>📊 Ringkasan perjalanan</h3>
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

    try {
      if (action === 'to-admin') {
        SW.app.switchTab('admin');
      } else if (action === 'complete') {
        const r = SW.engine.completePoint(btn.dataset.id, parseFloat(btn.dataset.vol));
        SW.ui.toast(r.message, r.needDepotReturn ? 'warn' : 'success');
        afterChange();
      } else if (action === 'to-depot') {
        SW.engine.returnToDepot();
        afterChange();
      } else if (action === 'reroute') {
        btn.disabled = true;
        btn.textContent = 'Menghitung ulang rute…';
        const r = await SW.engine.reroute();
        if (r.geometry) SW.map.drawRoute(r.geometry);
        SW.ui.toast(r.message, r.isCompleted ? 'success' : 'success');
        afterChange();
      } else if (action === 'quick') {
        SW.engine.updateCapacity(parseFloat(btn.dataset.kg));
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
    $('driverContainer').addEventListener('click', onAction);
  });
  document.addEventListener('sw:driver-opened', render);
  document.addEventListener('sw:route-changed', () => { if (!$('driverView').hidden) render(); });

  SW.driver = { render };
})();
