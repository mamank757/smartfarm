/**
 * ============================================================
 * patch_sawah_rawa_v1.js
 * Diferensiasi Jenis Sawah — PPL Milenial Wajo
 * ============================================================
 *
 * CARA PASANG:
 * Tambahkan SETELAH patch_risiko_iklim.js (atau v2) dan
 * patch_deteksi_musim_v3.0.js di bagian bawah <body>:
 *
 * <script src="patch_risiko_iklim_v2.js"></script>
 * <script src="patch_deteksi_musim_v3.0.js"></script>
 * <script src="patch_sawah_rawa_v1.js"></script>
 * <script src="patch_jadwal_tanam_otomatis.js"></script>
 * <script src="patch_jadwal_tapin_tabela_fix.js"></script>
 *
 * APA YANG BERUBAH:
 *
 * [RAWA-1] Tambah dropdown "Jenis Sawah" di form Risiko Iklim
 * dan Kalender Tanam (dua form yang berbeda).
 *
 * [RAWA-2] Override hitungRisikoDinamis() — skor risiko berbeda
 * untuk sawah rawa:
 * - Olah lahan: risiko TINGGI saat masih tergenang/banjir
 * - Vegetatif : risiko TINGGI saat banjir mendadak naik
 * - Generatif : risiko KRITIS saat banjir (bukan kering)
 * - Panen     : risiko TINGGI saat hujan naik lagi (banjir
 * datang sebelum panen selesai)
 *
 * [RAWA-3] Override rekomendasiWindowTanam() — mencari WINDOW AMAN 
 * antara dua puncak banjir:
 * - Olah lahan setelah air surut (bulan CH rendah/turun)
 * - Panen harus selesai SEBELUM puncak banjir berikutnya
 * - Varietas genjah sangat diutamakan agar cukup waktu
 *
 * [RAWA-4] Teks analisis & rekomendasi PPL disesuaikan per jenis:
 * - Irigasi/Tadah hujan: teks asli (tidak berubah)
 * - Sawah rawa: teks spesifik banjir, surut, varietas
 * tahan rendaman (Inpari 30, Inpari 33, Inpari IR Nutri Zinc)
 *
 * [RAWA-5] Jadwal tikus di sawah rawa disesuaikan:
 * - Gropyokan saat SURUT (bukan sebelum bajak saja)
 * - Pasang TBS di tanggul yang tidak tergenang
 * - Peringatan: saat banjir tikus migrasi ke tanggul —
 * justru momen penangkapan terbaik
 *
 * DASAR ILMIAH:
 * - IRRI Rice Knowledge Bank — Flood-Prone Lowland Rice (2019)
 * - BB Padi (2022) Varietas Unggul Tahan Rendaman: Inpari 30, 33
 * - Balitbangtan (2018) Pola Tanam Lahan Rawa Lebak Sulsel
 * - Noor (2007) Lahan Rawa: Sifat dan Pengelolaan Tanah Bermasalah
 * Sulfat Masam (Balittra Banjarbaru)
 * - Subagyo (2006) Lahan Rawa Pasang Surut & Lebak (FAO-Indonesia)
 * ============================================================
 */

