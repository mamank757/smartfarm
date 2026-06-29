(function () {
    'use strict';
    if (window.__skor6FaktorV1Aktif) return;

    // 1. Fungsi Utama untuk Memperbarui Panel
    window.perbarui6FaktorPanel = function (enso, iod) {
        if (!enso && window._ensoDataTerkini) enso = window._ensoDataTerkini;
        if (!iod && window._iodDataTerkini) iod = window._iodDataTerkini;
        
        // Simpan data ke variabel global agar aman
        if (enso) window._ensoDataTerkini = enso;
        if (iod) window._iodDataTerkini = iod;

        var ensoVal = (enso && enso.latestAnomaly !== undefined) ? parseFloat(enso.latestAnomaly) : 0;
        var iodVal = (iod && iod.latestAnomaly !== undefined) ? parseFloat(iod.latestAnomaly) : 0;

        console.log("[6F] Update Panel | ENSO:", ensoVal, "IOD:", iodVal);

        var panel = document.getElementById('panel6FaktorDebug');
        if (!panel) {
            // Jika belum ada, buat panelnya
            panel = document.createElement('div');
            panel.id = 'panel6FaktorDebug';
            panel.style.cssText = 'margin-top:20px; background:rgba(217,70,239,0.06); border:1px solid rgba(217,70,239,0.2); padding:10px; color:#cbd5e1;';
            document.getElementById('boxKalender').appendChild(panel);
        }
        
        // Isi panel
        panel.innerHTML = '<strong>📊 FAKTOR IKLIM MAKRO</strong><br>' +
                          'ENSO: ' + ensoVal.toFixed(2) + '<br>' +
                          'IOD: ' + iodVal.toFixed(2) + '<br>' +
                          'MJO Fase: ' + (window.mjoFase || 'Memuat...');
    };

    // 2. "Menempel" (Hijack) fungsi pengambil data yang sudah ada di sistem Anda
    // Ini memastikan saat fungsi asli selesai, panel langsung ter-update.
    setTimeout(function() {
        if (window.getENSOAnomaly) {
            var asli = window.getENSOAnomaly;
            window.getENSOAnomaly = async function() {
                var d = await asli();
                window._ensoDataTerkini = d;
                window.perbarui6FaktorPanel(d, window._iodDataTerkini);
                return d;
            };
        }
        if (window.getIODAnomaly) {
            var asliIod = window.getIODAnomaly;
            window.getIODAnomaly = async function() {
                var d = await asliIod();
                window._iodDataTerkini = d;
                window.perbarui6FaktorPanel(window._ensoDataTerkini, d);
                return d;
            };
        }
    }, 1000);

    window.__skor6FaktorV1Aktif = true;
})();
