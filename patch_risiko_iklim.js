/**
 * ============================================================
 * patch_risiko_iklim_v2.js
 * Versi: 2.2.0 — Zona Iklim Berbasis Data Riil ZOM (Anti-Monsunal)
 * ------------------------------------------------------------
 * Menimpa fungsi di patch_risiko_iklim.js (versi sebelumnya)
 * PERUBAHAN UTAMA (2.0.2):
 * ✅ Label grafik sekarang otomatis menambahkan "(AMAN)", 
 * "(WASPADA)", "(BAHAYA)", atau "(KRITIS)" berdasarkan skor.
 * ✅ Seluruh logika IIFE dan pencegahan bentrok tetap aman.
 * PERUBAHAN (2.1.0):
 * ✅ tentukanZonaIklim() diperbaiki dgn bounding-box tambahan agar
 *    sebagian wilayah anti-monsunal di Sulawesi & Maluku ikut kebaca.
 * PERUBAHAN BARU (2.2.0):
 * ✅ Ditambahkan DATA_ZOM_REFERENSI — 713 titik ZOM se-Indonesia yang
 *    diekstrak & diklasifikasikan langsung dari file yang diupload
 *    user (Gas_ZOM_Lokal_1_.xlsx). Tipe zona (monsunal/ekuatorial/
 *    lokal-anti-monsunal/peralihan) tiap titik sekarang DIHITUNG dari
 *    kurva curah hujan bulanan asli di file tsb (metode korelasi thd
 *    kurva acuan Aldrian & Susanto 2003), BUKAN tebakan lat/lon lagi.
 * ✅ tentukanZonaIklim() kini mencari titik ZOM referensi terdekat
 *    (radius 150 km, konsisten dgn ambang arrayZom) dan memakai tipe
 *    hasil klasifikasi data riil tsb sebagai acuan utama. Bounding-box
 *    lama tetap ada tapi hanya jadi fallback bila tak ada titik
 *    referensi dalam radius (mis. lokasi di luar cakupan data).
 * ✅ Pencocokan pola fallback (dbPola) tetap menerima nama pola
 *    "Anti Monsunal" / "Anti-Monsunal", tidak hanya "Lokal".
 * ✅ Label tampilan zona di UI menulis eksplisit
 *    "LOKAL (ANTI-MONSUNAL)", dan kini juga menampilkan titik
 *    referensi ZOM terdekat yang dipakai sebagai acuan klasifikasi.
 * ============================================================
 */

