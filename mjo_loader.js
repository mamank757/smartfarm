/**
 * mjo_loader.js
 * Bertugas mengambil data MJO dari backend GAS secara bersih
 */
(function() {
    window.getMJOData = async function() {
        try {
            console.log("[MJO] Mengambil data dari:", window._GAS_MJO_URL);
            
            const response = await fetch(window._GAS_MJO_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            
            // Simpan ke variabel global yang dibaca oleh dashboard
            window.mjoData = data;
            window.mjoFase = data.fase;
            window.mjoAmplitudo = data.amplitudo;
            
            console.log("[MJO] Data berhasil dimuat:", data);
            return data;
            
        } catch (error) {
            console.error("[MJO] Gagal mengambil data:", error);
            // Fallback jika gagal (Netral)
            window.mjoData = { fase: 0, amplitudo: 0 };
            window.mjoFase = 0;
            window.mjoAmplitudo = 0;
            return window.mjoData;
        }
    };

    // Jalankan otomatis saat halaman dimuat
    window.getMJOData();
})();
