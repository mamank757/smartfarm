/**
 * ============================================================
 *  PATCH: patch_risiko_iklim.js
 *  Versi: 2.0 — Bobot Dinamis Per Zona Per Bulan
 * ------------------------------------------------------------
 *  Menimpa fungsi lama di HTML:
 *    - hitungRisikoDinamis()
 *    - prosesAnalisisKalender() → bagian wetnessScore
 *
 *  Tambahkan fungsi baru:
 *    - tentukanZonaIklim(lat, lon)
 *    - hitungWetnessScore(baseline, ensoVal, iodVal, lat, lon, bulanIndex)
 *
 *  Sumber bobot:
 *    - Aldrian & Susanto (2003), Int. Journal of Climatology
 *    - Nur'utami & Hidayat (2016), Procedia Environmental Sciences
 *    - Boer & Faqih (2004), AIACC Working Paper
 * ============================================================
 */

// ============================================================
//  1. TABEL BOBOT KORELASI PER ZONA PER BULAN
//     Indeks bulan: 0 = Jan, 1 = Feb, ..., 11 = Des
// ============================================================
const BOBOT_IKLIM = {

    /**
     * ZONA MONSUNAL
     * Wilayah: Jawa, Bali, NTB, NTT, Sulawesi Selatan,
     *          Sumatera Selatan, Lampung
     * Karakter: 1 puncak hujan (DJF), 1 puncak kering (JJA)
     * ENSO kuat Jun–Nov, IOD kuat Agu–Okt
     */
    monsunal: {
        enso: [0.15, 0.15, 0.12, 0.10, 0.18, 0.35,
               0.45, 0.50, 0.45, 0.35, 0.20, 0.15],
        iod:  [0.10, 0.10, 0.08, 0.08, 0.12, 0.20,
               0.28, 0.38, 0.40, 0.30, 0.15, 0.10]
    },

    /**
     * ZONA EKUATORIAL
     * Wilayah: Sumatera Barat, Riau, Kalimantan,
     *          Sulawesi Tengah bagian utara
     * Karakter: 2 puncak hujan (MAM & SON)
     * ENSO lemah, IOD lebih dominan (terutama Sep–Okt)
     */
    ekuatorial: {
        enso: [0.10, 0.10, 0.08, 0.08, 0.10, 0.15,
               0.18, 0.20, 0.18, 0.15, 0.10, 0.10],
        iod:  [0.20, 0.18, 0.15, 0.12, 0.15, 0.22,
               0.30, 0.42, 0.48, 0.38, 0.25, 0.20]
    },

    /**
     * ZONA LOKAL
     * Wilayah: Maluku, Papua, Papua Barat
     * Karakter: Tidak beraturan, dipengaruhi sirkulasi lokal
     * ENSO & IOD sama-sama lemah
     */
    lokal: {
        enso: [0.12, 0.12, 0.10, 0.10, 0.12, 0.18,
               0.22, 0.28, 0.25, 0.20, 0.15, 0.12],
        iod:  [0.08, 0.08, 0.08, 0.08, 0.10, 0.12,
               0.15, 0.20, 0.22, 0.18, 0.12, 0.08]
    },

    /**
     * ZONA PERALIHAN
     * Wilayah: Sulawesi Tengah, Sulawesi Tenggara,
     *          Maluku Barat Daya, sebagian NTT pesisir
     * Karakter: Transisi antara monsunal & lokal
     * ENSO sedang, IOD sedang terutama Sep–Okt
     */
    peralihan: {
        enso: [0.12, 0.12, 0.10, 0.10, 0.14, 0.22,
               0.30, 0.35, 0.30, 0.25, 0.16, 0.12],
        iod:  [0.14, 0.12, 0.10, 0.10, 0.12, 0.18,
               0.22, 0.30, 0.33, 0.25, 0.18, 0.14]
    }
};


// ============================================================
//  2. FUNGSI PENENTU ZONA IKLIM BERDASARKAN KOORDINAT GPS
//     Sumber: Aldrian & Susanto (2003)
// ============================================================
function tentukanZonaIklim(lat, lon) {

    // ── Papua & Maluku → Lokal ──────────────────────────────
    // Seluruh wilayah timur Indonesia (lon >= 128°)
    if (lon >= 128) {
        return 'lokal';
    }

    // ── Ekuatorial ──────────────────────────────────────────
    // Sumatera (kecuali ujung selatan) & seluruh Kalimantan
    // Rentang: lat -6°  s/d +6°, lon 95° s/d 119°
    if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) {
        return 'ekuatorial';
    }

    // ── Peralihan ───────────────────────────────────────────
    // Sulawesi Tengah, Sulawesi Tenggara, Maluku bagian barat
    // Rentang: lat -4° s/d +2°, lon 119° s/d 128°
    if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) {
        return 'peralihan';
    }

    // ── Monsunal (default) ──────────────────────────────────
    // Jawa, Bali, NTB, NTT, Sulawesi Selatan,
    // Sumatera Selatan, Lampung
    return 'monsunal';
}


