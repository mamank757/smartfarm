// ============================================================
//  PATCH v3: ENSO & IOD — Sumber Resmi NOAA CPC + NOAA PSL
//  Gantikan fungsi getENSOAnomaly() dan getIODAnomaly()
//  di file HTML utama dengan kode ini.
//
//  Arsitektur Fallback (4 Lapis):
//    Layer 1a → Proxy Google Apps Script (BARU)
//               → Server-to-server, bebas CORS, ada caching,
//                 paling stabil. WAJIB diisi GAS_PROXY_URL
//                 di bawah agar layer ini aktif.
//    Layer 1b → Proxy publik AllOrigins
//               → Cadangan kalau GAS belum di-deploy / gagal
//    Layer 2  → Open-Meteo Marine API (proxy SST)
//               → Sudah dipakai di kode lama, tetap andal
//    Layer 3  → Fallback klimatologi statis getFallbackSST()
//               → Selalu berhasil, tidak perlu internet
//
//  CARA AKTIFKAN LAYER 1a (Apps Script):
//    1. Deploy file apps_script_noaa_proxy.gs sebagai Web App
//       (lihat instruksi lengkap di header file tersebut)
//    2. Copy URL yang berakhiran "/exec"
//    3. Tempel ke konstanta GAS_PROXY_URL di bawah
//    Jika dibiarkan kosong, sistem otomatis lewati Layer 1a
//    dan langsung coba Layer 1b (AllOrigins).
// ============================================================

