/**
 * ============================================================
 *  patch_skor_6faktor_v1.js
 *  Integrasi 6 Faktor Iklim — RISIKO IKLIM & KALENDER TNM
 * ============================================================
 *
 *  FAKTOR & PROPORSI IDEAL (sesuai tabel metodologi):
 *  ┌─────────────────┬──────────────┬──────────────────────────────────────────┐
 *  │ Faktor          │ Bobot        │ Peran                                    │
 *  ├─────────────────┼──────────────┼──────────────────────────────────────────┤
 *  │ ENSO            │ 25%–30%      │ Tren iklim makro tahunan                 │
 *  │ SST Lokal       │ 15%–20%      │ Ketersediaan uap air lokal (moisture)   │
 *  │ IOD             │ 15%–20%      │ Tren aliran udara regional timur-barat   │
 *  │ ZOM             │ 15%–20%      │ Karakteristik dasar/klimatologi daratan  │
 *  │ MJO             │ 10%          │ Pemicu hujan jangka pendek (intramusiman)│
 *  │ Fase Bulan      │  5%          │ Pasang surut mikroklimat                 │
 *  └─────────────────┴──────────────┴──────────────────────────────────────────┘
 *
 *  CARA PASANG:
 *    Letakkan SETELAH semua patch yang sudah ada di index.html:
 *      <script src="patch_skor_6faktor_v1.js"></script>
 *
 *  CARA KERJA:
 *    1. Override hitungRisikoDinamis() — menambah SST, MJO, Bulan ke skor risiko
 *    2. Override rekomendasiWindowTanam() — skor kalender juga pakai 6 faktor
 *    3. Semua override pakai guard & IIFE, tidak konflik dengan patch sebelumnya
 *
 *  DEPENDENSI (harus sudah dimuat sebelum file ini):
 *    - patch_risiko_iklim.js          → hitungWetnessScore(), hitungRisikoDinamis()
 *    - patch_enso_iod_noaa.js         → window.getENSOAnomaly(), window.getIODAnomaly()
 *    - patch_iklim_terpadu_v1.js      → window._deteksiPerairan(), getFallbackSST()
 *    - patch_jadwal_tanam_otomatis.js → window.rekomendasiWindowTanam()
 *    - patch_zom_kalibrasi_v2.js      → window.deteksiZonaIklim()
 *    - patch_mjo_bom_v1.js            → window.mjoData, window.hitungDampakMJOLokal() ← BARU
 * ============================================================
 */

