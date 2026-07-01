// ============================================================
//  PATCH v4.2: ENSO & IOD + PETA SST REAL
//  Sumber utama   : GAS URL identik Dashboard
//  Sumber cadangan: NOAA CPC ONI + NOAA PSL DMI (via proxy)
//  Peta           : Open-Meteo Marine API — IDW interpolation
//  Proyeksi       : Holt's Damped Trend
// ============================================================

(function () {
    'use strict';

// ── URL UTAMA — SAMA PERSIS dengan Dashboard ─────────────────
const GAS_ENSO_URL = 'https://script.google.com/macros/s/AKfycbzMth4qWgEi0DuPSMEPbjQa1jcQTWE2UiaR8gRJ-8zZTBA-4joPHgA_-7gE2_butMk/exec';
const GAS_IOD_URL  = 'https://script.google.com/macros/s/AKfycbyaiXiZ57tTJvWlpD7yyL0ofWSAmrgoc7HMeJG_dA9hGmQeC6SJvDrIQ-XntM3EReHr/exec';

// ── URL CADANGAN NOAA ────────────────────────────────────────
const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbz9oRwYDHZW7IXJ2Bdjc7uJsr17Ez-ed7j_LDI7S_YzXnFuXHuzIRwPD3CVd2ZAhTt9Mg/exec';
const NOAA_ONI_URL  = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const NOAA_DMI_URL  = 'https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data';
const PROXY_BASE    = 'https://api.allorigins.win/get?url=';

const NAMA_BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

const SEAS_TO_MONTH = {
    DJF:0, JFM:1, FMA:2, MAM:3, AMJ:4, MJJ:5,
    JJA:6, JAS:7, ASO:8, SON:9, OND:10, NDJ:11
};

// ── Proyeksi D3 peta — identik dengan Dashboard ───────────────
const PROJECTION_CONFIG = { scale: 143, translate: [450, 230], rotate: [-150, 0] };

// ============================================================
//  TITIK SAMPLING SST STRATEGIS
//  Mencakup zona pemantauan Niño3.4, IOD Barat, IOD Timur,
//  Samudra Hindia tengah, Pasifik barat-tengah-timur.
//  18 titik → fetch paralel → IDW interpolasi seluruh grid.
// ============================================================
const SST_GRID_POINTS = [
    // Niño 3.4 (170°W–120°W, 5°S–5°N)
    { id: 'n34_c',  lat:  0,   lon: -155 },
    { id: 'n34_n',  lat:  3,   lon: -140 },
    { id: 'n34_s',  lat: -3,   lon: -165 },
    { id: 'n34_e',  lat:  0,   lon: -125 },

    // IOD Barat (50°E–70°E, 10°S–10°N)
    { id: 'iodw_c', lat:  0,   lon:  60  },
    { id: 'iodw_n', lat:  5,   lon:  55  },
    { id: 'iodw_s', lat: -5,   lon:  65  },

    // IOD Timur (90°E–110°E, 10°S–0°N)
    { id: 'iode_c', lat: -5,   lon: 100  },
    { id: 'iode_n', lat:  0,   lon:  95  },
    { id: 'iode_s', lat: -8,   lon: 105  },

    // Samudra Hindia tengah
    { id: 'io_n',   lat: 10,   lon:  75  },
    { id: 'io_c',   lat:  0,   lon:  80  },
    { id: 'io_s',   lat: -10,  lon:  80  },

    // Pasifik barat
    { id: 'pw_n',   lat:  5,   lon: 150  },
    { id: 'pw_s',   lat: -5,   lon: 145  },

    // Pasifik tengah–timur
    { id: 'pe_dl',  lat:  0,   lon: 180  },
    { id: 'pe_c',   lat:  0,   lon: -120 },
    { id: 'pe_n',   lat:  5,   lon: -130 },
];

// ============================================================
//  HOLT'S DAMPED TREND — identik dengan Dashboard
// ============================================================
function holtDampedForecast(series, stepsAhead, opts = {}) {
    const alpha = opts.alpha ?? 0.35;
    const beta  = opts.beta  ?? 0.15;
    const phi   = opts.phi   ?? 0.85;
    const n = series.length;
    if (n === 0) return new Array(stepsAhead).fill(0);
    if (n === 1) return new Array(stepsAhead).fill(series[0]);
    const initWindow = Math.min(4, n - 1);
    let level = series[0];
    let trend = (series[initWindow] - series[0]) / initWindow;
    for (let t = 1; t < n; t++) {
        const y = series[t], prevLevel = level;
        level = alpha * y + (1 - alpha) * (prevLevel + phi * trend);
        trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    }
    const forecast = [];
    let dampSum = 0;
    for (let h = 1; h <= stepsAhead; h++) {
        dampSum += Math.pow(phi, h);
        forecast.push(parseFloat((level + dampSum * trend).toFixed(2)));
    }
    return forecast;
}

// ============================================================
//  UTIL
// ============================================================
function buatLabelBulan(jumlah = 4) {
    const labels = [];
    for (let i = 0; i < jumlah; i++) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i);
        labels.push(`${NAMA_BULAN[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`);
    }
    return labels;
}

