/**
 * ============================================================
 * patch_deteksi_musim_v1.js
 * Versi: 1.3 — Deteksi Musim Berbasis Koordinat + ZOM + Data Lokal Pantai Timur
 * ============================================================
 * 
 * Perbaikan:
 * - Pantai Timur & Tengah Sulsel (Bone, Wajo, Soppeng, Sinjai, dll.) 
 *   menggunakan Rendeng April–September sesuai kenyataan petani lokal.
 * - Kode dibersihkan dari duplikasi.
 * - Logging lebih informatif.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
    ========================================================= */
    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
       (Telah diperbaiki: Tidak ada overlap, pemisahan Barat/Timur di Lon 120.0)
    ========================================================= */
    var REFERENSI_MUSIM_REGIONAL = [

        /* ── Pantai Barat & Barat Daya Sulsel (Pola Monsun Barat Klasik) ─────
              Makassar, Maros, Pangkep, Barru, Parepare, Takalar, Gowa */
        {
            latMin: -6.0, latMaks: -3.5,
            lonMin: 119.0, lonMaks: 119.99, // < 120.0 adalah sebelum pegunungan tengah
            polaPuncak: 'barat',
            rendengMulai: 10, // November
            gaduMulai: 4,     // Mei
            namaRendeng: 'MT I — Musim Utama (Rendeng, Nov–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Mei–Agu)'
        },

        /* ── Pantai Timur & Tengah Sulsel (Pola Terbalik - Mayoritas) ──
              Bone, Wajo, Soppeng, Sinjai, Bulukumba, Selayar, Bantaeng timur */
        {
            latMin: -6.0, latMaks: -3.5,
            lonMin: 120.0, lonMaks: 120.79, // 120.0 ke timur sampai pesisir Teluk Bone
            polaPuncak: 'timur',
            rendengMulai: 3,  // April
            gaduMulai: 9,     // Oktober
            namaRendeng: 'MT I — Musim Utama Lokal (Rendeng, Apr–Agu)',
            namaGadu: 'MT II — Musim Kedua Lokal (Gadu, Okt–Feb)'
        },

        /* ── Sulawesi Tenggara (Peralihan) ─────────────────────
              Kendari, Kolaka, Bombana, Muna, Buton */
        {
            latMin: -6.0, latMaks: -2.5,
            lonMin: 120.8, lonMaks: 124.5, // > 120.8 menyeberang Teluk Bone (Sultra)
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2,
            gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama (Mar–Jun)',
            namaGadu: 'MT II — Musim Kedua (Okt–Jan)'
        },

        /* ── Sulawesi Barat ────────────────────────────────────
              Polman, Majene, Mamuju (Di atas lintang -3.5) */
        {
            latMin: -3.49, latMaks: -0.5,
            lonMin: 118.5, lonMaks: 119.79, 
            polaPuncak: 'barat',
            rendengMulai: 11,
            gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Des–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Jun–Sep)'
        },

        /* ── Sulawesi Tengah Selatan & Luwu Raya (Ekuatorial) ──────────────
              Tana Toraja, Luwu, Palopo, Luwu Utara, Luwu Timur, Morowali */
        {
            latMin: -3.49, latMaks: 0.0,
            lonMin: 119.8, lonMaks: 122.5, // Bagian utara Sulsel yang menyambung ke Sulteng
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0,
            gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam (Jan–Apr)',
            namaGadu: 'MT II — Musim Tanam (Jul–Sep)'
        }
    ];

    /* =========================================================
       FUNGSI DETEKSI MUSIM LOKAL
    ========================================================= */
    function tentukanKalenderMusimLokal(lat, lon, rawZOM) {
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks &&
                lon >= ref.lonMin && lon <= ref.lonMaks) {
                refRegional = ref;
                break;
            }
        }

        // Analisis ZOM
        var bulanTertinggi = 0, nilaiMax = -Infinity;
        for (var i = 0; i < 12; i++) {
            if (rawZOM[i] > nilaiMax) {
                nilaiMax = rawZOM[i];
                bulanTertinggi = i;
            }
        }

        var polaDariZOM = (nilaiMax < 0.4) ? 'ekuatorial' :
                         (bulanTertinggi >= 3 && bulanTertinggi <= 8) ? 'timur' : 'barat';

        if (refRegional) {
            if (refRegional.polaPuncak !== 'peralihan_sultra' &&
                refRegional.polaPuncak !== 'ekuatorial_dua_puncak' &&
                refRegional.polaPuncak !== polaDariZOM) {
                console.warn(`[PatchMusim] Pola ZOM (${polaDariZOM}) ≠ referensi di [${lat.toFixed(3)}, ${lon.toFixed(3)}]`);
            }
            return { 
                ...refRegional, 
                sumber: 'referensi-regional', 
                polaDideteksi: refRegional.polaPuncak 
            };
        }

        // Fallback
        if (polaDariZOM === 'timur') {
            return {
                rendengMulai: (bulanTertinggi - 1 + 12) % 12,
                gaduMulai: (bulanTertinggi + 5) % 12,
                namaRendeng: 'MT I — Musim Utama Lokal (Rendeng)',
                namaGadu: 'MT II — Musim Kedua Lokal (Gadu)',
                sumber: 'zom-pola-timur',
                polaDideteksi: 'timur'
            };
        }

        if (polaDariZOM === 'ekuatorial') return null;

        return {
            rendengMulai: 10,
            gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng)',
            namaGadu: 'MT II — Musim Kedua (Gadu)',
            sumber: 'fallback-pola-barat',
            polaDideteksi: 'barat'
        };
    }

    /* =========================================================
       HELPER FUNCTIONS
    ========================================================= */
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];

    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS = 29.53059;

    function tambahHari(d, n) {
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }

    function tanggalDariBulanTahun(bulanIdx, tahun) {
        return new Date(tahun, bulanIdx, 1);
    }

    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }

    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined &&
                t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }

    /* =========================================================
       FUNGSI UTAMA YANG DI-OVERRIDE
    ========================================================= */
    function rekomendasiWindowTanamV2(skorBulan, rawZOM, zona) {
        var now = new Date();
        var tahunSekarang = now.getFullYear();
        var bulanSekarang = now.getMonth();

        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);

        var startRendeng, startGadu, namaRendeng, namaGadu;

        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai;
            startGadu = kalenderLokal.gaduMulai;
            namaRendeng = kalenderLokal.namaRendeng;
            namaGadu = kalenderLokal.namaGadu;

            console.log(
                '%c[PatchMusim] Kalender musim lokal ditentukan dari: ' + kalenderLokal.sumber +
                '\n Pola terdeteksi : ' + kalenderLokal.polaDideteksi +
                '\n Rendeng mulai : ' + NAMA_BULAN[startRendeng] +
                '\n Gadu mulai : ' + NAMA_BULAN[startGadu] +
                '\n Koordinat : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#06b6d4; font-weight:bold;'
            );
        } else {
            console.log('[PatchMusim] Pola ekuatorial dua puncak — pakai deteksi lembah dari v3.8');
            var maxSum = -Infinity;
            startRendeng = 0;
            for (var i = 0; i < 12; i++) {
                var sum = 0;
                for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
                if (sum > maxSum) { 
                    maxSum = sum; 
                    startRendeng = i; 
                }
            }

            var minSum = Infinity;
            startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    var tengahLembah = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum;
                        startGadu = ii;
                    }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        var rendengBulan = [startRendeng, (startRendeng+1)%12, (startRendeng+2)%12, (startRendeng+3)%12];
        var gaduBulan = [startGadu, (startGadu+1)%12, (startGadu+2)%12, (startGadu+3)%12];

        var MUSIM = [
            { nama: namaRendeng, kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: namaGadu, kode: 'gadu', bulanTanam: gaduBulan }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)', panen: 90, persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam', label:'Dalam (≥ 116 HST)', panen: 125, persenGen: 0.55 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var tahunTanam = tahunSekarang;
                var isLewat = bTanam < bulanSekarang || (bTanam === bulanSekarang && now.getDate() > 20);
                var isBerjalan = bTanam === bulanSekarang && !isLewat;

                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen = Math.floor(v.panen * v.persenGen);
                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunTanam);
                    var bGenIdx = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx = tambahHari(tglTanamRef, v.panen).getMonth();

                    var skorGen = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];

                    // 1. Fase Tanam & Vegetatif: Semakin basah data aktual bulan ini, semakin bagus (100% mengikuti skor iklim)
