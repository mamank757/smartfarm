/**
 * ============================================================
 *  patch_deteksi_musim_v2.4.js
 *  Versi: 2.4 — Siklus Pasangan Agronomis & Pemilihan Kontekstual
 * ------------------------------------------------------------
 *  PERBAIKAN v2.4 vs v2.3:
 *
 *  [BUG ARSITEKTUR — hitungTahunMusim INDEPENDEN PER MUSIM]
 *
 *    v2.3 ke bawah menghitung tahun untuk Rendeng dan Gadu secara
 *    TERPISAH, masing-masing mencari tahun "paling dekat ke now".
 *    Akibatnya pada Juni 2026 (zona monsunal barat):
 *      - Gadu:   Olah Mei 2026,  Panen Jun 2026   ✓ (dekat ke now)
 *      - Rendeng: Olah Mei 2026 (!!!)              ✗ (bulan Rendeng
 *        tidak ada di Mei — fungsi pakai tahun 2026 lalu pasang
 *        bulan Nov/Okt 2026 atau bahkan terselip ke Mei 2026 karena
 *        proximity logic salah dimensi)
 *
 *    Fix B v2.3 (geser musim-2 +1 tahun jika overlap) tidak membantu
 *    karena masalahnya bukan overlap di depan — Rendeng seharusnya
 *    sudah SELESAI PANEN di masa lalu (Olah Nov 2025, Panen Mar 2026),
 *    bukan baru mau mulai.
 *
 *  [ROOT CAUSE 1] hitungTahunMusim memilih tahun berdasarkan
 *    kedekatan ke now, bukan berdasarkan posisi dalam siklus agronomis
 *    pasangan Rendeng–Gadu.
 *
 *  [ROOT CAUSE 2] Fix B hanya bisa geser ke depan (+1 tahun), tidak
 *    bisa mengenali bahwa musim ke-1 seharusnya sudah berada di masa
 *    lalu (sudah panen, isLewat = true) dan musim ke-2 baru akan
 *    mulai.
 *
 *  [ROOT CAUSE 3] Kedua musim diperlakukan sebagai entitas independen,
 *    padahal secara agronomis mereka adalah SATU SIKLUS dalam satu
 *    tahun pertanian. Rendeng → Gadu adalah pasangan tak terpisahkan.
 *
 *  [FIX TOTAL — PENDEKATAN SIKLUS PASANGAN]
 *
 *    Ganti seluruh logika hitungTahunMusim + Fix B dengan:
 *
 *    1. `bangkitkanSiklusPasangan(startRendeng, startGadu, hariPanenR,
 *       hariPanenG)` — menghasilkan 3 kandidat siklus (tahun-1, tahun,
 *       tahun+1) sebagai pasangan (Rendeng, Gadu) dengan urutan
 *       agronomis dijamin:
 *         Olah_R → Tanam_R → Panen_R → Olah_G → Tanam_G → Panen_G
 *       Jika Gadu mulainya < Rendeng dalam kalender (misal barat:
 *       Rendeng=Okt, Gadu=Apr → Gadu ada di tahun+1 dari Rendeng),
 *       offset tahun dihitung otomatis per zona.
 *
 *    2. `pilihSiklusRelevant(kandidatSiklus, now)` — memilih siklus
 *       paling relevan berdasarkan posisi now dalam kontinum siklus:
 *         a. Jika now berada SEBELUM Panen_R → tampilkan siklus ini
 *            (Rendeng sedang/akan berjalan).
 *         b. Jika now berada ANTARA Panen_R dan Panen_G → tampilkan
 *            siklus ini (transisi Rendeng-selesai, Gadu sedang/akan).
 *         c. Jika now sudah SETELAH Panen_G → ambil siklus berikutnya.
 *
 *    Hasilnya untuk Juni 2026 (zona barat, Rendeng=Okt, Gadu=Apr):
 *      Siklus "2025/2026":
 *        Rendeng: Olah Okt 2025 → Tanam Nov 2025 → Panen Mar 2026 ✓
 *        Gadu:    Olah Apr 2026 → Tanam Mei 2026 → Panen Agu 2026 ✓
 *      now = Jun 2026 → berada antara Panen_R (Mar) dan Panen_G (Agu)
 *      → pilih siklus 2025/2026, Rendeng=isLewat, Gadu=isBerjalan ✓
 *
 * ------------------------------------------------------------
 *  SEMUA FIX DARI v2.0–v2.3 YANG MASIH VALID TETAP AKTIF:
 *    Fix #1 (Lapisan 1): Skor ZOM dinormalisasi ulang per zona regional
 *    Fix #2 (Lapisan 2): Gerbang syarat air bajak berbasis mm aktual
 *    Fix #3 (Lapisan 3): Jendela kandidat dimulai dari onset hujan efektif
 *    Fix #4 (Lapisan 4): isLewat/isBerjalan sinkron dengan tglFaseBaik
 *    Fix #5 (Lapisan 5): ENSO/IOD disesuaikan ke rawZOM sebelum dipakai
 *    Fix #5b: Zona BOBOT_IKLIM konsisten via polaPuncak
 *    Fix #6 (Lapisan 6): bTanam = bulan OLAH TANAH; tanam pindah +25 hari
 *    Fix C (v2.3): tglOlahTanah & tglPanen selalu ada di objek hasil
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       KONSTANTA THRESHOLD KELAYAKAN AIR PER ZONA
    ========================================================= */
    var THRESHOLD_AIR = {
        barat:               { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 },
        timur:               { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        peralihan_sultra:    { thresholdBajak: 60,  thresholdOnset: 80,  thresholdLayak: 100 },
        ekuatorial_dua_puncak: { thresholdBajak: 70, thresholdOnset: 90, thresholdLayak: 110 },
        fallback:            { thresholdBajak: 80,  thresholdOnset: 100, thresholdLayak: 120 }
    };

    /* =========================================================
       REFERENSI KALENDER MUSIM TANAM LOKAL
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
       FUNGSI DETEKSI MUSIM LOKAL
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
                console.warn('[PatchMusim v2.4] Pola ZOM (' + polaDariZOM + ') berbeda dari referensi regional di [' +
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
    var JEDA_OLAH_KE_TANAM_HARI = 25;

    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
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

    function statusWaktuTanam(tglTanam, now) {
        var isLewat = tglTanam.getTime() < now.getTime();
        var isBerjalan = !isLewat &&
            tglTanam.getMonth() === now.getMonth() &&
            tglTanam.getFullYear() === now.getFullYear();
        return { isLewat: isLewat, isBerjalan: isBerjalan };
    }

    /* =========================================================
       [FIX TOTAL v2.4] SIKLUS PASANGAN AGRONOMIS
       ─────────────────────────────────────────────────────────
       Konsep: Rendeng dan Gadu bukan dua entitas independen.
       Mereka adalah SATU SIKLUS PERTANIAN yang berurutan:
         Olah_R → Tanam_R → Panen_R  →  Olah_G → Tanam_G → Panen_G

       Fungsi bangkitkanSiklusPasangan() membangun 3 kandidat siklus
       (berbasis tahun-1, tahun, tahun+1) dengan urutan agronomis
       yang dijamin benar, lalu pilihSiklusRelevant() memilih satu
       siklus berdasarkan posisi `now` di dalam kontinum siklus itu.

       Cara menentukan offset tahun Gadu relatif terhadap Rendeng:
         - Jika gaduMulai > rendengMulai dalam angka bulan kalender:
           Gadu ada di TAHUN YANG SAMA dengan Rendeng
           (contoh: Rendeng=Maret(2), Gadu=September(8) → sama tahun)
         - Jika gaduMulai <= rendengMulai:
           Gadu ada di TAHUN BERIKUTNYA dari tahun Rendeng
           (contoh: Rendeng=Oktober(9), Gadu=April(3) → Gadu +1 tahun)
         - Kasus khusus timur: Rendeng=April(3), Gadu=Oktober(8) → sama tahun

       Selain offset dasar, kita juga perlu memastikan bahwa
       tglOlahGadu > tglPanenRendeng secara kalender aktual (karena
       hariPanen varietas yang dipilih bisa membuat panen Rendeng
       melebar ke bulan yang overlap dengan Gadu). Jika overlap,
       geser Gadu ke tahun berikutnya — tapi ini sekarang dilakukan
       di LEVEL SIKLUS, bukan setelah fakta.
    ========================================================= */

    /**
     * Hitung offset tahun Gadu relatif terhadap tahun Rendeng.
     * Mengembalikan 0 (tahun sama) atau 1 (Gadu di tahun berikutnya).
     */
    function hitungOffsetTahunGadu(bRendeng, bGadu) {
        /* Secara agronomis: Gadu SELALU setelah Rendeng dalam siklus.
           Jika nomor bulan Gadu > Rendeng → tahun kalender sama.
           Jika nomor bulan Gadu <= Rendeng → Gadu menyeberang ke tahun berikutnya. */
        return (bGadu > bRendeng) ? 0 : 1;
    }

    /**
     * Bangkitkan 3 kandidat siklus pasangan (Rendeng, Gadu).
     * Setiap siklus dijamin urutan agronomisnya: Panen_R < Olah_G.
     *
     * @param {number} bRendeng  - bulan olah tanah Rendeng (0-based)
     * @param {number} bGadu     - bulan olah tanah Gadu (0-based)
     * @param {number} hariPanenR - hari total dari olah tanah ke panen Rendeng
     * @param {number} hariPanenG - hari total dari olah tanah ke panen Gadu
     * @param {Date}   now
     * @returns {Array} array 3 objek siklus { tahunRendeng, rendeng:{tglOlah,tglPanen}, gadu:{tglOlah,tglPanen} }
     */
    function bangkitkanSiklusPasangan(bRendeng, bGadu, hariPanenR, hariPanenG, now) {
        var baseYear     = now.getFullYear();
        var offsetGadu   = hitungOffsetTahunGadu(bRendeng, bGadu);
        var siklus       = [];

        for (var dy = -1; dy <= 1; dy++) {
            var thRendeng = baseYear + dy;
            var thGadu    = thRendeng + offsetGadu;

            var tglOlahR  = new Date(thRendeng, bRendeng, 15);
            var tglPanenR = tambahHari(tglOlahR, hariPanenR);

            var tglOlahG  = new Date(thGadu, bGadu, 15);
            var tglPanenG = tambahHari(tglOlahG, hariPanenG);

            /* Jaminan urutan agronomis:
               Jika meski sudah ada offsetGadu, panen Rendeng masih
               overlap dengan olah Gadu (karena varietas umur panjang
               atau bulan berdekatan), geser Gadu +1 tahun lagi. */
            if (tglOlahG.getTime() <= tglPanenR.getTime()) {
                thGadu    += 1;
                tglOlahG   = new Date(thGadu, bGadu, 15);
                tglPanenG  = tambahHari(tglOlahG, hariPanenG);
                console.log('[PatchMusim v2.4] Auto-adjust: Gadu digeser ke tahun ' + thGadu +
                    ' karena tglOlahG (' + tglOlahG.toLocaleDateString('id-ID') +
                    ') masih sebelum tglPanenR (' + tglPanenR.toLocaleDateString('id-ID') + ')');
            }

            siklus.push({
                tahunRendeng : thRendeng,
                tahunGadu    : thGadu,
                rendeng : { tglOlah: tglOlahR, tglPanen: tglPanenR },
                gadu    : { tglOlah: tglOlahG, tglPanen: tglPanenG }
            });
        }

        return siklus;
    }

    /**
     * Pilih siklus yang paling relevan berdasarkan posisi `now`.
     *
     * Logika pemilihan:
     *   - Siklus "aktif" = siklus di mana now berada SEBELUM tglPanenG.
     *     Artinya panen Gadu belum selesai → siklus ini masih berjalan
     *     atau akan segera datang.
     *   - Dari siklus-siklus aktif, pilih yang tglOlahR paling dekat
     *     ke now (bisa di masa lalu jika Rendeng sedang berjalan/sudah
     *     panen tapi Gadu belum mulai, atau di masa depan jika kita
     *     sudah melewati panen Gadu siklus ini).
     *   - Jika semua siklus sudah lewat panen Gadu → ambil siklus
     *     terakhir (tahun+1, masa depan terdekat).
     *
     * @param {Array} kandidatSiklus - output bangkitkanSiklusPasangan
     * @param {Date}  now
     * @returns {Object} siklus terpilih
     */
    function pilihSiklusRelevant(kandidatSiklus, now) {
        var nowMs = now.getTime();

        /* Siklus yang panenGadu-nya belum selesai = masih relevan */
        var aktif = kandidatSiklus.filter(function(s) {
            return s.gadu.tglPanen.getTime() > nowMs;
        });

        if (aktif.length === 0) {
            /* Semua sudah selesai panen Gadu → ambil siklus terjauh ke depan */
            console.log('[PatchMusim v2.4] Semua siklus sudah lewat panen Gadu → ambil siklus +1 tahun');
            return kandidatSiklus[kandidatSiklus.length - 1];
        }

        /* Dari yang aktif, pilih siklus dengan tglOlahR paling dekat ke now.
           "Paling dekat" = |tglOlahR - now| minimum, dengan preferensi
           ke siklus yang sudah mulai (tglOlahR <= now) atas siklus masa depan. */
        aktif.sort(function(a, b) {
            var distA = a.rendeng.tglOlah.getTime() - nowMs;
            var distB = b.rendeng.tglOlah.getTime() - nowMs;
            /* Jika A sudah dimulai (negatif) dan B belum (positif), A menang */
            if (distA <= 0 && distB > 0) return -1;
            if (distB <= 0 && distA > 0) return 1;
            /* Keduanya sama-sama masa lalu atau masa depan → yang paling dekat */
            return Math.abs(distA) - Math.abs(distB);
        });

        var terpilih = aktif[0];

        console.log(
            '[PatchMusim v2.4] Siklus terpilih: Rendeng ' + terpilih.tahunRendeng +
            ' / Gadu ' + terpilih.tahunGadu + '\n' +
            '  Olah Rendeng : ' + terpilih.rendeng.tglOlah.toLocaleDateString('id-ID') +
            ' → Panen: '        + terpilih.rendeng.tglPanen.toLocaleDateString('id-ID') + '\n' +
            '  Olah Gadu    : ' + terpilih.gadu.tglOlah.toLocaleDateString('id-ID') +
            ' → Panen: '        + terpilih.gadu.tglPanen.toLocaleDateString('id-ID')
        );

        return terpilih;
    }

    /* =========================================================
       [FIX LAPISAN 1] NORMALISASI SKOR BERBASIS THRESHOLD REGIONAL
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
    ========================================================= */
    function cariOnsetHujan(startMusim, rawZOM, polaPuncak) {
        var th = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var tOn = th.thresholdOnset;

        for (var offset = 0; offset < 6; offset++) {
            var bIni  = (startMusim + offset) % 12;
            var bBrk  = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= tOn && rawZOM[bBrk] >= th.thresholdBajak) {
                if (offset > 0) {
                    console.log('[PatchMusim v2.4] Onset hujan efektif: ' +
                        NAMA_BULAN[bIni] + ' (geser ' + offset + ' bulan dari ' +
                        NAMA_BULAN[startMusim] + ', ZOM=' + rawZOM[bIni].toFixed(0) + 'mm)');
                }
                return bIni;
            }
        }
        console.warn('[PatchMusim v2.4] Onset tidak terdeteksi — pakai startMusim: ' + NAMA_BULAN[startMusim]);
        return startMusim;
    }

    /* =========================================================
       [FIX LAPISAN 5] FAKTOR PENYESUAIAN ENSO/IOD
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

    function terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal) {
        return rawZOM.map(function (mm, idx) {
            return mm * faktorPenyesuaianENSOIOD(idx, zonaIklim, ensoVal, iodVal);
        });
    }

    /* =========================================================
       FUNGSI UTAMA REKOMENDASI
    ========================================================= */
    function rekomendasiWindowTanamV4(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        ensoVal = ensoVal || 0;
        iodVal  = iodVal  || 0;

        var now = new Date();
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
                '%c[PatchMusim v2.4] Zona: ' + polaPuncak +
                ' | Sumber: ' + kalenderLokal.sumber +
                '\n Rendeng mulai : ' + NAMA_BULAN[startRendeng] +
                ' | Gadu mulai : ' + NAMA_BULAN[startGadu] +
                '\n Koordinat : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#3b82f6; font-weight:bold;'
            );
        } else {
            polaPuncak = 'ekuatorial_dua_puncak';
            console.log('[PatchMusim v2.4] Pola ekuatorial — deteksi lembah ZOM aktif');
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

        var rawZOMSesuai = terapkanPenyesuaianENSOIOD(rawZOM, zonaIklim, ensoVal, iodVal);

        var skorZOM = rawZOMSesuai.map(function(mm) {
            return skorZOMRegional(mm, polaPuncak);
        });

        console.log('[PatchMusim v2.4] Zona iklim ENSO/IOD: ' + zonaIklim +
            ' | ENSO=' + ensoVal + ' | IOD=' + iodVal);

        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak);

        var rendengBulan = [onsetRendeng, (onsetRendeng+1)%12, (onsetRendeng+2)%12, (onsetRendeng+3)%12];
        var gaduBulan    = [onsetGadu,    (onsetGadu+1)%12,    (onsetGadu+2)%12,    (onsetGadu+3)%12];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        /* ============================================================
           [LANGKAH 1] Evaluasi kandidat terbaik per musim secara
           independen HANYA untuk memilih bulan olah tanah dan varietas.
           Tahun belum ditetapkan di sini — itu tugas siklus pasangan.
        ============================================================ */
        function evaluasiKandidatMusim(bulanTanamArr) {
            var kandidat = [];

            bulanTanamArr.forEach(function (bTanam) {
                var mmTanam       = rawZOM[bTanam];
                var mmBajak       = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai = rawZOMSesuai[bTanam];
                var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];

                var mmUntukBajak = Math.max(mmBajakSesuai, mmTanamSesuai);
                if (mmUntukBajak < th.thresholdBajak) {
                    console.log('[PatchMusim v2.4] Bulan ' + NAMA_BULAN[bTanam] +
                        ' dilewati (bajak: ' + mmUntukBajak.toFixed(0) + 'mm < ' + th.thresholdBajak + 'mm)');
                    return;
                }

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    /* Gunakan tanggal dummy (tahun 2000) hanya untuk
                       evaluasi skor relatif — tahun aktual ditetapkan
                       oleh pilihSiklusRelevant nanti */
                    var tglOlahDummy   = new Date(2000, bTanam, 15);
                    var tglTanamDummy  = tambahHari(tglOlahDummy, JEDA_OLAH_KE_TANAM_HARI);
                    var bTanamAktual   = tglTanamDummy.getMonth();

                    var hariGen    = Math.floor(v.panen * v.persenGen);
                    var bGenIdx    = tambahHari(tglTanamDummy, hariGen).getMonth();
                    var bPanenIdx  = tambahHari(tglTanamDummy, v.panen).getMonth();
                    var bVeg1      = tambahHari(tglTanamDummy, 30).getMonth();

                    var nilaiTanam = skorTanam;
                    var nilaiVeg1  = skorZOM[bVeg1];
                    var nilaiGen   = 100 - Math.abs(skorZOM[bGenIdx] - 55);
                    var nilaiPanen = 100 - (skorZOM[bPanenIdx] * 0.5);

                    var nilaiTotal = (nilaiTanam * 0.45) +
                                     (nilaiVeg1  * 0.20) +
                                     (nilaiGen   * 0.20) +
                                     (nilaiPanen * 0.15);

                    if (mmTanamSesuai < th.thresholdOnset) {
                        nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    }
                    if (nilaiVeg1 < 25) {
                        nilaiTotal -= (25 - nilaiVeg1) * 1.0;
                    }

                    kandidat.push({
                        bTanam        : bTanam,
                        bTanamAktual  : bTanamAktual,
                        varietas      : v.kode,
                        labelVar      : v.label,
                        panen         : v.panen,  /* hari dari olah ke panen */
                        nilaiTotal    : nilaiTotal,
                        skorTanam     : skorTanam,
                        mmTanam       : mmTanam,
                        mmTanamSesuai : mmTanamSesuai,
                        mmBajak       : mmBajak,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        skorGen       : skorZOM[bGenIdx],
                        skorPanen     : skorZOM[bPanenIdx]
                    });
                });
            });

            return kandidat;
        }

        var kandidatRendeng = evaluasiKandidatMusim(rendengBulan);
        var kandidatGadu    = evaluasiKandidatMusim(gaduBulan);

        /* ============================================================
           [LANGKAH 2] Pilih kandidat terbaik per musim (bulan + varietas).
           Jika tidak ada kandidat (semua di bawah threshold), gunakan
           fallback bulan terbaik ZOM.
        ============================================================ */
        function pilihanTerbaik(kandidat, bulanTanamArr) {
            if (kandidat.length > 0) {
                kandidat.sort(function(a, b) { return b.nilaiTotal - a.nilaiTotal; });
                return { isFallback: false, data: kandidat[0] };
            }
            /* Fallback: bulan dengan ZOM tertinggi di jendela musim */
            var bFallback = bulanTanamArr[0], mmMax = -1;
            bulanTanamArr.forEach(function(b) {
                if (rawZOMSesuai[b] > mmMax) { mmMax = rawZOMSesuai[b]; bFallback = b; }
            });
            var tglDummy  = new Date(2000, bFallback, 15);
            var tglTanamD = tambahHari(tglDummy, JEDA_OLAH_KE_TANAM_HARI);
            return {
                isFallback: true,
                data: {
                    bTanam       : bFallback,
                    bTanamAktual : tglTanamD.getMonth(),
                    varietas     : 'sedang',
                    labelVar     : 'Sedang (95–115 HST)',
                    panen        : 110,
                    mmTanam      : rawZOM[bFallback],
                    mmTanamSesuai: mmMax,
                    skorTanam    : skorZOM[bFallback],
                    skorGen      : 0, skorPanen: 0
                }
            };
        }

        var pilihanR = pilihanTerbaik(kandidatRendeng, rendengBulan);
        var pilihanG = pilihanTerbaik(kandidatGadu,    gaduBulan);

        var bestR = pilihanR.data;
        var bestG = pilihanG.data;

        /* ============================================================
           [LANGKAH 3] SIKLUS PASANGAN — Tetapkan tahun aktual.
           Sekarang kita punya bulan olah terbaik untuk masing-masing
           musim (bestR.bTanam dan bestG.bTanam). Bangkitkan siklus
           pasangan dan pilih yang paling relevan dengan now.
        ============================================================ */
        var hariPanenR = JEDA_OLAH_KE_TANAM_HARI + bestR.panen;
        var hariPanenG = JEDA_OLAH_KE_TANAM_HARI + bestG.panen;

        var kandidatSiklus = bangkitkanSiklusPasangan(
            bestR.bTanam, bestG.bTanam,
            hariPanenR, hariPanenG,
            now
        );
        var siklusTerpilih = pilihSiklusRelevant(kandidatSiklus, now);

        /* ============================================================
           [LANGKAH 4] Bangun objek hasil dari siklus terpilih.
        ============================================================ */
        function bangunHasilMusim(best, infoSiklus, musimNama, musimKode, isFallback) {
            var tglOlahTanah   = infoSiklus.tglOlah;
            var tglTanamAktual = tambahHari(tglOlahTanah, JEDA_OLAH_KE_TANAM_HARI);
            var bTanamAktual   = tglTanamAktual.getMonth();
            var tglPanen       = infoSiklus.tglPanen;
            var tahunOlah      = tglOlahTanah.getFullYear();
            var tahunTanam     = tglTanamAktual.getFullYear();
            var tahunPanen     = tglPanen.getFullYear();

            var tglFaseBaik    = cariTglFaseBulan(tglTanamAktual, 3, 8, 0, bTanamAktual);
            var statusMusim    = statusWaktuTanam(tglFaseBaik, now);

            var alasan;
            if (isFallback) {
                alasan = 'Seluruh jendela olah tanah di bawah threshold air untuk bajak (' +
                    th.thresholdBajak + 'mm) setelah penyesuaian ENSO/IOD. ' +
                    'Dipilih bulan dengan curah hujan tertinggi (' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah +
                    ', ' + best.mmTanam.toFixed(0) + 'mm klimatologi → ' +
                    best.mmTanamSesuai.toFixed(0) + 'mm setelah penyesuaian). ' +
                    'Tanam pindah diperkirakan ~' + JEDA_OLAH_KE_TANAM_HARI + ' hari kemudian ' +
                    '(≈' + NAMA_BULAN[bTanamAktual] + ' ' + tahunTanam + ', setelah pembibitan). ' +
                    'Pompanisasi penuh wajib disiapkan sebelum pengolahan lahan.';
            } else {
                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' :
                                      best.skorGen > 75 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' :
                                      best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                var catatanOlah = best.mmTanamSesuai < th.thresholdBajak
                    ? 'Perhatian: curah hujan olah tanah di ' + NAMA_BULAN[best.bTanam] +
                      ' tipis (' + best.mmTanam.toFixed(0) + 'mm klimatologi → ' +
                      best.mmTanamSesuai.toFixed(0) + 'mm setelah penyesuaian) — ' +
                      'siapkan pompanisasi pendukung untuk bajak.'
                    : '';

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

                alasan =
                    'Olah tanah (bajak) di ' + NAMA_BULAN[best.bTanam] + ' ' + tahunOlah +
                    ': ' + best.mmTanam.toFixed(0) + 'mm' +
                    ' (skor ' + best.skorTanam + '/100). Pembibitan ~1 minggu setelahnya; ' +
                    'tanam pindah ~' + JEDA_OLAH_KE_TANAM_HARI + ' hari setelah olah tanah ' +
                    '(≈' + NAMA_BULAN[bTanamAktual] + ' ' + tahunTanam +
                    ', setelah bibit berumur 15–20 hari). ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). ' +
                    'Panen di ' + best.namaBulanPanen + ' ' + tahunPanen +
                    ' (' + keteranganPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '') +
                    catatanENSOIOD;
            }

            return {
                musimNama   : musimNama,
                musimKode   : musimKode,
                tglOlahTanah: tglOlahTanah,
                tglTanam    : tglFaseBaik,
                tglPanen    : tglPanen,
                varietas    : best.varietas,
                labelVar    : best.labelVar,
                alasan      : alasan,
                isLewat     : statusMusim.isLewat,
                isBerjalan  : statusMusim.isBerjalan
            };
        }

        var hasilDuaMusim = [
            bangunHasilMusim(bestR, siklusTerpilih.rendeng, namaRendeng, 'rendeng', pilihanR.isFallback),
            bangunHasilMusim(bestG, siklusTerpilih.gadu,    namaGadu,    'gadu',    pilihanG.isFallback)
        ];

        /* Urutkan hasil akhir berdasarkan tglOlahTanah */
        hasilDuaMusim.sort(function (a, b) {
            return a.tglOlahTanah.getTime() - b.tglOlahTanah.getTime();
        });

        /* Verifikasi akhir — seharusnya tidak pernah terjadi dengan logika baru,
           tapi sebagai safety net: log warning jika masih overlap */
        if (hasilDuaMusim.length === 2) {
            var m1 = hasilDuaMusim[0], m2 = hasilDuaMusim[1];
            if (m2.tglOlahTanah.getTime() < m1.tglPanen.getTime()) {
                console.error(
                    '[PatchMusim v2.4] ❌ SAFETY NET: Overlap masih terdeteksi setelah siklus pasangan!\n' +
                    '  Ini seharusnya tidak terjadi. Mohon laporkan bug ini.\n' +
                    '  Olah ' + m2.musimNama + ': ' + m2.tglOlahTanah.toLocaleDateString('id-ID') +
                    '\n  Panen ' + m1.musimNama + ': ' + m1.tglPanen.toLocaleDateString('id-ID')
                );
            } else {
                console.log(
                    '%c[PatchMusim v2.4] ✅ Validasi urutan agronomis: OK\n' +
                    '  Panen ' + m1.musimKode + ': ' + m1.tglPanen.toLocaleDateString('id-ID') +
                    ' → Olah ' + m2.musimKode + ': ' + m2.tglOlahTanah.toLocaleDateString('id-ID'),
                    'color:#10b981;'
                );
            }
        }

        return hasilDuaMusim;
    }

    /* =========================================================
       INJEKSI OVERRIDE
    ========================================================= */
    function injeksiOverride() {
        if (typeof window.rekomendasiWindowTanam === 'function') {
            window._rekomendasiWindowTanamLama = window.rekomendasiWindowTanam;
        }
        window.rekomendasiWindowTanam      = rekomendasiWindowTanamV4;
        window.tentukanKalenderMusimLokal  = tentukanKalenderMusimLokal;
        window.statusWaktuTanam            = statusWaktuTanam;
        window._thresholdAirMusim          = THRESHOLD_AIR;
        window._faktorPenyesuaianENSOIOD   = faktorPenyesuaianENSOIOD;
        /* Expose untuk debugging */
        window._bangkitkanSiklusPasangan   = bangkitkanSiklusPasangan;
        window._pilihSiklusRelevant        = pilihSiklusRelevant;
        window._hitungOffsetTahunGadu      = hitungOffsetTahunGadu;

        console.log(
            '%c✅ patch_deteksi_musim_v2.4.js aktif\n' +
            '\n' +
            '   ╔══ FIX ARSITEKTUR v2.4 (GANTI TOTAL hitungTahunMusim + Fix B) ══╗\n' +
            '   ║  SIKLUS PASANGAN AGRONOMIS                                      ║\n' +
            '   ║  Rendeng & Gadu kini dihitung sebagai SATU siklus pertanian:    ║\n' +
            '   ║                                                                  ║\n' +
            '   ║    Olah_R → Tanam_R → Panen_R → Olah_G → Tanam_G → Panen_G   ║\n' +
            '   ║                                                                  ║\n' +
            '   ║  3 kandidat siklus (tahun-1, tahun, tahun+1) dibangkitkan,     ║\n' +
            '   ║  lalu satu siklus dipilih berdasarkan posisi now:               ║\n' +
            '   ║    • now sebelum Panen_R → Rendeng sedang/akan berjalan        ║\n' +
            '   ║    • now antara Panen_R dan Panen_G → Rendeng lewat, Gadu next ║\n' +
            '   ║    • now setelah Panen_G → ambil siklus tahun berikutnya       ║\n' +
            '   ║                                                                  ║\n' +
            '   ║  Offset tahun Gadu dihitung otomatis per zona:                  ║\n' +
            '   ║    barat (Rendeng=Okt, Gadu=Apr) → Gadu +1 tahun dari Rendeng  ║\n' +
            '   ║    timur (Rendeng=Mar, Gadu=Sep)  → Gadu tahun yang sama       ║\n' +
            '   ║  + auto-adjust jika varietas umur panjang menyebabkan overlap  ║\n' +
            '   ╚══════════════════════════════════════════════════════════════════╝\n' +
            '\n' +
            '   ── Semua fix v2.0–v2.3 yang relevan tetap aktif ──\n' +
            '   Fix #1 (Lapisan 1): Skor ZOM dinormalisasi ulang per zona regional\n' +
            '   Fix #2 (Lapisan 2): Gerbang syarat air bajak berbasis mm aktual\n' +
            '   Fix #3 (Lapisan 3): Jendela kandidat dimulai dari onset hujan efektif\n' +
            '   Fix #4 (Lapisan 4): isLewat/isBerjalan sinkron dengan tglFaseBaik\n' +
            '   Fix #5 (Lapisan 5): ENSO/IOD disesuaikan ke rawZOM sebelum dipakai\n' +
            '   Fix #5b: Zona BOBOT_IKLIM konsisten via polaPuncak\n' +
            '   Fix #6 (Lapisan 6): bTanam = bulan OLAH TANAH; tanam pindah +25 hari\n' +
            '   Fix C (v2.3): tglOlahTanah & tglPanen selalu ada di objek hasil',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
