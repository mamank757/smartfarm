/**
 * ============================================================
 * PATCH PESTISIDA — Manajemen Terpadu (Rotasi + Mixing)
 * Versi: 4.0 — DATABASE MEREK DIPERLUAS + ROTASI FUNGISIDA + PENCARIAN MEREK
 * ------------------------------------------------------------
 * RIWAYAT VERSI:
 * v3.2 — Bugfix ID konflik dengan HTML (tabPestisida/boxPestisida sudah
 *        dipakai fitur lain), ID diganti jadi tabAturPestisida/boxAturPestisida.
 *
 * v4.0 — PENYEMPURNAAN BESAR:
 * 1) Database ditambah 7 bahan aktif FUNGISIDA umum (Propineb/Antracol,
 *    Difenokonazol/Score, Azoksistrobin/Amistar, Trisiklazol/Filia,
 *    Karbendazim/Bavistin, Validamisin/Validacin, Heksakonazol/Anvil)
 *    lengkap dengan grup resistensi FRAC — total 50 bahan aktif.
 * 2) Field BARU per bahan: `merekLain` (alternatif merek dagang yang
 *    beredar di pasar — hasil verifikasi data publik Kementan/distributor),
 *    `targetPenyakit` (utk fungisida), `catatan` (peringatan khusus,
 *    mis. bahan aktif yang sebaiknya dihindari utk padi karena risiko
 *    resistensi tinggi menurut rekomendasi pakar proteksi tanaman).
 * 3. Kalkulator ROTASI sekarang mendukung 2 KATEGORI: Insektisida (IRAC)
 *    & Fungisida (FRAC), dengan daftar target hama/penyakit yang dibangun
 *    OTOMATIS dari seluruh isi database (sebelumnya hardcode cuma 6 hama,
 *    banyak hama lain di database jadi tidak pernah bisa dipilih).
 * 4. Bisa input BAHAN TERAKHIR + BAHAN SEBELUM ITU (opsional) supaya
 *    rotasi tidak hanya menghindari grup terakhir, tapi jendela 2 putaran
 *    terakhir — lebih sesuai prinsip manajemen resistensi.
 * 5. Input bahan aktif (rotasi & mixing) sekarang berupa PENCARIAN
 *    MEREK/BAHAN AKTIF (datalist) — petani tinggal ketik nama merek yang
 *    dia kenal ("Decis", "Confidor", dst), tidak wajib hafal nama kimia.
 * 6. Mixing checker: cek grup IRAC *atau* FRAC (generalisasi, sebelumnya
 *    fungisida tidak pernah ke-cek karena grupIrac selalu null), deteksi
 *    formulasi GRANULAR (GR) yang TIDAK seharusnya dicampur ke tangki
 *    semprot, serta menyarankan urutan pencampuran tangki (prinsip umum:
 *    larut air → tepung (WP) → suspensi (SC) → emulsi (EC) → cairan (SL)).
 * 7. Catatan khusus ditampilkan otomatis bila bahan yang dipakai/dipilih
 *    termasuk yang kurang dianjurkan untuk padi atau berisiko resistensi.
 *
 * CATATAN PENTING UTK PEMASANG PATCH:
 * - File ini MENGGANTIKAN patch v3.2 sepenuhnya. Jangan load keduanya
 *   sekaligus (ID tab/box sengaja dibuat SAMA: tabAturPestisida /
 *   boxAturPestisida — guard idempotency di bawah akan otomatis
 *   membatalkan v4.0 jika v3.2 sudah lebih dulu jalan, atau sebaliknya).
 * - Daftar merek dagang bersifat REFERENSI UMUM. Satu bahan aktif bisa
 *   terdaftar puluhan merek berbeda di Kementan (cth: Abamektin tercatat
 *   ±66 merek). Selalu cocokkan dengan BAHAN AKTIF & nomor pendaftaran
 *   pada label kemasan, bukan hanya nama merek.
 * ============================================================
 */