(function () {
    'use strict';

// ── ISI URL DEPLOYMENT APPS SCRIPT ANDA DI SINI ────────────
// Contoh: 'https://script.google.com/macros/s/AKfycby.../exec'
const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec'; // <-- tempel URL /exec di sini

const NOAA_ONI_URL  = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const NOAA_DMI_URL  = 'https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data';
const PROXY_BASE    = 'https://api.allorigins.win/get?url=';

// ── NAMA BULAN (DIPAKAI DI SEMUA FUNGSI) ──────────────────
const NAMA_BULAN = [
    'Jan','Feb','Mar','Apr','Mei','Jun',
    'Jul','Agu','Sep','Okt','Nov','Des'
];

// ── MAPPING MUSIM 3-BULANAN → INDEKS BULAN TENGAH ─────────
const SEAS_TO_MONTH = {
    DJF:0, JFM:1, FMA:2, MAM:3, AMJ:4, MJJ:5,
    JJA:6, JAS:7, ASO:8, SON:9, OND:10, NDJ:11
};

// ============================================================
//  FUNGSI BANTU: Fetch lewat proxy Apps Script (Layer 1a)
// ============================================================
async function fetchViaGAS(url, timeoutMs = 10000) {
    if (!GAS_PROXY_URL) throw new Error('GAS_PROXY_URL belum diisi');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const proxyUrl = GAS_PROXY_URL + '?url=' + encodeURIComponent(url);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        return json.contents || '';
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================
//  FUNGSI BANTU: Fetch lewat AllOrigins (Layer 1b / cadangan)
// ============================================================
async function fetchViaAllOrigins(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const proxyUrl = PROXY_BASE + encodeURIComponent(url);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.contents || '';
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================
//  FUNGSI UTAMA PROXY: coba GAS dulu, kalau gagal coba AllOrigins
//  Dipakai oleh getENSOAnomaly() dan getIODAnomaly() di Layer 1
// ============================================================
async function fetchViaProxy(url, timeoutMs = 10000) {
    // Layer 1a: Apps Script (kalau sudah dikonfigurasi)
    if (GAS_PROXY_URL) {
        try {
            const teks = await fetchViaGAS(url, timeoutMs);
            if (teks && teks.length >= 50) {
                console.log('✅ Diambil via proxy Apps Script');
                return teks;
            }
        } catch (errGAS) {
            console.warn('⚠️ Proxy Apps Script gagal:', errGAS.message, '— coba AllOrigins...');
        }
    }

    // Layer 1b: AllOrigins (cadangan)
    return await fetchViaAllOrigins(url, timeoutMs);
}

// ============================================================
//  PARSER: oni.ascii.txt → array anomali bulanan
// ============================================================
function parseONI(teks) {
    const baris = teks.trim().split('\n');
    const hasil = [];
    for (const b of baris) {
        const kolom = b.trim().split(/\s+/);
        if (!kolom[0] || kolom[0] === 'SEAS') continue;
        const seas  = kolom[0];
        const year  = parseInt(kolom[1]);
        const anom  = parseFloat(kolom[3]);
        const month = SEAS_TO_MONTH[seas];
        if (isNaN(year) || isNaN(anom) || month === undefined) continue;
        hasil.push({ year, month, oni: anom });
    }
    return hasil;
}

// ============================================================
//  PARSER: dmi.had.long.data → array anomali DMI bulanan
// ============================================================
function parseDMI(teks) {
    const baris = teks.trim().split('\n');
    const hasil = [];
    for (const b of baris) {
        const kolom = b.trim().split(/\s+/);
        const year  = parseInt(kolom[0]);
        if (isNaN(year) || year < 1870) continue;
        for (let m = 0; m < 12; m++) {
            const val = parseFloat(kolom[m + 1]);
            if (isNaN(val) || val <= -99) continue;
            hasil.push({ year, month: m, dmi: val });
        }
    }
    return hasil;
}

// ============================================================
//  FUNGSI BANTU: Ambil N data terakhir dari array terparse
// ============================================================
function ambilNDataTerakhir(arr, n) {
    return arr.slice(Math.max(0, arr.length - n));
}

// ============================================================
//  FUNGSI BANTU: Proyeksi 3 bulan ke depan (tren + redaman)
// ============================================================
function proyeksikanTren(nilaiTerakhir, tren, jumlahBulan = 3, batasMin = -3, batasMax = 3) {
    const hasil = [parseFloat(nilaiTerakhir.toFixed(2))];
    for (let i = 1; i <= jumlahBulan; i++) {
        const redaman = Math.max(0.25, 0.7 - (i * 0.15));
        const tebakan = nilaiTerakhir + (tren * i * redaman);
        hasil.push(parseFloat(Math.max(batasMin, Math.min(batasMax, tebakan)).toFixed(2)));
    }
    return hasil;
}

// ============================================================
//  FUNGSI BANTU: Hitung label bulan ke depan
// ============================================================
function buatLabelBulan(jumlah = 4) {
    const labels = [];
    for (let i = 0; i < jumlah; i++) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + i);
        labels.push(`${NAMA_BULAN[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`);
    }
    return labels;
}

// ============================================================
//  FUNGSI BANTU: Klasifikasi status ENSO dari nilai ONI
// ============================================================
function klasifikasiENSO(oni) {
    let status = 'Netral', intensitas = '';
    if      (oni >= 2.0)  { status = 'El Niño'; intensitas = 'Super / Sangat Kuat'; }
    else if (oni >= 1.5)  { status = 'El Niño'; intensitas = 'Kuat'; }
    else if (oni >= 1.0)  { status = 'El Niño'; intensitas = 'Moderat'; }
    else if (oni >= 0.5)  { status = 'El Niño'; intensitas = 'Lemah'; }
    else if (oni <= -2.0) { status = 'La Niña'; intensitas = 'Sangat Kuat'; }
    else if (oni <= -1.5) { status = 'La Niña'; intensitas = 'Kuat'; }
    else if (oni <= -1.0) { status = 'La Niña'; intensitas = 'Moderat'; }
    else if (oni <= -0.5) { status = 'La Niña'; intensitas = 'Lemah'; }
    return {
        status,
        intensitas,
        label: intensitas ? `${status} (${intensitas})` : status,
        singkat: status
    };
}

// ============================================================
//  FUNGSI BANTU: Klasifikasi status IOD dari nilai DMI
// ============================================================
function klasifikasiIOD(dmi) {
    let status = 'Netral', intensitas = '';
    if      (dmi >= 1.5)  { status = 'IOD Positif'; intensitas = 'Sangat Kuat'; }
    else if (dmi >= 1.0)  { status = 'IOD Positif'; intensitas = 'Kuat'; }
    else if (dmi >= 0.7)  { status = 'IOD Positif'; intensitas = 'Moderat'; }
    else if (dmi >= 0.4)  { status = 'IOD Positif'; intensitas = 'Lemah'; }
    else if (dmi <= -1.5) { status = 'IOD Negatif'; intensitas = 'Sangat Kuat'; }
    else if (dmi <= -1.0) { status = 'IOD Negatif'; intensitas = 'Kuat'; }
    else if (dmi <= -0.7) { status = 'IOD Negatif'; intensitas = 'Moderat'; }
    else if (dmi <= -0.4) { status = 'IOD Negatif'; intensitas = 'Lemah'; }
    return {
        status,
        intensitas,
        label: intensitas ? `${status} (${intensitas})` : status,
        singkat: status
    };
}

// ============================================================
//  FALLBACK LAYER 2: Hitung ONI dari SST Open-Meteo
// ============================================================
async function getENSOViaOpenMeteo() {
    const BASELINE_NINO34 = (() => {
        const y = new Date().getFullYear();
        if (y <= 2025) return 27.0;
        if (y <= 2030) return 27.2;
        if (y <= 2035) return 27.3;
        return 27.4;
    })();

    const promises = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        promises.push(getNOAASST(0, -144.5, d));
    }
    const hasil = await Promise.all(promises);
    const anomali = hasil.map(s => parseFloat(((s ?? BASELINE_NINO34) - BASELINE_NINO34).toFixed(2)));
    const oni3    = (anomali[3] + anomali[4] + anomali[5]) / 3;
    let trenTotal = 0;
    for (let i = 1; i < anomali.length; i++) trenTotal += anomali[i] - anomali[i-1];
    const tren = trenTotal / (anomali.length - 1);

    const proyeksi = proyeksikanTren(oni3, tren, 3, -3, 3);
    const klasif   = klasifikasiENSO(proyeksi[0]);
    const labels   = buatLabelBulan(4);

    return {
        labels,
        anomalies: proyeksi,
        status: klasif.label,
        statusSingkat: klasif.singkat,
        intensitas: klasif.intensitas,
        latestAnomaly: proyeksi[0],
        oni3Bulan: parseFloat(oni3.toFixed(2)),
        sumber: 'Open-Meteo (fallback)'
    };
}

// ============================================================
//  FALLBACK LAYER 2: Hitung DMI dari SST Open-Meteo
// ============================================================
async function getIODViaOpenMeteo() {
    const tahun = new Date().getFullYear();
    const BB = tahun <= 2025 ? 28.5 : tahun <= 2030 ? 28.7 : 28.8;
    const BT = tahun <= 2025 ? 28.5 : tahun <= 2030 ? 28.6 : 28.7;

    const pB = [], pT = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
        pB.push(getNOAASST(0, 60, d));
        pT.push(getNOAASST(-5, 100, d));
    }
    const hB = await Promise.all(pB);
    const hT = await Promise.all(pT);

    const dmiArr = [];
    for (let i = 0; i < 6; i++) {
        dmiArr.push(parseFloat(((hB[i] ?? BB) - (hT[i] ?? BT)).toFixed(2)));
    }
    const dmi3  = (dmiArr[3] + dmiArr[4] + dmiArr[5]) / 3;
    let trenTotal = 0;
    for (let i = 1; i < dmiArr.length; i++) trenTotal += dmiArr[i] - dmiArr[i-1];
    const tren = trenTotal / (dmiArr.length - 1);

    const proyeksi = proyeksikanTren(dmi3, tren, 3, -2, 2);
    const klasif   = klasifikasiIOD(proyeksi[0]);
    const labels   = buatLabelBulan(4);

    return {
        labels,
        anomalies: proyeksi,
        status: klasif.label,
        statusSingkat: klasif.singkat,
        intensitas: klasif.intensitas,
        latestAnomaly: proyeksi[0],
        dmi3Bulan: parseFloat(dmi3.toFixed(2)),
        sumber: 'Open-Meteo (fallback)'
    };
}

