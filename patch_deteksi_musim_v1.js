/**
 * ============================================================
 *  patch_deteksi_musim_v2.1.js
 *  Versi: 2.1 — ENSO/IOD Kembali Dipakai dalam Analisis Jadwal
 * ------------------------------------------------------------
 *  PERBAIKAN v2.1 vs v2.0:
 *
 *  [LAPISAN 5 — ENSO/IOD DIAMBIL TAPI TIDAK PERNAH DIPAKAI]
 *    rekomendasiWindowTanamV3() menerima parameter `ensoVal` dan
 *    `iodVal` (dikirim oleh prosesJadwalOtomatis() dari hasil
 *    getENSOAnomaly()/getIODAnomaly() — sumber NOAA CPC/PSL),
 *    dan juga menerima `skorBulan` (skor ZOM yang SUDAH disesuaikan
 *    ENSO/IOD oleh skorKelembapan() di patch_jadwal_tanam_otomatis).
 *
 *    NAMUN v2.0 membuang kedua hal tersebut total: `skorBulan`
 *    hanya dipakai untuk console.log perbandingan, dan `skorZOM`
 *    (skor yang benar-benar dipakai untuk seleksi & penilaian)
 *    dihitung ULANG murni dari rawZOM (mm klimatologi mentah) via
 *    skorZOMRegional() — tanpa jejak ensoVal/iodVal sama sekali.
 *
 *    Akibatnya: status El Niño/La Niña & IOD positif/negatif yang
 *    ditampilkan di UI ("Sumber: NOAA ENSO/IOD") TIDAK berpengaruh
 *    apa-apa terhadap bulan tanam, varietas, atau jendela onset
 *    yang direkomendasikan — analisis jadi tidak akurat saat
 *    terjadi anomali iklim kuat (mis. El Niño yang menggeser &
 *    memendekkan musim hujan secara nyata).
 *
 *    [FIX] Tambah faktorPenyesuaianENSOIOD(bulanIdx, zonaIklim,
 *    ensoVal, iodVal) — memakai tabel bobot korelasi BOBOT_IKLIM
 *    (sama seperti skorKelembapan asli & hitungWetnessScore di
 *    patch_risiko_iklim.js) untuk menghitung faktor pengali curah
 *    hujan per bulan (0.4–1.6×). rawZOM disesuaikan PER BULAN
 *    dengan faktor ini (→ rawZOMSesuai) SEBELUM dipakai untuk:
 *      • skorZOMRegional()      (skor 0–100 per bulan)
 *      • cariOnsetHujan()       (deteksi onset hujan efektif)
 *      • gerbang syarat air bajak (mmTanam/mmBajak)
 *
 *    El Niño / IOD positif kuat → rawZOMSesuai turun (musim makin
 *    kering/mundur). La Niña / IOD negatif kuat → rawZOMSesuai naik
 *    (musim makin basah/maju). Nilai mm ASLI (rawZOM, klimatologi)
 *    tetap ditampilkan di `alasan` untuk transparansi, ditambah
 *    catatan persentase penyesuaian ENSO/IOD jika signifikan (>3%).
 *
 *  [LAPISAN 5b — ZONA BOBOT_IKLIM TIDAK KONSISTEN DI PANTAI TIMUR SULSEL]
 *    Implementasi awal Lapisan 5 memakai window.tentukanZonaIklim(lat,lon)
 *    (fungsi generik nasional di patch_risiko_iklim.js) sebagai sumber
 *    utama zona BOBOT_IKLIM. Fungsi itu memakai batas lintang kasar
 *    `lat >= -4` untuk zona 'peralihan' (didokumentasikan untuk Sulawesi
 *    Tengah/Tenggara). Akibatnya, untuk zona musim 'timur' (Pantai Timur
 *    Sulsel: Wajo/Bone/Sinjai, lon 120.0–120.79, lat -6.0..-3.5) — SATU
 *    pola musim yang sama — bagian utara (lat -4.0..-3.5) mendapat bobot
 *    'peralihan', sementara bagian selatan (lat <-4) mendapat 'monsunal'.
 *    Padahal seluruh Sulawesi Selatan menurut dokumentasi BOBOT_IKLIM
 *    sendiri = 'monsunal'. Hasilnya: penyesuaian ENSO/IOD bisa "lompat"
 *    nilainya hanya karena selisih lintang 0,1–0,2°.
 *    [FIX] PEMETAAN_POLA_KE_ZONA_IKLIM (dari `polaPuncak`, yang sudah
 *    spesifik per-zona Sulawesi via REFERENSI_MUSIM_REGIONAL) kini jadi
 *    sumber UTAMA; tentukanZonaIklim(lat,lon) hanya fallback jika
 *    polaPuncak tidak dikenali.
 * ------------------------------------------------------------
 *  LATAR BELAKANG
 *  Versi 1.x menghasilkan rekomendasi tanam yang terlalu awal
 *  dari kebiasaan faktual petani — bulan yang dipilih belum ada
 *  hujan yang cukup untuk bajak lahan. Audit mendalam menemukan
 *  4 lapisan masalah yang saling memperkuat:
 *
 *  [LAPISAN 1 — SKOR ZOM MENYESATKAN]
 *    skorKelembapan() (di patch_jadwal v3.10) menggunakan
 *    normalisasi curah hujan berbasis skala absolut (mm):
 *      < 30mm  → −1.5  → skor ~12
 *      < 75mm  → −0.8  → skor ~30
 *      < 150mm →  0.0  → skor ~50
 *    Di Pantai Timur Sulsel (Wajo, Bone), bulan awal musim hujan
 *    (April) memiliki curah hujan 80–120 mm — cukup untuk bajak
 *    dan tanam secara faktual — tapi sistem memberinya skor 30–45,
 *    dikategorikan "kering/kurang layak". Ini membuat bulan yang
 *    benar tampak buruk di mata algoritma.
 *    [FIX] Tambahkan KOREKSI OFFSET REGIONAL: untuk zona 'timur'
 *    dan 'peralihan', nilai mm dianggap "cukup untuk tanam" dimulai
 *    dari 70mm (bukan 150mm). Koreksi ini dilakukan dengan
 *    menormalkan ulang skor mentah rawZOM sebelum dipakai sebagai
 *    acuan kelayakan tanam, menggunakan thresholdLayak per zona.
 *
 *  [LAPISAN 2 — FORMULA nilaiTotal TIDAK SENSITIF TERHADAP KONDISI AIR]
 *    Formula lama: nilaiTotal = (skorTanam×0.4) + (nilaiGen×0.4) + (nilaiPanen×0.2)
 *    Masalah: bobot generatif 0.40 dengan nilaiGen bisa 80–90 poin
 *    membuat perbedaan skor antar bulan tanam (misal 10 vs 20 poin)
 *    tidak cukup membedakan layak vs tidak layak. Bulan terlalu awal
 *    bisa menang karena nilaiGen-nya kebetulan lebih baik.
 *    [FIX] Formula baru menggunakan SYARAT GERBANG (gate condition):
 *      • Jika rawZOM[bTanam] < thresholdBajak → DISKUALIFIKASI total,
 *        tidak masuk kandidat sama sekali. Ini adalah kondisi wajib
 *        "ada air untuk bajak" berbasis mm aktual (bukan skor 0–100).
 *      • Jika lolos gerbang, nilaiTotal dihitung dengan bobot baru
 *        yang lebih menekankan kelayakan air saat tanam dan vegetatif.
 *
 *  [LAPISAN 3 — JENDELA KANDIDAT TIDAK MEMPERTIMBANGKAN ONSET HUJAN]
 *    rendengBulan = [startRendeng, +1, +2, +3] selalu dimulai
 *    dari bulan pertama musim tanpa memastikan hujan sudah stabil.
 *    Di Pantai Timur, April bisa jadi bulan "masuk" hujan tapi
 *    belum tentu stabil — Mei lebih sering menjadi onset yang benar.
 *    [FIX] Tambahkan deteksi ONSET HUJAN EFEKTIF: bulan pertama
 *    di mana rawZOM mencapai thresholdOnset (default 70mm untuk
 *    zona timur). Jendela kandidat dimulai dari onset ini, bukan
 *    dari startRendeng mentah. Ini mencegah bulan pra-onset masuk
 *    sebagai kandidat utama.
 *
 *  [LAPISAN 4 — PENALTI skorOlah KASAR DAN KONTRAPRODUKTIF]
 *    (Sudah dianalisis di v1.4 — tetap diperbaiki di sini)
 *    Penalti (50 − skorOlah) × 5 menggunakan bulan kasar (bTanam−1)
 *    dan threshold 50 yang terlalu tinggi, justru mendiskualifikasi
 *    bulan awal musim yang benar. Dihapus sepenuhnya dari seleksi
 *    kandidat. Informasi kondisi pengolahan dipindahkan ke field
 *    'alasan' sebagai peringatan kualitatif.
 *
 *  [TETAP dari v1.3]
 *    REFERENSI_MUSIM_REGIONAL, tentukanKalenderMusimLokal(),
 *    cariTglFaseBulan(), statusWaktuTanam(), deteksi lembah
 *    ekuatorial, pemisahan Barat/Timur di lon 120.0, nama musim
 *    lokal — semua tetap aktif tanpa perubahan.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       KONSTANTA THRESHOLD KELAYAKAN AIR PER ZONA
       Berbasis fakta agronomis lapangan Sulawesi:
         thresholdBajak : mm/bulan minimum untuk bajak & garu
         thresholdOnset  : mm/bulan minimum untuk tanam produktif
                          (onset hujan efektif)
         thresholdLayak  : mm/bulan yang setara skor "cukup layak"
                          untuk normalisasi ulang skor ZOM
    ========================================================= */
    var THRESHOLD_AIR = {
        barat:               { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 },
        timur:               { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        peralihan_sultra:    { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        ekuatorial_dua_puncak: { thresholdBajak: 70, thresholdOnset: 90, thresholdLayak: 110 },
        fallback:            { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 }
    };

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL (tidak berubah dari v1.3)
    ========================================================= */
    var REFERENSI_MUSIM_REGIONAL = [
        {
            latMin: -6.0, latMaks: -3.5, lonMin: 119.0, lonMaks: 119.99,
            polaPuncak: 'barat',
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Nov–Mar)',
            namaGadu:    'MT II — Musim Kedua (Gadu, Mei–Agu)'
        },
        {
            latMin: -6.0, latMaks: -3.5, lonMin: 120.0, lonMaks: 120.79,
            polaPuncak: 'timur',
            rendengMulai: 3, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama Lokal (Rendeng, Apr–Agu)',
            namaGadu:    'MT II — Musim Kedua Lokal (Gadu, Okt–Feb)'
        },
        {
            latMin: -6.0, latMaks: -2.5, lonMin: 120.8, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2, gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama (Mar–Jun)',
            namaGadu:    'MT II — Musim Kedua (Okt–Jan)'
        },
        {
            latMin: -3.49, latMaks: -0.5, lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11, gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Des–Mar)',
            namaGadu:    'MT II — Musim Kedua (Gadu, Jun–Sep)'
        },
        {
            latMin: -3.49, latMaks: 0.0, lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0, gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam (Jan–Apr)',
            namaGadu:    'MT II — Musim Tanam (Jul–Sep)'
        }
    ];

    /* =========================================================
       FUNGSI DETEKSI MUSIM LOKAL (tidak berubah dari v1.3)
    ========================================================= */
    function tentukanKalenderMusimLokal(lat, lon, rawZOM) {
        var refRegional = null;
        for (var r = 0; r < REFERENSI_MUSIM_REGIONAL.length; r++) {
            var ref = REFERENSI_MUSIM_REGIONAL[r];
            if (lat >= ref.latMin && lat <= ref.latMaks &&
                lon >= ref.lonMin && lon <= ref.lonMaks) {
                refRegional = ref;
                break;
            }
        }

        var bulanTertinggi = 0, nilaiMax = -Infinity;
        for (var i = 0; i < 12; i++) {
            if (rawZOM[i] > nilaiMax) { nilaiMax = rawZOM[i]; bulanTertinggi = i; }
        }

        var polaDariZOM = (nilaiMax < 0.4) ? 'ekuatorial' :
                         (bulanTertinggi >= 3 && bulanTertinggi <= 8) ? 'timur' : 'barat';

        if (refRegional) {
            if (refRegional.polaPuncak !== 'peralihan_sultra' &&
                refRegional.polaPuncak !== 'ekuatorial_dua_puncak' &&
                refRegional.polaPuncak !== polaDariZOM) {
                console.warn('[PatchMusim v2.0] Pola ZOM (' + polaDariZOM + ') berbeda dari referensi regional di [' +
                    lat.toFixed(3) + ', ' + lon.toFixed(3) + ']');
            }
            return Object.assign({}, refRegional, {
                sumber: 'referensi-regional',
                polaDideteksi: refRegional.polaPuncak
            });
        }

        if (polaDariZOM === 'timur') {
            return {
                rendengMulai: (bulanTertinggi - 1 + 12) % 12,
                gaduMulai: (bulanTertinggi + 5) % 12,
                namaRendeng: 'MT I — Musim Utama Lokal (Rendeng)',
                namaGadu:    'MT II — Musim Kedua Lokal (Gadu)',
                sumber: 'zom-pola-timur', polaDideteksi: 'timur'
            };
        }
        if (polaDariZOM === 'ekuatorial') return null;

        return {
            rendengMulai: 10, gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng)',
            namaGadu:    'MT II — Musim Kedua (Gadu)',
            sumber: 'fallback-pola-barat', polaDideteksi: 'barat'
        };
    }

    /* =========================================================
       HELPER FUNCTIONS
    ========================================================= */
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];

    var EPOCH_BULAN_BARU = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
    }
    function tanggalDariBulanTahun(b, t) { return new Date(t, b, 1); }

    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_BARU.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }

    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined &&
                t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return mulai;
    }

    /* [FIX LAPISAN 4] Disalin dari v3.10 — sinkron dengan tglFaseBaik */
    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    /* =========================================================
       [FIX LAPISAN 1] NORMALISASI SKOR BERBASIS THRESHOLD REGIONAL
       Mengubah mm rawZOM menjadi skor 0–100 yang mencerminkan
       kelayakan tanam aktual di zona yang bersangkutan.
       Zona 'timur' dan 'peralihan' memiliki threshold lebih rendah
       karena secara faktual petani bisa bajak di 60–80mm/bulan.

       Skala:
         0   mm              → skor  0  (tidak mungkin tanam)
         thresholdBajak/2    → skor 20  (sangat kering, hanya tabela)
         thresholdBajak      → skor 40  (cukup bajak, mulai layak)
         thresholdOnset      → skor 60  (onset hujan, layak tapin)
         thresholdLayak      → skor 75  (kondisi baik)
         thresholdLayak×1.5  → skor 85  (optimal)
         thresholdLayak×2+   → skor 95  (terlalu basah, tetap bisa)
    ========================================================= */
    function skorZOMRegional(mmBulanIni, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var b  = th.thresholdBajak;
        var o  = th.thresholdOnset;
        var l  = th.thresholdLayak;

        if (mmBulanIni <= 0)       return 0;
        if (mmBulanIni < b / 2)    return Math.round(mmBulanIni / (b / 2) * 20);
        if (mmBulanIni < b)        return Math.round(20 + (mmBulanIni - b / 2) / (b / 2) * 20);
        if (mmBulanIni < o)        return Math.round(40 + (mmBulanIni - b)     / (o - b) * 20);
        if (mmBulanIni < l)        return Math.round(60 + (mmBulanIni - o)     / (l - o) * 15);
        if (mmBulanIni < l * 1.5)  return Math.round(75 + (mmBulanIni - l)     / (l * 0.5) * 10);
        if (mmBulanIni < l * 2)    return Math.round(85 + (mmBulanIni - l * 1.5) / (l * 0.5) * 10);
        return 95;
    }

    /* =========================================================
       [FIX LAPISAN 3] DETEKSI ONSET HUJAN EFEKTIF
       Mencari bulan pertama dalam jendela musim di mana rawZOM
       sudah mencapai thresholdOnset secara berturutan (atau setidaknya
       bulan itu sendiri). Ini mencegah bulan pra-onset (masih kering
       atau hujan sporadis) masuk sebagai kandidat awal.

       Mengembalikan index bulan onset (0–11), atau startMusim jika
       semua bulan di jendela di bawah threshold (fallback aman).
    ========================================================= */
    function cariOnsetHujan(startMusim, rawZOM, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var tOn = th.thresholdOnset;

        /* Cari bulan pertama di 6 bulan ke depan yang mmnya >= thresholdOnset
           DAN bulan berikutnya juga >= thresholdBajak (onset stabil, bukan hujan 1x) */
        for (var offset = 0; offset < 6; offset++) {
            var bIni  = (startMusim + offset) % 12;
            var bBrk  = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= tOn && rawZOM[bBrk] >= th.thresholdBajak) {
                if (offset > 0) {
                    console.log('[PatchMusim v2.0] Onset hujan efektif: ' +
                        NAMA_BULAN[bIni] + ' (geser ' + offset + ' bulan dari ' +
                        NAMA_BULAN[startMusim] + ', ZOM=' + rawZOM[bIni].toFixed(0) + 'mm)');
                }
                return bIni;
            }
        }
        /* Fallback: pakai startMusim asli jika tidak ada yang memenuhi.
           Ini aman karena filter gerbang bajak di bawah akan menangkis bulan kering. */
        console.warn('[PatchMusim v2.0] Onset tidak terdeteksi — pakai startMusim: ' + NAMA_BULAN[startMusim]);
        return startMusim;
    }

    /* =========================================================
       [FIX LAPISAN 5] FAKTOR PENYESUAIAN ENSO/IOD
       Menghitung faktor pengali curah hujan bulanan dari anomali
       ENSO (ONI) & IOD (DMI) terkini, memakai tabel bobot korelasi
       BOBOT_IKLIM (Aldrian & Susanto 2003; Nur'utami & Hidayat 2016;
       Boer & Faqih 2004) — sumber yang sama dengan skorKelembapan()
       asli di patch_jadwal_tanam_otomatis.js & hitungWetnessScore()
       di patch_risiko_iklim.js.

       deltaIdx berada di skala indeks ZOM (-1.5..+1.5), sama seperti
       pada skorKelembapan(). Setiap 1.0 unit deltaIdx ≈ ±35% perubahan
       curah hujan bulanan terhadap klimatologi rawZOM. Faktor dibatasi
       0.4–1.6× agar tetap masuk akal secara agronomis.

       ENSO/IOD positif kuat (El Niño / IOD+) → faktor < 1
         (musim makin kering & onset hujan mundur).
       ENSO/IOD negatif kuat (La Niña / IOD−) → faktor > 1
         (musim makin basah & onset hujan lebih cepat).
    ========================================================= */
    function faktorPenyesuaianENSOIOD(bulanIdx, zonaIklim, ensoVal, iodVal) {
        var tabel = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        if (!tabel || (!ensoVal && !iodVal)) return 1;

        var tz  = tabel[zonaIklim] || tabel.monsunal;
        var wE  = tz.enso[bulanIdx];
        var wI  = tz.iod[bulanIdx];
        var tot = 1 + wE + wI;

        var deltaIdx = -(ensoVal * wE / tot) - (iodVal * wI / tot);
        var faktor   = 1 + (deltaIdx * 0.35);
        return Math.max(0.4, Math.min(1.6, faktor));
    }

    /**
     * [FIX LAPISAN 5] Terapkan faktor ENSO/IOD ke seluruh 12 bulan
     * rawZOM → rawZOMSesuai. rawZOM asli TIDAK diubah (tetap dipakai
     * untuk tampilan `alasan`); rawZOMSesuai dipakai untuk skor,
     * onset, dan gerbang syarat air.
     */
    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        return rawZOM.map(function (mm, idx) {
            return mm * faktorPenyesuaianENSOIOD(idx, zonaIklim, ensoVal, iodVal);
        });
    }

    /* =========================================================
       FUNGSI UTAMA REKOMENDASI (rekonstruksi menyeluruh)
    ========================================================= */
    function rekomendasiWindowTanamV3(skorBulan, rawZOM, zona, ensoVal = 0, iodVal = 0) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);

        var startRendeng, startGadu, namaRendeng, namaGadu, polaPuncak;

        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai;
            startGadu    = kalenderLokal.gaduMulai;
            namaRendeng  = kalenderLokal.namaRendeng;
            namaGadu     = kalenderLokal.namaGadu;
            polaPuncak   = kalenderLokal.polaPuncak || kalenderLokal.polaDideteksi || 'barat';

            console.log(
                '%c[PatchMusim v2.0] Zona: ' + polaPuncak +
                ' | Sumber: ' + kalenderLokal.sumber +
                '\n Rendeng mulai : ' + NAMA_BULAN[startRendeng] +
                ' | Gadu mulai : ' + NAMA_BULAN[startGadu] +
                '\n Koordinat : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#3b82f6; font-weight:bold;'
            );
        } else {
            polaPuncak = 'ekuatorial_dua_puncak';
            console.log('[PatchMusim v2.0] Pola ekuatorial — deteksi lembah ZOM aktif');
            var maxSum = -Infinity; startRendeng = 0;
            for (var i = 0; i < 12; i++) {
                var sum = 0;
                for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
                if (sum > maxSum) { maxSum = sum; startRendeng = i; }
            }
            var minSum = Infinity; startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    var tengahLembah     = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum; startGadu = ii;
                    }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu    = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;

        /* ── [FIX LAPISAN 5] Tentukan zona BOBOT_IKLIM (monsunal/ekuatorial/
           peralihan/lokal) untuk bobot korelasi ENSO/IOD.

           [FIX LAPISAN 5b] PRIORITASKAN pemetaan dari `polaPuncak` —
           yang sudah ditentukan secara spesifik untuk Sulawesi via
           REFERENSI_MUSIM_REGIONAL — DI ATAS tentukanZonaIklim(lat,lon)
           (fungsi generik nasional di patch_risiko_iklim.js).

           Alasan: tentukanZonaIklim() memakai batas lintang kasar
           `lat >= -4` untuk zona 'peralihan' (didokumentasikan untuk
           Sulawesi Tengah/Tenggara). Untuk zona 'timur' (Pantai Timur
           Sulsel: Wajo/Bone/Sinjai, lon 120.0–120.79, lat -6.0..-3.5),
           bagian UTARA-nya (lat -4.0..-3.5, msl. Wajo bagian utara)
           jatuh ke 'peralihan', sementara bagian SELATAN-nya (lat <-4,
           msl. Sengkang/Watampone/Sinjai) jatuh ke 'monsunal' — padahal
           keduanya satu pola musim ('timur') & satu provinsi (Sulsel,
           yang menurut dokumentasi BOBOT_IKLIM sendiri = 'monsunal').
           Pemetaan via polaPuncak menjaga konsistensi bobot ENSO/IOD
           di seluruh wilayah zona 'timur', tidak "lompat" hanya karena
           selisih lintang 0.1–0.2°.

           tentukanZonaIklim(lat,lon) tetap dipakai sebagai fallback
           jika polaPuncak tidak dikenali (di luar 4 nilai standar). ── */
        var PEMETAAN_POLA_KE_ZONA_IKLIM = {
            barat: 'monsunal',
            timur: 'monsunal',
            peralihan_sultra: 'peralihan',
            ekuatorial_dua_puncak: 'ekuatorial'
        };
        var zonaIklim = PEMETAAN_POLA_KE_ZONA_IKLIM[polaPuncak] ||
            ((typeof window.tentukanZonaIklim === 'function')
                ? window.tentukanZonaIklim(lat, lon)
                : 'monsunal');

        /* ── [FIX LAPISAN 5] Sesuaikan rawZOM dengan anomali ENSO/IOD
           SEBELUM dipakai untuk skor, onset, dan gerbang air. rawZOM
           asli tetap dipakai utuh untuk tampilan `alasan`. ── */
        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);

        /* ── [FIX LAPISAN 1] Hitung ulang skor ZOM berbasis threshold regional,
           dari rawZOM yang sudah disesuaikan ENSO/IOD ── */
        var skorZOM = rawZOMSesuai.map(function(mm) {
            return skorZOMRegional(mm, polaPuncak);
        });

        /* Log perbandingan skor lama vs baru untuk debugging lapangan */
        console.log('[PatchMusim v2.1] Zona iklim ENSO/IOD: ' + zonaIklim +
            ' | ENSO=' + ensoVal + ' | IOD=' + iodVal);
        console.log('[PatchMusim v2.1] Skor ZOM regional (vs skor lama dari skorBulan):');
        var logBaris = [];
        for (var m = 0; m < 12; m++) {
            var faktorLog = faktorPenyesuaianENSOIOD(m, zonaIklim, ensoVal, iodVal);
            logBaris.push(NAMA_BULAN[m].substring(0,3) + ':' +
                rawZOM[m].toFixed(0) + 'mm×' + faktorLog.toFixed(2) +
                '=' + rawZOMSesuai[m].toFixed(0) + 'mm→' + skorZOM[m] +
                '(lama:' + skorBulan[m] + ')');
        }
        console.log(logBaris.join(' | '));

        /* ── [FIX LAPISAN 3] Deteksi onset hujan efektif, dari rawZOM
           yang sudah disesuaikan ENSO/IOD (onset bisa mundur saat
           El Niño/IOD+, atau lebih cepat saat La Niña/IOD−) ── */
        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak);

        /* Bangun jendela 4 bulan dimulai dari onset (bukan dari startMusim kasar) */
        var rendengBulan = [onsetRendeng, (onsetRendeng+1)%12, (onsetRendeng+2)%12, (onsetRendeng+3)%12];
        var gaduBulan    = [onsetGadu,    (onsetGadu+1)%12,    (onsetGadu+2)%12,    (onsetGadu+3)%12];

        var MUSIM = [
            { nama: namaRendeng, kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: namaGadu,    kode: 'gadu',    bulanTanam: gaduBulan    }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var mmTanam   = rawZOM[bTanam];
                var mmBajak   = rawZOM[(bTanam - 1 + 12) % 12]; /* bulan pengolahan lahan */

                /* [FIX LAPISAN 5] Versi yang sudah disesuaikan ENSO/IOD —
                   dipakai untuk gerbang & penalti onset (kondisi aktual
                   yang diperkirakan), sementara mmTanam/mmBajak (raw,
                   klimatologi) tetap dipakai untuk tampilan `alasan`. */
                var mmTanamSesuai = rawZOMSesuai[bTanam];
                var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];

                /* ── [FIX LAPISAN 2] GERBANG SYARAT AIR MUTLAK ──────────────
                   Bulan tanam WAJIB memiliki curah hujan minimal thresholdBajak
                   DI BULAN PENGOLAHAN (bTanam−1) atau di bulan tanam itu sendiri.
                   Ini mencerminkan kenyataan lapangan: petani butuh air untuk
                   bajak/garu sebelum atau saat tanam. Tanpa air bajak, tidak ada
                   kandidat dari bulan ini — tidak peduli nilai generatif/panen.
                ──────────────────────────────────────────────────────────── */
                var mmUntukBajak = Math.max(mmBajakSesuai, mmTanamSesuai);
                if (mmUntukBajak < th.thresholdBajak) {
                    console.log('[PatchMusim v2.1] Bulan ' + NAMA_BULAN[bTanam] +
                        ' dilewati (bajak: ' + mmUntukBajak.toFixed(0) +
                        'mm setelah penyesuaian ENSO/IOD < threshold ' + th.thresholdBajak + 'mm)');
                    return; /* skip — belum ada air untuk bajak */
                }

                var skorTanam = skorZOM[bTanam]; /* [FIX LAPISAN 1] pakai skor regional */
                if (skorTanam < 10) return; /* kering ekstrem mutlak */

                varianArr.forEach(function (v) {
                    var hariGen    = Math.floor(v.panen * v.persenGen);
                    var tglRef     = tanggalDariBulanTahun(bTanam, tahunSekarang);
                    var bGenIdx    = tambahHari(tglRef, hariGen).getMonth();
                    var bPanenIdx  = tambahHari(tglRef, v.panen).getMonth();
                    var bVeg1      = (bTanam + 1) % 12;

                    var skorGen    = skorZOM[bGenIdx];   /* [FIX LAPISAN 1] */
                    var skorPanen  = skorZOM[bPanenIdx]; /* [FIX LAPISAN 1] */
                    var skorVeg1   = skorZOM[bVeg1];     /* [FIX LAPISAN 1] */

                    /* ── [FIX LAPISAN 2] Formula nilaiTotal baru ────────────────
                       Bobot dirancang agar kondisi air saat tanam & vegetatif
                       menjadi penentu utama. Generatif & panen sebagai penyeimbang.

                       nilaiTanam (0.45): skor air saat tanam — dominan.
                       nilaiVeg1  (0.20): skor air bulan vegetatif pertama —
                                          penting untuk anakan produktif.
                       nilaiGen   (0.20): mendekati 50 = optimal generatif
                                          (tidak terlalu kering/basah).
                       nilaiPanen (0.15): rendah = bagus (panen kering lebih mudah).

                       Penalti tambahan:
                       • Jika mmTanam < thresholdOnset (ada air tapi sedikit):
                         penalti progresif — mencegah bulan "cukup bajak tapi
                         terlalu kering untuk tanam produktif" mendominasi.
                       • Jika skorVeg1 sangat rendah: bulan vegetatif kering,
                         risiko kematian anakan.
                    ─────────────────────────────────────────────────────────── */
                    var nilaiTanam = skorTanam;
                    var nilaiVeg1  = skorVeg1;
                    var nilaiGen   = 100 - Math.abs(skorGen - 55);  /* optimal ~skor 55 = hujan sedang */
                    var nilaiPanen = 100 - (skorPanen * 0.5);       /* makin kering makin bagus */

                    var nilaiTotal = (nilaiTanam * 0.45) +
                                     (nilaiVeg1  * 0.20) +
                                     (nilaiGen   * 0.20) +
                                     (nilaiPanen * 0.15);

                    /* Penalti: bulan tanam ada air tapi kurang dari onset stabil
                       [FIX LAPISAN 5] pakai mm yang sudah disesuaikan ENSO/IOD */
                    if (mmTanamSesuai < th.thresholdOnset) {
                        nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    }

                    /* Penalti: vegetatif sangat kering (anakan mati) */
                    if (skorVeg1 < 25) {
                        nilaiTotal -= (25 - skorVeg1) * 1.0;
                    }

                    kandidatMusim.push({
                        musimNama     : musim.nama,
                        musimKode     : musim.kode,
                        bTanam        : bTanam,
                        tahunTanam    : tahunSekarang,
                        varietas      : v.kode,
                        labelVar      : v.label,
                        panen         : v.panen,
                        nilaiTotal    : nilaiTotal,
                        skorTanam     : skorTanam,
                        mmTanam       : mmTanam,
                        mmTanamSesuai : mmTanamSesuai,
                        mmBajak       : mmBajak,
                        skorGen       : skorGen,
                        skorPanen     : skorPanen,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    });
                });
            });

            /* ── FALLBACK jika semua bulan di bawah threshold bajak ── */
            if (kandidatMusim.length === 0) {
                /* Pilih bulan dengan mm (terkoreksi ENSO/IOD) tertinggi
                   di jendela musim sebagai fallback [FIX LAPISAN 5] */
                var bFallback  = musim.bulanTanam[0];
                var mmMax      = -1;
                musim.bulanTanam.forEach(function(b) {
                    if (rawZOMSesuai[b] > mmMax) { mmMax = rawZOMSesuai[b]; bFallback = b; }
                });

                var tglAwalFb  = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFb  = cariTglFaseBulan(tglAwalFb, 3, 8, 0, bFallback);
                var statusFb   = statusWaktuTanam(tglFaseFb, now);

                hasilDuaMusim.push({
                    musimNama  : musim.nama,
                    musimKode  : musim.kode,
                    tglTanam   : tglFaseFb,
                    varietas   : 'sedang',
                    labelVar   : 'Sedang (95–115 HST)',
                    alasan     : 'Seluruh jendela tanam di bawah threshold air untuk bajak (' +
                                 th.thresholdBajak + 'mm) setelah penyesuaian ENSO/IOD. Dipilih bulan ' +
                                 'dengan curah hujan tertinggi (' + NAMA_BULAN[bFallback] + ', ' +
                                 rawZOM[bFallback].toFixed(0) + 'mm klimatologi → ' + mmMax.toFixed(0) +
                                 'mm setelah penyesuaian). ' +
                                 'Pompanisasi penuh wajib disiapkan sebelum pengolahan lahan.',
                    isLewat    : statusFb.isLewat,
                    isBerjalan : statusFb.isBerjalan
                });

            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);

