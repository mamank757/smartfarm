/**
 * ============================================================
 *  patch_jadwal_tapin_tabela_fix.js
 *  Versi: 1.0 — Koreksi Jadwal Tapin vs Tabela
 * ------------------------------------------------------------
 *
 *  LOGIKA YANG BENAR (referensi agronomis):
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Tabela:                                                │
 *  │    tglOlahTanah  = tglReferensi - 25                   │
 *  │    tglSebarLahan = tglReferensi          (hari ke-0)   │
 *  │    tglPanen      = tglReferensi + umurTotal             │
 *  │                                                         │
 *  │  Tapin:                                                 │
 *  │    tglOlahTanah  = tglReferensi - 25    (SAMA)         │
 *  │    tglMulaiSemai = tglReferensi - umurBibit - OFFSET   │
 *  │    tglPindahLahan= tglReferensi - OFFSET  (lebih awal) │
 *  │    tglPanen      = tglReferensi + umurTotal  (SAMA)    │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  OFFSET = 8 hari (tengah dari rentang 7–10 hari stagnasi
 *  transplanting padi. Sumber: IRRI Rice Knowledge Bank —
 *  transplanting shock menyebabkan berhenti tumbuh 7–14 hari;
 *  BB Padi (2018) menggunakan 7–10 hari sebagai rentang praktis.
 *  Nilai 8 dipilih sebagai titik tengah yang konservatif.)
 *
 *  PRINSIP UTAMA:
 *    - Pengolahan lahan (bajak, garu): Tapin = Tabela (bersamaan)
 *    - Tapin masuk lahan 8 hari LEBIH AWAL dari Tabela sebar
 *    - Tapin mulai semai = tglPindah - umurBibit (lebih awal lagi)
 *    - Panen: Tapin = Tabela PERSIS BERSAMAAN
 *
 *  CARA PASANG:
 *    Letakkan setelah patch_jadwal_tanam_otomatis.js dan
 *    patch_jadwal_manual_trigger.js:
 *
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>
 *    <script src="patch_jadwal_tapin_tabela_fix.js"></script>  ← ini
 * ============================================================
 */

