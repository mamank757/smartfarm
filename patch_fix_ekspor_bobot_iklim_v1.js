/**
 * ============================================================
 * patch_fix_ekspor_bobot_iklim_v1.js
 * Perbaikan bug scope: BOBOT_IKLIM tidak terlihat antar-file
 * ------------------------------------------------------------
 * MASALAH:
 *   patch_risiko_iklim.js mendeklarasikan:
 *     var BOBOT_IKLIM = { monsunal:{...}, ekuatorial:{...},
 *                          lokal:{...}, peralihan:{...} };
 *   sebagai variabel LOKAL di dalam IIFE-nya sendiri.
 *
 *   patch_deteksi_musim_v1.js (terapkanPenyesuaianENSOIOD) dan
 *   patch_jadwal_tanam_otomatis.js melakukan:
 *     var tabel = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
 *
 *   Setiap file <script> punya closure/scope terpisah — sebuah
 *   `var` di satu IIFE TIDAK PERNAH terlihat oleh IIFE file lain,
 *   walau sama-sama dimuat di index.html. Akibatnya `tabel` di
 *   KEDUA file itu SELALU `null`, dan penyesuaian ENSO/IOD untuk
 *   mesin Irigasi/Tadah Hujan (candidat bulan tanam & onset hujan)
 *   TIDAK PERNAH benar-benar diterapkan — berlaku untuk SELURUH
 *   lokasi di Indonesia, bukan spesifik satu wilayah.
 *
 * PERBAIKAN:
 *   Salin ulang tabel yang SAMA persis (sudah termasuk kategori
 *   'lokal' yang lengkap) sebagai window.BOBOT_IKLIM. Karena bare
 *   identifier `BOBOT_IKLIM` di JavaScript, kalau tidak ditemukan
 *   di scope lokal manapun, akan otomatis dicari sebagai properti
 *   `window` — jadi begitu window.BOBOT_IKLIM terisi, KEDUA file
 *   lain otomatis "hidup" tanpa perlu diubah sendiri.
 *
 * CARA PASANG — boleh di mana saja SEBELUM tombol analisis
 * pertama kali dipencet user (aman diletakkan di awal atau akhir):
 *   <script src="patch_fix_ekspor_bobot_iklim_v1.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    if (window.BOBOT_IKLIM) {
        console.warn('[fix_bobot_iklim] window.BOBOT_IKLIM sudah ada, skip (hindari menimpa).');
        return;
    }

    // Disalin 1:1 dari patch_risiko_iklim.js — SATU sumber kebenaran,
    // supaya tidak ada tabel bobot yang saling berbeda nilainya.
    window.BOBOT_IKLIM = {
        monsunal: {
            enso: [0.15, 0.15, 0.12, 0.10, 0.18, 0.35,
                   0.45, 0.50, 0.45, 0.35, 0.20, 0.15],
            iod:  [0.10, 0.10, 0.08, 0.08, 0.12, 0.20,
                   0.28, 0.38, 0.40, 0.30, 0.15, 0.10]
        },
        ekuatorial: {
            enso: [0.10, 0.10, 0.08, 0.08, 0.10, 0.15,
                   0.18, 0.20, 0.18, 0.15, 0.10, 0.10],
            iod:  [0.20, 0.18, 0.15, 0.12, 0.15, 0.22,
                   0.30, 0.42, 0.48, 0.38, 0.25, 0.20]
        },
        lokal: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.28, 0.25, 0.20, 0.15, 0.12],
            iod:  [0.08, 0.08, 0.08, 0.08, 0.10, 0.12,
                   0.15, 0.20, 0.22, 0.18, 0.12, 0.08]
        },
        peralihan: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.14, 0.22,
                   0.30, 0.35, 0.30, 0.25, 0.16, 0.12],
            iod:  [0.14, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.30, 0.33, 0.25, 0.18, 0.14]
        }
    };

    console.log(
        '%c✅ patch_fix_ekspor_bobot_iklim_v1.js aktif — window.BOBOT_IKLIM terisi.\n' +
        '   terapkanPenyesuaianENSOIOD() di patch_deteksi_musim_v1.js dan\n' +
        '   patch_jadwal_tanam_otomatis.js sekarang benar-benar aktif menerapkan\n' +
        '   penyesuaian ENSO/IOD (sebelumnya selalu no-op karena tabel tak terlihat).',
        'color:#10b981;font-weight:bold;'
    );
})();
