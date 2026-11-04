/**
 * LAYANAN PETA & JARAK
 * 1. Matriks jarak & waktu antar titik dari OSRM (jaringan jalan nyata).
 * 2. Garis rute jalan (GeoJSON) dari OSRM.
 * Bila OSRM tidak dapat dijangkau (offline / lambat), otomatis memakai
 * perhitungan Haversine x 1,3 sebagai estimasi jarak jalan.
 */
(function () {
  const OSRM_BASE = 'https://router.project-osrm.org';
  const TIMEOUT_MS = 9000;
  const AVG_SPEED_MS = 6.94; // ~25 km/jam, kecepatan rata-rata kendaraan sampah dalam kota
  const ROAD_FACTOR = 1.3;

  const geo = {
    // 'osrm' | 'estimasi' | null  (sumber data pada perhitungan terakhir)
    lastSource: null,

    haversineMeters(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * ROAD_FACTOR);
    },

    coordString(points) {
      // OSRM memakai urutan: longitude,latitude
      return points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
    },

    async fetchJson(path) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(OSRM_BASE + path, { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },

    estimateMatrix(points) {
      const n = points.length;
      const distances = Array.from({ length: n }, () => new Array(n).fill(0));
      const durations = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = this.haversineMeters(points[i].latitude, points[i].longitude, points[j].latitude, points[j].longitude);
          distances[i][j] = d;
          durations[i][j] = Math.round(d / AVG_SPEED_MS);
        }
      }
      return { distances, durations, isEstimate: true };
    },

    async getDistanceMatrix(points) {
      if (!points || points.length < 2) throw new Error('Diperlukan minimal 2 titik untuk menghitung matriks jarak');
      try {
        const json = await this.fetchJson(`/table/v1/driving/${this.coordString(points)}?annotations=distance,duration`);
        if (json.code !== 'Ok' || !json.distances) throw new Error('Respons OSRM tidak valid');
        // Sel null (tidak ada jalur) diganti estimasi agar algoritma tetap berjalan
        const est = this.estimateMatrix(points);
        const distances = json.distances.map((row, i) => row.map((v, j) => (v == null ? est.distances[i][j] : v)));
        const durations = json.durations.map((row, i) => row.map((v, j) => (v == null ? est.durations[i][j] : v)));
        this.lastSource = 'osrm';
        return { distances, durations, isEstimate: false };
      } catch (err) {
        this.lastSource = 'estimasi';
        return this.estimateMatrix(points);
      }
    },

    async getRouteGeometry(points) {
      if (!points || points.length < 2) throw new Error('Diperlukan minimal 2 titik untuk membuat rute');
      try {
        const json = await this.fetchJson(`/route/v1/driving/${this.coordString(points)}?overview=full&geometries=geojson&steps=false`);
        if (json.code !== 'Ok' || !json.routes || !json.routes.length) throw new Error('Rute OSRM tidak ditemukan');
        const r = json.routes[0];
        this.lastSource = 'osrm';
        return {
          totalDistance: Math.round(r.distance),
          totalDuration: Math.round(r.duration),
          geometry: r.geometry,
          isEstimate: false
        };
      } catch (err) {
        this.lastSource = 'estimasi';
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
          total += this.haversineMeters(points[i].latitude, points[i].longitude, points[i + 1].latitude, points[i + 1].longitude);
        }
        return {
          totalDistance: total,
          totalDuration: Math.round(total / AVG_SPEED_MS),
          geometry: { type: 'LineString', coordinates: points.map((p) => [p.longitude, p.latitude]) },
          isEstimate: true
        };
      }
    }
  };

  SW.geo = geo;
})();
