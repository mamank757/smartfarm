/**
 * patch_bwd_fix.js  (REVISI — Perbaikan "Kamera Belum Siap")
 * ============================================================
 * Masalah yang diperbaiki:
 *  1. Cek video.videoWidth selalu = 0 saat tombol diklik karena
 *     browser belum render frame pertama → diganti cek video.readyState
 *  2. Sisa kode analisis RGB lokal (BWD_STANDAR, analisisWarnaDaun,
 *     cariSkalaTerdekatViaRasio, showLeafAnalysisResult) dinonaktifkan
 *  3. Listener asli dari HTML dihapus via clone, lalu diganti listener
 *     bersih yang langsung fetch ke URL_BWD (AppScript)
 *
 * Pasang PALING BAWAH, setelah semua patch lain:
 *   <script src="patch_bwd_fix.js"></script>
 *
 * PPL Milenial Wajo — Smart Farming
 */

(function () {
    'use strict';

    /* ============================================================
       1. NONAKTIFKAN FUNGSI LAMA BERBASIS RGB
       ============================================================ */

    window.analisisWarnaDaun = function () {
        console.warn('[BWD] analisisWarnaDaun() dinonaktifkan — sudah diganti AppScript.');
    };
    window.cariSkalaTerdekatViaRasio = function () {
        console.warn('[BWD] cariSkalaTerdekatViaRasio() dinonaktifkan.');
        return 3;
    };
    window.showLeafAnalysisResult = function () {
        console.warn('[BWD] showLeafAnalysisResult() dinonaktifkan.');
    };
    if (Array.isArray(window.BWD_STANDAR)) {
        window.BWD_STANDAR = [];
    }

    /* ============================================================
       2. FUNGSI BANTU: cek apakah kamera sudah benar-benar siap
          readyState >= 2 (HAVE_CURRENT_DATA) artinya sudah ada data
          frame yang bisa dibaca, meski videoWidth mungkin masih 0
          di beberapa browser.  Fallback: cek tracks aktif.
       ============================================================ */
    function kameraSiap(video) {
        if (!video) return false;

        // Cek readyState: 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
        if (video.readyState >= 2) return true;

        // Fallback: cek lewat currentStream tracks
        var stream = window.currentStream;
        if (stream) {
            var tracks = stream.getVideoTracks();
            if (tracks.length > 0 && tracks[0].readyState === 'live') return true;
        }

        return false;
    }

    /* ============================================================
       3. PASANG ULANG EVENT LISTENER btnCapture
          Clone elemen untuk bersihkan semua listener lama sekaligus,
          lalu pasang listener baru yang:
            - Tidak pakai video.videoWidth untuk validasi
            - Langsung kirim base64 ke URL_BWD via fetch POST
            - Tampilkan hasil via tampilkanHasil(data)
       ============================================================ */

    function pasangListenerCapture() {
        var btnLama = document.getElementById('btnCapture');
        if (!btnLama) {
            console.warn('[BWD] #btnCapture tidak ditemukan, coba lagi 500ms...');
            setTimeout(pasangListenerCapture, 500);
            return;
        }

        // Clone → buang semua listener lama
        var btn = btnLama.cloneNode(true);
        btnLama.parentNode.replaceChild(btn, btnLama);

        btn.addEventListener('click', async function handleCapture() {
            var video      = document.getElementById('videoElement');
            var canvas     = document.getElementById('hiddenCanvas');
            var previewImg = document.getElementById('bwdPreviewImage');
            var focusBox   = document.getElementById('focusBox');
            var outputDiv  = document.getElementById('outputBWD');

            /* ── Validasi kamera siap ── */
            if (!kameraSiap(video)) {
                // Beri waktu ekstra lalu coba lagi otomatis (tidak alert dulu)
                outputDiv.innerHTML =
                    '<div style="text-align:center; padding:20px; color:var(--accent-bwd);">' +
                    '⏳ Kamera sedang inisialisasi, mencoba lagi...</div>';

                // Tunggu hingga video benar-benar ready (max 5 detik)
                var berhasil = await tungguKameraReady(video, 5000);
                if (!berhasil) {
                    outputDiv.innerHTML =
                        '<div class="info-box" style="border-left-color:var(--red-alert);">' +
                        '<strong>❌ Kamera tidak merespons.</strong><br>' +
                        '<small>Coba klik tombol AKTIFKAN KAMERA sekali lagi, atau pastikan izin kamera sudah diberikan.</small>' +
                        '</div>';
                    return;
                }
            }

            if (!window.URL_BWD) {
                alert('URL_BWD belum dikonfigurasi. Periksa kode JavaScript Anda.');
                return;
            }

            /* ── Ambil frame dari video ke canvas ── */
            var ctx = canvas.getContext('2d');

            // Gunakan ukuran aktual video; fallback ke 640 jika 0
            var vw = video.videoWidth  || 640;
            var vh = video.videoHeight || 480;
            canvas.width  = vw;
            canvas.height = vh;
            ctx.drawImage(video, 0, 0, vw, vh);

            /* ── Center-crop + resize ke 640×640 ── */
            var TARGET      = 640;
            var exportCanvas = document.createElement('canvas');
            var exportCtx    = exportCanvas.getContext('2d');
            exportCanvas.width  = TARGET;
            exportCanvas.height = TARGET;

            var srcSize = Math.min(vw, vh);
            var srcX    = (vw - srcSize) / 2;
            var srcY    = (vh - srcSize) / 2;

            exportCtx.filter = 'brightness(1.05) contrast(1.1)';
            exportCtx.drawImage(canvas, srcX, srcY, srcSize, srcSize, 0, 0, TARGET, TARGET);

            var base64Img = exportCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];

            /* ── Tampilkan preview ── */
            if (previewImg) {
                previewImg.src = canvas.toDataURL('image/jpeg');
                previewImg.style.display = 'block';
            }
            if (focusBox) focusBox.style.display = 'none';

            /* ── UI loading ── */
            var originalText   = btn.innerText;
            btn.innerHTML      = 'MENGANALISIS AI...';
            btn.disabled       = true;
            btn.style.opacity  = '0.7';

            if (outputDiv) {
                outputDiv.innerHTML =
                    '<div style="text-align:center; color:var(--accent-bwd); margin-top:15px;">' +
                    '<div class="animasi-loading-kalender" style="color:var(--accent-bwd);">' +
                    'Mengirim gambar ke server AI...</div>' +
                    '<div style="font-size:0.75rem; color:#64748b; margin-top:6px;">Mohon tunggu...</div>' +
                    '</div>';
            }

            try {
                /* ── Fetch ke AppScript URL_BWD ── */
                var res  = await fetch(window.URL_BWD, {
                    method : 'POST',
                    body   : JSON.stringify({ image: base64Img })
                });

                if (!res.ok) throw new Error('Server merespons HTTP ' + res.status);

                var data = await res.json();

                /* ── Hentikan kamera untuk hemat baterai ── */
                if (typeof window.stopCamera === 'function') window.stopCamera();

                /* ── Tampilkan hasil ── */
                if (typeof window.currentMode !== 'undefined') window.currentMode = 'bwd';
                if (typeof window.tampilkanHasil === 'function') {
                    window.tampilkanHasil(data);
                } else {
                    if (outputDiv) {
                        outputDiv.innerHTML =
                            '<div class="info-box" style="border-left-color:var(--accent-green);">' +
                            '<strong>Respons Server:</strong><br>' +
                            '<pre style="font-size:0.75rem; white-space:pre-wrap;">' +
                            JSON.stringify(data, null, 2) + '</pre></div>';
                    }
                }

            } catch (err) {
                console.error('[BWD] Fetch gagal:', err);

                if (outputDiv) {
                    outputDiv.innerHTML =
                        '<div class="info-box" style="border-left-color:var(--red-alert);">' +
                        '<strong>❌ Gagal terhubung ke server analisis.</strong><br>' +
                        '<small>' + (err.message || 'Periksa koneksi internet Anda.') + '</small>' +
                        '</div>';
                }

                // Kembalikan tampilan kamera agar user bisa coba lagi
                if (previewImg) previewImg.style.display = 'none';
                if (focusBox)   focusBox.style.display   = 'block';

            } finally {
                btn.innerText     = originalText;
                btn.disabled      = false;
                btn.style.opacity = '1';
            }
        });

        console.log('[BWD] ✅ Listener btnCapture terpasang — alur: kamera → AppScript → tampilkanHasil()');
    }

    /* ============================================================
       4. FUNGSI BANTU: tunggu hingga video siap (polling)
          Mengembalikan Promise<boolean>:
            true  → video siap dalam batas waktu
            false → timeout habis
       ============================================================ */
    function tungguKameraReady(video, maxMs) {
        return new Promise(function (resolve) {
            var mulai    = Date.now();
            var interval = setInterval(function () {
                if (kameraSiap(video)) {
                    clearInterval(interval);
                    resolve(true);
                } else if (Date.now() - mulai >= maxMs) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 200);
        });
    }

    /* ============================================================
       5. PERBAIKI startBWDCamera: simpan stream ke window.currentStream
          dan pastikan video.play() dipanggil dengan benar
       ============================================================ */
    window.startBWDCamera = async function () {
        var video = document.getElementById('videoElement');
        if (!video) return;

        // Hentikan stream lama jika masih ada
        if (window.currentStream) {
            window.currentStream.getTracks().forEach(function (t) { t.stop(); });
            window.currentStream = null;
        }

        try {
            var stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },  // Kamera belakang
                    width:  { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            window.currentStream = stream;
            video.srcObject      = stream;

            // Pastikan play() dipanggil setelah metadata siap
            await new Promise(function (resolve) {
                video.onloadedmetadata = function () {
                    video.play().then(resolve).catch(resolve);
                };
                // Kalau metadata sudah siap, langsung resolve
                if (video.readyState >= 1) {
                    video.play().then(resolve).catch(resolve);
                }
            });

            console.log('[BWD] ✅ Kamera aktif —', video.videoWidth, '×', video.videoHeight);

        } catch (err) {
            console.error('[BWD] Gagal akses kamera:', err);
            var msg = err.name === 'NotAllowedError'
                ? 'Izin kamera ditolak. Buka Pengaturan browser dan izinkan akses kamera.'
                : 'Gagal mengakses kamera: ' + err.message;
            alert(msg);
            throw err;
        }
    };

    /* ============================================================
       6. JALANKAN
       ============================================================ */

    // Pasang listener setelah DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', pasangListenerCapture);
    } else {
        // DOM sudah siap, tapi tunggu sedikit agar patch lain selesai
        setTimeout(pasangListenerCapture, 100);
    }

    console.log('[BWD] patch_bwd_fix.js dimuat ✅');

})();