(function () {
    'use strict';

    /* ── GUARD IDEMPOTENCY (ID sama dengan v3.2, tidak bentrok dgn HTML) ── */
    if (document.getElementById('tabAturPestisida')) {
        console.warn('[patch_pestisida] #tabAturPestisida sudah ada — patch dibatalkan.');
        return;
    }

    // ==========================================
    // 0. TEKS CATATAN YANG DIPAKAI BERULANG
    // ==========================================
    var CATATAN_PADI =
        'Menurut rekomendasi pakar proteksi tanaman (webinar "Kiat Jitu Kendalikan Penggerek ' +
        'Batang Padi", IPB & FMC bersama Tabloid Sinar Tani), bahan aktif ini sebaiknya ' +
        'tidak diprioritaskan untuk pertanaman PADI karena tergolong sering dipakai berlebihan ' +
        'sehingga berisiko tinggi memicu resistensi hama. Pertimbangkan rotasi ke grup IRAC lain.';

    var CATATAN_RESISTENSI_FUNGISIDA =
        'Pemakaian terus-menerus tanpa rotasi berisiko mempercepat resistensi cendawan. ' +
        'Selingi dengan fungisida dari grup FRAC yang berbeda cara kerja.';

    // ==========================================
    // 1. DATABASE PESTISIDA (Formulasi, pH, Grup Resistensi, Merek)
    // ==========================================
    var databasePestisida = [
        { id: 1,  bahanAktif: "Metomil",                merekPopuler: "Lannate 25 WP",        merekLain: ["Dangke 40 WP", "Metindo 40 SP", "Dumil 40 SP"], grupIrac: "1A", grupFrac: null, formulasi: "WP", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Penggerek Polong"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 2,  bahanAktif: "Karbofuran",             merekPopuler: "Furadan 3 GR",         merekLain: ["Petrofur 3 GR"], grupIrac: "1A", grupFrac: null, formulasi: "GR", phStabil: [5, 7],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Nematoda", "Ulat Tanah", "Orong-orong"], targetPenyakit: [], catatan: null },
        { id: 3,  bahanAktif: "BPMC (Fenobukarb)",      merekPopuler: "Bassa 50 EC",          merekLain: ["Baycarb 500 EC", "Kiltop 50 EC", "Dharmabas 500 EC"], grupIrac: "1A", grupFrac: null, formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Wereng Coklat", "Walang Sangit", "Kepik Hijau"], targetPenyakit: [], catatan: null },
        { id: 4,  bahanAktif: "Klorpirifos",            merekPopuler: "Fostin 610 EC",       merekLain: ["Lentrek 400 EC"], grupIrac: "1B", grupFrac: null, formulasi: "EC", phStabil: [4, 7],   basaKuat: false, targetHama: ["Kutu Putih", "Ulat Grayak", "Wereng Coklat", "Semut"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 5,  bahanAktif: "Profenofos",             merekPopuler: "Curacron 500 EC",      merekLain: ["Biocron 500 EC", "Gordon 500 EC", "Excel 500 EC"], grupIrac: "1B", grupFrac: null, formulasi: "EC", phStabil: [4, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Kutu Kebul"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 6,  bahanAktif: "Dimetoat",               merekPopuler: "Perfekthion 400 EC",   merekLain: ["Kanon 400 EC", "Rogor 40 EC", "Roxion 40 EC"], grupIrac: "1B", grupFrac: null, formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Kutu Daun", "Thrips", "Lalat Buah"], targetPenyakit: [], catatan: null },
        { id: 7,  bahanAktif: "Fipronil",               merekPopuler: "Regent 50 SC",         merekLain: ["Fipros 55 SC", "Kozima 50 SC", "Aspril 100 SC"], grupIrac: "2B", grupFrac: null, formulasi: "SC", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Penggerek Batang Padi", "Orong-orong", "Rayap", "Walang Sangit"], targetPenyakit: [], catatan: null },
        { id: 8,  bahanAktif: "Sipermetrin",            merekPopuler: "Ripcord 50 EC",        merekLain: ["Sidamethrin 50 EC", "Cyper 100 EC", "Smash 100 EC"], grupIrac: "3A", grupFrac: null, formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Wereng Coklat", "Walang Sangit"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 9,  bahanAktif: "Deltametrin",            merekPopuler: "Decis 25 EC",          merekLain: ["Delfox 25 EC", "Delta 25 EC", "Deltaking 565 EC (+Klorpirifos)"], grupIrac: "3A", grupFrac: null, formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Walang Sangit", "Kutu Daun", "Kepik"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 10, bahanAktif: "Lamda-Sihalotrin",       merekPopuler: "Matador 25 EC",        merekLain: ["Hamador 25 EC", "Alika (+Tiametoksam)"], grupIrac: "3A", grupFrac: null, formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Lalat Buah", "Kutu Kebul"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 11, bahanAktif: "Alfametrin",             merekPopuler: "Fastac 15 EC",         merekLain: ["Alfamex 15 EC", "Alfatrin 650 SC (+Dimehipo)"], grupIrac: "3A", grupFrac: null, formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Penghisap Buah"], targetPenyakit: [], catatan: null },
        { id: 12, bahanAktif: "Imidakloprid",           merekPopuler: "Confidor 5 WP",        merekLain: ["Winder 25 WP", "Wingran 70 WS", "Gaucho 350 FS", "Kachi 175 SC"], grupIrac: "4A", grupFrac: null, formulasi: "WP", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips", "Kutu Daun"], targetPenyakit: [], catatan: null },
        { id: 13, bahanAktif: "Tiametoksam",            merekPopuler: "Actara 25 WG",         merekLain: ["Cruiser 350 FS", "Alika (+Lamda-Sihalotrin)", "Virtako (+Klorantraniliprol)"], grupIrac: "4A", grupFrac: null, formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips"], targetPenyakit: [], catatan: null },
        { id: 14, bahanAktif: "Dinotefuran",            merekPopuler: "Oshin 20 WP",          merekLain: ["Flytop 250 OD", "Seclira 40 SG", "Starkle 20 WP"], grupIrac: "4A", grupFrac: null, formulasi: "WP", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kepik Hijau"], targetPenyakit: [], catatan: null },
        { id: 15, bahanAktif: "Nitenpiram",             merekPopuler: "Tenchu 20 SG",         merekLain: ["Toram 25 SP", "Niten 100 SL", "Uninap (+Pimetrozin)"], grupIrac: "4A", grupFrac: null, formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Wereng Punggung Putih"], targetPenyakit: [], catatan: null },
        { id: 16, bahanAktif: "Spinosad",               merekPopuler: "Tracer 120 SC",        merekLain: ["Conserve", "Success"], grupIrac: "5",  grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips"], targetPenyakit: [], catatan: null },
        { id: 17, bahanAktif: "Spinetoram",             merekPopuler: "Endure 120 SC",        merekLain: ["Delegate 250 WG"], grupIrac: "5",  grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips", "Ulat Kubis"], targetPenyakit: [], catatan: null },
        { id: 18, bahanAktif: "Abamektin",              merekPopuler: "Demolish 18 EC",       merekLain: ["Wiper 50 EC", "Wito 4 EC", "Xtramec 37 EC"], grupIrac: "6",  grupFrac: null, formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Tungau", "Thrips"], targetPenyakit: [], catatan: null },
        { id: 19, bahanAktif: "Emamektin Benzoat",      merekPopuler: "Proclaim 5 SG",        merekLain: ["Siklon 5.7 WG", "Vapcomic"], grupIrac: "6",  grupFrac: null, formulasi: "SG", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Ulat Pelipat Daun"], targetPenyakit: [], catatan: null },
        { id: 20, bahanAktif: "Pimetrozin",             merekPopuler: "Chess 50 WG",          merekLain: ["Plenum 50 WG", "Bypass (+Nitenpiram)"], grupIrac: "9B", grupFrac: null, formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kutu Daun"], targetPenyakit: [], catatan: null },
        { id: 21, bahanAktif: "Heksitiazoks",           merekPopuler: "Nissorun 50 EC",       merekLain: ["Hexacar 50 EC", "Sabet 50 EC"], grupIrac: "10A",grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Tungau Merah", "Tungau Kuning"], targetPenyakit: [], catatan: null },
        { id: 22, bahanAktif: "Bacillus thuringiensis", merekPopuler: "Turex 50 WP",          merekLain: ["Dipel", "Thuricide", "Florbac"], grupIrac: "11A",grupFrac: null, formulasi: "WP", phStabil: [6, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"], targetPenyakit: [], catatan: null },
        { id: 23, bahanAktif: "Diafentiuron",           merekPopuler: "Pegasus 500 SC",       merekLain: ["Akofentiuron", "Kite 500 SC"], grupIrac: "12A",grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Kutu Kebul", "Thrips", "Tungau", "Kutu Daun"], targetPenyakit: [], catatan: null },
        { id: 24, bahanAktif: "Klorfenapir",            merekPopuler: "Arjuna 200 EC",        merekLain: ["Pirate 100 EC"], grupIrac: "13", grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Thrips", "Kutu Daun", "Tungau"], targetPenyakit: [], catatan: null },
        { id: 25, bahanAktif: "Dimehipo",               merekPopuler: "Spontan 400 SL",       merekLain: ["Manuver 400 SL", "Sponten"], grupIrac: "14", grupFrac: null, formulasi: "SL", phStabil: [5, 8],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Wereng Coklat", "Ulat Pelipat Daun", "Lalat Bibit"], targetPenyakit: [], catatan: null },
        { id: 26, bahanAktif: "Kartap Hidroklorida",    merekPopuler: "Padan 50 SP",          merekLain: ["Sansekarta 50 SP", "Bintang 50 SP"], grupIrac: "14", grupFrac: null, formulasi: "SP", phStabil: [5, 7],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Pelipat Daun", "Wereng Coklat"], targetPenyakit: [], catatan: CATATAN_PADI },
        { id: 27, bahanAktif: "Lufenuron",              merekPopuler: "Match 50 EC",          merekLain: ["Cormoran (+Novaluron)"], grupIrac: "15", grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Kubis"], targetPenyakit: [], catatan: null },
        { id: 28, bahanAktif: "Klorfluazuron",          merekPopuler: "Atabron 50 EC",        merekLain: ["Buna 50 EC"], grupIrac: "15", grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Polong"], targetPenyakit: [], catatan: null },
        { id: 29, bahanAktif: "Novaluron",              merekPopuler: "Rimon 100 EC",         merekLain: ["Cormoran (+Lufenuron)"], grupIrac: "15", grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Pelipat Daun", "Penggorok Daun"], targetPenyakit: [], catatan: null },
        { id: 30, bahanAktif: "Buprofezin",             merekPopuler: "Applaud 10 WP",        merekLain: ["Lugen 100 EC", "Lugeno"], grupIrac: "16", grupFrac: null, formulasi: "WP", phStabil: [5, 8],   basaKuat: false, targetHama: ["Wereng Coklat (Nimfa)", "Kutu Kebul", "Kutu Putih"], targetPenyakit: [], catatan: null },
        { id: 31, bahanAktif: "Metoksifenozida",        merekPopuler: "Intrepid 250 SC",      merekLain: ["Prodigy (+Spinetoram)"], grupIrac: "18", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Buah"], targetPenyakit: [], catatan: null },
        { id: 32, bahanAktif: "Tebufenozida",           merekPopuler: "Mimic 20 F",           merekLain: ["Sidalis 200/50 SC"], grupIrac: "18", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Penggerek Buah"], targetPenyakit: [], catatan: null },
        { id: 33, bahanAktif: "Piridaben",              merekPopuler: "Samite 135 EC",        merekLain: ["Sanmite 20 WP"], grupIrac: "21A",grupFrac: null, formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Tungau", "Kutu Kebul", "Thrips"], targetPenyakit: [], catatan: null },
        { id: 34, bahanAktif: "Indoksakarb",            merekPopuler: "Ammate 150 EC",        merekLain: ["Avaunt 150 EC"], grupIrac: "22A",grupFrac: null, formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Buah"], targetPenyakit: [], catatan: null },
        { id: 35, bahanAktif: "Tetraniliprol",          merekPopuler: "Vayego 200 SC",        merekLain: [], grupIrac: "28", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Buah"], targetPenyakit: [], catatan: null },
        { id: 36, bahanAktif: "Klorantraniliprol",      merekPopuler: "Prevathon 50 SC",      merekLain: ["Virtako (+Tiametoksam)", "Voliam Targo (+Abamektin)", "Preza"], grupIrac: "28", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Grayak", "Ulat Pelipat Daun"], targetPenyakit: [], catatan: null },
        { id: 37, bahanAktif: "Flubendiamida",          merekPopuler: "Belt 480 SC",          merekLain: ["Takumi 20 WG"], grupIrac: "28", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Polong"], targetPenyakit: [], catatan: null },
        { id: 38, bahanAktif: "Sianantraniliprol",      merekPopuler: "Exirel 100 SE",        merekLain: ["Benevia 100 OD", "Minecto (+Abamektin)"], grupIrac: "28", grupFrac: null, formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Kutu Kebul", "Penggorok Daun", "Ulat Grayak", "Thrips"], targetPenyakit: [], catatan: null },
        { id: 39, bahanAktif: "Flonikamid",             merekPopuler: "Ulala 50 WG",          merekLain: ["Teppeki 50 WG", "Aria 50 WG"], grupIrac: "29", grupFrac: null, formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Daun", "Thrips", "Kutu Kebul"], targetPenyakit: [], catatan: null },
        { id: 40, bahanAktif: "Broflanilida",           merekPopuler: "Brofreya 53 SC",       merekLain: [], grupIrac: "30", grupFrac: null, formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"], targetPenyakit: [], catatan: null },
        { id: 41, bahanAktif: "Tembaga Hidroksida",     merekPopuler: "Kocide 77 WP",         merekLain: ["Champion 77 WP", "Copcide 77 WP"], grupIrac: null, grupFrac: "M1", formulasi: "WP", phStabil: [6, 8],   basaKuat: true,  targetHama: [], targetPenyakit: ["Antraknosa", "Busuk Buah", "Kanker Bakteri", "Busuk Daun"], catatan: null },
        { id: 42, bahanAktif: "Mankozeb",               merekPopuler: "Dithane M-45 WP",      merekLain: ["Penncozeb 80 WP", "Victory 80 WP", "Tridex 80 WP"], grupIrac: null, grupFrac: "M3", formulasi: "WP", phStabil: [5, 7],   basaKuat: false, targetHama: [], targetPenyakit: ["Antraknosa", "Bercak Daun", "Busuk Daun", "Karat Daun"], catatan: null },
        { id: 43, bahanAktif: "Pupuk Daun NPK + Mikro", merekPopuler: "Gandasil/Growmore",    merekLain: ["Bayfolan", "Mamigro", "Sampurna D"], grupIrac: null, grupFrac: null, formulasi: "SL", phStabil: [4, 6.5], basaKuat: false, targetHama: [], targetPenyakit: [], catatan: null },
        // ---- BARU DI v4.0: FUNGISIDA UMUM (FRAC) ----
        { id: 44, bahanAktif: "Propineb",               merekPopuler: "Antracol 70 WP",       merekLain: ["Trivia 73 WP", "Zenith 75 WP", "Propinex 70 WP"], grupIrac: null, grupFrac: "M3", formulasi: "WP", phStabil: [5, 7], basaKuat: false, targetHama: [], targetPenyakit: ["Antraknosa", "Bercak Daun", "Hawar Daun", "Busuk Batang"], catatan: null },
        { id: 45, bahanAktif: "Difenokonazol",          merekPopuler: "Score 250 EC",         merekLain: ["Amistar Top 325 SC (+Azoksistrobin)", "Narita 250 EC"], grupIrac: null, grupFrac: "3",  formulasi: "EC", phStabil: [5, 7], basaKuat: false, targetHama: [], targetPenyakit: ["Bercak Daun", "Antraknosa", "Embun Tepung", "Karat Daun"], catatan: null },
        { id: 46, bahanAktif: "Azoksistrobin",          merekPopuler: "Amistar 250 SC",       merekLain: ["Amistar Top 325 SC (+difenokonazol)"], grupIrac: null, grupFrac: "11", formulasi: "SC", phStabil: [5, 8], basaKuat: false, targetHama: [], targetPenyakit: ["Bercak Daun", "Hawar Daun", "Blas (Pyricularia oryzae)", "Embun Tepung"], catatan: null },
        { id: 47, bahanAktif: "Trisiklazol",            merekPopuler: "Filia 525 SE (+propikonazol)", merekLain: ["Inari 72 WP (+metil tiofanat)"], grupIrac: null, grupFrac: "16.1", formulasi: "SE", phStabil: [5, 8], basaKuat: false, targetHama: [], targetPenyakit: ["Blas (Pyricularia oryzae)", "Hawar Pelepah", "Bercak Daun"], catatan: null },
        { id: 48, bahanAktif: "Karbendazim",            merekPopuler: "Bavistin 50 WP",       merekLain: ["Cozene 70/10 WP (+mankozeb)"], grupIrac: null, grupFrac: "1", formulasi: "WP", phStabil: [5, 7], basaKuat: false, targetHama: [], targetPenyakit: ["Antraknosa", "Busuk Batang", "Bercak Daun"], catatan: CATATAN_RESISTENSI_FUNGISIDA },
        { id: 49, bahanAktif: "Validamisin A",          merekPopuler: "Validacin 3 L",        merekLain: [], grupIrac: null, grupFrac: "antibiotik", formulasi: "SL", phStabil: [5, 8], basaKuat: false, targetHama: [], targetPenyakit: ["Hawar Pelepah (Rhizoctonia solani)"], catatan: null },
        { id: 50, bahanAktif: "Heksakonazol",           merekPopuler: "Anvil 50 SC",          merekLain: ["Heksa 50 SC"], grupIrac: null, grupFrac: "3", formulasi: "SC", phStabil: [5, 8], basaKuat: false, targetHama: [], targetPenyakit: ["Hawar Pelepah", "Bercak Coklat", "Embun Tepung"], catatan: null }
    ];

    function isInsektisida(item) { return !!item.grupIrac; }
    function isFungisida(item)  { return !!item.grupFrac; }

    function cariBahanById(id) {
        var hasil = databasePestisida.filter(function (it) { return String(it.id) === String(id); });
        return hasil.length ? hasil[0] : null;
    }

    function daftarUnik(field, filterFn) {
        var set = {};
        databasePestisida.forEach(function (item) {
            if (!filterFn(item)) return;
            (item[field] || []).forEach(function (v) { set[v] = true; });
        });
        return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
    }

    // ==========================================
    // Elemen yang disembunyikan saat tab aktif
    // ==========================================
    var ELEMEN_TERSEMBUNYI = [
        'result', 'btnCamera', 'scanWindow', 'btnAnalisis',
        'boxCuaca', 'boxPenyakit', 'boxHama', 'boxGulma',
        'boxTanah', 'boxBWD', 'boxMalai', 'boxBiayaTani',
        'boxKalkulatorPupuk', 'boxKalender', 'boxVarietasPadi',
        'boxUkurLahan', 'boxGabah', 'boxJadwalTanam',
        'boxPestisida',           // ← sembunyikan fitur Cek Harga Pestisida
        'formParameterLahan', 'tabSubtitleDisplay', 'loader', 'cameraWarning'
    ];

    function sembunyikanSemua() {
        ELEMEN_TERSEMBUNYI.forEach(function (id) {
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
    // 2. INJEKSI TOMBOL TAB
    // ==========================================
    var tabContainer = document.querySelector('.tab-container');
    if (tabContainer) {
        var tabBtn = document.createElement('button');
        tabBtn.className  = 'tab-btn';
        tabBtn.id         = 'tabAturPestisida';
        tabBtn.innerText  = 'ATUR PESTISIDA';
        tabBtn.onclick    = function () { window.switchMode('aturpestisida'); };
        tabContainer.appendChild(tabBtn);
    }

    // ==========================================
    // 3. BUAT STRUKTUR HTML BOX
    // ==========================================
    var cardContainer = document.querySelector('.card');
    if (!cardContainer) return;

    var SLOT_MIN  = 2;
    var SLOT_MAKS = 4;

    function buatSlotHTML(nomor) {
        return (
            '<div class="form-group mixing-slot" data-slot="' + nomor + '" style="margin-top:' + (nomor === 1 ? '0' : '10px') + ';">' +
                '<label>🧪 BAHAN ' + nomor + (nomor <= SLOT_MIN ? '' : ' (opsional)') + '</label>' +
                '<input type="text" class="form-select patch-mix-slot-input" data-slot="' + nomor + '" list="apDatalistMixing" autocomplete="off" placeholder="Ketik merek atau bahan aktif..." style="margin-bottom:2px;">' +
                '<input type="hidden" class="patch-mix-slot-id" data-slot="' + nomor + '">' +
                '<div class="patch-mix-slot-feedback" data-slot="' + nomor + '" style="font-size:0.7rem;min-height:14px;margin-bottom:4px;color:var(--text-muted);"></div>' +
            '</div>'
        );
    }

    var slotHTML = '';
    for (var s = 1; s <= SLOT_MIN; s++) slotHTML += buatSlotHTML(s);

    // HTML Rotasi
    var htmlRotasi =
        '<div class="info-box" style="border-left-color:var(--accent-hama);background:rgba(239,68,68,0.05);margin-bottom:20px;">' +
            '<strong style="color:var(--accent-hama);">♻️ Kalkulator Rotasi (Cegah Kebal)</strong><br>' +
            '<span style="font-size:0.8rem;color:var(--text-muted);">Cari rekomendasi bahan aktif alternatif (beda Mode of Action) dari semprotan sebelumnya. Bisa untuk INSEKTISIDA (grup IRAC) maupun FUNGISIDA (grup FRAC).</span>' +
        '</div>' +
        '<div class="form-lahan">' +
            '<div class="form-group">' +
                '<label>📂 KATEGORI</label>' +
                '<select id="apRotasiKategori" class="form-select" style="margin-bottom:0;">' +
                    '<option value="insektisida">Insektisida (Hama)</option>' +
                    '<option value="fungisida">Fungisida (Penyakit)</option>' +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
                '<label id="apLabelTarget">🐛 TARGET HAMA SAAT INI</label>' +
                '<select id="apPatchTarget" class="form-select" style="margin-bottom:0;"></select>' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
                '<label id="apLabelBahanTerakhir">🧪 BAHAN TERAKHIR DIPAKAI</label>' +
                '<input type="text" id="apPatchRacunInput" class="form-select" list="apDatalistRotasi" autocomplete="off" placeholder="Ketik merek atau bahan aktif..." style="margin-bottom:2px;">' +
                '<input type="hidden" id="apPatchRacunId">' +
                '<datalist id="apDatalistRotasi"></datalist>' +
                '<div id="apRotasiFeedback1" style="font-size:0.7rem;min-height:14px;color:var(--text-muted);"></div>' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
                '<label>🧪 BAHAN SEBELUM ITU (opsional, perkuat rotasi)</label>' +
                '<input type="text" id="apPatchRacun2Input" class="form-select" list="apDatalistRotasi" autocomplete="off" placeholder="Kosongkan jika tidak ingat..." style="margin-bottom:2px;">' +
                '<input type="hidden" id="apPatchRacun2Id">' +
                '<div id="apRotasiFeedback2" style="font-size:0.7rem;min-height:14px;color:var(--text-muted);"></div>' +
            '</div>' +
        '</div>' +
        '<button class="btn-main" id="apBtnRotasi" style="background:var(--accent-hama);color:#fff;margin-bottom:12px;">' +
            '🔄 HITUNG ROTASI REKOMENDASI' +
        '</button>' +
        '<div id="apHasilRotasi" style="display:none;margin-top:15px;"></div>';

    // HTML Mixing
    var htmlMixing =
        '<div class="info-box" style="border-left-color:var(--accent-hama);background:rgba(239,68,68,0.05);margin-bottom:20px;">' +
            '<strong style="color:var(--accent-hama);">🧪 Cek Campuran Tangki (Oplosan)</strong><br>' +
            '<span style="font-size:0.8rem;color:var(--text-muted);">Cek apakah racikan aman secara formulasi (tidak pecah), tidak dobel grup resistensi (IRAC/FRAC), dan dapat urutan pencampuran yang tepat.</span>' +
        '</div>' +
        '<datalist id="apDatalistMixing"></datalist>' +
        '<div class="form-lahan" id="apMixingSlotContainer">' + slotHTML + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;margin-bottom:12px;">' +
            '<button class="btn-main" id="apBtnTambahSlot" style="background:rgba(255,255,255,0.08);color:var(--text-main);flex:1;">➕ TAMBAH BAHAN</button>' +
            '<button class="btn-main" id="apBtnKurangSlot" style="background:rgba(255,255,255,0.08);color:var(--text-main);flex:1;display:none;">➖ KURANGI BAHAN</button>' +
        '</div>' +
        '<button class="btn-main" id="apBtnCekMixing" style="background:var(--accent-hama);color:#fff;margin-bottom:12px;">🔍 CEK KOMPATIBILITAS CAMPURAN</button>' +
        '<div id="apHasilMixing" style="display:none;margin-top:15px;"></div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:10px;line-height:1.6;">' +
            '⚠️ Data bersifat estimasi golongan kimia umum, BUKAN pengganti label kemasan. ' +
            'Selalu lakukan <b>jar test</b> (campur skala kecil, diamkan 15 menit, lihat apakah mengendap/pecah) sebelum aplikasi tangki besar.' +
        '</div>';

    var boxAturPestisida = document.createElement('div');
    boxAturPestisida.id           = 'boxAturPestisida';
    boxAturPestisida.style.display = 'none';
    boxAturPestisida.innerHTML =
        '<div style="margin-bottom:30px;">' + htmlRotasi + '</div>' +
        '<hr style="border:0;border-top:2px dashed rgba(255,255,255,0.1);margin:30px 0;">' +
        '<div>' + htmlMixing + '</div>';

    cardContainer.appendChild(boxAturPestisida);

    // ==========================================
    // 4. INDEKS PENCARIAN MEREK / BAHAN AKTIF
    // ==========================================
    function buatIndeksPencarian(filterFn) {
        var peta = {};
        var opsiHTML = '';

        function tambahOpsi(label, id) {
            if (peta.hasOwnProperty(label)) return; // hindari label duplikat di datalist
            peta[label] = id;
            opsiHTML += '<option value="' + label.replace(/"/g, '&quot;') + '"></option>';
        }

        databasePestisida.forEach(function (item) {
            if (filterFn && !filterFn(item)) return;
            var grupTxt = item.grupIrac ? ' (IRAC ' + item.grupIrac + ')' : (item.grupFrac ? ' (FRAC ' + item.grupFrac + ')' : '');
            tambahOpsi(item.merekPopuler + ' — ' + item.bahanAktif + grupTxt, item.id);
            (item.merekLain || []).forEach(function (merek) {
                tambahOpsi(merek + ' — ' + item.bahanAktif, item.id);
            });
            tambahOpsi(item.bahanAktif + ' (bahan aktif)', item.id);
        });

        return { peta: peta, html: opsiHTML };
    }

    var indeksMixing = buatIndeksPencarian(function () { return true; });
    document.getElementById('apDatalistMixing').innerHTML = indeksMixing.html;

    var petaRotasi = {};

    function renderKategoriRotasi() {
        var kategori = document.getElementById('apRotasiKategori').value;
        var labelTarget   = document.getElementById('apLabelTarget');
        var selectTarget  = document.getElementById('apPatchTarget');
        var labelBahan    = document.getElementById('apLabelBahanTerakhir');
        var inputBahan1   = document.getElementById('apPatchRacunInput');
        var inputBahan2   = document.getElementById('apPatchRacun2Input');
        var datalistBahan = document.getElementById('apDatalistRotasi');

        var daftarTarget, filterFn, placeholder;
        if (kategori === 'fungisida') {
            daftarTarget = daftarUnik('targetPenyakit', isFungisida);
            filterFn = isFungisida;
            labelTarget.innerText = '🍄 TARGET PENYAKIT SAAT INI';
            labelBahan.innerText  = '🧪 FUNGISIDA TERAKHIR DIPAKAI';
            placeholder = 'cth: Score, Antracol, Mankozeb...';
        } else {
            daftarTarget = daftarUnik('targetHama', isInsektisida);
            filterFn = isInsektisida;
            labelTarget.innerText = '🐛 TARGET HAMA SAAT INI';
            labelBahan.innerText  = '🧪 INSEKTISIDA TERAKHIR DIPAKAI';
            placeholder = 'ketik/cari, cth: Decis, Spontan, Virtako, ...';
        }

        selectTarget.innerHTML = daftarTarget.map(function (v) {
            return '<option value="' + v + '">' + v + '</option>';
        }).join('');

        var idx = buatIndeksPencarian(filterFn);
        datalistBahan.innerHTML = idx.html;
        petaRotasi = idx.peta;

        inputBahan1.placeholder = placeholder;
        inputBahan2.placeholder = placeholder;
        inputBahan1.value = ''; document.getElementById('apPatchRacunId').value = '';
        inputBahan2.value = ''; document.getElementById('apPatchRacun2Id').value = '';
        document.getElementById('apRotasiFeedback1').innerHTML = '';
        document.getElementById('apRotasiFeedback2').innerHTML = '';
        document.getElementById('apHasilRotasi').style.display = 'none';
    }

    function pasangPencarianInput(inputEl, hiddenEl, feedbackEl, petaGetter) {
        inputEl.addEventListener('input', function () {
            var val = inputEl.value.trim();
            var peta = petaGetter();
            if (val === '') { hiddenEl.value = ''; feedbackEl.innerHTML = ''; return; }
            if (peta.hasOwnProperty(val)) {
                hiddenEl.value = peta[val];
                var item = cariBahanById(peta[val]);
                var grupTxt = item.grupIrac ? 'IRAC ' + item.grupIrac : (item.grupFrac ? 'FRAC ' + item.grupFrac : 'tanpa grup resistensi');
                feedbackEl.innerHTML = '<span style="color:var(--accent-green);">✅ ' + item.bahanAktif + ' — ' + grupTxt + '</span>';
            } else {
                hiddenEl.value = '';
                feedbackEl.innerHTML = '<span style="color:var(--text-muted);">Ketik nama merek/bahan aktif, lalu pilih dari saran yang muncul…</span>';
            }
        });
    }

    pasangPencarianInput(
        document.getElementById('apPatchRacunInput'),
        document.getElementById('apPatchRacunId'),
        document.getElementById('apRotasiFeedback1'),
        function () { return petaRotasi; }
    );
    pasangPencarianInput(
        document.getElementById('apPatchRacun2Input'),
        document.getElementById('apPatchRacun2Id'),
        document.getElementById('apRotasiFeedback2'),
        function () { return petaRotasi; }
    );

    document.getElementById('apRotasiKategori').addEventListener('change', renderKategoriRotasi);
    renderKategoriRotasi(); // inisialisasi default kategori 'insektisida'

    // Event Rotasi
    document.getElementById('apBtnRotasi').addEventListener('click', hitungRotasi);

    // State & Event Mixing
    var jumlahSlot = SLOT_MIN;

    function refreshTombolSlot() {
        var btnT = document.getElementById('apBtnTambahSlot');
        var btnK = document.getElementById('apBtnKurangSlot');
        if (btnT) btnT.style.display = (jumlahSlot >= SLOT_MAKS) ? 'none' : 'block';
        if (btnK) btnK.style.display = (jumlahSlot <= SLOT_MIN)  ? 'none' : 'block';
    }

    document.getElementById('apBtnTambahSlot').addEventListener('click', function () {
        if (jumlahSlot >= SLOT_MAKS) return;
        jumlahSlot++;
        document.getElementById('apMixingSlotContainer').insertAdjacentHTML('beforeend', buatSlotHTML(jumlahSlot));
        refreshTombolSlot();
    });

    document.getElementById('apBtnKurangSlot').addEventListener('click', function () {
        if (jumlahSlot <= SLOT_MIN) return;
        var last = document.querySelector('#apMixingSlotContainer .mixing-slot[data-slot="' + jumlahSlot + '"]');
        if (last) last.remove();
        jumlahSlot--;
        refreshTombolSlot();
    });

    // Event delegation utk input pencarian di slot mixing (slot ditambah dinamis)
    document.getElementById('apMixingSlotContainer').addEventListener('input', function (e) {
        if (!e.target.classList || !e.target.classList.contains('patch-mix-slot-input')) return;
        var nomor = e.target.getAttribute('data-slot');
        var hiddenEl = document.querySelector('.patch-mix-slot-id[data-slot="' + nomor + '"]');
        var feedbackEl = document.querySelector('.patch-mix-slot-feedback[data-slot="' + nomor + '"]');
        var val = e.target.value.trim();
        if (val === '') { hiddenEl.value = ''; feedbackEl.innerHTML = ''; return; }
        if (indeksMixing.peta.hasOwnProperty(val)) {
            hiddenEl.value = indeksMixing.peta[val];
            var item = cariBahanById(indeksMixing.peta[val]);
            var grupTxt = item.grupIrac ? 'IRAC ' + item.grupIrac : (item.grupFrac ? 'FRAC ' + item.grupFrac : 'tanpa grup');
            feedbackEl.innerHTML = '<span style="color:var(--accent-green);">✅ ' + item.bahanAktif + ' (' + item.formulasi + ', ' + grupTxt + ')</span>';
        } else {
            hiddenEl.value = '';
            feedbackEl.innerHTML = 'Ketik nama merek/bahan aktif, lalu pilih dari saran…';
        }
    });

    document.getElementById('apBtnCekMixing').addEventListener('click', cekMixing);
    refreshTombolSlot();

    // ==========================================
    // 5A. LOGIKA ROTASI
    // ==========================================
    function hitungRotasi() {
        var kategori   = document.getElementById('apRotasiKategori').value;
        var target     = document.getElementById('apPatchTarget').value;
        var id1        = document.getElementById('apPatchRacunId').value;
        var id2        = document.getElementById('apPatchRacun2Id').value;
        var div        = document.getElementById('apHasilRotasi');

        if (!id1) { alert('Pilih dulu bahan yang terakhir dipakai (ketik di kolom pencarian, lalu pilih salah satu saran yang muncul).'); return; }

        var bahan1 = cariBahanById(id1);
        var bahan2 = id2 ? cariBahanById(id2) : null;
        if (!bahan1) { alert('Bahan tidak dikenali, coba ketik ulang dan pilih dari daftar saran.'); return; }

        var grupField   = kategori === 'fungisida' ? 'grupFrac' : 'grupIrac';
        var targetField = kategori === 'fungisida' ? 'targetPenyakit' : 'targetHama';
        var labelGrup   = kategori === 'fungisida' ? 'FRAC' : 'IRAC';

        var grupTerlarang = [bahan1[grupField]];
        if (bahan2 && bahan2[grupField]) grupTerlarang.push(bahan2[grupField]);

        var rekomendasi = databasePestisida.filter(function (i) {
            return (i[targetField] || []).indexOf(target) > -1 &&
                   i[grupField] &&
                   grupTerlarang.indexOf(i[grupField]) === -1;
        });

        var catatanHTML = '';
        [bahan1, bahan2].forEach(function (b) {
            if (b && b.catatan) {
                catatanHTML += '<div class="info-box" style="border-left-color:var(--accent-soil);background:rgba(217,119,6,0.08);margin-bottom:10px;">' +
                    '<strong style="color:var(--accent-soil);">🌾 Catatan untuk ' + b.bahanAktif + '</strong><br>' +
                    '<span style="font-size:0.78rem;color:var(--text-muted);">' + b.catatan + '</span></div>';
            }
        });

        div.innerHTML = '';
        if (rekomendasi.length === 0) {
            div.innerHTML = catatanHTML + '<div class="info-box" style="border-left-color:var(--red-alert);">Tidak ada rotasi alternatif di database untuk target ini selain grup ' + labelGrup + ' yang sudah dipakai. Coba bahan dari golongan kerja lain secara manual, atau konsultasikan ke PPL/kios resmi terdekat.</div>';
        } else {
            var html = catatanHTML + '<div class="info-box" style="border-left-color:var(--accent-green);background:rgba(16,185,129,0.05);">' +
                '<strong style="color:var(--accent-green);">✅ Rekomendasi Opsi (selain grup ' + labelGrup + ' ' + grupTerlarang.join(' & ') + ')</strong><br><br>';
            rekomendasi.forEach(function (rek) {
                var merekTambahan = (rek.merekLain && rek.merekLain.length) ?
                    '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">Merek lain: ' + rek.merekLain.join(', ') + '</div>' : '';
                var badgeCatatan = rek.catatan ? ' <span class="badge" style="background:var(--accent-soil);color:#fff;font-size:0.6rem;margin-left:5px;">⚠️ Ada Catatan</span>' : '';
                html +=
                    '<div style="border-bottom:1px dashed rgba(255,255,255,0.1);padding-bottom:10px;margin-bottom:10px;">' +
                        '<div style="font-size:1.05rem;font-weight:700;color:var(--text-main);">' + rek.bahanAktif +
                            ' <span class="badge" style="background:var(--accent-green);color:#fff;font-size:0.6rem;margin-left:5px;">' + labelGrup + ' ' + rek[grupField] + '</span>' + badgeCatatan + '</div>' +
                        '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Contoh Merek di Kios: <b>' + rek.merekPopuler + '</b></div>' +
                        merekTambahan +
                    '</div>';
            });
            html += '</div>';
            div.innerHTML = html;
        }
        div.style.display = 'block';
    }

    // ==========================================
    // 5B. LOGIKA MIXING
    // ==========================================
    var FORMULASI_BUBUK = ['WP', 'SP', 'SG'];
    function adalahBubuk(f) { return FORMULASI_BUBUK.indexOf(f) > -1; }

    function grupResistansiSama(a, b) {
        if (a.grupIrac && b.grupIrac && a.grupIrac === b.grupIrac) return { sama: true, jenis: 'IRAC', grup: a.grupIrac };
        if (a.grupFrac && b.grupFrac && a.grupFrac === b.grupFrac) return { sama: true, jenis: 'FRAC', grup: a.grupFrac };
        return { sama: false };
    }

    function cekFormulasiPasangan(a, b) {
        if (a.basaKuat || b.basaKuat) {
            var basaItem  = a.basaKuat ? a : b;
            var lawanItem = a.basaKuat ? b : a;
            return { level: 'kritis', alasan: basaItem.bahanAktif + ' bersifat basa kuat dan berisiko menonaktifkan ' + lawanItem.bahanAktif + ' lewat hidrolisis basa. Jangan dicampur — beri jeda aplikasi minimal 7–10 hari.' };
        }
        if (a.phStabil && b.phStabil) {
            var overlapMin = Math.max(a.phStabil[0], b.phStabil[0]);
            var overlapMax = Math.min(a.phStabil[1], b.phStabil[1]);
            if (overlapMin > overlapMax) {
                return { level: 'kritis', alasan: 'Rentang pH stabil ' + a.bahanAktif + ' (' + a.phStabil[0] + '–' + a.phStabil[1] + ') dan ' + b.bahanAktif + ' (' + b.phStabil[0] + '–' + b.phStabil[1] + ') tidak beririsan. Salah satu bahan kemungkinan terdegradasi di pH campuran.' };
            }
        }
        if (a.formulasi === 'EC' && adalahBubuk(b.formulasi) || b.formulasi === 'EC' && adalahBubuk(a.formulasi)) {
            var bubukItem = adalahBubuk(a.formulasi) ? a : b;
            var ecItem     = a.formulasi === 'EC' ? a : b;
            return { level: 'waspada', alasan: 'Kombinasi EC (' + ecItem.bahanAktif + ') dan ' + bubukItem.formulasi + ' (' + bubukItem.bahanAktif + ') berisiko pecah emulsi. Wajib jar test; urutan: air → larutkan ' + bubukItem.formulasi + ' → aduk → tambah EC → aduk lagi.' };
        }
        if ((a.formulasi === 'EC' && b.formulasi === 'SL') || (b.formulasi === 'EC' && a.formulasi === 'SL')) {
            return { level: 'waspada', alasan: 'Kombinasi SL dan EC kadang menyebabkan pemisahan fase pada konsentrasi tinggi. Lakukan jar test.' };
        }
        return { level: 'aman', alasan: '' };
    }

    var URUTAN_FORMULASI = ['SP', 'SG', 'WP', 'SC', 'SE', 'EC', 'SL'];
    var NAMA_FORMULASI = {
        SP: 'Larutkan dulu bahan SP (bubuk larut air penuh)',
        SG: 'Larutkan/dispersikan bahan SG (granul larut/dispersi)',
        WP: 'Masukkan bahan WP (tepung dapat disuspensikan), aduk rata',
        SC: 'Masukkan bahan SC (suspensi pekat), aduk rata',
        SE: 'Masukkan bahan SE (suspo-emulsi), aduk rata',
        EC: 'Masukkan bahan EC (pekatan dapat diemulsikan) paling akhir dari golongan racun',
        SL: 'Masukkan larutan SL / perekat-perata terakhir'
    };

    function tentukanUrutanPencampuran(items) {
        var hadir = {};
        items.forEach(function (i) { hadir[i.formulasi] = true; });
        var langkah = [];
        URUTAN_FORMULASI.forEach(function (f) {
            if (hadir[f]) langkah.push(NAMA_FORMULASI[f]);
        });
        return langkah;
    }

    function cekMixing() {
        var hiddenInputs = Array.prototype.slice.call(document.querySelectorAll('#apMixingSlotContainer .patch-mix-slot-id'));
        var dipilih = hiddenInputs
            .map(function (h) { return h.value; })
            .filter(function (v) { return v !== ''; })
            .map(cariBahanById)
            .filter(function (it) { return it !== null; });

        var divHasil = document.getElementById('apHasilMixing');

        if (dipilih.length < 2) { alert('Pilih minimal 2 bahan (ketik di kolom lalu pilih dari saran) untuk dicek kompatibilitasnya!'); return; }

        var hitungId = {};
        dipilih.forEach(function (it) { hitungId[it.id] = (hitungId[it.id] || 0) + 1; });
        var namaDuplikat = [];
        dipilih.forEach(function (it) {
            if (hitungId[it.id] > 1 && namaDuplikat.indexOf(it.bahanAktif) === -1) namaDuplikat.push(it.bahanAktif);
        });
        if (namaDuplikat.length) { alert('Bahan berikut dipilih lebih dari satu kali: ' + namaDuplikat.join(', ') + '. Hapus salah satu duplikatnya.'); return; }

        var masalahList = [];

        // Cek formulasi GRANULAR (tidak untuk tangki semprot)
        var granularItems = dipilih.filter(function (i) { return i.formulasi === 'GR'; });
        if (granularItems.length) {
            masalahList.push({
                level: 'kritis',
                judul: '🔴 Formulasi GRANULAR terdeteksi: ' + granularItems.map(function (i) { return i.bahanAktif; }).join(', '),
                alasan: 'Formulasi granular (GR) umumnya ditabur langsung ke tanah/petakan sawah, BUKAN dilarutkan dan disemprotkan lewat tangki. Pisahkan aplikasinya dari bahan lain di daftar ini.'
            });
        }

        for (var i = 0; i < dipilih.length; i++) {
            for (var j = i + 1; j < dipilih.length; j++) {
                var x = dipilih[i], y = dipilih[j];
                var cekGrup = grupResistansiSama(x, y);
                if (cekGrup.sama) {
                    masalahList.push({
                        level: 'waspada',
                        judul: '♻️ Grup ' + cekGrup.jenis + ' sama: ' + x.bahanAktif + ' & ' + y.bahanAktif,
                        alasan: 'Keduanya grup ' + cekGrup.jenis + ' ' + cekGrup.grup + '. Mencampur tidak menambah efektivitas dan mempercepat resistensi.'
                    });
                }
            }
        }
        for (var p = 0; p < dipilih.length; p++) {
            for (var q = p + 1; q < dipilih.length; q++) {
                if (dipilih[p].formulasi === 'GR' || dipilih[q].formulasi === 'GR') continue; // sudah ditangani di atas
                var hasilFis = cekFormulasiPasangan(dipilih[p], dipilih[q]);
                if (hasilFis.level !== 'aman') {
                    masalahList.push({ level: hasilFis.level, judul: (hasilFis.level === 'kritis' ? '🔴' : '🟡') + ' Formulasi/pH: ' + dipilih[p].bahanAktif + ' & ' + dipilih[q].bahanAktif, alasan: hasilFis.alasan });
                }
            }
        }

        var daftarBahanHTML = dipilih.map(function (it) {
            var tandaCatatan = it.catatan ? ' ⚠️' : '';
            return '<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-main);margin-right:6px;margin-bottom:6px;display:inline-block;padding:4px 10px;border-radius:8px;font-size:0.75rem;">' + it.bahanAktif + tandaCatatan + ' <span style="opacity:0.6;">(' + it.formulasi + ')</span></span>';
        }).join('');

        var adaKritis = masalahList.some(function (m) { return m.level === 'kritis'; });
        var ringkasanHTML;

        if (masalahList.length === 0) {
            ringkasanHTML = '<div class="info-box" style="border-left-color:var(--accent-green);background:rgba(16,185,129,0.05);"><strong style="color:var(--accent-green);">✅ Campuran relatif aman dari sisi grup resistensi (IRAC/FRAC) dan formulasi.</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">Tetap lakukan jar test sebelum mencampur skala besar.</span></div>';
        } else {
            var warna = adaKritis ? 'var(--red-alert)' : 'var(--accent-soil)';
            ringkasanHTML = '<div class="info-box" style="border-left-color:' + warna + ';background:rgba(239,68,68,0.05);"><strong style="color:' + warna + ';">' + (adaKritis ? '🔴 Ditemukan masalah KRITIS pada campuran ini' : '🟡 Ada peringatan untuk campuran ini') + '</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">Lihat detail di bawah sebelum melanjutkan.</span></div>';
        }

        var detailHTML = masalahList.map(function (m) {
            var w = m.level === 'kritis' ? 'var(--red-alert)' : 'var(--accent-soil)';
            return '<div style="border-left:3px solid ' + w + ';background:rgba(255,255,255,0.02);border-radius:8px;padding:10px 12px;margin-bottom:10px;"><div style="font-weight:700;color:' + w + ';font-size:0.85rem;margin-bottom:4px;">' + m.judul + '</div><div style="font-size:0.8rem;color:var(--text-muted);line-height:1.5;">' + m.alasan + '</div></div>';
        }).join('');

        var nonGranular = dipilih.filter(function (i) { return i.formulasi !== 'GR'; });
        var langkahUrutan = nonGranular.length > 1 ? tentukanUrutanPencampuran(nonGranular) : [];
        var urutanHTML = '';
        if (langkahUrutan.length > 1) {
            urutanHTML = '<div style="margin-top:14px;"><div style="font-weight:700;font-size:0.85rem;color:var(--text-main);margin-bottom:6px;">🔄 Saran Urutan Mencampur di Tangki</div><ol style="font-size:0.8rem;color:var(--text-muted);padding-left:18px;line-height:1.8;">' +
                '<li>Isi tangki ± setengah dari volume air yang dibutuhkan.</li>' +
                langkahUrutan.map(function (l) { return '<li>' + l + '.</li>'; }).join('') +
                '<li>Tambahkan sisa air sampai volume akhir, aduk rata, lalu semprotkan habis — jangan diendapkan semalaman.</li>' +
                '</ol></div>';
        }

        var itemCatatan = dipilih.filter(function (i) { return i.catatan; });
        var catatanHTML = '';
        if (itemCatatan.length) {
            catatanHTML = '<div class="info-box" style="border-left-color:var(--accent-soil);background:rgba(217,119,6,0.08);margin-top:12px;"><strong style="color:var(--accent-soil);">⚠️ Catatan Khusus</strong>' +
                itemCatatan.map(function (i) { return '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;"><b>' + i.bahanAktif + '</b>: ' + i.catatan + '</div>'; }).join('') +
                '</div>';
        }

        divHasil.innerHTML = '<div style="margin-bottom:12px;">' + daftarBahanHTML + '</div>' + ringkasanHTML + (detailHTML ? '<div style="margin-top:12px;">' + detailHTML + '</div>' : '') + urutanHTML + catatanHTML;
        divHasil.style.display = 'block';
    }

    // ==========================================
    // 6. INTERCEPT switchMode (mode: 'aturpestisida')
    // ==========================================
    if (typeof window.switchMode === 'function') {
        var fungsiAsli = window.switchMode;

        window.switchMode = function (mode) {
            var boxEl = document.getElementById('boxAturPestisida');
            var tabEl = document.getElementById('tabAturPestisida');

            if (mode === 'aturpestisida') {
                sembunyikanSemua();

                document.querySelectorAll('.tab-btn').forEach(function (el) {
                    el.classList.remove('active');
                });

                if (boxEl) boxEl.style.display = 'block';
                if (tabEl) tabEl.classList.add('active');

                var titleM = document.getElementById('modeTitle');
                if (titleM) { titleM.innerText = 'Manajemen Pestisida'; titleM.style.color = 'var(--accent-hama)'; }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) subEl.style.display = 'none';

                try { if (typeof currentMode !== 'undefined') currentMode = mode; } catch (e) {}
                return;
            }

            if (boxEl) boxEl.style.display = 'none';
            if (tabEl) tabEl.classList.remove('active');

            fungsiAsli.apply(this, arguments);
        };

        console.log('%c✅ patch_pestisida v4.0 aktif — Tab: ATUR PESTISIDA (id: tabAturPestisida) | ' + databasePestisida.length + ' bahan aktif di database', 'color:#ef4444;font-weight:bold;');
    } else {
        console.warn('[patch_pestisida] window.switchMode belum tersedia saat patch dimuat.');
    }

})();
