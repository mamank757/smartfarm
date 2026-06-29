(function () {
    'use strict';
    // Mengambil data dari GAS URL yang sudah Anda definisikan di index.html
    window.getMJOData = async function() {
        try {
            var url = window._GAS_MJO_URL;
            var response = await fetch(url);
            var data = await response.json();
            
            // Simpan data agar dibaca oleh patch 6-faktor
            window.mjoData = data;
            window.mjoFase = data.fase;
            window.mjoAmplitudo = data.amplitudo;
            
            console.log("%c[MJO] Data dimuat:", "color:green", data);
            
            // Pemicu otomatis (TIDAK PAKAI TIMEOUT)
            if (typeof window.perbarui6FaktorPanel === 'function') {
                window.perbarui6FaktorPanel(window._ensoDataTerkini, window._iodDataTerkini);
            }
            return data;
        } catch (e) {
            console.error("[MJO] Gagal:", e);
            return { fase: 0, amplitudo: 0 };
        }
    };
    // Jalankan langsung
    window.getMJOData();
})();
