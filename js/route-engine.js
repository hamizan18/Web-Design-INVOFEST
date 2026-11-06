/**
 * MESIN RUTE, JADWAL & RE-ROUTING DINAMIS
 * 1. Membuat rute awal per truk (TSP + jarak jalan nyata).
 * 2. Menghitung perkiraan jam tiba tiap TPS berdasarkan jam mulai shift truk,
 *    waktu layanan per TPS, dan waktu bongkar di depot (termasuk rit berikutnya).
 * 3. Memantau muatan: peringatan bila TPS berikutnya diprediksi melebihi kapasitas.
 * 4. Re-routing: setelah bongkar di depot, muatan di-reset dan hanya TPS yang
 *    belum selesai yang dihitung ulang (TPS 'completed' tidak ikut).
 * 5. Riwayat muatan (audit log) dan ringkasan perjalanan.
 */
(function () {
  const store = SW.store;
  const T = SW.time;

  const toPoint = (tps) => ({
    id: tps.id, name: tps.name, latitude: tps.latitude, longitude: tps.longitude,
    estimated_volume: tps.estimated_volume, isDepot: false
  });
  const depotPoint = (d) => ({ id: d.id, name: d.name, latitude: d.latitude, longitude: d.longitude, isDepot: true });

  /**
   * Menyusun jam tiba tiap TPS.
   * tour      : urutan indeks titik, mis. [0, 3, 1, 2, 0] (0 = depot)
   * durations : matriks waktu tempuh (detik)
   * points    : titik-titik (indeks sama dengan matriks), memuat estimated_volume
   */
  function buildTimeline({ tour, durations, points, capacity, startMin, serviceMin, unloadMin }) {
    let t = startMin;
    let load = 0;
    let trip = 1;
    let prev = 0;
    const stops = [];
    for (let k = 1; k < tour.length - 1; k++) {
      const idx = tour[k];
      const vol = points[idx].estimated_volume;
      if (load > 0 && load + vol > capacity) {
        // penuh: kembali ke depot, bongkar, lalu berangkat lagi
        t += durations[prev][0] / 60 + unloadMin;
        load = 0;
        trip++;
        prev = 0;
      }
      t += durations[prev][idx] / 60;
      stops.push({ index: idx, eta: Math.round(t), trip });
      t += serviceMin;
      load += vol;
      prev = idx;
    }
    t += durations[prev][0] / 60 + unloadMin;
    return { stops, finishMin: Math.round(t), trips: trip };
  }

  function assertShift(vehicle) {
    const s = T.toMin(vehicle.shift.start);
    const e = T.toMin(vehicle.shift.end);
    if (isNaN(s) || isNaN(e) || e <= s) throw new Error(`Jadwal shift ${vehicle.vehicle_code} tidak valid. Perbaiki di tab Jadwal Shift.`);
    return { s, e };
  }

  function hasActiveRoute(vehicleId) {
    const r = store.getRoute(vehicleId);
    return Boolean(r && r.route.status !== 'completed' && r.points.some((p) => p.status === 'pending'));
  }

  const engine = {
    buildTimeline,
    hasActiveRoute,

    /** Usulan pembagian TPS yang tersedia ke seluruh truk aktif yang belum punya rute */
    autoAssign() {
      const assigned = store.getAssignments();
      const free = store.getTps().filter((t) => t.status !== 'completed' && !assigned[t.id]);
      if (!free.length) throw new Error('Tidak ada TPS yang tersedia untuk dibagi.');
      const trucks = store.getVehicles()
        .filter((v) => v.active !== false && !hasActiveRoute(v.id))
        .sort((a, b) => T.toMin(a.shift.start) - T.toMin(b.shift.start));
      if (!trucks.length) throw new Error('Tidak ada armada aktif yang bebas rute.');

      // Urutkan dari barat ke timur agar tiap truk mendapat wilayah yang berdekatan
      const sorted = free.slice().sort((a, b) => a.longitude - b.longitude);
      const target = sorted.reduce((s, t) => s + t.estimated_volume, 0) / trucks.length;
      const plan = trucks.map((v) => ({ vehicleId: v.id, tpsIds: [] }));
      let k = 0;
      let cum = 0;
      sorted.forEach((t) => {
        plan[k].tpsIds.push(t.id);
        cum += t.estimated_volume;
        if (k < plan.length - 1 && cum >= target * (k + 1)) k++;
      });
      return plan.filter((p) => p.tpsIds.length > 0);
    },

    /** Rute awal optimal untuk satu truk */
    async generateRoute({ vehicleId, depotId, tpsIds }) {
      if (!vehicleId || !depotId) throw new Error('Pilih depot dan armada terlebih dahulu');
      if (!Array.isArray(tpsIds) || tpsIds.length === 0) throw new Error('Pilih minimal 1 TPS yang akan dilayani');

      const vehicle = store.getVehicleById(vehicleId);
      const depot = store.getDepotById(depotId);
      if (!vehicle) throw new Error('Armada tidak ditemukan');
      if (!depot) throw new Error('Depot tidak ditemukan');
      if (vehicle.active === false) throw new Error(`${vehicle.vehicle_code} sedang dinonaktifkan. Aktifkan dulu di tab Jadwal Shift.`);
      const { e: shiftEnd } = assertShift(vehicle);

      const selected = tpsIds.map((id) => store.getTpsById(id));
      if (selected.some((t) => !t)) throw new Error('Ada TPS terpilih yang tidak valid');
      if (selected.some((t) => t.status === 'completed')) throw new Error('TPS yang sudah selesai tidak dapat dijadwalkan ulang');

      // TPS yang sedang ditugaskan ke truk lain tidak boleh dobel
      const assigned = store.getAssignments();
      const clash = selected.find((t) => assigned[t.id] && assigned[t.id] !== vehicleId);
      if (clash) {
        const other = store.getVehicleById(assigned[clash.id]);
        throw new Error(`${clash.name} sudah ditugaskan ke ${other ? other.vehicle_code : 'truk lain'}.`);
      }

      const points = [depotPoint(depot), ...selected.map(toPoint)];
      const matrix = await SW.geo.getDistanceMatrix(points);
      const tsp = SW.tsp.solveTSP(matrix.distances, 0);
      const ordered = tsp.tour.map((i) => points[i]);
      const geometry = await SW.geo.getRouteGeometry(ordered);

      const settings = store.getSettings();
      const startMin = T.toMin(vehicle.shift.start);
      const tl = buildTimeline({
        tour: tsp.tour, durations: matrix.durations, points, capacity: vehicle.capacity,
        startMin, serviceMin: settings.serviceMinutes, unloadMin: settings.unloadMinutes
      });

      const planned = [];
      let cumulative = 0;
      tl.stops.forEach((st, i) => {
        const p = points[st.index];
        cumulative += p.estimated_volume;
        planned.push({
          collection_point_id: p.id, sequence: i + 1, status: 'pending',
          estimated_volume: p.estimated_volume, name: p.name,
          latitude: p.latitude, longitude: p.longitude,
          predictedCumulativeWeight: cumulative,
          eta_min: st.eta, trip: st.trip
        });
      });

      const { route, points: saved } = store.createRoute(vehicle.id, {
        depot_id: depot.id,
        total_distance: geometry.totalDistance, total_duration: geometry.totalDuration,
        tsp_gain: `${tsp.improvementPercentage}%`,
        total_volume: cumulative,
        estimated_trips: tl.trips,
        start_min: startMin, finish_min: tl.finishMin, shift_end_min: shiftEnd,
        over_shift: tl.finishMin > shiftEnd,
        is_estimate: Boolean(geometry.isEstimate || matrix.isEstimate),
        status: 'active'
      }, planned);

      store.updateVehicle(vehicle.id, { status: 'in_route', current_capacity: 0 });
      selected.forEach((t) => store.updateTps(t.id, { status: 'planned' }));

      return {
        routeId: route.id,
        vehicleId: vehicle.id,
        depot,
        summary: {
          totalDistanceKm: (geometry.totalDistance / 1000).toFixed(2),
          totalTpsCount: planned.length,
          totalEstimatedVolume: cumulative,
          estimatedTrips: tl.trips,
          startMin, finishMin: tl.finishMin, overShift: tl.finishMin > shiftEnd,
          tspEfficiencyGain: `${tsp.improvementPercentage}%`,
          isEstimate: geometry.isEstimate || matrix.isEstimate
        },
        geometry: geometry.geometry,
        points: saved
      };
    },

    /** Detail rute suatu truk (tanpa geometri) */
    getRouteDetails(vehicleId) {
      const data = store.getRoute(vehicleId);
      if (!data) return null;
      const { route, points } = data;
      const vehicle = store.getVehicleById(vehicleId);
      const depot = store.getDepotById(route.depot_id);
      return {
        routeId: route.id,
        route,
        vehicle: {
          id: vehicle.id, code: vehicle.vehicle_code, short: vehicle.short, color: vehicle.color,
          plate_number: vehicle.plate_number, capacity: vehicle.capacity,
          current_capacity: vehicle.current_capacity, shift: vehicle.shift
        },
        depot,
        points: points.map((p) => {
          const t = store.getTpsById(p.collection_point_id);
          return Object.assign({}, p, { name: t.name, latitude: t.latitude, longitude: t.longitude, estimated_volume: t.estimated_volume });
        }),
        logs: store.getLogs(vehicleId)
      };
    },

    /** Geometri jalan untuk rute berjalan (hanya titik yang belum selesai) */
    async getActiveGeometry(vehicleId) {
      const d = this.getRouteDetails(vehicleId);
      if (!d) return null;
      const pending = d.points.filter((p) => p.status === 'pending');
      if (!pending.length) return null;
      const coords = [d.depot, ...pending, d.depot].map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
      const g = await SW.geo.getRouteGeometry(coords);
      return g.geometry;
    },

    /** Driver menandai TPS selesai + cek kapasitas prediktif */
    completePoint(vehicleId, collectionPointId, wasteActual = null) {
      const data = store.getRoute(vehicleId);
      if (!data) throw new Error('Truk ini belum punya rute aktif');
      const { points } = data;
      const vehicle = store.getVehicleById(vehicleId);
      const tps = store.getTpsById(collectionPointId);
      if (!tps) throw new Error('TPS tidak ditemukan');

      const target = points.find((p) => p.collection_point_id === collectionPointId);
      if (!target) throw new Error('TPS ini tidak ada dalam rute aktif');
      if (target.status === 'completed') return { success: false, message: 'TPS ini sudah ditandai selesai sebelumnya' };

      const waste = wasteActual !== null && wasteActual !== undefined ? parseFloat(wasteActual) : tps.estimated_volume;
      const before = vehicle.current_capacity;
      const after = before + waste;

      store.updateRoutePoint(vehicleId, target.id, { status: 'completed', actual_arrival: new Date().toISOString() });
      store.updateTps(collectionPointId, { status: 'completed' });
      store.addLog(vehicleId, { route_id: data.route.id, collection_point_id: collectionPointId, tps_name: tps.name, capacity_before: before, waste_collected: waste, capacity_after: after });
      store.updateVehicle(vehicleId, { current_capacity: after });

      const pending = store.getRoute(vehicleId).points.filter((p) => p.status === 'pending');

      let needDepotReturn = false;
      let alertMessage = null;
      let nextPoint = null;

      if (pending.length === 0) {
        store.updateRoute(vehicleId, { status: 'completed' });
        store.updateVehicle(vehicleId, { status: 'available' });
      } else if (after >= vehicle.capacity) {
        needDepotReturn = true;
        alertMessage = `Kapasitas ${vehicle.vehicle_code} penuh (${after} kg dari ${vehicle.capacity} kg). Muatan harus segera dibongkar di depot.`;
      } else {
        const next = store.getTpsById(pending[0].collection_point_id);
        nextPoint = { name: next.name, estimated_volume: next.estimated_volume };
        if (after + next.estimated_volume > vehicle.capacity) {
          needDepotReturn = true;
          alertMessage = `Prediksi melebihi kapasitas: ${next.name} diperkirakan ${next.estimated_volume} kg, sedangkan sisa ruang hanya ${vehicle.capacity - after} kg. Segera kembali ke depot untuk membongkar muatan.`;
        }
      }

      return {
        success: true,
        message: `${tps.name} selesai dilayani (+${waste} kg).`,
        currentCapacity: after,
        maxCapacity: vehicle.capacity,
        capacityPercentage: parseFloat(((after / vehicle.capacity) * 100).toFixed(1)),
        needDepotReturn, alertMessage,
        remainingPendingPointsCount: pending.length,
        nextPoint
      };
    },

    /** Atur muatan secara manual (simulasi sensor muatan) */
    updateCapacity(vehicleId, newKg) {
      if (!store.getRoute(vehicleId)) throw new Error('Truk ini belum punya rute aktif');
      const vehicle = store.getVehicleById(vehicleId);
      const value = parseFloat(newKg);
      if (isNaN(value) || value < 0) throw new Error('Nilai muatan tidak valid');
      store.updateVehicle(vehicleId, { current_capacity: value });
      const isFull = value >= vehicle.capacity;
      return {
        currentCapacity: value, maxCapacity: vehicle.capacity,
        capacityPercentage: parseFloat(((value / vehicle.capacity) * 100).toFixed(1)),
        needDepotReturn: isFull,
        message: isFull ? 'Kapasitas armada penuh. Segera menuju depot untuk membongkar muatan.' : 'Muatan berhasil diperbarui.'
      };
    },

    /** Alihkan armada ke depot */
    returnToDepot(vehicleId) {
      const data = store.getRoute(vehicleId);
      if (!data) throw new Error('Truk ini belum punya rute aktif');
      store.updateRoute(vehicleId, { status: 'rerouted' });
      return { status: 'heading_to_depot', depot: store.getDepotById(data.route.depot_id) };
    },

    /** Re-routing dinamis: reset muatan, hitung ulang hanya TPS yang belum selesai */
    async reroute(vehicleId) {
      const data = store.getRoute(vehicleId);
      if (!data) throw new Error('Truk ini belum punya rute aktif');
      const { route, points } = data;
      const vehicle = store.getVehicleById(vehicleId);
      const depot = store.getDepotById(route.depot_id);

      store.updateVehicle(vehicleId, { current_capacity: 0, status: 'in_route' });

      const remaining = points.filter((p) => p.status === 'pending');
      if (remaining.length === 0) {
        store.updateRoute(vehicleId, { status: 'completed' });
        store.updateVehicle(vehicleId, { status: 'available' });
        return { isCompleted: true, message: 'Seluruh TPS telah dilayani. Sesi rute selesai.' };
      }

      const tpsList = remaining.map((p) => store.getTpsById(p.collection_point_id));
      const pts = [depotPoint(depot), ...tpsList.map(toPoint)];

      const matrix = await SW.geo.getDistanceMatrix(pts);
      const tsp = SW.tsp.solveTSP(matrix.distances, 0);
      const ordered = tsp.tour.map((i) => pts[i]);
      const geometry = await SW.geo.getRouteGeometry(ordered);

      // Jam berangkat setelah bongkar: jam aplikasi sekarang bila masih dalam shift, jika tidak jam mulai shift
      const { s: shiftStart, e: shiftEnd } = assertShift(vehicle);
      const now = T.nowMin();
      const startMin = now >= shiftStart && now < shiftEnd ? now : shiftStart;
      const settings = store.getSettings();
      const tl = buildTimeline({
        tour: tsp.tour, durations: matrix.durations, points: pts, capacity: vehicle.capacity,
        startMin, serviceMin: settings.serviceMinutes, unloadMin: settings.unloadMinutes
      });

      tl.stops.forEach((st, i) => {
        const p = pts[st.index];
        const rp = remaining.find((r) => r.collection_point_id === p.id);
        if (rp) store.updateRoutePoint(vehicleId, rp.id, { sequence: i + 1, eta_min: st.eta, trip: st.trip });
      });

      store.updateRoute(vehicleId, {
        status: 'active',
        total_distance: geometry.totalDistance, total_duration: geometry.totalDuration,
        tsp_gain: `${tsp.improvementPercentage}%`,
        start_min: startMin, finish_min: tl.finishMin, shift_end_min: shiftEnd,
        over_shift: tl.finishMin > shiftEnd,
        is_estimate: Boolean(geometry.isEstimate || matrix.isEstimate)
      });

      return {
        isCompleted: false,
        message: `Re-routing berhasil: rute baru disusun untuk ${remaining.length} TPS yang tersisa. Muatan ${vehicle.vehicle_code} di-reset ke 0 kg.`,
        remainingTpsCount: remaining.length,
        newTotalDistanceKm: (geometry.totalDistance / 1000).toFixed(2),
        finishMin: tl.finishMin,
        overShift: tl.finishMin > shiftEnd,
        geometry: geometry.geometry
      };
    },

    /** Ringkasan perjalanan suatu truk */
    getSummary(vehicleId) {
      const d = this.getRouteDetails(vehicleId);
      if (!d) throw new Error('Truk ini belum punya rute aktif');
      const completed = d.points.filter((p) => p.status === 'completed').length;
      const total = d.points.length;
      return {
        status: d.route.status,
        vehicleCode: d.vehicle.code,
        shift: d.vehicle.shift,
        depotName: d.depot.name,
        totalDistanceKm: (d.route.total_distance / 1000).toFixed(2),
        completedPoints: completed,
        totalPoints: total,
        completionPercentage: total ? ((completed / total) * 100).toFixed(1) : '0.0',
        totalCollectedKg: d.logs.reduce((s, l) => s + l.waste_collected, 0),
        logs: d.logs
      };
    }
  };

  SW.engine = engine;
})();
