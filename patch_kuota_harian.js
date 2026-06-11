/**
 * =============================================================================
 * PATCH KUOTA HARIAN PER MENU — SMART FARMING PPL MILENIAL WAJO
 * =============================================================================
 * Fungsi: membatasi penggunaan AI deteksi foto maksimal N x PER MENU per hari
 * per perangkat (berbasis localStorage).
 *
 * Kuota per menu:
 *   Penyakit 5x | Hama 5x | Gulma 5x | Tanah 5x | Panen 10x | BWD 5x
 *   Harga Pestisida 5x | Harga Gabah 5x
 * — masing-masing dihitung TERPISAH.
 *
 * Reset otomatis: setiap tengah malam (00:00) waktu LOKAL perangkat
 *
 * Cara pakai: tambahkan di bagian paling bawah <body>, SETELAH semua script lain:
 *   <script src="patch_kuota_harian.js"></script>
 *
 * CHANGELOG v1.3 (bugfix & improvement):
 * [FIX 1] switchMode bisa undefined saat patch dimuat → tambah pengecekan
 *         typeof sebelum dipanggil agar tidak crash.
 * [FIX 2] kembalikanSatuKuota tidak pernah dipanggil → sekarang dipanggil
 *         otomatis jika analisis gagal (error / tidak ada respons).
 * [FIX 3] ambilDataKuota pakai UTC (toISOString) → diganti ke tanggal LOKAL
 *         agar reset tepat tengah malam waktu WITA (UTC+8), bukan jam 08:00.
 * [FIX 4] Guard duplikasi: jika patch sudah dimuat sebelumnya, henti langsung.
 * =============================================================================
 */

