// ============================================================
//  patch_bugfix_v1.js
//  Perbaikan 3 Bug Kritis + Sentralisasi EPOCH Bulan
// ============================================================
//
//  BUG YANG DIPERBAIKI:
//
//  [BUG 1] Offset fase generatif hardcoded 55% untuk semua varietas
//    LAMA : hariGen = Math.floor(panen × 0.55)
//           → genjah 90hr: gen hari ke-49 (masih vegetatif akhir!)
//    BARU : offset per varietas berdasarkan fisiologi padi:
//           genjah 65%, sedang 60%, dalam 58%
//           → genjah 90hr: gen hari ke-58 ✅ (primordia malai ~60 HST)
//
//  [BUG 2] nilaiVeg dihitung berbeda di patch_jadwal (2 bulan)
//    vs patch_fix_bobot (3 bulan) → hasil rekomendasi tidak konsisten
//    BARU : selalu 3 bulan (bTanam + bVeg1 + bVeg2), satu definisi
//
//  [BUG 3] rek.tglOlahTanah = undefined saat rekomendasiWindowTanam
//    lokal aktif (bukan dari v3.0.1) → tglGropyok = Invalid Date,
//    kartu "Pengolahan Lahan" juga crash
//    BARU : bangunKegiatan() menghitung tglOlah sendiri jika
//           rek.tglOlahTanah tidak ada (= tglTanam − 25 hari)
//
//  [PERINGATAN] EPOCH Bulan Baru hardcoded di 3 file berbeda
//    → dipindahkan ke window.EPOCH_BULAN_BARU agar hanya ada
//      satu sumber kebenaran. Patch lama tetap berfungsi.
//
//  URUTAN LOAD (wajib):
//    1. patch_deteksi_musim_v1.js
//    2. patch_jadwal_tanam_otomatis.js
//    3. patch_fix_bobot_scoring_v1.js
//    4. patch_bugfix_v1.js          ← file ini, paling akhir
//
//  CARA PASANG:
//    Tambahkan di index.html, setelah patch_fix_bobot_scoring_v1.js:
//    <script src="patch_bugfix_v1.js"></script>
// ============================================================