// Cek bulan PENGOLAHAN (1 bulan sebelum jadwal tanam)
var bOlah = (bTanam - 1 + 12) % 12; 
var skorOlah = skorBulan[bOlah];

var bVeg1 = (bTanam + 1) % 12;
var skorVeg1 = skorBulan[bVeg1];

var nilaiTanam = skorTanam;
var nilaiGen = 100 - Math.abs(skorGen - 50);
var nilaiPanen = 100 - (skorPanen * 0.5);

var nilaiTotal = (nilaiTanam * 0.40) + (nilaiGen * 0.40) + (nilaiPanen * 0.20);

/* ========================================================
   PENALTI AGRONOMI: SYARAT MUTLAK AIR BAJAK/GARU
======================================================== */
// Jika bulan pengolahan (sebelum tanam) belum ada hujan (< 35), tanah keras & traktor tidak bisa turun.
if (skorOlah < 35) {
    nilaiTotal -= (35 - skorOlah) * 3; // Penalti sangat berat agar jadwal tergeser ke bulan berikutnya!
}

// Penalti jika saat tanam dan masa vegetatif tiba-tiba kering
if (skorTanam < 30) nilaiTotal -= (30 - skorTanam) * 1.5;
if (skorVeg1 < 30) nilaiTotal -= (30 - skorVeg1) * 1.5;
/* ========================================================
   FIX AGRONOMI LOKAL: PRIORITAS AWAL MUSIM & AIR MELIMPAH
======================================================== */
// 1. Bonus Awal Musim: Cegah penundaan tanam untuk menghindari hama
var indeksUrutan = musim.bulanTanam.indexOf(bTanam); 
var bonusAwal = (3 - indeksUrutan) * 15; // Bulan 1: +45, Bulan 2: +30, dst.
nilaiTotal += bonusAwal;

