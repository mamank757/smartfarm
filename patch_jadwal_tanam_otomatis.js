/**
 * ============================================================
 *  patch_jadwal_tanam_otomatis.js
 *  Versi: 4.0 — Integrasi Penuh + Animasi Tombol Berdenyut
 * ------------------------------------------------------------
 *  PERBAIKAN UTAMA v4.0 vs v3.0:
 *
 *  [1] UNIFIKASI ENGINE KALKULASI
 *      ❌ v3.0: Menulis ulang BOBOT_MONSUNAL/EKUATORIAL sendiri
 *               → dua sumber kebenaran berbeda dengan patch_risiko_iklim.js
 *      ✅ v4.0: Pakai hitungWetnessScore() dari patch_risiko_iklim.js
 *               → 1 sumber kebenaran, bobot ilmiah Aldrian & Susanto (2003)
 *               → Fallback ke tabel internal jika patch belum dimuat
 *
 *  [2] normalisasiCurahHujan BERMUSIM
 *      ❌ v3.0: Memanggil normalisasiCurahHujan(value) tanpa bulanIndex
 *               → threshold rendeng vs gadu diperlakukan sama
 *      ✅ v4.0: Memanggil normalisasiCurahHujan(value, bulanIndex)
 *               → patch_perbaikan_ilmiah.js langsung aktif
 *
 *  [3] DATA CUACA REALTIME → RISIKO PER KEGIATAN
 *      ❌ v3.0: Kartu kegiatan hanya pakai prediksi statistik iklim
 *      ✅ v4.0: Inject data aktual (suhu, RH, hujan, skor hama/blast)
 *               dari patch_cuaca_langsung.js state jika tersedia
 *               → Peringatan "hidup" berbasis kondisi nyata
 *
 *  [4] KOREKSI SST LOKAL → SKORING MUSIM TANAM
 *      ❌ v3.0: nilaiTotal tidak mempertimbangkan upwelling/anomali SST
 *      ✅ v4.0: Jika sstMksTerkini < 27°C di Jun–Okt (upwelling aktif),
 *               nilaiTotal dikurangi 10 poin (risiko kekeringan naik)
 *               Jika sstBone > 29°C di musim barat, nilaiTotal naik 5 poin
 *
 *  [5] SINKRONISASI LINTAS TAB
 *      ❌ v3.0: tglTanam hasil rekomendasi tidak ditulis ke tab lain
 *      ✅ v4.0: Setelah jadwal dihitung, tulis otomatis ke:
 *               - #tglTanamCuaca, #inputTglTanam (tab cuaca & kalender)
 *               - window._lokasiKalender (agar tab kalender bisa pakai GPS sama)
 *               → User tidak perlu isi ulang di setiap tab
 *
 *  [6] ANIMASI TOMBOL BERDENYUT (PULSE RADAR)
 *      ❌ v3.0: Tombol statis, tidak ada feedback visual
 *      ✅ v4.0: Tombol berdenyut seperti radar saat idle
 *               Bergerak berputar saat sedang memproses
 *               Efek ripple saat diklik
 *               Badge "BARU" muncul jika data belum dianalisis
 *
 *  Dependensi (dimuat lebih dulu):
 *    - getENSOAnomaly()          (patch_enso_iod_noaa.js)
 *    - getIODAnomaly()           (patch_enso_iod_noaa.js)
 *    - hitungWetnessScore()      (patch_risiko_iklim.js) — opsional, ada fallback
 *    - normalisasiCurahHujan()   (patch_perbaikan_ilmiah.js / HTML utama)
 *    - hitungJarakHaversine()    (HTML utama)
 *    - getFallbackSST()          (HTML utama)
 *    - URL_ZOM_LOKAL             (HTML utama)
 *
 *  Referensi ilmiah:
 *    - BB Padi (2019): kalender tanam berbasis iklim
 *    - BMKG (2023): ZOM zona iklim
 *    - Aldrian & Susanto (2003): bobot ENSO per zona
 *    - Nur'utami & Hidayat (2016): amplifikasi IOD saat El Nino
 *    - Baehaki & Mejaya (2014): siklus hama vs fase bulan
 *    - Kunarso et al. (2022): SST Selat Makassar & upwelling
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
       [FIX-1] ENGINE KALKULASI TERPADU
       Tabel bobot internal sebagai fallback jika patch_risiko_iklim
       belum dimuat. Nilainya diselaraskan dengan BOBOT_IKLIM di
       patch_risiko_iklim.js (Aldrian & Susanto 2003).
    ────────────────────────────────────────────────────────── */
    var _BOBOT_INTERNAL = {
        monsunal: {
            enso: [0.15,0.15,0.12,0.10,0.18,0.35,0.45,0.50,0.45,0.35,0.20,0.15],
            iod:  [0.10,0.10,0.08,0.08,0.12,0.20,0.28,0.38,0.40,0.30,0.15,0.10]
        },
        ekuatorial: {
            enso: [0.10,0.10,0.08,0.08,0.10,0.15,0.18,0.20,0.18,0.15,0.10,0.10],
            iod:  [0.20,0.18,0.15,0.12,0.15,0.22,0.30,0.42,0.48,0.38,0.25,0.20]
        },
        lokal: {
            enso: [0.12,0.12,0.10,0.10,0.12,0.18,0.22,0.28,0.25,0.20,0.15,0.12],
            iod:  [0.08,0.08,0.08,0.08,0.10,0.12,0.15,0.20,0.22,0.18,0.12,0.08]
        },
        peralihan: {
            enso: [0.12,0.12,0.10,0.10,0.14,0.22,0.30,0.35,0.30,0.25,0.16,0.12],
            iod:  [0.14,0.12,0.10,0.10,0.12,0.18,0.22,0.30,0.33,0.25,0.18,0.14]
        }
    };

    function deteksiPolaZOM(lat, lon) {
        if (lon >= 128)                                  return 'lokal';
        if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) return 'ekuatorial';
        if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) return 'peralihan';
        return 'monsunal';
    }

    var NAMA_POLA_TAMPILAN = {
        monsunal:'Monsunal', ekuatorial:'Ekuatorial',
        lokal:'Lokal',       peralihan:'Peralihan'
    };

    /* ──────────────────────────────────────────────────────────
       [FIX-1] skorKelembapan — TERPADU DENGAN patch_risiko_iklim
       Prioritas 1: window.hitungWetnessScore() dari patch_risiko_iklim.js
       Prioritas 2: Kalkulasi internal dengan bobot _BOBOT_INTERNAL
    ────────────────────────────────────────────────────────── */
    function skorKelembapan(bulanIdx, baselineArr, ensoVal, iodVal, lat, lon) {
        // [FIX-2] Normalisasi bermusim — kirim bulanIdx agar patch_perbaikan_ilmiah
        // dapat membedakan threshold rendeng vs gadu
        var norm = window.normalisasiCurahHujan || function(v) {
            return v < 30 ? -1.5 : v < 75 ? -0.8 : v < 150 ? 0.0 : v < 250 ? 0.8 : 1.5;
        };

        var bl  = baselineArr[bulanIdx];
        var idx = bl > 10 ? norm(bl, bulanIdx) : bl;  // [FIX-2] kirim bulanIdx

        var wetnessScore;

        // [FIX-1] Coba pakai hitungWetnessScore dari patch_risiko_iklim dulu
        if (typeof window.hitungWetnessScore === 'function' && lat && lon) {
            wetnessScore = window.hitungWetnessScore(idx, ensoVal, iodVal, lat, lon, bulanIdx);
        } else {
            // Fallback: kalkulasi internal dengan bobot terpadu
            var pola = deteksiPolaZOM(lat || -4, lon || 120);
            var w    = _BOBOT_INTERNAL[pola] || _BOBOT_INTERNAL.monsunal;
            var wE   = w.enso[bulanIdx];
            var wI   = w.iod[bulanIdx];
            var tot  = 1 + wE + wI;
            wetnessScore = (idx / tot) - (ensoVal * wE / tot) - (iodVal * wI / tot);
        }

        // Konversi wetnessScore (-1.5..+1.5) → skor 0–100 (50 = normal)
        return Math.max(0, Math.min(100, Math.round(50 + wetnessScore * 25)));
    }

    /* ──────────────────────────────────────────────────────────
       [FIX-3] AMBIL DATA CUACA REALTIME DARI STATE PATCH CUACA
       Membaca state internal patch_cuaca_langsung.js (versi 2.4)
       untuk mendapatkan parameter aktual per bulan kegiatan.
    ────────────────────────────────────────────────────────── */
    function getCuacaAktual() {
        // patch_cuaca_langsung.js menyimpan state di closure,
        // tapi mengekspos dataForecast via window._koordinatTerakhir
        // dan data cuaca via elemen DOM yang sudah diisi.
        var aktual = {
            suhu:       null,
            kelembapan: null,
            hujan:      null,
            skorBlast:  null,
            skorWereng: null,
            skorTungro: null,
            tersedia:   false
        };

        try {
            // Coba baca dari elemen DOM yang sudah diisi loadWeather()
            var elSuhu = document.getElementById('suhuNow');
            var elRH   = document.getElementById('humidityNow');
            var elHujan = document.getElementById('rainNow');

            if (elSuhu && elSuhu.innerText && elSuhu.innerText !== '-') {
                aktual.suhu       = parseFloat(elSuhu.innerText);
                aktual.kelembapan = parseFloat(document.getElementById('humidityNow').innerText);
                aktual.hujan      = parseFloat(document.getElementById('rainNow').innerText) || 0;
                aktual.tersedia   = true;
            }

            // Coba hitung skor hama/penyakit jika fungsi tersedia
            if (aktual.tersedia && aktual.suhu) {
                var faseDummy = { fase: 'Generatif', umurHari: 55 };
                if (typeof window.hitungRisikoSheathBlight === 'function') {
                    aktual.skorBlast = window.hitungRisikoSheathBlight(
                        aktual.suhu, aktual.kelembapan, faseDummy).skor;
                }
                if (typeof window.hitungRisikoWereng === 'function') {
                    aktual.skorWereng = window.hitungRisikoWereng(
                        aktual.suhu, aktual.kelembapan, aktual.hujan, faseDummy).skor;
                }
                if (typeof window.hitungRisikoTungro === 'function') {
                    aktual.skorTungro = window.hitungRisikoTungro(
                        aktual.suhu, aktual.kelembapan, aktual.hujan, faseDummy).skor;
                }
            }
        } catch(e) {
            console.warn('[JadwalTanam v4] getCuacaAktual:', e.message);
        }

        return aktual;
    }

    /* ──────────────────────────────────────────────────────────
       [FIX-4] KOREKSI SST LOKAL KE NILAI MUSIM TANAM
       Kurangi nilaiTotal jika upwelling aktif (risiko kekeringan naik)
       Tambah nilaiTotal jika SST Bone hangat di musim barat
       Sumber: Kunarso et al. (2022) — SST Selat Makassar
    ────────────────────────────────────────────────────────── */
    function koreksiSST(nilaiTotal, bTanamIdx) {
        var korVal = nilaiTotal;
        try {
            // Baca SST terkini dari elemen DOM yang diisi showSSTRekomendasi()
            var elStatus = document.getElementById('localWarningStatus');
            if (!elStatus) return korVal;

            var teks = elStatus.innerText || '';

            // Deteksi upwelling aktif: Jun–Okt (5–9) + SST Selat < 27.5°C
            var bulanSekarang = new Date().getMonth();
            var musimTimur    = bulanSekarang >= 5 && bulanSekarang <= 9;

            if (musimTimur && teks.includes('Upwelling')) {
                // Upwelling aktif: musim gadu lebih kering → kurangi nilai
                // Dampak paling besar jika bulan tanam = musim gadu (Apr–Sep)
                var bTanamGadu = bTanamIdx >= 3 && bTanamIdx <= 8;
                korVal -= bTanamGadu ? 12 : 5;
            }

            // SST Bone hangat (musim barat, Nov–Mar) → potensi hujan lebih tinggi
            if (!musimTimur && teks.includes('°C')) {
                var matchBone = teks.match(/Bone:\s*([\d.]+)/);
                if (matchBone && parseFloat(matchBone[1]) >= 29.0) {
                    korVal += 5;
                }
            }
        } catch(e) {}

        return Math.max(0, Math.min(100, korVal));
    }

    /* ──────────────────────────────────────────────────────────
       UTILITAS TANGGAL & BULAN
    ────────────────────────────────────────────────────────── */
    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
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
        if (h < 1.5)  return { nama:'Bulan Mati',       ikon:'🌑' };
        if (h < 7.4)  return { nama:'Bulan Sabit Muda', ikon:'🌒' };
        if (h < 8.4)  return { nama:'Kuartal Pertama',  ikon:'🌓' };
        if (h < 14.8) return { nama:'Bulan Cembung',    ikon:'🌔' };
        if (h < 15.8) return { nama:'Bulan Penuh',      ikon:'🌕' };
        if (h < 22.1) return { nama:'Bulan Cembung',    ikon:'🌖' };
        if (h < 23.1) return { nama:'Kuartal Ketiga',   ikon:'🌗' };
        if (h < 29.0) return { nama:'Bulan Sabit Tua',  ikon:'🌘' };
        return                { nama:'Bulan Mati',       ikon:'🌑' };
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
       DATA ZOM
    ────────────────────────────────────────────────────────── */
    var _cacheZOM = null;

    async function getDataZOM(lat, lon) {
        if (_cacheZOM) return _cacheZOM;

        var pola = deteksiPolaZOM(lat, lon);
        var fallback = {
            data: [0,0,0,0,0,0,0,0,0,0,0,0],
            nama: 'Estimasi Pola ' + NAMA_POLA_TAMPILAN[pola] + ' (data ZOM lokal tidak ditemukan)',
            jarak: null,
            pola: pola,
            lat: lat,
            lon: lon
        };

        try {
            var urlZOM = window.URL_ZOM_LOKAL || '';
            if (!urlZOM) return fallback;

            var res  = await fetch(urlZOM);
            var data = await res.json();
            var arr  = Array.isArray(data.data) ? data.data :
                       Array.isArray(data)       ? data : null;
            if (!arr) return fallback;

            var haversine = window.hitungJarakHaversine || function() { return 999; };
            var jMin = Infinity, kab = null;
            arr.forEach(function(k) {
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
                    data: keys.map(function(k) { return parseFloat(kab[k]) || 0; }),
                    nama: kab.kabupaten_kota || 'Lokal',
                    jarak: jMin.toFixed(1),
                    pola: pola,
                    lat: lat,
                    lon: lon
                };
                return _cacheZOM;
            }
        } catch(e) {
            console.warn('[JadwalTanam v4] ZOM:', e.message);
        }
        return fallback;
    }

    /* ──────────────────────────────────────────────────────────
       MESIN REKOMENDASI WINDOW TANAM — DENGAN KOREKSI SST [FIX-4]
    ────────────────────────────────────────────────────────── */
    function rekomendasiWindowTanam(skorBulan, lat, lon) {
        var now           = new Date();
        var bulanSekarang = now.getMonth();
        var tahunSekarang = now.getFullYear();

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST)',   panen:90,  persenGen:0.55 },
            { kode:'sedang', label:'Sedang (95–115 HST)',  panen:110, persenGen:0.55 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST)',   panen:125, persenGen:0.55 }
        ];

        function jarakSirkular(a, b) {
            var d = Math.abs(a - b) % 12;
            return d > 6 ? 12 - d : d;
        }

        var nilaiPerBulan = [];

        for (var bTanam = 0; bTanam <= 11; bTanam++) {
            var skorTanam = skorBulan[bTanam];
            if (skorTanam < 15) { nilaiPerBulan.push(null); continue; }

            var terbaikVar = null;

            varianArr.forEach(function(v) {
                var hariGen   = Math.floor(v.panen * v.persenGen);
                var bGenIdx   = (bTanam + Math.floor(hariGen  / 30)) % 12;
                var bPanenIdx = (bTanam + Math.floor(v.panen  / 30)) % 12;
                var skorGen   = skorBulan[bGenIdx];
                var skorPanen = skorBulan[bPanenIdx];

                var nilaiGen   = 100 - Math.abs(skorGen - 40);
                var nilaiPanen = 100 - skorPanen;
                var nilaiTotal = (nilaiGen * 0.55) + (nilaiPanen * 0.45);

                // [FIX-4] Koreksi SST ke nilai musim tanam
                nilaiTotal = koreksiSST(nilaiTotal, bTanam);

                var bVeg1 = (bTanam + 1) % 12;
                if (skorBulan[bVeg1] < 20) nilaiTotal -= 15;

                if (!terbaikVar || nilaiTotal > terbaikVar.nilaiTotal) {
                    terbaikVar = {
                        nilaiTotal:     nilaiTotal,
                        varietas:       v.kode,
                        labelVar:       v.label,
                        skorTanam:      skorTanam,
                        skorGen:        skorGen,
                        skorPanen:      skorPanen,
                        namaBulanGen:   NAMA_BULAN[bGenIdx],
                        namaBulanPanen: NAMA_BULAN[bPanenIdx]
                    };
                }
            });

            nilaiPerBulan.push(terbaikVar);
        }

        var adaKandidat = nilaiPerBulan.some(function(x) { return x !== null; });
        if (!adaKandidat) {
            return {
                tglTanam : tambahHari(now, 14),
                varietas : 'sedang',
                labelVar : 'Sedang (95–115 HST)',
                alasan   : 'Seluruh 12 bulan menunjukkan kondisi kering ekstrem. Pertimbangkan pompanisasi penuh atau palawija.'
            };
        }

        var idxMusimA = -1, nilaiMaxA = -Infinity;
        for (var i = 0; i <= 11; i++) {
            if (nilaiPerBulan[i] && nilaiPerBulan[i].nilaiTotal > nilaiMaxA) {
                nilaiMaxA = nilaiPerBulan[i].nilaiTotal;
                idxMusimA = i;
            }
        }

        var idxMusimB = -1, nilaiMaxB = -Infinity;
        for (var j = 0; j <= 11; j++) {
            if (!nilaiPerBulan[j]) continue;
            if (jarakSirkular(j, idxMusimA) < 4) continue;
            if (nilaiPerBulan[j].nilaiTotal > nilaiMaxB) {
                nilaiMaxB = nilaiPerBulan[j].nilaiTotal;
                idxMusimB = j;
            }
        }

        function hitungOffsetDanTahun(bTanam) {
            var offset    = (bTanam - bulanSekarang + 12) % 12;
            var tahunTanam = tahunSekarang + Math.floor((bulanSekarang + offset) / 12);
            return { offset: offset, tahun: tahunTanam };
        }

        var infoA = hitungOffsetDanTahun(idxMusimA);
        var infoB = idxMusimB >= 0 ? hitungOffsetDanTahun(idxMusimB) : null;

        var pilihUtama, pilihAlternatif;
        if (infoB && infoB.offset < infoA.offset) {
            pilihUtama       = { idx: idxMusimB, info: infoB, data: nilaiPerBulan[idxMusimB] };
            pilihAlternatif  = { idx: idxMusimA, info: infoA, data: nilaiPerBulan[idxMusimA] };
        } else {
            pilihUtama       = { idx: idxMusimA, info: infoA, data: nilaiPerBulan[idxMusimA] };
            pilihAlternatif  = idxMusimB >= 0
                ? { idx: idxMusimB, info: infoB, data: nilaiPerBulan[idxMusimB] }
                : null;
        }

        var best        = pilihUtama.data;
        var bTanamFinal = pilihUtama.idx;
        var tahunFinal  = pilihUtama.info.tahun;
        var offsetFinal = pilihUtama.info.offset;

        var tglAwalBulan = tanggalDariBulanTahun(bTanamFinal, tahunFinal);
        var tglFaseBaik  = cariTglFaseBulan(tglAwalBulan, 3, 8, 0);
        if (tglFaseBaik.getMonth() !== bTanamFinal)
            tglFaseBaik = cariTglFaseBulan(tambahHari(tglAwalBulan, 7), 3, 8, 0);
        if (tglFaseBaik.getMonth() !== bTanamFinal)
            tglFaseBaik = new Date(tahunFinal, bTanamFinal, 10);

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

        if (pilihAlternatif) {
            alasan += ' 📅 Musim tanam alternatif: ' +
                      NAMA_BULAN[pilihAlternatif.idx] + ' ' + pilihAlternatif.info.tahun +
                      ' (nilai iklim: ' + pilihAlternatif.data.nilaiTotal.toFixed(0) + '/100).';
        }
        if (offsetFinal > 2) {
            alasan += ' ⚠️ Waktu tanam optimal masih ' + offsetFinal +
                      ' bulan ke depan. Pertimbangkan palawija (jagung/kedelai) untuk mengisi musim antara.';
        }

        return {
            tglTanam: tglFaseBaik,
            varietas: best.varietas,
            labelVar: best.labelVar,
            alasan:   alasan
        };
    }

    /* ──────────────────────────────────────────────────────────
       KALKULASI RISIKO PER KEGIATAN
       [FIX-3] Fungsi risiko kini juga mempertimbangkan data aktual
    ────────────────────────────────────────────────────────── */
    function risikoOlah(skor, aktual) {
        // Jika data cuaca aktual tersedia dan suhu ekstrem, tambahkan peringatan
        var catatanEkstra = '';
        if (aktual.tersedia && aktual.suhu > 35) catatanEkstra = ' Suhu terik ' + aktual.suhu.toFixed(0) + '°C — hindari bajak siang hari.';

        if (skor < 25) return { level:'Kering',       catatan:'Siapkan pompanisasi awal sebelum bajak.' + catatanEkstra, warna:'#ef4444' };
        if (skor > 80) return { level:'Sangat Basah', catatan:'Tunggu lahan bisa diluku — hindari traktor amblas.' + catatanEkstra, warna:'#3b82f6' };
        return               { level:'Baik',          catatan:'Kondisi optimal untuk bajak dan garu.' + catatanEkstra, warna:'#10b981' };
    }
    function risikoBenih(skor) {
        if (skor > 75) return { level:'Waspada',     catatan:'Buat drainase bedeng persemaian — cegah rebah semai.', warna:'#f59e0b' };
        if (skor < 25) return { level:'Siram Rutin', catatan:'Siram pagi & sore untuk jaga kelembapan media semai.', warna:'#f59e0b' };
        return               { level:'Optimal',      catatan:'Cuaca mendukung perkecambahan benih.', warna:'#10b981' };
    }
    function risikoTanam(skor) {
        if (skor > 80) return { level:'Genangan',      catatan:'Siapkan pompa — jaga kedalaman air 2–3 cm saja.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Kritis', catatan:'Tunda atau siapkan pompanisasi penuh.', warna:'#ef4444' };
        return               { level:'Baik',           catatan:'Kondisi air mendukung penanaman.', warna:'#10b981' };
    }
    function risikoTikus(faseBulan) {
        if (faseBulan < 4 || faseBulan > 25)
            return { level:'Optimal',       catatan:'Malam gelap — umpan antikoagulan maksimal efektif.', warna:'#10b981' };
        return { level:'Kurang Optimal', catatan:'Bulan bercahaya — tetap pasang TBS & gropyokan.', warna:'#f59e0b' };
    }
    function risikoPupuk(skor) {
        if (skor > 75) return { level:'Risiko Tercuci', catatan:'Hindari hari hujan — pupuk 1–2 hari sebelum hujan ringan.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Tanah Kering',  catatan:'Pastikan ada air di petakan sebelum tabur pupuk.', warna:'#ef4444' };
        return               { level:'Optimal',        catatan:'Cuaca mendukung serapan pupuk.', warna:'#10b981' };
    }

    /* [FIX-3] Insektisida kini memakai skor wereng aktual jika tersedia */
    function risikoInsektisida(skor, faseBulan, aktual) {
        var level = 'Baik', warna = '#10b981', catatan = '';

        // Jika data cuaca aktual tersedia, gabungkan dengan skor wereng realtime
        if (aktual.tersedia && aktual.skorWereng !== null) {
            var skorGab = (skor + aktual.skorWereng) / 2;
            if (skorGab >= 65) {
                catatan = '⚡ Skor wereng realtime: ' + aktual.skorWereng + '/100. ';
                warna   = '#ef4444'; level = 'Waspada Aktif';
            } else if (skorGab >= 40) {
                catatan = 'Pantau wereng minggu ini (skor realtime ' + aktual.skorWereng + '). ';
                warna   = '#f59e0b'; level = 'Siaga';
            }
        } else {
            if (skor > 75) { catatan = 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
        }

        if (faseBulan >= 13 && faseBulan <= 17) {
            catatan += 'Puncak penerbangan ngengat PBP — pasang lampu perangkap.';
            warna = '#ef4444'; level = 'Waspada';
        } else if (faseBulan >= 12 && faseBulan <= 18) {
            catatan += 'Mendekati bulan penuh — pantau kelompok telur PBP.';
            if (warna !== '#ef4444') { warna = '#f59e0b'; level = 'Siaga'; }
        } else if (!catatan.includes('Puncak')) {
            catatan += 'Waktu aplikasi aman dari puncak ngengat.';
        }

        return { level: level, catatan: catatan.trim(), warna: warna };
    }

    /* [FIX-3] Fungisida memakai skor Blast aktual jika tersedia */
    function risikoFungisida(skor, aktual) {
        var skorFinal = skor;
        var catatanEkstra = '';

        if (aktual.tersedia && aktual.skorBlast !== null) {
            skorFinal     = Math.round((skor + aktual.skorBlast) / 2);
            catatanEkstra = ' (Skor Blast realtime: ' + aktual.skorBlast + '/100)';
        }

        if (skorFinal > 65) return { level:'Kritis Blast', catatan:'Cuaca lembap — semprot Tricyclazole 7 hari sebelum bunting.' + catatanEkstra, warna:'#ef4444' };
        if (skorFinal > 45) return { level:'Waspada',      catatan:'Pantau bercak belah ketupat — semprot preventif.' + catatanEkstra, warna:'#f59e0b' };
        return                     { level:'Aman',         catatan:'Risiko blast rendah — cukup monitoring rutin.' + catatanEkstra, warna:'#10b981' };
    }

    function risikoPanen(skor) {
        if (skor > 75) return { level:'Sulit Kering',  catatan:'Siapkan dryer — jangan tumpuk gabah lembap.', warna:'#ef4444' };
        if (skor > 55) return { level:'Waspada Hujan', catatan:'Panen pagi hari — hindari sore hujan.', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Ideal',  catatan:'Kondisi sempurna — pesan combine 14 hari sebelumnya.', warna:'#10b981' };
        return               { level:'Baik',           catatan:'Koordinasikan combine harvester.', warna:'#10b981' };
    }

    /* ──────────────────────────────────────────────────────────
       BANGUN DAFTAR KEGIATAN [FIX-3] — inject data aktual
    ────────────────────────────────────────────────────────── */
    function bangunKegiatan(tglTanam, varietas, skorBulan, aktual) {
        aktual = aktual || { tersedia: false };

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

        [tglI1, tglI2].forEach(function(t, idx) {
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
                risiko: risikoOlah(sk(tglOlah), aktual),
                tips:['Olah 14 hari sebelum tanam agar gulma terbenam sempurna.',
                      'pH < 5,5 → tambahkan dolomit 500–1.000 kg/ha.',
                      'Cek saluran irigasi dan perbaiki pematang bocor.']
            },
            {
                nama:'Pembibitan Benih', ikon:'🌱',
                deskripsi:'Seleksi, rendam, kecambah, semai',
                tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
                risiko: risikoBenih(sk(tglBenih)),
                tips:['Rendam benih 24 jam — buang yang mengapung.',
                      'Inkubasi lembap 48 jam hingga kecambah 2–3 mm.',
                      'Dosis semai: 25–35 kg/ha (tapin) atau 50–100 kg/ha (tabela).']
            },
            {
                nama:'Pasang TBS & Gropyokan', ikon:'🐀',
                deskripsi:'Trap Barrier System + gropyokan massal',
                tglMulai: tglTBS, tglSelesai: tambahHari(tglTBS, 3),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:['Pasang TBS di sudut petakan — plastik setinggi 60 cm.',
                      'Gropyokan minimal 3 petani (efek pengusir massal).',
                      'Bersihkan semak dan jerami sisa panen di pematang.']
            },
            {
                nama:'Tanam Pindah / Tabela', ikon:'🌾',
                deskripsi:'Penanaman bibit ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 3),
                risiko: risikoTanam(sk(tglTanam)),
                tips:['Umur bibit optimal: 14–21 HSS (tapin).',
                      'Jarak Legowo 2:1: (25 × 12,5) × 50 cm.',
                      '2–3 bibit/lubang, kedalaman 2–3 cm.']
            },
            {
                nama:'Umpan Racun Tikus', ikon:'☠️',
                deskripsi:'Rodentisida antikoagulan di liang aktif',
                tglMulai: tglTikusA, tglSelesai: tambahHari(tglTikusA, 5),
                risiko: risikoTikus(hariFaseBulan(tglTikusA)),
                tips:['Gunakan Brodifacoum / Bromadiolon (antikoagulan).',
                      'Tempatkan dalam bait station di mulut liang.',
                      'Pasang malam hari — periksa & ganti tiap 3–4 hari.',
                      'JANGAN di dekat saluran air atau kolam ikan!']
            },
            {
                nama:'Pemupukan Tahap I (Dasar)', ikon:'🧪',
                deskripsi:'NPK Phonska + Urea I — awal anakan',
                tglMulai: tglP1, tglSelesai: tambahHari(tglP1, 2),
                risiko: risikoPupuk(sk(tglP1)),
                tips:['Dosis: Urea 1/3 total + Phonska 1/2 total per ha.',
                      'Sebar saat air macak-macak.',
                      'Jangan pupuk saat angin kencang atau menjelang hujan lebat.']
            },
            {
                nama:'Insektisida I (Vegetatif)', ikon:'💊',
                deskripsi:'Pengendalian WBC, Penggerek, Sundep',
                tglMulai: tglI1, tglSelesai: tambahHari(tglI1, 2),
                risiko: risikoInsektisida(sk(tglI1), hariFaseBulan(tglI1), aktual),
                tips:['Semprot hanya jika WBC > 10 ekor/rumpun (ambang PHT).',
                      'Bahan aktif: Imidakloprid, BPMC, atau Buprofezin.',
                      'Semprot pagi (07.00–10.00) — arahkan nozzle ke pangkal batang.']
            },
            {
                nama:'Pemupukan Tahap II (Susulan I)', ikon:'🧪',
                deskripsi:'Urea II + Phonska II — anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHari(tglP2, 2),
                risiko: risikoPupuk(sk(tglP2)),
                tips:['Dosis: Urea 2/3 sisa + Phonska 1/4 total per ha.',
                      'Cek warna daun dengan BWD — skala 3+ tahan Urea.',
                      'Pemupukan terpenting untuk jumlah anakan produktif.']
            },
            {
                nama:'Pemupukan Tahap III (Susulan II)', ikon:'🧪',
                deskripsi:'Phonska III ± Urea III — menjelang bunting',
                tglMulai: tglP3, tglSelesai: tambahHari(tglP3, 2),
                risiko: risikoPupuk(sk(tglP3)),
                tips:['Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1–2 saja).',
                      'Jika BWD skala 4–5, SKIP Urea tahap ini.',
                      'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia.']
            },
            {
                nama:'Insektisida II (Generatif)', ikon:'💊',
                deskripsi:'Walang Sangit, Beluk — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHari(tglI2, 2),
                risiko: risikoInsektisida(sk(tglI2), hariFaseBulan(tglI2), aktual),
                tips:['Semprot pagi hari saat walang sangit masih di tanaman.',
                      'Bahan aktif kontak: Malathion, Deltametrin.',
                      'Tambah fungisida jika ada gejala Hawar Pelepah.']
            },
            {
                nama:'Fungisida Blast (Bunting)', ikon:'🍄',
                deskripsi:'Preventif Blast Leher Malai — fase bunting',
                tglMulai: tglFung, tglSelesai: tambahHari(tglFung, 2),
                risiko: risikoFungisida(sk(tglFung), aktual),
                tips:['Semprot 5–7 hari SEBELUM atau SAAT malai keluar (10–50%).',
                      'Bahan aktif: Tricyclazole 0,5 l/ha atau Isoprothiolane 1–1,5 l/ha.',
                      'Ulangi 14 hari kemudian jika cuaca masih lembap.']
            },
            {
                nama:'Panen', ikon:'🌟',
                deskripsi:'Potong saat kadar air gabah 20–25%',
                tglMulai: tglPanen, tglSelesai: tambahHari(tglPanen, 5),
                risiko: risikoPanen(sk(tglPanen)),
                tips:['Panen saat 90–95% gabah kuning keemasan.',
                      'Kadar air potong: 20–25% → segera keringkan ke 14%.',
                      'Pesan combine 14 hari sebelum taksiran panen.',
                      'Jual ke penggilingan dengan timbangan bersertifikat.']
            }
        ];
    }

    /* ──────────────────────────────────────────────────────────
       RENDER KARTU KEGIATAN
    ────────────────────────────────────────────────────────── */
    window._jtoToggle = function(headerEl) {
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
        var tipsHTML = k.tips.map(function(t) {
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
       [FIX-5] SINKRONISASI LINTAS TAB
    ────────────────────────────────────────────────────────── */
    function sinkronisasiLintsTab(tglTanam, varietas) {
        try {
            // Format tanggal ke YYYY-MM-DD untuk elemen <input type="date">
            var tglStr = tglTanam.toISOString().split('T')[0];

            // Sinkron ke tab Cuaca
            var elTglCuaca = document.getElementById('tglTanamCuaca');
            if (elTglCuaca && !elTglCuaca.value) {
                elTglCuaca.value = tglStr;
                elTglCuaca.dispatchEvent(new Event('change'));
            }

            // Sinkron ke tab Kalender Iklim
            var elTglKalender = document.getElementById('inputTglTanam');
            if (elTglKalender && !elTglKalender.value) {
                elTglKalender.value = tglStr;
            }

            // Sinkron ke tab Pupuk
            var elTglPupuk = document.getElementById('tanggalTanam');
            if (elTglPupuk && !elTglPupuk.value) {
                elTglPupuk.value = tglStr;
            }

            // Sinkron varietas ke kalender
            var elUmurKalender = document.getElementById('umurVarietasKalender');
            if (elUmurKalender) elUmurKalender.value = varietas;

            // Sinkron varietas ke tab cuaca
            var elUmurCuaca = document.getElementById('umurVarietasCuaca');
            if (elUmurCuaca) elUmurCuaca.value = varietas;

            console.log('[JadwalTanam v4] Sinkronisasi lintas tab OK — tgl:', tglStr, 'varietas:', varietas);
        } catch(e) {
            console.warn('[JadwalTanam v4] Sinkronisasi gagal:', e.message);
        }
    }

    /* ──────────────────────────────────────────────────────────
       RENDER OUTPUT LENGKAP
    ────────────────────────────────────────────────────────── */
    function renderOutput(rekomendasi, kegiatan, zonaInfo, ensoData, iodData, aktual) {
        var kartuHTML = kegiatan.map(function(k, i) {
            return renderKartu(k, i + 1);
        }).join('');

        window._jtoData = { rekomendasi: rekomendasi, kegiatan: kegiatan };

        // Badge data cuaca realtime jika tersedia
        var badgeCuacaHTML = aktual.tersedia
            ? '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:4px 10px;font-size:10px;color:#10b981;font-weight:700;margin-bottom:10px;">⚡ Terintegrasi data cuaca realtime — Suhu ' + aktual.suhu.toFixed(0) + '°C, RH ' + aktual.kelembapan.toFixed(0) + '%</div>'
            : '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.2);border-radius:8px;padding:4px 10px;font-size:10px;color:#64748b;font-weight:600;margin-bottom:10px;">📡 Sinkronkan GPS di tab Cuaca untuk risiko realtime</div>';

        return '<div style="padding:4px 0;">' +

        '<div style="background:rgba(6,182,212,0.09);border:1px solid rgba(6,182,212,0.25);border-left:4px solid ' + WARNA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">' +
            '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">🤖 REKOMENDASI OTOMATIS SISTEM v4.0</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Tanggal tanam terbaik</span><br><strong style="color:#fff;font-size:13px;">' + formatTglLengkap(rekomendasi.tglTanam) + '</strong></div>' +
                '<div><span style="color:#64748b;">Varietas</span><br><strong style="color:#fff;font-size:13px;">' + rekomendasi.labelVar + '</strong></div>' +
                '<div><span style="color:#64748b;">Zona iklim</span><br><strong style="color:#fff;">' + (zonaInfo.nama || 'Estimasi Pola') + '</strong></div>' +
                '<div><span style="color:#64748b;">ENSO / IOD</span><br><strong style="color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</strong></div>' +
            '</div>' +
            '<div style="margin-top:10px;padding-top:9px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">' +
                '💡 ' + rekomendasi.alasan +
            '</div>' +
        '</div>' +

        badgeCuacaHTML +

        '<div style="font-size:11px;color:#64748b;margin-bottom:10px;">12 kegiatan direkomendasikan — ketuk kartu untuk detail & tips lapangan</div>' +

        kartuHTML +

        '<div style="margin-top:12px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ v4.0: Bobot iklim terpadu (Aldrian & Susanto 2003). Risiko insektisida & fungisida memakai data cuaca realtime jika GPS aktif. ' +
            'Skor musim tanam dikoreksi oleh anomali SST lokal. Sesuaikan dengan kondisi lapangan dan pengamatan PHT mingguan.' +
        '</div>' +

        '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>' +

        '</div>';
    }

    /* ──────────────────────────────────────────────────────────
       KIRIM KE WHATSAPP
    ────────────────────────────────────────────────────────── */
    window._jtoKirimWA = function() {
        var d = window._jtoData;
        if (!d) return;
        var baris = ['*KALENDER KEGIATAN TANI — PPL MILENIAL WAJO*\n'];
        baris.push('📅 Tanggal Tanam: ' + formatTglLengkap(d.rekomendasi.tglTanam));
        baris.push('🌱 Varietas: ' + d.rekomendasi.labelVar + '\n');
        d.kegiatan.forEach(function(k, i) {
            baris.push((i+1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
            baris.push('   Mulai  : ' + formatTglLengkap(k.tglMulai));
            baris.push('   Selesai: ' + formatTglPendek(k.tglSelesai));
            baris.push('   Status : ' + k.risiko.level);
            baris.push('   Catatan: ' + k.risiko.catatan);
            baris.push('');
        });
        baris.push('_PPL Milenial Wajo — Smart Farming v4.0_');
        baris.push('_Sumber: NOAA ENSO/IOD + ZOM BMKG + SST Lokal + Siklus Bulan_');
        window.open('https://wa.me/?text=' + encodeURIComponent(baris.join('\n')), '_blank');
    };

    /* ──────────────────────────────────────────────────────────
       PROSES UTAMA: ANALISIS OTOMATIS
    ────────────────────────────────────────────────────────── */
    async function prosesJadwalOtomatis() {
        var hasilEl  = document.getElementById('jtoHasil');
        var teksEl   = document.getElementById('jtoTeks');
        var statusEl = document.getElementById('jtoStatus');
        var btnEl    = document.getElementById('btnJadwalOtomatis');
        if (!hasilEl || !teksEl) return;

        hasilEl.style.display = 'block';
        teksEl.innerHTML = '';

        // [FIX-6] Animasi loading pada tombol
        if (btnEl) {
            btnEl.classList.remove('jto-btn-pulse');
            btnEl.classList.add('jto-btn-loading');
            btnEl.innerHTML = '<span class="jto-spinner">⟳</span> MENGANALISIS KALENDER IKLIM...';
            btnEl.disabled = true;
        }

        function setStatus(msg) {
            if (statusEl) statusEl.innerHTML = msg;
        }

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
                    setStatus('<span style="color:' + WARNA + ';">📡 Mengambil koordinat GPS...</span>');
                    var pos = await new Promise(function(res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, {
                            enableHighAccuracy: false, timeout: 8000, maximumAge: 300000
                        });
                    });
                    lat = pos.coords.latitude;
                    lon = pos.coords.longitude;
                    window._lokasiKalender = { lat: lat, lon: lon };
                }
            } catch(gpsErr) {
                console.warn('[JadwalTanam v4] GPS fallback:', gpsErr.message);
            }

            setStatus('<span style="color:' + WARNA + ';">🌐 Mengambil data ENSO/IOD & ZOM...</span>');

            var getENSO = typeof window.getENSOAnomaly === 'function'
                ? window.getENSOAnomaly()
                : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });
            var getIOD = typeof window.getIODAnomaly === 'function'
                ? window.getIODAnomaly()
                : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });

            var results  = await Promise.all([getENSO, getIOD, getDataZOM(lat, lon)]);
            var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
            var ensoVal  = ensoData.latestAnomaly || 0;
            var iodVal   = iodData.latestAnomaly  || 0;

            // [FIX-3] Baca data cuaca realtime
            var aktual = getCuacaAktual();
            if (aktual.tersedia) {
                setStatus('<span style="color:#10b981;">⚡ Data cuaca realtime terdeteksi — mengintegrasikan...</span>');
            } else {
                setStatus('<span style="color:' + WARNA + ';">🧮 Mengevaluasi 12 bulan kalender iklim...</span>');
            }

            // Hitung skor per bulan dengan koordinat GPS (untuk hitungWetnessScore)
            var skorBulan = zonaInfo.data.map(function(_, idx) {
                return skorKelembapan(idx, zonaInfo.data, ensoVal, iodVal, lat, lon);
            });

            // [FIX-4] Skor musim dengan koreksi SST sudah terintegrasi dalam rekomendasiWindowTanam
            var rekomendasi = rekomendasiWindowTanam(skorBulan, lat, lon);
            var kegiatan    = bangunKegiatan(rekomendasi.tglTanam, rekomendasi.varietas, skorBulan, aktual);

            // [FIX-5] Sinkronisasi ke tab lain
            sinkronisasiLintsTab(rekomendasi.tglTanam, rekomendasi.varietas);

            if (statusEl) statusEl.innerHTML = '';
            teksEl.innerHTML = renderOutput(rekomendasi, kegiatan, zonaInfo, ensoData, iodData, aktual);

            // [FIX-6] Reset tombol ke mode pulse setelah selesai
            if (btnEl) {
                btnEl.classList.remove('jto-btn-loading');
                btnEl.classList.add('jto-btn-done');
                btnEl.innerHTML = '✅ JADWAL DIPERBARUI — KLIK UNTUK ANALISIS ULANG';
                btnEl.disabled = false;
                // Setelah 4 detik kembali ke pulse normal
                setTimeout(function() {
                    btnEl.classList.remove('jto-btn-done');
                    btnEl.classList.add('jto-btn-pulse');
                    btnEl.innerHTML = '🤖 ANALISIS & BUAT JADWAL OTOMATIS';
                }, 4000);
            }

        } catch(err) {
            console.error('[JadwalTanam v4]', err);
            if (statusEl) statusEl.innerHTML = '';
            teksEl.innerHTML =
                '<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;font-size:13px;">' +
                '❌ Gagal membuat jadwal: ' + (err.message || 'Error tidak diketahui') +
                '</div>';

            if (btnEl) {
                btnEl.classList.remove('jto-btn-loading');
                btnEl.classList.add('jto-btn-pulse');
                btnEl.innerHTML = '🔄 COBA ANALISIS LAGI';
                btnEl.disabled = false;
            }
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
        btn.onclick = function() { switchMode('jadwaltanam'); };

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
                '<strong style="color:' + WARNA + ';display:block;margin-bottom:5px;">📅 Jadwal Kegiatan Tani Berbasis Iklim v4.0</strong>' +
                '<span style="font-size:0.78rem;color:#cbd5e1;line-height:1.6;">' +
                    'Mengevaluasi <b>12 bulan kalender iklim</b> dengan bobot terpadu per zona (Aldrian & Susanto 2003). ' +
                    'Risiko kegiatan terintegrasi dengan data cuaca realtime & SST lokal jika GPS aktif.' +
                '</span>' +
            '</div>' +

            '<button id="btnJadwalOtomatis" class="jto-btn-pulse" style="' +
                'width:100%;padding:15px;background:linear-gradient(135deg,' + WARNA + ',#0891b2);' +
                'color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;' +
                'letter-spacing:0.5px;margin-bottom:16px;position:relative;overflow:hidden;' +
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

        document.getElementById('btnJadwalOtomatis').addEventListener('click', function() {
            // Efek ripple saat diklik
            var btn  = this;
            var ripple = document.createElement('span');
            ripple.className = 'jto-ripple';
            btn.appendChild(ripple);
            setTimeout(function() { ripple.remove(); }, 600);
            prosesJadwalOtomatis();
        });
    }

    /* ──────────────────────────────────────────────────────────
       PATCH switchMode
    ────────────────────────────────────────────────────────── */
    function patchSwitchMode() {
        var _asli = window.switchMode;

        window.switchMode = function(mode) {
            var boxJTO = document.getElementById('boxJadwalTanam');

            if (mode === 'jadwaltanam') {
                var semuaBox = document.querySelectorAll('.card > div[id^="box"]');
                semuaBox.forEach(function(b) { b.style.display = 'none'; });
                ['btnCamera','scanWindow','btnAnalisis','result'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });

                if (boxJTO) boxJTO.style.display = 'block';

                var titleEl = document.getElementById('modeTitle');
                if (titleEl) { titleEl.innerText = '📅 Jadwal Kegiatan Tani'; titleEl.style.color = WARNA; }

                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) subEl.style.display = 'none';

                document.querySelectorAll('.tab-btn').forEach(function(btn) {
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
            if (typeof _asli === 'function') { _asli.apply(this, arguments); }
        };
    }

    /* ──────────────────────────────────────────────────────────
       [FIX-6] CSS ANIMASI TOMBOL BERDENYUT
       Pulse radar saat idle, spinner berputar saat loading,
       efek ripple saat diklik, warna hijau saat selesai.
    ────────────────────────────────────────────────────────── */
    function injeksiCSS() {
        if (document.getElementById('jtoCSS')) return;
        var style = document.createElement('style');
        style.id = 'jtoCSS';
        style.textContent = [
            /* Tab aktif */
            '#tabJadwalTanam.active{background:' + WARNA + '!important;color:#fff!important;}',
            '#tabJadwalTanam:not(.active){color:#708099;}',

            /* ── ANIMASI KEYFRAMES ── */
            '@keyframes jtoPulse{',
            '  0%{box-shadow:0 0 0 0 rgba(6,182,212,0.7);}',
            '  50%{box-shadow:0 0 0 12px rgba(6,182,212,0);}',
            '  100%{box-shadow:0 0 0 0 rgba(6,182,212,0);}',
            '}',
            '@keyframes jtoSpin{to{transform:rotate(360deg);display:inline-block;}}',
            '@keyframes jtoRippleAnim{',
            '  to{transform:scale(4);opacity:0;}',
            '}',
            '@keyframes jtoBeat{',
            '  0%,100%{transform:scale(1);}',
            '  50%{transform:scale(1.025);}',
            '}',

            /* ── IDLE: pulse radar berdenyut ── */
            '.jto-btn-pulse{',
            '  animation: jtoPulse 2s ease-out infinite, jtoBeat 2s ease-in-out infinite!important;',
            '}',
            '.jto-btn-pulse:hover{',
            '  opacity:0.92;',
            '  animation: jtoPulse 0.8s ease-out infinite, jtoBeat 0.8s ease-in-out infinite!important;',
            '}',

            /* ── LOADING: spinner + background gelap ── */
            '.jto-btn-loading{',
            '  background:linear-gradient(135deg,#0e7490,#0891b2)!important;',
            '  cursor:not-allowed!important;',
            '  animation:none!important;',
            '}',
            '.jto-spinner{',
            '  display:inline-block;',
            '  animation:jtoSpin 0.8s linear infinite;',
            '  margin-right:6px;',
            '}',

            /* ── SELESAI: hijau ── */
            '.jto-btn-done{',
            '  background:linear-gradient(135deg,#10b981,#059669)!important;',
            '  animation:jtoBeat 1s ease-in-out 3!important;',
            '}',

            /* ── RIPPLE saat diklik ── */
            '#btnJadwalOtomatis{overflow:hidden;position:relative;}',
            '.jto-ripple{',
            '  position:absolute;',
            '  border-radius:50%;',
            '  width:60px;height:60px;',
            '  top:50%;left:50%;',
            '  transform:translate(-50%,-50%) scale(0);',
            '  background:rgba(255,255,255,0.35);',
            '  animation:jtoRippleAnim 0.6s linear;',
            '  pointer-events:none;',
            '}',

            /* Light mode */
            'body.light-mode #boxJadwalTanam{background:#fff;color:#0f172a;}',
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
            '%c✅ patch_jadwal_tanam_otomatis.js v4.0 aktif',
            'color:' + WARNA + ';font-weight:bold;',
            '\n  [1] Engine kalkulasi terpadu dengan patch_risiko_iklim.js',
            '\n  [2] normalisasiCurahHujan bermusim (bulanIndex diteruskan)',
            '\n  [3] Risiko kegiatan terintegrasi data cuaca realtime',
            '\n  [4] Koreksi SST lokal ke skoring musim tanam',
            '\n  [5] Sinkronisasi lintas tab otomatis',
            '\n  [6] Animasi tombol: pulse radar → spinner → konfirmasi hijau'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