(function () {
    'use strict';

    // ── Guard double-load ─────────────────────────────────────
    if (window.__sawahRawaV1Aktif) {
        console.warn('[patch_sawah_rawa_v1] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  BAGIAN 0 — KONSTANTA & HELPER
    // ============================================================

    /**
     * Ambil jenis sawah dari salah satu dropdown yang tersedia.
     * Mengembalikan 'rawa' atau 'irigasi'.
     */
    function getJenisSawah() {
        var el = document.getElementById('selectJenisSawahRisiko')
                || document.getElementById('selectJenisSawahKalender')
                || document.getElementById('selectJenisSawahJTO');
        if (!el) return 'irigasi';
        return el.value === 'rawa' ? 'rawa' : 'irigasi';
    }

    /**
     * Kembalikan true jika bulan yang diperiksa termasuk puncak
     * banjir berdasarkan pola ZOM.
     */
    function isBulanBanjir(baselineData, bulanIndex) {
        if (!baselineData || baselineData.length < 12) return false;
        var sorted = baselineData.slice().sort(function(a, b){ return b - a; });
        var threshold = sorted[2]; // ambil nilai ke-3 tertinggi sebagai batas
        var bulanIni    = baselineData[bulanIndex];
        var bulanSebelum = baselineData[(bulanIndex - 1 + 12) % 12];
        // Banjir aktif: bulan ini ATAU bulan sebelumnya (sisa genangan) di atas threshold
        return bulanIni >= threshold || bulanSebelum >= threshold;
    }

    /**
     * Hitung "skor banjir" — seberapa basah bulan ini relatif
     * terhadap bulan terbasah dalam setahun (0-100).
     */
    function skorBanjir(baselineData, bulanIndex) {
        if (!baselineData || baselineData.length < 12) return 50;
        var max = Math.max.apply(null, baselineData);
        var min = Math.min.apply(null, baselineData);
        var range = max - min || 1;
        return Math.round(((baselineData[bulanIndex] - min) / range) * 100);
    }

    // ============================================================
    //  BAGIAN 1 — INJECT DROPDOWN JENIS SAWAH (FIX SINKRONISASI)
    // ============================================================

    // Tambahkan (event) pada onchange
    var HTML_DROPDOWN_RISIKO = '<div class="form-group" id="groupJenisSawahRisiko" style="margin-bottom:14px;">'
        + '<label>🌊 JENIS LAHAN SAWAH</label>'
        + '<select id="selectJenisSawahRisiko" class="form-select" onchange="window.__rawaOnChange(event)">'
        + '<option value="irigasi">💧 Irigasi / Tadah Hujan (mengandalkan hujan)</option>'
        + '<option value="rawa">🌿 Sawah Rawa / Lebak / DAS (menunggu air surut)</option>'
        + '</select>'
        + '<div id="infoJenisSawahRisiko" style="margin-top:8px;padding:10px 12px;border-radius:var(--radius,8px);font-size:0.78rem;line-height:1.6;display:none;background:rgba(59,130,246,0.07);border-left:3px solid #3b82f6;color:#cbd5e1;">'
        + '</div>'
        + '</div>';

    var HTML_DROPDOWN_KALENDER = '<div class="form-group" id="groupJenisSawahKalender" style="margin-bottom:14px;">'
        + '<label>🌊 JENIS LAHAN SAWAH</label>'
        + '<select id="selectJenisSawahKalender" class="form-select" onchange="window.__rawaOnChange(event)">'
        + '<option value="irigasi">💧 Irigasi / Tadah Hujan</option>'
        + '<option value="rawa">🌿 Sawah Rawa / Lebak / DAS</option>'
        + '</select>'
        + '<div id="infoJenisSawahKalender" style="margin-top:8px;padding:10px 12px;border-radius:var(--radius,8px);font-size:0.78rem;line-height:1.6;display:none;background:rgba(59,130,246,0.07);border-left:3px solid #3b82f6;color:#cbd5e1;">'
        + '</div>'
        + '</div>';

    var HTML_DROPDOWN_JTO = '<div class="form-group" id="groupJenisSawahJTO" style="margin-bottom:14px;">'
        + '<label>🌊 JENIS LAHAN SAWAH</label>'
        + '<select id="selectJenisSawahJTO" class="form-select" onchange="window.__rawaOnChange(event)">'
        + '<option value="irigasi">💧 Irigasi / Tadah Hujan</option>'
        + '<option value="rawa">🌿 Sawah Rawa / Lebak / DAS</option>'
        + '</select>'
        + '</div>';

    var INFO_RAWA = '🌿 <b>Sawah Rawa / Lebak / DAS:</b> Kalkulasi berubah — sistem sekarang mencari '
        + '<b>jendela aman</b> antara dua periode banjir. Olah lahan setelah air surut, generatif dan '
        + 'panen harus selesai sebelum puncak banjir berikutnya. Varietas tahan rendaman '
        + 'diutamakan (Inpari 30, Inpari 33).';

    function injectDropdowns() {
        // [Tetap sama dengan aslinya, lewati bagian ini]
        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && !document.getElementById('groupJenisSawahRisiko')) {
            var btnAnalisis = boxKalender.querySelector('button.btn-main');
            if (btnAnalisis) {
                btnAnalisis.insertAdjacentHTML('beforebegin', HTML_DROPDOWN_RISIKO);
            } else {
                var inputTgl = boxKalender.querySelector('#inputTglTanam');
                if (inputTgl) {
                    inputTgl.closest('.form-group').insertAdjacentHTML('afterend', HTML_DROPDOWN_RISIKO);
                } else {
                    boxKalender.insertAdjacentHTML('afterbegin', HTML_DROPDOWN_RISIKO);
                }
            }
        }

        var boxJTO = document.getElementById('boxJadwalTanam');
        if (boxJTO && !document.getElementById('groupJenisSawahJTO')) {
            var selectMetode = boxJTO.querySelector('#metodeTanamJTO');
            if (selectMetode) {
                selectMetode.closest('.form-group').insertAdjacentHTML('afterend', HTML_DROPDOWN_JTO);
            } else {
                boxJTO.insertAdjacentHTML('afterbegin', HTML_DROPDOWN_JTO);
            }
        }
    }

    // [FIX KUNCI]: Sinkronisasi semua dropdown di menu manapun
    window.__rawaOnChange = function(event) {
        var selectedVal = event ? event.target.value : 'irigasi';
        
        // Otomatis samakan pilihan di Tab Risiko Iklim, JTO, dll
        var ids = ['selectJenisSawahRisiko', 'selectJenisSawahKalender', 'selectJenisSawahJTO'];
        ids.forEach(function(id){
            var el = document.getElementById(id);
            if (el && el.value !== selectedVal) {
                el.value = selectedVal; // Sinkron
            }
        });

        var isRawa = selectedVal === 'rawa';
        ['infoJenisSawahRisiko','infoJenisSawahKalender'].forEach(function(id){
            var el = document.getElementById(id);
            if (!el) return;
            if (isRawa) {
                el.style.display = 'block';
                el.innerHTML = INFO_RAWA;
            } else {
                el.style.display = 'none';
            }
        });
    };
    // ============================================================
    //  BAGIAN 2 — OVERRIDE hitungRisikoDinamis() UNTUK SAWAH RAWA
    // ============================================================

    var _hitungRisikoDinamisAsli = window.hitungRisikoDinamis;

    function hitungRisikoDinamisRawa(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        var sb = skorBanjir(baselineData, bulanIndex);
        var banjirAktif = isBulanBanjir(baselineData, bulanIndex);
        var banjirMendekat = isBulanBanjir(baselineData, (bulanIndex + 1) % 12);

        var ensoBasah = (ensoVal < -0.5); 
        var iodBasah  = (iodVal  < -0.4); 
        var amplifikasiBanjir = (ensoBasah && iodBasah) ? 20 : (ensoBasah || iodBasah) ? 10 : 0;
        sb = Math.min(100, sb + amplifikasiBanjir);

        var skor = 20;
        var statusCuaca, masalah, tipeBahaya;

        if (fase === 'Tanam') {
            if (banjirAktif) {
                skor    = 92;
                statusCuaca = 'Tergenang / Banjir Aktif';
                masalah = 'TIDAK BISA OLAH LAHAN: lahan masih tergenang. Tunggu air benar-benar surut '
                         + 'sebelum traktor masuk. Manfaatkan waktu untuk gropyokan komunal di tanggul.';
                tipeBahaya = 'banjir';
            } else if (sb > 55) {
                skor    = 55;
                statusCuaca = 'Air Baru Surut';
                masalah = 'Air baru surut, tanah masih sangat lembek. Tunggu 1-2 minggu lagi '
                         + 'sebelum traktor masuk agar tidak amblas. Manfaatkan untuk persemaian.';
                tipeBahaya = 'banjir';
            } else if (sb < 20) {
                skor    = 15;
                statusCuaca = 'Surut Optimal';
                masalah = 'Kondisi terbaik untuk sawah rawa: air sudah surut, tanah cukup kering '
                         + 'untuk traktor namun masih lembab. Segera lakukan pengolahan lahan.';
                tipeBahaya = 'aman';
            } else {
                skor    = 30;
                statusCuaca = 'Air Sedang Turun';
                masalah = 'Air sedang dalam proses surut. Pantau tinggi muka air setiap hari. '
                         + 'Persiapkan benih agar siap sebar segera setelah lahan bisa diolah.';
                tipeBahaya = 'aman';
            }
        }
        else if (fase === 'Vegetatif') {
            if (banjirAktif && sb > 75) {
                skor    = 80;
                statusCuaca = 'Banjir Saat Vegetatif';
                masalah = 'BAHAYA: banjir aktif saat fase vegetatif. Genangan > 10 hari akan '
                         + 'membunuh anakan. Buka saluran darurat. Pertimbangkan varietas tahan '
                         + 'rendaman (Inpari 30 tahan terendam s/d 14 hari).';
                tipeBahaya = 'banjir';
            } else if (sb > 55) {
                skor    = 45;
                statusCuaca = 'Air Cukup Tinggi';
                masalah = 'Curah hujan tinggi, potensi air naik. Jaga saluran pembuang tetap terbuka. '
                         + 'Pantau setiap hari — jika air naik > 30 cm dalam 24 jam, segera lapor ke Dinas.';
                tipeBahaya = 'banjir';
            } else if (sb < 20) {
                skor    = 25;
                statusCuaca = 'Air Rendah / Surut';
                masalah = 'Air rendah di fase vegetatif sawah rawa justru baik: akar tumbuh kuat. '
                         + 'Bila terlalu kering, manfaatkan saluran tersier untuk pompanisasi ringan.';
                tipeBahaya = 'aman';
            } else {
                skor    = 18;
                statusCuaca = 'Ketinggian Air Normal';
                masalah = 'Ketinggian air terkendali. Kondisi optimal untuk pertumbuhan anakan '
                         + 'di sawah rawa. Lanjutkan monitoring rutin.';
                tipeBahaya = 'aman';
            }
        }
        else if (fase === 'Generatif') {
            if (banjirAktif || sb > 70) {
                skor    = 97;
                statusCuaca = 'KRITIS: Banjir Saat Bunting';
                masalah = 'KRITIS GAGAL PANEN: banjir saat fase bunting/berbunga adalah kondisi '
                         + 'paling merusak di sawah rawa. Malai terendam saat pengisian = hampa massal. '
                         + 'Jadwal tanam berikutnya harus mundur agar generatif tidak jatuh di bulan ini.';
                tipeBahaya = 'banjir';
            } else if (banjirMendekat && sb > 50) {
                skor    = 70;
                statusCuaca = 'Banjir Mendekat';
                masalah = 'Bulan depan diprediksi banjir. Hitung apakah panen bisa selesai '
                         + 'sebelum air naik. Jika tidak, pertimbangkan percepatan panen dini '
                         + '(kadar air 25-28%, giling segera).';
                tipeBahaya = 'banjir';
            } else if (sb < 25) {
                skor    = 10;
                statusCuaca = 'Jendela Aman Generatif';
                masalah = 'JENDELA TERBAIK untuk generatif sawah rawa: air rendah, tidak ada '
                         + 'ancaman banjir. Penyerbukan dan pengisian bulir akan optimal.';
                tipeBahaya = 'aman';
            } else {
                skor    = 35;
                statusCuaca = 'Air Terkendali';
                masalah = 'Kondisi generatif cukup aman. Pantau curah hujan harian — jika hujan '
                         + '>50 mm/hari berturut-turut 3 hari, waspada air naik mendadak.';
                tipeBahaya = 'aman';
            }
        }
        else if (fase === 'Panen') {
            if (banjirAktif || sb > 70) {
                skor    = 90;
                statusCuaca = 'KRITIS: Banjir Saat Panen';
                masalah = 'KRITIS: banjir aktif saat panen. Lahan tidak bisa diakses mesin, '
                         + 'gabah rebah dan terendam. Panen manual darurat — prioritaskan petak '
                         + 'terdekat tanggul. Sewa alat pemotong manual.';
                tipeBahaya = 'banjir';
            } else if (banjirMendekat && sb > 45) {
                skor    = 65;
                statusCuaca = 'Banjir Mendekat — Percepat';
                masalah = 'Bulan depan diprediksi banjir. Percepat panen 5-7 hari dari jadwal '
                         + 'normal. Pesan Combine Harvester segera — jangan tunggu 95% kuning. '
                         + 'Siapkan dryer karena panen lebih awal = kadar air lebih tinggi.';
                tipeBahaya = 'banjir';
            } else if (sb < 25) {
                skor    = 8;
                statusCuaca = 'Jendela Panen Ideal';
                masalah = 'Kondisi panen terbaik untuk sawah rawa: air surut, lahan kering, '
                         + 'Combine bisa masuk, gabah kering alami. Manfaatkan sebaik-baiknya.';
                tipeBahaya = 'aman';
            } else {
                skor    = 30;
                statusCuaca = 'Aman untuk Panen';
                masalah = 'Kondisi panen cukup aman. Pantau prakiraan cuaca 7 hari ke depan '
                         + 'sebelum menjadwalkan Combine. Siapkan terpal cadangan.';
                tipeBahaya = 'aman';
            }
        }

        skor = Math.round(Math.max(0, Math.min(100, skor)));
        return { skor: skor, statusCuaca: statusCuaca || 'Normal', masalah: masalah || '-', tipeBahaya: tipeBahaya || 'aman' };
    }

    window.hitungRisikoDinamis = function(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        if (getJenisSawah() === 'rawa') {
            return hitungRisikoDinamisRawa(bulanIndex, fase, ensoVal, iodVal, baselineData);
        }
        if (typeof _hitungRisikoDinamisAsli === 'function') {
            return _hitungRisikoDinamisAsli(bulanIndex, fase, ensoVal, iodVal, baselineData);
        }
        return { skor: 50, statusCuaca: 'Normal', masalah: '-', tipeBahaya: 'aman' };
    };

    // ============================================================
    //  BAGIAN 3 — OVERRIDE rekomendasiWindowTanam() UNTUK RAWA (DIKUNCI)
    // ============================================================
    (function() {
        var _rekomendasiWindowTanamAsli = window.rekomendasiWindowTanam;

        function rekomendasiRawa(skorBulan, rawZOM, zona, ensoVal, iodVal) {
            var now = new Date();
            var tahun = now.getFullYear();

            var sorted = rawZOM.map(function(v, i){ return { v: v, i: i }; })
                               .sort(function(a, b){ return b.v - a.v; });
            var banjirSet = {};
            for (var k = 0; k < 3; k++) {
                var bi = sorted[k].i;
                banjirSet[bi] = true;
                banjirSet[(bi + 1) % 12] = true; 
            }

            var bulanAman = [];
            for (var m = 0; m < 12; m++) { if (!banjirSet[m]) bulanAman.push(m); }
            if (bulanAman.length === 0) bulanAman = [0, 6]; 

            var JEDA_OLAH_TANAM = 20; 
            var varianArr = [
                { kode: 'genjah', label: 'Genjah (< 95 HST) — DIREKOMENDASIKAN untuk rawa', panen: 90 },
                { kode: 'sedang', label: 'Sedang (95–115 HST) — jika window cukup', panen: 110 },
                { kode: 'dalam',  label: 'Dalam (≥ 116 HST) — risiko tinggi di rawa', panen: 125 }
            ];

            var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                              'Juli','Agustus','September','Oktober','November','Desember'];

            function tambahHari(d, n) { var h = new Date(d); h.setDate(h.getDate() + n); return h; }
            function tglDariBulan(bulanIdx, tahunRef) { return new Date(tahunRef, bulanIdx, 15); }

            var kandidat = [];
            bulanAman.forEach(function(bOlah) {
                varianArr.forEach(function(v) {
                    var tglOlah = tglDariBulan(bOlah, tahun);
                    var tglTanam = tambahHari(tglOlah, JEDA_OLAH_TANAM);
                    var tglPanen = tambahHari(tglTanam, v.panen);
                    var bPanen = tglPanen.getMonth();

                    var panenAman = !banjirSet[bPanen] && !banjirSet[(bPanen + 1) % 12];
                    var hariGen = Math.floor(v.panen * 0.60);
                    var bGen = tambahHari(tglTanam, hariGen).getMonth();
                    var genAman = !banjirSet[bGen];

                    if (!panenAman || !genAman) return; 

                    var nilaiPanen = 100 - skorBulan[bPanen];
                    var nilaiGen = 100 - Math.abs(skorBulan[bGen] - 30);
                    var nilaiUmur = v.kode === 'genjah' ? 20 : v.kode === 'sedang' ? 10 : 0;
                    var nilaiTotal = (nilaiPanen * 0.45) + (nilaiGen * 0.40) + nilaiUmur;

                    kandidat.push({
                        tglOlahTanah: tglOlah, tglTanam: tglTanam, tglPanen: tglPanen,
                        varietas: v.kode, labelVar: v.label, nilaiTotal: nilaiTotal,
                        alasan: 'Window aman olah lahan ' + NAMA_BULAN[bOlah] + ' (surut), panen ' + NAMA_BULAN[bPanen] + ' (sebelum banjir).'
                    });
                });
            });

            kandidat.sort(function(a, b){ return b.nilaiTotal - a.nilaiTotal; });

            var hasilDuaMusim = [];
            var bulanSudahDipakai = {};
            kandidat.forEach(function(k) {
                if (hasilDuaMusim.length < 2) {
                    var terlalutDekat = Object.keys(bulanSudahDipakai).some(function(b){
                        var diff = Math.abs(parseInt(b) - k.tglOlahTanah.getMonth());
                        return Math.min(diff, 12 - diff) < 3;
                    });
                    if (!terlalutDekat) {
                        bulanSudahDipakai[k.tglOlahTanah.getMonth()] = true;
                        hasilDuaMusim.push({
                            musimNama: hasilDuaMusim.length === 0 ? 'MT I Rawa' : 'MT II Rawa',
                            musimKode: hasilDuaMusim.length === 0 ? 'rendeng' : 'gadu',
                            tglOlahTanah: k.tglOlahTanah, tglTanam: k.tglTanam, tglPanen: k.tglPanen,
                            varietas: k.varietas, labelVar: k.labelVar, alasan: k.alasan
                        });
                    }
                }
            });
            return hasilDuaMusim;
        }

        // Mengunci fungsi agar tidak bisa ditimpa JTO
        Object.defineProperty(window, 'rekomendasiWindowTanam', {
            value: function(skorBulan, rawZOM, zona, ensoVal, iodVal) {
                var select = document.getElementById('selectJenisSawahJTO') || document.getElementById('selectJenisSawahKalender');
                if (select && select.value === 'rawa') {
                    console.log('✅ [RAWA] Logika Window Tanam TERKUNCI & AKTIF');
                    return rekomendasiRawa(skorBulan, rawZOM, zona, ensoVal || 0, iodVal || 0);
                }
                if (typeof _rekomendasiWindowTanamAsli === 'function') {
                    return _rekomendasiWindowTanamAsli(skorBulan, rawZOM, zona, ensoVal, iodVal);
                }
                return [];
            },
            writable: false,
            configurable: true
        });
    })();

    // ============================================================
    //  BAGIAN 4 — PATCH TEKS ANALISIS DI boxKalender
    // ============================================================

    var _prosesAnalisisKalenderAsli = window.prosesAnalisisKalender;

    window.prosesAnalisisKalender = async function() {
        if (typeof _prosesAnalisisKalenderAsli === 'function') {
            await _prosesAnalisisKalenderAsli.apply(this, arguments);
        }

        if (getJenisSawah() !== 'rawa') return;

        var kontainerTeks = document.getElementById('teksAnalisisFase');
        if (!kontainerTeks) return;

        var existingRawa = document.getElementById('rawaInfoPanel');
        if (existingRawa) existingRawa.remove();

        var panel = document.createElement('div');
        panel.id = 'rawaInfoPanel';
        panel.style.cssText = 'margin-top:16px;padding:14px;border-radius:14px;'
            + 'background:rgba(29,158,117,0.08);border:1px solid rgba(29,158,117,0.3);'
            + 'border-left:4px solid #1D9E75;font-size:0.8rem;color:#cbd5e1;line-height:1.7;';
        panel.innerHTML = '<div style="font-weight:700;color:#1D9E75;margin-bottom:8px;font-size:0.85rem;">'
            + '🌿 CATATAN KHUSUS SAWAH RAWA / LEBAK / DAS'
            + '</div>'
            + '<b>Strategi utama:</b> Cari jendela aman antara dua periode banjir.<br>'
            + '• Olah lahan hanya saat air benar-benar surut (tinggi muka air &lt; 10 cm di luar saluran)<br>'
            + '• Fase generatif & panen HARUS selesai sebelum puncak banjir berikutnya<br>'
            + '• Varietas wajib: <b>Inpari 30</b> (tahan rendaman s/d 14 hari), '
            + '<b>Inpari 33</b>, atau <b>Inpari IR Nutri Zinc</b><br>'
            + '• Pupuk: kurangi Urea 20% — rawa sudah kaya bahan organik, N berlebih picu Blast<br>'
            + '• Saat banjir datang saat vegetatif: aktifkan pompanisasi jika ada, atau pasrah '
            + 'mengandalkan ketahanan varietas<br><br>'
            + '<b>Saat banjir = peluang tikus:</b> tikus migrasi ke tanggul yang tidak tergenang. '
            + 'Ini waktu terbaik untuk gropyokan — kepadatan tikus di tanggul sangat tinggi.<br><br>'
            + '<div style="font-size:0.72rem;opacity:0.6;">Sumber: Balitbangtan (2018); IRRI Flood-Prone Lowland (2019); '
            + 'Noor (2007) Lahan Rawa Lebak; BB Padi Varietas Tahan Rendaman (2022)</div>';

        kontainerTeks.appendChild(panel);
    };

    // ============================================================
    //  BAGIAN 5 — PATCH JADWAL TIKUS UNTUK RAWA
    // ============================================================

    var _hitungJadwalTikusAsli = window.hitungJadwalTikus;

    window.hitungJadwalTikus = function(tglOlahTanah, tglTanam) {
        var jadwal = _hitungJadwalTikusAsli
            ? _hitungJadwalTikusAsli(tglOlahTanah, tglTanam)
            : {};

        if (getJenisSawah() !== 'rawa') return jadwal;

        if (jadwal.gropyokan) {
            jadwal.gropyokan.catatan = '🌿 SAWAH RAWA: Gropyokan paling efektif dilakukan '
                + 'saat banjir baru surut — tikus berkonsentrasi di tanggul dan galengan yang '
                + 'tidak tergenang. Koordinasi dengan petani blok sekitar untuk hasil maksimal.';
        }
        if (jadwal.sanitasiPematang) {
            jadwal.sanitasiPematang.catatan = 'Bersihkan tanggul dan saluran dari gulma. '
                + 'Tutup lubang tikus dengan tanah basah SEBELUM lahan bisa diolah. '
                + 'Periksa juga kondisi pintu air (tabat/stoplog).';
        }
        if (jadwal.pasangTBS) {
            jadwal.pasangTBS.catatan = 'Pasang TBS di tanggul luar yang tidak tergenang. '
                + 'Di sawah rawa, tikus bersembunyi di tanggul — TBS di tanggul 3× lebih efektif '
                + 'daripada di dalam petakan.';
        }
        if (jadwal.umpanRacun) {
            jadwal.umpanRacun.catatan = 'Letakkan umpan di liang aktif di tanggul. '
                + 'JANGAN pasang umpan di dalam petakan saat masih ada genangan — umpan larut.';
        }

        return jadwal;
    };

    // ============================================================
    //  BAGIAN 6 — PATCH SIMPULAN PREDIKSI IKLIM TERPADU
    // ============================================================

    var _simpulkanAsli = window.simpulkanPrediksiIklimTerpadu;

    window.simpulkanPrediksiIklimTerpadu = function(enso, iod, sstLokal, isSulsel) {
        if (typeof _simpulkanAsli === 'function') {
            _simpulkanAsli(enso, iod, sstLokal, isSulsel);
        }

        if (getJenisSawah() !== 'rawa') return;

        var box = document.getElementById('iklimTerpaduBox');
        if (!box) return;

        var existing = document.getElementById('rawaCatatanIklim');
        if (existing) existing.remove();

        var nilaiEnso = enso && enso.anomalies ? (enso.anomalies[enso.anomalies.length - 1] || 0) : 0;
        var nilaiIod  = iod  && iod.anomalies  ? (iod.anomalies[iod.anomalies.length - 1]  || 0) : 0;

        var laNina  = nilaiEnso < -0.5;
        var elNino  = nilaiEnso >  0.5;
        var iodNeg  = nilaiIod  < -0.4;
        var iodPos  = nilaiIod  >  0.4;

        var teksIklimRawa = '';
        if (laNina && iodNeg) {
            teksIklimRawa = '⚠️ <b>La Niña + IOD Negatif — BAHAYA BANJIR EKSTRA di Rawa:</b> '
                + 'Periode banjir berpotensi lebih panjang dan lebih tinggi dari normal. '
                + 'Window tanam aman akan lebih sempit. Hanya gunakan varietas genjah. '
                + 'Siapkan rencana evakuasi padi darurat.';
        } else if (laNina) {
            teksIklimRawa = '⚠️ <b>La Niña — Banjir Lebih Intens di Rawa:</b> '
                + 'Durasi banjir berpotensi 2-4 minggu lebih panjang dari tahun normal. '
                + 'Geser jadwal tanam agar cukup buffer setelah surut.';
        } else if (elNino && iodPos) {
            teksIklimRawa = '✅ <b>El Niño + IOD Positif — Kondisi Menguntungkan untuk Rawa:</b> '
                + 'Banjir lebih ringan dan surut lebih cepat dari biasanya. '
                + 'Window tanam lebih lebar. Bisa mempertimbangkan varietas sedang.';
        } else if (elNino) {
            teksIklimRawa = '✅ <b>El Niño — Window Rawa Lebih Lebar:</b> '
                + 'Curah hujan lebih rendah dari normal, banjir tidak separah tahun La Niña. '
                + 'Manfaatkan window yang lebih lebar, namun tetap prioritaskan varietas tahan.';
        } else {
            teksIklimRawa = 'ℹ️ <b>Kondisi Normal/Netral:</b> Ikuti pola banjir historis wilayah. '
                + 'Konsultasikan dengan sesepuh tani atau Dinas Irigasi untuk data tinggi muka air '
                + 'tahun-tahun sebelumnya.';
        }

        var catatanEl = document.createElement('div');
        catatanEl.id = 'rawaCatatanIklim';
        catatanEl.style.cssText = 'margin-top:12px;padding:10px 14px;border-radius:10px;'
            + 'font-size:0.78rem;line-height:1.6;color:#cbd5e1;'
            + 'background:rgba(29,158,117,0.08);border-left:3px solid #1D9E75;';
        catatanEl.innerHTML = '<div style="font-size:0.72rem;font-weight:700;color:#1D9E75;margin-bottom:4px;">'
            + '🌿 IMPLIKASI UNTUK SAWAH RAWA</div>' + teksIklimRawa;
        box.appendChild(catatanEl);
    };

    // ============================================================
    //  BAGIAN 7 — INIT
    // ============================================================

    function init() {
        injectDropdowns();

        var _switchModeAsli = window.switchMode;
        if (typeof _switchModeAsli === 'function') {
            window.switchMode = function(mode) {
                _switchModeAsli.apply(this, arguments);
                if (mode === 'kalender' || mode === 'jadwaltanam') {
                    setTimeout(injectDropdowns, 200);
                }
            };
        }

        window.__sawahRawaV1Aktif = true;

        console.log(
            '%c✅ patch_sawah_rawa_v1.js AKTIF (FIXED)\n'
            + '\n  ╔══ DIFERENSIASI JENIS SAWAH ══════════════════╗\n'
            + '  ║ [RAWA-1] Dropdown jenis sawah di Risiko Iklim\n'
            + '  ║          & Kalender Tanam Otomatis\n'
            + '  ║ [RAWA-2] hitungRisikoDinamis() — logika terbalik:\n'
            + '  ║          risiko TINGGI = banjir (bukan kering)\n'
            + '  ║ [RAWA-3] rekomendasiWindowTanam() — cari window\n'
            + '  ║          aman antara dua puncak banjir (Sinkron v3)\n'
            + '  ║          Varietas genjah diutamakan\n'
            + '  ║ [RAWA-4] Teks analisis & rekomendasi PPL rawa\n'
            + '  ║ [RAWA-5] Jadwal tikus disesuaikan:\n'
            + '  ║          gropyokan saat banjir surut (migrasi tikus)\n'
            + '  ║ [RAWA-6] Catatan iklim ENSO/IOD spesifik rawa\n'
            + '  ║ 📚 Sumber: Balitbangtan (2018), IRRI Flood (2019),\n'
            + '  ║    Noor (2007), BB Padi (2022)\n'
            + '  ╚═══════════════════════════════════════════════╝',
            'color:#1D9E75;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 400); });
    } else {
        setTimeout(init, 400);
    }

})();
