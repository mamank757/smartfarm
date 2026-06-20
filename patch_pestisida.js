/**
 * ============================================================
 * PATCH PESTISIDA — Manajemen Terpadu (Rotasi + Mixing)
 * Versi: 3.2 — BUGFIX ID KONFLIK DENGAN HTML
 * ------------------------------------------------------------
 * PERBAIKAN v3.2:
 * - ID tab diubah dari 'tabPestisida' → 'tabAturPestisida'
 * - ID box diubah dari 'boxPestisida' → 'boxAturPestisida'
 * - Mode diubah dari 'pestisida'     → 'aturpestisida'
 * - Alasan: HTML sudah punya #tabPestisida dan #boxPestisida
 *   (fitur Cek Harga Pestisida Realtime), sehingga guard
 *   idempotency langsung aktif dan seluruh patch dibatalkan.
 * ============================================================
 */

(function () {
    'use strict';

    /* ── GUARD IDEMPOTENCY (ID baru, tidak bentrok dengan HTML) ── */
    if (document.getElementById('tabAturPestisida')) {
        console.warn('[patch_pestisida] #tabAturPestisida sudah ada — patch dibatalkan.');
        return;
    }

    // ==========================================
    // 1. DATABASE PESTISIDA (Formulasi & pH)
    // ==========================================
    var databasePestisida = [
        { id: 1,  bahanAktif: "Metomil",               merekPopuler: "Lannate 25 WP",      grupIrac: "1A", formulasi: "WP", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Penggerek Polong"] },
        { id: 2,  bahanAktif: "Karbofuran",             merekPopuler: "Furadan 3 GR",       grupIrac: "1A", formulasi: "GR", phStabil: [5, 7],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Nematoda", "Ulat Tanah", "Orong-orong"] },
        { id: 3,  bahanAktif: "BPMC (Fenobukarb)",      merekPopuler: "Bassa 50 EC",        grupIrac: "1A", formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Wereng Coklat", "Walang Sangit", "Kepik Hijau"] },
        { id: 4,  bahanAktif: "Klorpirifos",            merekPopuler: "Dursban 200 EC",     grupIrac: "1B", formulasi: "EC", phStabil: [4, 7],   basaKuat: false, targetHama: ["Kutu Putih", "Ulat Grayak", "Wereng Coklat", "Semut"] },
        { id: 5,  bahanAktif: "Profenofos",             merekPopuler: "Curacron 500 EC",    grupIrac: "1B", formulasi: "EC", phStabil: [4, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Thrips", "Kutu Kebul"] },
        { id: 6,  bahanAktif: "Dimetoat",               merekPopuler: "Perfekthion 400 EC", grupIrac: "1B", formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Kutu Daun", "Thrips", "Lalat Buah"] },
        { id: 7,  bahanAktif: "Fipronil",               merekPopuler: "Regent 50 SC",       grupIrac: "2B", formulasi: "SC", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Penggerek Batang Padi", "Orong-orong", "Rayap"] },
        { id: 8,  bahanAktif: "Sipermetrin",            merekPopuler: "Ripcord 50 EC",      grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Wereng Coklat", "Walang Sangit"] },
        { id: 9,  bahanAktif: "Deltametrin",            merekPopuler: "Decis 25 EC",        grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Walang Sangit", "Kutu Daun", "Kepik"] },
        { id: 10, bahanAktif: "Lamda-Sihalotrin",       merekPopuler: "Matador 25 EC",      grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Lalat Buah", "Kutu Kebul"] },
        { id: 11, bahanAktif: "Alfametrin",             merekPopuler: "Fastac 15 EC",       grupIrac: "3A", formulasi: "EC", phStabil: [4, 6.5], basaKuat: false, targetHama: ["Ulat Grayak", "Kutu Daun", "Penghisap Buah"] },
        { id: 12, bahanAktif: "Imidakloprid",           merekPopuler: "Confidor 5 WP",      grupIrac: "4A", formulasi: "WP", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips", "Kutu Daun"] },
        { id: 13, bahanAktif: "Tiametoksam",            merekPopuler: "Actara 25 WG",       grupIrac: "4A", formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Thrips"] },
        { id: 14, bahanAktif: "Dinotefuran",            merekPopuler: "Oshin 20 WP",        grupIrac: "4A", formulasi: "WP", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kepik Hijau"] },
        { id: 15, bahanAktif: "Nitenpiram",             merekPopuler: "Tenchu 20 SG",       grupIrac: "4A", formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Wereng Punggung Putih"] },
        { id: 16, bahanAktif: "Spinosad",               merekPopuler: "Tracer 120 SC",      grupIrac: "5",  formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips"] },
        { id: 17, bahanAktif: "Spinetoram",             merekPopuler: "Endure 120 SC",      grupIrac: "5",  formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Thrips", "Ulat Kubis"] },
        { id: 18, bahanAktif: "Abamektin",              merekPopuler: "Demolish 18 EC",     grupIrac: "6",  formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Tungau", "Thrips"] },
        { id: 19, bahanAktif: "Emamektin Benzoat",      merekPopuler: "Proclaim 5 SG",      grupIrac: "6",  formulasi: "SG", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggorok Daun", "Ulat Pelipat Daun"] },
        { id: 20, bahanAktif: "Pimetrozin",             merekPopuler: "Chess 50 WG",        grupIrac: "9B", formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Kebul", "Kutu Daun"] },
        { id: 21, bahanAktif: "Heksitiazoks",           merekPopuler: "Nissorun 50 EC",     grupIrac: "10A",formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Tungau Merah", "Tungau Kuning"] },
        { id: 22, bahanAktif: "Bacillus thuringiensis", merekPopuler: "Turex 50 WP",        grupIrac: "11A",formulasi: "WP", phStabil: [6, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"] },
        { id: 23, bahanAktif: "Diafentiuron",           merekPopuler: "Pegasus 500 SC",     grupIrac: "12A",formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Kutu Kebul", "Thrips", "Tungau", "Kutu Daun"] },
        { id: 24, bahanAktif: "Klorfenapir",            merekPopuler: "Arjuna 200 EC",      grupIrac: "13", formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Thrips", "Kutu Daun", "Tungau"] },
        { id: 25, bahanAktif: "Dimehipo",               merekPopuler: "Spontan 400 SL",     grupIrac: "14", formulasi: "SL", phStabil: [5, 8],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Wereng Coklat", "Ulat Pelipat Daun", "Lalat Bibit"] },
        { id: 26, bahanAktif: "Kartap Hidroklorida",    merekPopuler: "Padan 50 SP",        grupIrac: "14", formulasi: "SP", phStabil: [5, 7],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Pelipat Daun", "Wereng Coklat"] },
        { id: 27, bahanAktif: "Lufenuron",              merekPopuler: "Match 50 EC",        grupIrac: "15", formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Kubis"] },
        { id: 28, bahanAktif: "Klorfluazuron",          merekPopuler: "Atabron 50 EC",      grupIrac: "15", formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Polong"] },
        { id: 29, bahanAktif: "Novaluron",              merekPopuler: "Rimon 100 EC",       grupIrac: "15", formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Pelipat Daun", "Penggorok Daun"] },
        { id: 30, bahanAktif: "Buprofezin",             merekPopuler: "Applaud 10 WP",      grupIrac: "16", formulasi: "WP", phStabil: [5, 8],   basaKuat: false, targetHama: ["Wereng Coklat (Nimfa)", "Kutu Kebul", "Kutu Putih"] },
        { id: 31, bahanAktif: "Metoksifenozida",        merekPopuler: "Intrepid 250 SC",    grupIrac: "18", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Buah"] },
        { id: 32, bahanAktif: "Tebufenozida",           merekPopuler: "Mimic 20 F",         grupIrac: "18", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Penggerek Buah"] },
        { id: 33, bahanAktif: "Piridaben",              merekPopuler: "Samite 135 EC",      grupIrac: "21A",formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Tungau", "Kutu Kebul", "Thrips"] },
        { id: 34, bahanAktif: "Indoksakarb",            merekPopuler: "Ammate 150 EC",      grupIrac: "22A",formulasi: "EC", phStabil: [5, 7],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Krop", "Ulat Buah"] },
        { id: 35, bahanAktif: "Tetraniliprol",          merekPopuler: "Vayego 200 SC",      grupIrac: "28", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Buah"] },
        { id: 36, bahanAktif: "Klorantraniliprol",      merekPopuler: "Prevathon 50 SC",    grupIrac: "28", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Penggerek Batang Padi", "Ulat Grayak", "Ulat Pelipat Daun"] },
        { id: 37, bahanAktif: "Flubendiamida",          merekPopuler: "Belt 480 SC",        grupIrac: "28", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Polong"] },
        { id: 38, bahanAktif: "Sianantraniliprol",      merekPopuler: "Exirel 100 SE",      grupIrac: "28", formulasi: "EC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Kutu Kebul", "Penggorok Daun", "Ulat Grayak", "Thrips"] },
        { id: 39, bahanAktif: "Flonikamid",             merekPopuler: "Ulala 50 WG",        grupIrac: "29", formulasi: "SG", phStabil: [5, 9],   basaKuat: false, targetHama: ["Wereng Coklat", "Kutu Daun", "Thrips", "Kutu Kebul"] },
        { id: 40, bahanAktif: "Broflanilida",           merekPopuler: "Brofreya 53 SC",     grupIrac: "30", formulasi: "SC", phStabil: [5, 8],   basaKuat: false, targetHama: ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"] },
        { id: 41, bahanAktif: "Tembaga Hidroksida",     merekPopuler: "Kocide 77 WP",       grupIrac: null, formulasi: "WP", phStabil: [6, 8],   basaKuat: true,  targetHama: [] },
        { id: 42, bahanAktif: "Mankozeb",               merekPopuler: "Dithane M-45 WP",    grupIrac: null, formulasi: "WP", phStabil: [5, 7],   basaKuat: false, targetHama: [] },
        { id: 43, bahanAktif: "Pupuk Daun NPK + Mikro", merekPopuler: "Gandasil/Growmore",  grupIrac: null, formulasi: "SL", phStabil: [4, 6.5], basaKuat: false, targetHama: [] }
    ];

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
    // 2. INJEKSI TOMBOL TAB (ID baru: tabAturPestisida)
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
    // 3. BUAT STRUKTUR HTML BOX (ID baru: boxAturPestisida)
    // ==========================================
    var cardContainer = document.querySelector('.card');
    if (!cardContainer) return;

    // Helper slot mixing
    var SLOT_MIN  = 2;
    var SLOT_MAKS = 4;

    function buatOpsiBahan(includeKosong) {
        var html = includeKosong ? '<option value="">-- Pilih Bahan --</option>' : '';
        databasePestisida.forEach(function (item) {
            html += '<option value="' + item.id + '">' + item.bahanAktif +
                ' (' + item.formulasi + (item.grupIrac ? ', Grup ' + item.grupIrac : '') + ')</option>';
        });
        return html;
    }

    function buatSlotHTML(nomor) {
        return (
            '<div class="form-group mixing-slot" data-slot="' + nomor + '" style="margin-top:' + (nomor === 1 ? '0' : '10px') + ';">' +
                '<label>🧪 BAHAN ' + nomor + (nomor <= SLOT_MIN ? '' : ' (opsional)') + '</label>' +
                '<select class="form-select patch-mix-slot" data-slot="' + nomor + '" style="margin-bottom:0;">' +
                    buatOpsiBahan(true) +
                '</select>' +
            '</div>'
        );
    }

    var slotHTML = '';
    for (var s = 1; s <= SLOT_MIN; s++) slotHTML += buatSlotHTML(s);

    // HTML Rotasi
    var htmlRotasi =
        '<div class="info-box" style="border-left-color:var(--accent-hama);background:rgba(239,68,68,0.05);margin-bottom:20px;">' +
            '<strong style="color:var(--accent-hama);">♻️ Kalkulator Rotasi (Cegah Kebal)</strong><br>' +
            '<span style="font-size:0.8rem;color:var(--text-muted);">Cari rekomendasi bahan aktif alternatif berbeda cara kerja (Mode of Action) dari semprotan sebelumnya.</span>' +
        '</div>' +
        '<div class="form-lahan">' +
            '<div class="form-group">' +
                '<label>🐛 TARGET HAMA SAAT INI</label>' +
                '<select id="apPatchHama" class="form-select" style="margin-bottom:0;">' +
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
                '<select id="apPatchRacun" class="form-select" style="margin-bottom:0;">' +
                    '<option value="">-- Pilih Bahan Aktif --</option>' +
                '</select>' +
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
            '<span style="font-size:0.8rem;color:var(--text-muted);">Cek apakah racikan aman secara formulasi (tidak pecah) dan efisien (tidak dobel grup racun yang sama).</span>' +
        '</div>' +
        '<div class="form-lahan" id="apMixingSlotContainer">' + slotHTML + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;margin-bottom:12px;">' +
            '<button class="btn-main" id="apBtnTambahSlot" style="background:rgba(255,255,255,0.08);color:var(--text-main);flex:1;">➕ TAMBAH BAHAN</button>' +
            '<button class="btn-main" id="apBtnKurangSlot" style="background:rgba(255,255,255,0.08);color:var(--text-main);flex:1;display:none;">➖ KURANGI BAHAN</button>' +
        '</div>' +
        '<button class="btn-main" id="apBtnCekMixing" style="background:var(--accent-hama);color:#fff;margin-bottom:12px;">🔍 CEK KOMPATIBILITAS CAMPURAN</button>' +
        '<div id="apHasilMixing" style="display:none;margin-top:15px;"></div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:10px;line-height:1.6;">' +
            '⚠️ Data bersifat estimasi golongan kimia umum. ' +
            'Selalu lakukan <b>jar test</b> (campur skala kecil, diamkan 15 menit) sebelum aplikasi tangki besar.' +
        '</div>';

    var boxAturPestisida = document.createElement('div');
    boxAturPestisida.id           = 'boxAturPestisida';    // ← ID baru
    boxAturPestisida.style.display = 'none';
    boxAturPestisida.innerHTML =
        '<div style="margin-bottom:30px;">' + htmlRotasi + '</div>' +
        '<hr style="border:0;border-top:2px dashed rgba(255,255,255,0.1);margin:30px 0;">' +
        '<div>' + htmlMixing + '</div>';

    cardContainer.appendChild(boxAturPestisida);

    // Isi dropdown rotasi
    var selectRacun = document.getElementById('apPatchRacun');
    databasePestisida.forEach(function (item) {
        if (item.targetHama.length === 0) return;
        var opt = document.createElement('option');
        opt.value   = item.bahanAktif;
        opt.innerText = item.bahanAktif + ' (Grup ' + item.grupIrac + ') - cth: ' + item.merekPopuler;
        selectRacun.appendChild(opt);
    });

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

    document.getElementById('apBtnCekMixing').addEventListener('click', cekMixing);
    refreshTombolSlot();

    // ==========================================
    // 4A. LOGIKA ROTASI
    // ==========================================
    function hitungRotasi() {
        var hama  = document.getElementById('apPatchHama').value;
        var racun = document.getElementById('apPatchRacun').value;
        var div   = document.getElementById('apHasilRotasi');

        if (!racun) { alert('Pilih bahan aktif sebelumnya terlebih dahulu!'); return; }

        var dataSebelumnya = databasePestisida.filter(function (i) { return i.bahanAktif === racun; })[0];
        var grupTerlarang  = dataSebelumnya ? dataSebelumnya.grupIrac : '';

        var rekomendasi = databasePestisida.filter(function (i) {
            return i.targetHama.indexOf(hama) > -1 && i.grupIrac !== grupTerlarang;
        });

        div.innerHTML = '';
        if (rekomendasi.length === 0) {
            div.innerHTML = '<div class="info-box" style="border-left-color:var(--red-alert);">Tidak ada rotasi alternatif di database untuk hama ini.</div>';
        } else {
            var html = '<div class="info-box" style="border-left-color:var(--accent-green);background:rgba(16,185,129,0.05);">' +
                '<strong style="color:var(--accent-green);">✅ Rekomendasi Opsi (Selain Grup ' + grupTerlarang + ')</strong><br><br>';
            rekomendasi.forEach(function (rek) {
                html +=
                    '<div style="border-bottom:1px dashed rgba(255,255,255,0.1);padding-bottom:10px;margin-bottom:10px;">' +
                        '<div style="font-size:1.05rem;font-weight:700;color:var(--text-main);">' + rek.bahanAktif +
                            ' <span class="badge" style="background:var(--accent-green);color:#fff;font-size:0.6rem;margin-left:5px;">Grup ' + rek.grupIrac + '</span></div>' +
                        '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Contoh Merek di Kios: <b>' + rek.merekPopuler + '</b></div>' +
                    '</div>';
            });
            html += '</div>';
            div.innerHTML = html;
        }
        div.style.display = 'block';
    }

    // ==========================================
    // 4B. LOGIKA MIXING
    // ==========================================
    function cariBahanById(id) {
        var hasil = databasePestisida.filter(function (it) { return String(it.id) === String(id); });
        return hasil.length ? hasil[0] : null;
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
        var formSet = [a.formulasi, b.formulasi].sort().join('+');
        if (formSet === 'EC+WP') {
            return { level: 'waspada', alasan: 'Kombinasi EC (' + (a.formulasi === 'EC' ? a.bahanAktif : b.bahanAktif) + ') dan WP (' + (a.formulasi === 'WP' ? a.bahanAktif : b.bahanAktif) + ') berisiko pecah emulsi. Wajib jar test; urutan: air → WP → aduk → EC → aduk.' };
        }
        if (formSet === 'EC+SL') {
            return { level: 'waspada', alasan: 'Kombinasi SL dan EC kadang menyebabkan pemisahan fase pada konsentrasi tinggi. Lakukan jar test.' };
        }
        return { level: 'aman', alasan: '' };
    }

    function cekMixing() {
        var selects = Array.prototype.slice.call(document.querySelectorAll('#apMixingSlotContainer .patch-mix-slot'));
        var dipilih = selects
            .map(function (sel) { return sel.value; })
            .filter(function (v) { return v !== ''; })
            .map(cariBahanById)
            .filter(function (it) { return it !== null; });

        var divHasil = document.getElementById('apHasilMixing');

        if (dipilih.length < 2) { alert('Pilih minimal 2 bahan untuk dicek kompatibilitasnya!'); return; }

        var idSet = {}; var adaDuplikat = false;
        dipilih.forEach(function (it) { if (idSet[it.id]) adaDuplikat = true; idSet[it.id] = true; });
        if (adaDuplikat) { alert('Ada bahan yang dipilih lebih dari satu kali.'); return; }

        var masalahList = [];

        for (var i = 0; i < dipilih.length; i++) {
            for (var j = i + 1; j < dipilih.length; j++) {
                var x = dipilih[i], y = dipilih[j];
                if (x.grupIrac && y.grupIrac && x.grupIrac === y.grupIrac) {
                    masalahList.push({ level: 'waspada', judul: '♻️ Grup IRAC sama: ' + x.bahanAktif + ' & ' + y.bahanAktif, alasan: 'Keduanya grup ' + x.grupIrac + '. Mencampur tidak menambah efektivitas dan mempercepat resistensi hama.' });
                }
            }
        }
        for (var p = 0; p < dipilih.length; p++) {
            for (var q = p + 1; q < dipilih.length; q++) {
                var hasilFis = cekFormulasiPasangan(dipilih[p], dipilih[q]);
                if (hasilFis.level !== 'aman') {
                    masalahList.push({ level: hasilFis.level, judul: (hasilFis.level === 'kritis' ? '🔴' : '🟡') + ' Formulasi/pH: ' + dipilih[p].bahanAktif + ' & ' + dipilih[q].bahanAktif, alasan: hasilFis.alasan });
                }
            }
        }

        var daftarBahanHTML = dipilih.map(function (it) {
            return '<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-main);margin-right:6px;margin-bottom:6px;display:inline-block;padding:4px 10px;border-radius:8px;font-size:0.75rem;">' + it.bahanAktif + ' <span style="opacity:0.6;">(' + it.formulasi + ')</span></span>';
        }).join('');

        var adaKritis = masalahList.some(function (m) { return m.level === 'kritis'; });
        var ringkasanHTML;

        if (masalahList.length === 0) {
            ringkasanHTML = '<div class="info-box" style="border-left-color:var(--accent-green);background:rgba(16,185,129,0.05);"><strong style="color:var(--accent-green);">✅ Campuran relatif aman dari sisi IRAC dan formulasi.</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">Tetap lakukan jar test sebelum mencampur skala besar.</span></div>';
        } else {
            var warna = adaKritis ? 'var(--red-alert)' : 'var(--accent-soil)';
            ringkasanHTML = '<div class="info-box" style="border-left-color:' + warna + ';background:rgba(239,68,68,0.05);"><strong style="color:' + warna + ';">' + (adaKritis ? '🔴 Ditemukan masalah KRITIS pada campuran ini' : '🟡 Ada peringatan untuk campuran ini') + '</strong><br><span style="font-size:0.78rem;color:var(--text-muted);">Lihat detail di bawah sebelum melanjutkan.</span></div>';
        }

        var detailHTML = masalahList.map(function (m) {
            var w = m.level === 'kritis' ? 'var(--red-alert)' : 'var(--accent-soil)';
            return '<div style="border-left:3px solid ' + w + ';background:rgba(255,255,255,0.02);border-radius:8px;padding:10px 12px;margin-bottom:10px;"><div style="font-weight:700;color:' + w + ';font-size:0.85rem;margin-bottom:4px;">' + m.judul + '</div><div style="font-size:0.8rem;color:var(--text-muted);line-height:1.5;">' + m.alasan + '</div></div>';
        }).join('');

        divHasil.innerHTML = '<div style="margin-bottom:12px;">' + daftarBahanHTML + '</div>' + ringkasanHTML + (detailHTML ? '<div style="margin-top:12px;">' + detailHTML + '</div>' : '');
        divHasil.style.display = 'block';
    }

    // ==========================================
    // 5. INTERCEPT switchMode (mode: 'aturpestisida')
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

            // Mode lain: pastikan box & tab patch ikut disembunyikan/deaktifkan
            if (boxEl) boxEl.style.display = 'none';
            if (tabEl) tabEl.classList.remove('active');

            fungsiAsli.apply(this, arguments);
        };

        console.log('%c✅ patch_pestisida v3.2 aktif — Tab: ATUR PESTISIDA (id: tabAturPestisida)', 'color:#ef4444;font-weight:bold;');
    } else {
        console.warn('[patch_pestisida] window.switchMode belum tersedia saat patch dimuat.');
    }

})();
