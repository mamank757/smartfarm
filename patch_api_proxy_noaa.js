// ============================================================
//  PATCH API PROXY NOAA (Data Murni Satelit via GAS)
// ============================================================

(function () {
    'use strict';

    // ⚠️ MASUKKAN URL WEB APP GAS BAPAK DI SINI ⚠️
    const GAS_PROXY_URL = "https://script.google.com/macros/s/AKfycbwqlHXk7VYAoCoQtpF0WCjikJ1r9HlZKIrs-_4qQZDxM1LQjVkYDpxv5AhuX1Ml2AYrOw/exec";

    let _gasProxyCache = null;
    let _gasProxyPromise = null;

    // Fungsi fetch dengan sistem cache agar tidak double-request
    async function fetchDataSatelitMurni() {
        if (_gasProxyCache) return _gasProxyCache;
        if (_gasProxyPromise) return _gasProxyPromise;

        _gasProxyPromise = fetch(GAS_PROXY_URL)
            .then(res => res.json())
            .then(data => {
                if (data.status !== "success") throw new Error(data.message);
                _gasProxyCache = data;
                return data;
            });
        
        return _gasProxyPromise;
    }

    // 1. OVERRIDE FUNGSI ENSO
    window.getENSOAnomaly = async function () {
        try {
            const result = await fetchDataSatelitMurni();
            const enso = result.data.enso;
            const terbaru = enso.anomalies[enso.anomalies.length - 1];
            
            let status = "Netral", singkat = "Netral";
            if (terbaru >= 1.5) { status = "El Niño Kuat"; singkat = "El Niño Kuat"; }
            else if (terbaru >= 0.5) { status = "El Niño"; singkat = "El Niño"; }
            else if (terbaru <= -1.5) { status = "La Niña Kuat"; singkat = "La Niña Kuat"; }
            else if (terbaru <= -0.5) { status = "La Niña"; singkat = "La Niña"; }

            return {
                labels: enso.labels,
                anomalies: enso.anomalies,
                status: status,
                statusSingkat: singkat,
                intensitas: "",
                latestAnomaly: terbaru,
                oni3Bulan: terbaru,
                sumber: 'NOAA CPC (Jalur Resmi API Proxy)'
            };
        } catch (e) {
            console.error("Gagal menarik ENSO dari Proxy:", e);
            throw e; // Biarkan error agar tertangkap oleh loadGlobalClimateIndices
        }
    };

    // 2. OVERRIDE FUNGSI IOD
    window.getIODAnomaly = async function () {
        try {
            const result = await fetchDataSatelitMurni();
            const iod = result.data.iod;
            const terbaru = iod.anomalies[iod.anomalies.length - 1];
            
            let status = "Netral", singkat = "Netral";
            if (terbaru >= 0.4) { status = "IOD Positif"; singkat = "IOD+"; }
            else if (terbaru <= -0.4) { status = "IOD Negatif"; singkat = "IOD-"; }

            return {
                labels: iod.labels, // Disinkronkan dengan bulan ENSO
                anomalies: iod.anomalies,
                status: status,
                statusSingkat: singkat,
                latestAnomaly: terbaru,
                sumber: 'NOAA PSL (Jalur Resmi API Proxy)'
            };
        } catch (e) {
            console.error("Gagal menarik IOD dari Proxy:", e);
            throw e;
        }
    };

    console.log('%c✅ PATCH API PROXY NOAA AKTIF: Data satelit murni mengalir ke kalkulator risiko air!', 'color: #10b981; font-weight: bold;');
})();
