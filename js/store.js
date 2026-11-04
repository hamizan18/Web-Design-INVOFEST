/**
 * PENYIMPANAN DATA DI BROWSER
 * Menyimpan kondisi simulasi (status TPS, muatan armada, rute, riwayat)
 * pada localStorage agar tidak hilang saat halaman dimuat ulang.
 * Jika localStorage tidak tersedia, aplikasi tetap berjalan di memori.
 */
(function () {
  const KEY = 'sw-lhokseumawe-sesi-v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function fresh() {
    return {
      vehicles: clone(SW.DATA.vehicles),
      tps: clone(SW.DATA.collection_points),
      route: null,
      routePoints: [],
      logs: []
    };
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.tps) && Array.isArray(s.vehicles)) return s;
      }
    } catch (e) { /* abaikan, pakai data awal */ }
    return fresh();
  }

  let session = load();

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* abaikan */ }
  }

  SW.store = {
    getDepots: () => SW.DATA.depots,
    getDepotById: (id) => SW.DATA.depots.find((d) => d.id === id) || null,

    getVehicles: () => session.vehicles,
    getVehicleById: (id) => session.vehicles.find((v) => v.id === id) || null,
    updateVehicle(id, updates) {
      const v = this.getVehicleById(id);
      if (v) Object.assign(v, updates);
      save();
      return v;
    },

    getTps: () => session.tps,
    getTpsById: (id) => session.tps.find((t) => t.id === id) || null,
    updateTps(id, updates) {
      const t = this.getTpsById(id);
      if (t) Object.assign(t, updates);
      save();
      return t;
    },

    createRoute(routeData, points) {
      const id = 'rute-' + Date.now();
      session.route = Object.assign({}, routeData, { id, created_at: new Date().toISOString() });
      session.routePoints = points.map((p, i) => Object.assign({}, p, { id: `${id}-p${i + 1}`, route_id: id }));
      session.logs = [];
      save();
      return { route: session.route, points: session.routePoints };
    },
    getRoute() {
      return session.route ? { route: session.route, points: session.routePoints.slice().sort((a, b) => a.sequence - b.sequence) } : null;
    },
    updateRoute(updates) {
      if (session.route) Object.assign(session.route, updates);
      save();
      return session.route;
    },
    updateRoutePoint(id, updates) {
      const p = session.routePoints.find((x) => x.id === id);
      if (p) Object.assign(p, updates);
      save();
      return p;
    },

    addLog(log) {
      const entry = Object.assign({}, log, { id: 'log-' + Date.now() + '-' + session.logs.length, timestamp: new Date().toISOString() });
      session.logs.push(entry);
      save();
      return entry;
    },
    getLogs: () => session.logs,

    reset() {
      session = fresh();
      save();
    }
  };
})();
