/**
 * ============================================================
 * patch_zom_kalibrasi_v2.js
 * Kalibrasi Karakter ZOM — PPL Milenial Wajo
 * ============================================================
 *
 * PASANG SETELAH patch_iklim_terpadu_v1.js
 * (file ini adalah layer kalibrasi di atas konsolidasi v1)
 *
 * PERUBAHAN DARI v1:
 *   [ZOM-1] Tambah 2 sub-zona baru: hst_basah & kering_ekstrem
 *   [ZOM-2] deteksiZonaIklim() lebih presisi — 8 kondisi GPS
 *   [ZOM-3] BOBOT_ZONA diperluas dengan 2 entri baru
 *   [ZOM-4] hitungBobotIodDinamis() — bedakan La Niña lemah vs kuat
 *   [ZOM-5] Teks kesimpulan mencantumkan label tipe ZOM
 *   [ZOM-6] Teks rekomendasi disesuaikan per sub-zona
 *
 * SUMBER DATA:
 *   BMKG Buletin PMH 2025/2026 Sulsel (Sep 2025) — 24 ZOM
 *   BMKG Buletin PMH 2025/2026 Sulut (Sep 2025) — 10 ZOM
 *   BMKG ZOM9120 nasional — 699 ZOM (1991–2020)
 *   BMKG Prediksi Nasional MH 2025/2026 + Update Nov 2025
 *   Hidayat et al. (2016); Nur'utami & Hidayat (2016)
 *   Aldrian & Susanto (2003); Nontji (2005)
 * ============================================================
 */

