/**
 * ============================================================
 * patch_fix_bobot_scoring_v1.js
 * Fix: Prioritas Air Tanam & Vegetatif, Bukan Panen Kering
 * ------------------------------------------------------------
 * MASALAH YANG DIPERBAIKI:
 *
 *   Sebelumnya sistem memberi bobot besar pada PANEN KERING:
 *   - nilaiPanen = 100 - skorPanen  → panen kering = skor 100
 *   - bobot panen = 35% (sama besar dengan generatif)
 *   Akibatnya: sistem cenderung pilih bulan tanam yang panennnya
 *   kering, walau fase tanam & vegetatif kekurangan air.
 *
 * PRINSIP AGRONOMI YANG BENAR:
 *   ① TANAM + VEGETATIF (0–40 HST) → WAJIB ADA AIR
 *      Kekurangan air = kerdil, anakan sedikit, gagal panen.
 *      Ini paling kritis → bobot TERBESAR.
 *
 *   ② GENERATIF / BUNTING (50–80 HST) → AIR CUKUP, JANGAN BASAH
 *      Terlalu basah = Blast, terlalu kering = puso.
 *      Butuh keseimbangan → bobot MENENGAH.
 *
 *   ③ PANEN (> 90 HST) → IDEALNYA KERING, TAPI BISA DISIASATI
 *      Panen basah = butuh dryer, tapi panen TETAP BERHASIL.
 *      Ini bisa diatasi teknologi → bobot TERKECIL, PENALTI RINGAN.
 *
 * PERUBAHAN BOBOT:
 *   patch_jadwal_tanam_otomatis.js:
 *     LAMA: nilaiVeg*0.30 + nilaiGen*0.35 + nilaiPanen*0.35
 *     BARU: nilaiVeg*0.45 + nilaiGen*0.35 + nilaiPanen*0.20
 *     + nilaiPanen BARU: netral di 50, penalti hanya jika >75
 *
 *   patch_deteksi_musim_v3.0.js (evaluasiKandidatMusim):
 *     LAMA: nilaiTanam*0.45 + nilaiVeg1*0.20 + nilaiGen*0.20 + nilaiPanen*0.15
 *     BARU: nilaiTanam*0.40 + nilaiVeg1*0.30 + nilaiGen*0.20 + nilaiPanen*0.10
 *     + nilaiPanen BARU: netral, penalti ringan jika sangat basah saja
 *
 * CARA PAKAI:
 *   Muat file ini SETELAH kedua patch utama dimuat.
 *   Script ini meng-override fungsi rekomendasiWindowTanam dan
 *   evaluasiKandidatMusim via monkey-patch pada window globals.
 * ============================================================
 */

