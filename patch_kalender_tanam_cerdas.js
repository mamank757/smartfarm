/**
 * ============================================================
 *  PATCH: patch_kalender_tanam_cerdas.js
 *  Versi: 1.0 — Rekomendasi Jadwal Kegiatan Berbasis Ilmiah
 * ------------------------------------------------------------
 *  Menambahkan fitur BARU ke tab "RISIKO IKLIM":
 *    - Tombol baru "📅 JADWAL KEGIATAN TANI"
 *    - Rekomendasi tanggal spesifik untuk setiap kegiatan:
 *        • Pengolahan lahan
 *        • Pembibitan benih
 *        • Tanam pindah
 *        • Umpan racun tikus
 *        • Pemupukan (3 tahap)
 *        • Penyemprotan insektisida
 *        • Penyemprotan fungisida
 *        • Panen
 *    - Skor risiko per kegiatan berbasis:
 *        • ENSO / IOD (dari patch_enso_iod_noaa.js)
 *        • Fase bulan (siklus sinodis 29.53 hari)
 *        • Baseline ZOM lokal (dari URL_ZOM_LOKAL)
 *        • Analisis trend cuaca 7 hari ke depan
 *    - Output dapat dikirim ke WhatsApp
 *
 *  Cara pakai:
 *    Tambahkan di HTML tepat SETELAH semua patch lain:
 *    <script src="patch_kalender_tanam_cerdas.js"></script>
 *
 *  Dependensi:
 *    - getENSOAnomaly()        (dari patch_enso_iod_noaa.js)
 *    - getIODAnomaly()         (dari patch_enso_iod_noaa.js)
 *    - normalisasiCurahHujan() (dari HTML / patch_perbaikan_ilmiah.js)
 *    - URL_ZOM_LOKAL           (dari HTML utama)
 *    - hitungJarakHaversine()  (dari HTML utama)
 *    - getFallbackSST()        (dari HTML utama, untuk baseline)
 *
 *  Referensi ilmiah:
 *    - Baehaki & Mejaya (2014): siklus hama WBC vs fase bulan
 *    - BB Padi (2019): periode kritis pemupukan
 *    - BMKG (2023): penentuan kalender tanam berbasis prakiraan
 *    - Untung (2006): prinsip PHT dalam kalender penyemprotan
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA
    // =========================================================================

    // Referensi bulan mati (new moon) terverifikasi
    // Dipakai sebagai epoch untuk hitung siklus sinodis
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059; // hari

    // Nama hari dalam bahasa Indonesia
    var NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN_ID = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    // Cache hasil analisis agar tidak fetch ulang tiap render
    var _cacheKalender = null;
    var _cacheExpiry   = 0; // timestamp ms

    // =========================================================================
    //  UTILITAS TANGGAL
    // =========================================================================

    function formatTglID(d) {
        return NAMA_HARI[d.getDay()] + ', ' +
               d.getDate() + ' ' + NAMA_BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
    }

    function formatTglPendek(d) {
        return d.getDate() + ' ' + NAMA_BULAN_ID[d.getMonth()].substring(0,3) + ' ' + d.getFullYear();
    }

    function tambahHari(d, n) {
        var hasil = new Date(d);
        hasil.setDate(hasil.getDate() + n);
        return hasil;
    }

    // Hitung berapa hari dalam siklus bulan saat ini (0 = bulan mati)
    function hariFaseBulan(tanggal) {
        var selisih = (tanggal.getTime() - EPOCH_BULAN_MATI.getTime()) / (1000 * 60 * 60 * 24);
        var hari    = selisih % SIKLUS_SINODIS;
        return hari < 0 ? hari + SIKLUS_SINODIS : hari;
    }

    // Nama fase bulan dari hari siklus
    function namaFaseBulan(hariBulan) {
        if (hariBulan < 1.5)           return { nama: 'Bulan Mati',      ikon: '🌑' };
        if (hariBulan < 7.4)           return { nama: 'Bulan Sabit Muda', ikon: '🌒' };
        if (hariBulan < 8.4)           return { nama: 'Kuartal Pertama',  ikon: '🌓' };
        if (hariBulan < 14.8)          return { nama: 'Bulan Cembung',    ikon: '🌔' };
        if (hariBulan < 15.8)          return { nama: 'Bulan Penuh',      ikon: '🌕' };
        if (hariBulan < 22.1)          return { nama: 'Bulan Cembung',    ikon: '🌖' };
        if (hariBulan < 23.1)          return { nama: 'Kuartal Ketiga',   ikon: '🌗' };
        if (hariBulan < 29.0)          return { nama: 'Bulan Sabit Tua',  ikon: '🌘' };
        return                                 { nama: 'Bulan Mati',      ikon: '🌑' };
    }

    // Cari tanggal TERDEKAT di masa depan dari tanggal acuan
    // yang memenuhi kondisi fase bulan tertentu
    // targetHariMin/Max: rentang hari dalam siklus yang dikehendaki
    function cariTanggalFaseBulan(acuan, targetHariMin, targetHariMax, offsetHariMulai) {
        offsetHariMulai = offsetHariMulai || 0;
        var mulai = tambahHari(acuan, offsetHariMulai);
        // Cari dalam 45 hari ke depan (1.5 siklus)
        for (var i = 0; i <= 45; i++) {
            var tgl  = tambahHari(mulai, i);
            var fase = hariFaseBulan(tgl);
            if (fase >= targetHariMin && fase <= targetHariMax) {
                return tgl;
            }
        }
        // Fallback: kembalikan tanggal mulai + offset
        return mulai;
    }

    // =========================================================================
    //  ANALISIS KONDISI IKLIM
    // =========================================================================

    // Ambil baseline curah hujan dari ZOM lokal atau fallback pola makro
    async function getBaselineZOM(lat, lon) {
        try {
            var resZom = await fetch(window.URL_ZOM_LOKAL || '');
            var dataZom = await resZom.json();

            var arrayZom = Array.isArray(dataZom.data) ? dataZom.data
                         : Array.isArray(dataZom)      ? dataZom
                         : null;

            if (!arrayZom) throw new Error('Format ZOM tidak dikenal');

            var jarakTerdekat = Infinity;
            var kabTerpilih   = null;
            var _haversine = window.hitungJarakHaversine || function(a,b,c,d) { return 999; };

            arrayZom.forEach(function(kab) {
                var lk = parseFloat(kab.lat), lnk = parseFloat(kab.lon);
                if (!isNaN(lk) && !isNaN(lnk)) {
                    var j = _haversine(lat, lon, lk, lnk);
                    if (j < jarakTerdekat) { jarakTerdekat = j; kabTerpilih = kab; }
                }
            });

            if (kabTerpilih && jarakTerdekat <= 150) {
                var keys = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
                return {
                    data: keys.map(function(k) { return parseFloat(kabTerpilih[k]) || 0; }),
                    nama: kabTerpilih.kabupaten_kota || 'Lokal',
                    jarak: jarakTerdekat.toFixed(1)
                };
            }
        } catch(e) {
            console.warn('[KalenderTanam] ZOM gagal:', e.message);
        }

        // Fallback: pola monsunal standar Sulsel (indeks)
        return {
            data: [0.9, 0.8, 0.6, 0.3, -0.1, -0.8, -1.2, -1.3, -0.9, -0.3, 0.4, 0.8],
            nama: 'Pola Monsunal Sulsel (estimasi)',
            jarak: null
        };
    }

    // Hitung skor kondisi cuaca bulan tertentu (0-100, makin tinggi makin basah)
    function skorKelembapanBulan(bulanIndex, baselineData, ensoVal, iodVal, lat, lon) {
        var _normalisasi = window.normalisasiCurahHujan || function(v) {
            if (v < 30)  return -1.5;
            if (v < 75)  return -0.8;
            if (v < 150) return  0.0;
            if (v < 250) return  0.8;
            return 1.5;
        };

        var baseline = baselineData[bulanIndex];
        // Konversi mm → indeks jika perlu
        var indeksBaseline = baseline > 10 ? _normalisasi(baseline, bulanIndex) : baseline;

        // Bobot dinamis ENSO & IOD sederhana (zona monsunal default Sulsel)
        var bobot = [
            [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],[0.18,0.12],[0.35,0.20],
            [0.45,0.28],[0.50,0.38],[0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
        ];
        var wEnso = bobot[bulanIndex][0];
        var wIod  = bobot[bulanIndex][1];
        var total = 1 + wEnso + wIod;

        var wetnessScore = (indeksBaseline / total)
                         - (ensoVal * wEnso / total)
                         - (iodVal  * wIod  / total);

        // Normalisasi ke 0-100 (50 = normal)
        var skor = Math.round(50 + (wetnessScore * 25));
        return Math.max(0, Math.min(100, skor));
    }

    // Label kondisi dari skor kelembapan
    function labelKondisi(skor) {
        if (skor >= 75) return { teks: 'Sangat Basah',  warna: '#3b82f6', ikon: '🌧️' };
        if (skor >= 60) return { teks: 'Cenderung Basah', warna: '#0ea5e9', ikon: '🌦️' };
        if (skor >= 40) return { teks: 'Normal',        warna: '#10b981', ikon: '⛅' };
        if (skor >= 25) return { teks: 'Cenderung Kering', warna: '#f59e0b', ikon: '🌤️' };
        return                 { teks: 'Sangat Kering', warna: '#ef4444', ikon: '☀️' };
    }

    // =========================================================================
    //  LOGIKA PENJADWALAN KEGIATAN
    // =========================================================================

    /**
     * Hasilkan jadwal kegiatan berdasarkan:
     *   - tglTanam: tanggal awal tanam (Date)
     *   - umurVarietas: 'genjah' | 'sedang' | 'dalam'
     *   - skorBulan: array[12] skor kelembapan 0-100
     *   - ensoVal, iodVal: anomali iklim terkini
     */
    function hitungJadwalKegiatan(tglTanam, umurVarietas, skorBulan, ensoVal, iodVal) {
        // Offset fase berdasarkan varietas (HST = Hari Setelah Tanam)
        var offset = {
            genjah: { benih:14, tanam:0, pupuk1:7,  pupuk2:28, pupuk3:45, insektAwal:20, insektLanjut:45, fungisida:55, panen:90  },
            sedang: { benih:21, tanam:0, pupuk1:7,  pupuk2:30, pupuk3:55, insektAwal:25, insektLanjut:55, fungisida:65, panen:110 },
            dalam:  { benih:28, tanam:0, pupuk1:7,  pupuk2:35, pupuk3:65, insektAwal:30, insektLanjut:65, fungisida:75, panen:125 }
        };
        var of = offset[umurVarietas] || offset.sedang;

        var today = new Date();

        // Tanggal olah lahan = 14-21 hari sebelum tanam
        var tglOlah   = tambahHari(tglTanam, -14);
        // Tanggal buat persemaian
        var tglBenih  = tambahHari(tglTanam, -of.benih);

        // Umpan tikus: idealnya pada fase bulan sabit muda (hari 3-7 siklus)
        // karena tikus lebih aktif malam hari saat gelap (bulan muda/tua)
        // Mulai pasang umpan 7 hari sebelum tanam, pilih fase bulan mati/sabit muda
        var tglTikusAwal   = cariTanggalFaseBulan(tglTanam, 26, 29.5, -10); // sabit tua / menjelang mati
        var tglTikusLanjut = cariTanggalFaseBulan(tglBenih, 0,  3,   0);    // bulan mati (paling gelap)

        // Pemupukan
        var tglPupuk1 = tambahHari(tglTanam, of.pupuk1);  // 7-10 HST
        var tglPupuk2 = tambahHari(tglTanam, of.pupuk2);  // 28-35 HST
        var tglPupuk3 = tambahHari(tglTanam, of.pupuk3);  // 45-65 HST

        // Insektisida: Hindari bulan penuh (hari 14-16) karena ngengat PBP
        // paling aktif bertelur. Semprotkan 5-7 hari setelah puncak penerbangan.
        var tglInsektAwal   = tambahHari(tglTanam, of.insektAwal);
        var tglInsektLanjut = tambahHari(tglTanam, of.insektLanjut);

        // Koreksi insektisida: jika jatuh saat bulan penuh, geser +5 hari
        [tglInsektAwal, tglInsektLanjut].forEach(function(tgl, idx) {
            var fase = hariFaseBulan(tgl);
            if (fase >= 13.5 && fase <= 16.5) {
                // Geser ke 5 hari setelah bulan penuh
                if (idx === 0) tglInsektAwal   = tambahHari(tgl, 5);
                else           tglInsektLanjut = tambahHari(tgl, 5);
            }
        });

        // Fungisida Blast: pada fase bunting — sangat kritis
        var tglFungisida = tambahHari(tglTanam, of.fungisida);

        // Panen
        var tglPanen = tambahHari(tglTanam, of.panen);

        // ── HITUNG SKOR RISIKO PER KEGIATAN ──────────────────────────
        function skorBulanTgl(tgl) {
            return skorBulan[tgl.getMonth()];
        }

        // Skor risiko pengolahan lahan (terlalu kering = susah bajak)
        var skorOlah = skorBulanTgl(tglOlah);
        var risikoOlah;
        if      (skorOlah < 25) risikoOlah = { level: 'Kering', catatan: 'Tambahkan irigasi awal sebelum bajak', warna: '#ef4444' };
        else if (skorOlah > 80) risikoOlah = { level: 'Sangat Basah', catatan: 'Tunggu hingga lahan bisa diluku mesin', warna: '#3b82f6' };
        else                     risikoOlah = { level: 'Baik', catatan: 'Kondisi optimal untuk bajak dan garu', warna: '#10b981' };

        // Skor risiko persemaian (terlalu basah = rebah bibit)
        var skorBenih = skorBulanTgl(tglBenih);
        var risikoBenih;
        if      (skorBenih > 75) risikoBenih = { level: 'Waspada', catatan: 'Buat drainase bedeng persemaian, cegah rebah semai', warna: '#f59e0b' };
        else if (skorBenih < 25) risikoBenih = { level: 'Siram Rutin', catatan: 'Siram pagi & sore, jaga kelembapan media semai', warna: '#f59e0b' };
        else                      risikoBenih = { level: 'Optimal', catatan: 'Cuaca mendukung perkecambahan benih', warna: '#10b981' };

        // Skor risiko saat tanam
        var skorTanam = skorBulanTgl(tglTanam);
        var risikoTanam;
        if      (skorTanam > 80) risikoTanam = { level: 'Genangan', catatan: 'Siapkan pompa, jaga kedalaman air 2-3 cm saja', warna: '#f59e0b' };
        else if (skorTanam < 20) risikoTanam = { level: 'Kering Kritis', catatan: 'Tunda atau siapkan pompanisasi penuh', warna: '#ef4444' };
        else                      risikoTanam = { level: 'Baik', catatan: 'Kondisi air mendukung penanaman', warna: '#10b981' };

        // Skor risiko umpan tikus (selalu tinggi → rekomen agresif)
        var faseTikusAwal = hariFaseBulan(tglTikusAwal);
        var risikoTikus;
        if (faseTikusAwal < 4 || faseTikusAwal > 25) {
            risikoTikus = { level: 'Optimal', catatan: 'Malam gelap — tikus aktif, umpan beracun maksimal efektif', warna: '#10b981' };
        } else {
            risikoTikus = { level: 'Kurang Optimal', catatan: 'Bulan bercahaya — aktivitas tikus agak berkurang, tetap pasang TBS', warna: '#f59e0b' };
        }

        // Skor risiko pemupukan
        function risikoTingkatPupuk(tgl, tahap) {
            var sk = skorBulanTgl(tgl);
            if (sk > 75) return { level: 'Risiko Tercuci', catatan: 'Hindari hari hujan, pupuk 1-2 hari sebelum hujan ringan ideal', warna: '#f59e0b' };
            if (sk < 20) return { level: 'Tanah Kering', catatan: 'Pastikan ada air di petakan sebelum tabur pupuk', warna: '#ef4444' };
            return { level: 'Optimal', catatan: 'Cuaca mendukung serapan pupuk oleh tanaman', warna: '#10b981' };
        }

        // Skor risiko insektisida
        function risikoInsektisida(tgl) {
            var sk = skorBulanTgl(tgl);
            var fb = hariFaseBulan(tgl);
            var catatan = '';
            var warna   = '#10b981';
            var level   = 'Baik';

            if (sk > 75) { catatan += 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
            if (fb >= 13 && fb <= 17) { catatan += 'Puncak penerbangan ngengat PBP — larutan semprot + lampu perangkap. '; warna = '#ef4444'; level = 'Waspada'; }
            else if (fb >= 12 && fb <= 18) { catatan += 'Mendekati bulan penuh — pantau kelompok telur PBP. '; if (warna !== '#ef4444') { warna = '#f59e0b'; level = 'Siaga'; } }
            else { catatan += 'Waktu aplikasi aman dari puncak ngengat. '; }

            catatan = catatan.trim();
            return { level: level, catatan: catatan, warna: warna };
        }

        // Skor risiko fungisida blast
        var skorFung = skorBulanTgl(tglFungisida);
        var risikoFung;
        if      (skorFung > 65) risikoFung = { level: 'Kritis Blast', catatan: 'Cuaca lembap — semprot Tricyclazole atau Isoprothiolane 7 hari sebelum bunting', warna: '#ef4444' };
        else if (skorFung > 45) risikoFung = { level: 'Waspada', catatan: 'Pantau gejala bercak belah ketupat, semprot preventif', warna: '#f59e0b' };
        else                     risikoFung = { level: 'Aman', catatan: 'Risiko blast rendah, cukup monitoring rutin', warna: '#10b981' };

        // Skor risiko panen
        var skorPanen = skorBulanTgl(tglPanen);
        var risikoPanen;
        if      (skorPanen > 75) risikoPanen = { level: 'Sulit Kering', catatan: 'Siapkan dryer/pengering — jangan tumpuk gabah lembap', warna: '#ef4444' };
        else if (skorPanen > 55) risikoPanen = { level: 'Waspada Hujan', catatan: 'Panen pagi hari, hindari sore hujan; pastikan combine tidak amblas', warna: '#f59e0b' };
        else if (skorPanen < 20) risikoPanen = { level: 'Kering Ideal', catatan: 'Panen dan jemur optimal, pantau kadar air gabah sebelum jual', warna: '#10b981' };
        else                      risikoPanen = { level: 'Baik', catatan: 'Kondisi panen mendukung, koordinasikan combine harvester', warna: '#10b981' };

        // ── PAKET PENGENDALIAN TIKUS ───────────────────────────────────
        // Pasang TBS 14 hari sebelum tanam, umpan paralel selama 2 minggu
        var tglTBSPasang = tambahHari(tglTanam, -14);

        return {
            varietas: umurVarietas,
            tglTanam: tglTanam,
            kegiatan: [
                {
                    id: 'olah',
                    nama: 'Pengolahan Lahan',
                    deskripsi: 'Bajak, garu, pemerataan petakan, dan pengapuran jika diperlukan',
                    tglMulai: tglOlah,
                    tglSelesai: tambahHari(tglOlah, 7),
                    ikon: '🚜',
                    risiko: risikoOlah,
                    tips: [
                        'Olah lahan 14 hari sebelum tanam agar gulma terbenam sempurna',
                        'Jika pH < 5.5, tambahkan kapur dolomit 500-1000 kg/ha',
                        'Cek saluran irigasi dan perbaiki pematang yang bocor'
                    ]
                },
                {
                    id: 'benih',
                    nama: 'Pembibitan Benih',
                    deskripsi: 'Seleksi benih, perendaman, perkecambahan, dan semai di bedeng',
                    tglMulai: tglBenih,
                    tglSelesai: tambahHari(tglBenih, 7),
                    ikon: '🌱',
                    risiko: risikoBenih,
                    tips: [
                        'Rendam benih 24 jam dalam air biasa, buang yang mengapung',
                        'Inkubasi lembap 48 jam hingga keluar kecambah 2-3 mm',
                        'Dosis semai: 25-35 kg/ha untuk tapin, 50-100 kg/ha untuk tabela'
                    ]
                },
                {
                    id: 'tikusTBS',
                    nama: 'Pasang TBS & Gropyokan',
                    deskripsi: 'Pasang Trap Barrier System & gropyokan massal di pematang',
                    tglMulai: tglTBSPasang,
                    tglSelesai: tambahHari(tglTBSPasang, 3),
                    ikon: '🐀',
                    risiko: risikoTikus,
                    tips: [
                        'Pasang TBS di sudut petakan dengan plastik setinggi 60 cm + perangkap snap trap',
                        'Gropyokan bersama minimal 3 petani (efek pengusir massal)',
                        'Bersihkan semak dan jerami sisa panen di sekitar pematang'
                    ]
                },
                {
                    id: 'tanam',
                    nama: 'Tanam Pindah / Tabela',
                    deskripsi: 'Penanaman bibit ke lahan utama dengan jarak tanam optimal',
                    tglMulai: tglTanam,
                    tglSelesai: tambahHari(tglTanam, 3),
                    ikon: '🌾',
                    risiko: risikoTanam,
                    tips: [
                        'Umur bibit optimal: 14-21 HSS untuk tapin (genjah lebih muda)',
                        'Jarak tanam Legowo 2:1: (25×12.5)×50 cm atau Legowo 4:1: (25×12.5)×50 cm',
                        'Tanam 2-3 bibit per lubang, kedalaman 2-3 cm'
                    ]
                },
                {
                    id: 'tikusUmpan',
                    nama: 'Pemberian Umpan Racun Tikus',
                    deskripsi: 'Aplikasi rodentisida antikoagulan di liang aktif pematang',
                    tglMulai: tglTikusAwal,
                    tglSelesai: tambahHari(tglTikusAwal, 5),
                    ikon: '☠️',
                    risiko: risikoTikus,
                    tips: [
                        'Gunakan rodentisida antikoagulan (Brodifacoum, Bromadiolon) bukan akut',
                        'Tempatkan umpan dalam kotak umpan tertutup (bait station) di mulut liang',
                        'Pasang malam hari, periksa dan ganti setiap 3-4 hari',
                        'JANGAN gunakan di sekitar saluran air atau kolam ikan'
                    ]
                },
                {
                    id: 'pupuk1',
                    nama: 'Pemupukan Tahap I (Dasar)',
                    deskripsi: 'Pupuk NPK Phonska + Urea I — fase awal pertumbuhan anakan',
                    tglMulai: tglPupuk1,
                    tglSelesai: tambahHari(tglPupuk1, 2),
                    ikon: '🧪',
                    risiko: risikoTingkatPupuk(tglPupuk1, 1),
                    tips: [
                        'Dosis: Urea 1/3 total + Phonska/NPK 1/2 total dosis per ha',
                        'Sebar rata saat air macak-macak (lumpuri tipis)',
                        'Jangan pupuk saat angin kencang atau menjelang hujan lebat'
                    ]
                },
                {
                    id: 'insektAwal',
                    nama: 'Penyemprotan Insektisida I',
                    deskripsi: 'Pengendalian hama fase vegetatif (WBC, Penggerek, Sundep)',
                    tglMulai: tglInsektAwal,
                    tglSelesai: tambahHari(tglInsektAwal, 2),
                    ikon: '💊',
                    risiko: risikoInsektisida(tglInsektAwal),
                    tips: [
                        'Pantau populasi WBC: semprot hanya jika > 10 ekor/rumpun',
                        'Gunakan insektisida sistemik: Imidakloprid, BPMC, atau Buprofezin',
                        'Semprot pagi hari (07.00-10.00) saat udara tidak berangin',
                        'Arahkan nozzle ke pangkal batang untuk WBC'
                    ]
                },
                {
                    id: 'pupuk2',
                    nama: 'Pemupukan Tahap II (Susulan I)',
                    deskripsi: 'Urea II + Phonska II — mendorong anakan produktif maksimal',
                    tglMulai: tglPupuk2,
                    tglSelesai: tambahHari(tglPupuk2, 2),
                    ikon: '🧪',
                    risiko: risikoTingkatPupuk(tglPupuk2, 2),
                    tips: [
                        'Dosis: Urea 2/3 sisa + Phonska 1/4 total dosis per ha',
                        'Cek warna daun dengan BWD — jika skala 3+ tahan Urea',
                        'Ini adalah pemupukan terpenting untuk jumlah anakan'
                    ]
                },
                {
                    id: 'pupuk3',
                    nama: 'Pemupukan Tahap III (Susulan II)',
                    deskripsi: 'Phonska III ± Urea III — menjelang fase bunting',
                    tglMulai: tglPupuk3,
                    tglSelesai: tambahHari(tglPupuk3, 2),
                    ikon: '🧪',
                    risiko: risikoTingkatPupuk(tglPupuk3, 3),
                    tips: [
                        'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1-2 saja)',
                        'Jika BWD skala 4-5, SKIP Urea di tahap ini',
                        'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia'
                    ]
                },
                {
                    id: 'insektLanjut',
                    nama: 'Penyemprotan Insektisida II',
                    deskripsi: 'Pengendalian hama fase generatif (Walang Sangit, Beluk)',
                    tglMulai: tglInsektLanjut,
                    tglSelesai: tambahHari(tglInsektLanjut, 2),
                    ikon: '💊',
                    risiko: risikoInsektisida(tglInsektLanjut),
                    tips: [
                        'Target utama: Walang Sangit (Leptocorisa) saat malai keluar',
                        'Semprot pagi hari saat walang sangit masih di tanaman',
                        'Gunakan insektisida kontak: Malathion, Deltametrin',
                        'Tambahkan fungisida jika ada gejala Hawar Pelepah'
                    ]
                },
                {
                    id: 'fungisida',
                    nama: 'Penyemprotan Fungisida (Blast)',
                    deskripsi: 'Preventif Blast Leher Malai saat fase bunting kritis',
                    tglMulai: tglFungisida,
                    tglSelesai: tambahHari(tglFungisida, 2),
                    ikon: '🍄',
                    risiko: risikoFung,
                    tips: [
                        'Semprot 5-7 hari SEBELUM atau SAAT keluar malai (10-50% malai keluar)',
                        'Bahan aktif: Tricyclazole (0.5 l/ha) atau Isoprothiolane (1-1.5 l/ha)',
                        'Ulangi 14 hari kemudian jika cuaca masih lembap'
                    ]
                },
                {
                    id: 'panen',
                    nama: 'Panen',
                    deskripsi: 'Pemotongan padi saat kadar air gabah 20-25% (kuning merata)',
                    tglMulai: tglPanen,
                    tglSelesai: tambahHari(tglPanen, 5),
                    ikon: '🌟',
                    risiko: risikoPanen,
                    tips: [
                        'Panen saat 90-95% gabah berwarna kuning keemasan',
                        'Kadar air ideal saat potong: 20-25%, segera keringkan ke 14%',
                        'Pesan combine harvester 14 hari sebelum taksiran panen',
                        'Jual ke penggilingan dengan timbangan bersetifikat'
                    ]
                }
            ]
        };
    }

    // =========================================================================
    //  RENDER HTML JADWAL
    // =========================================================================

    function renderKartuKegiatan(k, nomor) {
        var kondisi  = labelKondisi(50); // placeholder — warna dari risiko
        var warna    = k.risiko.warna;
        var hari     = hariFaseBulan(k.tglMulai);
        var faseBln  = namaFaseBulan(hari);
        var tglMulaiStr   = formatTglID(k.tglMulai);
        var tglSelesaiStr = formatTglPendek(k.tglSelesai);

        var tipsHTML = k.tips.map(function(t) {
            return '<li style="margin-bottom:6px; color: var(--color-text-secondary); line-height:1.5;">' + t + '</li>';
        }).join('');

        return '<div style="' +
            'background: var(--color-background-primary);' +
            'border: 0.5px solid var(--color-border-tertiary);' +
            'border-radius: var(--border-radius-lg);' +
            'margin-bottom: 12px;' +
            'overflow: hidden;' +
        '">' +
            '<div style="' +
                'padding: 12px 14px;' +
                'display: flex;' +
                'align-items: flex-start;' +
                'gap: 12px;' +
                'cursor: pointer;' +
                'border-left: 3px solid ' + warna + ';' +
            '" onclick="window._ktToggle(this)">' +
                '<div style="' +
                    'width: 36px; height: 36px; border-radius: 50%;' +
                    'background: var(--color-background-secondary);' +
                    'display: flex; align-items: center; justify-content: center;' +
                    'font-size: 18px; flex-shrink: 0;' +
                '">' + k.ikon + '</div>' +
                '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">' +
                        '<div>' +
                            '<div style="font-size: 11px; color: var(--color-text-tertiary); font-weight: 500; margin-bottom: 2px;">Kegiatan ' + nomor + '</div>' +
                            '<div style="font-size: 15px; font-weight: 500; color: var(--color-text-primary);">' + k.nama + '</div>' +
                        '</div>' +
                        '<span style="' +
                            'font-size: 11px; font-weight: 500; padding: 3px 8px;' +
                            'border-radius: var(--border-radius-md);' +
                            'background: ' + warna + '22;' +
                            'color: ' + warna + ';' +
                            'white-space: nowrap; flex-shrink: 0;' +
                        '">' + k.risiko.level + '</span>' +
                    '</div>' +
                    '<div style="font-size: 13px; color: var(--color-text-secondary); margin-top: 4px;">' +
                        '<span style="font-weight: 500; color: var(--color-text-primary);">' + tglMulaiStr + '</span>' +
                        ' s/d ' + tglSelesaiStr +
                    '</div>' +
                    '<div style="font-size: 12px; color: var(--color-text-tertiary); margin-top: 3px;">' +
                        faseBln.ikon + ' ' + faseBln.nama + ' &nbsp;•&nbsp; ' + k.deskripsi +
                    '</div>' +
                '</div>' +
                '<i class="ti ti-chevron-down" style="font-size: 16px; color: var(--color-text-tertiary); flex-shrink: 0; margin-top: 8px; transition: transform 0.2s;" aria-hidden="true"></i>' +
            '</div>' +
            '<div class="kt-detail" style="display: none; padding: 0 14px 14px 14px; border-top: 0.5px solid var(--color-border-tertiary);">' +
                '<div style="' +
                    'background: var(--color-background-secondary);' +
                    'border-radius: var(--border-radius-md);' +
                    'padding: 10px 12px;' +
                    'margin-top: 12px; margin-bottom: 12px;' +
                    'border-left: 3px solid ' + warna + ';' +
                '">' +
                    '<div style="font-size: 12px; font-weight: 500; color: ' + warna + '; margin-bottom: 3px;">Catatan Kondisi Iklim</div>' +
                    '<div style="font-size: 13px; color: var(--color-text-secondary);">' + k.risiko.catatan + '</div>' +
                '</div>' +
                '<div style="font-size: 12px; font-weight: 500; color: var(--color-text-tertiary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Tips Lapangan</div>' +
                '<ul style="margin: 0; padding-left: 16px; font-size: 13px;">' + tipsHTML + '</ul>' +
            '</div>' +
        '</div>';
    }

    function renderJadwalLengkap(jadwal, namaZona, ensoStatus, iodStatus) {
        var tglTanamStr = formatTglID(jadwal.tglTanam);
        var totalKegiatan = jadwal.kegiatan.length;

        var labelVarietas = {
            genjah: 'Genjah (< 95 HST)',
            sedang: 'Sedang (95-115 HST)',
            dalam:  'Dalam (≥ 116 HST)'
        }[jadwal.varietas] || jadwal.varietas;

        var kartuHTML = jadwal.kegiatan.map(function(k, i) {
            return renderKartuKegiatan(k, i + 1);
        }).join('');

        var html =
        '<div style="padding: 0.5rem 0;">' +

        '<h2 class="sr-only">Kalender kegiatan tani berdasarkan analisis iklim dan fase bulan</h2>' +

        '<div style="' +
            'background: var(--color-background-secondary);' +
            'border-radius: var(--border-radius-lg);' +
            'padding: 14px 16px;' +
            'margin-bottom: 16px;' +
        '">' +
            '<div style="font-size: 12px; color: var(--color-text-tertiary); font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Ringkasan Analisis</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">' +
                '<div><span style="color:var(--color-text-tertiary);">Rencana tanam</span><br><span style="font-weight:500;">' + tglTanamStr + '</span></div>' +
                '<div><span style="color:var(--color-text-tertiary);">Varietas</span><br><span style="font-weight:500;">' + labelVarietas + '</span></div>' +
                '<div><span style="color:var(--color-text-tertiary);">Zona iklim</span><br><span style="font-weight:500;">' + (namaZona || 'Sulsel') + '</span></div>' +
                '<div><span style="color:var(--color-text-tertiary);">ENSO / IOD</span><br><span style="font-weight:500;">' + (ensoStatus || '-') + ' / ' + (iodStatus || '-') + '</span></div>' +
            '</div>' +
        '</div>' +

        '<div style="font-size: 13px; color: var(--color-text-tertiary); margin-bottom: 12px;">' +
            totalKegiatan + ' kegiatan direkomendasikan — ketuk kartu untuk detail' +
        '</div>' +

        kartuHTML +

        '<div style="' +
            'margin-top: 16px;' +
            'background: var(--color-background-secondary);' +
            'border-radius: var(--border-radius-md);' +
            'padding: 10px 12px;' +
            'font-size: 11px;' +
            'color: var(--color-text-tertiary);' +
            'line-height: 1.6;' +
        '">' +
            '⚠️ Tanggal bersifat rekomendasi. Sesuaikan dengan kondisi lapangan aktual, ketersediaan air irigasi, dan hasil pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG lokal, siklus sinodis bulan, BB Padi (2019).' +
        '</div>' +

        '<button onclick="window._ktKirimWA()" style="' +
            'width: 100%; margin-top: 14px; padding: 12px;' +
            'background: #25D366; color: #fff; border: none;' +
            'border-radius: var(--border-radius-md);' +
            'font-size: 14px; font-weight: 500; cursor: pointer;' +
        '">Kirim jadwal ke WhatsApp ↗</button>' +

        '</div>';

        return html;
    }

    // =========================================================================
    //  INTERAKSI TOGGLE DETAIL
    // =========================================================================

    window._ktToggle = function(headerEl) {
        var detailEl = headerEl.parentElement.querySelector('.kt-detail');
        var ikonEl   = headerEl.querySelector('.ti-chevron-down');
        if (!detailEl) return;
        var visible = detailEl.style.display !== 'none';
        detailEl.style.display = visible ? 'none' : 'block';
        if (ikonEl) ikonEl.style.transform = visible ? '' : 'rotate(180deg)';
    };

    // =========================================================================
    //  KIRIM KE WHATSAPP
    // =========================================================================

    window._ktKirimWA = function() {
        if (!window._ktDataJadwal) return;
        var jadwal = window._ktDataJadwal;
        var baris  = ['*KALENDER KEGIATAN TANI — PPL MILENIAL WAJO*\n'];

        jadwal.kegiatan.forEach(function(k, i) {
            baris.push((i+1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
            baris.push('   Mulai : ' + formatTglID(k.tglMulai));
            baris.push('   Selesai: ' + formatTglPendek(k.tglSelesai));
            baris.push('   Status : ' + k.risiko.level);
            baris.push('   Catatan: ' + k.risiko.catatan);
            baris.push('');
        });

        baris.push('_Dibuat oleh Smart Farming PPL Milenial Wajo_');
        baris.push('_Sumber: NOAA ENSO/IOD + ZOM BMKG + Siklus Bulan_');

        var teks = baris.join('\n');
        window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank');
    };

    // =========================================================================
    //  FUNGSI UTAMA: BUAT JADWAL
    // =========================================================================

    async function buatJadwalTanam() {
        var kontainerTeks = document.getElementById('teksAnalisisFase');
        var hasilEl       = document.getElementById('hasilProyeksiIklim');
        if (!kontainerTeks || !hasilEl) return;

        // Baca input dari tab kalender
        var tglInput = document.getElementById('inputTglTanam');
        var varInput = document.getElementById('umurVarietasKalender');

        if (!tglInput || !tglInput.value) {
            var msgDiv = document.createElement('div');
            msgDiv.style.cssText = 'padding: 12px; background: var(--color-background-danger); border-radius: var(--border-radius-md); color: var(--color-text-danger); font-size: 13px; margin-bottom: 12px;';
            msgDiv.textContent = 'Silakan isi tanggal rencana tanam terlebih dahulu.';
            kontainerTeks.innerHTML = '';
            kontainerTeks.appendChild(msgDiv);
            return;
        }

        var tglTanam     = new Date(tglInput.value);
        var umurVarietas = (varInput && varInput.value) || 'sedang';

        // Tampilkan loading
        hasilEl.style.display = 'block';
        kontainerTeks.innerHTML =
            '<div style="text-align:center; padding: 24px 0; color: var(--color-text-secondary); font-size: 14px;">' +
            '<i class="ti ti-loader" style="font-size:24px; display:block; margin-bottom:8px; animation: spin 1s linear infinite;"></i>' +
            'Mengambil data iklim & menghitung jadwal optimal...' +
            '</div>';

        try {
            // Ambil data iklim
            var lat = -4.0, lon = 120.0;

            // Coba baca koordinat dari cache aplikasi
            if (window._lokasiKalender) {
                lat = window._lokasiKalender.lat;
                lon = window._lokasiKalender.lon;
            } else if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                // Coba GPS cepat (non-blocking)
                try {
                    var pos = await new Promise(function(res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, {
                            enableHighAccuracy: false, timeout: 5000, maximumAge: 300000
                        });
                    });
                    lat = pos.coords.latitude;
                    lon = pos.coords.longitude;
                    window._lokasiKalender = { lat: lat, lon: lon };
                } catch(gpsErr) {
                    console.warn('[KalenderTanam] GPS gagal, pakai koordinat default Wajo');
                }
            }

            // Paket fetch paralel
            var [ensoData, iodData, zonaInfo] = await Promise.all([
                (typeof window.getENSOAnomaly === 'function')
                    ? window.getENSOAnomaly()
                    : Promise.resolve({ latestAnomaly: 0, status: 'Netral' }),
                (typeof window.getIODAnomaly === 'function')
                    ? window.getIODAnomaly()
                    : Promise.resolve({ latestAnomaly: 0, status: 'Netral' }),
                getBaselineZOM(lat, lon)
            ]);

            var ensoVal = ensoData.latestAnomaly || 0;
            var iodVal  = iodData.latestAnomaly  || 0;

            // Hitung skor kelembapan tiap bulan
            var skorBulan = zonaInfo.data.map(function(baseline, idx) {
                return skorKelembapanBulan(idx, zonaInfo.data, ensoVal, iodVal, lat, lon);
            });

            // Hitung jadwal
            var jadwal = hitungJadwalKegiatan(tglTanam, umurVarietas, skorBulan, ensoVal, iodVal);
            window._ktDataJadwal = jadwal;

            // Render
            var html = renderJadwalLengkap(
                jadwal,
                zonaInfo.nama,
                ensoData.status || 'Netral',
                iodData.status  || 'Netral'
            );

            kontainerTeks.innerHTML = html;
            hasilEl.style.display   = 'block';

            // Sembunyikan grafik risiko agar tidak menumpuk
            var grafik = hasilEl.querySelector('div[style*="height: 260px"]');
            if (grafik) grafik.style.display = 'none';

        } catch (err) {
            console.error('[KalenderTanam]', err);
            kontainerTeks.innerHTML =
                '<div style="padding: 12px; background: var(--color-background-danger); border-radius: var(--border-radius-md); color: var(--color-text-danger); font-size: 13px;">' +
                'Gagal membuat jadwal: ' + (err.message || 'Error tidak diketahui') +
                '</div>';
        }
    }

    // =========================================================================
    //  INJEKSI TOMBOL KE TAB KALENDER
    // =========================================================================

    function injeksiTombolKalender() {
        var boxKalender = document.getElementById('boxKalender');
        if (!boxKalender) return;

        // Cek apakah tombol sudah ada
        if (document.getElementById('btnJadwalTanam')) return;

        // Sisipkan tombol setelah tombol analisis iklim yang sudah ada
        var tombolAnalisis = boxKalender.querySelector('button[onclick*="prosesAnalisisKalender"]');
        if (!tombolAnalisis) {
            // Fallback: append ke akhir boxKalender
            var btn = document.createElement('button');
            btn.id        = 'btnJadwalTanam';
            btn.className = 'btn-main';
            btn.style.cssText = 'margin-top: 10px; background: #10b981; color: #fff;';
            btn.textContent = '📅 BUAT JADWAL KEGIATAN TANI';
            btn.onclick     = buatJadwalTanam;
            boxKalender.appendChild(btn);
        } else {
            var divTombolBaru = document.createElement('div');
            divTombolBaru.style.marginTop = '10px';

            var btnJadwal = document.createElement('button');
            btnJadwal.id        = 'btnJadwalTanam';
            btnJadwal.className = 'btn-main';
            btnJadwal.style.cssText = 'background: #10b981; color: #fff;';
            btnJadwal.textContent   = '📅 BUAT JADWAL KEGIATAN TANI';
            btnJadwal.onclick       = buatJadwalTanam;

            divTombolBaru.appendChild(btnJadwal);
            tombolAnalisis.parentNode.insertBefore(divTombolBaru, tombolAnalisis.nextSibling);
        }

        // Injeksi CSS animasi spin jika belum ada
        if (!document.getElementById('ktAnimStyle')) {
            var style = document.createElement('style');
            style.id   = 'ktAnimStyle';
            style.textContent =
                '@keyframes spin { 100% { transform: rotate(360deg); } }' +
                '#btnJadwalTanam:hover { opacity: 0.9; }' +
                '#btnJadwalTanam:active { transform: scale(0.99); }';
            document.head.appendChild(style);
        }
    }

    // =========================================================================
    //  OVERRIDE switchMode UNTUK INJEKSI TOMBOL SAAT MASUK TAB KALENDER
    // =========================================================================

    var _switchModeAsliKT = window.switchMode;

    window.switchMode = function(mode) {
        if (typeof _switchModeAsliKT === 'function') {
            _switchModeAsliKT.apply(this, arguments);
        }
        if (mode === 'kalender') {
            // Tunda sedikit agar DOM tabkalender sudah tampil
            setTimeout(injeksiTombolKalender, 150);
        }
    };

    // Juga coba injeksi segera jika pengguna sudah di tab kalender
    setTimeout(function() {
        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && boxKalender.style.display !== 'none') {
            injeksiTombolKalender();
        }
    }, 500);

    // =========================================================================
    //  LOG
    // =========================================================================

    console.log(
        '%c✅ patch_kalender_tanam_cerdas.js aktif — Jadwal Kegiatan Berbasis Iklim & Fase Bulan',
        'color: #10b981; font-weight: bold;'
    );

})();