(function () {
    'use strict';
    // ============================================================
    //  1. TABEL BOBOT KORELASI PER ZONA PER BULAN
    //  [MERGED — eks patch_fix_ekspor_bobot_iklim_v1.js] Sengaja
    //  window.BOBOT_IKLIM (bukan `var` lokal) — tabel ini juga dipakai
    //  patch_deteksi_musim_v1.js & patch_jadwal_tanam_otomatis.js lewat
    //  referensi bare identifier `BOBOT_IKLIM` yang otomatis jatuh ke
    //  window jika tidak ada `var` lokal di scope manapun. Dulu perlu
    //  file terpisah untuk meng-copy ulang tabel ini ke window karena
    //  `var` di sini membuatnya privat ke closure file ini saja.
    // ============================================================
    window.BOBOT_IKLIM = {
        monsunal: {
            enso: [0.15, 0.15, 0.12, 0.10, 0.18, 0.35,
                   0.45, 0.50, 0.45, 0.35, 0.20, 0.15],
            iod:  [0.10, 0.10, 0.08, 0.08, 0.12, 0.20,
                   0.28, 0.38, 0.40, 0.30, 0.15, 0.10]
        },
        ekuatorial: {
            enso: [0.10, 0.10, 0.08, 0.08, 0.10, 0.15,
                   0.18, 0.20, 0.18, 0.15, 0.10, 0.10],
            iod:  [0.20, 0.18, 0.15, 0.12, 0.15, 0.22,
                   0.30, 0.42, 0.48, 0.38, 0.25, 0.20]
        },
        lokal: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.28, 0.25, 0.20, 0.15, 0.12],
            iod:  [0.08, 0.08, 0.08, 0.08, 0.10, 0.12,
                   0.15, 0.20, 0.22, 0.18, 0.12, 0.08]
        },
        peralihan: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.14, 0.22,
                   0.30, 0.35, 0.30, 0.25, 0.16, 0.12],
            iod:  [0.14, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.30, 0.33, 0.25, 0.18, 0.14]
        }
    };
    
    // ============================================================
    //  1B. DATA ACUAN ZOM — SUMBER: Gas_ZOM_Lokal_1_.xlsx (upload user)
    // ============================================================
    //  713 titik ZOM (Zona Musim) se-Indonesia: nama, lat, lon, dan
    //  tipe pola hujan yang DIHITUNG dari kurva curah hujan bulanan
    //  asli pada file tsb (bukan tebakan lat/lon lagi).
    //
    //  Metode klasifikasi tipe per titik (korelasi kurva, mengikuti
    //  prinsip Aldrian & Susanto 2003): kurva 12-bulan tiap titik
    //  dikorelasikan terhadap 3 kurva acuan bentuk fase —
    //  Monsunal (puncak Des-Feb/kemarau Jun-Agu), Lokal/Anti-Monsunal
    //  (persis kebalikan fase Monsunal), dan Ekuatorial (dua puncak,
    //  Mar-Apr & Okt-Nov). Tipe dengan korelasi tertinggi dipakai;
    //  jika korelasi lemah/ambigu → 'peralihan'.
    //
    //  Kode tipe: M=monsunal, E=ekuatorial, L=lokal(anti-monsunal), P=peralihan
    //  Format tiap entri: [nama, lat, lon, kodeTipe]
    var DATA_ZOM_REFERENSI = [
        ["ZONA ACEH 01",5.3881,95.503,"E"],["ZONA ACEH 02",4.7278,95.6014,"P"],["ZONA ACEH 03",5.5483,95.3238,"E"],["ZONA ACEH 04",5.3881,95.503,"E"],["ZONA ACEH 05",5.0833,96.1167,"P"],
        ["ZONA ACEH 06",5.2056,96.7028,"E"],["ZONA ACEH 07",2.2694,97.9306,"E"],["ZONA ACEH 08",5.1333,97.15,"E"],["ZONA ACEH 09",4.1333,96.1333,"E"],["ZONA ACEH 10",3.25,97.2,"E"],
        ["ZONA ACEH 11",4.2833,97.9,"E"],["ZONA ACEH 12",4.6333,96.8333,"E"],["ZONA ACEH 13",4.0833,96.6167,"E"],["ZONA ACEH 14",4.6833,95.9667,"P"],["ZONA ACEH 15",4.35,97.7167,"E"],
        ["ZONA ACEH 16",4.75,96.3833,"E"],["ZONA SUMUT 01",1.55,99.25,"P"],["ZONA SUMUT 02",1.25,99.75,"P"],["ZONA SUMUT 03",2.8333,98.3333,"E"],["ZONA SUMUT 04",2.6,98.7,"E"],
        ["ZONA SUMUT 05",1.2833,97.15,"E"],["ZONA SUMUT 06",1.9,100.1167,"E"],["ZONA SUMUT 07",3.6167,98.2167,"P"],["ZONA SUMUT 08",3.2667,98.8167,"L"],["ZONA SUMUT 09",2.8333,99.3333,"L"],
        ["ZONA SUMUT 10",2.8167,99.6167,"L"],["ZONA SUMUT 11",2.9667,99.8,"L"],["ZONA SUMUT 12",3.3167,98.6333,"E"],["ZONA SUMUT 13",2.7833,99.0333,"E"],["ZONA SUMUT 14",2.2333,99.9667,"E"],
        ["ZONA SUMUT 15",2.2833,98.6,"M"],["ZONA SUMUT 16",3.4833,98.8667,"P"],["ZONA SUMUT 17",1.7333,98.7833,"P"],["ZONA SUMUT 18",3.5952,98.6722,"L"],["ZONA SUMUT 19",3.3333,99.1667,"L"],
        ["ZONA SUMUT 20",2.8167,98.25,"E"],["ZONA SUMUT 21",2.4167,98.7167,"E"],["ZONA SUMUT 22",1.8833,100.0833,"E"],["ZONA SUMUT 23",1.3667,99.2667,"M"],["ZONA SUMUT 24",0.85,99.55,"P"],
        ["ZONA SUMUT 25",0.6167,98.3167,"P"],["ZONA SUMUT 26",2.1,98.65,"P"],["ZONA SUMBAR 01",0.0667,99.8333,"P"],["ZONA SUMBAR 02",0.4667,100.0333,"P"],["ZONA SUMBAR 03",-0.1833,100.0833,"P"],
        ["ZONA SUMBAR 04",-0.3,100.3667,"M"],["ZONA SUMBAR 05",-0.9471,100.4172,"E"],["ZONA SUMBAR 06",-0.4667,100.4,"P"],["ZONA SUMBAR 07",-0.2333,100.6333,"M"],["ZONA SUMBAR 08",-1.15,100.4333,"P"],
        ["ZONA SUMBAR 09",-0.8333,101.1667,"M"],["ZONA SUMBAR 10",-1.05,101.5667,"M"],["ZONA SUMBAR 11",-1.3333,101.0667,"M"],["ZONA SUMBAR 12",-2.1667,99.55,"P"],["ZONA RIAU 01",1.55,100.6167,"P"],
        ["ZONA RIAU 02",0.5071,101.4478,"M"],["ZONA RIAU 03",0.3,101.2167,"M"],["ZONA RIAU 04",0.1333,100.95,"M"],["ZONA RIAU 05",1.15,101.0833,"E"],["ZONA RIAU 06",1.25,102.05,"E"],
        ["ZONA RIAU 07",0.7333,101.9167,"P"],["ZONA RIAU 08",0.25,102.5833,"P"],["ZONA RIAU 09",0.35,103.4333,"E"],["ZONA RIAU 10",-0.0333,103.35,"P"],["ZONA RIAU 11",-0.3667,103.25,"P"],
        ["ZONA RIAU 12",1.5333,102.2667,"E"],["ZONA RIAU 13",1.4667,102.1333,"E"],["ZONA RIAU 14",1.1667,102.3833,"E"],["ZONA RIAU 15",0.9667,102.7333,"E"],["ZONA RIAU 16",0.9333,102.95,"E"],
        ["ZONA RIAU 17",0.5,103.2667,"E"],["ZONA RIAU 18",-0.2833,101.8167,"M"],["ZONA RIAU 19",2.15,100.5667,"E"],["ZONA RIAU 20",1.75,101.1167,"E"],["ZONA RIAU 21",1.6667,101.45,"E"],
        ["ZONA RIAU 22",1.9667,101.55,"E"],["ZONA RIAU 23",-0.2833,102.3167,"M"],["ZONA RIAU 24",-0.6833,102.4333,"M"],["ZONA RIAU 25",-0.4167,103.15,"M"],["ZONA RIAU 26",0.7667,100.4167,"M"],
        ["ZONA RIAU 27",0.85,101.35,"P"],["ZONA KEPRI 01",2.9667,105.75,"E"],["ZONA KEPRI 02",3.95,108.2,"E"],["ZONA KEPRI 03",0.9167,104.45,"E"],["ZONA KEPRI 04",1.1167,104.05,"E"],
        ["ZONA KEPRI 05",1.1,103.95,"E"],["ZONA KEPRI 06",0.8833,104.1667,"E"],["ZONA KEPRI 07",0.75,104.2333,"E"],["ZONA KEPRI 08",0.8833,103.4333,"E"],["ZONA KEPRI 09",-0.2,104.6167,"E"],
        ["ZONA KEPRI 10",-0.4167,104.4333,"E"],["ZONA KEPRI 11",-0.4833,104.4833,"E"],["ZONA KEPRI 12",3.2167,106.2333,"E"],["ZONA KEPRI 13",3.5833,108.3167,"P"],["ZONA KEPRI 14",1.0167,107.5667,"M"],
        ["ZONA JAMBI 01",-1.15,104.05,"M"],["ZONA JAMBI 02",-1.45,103.85,"M"],["ZONA JAMBI 03",-1.1167,103.2167,"M"],["ZONA JAMBI 04",-1.6101,103.6131,"M"],["ZONA JAMBI 05",-1.4833,101.9167,"M"],
        ["ZONA JAMBI 06",-2.0333,102.5167,"M"],["ZONA JAMBI 07",-2.1833,102.1333,"M"],["ZONA JAMBI 08",-1.7167,101.8167,"M"],["ZONA JAMBI 09",-1.9333,101.7667,"M"],["ZONA JAMBI 10",-2.0833,101.4667,"M"],
        ["ZONA JAMBI 11",-2.05,101.3833,"M"],["ZONA BENGKULU 01",-2.5833,101.2167,"M"],["ZONA BENGKULU 02",-2.6833,101.1833,"M"],["ZONA BENGKULU 03",-2.8167,101.1167,"M"],["ZONA BENGKULU 04",-3.0833,101.7667,"M"],
        ["ZONA BENGKULU 05",-3.3667,101.7333,"M"],["ZONA BENGKULU 06",-3.1833,102.05,"M"],["ZONA BENGKULU 07",-3.35,102.2667,"M"],["ZONA BENGKULU 08",-3.45,101.95,"M"],["ZONA BENGKULU 09",-3.6167,102.4333,"M"],
        ["ZONA BENGKULU 10",-3.6667,102.5833,"M"],["ZONA BENGKULU 11",-3.7928,102.2608,"M"],["ZONA BENGKULU 12",-3.9333,102.55,"M"],["ZONA BENGKULU 13",-4.0667,102.6667,"M"],["ZONA BENGKULU 14",-4.1167,102.5667,"P"],
        ["ZONA BENGKULU 15",-4.3667,102.9333,"P"],["ZONA BENGKULU 16",-4.5333,103.1167,"M"],["ZONA BENGKULU 17",-4.4333,103.2667,"M"],["ZONA BENGKULU 18",-5.3833,102.2833,"M"],["ZONA SUMSEL 01",-2.9909,104.7566,"M"],
        ["ZONA SUMSEL 02",-3.45,104.2167,"M"],["ZONA SUMSEL 03",-2.9167,104.7167,"M"],["ZONA SUMSEL 04",-2.55,103.8833,"M"],["ZONA SUMSEL 05",-3.3833,105.15,"M"],["ZONA SUMSEL 06",-3.65,103.85,"M"],
        ["ZONA SUMSEL 07",-2.8333,102.8667,"M"],["ZONA SUMSEL 08",-4.2167,103.8167,"M"],["ZONA SUMSEL 09",-3.75,103.1167,"M"],["ZONA SUMSEL 10",-2.6833,104.5833,"M"],["ZONA SUMSEL 11",-3.55,104.65,"M"],
        ["ZONA SUMSEL 12",-3.85,104.8167,"M"],["ZONA SUMSEL 13",-4.0167,103.2667,"M"],["ZONA SUMSEL 14",-4.4833,104.05,"M"],["ZONA BABEL 01",-1.7167,105.4167,"M"],["ZONA BABEL 02",-1.85,105.95,"M"],
        ["ZONA BABEL 03",-2.1167,106.1167,"M"],["ZONA BABEL 04",-2.5167,106.2833,"M"],["ZONA BABEL 05",-2.6833,106.5167,"M"],["ZONA BABEL 06",-2.8333,107.8833,"P"],["ZONA LAMPUNG 01",-5.5167,105.6167,"M"],
        ["ZONA LAMPUNG 02",-4.8167,105.5167,"M"],["ZONA LAMPUNG 03",-4.15,105.3833,"M"],["ZONA LAMPUNG 04",-4.7167,105.0833,"M"],["ZONA LAMPUNG 05",-5.45,105.2667,"M"],["ZONA LAMPUNG 06",-5.4167,105.1167,"M"],
        ["ZONA LAMPUNG 07",-5.15,104.8833,"M"],["ZONA LAMPUNG 08",-4.6833,104.6833,"M"],["ZONA LAMPUNG 09",-5.0167,104.2833,"M"],["ZONA LAMPUNG 10",-5.2167,104.0167,"M"],["ZONA LAMPUNG 11",-5.3833,104.1833,"M"],
        ["ZONA LAMPUNG 12",-5.4833,104.5167,"M"],["ZONA BANTENDKI 01",-6.6833,105.6167,"M"],["ZONA BANTENDKI 02",-6.4167,105.8833,"M"],["ZONA BANTENDKI 03",-6.8167,106.15,"M"],["ZONA BANTENDKI 04",-6.6833,106.3167,"M"],
        ["ZONA BANTENDKI 05",-6.4833,106.2167,"M"],["ZONA BANTENDKI 06",-6.35,105.95,"M"],["ZONA BANTENDKI 07",-6.2833,106.1167,"M"],["ZONA BANTENDKI 08",-6.0167,106.0167,"M"],["ZONA BANTENDKI 09",-6.05,106.1833,"M"],
        ["ZONA BANTENDKI 10",-6.1167,106.2833,"M"],["ZONA BANTENDKI 11",-6.25,106.45,"M"],["ZONA BANTENDKI 12",-6.2167,106.65,"M"],["ZONA BANTENDKI 13",-6.0833,106.4833,"M"],["ZONA BANTENDKI 14",-6.15,106.8167,"M"],
        ["ZONA BANTENDKI 15",-6.2,106.85,"M"],["ZONA BANTENDKI 16",-6.2833,106.8167,"M"],["ZONA JABAR 01",-7.3667,108.5667,"M"],["ZONA JABAR 02",-7.4833,108.3167,"M"],["ZONA JABAR 03",-7.25,108.4167,"M"],
        ["ZONA JABAR 04",-7.3333,108.2167,"M"],["ZONA JABAR 05",-7.15,108.0167,"M"],["ZONA JABAR 06",-7.0833,107.8167,"M"],["ZONA JABAR 07",-7.0167,107.45,"M"],["ZONA JABAR 08",-7.1167,106.8833,"M"],
        ["ZONA JABAR 09",-7.3833,106.9167,"M"],["ZONA JABAR 10",-6.75,107.3833,"M"],["ZONA JABAR 11",-6.4167,106.95,"M"],["ZONA JABAR 12",-6.8167,107.0833,"M"],["ZONA JABAR 13",-6.55,106.6167,"M"],
        ["ZONA JABAR 14",-7.1833,106.5167,"M"],["ZONA JABAR 15",-6.9167,106.9167,"M"],["ZONA JABAR 16",-7.0167,106.7833,"M"],["ZONA JABAR 17",-6.4833,107.5167,"M"],["ZONA JABAR 18",-6.7167,108.3167,"M"],
        ["ZONA JABAR 19",-6.75,107.8167,"M"],["ZONA JABAR 20",-6.9167,108.4833,"M"],["ZONA JABAR 21",-7.0833,108.3833,"M"],["ZONA JABAR 22",-6.4167,106.8833,"M"],["ZONA JABAR 23",-6.6167,106.5167,"M"],
        ["ZONA JABAR 24",-6.8833,106.65,"M"],["ZONA JABAR 25",-6.75,106.95,"M"],["ZONA JABAR 26",-7.45,107.8167,"M"],["ZONA JABAR 27",-7.15,107.4167,"M"],["ZONA JABAR 28",-7.25,107.5167,"M"],
        ["ZONA JABAR 29",-6.8167,108.6833,"M"],["ZONA JABAR 30",-6.5167,108.2833,"M"],["ZONA JABAR 31",-6.9147,107.6098,"M"],["ZONA JABAR 32",-7.05,107.7833,"M"],["ZONA JABAR 33",-6.3167,107.2167,"M"],
        ["ZONA JABAR 34",-6.4167,107.8167,"M"],["ZONA JABAR 35",-6.15,107.1167,"M"],["ZONA JABAR 36",-6.45,108.3833,"M"],["ZONA JABAR 37",-6.45,108.1167,"M"],["ZONA JABAR 38",-6.5971,106.7932,"M"],
        ["ZONA JABAR 39",-7.6833,108.3833,"E"],["ZONA JABAR 40",-7.55,107.9833,"P"],["ZONA JABAR 41",-6.65,107.65,"M"],["ZONA JATENG 01",-6.8667,109.05,"M"],["ZONA JATENG 02",-7.0167,108.95,"M"],
        ["ZONA JATENG 03",-7.2167,108.85,"M"],["ZONA JATENG 04",-7.3833,108.75,"M"],["ZONA JATENG 05",-7.4833,109.1167,"M"],["ZONA JATENG 06",-7.5833,108.95,"M"],["ZONA JATENG 07",-7.7167,109.0167,"P"],
        ["ZONA JATENG 08",-7.55,109.4167,"M"],["ZONA JATENG 09",-7.35,109.25,"M"],["ZONA JATENG 10",-7.15,109.1167,"M"],["ZONA JATENG 11",-7.0167,109.4167,"M"],["ZONA JATENG 12",-6.8833,109.5167,"M"],
        ["ZONA JATENG 13",-7.0833,109.55,"M"],["ZONA JATENG 14",-7.15,109.4833,"M"],["ZONA JATENG 15",-7.25,109.55,"M"],["ZONA JATENG 16",-7.4167,109.6833,"M"],["ZONA JATENG 17",-7.6167,109.6167,"M"],
        ["ZONA JATENG 18",-7.7833,109.8833,"M"],["ZONA JATENG 19",-7.65,109.9167,"M"],["ZONA JATENG 20",-7.3833,109.85,"M"],["ZONA JATENG 21",-7.25,109.8833,"M"],["ZONA JATENG 22",-7.0833,109.8167,"M"],
        ["ZONA JATENG 23",-6.95,109.9167,"M"],["ZONA JATENG 24",-6.9932,110.4203,"M"],["ZONA JATENG 25",-7.15,110.15,"M"],["ZONA JATENG 26",-7.3167,110.05,"M"],["ZONA JATENG 27",-7.55,110.0833,"M"],
        ["ZONA JATENG 28",-7.4833,110.2167,"M"],["ZONA JATENG 29",-7.35,110.35,"M"],["ZONA JATENG 30",-7.1833,110.3167,"M"],["ZONA JATENG 31",-7.05,110.65,"M"],["ZONA JATENG 32",-7.3833,110.4833,"M"],
        ["ZONA JATENG 33",-7.5833,110.5833,"M"],["ZONA JATENG 34",-7.6833,110.6833,"M"],["ZONA JATENG 35",-7.8167,110.95,"M"],["ZONA JATENG 36",-8.0167,110.9167,"M"],["ZONA JATENG 37",-7.7167,111.0833,"M"],
        ["ZONA JATENG 38",-7.75,111.25,"M"],["ZONA JATENG 39",-7.5561,110.8317,"M"],["ZONA JATENG 40",-7.45,110.85,"M"],["ZONA JATENG 41",-7.3167,110.9167,"M"],["ZONA JATENG 42",-7.15,110.8167,"M"],
        ["ZONA JATENG 43",-6.95,110.75,"M"],["ZONA JATENG 44",-6.8167,110.65,"M"],["ZONA JATENG 45",-6.6167,110.75,"M"],["ZONA JATENG 46",-6.7167,110.8833,"M"],["ZONA JATENG 47",-6.8833,111.0167,"M"],
        ["ZONA JATENG 48",-6.75,111.1833,"M"],["ZONA JATENG 49",-6.7167,111.45,"M"],["ZONA JATENG 50",-7.0167,111.3167,"M"],["ZONA JATENG 51",-7.0833,111.1167,"M"],["ZONA JATENG 52",-7.2167,111.25,"M"],
        ["ZONA JATENG 53",-7.15,111.5167,"M"],["ZONA JATENG 54",-5.85,110.45,"M"],["ZONA DIY 01",-7.7167,110.1833,"M"],["ZONA DIY 02",-7.6833,110.35,"M"],["ZONA DIY 03",-7.8167,110.25,"M"],
        ["ZONA DIY 04",-7.7956,110.3695,"M"],["ZONA DIY 05",-7.85,110.55,"M"],["ZONA DIY 06",-7.9167,110.15,"M"],["ZONA DIY 07",-7.95,110.3167,"M"],["ZONA DIY 08",-8.05,110.5833,"M"],
        ["ZONA JATIM 01",-8.1833,111.05,"M"],["ZONA JATIM 02",-8.0167,111.2167,"M"],["ZONA JATIM 03",-8.1833,111.35,"M"],["ZONA JATIM 04",-8.2833,111.6167,"M"],["ZONA JATIM 05",-8.15,111.75,"M"],
        ["ZONA JATIM 06",-7.8833,111.4833,"M"],["ZONA JATIM 07",-7.6833,111.3833,"M"],["ZONA JATIM 08",-7.45,111.25,"M"],["ZONA JATIM 09",-7.25,111.6167,"M"],["ZONA JATIM 10",-6.9167,111.75,"M"],
        ["ZONA JATIM 11",-6.95,111.95,"M"],["ZONA JATIM 12",-7.0833,112.1833,"M"],["ZONA JATIM 13",-7.3167,112.0167,"M"],["ZONA JATIM 14",-7.4833,111.65,"M"],["ZONA JATIM 15",-7.5833,111.8833,"M"],
        ["ZONA JATIM 16",-7.8167,112.0167,"M"],["ZONA JATIM 17",-7.95,111.75,"M"],["ZONA JATIM 18",-8.0833,112.0167,"M"],["ZONA JATIM 19",-8.2167,111.95,"M"],["ZONA JATIM 20",-8.25,112.35,"M"],
        ["ZONA JATIM 21",-8.0833,112.1833,"M"],["ZONA JATIM 22",-7.6833,112.1167,"M"],["ZONA JATIM 23",-7.55,112.3167,"M"],["ZONA JATIM 24",-7.25,112.4167,"M"],["ZONA JATIM 25",-7.0167,112.3833,"M"],
        ["ZONA JATIM 26",-6.95,112.5167,"M"],["ZONA JATIM 27",-7.2167,112.5833,"M"],["ZONA JATIM 28",-7.2504,112.7688,"M"],["ZONA JATIM 29",-7.45,112.55,"M"],["ZONA JATIM 30",-7.6167,112.45,"M"],
        ["ZONA JATIM 31",-7.7167,112.65,"M"],["ZONA JATIM 32",-7.55,112.75,"M"],["ZONA JATIM 33",-7.8167,112.7167,"M"],["ZONA JATIM 34",-7.8667,112.5167,"M"],["ZONA JATIM 35",-8.05,112.45,"M"],
        ["ZONA JATIM 36",-7.9833,112.6333,"M"],["ZONA JATIM 37",-8.2833,112.5833,"M"],["ZONA JATIM 38",-8.25,112.85,"M"],["ZONA JATIM 39",-8.1833,113.1167,"M"],["ZONA JATIM 40",-7.95,112.85,"M"],
        ["ZONA JATIM 41",-7.8167,113.0833,"M"],["ZONA JATIM 42",-7.65,112.9167,"M"],["ZONA JATIM 43",-7.75,113.2167,"M"],["ZONA JATIM 44",-7.95,113.3167,"M"],["ZONA JATIM 45",-8.05,113.4833,"M"],
        ["ZONA JATIM 46",-8.35,113.4167,"M"],["ZONA JATIM 47",-8.3833,113.7167,"M"],["ZONA JATIM 48",-8.15,113.7833,"M"],["ZONA JATIM 49",-7.9833,113.8833,"M"],["ZONA JATIM 50",-8.05,113.95,"M"],
        ["ZONA JATIM 51",-7.9167,113.75,"M"],["ZONA JATIM 52",-7.8167,113.5833,"M"],["ZONA JATIM 53",-7.6833,113.8833,"M"],["ZONA JATIM 54",-7.7833,113.9833,"M"],["ZONA JATIM 55",-7.75,114.15,"M"],
        ["ZONA JATIM 56",-7.9833,114.4167,"M"],["ZONA JATIM 57",-8.1167,114.15,"M"],["ZONA JATIM 58",-8.15,114.35,"M"],["ZONA JATIM 59",-8.35,114.2833,"M"],["ZONA JATIM 60",-8.2833,114.05,"M"],
        ["ZONA JATIM 61",-8.55,114.1833,"M"],["ZONA JATIM 62",-7.15,112.85,"M"],["ZONA JATIM 63",-6.95,112.95,"M"],["ZONA JATIM 64",-7.1167,113.1167,"M"],["ZONA JATIM 65",-6.95,113.2167,"M"],
        ["ZONA JATIM 66",-6.9167,113.3833,"M"],["ZONA JATIM 67",-7.15,113.35,"M"],["ZONA JATIM 68",-7.15,113.6167,"M"],["ZONA JATIM 69",-6.9833,113.5833,"M"],["ZONA JATIM 70",-6.95,113.8167,"M"],
        ["ZONA JATIM 71",-7.05,114.05,"M"],["ZONA JATIM 72",-6.9167,115.25,"M"],["ZONA JATIM 73",-5.55,114.45,"M"],["ZONA JATIM 74",-5.7833,112.65,"M"],["ZONA KALBAR 01",-2.45,110.3833,"M"],
        ["ZONA KALBAR 02",-1.45,110.75,"M"],["ZONA KALBAR 03",0.8833,109.85,"M"],["ZONA KALBAR 04",0.6167,108.9833,"E"],["ZONA KALBAR 05",1.4833,109.35,"M"],["ZONA KALBAR 06",-1.05,110.0167,"M"],
        ["ZONA KALBAR 07",0.7833,112.5167,"M"],["ZONA KALBAR 08",0.5167,111.75,"M"],["ZONA KALBAR 09",-0.05,111.3833,"M"],["ZONA KALBAR 10",-0.3833,110.1833,"M"],["ZONA KALBAR 11",0.3833,110.85,"M"],
        ["ZONA KALBAR 12",-0.1167,110.85,"M"],["ZONA KALBAR 13",-0.0227,109.3425,"E"],["ZONA KALBAR 14",-1.15,109.8167,"P"],["ZONA KALBAR 15",1.0167,109.2833,"P"],["ZONA KALTENG 01",-0.25,114.15,"M"],
        ["ZONA KALTENG 02",-0.75,114.5167,"M"],["ZONA KALTENG 03",-1.15,113.85,"M"],["ZONA KALTENG 04",-1.25,112.9167,"M"],["ZONA KALTENG 05",-0.9167,114.85,"M"],["ZONA KALTENG 06",-1.5167,114.85,"M"],
        ["ZONA KALTENG 07",-1.95,114.15,"M"],["ZONA KALTENG 08",-1.75,112.65,"M"],["ZONA KALTENG 09",-2.15,111.85,"M"],["ZONA KALTENG 10",-2.65,112.65,"M"],["ZONA KALTENG 11",-2.05,114.95,"M"],
        ["ZONA KALTENG 12",-3.0167,114.15,"M"],["ZONA KALTENG 13",-3.1167,112.2833,"M"],["ZONA KALTARA 01",2.7833,117.25,"M"],["ZONA KALTARA 02",4.1167,117.85,"L"],["ZONA KALTARA 03",4.05,117.65,"L"],
        ["ZONA KALTARA 04",3.3167,117.5833,"E"],["ZONA KALTARA 05",3.8167,116.85,"E"],["ZONA KALTARA 06",2.95,116.9167,"M"],["ZONA KALTARA 07",2.15,115.35,"M"],["ZONA KALTIM 01",2.05,117.15,"P"],
        ["ZONA KALTIM 02",1.55,116.85,"M"],["ZONA KALTIM 03",0.85,115.5167,"M"],["ZONA KALTIM 04",0.35,115.4167,"M"],["ZONA KALTIM 05",-1.25,116.85,"M"],["ZONA KALTIM 06",-1.15,116.7167,"M"],
        ["ZONA KALTIM 07",-0.75,116.5167,"M"],["ZONA KALTIM 08",-0.25,117.15,"M"],["ZONA KALTIM 09",0.25,117.05,"M"],["ZONA KALTIM 10",1.45,117.4167,"M"],["ZONA KALTIM 11",1.15,117.8167,"M"],
        ["ZONA KALTIM 12",0.15,116.45,"M"],["ZONA KALTIM 13",0.35,116.75,"M"],["ZONA KALTIM 14",-0.85,116.05,"M"],["ZONA KALTIM 15",-1.85,116.15,"M"],["ZONA KALTIM 16",0.1333,117.4833,"M"],
        ["ZONA KALTIM 17",-0.05,116.3167,"M"],["ZONA KALTIM 18",1.25,116.5167,"M"],["ZONA KALTIM 19",-1.55,115.95,"M"],["ZONA KALTIM 20",0.65,116.85,"M"],["ZONA KALSEL 01",-3.9167,114.95,"M"],
        ["ZONA KALSEL 02",-3.35,115.85,"M"],["ZONA KALSEL 03",-3.45,116.35,"M"],["ZONA KALSEL 04",-3.85,116.15,"M"],["ZONA KALSEL 05",-3.4167,116.1167,"M"],["ZONA KALSEL 06",-3.65,115.15,"M"],
        ["ZONA KALSEL 07",-3.0167,115.8167,"M"],["ZONA KALSEL 08",-1.85,115.45,"M"],["ZONA KALSEL 09",-2.75,115.15,"M"],["ZONA KALSEL 10",-2.35,115.35,"M"],["ZONA KALSEL 11",-3.05,114.75,"M"],
        ["ZONA KALSEL 12",-2.25,115.45,"M"],["ZONA BALI 01",-8.3167,114.6167,"M"],["ZONA BALI 02",-8.1833,114.5167,"M"],["ZONA BALI 03",-8.1833,114.75,"M"],["ZONA BALI 04",-8.3833,114.85,"M"],
        ["ZONA BALI 05",-8.35,115.0167,"M"],["ZONA BALI 06",-8.25,115.2167,"M"],["ZONA BALI 07",-8.3167,115.1167,"M"],["ZONA BALI 08",-8.15,115.0167,"M"],["ZONA BALI 09",-8.0833,115.2167,"M"],
        ["ZONA BALI 10",-8.25,115.3833,"M"],["ZONA BALI 11",-8.1833,115.3833,"M"],["ZONA BALI 12",-8.35,115.5833,"M"],["ZONA BALI 13",-8.3833,115.4833,"M"],["ZONA BALI 14",-8.4833,115.3833,"M"],
        ["ZONA BALI 15",-8.45,115.25,"M"],["ZONA BALI 16",-8.55,115.25,"M"],["ZONA BALI 17",-8.4833,115.4833,"M"],["ZONA BALI 18",-8.55,115.3833,"M"],["ZONA BALI 19",-8.6705,115.2126,"M"],
        ["ZONA BALI 20",-8.75,115.5167,"M"],["ZONA NTB 01",-8.5833,116.1167,"M"],["ZONA NTB 02",-8.35,116.1833,"M"],["ZONA NTB 03",-8.25,116.3167,"M"],["ZONA NTB 04",-8.35,116.35,"M"],
        ["ZONA NTB 05",-8.45,116.4833,"M"],["ZONA NTB 06",-8.55,116.5833,"M"],["ZONA NTB 07",-8.75,116.45,"M"],["ZONA NTB 08",-8.7167,116.2833,"M"],["ZONA NTB 09",-8.8167,116.15,"M"],
        ["ZONA NTB 10",-8.5167,116.25,"M"],["ZONA NTB 11",-8.75,116.75,"M"],["ZONA NTB 12",-8.45,117.05,"M"],["ZONA NTB 13",-8.55,117.3167,"M"],["ZONA NTB 14",-8.75,117.25,"M"],
        ["ZONA NTB 15",-8.9167,116.95,"M"],["ZONA NTB 16",-8.95,117.35,"M"],["ZONA NTB 17",-8.85,117.65,"M"],["ZONA NTB 18",-8.55,117.75,"M"],["ZONA NTB 19",-8.55,118.05,"M"],
        ["ZONA NTB 20",-8.35,118.25,"M"],["ZONA NTB 21",-8.15,118.35,"M"],["ZONA NTB 22",-8.65,118.25,"M"],["ZONA NTB 23",-8.5833,118.5167,"M"],["ZONA NTB 24",-8.35,118.65,"M"],
        ["ZONA NTB 25",-8.4667,118.7167,"M"],["ZONA NTB 26",-8.7167,118.75,"M"],["ZONA NTB 27",-8.7833,118.9167,"M"],["ZONA NTT 01",-8.35,120.25,"M"],["ZONA NTT 02",-8.55,120.75,"M"],
        ["ZONA NTT 03",-9.55,119.15,"M"],["ZONA NTT 04",-9.65,119.55,"M"],["ZONA NTT 05",-10.05,120.45,"M"],["ZONA NTT 06",-10.55,121.85,"M"],["ZONA NTT 07",-10.75,123.05,"M"],
        ["ZONA NTT 08",-10.1667,123.5833,"M"],["ZONA NTT 09",-10.15,124.05,"M"],["ZONA NTT 10",-8.5833,120.05,"M"],["ZONA NTT 11",-8.65,120.45,"M"],["ZONA NTT 12",-8.35,124.75,"M"],
        ["ZONA NTT 13",-8.25,124.25,"M"],["ZONA NTT 14",-8.75,119.55,"M"],["ZONA NTT 15",-8.45,123.55,"M"],["ZONA NTT 16",-8.8167,120.35,"M"],["ZONA NTT 17",-9.25,124.8167,"M"],
        ["ZONA NTT 18",-8.25,123.05,"M"],["ZONA NTT 19",-9.45,124.85,"M"],["ZONA NTT 20",-8.75,121.05,"M"],["ZONA NTT 21",-8.75,122.05,"M"],["ZONA NTT 22",-8.55,121.75,"M"],
        ["ZONA NTT 23",-9.75,124.25,"M"],["ZONA NTT 24",-9.35,119.75,"M"],["ZONA NTT 25",-9.75,123.75,"M"],["ZONA NTT 26",-9.85,124.45,"M"],["ZONA NTT 27",-10.05,123.95,"M"],
        ["ZONA NTT 28",-9.65,124.75,"M"],["ZONA SULUT 01",0.9167,123.85,"M"],["ZONA SULUT 02",1.25,124.5167,"M"],["ZONA SULUT 03",1.4833,124.8167,"M"],["ZONA SULUT 04",0.75,124.3167,"E"],
        ["ZONA SULUT 05",0.45,123.85,"P"],["ZONA SULUT 06",0.35,124.05,"L"],["ZONA SULUT 07",0.95,124.6167,"P"],["ZONA SULUT 08",1.05,124.85,"P"],["ZONA SULUT 09",1.35,125.05,"M"],
        ["ZONA SULUT 10",3.55,125.55,"M"],["ZONA GORONTALO 01",0.9167,122.85,"M"],["ZONA GORONTALO 02",0.85,122.15,"M"],["ZONA GORONTALO 03",0.7167,121.35,"M"],["ZONA GORONTALO 04",0.55,121.75,"M"],
        ["ZONA GORONTALO 05",0.6833,122.55,"M"],["ZONA GORONTALO 06",0.5435,123.0595,"M"],["ZONA GORONTALO 07",0.45,122.25,"P"],["ZONA GORONTALO 08",0.4167,123.25,"M"],["ZONA SULTENG 01",-1.25,119.75,"E"],
        ["ZONA SULTENG 02",-2.15,121.05,"M"],["ZONA SULTENG 03",-1.65,120.05,"P"],["ZONA SULTENG 04",-2.75,122.15,"M"],["ZONA SULTENG 05",-0.25,121.75,"E"],["ZONA SULTENG 06",-1.15,119.85,"P"],
        ["ZONA SULTENG 07",0.15,120.15,"M"],["ZONA SULTENG 08",0.55,120.35,"M"],["ZONA SULTENG 09",-0.35,119.85,"M"],["ZONA SULTENG 10",0.25,119.95,"M"],["ZONA SULTENG 11",1.15,121.05,"M"],
        ["ZONA SULTENG 12",1.25,120.75,"M"],["ZONA SULTENG 13",1.35,121.85,"M"],["ZONA SULTENG 14",-2.05,121.35,"M"],["ZONA SULTENG 15",-0.8917,119.8707,"M"],["ZONA SULTENG 16",-0.75,120.05,"P"],
        ["ZONA SULTENG 17",-1.05,119.95,"E"],["ZONA SULTENG 18",-1.75,121.35,"P"],["ZONA SULTENG 19",-1.45,121.95,"P"],["ZONA SULTENG 20",-1.65,122.35,"L"],["ZONA SULTENG 21",-1.15,121.85,"P"],
        ["ZONA SULTENG 22",-1.05,121.55,"E"],["ZONA SULTENG 23",-0.95,122.85,"P"],["ZONA SULTENG 24",-1.45,123.15,"P"],["ZONA SULTENG 25",-1.25,122.75,"P"],["ZONA SULTENG 26",-1.25,120.15,"E"],
        ["ZONA SULTENG 27",-1.45,120.35,"E"],["ZONA SULTENG 28",-1.05,120.35,"E"],["ZONA SULTENG 29",-1.35,120.65,"E"],["ZONA SULBAR 01",-1.15,119.45,"M"],["ZONA SULBAR 02",-1.35,119.35,"M"],
        ["ZONA SULBAR 03",-1.65,119.35,"P"],["ZONA SULBAR 04",-2.15,119.25,"M"],["ZONA SULBAR 05",-2.55,119.35,"P"],["ZONA SULBAR 06",-2.65,119.55,"P"],["ZONA SULBAR 07",-2.75,119.15,"P"],
        ["ZONA SULBAR 08",-2.25,119.45,"M"],["ZONA SULBAR 09",-2.95,119.45,"M"],["ZONA SULBAR 10",-2.55,119.65,"M"],["ZONA SULBAR 11",-3.25,119.15,"P"],["ZONA SULBAR 12",-3.15,118.95,"P"],
        ["ZONA SULBAR 13",-3.35,119.25,"M"],["ZONA SULBAR 14",-3.45,118.95,"M"],["ZONA SULSEL 01",-6.15,120.45,"M"],["ZONA SULSEL 02",-5.45,119.45,"M"],["ZONA SULSEL 03",-5.65,119.75,"M"],
        ["ZONA SULSEL 04",-5.55,119.95,"M"],["ZONA SULSEL 05",-5.35,120.25,"E"],["ZONA SULSEL 06",-5.1449,119.4149,"M"],["ZONA SULSEL 07",-4.85,119.75,"M"],["ZONA SULSEL 08",-5.15,120.05,"M"],
        ["ZONA SULSEL 09",-5.15,120.25,"E"],["ZONA SULSEL 10",-4.35,119.75,"M"],["ZONA SULSEL 11",-4.15,119.85,"P"],["ZONA SULSEL 12",-4.55,119.85,"M"],["ZONA SULSEL 13",-4.65,120.25,"E"],
        ["ZONA SULSEL 14",-3.85,119.95,"E"],["ZONA SULSEL 15",-3.95,119.65,"M"],["ZONA SULSEL 16",-3.65,119.95,"E"],["ZONA SULSEL 17",-3.75,120.15,"E"],["ZONA SULSEL 18",-3.45,119.65,"M"],
        ["ZONA SULSEL 19",-3.15,119.85,"M"],["ZONA SULSEL 20",-3.25,120.25,"P"],["ZONA SULSEL 21",-2.85,120.05,"M"],["ZONA SULSEL 22",-2.75,120.25,"M"],["ZONA SULSEL 23",-2.55,120.85,"M"],
        ["ZONA SULSEL 24",-2.65,121.25,"M"],["ZONA SULTRA 01",-4.25,121.65,"M"],["ZONA SULTRA 02",-3.85,121.85,"M"],["ZONA SULTRA 03",-4.15,121.95,"M"],["ZONA SULTRA 04",-3.65,122.15,"M"],
        ["ZONA SULTRA 05",-4.35,122.25,"M"],["ZONA SULTRA 06",-3.15,121.15,"M"],["ZONA SULTRA 07",-3.75,121.85,"M"],["ZONA SULTRA 08",-3.45,122.15,"M"],["ZONA SULTRA 09",-5.55,123.75,"M"],
        ["ZONA SULTRA 10",-3.9667,122.5833,"M"],["ZONA SULTRA 11",-4.85,122.45,"M"],["ZONA SULTRA 12",-5.25,122.75,"M"],["ZONA SULTRA 13",-5.45,122.45,"M"],["ZONA SULTRA 14",-4.65,121.85,"M"],
        ["ZONA SULTRA 15",-4.85,121.95,"M"],["ZONA SULTRA 16",-5.35,121.95,"M"],["ZONA SULTRA 17",-5.45,122.15,"M"],["ZONA SULTRA 18",-3.65,121.35,"P"],["ZONA SULTRA 19",-3.45,121.25,"E"],
        ["ZONA MALUT 01",1.55,127.55,"E"],["ZONA MALUT 02",1.85,127.95,"P"],["ZONA MALUT 03",1.35,128.25,"M"],["ZONA MALUT 04",1.45,127.85,"M"],["ZONA MALUT 05",2.15,128.35,"M"],
        ["ZONA MALUT 06",0.7833,127.3833,"P"],["ZONA MALUT 07",0.45,128.05,"M"],["ZONA MALUT 08",0.15,127.65,"P"],["ZONA MALUT 09",-0.65,127.55,"M"],["ZONA MALUT 10",-0.85,127.85,"M"],
        ["ZONA MALUT 11",-0.35,128.15,"P"],["ZONA MALUT 12",-1.85,124.45,"M"],["ZONA MALUT 13",-1.95,125.85,"M"],["ZONA MALUT 14",-2.15,126.15,"P"],["ZONA MALUT 15",0.25,128.25,"P"],
        ["ZONA MALUKU 01",-3.25,126.15,"P"],["ZONA MALUKU 02",-3.45,126.35,"P"],["ZONA MALUKU 03",-3.55,126.65,"P"],["ZONA MALUKU 04",-3.15,126.85,"M"],["ZONA MALUKU 05",-3.35,126.95,"M"],
        ["ZONA MALUKU 06",-3.65,127.15,"P"],["ZONA MALUKU 07",-2.95,128.15,"M"],["ZONA MALUKU 08",-3.15,128.45,"L"],["ZONA MALUKU 09",-3.35,128.25,"L"],["ZONA MALUKU 10",-3.6958,128.1814,"L"],
        ["ZONA MALUKU 11",-3.15,128.85,"L"],["ZONA MALUKU 12",-3.45,128.95,"L"],["ZONA MALUKU 13",-3.25,129.35,"L"],["ZONA MALUKU 14",-2.95,129.85,"P"],["ZONA MALUKU 15",-3.15,130.35,"M"],
        ["ZONA MALUKU 16",-5.55,132.65,"M"],["ZONA MALUKU 17",-5.75,132.85,"M"],["ZONA MALUKU 18",-5.95,132.95,"M"],["ZONA MALUKU 19",-5.45,134.45,"M"],["ZONA MALUKU 20",-6.15,134.25,"M"],
        ["ZONA MALUKU 21",-6.35,134.75,"M"],["ZONA MALUKU 22",-6.85,134.25,"M"],["ZONA MALUKU 23",-7.35,131.25,"M"],["ZONA MALUKU 24",-7.65,131.45,"M"],["ZONA MALUKU 25",-8.15,129.85,"M"],
        ["ZONA PAPBAR 01",-0.85,133.85,"P"],["ZONA PAPBAR 02",-0.8667,134.0833,"M"],["ZONA PAPBAR 03",-1.35,134.15,"M"],["ZONA PAPBAR 04",-2.15,133.75,"M"],["ZONA PAPBAR 05",-1.15,133.85,"L"],
        ["ZONA PAPBAR 06",-1.45,134.05,"L"],["ZONA PAPBAR 07",-3.35,133.75,"L"],["ZONA PAPBAR 08",-3.15,134.15,"M"],["ZONA PAPBAR 09",-3.65,133.15,"M"],["ZONA PAPBAR 10",-2.95,132.25,"P"],
        ["ZONA PAPBAR 11",-3.25,132.65,"E"],["ZONA PAPBAR 12",-1.75,132.15,"M"],["ZONA PAPBAR 13",-0.95,133.25,"L"],["ZONA PAPBAR 14",-0.65,132.75,"L"],["ZONA PAPBAR 15",-0.85,132.45,"L"],
        ["ZONA PAPBAR 16",-1.25,132.35,"L"],["ZONA PAPBAR 17",-0.8833,131.25,"L"],["ZONA PAPBAR 18",-0.4167,130.8167,"L"],["ZONA PAPBAR 19",-1.85,130.15,"M"],["ZONA PAPBAR 20",-1.65,132.65,"M"],
        ["ZONA PAPBAR 21",-1.95,133.25,"E"],["ZONA PAPUA 01",-2.5337,140.7181,"M"],["ZONA PAPUA 02",-2.25,139.85,"M"],["ZONA PAPUA 03",-1.95,139.35,"M"],["ZONA PAPUA 04",-1.85,138.85,"M"],
        ["ZONA PAPUA 05",-1.75,136.25,"M"],["ZONA PAPUA 06",-0.85,135.85,"M"],["ZONA PAPUA 07",-1.15,136.05,"M"],["ZONA PAPUA 08",-3.15,140.65,"M"],["ZONA PAPUA 09",-2.85,140.15,"M"],
        ["ZONA PAPUA 10",-2.35,139.25,"M"],["ZONA PAPUA 11",-2.65,138.85,"M"],["ZONA PAPUA 12",-2.15,136.85,"L"],["ZONA PAPUA 13",-3.85,140.45,"M"],["ZONA PAPUA 14",-2.85,139.65,"M"],
        ["ZONA PAPUA 15",-3.15,139.15,"M"],["ZONA PAPUA 16",-3.65,139.25,"M"],["ZONA PAPUA 17",-3.25,137.45,"L"],["ZONA PAPUA 18",-3.65,137.25,"P"],["ZONA PAPUA 19",-3.35,136.15,"P"],
        ["ZONA PAPUA 20",-4.55,140.65,"M"],["ZONA PAPUA 21",-4.65,139.85,"M"],["ZONA PAPUA 22",-4.15,138.95,"M"],["ZONA PAPUA 23",-4.25,137.65,"M"],["ZONA PAPUA 24",-3.85,137.15,"P"],
        ["ZONA PAPUA 25",-3.65,135.55,"P"],["ZONA PAPUA 26",-3.95,135.15,"L"],["ZONA PAPUA 27",-4.85,140.85,"M"],["ZONA PAPUA 28",-4.95,140.15,"M"],["ZONA PAPUA 29",-4.85,139.35,"M"],
        ["ZONA PAPUA 30",-4.35,136.25,"M"],["ZONA PAPSEL 01",-4.25,135.65,"M"],["ZONA PAPSEL 02",-4.45,135.85,"P"],["ZONA PAPSEL 03",-4.65,136.25,"P"],["ZONA PAPSEL 04",-5.15,137.15,"P"],
        ["ZONA PAPSEL 05",-5.15,138.15,"M"],["ZONA PAPSEL 06",-4.85,137.85,"M"],["ZONA PAPSEL 07",-5.45,139.15,"M"],["ZONA PAPSEL 08",-5.85,139.85,"M"],["ZONA PAPSEL 09",-6.25,140.15,"M"],
        ["ZONA PAPSEL 10",-6.85,140.25,"M"],["ZONA PAPSEL 11",-7.85,139.85,"M"],["ZONA PAPSEL 12",-8.4991,140.4018,"M"],["ZONA PAPSEL 13",-8.25,140.85,"M"],["Tempe",-4.1318,120.0466,"E"],
        ["Sabbangparu",-4.2128,119.9904,"E"],["Pammana",-4.186,120.0898,"E"],["Bola",-4.2135,120.2424,"P"],["Takkalalla",-4.1517,120.2914,"P"],["Sajoanging",-3.96,120.2824,"P"],
        ["Majauleng",-4.0375,120.157,"P"],["Maniangpajo",-3.9023,120.0853,"P"],["Pitumpanua",-3.7136,120.3687,"P"],["Keera",-3.8108,120.296,"P"],["Belawa",-3.9843,119.9564,"E"],
        ["Gilireng",-3.8863,120.1915,"P"],["Penrang",-4.0788,120.2547,"P"],["Tanasitolo",-4.0448,120.0577,"E"]
    ];

    var KODE_TIPE_ZONA = { M: 'monsunal', E: 'ekuatorial', L: 'lokal', P: 'peralihan' };

    // Jarak Haversine lokal (independen dari fungsi global lain, agar
    // patch ini tetap jalan meski hitungJarakHaversine() belum ter-load)
    function _haversineLokal(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Radius maksimum (km) agar sebuah titik GPS dianggap "diwakili"
    // oleh titik ZOM referensi terdekat. Selaras dengan ambang 150 km
    // yang sudah dipakai di prosesAnalisisKalender() untuk arrayZom.
    var RADIUS_MAKS_ZOM_REFERENSI = 150;

    // Cari titik ZOM referensi terdekat dari DATA_ZOM_REFERENSI.
    // Return null jika tidak ada titik dalam radius maksimum.
    function cariZonaDariDataReferensi(lat, lon) {
        var terdekat = null;
        var jarakMin = Infinity;
        for (var i = 0; i < DATA_ZOM_REFERENSI.length; i++) {
            var titik = DATA_ZOM_REFERENSI[i];
            var jarak = _haversineLokal(lat, lon, titik[1], titik[2]);
            if (jarak < jarakMin) {
                jarakMin = jarak;
                terdekat = titik;
            }
        }
        if (!terdekat || jarakMin > RADIUS_MAKS_ZOM_REFERENSI) return null;
        return { nama: terdekat[0], jarak: jarakMin, tipe: KODE_TIPE_ZONA[terdekat[3]] || 'monsunal' };
    }

    // ============================================================
    //  2. PENENTUAN ZONA IKLIM BERDASARKAN KOORDINAT GPS
    // ============================================================
    //  PRIORITAS 1 — data asli (DATA_ZOM_REFERENSI, dari file yang
    //  diupload user Gas_ZOM_Lokal_1_.xlsx): kalau ada titik referensi
    //  dalam radius 150 km, tipe zona-nya dipakai apa adanya —
    //  ini "acuan anti-monsunal" yang sebenarnya, bukan tebakan.
    //  PRIORITAS 2 — fallback ke bounding-box geografis kasar (dipakai
    //  hanya kalau tak ada titik referensi terdekat, mis. lokasi di
    //  luar cakupan data atau di lautan lepas).
    function tentukanZonaIklim(lat, lon) {
        var dariData = cariZonaDariDataReferensi(lat, lon);
        if (dariData) return dariData.tipe;
        return _tentukanZonaIklimFallback(lat, lon);
    }

    // [KONSISTENSI-FIX] Dipakai di SELURUH kode render bawah (namaZona,
    // zonaLabel, baseline lookup) — bukan bare `tentukanZonaIklim(...)`.
    // Kalau patch_fix_integrasi_6faktor_v1.js sudah memasang
    // window.tentukanZonaIklim versi "satu sumber" (delegasi ke
    // _deteksiZonaIklimV2 6-zona, yang sejak fix ini JUGA sudah
    // memprioritaskan DATA_ZOM_REFERENSI di atas), pakai itu supaya
    // label yang tampil di sini SELALU sama dengan Kalender TNM dan
    // Kesimpulan Iklim Terpadu. Kalau belum terpasang (mis. urutan
    // <script> berubah), jatuh ke versi lokal file ini sebagai jaring
    // pengaman — sudah sama-sama memprioritaskan DATA_ZOM_REFERENSI juga.
    function tentukanZonaIklimAktif(lat, lon) {
        if (typeof window.tentukanZonaIklim === 'function' && window.tentukanZonaIklim.__satuSumber) {
            return window.tentukanZonaIklim(lat, lon);
        }
        return tentukanZonaIklim(lat, lon);
    }

    // Fallback bounding-box (dipertahankan sebagai jaring pengaman saja;
    // TIDAK lagi jadi acuan utama sejak DATA_ZOM_REFERENSI tersedia)
    function _tentukanZonaIklimFallback(lat, lon) {
        var antiMonsunalSulawesi =
            (lat >= -6.2 && lat <= -0.3 && lon >= 121.3 && lon <= 125.8);
        var antiMonsunalMaluku =
            (lat >= -8.5 && lat <= 3.0 && lon >= 124.0 && lon < 128);

        if (antiMonsunalSulawesi || antiMonsunalMaluku) return 'lokal';
        if (lon >= 128) return 'lokal';
        if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) return 'ekuatorial';
        if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) return 'peralihan';
        return 'monsunal';
    }

    // Nama tampilan tiap zona untuk ditampilkan ke pengguna di UI
    var NAMA_ZONA_TAMPIL = {
        monsunal  : 'MONSUNAL',
        ekuatorial: 'EKUATORIAL',
        lokal     : 'LOKAL (ANTI-MONSUNAL)',
        peralihan : 'PERALIHAN'
    };
    function namaZonaTampil(zona) {
        return NAMA_ZONA_TAMPIL[zona] || String(zona).toUpperCase();
    }
    
    // ============================================================
    //  3. HITUNG WETNESS SCORE (VERSI REVISI LEBIH SENSITIF)
    // ============================================================
    var AMPLIFIKASI_IKLIM = 5; 
    
    function hitungWetnessScore(baselineZOM, ensoVal, iodVal, lat, lon, bulanIndex) {
        const zona   = tentukanZonaIklimAktif(lat, lon);
        const w_enso = BOBOT_IKLIM[zona].enso[bulanIndex];
        const w_iod  = BOBOT_IKLIM[zona].iod[bulanIndex];
    
        const ensoNorm = (ensoVal / 0.5) * AMPLIFIKASI_IKLIM; 
        const iodNorm  = (iodVal  / 0.5) * AMPLIFIKASI_IKLIM; 
    
        const totalBobot = w_enso + w_iod;
        const penguatBobot = totalBobot < 0.25 ? 1.5 : 1.0;
    
        const koreksi = totalBobot > 0 
            ? ((ensoNorm * w_enso) + (iodNorm * w_iod)) * penguatBobot
            : 0;
    
        const score = baselineZOM - koreksi;
        return score;
    }
    
    // ============================================================
    //  4. FUNGSI UTAMA — hitungRisikoDinamis() VERSI BARU
    // ============================================================
    function hitungRisikoDinamis(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        const lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        const lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;
    
        let baselineBulanIni = parseFloat(baselineData[bulanIndex]);
    
        if (baselineBulanIni > 10) {
            baselineBulanIni = normalisasiCurahHujan(baselineBulanIni, bulanIndex);
        }
    
        const ws = hitungWetnessScore(baselineBulanIni, ensoVal, iodVal, lat, lon, bulanIndex);
    
        // UBAH BAGIAN INI (Lebih sensitif terhadap penyimpangan kecil)
        let statusCuaca;
        if      (ws <= -1.0) statusCuaca = 'Sangat Kering Ekstrem'; // Asalnya -1.5
        else if (ws <= -0.5) statusCuaca = 'Kering';                // Asalnya -0.8
        else if (ws <= -0.2) statusCuaca = 'Cenderung Kering';      // Asalnya -0.3
        else if (ws <=  0.2) statusCuaca = 'Normal';                // Asalnya 0.3
        else if (ws <=  0.5) statusCuaca = 'Cenderung Basah';       // Asalnya 0.8
        else if (ws <=  1.0) statusCuaca = 'Basah';                 // Asalnya 1.5
        else                 statusCuaca = 'Sangat Basah Ekstrem';
        
        let tipeBahaya = 'aman'; 
        if (ws < -0.2) tipeBahaya = 'kekeringan'; // Dibuat lebih cepat waspada
        else if (ws > 0.2) tipeBahaya = 'banjir'; // Dibuat lebih cepat waspada    
        let skor    = 15;
        let masalah = 'Kondisi air optimal.';
    
        if (fase === 'Tanam') {
            if (ws <= -1.5) {
                skor    = 90;
                masalah = 'KRITIS: Tanah retak parah, tidak bisa olah lahan. Tunda tanam atau pompanisasi penuh.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 65;
                masalah = 'Hujan kurang. Perlu pompanisasi tambahan agar lahan bisa dibajak.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 35;
                masalah = 'Curah hujan sedikit di bawah normal. Pantau ketersediaan air irigasi.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.8) {
                skor    = 15;
                masalah = 'Curah hujan cukup. Kondisi air ideal untuk olah lahan dan tanam.';
            } else if (ws <= 1.5) {
                skor    = 45;
                masalah = 'Curah hujan di atas normal. Waspada genangan di lahan yang drainase-nya buruk.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 70;
                masalah = 'Hujan sangat lebat. Risiko pesemaian terendam. Pertimbangkan tapin atau tunda sebar benih.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Vegetatif') {
            if (ws <= -1.5) {
                skor    = 80;
                masalah = 'KRITIS: Kekeringan parah. Anakan padi tidak tumbuh, jumlah malai sangat sedikit.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 55;
                masalah = 'Kekeringan. Pertumbuhan anakan terhambat. Segera cek debit saluran irigasi.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 28;
                masalah = 'Sedikit kekurangan air. Pantau tinggi air di petak sawah, pertahankan 3–5 cm.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.8) {
                skor    = 12;
                masalah = 'Curah hujan normal. Kondisi air ideal untuk pertumbuhan anakan produktif.';
            } else if (ws <= 1.5) {
                skor    = 38;
                masalah = 'Curah hujan lebat. Jika tergenang > 7 hari berturut-turut, segera buka saluran drainase.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 62;
                masalah = 'Hujan sangat lebat. Risiko genangan panjang, akar busuk dan anakan produktif berkurang.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Generatif') {
            if (ws <= -1.5) {
                skor    = 95;
                masalah = 'KRITIS PUSO: Kekeringan parah saat bunting. Malai hampa massal, potensi gagal panen total.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 75;
                masalah = 'BAHAYA: Kekurangan air saat pengisian malai. Bulir tidak terisi penuh, hasil anjlok 30–60%.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 42;
                masalah = 'Waspada kekurangan air. Pastikan tinggi air sawah minimal 5 cm saat fase bunting.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.5) {
                skor    = 12;
                masalah = 'Kondisi curah hujan sangat ideal untuk penyerbukan dan pengisian bulir.';
            } else if (ws <= 1.2) {
                skor    = 40;
                masalah = 'Hujan lebat saat berbunga. Serbuk sari berpotensi rontok, amati persentase malai kosong.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 72;
                masalah = 'BAHAYA: Hujan deras dan angin kencang saat berbunga. Risiko rebah dan penyerbukan gagal massal.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Panen') {
            if (ws <= -0.8) {
                skor    = 8;
                masalah = 'Kondisi terik dan kering. Sangat ideal untuk panen dan pengeringan gabah.';
            } else if (ws <= 0.3) {
                skor    = 18;
                masalah = 'Kondisi curah hujan normal. Panen aman, siapkan pengering cadangan (terpal/dryer).';
            } else if (ws <= 0.8) {
                skor    = 48;
                masalah = 'Curah hujan di atas normal. Lahan berpotensi becek, sulit diakses Combine Harvester.';
                tipeBahaya = 'banjir';
            } else if (ws <= 1.5) {
                skor    = 75;
                masalah = 'BAHAYA: Hujan lebat saat panen. Gabah berisiko tumbuh di malai. Percepat panen atau siapkan dryer.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 92;
                masalah = 'KRITIS: Banjir saat panen. Lahan tidak bisa diakses mesin. Gabah rusak dan rebah. Percepat panen manual segera!';
                tipeBahaya = 'banjir';
            }
        }
    
        skor = Math.round(Math.max(0, Math.min(100, skor)));
        return { skor, statusCuaca, masalah, tipeBahaya };
    }
    
    // ============================================================
    //  5. OVERRIDE prosesAnalisisKalender()
    // ============================================================
    window.prosesAnalisisKalender = async function prosesAnalisisKalender() {
        const tglInput = document.getElementById('inputTglTanam').value;
        if (!tglInput) {
            alert('Silakan masukkan tanggal awal tanam terlebih dahulu!');
            return;
        }
    
        const containerUtama = document.getElementById('hasilProyeksiIklim');
        const kontainerTeks  = document.getElementById('teksAnalisisFase');
        const judulChart     = containerUtama.querySelector('h4');
        const bungkusChart   = containerUtama.querySelector('div');
    
        containerUtama.style.display = 'block';
    
        if (!judulChart.dataset.asli) {
            judulChart.dataset.asli = '<span style="color:#38b6ff;">💧 Grafik Risiko Ketersediaan Air per Fase Tanam</span>';
        }
    
        judulChart.innerHTML = `<div class="animasi-loading-kalender">📡 MEMBACA GPS & MENYINKRONKAN...</div>`;
        bungkusChart.style.display = 'none';
        kontainerTeks.innerHTML    = '';
    
        try {
            const lokasi = await dapatkanLokasiOtomatis();
            window._lokasiKalender = { lat: lokasi.lat, lon: lokasi.lon };
    
            const lokasiSawahEl = document.getElementById('lokasiSawah');
            if (lokasiSawahEl && lokasiSawahEl.innerText === '-') {
                lokasiSawahEl.innerText = `${lokasi.lat.toFixed(5)}, ${lokasi.lon.toFixed(5)}`;
            }
    
            const [ensoData, iodData, resPola, resZom] = await Promise.all([
                getENSOAnomaly(),
                getIODAnomaly(),
                fetch(URL_POLA_HUJAN),
                fetch(URL_ZOM_LOKAL).catch(() => null)
            ]);
    
            const dbPola  = await resPola.json();
            let   dataZom = null;
            if (resZom) dataZom = await resZom.json();
    
            const ensoVal = ensoData.latestAnomaly;
            const iodVal  = iodData.latestAnomaly;
    
            let baselineData = [];
            let namaZona     = '';
            let jarakTerdekat = Infinity;
            let kabTerpilih   = null;
    
            let arrayZom = null;
            if (dataZom && Array.isArray(dataZom.data)) {
                arrayZom = dataZom.data;
            } else if (Array.isArray(dataZom)) {
                arrayZom = dataZom;
            }
    
            if (arrayZom) {
                arrayZom.forEach(kab => {
                    const latKab = parseFloat(kab.lat);
                    const lonKab = parseFloat(kab.lon);
                    if (!isNaN(latKab) && !isNaN(lonKab)) {
                        const jarak = hitungJarakHaversine(lokasi.lat, lokasi.lon, latKab, lonKab);
                        if (jarak < jarakTerdekat) {
                            jarakTerdekat = jarak;
                            kabTerpilih   = kab;
                        }
                    }
                });
            }
    
            if (kabTerpilih && jarakTerdekat <= 150) {
                namaZona = `WIL. ${kabTerpilih.kabupaten_kota.toUpperCase()} (${jarakTerdekat.toFixed(1)} km) — Zona: ${namaZonaTampil(tentukanZonaIklimAktif(lokasi.lat, lokasi.lon))}`;
                baselineData = [
                    parseFloat(kabTerpilih.jan), parseFloat(kabTerpilih.feb), parseFloat(kabTerpilih.mar), parseFloat(kabTerpilih.apr),
                    parseFloat(kabTerpilih.mei), parseFloat(kabTerpilih.jun), parseFloat(kabTerpilih.jul), parseFloat(kabTerpilih.agu),
                    parseFloat(kabTerpilih.sep), parseFloat(kabTerpilih.okt), parseFloat(kabTerpilih.nov), parseFloat(kabTerpilih.des)
                ];
            } else {
                const zona = tentukanZonaIklimAktif(lokasi.lat, lokasi.lon);
                // Kata kunci per zona untuk mencocokkan nama pola di dbPola.
                // 'lokal' menerima beberapa varian penulisan "anti monsunal"
                // karena beberapa sumber data ZOM menamainya demikian, bukan "lokal".
                const petaKataKunci = {
                    monsunal  : ['monsunal'],
                    ekuatorial: ['ekuatorial'],
                    lokal     : ['lokal', 'anti monsunal', 'anti-monsunal', 'antimonsunal'],
                    peralihan : ['peralihan']
                };
                const kataKunciZona = petaKataKunci[zona] || ['monsunal'];
                const polaTerpilih =
                    dbPola.find(p => kataKunciZona.some(k => p.pola.toLowerCase().includes(k)))
                    || dbPola.find(p => p.pola.toLowerCase().includes('monsunal'));
                namaZona     = `[FALLBACK] POLA MAKRO — ZONA: ${namaZonaTampil(zona)}`;
                baselineData = polaTerpilih.baseline;
            }
    
            const umurPilihan = document.getElementById('umurVarietasKalender').value;
            let offsetVeg = 35, offsetGen = 50, offsetPanen = 110;
            if      (umurPilihan === 'genjah') { offsetVeg = 25; offsetGen = 40; offsetPanen = 90;  }
            else if (umurPilihan === 'dalam')  { offsetVeg = 40; offsetGen = 60; offsetPanen = 125; }
    
            const awalTanam    = new Date(tglInput);
            const tglVegetatif = new Date(awalTanam); tglVegetatif.setDate(tglVegetatif.getDate() + offsetVeg);
            const tglGeneratif = new Date(awalTanam); tglGeneratif.setDate(tglGeneratif.getDate() + offsetGen);
            const tglPanen     = new Date(awalTanam); tglPanen.setDate(tglPanen.getDate() + offsetPanen);
    
            const formatTgl = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    
            const labels = [
                `Tanam\n(${formatTgl(awalTanam)})`, `Vegetatif\n(${formatTgl(tglVegetatif)})`,
                `Generatif\n(${formatTgl(tglGeneratif)})`, `Panen\n(${formatTgl(tglPanen)})`
            ];
    
            const riskTanam = window.hitungRisikoDinamis(awalTanam.getMonth(),    'Tanam',      ensoVal, iodVal, baselineData);
const riskVeg   = window.hitungRisikoDinamis(tglVegetatif.getMonth(), 'Vegetatif',  ensoVal, iodVal, baselineData);
const riskGen   = window.hitungRisikoDinamis(tglGeneratif.getMonth(), 'Generatif',  ensoVal, iodVal, baselineData);
const riskPanen = window.hitungRisikoDinamis(tglPanen.getMonth(),     'Panen',      ensoVal, iodVal, baselineData);
    
            const dataSkor   = [riskTanam.skor, riskVeg.skor, riskGen.skor, riskPanen.skor];
            const dataStatus = [riskTanam.statusCuaca, riskVeg.statusCuaca, riskGen.statusCuaca, riskPanen.statusCuaca];
            const dataTipe   = [riskTanam.tipeBahaya,   riskVeg.tipeBahaya,  riskGen.tipeBahaya,  riskPanen.tipeBahaya];
    
            judulChart.innerHTML    = judulChart.dataset.asli;
            bungkusChart.style.display = 'block';
    
            renderKalenderChartV2(labels, dataSkor, dataStatus, dataTipe);
            loadGlobalClimateIndices();
    
            const zonaHasil  = tentukanZonaIklimAktif(lokasi.lat, lokasi.lon);
            const zonaLabel  = namaZonaTampil(zonaHasil);
            const acuanData  = cariZonaDariDataReferensi(lokasi.lat, lokasi.lon);
            const ketAcuan   = acuanData
                ? `📌 Acuan: ${acuanData.nama} (${acuanData.jarak.toFixed(1)} km) — data PEMUTAKHIRAN ZONA MUSIM INDONESIA PERIODE 1991-2020`
                : `📌 Acuan: estimasi geografis (tidak ada titik ZOM referensi < ${RADIUS_MAKS_ZOM_REFERENSI} km)`;
    
            function ikonTipe(tipe) {
                if (tipe === 'kekeringan') return '☀️';
                if (tipe === 'banjir')     return '🌊';
                return '✅';
            }
    
            kontainerTeks.innerHTML = `
                <div style="text-align:center; font-size:0.8rem; margin-bottom:15px; color:#38b6ff; border-bottom:1px dashed rgba(255,255,255,0.1); padding-bottom:8px;">
                    📍 Zona Iklim: <b>${zonaLabel}</b><br>
                    <span style="font-size:0.72rem; color:#64748b;">${namaZona}</span><br>
                    <span style="font-size:0.68rem; color:#475569;">${ketAcuan}</span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskVeg.skor, riskVeg.tipeBahaya)};">
                    <strong>${ikonTipe(riskVeg.tipeBahaya)} Vegetatif (${tglVegetatif.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskVeg.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;">${riskVeg.masalah}</span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskGen.skor, riskGen.tipeBahaya)};">
                    <strong>${ikonTipe(riskGen.tipeBahaya)} Generatif / Bunting (${tglGeneratif.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskGen.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;"><b>${riskGen.masalah}</b></span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskPanen.skor, riskPanen.tipeBahaya)};">
                    <strong>${ikonTipe(riskPanen.tipeBahaya)} Panen (${tglPanen.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskPanen.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;">${riskPanen.masalah}</span>
                </div>
                <div style="margin-top:12px; padding:10px 12px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px solid rgba(255,255,255,0.05); font-size:0.72rem; color:#64748b; line-height:1.6;">
                    ☀️ = Risiko Kekeringan &nbsp;&nbsp; 🌊 = Risiko Banjir/Genangan &nbsp;&nbsp; ✅ = Kondisi Aman<br>
                    📚 Sumber: Aldrian & Susanto (2003) • Nur'utami & Hidayat (2016)
                </div>
            `;
        } catch (errorMesej) {
            console.error('[patch_risiko_iklim_v2]', errorMesej);
            alert('Gagal Membaca Lokasi!\n\n' + errorMesej);
            judulChart.innerHTML       = judulChart.dataset.asli || '💧 Grafik Risiko Air per Fase Tanam';
            bungkusChart.style.display = 'none';
            kontainerTeks.innerHTML = `
                <div class="info-box" style="border-left-color:var(--red-alert); text-align:center;">
                    <strong>⚠️ Akses Lokasi Ditolak / Gagal</strong><br>
                    <span style="font-size:0.85rem; color:#cbd5e1;">Aplikasi memerlukan koordinat GPS untuk menganalisis risiko curah hujan di hamparan lahanmu. Coba muat ulang halaman.</span>
                </div>`;
        }
    }
    
    // ============================================================
    //  6. HELPER: warna garis berdasarkan tipe bahaya & skor
    // ============================================================
    function getWarnaRisikoAir(skor, tipeBahaya) {
        if (skor < 25) return '#10b981';          
        if (tipeBahaya === 'kekeringan') {
            if (skor >= 70) return '#ef4444';                  
            if (skor >= 45) return '#f97316';                  
            return '#f59e0b';                                  
        }
        if (tipeBahaya === 'banjir') {
            if (skor >= 70) return '#3b82f6';                  
            if (skor >= 45) return '#38b6ff';                  
            return '#67e8f9';                                  
        }
        return '#10b981';
    }
    
    // ============================================================
    //  7. renderKalenderChartV2()
    // ============================================================
    function renderKalenderChartV2(labels, dataSkor, dataStatus, dataTipe) {
        const ctx = document.getElementById('kalenderChart').getContext('2d');
    
        if (typeof kalenderChartInstance !== 'undefined' && kalenderChartInstance !== null) {
            kalenderChartInstance.destroy();
        }
    
        const bgColors = dataSkor.map((skor, i) => {
            const tipe = dataTipe ? dataTipe[i] : 'aman';
            return getWarnaRisikoAir(skor, tipe);
        });
    
        const singkatkanStatus = (status) => {
            if (!status) return '';
            const s = status.toLowerCase();
            if (s.includes('sangat kering')) return 'Kering Ekstrem';
            if (s.includes('cenderung kering')) return 'Kering';
            if (s.includes('kering'))          return 'Kering';
            if (s.includes('sangat basah'))    return 'Basah Ekstrem';
            if (s.includes('cenderung basah')) return 'Basah';
            if (s.includes('basah'))           return 'Basah';
            return 'Normal';
        };
        const labelSingkat = dataStatus ? dataStatus.map(singkatkanStatus) : [];
    
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradientFill.addColorStop(0,   'rgba(56, 182, 255, 0.55)');
        gradientFill.addColorStop(0.8, 'rgba(56, 182, 255, 0.00)');
    
        const neonGlowPlugin = {
            id: 'neonGlowWater',
            beforeDatasetsDraw: (chart) => {
                chart.ctx.save();
                chart.ctx.shadowColor  = 'rgba(56, 182, 255, 0.5)';
                chart.ctx.shadowBlur   = 14;
                chart.ctx.shadowOffsetX = 0;
                chart.ctx.shadowOffsetY = 4;
            },
            afterDatasetsDraw: (chart) => { chart.ctx.restore(); }
        };
    
        kalenderChartInstance = new Chart(ctx, {
            type: 'line',
            plugins: [neonGlowPlugin, ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label     : 'Risiko Air',
                    data      : dataSkor,
                    borderColor         : '#38b6ff',
                    backgroundColor     : gradientFill,
                    borderWidth         : 3,
                    tension             : 0.4,
                    fill                : true,
                    pointBackgroundColor: '#0b1528',
                    pointBorderColor    : bgColors,
                    pointBorderWidth    : 3,
                    pointRadius         : 7,
                    pointHoverRadius    : 10,
                    pointHoverBackgroundColor: bgColors,
                    pointHoverBorderColor   : '#ffffff',
                    pointHoverBorderWidth   : 2
                }]
            },
            options: {
                responsive          : true,
                maintainAspectRatio : false,
                layout: { padding: { top: 28, right: 10, left: 10 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor  : 'rgba(11, 21, 40, 0.9)',
                        titleColor       : '#38b6ff',
                        bodyColor        : '#ffffff',
                        borderColor      : 'rgba(56, 182, 255, 0.35)',
                        borderWidth      : 1,
                        padding          : 12,
                        displayColors    : false,
                        cornerRadius     : 12,
                        callbacks: {
                            title: function(ctx) {
                                return ctx[0].label.replace('\n', ' ');
                            },
                            label: function(ctx) {
                                const i    = ctx.dataIndex;
                                const skor = Math.round(ctx.raw);
                                const tipe = dataTipe ? dataTipe[i] : '';
                                const ikonTipe = tipe === 'kekeringan' ? '☀️ Kekeringan'
                                               : tipe === 'banjir'     ? '🌊 Banjir/Genangan'
                                               : '✅ Aman';
                                const st = dataStatus ? dataStatus[i] : '';
                                return [
                                    ` Skor Risiko Air: ${skor}%`,
                                    ` Tipe: ${ikonTipe}`,
                                    ` Curah Hujan: ${st}`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        color     : bgColors,
                        anchor    : 'end',
                        align     : 'top',
                        offset    : 4,
                        font      : {
                            family : "'Plus Jakarta Sans', sans-serif",
                            weight : '800',
                            size   : 10
                        },
                        textAlign  : 'center',
                        formatter: function(value, context) {
    const skor = Math.round(value);
    const persen = skor + '%';
    const status = labelSingkat[context.dataIndex] || 'Normal';
    
    // 🔥 Tambahan Logika Keterangan Dinamis (Title Case)
    let tingkat = '(Aman)';
    if (skor >= 70) {
        tingkat = '(Kritis)';
    } else if (skor >= 45) {
        tingkat = '(Bahaya)';
    } else if (skor >= 25) {
        tingkat = '(Waspada)';
    }
    
    // Hapus .toUpperCase() agar status tetap Title Case
    // Hasil: "Kering (Waspada)", "Basah Ekstrem (Kritis)", dll.
    return [persen, `${status} ${tingkat}`];
}
                    }
                },
                scales: {
                    y: {
                        beginAtZero : true,
                        max         : 110,
                        title: {
                            display : true,
                            text    : 'Skor Risiko Air (%)',
                            color   : '#64748b',
                            font    : { size: 10 }
                        },
                        grid : { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5] },
                        ticks: { color: '#64748b', font: { size: 9, weight: '200' } }
                    },
                    x: {
                        grid : { display: false },
                        ticks: { color: '#8da2be', font: { size: 9, weight: '200' } }
                    }
                }
            }
        });
    }
    
    // ============================================================
    //  8. Backward Compat
    // ============================================================
    function getWarnaRisiko(skor) {
        if (skor >= 70) return 'var(--red-alert)';
        if (skor >= 40) return 'var(--accent-soil)';
        return 'var(--accent-green)';
    }
    
    console.log(
        '%c✅ patch_risiko_iklim_v2.js v2.2.0 aktif — Zona iklim kini berbasis data ZOM riil (713 titik, Gas_ZOM_Lokal_1_.xlsx)',
        'color:#38b6ff; font-weight:bold;'
    );
    // ============================================================
    //  EKSPOR EKSPLISIT
    // ============================================================
    window.tentukanZonaIklim         = tentukanZonaIklim;
    window.cariZonaDariDataReferensi = cariZonaDariDataReferensi;
    window.namaZonaTampil            = namaZonaTampil;
    window.hitungRisikoDinamis       = hitungRisikoDinamis;
    window.getWarnaRisikoAir         = getWarnaRisikoAir;
    window.renderKalenderChartV2     = renderKalenderChartV2;
    if (typeof window.getWarnaRisiko !== 'function') {
        window.getWarnaRisiko = getWarnaRisiko;
    }
    
})();
