/**
 * ============================================================
 * patch_deteksi_musim_v2.5.js
 * Versi: 2.5 — Siklus Pasangan Agronomis & Kepatuhan Kalender
 * ------------------------------------------------------------
 * PERBAIKAN v2.5 vs v2.4:
 * 1. [FIX ONSET] Limitasi cariOnsetHujan max geser 2 bulan. Jika 
 * tetap kering, paksa kembali ke jadwal pangkal agronomis.
 * 2. [FIX JENDELA] Jendela evaluasi dipotong menjadi 3 bulan 
 * agar tidak bablas mendekati musim berikutnya.
 * 3. [FIX FALLBACK] Fallback tidak lagi mengejar ZOM tertinggi 
 * yang menyesatkan, melainkan memaku di bulan pertama jendela 
 * dengan peringatan siaga pompanisasi.
 * 4. [FIX OVERLAP] Jika Panen Rendeng overlap dengan Olah Gadu, 
 * jadwal Olah Gadu hanya digeser 10 hari setelah panen, 
 * bukan dilempar +1 tahun kalender yang menghilangkan musim.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       KONSTANTA THRESHOLD KELAYAKAN AIR PER ZONA
    ========================================================= */
    var THRESHOLD_AIR = {
        barat:                 { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 },
        timur:                 { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        peralihan_sultra:    { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        ekuatorial_dua_puncak: { thresholdBajak: 70, thresholdOnset: 90, thresholdLayak: 110 },
        fallback:            { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 }
    };

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
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
            return Object.assign({}, refRegional, {
                sumber: 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak
            });
        }

        if (polaDariZOM === 'timur') {
            return {
                rendengMulai: (bulanTertinggi - 1 + 12) % 12,
                gaduMulai: (bulanTertinggi + 5) % 12,
                namaRendeng: 'MT I — Musim Utama Lokal (Rendeng)',
                namaGadu:    'MT II — Musim Kedua Lokal (Gadu)',
                sumber: 'zom-pola-timur', polaDideteksi: 'timur'
            };
        }
        if (polaDariZOM === 'ekuatorial') return null;

        return {
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng)',
            namaGadu:    'MT II — Musim Kedua (Gadu)',
            sumber: 'fallback-pola-barat', polaDideteksi: 'barat'
        };
    }

    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;
    var JEDA_OLAH_KE_TANAM_HARI = 25;

    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
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

    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    function hitungOffsetTahunGadu(bRendeng, bGadu) {
        return (bGadu > bRendeng) ? 0 : 1;
    }

    function bangkitkanSiklusPasangan(bRendeng, bGadu, hariPanenR, hariPanenG, now) {
        var baseYear     = now.getFullYear();
        var offsetGadu   = hitungOffsetTahunGadu(bRendeng, bGadu);
        var siklus       = [];

        for (var dy = -1; dy <= 1; dy++) {
            var thRendeng = baseYear + dy;
            var thGadu    = thRendeng + offsetGadu;

            var tglOlahR  = new Date(thRendeng, bRendeng, 15);
            var tglPanenR = tambahHari(tglOlahR, hariPanenR);

            var tglOlahG  = new Date(thGadu, bGadu, 15);
            var tglPanenG = tambahHari(tglOlahG, hariPanenG);

            /* FIX v2.5: Adjust natural 10 hari setelah panen, bukan dilempar +1 tahun */
            if (tglOlahG.getTime() <= tglPanenR.getTime()) {
                tglOlahG  = tambahHari(tglPanenR, 10);
                tglPanenG = tambahHari(tglOlahG, hariPanenG);
                thGadu    = tglOlahG.getFullYear(); // Update tahun jika overlap menyeberang tahun
                console.log('[PatchMusim v2.5] Auto-adjust: tglOlah Gadu digeser agronomis ke ' + 
                    tglOlahG.toLocaleDateString('id-ID') + ' akibat overlap dengan panen Rendeng');
            }

            siklus.push({
                tahunRendeng : thRendeng,
                tahunGadu    : thGadu,
                rendeng : { tglOlah: tglOlahR, tglPanen: tglPanenR },
                gadu    : { tglOlah: tglOlahG, tglPanen: tglPanenG }
            });
        }
        return siklus;
    }

    function pilihSiklusRelevant(kandidatSiklus, now) {
        var nowMs = now.getTime();
        var aktif = kandidatSiklus.filter(function(s) {
            return s.gadu.tglPanen.getTime() > nowMs;
        });

        if (aktif.length === 0) return kandidatSiklus[kandidatSiklus.length - 1];

        aktif.sort(function(a, b) {
            var distA = a.rendeng.tglOlah.getTime() - nowMs;
            var distB = b.rendeng.tglOlah.getTime() - nowMs;
            if (distA <= 0 && distB > 0) return -1;
            if (distB <= 0 && distA > 0) return 1;
            return Math.abs(distA) - Math.abs(distB);
        });

        return aktif[0];
    }

    function skorZOMRegional(mmBulanIni, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b  = th.thresholdBajak; var o = th.thresholdOnset; var l = th.thresholdLayak;

        if (mmBulanIni <= 0)       return 0;
        if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
        if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
        if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b)     / (o - b) * 20);
        if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o)     / (l - o) * 15);
        if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l)     / (l * 0.5) * 10);
        if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* FIX v2.5: Limit onset shift max 2 bulan agar tidak bablas keluar musim */
    function cariOnsetHujan(startMusim, rawZOM, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        for (var offset = 0; offset <= 2; offset++) {
            var bIni  = (startMusim + offset) % 12;
            var bBrk  = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= th.thresholdOnset && rawZOM[bBrk] >= th.thresholdBajak) {
                return bIni;
            }
        }
        console.warn('[PatchMusim v2.5] Onset tertunda panjang, paksa kembali ke pangkal: ' + NAMA_BULAN[startMusim]);
        return startMusim; 
    }

    function faktorPenyesuaianENSOIOD(bulanIdx, zonaIklim, ensoVal, iodVal) {
        var tabel = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        if (!tabel || (!ensoVal && !iodVal)) return 1;
        var tz  = tabel[zonaIklim] || tabel.monsunal;
        var wE  = tz.enso[bulanIdx]; var wI = tz.iod[bulanIdx];
        var tot = 1 + wE + wI;
        var deltaIdx = -(ensoVal * wE / tot) - (iodVal * wI / tot);
        var faktor   = 1 + (deltaIdx * 0.35);
        return Math.max(0.4, Math.min(1.6, faktor));
    }

    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        return rawZOM.map(function (mm, idx) {
            return mm * faktorPenyesuaianENSOIOD(idx, zonaIklim, ensoVal, iodVal);
        });
    }

    function rekomendasiWindowTanamV4(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        ensoVal = ensoVal || 0; iodVal  = iodVal  || 0;
        var now = new Date();
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

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
                    var tengahLembah     = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum; startGadu = ii;
                    }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu    = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var PEMETAAN_POLA_KE_ZONA_IKLIM = { barat: 'monsunal', timur: 'monsunal', peralihan_sultra: 'peralihan', ekuatorial_dua_puncak: 'ekuatorial' };
        var zonaIklim = PEMETAAN_POLA_KE_ZONA_IKLIM[polaPuncak] || ((typeof window.tentukanZonaIklim === 'function') ? window.tentukanZonaIklim(lat, lon) : 'monsunal');

        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);
        var skorZOM = rawZOMSesuai.map(function(mm) { return skorZOMRegional(mm, polaPuncak); });

        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak);

        /* FIX v2.5: Jendela evaluasi dipotong jadi max 3 bulan agar tidak melenceng keluar musim */
        var rendengBulan = [onsetRendeng, (onsetRendeng+1)%12, (onsetRendeng+2)%12];
        var gaduBulan    = [onsetGadu,    (onsetGadu+1)%12,    (onsetGadu+2)%12];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        function evaluasiKandidatMusim(bulanTanamArr) {
            var kandidat = [];
            bulanTanamArr.forEach(function (bTanam) {
                var mmTanam       = rawZOM[bTanam];
                var mmBajak       = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai = rawZOMSesuai[bTanam];
                var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];

                var mmUntukBajak = Math.max(mmBajakSesuai, mmTanamSesuai);
                if (mmUntukBajak < th.thresholdBajak) return;

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var tglOlahDummy   = new Date(2000, bTanam, 15);
                    var tglTanamDummy  = tambahHari(tglOlahDummy, JEDA_OLAH_KE_TANAM_HARI);
                    var bTanamAktual   = tglTanamDummy.getMonth();

                    var hariGen    = Math.floor(v.panen * v.persenGen);
                    var bGenIdx    = tambahHari(tglTanamDummy, hariGen).getMonth();
                    var bPanenIdx  = tambahHari(tglTanamDummy, v.panen).getMonth();
                    var bVeg1      = tambahHari(tglTanamDummy, 30).getMonth();

                    var nilaiTanam = skorTanam;
                    var nilaiVeg1  = skorZOM[bVeg1];
                    var nilaiGen   = 100 - Math.abs(skorZOM[bGenIdx] - 55);
                    var nilaiPanen = 100 - (skorZOM[bPanenIdx] * 0.5);

                    var nilaiTotal = (nilaiTanam * 0.45) + (nilaiVeg1 * 0.20) + (nilaiGen * 0.20) + (nilaiPanen * 0.15);
                    if (mmTanamSesuai < th.thresholdOnset) nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    if (nilaiVeg1 < 25) nilaiTotal -= (25 - nilaiVeg1) * 1.0;

                    kandidat.push({
                        bTanam: bTanam, bTanamAktual: bTanamAktual, varietas: v.kode, labelVar: v.label,
                        panen: v.panen, nilaiTotal: nilaiTotal, skorTanam: skorTanam, mmTanam: mmTanam,
                        mmTanamSesuai: mmTanamSesuai, mmBajak: mmBajak, namaBulanGen: NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx], skorGen: skorZOM[bGenIdx], skorPanen: skorZOM[bPanenIdx]
                    });
                });
            });
            return kandidat;
        }

        var kandidatRendeng = evaluasiKandidatMusim(rendengBulan);
        var kandidatGadu    = evaluasiKandidatMusim(gaduBulan);

        function pilihanTerbaik(kandidat, bulanTanamArr) {
            if (kandidat.length > 0) {
                kandidat.sort(function(a, b) { return b.nilaiTotal - a.nilaiTotal; });
                return { isFallback: false, data: kandidat[0] };
            }
            /* FIX v2.5: Fallback DIPAKU ke bulan pertama jendela. Tidak lagi mencari ZOM tertinggi 
               di akhir musim yang menyebabkan pergeseran fatal. */
            var bFallback = bulanTanamArr[0];
            var mmMax = rawZOMSesuai[bFallback] || 0; 
            var tglDummy  = new Date(2000, bFallback, 15);
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
                    skorTanam     : skorZOM[bFallback],
                    skorGen       : 0, skorPanen: 0
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
            var tahunTanam     = tglTanamAktual.getFullYear();
            var tahunPanen     = tglPanen.getFullYear();

            var tglFaseBaik    = cariTglFaseBulan(tglTanamAktual, 3, 8, 0, bTanamAktual);
            var statusMusim    = statusWaktuTanam(tglFaseBaik, now);
            var alasan;

            if (isFallback) {
                alasan = 'Curah hujan di jendela olah tanah ini berada di bawah batas minimum bajak (' + 
                    th.thresholdBajak + 'mm). ' + 
                    'Jadwal dikembalikan ke kalender agronomis (' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah + '). ' +
                    'Tanam pindah diperkirakan ~' + JEDA_OLAH_KE_TANAM_HARI + ' hari kemudian ' +
                    '(≈' + NAMA_BULAN[bTanamAktual] + ' ' + tahunTanam + '). ' +
                    'Karena curah hujan tipis (' + best.mmTanamSesuai.toFixed(0) + 'mm), wajib didukung pompanisasi penuh.';
            } else {
                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' : best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' : best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';
                var catatanOlah = best.mmTanamSesuai < th.thresholdBajak ? 'Perhatian: curah hujan tipis, siapkan pompanisasi pendukung bajak.' : '';
                var catatanENSOIOD = '';
                if (best.mmTanam > 0) {
                    var persenSesuai = ((best.mmTanamSesuai - best.mmTanam) / best.mmTanam) * 100;
                    if (Math.abs(persenSesuai) > 3) catatanENSOIOD = ' 🌐 Curah hujan disesuaikan ' + (persenSesuai > 0 ? '+' : '') + persenSesuai.toFixed(0) + '% akibat ENSO/IOD.';
                }
                alasan = 'Olah tanah di ' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah + ': ' + best.mmTanam.toFixed(0) + 'mm (skor ' + best.skorTanam + '/100). ' +
                    'Tanam pindah ~' + JEDA_OLAH_KE_TANAM_HARI + ' hari setelah olah tanah (≈' + NAMA_BULAN[bTanamAktual] + ' ' + tahunTanam + '). ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). Panen di ' + best.namaBulanPanen + ' ' + tahunPanen + ' (' + keteranganPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '') + catatanENSOIOD;
            }

            return {
                musimNama   : musimNama, musimKode   : musimKode, tglOlahTanah: tglOlahTanah,
                tglTanam    : tglFaseBaik, tglPanen    : tglPanen, varietas    : best.varietas,
                labelVar    : best.labelVar, alasan      : alasan,
                isLewat     : statusMusim.isLewat, isBerjalan  : statusMusim.isBerjalan
            };
        }

        var hasilDuaMusim = [
            bangunHasilMusim(bestR, siklusTerpilih.rendeng, namaRendeng, 'rendeng', pilihanR.isFallback),
            bangunHasilMusim(bestG, siklusTerpilih.gadu,    namaGadu,    'gadu',    pilihanG.isFallback)
        ];

        hasilDuaMusim.sort(function (a, b) { return a.tglOlahTanah.getTime() - b.tglOlahTanah.getTime(); });
        return hasilDuaMusim;
    }

    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        window.rekomendasiWindowTanam      = rekomendasiWindowTanamV4;
        window.tentukanKalenderMusimLokal  = tentukanKalenderMusimLokal;
        window.statusWaktuTanam            = statusWaktuTanam;
        
        console.log(
            '%c✅ patch_deteksi_musim_v2.5.js aktif\n' +
            '\n  ╔══ FIX KEPATUHAN KALENDER v2.5 ══╗\n' +
            '  ║ 1. Onset dikunci max 2 bulan (tidak melompat musim)\n' +
            '  ║ 2. Evaluasi dipotong jadi max 3 bulan per musim\n' +
            '  ║ 3. Fallback dipaku di pangkal jendela agronomis\n' +
            '  ║ 4. Overlap disesuaikan +10 hari, BUKAN +1 tahun\n' +
            '  ╚══════════════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injeksiOverride);
    else setTimeout(injeksiOverride, 100);

})();
