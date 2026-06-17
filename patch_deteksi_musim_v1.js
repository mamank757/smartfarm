/**
 * ============================================================
 * patch_deteksi_musim_v3.0.js
 * Versi: 3.0.1 — Fix Tampilan Output Ramah Petani
 * ------------------------------------------------------------
 * PERBAIKAN v3.0.1 vs v3.0:
 *
 * [FIX TAMPILAN]
 *   - Hilangkan label bobot teknis [ZOM:25% ENSO:50% IOD:25%]
 *     dari kalimat alasan — tidak berguna bagi petani
 *   - Hilangkan angka mm teknis (125mm → 111mm terkoreksi)
 *     dari kalimat utama, cukup tampilkan status kondisi
 *   - Format jadwal tikus diubah menjadi lebih ringkas,
 *     hierarkis, dan mudah dibaca tanpa angka mm/bobot
 *   - Kalimat alasan disederhanakan: fokus pada AKSI dan
 *     WAKTU, bukan angka teknis
 *
 * [SEMUA FIX v3.0 TETAP DIPERTAHANKAN]
 * ============================================================
 */

(function () {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* KONTROL BOBOT SETARA — jumlah harus 1.0                             */
    /* ------------------------------------------------------------------ */
    var ALPHA_ZOM  = 2 / 8;
    var ALPHA_ENSO = 4 / 8;
    var ALPHA_IOD  = 2 / 8;

    (function () {
        var total = ALPHA_ZOM + ALPHA_ENSO + ALPHA_IOD;
        if (Math.abs(total - 1.0) > 0.001) {
            console.warn('[v3.0.1] ⚠️ ALPHA tidak berjumlah 1.0 (' + total.toFixed(4) + ')');
        }
    })();

    /* ------------------------------------------------------------------ */
    /* THRESHOLD PER ZONA                                                   */
    /* ------------------------------------------------------------------ */
    var THRESHOLD_AIR = {
        barat:                 { thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 },
        timur:                 { thresholdBajak: 50,  thresholdOnset: 65,  thresholdLayak: 85  },
        peralihan_sultra:      { thresholdBajak: 50,  thresholdOnset: 70,  thresholdLayak: 90  },
        ekuatorial_dua_puncak: { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        fallback:              { thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 }
    };

    /* ------------------------------------------------------------------ */
    /* REFERENSI REGIONAL                                                   */
    /* ------------------------------------------------------------------ */
    var REFERENSI_MUSIM_REGIONAL = [
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 119.0, lonMaks: 119.99,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        },
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 120.0, lonMaks: 120.79,
            polaPuncak: 'timur',
            rendengMulai: 2, gaduMulai: 8,
            namaRendeng: 'MT I — Musim Utama Lokal', namaGadu: 'MT II — Musim Kedua Lokal',
            maxOnsetGeser: 1
        },
        {
            latMin: -6.0,  latMaks: -2.5,  lonMin: 120.8, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2, gaduMulai: 8,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        },
        {
            latMin: -3.49, latMaks: -0.5,  lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1
        },
        {
            latMin: -3.49, latMaks:  0.0,  lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0, gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam', namaGadu: 'MT II — Musim Tanam',
            maxOnsetGeser: 2
        }
    ];

    var MAX_ONSET_GESER_FALLBACK = 1;

    /* ------------------------------------------------------------------ */
    /* KONSTANTA AGRONOMI PENGENDALIAN TIKUS                                */
    /* ------------------------------------------------------------------ */
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

    /* ------------------------------------------------------------------ */
    /* FUNGSI UTAMA JADWAL TIKUS                                            */
    /* ------------------------------------------------------------------ */
    function hitungJadwalTikus(tglOlahTanah, tglTanam) {
        var jadwal = {};

        Object.keys(AGRONOMI_TIKUS).forEach(function (kunci) {
            var cfg   = AGRONOMI_TIKUS[kunci];
            var acuan = (cfg.acuan === 'tglTanam') ? tglTanam : tglOlahTanah;

            var tglMulai    = tambahHari(acuan, cfg.offsetMulai);
            var tglSelesai  = tambahHari(acuan, cfg.offsetSelesai);

            jadwal[kunci] = {
                label     : cfg.label,
                tglMulai  : tglMulai,
                tglSelesai: tglSelesai,
                acuanNama : cfg.acuan,
                catatan   : cfg.catatan
            };
        });

        return jadwal;
    }

    /**
     * formatJadwalTikusTeks — versi ramah petani
     *
     * Perubahan v3.0.1:
     *   - Hapus angka mm dan bobot teknis
     *   - Format ringkas: ikon + nama kegiatan + rentang tanggal
     *   - Keterangan singkat dalam tanda kurung, bukan kalimat panjang
     */
    function formatJadwalTikusTeks(jadwalTikus) {
        var NAMA_BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

        function fmt(d) {
            return d.getDate() + ' ' + NAMA_BULAN_PENDEK[d.getMonth()];
        }
        function fmtLengkap(d) {
            return d.getDate() + ' ' + NAMA_BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear();
        }

        var baris = [
            '🐀 Jadwal Pengendalian Tikus:',
            '① Gropyokan: ' + fmt(jadwalTikus.gropyokan.tglMulai) + ' – ' + fmtLengkap(jadwalTikus.gropyokan.tglSelesai) + ' (sebelum bajak, lahan kosong)',
            '② Sanitasi Pematang: ' + fmt(jadwalTikus.sanitasiPematang.tglMulai) + ' – ' + fmtLengkap(jadwalTikus.sanitasiPematang.tglSelesai),
            '③ Pasang TBS: ' + fmtLengkap(jadwalTikus.pasangTBS.tglMulai) + ' (hari tanam)',
            '④ Umpan Racun: ' + fmt(jadwalTikus.umpanRacun.tglMulai) + ' – ' + fmtLengkap(jadwalTikus.umpanRacun.tglSelesai) + ' (awal tanam, kanopi belum tutup)',
            '⑤ Pantau TBS: ' + fmt(jadwalTikus.monitorTBS.tglMulai) + ' – ' + fmtLengkap(jadwalTikus.monitorTBS.tglSelesai) + ' (cek tiap 3–5 hari)'
        ];

        return baris.join('\n');
    }

    /* ------------------------------------------------------------------ */
    /* KALENDER MUSIM LOKAL                                                 */
    /* ------------------------------------------------------------------ */
    function tentukanKalenderMusimLokal(lat, lon, rawZOM) {
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks && lon >= ref.lonMin && lon <= ref.lonMaks) {
                refRegional = ref; break;
            }
        }

        var blnMax = 0, valMax = -Infinity;
        for (var i = 0; i < 12; i++) { if (rawZOM[i] > valMax) { valMax = rawZOM[i]; blnMax = i; } }
        var polaDariZOM = (valMax < 0.4) ? 'ekuatorial' : (blnMax >= 3 && blnMax <= 8) ? 'timur' : 'barat';

        if (refRegional) {
            return Object.assign({}, refRegional, {
                sumber: 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak
            });
        }
        if (polaDariZOM === 'timur') {
            return {
                rendengMulai: (blnMax - 1 + 12) % 12, gaduMulai: (blnMax + 5) % 12,
                namaRendeng: 'MT I Lokal', namaGadu: 'MT II Lokal',
                sumber: 'zom-timur', polaDideteksi: 'timur',
                maxOnsetGeser: 1
            };
        }
        if (polaDariZOM === 'ekuatorial') return null;
        return {
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I', namaGadu: 'MT II',
            sumber: 'fallback-barat', polaDideteksi: 'barat',
            maxOnsetGeser: MAX_ONSET_GESER_FALLBACK
        };
    }

    /* ------------------------------------------------------------------ */
    /* UTILITAS TANGGAL & FASE BULAN                                        */
    /* ------------------------------------------------------------------ */
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var EPOCH_BULAN_BARU   = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS     = 29.53059;
    var JEDA_OLAH_KE_TANAM_HARI = 25;

    function tambahHari(d, n) { var h = new Date(d); h.setDate(h.getDate() + n); return h; }
    function hariFaseBulan(tgl) { var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000; return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS; }
    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined && t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulan(t); if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }

    function statusWaktuTanam(tglTanam, now) {
        var isLewat    = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat && tglTanam.getMonth() === now.getMonth() && tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    function hitungOffsetTahunGadu(bRendeng, bGadu) { return (bGadu > bRendeng) ? 0 : 1; }

    /* ------------------------------------------------------------------ */
    /* SIKLUS PASANGAN                                                      */
    /* ------------------------------------------------------------------ */
    function bangkitkanSiklusPasangan(bRendeng, bGadu, hariPanenR, hariPanenG, now) {
        var baseYear   = now.getFullYear();
        var offsetGadu = hitungOffsetTahunGadu(bRendeng, bGadu);
        var siklus     = [];

        for (var dy = -1; dy <= 1; dy++) {
            var thRendeng  = baseYear + dy;
            var thGadu     = thRendeng + offsetGadu;

            var tglOlahR   = new Date(thRendeng, bRendeng, 15);
            var tglPanenR  = tambahHari(tglOlahR, hariPanenR);
            var tglOlahG   = new Date(thGadu, bGadu, 15);
            var tglPanenG  = tambahHari(tglOlahG, hariPanenG);

            if (tglOlahG.getTime() <= tglPanenR.getTime()) {
                tglOlahG  = tambahHari(tglPanenR, 10);
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
        var nowMs  = now.getTime();
        var aktif  = kandidatSiklus.filter(function (s) { return s.gadu.tglPanen.getTime() > nowMs; });
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

    /* ------------------------------------------------------------------ */
    /* SKOR ZOM PER ZONA                                                    */
    /* ------------------------------------------------------------------ */
    function skorZOMRegional(mmBulanIni, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b  = th.thresholdBajak; var o = th.thresholdOnset; var l = th.thresholdLayak;
        if (mmBulanIni <= 0)       return 0;
        if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
        if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
        if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b) / (o - b) * 20);
        if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o) / (l - o) * 15);
        if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l) / (l * 0.5) * 10);
        if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* ------------------------------------------------------------------ */
    /* ENSO/IOD                                                             */
    /* ------------------------------------------------------------------ */
    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        var tabel = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        var alphaKlim = ALPHA_ENSO + ALPHA_IOD;

        return rawZOM.map(function (mm, idx) {
            if (!tabel || (ensoVal === 0 && iodVal === 0)) return mm;

            var tz = tabel[zonaIklim] || tabel.monsunal;
            var wE = tz.enso[idx];
            var wI = tz.iod[idx];

            var deltaENSO = ALPHA_ENSO * wE * (-ensoVal);
            var deltaIOD  = ALPHA_IOD  * wI * (-iodVal);
            var deltaIdx  = (deltaENSO + deltaIOD) / (alphaKlim > 0 ? alphaKlim : 1);

            var SENSITIVITAS = 2.5;
            var multiplier   = Math.max(0.2, Math.min(3.5, 1 + deltaIdx * (1 - ALPHA_ZOM) * SENSITIVITAS));

            var MAX_ADDITIVE  = 60;
            var additiveBoost = deltaIdx > 0 ? Math.min(deltaIdx * 30, MAX_ADDITIVE) : 0;

            return (mm * multiplier) + additiveBoost;
        });
    }

    /* ------------------------------------------------------------------ */
    /* ONSET                                                                */
    /* ------------------------------------------------------------------ */
    function cariOnsetHujan(startMusim, rawZOMSesuai, polaPuncak, maxGeser) {
        var th       = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var thOnset  = th.thresholdBajak;
        var batas    = (maxGeser !== undefined && maxGeser !== null) ? maxGeser : MAX_ONSET_GESER_FALLBACK;

        for (var offset = 0; offset <= batas; offset++) {
            var bIni = (startMusim + offset) % 12;
            if (rawZOMSesuai[bIni] >= thOnset) { return bIni; }
        }
        return startMusim;
    }

    /* ================================================================== */
    /* FUNGSI UTAMA                                                         */
    /* ================================================================== */
    function rekomendasiWindowTanamV4(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        ensoVal = ensoVal || 0;
        iodVal  = iodVal  || 0;

        var now = new Date();
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

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
            ekuatorial_dua_puncak: 'ekuatorial'
        };
        var zonaIklim = PEMETAAN_POLA_KE_ZONA_IKLIM[polaPuncak] ||
            ((typeof window.tentukanZonaIklim === 'function') ? window.tentukanZonaIklim(lat, lon) : 'monsunal');

        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);
        var skorZOM      = rawZOMSesuai.map(function (mm) { return skorZOMRegional(mm, polaPuncak); });

        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak, maxGeser);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak, maxGeser);

        var rendengBulan = [onsetRendeng, (onsetRendeng + 1) % 12, (onsetRendeng + 2) % 12];
        var gaduBulan    = [onsetGadu,    (onsetGadu    + 1) % 12, (onsetGadu    + 2) % 12];

        var varianArr = [
            { kode: 'genjah', label: 'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.65 }, // Diubah ke 0.65
            { kode: 'sedang', label: 'Sedang (95–115 HST)', panen: 110, persenGen: 0.60 }, // Diubah ke 0.60
            { kode: 'dalam',  label: 'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.58 }  // Diubah ke 0.58
        ];

        function evaluasiKandidatMusim(bulanTanamArr) {
            var kandidat = [];
            bulanTanamArr.forEach(function (bTanam) {
                var mmTanam       = rawZOM[bTanam];
                var mmBajak       = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai = rawZOMSesuai[bTanam];
                var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];
                var mmUntukBajak  = Math.max(mmBajakSesuai, mmTanamSesuai);

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

                    var bVeg2 = tambahHari(tglTanamDummy, 60).getMonth();

                    // ── PENYELESAIAN BUG 2: Rata-rata curah hujan 3 bulan untuk Vegetatif ──
                    var nilaiVegGabungan = (skorTanam + skorZOM[bVeg1] + skorZOM[bVeg2]) / 3;
                    
                    var nilaiGen = 100 - Math.abs(skorZOM[bGenIdx] - 50);

                    // ── TOLERANSI PANEN BASAH ──
                    var sPanen = skorZOM[bPanenIdx];
                    var nilaiPanen;
                    if (sPanen <= 55) nilaiPanen = 80 + (55 - sPanen) * 0.36;
                    else if (sPanen <= 75) nilaiPanen = 80 - (sPanen - 55) * 0.5;
                    else nilaiPanen = Math.max(60, 70 - (sPanen - 75) * 0.5); // Dikunci di 60, tidak dibanting ke 25

                    // ── BOBOT BARU (Air 50%) ──
                    var nilaiTotal = (nilaiVegGabungan * 0.50) + (nilaiGen * 0.30) + (nilaiPanen * 0.20);

                    if (mmTanamSesuai < th.thresholdOnset) nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    if (skorZOM[bVeg1] < 25)               nilaiTotal -= (25 - skorZOM[bVeg1]) * 1.0;

                    kandidat.push({
                        bTanam       : bTanam,
                        bTanamAktual : bTanamAktual,
                        varietas     : v.kode,
                        labelVar     : v.label,
                        panen        : v.panen,
                        nilaiTotal   : nilaiTotal,
                        skorTanam    : skorTanam,
                        mmTanam      : mmTanam,
                        mmTanamSesuai: mmTanamSesuai,
                        mmBajak      : mmBajak,
                        namaBulanGen : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        skorGen      : skorZOM[bGenIdx],
                        skorPanen    : skorZOM[bPanenIdx]
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
                    bTanam       : bFallback,
                    bTanamAktual : tglTanamD.getMonth(),
                    varietas     : 'sedang',
                    labelVar     : 'Sedang (95–115 HST)',
                    panen        : 110,
                    mmTanam      : rawZOM[bFallback],
                    mmTanamSesuai: mmMax,
                    skorTanam    : skorZOM[bFallback] || 0,
                    skorGen      : 0,
                    skorPanen    : 0
                }
            };
        }

        var pilihanR = pilihanTerbaik(kandidatRendeng, rendengBulan);
        var pilihanG = pilihanTerbaik(kandidatGadu,    gaduBulan);

        var bestR = pilihanR.data; var bestG = pilihanG.data;
        var hariPanenR = JEDA_OLAH_KE_TANAM_HARI + bestR.panen;
        var hariPanenG = JEDA_OLAH_KE_TANAM_HARI + bestG.panen;

        var kandidatSiklus = bangkitkanSiklusPasangan(bestR.bTanam, bestG.bTanam, hariPanenR, hariPanenG, now);
        var siklusTerpilih = pilihSiklusRelevant(kandidatSiklus, now);

        /* ---------------------------------------------------------------- */
        /* BUILD HASIL — v3.0.1: alasan ramah petani tanpa angka teknis     */
        /* ---------------------------------------------------------------- */
        function bangunHasilMusim(best, infoSiklus, musimNama, musimKode, isFallback) {
            var tglOlahTanah   = infoSiklus.tglOlah;
            var tglTanamAktual = tambahHari(tglOlahTanah, JEDA_OLAH_KE_TANAM_HARI);
            var bTanamAktual   = tglTanamAktual.getMonth();
            var tglPanen       = infoSiklus.tglPanen;
            var tahunOlah      = tglOlahTanah.getFullYear();
            var tahunPanen     = tglPanen.getFullYear();

            var tglFaseBaik = cariTglFaseBulan(tglTanamAktual, 3, 8, 0, bTanamAktual);

            var jadwalTikus = hitungJadwalTikus(tglOlahTanah, tglFaseBaik);

            var statusMusim = statusWaktuTanam(tglFaseBaik, now);
            var alasan;

            /* ── Tentukan label kondisi air (tanpa angka mm) ── */
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

            /* ── Label kondisi ENSO/IOD yang simpel ── */
            var infoENSO = '';
            if (best.mmTanam > 0) {
                var selisih = best.mmTanamSesuai - best.mmTanam;
                if (selisih < -10) {
                    infoENSO = ' ⚠️ Anomali iklim (El Niño) berpotensi mengurangi hujan.';
                } else if (selisih > 10) {
                    infoENSO = ' ℹ️ Anomali iklim (La Niña) berpotensi menambah hujan.';
                }
            }

            /* ── Label fase generatif & panen ── */
            var keteranganGen, keteranganPanen;
            if (isFallback) {
                /* Fallback: kondisi kering, pompanisasi */
                alasan =
                    'Kondisi hujan di wilayah ini belum cukup untuk tanam optimal. ' +
                    'Jadwal dikunci ke kalender pangkal zona.' + infoENSO +
                    ' 🚨 Siapkan pompanisasi penuh.' +
                    '\n\n' + formatJadwalTikusTeks(jadwalTikus);
            } else {
                keteranganGen = best.skorGen < 30
                    ? 'perlu waspadai kekeringan saat bunting'
                    : best.skorGen > 75
                        ? 'perlu waspadai penyakit Blast'
                        : 'kondisi pembungaan optimal';

                keteranganPanen = best.skorPanen > 65
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

    /* ------------------------------------------------------------------ */
    /* INJEKSI KE GLOBAL                                                    */
    /* ------------------------------------------------------------------ */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam     = rekomendasiWindowTanamV4;
        window.tentukanKalenderMusimLokal = tentukanKalenderMusimLokal;
        window.statusWaktuTanam           = statusWaktuTanam;
        window.hitungJadwalTikus          = hitungJadwalTikus;
        window.AGRONOMI_TIKUS             = AGRONOMI_TIKUS;

        console.log(
            '%c✅ patch_deteksi_musim_v3.0.1.js aktif\n' +
            '\n  ╔══ FIX TAMPILAN RAMAH PETANI v3.0.1 ══╗\n' +
            '  ║ ✅ Hilangkan bobot teknis [ZOM/ENSO/IOD %]\n' +
            '  ║ ✅ Hilangkan angka mm teknis dari kalimat\n' +
            '  ║ ✅ Jadwal tikus ringkas & mudah dibaca\n' +
            '  ║ ✅ ENSO/IOD hanya tampil jika dampak nyata\n' +
            '  ║ ✅ Kalimat alasan fokus pada aksi petani\n' +
            '  ╠══ WARISAN FIX v3.0 TETAP AKTIF ═══════╣\n' +
            '  ║ ✅ Gropyokan sebelum olah tanah (lahan bera)\n' +
            '  ║ ✅ Umpan racun H+1–H+21 HST\n' +
            '  ║ ✅ TBS dipasang hari tanam\n' +
            '  ║ ✅ maxOnsetGeser per zona\n' +
            '  ║ ✅ Guard loncat tahun siklus pasangan\n' +
            '  ╚═══════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injeksiOverride);
    else setTimeout(injeksiOverride, 100);

})();
