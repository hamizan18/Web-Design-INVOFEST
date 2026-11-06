/**
 * UTILITAS WAKTU & STATUS SHIFT
 * Semua waktu disimpan sebagai "menit sejak 00:00" agar mudah dihitung.
 */
(function () {
  const pad = (n) => String(n).padStart(2, '0');

  const T = {
    /** 'HH:MM' -> menit (NaN jika tidak valid) */
    toMin(str) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(str == null ? '' : str).trim());
      if (!m) return NaN;
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if (h > 23 || mi > 59) return NaN;
      return h * 60 + mi;
    },

    /** menit -> 'HH:MM' (diberi '(+1)' bila melewati tengah malam) */
    fmt(min) {
      if (min == null || isNaN(min)) return '--:--';
      const r = Math.round(min);
      const day = Math.floor(r / 1440);
      const m = r - day * 1440;
      const s = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      return day > 0 ? `${s} (+${day})` : s;
    },

    /** menit -> '2 j 05 mnt' */
    fmtDuration(min) {
      if (min == null || isNaN(min)) return '-';
      const r = Math.max(0, Math.round(min));
      if (r < 60) return `${r} mnt`;
      return `${Math.floor(r / 60)} j ${pad(r % 60)} mnt`;
    },

    realNowMin() {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    },

    /** Jam yang dipakai aplikasi: jam simulasi (jika diaktifkan admin) atau jam perangkat */
    nowMin() {
      const s = SW.store.getSettings();
      if (s.useSim) {
        const v = T.toMin(s.simTime);
        if (!isNaN(v)) return v;
      }
      return T.realNowMin();
    },

    /** Status shift sebuah armada pada jam tertentu */
    shiftState(vehicle, now) {
      const t = now == null ? T.nowMin() : now;
      const s = T.toMin(vehicle.shift.start);
      const e = T.toMin(vehicle.shift.end);
      if (t < s) return { key: 'belum', label: 'Belum mulai', cls: 'badge-blue' };
      if (t >= e) return { key: 'selesai', label: 'Shift berakhir', cls: 'badge-amber' };
      return { key: 'berjalan', label: 'Sedang berjalan', cls: 'badge-green' };
    },

    /** Daftar pasangan armada aktif yang jam shiftnya saling tumpang tindih */
    overlaps(vehicles) {
      const list = vehicles.filter((v) => v.active !== false);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const from = Math.max(T.toMin(a.shift.start), T.toMin(b.shift.start));
          const to = Math.min(T.toMin(a.shift.end), T.toMin(b.shift.end));
          if (from < to) out.push({ a: a.vehicle_code, b: b.vehicle_code, from, to });
        }
      }
      return out;
    }
  };

  window.SW = window.SW || {};
  SW.time = T;
})();
