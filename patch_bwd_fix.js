/**
 * patch_bwd_fix.js  v3 — Fix total BWD: kamera + AppScript + render hasil
 * =========================================================================
 * Perbaikan:
 *  1. Hapus cek video.videoWidth (selalu 0) → ganti tunggu readyState
 *  2. Pastikan fetch ke URL_BWD dengan format { image: base64 }
 *  3. Parse respons { leafColors, detections, outputImage } dari AppScript
 *  4. Render hasil langsung (tidak bergantung tampilkanHasil yang mungkin
 *     salah karena currentMode race condition)
 *  5. Nonaktifkan kode RGB lama
 *
 * Pasang PALING BAWAH di HTML:
 *   <script src="patch_bwd_fix.js"></script>
 *
 * PPL Milenial Wajo — Smart Farming
 */

(function () {
    'use strict';

    /* ============================================================
       1. MATIKAN FUNGSI RGB LAMA
       ============================================================ */
    window.analisisWarnaDaun       = function () {};
    window.cariSkalaTerdekatViaRasio = function () { return 3; };
    window.showLeafAnalysisResult   = function () {};
    if (Array.isArray(window.BWD_STANDAR)) window.BWD_STANDAR = [];

    /* ============================================================
       2. KONSTANTA TAMPILAN (sesuai format kelas Roboflow)
          Kelas: "Nitrogen 0.50", "Nitrogen 1.20", dst
          mapNitrogenToColor() di AppScript sudah mengubahnya ke:
          "yellow" | "yellowish green" | "light green" | "green" | "dark green"
       ============================================================ */
    var WARNA_INDO = {
        'yellow':         'Kuning (Defisiensi Berat)',
        'yellowish green':'Hijau Kekuningan',
        'light green':    'Hijau Muda',
        'green':          'Hijau (Optimal)',
        'dark green':     'Hijau Tua (N Berlebih)'
    };

    var REKOMENDASI_BWD = {
        'yellow':         { skala: 1, badge: 'skala-1', saran: '🚨 Defisiensi N Berat. Segera beri Urea 150 kg/ha.' },
        'yellowish green':{ skala: 2, badge: 'skala-2', saran: '⚠️ N Rendah. Tambahkan Urea 100 kg/ha.' },
        'light green':    { skala: 3, badge: 'skala-3', saran: '✅ Cukup. Urea 50 kg/ha untuk pemeliharaan.' },
        'green':          { skala: 4, badge: 'skala-4', saran: '🌟 Optimal. Tidak perlu tambahan Urea.' },
        'dark green':     { skala: 5, badge: 'skala-5', saran: '⚡ N Berlebih. Hentikan Urea. Waspada Blast & Wereng.' }
    };

    /* ============================================================
       3. FUNGSI RENDER HASIL BWD
          Dipanggil setelah fetch AppScript berhasil.
          Format data dari AppScript:
          { leafColors: ["green","light green"], detections: [{class,confidence},...], outputImage: "..." }
       ============================================================ */
    function renderHasilBWD(data) {
        var outputDiv  = document.getElementById('outputBWD');
        var resLabel   = document.getElementById('resLabel');
        var resConf    = document.getElementById('resConf');

        var colors     = data.leafColors  || [];
        var detections = data.detections  || [];
        var imgOutput  = data.outputImage || null;

        /* Tangani kasus tidak ada daun terdeteksi */
        if (colors.length === 0) {
            if (outputDiv) outputDiv.innerHTML =
                '<div class="info-box" style="border-left-color:var(--red-alert);">' +
                '⚠️ Daun tidak terdeteksi. Arahkan kamera lebih dekat ke daun padi ' +
                'dan pastikan daun berada di dalam kotak fokus hijau.</div>';
            if (resLabel) resLabel.innerText = 'Daun Tidak Terdeteksi';
            if (resConf)  { resConf.innerText = 'Tingkat Keyakinan: 0%'; resConf.style.display = 'block'; }
            return;
        }

        /* Hitung mayoritas warna (voting) */
        var voteCount = {};
        colors.forEach(function (c) {
            var key = (c || '').toLowerCase().trim();
            voteCount[key] = (voteCount[key] || 0) + 1;
        });

        var winnerKey = 'green', maxVotes = 0;
        Object.keys(voteCount).forEach(function (k) {
            if (voteCount[k] > maxVotes) { maxVotes = voteCount[k]; winnerKey = k; }
        });

        /* Hitung confidence gabungan */
        var probGagal = 1;
        detections.forEach(function (d) {
            var conf = d.confidence || 0.85;
            if (conf > 1) conf = conf / 100;
            probGagal *= (1 - conf);
        });
        var confGabungan = Math.min(((1 - probGagal) * 100), 99.9).toFixed(1);

        /* Buat HTML kartu setiap deteksi */
        var kartuHTML = '';
        colors.forEach(function (c, i) {
            var key  = (c || '').toLowerCase().trim();
            var info = REKOMENDASI_BWD[key] || { skala: 3, badge: 'skala-3', saran: '-' };
            var conf = detections[i] ? ((detections[i].confidence || 0.85) * 100).toFixed(1) : '-';
            var namaKelas = detections[i] ? (detections[i]['class'] || key) : key;

            kartuHTML +=
                '<div class="leaf-card" style="margin-bottom:12px;">' +
                  '<div class="badge ' + info.badge + '">BWD SKALA ' + info.skala + '</div>' +
                  '<div style="margin-top:8px; font-size:0.85rem;">' +
                    '<span>Warna: <b>' + (WARNA_INDO[key] || key) + '</b></span>' +
                    '<br><span style="opacity:0.6; font-size:0.75rem;">Kelas AI: ' + namaKelas + ' — Akurasi: ' + conf + '%</span>' +
                  '</div>' +
                '</div>';
        });

        /* Rekomendasi utama (winner) */
        var winInfo   = REKOMENDASI_BWD[winnerKey] || REKOMENDASI_BWD['green'];
        var rekHTML   =
            '<div class="recommendation-box" style="margin-top:12px;">' +
              '<h4 style="color:var(--accent-green); margin:0 0 6px 0; font-size:0.95rem;">📋 Rekomendasi Utama:</h4>' +
              '<div style="font-size:0.8rem; color:#fbbf24; margin-bottom:8px; font-weight:600;">' +
                '📊 Mayoritas: ' + (WARNA_INDO[winnerKey] || winnerKey) + ' (' + maxVotes + ' dari ' + colors.length + ' deteksi)' +
              '</div>' +
              '<div style="font-size:0.85rem;">' + winInfo.saran + '</div>' +
            '</div>';

        /* Gambar output Roboflow (jika ada) */
        var imgHTML = '';
        if (imgOutput) {
            imgHTML =
                '<div style="margin-top:14px; border-radius:12px; overflow:hidden;">' +
                  '<img src="data:image/jpeg;base64,' + imgOutput + '" ' +
                       'style="width:100%; border-radius:12px;" ' +
                       'alt="Hasil Anotasi AI">' +
                  '<div style="font-size:0.7rem; color:#64748b; text-align:center; margin-top:4px;">Anotasi dari Roboflow AI</div>' +
                '</div>';
        }

        /* Tombol uji ulang */
        var btnUlangHTML =
            '<button class="btn-main" onclick="ujiUlangBWD()" ' +
                    'style="margin-top:14px; background:#0e7490; color:#fff;">🔄 UJI ULANG / DAUN LAIN</button>';

        /* Render ke DOM */
        if (outputDiv) outputDiv.innerHTML = kartuHTML + rekHTML + imgHTML + btnUlangHTML;
        if (resLabel)  resLabel.innerText  = 'Hasil Analisis Warna Daun';
        if (resConf) {
            resConf.innerText      = 'Tingkat Keyakinan: ' + confGabungan + '%';
            resConf.style.display  = 'block';
        }

        /* Pastikan boxBWD & result terlihat */
        var boxBWD = document.getElementById('boxBWD');
        var result = document.getElementById('result');
        if (boxBWD) boxBWD.style.display = 'block';
        if (result) result.style.display  = 'block';
    }

    /* ============================================================
       4. PERBAIKI startBWDCamera
          Simpan stream ke window.currentStream dengan benar,
          tunggu video siap sebelum resolve.
       ============================================================ */
    window.startBWDCamera = async function () {
        var video = document.getElementById('videoElement');
        if (!video) return;

        /* Hentikan stream lama */
        if (window.currentStream) {
            try { window.currentStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            window.currentStream = null;
        }

        var stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        window.currentStream = stream;
        video.srcObject      = stream;

        /* Tunggu hingga video benar-benar punya data */
        await new Promise(function (resolve) {
            if (video.readyState >= 2) { video.play().catch(function(){}); resolve(); return; }
            video.addEventListener('loadeddata', function onData() {
                video.removeEventListener('loadeddata', onData);
                video.play().catch(function(){}).finally(resolve);
            });
            video.addEventListener('loadedmetadata', function onMeta() {
                video.removeEventListener('loadedmetadata', onMeta);
                if (video.readyState >= 2) { video.play().catch(function(){}).finally(resolve); }
            });
            /* Safety timeout 8 detik */
            setTimeout(resolve, 8000);
        });

        console.log('[BWD] Kamera siap:', video.videoWidth, 'x', video.videoHeight,
                    '| readyState:', video.readyState);
    };

    /* ============================================================
       5. PASANG ULANG LISTENER btnCapture (hapus semua listener lama)
       ============================================================ */
    function pasangCapture() {
        var btnLama = document.getElementById('btnCapture');
        if (!btnLama) {
            setTimeout(pasangCapture, 400);
            return;
        }

        /* Clone → buang semua addEventListener lama */
        var btn = btnLama.cloneNode(true);
        btnLama.parentNode.replaceChild(btn, btnLama);

        btn.addEventListener('click', async function () {
            var video      = document.getElementById('videoElement');
            var canvas     = document.getElementById('hiddenCanvas');
            var previewImg = document.getElementById('bwdPreviewImage');
            var focusBox   = document.getElementById('focusBox');
            var outputDiv  = document.getElementById('outputBWD');

            /* ── Tunggu kamera siap (max 6 detik, tanpa langsung alert) ── */
            var siap = false;
            var batasWaktu = Date.now() + 6000;
            while (!siap && Date.now() < batasWaktu) {
                if (video && video.readyState >= 2 && window.currentStream) {
                    siap = true;
                } else if (video && window.currentStream) {
                    /* Stream ada tapi readyState belum — coba play ulang */
                    try { await video.play(); } catch(e) {}
                    siap = (video.readyState >= 2);
                }
                if (!siap) await new Promise(function(r){ setTimeout(r, 300); });
            }

            if (!siap) {
                if (outputDiv) outputDiv.innerHTML =
                    '<div class="info-box" style="border-left-color:var(--red-alert);">' +
                    '<strong>❌ Kamera tidak merespons.</strong><br>' +
                    '<small>Klik tombol <b>AKTIFKAN KAMERA</b> sekali lagi, atau periksa izin kamera di pengaturan browser.</small>' +
                    '</div>';
                return;
            }

            /* ── Ambil frame dari video ── */
            var vw  = video.videoWidth  || 640;
            var vh  = video.videoHeight || 480;
            canvas.width  = vw;
            canvas.height = vh;
            canvas.getContext('2d').drawImage(video, 0, 0, vw, vh);

            /* ── Center-crop + resize ke 640×640 ── */
            var T   = 640;
            var ec  = document.createElement('canvas');
            ec.width = ec.height = T;
            var ectx = ec.getContext('2d');
            var ss   = Math.min(vw, vh);
            var sx   = (vw - ss) / 2, sy = (vh - ss) / 2;
            ectx.filter = 'brightness(1.05) contrast(1.1)';
            ectx.drawImage(canvas, sx, sy, ss, ss, 0, 0, T, T);

            var base64 = ec.toDataURL('image/jpeg', 0.82).split(',')[1];

            /* ── Preview foto ── */
            if (previewImg) { previewImg.src = canvas.toDataURL('image/jpeg'); previewImg.style.display = 'block'; }
            if (focusBox)   focusBox.style.display = 'none';

            /* ── Loading UI ── */
            var teksAsli = btn.innerText;
            btn.innerHTML = 'MENGANALISIS AI...';
            btn.disabled  = true;
            btn.style.opacity = '0.7';
            if (outputDiv) outputDiv.innerHTML =
                '<div style="text-align:center; color:var(--accent-bwd); margin-top:15px;">' +
                '<div class="animasi-loading-kalender" style="color:var(--accent-bwd);">' +
                'Mengirim gambar ke Roboflow AI...</div>' +
                '<div style="font-size:0.75rem; color:#64748b; margin-top:6px;">Mohon tunggu beberapa detik...</div>' +
                '</div>';

            try {
                /* ── Fetch ke AppScript → Roboflow ── */
                var urlBWD = window.URL_BWD;
                if (!urlBWD) throw new Error('URL_BWD belum didefinisikan di script utama.');

                var res  = await fetch(urlBWD, {
                    method : 'POST',
                    body   : JSON.stringify({ image: base64 })
                });
                if (!res.ok) throw new Error('Server HTTP ' + res.status);

                var data = await res.json();

                /* Cek error dari AppScript */
                if (data.error) throw new Error('AppScript: ' + data.error);

                /* ── Hentikan kamera ── */
                if (typeof window.stopCamera === 'function') window.stopCamera();

                /* ── Render hasil langsung (lebih aman dari tampilkanHasil) ── */
                renderHasilBWD(data);

            } catch (err) {
                console.error('[BWD] Fetch gagal:', err);
                if (outputDiv) outputDiv.innerHTML =
                    '<div class="info-box" style="border-left-color:var(--red-alert);">' +
                    '<strong>❌ Gagal menganalisis gambar.</strong><br>' +
                    '<small>' + (err.message || 'Periksa koneksi internet.') + '</small>' +
                    '</div>';
                if (previewImg) previewImg.style.display = 'none';
                if (focusBox)   focusBox.style.display   = 'block';
            } finally {
                btn.innerText     = teksAsli;
                btn.disabled      = false;
                btn.style.opacity = '1';
            }
        });

        console.log('[BWD] ✅ Listener btnCapture terpasang — alur: video → AppScript → Roboflow → render');
    }

    /* ── Jalankan setelah DOM & patch lain siap ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasangCapture, 150); });
    } else {
        setTimeout(pasangCapture, 150);
    }

    console.log('[BWD] patch_bwd_fix.js v3 dimuat ✅');

})();