async function fetchText(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally { clearTimeout(timer); }
}

async function fetchViaProxy(url, timeoutMs = 12000) {
    if (GAS_PROXY_URL) {
        try {
            const proxyUrl = GAS_PROXY_URL + '?url=' + encodeURIComponent(url);
            const teks = await fetchText(proxyUrl, timeoutMs);
            const json = JSON.parse(teks);
            if (json.error) throw new Error(json.error);
            const c = json.contents || '';
            if (c.length >= 50) return c;
        } catch(e) { console.warn('⚠️ GAS Proxy gagal:', e.message); }
    }
    const teks = await fetchText(PROXY_BASE + encodeURIComponent(url), timeoutMs);
    return JSON.parse(teks).contents || '';
}

// ============================================================
//  PARSER
// ============================================================
function parseGASEnso(teks) {
    const baris = teks.split('\n').filter(l => l.trim().length > 0);
    const dates = [], values = [];
    baris.slice(4).forEach(row => {
        const parts = row.trim().split(/\s+/);
        if (parts.length >= 9) {
            const val = parseFloat(parts[6]);
            if (!isNaN(val)) { dates.push(parts[0]); values.push(val); }
        }
    });
    return { dates, values };
}

function parseGASIod(teks) {
    const labels = [], values = [];
    teks.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 13) {
            const year = parseInt(parts[0]);
            if (!isNaN(year) && year >= 2024) {
                for (let i = 1; i <= 12; i++) {
                    const val = parseFloat(parts[i]);
                    if (!isNaN(val) && val !== -99.99 && val > -99) {
                        labels.push(`${year}-${i.toString().padStart(2, '0')}`);
                        values.push(val);
                    }
                }
            }
        }
    });
    return { labels, values };
}

function parseONI(teks) {
    const hasil = [];
    for (const b of teks.trim().split('\n')) {
        const k = b.trim().split(/\s+/);
        if (!k[0] || k[0] === 'SEAS') continue;
        const anom = parseFloat(k[3]);
        const mo = SEAS_TO_MONTH[k[0]];
        if (!isNaN(anom) && mo !== undefined) hasil.push(anom);
    }
    return hasil;
}

function parseDMI(teks) {
    const hasil = [];
    for (const b of teks.trim().split('\n')) {
        const k = b.trim().split(/\s+/);
        const yr = parseInt(k[0]);
        if (isNaN(yr) || yr < 1870) continue;
        for (let m = 0; m < 12; m++) {
            const v = parseFloat(k[m + 1]);
            if (!isNaN(v) && v > -99) hasil.push(v);
        }
    }
    return hasil;
}

// ============================================================
//  KLASIFIKASI
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
    return { status, intensitas, label: intensitas ? `${status} (${intensitas})` : status, singkat: status };
}

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
    return { status, intensitas, label: intensitas ? `${status} (${intensitas})` : status, singkat: status };
}

// ============================================================
//  SST REAL — Open-Meteo Marine API
// ============================================================

