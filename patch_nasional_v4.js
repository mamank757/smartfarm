// ============================================================
//  PATCH NASIONAL FINAL (DYNAMIC TREND & DOM SANITIZER)
//  Auto-Pilot: Menyesuaikan data segar tanpa hardcode kurva
// ============================================================

(function () {
    'use strict';

    console.log('🚀 Memuat Patch Final: Sistem Kalkulasi Iklim Dinamis...');

    // ─────────────────────────────────────────────────────────
    // 1. ALGORITMA TREN DINAMIS (Jantung dari sistem Auto-Pilot)
    // ─────────────────────────────────────────────────────────
    // Fungsi ini membaca pergerakan suhu nyata, bukan menebak buta
    function hitungProyeksiDinamis(dataHistoris, jumlahBulanKedepan) {
        if (!dataHistoris || dataHistoris.length < 2) return [0, 0, 0, 0];
        
        var nilaiTerbaru = dataHistoris[dataHistoris.length - 1];
        var nilaiSebelumnya = dataHistoris[dataHistoris.length - 2];
        
        // Cari tahu apakah bulan ini suhu sedang naik atau turun
        var momentum = nilaiTerbaru - nilaiSebelumnya; 
        
        var proyeksi = [parseFloat(nilaiTerbaru.toFixed(2))];
        var momentumTeredam = momentum;

        for (var i = 0; i < jumlahBulanKedepan; i++) {
            // Redam momentum sebesar 40% setiap bulan agar grafik tidak terbang/nyungsep ekstrem
            momentumTeredam = momentumTeredam * 0.6; 
            nilaiTerbaru = nilaiTerbaru + momentumTeredam;
            proyeksi.push(parseFloat(nilaiTerbaru.toFixed(2)));
        }
        return proyeksi;
    }

    // ─────────────────────────────────────────────────────────
    // 2. OVERRIDE RENDER CHART (Menyuntikkan Tren Dinamis)
    // ─────────────────────────────────────────────────────────
    if (typeof window.renderMacroChart === 'function' && !window._renderMacroChartDynamic) {
        window._renderMacroChartDynamic = window.renderMacroChart;
        
        window.renderMacroChart = function (labels, ensoData, iodData) {
            var dynamicEnso = ensoData;
            var dynamicIod = iodData;

            // Jika kita punya setidaknya 2 data historis ENSO, buat prediksi dinamisnya
            if (window.historisENSO && window.historisENSO.length >= 2) {
                dynamicEnso = hitungProyeksiDinamis(window.historisENSO, 3);
            } else if (ensoData && ensoData.length > 0) {
                // Fallback dinamis ringan jika data array penuh tidak tersedia
                dynamicEnso = hitungProyeksiDinamis([ensoData[0] - 0.05, ensoData[0]], 3); 
            }

            // Lakukan hal yang sama untuk IOD
            if (window.historisIOD && window.historisIOD.length >= 2) {
                dynamicIod = hitungProyeksiDinamis(window.historisIOD, 3);
            } else if (iodData && iodData.length > 0) {
                dynamicIod = hitungProyeksiDinamis([iodData[0] - 0.02, iodData[0]], 3);
            }

            window._renderMacroChartDynamic(labels, dynamicEnso, dynamicIod);
        };
    }

    // ─────────────────────────────────────────────────────────
    // 3. PEMBERSIH TEKS DOM (DOM Sanitizer yang Aman)
    // ─────────────────────────────────────────────────────────
    if (typeof window.updateENSOIODStatus === 'function' && !window._updateENSOIODStatusDynamic) {
        window._updateENSOIODStatusDynamic = window.updateENSOIODStatus;
        
        window.updateENSOIODStatus = function (enso, iod) {
            // Eksekusi fungsi UI bawaan
            window._updateENSOIODStatusDynamic(enso, iod);

            // Murni membersihkan teks yang "nyangkut" tanpa merusak data objek
            setTimeout(function() {
                if (iod && iod.latestAnomaly !== undefined) {
                    var val = parseFloat(iod.latestAnomaly);
                    var tanda = val > 0 ? '+' : '';
                    var targetText = 'DMI: ' + tanda + val.toFixed(2) + '°C';
                    
                    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                    var node;
                    while ((node = walker.nextNode())) {
                        if (node.nodeValue.includes('DMI:')) {
                            node.nodeValue = node.nodeValue.replace(/DMI:\s*[-0-9.]+°C/g, targetText);
                        }
                    }
                }
            }, 150); 
        };
    }

    // ─────────────────────────────────────────────────────────
    // 4. MENGAMANKAN WARNA JADWAL TANAM
    // ─────────────────────────────────────────────────────────
    (function fixWarnaJadwal() {
        var _switchModePrev = window.switchMode;
        if (!_switchModePrev) return;
        window.switchMode = function (mode) {
            var result = _switchModePrev.apply(this, arguments);
            if (mode === 'jadwaltanam') {
                var titleEl = document.getElementById('modeTitle');
                if (titleEl) titleEl.style.color = '#3b82f6'; // Cyan
            }
            return result;
        };
    })();

})();
