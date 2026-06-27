/**
 * ============================================================
 * patch_sawah_rawa_v1.1.js
 * Diferensiasi Jenis Sawah — PPL Milenial Wajo
 * ============================================================
 *
 * PERBAIKAN v1.1 vs v1.0:
 *
 *   [FIX-1] KALENDER TNM tidak merespons pilihan rawa.
 *           Root cause: prosesJadwalOtomatis() di JTO v3.13
 *           memanggil bangunKegiatan() lokal yang tidak tahu
 *           soal rawa, DAN format objek rekomendasi dari
 *           rekomendasiRawa() berbeda (field tglOlahTanah
 *           langsung di rek, bukan dari rek.jadwalTikus).
 *           Fix: override window.prosesJadwalOtomatis SETELAH
 *           JTO init, dengan versi yang sadar jenis sawah.
 *
 *   [FIX-2] bangunKegiatanRawa() — versi khusus rawa dengan:
 *           - Urutan kegiatan berbeda (gropyokan saat surut
 *             bukan sebelum bajak)
 *           - Risiko diperhitungkan dari skor banjir, bukan
 *             skor kekeringan
 *           - Label & tips disesuaikan untuk konteks rawa
 *           - Tidak ada kegiatan "pompanisasi" — diganti
 *             "pemantauan pintu air / tabat"
 *
 *   [FIX-3] renderOutput() di JTO menggunakan rek.tglOlahTanah
 *           dari engine rawa — field ini di-pass ke bangunKegiatan
 *           lewat rek, tapi JTO lama tidak meneruskannya.
 *           Fix: wrapper prosesJadwalOtomatis baru meneruskan
 *           tglOlahTanah ke dalam objek jadwal.
 *
 *   [FIX-4] Label jenis sawah ditampilkan di kotak
 *           "INFORMASI IKLIM TAHUNAN" pada output JTO.
 *
 *   [FIX-5] Kotak info rawa disisipkan di bawah hasil JTO
 *           (sama seperti di Risiko Iklim).
 *
 * CARA PASANG — urutan harus persis ini:
 *   <script src="patch_risiko_iklim.js"></script>
 *   <script src="patch_deteksi_musim_v3.0.js"></script>
 *   <script src="patch_sawah_rawa_v1.1.js"></script>   ← file ini
 *   <script src="patch_jadwal_tanam_otomatis.js"></script>
 *   <script src="patch_jadwal_tapin_tabela_fix.js"></script>
 *
 * DASAR ILMIAH:
 *   - IRRI Rice Knowledge Bank — Flood-Prone Lowland Rice (2019)
 *   - BB Padi (2022) Varietas Unggul Tahan Rendaman
 *   - Balitbangtan (2018) Pola Tanam Lahan Rawa Lebak Sulsel
 *   - Noor (2007) Lahan Rawa Lebak (Balittra Banjarbaru)
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__sawahRawaV1Aktif) {
        console.warn('[patch_sawah_rawa_v1.1] sudah aktif, skip.');
        return;
    }

    // ============================================================
    //  KONSTANTA & HELPER
    // ============================================================

    var WARNA_RAWA = '#1D9E75';

    var NAMA_HARI        = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN       = ['Januari','Februari','Maret','April','Mei','Juni',
                            'Juli','Agustus','September','Oktober','November','Desember'];
    var NAMA_BULAN_PEND  = ['Jan','Feb','Mar','Apr','Mei','Jun',
                            'Jul','Agu','Sep','Okt','Nov','Des'];

    function tambahHari(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
    }
    function fmtL(d) {
        return NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' +
               NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
    }
    function fmtP(d) {
        return d.getDate() + ' ' + NAMA_BULAN_PEND[d.getMonth()] + ' ' + d.getFullYear();
    }

    function getJenisSawah() {
        var el = document.getElementById('selectJenisSawahRisiko')
                || document.getElementById('selectJenisSawahKalender')
                || document.getElementById('selectJenisSawahJTO');
        return (el && el.value === 'rawa') ? 'rawa' : 'irigasi';
    }

    // ── Skor banjir relatif (0–100): makin tinggi makin basah/banjir ──
    function skorBanjirBulan(rawZOM, bulanIndex) {
        if (!rawZOM || rawZOM.length < 12) return 50;
        var max = Math.max.apply(null, rawZOM);
        var min = Math.min.apply(null, rawZOM);
        var range = (max - min) || 1;
        return Math.round(((rawZOM[bulanIndex] - min) / range) * 100);
    }

    // ── Apakah bulan ini termasuk periode banjir aktif? ──
    function isBulanBanjir(rawZOM, bulanIndex) {
        if (!rawZOM || rawZOM.length < 12) return false;
        var sorted = rawZOM.slice().sort(function(a,b){ return b-a; });
        var threshold = sorted[2]; // 3 bulan terbasah
        return rawZOM[bulanIndex] >= threshold
            || rawZOM[(bulanIndex - 1 + 12) % 12] >= threshold;
    }

    // ============================================================
    //  BAGIAN 1 — INJECT DROPDOWN JENIS SAWAH
    // ============================================================

    var INFO_RAWA_HTML = '<div id="infoJenisSawahJTO" style="margin-top:8px;padding:10px 12px;'
        + 'border-radius:8px;font-size:0.78rem;line-height:1.6;display:none;'
        + 'background:rgba(29,158,117,0.08);border-left:3px solid ' + WARNA_RAWA + ';color:#cbd5e1;">'
        + '🌿 <b>Sawah Rawa aktif:</b> Sistem mencari <b>jendela aman</b> antara dua periode banjir. '
        + 'Varietas genjah diutamakan agar panen selesai sebelum banjir berikutnya.'
        + '</div>';

    function injectDropdownJTO() {
        var boxJTO = document.getElementById('boxJadwalTanam');
        if (!boxJTO || document.getElementById('groupJenisSawahJTO')) return;

        var html = '<div class="form-group" id="groupJenisSawahJTO" style="margin-bottom:14px;">'
            + '<label class="form-label">🌊 JENIS LAHAN SAWAH</label>'
            + '<select id="selectJenisSawahJTO" class="form-select" style="margin-bottom:0;" '
            + 'onchange="window.__rawaOnChangeJTO()">'
            + '<option value="irigasi">💧 Irigasi / Tadah Hujan</option>'
            + '<option value="rawa">🌿 Sawah Rawa / Lebak / DAS (menunggu air surut)</option>'
            + '</select>'
            + INFO_RAWA_HTML
            + '</div>';

        // Sisipkan setelah select metodeTanamJTO
        var selectMetode = boxJTO.querySelector('#metodeTanamJTO');
        if (selectMetode && selectMetode.closest('.form-group')) {
            selectMetode.closest('.form-group').insertAdjacentHTML('afterend', html);
        } else {
            // Fallback: sisipkan sebelum tombol analisis
            var btn = boxJTO.querySelector('#btnJadwalOtomatis');
            if (btn) btn.insertAdjacentHTML('beforebegin', html);
            else boxJTO.insertAdjacentHTML('afterbegin', html);
        }
    }

    function injectDropdownRisiko() {
        // Inject di boxKalender (tab Risiko Iklim)
        var boxKalender = document.getElementById('boxKalender');
        if (!boxKalender || document.getElementById('groupJenisSawahRisiko')) return;

        var html = '<div class="form-group" id="groupJenisSawahRisiko" style="margin-bottom:14px;">'
            + '<label>🌊 JENIS LAHAN SAWAH</label>'
            + '<select id="selectJenisSawahRisiko" class="form-select" '
            + 'onchange="window.__rawaOnChange()">'
            + '<option value="irigasi">💧 Irigasi / Tadah Hujan</option>'
            + '<option value="rawa">🌿 Sawah Rawa / Lebak / DAS</option>'
            + '</select>'
            + '<div id="infoJenisSawahRisiko" style="display:none;margin-top:8px;padding:10px 12px;'
            + 'border-radius:8px;font-size:0.78rem;line-height:1.6;'
            + 'background:rgba(29,158,117,0.08);border-left:3px solid ' + WARNA_RAWA + ';color:#cbd5e1;">'
            + '🌿 <b>Sawah Rawa aktif:</b> Sistem mencari jendela aman antara dua periode banjir. '
            + 'Risiko TINGGI = banjir aktif, bukan kekeringan.'
            + '</div>'
            + '</div>';

        var btn = boxKalender.querySelector('button.btn-main');
        if (btn) btn.insertAdjacentHTML('beforebegin', html);
        else boxKalender.insertAdjacentHTML('afterbegin', html);
    }

    window.__rawaOnChange = function() {
        var isRawa = getJenisSawah() === 'rawa';
        ['infoJenisSawahRisiko'].forEach(function(id){
            var el = document.getElementById(id);
            if (el) el.style.display = isRawa ? 'block' : 'none';
        });
    };

    window.__rawaOnChangeJTO = function() {
        var isRawa = getJenisSawah() === 'rawa';
        var el = document.getElementById('infoJenisSawahJTO');
        if (el) el.style.display = isRawa ? 'block' : 'none';
    };

    // ============================================================
    //  BAGIAN 2 — RISIKO BANJIR untuk kegiatan di sawah rawa
    //  (dipakai oleh bangunKegiatanRawa)
    // ============================================================

    function risikoOlahRawa(sbanjir) {
        if (sbanjir > 70) return { level: 'Masih Tergenang', warna: '#ef4444',
            catatan: 'Lahan belum bisa diolah — air masih tinggi. Tunggu surut total sebelum traktor masuk.' };
        if (sbanjir > 45) return { level: 'Air Baru Surut', warna: '#f59e0b',
            catatan: 'Tanah masih sangat lembek. Tunggu 1–2 minggu agar traktor tidak amblas.' };
        return { level: 'Surut Optimal', warna: WARNA_RAWA,
            catatan: 'Kondisi terbaik — air surut, tanah cukup padat untuk traktor.' };
    }

    function risikoTanamRawa(sbanjir) {
        if (sbanjir > 60) return { level: 'Air Masih Tinggi', warna: '#ef4444',
            catatan: 'Tunda tanam — lahan masih tergenang.' };
        if (sbanjir > 35) return { level: 'Air Sedang Turun', warna: '#f59e0b',
            catatan: 'Pantau tinggi muka air setiap hari. Siapkan benih agar siap saat lahan bisa ditanam.' };
        return { level: 'Siap Tanam', warna: WARNA_RAWA,
            catatan: 'Air cukup rendah — kondisi optimal untuk tanam di sawah rawa.' };
    }

    function risikoVegRawa(sbanjir) {
        if (sbanjir > 75) return { level: 'BAHAYA Banjir', warna: '#ef4444',
            catatan: 'Banjir aktif saat vegetatif. Anakan terendam >10 hari = mati. Gunakan Inpari 30/33.' };
        if (sbanjir > 50) return { level: 'Waspada Air Naik', warna: '#f59e0b',
            catatan: 'Pantau tinggi air harian. Buka saluran pembuang jika air naik >30 cm/24 jam.' };
        return { level: 'Aman', warna: WARNA_RAWA,
            catatan: 'Ketinggian air terkendali — kondisi vegetatif optimal.' };
    }

    function risikoGenRawa(sbanjir, banjirMendekat) {
        if (sbanjir > 65) return { level: 'KRITIS Banjir Bunting', warna: '#ef4444',
            catatan: 'GAGAL PANEN jika banjir mengenai malai bunting. Geser jadwal musim berikutnya.' };
        if (banjirMendekat) return { level: 'Banjir Mendekat', warna: '#f59e0b',
            catatan: 'Bulan depan diprediksi banjir. Hitung apakah panen bisa selesai sebelum air naik.' };
        return { level: 'Jendela Aman', warna: WARNA_RAWA,
            catatan: 'Fase generatif di jendela aman — penyerbukan dan pengisian bulir optimal.' };
    }

    function risikoPanenRawa(sbanjir, banjirMendekat) {
        if (sbanjir > 65) return { level: 'KRITIS Banjir Panen', warna: '#ef4444',
            catatan: 'Banjir aktif — lahan tidak bisa diakses. Panen manual darurat, prioritaskan petak dekat tanggul.' };
        if (banjirMendekat) return { level: 'Percepat Panen', warna: '#f59e0b',
            catatan: 'Percepat panen 5–7 hari dari jadwal. Pesan Combine sekarang — jangan tunggu 95% kuning.' };
        return { level: 'Jendela Panen Ideal', warna: WARNA_RAWA,
            catatan: 'Air surut, lahan kering — kondisi terbaik untuk panen di sawah rawa.' };
    }

    function risikoTikusRawa(sbanjir) {
        if (sbanjir > 60) return { level: 'Momen Gropyokan!', warna: WARNA_RAWA,
            catatan: '🌿 Banjir = tikus berkonsentrasi di tanggul. Momen TERBAIK gropyokan komunal.' };
        return { level: 'Rutin', warna: '#f59e0b',
            catatan: 'Pantau lubang tikus di tanggul. Pasang TBS di galengan yang tidak tergenang.' };
    }

    function risikoPupukRawa(sbanjir) {
        if (sbanjir > 70) return { level: 'Tunda', warna: '#ef4444',
            catatan: 'Jangan pupuk saat lahan tergenang dalam — pupuk larut dan hilang terbawa air.' };
        if (sbanjir > 40) return { level: 'Hati-hati', warna: '#f59e0b',
            catatan: 'Pupuk saat air surut. Di rawa, kurangi Urea 20% — tanah sudah kaya bahan organik.' };
        return { level: 'Optimal', warna: WARNA_RAWA,
            catatan: 'Kondisi baik untuk pemupukan. Kurangi Urea 20% dari dosis normal (rawa kaya N organik).' };
    }

    // ============================================================
    //  BAGIAN 3 — bangunKegiatanRawa()
    //  Menghasilkan daftar kegiatan yang sesuai konteks sawah rawa
    // ============================================================

    function bangunKegiatanRawa(rek, rawZOM, metodeTanam) {
        var isTabela  = (metodeTanam === 'tabela');
        var tglOlah   = rek.tglOlahTanah || tambahHari(rek.tglTanam, -20);
        var tglTanam  = rek.tglTanam;
        var tglPanen  = rek.tglPanen || tambahHari(tglTanam, rek.umurTotal || 90);

        // Benih
        var umurBibit = rek.varietas === 'genjah' ? 14 : rek.varietas === 'dalam' ? 28 : 21;
        var tglBenih  = isTabela ? tambahHari(tglTanam, -2) : tambahHari(tglTanam, -umurBibit);

        // Pasca-tanam (di rawa lebih hati-hati karena genangan fluktuatif)
        var tglP1     = tambahHari(tglTanam, 7);
        var tglP2     = tambahHari(tglTanam, 25);
        var tglP3     = tambahHari(tglTanam, 45);
        var tglI1     = tambahHari(tglTanam, 20);
        var tglI2     = tambahHari(tglTanam, 48);
        var tglFung   = tambahHari(tglTanam, 55);

        // Tikus: gropyokan saat surut (sebelum olah lahan)
        var tglGroyokM = tambahHari(tglOlah, -14);
        var tglGroyokS = tambahHari(tglOlah, -1);
        var tglTBSM    = tglTanam;
        var tglTBSS    = tambahHari(tglTanam, 30);
        var tglRacunM  = tambahHari(tglTanam, 1);
        var tglRacunS  = tambahHari(tglTanam, 21);

        function sb(tgl) { return skorBanjirBulan(rawZOM, tgl.getMonth()); }
        function bm(tgl) { return isBulanBanjir(rawZOM, (tgl.getMonth() + 1) % 12); }

        var umurTotal = rek.umurTotal || 90;

        var aktivitasBenih = isTabela ? {
            nama: 'Rendam & Peram Benih', ikon: '💧',
            deskripsi: 'Rendam 24 jam, peram 24 jam hingga berkecambah',
            tglMulai: tglBenih, tglSelesai: tglTanam,
            risiko: { level: 'Persiapan', warna: WARNA_RAWA, catatan: 'Siapkan benih saat menunggu air surut. Inkubasi di tempat yang tidak tergenang.' },
            tips: [
                'Rendam benih 24 jam, peram 24 jam hingga kecambah ±1–2 mm.',
                'Untuk sawah rawa, pilih benih Inpari 30 atau Inpari 33 (tahan rendaman).',
                'Dosis benih Tabela: 50–60 kg/ha. Sebar segera setelah air surut dan lahan bisa diolah.'
            ]
        } : {
            nama: 'Persemaian Benih (Bedeng Apung/Tinggi)', ikon: '🌱',
            deskripsi: 'Semai di bedeng apung atau lahan tinggi yang tidak tergenang',
            tglMulai: tglBenih, tglSelesai: tambahHari(tglBenih, 7),
            risiko: { level: 'Persiapan', warna: WARNA_RAWA, catatan: 'Di sawah rawa, persemaian idealnya di bedeng apung atau lahan yang lebih tinggi agar tidak terendam.' },
            tips: [
                'Buat bedeng apung dari bambu/papan bila lahan masih tergenang saat semai.',
                'Alternatif: semai di lahan pekarangan rumah yang lebih tinggi.',
                'Pindah tanam saat bibit umur ' + umurBibit + ' HSS dan lahan utama sudah bisa diolah.',
                'Varietas prioritas rawa: Inpari 30 (rendaman), Inpari 33, Inpari IR Nutri Zinc.'
            ]
        };

        var aktivitasTanam = isTabela ? {
            nama: 'Sebar Benih ke Lahan Rawa', ikon: '🌾',
            deskripsi: 'Sebar benih berkecambah saat air surut dan macak-macak',
            tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 1),
            risiko: risikoTanamRawa(sb(tglTanam)),
            tips: [
                'Sebar saat lahan macak-macak (jenuh air, tidak tergenang bebas).',
                'Jika masih ada genangan tipis (1–2 cm), tunggu 1–2 hari lagi.',
                'Target panen: ' + fmtL(tglPanen) + ' — ' + umurTotal + ' hari sejak sebar.'
            ]
        } : {
            nama: 'Tanam Pindah ke Lahan Rawa', ikon: '🌾',
            deskripsi: 'Bibit dipindah saat air surut dan lahan bisa dijangkau',
            tglMulai: tglTanam, tglSelesai: tambahHari(tglTanam, 3),
            risiko: risikoTanamRawa(sb(tglTanam)),
            tips: [
                'Pindah tanam hanya saat air sudah surut dan lahan bisa diakses tanpa tenggelam.',
                'Bibit bisa dipindah lebih tua (s/d 28 HSS) jika lahan belum siap — lebih tahan banjir.',
                'Jarak tanam lebih lebar di rawa: 30×30 cm untuk sirkulasi air lebih baik.',
                'Target panen: ' + fmtL(tglPanen) + '.'
            ]
        };

        var daftar = [
            {
                nama: 'Gropyokan Komunal (Saat Surut)', ikon: '🐀',
                deskripsi: 'Manfaatkan surut — tikus berkonsentrasi di tanggul',
                tglMulai: tglGroyokM, tglSelesai: tglGroyokS,
                risiko: risikoTikusRawa(sb(tglGroyokM)),
                tips: [
                    '🌿 Di sawah rawa, gropyokan paling efektif saat banjir baru surut.',
                    'Tikus bermigrasi ke tanggul saat banjir — kepadatan sangat tinggi, momen terbaik.',
                    'Koordinasi dengan petani blok sekitar untuk hasil maksimal.',
                    'Bersihkan tanggul dari gulma dan tutup lubang sarang dengan tanah basah.'
                ]
            },
            {
                nama: 'Pengolahan Lahan (Pasca-Surut)', ikon: '🚜',
                deskripsi: 'Bajak & garu hanya setelah air benar-benar surut',
                tglMulai: tglOlah, tglSelesai: tambahHari(tglOlah, 7),
                risiko: risikoOlahRawa(sb(tglOlah)),
                tips: [
                    '⚠️ Tunggu air surut total sebelum traktor masuk — tanah rawa sangat cepat amblas.',
                    'Cek dengan cara berjalan di lahan: jika kaki tidak tenggelam > 15 cm, traktor bisa masuk.',
                    'Tanah rawa biasanya subur secara alami — tidak perlu dolomit kecuali pH < 4.5 (sulfat masam).',
                    'Periksa kondisi pintu air (tabat/stoplog) sebelum mulai bajak.'
                ]
            },
            aktivitasBenih,
            aktivitasTanam,
            {
                nama: 'Pasang TBS di Tanggul', ikon: '🚧',
                deskripsi: 'Trap Barrier System — di tanggul yang tidak tergenang',
                tglMulai: tglTBSM, tglSelesai: tglTBSS,
                risiko: risikoTikusRawa(sb(tglTBSM)),
                tips: [
                    '🌿 Di rawa, TBS dipasang di TANGGUL LUAR, bukan di dalam petakan.',
                    'Tikus di rawa bersembunyi di tanggul — TBS di tanggul 3× lebih efektif.',
                    'Periksa bubu perangkap setiap 3–5 hari.'
                ]
            },
            {
                nama: 'Umpan Racun Tikus', ikon: '☠️',
                deskripsi: 'Rodentisida di liang aktif tanggul — jangan di petakan tergenang',
                tglMulai: tglRacunM, tglSelesai: tglRacunS,
                risiko: risikoTikusRawa(sb(tglRacunM)),
                tips: [
                    'Letakkan umpan di liang aktif di tanggul — JANGAN di petakan yang masih bisa tergenang.',
                    'Umpan di dalam petakan rawa akan larut saat banjir tiba-tiba.',
                    'Gunakan Brodifacoum / Bromadiolon (antikoagulan).'
                ]
            },
            {
                nama: 'Pupuk Dasar — Tahap I', ikon: '🧪',
                deskripsi: 'NPK + Urea I — dosis dikurangi (rawa kaya bahan organik)',
                tglMulai: tglP1, tglSelesai: tambahHari(tglP1, 2),
                risiko: risikoPupukRawa(sb(tglP1)),
                tips: [
                    '⚠️ Kurangi Urea 20% dari dosis normal — tanah rawa sudah kaya nitrogen organik.',
                    'Pupuk saat air macak-macak (tidak tergenang bebas) agar tidak larut terbawa air.',
                    'Phonska: dosis normal. Kalium penting untuk ketahanan batang dari banjir.'
                ]
            },
            {
                nama: 'Pemantauan Muka Air & Vegetatif', ikon: '📏',
                deskripsi: 'Pantau tinggi air harian — kritis di fase vegetatif',
                tglMulai: tambahHari(tglTanam, 7), tglSelesai: tambahHari(tglTanam, 40),
                risiko: risikoVegRawa(sb(tambahHari(tglTanam, 20))),
                tips: [
                    'Ukur tinggi muka air setiap pagi — buat pancang pengukur dari bambu.',
                    'Jika air naik >30 cm dalam 24 jam: buka pintu pembuang / tabat segera.',
                    'Inpari 30 tahan terendam s/d 14 hari pada fase vegetatif.',
                    'Jika tergenang > 14 hari: pertimbangkan tanam ulang di siklus berikutnya.'
                ]
            },
            {
                nama: 'Insektisida I (Vegetatif)', ikon: '💊',
                deskripsi: 'Pengendalian WBC, Penggerek — semprot saat air surut',
                tglMulai: tglI1, tglSelesai: tambahHari(tglI1, 2),
                risiko: { level: 'Kondisional', warna: '#f59e0b',
                    catatan: 'Semprot hanya saat air surut dan kanopi bisa dijangkau. Di rawa, wereng lebih jarang karena musuh alami lebih banyak.' },
                tips: [
                    'Semprot saat air surut — jangan semprot saat lahan tergenang (pestisida larut).',
                    'Di sawah rawa, musuh alami lebih berlimpah — terapkan PHT ketat.',
                    'Bahan aktif: Imidakloprid atau BPMC, hanya jika WBC > 10 ekor/rumpun.'
                ]
            },
            {
                nama: 'Pupuk Susulan — Tahap II & III', ikon: '🧪',
                deskripsi: 'Urea + Phonska susulan — berbasis BWD',
                tglMulai: tglP2, tglSelesai: tambahHari(tglP3, 2),
                risiko: risikoPupukRawa(sb(tglP2)),
                tips: [
                    'Pupuk II (21–25 HST): Urea sisa 1/3 + Phonska 1/4 — saat air macak-macak.',
                    'Pupuk III (42–50 HST, kondisional BWD): hanya jika skala BWD < 4.',
                    'Kurangi Urea 20% total vs lahan irigasi biasa.'
                ]
            },
            {
                nama: 'Insektisida II & Fungisida Blast', ikon: '🍄',
                deskripsi: 'Walang Sangit + pencegahan Blast — fase malai keluar',
                tglMulai: tglI2, tglSelesai: tambahHari(tglFung, 2),
                risiko: risikoGenRawa(sb(tglI2), bm(tglI2)),
                tips: [
                    'Semprot walang sangit pagi hari — bahan aktif: Malathion / Deltametrin.',
                    'Fungisida Blast 5–7 hari sebelum malai keluar: Tricyclazole 0,5 l/ha.',
                    '⚠️ Di rawa, jika banjir mendekat saat generatif: hentikan semua aplikasi kimia.'
                ]
            },
            {
                nama: '🌟 PANEN — Sebelum Banjir Berikutnya', ikon: '🌾',
                deskripsi: 'Panen dipercepat jika banjir akan datang',
                tglMulai: tglPanen, tglSelesai: tambahHari(tglPanen, 5),
                risiko: risikoPanenRawa(sb(tglPanen), bm(tglPanen)),
                tips: [
                    '⚠️ Di sawah rawa: pantau prakiraan cuaca & tinggi muka air 10 hari sebelum panen.',
                    'Jika banjir diprediksi dalam 2 minggu: percepat panen 5–7 hari.',
                    'Panen dini (kadar air 25–28%): langsung giling atau gunakan dryer.',
                    'Pesan Combine Harvester 14 hari sebelumnya — pastikan bisa masuk ke lahan.'
                ]
            }
        ];

        daftar.sort(function(a,b){ return a.tglMulai.getTime() - b.tglMulai.getTime(); });
        return daftar;
    }

    // ============================================================
    //  BAGIAN 4 — OVERRIDE hitungRisikoDinamis untuk Risiko Iklim
    // ============================================================

    var _hitungRisikoDinamisAsli = null;

    function hitungRisikoDinamisRawa(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        var sb = skorBanjirBulan(baselineData, bulanIndex);
        var banjirAktif    = isBulanBanjir(baselineData, bulanIndex);
        var banjirMendekat = isBulanBanjir(baselineData, (bulanIndex + 1) % 12);

        // Amplifikasi La Niña / IOD Negatif → banjir makin parah
        var amp = ((ensoVal < -0.5) ? 15 : 0) + ((iodVal < -0.4) ? 10 : 0);
        sb = Math.min(100, sb + amp);

        var skor, statusCuaca, masalah, tipeBahaya;

        if (fase === 'Tanam') {
            if (banjirAktif) {
                skor=92; tipeBahaya='banjir'; statusCuaca='Tergenang/Banjir';
                masalah='TIDAK BISA OLAH LAHAN: masih tergenang. Tunggu air surut sebelum traktor masuk. Manfaatkan untuk gropyokan di tanggul.';
            } else if (sb > 55) {
                skor=55; tipeBahaya='banjir'; statusCuaca='Air Baru Surut';
                masalah='Air baru surut, tanah masih lembek. Tunggu 1–2 minggu sebelum traktor masuk.';
            } else if (sb < 20) {
                skor=15; tipeBahaya='aman'; statusCuaca='Surut Optimal';
                masalah='Kondisi terbaik: air surut, tanah cukup padat. Segera olah lahan.';
            } else {
                skor=30; tipeBahaya='aman'; statusCuaca='Air Sedang Turun';
                masalah='Air sedang surut. Pantau harian, siapkan benih.';
            }
        } else if (fase === 'Vegetatif') {
            if (banjirAktif && sb > 75) {
                skor=80; tipeBahaya='banjir'; statusCuaca='Banjir Saat Vegetatif';
                masalah='BAHAYA: banjir aktif saat vegetatif. Genangan >14 hari = anakan mati. Gunakan Inpari 30/33.';
            } else if (sb > 55) {
                skor=45; tipeBahaya='banjir'; statusCuaca='Air Cukup Tinggi';
                masalah='Air tinggi, waspada naik mendadak. Buka saluran pembuang, pantau harian.';
            } else if (sb < 20) {
                skor=25; tipeBahaya='aman'; statusCuaca='Air Rendah';
                masalah='Air rendah di vegetatif rawa — baik untuk akar. Pompanisasi ringan jika terlalu kering.';
            } else {
                skor=18; tipeBahaya='aman'; statusCuaca='Air Normal';
                masalah='Ketinggian air terkendali — optimal untuk anakan.';
            }
        } else if (fase === 'Generatif') {
            if (banjirAktif || sb > 70) {
                skor=97; tipeBahaya='banjir'; statusCuaca='KRITIS: Banjir Bunting';
                masalah='KRITIS GAGAL PANEN: banjir saat bunting = malai hampa massal. Jadwal berikutnya harus digeser.';
            } else if (banjirMendekat && sb > 50) {
                skor=70; tipeBahaya='banjir'; statusCuaca='Banjir Mendekat';
                masalah='Bulan depan diprediksi banjir. Hitung apakah panen bisa selesai sebelum air naik.';
            } else if (sb < 25) {
                skor=10; tipeBahaya='aman'; statusCuaca='Jendela Aman';
                masalah='Jendela terbaik generatif di rawa: air rendah, tidak ada ancaman banjir.';
            } else {
                skor=35; tipeBahaya='aman'; statusCuaca='Air Terkendali';
                masalah='Kondisi generatif aman. Pantau curah hujan harian — >50 mm/hari x3 hari = waspada.';
            }
        } else if (fase === 'Panen') {
            if (banjirAktif || sb > 70) {
                skor=90; tipeBahaya='banjir'; statusCuaca='KRITIS: Banjir Panen';
                masalah='KRITIS: banjir aktif saat panen. Panen manual darurat, prioritaskan petak dekat tanggul.';
            } else if (banjirMendekat && sb > 45) {
                skor=65; tipeBahaya='banjir'; statusCuaca='Banjir Mendekat — Percepat';
                masalah='Percepat panen 5–7 hari. Pesan Combine sekarang. Siapkan dryer karena KA lebih tinggi.';
            } else if (sb < 25) {
                skor=8; tipeBahaya='aman'; statusCuaca='Jendela Panen Ideal';
                masalah='Kondisi panen terbaik di rawa: surut, kering, Combine bisa masuk.';
            } else {
                skor=30; tipeBahaya='aman'; statusCuaca='Aman untuk Panen';
                masalah='Kondisi aman. Pantau prakiraan 7 hari ke depan sebelum jadwalkan Combine.';
            }
        } else {
            skor=20; tipeBahaya='aman'; statusCuaca='Normal'; masalah='-';
        }

        skor = Math.round(Math.max(0, Math.min(100, skor)));
        return { skor:skor, statusCuaca:statusCuaca, masalah:masalah, tipeBahaya:tipeBahaya };
    }

    // ============================================================
    //  BAGIAN 5 — rekomendasiRawa() — mesin rekomendasi khusus
    // ============================================================

    function rekomendasiRawa(rawZOM, ensoVal, iodVal) {
        var now   = new Date();
        var tahun = now.getFullYear();

        // ── Identifikasi 3 bulan CH tertinggi = periode banjir ─────
        var sorted = rawZOM.map(function(v,i){ return {v:v,i:i}; })
                           .sort(function(a,b){ return b.v-a.v; });
        var banjirSet = {};
        for (var k=0; k<3; k++) {
            var bi = sorted[k].i;
            banjirSet[bi] = true;
            banjirSet[(bi+1)%12] = true; // buffer: bulan setelah puncak masih tergenang
        }

        // ── Bulan aman = bukan bulan banjir ────────────────────────
        var bulanAman = [];
        for (var m=0; m<12; m++) { if (!banjirSet[m]) bulanAman.push(m); }
        if (bulanAman.length === 0) bulanAman = [0,6];

        var JEDA = 20; // hari olah lahan → tanam (lebih cepat di rawa)

        var varianArr = [
            { kode:'genjah', label:'Genjah (< 95 HST) — DIREKOMENDASIKAN untuk rawa', panen:90  },
            { kode:'sedang', label:'Sedang (95–115 HST) — jika window cukup',          panen:110 },
            { kode:'dalam',  label:'Dalam (≥ 116 HST) — risiko tinggi di rawa',        panen:125 }
        ];

        var kandidat = [];

        bulanAman.forEach(function(bOlah) {
            varianArr.forEach(function(v) {
                var tglOlah  = new Date(tahun, bOlah, 15);
                var tglTanam = tambahHari(tglOlah, JEDA);
                var tglPanen = tambahHari(tglTanam, v.panen);
                var bPanen   = tglPanen.getMonth();
                var bGen     = tambahHari(tglTanam, Math.floor(v.panen * 0.60)).getMonth();

                var panenAman = !banjirSet[bPanen] && !banjirSet[(bPanen+1)%12];
                var genAman   = !banjirSet[bGen];
                if (!panenAman || !genAman) return;

                var bufferBulan = 0;
                for (var bb=1; bb<=3; bb++) {
                    if (banjirSet[(bPanen+bb)%12]) { bufferBulan=bb-1; break; }
                    bufferBulan=bb;
                }

                var nilaiTotal = (100 - skorBanjirBulan(rawZOM, bPanen)) * 0.45
                               + (100 - Math.abs(skorBanjirBulan(rawZOM, bGen) - 15)) * 0.40
                               + (v.kode==='genjah' ? 20 : v.kode==='sedang' ? 10 : 0);

                // Koreksi ENSO/IOD
                if (ensoVal < -0.5) nilaiTotal -= 15; // La Niña → banjir lebih intens
                if (ensoVal >  0.5) nilaiTotal += 10; // El Niño → banjir lebih ringan
                if (iodVal  < -0.4) nilaiTotal -= 10; // IOD Negatif → tambah basah

                var statusWkt = { isLewat: tglTanam < now, isBerjalan: false };

                var keteranganENSO = '';
                if (ensoVal < -0.5) keteranganENSO = ' La Niña aktif — antisipasi banjir lebih awal/tinggi.';
                else if (ensoVal > 0.5) keteranganENSO = ' El Niño aktif — banjir kemungkinan lebih ringan.';

                var jadwalTikusRawa = null;
                if (typeof window.hitungJadwalTikus === 'function') {
                    jadwalTikusRawa = window.hitungJadwalTikus(tglOlah, tglTanam);
                    // Override catatan gropyokan untuk konteks rawa
                    if (jadwalTikusRawa && jadwalTikusRawa.gropyokan) {
                        jadwalTikusRawa.gropyokan.catatan =
                            '🌿 RAWA: Gropyokan paling efektif saat banjir baru surut — '
                            + 'tikus berkonsentrasi di tanggul. Koordinasi komunal.';
                    }
                }

                kandidat.push({
                    bOlah        : bOlah,
                    tglOlahTanah : tglOlah,
                    tglTanam     : tglTanam,
                    tglPanen     : tglPanen,
                    varietas     : v.kode,
                    labelVar     : v.label,
                    umurTotal    : v.panen,
                    nilaiTotal   : nilaiTotal,
                    bufferBulan  : bufferBulan,
                    jadwalTikus  : jadwalTikusRawa,
                    alasan       : 'Olah lahan ' + NAMA_BULAN[bOlah] + ' (pasca-surut), '
                                 + 'panen ' + NAMA_BULAN[bPanen] + ' (buffer ' + bufferBulan + ' bulan sebelum banjir). '
                                 + 'Generatif di ' + NAMA_BULAN[bGen] + ' — aman dari banjir.'
                                 + keteranganENSO,
                    isLewat      : statusWkt.isLewat,
                    isBerjalan   : false
                });
            });
        });

        kandidat.sort(function(a,b){ return b.nilaiTotal - a.nilaiTotal; });

        // Ambil dua window yang berbeda (jarak minimal 3 bulan)
        var hasil = [];
        var dipakai = {};

        kandidat.forEach(function(k) {
            if (hasil.length >= 2) return;
            var terlalu = Object.keys(dipakai).some(function(b){
                var diff = Math.abs(parseInt(b) - k.bOlah);
                return Math.min(diff, 12-diff) < 3;
            });
            if (terlalu) return;
            dipakai[k.bOlah] = true;

            hasil.push({
                musimNama  : hasil.length===0 ? 'MT I — Musim Tanam Utama (Rawa)' : 'MT II — Musim Tanam Kedua (Rawa)',
                musimKode  : hasil.length===0 ? 'rendeng' : 'gadu',
                tglOlahTanah: k.tglOlahTanah,
                tglTanam   : k.tglTanam,
                tglPanen   : k.tglPanen,
                varietas   : k.varietas,
                labelVar   : k.labelVar,
                umurTotal  : k.umurTotal,
                alasan     : k.alasan,
                isLewat    : k.isLewat,
                isBerjalan : k.isBerjalan,
                jadwalTikus: k.jadwalTikus
            });
        });

        // Fallback
        if (hasil.length === 0) {
            var bFb  = bulanAman[0] || 4;
            var tFb  = new Date(tahun, bFb, 15);
            var ttFb = tambahHari(tFb, JEDA);
            hasil.push({
                musimNama:'MT I — Estimasi Terbaik (Rawa)', musimKode:'rendeng',
                tglOlahTanah:tFb, tglTanam:ttFb, tglPanen:tambahHari(ttFb, 90),
                varietas:'genjah', labelVar:'Genjah — satu-satunya pilihan realistis',
                umurTotal:90,
                alasan:'⚠️ Tidak ada window sempurna. Bulan paling aman: ' + NAMA_BULAN[bFb]
                       + '. Gunakan varietas genjah dan pantau muka air setiap hari.',
                isLewat:false, isBerjalan:false, jadwalTikus:null
            });
        }

        hasil.sort(function(a,b){ return a.tglOlahTanah.getTime()-b.tglOlahTanah.getTime(); });
        return hasil;
    }

    // ============================================================
    //  BAGIAN 6 — OVERRIDE prosesJadwalOtomatis (KALENDER TNM)
    //
    //  Ini adalah fix utama untuk [FIX-1].
    //  Kita tunggu JTO selesai init (setTimeout 600ms), lalu
    //  bungkus prosesJadwalOtomatis dengan versi yang sadar rawa.
    // ============================================================

    function patchProsesJTO() {
        var _asli = window.prosesJadwalOtomatis;
        if (typeof _asli !== 'function') {
            // JTO belum siap, coba lagi
            setTimeout(patchProsesJTO, 300);
            return;
        }

        window.prosesJadwalOtomatis = async function() {
            // Jika bukan rawa, jalankan fungsi asli tanpa perubahan
            if (getJenisSawah() !== 'rawa') {
                return _asli.apply(this, arguments);
            }

            // ── MODE RAWA ─────────────────────────────────────────
            var hasilEl  = document.getElementById('jtoHasil');
            var teksEl   = document.getElementById('jtoTeks');
            var statusEl = document.getElementById('jtoStatus');
            var btnJTO   = document.getElementById('btnJadwalOtomatis');

            if (!hasilEl || !teksEl) return;

            hasilEl.style.display = 'block';
            teksEl.innerHTML = '';

            if (btnJTO) {
                btnJTO.disabled = true;
                btnJTO.style.opacity = '0.75';
                btnJTO.textContent = 'MENGANALISIS IKLIM RAWA...';
            }
            if (statusEl) statusEl.innerHTML =
                '<span style="color:' + WARNA_RAWA + ';">🌿 Mengambil data ZOM & pola banjir...</span>';

            try {
                // ── GPS ──────────────────────────────────────────
                var lat = -4.0, lon = 120.0;
                try {
                    if (window._lokasiKalender) {
                        lat = window._lokasiKalender.lat; lon = window._lokasiKalender.lon;
                    } else if (window._koordinatTerakhir) {
                        lat = window._koordinatTerakhir.coords.latitude;
                        lon = window._koordinatTerakhir.coords.longitude;
                    } else {
                        var pos = await new Promise(function(res,rej){
                            navigator.geolocation.getCurrentPosition(res,rej,{
                                enableHighAccuracy:false,timeout:8000,maximumAge:300000
                            });
                        });
                        lat = pos.coords.latitude; lon = pos.coords.longitude;
                        window._lokasiKalender = {lat:lat, lon:lon};
                    }
                } catch(gpsErr) { console.warn('[Rawa] GPS fallback:', gpsErr.message); }

                // ── ENSO / IOD / ZOM ─────────────────────────────
                var adaENSO = typeof window.getENSOAnomaly === 'function';
                var adaIOD  = typeof window.getIODAnomaly  === 'function';

                var FALLBACK_DARURAT = { latestAnomaly:0, status:'Netral',
                    sumber:'Tidak tersedia (modul tidak termuat)' };

                var getENSOp  = adaENSO ? window.getENSOAnomaly() : Promise.resolve(FALLBACK_DARURAT);
                var getIODp   = adaIOD  ? window.getIODAnomaly()  : Promise.resolve(FALLBACK_DARURAT);

                // Ambil ZOM via fungsi yang sama dengan JTO asli
                var getZOM = window._jtoGetDataZOM || function(la,lo){
                    // Fallback sederhana jika fungsi internal JTO tidak tersedia
                    var zona = typeof window.tentukanZonaIklim==='function'
                        ? window.tentukanZonaIklim(la,lo) : 'monsunal';
                    var fb = {
                        monsunal:  [0.9,0.8,0.6,0.3,-0.1,-0.8,-1.2,-1.3,-0.9,-0.3,0.4,0.8],
                        ekuatorial:[0.2,0.3,0.5,0.6,0.4,0.0,-0.3,-0.2,0.3,0.6,0.5,0.3],
                        peralihan: [0.5,0.5,0.4,0.2,0.0,-0.4,-0.6,-0.6,-0.3,0.1,0.4,0.5],
                        lokal:     [0.1,0.1,0.1,0.0,0.0,-0.1,-0.1,-0.1,0.0,0.1,0.1,0.1]
                    };
                    return Promise.resolve({
                        data: fb[zona]||fb.monsunal, nama:'Estimasi Lokal',
                        jarak:null, zona:zona
                    });
                };

                var results  = await Promise.all([getENSOp, getIODp, getZOM(lat,lon)]);
                var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
                var ensoVal  = ensoData.latestAnomaly || 0;
                var iodVal   = iodData.latestAnomaly  || 0;
                var rawZOM   = zonaInfo.data;

                // ── Rekomendasi khusus rawa ───────────────────────
                var rekArr = rekomendasiRawa(rawZOM, ensoVal, iodVal);

                var elMetode  = document.getElementById('metodeTanamJTO');
                var metode    = (elMetode && elMetode.value==='tabela') ? 'tabela' : 'tapin';
                window._jtoMetodeTanam = metode;

                // Bangun kegiatan dengan versi rawa
                var multiJadwal = rekArr.map(function(rek) {
                    return {
                        rekomendasi : rek,
                        kegiatan    : bangunKegiatanRawa(rek, rawZOM, metode),
                        _skorBulan  : rawZOM.map(function(_,i){
                            return skorBanjirBulan(rawZOM,i);
                        })
                    };
                });

                window._jtoData     = multiJadwal;
                window._jtoEnsoData = ensoData;
                window._jtoIodData  = iodData;

                if (statusEl) statusEl.innerHTML = '';
                if (btnJTO) {
                    btnJTO.disabled = false;
                    btnJTO.style.opacity = '';
                    btnJTO.textContent = 'ANALISIS & BUAT JADWAL OTOMATIS';
                    btnJTO.classList.remove('jto-pulse');
                }

                // ── Render output dengan fungsi JTO asli jika tersedia ──
                // Coba render via fungsi renderOutput internal JTO
                // (dipanggil lewat _jtoRenderOutput yang kita expose)
                if (typeof window._jtoRenderOutput === 'function') {
                    teksEl.innerHTML = window._jtoRenderOutput(
                        multiJadwal, zonaInfo, ensoData, iodData, metode
                    );
                } else {
                    // Render manual yang kompatibel
                    teksEl.innerHTML = renderOutputRawa(
                        multiJadwal, zonaInfo, ensoData, iodData, metode
                    );
                }

                // Tambahkan kotak info rawa di bawah hasil
                setTimeout(tambahInfoRawaJTO, 100);

            } catch(err) {
                console.error('[Rawa JTO]', err);
                if (statusEl) statusEl.innerHTML = '';
                if (btnJTO) {
                    btnJTO.disabled = false;
                    btnJTO.style.opacity = '';
                    btnJTO.textContent = 'ANALISIS & BUAT JADWAL OTOMATIS';
                }
                teksEl.innerHTML = '<div style="padding:12px;background:rgba(239,68,68,0.1);'
                    + 'border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;font-size:13px;">'
                    + '❌ Gagal membuat jadwal rawa: ' + (err.message||'Error tidak diketahui') + '</div>';
            }
        };

        console.log('[patch_sawah_rawa_v1.1] prosesJadwalOtomatis berhasil di-patch.');
    }

    // ============================================================
    //  BAGIAN 7 — renderOutputRawa() — render HTML hasil JTO rawa
    // ============================================================

    function renderOutputRawa(multiJadwal, zonaInfo, ensoData, iodData, metodeTanam) {
        var WARNA = '#3b82f6';

        function renderKartuRawa(k, nomor, isLewat) {
            var now     = new Date();
            var lewat   = isLewat || k.tglSelesai < now;
            var w       = lewat ? '#64748b' : (k.risiko&&k.risiko.warna ? k.risiko.warna : WARNA_RAWA);
            var fb      = typeof window.namaFaseBulan==='function'
                ? window.namaFaseBulan(typeof window.hariFaseBulan==='function'
                    ? window.hariFaseBulan(k.tglMulai) : 15)
                : {ikon:'🌿', nama:'Sawah Rawa'};

            var tipsHTML = (k.tips||[]).map(function(t){
                return '<li style="margin-bottom:5px;color:' + (lewat?'#475569':'#cbd5e1') + ';line-height:1.5;">' + t + '</li>';
            }).join('');

            var badge = lewat
                ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:#1e293b;color:#64748b;white-space:nowrap;flex-shrink:0;border:1px solid #334155;">📋 Referensi</span>'
                : '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';white-space:nowrap;flex-shrink:0;">' + (k.risiko&&k.risiko.level||'OK') + '</span>';

            var catatan = lewat
                ? '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin:10px 0;border-left:3px solid #334155;"><div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:2px;">📋 Data Proyeksi</div><div style="font-size:12px;color:#475569;">Sudah terlewati — ditampilkan sebagai referensi.</div></div>'
                : '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin:10px 0;border-left:3px solid ' + w + ';"><div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan Kondisi</div><div style="font-size:12px;color:#cbd5e1;">' + (k.risiko&&k.risiko.catatan||'') + '</div></div>';

            return '<div style="background:#1b273a;border:0.5px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:9px;overflow:hidden;">'
                + '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">'
                + '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
                + '<div><div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:1px;">Kegiatan ' + nomor + '</div>'
                + '<div style="font-size:14px;font-weight:700;color:' + (lewat?'#64748b':'#fff') + ';">' + k.nama + '</div></div>'
                + badge + '</div>'
                + '<div style="font-size:12px;color:#94a3b8;margin-top:3px;"><strong style="color:' + (lewat?'#475569':'#e2e8f0') + ';">' + fmtL(k.tglMulai) + '</strong> s/d ' + fmtP(k.tglSelesai) + '</div>'
                + '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + (k.deskripsi||'') + '</div>'
                + '</div>'
                + '<span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;">▼</span>'
                + '</div>'
                + '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">'
                + catatan
                + '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>'
                + '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tipsHTML + '</ul>'
                + '</div></div>';
        }

        var labelZona = zonaInfo.zona ? zonaInfo.zona.toUpperCase() : 'MONSUNAL';
        var sumber    = zonaInfo.jarak ? zonaInfo.nama + ' (' + zonaInfo.jarak + ' km)' : (zonaInfo.nama||'ZOM Lokal');

        var html = '<div style="padding:4px 0;">'
            + '<div style="background:rgba(29,158,117,0.09);border:1px solid rgba(29,158,117,0.25);'
            + 'border-left:4px solid ' + WARNA_RAWA + ';border-radius:14px;padding:14px 16px;margin-bottom:14px;">'
            + '<div style="font-size:11px;color:' + WARNA_RAWA + ';font-weight:700;letter-spacing:0.5px;margin-bottom:8px;">'
            + '🌿 INFORMASI IKLIM — SAWAH RAWA / LEBAK / DAS</div>'
            + '<div style="display:grid;grid-template-columns:1fr;gap:8px;font-size:12px;">'
            + '<div><span style="color:#64748b;">Zona iklim & sumber data</span><br>'
            + '<strong style="color:#fff;">' + labelZona + ' • ' + sumber + '</strong></div>'
            + '<div><span style="color:#64748b;">Kondisi ENSO / IOD</span><br>'
            + '<strong style="color:#fff;">' + (ensoData.status||'Netral') + ' / ' + (iodData.status||'Netral') + '</strong></div>'
            + '<div><span style="color:#64748b;">Strategi utama</span><br>'
            + '<strong style="color:' + WARNA_RAWA + ';">Cari jendela aman antara dua puncak banjir</strong></div>'
            + '</div></div>';

        multiJadwal.forEach(function(jadwal) {
            var rek     = jadwal.rekomendasi;
            var keg     = jadwal.kegiatan;
            var opacity = rek.isLewat ? '0.6' : '1';

            var badge = rek.isLewat
                ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;vertical-align:middle;">📋 Blueprint</span>'
                : rek.isBerjalan
                    ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(29,158,117,0.15);color:' + WARNA_RAWA + ';border:1px solid rgba(29,158,117,0.4);margin-left:10px;vertical-align:middle;">🟢 Aktif</span>'
                    : '';

            var tglMasuk = metodeTanam==='tabela' ? rek.tglTanam : tambahHari(rek.tglTanam,-8);

            html += '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;'
                  + 'border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacity + ';">'
                  + '🌿 ' + rek.musimNama.toUpperCase() + badge + '</div>';

            html += '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;'
                  + 'padding:12px;margin-bottom:12px;opacity:' + opacity + ';">'
                  + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">'
                  + '<div><span style="color:#64748b;">Olah Lahan (Pasca-Surut)</span><br>'
                  + '<strong style="color:' + WARNA_RAWA + ';font-size:13px;">' + fmtL(rek.tglOlahTanah||rek.tglTanam) + '</strong></div>'
                  + '<div><span style="color:#64748b;">Varietas</span><br>'
                  + '<strong style="color:#fff;font-size:13px;">' + rek.labelVar + '</strong></div>'
                  + '</div>'
                  + '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">💡 ' + rek.alasan + '</div>'
                  + '</div>';

            keg.forEach(function(k,i){ html += renderKartuRawa(k,i+1,rek.isLewat); });
        });

        html += '<div style="margin-top:16px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;'
              + 'font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">'
              + '⚠️ Jadwal rawa dihitung dari jendela aman antara puncak banjir (ZOM lokal). '
              + 'Sesuaikan dengan kondisi aktual tinggi muka air di lapangan.<br>'
              + '📚 Sumber: IRRI Flood-Prone Lowland (2019) · Balitbangtan (2018) · BB Padi (2022)</div>';

        html += '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;'
              + 'background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">'
              + '📲 Kirim Jadwal ke WhatsApp ↗</button>';

        html += '</div>';
        return html;
    }

    function tambahInfoRawaJTO() {
        var teksEl = document.getElementById('jtoTeks');
        if (!teksEl || getJenisSawah() !== 'rawa') return;

        var existing = document.getElementById('rawaInfoPanelJTO');
        if (existing) existing.remove();

        var panel = document.createElement('div');
        panel.id = 'rawaInfoPanelJTO';
        panel.style.cssText = 'margin-top:16px;padding:14px;border-radius:14px;'
            + 'background:rgba(29,158,117,0.08);border:1px solid rgba(29,158,117,0.3);'
            + 'border-left:4px solid ' + WARNA_RAWA + ';font-size:0.8rem;color:#cbd5e1;line-height:1.7;';
        panel.innerHTML = '<div style="font-weight:700;color:' + WARNA_RAWA + ';margin-bottom:8px;">'
            + '🌿 PANDUAN KHUSUS SAWAH RAWA / LEBAK / DAS</div>'
            + '• Olah lahan hanya saat air surut (kaki tidak tenggelam >15 cm di lahan)<br>'
            + '• Generatif & panen HARUS selesai sebelum puncak banjir berikutnya<br>'
            + '• Varietas prioritas: <b>Inpari 30</b> (tahan rendaman 14 hari), <b>Inpari 33</b><br>'
            + '• Kurangi Urea 20% — rawa sudah kaya bahan organik (N alami tinggi)<br>'
            + '• Saat banjir surut = momen gropyokan terbaik (tikus berkonsentrasi di tanggul)<br>'
            + '• Periksa & perbaiki pintu air (tabat/stoplog) sebelum setiap musim tanam<br>'
            + '<div style="margin-top:8px;font-size:0.72rem;opacity:0.6;">'
            + 'Sumber: Balitbangtan (2018); IRRI Flood-Prone Lowland (2019); BB Padi (2022)</div>';

        teksEl.appendChild(panel);
    }

    // ============================================================
    //  BAGIAN 8 — OVERRIDE rekomendasiWindowTanam & hitungRisikoD
    // ============================================================

    function patchFungsiGlobal() {
        // hitungRisikoDinamis (Risiko Iklim)
        _hitungRisikoDinamisAsli = window.hitungRisikoDinamis;
        window.hitungRisikoDinamis = function(bulanIndex, fase, ensoVal, iodVal, baselineData) {
            if (getJenisSawah() === 'rawa') {
                return hitungRisikoDinamisRawa(bulanIndex, fase, ensoVal, iodVal, baselineData);
            }
            if (typeof _hitungRisikoDinamisAsli === 'function') {
                return _hitungRisikoDinamisAsli(bulanIndex, fase, ensoVal, iodVal, baselineData);
            }
            return { skor:50, statusCuaca:'Normal', masalah:'-', tipeBahaya:'aman' };
        };

        // rekomendasiWindowTanam — wrapper sadar rawa
        var _rekAsli = window.rekomendasiWindowTanam;
        window.rekomendasiWindowTanam = function(skorBulan, rawZOM, zona, ensoVal, iodVal) {
            if (getJenisSawah() === 'rawa') {
                return rekomendasiRawa(rawZOM, ensoVal||0, iodVal||0);
            }
            if (typeof _rekAsli === 'function') {
                return _rekAsli(skorBulan, rawZOM, zona, ensoVal, iodVal);
            }
            return [];
        };
    }

    // ============================================================
    //  BAGIAN 9 — PATCH prosesAnalisisKalender (Risiko Iklim)
    // ============================================================

    var _prosesKalenderAsli = null;

    function patchProsesKalender() {
        _prosesKalenderAsli = window.prosesAnalisisKalender;
        window.prosesAnalisisKalender = async function() {
            if (typeof _prosesKalenderAsli === 'function') {
                await _prosesKalenderAsli.apply(this, arguments);
            }
            if (getJenisSawah() !== 'rawa') return;

            var kontainer = document.getElementById('teksAnalisisFase');
            if (!kontainer) return;
            var ex = document.getElementById('rawaInfoPanel');
            if (ex) ex.remove();

            var panel = document.createElement('div');
            panel.id = 'rawaInfoPanel';
            panel.style.cssText = 'margin-top:16px;padding:14px;border-radius:14px;'
                + 'background:rgba(29,158,117,0.08);border:1px solid rgba(29,158,117,0.3);'
                + 'border-left:4px solid ' + WARNA_RAWA + ';font-size:0.8rem;color:#cbd5e1;line-height:1.7;';
            panel.innerHTML = '<div style="font-weight:700;color:' + WARNA_RAWA + ';margin-bottom:8px;">'
                + '🌿 CATATAN KHUSUS SAWAH RAWA / LEBAK / DAS</div>'
                + '• Olah lahan hanya saat air benar-benar surut (tinggi muka air <10 cm di luar saluran)<br>'
                + '• Fase generatif & panen HARUS selesai sebelum puncak banjir berikutnya<br>'
                + '• Varietas wajib: <b>Inpari 30</b> (tahan rendaman 14 hari), <b>Inpari 33</b>, <b>Inpari IR Nutri Zinc</b><br>'
                + '• Kurangi Urea 20% — rawa sudah kaya N organik, kelebihan picu Blast<br>'
                + '• Saat banjir surut = momen gropyokan tikus terbaik (tikus migrasi ke tanggul)<br>'
                + '<div style="margin-top:8px;font-size:0.72rem;opacity:0.6;">'
                + 'Sumber: Balitbangtan (2018); IRRI Flood-Prone Lowland (2019); BB Padi (2022)</div>';

            kontainer.appendChild(panel);
        };
    }

    // ============================================================
    //  BAGIAN 10 — INIT
    // ============================================================

    function injectDropdowns() {
        injectDropdownRisiko();
        injectDropdownJTO();
    }

    function init() {
        // Inject dropdown
        injectDropdowns();

        // Patch fungsi global (hitungRisikoDinamis & rekomendasiWindowTanam)
        patchFungsiGlobal();

        // Patch prosesAnalisisKalender (Risiko Iklim)
        patchProsesKalender();

        // Patch prosesJadwalOtomatis (Kalender TNM) — tunggu JTO init dulu
        setTimeout(patchProsesJTO, 600);

        // Re-inject dropdown saat tab berganti
        var _switchAsli = window.switchMode;
        if (typeof _switchAsli === 'function') {
            window.switchMode = function(mode) {
                _switchAsli.apply(this, arguments);
                if (mode==='kalender' || mode==='jadwaltanam') {
                    setTimeout(injectDropdowns, 250);
                }
            };
        }

        window.__sawahRawaV1Aktif = true;

        console.log(
            '%c✅ patch_sawah_rawa_v1.1.js AKTIF\n'
            + '\n  ╔══ DIFERENSIASI SAWAH RAWA v1.1 ══════════════╗\n'
            + '  ║ [FIX-1] prosesJadwalOtomatis di-patch SETELAH\n'
            + '  ║          JTO init (setTimeout 600ms)\n'
            + '  ║ [FIX-2] bangunKegiatanRawa() — urutan & teks\n'
            + '  ║          khusus: gropyokan saat surut, pintu air,\n'
            + '  ║          bedeng apung, varietas tahan rendaman\n'
            + '  ║ [FIX-3] tglOlahTanah dari rekomendasiRawa()\n'
            + '  ║          diteruskan ke bangunKegiatanRawa()\n'
            + '  ║ [FIX-4] Label "SAWAH RAWA" di kotak info JTO\n'
            + '  ║ [FIX-5] Kotak info rawa di bawah hasil JTO\n'
            + '  ║ ✅ Risiko Iklim: hitungRisikoDinamis() rawa\n'
            + '  ║ ✅ Kalender TNM: rekomendasiRawa() + render rawa\n'
            + '  ╚═══════════════════════════════════════════════╝',
            'color:' + WARNA_RAWA + ';font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }

})();
