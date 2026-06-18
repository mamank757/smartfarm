/**
 * ============================================================
 *  patch_jadwal_tapin_tabela_fix.js
 *  Versi: 2.0 — Koreksi Agronomis Tapin vs Tabela
 * ------------------------------------------------------------
 *
 *  LOGIKA YANG BENAR:
 *
 *  Tabela tidak mengalami stagnasi transplanting, sehingga
 *  tumbuh lebih efisien dari hari pertama. Tapin mengalami
 *  stagnasi 7–10 hari setelah dicabut & dipindah, sehingga
 *  harus DITANAM LEBIH DULU agar panen bersamaan.
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  TAPIN (ditanam lebih dulu):                           │
 *  │    tglOlahTanah   = tglTapin - 25                      │
 *  │    tglMulaiSemai  = tglTapin - umurBibit               │
 *  │    tglPindahLahan = tglTapin          ← LEBIH DULU     │
 *  │    tglPanen       = tglTapin + umurTotal + OFFSET      │
 *  │                                                         │
 *  │  TABELA (ditanam belakangan):                          │
 *  │    tglOlahTanah   = tglTapin - 25    ← SAMA            │
 *  │    tglSebarLahan  = tglTapin + OFFSET ← LEBIH LAMBAT  │
 *  │    tglPanen       = tglTapin + umurTotal + OFFSET      │
 *  │                   = tglTabela + umurTotal  ← SAMA ✅   │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  ENGINE menghasilkan tglTanam = tanggal TAPIN masuk lahan.
 *  Tabela sebar = tglTapin + OFFSET_STAGNASI_HARI.
 *  Panen keduanya = tglTapin + umurTotal + OFFSET = tglTabela + umurTotal.
 *
 *  OFFSET_STAGNASI_HARI = 8 (titik tengah 7–10 hari)
 *  Sumber: IRRI Rice Knowledge Bank; BB Padi (2018) Sulsel.
 *
 *  CARA PASANG — letakkan PALING TERAKHIR:
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *    <script src="patch_jadwal_manual_trigger.js"></script>
 *    <script src="patch_jadwal_tapin_tabela_fix.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    /* ============================================================
       KONSTANTA
    ============================================================ */

    /**
     * OFFSET_STAGNASI_HARI:
     * Berapa hari Tapin harus MENDAHULUI Tabela agar panen bersamaan.
     *
     * Tabela tidak mengalami stagnasi transplanting → tumbuh sejak
     * hari pertama sebar. Tapin mengalami stagnasi 7–10 hari setelah
     * dicabut dari persemaian. Untuk menyamakan waktu panen:
     *   tglTabela sebar = tglTapin masuk lahan + OFFSET
     *
     * Nilai 8 = titik tengah 7–10 hari (BB Padi 2018 Sulsel).
     */
    var OFFSET_STAGNASI_HARI = 8;

    var TABEL_VARIETAS_FIX = {
        genjah: { umurTotal: 90,  umurBibit: 14 },
        sedang: { umurTotal: 110, umurBibit: 21 },
        dalam:  { umurTotal: 125, umurBibit: 28 }
    };

    /* ============================================================
       UTILITAS TANGGAL
    ============================================================ */
    function H(d, n) {
        var r = new Date(d);
        r.setDate(r.getDate() + n);
        return r;
    }

    var NH = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NB = ['Januari','Februari','Maret','April','Mei','Juni',
              'Juli','Agustus','September','Oktober','November','Desember'];
    var NBS = ['Jan','Feb','Mar','Apr','Mei','Jun',
               'Jul','Agu','Sep','Okt','Nov','Des'];

    function fmtL(d) {
        return NH[d.getDay()] + ', ' + d.getDate() + ' ' + NB[d.getMonth()] + ' ' + d.getFullYear();
    }
    function fmtP(d) {
        return d.getDate() + ' ' + NBS[d.getMonth()] + ' ' + d.getFullYear();
    }
    function sk(skorBulan, tgl) {
        return (skorBulan && typeof skorBulan[tgl.getMonth()] === 'number')
            ? skorBulan[tgl.getMonth()] : 50;
    }

    /* ============================================================
       FUNGSI RISIKO (fallback mandiri)
    ============================================================ */
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
       FUNGSI UTAMA: bangunKegiatanFix
    ============================================================ */
    function bangunKegiatanFix(rek, skorBulan, metodeTanam) {
        var isTabela  = (metodeTanam === 'tabela');
        var varietas  = rek.varietas || 'sedang';
        var vParam    = TABEL_VARIETAS_FIX[varietas] || TABEL_VARIETAS_FIX.sedang;
        var umurTotal = vParam.umurTotal;
        var umurBibit = vParam.umurBibit;

        /**
         * tglTapin = tanggal TAPIN masuk lahan (dari engine).
         *
         * Dari sinilah semua tanggal diturunkan:
         *
         *   Tapin masuk lahan  = tglTapin
         *   Tabela sebar       = tglTapin + OFFSET    ← lebih lambat
         *   Panen keduanya     = tglTapin + umurTotal + OFFSET
         *                      = tglTabela sebar + umurTotal  ✅
         *
         * Pengolahan lahan SAMA untuk keduanya karena dilakukan
         * sebelum tapin masuk (belum ada tanaman di lahan).
         */
        var tglTapin  = rek.tglTanam;
        var tglTabela = H(tglTapin, OFFSET_STAGNASI_HARI);
        var tglPanen  = H(tglTapin, umurTotal + OFFSET_STAGNASI_HARI);

        // Verifikasi: tglPanen = tglTabela + umurTotal ✅
        // H(tglTapin, OFF) + umurTotal = tglTapin + OFF + umurTotal ✓

        /* ── Pengolahan lahan: berdasarkan tglTapin (lebih awal) ─── */
        var tglOlah = rek.tglOlahTanah
            ? rek.tglOlahTanah
            : H(tglTapin, -25);

        /* ── Tanggal benih ─────────────────────────────────────────
           Tapin:  mulai semai = tglTapin - umurBibit
           Tabela: rendam benih 2 hari sebelum sebar ke lahan
        ── */
        var tglBenih = isTabela
            ? H(tglTabela, -2)
            : H(tglTapin, -umurBibit);

        /* ── Tanggal masuk lahan utama ──────────────────────────── */
        var tglMasukLahan = isTabela ? tglTabela : tglTapin;

        /* ── Kegiatan pasca masuk lahan ─────────────────────────── */
        var tglP1   = H(tglMasukLahan,  7);
        var tglP2   = H(tglMasukLahan, isTabela ? 28 : 30);
        var tglP3   = H(tglMasukLahan, isTabela ? 45 : 55);
        var tglI1   = H(tglMasukLahan, isTabela ? 20 : 25);
        var tglI2   = H(tglMasukLahan, isTabela ? 45 : 55);
        var tglFung = H(tglMasukLahan, isTabela ? 55 : 65);

        /* ── Jadwal tikus (gropyok & sanitasi → acuan tglOlah) ─── */
        var jt          = rek.jadwalTikus;
        var tglGroyokM  = jt ? jt.gropyokan.tglMulai          : H(tglOlah, -14);
        var tglGroyokS  = jt ? jt.sanitasiPematang.tglSelesai : H(tglOlah, -1);
        var tglTBSM     = jt ? jt.pasangTBS.tglMulai          : tglMasukLahan;
        var tglTBSS     = jt ? jt.monitorTBS.tglSelesai       : H(tglMasukLahan, 30);
        var tglRacunM   = jt ? jt.umpanRacun.tglMulai         : H(tglMasukLahan, 1);
        var tglRacunS   = jt ? jt.umpanRacun.tglSelesai       : H(tglMasukLahan, 21);

        /* ── Geser insektisida jika bertepatan bulan penuh ───────── */
        var f1 = getFaseBulan(tglI1);
        var f2 = getFaseBulan(tglI2);
        if (f1 >= 13.5 && f1 <= 16.5) tglI1 = H(tglI1, 5);
        if (f2 >= 13.5 && f2 <= 16.5) tglI2 = H(tglI2, 5);

        /* ── Kartu Benih ────────────────────────────────────────── */
        var kartuBenih = isTabela ? {
            nama: 'Rendam & Peram Benih — Tabela', ikon: '💧',
            deskripsi: 'Rendam 24 jam, peram 24 jam sebelum sebar',
            tglMulai: tglBenih, tglSelesai: tglTabela,
            risiko: rBenih(sk(skorBulan, tglBenih)),
            tips: [
                'Rendam benih 24 jam, peram (karung lembap) ±24 jam hingga kecambah ±1–2 mm.',
                'Dosis benih Tabela: 50–60 kg/ha (drum seeder) atau hingga 100 kg/ha (sebar manual).',
                '⏰ Tabela sebar ' + OFFSET_STAGNASI_HARI + ' hari SETELAH Tapin masuk lahan agar panen serentak.'
            ]
        } : {
            nama: 'Pembibitan Benih — Persemaian Tapin', ikon: '🌱',
            deskripsi: 'Semai benih ' + umurBibit + ' hari sebelum pindah tanam',
            tglMulai: tglBenih, tglSelesai: H(tglBenih, 7),
            risiko: rBenih(sk(skorBulan, tglBenih)),
            tips: [
                'Inkubasi lembap 48 jam hingga kecambah 2–3 mm, lalu semai di bedeng persemaian.',
                'Dosis semai Tapin: 25–35 kg/ha. Pindah tanam saat bibit umur ' + umurBibit + ' HSS.',
                '⏰ Tapin mulai semai lebih awal karena harus masuk lahan sebelum Tabela.'
            ]
        };

        /* ── Kartu Masuk Lahan ──────────────────────────────────── */
        var kartuMasuk = isTabela ? {
            nama: 'Sebar Benih ke Lahan — Tabela', ikon: '🌾',
            deskripsi: OFFSET_STAGNASI_HARI + ' hari setelah Tapin masuk lahan',
            tglMulai: tglTabela, tglSelesai: H(tglTabela, 1),
            risiko: rTanam(sk(skorBulan, tglTabela)),
            tips: [
                '⚡ Tabela sebar ' + OFFSET_STAGNASI_HARI + ' hari SETELAH Tapin pindah ke lahan.',
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
                'Alasan: setelah dicabut dari persemaian, tanaman mengalami stagnasi (tidak tumbuh) selama 7–10 hari ' +
                'karena stres adaptasi. Jika ditanam bersamaan Tabela, Tapin akan panen lebih lambat.',
                'Sumber: IRRI Rice Knowledge Bank; BB Padi (2018) Sulsel.',
                'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                'Target panen: ' + fmtL(tglPanen) + ' — SERENTAK dengan Tabela. ✅'
            ]
        };

        /* ── Susun daftar kegiatan ───────────────────────────────── */
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

        daftar.sort(function(a, b) { return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    }

    /* ============================================================
       OVERRIDE prosesJadwalOtomatis
       Setelah fungsi asli jalan (mengisi window._jtoData),
       hitung ulang semua kegiatan dengan bangunKegiatanFix().
    ============================================================ */
    var _prosesAsli = window.prosesJadwalOtomatis;

    if (typeof _prosesAsli === 'function') {
        window.prosesJadwalOtomatis = async function () {
            // Jalankan fungsi asli — menghasilkan window._jtoData & render HTML
            await _prosesAsli.apply(this, arguments);

            var multiJadwal = window._jtoData;
            var metodeTanam = window._jtoMetodeTanam || 'tapin';
            var teksEl      = document.getElementById('jtoTeks');

            if (!multiJadwal || !multiJadwal.length || !teksEl) return;

            // Hitung ulang kegiatan dengan logika yang benar
            multiJadwal.forEach(function (jadwal) {
                var skor = jadwal._skorBulan || new Array(12).fill(50);
                jadwal.kegiatan = bangunKegiatanFix(jadwal.rekomendasi, skor, metodeTanam);
            });

            window._jtoData = multiJadwal;

            // Re-render seluruh teksEl dengan HTML yang diperbarui
            rerenderJTO(multiJadwal, teksEl);

            console.log(
                '%c✅ [TapinTabelaFix v2.0] Jadwal dihitung ulang\n' +
                '   Tapin masuk lahan: ' + fmtP(multiJadwal[0] && multiJadwal[0].rekomendasi.tglTanam || new Date()) + '\n' +
                '   Tabela sebar     : ' + OFFSET_STAGNASI_HARI + ' hari kemudian\n' +
                '   Panen            : serentak ✅',
                'color:#10b981; font-weight:bold;'
            );
        };
    }

    /* ============================================================
       RENDER ULANG HTML
    ============================================================ */
    function rerenderJTO(multiJadwal, teksEl) {
        var warna = '#3b82f6';
        var metodeTanam = window._jtoMetodeTanam || 'tapin';
        var html = '';

        // Header info iklim (salin dari yang sudah ada di DOM jika bisa)
        var infoIklimEl = teksEl.querySelector('div[style*="rgba(6,182,212"]');
        if (infoIklimEl) {
            html += infoIklimEl.outerHTML;
        }

        multiJadwal.forEach(function (jadwal) {
            var rek = jadwal.rekomendasi;
            var keg = jadwal.kegiatan;
            var opacity = rek.isLewat ? '0.55' : '1';

            var badge = rek.isLewat
                ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;">📋 Blueprint</span>'
                : rek.isBerjalan
                    ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);margin-left:10px;animation:jto-aktif-blink 1.5s ease-in-out infinite;">🟢 Aktif</span>'
                    : '';

            html +=
                '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;' +
                'border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacity + ';">' +
                '🌾 ' + rek.musimNama.toUpperCase() + badge + '</div>';

            // Tentukan label tanggal masuk lahan sesuai metode
            var labelMasuk = (metodeTanam === 'tabela')
                ? fmtL(H(rek.tglTanam, OFFSET_STAGNASI_HARI))
                : fmtL(rek.tglTanam);
            var labelTabela = (metodeTanam === 'tapin')
                ? ' &nbsp;|&nbsp; <span style="color:#64748b;font-size:11px;">Tabela sebar: ' + fmtP(H(rek.tglTanam, OFFSET_STAGNASI_HARI)) + '</span>'
                : '';

            html +=
                '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;' +
                'padding:12px;margin-bottom:12px;opacity:' + opacity + ';">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Masuk Lahan' + (metodeTanam === 'tapin' ? ' (Tapin)' : ' (Tabela)') + '</span><br>' +
                '<strong style="color:#10b981;font-size:13px;">' + labelMasuk + '</strong>' + labelTabela + '</div>' +
                '<div><span style="color:#64748b;">Varietas</span><br>' +
                '<strong style="color:#fff;font-size:13px;">' + (rek.labelVar || '-') + '</strong></div>' +
                '</div>' +
                '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);' +
                'font-size:11px;color:#94a3b8;line-height:1.5;">💡 ' + rek.alasan + '</div>' +
                '</div>';

            // Kartu kegiatan
            keg.forEach(function (k, i) {
                html += buatKartuHTML(k, i + 1, rek.isLewat);
            });
        });

        html +=
            '<div style="margin-top:16px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;' +
            'font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Rekomendasi 2 musim terdeteksi otomatis dari ZOM lokal BMKG. ' +
            'Sesuaikan dengan kondisi lapangan dan pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG, siklus sinodis bulan.</div>' +
            '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;' +
            'background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;' +
            'font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>';

        teksEl.innerHTML = html;
    }

    function buatKartuHTML(k, nomor, isLewat) {
        var now     = new Date();
        var lewat   = isLewat || k.tglSelesai < now;
        var w       = lewat ? '#64748b' : (k.risiko && k.risiko.warna ? k.risiko.warna : '#10b981');
        var fb      = getNamaFase(getFaseBulan(k.tglMulai));

        var badge = lewat
            ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;white-space:nowrap;flex-shrink:0;">📋 Referensi</span>'
            : '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';white-space:nowrap;flex-shrink:0;">' + (k.risiko && k.risiko.level ? k.risiko.level : 'OK') + '</span>';

        var tipsHTML = (k.tips || []).map(function (t) {
            return '<li style="margin-bottom:5px;color:' + (lewat ? '#475569' : '#cbd5e1') + ';line-height:1.5;">' + t + '</li>';
        }).join('');

        var catatan = lewat
            ? '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin:10px 0;border-left:3px solid #334155;">' +
              '<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:2px;">📋 Data Proyeksi (Blueprint)</div>' +
              '<div style="font-size:12px;color:#475569;">Kegiatan ini sudah terlewati. Ditampilkan sebagai referensi proyeksi.</div></div>'
            : '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin:10px 0;border-left:3px solid ' + w + ';">' +
              '<div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan Kondisi Iklim</div>' +
              '<div style="font-size:12px;color:#cbd5e1;">' + (k.risiko && k.risiko.catatan ? k.risiko.catatan : '') + '</div></div>';

        return '<div style="background:#1b273a;border:0.5px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:9px;overflow:hidden;">' +
            '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
            '<div><div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:1px;">Kegiatan ' + nomor + '</div>' +
            '<div style="font-size:14px;font-weight:700;color:' + (lewat ? '#64748b' : '#fff') + ';">' + k.nama + '</div></div>' +
            badge + '</div>' +
            '<div style="font-size:12px;color:#94a3b8;margin-top:3px;">' +
            '<strong style="color:' + (lewat ? '#475569' : '#e2e8f0') + ';">' + fmtL(k.tglMulai) + '</strong>' +
            ' s/d ' + fmtP(k.tglSelesai) + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + (k.deskripsi || '') + '</div>' +
            '</div>' +
            '<span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>' +
            '</div>' +
            '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">' +
            catatan +
            '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
            '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tipsHTML + '</ul>' +
            '</div></div>';
    }

    /* ============================================================
       EKSPOR helper agar _jtoKirimWA tetap berfungsi
    ============================================================ */
    window._bangunKegiatanFix = bangunKegiatanFix;
    window._OFFSET_STAGNASI   = OFFSET_STAGNASI_HARI;

    /* ============================================================
       KONFIRMASI
    ============================================================ */
    console.log(
        '%c✅ patch_jadwal_tapin_tabela_fix.js v2.0 aktif\n' +
        '\n  ╔══ LOGIKA TAPIN vs TABELA DIKOREKSI ════════╗\n' +
        '  ║ ✅ Tapin masuk lahan  : LEBIH DULU          ║\n' +
        '  ║ ✅ Tabela sebar       : ' + OFFSET_STAGNASI_HARI + ' hari SETELAH Tapin  ║\n' +
        '  ║ ✅ Pengolahan lahan   : BERSAMAAN (sama)    ║\n' +
        '  ║ ✅ Panen              : BERSAMAAN (sama)    ║\n' +
        '  ║ 📚 IRRI Rice KB; BB Padi (2018) Sulsel      ║\n' +
        '  ╚════════════════════════════════════════════╝',
        'color:#10b981; font-weight:bold;'
    );

})();
