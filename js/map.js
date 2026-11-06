/**
 * VISUALISASI PETA (Leaflet + OpenStreetMap / CARTO / Esri)
 *
 * Peta dasar punya 3 sumber. Jika sumber pertama gagal memuat tile (mis. diblokir
 * atau tidak ada internet), aplikasi otomatis mencoba sumber berikutnya. Pengguna
 * juga bisa memilih sendiri lewat kontrol lapisan di pojok kanan atas peta.
 * Titik TPS, depot, dan garis rute TETAP tampil walau peta dasar tidak termuat.
 */
(function () {
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const BASEMAPS = [
    {
      name: 'CARTO Voyager',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, subdomains: 'abcd', attribution: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' }
    },
    {
      name: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: OSM_ATTR }
    },
    {
      name: 'Esri Street',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    }
  ];

  const FAIL_LIMIT = 4; // jumlah tile gagal (tanpa satu pun berhasil) sebelum pindah sumber

  let map = null;
  let markersLayer = null;
  let routeLayer = null;
  let layers = [];
  let current = 0;
  let autoSwitching = false;

  const esc = (s) => SW.ui.esc(s);

  function showNotice(text) {
    const el = document.getElementById('mapNotice');
    if (!el) return;
    if (text) { el.textContent = text; el.hidden = false; } else { el.hidden = true; }
  }

  function wireLayer(layer, index) {
    let ok = 0;
    let fail = 0;
    layer.on('tileload', () => { ok++; if (index === current) showNotice(''); });
    layer.on('tileerror', () => {
      fail++;
      if (index !== current || ok > 0 || fail < FAIL_LIMIT) return;
      if (current < layers.length - 1) {
        const next = current + 1;
        showNotice(`Peta dasar "${BASEMAPS[current].name}" tidak termuat. Mencoba "${BASEMAPS[next].name}"…`);
        autoSwitching = true;
        map.removeLayer(layers[current]);
        current = next;
        layers[current].addTo(map);
        autoSwitching = false;
      } else {
        showNotice('Peta dasar tidak dapat dimuat. Periksa koneksi internet. Titik TPS dan garis rute tetap ditampilkan.');
      }
    });
  }

  SW.map = {
    init(containerId) {
      if (map) return map;
      map = L.map(containerId, { zoomControl: true }).setView(SW.DATA.mapCenter, 12);

      layers = BASEMAPS.map((b, i) => {
        const layer = L.tileLayer(b.url, b.options);
        wireLayer(layer, i);
        return layer;
      });
      layers[0].addTo(map);

      const choices = {};
      BASEMAPS.forEach((b, i) => { choices[b.name] = layers[i]; });
      L.control.layers(choices, null, { position: 'topright', collapsed: true }).addTo(map);

      // Jika pengguna memilih lapisan sendiri, catat sebagai lapisan aktif
      map.on('baselayerchange', (e) => {
        if (autoSwitching) return;
        const i = layers.indexOf(e.layer);
        if (i >= 0) { current = i; showNotice(''); }
      });

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

    /**
     * Gambar depot dan seluruh TPS.
     * activePoints : titik pada rute truk yang sedang dipilih
     * others       : { [tpsId]: { short, color, code } } TPS yang ditugaskan ke truk lain
     */
    renderMarkers(depot, tpsList, activePoints = [], others = {}) {
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
        const other = !rp && others[t.id] ? others[t.id] : null;

        let cls = 'marker-waiting';
        let label = String(t.estimated_volume);
        let badge = 'badge-amber';
        let text = 'MENUNGGU';
        let extra = '';
        if (status === 'completed') { cls = 'marker-done'; label = '✓'; badge = 'badge-green'; text = 'SELESAI'; }
        else if (seq !== null) { cls = 'marker-route'; label = '#' + seq; badge = 'badge-cyan'; text = 'DALAM RUTE'; }
        else if (other) { cls = 'marker-other'; label = other.short; badge = 'badge-purple'; text = 'TRUK LAIN'; extra = `<p>Ditugaskan ke <b>${esc(other.code)}</b></p>`; }

        const eta = rp && seq !== null && rp.eta_min != null ? `<p>Perkiraan tiba: <b>${SW.time.fmt(rp.eta_min)}</b></p>` : '';

        const icon = L.divIcon({
          className: '',
          html: `<div class="map-marker ${cls}" style="width:32px;height:32px" aria-hidden="true">${esc(label)}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16]
        });
        L.marker([t.latitude, t.longitude], { icon, title: t.name, alt: t.name })
          .bindPopup(`<div class="popup"><span class="badge ${badge}">${text}</span>${seq !== null ? ` <b>Stop #${seq}</b>` : ''}<h4>${esc(t.name)}</h4><p>Estimasi sampah: <b>${t.estimated_volume} kg</b></p>${eta}${extra}</div>`)
          .addTo(markersLayer);
        bounds.push([t.latitude, t.longitude]);
      });

      if (bounds.length && !routeLayer) map.fitBounds(bounds, { padding: [40, 40] });
    },

    /** Gambar garis rute (GeoJSON [lon, lat]) dengan warna truk */
    drawRoute(geojson, color) {
      if (!map || !geojson) return;
      this.clearRoute();
      const c = color || '#059669';
      const latLngs = geojson.coordinates.map((p) => [p[1], p[0]]);
      const glow = L.polyline(latLngs, { color: c, weight: 9, opacity: 0.25 });
      const line = L.polyline(latLngs, { color: c, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' });
      routeLayer = L.featureGroup([glow, line]).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [50, 50] });
    },

    clearRoute() {
      if (routeLayer && map) { map.removeLayer(routeLayer); routeLayer = null; }
    }
  };
})();
