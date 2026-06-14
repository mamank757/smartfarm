/**
 * ============================================================
 *  patch_jadwal_tanam_otomatis.js
 *  Versi: 3.0 — Jadwal Tanam Berbasis Kalender Iklim (Bukan Offset Hari)
 * ------------------------------------------------------------
 *  PERBAIKAN UTAMA v3.0 vs v2.0:
 *    ❌ v2.0: Scan offset 7–90 hari dari hari ini → SALAH SECARA LOGIKA IKLIM
 *    ✅ v3.0: Scan 12 bulan penuh → pilih BULAN TANAM terbaik secara iklim,
 *             lalu tetapkan tanggal tanam di dalam bulan itu berdasarkan
 *             fase bulan yang menguntungkan.
 *
 *    Alasan: Kondisi iklim tidak peduli kapan petani membuka aplikasi.
 *    Yang relevan adalah BULAN berapa padi akan memasuki fase generatif
 *    dan BULAN berapa panen berlangsung — karena fase itulah yang
 *    menentukan risiko gagal panen, bukan jarak hari dari hari ini.
 *
 *  MENGGANTIKAN:
 *    - patch_kalender_tanam_cerdas.js
 *    - patch_kalender_menu_mandiri.js
 *    - patch_jadwal_tanam_otomatis.js v2.0
 *
 *  Cara pakai:
 *    Letakkan SETELAH patch_enso_iod_noaa.js:
 *    <script src="patch_jadwal_tanam_otomatis.js"></script>
 *
 *  Dependensi (harus dimuat lebih dulu):
 *    - getENSOAnomaly()        (patch_enso_iod_noaa.js)
 *    - getIODAnomaly()         (patch_enso_iod_noaa.js)
 *    - normalisasiCurahHujan() (HTML utama)
 *    - hitungJarakHaversine()  (HTML utama)
 *    - getFallbackSST()        (HTML utama)
 *    - URL_ZOM_LOKAL           (HTML utama)
 *
 *  Referensi ilmiah:
 *    - BB Padi (2019): kalender tanam berbasis iklim
 *    - BMKG (2023): ZOM zona iklim
 *    - Baehaki & Mejaya (2014): siklus hama vs fase bulan
 *    - Untung (2006): PHT & jadwal penyemprotan
 * ============================================================
 */

