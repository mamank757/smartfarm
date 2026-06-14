/**
 * ============================================================
 *  patch_jadwal_tanam_otomatis.js
 *  Versi: 3.4 — Integrasi Zona Iklim Dinamis + Fix URL_ZOM_LOKAL
 * ------------------------------------------------------------
 *  PERBAIKAN v3.4 vs v3.3 — SEMUA TENTANG INTEGRASI ANTAR-PATCH
 *
 *  [FIX A — KRITIS] URL_ZOM_LOKAL tidak pernah terbaca
 *    • Masalah : getDataZOM() membaca `window.URL_ZOM_LOKAL`.
 *                Di HTML utama, variabel ini dideklarasikan
 *                dengan `const URL_ZOM_LOKAL = "...exec"`.
 *                Deklarasi `const`/`let` top-level pada <script>
 *                TIDAK menjadi properti window, sehingga
 *                window.URL_ZOM_LOKAL selalu undefined.
 *    • Akibat  : getDataZOM() SELALU jatuh ke fallback statis —
 *                data ZOM per-kabupaten (sumber yang sama dengan
 *                yang dipakai prosesAnalisisKalender() di
 *                patch_risiko_iklim.js) tidak pernah dipakai oleh
 *                Jadwal Tanam Otomatis.
 *    • Fix     : Semua <script> non-module berbagi satu
 *                "global declarative environment" yang sama,
 *                sehingga `URL_ZOM_LOKAL` (walau const) tetap
 *                bisa diakses sebagai identifier bebas dari
 *                script yang dimuat setelahnya. Diganti menjadi
 *                `(typeof URL_ZOM_LOKAL !== 'undefined') ? URL_ZOM_LOKAL : ''`.
 *
 *  [FIX B] Bobot ENSO/IOD hardcode "monsunal" untuk semua lokasi
 *    • Masalah : skorKelembapan() memakai tabel bobot tetap
 *                (kebetulan identik dengan BOBOT_IKLIM.monsunal
 *                di patch_risiko_iklim.js), padahal patch tersebut
 *                sudah menyediakan tentukanZonaIklim(lat, lon) +
 *                BOBOT_IKLIM per-zona (monsunal/ekuatorial/
 *                peralihan/lokal).
 *    • Akibat  : Untuk user di luar Sulsel (Kalimantan, Sumatra,
 *                Papua, dst), perhitungan skor kelembapan 12 bulan
 *                tetap memakai karakter monsunal Sulsel — tidak
 *                konsisten dengan analisis Risiko Iklim di tab
 *                Kalender yang SUDAH zona-aware.
 *    • Fix     : skorKelembapan(bulanIdx, baselineArr, ensoVal,
 *                iodVal, lat, lon) sekarang memanggil
 *                window.tentukanZonaIklim(lat, lon) +
 *                BOBOT_IKLIM[zona] (dengan fallback ke tabel
 *                monsunal lama bila kedua hal itu tidak tersedia).
 *
 *  [FIX C] normalisasiCurahHujan() dipanggil tanpa bulanIndex
 *    • Masalah : patch_perbaikan_ilmiah.js memperbaiki
 *                normalisasiCurahHujan(curahHujan, bulanIndex)
 *                agar baseline "normal" berbeda untuk musim
 *                rendeng vs gadu. skorKelembapan() v3.3 memanggil
 *                norm(bl) — 1 argumen — sehingga fungsi jatuh ke
 *                fallback "bulan sekarang", padahal yang relevan
 *                adalah BULAN FASE yang sedang dihitung (bisa
 *                berbeda jauh dari bulan sekarang untuk window
 *                tanam beberapa bulan ke depan).
 *    • Fix     : norm(bl, bulanIdx) — kirim indeks bulan fase.
 *
 *  [FIX D] Kamera BWD & state Malai tidak direset saat masuk
 *          tab "Jadwal Tanam"
 *    • Masalah : switchMode() asli SELALU memanggil stopCamera()
 *                dan mereset UI BWD + antrean sampel Malai untuk
 *                semua mode selain 'bwd'/'malai'. Karena
 *                patchSwitchMode() v3.3 untuk mode==='jadwaltanam'
 *                `return` lebih awal TANPA memanggil switchMode
 *                asli, langkah ini terlewat.
 *    • Akibat  : Jika user pindah dari tab "Uji BWD Urea" (kamera
 *                aktif) langsung ke "Jadwal Tanam", stream kamera
 *                tetap berjalan di background (boros baterai).
 *    • Fix     : Tambahkan stopCamera() + reset UI BWD + reset
 *                antrean hasilSampelBulir saat masuk jadwaltanam,
 *                mengikuti logika switchMode() asli.
 *
 *  [FIX E] currentMode tidak disinkronkan
 *    • Masalah : `currentMode` (let, top-level di script utama)
 *                tidak pernah diset ke 'jadwaltanam' karena
 *                switchMode asli tidak dipanggil untuk mode ini.
 *                Beberapa patch (mis. patch_perbaikan_ilmiah.js)
 *                membaca currentMode untuk logika kondisionalnya.
 *    • Fix     : Set `currentMode = 'jadwaltanam'` (via identifier
 *                bebas, sama seperti FIX A) saat tab ini aktif.
 *                Saat keluar, switchMode asli (dipanggil via _asli)
 *                sudah otomatis mengoreksi currentMode = mode baru.
 *
 *  [FIX F] Label "Zona Iklim" di kartu rekomendasi selalu
 *          tersirat "Sulsel"
 *    • Masalah : getDataZOM() fallback selalu memberi nama
 *                "Pola Monsunal Sulsel (estimasi)" tanpa melihat
 *                koordinat user — tidak konsisten dengan
 *                tentukanZonaIklim() yang membedakan 4 zona.
 *    • Fix     : getDataZOM() sekarang memanggil
 *                tentukanZonaIklim(lat, lon) lebih dulu, dan
 *                fallback per-zona (monsunal/ekuatorial/
 *                peralihan/lokal) dengan label yang sesuai.
 *                renderOutput() menampilkan kode zona + sumber
 *                data (kabupaten ZOM lokal jika tersedia, atau
 *                estimasi per-zona).
 *
 *  Catatan: seluruh perbaikan agronomi & UX dari v3.2/v3.3
 *  (urutan kronologis kegiatan, pulse tombol saat loading, fix
 *  bocoran frame cuaca) TETAP DIPERTAHANKAN tanpa perubahan.
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

    /* Label tampilan untuk kode zona dari tentukanZonaIklim() */
    var LABEL_ZONA = {
        monsunal:   'MONSUNAL',
        ekuatorial: 'EKUATORIAL',
        peralihan:  'PERALIHAN',
        lokal:      'LOKAL'
    };

    /* ──────────────────────────────────────────────────────────
       UTILITAS TANGGAL & BULAN
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

    /**
     * [FIX F] Fallback per-zona — dipakai jika data ZOM lokal
     * (per kabupaten) tidak tersedia / di luar radius 150 km.
     * Pola dasar dirujuk dari deskripsi zona pada
     * patch_risiko_iklim.js (Aldrian & Susanto, 2003):
     *   - monsunal  : 1 puncak basah (DJF), 1 puncak kering (JJA)
     *   - ekuatorial: 2 puncak basah (MAM & SON)
     *   - peralihan : versi redaman dari pola monsunal
     *   - lokal     : amplitudo kecil, relatif datar sepanjang tahun
     * Nilai tetap berupa INDEKS (-1.5..+1.5), bukan mm — sama
     * format dengan output normalisasiCurahHujan().
     */
    var FALLBACK_ZOM_PER_ZONA = {
        monsunal: {
            data: [0.9, 0.8, 0.6, 0.3, -0.1, -0.8, -1.2, -1.3, -0.9, -0.3, 0.4, 0.8],
            nama: 'Pola Monsunal (estimasi)'
        },
        ekuatorial: {
            data: [0.2, 0.3, 0.5, 0.6, 0.4, 0.0, -0.3, -0.2, 0.3, 0.6, 0.5, 0.3],
            nama: 'Pola Ekuatorial — 2 puncak hujan MAM & SON (estimasi)'
        },
        peralihan: {
            data: [0.5, 0.5, 0.4, 0.2, 0.0, -0.4, -0.6, -0.6, -0.3, 0.1, 0.4, 0.5],
            nama: 'Pola Peralihan (estimasi)'
        },
        lokal: {
            data: [0.1, 0.1, 0.1, 0.0, 0.0, -0.1, -0.1, -0.1, 0.0, 0.1, 0.1, 0.1],
            nama: 'Pola Lokal — amplitudo rendah (estimasi)'
        }
    };

    async function getDataZOM(lat, lon) {
        if (_cacheZOM) return _cacheZOM;

        // [FIX F] Tentukan zona iklim lebih dulu via patch_risiko_iklim.js
        // agar label & fallback selalu sesuai lokasi user, bukan selalu
        // tersirat "Sulsel".
        var zona = (typeof window.tentukanZonaIklim === 'function')
            ? window.tentukanZonaIklim(lat, lon)
            : 'monsunal';

        var fallbackZona = FALLBACK_ZOM_PER_ZONA[zona] || FALLBACK_ZOM_PER_ZONA.monsunal;
        var fallback = {
            data: fallbackZona.data,
            nama: fallbackZona.nama,
            jarak: null,
            zona: zona
        };

        try {
            // [FIX A] URL_ZOM_LOKAL dideklarasikan dengan `const` di
            // <script> utama (bukan `var`/`function`), sehingga TIDAK
            // pernah muncul sebagai window.URL_ZOM_LOKAL. Karena semua
            // <script> non-module berbagi global declarative scope yang
            // sama, identifier bebas `URL_ZOM_LOKAL` tetap bisa dibaca
            // dari sini selama script utama sudah dieksekusi (selalu
            // demikian, karena patch ini dimuat paling akhir).
            var urlZOM = (typeof URL_ZOM_LOKAL !== 'undefined') ? URL_ZOM_LOKAL : '';
            if (!urlZOM) {
                console.warn('[JadwalOtomatis] URL_ZOM_LOKAL tidak ditemukan — pakai fallback per-zona.');
                return fallback;
            }

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
                    jarak: jMin.toFixed(1),
                    zona: zona
                };
                return _cacheZOM;
            }
        } catch (e) {
            console.warn('[JadwalOtomatis] ZOM:', e.message);
        }
        return fallback;
    }

    /**
     * skorKelembapan — [FIX B & C]
     *
     * @param bulanIdx    indeks bulan (0=Jan ... 11=Des) untuk fase
     *                    yang sedang dievaluasi
     * @param baselineArr array 12 nilai indeks/mm dari getDataZOM()
     * @param ensoVal     anomali ENSO terkini
     * @param iodVal      anomali IOD terkini
     * @param lat, lon    koordinat user — dipakai untuk menentukan
     *                    zona iklim (BOBOT_IKLIM dari
     *                    patch_risiko_iklim.js). Opsional: jika tidak
     *                    diberikan, jatuh ke tabel bobot monsunal lama.
     */
    function skorKelembapan(bulanIdx, baselineArr, ensoVal, iodVal, lat, lon) {
        var norm = window.normalisasiCurahHujan || function (v) {
            return v < 30 ? -1.5 : v < 75 ? -0.8 : v < 150 ? 0.0 : v < 250 ? 0.8 : 1.5;
        };

        var bl  = baselineArr[bulanIdx];
        // [FIX C] kirim bulanIdx agar normalisasi musiman (rendeng vs
        // gadu) dari patch_perbaikan_ilmiah.js terpakai untuk BULAN
        // FASE yang dievaluasi — bukan "bulan sekarang".
        var idx = bl > 10 ? norm(bl, bulanIdx) : bl;

        // [FIX B] Bobot ENSO/IOD per-zona dari patch_risiko_iklim.js
        // (BOBOT_IKLIM adalah `const` top-level di script tersebut,
        // tetap terbaca sebagai identifier bebas karena berbagi global
        // declarative scope dengan patch ini).
        var wE, wI;
        var tabelBobot = (typeof BOBOT_IKLIM !== 'undefined') ? BOBOT_IKLIM : null;
        var zonaFn     = window.tentukanZonaIklim;

        if (tabelBobot && typeof zonaFn === 'function' &&
            typeof lat === 'number' && typeof lon === 'number') {
            var zona  = zonaFn(lat, lon);
            var tabel = tabelBobot[zona] || tabelBobot.monsunal;
            wE = tabel.enso[bulanIdx];
            wI = tabel.iod[bulanIdx];
        } else {
            // Fallback: tabel bobot monsunal (perilaku v3.3), dipakai
            // hanya jika patch_risiko_iklim.js belum termuat / lat-lon
            // tidak tersedia.
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
       MESIN REKOMENDASI WINDOW TANAM
    ────────────────────────────────────────────────────────── */
    function rekomendasiWindowTanam(skorBulan) {
        var now = new Date();
        var bulanSekarang = now.getMonth();
        var tahunSekarang = now.getFullYear();

        var MUSIM = [
            {
                nama  : 'MT I — Rendeng (Musim Hujan)',
                kode  : 'rendeng',
                bulanTanam: [9, 10, 11, 0]
            },
            {
                nama  : 'MT II — Gadu (Musim Kemarau)',
                kode  : 'gadu',
                bulanTanam: [3, 4, 5, 6]
            }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',  panen:90,  persenGen:0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen:110, persenGen:0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',  panen:125, persenGen:0.55 }
        ];

        var kandidat = [];

        MUSIM.forEach(function (musim) {
            musim.bulanTanam.forEach(function (bTanam) {
                var tahunTanam;
                if (bTanam >= bulanSekarang) {
                    tahunTanam = tahunSekarang;
                } else {
                    tahunTanam = tahunSekarang + 1;
                }

                if (musim.kode === 'rendeng' && bTanam === 0) {
                    if (bulanSekarang >= 9) {
                        tahunTanam = tahunSekarang + 1;
                    }
                }

                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 15) return;

                varianArr.forEach(function (v) {
                    var hariGen   = Math.floor(v.panen * v.persenGen);
                    var bGenIdx   = (bTanam + Math.floor(hariGen  / 30)) % 12;
                    var bPanenIdx = (bTanam + Math.floor(v.panen  / 30)) % 12;

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];

                    var nilaiGen   = 100 - Math.abs(skorGen - 40);
                    var nilaiPanen = 100 - skorPanen;
                    var nilaiTotal = (nilaiGen * 0.55) + (nilaiPanen * 0.45);

                    var bVeg1 = (bTanam + 1) % 12;
                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;

                    var offsetBulan = (bTanam - bulanSekarang + 12) % 12;
                    if (tahunTanam > tahunSekarang && offsetBulan < 6) {
                        offsetBulan += 12;
                    }

                    kandidat.push({
                        musimNama   : musim.nama,
                        musimKode   : musim.kode,
                        offsetBulan : offsetBulan,
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
        });

        if (!kandidat.length) {
            var tglFallback = tambahHari(now, 14);
            return {
                tglTanam : tglFallback,
                varietas : 'sedang',
                labelVar : 'Sedang (95–115 HST)',
                alasan   : 'Semua window musim tanam menunjukkan kondisi kering ekstrem. ' +
                           'Dipilih tanggal default. Pertimbangkan pompanisasi penuh atau palawija.'
            };
        }

        kandidat.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
        var best = kandidat[0];

        var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, best.tahunTanam);
        var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0);

        if (tglFaseBaik.getMonth() !== best.bTanam) {
            tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0);
        }
        if (tglFaseBaik.getMonth() !== best.bTanam) {
            tglFaseBaik = new Date(best.tahunTanam, best.bTanam, 10);
        }

        var keteranganSkorGen =
            best.skorGen < 25 ? 'kering — risiko puso jika tidak ada irigasi' :
            best.skorGen > 70 ? 'basah — waspada Blast dan penyerbukan terganggu' :
                                'optimal untuk pembungaan dan pengisian bulir';

        var keteranganSkorPanen =
            best.skorPanen > 65 ? 'basah — siapkan dryer dan panen pagi' :
            best.skorPanen < 20 ? 'kering ideal — panen berlangsung lancar' :
                                  'sedang — koordinasikan combine harvester';

        var alasan =
            best.musimNama + '. ' +
            'Bulan tanam: ' + NAMA_BULAN[best.bTanam] + ' ' + best.tahunTanam +
            ' (skor kelembapan: ' + best.skorTanam + '/100). ' +
            'Fase generatif → ' + best.namaBulanGen +
            ' (skor: ' + best.skorGen + '/100 — ' + keteranganSkorGen + '). ' +
            'Panen → ' + best.namaBulanPanen +
            ' (skor: ' + best.skorPanen + '/100 — ' + keteranganSkorPanen + '). ' +
            'Nilai iklim gabungan: ' + best.nilaiTotal.toFixed(0) + '/100.';

        if (best.offsetBulan > 2) {
            alasan += ' ⚠️ Waktu tanam optimal masih ' + best.offsetBulan +
                      ' bulan ke depan. Pertimbangkan palawija (jagung/kedelai) ' +
                      'untuk musim antara ini.';
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
       Urutan agronomi yang benar (v3.2+):
         1. Pengolahan Lahan  → D-(benih+7)
         2. Pembibitan Benih  → D-benih
         3. Pasang TBS        → D-7
         4. Tanam             → D-0
         ...dst
    ────────────────────────────────────────────────────────── */
    function bangunKegiatan(tglTanam, varietas, skorBulan) {
        var of = {
            genjah: { benih:14, p1:7,  p2:28, p3:45, i1:20, i2:45, fung:55, panen:90  },
            sedang: { benih:21, p1:7,  p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 },
            dalam:  { benih:28, p1:7,  p2:35, p3:65, i1:30, i2:65, fung:75, panen:125 }
        }[varietas] || { benih:21, p1:7, p2:30, p3:55, i1:25, i2:55, fung:65, panen:110 };

        var hariOlah  = of.benih + 7;
        var tglOlah   = tambahHari(tglTanam, -hariOlah);
        var tglBenih  = tambahHari(tglTanam, -of.benih);
        var tglTBS    = tambahHari(tglTanam, -7);
        var tglTikusA = cariTglFaseBulan(tglTanam, 26, 29.5, -10);
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
                nama:'Pengolahan Lahan', ikon:'🚜',
                deskripsi:'Bajak, garu, pemerataan petakan',
                tglMulai: tglOlah, tglSelesai: tambahHari(tglOlah, 7),
                risiko: risikoOlah(sk(tglOlah)),
                tips:[
                    'Olah lahan ' + hariOlah + ' hari sebelum tanam — gulma terbenam & lahan mengendap.',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha saat bajak pertama.',
                    'Setelah garu, genangi 5–7 hari sebelum tanam agar tanah "matang".',
                    'Cek saluran irigasi dan perbaiki pematang bocor.'
                ]
            },
            {
                nama:'Pembibitan Benih', ikon:'🌱',
                deskripsi:'Seleksi, rendam, kecambah, semai di bedeng/polibag',
                tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips:[
                    'Semai dilakukan PARALEL saat lahan utama sudah digenangi & diendapkan.',
                    'Rendam benih 24 jam — buang yang mengapung.',
                    'Inkubasi lembap 48 jam hingga kecambah 2–3 mm.',
                    'Dosis semai: 25–35 kg/ha (tapin) atau 50–100 kg/ha (tabela).',
                    'Umur cabut bibit: ' + of.benih + ' HSS — jangan tunggu terlalu tua.'
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
                    'Umur bibit optimal: ' + of.benih + ' HSS (tapin).',
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

        daftar.sort(function (a, b) {
            return a.tglMulai.getTime() - b.tglMulai.getTime();
        });

        return daftar;
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

        // [FIX F] Label zona iklim sekarang mengikuti
        // tentukanZonaIklim() (4 zona), bukan selalu "Sulsel".
        // Jika ZOM lokal kabupaten ditemukan, tampilkan juga
        // nama kabupaten + jaraknya.
        var labelZona = (zonaInfo.zona && LABEL_ZONA[zonaInfo.zona]) ? LABEL_ZONA[zonaInfo.zona] : 'MONSUNAL';
        var sumberData = zonaInfo.jarak
            ? zonaInfo.nama + ' (' + zonaInfo.jarak + ' km)'
            : zonaInfo.nama;
        var zonaTampil = labelZona + ' • ' + sumberData;

        return '<div style="padding:4px 0;">' +

        '<div style="background:rgba(6,182,212,0.09);border:1px solid rgba(6,182,212,0.25);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">' +
            '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">🤖 REKOMENDASI OTOMATIS SISTEM</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Tanggal tanam terbaik</span><br><strong style="color:#fff;font-size:13px;">' + formatTglLengkap(rekomendasi.tglTanam) + '</strong></div>' +
                '<div><span style="color:#64748b;">Varietas</span><br><strong style="color:#fff;font-size:13px;">' + rekomendasi.labelVar + '</strong></div>' +
                '<div style="grid-column:span 2;"><span style="color:#64748b;">Zona iklim & sumber data</span><br><strong style="color:#fff;">' + zonaTampil + '</strong></div>' +
                '<div><span style="color:#64748b;">ENSO / IOD</span><br><strong style="color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</strong></div>' +
            '</div>' +
            '<div style="margin-top:10px;padding-top:9px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">' +
                '💡 ' + rekomendasi.alasan +
            '</div>' +
        '</div>' +

        '<div style="font-size:11px;color:#64748b;margin-bottom:10px;">12 kegiatan direkomendasikan — ketuk kartu untuk detail & tips lapangan</div>' +

        kartuHTML +

        '<div style="margin-top:12px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Rekomendasi berbasis kalender iklim 12 bulan — bukan sekadar hari ke depan. ' +
            'Sesuaikan dengan kondisi lapangan, ketersediaan air, dan pengamatan PHT mingguan. ' +
            'Sumber: NOAA ENSO/IOD, ZOM BMKG, siklus sinodis bulan, BB Padi (2019), ' +
            'zona iklim (Aldrian &amp; Susanto 2003 — sama dengan tab Risiko Iklim).' +
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

       LOGIKA PULSE (dipertahankan dari v3.3):
       ────────────────────────────────────
       ✅ Saat KLIK      → pulse TETAP (tidak dihapus sama sekali)
                           Tombol disabled + teks berubah jadi
                           "🔄 MENGANALISIS IKLIM..."
       ✅ Saat LOADING   → pulse tetap berjalan sebagai sinyal
                           sistem sedang bekerja
       ✅ Saat BERHASIL  → hapus pulse (hasil sudah tampil,
                           tidak perlu menarik perhatian lagi)
       ✅ Saat ERROR     → pulse tetap (ajak user retry)
    ────────────────────────────────────────────────────────── */
    async function prosesJadwalOtomatis() {
        var hasilEl  = document.getElementById('jtoHasil');
        var teksEl   = document.getElementById('jtoTeks');
        var statusEl = document.getElementById('jtoStatus');
        var btnJTO   = document.getElementById('btnJadwalOtomatis');
        if (!hasilEl || !teksEl) return;

        hasilEl.style.display = 'block';
        teksEl.innerHTML = '';

        var teksAsliBtn = '🤖 ANALISIS & BUAT JADWAL OTOMATIS';
        if (btnJTO) {
            btnJTO.disabled = true;
            btnJTO.style.opacity = '0.75';
            btnJTO.textContent = '🔄 MENGANALISIS IKLIM...';
            /* TIDAK menghapus class jto-pulse — biarkan tetap berdenyut */
        }

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

            // [FIX B/C] sertakan lat & lon agar skorKelembapan() bisa
            // menentukan zona iklim & bobot ENSO/IOD yang sesuai,
            // serta meneruskan bulanIdx ke normalisasiCurahHujan().
            var skorBulan = zonaInfo.data.map(function (_, idx) {
                return skorKelembapan(idx, zonaInfo.data, ensoVal, iodVal, lat, lon);
            });

            var rekomendasi = rekomendasiWindowTanam(skorBulan);
            var kegiatan = bangunKegiatan(rekomendasi.tglTanam, rekomendasi.varietas, skorBulan);

            if (statusEl) statusEl.innerHTML = '';

            if (btnJTO) {
                btnJTO.disabled = false;
                btnJTO.style.opacity = '';
                btnJTO.textContent = teksAsliBtn;
                btnJTO.classList.remove('jto-pulse'); /* berhasil = berhenti denyut */
            }

            teksEl.innerHTML = renderOutput(rekomendasi, kegiatan, zonaInfo, ensoData, iodData);

        } catch (err) {
            console.error('[JadwalOtomatis]', err);
            if (statusEl) statusEl.innerHTML = '';

            if (btnJTO) {
                btnJTO.disabled = false;
                btnJTO.style.opacity = '';
                btnJTO.textContent = teksAsliBtn;
                /* jto-pulse sudah ada dari awal, tidak perlu ditambah lagi */
            }

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

            '<button id="btnJadwalOtomatis" class="jto-pulse" style="' +
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

       Daftar lengkap ID yang harus disembunyikan saat masuk
       mode 'jadwaltanam' (fix bocoran frame cuaca, tetap dari v3.3)
    ────────────────────────────────────────────────────────── */
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

        document.querySelectorAll('.info-box-dynamic').forEach(function (el) {
            el.style.display = 'none';
        });

        document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
            b.style.display = 'none';
        });
    }

    /**
     * [FIX D] Reset state BWD (kamera + UI) & antrean sampel Malai,
     * mengikuti perilaku switchMode() asli untuk semua mode selain
     * 'bwd'/'malai'. Dipanggil saat masuk mode 'jadwaltanam' karena
     * patchSwitchMode() untuk mode ini tidak memanggil switchMode asli.
     */
    function resetStateBwdDanMalai() {
        // Hentikan stream kamera BWD jika sedang aktif
        if (typeof window.stopCamera === 'function') {
            window.stopCamera();
        }

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

        // Reset antrean sampel Malai. `hasilSampelBulir` dideklarasikan
        // dengan `let` di script utama — tetap bisa diakses sebagai
        // identifier bebas karena berbagi global declarative scope
        // (sama seperti URL_ZOM_LOKAL pada FIX A).
        try {
            if (typeof hasilSampelBulir !== 'undefined') {
                hasilSampelBulir = [];
            }
        } catch (e) { /* abaikan jika tidak bisa diakses */ }

        var listM = document.getElementById('listMalai');
        if (listM) listM.innerHTML = '';
    }

    function patchSwitchMode() {
        var _asli = window.switchMode;

        window.switchMode = function (mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');
            var tabJTO = document.getElementById('tabJadwalTanam');

            if (mode === 'jadwaltanam') {
                // [FIX D] samakan dengan perilaku switchMode asli untuk
                // mode selain 'bwd': hentikan kamera & reset UI BWD/Malai
                resetStateBwdDanMalai();

                // [FIX E] sinkronkan currentMode (let top-level di script
                // utama) agar patch lain yang membacanya tetap konsisten.
                try {
                    if (typeof currentMode !== 'undefined') {
                        currentMode = 'jadwaltanam';
                    }
                } catch (e) { /* abaikan jika tidak bisa diakses */ }

                sembunyikanSemuaUntukJadwal();

                if (boxJTO) boxJTO.style.display = 'block';

                var titleEl = document.getElementById('modeTitle');
                if (titleEl) { titleEl.innerText = '📅 Jadwal Kegiatan Tani'; titleEl.style.color = WARNA; }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) { subEl.innerText = ''; subEl.style.display = 'none'; }

                document.querySelectorAll('.tab-btn').forEach(function (btn) {
                    btn.classList.remove('active');
                });
                if (tabJTO) tabJTO.classList.add('active');

                var hasilEl = document.getElementById('jtoHasil');
                if (hasilEl && hasilEl.style.display === 'none') {
                    prosesJadwalOtomatis();
                }

                return;
            }

            /* Saat keluar dari jadwaltanam, sembunyikan boxnya */
            if (boxJTO) boxJTO.style.display = 'none';
            if (tabJTO) tabJTO.classList.remove('active');

            if (typeof _asli === 'function') {
                _asli.apply(this, arguments);
                // currentMode sudah otomatis disinkronkan oleh switchMode
                // asli (baris `currentMode = mode;` di awal fungsi),
                // sehingga tidak perlu diset ulang di sini.
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
        style.textContent = [
            '#tabJadwalTanam.active{background:' + WARNA + '!important;color:#fff!important;}',
            '#tabJadwalTanam:not(.active){color:#708099;}',

            '#btnJadwalOtomatis:hover{opacity:0.88;}',
            '#btnJadwalOtomatis:active{transform:scale(0.985);}',

            '@keyframes jto-radar{',
            '  0%   { box-shadow: 0 0 0 0   rgba(6,182,212,0.85); }',
            '  65%  { box-shadow: 0 0 0 20px rgba(6,182,212,0.00); }',
            '  100% { box-shadow: 0 0 0 0   rgba(6,182,212,0.00); }',
            '}',
            '#btnJadwalOtomatis.jto-pulse{',
            '  animation: jto-radar 1.5s ease-out infinite;',
            '  will-change: box-shadow;',
            '}',

            'body.light-mode #boxJadwalTanam{background:#fff;color:#0f172a;}'
        ].join('');
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
            '%c✅ patch_jadwal_tanam_otomatis.js v3.4 aktif — Integrasi zona iklim dinamis (BOBOT_IKLIM/tentukanZonaIklim), fix URL_ZOM_LOKAL, sinkronisasi currentMode & kamera BWD',
            'color:' + WARNA + ';font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
