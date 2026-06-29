/**
 * ============================================================
 *  patch_skor_6faktor_v1.js  —  VERSI PERBAIKAN
 *  Integrasi 6 Faktor Iklim — RISIKO IKLIM & KALENDER TNM
 * ============================================================
 *
 *  DAFTAR BUG YANG DIPERBAIKI:
 *
 *  [FIX-1]  Bobot ENSO/SST/IOD/ZOM/MJO/Bulan diluruskan agar
 *           sesuai tabel metodologi (ENSO 30%, SST 18%,
 *           IOD 17%, ZOM 18%, MJO 10%, Bulan 7%) → total 100%.
 *           Normalisasi otomatis tetap dipertahankan sebagai
 *           safety-net, tapi nilai awal kini sudah benar.
 *
 *  [FIX-2]  hitungWetnessScore — tidak lagi bergantung pada
 *           window.hitungWetnessScore (patch lain). Kalkulasi
 *           mandiri dengan koefisien per bulan yang identik
 *           dengan patch_risiko_iklim_v2.js sehingga tidak
 *           ada duplikasi konstanta AMPLIFIKASI_WS yang bisa
 *           bertabrakan.
 *
 *  [FIX-3]  getAnomaliSSTLokal — menghapus ketergantungan pada
 *           window._sstLokalTerkini (tidak pernah diset oleh
 *           patch manapun). Langsung proxy dari ENSO sebagai
 *           estimasi valid + fallback bersih.
 *
 *  [FIX-4]  getDampakMJO — fallback estimasiDampakMJO yang
 *           sebelumnya selalu return 0 kini dikembalikan 0
 *           dengan komentar eksplisit (benar secara ilmiah —
 *           tanpa data fase nyata memang harus netral).
 *           Prioritas pengambilan data diperjelas.
 *
 *  [FIX-5]  Panel debug barFaktor — arah dampak ENSO dan IOD
 *           kini konsisten (El Niño positif → dampak negatif
 *           pada CH → bar merah). Sebelumnya tanda dibalik
 *           di barFaktor tapi ditampilkan tanpa pembalikan
 *           sehingga warna selalu hijau untuk El Niño kuat.
 *
 *  [FIX-6]  Lebar bar panel debug dikunci 0–100% dengan
 *           rumus proporsional yang benar (sebelumnya bisa
 *           overflow karena dampak * 500 tanpa klip).
 *
 *  [FIX-7]  hookProsesJadwal — hapus referensi ke
 *           window.ensoData / window.iodData yang tidak
 *           pernah diset. Kini membaca dari
 *           window._ensoDataTerkini / window._iodDataTerkini
 *           yang diisi secara konsisten oleh prosesJadwal
 *           maupun prosesAnalisisKalender.
 *
 *  [FIX-8]  Wrapper rekomendasiWindowTanam — signature
 *           sekarang meneruskan SEMUA 5 argumen
 *           (skorBulan, rawZOM, zona, ensoVal, iodVal)
 *           sesuai signature asli di patch_deteksi_musim_v3.
 *           Versi lama hanya mengirim 3 argumen sehingga
 *           ensoVal/iodVal selalu undefined di dalam fungsi.
 *
 *  [FIX-9]  prosesAnalisisKalender hook — pengecekan null
 *           sebelum memanggil perbarui6FaktorPanel agar
 *           tidak throw jika data belum tersedia.
 *
 *  [FIX-10] Guard double-load dipindah ke awal IIFE sehingga
 *           tidak ada risiko eksekusi parsial lalu berhenti
 *           di tengah inisialisasi.
 *
 * ============================================================
 *
 *  FAKTOR & PROPORSI IDEAL (sesuai tabel metodologi):
 *  ┌─────────────────┬──────────────┬──────────────────────────────────────────┐
 *  │ Faktor          │ Bobot        │ Peran                                    │
 *  ├─────────────────┼──────────────┼──────────────────────────────────────────┤
 *  │ ENSO            │ 30%          │ Tren iklim makro tahunan                 │
 *  │ SST Lokal       │ 18%          │ Ketersediaan uap air lokal (moisture)    │
 *  │ IOD             │ 17%          │ Tren aliran udara regional timur-barat   │
 *  │ ZOM             │ 18%          │ Karakteristik dasar/klimatologi daratan  │
 *  │ MJO             │ 10%          │ Pemicu hujan jangka pendek (intramusiman)│
 *  │ Fase Bulan      │  7%          │ Pasang surut mikroklimat                 │
 *  └─────────────────┴──────────────┴──────────────────────────────────────────┘
 *
 *  CARA PASANG:
 *    Letakkan SETELAH semua patch yang sudah ada di index.html:
 *      <script src="patch_skor_6faktor_v1.js"></script>
 *
 *  DEPENDENSI (harus sudah dimuat sebelum file ini):
 *    - patch_risiko_iklim_v2.js        → hitungRisikoDinamis() (di-override)
 *    - patch_enso_iod_noaa.js          → window.getENSOAnomaly(), getIODAnomaly()
 *    - patch_iklim_terpadu_v1.js       → window._deteksiPerairan(), getFallbackSST()
 *    - patch_jadwal_tanam_otomatis.js  → window.rekomendasiWindowTanam()
 *    - patch_zom_kalibrasi_v2.js       → window.deteksiZonaIklim()
 *    - patch_mjo_bom_v1.js             → window.mjoData, window.hitungDampakMJOLokal()
 * ============================================================
 */

