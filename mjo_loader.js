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
            
            // ✅ FIX 1: Tambah _cacheTime agar patch_mjo_bom_v1.js TIDAK overwrite
            window.mjoData = { ...data, _cacheTime: Date.now() };
            window.mjoFase = data.fase;
            window.mjoAmplitudo = data.amplitudo;
            
            console.log("[MJO] Data berhasil dimuat:", data);
            
            // ✅ FIX 4: Trigger panel refresh setelah MJO load selesai
            setTimeout(function() {
                if (typeof window.perbarui6FaktorPanel === 'function' &&
                    (window._ensoDataTerkini || window._iodDataTerkini)) {
                    console.log('[MJO] Memperbarui panel 6 faktor dengan data MJO terbaru...');
                    window.perbarui6FaktorPanel(
                        window._ensoDataTerkini || null,
                        window._iodDataTerkini  || null
                    );
                }
            }, 500);
            
            return window.mjoData;
            
        } catch (error) {
            console.error("[MJO] Gagal mengambil data:", error);
            window.mjoData = { fase: 0, amplitudo: 0, _cacheTime: Date.now() };
            window.mjoFase = 0;
            window.mjoAmplitudo = 0;
            return window.mjoData;
        }
    };

    window.getMJOData();
})();