(function () {
    'use strict';

    // Guard double-load
    if (window.__skor6FaktorV1Aktif) {
        console.warn('[patch_skor_6faktor_v1] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 0 — BOBOT RESMI 6 FAKTOR
    //  Nilai tengah dari rentang proporsi ideal di tabel
    // ============================================================
    var BOBOT_6F = {
        enso:   0.40,   // 25%–30% → nilai tengah 27%
        sst:    0.15,   // 15%–20% → nilai tengah 18%
        iod:    0.15,   // 15%–20% → nilai tengah 17%
        zom:    0.15,   // 15%–20% → nilai tengah 18%
        mjo:    0.10,   // 10%     → tetap 10%
        bulan:  0.05,   // 5%      → tetap 5%
        // Cek: 0.27+0.18+0.17+0.18+0.10+0.05 = 0.95
        // Sisa 0.05 didistribusi ke enso+sst agar total = 1.00
    };

    // Normalisasi agar total = 1.0 (tidak bergantung rounding)
    (function normalisasi() {
        var total = 0;
        var keys  = Object.keys(BOBOT_6F);
        keys.forEach(function (k) { total += BOBOT_6F[k]; });
        keys.forEach(function (k) { BOBOT_6F[k] = BOBOT_6F[k] / total; });
    })();

    // ============================================================
    //  BAGIAN 1 — FASE MJO (Madden-Julian Oscillation)
    //  Sumber: BMKG / NOAA real-time MJO index (faseRMM1/RMM2)
    //
    //  Karena data MJO real-time memerlukan endpoint API khusus,
    //  implementasi ini menggunakan dua pendekatan:
    //    A. Jika window.mjoFase tersedia (dari patch lain) → pakai
    //    B. Estimasi berdasarkan bulan & ENSO (pendekatan ilmiah)
    //
    //  Referensi fase MJO → dampak CH Indonesia:
    //    Fase 1-2  (Samudra Hindia Barat)  → KERING di Indonesia barat
    //    Fase 3-4  (Samudra Hindia Timur)  → BASAH  di Sumatera & Jawa
    //    Fase 5-6  (Pasifik Barat)          → SANGAT BASAH di Sulawesi & Kalimantan
    //    Fase 7-8  (Pasifik Tengah-Timur)  → KERING di sebagian besar Indonesia
    //  Sumber: Wheeler & Hendon (2004); Peatman et al. (2014)
    // ============================================================

    /**
     * Estimasi dampak MJO terhadap CH lokal.
     * Mengembalikan nilai -1.0 (sangat kering) s/d +1.0 (sangat basah).
     * @param {number} lat   - Lintang lokasi
     * @param {number} lon   - Bujur lokasi
     * @param {number} bulan - Index bulan (0=Jan..11=Des)
     * @param {number} enso  - Nilai ONI ENSO saat ini
     * @returns {number} dampakMJO antara -1.0 dan +1.0
     */
    function estimasiDampakMJO(lat, lon, bulan, enso) {

        // A. Gunakan data MJO real-time jika tersedia dari patch lain
        if (window.mjoFase && typeof window.mjoFase === 'number') {
            var fase = Math.round(window.mjoFase); // 1–8
            var amp  = window.mjoAmplitudo || 0;

            // Hanya signifikan jika amplitudo > 1.0
            if (amp < 1.0) return 0;

            // Peta fase → dampak per wilayah
            var dampakPerFase = {
                // Sumatera (lon 95-106)
                sumatera:  [0.2, 0.5, 0.8, 0.6, -0.3, -0.6, -0.8, -0.4],
                // Jawa (lon 106-115, lat <-5.5)
                jawa:      [0.0, 0.3, 0.7, 0.8,  0.2, -0.4, -0.7, -0.3],
                // Sulawesi & Kalimantan (lon 108-125, lat > -4)
                sulawesi:  [-0.3, -0.2, 0.2, 0.5, 0.8, 0.7, -0.2, -0.5],
                // Nusa Tenggara & Timur (lat < -7, lon > 118)
                nusra:     [-0.4, -0.1, 0.3, 0.4, 0.5, 0.2, -0.4, -0.7]
            };

            var wilayah;
            if (lon >= 95 && lon < 106) {
                wilayah = 'sumatera';
            } else if (lat < -5.5 && lon >= 106 && lon <= 115) {
                wilayah = 'jawa';
            } else if (lat < -7 && lon > 118) {
                wilayah = 'nusra';
            } else {
                wilayah = 'sulawesi';
            }

            var idx   = Math.max(0, Math.min(7, fase - 1));
            var faktor = dampakPerFase[wilayah][idx];

            // Skalakan dengan amplitudo (amplitudo 1.0 → faktor penuh)
            return Math.max(-1, Math.min(1, faktor * Math.min(amp, 2.5) / 1.5));
        }

        // B. Estimasi statistik berbasis bulan + ENSO
        //    Probabilitas MJO aktif meningkat saat La Niña,
        //    melemah saat El Niño kuat. (Hendon et al., 2007)
        var aktivitasMJO = 0;

        // Bulan November–April: MJO lebih aktif (boreal winter MJO)
        var bulanAktif = [10, 11, 0, 1, 2, 3]; // Nov–Apr
        var faktorMusim = bulanAktif.indexOf(bulan) >= 0 ? 0.6 : 0.3;

        // La Niña memperkuat MJO, El Niño melemahkan
        var faktorEnso = enso < -0.5 ? 1.3 : (enso > 1.0 ? 0.6 : 1.0);

        // Dampak estimasi: 0 = netral (kita tidak tahu fase aktualnya)
        // Hanya kita tambahkan noise kecil sebagai penanda "tidak pasti"
        aktivitasMJO = faktorMusim * faktorEnso;

        // Kembalikan 0 karena tanpa data real-time fase tidak bisa
        // memberikan arah (+/-). Dampak aktual dievaluasi dari data
        // ENSO & IOD yang lebih bisa diandalkan tanpa data fase.
        // Ini menjaga integritas skor — tidak ada bias fiktif.
        return 0;
    }

    /**
     * Ambil dampak MJO dari data BOM real-time (patch_mjo_bom_v1.js).
     *
     * Prioritas:
     *   1. window.hitungDampakMJOLokal() — fungsi dari patch_mjo_bom_v1 (data BOM nyata)
     *   2. window.mjoData               — cache yang sudah ada
     *   3. estimasiDampakMJO()          — fallback statistik (nilai 0 jika tanpa data)
     */
    function getDampakMJO(lat, lon, bulan, enso) {

        // Prioritas 1: Gunakan fungsi BOM jika sudah dimuat
        if (typeof window.hitungDampakMJOLokal === 'function' && window.mjoData && window.mjoData.fase) {
            var dampakBOM = window.hitungDampakMJOLokal(
                lat, lon,
                window.mjoData.fase,
                window.mjoData.amplitudo || 0
            );
            return dampakBOM;
        }

        // Prioritas 2: Gunakan cache mjoData langsung jika ada
        if (window.mjoData && window.mjoData.fase) {
            var fase = window.mjoData.fase;
            var amp  = window.mjoData.amplitudo || 0;
            window.mjoFase      = fase;
            window.mjoAmplitudo = amp;
            return estimasiDampakMJO(lat, lon, bulan, enso);
        }

        // Prioritas 3: Estimasi statistik (0 = netral, tanpa data nyata)
        return estimasiDampakMJO(lat, lon, bulan, enso);
    }

    // ============================================================
    //  BAGIAN 2 — FASE BULAN (Moon Phase)
    //  Dampak terhadap mikroklimat — riset Peatman et al. (2014)
    //  dan Kohyama & Wallace (2016):
    //    Bulan Mati (fase ≈0–2)    → Konveksi lebih kuat malam hari → +CH
    //    Bulan Penuh (fase ≈14–16) → Konveksi lebih lemah → -CH
    //    Dampak kecil ≈ ±2–5% pada curah hujan harian
    // ============================================================

    var EPOCH_BULAN_BARU_6F = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS_6F   = 29.53059;

    function hariFaseBulan6F(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU_6F.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS_6F) + SIKLUS_SINODIS_6F) % SIKLUS_SINODIS_6F;
    }

    /**
     * Dampak fase bulan terhadap CH.
     * @returns {number} antara -0.3 (bulan penuh, sedikit kurangi CH)
     *                   dan +0.3  (bulan mati, sedikit tambah CH)
     */
    function getDampakFaseBulan(tgl) {
        tgl = tgl || new Date();
        var fase = hariFaseBulan6F(tgl);

        // Bulan mati (0–3): konveksi lebih kuat → potensi CH sedikit lebih tinggi
        if (fase <= 3) return 0.25;
        // Bulan sabit muda (3–7): mendekati normal
        if (fase <= 7) return 0.10;
        // Kuartal pertama (7–9)
        if (fase <= 9) return 0.00;
        // Cembung menuju penuh (9–14): CH cenderung sedikit lebih rendah
        if (fase <= 14) return -0.10;
        // Bulan penuh (14–17): konveksi lebih lemah
        if (fase <= 17) return -0.25;
        // Cembung setelah penuh (17–22)
        if (fase <= 22) return -0.10;
        // Kuartal ketiga (22–24)
        if (fase <= 24) return 0.00;
        // Sabit tua menuju mati baru (24–29.5)
        return 0.20;
    }

    // ============================================================
    //  BAGIAN 3 — SST LOKAL (Anomali Suhu Permukaan Laut Lokal)
    //  Ambil dari window._lokasiKalender dan getFallbackSST
    //  yang sudah diisi oleh patch_iklim_terpadu_v1.js
    // ============================================================

    /**
     * Estimasi anomali SST lokal relatif terhadap baseline klimatologi.
     * Nilai positif → SST lebih hangat dari normal → lebih banyak uap air → +CH
     * @param {number} lat    - Lintang
     * @param {number} lon    - Bujur
     * @param {number} bulan  - Index bulan (0=Jan..11=Des)
     * @returns {number} anomali SST dalam °C (perkiraan, −2 s/d +2)
     */
    function getAnomaliSSTLokal(lat, lon, bulan) {
        // Gunakan data SST terkini dari patch_iklim_terpadu_v1 jika ada
        if (window._sstLokalTerkini && typeof window._sstLokalTerkini === 'number') {
            var baseline = getBaselineSST(lat, lon, bulan);
            return Math.max(-2, Math.min(2, window._sstLokalTerkini - baseline));
        }

        // Cek dari data ENSO sebagai proxy SST lokal
        // (SST lokal Indonesia berkorelasi moderat dengan ENSO)
        var enso = 0;
        if (window._ensoDataTerkini && window._ensoDataTerkini.latestAnomaly !== undefined) {
            enso = parseFloat(window._ensoDataTerkini.latestAnomaly) || 0;
        }

        // SST lokal dipengaruhi ENSO secara terbalik di Indonesia:
        // El Niño (ENSO+) → SST lokal cenderung LEBIH DINGIN (kurang uap air)
        // La Niña (ENSO-) → SST lokal cenderung LEBIH HANGAT (lebih banyak uap)
        // Faktor korelasi rata-rata Indonesia: ~0.3–0.5 (Hendon et al., 2012)
        var korelasiEnsoSst = 0.35;
        return Math.max(-1.5, Math.min(1.5, -enso * korelasiEnsoSst));
    }

    /**
     * Baseline SST klimatologi berdasarkan posisi GPS.
     * Disederhanakan dari tabel ZONA_PERAIRAN di patch_iklim_terpadu_v1.js
     */
    function getBaselineSST(lat, lon, bulan) {
        // Gunakan getFallbackSST dari patch_iklim_terpadu_v1 jika tersedia
        if (typeof window.getFallbackSST === 'function') {
            var hasilFallback = window.getFallbackSST(lat, lon, bulan);
            if (hasilFallback && hasilFallback.sst1) return hasilFallback.sst1;
        }

        // Fallback sederhana: rata-rata SST Indonesia 28–29°C
        var baseline = [29.0, 29.0, 29.0, 29.2, 29.2, 28.5,
                        28.0, 27.8, 28.0, 28.5, 29.0, 29.2];
        return baseline[bulan] || 28.8;
    }

    // ============================================================
    //  BAGIAN 4 — SKOR TERPADU 6 FAKTOR
    //  Fungsi inti: mengubah 6 sinyal menjadi satu angka risiko
    // ============================================================

    /**
     * Hitung skor risiko 6 faktor dalam skala -1.0 s/d +1.0
     * Nilai negatif = cenderung kering, positif = cenderung basah.
     *
     * @param {number} ensoVal   - ONI ENSO (-3 s/d +3)
     * @param {number} iodVal    - DMI IOD  (-2 s/d +2)
     * @param {number} zomVal    - Nilai ZOM ternormalisasi (-1 s/d +1)
     * @param {number} sstAnom   - Anomali SST lokal (-2 s/d +2)
     * @param {number} mjoVal    - Dampak MJO (-1 s/d +1)
     * @param {number} bulanVal  - Dampak fase bulan (-0.3 s/d +0.3)
     * @returns {number} skor antara -3.0 s/d +3.0 (sebelum klipping)
     */
    function hitungSkor6Faktor(ensoVal, iodVal, zomVal, sstAnom, mjoVal, bulanVal) {
        // Normalisasi setiap faktor ke skala -1 s/d +1
        var normEnso  = Math.max(-1, Math.min(1, ensoVal / 1.5));   // ONI ±1.5 = ekstrem
        var normIod   = Math.max(-1, Math.min(1, iodVal  / 1.0));   // DMI ±1.0 = moderat
        var normZom   = Math.max(-1, Math.min(1, zomVal));           // sudah -1 s/d +1
        var normSst   = Math.max(-1, Math.min(1, sstAnom / 1.0));   // ±1°C = signifikan
        var normMjo   = Math.max(-1, Math.min(1, mjoVal));           // sudah -1 s/d +1
        var normBulan = Math.max(-1, Math.min(1, bulanVal / 0.3));   // ±0.3 = rentang penuh

        // ENSO: nilai positif = El Niño = kering di Indonesia → tanda NEGATIF (kurangi CH)
        // (konvensi: nilai positif dari faktor ini berarti lebih basah)
        var skorENSO  = -normEnso;   // El Niño (+) → kering (-)
        var skorIOD   = -normIod;    // IOD+ (+)    → kering (-) untuk sebagian besar Indonesia
        var skorZOM   = normZom;     // ZOM basah (+) → basah (+)
        var skorSST   = normSst;     // SST hangat (+) → lebih lembap → basah (+)
        var skorMJO   = normMjo;     // Sesuai estimasi per fase/wilayah
        var skorBulan = normBulan;   // Bulan mati (+) → sedikit lebih basah

        var skorTotal = (skorENSO  * BOBOT_6F.enso)  +
                        (skorSST   * BOBOT_6F.sst)   +
                        (skorIOD   * BOBOT_6F.iod)   +
                        (skorZOM   * BOBOT_6F.zom)   +
                        (skorMJO   * BOBOT_6F.mjo)   +
                        (skorBulan * BOBOT_6F.bulan);

        return Math.max(-1, Math.min(1, skorTotal));
    }

    // ============================================================
    //  BAGIAN 5 — OVERRIDE hitungRisikoDinamis() (VERSI SOFT PATCH)
    //  Menjaga 100% teks dan sensitivitas V2, hanya menambah bobot 6F
    // ============================================================

    if (typeof window.hitungRisikoDinamis === 'function') {
        window._hitungRisikoAsli6F = window.hitungRisikoDinamis;
    }

    window.hitungRisikoDinamis = function (bulanIndex, fase, ensoVal, iodVal, baselineData) {
        // 1. Eksekusi mesin V2 yang sudah akurat sebagai Baseline
        var hasilV2 = window._hitungRisikoAsli6F 
            ? window._hitungRisikoAsli6F(bulanIndex, fase, ensoVal, iodVal, baselineData)
            : { skor: 15, statusCuaca: 'Normal', masalah: 'Kondisi normal.', tipeBahaya: 'aman' };

        // 2. Tarik data 6 Faktor tambahan (SST, MJO, Bulan)
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        var sstAnom = getAnomaliSSTLokal(lat, lon, bulanIndex);
        var mjoVal  = getDampakMJO(lat, lon, bulanIndex, ensoVal);
        
        var tglBulanTengah = new Date();
        tglBulanTengah.setMonth(bulanIndex);
        tglBulanTengah.setDate(15);
        var bulanVal = getDampakFaseBulan(tglBulanTengah);

        var baselineBulanIni = parseFloat(baselineData[bulanIndex]);
        var zomNorm = Math.max(-1, Math.min(1, (baselineBulanIni / 200)));
        
        var skor6F = hitungSkor6Faktor(ensoVal, iodVal, zomNorm, sstAnom, mjoVal, bulanVal);

        // 3. INJEKSI LEMBUT (SOFT MODIFIER)
        // skor6F berkisar -1.0 (kering) s/d +1.0 (basah)
        // Kita jadikan penggeser poin maksimal hanya ±12 poin.
        // Ini menjaga grafik V2 tetap dominan, tapi sedikit bereaksi terhadap SST/MJO
        var poinGeser = skor6F * 12; 

        if (hasilV2.tipeBahaya === 'kekeringan') {
            // Jika V2 bilang kering, tapi skor 6F basah (+), turunkan tingkat bahayanya
            hasilV2.skor -= poinGeser; 
        } else if (hasilV2.tipeBahaya === 'banjir') {
            // Jika V2 bilang banjir, dan skor 6F basah (+), naikkan bahayanya
            hasilV2.skor += poinGeser;
        } else {
            // Jika aman, geser sedikit saja menjauhi 0
            hasilV2.skor += Math.abs(poinGeser) * 0.4;
        }

        // Pastikan skor akhir tidak jebol dari 0-100
        hasilV2.skor = Math.round(Math.max(0, Math.min(100, hasilV2.skor)));

        // 4. Tambahkan catatan kecil jika ada pengaruh ekstrem dari SST/MJO
        var ekstraTeks = [];
        if (Math.abs(sstAnom) > 0.6) ekstraTeks.push(sstAnom > 0 ? "SST lokal hangat" : "SST lokal dingin");
        if (Math.abs(mjoVal) > 0.4) ekstraTeks.push("aktivitas MJO");
        
        if (ekstraTeks.length > 0) {
            hasilV2.masalah += " (Dipengaruhi ekstra oleh " + ekstraTeks.join(" & ") + ").";
        }

        // 5. Oper data untuk UI Panel 6 Faktor
        hasilV2.detail6F = {
            enso: ensoVal, iod: iodVal, zom: zomNorm.toFixed(3),
            sst: sstAnom.toFixed(3), mjo: mjoVal.toFixed(3), bulan: bulanVal.toFixed(3),
            skor6F: skor6F.toFixed(4)
        };

        // Kembalikan objek utuh ke grafik V2
        return hasilV2;
    };
    // ============================================================
    //  BAGIAN 6 — OVERRIDE rekomendasiWindowTanam()
    //  Menyuntikkan 6 faktor ke penilaian kandidat bulan tanam
    // ============================================================

    function injeksiKalenderTanam() {
        if (typeof window.rekomendasiWindowTanam !== 'function') {
            // Patch jadwal_tanam_otomatis belum dimuat, coba lagi
            setTimeout(injeksiKalenderTanam, 300);
            return;
        }

        // Simpan versi sebelumnya
        var _asliKalender = window.rekomendasiWindowTanam;

        /**
         * Wrapper: setelah hasil rekomendasi asli dihitung,
         * sesuaikan nilaiTotal dengan skor 6 faktor per bulan.
         */
        window.rekomendasiWindowTanam = function (skorBulan, rawZOM, zona, ensoVal, iodVal) {
            // Dapatkan hasil dari versi V2 sebelumnya
            var hasil = _asliKalender.call(this, skorBulan, rawZOM, zona, ensoVal, iodVal);

            if (!Array.isArray(hasil)) return hasil;

            var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
            var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

            hasil.forEach(function (item) {
                var bTanam = item.bTanam;
                if (bTanam === undefined || bTanam === null) return;

                var bTanamIdx = typeof bTanam === 'number' ? bTanam : 0;

                // Hitung skor 6 faktor untuk bulan tanam
                var zomNorm = Math.max(-1, Math.min(1, (rawZOM[bTanamIdx] || 0) / 200));
                var sstAnom = getAnomaliSSTLokal(lat, lon, bTanamIdx);
                var mjoVal  = getDampakMJO(lat, lon, bTanamIdx, ensoVal || 0);

                var tglTanam6F = new Date();
                tglTanam6F.setMonth(bTanamIdx);
                tglTanam6F.setDate(15);
                var bulanVal = getDampakFaseBulan(tglTanam6F);

                var skor6F = hitungSkor6Faktor(
                    ensoVal || 0,
                    iodVal  || 0,
                    zomNorm,
                    sstAnom,
                    mjoVal,
                    bulanVal
                );

                // ── MODIFIER HALUS JADWAL TANAM ──
                // Menghitung bonus/penalti nilai window tanam secara proporsional
                var bonusPenalti = 0;
                
                // Gunakan estimasi kecenderungan air (skor6F > 0 artinya basah/banyak air)
                if (skor6F > 0) {
                    // Jika iklim cenderung basah, berikan sedikit bonus ketersediaan air (maks +8)
                    bonusPenalti = Math.round(skor6F * 8);
                } else {
                    // Jika iklim cenderung kering, kurangi nilai kelayakan tanam secara halus (min -10)
                    bonusPenalti = Math.round(skor6F * 10);
                }

                if (typeof item.nilaiTotal === 'number') {
                    item.nilaiTotal = Math.max(0, Math.min(100, item.nilaiTotal + bonusPenalti));
                }

                // Tambahkan info pembacaan 6 faktor ke keterangan UI alasan
                var labelSST  = sstAnom > 0.3 ? '🌊SST hangat (+' + sstAnom.toFixed(1) + '°C)'
                              : sstAnom < -0.3 ? '🌊SST dingin (' + sstAnom.toFixed(1) + '°C)'
                              : '🌊SST normal';

                var labelMJO  = mjoVal > 0.2  ? '🌀MJO aktif (+)'
                              : mjoVal < -0.2 ? '🌀MJO aktif (-)'
                              : '';

                var labelBulan = bulanVal > 0.1  ? '🌑Fase Bulan Mati (favorable)'
                               : bulanVal < -0.1 ? '🌕Fase Bulan Penuh'
                               : '';

                var tagInfo = [labelSST];
                if (labelMJO)   tagInfo.push(labelMJO);
                if (labelBulan) tagInfo.push(labelBulan);

                if (item.alasan && tagInfo.length > 0) {
                    item.alasan = item.alasan + '\n📊 Faktor tambahan: ' + tagInfo.join(' · ');
                }
            });

            // Urutkan kembali berdasarkan nilai kelayakan akhir yang sudah disesuaikan lembut
            hasil.sort(function (a, b) {
                return (b.nilaiTotal || 0) - (a.nilaiTotal || 0);
            });

            return hasil;
        };

        console.log('%c✅ [6F] rekomendasiWindowTanam ter-override dengan 6 faktor', 'color:#d946ef;font-weight:bold;');
    }

    // ============================================================
    //  BAGIAN 7 — UI PANEL DETAIL 6 FAKTOR
    //  Menampilkan breakdown faktor saat mode RISIKO IKLIM aktif
    // ============================================================

    function injeksiPanelDebug6F() {
        // Hanya inject jika panel kalender atau risiko sudah ada
        var boxKalender = document.getElementById('boxKalender');
        if (!boxKalender) return;

        var panelAda = document.getElementById('panel6FaktorDebug');
        if (panelAda) return;

        var panel = document.createElement('div');
        panel.id = 'panel6FaktorDebug';
        panel.style.cssText = [
            'display:none;',
            'margin-top:16px;',
            'background:rgba(217,70,239,0.06);',
            'border:1px solid rgba(217,70,239,0.2);',
            'border-left:4px solid #d946ef;',
            'border-radius:14px;',
            'padding:14px 16px;',
            'font-size:0.75rem;',
            'color:#cbd5e1;',
            'line-height:1.7;'
        ].join('');
        panel.innerHTML =
            '<strong style="color:#d946ef;display:block;margin-bottom:8px;font-size:0.8rem;">' +
                '📊 KONTRIBUSI 6 FAKTOR IKLIM' +
            '</strong>' +
            '<div id="isi6FaktorDebug">Klik "Analisis" untuk memuat data...</div>';

        boxKalender.parentNode.insertBefore(panel, boxKalender.nextSibling);
    }

    /**
     * Perbarui panel 6 faktor dengan data terkini.
     * Dipanggil oleh prosesJadwalOtomatis setelah data ENSO/IOD tersedia.
     */
    window.perbarui6FaktorPanel = function (ensoData, iodData) {
        var panel = document.getElementById('panel6FaktorDebug');
        var isi   = document.getElementById('isi6FaktorDebug');
        if (!panel || !isi) return;

        var lat     = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        var lon     = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;
        var bulanNow = new Date().getMonth();

        var ensoVal = (ensoData && ensoData.latestAnomaly) ? parseFloat(ensoData.latestAnomaly) : 0;
        var iodVal  = (iodData  && iodData.latestAnomaly)  ? parseFloat(iodData.latestAnomaly)  : 0;

        // Simpan untuk dipakai getAnomaliSSTLokal
        window._ensoDataTerkini = ensoData;

        var sstAnom = getAnomaliSSTLokal(lat, lon, bulanNow);
        var mjoVal  = getDampakMJO(lat, lon, bulanNow, ensoVal);
        var bulanVal = getDampakFaseBulan(new Date());
        var zomNorm = 0; // ZOM tidak tersedia di sini, gunakan 0 (netral)

        var skor6F = hitungSkor6Faktor(ensoVal, iodVal, zomNorm, sstAnom, mjoVal, bulanVal);

        function barFaktor(label, nilai, bobot, satuan) {
            var persen    = Math.round(bobot * 100);
            var arah      = nilai > 0 ? '+' : '';
            var warna     = nilai > 0.1 ? '#10b981' : (nilai < -0.1 ? '#ef4444' : '#64748b');
            var lebar     = Math.min(100, Math.abs(nilai) * 100);
            var satuanStr = satuan || '';
            return (
                '<div style="margin-bottom:6px;">' +
                    '<span style="display:inline-block;width:100px;font-weight:600;">' + label + '</span>' +
                    '<span style="color:' + warna + ';font-weight:700;">' + arah + nilai.toFixed(2) + satuanStr + '</span>' +
                    '<span style="opacity:0.5;font-size:0.7rem;margin-left:6px;">(bobot ' + persen + '%)</span>' +
                    '<div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:3px;">' +
                        '<div style="height:4px;width:' + lebar + '%;background:' + warna + ';border-radius:2px;transition:width 0.4s;"></div>' +
                    '</div>' +
                '</div>'
            );
        }

        var labelSkor = skor6F > 0.3 ? '🌧️ Cenderung BASAH'
                      : skor6F < -0.3 ? '☀️ Cenderung KERING'
                      : '⚖️ NETRAL';
        var warnaSkor = skor6F > 0.3 ? '#38b6ff' : (skor6F < -0.3 ? '#f59e0b' : '#10b981');

        isi.innerHTML =
            barFaktor('🌏 ENSO',     -ensoVal,  BOBOT_6F.enso,  '°C (ONI)') +
            barFaktor('🌊 SST Lokal', sstAnom,  BOBOT_6F.sst,   '°C (anom)') +
            barFaktor('🌤️ IOD',      -iodVal,   BOBOT_6F.iod,   '°C (DMI)') +
            barFaktor('🗺️ ZOM',       zomNorm,  BOBOT_6F.zom,   ' (normed)') +
            barFaktor('🌀 MJO',       mjoVal,   BOBOT_6F.mjo,   ' (fase)') +
            barFaktor('🌙 Fase Bulan', bulanVal, BOBOT_6F.bulan, '') +
            '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);">' +
                '<span style="font-weight:700;color:' + warnaSkor + ';">' +
                    'Skor Terpadu: ' + (skor6F > 0 ? '+' : '') + skor6F.toFixed(3) +
                    ' → ' + labelSkor +
                '</span>' +
                '<div style="opacity:0.45;font-size:0.65rem;margin-top:4px;">' +
                    'Bobot: ENSO ' + Math.round(BOBOT_6F.enso*100) + '% | ' +
                    'SST '   + Math.round(BOBOT_6F.sst*100)  + '% | ' +
                    'IOD '   + Math.round(BOBOT_6F.iod*100)  + '% | ' +
                    'ZOM '   + Math.round(BOBOT_6F.zom*100)  + '% | ' +
                    'MJO '   + Math.round(BOBOT_6F.mjo*100)  + '% | ' +
                    'Bulan ' + Math.round(BOBOT_6F.bulan*100) + '%' +
                '</div>' +
                '<div style="opacity:0.35;font-size:0.6rem;margin-top:2px;">' +
                    'Sumber: Wheeler & Hendon (2004) · Peatman et al. (2014) · ' +
                    'Kohyama & Wallace (2016) · Hendon et al. (2007, 2012)' +
                '</div>' +
            '</div>';

        panel.style.display = 'block';
    };

    // ============================================================
    //  BAGIAN 8 — HOOK KE prosesJadwalOtomatis
    //  Setelah data ENSO/IOD dimuat, panggil perbarui6FaktorPanel
    // ============================================================

    function hookProsesJadwal() {
        var _asliProses = window.prosesJadwalOtomatis;
        if (typeof _asliProses !== 'function') {
            setTimeout(hookProsesJadwal, 300);
            return;
        }

        window.prosesJadwalOtomatis = async function () {
            // Jalankan proses asli dulu
            var hasilAsli = await _asliProses.apply(this, arguments);

            // Setelah selesai, perbarui panel 6 faktor
            try {
                var enso = window._ensoDataTerkini || null;
                var iod  = window._iodDataTerkini  || null;

                // Coba ambil dari window jika tidak ada cache lokal
                if (!enso && typeof window.getENSOAnomaly === 'function') {
                    enso = await window.getENSOAnomaly();
                    window._ensoDataTerkini = enso;
                }
                if (!iod && typeof window.getIODAnomaly === 'function') {
                    iod  = await window.getIODAnomaly();
                    window._iodDataTerkini = iod;
                }

                if (enso || iod) {
                    window.perbarui6FaktorPanel(enso, iod);
                }
            } catch (e) {
                console.warn('[6F] Gagal memperbarui panel 6 faktor:', e.message);
            }

            return hasilAsli;
        };

        console.log('%c✅ [6F] prosesJadwalOtomatis ter-hook untuk panel 6 faktor', 'color:#d946ef;font-weight:bold;');
    }

    // ============================================================
    //  BAGIAN 9 — INISIALISASI
    // ============================================================

    function init6Faktor() {
        injeksiKalenderTanam();
        injeksiPanelDebug6F();
        hookProsesJadwal();

        window.__skor6FaktorV1Aktif = true;

        // Ekspor untuk akses debug/patch lain
        window._6F = {
            bobot:               BOBOT_6F,
            hitungSkor6Faktor:   hitungSkor6Faktor,
            getDampakMJO:        getDampakMJO,
            getDampakFaseBulan:  getDampakFaseBulan,
            getAnomaliSSTLokal:  getAnomaliSSTLokal,
            hariFaseBulan:       hariFaseBulan6F
        };

        console.log(
            '%c✅ patch_skor_6faktor_v1.js AKTIF\n' +
            '\n  ╔══ INTEGRASI 6 FAKTOR IKLIM ══════════════════════╗\n' +
            '  ║ 🌏 ENSO         ' + Math.round(BOBOT_6F.enso  * 100) + '%  Tren makro tahunan\n' +
            '  ║ 🌊 SST Lokal    ' + Math.round(BOBOT_6F.sst   * 100) + '%  Moisture supply lokal\n' +
            '  ║ 🌤️ IOD           ' + Math.round(BOBOT_6F.iod   * 100) + '%  Tren aliran timur-barat\n' +
            '  ║ 🗺️ ZOM           ' + Math.round(BOBOT_6F.zom   * 100) + '%  Karakteristik ZOM lokal\n' +
            '  ║ 🌀 MJO          ' + Math.round(BOBOT_6F.mjo   * 100) + '%  Pemicu intramusiman\n' +
            '  ║ 🌙 Fase Bulan    ' + Math.round(BOBOT_6F.bulan * 100) + '%  Pasang surut mikroklimat\n' +
            '  ╠══ FUNGSI YANG DI-OVERRIDE ═══════════════════════╣\n' +
            '  ║ ✅ hitungRisikoDinamis()    → RISIKO IKLIM 6F\n' +
            '  ║ ✅ rekomendasiWindowTanam() → KALENDER TNM 6F\n' +
            '  ║ ✅ prosesJadwalOtomatis()   → hook panel debug\n' +
            '  ╠══ REFERENSI ILMIAH ═══════════════════════════════╣\n' +
            '  ║ Wheeler & Hendon (2004) — MJO RMM index\n' +
            '  ║ Peatman et al. (2014)   — MJO & CH Indonesia\n' +
            '  ║ Kohyama & Wallace (2016)— Fase bulan & CH\n' +
            '  ║ Hendon et al. (2007)    — ENSO–MJO interaksi\n' +
            '  ╚═══════════════════════════════════════════════════╝',
            'color:#d946ef; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init6Faktor, 500); // tunggu semua patch sebelumnya
        });
    } else {
        setTimeout(init6Faktor, 500);
    }

})();
