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
 * Reset otomatis: setiap tengah malam (00:00) secara lokal
 *
 * Cara pakai: tambahkan di bagian paling bawah <body>, SETELAH semua patch lain:
 *   <script src="patch_kuota_harian.js"></script>
 *
 * CHANGELOG v1.2:
 * [NEW] Tambah menu 'pestisida' (Harga Pestisida, kuota 5x/hari)
 * [NEW] Tambah menu 'gabah'     (Harga Gabah,      kuota 5x/hari)
 *       Kedua menu baru menggunakan btnAnalisisPestisida / btnAnalisisGabah
 *       (sesuaikan ID tombol dengan yang ada di index.html Anda).
 *       Jika tombol Anda memakai ID berbeda, ubah di bagian KONFIGURASI TOMBOL
 *       di bawah.
 *
 * CHANGELOG v1.1 (bugfix):
 * [FIX 1] window.currentMode selalu undefined karena di index.html variabel
 *         dideklarasikan dengan `let` di root <script> — let/const TIDAK
 *         otomatis menjadi properti window. Solusi: baca currentMode langsung
 *         dari closure/scope aslinya via intercept switchMode → window._kuotaMode.
 * [FIX 2] window.mulaiAnalisis = undefined saat patch dimuat karena fungsi
 *         dideklarasikan sebagai `async function` di closure. Solusi: intercept
 *         via capture-phase event delegation di document level.
 * [FIX 3] btnCapture di-clone sebelum addEventListener asli terpasang.
 *         Solusi: event delegation capture-phase, tidak ada clone.
 * =============================================================================
 */

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
        pestisida : 5,   // ← BARU: Harga Pestisida
        gabah     : 5    // ← BARU: Harga Gabah
    };

    // ── KONFIGURASI LABEL ────────────────────────────────────────────────────
    var LABEL_MENU = {
        daun      : 'Penyakit',
        hama      : 'Hama',
        gulma     : 'Gulma',
        tanah     : 'Tanah',
        malai     : 'Panen',
        bwd       : 'BWD',
        pestisida : 'Harga Pestisida',  // ← BARU
        gabah     : 'Harga Gabah'       // ← BARU
    };

    // ── KONFIGURASI TOMBOL ───────────────────────────────────────────────────
    // ID tombol "Analisis" untuk masing-masing menu baru.
    // Sesuaikan dengan ID yang dipakai di index.html Anda!
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

    // ── FUNGSI DATA KUOTA ─────────────────────────────────────────────────────

    function ambilDataKuota() {
        var hariIni = new Date().toISOString().slice(0, 10);
        try {
            var raw = localStorage.getItem(KEY_STORAGE);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.tanggal === hariIni) {
                    // Pastikan key baru ada (upgrade data lama)
                    MODE_AI.forEach(function (m) {
                        if (typeof data.terpakai[m] === 'undefined') {
                            data.terpakai[m] = 0;
                        }
                    });
                    return data;
                }
            }
        } catch (e) {}
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

    function kembalikanSatuKuota(mode) {
        var data = ambilDataKuota();
        data.terpakai[mode] = Math.max(0, (data.terpakai[mode] || 0) - 1);
        simpanDataKuota(data);
    }

    // ── MODAL PERINGATAN ──────────────────────────────────────────────────────

    function tampilkanModalKuotaHabis(mode) {
        var label = LABEL_MENU[mode] || mode;
        var batas = KUOTA_PER_MENU[mode] || 10;
        var pesanTeks =
            'Kuota menu ' + label.toUpperCase() + ' hari ini sudah habis.\n\n' +
            '📊 Batas harian menu ini: ' + batas + 'x\n' +
            '✅ Sudah terpakai: ' + batas + 'x\n' +
            '🔄 Reset otomatis: Tengah malam (00:00)\n\n' +
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
        if (!mode || !MODE_AI.includes(mode)) return;

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

    // ── FIX 1: Intercept switchMode ───────────────────────────────────────────
    var _switchModeAsli = window.switchMode;
    window.switchMode = function (mode) {
        window._kuotaMode = mode;
        _switchModeAsli.apply(this, arguments);
        renderIndikatorKuota(mode);
    };

    // ── FIX 2: Intercept btnAnalisis (daun, hama, gulma, tanah, malai) ─────────

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btnAnalisis');
        if (!btn) return;

        var mode = getModeAktif();
        if (!mode || !MODE_AI.includes(mode) || mode === 'bwd') return;

        // Menu harga menggunakan tombol terpisah, bukan btnAnalisis — skip
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

    // ── FIX 3: Intercept btnCapture (BWD) ─────────────────────────────────────

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

    // ── BARU: Intercept tombol Harga Pestisida ────────────────────────────────

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
        // Biarkan handler asli harga pestisida jalan

    }, true);

    // ── BARU: Intercept tombol Harga Gabah ────────────────────────────────────

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
        // Biarkan handler asli harga gabah jalan

    }, true);

    // ── BARU: Intercept via switchMode untuk menu harga (jika pakai switchMode) ─
    // Jika menu Pestisida/Gabah di-switch via switchMode('pestisida') /
    // switchMode('gabah'), indikator otomatis tampil lewat wrap switchMode di atas.
    // Tidak perlu kode tambahan.

    // ── Tampilkan indikator saat load ─────────────────────────────────────────
    window.addEventListener('load', function () {
        renderIndikatorKuota(getModeAktif());
    });

    console.log(
        '%c✅ patch_kuota_harian.js v1.2 (+ pestisida & gabah) dimuat',
        'color: #f59e0b; font-weight: bold;'
    );

})();
