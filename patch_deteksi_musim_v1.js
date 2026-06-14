/**
 * ============================================================
 *  patch_deteksi_musim_v1.js
 *  Versi: 1.0 — Deteksi Musim Berbasis Koordinat + ZOM
 * ------------------------------------------------------------
 *  MASALAH YANG DIPERBAIKI:
 *
 *  rekomendasiWindowTanam() di patch_jadwal_tanam_otomatis.js
 *  salah menyebut musim karena hanya melihat "blok 6 bulan
 *  terbanyak mm = Rendeng". Ini hanya benar untuk Sulsel
 *  pantai barat (pola monsunal barat). Di Sulsel pantai timur
 *  dan wilayah lain dengan pola terbalik, hasilnya kebalik:
 *    - Puncak hujan Apr–Sep → sistem beri label "MT I Rendeng"
 *    - Padahal petani setempat menyebut itu "Gadu"
 *    - Rendeng lokal (Okt–Feb) malah diberi label "MT II Gadu"
 *
 *  SOLUSI:
 *  Tambahkan fungsi tentukanKalenderMusimLokal(lat, lon, rawZOM)
 *  yang:
 *    1. Mendeteksi "tipe pola hujan" wilayah dari koordinat GPS
 *       dan distribusi ZOM aktual (bukan hanya zona iklim).
 *    2. Menentukan bulan Rendeng dan Gadu sesuai kalender tanam
 *       LOKAL — bukan sekadar bulan terbasah vs terkering.
 *    3. Memberi label MT I dan MT II dengan orientasi yang benar
 *       dari perspektif petani setempat.
 *
 *  CARA PAKAI:
 *  Tambahkan tag <script src="patch_deteksi_musim_v1.js"></script>
 *  SETELAH patch_jadwal_tanam_otomatis.js. Patch ini akan
 *  meng-override fungsi rekomendasiWindowTanam() secara otomatis.
 *
 *  TIDAK ADA perubahan di file lain yang diperlukan.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
       Sumber: BMKG Stasiun Meteorologi Regional, data pengamatan
       lapangan PPL, dan pola ZOM historis per kabupaten.

       Struktur per wilayah:
         rendengMulai : indeks bulan awal musim tanam utama (0=Jan)
         gaduMulai    : indeks bulan awal musim tanam kedua
         namaRendeng  : label lokal untuk musim utama
         namaGadu     : label lokal untuk musim kedua
         polaPuncak   : 'barat' (DJF) atau 'timur' (JJA/SON)
    ========================================================= */
    var REFERENSI_MUSIM_REGIONAL = [

        /* ── Sulsel Pantai Barat & Tengah ─────────────────────
           Meliputi: Wajo, Bone barat, Soppeng, Sidrap, Pinrang,
           Parepare, Barru, Pangkep, Maros, Gowa, Takalar,
           Jeneponto, Bantaeng bagian barat
           Pola: puncak hujan Nov–Mar (pengaruh monsun barat)
           Referensi: BMKG Maros, ZOM Sulawesi Selatan Barat   */
        {
            latMin: -6.0, latMaks: -2.0,
            lonMin: 119.0, lonMaks: 121.0,
            polaPuncak: 'barat',
            rendengMulai: 10,   // November
            gaduMulai: 4,       // Mei
            namaRendeng: 'MT I — Musim Utama (Rendeng, Nov–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Mei–Agu)'
        },

        /* ── Sulsel Pantai Timur & Teluk Bone ─────────────────
           Meliputi: Sinjai pesisir, Bone bagian timur, Bulukumba
           pesisir, Selayar, bagian timur Jeneponto & Bantaeng
           Pola: puncak hujan Apr–Sep (pengaruh angin tenggara
           yang memantul dari daratan Sultra dan NTT)
           Referensi: BMKG Bonebolango, data hujan Bone Timur,
           ZOM Teluk Bone                                        */
        {
            latMin: -6.0, latMaks: -3.0,
            lonMin: 120.5, lonMaks: 122.5,
            polaPuncak: 'timur',
            rendengMulai: 9,    // Oktober
            gaduMulai: 3,       // April
            namaRendeng: 'MT I — Musim Utama (Rendeng, Okt–Feb)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Apr–Agu)'
        },

        /* ── Sulawesi Tenggara ─────────────────────────────────
           Meliputi: Kendari, Konawe, Kolaka, Bombana, Muna, Buton
           Pola: peralihan — dua puncak hujan (Mar–Mei & Okt–Des)
           Referensi: BMKG Kendari, ZOM Sulawesi Tenggara        */
        {
            latMin: -5.5, latMaks: -2.5,
            lonMin: 121.5, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2,    // Maret
            gaduMulai: 9,       // Oktober
            namaRendeng: 'MT I — Musim Utama (Mar–Jun)',
            namaGadu: 'MT II — Musim Kedua (Okt–Jan)'
        },

        /* ── Sulawesi Barat ────────────────────────────────────
           Meliputi: Mamuju, Majene, Polewali Mandar, Pasangkayu
           Pola: mirip Sulsel barat, puncak Des–Feb
           Referensi: BMKG Mamuju                                */
        {
            latMin: -3.5, latMaks: -0.5,
            lonMin: 118.5, lonMaks: 120.5,
            polaPuncak: 'barat',
            rendengMulai: 11,   // Desember
            gaduMulai: 5,       // Juni
            namaRendeng: 'MT I — Musim Utama (Rendeng, Des–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Jun–Sep)'
        },

        /* ── Sulawesi Tengah Selatan (Palu, Donggala, Sigi) ───
           Pola: sangat kering (bayangan hujan), puncak Jan–Feb
           dan Jul–Sep (dua puncak lemah)
           Referensi: BMKG Palu                                  */
        {
            latMin: -2.5, latMaks: 0.0,
            lonMin: 119.5, lonMaks: 122.0,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0,    // Januari
            gaduMulai: 6,       // Juli
            namaRendeng: 'MT I — Musim Tanam (Jan–Apr)',
            namaGadu: 'MT II — Musim Tanam (Jul–Sep)'
        }
    ];

    /* =========================================================
       FUNGSI UTAMA: tentukanKalenderMusimLokal
       Menggabungkan tiga sumber informasi:
         1. Koordinat GPS → lookup referensi regional
         2. Pola distribusi ZOM → verifikasi/koreksi
         3. Zona iklim → fallback
    ========================================================= */
    function tentukanKalenderMusimLokal(lat, lon, rawZOM, zonaIklim) {

        /* Langkah 1: Cari referensi regional berdasarkan koordinat */
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks &&
                lon >= ref.lonMin && lon <= ref.lonMaks) {
                refRegional = ref;
                break;
            }
        }

        /* Langkah 2: Analisis distribusi ZOM untuk verifikasi
           Cari bulan dengan curah hujan tertinggi dan terendah */
        var bulanTertinggi = 0, nilaiMax = -Infinity;
        var bulanTerendah  = 0, nilaiMin = Infinity;
        for (var i = 0; i < 12; i++) {
            if (rawZOM[i] > nilaiMax) { nilaiMax = rawZOM[i]; bulanTertinggi = i; }
            if (rawZOM[i] < nilaiMin) { nilaiMin = rawZOM[i]; bulanTerendah  = i; }
        }

        /* Deteksi tipe pola dari ZOM aktual:
           - Jika puncak ZOM di bulan 10–2 (Okt–Feb) → pola barat
           - Jika puncak ZOM di bulan 3–9 (Mar–Sep) → pola timur/selatan
           - Jika pola tidak jelas (selisih min-max kecil) → ekuatorial */
        var polaDariZOM;
        var bulanPolaBarat  = [10, 11, 0, 1, 2]; // Okt–Feb
        var bulanPolaTimur  = [3, 4, 5, 6, 7, 8, 9]; // Mar–Sep
        var selisihMinMax   = nilaiMax - nilaiMin;

        if (selisihMinMax < 0.4) {
            polaDariZOM = 'ekuatorial';
        } else if (bulanPolaBarat.indexOf(bulanTertinggi) !== -1) {
            polaDariZOM = 'barat';
        } else {
            polaDariZOM = 'timur';
        }

        /* Langkah 3: Tentukan kalender musim final
           Prioritas: referensi regional > ZOM > default zona iklim */

        if (refRegional) {
            /* Verifikasi silang: apakah pola ZOM konsisten dengan referensi?
               Jika tidak konsisten, log peringatan tapi tetap pakai referensi
               regional karena lebih dapat dipercaya untuk penentuan nama musim */
            if (refRegional.polaPuncak !== 'peralihan_sultra' &&
                refRegional.polaPuncak !== 'ekuatorial_dua_puncak' &&
                refRegional.polaPuncak !== polaDariZOM) {
                console.warn(
                    '[PatchMusim] Perhatian: Pola ZOM (' + polaDariZOM +
                    ') tidak konsisten dengan referensi regional (' +
                    refRegional.polaPuncak + ') untuk koordinat [' +
                    lat.toFixed(3) + ', ' + lon.toFixed(3) + ']. ' +
                    'Menggunakan referensi regional sebagai acuan utama.'
                );
            }
            return {
                rendengMulai: refRegional.rendengMulai,
                gaduMulai   : refRegional.gaduMulai,
                namaRendeng : refRegional.namaRendeng,
                namaGadu    : refRegional.namaGadu,
                sumber      : 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak
            };
        }

        /* Fallback berbasis pola ZOM jika tidak ada referensi regional */
        if (polaDariZOM === 'timur') {
            /* Pola puncak hujan di bulan kering monsun barat
               → Rendeng lokal = sekitar bulan puncak hujan ZOM */
            var rendengFallbackTimur = (bulanTertinggi - 1 + 12) % 12;
            var gaduFallbackTimur    = (bulanTertinggi + 5) % 12;
            return {
                rendengMulai: rendengFallbackTimur,
                gaduMulai   : gaduFallbackTimur,
                namaRendeng : 'MT I — Musim Utama (Puncak Hujan Lokal)',
                namaGadu    : 'MT II — Musim Kedua (Hujan Menurun)',
                sumber      : 'zom-pola-timur',
                polaDideteksi: 'timur'
            };
        }

        if (polaDariZOM === 'ekuatorial') {
            /* Dua puncak hujan → gunakan deteksi lembah dari patch v3.8 */
            return null; // Kembalikan null → biarkan logika ekuatorial lama berjalan
        }

        /* Fallback terakhir: pola barat default (Nov = mulai rendeng) */
        return {
            rendengMulai: 10,
            gaduMulai   : 4,
            namaRendeng : 'MT I — Musim Utama (Rendeng)',
            namaGadu    : 'MT II — Musim Kedua (Gadu)',
            sumber      : 'fallback-pola-barat',
            polaDideteksi: 'barat'
        };
    }

    /* =========================================================
       OVERRIDE rekomendasiWindowTanam
       Menggantikan fungsi yang ada di patch_jadwal_tanam_otomatis.js
    ========================================================= */
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

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
                t.getMonth() !== batasBulan) { continue; }
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }

    /* Fungsi rekomendasiWindowTanam yang sudah diperbaiki */
    function rekomendasiWindowTanamV2(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();
        var bulanSekarang = now.getMonth();

        /* ── Ambil koordinat untuk penentuan kalender musim lokal ── */
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        /* ── Tentukan kalender musim lokal ── */
        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM, zona);

        var startRendeng, startGadu, namaRendeng, namaGadu;

        if (kalenderLokal !== null) {
            /* Gunakan kalender lokal yang sudah terverifikasi koordinat */
            startRendeng = kalenderLokal.rendengMulai;
            startGadu    = kalenderLokal.gaduMulai;
            namaRendeng  = kalenderLokal.namaRendeng;
            namaGadu     = kalenderLokal.namaGadu;

            console.log(
                '%c[PatchMusim] Kalender musim lokal ditentukan dari: ' + kalenderLokal.sumber +
                '\n  Pola terdeteksi : ' + kalenderLokal.polaDideteksi +
                '\n  Rendeng mulai   : ' + NAMA_BULAN[startRendeng] +
                '\n  Gadu mulai      : ' + NAMA_BULAN[startGadu] +
                '\n  Koordinat       : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#06b6d4; font-weight:bold;'
            );
        } else {
            /* Fallback: gunakan logika lama (pencarian blok terbanyak)
               tapi HANYA untuk zona ekuatorial dua puncak */
            console.log(
                '[PatchMusim] Pola ekuatorial dua puncak — pakai deteksi lembah dari v3.8'
            );

            var maxSum = -Infinity;
            startRendeng = 0;
            for (var i = 0; i < 12; i++) {
                var sum = 0;
                for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
                if (sum > maxSum) { maxSum = sum; startRendeng = i; }
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
                        minSum    = lembahSum;
                        startGadu = ii;
                    }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu    = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        var rendengBulan = [startRendeng,  (startRendeng+1)%12,
                             (startRendeng+2)%12, (startRendeng+3)%12];
        var gaduBulan    = [startGadu,     (startGadu+1)%12,
                             (startGadu+2)%12,    (startGadu+3)%12];

        var MUSIM = [
            { nama: namaRendeng, kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: namaGadu,    kode: 'gadu',    bulanTanam: gaduBulan   }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var tahunTanam = tahunSekarang;
                var isLewat    = bTanam < bulanSekarang ||
                                 (bTanam === bulanSekarang && now.getDate() > 20);
                var isBerjalan = bTanam === bulanSekarang && !isLewat;

                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen     = Math.floor(v.panen * v.persenGen);
                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunTanam);
                    var bGenIdx     = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHari(tglTanamRef, v.panen).getMonth();

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];

                    var nilaiGen   = 100 - Math.abs(skorGen - 40);
                    var nilaiPanen = 100 - skorPanen;
                    var nilaiTotal = (nilaiGen * 0.55) + (nilaiPanen * 0.45);

                    var bVeg1 = (bTanam + 1) % 12;
                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;
                    if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;

                    kandidatMusim.push({
                        musimNama     : musim.nama,
                        musimKode     : musim.kode,
                        bTanam        : bTanam,
                        tahunTanam    : tahunTanam,
                        varietas      : v.kode,
                        labelVar      : v.label,
                        panen         : v.panen,
                        nilaiTotal    : nilaiTotal,
                        skorTanam     : skorTanam,
                        skorGen       : skorGen,
                        skorPanen     : skorPanen,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        isLewat       : isLewat,
                        isBerjalan    : isBerjalan
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                var bFallback       = musim.bulanTanam[0];
                var tglAwalFallback = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulan(tglAwalFallback, 3, 8, 0, bFallback);
                var fbLewat         = bFallback < bulanSekarang ||
                                      (bFallback === bulanSekarang && now.getDate() > 20);

                hasilDuaMusim.push({
                    musimNama  : musim.nama,
                    musimKode  : musim.kode,
                    tglTanam   : tglFaseFallback,
                    varietas   : 'sedang',
                    labelVar   : 'Sedang (95–115 HST)',
                    alasan     : 'Kondisi kering ekstrem di seluruh jendela tanam musim ini. ' +
                                 'Dipilih tanggal default fase bulan terbaik.',
                    isLewat    : fbLewat,
                    isBerjalan : false
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
                var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);

                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                }
                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
                }

                var keteranganSkorGen =
                    best.skorGen < 25 ? 'kering — risiko puso' :
                    best.skorGen > 70 ? 'basah — waspada Blast' :
                    'optimal pembungaan';
                var keteranganSkorPanen =
                    best.skorPanen > 65 ? 'basah — butuh dryer' :
                    best.skorPanen < 20 ? 'kering ideal' :
                    'sedang — aman';

                hasilDuaMusim.push({
                    musimNama  : best.musimNama,
                    musimKode  : best.musimKode,
                    tglTanam   : tglFaseBaik,
                    varietas   : best.varietas,
                    labelVar   : best.labelVar,
                    alasan     : 'Skor bulan tanam: ' + best.skorTanam + '/100. ' +
                                 'Generatif jatuh di ' + best.namaBulanGen +
                                 ' (' + keteranganSkorGen + '). ' +
                                 'Panen di ' + best.namaBulanPanen +
                                 ' (' + keteranganSkorPanen + ').',
                    isLewat    : best.isLewat,
                    isBerjalan : best.isBerjalan
                });
            }
        });

        /* Urut berdasarkan tanggal tanam */
        hasilDuaMusim.sort(function(a, b) {
            return a.tglTanam.getTime() - b.tglTanam.getTime();
        });
        return hasilDuaMusim;
    }

    /* =========================================================
       INJEKSI — Override fungsi lama setelah DOM siap
    ========================================================= */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam = rekomendasiWindowTanamV2;
        window.tentukanKalenderMusimLokal = tentukanKalenderMusimLokal;

        console.log(
            '%c✅ patch_deteksi_musim_v1.js aktif ' +
            '— Deteksi Musim Berbasis Koordinat GPS + ZOM',
            'color:#06b6d4; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        /* Tunggu sebentar agar patch_jadwal_tanam_otomatis.js selesai
           mendefinisikan rekomendasiWindowTanam terlebih dahulu */
        setTimeout(injeksiOverride, 50);
    }

})();
