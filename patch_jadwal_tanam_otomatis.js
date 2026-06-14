/**
 * ============================================================
 *  patch_jadwal_tanam_otomatis.js
 *  Versi: 3.10 — Badge Status Musim Tersambung ke UI
 * ------------------------------------------------------------
 *  PERBAIKAN v3.10 vs v3.9:
 *
 *  [FIX KRITIS] Di v3.9, flag `isLewat`/`isBerjalan` SUDAH
 *    dihitung di rekomendasiWindowTanam(), tapi TIDAK PERNAH
 *    dibaca oleh renderOutput()/renderKartu() — badge musim
 *    "📋 Blueprint" / "🟢 Aktif" yang dijanjikan tidak pernah
 *    muncul. [FIX] renderOutput() kini membaca rek.isLewat /
 *    rek.isBerjalan dan menampilkan badge + opacity muted pada
 *    header & box info musim, dan meneruskan rek.isLewat ke
 *    renderKartu() sehingga setiap kartu kegiatan ikut ditandai.
 *
 *  [FIX KRITIS] Cara menghitung isLewat/isBerjalan diganti total.
 *    v3.9 memakai heuristik kasar "bTanam < bulanSekarang ||
 *    (bTanam === bulanSekarang && now.getDate() > 20)" — yang
 *    tidak sinkron dengan tanggal tanam aktual hasil
 *    cariTglFaseBulan() (fase bulan 3–8 bisa jatuh di tanggal
 *    berapa pun tergantung siklus sinodis).
 *    [FIX] Sekarang dihitung oleh statusWaktuTanam(tglTanam, now)
 *    SETELAH tglFaseBaik/tglFaseFallback final didapat:
 *      isLewat    : tglTanam < hari ini → "Blueprint Proyeksi"
 *      isBerjalan : belum lewat & jatuh di bulan+tahun ini → "🟢 Aktif"
 *
 *    Tampilan UI:
 *      - Sudah lewat     → badge abu "📋 Blueprint" + opacity muted
 *      - Sedang berjalan → badge hijau berkedip "🟢 Aktif"
 *      - Akan datang     → tampilan normal
 *
 *    Kartu kegiatan yang sudah lewat juga diberi visual
 *    "Realisasi / Referensi" agar petani tahu ini adalah
 *    rekonstruksi proyeksi, bukan instruksi aktif.
 *
 *  [TETAP dari v3.8/v3.9] Semua fix lainnya (cariTglFaseBulan
 *    dengan batasBulan, normalisasi 2 argumen, deteksi lembah
 *    ekuatorial, invalidasi cache ZOM, threshold 10, HST via
 *    tambahHari, tahun selalu berjalan) tetap aktif.
 * ============================================================
 */