// 2. Bonus Ketersediaan Air: Petani butuh air melimpah saat olah lahan/tanam
nilaiTotal += (skorTanam * 0.35);

                    kandidatMusim.push({
                        musimNama : musim.nama,
                        musimKode : musim.kode,
                        bTanam : bTanam,
                        tahunTanam : tahunTanam,
                        varietas : v.kode,
                        labelVar : v.label,
                        panen : v.panen,
                        nilaiTotal : nilaiTotal,
                        skorTanam : skorTanam,
                        skorGen : skorGen,
                        skorPanen : skorPanen,
                        namaBulanGen : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        isLewat : isLewat,
                        isBerjalan : isBerjalan
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                // Fallback logic (sama seperti asli)
                var bFallback = musim.bulanTanam[0];
                var tglAwalFallback = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulan(tglAwalFallback, 3, 8, 0, bFallback);
                var fbLewat = bFallback < bulanSekarang || (bFallback === bulanSekarang && now.getDate() > 20);

                hasilDuaMusim.push({
                    musimNama : musim.nama,
                    musimKode : musim.kode,
                    tglTanam : tglFaseFallback,
                    varietas : 'sedang',
                    labelVar : 'Sedang (95–115 HST)',
                    alasan : 'Kondisi kering ekstrem di seluruh jendela tanam musim ini.',
                    isLewat : fbLewat,
                    isBerjalan : false
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
                var tglFaseBaik = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);

                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                }
                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
                }

                var keteranganSkorGen = best.skorGen < 25 ? 'kering — risiko puso' :
                                       best.skorGen > 70 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganSkorPanen = best.skorPanen > 65 ? 'basah — butuh dryer' :
                                        best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                hasilDuaMusim.push({
                    musimNama : best.musimNama,
                    musimKode : best.musimKode,
                    tglTanam : tglFaseBaik,
                    varietas : best.varietas,
                    labelVar : best.labelVar,
                    alasan : 'Skor bulan tanam: ' + best.skorTanam + '/100. ' +
                             'Generatif di ' + best.namaBulanGen + ' (' + keteranganSkorGen + '). ' +
                             'Panen di ' + best.namaBulanPanen + ' (' + keteranganSkorPanen + ').',
                    isLewat : best.isLewat,
                    isBerjalan : best.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function(a, b) {
            return a.tglTanam.getTime() - b.tglTanam.getTime();
        });

        return hasilDuaMusim;
    }

    /* =========================================================
       INJEKSI OVERRIDE
    ========================================================= */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam = rekomendasiWindowTanamV2;
        window.tentukanKalenderMusimLokal = tentukanKalenderMusimLokal;

        console.log('%c✅ patch_deteksi_musim_v1.js v1.3 aktif — Pantai Timur Sulsel pakai Rendeng April–September',
                   'color:#06b6d4; font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }
})();