(function () {
    'use strict';

    /* ──────────────────────────────────────────────────────────
       KONSTANTA GLOBAL
    ────────────────────────────────────────────────────────── */
    var WARNA = '#06b6d4';
    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
    var NAMA_BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun',
                              'Jul','Agu','Sep','Okt','Nov','Des'];

    /* ──────────────────────────────────────────────────────────
       UTILITAS TANGGAL & BULAN
    ────────────────────────────────────────────────────────── */
    function tambahHari(d, n) {
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }
    function tanggalDariBulanTahun(bulanIdx, tahun) {
        // Kembalikan tanggal 1 dari bulan & tahun tertentu
        return new Date(tahun, bulanIdx, 1);
    }
    function formatTglLengkap(d) {
        return NAMA_HARI[d.getDay()] + ', ' +
               d.getDate() + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
    }
    function formatTglPendek(d) {
        return d.getDate() + ' ' + NAMA_BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear();
    }

    /* ──────────────────────────────────────────────────────────
       UTILITAS FASE BULAN
    ────────────────────────────────────────────────────────── */
    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }
    function namaFaseBulan(h) {
        if (h < 1.5)  return { nama: 'Bulan Mati',       ikon: '🌑' };
        if (h < 7.4)  return { nama: 'Bulan Sabit Muda', ikon: '🌒' };
        if (h < 8.4)  return { nama: 'Kuartal Pertama',  ikon: '🌓' };
        if (h < 14.8) return { nama: 'Bulan Cembung',    ikon: '🌔' };
        if (h < 15.8) return { nama: 'Bulan Penuh',      ikon: '🌕' };
        if (h < 22.1) return { nama: 'Bulan Cembung',    ikon: '🌖' };
        if (h < 23.1) return { nama: 'Kuartal Ketiga',   ikon: '🌗' };
        if (h < 29.0) return { nama: 'Bulan Sabit Tua',  ikon: '🌘' };
        return                { nama: 'Bulan Mati',       ikon: '🌑' };
    }
    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }

    /* ──────────────────────────────────────────────────────────
       DATA ZOM DAN SKOR KELEMBAPAN
    ────────────────────────────────────────────────────────── */
    var _cacheZOM = null;

    async function getDataZOM(lat, lon) {
        if (_cacheZOM) return _cacheZOM;

        var fallback = {
            data: [0.9, 0.8, 0.6, 0.3, -0.1, -0.8,
                   -1.2, -1.3, -0.9, -0.3, 0.4, 0.8],
            nama: 'Pola Monsunal Sulsel (estimasi)',
            jarak: null
        };

        try {
            var urlZOM = window.URL_ZOM_LOKAL || '';
            if (!urlZOM) return fallback;

            var res  = await fetch(urlZOM);
            var data = await res.json();
            var arr  = Array.isArray(data.data) ? data.data :
                       Array.isArray(data)      ? data : null;
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
                var keys = ['jan','feb','mar','apr','mei','jun',
                            'jul','agu','sep','okt','nov','des'];
                _cacheZOM = {
                    data: keys.map(function (k) { return parseFloat(kab[k]) || 0; }),
                    nama: kab.kabupaten_kota || 'Lokal',
                    jarak: jMin.toFixed(1)
                };
                return _cacheZOM;
            }
        } catch (e) {
            console.warn('[JadwalOtomatis] ZOM:', e.message);
        }
        return fallback;
    }

    /**
     * Hitung skor kelembapan bulanan (0–100, makin tinggi makin basah)
     * berdasarkan baseline ZOM + anomali ENSO/IOD
     */
    function skorKelembapan(bulanIdx, baselineArr, ensoVal, iodVal) {
        var norm = window.normalisasiCurahHujan || function (v) {
            return v < 30 ? -1.5 : v < 75 ? -0.8 : v < 150 ? 0.0 : v < 250 ? 0.8 : 1.5;
        };

        var bl  = baselineArr[bulanIdx];
        var idx = bl > 10 ? norm(bl) : bl;

        var w = [
            [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],
            [0.18,0.12],[0.35,0.20],[0.45,0.28],[0.50,0.38],
            [0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
        ];
        var wE = w[bulanIdx][0], wI = w[bulanIdx][1], tot = 1 + wE + wI;
        var s  = (idx / tot) - (ensoVal * wE / tot) - (iodVal * wI / tot);
        return Math.max(0, Math.min(100, Math.round(50 + s * 25)));
    }

    /* ──────────────────────────────────────────────────────────
       MESIN REKOMENDASI WINDOW TANAM — 2 MUSIM, ADAPTIF 4 POLA ZOM
       
       LOGIKA v3.2 — Tidak hardcode kalender, deteksi dinamis:
       ─────────────────────────────────────────────────────────
       v3.1 hardcode MT I=Okt–Jan & MT II=Apr–Jul. Itu BENAR untuk
       pola Monsunal (1 puncak hujan/tahun, khas Sulsel bagian
       selatan), tapi SALAH untuk 3 pola ZOM lain yang juga
       digunakan di aplikasi ini (lihat prosesAnalisisKalender):
       
         • Monsunal  : 1 puncak hujan (Nov–Mar), 1 puncak kering (Jun–Sep)
         • Ekuatorial: 2 puncak hujan/tahun (sekitar Mar & Okt)
         • Lokal     : pola berkebalikan dari Monsunal (musim hujan
                       justru saat Monsunal kering)
         • Peralihan : campuran, tanpa pola dominan jelas
       
       Karena getDataZOM() SUDAH mengambil data 12-bulan RIIL dari
       kabupaten terdekat (via Haversine) — skorBulan otomatis
       merefleksikan pola lokal apapun bentuknya. Maka window MT
       seharusnya DITURUNKAN dari skorBulan, bukan di-hardcode.
       
       Algoritma:
         1. Untuk tiap bulan (0–11), hitung nilai terbaik sebagai
            "bulan tanam" (terbaik dari 3 varietas)
         2. Musim A = bulan dengan nilai tertinggi (global)
         3. Musim B = bulan dengan nilai tertinggi di antara bulan
            yang berjarak ≥ 4 bulan (siklus) dari Musim A
            → ini menghasilkan struktur "2 musim tanam" yang
              berlaku untuk pola apapun, karena pola hujan
              Indonesia (termasuk Ekuatorial bimodal) selalu
              punya ≥2 window yang masing-masing layak tanam
         4. Pilih musim dengan offset (jarak bulan dari sekarang)
            TERKECIL sebagai rekomendasi utama — musim lainnya
            disebutkan sebagai info tambahan
    ────────────────────────────────────────────────────────── */
    function rekomendasiWindowTanam(skorBulan) {
        var now = new Date();
        var bulanSekarang = now.getMonth();  // 0=Jan … 11=Des
        var tahunSekarang = now.getFullYear();

        // ── Definisi varietas ──
        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',  panen:90,  persenGen:0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen:110, persenGen:0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',  panen:125, persenGen:0.55 }
        ];

        /*
         * Jarak sirkular antar bulan (0–11), selalu bernilai 0–6.
         * Contoh: jarak(11, 1) = 2 (Des → Feb), jarak(2, 9) = 5
         */
        function jarakSirkular(a, b) {
            var d = Math.abs(a - b) % 12;
            return d > 6 ? 12 - d : d;
        }

        /*
         * LANGKAH 1: Hitung nilai terbaik untuk setiap bulan (0–11)
         * sebagai kandidat bulan tanam — ambil varietas terbaik
         * untuk bulan itu. Hasil disimpan di array 12 elemen.
         */
        var nilaiPerBulan = []; // { nilaiTotal, varietas, labelVar, skorTanam, skorGen, skorPanen, namaBulanGen, namaBulanPanen }

        for (var bTanam = 0; bTanam <= 11; bTanam++) {
            var skorTanam = skorBulan[bTanam];

            // Bulan kering ekstrem → tidak layak jadi bulan tanam
            if (skorTanam < 15) {
                nilaiPerBulan.push(null);
                continue;
            }

            var terbaikVar = null;

            varianArr.forEach(function (v) {
                var hariGen   = Math.floor(v.panen * v.persenGen);
                var bGenIdx   = (bTanam + Math.floor(hariGen  / 30)) % 12;
                var bPanenIdx = (bTanam + Math.floor(v.panen  / 30)) % 12;

                var skorGen   = skorBulan[bGenIdx];
                var skorPanen = skorBulan[bPanenIdx];

                /*
                 * Generatif ideal di skor ~40 (cukup air, tidak ekstrem).
                 * Panen ideal makin kering (skor rendah) makin baik.
                 */
                var nilaiGen   = 100 - Math.abs(skorGen - 40);
                var nilaiPanen = 100 - skorPanen;
                var nilaiTotal = (nilaiGen * 0.55) + (nilaiPanen * 0.45);

                // Penalti jika vegetatif awal (bulan tanam+1) sangat kering
                var bVeg1 = (bTanam + 1) % 12;
                if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;

                if (!terbaikVar || nilaiTotal > terbaikVar.nilaiTotal) {
                    terbaikVar = {
                        nilaiTotal : nilaiTotal,
                        varietas   : v.kode,
                        labelVar   : v.label,
                        skorTanam  : skorTanam,
                        skorGen    : skorGen,
                        skorPanen  : skorPanen,
                        namaBulanGen   : NAMA_BULAN[bGenIdx],
                        namaBulanPanen : NAMA_BULAN[bPanenIdx]
                    };
                }
            });

            nilaiPerBulan.push(terbaikVar);
        }

        // Jika semua bulan kering ekstrem → fallback
        var adaKandidat = nilaiPerBulan.some(function (x) { return x !== null; });
        if (!adaKandidat) {
            var tglFallback = tambahHari(now, 14);
            return {
                tglTanam : tglFallback,
                varietas : 'sedang',
                labelVar : 'Sedang (95–115 HST)',
                alasan   : 'Seluruh 12 bulan menunjukkan kondisi kering ekstrem. ' +
                           'Dipilih tanggal default. Pertimbangkan pompanisasi penuh atau palawija.'
            };
        }

        /*
         * LANGKAH 2: Tentukan Musim Tanam A = bulan dengan nilai
         * tertinggi secara global.
         */
        var idxMusimA = -1, nilaiMaxA = -Infinity;
        for (var i = 0; i <= 11; i++) {
            if (nilaiPerBulan[i] && nilaiPerBulan[i].nilaiTotal > nilaiMaxA) {
                nilaiMaxA = nilaiPerBulan[i].nilaiTotal;
                idxMusimA = i;
            }
        }

        /*
         * LANGKAH 3: Tentukan Musim Tanam B = bulan dengan nilai
         * tertinggi di antara bulan yang berjarak SIRKULAR ≥ 4
         * dari Musim A. Jarak ≥4 bulan memastikan kedua musim
         * tidak tumpang-tindih (1 siklus tanam ≈ 3–4 bulan).
         *
         * Jika tidak ada kandidat valid berjarak ≥4 (kasus langka,
         * misal hanya 1–2 bulan layak tanam dalam setahun karena
         * iklim sangat ekstrem), Musim B = null (hanya 1 musim layak).
         */
        var idxMusimB = -1, nilaiMaxB = -Infinity;
        for (var j = 0; j <= 11; j++) {
            if (!nilaiPerBulan[j]) continue;
            if (jarakSirkular(j, idxMusimA) < 4) continue;
            if (nilaiPerBulan[j].nilaiTotal > nilaiMaxB) {
                nilaiMaxB = nilaiPerBulan[j].nilaiTotal;
                idxMusimB = j;
            }
        }

        /*
         * LANGKAH 4: Hitung offset bulan (jarak ke depan dari
         * bulan sekarang) untuk Musim A dan Musim B. Pilih yang
         * offsetnya lebih kecil sebagai REKOMENDASI UTAMA.
         */
        function hitungOffsetDanTahun(bTanam) {
            var offset = (bTanam - bulanSekarang + 12) % 12;
            var tahunTanam = tahunSekarang + Math.floor((bulanSekarang + offset) / 12);
            return { offset: offset, tahun: tahunTanam };
        }

        var infoA = hitungOffsetDanTahun(idxMusimA);
        var infoB = idxMusimB >= 0 ? hitungOffsetDanTahun(idxMusimB) : null;

        var pilihUtama, pilihAlternatif, idxUtama, idxAlternatif;
        if (infoB && infoB.offset < infoA.offset) {
            pilihUtama = { idx: idxMusimB, info: infoB, data: nilaiPerBulan[idxMusimB] };
            pilihAlternatif = { idx: idxMusimA, info: infoA, data: nilaiPerBulan[idxMusimA] };
        } else {
            pilihUtama = { idx: idxMusimA, info: infoA, data: nilaiPerBulan[idxMusimA] };
            pilihAlternatif = idxMusimB >= 0
                ? { idx: idxMusimB, info: infoB, data: nilaiPerBulan[idxMusimB] }
                : null;
        }

        var best = pilihUtama.data;
        var bTanamFinal   = pilihUtama.idx;
        var tahunFinal    = pilihUtama.info.tahun;
        var offsetFinal   = pilihUtama.info.offset;

        /*
         * LANGKAH 5: Tentukan tanggal konkret di dalam bulan
         * tanam terpilih — cari fase bulan sabit muda (hari 3–8
         * siklus sinodis), waktu tradisional tanam padi.
         */
        var tglAwalBulan = tanggalDariBulanTahun(bTanamFinal, tahunFinal);
        var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0);

        if (tglFaseBaik.getMonth() !== bTanamFinal) {
            tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0);
        }
        if (tglFaseBaik.getMonth() !== bTanamFinal) {
            tglFaseBaik = new Date(tahunFinal, bTanamFinal, 10);
        }

        // Keterangan skor iklim untuk ditampilkan ke petani
        var keteranganSkorGen =
            best.skorGen < 25 ? 'kering — risiko puso jika tidak ada irigasi' :
            best.skorGen > 70 ? 'basah — waspada Blast dan penyerbukan terganggu' :
                                'optimal untuk pembungaan dan pengisian bulir';

        var keteranganSkorPanen =
            best.skorPanen > 65 ? 'basah — siapkan dryer dan panen pagi' :
            best.skorPanen < 20 ? 'kering ideal — panen berlangsung lancar' :
                                  'sedang — koordinasikan combine harvester';

        var alasan =
            'Musim Tanam Terdekat: ' + NAMA_BULAN[bTanamFinal] + ' ' + tahunFinal +
            ' (skor kelembapan: ' + best.skorTanam + '/100). ' +
            'Fase generatif → ' + best.namaBulanGen +
            ' (skor: ' + best.skorGen + '/100 — ' + keteranganSkorGen + '). ' +
            'Panen → ' + best.namaBulanPanen +
            ' (skor: ' + best.skorPanen + '/100 — ' + keteranganSkorPanen + '). ' +
            'Nilai iklim: ' + best.nilaiTotal.toFixed(0) + '/100.';

        // Info musim alternatif (musim tanam ke-2 dalam setahun)
        if (pilihAlternatif) {
            alasan += ' 📅 Musim tanam alternatif: ' +
                      NAMA_BULAN[pilihAlternatif.idx] + ' ' + pilihAlternatif.info.tahun +
                      ' (nilai iklim: ' + pilihAlternatif.data.nilaiTotal.toFixed(0) + '/100).';
        }

        // Peringatan jika musim terbaik masih > 2 bulan ke depan
        if (offsetFinal > 2) {
            alasan += ' ⚠️ Waktu tanam optimal masih ' + offsetFinal +
                      ' bulan ke depan. Pertimbangkan palawija (jagung/kedelai) ' +
                      'untuk mengisi musim antara ini.';
        }

        return {
            tglTanam : tglFaseBaik,
            varietas : best.varietas,
            labelVar : best.labelVar,
            alasan   : alasan
        };
    }

    /* ──────────────────────────────────────────────────────────
       KALKULASI RISIKO PER KEGIATAN
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
       BANGUN DAFTAR KEGIATAN
    ────────────────────────────────────────────────────────── */
    function bangunKegiatan(tglTanam, varietas, skorBulan) {
        var of = {
            genjah: { benih:14, p1:7,  p2:28, p3:45, i1:20, i2:45, fung:55, panen:90  },
            sedang: { benih:21, p1:7,  p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 },
            dalam:  { benih:28, p1:7,  p2:35, p3:65, i1:30, i2:65, fung:75, panen:125 }
        }[varietas] || { benih:21, p1:7, p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 };

        var tglOlah   = tambahHari(tglTanam, -14);
        var tglBenih  = tambahHari(tglTanam, -of.benih);
        var tglTBS    = tambahHari(tglTanam, -14);
        var tglTikusA = cariTglFaseBulan(tglTanam, 26, 29.5, -10);
        var tglP1     = tambahHari(tglTanam, of.p1);
        var tglP2     = tambahHari(tglTanam, of.p2);
        var tglP3     = tambahHari(tglTanam, of.p3);
        var tglI1     = tambahHari(tglTanam, of.i1);
        var tglI2     = tambahHari(tglTanam, of.i2);
        var tglFung   = tambahHari(tglTanam, of.fung);
        var tglPanen  = tambahHari(tglTanam, of.panen);

        // Koreksi insektisida: geser dari bulan penuh
        [tglI1, tglI2].forEach(function (t, idx) {
            var f = hariFaseBulan(t);
            if (f >= 13.5 && f <= 16.5) {
                if (idx === 0) tglI1 = tambahHari(t, 5);
                else           tglI2 = tambahHari(t, 5);
            }
        });

        function sk(tgl) { return skorBulan[tgl.getMonth()]; }

        return [
            {
                nama:'Pengolahan Lahan', ikon:'🚜',
                deskripsi:'Bajak, garu, pemerataan petakan',
                tglMulai: tglOlah, tglSelesai: tambahHari(tglOlah, 7),
                risiko: risikoOlah(sk(tglOlah)),
                tips:[
                    'Olah 14 hari sebelum tanam agar gulma terbenam sempurna.',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha.',
                    'Cek saluran irigasi dan perbaiki pematang bocor.'
                ]
            },
            {
                nama:'Pembibitan Benih', ikon:'🌱',
                deskripsi:'Seleksi, rendam, kecambah, semai',
                tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips:[
                    'Rendam benih 24 jam — buang yang mengapung.',
                    'Inkubasi lembap 48 jam hingga kecambah 2–3 mm.',
                    'Dosis semai: 25–35 kg/ha (tapin) atau 50–100 kg/ha (tabela).'
                ]
            },
            {
                nama:'Pasang TBS & Gropyokan', ikon:'🐀',
                deskripsi:'Trap Barrier System + gropyokan massal',
                tglMulai: tglTBS, tglSelesai: tambahHari(tglTBS, 3),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:[
                    'Pasang TBS di sudut petakan — plastik setinggi 60 cm.',
                    'Gropyokan minimal 3 petani (efek pengusir massal).',
                    'Bersihkan semak dan jerami sisa panen di pematang.'
                ]
            },
            {
                nama:'Tanam Pindah / Tabela', ikon:'🌾',
                deskripsi:'Penanaman bibit ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 3),
                risiko: risikoTanam(sk(tglTanam)),
                tips:[
                    'Umur bibit optimal: 14–21 HSS (tapin).',
                    'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                    '2–3 bibit/lubang, kedalaman 2–3 cm.'
                ]
            },
            {
                nama:'Umpan Racun Tikus', ikon:'☠️',
                deskripsi:'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglTikusA, tglSelesai: tambahHari(tglTikusA, 5),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:[
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                    'Tempatkan dalam bait station di mulut liang.',
                    'Pasang malam hari — periksa & ganti tiap 3–4 hari.',
                    'JANGAN di dekat saluran air atau kolam ikan!'
                ]
            },
            {
                nama:'Pemupukan Tahap I (Dasar)', ikon:'🧪',
                deskripsi:'NPK Phonska + Urea I — awal anakan',
                tglMulai: tglP1, tglSelesai: tambahHari(tglP1, 2),
                risiko: risikoPupuk(sk(tglP1)),
                tips:[
                    'Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                    'Sebar saat air macak-macak.',
                    'Jangan pupuk saat angin kencang atau menjelang hujan lebat.'
                ]
            },
            {
                nama:'Insektisida I (Vegetatif)', ikon:'💊',
                deskripsi:'Pengendalian WBC, Penggerek, Sundep',
                tglMulai: tglI1, tglSelesai: tambahHari(tglI1, 2),
                risiko: risikoInsektisida(sk(tglI1), hariFaseBulan(tglI1)),
                tips:[
                    'Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                    'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.',
                    'Semprot pagi (07.00–10.00) — arahkan nozzle ke pangkal batang.'
                ]
            },
            {
                nama:'Pemupukan Tahap II (Susulan I)', ikon:'🧪',
                deskripsi:'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHari(tglP2, 2),
                risiko: risikoPupuk(sk(tglP2)),
                tips:[
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                    'Cek warna daun dengan BWD — skala 3+ tahan Urea.',
                    'Pemupukan terpenting untuk jumlah anakan produktif.'
                ]
            },
            {
                nama:'Pemupukan Tahap III (Susulan II)', ikon:'🧪',
                deskripsi:'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: tambahHari(tglP3, 2),
                risiko: risikoPupuk(sk(tglP3)),
                tips:[
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                    'Jika BWD skala 4–5, SKIP Urea tahap ini.',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.'
                ]
            },
            {
                nama:'Insektisida II (Generatif)', ikon:'💊',
                deskripsi:'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHari(tglI2, 2),
                risiko: risikoInsektisida(sk(tglI2), hariFaseBulan(tglI2)),
                tips:[
                    'Semprot pagi hari saat walang sangit masih di tanaman.',
                    'Bahan aktif kontak: Malathion, Deltametrin.',
                    'Tambah fungisida jika ada gejala Hawar Pelepah.'
                ]
            },
            {
                nama:'Fungisida Blast (Bunting)', ikon:'🍄',
                deskripsi:'Preventif Blast Leher Malai — fase bunting',
                tglMulai: tglFung, tglSelesai: tambahHari(tglFung, 2),
                risiko: risikoFungisida(sk(tglFung)),
                tips:[
                    'Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                    'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.',
                    'Ulangi 14 hari kemudian jika cuaca masih lembap.'
                ]
            },
            {
                nama:'Panen', ikon:'🌟',
                deskripsi:'Potong saat kadar air gabah 20–25%',
                tglMulai: tglPanen, tglSelesai: tambahHari(tglPanen, 5),
                risiko: risikoPanen(sk(tglPanen)),
                tips:[
                    'Panen saat 90–95% gabah kuning keemasan.',
                    'Kadar air potong: 20–25% → segera keringkan ke 14%.',
                    'Pesan combine 14 hari sebelum taksiran panen.',
                    'Jual ke penggilingan dengan timbangan bersertifikat.'
                ]
            }
        ];
    }

    /* ──────────────────────────────────────────────────────────
       RENDER KARTU KEGIATAN
    ────────────────────────────────────────────────────────── */
    window._jtoToggle = function (headerEl) {
        var detail  = headerEl.parentElement.querySelector('.jto-detail');
        var chevron = headerEl.querySelector('.jto-chevron');
        if (!detail) return;
        var open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    };

    function renderKartu(k, nomor) {
        var w  = k.risiko.warna;
        var fb = namaFaseBulan(hariFaseBulan(k.tglMulai));
        var tipsHTML = k.tips.map(function (t) {
            return '<li style="margin-bottom:5px;color:#cbd5e1;line-height:1.5;">' + t + '</li>';
        }).join('');

        return '<div style="background:#1b273a;border:0.5px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:9px;overflow:hidden;">' +
            '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">' +
                '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
                        '<div>' +
                            '<div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:1px;">Kegiatan ' + nomor + '</div>' +
                            '<div style="font-size:14px;font-weight:700;color:#fff;">' + k.nama + '</div>' +
                        '</div>' +
                        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';white-space:nowrap;flex-shrink:0;">' + k.risiko.level + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px;color:#94a3b8;margin-top:3px;">' +
                        '<strong style="color:#e2e8f0;">' + formatTglLengkap(k.tglMulai) + '</strong>' +
                        ' s/d ' + formatTglPendek(k.tglSelesai) +
                    '</div>' +
                    '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + k.deskripsi + '</div>' +
                '</div>' +
                '<span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>' +
            '</div>' +
            '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">' +
                '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin-top:10px;margin-bottom:10px;border-left:3px solid ' + w + ';">' +
                    '<div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan Kondisi Iklim</div>' +
                    '<div style="font-size:12px;color:#cbd5e1;">' + k.risiko.catatan + '</div>' +
                '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
                '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tipsHTML + '</ul>' +
            '</div>' +
        '</div>';
    }

    /* ──────────────────────────────────────────────────────────
       RENDER OUTPUT LENGKAP
    ────────────────────────────────────────────────────────── */
    function renderOutput(rekomendasi, kegiatan, zonaInfo, ensoData, iodData) {
        var kartuHTML = kegiatan.map(function (k, i) {
            return renderKartu(k, i + 1);
        }).join('');

        window._jtoData = { rekomendasi: rekomendasi, kegiatan: kegiatan };

        return '<div style="padding:4px 0;">' +

        '<div style="background:rgba(6,182,212,0.09);border:1px solid rgba(6,182,212,0.25);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">' +
            '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">🤖 REKOMENDASI OTOMATIS SISTEM</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Tanggal tanam terbaik</span><br><strong style="color:#fff;font-size:13px;">' + formatTglLengkap(rekomendasi.tglTanam) + '</strong></div>' +
                '<div><span style="color:#64748b;">Varietas</span><br><strong style="color:#fff;font-size:13px;">' + rekomendasi.labelVar + '</strong></div>' +
                '<div><span style="color:#64748b;">Zona iklim</span><br><strong style="color:#fff;">' + (zonaInfo.nama || 'Sulsel') + '</strong></div>' +
                '<div><span style="color:#64748b;">ENSO / IOD</span><br><strong style="color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</strong></div>' +
            '</div>' +
            '<div style="margin-top:10px;padding-top:9px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">' +
                '💡 ' + rekomendasi.alasan +
            '</div>' +
        '</div>' +

        '<div style="font-size:11px;color:#64748b;margin-bottom:10px;">12 kegiatan direkomendasikan — ketuk kartu untuk detail & tips lapangan</div>' +

        kartuHTML +

        '<div style="margin-top:12px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Rekomendasi berbasis kalender iklim 12 bulan — bukan offset hari dari hari ini. ' +
            'Sesuaikan dengan kondisi lapangan, ketersediaan air, dan pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG, siklus sinodis bulan, BB Padi (2019).' +
        '</div>' +

        '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>' +

        '</div>';
    }

    /* ──────────────────────────────────────────────────────────
       KIRIM KE WHATSAPP
    ────────────────────────────────────────────────────────── */
    window._jtoKirimWA = function () {
        var d = window._jtoData;
        if (!d) return;
        var baris = ['*KALENDER KEGIATAN TANI — PPL MILENIAL WAJO*\n'];
        baris.push('📅 Tanggal Tanam: ' + formatTglLengkap(d.rekomendasi.tglTanam));
        baris.push('🌱 Varietas: ' + d.rekomendasi.labelVar + '\n');
        d.kegiatan.forEach(function (k, i) {
            baris.push((i + 1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
            baris.push('   Mulai  : ' + formatTglLengkap(k.tglMulai));
            baris.push('   Selesai: ' + formatTglPendek(k.tglSelesai));
            baris.push('   Status : ' + k.risiko.level);
            baris.push('   Catatan: ' + k.risiko.catatan);
            baris.push('');
        });
        baris.push('_PPL Milenial Wajo — Smart Farming_');
        baris.push('_Sumber: NOAA ENSO/IOD + ZOM BMKG + Siklus Bulan_');
        window.open('https://wa.me/?text=' + encodeURIComponent(baris.join('\n')), '_blank');
    };

    /* ──────────────────────────────────────────────────────────
       PROSES UTAMA: ANALISIS OTOMATIS
    ────────────────────────────────────────────────────────── */
    async function prosesJadwalOtomatis() {
        var hasilEl  = document.getElementById('jtoHasil');
        var teksEl   = document.getElementById('jtoTeks');
        var statusEl = document.getElementById('jtoStatus');
        if (!hasilEl || !teksEl) return;

        hasilEl.style.display = 'block';
        teksEl.innerHTML = '';

        function setStatus(msg) {
            if (statusEl) statusEl.innerHTML = msg;
        }

        setStatus('<span style="color:' + WARNA + ';">📡 Mengambil koordinat GPS...</span>');

        try {
            var lat = -4.0, lon = 120.0;
            try {
                if (window._lokasiKalender) {
                    lat = window._lokasiKalender.lat;
                    lon = window._lokasiKalender.lon;
                } else if (window._koordinatTerakhir) {
                    lat = window._koordinatTerakhir.coords.latitude;
                    lon = window._koordinatTerakhir.coords.longitude;
                } else {
                    var pos = await new Promise(function (res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, {
                            enableHighAccuracy: false, timeout: 8000, maximumAge: 300000
                        });
                    });
                    lat = pos.coords.latitude;
                    lon = pos.coords.longitude;
                    window._lokasiKalender = { lat: lat, lon: lon };
                }
            } catch (gpsErr) {
                console.warn('[JadwalOtomatis] GPS fallback:', gpsErr.message);
            }

            setStatus('<span style="color:' + WARNA + ';">🌐 Mengambil data ENSO/IOD & ZOM...</span>');

            var getENSO = typeof window.getENSOAnomaly === 'function'
                ? window.getENSOAnomaly()
                : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });
            var getIOD = typeof window.getIODAnomaly === 'function'
                ? window.getIODAnomaly()
                : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });

            var results = await Promise.all([getENSO, getIOD, getDataZOM(lat, lon)]);
            var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
            var ensoVal  = ensoData.latestAnomaly || 0;
            var iodVal   = iodData.latestAnomaly  || 0;

            setStatus('<span style="color:' + WARNA + ';">🧮 Mengevaluasi 12 bulan kalender iklim...</span>');

            var skorBulan = zonaInfo.data.map(function (_, idx) {
                return skorKelembapan(idx, zonaInfo.data, ensoVal, iodVal);
            });

            // v3.0: rekomendasi berbasis scan kalender penuh, bukan offset hari
            var rekomendasi = rekomendasiWindowTanam(skorBulan);

            var kegiatan = bangunKegiatan(rekomendasi.tglTanam, rekomendasi.varietas, skorBulan);

            if (statusEl) statusEl.innerHTML = '';
            teksEl.innerHTML = renderOutput(rekomendasi, kegiatan, zonaInfo, ensoData, iodData);

        } catch (err) {
            console.error('[JadwalOtomatis]', err);
            if (statusEl) statusEl.innerHTML = '';
            teksEl.innerHTML =
                '<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;font-size:13px;">' +
                '❌ Gagal membuat jadwal: ' + (err.message || 'Error tidak diketahui') +
                '</div>';
        }
    }

    /* ──────────────────────────────────────────────────────────
       INJECT TAB DAN BOX KE DOM
    ────────────────────────────────────────────────────────── */
    function injeksiTab() {
        if (document.getElementById('tabJadwalTanam')) return;
        var tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;

        var btn = document.createElement('button');
        btn.className  = 'tab-btn';
        btn.id         = 'tabJadwalTanam';
        btn.textContent = 'JADWAL TANAM';
        btn.onclick = function () { switchMode('jadwaltanam'); };

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
                '<strong style="color:' + WARNA + ';display:block;margin-bottom:5px;">📅 Jadwal Kegiatan Tani Berbasis Iklim</strong>' +
                '<span style="font-size:0.78rem;color:#cbd5e1;line-height:1.6;">' +
                    'Sistem mengevaluasi <b>12 bulan kalender iklim</b> (bukan sekadar hari ke depan) ' +
                    'untuk menemukan bulan tanam terbaik berdasarkan kondisi ENSO/IOD, ZOM BMKG lokal, ' +
                    'dan fase bulan — termasuk jika musim terbaik baru datang beberapa bulan ke depan.' +
                '</span>' +
            '</div>' +

            '<button id="btnJadwalOtomatis" style="' +
                'width:100%;padding:15px;background:linear-gradient(135deg,' + WARNA + ',#0891b2);' +
                'color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;margin-bottom:16px;' +
            '">' +
                '🤖 ANALISIS & BUAT JADWAL OTOMATIS' +
            '</button>' +

            '<div id="jtoStatus" style="text-align:center;padding:4px 0 10px;font-size:13px;min-height:24px;"></div>' +

            '<div id="jtoHasil" style="display:none;">' +
                '<div id="jtoTeks"></div>' +
            '</div>';

        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && boxKalender.parentNode) {
            boxKalender.parentNode.insertBefore(box, boxKalender.nextSibling);
        } else {
            card.appendChild(box);
        }

        document.getElementById('btnJadwalOtomatis').addEventListener('click', prosesJadwalOtomatis);
    }

    /* ──────────────────────────────────────────────────────────
       PATCH switchMode
    ────────────────────────────────────────────────────────── */
    function patchSwitchMode() {
        var _asli = window.switchMode;

        window.switchMode = function (mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');

            if (mode === 'jadwaltanam') {
                var semuaBox = document.querySelectorAll('.card > div[id^="box"]');
                semuaBox.forEach(function (b) { b.style.display = 'none'; });
                ['btnCamera','scanWindow','btnAnalisis','result'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });

                if (boxJTO) boxJTO.style.display = 'block';

                var titleEl = document.getElementById('modeTitle');
                if (titleEl) { titleEl.innerText = '📅 Jadwal Kegiatan Tani'; titleEl.style.color = WARNA; }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) subEl.style.display = 'none';

                document.querySelectorAll('.tab-btn').forEach(function (btn) {
                    btn.classList.remove('active');
                });
                var tabJTO = document.getElementById('tabJadwalTanam');
                if (tabJTO) tabJTO.classList.add('active');

                var hasilEl = document.getElementById('jtoHasil');
                if (hasilEl && hasilEl.style.display === 'none') {
                    prosesJadwalOtomatis();
                }

                return;
            }

            if (boxJTO) boxJTO.style.display = 'none';

            if (typeof _asli === 'function') {
                _asli.apply(this, arguments);
            }
        };
    }

    /* ──────────────────────────────────────────────────────────
       CSS TAMBAHAN
    ────────────────────────────────────────────────────────── */
    function injeksiCSS() {
        if (document.getElementById('jtoCSS')) return;
        var style = document.createElement('style');
        style.id = 'jtoCSS';
        style.textContent =
            '#tabJadwalTanam.active{background:' + WARNA + '!important;color:#fff!important;}' +
            '#tabJadwalTanam:not(.active){color:#708099;}' +
            '#btnJadwalOtomatis:hover{opacity:0.9;}' +
            '#btnJadwalOtomatis:active{transform:scale(0.99);}' +
            'body.light-mode #boxJadwalTanam{background:#fff;color:#0f172a;}';
        document.head.appendChild(style);
    }

    /* ──────────────────────────────────────────────────────────
       INISIALISASI
    ────────────────────────────────────────────────────────── */
    function init() {
        injeksiCSS();
        injeksiTab();
        injeksiBox();
        patchSwitchMode();

        console.log(
            '%c✅ patch_jadwal_tanam_otomatis.js v3.0 aktif — Scan 12 Bulan Kalender Iklim',
            'color:' + WARNA + ';font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
