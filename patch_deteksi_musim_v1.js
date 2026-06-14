/**
 * ============================================================
 *  patch_deteksi_musim_v2.1.js
 *  Versi: 2.1 — Fix Mismatch Zona ZOM vs Kalender + GPS Timing
 * ------------------------------------------------------------
 *  ROOT CAUSE yang ditemukan di v2.0:
 *
 *  [BUG UTAMA] Dua sistem zona berjalan independen dan tidak sinkron:
 *
 *    1. getDataZOM() di patch_jadwal v3.10 menentukan zona lewat
 *       window.tentukanZonaIklim(lat, lon) — fungsi dari app utama
 *       yang mengembalikan 'monsunal' / 'ekuatorial' / 'peralihan'.
 *       Untuk koordinat [-4.0, 120.0] (fallback GPS), fungsi ini
 *       mengembalikan 'monsunal' → rawZOM fallback menggunakan pola
 *       BARAT (puncak Nov–Feb).
 *
 *    2. tentukanKalenderMusimLokal() di patch ini mendeteksi zona
 *       'timur' untuk lon >= 120.0 → kalender Rendeng April, Gadu Okt.
 *
 *    Akibat: rawZOM pakai pola Barat (April = kering), tapi kalender
 *    bilang April adalah awal Rendeng. cariOnsetHujan() tidak menemukan
 *    mm yang cukup di April (karena data hujan pola Barat memang kering
 *    di April) → jatuh ke fallback startRendeng = April → tglFaseBaik
 *    = 2 April → hasil SALAH meski logika onset sudah benar.
 *
 *  [FIX #1 — SINKRONISASI DATA ZOM DENGAN ZONA REGIONAL]
 *    Override window.tentukanZonaIklim agar mengembalikan zona yang
 *    konsisten dengan tentukanKalenderMusimLokal(). Untuk koordinat
 *    lon >= 120.0 di Sulawesi Selatan, kembalikan 'peralihan' bukan
 *    'monsunal' — sehingga FALLBACK_ZOM_PER_ZONA yang dipakai getDataZOM()
 *    menggunakan pola peralihan/timur, bukan pola barat.
 *
 *    Lebih penting: inject fungsi getDataZOMOverride() yang memastikan
 *    rawZOM yang sampai ke rekomendasiWindowTanam adalah data yang
 *    sesuai zona kalender, bukan zona iklim generik.
 *
 *  [FIX #2 — FALLBACK ZOM POLA TIMUR YANG AKURAT]
 *    FALLBACK_ZOM_PER_ZONA.peralihan di v3.10 masih menggunakan data
 *    estimasi generik yang tidak mencerminkan pola Pantai Timur Sulsel.
 *    Patch ini menyediakan FALLBACK_ZOM_TIMUR_SULSEL — data estimasi
 *    berdasarkan karakteristik curah hujan Teluk Bone (puncak Mei–Jun).
 *    Dipakai saat server ZOM lokal tidak tersedia dan zona = timur.
 *
 *  [FIX #3 — GPS TIMING: TUNGGU KOORDINAT NYATA SEBELUM PROSES]
 *    window._lokasiKalender diisi oleh prosesJadwalOtomatis() SEBELUM
 *    memanggil rekomendasiWindowTanam(). Tapi getDataZOM() juga berjalan
 *    paralel di Promise.all() — jika GPS lambat, koordinat fallback
 *    [-4.0, 120.0] yang dipakai. Patch ini menambahkan pengecekan:
 *    jika koordinat yang dipakai adalah persis fallback default dan
 *    zona yang terdeteksi tidak konsisten dengan ZOM yang diterima,
 *    log peringatan eksplisit dan gunakan FALLBACK_ZOM_TIMUR_SULSEL
 *    berdasarkan polaPuncak kalender lokal.
 *
 *  [TETAP dari v2.0]
 *    Semua fix Lapisan 1–4: skorZOMRegional(), cariOnsetHujan(),
 *    gerbang thresholdBajak, statusWaktuTanam(), REFERENSI_MUSIM_REGIONAL.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       FALLBACK ZOM POLA TIMUR SULSEL
       Estimasi curah hujan (mm/bulan) khas Pantai Timur Sulsel
       (Bone, Wajo, Soppeng, Sinjai) berdasarkan karakteristik
       Teluk Bone: puncak Mei–Juni, kering Jan–Mar.
       Sumber: estimasi berbasis atlas iklim BMKG Sulawesi.
    ========================================================= */
    var FALLBACK_ZOM_TIMUR_SULSEL = [
        30,   /* Jan — kering */
        25,   /* Feb — kering */
        45,   /* Mar — mulai naik */
        80,   /* Apr — awal hujan, cukup bajak */
        140,  /* Mei — puncak 1, onset tanam produktif */
        160,  /* Jun — puncak 2 */
        120,  /* Jul — masih basah */
        90,   /* Agu — menurun */
        70,   /* Sep — awal kering */
        60,   /* Okt — awal Gadu, cukup bajak */
        50,   /* Nov — agak kering */
        35    /* Des — kering */
    ];

    var FALLBACK_ZOM_EKUATORIAL_SULSEL = [
        120,  /* Jan */ 130,  /* Feb */ 140,  /* Mar */ 150,  /* Apr */
        130,  /* Mei */ 100,  /* Jun */ 90,   /* Jul */ 100,  /* Agu */
        120,  /* Sep */ 140,  /* Okt */ 150,  /* Nov */ 130   /* Des */
    ];

    /* =========================================================
       THRESHOLD KELAYAKAN AIR PER ZONA (sama dengan v2.0)
    ========================================================= */
    var THRESHOLD_AIR = {
        barat:                { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 },
        timur:                { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        peralihan_sultra:     { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        ekuatorial_dua_puncak:{ thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 },
        fallback:             { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 }
    };

    /* =========================================================
       REFERENSI MUSIM REGIONAL (tidak berubah dari v2.0)
    ========================================================= */
    var REFERENSI_MUSIM_REGIONAL = [
        {
            latMin: -6.0, latMaks: -3.5, lonMin: 119.0, lonMaks: 119.99,
            polaPuncak: 'barat',
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Nov–Mar)',
            namaGadu:    'MT II — Musim Kedua (Gadu, Mei–Agu)'
        },
        {
            latMin: -6.0, latMaks: -3.5, lonMin: 120.0, lonMaks: 120.79,
            polaPuncak: 'timur',
            rendengMulai: 3, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama Lokal (Rendeng, Apr–Agu)',
            namaGadu:    'MT II — Musim Kedua Lokal (Gadu, Okt–Feb)'
        },
        {
            latMin: -6.0, latMaks: -2.5, lonMin: 120.8, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama (Mar–Jun)',
            namaGadu:    'MT II — Musim Kedua (Okt–Jan)'
        },
        {
            latMin: -3.49, latMaks: -0.5, lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Des–Mar)',
            namaGadu:    'MT II — Musim Kedua (Gadu, Jun–Sep)'
        },
        {
            latMin: -3.49, latMaks: 0.0, lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0, gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam (Jan–Apr)',
            namaGadu:    'MT II — Musim Tanam (Jul–Sep)'
        }
    ];

    /* =========================================================
       HELPER FUNCTIONS
    ========================================================= */
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];

    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
    }
    function tanggalDariBulanTahun(b, t) { return new Date(t, b, 1); }

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

    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    /* =========================================================
       DETEKSI MUSIM LOKAL
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

        var bulanTertinggi = 0, nilaiMax = -Infinity;
        for (var i = 0; i < 12; i++) {
            if (rawZOM[i] > nilaiMax) { nilaiMax = rawZOM[i]; bulanTertinggi = i; }
        }
        var polaDariZOM = (nilaiMax < 0.4) ? 'ekuatorial' :
                         (bulanTertinggi >= 3 && bulanTertinggi <= 8) ? 'timur' : 'barat';

        if (refRegional) {
            var konsisten = refRegional.polaPuncak === polaDariZOM ||
                            refRegional.polaPuncak === 'peralihan_sultra' ||
                            refRegional.polaPuncak === 'ekuatorial_dua_puncak';
            if (!konsisten) {
                console.warn('[PatchMusim v2.1] ⚠️ ZOM tidak sinkron dengan zona regional.' +
                    ' polaPuncak=' + refRegional.polaPuncak +
                    ' polaDariZOM=' + polaDariZOM +
                    ' bulan ZOM tertinggi=' + NAMA_BULAN[bulanTertinggi] +
                    ' — kemungkinan rawZOM adalah data fallback zona yang salah!');
            }
            return Object.assign({}, refRegional, {
                sumber: 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak,
                zomKonsisten: konsisten
            });
        }

        if (polaDariZOM === 'timur') {
            return {
                rendengMulai: (bulanTertinggi - 1 + 12) % 12,
                gaduMulai: (bulanTertinggi + 5) % 12,
                namaRendeng: 'MT I — Musim Utama Lokal (Rendeng)',
                namaGadu:    'MT II — Musim Kedua Lokal (Gadu)',
                sumber: 'zom-pola-timur', polaDideteksi: 'timur', zomKonsisten: true
            };
        }
        if (polaDariZOM === 'ekuatorial') return null;
        return {
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng)',
            namaGadu:    'MT II — Musim Kedua (Gadu)',
            sumber: 'fallback-pola-barat', polaDideteksi: 'barat', zomKonsisten: true
        };
    }

    /* =========================================================
       [FIX #1 + #2] PASTIKAN rawZOM SINKRON DENGAN ZONA KALENDER
       Jika polaPuncak kalender = 'timur' tapi ZOM tertinggi ada di
       bulan-bulan Barat (Nov–Feb), berarti rawZOM yang diterima
       adalah data fallback zona yang salah. Ganti dengan
       FALLBACK_ZOM_TIMUR_SULSEL yang tepat.
    ========================================================= */
    function validasiDanPerbaikiZOM(rawZOM, polaPuncak) {
        var bulanPuncakZOM = 0, maxMm = -Infinity;
        for (var m = 0; m < 12; m++) {
            if (rawZOM[m] > maxMm) { maxMm = rawZOM[m]; bulanPuncakZOM = m; }
        }

        var polaDariData = (bulanPuncakZOM >= 3 && bulanPuncakZOM <= 8) ? 'timur' : 'barat';

        /* Zona timur tapi data ZOM puncaknya di bulan barat (atau sebaliknya) */
        if (polaPuncak === 'timur' && polaDariData !== 'timur') {
            console.warn('[PatchMusim v2.1] rawZOM tidak sesuai zona TIMUR' +
                ' (puncak ZOM di ' + NAMA_BULAN[bulanPuncakZOM] + ' = pola Barat).' +
                ' Mengganti dengan FALLBACK_ZOM_TIMUR_SULSEL.');
            return { data: FALLBACK_ZOM_TIMUR_SULSEL, diganti: true };
        }

        if (polaPuncak === 'peralihan_sultra' && polaDariData !== 'timur') {
            console.warn('[PatchMusim v2.1] rawZOM tidak sesuai zona PERALIHAN_SULTRA.' +
                ' Mengganti dengan FALLBACK_ZOM_TIMUR_SULSEL.');
            return { data: FALLBACK_ZOM_TIMUR_SULSEL, diganti: true };
        }

        if ((polaPuncak === 'ekuatorial_dua_puncak') && maxMm < 50) {
            console.warn('[PatchMusim v2.1] rawZOM ekuatorial tidak valid (max=' +
                maxMm.toFixed(0) + 'mm). Mengganti dengan fallback ekuatorial.');
            return { data: FALLBACK_ZOM_EKUATORIAL_SULSEL, diganti: true };
        }

        return { data: rawZOM, diganti: false };
    }

    /* =========================================================
       SKOR ZOM REGIONAL (sama dengan v2.0)
    ========================================================= */
    function skorZOMRegional(mm, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b  = th.thresholdBajak;
        var o  = th.thresholdOnset;
        var l  = th.thresholdLayak;

        if (mm <= 0)      return 0;
        if (mm < b / 2)   return Math.round(mm / (b / 2) * 20);
        if (mm < b)       return Math.round(20 + (mm - b / 2) / (b / 2) * 20);
        if (mm < o)       return Math.round(40 + (mm - b)    / (o - b)  * 20);
        if (mm < l)       return Math.round(60 + (mm - o)    / (l - o)  * 15);
        if (mm < l * 1.5) return Math.round(75 + (mm - l)    / (l * 0.5) * 10);
        if (mm < l * 2)   return Math.round(85 + (mm - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* =========================================================
       DETEKSI ONSET HUJAN EFEKTIF (sama dengan v2.0)
    ========================================================= */
    function cariOnsetHujan(startMusim, rawZOM, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;

        for (var offset = 0; offset < 6; offset++) {
            var bIni = (startMusim + offset) % 12;
            var bBrk = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= th.thresholdOnset && rawZOM[bBrk] >= th.thresholdBajak) {
                if (offset > 0) {
                    console.log('[PatchMusim v2.1] Onset efektif: ' +
                        NAMA_BULAN[bIni] + ' (geser ' + offset + ' bln dari ' +
                        NAMA_BULAN[startMusim] + ', ZOM=' + rawZOM[bIni].toFixed(0) + 'mm)');
                }
                return bIni;
            }
        }

        /* Fallback: bulan dengan mm tertinggi di jendela (lebih aman dari startMusim kasar) */
        var bTinggi = startMusim, mmMax = -1;
        for (var k = 0; k < 4; k++) {
            var bk = (startMusim + k) % 12;
            if (rawZOM[bk] > mmMax) { mmMax = rawZOM[bk]; bTinggi = bk; }
        }
        console.warn('[PatchMusim v2.1] Onset tidak terdeteksi — pakai bulan ZOM tertinggi: ' +
            NAMA_BULAN[bTinggi] + ' (' + mmMax.toFixed(0) + 'mm)');
        return bTinggi;
    }

    /* =========================================================
       FUNGSI UTAMA
    ========================================================= */
    function rekomendasiWindowTanamV3(skorBulan, rawZOM, zona, ensoVal = 0, iodVal = 0) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        /* [FIX #3] Deteksi koordinat fallback — beri peringatan */
        var pakaiKoordFallback = (lat === -4.0 && lon === 120.0);
        if (pakaiKoordFallback) {
            console.warn('[PatchMusim v2.1] ⚠️ Koordinat GPS belum tersedia —' +
                ' memakai fallback [-4.0, 120.0]. Hasil mungkin kurang akurat.' +
                ' Pastikan izin lokasi diberikan sebelum tombol analisis ditekan.');
        }

        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);

        var startRendeng, startGadu, namaRendeng, namaGadu, polaPuncak;

        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai;
            startGadu    = kalenderLokal.gaduMulai;
            namaRendeng  = kalenderLokal.namaRendeng;
            namaGadu     = kalenderLokal.namaGadu;
            polaPuncak   = kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi || 'barat';
        } else {
            polaPuncak = 'ekuatorial_dua_puncak';
            var maxSum = -Infinity; startRendeng = 0;
            for (var i = 0; i < 12; i++) {
                var sum = 0;
                for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
                if (sum > maxSum) { maxSum = sum; startRendeng = i; }
            }
            var minSum = Infinity; startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    var tl = (ii + 2) % 12;
                    var jarak = (tl - startRendeng + 12) % 12;
                    if (jarak >= 3 && jarak <= 9) { minSum = lembahSum; startGadu = ii; }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu    = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        /* ── [FIX #1 + #2] Validasi & koreksi rawZOM terhadap zona kalender ── */
        var hasilValidasi = validasiDanPerbaikiZOM(rawZOM, polaPuncak);
        var dataZOM       = hasilValidasi.data; /* rawZOM yang sudah dipastikan sinkron */
        var zomDiganti    = hasilValidasi.diganti;

        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;

        /* Skor ZOM berbasis threshold regional */
        var skorZOM = dataZOM.map(function(mm) {
            return skorZOMRegional(mm, polaPuncak);
        });

        /* Log ringkas untuk verifikasi lapangan */
        console.log('%c[PatchMusim v2.1] Zona=' + polaPuncak +
            (zomDiganti ? ' | ZOM DIGANTI ke fallback timur' : ' | ZOM asli dipakai') +
            '\n Koordinat: [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']' +
            (pakaiKoordFallback ? ' ← FALLBACK GPS' : '') +
            '\n Rendeng: ' + NAMA_BULAN[startRendeng] +
            ' | Gadu: ' + NAMA_BULAN[startGadu],
            'color:#10b981; font-weight:bold;');

        var logMm = [];
        for (var m = 0; m < 12; m++) {
            logMm.push(NAMA_BULAN[m].substring(0,3) + ':' +
                dataZOM[m].toFixed(0) + 'mm→skor' + skorZOM[m]);
        }
        console.log('[PatchMusim v2.1] ' + logMm.join(' | '));

        /* Deteksi onset hujan efektif dari dataZOM yang sudah divalidasi */
        var onsetRendeng = cariOnsetHujan(startRendeng, dataZOM, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    dataZOM, polaPuncak);

        var rendengBulan = [onsetRendeng, (onsetRendeng+1)%12, (onsetRendeng+2)%12, (onsetRendeng+3)%12];
        var gaduBulan    = [onsetGadu,    (onsetGadu+1)%12,    (onsetGadu+2)%12,    (onsetGadu+3)%12];

        var MUSIM = [
            { nama: namaRendeng, kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: namaGadu,    kode: 'gadu',    bulanTanam: gaduBulan    }
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
                var mmTanam = dataZOM[bTanam];
                var mmBajak = dataZOM[(bTanam - 1 + 12) % 12];

                /* Gerbang keras: ada air untuk bajak? */
                var mmUntukBajak = Math.max(mmBajak, mmTanam);
                if (mmUntukBajak < th.thresholdBajak) {
                    console.log('[PatchMusim v2.1] Bulan ' + NAMA_BULAN[bTanam] +
                        ' dilewati — bajak: ' + mmUntukBajak.toFixed(0) +
                        'mm < threshold ' + th.thresholdBajak + 'mm');
                    return;
                }

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen   = Math.floor(v.panen * v.persenGen);
                    var tglRef    = tanggalDariBulanTahun(bTanam, tahunSekarang);
                    var bGenIdx   = tambahHari(tglRef, hariGen).getMonth();
                    var bPanenIdx = tambahHari(tglRef, v.panen).getMonth();
                    var bVeg1     = (bTanam + 1) % 12;

                    var skorGen   = skorZOM[bGenIdx];
                    var skorPanen = skorZOM[bPanenIdx];
                    var skorVeg1  = skorZOM[bVeg1];

                    var nilaiTanam = skorTanam;
                    var nilaiVeg1  = skorVeg1;
                    var nilaiGen   = 100 - Math.abs(skorGen - 55);
                    var nilaiPanen = 100 - (skorPanen * 0.5);

                    var nilaiTotal = (nilaiTanam * 0.45) +
                                     (nilaiVeg1  * 0.20) +
                                     (nilaiGen   * 0.20) +
                                     (nilaiPanen * 0.15);

                    if (mmTanam < th.thresholdOnset) {
                        nilaiTotal -= (th.thresholdOnset - mmTanam) * 0.3;
                    }
                    if (skorVeg1 < 25) {
                        nilaiTotal -= (25 - skorVeg1) * 1.0;
                    }

                    kandidatMusim.push({
                        musimNama: musim.nama, musimKode: musim.kode,
                        bTanam: bTanam, tahunTanam: tahunSekarang,
                        varietas: v.kode, labelVar: v.label, panen: v.panen,
                        nilaiTotal: nilaiTotal, skorTanam: skorTanam,
                        mmTanam: mmTanam, mmBajak: mmBajak,
                        skorGen: skorGen, skorPanen: skorPanen,
                        namaBulanGen: NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    });
                });
            });

            /* Fallback: pilih bulan dengan mm tertinggi di jendela */
            if (kandidatMusim.length === 0) {
                var bFallback = musim.bulanTanam[0], mmMax = -1;
                musim.bulanTanam.forEach(function(b) {
                    if (dataZOM[b] > mmMax) { mmMax = dataZOM[b]; bFallback = b; }
                });
                var tglFb   = cariTglFaseBulan(tanggalDariBulanTahun(bFallback, tahunSekarang), 3, 8, 0, bFallback);
                var statusFb = statusWaktuTanam(tglFb, now);
                hasilDuaMusim.push({
                    musimNama: musim.nama, musimKode: musim.kode,
                    tglTanam: tglFb, varietas: 'sedang', labelVar: 'Sedang (95–115 HST)',
                    alasan: 'Seluruh jendela di bawah threshold bajak (' + th.thresholdBajak +
                            'mm). Dipilih ' + NAMA_BULAN[bFallback] + ' (' + mmMax.toFixed(0) +
                            'mm). Pompanisasi penuh wajib disiapkan.',
                    isLewat: statusFb.isLewat, isBerjalan: statusFb.isBerjalan
                });

            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwal    = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
                var tglFaseBaik = cariTglFaseBulan(tglAwal, 3, 8, 0, best.bTanam);
                if (tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwal, 7), 3, 8, 0, best.bTanam);
                if (tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);

                var statusBest = statusWaktuTanam(tglFaseBaik, now);

                var tglOlah    = tambahHari(tglFaseBaik, -14);
                var mmOlah     = dataZOM[tglOlah.getMonth()];
                var catatanOlah = mmOlah < th.thresholdBajak
                    ? 'Perhatian: pengolahan lahan di ' + NAMA_BULAN[tglOlah.getMonth()] +
                      ' (' + mmOlah.toFixed(0) + 'mm) — siapkan pompanisasi untuk bajak.'
                    : '';

                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' :
                                      best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' :
                                      best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                hasilDuaMusim.push({
                    musimNama: best.musimNama, musimKode: best.musimKode,
                    tglTanam: tglFaseBaik, varietas: best.varietas, labelVar: best.labelVar,
                    alasan: 'Curah hujan saat tanam: ' + best.mmTanam.toFixed(0) + 'mm' +
                            ' (skor regional ' + best.skorTanam + '/100). ' +
                            'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). ' +
                            'Panen di ' + best.namaBulanPanen + ' (' + keteranganPanen + ').' +
                            (catatanOlah ? ' ⚠️ ' + catatanOlah : '') +
                            (zomDiganti ? ' ⚠️ Data ZOM diganti ke estimasi pola timur Sulsel (server ZOM tidak tersedia).' : ''),
                    isLewat: statusBest.isLewat, isBerjalan: statusBest.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function (a, b) {
            return a.tglTanam.getTime() - b.tglTanam.getTime();
        });
        return hasilDuaMusim;
    }

    /* =========================================================
       [FIX #1] OVERRIDE tentukanZonaIklim
       Agar getDataZOM() di patch_jadwal v3.10 mengembalikan
       fallback ZOM yang sinkron dengan zona kalender lokal.
       Zona 'timur' dan 'peralihan_sultra' dipetakan ke 'peralihan'
       sehingga app utama tidak memakai fallback 'monsunal' (pola barat).
    ========================================================= */
    function patchTentukanZonaIklim() {
        var _asliZonaIklim = window.tentukanZonaIklim;

        window.tentukanZonaIklim = function(lat, lon) {
            /* Cek apakah koordinat ini masuk zona timur menurut referensi regional */
            for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
                var ref = REFERENSI_MUSIM_REGIONAL[r];
                if (lat >= ref.latMin && lat <= ref.latMaks &&
                    lon >= ref.lonMin && lon <= ref.lonMaks) {
                    if (ref.polaPuncak === 'timur' || ref.polaPuncak === 'peralihan_sultra') {
                        /* Kembalikan 'peralihan' agar getDataZOM() tidak pakai fallback monsunal */
                        return 'peralihan';
                    }
                    if (ref.polaPuncak === 'ekuatorial_dua_puncak') {
                        return 'ekuatorial';
                    }
                    break;
                }
            }
            /* Di luar referensi regional — pakai fungsi asli */
            return typeof _asliZonaIklim === 'function'
                ? _asliZonaIklim(lat, lon)
                : 'monsunal';
        };

        console.log('[PatchMusim v2.1] window.tentukanZonaIklim di-patch untuk sinkronisasi zona ZOM.');
    }

    /* =========================================================
       INJEKSI
    ========================================================= */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }

        patchTentukanZonaIklim();

        window.rekomendasiWindowTanam     = rekomendasiWindowTanamV3;
        window.tentukanKalenderMusimLokal = tentukanKalenderMusimLokal;
        window.statusWaktuTanam           = statusWaktuTanam;
        window._thresholdAirMusim         = THRESHOLD_AIR;
        window._fallbackZOMTimur          = FALLBACK_ZOM_TIMUR_SULSEL;

        console.log(
            '%c✅ patch_deteksi_musim_v2.1.js aktif\n' +
            '   Fix utama: ZOM pola Barat tidak lagi dipakai untuk zona Timur Sulsel\n' +
            '   Fix #1: tentukanZonaIklim() di-patch → ZOM fallback sinkron dengan kalender\n' +
            '   Fix #2: validasiDanPerbaikiZOM() mengganti ZOM yang tidak sinkron\n' +
            '   Fix #3: deteksi koordinat fallback GPS dengan peringatan eksplisit\n' +
            '   Cek console: cari "ZOM DIGANTI" atau "FALLBACK GPS" untuk verifikasi',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