(function () {
    'use strict';

    /* ──────────────────────────────────────────────────────────
       KONSTANTA GLOBAL
    ────────────────────────────────────────────────────────── */
    var WARNA = '#3b82f6';
    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
    var NAMA_BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun',
                              'Jul','Agu','Sep','Okt','Nov','Des'];

    var LABEL_ZONA = {
        monsunal:   'MONSUNAL',
        ekuatorial: 'EKUATORIAL',
        peralihan:  'PERALIHAN',
        lokal:      'LOKAL'
    };

    /* ──────────────────────────────────────────────────────────
       UTILITAS TANGGAL & FASE BULAN
    ────────────────────────────────────────────────────────── */
    function tambahHari(d, n) {
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }
    function tanggalDariBulanTahun(bulanIdx, tahun) {
        return new Date(tahun, bulanIdx, 1);
    }
    function formatTglLengkap(d) {
        return NAMA_HARI[d.getDay()] + ', ' +
               d.getDate() + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
    }
    function formatTglPendek(d) {
        return d.getDate() + ' ' + NAMA_BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear();
    }

    /**
     * [v3.10 FIX] Tentukan status waktu (Lewat / Berjalan / Akan Datang)
     * berdasarkan TANGGAL TANAM FINAL (tglFaseBaik/tglFaseFallback) —
     * bukan lagi dari bulan kasar + heuristik "tanggal > 20" yang tidak
     * selalu sinkron dengan tanggal tanam aktual hasil cariTglFaseBulan().
     *
     *   isLewat    : tanggal tanam sudah lewat dari hari ini
     *                → ditampilkan sebagai "Blueprint Proyeksi"
     *   isBerjalan : belum lewat, dan jatuh di bulan & tahun yang sama
     *                dengan sekarang → musim ini sedang aktif/berjalan
     */
    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }
    function namaFaseBulan(h) {
        if (h < 1.5)  return { nama: 'Bulan Mati',        ikon: '🌑' };
        if (h < 7.4)  return { nama: 'Bulan Sabit Muda', ikon: '🌒' };
        if (h < 8.4)  return { nama: 'Kuartal Pertama',  ikon: '🌓' };
        if (h < 14.8) return { nama: 'Bulan Cembung',    ikon: '🌔' };
        if (h < 15.8) return { nama: 'Bulan Penuh',      ikon: '🌕' };
        if (h < 22.1) return { nama: 'Bulan Cembung',    ikon: '🌖' };
        if (h < 23.1) return { nama: 'Kuartal Ketiga',   ikon: '🌗' };
        if (h < 29.0) return { nama: 'Bulan Sabit Tua',  ikon: '🌘' };
        return                { nama: 'Bulan Mati',        ikon: '🌑' };
    }

    /**
     * [FIX KRITIS #2]
     * Tambahkan parameter `batasBulan` (opsional, 0–11).
     * Fungsi tidak akan mengembalikan tanggal di luar bulan target tsb.
     * Iterasi diperpanjang ke 45 hari agar menutup seluruh siklus fase
     * yang bisa jatuh di awal bulan berikutnya.
     *
     * @param {Date}   acuan       - Tanggal mulai pencarian
     * @param {number} faseMin     - Batas bawah fase (hari)
     * @param {number} faseMax     - Batas atas fase (hari)
     * @param {number} offsetMulai - Offset awal (hari)
     * @param {number|null} batasBulan - Index bulan target (0–11), atau null = bebas
     */
    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            // [FIX] Jangan melampaui bulan target jika ditentukan
            if (batasBulan !== null && batasBulan !== undefined &&
                t.getMonth() !== batasBulan) {
                continue;
            }
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        // Fallback: kembalikan tanggal mulai
        return mulai;
    }

    /* ──────────────────────────────────────────────────────────
       DATA ZOM DAN SKOR KELEMBAPAN
    ────────────────────────────────────────────────────────── */

    // [FIX SEDANG #3] Cache menyimpan koordinat untuk invalidasi
    var _cacheZOM = null;
    var _cacheZOMKoord = null;

    var FALLBACK_ZOM_PER_ZONA = {
        monsunal:   { data: [0.9, 0.8, 0.6, 0.3, -0.1, -0.8, -1.2, -1.3, -0.9, -0.3, 0.4, 0.8], nama: 'Pola Monsunal (estimasi)' },
        ekuatorial: { data: [0.2, 0.3, 0.5, 0.6,  0.4,  0.0, -0.3, -0.2,  0.3,  0.6, 0.5, 0.3], nama: 'Pola Ekuatorial (estimasi)' },
        peralihan:  { data: [0.5, 0.5, 0.4, 0.2,  0.0, -0.4, -0.6, -0.6, -0.3,  0.1, 0.4, 0.5], nama: 'Pola Peralihan (estimasi)' },
        lokal:      { data: [0.1, 0.1, 0.1, 0.0,  0.0, -0.1, -0.1, -0.1,  0.0,  0.1, 0.1, 0.1], nama: 'Pola Lokal (estimasi)' }
    };

    /**
     * [FIX SEDANG #3] Invalidasi cache jika koordinat berubah > ~5 km.
     * Menggunakan approx haversine sederhana (derajat ke km).
     */
    function koordinatBerubah(lat, lon) {
        if (!_cacheZOMKoord) return true;
        var dLat = Math.abs(lat - _cacheZOMKoord.lat) * 111;
        var dLon = Math.abs(lon - _cacheZOMKoord.lon) * 111 * Math.cos(lat * Math.PI / 180);
        return Math.sqrt(dLat * dLat + dLon * dLon) > 5;
    }

    async function getDataZOM(lat, lon) {
        // [FIX] Invalidasi cache jika koordinat berbeda signifikan
        if (_cacheZOM && !koordinatBerubah(lat, lon)) return _cacheZOM;
        if (koordinatBerubah(lat, lon)) {
            _cacheZOM = null;
            _cacheZOMKoord = null;
        }

        var zona = (typeof window.tentukanZonaIklim === 'function')
            ? window.tentukanZonaIklim(lat, lon)
            : 'monsunal';

        var fallbackZona = FALLBACK_ZOM_PER_ZONA[zona] || FALLBACK_ZOM_PER_ZONA.monsunal;
        var fallback = { data: fallbackZona.data, nama: fallbackZona.nama, jarak: null, zona: zona };

        try {
            var urlZOM = (typeof URL_ZOM_LOKAL !== 'undefined') ? URL_ZOM_LOKAL : '';
            if (!urlZOM) return fallback;

            var res  = await fetch(urlZOM);
            var data = await res.json();
            var arr  = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : null;
            if (!arr) return fallback;

            var haversine = window.hitungJarakHaversine || function() { return 999; };
            var jMin = Infinity, kab = null;
            arr.forEach(function (k) {
                var lk = parseFloat(k.lat), lnk = parseFloat(k.lon);
                if (!isNaN(lk) && !isNaN(lnk)) {
                    var j = haversine(lat, lon, lk, lnk);
                    if (j < jMin) { jMin = j; kab = k; }
                }
            });

            if (kab && jMin <= 150) {
                var keys = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
                _cacheZOM = {
                    data: keys.map(function (k) { return parseFloat(kab[k]) || 0; }),
                    nama: kab.kabupaten_kota || 'Lokal',
                    jarak: jMin.toFixed(1),
                    zona: zona
                };
                // [FIX] Simpan koordinat yang dipakai untuk cache ini
                _cacheZOMKoord = { lat: lat, lon: lon };
                return _cacheZOM;
            }
        } catch (e) {
            console.warn('[JadwalOtomatis] ZOM:', e.message);
        }
        return fallback;
    }

    /**
     * [FIX SEDANG #1]
     * Teruskan bulanIdx sebagai argumen kedua ke normalisasiCurahHujan
     * agar implementasi asli yang mungkin menggunakannya bekerja benar.
     */
    function skorKelembapan(bulanIdx, baselineArr, ensoVal, iodVal, lat, lon) {
        var norm = window.normalisasiCurahHujan || function (v /*, bulanIdx */) {
            return v < 30 ? -1.5 : v < 75 ? -0.8 : v < 150 ? 0.0 : v < 250 ? 0.8 : 1.5;
        };

        var bl  = baselineArr[bulanIdx];
        // [FIX] Teruskan bulanIdx sebagai argumen kedua
        var idx = bl > 10 ? norm(bl, bulanIdx) : bl;

        var wE, wI;
        var tabelBobot = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        var zonaFn     = window.tentukanZonaIklim;

        if (tabelBobot && typeof zonaFn === 'function' && typeof lat === 'number' && typeof lon === 'number') {
            var zona  = zonaFn(lat, lon);
            var tabel = tabelBobot[zona] || tabelBobot.monsunal;
            wE = tabel.enso[bulanIdx];
            wI = tabel.iod[bulanIdx];
        } else {
            var wFallback = [
                [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],
                [0.18,0.12],[0.35,0.20],[0.45,0.28],[0.50,0.38],
                [0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
            ];
            wE = wFallback[bulanIdx][0];
            wI = wFallback[bulanIdx][1];
        }

        var tot = 1 + wE + wI;
        var s   = (idx / tot) - (ensoVal * wE / tot) - (iodVal * wI / tot);
        return Math.max(0, Math.min(100, Math.round(50 + s * 25)));
    }

    /* ──────────────────────────────────────────────────────────
       MESIN REKOMENDASI TAHUNAN STATIS (DETEKSI MUSIM DINAMIS)
    ────────────────────────────────────────────────────────── */
    function rekomendasiWindowTanam(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        // 1. CARI BLOK 6 BULAN TERBASAH (DATA MENTAH mm)
        var maxSum = -Infinity;
        var startRendeng = 0;
        for (var i = 0; i < 12; i++) {
            var sum = 0;
            for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
            if (sum > maxSum) { maxSum = sum; startRendeng = i; }
        }

        // 2. TENTUKAN AWAL GADU
        // [FIX SEDANG #2] Zona ekuatorial: cari lembah (blok terkering) sebagai batas Gadu
        var startGadu;
        if (zona === 'ekuatorial') {
            var minSum = Infinity;
            startGadu = (startRendeng + 6) % 12; // default
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    // Pilih lembah yang tidak overlap dengan blok Rendeng
                    var tengahLembah = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum;
                        startGadu = ii;
                    }
                }
            }
        } else {
            startGadu = (startRendeng + 6) % 12;
        }

        var rendengBulan = [startRendeng, (startRendeng+1)%12, (startRendeng+2)%12, (startRendeng+3)%12];
        var gaduBulan    = [startGadu,    (startGadu+1)%12,    (startGadu+2)%12,    (startGadu+3)%12];

        var MUSIM = [
            { nama: 'MT I — Musim Utama (Puncak Hujan)',  kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: 'MT II — Musim Kedua (Hujan Menurun)', kode: 'gadu',   bulanTanam: gaduBulan   }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90, persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen:110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen:125, persenGen: 0.55 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {

                // [v3.9] SELALU TAHUN BERJALAN — tidak ada geser ke tahun depan.
                var tahunTanam = tahunSekarang;

                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen   = Math.floor(v.panen * v.persenGen);

                    // [FIX MINOR #2] Gunakan tambahHari untuk indeks bulan,
                    // konsisten dengan bangunKegiatan()
                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunTanam);
                    var bGenIdx     = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHari(tglTanamRef, v.panen).getMonth();

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];

                    var nilaiGen   = 100 - Math.abs(skorGen - 40);
                    var nilaiPanen = 100 - skorPanen;
                    var nilaiTotal = (nilaiGen * 0.55) + (nilaiPanen * 0.45);

                    var bVeg1 = (bTanam + 1) % 12;
                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;

                    // [FIX MINOR #1] Penalti progresif untuk bulan kering
                    // (menggantikan hard-threshold tunggal di 15)
                    if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;

                    kandidatMusim.push({
                        musimNama   : musim.nama,
                        musimKode   : musim.kode,
                        bTanam      : bTanam,
                        tahunTanam  : tahunTanam,
                        varietas    : v.kode,
                        labelVar    : v.label,
                        panen       : v.panen,
                        nilaiTotal  : nilaiTotal,
                        skorTanam   : skorTanam,
                        skorGen     : skorGen,
                        skorPanen   : skorPanen,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                var bFallback       = musim.bulanTanam[0];
                // [v3.9] Selalu tahun berjalan
                var tglAwalFallback = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulan(tglAwalFallback, 3, 8, 0, bFallback);

                // [v3.10 FIX] Status waktu dihitung dari tanggal tanam FINAL
                var statusFallback  = statusWaktuTanam(tglFaseFallback, now);

                hasilDuaMusim.push({
                    musimNama  : musim.nama,
                    musimKode  : musim.kode,
                    tglTanam   : tglFaseFallback,
                    varietas   : 'sedang',
                    labelVar   : 'Sedang (95–115 HST)',
                    alasan     : 'Kondisi kering ekstrem di seluruh jendela tanam musim ini. Dipilih tanggal default fase bulan terbaik. Pompanisasi penuh mungkin diperlukan.',
                    isLewat    : statusFallback.isLewat,
                    isBerjalan : statusFallback.isBerjalan
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);

                // [FIX KRITIS #2] Semua panggilan cariTglFaseBulan kini
                // menyertakan batasBulan agar tidak melampaui bulan target
                var tglFaseBaik = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);

                // Fallback ke 7 hari kemudian jika belum di bulan yang tepat
                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                }
                // Fallback akhir: tanggal 10 bulan tersebut
                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
                }

                // [v3.10 FIX] Status waktu dihitung dari tanggal tanam FINAL
                // (tglFaseBaik), bukan dari bulan kasar + heuristik tanggal 20.
                var statusBest = statusWaktuTanam(tglFaseBaik, now);

                var keteranganSkorGen =
                    best.skorGen < 25 ? 'kering — risiko puso' :
                    best.skorGen > 70 ? 'basah — waspada Blast' :
                    'optimal pembungaan';

                var keteranganSkorPanen =
                    best.skorPanen > 65 ? 'basah — butuh dryer' :
                    best.skorPanen < 20 ? 'kering ideal' :
                    'sedang — aman';

                var alasan =
                    'Skor bulan tanam: ' + best.skorTanam + '/100. ' +
                    'Generatif jatuh di ' + best.namaBulanGen +
                    ' (' + keteranganSkorGen + '). ' +
                    'Panen di ' + best.namaBulanPanen +
                    ' (' + keteranganSkorPanen + ').';

                hasilDuaMusim.push({
                    musimNama  : best.musimNama,
                    musimKode  : best.musimKode,
                    tglTanam   : tglFaseBaik,
                    varietas   : best.varietas,
                    labelVar   : best.labelVar,
                    alasan     : alasan,
                    isLewat    : statusBest.isLewat,
                    isBerjalan : statusBest.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function(a, b) { return a.tglTanam.getTime() - b.tglTanam.getTime(); });
        return hasilDuaMusim;
    }

    /* ──────────────────────────────────────────────────────────
       KALKULASI RISIKO PER KEGIATAN (tidak berubah dari v3.7)
    ────────────────────────────────────────────────────────── */
    function risikoOlah(skor) {
        if (skor < 25) return { level:'Kering', catatan:'Siapkan pompanisasi awal sebelum bajak.', warna:'#ef4444' };
        if (skor > 80) return { level:'Sangat Basah', catatan:'Tunggu lahan bisa diluku — hindari traktor amblas.', warna:'#3b82f6' };
        return               { level:'Baik', catatan:'Kondisi optimal untuk bajak dan garu.', warna:'#10b981' };
    }
    function risikoBenih(skor) {
        if (skor > 75) return { level:'Waspada', catatan:'Buat drainase bedeng persemaian — cegah rebah semai.', warna:'#f59e0b' };
        if (skor < 25) return { level:'Siram Rutin', catatan:'Siram pagi & sore untuk jaga kelembapan media semai.', warna:'#f59e0b' };
        return               { level:'Optimal', catatan:'Cuaca mendukung perkecambahan benih.', warna:'#10b981' };
    }
    function risikoTanam(skor) {
        if (skor > 80) return { level:'Genangan', catatan:'Siapkan pompa — jaga kedalaman air 2–3 cm saja.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Kritis', catatan:'Tunda atau siapkan pompanisasi penuh.', warna:'#ef4444' };
        return               { level:'Baik', catatan:'Kondisi air mendukung penanaman.', warna:'#10b981' };
    }
    function risikoTikus(faseBulan) {
        if (faseBulan < 4 || faseBulan > 25)
            return { level:'Optimal', catatan:'Malam gelap — umpan antikoagulan maksimal efektif.', warna:'#10b981' };
        return { level:'Kurang Optimal', catatan:'Bulan bercahaya — tetap pasang TBS & gropyokan.', warna:'#f59e0b' };
    }
    function risikoPupuk(skor) {
        if (skor > 75) return { level:'Risiko Tercuci', catatan:'Hindari hari hujan — pupuk 1–2 hari sebelum hujan ringan.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Tanah Kering', catatan:'Pastikan ada air di petakan sebelum tabur pupuk.', warna:'#ef4444' };
        return               { level:'Optimal', catatan:'Cuaca mendukung serapan pupuk.', warna:'#10b981' };
    }
    function risikoInsektisida(skor, faseBulan) {
        var level = 'Baik', warna = '#10b981', catatan = '';
        if (skor > 75) { catatan = 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
        if (faseBulan >= 13 && faseBulan <= 17) {
            catatan += 'Puncak penerbangan ngengat PBP — pasang lampu perangkap.';
            warna = '#ef4444'; level = 'Waspada';
        } else if (faseBulan >= 12 && faseBulan <= 18) {
            catatan += 'Mendekati bulan penuh — pantau kelompok telur PBP.';
            if (warna !== '#ef4444') { warna = '#f59e0b'; level = 'Siaga'; }
        } else {
            catatan += 'Waktu aplikasi aman dari puncak ngengat.';
        }
        return { level: level, catatan: catatan.trim(), warna: warna };
    }
    function risikoFungisida(skor) {
        if (skor > 65) return { level:'Kritis Blast', catatan:'Cuaca lembap — semprot Tricyclazole 7 hari sebelum bunting.', warna:'#ef4444' };
        if (skor > 45) return { level:'Waspada', catatan:'Pantau bercak belah ketupat — semprot preventif.', warna:'#f59e0b' };
        return               { level:'Aman', catatan:'Risiko blast rendah — cukup monitoring rutin.', warna:'#10b981' };
    }
    function risikoPanen(skor) {
        if (skor > 75) return { level:'Sulit Kering', catatan:'Siapkan dryer — jangan tumpuk gabah lembap.', warna:'#ef4444' };
        if (skor > 55) return { level:'Waspada Hujan', catatan:'Panen pagi hari — hindari sore hujan.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Ideal', catatan:'Kondisi sempurna — pesan combine 14 hari sebelumnya.', warna:'#10b981' };
        return               { level:'Baik', catatan:'Koordinasikan combine harvester.', warna:'#10b981' };
    }

    /* ──────────────────────────────────────────────────────────
       BANGUN DAFTAR KEGIATAN (tidak berubah dari v3.7)
    ────────────────────────────────────────────────────────── */
    function bangunKegiatan(tglTanam, varietas, skorBulan) {
        var of = {
            genjah: { benih:14, p1:7,  p2:28, p3:45, i1:20, i2:45, fung:55, panen:90  },
            sedang: { benih:21, p1:7,  p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 },
            dalam:  { benih:28, p1:7,  p2:35, p3:65, i1:30, i2:65, fung:75, panen:125 }
        }[varietas] || { benih:21, p1:7, p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 };

        // PERBAIKAN TIMELINE AGRONOMI: Lahan utama dan bibit diproses paralel
        var tglBenih  = tambahHari(tglTanam, -of.benih);
        var hariOlah  = 14; // Pengolahan lahan utama fix 2 minggu sebelum tanam
        var tglOlah   = tambahHari(tglTanam, -hariOlah);
        var tglTBS    = tambahHari(tglTanam, -7);
        var tglTikusA = cariTglFaseBulan(tglTanam, 26, 29.5, -10, null);
        var tglP1     = tambahHari(tglTanam, of.p1);
        var tglP2     = tambahHari(tglTanam, of.p2);
        var tglP3     = tambahHari(tglTanam, of.p3);
        var tglI1     = tambahHari(tglTanam, of.i1);
        var tglI2     = tambahHari(tglTanam, of.i2);
        var tglFung   = tambahHari(tglTanam, of.fung);
        var tglPanen  = tambahHari(tglTanam, of.panen);

        [tglI1, tglI2].forEach(function (t, idx) {
            var f = hariFaseBulan(t);
            if (f >= 13.5 && f <= 16.5) {
                if (idx === 0) tglI1 = tambahHari(t, 5);
                else           tglI2 = tambahHari(t, 5);
            }
        });

        function sk(tgl) { return skorBulan[tgl.getMonth()]; }

        var daftar = [
            {
                nama:'Pengolahan Lahan', ikon:'🚜', deskripsi:'Bajak, garu, pemerataan petakan',
                tglMulai: tglOlah, tglSelesai: tambahHari(tglOlah, 7),
                risiko: risikoOlah(sk(tglOlah)),
                tips:[
                    'Olah lahan utama 14 hari sebelum tanam (biarkan gulma membusuk sementara bibit tumbuh di persemaian).',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha saat bajak pertama.'
                ]
            },
            {
                nama:'Pembibitan Benih', ikon:'🌱', deskripsi:'Seleksi, rendam, kecambah, semai',
                tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips:[
                    'Inkubasi lembap 48 jam hingga kecambah 2–3 mm.',
                    'Dosis semai: 25–35 kg/ha (tapin) atau 50–100 kg/ha (tabela).'
                ]
            },
            {
                nama:'Pasang TBS & Gropyokan', ikon:'🐀', deskripsi:'Trap Barrier System + gropyokan massal',
                tglMulai: tglTBS, tglSelesai: tambahHari(tglTBS, 3),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:[
                    'Pasang TBS di sudut petakan — plastik setinggi 60 cm.',
                    'Gropyokan minimal 3 petani (efek pengusir massal).'
                ]
            },
            {
                nama:'Tanam Pindah / Tabela', ikon:'🌾', deskripsi:'Penanaman bibit ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 3),
                risiko: risikoTanam(sk(tglTanam)),
                tips:[
                    'Umur bibit optimal: ' + of.benih + ' HSS (tapin).',
                    'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.'
                ]
            },
            {
                nama:'Umpan Racun Tikus', ikon:'☠️', deskripsi:'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglTikusA, tglSelesai: tambahHari(tglTikusA, 5),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:[
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                    'Tempatkan dalam bait station di mulut liang.'
                ]
            },
            {
                nama:'Pupuk Dasar (Tahap I)', ikon:'🧪', deskripsi:'NPK Phonska + Urea I — awal anakan',
                tglMulai: tglP1, tglSelesai: tambahHari(tglP1, 2),
                risiko: risikoPupuk(sk(tglP1)),
                tips:[
                    'Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                    'Sebar saat air macak-macak.'
                ]
            },
            {
                nama:'Insektisida I (Vegetatif)', ikon:'💊', deskripsi:'Pengendalian WBC, Penggerek, Sundep',
                tglMulai: tglI1, tglSelesai: tambahHari(tglI1, 2),
                risiko: risikoInsektisida(sk(tglI1), hariFaseBulan(tglI1)),
                tips:[
                    'Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                    'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.'
                ]
            },
            {
                nama:'Pupuk Susulan I (Tahap II)', ikon:'🧪', deskripsi:'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHari(tglP2, 2),
                risiko: risikoPupuk(sk(tglP2)),
                tips:[
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                    'Cek warna daun dengan BWD — skala 3+ tahan Urea.'
                ]
            },
            {
                nama:'Pupuk Susulan II (Tahap III)', ikon:'🧪', deskripsi:'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: tambahHari(tglP3, 2),
                risiko: risikoPupuk(sk(tglP3)),
                tips:[
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.'
                ]
            },
            {
                nama:'Insektisida II (Generatif)', ikon:'💊', deskripsi:'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHari(tglI2, 2),
                risiko: risikoInsektisida(sk(tglI2), hariFaseBulan(tglI2)),
                tips:[
                    'Semprot pagi hari saat walang sangit masih di tanaman.',
                    'Bahan aktif kontak: Malathion, Deltametrin.'
                ]
            },
            {
                nama:'Fungisida Blast (Bunting)', ikon:'🍄', deskripsi:'Preventif Blast Leher Malai — fase bunting',
                tglMulai: tglFung, tglSelesai: tambahHari(tglFung, 2),
                risiko: risikoFungisida(sk(tglFung)),
                tips:[
                    'Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                    'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.'
                ]
            },
            {
                nama:'Panen', ikon:'🌟', deskripsi:'Potong saat kadar air gabah 20–25%',
                tglMulai: tglPanen, tglSelesai: tambahHari(tglPanen, 5),
                risiko: risikoPanen(sk(tglPanen)),
                tips:[
                    'Panen saat 90–95% gabah kuning keemasan.',
                    'Pesan combine 14 hari sebelum taksiran panen.'
                ]
            }
        ];

        daftar.sort(function (a, b) { return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    }

    /* ──────────────────────────────────────────────────────────
       RENDER HTML OUTPUT (tidak berubah dari v3.7)
    ────────────────────────────────────────────────────────── */
    window._jtoToggle = function (headerEl) {
        var detail  = headerEl.parentElement.querySelector('.jto-detail');
        var chevron = headerEl.querySelector('.jto-chevron');
        if (!detail) return;
        var open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    };

    /**
     * [v3.10] renderKartu menerima flag isLewat (kini benar-benar
     * dikirim dari renderOutput sebagai rek.isLewat — di v3.9
     * parameter ini selalu undefined karena tidak pernah diteruskan).
     * Kartu kegiatan yang sudah lewat ditampilkan dengan:
     *  - Opacity 0.55 (muted) pada seluruh kartu
     *  - Label "📋 Referensi" menggantikan badge status risiko
     *  - Border kiri abu-abu
     *  - Catatan iklim diganti keterangan blueprint
     */
    function renderKartu(k, nomor, isLewat) {
        var now = new Date();
        var kegLewat = isLewat || k.tglSelesai < now;
        var w   = kegLewat ? '#64748b' : k.risiko.warna;
        var fb  = namaFaseBulan(hariFaseBulan(k.tglMulai));
        var tipsHTML = k.tips.map(function (t) {
            return '<li style="margin-bottom:5px;color:' + (kegLewat ? '#475569' : '#cbd5e1') + ';line-height:1.5;">' + t + '</li>';
        }).join('');

        var badgeHTML = kegLewat
            ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:#1e293b;color:#64748b;white-space:nowrap;flex-shrink:0;border:1px solid #334155;">📋 Referensi</span>'
            : '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';white-space:nowrap;flex-shrink:0;">' + k.risiko.level + '</span>';

        var catatanHTML = kegLewat
            ? '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin-top:10px;margin-bottom:10px;border-left:3px solid #334155;">' +
                  '<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:2px;">📋 Data Proyeksi (Blueprint)</div>' +
                  '<div style="font-size:12px;color:#475569;">Kegiatan ini sudah terlewati. Ditampilkan sebagai referensi proyeksi iklim tahun berjalan.</div>' +
              '</div>'
            : '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin-top:10px;margin-bottom:10px;border-left:3px solid ' + w + ';">' +
                  '<div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan Kondisi Iklim</div>' +
                  '<div style="font-size:12px;color:#cbd5e1;">' + k.risiko.catatan + '</div>' +
              '</div>';

        return '<div style="background:#1b273a;border:0.5px solid ' + (kegLewat ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)') + ';border-radius:16px;margin-bottom:9px;overflow:hidden;opacity:' + (kegLewat ? '0.55' : '1') + ';">' +
            '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">' +
                '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
                        '<div>' +
                            '<div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:1px;">Kegiatan ' + nomor + '</div>' +
                            '<div style="font-size:14px;font-weight:700;color:' + (kegLewat ? '#64748b' : '#fff') + ';">' + k.nama + '</div>' +
                        '</div>' +
                        badgeHTML +
                    '</div>' +
                    '<div style="font-size:12px;color:#94a3b8;margin-top:3px;">' +
                        '<strong style="color:' + (kegLewat ? '#475569' : '#e2e8f0') + ';">' + formatTglLengkap(k.tglMulai) + '</strong>' +
                        ' s/d ' + formatTglPendek(k.tglSelesai) +
                    '</div>' +
                    '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + k.deskripsi + '</div>' +
                '</div>' +
                '<span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>' +
            '</div>' +
            '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">' +
                catatanHTML +
                '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
                '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tipsHTML + '</ul>' +
            '</div>' +
        '</div>';
    }

    function renderOutput(multiJadwal, zonaInfo, ensoData, iodData) {
        window._jtoData = multiJadwal;

        var labelZona = (zonaInfo.zona && LABEL_ZONA[zonaInfo.zona]) ? LABEL_ZONA[zonaInfo.zona] : 'MONSUNAL';
        var sumberData = zonaInfo.jarak
            ? zonaInfo.nama + ' (' + zonaInfo.jarak + ' km)'
            : zonaInfo.nama;
        var zonaTampil = labelZona + ' • ' + sumberData;

        var html = '<div style="padding:4px 0;">' +
            '<div style="background:rgba(6,182,212,0.09);border:1px solid rgba(6,182,212,0.25);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">' +
                '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">🤖 INFORMASI IKLIM TAHUNAN</div>' +
                '<div style="display:grid;grid-template-columns:1fr;gap:8px;font-size:12px;">' +
                    '<div><span style="color:#64748b;">Zona iklim & sumber data</span><br><strong style="color:#fff;">' + zonaTampil + '</strong></div>' +
                    '<div><span style="color:#64748b;">Kondisi ENSO / IOD</span><br><strong style="color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</strong></div>' +
                '</div>' +
            '</div>';

        multiJadwal.forEach(function(jadwal) {
            var rek = jadwal.rekomendasi;
            var keg = jadwal.kegiatan;
            var kartuHTML = keg.map(function (k, i) { return renderKartu(k, i + 1, rek.isLewat); }).join('');

            // [v3.10 FIX] Badge status musim — sebelumnya isLewat/isBerjalan
            // dihitung tapi tidak pernah ditampilkan di sini.
            var badgeMusim = '';
            var opacityMusim = '1';
            if (rek.isLewat) {
                badgeMusim   = '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;vertical-align:middle;white-space:nowrap;">📋 Blueprint</span>';
                opacityMusim = '0.6';
            } else if (rek.isBerjalan) {
                badgeMusim   = '<span class="jto-aktif-badge" style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);margin-left:10px;vertical-align:middle;white-space:nowrap;">🟢 Aktif</span>';
            }

            html += '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacityMusim + ';">🌾 ' + rek.musimNama.toUpperCase() + badgeMusim + '</div>';
            html += '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px;opacity:' + opacityMusim + ';">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                            '<div><span style="color:#64748b;">Waktu Tanam</span><br><strong style="color:#10b981;font-size:13px;">' + formatTglLengkap(rek.tglTanam) + '</strong></div>' +
                            '<div><span style="color:#64748b;">Varietas</span><br><strong style="color:#fff;font-size:13px;">' + rek.labelVar + '</strong></div>' +
                        '</div>' +
                        '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">💡 ' + rek.alasan + '</div>' +
                    '</div>';
            html += kartuHTML;
        });


        html += '<div style="margin-top:16px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Rekomendasi 2 musim di atas terdeteksi otomatis dari pemindaian DATA MENTAH (mm) ZOM lokal. ' +
            'Sesuaikan dengan kondisi lapangan, ketersediaan air, dan pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG, siklus sinodis bulan.' +
        '</div>';
        html += '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>';
        html += '</div>';
        return html;
    }

    /* ──────────────────────────────────────────────────────────
       KIRIM KE WHATSAPP
    ────────────────────────────────────────────────────────── */
    window._jtoKirimWA = function () {
        var dataArr = window._jtoData;
        if (!dataArr || !dataArr.length) return;
        var baris = ['*KALENDER KEGIATAN TANI TAHUNAN*\n'];
        dataArr.forEach(function(jadwal) {
            var r = jadwal.rekomendasi;
            baris.push('============================');
            baris.push('🌾 *' + r.musimNama.toUpperCase() + '*');
            baris.push('📅 Tgl Tanam: ' + formatTglLengkap(r.tglTanam));
            baris.push('🌱 Varietas: ' + r.labelVar);
            baris.push('💡 ' + r.alasan + '\n');
            jadwal.kegiatan.forEach(function (k, i) {
                baris.push((i + 1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
                baris.push('   Mulai: ' + formatTglLengkap(k.tglMulai));
                baris.push('   Status: ' + k.risiko.level);
                baris.push('');
            });
        });
        baris.push('_PPL Milenial Wajo — Smart Farming_');
        baris.push('_Sumber: NOAA ENSO/IOD + ZOM BMKG + Siklus Bulan_');
        window.open('https://wa.me/?text=' + encodeURIComponent(baris.join('\n')), '_blank');
    };

    /* ──────────────────────────────────────────────────────────
       PROSES UTAMA
    ────────────────────────────────────────────────────────── */
    async function prosesJadwalOtomatis() {
        var hasilEl  = document.getElementById('jtoHasil');
        var teksEl   = document.getElementById('jtoTeks');
        var statusEl = document.getElementById('jtoStatus');
        var btnJTO   = document.getElementById('btnJadwalOtomatis');
        if (!hasilEl || !teksEl) return;

        hasilEl.style.display = 'block';
        teksEl.innerHTML = '';

        var teksAsliBtn = 'ANALISIS & BUAT JADWAL OTOMATIS';
        if (btnJTO) {
            btnJTO.disabled = true;
            btnJTO.style.opacity = '0.75';
            btnJTO.textContent = 'MENGANALISIS IKLIM...';
        }

        function setStatus(msg) { if (statusEl) statusEl.innerHTML = msg; }

        setStatus('<span style="color:' + WARNA + ';">📡 Mengambil koordinat GPS...</span>');

        try {
            var lat = -4.0, lon = 120.0;
            try {
                if (window._lokasiKalender) {
                    lat = window._lokasiKalender.lat; lon = window._lokasiKalender.lon;
                } else if (window._koordinatTerakhir) {
                    lat = window._koordinatTerakhir.coords.latitude; lon = window._koordinatTerakhir.coords.longitude;
                } else {
                    var pos = await new Promise(function (res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, {
                            enableHighAccuracy: false, timeout: 8000, maximumAge: 300000
                        });
                    });
                    lat = pos.coords.latitude; lon = pos.coords.longitude;
                    window._lokasiKalender = { lat: lat, lon: lon };
                }
            } catch (gpsErr) {
                console.warn('[JadwalOtomatis] GPS fallback:', gpsErr.message);
            }

            setStatus('<span style="color:' + WARNA + ';">🌐 Mengambil data ENSO/IOD & ZOM...</span>');

            var getENSO = typeof window.getENSOAnomaly === 'function' ? window.getENSOAnomaly() : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });
            var getIOD  = typeof window.getIODAnomaly  === 'function' ? window.getIODAnomaly()  : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });

            var results  = await Promise.all([getENSO, getIOD, getDataZOM(lat, lon)]);
            var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
            var ensoVal  = ensoData.latestAnomaly || 0;
            var iodVal   = iodData.latestAnomaly  || 0;

            setStatus('<span style="color:' + WARNA + ';">🧮 Deteksi musim & menyusun kalender...</span>');

            var skorBulan = zonaInfo.data.map(function (_, idx) {
                return skorKelembapan(idx, zonaInfo.data, ensoVal, iodVal, lat, lon);
            });

            // [FIX] Panggil dari 'window' agar override dari patch_deteksi_musim (regional Pantai Timur) bisa terbaca!
var fungsiRekomendasi = window.rekomendasiWindowTanam || rekomendasiWindowTanam;
var rekomendasiArr = fungsiRekomendasi(skorBulan, zonaInfo.data, zonaInfo.zona);

            var multiJadwal = rekomendasiArr.map(function(rek) {
                return {
                    rekomendasi: rek,
                    kegiatan: bangunKegiatan(rek.tglTanam, rek.varietas, skorBulan)
                };
            });

            if (statusEl) statusEl.innerHTML = '';
            if (btnJTO) {
                btnJTO.disabled = false;
                btnJTO.style.opacity = '';
                btnJTO.textContent = teksAsliBtn;
                btnJTO.classList.remove('jto-pulse');
            }

            teksEl.innerHTML = renderOutput(multiJadwal, zonaInfo, ensoData, iodData);

        } catch (err) {
            console.error('[JadwalOtomatis]', err);
            if (statusEl) statusEl.innerHTML = '';
            if (btnJTO) {
                btnJTO.disabled = false;
                btnJTO.style.opacity = '';
                btnJTO.textContent = teksAsliBtn;
            }
            teksEl.innerHTML =
                '<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;font-size:13px;">' +
                '❌ Gagal membuat jadwal: ' + (err.message || 'Error tidak diketahui') +
                '</div>';
        }
    }

    /* ──────────────────────────────────────────────────────────
       INJEKSI TAB DAN UI
    ────────────────────────────────────────────────────────── */
    function injeksiTab() {
        if (document.getElementById('tabJadwalTanam')) return;
        var tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;
        var btn = document.createElement('button');
        btn.className   = 'tab-btn';
        btn.id          = 'tabJadwalTanam';
        btn.textContent = 'JADWAL TANAM';
        btn.onclick     = function () { switchMode('jadwaltanam'); };
        var tabKalender = document.getElementById('tabKalender');
        if (tabKalender && tabKalender.parentNode) {
            tabKalender.parentNode.insertBefore(btn, tabKalender.nextSibling);
        } else {
            tabContainer.appendChild(btn);
        }
    }

    function injeksiBox() {
        if (document.getElementById('boxJadwalTanam')) return;
        var card = document.querySelector('.card');
        if (!card) return;
        var box = document.createElement('div');
        box.id            = 'boxJadwalTanam';
        box.style.display = 'none';
        box.innerHTML =
            '<div style="background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.2);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:13px 15px;margin-bottom:16px;">' +
                '<strong style="color:' + WARNA + ';display:block;margin-bottom:5px;">📅 Kalender Tani Dinamis Tahunan</strong>' +
                '<span style="font-size:0.78rem;color:#cbd5e1;line-height:1.6;">' +
                    'Sistem akan memindai ZOM lokal, membaca data ENSO/IOD, lalu secara cerdas mendeteksi bulan terbaik untuk Musim Utama (Rendeng) dan Musim Kedua (Gadu) di wilayah Anda.' +
                '</span>' +
            '</div>' +
            '<button id="btnJadwalOtomatis" class="jto-pulse" style="' +
                'width:100%;padding:15px;background:linear-gradient(135deg,' + WARNA + ',#0891b2);' +
                'color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;margin-bottom:16px;' +
            '">🤖 ANALISIS & BUAT JADWAL OTOMATIS</button>' +
            '<div id="jtoStatus" style="text-align:center;padding:4px 0 10px;font-size:13px;min-height:24px;"></div>' +
            '<div id="jtoHasil" style="display:none;"><div id="jtoTeks"></div></div>';

        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && boxKalender.parentNode) {
            boxKalender.parentNode.insertBefore(box, boxKalender.nextSibling);
        } else {
            card.appendChild(box);
        }
        document.getElementById('btnJadwalOtomatis').addEventListener('click', prosesJadwalOtomatis);
    }

    var ELEMEN_TERSEMBUNYI_JADWAL = [
        'result', 'btnCamera', 'scanWindow', 'btnAnalisis',
        'boxCuaca', 'boxPenyakit', 'boxHama', 'boxGulma',
        'boxTanah', 'boxBWD', 'boxMalai', 'boxBiayaTani',
        'boxKalkulatorPupuk', 'boxKalender', 'boxVarietasPadi',
        'boxUkurLahan', 'boxPestisida', 'boxGabah',
        'formParameterLahan', 'tabSubtitleDisplay',
        'loader', 'cameraWarning'
    ];

    function sembunyikanSemuaUntukJadwal() {
        ELEMEN_TERSEMBUNYI_JADWAL.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.info-box-dynamic').forEach(function (el) { el.style.display = 'none'; });
        document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) { b.style.display = 'none'; });
    }

    function resetStateBwdDanMalai() {
        if (typeof window.stopCamera === 'function') window.stopCamera();
        var bwdPrompt    = document.getElementById('bwdCameraPrompt');
        var camContainer = document.getElementById('cameraContainer');
        var btnCapture   = document.getElementById('btnCapture');
        var btnAktifkan  = document.getElementById('btnAktifkanKameraBWD');
        var previewImg   = document.getElementById('bwdPreviewImage');
        var focusBox     = document.getElementById('focusBox');
        if (bwdPrompt)    bwdPrompt.style.display    = 'block';
        if (camContainer) camContainer.style.display = 'none';
        if (btnCapture)   btnCapture.style.display   = 'none';
        if (previewImg)   previewImg.style.display   = 'none';
        if (focusBox)     focusBox.style.display      = 'block';
        if (btnAktifkan)  {
            btnAktifkan.innerText = '📷 AKTIFKAN KAMERA';
            btnAktifkan.disabled  = false;
            btnAktifkan.style.opacity = '1';
        }
        try { if (typeof hasilSampelBulir !== 'undefined') hasilSampelBulir = []; } catch (e) {}
        var listM = document.getElementById('listMalai');
        if (listM) listM.innerHTML = '';
    }

    function patchSwitchMode() {
        var _asli = window.switchMode;
        window.switchMode = function (mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');
            var tabJTO = document.getElementById('tabJadwalTanam');
            if (mode === 'jadwaltanam') {
    resetStateBwdDanMalai();
    try { if (typeof currentMode !== 'undefined') currentMode = 'jadwaltanam'; } catch (e) {}
    sembunyikanSemuaUntukJadwal();
    if (boxJTO) boxJTO.style.display = 'block';
    var titleEl = document.getElementById('modeTitle');
    if (titleEl) { titleEl.innerText = '📅 Jadwal Kegiatan Tani'; titleEl.style.color = WARNA; }
    var subEl = document.getElementById('tabSubtitleDisplay');
    if (subEl)  { subEl.innerText = ''; subEl.style.display = 'none'; }
    document.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
    if (tabJTO) tabJTO.classList.add('active');

    /* [v3.11] Auto-trigger DIHAPUS dari sini (bukan cuma di-skip oleh
       patch lain). Analisis hanya jalan saat tombol dipencet manual.
       Dengan baris ini dihapus, SEKALIPUN patch_jadwal_manual_trigger.js
       gagal/tidak terpasang, switchMode versi ini SENDIRI sudah aman
       dan tidak bisa memicu bug auto-trigger lagi. */

    return;
}
            if (boxJTO) boxJTO.style.display = 'none';
            if (tabJTO) tabJTO.classList.remove('active');
            if (typeof _asli === 'function') _asli.apply(this, arguments);
        };
    }

    function injeksiCSS() {
        if (document.getElementById('jtoCSS')) return;
        var style = document.createElement('style');
        style.id = 'jtoCSS';
        style.textContent = [
            '#tabJadwalTanam.active{background:' + WARNA + '!important;color:#fff!important;}',
            '#tabJadwalTanam:not(.active){color:#708099;}',
            '#btnJadwalOtomatis:hover{opacity:0.88;}',
            '#btnJadwalOtomatis:active{transform:scale(0.985);}',
            '@keyframes jto-radar{0%{box-shadow:0 0 0 0 rgba(6,182,212,0.85);}65%{box-shadow:0 0 0 20px rgba(6,182,212,0.00);}100%{box-shadow:0 0 0 0 rgba(6,182,212,0.00);}}',
            '#btnJadwalOtomatis.jto-pulse{animation:jto-radar 1.5s ease-out infinite;will-change:box-shadow;}',
            '@keyframes jto-aktif-blink{0%,100%{opacity:1;}50%{opacity:0.45;}}',
            '.jto-aktif-badge{animation:jto-aktif-blink 1.5s ease-in-out infinite;}',
            'body.light-mode #boxJadwalTanam{background:#fff;color:#0f172a;}'
        ].join('');
        document.head.appendChild(style);
    }

    function init() {
        injeksiCSS();
        injeksiTab();
        injeksiBox();
        patchSwitchMode();
        console.log('%c✅ patch_jadwal_tanam_otomatis.js v3.8 aktif — Fix Tahun, Fase Bulan, Cache ZOM, Threshold, HST', 'color:' + WARNA + ';font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
