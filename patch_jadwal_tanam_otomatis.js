/**
 * ============================================================
 *  patch_jadwal_tanam_otomatis.js
 *  Versi: 3.13 — Transparansi Sumber Data ENSO/IOD
 * ------------------------------------------------------------
 *  PERBAIKAN v3.13 vs v3.12.1:
 *
 *  [BARU] Warning eksplisit di console kalau window.getENSOAnomaly /
 *  window.getIODAnomaly tidak ditemukan saat tombol analisis diklik.
 *  Sebelumnya kegagalan ini diam-diam jatuh ke nilai Netral tanpa
 *  jejak apa pun — menyulitkan debug urutan <script> yang salah.
 *
 *  [BARU] Kotak "INFORMASI IKLIM TAHUNAN" sekarang menampilkan
 *  SUMBER data ENSO & IOD (mis. "NOAA CPC (resmi)" / "Open-Meteo
 *  (fallback)" / "Statis (semua sumber gagal)"), dengan badge warna:
 *    ✅ hijau  = data resmi NOAA
 *    ⚠️ kuning = fallback Open-Meteo
 *    ❌ merah  = statis / modul ENSO-IOD tidak termuat
 *  Sebelumnya hanya status ("El Niño"/"Netral") yang tampil, jadi
 *  pengguna tidak bisa membedakan "memang netral" vs "gagal ambil
 *  data dan diam-diam pakai default".
 *
 *  [BARU] Sumber data ENSO/IOD ikut disertakan saat jadwal dikirim
 *  ke WhatsApp, supaya transparansi terbawa sampai ke pengguna akhir.
 *
 *  [TETAP dari v3.12] Tapin & Tabela panen serentak, badge status
 *  musim, statusWaktuTanam, cariTglFaseBulan + batasBulan, deteksi
 *  lembah ekuatorial, invalidasi cache ZOM, auto-trigger dihapus —
 *  semua tetap aktif tanpa perubahan.
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

    var LABEL_METODE_TANAM = {
        tapin:  '🌱 Tanam Pindah (Tapin)',
        tabela: '🌾 Tanam Benih Langsung (Tabela)'
    };

    /* ──────────────────────────────────────────────────────────
       TABEL VARIETAS — SUMBER TUNGGAL KEBENARAN
       ─────────────────────────────────────────────────────────
       umurTotal : umur penuh varietas dari BENIH ke PANEN (hari)
       umurBibit : umur bibit saat dipindah tanam (HSS) — hanya Tapin

       RUMUS PANEN (SAMA untuk Tapin & Tabela):
         tglPanen = tglTanam + umurTotal

       Yang berbeda hanya KAPAN MULAI:
         Tabela → mulai rendam 2 hari sebelum tglTanam
         Tapin  → mulai semai umurBibit hari sebelum tglTanam
    ────────────────────────────────────────────────────────── */
    var TABEL_VARIETAS = {
        genjah: { umurTotal: 90,  umurBibit: 14 },
        sedang: { umurTotal: 110, umurBibit: 21 },
        dalam:  { umurTotal: 125, umurBibit: 28 }
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

    function cariTglFaseBulan(acuan, faseMin, faseMax, offsetMulai, batasBulan) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            if (batasBulan !== null && batasBulan !== undefined && t.getMonth() !== batasBulan) continue;
            var f = hariFaseBulan(t);
            if (f >= faseMin && f <= faseMax) return t;
        }
        return null;
    }

    /* ──────────────────────────────────────────────────────────
       DATA ZOM DAN SKOR KELEMBAPAN
    ────────────────────────────────────────────────────────── */
    var _cacheZOM = null;
    var _cacheZOMKoord = null;

    var FALLBACK_ZOM_PER_ZONA = {
        monsunal:   { data: [0.9, 0.8, 0.6, 0.3, -0.1, -0.8, -1.2, -1.3, -0.9, -0.3, 0.4, 0.8], nama: 'Pola Monsunal (estimasi)' },
        ekuatorial: { data: [0.2, 0.3, 0.5, 0.6,  0.4,  0.0, -0.3, -0.2,  0.3,  0.6, 0.5, 0.3], nama: 'Pola Ekuatorial (estimasi)' },
        peralihan:  { data: [0.5, 0.5, 0.4, 0.2,  0.0, -0.4, -0.6, -0.6, -0.3,  0.1, 0.4, 0.5], nama: 'Pola Peralihan (estimasi)' },
        lokal:      { data: [0.1, 0.1, 0.1, 0.0,  0.0, -0.1, -0.1, -0.1,  0.0,  0.1, 0.1, 0.1], nama: 'Pola Lokal (estimasi)' }
    };

    function koordinatBerubah(lat, lon) {
        if (!_cacheZOMKoord) return true;
        var dLat = Math.abs(lat - _cacheZOMKoord.lat) * 111;
        var dLon = Math.abs(lon - _cacheZOMKoord.lon) * 111 * Math.cos(lat * Math.PI / 180);
        return Math.sqrt(dLat * dLat + dLon * dLon) > 5;
    }

    async function getDataZOM(lat, lon) {
        if (_cacheZOM && !koordinatBerubah(lat, lon)) return _cacheZOM;
        if (koordinatBerubah(lat, lon)) { _cacheZOM = null; _cacheZOMKoord = null; }

        var zona = (typeof window.tentukanZonaIklim === 'function')
            ? window.tentukanZonaIklim(lat, lon) : 'monsunal';

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
                _cacheZOMKoord = { lat: lat, lon: lon };
                return _cacheZOM;
            }
        } catch (e) {
            console.warn('[JadwalOtomatis] ZOM:', e.message);
        }
        return fallback;
    }

    function skorKelembapan(bulanIdx, baselineArr, ensoVal, iodVal, lat, lon) {
        var norm = window.normalisasiCurahHujan || function (v) {
            return v < 30 ? -1.5 : v < 75 ? -0.8 : v < 150 ? 0.0 : v < 250 ? 0.8 : 1.5;
        };

        var bl  = baselineArr[bulanIdx];
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
       MESIN REKOMENDASI
    ────────────────────────────────────────────────────────── */
    function rekomendasiWindowTanam(skorBulan, rawZOM, zona) {
        var now           = new Date();
        var tahunSekarang = now.getFullYear();

        var maxSum = -Infinity, startRendeng = 0;
        for (var i = 0; i < 12; i++) {
            var sum = 0;
            for (var j = 0; j < 6; j++) sum += rawZOM[(i + j) % 12];
            if (sum > maxSum) { maxSum = sum; startRendeng = i; }
        }

        var startGadu;
        if (zona === 'ekuatorial') {
            var minSum = Infinity;
            startGadu = (startRendeng + 6) % 12;
            for (var ii = 0; ii < 12; ii++) {
                var lembahSum = 0;
                for (var jj = 0; jj < 5; jj++) lembahSum += rawZOM[(ii + jj) % 12];
                if (lembahSum < minSum) {
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

        // FIX: Jendela pencarian diperluas menjadi 6 bulan agar bulan transisi (Mei) ikut dievaluasi
        var rendengBulan = [startRendeng, (startRendeng+1)%12, (startRendeng+2)%12, (startRendeng+3)%12, (startRendeng+4)%12, (startRendeng+5)%12];
        var gaduBulan    = [startGadu,    (startGadu+1)%12,    (startGadu+2)%12,    (startGadu+3)%12,    (startGadu+4)%12,    (startGadu+5)%12];

        var MUSIM = [
            { nama: 'MT I — Musim Utama (Puncak Hujan)',   kode: 'rendeng', bulanTanam: rendengBulan },
            { nama: 'MT II — Musim Kedua (Hujan Menurun)', kode: 'gadu',    bulanTanam: gaduBulan   }
        ];

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen: 90  },
            { kode:'sedang', label:'Sedang (95–115 HST)', panen: 110 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen: 125 }
        ];

        var hasilDuaMusim = [];

        MUSIM.forEach(function (musim) {
            var kandidatMusim = [];

            musim.bulanTanam.forEach(function (bTanam) {
                var skorTanam = skorBulan[bTanam];
                if (skorTanam < 10) return;

                varianArr.forEach(function (v) {
                    var hariGen     = Math.floor(v.panen * 0.55);
                    var tglTanamRef = tanggalDariBulanTahun(bTanam, tahunSekarang);
                    var bGenIdx     = tambahHari(tglTanamRef, hariGen).getMonth();
                    var bPanenIdx   = tambahHari(tglTanamRef, v.panen).getMonth();

                    var skorGen   = skorBulan[bGenIdx];
                    var skorPanen = skorBulan[bPanenIdx];
                    var bVeg1     = (bTanam + 1) % 12;

                    var nilaiGen   = 100 - Math.abs(skorGen - 40);
                    var nilaiPanen = 100 - skorPanen;
                    
                    // FIX KRITIS: Tambahkan penilaian positif untuk fase Vegetatif (Butuh genangan air)
                    // Skor akan sangat tinggi jika bulan Tanam dan bulan setelahnya sangat basah (seperti Mei & Juni)
                    var nilaiVeg = (skorTanam + skorBulan[bVeg1]) / 2; 

                    // Bobot diseimbangkan: Vegetatif 30% (Kritis air awal), Generatif 35%, Panen 35% (Kering)
                    var nilaiTotal = (nilaiVeg * 0.30) + (nilaiGen * 0.35) + (nilaiPanen * 0.35);

                    if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;
                    if (skorTanam < 20) nilaiTotal -= (20 - skorTanam) * 1.5;

                    kandidatMusim.push({
                        musimNama : musim.nama,
                        musimKode : musim.kode,
                        bTanam    : bTanam,
                        varietas  : v.kode,
                        labelVar  : v.label,
                        umurTotal : v.panen,
                        nilaiTotal: nilaiTotal,
                        skorTanam : skorTanam,
                        skorGen   : skorGen,
                        skorPanen : skorPanen,
                        namaBulanGen  : NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    });
                });
            });

            if (kandidatMusim.length === 0) {
                var bFallback       = musim.bulanTanam[0];
                var tglAwalFallback = tanggalDariBulanTahun(bFallback, tahunSekarang);
                var tglFaseFallback = cariTglFaseBulan(tglAwalFallback, 3, 8, 0, bFallback)
                                      || new Date(tahunSekarang, bFallback, 10);
                var statusFallback  = statusWaktuTanam(tglFaseFallback, now);

                hasilDuaMusim.push({
                    musimNama  : musim.nama,
                    musimKode  : musim.kode,
                    tglTanam   : tglFaseFallback,
                    varietas   : 'sedang',
                    labelVar   : 'Sedang (95–115 HST)',
                    umurTotal  : 110,
                    alasan     : 'Kondisi kering ekstrem di seluruh jendela tanam musim ini. Dipilih tanggal default fase bulan terbaik. Pompanisasi penuh mungkin diperlukan.',
                    isLewat    : statusFallback.isLewat,
                    isBerjalan : statusFallback.isBerjalan
                });
            } else {
                kandidatMusim.sort(function (a, b) { return b.nilaiTotal - a.nilaiTotal; });
                var best = kandidatMusim[0];

                var tglAwalBulan = tanggalDariBulanTahun(best.bTanam, tahunSekarang);
                var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0, best.bTanam);
                if (!tglFaseBaik || tglFaseBaik.getMonth() !== best.bTanam)
                    tglFaseBaik = new Date(tahunSekarang, best.bTanam, 10);

                var statusBest = statusWaktuTanam(tglFaseBaik, now);

                var keteranganSkorGen =
                    best.skorGen < 25 ? 'kering — risiko puso' :
                    best.skorGen > 70 ? 'basah — waspada Blast' : 'optimal pembungaan';
                var keteranganSkorPanen =
                    best.skorPanen > 65 ? 'basah — butuh dryer' :
                    best.skorPanen < 20 ? 'kering ideal' : 'sedang — aman';

                hasilDuaMusim.push({
                    musimNama  : best.musimNama,
                    musimKode  : best.musimKode,
                    tglTanam   : tglFaseBaik,   // = tglTanam REFERENSI (≡ tgl sebar Tabela / tgl pindah Tapin)
                    varietas   : best.varietas,
                    labelVar   : best.labelVar,
                    umurTotal  : best.umurTotal,
                    alasan     :
                        'Skor bulan tanam: ' + best.skorTanam + '/100. ' +
                        'Generatif jatuh di ' + best.namaBulanGen + ' (' + keteranganSkorGen + '). ' +
                        'Panen di ' + best.namaBulanPanen + ' (' + keteranganSkorPanen + ').',
                    isLewat    : statusBest.isLewat,
                    isBerjalan : statusBest.isBerjalan
                });
            }
        });

        hasilDuaMusim.sort(function(a, b) { return a.tglTanam.getTime() - b.tglTanam.getTime(); });
        return hasilDuaMusim;
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
       ─────────────────────────────────────────────────────────
       PRINSIP PANEN SERENTAK v3.12:
         tglTanam (dari engine) = tanggal masuk lahan utama,
                                   SAMA untuk Tapin & Tabela.

         Tabela → tglBenih = tglTanam - 2   (rendam+peram 48 jam)
                  tglSebar = tglTanam
                  tglPanen = tglTanam + umurTotal   ← identik

         Tapin  → tglBenih = tglTanam - umurBibit   ← LEBIH AWAL
                  tglPindah = tglTanam
                  tglPanen  = tglTanam + umurTotal   ← identik ✅

         Transplanting shock TIDAK dipakai sebagai offset panen
         karena umur varietas empiris lapangan sudah menyertakannya.
    ────────────────────────────────────────────────────────── */
    function bangunKegiatan(rek, skorBulan, metodeTanam) {
        var isTabela       = (metodeTanam === 'tabela');
        var tglAcuanTabela = rek.tglTanam;     // Engine merekomendasikan ini sebagai jadwal Tabela
        
        // LOGIKA BARU: Tapin dimundurkan 8 hari (kompensasi stagnasi) dari jadwal Tabela
        var tglTanam       = isTabela ? tglAcuanTabela : tambahHari(tglAcuanTabela, -8); 

        var varietas  = rek.varietas;
        var tglOlah   = rek.tglOlahTanah;
        var jt        = rek.jadwalTikus;

        var vParam    = TABEL_VARIETAS[varietas] || TABEL_VARIETAS.sedang;
        var umurTotal = vParam.umurTotal;
        var umurBibit = vParam.umurBibit;       // hanya dipakai Tapin

        /* ── Tanggal-tanggal utama ── */
        // Panen dikunci serentak berdasarkan hitungan umur Tabela
        var tglPanen = tambahHari(tglAcuanTabela, umurTotal);

        // tglBenih menyesuaikan tglTanam masing-masing metode yang sudah dikoreksi
        var tglBenih  = isTabela ? tambahHari(tglTanam, -2) : tambahHari(tglTanam, -umurBibit);

        // Kegiatan pasca-tanam dihitung dari tglTanam (hari ke-0 di lahan)
        var tglP1     = tambahHari(tglTanam, 7);
        var tglP2     = tambahHari(tglTanam, isTabela ? 28 : 30);
        var tglP3     = tambahHari(tglTanam, isTabela ? 45 : 55);
        var tglI1     = tambahHari(tglTanam, isTabela ? 20 : 25);
        var tglI2     = tambahHari(tglTanam, isTabela ? 45 : 55);
        var tglFung   = tambahHari(tglTanam, isTabela ? 55 : 65);

        /* ── Sinkronisasi jadwal tikus dari "otak" v3.0 ── */
        var tglGropyokM = jt ? jt.gropyokan.tglMulai             : tambahHari(tglOlah, -14);
        var tglGropyokS = jt ? jt.sanitasiPematang.tglSelesai    : tambahHari(tglOlah, -1);
        var tglTBSM     = jt ? jt.pasangTBS.tglMulai             : tglTanam;
        var tglTBSS     = jt ? jt.monitorTBS.tglSelesai          : tambahHari(tglTanam, 30);
        var tglRacunM   = jt ? jt.umpanRacun.tglMulai            : tambahHari(tglTanam, 1);
        var tglRacunS   = jt ? jt.umpanRacun.tglSelesai          : tambahHari(tglTanam, 21);

        /* ── Geser insektisida jika jatuh di puncak bulan penuh ── */
        [tglI1, tglI2].forEach(function (t, idx) {
            var f = hariFaseBulan(t);
            if (f >= 13.5 && f <= 16.5) {
                if (idx === 0) tglI1 = tambahHari(t, 5);
                else           tglI2 = tambahHari(t, 5);
            }
        });

        function sk(tgl) { return skorBulan[tgl.getMonth()]; }

        /* ── Aktivitas benih & tanam — berbeda per metode ── */
        var aktivitasBenih, aktivitasTanam;
        if (isTabela) {
            aktivitasBenih = {
                nama: 'Rendam & Peram Benih', ikon: '💧',
                deskripsi: 'Rendam 24 jam, peram 24 jam hingga berkecambah',
                tglMulai: tglBenih, tglSelesai: tglTanam,
                risiko: risikoBenih(sk(tglBenih)),
                tips: [
                    'Rendam benih 24 jam dalam air, lalu peram (bungkus karung lembap) ±24 jam hingga kecambah ±1–2 mm.',
                    'Dosis benih Tabela: 50–60 kg/ha (drum seeder) atau hingga 100 kg/ha (sebar manual).'
                ]
            };
            aktivitasTanam = {
                nama: 'Tanam Benih Langsung (Tabela)', ikon: '🌾',
                deskripsi: 'Sebar benih berkecambah ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 1),
                risiko: risikoTanam(sk(tglTanam)),
                tips: [
                    'Lahan macak-macak (jenuh air, tidak tergenang) saat sebar agar benih tidak hanyut/mengumpul.',
                    'Jarak larikan drum seeder: 20–25 cm antar baris.',
                    'Panen ditargetkan ' + umurTotal + ' hari sejak sebar = ' + formatTglLengkap(tglPanen) + '.'
                ]
            };
        } else {
            aktivitasBenih = {
                nama: 'Pembibitan Benih (Persemaian)', ikon: '🌱',
                deskripsi: 'Semai dimulai ' + umurBibit + ' HSS sebelum pindah tanam',
                tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips: [
                    'Inkubasi lembap 48 jam hingga kecambah 2–3 mm, lalu semai di bedeng persemaian.',
                    'Dosis semai (Tapin): 25–35 kg/ha. Pindah tanam saat bibit umur ' + umurBibit + ' HSS.',
                    '⚠️ Persemaian dimulai ' + umurBibit + ' hari lebih awal agar panen SERENTAK dengan Tabela di hamparan yang sama (target panen: ' + formatTglLengkap(tglPanen) + ').'
                ]
            };
            aktivitasTanam = {
                nama: 'Tanam Pindah ke Lahan Utama', ikon: '🌾',
                deskripsi: 'Bibit umur ' + umurBibit + ' HSS dipindah ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 3),
                risiko: risikoTanam(sk(tglTanam)),
                tips: [
                    'Umur bibit optimal: ' + umurBibit + ' HSS. Jangan melebihi ' + (umurBibit + 5) + ' HSS — bibit tua menurunkan anakan produktif.',
                    'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                    'Target panen: ' + formatTglLengkap(tglPanen) + ' (serentak dengan Tabela di hamparan yang sama).'
                ]
            };
        }

        var daftar = [
            {
                nama: 'Gropyokan & Sanitasi', ikon: '🐀',
                deskripsi: 'Gropyokan massal & bersihkan pematang',
                tglMulai: tglGropyokM, tglSelesai: tglGropyokS,
                risiko: risikoTikus(hariFaseBulan(tglGropyokM)),
                tips: [
                    'Lakukan saat lahan masih bera/kosong sebelum traktor turun.',
                    'Bersihkan gulma pematang dan tutup lubang sarang tikus aktif.'
                ]
            },
            {
                nama: 'Pengolahan Lahan', ikon: '🚜',
                deskripsi: 'Bajak, garu, pemerataan petakan',
                tglMulai: tglOlah, tglSelesai: tambahHari(tglOlah, 7),
                risiko: risikoOlah(sk(tglOlah)),
                tips: [
                    'Olah lahan utama 14 hari sebelum tanam agar gulma membusuk.',
                    'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha saat bajak pertama.'
                ]
            },
            aktivitasBenih,
            aktivitasTanam,
            {
                nama: 'Pasang & Monitor TBS', ikon: '🚧',
                deskripsi: 'Trap Barrier System untuk tangkal tikus',
                tglMulai: tglTBSM, tglSelesai: tglTBSS,
                risiko: risikoTikus(hariFaseBulan(tglTBSM)),
                tips: [
                    'Pasang TBS di sudut petakan (plastik setinggi 60 cm) bersamaan dengan waktu tanam.',
                    'Periksa bubu perangkap setiap 3–5 hari.'
                ]
            },
            {
                nama: 'Umpan Racun Tikus', ikon: '☠️',
                deskripsi: 'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglRacunM, tglSelesai: tglRacunS,
                risiko: risikoTikus(hariFaseBulan(tglRacunM)),
                tips: [
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                    'Aman dilakukan karena kanopi padi belum menutup rapat.'
                ]
            },
            {
                nama: 'Pupuk Dasar (Tahap I)', ikon: '🧪',
                deskripsi: 'NPK Phonska + Urea I — awal anakan',
                tglMulai: tglP1, tglSelesai: tambahHari(tglP1, 2),
                risiko: risikoPupuk(sk(tglP1)),
                tips: [
                    'Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                    'Sebar saat air macak-macak.'
                ]
            },
            {
                nama: 'Insektisida I (Vegetatif)', ikon: '💊',
                deskripsi: 'Pengendalian WBC, Penggerek, Sundep',
                tglMulai: tglI1, tglSelesai: tambahHari(tglI1, 2),
                risiko: risikoInsektisida(sk(tglI1), hariFaseBulan(tglI1)),
                tips: [
                    'Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                    'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.'
                ]
            },
            {
                nama: 'Pupuk Susulan I (Tahap II)', ikon: '🧪',
                deskripsi: 'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHari(tglP2, 2),
                risiko: risikoPupuk(sk(tglP2)),
                tips: [
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                    'Cek warna daun dengan BWD — skala 3+ tahan Urea.'
                ]
            },
            {
                nama: 'Pupuk Susulan II (Tahap III)', ikon: '🧪',
                deskripsi: 'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: tambahHari(tglP3, 2),
                risiko: risikoPupuk(sk(tglP3)),
                tips: [
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.'
                ]
            },
            {
                nama: 'Insektisida II (Generatif)', ikon: '💊',
                deskripsi: 'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHari(tglI2, 2),
                risiko: risikoInsektisida(sk(tglI2), hariFaseBulan(tglI2)),
                tips: [
                    'Semprot pagi hari saat walang sangit masih di tanaman.',
                    'Bahan aktif kontak: Malathion, Deltametrin.'
                ]
            },
            {
                nama: 'Fungisida Blast (Bunting)', ikon: '🍄',
                deskripsi: 'Preventif Blast Leher Malai — fase bunting',
                tglMulai: tglFung, tglSelesai: tambahHari(tglFung, 2),
                risiko: risikoFungisida(sk(tglFung)),
                tips: [
                    'Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                    'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.'
                ]
            },
            {
                nama: 'Panen 🌾 (Serentak Tapin & Tabela)', ikon: '🌟',
                deskripsi: 'Potong saat kadar air gabah 20–25% — ' + umurTotal + ' hari sejak masuk lahan',
                tglMulai: tglPanen, tglSelesai: tambahHari(tglPanen, 5),
                risiko: risikoPanen(sk(tglPanen)),
                tips: [
                    'Panen saat 90–95% gabah kuning keemasan.',
                    'Baik Tapin maupun Tabela di hamparan ini PANEN BERSAMAAN — koordinasi combine harvester lebih efisien.',
                    'Pesan combine 14 hari sebelum taksiran panen.'
                ]
            }
        ];

        daftar.sort(function (a, b) { return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    }

    /* ──────────────────────────────────────────────────────────
       GAYA BADGE SUMBER DATA (BARU v3.13)
       ─────────────────────────────────────────────────────────
       Dipakai untuk memberi warna/ikon pada label sumber data
       ENSO/IOD, supaya pengguna bisa langsung lihat apakah data
       berasal dari NOAA resmi, fallback Open-Meteo, atau statis.
    ────────────────────────────────────────────────────────── */
    function gayaSumberData(sumber) {
        var s = (sumber || '').toLowerCase();
        if (s.indexOf('resmi') !== -1)    return { warna: '#10b981', ikon: '✅' };
        if (s.indexOf('fallback') !== -1) return { warna: '#f59e0b', ikon: '⚠️' };
        return { warna: '#ef4444', ikon: '❌' }; // statis / tidak tersedia / gagal total
    }

    /* ──────────────────────────────────────────────────────────
       RENDER HTML OUTPUT
    ────────────────────────────────────────────────────────── */
    window._jtoToggle = function (headerEl) {
        var detail  = headerEl.parentElement.querySelector('.jto-detail');
        var chevron = headerEl.querySelector('.jto-chevron');
        if (!detail) return;
        var open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    };

    function renderKartu(k, nomor, isLewat) {
        var now      = new Date();
        var kegLewat = isLewat || k.tglSelesai < now;
        var w        = kegLewat ? '#64748b' : k.risiko.warna;
        var fb       = namaFaseBulan(hariFaseBulan(k.tglMulai));
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

        return '<div style="background:#1b273a;border:0.5px solid ' + (kegLewat ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)') + ';border-radius:16px;margin-bottom:9px;overflow:hidden;">' +
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

    function renderOutput(multiJadwal, zonaInfo, ensoData, iodData, metodeTanam) {
        window._jtoData     = multiJadwal;
        // [BARU v3.13] Simpan ensoData/iodData agar bisa dipakai _jtoKirimWA()
        window._jtoEnsoData = ensoData;
        window._jtoIodData  = iodData;

        var labelZona  = (zonaInfo.zona && LABEL_ZONA[zonaInfo.zona]) ? LABEL_ZONA[zonaInfo.zona] : 'MONSUNAL';
        var sumberData = zonaInfo.jarak ? zonaInfo.nama + ' (' + zonaInfo.jarak + ' km)' : zonaInfo.nama;
        var zonaTampil = labelZona + ' • ' + sumberData;

        // [BARU v3.13] Badge sumber data ENSO/IOD
        var gayaENSO = gayaSumberData(ensoData.sumber);
        var gayaIOD  = gayaSumberData(iodData.sumber);
        var sumberENSOHTML = ensoData.sumber
            ? '<div style="margin-top:3px;font-size:10px;color:' + gayaENSO.warna + ';">' + gayaENSO.ikon + ' ENSO via ' + ensoData.sumber + '</div>'
            : '';
        var sumberIODHTML = iodData.sumber
            ? '<div style="font-size:10px;color:' + gayaIOD.warna + ';">' + gayaIOD.ikon + ' IOD via ' + iodData.sumber + '</div>'
            : '';

        var html = '<div style="padding:4px 0;">' +
            '<div style="background:rgba(6,182,212,0.09);border:1px solid rgba(6,182,212,0.25);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">' +
                '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">🤖 INFORMASI IKLIM TAHUNAN</div>' +
                '<div style="display:grid;grid-template-columns:1fr;gap:8px;font-size:12px;">' +
                    '<div><span style="color:#64748b;">Zona iklim & sumber data</span><br><strong style="color:#fff;">' + zonaTampil + '</strong></div>' +
                    '<div><span style="color:#64748b;">Kondisi ENSO / IOD</span><br><strong style="color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</strong>' + sumberENSOHTML + sumberIODHTML + '</div>' +
                    '<div><span style="color:#64748b;">Metode Tanam</span><br><strong style="color:#fff;">' + (LABEL_METODE_TANAM[metodeTanam] || LABEL_METODE_TANAM.tapin) + '</strong></div>' +
                '</div>' +
            '</div>';

        multiJadwal.forEach(function (jadwal) {
            var rek = jadwal.rekomendasi;
            var keg = jadwal.kegiatan;
            var kartuHTML = keg.map(function (k, i) { return renderKartu(k, i + 1, rek.isLewat); }).join('');

            var badgeMusim = '', opacityMusim = '1';
            if (rek.isLewat) {
                badgeMusim = '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;vertical-align:middle;white-space:nowrap;">📋 Blueprint</span>';
            } else if (rek.isBerjalan) {
                badgeMusim = '<span class="jto-aktif-badge" style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);margin-left:10px;vertical-align:middle;white-space:nowrap;">🟢 Aktif</span>';
            }

            html += '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacityMusim + ';">🌾 ' + rek.musimNama.toUpperCase() + badgeMusim + '</div>';
            html += '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px;opacity:' + opacityMusim + ';">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                            '<div><span style="color:#64748b;">Masuk Lahan Utama</span><br><strong style="color:#10b981;font-size:13px;">' + formatTglLengkap(metodeTanam === 'tabela' ? rek.tglTanam : tambahHari(rek.tglTanam, -8)) + '</strong></div>' +
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
        var labelMetode = (window._jtoMetodeTanam === 'tabela')
            ? '🌾 Tanam Benih Langsung (Tabela)'
            : '🌱 Tanam Pindah (Tapin)';
        var baris = ['*KALENDER KEGIATAN TANI TAHUNAN*', '_Metode: ' + labelMetode + '_'];

        // [BARU v3.13] Sertakan sumber data ENSO/IOD di pesan WA untuk transparansi
        var ensoD = window._jtoEnsoData, iodD = window._jtoIodData;
        if (ensoD || iodD) {
            baris.push('_Sumber ENSO: ' + (ensoD && ensoD.sumber ? ensoD.sumber : '-') +
                       ' | Sumber IOD: ' + (iodD && iodD.sumber ? iodD.sumber : '-') + '_\n');
        } else {
            baris.push('');
        }

        dataArr.forEach(function (jadwal) {
            var r = jadwal.rekomendasi;
            baris.push('============================');
            baris.push('🌾 *' + r.musimNama.toUpperCase() + '*');
            baris.push('📅 Masuk Lahan: ' + formatTglLengkap(window._jtoMetodeTanam === 'tabela' ? r.tglTanam : tambahHari(r.tglTanam, -8)));
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

            // [BARU v3.13] Warning eksplisit kalau modul ENSO/IOD belum ter-load.
            // Sebelumnya kegagalan ini diam-diam jatuh ke Netral tanpa jejak apa pun
            // di console, menyulitkan debug urutan <script> yang salah.
            var adaFungsiENSO = typeof window.getENSOAnomaly === 'function';
            var adaFungsiIOD  = typeof window.getIODAnomaly  === 'function';

            if (!adaFungsiENSO) {
                console.warn(
                    '[JadwalOtomatis] ⚠️ window.getENSOAnomaly tidak ditemukan. ' +
                    'Pastikan patch_enso_iod_noaa.js di-load SEBELUM patch_jadwal_tanam_otomatis.js ' +
                    'di urutan <script> pada HTML. Menggunakan nilai ENSO Netral statis sebagai fallback darurat.'
                );
            }
            if (!adaFungsiIOD) {
                console.warn(
                    '[JadwalOtomatis] ⚠️ window.getIODAnomaly tidak ditemukan. ' +
                    'Pastikan patch_enso_iod_noaa.js di-load SEBELUM patch_jadwal_tanam_otomatis.js ' +
                    'di urutan <script> pada HTML. Menggunakan nilai IOD Netral statis sebagai fallback darurat.'
                );
            }

            var FALLBACK_DARURAT = {
                latestAnomaly: 0,
                status: 'Netral',
                statusSingkat: 'Netral',
                sumber: 'Tidak tersedia (modul ENSO/IOD tidak termuat)'
            };

            var getENSO = adaFungsiENSO ? window.getENSOAnomaly() : Promise.resolve(FALLBACK_DARURAT);
            var getIOD  = adaFungsiIOD  ? window.getIODAnomaly()  : Promise.resolve(FALLBACK_DARURAT);

            var results  = await Promise.all([getENSO, getIOD, getDataZOM(lat, lon)]);
            var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
            var ensoVal  = ensoData.latestAnomaly || 0;
            var iodVal   = iodData.latestAnomaly  || 0;

            // [BARU v3.13] Log ringkas sumber data yang benar-benar dipakai,
            // supaya gampang dicek di console saat troubleshoot.
            console.log(
                '[JadwalOtomatis] Sumber ENSO: ' + (ensoData.sumber || '-') +
                ' | Sumber IOD: ' + (iodData.sumber || '-')
            );

            setStatus('<span style="color:' + WARNA + ';">🧮 Deteksi musim & menyusun kalender...</span>');

            var skorBulan = zonaInfo.data.map(function (_, idx) {
                return skorKelembapan(idx, zonaInfo.data, ensoVal, iodVal, lat, lon);
            });

            var fungsiRekomendasi = window.rekomendasiWindowTanam || rekomendasiWindowTanam;
            var rekomendasiArr    = fungsiRekomendasi(skorBulan, zonaInfo.data, zonaInfo.zona, ensoVal, iodVal);

            var elMetodeTanam = document.getElementById('metodeTanamJTO');
            var metodeTanam   = (elMetodeTanam && elMetodeTanam.value === 'tabela') ? 'tabela' : 'tapin';
            window._jtoMetodeTanam = metodeTanam;

            var multiJadwal = rekomendasiArr.map(function (rek) {
                return {
                    rekomendasi: rek,
                    kegiatan: bangunKegiatan(rek, skorBulan, metodeTanam),
                    _skorBulan: skorBulan  // [FIX] Simpan agar patch_jadwal_tapin_tabela_fix bisa re-hitung
                };
            });

            if (statusEl) statusEl.innerHTML = '';
            if (btnJTO) {
                btnJTO.disabled = false;
                btnJTO.style.opacity = '';
                btnJTO.textContent = teksAsliBtn;
                btnJTO.classList.remove('jto-pulse');
            }

            teksEl.innerHTML = renderOutput(multiJadwal, zonaInfo, ensoData, iodData, metodeTanam);

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
        btn.textContent = 'KALENDER TNM';
        btn.onclick     = function () { switchMode('jadwaltanam'); };
        var tabPertama = tabContainer.firstElementChild;
        if (tabPertama) tabContainer.insertBefore(btn, tabPertama);
        else            tabContainer.appendChild(btn);
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
                '<strong style="color:' + WARNA + ';display:block;margin-bottom:5px;">Kalender Rekomendasi Tanam Dinamis Tahunan</strong>' +
                '<span style="font-size:0.78rem;color:#cbd5e1;line-height:1.6;">' +
                    'Sistem akan memindai ZOM lokal, membaca data ENSO/IOD, lalu secara cerdas mendeteksi bulan terbaik untuk Musim Utama (Rendeng) dan Musim Kedua (Gadu) di wilayah Anda.' +
                '</span>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:14px;">' +
                '<label class="form-label">🌱 METODE TANAM</label>' +
                '<select id="metodeTanamJTO" class="form-select" style="margin-bottom:0;">' +
                    '<option value="tapin">Tanam Pindah (Tapin — Persemaian)</option>' +
                    '<option value="tabela">Tanam Benih Langsung (Tabela)</option>' +
                '</select>' +
            '</div>' +
            '<button id="btnJadwalOtomatis" class="jto-pulse" style="' +
                'width:100%;padding:15px;background:linear-gradient(135deg,' + WARNA + ',#0891b2);' +
                'color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;margin-bottom:16px;' +
            '">ANALISIS & LIHAT JADWAL OTOMATIS</button>' +
            '<div id="jtoStatus" style="text-align:center;padding:4px 0 10px;font-size:13px;min-height:24px;"></div>' +
            '<div id="jtoHasil" style="display:none;"><div id="jtoTeks"></div></div>';

        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && boxKalender.parentNode) {
            boxKalender.parentNode.insertBefore(box, boxKalender.nextSibling);
        } else {
            card.appendChild(box);
        }
        document.getElementById('btnJadwalOtomatis').addEventListener('click', function () {
            // [FIX] Panggil lewat window.prosesJadwalOtomatis agar patch_jadwal_tapin_tabela_fix
            //       dapat mengoverride fungsi ini. Sebelumnya memanggil closure lokal secara
            //       langsung sehingga override dari luar tidak pernah efektif.
            (window.prosesJadwalOtomatis || prosesJadwalOtomatis)();
        });
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
                if (titleEl) { titleEl.innerText = '📅 Kalender Jadwal Tanam'; titleEl.style.color = WARNA; }
                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl)  { subEl.innerText = ''; subEl.style.display = 'none'; }
                document.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
                if (tabJTO) tabJTO.classList.add('active');
                // Auto-trigger SENGAJA DIHAPUS — analisis hanya jalan saat tombol dipencet manual.
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
        // [FIX] Expose prosesJadwalOtomatis ke window agar patch_jadwal_tapin_tabela_fix
        //       bisa meng-override-nya. Sebelumnya fungsi ini private (IIFE closure)
        //       sehingga override dari luar tidak pernah berjalan (dead code).
        window.prosesJadwalOtomatis = prosesJadwalOtomatis;
        console.log('%c✅ patch_jadwal_tanam_otomatis.js v3.13 aktif — transparansi sumber data ENSO/IOD ditambahkan', 'color:' + WARNA + ';font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
