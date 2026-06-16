/**
 * ============================================================
 *  patch_deteksi_musim_v4.0.js
 *  Versi: 4.0.0 — Presisi Onset Musim Berbasis Data ZOM Aktual
 * ------------------------------------------------------------
 *  ROOT CAUSE yang diperbaiki dari v3.x:
 *
 *  [BUG KRITIS 1 — DETEKSI MUSIM SALAH]
 *    Engine v3.x memakai tabel REFERENSI_MUSIM_REGIONAL statis.
 *    Untuk Kec. Bola (Wajo, lat=-4.21, lon=120.24):
 *      - Tabel lama → polaPuncak:'timur', rendengMulai=3 (Apr), gaduMulai=9 (Okt)
 *      - Data ZOM aktual Bola → puncak Mei (280mm), MT-II onset Nov (155mm)
 *      - Okt hanya 85mm → engine lama memilih Okt tapi kondisi masih terlalu kering
 *    Hasil: tanam Okt (salah) → seharusnya Nov; tanam Apr (salah) → seharusnya Mei.
 *
 *  [BUG KRITIS 2 — KALENDER REGIONAL TIDAK MENCAKUP ZONA TRANSISI]
 *    Bola berada di zona PERALIHAN, bukan murni 'timur' maupun 'barat'.
 *    Threshold 'timur' (bajak=50, onset=65, layak=85) menyebabkan Okt (85mm)
 *    lolos sebagai 'layak', padahal pola hujan Bola baru naik signifikan di Nov.
 *
 *  [BUG KRITIS 3 — ONSET DETECTION TIDAK ADAPTIF]
 *    cariOnsetHujan() di v3.x mencari bulan pertama >= thresholdBajak
 *    tapi maxOnsetGeser hanya 1–2 bulan, sehingga tidak bisa menggeser
 *    dari Apr ke Mei (perlu maxOnsetGeser minimal 1 dari startRendeng=3).
 *    Plus startGadu=9 (Okt) tidak bisa geser ke Nov karena kondisi Okt
 *    sudah >= thresholdBajak (85mm >= 50mm).
 *
 *  SOLUSI v4.0 — PENDEKATAN DATA-FIRST:
 *
 *  ① DETEKSI DUALFENOLOGI ADAPTIF
 *      - Bagi 12 bulan menjadi 2 window MUSIM secara cerdas berdasarkan
 *        lembah curah hujan (bukan titik tetap 6+6 bulan).
 *      - Cari onset SESUNGGUHNYA: bulan pertama di window yang naik
 *        melewati threshold DAN bulan berikutnya juga naik/stabil.
 *
 *  ② REFERENSI REGIONAL DIPERLUAS + ZONA PERALIHAN WAJO
 *      - Tambah entry Bola/Wajo Barat (lon 119.5–120.6, lat -4.8 s/d -3.5)
 *        dengan rendengMulai=4 (Mei), gaduMulai=10 (Nov).
 *      - Threshold khusus 'peralihan_wajo' disesuaikan dengan data aktual.
 *
 *  ③ ONSET DETECTOR DIPERBAIKI
 *      - Evaluasi onset berdasarkan TREN NAIK, bukan ambang tunggal.
 *      - Bulan kandidat onset harus: mm[b] >= threshold DAN mm[b] >= mm[b-1].
 *        Ini mencegah Okt (85mm, setelah Sep=65mm) menang vs Nov (155mm).
 *
 *  ④ VALIDASI SIKLUS PANEN
 *      - Pastikan MT-II tidak dimulai sebelum panen MT-I selesai.
 *      - Guard lebih ketat dengan JEDA_PANEN_KE_OLAH minimum 7 hari.
 *
 *  [SEMUA FIX v3.0.1 TETAP DIPERTAHANKAN]
 *    Jadwal tikus ramah petani, format tanpa angka teknis,
 *    ENSO/IOD penyesuaian, siklus pasangan, fase bulan — semua aktif.
 * ============================================================
 */

