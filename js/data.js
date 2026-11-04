/**
 * DATA AWAL SIMULASI
 * Seluruh data berada di sisi browser, tanpa server dan tanpa kredensial.
 * Wilayah: Kota Lhokseumawe, Aceh.
 */
window.SW = window.SW || {};

SW.DATA = {
  mapCenter: [5.17, 97.13],

  // Titik bongkar akhir (TPA). Koordinat ini perkiraan lokasi Gampong Alue Lim,
  // Kec. Blang Mangat. Sesuaikan jika ingin presisi (cukup ubah dua angka ini).
  depots: [
    {
      id: 'depot-01',
      name: 'TPA Alue Lim',
      latitude: 5.13,
      longitude: 97.19,
      address: 'Gampong Alue Lim, Kec. Blang Mangat, Kota Lhokseumawe'
    }
  ],

  // Kapasitas dibuat kecil (100 kg) agar skenario bongkar-muat dan
  // re-routing dinamis dapat didemonstrasikan dengan 15 TPS contoh.
  vehicles: [
    {
      id: 'veh-01',
      vehicle_code: 'ARMADA-01',
      plate_number: 'BL 1234 XX',
      capacity: 100,
      current_capacity: 0,
      status: 'available'
    }
  ],

  collection_points: [
    { id: 'tps-01', name: 'TPS Batuphat Barat',      latitude: 5.216760,              longitude: 97.055356,             estimated_volume: 30, status: 'planned',   active: true },
    { id: 'tps-02', name: 'TPS Blang Naleung Mameh', latitude: 5.205310,              longitude: 97.086530,             estimated_volume: 25, status: 'planned',   active: true },
    { id: 'tps-03', name: 'TPS Meuria Paloh',        latitude: 5.209600,              longitude: 97.102044,             estimated_volume: 30, status: 'planned',   active: true },
    { id: 'tps-04', name: 'TPS Padang Sakti',        latitude: 5.202750,              longitude: 97.125462,             estimated_volume: 35, status: 'planned',   active: true },
    { id: 'tps-05', name: 'TPS Hagu Barat Laut',     latitude: 5.194756409173344,     longitude: 97.13370346319695,     estimated_volume: 30, status: 'planned',   active: true },
    { id: 'tps-06', name: 'TPS Pusong Lama',         latitude: 5.181422212490169,     longitude: 97.15439296175592,     estimated_volume: 20, status: 'planned',   active: true },
    { id: 'tps-07', name: 'TPS Hagu Teungoh',        latitude: 5.190920,              longitude: 97.144867,             estimated_volume: 35, status: 'planned',   active: true },
    { id: 'tps-08', name: 'TPS Kuta Blang',          latitude: 5.179844,              longitude: 97.144399,             estimated_volume: 25, status: 'planned',   active: true },
    { id: 'tps-09', name: 'TPS Pusong Baru',         latitude: 5.180407,              longitude: 97.150942,             estimated_volume: 25, status: 'planned',   active: true },
    { id: 'tps-10', name: 'TPS Mon Geudong',         latitude: 5.173223,              longitude: 97.132826,             estimated_volume: 35, status: 'planned',   active: true },
    { id: 'tps-11', name: 'TPS Uteunkot',            latitude: 5.166501,              longitude: 97.121797,             estimated_volume: 25, status: 'planned',   active: true },
    { id: 'tps-12', name: 'TPS Blang Cut',           latitude: 5.135001,              longitude: 97.108389,             estimated_volume: 30, status: 'completed', active: true },
    { id: 'tps-13', name: 'TPS Meunasah Mee',        latitude: 5.121412,              longitude: 97.157941,             estimated_volume: 30, status: 'completed', active: true },
    { id: 'tps-14', name: 'TPS Mesjid Punteut',      latitude: 5.115936,              longitude: 97.169703,             estimated_volume: 20, status: 'completed', active: true },
    { id: 'tps-15', name: 'TPS Meunasah Mesjid',     latitude: 5.147851,              longitude: 97.139134,             estimated_volume: 30, status: 'completed', active: true }
  ]
};
