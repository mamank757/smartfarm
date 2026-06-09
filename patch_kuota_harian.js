/**
 * =============================================================================
 * PATCH KUOTA HARIAN PER MENU — SMART FARMING PPL MILENIAL WAJO
 * =============================================================================
 * Fungsi: membatasi penggunaan AI deteksi foto maksimal N x PER MENU per hari
 * per perangkat (berbasis localStorage).
 *
 * Contoh: Penyakit 5x, Hama 5x, Gulma 5x, Tanah 5x, Panen 10x, BWD 5x
 * — masing-masing dihitung TERPISAH.
 *
 * Reset otomatis: setiap tengah malam (00:00) secara lokal
 *
 * Cara pakai: tambahkan di bagian paling bawah <body>, SETELAH semua patch lain:
 *   <script src="patch_kuota_harian.js"></script>
 *
 * CHANGELOG v1.1 (bugfix):
 * [FIX 1] window.currentMode selalu undefined karena di index.html variabel
 *         dideklarasikan dengan `let` di root <script> — let/const TIDAK
 *         otomatis menjadi properti window. Solusi: baca currentMode langsung
 *         dari closure/scope aslinya via bridge window.__getCurrentMode().
 * [FIX 2] window.mulaiAnalisis = undefined saat patch dimuat karena
 *         mulaiAnalisis() dideklarasikan sebagai `async function` di dalam
 *         <script> yang sama dengan currentMode — bukan window.mulaiAnalisis.
 *         Solusi: intercept via override btnAnalisis.onclick + event listener,
 *         bukan override window.mulaiAnalisis.
 * [FIX 3] btnCapture di-clone sebelum addEventListener asli terpasang
 *         (patch dimuat setelah HTML tapi belum tentu setelah semua
 *         addEventListener). Solusi: gunakan capture-phase event delegation
 *         di document level, bukan clone tombol.
 * =============================================================================
 */

