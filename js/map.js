/**
 * VISUALISASI PETA (Leaflet + OpenStreetMap / CARTO / Esri)
 *
 * Modul ini adalah "pabrik" peta: SW.map.create({ noticeId }) membuat satu tampilan peta
 * mandiri. Dashboard Admin memakai SW.map (satu tampilan bawaan, #map), sedangkan Portal
 * Driver membuat tampilan sendiri sehingga keduanya dapat menggambar rute yang sama.
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
  const esc = (s) => SW.ui.esc(s);

  function createView(cfg) {
    const noticeId = (cfg && cfg.noticeId) || 'mapNotice';

    let map = null;
    let markersLayer = null;
    let routeLayer = null;   // seluruh rute sisa (depot -> TPS -> depot)
    let legLayer = null;     // ruas menuju tujuan berikutnya (disorot)
    let originLayer = null;  // penanda titik berangkat armada
    let markerBounds = [];
    let layers = [];
    let current = 0;
    let autoSwitching = false;

    function showNotice(text) {
      const el = document.getElementById(noticeId);
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

    const padding = { padding: [44, 44], maxZoom: 17 };

    const view = {
      get ready() { return Boolean(map); },

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
        originLayer = L.layerGroup().addTo(map);
        return map;
      },

      /** Hitung ulang ukuran (mis. setelah peta yang tadinya tersembunyi ditampilkan) lalu sesuaikan bingkai ke rute. */
      refresh() {
        if (!map) return;
        setTimeout(() => {
          map.invalidateSize();
          if (routeLayer) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }, 80);
      },

      /** Hanya hitung ulang ukuran, tanpa mengubah bingkai. */
      invalidate() {
        if (!map) return;
        setTimeout(() => map.invalidateSize(), 80);
      },

      /**
       * Gambar depot dan seluruh TPS.
       * activePoints : titik pada rute truk yang sedang dipilih
       * others       : { [tpsId]: { short, color, code } } TPS yang ditugaskan ke truk lain
       * opts         : { fit: sesuaikan bingkai ke semua titik (bawaan true bila belum ada rute),
       *                  highlightId: id TPS tujuan berikutnya, diberi lingkaran sorot }
       */
      renderMarkers(depot, tpsList, activePoints = [], others = {}, opts = {}) {
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

          const isNext = opts.highlightId && opts.highlightId === t.id && seq !== null;
          if (isNext) cls += ' marker-next';

          const eta = rp && seq !== null && rp.eta_min != null ? `<p>Perkiraan tiba: <b>${SW.time.fmt(rp.eta_min)}</b></p>` : '';

          const icon = L.divIcon({
            className: '',
            html: `<div class="map-marker ${cls}" style="width:32px;height:32px" aria-hidden="true">${esc(label)}</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16]
          });
          L.marker([t.latitude, t.longitude], { icon, title: t.name, alt: t.name, zIndexOffset: isNext ? 800 : 0 })
            .bindPopup(`<div class="popup"><span class="badge ${badge}">${text}</span>${seq !== null ? ` <b>Stop #${seq}</b>` : ''}${isNext ? ' <b>· Tujuan berikutnya</b>' : ''}<h4>${esc(t.name)}</h4><p>Estimasi sampah: <b>${t.estimated_volume} kg</b></p>${eta}${extra}</div>`)
            .addTo(markersLayer);
          bounds.push([t.latitude, t.longitude]);
        });

        markerBounds = bounds;
        const wantFit = opts.fit === undefined ? !routeLayer : opts.fit;
        if (bounds.length && wantFit) map.fitBounds(bounds, { padding: [40, 40] });
      },

      /**
       * Gambar garis rute (GeoJSON [lon, lat]) dengan warna truk.
       * opts: { fit: sesuaikan bingkai (bawaan true), subtle: garis putus-putus tipis (rute sisa di latar) }
       */
      drawRoute(geojson, color, opts = {}) {
        if (!map || !geojson) return;
        view.clearRoute();
        const c = color || '#059669';
        const latLngs = geojson.coordinates.map((p) => [p[1], p[0]]);
        let parts;
        if (opts.subtle) {
          parts = [L.polyline(latLngs, { color: c, weight: 4, opacity: 0.6, dashArray: '9 9', lineCap: 'round', lineJoin: 'round' })];
        } else {
          parts = [
            L.polyline(latLngs, { color: c, weight: 9, opacity: 0.25 }),
            L.polyline(latLngs, { color: c, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' })
          ];
        }
        routeLayer = L.featureGroup(parts).addTo(map);
        if (opts.subtle) routeLayer.bringToBack();
        if (opts.fit !== false) map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
      },

      clearRoute() {
        if (routeLayer && map) { map.removeLayer(routeLayer); routeLayer = null; }
      },

      /** Sorot ruas menuju tujuan berikutnya: selubung putih + garis tebal warna truk */
      drawLeg(geojson, color) {
        if (!map || !geojson) return;
        view.clearLeg();
        const c = color || '#059669';
        const latLngs = geojson.coordinates.map((p) => [p[1], p[0]]);
        legLayer = L.featureGroup([
          L.polyline(latLngs, { color: '#ffffff', weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }),
          L.polyline(latLngs, { color: c, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' })
        ]).addTo(map);
      },

      clearLeg() {
        if (legLayer && map) { map.removeLayer(legLayer); legLayer = null; }
      },

      /** Penanda titik berangkat armada (TPS terakhir yang dilayani atau depot). p = null untuk menghapus. */
      setOrigin(p, opts = {}) {
        if (!originLayer) return;
        originLayer.clearLayers();
        if (!p) return;
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-marker marker-truck" style="width:34px;height:34px;background:${esc(opts.color || '#059669')}" aria-hidden="true">🚛</div>`,
          iconSize: [34, 34], iconAnchor: [17, 17]
        });
        L.marker([p.latitude, p.longitude], { icon, title: p.name, alt: p.name, zIndexOffset: 1000 })
          .bindPopup(`<div class="popup"><span class="badge badge-blue">TITIK BERANGKAT</span><h4>${esc(p.name)}</h4><p>${esc(opts.label || 'Posisi armada pada rute ini')}</p></div>`)
          .addTo(originLayer);
      },

      /** Sesuaikan bingkai peta: 'leg' = ruas menuju tujuan, 'all' = seluruh rute sisa */
      fit(kind) {
        if (!map) return;
        map.invalidateSize();
        if (kind === 'leg' && legLayer) { map.fitBounds(legLayer.getBounds(), padding); return; }
        if (routeLayer) {
          const b = routeLayer.getBounds();
          if (legLayer) b.extend(legLayer.getBounds());
          map.fitBounds(b, padding);
          return;
        }
        if (markerBounds.length) map.fitBounds(markerBounds, { padding: [40, 40] });
      }
    };
    return view;
  }

  // Tampilan bawaan untuk Dashboard Admin (#map); tampilan lain dibuat lewat SW.map.create()
  const adminView = createView({ noticeId: 'mapNotice' });
  adminView.create = createView;
  SW.map = adminView;
})();
