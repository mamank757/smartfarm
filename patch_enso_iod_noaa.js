// ============================================================
//  PATCH: ENSO & IOD — Sumber Resmi NOAA CPC + NOAA PSL
//  Gantikan fungsi getENSOAnomaly() dan getIODAnomaly()
//  di file HTML utama dengan kode ini.
//
//  Arsitektur Fallback (3 Lapis):
//    Layer 1 → NOAA CPC (oni.ascii.txt) / NOAA PSL (DMI)
//              → Data paling akurat, resmi, update bulanan
//    Layer 2 → Open-Meteo Marine API (proxy SST)
//              → Sudah dipakai di kode lama, tetap andal
//    Layer 3 → Fallback klimatologi statis getFallbackSST()
//              → Selalu berhasil, tidak perlu internet
//
//  CATATAN CORS:
//    NOAA CPC & PSL tidak mengizinkan fetch langsung dari
//    browser (CORS blocked). Solusinya menggunakan proxy
//    publik AllOrigins. Jika AllOrigins juga gagal, sistem
//    otomatis turun ke Layer 2 (Open-Meteo).
// ============================================================

// ── KONSTANTA URL ──────────────────────────────────────────
const NOAA_ONI_URL  = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const NOAA_DMI_URL  = 'https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data';
const PROXY_BASE    = 'https://api.allorigins.win/get?url=';

// ── NAMA BULAN (DIPAKAI DI SEMUA FUNGSI) ──────────────────
const NAMA_BULAN = [
    'Jan','Feb','Mar','Apr','Mei','Jun',
    'Jul','Agu','Sep','Okt','Nov','Des'
];

// ── MAPPING MUSIM 3-BULANAN → INDEKS BULAN TENGAH ─────────
// Dipakai untuk parsing kolom "SEAS" di oni.ascii.txt
// Contoh: "DJF" = Des-Jan-Feb → bulan tengah = Januari (0)
const SEAS_TO_MONTH = {
    DJF:0, JFM:1, FMA:2, MAM:3, AMJ:4, MJJ:5,
    JJA:6, JAS:7, ASO:8, SON:9, OND:10, NDJ:11
};

// ============================================================
//  FUNGSI BANTU: Fetch dengan proxy AllOrigins + timeout
// ============================================================
async function fetchViaProxy(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const proxyUrl = PROXY_BASE + encodeURIComponent(url);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // AllOrigins membungkus teks di dalam json.contents
        return json.contents || '';
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================
//  PARSER: oni.ascii.txt → array anomali bulanan
//
//  Format file:
//    SEAS YR   TOTAL  ANOM
//    DJF  1950  24.73  -1.53
//    ...
//
//  Output: array objek { year, month (0-based), oni }
// ============================================================
function parseONI(teks) {
    const baris = teks.trim().split('\n');
    const hasil = [];
    for (const b of baris) {
        const kolom = b.trim().split(/\s+/);
        // Baris header: kolom[0] = 'SEAS', lewati
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
//
//  Format file (kolom spasi):
//    YEAR  JAN   FEB   MAR  ... DES
//    1870  -0.04 -0.12 ...
//    ...
//    -999 atau -99.9 = missing value
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
            // Abaikan missing value
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
        // Redaman makin kuat untuk proyeksi lebih jauh
        const redaman = Math.max(0.25, 0.7 - (i * 0.15));
        const tebakan = nilaiTerakhir + (tren * i * redaman);
        hasil.push(parseFloat(Math.max(batasMin, Math.min(batasMax, tebakan)).toFixed(2)));
    }
    return hasil; // [bulan ini, +1, +2, +3]
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
//  Threshold resmi: NOAA CPC (±0.5°C selama ≥5 musim)
//  Untuk keperluan real-time, cukup cek nilai saat ini
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
//  Threshold: ±0.4°C (standar NOAA PSL / JAMSTEC)
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
//  (logika lama dipertahankan sebagai cadangan)
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
        promises.push(getNOAASST(0, -145, d)); // Titik Nino3.4
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
//  Layer 1 → NOAA CPC oni.ascii.txt (via AllOrigins proxy)
//  Layer 2 → Open-Meteo Marine (proxy SST Nino3.4)
//  Layer 3 → Nilai statis netral
// ============================================================
async function getENSOAnomaly() {
    // ── LAYER 1: NOAA CPC ──────────────────────────────────
    try {
        const teks  = await fetchViaProxy(NOAA_ONI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA CPC kosong');

        const data  = parseONI(teks);
        if (data.length === 0) throw new Error('Parser ONI gagal');

        // Ambil 6 bulan terakhir untuk hitung tren
        const enam = ambilNDataTerakhir(data, 6);
        const oniArr = enam.map(d => d.oni);

        // ONI resmi = rata-rata 3-bulan terakhir
        const oni3  = (oniArr[3] + oniArr[4] + oniArr[5]) / 3;

        // Hitung tren linear dari 6 bulan
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
        console.warn('⚠️ NOAA CPC gagal:', err1.message, '— beralih ke Open-Meteo...');
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
//  Layer 1 → NOAA PSL dmi.had.long.data (via AllOrigins proxy)
//  Layer 2 → Open-Meteo Marine (proxy SST DMI)
//  Layer 3 → Nilai statis netral
// ============================================================
async function getIODAnomaly() {
    // ── LAYER 1: NOAA PSL ──────────────────────────────────
    try {
        const teks = await fetchViaProxy(NOAA_DMI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA PSL DMI kosong');

        const data = parseDMI(teks);
        if (data.length === 0) throw new Error('Parser DMI gagal');

        // Ambil 6 bulan terakhir
        const enam   = ambilNDataTerakhir(data, 6);
        const dmiArr = enam.map(d => d.dmi);

        // DMI resmi = rata-rata 3-bulan terakhir (running mean)
        const dmi3  = (dmiArr[3] + dmiArr[4] + dmiArr[5]) / 3;

        // Hitung tren linear
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
        console.warn('⚠️ NOAA PSL DMI gagal:', err1.message, '— beralih ke Open-Meteo...');
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
