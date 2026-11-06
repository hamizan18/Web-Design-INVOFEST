/**
 * TAB JADWAL SHIFT (khusus admin)
 * - Bagan jadwal harian seluruh truk
 * - Form pengaturan tiap truk: nama, plat, kapasitas, aktif/nonaktif, nama & jam shift
 * - Pengaturan waktu: lama layanan per TPS, lama bongkar di depot, jam simulasi
 */
(function () {
  const { esc } = SW.ui;
  const T = SW.time;
  const $ = (id) => document.getElementById(id);

  /* ---------- Bagan jadwal harian ---------- */
  function renderGantt(items) {
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    const now = T.nowMin();
    const axis = ticks.map((h) => `<span style="left:${(h / 24) * 100}%">${String(h % 24).padStart(2, '0')}</span>`).join('');
    const grid = ticks.map((h) => `<i style="left:${(h / 24) * 100}%"></i>`).join('');
    const rows = items.map((it) => {
      const s = T.toMin(it.start);
      const e = T.toMin(it.end);
      const valid = !isNaN(s) && !isNaN(e) && e > s;
      const block = valid
        ? `<div class="gantt-block" style="left:${(s / 1440) * 100}%;width:${((e - s) / 1440) * 100}%;background:${esc(it.color)}" title="${esc(it.code)} · Shift ${esc(it.name)} ${esc(it.start)}–${esc(it.end)}"><span>${esc(it.name)} ${esc(it.start)}–${esc(it.end)}</span></div>`
        : '';
      return `<div class="gantt-row ${it.active ? '' : 'is-off'}">
        <div class="gantt-label">${esc(it.code)}${it.active ? '' : ' <span class="tiny muted">(nonaktif)</span>'}</div>
        <div class="gantt-track">${grid}${block}</div>
      </div>`;
    }).join('');
    $('ganttBox').innerHTML = `
      <div class="gantt">
        <div class="gantt-row gantt-axis-row"><div class="gantt-label"></div><div class="gantt-track gantt-axis">${axis}</div></div>
        ${rows}
        <div class="gantt-now" style="left:calc(var(--gantt-label) + (100% - var(--gantt-label)) * ${now / 1440})" title="Jam aplikasi ${T.fmt(now)}"><span>${T.fmt(now)}</span></div>
      </div>`;
  }

  function currentItemsFromStore() {
    return SW.store.getVehicles().map((v) => ({
      code: v.vehicle_code, color: v.color, name: v.shift.name, start: v.shift.start, end: v.shift.end, active: v.active !== false
    }));
  }

  function itemsFromForm() {
    return SW.store.getVehicles().map((v) => {
      const g = (f) => { const el = document.querySelector(`[data-vid="${v.id}"][data-f="${f}"]`); return el ? el : null; };
      return {
        code: g('vehicle_code') ? g('vehicle_code').value.trim() || v.vehicle_code : v.vehicle_code,
        color: v.color,
        name: g('shift_name') ? g('shift_name').value.trim() || 'Shift' : v.shift.name,
        start: g('start') ? g('start').value : v.shift.start,
        end: g('end') ? g('end').value : v.shift.end,
        active: g('active') ? g('active').checked : v.active !== false
      };
    });
  }

  function renderOverlapNotice(vehicles) {
    const list = T.overlaps(vehicles.map((it, i) => ({ vehicle_code: it.code, active: it.active, shift: { start: it.start, end: it.end } })).filter((v) => !isNaN(T.toMin(v.shift.start)) && !isNaN(T.toMin(v.shift.end))));
    const el = $('overlapNotice');
    if (!list.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '⚠ Jadwal tumpang tindih: ' + list.map((o) => `${esc(o.a)} &amp; ${esc(o.b)} (${T.fmt(o.from)}–${T.fmt(o.to)})`).join('; ') +
      '. Ini diperbolehkan (truk berbeda), tetapi pastikan depot dapat melayani bongkar muat bersamaan.';
  }

  /* ---------- Kartu pengaturan per truk ---------- */
  function routeSummaryHtml(v) {
    const d = SW.engine.getRouteDetails(v.id);
    if (!d) return '<p class="muted tiny">Belum ada rute untuk truk ini.</p>';
    const done = d.points.filter((p) => p.status === 'completed').length;
    const r = d.route;
    const fin = r.over_shift
      ? `<span class="text-red">⚠ selesai ± ${T.fmt(r.finish_min)} (melewati shift)</span>`
      : `<span class="text-green">✓ selesai ± ${T.fmt(r.finish_min)}</span>`;
    return `<p class="tiny">Rute: <b>${d.points.length} TPS</b> · ${done} selesai · ${(r.total_distance / 1000).toFixed(1)} km · ${fin}</p>`;
  }

  function renderCards() {
    $('fleetCards').innerHTML = SW.store.getVehicles().map((v) => {
      const st = T.shiftState(v);
      const id = esc(v.id);
      return `
      <fieldset class="fleet-card" style="--truck:${esc(v.color)}">
        <legend><span class="truck-dot"></span> ${esc(v.vehicle_code)} <span class="badge ${st.cls}">${st.label}</span></legend>

        <div class="form-grid">
          <div class="field"><label for="f-${id}-code">Nama truk</label>
            <input id="f-${id}-code" type="text" maxlength="20" required data-vid="${id}" data-f="vehicle_code" value="${esc(v.vehicle_code)}"></div>
          <div class="field"><label for="f-${id}-plate">Plat nomor</label>
            <input id="f-${id}-plate" type="text" maxlength="14" required data-vid="${id}" data-f="plate_number" value="${esc(v.plate_number)}"></div>
          <div class="field"><label for="f-${id}-cap">Kapasitas (kg)</label>
            <input id="f-${id}-cap" type="number" min="1" max="5000" step="1" required data-vid="${id}" data-f="capacity" value="${v.capacity}"></div>
          <div class="field"><label for="f-${id}-sname">Nama shift</label>
            <input id="f-${id}-sname" type="text" maxlength="20" list="shiftNames" required data-vid="${id}" data-f="shift_name" value="${esc(v.shift.name)}"></div>
          <div class="field"><label for="f-${id}-start">Jam mulai</label>
            <input id="f-${id}-start" type="time" required data-vid="${id}" data-f="start" value="${esc(v.shift.start)}"></div>
          <div class="field"><label for="f-${id}-end">Jam selesai</label>
            <input id="f-${id}-end" type="time" required data-vid="${id}" data-f="end" value="${esc(v.shift.end)}"></div>
        </div>

        <label class="check-row"><input type="checkbox" data-vid="${id}" data-f="active" ${v.active !== false ? 'checked' : ''}> Truk aktif (dapat diberi rute)</label>
        ${routeSummaryHtml(v)}
      </fieldset>`;
    }).join('');
  }

  function renderSettings() {
    const s = SW.store.getSettings();
    $('setService').value = s.serviceMinutes;
    $('setUnload').value = s.unloadMinutes;
    $('setUseSim').checked = Boolean(s.useSim);
    $('setSimTime').value = s.simTime || '07:00';
    $('setSimTime').disabled = !s.useSim;
    updateNowText();
  }

  function updateNowText() {
    const useSim = $('setUseSim').checked;
    const t = useSim && !isNaN(T.toMin($('setSimTime').value)) ? T.toMin($('setSimTime').value) : T.realNowMin();
    $('nowText').textContent = `Jam yang dipakai aplikasi: ${T.fmt(t)} (${useSim ? 'jam simulasi' : 'jam perangkat'})`;
  }

  function render() {
    renderCards();
    renderSettings();
    renderGantt(currentItemsFromStore());
    renderOverlapNotice(currentItemsFromStore());
    clearErrors();
  }

  /* ---------- Validasi & simpan ---------- */
  function clearErrors() {
    document.querySelectorAll('#scheduleForm [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function fieldEl(vehicleId, f) { return document.querySelector(`[data-vid="${vehicleId}"][data-f="${f}"]`); }

  function collectAndValidate() {
    const errors = [];
    const values = [];
    const vehicles = SW.store.getVehicles();
    const codes = new Set();

    vehicles.forEach((v) => {
      const val = (f) => fieldEl(v.id, f).value.trim();
      const cfg = {
        id: v.id,
        vehicle_code: val('vehicle_code'),
        plate_number: val('plate_number'),
        capacity: Number(fieldEl(v.id, 'capacity').value),
        active: fieldEl(v.id, 'active').checked,
        shift: { name: val('shift_name'), start: val('start'), end: val('end') }
      };
      const bad = (f, msg) => errors.push({ el: fieldEl(v.id, f), msg: `${v.vehicle_code}: ${msg}` });

      if (!cfg.vehicle_code) bad('vehicle_code', 'nama truk wajib diisi.');
      else if (codes.has(cfg.vehicle_code.toLowerCase())) bad('vehicle_code', 'nama truk tidak boleh sama dengan truk lain.');
      codes.add(cfg.vehicle_code.toLowerCase());
      if (!cfg.plate_number) bad('plate_number', 'plat nomor wajib diisi.');
      if (!Number.isFinite(cfg.capacity) || cfg.capacity < 1 || cfg.capacity > 5000) bad('capacity', 'kapasitas harus 1–5000 kg.');
      if (!cfg.shift.name) bad('shift_name', 'nama shift wajib diisi.');
      const s = T.toMin(cfg.shift.start);
      const e = T.toMin(cfg.shift.end);
      if (isNaN(s)) bad('start', 'jam mulai belum diisi.');
      if (isNaN(e)) bad('end', 'jam selesai belum diisi.');
      if (!isNaN(s) && !isNaN(e) && e <= s) bad('end', 'jam selesai harus setelah jam mulai (dalam hari yang sama).');
      if (!cfg.active && SW.engine.hasActiveRoute(v.id)) bad('active', 'tidak dapat dinonaktifkan karena masih punya rute berjalan. Selesaikan atau reset simulasi dulu.');
      values.push(cfg);
    });

    if (!values.some((c) => c.active)) errors.push({ el: document.querySelector('[data-f="active"]'), msg: 'Minimal satu truk harus aktif.' });

    const service = Number($('setService').value);
    const unload = Number($('setUnload').value);
    if (!Number.isFinite(service) || service < 1 || service > 120) errors.push({ el: $('setService'), msg: 'Lama layanan per TPS harus 1–120 menit.' });
    if (!Number.isFinite(unload) || unload < 0 || unload > 180) errors.push({ el: $('setUnload'), msg: 'Lama bongkar di depot harus 0–180 menit.' });
    const useSim = $('setUseSim').checked;
    if (useSim && isNaN(T.toMin($('setSimTime').value))) errors.push({ el: $('setSimTime'), msg: 'Jam simulasi belum diisi.' });

    return { errors, values, settings: { serviceMinutes: service, unloadMinutes: unload, useSim, simTime: $('setSimTime').value || '07:00' } };
  }

  function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    const { errors, values, settings } = collectAndValidate();
    if (errors.length) {
      errors.forEach((er) => er.el && er.el.setAttribute('aria-invalid', 'true'));
      if (errors[0].el) errors[0].el.focus();
      SW.ui.toast(errors[0].msg + (errors.length > 1 ? ` (+${errors.length - 1} masalah lain)` : ''), 'error');
      return;
    }

    let routeAffected = false;
    values.forEach((cfg) => {
      const old = SW.store.getVehicleById(cfg.id);
      const changed = old.shift.start !== cfg.shift.start || old.shift.end !== cfg.shift.end || old.capacity !== cfg.capacity;
      if (changed && SW.engine.hasActiveRoute(cfg.id)) routeAffected = true;
      SW.store.updateVehicleConfig(cfg.id, cfg);
    });
    SW.store.updateSettings(settings);

    render();
    document.dispatchEvent(new CustomEvent('sw:config-changed'));
    SW.ui.toast('Jadwal dan pengaturan berhasil disimpan.', 'success');
    const ov = T.overlaps(SW.store.getVehicles());
    if (ov.length) SW.ui.toast('Perhatian: ada jadwal truk yang tumpang tindih.', 'warn');
    if (routeAffected) SW.ui.toast('Rute yang sudah dibuat masih memakai jadwal lama. Buat ulang rutenya agar perkiraan jam diperbarui.', 'warn');
  }

  async function onResetDefault() {
    const ok = await SW.ui.confirm('Kembalikan jadwal ke default?', 'Nama truk, plat, kapasitas, jam shift, dan pengaturan waktu kembali ke nilai awal. Rute yang sudah dibuat tidak dihapus.', 'Ya, kembalikan');
    if (!ok) return;
    SW.store.resetSchedule();
    render();
    document.dispatchEvent(new CustomEvent('sw:config-changed'));
    SW.ui.toast('Jadwal dikembalikan ke default.', 'success');
  }

  function onLiveInput(e) {
    if (e.target.matches('[data-f="shift_name"], [data-f="start"], [data-f="end"], [data-f="active"], [data-f="vehicle_code"]')) {
      const items = itemsFromForm();
      renderGantt(items);
      renderOverlapNotice(items);
    }
    if (e.target.id === 'setUseSim') $('setSimTime').disabled = !e.target.checked;
    if (e.target.id === 'setUseSim' || e.target.id === 'setSimTime') updateNowText();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('scheduleForm').addEventListener('submit', onSubmit);
    $('scheduleForm').addEventListener('input', onLiveInput);
    $('scheduleForm').addEventListener('change', onLiveInput);
    $('btnResetSchedule').addEventListener('click', onResetDefault);
  });
  document.addEventListener('sw:schedule-opened', render);
  document.addEventListener('sw:route-changed', () => { if (!$('scheduleView').hidden) render(); });

  SW.schedule = { render };
})();