(function () {
    'use strict';

    // ── [FIX-10] Guard di awal IIFE ──────────────────────────────────────
    if (window.__skor6FaktorV1Aktif) {
        console.warn('[patch_skor_6faktor_v1] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 0 — BOBOT RESMI 6 FAKTOR
    //  [FIX-1] Nilai awal diluruskan sesuai tabel metodologi.
    //  Normalisasi otomatis tetap sebagai safety-net.
    // ============================================================
    var BOBOT_6F = {
        enso:   0.30,   // 30% — dominan, tren makro tahunan
        sst:    0.18,   // 18% — moisture lokal
        iod:    0.17,   // 17% — aliran udara timur-barat
        zom:    0.18,   // 18% — karakteristik klimatologi daratan
        mjo:    0.10,   // 10% — pemicu intramusiman
        bulan:  0.07    // 7%  — mikroklimat pasang surut
        // Total = 1.00 ✅
    };

    // Normalisasi safety-net agar total selalu persis 1.0
    (function normalisasi() {
        var total = 0;
        var keys  = Object.keys(BOBOT_6F);
        keys.forEach(function (k) { total += BOBOT_6F[k]; });
        if (Math.abs(total - 1.0) > 0.001) {
            console.warn('[6F] Bobot tidak berjumlah 1.0 (' + total.toFixed(4) + '), menormalisasi...');
            keys.forEach(function (k) { BOBOT_6F[k] = BOBOT_6F[k] / total; });
        }
    })();

    // ============================================================
    //  BAGIAN 1 — FASE MJO
    // ============================================================

    /**
     * Estimasi dampak MJO per fase & wilayah.
     * [FIX-4] Jika amplitudo < 1.0 atau fase tidak valid → return 0
     * (benar secara ilmiah: MJO tidak aktif = dampak netral).
     */
    function estimasiDampakMJO(lat, lon, bulan, enso) {
        // Hanya aktif jika ada data fase nyata dari window
        if (window.mjoFase && typeof window.mjoFase === 'number') {
            var fase = Math.round(window.mjoFase);
            var amp  = window.mjoAmplitudo || 0;

            if (amp < 1.0 || fase < 1 || fase > 8) return 0;

            var dampakPerFase = {
                sumatera:  [ 0.2,  0.5,  0.8,  0.6, -0.3, -0.6, -0.8, -0.4],
                jawa:      [ 0.0,  0.3,  0.7,  0.8,  0.2, -0.4, -0.7, -0.3],
                sulawesi:  [-0.3, -0.2,  0.2,  0.5,  0.8,  0.7, -0.2, -0.5],
                nusra:     [-0.4, -0.1,  0.3,  0.4,  0.5,  0.2, -0.4, -0.7]
            };

            var wilayah;
            if (lon >= 95  && lon < 106) wilayah = 'sumatera';
            else if (lat < -5.5 && lon >= 106 && lon <= 115) wilayah = 'jawa';
            else if (lat < -7  && lon > 118) wilayah = 'nusra';
            else wilayah = 'sulawesi';

            var idx    = Math.max(0, Math.min(7, fase - 1));
            var faktor = dampakPerFase[wilayah][idx];
            return Math.max(-1, Math.min(1, faktor * Math.min(amp, 2.5) / 1.5));
        }

        // Tanpa data fase nyata: return 0 (netral — ini BENAR secara ilmiah)
        // Tidak bisa menentukan arah dampak tanpa tahu fase aktual.
        return 0;
    }

    /**
     * Ambil dampak MJO dengan prioritas yang jelas.
     * [FIX-4] Prioritas 1 → BOM real-time, 2 → cache, 3 → netral (0)
     */
    function getDampakMJO(lat, lon, bulan, enso) {
    // ✅ FIX 3: Gunakan cek eksplisit bukan truthy check (fase=0 adalah falsy!)
    var faseMJO = window.mjoData && typeof window.mjoData.fase === 'number'
        ? window.mjoData.fase : -1;
    var ampMJO  = window.mjoData && typeof window.mjoData.amplitudo === 'number'
        ? window.mjoData.amplitudo : 0;

    // Prioritas 1: Fungsi BOM real-time
    if (typeof window.hitungDampakMJOLokal === 'function' &&
        faseMJO >= 1 && faseMJO <= 8) {
        return window.hitungDampakMJOLokal(lat, lon, faseMJO, ampMJO);
    }

    // Prioritas 2: Hitung manual dari cache
    if (faseMJO >= 1 && faseMJO <= 8) {
        window.mjoFase      = faseMJO;
        window.mjoAmplitudo = ampMJO;
        return estimasiDampakMJO(lat, lon, bulan, enso);
    }

    // Prioritas 3: Netral — tidak ada data MJO valid
    return 0;
}

    // ============================================================
    //  BAGIAN 2 — FASE BULAN
    // ============================================================

    var EPOCH_BULAN_BARU_6F = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS_6F   = 29.53059;

    function hariFaseBulan6F(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU_6F.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS_6F) + SIKLUS_SINODIS_6F) % SIKLUS_SINODIS_6F;
    }

    function getDampakFaseBulan(tgl) {
        tgl = tgl || new Date();
        var fase = hariFaseBulan6F(tgl);
        if (fase <= 3)  return  0.25;  // Bulan mati → konveksi lebih kuat
        if (fase <= 7)  return  0.10;  // Sabit muda
        if (fase <= 9)  return  0.00;  // Kuartal pertama
        if (fase <= 14) return -0.10;  // Cembung menuju penuh
        if (fase <= 17) return -0.25;  // Bulan penuh → konveksi lebih lemah
        if (fase <= 22) return -0.10;  // Cembung setelah penuh
        if (fase <= 24) return  0.00;  // Kuartal ketiga
        return 0.20;                   // Sabit tua → menuju mati baru
    }

    // ============================================================
    //  BAGIAN 3 — SST LOKAL
    //  [FIX-3] Hapus ketergantungan pada window._sstLokalTerkini
    //  yang tidak pernah diset oleh patch manapun.
    // ============================================================

    function getAnomaliSSTLokal(lat, lon, bulan) {
        // Coba ambil dari data SST lokal terkini jika tersedia
        // (diisi oleh getLocalSSTTimeseries setelah render chart)
        if (window._sstLokalCache && typeof window._sstLokalCache === 'object') {
            var sst1 = window._sstLokalCache.sstBoneTerkini;
            if (sst1 && typeof sst1 === 'number') {
                var baseline = getBaselineSST(lat, lon, bulan);
                return Math.max(-2, Math.min(2, sst1 - baseline));
            }
        }

        // Proxy melalui ENSO sebagai estimasi SST lokal
        // Korelasi terbalik: El Niño (+) → SST lokal cenderung lebih dingin
        var enso = 0;
        if (window._ensoDataTerkini && window._ensoDataTerkini.latestAnomaly !== undefined) {
            enso = parseFloat(window._ensoDataTerkini.latestAnomaly) || 0;
        }
        var korelasiEnsoSst = 0.35;
        return Math.max(-1.5, Math.min(1.5, -enso * korelasiEnsoSst));
    }

    function getBaselineSST(lat, lon, bulan) {
        if (typeof window.getFallbackSST === 'function') {
            var d = new Date(); d.setMonth(bulan); d.setDate(15);
            try {
                var hasil = window.getFallbackSST(lat, lon, d);
                if (hasil && typeof hasil === 'number') return hasil;
            } catch (e) {}
        }
        // Fallback global: rata-rata SST tropis Indonesia
        var baseline = [29.0, 29.0, 29.0, 29.2, 29.2, 28.5,
                        28.0, 27.8, 28.0, 28.5, 29.0, 29.2];
        return baseline[bulan] || 28.8;
    }

    // ============================================================
    //  BAGIAN 4 — SKOR TERPADU 6 FAKTOR
    // ============================================================

    /**
     * Hitung skor risiko 6 faktor dalam skala -1.0 s/d +1.0
     * Nilai negatif = cenderung kering, positif = cenderung basah.
     *
     * KONVENSI (konsisten di seluruh fungsi):
     *   El Niño (ENSO+) → kering → skor negatif
     *   IOD+            → kering → skor negatif
     *   La Niña (ENSO-) → basah  → skor positif
     *   IOD-            → basah  → skor positif
     *   SST hangat      → basah  → skor positif
     *   Bulan mati      → basah  → skor positif
     */
    function hitungSkor6Faktor(ensoVal, iodVal, zomVal, sstAnom, mjoVal, bulanVal) {
        var normEnso  = Math.max(-1, Math.min(1, ensoVal / 1.5));
        var normIod   = Math.max(-1, Math.min(1, iodVal  / 1.0));
        var normZom   = Math.max(-1, Math.min(1, zomVal));
        var normSst   = Math.max(-1, Math.min(1, sstAnom / 1.0));
        var normMjo   = Math.max(-1, Math.min(1, mjoVal));
        var normBulan = Math.max(-1, Math.min(1, bulanVal / 0.3));

        // Tanda: El Niño (+) dan IOD+ (+) → kering (→ skor negatif)
        var skorENSO  = -normEnso;
        var skorIOD   = -normIod;
        var skorZOM   =  normZom;  // ZOM basah (+) → basah (+)
        var skorSST   =  normSst;  // SST hangat (+) → lebih lembap (+)
        var skorMJO   =  normMjo;  // Sesuai estimasi fase/wilayah
        var skorBulan =  normBulan;// Bulan mati (+) → sedikit lebih basah

        var skorTotal = (skorENSO  * BOBOT_6F.enso)  +
                        (skorSST   * BOBOT_6F.sst)   +
                        (skorIOD   * BOBOT_6F.iod)   +
                        (skorZOM   * BOBOT_6F.zom)   +
                        (skorMJO   * BOBOT_6F.mjo)   +
                        (skorBulan * BOBOT_6F.bulan);

        return Math.max(-1, Math.min(1, skorTotal));
    }

    // ============================================================
    //  BAGIAN 5 — OVERRIDE hitungRisikoDinamis()
    //  [FIX-2] Kalkulasi ws mandiri, tidak bergantung pada
    //  window.hitungWetnessScore dari patch lain.
    // ============================================================

    if (typeof window.hitungRisikoDinamis === 'function') {
        window._hitungRisikoAsli6F = window.hitungRisikoDinamis;
    }

    // Koefisien bobot ENSO/IOD per bulan (identik dengan patch_risiko_iklim_v2.js)
    var _BOBOT_IKLIM_6F = {
        monsunal: {
            enso: [0.15,0.15,0.12,0.10,0.18,0.35,0.45,0.50,0.45,0.35,0.20,0.15],
            iod:  [0.10,0.10,0.08,0.08,0.12,0.20,0.28,0.38,0.40,0.30,0.15,0.10]
        },
        ekuatorial: {
            enso: [0.10,0.10,0.08,0.08,0.10,0.15,0.18,0.20,0.18,0.15,0.10,0.10],
            iod:  [0.20,0.18,0.15,0.12,0.15,0.22,0.30,0.42,0.48,0.38,0.25,0.20]
        },
        lokal: {
            enso: [0.12,0.12,0.10,0.10,0.12,0.18,0.22,0.28,0.25,0.20,0.15,0.12],
            iod:  [0.08,0.08,0.08,0.08,0.10,0.12,0.15,0.20,0.22,0.18,0.12,0.08]
        },
        peralihan: {
            enso: [0.12,0.12,0.10,0.10,0.14,0.22,0.30,0.35,0.30,0.25,0.16,0.12],
            iod:  [0.14,0.12,0.10,0.10,0.12,0.18,0.22,0.30,0.33,0.25,0.18,0.14]
        }
    };

    var _AMPLIFIKASI_WS_6F = 5;

    /** Hitung wetness score secara mandiri (tidak perlu window.hitungWetnessScore). */
    function _hitungWSMandiri(baselineZOM, ensoVal, iodVal, lat, lon, bulanIndex) {
        var zona = 'monsunal';
        if (typeof window.tentukanZonaIklim === 'function') {
            zona = window.tentukanZonaIklim(lat, lon) || 'monsunal';
        }

        var tz = _BOBOT_IKLIM_6F[zona] || _BOBOT_IKLIM_6F.monsunal;
        var wE = tz.enso[bulanIndex];
        var wI = tz.iod[bulanIndex];

        var ensoNorm   = (ensoVal / 0.5) * _AMPLIFIKASI_WS_6F;
        var iodNorm    = (iodVal  / 0.5) * _AMPLIFIKASI_WS_6F;
        var totalBobot = wE + wI;
        var penguatB   = totalBobot < 0.25 ? 1.5 : 1.0;
        var koreksi    = totalBobot > 0
            ? ((ensoNorm * wE) + (iodNorm * wI)) * penguatB
            : 0;

        return baselineZOM - koreksi;
    }

    window.hitungRisikoDinamis = function (bulanIndex, fase, ensoVal, iodVal, baselineData) {
        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        // ── 1. Baseline ZOM ──────────────────────────────────────────────
        var baselineBulanIni = parseFloat(baselineData[bulanIndex]);
        if (typeof window.normalisasiCurahHujan === 'function' && baselineBulanIni > 10) {
            baselineBulanIni = window.normalisasiCurahHujan(baselineBulanIni, bulanIndex);
        }

        // ── 2. Hitung ws mandiri [FIX-2] ─────────────────────────────────
        var ws = _hitungWSMandiri(baselineBulanIni, ensoVal, iodVal, lat, lon, bulanIndex);

        // ── 3. Koreksi kecil SST + MJO + Fase Bulan ─────────────────────
        // Skala ±0.20 agar ENSO/IOD tetap dominan
        var sstAnom  = getAnomaliSSTLokal(lat, lon, bulanIndex);
        var mjoVal   = getDampakMJO(lat, lon, bulanIndex, ensoVal);
        var tglRef   = new Date(); tglRef.setMonth(bulanIndex); tglRef.setDate(15);
        var bulanVal = getDampakFaseBulan(tglRef);

        var koreksiExtra = (sstAnom * 0.20) + (mjoVal * 0.15) + (bulanVal * 0.20);
        var wsTotal      = ws + koreksiExtra;

        // ── 4. Status cuaca ──────────────────────────────────────────────
        var statusCuaca;
        if      (wsTotal <= -1.0) statusCuaca = 'Sangat Kering Ekstrem';
        else if (wsTotal <= -0.5) statusCuaca = 'Kering';
        else if (wsTotal <= -0.2) statusCuaca = 'Cenderung Kering';
        else if (wsTotal <=  0.2) statusCuaca = 'Normal';
        else if (wsTotal <=  0.5) statusCuaca = 'Cenderung Basah';
        else if (wsTotal <=  1.0) statusCuaca = 'Basah';
        else                      statusCuaca = 'Sangat Basah Ekstrem';

        var tipeBahaya = 'aman';
        if      (wsTotal < -0.2) tipeBahaya = 'kekeringan';
        else if (wsTotal >  0.2) tipeBahaya = 'banjir';

        // ── 5. Tabel skor per fase ───────────────────────────────────────
        var skor    = 15;
        var masalah = 'Kondisi air optimal.';

        if (fase === 'Tanam') {
            if      (wsTotal <= -1.5) { skor = 90; masalah = 'KRITIS: Tanah retak parah, tidak bisa olah lahan. Tunda tanam atau pompanisasi penuh.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.8) { skor = 65; masalah = 'Hujan kurang. Perlu pompanisasi tambahan agar lahan bisa dibajak.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.3) { skor = 35; masalah = 'Curah hujan sedikit di bawah normal. Pantau ketersediaan air irigasi.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <=  0.8) { skor = 15; masalah = 'Curah hujan cukup. Kondisi air ideal untuk olah lahan dan tanam.'; }
            else if (wsTotal <=  1.5) { skor = 45; masalah = 'Curah hujan di atas normal. Waspada genangan di lahan yang drainase-nya buruk.'; tipeBahaya = 'banjir'; }
            else                      { skor = 70; masalah = 'Hujan sangat lebat. Risiko pesemaian terendam. Pertimbangkan tapin atau tunda sebar benih.'; tipeBahaya = 'banjir'; }

        } else if (fase === 'Vegetatif') {
            if      (wsTotal <= -1.5) { skor = 80; masalah = 'KRITIS: Kekeringan parah. Anakan padi tidak tumbuh, jumlah malai sangat sedikit.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.8) { skor = 55; masalah = 'Kekeringan. Pertumbuhan anakan terhambat. Segera cek debit saluran irigasi.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.3) { skor = 28; masalah = 'Sedikit kekurangan air. Pantau tinggi air di petak sawah, pertahankan 3–5 cm.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <=  0.8) { skor = 12; masalah = 'Curah hujan normal. Kondisi air ideal untuk pertumbuhan anakan produktif.'; }
            else if (wsTotal <=  1.5) { skor = 38; masalah = 'Curah hujan lebat. Jika tergenang > 7 hari berturut-turut, buka saluran drainase.'; tipeBahaya = 'banjir'; }
            else                      { skor = 62; masalah = 'Hujan sangat lebat. Risiko genangan panjang, akar busuk dan anakan produktif berkurang.'; tipeBahaya = 'banjir'; }

        } else if (fase === 'Generatif') {
            if      (wsTotal <= -1.5) { skor = 95; masalah = 'KRITIS PUSO: Kekeringan parah saat bunting. Malai hampa massal, potensi gagal panen total.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.8) { skor = 75; masalah = 'BAHAYA: Kekurangan air saat pengisian malai. Bulir tidak terisi penuh, hasil anjlok 30–60%.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <= -0.3) { skor = 42; masalah = 'Waspada kekurangan air. Pastikan tinggi air sawah minimal 5 cm saat fase bunting.'; tipeBahaya = 'kekeringan'; }
            else if (wsTotal <=  0.5) { skor = 12; masalah = 'Kondisi curah hujan sangat ideal untuk penyerbukan dan pengisian bulir.'; }
            else if (wsTotal <=  1.2) { skor = 40; masalah = 'Hujan lebat saat berbunga. Serbuk sari berpotensi rontok, amati persentase malai kosong.'; tipeBahaya = 'banjir'; }
            else                      { skor = 72; masalah = 'BAHAYA: Hujan deras dan angin kencang saat berbunga. Risiko rebah dan penyerbukan gagal massal.'; tipeBahaya = 'banjir'; }

        } else if (fase === 'Panen') {
            if      (wsTotal <= -0.8) { skor =  8; masalah = 'Kondisi terik dan kering. Sangat ideal untuk panen dan pengeringan gabah.'; }
            else if (wsTotal <=  0.3) { skor = 18; masalah = 'Kondisi curah hujan normal. Panen aman, siapkan pengering cadangan (terpal/dryer).'; }
            else if (wsTotal <=  0.8) { skor = 48; masalah = 'Curah hujan di atas normal. Lahan berpotensi becek, sulit diakses Combine Harvester.'; tipeBahaya = 'banjir'; }
            else if (wsTotal <=  1.5) { skor = 75; masalah = 'BAHAYA: Hujan lebat saat panen. Gabah berisiko tumbuh di malai. Percepat panen atau siapkan dryer.'; tipeBahaya = 'banjir'; }
            else                      { skor = 92; masalah = 'KRITIS: Banjir saat panen. Lahan tidak bisa diakses mesin. Percepat panen manual segera!'; tipeBahaya = 'banjir'; }
        }

        // ── 6. Keterangan faktor tambahan ───────────────────────────────
        var infoExtra = [];
        if (Math.abs(sstAnom) > 0.3) {
            infoExtra.push('SST ' + (sstAnom > 0 ? 'hangat +' + sstAnom.toFixed(1) : 'dingin ' + sstAnom.toFixed(1)) + '°C');
        }
        if (window.mjoData && window.mjoData.aktif && Math.abs(mjoVal) > 0.15) {
            infoExtra.push('MJO Fase ' + window.mjoData.fase + (mjoVal > 0 ? ' ↑basah' : ' ↓kering'));
        }
        if (Math.abs(bulanVal) > 0.1) {
            infoExtra.push(bulanVal > 0 ? '🌑 Bulan Mati' : '🌕 Bulan Penuh');
        }
        if (infoExtra.length > 0) {
            masalah = masalah + ' [' + infoExtra.join(' · ') + ']';
        }

        skor = Math.round(Math.max(0, Math.min(100, skor)));

        return {
            skor:           skor,
            statusCuaca:    statusCuaca,
            masalah:        masalah,
            tipeBahaya:     tipeBahaya,
            ws:             wsTotal,
            _wsAsli:        ws,
            _koreksiExtra:  parseFloat(koreksiExtra.toFixed(3))
        };
    };

    // ============================================================
    //  BAGIAN 6 — OVERRIDE rekomendasiWindowTanam()
    //  [FIX-8] Teruskan SEMUA 5 argumen ke fungsi asli.
    // ============================================================

    function injeksiKalenderTanam() {
        if (typeof window.rekomendasiWindowTanam !== 'function') {
            setTimeout(injeksiKalenderTanam, 300);
            return;
        }

        var _asliKalender = window.rekomendasiWindowTanam;

        window.rekomendasiWindowTanam = function (skorBulan, rawZOM, zona, ensoValArg, iodValArg) {
            // [FIX-8] Teruskan ensoVal & iodVal dari argumen (bukan dari cache)
            // agar patch_deteksi_musim_v3 menerima nilai yang benar.
            var ensoVal = ensoValArg !== undefined
                ? ensoValArg
                : ((window._ensoDataTerkini && window._ensoDataTerkini.latestAnomaly) || 0);
            var iodVal = iodValArg !== undefined
                ? iodValArg
                : ((window._iodDataTerkini && window._iodDataTerkini.latestAnomaly) || 0);

            // Panggil fungsi asli dengan SEMUA 5 argumen
            var hasil = _asliKalender.call(this, skorBulan, rawZOM, zona, ensoVal, iodVal);

            if (!Array.isArray(hasil)) return hasil;

            var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
            var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

            hasil.forEach(function (item) {
                var bTanamIdx = typeof item.bTanam === 'number' ? item.bTanam
                              : (item.tglTanam ? item.tglTanam.getMonth() : 0);

                // Normalisasi ZOM ke -1..+1
                var rawCH = rawZOM[bTanamIdx] || 0;
                var zomNorm;
                if (typeof window.normalisasiCurahHujan === 'function' && rawCH > 10) {
                    var wsNorm = window.normalisasiCurahHujan(rawCH, bTanamIdx);
                    zomNorm = Math.max(-1, Math.min(1, wsNorm / 2.0));
                } else {
                    zomNorm = Math.max(-1, Math.min(1, rawCH));
                }

                var sstAnom  = getAnomaliSSTLokal(lat, lon, bTanamIdx);
                var mjoVal6F = getDampakMJO(lat, lon, bTanamIdx, ensoVal);
                var tglRef   = new Date(); tglRef.setMonth(bTanamIdx); tglRef.setDate(15);
                var bulanVal = getDampakFaseBulan(tglRef);

                var skor6F = hitungSkor6Faktor(ensoVal, iodVal, zomNorm, sstAnom, mjoVal6F, bulanVal);

                // Bonus/penalti proporsional
                var bonusPenalti = skor6F > 0
                    ? Math.round(skor6F * 10)
                    : Math.round(skor6F * 15);

                if (typeof item.nilaiTotal === 'number') {
                    item.nilaiTotal = Math.max(0, Math.min(100, item.nilaiTotal + bonusPenalti));
                }

                // Keterangan faktor untuk alasan
                var labelSST   = sstAnom > 0.3  ? '🌊 SST hangat (+' + sstAnom.toFixed(1) + '°C)'
                               : sstAnom < -0.3 ? '🌊 SST dingin (' + sstAnom.toFixed(1) + '°C)'
                               : '🌊 SST normal';
                var labelMJO   = mjoVal6F > 0.2  ? '🌀 MJO aktif basah (Fase ' + (window.mjoData ? window.mjoData.fase : '?') + ')'
                               : mjoVal6F < -0.2 ? '🌀 MJO aktif kering (Fase ' + (window.mjoData ? window.mjoData.fase : '?') + ')'
                               : '';
                var labelBulan = bulanVal > 0.1  ? '🌑 Bulan Mati (favorable)'
                               : bulanVal < -0.1 ? '🌕 Bulan Penuh (sedikit reduksi CH)'
                               : '';

                var tagInfo = [labelSST];
                if (labelMJO)   tagInfo.push(labelMJO);
                if (labelBulan) tagInfo.push(labelBulan);

                if (item.alasan) {
                    item.alasan = item.alasan + '\n📊 Faktor 6F: ' + tagInfo.join(' · ');
                }
            });

            // Urutkan ulang berdasarkan nilaiTotal
            hasil.sort(function (a, b) { return (b.nilaiTotal || 0) - (a.nilaiTotal || 0); });
            return hasil;
        };

        console.log('%c✅ [6F] rekomendasiWindowTanam ter-override dengan 6 faktor (FIX-8)', 'color:#d946ef;font-weight:bold;');
    }

    // ============================================================
    //  BAGIAN 7 — UI PANEL DETAIL 6 FAKTOR
    //  [FIX-5] Arah dampak ENSO/IOD konsisten di barFaktor
    //  [FIX-6] Lebar bar dikunci 0–100% dengan rumus yang benar
    // ============================================================

    /**
     * Buat panel 6 faktor on-demand (dipanggil saat akan render).
     * Panel dimasukkan DI DALAM #boxKalender agar ikut tampil/sembunyi
     * bersama box utama saat switchMode().
     * [BUG-1 FIX] insertBefore(nextSibling) → appendChild ke dalam boxKalender
     * [BUG-4 FIX] Buat on-demand jika belum ada, bukan hanya saat init
     */
    function pastikanPanelAda() {
        var boxKalender = document.getElementById('boxKalender');
        if (!boxKalender) return null;

        var panel = document.getElementById('panel6FaktorDebug');
        if (panel) return panel; // sudah ada

        panel = document.createElement('div');
        panel.id = 'panel6FaktorDebug';
        panel.style.cssText = [
            'display:none;',
            'margin-top:20px;',
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
                '📊 FAKTOR IKLIM MAKRO' +
            '</strong>' +
            '<div id="isi6FaktorDebug">Memuat data faktor...</div>';

        // Masukkan DI DALAM #boxKalender (bukan setelahnya)
        // sehingga ikut tampil saat mode kalender aktif
        boxKalender.appendChild(panel);
        return panel;
    }

    // Panggil saat init untuk membuat panel awal (jika boxKalender sudah ada)
    function injeksiPanelDebug6F() {
        pastikanPanelAda(); // buat jika DOM sudah siap
    }

    /**
     * Perbarui panel 6 faktor.
     * [FIX-5] Warna bar kini mencerminkan dampak NYATA terhadap CH:
     *   - El Niño kuat → dampak negatif → bar MERAH
     *   - La Niña kuat → dampak positif → bar HIJAU
     * [FIX-6] Lebar bar = Math.min(100, |dampak| * 300) — tidak overflow
     */
    window.perbarui6FaktorPanel = function (ensoData, iodData) {
        // [BUG-4 FIX] Buat panel on-demand jika belum ada di DOM
        var panel = pastikanPanelAda();
        if (!panel) return; // boxKalender belum ada di DOM

        var isi = document.getElementById('isi6FaktorDebug');
        if (!isi) return;

        var lat      = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        var lon      = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;
        var bulanNow = new Date().getMonth();

        var ensoVal = (ensoData && ensoData.latestAnomaly !== undefined)
            ? parseFloat(ensoData.latestAnomaly) : 0;
        var iodVal  = (iodData  && iodData.latestAnomaly  !== undefined)
            ? parseFloat(iodData.latestAnomaly)  : 0;

        // Simpan untuk getAnomaliSSTLokal
        window._ensoDataTerkini = ensoData || window._ensoDataTerkini;
        window._iodDataTerkini  = iodData  || window._iodDataTerkini;

        var sstAnom  = getAnomaliSSTLokal(lat, lon, bulanNow);
        var mjoVal   = getDampakMJO(lat, lon, bulanNow, ensoVal);
        var bulanVal = getDampakFaseBulan(new Date());
        var zomNorm  = 0; // ZOM tidak tersedia di sini → netral

        var skor6F = hitungSkor6Faktor(ensoVal, iodVal, zomNorm, sstAnom, mjoVal, bulanVal);

        /**
         * barFaktor — render satu baris faktor
         * [FIX-5] dampakNyata = nilai × bobot dengan konvensi CH:
         *   ENSO+/IOD+ → kering → dampak negatif
         * [FIX-6] lebar = Math.min(100, |dampakNyata| * 300) — tidak overflow
         *
         * @param {string} label       - nama faktor
         * @param {number} nilaiMentah - nilai anomali sebelum dibalik
         * @param {number} bobot       - bobot faktor (0–1)
         * @param {string} satuan      - satuan tampilan
         * @param {boolean} terbalik   - true jika nilai+ = kering (ENSO, IOD)
         */
        function barFaktor(label, nilaiMentah, bobot, satuan, terbalik) {
            var persen = Math.round(bobot * 100);
            var tanda  = nilaiMentah > 0 ? '+' : '';
            var satuanStr = satuan || '';

            // [FIX-5] Dampak nyata terhadap CH (bukan hanya nilai mentah)
            // El Niño (+) dan IOD+ (+) → dampak NEGATIF (kering)
            var dampakCH = terbalik ? -nilaiMentah * bobot : nilaiMentah * bobot;

            // [FIX-6] Lebar proporsional, dikunci 0–100%
            var threshold = 0.01; // nilai minimum dianggap signifikan
            var lebar     = Math.min(100, Math.abs(dampakCH) * 300);

            var warna;
            if (dampakCH > threshold)       warna = '#10b981'; // basah → hijau
            else if (dampakCH < -threshold) warna = '#ef4444'; // kering → merah
            else                            warna = '#64748b'; // netral → abu

            return (
                '<div style="margin-bottom:6px;">' +
                    '<span style="display:inline-block;width:110px;font-weight:600;">' + label + '</span>' +
                    '<span style="color:' + warna + ';font-weight:700;">' + tanda + nilaiMentah.toFixed(2) + satuanStr + '</span>' +
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

        // [FIX-5] Argumen ke-5 (terbalik=true) untuk ENSO dan IOD
        isi.innerHTML =
            barFaktor('🌏 ENSO',      ensoVal,  BOBOT_6F.enso,  '°C (ONI)', true)  +
            barFaktor('🌊 SST Lokal', sstAnom,  BOBOT_6F.sst,   '°C (anom)', false) +
            barFaktor('🌤️ IOD',      iodVal,   BOBOT_6F.iod,   '°C (DMI)', true)  +
            barFaktor('🗺️ ZOM',       zomNorm,  BOBOT_6F.zom,   ' (normed)', false) +
            barFaktor('🌀 MJO',       mjoVal,   BOBOT_6F.mjo,   ' (fase)',   false) +
            barFaktor('🌙 Fase Bulan',bulanVal, BOBOT_6F.bulan, '',          false) +
            '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);">' +
                '<span style="font-weight:700;color:' + warnaSkor + ';">' +
                    'Skor Terpadu: ' + (skor6F > 0 ? '+' : '') + skor6F.toFixed(3) +
                    ' → ' + labelSkor +
                '</span>' +
                '<div style="opacity:0.45;font-size:0.65rem;margin-top:4px;">' +
                    'Bobot: ENSO ' + Math.round(BOBOT_6F.enso  * 100) + '% | ' +
                    'SST '   + Math.round(BOBOT_6F.sst   * 100) + '% | ' +
                    'IOD '   + Math.round(BOBOT_6F.iod   * 100) + '% | ' +
                    'ZOM '   + Math.round(BOBOT_6F.zom   * 100) + '% | ' +
                    'MJO '   + Math.round(BOBOT_6F.mjo   * 100) + '% | ' +
                    'Bulan ' + Math.round(BOBOT_6F.bulan * 100) + '%' +
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
    //  [FIX-7] Hapus referensi ke window.ensoData/window.iodData
    //  yang tidak pernah diset. Gunakan window._ensoDataTerkini
    //  dan window._iodDataTerkini secara konsisten.
    //  [FIX-9] Null-check sebelum memanggil perbarui6FaktorPanel.
    // ============================================================

    /**
     * hookProsesJadwal — VERSI BARU dengan MutationObserver
     *
     * [BUG-2 FIX] Tidak lagi menunggu prosesJadwalOtomatis yang mungkin
     *             tidak ada jika patch_jadwal_tanam_otomatis tidak dimuat.
     * [BUG-3 FIX] Tidak hook ke prosesAnalisisKalender yang sering
     *             diganti patch lain sehingga hook lama tidak terpanggil.
     *
     * STRATEGI BARU: MutationObserver pada #teksAnalisisFase
     * Ketika prosesAnalisisKalender APAPUN versinya selesai render,
     * dia selalu mengisi #teksAnalisisFase. Observer mendeteksi ini
     * → update panel 6 faktor otomatis tanpa perlu hook ke fungsi manapun.
     */
    function hookProsesJadwal() {
        // ── 1. Observer pada #teksAnalisisFase ──────────────────────────
        // Dipanggil setiap kali grafik kalender selesai dirender
        function pasangObserverKalender() {
            var elTeks = document.getElementById('teksAnalisisFase');
            if (!elTeks) {
                setTimeout(pasangObserverKalender, 500);
                return;
            }
            if (elTeks.dataset.obs6F) return; // sudah terpasang

            var obs = new MutationObserver(function () {
    if (!elTeks.innerHTML || elTeks.innerHTML.trim().length < 30) return;

    var enso6F = window._ensoDataTerkini;
    var iod6F  = window._iodDataTerkini;

    // ✅ FIX 2: Pastikan MJO sudah load sebelum render panel
    var renderPanel = function() {
        try {
            window.perbarui6FaktorPanel(enso6F || null, iod6F || null);
        } catch (e) {
            console.warn('[6F] Panel update gagal:', e.message);
        }
    };

    // Jika MJO belum ada data valid, tunggu sebentar lalu coba lagi
    var faseMJO = window.mjoData && typeof window.mjoData.fase === 'number'
        ? window.mjoData.fase : -1;

    if (faseMJO < 1 && typeof window.getMJOData === 'function') {
        // MJO belum siap, fetch dulu
        window.getMJOData()
            .then(function() { renderPanel(); })
            .catch(function() { renderPanel(); }); // Tetap render walau gagal
    } else {
        renderPanel();
    }
});
            obs.observe(elTeks, { childList: true, subtree: true, characterData: true });
            elTeks.dataset.obs6F = '1';
            console.log('%c✅ [6F] MutationObserver #teksAnalisisFase terpasang', 'color:#d946ef;font-weight:bold;');
        }

        pasangObserverKalender();

        // ── 2. Hook prosesJadwalOtomatis jika ada (opsional) ────────────
        // Tidak menghentikan eksekusi jika tidak ada
        var _asliProses = window.prosesJadwalOtomatis;
        if (typeof _asliProses === 'function' && !_asliProses.__6FHooked) {
            window.prosesJadwalOtomatis = async function () {
                var hasilAsli = await _asliProses.apply(this, arguments);
                try {
                    var enso = window._ensoDataTerkini;
                    var iod  = window._iodDataTerkini;
                    if (enso || iod) window.perbarui6FaktorPanel(enso || null, iod || null);
                } catch (e) {}
                return hasilAsli;
            };
            window.prosesJadwalOtomatis.__6FHooked = true;
        }
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
            hariFaseBulan:       hariFaseBulan6F,
            hitungWSMandiri:     _hitungWSMandiri
        };

        console.log(
            '%c✅ patch_skor_6faktor_v1.js (PERBAIKAN) AKTIF\n' +
            '\n  ╔══ PERBAIKAN AKTIF ═══════════════════════════════╗\n' +
            '  ║ [FIX-1]  Bobot ENSO 30% / SST 18% / IOD 17%\n' +
            '  ║          ZOM 18% / MJO 10% / Bulan 7% ✅\n' +
            '  ║ [FIX-2]  hitungWetnessScore mandiri (tidak\n' +
            '  ║          bergantung window.hitungWetnessScore) ✅\n' +
            '  ║ [FIX-3]  getAnomaliSSTLokal: hapus _sstLokalTerkini\n' +
            '  ║          yang tidak pernah diset ✅\n' +
            '  ║ [FIX-4]  getDampakMJO: fallback eksplisit = 0 ✅\n' +
            '  ║ [FIX-5]  barFaktor: ENSO+/IOD+ = merah (kering) ✅\n' +
            '  ║ [FIX-6]  Lebar bar dikunci 0–100% ✅\n' +
            '  ║ [FIX-7]  hookProsesJadwal: hapus window.ensoData\n' +
            '  ║          yang tidak pernah ada ✅\n' +
            '  ║ [FIX-8]  rekomendasiWindowTanam: teruskan 5 argumen ✅\n' +
            '  ║ [FIX-9]  prosesAnalisisKalender: null-check panel ✅\n' +
            '  ║ [FIX-10] Guard double-load di awal IIFE ✅\n' +
            '  ╠══ INTEGRASI 6 FAKTOR IKLIM ══════════════════════╣\n' +
            '  ║ 🌏 ENSO         ' + Math.round(BOBOT_6F.enso  * 100) + '%  Tren makro tahunan\n' +
            '  ║ 🌊 SST Lokal    ' + Math.round(BOBOT_6F.sst   * 100) + '%  Moisture supply lokal\n' +
            '  ║ 🌤️ IOD           ' + Math.round(BOBOT_6F.iod   * 100) + '%  Tren aliran timur-barat\n' +
            '  ║ 🗺️ ZOM           ' + Math.round(BOBOT_6F.zom   * 100) + '%  Karakteristik ZOM lokal\n' +
            '  ║ 🌀 MJO          ' + Math.round(BOBOT_6F.mjo   * 100) + '%  Pemicu intramusiman\n' +
            '  ║ 🌙 Fase Bulan    ' + Math.round(BOBOT_6F.bulan * 100) + '%  Pasang surut mikroklimat\n' +
            '  ╚═══════════════════════════════════════════════════╝',
            'color:#d946ef; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init6Faktor, 500);
        });
    } else {
        setTimeout(init6Faktor, 500);
    }

})();
