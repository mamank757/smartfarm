/**
 * ============================================================
 *  patch_perbaikan_kontras.js
 *  Versi: 2.0 — Perbaikan Kontras Menyeluruh (Malam & Siang)
 * ------------------------------------------------------------
 *  v2.0 vs v1.0:
 *  [FOKUS UTAMA] Perbaikan penuh #jtoTeks (Jadwal Tanam):
 *    - Semua inline-style color:#64748b / #475569 / #94a3b8
 *      yang hardcoded di renderKartu() dan renderOutput()
 *      kini di-override via CSS selector spesifik
 *    - Tambahan light-mode override lengkap untuk #jtoTeks
 *      agar teks tidak menghilang di background putih
 *
 *  CARA PASANG — letakkan PALING AKHIR:
 *    <script src="patch_jadwal_manual_trigger.js"></script>
 *    <script src="patch_riwayat_analisis.js"></script>
 *    <script src="patch_perbaikan_kontras.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    var CSS = `
/* ============================================================
   PATCH KONTRAS v2.0 — patch_perbaikan_kontras.js
   ============================================================ */

/* ──────────────────────────────────────────────────────────
   1. RIWAYAT PANEL (mode malam)
   #64748b → #94a3b8  |  #475569 → #7f8ea3
────────────────────────────────────────────────────────── */
.riwayat-label {
    color: #94a3b8 !important;
}
.riwayat-tgl {
    color: #7f8ea3 !important;
}
#daftarRiwayat > div[style*="text-align:center"] {
    color: #8da2be !important;
}
.notif-lewat {
    color: #8da2be !important;
}
.lahan-item .lahan-info small {
    color: #8da2be !important;
}
.notif-jadwal-item .hari-sub {
    color: #8da2be !important;
}
#indikasiLahanAktif .ganti-lahan {
    color: #8da2be !important;
}

/* ──────────────────────────────────────────────────────────
   2. JADWAL TANAM — #jtoTeks (MODE MALAM)

   renderKartu() menghasilkan inline-style hardcoded.
   CSS selector di bawah menarget semua varian yang
   ditulis langsung oleh renderKartu() & renderOutput().
────────────────────────────────────────────────────────── */

/* 2a. Label "Kegiatan N" & fase bulan • deskripsi
       Semua div font-size≤11px berisi teks abu di dalam kartu */
#jtoTeks div[style*="font-size:10px"][style*="color:#64748b"],
#jtoTeks div[style*="font-size:11px"][style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* 2b. Chevron ▼ */
#jtoTeks .jto-chevron {
    color: #94a3b8 !important;
}
#jtoTeks span[style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* 2c. Label "Zona iklim", "Kondisi ENSO", "Waktu Tanam", "Varietas"
       span inline style di dalam box info iklim & box musim */
#jtoTeks span[style*="color:#64748b"],
#jtoTeks span[style*="color: #64748b"] {
    color: #94a3b8 !important;
}

/* 2d. Teks alasan rekomendasi (font-size:11px, color:#94a3b8) */
#jtoTeks div[style*="font-size:11px"][style*="color:#94a3b8"],
#jtoTeks div[style*="font-size:11px"][style*="color: #94a3b8"] {
    color: #b8c8d8 !important;
}

/* 2e. Tanggal selesai " s/d ..." — kontainer font-size:12px#94a3b8 */
#jtoTeks div[style*="font-size:12px"][style*="color:#94a3b8"],
#jtoTeks div[style*="font-size:12px"][style*="color: #94a3b8"] {
    color: #b0bfcf !important;
}

/* 2f. Teks tips (li) pada kartu lewat — color:#475569 */
#jtoTeks li[style*="color:#475569"],
#jtoTeks li[style*="color: #475569"] {
    color: #94a3b8 !important;
}

/* 2g. Teks isi Blueprint "Kegiatan ini sudah terlewati..."
       color:#475569 di dalam catatanHTML (kartu lewat) */
#jtoTeks div[style*="color:#475569"],
#jtoTeks div[style*="color: #475569"] {
    color: #94a3b8 !important;
}

/* 2h. Judul blueprint "📋 Data Proyeksi" — color:#64748b */
#jtoTeks div[style*="font-size:11px"][style*="font-weight:700"][style*="color:#64748b"] {
    color: #8da2be !important;
}

