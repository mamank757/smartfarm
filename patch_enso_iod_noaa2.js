/**
 * ============================================================
 * PATCH: ENSO & IOD MULTI-LAYER FALLBACK (BoM -> NOAA)
 * Versi: 4.1 — Layer 1 (BoM) diperbaiki dengan validasi data
 * ============================================================
 * Perubahan vs versi 4.0 (hanya bagian Layer 1 yang disentuh,
 * sesuai permintaan — Layer 2/3/4 NOAA tidak diubah):
 *
 * 1. Menambahkan isAngkaValid() — Layer 1 sekarang memvalidasi
 *    bahwa json.data.enso dan json.data.iod benar-benar angka
 *    yang masuk akal (bukan null/undefined/NaN/di luar rentang
 *    fisik) sebelum dianggap "berhasil". Sebelumnya kode hanya
 *    mengecek json.status === "success" lalu langsung percaya
 *    isi datanya — kalau GAS proxy BoM merespons "success" tapi
 *    datanya kosong/aneh, versi lama tetap memakainya.
 * 2. Log lebih informatif: membedakan "BoM gagal total" (network/
 *    parse error) vs "BoM merespons tapi data tidak valid".
 * 3. Memakai json.sumber dari GAS (kalau ada) supaya UI menampilkan
 *    sumber data yang sebenarnya (legacy txt vs endpoint baru),
 *    bukan selalu hardcode 'BoM Australia'.
 *
 * ⚠️ PENTING: per pengecekan 21 Jun 2026, URL .txt lama BoM yang
 * dipakai GAS proxy (nino3_4.txt, iod1.txt) mengembalikan 404.
 * BoM memindahkan data index iklim ke widget JavaScript yang tidak
 * punya URL data statis yang bisa di-fetch dari server. Layer 1 ini
 * baru akan benar-benar "hidup" lagi setelah GAS proxy diisi dengan
 * endpoint baru (lihat catatan di gas-proxy-bom.gs). Sampai saat itu,
 * Layer 1 akan otomatis gagal dengan rapi dan turun ke Layer 2.
 * ============================================================
 */

(function () {
    'use strict';

    // ── 1. KONFIGURASI URL PROXY ──────────────────────────────
    const GAS_BOM_URL  = 'https://script.google.com/macros/s/AKfycbwq-j1TsOBFCONu6AzAmfRmaI-i6aUkRMXNE4Lbasvwg1S9YqE72zZjoflBtHxOn9BO9Q/exec';
    const GAS_NOAA_URL = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec';

    const URL_ALLORIGINS = 'https://api.allorigins.win/get?url=';
    const NOAA_ONI_URL   = encodeURIComponent('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt');
    const NOAA_DMI_URL   = encodeURIComponent('https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data');

    // ── 2. GLOBAL CACHE (SINGLE-FLIGHT REQUEST) ───────────────
    let _climateDataCache = null;

    /**
     * Validasi nilai index iklim dari respons GAS sebelum dipercaya.
     * Menolak: bukan tipe number, NaN, atau di luar rentang fisik
     * wajar untuk anomali SST/IOD (°C).
     */
    function isAngkaValid(v) {
        return typeof v === 'number' && !isNaN(v) && Math.abs(v) <= 5;
    }

    async function fetchIklimBerlapis() {
        if (_climateDataCache) return _climateDataCache;

        _climateDataCache = (async () => {

            // --------------------------------------------------
            // LAYER 1: BoM Australia (PRIORITAS UTAMA)
            // --------------------------------------------------
            if (GAS_BOM_URL && GAS_BOM_URL !== 'URL_GAS_BOM_ANDA_DI_SINI') {
                try {
                    const res = await fetch(GAS_BOM_URL);
                    const json = await res.json();

                    if (json.status === "success") {
                        const ensoOk = isAngkaValid(json.data && json.data.enso);
                        const iodOk  = isAngkaValid(json.data && json.data.iod);

                        if (ensoOk && iodOk) {
                            console.log(`✅ [Iklim] Data BoM berhasil dimuat (sumber: ${json.sumber || 'BoM Australia'}).`);
                            return {
                                enso: json.data.enso,
                                iod: json.data.iod,
                                sumber: json.sumber || 'BoM Australia',
                                pengali: 1.0 // <--- KALIBRASI BoM
                            };
                        }
                        console.warn("⚠️ [Iklim] BoM merespons 'success' tapi data tidak valid/di luar rentang wajar, beralih ke NOAA GAS...", json.data);
                    } else {
                        console.warn("⚠️ [Iklim] BoM merespons error:", json.pesan || json);
                    }
                } catch (e) {
                    console.warn("⚠️ [Iklim] BoM Gagal (network/parse error), beralih ke NOAA GAS...", e);
                }
            }

            // --------------------------------------------------
            // LAYER 2: NOAA via GAS (CADANGAN 1) — tidak diubah
            // --------------------------------------------------
            if (GAS_NOAA_URL && GAS_NOAA_URL !== 'URL_GAS_NOAA_ANDA_DI_SINI') {
                try {
                    const res = await fetch(GAS_NOAA_URL);
                    const json = await res.json();
                    if (json.status === "success") {
                        console.log("✅ [Iklim] Data NOAA (GAS) berhasil dimuat.");
                        return {
                            enso: json.data.enso,
                            iod: json.data.iod,
                            sumber: 'NOAA (GAS Proxy)',
                            pengali: 5.0
                        };
                    }
                } catch (e) {
                    console.warn("⚠️ [Iklim] NOAA GAS Gagal, beralih ke AllOrigins...", e);
                }
            }

            // --------------------------------------------------
            // LAYER 3: NOAA via AllOrigins (DARURAT) — tidak diubah
            // --------------------------------------------------
            try {
                const [resEnso, resIod] = await Promise.all([
                    fetch(URL_ALLORIGINS + NOAA_ONI_URL),
                    fetch(URL_ALLORIGINS + NOAA_DMI_URL)
                ]);

                const dataEnso = await resEnso.json();
                const dataIod = await resIod.json();

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
                        pengali: 5.0
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
            pengaliKalibrasi: data.pengali
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
            pengaliKalibrasi: data.pengali
        };
    };

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