// ============================================================
//  3. FUNGSI UTAMA HITUNG WETNESS SCORE (MENGGANTI FORMULA LAMA)
//
//  Parameter:
//    baselineZOM  — nilai indeks ZOM bulan bersangkutan
//    ensoVal      — anomali ENSO terkini (dari getENSOAnomaly)
//    iodVal       — anomali IOD terkini  (dari getIODAnomaly)
//    lat, lon     — koordinat GPS user
//    bulanIndex   — indeks bulan fase (0=Jan ... 11=Des)
//
//  Return: wetnessScore (float)
//    Negatif  = cenderung kering
//    Nol      = normal
//    Positif  = cenderung basah
// ============================================================
function hitungWetnessScore(baselineZOM, ensoVal, iodVal, lat, lon, bulanIndex) {

    const zona   = tentukanZonaIklim(lat, lon);
    const w_enso = BOBOT_IKLIM[zona].enso[bulanIndex];
    const w_iod  = BOBOT_IKLIM[zona].iod[bulanIndex];

    // Normalisasi total bobot agar ZOM tetap dominan
    // dan jumlah seluruh bobot = 1
    const total = 1 + w_enso + w_iod;

    const score = (baselineZOM / total)
                - (ensoVal * w_enso / total)
                - (iodVal  * w_iod  / total);

    // Log debug — bisa dimatikan di produksi
    console.log(
        `[WetnessScore] Zona: ${zona} | Bulan: ${bulanIndex + 1} | ` +
        `ZOM: ${baselineZOM} | ENSO: ${ensoVal}×${w_enso.toFixed(2)} | ` +
        `IOD: ${iodVal}×${w_iod.toFixed(2)} | Score: ${score.toFixed(3)}`
    );

    return score;
}


// ============================================================
//  4. OVERRIDE hitungRisikoDinamis()
//     Menimpa fungsi lama di HTML yang menggunakan bobot tetap
//
//  Perbedaan utama:
//    LAMA: wetnessScore = baseline - (enso*0.2) - (iod*0.1)
//    BARU: wetnessScore = hitungWetnessScore(...) dengan bobot
//          dinamis per zona per bulan
//
//  Catatan: fungsi ini membutuhkan variabel 'lokasi' yang
//  sudah tersedia di scope prosesAnalisisKalender()
//  Solusi: simpan koordinat ke window._lokasiKalender
//  saat GPS berhasil dibaca
// ============================================================
function hitungRisikoDinamis(bulanIndex, fase, ensoVal, iodVal, baselineData) {

    // Baca koordinat dari cache global yang diset saat GPS dibaca
    const lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
    const lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

    // Ambil baseline bulan ini
    let baselineBulanIni = parseFloat(baselineData[bulanIndex]);

    // Konversi jika data ZOM lokal masih dalam satuan mm
    // (Data pola nasional sudah indeks, tidak perlu konversi)
    if (baselineBulanIni > 10) {
        baselineBulanIni = normalisasiCurahHujan(baselineBulanIni);
    }

    // Hitung wetnessScore dengan bobot dinamis
    const wetnessScore = hitungWetnessScore(
        baselineBulanIni,
        ensoVal,
        iodVal,
        lat,
        lon,
        bulanIndex
    );

    // Klasifikasi kondisi cuaca dari wetnessScore
    let statusCuaca = "";
    if      (wetnessScore <= -1.0) statusCuaca = "Sangat Kering (Ekstrem)";
    else if (wetnessScore <  -0.3) statusCuaca = "Cenderung Kering";
    else if (wetnessScore <=  0.3) statusCuaca = "Normal / Stabil";
    else if (wetnessScore <   1.0) statusCuaca = "Cenderung Basah";
    else                           statusCuaca = "Sangat Basah (Ekstrem)";

    // ── Skor risiko per fase ─────────────────────────────────
    let skor    = 20;
    let masalah = "Aman";

    if (fase === "Tanam") {
        if      (wetnessScore <= -1.0) { skor = 85; masalah = "Tanah retak parah, krisis air olah lahan (Tunda Tanam)."; }
        else if (wetnessScore <  -0.3) { skor = 50; masalah = "Butuh pompanisasi ekstra untuk basahi lahan."; }
        else if (wetnessScore >   1.0) { skor = 65; masalah = "Persemaian berisiko membusuk terendam genangan."; }
        else                           { skor = 20; masalah = "Kondisi air ideal untuk pengolahan & tanam."; }
    }
    else if (fase === "Vegetatif") {
        if      (wetnessScore <= -1.0) { skor = 75; masalah = "Pertumbuhan anakan padi kerdil akibat stres air."; }
        else if (wetnessScore >   1.0) { skor = 60; masalah = "Curah hujan picu ledakan Hawar Pelepah & busuk akar."; }
        else                           { skor = 30; masalah = "Kondisi pertumbuhan anakan produktif normal."; }
    }
    else if (fase === "Generatif") {
        if      (wetnessScore <= -1.0) { skor = 95; masalah = "KRITIS: Padi hampa massal (Puso) akibat kekeringan parah saat bunting!"; }
        else if (wetnessScore <  -0.3) { skor = 60; masalah = "Waspada malai tidak terisi penuh (kekurangan air)."; }
        else if (wetnessScore >   1.0) { skor = 75; masalah = "Hujan lebat melunturkan serbuk sari & memicu Blast."; }
        else                           { skor = 25; masalah = "Kondisi penyerbukan dan pengisian bulir optimal."; }
    }
    else if (fase === "Panen") {
        if      (wetnessScore <= -1.0) { skor = 10; masalah = "Kondisi terik sangat ideal untuk jemur gabah."; }
        else if (wetnessScore <  -0.3) { skor = 20; masalah = "Kondisi pengeringan gabah aman."; }
        else if (wetnessScore >   1.0) { skor = 95; masalah = "KRITIS: Padi rebah, gabah tumbuh di sawah, Combine amblas!"; }
        else if (wetnessScore >   0.3) { skor = 65; masalah = "Hujan mempersulit panen, wajib siapkan mesin Dryer."; }
    }

    return { skor, statusCuaca, masalah };
}


