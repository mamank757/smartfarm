/**
 * ============================================================
 *  PATCH: patch_kalender_menu_mandiri.js
 *  Versi: 2.1 — REKOMENDASI OTOMATIS PENUH — SKALA NASIONAL
 * ------------------------------------------------------------
 *  SISTEM BERLAKU UNTUK SELURUH INDONESIA:
 *    Tidak ada batasan wilayah, radius, atau hardcode daerah.
 *    Seluruh parameter diturunkan dari data aktual GPS pengguna.
 *
 *  Alur otomatis (tanpa input manual):
 *    1. Ambil GPS pengguna
 *    2. Fetch ENSO/IOD (NOAA) + ZOM BMKG (ambil kabupaten TERDEKAT
 *       tanpa batas radius — selalu ada hasil terbaik yang tersedia)
 *    3. Deteksi pola hujan wilayah GPS: Monsunal / Ekuatorial /
 *       Anti-Monsunal / Lokal — berdasarkan posisi lintang & bujur
 *    4. Bobot ENSO/IOD disesuaikan per pola iklim (bukan hardcode Sulsel)
 *    5. Fetch cuaca real-time Open-Meteo (suhu, kelembapan, curah hujan)
 *    6. Rekomendasi musim & varietas berbasis kondisi nyata di lokasi GPS
 *    7. Hitung 12 jadwal kegiatan tani
 *    8. Analisis risiko OPT (Hama & Penyakit) berbasis cuaca aktual
 *
 *  Cara pakai:
 *    <script src="patch_kalender_menu_mandiri.js"></script>
 *    (Dimuat SETELAH patch_kalender_tanam_cerdas.js jika ada)
 *
 *  Dependensi:
 *    - window.getENSOAnomaly()  — dari patch_enso_iod_noaa.js
 *    - window.getIODAnomaly()   — dari patch_enso_iod_noaa.js
 *    - window.URL_ZOM_LOKAL    — dari script utama HTML
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA UI
    // =========================================================================
    var WARNA  = '#06b6d4';
    var WARNA2 = '#0891b2';

    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    // =========================================================================
    //  DETEKSI POLA IKLIM BERDASARKAN POSISI GPS — SKALA NASIONAL
    //
    //  Referensi: Aldrian & Susanto (2003), "Identification of three dominant
    //  rainfall regions within Indonesia and their relationship to sea surface
    //  temperature", Int. J. Climatol.
    //
    //  Tiga pola utama + satu pola lokal:
    //    A. MONSUNAL    — Jawa, Bali, Nusa Tenggara, Sulsel, Maluku Selatan
    //    B. EKUATORIAL  — Sumatra tengah, Kalimantan, Papua tengah
    //    C. LOKAL       — Sulawesi utara, Maluku Utara, sebagian NTT
    //
    //  Tambahan berdasarkan karakteristik bimodal/trimodal:
    //    D. ANTI-MONSUNAL — pantai barat Sumatra (puncak hujan saat kemarau Jawa)
    // =========================================================================
    function deteksiPolaIklim(lat, lon) {
        // Normalisasi: lat negatif = selatan khatulistiwa
        var absLat = Math.abs(lat);

        // ── Papua ──────────────────────────────────────────────────────────────
        if (lon >= 131) {
            if (absLat <= 4) {
                return { pola: 'EKUATORIAL', label: 'Papua Tengah / Ekuatorial' };
            }
            return { pola: 'MONSUNAL', label: 'Papua Selatan / Monsunal' };
        }

        // ── Maluku ─────────────────────────────────────────────────────────────
        if (lon >= 126 && lon < 131) {
            if (lat >= 0) {
                return { pola: 'LOKAL', label: 'Maluku Utara / Lokal' };
            }
            return { pola: 'MONSUNAL', label: 'Maluku Selatan / Monsunal' };
        }

        // ── Sulawesi ───────────────────────────────────────────────────────────
        if (lon >= 119.5 && lon < 126) {
            if (lat >= 0.5) {
                // Sulawesi Utara & Gorontalo: pola lokal/ekuatorial
                return { pola: 'LOKAL', label: 'Sulawesi Utara–Gorontalo / Lokal' };
            }
            // Sulawesi Tengah, Selatan, Tenggara: monsunal
            return { pola: 'MONSUNAL', label: 'Sulawesi Selatan–Tengah / Monsunal' };
        }

        // ── Nusa Tenggara ──────────────────────────────────────────────────────
        if (lon >= 115.5 && lon < 119.5 && lat < 0) {
            return { pola: 'MONSUNAL', label: 'Nusa Tenggara / Monsunal Kuat' };
        }

        // ── Kalimantan ─────────────────────────────────────────────────────────
        if (lon >= 108 && lon < 119.5 && lat >= -3) {
            // Kalimantan hampir sepenuhnya ekuatorial
            return { pola: 'EKUATORIAL', label: 'Kalimantan / Ekuatorial' };
        }

        // ── Jawa & Bali ────────────────────────────────────────────────────────
        if (lon >= 105 && lon < 116 && lat < -5) {
            return { pola: 'MONSUNAL', label: 'Jawa–Bali / Monsunal' };
        }

        // ── Sumatra ────────────────────────────────────────────────────────────
        if (lon >= 95 && lon < 108) {
            // Pantai barat Sumatra (Bengkulu, Padang, Tapanuli) = anti-monsunal
            // Identifikasi kasar: bujur < 104 & lintang antara -5 s/d 4
            if (lon < 104 && lat >= -5 && lat <= 4) {
                return { pola: 'ANTI_MONSUNAL', label: 'Pantai Barat Sumatra / Anti-Monsunal' };
            }
            // Sumatra tengah-timur, Riau, Jambi = ekuatorial
            if (absLat <= 3) {
                return { pola: 'EKUATORIAL', label: 'Sumatra Tengah–Timur / Ekuatorial' };
            }
            // Sumatra utara (Aceh, Medan) & selatan (Lampung) = peralihan
            return { pola: 'LOKAL', label: 'Sumatra Utara/Selatan / Peralihan' };
        }

        // Default fallback — tetap berdasarkan lintang jika di luar peta di atas
        if (absLat <= 5) {
            return { pola: 'EKUATORIAL', label: 'Ekuatorial (estimasi)' };
        }
        return { pola: 'MONSUNAL', label: 'Monsunal (estimasi)' };
    }

    // =========================================================================
    //  BOBOT ENSO/IOD PER POLA IKLIM
    //
    //  Sumber: Nur'utami & Hidayat (2016) — IOD vs ENSO Influence on Rainfall;
    //          Hidayat et al. (2016) — regional sensitivity analysis;
    //          Aldrian & Susanto (2003)
    //
    //  Format: array 12 nilai (Jan–Des), [bobot_ENSO, bobot_IOD] per bulan
    // =========================================================================
    var BOBOT = {
        // Monsunal: ENSO dominan di musim kemarau (Jun–Sep),
        //           IOD penting di Sep–Nov terutama untuk wilayah selatan
        MONSUNAL: {
            enso: [0.15,0.10,0.10,0.12,0.18,0.40,0.50,0.55,0.50,0.38,0.20,0.15],
            iod:  [0.08,0.06,0.06,0.08,0.10,0.18,0.25,0.35,0.42,0.32,0.18,0.10]
        },
        // Ekuatorial: sensitif ENSO lebih merata, IOD lebih lemah
        EKUATORIAL: {
            enso: [0.20,0.18,0.16,0.15,0.15,0.18,0.22,0.28,0.30,0.25,0.20,0.18],
            iod:  [0.06,0.05,0.05,0.06,0.08,0.10,0.12,0.18,0.22,0.18,0.10,0.07]
        },
        // Anti-monsunal (pantai barat Sumatra): terbalik — hujan saat kemarau Jawa
        //   ENSO berpengaruh terbalik (La Nina = kering di musim barat lokal)
        ANTI_MONSUNAL: {
            enso: [0.10,0.08,0.08,0.10,0.15,0.20,0.25,0.28,0.25,0.18,0.12,0.10],
            iod:  [0.05,0.04,0.04,0.06,0.08,0.12,0.14,0.18,0.20,0.15,0.08,0.06]
        },
        // Lokal/peralihan: campuran moderat
        LOKAL: {
            enso: [0.12,0.10,0.10,0.12,0.15,0.25,0.32,0.38,0.35,0.28,0.16,0.12],
            iod:  [0.06,0.05,0.05,0.07,0.09,0.12,0.16,0.22,0.26,0.20,0.12,0.08]
        }
    };

    // =========================================================================
    //  AMBIL DATA ZOM — SELALU KEMBALIKAN HASIL TERDEKAT (TANPA BATAS RADIUS)
    //
    //  Algoritma: cari kabupaten dengan jarak Haversine MINIMUM dari GPS.
    //  Tidak ada cutoff radius. Jika ZOM tidak tersedia sama sekali (error
    //  jaringan), fallback ke curah hujan dari Open-Meteo (ERA5 proxy)
    //  atau estimasi berbasis pola iklim yang terdeteksi.
    // =========================================================================
    async function getZOM(lat, lon) {
        var URL_ZOM = window.URL_ZOM_LOKAL || '';
        try {
            if (!URL_ZOM) throw new Error('URL_ZOM_LOKAL tidak terdefinisi');
            var res  = await fetch(URL_ZOM);
            var data = await res.json();
            var arr  = Array.isArray(data.data) ? data.data
                     : Array.isArray(data)       ? data
                     : null;
            if (!arr || arr.length === 0) throw new Error('Array ZOM kosong');

            // Cari TERDEKAT tanpa batas radius
            var jMin = Infinity, kabTerpilih = null;
            arr.forEach(function (kab) {
                var lk  = parseFloat(kab.lat);
                var lnk = parseFloat(kab.lon);
                if (!isNaN(lk) && !isNaN(lnk)) {
                    var j = haversineKm(lat, lon, lk, lnk);
                    if (j < jMin) { jMin = j; kabTerpilih = kab; }
                }
            });

            if (!kabTerpilih) throw new Error('Tidak ada kabupaten valid di ZOM');

            var ks = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
            var chData = ks.map(function (k) { return parseFloat(kabTerpilih[k]) || 0; });

            return {
                data:   chData,
                nama:   kabTerpilih.kabupaten_kota || kabTerpilih.nama || 'Terdekat',
                provinsi: kabTerpilih.provinsi || '',
                jarak:  jMin.toFixed(1),
                sumber: 'ZOM BMKG'
            };

        } catch (e) {
            console.warn('[JadwalOto] ZOM gagal (' + e.message + '), beralih ke Open-Meteo ERA5');
            return await getERA5FallbackCH(lat, lon);
        }
    }

    // =========================================================================
    //  FALLBACK: CURAH HUJAN DARI OPEN-METEO ERA5 JIKA ZOM TIDAK TERSEDIA
    //  Mengambil data historis 12 bulan terakhir sebagai baseline
    // =========================================================================
    async function getERA5FallbackCH(lat, lon) {
        try {
            var sekarang = new Date();
            var thnLalu  = new Date(sekarang.getFullYear() - 1, sekarang.getMonth(), 1);
            var start    = thnLalu.toISOString().slice(0, 10);
            var end      = new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).toISOString().slice(0, 10);

            var url = 'https://archive-api.open-meteo.com/v1/archive' +
                '?latitude=' + lat + '&longitude=' + lon +
                '&start_date=' + start + '&end_date=' + end +
                '&daily=precipitation_sum&timezone=auto';

            var res  = await fetch(url);
            var data = await res.json();
            var harian = (data.daily && data.daily.precipitation_sum) || [];

            // Akumulasikan per bulan kalender
            var chBulanan = [0,0,0,0,0,0,0,0,0,0,0,0];
            var countBln  = [0,0,0,0,0,0,0,0,0,0,0,0];
            var times     = (data.daily && data.daily.time) || [];
            times.forEach(function (tgl, i) {
                var bln = parseInt(tgl.slice(5, 7)) - 1; // 0-11
                chBulanan[bln] += (harian[i] || 0);
                countBln[bln]++;
            });
            // Normalisasi ke rata-rata bulanan (mm/bulan)
            chBulanan = chBulanan.map(function (total, i) {
                return countBln[i] > 0 ? Math.round(total) : 0;
            });

            return {
                data:    chBulanan,
                nama:    'ERA5 Archive (Open-Meteo)',
                provinsi:'',
                jarak:   null,
                sumber:  'Open-Meteo ERA5'
            };
        } catch (e) {
            console.warn('[JadwalOto] ERA5 fallback gagal:', e.message);
            // Ultimate fallback: pola flat moderat — sistem tetap berjalan
            return {
                data:    [150,140,130,100,80,60,40,40,60,90,120,140],
                nama:    'Estimasi Generik Nasional',
                provinsi:'',
                jarak:   null,
                sumber:  'Estimasi'
            };
        }
    }

    // =========================================================================
    //  NORMALISASI CURAH HUJAN → INDEKS KELEMBAPAN (-1.5 s/d +1.5)
    //  Skala universal (bukan Sulsel-sentris)
    // =========================================================================
    function normCH(mm) {
        // Coba pakai fungsi dari script utama jika tersedia
        var fn = window.normalisasiCurahHujan;
        if (typeof fn === 'function') return fn(mm);
        // Implementasi universal: threshold disesuaikan rentang nasional
        if (mm <  20)  return -1.5;   // Sangat kering
        if (mm <  60)  return -0.8;   // Kering
        if (mm < 160)  return  0.0;   // Normal
        if (mm < 300)  return  0.8;   // Basah
        return 1.5;                    // Sangat basah (hutan hujan tropis)
    }

    // =========================================================================
    //  HITUNG SKOR KELEMBAPAN BULANAN (0–100)
    //  Menggunakan bobot ENSO/IOD sesuai pola iklim setempat
    // =========================================================================
    function skorBulan(idx, zomData, ensoVal, iodVal, pola) {
        var baseline = zomData[idx];
        var indeks   = baseline > 10 ? normCH(baseline) : baseline;

        var bobotSet = BOBOT[pola] || BOBOT.MONSUNAL;
        var wE       = bobotSet.enso[idx];
        var wI       = bobotSet.iod[idx];

        // Pola anti-monsunal: tanda ENSO dibalik
        // (El Niño di pola ini justru bisa menambah CH di musim lokalnya)
        var signENSO = (pola === 'ANTI_MONSUNAL') ? -1 : 1;

        var tot = 1 + wE + wI;
        var sc  = (indeks / tot)
                  - (signENSO * ensoVal * wE / tot)
                  - (iodVal   * wI      / tot);

        return Math.max(0, Math.min(100, Math.round(50 + sc * 25)));
    }

    // =========================================================================
    //  REKOMENDASI MUSIM, TANGGAL TANAM & VARIETAS — BERBASIS DATA AKTUAL
    //
    //  Logika utama:
    //    1. Hitung skor kelembapan 9 bulan ke depan
    //    2. Tentukan "window layak tanam": skor 30–72 = kondisi air ideal
    //    3. Pilih bulan terbaik dalam window tersebut
    //    4. Sesuaikan dengan pola iklim & kondisi ENSO/IOD aktual
    // =========================================================================
    function rekomendasiMusim(zomData, ensoVal, iodVal, pola, polaInfo, cuacaData, sekarang) {
        var bln = sekarang.getMonth(); // 0-11

        // ── Hitung skor 9 bulan ke depan ────────────────────────────────────
        var proyeksi = [];
        for (var i = 0; i < 9; i++) {
            var idx = (bln + i) % 12;
            proyeksi.push({
                offset:  i,
                idx:     idx,
                namaBln: NAMA_BULAN[idx],
                skor:    skorBulan(idx, zomData, ensoVal, iodVal, pola)
            });
        }

        // ── Tentukan nama musim berdasarkan pola iklim & bulan ───────────────
        var musim, konteks;
        switch (pola) {
            case 'MONSUNAL':
                // Musim hujan Nov–Apr, kemarau Mei–Okt (referensi Jawa/Sulsel)
                if (bln >= 10 || bln <= 3) {
                    musim   = 'Musim Hujan (MH) / Rendeng';
                    konteks = 'Curah hujan cukup untuk tanam utama. Waspadai banjir dan ledakan hama.';
                } else if (bln >= 4 && bln <= 6) {
                    musim   = 'Awal Kemarau / Peralihan MH→MK';
                    konteks = 'Musim tanam gadu. Ketersediaan irigasi menjadi kunci.';
                } else {
                    musim   = 'Musim Kemarau (MK) / Gadu';
                    konteks = 'Kemarau berlangsung. Tanam padi memerlukan irigasi teknis penuh.';
                }
                break;

            case 'EKUATORIAL':
                // Dua puncak hujan (bimodal): Mar–Mei & Sep–Nov
                if ((bln >= 2 && bln <= 4) || (bln >= 8 && bln <= 10)) {
                    musim   = 'Puncak Hujan Bimodal';
                    konteks = 'Curah hujan tinggi. Ideal untuk pengolahan lahan dan tanam segera.';
                } else if (bln === 1 || bln === 5 || bln === 7 || bln === 11) {
                    musim   = 'Peralihan Bimodal';
                    konteks = 'Hujan moderat. Cocok untuk persiapan tanam atau panen.';
                } else {
                    musim   = 'Transisi Kering Relatif';
                    konteks = 'Hujan berkurang. Pastikan ketersediaan air irigasi.';
                }
                break;

            case 'ANTI_MONSUNAL':
                // Puncak hujan Jun–Sep (kebalikan Jawa)
                if (bln >= 5 && bln <= 8) {
                    musim   = 'Musim Hujan Lokal (Jun–Sep)';
                    konteks = 'Ini musim hujan utama di wilayah Anda. Ideal untuk tanam rendeng lokal.';
                } else if (bln >= 9 && bln <= 11) {
                    musim   = 'Peralihan Hujan→Kering Lokal';
                    konteks = 'Hujan mulai berkurang. Persiapkan tanam gadu sebelum kemarau.';
                } else {
                    musim   = 'Musim Kering Lokal (Des–Mei)';
                    konteks = 'Hujan minimal. Tanam bergantung pada irigasi dan embung.';
                }
                break;

            default: // LOKAL / peralihan
                musim   = 'Pola Hujan Lokal / Peralihan';
                konteks = 'Pola hujan bervariasi. Sistem menganalisis ZOM aktual untuk penentuan waktu tanam.';
        }

        // ── Pengaruh ENSO/IOD pada konteks ──────────────────────────────────
        var kondisiIklim = '';
        var warningIklim = '';
        if (ensoVal > 1.0) {
            kondisiIklim = 'El Niño kuat';
            warningIklim = '⚠️ El Niño aktif — curah hujan diprediksi di bawah normal. Prioritaskan varietas genjah dan tahan kering.';
        } else if (ensoVal > 0.5) {
            kondisiIklim = 'El Niño moderat';
            warningIklim = '⚠️ El Niño moderat — persiapkan irigasi tambahan, pertimbangkan varietas genjah.';
        } else if (ensoVal < -1.0) {
            kondisiIklim = 'La Niña kuat';
            warningIklim = '⚠️ La Niña kuat — curah hujan di atas normal. Waspadai banjir, pilih varietas tahan rendaman.';
        } else if (ensoVal < -0.5) {
            kondisiIklim = 'La Niña moderat';
            warningIklim = '⚠️ La Niña moderat — potensi hujan lebih tinggi, siapkan saluran drainase.';
        } else {
            kondisiIklim = 'Netral';
            warningIklim = '';
        }

        // ── Pilih bulan tanam terbaik ────────────────────────────────────────
        // Skor ideal tanam padi: 28–72 (air tersedia, tidak genang ekstrem)
        // Prioritas: bulan yang paling dekat dan skornya layak
        var SKOR_MIN = 28, SKOR_MAX = 72;
        var terbaik  = null;
        // Cari dalam 6 bulan ke depan dulu
        for (var j = 0; j < 6; j++) {
            var p = proyeksi[j];
            if (p.skor >= SKOR_MIN && p.skor <= SKOR_MAX) {
                terbaik = p;
                break;
            }
        }
        // Jika tidak ada dalam 6 bulan, perluas ke 9 bulan
        if (!terbaik) {
            for (var k = 0; k < proyeksi.length; k++) {
                var q = proyeksi[k];
                if (q.skor >= SKOR_MIN && q.skor <= SKOR_MAX) {
                    terbaik = q;
                    break;
                }
            }
        }
        // Jika tetap tidak ada (sangat kering/basah ekstrem), ambil yang skornya paling mendekati ideal
        if (!terbaik) {
            var nilaiTerbaik = -Infinity;
            proyeksi.slice(0, 6).forEach(function (p) {
                var n = -Math.abs(p.skor - 50);
                if (n > nilaiTerbaik) { nilaiTerbaik = n; terbaik = p; }
            });
        }

        // ── Hitung tanggal tanam ─────────────────────────────────────────────
        var tglTanam;
        if (terbaik.offset === 0) {
            // Bulan ini — beri 14 hari persiapan minimal
            // Jika sudah lewat tgl 15, geser ke bulan depan
            var tglRencana = tambahHari(sekarang, 14);
            tglTanam = tglRencana.getDate() > 20
                ? new Date(sekarang.getFullYear(), sekarang.getMonth() + 1, 5)
                : tglRencana;
        } else {
            // Bulan mendatang — ambil tanggal 5 bulan tersebut (persiapan cukup)
            tglTanam = new Date(sekarang.getFullYear(), sekarang.getMonth() + terbaik.offset, 5);
        }

        // ── Tentukan varietas ────────────────────────────────────────────────
        var varietas, labelVarietas, alasanVarietas;

        // Prioritas 1: Kondisi ENSO ekstrem
        if (ensoVal > 0.8) {
            varietas       = 'genjah';
            labelVarietas  = 'Genjah < 95 HST (Inpari 42, Inpari 43, Cakrabuana, M70D)';
            alasanVarietas = 'El Niño menekan curah hujan — varietas genjah mengurangi risiko kekeringan di fase generatif.';
        } else if (ensoVal < -0.8) {
            varietas       = 'sedang';
            labelVarietas  = 'Sedang 95–115 HST, Tahan Rendaman (Inpari 30, Inpari 33, Inpari 38)';
            alasanVarietas = 'La Niña meningkatkan risiko genangan — pilih varietas toleran banjir singkat.';
        }
        // Prioritas 2: Skor kelembapan bulan tanam
        else if (terbaik.skor > 68) {
            varietas       = 'sedang';
            labelVarietas  = 'Sedang 95–115 HST, Tahan Basah (Inpari 30, Inpari 33, Mekongga)';
            alasanVarietas = 'Curah hujan tinggi di bulan tanam — varietas sedang tahan rendaman lebih aman.';
        } else if (terbaik.skor < 32) {
            varietas       = 'genjah';
            labelVarietas  = 'Genjah < 95 HST (Inpari 42, Inpari 43, Cakrabuana)';
            alasanVarietas = 'Curah hujan rendah — varietas genjah meminimalisir risiko puso akibat kekurangan air.';
        }
        // Kondisi normal
        else {
            varietas       = 'sedang';
            labelVarietas  = 'Sedang 95–115 HST (Ciherang, Mekongga, Inpari 32, Inpari 42)';
            alasanVarietas = 'Kondisi curah hujan mendukung — varietas sedang unggul memberikan hasil optimal.';
        }

        return {
            tglMulai:      tglTanam,
            musim:         musim,
            konteks:       konteks,
            kondisiIklim:  kondisiIklim,
            warningIklim:  warningIklim,
            varietas:      varietas,
            labelVarietas: labelVarietas,
            alasanVarietas:alasanVarietas,
            skorBulanTanam:terbaik.skor,
            namaBulanTanam:terbaik.namaBln,
            proyeksi:      proyeksi
        };
    }

    // =========================================================================
    //  ANALISIS RISIKO OPT — BERBASIS CUACA AKTUAL (UNIVERSAL)
    // =========================================================================
    function analisisOPT(suhu, kelembapan, curahHujanHarian) {
        var risiko = [];
        var fb     = hariFaseBulan(new Date());

        // Wereng Batang Coklat
        if (suhu >= 25 && suhu <= 30 && kelembapan >= 80) {
            risiko.push({
                nama:  'Wereng Batang Coklat (WBC)',
                level: '⚠️ WASPADA',
                warna: '#f59e0b',
                tips:  'Pantau pangkal batang 2×/minggu. Semprot Imidakloprid/BPMC jika ≥10 ekor/rumpun.'
            });
        }

        // Penggerek Batang Padi (siklus bulan)
        if (kelembapan >= 78 && suhu >= 24) {
            var levelPBP  = (fb < 4 || fb > 25) ? '🚨 TINGGI (Bulan Gelap)' : '⚠️ SEDANG';
            var warnaPBP  = (fb < 4 || fb > 25) ? '#ef4444' : '#f59e0b';
            risiko.push({
                nama:  'Penggerek Batang Padi (PBP)',
                level: levelPBP,
                warna: warnaPBP,
                tips:  'Pasang light trap malam hari. Kumpulkan kelompok telur di daun. Aplikasi insektisida sistemik saat ngengat aktif (bulan gelap).'
            });
        }

        // Blast (suhu sejuk + lembap = ideal sporulasi Pyricularia)
        if (kelembapan >= 85 && suhu >= 22 && suhu <= 28) {
            risiko.push({
                nama:  'Blast (Pyricularia oryzae)',
                level: '⚠️ WASPADA',
                warna: '#f59e0b',
                tips:  'Semprot Tricyclazole preventif 7 hari sebelum bunting. Kurangi Urea jika daun terlalu hijau gelap.'
            });
        }

        // Hawar Pelepah (suhu tinggi + lembap)
        if (kelembapan >= 85 && suhu >= 28) {
            risiko.push({
                nama:  'Hawar Pelepah (Sheath Blight)',
                level: '⚠️ SEDANG',
                warna: '#f59e0b',
                tips:  'Terapkan intermittent irrigation. Hindari Urea berlebih. Aplikasi Validamycin atau Hexaconazole.'
            });
        }

        // Tungro via Wereng Hijau (suhu sejuk–sedang)
        if (suhu >= 20 && suhu <= 27 && kelembapan >= 75) {
            risiko.push({
                nama:  'Tungro (Virus — via Wereng Hijau)',
                level: '🟡 SIAGA',
                warna: '#eab308',
                tips:  'Bersihkan gulma inang di sekitar lahan. Monitor wereng hijau di pesemaian. Cabut dan bakar tanaman terinfeksi.'
            });
        }

        // Tikus (curah hujan rendah = tikus aktif migrasi)
        if (curahHujanHarian < 3) {
            risiko.push({
                nama:  'Tikus Sawah',
                level: '⚠️ WASPADA',
                warna: '#f59e0b',
                tips:  'Gropyokan massal bersama petani sekitar. Pasang TBS di pojok petakan. Beri umpan rodentisida antikoagulan di liang aktif.'
            });
        }

        // Kondisi aman
        if (risiko.length === 0) {
            risiko.push({
                nama:  'Kondisi OPT Saat Ini Aman',
                level: '✅ RENDAH',
                warna: '#10b981',
                tips:  'Pertahankan monitoring PHT mingguan dan sanitasi lahan antar musim tanam.'
            });
        }

        return risiko;
    }

    // =========================================================================
    //  UTILITAS: FORMAT TANGGAL
    // =========================================================================
    function fmtPanjang(d) {
        return NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' +
               NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
    }
    function fmtPendek(d) {
        return d.getDate() + ' ' + NAMA_BULAN[d.getMonth()].substring(0, 3) + ' ' + d.getFullYear();
    }
    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
    }

    // =========================================================================
    //  UTILITAS: FASE BULAN
    // =========================================================================
    function hariFaseBulan(tgl) {
        var s = (tgl.getTime() - EPOCH_BULAN_MATI.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }
    function namaFaseBulan(h) {
        if (h < 1.5)  return { nama:'Bulan Mati',        ikon:'🌑' };
        if (h < 7.4)  return { nama:'Bulan Sabit Muda',  ikon:'🌒' };
        if (h < 8.4)  return { nama:'Kuartal Pertama',   ikon:'🌓' };
        if (h < 14.8) return { nama:'Bulan Cembung',     ikon:'🌔' };
        if (h < 15.8) return { nama:'Bulan Penuh',       ikon:'🌕' };
        if (h < 22.1) return { nama:'Bulan Cembung',     ikon:'🌖' };
        if (h < 23.1) return { nama:'Kuartal Ketiga',    ikon:'🌗' };
        if (h < 29.0) return { nama:'Bulan Sabit Tua',   ikon:'🌘' };
        return               { nama:'Bulan Mati',        ikon:'🌑' };
    }
    function cariFaseBulanOpt(acuan, min, max, offsetMulai) {
        var mulai = tambahHari(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHari(mulai, i);
            var f = hariFaseBulan(t);
            if (f >= min && f <= max) return t;
        }
        return mulai;
    }

    // =========================================================================
    //  UTILITAS: HAVERSINE
    // =========================================================================
    function haversineKm(lat1, lon1, lat2, lon2) {
        if (typeof window.hitungJarakHaversine === 'function') {
            return window.hitungJarakHaversine(lat1, lon1, lat2, lon2);
        }
        var R   = 6371;
        var dLa = (lat2 - lat1) * Math.PI / 180;
        var dLo = (lon2 - lon1) * Math.PI / 180;
        var a   = Math.sin(dLa/2)*Math.sin(dLa/2) +
                  Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
                  Math.sin(dLo/2)*Math.sin(dLo/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // =========================================================================
    //  NORMALISASI CH (alias lokal)
    // =========================================================================
    function normCH(mm) {
        if (typeof window.normalisasiCurahHujan === 'function') return window.normalisasiCurahHujan(mm);
        if (mm <  20)  return -1.5;
        if (mm <  60)  return -0.8;
        if (mm < 160)  return  0.0;
        if (mm < 300)  return  0.8;
        return 1.5;
    }

    // =========================================================================
    //  FUNGSI RISIKO PER KEGIATAN
    // =========================================================================
    function risikoOlah(sk) {
        if (sk < 25) return { level:'Kering',      catatan:'Tambahkan irigasi awal sebelum bajak', warna:'#ef4444' };
        if (sk > 80) return { level:'Sangat Basah', catatan:'Tunggu hingga lahan bisa diluku mesin', warna:'#3b82f6' };
        return             { level:'Baik',          catatan:'Kondisi optimal untuk bajak dan garu', warna:'#10b981' };
    }
    function risikoSemaian(sk) {
        if (sk > 75) return { level:'Waspada',    catatan:'Buat drainase bedeng persemaian', warna:'#f59e0b' };
        if (sk < 25) return { level:'Siram Rutin', catatan:'Siram pagi & sore, jaga kelembapan', warna:'#f59e0b' };
        return             { level:'Optimal',      catatan:'Cuaca mendukung perkecambahan', warna:'#10b981' };
    }
    function risikoTanam(sk) {
        if (sk > 80) return { level:'Genangan',      catatan:'Jaga kedalaman air 2–3 cm', warna:'#f59e0b' };
        if (sk < 20) return { level:'Kering Kritis', catatan:'Siapkan pompanisasi penuh', warna:'#ef4444' };
        return             { level:'Baik',            catatan:'Kondisi air mendukung penanaman', warna:'#10b981' };
    }
    function risikoTikus(fb) {
        if (fb < 4 || fb > 25) return { level:'Optimal',      catatan:'Malam gelap — umpan racun maksimal efektif', warna:'#10b981' };
        return                       { level:'Kurang Optimal', catatan:'Bulan cerah, tetap pasang TBS aktif',        warna:'#f59e0b' };
    }
    function risikoPupuk(sk) {
        if (sk > 75) return { level:'Risiko Tercuci', catatan:'Hindari tabur pupuk sebelum hujan lebat', warna:'#f59e0b' };
        if (sk < 20) return { level:'Tanah Kering',   catatan:'Pastikan ada air di petakan sebelum tabur', warna:'#ef4444' };
        return             { level:'Optimal',          catatan:'Cuaca mendukung serapan pupuk', warna:'#10b981' };
    }
    function risikoInsektisida(sk, fb) {
        var catatan = '', warna = '#10b981', level = 'Baik';
        if (sk > 75) { catatan += 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
        if (fb >= 13 && fb <= 17) {
            catatan += 'Puncak ngengat PBP — pasang light trap. ';
            warna = '#ef4444'; level = 'Waspada';
        } else {
            catatan += 'Waktu aplikasi aman dari puncak ngengat. ';
        }
        return { level:level, catatan:catatan.trim(), warna:warna };
    }
    function risikoFungisida(sk) {
        if (sk > 65) return { level:'Kritis Blast', catatan:'Semprot Tricyclazole preventif', warna:'#ef4444' };
        if (sk > 45) return { level:'Waspada',      catatan:'Pantau gejala bercak, semprot preventif', warna:'#f59e0b' };
        return             { level:'Aman',           catatan:'Risiko blast rendah, monitoring rutin cukup', warna:'#10b981' };
    }
    function risikoPanen(sk) {
        if (sk > 75) return { level:'Sulit Kering',   catatan:'Siapkan dryer — jangan tumpuk gabah lembap', warna:'#ef4444' };
        if (sk > 55) return { level:'Waspada Hujan',  catatan:'Panen pagi hari, hindari sore hujan', warna:'#f59e0b' };
        if (sk < 20) return { level:'Kering Ideal',   catatan:'Panen dan jemur optimal', warna:'#10b981' };
        return             { level:'Baik',             catatan:'Kondisi panen mendukung', warna:'#10b981' };
    }

    // =========================================================================
    //  RENDER KARTU KEGIATAN
    // =========================================================================
    function renderKartu(k, nomor) {
        var warna  = k.risiko.warna;
        var fb     = namaFaseBulan(hariFaseBulan(k.tglMulai));
        var tips   = k.tips.map(function (t) {
            return '<li style="margin-bottom:6px;color:#cbd5e1;line-height:1.5;">' + t + '</li>';
        }).join('');
        return (
            '<div class="jmd-card">' +
            '<div class="jmd-card-header" style="border-left:3px solid ' + warna + ';" onclick="window._jmdToggle(this)">' +
                '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.05);' +
                     'display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">' + k.ikon + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
                        '<div>' +
                            '<div style="font-size:11px;color:#64748b;font-weight:500;margin-bottom:2px;">Kegiatan ' + nomor + '</div>' +
                            '<div style="font-size:15px;font-weight:600;color:#fff;">' + k.nama + '</div>' +
                        '</div>' +
                        '<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:8px;' +
                               'background:' + warna + '22;color:' + warna + ';white-space:nowrap;flex-shrink:0;">' +
                            k.risiko.level + '</span>' +
                    '</div>' +
                    '<div style="font-size:13px;color:#94a3b8;margin-top:4px;">' +
                        '<span style="font-weight:600;color:#fff;">' + fmtPanjang(k.tglMulai) + '</span>' +
                        ' s/d ' + fmtPendek(k.tglSelesai) +
                    '</div>' +
                    '<div style="font-size:12px;color:#64748b;margin-top:3px;">' +
                        fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + k.deskripsi +
                    '</div>' +
                '</div>' +
                '<span class="jmd-chevron" style="font-size:14px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>' +
            '</div>' +
            '<div class="jmd-detail">' +
                '<div style="background:rgba(0,0,0,0.2);border-radius:12px;padding:10px 12px;' +
                     'margin-top:12px;margin-bottom:12px;border-left:3px solid ' + warna + ';">' +
                    '<div style="font-size:12px;font-weight:600;color:' + warna + ';margin-bottom:3px;">Catatan Iklim</div>' +
                    '<div style="font-size:13px;color:#cbd5e1;">' + k.risiko.catatan + '</div>' +
                '</div>' +
                '<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
                '<ul style="margin:0;padding-left:16px;font-size:13px;">' + tips + '</ul>' +
            '</div>' +
            '</div>'
        );
    }

    window._jmdToggle = function (el) {
        var d = el.parentElement.querySelector('.jmd-detail');
        var c = el.querySelector('.jmd-chevron');
        if (!d) return;
        var vis = d.style.display !== 'none';
        d.style.display = vis ? 'none' : 'block';
        if (c) c.style.transform = vis ? '' : 'rotate(180deg)';
    };

    // =========================================================================
    //  FETCH CUACA LOKAL
    // =========================================================================
    async function fetchCuacaLokal(lat, lon) {
        var def = { suhu:28, kelembapan:78, angin:12, hujanHarian:2 };
        try {
            var url = 'https://api.open-meteo.com/v1/forecast' +
                '?latitude=' + lat + '&longitude=' + lon +
                '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain&timezone=auto';
            var res  = await fetch(url);
            var data = await res.json();
            if (data && data.current) {
                return {
                    suhu:        Math.round(data.current.temperature_2m      || def.suhu),
                    kelembapan:  Math.round(data.current.relative_humidity_2m || def.kelembapan),
                    angin:       Math.round(data.current.wind_speed_10m       || def.angin),
                    hujanHarian: parseFloat((data.current.rain || 0).toFixed(1))
                };
            }
        } catch (e) { console.warn('[JadwalOto] Cuaca:', e.message); }
        return def;
    }

    // =========================================================================
    //  FUNGSI UTAMA: ANALISIS OTOMATIS PENUH
    // =========================================================================
    async function jalankanAnalisisOtomatis() {
        var hasilEl = document.getElementById('hasilJadwalOtomatis');
        var teksEl  = document.getElementById('teksJadwalOtomatis');
        var btn     = document.getElementById('btnAnalisisOtomatis');

        hasilEl.style.display = 'block';
        btn.disabled          = true;
        btn.style.opacity     = '0.7';

        function loading(teks) {
            teksEl.innerHTML =
                '<div style="text-align:center;padding:28px 0;color:' + WARNA + ';font-size:14px;">' +
                    '<span class="jmd-spin" style="font-size:26px;display:block;margin-bottom:10px;">⏳</span>' +
                    teks + '</div>';
        }

        try {
            // ── 1. GPS ────────────────────────────────────────────────────────
            loading('🛰️ Mengambil koordinat GPS...');
            var lat = -6.2, lon = 106.8; // default Jakarta jika GPS gagal
            try {
                var pos = await new Promise(function (res, rej) {
                    navigator.geolocation.getCurrentPosition(res, rej,
                        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
                window._lokasiKalender = { lat: lat, lon: lon };
            } catch (gpsErr) {
                // Coba pakai posisi dari tab cuaca jika sudah sinkron
                var lokasiUI = document.getElementById('lokasiSawah');
                if (lokasiUI && lokasiUI.innerText && lokasiUI.innerText !== '-') {
                    var pts = lokasiUI.innerText.split(',');
                    if (pts.length === 2) {
                        lat = parseFloat(pts[0].trim());
                        lon = parseFloat(pts[1].trim());
                    }
                } else {
                    console.warn('[JadwalOto] GPS gagal, gunakan koordinat terakhir tersedia.');
                }
            }

            // ── 2. Deteksi pola iklim berdasarkan GPS ─────────────────────────
            var polaInfo = deteksiPolaIklim(lat, lon);
            var pola     = polaInfo.pola;

            // ── 3. Fetch semua data paralel ───────────────────────────────────
            loading('📡 Mengambil ENSO/IOD, ZOM BMKG, dan cuaca lokal...');
            var getENSO = typeof window.getENSOAnomaly === 'function'
                ? window.getENSOAnomaly()
                : Promise.resolve({ latestAnomaly:0, status:'Netral' });
            var getIOD = typeof window.getIODAnomaly === 'function'
                ? window.getIODAnomaly()
                : Promise.resolve({ latestAnomaly:0, status:'Netral' });

            var hasil = await Promise.all([getENSO, getIOD, getZOM(lat, lon), fetchCuacaLokal(lat, lon)]);
            var ensoData  = hasil[0];
            var iodData   = hasil[1];
            var zonaInfo  = hasil[2];
            var cuacaData = hasil[3];

            var ensoVal = parseFloat(ensoData.latestAnomaly) || 0;
            var iodVal  = parseFloat(iodData.latestAnomaly)  || 0;

            // ── 4. Hitung skor kelembapan 12 bulan ───────────────────────────
            var skorBulanan = zonaInfo.data.map(function (_, idx) {
                return skorBulan(idx, zonaInfo.data, ensoVal, iodVal, pola);
            });

            // ── 5. Rekomendasi musim, varietas, tanggal tanam ─────────────────
            loading('🌾 Menentukan waktu tanam dan varietas optimal...');
            var sekarang = new Date();
            var rek      = rekomendasiMusim(
                zonaInfo.data, ensoVal, iodVal, pola, polaInfo, cuacaData, sekarang
            );
            var tglTanam = rek.tglMulai;
            var varietas = rek.varietas;

            // ── 6. Bangun jadwal 12 kegiatan ─────────────────────────────────
            loading('📅 Menghitung jadwal 12 kegiatan tani...');
            var of = {
                genjah: { benih:14, pupuk1:7,  pupuk2:28, pupuk3:45, insektA:20, insektL:45, fungis:55, panen:90  },
                sedang: { benih:21, pupuk1:7,  pupuk2:30, pupuk3:55, insektA:25, insektL:55, fungis:65, panen:110 },
                dalam:  { benih:28, pupuk1:7,  pupuk2:35, pupuk3:65, insektA:30, insektL:65, fungis:75, panen:125 }
            }[varietas] || {benih:21,pupuk1:7,pupuk2:30,pupuk3:55,insektA:25,insektL:55,fungis:65,panen:110};

            var tglOlah   = tambahHari(tglTanam, -14);
            var tglBenih  = tambahHari(tglTanam, -of.benih);
            var tglTBS    = tambahHari(tglTanam, -14);
            var tglTikusA = cariFaseBulanOpt(tglTanam, 26, 29.5, -10);
            var tglP1     = tambahHari(tglTanam, of.pupuk1);
            var tglP2     = tambahHari(tglTanam, of.pupuk2);
            var tglP3     = tambahHari(tglTanam, of.pupuk3);
            var tglIA     = tambahHari(tglTanam, of.insektA);
            var tglIL     = tambahHari(tglTanam, of.insektL);
            var tglFung   = tambahHari(tglTanam, of.fungis);
            var tglPanen  = tambahHari(tglTanam, of.panen);

            [tglIA, tglIL].forEach(function (tgl, i) {
                var f = hariFaseBulan(tgl);
                if (f >= 13.5 && f <= 16.5) {
                    if (i === 0) tglIA = tambahHari(tgl, 5);
                    else         tglIL = tambahHari(tgl, 5);
                }
            });

            function sk(tgl) { return skorBulanan[tgl.getMonth()]; }

            var kegiatan = [
                {
                    id:'olah', nama:'Pengolahan Lahan', ikon:'🚜',
                    deskripsi:'Bajak, garu, pemerataan petakan',
                    tglMulai:tglOlah, tglSelesai:tambahHari(tglOlah,7),
                    risiko:risikoOlah(sk(tglOlah)),
                    tips:['Olah lahan 14 hari sebelum tanam agar gulma terbenam sempurna',
                          'Jika pH < 5.5, tambahkan kapur dolomit 500–1000 kg/ha',
                          'Cek saluran irigasi dan perbaiki pematang bocor']
                },
                {
                    id:'benih', nama:'Pembibitan Benih', ikon:'🌱',
                    deskripsi:'Seleksi, perendaman, perkecambahan, semai',
                    tglMulai:tglBenih, tglSelesai:tambahHari(tglBenih,7),
                    risiko:risikoSemaian(sk(tglBenih)),
                    tips:['Rendam benih 24 jam, buang yang mengapung',
                          'Inkubasi lembap 48 jam hingga kecambah 2–3 mm',
                          'Dosis semai: 25–35 kg/ha (tapin), 50–100 kg/ha (tabela)']
                },
                {
                    id:'tbs', nama:'Pasang TBS & Gropyokan', ikon:'🐀',
                    deskripsi:'Trap Barrier System & gropyokan massal',
                    tglMulai:tglTBS, tglSelesai:tambahHari(tglTBS,3),
                    risiko:risikoTikus(hariFaseBulan(tglTikusA)),
                    tips:['Pasang TBS plastik setinggi 60 cm di sudut petakan',
                          'Gropyokan bersama minimal 3 petani (efek pengusir massal)',
                          'Bersihkan semak dan jerami sisa panen di sekitar pematang']
                },
                {
                    id:'tanam', nama:'Tanam Pindah / Tabela', ikon:'🌾',
                    deskripsi:'Penanaman bibit ke lahan utama',
                    tglMulai:tglTanam, tglSelesai:tambahHari(tglTanam,3),
                    risiko:risikoTanam(sk(tglTanam)),
                    tips:['Umur bibit optimal 14–21 HSS untuk tapin',
                          'Jarak tanam Legowo 2:1: (25×12.5)×50 cm',
                          'Tanam 2–3 bibit/lubang, kedalaman 2–3 cm']
                },
                {
                    id:'umpan', nama:'Pemberian Umpan Racun Tikus', ikon:'☠️',
                    deskripsi:'Rodentisida antikoagulan di liang aktif',
                    tglMulai:tglTikusA, tglSelesai:tambahHari(tglTikusA,5),
                    risiko:risikoTikus(hariFaseBulan(tglTikusA)),
                    tips:['Gunakan rodentisida antikoagulan (Brodifacoum, Bromadiolon)',
                          'Tempatkan dalam kotak umpan tertutup di mulut liang',
                          'Pasang malam hari, ganti tiap 3–4 hari',
                          'JANGAN diletakkan di sekitar saluran air atau kolam ikan']
                },
                {
                    id:'p1', nama:'Pemupukan Tahap I (Dasar)', ikon:'🧪',
                    deskripsi:'NPK Phonska + Urea I — fase awal anakan',
                    tglMulai:tglP1, tglSelesai:tambahHari(tglP1,2),
                    risiko:risikoPupuk(sk(tglP1)),
                    tips:['Dosis: Urea ⅓ total + Phonska ½ total per ha',
                          'Sebar rata saat air macak-macak',
                          'Jangan pupuk saat angin kencang atau menjelang hujan lebat']
                },
                {
                    id:'i1', nama:'Penyemprotan Insektisida I', ikon:'💊',
                    deskripsi:'Pengendalian WBC & Sundep fase vegetatif',
                    tglMulai:tglIA, tglSelesai:tambahHari(tglIA,2),
                    risiko:risikoInsektisida(sk(tglIA), hariFaseBulan(tglIA)),
                    tips:['Semprot hanya jika WBC > 10 ekor/rumpun',
                          'Gunakan Imidakloprid, BPMC, atau Buprofezin',
                          'Semprot pagi hari (07.00–10.00)',
                          'Arahkan nozzle ke pangkal batang untuk WBC']
                },
                {
                    id:'p2', nama:'Pemupukan Tahap II (Susulan I)', ikon:'🧪',
                    deskripsi:'Urea II + Phonska II — anakan produktif',
                    tglMulai:tglP2, tglSelesai:tambahHari(tglP2,2),
                    risiko:risikoPupuk(sk(tglP2)),
                    tips:['Dosis: Urea ⅔ sisa + Phonska ¼ total per ha',
                          'Cek BWD — jika skala 3+ tahan tambah Urea',
                          'Pemupukan terpenting untuk jumlah anakan produktif']
                },
                {
                    id:'p3', nama:'Pemupukan Tahap III (Susulan II)', ikon:'🧪',
                    deskripsi:'Phonska III ± Urea III — menjelang bunting',
                    tglMulai:tglP3, tglSelesai:tambahHari(tglP3,2),
                    risiko:risikoPupuk(sk(tglP3)),
                    tips:['Dosis: Phonska ¼ sisa ± Urea sesuai BWD skala 1–2',
                          'BWD skala 4–5 → SKIP Urea tahap ini',
                          'Tambahkan pupuk mikro (Silikat/ZnSO₄) jika tersedia']
                },
                {
                    id:'i2', nama:'Penyemprotan Insektisida II', ikon:'💊',
                    deskripsi:'Walang Sangit & Beluk fase generatif',
                    tglMulai:tglIL, tglSelesai:tambahHari(tglIL,2),
                    risiko:risikoInsektisida(sk(tglIL), hariFaseBulan(tglIL)),
                    tips:['Target utama: Walang Sangit saat malai keluar',
                          'Semprot pagi hari saat serangga masih di tanaman',
                          'Gunakan Malathion atau Deltametrin',
                          'Tambahkan fungisida jika ada gejala Hawar Pelepah']
                },
                {
                    id:'fung', nama:'Penyemprotan Fungisida (Blast)', ikon:'🍄',
                    deskripsi:'Preventif Blast Leher Malai saat bunting kritis',
                    tglMulai:tglFung, tglSelesai:tambahHari(tglFung,2),
                    risiko:risikoFungisida(sk(tglFung)),
                    tips:['Semprot 5–7 hari SEBELUM atau SAAT keluar malai',
                          'Bahan aktif: Tricyclazole (0.5 l/ha) atau Isoprothiolane (1–1.5 l/ha)',
                          'Ulangi 14 hari kemudian jika cuaca masih lembap']
                },
                {
                    id:'panen', nama:'Panen', ikon:'🌟',
                    deskripsi:'Pemotongan saat kadar air gabah 20–25%',
                    tglMulai:tglPanen, tglSelesai:tambahHari(tglPanen,5),
                    risiko:risikoPanen(sk(tglPanen)),
                    tips:['Panen saat 90–95% gabah kuning keemasan',
                          'Kadar air ideal saat potong: 20–25%, keringkan ke 14%',
                          'Pesan combine harvester 14 hari sebelum taksiran panen',
                          'Jual ke penggilingan dengan timbangan bersertifikat']
                }
            ];

            window._jmdDataKegiatan = { tglTanam:tglTanam, varietas:varietas, kegiatan:kegiatan };

            // ── 7. Analisis OPT ───────────────────────────────────────────────
            var risikoOPTList = analisisOPT(cuacaData.suhu, cuacaData.kelembapan, cuacaData.hujanHarian);

            // ── 8. Render HTML output ──────────────────────────────────────────
            var kartuHTML = kegiatan.map(function (k, i) { return renderKartu(k, i + 1); }).join('');

            var optHTML = risikoOPTList.map(function (r) {
                var ikon = r.warna === '#ef4444' ? '🚨' : r.warna === '#f59e0b' ? '⚠️' : '✅';
                return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;' +
                       'border-bottom:0.5px solid rgba(255,255,255,0.06);">' +
                    '<div style="font-size:18px;padding-top:1px;">' + ikon + '</div>' +
                    '<div>' +
                        '<div style="font-size:13px;font-weight:600;color:#fff;">' + r.nama + '</div>' +
                        '<div style="font-size:11px;font-weight:700;color:' + r.warna + ';margin:2px 0;">' + r.level + '</div>' +
                        '<div style="font-size:12px;color:#94a3b8;">' + r.tips + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');

            // Proyeksi skor 9 bulan
            var proyHTML = rek.proyeksi.map(function (p) {
                var barW  = p.skor + '%';
                var warna = p.skor > 68 ? '#3b82f6' : p.skor < 32 ? '#ef4444' : '#10b981';
                var label = p.skor > 68 ? 'Basah' : p.skor < 32 ? 'Kering' : 'Normal';
                return '<div style="margin-bottom:7px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:3px;">' +
                        '<span>' + p.namaBln + '</span>' +
                        '<span style="color:' + warna + ';font-weight:600;">' + label + ' (' + p.skor + ')</span>' +
                    '</div>' +
                    '<div style="background:rgba(255,255,255,0.06);height:6px;border-radius:3px;overflow:hidden;">' +
                        '<div style="width:' + barW + ';height:100%;background:' + warna + ';transition:width 0.5s;"></div>' +
                    '</div>' +
                '</div>';
            }).join('');

            teksEl.innerHTML =
                // ── Ringkasan analisis ───────────────────────────────────────
                '<div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);' +
                'border-radius:14px;padding:14px 16px;margin-bottom:16px;">' +
                    '<div style="font-size:11px;color:' + WARNA + ';font-weight:700;letter-spacing:0.5px;' +
                    'text-transform:uppercase;margin-bottom:10px;">✅ Analisis Otomatis Selesai</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
                        '<div><span style="color:#64748b;">Koordinat GPS</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</span></div>' +
                        '<div><span style="color:#64748b;">Pola Iklim</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' + polaInfo.label + '</span></div>' +
                        '<div><span style="color:#64748b;">ZOM/Data CH</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' + zonaInfo.nama +
                            (zonaInfo.jarak ? ' (' + zonaInfo.jarak + ' km)' : '') + '</span></div>' +
                        '<div><span style="color:#64748b;">Sumber Data CH</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' + (zonaInfo.sumber || 'ZOM BMKG') + '</span></div>' +
                        '<div><span style="color:#64748b;">ENSO / IOD</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' +
                            (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</span></div>' +
                        '<div><span style="color:#64748b;">Musim</span><br>' +
                            '<span style="font-weight:600;color:#fff;">' + rek.musim + '</span></div>' +
                        '<div style="grid-column:1/-1;">' +
                            '<span style="color:#64748b;">Rekomendasi Tanam</span><br>' +
                            '<span style="font-weight:700;font-size:15px;color:#10b981;">' + fmtPanjang(tglTanam) + '</span>' +
                        '</div>' +
                        '<div style="grid-column:1/-1;">' +
                            '<span style="color:#64748b;">Rekomendasi Varietas</span><br>' +
                            '<span style="font-weight:600;color:#10b981;">' + rek.labelVarietas + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // ── Dasar keputusan ──────────────────────────────────────────
                '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);' +
                'border-radius:12px;padding:12px 14px;margin-bottom:16px;">' +
                    '<div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;' +
                    'letter-spacing:0.5px;margin-bottom:8px;">📋 Dasar Keputusan Sistem</div>' +
                    '<div style="font-size:13px;color:#cbd5e1;line-height:1.75;">' +
                        '• ' + rek.konteks + '<br>' +
                        (rek.warningIklim ? '• ' + rek.warningIklim + '<br>' : '') +
                        '• ' + rek.alasanVarietas + '<br>' +
                        '• Cuaca lokal: 🌡️ ' + cuacaData.suhu + '°C | 💧 ' + cuacaData.kelembapan +
                            '% | 💨 ' + cuacaData.angin + ' km/jam | 🌧️ ' + cuacaData.hujanHarian + ' mm/jam<br>' +
                        '• Skor kelembapan bulan tanam: <strong style="color:#10b981;">' +
                            rek.skorBulanTanam + '/100</strong> (' + rek.namaBulanTanam + ')' +
                    '</div>' +
                '</div>' +

                // ── Proyeksi kelembapan 9 bulan ──────────────────────────────
                '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);' +
                'border-radius:12px;padding:12px 14px;margin-bottom:16px;">' +
                    '<div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;' +
                    'letter-spacing:0.5px;margin-bottom:10px;">📊 Proyeksi Kelembapan 9 Bulan ke Depan</div>' +
                    proyHTML +
                    '<div style="font-size:10px;color:#475569;margin-top:6px;">' +
                        'Normal=30–72 | Basah>72 | Kering&lt;30 — dihitung dari ZOM+ENSO+IOD+bobot pola ' + pola +
                    '</div>' +
                '</div>' +

                // ── Peringatan OPT ───────────────────────────────────────────
                '<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.18);' +
                'border-radius:14px;padding:14px;margin-bottom:16px;">' +
                    '<div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;' +
                    'letter-spacing:0.5px;margin-bottom:10px;">🦟 Peringatan Dini Hama & Penyakit (Kondisi Saat Ini)</div>' +
                    optHTML +
                '</div>' +

                // ── Jadwal 12 kegiatan ───────────────────────────────────────
                '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">' +
                    '12 kegiatan direkomendasikan — ketuk kartu untuk detail & tips lapangan.' +
                '</div>' +
                kartuHTML +

                // ── Disclaimer ───────────────────────────────────────────────
                '<div style="margin-top:14px;background:rgba(100,116,139,0.1);border-radius:12px;' +
                'padding:10px 12px;font-size:11px;color:#64748b;line-height:1.6;' +
                'border:1px solid rgba(255,255,255,0.04);">' +
                    '⚠️ Rekomendasi dihasilkan otomatis berbasis data digital. Sesuaikan dengan kondisi ' +
                    'lapangan, ketersediaan air irigasi, dan hasil pengamatan PHT mingguan. ' +
                    'Sumber: NOAA ENSO/IOD · ZOM BMKG Nasional · Open-Meteo ERA5 · Siklus Sinodis Bulan · BB Padi (2019).' +
                '</div>' +

                // ── Tombol aksi ──────────────────────────────────────────────
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">' +
                    '<button onclick="window._jmdRefresh()" style="padding:13px;background:rgba(6,182,212,0.15);' +
                        'color:' + WARNA + ';border:1px solid ' + WARNA + ';border-radius:14px;' +
                        'font-size:13px;font-weight:600;cursor:pointer;">🔄 Perbarui Data</button>' +
                    '<button onclick="window._jmdKirimWA()" style="padding:13px;background:#25D366;' +
                        'color:#fff;border:none;border-radius:14px;font-size:13px;font-weight:600;cursor:pointer;">' +
                        '📲 Kirim ke WA</button>' +
                '</div>';

        } catch (err) {
            console.error('[JadwalOto]', err);
            teksEl.innerHTML =
                '<div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);' +
                'border-radius:12px;color:#fca5a5;font-size:13px;">' +
                    '❌ Gagal menganalisis: ' + (err.message || 'Error tidak diketahui') + '<br><br>' +
                    '<small style="color:#64748b;">Pastikan GPS aktif dan koneksi internet tersedia. ' +
                    'Coba tekan "Perbarui Data" beberapa saat lagi.</small>' +
                '</div>';
        } finally {
            btn.disabled      = false;
            btn.style.opacity = '1';
        }
    }

    // =========================================================================
    //  EXPORT WHATSAPP
    // =========================================================================
    window._jmdKirimWA = function () {
        var d = window._jmdDataKegiatan;
        if (!d) return;
        var baris = ['*KALENDER KEGIATAN TANI OTOMATIS — PPL MILENIAL*\n'];
        d.kegiatan.forEach(function (k, i) {
            baris.push((i+1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
            baris.push('   Mulai  : ' + fmtPanjang(k.tglMulai));
            baris.push('   Selesai: ' + fmtPendek(k.tglSelesai));
            baris.push('   Status : ' + k.risiko.level);
            baris.push('   Catatan: ' + k.risiko.catatan);
            baris.push('');
        });
        baris.push('_Dihasilkan otomatis via GPS + ENSO/IOD + ZOM BMKG Nasional + Open-Meteo_');
        window.open('https://wa.me/?text=' + encodeURIComponent(baris.join('\n')), '_blank');
    };

    window._jmdRefresh = function () {
        var el = document.getElementById('hasilJadwalOtomatis');
        if (el) el.style.display = 'none';
        jalankanAnalisisOtomatis();
    };

    // =========================================================================
    //  INJECT TAB
    // =========================================================================
    function injeksiTab() {
        if (document.getElementById('tabJadwalTanam')) return;
        var cont = document.querySelector('.tab-container');
        if (!cont) return;
        var btn       = document.createElement('button');
        btn.className = 'tab-btn';
        btn.id        = 'tabJadwalTanam';
        btn.textContent = 'JADWAL TANAM';
        btn.onclick   = function () { window.switchMode('jadwaltanam'); };
        var tabKal = document.getElementById('tabKalender');
        if (tabKal && tabKal.parentNode) {
            tabKal.parentNode.insertBefore(btn, tabKal.nextSibling);
        } else {
            cont.appendChild(btn);
        }
    }

    // =========================================================================
    //  INJECT BOX KONTEN
    // =========================================================================
    function injeksiBox() {
        if (document.getElementById('boxJadwalTanam')) return;
        var card = document.querySelector('.card');
        if (!card) return;
        var box        = document.createElement('div');
        box.id         = 'boxJadwalTanam';
        box.style.display = 'none';
        box.innerHTML =
            '<div style="background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.25);' +
            'border-left:4px solid ' + WARNA + ';border-radius:16px;padding:14px 16px;margin-bottom:18px;">' +
                '<strong style="color:' + WARNA + ';display:block;margin-bottom:6px;">' +
                    '📅 Kalender Kegiatan Tani — Rekomendasi Otomatis Nasional</strong>' +
                '<span style="font-size:0.8rem;color:#cbd5e1;line-height:1.6;">' +
                    'Sistem mendeteksi GPS, pola iklim wilayah, ENSO/IOD, ZOM BMKG, dan cuaca real-time ' +
                    'untuk merekomendasikan waktu tanam terbaik dan jadwal 12 kegiatan tani. ' +
                    '<strong style="color:' + WARNA + ';">Tidak diperlukan input manual.</strong>' +
                '</span>' +
            '</div>' +
            '<button id="btnAnalisisOtomatis" class="btn-main" style="' +
                'background:linear-gradient(135deg,' + WARNA + ',' + WARNA2 + ');' +
                'color:#fff;font-weight:700;letter-spacing:0.5px;margin-bottom:0;">' +
                '🛰️ ANALISIS OTOMATIS — GPS + IKLIM + CUACA' +
            '</button>' +
            '<div id="hasilJadwalOtomatis" style="margin-top:16px;display:none;">' +
                '<div id="teksJadwalOtomatis"></div>' +
            '</div>';
        var boxKal = document.getElementById('boxKalender');
        if (boxKal && boxKal.parentNode) {
            boxKal.parentNode.insertBefore(box, boxKal.nextSibling);
        } else {
            card.appendChild(box);
        }
        document.getElementById('btnAnalisisOtomatis')
            .addEventListener('click', jalankanAnalisisOtomatis);
    }

    // =========================================================================
    //  PATCH switchMode
    // =========================================================================
    function patchSwitchMode() {
        var _asli = window.switchMode;
        window.switchMode = function (mode) {
            var boxJadwal = document.getElementById('boxJadwalTanam');
            if (mode === 'jadwaltanam') {
                document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
                    b.style.display = 'none';
                });
                ['btnCamera','scanWindow','btnAnalisis','result'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                if (boxJadwal) boxJadwal.style.display = 'block';
                var mt = document.getElementById('modeTitle');
                if (mt) { mt.innerText = '📅 Jadwal Kegiatan Tani'; mt.style.color = WARNA; }
                var sub = document.getElementById('tabSubtitleDisplay');
                if (sub) sub.style.display = 'none';
                document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
                var tj = document.getElementById('tabJadwalTanam');
                if (tj) tj.classList.add('active');
                return;
            }
            if (boxJadwal) boxJadwal.style.display = 'none';
            if (typeof _asli === 'function') _asli.apply(this, arguments);
        };
    }

    // =========================================================================
    //  CSS
    // =========================================================================
    function injeksiCSS() {
        if (document.getElementById('jmdCSS')) return;
        var s = document.createElement('style');
        s.id = 'jmdCSS';
        s.textContent =
            '#tabJadwalTanam.active{background:' + WARNA + '!important;color:#fff!important;}' +
            '#tabJadwalTanam:not(.active){color:#708099;}' +
            '#btnAnalisisOtomatis:hover{opacity:0.9;}' +
            '#btnAnalisisOtomatis:active{transform:scale(0.99);}' +
            '@keyframes jmdSpin{to{transform:rotate(360deg)}}' +
            '.jmd-spin{animation:jmdSpin 1s linear infinite;display:inline-block;}' +
            '.jmd-card{background:var(--color-background-primary,#1b273a);' +
                'border:0.5px solid rgba(255,255,255,0.08);border-radius:16px;' +
                'margin-bottom:10px;overflow:hidden;}' +
            '.jmd-card-header{padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;}' +
            '.jmd-detail{display:none;padding:0 14px 14px 14px;border-top:0.5px solid rgba(255,255,255,0.06);}' +
            'body.light-mode #boxJadwalTanam{background:#fff;color:#0f172a;}' +
            'body.light-mode .jmd-card{background:#f8fafc;border-color:#e2e8f0;}' +
            'body.light-mode .jmd-detail{background:#fff;}';
        document.head.appendChild(s);
    }

    // =========================================================================
    //  HAPUS TOMBOL LAMA
    // =========================================================================
    function hapusTombolLama() {
        var btn = document.getElementById('btnJadwalTanam');
        if (!btn) return;
        var w = btn.closest('div[style*="margin-top"]') || btn;
        if (w && w !== btn && w.parentNode) w.parentNode.removeChild(w);
        else if (btn.parentNode) btn.parentNode.removeChild(btn);
    }

    // =========================================================================
    //  INIT
    // =========================================================================
    function init() {
        injeksiCSS();
        injeksiTab();
        injeksiBox();
        patchSwitchMode();
        setTimeout(hapusTombolLama, 300);
        setTimeout(hapusTombolLama, 800);
        console.log(
            '%c✅ patch_kalender_menu_mandiri.js v2.1 — Nasional, Zero Input, Pola Iklim Adaptif',
            'color:#06b6d4;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
