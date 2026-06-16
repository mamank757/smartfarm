/**
 * patch_bwd_fix.js
 * =================
 * Patch untuk membersihkan sisa kode BWD lama (analisis RGB lokal)
 * dan memastikan semua analisis daun dikirim ke URL_BWD (AppScript).
 *
 * Cara pakai: letakkan di bawah semua <script> lain di HTML,
 * atau simpan file ini lalu panggil:
 *   <script src="patch_bwd_fix.js"></script>
 *
 * PPL Milenial Wajo — Smart Farming
 */

(function () {
    'use strict';

    /* ================================================================
       1. NONAKTIFKAN FUNGSI LAMA BERBASIS RGB
          Fungsi-fungsi ini menganalisis pixel kamera secara lokal,
          BUKAN mengirim ke AppScript. Harus digantikan / dikosongkan.
       ================================================================ */

    // Fungsi lama: analisis pixel canvas RGB — tidak dipakai lagi
    window.analisisWarnaDaun = function (imageData) {
        console.warn('[BWD PATCH] analisisWarnaDaun() dipanggil tapi sudah dinonaktifkan. Gunakan alur fetch ke URL_BWD.');
    };

    // Fungsi lama: pencarian skala terdekat via rasio RGB
    window.cariSkalaTerdekatViaRasio = function (r, g, b) {
        console.warn('[BWD PATCH] cariSkalaTerdekatViaRasio() sudah dinonaktifkan.');
        return 3; // return nilai default aman
    };

    // Fungsi lama: tampil rasio RGB ke modal (tidak relevan sekarang)
    window.showLeafAnalysisResult = function (r, g, b) {
        console.warn('[BWD PATCH] showLeafAnalysisResult() sudah dinonaktifkan.');
    };

    /* ================================================================
       2. AMANKAN BWD_STANDAR
          Array ini hanya dipakai oleh fungsi RGB lama.
          Kosongkan agar tidak disalahgunakan.
       ================================================================ */
    if (window.BWD_STANDAR !== undefined) {
        window.BWD_STANDAR = [];
    }

    /* ================================================================
       3. PASTIKAN URL_BWD TERDEFINISI
          Jika belum didefinisikan di script utama, definisikan di sini
          sebagai pengaman. Sesuaikan URL jika diperlukan.
       ================================================================ */
    if (typeof window.URL_BWD === 'undefined') {
        console.error('[BWD PATCH] URL_BWD tidak ditemukan! Tambahkan definisi URL_BWD di script utama HTML Anda.');
        window.URL_BWD = '';
    }

    /* ================================================================
       4. PASANG ULANG EVENT LISTENER TOMBOL CAPTURE
          Hapus listener lama lalu pasang ulang dengan logika bersih:
          Ambil foto → resize 640x640 → kirim base64 ke URL_BWD → render hasil
       ================================================================ */
    var btnCapture = document.getElementById('btnCapture');

    if (btnCapture) {
        // Kloning elemen untuk menghapus semua listener lama sekaligus
        var btnCaptureKloning = btnCapture.cloneNode(true);
        btnCapture.parentNode.replaceChild(btnCaptureKloning, btnCapture);

        btnCaptureKloning.addEventListener('click', async function () {
            var video      = document.getElementById('videoElement');
            var canvas     = document.getElementById('hiddenCanvas');
            var previewImg = document.getElementById('bwdPreviewImage');
            var focusBox   = document.getElementById('focusBox');
            var outputDiv  = document.getElementById('outputBWD');
            var btn        = btnCaptureKloning;

            // Pastikan video sedang berjalan
            if (!video || !video.videoWidth || !window.currentStream) {
                alert('Kamera belum siap. Mohon tunggu sebentar.');
                return;
            }

            if (!window.URL_BWD) {
                alert('URL_BWD belum dikonfigurasi. Periksa kode JavaScript Anda.');
                return;
            }

            // ── Ambil frame dari video ke canvas sementara ──
            var ctx = canvas.getContext('2d');
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            // ── Resize + Center-crop ke 640×640 ──
            var TARGET = 640;
            var exportCanvas = document.createElement('canvas');
            var exportCtx    = exportCanvas.getContext('2d');
            exportCanvas.width  = TARGET;
            exportCanvas.height = TARGET;

            var srcSize = Math.min(video.videoWidth, video.videoHeight);
            var srcX    = (video.videoWidth  - srcSize) / 2;
            var srcY    = (video.videoHeight - srcSize) / 2;

            exportCtx.filter = 'brightness(1.05) contrast(1.1)';
            exportCtx.drawImage(canvas, srcX, srcY, srcSize, srcSize, 0, 0, TARGET, TARGET);

            var base64Img = exportCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];

            // ── Tampilkan preview foto ──
            if (previewImg) {
                previewImg.src = canvas.toDataURL('image/jpeg');
                previewImg.style.display = 'block';
            }
            if (focusBox) focusBox.style.display = 'none';

            // ── Update UI ke status loading ──
            var originalText = btn.innerText;
            btn.innerHTML   = 'MENGANALISIS AI...';
            btn.disabled    = true;
            btn.style.opacity = '0.7';

            if (outputDiv) {
                outputDiv.innerHTML =
                    '<div style="text-align:center; color:var(--accent-bwd); margin-top:15px;">' +
                    '<div class="animasi-loading-kalender" style="color:var(--accent-bwd);">' +
                    'Mengirim ke AI... Menganalisis warna daun...</div></div>';
            }

            try {
                // ── Kirim ke AppScript (URL_BWD) ──
                var res  = await fetch(window.URL_BWD, {
                    method : 'POST',
                    body   : JSON.stringify({ image: base64Img })
                });
                var data = await res.json();

                // ── Hentikan kamera untuk hemat baterai ──
                if (typeof window.stopCamera === 'function') window.stopCamera();

                // ── Tampilkan hasil melalui fungsi tampilkanHasil ──
                if (typeof window.currentMode !== 'undefined') window.currentMode = 'bwd';
                if (typeof window.tampilkanHasil === 'function') {
                    window.tampilkanHasil(data);
                } else {
                    // Fallback jika tampilkanHasil tidak tersedia
                    if (outputDiv) {
                        outputDiv.innerHTML =
                            '<div class="info-box" style="border-left-color:var(--accent-green);">' +
                            '<strong>Hasil dari Server:</strong><br>' +
                            '<pre style="font-size:0.75rem; white-space:pre-wrap;">' +
                            JSON.stringify(data, null, 2) + '</pre></div>';
                    }
                }

            } catch (err) {
                console.error('[BWD PATCH] Fetch ke URL_BWD gagal:', err);

                if (outputDiv) {
                    outputDiv.innerHTML =
                        '<div class="info-box" style="border-left-color:var(--red-alert); color:#ef4444;">' +
                        '<strong>❌ Gagal terhubung ke server analisis.</strong><br>' +
                        '<small>Pastikan koneksi internet aktif dan URL AppScript benar.</small></div>';
                }

                // Kembalikan kamera ke kondisi aktif agar user bisa coba lagi
                if (previewImg) previewImg.style.display = 'none';
                if (focusBox)   focusBox.style.display   = 'block';

            } finally {
                btn.innerText     = originalText;
                btn.disabled      = false;
                btn.style.opacity = '1';
            }
        });

        console.log('[BWD PATCH] ✅ Listener btnCapture berhasil dipasang ulang (alur AppScript).');
    } else {
        console.warn('[BWD PATCH] Elemen #btnCapture tidak ditemukan. Patch listener dilewati.');
    }

    /* ================================================================
       5. LOG KONFIRMASI
       ================================================================ */
    console.log('[BWD PATCH] ✅ Patch BWD berhasil dimuat. Semua analisis daun menggunakan URL_BWD (AppScript).');

})();
