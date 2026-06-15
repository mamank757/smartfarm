/**
 * ============================================================
 * patch_deteksi_musim_v2.7.js
 * Versi: 2.7 — Dinamika ENSO/IOD Sensitivitas Tinggi (Hybrid)
 * ------------------------------------------------------------
 * PERBAIKAN v2.7 vs v2.6 & v2.5:
 * 1. [MESIN ENSO/IOD DI-BORE UP] Faktor pengali iklim dinaikkan 
 * drastis. La Niña kuat kini bisa melipatgandakan hujan hingga 3.5x 
 * lipat dan menyuntikkan volume air absolut (additive boost) pada 
 * bulan kering, sehingga bulan agronomis yang tadinya gagal bisa lulus.
 * 2. [KEMBALI DINAMIS TERKONTROL] Pencarian onset musim kembali 
 * diaktifkan agar jadwal tanam fleksibel (maju/mundur) mengikuti 
 * ENSO/IOD, tapi DIKUNCI maksimal geser 2 bulan agar tidak kabur 
 * ke tahun depan.
 * ============================================================
 */

(function () {
    'use strict';

    var THRESHOLD_AIR = {
        barat:                 { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 },
        timur:                 { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        peralihan_sultra:      { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        ekuatorial_dua_puncak: { thresholdBajak: 70,  thresholdOnset: 90,  thresholdLayak: 110 },
        fallback:              { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 }
    };

    var REFERENSI_MUSIM_REGIONAL = [
        { latMin: -6.0, latMaks: -3.5, lonMin: 119.0, lonMaks: 119.99, polaPuncak: 'barat', rendengMulai: 10, gaduMulai: 4, namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua' },
        { latMin: -6.0, latMaks: -3.5, lonMin: 120.0, lonMaks: 120.79, polaPuncak: 'timur', rendengMulai: 3, gaduMulai: 9, namaRendeng: 'MT I — Musim Utama Lokal', namaGadu: 'MT II — Musim Kedua Lokal' },
        { latMin: -6.0, latMaks: -2.5, lonMin: 120.8, lonMaks: 124.5, polaPuncak: 'peralihan_sultra', rendengMulai: 2, gaduMulai: 9, namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua' },
        { latMin: -3.49, latMaks: -0.5, lonMin: 118.5, lonMaks: 119.79, polaPuncak: 'barat', rendengMulai: 11, gaduMulai: 5, namaRendeng: 'MT I — Musim Utama', namaGadu: 'MT II — Musim Kedua' },
        { latMin: -3.49, latMaks: 0.0, lonMin: 119.8, lonMaks: 122.5, polaPuncak: 'ekuatorial_dua_puncak', rendengMulai: 0, gaduMulai: 6, namaRendeng: 'MT I — Musim Tanam', namaGadu: 'MT II — Musim Tanam' }
    ];

    function tentukanKalenderMusimLokal(lat, lon, rawZOM) {
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks && lon >= ref.lonMin && lon <= ref.lonMaks) { refRegional = ref; break; }
        }
        var blnMax = 0, valMax = -Infinity;
        for (var i = 0; i < 12; i++) { if (rawZOM[i] > valMax) { valMax = rawZOM[i]; blnMax = i; } }
        var polaDariZOM = (valMax < 0.4) ? 'ekuatorial' : (blnMax >= 3 && blnMax <= 8) ? 'timur' : 'barat';

        if (refRegional) return Object.assign({}, refRegional, { sumber: 'referensi-regional', polaDideteksi: refRegional.polaPuncak });
        if (polaDariZOM === 'timur') return { rendengMulai: (blnMax - 1 + 12) % 12, gaduMulai: (blnMax + 5) % 12, namaRendeng: 'MT I Lokal', namaGadu: 'MT II Lokal', sumber: 'zom-timur', polaDideteksi: 'timur' };
        if (polaDariZOM === 'ekuatorial') return null;
        return { rendengMulai: 10, gaduMulai: 4, namaRendeng: 'MT I', namaGadu: 'MT II', sumber: 'fallback-barat', polaDideteksi: 'barat' };
    }

    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS = 29.53059;
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
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat && tglTanam.getMonth() === now.getMonth() && tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    function hitungOffsetTahunGadu(bRendeng, bGadu) { return (bGadu > bRendeng) ? 0 : 1; }

    function bangkitkanSiklusPasangan(bRendeng, bGadu, hariPanenR, hariPanenG, now) {
        var baseYear = now.getFullYear(); var offsetGadu = hitungOffsetTahunGadu(bRendeng, bGadu); var siklus = [];
        for (var dy = -1; dy <= 1; dy++) {
            var thRendeng = baseYear + dy; var thGadu = thRendeng + offsetGadu;
            var tglOlahR = new Date(thRendeng, bRendeng, 15); var tglPanenR = tambahHari(tglOlahR, hariPanenR);
            var tglOlahG = new Date(thGadu, bGadu, 15); var tglPanenG = tambahHari(tglOlahG, hariPanenG);

            /* Shift natural agronomis jika overlap */
            if (tglOlahG.getTime() <= tglPanenR.getTime()) {
                tglOlahG = tambahHari(tglPanenR, 10);
                tglPanenG = tambahHari(tglOlahG, hariPanenG);
                thGadu = tglOlahG.getFullYear();
            }
            siklus.push({ tahunRendeng: thRendeng, tahunGadu: thGadu, rendeng: { tglOlah: tglOlahR, tglPanen: tglPanenR }, gadu: { tglOlah: tglOlahG, tglPanen: tglPanenG } });
        }
        return siklus;
    }

    function pilihSiklusRelevant(kandidatSiklus, now) {
        var nowMs = now.getTime();
        var aktif = kandidatSiklus.filter(function(s) { return s.gadu.tglPanen.getTime() > nowMs; });
        if (aktif.length === 0) return kandidatSiklus[kandidatSiklus.length - 1];
        aktif.sort(function(a, b) {
            var distA = a.rendeng.tglOlah.getTime() - nowMs; var distB = b.rendeng.tglOlah.getTime() - nowMs;
            if (distA <= 0 && distB > 0) return -1; if (distB <= 0 && distA > 0) return 1;
            return Math.abs(distA) - Math.abs(distB);
        });
        return aktif[0];
    }

    function skorZOMRegional(mmBulanIni, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b = th.thresholdBajak; var o = th.thresholdOnset; var l = th.thresholdLayak;
        if (mmBulanIni <= 0) return 0;
        if (mmBulanIni < b / 2) return Math.round(mmBulanIni / (b / 2) * 20);
        if (mmBulanIni < b) return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
        if (mmBulanIni < o) return Math.round(40 + (mmBulanIni - b) / (o - b) * 20);
        if (mmBulanIni < l) return Math.round(60 + (mmBulanIni - o) / (l - o) * 15);
        if (mmBulanIni < l * 1.5) return Math.round(75 + (mmBulanIni - l) / (l * 0.5) * 10);
        if (mmBulanIni < l * 2) return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* FIX v2.7: FUNGSI HYBRID ENSO/IOD (MULTIPLIER + ADDITIVE) */
    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        var tabel = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        return rawZOM.map(function (mm, idx) {
            if (!tabel || (!ensoVal && !iodVal)) return mm;
            var tz = tabel[zonaIklim] || tabel.monsunal;
            var wE = tz.enso[idx]; var wI = tz.iod[idx];
            var tot = 1 + wE + wI;
            
            // Logika terbalik: ensoVal Negatif = La Nina (Banyak hujan). 
            // deltaIdx Positif berarti akan MENAMBAH curah hujan.
            var deltaIdx = -(ensoVal * wE / tot) - (iodVal * wI / tot);
            
            // 1. Pengali Sensitivitas Tinggi (Max 3.5x lipat, Min 0.2x)
            var multiplier = Math.max(0.2, Math.min(3.5, 1 + (deltaIdx * 0.85)));
            
            // 2. Additive Suntikan Hujan (Flat mm) untuk membantu bulan kemarau jika anomali basah
            // Maksimal suntikan sekitar +30mm jika La Nina sangat ekstrim
            var additiveBoost = deltaIdx > 0 ? (deltaIdx * 30) : 0; 
            
            return (mm * multiplier) + additiveBoost;
        });
    }

    /* FIX v2.7: Onset Aktif tapi KETAT (Maksimal Geser 2 Bulan) */
    function cariOnsetHujan(startMusim, rawZOM, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        // Hanya boleh mengintip maksimal 2 bulan ke depan
        for (var offset = 0; offset <= 2; offset++) {
            var bIni  = (startMusim + offset) % 12;
            var bBrk  = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= th.thresholdBajak) { // Dipermudah sedikit menjadi thresholdBajak agar cepat onset
                return bIni;
            }
        }
        // Jika 3 bulan berturut-turut gagal, paksa kembali ke jadwal pangkal kalender
        return startMusim; 
    }

    function rekomendasiWindowTanamV4(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        ensoVal = ensoVal || 0; iodVal = iodVal || 0;
        var now = new Date();
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);
        var startRendeng, startGadu, namaRendeng, namaGadu, polaPuncak;

        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai; startGadu = kalenderLokal.gaduMulai;
            namaRendeng = kalenderLokal.namaRendeng; namaGadu = kalenderLokal.namaGadu;
            polaPuncak = kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi || 'barat';
        } else {
            polaPuncak = 'ekuatorial_dua_puncak';
            startRendeng = 0; startGadu = 6;
            namaRendeng = 'MT I'; namaGadu = 'MT II';
        }

        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var PEMETAAN_POLA_KE_ZONA_IKLIM = { barat: 'monsunal', timur: 'monsunal', peralihan_sultra: 'peralihan', ekuatorial_dua_puncak: 'ekuatorial' };
        var zonaIklim = PEMETAAN_POLA_KE_ZONA_IKLIM[polaPuncak] || ((typeof window.tentukanZonaIklim === 'function') ? window.tentukanZonaIklim(lat, lon) : 'monsunal');

        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);
        var skorZOM = rawZOMSesuai.map(function(mm) { return skorZOMRegional(mm, polaPuncak); });

        // V2.7: Pencarian Onset Dinamis tapi dibatasi
        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak);

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
                var mmTanam = rawZOM[bTanam]; var mmBajak = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai = rawZOMSesuai[bTanam]; var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];
                var mmUntukBajak = Math.max(mmBajakSesuai, mmTanamSesuai);
                
                if (mmUntukBajak < th.thresholdBajak) return; // Evaluasi ketat berdasarkan rawZOMSesuai yang sudah di-boost ENSO

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var tglOlahDummy = new Date(2000, bTanam, 15); var tglTanamDummy = tambahHari(tglOlahDummy, JEDA_OLAH_KE_TANAM_HARI);
                    var bTanamAktual = tglTanamDummy.getMonth(); var hariGen = Math.floor(v.panen * v.persenGen);
                    var bGenIdx = tambahHari(tglTanamDummy, hariGen).getMonth(); var bPanenIdx = tambahHari(tglTanamDummy, v.panen).getMonth();
                    var bVeg1 = tambahHari(tglTanamDummy, 30).getMonth();

                    var nilaiTanam = skorTanam; var nilaiVeg1 = skorZOM[bVeg1];
                    var nilaiGen = 100 - Math.abs(skorZOM[bGenIdx] - 55); var nilaiPanen = 100 - (skorZOM[bPanenIdx] * 0.5);
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

        function pilihanTerbaik(kandidat, bulanTanamArr, isGadu) {
            if (kandidat.length > 0) {
                kandidat.sort(function(a, b) { return b.nilaiTotal - a.nilaiTotal; });
                return { isFallback: false, data: kandidat[0] };
            }
            
            // JIKA TETAP KERING (walau sudah di-boost ENSO): Paksa di bulan terbaik dalam 3 bulan jendela.
            var bFallback = bulanTanamArr[0]; var mmMax = -1;
            bulanTanamArr.forEach(function(b) { if (rawZOMSesuai[b] > mmMax) { mmMax = rawZOMSesuai[b]; bFallback = b; } });
            
            var tglDummy  = new Date(now.getFullYear(), bFallback, 15);
            var tglTanamD = tambahHari(tglDummy, JEDA_OLAH_KE_TANAM_HARI);
            
            return {
                isFallback: true,
                data: {
                    bTanam        : bFallback, bTanamAktual  : tglTanamD.getMonth(),
                    varietas      : 'sedang', labelVar      : 'Sedang (95–115 HST)',
                    panen         : 110, mmTanam       : rawZOM[bFallback],
                    mmTanamSesuai : mmMax, skorTanam     : skorZOM[bFallback] || 0,
                    skorGen       : 0, skorPanen: 0
                }
            };
        }

        var pilihanR = pilihanTerbaik(kandidatRendeng, rendengBulan, false);
        var pilihanG = pilihanTerbaik(kandidatGadu,    gaduBulan, true);

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

            var infoENSO = '';
            if (best.mmTanam > 0) {
                var selisihAbsolut = best.mmTanamSesuai - best.mmTanam;
                if (Math.abs(selisihAbsolut) > 5) {
                    infoENSO = ' 🌐 Volume air diestimasi ' + (selisihAbsolut > 0 ? 'NAIK' : 'TURUN') + ' drastis (' + 
                               best.mmTanam.toFixed(0) + 'mm → ' + best.mmTanamSesuai.toFixed(0) + 'mm) akibat dorongan anomali ENSO/IOD saat ini.';
                }
            }

            if (isFallback) {
                alasan = 'Walau sudah dikalkulasi dengan dampak ENSO/IOD, curah hujan di ' + NAMA_BULAN[best.bTanam] + ' (' + best.mmTanamSesuai.toFixed(0) + 'mm) ' +
                    'tetap di bawah batas ideal bajak (' + th.thresholdBajak + 'mm). Jadwal tanam tetap dikunci di sini agar tidak merusak siklus.' +
                    ' 🚨 WAJIB siapkan air permukaan/pompanisasi penuh.' + infoENSO;
            } else {
                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' : best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' : best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';
                var catatanOlah = best.mmTanamSesuai < th.thresholdBajak ? 'Perhatian: curah hujan tipis, siapkan pompanisasi pendukung bajak.' : '';
                alasan = 'Olah tanah di ' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah + ' sangat responsif terhadap iklim ' +
                    '(' + best.mmTanam.toFixed(0) + 'mm dasar → ' + best.mmTanamSesuai.toFixed(0) + 'mm aktual). ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). Panen di ' + best.namaBulanPanen + ' ' + tahunPanen + ' (' + keteranganPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '') + infoENSO;
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
            '%c✅ patch_deteksi_musim_v2.7.js aktif\n' +
            '\n  ╔══ FIX MESIN HYBRID ENSO/IOD v2.7 ══╗\n' +
            '  ║ 1. Multiplier ENSO/IOD Max 3.5x Lipat\n' +
            '  ║ 2. Additive Boost (Suntikan Volume Air Absolut)\n' +
            '  ║ 3. Dinamis Terkontrol (Jendela Geser Max 2 Bulan)\n' +
            '  ╚══════════════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injeksiOverride);
    else setTimeout(injeksiOverride, 100);

})();
