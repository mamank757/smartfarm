(function () {
    'use strict';
    
    // Fungsi untuk memastikan panel ada
    function buatPanel() {
        if (!document.getElementById('panel6FaktorDebug')) {
            var panel = document.createElement('div');
            panel.id = 'panel6FaktorDebug';
            panel.style.cssText = 'position:fixed; top:10px; right:10px; z-index:9999; background:black; color:white; padding:15px; border:2px solid magenta;';
            document.body.appendChild(panel);
        }
        return document.getElementById('panel6FaktorDebug');
    }

    // Interval: Cek memori SETIAP DETIK
    setInterval(function() {
        var panel = buatPanel();
        
        // Baca variabel global yang kita tahu ada
        var enso = window._ensoDataTerkini ? window._ensoDataTerkini.latestAnomaly : "Belum Ada";
        var iod = window._iodDataTerkini ? window._iodDataTerkini.latestAnomaly : "Belum Ada";
        var mjo = window.mjoFase ? "Fase " + window.mjoFase : "Belum Ada";

        panel.innerHTML = "<strong>DEBUG PANEL</strong><br>" +
                          "ENSO: " + enso + "<br>" +
                          "IOD: " + iod + "<br>" +
                          "MJO: " + mjo;
        
        console.log("Panel 6F Cek:", {enso: enso, iod: iod, mjo: mjo});
    }, 1000);
})();