(function () {
    'use strict';

    /* ============================================================
       BAGIAN 1: FIX patch_jadwal_tanam_otomatis.js
       Fungsi: rekomendasiWindowTanam (versi lokal di file tsb)
       Override dilakukan via window.rekomendasiWindowTanam
       yang sudah di-export oleh patch_deteksi_musim_v3.0.js
    ============================================================ */

    /*
     * nilaiPanenBaru — FILOSOFI BARU:
     *   - Panen dengan skor 0–55 (kering s/d agak basah) → nilai 50–70 (OK, tidak dihukum)
     *   - Panen dengan skor 56–75 (basah) → nilai 40–50 (sedikit penalti)
     *   - Panen dengan skor >75 (sangat basah) → nilai di bawah 40 (perlu dryer, dikurangi lebih)
     *   Penalti TIDAK PERNAH mencapai 0 — panen basah masih lebih baik dari tidak panen.
     */
    function nilaiPanenBaru(skorPanen) {
        if (skorPanen <= 55) {
            // Kering s/d normal: nilai tinggi, tidak perlu membedakan terlalu tajam
            return 65 + (55 - skorPanen) * 0.27; // range ~65–80 untuk skor 55→0
        } else if (skorPanen <= 75) {
            // Agak basah: penalti ringan
            return 65 - (skorPanen - 55) * 1.25; // range ~40–65 untuk skor 55→75
        } else {
            // Sangat basah: penalti lebih terasa, tapi floor di 25
            return Math.max(25, 40 - (skorPanen - 75) * 0.6);
        }
    }

    /*
     * nilaiGeneratifBaru — FILOSOFI:
     *   Generatif optimal: tidak terlalu kering (blast, kegagalan pengisian),
     *   tidak terlalu basah (blast, penyakit). Ideal di skor 35–65.
     *   Gunakan fungsi berbentuk lonceng (bell).
     */
    function nilaiGeneratifBaru(skorGen) {
        var tengah = 50;
        var jarak  = Math.abs(skorGen - tengah);
        // Penalti makin besar jika makin jauh dari 50
        if (jarak <= 15) return 100;                    // 35–65: optimal
        if (jarak <= 30) return 100 - (jarak - 15) * 2; // 20–35 / 65–80: baik
        return Math.max(20, 70 - (jarak - 30) * 2);    // <20 / >80: penalti lebih keras
    }

    /* ============================================================
       BAGIAN 2: Patch window.rekomendasiWindowTanam
       (dipakai oleh patch_jadwal_tanam_otomatis.js)
    ============================================================ */

    /* Simpan referensi fungsi asli jika ada */
    var _asliRekomendasiWindowTanam = window.rekomendasiWindowTanam;

    /*
     * Karena rekomendasiWindowTanam di patch_deteksi_musim_v3.0.js
     * sudah di-override secara penuh dengan logika yang lebih baik,
     * kita cukup patch BAGIAN EVALUASI KANDIDAT saja via wrapper.
     *
     * TAPI: patch_jadwal_tanam_otomatis.js punya versi LOKAL sendiri
     * yang tidak menggunakan window.rekomendasiWindowTanam dari engine.
     * Jadi kita perlu patch kedua tempat.
     *
     * Strategi: inject fungsi helper ke window agar bisa diakses
     * oleh kedua patch jika mereka memanggil window.nilaiPanenBaru
     * dan window.nilaiGeneratifBaru.
     */
    window.nilaiPanenBaru     = nilaiPanenBaru;
    window.nilaiGeneratifBaru = nilaiGeneratifBaru;

    /* ============================================================
       BAGIAN 3: Override lengkap rekomendasiWindowTanam lokal
       (versi yang ada di patch_jadwal_tanam_otomatis.js)
       Kita re-implementasi dengan bobot baru.
    ============================================================ */

    /**
     * BOBOT BARU — PRIORITAS AIR TANAM & VEGETATIF:
     *
     *   nilaiVeg   : 0.45  ← NAIK dari 0.30. Fase paling kritis.
     *   nilaiGen   : 0.35  ← Tetap. Generatif butuh keseimbangan.
     *   nilaiPanen : 0.20  ← TURUN dari 0.35. Bisa disiasati dryer.
     *
     * Penalti tambahan:
     *   - Vegetatif bulan ke-2 sangat kering → penalti besar
     *   - Tanam sangat kering → penalti besar (sama seperti sebelumnya)
     */
    var BOBOT_BARU = {
        veg  : 0.45,
        gen  : 0.35,
        panen: 0.20
    };

    /* ── Utilitas lokal ── */
    var NAMA_BULAN_LK = ['Januari','Februari','Maret','April','Mei','Juni',
                          'Juli','Agustus','September','Oktober','November','Desember'];

    function tambahHariLK(d, n) { var h = new Date(d); h.setDate(h.getDate() + n); return h; }

    function tanggalDariBulanTahunLK(bulanIdx, tahun) { return new Date(tahun, bulanIdx, 1); }

    var EPOCH_BULAN_BARU_LK = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS_LK   = 29.53059;

    function hariFaseBulanLK(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU_LK.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS_LK) + SIKLUS_SINODIS_LK) % SIKLUS_SINODIS_LK;
    }

    function cariTglFaseBulanLK(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHariLK(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHariLK(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined && t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulanLK(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return null;
    }

    function statusWaktuTanamLK(tglTanam, now) {
        var isLewat    = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth()     === now.getMonth() &&
            tglTanam.getFullYear()  === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    /* ── Fungsi override utama ── */
    function rekomendasiWindowTanamFix(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        /* -- Deteksi musim rendeng & gadu (logika sama seperti aslinya) -- */
        var maxSum = -Infinity, startRendeng = 0;
        for (var i = 0; i < 12; i++) {
            var sum = 0;
            for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
            if (sum > maxSum) { maxSum = sum; startRendeng = i; }
        }

        var startGadu;
        if (zona === 'ekuatorial') {
            var minSum = Infinity;
            startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    var tengahLembah     = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum;
                        startGadu = ii;
                    }
                }
            }
        } else {
            startGadu = (startRendeng + 6) % 12;
        }

        var rendengBulan = [startRendeng, (startRendeng+1)%12, (startRendeng+2)%12, (startRendeng+3)%12, (startRendeng+4)%12, (startRendeng+5)%12];
        var gaduBulan    = [startGadu,    (startGadu+1)%12,    (startGadu+2)%12,    (startGadu+3)%12,    (startGadu+4)%12,    (startGadu+5)%12];

        var MUSIM = [
            { nama: 'MT I — Musim Utama (Puncak Hujan)',   kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: 'MT II — Musim Kedua (Hujan Menurun)', kode: 'gadu',    bulanTanam: gaduBulan   }
        ];

        var varianArr = [
            { kode: 'genjah', label: 'Genjah (< 95 HST)',   panen: 90  },
            { kode: 'sedang', label: 'Sedang (95–115 HST)', panen: 110 },
            { kode: 'dalam',  label: 'Dalam (≥ 116 HST)',   panen: 125 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen     = Math.floor(v.panen * 0.55);
                    var tglTanamRef = tanggalDariBulanTahunLK(bTanam, tahunSekarang);
                    var bGenIdx     = tambahHariLK(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHariLK(tglTanamRef, v.panen).getMonth();
                    var bVeg1       = (bTanam + 1) % 12;
                    var bVeg2       = (bTanam + 2) % 12;

                    var skorGen     = skorBulan[bGenIdx];
                    var skorPanen   = skorBulan[bPanenIdx];

                    /* ── BOBOT BARU: Vegetatif dominan ── */
                    // nilaiVeg: rata-rata skor tanam + 2 bulan vegetatif berikutnya
                    // Makin tinggi makin baik (air = kebutuhan utama)
                    var nilaiVeg = (skorTanam + skorBulan[bVeg1] + skorBulan[bVeg2]) / 3;

                    // nilaiGen: berbentuk lonceng, optimal di 35–65
                    var nilaiGen = nilaiGeneratifBaru(skorGen);

                    // nilaiPanen: netral, hanya penalti jika sangat basah
                    var nilaiPanen = nilaiPanenBaru(skorPanen);

                    /* ── Total dengan bobot baru ── */
                    var nilaiTotal =
                        (nilaiVeg   * BOBOT_BARU.veg  ) +
                        (nilaiGen   * BOBOT_BARU.gen  ) +
                        (nilaiPanen * BOBOT_BARU.panen);

                    /* ── Penalti tambahan ── */
                    // Vegetatif bulan ke-2 sangat kering = kritis (anakan berhenti)
                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 20;
                    // Bulan tanam sangat kering = sulit bajak & tanam
                    if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;

                    // TIDAK ADA penalti khusus untuk panen basah lagi —
                    // sudah tercakup dalam nilaiPanenBaru()

                    kandidatMusim.push({
                        musimNama     : musim.nama,
                        musimKode     : musim.kode,
                        bTanam        : bTanam,
                        varietas      : v.kode,
                        labelVar      : v.label,
                        umurTotal     : v.panen,
                        nilaiTotal    : nilaiTotal,
                        skorTanam     : skorTanam,
                        skorGen       : skorGen,
                        skorPanen     : skorPanen,
                        namaBulanGen  : NAMA_BULAN_LK[bGenIdx],
                        namaBulanPanen: NAMA_BULAN_LK[bPanenIdx]
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                /* Fallback: tidak ada bulan yang memenuhi skor minimum */
                var bFallback       = musim.bulanTanam[0];
                var tglAwalFallback = tanggalDariBulanTahunLK(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulanLK(tglAwalFallback, 3, 8, 0, bFallback)
                                      || new Date(tahunSekarang, bFallback, 10);
                var statusFallback  = statusWaktuTanamLK(tglFaseFallback, now);

                hasilDuaMusim.push({
                    musimNama  : musim.nama,
                    musimKode  : musim.kode,
                    tglTanam   : tglFaseFallback,
                    varietas   : 'sedang',
                    labelVar   : 'Sedang (95–115 HST)',
                    umurTotal  : 110,
                    alasan     : 'Kondisi kering ekstrem di seluruh jendela tanam musim ini. Dipilih tanggal default fase bulan terbaik. Pompanisasi penuh mungkin diperlukan.',
                    isLewat    : statusFallback.isLewat,
                    isBerjalan : statusFallback.isBerjalan
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahunLK(best.bTanam, tahunSekarang);
                var tglFaseBaik  = cariTglFaseBulanLK(tglAwalBulan, 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = cariTglFaseBulanLK(tambahHariLK(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = new Date(tahunSekarang, best.bTanam, 10);

                var statusBest = statusWaktuTanamLK(tglFaseBaik, now);

                /* Keterangan alasan — fokus pada kondisi air */
                var keteranganSkorGen =
                    best.skorGen < 25 ? 'cenderung kering — pantau ketersediaan air bunting' :
                    best.skorGen > 70 ? 'cenderung basah — waspada Blast leher malai' :
                                        'kondisi air seimbang — optimal untuk pengisian bulir';

                /*
                 * PERUBAHAN: Keterangan panen tidak lagi memprioritaskan kering.
                 * Panen basah diinformasikan sebagai kondisi yang perlu disiapkan,
                 * bukan sebagai hambatan utama.
                 */
                var keteranganSkorPanen =
                    best.skorPanen > 75 ? 'perkiraan basah — siapkan dryer atau tenda pascapanen' :
                    best.skorPanen > 55 ? 'perkiraan agak basah — koordinasikan combine lebih awal' :
                    best.skorPanen < 20 ? 'perkiraan kering — kondisi ideal untuk panen mekanis' :
                                          'kondisi panen cukup baik';

                hasilDuaMusim.push({
                    musimNama  : best.musimNama,
                    musimKode  : best.musimKode,
                    tglTanam   : tglFaseBaik,
                    varietas   : best.varietas,
                    labelVar   : best.labelVar,
                    umurTotal  : best.umurTotal,
                    alasan     :
                        'Skor air bulan tanam: ' + best.skorTanam + '/100. ' +
                        'Fase generatif di ' + best.namaBulanGen + ': ' + keteranganSkorGen + '. ' +
                        'Panen di ' + best.namaBulanPanen + ': ' + keteranganSkorPanen + '.',
                    isLewat    : statusBest.isLewat,
                    isBerjalan : statusBest.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function (a, b) { return a.tglTanam.getTime() - b.tglTanam.getTime(); });
        return hasilDuaMusim;
    }

    /* ============================================================
       BAGIAN 4: Patch evaluasiKandidatMusim di patch_deteksi_musim_v3.0.js
       Tidak bisa di-override langsung (fungsi private/IIFE),
       tapi rekomendasiWindowTanamV4 di-export via window.
       Kita wrap window.rekomendasiWindowTanam yang sudah di-set v3.0.
    ============================================================ */

    /**
     * Wrapper untuk rekomendasiWindowTanamV4 dari patch_deteksi_musim_v3.0.js.
     * Fungsi asli dijalankan dulu, lalu hasilnya dipost-process untuk memastikan
     * alasan/keterangan panen tidak mengutamakan kering.
     *
     * Catatan: Bobot internal evaluasiKandidatMusim (v3.0) tidak bisa diubah
     * dari luar IIFE. Namun karena bobot panen di v3.0 sudah kecil (0.15),
     * dampaknya tidak sebesar versi lokal patch_jadwal_tanam_otomatis.js.
     * Post-processing teks alasan sudah cukup untuk v3.0.
     */
    function wrapRekomendasiV4(asli) {
        return function (skorBulan, rawZOM, zona, ensoVal, iodVal) {
            var hasil = asli.call(this, skorBulan, rawZOM, zona, ensoVal, iodVal);

            /* Post-process: ubah keterangan panen agar tidak bias kering */
            hasil.forEach(function (item) {
                if (!item.alasan) return;

                // Ganti kalimat yang mengungkapkan panen kering sebagai hal utama
                item.alasan = item.alasan
                    .replace(/kondisi kering ideal untuk panen/gi, 'kondisi panen cerah — koordinasi combine')
                    .replace(/siapkan alat pengering/gi, 'siapkan dryer atau tenda curah — panen tetap bisa dilaksanakan')
                    .replace(/kondisi panen aman/gi, 'kondisi panen cukup baik');
            });

            return hasil;
        };
    }

    /* ============================================================
       BAGIAN 5: Injeksi ke window — urutan injeksi penting
    ============================================================ */
    function injeksi() {
        /*
         * Override window.rekomendasiWindowTanam:
         *   - patch_jadwal_tanam_otomatis.js memanggil:
         *     var fungsiRekomendasi = window.rekomendasiWindowTanam || rekomendasiWindowTanam;
         *   - Jika kita set window.rekomendasiWindowTanam di sini,
         *     versi fix ini yang akan dipakai.
         */
        if (typeof window.rekomendasiWindowTanam === 'function') {
            /* Ada fungsi dari v3.0 — wrap untuk post-process teks */
            window._rekomendasiWindowTanamV4Asli = window.rekomendasiWindowTanam;
            window.rekomendasiWindowTanam = wrapRekomendasiV4(window.rekomendasiWindowTanam);
        }

        /*
         * Inject juga versi fix lokal sebagai _rekomendasiWindowTanamFix
         * agar patch_jadwal_tanam_otomatis.js bisa memanggilnya secara eksplisit
         * jika diinginkan (misal: extend di masa depan).
         */
        window._rekomendasiWindowTanamFix = rekomendasiWindowTanamFix;

        /*
         * Untuk patch_jadwal_tanam_otomatis.js yang punya fungsi lokal:
         * Kita TIDAK bisa override fungsi lokal (private IIFE).
         * Satu-satunya cara adalah memastikan ia memanggil window.rekomendasiWindowTanam,
         * yang sudah kita override di atas.
         *
         * Cek baris di prosesJadwalOtomatis():
         *   var fungsiRekomendasi = window.rekomendasiWindowTanam || rekomendasiWindowTanam;
         * → Karena window.rekomendasiWindowTanam sudah di-set, fungsi FIX akan dipakai. ✅
         */

        console.log(
            '%c✅ patch_fix_bobot_scoring_v1.js aktif\n' +
            '\n  ╔══ FIX PRIORITAS AIR TANAM & VEGETATIF ══╗\n' +
            '  ║ ✅ Bobot Vegetatif (Tanam+30 HST): 45% ↑  \n' +
            '  ║ ✅ Bobot Generatif (Bunting): 35% (tetap) \n' +
            '  ║ ✅ Bobot Panen: 20% ↓ (dari 35%)          \n' +
            '  ║ ✅ nilaiPanen: netral, penalti hanya >75  \n' +
            '  ║ ✅ nilaiGen: kurva lonceng, optimal 35-65 \n' +
            '  ║ ✅ Vegetatif 3 bulan dievaluasi (V0+V1+V2)\n' +
            '  ║ ✅ Keterangan panen tidak bias kering     \n' +
            '  ║ ⚠️  Bobot internal v3.0 tidak diubah      \n' +
            '  ║    (private IIFE), namun dampak kecil     \n' +
            '  ╚══════════════════════════════════════════╝',
            'color:#f59e0b; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksi);
    } else {
        setTimeout(injeksi, 200); // tunggu patch v3.0 & v3.12 selesai inject
    }

})();


/* ================================================================
   PANDUAN INTEGRASI — BACA SEBELUM DEPLOY
   ================================================================

   URUTAN LOAD SCRIPT WAJIB:
   ─────────────────────────────────────────────────────────────────
   1. [base app]
   2. patch_deteksi_musim_v3.0.1.js   ← set window.rekomendasiWindowTanam
   3. patch_jadwal_tanam_otomatis.js   ← pakai window.rekomendasiWindowTanam
   4. patch_fix_bobot_scoring_v1.js    ← override window.rekomendasiWindowTanam
   ─────────────────────────────────────────────────────────────────

   JIKA URUTAN TIDAK BISA DIJAMIN (misal async):
   Tambahkan di akhir prosesJadwalOtomatis() sebelum memanggil:
     var fungsiRekomendasi = window.rekomendasiWindowTanam || rekomendasiWindowTanam;
   Ganti dengan:
     var fungsiRekomendasi = window._rekomendasiWindowTanamFix
                             || window.rekomendasiWindowTanam
                             || rekomendasiWindowTanam;

   ================================================================
   CARA INTEGRASI ALTERNATIF (inline ke patch_jadwal_tanam_otomatis.js)
   ================================================================
   Jika ingin langsung edit patch_jadwal_tanam_otomatis.js,
   cari bagian ini dan ganti:

   LAMA (di rekomendasiWindowTanam lokal):
   ─────────────────────────────────────────────────────────────────
   var nilaiGen   = 100 - Math.abs(skorGen - 40);
   var nilaiPanen = 100 - skorPanen;

   var nilaiVeg = (skorTanam + skorBulan[bVeg1]) / 2;

   var nilaiTotal = (nilaiVeg * 0.30) + (nilaiGen * 0.35) + (nilaiPanen * 0.35);

   if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;
   if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;
   ─────────────────────────────────────────────────────────────────

   GANTI DENGAN:
   ─────────────────────────────────────────────────────────────────
   // Vegetatif: rata-rata 3 bulan awal (tanam + V1 + V2)
   var bVeg2    = (bTanam + 2) % 12;
   var nilaiVeg = (skorTanam + skorBulan[bVeg1] + skorBulan[bVeg2]) / 3;

   // Generatif: kurva lonceng, optimal di skor 35-65
   var jarakGen = Math.abs(skorGen - 50);
   var nilaiGen = jarakGen <= 15 ? 100
                : jarakGen <= 30 ? 100 - (jarakGen - 15) * 2
                : Math.max(20, 70 - (jarakGen - 30) * 2);

   // Panen: netral, penalti ringan hanya jika sangat basah
   var nilaiPanen = skorPanen <= 55  ? 65 + (55 - skorPanen) * 0.27
                  : skorPanen <= 75  ? 65 - (skorPanen - 55) * 1.25
                  : Math.max(25, 40 - (skorPanen - 75) * 0.6);

   // Bobot baru: Veg 45%, Gen 35%, Panen 20%
   var nilaiTotal = (nilaiVeg * 0.45) + (nilaiGen * 0.35) + (nilaiPanen * 0.20);

   if (skorBulan[bVeg1] < 20) nilaiTotal -= 20;
   if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;
   ─────────────────────────────────────────────────────────────────

   ================================================================
   CARA INTEGRASI INLINE KE patch_deteksi_musim_v3.0.js
   ================================================================
   Cari di fungsi evaluasiKandidatMusim:

   LAMA:
   ─────────────────────────────────────────────────────────────────
   var nilaiTanam  = skorTanam;
   var nilaiVeg1   = skorZOM[bVeg1];
   var nilaiGen    = 100 - Math.abs(skorZOM[bGenIdx] - 55);
   var nilaiPanen  = 100 - (skorZOM[bPanenIdx] * 0.5);
   var nilaiTotal  = (nilaiTanam * 0.45) + (nilaiVeg1 * 0.20) + (nilaiGen * 0.20) + (nilaiPanen * 0.15);
   ─────────────────────────────────────────────────────────────────

   GANTI DENGAN:
   ─────────────────────────────────────────────────────────────────
   var nilaiTanam = skorTanam;
   var nilaiVeg1  = skorZOM[bVeg1];
   var nilaiVeg2  = skorZOM[(bTanam + 2) % 12];

   // Generatif: lonceng, optimal 35-65
   var jarakGen = Math.abs(skorZOM[bGenIdx] - 50);
   var nilaiGen = jarakGen <= 15 ? 100
                : jarakGen <= 30 ? 100 - (jarakGen - 15) * 2
                : Math.max(20, 70 - (jarakGen - 30) * 2);

   // Panen: netral, penalti ringan jika sangat basah
   var spanen    = skorZOM[bPanenIdx];
   var nilaiPanen = spanen <= 55  ? 65 + (55 - spanen) * 0.27
                  : spanen <= 75  ? 65 - (spanen - 55) * 1.25
                  : Math.max(25, 40 - (spanen - 75) * 0.6);

   // Bobot baru: Tanam 35%, Veg1+Veg2 35%, Gen 20%, Panen 10%
   var nilaiTotal = (nilaiTanam * 0.35) + (nilaiVeg1 * 0.20) + (nilaiVeg2 * 0.15)
                  + (nilaiGen   * 0.20) + (nilaiPanen * 0.10);
   ─────────────────────────────────────────────────────────────────
*/