// ============================================================
//  5. OVERRIDE prosesAnalisisKalender()
//     Menimpa fungsi lama di HTML
//     Perbedaan utama:
//       - Simpan koordinat ke window._lokasiKalender
//       - Teruskan ensoVal & iodVal ke hitungRisikoDinamis()
//         (fungsi lama tidak meneruskan nilai ini)
// ============================================================
async function prosesAnalisisKalender() {

    const tglInput = document.getElementById("inputTglTanam").value;
    if (!tglInput) {
        alert("Silakan masukkan tanggal awal tanam terlebih dahulu!");
        return;
    }

    const containerUtama  = document.getElementById("hasilProyeksiIklim");
    const kontainerTeks   = document.getElementById("teksAnalisisFase");
    const judulChart      = containerUtama.querySelector("h4");
    const bungkusChart    = containerUtama.querySelector("div");

    containerUtama.style.display = "block";

    if (!judulChart.dataset.asli) {
        judulChart.dataset.asli = judulChart.innerHTML;
    }

    judulChart.innerHTML = `<div class="animasi-loading-kalender">
        📡 MEMBACA GPS & MENYINKRONKAN...
    </div>`;
    bungkusChart.style.display = "none";
    kontainerTeks.innerHTML    = "";

    try {

        // ── Baca GPS ──────────────────────────────────────────
        const lokasi = await dapatkanLokasiOtomatis();

        // Simpan ke cache global agar hitungRisikoDinamis bisa membaca
        window._lokasiKalender = { lat: lokasi.lat, lon: lokasi.lon };

        // Simpan juga ke lokasiSawah jika belum terisi
        const lokasiSawahEl = document.getElementById('lokasiSawah');
        if (lokasiSawahEl && lokasiSawahEl.innerText === '-') {
            lokasiSawahEl.innerText =
                `${lokasi.lat.toFixed(5)}, ${lokasi.lon.toFixed(5)}`;
        }

        // ── Tarik data iklim & pola hujan sekaligus ───────────
        const [ensoData, iodData, resPola, resZom] = await Promise.all([
            getENSOAnomaly(),
            getIODAnomaly(),
            fetch(URL_POLA_HUJAN),
            fetch(URL_ZOM_LOKAL).catch(() => null)
        ]);

        const dbPola   = await resPola.json();
        let   dataZom  = null;
        if (resZom) dataZom = await resZom.json();

        // Simpan nilai anomali terkini
        const ensoVal = ensoData.latestAnomaly;
        const iodVal  = iodData.latestAnomaly;

        // ── Tentukan baseline ZOM ─────────────────────────────
        let baselineData = [];
        let namaZona     = "";

        let jarakTerdekat = Infinity;
        let kabTerpilih   = null;

        let arrayZom = null;
        if (dataZom && Array.isArray(dataZom.data)) {
            arrayZom = dataZom.data;
        } else if (Array.isArray(dataZom)) {
            arrayZom = dataZom;
        }

        if (arrayZom) {
            arrayZom.forEach(kab => {
                const latKab = parseFloat(kab.lat);
                const lonKab = parseFloat(kab.lon);
                if (!isNaN(latKab) && !isNaN(lonKab)) {
                    const jarak = hitungJarakHaversine(
                        lokasi.lat, lokasi.lon, latKab, lonKab
                    );
                    if (jarak < jarakTerdekat) {
                        jarakTerdekat = jarak;
                        kabTerpilih   = kab;
                    }
                }
            });
        }

        if (kabTerpilih && jarakTerdekat <= 150) {
            // Gunakan ZOM lokal per kabupaten
            namaZona = `WIL. ${kabTerpilih.kabupaten_kota.toUpperCase()} ` +
                       `(${jarakTerdekat.toFixed(1)} km) — ` +
                       `Zona: ${tentukanZonaIklim(lokasi.lat, lokasi.lon).toUpperCase()}`;
            baselineData = [
                parseFloat(kabTerpilih.jan), parseFloat(kabTerpilih.feb),
                parseFloat(kabTerpilih.mar), parseFloat(kabTerpilih.apr),
                parseFloat(kabTerpilih.mei), parseFloat(kabTerpilih.jun),
                parseFloat(kabTerpilih.jul), parseFloat(kabTerpilih.agu),
                parseFloat(kabTerpilih.sep), parseFloat(kabTerpilih.okt),
                parseFloat(kabTerpilih.nov), parseFloat(kabTerpilih.des)
            ];
        } else {
            // Fallback ke pola makro nasional
            const zona = tentukanZonaIklim(lokasi.lat, lokasi.lon);
            const peta = {
                monsunal:   "monsunal",
                ekuatorial: "ekuatorial",
                lokal:      "lokal",
                peralihan:  "peralihan"
            };
            const polaTerpilih = dbPola.find(p =>
                p.pola.toLowerCase().includes(peta[zona])
            ) || dbPola.find(p =>
                p.pola.toLowerCase().includes("monsunal")
            );

            namaZona     = `[FALLBACK] POLA MAKRO — ZONA: ${zona.toUpperCase()}`;
            baselineData = polaTerpilih.baseline;
        }

        // ── Tentukan fase tanam ───────────────────────────────
        const umurPilihan = document.getElementById("umurVarietasKalender").value;

        let offsetVeg = 35, offsetGen = 50, offsetPanen = 110;
        if      (umurPilihan === "genjah") { offsetVeg = 25; offsetGen = 40; offsetPanen = 90;  }
        else if (umurPilihan === "dalam")  { offsetVeg = 40; offsetGen = 60; offsetPanen = 125; }

        const awalTanam   = new Date(tglInput);
        const tglVegetatif = new Date(awalTanam); tglVegetatif.setDate(tglVegetatif.getDate() + offsetVeg);
        const tglGeneratif = new Date(awalTanam); tglGeneratif.setDate(tglGeneratif.getDate() + offsetGen);
        const tglPanen     = new Date(awalTanam); tglPanen.setDate(tglPanen.getDate() + offsetPanen);

        const formatTgl = d => d.toLocaleDateString("id-ID", {
            day: 'numeric', month: 'short'
        });

        const labels = [
            `Tanam\n(${formatTgl(awalTanam)})`,
            `Vegetatif\n(${formatTgl(tglVegetatif)})`,
            `Generatif\n(${formatTgl(tglGeneratif)})`,
            `Panen\n(${formatTgl(tglPanen)})`
        ];

        // ── Hitung risiko tiap fase ───────────────────────────
        // Teruskan ensoVal & iodVal ke fungsi — ini yang berbeda dari versi lama
        const riskTanam = hitungRisikoDinamis(
            awalTanam.getMonth(),   "Tanam",     ensoVal, iodVal, baselineData);
        const riskVeg   = hitungRisikoDinamis(
            tglVegetatif.getMonth(),"Vegetatif", ensoVal, iodVal, baselineData);
        const riskGen   = hitungRisikoDinamis(
            tglGeneratif.getMonth(),"Generatif", ensoVal, iodVal, baselineData);
        const riskPanen = hitungRisikoDinamis(
            tglPanen.getMonth(),    "Panen",     ensoVal, iodVal, baselineData);

        const dataSkor = [
            riskTanam.skor,
            riskVeg.skor,
            riskGen.skor,
            riskPanen.skor
        ];

        // ── Render grafik & teks ──────────────────────────────
        judulChart.innerHTML    = judulChart.dataset.asli;
        bungkusChart.style.display = "block";
        renderKalenderChart(labels, dataSkor);

        // Muat grafik iklim makro & SST lokal
        loadGlobalClimateIndices();

        // Tampilkan zona dan detail risiko per fase
        const zonaLabel = tentukanZonaIklim(lokasi.lat, lokasi.lon).toUpperCase();

        kontainerTeks.innerHTML = `
            <div style="
                text-align:center; font-size:0.8rem;
                margin-bottom:15px; color:var(--accent-kalender);
                border-bottom:1px dashed rgba(255,255,255,0.1);
                padding-bottom:8px;">
                📍 Zona Iklim Terdeteksi: <b>${zonaLabel}</b><br>
                <span style="font-size:0.72rem; color:#64748b;">
                    ${namaZona}
                </span>
            </div>

            <div class="info-box"
                style="border-left-color:${getWarnaRisiko(riskVeg.skor)};">
                <strong>🌱 Vegetatif
                    (${tglVegetatif.toLocaleDateString("id-ID",{month:'long'})})
                </strong><br>
                <span style="color:var(--accent-kalender);
                    font-size:0.75rem; font-weight:bold;">
                    Iklim: ${riskVeg.statusCuaca}
                </span><br>
                <span style="color:#cbd5e1; font-size:0.8rem;">
                    Dampak: ${riskVeg.masalah}
                </span>
            </div>

            <div class="info-box"
                style="border-left-color:${getWarnaRisiko(riskGen.skor)};">
                <strong>🌾 Generatif
                    (${tglGeneratif.toLocaleDateString("id-ID",{month:'long'})})
                </strong><br>
                <span style="color:var(--accent-kalender);
                    font-size:0.75rem; font-weight:bold;">
                    Iklim: ${riskGen.statusCuaca}
                </span><br>
                <span style="color:#cbd5e1; font-size:0.8rem;">
                    Dampak: <b>${riskGen.masalah}</b>
                </span>
            </div>

            <div class="info-box"
                style="border-left-color:${getWarnaRisiko(riskPanen.skor)};">
                <strong>🚜 Panen
                    (${tglPanen.toLocaleDateString("id-ID",{month:'long'})})
                </strong><br>
                <span style="color:var(--accent-kalender);
                    font-size:0.75rem; font-weight:bold;">
                    Iklim: ${riskPanen.statusCuaca}
                </span><br>
                <span style="color:#cbd5e1; font-size:0.8rem;">
                    Dampak: ${riskPanen.masalah}
                </span>
            </div>

            <div style="
                margin-top:12px; padding:10px 12px;
                background:rgba(255,255,255,0.02);
                border-radius:10px; border:1px solid rgba(255,255,255,0.05);
                font-size:0.72rem; color:#64748b; line-height:1.6;">
                📚 <strong style="color:#94a3b8;">Sumber Bobot:</strong>
                Aldrian &amp; Susanto (2003) •
                Nur'utami &amp; Hidayat (2016) •
                Boer &amp; Faqih (2004)
            </div>
        `;

    } catch (errorMesej) {
        console.error("[patch_risiko_iklim]", errorMesej);
        alert("Gagal Membaca Lokasi!\n\n" + errorMesej);

        judulChart.innerHTML       = judulChart.dataset.asli;
        bungkusChart.style.display = "none";

        kontainerTeks.innerHTML = `
            <div class="info-box"
                style="border-left-color:var(--red-alert); text-align:center;">
                <strong>⚠️ Akses Lokasi Ditolak / Gagal</strong><br>
                <span style="font-size:0.85rem; color:#cbd5e1;">
                    Aplikasi memerlukan koordinat GPS untuk menganalisis
                    ancaman iklim spesifik di hamparan lahanmu.
                    Coba muat ulang halaman.
                </span>
            </div>`;
    }
}


// ============================================================
//  6. KONFIRMASI PATCH AKTIF DI KONSOL
// ============================================================
console.log(
    "%c✅ patch_risiko_iklim.js aktif — Bobot Dinamis Per Zona Per Bulan",
    "color:#d946ef; font-weight:bold;"
);