(function () {
    'use strict';

    /* ============================================================
       KONSTANTA
    ============================================================ */

    /**
     * OFFSET_STAGNASI_HARI: jumlah hari tapin harus masuk lahan
     * lebih awal dari tabela agar panen tetap bersamaan.
     *
     * Dasar: IRRI Rice Knowledge Bank — transplanting shock
     * menyebabkan tanaman berhenti tumbuh (stagnasi) selama 7–14 hari.
     * BB Padi (2018) Sulsel menggunakan estimasi 7–10 hari untuk
     * varietas modern (Ciherang, Inpari). Nilai 8 dipilih sebagai
     * titik tengah praktis di lapangan.
     */
    var OFFSET_STAGNASI_HARI = 8;

    /**
     * TABEL_VARIETAS_FIX: umur total dan umur bibit per varietas.
     * Dibuat lokal agar patch ini mandiri dari file lain.
     */
    var TABEL_VARIETAS_FIX = {
        genjah: { umurTotal: 90,  umurBibit: 14 },
        sedang: { umurTotal: 110, umurBibit: 21 },
        dalam:  { umurTotal: 125, umurBibit: 28 }
    };

    /* ============================================================
       UTILITAS TANGGAL (lokal, mandiri)
    ============================================================ */
    function tambahHariFix(d, n) {
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }

    var NAMA_HARI_FIX  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN_FIX = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];
    var NAMA_BULAN_PENDEK_FIX = [
        'Jan','Feb','Mar','Apr','Mei','Jun',
        'Jul','Agu','Sep','Okt','Nov','Des'
    ];

    function formatTglLengkapFix(d) {
        return NAMA_HARI_FIX[d.getDay()] + ', ' +
               d.getDate() + ' ' + NAMA_BULAN_FIX[d.getMonth()] + ' ' + d.getFullYear();
    }
    function formatTglPendekFix(d) {
        return d.getDate() + ' ' + NAMA_BULAN_PENDEK_FIX[d.getMonth()] + ' ' + d.getFullYear();
    }

    /* ============================================================
       FUNGSI INTI: bangunKegiatanFix
       Menggantikan bangunKegiatan() di patch_jadwal_tanam_otomatis.js
       dengan logika tapin/tabela yang benar.
    ============================================================ */
    function bangunKegiatanFix(rek, skorBulan, metodeTanam) {
        var isTabela = (metodeTanam === 'tabela');
        var varietas = rek.varietas || 'sedang';

        var vParam    = TABEL_VARIETAS_FIX[varietas] || TABEL_VARIETAS_FIX.sedang;
        var umurTotal = vParam.umurTotal;
        var umurBibit = vParam.umurBibit;

        /**
         * tglReferensi = tanggal dari engine rekomendasi.
         * Selalu diartikan sebagai "tanggal Tabela sebar ke lahan"
         * ATAU "tanggal Tapin pindah ke lahan + OFFSET_STAGNASI_HARI".
         *
         * Dengan kata lain:
         *   Tabela sebar = tglReferensi
         *   Tapin pindah = tglReferensi - OFFSET_STAGNASI_HARI
         */
        var tglReferensi = rek.tglTanam;

        /* ── Hitung tglOlahTanah (sama untuk keduanya) ─────────────── */
        var tglOlahTanah = rek.tglOlahTanah
            ? rek.tglOlahTanah
            : tambahHariFix(tglReferensi, -25);

        /* ── Hitung tgl utama per metode ────────────────────────────── */
        var tglMasukLahan, tglBenih, tglPanen;

        if (isTabela) {
            // Tabela: sebar hari ke-0 referensi
            tglMasukLahan = tglReferensi;
            // Rendam & peram benih 2 hari sebelum sebar
            tglBenih      = tambahHariFix(tglReferensi, -2);
            // Panen = referensi + umur penuh
            tglPanen      = tambahHariFix(tglReferensi, umurTotal);
        } else {
            // Tapin: pindah ke lahan OFFSET_STAGNASI_HARI lebih awal
            tglMasukLahan = tambahHariFix(tglReferensi, -OFFSET_STAGNASI_HARI);
            // Mulai semai = tglPindah - umurBibit
            tglBenih      = tambahHariFix(tglMasukLahan, -umurBibit);
            // Panen = tglPindah + (umurTotal - OFFSET), SAMA dengan Tabela
            // Bukti: tglReferensi + umurTotal
            //      = tglMasukLahan + OFFSET + umurTotal
            //      = tglMasukLahan + (umurTotal + OFFSET)
            // Jadi: tglPanen = tglMasukLahan + umurTotal + OFFSET
            tglPanen      = tambahHariFix(tglMasukLahan, umurTotal + OFFSET_STAGNASI_HARI);
            // Verifikasi: harus sama dengan tglReferensi + umurTotal
            // tglMasukLahan = tglReferensi - OFFSET
            // tglPanen = (tglReferensi - OFFSET) + umurTotal + OFFSET
            //           = tglReferensi + umurTotal ✅
        }

        /* ── Kegiatan pasca masuk lahan (dihitung dari tglMasukLahan) ─ */
        var tglP1   = tambahHariFix(tglMasukLahan, 7);
        var tglP2   = tambahHariFix(tglMasukLahan, isTabela ? 28 : 30);
        var tglP3   = tambahHariFix(tglMasukLahan, isTabela ? 45 : 55);
        var tglI1   = tambahHariFix(tglMasukLahan, isTabela ? 20 : 25);
        var tglI2   = tambahHariFix(tglMasukLahan, isTabela ? 45 : 55);
        var tglFung = tambahHariFix(tglMasukLahan, isTabela ? 55 : 65);

        /* ── Jadwal tikus (ambil dari engine v3.0 jika ada) ────────────
           tglGropyok mengacu ke tglOlahTanah (sama untuk keduanya).
           tglTBS & umpan racun mengacu ke tglMasukLahan.          ── */
        var jt          = rek.jadwalTikus;
        var tglGropyokM = jt ? jt.gropyokan.tglMulai          : tambahHariFix(tglOlahTanah, -14);
        var tglGropyokS = jt ? jt.sanitasiPematang.tglSelesai : tambahHariFix(tglOlahTanah, -1);
        var tglTBSM     = jt ? jt.pasangTBS.tglMulai          : tglMasukLahan;
        var tglTBSS     = jt ? jt.monitorTBS.tglSelesai       : tambahHariFix(tglMasukLahan, 30);
        var tglRacunM   = jt ? jt.umpanRacun.tglMulai         : tambahHariFix(tglMasukLahan, 1);
        var tglRacunS   = jt ? jt.umpanRacun.tglSelesai       : tambahHariFix(tglMasukLahan, 21);

        /* ── Ambil helper risiko dari patch lama (tetap pakai) ───────── */
        var risikoOlah       = window._risikoOlahFn       || function() { return { level:'Baik', catatan:'Kondisi optimal untuk bajak dan garu.', warna:'#10b981' }; };
        var risikoBenih      = window._risikoBenihFn      || function() { return { level:'Optimal', catatan:'Cuaca mendukung perkecambahan benih.', warna:'#10b981' }; };
        var risikoTanam      = window._risikoTanamFn      || function() { return { level:'Baik', catatan:'Kondisi air mendukung penanaman.', warna:'#10b981' }; };
        var risikoTikus      = window._risikoTikusFn      || function() { return { level:'Optimal', catatan:'Pasang TBS & gropyokan.', warna:'#10b981' }; };
        var risikoPupuk      = window._risikoPupukFn      || function() { return { level:'Optimal', catatan:'Cuaca mendukung serapan pupuk.', warna:'#10b981' }; };
        var risikoInsektisida= window._risikoInsektisidaFn|| function() { return { level:'Baik', catatan:'Waktu aplikasi aman.', warna:'#10b981' }; };
        var risikoFungisida  = window._risikoFungisidaFn  || function() { return { level:'Aman', catatan:'Risiko blast rendah — cukup monitoring rutin.', warna:'#10b981' }; };
        var risikoPanen      = window._risikoPanenFn      || function() { return { level:'Baik', catatan:'Koordinasikan combine harvester.', warna:'#10b981' }; };
        var hariFaseBulan    = window.hariFaseBulan        || function() { return 15; };
        var namaFaseBulan    = window.namaFaseBulan        || function() { return { nama:'Bulan', ikon:'🌕' }; };

        function sk(tgl) { return (skorBulan && skorBulan[tgl.getMonth()]) || 50; }

        /* ── Buat kartu aktivitas benih & masuk lahan ────────────────── */
        var kartuBenih, kartuMasuk;

        if (isTabela) {
            kartuBenih = {
                nama: 'Rendam & Peram Benih', ikon: '💧',
                deskripsi: 'Rendam 24 jam, peram 24 jam hingga berkecambah',
                tglMulai: tglBenih, tglSelesai: tglMasukLahan,
                risiko: risikoBenih(sk(tglBenih)),
                tips: [
                    'Rendam benih 24 jam dalam air, lalu peram (bungkus karung lembap) ±24 jam hingga kecambah ±1–2 mm.',
                    'Dosis benih Tabela: 50–60 kg/ha (drum seeder) atau hingga 100 kg/ha (sebar manual).'
                ]
            };
            kartuMasuk = {
                nama: 'Tanam Benih Langsung — Tabela', ikon: '🌾',
                deskripsi: 'Sebar benih berkecambah ke lahan utama',
                tglMulai: tglMasukLahan,
                tglSelesai: tambahHariFix(tglMasukLahan, 1),
                risiko: risikoTanam(sk(tglMasukLahan)),
                tips: [
                    'Lahan macak-macak (jenuh air, tidak tergenang) saat sebar agar benih tidak hanyut.',
                    'Jarak larikan drum seeder: 20–25 cm antar baris.',
                    'Target panen: ' + formatTglLengkapFix(tglPanen) +
                    ' (' + umurTotal + ' hari sejak sebar) — SERENTAK dengan Tapin di hamparan yang sama.'
                ]
            };
        } else {
            kartuBenih = {
                nama: 'Pembibitan Benih — Persemaian Tapin', ikon: '🌱',
                deskripsi: 'Semai dimulai ' + umurBibit + ' HSS sebelum pindah tanam',
                tglMulai: tglBenih,
                tglSelesai: tambahHariFix(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips: [
                    'Inkubasi lembap 48 jam hingga kecambah 2–3 mm, lalu semai di bedeng persemaian.',
                    'Dosis semai Tapin: 25–35 kg/ha.',
                    '⚠️ Persemaian DIMULAI LEBIH AWAL (' + umurBibit + ' HSS + ' + OFFSET_STAGNASI_HARI + ' hari kompensasi stagnasi) agar panen SERENTAK dengan Tabela.'
                ]
            };
            kartuMasuk = {
                nama: 'Pindah Tanam ke Lahan Utama — Tapin', ikon: '🌾',
                deskripsi: 'Bibit umur ' + umurBibit + ' HSS pindah ' + OFFSET_STAGNASI_HARI + ' hari lebih awal dari Tabela',
                tglMulai: tglMasukLahan,
                tglSelesai: tambahHariFix(tglMasukLahan, 3),
                risiko: risikoTanam(sk(tglMasukLahan)),
                tips: [
                    'Tapin masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari LEBIH AWAL dari Tabela untuk mengkompensasi ' +
                    'stagnasi transplanting (7–10 hari tidak tumbuh setelah dicabut). ' +
                    'Sumber: IRRI Rice Knowledge Bank; BB Padi (2018) Sulsel.',
                    'Umur bibit optimal saat pindah: ' + umurBibit + ' HSS. Jangan melebihi ' + (umurBibit + 5) + ' HSS.',
                    'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                    'Target panen: ' + formatTglLengkapFix(tglPanen) +
                    ' — SERENTAK dengan Tabela di hamparan yang sama. ✅'
                ]
            };
        }

        /* ── Geser insektisida jika bertepatan bulan penuh ───────────── */
        [tglI1, tglI2].forEach(function(t, idx) {
            var f = hariFaseBulan(t);
            if (f >= 13.5 && f <= 16.5) {
                if (idx === 0) tglI1 = tambahHariFix(t, 5);
                else           tglI2 = tambahHariFix(t, 5);
            }
        });

        /* ── Susun daftar kegiatan ───────────────────────────────────── */
        var daftar = [
            {
                nama: 'Gropyokan & Sanitasi', ikon: '🐀',
                deskripsi: 'Gropyokan massal & bersihkan pematang (SAMA untuk Tapin & Tabela)',
                tglMulai: tglGropyokM, tglSelesai: tglGropyokS,
                risiko: risikoTikus(hariFaseBulan(tglGropyokM)),
                tips: [
                    'Lakukan saat lahan masih bera/kosong sebelum traktor turun.',
                    'Pengolahan lahan dan gropyokan SAMA jadwalnya untuk Tapin maupun Tabela.'
                ]
            },
            {
                nama: 'Pengolahan Lahan (Bajak & Garu)', ikon: '🚜',
                deskripsi: 'Bajak, garu, pemerataan petakan — jadwal SAMA untuk Tapin & Tabela',
                tglMulai: tglOlahTanah,
                tglSelesai: tambahHariFix(tglOlahTanah, 7),
                risiko: risikoOlah(sk(tglOlahTanah)),
                tips: [
                    '⚡ Pengolahan lahan BERSAMAAN untuk Tapin & Tabela — efisiensi biaya sewa traktor.',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha saat bajak pertama.',
                    isTabela
                        ? 'Tabela akan sebar benih ' + Math.abs(Math.round((tglMasukLahan - tglOlahTanah) / 86400000)) + ' hari setelah bajak selesai.'
                        : 'Tapin akan pindah bibit ' + Math.abs(Math.round((tglMasukLahan - tglOlahTanah) / 86400000)) + ' hari setelah bajak selesai — lebih awal dari Tabela.'
                ]
            },
            kartuBenih,
            kartuMasuk,
            {
                nama: 'Pasang & Monitor TBS', ikon: '🚧',
                deskripsi: 'Trap Barrier System — dipasang saat masuk lahan',
                tglMulai: tglTBSM, tglSelesai: tglTBSS,
                risiko: risikoTikus(hariFaseBulan(tglTBSM)),
                tips: [
                    'Pasang TBS di sudut petakan (plastik setinggi 60 cm) bersamaan dengan waktu masuk lahan.',
                    'Periksa bubu perangkap setiap 3–5 hari.'
                ]
            },
            {
                nama: 'Umpan Racun Tikus', ikon: '☠️',
                deskripsi: 'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglRacunM, tglSelesai: tglRacunS,
                risiko: risikoTikus(hariFaseBulan(tglRacunM)),
                tips: [
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                    'Aman dilakukan karena kanopi padi belum menutup rapat.'
                ]
            },
            {
                nama: 'Pupuk Dasar — Tahap I', ikon: '🧪',
                deskripsi: 'NPK Phonska + Urea I — awal anakan aktif',
                tglMulai: tglP1, tglSelesai: tambahHariFix(tglP1, 2),
                risiko: risikoPupuk(sk(tglP1)),
                tips: [
                    'Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                    'Sebar saat air macak-macak.',
                    isTabela
                        ? 'Tabela: sekitar ' + Math.round((tglP1 - tglMasukLahan) / 86400000) + ' HST.'
                        : 'Tapin: sekitar ' + Math.round((tglP1 - tglMasukLahan) / 86400000) + ' HST sejak pindah (stagnasi sudah berlalu).'
                ]
            },
            {
                nama: 'Insektisida I — Fase Vegetatif', ikon: '💊',
                deskripsi: 'Pengendalian WBC, Penggerek Batang, Sundep',
                tglMulai: tglI1, tglSelesai: tambahHariFix(tglI1, 2),
                risiko: risikoInsektisida(sk(tglI1), hariFaseBulan(tglI1)),
                tips: [
                    'Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                    'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.'
                ]
            },
            {
                nama: 'Pupuk Susulan I — Tahap II', ikon: '🧪',
                deskripsi: 'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHariFix(tglP2, 2),
                risiko: risikoPupuk(sk(tglP2)),
                tips: [
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                    'Cek warna daun dengan BWD — skala 3+ tahan Urea.'
                ]
            },
            {
                nama: 'Pupuk Susulan II — Tahap III', ikon: '🧪',
                deskripsi: 'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: tambahHariFix(tglP3, 2),
                risiko: risikoPupuk(sk(tglP3)),
                tips: [
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.'
                ]
            },
            {
                nama: 'Insektisida II — Fase Generatif', ikon: '💊',
                deskripsi: 'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHariFix(tglI2, 2),
                risiko: risikoInsektisida(sk(tglI2), hariFaseBulan(tglI2)),
                tips: [
                    'Semprot pagi hari saat walang sangit masih di tanaman.',
                    'Bahan aktif kontak: Malathion, Deltametrin.'
                ]
            },
            {
                nama: 'Fungisida Blast — Fase Bunting', ikon: '🍄',
                deskripsi: 'Preventif Blast Leher Malai — semprot 5–7 hari sebelum malai keluar',
                tglMulai: tglFung, tglSelesai: tambahHariFix(tglFung, 2),
                risiko: risikoFungisida(sk(tglFung)),
                tips: [
                    'Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                    'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.'
                ]
            },
            {
                nama: '🌟 PANEN — Serentak Tapin & Tabela', ikon: '🌾',
                deskripsi: 'Potong saat kadar air gabah 20–25% — panen BERSAMAAN Tapin & Tabela',
                tglMulai: tglPanen,
                tglSelesai: tambahHariFix(tglPanen, 5),
                risiko: risikoPanen(sk(tglPanen)),
                tips: [
                    isTabela
                        ? 'Tabela: ' + umurTotal + ' hari sejak sebar = ' + formatTglLengkapFix(tglPanen)
                        : 'Tapin: ' + (umurTotal + OFFSET_STAGNASI_HARI) + ' hari sejak pindah tanam = ' + formatTglLengkapFix(tglPanen),
                    '✅ Tapin & Tabela di hamparan ini PANEN BERSAMAAN — koordinasi combine harvester lebih efisien dan hemat biaya.',
                    'Pesan combine 14 hari sebelum taksiran panen.',
                    'Panen saat 90–95% gabah kuning keemasan (kadar air ±20–25%).'
                ]
            }
        ];

        /* Urutkan berdasarkan tanggal mulai */
        daftar.sort(function(a, b) { return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    };

    /* ============================================================
       INJECT: override bangunKegiatan di scope global
       patch_jadwal_tanam_otomatis.js memakai bangunKegiatan()
       secara lokal (private IIFE), tapi memanggil prosesJadwalOtomatis
       yang ada di window. Kita override prosesJadwalOtomatis agar
       memakai bangunKegiatanFix() saat merakit multiJadwal.
    ============================================================ */
    window._bangunKegiatanFix = bangunKegiatanFix;

    var _prosesAsli = window.prosesJadwalOtomatis;

    /**
     * Override prosesJadwalOtomatis:
     * Kita intercept dengan cara memonitor window._jtoData.
     * Setelah fungsi asli selesai, timpa setiap jadwal.kegiatan
     * dengan hasil bangunKegiatanFix() menggunakan data yang sama.
     *
     * Pendekatan ini TIDAK membutuhkan akses ke variabel privat
     * di dalam IIFE patch_jadwal_tanam_otomatis.js.
     */
    if (typeof _prosesAsli === 'function') {

        /**
         * Cara kerja override:
         *  1. Panggil fungsi asli (ia akan mengisi window._jtoData & merender HTML)
         *  2. Setelah selesai, ambil window._jtoData
         *  3. Hitung ulang kegiatan untuk setiap musim dengan bangunKegiatanFix()
         *  4. Timpa window._jtoData dan re-render hanya bagian kartu kegiatan
         *
         * Ini menghindari harus me-refactor seluruh prosesJadwalOtomatis.
         */
        window.prosesJadwalOtomatis = async function() {
            // Jalankan fungsi asli terlebih dahulu
            await _prosesAsli.apply(this, arguments);

            // Ambil data & metode yang sudah dihitung
            var multiJadwal = window._jtoData;
            var metodeTanam = window._jtoMetodeTanam || 'tapin';
            var teksEl      = document.getElementById('jtoTeks');

            if (!multiJadwal || !multiJadwal.length || !teksEl) return;

            // Hitung ulang kegiatan dengan logika yang benar
            multiJadwal.forEach(function(jadwal) {
                // Ambil skorBulan dari rekomendasinya (disimpan oleh engine)
                // Jika tidak ada, gunakan array 50 (netral)
                var skorBulan = jadwal._skorBulan || new Array(12).fill(50);
                jadwal.kegiatan = bangunKegiatanFix(jadwal.rekomendasi, skorBulan, metodeTanam);
            });

            // Simpan kembali
            window._jtoData = multiJadwal;

            // Re-render kartu kegiatan di dalam teksEl
            // Gunakan renderKartu dari patch asli (sudah ada di window._jtoToggle)
            var renderKartu = window._renderKartuFn;
            if (typeof renderKartu !== 'function') {
                console.warn('[TabepiTapinFix] renderKartu tidak tersedia — re-render manual.');
                _rerenderManual(multiJadwal, teksEl, metodeTanam);
                return;
            }

            multiJadwal.forEach(function(jadwal, musimIdx) {
                // Cari semua kontainer kartu kegiatan musim ini
                // Kegiatan dirender dalam div dengan class jto-musim-N
                var containerKartu = teksEl.querySelectorAll(
                    '.jto-musim-' + musimIdx + ' .jto-kegiatan'
                );
                if (!containerKartu.length) return;
                var html = jadwal.kegiatan.map(function(k, i) {
                    return renderKartu(k, i + 1, jadwal.rekomendasi.isLewat);
                }).join('');
                containerKartu.forEach(function(el) { el.innerHTML = html; });
            });

            console.log(
                '%c✅ [TapinTabelaFix] Kegiatan dihitung ulang — ' +
                (metodeTanam === 'tapin'
                    ? 'Tapin masuk lahan ' + OFFSET_STAGNASI_HARI + ' hari lebih awal, panen serentak'
                    : 'Tabela: jadwal standar'),
                'color:#10b981; font-weight:bold;'
            );
        };
    }

    /* ============================================================
       FALLBACK: re-render manual jika renderKartu tidak tersedia
       Menggunakan HTML sederhana yang tetap informatif
    ============================================================ */
    function _rerenderManual(multiJadwal, teksEl, metodeTanam) {
        var containerUtama = teksEl.querySelector('[data-jto-kegiatan-container]');
        if (!containerUtama) {
            // Coba cari semua div kegiatan berdasarkan struktur HTML render asli
            // dan update teks tanggal di dalamnya
            _updateTanggalDiDOM(multiJadwal, teksEl);
            return;
        }
    }

    /**
     * _updateTanggalDiDOM:
     * Jika struktur DOM tidak bisa di-query dengan selector tertentu,
     * pendekatan terakhir: re-render seluruh isi #jtoTeks
     * dengan template minimal yang menampilkan tanggal yang benar.
     */
    function _updateTanggalDiDOM(multiJadwal, teksEl) {
        if (!teksEl) return;

        var warna = '#3b82f6';
        var metodeTanam = window._jtoMetodeTanam || 'tapin';

        var htmlAkhir = '';

        multiJadwal.forEach(function(jadwal) {
            var rek = jadwal.rekomendasi;
            var keg = jadwal.kegiatan;

            var opacityMusim = rek.isLewat ? '0.55' : '1';

            var badgeMusim = rek.isLewat
                ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;">📋 Blueprint</span>'
                : rek.isBerjalan
                    ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);margin-left:10px;">🟢 Aktif</span>'
                    : '';

            htmlAkhir +=
                '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;' +
                'border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacityMusim + ';">' +
                '🌾 ' + rek.musimNama.toUpperCase() + badgeMusim + '</div>';

            // Ringkasan rekomendasi
            htmlAkhir +=
                '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;' +
                'padding:12px;margin-bottom:12px;opacity:' + opacityMusim + ';">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Masuk Lahan</span><br>' +
                '<strong style="color:#10b981;font-size:13px;">' + formatTglLengkapFix(rek.tglTanam) + '</strong></div>' +
                '<div><span style="color:#64748b;">Varietas</span><br>' +
                '<strong style="color:#fff;font-size:13px;">' + (rek.labelVar || '-') + '</strong></div>' +
                '</div>' +
                '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);' +
                'font-size:11px;color:#94a3b8;line-height:1.5;">💡 ' + rek.alasan + '</div>' +
                '</div>';

            // Kartu kegiatan
            keg.forEach(function(k, i) {
                var now      = new Date();
                var kegLewat = rek.isLewat || k.tglSelesai < now;
                var w        = kegLewat ? '#64748b' : (k.risiko && k.risiko.warna ? k.risiko.warna : '#10b981');
                var fb       = (typeof namaFaseBulan === 'function') ? namaFaseBulan(
                    (typeof hariFaseBulan === 'function') ? hariFaseBulan(k.tglMulai) : 15
                ) : { nama: '', ikon: '🌕' };

                var badgeKeg = kegLewat
                    ? '<span style="font-size:10px;padding:3px 8px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;white-space:nowrap;">📋 Referensi</span>'
                    : '<span style="font-size:10px;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';white-space:nowrap;">' + (k.risiko && k.risiko.level ? k.risiko.level : 'OK') + '</span>';

                var tipsHTML = (k.tips || []).map(function(t) {
                    return '<li style="margin-bottom:5px;color:' + (kegLewat ? '#475569' : '#cbd5e1') + ';line-height:1.5;">' + t + '</li>';
                }).join('');

                htmlAkhir +=
                    '<div style="background:#1b273a;border:0.5px solid rgba(255,255,255,0.07);border-radius:16px;' +
                    'margin-bottom:9px;overflow:hidden;">' +
                    '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;' +
                    'border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">' +
                    '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;' +
                    'align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
                    '<div><div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:1px;">Kegiatan ' + (i + 1) + '</div>' +
                    '<div style="font-size:14px;font-weight:700;color:' + (kegLewat ? '#64748b' : '#fff') + ';">' + k.nama + '</div></div>' +
                    badgeKeg + '</div>' +
                    '<div style="font-size:12px;color:#94a3b8;margin-top:3px;">' +
                    '<strong style="color:' + (kegLewat ? '#475569' : '#e2e8f0') + ';">' + formatTglLengkapFix(k.tglMulai) + '</strong>' +
                    ' s/d ' + formatTglPendekFix(k.tglSelesai) + '</div>' +
                    '<div style="font-size:11px;color:#64748b;margin-top:2px;">' +
                    fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + (k.deskripsi || '') + '</div>' +
                    '</div>' +
                    '<span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>' +
                    '</div>' +
                    '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">' +
                    '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin-top:10px;margin-bottom:10px;' +
                    'border-left:3px solid ' + w + ';">' +
                    '<div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan Kondisi Iklim</div>' +
                    '<div style="font-size:12px;color:#cbd5e1;">' + (k.risiko && k.risiko.catatan ? k.risiko.catatan : '') + '</div>' +
                    '</div>' +
                    '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
                    '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tipsHTML + '</ul>' +
                    '</div>' +
                    '</div>';
            });
        });

        // Tambahkan tombol WA dan disclaimer di akhir
        htmlAkhir +=
            '<div style="margin-top:16px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;' +
            'font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Rekomendasi 2 musim di atas terdeteksi otomatis dari pemindaian DATA MENTAH (mm) ZOM lokal. ' +
            'Sesuaikan dengan kondisi lapangan, ketersediaan air, dan pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG, siklus sinodis bulan.' +
            '</div>' +
            '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;' +
            'background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;' +
            'font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>';

        teksEl.innerHTML = htmlAkhir;
    }

    /* ============================================================
       SIMPAN REFERENCE FUNGSI RISIKO KE WINDOW
       agar bangunKegiatanFix bisa mengaksesnya.
       Fungsi-fungsi ini sudah ada di patch_jadwal_tanam_otomatis.js
       tapi bersifat private (IIFE). Kita buat versi publik di sini
       sebagai fallback yang solid.
    ============================================================ */
    if (!window._risikoOlahFn) {
        window._risikoOlahFn = function(s) {
            if (s < 25) return { level:'Kering', catatan:'Siapkan pompanisasi awal sebelum bajak.', warna:'#ef4444' };
            if (s > 80) return { level:'Sangat Basah', catatan:'Tunggu lahan bisa diluku — hindari traktor amblas.', warna:'#3b82f6' };
            return              { level:'Baik', catatan:'Kondisi optimal untuk bajak dan garu.', warna:'#10b981' };
        };
    }
    if (!window._risikoBenihFn) {
        window._risikoBenihFn = function(s) {
            if (s > 75) return { level:'Waspada', catatan:'Buat drainase bedeng persemaian — cegah rebah semai.', warna:'#f59e0b' };
            if (s < 25) return { level:'Siram Rutin', catatan:'Siram pagi & sore untuk jaga kelembapan media semai.', warna:'#f59e0b' };
            return              { level:'Optimal', catatan:'Cuaca mendukung perkecambahan benih.', warna:'#10b981' };
        };
    }
    if (!window._risikoTanamFn) {
        window._risikoTanamFn = function(s) {
            if (s > 80) return { level:'Genangan', catatan:'Siapkan pompa — jaga kedalaman air 2–3 cm saja.', warna:'#f59e0b' };
            if (s < 20) return { level:'Kering Kritis', catatan:'Tunda atau siapkan pompanisasi penuh.', warna:'#ef4444' };
            return              { level:'Baik', catatan:'Kondisi air mendukung penanaman.', warna:'#10b981' };
        };
    }
    if (!window._risikoTikusFn) {
        window._risikoTikusFn = function(f) {
            if (f < 4 || f > 25) return { level:'Optimal', catatan:'Malam gelap — umpan antikoagulan maksimal efektif.', warna:'#10b981' };
            return                       { level:'Kurang Optimal', catatan:'Bulan bercahaya — tetap pasang TBS & gropyokan.', warna:'#f59e0b' };
        };
    }
    if (!window._risikoPupukFn) {
        window._risikoPupukFn = function(s) {
            if (s > 75) return { level:'Risiko Tercuci', catatan:'Hindari hari hujan — pupuk 1–2 hari sebelum hujan ringan.', warna:'#f59e0b' };
            if (s < 20) return { level:'Tanah Kering', catatan:'Pastikan ada air di petakan sebelum tabur pupuk.', warna:'#ef4444' };
            return              { level:'Optimal', catatan:'Cuaca mendukung serapan pupuk.', warna:'#10b981' };
        };
    }
    if (!window._risikoInsektisidaFn) {
        window._risikoInsektisidaFn = function(s, f) {
            var level = 'Baik', warna = '#10b981', catatan = '';
            if (s > 75) { catatan = 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
            if (f >= 13 && f <= 17) {
                catatan += 'Puncak penerbangan ngengat PBP — pasang lampu perangkap.';
                warna = '#ef4444'; level = 'Waspada';
            } else {
                catatan += 'Waktu aplikasi aman dari puncak ngengat.';
            }
            return { level: level, catatan: catatan.trim(), warna: warna };
        };
    }
    if (!window._risikoFungisidaFn) {
        window._risikoFungisidaFn = function(s) {
            if (s > 65) return { level:'Kritis Blast', catatan:'Cuaca lembap — semprot Tricyclazole 7 hari sebelum bunting.', warna:'#ef4444' };
            if (s > 45) return { level:'Waspada', catatan:'Pantau bercak belah ketupat — semprot preventif.', warna:'#f59e0b' };
            return              { level:'Aman', catatan:'Risiko blast rendah — cukup monitoring rutin.', warna:'#10b981' };
        };
    }
    if (!window._risikoPanenFn) {
        window._risikoPanenFn = function(s) {
            if (s > 75) return { level:'Sulit Kering', catatan:'Siapkan dryer — jangan tumpuk gabah lembap.', warna:'#ef4444' };
            if (s > 55) return { level:'Waspada Hujan', catatan:'Panen pagi hari — hindari sore hujan.', warna:'#f59e0b' };
            if (s < 20) return { level:'Kering Ideal', catatan:'Kondisi sempurna — pesan combine 14 hari sebelumnya.', warna:'#10b981' };
            return              { level:'Baik', catatan:'Koordinasikan combine harvester.', warna:'#10b981' };
        };
    }

    /* ============================================================
       KONFIRMASI
    ============================================================ */
    console.log(
        '%c✅ patch_jadwal_tapin_tabela_fix.js v1.0 aktif\n' +
        '\n  ╔══ LOGIKA TAPIN vs TABELA DIKOREKSI ═══════╗\n' +
        '  ║ ✅ Pengolahan lahan  : Tapin = Tabela (sama) \n' +
        '  ║ ✅ Tapin masuk lahan : ' + OFFSET_STAGNASI_HARI + ' hari lebih awal       \n' +
        '  ║ ✅ Semai Tapin       : dimajukan umurBibit + ' + OFFSET_STAGNASI_HARI + ' hari \n' +
        '  ║ ✅ Panen             : Tapin = Tabela (sama) \n' +
        '  ║ 📚 Sumber: IRRI Rice Knowledge Bank;         \n' +
        '  ║            BB Padi (2018) Sulsel             \n' +
        '  ╚═══════════════════════════════════════════╝',
        'color:#10b981; font-weight:bold;'
    );

})();
