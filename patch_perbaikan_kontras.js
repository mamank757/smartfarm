/**
 * ============================================================
 *  patch_perbaikan_kontras.js
 *  Versi: 1.0 — Perbaikan Kontras Warna Font UI
 * ------------------------------------------------------------
 *  MASALAH YANG DIPERBAIKI:
 *
 *  Sejumlah elemen teks menggunakan warna yang terlalu gelap
 *  untuk dibaca di atas background dark (#0f172a / #111c2e),
 *  terutama:
 *
 *  [1] .riwayat-label  : #64748b → teks mode (DAUN, HAMA, dll)
 *      Kontras ratio ~2.4:1 — di bawah WCAG AA minimum (4.5:1)
 *      Fix: #94a3b8 (kontras ~4.6:1)
 *
 *  [2] .riwayat-tgl    : #475569 → tanggal di header riwayat
 *      Kontras ratio ~1.9:1 — sangat tidak terbaca
 *      Fix: #7f8ea3 (kontras ~3.8:1) — cukup untuk teks kecil 700
 *
 *  [3] .riwayat-hasil  : #cbd5e1 → isi ringkasan riwayat
 *      Sudah cukup kontras, TETAP TIDAK DIUBAH.
 *
 *  [4] Teks "Belum ada riwayat" : #475569
 *      Fix: #8da2be
 *
 *  [5] Label sub-info di jadwal tanam (ZOM info):
 *      span color:#64748b di dalam box info iklim
 *      Fix: #94a3b8
 *
 *  [6] Label sub-info di kartu kegiatan (Kegiatan N, Tips, dll):
 *      color:#64748b di dalam kartu jadwal
 *      Fix: #94a3b8
 *
 *  [7] Notif lewat : color:#64748b
 *      Fix: #8da2be
 *
 *  [8] Label kecil di panel cuaca (LOKASI AKTIF, TGL TANAM, dll):
 *      color:#64748b (font 0.68rem)
 *      Fix: #94a3b8
 *
 *  [9] Info GPS prompt di panel cuaca: color:#475569
 *      Fix: #8da2be
 *
 *  [10] .lahan-item .lahan-info small : #64748b
 *       Fix: #8da2be
 *
 *  [11] .notif-jadwal-item .hari-sub : #64748b
 *       Fix: #8da2be
 *
 *  [12] #indikasiLahanAktif .ganti-lahan : #64748b
 *       Fix: #8da2be
 *
 *  CARA PASANG:
 *  Letakkan PALING AKHIR, setelah semua patch lain:
 *    <script src="patch_perbaikan_kontras.js"></script>
 *
 *  Patch ini HANYA menyuntikkan CSS override — tidak menyentuh
 *  logika JavaScript apapun. Aman dari efek samping.
 * ============================================================
 */

(function () {
    'use strict';

    var CSS_KONTRAS = `
/* ============================================================
   PATCH KONTRAS — patch_perbaikan_kontras.js v1.0
   Override warna teks yang kontras-nya di bawah WCAG AA
   ============================================================ */

/* [1] Label mode di header riwayat (DAUN, HAMA, BWD, dll)
       Dari #64748b (~2.4:1) → #94a3b8 (~4.6:1) */
.riwayat-label {
    color: #94a3b8 !important;
}

/* [2] Tanggal di header riwayat
       Dari #475569 (~1.9:1) → #7f8ea3 (~3.5:1) */
.riwayat-tgl {
    color: #7f8ea3 !important;
}

/* [4] Teks kosong "Belum ada riwayat analisis"
       Wrapper inline style sulit di-override via class,
       jadi kita target selector spesifik di container */
#daftarRiwayat > div[style*="text-align:center"] {
    color: #8da2be !important;
}

/* [7] Badge notif yang sudah lewat
       Dari #64748b → #8da2be */
.notif-lewat {
    color: #8da2be !important;
}

/* [10] Info kecil di item lahan
        Dari #64748b → #8da2be */
.lahan-item .lahan-info small {
    color: #8da2be !important;
}

/* [11] Sub-info di item notif jadwal (mis: "HST: 7 hari lagi")
        Dari #64748b → #8da2be */
.notif-jadwal-item .hari-sub {
    color: #8da2be !important;
}

/* [12] Tombol ganti lahan di indikasi lahan aktif
        Dari #64748b → #8da2be */
#indikasiLahanAktif .ganti-lahan {
    color: #8da2be !important;
}

/* ── Perbaikan khusus panel Jadwal Tanam (patch_jadwal_tanam_otomatis) ──
   Semua <span> label abu di dalam box info iklim
   Contoh: "Zona iklim & sumber data", "Waktu Tanam", "Varietas" */
#jtoTeks span[style*="color:#64748b"],
#jtoTeks span[style*="color: #64748b"] {
    color: #94a3b8 !important;
}

/* Label kecil di kartu kegiatan JTO: "Kegiatan N", "Tips Lapangan"
   Semua div kecil dengan warna #64748b atau #94a3b8 di dalam jtoTeks */
#jtoTeks div[style*="color:#64748b"],
#jtoTeks div[style*="color: #64748b"] {
    color: #94a3b8 !important;
}

/* Teks disclaimer bawah (#64748b) di jtoTeks */
#jtoTeks > div[style*="color:#64748b"],
#jtoTeks > div > div[style*="color:#64748b"] {
    color: #8da2be !important;
}

/* Teks alasan rekomendasi #94a3b8 → sedikit lebih terang */
#jtoTeks div[style*="color:#94a3b8"] {
    color: #b0bec5 !important;
}

/* ── Perbaikan panel Cuaca (patch_cuaca_langsung) ── */
/* Label GPS prompt */
#boxCuaca div[style*="color:#475569"],
#weatherData div[style*="color:#475569"] {
    color: #8da2be !important;
}

/* Label kecil LOKASI AKTIF, TGL TANAM, VARIETAS */
#boxCuaca div[style*="color:#64748b"],
#weatherData div[style*="color:#64748b"],
#boxCuaca label[style*="color:#64748b"],
#weatherData label[style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* ── Perbaikan teks referensi di patch_risiko_iklim ── */
#boxPenyakit div[style*="color:#64748b"],
#boxHama div[style*="color:#64748b"] {
    color: #94a3b8 !important;
}

/* ── Perbaikan teks sak pupuk & keterangan di patch_smartfarming ── */
/* Teks "X sak" di bawah jumlah kg pemupukan */
div[style*="font-size:0.65rem"][style*="color:#64748b"] {
    color: #94a3b8 !important;
}
/* Keterangan kecil timing pupuk */
div[style*="font-size:0.7rem"][style*="color:#64748b"] {
    color: #8da2be !important;
}

/* Teks variasi estimasi panen (±10%) */
div[style*="font-size: 0.7rem"][style*="color: #64748b"],
div[style*="font-size:0.7rem"][style*="color:#64748b"] {
    color: #8da2be !important;
}

/* ── Light mode: pastikan teks tetap kontras ── */
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
`;

    function suntikCSS() {
        var style = document.createElement('style');
        style.id = 'patch-kontras-v1';
        style.textContent = CSS_KONTRAS;
        document.head.appendChild(style);

        console.log(
            '%c✅ patch_perbaikan_kontras.js v1.0 aktif — kontras teks diperbaiki',
            'color:#94a3b8; font-weight:bold;'
        );
    }

    /* Jalankan segera (CSS bisa disuntik kapan saja) */
    if (document.head) {
        suntikCSS();
    } else {
        document.addEventListener('DOMContentLoaded', suntikCSS);
    }

})();
