/**
 * HERO SCENE — latar animasi isometrik pada bagian hero (.intro)
 * Meniru video referensi: jalan kuning yang tergambar, truk sampah yang
 * berkendara di jalan, tablet yang jatuh lalu menampilkan peta & daftar rute,
 * serta properti (kantong, tong, kotak, botol) yang muncul satu per satu.
 *
 * - Semua digambar sebagai SVG (tanpa video / gambar tambahan).
 * - Animasi hanya berjalan saat hero terlihat dan tab aktif (hemat CPU).
 * - Menghormati prefers-reduced-motion (tampil statis).
 * - Paralaks halus mengikuti pointer pada perangkat dengan mouse.
 */
(function () {
  'use strict';

  var host = document.getElementById('heroScene');
  if (!host) return;

  var hero = host.parentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 1200, H = 460;

  /* ------------------------------------------------------------------ */
  /* Helper bentuk                                                       */
  /* ------------------------------------------------------------------ */
  function pts(a) { return a.map(function (p) { return p[0] + ',' + p[1]; }).join(' '); }

  /** Kubus isometrik. (x,y) = titik bawah depan. */
  function cube(x, y, w, h, top, left, right) {
    var T = [[x, y - h - w / 2], [x + w, y - h], [x, y - h + w / 2], [x - w, y - h]];
    var L = [[x - w, y - h], [x, y - h + w / 2], [x, y + w / 2], [x - w, y]];
    var R = [[x, y - h + w / 2], [x + w, y - h], [x + w, y], [x, y + w / 2]];
    return '<polygon points="' + pts(L) + '" fill="' + left + '"/>' +
           '<polygon points="' + pts(R) + '" fill="' + right + '"/>' +
           '<polygon points="' + pts(T) + '" fill="' + top + '"/>';
  }
  /** Rongga terbuka di bagian atas kubus. */
  function opening(x, y, w, h, inset, fill) {
    var cx = x, cy = y - h, iw = w * inset;
    return '<polygon points="' + pts([[cx, cy - iw / 2], [cx + iw, cy], [cx, cy + iw / 2], [cx - iw, cy]]) + '" fill="' + fill + '"/>';
  }
  function shadow(cx, cy, rx, ry) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" class="hs-shadow" transform="rotate(14 ' + cx + ' ' + cy + ')"/>';
  }
  /** Bungkus properti: posisi via atribut, animasi masuk via CSS. */
  function prop(x, y, delay, inner, cls) {
    return '<g transform="translate(' + x + ' ' + y + ')"><g class="hs-pop" style="--d:' + delay + 's"><g class="' + (cls || '') + '">' + inner + '</g></g></g>';
  }

  /* ------------------------------------------------------------------ */
  /* Jalan                                                               */
  /* ------------------------------------------------------------------ */
  var ROADS = [
    { id: 'hsR1', d: 'M -40 70 C 30 150, 50 250, 140 320 S 330 430, 520 420 S 800 360, 1260 470', delay: 0 },
    { id: 'hsR2', d: 'M -60 200 C 120 230, 300 300, 700 520', delay: .25 },
    { id: 'hsR3', d: 'M 985 -30 C 975 110, 1040 190, 1000 320 C 985 390, 1022 440, 1010 520', delay: .5 }
  ];
  function roadSVG() {
    return ROADS.map(function (r) {
      var a = 'class="hs-road hs-draw ' , dly = 'style="--rd:' + r.delay + 's" pathLength="100" d="' + r.d + '"';
      return '<path ' + a + 'hs-road-glow" ' + dly + '/>' +
             '<path ' + a + 'hs-road-sh" transform="translate(5 8)" ' + dly + '/>' +
             '<path id="' + r.id + '" ' + a + 'hs-road-main" ' + dly + '/>' +
             '<path ' + a + 'hs-road-hi" transform="translate(-1 -2)" ' + dly + '/>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Truk                                                                */
  /* ------------------------------------------------------------------ */
  var TRUCK =
    '<g id="hsTruck">' +
      '<ellipse cx="2" cy="10" rx="19" ry="5.5" class="hs-shadow"/>' +
      '<rect x="-9" y="-9.6" width="6" height="3.2" rx="1" fill="#0f1a16"/><rect x="8" y="-9.6" width="6" height="3.2" rx="1" fill="#0f1a16"/>' +
      '<rect x="-9" y="6.8" width="6" height="3.2" rx="1" fill="#0f1a16"/><rect x="8" y="6.8" width="6" height="3.2" rx="1" fill="#0f1a16"/>' +
      '<rect x="-15" y="-6" width="21" height="15" rx="3" fill="#b9770a"/>' +
      '<rect x="-15" y="-8" width="21" height="14" rx="3" fill="#f2b33d"/>' +
      '<rect x="-13" y="-6" width="17" height="10" rx="2" fill="#ffd36e"/>' +
      '<rect x="-16.5" y="-5" width="3" height="4" rx="1" fill="#ff7a3d"/><rect x="-16.5" y="1" width="3" height="4" rx="1" fill="#ff7a3d"/>' +
      '<rect x="7" y="-6.5" width="10" height="13" rx="3" fill="#f4f7f2"/>' +
      '<rect x="12.5" y="-5" width="4" height="10" rx="1.5" fill="#26352f"/>' +
      '<rect x="8" y="-6.5" width="3" height="13" rx="1.5" fill="#dfe7e1"/>' +
    '</g>';

  var PARKED = [
    { x: 150, y: 62, a: 8, d: .3 },
    { x: 470, y: 44, a: -14, d: .45 },
    { x: 1135, y: 40, a: 58, d: .6 }
  ];
  var DRIVERS = [
    { road: 'hsR1', speed: 62, start: .06, dir: 1 },
    { road: 'hsR3', speed: 52, start: .1, dir: 1 },
    { road: 'hsR2', speed: 46, start: .85, dir: -1 }
  ];

  /* ------------------------------------------------------------------ */
  /* Properti                                                            */
  /* ------------------------------------------------------------------ */
  function props() {
    var s = '';
    // Kantong sampah gelap
    s += prop(618, 205, .9,
      shadow(5, 11, 17, 6) +
      '<path d="M -14 8 C -18 -6 -8 -16 -1 -15 C 4 -22 10 -17 9 -12 C 17 -9 19 3 12 9 C 6 12 -8 12 -14 8 Z" fill="#17233a"/>' +
      '<path d="M -8 -4 C -6 -11 0 -13 3 -11" stroke="#4d6a9a" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M 1 -15 L 5 -22 L 9 -16" fill="#0f182a"/>', 'hs-bob');
    // Tong biru
    s += prop(262, 78, 1.1,
      shadow(10, 14, 24, 8) + cube(0, 0, 17, 18, '#eaf1ff', '#2f6bdb', '#1f4fb0') + opening(0, 0, 17, 18, .62, '#c3d3f5') +
      cube(7, -10, 8, 8, '#ffffff', '#cfdcf7', '#b8c9ee'));
    // Kotak peach terbuka
    s += prop(58, 378, 1.25,
      shadow(8, 12, 22, 7) + cube(0, 0, 16, 14, '#ffd9c5', '#f4a98a', '#e48d6c') + opening(0, 0, 16, 14, .66, '#d9533a'));
    // Botol hijau (botol terguling)
    s += prop(560, 352, 2.3,
      shadow(2, 12, 20, 5) +
      '<g transform="rotate(-62)"><rect x="-17" y="-5" width="24" height="10" rx="5" fill="#27e24a"/>' +
      '<rect x="5" y="-3" width="13" height="6" rx="2.5" fill="#1fbd3d"/><rect x="-14" y="-3" width="12" height="2.2" rx="1" fill="#9dfdb0" opacity=".8"/></g>' +
      '<g transform="translate(-16 10) rotate(24)"><rect x="-6" y="-5" width="12" height="10" rx="3" fill="#27e24a"/></g>', 'hs-bob');
    // Kubus ungu
    s += prop(300, 410, 2.6, shadow(6, 12, 22, 7) + cube(0, 0, 14, 14, '#9a6dff', '#6a35e6', '#4f22bd'));
    s += prop(338, 400, 2.75, shadow(4, 11, 16, 6) + cube(0, 0, 11, 11, '#9a6dff', '#6a35e6', '#4f22bd'));
    // Tong merah
    s += prop(705, 408, 3.1,
      shadow(10, 14, 26, 8) + cube(0, 0, 16, 18, '#ff8a8a', '#e23b4e', '#b92338') + opening(0, 0, 16, 18, .6, '#7b1424'));
    // Kubus ungu kanan bawah
    s += prop(1120, 392, 3.5, shadow(6, 12, 22, 7) + cube(0, 0, 14, 14, '#9a6dff', '#6a35e6', '#4f22bd'));
    s += prop(1158, 404, 3.65, shadow(4, 11, 16, 6) + cube(0, 0, 11, 11, '#9a6dff', '#6a35e6', '#4f22bd'));
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Tablet (isometrik via matriks afin) dengan layar peta & daftar rute */
  /* ------------------------------------------------------------------ */
  function mapScreen() {
    var markers = [[60, 62], [108, 150], [140, 96], [172, 60], [58, 216], [232, 66], [98, 252], [178, 232], [300, 52]];
    var m = markers.map(function (p, i) {
      return '<g transform="translate(' + p[0] + ' ' + p[1] + ')"><g class="hs-ping" style="--d:' + (i * .3) + 's"><rect x="-5" y="-3" width="10" height="6" rx="2" fill="#f2b33d"/><rect x="2" y="-2" width="2.5" height="4" rx="1" fill="#26352f"/></g></g>';
    }).join('');
    return '<g class="hs-screen-map">' +
      '<rect x="10" y="10" width="380" height="270" fill="#eaf0ea"/>' +
      '<path d="M 252 10 C 262 58 238 92 268 130 C 292 166 262 204 282 280 L 390 280 L 390 10 Z" fill="#9fdcea"/>' +
      '<path d="M 252 10 C 262 58 238 92 268 130 C 292 166 262 204 282 280" fill="none" stroke="#c9eef5" stroke-width="3"/>' +
      '<ellipse cx="118" cy="104" rx="34" ry="19" fill="#cdebd8"/><ellipse cx="200" cy="208" rx="30" ry="16" fill="#cdebd8"/><ellipse cx="52" cy="246" rx="22" ry="12" fill="#d6efdf"/>' +
      '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".95">' +
        '<path d="M 10 130 C 90 120 150 160 250 150"/><path d="M 80 10 C 90 90 70 190 120 280"/><path d="M 10 200 C 120 210 190 250 270 240"/><path d="M 170 10 C 180 80 160 150 190 280"/></g>' +
      m +
      '<path class="hs-route" pathLength="100" d="M 120 232 L 165 232 L 165 186 L 215 186 L 215 140 L 262 140 L 262 98 L 305 98" fill="none" stroke="#1c2b26" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path class="hs-route" pathLength="100" d="M 120 232 L 165 232 L 165 186 L 215 186 L 215 140 L 262 140 L 262 98 L 305 98" fill="none" stroke="#f2b33d" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="120" cy="232" r="5" fill="#fff" stroke="#1c2b26" stroke-width="2"/>' +
      '<g transform="translate(215 136)"><g class="hs-bubble">' +
        '<path d="M -52 -42 h 104 a 10 10 0 0 1 10 10 v 18 a 10 10 0 0 1 -10 10 h -44 l -6 8 l -6 -8 h -48 a 10 10 0 0 1 -10 -10 v -18 a 10 10 0 0 1 10 -10 z" fill="#15221e"/>' +
        '<circle cx="-34" cy="-23" r="9" fill="none" stroke="#3a4a44" stroke-width="3"/>' +
        '<circle cx="-34" cy="-23" r="9" fill="none" stroke="#f2b33d" stroke-width="3" stroke-dasharray="46 57" stroke-linecap="round" transform="rotate(-90 -34 -23)"/>' +
        '<text x="-34" y="-21" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">82%</text>' +
        '<text x="-18" y="-26" font-size="8.5" font-weight="800" fill="#fff">Truk A</text>' +
        '<text x="-18" y="-16" font-size="6" fill="#9db3a9">Menuju TPA Alue Lim</text>' +
      '</g></g>' +
      '<g transform="translate(200 254)"><rect x="-58" y="-13" width="116" height="26" rx="13" fill="#fff" opacity=".92"/>' +
        '<g fill="none" stroke="#26352f" stroke-width="1.4" stroke-linecap="round"><path d="M -36 -4 v 8 M -32 -6 v 12 M -28 -3 v 6"/><rect x="18" y="-5" width="9" height="9" rx="2.2"/></g>' +
        '<text x="-22" y="2.5" font-size="6.5" font-weight="700" fill="#26352f">Rute</text><text x="31" y="2.5" font-size="6.5" font-weight="700" fill="#26352f">Catatan</text></g>' +
      '</g>';
  }

  function listScreen() {
    var rows = [
      ['12,4', 'TPS Batuphat Barat', 'Truk A · 07:30'], ['8,1', 'TPS Padang Sakti', 'Truk A · 08:05'],
      ['9,6', 'TPS Hagu Teungoh', 'Truk B · 11:10'], ['5,2', 'TPS Pusong Lama', 'Truk B · 11:45'],
      ['7,3', 'TPS Mon Geudong', 'Truk C · 15:20'], ['6,8', 'TPS Uteunkot', 'Truk C · 15:55']
    ];
    var r = rows.map(function (it, i) {
      var col = i % 2, row = (i / 2) | 0, x = 28 + col * 178, y = 112 + row * 46;
      return '<g transform="translate(' + x + ' ' + y + ')"><g class="hs-row' + (i === 3 ? ' hs-row-dim' : '') + '" style="--i:' + i + '">' +
        '<rect width="38" height="32" rx="9" fill="#f6c453"/>' +
        '<text x="19" y="15" text-anchor="middle" font-size="9" font-weight="800" fill="#1d2b26">' + it[0] + '</text>' +
        '<text x="19" y="24" text-anchor="middle" font-size="5.5" font-weight="700" fill="#6b4a05">km</text>' +
        '<text x="48" y="10" font-size="8" font-weight="800" fill="#1d2b26">' + it[1] + '</text>' +
        '<text x="48" y="20" font-size="6.5" fill="#6f7f78">→ TPA Alue Lim</text>' +
        '<text x="48" y="29" font-size="6" fill="#98a69f">' + it[2] + '</text>' +
        '<line x1="0" y1="39" x2="160" y2="39" stroke="#edf1ee"/></g></g>';
    }).join('');
    return '<g class="hs-screen-list">' +
      '<rect x="10" y="10" width="380" height="270" fill="#e3ebe5" opacity=".95"/>' +
      '<rect x="10" y="60" width="380" height="240" rx="16" fill="#fff"/>' +
      '<text x="28" y="94" font-size="14" font-weight="800" fill="#1d2b26">Rute</text>' +
      '<rect x="68" y="78" width="82" height="20" rx="10" fill="#f2b33d"/><text x="109" y="91.5" text-anchor="middle" font-size="7.5" font-weight="800" fill="#1d2b26">+ Rute baru</text>' +
      '<circle cx="368" cy="88" r="10" fill="#15221e"/><path d="M 364 84 l 8 8 M 372 84 l -8 8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' +
      r +
      '<g transform="translate(168 196)"><g class="hs-menu">' +
        '<rect x="2" y="3" width="88" height="62" rx="7" fill="#04170f" opacity=".18"/>' +
        '<rect width="88" height="62" rx="7" fill="#fff" stroke="#e1e8e3"/>' +
        '<text x="22" y="19" font-size="7.5" font-weight="700" fill="#26352f">Ubah</text>' +
        '<text x="22" y="37" font-size="7.5" font-weight="700" fill="#26352f">Hapus</text>' +
        '<text x="22" y="55" font-size="7.5" font-weight="700" fill="#26352f">Batal</text>' +
        '<g fill="none" stroke="#26352f" stroke-width="1.3" stroke-linecap="round"><path d="M 9 20 l 6 -6"/><path d="M 9 33 h 7 M 10 35 v 4 h 5 v -4"/><path d="M 10 50 l 6 6 M 16 50 l -6 6"/></g>' +
      '</g></g>' +
    '</g>';
  }

  function tablet() {
    var M = 'matrix(.6 .289 -.175 .604 930 152)';
    var shadowPoly = [[970, 180], [1210, 296], [1160, 470], [920, 354]];
    return '<g class="hs-layer" data-depth="16">' +
      '<g class="hs-tshadow" style="--d:.55s"><polygon points="' + pts(shadowPoly) + '" fill="#020d08" opacity=".8" filter="url(#hsBlur)"/></g>' +
      '<g class="hs-drop" style="--d:.55s"><g class="hs-tablet" id="hsTablet" transform="' + M + '">' +
        '<rect x="0" y="12" width="400" height="290" rx="26" fill="#050a09"/>' +
        '<rect x="0" y="6" width="400" height="290" rx="26" fill="#1a2522"/>' +
        '<rect width="400" height="290" rx="26" fill="#0b1210" stroke="#33423d" stroke-width="1.5"/>' +
        '<clipPath id="hsClip"><rect x="10" y="10" width="380" height="270" rx="16"/></clipPath>' +
        '<g clip-path="url(#hsClip)">' + mapScreen() + listScreen() + '</g>' +
        '<path d="M 28 10 H 372 L 330 280 H 10 Z" fill="#fff" opacity=".05" clip-path="url(#hsClip)"/>' +
      '</g></g>' +
    '</g>';
  }

  /* ------------------------------------------------------------------ */
  /* Rakit                                                               */
  /* ------------------------------------------------------------------ */
  var parked = PARKED.map(function (p) {
    return '<g transform="translate(' + p.x + ' ' + p.y + ') rotate(' + p.a + ') scale(1.25)"><g class="hs-fade" style="--d:' + p.d + 's"><use href="#hsTruck"/></g></g>';
  }).join('');
  var drivers = DRIVERS.map(function (d, i) {
    return '<g id="hsDrv' + i + '" transform="translate(-100 -100)"><g class="hs-fade" style="--d:' + (.9 + i * .2) + 's"><use href="#hsTruck"/></g></g>';
  }).join('');

  host.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<defs>' +
        '<filter id="hsBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>' +
        '<pattern id="hsGrid" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(28) skewX(-26)">' +
          '<path d="M 64 0 H 0 V 64" fill="none" stroke="#a5cd5b" stroke-width="1" opacity=".09"/></pattern>' +
        TRUCK +
      '</defs>' +
      '<g class="hs-layer" data-depth="3"><rect x="-80" y="-60" width="' + (W + 160) + '" height="' + (H + 120) + '" fill="url(#hsGrid)"/></g>' +
      '<g class="hs-layer" data-depth="7">' + roadSVG() + parked + drivers + '</g>' +
      '<g class="hs-layer" data-depth="12">' + props() + '</g>' +
      tablet() +
    '</svg>';

  /* ------------------------------------------------------------------ */
  /* Gerak                                                               */
  /* ------------------------------------------------------------------ */
  var layers = [].slice.call(host.querySelectorAll('.hs-layer'));
  var tabletEl = host.querySelector('#hsTablet');
  var trucks = DRIVERS.map(function (d, i) {
    var path = host.querySelector('#' + d.road);
    var len = path.getTotalLength();
    return { el: host.querySelector('#hsDrv' + i), path: path, len: len, pos: d.start * len, speed: d.speed, dir: d.dir, ang: 0, last: null };
  });

  function placeTruck(t, delta) {
    t.pos += delta * t.speed * t.dir;
    if (t.pos > t.len) t.pos -= t.len;
    if (t.pos < 0) t.pos += t.len;
    var p = t.path.getPointAtLength(t.pos);
    var q = t.path.getPointAtLength(Math.min(t.len, Math.max(0, t.pos + 3 * t.dir)));
    var a = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    // haluskan sudut agar tidak patah di tikungan
    var diff = ((a - t.ang + 540) % 360) - 180;
    t.ang = t.last === null ? a : t.ang + diff * Math.min(1, delta * 8);
    t.last = 1;
    t.el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + t.ang.toFixed(1) + ') scale(1.25)');
  }

  // Posisi awal (juga dipakai untuk mode gerak dikurangi)
  trucks.forEach(function (t) { placeTruck(t, 0); });
  if (reduce) { trucks.forEach(function (t, i) { t.pos = t.len * [.32, .42, .55][i]; placeTruck(t, 0); }); return; }

  host.classList.add('hs-anim');

  // Paralaks pointer
  var tx = 0, ty = 0, cx = 0, cy = 0;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - .5) * 2;
      ty = ((e.clientY - r.top) / r.height - .5) * 2;
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; }, { passive: true });
  }

  // Siklus layar tablet: peta -> daftar rute -> menu -> peta
  var CYCLE = 14, T_LIST = 6.5, T_MENU = 10.6, T_MENU_END = 12.8;
  var clock = -2.6; // tunggu tablet mendarat dulu
  var inList = false, inMenu = false;

  var visible = false, raf = 0, prev = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = prev ? Math.min(.05, (ts - prev) / 1000) : 0;
    prev = ts;

    trucks.forEach(function (t) { placeTruck(t, dt); });

    // paralaks (lerp)
    cx += (tx - cx) * Math.min(1, dt * 4);
    cy += (ty - cy) * Math.min(1, dt * 4);
    for (var i = 0; i < layers.length; i++) {
      var dp = +layers[i].getAttribute('data-depth');
      layers[i].setAttribute('transform', 'translate(' + (-cx * dp).toFixed(2) + ' ' + (-cy * dp * .6).toFixed(2) + ')');
    }

    clock += dt;
    if (clock >= 0) {
      var c = clock % CYCLE;
      var l = c >= T_LIST, m = c >= T_MENU && c < T_MENU_END;
      if (l !== inList) { inList = l; tabletEl.classList.toggle('is-list', l); }
      if (m !== inMenu) { inMenu = m; tabletEl.classList.toggle('show-menu', m); }
    }
  }
  function start() { if (!raf && visible && !document.hidden) { prev = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Mulai animasi masuk begitu hero terlihat
  var started = false;
  function onVisible(v) {
    visible = v;
    if (v && !started) { started = true; requestAnimationFrame(function () { host.classList.add('hs-run'); }); }
    if (v) start(); else stop();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { onVisible(es[0].isIntersecting); }, { threshold: 0.05 }).observe(hero);
  } else { onVisible(true); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
})();
