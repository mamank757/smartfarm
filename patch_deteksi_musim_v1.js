/**
 * ============================================================
 *  patch_deteksi_musim_v2.3.js
 *  Versi: 2.3 — Fix Urutan Musim Lintas Tahun & Anti-Overlap
 * ------------------------------------------------------------
 *  PERBAIKAN v2.3 vs v2.2:
 *
 *  [BUG KRITIS A — TAHUN DIHITUNG PER-BULAN, BUKAN PER-MUSIM]
 *    v2.2 ke bawah memanggil hitungTahunMusim() untuk setiap bulan
 *    kandidat SECARA INDEPENDEN. Akibatnya, dalam satu jendela musim
 *    yang sama (misal Rendeng Apr–Jul zona timur), setiap bulan bisa
 *    mendapat tahun yang berbeda — bahkan berbeda dengan onset musim
 *    itu sendiri.
 *
 *    Contoh nyata yang dilaporkan (Juni 2026, zona timur):
 *      Musim Rendeng zona timur = Apr–Jul. Sekarang Juni 2026.
 *      - April 2026 sudah 61 hari lewat → algoritma per-bulan
 *        memilih April 2027 (tahun depan)
 *      - Juni 2026 dipilih dengan benar (hari ini)
 *      - Maret 2026 sebelum onset → April 2027 lagi
 *      Hasil: kandidat dalam satu musim tersebar di dua tahun berbeda,
 *      kemudian setelah sort nilaiTotal, bulan terbaik bisa dari tahun
 *      yang tidak konsisten dengan musim yang sedang berjalan.
 *
 *    Untuk zona barat (Juni 2026):
 *      - Gadu onset April: beberapa bulan kandidat dapat tahun 2027
 *        padahal Gadu April–Juli 2026 SUDAH BERJALAN atau baru selesai.
 *
 *    [FIX A] Hitung tahun satu kali per MUSIM, bukan per bulan.
 *    Fungsi hitungTahunOnsetMusim(bOnset, jendela, now, hariPanen)
 *    menggunakan BULAN TERAKHIR jendela sebagai acuan keaktifan:
 *      - Jika panen bulan terakhir jendela belum lewat toleransi 45 hari
 *        → musim tahun ini (atau tahun lalu) masih relevan → pakai tahun itu.
 *      - Cek dari (now.year - 1) ke atas; ambil tahun terkecil yang masih aktif.
 *    Semua bulan dalam jendela kemudian mendapat tanggal dari tahun onset
 *    yang sama, dengan wrap Des→Jan ditangani oleh tglOlahDalamMusim().
 *
 *  [BUG KRITIS B — TIDAK ADA VALIDASI URUTAN RENDENG → GADU]
 *    v2.2 ke bawah tidak menjamin tglOlahTanah musim ke-2 terjadi
 *    SETELAH tglPanen musim ke-1. Bisa overlap atau terbalik.
 *
 *    [FIX B] Setelah kedua musim dihitung, bandingkan tglOlahTanah
 *    musim ke-2 dengan tglPanen musim ke-1. Jika overlap, geser musim
 *    ke-2 +1 tahun. field tglOlahTanah & tglPanen selalu ada di hasil.
 *
 *  [FIX C — tglOlahTanah & tglPanen SELALU ADA DI OBJEK HASIL]
 *    Diperlukan oleh Fix B dan untuk tampilan UI yang akurat.
 * ------------------------------------------------------------
 *  SEMUA FIX DARI v2.0–v2.2 TETAP AKTIF:
 *    Fix #1 (Lapisan 1): Skor ZOM dinormalisasi ulang per zona regional
 *    Fix #2 (Lapisan 2): Gerbang syarat air bajak berbasis mm aktual
 *    Fix #3 (Lapisan 3): Jendela kandidat dimulai dari onset hujan efektif
 *    Fix #4 (Lapisan 4): isLewat/isBerjalan sinkron dengan tglFaseBaik
 *    Fix #5 (Lapisan 5): ENSO/IOD disesuaikan ke rawZOM sebelum dipakai
 *    Fix #5b: Zona BOBOT_IKLIM konsisten via polaPuncak
 *    Fix #6 (Lapisan 6): bTanam = bulan OLAH TANAH; tanam pindah +25 hari
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
                console.warn('[PatchMusim v2.3] Pola ZOM (' + polaDariZOM +
                    ') berbeda dari referensi regional di [' +
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
       [FIX A — v2.3] HITUNG TAHUN ONSET PER MUSIM (BUKAN PER BULAN)
       ─────────────────────────────────────────────────────────────
       Masalah v2.2: hitungTahunMusim() dipanggil per bulan kandidat
       secara independen. Dalam satu jendela musim yang sama, bulan
       yang sudah lewat bisa mendapat tahun berbeda dari bulan yang
       belum lewat → kandidat satu musim tersebar di dua tahun.

       Solusi: tentukan tahun SATU KALI untuk seluruh jendela musim,
       berdasarkan apakah musim (sebagai unit) masih aktif.

       Acuan keaktifan: BULAN TERAKHIR jendela.
         Jika panen di bulan terakhir jendela belum lewat toleransi
         → musim tahun ini masih aktif (meski onset sudah lewat,
           masih ada bulan olah tanah yang bisa dipilih di jendela).

       Contoh (zona timur, Jun 2026):
         Rendeng [Apr,Mei,Jun,Jul]: bulan terakhir = Jul.
         Panen Jul 2026 = Nov 2026 → belum lewat → tahun 2026 ✓
         Gadu [Okt,Nov,Des,Jan]: bulan terakhir = Jan.
         Panen Jan 2026 = Mei 2026 → sudah lewat (>45hr) → coba 2026.
         Panen Jan 2027 = Mei 2027 → belum lewat → tahun 2026 ✓
         (Gadu Okt 2026 adalah musim yang tepat — sudah ada hujan
          setelah panen Rendeng, petani bisa olah tanah Oktober 2026)

       Parameter:
         bOnset       : bulan pertama jendela (0–11)
         jendela      : array 4 bulan [bOnset, ..., bAkhir]
         now          : Date saat ini
         hariPanenDariOlah : JEDA_OLAH_KE_TANAM_HARI + v.panen
       Mengembalikan: integer tahun untuk bOnset
    ========================================================= */
    function hitungTahunOnsetMusim(bOnset, jendela, now, hariPanenDariOlah) {
        var TOLERANSI_LEWAT_HARI = 45;
        var nowMs    = now.getTime();
        var baseYear = now.getFullYear();
        var batasLewat = nowMs - TOLERANSI_LEWAT_HARI * 86400000;

        /* Gunakan bulan TERAKHIR jendela sebagai acuan keaktifan musim */
        var bAkhir = jendela[jendela.length - 1];

        for (var dy = -1; dy <= 2; dy++) {
            var thOnset = baseYear + dy;
            /* bAkhir mungkin lebih kecil dari bOnset (wrap Des→Jan).
               Dalam kasus itu, bAkhir ada di tahun onset + 1. */
            var thAkhir    = (bAkhir < bOnset) ? thOnset + 1 : thOnset;
            var tglOlahAkhir  = new Date(thAkhir, bAkhir, 15);
            var tglPanenAkhir = tambahHari(tglOlahAkhir, hariPanenDariOlah);

            if (tglPanenAkhir.getTime() > batasLewat) {
                return thOnset; /* tahun onset — musim ini masih aktif */
            }
        }
        return baseYear + 1; /* fallback ekstrem: semua lewat, pakai tahun depan */
    }

    /*
     * Hitung tanggal olah tanah untuk bulan bTanam dalam musim yang
     * onsetnya di tahun tahunOnset. Jika bTanam < bOnset, berarti
     * bulan itu ada di tahun onset + 1 (wrap melewati Desember).
     */
    function tglOlahDalamMusim(bOnset, bTanam, tahunOnset) {
        var tahun = (bTanam >= bOnset) ? tahunOnset : tahunOnset + 1;
        return new Date(tahun, bTanam, 15);
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
        var th  = THRESHOLD_AIR[polaPuncak] || THRESHOLD_AIR.fallback;
        var tOn = th.thresholdOnset;

        for (var offset = 0; offset < 6; offset++) {
            var bIni = (startMusim + offset) % 12;
            var bBrk = (startMusim + offset + 1) % 12;
            if (rawZOM[bIni] >= tOn && rawZOM[bBrk] >= th.thresholdBajak) {
                if (offset > 0) {
                    console.log('[PatchMusim v2.3] Onset hujan efektif: ' +
                        NAMA_BULAN[bIni] + ' (geser ' + offset + ' bulan dari ' +
                        NAMA_BULAN[startMusim] + ', ZOM=' + rawZOM[bIni].toFixed(0) + 'mm)');
                }
                return bIni;
            }
        }
        console.warn('[PatchMusim v2.3] Onset tidak terdeteksi — pakai startMusim: ' +
            NAMA_BULAN[startMusim]);
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
    function rekomendasiWindowTanamV3(skorBulan, rawZOM, zona, ensoVal, iodVal) {
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
                '%c[PatchMusim v2.3] Zona: ' + polaPuncak +
                ' | Sumber: ' + kalenderLokal.sumber +
                '\n Rendeng mulai : ' + NAMA_BULAN[startRendeng] +
                ' | Gadu mulai : ' + NAMA_BULAN[startGadu] +
                '\n Koordinat : [' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ']',
                'color:#3b82f6; font-weight:bold;'
            );
        } else {
            polaPuncak = 'ekuatorial_dua_puncak';
            console.log('[PatchMusim v2.3] Pola ekuatorial — deteksi lembah ZOM aktif');
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

        console.log('[PatchMusim v2.3] Zona iklim ENSO/IOD: ' + zonaIklim +
            ' | ENSO=' + ensoVal + ' | IOD=' + iodVal);

        var onsetRendeng = cariOnsetHujan(startRendeng, rawZOMSesuai, polaPuncak);
        var onsetGadu    = cariOnsetHujan(startGadu,    rawZOMSesuai, polaPuncak);

        var rendengBulan = [onsetRendeng,
                            (onsetRendeng+1)%12,
                            (onsetRendeng+2)%12,
                            (onsetRendeng+3)%12];
        var gaduBulan    = [onsetGadu,
                            (onsetGadu+1)%12,
                            (onsetGadu+2)%12,
                            (onsetGadu+3)%12];

        var MUSIM = [
            { nama: namaRendeng, kode: 'rendeng',
              bulanTanam: rendengBulan, bOnset: onsetRendeng },
            { nama: namaGadu,    kode: 'gadu',
              bulanTanam: gaduBulan,    bOnset: onsetGadu    }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90,  persenGen: 0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110, persenGen: 0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125, persenGen: 0.55 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            /* [FIX A] Hitung tahun onset SATU KALI untuk seluruh jendela musim ini.
               Gunakan varietas sedang (110 hari) sebagai referensi — cukup untuk
               menentukan apakah jendela musim masih aktif. Varietas lain dalam
               jendela yang sama ikut tahun onset ini. */
            var hariRefOnset  = JEDA_OLAH_KE_TANAM_HARI + 110;
            var tahunOnsetMusim = hitungTahunOnsetMusim(
                musim.bOnset, musim.bulanTanam, now, hariRefOnset
            );

            console.log('[PatchMusim v2.3] ' + musim.kode + ': onset ' +
                NAMA_BULAN[musim.bOnset] + ' → tahun onset = ' + tahunOnsetMusim);

            musim.bulanTanam.forEach(function (bTanam) {
                var mmTanam       = rawZOM[bTanam];
                var mmBajak       = rawZOM[(bTanam - 1 + 12) % 12];
                var mmTanamSesuai = rawZOMSesuai[bTanam];
                var mmBajakSesuai = rawZOMSesuai[(bTanam - 1 + 12) % 12];

                var mmUntukBajak = Math.max(mmBajakSesuai, mmTanamSesuai);
                if (mmUntukBajak < th.thresholdBajak) {
                    console.log('[PatchMusim v2.3] ' + NAMA_BULAN[bTanam] +
                        ' dilewati (bajak: ' + mmUntukBajak.toFixed(0) +
                        'mm < threshold ' + th.thresholdBajak + 'mm)');
                    return;
                }

                var skorTanam = skorZOM[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariTotal = JEDA_OLAH_KE_TANAM_HARI + v.panen;

                    /* [FIX A] Pakai tahun onset musim — konsisten untuk semua bulan
                       dalam jendela yang sama. tglOlahDalamMusim() menangani wrap
                       Desember→Januari (bTanam < bOnset → tahun+1). */
                    var tglOlahTanah   = tglOlahDalamMusim(musim.bOnset, bTanam, tahunOnsetMusim);
                    var tglTanamAktual = tambahHari(tglOlahTanah, JEDA_OLAH_KE_TANAM_HARI);
                    var bTanamAktual   = tglTanamAktual.getMonth();
                    var tglPanen       = tambahHari(tglOlahTanah, hariTotal); /* [FIX C] */

                    var hariGen    = Math.floor(v.panen * v.persenGen);
                    var bGenIdx    = tambahHari(tglTanamAktual, hariGen).getMonth();
                    var bPanenIdx  = tglPanen.getMonth();
                    var bVeg1      = tambahHari(tglTanamAktual, 30).getMonth();

                    var skorGen    = skorZOM[bGenIdx];
                    var skorPanen  = skorZOM[bPanenIdx];
                    var skorVeg1   = skorZOM[bVeg1];

                    var nilaiTanam = skorTanam;
                    var nilaiVeg1  = skorVeg1;
                    var nilaiGen   = 100 - Math.abs(skorGen - 55);
                    var nilaiPanen = 100 - (skorPanen * 0.5);

                    var nilaiTotal = (nilaiTanam * 0.45) +
                                     (nilaiVeg1  * 0.20) +
                                     (nilaiGen   * 0.20) +
                                     (nilaiPanen * 0.15);

                    if (mmTanamSesuai < th.thresholdOnset) {
                        nilaiTotal -= (th.thresholdOnset - mmTanamSesuai) * 0.3;
                    }
                    if (skorVeg1 < 25) {
                        nilaiTotal -= (25 - skorVeg1) * 1.0;
                    }

                    kandidatMusim.push({
                        musimNama     : musim.nama,
                        musimKode     : musim.kode,
                        bTanam        : bTanam,
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
                        namaBulanPanen: NAMA_BULAN[bPanenIdx],
                        tglOlahTanah  : tglOlahTanah,      /* [FIX C] */
                        tglTanamAktual: tglTanamAktual,
                        tglPanen      : tglPanen,           /* [FIX C] */
                        bTanamAktual  : bTanamAktual
                    });
                });
            });

            /* ── FALLBACK jika semua bulan di bawah threshold bajak ── */
            if (kandidatMusim.length === 0) {
                var bFallback = musim.bulanTanam[0];
                var mmMax     = -1;
                musim.bulanTanam.forEach(function(b) {
                    if (rawZOMSesuai[b] > mmMax) { mmMax = rawZOMSesuai[b]; bFallback = b; }
                });

                var tglOlahFb        = tglOlahDalamMusim(musim.bOnset, bFallback, tahunOnsetMusim);
                var tglTanamAktualFb = tambahHari(tglOlahFb, JEDA_OLAH_KE_TANAM_HARI);
                var bTanamAktualFb   = tglTanamAktualFb.getMonth();
                var tglPanenFb       = tambahHari(tglOlahFb, JEDA_OLAH_KE_TANAM_HARI + 110);
                var tglFaseFb        = cariTglFaseBulan(tglTanamAktualFb, 3, 8, 0, bTanamAktualFb);
                var statusFb         = statusWaktuTanam(tglFaseFb, now);

                hasilDuaMusim.push({
                    musimNama   : musim.nama,
                    musimKode   : musim.kode,
                    tglOlahTanah: tglOlahFb,
                    tglTanam    : tglFaseFb,
                    tglPanen    : tglPanenFb,
                    varietas    : 'sedang',
                    labelVar    : 'Sedang (95–115 HST)',
                    alasan      : 'Seluruh jendela olah tanah di bawah threshold air untuk bajak (' +
                                  th.thresholdBajak + 'mm). Dipilih bulan dengan curah hujan tertinggi (' +
                                  NAMA_BULAN[bFallback] + ' ' + tglOlahFb.getFullYear() + ', ' +
                                  rawZOM[bFallback].toFixed(0) + 'mm klimatologi → ' +
                                  mmMax.toFixed(0) + 'mm setelah penyesuaian ENSO/IOD). ' +
                                  'Tanam pindah diperkirakan ~' + JEDA_OLAH_KE_TANAM_HARI +
                                  ' hari kemudian (≈' + NAMA_BULAN[bTanamAktualFb] +
                                  ', setelah pembibitan). Pompanisasi penuh wajib disiapkan.',
                    isLewat    : statusFb.isLewat,
                    isBerjalan : statusFb.isBerjalan
                });

            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglFaseBaik = cariTglFaseBulan(best.tglTanamAktual, 3, 8, 0, best.bTanamAktual);
                var statusBest  = statusWaktuTanam(tglFaseBaik, now);

                var bOlah       = best.bTanam;
                var mmOlah      = best.mmTanam;
                var catatanOlah = best.mmTanamSesuai < th.thresholdBajak
                    ? 'Perhatian: curah hujan olah tanah di ' + NAMA_BULAN[bOlah] +
                      ' tipis (' + mmOlah.toFixed(0) + 'mm klimatologi → ' +
                      best.mmTanamSesuai.toFixed(0) + 'mm setelah penyesuaian) — ' +
                      'siapkan pompanisasi pendukung untuk bajak.'
                    : '';

                var keteranganGen   = best.skorGen < 30 ? 'kering — risiko puso' :
                                      best.skorGen > 75 ? 'basah — waspada Blast' :
                                      'optimal pembungaan';
                var keteranganPanen = best.skorPanen > 65 ? 'basah — butuh dryer' :
                                      best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

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

                var tahunOlah  = best.tglOlahTanah.getFullYear();
                var tahunTanam = best.tglTanamAktual.getFullYear();
                var tahunPanen = best.tglPanen.getFullYear();

                var alasan =
                    'Olah tanah (bajak) di ' + NAMA_BULAN[bOlah] + ' ' + tahunOlah +
                    ': ' + mmOlah.toFixed(0) + 'mm' +
                    ' (skor ' + best.skorTanam + '/100). Pembibitan ~1 minggu setelahnya; ' +
                    'tanam pindah ~' + JEDA_OLAH_KE_TANAM_HARI + ' hari setelah olah tanah ' +
                    '(≈' + NAMA_BULAN[best.bTanamAktual] + ' ' + tahunTanam +
                    ', setelah bibit berumur 15–20 hari). ' +
                    'Generatif di ' + best.namaBulanGen + ' (' + keteranganGen + '). ' +
                    'Panen di ' + best.namaBulanPanen + ' ' + tahunPanen +
                    ' (' + keteranganPanen + ').' +
                    (catatanOlah ? ' ⚠️ ' + catatanOlah : '') +
                    catatanENSOIOD;

                hasilDuaMusim.push({
                    musimNama   : best.musimNama,
                    musimKode   : best.musimKode,
                    tglOlahTanah: best.tglOlahTanah,  /* [FIX C] */
                    tglTanam    : tglFaseBaik,
                    tglPanen    : best.tglPanen,       /* [FIX C] */
                    varietas    : best.varietas,
                    labelVar    : best.labelVar,
                    alasan      : alasan,
                    isLewat     : statusBest.isLewat,
                    isBerjalan  : statusBest.isBerjalan
                });
            }
        });

        /* ================================================================
           [FIX B — v2.3] VALIDASI URUTAN MUSIM: PANEN → OLAH MUSIM BERIKUT
           ================================================================
           Setelah kedua musim dihitung secara independen, pastikan tidak
           ada overlap: tglOlahTanah musim ke-2 TIDAK BOLEH sebelum
           tglPanen musim ke-1.

           Jika overlap: geser semua tanggal musim ke-2 maju +1 tahun.
           Update isLewat/isBerjalan dan string alasan secara konsisten.
        ================================================================ */
        if (hasilDuaMusim.length === 2) {
            hasilDuaMusim.sort(function(a, b) {
                return (a.tglOlahTanah || a.tglTanam).getTime() -
                       (b.tglOlahTanah || b.tglTanam).getTime();
            });

            var m1 = hasilDuaMusim[0];
            var m2 = hasilDuaMusim[1];
            var tglOlahM2  = m2.tglOlahTanah || m2.tglTanam;
            var tglPanenM1 = m1.tglPanen;

            if (tglPanenM1 && tglOlahM2 &&
                tglOlahM2.getTime() < tglPanenM1.getTime()) {

                console.warn(
                    '[PatchMusim v2.3] ⚠️ OVERLAP MUSIM TERDETEKSI!\n' +
                    '  Olah tanah ' + m2.musimNama + ': ' +
                    tglOlahM2.toLocaleDateString('id-ID') +
                    '\n  Panen ' + m1.musimNama + ': ' +
                    tglPanenM1.toLocaleDateString('id-ID') +
                    '\n  → Geser ' + m2.musimNama + ' ke tahun berikutnya.'
                );

                function geserSetahun(d) {
                    if (!d) return d;
                    var b = new Date(d);
                    b.setFullYear(b.getFullYear() + 1);
                    return b;
                }

                m2.tglOlahTanah = geserSetahun(m2.tglOlahTanah);
                m2.tglTanam     = geserSetahun(m2.tglTanam);
                m2.tglPanen     = geserSetahun(m2.tglPanen);

                var stGeser = statusWaktuTanam(m2.tglTanam, now);
                m2.isLewat    = stGeser.isLewat;
                m2.isBerjalan = stGeser.isBerjalan;

                if (m2.alasan && m2.tglOlahTanah && m2.tglPanen) {
                    m2.alasan = m2.alasan.replace(
                        /Olah tanah \(bajak\) di (\w+) (\d{4})/,
                        'Olah tanah (bajak) di $1 ' + m2.tglOlahTanah.getFullYear()
                    );
                    m2.alasan = m2.alasan.replace(
                        /Panen di (\w+) (\d{4})/,
                        'Panen di $1 ' + m2.tglPanen.getFullYear()
                    );
                }
            }
        }

        /* Urutkan hasil akhir berdasarkan tglOlahTanah */
        hasilDuaMusim.sort(function (a, b) {
            return (a.tglOlahTanah || a.tglTanam).getTime() -
                   (b.tglOlahTanah || b.tglTanam).getTime();
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
        window._thresholdAirMusim         = THRESHOLD_AIR;
        window._faktorPenyesuaianENSOIOD  = faktorPenyesuaianENSOIOD;
        window._hitungTahunOnsetMusim     = hitungTahunOnsetMusim; /* expose untuk debugging */
        window._tglOlahDalamMusim         = tglOlahDalamMusim;    /* expose untuk debugging */

        console.log(
            '%c✅ patch_deteksi_musim_v2.3.js aktif\n' +
            '   Fix A (v2.3): Tahun dihitung SEKALI per musim (bukan per bulan)\n' +
            '                  → pakai bulan terakhir jendela sebagai acuan keaktifan\n' +
            '                  → semua bulan dalam satu jendela musim konsisten tahunnya\n' +
            '                  → wrap Des→Jan ditangani via tglOlahDalamMusim()\n' +
            '   Fix B (v2.3): Validasi urutan anti-overlap antar musim\n' +
            '   Fix C (v2.3): tglOlahTanah & tglPanen selalu ada di objek hasil\n' +
            '   ── Semua fix v2.0–v2.2 tetap aktif ──\n' +
            '   Fix #1–#6 (Lapisan 1–6): aktif tanpa perubahan',
            'color:#10b981; font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injeksiOverride);
    } else {
        setTimeout(injeksiOverride, 100);
    }

})();