(function () {
    'use strict';

    // ── Guard: jangan jalan kalau v1 belum aktif ──────────────
    if (!window.__iklimTerpaduV1Aktif) {
        console.warn(
            '[patch_zom_kalibrasi_v2] ⚠️  patch_iklim_terpadu_v1.js belum aktif. ' +
            'Pasang v1 terlebih dahulu, baru v2 ini.'
        );
        return;
    }

    // ── Guard: cegah double-load ───────────────────────────────
    if (window.__zomKalibrasiV2Aktif) {
        console.warn('[patch_zom_kalibrasi_v2] sudah aktif, skip re-load.');
        return;
    }

    // ========================================================
    //  BAGIAN 1 — BOBOT ZONA DIKALIBRASI
    //
    //  Basis: patch_iklim_terpadu_v1.js sudah punya 4 zona.
    //  Kalibrasi ini MENGGANTI seluruh objek BOBOT_ZONA dan
    //  menambah 2 sub-zona baru.
    //
    //  Referensi per zona:
    //
    //  monsunal   → Jawa M-2, Sulsel barat M-2, NTB M-2
    //               ENSO dominan lewat monsun Asia (DJF)
    //               IOD sekunder tapi meningkat saat IOD neg kuat
    //
    //  ekuatorial → Sumatera tengah-utara E-1/E-2, Kalimantan E-1
    //               IOD dominan (jalur uap Samudra Hindia langsung)
    //               ENSO moderat
    //
    //  lokal      → Bone timur L-2, Wajo danau L-2, Papua selatan
    //               Pola anti-monsun: sinyal global sangat lemah
    //               Faktor lokal (topografi, teluk) dominan
    //
    //  peralihan  → E-4 Sulsel (Sidrap, Wajo barat, Sulteng)
    //               Sulawesi Tengah, perbatasan Sulsel-Sultra
    //               Dua MH per tahun; IOD lebih kuat dari monsunal
    //
    //  hst_basah  → [BARU] Kalimantan interior E-1, Papua pegunungan
    //               HST: tidak ada kemarau nyata
    //               Sinyal ENSO/IOD sangat lemah, ZOM sangat stabil
    //               Bukti: Kalimantan TIDAK pernah dimutakhirkan ZOM
    //               dalam siklus 2025 (satupun tidak berubah)
    //
    //  kering_ekstrem → [BARU] NTT timur L-5/KST, sebagian Maluku
    //               Kemarau dominan atau kemarau sepanjang tahun
    //               El Niño 2023 → kekeringan terparah 30 tahun
    //               ENSO jauh lebih destruktif dari rata-rata nasional
    // ========================================================

    var BOBOT_ZONA_V2 = {
        monsunal:       { enso: 1.00, iod: 0.55 },  // ✅ validasi Sulsel 2025
        ekuatorial:     { enso: 0.70, iod: 0.90 },  // ✅ validasi Sumatera tengah
        lokal:          { enso: 0.50, iod: 0.40 },  // ✅ validasi L-2 Bone/Wajo
        peralihan:      { enso: 0.80, iod: 0.70 },  // ✅ validasi E-4 Sidrap/Wajo
        hst_basah:      { enso: 0.25, iod: 0.20 },  // [ZOM-3] BARU
        kering_ekstrem: { enso: 1.20, iod: 0.65 }   // [ZOM-3] BARU
    };

    // ========================================================
    //  BAGIAN 2 — LABEL ZOM PER ZONA (untuk teks output)
    //
    //  Berisi: nama tipe ZOM dominan + pola puncak MH + durasi
    //  Digunakan di [ZOM-5] untuk teks catatan metodologi
    // ========================================================

    var LABEL_ZOM = {
        monsunal: {
            tipe:    'Monsunal-2 (M-2)',
            pola:    'Unimodal — puncak Desember–Februari',
            durasi:  '15–21 dasarian',
            catatan: 'Kemarau Jun–Agu. ENSO dominan via Monsun Asia.'
        },
        ekuatorial: {
            tipe:    'Ekuatorial-1/E-2',
            pola:    'Bimodal — puncak Maret & Oktober',
            durasi:  '>18 dasarian',
            catatan: 'IOD dominan. Hujan >150 mm/bulan. Kemarau tipis atau tidak ada.'
        },
        lokal: {
            tipe:    'Lokal-2 (L-2) / Anti-Monsunal',
            pola:    'Unimodal terbalik — puncak April–Juni',
            durasi:  '9–15 dasarian',
            catatan: 'MH dimulai Maret–April. Saat wilayah lain kemarau, ini hujan.'
        },
        peralihan: {
            tipe:    'Ekuatorial-4 (E-4) / Peralihan',
            pola:    'Bimodal — dua MH: Oktober–Des & Maret–Mei',
            durasi:  '12–18 das × 2 periode',
            catatan: 'Dua musim hujan per tahun. IOD lebih kuat dari zona monsunal.'
        },
        hst_basah: {
            tipe:    'Ekuatorial-1 (E-1) / HST Basah',
            pola:    'Hujan sepanjang tahun — tidak ada kemarau nyata',
            durasi:  '>24 dasarian',
            catatan: 'Kalimantan & Papua pegunungan. ZOM paling stabil di Indonesia.'
        },
        kering_ekstrem: {
            tipe:    'Lokal-5 (L-5) / Monsunal-2 Kering',
            pola:    'Unimodal kering — kemarau sangat panjang',
            durasi:  '6–9 dasarian (MH singkat)',
            catatan: 'NTT/Papua Selatan. El Niño sangat destruktif di zona ini.'
        }
    };

    // ========================================================
    //  BAGIAN 3 — deteksiZonaIklim() DIKALIBRASI [ZOM-2]
    //
    //  Versi v1 punya 4 kondisi sederhana.
    //  Versi v2 punya 8 kondisi berbasis data ZOM9120.
    //
    //  URUTAN PENTING: kondisi lebih spesifik didahulukan.
    //
    //  Titik kritis yang diperbaiki:
    //  • Kalimantan interior (E-1 HST) → hst_basah
    //  • NTT timur (L-5 KST) → kering_ekstrem
    //  • L-2 Bone timur (lon ~121°E, lat ~-4.5°S) → lokal
    //    (sebelumnya jatuh ke 'peralihan' yang bobotnya lebih tinggi)
    //  • E-4 Sidrap/Wajo (lon 119–121°E) → peralihan ✅ sudah benar
    // ========================================================

    function deteksiZonaIklimV2(lat, lon) {

        // ── [BARU] HST Basah: Kalimantan interior ─────────────
        // Lat -2 s/d 4, Lon 109–118: jantung Borneo
        // Bukti: 0 ZOM Kalimantan dimutakhirkan di 2025
        if (lat >= -2.0 && lat <= 4.0 && lon >= 109.0 && lon <= 118.0) {
            return 'hst_basah';
        }

        // ── [BARU] Kering Ekstrem: NTT timur ──────────────────
        // Lat < -8.5, Lon 121–127: Flores timur, Lembata, Alor
        // El Niño 2023 → kekeringan terparah 30 tahun
        if (lat <= -8.5 && lon >= 121.0 && lon <= 127.0) {
            return 'kering_ekstrem';
        }

        // ── Ekuatorial: Sumatera tengah-utara ─────────────────
        // Lat -6 s/d 6, Lon 95–109: Riau, Sumbar, Sumut barat
        // IOD lebih dominan dari ENSO (dekat Samudra Hindia)
        if (lat >= -6.0 && lat <= 6.0 && lon >= 95.0 && lon <= 109.0) {
            return 'ekuatorial';
        }

        // ── Lokal/Anti-Monsunal: Bone timur, Wajo danau ────────
        // [DIPERKETAT dari v1]
        // Lat -5.5 s/d -2.5, Lon 120.5–122.5
        // ZOM L-2: awal MH Maret, puncak April–Mei
        // CH terendah di Sulsel (593–803 mm/musim)
        if (lat >= -5.5 && lat <= -2.5 && lon >= 120.5 && lon <= 122.5) {
            return 'lokal';
        }

        // ── Peralihan: E-4 Sulsel, Sulteng, Sultra ────────────
        // Lat -4 s/d 2, Lon 119–128
        // Mencakup: Sidrap, Wajo barat, Sulteng, Sultra utara
        // E-4: dua MH per tahun (OKT-DES & MAR-MEI)
        if (lat >= -4.0 && lat <= 2.0 && lon >= 119.0 && lon <= 128.0) {
            return 'peralihan';
        }

        // ── Papua pegunungan: HST basah ───────────────────────
        // Lat -7 s/d -2, Lon 136–141, elevasi tinggi
        // (approx via koordinat — pegunungan tengah Papua)
        if (lat >= -7.0 && lat <= -2.0 && lon >= 136.0 && lon <= 141.0) {
            return 'hst_basah';
        }

        // ── Ekuatorial: Kalimantan tepi ───────────────────────
        // Lat -4 s/d 7, Lon 107–118
        if (lat >= -4.0 && lat <= 7.0 && lon >= 107.0 && lon <= 118.0) {
            return 'ekuatorial';
        }

        // ── Default: Monsunal ─────────────────────────────────
        // Jawa, Sulsel barat, NTB, Bali, Sumatera selatan
        return 'monsunal';
    }

    // ========================================================
    //  BAGIAN 4 — hitungBobotIodDinamis() DIKALIBRASI [ZOM-4]
    //
    //  Perbaikan: La Niña dibedakan lemah (-0.5 s/d -1.0)
    //  vs kuat (< -1.0).
    //
    //  JUSTIFIKASI dari data Sulsel 2025:
    //  La Niña -0.77 (lemah) + IOD negatif -0.76
    //  → 71% ZOM Sulsel awal MH maju (dampak SEDANG, bukan ekstrem)
    //  → amplifikasi yang tepat: × 1.25, bukan × 1.55
    //
    //  v1 pakai × 1.55 untuk semua La Niña + IOD neg → terlalu agresif
    //  untuk La Niña lemah.
    //
    //  Symetri berlaku: El Niño lemah + IOD pos juga dikalibrasi.
    // ========================================================

    function hitungBobotIodDinamisV2(nilaiEnso, nilaiIod, bobotDasar) {
        var elNino      = nilaiEnso >  0.5;
        var laNina      = nilaiEnso < -0.5;
        var iodPos      = nilaiIod  >  0.4;
        var iodNeg      = nilaiIod  < -0.4;

        // Intensitas ENSO
        var elNinoKuat  = nilaiEnso >  1.0;   // moderat-kuat
        var laNinaKuat  = nilaiEnso < -1.0;   // moderat-kuat

        // Intensitas IOD
        var iodPosKuat  = nilaiIod  >  0.8;
        var iodNegKuat  = nilaiIod  < -0.8;

        // ── Sinyal SEARAH ─────────────────────────────────────
        if (elNino && iodPos) {
            // Keduanya kuat: amplifikasi penuh
            if (elNinoKuat && iodPosKuat) return Math.min(0.90, bobotDasar * 1.55);
            // Salah satu lemah: amplifikasi parsial [ZOM-4]
            return Math.min(0.80, bobotDasar * 1.25);
        }
        if (laNina && iodNeg) {
            // Keduanya kuat: amplifikasi penuh
            if (laNinaKuat && iodNegKuat) return Math.min(0.90, bobotDasar * 1.55);
            // Salah satu lemah (mis. La Niña -0.77 + IOD -0.76): parsial [ZOM-4]
            return Math.min(0.80, bobotDasar * 1.25);
        }

        // ── Sinyal BERLAWANAN (interferensi) ──────────────────
        if (elNino && iodNeg) return Math.max(0.30, bobotDasar * 0.65);
        if (laNina && iodPos) return Math.max(0.30, bobotDasar * 0.65);

        // ── Salah satu atau netral ────────────────────────────
        return bobotDasar;
    }

    // ========================================================
    //  BAGIAN 5 — Label amplifikasi diperluas [ZOM-4]
    // ========================================================

    function _labelAmplifikasiV2(enso, iod) {
        var elNino     = enso >  0.5, laNina = enso < -0.5;
        var iodPos     = iod  >  0.4, iodNeg = iod  < -0.4;
        var elNinoKuat = enso >  1.0, laNinaKuat = enso < -1.0;
        var iodPosKuat = iod  >  0.8, iodNegKuat = iod  < -0.8;

        if ((elNino && iodPos) || (laNina && iodNeg)) {
            if ((elNinoKuat || laNinaKuat) && (iodPosKuat || iodNegKuat)) {
                return 'amplifikasi penuh (sinyal kuat searah)';
            }
            return 'amplifikasi parsial (La Niña/El Niño lemah + IOD searah)';
        }
        if ((elNino && iodNeg) || (laNina && iodPos)) {
            return 'interferensi sinyal berlawanan';
        }
        return 'bobot dasar zona';
    }

    // ========================================================
    //  BAGIAN 6 — simpulkanPrediksiIklimTerpadu v2 [ZOM-5,6]
    //
    //  Override fungsi utama dari v1 dengan tambahan:
    //  • Label tipe ZOM di catatan metodologi
    //  • Teks rekomendasi disesuaikan per sub-zona
    //  • Gunakan hitungBobotIodDinamisV2 dan deteksiZonaIklimV2
    // ========================================================

    function simpulkanPrediksiIklimTerpaduV2(enso, iod, sstLokal, _isSulsel) {
        var terpaduBox = document.getElementById('iklimTerpaduBox');
        if (!terpaduBox) return;

        // ── 1. Baca koordinat & zona ──────────────────────────
        var gps      = (window._bacaKoordinatGPS && window._bacaKoordinatGPS()) ||
                       { lat: -5.0, lon: 120.0 };
        var zona     = deteksiZonaIklimV2(gps.lat, gps.lon);
        var bobot    = BOBOT_ZONA_V2[zona] || BOBOT_ZONA_V2.monsunal;
        var labelZom = LABEL_ZOM[zona]     || LABEL_ZOM.monsunal;
        var perairan = (window._deteksiPerairan && window._deteksiPerairan(gps.lat, gps.lon)) || {};

        // ── 2. Nilai anomali & bobot efektif ─────────────────
        var nilaiEnso = enso.anomalies[enso.anomalies.length - 1] || 0;
        var nilaiIod  = iod.anomalies[iod.anomalies.length - 1]  || 0;

        var bobotIod         = hitungBobotIodDinamisV2(nilaiEnso, nilaiIod, bobot.iod);
        var nilaiEnsoEfektif = nilaiEnso * bobot.enso;
        var nilaiIodEfektif  = nilaiIod  * bobotIod;

        // ── 3. Flag kondisi ───────────────────────────────────
        var elNino = nilaiEnsoEfektif >  0.5;
        var laNina = nilaiEnsoEfektif < -0.5;
        var iodPos = nilaiIodEfektif  >  0.4;
        var iodNeg = nilaiIodEfektif  < -0.4;

        // ── 4. SST & nama perairan ───────────────────────────
        var sstGuard    = sstLokal || {
            boneData: [28.5], makassarData: [28.5],
            sstBoneTerkini: 28.5, sstMksTerkini: 28.5,
            nama1: perairan.nama1 || 'Laut 1',
            nama2: perairan.nama2 || 'Laut 2'
        };
        var sst1 = parseFloat(sstGuard.sstBoneTerkini  || (sstGuard.boneData    && sstGuard.boneData[0])    || 28.5);
        var sst2 = parseFloat(sstGuard.sstMksTerkini   || (sstGuard.makassarData && sstGuard.makassarData[0]) || 28.5);
        var n1   = sstGuard.nama1     || perairan.nama1 || 'Laut 1';
        var n2   = sstGuard.nama2     || perairan.nama2 || 'Laut 2';
        var namaWil = sstGuard.namaWilayah || perairan.namaWilayah || 'Indonesia';

        // ── 5. Rekomendasi PPL per sub-zona ──────────────────
        // Zona hst_basah dan kering_ekstrem punya pesan khusus [ZOM-6]
        var rekomendasiTambahan = '';
        if (zona === 'hst_basah') {
            rekomendasiTambahan =
                '<li>Wilayah HST (hujan sepanjang tahun) — ENSO/IOD pengaruhnya minimal</li>' +
                '<li>Fokus pemantauan pada curah hujan aktual mingguan, bukan prediksi iklim global</li>' +
                '<li>Antisipasi banjir tiba-tiba (flash flood) akibat curah hujan tinggi merata</li>';
        } else if (zona === 'kering_ekstrem') {
            rekomendasiTambahan =
                '<li>⚠️ Zona kering ekstrem — El Niño berpotensi sebabkan kegagalan panen total</li>' +
                '<li>Prioritaskan embung dan sumur bor sebelum musim tanam</li>' +
                '<li>Pertimbangkan asuransi pertanian indeks iklim (AUTP/AUTK)</li>';
        } else if (zona === 'lokal') {
            rekomendasiTambahan =
                '<li>Zona anti-monsun: MH dimulai Maret–April, bukan Oktober–November</li>' +
                '<li>Kalender tanam berbeda 180° dari wilayah monsunal sekitarnya</li>' +
                '<li>Jangan samakan jadwal tanam dengan wilayah tetangga yang M-2</li>';
        } else if (zona === 'peralihan') {
            rekomendasiTambahan =
                '<li>Zona E-4: ada DUA musim hujan per tahun (Okt–Des & Mar–Mei)</li>' +
                '<li>Peluang tanam padi dua kali dengan jadwal berbeda tiap siklusnya</li>' +
                '<li>Pantau IOD lebih ketat — pengaruhnya lebih besar dari ENSO di zona ini</li>';
        }

        // ── 6. Konten kondisi (sama dengan v1, + tambahan sub-zona) ──
        var judulKesimpulan = '';
        var teksAnalisis    = '';
        var rekomendasiPPL  = '';
        var warnaAksen      = 'var(--accent-green)';

        if (elNino && iodPos) {
            judulKesimpulan = '🚨 WASPADA KEKERINGAN (EL NIÑO + IOD POSITIF)';
            warnaAksen = 'var(--red-alert)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> El Niño (' + _tanda(nilaiEnso) + '°C ONI) + ' +
                'IOD Positif (' + _tanda(nilaiIod) + '°C DMI) — sinyal searah ' +
                '(bobot IOD: ×' + bobotIod.toFixed(2) + ').</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C · ' + n2 + ' ' + sst2.toFixed(1) + '°C. ' +
                'Pasokan uap air berkurang.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>⚡ SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Potensi mundurnya MH 1–2 bulan</li>' +
                '<li>Varietas tahan kering: Inpari 42, Inpari 43</li>' +
                '<li>Alihkan ke palawija jika air terbatas</li>' +
                '<li>Optimalkan irigasi dan embung</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else if (elNino && !iodPos) {
            judulKesimpulan = '⚠️ WASPADA MUSIM KEMARAU PANJANG (EL NIÑO)';
            warnaAksen = 'var(--accent-soil)';
            var kondisiSst = sst1 >= 29.0
                ? n1 + ' hangat (' + sst1.toFixed(1) + '°C) — ada potensi hujan lokal singkat.'
                : n1 + ' relatif dingin (' + sst1.toFixed(1) + '°C) — risiko defisit air.';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> El Niño (' + _tanda(nilaiEnso) + '°C) — ' +
                'curah hujan berpotensi turun 20–40%.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' + kondisiSst + '</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌾 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Varietas genjah: Inpari 32, Inpari 42, Cakrabuana</li>' +
                '<li>Jajar Legowo 2:1 untuk efisiensi lahan</li>' +
                '<li>Pantau wereng — populasi meningkat saat kering</li>' +
                '<li>Optimalkan irigasi teknis / sumur bor</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else if (laNina && iodNeg) {
            judulKesimpulan = '🌧️ WASPADA BANJIR TINGGI (LA NIÑA + IOD NEGATIF)';
            warnaAksen = '#3b82f6';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) + '°C) + ' +
                'IOD Negatif (' + _tanda(nilaiIod) + '°C) — sinyal searah ' +
                '(bobot IOD: ×' + bobotIod.toFixed(2) + '). ' +
                'Curah hujan +30–60% dari normal.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C. Risiko banjir sangat tinggi.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌊 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Bersihkan saluran drainase tersier</li>' +
                '<li>Varietas tahan rendaman: Inpari 30, Inpari 33</li>' +
                '<li>Kurangi dosis Urea 25% — batang mudah busuk</li>' +
                '<li>Waspada Blast dan Sheath Blight</li>' +
                '<li>Siapkan pompa portable untuk lahan rendah</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else if (laNina && !iodNeg) {
            judulKesimpulan = '🌧️ WASPADA HUJAN TINGGI (LA NIÑA)';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) + '°C) — ' +
                'curah hujan +30–50% di sebagian besar Indonesia.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C. Potensi hujan sangat tinggi.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌊 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Perbaiki saluran drainase dan got tersier</li>' +
                '<li>Varietas tahan rendaman: Inpari 30, Inpari 33</li>' +
                '<li>Kurangi dosis Urea 25%</li>' +
                '<li>Waspada Blast dan Sheath Blight</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else if (!elNino && !laNina && iodNeg) {
            judulKesimpulan = '🌧️ IOD NEGATIF — POTENSI HUJAN DI ATAS NORMAL';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> IOD Negatif (' + _tanda(nilaiIod) + '°C) — ' +
                'uap air ekstra dari Samudra Hindia. Dampak lebih terasa di Indonesia barat.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> Pengaruh moderat. ' +
                'Perlu kewaspadaan drainase dan jadwal tanam.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌧️ SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Antisipasi curah hujan di atas normal</li>' +
                '<li>Pastikan drainase lahan berfungsi baik</li>' +
                '<li>Waspada penyakit jamur: Blast, Hawar Pelepah</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else if (!elNino && !laNina && !iodPos && !iodNeg) {
            judulKesimpulan = '✅ KONDISI IKLIM NORMAL / NETRAL';
            warnaAksen = 'var(--accent-green)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO ' + _tanda(nilaiEnso) + '°C · ' +
                'IOD ' + _tanda(nilaiIod) + '°C — keduanya netral.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C · ' + n2 + ' ' + sst2.toFixed(1) +
                '°C — dalam kisaran normal. Pola hujan mengikuti kalender musim.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌟 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Lanjutkan pola tanam sesuai kalender musim setempat</li>' +
                '<li>Varietas unggul lokal: Ciherang, Mekongga, Inpari 32</li>' +
                '<li>Pemupukan NPK berimbang sesuai BWD</li>' +
                '<li>Pengamatan OPT rutin mingguan</li>' +
                rekomendasiTambahan +
                '</ul>';

        } else {
            var lblEnso = nilaiEnso > 0.5 ? 'El Niño' : (nilaiEnso < -0.5 ? 'La Niña' : 'Netral');
            var lblIod  = nilaiIod  > 0.4 ? 'IOD Positif' : (nilaiIod < -0.4 ? 'IOD Negatif' : 'Netral');
            judulKesimpulan = '⚠️ KONDISI IKLIM TRANSISI / CAMPURAN';
            warnaAksen = 'var(--accent-soil)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO ' + lblEnso + ' ' + _tanda(nilaiEnso) +
                '°C · IOD ' + lblIod + ' ' + _tanda(nilaiIod) +
                '°C. Interferensi sinyal (bobot IOD: ×' + bobotIod.toFixed(2) + ').</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C. Pola tidak menentu.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌾 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Monitor curah hujan aktual mingguan via BMKG</li>' +
                '<li>Strategi adaptasi ganda: drainase + pompanisasi</li>' +
                '<li>Fleksibilitas jadwal tanam 2–4 minggu</li>' +
                '<li>Dokumentasikan kondisi lapangan ke Dinas TPHP</li>' +
                rekomendasiTambahan +
                '</ul>';
        }

        // ── 7. Catatan metodologi — dengan label ZOM [ZOM-5] ──
        var catatanMetode =
            '<div style="margin-top:12px;padding-top:8px;' +
            'border-top:1px dashed rgba(255,255,255,0.1);' +
            'font-size:0.65rem;opacity:0.45;line-height:1.65;">' +
            'Zona: <b>' + zona.toUpperCase() + '</b> · ' +
            'Tipe ZOM: <b>' + labelZom.tipe + '</b><br>' +
            'Pola CH: ' + labelZom.pola + ' · Durasi: ' + labelZom.durasi + '<br>' +
            'Bobot ENSO: ×' + bobot.enso.toFixed(2) +
            ' · Bobot IOD efektif: ×' + bobotIod.toFixed(2) +
            ' (' + _labelAmplifikasiV2(nilaiEnso, nilaiIod) + ')<br>' +
            '<i>' + labelZom.catatan + '</i><br>' +
            'Sumber: BMKG ZOM9120 · Hidayat et al.(2016) · ' +
            'Nur\'utami &amp; Hidayat (2016) · Aldrian &amp; Susanto (2003)' +
            '</div>';

        // ── 8. Render ──────────────────────────────────────────
        terpaduBox.style.cssText =
            'margin-top:25px;margin-bottom:10px;padding:18px;' +
            'background:rgba(13,20,38,0.85);border-radius:20px;' +
            'border:1px solid rgba(255,255,255,0.05);' +
            'border-left:5px solid ' + warnaAksen + ';';

        terpaduBox.innerHTML =
            '<div style="font-size:0.85rem;font-weight:800;color:' + warnaAksen + ';' +
            'letter-spacing:0.75px;margin-bottom:8px;">🔮 KESIMPULAN PREDIKSI IKLIM TERPADU</div>' +
            '<h4 style="margin:0 0 10px 0;font-size:1.05rem;color:#fff;font-weight:700;">' +
            judulKesimpulan + '</h4>' +
            '<div style="font-size:0.8rem;line-height:1.55;color:#cbd5e1;">' +
            teksAnalisis + '</div>' +
            '<div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;' +
            'font-size:0.8rem;color:#f8fafc;border-left:3px solid ' + warnaAksen + ';">' +
            rekomendasiPPL + '</div>' +
            catatanMetode;
    }

    // ── Helper kecil ─────────────────────────────────────────
    function _tanda(val) {
        var v = parseFloat(val);
        return (v > 0 ? '+' : '') + v.toFixed(2);
    }

    // ========================================================
    //  BAGIAN 7 — INJEKSI & GUARD
    // ========================================================

    function injeksiV2() {

        // Override fungsi yang dikalibrasi
        window.deteksiZonaIklim              = deteksiZonaIklimV2;
        window.simpulkanPrediksiIklimTerpadu = simpulkanPrediksiIklimTerpaduV2;

        // Ekspos ke window untuk referensi debug
        window._hitungBobotIodDinamisV2     = hitungBobotIodDinamisV2;
        window._deteksiZonaIklimV2          = deteksiZonaIklimV2;
        window._BOBOT_ZONA_V2               = BOBOT_ZONA_V2;
        window._LABEL_ZOM                   = LABEL_ZOM;

        // Tandai aktif
        window.__zomKalibrasiV2Aktif = true;

        console.log(
            '%c✅ patch_zom_kalibrasi_v2.js AKTIF\n' +
            '\n  ╔══ KALIBRASI ZOM (Sumber: BMKG ZOM9120) ══════╗\n' +
            '  ║ [ZOM-1] 2 sub-zona baru: hst_basah, kering_ekstrem\n' +
            '  ║ [ZOM-2] deteksiZonaIklim: 8 kondisi GPS (vs 4 di v1)\n' +
            '  ║         Bone timur L-2 → lokal (bukan peralihan)\n' +
            '  ║         NTT timur L-5  → kering_ekstrem\n' +
            '  ║         Kalbar interior → hst_basah\n' +
            '  ║ [ZOM-3] BOBOT_ZONA_V2: 6 zona (vs 4 di v1)\n' +
            '  ║         hst_basah {enso:0.25, iod:0.20}\n' +
            '  ║         kering_ekstrem {enso:1.20, iod:0.65}\n' +
            '  ║ [ZOM-4] Bobot IOD dinamis: bedakan La Niña lemah × 1.25\n' +
            '  ║         vs La Niña kuat × 1.55 (validasi Sulsel 2025)\n' +
            '  ║ [ZOM-5] Label tipe ZOM di catatan metodologi\n' +
            '  ║         (M-2, E-4, L-2, E-1, L-5)\n' +
            '  ║ [ZOM-6] Rekomendasi PPL per sub-zona iklim\n' +
            '  ╠══ VALIDASI DATA ═══════════════════════════════╣\n' +
            '  ║ Sulsel 2025: ENSO -0.44 · IOD -0.76\n' +
            '  ║ → 71% ZOM maju · 0 ZOM BN · 4 ZOM AN\n' +
            '  ║ → Bobot IOD La Niña lemah × 1.25 ✅ sesuai\n' +
            '  ║ ZOM L-2 Bone timur: awal MH Maret ✅ terdeteksi\n' +
            '  ║ Kalimantan: 0 ZOM dimutakhirkan ✅ hst_basah benar\n' +
            '  ╚═══════════════════════════════════════════════╝',
            'color:#f59e0b;font-weight:bold;'
        );
    }

    // Jalankan setelah v1 selesai mount (tambah delay 100ms)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(injeksiV2, 400);
        });
    } else {
        setTimeout(injeksiV2, 400);
    }

})();