/* 2i. Heading "Tips Lapangan" — color:#64748b uppercase */
#jtoTeks div[style*="text-transform:uppercase"][style*="color:#64748b"],
#jtoTeks div[style*="text-transform: uppercase"][style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* 2j. Disclaimer bawah — font-size:10px color:#64748b */
#jtoTeks > div > div[style*="font-size:10px"][style*="color:#64748b"],
#jtoTeks div[style*="color:#64748b"][style*="line-height:1.6"] {
    color: #8da2be !important;
}

/* 2k. Badge "📋 Blueprint" — color:#64748b pada span badge */
#jtoTeks span[style*="color:#64748b"][style*="border:1px solid #334155"] {
    color: #94a3b8 !important;
}

/* 2l. Badge "📋 Referensi" pada kartu lewat */
#jtoTeks span[style*="color:#64748b"][style*="background:#1e293b"] {
    color: #8da2be !important;
}

/* 2m. Nama kegiatan pada kartu lewat — color:#64748b (font-size:14px) */
#jtoTeks div[style*="font-size:14px"][style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* 2n. Tanggal kartu lewat — strong color:#475569 */
#jtoTeks strong[style*="color:#475569"],
#jtoTeks strong[style*="color: #475569"] {
    color: #94a3b8 !important;
}

/* ──────────────────────────────────────────────────────────
   3. JADWAL TANAM — #jtoTeks (MODE SIANG / light-mode)

   Di light-mode, background kartu (#1b273a, #1e293b, #111c2e)
   masih hitam karena inline-style tidak dioverride oleh
   body.light-mode #boxJadwalTanam{background:#fff} saja.
   Kita paksa ulang seluruh kartu & box agar tampil putih/terang.
────────────────────────────────────────────────────────── */

/* 3a. Kartu kegiatan (background:#1b273a) */
body.light-mode #jtoTeks div[style*="background:#1b273a"],
body.light-mode #jtoTeks div[style*="background: #1b273a"] {
    background: #f1f5f9 !important;
    border-color: #cbd5e1 !important;
}

/* 3b. Ikon bulat dalam kartu (background:#111c2e) */
body.light-mode #jtoTeks div[style*="background:#111c2e"],
body.light-mode #jtoTeks div[style*="background: #111c2e"] {
    background: #e2e8f0 !important;
}

/* 3c. Box musim tanam (background:#1e293b) */
body.light-mode #jtoTeks div[style*="background:#1e293b"],
body.light-mode #jtoTeks div[style*="background: #1e293b"] {
    background: #e8eef6 !important;
    border-color: #cbd5e1 !important;
}

/* 3d. Box info iklim (background:rgba(6,182,212,0.09)) */
body.light-mode #jtoTeks div[style*="background:rgba(6,182,212"] {
    background: rgba(6,182,212,0.07) !important;
    border-color: rgba(6,182,212,0.4) !important;
}

/* 3e. Disclaimer bawah (background:rgba(100,116,139,0.1)) */
body.light-mode #jtoTeks div[style*="background:rgba(100,116,139"] {
    background: rgba(100,116,139,0.12) !important;
    border-color: #cbd5e1 !important;
}

/* 3f. Semua teks putih (#fff) dalam jtoTeks jadi gelap di siang */
body.light-mode #jtoTeks div[style*="color:#fff"],
body.light-mode #jtoTeks div[style*="color: #fff"],
body.light-mode #jtoTeks strong[style*="color:#fff"],
body.light-mode #jtoTeks strong[style*="color: #fff"] {
    color: #0f172a !important;
}

/* 3g. Judul musim (color:#fff, font-size:15px) */
body.light-mode #jtoTeks div[style*="font-size:15px"][style*="color:#fff"] {
    color: #0f172a !important;
}

/* 3h. Nama kegiatan (color:#fff, font-size:14px) — aktif */
body.light-mode #jtoTeks div[style*="font-size:14px"][style*="color:#fff"] {
    color: #1e3a5f !important;
}

/* 3i. Tanggal aktif (color:#e2e8f0) */
body.light-mode #jtoTeks strong[style*="color:#e2e8f0"],
body.light-mode #jtoTeks strong[style*="color: #e2e8f0"] {
    color: #1e3a5f !important;
}