// ── FIX 4: Guard agar patch tidak jalan dua kali ─────────────────────────────
if (window.__kuotaPatchDimuat) {
    console.warn('⚠️ patch_kuota_harian.js sudah dimuat sebelumnya. Dibatalkan.');
} else {
    window.__kuotaPatchDimuat = true;

(function () {
    'use strict';

    // ── KONFIGURASI KUOTA ────────────────────────────────────────────────────
    var KUOTA_PER_MENU = {
        daun      : 5,
        hama      : 5,
        gulma     : 5,
        tanah     : 5,
        malai     : 10,
        bwd       : 5,
        pestisida : 5,
        gabah     : 5
    };

    // ── KONFIGURASI LABEL ────────────────────────────────────────────────────
    var LABEL_MENU = {
        daun      : 'Penyakit',
        hama      : 'Hama',
        gulma     : 'Gulma',
        tanah     : 'Tanah',
        malai     : 'Panen',
        bwd       : 'BWD',
        pestisida : 'Harga Pestisida',
        gabah     : 'Harga Gabah'
    };

    // ── KONFIGURASI TOMBOL ───────────────────────────────────────────────────
    var TOMBOL_MENU = {
        pestisida : '#btnCariPestisida',  // ← sesuaikan jika perlu
        gabah     : '#btnCariGabah'       // ← sesuaikan jika perlu
    };

    // ── INTERNAL ─────────────────────────────────────────────────────────────
    var KEY_STORAGE = 'sf_kuota_v2';
    var MODE_AI     = Object.keys(KUOTA_PER_MENU);

    // ── BRIDGE: Baca mode aktif ───────────────────────────────────────────────
    function getModeAktif() {
        if (typeof window._kuotaMode === 'string') return window._kuotaMode;
        if (typeof window.currentMode === 'string') return window.currentMode;
        return null;
    }

    // ── FIX 3: Tanggal lokal, bukan UTC ──────────────────────────────────────
    function getTanggalLokal() {
        var d = new Date();
        var thn = d.getFullYear();
        var bln = String(d.getMonth() + 1).padStart(2, '0');
        var tgl = String(d.getDate()).padStart(2, '0');
        return thn + '-' + bln + '-' + tgl;
    }

    // ── FUNGSI DATA KUOTA ─────────────────────────────────────────────────────

    function ambilDataKuota() {
        var hariIni = getTanggalLokal(); // ← FIX 3: pakai waktu lokal
        try {
            var raw = localStorage.getItem(KEY_STORAGE);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.tanggal === hariIni) {
                    // Upgrade data lama: pastikan semua key menu ada
                    MODE_AI.forEach(function (m) {
                        if (typeof data.terpakai[m] === 'undefined') {
                            data.terpakai[m] = 0;
                        }
                    });
                    return data;
                }
            }
        } catch (e) {}
        // Buat data baru (hari baru atau storage kosong)
        var terpakai = {};
        MODE_AI.forEach(function (m) { terpakai[m] = 0; });
        var dataBaru = { tanggal: hariIni, terpakai: terpakai };
        simpanDataKuota(dataBaru);
        return dataBaru;
    }

    function simpanDataKuota(data) {
        try { localStorage.setItem(KEY_STORAGE, JSON.stringify(data)); } catch (e) {}
    }

    function sisaKuotaMenu(mode) {
        var data  = ambilDataKuota();
        var batas = KUOTA_PER_MENU[mode] || 10;
        return Math.max(0, batas - (data.terpakai[mode] || 0));
    }

    function pakaiSatuKuota(mode) {
        var data  = ambilDataKuota();
        var batas = KUOTA_PER_MENU[mode] || 10;
        if ((data.terpakai[mode] || 0) >= batas) return false;
        data.terpakai[mode] = (data.terpakai[mode] || 0) + 1;
        simpanDataKuota(data);
        return true;
    }

    // ── FIX 2: kembalikanSatuKuota sekarang benar-benar dipakai ──────────────
    function kembalikanSatuKuota(mode) {
        var data = ambilDataKuota();
        data.terpakai[mode] = Math.max(0, (data.terpakai[mode] || 0) - 1);
        simpanDataKuota(data);
        renderIndikatorKuota(mode);
        console.warn('[Kuota] 1 kuota dikembalikan untuk mode: ' + mode);
    }

    // Fungsi helper: bungkus Promise analisis agar kuota dikembalikan jika error
    function analisisDenganRefund(mode, promiseFn) {
        return promiseFn().catch(function (err) {
            kembalikanSatuKuota(mode);
            throw err; // tetap lempar error ke handler asli
        });
    }
    // Ekspor ke window agar bisa dipakai dari index.html jika diperlukan
    window.analisisDenganRefund = analisisDenganRefund;

    // ── MODAL PERINGATAN ──────────────────────────────────────────────────────

    function tampilkanModalKuotaHabis(mode) {
        var label = LABEL_MENU[mode] || mode;
        var batas = KUOTA_PER_MENU[mode] || 10;
        var pesanTeks =
            'Kuota menu ' + label.toUpperCase() + ' hari ini sudah habis.\n\n' +
            '📊 Batas harian menu ini: ' + batas + 'x\n' +
            '✅ Sudah terpakai: ' + batas + 'x\n' +
            '🔄 Reset otomatis: Tengah malam (00:00) waktu lokal\n\n' +
            'Menu AI lain masih bisa digunakan.\n' +
            'Silakan coba ' + label + ' lagi besok.';
        var modalEl = document.getElementById('customAlertModal');
        var ikonEl  = document.getElementById('customAlertIcon');
        var pesanEl = document.getElementById('customAlertMessage');
        if (modalEl && pesanEl) {
            if (ikonEl) ikonEl.innerText = '🚫';
            pesanEl.innerText = pesanTeks;
            modalEl.style.display = 'flex';
        } else {
            alert(pesanTeks);
        }
    }

    // ── INDIKATOR KUOTA DI UI ─────────────────────────────────────────────────

    function renderIndikatorKuota(mode) {
        var elLama = document.getElementById('sf-kuota-bar');
        if (elLama) elLama.remove();
        if (!mode || MODE_AI.indexOf(mode) === -1) return;

        var sisa   = sisaKuotaMenu(mode);
        var batas  = KUOTA_PER_MENU[mode] || 10;
        var label  = LABEL_MENU[mode] || mode;
        var persen = (sisa / batas) * 100;

        var warna;
        if      (sisa > 4) warna = '#10b981';
        else if (sisa > 2) warna = '#f59e0b';
        else if (sisa > 0) warna = '#ef4444';
        else               warna = '#7f1d1d';

        var teksStatus;
        if      (sisa === 0) teksStatus = label + ': Habis';
        else if (sisa <= 3)  teksStatus = label + ': Sisa ' + sisa + ' (Hampir habis!)';
        else                 teksStatus = label + ': Sisa ' + sisa + ' dari ' + batas;

        var bar = document.createElement('div');
        bar.id  = 'sf-kuota-bar';
        bar.style.cssText =
            'position:fixed;bottom:48px;left:0;right:0;z-index:500;' +
            'padding:6px 12px;background:rgba(11,21,40,0.92);' +
            'backdrop-filter:blur(6px);' +
            'border-top:1px solid rgba(255,255,255,0.06);' +
            'font-family:inherit;';

        bar.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;max-width:480px;margin:0 auto;gap:8px;">' +
                '<span style="font-size:11px;color:#94a3b8;white-space:nowrap;font-weight:600;">📷 KUOTA ANDA HARI INI:</span>' +
                '<div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + persen + '%;background:' + warna + ';border-radius:3px;transition:width 0.4s ease;"></div>' +
                '</div>' +
                '<span style="font-size:11px;color:' + warna + ';font-weight:700;text-align:right;">' + teksStatus + '</span>' +
            '</div>';
        document.body.appendChild(bar);
    }

    // ── FIX 1: Intercept switchMode dengan pengecekan typeof ─────────────────
    var _switchModeAsli = window.switchMode;
    window.switchMode = function (mode) {
        window._kuotaMode = mode;
        // FIX 1: Cek dulu apakah fungsi asli ada sebelum dipanggil
        if (typeof _switchModeAsli === 'function') {
            _switchModeAsli.apply(this, arguments);
        } else {
            console.warn('[Kuota] switchMode asli tidak ditemukan saat patch dimuat. Pastikan script ini diletakkan SETELAH script utama.');
        }
        renderIndikatorKuota(mode);
    };

    // ── Intercept btnAnalisis (daun, hama, gulma, tanah, malai) ──────────────

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btnAnalisis');
        if (!btn) return;

        var mode = getModeAktif();
        if (!mode || MODE_AI.indexOf(mode) === -1 || mode === 'bwd') return;
        if (mode === 'pestisida' || mode === 'gabah') return;

        if (sisaKuotaMenu(mode) <= 0) {
            e.stopImmediatePropagation();
            e.preventDefault();
            tampilkanModalKuotaHabis(mode);
            return;
        }

        pakaiSatuKuota(mode);
        renderIndikatorKuota(mode);

    }, true);

    // ── Intercept btnCapture (BWD) ────────────────────────────────────────────

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btnCapture');
        if (!btn) return;

        var mode = getModeAktif();
        if (mode !== 'bwd') return;

        if (sisaKuotaMenu('bwd') <= 0) {
            e.stopImmediatePropagation();
            e.preventDefault();
            tampilkanModalKuotaHabis('bwd');
            return;
        }

        pakaiSatuKuota('bwd');
        renderIndikatorKuota('bwd');

    }, true);

    // ── Intercept tombol Harga Pestisida ──────────────────────────────────────

    document.addEventListener('click', function (e) {
        var btn = e.target.closest(TOMBOL_MENU.pestisida);
        if (!btn) return;

        if (sisaKuotaMenu('pestisida') <= 0) {
            e.stopImmediatePropagation();
            e.preventDefault();
            tampilkanModalKuotaHabis('pestisida');
            return;
        }

        pakaiSatuKuota('pestisida');
        renderIndikatorKuota('pestisida');

    }, true);

    // ── Intercept tombol Harga Gabah ──────────────────────────────────────────

    document.addEventListener('click', function (e) {
        var btn = e.target.closest(TOMBOL_MENU.gabah);
        if (!btn) return;

        if (sisaKuotaMenu('gabah') <= 0) {
            e.stopImmediatePropagation();
            e.preventDefault();
            tampilkanModalKuotaHabis('gabah');
            return;
        }

        pakaiSatuKuota('gabah');
        renderIndikatorKuota('gabah');

    }, true);

    // ── Tampilkan indikator saat load ─────────────────────────────────────────
    window.addEventListener('load', function () {
        renderIndikatorKuota(getModeAktif());
    });

    console.log(
        '%c✅ patch_kuota_harian.js v1.3 (semua bugfix) dimuat',
        'color: #10b981; font-weight: bold;'
    );

})();

} // end guard __kuotaPatchDimuat
