/**
 * ============================================================
 * PATCH: ENSO & IOD MULTI-LAYER FALLBACK (BoM -> NOAA)
 * Versi: 4.0 — Smart Routing & Auto-Kalibrasi Amplifikasi
 * ============================================================
 * * ARSITEKTUR 4 LAPIS (ANTI-GAGAL):
 * Layer 1 (Utama)  : BoM Australia via GAS Proxy (Amplifikasi x1)
 * Layer 2 (Cadangan) : NOAA CPC/PSL via GAS Proxy (Amplifikasi x5)
 * Layer 3 (Darurat)  : NOAA via AllOrigins CORS Proxy (Amplifikasi x5)
 * Layer 4 (Fallback) : Data Statis Netral (Aplikasi tetap berjalan)
 * ============================================================
 */

(function () {
    'use strict';

    // ── 1. KONFIGURASI URL PROXY ──────────────────────────────
    const GAS_BOM_URL  = 'https://script.google.com/macros/s/AKfycbzdZZcYqhpqenzFY1ltpyNJYHHJTZjSTSiz4mM9DGACAnZKtNN7_LY_1ktpRFg7YoiFOg/exec';   // Masukkan URL Eksekusi GAS BoM
    const GAS_NOAA_URL = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec';  // Masukkan URL Eksekusi GAS NOAA (opsional)
    
    const URL_ALLORIGINS = 'https://api.allorigins.win/get?url=';
    const NOAA_ONI_URL   = encodeURIComponent('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt');
    const NOAA_DMI_URL   = encodeURIComponent('https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data');

    // ── 2. GLOBAL CACHE (SINGLE-FLIGHT REQUEST) ───────────────
    // Mencegah aplikasi melakukan fetch berkali-kali untuk data yang sama
    let _climateDataCache = null;

    async function fetchIklimBerlapis() {
        if (_climateDataCache) return _climateDataCache; // Jika sudah ada, langsung pakai

        _climateDataCache = (async () => {
            
            // --------------------------------------------------
            // LAYER 1: BoM Australia (PRIORITAS UTAMA)
            // --------------------------------------------------
            if (GAS_BOM_URL && GAS_BOM_URL !== 'https://script.google.com/macros/s/AKfycbzdZZcYqhpqenzFY1ltpyNJYHHJTZjSTSiz4mM9DGACAnZKtNN7_LY_1ktpRFg7YoiFOg/exec') {
                try {
                    const res = await fetch(GAS_BOM_URL);
                    const json = await res.json();
                    if (json.status === "success") {
                        console.log("✅ [Iklim] Data BoM berhasil dimuat.");
                        return { 
                            enso: json.data.enso, 
                            iod: json.data.iod, 
                            sumber: 'BoM Australia', 
                            pengali: 1.0 // <--- KALIBRASI BoM
                        };
                    }
                } catch (e) {
                    console.warn("⚠️ [Iklim] BoM Gagal, beralih ke NOAA GAS...", e);
                }
            }

            // --------------------------------------------------
            // LAYER 2: NOAA via GAS (CADANGAN 1)
            // --------------------------------------------------
            if (GAS_NOAA_URL && GAS_NOAA_URL !== 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec') {
                try {
                    const res = await fetch(GAS_NOAA_URL);
                    const json = await res.json();
                    if (json.status === "success") {
                        console.log("✅ [Iklim] Data NOAA (GAS) berhasil dimuat.");
                        return { 
                            enso: json.data.enso, 
                            iod: json.data.iod, 
                            sumber: 'NOAA (GAS Proxy)', 
                            pengali: 5.0 // <--- KALIBRASI NOAA
                        };
                    }
                } catch (e) {
                    console.warn("⚠️ [Iklim] NOAA GAS Gagal, beralih ke AllOrigins...", e);
                }
            }

            // --------------------------------------------------
            // LAYER 3: NOAA via AllOrigins (DARURAT)
            // --------------------------------------------------
            try {
                // Fetch paralel agar lebih cepat
                const [resEnso, resIod] = await Promise.all([
                    fetch(URL_ALLORIGINS + NOAA_ONI_URL),
                    fetch(URL_ALLORIGINS + NOAA_DMI_URL)
                ]);
                
                const dataEnso = await resEnso.json();
                const dataIod = await resIod.json();

                // Ekstrak angka terakhir menggunakan Regex sederhana
                const ensoMatches = dataEnso.contents.trim().split('\n').pop().trim().split(/\s+/);
                const iodMatches = dataIod.contents.trim().split('\n').filter(line => line.length > 10).pop().trim().split(/\s+/);

                const ensoVal = parseFloat(ensoMatches[ensoMatches.length - 1]);
                const iodVal = parseFloat(iodMatches[iodMatches.length - 1]);

                if (!isNaN(ensoVal) && !isNaN(iodVal)) {
                    console.log("✅ [Iklim] Data NOAA (AllOrigins) berhasil dimuat.");
                    return { 
                        enso: ensoVal, 
                        iod: iodVal, 
                        sumber: 'NOAA (Public Proxy)', 
                        pengali: 5.0 // <--- KALIBRASI NOAA
                    };
                }
            } catch (e) {
                console.error("❌ [Iklim] Semua koneksi API gagal!", e);
            }

            // --------------------------------------------------
            // LAYER 4: FALLBACK STATIS (Jika tidak ada internet)
            // --------------------------------------------------
            console.log("⚠️ [Iklim] Menggunakan Fallback Statis (Netral).");
            return { enso: 0, iod: 0, sumber: 'Fallback Statis', pengali: 1.0 };
            
        })();

        return _climateDataCache;
    }

    // ── 3. EKSPOS KE WINDOW (Sesuai kebutuhan index.html) ─────
    
    window.getENSOAnomaly = async function () {
        const data = await fetchIklimBerlapis();
        return {
            latestAnomaly: data.enso,
            oni3Bulan: data.enso,
            status: data.enso > 0.5 ? 'El Niño' : (data.enso < -0.5 ? 'La Niña' : 'Netral'),
            statusSingkat: data.enso > 0.5 ? 'El Niño' : (data.enso < -0.5 ? 'La Niña' : 'Netral'),
            sumber: data.sumber,
            pengaliKalibrasi: data.pengali // <--- Kunci penting untuk perhitungan
        };
    };

    window.getIODAnomaly = async function () {
        const data = await fetchIklimBerlapis();
        return {
            latestAnomaly: data.iod,
            dmi3Bulan: data.iod,
            status: data.iod > 0.4 ? 'IOD Positif' : (data.iod < -0.4 ? 'IOD Negatif' : 'Netral'),
            statusSingkat: data.iod > 0.4 ? 'IOD Positif' : (data.iod < -0.4 ? 'IOD Negatif' : 'Netral'),
            sumber: data.sumber,
            pengaliKalibrasi: data.pengali // <--- Kunci penting untuk perhitungan
        };
    };

    // Fungsi Update UI Teks
    window.updateENSOIODStatus = function (enso, iod) {
        const div = document.getElementById('ensoStatus');
        if (!div) return;

        const warnaEnso = enso.statusSingkat === 'El Niño' ? '#ff4a5a' : (enso.statusSingkat === 'La Niña' ? '#38b6ff' : '#10b981');
        const warnaIod = iod.statusSingkat === 'IOD Positif' ? '#f59e0b' : (iod.statusSingkat === 'IOD Negatif' ? '#38b6ff' : '#10b981');

        div.innerHTML =
            `Pasifik: <span style="color:${warnaEnso}; font-weight:700;">${enso.status}</span> ` +
            `<span style="font-size:0.75rem; opacity:0.6;">(${enso.latestAnomaly > 0 ? '+' : ''}${enso.latestAnomaly})</span>` +
            ` &nbsp;|&nbsp; ` +
            `Hindia: <span style="color:${warnaIod}; font-weight:700;">${iod.status}</span> ` +
            `<span style="font-size:0.75rem; opacity:0.6;">(${iod.latestAnomaly > 0 ? '+' : ''}${iod.latestAnomaly})</span>` +
            `<br><span style="font-size:0.65rem; opacity:0.6; margin-top:4px; display:block; color:#f59e0b;">` +
            `📡 Sumber: ${enso.sumber} | Kalibrasi: x${enso.pengaliKalibrasi}` +
            `</span>`;
    };

})();