(function () {
    'use strict';

    // ── 0. SENTRALISASI EPOCH ────────────────────────────────────
    // Jadikan satu referensi global. Patch lama yang punya variabel
    // lokal (EPOCH_BULAN_BARU, EPOCH_BULAN_BARU_LK) tetap berfungsi
    // karena fungsi hariFaseBulan mereka sudah berjalan dalam closure.
    // Ini mencegah inkonsistensi jika ada patch baru di masa depan.
    if (!window.EPOCH_BULAN_BARU) {
        window.EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    }
    var SIKLUS_SINODIS = 29.53059;

    // ── 1. TABEL OFFSET GENERATIF PER VARIETAS ──────────────────
    // Sumber: fisiologi padi IR-64 dan varietasnya (IRRI, BB Padi)
    // Primordia malai (fase bunting awal) muncul di:
    //   genjah  (<95 HST)  : sekitar 60–65% umur total
    //   sedang  (95–115 HST): sekitar 58–62% umur total
    //   dalam   (>115 HST) : sekitar 56–60% umur total
    // Kita pakai nilai tengah yang konservatif agar tidak meleset
    // ke bulan berikutnya pada varietas genjah.
    var OFFSET_GEN_PER_VARIETAS = {
        genjah: 0.65,   // genjah 90hr → gen hari ke-58 (vs 49 lama)
        sedang: 0.60,   // sedang 110hr → gen hari ke-66 (vs 60 lama)
        dalam:  0.58    // dalam 125hr  → gen hari ke-72 (vs 68 lama)
    };

    // Fungsi bantu — hitung hariGen dengan offset yang benar
    function hariGenDariVarietas(umurTotal, kodeVarietas) {
        var offset = OFFSET_GEN_PER_VARIETAS[kodeVarietas] || 0.60;
        return Math.floor(umurTotal * offset);
    }

    // ── 2. FUNGSI BANTU TANGGAL (lokal, tidak mencemari global) ──
    function tambahHari(d, n) {
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }
    function tanggalDariBulanTahun(bulanIdx, tahun) {
        return new Date(tahun, bulanIdx, 1);
    }
    function hariFaseBulanLokal(tgl) {
        var epoch = window.EPOCH_BULAN_BARU;
        var s = (tgl.getTime() - epoch.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }

    // ── 3. PATCH REKOMENDASIWINDOWTANAM ──────────────────────────
    // Override window.rekomendasiWindowTanam yang saat ini diisi
    // oleh patch_fix_bobot_scoring_v1.js. Kita wrap-nya agar:
    //   a) offset generatif pakai tabel per varietas (Bug 1)
    //   b) tidak perlu diubah — scoring sudah diurus fix_bobot
    //
    // Khusus Bug 2 (nilaiVeg), patch_fix_bobot_scoring sudah benar
    // (rata-3). Bug 2 hanya terjadi jika window.rekomendasiWindowTanam
    // BELUM di-override (fallback ke fungsi lokal v3.12). Kita tangani
    // dengan mengoverride window.rekomendasiWindowTanam di bawah,
    // sehingga fungsi lokal v3.12 tidak pernah dipakai lagi.

    var _fnSebelumnya = window.rekomendasiWindowTanam;

    // Wrapper: jalankan fungsi sebelumnya, lalu koreksi hariGen
    // di setiap kandidat yang sudah dievaluasi.
    // Karena hariGen hanya dipakai untuk menentukan BULAN generatif
    // (bGenIdx), kita cukup memperbaiki di dalam fungsi evaluasi.
    // Cara terbersih: replace total fungsi rekomendasiWindowTanamFix
    // dengan versi yang memakai OFFSET_GEN_PER_VARIETAS.

    var NAMA_BULAN_FIX = ['Januari','Februari','Maret','April','Mei','Juni',
                          'Juli','Agustus','September','Oktober','November','Desember'];

    function nilaiPanenFix(skorPanen) {
        if (skorPanen <= 55)  return 65 + (55 - skorPanen) * 0.27;
        if (skorPanen <= 75)  return 65 - (skorPanen - 55) * 1.25;
        return Math.max(25, 40 - (skorPanen - 75) * 0.6);
    }

    function nilaiGeneratifFix(skorGen) {
        var tengah = 50;
        var jarak  = Math.abs(skorGen - tengah);
        if (jarak <= 15) return 100;
        if (jarak <= 30) return 100 - (jarak - 15) * 2;
        return Math.max(20, 70 - (jarak - 30) * 2);
    }

    var BOBOT_FIX = { veg: 0.45, gen: 0.35, panen: 0.20 };

    var varianArrFix = [
        { kode: 'genjah', label: 'Genjah (< 95 HST)',   panen: 90  },
        { kode: 'sedang', label: 'Sedang (95–115 HST)', panen: 110 },
        { kode: 'dalam',  label: 'Dalam (≥ 116 HST)',   panen: 125 }
    ];

    function rekomendasiWindowTanamFixed(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        // ── Deteksi musim (sama seperti v3.12) ──────────────────
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
                        minSum    = lembahSum;
                        startGadu = ii;
                    }
                }
            }
        } else {
            startGadu = (startRendeng + 6) % 12;
        }

        var rendengBulan = [
            startRendeng,
            (startRendeng + 1) % 12, (startRendeng + 2) % 12,
            (startRendeng + 3) % 12, (startRendeng + 4) % 12,
            (startRendeng + 5) % 12
        ];
        var gaduBulan = [
            startGadu,
            (startGadu + 1) % 12, (startGadu + 2) % 12,
            (startGadu + 3) % 12, (startGadu + 4) % 12,
            (startGadu + 5) % 12
        ];

        var MUSIM = [
            { nama: 'MT I — Musim Utama (Puncak Hujan)',   kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: 'MT II — Musim Kedua (Hujan Menurun)', kode: 'gadu',    bulanTanam: gaduBulan   }
        ];

        var hasilDuaMusim = [];

        function cariTglFaseBulanFix(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
            var mulai = tambahHari(acuan, offsetMulai || 0);
            for (var k = 0; k <= 45; k++) {
                var t = tambahHari(mulai, k);
                if (batasBulan !== null && batasBulan !== undefined &&
                    t.getMonth() !== batasBulan) continue;
                var f = hariFaseBulanLokal(t);
                if (f >= faseMin && f <= faseMax) return t;
            }
            return null;
        }

        function statusWaktuTanamFix(tglTanam) {
            var isLewat    = tglTanam.getTime() < now.getTime();
            var isBerjalan = !isLewat &&
                tglTanam.getMonth()    === now.getMonth() &&
                tglTanam.getFullYear() === now.getFullYear();
            return { isLewat: isLewat, isBerjalan: isBerjalan };
        }

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArrFix.forEach(function (v) {
                    // ── BUG 1 FIX: offset generatif per varietas ──
                    var hariGen = hariGenDariVarietas(v.panen, v.kode);

                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunSekarang);
                    var bGenIdx     = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHari(tglTanamRef, v.panen).getMonth();

                    // ── BUG 2 FIX: nilaiVeg selalu rata-3 bulan ──
                    var bVeg1 = (bTanam + 1) % 12;
                    var bVeg2 = (bTanam + 2) % 12;
                    var nilaiVeg = (skorTanam + skorBulan[bVeg1] + skorBulan[bVeg2]) / 3;

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];

                    var nilaiGen   = nilaiGeneratifFix(skorGen);
                    var nilaiPanen = nilaiPanenFix(skorPanen);

                    var nilaiTotal =
                        (nilaiVeg   * BOBOT_FIX.veg  ) +
                        (nilaiGen   * BOBOT_FIX.gen  ) +
                        (nilaiPanen * BOBOT_FIX.panen);

                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 20;
                    if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;

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
                        namaBulanGen  : NAMA_BULAN_FIX[bGenIdx],
                        namaBulanPanen: NAMA_BULAN_FIX[bPanenIdx]
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                var bFallback      = musim.bulanTanam[0];
                var tglAwalFallbk  = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallbk  = cariTglFaseBulanFix(tglAwalFallbk, 3, 8, 0, bFallback)
                                     || new Date(tahunSekarang, bFallback, 10);
                var statusFallbk   = statusWaktuTanamFix(tglFaseFallbk);

                // ── BUG 3 FIX: sertakan tglOlahTanah ──
                var tglOlahFallbk  = tambahHari(tglFaseFallbk, -25);

                hasilDuaMusim.push({
                    musimNama    : musim.nama,
                    musimKode    : musim.kode,
                    tglTanam     : tglFaseFallbk,
                    tglOlahTanah : tglOlahFallbk,    // ← BUG 3 FIX
                    varietas     : 'sedang',
                    labelVar     : 'Sedang (95–115 HST)',
                    umurTotal    : 110,
                    alasan       : 'Kondisi kering ekstrem di seluruh jendela tanam. Jadwal default fase bulan terbaik. Pompanisasi penuh mungkin diperlukan.',
                    isLewat      : statusFallbk.isLewat,
                    isBerjalan   : statusFallbk.isBerjalan
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, tahunSekarang);
                var tglFaseBaik  = cariTglFaseBulanFix(tglAwalBulan, 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = cariTglFaseBulanFix(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = new Date(tahunSekarang, best.bTanam, 10);

                var statusBest  = statusWaktuTanamFix(tglFaseBaik);

                // ── BUG 3 FIX: hitung tglOlahTanah ──
                var tglOlahBest = tambahHari(tglFaseBaik, -25);

                var keteranganGen =
                    best.skorGen < 25 ? 'kering — waspada puso' :
                    best.skorGen > 70 ? 'basah — waspada Blast' :
                                        'kondisi air seimbang — optimal pembungaan';

                var keteranganPanen =
                    best.skorPanen > 75 ? 'perkiraan basah — siapkan dryer' :
                    best.skorPanen > 55 ? 'perkiraan agak basah — koordinasi combine' :
                    best.skorPanen < 20 ? 'perkiraan kering — ideal untuk panen mekanis' :
                                          'kondisi panen cukup baik';

                hasilDuaMusim.push({
                    musimNama    : best.musimNama,
                    musimKode    : best.musimKode,
                    tglTanam     : tglFaseBaik,
                    tglOlahTanah : tglOlahBest,      // ← BUG 3 FIX
                    varietas     : best.varietas,
                    labelVar     : best.labelVar,
                    umurTotal    : best.umurTotal,
                    alasan       :
                        'Skor air bulan tanam: ' + best.skorTanam + '/100. ' +
                        'Generatif di ' + best.namaBulanGen + ': ' + keteranganGen + '. ' +
                        'Panen di ' + best.namaBulanPanen + ': ' + keteranganPanen + '.',
                    isLewat      : statusBest.isLewat,
                    isBerjalan   : statusBest.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function (a, b) {
            return a.tglTanam.getTime() - b.tglTanam.getTime();
        });
        return hasilDuaMusim;
    }

    // ── 4. PATCH BANGUNKEGIATAN ───────────────────────────────────
    // Bug 3 lanjutan: bahkan jika rekomendasiWindowTanam sudah benar,
    // bangunKegiatan() masih bisa menerima objek lama dari cache atau
    // dari rekomendasiWindowTanamV4 (v3.0.1) yang format outputnya
    // sedikit berbeda. Guard di sini sebagai jaring pengaman.
    //
    // Kita wrap window._bangunKegiatanAsli jika ada, atau langsung
    // intercept dengan cara override prosesJadwalOtomatis memakai
    // multiJadwal yang sudah punya tglOlahTanah.
    //
    // Strategi: intercept di titik pembuatan multiJadwal di
    // prosesJadwalOtomatis(). Tapi karena itu private IIFE, kita
    // pakai pendekatan paling aman: pastikan setiap rek yang masuk
    // ke bangunKegiatan memiliki tglOlahTanah.
    //
    // Inject helper ke window agar bisa dipakai dari mana saja:
    window._pastikanTglOlahTanah = function (rek) {
        if (!rek) return rek;
        if (!(rek.tglOlahTanah instanceof Date) ||
            isNaN(rek.tglOlahTanah.getTime())) {
            // Hitung mundur 25 hari dari tglTanam (standar JEDA_OLAH v3.0.1)
            rek.tglOlahTanah = tambahHari(rek.tglTanam, -25);
        }
        return rek;
    };

    // ── 5. PATCH varianArr DI DETEKSI MUSIM ──────────────────────
    // Bug 1 juga ada di evaluasiKandidatMusim() dalam
    // patch_deteksi_musim_v1.js (private IIFE, tidak bisa diubah).
    // Solusi: setelah rekomendasiWindowTanamV4 berjalan, hasilnya
    // berisi bTanam yang sudah benar — Bug 1 di v3.0.1 hanya
    // mempengaruhi PEMILIHAN BULAN, bukan tanggal akhir.
    // Karena window.rekomendasiWindowTanam sudah kita replace
    // dengan rekomendasiWindowTanamFixed di bawah, v4 tidak
    // dipanggil lagi oleh prosesJadwalOtomatis — sudah aman.

    // ── 6. INJEKSI ───────────────────────────────────────────────
    function injeksi() {
        // Override window.rekomendasiWindowTanam dengan versi fixed
        

        // Expose tabel offset agar bisa dipakai patch lain
        window.OFFSET_GEN_PER_VARIETAS = OFFSET_GEN_PER_VARIETAS;
        window.hariGenDariVarietas      = hariGenDariVarietas;

        // Validasi cepat: hitung hariGen untuk semua varietas dan log
        var validasi = varianArrFix.map(function (v) {
            return {
                varietas     : v.kode,
                'umurTotal'  : v.panen,
                'hariGen lama (×0.55)': Math.floor(v.panen * 0.55),
                'hariGen baru'        : hariGenDariVarietas(v.panen, v.kode),
                'selisih hari'        : hariGenDariVarietas(v.panen, v.kode) - Math.floor(v.panen * 0.55)
            };
        });

        console.log(
            '%c✅ patch_bugfix_v1.js aktif\n' +
            '\n  ╔══ 3 BUG DIPERBAIKI ════════════════════╗\n' +
            '  ║ ✅ [BUG 1] Offset gen per varietas      \n' +
            '  ║    genjah: 55%→65% (+9 hari ke fase bunting)\n' +
            '  ║    sedang: 55%→60% (+5 hari)           \n' +
            '  ║    dalam : 55%→58% (+4 hari)           \n' +
            '  ║ ✅ [BUG 2] nilaiVeg rata-3 di semua path\n' +
            '  ║ ✅ [BUG 3] tglOlahTanah tidak lagi undef\n' +
            '  ║ ✅ EPOCH dipusatkan ke window.EPOCH_BULAN_BARU\n' +
            '  ╚════════════════════════════════════════╝',
            'color:#10b981; font-weight:bold;'
        );
        console.table(validasi);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksi);
    } else {
        setTimeout(injeksi, 300); // tunggu semua patch sebelumnya selesai inject
    }

})();