/* 3j. Teks isi tips & risiko aktif (color:#cbd5e1) */
body.light-mode #jtoTeks div[style*="color:#cbd5e1"],
body.light-mode #jtoTeks li[style*="color:#cbd5e1"],
body.light-mode #jtoTeks div[style*="color: #cbd5e1"] {
    color: #334155 !important;
}

/* 3k. Semua label sub-info abu (#64748b, #94a3b8) di siang */
body.light-mode #jtoTeks span[style*="color:#64748b"],
body.light-mode #jtoTeks div[style*="color:#64748b"],
body.light-mode #jtoTeks div[style*="color:#94a3b8"],
body.light-mode #jtoTeks div[style*="color: #64748b"],
body.light-mode #jtoTeks div[style*="color: #94a3b8"],
body.light-mode #jtoTeks .jto-chevron {
    color: #475569 !important;
}

/* 3l. Teks lewat / blueprint (color:#475569 inline) di siang */
body.light-mode #jtoTeks div[style*="color:#475569"],
body.light-mode #jtoTeks li[style*="color:#475569"],
body.light-mode #jtoTeks strong[style*="color:#475569"] {
    color: #334155 !important;
}

/* 3m. Nama kegiatan lewat (color:#64748b, font-size:14px) di siang */
body.light-mode #jtoTeks div[style*="font-size:14px"][style*="color:#64748b"] {
    color: #475569 !important;
}

/* 3n. Tanggal lewat di siang */
body.light-mode #jtoTeks strong[style*="color:#475569"] {
    color: #334155 !important;
}

/* 3o. Detail panel (jto-detail) background di siang */
body.light-mode #jtoTeks .jto-detail {
    background: #f8fafc;
    border-top-color: #cbd5e1 !important;
}

/* 3p. Badge blueprint di siang */
body.light-mode #jtoTeks span[style*="background:#1e293b"][style*="color:#64748b"] {
    background: #e2e8f0 !important;
    color: #475569 !important;
    border-color: #94a3b8 !important;
}

/* ──────────────────────────────────────────────────────────
   4. PANEL RIWAYAT — light-mode
────────────────────────────────────────────────────────── */
body.light-mode .riwayat-label {
    color: #334155 !important;
}
body.light-mode .riwayat-tgl {
    color: #475569 !important;
}
body.light-mode #daftarRiwayat > div[style*="text-align:center"] {
    color: #475569 !important;
}
body.light-mode .notif-lewat {
    color: #64748b !important;
}
body.light-mode .lahan-item .lahan-info small {
    color: #475569 !important;
}
body.light-mode .notif-jadwal-item .hari-sub {
    color: #475569 !important;
}
body.light-mode #indikasiLahanAktif .ganti-lahan {
    color: #475569 !important;
}

/* ──────────────────────────────────────────────────────────
   5. PANEL CUACA & RISIKO — label kecil mode malam
────────────────────────────────────────────────────────── */
#boxCuaca div[style*="color:#64748b"],
#boxCuaca label[style*="color:#64748b"],
#weatherData div[style*="color:#64748b"],
#weatherData label[style*="color:#64748b"] {
    color: #94a3b8 !important;
}
#boxCuaca div[style*="color:#475569"],
#weatherData div[style*="color:#475569"] {
    color: #8da2be !important;
}

/* ──────────────────────────────────────────────────────────
   6. PANEL CUACA & RISIKO — light-mode
────────────────────────────────────────────────────────── */
body.light-mode #boxCuaca div[style*="color:#64748b"],
body.light-mode #weatherData div[style*="color:#64748b"],
body.light-mode #boxCuaca label[style*="color:#64748b"] {
    color: #334155 !important;
}
body.light-mode #boxCuaca div[style*="color:#475569"],
body.light-mode #weatherData div[style*="color:#475569"] {
    color: #334155 !important;
}
`;

    function suntikCSS() {
        /* Hapus versi lama jika ada */
        var lama = document.getElementById('patch-kontras-v1');
        if (lama) lama.remove();

        var style = document.createElement('style');
        style.id = 'patch-kontras-v2';
        style.textContent = CSS;
        document.head.appendChild(style);

        console.log(
            '%c✅ patch_perbaikan_kontras.js v2.0 — kontras JTO (malam+siang) diperbaiki',
            'color:#94a3b8; font-weight:bold;'
        );
    }

    if (document.head) {
        suntikCSS();
    } else {
        document.addEventListener('DOMContentLoaded', suntikCSS);
    }

})();