// Tangkap null dari kegagalan fungsi di atas
if (!tglFaseBaik) {
    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
}
// Fallback pamungkas
if (!tglFaseBaik) {
    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
}
                /* [FIX LAPISAN 4] isLewat dari tanggal FINAL, bukan heuristik */
                var statusBest = statusWaktuTanam(tglFaseBaik, now);

                /* Informasi kondisi pengolahan lahan — sebagai peringatan, bukan penalti */
                var tglOlah      = tambahHari(tglFaseBaik, -14);
                var bOlah        = tglOlah.getMonth();
                var mmOlah       = rawZOM[bOlah];
                var catatanOlah  = mmOlah < th.thresholdBajak
                    ? 'Perhatian: pengolahan lahan jatuh di ' + NAMA_BULAN[bOlah] +
                      ' (' + mmOlah.toFixed(0) + 'mm) — siapkan pompanisasi awal untuk bajak.'
                    : '';

                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' :
                                      best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' :
                                      best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                /* [FIX LAPISAN 5] Catatan penyesuaian ENSO/IOD jika signifikan (>3%) */
                var catatanENSOIOD = '';
                if (best.mmTanam > 0) {
                    var persenSesuai = ((best.mmTanamSesuai - best.mmTanam) / best.mmTanam) * 100;
                    if (Math.abs(persenSesuai) > 3) {
                        catatanENSOIOD = ' 🌐 Curah hujan disesuaikan ' +
                            (persenSesuai > 0 ? '+' : '') + persenSesuai.toFixed(0) +
                            '% akibat anomali ENSO/IOD terkini (ONI ' +
                            (ensoVal >= 0 ? '+' : '') + ensoVal.toFixed(2) + ', DMI ' +
                            (iodVal >= 0 ? '+' : '') + iodVal.toFixed(2) + ').';
                    }
                }

                var alasan =
                    'Curah hujan saat tanam: ' + best.mmTanam.toFixed(0) + 'mm' +
                    ' (skor regional ' + best.skorTanam + '/100). ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). ' +
                    'Panen di ' + best.namaBulanPanen + ' (' + keteranganPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '') +
                    catatanENSOIOD;

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

        hasilDuaMusim.sort(function (a, b) {
            return a.tglTanam.getTime() - b.tglTanam.getTime();
        });

        return hasilDuaMusim;
    }

    /* =========================================================
       INJEKSI OVERRIDE
    ========================================================= */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam     = rekomendasiWindowTanamV3;
        window.tentukanKalenderMusimLokal = tentukanKalenderMusimLokal;
        window.statusWaktuTanam           = statusWaktuTanam;
        window._thresholdAirMusim         = THRESHOLD_AIR; /* expose untuk debugging */
        window._faktorPenyesuaianENSOIOD  = faktorPenyesuaianENSOIOD; /* expose untuk debugging */

        console.log(
            '%c✅ patch_deteksi_musim_v2.1.js aktif\n' +
            '   Fix #1 (Lapisan 1): Skor ZOM dinormalisasi ulang per zona regional\n' +
            '   Fix #2 (Lapisan 2): Gerbang syarat air bajak berbasis mm aktual\n' +
            '   Fix #3 (Lapisan 3): Jendela kandidat dimulai dari onset hujan efektif\n' +
            '   Fix #4 (Lapisan 4): isLewat/isBerjalan sinkron dengan tglFaseBaik\n' +
            '   Fix #5 (Lapisan 5): ENSO/IOD (NOAA) kini disesuaikan ke rawZOM sebelum\n' +
            '                       dipakai untuk skor, onset, & gerbang air — sebelumnya\n' +
            '                       diterima tapi diabaikan total\n' +
            '   Fix #5b: Zona BOBOT_IKLIM untuk ENSO/IOD kini konsisten di seluruh\n' +
            '            Pantai Timur Sulsel (polaPuncak -> zona, bukan lat/lon mentah)\n' +
            '   Penalti skorOlah dihapus dari seleksi — dipindahkan ke field alasan',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