(function () {
    'use strict';

    // ── KONFIGURASI ──────────────────────────────────────────────────────────
    var KUOTA_PER_MENU = {
        daun  : 5,
        hama  : 5,
        gulma : 5,
        tanah : 5,
        malai : 10,
        bwd   : 5
    };

    var KEY_STORAGE = 'sf_kuota_v2';
    var MODE_AI     = Object.keys(KUOTA_PER_MENU);

    var LABEL_MENU = {
        daun  : 'Penyakit',
        hama  : 'Hama',
        gulma : 'Gulma',
        tanah : 'Tanah',
        malai : 'Panen',
        bwd   : 'BWD'
    };

    // ── BRIDGE: Baca currentMode dari scope asli index.html ──────────────────
    //
    // Masalah: `let currentMode` di index.html TIDAK menjadi window.currentMode
    // karena let/const tidak masuk ke object window. Patch luar tidak bisa
    // membacanya lewat window.currentMode — selalu undefined.
    //
    // Solusi: minta index.html mengekspos getter via window.__getCurrentMode.
    // Karena kita tidak bisa edit index.html, kita inject script inline yang
    // dieksekusi di scope yang sama dengan currentMode menggunakan
    // document.currentScript trick atau — lebih andal — inject <script> tag
    // ke <head> SEBELUM body selesai render. Cara paling andal untuk patch
    // eksternal: override switchMode (yang SUDAH di window) untuk menyimpan
    // mode terakhir ke window._kuotaMode setiap kali berubah.

    function getModeAktif() {
        // Prioritas 1: nilai yang kita simpan sendiri via intercept switchMode
        if (typeof window._kuotaMode === 'string') return window._kuotaMode;
        // Prioritas 2: fallback ke window.currentMode (jika ada versi lain)
        if (typeof window.currentMode === 'string') return window.currentMode;
        return null;
    }

    // ── FUNGSI DATA KUOTA ────────────────────────────────────────────────────

    function ambilDataKuota() {
        var hariIni = new Date().toISOString().slice(0, 10);
        try {
            var raw = localStorage.getItem(KEY_STORAGE);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.tanggal === hariIni) return data;
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

    // ── MODAL PERINGATAN ─────────────────────────────────────────────────────

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

    // ── INDIKATOR KUOTA DI UI ────────────────────────────────────────────────

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
        if      (sisa === 0) teksStatus = label + ': Habis — reset tengah malam';
        else if (sisa <= 3)  teksStatus = label + ': Sisa ' + sisa + 'x — hampir habis!';
        else                 teksStatus = label + ': Sisa ' + sisa + 'x dari ' + batas + 'x';

        var bar = document.createElement('div');
        bar.id  = 'sf-kuota-bar';
        bar.style.cssText =
            'position:fixed;bottom:48px;left:0;right:0;z-index:500;' +
            'padding:6px 16px;background:rgba(11,21,40,0.92);' +
            'backdrop-filter:blur(6px);' +
            'border-top:1px solid rgba(255,255,255,0.06);' +
            'font-family:inherit;';
        bar.innerHTML =
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;max-width:480px;margin:0 auto;gap:10px;">' +
                '<span style="font-size:11px;color:#94a3b8;white-space:nowrap;' +
                'font-weight:600;letter-spacing:0.5px;">📷 KUOTA DETEKSI HARI INI</span>' +
                '<div style="flex:1;height:6px;background:rgba(255,255,255,0.08);' +
                'border-radius:3px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + persen + '%;' +
                    'background:' + warna + ';border-radius:3px;' +
                    'transition:width 0.4s ease;"></div>' +
                '</div>' +
                '<span style="font-size:11px;color:' + warna + ';' +
                'white-space:nowrap;font-weight:700;min-width:160px;' +
                'text-align:right;">' + teksStatus + '</span>' +
            '</div>';
        document.body.appendChild(bar);
    }

    // ── FIX 1: Intercept switchMode untuk selalu tahu mode aktif ─────────────
    //
    // switchMode() ada di window (fungsi biasa di <script>), jadi bisa di-wrap.
    // Setiap kali mode berganti, kita simpan ke window._kuotaMode agar
    // getModeAktif() selalu akurat tanpa perlu akses `let currentMode` asli.

    var _switchModeAsli = window.switchMode;
    window.switchMode = function (mode) {
        window._kuotaMode = mode;   // ← simpan sebelum memanggil asli
        _switchModeAsli.apply(this, arguments);
        renderIndikatorKuota(mode);
    };

    // ── FIX 2: Intercept btnAnalisis (daun, hama, gulma, tanah, malai) ────────
    //
    // mulaiAnalisis() bukan window.mulaiAnalisis — ia adalah `async function`
    // di closure script yang sama. Override window.mulaiAnalisis tidak bekerja
    // karena tombol memanggil mulaiAnalisis() lewat scope lokal, bukan window.
    //
    // Solusi: pasang event listener capture-phase di document. Karena capture
    // berjalan SEBELUM listener asli, kita bisa membatalkan klik sebelum
    // mulaiAnalisis() dipanggil, tanpa perlu tahu di mana fungsi itu ada.

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#btnAnalisis');
        if (!btn) return;

        var mode = getModeAktif();
        if (!mode || !MODE_AI.includes(mode) || mode === 'bwd') return;

        if (sisaKuotaMenu(mode) <= 0) {
            e.stopImmediatePropagation(); // Hentikan semua listener lain
            e.preventDefault();
            tampilkanModalKuotaHabis(mode);
            return;
        }

        pakaiSatuKuota(mode);
        renderIndikatorKuota(mode);
        // Biarkan klik berlanjut ke handler asli (mulaiAnalisis)

    }, true /* capture phase */);

    // ── FIX 3: Intercept btnCapture (BWD) via event delegation ───────────────
    //
    // Patch lama meng-clone btnCapture untuk mengganti listener.
    // Masalah: addEventListener asli di index.html mungkin belum terpasang
    // saat patch ini dimuat, sehingga clone memindahkan listener yang belum ada.
    // Setelah clone, listener asli dipasang ke elemen lama yang sudah dibuang.
    //
    // Solusi: sama dengan Fix 2 — event delegation capture-phase di document.
    // Kita tidak perlu clone apa pun. Listener kita berjalan lebih dulu,
    // bisa membatalkan jika kuota habis, atau membiarkan handler asli jalan.

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
        // Biarkan handler asli BWD jalan (jalankanCaptureBWD di index.html)

    }, true /* capture phase */);

    // ── Tampilkan indikator saat load jika sudah di mode AI ─────────────────
    window.addEventListener('load', function () {
        renderIndikatorKuota(getModeAktif());
    });

    console.log(
        '%c✅ patch_kuota_harian.js v1.1 (per menu) dimuat',
        'color: #f59e0b; font-weight: bold;'
    );

})();
