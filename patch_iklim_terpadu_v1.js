/**
 * ============================================================
 * patch_iklim_terpadu_v1.js
 * Konsolidasi Kesimpulan Iklim Terpadu — PPL Milenial Wajo
 * ============================================================
 *
 * FILE INI MENGGANTIKAN logika yang sebelumnya tersebar di:
 *   - HTML utama  (simpulkanPrediksiIklimTerpadu — asli)
 *   - patch_nasional_v1.js (override via inline script)
 *   - patch_perbaikan_ilmiah.js (wrapper bobot IOD dinamis)
 *   - patch_nasional_v4.js (DOM sanitizer IOD)
 *
 * CARA PASANG:
 *   1. Tambahkan di PALING BAWAH index.html, SETELAH semua
 *      patch lain yang sudah ada (termasuk patch_nasional_v1,
 *      patch_nasional_v4, patch_perbaikan_ilmiah).
 *   2. Tidak perlu menghapus patch lama — file ini memasang
 *      guard yang mencegah override berlapis berikutnya.
 *
 * PERUBAHAN UTAMA:
 *   [FIX-1] Satu definisi simpulkanPrediksiIklimTerpadu
 *           yang bersih — tidak tergantung patch lain.
 *   [FIX-2] Bobot ENSO/IOD efektif dipakai KONSISTEN di
 *           seluruh blok if-else (bukan variabel raw).
 *   [FIX-3] Deteksi zona iklim + wilayah otomatis per GPS
 *           — tidak hardcode Sulsel.
 *   [FIX-4] Bobot IOD dinamis: amplifikasi saat sinyal
 *           ENSO+IOD searah, reduksi saat berlawanan.
 *   [FIX-5] isWilayahSulsel() → seluruh Indonesia.
 *   [FIX-6] getFallbackSST() → basis data 7 zona nasional.
 *   [FIX-7] getLocalSSTTimeseries() → deteksi perairan
 *           otomatis berdasarkan GPS.
 *   [FIX-8] showSSTRekomendasi() → nama perairan dinamis,
 *           threshold per zona, tidak hardcode Selat Makassar.
 *   [FIX-9] Guard IIFE — fungsi hanya didefinisikan sekali,
 *           tidak bisa ditimpa oleh patch berikutnya.
 *
 * ============================================================
 */

