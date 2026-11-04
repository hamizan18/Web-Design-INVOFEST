/**
 * VISUALISASI PETA (Leaflet + OpenStreetMap/CARTO)
 */
(function () {
  let map = null;
  let markersLayer = null;
  let routeLayer = null;

  const esc = (s) => SW.ui.esc(s);

  SW.map = {
    init(containerId) {
      if (map) return map;
      map = L.map(containerId, { zoomControl: true }).setView(SW.DATA.mapCenter, 12);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);
      markersLayer = L.layerGroup().addTo(map);
      return map;
    },

    refresh() {
      if (!map) return;
      setTimeout(() => {
        map.invalidateSize();
        if (routeLayer) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
      }, 80);
    },

    /** Gambar depot dan seluruh TPS. activePoints = titik pada rute aktif (jika ada). */
    renderMarkers(depot, tpsList, activePoints = []) {
      if (!markersLayer) return;
      markersLayer.clearLayers();
      const bounds = [];

      if (depot) {
        const icon = L.divIcon({
          className: '',
          html: '<div class="map-marker marker-depot" style="width:36px;height:36px" aria-hidden="true">🏭</div>',
          iconSize: [36, 36], iconAnchor: [18, 18]
        });
        L.marker([depot.latitude, depot.longitude], { icon, title: depot.name, alt: depot.name })
          .bindPopup(`<div class="popup"><span class="badge badge-blue">DEPOT / TPA</span><h4>${esc(depot.name)}</h4><p>${esc(depot.address || '')}</p></div>`)
          .addTo(markersLayer);
        bounds.push([depot.latitude, depot.longitude]);
      }

      tpsList.forEach((t) => {
        const rp = activePoints.find((p) => p.collection_point_id === t.id);
        const status = rp ? rp.status : t.status;
        const seq = rp && rp.status === 'pending' ? rp.sequence : null;

        let cls = 'marker-waiting';
        let label = String(t.estimated_volume);
        let badge = 'badge-amber';
        let text = 'MENUNGGU';
        if (status === 'completed') { cls = 'marker-done'; label = '✓'; badge = 'badge-green'; text = 'SELESAI'; }
        else if (seq !== null) { cls = 'marker-route'; label = '#' + seq; badge = 'badge-cyan'; text = 'DALAM RUTE'; }

        const icon = L.divIcon({
          className: '',
          html: `<div class="map-marker ${cls}" style="width:32px;height:32px" aria-hidden="true">${label}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16]
        });
        L.marker([t.latitude, t.longitude], { icon, title: t.name, alt: t.name })
          .bindPopup(`<div class="popup"><span class="badge ${badge}">${text}</span>${seq !== null ? ` <b>Stop #${seq}</b>` : ''}<h4>${esc(t.name)}</h4><p>Estimasi sampah: <b>${t.estimated_volume} kg</b></p></div>`)
          .addTo(markersLayer);
        bounds.push([t.latitude, t.longitude]);
      });

      if (bounds.length && !routeLayer) map.fitBounds(bounds, { padding: [40, 40] });
    },

    /** Gambar garis rute (GeoJSON [lon, lat]) */
    drawRoute(geojson) {
      if (!map || !geojson) return;
      this.clearRoute();
      const latLngs = geojson.coordinates.map((c) => [c[1], c[0]]);
      const glow = L.polyline(latLngs, { color: '#34d399', weight: 9, opacity: 0.28 });
      const line = L.polyline(latLngs, { color: '#059669', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' });
      routeLayer = L.featureGroup([glow, line]).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [50, 50] });
    },

    clearRoute() {
      if (routeLayer && map) { map.removeLayer(routeLayer); routeLayer = null; }
    }
  };
})();
