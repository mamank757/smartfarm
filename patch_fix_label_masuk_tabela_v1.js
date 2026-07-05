/**
 * ============================================================
 * patch_koreksi_arah_tapin_tabela_v1.js
 * Koreksi ARAH & BESARAN offset stagnasi Tapin vs Tabela
 * ------------------------------------------------------------
 * ‼️ FILE INI MENGGANTIKAN patch_fix_label_masuk_tabela_v1.js
 *    Hapus <script src="patch_fix_label_masuk_tabela_v1.js">
 *    dari index.html — arah koreksinya sekarang terbalik dan
 *    akan bentrok kalau keduanya dipasang bersamaan.
 *
 * MASALAH YANG DIPERBAIKI:
 *   patch_jadwal_tapin_tabela_fix.js (v2.0) menetapkan:
 *     tglTapin  = rek.tglTanam                (hasil mesin iklim)
 *     tglTabela = tglTapin + 8 hari            (belakangan)
 *
 *   Menurut konfirmasi Anda, ini TERBALIK. Yang benar:
 *     tglTabela = rek.tglTanam                (hasil mesin iklim
 *                 = kondisi air optimal untuk sebar benih langsung,
 *                   tanpa persemaian, tanpa stagnasi)
 *     tglTapin  = tglTabela − 15 hari          (LEBIH DULU, agar
 *                 saat mengalami stagnasi transplanting 15 hari,
 *                 tetap panen bersamaan dengan Tabela)
 *
 *   Arah "Tapin lebih dulu, Tabela belakangan" SUDAH BENAR di
 *   kode asli — yang salah cuma DUA hal:
 *     1) Mesin iklim dianggap = tanggal Tapin (seharusnya = Tabela)
 *     2) Besaran offset 8 hari (seharusnya 15 hari)
 *
 * STRATEGI PERBAIKAN:
 *   [BAGIAN A] Timpa ulang window._bangunKegiatanFix (dipakai
 *   oleh patch_fix01_terapkan_tapin_tabela.js untuk membangun
 *   SEMUA kartu kegiatan) dengan logika yang sudah dibalik &
 *   dikoreksi besarannya. Struktur & isi kartu SEPENUHNYA sama
 *   dengan versi asli — hanya 3 baris di paling atas fungsi yang
 *   diganti (definisi tglTapin/tglTabela/tglPanen), sisanya
 *   otomatis ikut benar karena semua tanggal lain diturunkan
 *   relatif dari 3 baris itu.
 *
 *   [BAGIAN B] Perbaiki baris ringkasan "Masuk Lahan" yang
 *   dirender terpisah oleh patch_fix01_terapkan_tapin_tabela.js
 *   (rerenderJTO miliknya sendiri, bukan dari kartu kegiatan):
 *     - Metode TAPIN  → tampilkan rek.tglTanam − 15 hari
 *                        (sebelumnya salah: tanpa offset)
 *     - Metode TABELA → tampilkan rek.tglTanam apa adanya
 *                        (sebelumnya salah: +8 hari)
 *
 * CARA PASANG — letakkan PALING TERAKHIR, MENGGANTIKAN
 * patch_fix_label_masuk_tabela_v1.js:
 *
 *   <script src="patch_jadwal_tapin_tabela_fix.js"></script>
 *   <script src="patch_fix01_terapkan_tapin_tabela.js"></script>
 *   ...
 *   <script src="patch_diagnostik_urutan_switchmode_v1.js"></script>
 *   <script src="patch_koreksi_arah_tapin_tabela_v1.js"></script>  ← file ini
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__koreksiArahTapinTabelaAktif) {
        console.warn('[koreksi_tapin_tabela] sudah aktif, skip.');
        return;
    }

    var OFFSET_STAGNASI_HARI = 15; // ← dikoreksi dari 8 menjadi 15 hari

    var TABEL_VARIETAS_FIX = {
        genjah: { umurTotal: 90,  umurBibit: 14 },
        sedang: { umurTotal: 110, umurBibit: 21 },
        dalam:  { umurTotal: 125, umurBibit: 28 }
    };

    function H(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }

    var NH  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NB  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var NBS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    function fmtL(d) { return NH[d.getDay()] + ', ' + d.getDate() + ' ' + NB[d.getMonth()] + ' ' + d.getFullYear(); }
    function fmtP(d) { return d.getDate() + ' ' + NBS[d.getMonth()] + ' ' + d.getFullYear(); }
    function sk(skorBulan, tgl) { return (skorBulan && typeof skorBulan[tgl.getMonth()] === 'number') ? skorBulan[tgl.getMonth()] : 50; }

    function rOlah(s)   { return s < 25 ? {level:'Kering',warna:'#ef4444',catatan:'Siapkan pompanisasi awal sebelum bajak.'} : s > 80 ? {level:'Sangat Basah',warna:'#3b82f6',catatan:'Tunggu lahan bisa diluku — hindari traktor amblas.'} : {level:'Baik',warna:'#10b981',catatan:'Kondisi optimal untuk bajak dan garu.'}; }
    function rBenih(s)  { return s > 75 ? {level:'Waspada',warna:'#f59e0b',catatan:'Buat drainase bedeng persemaian — cegah rebah semai.'} : s < 25 ? {level:'Siram Rutin',warna:'#f59e0b',catatan:'Siram pagi & sore untuk jaga kelembapan media semai.'} : {level:'Optimal',warna:'#10b981',catatan:'Cuaca mendukung perkecambahan benih.'}; }
    function rTanam(s)  { return s > 80 ? {level:'Genangan',warna:'#f59e0b',catatan:'Siapkan pompa — jaga kedalaman air 2–3 cm saja.'} : s < 20 ? {level:'Kering Kritis',warna:'#ef4444',catatan:'Tunda atau siapkan pompanisasi penuh.'} : {level:'Baik',warna:'#10b981',catatan:'Kondisi air mendukung penanaman.'}; }
    function rTikus(f)  { return (f < 4 || f > 25) ? {level:'Optimal',warna:'#10b981',catatan:'Malam gelap — umpan antikoagulan maksimal efektif.'} : {level:'Kurang Optimal',warna:'#f59e0b',catatan:'Bulan bercahaya — tetap pasang TBS & gropyokan.'}; }
    function rPupuk(s)  { return s > 75 ? {level:'Risiko Tercuci',warna:'#f59e0b',catatan:'Hindari hari hujan — pupuk 1–2 hari sebelum hujan ringan.'} : s < 20 ? {level:'Tanah Kering',warna:'#ef4444',catatan:'Pastikan ada air di petakan sebelum tabur pupuk.'} : {level:'Optimal',warna:'#10b981',catatan:'Cuaca mendukung serapan pupuk.'}; }
    function rInsek(s, f) {
        var l='Baik', w='#10b981', c='';
        if (s > 75) { c='Hindari semprot saat hujan. '; w='#f59e0b'; l='Hati-hati'; }
        if (f >= 13 && f <= 17) { c+='Puncak penerbangan ngengat PBP — pasang lampu perangkap.'; w='#ef4444'; l='Waspada'; }
        else c+='Waktu aplikasi aman dari puncak ngengat.';
        return {level:l, warna:w, catatan:c.trim()};
    }
    function rFungi(s)  { return s > 65 ? {level:'Kritis Blast',warna:'#ef4444',catatan:'Cuaca lembap — semprot Tricyclazole 7 hari sebelum bunting.'} : s > 45 ? {level:'Waspada',warna:'#f59e0b',catatan:'Pantau bercak belah ketupat — semprot preventif.'} : {level:'Aman',warna:'#10b981',catatan:'Risiko blast rendah — cukup monitoring rutin.'}; }
    function rPanen(s)  { return s > 75 ? {level:'Sulit Kering',warna:'#ef4444',catatan:'Siapkan dryer — jangan tumpuk gabah lembap.'} : s > 55 ? {level:'Waspada Hujan',warna:'#f59e0b',catatan:'Panen pagi hari — hindari sore hujan.'} : s < 20 ? {level:'Kering Ideal',warna:'#10b981',catatan:'Kondisi sempurna — pesan combine 14 hari sebelumnya.'} : {level:'Baik',warna:'#10b981',catatan:'Koordinasikan combine harvester.'}; }

    function getFaseBulan(tgl) {
        var fn = window.hariFaseBulan;
        return (typeof fn === 'function') ? fn(tgl) : 15;
    }
    function getNamaFase(f) {
        var fn = window.namaFaseBulan;
        if (typeof fn === 'function') return fn(f);
        if (f < 1.5)  return {nama:'Bulan Mati', ikon:'🌑'};
        if (f < 8.4)  return {nama:'Bulan Sabit Muda', ikon:'🌒'};
        if (f < 15.8) return {nama:'Bulan Penuh', ikon:'🌕'};
        return {nama:'Bulan Sabit Tua', ikon:'🌘'};
    }

    /* ============================================================
       BAGIAN A — bangunKegiatanFix DENGAN ARAH & BESARAN BENAR
       (struktur identik dengan v2.0 asli, hanya 3 baris teratas
        definisi tanggal yang dibalik)
    ============================================================ */
    function bangunKegiatanFixKoreksi(rek, skorBulan, metodeTanam) {
        var isTabela  = (metodeTanam === 'tabela');
        var varietas  = rek.varietas || 'sedang';
        var vParam    = TABEL_VARIETAS_FIX[varietas] || TABEL_VARIETAS_FIX.sedang;
        var umurTotal = vParam.umurTotal;
        var umurBibit = vParam.umurBibit;

        /**
         * ── KOREKSI UTAMA (3 baris) ──────────────────────────────
         * Hasil mesin iklim (rek.tglTanam) = tanggal TABELA
         * (sebar langsung, tanpa stagnasi transplanting).
         * Tapin harus masuk lahan LEBIH DULU (−15 hari) supaya
         * setelah mengalami stagnasi, panen tetap bersamaan.
         */
        var tglTabela = rek.tglTanam;
        var tglTapin  = H(tglTabela, -OFFSET_STAGNASI_HARI);
        var tglPanen  = H(tglTabela, umurTotal);
        /* ────────────────────────────────────────────────────────
           Verifikasi: Tapin panen = tglTapin + umurTotal + OFFSET
                                    = (tglTabela-OFFSET) + umurTotal + OFFSET
                                    = tglTabela + umurTotal = tglPanen ✅ SAMA
        ──────────────────────────────────────────────────────── */

        var tglOlah = rek.tglOlahTanah
            ? rek.tglOlahTanah
            : H(tglTapin, -25);

        var tglBenih = isTabela
            ? H(tglTabela, -2)
            : H(tglTapin, -umurBibit);

        var tglMasukLahan = isTabela ? tglTabela : tglTapin;

        var tglP1   = H(tglMasukLahan,  7);
        var tglP2   = H(tglMasukLahan, isTabela ? 28 : 30);
        var tglP3   = H(tglMasukLahan, isTabela ? 45 : 55);
        var tglI1   = H(tglMasukLahan, isTabela ? 20 : 25);
        var tglI2   = H(tglMasukLahan, isTabela ? 45 : 55);
        var tglFung = H(tglMasukLahan, isTabela ? 55 : 65);

        var jt          = rek.jadwalTikus;
        var tglGroyokM  = jt ? jt.gropyokan.tglMulai          : H(tglOlah, -14);
        var tglGroyokS  = jt ? jt.sanitasiPematang.tglSelesai : H(tglOlah, -1);
        var tglTBSM     = jt ? jt.pasangTBS.tglMulai          : tglMasukLahan;
        var tglTBSS     = jt ? jt.monitorTBS.tglSelesai       : H(tglMasukLahan, 30);
        var tglRacunM   = jt ? jt.umpanRacun.tglMulai         : H(tglMasukLahan, 1);
        var tglRacunS   = jt ? jt.umpanRacun.tglSelesai       : H(tglMasukLahan, 21);

        var f1 = getFaseBulan(tglI1);
        var f2 = getFaseBulan(tglI2);
        if (f1 >= 13.5 && f1 <= 16.5) tglI1 = H(tglI1, 5);
        if (f2 >= 13.5 && f2 <= 16.5) tglI2 = H(tglI2, 5);

        var kartuBenih = isTabela ? {
            nama: 'Rendam & Peram Benih — Tabela', ikon: '💧',
            deskripsi: 'Rendam 24 jam, peram 24 jam sebelum sebar',
            tglMulai: tglBenih, tglSelesai: tglTabela,
            risiko: rBenih(sk(skorBulan, tglBenih)),
            tips: [
                'Rendam benih 24 jam, peram (karung lembap) ±24 jam hingga kecambah ±1–2 mm.',
                'Dosis benih Tabela: 50–60 kg/ha (drum seeder) atau hingga 100 kg/ha (sebar manual).',
                '⏰ Tabela sebar tepat pada tanggal hasil analisis iklim (tanpa persemaian).'
            ]
        } : {
            nama: 'Pembibitan Benih — Persemaian Tapin', ikon: '🌱',
            deskripsi: 'Semai benih ' + umurBibit + ' hari sebelum pindah tanam',
            tglMulai: tglBenih, tglSelesai: H(tglBenih, 7),
            risiko: rBenih(sk(skorBulan, tglBenih)),
            tips: [
                'Inkubasi lembap 48 jam hingga kecambah 2–3 mm, lalu semai di bedeng persemaian.',
                'Dosis semai Tapin: 25–35 kg/ha. Pindah tanam saat bibit umur ' + umurBibit + ' HSS.',
                '⏰ Tapin mulai semai lebih awal karena harus masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari sebelum Tabela.'
            ]
        };

        var kartuMasuk = isTabela ? {
            nama: 'Sebar Benih ke Lahan — Tabela', ikon: '🌾',
            deskripsi: 'Tepat pada tanggal hasil analisis iklim',
            tglMulai: tglTabela, tglSelesai: H(tglTabela, 1),
            risiko: rTanam(sk(skorBulan, tglTabela)),
            tips: [
                '⚡ Tabela disebar tepat waktu — Tapin sudah masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari sebelumnya.',
                'Tabela tidak mengalami stagnasi transplanting → langsung tumbuh sejak hari pertama sebar.',
                'Lahan macak-macak (jenuh air, tidak tergenang) saat sebar agar benih tidak hanyut.',
                'Target panen: ' + fmtL(tglPanen) + ' — SERENTAK dengan Tapin. ✅'
            ]
        } : {
            nama: 'Pindah Tanam ke Lahan Utama — Tapin', ikon: '🌾',
            deskripsi: 'Bibit umur ' + umurBibit + ' HSS — masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari SEBELUM Tabela',
            tglMulai: tglTapin, tglSelesai: H(tglTapin, 3),
            risiko: rTanam(sk(skorBulan, tglTapin)),
            tips: [
                '⚡ Tapin harus masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari LEBIH DULU dari Tabela.',
                'Alasan: setelah dicabut dari persemaian, tanaman mengalami stagnasi (tidak tumbuh) selama ±' +
                OFFSET_STAGNASI_HARI + ' hari karena stres adaptasi. Jika ditanam bersamaan Tabela, Tapin akan panen lebih lambat.',
                'Sumber: IRRI Rice Knowledge Bank; BB Padi (2018) Sulsel.',
                'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                'Target panen: ' + fmtL(tglPanen) + ' — SERENTAK dengan Tabela. ✅'
            ]
        };

        var daftar = [
            {
                nama: 'Gropyokan & Sanitasi Pematang', ikon: '🐀',
                deskripsi: 'Sebelum olah lahan — SAMA untuk Tapin & Tabela',
                tglMulai: tglGroyokM, tglSelesai: tglGroyokS,
                risiko: rTikus(getFaseBulan(tglGroyokM)),
                tips: [
                    'Lakukan saat lahan masih bera/kosong sebelum traktor turun.',
                    'Bersihkan gulma pematang, tutup lubang sarang tikus aktif dengan tanah basah.'
                ]
            },
            {
                nama: 'Pengolahan Lahan — Bajak & Garu', ikon: '🚜',
                deskripsi: 'SAMA untuk Tapin & Tabela — efisiensi sewa traktor',
                tglMulai: tglOlah, tglSelesai: H(tglOlah, 7),
                risiko: rOlah(sk(skorBulan, tglOlah)),
                tips: [
                    '⚡ Bajak & garu BERSAMAAN untuk Tapin & Tabela — hemat biaya sewa traktor.',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha saat bajak pertama.',
                    isTabela
                        ? 'Setelah bajak selesai: tunggu ' + Math.round(Math.abs(tglTabela - tglOlah) / 86400000) + ' hari, lalu sebar benih Tabela.'
                        : 'Setelah bajak selesai: tunggu ' + Math.round(Math.abs(tglTapin - tglOlah) / 86400000) + ' hari, lalu pindah bibit Tapin. Tabela menyusul ' + OFFSET_STAGNASI_HARI + ' hari kemudian.'
                ]
            },
            kartuBenih,
            kartuMasuk,
            {
                nama: 'Pasang & Monitor TBS', ikon: '🚧',
                deskripsi: 'Dipasang saat masuk lahan',
                tglMulai: tglTBSM, tglSelesai: tglTBSS,
                risiko: rTikus(getFaseBulan(tglTBSM)),
                tips: [
                    'Pasang TBS di sudut petakan (plastik setinggi 60 cm) bersamaan waktu masuk lahan.',
                    'Periksa bubu perangkap setiap 3–5 hari.'
                ]
            },
            {
                nama: 'Umpan Racun Tikus', ikon: '☠️',
                deskripsi: 'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglRacunM, tglSelesai: tglRacunS,
                risiko: rTikus(getFaseBulan(tglRacunM)),
                tips: [
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                    'Kanopi belum menutup rapat — waktu ideal untuk umpan.'
                ]
            },
            {
                nama: 'Pupuk Dasar — Tahap I', ikon: '🧪',
                deskripsi: 'NPK Phonska + Urea I — awal anakan aktif',
                tglMulai: tglP1, tglSelesai: H(tglP1, 2),
                risiko: rPupuk(sk(skorBulan, tglP1)),
                tips: [
                    'Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                    'Sebar saat air macak-macak.',
                    isTabela
                        ? ('~' + Math.round((tglP1 - tglMasukLahan) / 86400000) + ' HST Tabela (stagnasi tidak ada, anakan sudah mulai).')
                        : ('~' + Math.round((tglP1 - tglMasukLahan) / 86400000) + ' HST Tapin — stagnasi sudah berlalu, anakan mulai aktif.')
                ]
            },
            {
                nama: 'Insektisida I — Fase Vegetatif', ikon: '💊',
                deskripsi: 'Pengendalian WBC, Penggerek Batang, Sundep',
                tglMulai: tglI1, tglSelesai: H(tglI1, 2),
                risiko: rInsek(sk(skorBulan, tglI1), getFaseBulan(tglI1)),
                tips: [
                    'Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                    'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.'
                ]
            },
            {
                nama: 'Pupuk Susulan I — Tahap II', ikon: '🧪',
                deskripsi: 'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: H(tglP2, 2),
                risiko: rPupuk(sk(skorBulan, tglP2)),
                tips: [
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                    'Cek warna daun dengan BWD — skala ≥ 3 tahan Urea.'
                ]
            },
            {
                nama: 'Pupuk Susulan II — Tahap III', ikon: '🧪',
                deskripsi: 'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: H(tglP3, 2),
                risiko: rPupuk(sk(skorBulan, tglP3)),
                tips: [
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.'
                ]
            },
            {
                nama: 'Insektisida II — Fase Generatif', ikon: '💊',
                deskripsi: 'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: H(tglI2, 2),
                risiko: rInsek(sk(skorBulan, tglI2), getFaseBulan(tglI2)),
                tips: [
                    'Semprot pagi hari saat walang sangit masih di tanaman.',
                    'Bahan aktif kontak: Malathion, Deltametrin.'
                ]
            },
            {
                nama: 'Fungisida Blast — Fase Bunting', ikon: '🍄',
                deskripsi: 'Preventif Blast Leher Malai — 5–7 hari sebelum malai keluar',
                tglMulai: tglFung, tglSelesai: H(tglFung, 2),
                risiko: rFungi(sk(skorBulan, tglFung)),
                tips: [
                    'Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                    'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.'
                ]
            },
            {
                nama: '🌟 PANEN — Serentak Tapin & Tabela', ikon: '🌾',
                deskripsi: 'Panen BERSAMAAN meskipun Tapin ditanam lebih dulu',
                tglMulai: tglPanen, tglSelesai: H(tglPanen, 5),
                risiko: rPanen(sk(skorBulan, tglPanen)),
                tips: [
                    isTabela
                        ? ('Tabela: ' + umurTotal + ' hari sejak sebar (' + fmtP(tglTabela) + ') = ' + fmtL(tglPanen))
                        : ('Tapin: ' + (umurTotal + OFFSET_STAGNASI_HARI) + ' hari sejak pindah (' + fmtP(tglTapin) + ') = ' + fmtL(tglPanen) +
                           ' — termasuk ' + OFFSET_STAGNASI_HARI + ' hari kompensasi stagnasi.'),
                    '✅ Tapin & Tabela PANEN BERSAMAAN — Tapin ditanam lebih dulu ' + OFFSET_STAGNASI_HARI + ' hari sebagai kompensasi stagnasi transplanting.',
                    'Pesan combine 14 hari sebelum taksiran panen.',
                    'Panen saat 90–95% gabah kuning keemasan (kadar air ±20–25%).'
                ]
            }
        ];

        daftar.sort(function (a, b) { return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    }

    /* ============================================================
       BAGIAN B — Perbaiki label ringkasan "Masuk Lahan" di DOM
       (dirender terpisah oleh patch_fix01_terapkan_tapin_tabela.js)
    ============================================================ */
    /** Sama seperti getJenisSawah() di patch_bugfix_b1b3_v1.js — dipakai
     *  untuk memastikan koreksi ini TIDAK PERNAH menyentuh mode Rawa,
     *  karena Rawa tidak punya offset 15 hari antara Tapin & Tabela
     *  (lihat patch_sawah_rawa_v1.js — bangunKegiatanRawa memakai
     *  tglTanam yang SAMA untuk kedua metode). */
    function getJenisSawahAktif() {
        var elJTO    = document.getElementById('selectJenisSawahJTO');
        var elRisiko = document.getElementById('selectJenisSawahRisiko');
        return (elJTO && elJTO.value) || (elRisiko && elRisiko.value) || 'irigasi';
    }

    function perbaikiLabelRingkasan() {
        if (getJenisSawahAktif() === 'rawa') return; // ⛔ guard: jangan sentuh Rawa

        var multiJadwal = window._jtoData;
        var teksEl      = document.getElementById('jtoTeks');
        if (!multiJadwal || !multiJadwal.length || !teksEl) return;

        var metodeTanam = window._jtoMetodeTanam || 'tapin';

        var kandidatStrong = teksEl.querySelectorAll('strong[style*="color:#10b981"]');
        var idx = 0;

        kandidatStrong.forEach(function (strongEl) {
            var spanSebelumnya = strongEl.parentElement && strongEl.parentElement.querySelector('span');
            var labelTeks = spanSebelumnya ? spanSebelumnya.textContent : '';
            if (labelTeks.indexOf('Masuk Lahan') === -1) return;

            var jadwal = multiJadwal[idx];
            idx++;
            if (!jadwal || !jadwal.rekomendasi || !jadwal.rekomendasi.tglTanam) return;

            var anchor    = jadwal.rekomendasi.tglTanam; // = tanggal Tabela
            var tglBenar  = (metodeTanam === 'tabela') ? anchor : H(anchor, -OFFSET_STAGNASI_HARI);
            var teksBenar = fmtL(tglBenar);

            if (strongEl.textContent !== teksBenar) {
                console.log(
                    '%c[koreksi_tapin_tabela] Koreksi "Masuk Lahan": "' + strongEl.textContent +
                    '" → "' + teksBenar + '"',
                    'color:#d946ef;font-weight:bold;'
                );
                strongEl.textContent = teksBenar;
            }

            // Perbaiki juga teks sekunder "Tabela sebar: ..." (muncul saat metode = tapin)
            var teksSekunderEl = strongEl.nextElementSibling;
            if (metodeTanam === 'tapin' && teksSekunderEl && teksSekunderEl.textContent.indexOf('Tabela sebar') !== -1) {
                teksSekunderEl.innerHTML =
                    '&nbsp;|&nbsp; <span style="color:#64748b;font-size:11px;">Tabela sebar: ' + fmtP(anchor) + '</span>';
            }
        });
    }

    function pasang(tick) {
        tick = tick || 0;
        if (typeof window._bangunKegiatanFix !== 'function' || typeof window.prosesJadwalOtomatis !== 'function') {
            if (tick >= 80) {
                console.error('[koreksi_tapin_tabela] dependency belum tersedia — cek urutan <script>.');
                return;
            }
            setTimeout(function () { pasang(tick + 1); }, 100);
            return;
        }
        if (window._bangunKegiatanFix.__arahDikoreksi) return;

        // Bagian A: timpa pembangun kegiatan
        bangunKegiatanFixKoreksi.__arahDikoreksi = true;
        window._bangunKegiatanFix = bangunKegiatanFixKoreksi;
        window._OFFSET_STAGNASI   = OFFSET_STAGNASI_HARI;

        // Bagian B: perbaiki label ringkasan setelah setiap render
        var asliProses = window.prosesJadwalOtomatis;
        if (!asliProses.__labelRingkasanDikoreksi) {
            window.prosesJadwalOtomatis = async function () {
                await asliProses.apply(this, arguments);
                setTimeout(perbaikiLabelRingkasan, 200);
            };
            window.prosesJadwalOtomatis.__labelRingkasanDikoreksi = true;
        }

        window.__koreksiArahTapinTabelaAktif = true;
        console.log(
            '%c✅ patch_koreksi_arah_tapin_tabela_v1.js aktif\n' +
            '   Tabela = tanggal hasil analisis iklim (tidak digeser)\n' +
            '   Tapin  = Tabela − ' + OFFSET_STAGNASI_HARI + ' hari (lebih dulu, kompensasi stagnasi)\n' +
            '   Panen  = SAMA untuk keduanya',
            'color:#10b981;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasang, 1800); });
    } else {
        setTimeout(pasang, 1800);
    }

})();
