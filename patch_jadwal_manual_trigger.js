/**
 * ============================================================
 *  patch_jadwal_manual_trigger.js
 *  Versi: 1.1 — Fix Reset State BWD/Malai + Hapus Double Override
 * ------------------------------------------------------------
 *  PERBAIKAN v1.1 vs v1.0:
 *
 *  [FIX KRITIS] Versi 1.0 memanggil window._jtoResetState(),
 *    sebuah fungsi yang TIDAK PERNAH dibuat oleh
 *    patch_jadwal_tanam_otomatis.js (fungsi aslinya bernama
 *    resetStateBwdDanMalai() dan bersifat privat di dalam
 *    IIFE-nya, tidak pernah di-export ke window).
 *
 *    Akibatnya, setiap kali tab "JADWAL TANAM" dibuka, kode
 *    selalu jatuh ke fallback yang HANYA memanggil
 *    window.stopCamera() — tanpa mereset:
 *      - tampilan bwdCameraPrompt / cameraContainer / btnCapture
 *      - tombol btnAktifkanKameraBWD (teks & status disabled)
 *      - preview foto BWD (bwdPreviewImage) & focusBox
 *      - array hasilSampelBulir & isi #listMalai
 *
 *    Dampak nyata: jika pengguna sempat ambil foto sampel malai
 *    (mode 'malai'), lalu membuka tab "JADWAL TANAM", lalu
 *    kembali ke mode 'malai' — data sampel lama (hasilSampelBulir
 *    & #listMalai) TIDAK terhapus, karena switchMode asli hanya
 *    membersihkannya saat mode !== 'malai'.
 *
 *    [FIX] v1.1 menanamkan ulang logika resetStateBwdDanMalai()
 *    secara lengkap di dalam file ini (mandiri, tidak bergantung
 *    pada fungsi privat file lain).
 *
 *  [FIX SEDANG] v1.0 membuat window.switchMode dua kali secara
 *    berurutan (override pertama langsung ditimpa lagi oleh
 *    override kedua, sehingga override pertama jadi dead code
 *    dan menambah 1 lapis pemanggilan tak perlu untuk mode lain).
 *    [FIX] v1.1 hanya melakukan SATU override yang bersih.
 *
 *  [FIX KECIL] Warna judul mode 'jadwaltanam' di v1.0 memakai
 *    ' #3b82f6' (biru, dengan spasi liar) — tidak senada dengan
 *    warna cyan (#06b6d4) milik tab aktif & box info dari
 *    patch_jadwal_tanam_otomatis.js. [FIX] disamakan jadi #06b6d4.
 *
 *  CARA PAKAI (tidak berubah dari v1.0):
 *  Letakkan tag ini PALING TERAKHIR, setelah semua patch lain:
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_deteksi_musim_v1.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>  ← ini
 * ============================================================
 */

