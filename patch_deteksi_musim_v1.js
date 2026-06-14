/**
 * ============================================================
 *  patch_deteksi_musim_v1.4.js
 *  Versi: 1.4 — Fix Bug Penalti Olah Lahan + Fix isLewat Sinkron
 * ------------------------------------------------------------
 *  PERBAIKAN v1.4 vs v1.3:
 *
 *  [FIX KRITIS #1] Penalti skorOlah terlalu keras & pakai bulan salah.
 *    v1.3 memakai: bOlah = (bTanam - 1 + 12) % 12 (bulan kasar sebelum
 *    tanam) lalu menerapkan penalti (50 - skorOlah) × 5 jika skorOlah < 50.
 *    Ini menyebabkan bulan-bulan awal musim (misal April di Pantai Timur
 *    Sulsel) terdiskalifikasi besar-besaran karena bulan Maret memang masih
 *    kering — padahal itu wajar secara agronomis dan justru waktu tanam yang
 *    tepat. Penalti −60 s/d −100 poin mendominasi seluruh nilai kandidat.
 *    [FIX] Penalti olah lahan dihitung dari tanggal AKTUAL pengolahan:
 *      tglOlahAktual = tglFaseBaik − 14 hari (konsisten dengan bangunKegiatan)
 *      bOlahAktual   = tglOlahAktual.getMonth()
 *    Threshold diturunkan ke 25 (kering kritis) dengan multiplier 1.0 (ringan).
 *    Penalti ini HANYA diterapkan SETELAH tglFaseBaik final ditemukan, bukan
 *    saat mengevaluasi kandidat (karena kandidat belum punya tanggal final).
 *    Selama evaluasi kandidat, cukup gunakan penalti skorTanam dan skorVeg1
 *    yang sudah ada (threshold 30, multiplier 1.5) — itu sudah memadai.
 *
 *  [FIX KRITIS #2] isLewat/isBerjalan tidak sinkron dengan tglFaseBaik.
 *    v1.3 masih memakai heuristik: isLewat = bTanam < bulanSekarang ||
 *    (bTanam === bulanSekarang && now.getDate() > 20). Ini tidak konsisten
 *    dengan tanggal fase bulan aktual (tglFaseBaik) yang bisa jatuh di
 *    tanggal berapa pun. v3.10 sudah memperbaiki ini dengan
 *    statusWaktuTanam(tglFaseBaik, now), tapi karena rekomendasiWindowTanamV2
 *    meng-override fungsi asli v3.10, fix tersebut ikut terbuang.
 *    [FIX] statusWaktuTanam() di-copy ke dalam patch ini (tidak bergantung
 *    urutan load script) dan dipanggil SETELAH tglFaseBaik final didapat —
 *    identik dengan pola yang dipakai v3.10.
 *
 *  [TETAP dari v1.3] Semua logika deteksi zona regional (REFERENSI_MUSIM_REGIONAL),
 *    tentukanKalenderMusimLokal(), deteksi lembah ekuatorial, pemisahan
 *    Barat/Timur di lon 120.0, dan nama musim lokal tetap aktif tanpa perubahan.
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
       (Tidak berubah dari v1.3)
    ========================================================= */
    var REFERENSI_MUSIM_REGIONAL = [
        {
            latMin: -6.0, latMaks: -3.5,
            lonMin: 119.0, lonMaks: 119.99,
            polaPuncak: 'barat',
            rendengMulai: 10,
            gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Nov–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Mei–Agu)'
        },
        {
            latMin: -6.0, latMaks: -3.5,
            lonMin: 120.0, lonMaks: 120.79,
            polaPuncak: 'timur',
            rendengMulai: 3,
            gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama Lokal (Rendeng, Apr–Agu)',
            namaGadu: 'MT II — Musim Kedua Lokal (Gadu, Okt–Feb)'
        },
        {
            latMin: -6.0, latMaks: -2.5,
            lonMin: 120.8, lonMaks: 124.5,
            polaPuncak: 'peralihan_sultra',
            rendengMulai: 2,
            gaduMulai: 9,
            namaRendeng: 'MT I — Musim Utama (Mar–Jun)',
            namaGadu: 'MT II — Musim Kedua (Okt–Jan)'
        },
        {
            latMin: -3.49, latMaks: -0.5,
            lonMin: 118.5, lonMaks: 119.79,
            polaPuncak: 'barat',
            rendengMulai: 11,
            gaduMulai: 5,
            namaRendeng: 'MT I — Musim Utama (Rendeng, Des–Mar)',
            namaGadu: 'MT II — Musim Kedua (Gadu, Jun–Sep)'
        },
        {
            latMin: -3.49, latMaks: 0.0,
            lonMin: 119.8, lonMaks: 122.5,
            polaPuncak: 'ekuatorial_dua_puncak',
            rendengMulai: 0,
            gaduMulai: 6,
            namaRendeng: 'MT I — Musim Tanam (Jan–Apr)',
            namaGadu: 'MT II — Musim Tanam (Jul–Sep)'
        }
    ];

    /* =========================================================
       FUNGSI DETEKSI MUSIM LOKAL (Tidak berubah dari v1.3)
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
                console.warn('[PatchMusim] Pola ZOM (' + polaDariZOM + ') berbeda dari referensi regional di [' + lat.toFixed(3) + ', ' + lon.toFixed(3) + ']');
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
                namaGadu: 'MT II — Musim Kedua Lokal (Gadu)',
                sumber: 'zom-pola-timur',
                polaDideteksi: 'timur'
            };
        }

        if (polaDariZOM === 'ekuatorial') return null;

        return {
            rendengMulai: 10,
            gaduMulai: 4,
            namaRendeng: 'MT I — Musim Utama (Rendeng)',
            namaGadu: 'MT II — Musim Kedua (Gadu)',
            sumber: 'fallback-pola-barat',
            polaDideteksi: 'barat'
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
        var h = new Date(d);
        h.setDate(h.getDate() + n);
        return h;
    }

    function tanggalDariBulanTahun(bulanIdx, tahun) {
        return new Date(tahun, bulanIdx, 1);
    }

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

    /**
     * [FIX KRITIS #2] Disalin dari v3.10 agar tidak bergantung urutan load.
     * Menentukan status waktu berdasarkan tanggal tanam FINAL (tglFaseBaik),
     * bukan bulan kasar + heuristik "tanggal > 20".
     */
    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    /* =========================================================
       FUNGSI UTAMA YANG DI-OVERRIDE
    ========================================================= */
    function rekomendasiWindowTanamV2(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        var lat = (window._lokasiKalender && window._lokasiKalender.lat) || -4.0;
        var lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;

        var kalenderLokal = tentukanKalenderMusimLokal(lat, lon, rawZOM);

        var startRendeng, startGadu, namaRendeng, namaGadu;

        if (kalenderLokal !== null) {
            startRendeng = kalenderLokal.rendengMulai;
            startGadu    = kalenderLokal.gaduMulai;
            namaRendeng  = kalenderLokal.namaRendeng;
            namaGadu     = kalenderLokal.namaGadu;

            console.log(
                '%c[PatchMusim v1.4] Kalender musim lokal: ' + kalenderLokal.sumber +
                '\n Pola : ' + kalenderLokal.polaDideteksi +
                '\n Rendeng mulai : ' + NAMA_BULAN[startRendeng] +
                '\n Gadu mulai : ' + NAMA_BULAN[startGadu] +
                '\n Koordinat : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#3b82f6; font-weight:bold;'
            );
        } else {
            console.log('[PatchMusim v1.4] Pola ekuatorial — deteksi lembah ZOM aktif');
            var maxSum = -Infinity;
            startRendeng = 0;
            for (var i = 0; i < 12; i++) {
                var sum = 0;
                for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
                if (sum > maxSum) { maxSum = sum; startRendeng = i; }
            }
            var minSum = Infinity;
            startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
                    var tengahLembah    = (ii + 2) % 12;
                    var jarakDariRendeng = (tengahLembah - startRendeng + 12) % 12;
                    if (jarakDariRendeng >= 3 && jarakDariRendeng <= 9) {
                        minSum = lembahSum;
                        startGadu = ii;
                    }
                }
            }
            namaRendeng = 'MT I — Musim Utama (Puncak Hujan)';
            namaGadu    = 'MT II — Musim Kedua (Hujan Menurun)';
        }

        var rendengBulan = [startRendeng, (startRendeng+1)%12, (startRendeng+2)%12, (startRendeng+3)%12];
        var gaduBulan    = [startGadu,    (startGadu+1)%12,    (startGadu+2)%12,    (startGadu+3)%12];

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
                var tahunTanam = tahunSekarang;
                var skorTanam  = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen     = Math.floor(v.panen * v.persenGen);
                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunTanam);
                    var bGenIdx     = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHari(tglTanamRef, v.panen).getMonth();

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];
                    var bVeg1     = (bTanam + 1) % 12;
                    var skorVeg1  = skorBulan[bVeg1];

                    /* ── Penghitungan nilai kandidat ──────────────────────────
                       [FIX #1] Penalti skorOlah DIHAPUS dari sini.
                       Alasan: bOlah kasar (bTanam − 1) tidak selalu mencerminkan
                       bulan pengolahan aktual (bangunKegiatan memakai −14 hari dari
                       tglFaseBaik), dan threshold 50 × multiplier 5 terlalu besar
                       sehingga mendiskalifikasi bulan-bulan awal musim yang wajar.
                       Penalti berbasis skor kering di bawah (threshold 30, ×1.5)
                       sudah cukup menjaga kualitas kandidat tanpa over-penalti.
                    ─────────────────────────────────────────────────────────── */
                    var nilaiTanam = skorTanam;
                    var nilaiGen   = 100 - Math.abs(skorGen - 50);
                    var nilaiPanen = 100 - (skorPanen * 0.5);

                    var nilaiTotal = (nilaiTanam * 0.40) + (nilaiGen * 0.40) + (nilaiPanen * 0.20);

                    if (skorTanam < 30) nilaiTotal -= (30 - skorTanam) * 1.5;
                    if (skorVeg1  < 30) nilaiTotal -= (30 - skorVeg1)  * 1.5;

                    kandidatMusim.push({
                        musimNama  : musim.nama,
                        musimKode  : musim.kode,
                        bTanam     : bTanam,
                        tahunTanam : tahunTanam,
                        varietas   : v.kode,
                        labelVar   : v.label,
                        panen      : v.panen,
                        nilaiTotal : nilaiTotal,
                        skorTanam  : skorTanam,
                        skorGen    : skorGen,
                        skorPanen  : skorPanen,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    });
                });
            });

            /* ── FALLBACK jika semua bulan kering ekstrem ─────── */
            if (kandidatMusim.length === 0) {
                var bFallback       = musim.bulanTanam[0];
                var tglAwalFallback = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulan(tglAwalFallback, 3, 8, 0, bFallback);

                // [FIX #2] Gunakan statusWaktuTanam dari tanggal fase aktual
                var statusFallback = statusWaktuTanam(tglFaseFallback, now);

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

                /* ── Cari tanggal fase bulan final ───────────────── */
                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
                var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);

                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                }
                if (tglFaseBaik.getMonth() !== best.bTanam) {
                    tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
                }

                /* ── [FIX #1] Evaluasi penalti olah lahan dari tanggal AKTUAL ──
                   Hanya sebagai catatan alasan, tidak lagi mempengaruhi pemilihan
                   kandidat (sudah terlanjur memilih best). Jika perlu mempengaruhi
                   seleksi, pertimbangkan refactor lebih lanjut ke v1.5.
                   Di sini kita simpan info untuk alasan/log saja.
                ────────────────────────────────────────────────────────────── */
                var tglOlahAktual = tambahHari(tglFaseBaik, -14);
                var bOlahAktual   = tglOlahAktual.getMonth();
                var skorOlahFinal = skorBulan[bOlahAktual];
                var catatanOlah   = skorOlahFinal < 25
                    ? 'Pengolahan di ' + NAMA_BULAN[bOlahAktual] + ' masih kering (skor ' + skorOlahFinal + ') — siapkan pompanisasi untuk bajak.'
                    : '';

                /* ── [FIX #2] isLewat/isBerjalan dari tanggal FINAL ─── */
                var statusBest = statusWaktuTanam(tglFaseBaik, now);

                var keteranganSkorGen =
                    best.skorGen < 25 ? 'kering — risiko puso' :
                    best.skorGen > 70 ? 'basah — waspada Blast' : 'optimal pembungaan';

                var keteranganSkorPanen =
                    best.skorPanen > 65 ? 'basah — butuh dryer' :
                    best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                var alasan =
                    'Skor bulan tanam: ' + best.skorTanam + '/100. ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganSkorGen + '). ' +
                    'Panen di ' + best.namaBulanPanen + ' (' + keteranganSkorPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '');

                hasilDuaMusim.push({
                    musimNama  : best.musimNama,
                    musimKode  : best.musimKode,
                    tglTanam   : tglFaseBaik,
                    varietas   : best.varietas,
                    labelVar   : best.labelVar,
                    alasan     : alasan,
                    isLewat    : statusBest.isLewat,    // [FIX #2]
                    isBerjalan : statusBest.isBerjalan  // [FIX #2]
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
        window.rekomendasiWindowTanam      = rekomendasiWindowTanamV2;
        window.tentukanKalenderMusimLokal  = tentukanKalenderMusimLokal;
        window.statusWaktuTanam            = statusWaktuTanam; // expose agar v3.10 bisa pakai versi ini

        console.log(
            '%c✅ patch_deteksi_musim_v1.4.js aktif\n' +
            '   Fix #1: Penalti skorOlah dihapus dari seleksi kandidat\n' +
            '   Fix #2: isLewat/isBerjalan sinkron dengan tglFaseBaik\n' +
            '   Pantai Timur Sulsel: Rendeng April, Gadu Oktober',
            'color:#3b82f6; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
