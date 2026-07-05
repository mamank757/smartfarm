/**
 * ============================================================
 * patch_diagnostik_urutan_switchmode_v1.js
 * Pemantau urutan wrap window.switchMode (untuk masalah timing)
 * ------------------------------------------------------------
 * KONTEKS MASALAH:
 *   window.switchMode ditimpa (wrap) oleh 6 file berbeda:
 *     - patch_lokasi_cuaca_terpadu.js  (langsung saat parse, sinkron)
 *     - patch_pestisida.js             (langsung saat parse, sinkron)
 *     - patch_jadwal_tanam_otomatis.js (saat DOMContentLoaded, t0)
 *     - patch_jadwal_manual_trigger.js (t0 + 100ms)
 *     - patch_sawah_rawa_v1.js         (t0 + 300ms)
 *     - patch_kuota_harian.js          (langsung saat parse, sinkron)
 *   Urutan LAPISAN AKHIR ditentukan oleh KAPAN masing-masing kode
 *   benar-benar jalan (delay setTimeout), BUKAN oleh urutan tag
 *   <script> di index.html. Saat ini semua tetap saling delegasi
 *   dengan benar (tidak ada fungsi yang hilang), tapi urutannya
 *   "kebetulan benar" karena nilai delay yang dipakai sekarang.
 *   Kalau salah satu delay diubah di kemudian hari (atau perangkat
 *   pengguna lambat sehingga event loop tertunda), urutan lapisan
 *   bisa berubah tanpa disadari.
 *
 * KENAPA TIDAK DIPERBAIKI LANGSUNG DI SINI:
 *   Perbaikan permanen butuh mengubah SEMUA 6 file itu agar tidak
 *   lagi monkey-patch window.switchMode satu-sama-lain, melainkan
 *   mendaftar (register) sebagai handler ke satu titik terpusat
 *   (misal window._switchModeHandlers = []). Itu perubahan struktural
 *   ke banyak file — beri tahu saya jika Anda ingin saya kerjakan
 *   refactor tersebut secara terpisah.
 *
 * APA YANG FILE INI LAKUKAN (sementara):
 *   Bukan fix, tapi PEMANTAU. Setelah semua patch lain dipastikan
 *   selesai memasang wrapper-nya (delay 3000ms — lebih lama dari
 *   delay terpanjang yang ada, yaitu 300ms), file ini memeriksa
 *   apakah lapisan TERLUAR window.switchMode adalah yang kita
 *   harapkan (sawah_rawa_v1, karena delay-nya paling panjang).
 *   Jika BUKAN, konsol akan menampilkan WARNING agar developer
 *   tahu urutan sudah berubah — sebelum jadi bug nyata di lapangan.
 *
 * CARA PASANG — letakkan PALING TERAKHIR di index.html:
 *   <script src="patch_fix_konsistensi_rawa_6faktor_v1.js"></script>
 *   <script src="patch_diagnostik_urutan_switchmode_v1.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__diagnostikSwitchModeAktif) {
        console.warn('[diag_switchmode] sudah aktif, skip.');
        return;
    }
    window.__diagnostikSwitchModeAktif = true;

    // Marker unik yang HANYA muncul di source function masing-masing
    // wrapper (dipakai untuk mengenali siapa lapisan terluar lewat
    // Function.prototype.toString()).
    var MARKER = [
        { nama: 'patch_sawah_rawa_v1.js',         cari: 'injectDropdowns' },
        { nama: 'patch_jadwal_manual_trigger.js', cari: 'resetStateBwdDanMalaiLokal' },
        { nama: 'patch_jadwal_tanam_otomatis.js', cari: 'resetStateBwdDanMalai' },
        { nama: 'patch_pestisida.js',             cari: 'boxAturPestisida' },
        { nama: 'patch_lokasi_cuaca_terpadu.js',  cari: 'resLabel' },
        { nama: 'patch_kuota_harian.js',          cari: '_kuotaMode' }
    ];

    var URUTAN_YANG_DIHARAPKAN = 'patch_sawah_rawa_v1.js';

    window.cekUrutanSwitchMode = function () {
        console.log('%c=== CEK URUTAN WRAPPER switchMode ===', 'color:#d946ef;font-weight:bold;');

        if (typeof window.switchMode !== 'function') {
            console.error('❌ window.switchMode bukan fungsi / tidak ada.');
            return;
        }

        var src = window.switchMode.toString();
        var terdeteksi = null;
        for (var i = 0; i < MARKER.length; i++) {
            if (src.indexOf(MARKER[i].cari) !== -1) { terdeteksi = MARKER[i].nama; break; }
        }

        if (!terdeteksi) {
            console.warn(
                '⚠️ Lapisan TERLUAR switchMode tidak cocok dengan marker manapun ' +
                'yang diketahui. Mungkin ada patch baru yang menimpa switchMode ' +
                'dan belum terdaftar di file diagnostik ini.'
            );
        } else if (terdeteksi === URUTAN_YANG_DIHARAPKAN) {
            console.log('✅ Lapisan terluar switchMode sesuai perkiraan:', terdeteksi);
        } else {
            console.warn(
                '⚠️ Lapisan terluar switchMode BUKAN "' + URUTAN_YANG_DIHARAPKAN +
                '" seperti biasanya, melainkan "' + terdeteksi + '". ' +
                'Urutan delay eksekusi kemungkinan sudah berubah — periksa apakah ' +
                'semua mode (jadwaltanam, aturpestisida, cuaca, dll) masih tampil benar.'
            );
        }

        console.log('%c======================================', 'color:#d946ef;font-weight:bold;');
        return terdeteksi;
    };

    function jalankanCekOtomatis() {
        // 3000ms: sengaja lebih lama dari delay terpanjang (300ms milik
        // patch_sawah_rawa_v1.js) supaya semua wrapper lain dipastikan
        // sudah terpasang sebelum kita periksa.
        window.cekUrutanSwitchMode();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(jalankanCekOtomatis, 3000); });
    } else {
        setTimeout(jalankanCekOtomatis, 3000);
    }

    console.log(
        '%c✅ patch_diagnostik_urutan_switchmode_v1.js aktif — cek otomatis dalam 3 detik.\n' +
        '   Ketik window.cekUrutanSwitchMode() di console kapan saja untuk cek manual.',
        'color:#94a3b8;font-weight:bold;'
    );

})();
