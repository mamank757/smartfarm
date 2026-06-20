/**
 * ============================================================
 *  PATCH PESTISIDA — Rotasi IRAC + Kalkulator Mixing (Oplos)
 *  Versi: 3.0 — TAMBAHAN: Cek kompatibilitas 2–4 bahan sekaligus
 * ------------------------------------------------------------
 *  WARISAN DARI v2.1 (tetap aktif, tidak diubah):
 *    [FIX KRITIS] switchMode tidak pernah dipanggil dengan mode
 *      dummy — mode 'rotasi'/'mixing' menyembunyikan box lain
 *      secara eksplisit, mode lain diteruskan apa adanya.
 *    [FIX] Guard idempotency — tidak inject dua kali.
 *
 *  BARU DI v3.0 — KALKULATOR MIXING:
 *    Tab baru "CEK CAMPURAN" terpisah dari "ROTASI RACUN".
 *    Petani memilih 2–4 bahan aktif yang HENDAK DICAMPUR dalam
 *    satu tangki semprot. Sistem mengecek dua jenis masalah:
 *
 *    (A) KESAMAAN GRUP IRAC
 *        Mencampur 2 bahan dari grup cara-kerja yang SAMA tidak
 *        meningkatkan efektivitas dan mempercepat resistensi
 *        hama (IRAC, "Mode of Action" rotation guidelines).
 *        → Ditandai per pasangan yang segrup.
 *
 *    (B) INKOMPATIBILITAS FISIK FORMULASI
 *        Berdasarkan kaidah umum kompatibilitas tangki semprot:
 *          - EC (Emulsifiable Concentrate) + WP (Wettable Powder)
 *            berisiko pecah emulsi / mengental jika dicampur
 *            tanpa jar test, terutama dalam air sadah.
 *          - Produk berbahan dasar BASA KUAT (mis. tembaga
 *            hidroksida, kapur/bordo) merusak/menonaktifkan
 *            piretroid (grup 3A) dan banyak insektisida lain
 *            yang stabil di pH asam–netral (alkaline hydrolysis).
 *          - Pupuk daun cair / mikro dengan pH tinggi yang
 *            dicampur bersama insektisida sensitif pH rendah
 *            juga berisiko serupa.
 *          - SC (Suspension Concentrate) + EC umumnya lebih
 *            aman tapi tetap disarankan jar test untuk volume
 *            besar.
 *        Sumber prinsip umum: panduan tank-mix compatibility
 *        IRAC & label kompatibilitas formulasi pestisida pada
 *        umumnya (EC/WP/SC/SG/SL/SP/GR + pH stabil bahan aktif).
 *        ⚠️ Data pH & kelas formulasi pada database ini adalah
 *        ESTIMASI UMUM PER GOLONGAN KIMIA, BUKAN data resmi per
 *        merek dagang. SELALU cek label produk & lakukan jar
 *        test (campur skala kecil, diamkan 15–30 menit, amati
 *        endapan/pemisahan) sebelum aplikasi skala penuh.
 *
 *    SIKAP KALKULATOR: SOFT WARNING.
 *      Hasil SELALU ditampilkan (tidak diblokir), tapi setiap
 *      masalah diberi level (🔴 Kritis / 🟡 Waspada / 🟢 Aman)
 *      disertai saran konkret (pisahkan aplikasi, urutan tangki,
 *      jar test, dsb). Keputusan akhir tetap di tangan petani/PPL.
 *
 *  CARA PASANG: sama seperti v2.1, letakkan SETELAH patch-patch
 *  lain yang memanipulasi switchMode.
 * ============================================================
 */