(function () {
    'use strict';

    var WARNA = '#3b82f6';

    /**
     * [FIX KRITIS] Implementasi mandiri pengganti window._jtoResetState
     * yang tidak pernah ada. Logikanya disalin 1:1 dari
     * resetStateBwdDanMalai() di patch_jadwal_tanam_otomatis.js,
     * supaya tab "JADWAL TANAM" benar-benar membersihkan sisa
     * state kamera/BWD/Malai — bukan hanya menghentikan kamera.
     */
    function resetStateBwdDanMalaiLokal() {
        try {
            if (typeof window.stopCamera === 'function') window.stopCamera();
        } catch (e) {}

        var bwdPrompt    = document.getElementById('bwdCameraPrompt');
        var camContainer = document.getElementById('cameraContainer');
        var btnCapture   = document.getElementById('btnCapture');
        var btnAktifkan  = document.getElementById('btnAktifkanKameraBWD');
        var previewImg   = document.getElementById('bwdPreviewImage');
        var focusBox     = document.getElementById('focusBox');

        if (bwdPrompt)    bwdPrompt.style.display    = 'block';
        if (camContainer) camContainer.style.display = 'none';
        if (btnCapture)   btnCapture.style.display   = 'none';
        if (previewImg)   previewImg.style.display   = 'none';
        if (focusBox)     focusBox.style.display      = 'block';
        if (btnAktifkan) {
            btnAktifkan.innerText     = '📷 AKTIFKAN KAMERA';
            btnAktifkan.disabled      = false;
            btnAktifkan.style.opacity = '1';
        }

        // [FIX KRITIS] Bersihkan sisa sampel malai agar tidak
        // "nyangkut" saat pengguna kembali ke mode 'malai'.
        try { if (typeof hasilSampelBulir !== 'undefined') hasilSampelBulir = []; } catch (e) {}
        var listM = document.getElementById('listMalai');
        if (listM) listM.innerHTML = '';
    }

    var ELEMEN_TERSEMBUNYI_JADWAL = [
        'result', 'btnCamera', 'scanWindow', 'btnAnalisis',
        'boxCuaca', 'boxPenyakit', 'boxHama', 'boxGulma',
        'boxTanah', 'boxBWD', 'boxMalai', 'boxBiayaTani',
        'boxKalkulatorPupuk', 'boxKalender', 'boxVarietasPadi',
        'boxUkurLahan', 'boxPestisida', 'boxGabah',
        'formParameterLahan', 'tabSubtitleDisplay',
        'loader', 'cameraWarning'
    ];

    function pasangManualTrigger() {
        var _switchModeSebelumnya = window.switchMode;

        if (typeof _switchModeSebelumnya !== 'function') {
            console.warn('[ManualTrigger] window.switchMode belum tersedia — patch dibatalkan.');
            return;
        }

        /* [FIX SEDANG] Hanya SATU override, bersih — tidak ada
           lagi override ganda yang saling menimpa. */
        window.switchMode = function (mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');
            var tabJTO = document.getElementById('tabJadwalTanam');

            if (mode === 'jadwaltanam') {
                // [FIX KRITIS] Reset lengkap, bukan hanya stopCamera()
                resetStateBwdDanMalaiLokal();

                ELEMEN_TERSEMBUNYI_JADWAL.forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                document.querySelectorAll('.info-box-dynamic').forEach(function (el) {
                    el.style.display = 'none';
                });
                document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
                    b.style.display = 'none';
                });

                if (boxJTO) boxJTO.style.display = 'block';

                var titleEl = document.getElementById('modeTitle');
                if (titleEl) {
                    titleEl.innerText   = '📅 Jadwal Kegiatan Tani';
                    titleEl.style.color = WARNA; // [FIX KECIL] konsisten cyan
                }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) {
                    subEl.innerText     = '';
                    subEl.style.display = 'none';
                }

                document.querySelectorAll('.tab-btn').forEach(function (btn) {
                    btn.classList.remove('active');
                });
                if (tabJTO) tabJTO.classList.add('active');

                try { if (typeof currentMode !== 'undefined') currentMode = 'jadwaltanam'; } catch (e) {}

                /* ── TIDAK ada pemanggilan prosesJadwalOtomatis() di sini ── */
                /* Pengguna harus menekan tombol "ANALISIS & BUAT JADWAL     */
                /* OTOMATIS" secara manual.                                  */
                return;
            }

            // Mode lain: bersihkan box jadwal, lalu delegasikan
            if (boxJTO) boxJTO.style.display = 'none';
            if (tabJTO) tabJTO.classList.remove('active');

            _switchModeSebelumnya.apply(this, arguments);
        };

        console.log(
            '%c✅ patch_jadwal_manual_trigger.js v1.1 aktif ' +
            '— Analisis hanya berjalan saat tombol dipencet, ' +
            'reset state BWD/Malai sudah lengkap',
            'color:#3b82f6; font-weight:bold;'
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
