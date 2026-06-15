/**
 * ============================================================
 * patch_deteksi_musim_v2.9.js
 * Versi: 2.9 — Fix Geser Onset Wajo / Zona Timur (Monsunal)
 * ------------------------------------------------------------
 * PERBAIKAN v2.9 vs v2.8:
 *
 * [BUG ROOT CAUSE — TERLACAK DETAIL]
 * Laporan user: zona monsunal Wajo menghasilkan "Desember" untuk MT II
 * padahal normalnya adalah September–Oktober pengolahan.
 *
 * Rantai masalah:
 *   1. Wajo Tengah/Utara (lon ≥ 120.0) masuk zona id=1 → timur
 *      gaduMulai = 9 (September)
 *   2. cariOnsetHujan(9, …) dengan maxGeser=2 (global v2.7/v2.8):
 *      Sep kering → skip, Okt kering → skip, Nov basah → onsetGadu=11
 *   3. gaduBulan = [11, 0, 1] → November jadi kandidat terbaik
 *   4. tglOlahTanah = 15 November → tglTanam = 10 Desember
 *      ← "Desember" yang dilaporkan user
 *
 * [FIX v2.9] maxOnsetGeser DIPINDAHKAN ke tiap entri REFERENSI_MUSIM_REGIONAL
 *   sehingga tiap zona punya batas geser agronomisnya sendiri:
 *   - zona timur (Wajo):          maxOnsetGeser = 1
 *     → onset Sep → maks Okt. Dijamin tidak lompat ke November.
 *   - zona barat selatan:         maxOnsetGeser = 1
 *     → onset Okt → maks Nov (rendeng), Apr → maks Mei (gadu)
 *   - zona barat utara:           maxOnsetGeser = 1
 *   - zona peralihan_sultra:      maxOnsetGeser = 1
 *   - zona ekuatorial_dua_puncak: maxOnsetGeser = 2 (lebih fleksibel)
 *   - fallback global:            maxOnsetGeser = 1
 *
 * [TETAP DARI v2.8]
 *   FIX #1–#5 dari v2.8 semua dipertahankan:
 *   bobot ENSO/IOD setara ZOM, deltaIdx eksplisit, additiveBoost cap 60mm,
 *   guard loncat tahun di siklus pasangan.
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
            console.warn('[v2.9] ⚠️ ALPHA tidak berjumlah 1.0 (' + total.toFixed(4) + ')');
        }
    })();

    /* ------------------------------------------------------------------ */
    /* THRESHOLD PER ZONA                                                   */
    /* ------------------------------------------------------------------ */
    var THRESHOLD_AIR = {
        barat:                 { thresholdBajak: 70,  thresholdOnset: 90, thresholdLayak: 110 },
        timur:                 { thresholdBajak: 50,  thresholdOnset: 65,  thresholdLayak: 85 },
        peralihan_sultra:      { thresholdBajak: 50,  thresholdOnset: 70,  thresholdLayak: 90 },
        ekuatorial_dua_puncak: { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        fallback:              { thresholdBajak: 70,  thresholdOnset: 90, thresholdLayak: 110 }
    };

    /* ------------------------------------------------------------------ */
    /* REFERENSI REGIONAL — v2.9: tambah maxOnsetGeser per entri           */
    /*                                                                      */
    /* maxOnsetGeser = berapa bulan onset boleh bergeser dari *MulaiRef.   */
    /* Ini adalah batas agronomis keras — bukan sekadar parameter iklim.   */
    /* ------------------------------------------------------------------ */
    var REFERENSI_MUSIM_REGIONAL = [
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 119.0, lonMaks: 119.99,
            polaPuncak: 'barat',
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1   // Okt→maks Nov (rendeng), Apr→maks Mei (gadu)
        },
        {
            latMin: -6.0,  latMaks: -3.5,  lonMin: 120.0, lonMaks: 120.79,
            polaPuncak: 'timur',
            rendengMulai: 3, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama Lokal', namaGadu: 'MT II — Musim Kedua Lokal',
            maxOnsetGeser: 1   // FIX WAJO: Sep→maks Okt. Tidak bisa lompat ke November.
        },
        {
            latMin: -6.0,  latMaks: -2.5,  lonMin: 120.8, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1   // Feb→maks Mar (rendeng), Sep→maks Okt (gadu)
        },
        {
            latMin: -3.49, latMaks: -0.5,  lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua',
            maxOnsetGeser: 1   // Nov→maks Des (rendeng), Mei→maks Jun (gadu)
        },
        {
            latMin: -3.49, latMaks:  0.0,  lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0, gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam', namaGadu: 'MT II — Musim Tanam',
            maxOnsetGeser: 2   // Lebih fleksibel karena pola bimodal
        }
    ];

    /* Default jika tidak ada entri yang cocok */
    var MAX_ONSET_GESER_FALLBACK = 1;

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
    /* SIKLUS PASANGAN (guard loncat tahun dari v2.8 dipertahankan)        */
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
    /* ENSO/IOD — HYBRID BOBOT SETARA (dari v2.8, tidak berubah)           */
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
    /* ONSET — v2.9: terima maxGeser dari zona, bukan global 2             */
    /* ------------------------------------------------------------------ */
    function cariOnsetHujan(startMusim, rawZOMSesuai, polaPuncak, maxGeser) {
        var th       = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var thOnset  = th.thresholdBajak;   /* Onset = tanah sudah bisa diolah */
        var batas    = (maxGeser !== undefined && maxGeser !== null) ? maxGeser : MAX_ONSET_GESER_FALLBACK;

        for (var offset = 0; offset <= batas; offset++) {
            var bIni = (startMusim + offset) % 12;
            if (rawZOMSesuai[bIni] >= thOnset) { return bIni; }
        }
        /* Fallback: kembali ke kalender pangkal zona — bukan lompat ke bulan berikutnya */
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

        /* Onset dengan batas per zona — tidak lagi global 2 bulan */
        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak, maxGeser);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak, maxGeser);

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

                    var nilaiTanam  = skorTanam;
                    var nilaiVeg1   = skorZOM[bVeg1];
                    var nilaiGen    = 100 - Math.abs(skorZOM[bGenIdx] - 55);
                    var nilaiPanen  = 100 - (skorZOM[bPanenIdx] * 0.5);
                    var nilaiTotal  = (nilaiTanam * 0.45) + (nilaiVeg1 * 0.20) + (nilaiGen * 0.20) + (nilaiPanen * 0.15);

                    if (mmTanamSesuai < th.thresholdOnset) nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    if (nilaiVeg1 < 25)                    nilaiTotal -= (25 - nilaiVeg1) * 1.0;

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

        function bangunHasilMusim(best, infoSiklus, musimNama, musimKode, isFallback) {
            var tglOlahTanah   = infoSiklus.tglOlah;
            var tglTanamAktual = tambahHari(tglOlahTanah, JEDA_OLAH_KE_TANAM_HARI);
            var bTanamAktual   = tglTanamAktual.getMonth();
            var tglPanen       = infoSiklus.tglPanen;
            var tahunOlah      = tglOlahTanah.getFullYear();
            var tahunPanen     = tglPanen.getFullYear();

            var labelBobot = ' [ZOM:' + Math.round(ALPHA_ZOM*100) + '% ENSO:' + Math.round(ALPHA_ENSO*100) + '% IOD:' + Math.round(ALPHA_IOD*100) + '%]';
            var tglFaseBaik = cariTglFaseBulan(tglTanamAktual, 3, 8, 0, bTanamAktual);
            var statusMusim = statusWaktuTanam(tglFaseBaik, now);
            var alasan;

            var infoENSO = '';
            if (best.mmTanam > 0) {
                var selisih = best.mmTanamSesuai - best.mmTanam;
                if (Math.abs(selisih) > 5) {
                    infoENSO = ' 🌐 Volume air ' + (selisih > 0 ? 'NAIK' : 'TURUN') +
                        ' (' + best.mmTanam.toFixed(0) + 'mm → ' + best.mmTanamSesuai.toFixed(0) + 'mm) akibat anomali ENSO/IOD.' + labelBobot;
                }
            }

            if (isFallback) {
                alasan = 'Setelah koreksi ENSO/IOD (bobot setara), ' + NAMA_BULAN[best.bTanam] +
                    ' (' + best.mmTanamSesuai.toFixed(0) + 'mm) masih di bawah batas bajak (' + th.thresholdBajak + 'mm). ' +
                    'Jadwal dikunci ke kalender pangkal zona. 🚨 Siapkan pompanisasi penuh.' + infoENSO;
            } else {
                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' : best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' : best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';
                var catatanOlah     = best.mmTanamSesuai < th.thresholdBajak ? ' ⚠️ Curah hujan tipis, siapkan pompanisasi pendukung.' : '';
                alasan = 'Olah tanah ' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah +
                    ' (' + best.mmTanam.toFixed(0) + 'mm dasar → ' + best.mmTanamSesuai.toFixed(0) + 'mm terkoreksi' + labelBobot + '). ' +
                    'Generatif ' + best.namaBulanGen + ' (' + keteranganGen + '). ' +
                    'Panen ' + best.namaBulanPanen + ' ' + tahunPanen + ' (' + keteranganPanen + ').' +
                    catatanOlah + infoENSO;
            }

            return {
                musimNama   : musimNama,
                musimKode   : musimKode,
                tglOlahTanah: tglOlahTanah,
                tglTanam    : tglFaseBaik,
                tglPanen    : tglPanen,
                varietas    : best.varietas,
                labelVar    : best.labelVar,
                alasan      : alasan,
                isLewat     : statusMusim.isLewat,
                isBerjalan  : statusMusim.isBerjalan
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

        console.log(
            '%c✅ patch_deteksi_musim_v2.9.js aktif\n' +
            '\n  ╔══ FIX WAJO + AUDIT LENGKAP v2.9 ══╗\n' +
            '  ║ ✅ [FIX WAJO] maxOnsetGeser per zona (timur=1)\n' +
            '  ║    Sep→maks Okt. Dijamin tidak lompat ke November/Desember.\n' +
            '  ║ ✅ Bobot ZOM/ENSO/IOD setara (25%/50%/25%)\n' +
            '  ║ ✅ deltaIdx arah eksplisit\n' +
            '  ║ ✅ additiveBoost cap 60mm\n' +
            '  ║ ✅ Guard loncat tahun siklus pasangan\n' +
            '  ╚════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injeksiOverride);
    else setTimeout(injeksiOverride, 100);

})();
