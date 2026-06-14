/**
 * ============================================================
 * patch_integrasi_final.js
 * Menyelesaikan konflik ENSO/IOD, ZOM Regional, dan Agronomi Air
 * ============================================================
 */

(function () {
    'use strict';

    // 1. FUNGSI ESTIMASI HUJAN AKTUAL (ENSO & IOD IMPACT)
    // Menerjemahkan anomali iklim menjadi perubahan curah hujan aktual secara saintifik
    window.estimasiHujanAktual = function(mm, bulanIdx, ensoVal, iodVal) {
        // Bobot sensitivitas per bulan (dari patch lama)
        var wFallback = [
            [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],
            [0.18,0.12],[0.35,0.20],[0.45,0.28],[0.50,0.38],
            [0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
        ];
        var wE = wFallback[bulanIdx][0];
        var wI = wFallback[bulanIdx][1];

        // Hitung dampak: nilai positif (El Nino/IOD+) mengurangi hujan
        var impact = (ensoVal * wE) + (iodVal * wI); 
        
        // Batasi maksimal reduksi 80% (faktor 0.2) dan penambahan 200% (faktor 2.0)
        var faktor = Math.max(0.2, Math.min(1 - impact, 2.0));
        return mm * faktor;
    };

    // 2. OVERRIDE SKOR KELEMBAPAN (SINKRONISASI TOTAL)
    // Memaksa seluruh kartu UI (bangunKegiatan) menggunakan skor Regional yang
    // SUDAH di-adjust dengan ENSO/IOD, bukan lagi normalisasiCurahHujan lama.
    window.skorKelembapan = function(bulanIdx, rawZOM, ensoVal, iodVal, lat, lon) {
        var mmMentah = rawZOM[bulanIdx];
        var mmAktual = window.estimasiHujanAktual(mmMentah, bulanIdx, ensoVal, iodVal);
        
        var kalenderLokal = (typeof window.tentukanKalenderMusimLokal === 'function') 
            ? window.tentukanKalenderMusimLokal(lat, lon, rawZOM) : null;
        var polaPuncak = kalenderLokal ? (kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi) : 'barat';

        // Jika fungsi skor regional dari patch v2.0 tersedia, gunakan.
        // Jika tidak, gunakan estimasi kasar.
        if (typeof window._skorZOMRegionalInternal === 'function') {
            return window._skorZOMRegionalInternal(mmAktual, polaPuncak);
        }
        return Math.max(0, Math.min(100, Math.round(mmAktual))); 
    };

    // 3. OVERRIDE REKOMENDASI WINDOW TANAM
    // Memperbaiki "Gerbang Air" dan menginjeksi curah hujan ENSO-aware ke dalam deteksi onset
    if (typeof window.rekomendasiWindowTanam === 'function') {
        var _rekomendasiAsli = window.rekomendasiWindowTanam;
        
        window.rekomendasiWindowTanam = function(skorBulan, rawZOM, zona, ensoVal, iodVal) {
            ensoVal = ensoVal || 0;
            iodVal = iodVal || 0;

            // UBAH RAW ZOM MENJADI ESTIMASI AKTUAL (TERKENA DAMPAK EL NINO/LA NINA)
            var actualZOM = rawZOM.map(function(mm, idx) {
                return window.estimasiHujanAktual(mm, idx, ensoVal, iodVal);
            });

            // Patch fungsi internal untuk memperbaiki "Gerbang Air Bajak"
            // Override Math.max menjadi perhitungan transisi bulan
            var _mathMaxAsli = Math.max;
            Math.max = function(a, b) {
                // Hanya intervensi jika dipanggil untuk logika gerbang air bajak
                // Jika a adalah mmBajak dan b adalah mmTanam
                if (arguments.length === 2 && a === actualZOM[(actualZOM.indexOf(b) - 1 + 12) % 12]) {
                    // Bobot Agronomi: 40% kondisi bulan lalu (untuk luku), 60% curah hujan bulan ini
                    return (a * 0.4) + (b * 0.6); 
                }
                return _mathMaxAsli.apply(this, arguments);
            };

            // Jalankan deteksi musim v2.0 dengan ZOM yang SUDAH terkoreksi ENSO/IOD
            // Ini akan membuat El Nino secara otomatis menggeser onset hujan!
            var hasil = _rekomendasiAsli(skorBulan, actualZOM, zona, ensoVal, iodVal);

            // Kembalikan Math.max ke fungsi aslinya
            Math.max = _mathMaxAsli;
            return hasil;
        };
    }

    // Ekstrak skorZOMRegional ke global agar bisa dipanggil oleh skorKelembapan
    document.addEventListener('DOMContentLoaded', function() {
        if (window._thresholdAirMusim) {
            window._skorZOMRegionalInternal = function(mmBulanIni, polaPuncak) {
                var th = window._thresholdAirMusim[polaPuncak] || window._thresholdAirMusim.fallback;
                var b  = th.thresholdBajak;
                var o  = th.thresholdOnset;
                var l  = th.thresholdLayak;

                if (mmBulanIni <= 0)       return 0;
                if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
                if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
                if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b)     / (o - b) * 20);
                if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o)     / (l - o) * 15);
                if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l)     / (l * 0.5) * 10);
                if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
                return 95;
            };
        }
    });

    console.log('%c✅ patch_integrasi_final.js aktif — Resolusi ENSO/IOD + Sinkronisasi UI', 'color:#10b981;font-weight:bold;');
})();
