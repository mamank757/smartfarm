/**
 * ============================================================
 *  patch_jadwal_manual_trigger.js
 *  Versi: 1.0
 * ------------------------------------------------------------
 *  MASALAH:
 *  Di patch_jadwal_tanam_otomatis.js, fungsi patchSwitchMode()
 *  memicu prosesJadwalOtomatis() secara otomatis setiap kali
 *  tab "JADWAL TANAM" dibuka — bahkan sebelum GPS siap, dan
 *  tanpa persetujuan eksplisit dari pengguna.
 *
 *  Baris bermasalah (di dalam patchSwitchMode → mode 'jadwaltanam'):
 *    var hasilEl = document.getElementById('jtoHasil');
 *    if (hasilEl && hasilEl.style.display === 'none') prosesJadwalOtomatis();
 *
 *  PERBAIKAN:
 *  Override window.switchMode satu kali lagi setelah semua
 *  patch lain selesai, khusus untuk menghapus pemanggilan
 *  otomatis tersebut. Analisis hanya berjalan saat tombol
 *  "ANALISIS & BUAT JADWAL OTOMATIS" dipencet secara manual.
 *
 *  CARA PAKAI:
 *  Letakkan tag ini PALING TERAKHIR, setelah semua patch lain:
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_deteksi_musim_v1.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>  ← ini
 * ============================================================
 */

(function () {
    'use strict';

    function pasangManualTrigger() {
        /* Simpan versi switchMode yang sudah dimodifikasi oleh patch sebelumnya */
        var _switchModeSebelumnya = window.switchMode;

        window.switchMode = function (mode) {
            if (mode === 'jadwaltanam') {
                /* Jalankan semua logika mode jadwaltanam dari patch sebelumnya,
                   KECUALI pemanggilan prosesJadwalOtomatis() otomatis.
                   Caranya: intercept di sini, jalankan _switchModeSebelumnya,
                   lalu batalkan efek samping otomatis dengan cara reset status
                   tombol agar tetap siap dipencet manual. */

                _switchModeSebelumnya.apply(this, arguments);

                /* Setelah _switchModeSebelumnya() berjalan, prosesJadwalOtomatis()
                   mungkin sudah dipanggil (karena ada di sana). Kita tidak bisa
                   membatalkan yang sudah berjalan, tapi kita bisa mencegah
                   pemanggilan berikutnya.

                   Solusi lebih bersih: ganti langsung window.switchMode
                   dengan versi yang tidak punya baris auto-trigger. */
                return;
            }

            _switchModeSebelumnya.apply(this, arguments);
        };

        /* Pendekatan lebih pasti: patch langsung ke dalam logika mode jadwaltanam
           dengan mengganti seluruh handler, bukan hanya membungkusnya.
           Ini lebih andal karena menghilangkan auto-trigger dari akarnya. */
        var _switchModePatch = window.switchMode;

        window.switchMode = function (mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');
            var tabJTO = document.getElementById('tabJadwalTanam');
            var WARNA  = '#06b6d4';

            if (mode === 'jadwaltanam') {
                /* Jalankan reset kamera/malai jika fungsinya tersedia */
                if (typeof window._jtoResetState === 'function') {
                    window._jtoResetState();
                } else {
                    /* Coba panggil fungsi reset dari patch jadwal jika ada */
                    try {
                        if (typeof window.stopCamera === 'function') window.stopCamera();
                    } catch (e) {}
                }

                /* Sembunyikan semua elemen selain box jadwal */
                var ELEMEN = [
                    'result','btnCamera','scanWindow','btnAnalisis',
                    'boxCuaca','boxPenyakit','boxHama','boxGulma',
                    'boxTanah','boxBWD','boxMalai','boxBiayaTani',
                    'boxKalkulatorPupuk','boxKalender','boxVarietasPadi',
                    'boxUkurLahan','boxPestisida','boxGabah',
                    'formParameterLahan','tabSubtitleDisplay',
                    'loader','cameraWarning'
                ];
                ELEMEN.forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                document.querySelectorAll('.info-box-dynamic').forEach(function (el) {
                    el.style.display = 'none';
                });
                document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
                    b.style.display = 'none';
                });

                /* Tampilkan box jadwal tanam */
                if (boxJTO) boxJTO.style.display = 'block';

                /* Update judul */
                var titleEl = document.getElementById('modeTitle');
                if (titleEl) {
                    titleEl.innerText    = '📅 Jadwal Kegiatan Tani';
                    titleEl.style.color  = WARNA;
                }
                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) {
                    subEl.innerText       = '';
                    subEl.style.display   = 'none';
                }

                /* Update state tab aktif */
                document.querySelectorAll('.tab-btn').forEach(function (btn) {
                    btn.classList.remove('active');
                });
                if (tabJTO) tabJTO.classList.add('active');

                /* ── TIDAK ada pemanggilan prosesJadwalOtomatis() di sini ── */
                /* Pengguna harus menekan tombol secara manual                */

                try {
                    if (typeof currentMode !== 'undefined') currentMode = 'jadwaltanam';
                } catch (e) {}

                return;
            }

            /* Untuk mode lain, delegasikan ke versi sebelumnya */
            if (boxJTO) boxJTO.style.display = 'none';
            if (tabJTO) tabJTO.classList.remove('active');

            /* Panggil switchMode dari patch sebelumnya (cuaca, dll.) */
            _switchModePatch.apply(this, arguments);
        };

        console.log(
            '%c✅ patch_jadwal_manual_trigger.js aktif ' +
            '— Analisis hanya berjalan saat tombol dipencet',
            'color:#06b6d4; font-weight:bold;'
        );
    }

    /* Tunggu semua patch lain selesai baru override */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(pasangManualTrigger, 100);
        });
    } else {
        setTimeout(pasangManualTrigger, 100);
    }

})();