/** Baseline klimatologis WOA-approximation berdasarkan lat/lon */
function getBaselineSST(lat, lon) {
    const l = lon < 0 ? lon + 360 : lon;
    let base = 29.0 - Math.abs(lat) * 0.38;
    // Pacific cold tongue (Pasifik ekuatorial timur)
    if (Math.abs(lat) < 6 && l > 210 && l < 280) base -= 1.8;
    // Western Pacific warm pool
    if (Math.abs(lat) < 8 && l > 130 && l < 175) base += 0.5;
    // Samudra Hindia sedikit lebih hangat di equatorial
    if (Math.abs(lat) < 8 && l > 50 && l < 115)  base += 0.3;
    return Math.max(18, base);
}

/** Fetch SST satu titik — dengan cache localStorage per hari */
async function fetchSSTPoint(lat, lon) {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const cacheKey = `sst_${lat}_${lon}_${dateStr}`;
    try {
        const c = localStorage.getItem(cacheKey);
        if (c !== null) return parseFloat(c);
    } catch(e) {}

    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
                `&hourly=sea_surface_temperature&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const vals = (data.hourly?.sea_surface_temperature || []).filter(v => v !== null);
        if (vals.length === 0) throw new Error('No SST data');
        const avg = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
        try { localStorage.setItem(cacheKey, avg); } catch(e) {}
        return avg;
    } finally { clearTimeout(timer); }
}

/** Fetch seluruh grid strategis secara paralel */
async function fetchSSTAnomalyGrid() {
    const results = await Promise.allSettled(
        SST_GRID_POINTS.map(pt => fetchSSTPoint(pt.lat, pt.lon))
    );

    const anomalyPoints = [];
    results.forEach((res, i) => {
        const pt = SST_GRID_POINTS[i];
        if (res.status === 'fulfilled' && res.value !== null) {
            const sst      = res.value;
            const baseline = getBaselineSST(pt.lat, pt.lon);
            anomalyPoints.push({ ...pt, sst, baseline, anomaly: parseFloat((sst - baseline).toFixed(2)) });
        } else {
            // Titik gagal → masuk dengan anomali 0 agar IDW tidak rusak
            anomalyPoints.push({ ...pt, sst: null, baseline: getBaselineSST(pt.lat, pt.lon), anomaly: 0 });
        }
    });

    console.log(`✅ SST grid: ${anomalyPoints.filter(p => p.sst !== null).length}/${SST_GRID_POINTS.length} titik berhasil`);
    return anomalyPoints;
}

/** Jarak Euclidean sederhana (derajat) — cukup untuk skala tropis */
function distDeg(lat1, lon1, lat2, lon2) {
    const dLat = lat1 - lat2, dLon = lon1 - lon2;
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** IDW interpolation (power=2) */
function idwInterpolate(lat, lon, points, power = 2) {
    let wSum = 0, vSum = 0;
    for (const p of points) {
        const d = Math.max(distDeg(lat, lon, p.lat, p.lon), 0.01);
        const w = 1 / Math.pow(d, power);
        wSum += w; vSum += w * p.anomaly;
    }
    return wSum > 0 ? vSum / wSum : 0;
}

/** Rata-rata anomali dalam kotak bounding box */
function rerataDaerah(points, latMin, latMax, lonMin, lonMax) {
    const inBox = points.filter(p => {
        const l = p.lon < 0 ? p.lon + 360 : p.lon;
        const lMin = lonMin < 0 ? lonMin + 360 : lonMin;
        const lMax = lonMax < 0 ? lonMax + 360 : lonMax;
        return p.lat >= latMin && p.lat <= latMax && l >= lMin && l <= lMax;
    });
    if (inBox.length === 0) return null;
    return parseFloat((inBox.reduce((s, p) => s + p.anomaly, 0) / inBox.length).toFixed(2));
}

// ============================================================
//  RENDER PETA SST REAL + INDIKATOR
//  Mengganti grid sintetis (sin/cos) dengan IDW dari data real.
//  Menambahkan kotak indikator berlabel di atas peta.
// ============================================================

/** Color scale — identik dengan Dashboard */
function buatColorScale() {
    const stops = [
        [49,54,149],[69,117,180],[116,173,209],[171,217,233],[224,243,248],
        [255,255,191],[254,224,144],[253,174,97],[244,109,67],[215,48,39],[165,0,38]
    ];
    return (t) => {
        const n = stops.length - 1, idx = t * n;
        const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, n), f = idx - i0;
        const c = stops[i0].map((v, k) => Math.round(v + f * (stops[i1][k] - v)));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
    };
}

/**
 * Render ulang grid peta SVG menggunakan anomali SST real.
 * Harus dipanggil SETELAH d3.js dimuat dan anomalyPoints tersedia.
 */
function renderPetaSSTReal(anomalyPoints) {
    if (typeof d3 === 'undefined') { console.warn('⚠️ D3 belum dimuat, render peta ditunda.'); return; }
    const svgEl = document.getElementById('world-map');
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    // Hapus grid lama, pertahankan daratan
    svg.select('g.sst-grid-real').remove();

    const proj = d3.geoEquirectangular()
        .scale(PROJECTION_CONFIG.scale)
        .translate(PROJECTION_CONFIG.translate)
        .rotate(PROJECTION_CONFIG.rotate);

    // Pastikan filter blur tersedia
    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');
    if (defs.select('#sst-blur-real').empty()) {
        const f = defs.append('filter').attr('id', 'sst-blur-real');
        f.attr('x','-10%').attr('y','-10%').attr('width','120%').attr('height','120%');
        f.append('feGaussianBlur').attr('in','SourceGraphic').attr('stdDeviation','7');
    }

    const colorFn = buatColorScale();
    const step = 2.5;
    // Insert sebelum layer daratan agar daratan tetap di atas
    const gridGroup = svg.insert('g', 'g:last-of-type')
        .attr('class', 'sst-grid-real')
        .style('filter', 'url(#sst-blur-real)');

    for (let lat = -60; lat < 60; lat += step) {
        for (let lon = -180; lon < 180; lon += step) {
            const p1 = proj([lon, lat]);
            const p2 = proj([lon + step, lat + step]);
            if (!p1 || !p2) continue;
            const w = Math.abs(p2[0] - p1[0]);
            if (w > 100) continue;

            const anomaly = anomalyPoints.length > 0
                ? idwInterpolate(lat, lon, anomalyPoints, 2)
                : sstSintetis(lon, lat);

            const t = (Math.max(-4, Math.min(4, anomaly)) + 4) / 8;
            gridGroup.append('rect')
                .attr('x', Math.min(p1[0], p2[0]) - 0.5)
                .attr('y', Math.min(p1[1], p2[1]) - 0.5)
                .attr('width', w + 1)
                .attr('height', Math.abs(p2[1] - p1[1]) + 1)
                .attr('fill', colorFn(t))
                .attr('opacity', 0.95);
        }
    }
    console.log('✅ Peta SST real dirender.');
}

/** Fallback sintetis (hanya dipakai jika semua fetch gagal) */
function sstSintetis(lon, lat) {
    const l = lon < 0 ? lon + 360 : lon;
    let v = (Math.sin(lat * 0.1) * Math.cos(l * 0.05)) * 0.5;
    if (lat > -25 && lat < 25 && l > 140 && l < 290) {
        const r = Math.sqrt(Math.pow(lat/20,2) + Math.pow((l-230)/70,2));
        if (r < 1) v += 3.5 * (1 - r);
    }
    if (lat > -15 && lat < 15 && l > 45 && l < 75) {
        const r = Math.sqrt(Math.pow(lat/15,2) + Math.pow((l-60)/15,2));
        if (r < 1) v += 1.8 * (1 - r);
    }
    if (lat > -15 && lat < 5 && l > 85 && l < 115) {
        const r = Math.sqrt(Math.pow((lat+5)/10,2) + Math.pow((l-100)/15,2));
        if (r < 1) v -= 2.2 * (1 - r);
    }
    return Math.max(-4, Math.min(4, v + (Math.random() * 0.4 - 0.2)));
}

/**
 * Tambahkan kotak indikator berlabel di atas peta SVG.
 * Menampilkan anomali real untuk 3 zona: Niño3.4, IOD Barat, IOD Timur.
 */
function tambahkanIndikatorPeta(anomalyPoints, enso, iod) {
    if (typeof d3 === 'undefined') return;
    const svgEl = document.getElementById('world-map');
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.select('g.sst-indicators').remove();
    const indGroup = svg.append('g').attr('class', 'sst-indicators');

    const proj = d3.geoEquirectangular()
        .scale(PROJECTION_CONFIG.scale)
        .translate(PROJECTION_CONFIG.translate)
        .rotate(PROJECTION_CONFIG.rotate);

    /** Buat satu kotak indikator di posisi lon/lat tengah */
    function buatKotak(label, anomaly, centerLon, centerLat, boxW, boxH) {
        const center = proj([centerLon, centerLat]);
        if (!center) return;

        const cx = center[0], cy = center[1];
        const x = cx - boxW / 2, y = cy - boxH / 2;

        // Warna berdasarkan anomali
        let warna;
        if      (anomaly >= 1.0)  warna = '#c0392b';
        else if (anomaly >= 0.5)  warna = '#e67e22';
        else if (anomaly <= -1.0) warna = '#1a5276';
        else if (anomaly <= -0.5) warna = '#2471a3';
        else                      warna = '#10b981';

        const sign = anomaly > 0 ? '+' : '';
        const nilaiTeks = `${sign}${anomaly.toFixed(2)}°C`;

        // Bingkai
        indGroup.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', boxW).attr('height', boxH)
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', 'rgba(0,0,0,0.72)')
            .attr('stroke', warna).attr('stroke-width', 1.5);

        // Label zona
        indGroup.append('text')
            .attr('x', cx).attr('y', y + 11)
            .attr('text-anchor', 'middle')
            .attr('font-family', '-apple-system, BlinkMacSystemFont, sans-serif')
            .attr('font-size', '7.5').attr('font-weight', '700')
            .attr('fill', warna).attr('letter-spacing', '0.5')
            .text(label);

        // Nilai anomali
        indGroup.append('text')
            .attr('x', cx).attr('y', y + 24)
            .attr('text-anchor', 'middle')
            .attr('font-family', '-apple-system, BlinkMacSystemFont, sans-serif')
            .attr('font-size', '11').attr('font-weight', '800')
            .attr('fill', '#ffffff')
            .text(nilaiTeks);
    }

    // Ambil anomali per zona dari data real
    const nino34Val = enso
        ? enso.oni3Bulan
        : (rerataDaerah(anomalyPoints, -5, 5, -170, -120) ?? 0);

    const iodWestVal = rerataDaerah(anomalyPoints, -10, 10, 50, 70)
        ?? (iod ? iod.dmi3Bulan / 2 : 0);

    const iodEastVal = rerataDaerah(anomalyPoints, -10, 0, 90, 110)
        ?? (iod ? -iod.dmi3Bulan / 2 : 0);

    // Render kotak indikator
    buatKotak('NIÑO 3.4',   nino34Val,  -145,  0,   75, 32);
    buatKotak('IOD BARAT',  iodWestVal,  60,   2,   70, 32);
    buatKotak('IOD TIMUR',  iodEastVal,  100, -4,   70, 32);
}

// ============================================================
//  getENSOAnomaly
// ============================================================
async function getENSOAnomaly() {
    // SUMBER 1: GAS URL identik Dashboard
    try {
        const teks = await fetchText(GAS_ENSO_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Respons GAS ENSO kosong');
        const { dates, values } = parseGASEnso(teks);
        if (values.length === 0) throw new Error('Parser GAS ENSO gagal');

        const latestVal = values[values.length - 1];
        const trailing12 = values.slice(-12);
        const oni3 = parseFloat((trailing12.reduce((a,b)=>a+b,0)/trailing12.length).toFixed(2));

        const STEPS = 13;
        const forecast = holtDampedForecast(values, STEPS, { alpha:0.35, beta:0.15, phi:0.85 });
        const klasif  = klasifikasiENSO(latestVal);

        console.log('✅ ENSO dari GAS (Dashboard) — terkini:', latestVal);
        return {
            labels: buatLabelBulan(4),
            anomalies: forecast.slice(0, 4),
            forecastFull: forecast,
            historis: values,
            dates: dates.slice(-20), slice20: values.slice(-20),
            status: klasif.label, statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas,
            latestAnomaly: latestVal, oni3Bulan: oni3,
            sumber: 'GAS ENSO (Dashboard)'
        };
    } catch (e1) { console.warn('⚠️ GAS ENSO gagal:', e1.message); }

    // SUMBER 2: NOAA ONI via proxy
    try {
        const teks = await fetchViaProxy(NOAA_ONI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA ONI kosong');
        const oniArr = parseONI(teks);
        if (oniArr.length === 0) throw new Error('Parser ONI gagal');
        const latest = oniArr[oniArr.length - 1];
        const oni3   = parseFloat((oniArr.slice(-3).reduce((a,b)=>a+b,0)/3).toFixed(2));
        const forecast = holtDampedForecast(oniArr, 13, { alpha:0.35, beta:0.15, phi:0.85 });
        const klasif   = klasifikasiENSO(oni3);
        console.log('✅ ENSO dari NOAA ONI (cadangan) — terkini:', oni3);
        return {
            labels: buatLabelBulan(4), anomalies: forecast.slice(0,4), forecastFull: forecast,
            historis: oniArr, status: klasif.label, statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas, latestAnomaly: oni3, oni3Bulan: oni3,
            sumber: 'NOAA CPC ONI (cadangan)'
        };
    } catch (e2) { console.warn('⚠️ NOAA ONI gagal:', e2.message); }

    return {
        labels: buatLabelBulan(4), anomalies: [0,0,0,0], forecastFull: new Array(13).fill(0),
        historis: [], status: 'Netral', statusSingkat: 'Netral', intensitas: '',
        latestAnomaly: 0, oni3Bulan: 0, sumber: 'Statis (semua sumber gagal)'
    };
}

// ============================================================
//  getIODAnomaly
// ============================================================
async function getIODAnomaly() {
    // SUMBER 1: GAS URL identik Dashboard
    try {
        const teks = await fetchText(GAS_IOD_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Respons GAS IOD kosong');
        const { labels: dmiLabels, values: dmiValues } = parseGASIod(teks);
        if (dmiValues.length === 0) throw new Error('Parser GAS IOD gagal');

        const latest = dmiValues[dmiValues.length - 1];
        const dmi3   = parseFloat((dmiValues.slice(-3).reduce((a,b)=>a+b,0)/3).toFixed(2));
        const STEPS  = 3;
        const forecast = holtDampedForecast(dmiValues, STEPS, { alpha:0.4, beta:0.15, phi:0.75 });
        const klasif   = klasifikasiIOD(latest);

        console.log('✅ IOD dari GAS (Dashboard) — terkini:', latest);
        return {
            labels: buatLabelBulan(4),
            anomalies: [latest].concat(forecast),
            forecastFull: forecast,
            historis: dmiValues,
            dmiLabels: dmiLabels.slice(-18), slice18: dmiValues.slice(-18),
            status: klasif.label, statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas,
            latestAnomaly: latest, dmi3Bulan: dmi3,
            sumber: 'GAS IOD (Dashboard)'
        };
    } catch (e1) { console.warn('⚠️ GAS IOD gagal:', e1.message); }

    // SUMBER 2: NOAA PSL DMI via proxy
    try {
        const teks = await fetchViaProxy(NOAA_DMI_URL, 12000);
        if (!teks || teks.length < 100) throw new Error('Data NOAA PSL DMI kosong');
        const dmiArr = parseDMI(teks);
        if (dmiArr.length === 0) throw new Error('Parser DMI gagal');
        const latest = dmiArr[dmiArr.length - 1];
        const dmi3   = parseFloat((dmiArr.slice(-3).reduce((a,b)=>a+b,0)/3).toFixed(2));
        const forecast = holtDampedForecast(dmiArr, 3, { alpha:0.4, beta:0.15, phi:0.75 });
        const klasif   = klasifikasiIOD(dmi3);
        console.log('✅ IOD dari NOAA PSL (cadangan) — terkini:', dmi3);
        return {
            labels: buatLabelBulan(4), anomalies: [dmi3].concat(forecast), forecastFull: forecast,
            historis: dmiArr, status: klasif.label, statusSingkat: klasif.singkat,
            intensitas: klasif.intensitas, latestAnomaly: dmi3, dmi3Bulan: dmi3,
            sumber: 'NOAA PSL DMI (cadangan)'
        };
    } catch (e2) { console.warn('⚠️ NOAA PSL gagal:', e2.message); }

    return {
        labels: buatLabelBulan(4), anomalies: [0,0,0,0], forecastFull: [0,0,0],
        historis: [], status: 'Netral', statusSingkat: 'Netral', intensitas: '',
        latestAnomaly: 0, dmi3Bulan: 0, sumber: 'Statis (semua sumber gagal)'
    };
}

// ============================================================
//  updateENSOIODStatus — tampilkan status + sanitizer DOM
// ============================================================
function updateENSOIODStatus(enso, iod) {
    const div = document.getElementById('ensoStatus');
    if (!div) return;

    const warnaEnso = enso.statusSingkat === 'El Niño' ? '#ff4a5a'
        : enso.statusSingkat === 'La Niña' ? '#38b6ff' : '#10b981';
    const warnaIod  = iod.statusSingkat === 'IOD Positif' ? '#f59e0b'
        : iod.statusSingkat === 'IOD Negatif' ? '#38b6ff' : '#10b981';

    div.innerHTML =
        `Pasifik: <span style="color:${warnaEnso};font-weight:700;">${enso.status}</span> ` +
        `<span style="font-size:0.75rem;opacity:0.6;">(ONI: ${enso.oni3Bulan>0?'+':''}${enso.oni3Bulan}°C)</span>` +
        ` &nbsp;|&nbsp; ` +
        `Hindia: <span style="color:${warnaIod};font-weight:700;">${iod.status}</span> ` +
        `<span style="font-size:0.75rem;opacity:0.6;">(DMI: ${iod.dmi3Bulan>0?'+':''}${iod.dmi3Bulan}°C)</span>` +
        `<br><span style="font-size:0.65rem;opacity:0.4;margin-top:4px;display:block;">` +
        `Sumber ENSO: ${enso.sumber||'-'} | Sumber IOD: ${iod.sumber||'-'} | ` +
        `Proyeksi: Holt's Damped Trend | Peta: Open-Meteo Marine API (IDW)</span>`;

    setTimeout(function () {
        if (!iod || iod.latestAnomaly === undefined) return;
        const val = parseFloat(iod.latestAnomaly);
        const target = 'DMI: ' + (val>0?'+':'') + val.toFixed(2) + '°C';
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.includes('DMI:')) {
                node.nodeValue = node.nodeValue.replace(/DMI:\s*[+\-]?[\d.]+°C/g, target);
            }
        }
    }, 150);
}

// ============================================================
//  ENTRI UTAMA PETA — panggil sekali setelah ENSO+IOD selesai
// ============================================================
async function muatPetaSSTReal(enso, iod) {
    try {
        const anomalyPoints = await fetchSSTAnomalyGrid();
        renderPetaSSTReal(anomalyPoints);
        tambahkanIndikatorPeta(anomalyPoints, enso, iod);
    } catch (err) {
        console.warn('⚠️ Peta SST real gagal, tetap sintetis:', err.message);
    }
}

// ── Ekspos ke window ──────────────────────────────────────
window.getENSOAnomaly       = getENSOAnomaly;
window.getIODAnomaly        = getIODAnomaly;
window.updateENSOIODStatus  = updateENSOIODStatus;
window.holtDampedForecast   = holtDampedForecast;
window.muatPetaSSTReal      = muatPetaSSTReal;
window.fetchSSTAnomalyGrid  = fetchSSTAnomalyGrid;
window.tambahkanIndikatorPeta = tambahkanIndikatorPeta;

console.log(
    '%c✅ patch_enso_iod_noaa.js v4.2 aktif — GAS identical, Holt Damped, Peta SST Real (IDW)',
    'color:#38b6ff; font-weight:bold;'
);

})();