(function () {
    'use strict';

    /* ── GUARD IDEMPOTENCY ── */
    if (document.getElementById('tabRotasi')) {
        console.warn('[patch_pestisida] #tabRotasi sudah ada — patch dibatalkan (sudah ter-inject sebelumnya).');
        return;
    }

    // ==========================================
    // 1. DATABASE PESTISIDA — DITAMBAH formulasi & pH
    // ==========================================
    /*
     * formulasi : kode umum (EC, WP, SC, SG, SL, SP, GR)
     * phStabil  : rentang pH dimana bahan aktif relatif stabil
     *             (estimasi golongan kimia umum — bukan data lab
     *             per merek). null jika tidak relevan/tidak cukup
     *             data publik untuk diestimasi dengan wajar.
     * basaKuat  : true jika produk ini sendiri bersifat basa kuat
     *             (mis. tembaga hidroksida, kapur) — risiko utama
     *             saat dicampur dengan bahan lain yang pH-sensitif.
     */
    var databasePestisida = [
        // --- GRUP 1: PENGHAMBAT ASETILKOLINESTERASE (SARAF) ---
        { id: 1,  bahanAktif: "Metomil",               merekPopuler: "Lannate 25 WP",      grupIrac: "1A", formulasi: "WP", phStabil: [5, 7],  basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Penggerek Polong"] },
        { id: 2,  bahanAktif: "Karbofuran",             merekPopuler: "Furadan 3 GR",       grupIrac: "1A", formulasi: "GR", phStabil: [5, 7],  basaKuat: false, targetHama: ["Penggerek Batang Padi", "Nematoda", "Ulat Tanah", "Orong-orong"] },
        { id: 3,  bahanAktif: "BPMC (Fenobukarb)",      merekPopuler: "Bassa 50 EC",        grupIrac: "1A", formulasi: "EC", phStabil: [5, 7],  basaKuat: false, targetHama: ["Wereng Coklat", "Walang Sangit", "Kepik Hijau"] },
        { id: 4,  bahanAktif: "Klorpirifos",            merekPopuler: "Dursban 200 EC",     grupIrac: "1B", formulasi: "EC", phStabil: [4, 7],  basaKuat: false, targetHama: ["Kutu Putih", "Ulat Grayak", "Wereng Coklat", "Semut"] },
        { id: 5,  bahanAktif: "Profenofos",             merekPopuler: "Curacron 500 EC",    grupIrac: "1B", formulasi: "EC", phStabil: [4, 7],  basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Kutu Kebul"] },
        { id: 6,  bahanAktif: "Dimetoat",               merekPopuler: "Perfekthion 400 EC", grupIrac: "1B", formulasi: "EC", phStabil: [5, 7],  basaKuat: false, targetHama: ["Kutu Daun", "Thrips", "Lalat Buah"] },

        // --- GRUP 2: PEMBLOKIR SALURAN KLORIDA (SARAF) ---
        { id: 7,  bahanAktif: "Fipronil",               merekPopuler: "Regent 50 SC",       grupIrac: "2B", formulasi: "SC", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Penggerek Batang Padi", "Orong-orong", "Rayap"] },

        // --- GRUP 3: MODULATOR SALURAN NATRIUM (SARAF - KNOCKDOWN) ---
        { id: 8,  bahanAktif: "Sipermetrin",            merekPopuler: "Ripcord 50 EC",      grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5],basaKuat: false, targetHama: ["Ulat Grayak", "Wereng Coklat", "Walang Sangit"] },
        { id: 9,  bahanAktif: "Deltametrin",            merekPopuler: "Decis 25 EC",        grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5],basaKuat: false, targetHama: ["Ulat Grayak", "Walang Sangit", "Kutu Daun", "Kepik"] },
        { id: 10, bahanAktif: "Lamda-Sihalotrin",       merekPopuler: "Matador 25 EC",      grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5],basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Lalat Buah", "Kutu Kebul"] },
        { id: 11, bahanAktif: "Alfametrin",             merekPopuler: "Fastac 15 EC",       grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5],basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Penghisap Buah"] },

        // --- GRUP 4: ANTAGONIS RESEPTOR ASETILKOLIN (SARAF - SISTEMIK) ---
        { id: 12, bahanAktif: "Imidakloprid",           merekPopuler: "Confidor 5 WP",      grupIrac: "4A", formulasi: "WP", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips", "Kutu Daun"] },
        { id: 13, bahanAktif: "Tiametoksam",            merekPopuler: "Actara 25 WG",       grupIrac: "4A", formulasi: "SG", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips"] },
        { id: 14, bahanAktif: "Dinotefuran",            merekPopuler: "Oshin 20 WP",        grupIrac: "4A", formulasi: "WP", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kepik Hijau"] },
        { id: 15, bahanAktif: "Nitenpiram",             merekPopuler: "Tenchu 20 SG",       grupIrac: "4A", formulasi: "SG", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Wereng Punggung Putih"] },

        // --- GRUP 5: MODULATOR RESEPTOR ASETILKOLIN ALOSTERIK (SARAF) ---
        { id: 16, bahanAktif: "Spinosad",               merekPopuler: "Tracer 120 SC",      grupIrac: "5",  formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips"] },
        { id: 17, bahanAktif: "Spinetoram",             merekPopuler: "Endure 120 SC",      grupIrac: "5",  formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips", "Ulat Kubis"] },

        // --- GRUP 6: AKTIVATOR SALURAN KLORIDA (PELUMPUH OTOT/SARAF) ---
        { id: 18, bahanAktif: "Abamektin",              merekPopuler: "Demolish 18 EC",     grupIrac: "6",  formulasi: "EC", phStabil: [5, 7],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Tungau", "Thrips"] },
        { id: 19, bahanAktif: "Emamektin Benzoat",      merekPopuler: "Proclaim 5 SG",      grupIrac: "6",  formulasi: "SG", phStabil: [5, 7],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Ulat Pelipat Daun"] },

        // --- GRUP 9: PENGHAMBAT MAKAN HOMOPTERA (MODULATOR CHORDOTONAL) ---
        { id: 20, bahanAktif: "Pimetrozin",             merekPopuler: "Chess 50 WG",        grupIrac: "9B", formulasi: "SG", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kutu Daun"] },

        // --- GRUP 10: PENGHAMBAT PERTUMBUHAN TUNGAU ---
        { id: 21, bahanAktif: "Heksitiazoks",           merekPopuler: "Nissorun 50 EC",     grupIrac: "10A",formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Tungau Merah", "Tungau Kuning"] },

        // --- GRUP 11: MIKROBA PATOGEN (BIOLOGIS) ---
        { id: 22, bahanAktif: "Bacillus thuringiensis", merekPopuler: "Turex 50 WP",        grupIrac: "11A",formulasi: "WP", phStabil: [6, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"] },

        // --- GRUP 12: PENGHAMBAT SINTESIS ATP (ENZIM PERNAPASAN) ---
        { id: 23, bahanAktif: "Diafentiuron",           merekPopuler: "Pegasus 500 SC",     grupIrac: "12A",formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Kutu Kebul", "Thrips", "Tungau", "Kutu Daun"] },

        // --- GRUP 13: PELEPAS FOSFORILASI OKSIDATIF (GANGGUAN SEL) ---
        { id: 24, bahanAktif: "Klorfenapir",            merekPopuler: "Arjuna 200 EC",      grupIrac: "13", formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Thrips", "Kutu Daun", "Tungau"] },

        // --- GRUP 14: PEMBLOKIR SALURAN RESEPTOR ASETILKOLIN (SARAF PUSAT) ---
        { id: 25, bahanAktif: "Dimehipo",               merekPopuler: "Spontan 400 SL",     grupIrac: "14", formulasi: "SL", phStabil: [5, 8],  basaKuat: false, targetHama: ["Penggerek Batang Padi", "Wereng Coklat", "Ulat Pelipat Daun", "Lalat Bibit"] },
        { id: 26, bahanAktif: "Kartap Hidroklorida",    merekPopuler: "Padan 50 SP",        grupIrac: "14", formulasi: "SP", phStabil: [5, 7],  basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Pelipat Daun", "Wereng Coklat"] },

        // --- GRUP 15: PENGHAMBAT BIOSINTESIS KITIN TIPE 0 (IGR - KULIT) ---
        { id: 27, bahanAktif: "Lufenuron",              merekPopuler: "Match 50 EC",        grupIrac: "15", formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Kubis"] },
        { id: 28, bahanAktif: "Klorfluazuron",          merekPopuler: "Atabron 50 EC",      grupIrac: "15", formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Polong"] },
        { id: 29, bahanAktif: "Novaluron",              merekPopuler: "Rimon 100 EC",       grupIrac: "15", formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Pelipat Daun", "Penggorok Daun"] },

        // --- GRUP 16: PENGHAMBAT BIOSINTESIS KITIN TIPE 1 (IGR - HOMOPTERA) ---
        { id: 30, bahanAktif: "Buprofezin",             merekPopuler: "Applaud 10 WP",      grupIrac: "16", formulasi: "WP", phStabil: [5, 8],  basaKuat: false, targetHama: ["Wereng Coklat (Nimfa)", "Kutu Kebul", "Kutu Putih"] },

        // --- GRUP 18: AGONIS RESEPTOR EKDISON (IGR - HORMON GANTI KULIT) ---
        { id: 31, bahanAktif: "Metoksifenozida",        merekPopuler: "Intrepid 250 SC",    grupIrac: "18", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Buah"] },
        { id: 32, bahanAktif: "Tebufenozida",           merekPopuler: "Mimic 20 F",         grupIrac: "18", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Penggerek Buah"] },

        // --- GRUP 21: PENGHAMBAT TRANSPORT ELEKTRON (ENZIM) ---
        { id: 33, bahanAktif: "Piridaben",              merekPopuler: "Samite 135 EC",      grupIrac: "21A",formulasi: "EC", phStabil: [5, 7],  basaKuat: false, targetHama: ["Tungau", "Kutu Kebul", "Thrips"] },

        // --- GRUP 22: PEMBLOKIR SALURAN NATRIUM BERGANTUNG VOLTASE (SARAF) ---
        { id: 34, bahanAktif: "Indoksakarb",            merekPopuler: "Ammate 150 EC",      grupIrac: "22A",formulasi: "EC", phStabil: [5, 7],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Buah"] },

        // --- GRUP 28: MODULATOR RESEPTOR RYANODINE (PELUMPUH OTOT TINGKAT TINGGI) ---
        { id: 35, bahanAktif: "Tetraniliprol",          merekPopuler: "Vayego 200 SC",      grupIrac: "28", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Buah"] },
        { id: 36, bahanAktif: "Klorantraniliprol",      merekPopuler: "Prevathon 50 SC",    grupIrac: "28", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Grayak", "Ulat Pelipat Daun"] },
        { id: 37, bahanAktif: "Flubendiamida",          merekPopuler: "Belt 480 SC",        grupIrac: "28", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Polong"] },
        { id: 38, bahanAktif: "Sianantraniliprol",      merekPopuler: "Exirel 100 SE",      grupIrac: "28", formulasi: "EC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Kutu Kebul", "Penggorok Daun", "Ulat Grayak", "Thrips"] },

        // --- GRUP 29: MODULATOR ORGAN CHORDOTONAL (PENGHAMBAT MAKAN SPESIFIK) ---
        { id: 39, bahanAktif: "Flonikamid",             merekPopuler: "Ulala 50 WG",        grupIrac: "29", formulasi: "SG", phStabil: [5, 9],  basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Daun", "Thrips", "Kutu Kebul"] },

        // --- GRUP 30: MODULATOR ALOSTERIK SALURAN KLORIDA (SARAF - GENERASI TERBARU) ---
        { id: 40, bahanAktif: "Broflanilida",           merekPopuler: "Brofreya 53 SC",     grupIrac: "30", formulasi: "SC", phStabil: [5, 8],  basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"] },

        // --- BAHAN NON-INSEKTISIDA YANG SERING DIOPLOS PETANI ---
        // (fungisida/bakterisida tembaga & kapur — relevan untuk cek pH/basa,
        //  TIDAK punya grupIrac karena bukan insektisida sintetik bermode-IRAC)
        { id: 41, bahanAktif: "Tembaga Hidroksida",     merekPopuler: "Kocide 77 WP",       grupIrac: null, formulasi: "WP", phStabil: [6, 8],  basaKuat: true,  targetHama: [] },
        { id: 42, bahanAktif: "Mankozeb",               merekPopuler: "Dithane M-45 WP",    grupIrac: null, formulasi: "WP", phStabil: [5, 7],  basaKuat: false, targetHama: [] },
        { id: 43, bahanAktif: "Pupuk Daun NPK + Mikro", merekPopuler: "Gandasil/Growmore",  grupIrac: null, formulasi: "SL", phStabil: [4, 6.5],basaKuat: false, targetHama: [] }
    ];

    /* ──────────────────────────────────────────────────────────
       [WARISAN v2.1] Daftar elemen yang disembunyikan saat
       mode 'rotasi' / 'mixing' aktif.
    ────────────────────────────────────────────────────────── */
    var ELEMEN_TERSEMBUNYI_ROTASI = [
        'result', 'btnCamera', 'scanWindow', 'btnAnalisis',
        'boxCuaca', 'boxPenyakit', 'boxHama', 'boxGulma',
        'boxTanah', 'boxBWD', 'boxMalai', 'boxBiayaTani',
        'boxKalkulatorPupuk', 'boxKalender', 'boxVarietasPadi',
        'boxUkurLahan', 'boxPestisida', 'boxGabah',
        'boxJadwalTanam', 'formParameterLahan', 'tabSubtitleDisplay',
        'loader', 'cameraWarning'
    ];

    function sembunyikanSemuaUntukRotasi() {
        ELEMEN_TERSEMBUNYI_ROTASI.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.info-box-dynamic').forEach(function (el) {
            el.style.display = 'none';
        });
        document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
            b.style.display = 'none';
        });
    }

    // ==========================================
    // 2. INJEKSI 2 TOMBOL KE TAB CONTAINER
    // ==========================================
    var tabContainer = document.querySelector('.tab-container');
    var tabRotasi = null;
    var tabMixing = null;
    if (tabContainer) {
        tabRotasi = document.createElement('button');
        tabRotasi.className = 'tab-btn';
        tabRotasi.id = 'tabRotasi';
        tabRotasi.innerText = 'ROTASI RACUN';
        tabRotasi.onclick = function () { window.switchMode('rotasi'); };
        tabContainer.appendChild(tabRotasi);

        tabMixing = document.createElement('button');
        tabMixing.className = 'tab-btn';
        tabMixing.id = 'tabMixing';
        tabMixing.innerText = 'CEK CAMPURAN';
        tabMixing.onclick = function () { window.switchMode('mixing'); };
        tabContainer.appendChild(tabMixing);
    }

    // ==========================================
    // 3A. INJEKSI KONTEN: ROTASI (sama seperti v2.1)
    // ==========================================
    var cardContainer = document.querySelector('.card');
    var boxRotasi = null;
    if (cardContainer) {
        boxRotasi = document.createElement('div');
        boxRotasi.id = 'boxRotasi';
        boxRotasi.style.display = 'none';

        boxRotasi.innerHTML =
            '<div class="info-box" style="border-left-color: var(--accent-hama); background: rgba(239, 68, 68, 0.05); margin-bottom: 20px;">' +
                '<strong style="color:var(--accent-hama);">♻️ Kalkulator Rotasi (IRAC)</strong><br>' +
                '<span style="font-size: 0.8rem; color: var(--text-muted);">' +
                    'Mencegah hama kebal dengan menyaring dan menghindari golongan cara kerja bahan aktif yang sama.' +
                '</span>' +
            '</div>' +
            '<div class="form-lahan">' +
                '<div class="form-group">' +
                    '<label>🐛 TARGET HAMA SAAT INI</label>' +
                    '<select id="patch-hama" class="form-select" style="margin-bottom: 0;">' +
                        '<option value="Penggerek Batang Padi">Penggerek Batang Padi (Sundep/Beluk)</option>' +
                        '<option value="Wereng Coklat">Wereng Coklat</option>' +
                        '<option value="Ulat Grayak">Ulat Grayak</option>' +
                        '<option value="Kutu Daun">Kutu Daun / Aphids</option>' +
                        '<option value="Thrips">Thrips</option>' +
                        '<option value="Kutu Kebul">Kutu Kebul</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-top:12px;">' +
                    '<label>🧪 BAHAN AKTIF TERAKHIR DIPAKAI</label>' +
                    '<select id="patch-racun" class="form-select" style="margin-bottom: 0;">' +
                        '<option value="">-- Pilih Bahan Aktif --</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            '<button class="btn-main" id="btnHitungRotasi" style="background: var(--accent-hama); color: #fff; margin-bottom: 12px;">' +
                '🔄 HITUNG ROTASI REKOMENDASI' +
            '</button>' +
            '<div id="patch-hasil" style="display:none; margin-top: 15px;"></div>';

        cardContainer.appendChild(boxRotasi);

        var selectRacun = document.getElementById('patch-racun');
        databasePestisida.forEach(function (item) {
            if (item.targetHama.length === 0) return; // sembunyikan non-insektisida dari dropdown rotasi
            var opt = document.createElement('option');
            opt.value = item.bahanAktif;
            opt.innerText = item.bahanAktif + ' (Grup ' + item.grupIrac + ') - cth: ' + item.merekPopuler;
            selectRacun.appendChild(opt);
        });

        document.getElementById('btnHitungRotasi').addEventListener('click', hitungRotasiPestisida);
    }

    // ==========================================
    // 3B. INJEKSI KONTEN: MIXING (BARU)
    // ==========================================
    var JUMLAH_SLOT_MIN = 2;
    var JUMLAH_SLOT_MAKS = 4;
    var boxMixing = null;

    function buatOpsiBahan(includeKosong) {
        var html = includeKosong ? '<option value="">-- Pilih Bahan --</option>' : '';
        databasePestisida.forEach(function (item) {
            html += '<option value="' + item.id + '">' + item.bahanAktif +
                ' (' + item.formulasi + (item.grupIrac ? ', Grup ' + item.grupIrac : '') + ')</option>';
        });
        return html;
    }

    function buatSlotMixingHTML(nomor) {
        return (
            '<div class="form-group mixing-slot" data-slot="' + nomor + '" style="margin-top:' + (nomor === 1 ? '0' : '10px') + ';">' +
                '<label>🧪 BAHAN ' + nomor + (nomor <= JUMLAH_SLOT_MIN ? '' : ' (opsional)') + '</label>' +
                '<select class="form-select patch-mix-slot" data-slot="' + nomor + '" style="margin-bottom: 0;">' +
                    buatOpsiBahan(true) +
                '</select>' +
            '</div>'
        );
    }

    if (cardContainer) {
        boxMixing = document.createElement('div');
        boxMixing.id = 'boxMixing';
        boxMixing.style.display = 'none';

        var slotHTML = '';
        for (var s = 1; s <= JUMLAH_SLOT_MIN; s++) slotHTML += buatSlotMixingHTML(s);

        boxMixing.innerHTML =
            '<div class="info-box" style="border-left-color: var(--accent-hama); background: rgba(239, 68, 68, 0.05); margin-bottom: 20px;">' +
                '<strong style="color:var(--accent-hama);">🧪 Cek Campuran Tangki (Mixing)</strong><br>' +
                '<span style="font-size: 0.8rem; color: var(--text-muted);">' +
                    'Periksa potensi masalah SEBELUM mengoplos: kesamaan grup IRAC (percuma & mempercepat resistensi) ' +
                    'dan inkompatibilitas fisik formulasi (EC/WP/SC/pH) yang berisiko pecah/mengental di tangki.' +
                '</span>' +
            '</div>' +
            '<div class="form-lahan" id="mixingSlotContainer">' + slotHTML + '</div>' +
            '<div style="display:flex; gap:8px; margin-top:12px; margin-bottom:12px;">' +
                '<button class="btn-main" id="btnTambahSlotMixing" style="background: rgba(255,255,255,0.08); color: var(--text-main); flex:1;">' +
                    '➕ TAMBAH BAHAN' +
                '</button>' +
                '<button class="btn-main" id="btnKurangSlotMixing" style="background: rgba(255,255,255,0.08); color: var(--text-main); flex:1; display:none;">' +
                    '➖ KURANGI BAHAN' +
                '</button>' +
            '</div>' +
            '<button class="btn-main" id="btnCekMixing" style="background: var(--accent-hama); color: #fff; margin-bottom: 12px;">' +
                '🔍 CEK KOMPATIBILITAS CAMPURAN' +
            '</button>' +
            '<div id="mixing-hasil" style="display:none; margin-top: 15px;"></div>' +
            '<div style="font-size:0.68rem; color:var(--text-muted); margin-top:10px; line-height:1.6;">' +
                '⚠️ Data formulasi & pH bersifat estimasi golongan kimia umum, bukan data resmi per merek. ' +
                'Selalu lakukan <b>jar test</b> (campur skala kecil, diamkan 15–30 menit, amati endapan/pemisahan) ' +
                'dan baca label produk sebelum aplikasi skala penuh.' +
            '</div>';

        cardContainer.appendChild(boxMixing);

        var jumlahSlotAktif = JUMLAH_SLOT_MIN;

        function refreshTombolSlot() {
            var btnTambah  = document.getElementById('btnTambahSlotMixing');
            var btnKurang  = document.getElementById('btnKurangSlotMixing');
            if (btnTambah) btnTambah.style.display = (jumlahSlotAktif >= JUMLAH_SLOT_MAKS) ? 'none' : 'block';
            if (btnKurang) btnKurang.style.display = (jumlahSlotAktif <= JUMLAH_SLOT_MIN) ? 'none' : 'block';
        }

        document.getElementById('btnTambahSlotMixing').addEventListener('click', function () {
            if (jumlahSlotAktif >= JUMLAH_SLOT_MAKS) return;
            jumlahSlotAktif += 1;
            var container = document.getElementById('mixingSlotContainer');
            container.insertAdjacentHTML('beforeend', buatSlotMixingHTML(jumlahSlotAktif));
            refreshTombolSlot();
        });

        document.getElementById('btnKurangSlotMixing').addEventListener('click', function () {
            if (jumlahSlotAktif <= JUMLAH_SLOT_MIN) return;
            var container = document.getElementById('mixingSlotContainer');
            var slotTerakhir = container.querySelector('.mixing-slot[data-slot="' + jumlahSlotAktif + '"]');
            if (slotTerakhir) slotTerakhir.remove();
            jumlahSlotAktif -= 1;
            refreshTombolSlot();
        });

        document.getElementById('btnCekMixing').addEventListener('click', cekKompatibilitasMixing);

        refreshTombolSlot();
    }

    // ==========================================
    // 4A. LOGIKA ROTASI (sama seperti v2.1)
    // ==========================================
    function hitungRotasiPestisida() {
        var hamaTerpilih  = document.getElementById('patch-hama').value;
        var racunTerpilih = document.getElementById('patch-racun').value;
        var divHasil      = document.getElementById('patch-hasil');

        if (!racunTerpilih) {
            alert('Pilih bahan aktif sebelumnya terlebih dahulu!');
            return;
        }

        var dataSebelumnya = databasePestisida.filter(function (item) {
            return item.bahanAktif === racunTerpilih;
        })[0];
        var grupTerlarang = dataSebelumnya ? dataSebelumnya.grupIrac : '';

        var rekomendasi = databasePestisida.filter(function (item) {
            return item.targetHama.indexOf(hamaTerpilih) > -1 && item.grupIrac !== grupTerlarang;
        });

        divHasil.innerHTML = '';
        if (rekomendasi.length === 0) {
            divHasil.innerHTML = '<div class="info-box" style="border-left-color: var(--red-alert);">Tidak ada rotasi alternatif di database untuk hama ini.</div>';
        } else {
            var html = '<div class="info-box" style="border-left-color: var(--accent-green); background: rgba(16, 185, 129, 0.05);">' +
                '<strong style="color:var(--accent-green);">✅ Rekomendasi Opsi (Selain Grup ' + grupTerlarang + ')</strong><br><br>';

            rekomendasi.forEach(function (rek) {
                html +=
                    '<div style="border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 10px;">' +
                        '<div style="font-size:1.05rem; font-weight:700; color:var(--text-main);">' + rek.bahanAktif +
                            ' <span class="badge" style="background:var(--accent-green); color:#fff; font-size:0.6rem; margin-left:5px;">Grup ' + rek.grupIrac + '</span></div>' +
                        '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Contoh Merek di Kios: <b>' + rek.merekPopuler + '</b></div>' +
                    '</div>';
            });
            html += '</div>';
            divHasil.innerHTML = html;
        }
        divHasil.style.display = 'block';
    }

    // ==========================================
    // 4B. LOGIKA MIXING (BARU)
    // ==========================================
    function cariBahanById(id) {
        var hasil = databasePestisida.filter(function (it) { return String(it.id) === String(id); });
        return hasil.length ? hasil[0] : null;
    }

    /*
     * Cek inkompatibilitas fisik dua formulasi.
     * Mengembalikan { level: 'kritis'|'waspada'|'aman', alasan: '...' }
     */
    function cekFormulasiPasangan(a, b) {
        // Basa kuat ketemu apa saja → kritis (alkaline hydrolysis merusak bahan aktif)
        if (a.basaKuat || b.basaKuat) {
            var basaItem  = a.basaKuat ? a : b;
            var lawanItem = a.basaKuat ? b : a;
            return {
                level: 'kritis',
                alasan: basaItem.bahanAktif + ' bersifat basa kuat dan berisiko menonaktifkan/merusak ' +
                        lawanItem.bahanAktif + ' lewat hidrolisis basa. Jangan dicampur dalam satu tangki — beri jeda aplikasi minimal 7–10 hari.'
            };
        }

        // Rentang pH stabil tidak overlap sama sekali → kritis
        if (a.phStabil && b.phStabil) {
            var overlapMin = Math.max(a.phStabil[0], b.phStabil[0]);
            var overlapMax = Math.min(a.phStabil[1], b.phStabil[1]);
            if (overlapMin > overlapMax) {
                return {
                    level: 'kritis',
                    alasan: 'Rentang pH stabil ' + a.bahanAktif + ' (' + a.phStabil[0] + '–' + a.phStabil[1] + ') ' +
                            'dan ' + b.bahanAktif + ' (' + b.phStabil[0] + '–' + b.phStabil[1] + ') tidak beririsan. ' +
                            'Salah satu bahan kemungkinan terdegradasi di pH campuran — pisahkan aplikasi.'
                };
            }
        }

        // EC + WP → waspada (rawan pecah emulsi/mengental tanpa jar test)
        var formSet = [a.formulasi, b.formulasi].sort().join('+');
        if (formSet === 'EC+WP') {
            return {
                level: 'waspada',
                alasan: 'Kombinasi EC (' + (a.formulasi === 'EC' ? a.bahanAktif : b.bahanAktif) + ') dan WP (' +
                        (a.formulasi === 'WP' ? a.bahanAktif : b.bahanAktif) + ') berisiko pecah emulsi atau mengental, ' +
                        'terutama di air sadah. Wajib jar test dulu; urutan tangki: air → WP → aduk rata → EC → aduk lagi.'
            };
        }

        // SL (banyak pupuk daun/cair pekat) + EC → waspada ringan
        if (formSet === 'EC+SL') {
            return {
                level: 'waspada',
                alasan: 'Kombinasi formulasi cair (SL) dan EC kadang menyebabkan pemisahan fase pada konsentrasi tinggi. Lakukan jar test sebelum volume besar.'
            };
        }

        return { level: 'aman', alasan: '' };
    }

    function cekKompatibilitasMixing() {
        var selects = Array.prototype.slice.call(document.querySelectorAll('.patch-mix-slot'));
        var dipilih = selects
            .map(function (sel) { return sel.value; })
            .filter(function (v) { return v !== ''; })
            .map(cariBahanById)
            .filter(function (it) { return it !== null; });

        var divHasil = document.getElementById('mixing-hasil');

        if (dipilih.length < 2) {
            alert('Pilih minimal 2 bahan untuk dicek kompatibilitasnya!');
            return;
        }

        // Cek duplikat bahan yang sama dipilih di slot berbeda
        var idSet = {};
        var adaDuplikat = false;
        dipilih.forEach(function (it) {
            if (idSet[it.id]) adaDuplikat = true;
            idSet[it.id] = true;
        });
        if (adaDuplikat) {
            alert('Ada bahan yang dipilih lebih dari satu kali. Pilih bahan yang berbeda di setiap slot.');
            return;
        }

        var masalahList = []; // { level, judul, alasan }

        // (A) Cek kesamaan grup IRAC — semua pasangan
        for (var i = 0; i < dipilih.length; i++) {
            for (var j = i + 1; j < dipilih.length; j++) {
                var x = dipilih[i], y = dipilih[j];
                if (x.grupIrac && y.grupIrac && x.grupIrac === y.grupIrac) {
                    masalahList.push({
                        level: 'waspada',
                        judul: '♻️ Grup IRAC sama: ' + x.bahanAktif + ' & ' + y.bahanAktif,
                        alasan: 'Keduanya grup ' + x.grupIrac + ' — mode kerja identik di saraf/fisiologi hama. ' +
                                'Mencampur tidak menambah daya bunuh berarti dan mempercepat resistensi karena hama ' +
                                'hanya perlu satu mekanisme kekebalan untuk menahan keduanya sekaligus. ' +
                                'Saran: ganti salah satu dengan bahan dari grup IRAC lain untuk hama target yang sama.'
                    });
                }
            }
        }

        // (B) Cek inkompatibilitas fisik — semua pasangan
        for (var p = 0; p < dipilih.length; p++) {
            for (var q = p + 1; q < dipilih.length; q++) {
                var hasilFis = cekFormulasiPasangan(dipilih[p], dipilih[q]);
                if (hasilFis.level !== 'aman') {
                    masalahList.push({
                        level: hasilFis.level,
                        judul: (hasilFis.level === 'kritis' ? '🔴' : '🟡') + ' Formulasi/pH: ' +
                               dipilih[p].bahanAktif + ' & ' + dipilih[q].bahanAktif,
                        alasan: hasilFis.alasan
                    });
                }
            }
        }

        // ── RENDER — SOFT WARNING: hasil selalu tampil ──
        var daftarBahanHTML = dipilih.map(function (it) {
            return '<span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-main); margin-right:6px; margin-bottom:6px; display:inline-block; padding:4px 10px; border-radius:8px; font-size:0.75rem;">' +
                it.bahanAktif + ' <span style="opacity:0.6;">(' + it.formulasi + ')</span>' +
                '</span>';
        }).join('');

        var ringkasanHTML;
        var adaKritis  = masalahList.some(function (m) { return m.level === 'kritis'; });
        var adaWaspada = masalahList.some(function (m) { return m.level === 'waspada'; });

        if (masalahList.length === 0) {
            ringkasanHTML =
                '<div class="info-box" style="border-left-color: var(--accent-green); background: rgba(16, 185, 129, 0.05);">' +
                    '<strong style="color:var(--accent-green);">✅ Tidak ditemukan masalah kesamaan grup IRAC maupun indikasi inkompatibilitas fisik pada kombinasi ini.</strong><br>' +
                    '<span style="font-size:0.78rem; color:var(--text-muted);">Tetap lakukan jar test untuk volume besar — data ini estimasi umum, bukan jaminan mutlak.</span>' +
                '</div>';
        } else {
            var warnaRingkasan = adaKritis ? 'var(--red-alert)' : 'var(--accent-soil)';
            ringkasanHTML =
                '<div class="info-box" style="border-left-color: ' + warnaRingkasan + '; background: rgba(239, 68, 68, 0.05);">' +
                    '<strong style="color:' + warnaRingkasan + ';">' +
                        (adaKritis ? '🔴 Ditemukan masalah KRITIS pada campuran ini' : '🟡 Ada hal yang perlu diwaspadai pada campuran ini') +
                    '</strong><br>' +
                    '<span style="font-size:0.78rem; color:var(--text-muted);">Hasil tetap ditampilkan di bawah sebagai bahan pertimbangan — keputusan akhir ada di tangan Anda/PPL pendamping.</span>' +
                '</div>';
        }

        var detailHTML = masalahList.map(function (m) {
            var warna = m.level === 'kritis' ? 'var(--red-alert)' : 'var(--accent-soil)';
            return '<div style="border-left:3px solid ' + warna + '; background: rgba(255,255,255,0.02); border-radius:8px; padding:10px 12px; margin-bottom:10px;">' +
                '<div style="font-weight:700; color:' + warna + '; font-size:0.85rem; margin-bottom:4px;">' + m.judul + '</div>' +
                '<div style="font-size:0.8rem; color:var(--text-muted); line-height:1.5;">' + m.alasan + '</div>' +
            '</div>';
        }).join('');

        divHasil.innerHTML =
            '<div style="margin-bottom:12px;">' + daftarBahanHTML + '</div>' +
            ringkasanHTML +
            (detailHTML ? '<div style="margin-top:12px;">' + detailHTML + '</div>' : '');
        divHasil.style.display = 'block';
    }

    // ==========================================
    // 5. PENCEGATAN switchMode — VERSI AMAN (mode 'rotasi' & 'mixing')
    // ==========================================
    if (typeof window.switchMode === 'function') {
        var fungsiSwitchModeAsli = window.switchMode;

        window.switchMode = function (mode) {
            var boxRotasiEl = document.getElementById('boxRotasi');
            var tabRotasiEl = document.getElementById('tabRotasi');
            var boxMixingEl = document.getElementById('boxMixing');
            var tabMixingEl = document.getElementById('tabMixing');

            if (mode === 'rotasi' || mode === 'mixing') {
                sembunyikanSemuaUntukRotasi();

                document.querySelectorAll('.tab-btn').forEach(function (el) {
                    el.classList.remove('active');
                });

                if (mode === 'rotasi') {
                    if (boxRotasiEl) boxRotasiEl.style.display = 'block';
                    if (tabRotasiEl) tabRotasiEl.classList.add('active');
                    var titleR = document.getElementById('modeTitle');
                    if (titleR) titleR.innerText = 'Rotasi & Smart Mixing';
                } else {
                    if (boxMixingEl) boxMixingEl.style.display = 'block';
                    if (tabMixingEl) tabMixingEl.classList.add('active');
                    var titleM = document.getElementById('modeTitle');
                    if (titleM) titleM.innerText = 'Cek Campuran Tangki';
                }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) subEl.style.display = 'none';

                try { if (typeof currentMode !== 'undefined') currentMode = mode; } catch (e) {}

                // TIDAK memanggil fungsiSwitchModeAsli — berhenti di sini.
                return;
            }

            // Mode lain: sembunyikan box kita sendiri, teruskan mode ASLI.
            if (boxRotasiEl) boxRotasiEl.style.display = 'none';
            if (tabRotasiEl) tabRotasiEl.classList.remove('active');
            if (boxMixingEl) boxMixingEl.style.display = 'none';
            if (tabMixingEl) tabMixingEl.classList.remove('active');

            fungsiSwitchModeAsli.apply(this, arguments);
        };

        console.log(
            '%c✅ patch_pestisida_v3_mixing.js v3.0 aktif — Rotasi IRAC + Cek Campuran (grup IRAC & formulasi/pH)',
            'color:var(--accent-hama, #ef4444); font-weight:bold;'
        );
    } else {
        console.warn('[patch_pestisida] window.switchMode belum tersedia saat patch dimuat — tombol tab mungkin tidak berfungsi penuh.');
    }

})();
