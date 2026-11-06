/**
 * PENYIMPANAN DATA DI BROWSER
 * Menyimpan kondisi simulasi (status TPS, armada & jadwal shift, rute per truk,
 * riwayat muatan, pengaturan waktu) pada localStorage agar tidak hilang saat
 * halaman dimuat ulang. Jika localStorage tidak tersedia, aplikasi tetap
 * berjalan di memori.
 */
(function () {
  const KEY = 'sw-lhokseumawe-sesi-v2';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function fresh() {
    return {
      vehicles: clone(SW.DATA.vehicles),
      tps: clone(SW.DATA.collection_points),
      settings: clone(SW.DATA.settings),
      routes: {} // { [vehicleId]: { route, points, logs } }
    };
  }

  function isValid(s) {
    return s && Array.isArray(s.tps) && Array.isArray(s.vehicles) && s.routes && typeof s.routes === 'object' &&
      s.settings && s.vehicles.length > 0 && s.vehicles.every((v) => v && v.shift && v.shift.start && v.shift.end);
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (isValid(s)) return s;
      }
    } catch (e) { /* abaikan, pakai data awal */ }
    return fresh();
  }

  let session = load();

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* abaikan */ }
  }

  const slot = (vehicleId) => session.routes[vehicleId] || null;

  SW.store = {
    /* ----- Depot ----- */
    getDepots: () => SW.DATA.depots,
    getDepotById: (id) => SW.DATA.depots.find((d) => d.id === id) || null,

    /* ----- Armada & shift ----- */
    getVehicles: () => session.vehicles,
    getVehicleById: (id) => session.vehicles.find((v) => v.id === id) || null,
    updateVehicle(id, updates) {
      const v = this.getVehicleById(id);
      if (v) Object.assign(v, updates);
      save();
      return v;
    },
    /** Simpan konfigurasi dari form admin (kode, plat, kapasitas, aktif, shift) */
    updateVehicleConfig(id, cfg) {
      const v = this.getVehicleById(id);
      if (!v) return null;
      v.vehicle_code = cfg.vehicle_code;
      v.plate_number = cfg.plate_number;
      v.capacity = cfg.capacity;
      v.active = cfg.active;
      v.shift = { name: cfg.shift.name, start: cfg.shift.start, end: cfg.shift.end };
      save();
      return v;
    },
    /** Kembalikan kode, plat, kapasitas, dan jadwal ke default; muatan & status berjalan dipertahankan */
    resetSchedule() {
      session.vehicles = SW.DATA.vehicles.map((def) => {
        const cur = session.vehicles.find((v) => v.id === def.id);
        return Object.assign(clone(def), cur ? { current_capacity: cur.current_capacity, status: cur.status } : {});
      });
      session.settings = clone(SW.DATA.settings);
      save();
    },

    /* ----- Pengaturan waktu ----- */
    getSettings: () => session.settings,
    updateSettings(updates) {
      Object.assign(session.settings, updates);
      save();
      return session.settings;
    },

    /* ----- TPS ----- */
    getTps: () => session.tps,
    getTpsById: (id) => session.tps.find((t) => t.id === id) || null,
    updateTps(id, updates) {
      const t = this.getTpsById(id);
      if (t) Object.assign(t, updates);
      save();
      return t;
    },

    /* ----- Rute (satu per truk) ----- */
    createRoute(vehicleId, routeData, points) {
      const id = `rute-${vehicleId}-${Date.now()}`;
      const route = Object.assign({}, routeData, { id, vehicle_id: vehicleId, created_at: new Date().toISOString() });
      session.routes[vehicleId] = {
        route,
        points: points.map((p, i) => Object.assign({}, p, { id: `${id}-p${i + 1}`, route_id: id })),
        logs: []
      };
      save();
      return { route, points: session.routes[vehicleId].points };
    },
    getRoute(vehicleId) {
      const s = slot(vehicleId);
      return s ? { route: s.route, points: s.points.slice().sort((a, b) => a.sequence - b.sequence) } : null;
    },
    updateRoute(vehicleId, updates) {
      const s = slot(vehicleId);
      if (s) Object.assign(s.route, updates);
      save();
      return s ? s.route : null;
    },
    updateRoutePoint(vehicleId, pointId, updates) {
      const s = slot(vehicleId);
      const p = s ? s.points.find((x) => x.id === pointId) : null;
      if (p) Object.assign(p, updates);
      save();
      return p;
    },

    /** { [tpsId]: vehicleId } untuk TPS yang masih menunggu pada rute aktif suatu truk */
    getAssignments() {
      const map = {};
      Object.keys(session.routes).forEach((vid) => {
        const s = session.routes[vid];
        if (!s || s.route.status === 'completed') return;
        s.points.forEach((p) => { if (p.status === 'pending') map[p.collection_point_id] = vid; });
      });
      return map;
    },

    /* ----- Riwayat muatan ----- */
    addLog(vehicleId, log) {
      const s = slot(vehicleId);
      if (!s) return null;
      const entry = Object.assign({}, log, { id: 'log-' + Date.now() + '-' + s.logs.length, timestamp: new Date().toISOString() });
      s.logs.push(entry);
      save();
      return entry;
    },
    getLogs: (vehicleId) => (slot(vehicleId) ? slot(vehicleId).logs : []),

    /** Reset simulasi: rute, muatan, status TPS. Jadwal shift & pengaturan waktu TIDAK dihapus. */
    reset() {
      const f = fresh();
      session.tps = f.tps;
      session.routes = {};
      session.vehicles.forEach((v) => { v.current_capacity = 0; v.status = 'available'; });
      save();
    }
  };
})();
