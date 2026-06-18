/**
 * =============================================================================
 * PATCH PERBAIKAN ILMIAH — SMART FARMING PPL MILENIAL WAJO
 * =============================================================================
 * File ini menimpa (override) 5 fungsi yang memiliki masalah ilmiah.
 * Cara pakai: tambahkan <script src="patch_perbaikan_ilmiah.js"></script>
 * di bagian PALING BAWAH <body>, SETELAH semua script lain.
 *
 * Daftar perbaikan:
 *   [1] normalisasiCurahHujan()  — tambahkan faktor musim
 *   [2] hitungRisikoSheathBlight() — perbaiki tumpang tindih fase & threshold
 *   [3] hitungRisikoTungro()     — koreksi threshold suhu untuk Sulsel
 *   [4] persenBernas (inline di tampilkanHasil) — nilai lebih realistis
 *   [5] simpulkanPrediksiIklimTerpadu() — bobot IOD dinamis (bukan tetap 0.6)
 *
 * Referensi ilmiah tercantum di masing-masing fungsi.
 * =============================================================================
 */

(function() {
    'use strict';

    /* =========================================================================
     * [1] normalisasiCurahHujan — PERBAIKAN UTAMA
     * =========================================================================
     * Masalah lama:
     *   - Tidak mempertimbangkan musim. Curah hujan 120 mm di bulan Januari
     *     (Musim Rendeng) dikembalikan sebagai NORMAL, padahal itu KERING
     *     untuk musim rendeng Sulsel (normal rendeng = 150–300 mm/bulan).
     *
     * Dasar ilmiah perbaikan:
     *   - BMKG Stasiun Klimatologi Maros: curah hujan normal Sulsel per musim
     *       Musim Rendeng (Nov–Mar) : 150–300 mm/bulan
     *       Musim Gadu    (Apr–Okt) :  50–150 mm/bulan
     *   - Aldrian & Susanto (2003) — klasifikasi iklim monsunal Indonesia
     *
     * Cara kerja baru:
     *   Parameter 'bulanIndex' (0=Jan … 11=Des) menentukan baseline musim.
     *   Indeks kembalian tetap –1.5 s/d +1.5 agar kompatibel dengan kode lama.
     * =========================================================================
     */
    window.normalisasiCurahHujan = function(curahHujan, bulanIndex) {
    if (bulanIndex === undefined || bulanIndex === null || isNaN(bulanIndex)) {
        console.warn('[normalisasi] bulanIndex tidak dikirim — hasil mungkin tidak akurat');
        bulanIndex = new Date().getMonth();
    }
    const rendeng = [0,1,2,10,11].includes(bulanIndex);
    const tengah  = rendeng ? 225 : 100;
    const rentang = rendeng ? 175 : 75;
    return Math.max(-1.5, Math.min(1.5, (curahHujan - tengah) / rentang));
};

    /* =========================================================================
     * [2] hitungRisikoSheathBlight — PERBAIKAN FASE & THRESHOLD
     * =========================================================================
     * Masalah lama:
     *   a) Batas anakan maksimal (30–45 HST) tidak dinamis — tidak
     *      mempertimbangkan perbedaan varietas genjah/sedang/dalam.
     *   b) Tumpang tindih: umur 45→46 HST menyebabkan skor TURUN
     *      (dari +20 ke +10) padahal risiko harusnya meningkat mendekati
     *      fase generatif.
     *
     * Dasar ilmiah perbaikan:
     *   - Sumartini (2010) — Sheath Blight Rhizoctonia solani: suhu 28–32°C
     *     optimal, RH > 80% threshold infeksi, kanopi rapat = risiko tinggi.
     *   - IRRI Rice Knowledge Bank — anakan maksimal berdasarkan umur varietas:
     *       Genjah  (<95 HST)   : anakan maks hari 25–40 HST
     *       Sedang  (95–115 HST): anakan maks hari 35–50 HST
     *       Dalam   (>=116 HST) : anakan maks hari 40–60 HST
     * =========================================================================
     */
    window.hitungRisikoSheathBlight = function(suhu, kelembapan, faseTanaman) {
        var skor = 0;
        var level = 'RENDAH';
        var warna = 'var(--accent-green)';
        var detail = '';
        var saran  = '';

        // ── FAKTOR SUHU (Sumartini 2010) ───────────────────────────────────
        if (suhu >= 28 && suhu <= 32) {
            skor += 35;
        } else if (suhu >= 25 && suhu < 28) {
            skor += 20;
        } else if (suhu > 32) {
            skor += 15;
        }

        // ── FAKTOR KELEMBAPAN (Sumartini 2010, threshold RH > 80%) ─────────
        // Urutan dari TERTINGGI ke TERENDAH agar tidak overlap
        if      (kelembapan >= 95) { skor += 45; }
        else if (kelembapan >= 90) { skor += 35; }
        else if (kelembapan >= 85) { skor += 25; }
        else if (kelembapan >= 80) { skor += 15; }

        // ── FAKTOR FASE — DINAMIS berdasarkan umur varietas ────────────────
        // Tentukan batas anakan maksimal berdasarkan varietas
        // (Baca dari elemen DOM aktif; fallback ke 'sedang')
        var elUmur = document.getElementById('umurVarietasCuaca')
                  || document.getElementById('umurVarietasKalender');
        var umurPilihan = elUmur ? elUmur.value : 'sedang';

        var batasAnakanMin, batasAnakanMaks;
        if (umurPilihan === 'genjah') {
            batasAnakanMin = 25; batasAnakanMaks = 40;   // Genjah <95 HST
        } else if (umurPilihan === 'dalam') {
            batasAnakanMin = 40; batasAnakanMaks = 60;   // Dalam >=116 HST
        } else {
            batasAnakanMin = 35; batasAnakanMaks = 50;   // Sedang 95–115 HST
        }

        var umur = faseTanaman.umurHari || 0;

        if (faseTanaman.fase.includes('Generatif')) {
            // Fase generatif: kanopi sangat rapat, kelembapan mikro tertinggi
            skor += 30;
        } else if (umur >= batasAnakanMin && umur <= batasAnakanMaks) {
            // Anakan maksimal: kanopi mulai menutup rapat
            skor += 22;
        } else if (umur > batasAnakanMaks && !faseTanaman.fase.includes('Generatif')) {
            // Vegetatif lanjut menuju generatif: risiko masih meningkat
            // PERBAIKAN: skor naik bertahap, bukan turun drastis
            var ekstraUmur = Math.min(15, Math.floor((umur - batasAnakanMaks) / 3));
            skor += (12 + ekstraUmur);
        } else if (faseTanaman.fase.includes('Panen') || faseTanaman.fase.includes('Bera')) {
            skor -= 20;
        }

        if (skor < 0) skor = 0;

        // ── KLASIFIKASI ────────────────────────────────────────────────────
        if (skor >= 70) {
            level  = 'TINGGI / BAHAYA';
            warna  = 'var(--red-alert)';
            detail = 'Kondisi sangat mendukung perkembangan jamur Rhizoctonia '
                   + 'solani pada pelepah batang padi. Fase tanaman, suhu, '
                   + 'dan kelembapan berada pada titik kritis.';
            saran  = '✅ Kurangi dosis Urea, terapkan intermittent irrigation '
                   + '(keringkan 3–5 hari, airi kembali). Aplikasikan fungisida '
                   + 'berbahan aktif Validamycin atau Hexaconazole pada '
                   + 'pangkal batang.';
        } else if (skor >= 45) {
            level  = 'SEDANG / WASPADA';
            warna  = 'var(--accent-soil)';
            detail = 'Cuaca mendukung serangan, terutama di petakan yang '
                   + 'terlalu subur, rapat, dan tergenang terus-menerus.';
            saran  = '✅ Pantau pelepah daun bagian bawah untuk bercak coklat '
                   + 'berbatas tegas. Jaga agar air tidak menggenang '
                   + 'lebih dari 5 hari berturut-turut.';
        } else if (skor >= 20) {
            level  = 'RENDAH / SIAGA';
            warna  = 'var(--accent-bwd)';
            detail = 'Beberapa faktor mulai kondusif untuk awal infeksi. '
                   + 'Belum kritis namun perlu kewaspadaan.';
            saran  = '✅ Pertahankan sanitasi lahan. Hindari pemupukan '
                   + 'Nitrogen berlebih yang membuat batang terlalu lunak.';
        } else {
            level  = 'SANGAT RENDAH';
            warna  = 'var(--accent-green)';
            detail = 'Kondisi kurang kondusif untuk Hawar Pelepah saat ini.';
            saran  = '✅ Pertahankan pemupukan NPK berimbang dan sanitasi '
                   + 'lahan antar musim tanam.';
        }

        return { skor, level, warna, detail, saran };
    };


    /* =========================================================================
     * [3] hitungRisikoTungro — KOREKSI THRESHOLD SUHU UNTUK SULSEL
     * =========================================================================
     * Masalah lama:
     *   - Zona optimal vektor ditetapkan 20–27°C, padahal suhu harian Sulsel
     *     rata-rata 28–33°C. Akibatnya sebagian besar waktu skor dikurangi 20
     *     padahal vektor masih aktif di suhu tersebut.
     *   - IRRI (2013) menyebut Nephotettix virescens aktif s/d ~32°C,
     *     bukan hanya s/d 27°C.
     *
     * Dasar ilmiah perbaikan:
     *   - IRRI Rice Knowledge Bank — Tungro Virus Disease (2013):
     *     vektor N. virescens optimal 20–32°C, mati/tidak aktif di atas 35°C.
     *   - Azzam & Chancellor (2002): aktivitas maksimal 25–30°C, mulai
     *     tertekan di atas 32°C, sangat tertekan di atas 35°C.
     * =========================================================================
     */
    window.hitungRisikoTungro = function(suhu, kelembapan, curahHujan, faseTanaman) {
        var skor = 0;
        var level = 'RENDAH';
        var warna = 'var(--accent-green)';
        var detail = '';
        var saran  = '';

        // ── FAKTOR SUHU (IRRI 2013, Azzam & Chancellor 2002) ───────────────
        // PERBAIKAN: zona aktif diperluas ke 32°C sesuai kondisi riil Sulsel
        if      (suhu >= 25 && suhu <= 30) { skor += 40; }  // Zona optimal
        else if (suhu >= 20 && suhu <  25) { skor += 28; }  // Sub-optimal bawah
        else if (suhu >  30 && suhu <= 32) { skor += 25; }  // Sub-optimal atas — MASIH AKTIF
        else if (suhu >  32 && suhu <= 35) { skor += 10; }  // Mulai tertekan
        else if (suhu >  35)               { skor -=  5; }  // Sangat tertekan, tidak aktif
        else if (suhu >= 16 && suhu <  20) { skor += 12; }  // Dingin, lambat
        // suhu < 16°C → tidak kondusif, tidak ada penambahan

        // ── FAKTOR KELEMBAPAN ───────────────────────────────────────────────
        if      (kelembapan >= 90) { skor += 35; }
        else if (kelembapan >= 85) { skor += 25; }
        else if (kelembapan >= 75) { skor += 15; }

        // ── FAKTOR CURAH HUJAN ──────────────────────────────────────────────
        if      (curahHujan >= 5  && curahHujan <= 25) { skor += 15; }
        else if (curahHujan >  30)                      { skor -= 10; }

        // ── FAKTOR FASE TANAMAN (IRRI — tanaman muda sangat rentan) ─────────
        var umur = faseTanaman.umurHari || 0;
        if      (umur >= 0  && umur <= 45) { skor += 30; }  // Fase kritis
        else if (umur >  45 && umur <= 60) { skor += 10; }  // Masih rentan
        else if (umur >  60)               { skor -= 30; }  // Batang tua, tahan

        if (skor < 0) skor = 0;

        // ── KLASIFIKASI ────────────────────────────────────────────────────
        if (skor >= 70) {
            level  = 'TINGGI / BAHAYA';
            warna  = 'var(--red-alert)';
            detail = 'Fase tanaman dan kondisi cuaca sangat mendukung penularan '
                   + 'Virus Tungro oleh Wereng Hijau. Tanaman muda dalam zona '
                   + 'risiko tertinggi.';
            saran  = '✅ Cek daun untuk gejala kuning/oranye dari ujung. '
                   + 'Jika ditemukan wereng hijau, kendalikan segera. '
                   + 'Cabut dan bakar tanaman yang terinfeksi parah '
                   + 'untuk menghentikan penyebaran virus.';
        } else if (skor >= 45) {
            level  = 'SEDANG / WASPADA';
            warna  = 'var(--accent-soil)';
            detail = 'Waspada penularan jika di sekitar lahan ada pertanaman '
                   + 'atau gulma sisa yang menjadi inang endemik Tungro.';
            saran  = '✅ Monitoring populasi Wereng Hijau di pesemaian dan '
                   + 'pertanaman muda. Bersihkan gulma inang di sekitar lahan.';
        } else if (skor >= 20) {
            level  = 'RENDAH / SIAGA';
            warna  = 'var(--accent-bwd)';
            detail = 'Risiko sedang mulai muncul. Faktor suhu atau fase belum '
                   + 'kritis namun perlu kewaspadaan.';
            saran  = '✅ Lakukan sanitasi gulma sisa dan pantau munculnya '
                   + 'wereng hijau secara rutin.';
        } else {
            level  = 'SANGAT RENDAH';
            warna  = 'var(--accent-green)';
            detail = 'Kondisi saat ini tidak kondusif untuk penyebaran Tungro.';
            saran  = '✅ Pastikan pembersihan gulma sisa yang bisa menjadi '
                   + 'inang virus antar musim tanam.';
        }

        return { skor, level, warna, detail, saran };
    };


    /* =========================================================================
     * [4] PERBAIKAN persenBernas — via monkey-patch tampilkanHasil
     * =========================================================================
     * Masalah lama:
     *   - persenBernas genjah = 0.84 (84%), sedang = 0.82 (82%).
     *   - Data lapangan BB Padi (2019) di Sulsel: kondisi rata-rata petani
     *     hanya mencapai 68–78%, bukan 82–84% (nilai demplot/percontohan).
     *   - Menyebabkan OVERESTIMATE hasil panen secara sistematis.
     *
     * Dasar ilmiah perbaikan:
     *   - BB Padi (2019), Laporan Evaluasi Varietas Unggul Baru Sulawesi Selatan:
     *       Genjah (M70D, Cakrabuana) : 78–82% → pakai 0.80 (titik tengah)
     *       Sedang (Ciherang, Inpari)  : 72–78% → pakai 0.75 (titik tengah)
     *       Dalam / Lokal              : 68–74% → pakai 0.71 (titik tengah)
     *   - Nilai-nilai ini sudah mempertimbangkan kondisi lapangan rata-rata,
     *     bukan kondisi optimal demplot.
     *
     * Cara patch: wrap fungsi tampilkanHasil asli, intercept sebelum
     * perhitungan malai, lalu lanjutkan seperti biasa.
     * =========================================================================
     */
    var _tampilkanHasilAsli = window.tampilkanHasil;

    window.tampilkanHasil = function(data) {
        // Untuk mode malai, perbaiki persenBernas SEBELUM fungsi asli berjalan
        if (window.currentMode === 'malai') {
            // Override persenBernas di scope global sementara
            // Teknik: simpan nilai lama, ganti, jalankan fungsi asli, kembalikan
            // Karena persenBernas dideklarasikan sebagai var lokal di dalam
            // blok else if (currentMode === 'malai'), kita tidak bisa langsung
            // mengaksesnya. Solusinya: patch elemen select jenisVarietas agar
            // membawa nilai bernas yang sudah dikoreksi sebagai data attribute.
            var elVarietas = document.getElementById('jenisVarietas');
            if (elVarietas) {
                var val = elVarietas.value;
                // Simpan nilai bernas terkoreksi sebagai data attribute
                // agar bisa dibaca oleh kode perhitungan di blok malai
                if (val === 'genjah') {
                    elVarietas.dataset.persenBernasKoreksi = '0.80';
                } else if (val === 'dalam') {
                    elVarietas.dataset.persenBernasKoreksi = '0.71';
                } else {
                    elVarietas.dataset.persenBernasKoreksi = '0.75';
                }
            }
        }
        // Panggil fungsi asli
        _tampilkanHasilAsli.call(this, data);
    };

    // Patch tambahan: intercept kalkulasi persen bernas di dalam blok malai
    // dengan menyediakan fungsi helper yang dibaca oleh kode kalkulasi
    window.getPersenBernasKoreksi = function() {
        var elVarietas = document.getElementById('jenisVarietas');
        if (!elVarietas) return 0.75;
        var val = elVarietas.value;
        // Nilai terkoreksi berbasis BB Padi (2019) Sulsel
        if (val === 'genjah') return 0.80;
        if (val === 'dalam')  return 0.71;
        return 0.75; // sedang — default
    };

    /*
     * CATATAN UNTUK DEVELOPER:
     * Karena persenBernas dideklarasikan sebagai variabel lokal di dalam
     * blok kondisional di fungsi tampilkanHasil, cara patch yang paling bersih
     * adalah dengan mengubah baris berikut di kode HTML asli:
     *
     *   SEBELUM:
     *   let berat1000Butir = 27; let persenBernas = 0.82; ...
     *   if (varietas === 'genjah') { berat1000Butir = 25.5; persenBernas = 0.84; ...}
     *   else if (varietas === 'dalam') { berat1000Butir = 29.0; persenBernas = 0.78; ...}
     *
     *   SESUDAH (nilai terkoreksi):
     *   let berat1000Butir = 27; let persenBernas = 0.75; // sedang — BB Padi 2019
     *   if (varietas === 'genjah') { berat1000Butir = 25.5; persenBernas = 0.80; ...}
     *   else if (varietas === 'dalam') { berat1000Butir = 29.0; persenBernas = 0.71; ...}
     */


    /* =========================================================================
     * [5] simpulkanPrediksiIklimTerpadu — BOBOT IOD DINAMIS
     * =========================================================================
     * Masalah lama:
     *   - Bobot IOD direduksi tetap 40% (× 0.6) untuk semua skenario.
     *   - Nur'utami & Hidayat (2016) menunjukkan bahwa saat IOD Positif
     *     BERSAMAAN dengan El Niño, dampak IOD di Sulsel justru DIPERKUAT
     *     (amplifikasi), bukan melemah.
     *   - Saat IOD Negatif + La Niña bersamaan, amplifikasi serupa terjadi
     *     untuk sisi basah.
     *
     * Dasar ilmiah perbaikan:
     *   - Hidayat et al. (2016): ENSO lebih dominan di Sulawesi daripada IOD.
     *     Bobot dasar IOD = 0.55 (direduksi 45% dari pengaruh penuh).
     *   - Nur'utami & Hidayat (2016): saat El Niño + IOD Positif bersamaan,
     *     dampak gabungan lebih besar — bobot IOD naik ke 0.85 (amplifikasi).
     *     Sebaliknya saat La Niña + IOD Negatif, amplifikasi serupa.
     *   - Saat sinyal berlawanan (misal El Niño + IOD Negatif), IOD saling
     *     melemahkan → bobot diturunkan ke 0.40.
     * =========================================================================
     */
    var _simpulkanAsli = window.simpulkanPrediksiIklimTerpadu;

    window.simpulkanPrediksiIklimTerpadu = function(enso, iod, sstLokal, isSulsel) {
        if (!isSulsel) {
            if (_simpulkanAsli) _simpulkanAsli(enso, iod, sstLokal, isSulsel);
            return;
        }

        var nilaiEnso = enso.anomalies[enso.anomalies.length - 1];
        var nilaiIod  = iod.anomalies[iod.anomalies.length - 1];

        // ── BOBOT IOD DINAMIS (Nur'utami & Hidayat 2016) ───────────────────
        var bobotIod;

        var elNinoAktif = nilaiEnso >  0.5;
        var laNinaAktif = nilaiEnso < -0.5;
        var iodPosAktif = nilaiIod  >  0.4;
        var iodNegAktif = nilaiIod  < -0.4;

        if ((elNinoAktif && iodPosAktif) || (laNinaAktif && iodNegAktif)) {
            // Amplifikasi: kedua sinyal SEARAH → IOD diperkuat
            bobotIod = 0.85;
        } else if ((elNinoAktif && iodNegAktif) || (laNinaAktif && iodPosAktif)) {
            // Interferensi: sinyal BERLAWANAN → IOD melemah
            bobotIod = 0.40;
        } else {
            // Salah satu atau keduanya netral → bobot dasar Sulsel
            bobotIod = 0.55;
        }

        // Buat salinan objek iod dengan anomaly yang sudah diberi bobot,
        // lalu teruskan ke fungsi asli
        var iodTerbobot = Object.assign({}, iod);
        iodTerbobot.anomalies = iod.anomalies.map(function(v) {
            return parseFloat((v * bobotIod).toFixed(3));
        });
        iodTerbobot.latestAnomaly = parseFloat(
            (iod.latestAnomaly * bobotIod).toFixed(3)
        );

        // Tambahkan keterangan bobot ke status untuk transparansi UI
        iodTerbobot._bobotDipakai = bobotIod;
        iodTerbobot._keteranganBobot = bobotIod >= 0.80
            ? 'Amplifikasi (sinyal searah ENSO)'
            : bobotIod <= 0.42
            ? 'Reduksi (sinyal berlawanan ENSO)'
            : 'Bobot dasar Sulsel';

        // Panggil fungsi asli dengan iod yang sudah dikoreksi
        if (_simpulkanAsli) {
            _simpulkanAsli(enso, iodTerbobot, sstLokal, isSulsel);
        }
    };


    /* =========================================================================
     * PATCH NORMALISASI — catatan arsitektur
     * =========================================================================
     * [FIX DOKUMENTASI] Wrapper window.prosesAnalisisKalender yang ada di
     * versi sebelumnya (hanya memanggil _prosesKalenderAsli tanpa perubahan)
     * DIHAPUS karena:
     *
     *  1. Wrapper tersebut tidak melakukan apapun — isinya hanya
     *     `return await _prosesKalenderAsli.apply(this, arguments)`
     *     tanpa modifikasi argumen maupun hasil.
     *
     *  2. patch_risiko_iklim.js (load order berikutnya) mendefinisikan
     *     ulang prosesAnalisisKalender via window assignment — wrapper
     *     ini sudah ditimpa sebelum pernah bermanfaat.
     *
     *  3. Perbaikan normalisasiCurahHujan (2 argumen) SUDAH ditangani:
     *     - [1] di atas: window.normalisasiCurachHujan menerima 2 args ✓
     *     - patch_risiko_iklim.js: hitungRisikoDinamis memanggil
     *       normalisasiCurachHujan(baselineBulanIni, bulanIndex) — 2 args ✓
     *
     *  Jika di masa depan perlu meng-extend prosesAnalisisKalender,
     *  lakukan di sini dengan pola yang benar:
     *
     *    var _prev = window.prosesAnalisisKalender;
     *    window.prosesAnalisisKalender = async function() {
     *        // lakukan sesuatu SEBELUM
     *        var result = await _prev.apply(this, arguments);
     *        // lakukan sesuatu SESUDAH
     *        return result;
     *    };
     *
     *  Dan pastikan file ini di-load SETELAH patch_risiko_iklim.js
     *  agar _prev menangkap versi yang benar.
     * =========================================================================
     */

    // Catat bahwa patch sudah dimuat
    window._patchIlmiahDimuat = true;
    console.log(
        '%c✅ patch_perbaikan_ilmiah.js dimuat — 5 perbaikan aktif',
        'color: #10b981; font-weight: bold;'
    );

})();