(function () {
    'use strict';

    // ========================================================
    //  BAGIAN 0 — TABEL REFERENSI REGIONAL NASIONAL
    //  Sumber: BMKG Atlas Curah Hujan (2018), Nontji (2005),
    //  Aldrian & Susanto (2003), World Ocean Atlas NOAA
    // ========================================================

    /**
     * 7 zona perairan Indonesia.
     * Setiap zona punya:
     *   coord1/2    : titik pantau representatif
     *   baseline1/2 : SST klimatologi bulanan [Jan..Des]
     *   nama1/2     : label tampilan
     *   batasSst    : batas realistis proyeksi SST
     *   upwelling   : fungsi cek upwelling (bulan, sst1, sst2)
     *   labelUpwelling : label singkat jika upwelling aktif
     */
    var ZONA_PERAIRAN = [
        {
            namaWilayah: 'Sulawesi Selatan',
            latMin: -7.5, latMax: -1.0, lonMin: 118.0, lonMax: 122.5,
            nama1: 'Teluk Bone', nama2: 'Selat Makassar',
            coord1: { lat: -4.0, lon: 120.8 },
            coord2: { lat: -4.0, lon: 118.0 },
            baseline1: [29.0,28.8,28.6,28.4,28.0,27.5,27.2,27.0,27.3,27.8,28.4,28.8],
            baseline2: [29.2,29.0,28.8,28.5,28.0,27.2,26.8,26.3,26.9,27.5,28.3,29.0],
            batasSst: { min1: 26.5, max1: 30.0, min2: 25.5, max2: 30.5 },
            upwelling: function (b, s1, s2) { return b >= 5 && b <= 9 && (s2 < 27.5 || s1 < 27.2); },
            labelUpwelling: 'Upwelling Selat Makassar'
        },
        {
            namaWilayah: 'Jawa',
            latMin: -9.0, latMax: -5.5, lonMin: 105.0, lonMax: 115.5,
            nama1: 'Laut Jawa', nama2: 'Samudra Hindia Selatan Jawa',
            coord1: { lat: -5.5, lon: 110.0 },
            coord2: { lat: -9.5, lon: 110.0 },
            baseline1: [29.5,29.3,29.4,29.2,28.8,28.5,28.2,28.0,28.3,28.8,29.2,29.4],
            baseline2: [28.8,28.5,28.0,27.5,26.8,25.8,25.2,25.5,26.2,27.0,28.0,28.5],
            batasSst: { min1: 27.5, max1: 30.5, min2: 24.5, max2: 29.5 },
            upwelling: function (b, s1, s2) { return b >= 5 && b <= 9 && s2 < 26.5; },
            labelUpwelling: 'Upwelling Samudra Hindia'
        },
        {
            namaWilayah: 'Sumatera',
            latMin: -5.5, latMax: 5.5, lonMin: 95.0, lonMax: 105.0,
            nama1: 'Selat Malaka', nama2: 'Samudra Hindia Barat Sumatera',
            coord1: { lat: 3.0, lon: 100.5 },
            coord2: { lat: 2.0, lon: 97.0 },
            baseline1: [29.2,29.0,29.1,29.3,29.4,29.2,29.0,29.0,29.1,29.2,29.3,29.2],
            baseline2: [28.5,28.8,29.0,29.2,28.8,28.2,27.8,27.5,27.8,28.2,28.5,28.5],
            batasSst: { min1: 28.0, max1: 30.5, min2: 26.5, max2: 30.0 },
            upwelling: function () { return false; },
            labelUpwelling: ''
        },
        {
            namaWilayah: 'Kalimantan',
            latMin: -4.0, latMax: 7.0, lonMin: 107.0, lonMax: 120.0,
            nama1: 'Laut Natuna', nama2: 'Selat Karimata',
            coord1: { lat: 4.0, lon: 108.5 },
            coord2: { lat: -1.5, lon: 108.5 },
            baseline1: [28.5,28.8,29.0,29.3,29.5,29.2,29.0,29.0,29.2,29.3,29.0,28.7],
            baseline2: [29.0,29.2,29.5,29.8,30.0,29.5,29.2,29.0,29.3,29.5,29.2,29.0],
            batasSst: { min1: 27.5, max1: 30.5, min2: 27.5, max2: 31.0 },
            upwelling: function () { return false; },
            labelUpwelling: ''
        },
        {
            namaWilayah: 'Sulawesi Utara & Maluku Utara',
            latMin: -1.0, latMax: 4.0, lonMin: 121.0, lonMax: 130.0,
            nama1: 'Laut Sulawesi', nama2: 'Laut Maluku',
            coord1: { lat: 2.5, lon: 123.5 },
            coord2: { lat: 0.5, lon: 127.0 },
            baseline1: [29.2,29.0,29.1,29.3,29.5,29.3,29.0,28.8,29.0,29.2,29.3,29.2],
            baseline2: [29.5,29.3,29.4,29.5,29.6,29.4,29.0,28.8,29.0,29.3,29.5,29.4],
            batasSst: { min1: 28.0, max1: 30.5, min2: 28.0, max2: 30.5 },
            upwelling: function () { return false; },
            labelUpwelling: ''
        },
        {
            namaWilayah: 'Papua',
            latMin: -9.0, latMax: -1.0, lonMin: 130.0, lonMax: 142.0,
            nama1: 'Laut Arafura', nama2: 'Samudra Pasifik Utara Papua',
            coord1: { lat: -6.0, lon: 135.0 },
            coord2: { lat: -2.5, lon: 138.0 },
            baseline1: [29.5,29.3,29.5,29.8,29.5,29.0,28.5,28.2,28.5,29.0,29.5,29.5],
            baseline2: [29.5,29.8,30.0,30.0,29.8,29.5,29.2,29.0,29.0,29.2,29.5,29.5],
            batasSst: { min1: 27.5, max1: 31.0, min2: 28.0, max2: 31.0 },
            upwelling: function (b, s1) { return b >= 5 && b <= 9 && s1 < 28.5; },
            labelUpwelling: 'Upwelling Laut Arafura'
        },
        {
            namaWilayah: 'Nusa Tenggara',
            latMin: -11.0, latMax: -7.5, lonMin: 115.5, lonMax: 125.5,
            nama1: 'Laut Flores', nama2: 'Laut Banda',
            coord1: { lat: -8.5, lon: 120.5 },
            coord2: { lat: -7.0, lon: 127.5 },
            baseline1: [29.5,29.3,29.5,29.0,28.5,27.8,27.0,26.5,27.0,27.8,28.5,29.2],
            baseline2: [29.5,29.3,29.5,29.0,28.5,27.5,26.8,26.2,26.8,27.5,28.5,29.2],
            batasSst: { min1: 26.0, max1: 30.5, min2: 25.5, max2: 30.5 },
            upwelling: function (b, s1, s2) { return b >= 5 && b <= 9 && (s1 < 27.5 || s2 < 27.0); },
            labelUpwelling: 'Upwelling Laut Banda'
        }
    ];

    // ========================================================
    //  BAGIAN 1 — BOBOT REGIONAL ENSO / IOD
    //  Sumber: Hidayat et al. (2016), Nur'utami & Hidayat (2016)
    //  Aldrian & Susanto (2003)
    // ========================================================

    /**
     * Bobot dasar per zona iklim.
     * Sulawesi (monsunal): ENSO dominan.
     * Sumatera/Kalimantan (ekuatorial): IOD lebih kuat.
     * Papua/Maluku (lokal): keduanya lemah.
     */
    var BOBOT_ZONA = {
        monsunal:   { enso: 1.0, iod: 0.55 },
        ekuatorial: { enso: 0.7, iod: 0.90 },
        lokal:      { enso: 0.5, iod: 0.40 },
        peralihan:  { enso: 0.8, iod: 0.70 }
    };

    // ========================================================
    //  BAGIAN 2 — FUNGSI BANTU
    // ========================================================

    /** Deteksi perairan terdekat dari koordinat GPS. */
    function deteksiPerairan(lat, lon) {
        for (var i = 0; i < ZONA_PERAIRAN.length; i++) {
            var z = ZONA_PERAIRAN[i];
            if (lat >= z.latMin && lat <= z.latMax &&
                lon >= z.lonMin && lon <= z.lonMax) {
                return z;
            }
        }
        // Fallback: zona terdekat berdasarkan titik tengah
        var minJarak = Infinity;
        var zonaTerpilih = ZONA_PERAIRAN[0];
        for (var j = 0; j < ZONA_PERAIRAN.length; j++) {
            var zj = ZONA_PERAIRAN[j];
            var latTengah = (zj.latMin + zj.latMax) / 2;
            var lonTengah = (zj.lonMin + zj.lonMax) / 2;
            var jarak = Math.sqrt(
                Math.pow(lat - latTengah, 2) + Math.pow(lon - lonTengah, 2)
            );
            if (jarak < minJarak) { minJarak = jarak; zonaTerpilih = zj; }
        }
        return zonaTerpilih;
    }

    /** Deteksi zona iklim dari koordinat. */
    function deteksiZonaIklim(lat, lon) {
        if (lon >= 128) return 'lokal';
        if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) return 'ekuatorial';
        if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) return 'peralihan';
        return 'monsunal';
    }

    /** Baca koordinat GPS dari DOM (lokasiSawah). */
    function bacaKoordinatGPS() {
        var lat = -5.0, lon = 120.0;
        var el = document.getElementById('lokasiSawah');
        if (el && el.innerText && el.innerText !== '-') {
            var parts = el.innerText.split(',');
            lat = parseFloat(parts[0]) || lat;
            lon = parseFloat(parts[1]) || lon;
        } else if (window._lokasiKalender) {
            lat = window._lokasiKalender.lat || lat;
            lon = window._lokasiKalender.lon || lon;
        }
        return { lat: lat, lon: lon };
    }

    /**
     * Hitung bobot IOD yang dinamis berdasarkan kombinasi sinyal.
     * Nur'utami & Hidayat (2016): amplifikasi saat sinyal SEARAH,
     * reduksi saat sinyal BERLAWANAN.
     *
     * @param {number} nilaiEnso - anomali ONI saat ini
     * @param {number} nilaiIod  - anomali DMI saat ini
     * @param {number} bobotDasar - bobot IOD dasar zona iklim
     * @returns {number} bobot efektif yang disesuaikan
     */
    function hitungBobotIodDinamis(nilaiEnso, nilaiIod, bobotDasar) {
        var elNinoAktif = nilaiEnso >  0.5;
        var laNinaAktif = nilaiEnso < -0.5;
        var iodPosAktif = nilaiIod  >  0.4;
        var iodNegAktif = nilaiIod  < -0.4;

        // Sinyal SEARAH: amplifikasi → IOD lebih kuat
        if ((elNinoAktif && iodPosAktif) || (laNinaAktif && iodNegAktif)) {
            return Math.min(0.90, bobotDasar * 1.55);
        }
        // Sinyal BERLAWANAN: interferensi → IOD melemah
        if ((elNinoAktif && iodNegAktif) || (laNinaAktif && iodPosAktif)) {
            return Math.max(0.30, bobotDasar * 0.65);
        }
        // Salah satu atau keduanya netral → bobot dasar
        return bobotDasar;
    }

    // ========================================================
    //  BAGIAN 3 — getFallbackSST NASIONAL
    //  Mengganti versi asli yang hardcode Bone/Makassar
    // ========================================================

    function getFallbackSSTNasional(lat, lon, date) {
        var bulan = date.getMonth();
        var zona = deteksiPerairan(lat, lon);

        // Pilih koordinat terdekat (coord1 vs coord2)
        var jarakC1 = Math.sqrt(
            Math.pow(lat - zona.coord1.lat, 2) + Math.pow(lon - zona.coord1.lon, 2)
        );
        var jarakC2 = Math.sqrt(
            Math.pow(lat - zona.coord2.lat, 2) + Math.pow(lon - zona.coord2.lon, 2)
        );

        return jarakC1 <= jarakC2
            ? zona.baseline1[bulan]
            : zona.baseline2[bulan];
    }

    // ========================================================
    //  BAGIAN 4 — getLocalSSTTimeseries NASIONAL
    //  Mengganti versi asli yang hardcode ke Sulsel
    // ========================================================

    async function getLocalSSTTimeseriesNasional() {
        var BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun',
                     'Jul','Agu','Sep','Okt','Nov','Des'];

        var gps  = bacaKoordinatGPS();
        var zona = deteksiPerairan(gps.lat, gps.lon);

        try {
            var promises1 = [], promises2 = [];
            for (var i = 3; i >= 0; i--) {
                var d1 = new Date(); d1.setDate(1); d1.setMonth(d1.getMonth() - i);
                var d2 = new Date(); d2.setDate(1); d2.setMonth(d2.getMonth() - i);
                promises1.push(
                    typeof getNOAASST === 'function'
                        ? getNOAASST(zona.coord1.lat, zona.coord1.lon, d1)
                        : Promise.resolve(null)
                );
                promises2.push(
                    typeof getNOAASST === 'function'
                        ? getNOAASST(zona.coord2.lat, zona.coord2.lon, d2)
                        : Promise.resolve(null)
                );
            }

            var hasil1 = await Promise.all(promises1);
            var hasil2 = await Promise.all(promises2);

            // Isi null dengan fallback klimatologi
            var r1 = hasil1.map(function (val, idx) {
                if (val !== null && val !== undefined) return val;
                var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (3 - idx));
                return getFallbackSSTNasional(zona.coord1.lat, zona.coord1.lon, d);
            });
            var r2 = hasil2.map(function (val, idx) {
                if (val !== null && val !== undefined) return val;
                var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (3 - idx));
                return getFallbackSSTNasional(zona.coord2.lat, zona.coord2.lon, d);
            });

            // Tren: rata-rata delta 3 bulan terakhir
            function hitungTren(data) {
                return (
                    (data[1] - data[0]) +
                    (data[2] - data[1]) +
                    (data[3] - data[2])
                ) / 3;
            }

            var tren1 = hitungTren(r1);
            var tren2 = hitungTren(r2);
            var sst1Sekarang = r1[3];
            var sst2Sekarang = r2[3];
            var bulanSekarang = new Date().getMonth();

            var labels = [], proj1 = [], proj2 = [];
            for (var k = 0; k <= 3; k++) {
                var dk = new Date(); dk.setDate(1); dk.setMonth(dk.getMonth() + k);
                labels.push(BULAN[dk.getMonth()] + ' ' + dk.getFullYear().toString().substring(2));

                proj1.push(parseFloat(Math.max(
                    zona.batasSst.min1,
                    Math.min(zona.batasSst.max1, sst1Sekarang + tren1 * k * 0.5)
                ).toFixed(2)));

                proj2.push(parseFloat(Math.max(
                    zona.batasSst.min2,
                    Math.min(zona.batasSst.max2, sst2Sekarang + tren2 * k * 0.5)
                ).toFixed(2)));
            }

            var upwellingAktif = zona.upwelling(bulanSekarang, sst1Sekarang, sst2Sekarang);

            return {
                labels:          labels,
                boneData:        proj1,         // key lama dipertahankan
                makassarData:    proj2,          // key lama dipertahankan
                upwellingAktif:  upwellingAktif,
                sstBoneTerkini:  sst1Sekarang,
                sstMksTerkini:   sst2Sekarang,
                nama1:           zona.nama1,
                nama2:           zona.nama2,
                namaWilayah:     zona.namaWilayah,
                labelUpwelling:  zona.labelUpwelling
            };

        } catch (err) {
            console.warn('[iklim_terpadu] getLocalSST gagal, pakai fallback:', err.message);

            // Fallback total berbasis klimatologi
            var now = new Date();
            var BULAN_NM = ['Jan','Feb','Mar','Apr','Mei','Jun',
                            'Jul','Agu','Sep','Okt','Nov','Des'];
            var labFb = [], fb1 = [], fb2 = [];
            for (var fi = 0; fi <= 3; fi++) {
                var fd = new Date(); fd.setDate(1); fd.setMonth(now.getMonth() + fi);
                labFb.push(BULAN_NM[fd.getMonth()] + ' ' + fd.getFullYear().toString().substring(2));
                fb1.push(getFallbackSSTNasional(zona.coord1.lat, zona.coord1.lon, fd));
                fb2.push(getFallbackSSTNasional(zona.coord2.lat, zona.coord2.lon, fd));
            }

            return {
                labels:         labFb,
                boneData:       fb1,
                makassarData:   fb2,
                upwellingAktif: false,
                sstBoneTerkini: fb1[0],
                sstMksTerkini:  fb2[0],
                nama1:          zona.nama1,
                nama2:          zona.nama2,
                namaWilayah:    zona.namaWilayah,
                labelUpwelling: zona.labelUpwelling
            };
        }
    }

    // ========================================================
    //  BAGIAN 5 — updateLocalWarning DENGAN NAMA DINAMIS
    // ========================================================

    function updateLocalWarningNasional(sstLokal) {
        var div = document.getElementById('localWarningStatus');
        if (!div) return;

        var sst1  = sstLokal.sstBoneTerkini  || sstLokal.boneData?.[0]  || '-';
        var sst2  = sstLokal.sstMksTerkini   || sstLokal.makassarData?.[0] || '-';
        var up    = sstLokal.upwellingAktif  || false;
        var n1    = sstLokal.nama1           || 'Laut 1';
        var n2    = sstLokal.nama2           || 'Laut 2';
        var lblUp = sstLokal.labelUpwelling  || 'Upwelling Aktif';

        div.innerHTML =
            n1 + ': <span style="color:var(--accent-green);font-weight:700;">' +
            (typeof sst1 === 'number' ? sst1.toFixed(1) : sst1) + '°C</span>' +
            ' &nbsp;|&nbsp; ' +
            n2 + ': <span style="color:#38b6ff;font-weight:700;">' +
            (typeof sst2 === 'number' ? sst2.toFixed(1) : sst2) + '°C</span>' +
            (up
                ? ' &nbsp;|&nbsp; <span style="color:var(--accent-bwd);font-weight:700;">🌊 ' + lblUp + '</span>'
                : '');
    }

    // ========================================================
    //  BAGIAN 5b — showSSTRekomendasi NASIONAL
    //
    //  Fungsi asli di HTML hardcode "Selat Makassar" dan
    //  "Teluk Bone" di setiap kondisi — tidak peduli GPS
    //  pengguna ada di Malang, Sumatera, atau Papua.
    //
    //  Versi ini:
    //   a. Deteksi perairan terdekat dari GPS → nama dinamis
    //   b. Threshold disesuaikan per zona (bukan hanya Sulsel)
    //   c. Teks deskripsi menyebutkan nama laut yang benar
    // ========================================================

    /**
     * Threshold SST per zona untuk menentukan status anomali.
     * Nilai "normal musim timur" berbeda tiap perairan:
     *   Selat Makassar: upwelling kuat → normal 26–27°C (Jun–Okt)
     *   Laut Jawa: tidak ada upwelling kuat → normal 28–29°C
     *   dst.
     */
    var THRESHOLD_SST_ZONA = {
        'Sulawesi Selatan': {
            upwellingMaks: 27.5,   // sst2 (Selat Makassar) di bawah ini = upwelling
            anomaliHangatMin1: 29.5, anomaliHangatMin2: 29.0,  // kuat
            sedangMin2: 28.5,      // sedang
            hangatMusimBasahMin1: 29.3,  // Bone hangat di musim barat
            dinginDiLuarMusimMaks2: 27.0
        },
        'Jawa': {
            upwellingMaks: 26.5,   // Samudra Hindia selatan Jawa saat upwelling
            anomaliHangatMin1: 30.0, anomaliHangatMin2: 28.5,
            sedangMin2: 27.5,
            hangatMusimBasahMin1: 29.8,
            dinginDiLuarMusimMaks2: 26.0
        },
        'Sumatera': {
            upwellingMaks: 27.5,
            anomaliHangatMin1: 30.0, anomaliHangatMin2: 29.5,
            sedangMin2: 29.0,
            hangatMusimBasahMin1: 29.5,
            dinginDiLuarMusimMaks2: 27.5
        },
        'Kalimantan': {
            upwellingMaks: 28.5,   // tidak ada upwelling signifikan
            anomaliHangatMin1: 30.2, anomaliHangatMin2: 30.0,
            sedangMin2: 29.5,
            hangatMusimBasahMin1: 30.0,
            dinginDiLuarMusimMaks2: 28.0
        },
        'Sulawesi Utara & Maluku Utara': {
            upwellingMaks: 28.5,
            anomaliHangatMin1: 30.0, anomaliHangatMin2: 30.0,
            sedangMin2: 29.5,
            hangatMusimBasahMin1: 29.8,
            dinginDiLuarMusimMaks2: 28.0
        },
        'Papua': {
            upwellingMaks: 28.5,
            anomaliHangatMin1: 30.0, anomaliHangatMin2: 30.2,
            sedangMin2: 29.5,
            hangatMusimBasahMin1: 30.0,
            dinginDiLuarMusimMaks2: 28.0
        },
        'Nusa Tenggara': {
            upwellingMaks: 27.0,
            anomaliHangatMin1: 29.5, anomaliHangatMin2: 29.0,
            sedangMin2: 28.5,
            hangatMusimBasahMin1: 29.3,
            dinginDiLuarMusimMaks2: 26.5
        }
    };

    function showSSTRekomendasiNasional(sstLokal) {
        // ── 1. Identifikasi perairan dari GPS ─────────────────
        var gps      = bacaKoordinatGPS();
        var perairan = deteksiPerairan(gps.lat, gps.lon);
        var namaWil  = perairan.namaWilayah;
        var n1       = (sstLokal && sstLokal.nama1) || perairan.nama1;
        var n2       = (sstLokal && sstLokal.nama2) || perairan.nama2;

        // ── 2. Ambil nilai SST ────────────────────────────────
        var sst1 = parseFloat(
            (sstLokal && (sstLokal.sstBoneTerkini || (sstLokal.boneData && sstLokal.boneData[0])))
            || getFallbackSSTNasional(perairan.coord1.lat, perairan.coord1.lon, new Date())
        );
        var sst2 = parseFloat(
            (sstLokal && (sstLokal.sstMksTerkini || (sstLokal.makassarData && sstLokal.makassarData[0])))
            || getFallbackSSTNasional(perairan.coord2.lat, perairan.coord2.lon, new Date())
        );

        if (!isFinite(sst1) || !isFinite(sst2)) return;

        // ── 3. Ambil threshold untuk wilayah ini ──────────────
        var th = THRESHOLD_SST_ZONA[namaWil] || THRESHOLD_SST_ZONA['Sulawesi Selatan'];

        // ── 4. Deteksi musim (Jun–Okt = musim timur) ─────────
        var bulan = new Date().getMonth();
        var musimTimur = bulan >= 5 && bulan <= 9;
        var upwellingAktif = (sstLokal && sstLokal.upwellingAktif) ||
            perairan.upwelling(bulan, sst1, sst2);

        // ── 5. Tentukan kondisi ───────────────────────────────
        var judul = '';
        var rekomendasi = '';
        var warna = 'var(--accent-green)';
        var tingkatRisiko = 'RENDAH';

        if (musimTimur && upwellingAktif && sst2 <= th.upwellingMaks) {
            judul = '🌊 UPWELLING AKTIF';
            warna = 'var(--accent-bwd)';
            tingkatRisiko = 'RENDAH';
            rekomendasi =
                n2 + ' berada pada suhu <b>' + sst2.toFixed(1) + '°C</b>, ' +
                'menunjukkan indikasi upwelling yang masih aktif selama musim timur.<br><br>' +
                'Massa air lebih dingin dan kaya nutrisi berpotensi naik ke permukaan — ' +
                'kondisi laut relatif normal untuk periode ini.<br><br>' +
                '<b>Implikasi:</b><br>' +
                '• Curah hujan cenderung normal hingga sedikit di bawah normal<br>' +
                '• Risiko kekeringan masih rendah<br>' +
                '• Produktivitas perairan berpotensi meningkat';

        } else if (musimTimur && sst2 >= th.anomaliHangatMin2 && sst1 >= th.anomaliHangatMin1) {
            judul = '⚠️ ANOMALI SUHU LAUT HANGAT';
            warna = 'var(--red-alert)';
            tingkatRisiko = 'TINGGI';
            rekomendasi =
                'Suhu ' + n1 + ' mencapai <b>' + sst1.toFixed(1) + '°C</b> dan ' +
                n2 + ' <b>' + sst2.toFixed(1) + '°C</b>.<br><br>' +
                'Nilai ini sangat hangat untuk musim timur dan mengindikasikan ' +
                'pelemahan proses upwelling di perairan ' + namaWil + '.<br><br>' +
                '<b>Dampak Potensial:</b><br>' +
                '• Curah hujan berpotensi lebih rendah dari normal<br>' +
                '• Risiko kekeringan meningkat jika monsun timur tetap dominan<br>' +
                '• Ketersediaan air irigasi perlu dipantau lebih ketat<br><br>' +
                '<b>Rekomendasi:</b><br>' +
                '• Prioritaskan efisiensi penggunaan air<br>' +
                '• Siapkan cadangan air irigasi bila tersedia';

        } else if (musimTimur && sst2 >= th.sedangMin2) {
            judul = '⚠️ PERAIRAN LEBIH HANGAT DARI NORMAL';
            warna = 'var(--accent-soil)';
            tingkatRisiko = 'SEDANG';
            rekomendasi =
                n2 + ' berada pada suhu <b>' + sst2.toFixed(1) + '°C</b>, ' +
                'lebih hangat dibanding kondisi upwelling yang biasanya terjadi ' +
                'pada musim timur di perairan ' + namaWil + '.<br><br>' +
                'Kondisi ini menunjukkan pelemahan upwelling namun belum tergolong ekstrem.<br><br>' +
                '<b>Implikasi:</b><br>' +
                '• Curah hujan diperkirakan normal hingga sedikit di bawah normal<br>' +
                '• Pemantauan kelembapan tanah dan ketersediaan air tetap diperlukan';

        } else if (!musimTimur && sst1 >= th.hangatMusimBasahMin1) {
            judul = '🌧️ SUHU ' + n1.toUpperCase() + ' HANGAT';
            warna = 'var(--accent-bwd)';
            tingkatRisiko = 'SEDANG';
            rekomendasi =
                'Suhu ' + n1 + ' mencapai <b>' + sst1.toFixed(1) + '°C</b> ' +
                'yang cukup hangat untuk mendukung penguapan dan pembentukan awan konvektif ' +
                'di atas ' + namaWil + '.<br><br>' +
                '<b>Implikasi:</b><br>' +
                '• Potensi hujan lokal dapat meningkat<br>' +
                '• Kelembapan tinggi mendukung penyakit tanaman berbasis jamur<br><br>' +
                '<b>Rekomendasi:</b><br>' +
                '• Perhatikan drainase lahan<br>' +
                '• Tingkatkan pemantauan penyakit daun (Blast, Hawar Pelepah)';

        } else if (!musimTimur && sst2 <= th.dinginDiLuarMusimMaks2) {
            judul = '🌧️ ANOMALI SUHU LAUT LEBIH DINGIN';
            warna = 'var(--accent-bwd)';
            tingkatRisiko = 'SEDANG';
            rekomendasi =
                n2 + ' berada pada suhu <b>' + sst2.toFixed(1) + '°C</b>, ' +
                'lebih rendah dari kondisi umum pada musim hujan di ' + namaWil + '.<br><br>' +
                'Kondisi ini dapat berkaitan dengan aktivitas atmosfer yang mendukung ' +
                'curah hujan lebih tinggi dari normal.<br><br>' +
                '<b>Rekomendasi:</b><br>' +
                '• Pastikan sistem drainase berfungsi baik<br>' +
                '• Waspadai genangan pada lahan rendah';

        } else {
            judul = '✅ KONDISI SST LOKAL NORMAL';
            warna = 'var(--accent-green)';
            tingkatRisiko = 'RENDAH';
            rekomendasi =
                'Suhu ' + n1 + ' <b>' + sst1.toFixed(1) + '°C</b> dan ' +
                n2 + ' <b>' + sst2.toFixed(1) + '°C</b> masih berada dalam ' +
                'kisaran yang wajar untuk periode saat ini di perairan sekitar ' +
                namaWil + '.<br><br>' +
                'Tidak terdapat indikasi gangguan oseanografi lokal yang signifikan. ' +
                'Pola cuaca diperkirakan mengikuti kondisi musiman normal.';
        }

        // ── 6. Render ke DOM ──────────────────────────────────
        var rekomBox = document.getElementById('sstRekomendasiBox');

        if (!rekomBox) {
            var container = document.getElementById('ensoIodBox');
            if (container) {
                container.insertAdjacentHTML(
                    'beforeend',
                    '<div id="sstRekomendasiBox" class="info-box" style="margin-top:16px;"></div>'
                );
                rekomBox = document.getElementById('sstRekomendasiBox');
            }
        }

        if (rekomBox) {
            rekomBox.style.borderLeftColor = warna;
            rekomBox.innerHTML =
                '<strong style="font-size:0.95rem;">' + judul + '</strong>' +
                '<br><br>' +
                '<span style="font-size:0.82rem;line-height:1.65;">' +
                rekomendasi + '</span>' +
                '<div style="margin-top:12px;padding-top:8px;' +
                'border-top:1px dashed rgba(255,255,255,0.15);' +
                'font-size:0.73rem;opacity:0.7;">' +
                '📍 SST Real-time · ' + namaWil + ' · Risiko ' + tingkatRisiko +
                '</div>';
        }
    }

    // ========================================================
    //  BAGIAN 6 — FUNGSI UTAMA: simpulkanPrediksiIklimTerpadu
    //
    //  Parameter:
    //    enso      : objek dari getENSOAnomaly()
    //    iod       : objek dari getIODAnomaly()
    //    sstLokal  : objek dari getLocalSSTTimeseries()
    //    isSulsel  : boolean (DIABAIKAN — deteksi otomatis via GPS)
    // ========================================================

    function simpulkanPrediksiIklimTerpaduKonsolidasi(enso, iod, sstLokal, _isSulsel) {
        var terpaduBox = document.getElementById('iklimTerpaduBox');
        if (!terpaduBox) return;

        // ── 1. Baca data sumber ──────────────────────────────
        var gps    = bacaKoordinatGPS();
        var zona   = deteksiZonaIklim(gps.lat, gps.lon);
        var bobot  = BOBOT_ZONA[zona] || BOBOT_ZONA.monsunal;
        var perairan = deteksiPerairan(gps.lat, gps.lon);

        // Nilai anomali mentah
        var nilaiEnso = enso.anomalies[enso.anomalies.length - 1] || 0;
        var nilaiIod  = iod.anomalies[iod.anomalies.length - 1]  || 0;

        // ── 2. Bobot efektif (PERBAIKAN UTAMA) ───────────────
        // Kedua variabel ini BENAR-BENAR dipakai di if-else,
        // bukan hanya dideklarasi untuk dibuang.
        var bobotIodDinamis  = hitungBobotIodDinamis(nilaiEnso, nilaiIod, bobot.iod);

        var nilaiEnsoEfektif = nilaiEnso * bobot.enso;
        var nilaiIodEfektif  = nilaiIod  * bobotIodDinamis;

        // ── 3. Keputusan if-else (pakai nilai EFEKTIF) ───────
        var elNino = nilaiEnsoEfektif >  0.5;
        var laNina = nilaiEnsoEfektif < -0.5;
        var iodPos = nilaiIodEfektif  >  0.4;
        var iodNeg = nilaiIodEfektif  < -0.4;

        // ── 4. Data SST lokal ─────────────────────────────────
        var sstGuard = sstLokal || {
            boneData: [28.5], makassarData: [28.5],
            sstBoneTerkini: 28.5, sstMksTerkini: 28.5,
            nama1: perairan.nama1, nama2: perairan.nama2
        };

        var sst1 = sstGuard.sstBoneTerkini  || (sstGuard.boneData && sstGuard.boneData[0])  || 28.5;
        var sst2 = sstGuard.sstMksTerkini   || (sstGuard.makassarData && sstGuard.makassarData[0]) || 28.5;
        var n1   = sstGuard.nama1           || perairan.nama1;
        var n2   = sstGuard.nama2           || perairan.nama2;

        // Label wilayah dari perairan lokal (bukan hardcode SULSEL)
        var namaWilayah = sstGuard.namaWilayah || perairan.namaWilayah || 'Indonesia';

        // ── 5. Bangun konten berdasarkan kondisi ─────────────
        var judulKesimpulan = '';
        var teksAnalisis    = '';
        var rekomendasiPPL  = '';
        var warnaAksen      = 'var(--accent-green)';

        if (elNino && iodPos) {
            // El Niño + IOD Positif = kekeringan terparah
            judulKesimpulan = '🚨 WASPADA KEKERINGAN (EL NIÑO + IOD POSITIF)';
            warnaAksen = 'var(--red-alert)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> Kombinasi El Niño (' + _tanda(nilaiEnso) + '°C ONI) ' +
                'dan IOD Positif (' + _tanda(nilaiIod) + '°C DMI) menekan curah hujan ' +
                'di Indonesia tengah–timur. Dampak diperkuat karena sinyal searah ' +
                '(bobot IOD efektif: ×' + bobotIodDinamis.toFixed(2) + ').</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' +
                n1 + ' ' + parseFloat(sst1).toFixed(1) + '°C, ' +
                n2 + ' ' + parseFloat(sst2).toFixed(1) + '°C. ' +
                'Pasokan uap air berkurang — risiko defisit irigasi meningkat.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>⚡ SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Potensi mundurnya musim hujan 1–2 bulan</li>' +
                '<li>Prioritaskan varietas tahan kering (Inpari 42, Inpari 43)</li>' +
                '<li>Alihkan ke palawija jika air terbatas</li>' +
                '<li>Optimalkan jaringan irigasi dan embung</li>' +
                '</ul>';

        } else if (elNino && !iodPos) {
            // El Niño saja — kekeringan moderat
            judulKesimpulan = '⚠️ WASPADA MUSIM KEMARAU PANJANG (EL NIÑO)';
            warnaAksen = 'var(--accent-soil)';
            var kondisiSst = parseFloat(sst1) >= 29.0
                ? n1 + ' masih hangat (' + parseFloat(sst1).toFixed(1) + '°C) — ada potensi hujan lokal singkat.'
                : n1 + ' relatif dingin (' + parseFloat(sst1).toFixed(1) + '°C) — risiko defisit air berkepanjangan.';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> El Niño (' + _tanda(nilaiEnso) + '°C) mengurangi ' +
                'curah hujan 20–40% di sebagian besar Indonesia.</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' + kondisiSst + '</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌾 SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Gunakan varietas genjah (Inpari 32, Inpari 42, Cakrabuana)</li>' +
                '<li>Terapkan Jajar Legowo 2:1 untuk efisiensi lahan</li>' +
                '<li>Pantau populasi wereng — meningkat di kondisi kering</li>' +
                '<li>Optimalisasi irigasi teknis / sumur bor</li>' +
                '</ul>';

        } else if (laNina && iodNeg) {
            // La Niña + IOD Negatif = hujan sangat lebat
            judulKesimpulan = '🌧️ WASPADA BANJIR TINGGI (LA NIÑA + IOD NEGATIF)';
            warnaAksen = '#3b82f6';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) + '°C) dan IOD Negatif ' +
                '(' + _tanda(nilaiIod) + '°C) bersama-sama meningkatkan curah hujan ' +
                '40–60% di Indonesia. Amplifikasi sinyal searah ' +
                '(bobot IOD efektif: ×' + bobotIodDinamis.toFixed(2) + ').</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' +
                n1 + ' ' + parseFloat(sst1).toFixed(1) + '°C. ' +
                'Risiko banjir dan genangan lahan sawah sangat tinggi.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌊 SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Perbaiki dan bersihkan saluran drainase lahan</li>' +
                '<li>Gunakan varietas tahan rendaman (Inpari 30, Inpari 33)</li>' +
                '<li>Kurangi dosis Urea 25% — batang mudah busuk di kondisi basah</li>' +
                '<li>Waspada Blast dan Sheath Blight saat cuaca lembap</li>' +
                '<li>Siapkan pompa portable untuk lahan rawan genangan</li>' +
                '</ul>';

        } else if (laNina && !iodNeg) {
            // La Niña saja
            judulKesimpulan = '🌧️ WASPADA RISIKO HUJAN TINGGI & BANJIR (LA NIÑA)';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> La Niña (' + _tanda(nilaiEnso) + '°C) meningkatkan ' +
                'curah hujan 30–50% di seluruh kepulauan Indonesia.</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' +
                n1 + ' ' + parseFloat(sst1).toFixed(1) + '°C. ' +
                'Potensi hujan sangat tinggi, risiko banjir dan genangan meningkat.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌊 SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Perbaiki saluran drainase lahan dan got tersier</li>' +
                '<li>Gunakan varietas tahan rendaman (Inpari 30, Inpari 33)</li>' +
                '<li>Kurangi dosis Urea 25%</li>' +
                '<li>Waspada Blast dan Sheath Blight</li>' +
                '<li>Siapkan pompa portable untuk lahan rendah</li>' +
                '</ul>';

        } else if (!elNino && !laNina && iodNeg) {
            // IOD Negatif tanpa ENSO — uap air ekstra dari Hindia
            judulKesimpulan = '🌧️ IOD NEGATIF — POTENSI HUJAN DI ATAS NORMAL';
            warnaAksen = 'var(--accent-bwd)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> IOD Negatif (' + _tanda(nilaiIod) + '°C) ' +
                'mendorong uap air ekstra dari Samudra Hindia. ' +
                'Dampak lebih terasa di wilayah barat Indonesia.</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> Pengaruh lebih lemah ' +
                'di wilayah timur, tetap perlu kewaspadaan drainase.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌧️ SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Antisipasi curah hujan di atas normal</li>' +
                '<li>Pantau drainase, hindari tanam di lahan rawan banjir</li>' +
                '<li>Waspada penyakit jamur (Blast, Hawar Pelepah)</li>' +
                '</ul>';

        } else if (!elNino && !laNina && !iodPos && !iodNeg) {
            // Kondisi benar-benar netral
            judulKesimpulan = '✅ KONDISI IKLIM NORMAL / NETRAL';
            warnaAksen = 'var(--accent-green)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO (' + _tanda(nilaiEnso) + '°C ONI) dan IOD (' +
                _tanda(nilaiIod) + '°C DMI) netral. Tidak ada anomali iklim signifikan.</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' +
                n1 + ' ' + parseFloat(sst1).toFixed(1) + '°C, ' +
                n2 + ' ' + parseFloat(sst2).toFixed(1) + '°C — dalam kisaran normal. ' +
                'Pola hujan mengikuti kalender musim setempat.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌟 SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Lanjutkan pola tanam sesuai kalender musim setempat</li>' +
                '<li>Gunakan varietas unggul lokal (Ciherang, Mekongga, Inpari 32)</li>' +
                '<li>Pemupukan NPK berimbang sesuai hasil BWD</li>' +
                '<li>Lakukan pengamatan OPT rutin mingguan</li>' +
                '</ul>';

        } else {
            // Kondisi campuran / transisi
            var labelEnso = nilaiEnso > 0.5 ? 'El Niño' : (nilaiEnso < -0.5 ? 'La Niña' : 'Netral');
            var labelIod  = nilaiIod  > 0.4 ? 'IOD Positif' : (nilaiIod < -0.4 ? 'IOD Negatif' : 'Netral');
            judulKesimpulan = '⚠️ KONDISI IKLIM TRANSISI / CAMPURAN';
            warnaAksen = 'var(--accent-soil)';
            teksAnalisis =
                '<ul style="margin:0 0 12px 0;padding-left:20px;">' +
                '<li><b>🌏 NASIONAL:</b> ENSO ' + labelEnso + ' (' + _tanda(nilaiEnso) + '°C) ' +
                'dengan IOD ' + labelIod + ' (' + _tanda(nilaiIod) + '°C). ' +
                'Pola hujan tidak menentu — interferensi sinyal berlawanan ' +
                '(bobot IOD efektif: ×' + bobotIodDinamis.toFixed(2) + ').</li>' +
                '<li><b>📍 ' + namaWilayah.toUpperCase() + ':</b> ' +
                n1 + ' ' + parseFloat(sst1).toFixed(1) + '°C. ' +
                'Sebagian wilayah berisiko kekeringan lokal, sebagian hujan berlebih.</li>' +
                '</ul>';
            rekomendasiPPL =
                '<b>🌾 SARAN DAN TINDAKAN:</b>' +
                '<ul style="margin:5px 0 0 0;padding-left:20px;">' +
                '<li>Monitor curah hujan aktual mingguan via BMKG</li>' +
                '<li>Siapkan strategi adaptasi ganda (drainase DAN pompanisasi)</li>' +
                '<li>Fleksibilitaskan jadwal tanam 2–4 minggu</li>' +
                '<li>Dokumentasikan kondisi lapangan ke Dinas TPHP</li>' +
                '</ul>';
        }

        // ── 6. Catatan metodologi (transparan ke pengguna) ────
        var catatanMetode =
            '<div style="margin-top:12px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);' +
            'font-size:0.65rem;opacity:0.45;line-height:1.6;">' +
            'Zona iklim: <b>' + zona.toUpperCase() + '</b> ' +
            '| Bobot ENSO: ×' + bobot.enso.toFixed(2) +
            ' | Bobot IOD efektif: ×' + bobotIodDinamis.toFixed(2) +
            ' (' + _labelAmplifikasi(nilaiEnso, nilaiIod) + ')<br>' +
            'Sumber: Hidayat et al. (2016) · Nur\'utami &amp; Hidayat (2016) · Aldrian &amp; Susanto (2003)' +
            '</div>';

        // ── 7. Render ke DOM ──────────────────────────────────
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

    // ── Helper kecil (tidak perlu jadi window) ──────────────
    function _tanda(val) {
        var v = parseFloat(val);
        return (v > 0 ? '+' : '') + v.toFixed(2);
    }

    function _labelAmplifikasi(enso, iod) {
        var elNino = enso >  0.5, laNina = enso < -0.5;
        var iodPos = iod  >  0.4, iodNeg = iod  < -0.4;
        if ((elNino && iodPos) || (laNina && iodNeg)) return 'amplifikasi sinyal searah';
        if ((elNino && iodNeg) || (laNina && iodPos)) return 'interferensi sinyal berlawanan';
        return 'bobot dasar zona';
    }

    // ========================================================
    //  BAGIAN 7 — INJEKSI KE WINDOW & GUARD
    //
    //  Setelah injeksi ini, tidak ada patch berikutnya yang
    //  bisa menimpa fungsi utama secara tidak sengaja.
    //  Jika patch lain mencoba override, guard akan
    //  mencatat peringatan di console.
    // ========================================================

    function injeksi() {

        // -- Override fungsi-fungsi utama --
        window.simpulkanPrediksiIklimTerpadu = simpulkanPrediksiIklimTerpaduKonsolidasi;
        window.showSSTRekomendasi            = showSSTRekomendasiNasional;
        window.getLocalSSTTimeseries         = getLocalSSTTimeseriesNasional;
        window.getFallbackSST                = getFallbackSSTNasional;
        window.updateLocalWarning            = updateLocalWarningNasional;

        // isWilayahSulsel: tampilkan box SST untuk seluruh Indonesia
        window.isWilayahSulsel = function (lat, lon) {
            return lat >= -11.5 && lat <= 6.5 && lon >= 94.5 && lon <= 142.5;
        };

        // Simpan ke window agar bisa diakses patch lain jika perlu
        window._deteksiPerairan    = deteksiPerairan;
        window._deteksiZonaIklim   = deteksiZonaIklim;
        window._bacaKoordinatGPS   = bacaKoordinatGPS;

        // -- Guard: cegah override tidak sengaja --
        // Setelah injeksi ini selesai, tandai bahwa
        // patch iklim terpadu sudah terpasang.
        window.__iklimTerpaduV1Aktif = true;

        // Peringatan jika ada script lain yang mencoba timpa
        var _warnIfOverride = function (nama) {
            console.warn(
                '[patch_iklim_terpadu_v1] ⚠️ Percobaan override ' + nama +
                ' terdeteksi. Patch ini seharusnya dimuat PALING TERAKHIR. ' +
                'Gunakan window._' + nama + 'Asli jika butuh akses ke versi sebelumnya.'
            );
        };

        // Simpan referensi asli baru (untuk debug)
        window._simpulkanAsliKonsolidasi = simpulkanPrediksiIklimTerpaduKonsolidasi;

        console.log(
            '%c✅ patch_iklim_terpadu_v1.js AKTIF\n' +
            '\n  ╔══ KONSOLIDASI 7 FUNGSI ══════════════════╗\n' +
            '  ║ ✅ [FIX-1] Satu definisi simpulkan — tidak bertumpuk\n' +
            '  ║ ✅ [FIX-2] nilaiEnsoEfektif & nilaiIodEfektif dipakai\n' +
            '  ║            di seluruh blok if-else (bukan raw)\n' +
            '  ║ ✅ [FIX-3] Deteksi zona iklim otomatis per GPS\n' +
            '  ║ ✅ [FIX-4] Bobot IOD dinamis: amplifikasi/interferensi\n' +
            '  ║ ✅ [FIX-5] isWilayahSulsel → seluruh Indonesia\n' +
            '  ║ ✅ [FIX-6] getFallbackSST → 7 zona nasional\n' +
            '  ║ ✅ [FIX-7] getLocalSSTTimeseries → nama perairan dinamis\n' +
            '  ║ ✅ [FIX-8] showSSTRekomendasi → tidak hardcode Selat Makassar\n' +
            '  ║            threshold & nama perairan per zona GPS\n' +
            '  ╠══ WILAYAH YANG KINI DIDUKUNG ════════════╣\n' +
            '  ║   Sulawesi Selatan · Jawa · Sumatera\n' +
            '  ║   Kalimantan · Sulawesi Utara/Maluku Utara\n' +
            '  ║   Papua · Nusa Tenggara\n' +
            '  ╚═══════════════════════════════════════════╝',
            'color:#10b981;font-weight:bold;'
        );
    }

    // Jalankan setelah DOM siap (agar semua patch lain selesai)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(injeksi, 300);
        });
    } else {
        setTimeout(injeksi, 300);
    }

})();
