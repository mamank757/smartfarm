/**
 * ============================================================
 * patch_fix_status_panel_flag_v1.js
 * Perbaikan false-negative "BELUM" di panel status ⚙️
 * ------------------------------------------------------------
 * MASALAH:
 *   patch_status_panel_v1.js mengecek status integrasi dengan
 *   membaca PROPERTI pada fungsi window SAAT INI, contoh:
 *     window.hitungRisikoDinamis.__kelvinTersuntik
 *     window.rekomendasiWindowTanam.__sstMjoTersuntik
 *
 *   Properti ini dipasang oleh patch_gelombang_ekuator_v1.js dan
 *   patch_kalender_tnm_sst_mjo_v1.js pada FUNGSI PEMBUNGKUS milik
 *   mereka sendiri. Tapi kedua fungsi window itu DIBUNGKUS LAGI
 *   oleh patch-patch yang dimuat setelahnya:
 *     - window.hitungRisikoDinamis dibungkus lagi oleh
 *       patch_bugfix_b1b3_v1.js dan patch_enso_dominance_v1.js
 *     - window.rekomendasiWindowTanam dibungkus lagi oleh
 *       patch_fix_konsistensi_rawa_6faktor_v1.js
 *
 *   Setiap pembungkusan ulang membuat OBJEK FUNGSI BARU. Properti
 *   custom (__kelvinTersuntik, __sstMjoTersuntik) milik fungsi
 *   LAMA tidak ikut terbawa ke fungsi BARU — properti itu masih
 *   "hidup" di closure yang lebih dalam, tapi tidak lagi terlihat
 *   di permukaan window.hitungRisikoDinamis / window.rekomendasi-
 *   WindowTanam yang dicek panel. Panel jadi salah membaca status
 *   "BELUM AKTIF" padahal Kelvin/Rossby & SST/MJO TETAP BEKERJA
 *   secara fungsional di dalam rantai.
 *
 * PERBAIKAN:
 *   Ganti sumber kebenaran ke FLAG INIT level-window yang masing-
 *   masing file SUDAH pasang di akhir init()-nya sendiri, dan flag
 *   ini TIDAK PERNAH tertimpa oleh pembungkusan berikutnya karena
 *   bukan properti pada fungsi yang bisa diganti, melainkan properti
 *   window biasa yang cuma di-set SEKALI:
 *     window.__gelombangEkuatorV1Aktif      (dipasang gelombang_ekuator)
 *     window.__kalenderTnmSstMjoV1Aktif      (dipasang kalender_tnm_sst_mjo)
 *
 *   File ini memasang MutationObserver pada #spIsi (isi panel),
 *   dan setiap kali panel dirender ulang (baik lewat tombol ⚙️
 *   pertama kali dibuka, maupun tombol ↻ REFRESH), baris
 *   "KALENDER TNM" dan "RISIKO CUACA" dikoreksi berdasarkan flag
 *   yang benar di atas — tanpa perlu mengubah patch_status_panel_v1.js
 *   maupun mengulang render manapun.
 *
 * CARA PASANG — letakkan SETELAH patch_status_panel_v1.js
 * (boleh di posisi manapun setelahnya, termasuk paling akhir):
 *   <script src="patch_status_panel_v1.js"></script>
 *   <script src="patch_fix_status_panel_flag_v1.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__fixStatusPanelFlagAktif) {
        console.warn('[fix_status_panel] sudah aktif, skip.');
        return;
    }

    var W_OK   = '#10b981';
    var W_WARN = '#f59e0b';

    function terapkanStatus(row, benar, detailAktif, badgeAktif) {
        var dotEl    = row.querySelector('.sp-dot');
        var badgeEl  = row.querySelector('.sp-badge');
        var detailEl = row.querySelector('.sp-detail');
        if (!dotEl || !badgeEl) return;

        var sudahBenar = badgeEl.textContent.trim() === badgeAktif;
        if (!benar || sudahBenar) return; // hanya koreksi kalau memang salah & seharusnya AKTIF

        dotEl.style.background   = W_OK;
        dotEl.style.boxShadow    = '0 0 5px ' + W_OK;
        badgeEl.textContent      = badgeAktif;
        badgeEl.style.background = W_OK + '22';
        badgeEl.style.color      = W_OK;
        badgeEl.style.borderColor = W_OK + '44';
        if (detailEl) detailEl.innerHTML = detailAktif;

        console.log(
            '%c[fix_status_panel] Koreksi false-negative pada panel status.',
            'color:#d946ef;font-weight:bold;'
        );
    }

    function perbaikiBarisStatus() {
        var rows = document.querySelectorAll('#spIsi .sp-row');
        rows.forEach(function (row) {
            var nameEl = row.querySelector('.sp-name');
            if (!nameEl) return;
            var nama = nameEl.textContent.trim();

            if (nama === 'KALENDER TNM') {
                var kalenderBenar = typeof window.rekomendasiWindowTanam === 'function' &&
                    window.__kalenderTnmSstMjoV1Aktif === true;
                terapkanStatus(row, kalenderBenar,
                    'SST & MJO tersuntik ke rawZOM ✅<br>Mempengaruhi pemilihan bulan tanam nyata' +
                    '<br><span style="opacity:0.7;">(dikoreksi — flag asli tertimpa wrapper lain)</span>',
                    'AKTIF ✅');
            } else if (nama === 'RISIKO CUACA') {
                var risikoBenar = typeof window.hitungRisikoDinamis === 'function' &&
                    window.__gelombangEkuatorV1Aktif === true;
                terapkanStatus(row, risikoBenar,
                    'Kelvin & Rossby tersuntik ke hitungRisikoDinamis ✅' +
                    '<br><span style="opacity:0.7;">(dikoreksi — flag asli tertimpa wrapper lain)</span>',
                    'AKTIF ✅');
            }
        });
    }

    function pasang(tick) {
        tick = tick || 0;
        var target = document.getElementById('spIsi');
        if (!target) {
            if (tick >= 80) {
                console.error('[fix_status_panel] #spIsi tidak ditemukan — cek urutan <script> patch_status_panel_v1.js.');
                return;
            }
            setTimeout(function () { pasang(tick + 1); }, 100);
            return;
        }

        var observer = new MutationObserver(function () {
            perbaikiBarisStatus();
        });
        observer.observe(target, { childList: true });

        // Cek juga langsung kalau panel kebetulan sudah terbuka
        perbaikiBarisStatus();

        window.__fixStatusPanelFlagAktif = true;
        console.log(
            '%c✅ patch_fix_status_panel_flag_v1.js aktif — baris KALENDER TNM & RISIKO CUACA ' +
            'di panel ⚙️ kini dibaca dari flag init yang stabil, tidak lagi salah tampil "BELUM".',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasang, 1300); });
    } else {
        setTimeout(pasang, 1300);
    }

})();
