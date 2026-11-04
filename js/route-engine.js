/**
 * MESIN RUTE & RE-ROUTING DINAMIS
 * 1. Membuat rute awal (TSP + jarak jalan nyata).
 * 2. Memantau muatan: peringatan bila TPS berikutnya diprediksi melebihi kapasitas.
 * 3. Re-routing: setelah bongkar di depot, muatan di-reset dan hanya TPS yang
 *    belum selesai yang dihitung ulang (TPS 'completed' tidak ikut).
 * 4. Riwayat muatan (audit log) dan ringkasan perjalanan.
 */
(function () {
  const store = SW.store;

  const toPoint = (tps) => ({
    id: tps.id, name: tps.name, latitude: tps.latitude, longitude: tps.longitude,
    estimated_volume: tps.estimated_volume, isDepot: false
  });
  const depotPoint = (d) => ({ id: d.id, name: d.name, latitude: d.latitude, longitude: d.longitude, isDepot: true });

  // Rit = satu perjalanan penuh depot -> TPS -> depot. Dipakai untuk estimasi jumlah rit.
  function planTrips(volumes, capacity) {
    let trip = 1, load = 0;
    return volumes.map((v) => {
      if (load > 0 && load + v > capacity) { trip++; load = 0; }
      load += v;
      return trip;
    });
  }

  const engine = {
    planTrips,

    /** Rute awal optimal */
    async generateRoute({ vehicleId, depotId, tpsIds }) {
      if (!vehicleId || !depotId) throw new Error('Pilih depot dan armada terlebih dahulu');
      if (!Array.isArray(tpsIds) || tpsIds.length === 0) throw new Error('Pilih minimal 1 TPS yang akan dilayani');

      const vehicle = store.getVehicleById(vehicleId);
      const depot = store.getDepotById(depotId);
      if (!vehicle) throw new Error('Armada tidak ditemukan');
      if (!depot) throw new Error('Depot tidak ditemukan');

      const selected = tpsIds.map((id) => store.getTpsById(id));
      if (selected.some((t) => !t)) throw new Error('Ada TPS terpilih yang tidak valid');
      if (selected.some((t) => t.status === 'completed')) throw new Error('TPS yang sudah selesai tidak dapat dijadwalkan ulang');

      const points = [depotPoint(depot), ...selected.map(toPoint)];

      const matrix = await SW.geo.getDistanceMatrix(points);
      const tsp = SW.tsp.solveTSP(matrix.distances, 0);
      const ordered = tsp.tour.map((i) => points[i]);
      const geometry = await SW.geo.getRouteGeometry(ordered);

      const planned = [];
      let seq = 1, cumulative = 0;
      for (let i = 1; i < tsp.tour.length - 1; i++) {
        const p = points[tsp.tour[i]];
        cumulative += p.estimated_volume;
        planned.push({
          collection_point_id: p.id, sequence: seq++, status: 'pending',
          estimated_volume: p.estimated_volume, name: p.name,
          latitude: p.latitude, longitude: p.longitude,
          predictedCumulativeWeight: cumulative
        });
      }

      const trips = planTrips(planned.map((p) => p.estimated_volume), vehicle.capacity);

      const { route, points: saved } = store.createRoute({
        vehicle_id: vehicle.id, depot_id: depot.id,
        total_distance: geometry.totalDistance, total_duration: geometry.totalDuration,
        tsp_gain: `${tsp.improvementPercentage}%`,
        total_volume: cumulative,
        estimated_trips: Math.max(...trips),
        is_estimate: Boolean(geometry.isEstimate || matrix.isEstimate),
        status: 'active'
      }, planned);

      store.updateVehicle(vehicle.id, { status: 'in_route', current_capacity: 0 });
      selected.forEach((t) => store.updateTps(t.id, { status: 'planned' }));

      return {
        routeId: route.id,
        vehicle: { id: vehicle.id, code: vehicle.vehicle_code, capacity: vehicle.capacity, current_capacity: 0 },
        depot,
        summary: {
          totalDistanceKm: (geometry.totalDistance / 1000).toFixed(2),
          totalDurationMinutes: Math.round(geometry.totalDuration / 60),
          totalTpsCount: planned.length,
          totalEstimatedVolume: cumulative,
          estimatedTrips: Math.max(...trips),
          tspEfficiencyGain: `${tsp.improvementPercentage}%`,
          isEstimate: geometry.isEstimate || matrix.isEstimate
        },
        geometry: geometry.geometry,
        points: saved
      };
    },

    /** Detail rute aktif (tanpa geometri; geometri diambil terpisah bila perlu) */
    getRouteDetails() {
      const data = store.getRoute();
      if (!data) return null;
      const { route, points } = data;
      const vehicle = store.getVehicleById(route.vehicle_id);
      const depot = store.getDepotById(route.depot_id);
      return {
        routeId: route.id,
        route,
        vehicle: { id: vehicle.id, code: vehicle.vehicle_code, plate_number: vehicle.plate_number, capacity: vehicle.capacity, current_capacity: vehicle.current_capacity },
        depot,
        points: points.map((p) => {
          const t = store.getTpsById(p.collection_point_id);
          return Object.assign({}, p, { name: t.name, latitude: t.latitude, longitude: t.longitude, estimated_volume: t.estimated_volume });
        }),
        logs: store.getLogs()
      };
    },

    /** Geometri jalan untuk rute yang sedang berjalan (hanya titik yang belum selesai) */
    async getActiveGeometry() {
      const d = this.getRouteDetails();
      if (!d) return null;
      const pending = d.points.filter((p) => p.status === 'pending');
      if (!pending.length) return null;
      const coords = [d.depot, ...pending, d.depot].map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
      const g = await SW.geo.getRouteGeometry(coords);
      return g.geometry;
    },

    /** Driver menandai TPS selesai + cek kapasitas prediktif */
    completePoint(collectionPointId, wasteActual = null) {
      const data = store.getRoute();
      if (!data) throw new Error('Belum ada rute aktif');
      const { route, points } = data;
      const vehicle = store.getVehicleById(route.vehicle_id);
      const tps = store.getTpsById(collectionPointId);
      if (!tps) throw new Error('TPS tidak ditemukan');

      const target = points.find((p) => p.collection_point_id === collectionPointId);
      if (!target) throw new Error('TPS ini tidak ada dalam rute aktif');
      if (target.status === 'completed') return { success: false, message: 'TPS ini sudah ditandai selesai sebelumnya' };

      const waste = wasteActual !== null && wasteActual !== undefined ? parseFloat(wasteActual) : tps.estimated_volume;
      const before = vehicle.current_capacity;
      const after = before + waste;

      store.updateRoutePoint(target.id, { status: 'completed', actual_arrival: new Date().toISOString() });
      store.updateTps(collectionPointId, { status: 'completed' });
      store.addLog({ route_id: route.id, collection_point_id: collectionPointId, tps_name: tps.name, capacity_before: before, waste_collected: waste, capacity_after: after });
      store.updateVehicle(vehicle.id, { current_capacity: after });

      const pending = store.getRoute().points.filter((p) => p.status === 'pending');

      let needDepotReturn = false;
      let alertMessage = null;
      let nextPoint = null;

      if (pending.length === 0) {
        // Seluruh TPS selesai: rute berakhir di depot
        store.updateRoute({ status: 'completed' });
        store.updateVehicle(vehicle.id, { status: 'available' });
      } else if (after >= vehicle.capacity) {
        needDepotReturn = true;
        alertMessage = `Kapasitas armada penuh (${after} kg dari ${vehicle.capacity} kg). Muatan harus segera dibongkar di depot.`;
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
        needDepotReturn,
        alertMessage,
        remainingPendingPointsCount: pending.length,
        nextPoint
      };
    },

    /** Atur muatan secara manual (simulasi sensor muatan) */
    updateCapacity(newKg) {
      const data = store.getRoute();
      if (!data) throw new Error('Belum ada rute aktif');
      const vehicle = store.getVehicleById(data.route.vehicle_id);
      const value = parseFloat(newKg);
      if (isNaN(value) || value < 0) throw new Error('Nilai muatan tidak valid');
      store.updateVehicle(vehicle.id, { current_capacity: value });
      const isFull = value >= vehicle.capacity;
      return {
        currentCapacity: value, maxCapacity: vehicle.capacity,
        capacityPercentage: parseFloat(((value / vehicle.capacity) * 100).toFixed(1)),
        needDepotReturn: isFull,
        message: isFull ? 'Kapasitas armada penuh. Segera menuju depot untuk membongkar muatan.' : 'Muatan berhasil diperbarui.'
      };
    },

    /** Alihkan armada ke depot */
    returnToDepot() {
      const data = store.getRoute();
      if (!data) throw new Error('Belum ada rute aktif');
      store.updateRoute({ status: 'rerouted' });
      return { status: 'heading_to_depot', depot: store.getDepotById(data.route.depot_id) };
    },

    /** Re-routing dinamis: reset muatan, hitung ulang hanya TPS yang belum selesai */
    async reroute() {
      const data = store.getRoute();
      if (!data) throw new Error('Belum ada rute aktif');
      const { route, points } = data;
      const vehicle = store.getVehicleById(route.vehicle_id);
      const depot = store.getDepotById(route.depot_id);

      store.updateVehicle(vehicle.id, { current_capacity: 0, status: 'in_route' });

      const remaining = points.filter((p) => p.status === 'pending');
      if (remaining.length === 0) {
        store.updateRoute({ status: 'completed' });
        store.updateVehicle(vehicle.id, { status: 'available' });
        return { isCompleted: true, message: 'Seluruh TPS telah dilayani. Sesi rute selesai.' };
      }

      const tpsList = remaining.map((p) => store.getTpsById(p.collection_point_id));
      const pts = [depotPoint(depot), ...tpsList.map(toPoint)];

      const matrix = await SW.geo.getDistanceMatrix(pts);
      const tsp = SW.tsp.solveTSP(matrix.distances, 0);
      const ordered = tsp.tour.map((i) => pts[i]);
      const geometry = await SW.geo.getRouteGeometry(ordered);

      let seq = 1;
      for (let i = 1; i < tsp.tour.length - 1; i++) {
        const p = pts[tsp.tour[i]];
        const rp = remaining.find((r) => r.collection_point_id === p.id);
        if (rp) store.updateRoutePoint(rp.id, { sequence: seq++ });
      }

      store.updateRoute({
        status: 'active',
        total_distance: geometry.totalDistance, total_duration: geometry.totalDuration,
        tsp_gain: `${tsp.improvementPercentage}%`,
        is_estimate: Boolean(geometry.isEstimate || matrix.isEstimate)
      });

      return {
        isCompleted: false,
        message: `Re-routing berhasil: rute baru disusun untuk ${remaining.length} TPS yang tersisa. Muatan armada di-reset ke 0 kg.`,
        remainingTpsCount: remaining.length,
        newTotalDistanceKm: (geometry.totalDistance / 1000).toFixed(2),
        newTotalDurationMinutes: Math.round(geometry.totalDuration / 60),
        geometry: geometry.geometry
      };
    },

    /** Ringkasan perjalanan */
    getSummary() {
      const d = this.getRouteDetails();
      if (!d) throw new Error('Belum ada rute aktif');
      const completed = d.points.filter((p) => p.status === 'completed').length;
      const total = d.points.length;
      const collected = d.logs.reduce((s, l) => s + l.waste_collected, 0);
      return {
        status: d.route.status,
        vehicleCode: d.vehicle.code,
        depotName: d.depot.name,
        totalDistanceKm: (d.route.total_distance / 1000).toFixed(2),
        totalDurationMinutes: Math.round(d.route.total_duration / 60),
        completedPoints: completed,
        totalPoints: total,
        completionPercentage: total ? ((completed / total) * 100).toFixed(1) : '0.0',
        totalCollectedKg: collected,
        logs: d.logs
      };
    }
  };

  SW.engine = engine;
})();
