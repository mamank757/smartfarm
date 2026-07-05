/**
 * ============================================================
 * patch_zom_kalibrasi_v2.js
 * Kalibrasi Karakter ZOM — PPL Milenial Wajo
 * ============================================================
 * PASANG SETELAH patch_iklim_terpadu_v1.js
 * (file ini adalah layer kalibrasi di atas konsolidasi v1)
 * FIX v2.1 — RACE CONDITION:
 *   Guard cek __iklimTerpaduV1Aktif dipindah ke dalam
 *   waitForV1() dengan polling setiap 100ms (max 5 detik).
 *   Tidak lagi mati diam-diam saat v1 belum selesai inject.
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

    // ── Guard double-load (cek LANGSUNG, tidak perlu tunggu v1) ──
    if (window.__zomKalibrasiV2Aktif) {
        console.warn('[patch_zom_kalibrasi_v2] sudah aktif, skip re-load.');
        return;
    }
    // ============================================================
    //  BAGIAN 0 — waitForV1()
    //  Polling sampai v1 selesai inject (max 5 detik / 50 tick).
    //  Setelah v1 aktif, baru jalankan injeksiV2().
    //  Ini menggantikan guard return-langsung yang menyebabkan
    //  patch mati diam-diam saat ada race condition timing.
    // ============================================================
    function waitForV1(cb, tick) {
        tick = tick || 0;
        if (window.__iklimTerpaduV1Aktif) {
            cb();
            return;
        }
        if (tick >= 50) {
            // 50 × 100ms = 5 detik — v1 tidak pernah aktif
            console.error(
                '[patch_zom_kalibrasi_v2] ❌ patch_iklim_terpadu_v1.js tidak aktif ' +
                'setelah 5 detik. Pastikan v1 terpasang dan tidak error.'
            );
            return;
        }
        setTimeout(function () { waitForV1(cb, tick + 1); }, 100);
    }

    // ========================================================
    //  BAGIAN 1 — BOBOT ZONA DIKALIBRASI [ZOM-1,3]
    //
    //  monsunal      → Jawa M-2, Sulsel barat M-2, NTB M-2
    //  ekuatorial    → Sumatera tengah-utara E-1/E-2, Kalbar E-1
    //  lokal         → Bone timur L-2, Wajo danau L-2, Papua selatan
    //  peralihan     → E-4 Sulsel (Sidrap, Wajo barat), Sulteng
    //  hst_basah     → [BARU] Kalimantan interior E-1, Papua pegunungan
    //                  Bukti: 0 ZOM Kalimantan dimutakhirkan 2025
    //  kering_ekstrem→ [BARU] NTT timur L-5/KST
    //                  El Niño 2023 = kekeringan terparah 30 tahun
    // ========================================================

    var BOBOT_ZONA_V2 = {
        monsunal:       { enso: 1.00, iod: 0.55 },
        ekuatorial:     { enso: 0.70, iod: 0.90 },
        lokal:          { enso: 0.50, iod: 0.40 },
        peralihan:      { enso: 0.80, iod: 0.70 },
        hst_basah:      { enso: 0.25, iod: 0.20 },   // [ZOM-3] BARU
        kering_ekstrem: { enso: 1.20, iod: 0.65 }    // [ZOM-3] BARU
    };

    // ========================================================
    //  BAGIAN 2 — LABEL ZOM PER ZONA [ZOM-5]
    //  Ditampilkan di catatan metodologi output
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
            catatan: 'MH dimulai Maret–April. Saat wilayah lain kemarau, zona ini hujan.'
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
    //  8 kondisi GPS (vs 4 di v1). Urutan: spesifik dulu.
    //
    //  Titik kritis yang diperbaiki dari v1:
    //  • L-2 Bone timur (lat -5.5–-2.5, lon 120.5–122.5) → lokal
    //    (sebelumnya jatuh ke 'peralihan')
    //  • Kalimantan interior → hst_basah (bukan ekuatorial)
    //  • NTT timur → kering_ekstrem
    // ========================================================

    function deteksiZonaIklimV2(lat, lon) {

        // [BARU] HST Basah: Kalimantan interior
        if (lat >= -2.0 && lat <= 4.0 && lon >= 109.0 && lon <= 118.0) {
            return 'hst_basah';
        }

        // [BARU] Kering Ekstrem: NTT timur (Flores timur, Lembata, Alor)
        if (lat <= -8.5 && lon >= 121.0 && lon <= 127.0) {
            return 'kering_ekstrem';
        }

        // Ekuatorial: Sumatera tengah-utara (Riau, Sumbar, Sumut barat)
        if (lat >= -6.0 && lat <= 6.0 && lon >= 95.0 && lon <= 109.0) {
            return 'ekuatorial';
        }

        // [DIPERKETAT] Lokal/Anti-Monsunal: Bone timur, Wajo danau
        // ZOM L-2: awal MH Maret, puncak April–Mei, CH 593–803 mm
        if (lat >= -5.5 && lat <= -2.5 && lon >= 120.5 && lon <= 122.5) {
            return 'lokal';
        }

        // Peralihan: E-4 Sulsel, Sulteng, Sultra utara
        // Mencakup: Sidrap, Wajo barat, Sulteng, Sultra
        if (lat >= -4.0 && lat <= 2.0 && lon >= 119.0 && lon <= 128.0) {
            return 'peralihan';
        }

        // [BARU] Papua pegunungan HST basah
        if (lat >= -7.0 && lat <= -2.0 && lon >= 136.0 && lon <= 141.0) {
            return 'hst_basah';
        }

        // Ekuatorial: Kalimantan tepi (Kalbar, Kaltara)
        if (lat >= -4.0 && lat <= 7.0 && lon >= 107.0 && lon <= 118.0) {
            return 'ekuatorial';
        }

        // Default: Monsunal
        // Jawa, Sulsel barat, NTB, Bali, Sumatera selatan
        return 'monsunal';
    }

    // ========================================================
    //  BAGIAN 4 — hitungBobotIodDinamis() DIKALIBRASI [ZOM-4]
    //
    //  Perbaikan utama: La Niña / El Niño dibedakan intensitas:
    //  • Lemah (-0.5 s/d -1.0): amplifikasi × 1.25
    //  • Kuat  (< -1.0)       : amplifikasi × 1.55
    //
    //  Validasi data Sulsel 2025:
    //  La Niña -0.77 + IOD -0.76 → 71% ZOM maju, sifat Normal
    //  → v1 (× 1.55 semua) terlalu agresif untuk La Niña lemah
    //  → v2 (× 1.25 La Niña lemah) sesuai dampak nyata
    // ========================================================

    function hitungBobotIodDinamisV2(nilaiEnso, nilaiIod, bobotDasar) {
        var elNino      = nilaiEnso >  0.5;
        var laNina      = nilaiEnso < -0.5;
        var iodPos      = nilaiIod  >  0.4;
        var iodNeg      = nilaiIod  < -0.4;

        // Intensitas
        var ensoKuat    = Math.abs(nilaiEnso) >= 1.0;   // moderat-kuat
        var iodKuat     = Math.abs(nilaiIod)  >= 0.8;

        // Sinyal SEARAH ─────────────────────────────────────
        if ((elNino && iodPos) || (laNina && iodNeg)) {
            if (ensoKuat && iodKuat) {
                // Keduanya kuat → amplifikasi penuh
                return Math.min(0.90, bobotDasar * 1.55);
            }
            // Salah satu lemah → amplifikasi parsial [ZOM-4]
            return Math.min(0.80, bobotDasar * 1.25);
        }

        // Sinyal BERLAWANAN (interferensi) ─────────────────
        if ((elNino && iodNeg) || (laNina && iodPos)) {
            return Math.max(0.30, bobotDasar * 0.65);
        }

        // Netral → bobot dasar
        return bobotDasar;
    }

    // ── Helper label amplifikasi ────────────────────────────
    function _labelAmplifikasiV2(enso, iod) {
        var elNino  = enso >  0.5, laNina = enso < -0.5;
        var iodPos  = iod  >  0.4, iodNeg = iod  < -0.4;
        var ensoKuat = Math.abs(enso) >= 1.0;
        var iodKuat  = Math.abs(iod)  >= 0.8;

        if ((elNino && iodPos) || (laNina && iodNeg)) {
            if (ensoKuat && iodKuat) return 'amplifikasi penuh (sinyal kuat searah)';
            return 'amplifikasi parsial (sinyal searah, intensitas lemah)';
        }
        if ((elNino && iodNeg) || (laNina && iodPos)) return 'interferensi sinyal berlawanan';
        return 'bobot dasar zona';
    }

    function _tanda(val) {
        var v = parseFloat(val);
        return (v > 0 ? '+' : '') + v.toFixed(2);
    }

    // ========================================================
    //  BAGIAN 5 — simpulkanPrediksiIklimTerpadu v2 [ZOM-5,6]
    //
    //  Override fungsi utama dari v1. Tambahan:
    //  • Label tipe ZOM di catatan metodologi
    //  • Rekomendasi PPL per sub-zona
    //  • Gunakan hitungBobotIodDinamisV2 & deteksiZonaIklimV2
    // ========================================================

    function simpulkanPrediksiIklimTerpaduV2(enso, iod, sstLokal, _isSulsel) {
        var terpaduBox = document.getElementById('iklimTerpaduBox');
        if (!terpaduBox) return;

        // ── Baca koordinat & zona ─────────────────────────────
        var gps      = (window._bacaKoordinatGPS && window._bacaKoordinatGPS()) ||
                       { lat: -5.0, lon: 120.0 };
        var zona     = deteksiZonaIklimV2(gps.lat, gps.lon);
        var bobot    = BOBOT_ZONA_V2[zona] || BOBOT_ZONA_V2.monsunal;
        var labelZom = LABEL_ZOM[zona]     || LABEL_ZOM.monsunal;
        var perairan = (window._deteksiPerairan && window._deteksiPerairan(gps.lat, gps.lon)) || {};

        // ── Nilai anomali & bobot efektif ─────────────────────
        var nilaiEnso = enso.anomalies[enso.anomalies.length - 1] || 0;
        var nilaiIod  = iod.anomalies[iod.anomalies.length - 1]  || 0;

        var bobotIod         = hitungBobotIodDinamisV2(nilaiEnso, nilaiIod, bobot.iod);
        var nilaiEnsoEfektif = nilaiEnso * bobot.enso;
        var nilaiIodEfektif  = nilaiIod  * bobotIod;

        // ── Flag kondisi ──────────────────────────────────────
        var elNino = nilaiEnsoEfektif >  0.5;
        var laNina = nilaiEnsoEfektif < -0.5;
        var iodPos = nilaiIodEfektif  >  0.4;
        var iodNeg = nilaiIodEfektif  < -0.4;

        // ── SST & nama perairan ───────────────────────────────
        var sstGuard = sstLokal || {
            boneData: [28.5], makassarData: [28.5],
            sstBoneTerkini: 28.5, sstMksTerkini: 28.5,
            nama1: perairan.nama1 || 'Laut 1',
            nama2: perairan.nama2 || 'Laut 2'
        };
        var sst1   = parseFloat(sstGuard.sstBoneTerkini    || (sstGuard.boneData     && sstGuard.boneData[0])     || 28.5);
        var sst2   = parseFloat(sstGuard.sstMksTerkini     || (sstGuard.makassarData && sstGuard.makassarData[0]) || 28.5);
        var n1     = sstGuard.nama1      || perairan.nama1 || 'Laut 1';
        var n2     = sstGuard.nama2      || perairan.nama2 || 'Laut 2';
        var namaWil = sstGuard.namaWilayah || perairan.namaWilayah || 'Indonesia';

        // ── Rekomendasi tambahan per sub-zona [ZOM-6] ─────────
        var rekTambahan = '';
        if (zona === 'hst_basah') {
            rekTambahan =
                '<li>Wilayah HST — ENSO/IOD berpengaruh sangat kecil di sini</li>' +
                '<li>Pantau curah hujan aktual mingguan, bukan prediksi iklim global</li>' +
                '<li>Antisipasi flash flood akibat hujan tinggi merata sepanjang tahun</li>';
        } else if (zona === 'kering_ekstrem') {
            rekTambahan =
                '<li>⚠️ Zona kering ekstrem — El Niño berpotensi sebabkan gagal panen total</li>' +
                '<li>Prioritaskan embung & sumur bor sebelum musim tanam</li>' +
                '<li>Pertimbangkan asuransi pertanian indeks iklim (AUTP/AUTK)</li>';
        } else if (zona === 'lokal') {
            rekTambahan =
                '<li>Zona anti-monsun: MH dimulai Maret–April, bukan Oktober–November</li>' +
                '<li>Kalender tanam berbeda 180° dari wilayah monsunal sekitar</li>' +
                '<li>Jangan samakan jadwal tanam dengan tetangga yang bertipe M-2</li>';
        } else if (zona === 'peralihan') {
            rekTambahan =
                '<li>Zona E-4: ada DUA musim hujan per tahun (Okt–Des & Mar–Mei)</li>' +
                '<li>Peluang padi dua kali dengan jadwal berbeda tiap siklusnya</li>' +
                '<li>Pantau IOD lebih ketat — lebih berpengaruh dari ENSO di zona ini</li>';
        }

        // ── Konten kondisi ────────────────────────────────────
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
                n1 + ' ' + sst1.toFixed(1) + '°C · ' + n2 + ' ' + sst2.toFixed(1) +
                '°C. Pasokan uap air berkurang.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>⚡ SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Potensi mundurnya MH 1–2 bulan</li>' +
                '<li>Varietas tahan kering: Inpari 42, Inpari 43</li>' +
                '<li>Alihkan ke palawija jika air terbatas</li>' +
                '<li>Optimalkan irigasi dan embung</li>' +
                rekTambahan + '</ul>';

        } else if (elNino && !iodPos) {
            judulKesimpulan = '⚠️ WASPADA MUSIM KEMARAU PANJANG (EL NIÑO)';
            warnaAksen = 'var(--accent-soil)';
            var kondisiSst = sst1 >= 29.0
                ? n1 + ' hangat (' + sst1.toFixed(1) + '°C) — ada potensi hujan lokal singkat.'
                : n1 + ' relatif dingin (' + sst1.toFixed(1) + '°C) — risiko defisit air.';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> El Niño (' + _tanda(nilaiEnso) +
                '°C) — CH berpotensi turun 20–40%.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' + kondisiSst + '</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌾 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Varietas genjah: Inpari 32, Inpari 42, Cakrabuana</li>' +
                '<li>Jajar Legowo 2:1 untuk efisiensi lahan</li>' +
                '<li>Pantau wereng — populasi meningkat saat kering</li>' +
                '<li>Optimalkan irigasi teknis / sumur bor</li>' +
                rekTambahan + '</ul>';

        } else if (laNina && iodNeg) {
            judulKesimpulan = '🌧️ WASPADA BANJIR TINGGI (LA NIÑA + IOD NEGATIF)';
            warnaAksen = '#3b82f6';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) +
                '°C) + IOD Negatif (' + _tanda(nilaiIod) + '°C) — sinyal searah ' +
                '(bobot IOD: ×' + bobotIod.toFixed(2) + '). CH +30–60% dari normal.</li>' +
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
                rekTambahan + '</ul>';

        } else if (laNina && !iodNeg) {
            judulKesimpulan = '🌧️ WASPADA HUJAN TINGGI (LA NIÑA)';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) +
                '°C) — CH +30–50% di sebagian besar Indonesia.</li>' +
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
                rekTambahan + '</ul>';

        } else if (!elNino && !laNina && iodNeg) {
            judulKesimpulan = '🌧️ IOD NEGATIF — POTENSI HUJAN DI ATAS NORMAL';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> IOD Negatif (' + _tanda(nilaiIod) +
                '°C) — uap air ekstra dari Samudra Hindia.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> Pengaruh moderat. ' +
                'Perlu kewaspadaan drainase dan jadwal tanam.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌧️ SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Antisipasi curah hujan di atas normal</li>' +
                '<li>Pastikan drainase lahan berfungsi baik</li>' +
                '<li>Waspada penyakit jamur: Blast, Hawar Pelepah</li>' +
                rekTambahan + '</ul>';

        } else if (!elNino && !laNina && !iodPos && !iodNeg) {
            judulKesimpulan = '✅ KONDISI IKLIM NORMAL / NETRAL';
            warnaAksen = 'var(--accent-green)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO ' + _tanda(nilaiEnso) +
                '°C · IOD ' + _tanda(nilaiIod) + '°C — keduanya netral.</li>' +
                '<li><b>📍 ' + namaWil.toUpperCase() + ':</b> ' +
                n1 + ' ' + sst1.toFixed(1) + '°C · ' + n2 + ' ' + sst2.toFixed(1) +
                '°C — dalam kisaran normal.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌟 SARAN & TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Lanjutkan pola tanam sesuai kalender musim setempat</li>' +
                '<li>Varietas unggul lokal: Ciherang, Mekongga, Inpari 32</li>' +
                '<li>Pemupukan NPK berimbang sesuai BWD</li>' +
                '<li>Pengamatan OPT rutin mingguan</li>' +
                rekTambahan + '</ul>';

        } else {
            var lblEnso = nilaiEnso > 0.5 ? 'El Niño' : (nilaiEnso < -0.5 ? 'La Niña' : 'Netral');
            var lblIod  = nilaiIod  > 0.4 ? 'IOD Positif' : (nilaiIod < -0.4 ? 'IOD Negatif' : 'Netral');
            judulKesimpulan = '⚠️ KONDISI IKLIM TRANSISI / CAMPURAN';
            warnaAksen = 'var(--accent-soil)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO ' + lblEnso + ' ' + _tanda(nilaiEnso) +
                '°C · IOD ' + lblIod + ' ' + _tanda(nilaiIod) +
                '°C. Interferensi (bobot IOD: ×' + bobotIod.toFixed(2) + ').</li>' +
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
                rekTambahan + '</ul>';
        }

        // ── Catatan metodologi — dengan label ZOM [ZOM-5] ─────
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

        // ── Render ke DOM ─────────────────────────────────────
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

    // ========================================================
    //  BAGIAN 6 — INJEKSI SETELAH V1 SIAP
    // ========================================================

    function injeksiV2() {

        // Guard double-load (di sini sudah pasti v1 aktif)
        if (window.__zomKalibrasiV2Aktif) return;

        // Override fungsi yang dikalibrasi
        window.deteksiZonaIklim              = deteksiZonaIklimV2;
        window.simpulkanPrediksiIklimTerpadu = simpulkanPrediksiIklimTerpaduV2;

        // Ekspos untuk debug
        window._hitungBobotIodDinamisV2 = hitungBobotIodDinamisV2;
        window._deteksiZonaIklimV2      = deteksiZonaIklimV2;
        window._BOBOT_ZONA_V2           = BOBOT_ZONA_V2;
        window._LABEL_ZOM               = LABEL_ZOM;

        window.__zomKalibrasiV2Aktif = true;

        console.log(
            '%c✅ patch_zom_kalibrasi_v2.js AKTIF\n' +
            '\n  ╔══ KALIBRASI ZOM (BMKG ZOM9120) ══════════════╗\n' +
            '  ║ [ZOM-1] 2 sub-zona baru: hst_basah, kering_ekstrem\n' +
            '  ║ [ZOM-2] 8 kondisi GPS (vs 4 di v1)\n' +
            '  ║         Bone timur L-2 → lokal ✅\n' +
            '  ║         NTT timur L-5  → kering_ekstrem ✅\n' +
            '  ║         Kalbar interior → hst_basah ✅\n' +
            '  ║ [ZOM-3] BOBOT_ZONA_V2: 6 zona\n' +
            '  ║         hst_basah {enso:0.25, iod:0.20}\n' +
            '  ║         kering_ekstrem {enso:1.20, iod:0.65}\n' +
            '  ║ [ZOM-4] La Niña lemah → bobot × 1.25 (bukan × 1.55)\n' +
            '  ║         Validasi: Sulsel 2025 La Niña -0.77 ✅\n' +
            '  ║ [ZOM-5] Label tipe ZOM di catatan metodologi\n' +
            '  ║ [ZOM-6] Rekomendasi PPL per sub-zona\n' +
            '  ║ [FIX]   Race condition waitForV1() polling 100ms\n' +
            '  ╚═══════════════════════════════════════════════╝',
            'color:#f59e0b;font-weight:bold;'
        );
    }

    // ── Tunggu v1 aktif, baru inject ─────────────────────────
    waitForV1(function () {
        // Tambah jeda 50ms setelah v1 aktif agar semua
        // fungsi v1 sudah terdaftar di window
        setTimeout(injeksiV2, 50);
    });

})();