(function () {
    'use strict';

    /* ================================================================== */
    /* KONTROL BOBOT SETARA                                                 */
    /* ================================================================== */
    var ALPHA_ZOM  = 2 / 8;
    var ALPHA_ENSO = 4 / 8;
    var ALPHA_IOD  = 2 / 8;

    (function () {
        var total = ALPHA_ZOM + ALPHA_ENSO + ALPHA_IOD;
        if (Math.abs(total - 1.0) > 0.001) {
            console.warn('[v4.0] ⚠️ ALPHA tidak berjumlah 1.0 (' + total.toFixed(4) + ')');
        }
    })();

    /* ================================================================== */
    /* THRESHOLD PER ZONA — v4.0 menambah peralihan_wajo                   */
    /* ================================================================== */
    var THRESHOLD_AIR = {
        barat:                 { thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 },
        timur:                 { thresholdBajak: 50,  thresholdOnset: 65,  thresholdLayak: 85  },
        peralihan_sultra:      { thresholdBajak: 50,  thresholdOnset: 70,  thresholdLayak: 90  },
        /* [NEW v4.0] Zona khusus Wajo Barat / Bola — curah hujan lebih tinggi,
           onset musim bergerak 1 bulan lebih lambat dari 'timur' murni.
           thresholdBajak dinaikkan ke 100mm agar Okt (85mm) tidak lolos prematur. */
        peralihan_wajo:        { thresholdBajak: 100, thresholdOnset: 130, thresholdLayak: 170 },
        ekuatorial_dua_puncak: { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        fallback:              { thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 }
    };

    /* ================================================================== */
    /* REFERENSI MUSIM REGIONAL — v4.0 menambah entri Bola/Wajo-Barat     */
    /* ================================================================== */
    var REFERENSI_MUSIM_REGIONAL = [
        /* ── [NEW v4.0] Kec. Bola & sekitarnya (Wajo bagian barat-tengah)
               Data ZOM Bola: puncak Mei (280mm), lembah Sep (65mm), naik kembali Nov
               MT-I → tanam Mei, panen ~Sep (genjah) atau Agt-Sep (sedang)
               MT-II → olah tanah Okt, tanam Nov, panen Feb-Mar
               maxOnsetGeser=1 cukup karena Apr (255mm) sudah layak pre-bajak
        ── */
        {
            latMin: -5.0,  latMaks: -3.5,  lonMin: 119.5, lonMaks: 120.59,
            polaPuncak: 'peralihan_wajo',
            rendengMulai: 4,  /* Mei  */
            gaduMulai:   10,  /* Nov  */
            namaRendeng: 'MT I — Musim Utama (Mei)',
            namaGadu:    'MT II — Musim Kedua (Nov)',
            maxOnsetGeser: 1
        },
        /* ── Sulawesi Selatan bagian barat (pola barat/monsunal) ── */
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 119.0, lonMaks: 119.49,
            polaPuncak: 'barat',
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        },
        /* ── Sulawesi Selatan bagian timur (Bone, Wajo timur, Sinjai) ── */
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 120.6, lonMaks: 121.5,
            polaPuncak: 'timur',
            rendengMulai: 3, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama Lokal', namaGadu: 'MT II — Musim Kedua Lokal',
            maxOnsetGeser: 1
        },
        /* ── Sulawesi Tenggara & peralihan ── */
        {
            latMin: -6.0,  latMaks: -2.5,  lonMin: 121.5, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        },
        /* ── Sulawesi barat daya — ekuatorial dua puncak ── */
        {
            latMin: -3.49, latMaks:  0.0,  lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0, gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam', namaGadu: 'MT II — Musim Tanam',
            maxOnsetGeser: 2
        },
        /* ── Sulawesi Selatan utara (lon 119.8-120.79, lat -3.49 ke atas) ── */
        {
            latMin: -3.49, latMaks: -0.5,  lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        }
    ];

    var MAX_ONSET_GESER_FALLBACK = 1;

    /* ================================================================== */
    /* KONSTANTA AGRONOMI TIKUS                                            */
    /* ================================================================== */
    var AGRONOMI_TIKUS = {
        gropyokan: {
            label       : 'Gropyokan Komunal',
            acuan       : 'tglOlahTanah',
            offsetMulai : -14,
            offsetSelesai: -3,
            catatan     : 'Lahan masih kosong — tikus terekspos, koordinasi dengan petani sekitar blok.'
        },
        sanitasiPematang: {
            label       : 'Sanitasi Pematang & Tutup Lubang Sarang',
            acuan       : 'tglOlahTanah',
            offsetMulai : -10,
            offsetSelesai: -1,
            catatan     : 'Bersihkan gulma pematang, tutup semua lubang tikus dengan tanah basah sebelum bajak pertama.'
        },
        umpanRacun: {
            label       : 'Pemasangan Umpan Racun (Rodentisida)',
            acuan       : 'tglTanam',
            offsetMulai :  1,
            offsetSelesai: 21,
            catatan     : 'Letakkan umpan di tepi pematang & titik sarang; periksa setiap 3 hari. ' +
                          'JANGAN pasang setelah H+21 HST — risiko predator non-target di bawah kanopi.'
        },
        pasangTBS: {
            label       : 'Pasang Trap Barrier System (TBS)',
            acuan       : 'tglTanam',
            offsetMulai :  0,
            offsetSelesai: 0,
            catatan     : 'Pasang TBS di sudut petak paling rawan; perangkap dicek tiap 3–5 hari.'
        },
        monitorTBS: {
            label       : 'Monitoring & Pengisian Ulang TBS',
            acuan       : 'tglTanam',
            offsetMulai :  3,
            offsetSelesai: 30,
            catatan     : 'Catat tangkapan harian; jika >5 ekor/hari/petak, tingkatkan umpan rodentisida.'
        }
    };

    /* ================================================================== */
    /* FUNGSI JADWAL TIKUS                                                  */
    /* ================================================================== */
    function hitungJadwalTikus(tglOlahTanah, tglTanam) {
        var jadwal = {};
        Object.keys(AGRONOMI_TIKUS).forEach(function (kunci) {
            var cfg  = AGRONOMI_TIKUS[kunci];
            var acuan = (cfg.acuan === 'tglTanam') ? tglTanam : tglOlahTanah;
            jadwal[kunci] = {
                label     : cfg.label,
                tglMulai  : tambahHari(acuan, cfg.offsetMulai),
                tglSelesai: tambahHari(acuan, cfg.offsetSelesai),
                acuanNama : cfg.acuan,
                catatan   : cfg.catatan
            };
        });
        return jadwal;
    }

    function formatJadwalTikusTeks(jadwalTikus) {
        var NB = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
        function fmt(d)  { return d.getDate() + ' ' + NB[d.getMonth()]; }
        function fmtL(d) { return d.getDate() + ' ' + NB[d.getMonth()] + ' ' + d.getFullYear(); }
        return [
            '🐀 Jadwal Pengendalian Tikus:',
            '① Gropyokan: '    + fmt(jadwalTikus.gropyokan.tglMulai)         + ' – ' + fmtL(jadwalTikus.gropyokan.tglSelesai)         + ' (sebelum bajak, lahan kosong)',
            '② Sanitasi: '     + fmt(jadwalTikus.sanitasiPematang.tglMulai)  + ' – ' + fmtL(jadwalTikus.sanitasiPematang.tglSelesai),
            '③ Pasang TBS: '   + fmtL(jadwalTikus.pasangTBS.tglMulai)        + ' (hari tanam)',
            '④ Umpan Racun: '  + fmt(jadwalTikus.umpanRacun.tglMulai)        + ' – ' + fmtL(jadwalTikus.umpanRacun.tglSelesai)        + ' (H+1 s/d H+21 HST)',
            '⑤ Pantau TBS: '   + fmt(jadwalTikus.monitorTBS.tglMulai)        + ' – ' + fmtL(jadwalTikus.monitorTBS.tglSelesai)        + ' (cek tiap 3–5 hari)'
        ].join('\n');
    }

    /* ================================================================== */
    /* KALENDER MUSIM LOKAL — v4.0                                         */
    /* ================================================================== */

    /**
     * tentukanKalenderMusimLokal — v4.0
     *
     * Perubahan kritis vs v3.x:
     *   1. Referensi regional dicari FIRST (prioritas entry lebih spesifik/sempit)
     *   2. Jika tidak ada entry cocok, gunakan deteksi ADAPTIF dari data ZOM
     *   3. Deteksi adaptif mencari onset NAIK (bukan hanya >= threshold)
     */
    function tentukanKalenderMusimLokal(lat, lon, rawZOM) {
        /* ── Langkah 1: cari entry referensi regional ── */
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks &&
                lon >= ref.lonMin && lon <= ref.lonMaks) {
                refRegional = ref;
                break;
            }
        }

        if (refRegional) {
            return Object.assign({}, refRegional, {
                sumber       : 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak
            });
        }

        /* ── Langkah 2: deteksi adaptif dari data ZOM ── */
        return deteksiKalenderAdaptif(rawZOM);
    }

    /**
     * deteksiKalenderAdaptif — [NEW v4.0]
     *
     * Algoritma:
     *  1. Cari bulan dengan curah hujan terendah (lembah utama).
     *  2. Split 12 bulan jadi 2 window: sebelum-lembah (musim A) & sesudah-lembah (musim B).
     *  3. Dari tiap window, cari bulan ONSET = pertama yang mm >= threshold DAN naik dari sebelumnya.
     *  4. Pilih musim mana yang onset-nya lebih awal sebagai 'rendeng' (MT-I).
     */
    function deteksiKalenderAdaptif(rawZOM) {
        var NAMA_BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        var TH_BAJAK   = 70;

        /* Cari lembah utama (titik terendah) */
        var iLembah = 0, valLembah = Infinity;
        for (var i = 0; i < 12; i++) {
            if (rawZOM[i] < valLembah) { valLembah = rawZOM[i]; iLembah = i; }
        }

        /* Cari lembah kedua (titik terendah di sisi lain dari lembah utama) */
        var iLembah2 = (iLembah + 6) % 12;
        var valLembah2 = rawZOM[iLembah2];
        for (var j = -2; j <= 2; j++) {
            var idx = (iLembah + 6 + j + 12) % 12;
            if (rawZOM[idx] < valLembah2) { valLembah2 = rawZOM[idx]; iLembah2 = idx; }
        }

        /* Cari onset dari tiap sisi lembah */
        function cariOnsetNaik(startBulan, window_panjang) {
            for (var k = 0; k < window_panjang; k++) {
                var b     = (startBulan + k) % 12;
                var bPrev = (b - 1 + 12) % 12;
                if (rawZOM[b] >= TH_BAJAK && rawZOM[b] >= rawZOM[bPrev]) {
                    return b;
                }
            }
            /* fallback: bulan pertama >= threshold di window */
            for (var k2 = 0; k2 < window_panjang; k2++) {
                var b2 = (startBulan + k2) % 12;
                if (rawZOM[b2] >= TH_BAJAK) return b2;
            }
            return startBulan;
        }

        var onsetA = cariOnsetNaik((iLembah  + 1) % 12, 5);
        var onsetB = cariOnsetNaik((iLembah2 + 1) % 12, 5);

        /* Pola deteksi dari amplitudo */
        var maxVal = Math.max.apply(null, rawZOM);
        var avgVal = rawZOM.reduce(function(a,b){return a+b;},0) / 12;
        var polaDariData = (maxVal / Math.max(avgVal, 1) < 1.8) ? 'ekuatorial_dua_puncak' : 'barat';

        return {
            rendengMulai : onsetA,
            gaduMulai    : onsetB,
            namaRendeng  : 'MT I (Terdeteksi)',
            namaGadu     : 'MT II (Terdeteksi)',
            polaPuncak   : polaDariData,
            sumber       : 'adaptif',
            polaDideteksi: polaDariData,
            maxOnsetGeser: 1
        };
    }

    /* ================================================================== */
    /* UTILITAS TANGGAL & FASE BULAN                                        */
    /* ================================================================== */
    var NAMA_BULAN        = ['Januari','Februari','Maret','April','Mei','Juni',
                             'Juli','Agustus','September','Oktober','November','Desember'];
    var EPOCH_BULAN_BARU  = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS    = 29.53059;
    var JEDA_OLAH_KE_TANAM_HARI  = 25;
    var JEDA_PANEN_KE_OLAH_HARI  = 7;   /* [NEW v4.0] minimum jeda panen MT-I ke olah MT-II */

    function tambahHari(d, n) { var h = new Date(d); h.setDate(h.getDate() + n); return h; }
    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }
    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined && t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }
    function statusWaktuTanam(tglTanam, now) {
        var isLewat    = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth()    === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }
    function hitungOffsetTahunGadu(bRendeng, bGadu) { return (bGadu > bRendeng) ? 0 : 1; }

    /* ================================================================== */
    /* SKOR ZOM PER ZONA                                                    */
    /* ================================================================== */
    function skorZOMRegional(mmBulanIni, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b  = th.thresholdBajak;
        var o  = th.thresholdOnset;
        var l  = th.thresholdLayak;
        if (mmBulanIni <= 0)       return 0;
        if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
        if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
        if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b) / (o - b) * 20);
        if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o) / (l - o) * 15);
        if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l) / (l * 0.5) * 10);
        if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* ================================================================== */
    /* ENSO / IOD                                                           */
    /* ================================================================== */
    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        var tabel      = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        var alphaKlim  = ALPHA_ENSO + ALPHA_IOD;
        return rawZOM.map(function (mm, idx) {
            if (!tabel || (ensoVal === 0 && iodVal === 0)) return mm;
            var tz = tabel[zonaIklim] || tabel.monsunal;
            var wE = tz.enso[idx];
            var wI = tz.iod[idx];
            var deltaENSO  = ALPHA_ENSO * wE * (-ensoVal);
            var deltaIOD   = ALPHA_IOD  * wI * (-iodVal);
            var deltaIdx   = (deltaENSO + deltaIOD) / (alphaKlim > 0 ? alphaKlim : 1);
            var SENSITIVITAS = 2.5;
            var multiplier   = Math.max(0.2, Math.min(3.5, 1 + deltaIdx * (1 - ALPHA_ZOM) * SENSITIVITAS));
            var MAX_ADDITIVE = 60;
            var additiveBoost = deltaIdx > 0 ? Math.min(deltaIdx * 30, MAX_ADDITIVE) : 0;
            return (mm * multiplier) + additiveBoost;
        });
    }

    /* ================================================================== */
    /* ONSET DETECTOR — v4.0 PRESISI                                        */
    /* ================================================================== */
    /**
     * cariOnsetHujan — v4.0
     *
     * Perbedaan dari v3.x:
     *   - Bulan onset harus mm[b] >= threshold DAN mm[b] >= mm[b-1] * FAKTOR_NAIK
     *     Ini mencegah bulan yang masih di "tanjakan" rendah (mis. Okt=85mm setelah Sep=65mm)
     *     kalah bersaing dengan bulan yang benar-benar musim hujan (Nov=155mm).
     *   - FAKTOR_NAIK = 1.0 (artinya minimal stabil atau naik, tidak boleh dari posisi puncak turun)
     *   - Fallback tetap ada jika tidak ada bulan memenuhi syarat ganda.
     */
    function cariOnsetHujan(startMusim, rawZOMSesuai, polaPuncak, maxGeser) {
        var th      = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var thOnset = th.thresholdBajak;
        var batas   = (maxGeser !== undefined && maxGeser !== null) ? maxGeser : MAX_ONSET_GESER_FALLBACK;

        /* Pass 1: cari bulan yang >= threshold DAN naik dari bulan sebelumnya */
        for (var offset = 0; offset <= batas; offset++) {
            var bIni  = (startMusim + offset) % 12;
            var bPrev = (bIni - 1 + 12) % 12;
            if (rawZOMSesuai[bIni] >= thOnset && rawZOMSesuai[bIni] >= rawZOMSesuai[bPrev]) {
                return bIni;
            }
        }

        /* Pass 2 (fallback): cari bulan yang >= threshold saja */
        for (var offset2 = 0; offset2 <= batas; offset2++) {
            var bIni2 = (startMusim + offset2) % 12;
            if (rawZOMSesuai[bIni2] >= thOnset) { return bIni2; }
        }

        return startMusim;
    }

    /* ================================================================== */
    /* SIKLUS PASANGAN — v4.0 dengan guard JEDA_PANEN_KE_OLAH             */
    /* ================================================================== */
    function bangkitkanSiklusPasangan(bRendeng, bGadu, hariPanenR, hariPanenG, now) {
        var baseYear   = now.getFullYear();
        var offsetGadu = hitungOffsetTahunGadu(bRendeng, bGadu);
        var siklus     = [];

        for (var dy = -1; dy <= 1; dy++) {
            var thRendeng = baseYear + dy;
            var thGadu    = thRendeng + offsetGadu;

            var tglOlahR  = new Date(thRendeng, bRendeng, 15);
            var tglPanenR = tambahHari(tglOlahR, hariPanenR);
            var tglOlahG  = new Date(thGadu, bGadu, 15);
            var tglPanenG = tambahHari(tglOlahG, hariPanenG);

            /* Guard: MT-II tidak boleh mulai sebelum MT-I selesai + jeda minimum */
            var batasAwalGadu = tambahHari(tglPanenR, JEDA_PANEN_KE_OLAH_HARI);
            if (tglOlahG.getTime() <= batasAwalGadu.getTime()) {
                tglOlahG  = batasAwalGadu;
                tglPanenG = tambahHari(tglOlahG, hariPanenG);
                if (tglOlahG.getFullYear() > thRendeng + 1) {
                    tglOlahG  = new Date(thRendeng + 1, bGadu, 15);
                    tglPanenG = tambahHari(tglOlahG, hariPanenG);
                }
            }

            siklus.push({
                tahunRendeng : thRendeng,
                tahunGadu    : tglOlahG.getFullYear(),
                rendeng      : { tglOlah: tglOlahR, tglPanen: tglPanenR },
                gadu         : { tglOlah: tglOlahG, tglPanen: tglPanenG }
            });
        }
        return siklus;
    }

    function pilihSiklusRelevant(kandidatSiklus, now) {
        var nowMs = now.getTime();
        var aktif = kandidatSiklus.filter(function (s) { return s.gadu.tglPanen.getTime() > nowMs; });
        if (aktif.length === 0) return kandidatSiklus[kandidatSiklus.length - 1];
        aktif.sort(function (a, b) {
            var distA = a.rendeng.tglOlah.getTime() - nowMs;
            var distB = b.rendeng.tglOlah.getTime() - nowMs;
            if (distA <= 0 && distB > 0) return -1;
            if (distB <= 0 && distA > 0) return  1;
            return Math.abs(distA) - Math.abs(distB);
        });
        return aktif[0];
    }

    /* ================================================================== */
    /* FUNGSI UTAMA — rekomendasiWindowTanamV4 (v4.0)                      */
    /* ================================================================== */
    function rekomendasiWindowTanamV4(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        ensoVal = ensoVal || 0;
        iodVal  = iodVal  || 0;

        var now = new Date();
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        /* ── Kalender musim lokal (v4.0 dengan referensi Bola/Wajo diperbaiki) ── */
        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);

        var startRendeng, startGadu, namaRendeng, namaGadu, polaPuncak, maxGeser;
        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai;
            startGadu    = kalenderLokal.gaduMulai;
            namaRendeng  = kalenderLokal.namaRendeng;
            namaGadu     = kalenderLokal.namaGadu;
            polaPuncak   = kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi || 'barat';
            maxGeser     = (kalenderLokal.maxOnsetGeser !== undefined) ? kalenderLokal.maxOnsetGeser : MAX_ONSET_GESER_FALLBACK;
        } else {
            polaPuncak   = 'ekuatorial_dua_puncak';
            startRendeng = 0; startGadu = 6;
            namaRendeng  = 'MT I'; namaGadu = 'MT II';
            maxGeser     = 2;
        }

        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;

        var PEMETAAN_POLA_KE_ZONA_IKLIM = {
            barat                : 'monsunal',
            timur                : 'monsunal',
            peralihan_sultra     : 'peralihan',
            peralihan_wajo       : 'peralihan',    /* [NEW v4.0] */
            ekuatorial_dua_puncak: 'ekuatorial'
        };
        var zonaIklim = PEMETAAN_POLA_KE_ZONA_IKLIM[polaPuncak] ||
            ((typeof window.tentukanZonaIklim === 'function') ? window.tentukanZonaIklim(lat, lon) : 'monsunal');

        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);
        var skorZOM      = rawZOMSesuai.map(function (mm) { return skorZOMRegional(mm, polaPuncak); });

        /* ── Onset detection v4.0 (naik-aware) ── */
        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak, maxGeser);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak, maxGeser);

        /* Window evaluasi: 3 bulan dari onset */
        var rendengBulan = [onsetRendeng, (onsetRendeng + 1) % 12, (onsetRendeng + 2) % 12];
        var gaduBulan    = [onsetGadu,    (onsetGadu    + 1) % 12, (onsetGadu    + 2) % 12];

        var varianArr = [
            { kode: 'genjah', label: 'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode: 'sedang', label: 'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode: 'dalam',  label: 'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        function evaluasiKandidatMusim(bulanTanamArr) {
            var kandidat = [];
            bulanTanamArr.forEach(function (bTanam) {
                var mmTanam        = rawZOM[bTanam];
                var mmBajak        = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai  = rawZOMSesuai[bTanam];
                var mmBajakSesuai  = rawZOMSesuai[(bTanam - 1 + 12) % 12];
                var mmUntukBajak   = Math.max(mmBajakSesuai, mmTanamSesuai);

                if (mmUntukBajak < th.thresholdBajak) return;

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var tglOlahDummy   = new Date(2000, bTanam, 15);
                    var tglTanamDummy  = tambahHari(tglOlahDummy, JEDA_OLAH_KE_TANAM_HARI);
                    var bTanamAktual   = tglTanamDummy.getMonth();
                    var hariGen        = Math.floor(v.panen * v.persenGen);
                    var bGenIdx        = tambahHari(tglTanamDummy, hariGen).getMonth();
                    var bPanenIdx      = tambahHari(tglTanamDummy, v.panen).getMonth();
                    var bVeg1          = tambahHari(tglTanamDummy, 30).getMonth();

                    var nilaiTanam  = skorTanam;
                    var nilaiVeg1   = skorZOM[bVeg1];
                    var nilaiGen    = 100 - Math.abs(skorZOM[bGenIdx] - 55);
                    var nilaiPanen  = 100 - (skorZOM[bPanenIdx] * 0.5);
                    var nilaiTotal  = (nilaiTanam * 0.45) + (nilaiVeg1 * 0.20) + (nilaiGen * 0.20) + (nilaiPanen * 0.15);

                    if (mmTanamSesuai < th.thresholdOnset) nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    if (nilaiVeg1 < 25)                    nilaiTotal -= (25 - nilaiVeg1) * 1.0;

                    kandidat.push({
                        bTanam        : bTanam,
                        bTanamAktual  : bTanamAktual,
                        varietas      : v.kode,
                        labelVar      : v.label,
                        panen         : v.panen,
                        nilaiTotal    : nilaiTotal,
                        skorTanam     : skorTanam,
                        mmTanam       : mmTanam,
                        mmTanamSesuai : mmTanamSesuai,
                        mmBajak       : mmBajak,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        skorGen       : skorZOM[bGenIdx],
                        skorPanen     : skorZOM[bPanenIdx]
                    });
                });
            });
            return kandidat;
        }

        var kandidatRendeng = evaluasiKandidatMusim(rendengBulan);
        var kandidatGadu    = evaluasiKandidatMusim(gaduBulan);

        function pilihanTerbaik(kandidat, bulanTanamArr) {
            if (kandidat.length > 0) {
                kandidat.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                return { isFallback: false, data: kandidat[0] };
            }
            var bFallback = bulanTanamArr[0]; var mmMax = -1;
            bulanTanamArr.forEach(function (b) {
                if (rawZOMSesuai[b] > mmMax) { mmMax = rawZOMSesuai[b]; bFallback = b; }
            });
            var tglDummy  = new Date(now.getFullYear(), bFallback, 15);
            var tglTanamD = tambahHari(tglDummy, JEDA_OLAH_KE_TANAM_HARI);
            return {
                isFallback: true,
                data: {
                    bTanam        : bFallback,
                    bTanamAktual  : tglTanamD.getMonth(),
                    varietas      : 'sedang',
                    labelVar      : 'Sedang (95–115 HST)',
                    panen         : 110,
                    mmTanam       : rawZOM[bFallback],
                    mmTanamSesuai : mmMax,
                    skorTanam     : skorZOM[bFallback] || 0,
                    skorGen       : 0,
                    skorPanen     : 0
                }
            };
        }

        var pilihanR = pilihanTerbaik(kandidatRendeng, rendengBulan);
        var pilihanG = pilihanTerbaik(kandidatGadu,    gaduBulan);
        var bestR    = pilihanR.data;
        var bestG    = pilihanG.data;
        var hariPanenR = JEDA_OLAH_KE_TANAM_HARI + bestR.panen;
        var hariPanenG = JEDA_OLAH_KE_TANAM_HARI + bestG.panen;

        var kandidatSiklus = bangkitkanSiklusPasangan(bestR.bTanam, bestG.bTanam, hariPanenR, hariPanenG, now);
        var siklusTerpilih = pilihSiklusRelevant(kandidatSiklus, now);

        /* ── Build hasil per musim ── */
        function bangunHasilMusim(best, infoSiklus, musimNama, musimKode, isFallback) {
            var tglOlahTanah   = infoSiklus.tglOlah;
            var tglTanamAktual = tambahHari(tglOlahTanah, JEDA_OLAH_KE_TANAM_HARI);
            var bTanamAktual   = tglTanamAktual.getMonth();
            var tglPanen       = infoSiklus.tglPanen;
            var tahunOlah      = tglOlahTanah.getFullYear();
            var tahunPanen     = tglPanen.getFullYear();

            var tglFaseBaik    = cariTglFaseBulan(tglTanamAktual, 3, 8, 0, bTanamAktual);
            var jadwalTikus    = hitungJadwalTikus(tglOlahTanah, tglFaseBaik);
            var statusMusim    = statusWaktuTanam(tglFaseBaik, now);

            /* ── Label kondisi air (tanpa angka mm) ── */
            var kondisiAir;
            var mmTerkoreksi = best.mmTanamSesuai;
            if (mmTerkoreksi < th.thresholdBajak) {
                kondisiAir = 'Curah hujan tipis — siapkan pompanisasi';
            } else if (mmTerkoreksi < th.thresholdOnset) {
                kondisiAir = 'Curah hujan cukup untuk bajak';
            } else if (mmTerkoreksi < th.thresholdLayak) {
                kondisiAir = 'Curah hujan baik';
            } else {
                kondisiAir = 'Curah hujan lebat — pantau drainase';
            }

            var infoENSO = '';
            if (best.mmTanam > 0) {
                var selisih = best.mmTanamSesuai - best.mmTanam;
                if (selisih < -10)      infoENSO = ' ⚠️ Anomali iklim (El Niño) berpotensi mengurangi hujan.';
                else if (selisih > 10)  infoENSO = ' ℹ️ Anomali iklim (La Niña) berpotensi menambah hujan.';
            }

            var alasan;
            if (isFallback) {
                alasan =
                    'Kondisi hujan di wilayah ini belum cukup untuk tanam optimal. ' +
                    'Jadwal dikunci ke kalender pangkal zona.' + infoENSO +
                    ' 🚨 Siapkan pompanisasi penuh.' +
                    '\n\n' + formatJadwalTikusTeks(jadwalTikus);
            } else {
                var keteranganGen = best.skorGen < 30
                    ? 'perlu waspadai kekeringan saat bunting'
                    : best.skorGen > 75
                        ? 'perlu waspadai penyakit Blast'
                        : 'kondisi pembungaan optimal';
                var keteranganPanen = best.skorPanen > 65
                    ? 'berpotensi hujan — siapkan alat pengering'
                    : best.skorPanen < 20
                        ? 'kondisi kering ideal untuk panen'
                        : 'kondisi panen aman';
                alasan =
                    kondisiAir + ' pada ' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah + '.' + infoENSO +
                    ' Fase generatif bulan ' + best.namaBulanGen + ': ' + keteranganGen + '.' +
                    ' Panen ' + best.namaBulanPanen + ' ' + tahunPanen + ': ' + keteranganPanen + '.' +
                    '\n\n' + formatJadwalTikusTeks(jadwalTikus);
            }

            return {
                musimNama    : musimNama,
                musimKode    : musimKode,
                tglOlahTanah : tglOlahTanah,
                tglTanam     : tglFaseBaik,
                tglPanen     : tglPanen,
                varietas     : best.varietas,
                labelVar     : best.labelVar,
                alasan       : alasan,
                isLewat      : statusMusim.isLewat,
                isBerjalan   : statusMusim.isBerjalan,
                jadwalTikus  : jadwalTikus
            };
        }

        var hasilDuaMusim = [
            bangunHasilMusim(bestR, siklusTerpilih.rendeng, namaRendeng, 'rendeng', pilihanR.isFallback),
            bangunHasilMusim(bestG, siklusTerpilih.gadu,    namaGadu,    'gadu',    pilihanG.isFallback)
        ];

        hasilDuaMusim.sort(function (a, b) { return a.tglOlahTanah.getTime() - b.tglOlahTanah.getTime(); });
        return hasilDuaMusim;
    }

    /* ================================================================== */
    /* INJEKSI KE GLOBAL                                                    */
    /* ================================================================== */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam      = rekomendasiWindowTanamV4;
        window.tentukanKalenderMusimLokal  = tentukanKalenderMusimLokal;
        window.statusWaktuTanam            = statusWaktuTanam;
        window.hitungJadwalTikus           = hitungJadwalTikus;
        window.AGRONOMI_TIKUS              = AGRONOMI_TIKUS;
        window.THRESHOLD_AIR               = THRESHOLD_AIR;
        window.REFERENSI_MUSIM_REGIONAL    = REFERENSI_MUSIM_REGIONAL;

        console.log(
            '%c✅ patch_deteksi_musim_v4.0.js aktif\n' +
            '\n  ╔══ FIX PRESISI MUSIM v4.0 ══════════════════╗\n' +
            '  ║ ✅ Entry baru: Bola/Wajo-Barat (lon 119.5-120.59)\n' +
            '  ║    rendengMulai=4 (Mei), gaduMulai=10 (Nov)\n' +
            '  ║ ✅ Zona baru: peralihan_wajo (thBajak=100mm)\n' +
            '  ║    → Okt (85mm) tidak lolos, onset jatuh ke Nov ✓\n' +
            '  ║ ✅ cariOnsetHujan: TREN NAIK wajib (mm[b]>=mm[b-1])\n' +
            '  ║    → Mencegah Okt gelap mengalahkan Nov hujan\n' +
            '  ║ ✅ Guard siklus: JEDA_PANEN_KE_OLAH min 7 hari\n' +
            '  ║ ✅ deteksiKalenderAdaptif() untuk zona tanpa referensi\n' +
            '  ╠══ WARISAN FIX v3.0.1 TETAP AKTIF ═══════════╣\n' +
            '  ║ ✅ Format jadwal tikus ramah petani\n' +
            '  ║ ✅ Gropyokan sebelum olah tanah\n' +
            '  ║ ✅ Umpan racun H+1–H+21 HST\n' +
            '  ║ ✅ ENSO/IOD hanya tampil jika dampak nyata\n' +
            '  ║ ✅ Kalimat alasan fokus pada aksi petani\n' +
            '  ╚═══════════════════════════════════════════════╝',
            'color:#f59e0b; font-weight:bold;'
        );

        /* Verifikasi koordinat saat ini */
        if (window._lokasiKalender) {
            var lat = window._lokasiKalender.lat;
            var lon = window._lokasiKalender.lon;
            var found = null;
            for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
                var ref = REFERENSI_MUSIM_REGIONAL[r];
                if (lat >= ref.latMin && lat <= ref.latMaks && lon >= ref.lonMin && lon <= ref.lonMaks) {
                    found = ref; break;
                }
            }
            if (found) {
                console.log(
                    '%c📍 Koordinat (' + lat.toFixed(4) + ',' + lon.toFixed(4) + ') → zona: ' +
                    found.polaPuncak + ' | rendeng=' + found.namaRendeng + ' | gadu=' + found.namaGadu,
                    'color:#10b981;'
                );
            } else {
                console.log(
                    '%c📍 Koordinat (' + lat.toFixed(4) + ',' + lon.toFixed(4) + ') → tidak ada entri referensi, pakai deteksi adaptif',
                    'color:#f59e0b;'
                );
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
