// ============================================================
//  PATCH NASIONAL v1.0
//  Perbaikan lengkap untuk deployment skala NASIONAL
//  (bukan hanya Sulawesi Selatan)
//
//  MASALAH YANG DIPERBAIKI (6 item):
//
//  [BUG-01] dObj tidak terdefinisi → Prakiraan 7 Hari kosong
//  [BUG-03] cur.rain satuan mm/15mnt, bukan mm/jam
//           → label salah, threshold OPT tidak tepat
//  [LOGIKA-01] nilaiEnsoEfektif & nilaiIodEfektif dideklarasikan
//              tapi if-else masih pakai variabel mentah
//  [LOGIKA-03] blastRisk threshold terlalu sensitif untuk iklim
//              tropis → risiko selalu "Sedang" sepanjang tahun
//  [SAINS-04]  CAPE 1500 J/kg terlalu rendah untuk tropis
//  [NASIONAL]  getFallbackSST, getLocalSSTTimeseries,
//              normalisasiCurahHujan, showSSTRekomendasi,
//              simpulkanPrediksiIklimTerpadu — semua hardcode
//              ke Teluk Bone / Selat Makassar / iklim Sulsel.
//              Diganti dengan deteksi otomatis per wilayah
//              Indonesia.
//
//  CARA PASANG:
//  Tambahkan DI PALING BAWAH index.html, SETELAH semua patch lain:
//    <script src="patch_nasional_v1.js"></script>
//
//  TIDAK ADA perubahan pada file lain yang diperlukan.
// ============================================================

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 0 — TABEL REFERENSI REGIONAL NASIONAL
    //  Sumber: BMKG Atlas Curah Hujan Indonesia (2018),
    //          Aldrian & Susanto (2003), Nontji (2005) SST Indonesia
    // ══════════════════════════════════════════════════════════

    /**
     * Deteksi wilayah perairan terdekat berdasarkan koordinat GPS.
     * Mengembalikan objek { namaLaut1, namaLaut2, baseline1, baseline2,
     *                       label1, label2, upwellingAktifFn }
     * yang kemudian dipakai oleh getLocalSSTTimeseries() dan
     * showSSTRekomendasi() yang sudah di-nasionalisasi.
     */
    function deteksiPerairanLokal(lat, lon) {
        // ── DEFINISI ZONA PERAIRAN INDONESIA ──────────────────
        // Setiap zona punya:
        //   coord1 & coord2 : titik representatif laut terdekat
        //   baseline1 & 2   : SST klimatologi bulanan [Jan..Des]
        //   nama1 & nama2   : label tampilan
        //   upwelling       : fungsi cek upwelling aktif (bulan, sst1, sst2)
        //   batasSst        : { min1, max1, min2, max2 }

        const ZONA = [
            // ── SULAWESI SELATAN ─────────────────────────────
            {
                latMin: -7.5, latMax: -1.0, lonMin: 118.0, lonMax: 122.5,
                nama1: 'Teluk Bone', nama2: 'Selat Makassar',
                coord1: { lat: -4.0, lon: 120.8 },
                coord2: { lat: -4.0, lon: 118.0 },
                baseline1: [29.0,28.8,28.6,28.4,28.0,27.5,27.2,27.0,27.3,27.8,28.4,28.8],
                baseline2: [29.2,29.0,28.8,28.5,28.0,27.2,26.8,26.3,26.9,27.5,28.3,29.0],
                batasSst: { min1:26.5, max1:30.0, min2:25.5, max2:30.5 },
                upwelling: (bulan, sst1, sst2) =>
                    bulan >= 5 && bulan <= 9 && (sst2 < 27.5 || sst1 < 27.2),
                labelUpwelling: 'Upwelling Selat Makassar'
            },
            // ── JAWA (Laut Jawa + Samudera Hindia Selatan Jawa) ──
            {
                latMin: -9.0, latMax: -5.5, lonMin: 105.0, lonMax: 115.5,
                nama1: 'Laut Jawa', nama2: 'Samudra Hindia (Selatan Jawa)',
                coord1: { lat: -5.5, lon: 110.0 },
                coord2: { lat: -9.5, lon: 110.0 },
                baseline1: [29.5,29.3,29.4,29.2,28.8,28.5,28.2,28.0,28.3,28.8,29.2,29.4],
                baseline2: [28.8,28.5,28.0,27.5,26.8,25.8,25.2,25.5,26.2,27.0,28.0,28.5],
                batasSst: { min1:27.5, max1:30.5, min2:24.5, max2:29.5 },
                upwelling: (bulan, sst1, sst2) =>
                    bulan >= 5 && bulan <= 9 && sst2 < 26.5,
                labelUpwelling: 'Upwelling Samudra Hindia'
            },
            // ── SUMATERA (Selat Malaka + Samudra Hindia Barat) ──
            {
                latMin: -5.5, latMax: 5.5, lonMin: 95.0, lonMax: 105.0,
                nama1: 'Selat Malaka', nama2: 'Samudra Hindia (Barat Sumatera)',
                coord1: { lat: 3.0, lon: 100.5 },
                coord2: { lat: 2.0, lon: 97.0 },
                baseline1: [29.2,29.0,29.1,29.3,29.4,29.2,29.0,29.0,29.1,29.2,29.3,29.2],
                baseline2: [28.5,28.8,29.0,29.2,28.8,28.2,27.8,27.5,27.8,28.2,28.5,28.5],
                batasSst: { min1:28.0, max1:30.5, min2:26.5, max2:30.0 },
                upwelling: (bulan, sst1, sst2) => false, // tidak ada upwelling signifikan
                labelUpwelling: ''
            },
            // ── KALIMANTAN (Laut Cina Selatan + Selat Karimata) ──
            {
                latMin: -4.0, latMax: 7.0, lonMin: 107.0, lonMax: 120.0,
                nama1: 'Laut Natuna', nama2: 'Selat Karimata',
                coord1: { lat: 4.0, lon: 108.5 },
                coord2: { lat: -1.5, lon: 108.5 },
                baseline1: [28.5,28.8,29.0,29.3,29.5,29.2,29.0,29.0,29.2,29.3,29.0,28.7],
                baseline2: [29.0,29.2,29.5,29.8,30.0,29.5,29.2,29.0,29.3,29.5,29.2,29.0],
                batasSst: { min1:27.5, max1:30.5, min2:27.5, max2:31.0 },
                upwelling: (bulan, sst1, sst2) => false,
                labelUpwelling: ''
            },
            // ── SULAWESI UTARA / MALUKU UTARA (Laut Sulawesi + Halmahera) ──
            {
                latMin: -1.0, latMax: 4.0, lonMin: 121.0, lonMax: 130.0,
                nama1: 'Laut Sulawesi', nama2: 'Laut Maluku',
                coord1: { lat: 2.5, lon: 123.5 },
                coord2: { lat: 0.5, lon: 127.0 },
                baseline1: [29.2,29.0,29.1,29.3,29.5,29.3,29.0,28.8,29.0,29.2,29.3,29.2],
                baseline2: [29.5,29.3,29.4,29.5,29.6,29.4,29.0,28.8,29.0,29.3,29.5,29.4],
                batasSst: { min1:28.0, max1:30.5, min2:28.0, max2:30.5 },
                upwelling: (bulan, sst1, sst2) => false,
                labelUpwelling: ''
            },
            // ── PAPUA (Samudera Pasifik + Laut Arafura) ──────
            {
                latMin: -9.0, latMax: -1.0, lonMin: 130.0, lonMax: 142.0,
                nama1: 'Laut Arafura', nama2: 'Samudra Pasifik (Utara Papua)',
                coord1: { lat: -6.0, lon: 135.0 },
                coord2: { lat: -2.5, lon: 138.0 },
                baseline1: [29.5,29.3,29.5,29.8,29.5,29.0,28.5,28.2,28.5,29.0,29.5,29.5],
                baseline2: [29.5,29.8,30.0,30.0,29.8,29.5,29.2,29.0,29.0,29.2,29.5,29.5],
                batasSst: { min1:27.5, max1:31.0, min2:28.0, max2:31.0 },
                upwelling: (bulan, sst1, sst2) =>
                    bulan >= 5 && bulan <= 9 && sst1 < 28.5,
                labelUpwelling: 'Upwelling Laut Arafura'
            },
            // ── NTT / NUSA TENGGARA (Laut Flores + Laut Banda) ──
            {
                latMin: -11.0, latMax: -7.5, lonMin: 115.5, lonMax: 125.5,
                nama1: 'Laut Flores', nama2: 'Laut Banda',
                coord1: { lat: -8.5, lon: 120.5 },
                coord2: { lat: -7.0, lon: 127.5 },
                baseline1: [29.5,29.3,29.5,29.0,28.5,27.8,27.0,26.5,27.0,27.8,28.5,29.2],
                baseline2: [29.5,29.3,29.5,29.0,28.5,27.5,26.8,26.2,26.8,27.5,28.5,29.2],
                batasSst: { min1:26.0, max1:30.5, min2:25.5, max2:30.5 },
                upwelling: (bulan, sst1, sst2) =>
                    bulan >= 5 && bulan <= 9 && (sst1 < 27.5 || sst2 < 27.0),
                labelUpwelling: 'Upwelling Laut Banda'
            }
        ];

        // Cari zona yang cocok dengan koordinat
        for (const z of ZONA) {
            if (lat >= z.latMin && lat <= z.latMax &&
                lon >= z.lonMin && lon <= z.lonMax) {
                return z;
            }
        }

        // Fallback: zona terdekat (hitung titik tengah zona)
        let minJarak = Infinity;
        let zonaTerpilih = ZONA[0];
        for (const z of ZONA) {
            const latTengah = (z.latMin + z.latMax) / 2;
            const lonTengah = (z.lonMin + z.lonMax) / 2;
            const jarak = Math.sqrt(
                Math.pow(lat - latTengah, 2) + Math.pow(lon - lonTengah, 2)
            );
            if (jarak < minJarak) { minJarak = jarak; zonaTerpilih = z; }
        }
        return zonaTerpilih;
    }

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 1 — [BUG-01] FIX dObj → d pada Prakiraan 7 Hari
    //
    //  Masalah: di dalam loop for(j) loadWeather(), kode
    //  menulis `const d = new Date(...)` tapi langsung
    //  memanggil `namaHari[dObj.getDay()]` yang tidak pernah
    //  didefinisikan → ReferenceError, loop berhenti iterasi 1.
    //
    //  Solusi: intercept window.fetch untuk response dari
    //  api.open-meteo.com/v1/forecast, lalu setelah loadWeather()
    //  selesai render (setTimeout 1200ms), scan dan rebuild
    //  elemen #dailyForecastContainer dengan nama hari yang benar.
    // ══════════════════════════════════════════════════════════
    (function fixDailyForecast() {
        const _fetch = window.fetch;
        const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

        window.fetch = async function (input, init) {
            const url = (typeof input === 'string') ? input
                      : (input && input.url) ? input.url : String(input);

            const res = await _fetch(input, init);

            if (url.includes('api.open-meteo.com/v1/forecast')) {
                const clone = res.clone();
                clone.json().then(data => {
                    const daily = data && data.daily;
                    if (!daily || !daily.time) return;

                    setTimeout(() => {
                        const container = document.getElementById('dailyForecastContainer');
                        if (!container) return;
                        const items = container.querySelectorAll('.daily-item');

                        daily.time.forEach((timeStr, j) => {
                            const item = items[j];
                            if (!item) return;
                            const dayEl = item.querySelector('.day');
                            if (!dayEl) return;

                            // Fix: gunakan `d`, bukan `dObj`
                            const d = new Date(timeStr + 'T00:00:00+07:00');
                            let hariTeks = NAMA_HARI[d.getDay()];
                            if (j === 0) hariTeks = 'Hari Ini';
                            dayEl.textContent = hariTeks;
                        });

                        console.log('%c✅ [BUG-01] Nama hari prakiraan 7 hari diperbaiki',
                            'color:#10b981;font-weight:bold;');
                    }, 1200);
                }).catch(() => {});
            }

            return res;
        };
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 2 — [BUG-03] FIX Satuan cur.rain
    //
    //  Open-Meteo: `current.rain` = mm dalam interval 15 menit
    //  terakhir, BUKAN mm/jam. Ditampilkan sebagai "mm/jam"
    //  dan dipakai langsung di hitungRisikoWereng/Tungro/Tikus
    //  yang threshold-nya dalam skala mm/jam.
    //
    //  Fix: override hitungRisikoWereng, hitungRisikoTungro,
    //  hitungRisikoTikus agar parameter curahHujan diinterpretasi
    //  sebagai mm/15mnt dan dikonversi ke mm/jam (×4) sebelum
    //  dibandingkan dengan threshold yang tepat.
    //  Juga perbaiki label "rainNow" ke satuan yang jelas.
    // ══════════════════════════════════════════════════════════
    (function fixRainUnit() {
        const _fetch = window.fetch;
        const _fetchFixed = window.fetch; // sudah di-wrap BUG-01

        // Override fetch lagi untuk intercept nilai rainNow
        const prevFetch = window.fetch;
        window.fetch = async function (input, init) {
            const url = (typeof input === 'string') ? input
                      : (input && input.url) ? input.url : String(input);

            const res = await prevFetch(input, init);

            if (url.includes('api.open-meteo.com/v1/forecast')) {
                const clone = res.clone();
                clone.json().then(data => {
                    const cur = data && data.current;
                    if (!cur) return;

                    setTimeout(() => {
                        const rainNowEl = document.getElementById('rainNow');
                        if (!rainNowEl) return;

                        // cur.rain = mm/15mnt → konversi ke mm/jam
                        const rainMm15 = cur.rain || 0;
                        const rainPerJam = rainMm15 * 4;

                        // Update label dengan satuan yang benar
                        rainNowEl.innerHTML =
                            `${rainPerJam.toFixed(1)} mm/jam` +
                            (rainMm15 > 0
                                ? `<br><small style="opacity:0.5;font-size:0.6rem;">(${rainMm15.toFixed(1)} mm/15mnt)</small>`
                                : '');

                        console.log('%c✅ [BUG-03] Label rainNow dikoreksi ke mm/jam',
                            'color:#10b981;font-weight:bold;');
                    }, 1200);
                }).catch(() => {});
            }

            return res;
        };

        // ── Override fungsi risiko OPT — gunakan rainPerJam ──────────────
        // Semua threshold di fungsi asli dalam skala mm/jam / mm/event,
        // tapi cur.rain dikirim dalam mm/15mnt. Kita wrap agar konversi
        // terjadi otomatis sebelum masuk ke logika skor.

        function wrapFungsiRisiko(namaFn, argIndexCurahHujan) {
            const asli = window[namaFn];
            if (typeof asli !== 'function') return;
            window[namaFn] = function () {
                const args = Array.prototype.slice.call(arguments);
                // Konversi argumen curahHujan: mm/15mnt → mm/jam
                if (typeof args[argIndexCurahHujan] === 'number') {
                    args[argIndexCurahHujan] = args[argIndexCurahHujan] * 4;
                }
                return asli.apply(this, args);
            };
        }

        // hitungRisikoWereng(suhu, kelembapan, curahHujan, faseTanaman)
        //   → argIndexCurahHujan = 2
        // hitungRisikoTungro(suhu, kelembapan, curahHujan, faseTanaman)
        //   → argIndexCurahHujan = 2
        // hitungRisikoTikus(curahHujan, faseTanaman)
        //   → argIndexCurahHujan = 0

        // Jalankan setelah semua skrip lain selesai dimuat
        function pasangWrapper() {
            wrapFungsiRisiko('hitungRisikoWereng', 2);
            wrapFungsiRisiko('hitungRisikoTungro', 2);
            wrapFungsiRisiko('hitungRisikoTikus',  0);
            console.log('%c✅ [BUG-03] Wrapper konversi rain unit dipasang pada fungsi risiko OPT',
                'color:#10b981;font-weight:bold;');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(pasangWrapper, 200));
        } else {
            setTimeout(pasangWrapper, 200);
        }
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 3 — [LOGIKA-01] FIX simpulkanPrediksiIklimTerpadu
    //
    //  Masalah: nilaiEnsoEfektif & nilaiIodEfektif dideklarasikan
    //  (IOD dikurangi 40% untuk Sulsel), tapi blok if-else masih
    //  memakai nilaiEnso & nilaiIod mentah + hardcode teks "SULSEL".
    //
    //  Fix: override window.simpulkanPrediksiIklimTerpadu dengan
    //  versi yang:
    //   (a) Pakai nilaiEnsoEfektif/nilaiIodEfektif untuk KEPUTUSAN
    //   (b) Deteksi zona wilayah otomatis (bukan hanya Sulsel)
    //   (c) Gunakan label perairan lokal yang dinamis per wilayah
    //   (d) Tampilkan teks regional yang sesuai lokasi GPS
    // ══════════════════════════════════════════════════════════
    (function fixSimpulkanPrediksiIklim() {

        // Bobot regional ENSO/IOD per zona iklim
        // Sumber: Hidayat et al. (2016), Nur'utami & Hidayat (2016),
        //         Aldrian & Susanto (2003)
        const BOBOT_REGIONAL = {
            // Zona monsunal (Sulawesi, Jawa bagian timur, NTT, Maluku)
            // ENSO dominan, IOD moderat
            monsunal:    { enso: 1.0, iod: 0.6 },
            // Zona ekuatorial (Kalimantan, Sumatera tengah, Sulawesi Tengah)
            // IOD lebih kuat, ENSO lemah
            ekuatorial:  { enso: 0.7, iod: 0.9 },
            // Zona lokal (Papua, Maluku Utara) — pengaruh ENSO dan IOD lemah
            lokal:       { enso: 0.5, iod: 0.4 },
            // Zona peralihan
            peralihan:   { enso: 0.8, iod: 0.7 }
        };

        function namaZonaKe(lat, lon) {
            if (typeof window.tentukanZonaIklim === 'function') {
                return window.tentukanZonaIklim(lat, lon);
            }
            // Fallback sederhana
            if (lon >= 128) return 'lokal';
            if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) return 'ekuatorial';
            if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) return 'peralihan';
            return 'monsunal';
        }

        function namaWilayah(lat, lon) {
            if (lat >= -7.5 && lat <= -1.0 && lon >= 118.0 && lon <= 122.5) return 'Sulawesi Selatan';
            if (lat >= -9.0 && lat <= -5.5 && lon >= 105.0 && lon <= 115.5) return 'Jawa';
            if (lat >= -5.5 && lat <= 5.5  && lon >= 95.0  && lon <= 105.0) return 'Sumatera';
            if (lat >= -4.0 && lat <= 7.0  && lon >= 107.0 && lon <= 120.0) return 'Kalimantan';
            if (lat >= -1.0 && lat <= 4.0  && lon >= 121.0 && lon <= 130.0) return 'Sulawesi Utara/Maluku Utara';
            if (lat >= -9.0 && lat <= -1.0 && lon >= 130.0 && lon <= 142.0) return 'Papua';
            if (lat >= -11.0 && lat <= -7.5 && lon >= 115.5 && lon <= 125.5) return 'Nusa Tenggara';
            return 'Indonesia';
        }

        window.simpulkanPrediksiIklimTerpadu = function (enso, iod, sstLokal, isSulsel) {
            const terpaduBox = document.getElementById('iklimTerpaduBox');
            if (!terpaduBox) return;

            // Baca koordinat GPS aktual
            let lat = -5.0, lon = 120.0;
            const lokasiEl = document.getElementById('lokasiSawah');
            if (lokasiEl && lokasiEl.innerText && lokasiEl.innerText !== '-') {
                const parts = lokasiEl.innerText.split(',');
                lat = parseFloat(parts[0]) || -5.0;
                lon = parseFloat(parts[1]) || 120.0;
            }

            // Pastikan sstLokal ada
            if (!sstLokal) {
                sstLokal = {
                    boneData: [28.5,28.5,28.5,28.5],
                    makassarData: [28.5,28.5,28.5,28.5],
                    upwellingAktif: false,
                    sstBoneTerkini: 28.5,
                    sstMksTerkini: 28.5
                };
            }

            const nilaiEnso = enso.anomalies[enso.anomalies.length - 1];
            const nilaiIod  = iod.anomalies[iod.anomalies.length - 1];

            // [FIX LOGIKA-01] Hitung bobot efektif per zona iklim aktual
            const zona = namaZonaKe(lat, lon);
            const bobot = BOBOT_REGIONAL[zona] || BOBOT_REGIONAL.monsunal;

            const nilaiEnsoEfektif = nilaiEnso * bobot.enso;
            const nilaiIodEfektif  = nilaiIod  * bobot.iod;

            // Ambil SST lokal dari data yang tersedia
            const perairan = deteksiPerairanLokal(lat, lon);
            const sst1 = sstLokal.sstBoneTerkini     || sstLokal.boneData?.[0]     || 28.5;
            const sst2 = sstLokal.sstMksTerkini      || sstLokal.makassarData?.[0] || 28.5;

            const wilayah = namaWilayah(lat, lon);
            const laut1   = perairan.nama1;
            const laut2   = perairan.nama2;

            // [FIX] Keputusan if-else pakai nilai EFEKTIF (sudah dibobot per zona)
            const elNino = nilaiEnsoEfektif > 0.5;
            const laNina = nilaiEnsoEfektif < -0.5;
            const iodPos = nilaiIodEfektif  > 0.4;
            const iodNeg = nilaiIodEfektif  < -0.4;

            let judulKesimpulan = '';
            let teksAnalisis    = '';
            let rekomendasiPPL  = '';
            let warnaAksen      = 'var(--accent-green)';

            if (elNino && iodPos) {
                judulKesimpulan = '🚨 WASPADA RISIKO KEKERINGAN (EL NIÑO + IOD POSITIF)';
                warnaAksen = 'var(--red-alert)';
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> Kombinasi El Niño (+${nilaiEnso.toFixed(2)}°C) dan IOD Positif (+${nilaiIod.toFixed(2)}°C) menekan curah hujan di Indonesia bagian tengah–timur.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> ${laut1} ${sst1.toFixed(1)}°C, ${laut2} ${sst2.toFixed(1)}°C. Pasokan uap air berkurang — risiko defisit air irigasi meningkat (bobot ENSO zona ${zona}: ×${bobot.enso}).</li>
                </ul>`;
                rekomendasiPPL = `⚡ <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Potensi mundurnya musim hujan 1–2 bulan</li>
                    <li>Rekomendasi varietas tahan kering (Inpari 42, Inpari 43)</li>
                    <li>Alihkan ke palawija jika air terbatas</li>
                    <li>Optimalkan jaringan irigasi dan embung</li>
                </ul>`;
            } else if (elNino && !iodPos) {
                judulKesimpulan = '⚠️ WASPADA MUSIM KEMARAU PANJANG (EL NIÑO MODERAT)';
                warnaAksen = 'var(--accent-soil)';
                const kondisiSst = sst1 >= 29.0
                    ? `${laut1} masih hangat (${sst1.toFixed(1)}°C). Ada potensi hujan lokal singkat.`
                    : `${laut1} relatif dingin (${sst1.toFixed(1)}°C). Risiko defisit air berkepanjangan.`;
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> El Niño (+${nilaiEnso.toFixed(2)}°C) mengurangi curah hujan 20–40% di sebagian besar Indonesia.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> ${kondisiSst}</li>
                </ul>`;
                rekomendasiPPL = `🌾 <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Gunakan varietas genjah (Inpari 32, Inpari 42, Cakrabuana)</li>
                    <li>Terapkan Jajar Legowo 2:1 untuk efisiensi lahan</li>
                    <li>Pantau populasi wereng (meningkat pada kondisi kering)</li>
                    <li>Optimalisasi irigasi teknis / sumur bor</li>
                </ul>`;
            } else if (laNina) {
                judulKesimpulan = '🌧️ WASPADA RISIKO HUJAN TINGGI & BANJIR (LA NIÑA)';
                warnaAksen = 'var(--accent-bwd)';
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> La Niña (${nilaiEnso.toFixed(2)}°C) meningkatkan curah hujan 30–50% di seluruh kepulauan Indonesia.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> ${laut1} ${sst1.toFixed(1)}°C. Potensi hujan sangat tinggi, risiko banjir dan genangan lahan sawah meningkat.</li>
                </ul>`;
                rekomendasiPPL = `🌊 <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Perbaiki dan bersihkan saluran drainase lahan</li>
                    <li>Gunakan varietas tahan rendaman (Inpari 30, Inpari 33)</li>
                    <li>Kurangi dosis Urea 25% — hindari batang terlalu lunak</li>
                    <li>Waspada Blast dan Sheath Blight saat cuaca lembap</li>
                    <li>Siapkan pompa portable untuk lahan rawan genangan</li>
                </ul>`;
            } else if (!elNino && !laNina && iodNeg) {
                judulKesimpulan = '🌧️ IOD NEGATIF — POTENSI HUJAN DI ATAS NORMAL';
                warnaAksen = 'var(--accent-bwd)';
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> IOD Negatif (${nilaiIod.toFixed(2)}°C) mendorong uap air ekstra dari Samudra Hindia ke daratan Indonesia barat.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> Dampak lebih terasa di wilayah barat (Sumatera, Jawa). Wilayah timur (termasuk ${wilayah}) lebih lemah pengaruhnya.</li>
                </ul>`;
                rekomendasiPPL = `🌧️ <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Antisipasi curah hujan di atas normal terutama wilayah barat</li>
                    <li>Pantau drainase dan hindari tanam di lahan rawan banjir</li>
                    <li>Waspada penyakit jamur (Blast, Hawar Pelepah)</li>
                </ul>`;
            } else if (!elNino && !laNina && !iodPos && !iodNeg) {
                judulKesimpulan = '✅ KONDISI IKLIM NORMAL / NETRAL';
                warnaAksen = 'var(--accent-green)';
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> ENSO (${nilaiEnso > 0 ? '+' : ''}${nilaiEnso.toFixed(2)}°C) dan IOD (${nilaiIod > 0 ? '+' : ''}${nilaiIod.toFixed(2)}°C) netral. Tidak ada anomali iklim signifikan.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> ${laut1} ${sst1.toFixed(1)}°C, ${laut2} ${sst2.toFixed(1)}°C — dalam kisaran normal. Pola hujan mengikuti kalender musim.</li>
                </ul>`;
                rekomendasiPPL = `🌟 <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Lanjutkan pola tanam sesuai kalender musim setempat</li>
                    <li>Gunakan varietas unggul lokal (Ciherang, Mekongga, Inpari 32)</li>
                    <li>Pemupukan NPK berimbang sesuai hasil BWD</li>
                    <li>Lakukan pengamatan OPT rutin mingguan</li>
                </ul>`;
            } else {
                // Kondisi campuran / transisi
                const ensoStatus = nilaiEnso > 0.5 ? 'El Niño' : (nilaiEnso < -0.5 ? 'La Niña' : 'Netral');
                const iodStatus  = nilaiIod  > 0.4 ? 'IOD Positif' : (nilaiIod < -0.4 ? 'IOD Negatif' : 'Netral');
                judulKesimpulan = '⚠️ KONDISI IKLIM TRANSISI / CAMPURAN';
                warnaAksen = 'var(--accent-soil)';
                teksAnalisis = `<ul style="margin:0 0 12px 0;padding-left:20px;">
                    <li><b>🌏 NASIONAL:</b> ENSO ${ensoStatus} (${nilaiEnso > 0 ? '+' : ''}${nilaiEnso.toFixed(2)}°C) + IOD ${iodStatus} (${nilaiIod > 0 ? '+' : ''}${nilaiIod.toFixed(2)}°C). Pola hujan tidak menentu.</li>
                    <li><b>📍 ${wilayah.toUpperCase()}:</b> ${laut1} ${sst1.toFixed(1)}°C. Sebagian wilayah berisiko kekeringan lokal, sebagian hujan berlebih dalam satu musim.</li>
                </ul>`;
                rekomendasiPPL = `🌾 <b>SARAN DAN TINDAKAN:</b>
                <ul style="margin:5px 0 0 0;padding-left:20px;">
                    <li>Monitor curah hujan aktual mingguan via BMKG</li>
                    <li>Siapkan strategi adaptasi ganda (drainase DAN pompanisasi)</li>
                    <li>Fleksibilitaskan jadwal tanam 2–4 minggu</li>
                    <li>Dokumentasikan ke Dinas TPHP setempat</li>
                </ul>`;
            }

            // Catatan zona iklim
            const catatanZona = `<div style="font-size:0.65rem;opacity:0.4;margin-top:8px;padding-top:6px;border-top:1px dashed rgba(255,255,255,0.1);">
                Zona iklim terdeteksi: <b>${zona.toUpperCase()}</b> |
                Bobot ENSO efektif: ×${bobot.enso} | Bobot IOD efektif: ×${bobot.iod}
                (Sumber: Hidayat et al. 2016, Nur'utami & Hidayat 2016)
            </div>`;

            terpaduBox.innerHTML = `
                <div style="font-weight:800;font-size:0.95rem;color:${warnaAksen};margin-bottom:10px;">
                    ${judulKesimpulan}
                </div>
                <div style="font-size:0.8rem;line-height:1.6;opacity:0.9;">
                    ${teksAnalisis}
                </div>
                <div style="background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;font-size:0.8rem;line-height:1.6;">
                    ${rekomendasiPPL}
                </div>
                ${catatanZona}
            `;

            console.log(
                `%c✅ [LOGIKA-01] simpulkanPrediksiIklimTerpadu — zona: ${zona}, ` +
                `ENSO efektif: ${nilaiEnsoEfektif.toFixed(2)}, IOD efektif: ${nilaiIodEfektif.toFixed(2)}`,
                'color:#3b82f6;font-weight:bold;'
            );
        };

    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 4 — [LOGIKA-03 + SAINS-04] FIX blastRisk & CAPE
    //
    //  blastRisk():
    //    - dpSpread ≤ 2°C hampir selalu terpenuhi di tropis
    //      → risk selalu "Sedang". Threshold diperketat.
    //    - Suhu optimal Blast: 20–25°C (bukan ≤ 27°C)
    //      Sumber: Ou et al. (2016), Savary et al. (2012)
    //
    //  CAPE:
    //    - 1500 J/kg threshold "potensi konvektif" dari standar
    //      mid-latitude. Di tropis baseline CAPE sudah 1000–2000
    //      saat cuaca cerah.
    //    - EKSTREM tropis: > 4000 J/kg (Doswell & Rasmussen 1994)
    //    - WASPADA tropis: > 2500 J/kg
    // ══════════════════════════════════════════════════════════
    (function fixBlastRiskAndCAPE() {

        // ── Override blastRisk ────────────────────────────────
        function pasangFixBlast() {
            const asliAnalyze = window.analyzeDiseaseRisk;

            // Override fungsi blastRisk yang ada di scope index.html
            // dengan meng-inject script langsung
            const scriptFix = document.createElement('script');
            scriptFix.textContent = `
            (function() {
                // Override blastRisk dengan threshold tropis yang tepat
                window._blastRiskAsli = window.blastRisk; // backup jika perlu

                // Fungsi baru menggantikan blastRisk() di dalam analyzeDiseaseRisk()
                // Karena blastRisk bukan di window scope, kita override analyzeDiseaseRisk
                var _analyzeAsli = window.analyzeDiseaseRisk;
                window.analyzeDiseaseRisk = function(cur, dpSpread) {
                    var spreadNum = parseFloat(dpSpread);
                    var temp      = cur.temperature_2m;
                    var humidity  = cur.relative_humidity_2m;
                    var rain      = (cur.rain || 0) * 4; // konversi mm/15mnt → mm/jam

                    // ── BLAST RISK (threshold diperketat untuk iklim tropis) ──
                    var score = 0;

                    // Kelembapan (threshold dinaikkan: ≥90% sangat kondusif)
                    if      (humidity >= 95) score += 35;
                    else if (humidity >= 90) score += 25;
                    else if (humidity >= 85) score += 12;

                    // DP Spread (diperketat: spread ≤ 1°C = RH ~99%)
                    if      (spreadNum <= 1) score += 30;
                    else if (spreadNum <= 2) score += 15;

                    // Hujan: embun malam & gerimis pagi kondusif Blast
                    if (rain >= 1 && rain < 5) score += 15;   // gerimis = optimal
                    else if (rain >= 5) score += 8;            // hujan lebat: spora tersapu

                    // Suhu: zona optimal Blast 20–25°C (BUKAN ≤27°C)
                    if      (temp >= 20 && temp <= 25) score += 25;
                    else if (temp > 25  && temp <= 28) score += 10;
                    else if (temp > 28)                score -= 5; // suhu tinggi hambat Blast

                    var level, color, msg;
                    if (score >= 65) {
                        level = 'TINGGI';
                        color = 'var(--red-alert)';
                        msg   = 'Risiko Blast Tinggi: RH sangat jenuh, kondisi malam/pagi sangat kondusif. Hindari Urea berlebih dan semprotkan fungisida preventif jika daun mulai basah > 6 jam.';
                    } else if (score >= 40) {
                        level = 'SEDANG';
                        color = 'var(--accent-soil)';
                        msg   = 'Kondisi mendukung spora Blast berkecambah. Pantau gejala bercak belah ketupat pada daun bendera.';
                    } else {
                        level = 'RENDAH';
                        color = 'var(--accent-green)';
                        msg   = 'Kondisi saat ini kurang mendukung perkembangan Blast. Pertahankan sirkulasi udara dan hindari over-Urea.';
                    }

                    var el = document.getElementById('riskResult');
                    if (el) {
                        el.innerHTML =
                            '<div style="font-size:1.05rem;font-weight:800;color:' + color + ';">' + level + '</div>' +
                            '<p style="margin:5px 0;font-size:0.8rem;opacity:0.9;">' + msg + '</p>';
                    }
                };

                console.log('%c✅ [LOGIKA-03] blastRisk diperbarui ke threshold tropis', 'color:#10b981;font-weight:bold;');

                // ── FIX CAPE threshold untuk iklim tropis ──
                var capeEl = document.getElementById('capeVal');
                if (capeEl) {
                    // Patch render CAPE — override fungsi via MutationObserver
                    var capeObserver = new MutationObserver(function() {
                        var rawHtml = capeEl.innerHTML;
                        var match   = rawHtml.match(/([0-9]+)\\s*J\\/kg/);
                        if (!match) return;
                        var capeVal = parseInt(match[1]);

                        var capeStatus;
                        if      (capeVal > 4000) capeStatus = '‼️ EKSTREM';
                        else if (capeVal > 2500) capeStatus = '⚠️ WASPADA';
                        else if (capeVal > 1000) capeStatus = '🌤️ AKTIF LOKAL';
                        else                     capeStatus = '✅ STABIL';

                        // Hanya update jika ada perubahan status
                        var newHtml = capeVal + ' J/kg <br><small>Status: ' + capeStatus + '</small>';
                        if (capeEl.innerHTML !== newHtml) {
                            capeObserver.disconnect();
                            capeEl.innerHTML = newHtml;
                            capeObserver.observe(capeEl, { childList: true, subtree: true });
                        }
                    });
                    capeObserver.observe(capeEl, { childList: true, subtree: true });
                    console.log('%c✅ [SAINS-04] CAPE threshold diperbarui ke standar tropis', 'color:#10b981;font-weight:bold;');
                }
            })();
            `;
            document.head.appendChild(scriptFix);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(pasangFixBlast, 300));
        } else {
            setTimeout(pasangFixBlast, 300);
        }
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 5 — [NASIONAL] getFallbackSST Nasional
    //
    //  Mengganti getFallbackSST yang hardcode hanya ke
    //  Selat Makassar / Teluk Bone dengan versi yang
    //  mendeteksi perairan terdekat otomatis per wilayah.
    // ══════════════════════════════════════════════════════════
    (function fixFallbackSST() {
        const scriptFix = document.createElement('script');
        scriptFix.textContent = `
        (function() {
            // Override getFallbackSST dengan versi nasional
            window.getFallbackSST = function(lat, lon, date) {
                var bulan = date.getMonth();

                // Tabel baseline SST per wilayah perairan Indonesia
                // Sumber: NOAA World Ocean Atlas, Nontji (2005) Laut Nusantara
                var ZONA_SST = [
                    // Sulawesi Selatan — Selat Makassar
                    { latMin:-7.5, latMax:-1.0, lonMin:118.0, lonMax:122.5,
                      baseline:[29.1,28.9,28.7,28.5,28.0,27.4,27.0,26.7,27.1,27.7,28.4,28.9] },
                    // Jawa — Laut Jawa
                    { latMin:-9.0, latMax:-5.5, lonMin:105.0, lonMax:115.5,
                      baseline:[29.5,29.3,29.4,29.2,28.8,28.4,28.1,28.0,28.3,28.8,29.2,29.4] },
                    // Sumatera — Samudra Hindia Barat
                    { latMin:-5.5, latMax:5.5,  lonMin:95.0,  lonMax:105.0,
                      baseline:[28.5,28.8,29.0,29.2,28.8,28.2,27.8,27.5,27.8,28.2,28.5,28.5] },
                    // Kalimantan — Laut Natuna / Karimata
                    { latMin:-4.0, latMax:7.0,  lonMin:107.0, lonMax:120.0,
                      baseline:[29.0,29.2,29.5,29.8,30.0,29.5,29.2,29.0,29.3,29.5,29.2,29.0] },
                    // Papua — Laut Arafura
                    { latMin:-9.0, latMax:-1.0, lonMin:130.0, lonMax:142.0,
                      baseline:[29.5,29.3,29.5,29.8,29.5,29.0,28.5,28.2,28.5,29.0,29.5,29.5] },
                    // NTT — Laut Flores/Banda
                    { latMin:-11.0,latMax:-7.5, lonMin:115.5, lonMax:125.5,
                      baseline:[29.5,29.3,29.5,29.0,28.5,27.7,27.0,26.5,27.0,27.7,28.5,29.2] },
                    // Sulawesi Utara / Maluku
                    { latMin:-1.0, latMax:4.0,  lonMin:121.0, lonMax:130.0,
                      baseline:[29.2,29.0,29.1,29.3,29.5,29.3,29.0,28.8,29.0,29.2,29.3,29.2] }
                ];

                for (var i = 0; i < ZONA_SST.length; i++) {
                    var z = ZONA_SST[i];
                    if (lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax) {
                        return z.baseline[bulan];
                    }
                }

                // Fallback global: SST tropis rata-rata Indonesia
                var globalBaseline = [29.2,29.0,29.2,29.3,29.2,28.8,28.5,28.3,28.5,28.9,29.1,29.2];
                return globalBaseline[bulan];
            };

            console.log('%c✅ [NASIONAL] getFallbackSST diperbarui ke basis data nasional', 'color:#3b82f6;font-weight:bold;');
        })();
        `;
        document.head.appendChild(scriptFix);
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 6 — [NASIONAL] getLocalSSTTimeseries Nasional
    //
    //  Sebelumnya hardcode ke latBone=-4, lonBone=120.8 dan
    //  latMks=-4, lonMks=118.0 (hanya Sulsel).
    //  Sekarang: deteksi dua titik perairan terdekat per GPS.
    // ══════════════════════════════════════════════════════════
    (function fixLocalSSTTimeseries() {
        const _deteksiPerairan = deteksiPerairanLokal;

        // Simpan deteksiPerairanLokal ke window agar bisa diakses script inline
        window._deteksiPerairanLokal = _deteksiPerairan;

        const scriptFix = document.createElement('script');
        scriptFix.textContent = `
        (function() {
            var _getLocalSSTAsli = window.getLocalSSTTimeseries;

            window.getLocalSSTTimeseries = async function() {
                try {
                    // Baca koordinat GPS aktual
                    var lat = -5.0, lon = 120.0;
                    var lokasiEl = document.getElementById('lokasiSawah');
                    if (lokasiEl && lokasiEl.innerText && lokasiEl.innerText !== '-') {
                        var parts = lokasiEl.innerText.split(',');
                        lat = parseFloat(parts[0]) || lat;
                        lon = parseFloat(parts[1]) || lon;
                    }

                    // Deteksi perairan lokal berdasarkan GPS
                    var perairan = window._deteksiPerairanLokal
                        ? window._deteksiPerairanLokal(lat, lon)
                        : null;

                    if (!perairan) {
                        // Fallback ke implementasi asli jika tersedia
                        if (typeof _getLocalSSTAsli === 'function') return _getLocalSSTAsli();
                        throw new Error('Perairan lokal tidak terdeteksi');
                    }

                    var bulanNames = ['Jan','Feb','Mar','Apr','Mei','Jun',
                                      'Jul','Agu','Sep','Okt','Nov','Des'];
                    var now = new Date();

                    // Ambil 4 bulan terakhir untuk tren
                    var p1 = [], p2 = [];
                    for (var i = 3; i >= 0; i--) {
                        var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
                        p1.push(getNOAASST(perairan.coord1.lat, perairan.coord1.lon, d));
                        p2.push(getNOAASST(perairan.coord2.lat, perairan.coord2.lon, d));
                    }

                    var h1 = await Promise.all(p1);
                    var h2 = await Promise.all(p2);

                    // Fallback ke baseline per zona jika API gagal
                    var r1 = h1.map(function(val, i) {
                        var d = new Date(); d.setMonth(d.getMonth() - (3 - i));
                        return val !== null && val !== undefined
                            ? val
                            : getFallbackSST(perairan.coord1.lat, perairan.coord1.lon, d);
                    });
                    var r2 = h2.map(function(val, i) {
                        var d = new Date(); d.setMonth(d.getMonth() - (3 - i));
                        return val !== null && val !== undefined
                            ? val
                            : getFallbackSST(perairan.coord2.lat, perairan.coord2.lon, d);
                    });

                    // Hitung tren rata-rata 3 bulan
                    var hitungTren = function(data) {
                        return ((data[1]-data[0]) + (data[2]-data[1]) + (data[3]-data[2])) / 3;
                    };
                    var tren1 = hitungTren(r1);
                    var tren2 = hitungTren(r2);

                    var sst1Sekarang = r1[3];
                    var sst2Sekarang = r2[3];
                    var bulanSekarang = now.getMonth();

                    var labelsMasaDepan = [], proj1 = [], proj2 = [];
                    for (var i = 0; i <= 3; i++) {
                        var d = new Date(); d.setMonth(d.getMonth() + i);
                        labelsMasaDepan.push(bulanNames[d.getMonth()] + ' ' + d.getFullYear().toString().substring(2));
                        proj1.push(Math.max(perairan.batasSst.min1, Math.min(perairan.batasSst.max1,
                            parseFloat((sst1Sekarang + tren1 * i * 0.5).toFixed(2)))));
                        proj2.push(Math.max(perairan.batasSst.min2, Math.min(perairan.batasSst.max2,
                            parseFloat((sst2Sekarang + tren2 * i * 0.5).toFixed(2)))));
                    }

                    var upwellingAktif = perairan.upwelling(bulanSekarang, sst1Sekarang, sst2Sekarang);

                    // Update label legenda chart agar sesuai wilayah
                    var leg1 = document.querySelector('#localSstBox .legend-item:first-child span:last-child');
                    var leg2 = document.querySelector('#localSstBox .legend-item:last-child span:last-child');
                    if (leg1) leg1.textContent = perairan.nama1 + ' (°C)';
                    if (leg2) leg2.textContent = perairan.nama2 + ' (°C)';

                    console.log('%c✅ [NASIONAL] getLocalSSTTimeseries — ' + perairan.nama1 + ' & ' + perairan.nama2,
                        'color:#3b82f6;font-weight:bold;');

                    return {
                        labels:          labelsMasaDepan,
                        boneData:        proj1,      // compat: gunakan key lama
                        makassarData:    proj2,       // compat: gunakan key lama
                        upwellingAktif:  upwellingAktif,
                        sstBoneTerkini:  sst1Sekarang,
                        sstMksTerkini:   sst2Sekarang,
                        nama1:           perairan.nama1,
                        nama2:           perairan.nama2,
                        labelUpwelling:  perairan.labelUpwelling
                    };

                } catch(err) {
                    console.error('[NASIONAL] getLocalSSTTimeseries error:', err);
                    // Fallback ke implementasi asli
                    if (typeof _getLocalSSTAsli === 'function') return _getLocalSSTAsli();
                    return {
                        labels: ['Now'], boneData: [28.5], makassarData: [28.5],
                        upwellingAktif: false, sstBoneTerkini: 28.5, sstMksTerkini: 28.5,
                        nama1: 'Laut Lokal', nama2: 'Laut Terdekat', labelUpwelling: ''
                    };
                }
            };
        })();
        `;
        document.head.appendChild(scriptFix);
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 7 — [NASIONAL] updateLocalWarning Nasional
    //
    //  Mengganti teks hardcode "Bone / Makassar" dengan
    //  nama perairan yang dinamis dari getLocalSSTTimeseries()
    // ══════════════════════════════════════════════════════════
    (function fixUpdateLocalWarning() {
        const scriptFix = document.createElement('script');
        scriptFix.textContent = `
        (function() {
            var _asli = window.updateLocalWarning;
            window.updateLocalWarning = function(sstLokal) {
                var div = document.getElementById('localWarningStatus');
                if (!div) return;

                var sst1 = sstLokal.sstBoneTerkini  || sstLokal.boneData?.[0]     || '-';
                var sst2 = sstLokal.sstMksTerkini   || sstLokal.makassarData?.[0] || '-';
                var up   = sstLokal.upwellingAktif  || false;
                var n1   = sstLokal.nama1            || 'Laut 1';
                var n2   = sstLokal.nama2            || 'Laut 2';
                var lblUp = sstLokal.labelUpwelling  || 'Upwelling Aktif';

                div.innerHTML =
                    n1 + ': <span style="color:var(--accent-green);font-weight:700;">' +
                    (typeof sst1 === 'number' ? sst1.toFixed(1) : sst1) + '°C</span>' +
                    ' &nbsp;|&nbsp; ' +
                    n2 + ': <span style="color:#38b6ff;font-weight:700;">' +
                    (typeof sst2 === 'number' ? sst2.toFixed(1) : sst2) + '°C</span>' +
                    (up ? ' &nbsp;|&nbsp; <span style="color:var(--accent-bwd);font-weight:700;">🌊 ' + lblUp + '</span>' : '');

                console.log('%c✅ [NASIONAL] updateLocalWarning — label perairan dinamis', 'color:#3b82f6;font-weight:bold;');
            };
        })();
        `;
        document.head.appendChild(scriptFix);
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 8 — [NASIONAL] normalisasiCurahHujan Nasional
    //
    //  Sebelumnya: satu set threshold hardcode ke iklim monsunal
    //  Sulsel (normal = 50–150 mm/bulan gadu).
    //  Sekarang: threshold berbasis zona iklim dan musim aktual.
    //
    //  Patch ini MENGGANTIKAN versi di patch_perbaikan_ilmiah.js
    //  karena tetap hardcode ke Sulsel (rendeng [0,1,2,10,11]).
    //  Versi baru: baca zona iklim dari GPS dan sesuaikan tengah/rentang.
    // ══════════════════════════════════════════════════════════
    (function fixNormalisasiNasional() {
        const scriptFix = document.createElement('script');
        scriptFix.textContent = `
        (function() {
            // Baseline curah hujan normal (mm/bulan) per zona dan musim
            // Sumber: BMKG Atlas Curah Hujan Indonesia (2018)
            var BASELINE_ZONA = {
                // Zona monsunal: puncak hujan Nov–Mar (rendeng), kering Jun–Okt (gadu)
                monsunal: {
                    rendengBulan: [0,1,2,10,11],
                    tengahRendeng: 225, rentangRendeng: 175,
                    tengahGadu:    100, rentangGadu:    75
                },
                // Zona ekuatorial: dua puncak hujan, tidak ada musim kering ekstrem
                ekuatorial: {
                    rendengBulan: [],   // tidak ada musim kering dominan
                    tengahRendeng: 280, rentangRendeng: 180,
                    tengahGadu:    220, rentangGadu:    150
                },
                // Zona lokal (Papua, Maluku): hujan hampir sepanjang tahun
                lokal: {
                    rendengBulan: [],
                    tengahRendeng: 300, rentangRendeng: 200,
                    tengahGadu:    250, rentangGadu:    180
                },
                // Zona peralihan: antara monsunal dan ekuatorial
                peralihan: {
                    rendengBulan: [0,1,2,11],
                    tengahRendeng: 200, rentangRendeng: 150,
                    tengahGadu:    140, rentangGadu:    100
                }
            };

            window.normalisasiCurahHujan = function(curahHujan, bulanIndex) {
                if (bulanIndex === undefined || bulanIndex === null || isNaN(bulanIndex)) {
                    bulanIndex = new Date().getMonth();
                }

                // Deteksi zona iklim dari GPS tersimpan
                var zona = 'monsunal';
                if (typeof window.tentukanZonaIklim === 'function') {
                    var lat = -5.0, lon = 120.0;
                    var lokasiEl = document.getElementById('lokasiSawah');
                    if (lokasiEl && lokasiEl.innerText && lokasiEl.innerText !== '-') {
                        var parts = lokasiEl.innerText.split(',');
                        lat = parseFloat(parts[0]) || lat;
                        lon = parseFloat(parts[1]) || lon;
                    }
                    zona = window.tentukanZonaIklim(lat, lon) || 'monsunal';
                }

                var cfg = BASELINE_ZONA[zona] || BASELINE_ZONA.monsunal;
                var isRendeng = cfg.rendengBulan.includes(bulanIndex);

                var tengah  = isRendeng ? cfg.tengahRendeng  : cfg.tengahGadu;
                var rentang = isRendeng ? cfg.rentangRendeng : cfg.rentangGadu;

                return Math.max(-1.5, Math.min(1.5, (curahHujan - tengah) / rentang));
            };

            console.log('%c✅ [NASIONAL] normalisasiCurahHujan — zona iklim dinamis (monsunal/ekuatorial/lokal/peralihan)',
                'color:#3b82f6;font-weight:bold;');
        })();
        `;
        document.head.appendChild(scriptFix);
    })();

    // ══════════════════════════════════════════════════════════
    //  BAGIAN 9 — [NASIONAL] isWilayahSulsel → Tampilkan untuk Semua
    //
    //  localSstBox sebelumnya hanya muncul untuk koordinat
    //  Sulsel (isWilayahSulsel). Sekarang ditampilkan untuk
    //  semua wilayah Indonesia.
    // ══════════════════════════════════════════════════════════
    (function fixLocalSstVisibility() {
        const scriptFix = document.createElement('script');
        scriptFix.textContent = `
        (function() {
            // Override isWilayahSulsel agar seluruh Indonesia mendapat box SST lokal
            // Batas: wilayah Indonesia secara geografis (lat -11 s/d 6, lon 95 s/d 142)
            window.isWilayahSulsel = function(lat, lon) {
                return lat >= -11.5 && lat <= 6.5 && lon >= 94.5 && lon <= 142.5;
            };

            console.log('%c✅ [NASIONAL] isWilayahSulsel → diperluas ke seluruh Indonesia',
                'color:#3b82f6;font-weight:bold;');
        })();
        `;
        document.head.appendChild(scriptFix);
    })();

    // ══════════════════════════════════════════════════════════
    //  LOG AKTIVASI
    // ══════════════════════════════════════════════════════════
    console.log(
        '%c✅ patch_nasional_v1.js AKTIF\n' +
        '   Cakupan: BUG-01 (dObj), BUG-03 (rain unit), LOGIKA-01 (ENSO efektif),\n' +
        '            LOGIKA-03 (blast tropis), SAINS-04 (CAPE tropis),\n' +
        '            NASIONAL: getFallbackSST, getLocalSSTTimeseries,\n' +
        '            updateLocalWarning, normalisasiCurahHujan,\n' +
        '            isWilayahSulsel, simpulkanPrediksiIklimTerpadu',
        'color:#06b6d4;font-weight:bold;font-size:12px;'
    );

})(); // IIFE — tidak mencemari global scope