// ============================================================
//  FUNGSI UTAMA: getENSOAnomaly()
//  Layer 1a → Apps Script proxy
//  Layer 1b → AllOrigins proxy
//  Layer 2  → Open-Meteo Marine (proxy SST Nino3.4)
//  Layer 3  → Nilai statis netral
// ============================================================
async function getENSOAnomaly() {
    // ── LAYER 1: NOAA CPC (lewat proxy GAS/AllOrigins) ──────
    try {
        const teks  = await fetchViaProxy(NOAA_ONI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA CPC kosong');

        const data  = parseONI(teks);
        if (data.length === 0) throw new Error('Parser ONI gagal');

        const enam = ambilNDataTerakhir(data, 6);
        const oniArr = enam.map(d => d.oni);

        const oni3  = (oniArr[3] + oniArr[4] + oniArr[5]) / 3;

        let trenTotal = 0;
        for (let i = 1; i < oniArr.length; i++) trenTotal += oniArr[i] - oniArr[i-1];
        const tren = trenTotal / (oniArr.length - 1);

        const proyeksi = proyeksikanTren(oni3, tren, 3, -3, 3);
        const klasif   = klasifikasiENSO(proyeksi[0]);
        const labels   = buatLabelBulan(4);

        console.log('✅ ENSO dari NOAA CPC — ONI terkini:', proyeksi[0]);
        return {
            labels,
            anomalies: proyeksi,
            status: klasif.label,
            statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas,
            latestAnomaly: proyeksi[0],
            oni3Bulan: parseFloat(oni3.toFixed(2)),
            sumber: 'NOAA CPC (resmi)'
        };
    } catch (err1) {
        console.warn('⚠️ NOAA CPC gagal total:', err1.message, '— beralih ke Open-Meteo...');
    }

    // ── LAYER 2: Open-Meteo ────────────────────────────────
    try {
        const hasil = await getENSOViaOpenMeteo();
        console.log('✅ ENSO dari Open-Meteo (fallback)');
        return hasil;
    } catch (err2) {
        console.warn('⚠️ Open-Meteo ENSO gagal:', err2.message, '— gunakan nilai statis.');
    }

    // ── LAYER 3: Statis netral ─────────────────────────────
    const labels = buatLabelBulan(4);
    return {
        labels,
        anomalies: [0, 0, 0, 0],
        status: 'Netral',
        statusSingkat: 'Netral',
        intensitas: '',
        latestAnomaly: 0,
        oni3Bulan: 0,
        sumber: 'Statis (semua sumber gagal)'
    };
}

// ============================================================
//  FUNGSI UTAMA: getIODAnomaly()
//  Layer 1a → Apps Script proxy
//  Layer 1b → AllOrigins proxy
//  Layer 2  → Open-Meteo Marine (proxy SST DMI)
//  Layer 3  → Nilai statis netral
// ============================================================
async function getIODAnomaly() {
    // ── LAYER 1: NOAA PSL (lewat proxy GAS/AllOrigins) ──────
    try {
        const teks = await fetchViaProxy(NOAA_DMI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA PSL DMI kosong');

        const data = parseDMI(teks);
        if (data.length === 0) throw new Error('Parser DMI gagal');

        const enam   = ambilNDataTerakhir(data, 6);
        const dmiArr = enam.map(d => d.dmi);

        const dmi3  = (dmiArr[3] + dmiArr[4] + dmiArr[5]) / 3;

        let trenTotal = 0;
        for (let i = 1; i < dmiArr.length; i++) trenTotal += dmiArr[i] - dmiArr[i-1];
        const tren = trenTotal / (dmiArr.length - 1);

        const proyeksi = proyeksikanTren(dmi3, tren, 3, -2, 2);
        const klasif   = klasifikasiIOD(proyeksi[0]);
        const labels   = buatLabelBulan(4);

        console.log('✅ IOD dari NOAA PSL — DMI terkini:', proyeksi[0]);
        return {
            labels,
            anomalies: proyeksi,
            status: klasif.label,
            statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas,
            latestAnomaly: proyeksi[0],
            dmi3Bulan: parseFloat(dmi3.toFixed(2)),
            sumber: 'NOAA PSL (resmi)'
        };
    } catch (err1) {
        console.warn('⚠️ NOAA PSL DMI gagal total:', err1.message, '— beralih ke Open-Meteo...');
    }

    // ── LAYER 2: Open-Meteo ────────────────────────────────
    try {
        const hasil = await getIODViaOpenMeteo();
        console.log('✅ IOD dari Open-Meteo (fallback)');
        return hasil;
    } catch (err2) {
        console.warn('⚠️ Open-Meteo IOD gagal:', err2.message, '— gunakan nilai statis.');
    }

    // ── LAYER 3: Statis netral ─────────────────────────────
    const labels = buatLabelBulan(4);
    return {
        labels,
        anomalies: [0, 0, 0, 0],
        status: 'Netral',
        statusSingkat: 'Netral',
        intensitas: '',
        latestAnomaly: 0,
        dmi3Bulan: 0,
        sumber: 'Statis (semua sumber gagal)'
    };
}

// ============================================================
//  OVERRIDE: Perbarui updateENSOIODStatus() agar tampilkan
//  sumber data (NOAA CPC / Open-Meteo / Statis)
// ============================================================
function updateENSOIODStatus(enso, iod) {
    const div = document.getElementById('ensoStatus');
    if (!div) return;

    const warnaEnso = enso.statusSingkat === 'El Niño'
        ? '#ff4a5a'
        : (enso.statusSingkat === 'La Niña' ? '#38b6ff' : '#10b981');

    const warnaIod = iod.statusSingkat === 'IOD Positif'
        ? '#f59e0b'
        : (iod.statusSingkat === 'IOD Negatif' ? '#38b6ff' : '#10b981');

    div.innerHTML =
        `Pasifik: <span style="color:${warnaEnso}; font-weight:700;">${enso.status}</span> ` +
        `<span style="font-size:0.75rem; opacity:0.6;">(ONI: ${enso.oni3Bulan > 0 ? '+' : ''}${enso.oni3Bulan}°C)</span>` +
        ` &nbsp;|&nbsp; ` +
        `Hindia: <span style="color:${warnaIod}; font-weight:700;">${iod.status}</span> ` +
        `<span style="font-size:0.75rem; opacity:0.6;">(DMI: ${iod.dmi3Bulan > 0 ? '+' : ''}${iod.dmi3Bulan}°C)</span>` +
        `<br><span style="font-size:0.65rem; opacity:0.4; margin-top:4px; display:block;">` +
        `Sumber ENSO: ${enso.sumber || '-'} &nbsp;|&nbsp; Sumber IOD: ${iod.sumber || '-'}` +
        `</span>`;
}

    // ── EKSPOS KE WINDOW ──────────────────────────────────────
    window.getENSOAnomaly       = getENSOAnomaly;
    window.getIODAnomaly        = getIODAnomaly;
    window.updateENSOIODStatus  = updateENSOIODStatus;

    console.log(
        '%c✅ patch_enso_iod_noaa.js v3 aktif (proxy Apps Script + AllOrigins + Open-Meteo)',
        'color:#38b6ff; font-weight:bold;'
    );

})();
