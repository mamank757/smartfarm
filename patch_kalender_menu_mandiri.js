/**
 * ============================================================
 *  PATCH: patch_kalender_menu_mandiri.js
 *  Versi: 1.0 — Jadwal Kegiatan Tani sebagai Menu Mandiri
 * ------------------------------------------------------------
 *  Memindahkan fitur "📅 JADWAL KEGIATAN TANI" dari tab
 *  "RISIKO IKLIM" menjadi tab tersendiri "JADWAL TANAM".
 *
 *  Yang dilakukan patch ini:
 *    1. Menambahkan tab baru "JADWAL TANAM" ke tab-container
 *    2. Menambahkan #boxJadwalTanam ke dalam .card
 *    3. Menghapus tombol jadwal yang disuntikkan ke boxKalender
 *       oleh patch_kalender_tanam_cerdas.js
 *    4. Mengubah logika injeksi agar mengarah ke box baru
 *    5. Mengintegrasikan switchMode() untuk mode baru
 *
 *  Cara pakai:
 *    Tambahkan SETELAH patch_kalender_tanam_cerdas.js:
 *    <script src="patch_kalender_menu_mandiri.js"></script>
 *
 *  Dependensi:
 *    - patch_kalender_tanam_cerdas.js (harus dimuat lebih dulu)
 *    - buatJadwalTanam() (dari patch di atas)
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONSTANTA WARNA TEMA
    // =========================================================================
    var WARNA_JADWAL = '#06b6d4'; // Cyan — beda dari kalender (#d946ef) & cuaca (#3b82f6)

    // =========================================================================
    //  LANGKAH 1: INJECT TAB BARU KE TAB-CONTAINER
    // =========================================================================
    function injeksiTabBaru() {
        var tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;

        // Jangan inject duplikat
        if (document.getElementById('tabJadwalTanam')) return;

        var btnTab = document.createElement('button');
        btnTab.className  = 'tab-btn';
        btnTab.id         = 'tabJadwalTanam';
        btnTab.textContent = 'JADWAL TANAM';
        btnTab.onclick    = function () { window.switchMode('jadwaltanam'); };

        // Sisipkan setelah tab RISIKO IKLIM agar urutan logis
        var tabKalender = document.getElementById('tabKalender');
        if (tabKalender && tabKalender.parentNode) {
            tabKalender.parentNode.insertBefore(btnTab, tabKalender.nextSibling);
        } else {
            tabContainer.appendChild(btnTab);
        }
    }

    // =========================================================================
    //  LANGKAH 2: INJECT BOX KONTEN JADWAL TANAM KE .CARD
    // =========================================================================
    function injeksiBoxJadwal() {
        if (document.getElementById('boxJadwalTanam')) return;

        var card = document.querySelector('.card');
        if (!card) return;

        var boxJadwal = document.createElement('div');
        boxJadwal.id            = 'boxJadwalTanam';
        boxJadwal.style.display = 'none';

        boxJadwal.innerHTML =
            // ── INFO BANNER ───────────────────────────────────────────
            '<div style="' +
                'background: rgba(6,182,212,0.07);' +
                'border: 1px solid rgba(6,182,212,0.25);' +
                'border-left: 4px solid ' + WARNA_JADWAL + ';' +
                'border-radius: 16px;' +
                'padding: 14px 16px;' +
                'margin-bottom: 18px;' +
            '">' +
                '<strong style="color:' + WARNA_JADWAL + '; display:block; margin-bottom:6px;">📅 Kalender Kegiatan Tani Berbasis Iklim</strong>' +
                '<span style="font-size:0.8rem; color:#cbd5e1; line-height:1.6;">' +
                    'Masukkan rencana tanam. Sistem menghitung jadwal optimal 12 kegiatan ' +
                    'berdasarkan ENSO/IOD, fase bulan, dan zona iklim lokal.' +
                '</span>' +
            '</div>' +

            // ── FORM INPUT ────────────────────────────────────────────
            '<div class="form-group">' +
                '<label>📅 TANGGAL RENCANA TANAM</label>' +
                '<input type="date" id="inputTglTanamJadwal" class="form-input">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>🌱 UMUR VARIETAS PADI</label>' +
                '<select id="umurVarietasJadwal" class="form-select">' +
                    '<option value="genjah">Genjah (< 95 Hari) — Cakrabuana, M70D, dll</option>' +
                    '<option value="sedang" selected>Sedang (95–115 Hari) — Ciherang, Mekongga, Inpari 32</option>' +
                    '<option value="dalam">Dalam (≥ 116 Hari) — Varietas Lokal / Khusus</option>' +
                '</select>' +
            '</div>' +

            // ── TOMBOL UTAMA ──────────────────────────────────────────
            '<button id="btnBuatJadwalTanam" class="btn-main" style="' +
                'background: linear-gradient(135deg, ' + WARNA_JADWAL + ', #0891b2);' +
                'color: #fff;' +
                'font-weight: 700;' +
                'letter-spacing: 0.5px;' +
            '">' +
                '📅 BUAT JADWAL KEGIATAN TANI' +
            '</button>' +

            // ── AREA HASIL ────────────────────────────────────────────
            '<div id="hasilJadwalTanam" style="margin-top: 16px; display: none;">' +
                '<div id="teksJadwalTanam"></div>' +
            '</div>';

        // Sisipkan setelah boxKalender agar urutan DOM konsisten
        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && boxKalender.parentNode) {
            boxKalender.parentNode.insertBefore(boxJadwal, boxKalender.nextSibling);
        } else {
            card.appendChild(boxJadwal);
        }

        // Pasang event listener tombol
        document.getElementById('btnBuatJadwalTanam').addEventListener('click', function () {
            eksekusiBuatJadwal();
        });
    }

    // =========================================================================
    //  LANGKAH 3: FUNGSI EKSEKUSI — JEMBATAN KE patch_kalender_tanam_cerdas.js
    // =========================================================================
    async function eksekusiBuatJadwal() {
        var tglInput = document.getElementById('inputTglTanamJadwal');
        var varInput = document.getElementById('umurVarietasJadwal');
        var hasilEl  = document.getElementById('hasilJadwalTanam');
        var teksEl   = document.getElementById('teksJadwalTanam');

        // Validasi
        if (!tglInput || !tglInput.value) {
            teksEl.innerHTML =
                '<div style="' +
                    'padding: 12px; margin-top: 8px;' +
                    'background: rgba(239,68,68,0.1);' +
                    'border: 1px solid rgba(239,68,68,0.3);' +
                    'border-radius: 12px;' +
                    'color: #fca5a5; font-size: 13px;' +
                '">⚠️ Silakan isi tanggal rencana tanam terlebih dahulu.</div>';
            hasilEl.style.display = 'block';
            return;
        }

        // Tampilkan loading
        hasilEl.style.display = 'block';
        teksEl.innerHTML =
            '<div style="text-align:center; padding: 28px 0; color: ' + WARNA_JADWAL + '; font-size: 14px;">' +
                '<i class="ti ti-loader" style="font-size:26px; display:block; margin-bottom:10px; animation: spin 1s linear infinite;"></i>' +
                'Mengambil data iklim & menghitung jadwal optimal...' +
            '</div>';

        // Ambil fungsi dari patch_kalender_tanam_cerdas.js
        // Patch itu membaca dari #inputTglTanam & #umurVarietasKalender
        // Kita sinkronkan nilainya terlebih dahulu agar fungsinya berjalan
        var inputTglKalender = document.getElementById('inputTglTanam');
        var inputVarKalender = document.getElementById('umurVarietasKalender');

        var nilaiTgl = tglInput.value;
        var nilaiVar = varInput ? varInput.value : 'sedang';

        if (inputTglKalender) inputTglKalender.value = nilaiTgl;
        if (inputVarKalender) inputVarKalender.value = nilaiVar;

        // Muat hitungJadwalKegiatan & pendukungnya dari scope patch lama
        // Strategi: panggil eksekusi internal patch melalui jembatan global
        try {
            if (typeof window._buatJadwalMandiri === 'function') {
                // Diekspos oleh versi patch yang sudah dimodifikasi
                var hasil = await window._buatJadwalMandiri(nilaiTgl, nilaiVar);
                teksEl.innerHTML = hasil;
            } else {
                // Fallback: gunakan fungsi hitungJadwalKegiatan dari closure patch
                // dengan memanggil buatJadwalTanam() dari patch lama
                // tapi redirect output ke teksEl bukan ke hasilProyeksiIklim
                await jalankanDenganRedirect(nilaiTgl, nilaiVar, teksEl, hasilEl);
            }
        } catch (err) {
            console.error('[JadwalMandiri]', err);
            teksEl.innerHTML =
                '<div style="' +
                    'padding: 12px;' +
                    'background: rgba(239,68,68,0.1);' +
                    'border: 1px solid rgba(239,68,68,0.3);' +
                    'border-radius: 12px;' +
                    'color: #fca5a5; font-size: 13px;' +
                '">❌ Gagal membuat jadwal: ' + (err.message || 'Error tidak diketahui') + '</div>';
        }
    }

    // =========================================================================
    //  LANGKAH 3B: JEMBATAN REDIRECT — Jalankan logika patch lama, output ke sini
    // =========================================================================
    async function jalankanDenganRedirect(nilaiTgl, nilaiVar, teksEl, hasilEl) {
        // Patch lama (patch_kalender_tanam_cerdas.js) menulis output ke:
        //   - #teksAnalisisFase  (konten kartu jadwal)
        //   - #hasilProyeksiIklim (container grafik iklim, kita sembunyikan)
        // 
        // Strategi redirect:
        //   1. Simpan referensi elemen asli
        //   2. Ganti sementara dengan proxy
        //   3. Jalankan fungsi patch
        //   4. Ambil output & pindahkan ke teksEl
        //   5. Restore elemen asli

        var elTeksAsli   = document.getElementById('teksAnalisisFase');
        var elHasilAsli  = document.getElementById('hasilProyeksiIklim');

        // Buat proxy container sementara
        var proxyTeks   = document.createElement('div');
        var proxyHasil  = document.createElement('div');
        proxyHasil.style.display = 'block'; // patch cek ini

        // Inject proxy ke DOM (perlu ada agar patch tidak error saat getElementById)
        proxyTeks.id  = 'teksAnalisisFase';
        proxyHasil.id = 'hasilProyeksiIklim';

        // Ganti ID asli sementara agar tidak bentrok
        if (elTeksAsli)  elTeksAsli.id  = '_teksAnalisisFase_bak';
        if (elHasilAsli) elHasilAsli.id = '_hasilProyeksiIklim_bak';

        // Sisipkan proxy ke body (tidak terlihat)
        proxyTeks.style.display  = 'none';
        proxyHasil.style.display = 'block';
        document.body.appendChild(proxyTeks);
        document.body.appendChild(proxyHasil);

        try {
            // Jalankan fungsi patch (dideklarasikan di IIFE-nya, kita expose via event)
            // Cara: dispatch event khusus yang ditangkap patch, atau panggil ulang logika
            // 
            // Karena buatJadwalTanam() tidak diekspos ke global oleh patch lama,
            // kita rebuild logika minimal di sini menggunakan fungsi-fungsi yang
            // MEMANG diekspos ke window oleh patch:
            //   - window.getENSOAnomaly()
            //   - window.getIODAnomaly()
            //   - window.normalisasiCurahHujan()
            //   - window.hitungJarakHaversine()
            //   - window.URL_ZOM_LOKAL
            //   - window._ktKirimWA()

            var html = await bangunHtmlJadwal(nilaiTgl, nilaiVar);
            teksEl.innerHTML = html;

        } finally {
            // Restore ID asli
            document.body.removeChild(proxyTeks);
            document.body.removeChild(proxyHasil);
            if (elTeksAsli)  elTeksAsli.id  = 'teksAnalisisFase';
            if (elHasilAsli) elHasilAsli.id = 'hasilProyeksiIklim';
        }
    }

    // =========================================================================
    //  LANGKAH 4: REBUILD LOGIKA JADWAL (MANDIRI)
    //  Mengimplementasikan ulang logika dari patch_kalender_tanam_cerdas.js
    //  secara standalone agar tidak bergantung pada DOM kalender iklim
    // =========================================================================

    // ── Utilitas Fase Bulan (duplikasi dari patch lama agar mandiri) ──────────
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_HARI_MND = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN_MND = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    function formatTglIDMnd(d) {
        return NAMA_HARI_MND[d.getDay()] + ', ' +
               d.getDate() + ' ' + NAMA_BULAN_MND[d.getMonth()] + ' ' + d.getFullYear();
    }
    function formatTglPendekMnd(d) {
        return d.getDate() + ' ' + NAMA_BULAN_MND[d.getMonth()].substring(0,3) + ' ' + d.getFullYear();
    }
    function tambahHariMnd(d, n) {
        var h = new Date(d); h.setDate(h.getDate() + n); return h;
    }
    function hariFaseBulanMnd(tanggal) {
        var s = (tanggal.getTime() - EPOCH_BULAN_MATI.getTime()) / 86400000;
        return ((s % SIKLUS_SINODIS) + SIKLUS_SINODIS) % SIKLUS_SINODIS;
    }
    function namaFaseBulanMnd(h) {
        if (h < 1.5)  return { nama: 'Bulan Mati',        ikon: '🌑' };
        if (h < 7.4)  return { nama: 'Bulan Sabit Muda',  ikon: '🌒' };
        if (h < 8.4)  return { nama: 'Kuartal Pertama',   ikon: '🌓' };
        if (h < 14.8) return { nama: 'Bulan Cembung',     ikon: '🌔' };
        if (h < 15.8) return { nama: 'Bulan Penuh',       ikon: '🌕' };
        if (h < 22.1) return { nama: 'Bulan Cembung',     ikon: '🌖' };
        if (h < 23.1) return { nama: 'Kuartal Ketiga',    ikon: '🌗' };
        if (h < 29.0) return { nama: 'Bulan Sabit Tua',   ikon: '🌘' };
        return                { nama: 'Bulan Mati',        ikon: '🌑' };
    }
    function cariFaseBulanMnd(acuan, min, max, offsetMulai) {
        var mulai = tambahHariMnd(acuan, offsetMulai || 0);
        for (var i = 0; i <= 45; i++) {
            var t = tambahHariMnd(mulai, i);
            var f = hariFaseBulanMnd(t);
            if (f >= min && f <= max) return t;
        }
        return mulai;
    }

    // ── Ambil Baseline ZOM ───────────────────────────────────────────────────
    async function getBaselineMnd(lat, lon) {
        var URL_ZOM = window.URL_ZOM_LOKAL || '';
        try {
            if (!URL_ZOM) throw new Error('URL_ZOM_LOKAL tidak tersedia');
            var res  = await fetch(URL_ZOM);
            var data = await res.json();
            var arr  = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : null);
            if (!arr) throw new Error('Format ZOM tidak dikenal');

            var haversine = window.hitungJarakHaversine || function(){ return 999; };
            var jMin = Infinity, kab = null;
            arr.forEach(function(k) {
                var lk = parseFloat(k.lat), lnk = parseFloat(k.lon);
                if (!isNaN(lk) && !isNaN(lnk)) {
                    var j = haversine(lat, lon, lk, lnk);
                    if (j < jMin) { jMin = j; kab = k; }
                }
            });
            if (kab && jMin <= 150) {
                var keys = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
                return {
                    data: keys.map(function(k){ return parseFloat(kab[k]) || 0; }),
                    nama: kab.kabupaten_kota || 'Lokal',
                    jarak: jMin.toFixed(1)
                };
            }
        } catch(e) { console.warn('[JadwalMandiri] ZOM:', e.message); }

        return {
            data: [0.9,0.8,0.6,0.3,-0.1,-0.8,-1.2,-1.3,-0.9,-0.3,0.4,0.8],
            nama: 'Pola Monsunal Sulsel (estimasi)',
            jarak: null
        };
    }

    // ── Hitung Skor Kelembapan Bulanan ───────────────────────────────────────
    function skorKelembapanMnd(bulanIdx, baselineData, ensoVal, iodVal) {
        var normalisasi = window.normalisasiCurahHujan || function(v) {
            if (v < 30)  return -1.5;
            if (v < 75)  return -0.8;
            if (v < 150) return 0.0;
            if (v < 250) return 0.8;
            return 1.5;
        };
        var baseline = baselineData[bulanIdx];
        var indeks   = baseline > 10 ? normalisasi(baseline, bulanIdx) : baseline;
        var bobot    = [
            [0.15,0.10],[0.15,0.10],[0.12,0.08],[0.10,0.08],[0.18,0.12],[0.35,0.20],
            [0.45,0.28],[0.50,0.38],[0.45,0.40],[0.35,0.30],[0.20,0.15],[0.15,0.10]
        ];
        var wE = bobot[bulanIdx][0], wI = bobot[bulanIdx][1], tot = 1 + wE + wI;
        var score = (indeks / tot) - (ensoVal * wE / tot) - (iodVal * wI / tot);
        return Math.max(0, Math.min(100, Math.round(50 + score * 25)));
    }

    // ── Hitung Risiko Per Kegiatan ────────────────────────────────────────────
    function risikoOlahLahan(skor) {
        if (skor < 25) return { level:'Kering', catatan:'Tambahkan irigasi awal sebelum bajak', warna:'#ef4444' };
        if (skor > 80) return { level:'Sangat Basah', catatan:'Tunggu hingga lahan bisa diluku mesin', warna:'#3b82f6' };
        return               { level:'Baik', catatan:'Kondisi optimal untuk bajak dan garu', warna:'#10b981' };
    }
    function risikoBenih(skor) {
        if (skor > 75) return { level:'Waspada', catatan:'Buat drainase bedeng persemaian, cegah rebah semai', warna:'#f59e0b' };
        if (skor < 25) return { level:'Siram Rutin', catatan:'Siram pagi & sore, jaga kelembapan media semai', warna:'#f59e0b' };
        return               { level:'Optimal', catatan:'Cuaca mendukung perkecambahan benih', warna:'#10b981' };
    }
    function risikoTanam(skor) {
        if (skor > 80) return { level:'Genangan', catatan:'Siapkan pompa, jaga kedalaman air 2-3 cm saja', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Kritis', catatan:'Tunda atau siapkan pompanisasi penuh', warna:'#ef4444' };
        return               { level:'Baik', catatan:'Kondisi air mendukung penanaman', warna:'#10b981' };
    }
    function risikoTikus(faseBulan) {
        if (faseBulan < 4 || faseBulan > 25)
            return { level:'Optimal', catatan:'Malam gelap — tikus aktif, umpan beracun maksimal efektif', warna:'#10b981' };
        return { level:'Kurang Optimal', catatan:'Bulan bercahaya — aktivitas tikus agak berkurang, tetap pasang TBS', warna:'#f59e0b' };
    }
    function risikoPupuk(skor) {
        if (skor > 75) return { level:'Risiko Tercuci', catatan:'Hindari hari hujan, pupuk 1-2 hari sebelum hujan ringan ideal', warna:'#f59e0b' };
        if (skor < 20) return { level:'Tanah Kering', catatan:'Pastikan ada air di petakan sebelum tabur pupuk', warna:'#ef4444' };
        return               { level:'Optimal', catatan:'Cuaca mendukung serapan pupuk oleh tanaman', warna:'#10b981' };
    }
    function risikoInsektisida(skor, faseBulan) {
        var catatan = '', warna = '#10b981', level = 'Baik';
        if (skor > 75) { catatan += 'Hindari semprot saat hujan. '; warna = '#f59e0b'; level = 'Hati-hati'; }
        if (faseBulan >= 13 && faseBulan <= 17) {
            catatan += 'Puncak penerbangan ngengat PBP — larutan semprot + lampu perangkap. ';
            warna = '#ef4444'; level = 'Waspada';
        } else if (faseBulan >= 12 && faseBulan <= 18) {
            catatan += 'Mendekati bulan penuh — pantau kelompok telur PBP. ';
            if (warna !== '#ef4444') { warna = '#f59e0b'; level = 'Siaga'; }
        } else {
            catatan += 'Waktu aplikasi aman dari puncak ngengat. ';
        }
        return { level: level, catatan: catatan.trim(), warna: warna };
    }
    function risikoFungisida(skor) {
        if (skor > 65) return { level:'Kritis Blast', catatan:'Cuaca lembap — semprot Tricyclazole 7 hari sebelum bunting', warna:'#ef4444' };
        if (skor > 45) return { level:'Waspada', catatan:'Pantau gejala bercak belah ketupat, semprot preventif', warna:'#f59e0b' };
        return               { level:'Aman', catatan:'Risiko blast rendah, cukup monitoring rutin', warna:'#10b981' };
    }
    function risikoPanen(skor) {
        if (skor > 75) return { level:'Sulit Kering', catatan:'Siapkan dryer/pengering — jangan tumpuk gabah lembap', warna:'#ef4444' };
        if (skor > 55) return { level:'Waspada Hujan', catatan:'Panen pagi hari, hindari sore hujan; pastikan combine tidak amblas', warna:'#f59e0b' };
        if (skor < 20) return { level:'Kering Ideal', catatan:'Panen dan jemur optimal, pantau kadar air gabah sebelum jual', warna:'#10b981' };
        return               { level:'Baik', catatan:'Kondisi panen mendukung, koordinasikan combine harvester', warna:'#10b981' };
    }

    // ── Render Kartu Kegiatan ─────────────────────────────────────────────────
    function renderKartu(k, nomor) {
        var warna       = k.risiko.warna;
        var fb          = namaFaseBulanMnd(hariFaseBulanMnd(k.tglMulai));
        var tglMulaiStr = formatTglIDMnd(k.tglMulai);
        var tglSelStr   = formatTglPendekMnd(k.tglSelesai);
        var tipsHTML    = k.tips.map(function(t) {
            return '<li style="margin-bottom:6px;color:var(--color-text-secondary,#cbd5e1);line-height:1.5;">' + t + '</li>';
        }).join('');

        return '<div style="' +
            'background:var(--color-background-primary,#1b273a);' +
            'border:0.5px solid var(--color-border-tertiary,rgba(255,255,255,0.08));' +
            'border-radius:16px;margin-bottom:10px;overflow:hidden;' +
        '">' +
            '<div style="' +
                'padding:12px 14px;display:flex;align-items:flex-start;gap:12px;' +
                'cursor:pointer;border-left:3px solid ' + warna + ';' +
            '" onclick="window._ktToggleMnd(this)">' +
                '<div style="' +
                    'width:36px;height:36px;border-radius:50%;' +
                    'background:var(--color-background-secondary,#111c2e);' +
                    'display:flex;align-items:center;justify-content:center;' +
                    'font-size:18px;flex-shrink:0;' +
                '">' + k.ikon + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
                        '<div>' +
                            '<div style="font-size:11px;color:var(--color-text-tertiary,#64748b);font-weight:500;margin-bottom:2px;">Kegiatan ' + nomor + '</div>' +
                            '<div style="font-size:15px;font-weight:600;color:var(--color-text-primary,#fff);">' + k.nama + '</div>' +
                        '</div>' +
                        '<span style="' +
                            'font-size:11px;font-weight:600;padding:3px 8px;' +
                            'border-radius:8px;background:' + warna + '22;' +
                            'color:' + warna + ';white-space:nowrap;flex-shrink:0;' +
                        '">' + k.risiko.level + '</span>' +
                    '</div>' +
                    '<div style="font-size:13px;color:#94a3b8;margin-top:4px;">' +
                        '<span style="font-weight:600;color:#fff;">' + tglMulaiStr + '</span>' +
                        ' s/d ' + tglSelStr +
                    '</div>' +
                    '<div style="font-size:12px;color:#64748b;margin-top:3px;">' +
                        fb.ikon + ' ' + fb.nama + ' &nbsp;•&nbsp; ' + k.deskripsi +
                    '</div>' +
                '</div>' +
                '<span style="font-size:14px;color:#64748b;flex-shrink:0;margin-top:8px;transition:transform 0.2s;" class="kt-chevron-mnd">▼</span>' +
            '</div>' +
            '<div class="kt-detail-mnd" style="display:none;padding:0 14px 14px 14px;border-top:0.5px solid rgba(255,255,255,0.06);">' +
                '<div style="' +
                    'background:var(--color-background-secondary,#111c2e);' +
                    'border-radius:12px;padding:10px 12px;' +
                    'margin-top:12px;margin-bottom:12px;' +
                    'border-left:3px solid ' + warna + ';' +
                '">' +
                    '<div style="font-size:12px;font-weight:600;color:' + warna + ';margin-bottom:3px;">Catatan Kondisi Iklim</div>' +
                    '<div style="font-size:13px;color:#cbd5e1;">' + k.risiko.catatan + '</div>' +
                '</div>' +
                '<div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Tips Lapangan</div>' +
                '<ul style="margin:0;padding-left:16px;font-size:13px;">' + tipsHTML + '</ul>' +
            '</div>' +
        '</div>';
    }

    // ── Toggle Detail ─────────────────────────────────────────────────────────
    window._ktToggleMnd = function(headerEl) {
        var detailEl  = headerEl.parentElement.querySelector('.kt-detail-mnd');
        var chevronEl = headerEl.querySelector('.kt-chevron-mnd');
        if (!detailEl) return;
        var visible = detailEl.style.display !== 'none';
        detailEl.style.display   = visible ? 'none' : 'block';
        if (chevronEl) chevronEl.style.transform = visible ? '' : 'rotate(180deg)';
    };

    // ── Builder HTML Jadwal Lengkap ───────────────────────────────────────────
    async function bangunHtmlJadwal(nilaiTgl, nilaiVar) {
        var lat = -4.0, lon = 120.0;

        // Ambil koordinat dari cache app
        try {
            if (window._lokasiKalender) {
                lat = window._lokasiKalender.lat; lon = window._lokasiKalender.lon;
            } else if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                var pos = await new Promise(function(res, rej) {
                    navigator.geolocation.getCurrentPosition(res, rej, {
                        enableHighAccuracy: false, timeout: 5000, maximumAge: 300000
                    });
                });
                lat = pos.coords.latitude; lon = pos.coords.longitude;
                window._lokasiKalender = { lat: lat, lon: lon };
            }
        } catch(gpsErr) {
            console.warn('[JadwalMandiri] GPS fallback ke default Wajo');
        }

        // Fetch paralel
        var getENSO = typeof window.getENSOAnomaly === 'function'
            ? window.getENSOAnomaly()
            : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });
        var getIOD = typeof window.getIODAnomaly === 'function'
            ? window.getIODAnomaly()
            : Promise.resolve({ latestAnomaly: 0, status: 'Netral' });

        var results = await Promise.all([getENSO, getIOD, getBaselineMnd(lat, lon)]);
        var ensoData = results[0], iodData = results[1], zonaInfo = results[2];
        var ensoVal  = ensoData.latestAnomaly || 0;
        var iodVal   = iodData.latestAnomaly  || 0;

        // Skor kelembapan tiap bulan
        var skorBulan = zonaInfo.data.map(function(_, idx) {
            return skorKelembapanMnd(idx, zonaInfo.data, ensoVal, iodVal);
        });

        // Bangun jadwal
        var tglTanam = new Date(nilaiTgl);
        var offset = {
            genjah: { benih:14, pupuk1:7,  pupuk2:28, pupuk3:45, insektAwal:20, insektLanjut:45, fungisida:55, panen:90  },
            sedang: { benih:21, pupuk1:7,  pupuk2:30, pupuk3:55, insektAwal:25, insektLanjut:55, fungisida:65, panen:110 },
            dalam:  { benih:28, pupuk1:7,  pupuk2:35, pupuk3:65, insektAwal:30, insektLanjut:65, fungisida:75, panen:125 }
        };
        var of = offset[nilaiVar] || offset.sedang;

        var tglOlah   = tambahHariMnd(tglTanam, -14);
        var tglBenih  = tambahHariMnd(tglTanam, -of.benih);
        var tglTBS    = tambahHariMnd(tglTanam, -14);
        var tglTikusA = cariFaseBulanMnd(tglTanam, 26, 29.5, -10);
        var tglTikusB = cariFaseBulanMnd(tglBenih, 0,  3,    0);
        var tglP1     = tambahHariMnd(tglTanam, of.pupuk1);
        var tglP2     = tambahHariMnd(tglTanam, of.pupuk2);
        var tglP3     = tambahHariMnd(tglTanam, of.pupuk3);
        var tglIA     = tambahHariMnd(tglTanam, of.insektAwal);
        var tglIL     = tambahHariMnd(tglTanam, of.insektLanjut);
        var tglFung   = tambahHariMnd(tglTanam, of.fungisida);
        var tglPanen  = tambahHariMnd(tglTanam, of.panen);

        // Koreksi insektisida jika jatuh saat bulan penuh
        [tglIA, tglIL].forEach(function(tgl, i) {
            var f = hariFaseBulanMnd(tgl);
            if (f >= 13.5 && f <= 16.5) {
                if (i === 0) tglIA = tambahHariMnd(tgl, 5);
                else         tglIL = tambahHariMnd(tgl, 5);
            }
        });

        function skBln(tgl) { return skorBulan[tgl.getMonth()]; }

        var kegiatan = [
            {
                id:'olah', nama:'Pengolahan Lahan', ikon:'🚜',
                deskripsi:'Bajak, garu, pemerataan petakan',
                tglMulai: tglOlah, tglSelesai: tambahHariMnd(tglOlah, 7),
                risiko: risikoOlahLahan(skBln(tglOlah)),
                tips:[
                    'Olah lahan 14 hari sebelum tanam agar gulma terbenam sempurna',
                    'Jika pH < 5.5, tambahkan kapur dolomit 500-1000 kg/ha',
                    'Cek saluran irigasi dan perbaiki pematang yang bocor'
                ]
            },
            {
                id:'benih', nama:'Pembibitan Benih', ikon:'🌱',
                deskripsi:'Seleksi benih, perendaman, perkecambahan, semai',
                tglMulai: tglBenih, tglSelesai: tambahHariMnd(tglBenih, 7),
                risiko: risikoBenih(skBln(tglBenih)),
                tips:[
                    'Rendam benih 24 jam, buang yang mengapung',
                    'Inkubasi lembap 48 jam hingga keluar kecambah 2-3 mm',
                    'Dosis semai: 25-35 kg/ha untuk tapin, 50-100 kg/ha untuk tabela'
                ]
            },
            {
                id:'tbs', nama:'Pasang TBS & Gropyokan', ikon:'🐀',
                deskripsi:'Pasang Trap Barrier System & gropyokan massal',
                tglMulai: tglTBS, tglSelesai: tambahHariMnd(tglTBS, 3),
                risiko: risikoTikus(hariFaseBulanMnd(tglTikusA)),
                tips:[
                    'Pasang TBS di sudut petakan dengan plastik setinggi 60 cm',
                    'Gropyokan bersama minimal 3 petani (efek pengusir massal)',
                    'Bersihkan semak dan jerami sisa panen di sekitar pematang'
                ]
            },
            {
                id:'tanam', nama:'Tanam Pindah / Tabela', ikon:'🌾',
                deskripsi:'Penanaman bibit ke lahan utama',
                tglMulai: tglTanam, tglSelesai: tambahHariMnd(tglTanam, 3),
                risiko: risikoTanam(skBln(tglTanam)),
                tips:[
                    'Umur bibit optimal: 14-21 HSS untuk tapin',
                    'Jarak tanam Legowo 2:1: (25×12.5)×50 cm',
                    'Tanam 2-3 bibit per lubang, kedalaman 2-3 cm'
                ]
            },
            {
                id:'umpan', nama:'Pemberian Umpan Racun Tikus', ikon:'☠️',
                deskripsi:'Aplikasi rodentisida antikoagulan di liang aktif',
                tglMulai: tglTikusA, tglSelesai: tambahHariMnd(tglTikusA, 5),
                risiko: risikoTikus(hariFaseBulanMnd(tglTikusA)),
                tips:[
                    'Gunakan rodentisida antikoagulan (Brodifacoum, Bromadiolon)',
                    'Tempatkan umpan dalam kotak umpan tertutup di mulut liang',
                    'Pasang malam hari, periksa & ganti setiap 3-4 hari',
                    'JANGAN gunakan di sekitar saluran air atau kolam ikan'
                ]
            },
            {
                id:'p1', nama:'Pemupukan Tahap I (Dasar)', ikon:'🧪',
                deskripsi:'Pupuk NPK Phonska + Urea I — fase awal anakan',
                tglMulai: tglP1, tglSelesai: tambahHariMnd(tglP1, 2),
                risiko: risikoPupuk(skBln(tglP1)),
                tips:[
                    'Dosis: Urea 1/3 total + Phonska/NPK 1/2 total dosis per ha',
                    'Sebar rata saat air macak-macak (lumpuri tipis)',
                    'Jangan pupuk saat angin kencang atau menjelang hujan lebat'
                ]
            },
            {
                id:'i1', nama:'Penyemprotan Insektisida I', ikon:'💊',
                deskripsi:'Pengendalian hama fase vegetatif (WBC, Penggerek, Sundep)',
                tglMulai: tglIA, tglSelesai: tambahHariMnd(tglIA, 2),
                risiko: risikoInsektisida(skBln(tglIA), hariFaseBulanMnd(tglIA)),
                tips:[
                    'Pantau populasi WBC: semprot hanya jika > 10 ekor/rumpun',
                    'Gunakan insektisida sistemik: Imidakloprid, BPMC, atau Buprofezin',
                    'Semprot pagi hari (07.00-10.00) saat udara tidak berangin',
                    'Arahkan nozzle ke pangkal batang untuk WBC'
                ]
            },
            {
                id:'p2', nama:'Pemupukan Tahap II (Susulan I)', ikon:'🧪',
                deskripsi:'Urea II + Phonska II — mendorong anakan produktif',
                tglMulai: tglP2, tglSelesai: tambahHariMnd(tglP2, 2),
                risiko: risikoPupuk(skBln(tglP2)),
                tips:[
                    'Dosis: Urea 2/3 sisa + Phonska 1/4 total dosis per ha',
                    'Cek warna daun dengan BWD — jika skala 3+ tahan Urea',
                    'Ini adalah pemupukan terpenting untuk jumlah anakan'
                ]
            },
            {
                id:'p3', nama:'Pemupukan Tahap III (Susulan II)', ikon:'🧪',
                deskripsi:'Phonska III ± Urea III — menjelang fase bunting',
                tglMulai: tglP3, tglSelesai: tambahHariMnd(tglP3, 2),
                risiko: risikoPupuk(skBln(tglP3)),
                tips:[
                    'Dosis: Phonska 1/4 sisa ± Urea sesuai BWD (skala 1-2 saja)',
                    'Jika BWD skala 4-5, SKIP Urea di tahap ini',
                    'Tambahkan pupuk mikro (Silikat/ZnSO4) jika tersedia'
                ]
            },
            {
                id:'i2', nama:'Penyemprotan Insektisida II', ikon:'💊',
                deskripsi:'Pengendalian hama fase generatif (Walang Sangit, Beluk)',
                tglMulai: tglIL, tglSelesai: tambahHariMnd(tglIL, 2),
                risiko: risikoInsektisida(skBln(tglIL), hariFaseBulanMnd(tglIL)),
                tips:[
                    'Target utama: Walang Sangit saat malai keluar',
                    'Semprot pagi hari saat walang sangit masih di tanaman',
                    'Gunakan insektisida kontak: Malathion, Deltametrin',
                    'Tambahkan fungisida jika ada gejala Hawar Pelepah'
                ]
            },
            {
                id:'fung', nama:'Penyemprotan Fungisida (Blast)', ikon:'🍄',
                deskripsi:'Preventif Blast Leher Malai saat fase bunting kritis',
                tglMulai: tglFung, tglSelesai: tambahHariMnd(tglFung, 2),
                risiko: risikoFungisida(skBln(tglFung)),
                tips:[
                    'Semprot 5-7 hari SEBELUM atau SAAT keluar malai',
                    'Bahan aktif: Tricyclazole (0.5 l/ha) atau Isoprothiolane (1-1.5 l/ha)',
                    'Ulangi 14 hari kemudian jika cuaca masih lembap'
                ]
            },
            {
                id:'panen', nama:'Panen', ikon:'🌟',
                deskripsi:'Pemotongan padi saat kadar air gabah 20-25%',
                tglMulai: tglPanen, tglSelesai: tambahHariMnd(tglPanen, 5),
                risiko: risikoPanen(skBln(tglPanen)),
                tips:[
                    'Panen saat 90-95% gabah berwarna kuning keemasan',
                    'Kadar air ideal saat potong: 20-25%, segera keringkan ke 14%',
                    'Pesan combine harvester 14 hari sebelum taksiran panen',
                    'Jual ke penggilingan dengan timbangan bersertifikat'
                ]
            }
        ];

        // Simpan untuk WhatsApp
        window._ktDataJadwalMnd = { tglTanam: tglTanam, varietas: nilaiVar, kegiatan: kegiatan };

        // Label varietas
        var lblVar = { genjah:'Genjah (< 95 HST)', sedang:'Sedang (95-115 HST)', dalam:'Dalam (≥ 116 HST)' }[nilaiVar] || nilaiVar;

        // Render output
        var kartuHTML = kegiatan.map(function(k, i) { return renderKartu(k, i + 1); }).join('');

        return (
            '<div style="padding: 4px 0;">' +

            // ── Ringkasan ──────────────────────────────────────────────────
            '<div style="' +
                'background: rgba(6,182,212,0.08);' +
                'border: 1px solid rgba(6,182,212,0.2);' +
                'border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;' +
            '">' +
                '<div style="font-size:11px;color:' + WARNA_JADWAL + ';font-weight:700;' +
                    'letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Ringkasan Analisis</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">' +
                    '<div><span style="color:#64748b;">Rencana tanam</span><br>' +
                        '<span style="font-weight:600;color:#fff;">' + formatTglIDMnd(tglTanam) + '</span></div>' +
                    '<div><span style="color:#64748b;">Varietas</span><br>' +
                        '<span style="font-weight:600;color:#fff;">' + lblVar + '</span></div>' +
                    '<div><span style="color:#64748b;">Zona iklim</span><br>' +
                        '<span style="font-weight:600;color:#fff;">' + (zonaInfo.nama || 'Sulsel') + '</span></div>' +
                    '<div><span style="color:#64748b;">ENSO / IOD</span><br>' +
                        '<span style="font-weight:600;color:#fff;">' + (ensoData.status || 'Netral') + ' / ' + (iodData.status || 'Netral') + '</span></div>' +
                '</div>' +
            '</div>' +

            // ── Keterangan ─────────────────────────────────────────────────
            '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">' +
                '12 kegiatan direkomendasikan — ketuk kartu untuk detail & tips lapangan' +
            '</div>' +

            kartuHTML +

            // ── Disclaimer ─────────────────────────────────────────────────
            '<div style="' +
                'margin-top:14px;background:rgba(100,116,139,0.1);' +
                'border-radius:12px;padding:10px 12px;' +
                'font-size:11px;color:#64748b;line-height:1.6;' +
                'border:1px solid rgba(255,255,255,0.04);' +
            '">' +
                '⚠️ Tanggal bersifat rekomendasi. Sesuaikan dengan kondisi lapangan, ' +
                'ketersediaan air irigasi, dan hasil pengamatan PHT mingguan. ' +
                'Sumber: NOAA ENSO/IOD, ZOM BMKG lokal, siklus sinodis bulan, BB Padi (2019).' +
            '</div>' +

            // ── Tombol WhatsApp ────────────────────────────────────────────
            '<button onclick="window._ktKirimWAMnd()" style="' +
                'width:100%;margin-top:12px;padding:13px;' +
                'background:#25D366;color:#fff;border:none;' +
                'border-radius:14px;font-size:14px;font-weight:600;cursor:pointer;' +
            '">📲 Kirim Jadwal ke WhatsApp ↗</button>' +

            '</div>'
        );
    }

    // ── WhatsApp Export ───────────────────────────────────────────────────────
    window._ktKirimWAMnd = function() {
        var jadwal = window._ktDataJadwalMnd;
        if (!jadwal) return;
        var baris = ['*KALENDER KEGIATAN TANI — PPL MILENIAL WAJO*\n'];
        jadwal.kegiatan.forEach(function(k, i) {
            baris.push((i+1) + '. *' + k.ikon + ' ' + k.nama.toUpperCase() + '*');
            baris.push('   Mulai  : ' + formatTglIDMnd(k.tglMulai));
            baris.push('   Selesai: ' + formatTglPendekMnd(k.tglSelesai));
            baris.push('   Status : ' + k.risiko.level);
            baris.push('   Catatan: ' + k.risiko.catatan);
            baris.push('');
        });
        baris.push('_Dibuat oleh Smart Farming PPL Milenial Wajo_');
        baris.push('_Sumber: NOAA ENSO/IOD + ZOM BMKG + Siklus Bulan_');
        window.open('https://wa.me/?text=' + encodeURIComponent(baris.join('\n')), '_blank');
    };

    // =========================================================================
    //  LANGKAH 5: INTEGRASI switchMode()
    // =========================================================================
    function patchSwitchMode() {
        var _switchModeAsli = window.switchMode;

        window.switchMode = function(mode) {
            // Sembunyikan box jadwal mandiri
            var boxJadwal = document.getElementById('boxJadwalTanam');

            if (mode === 'jadwaltanam') {
                // ── Sembunyikan semua box lain ─────────────────────────
                var semuaBox = document.querySelectorAll('.card > div[id^="box"]');
                semuaBox.forEach(function(b) { b.style.display = 'none'; });

                // ── Sembunyikan elemen kamera & scan ──────────────────
                var btnCam   = document.getElementById('btnCamera');
                var scanWin  = document.getElementById('scanWindow');
                var btnAnal  = document.getElementById('btnAnalisis');
                var result   = document.getElementById('result');
                if (btnCam)  btnCam.style.display  = 'none';
                if (scanWin) scanWin.style.display  = 'none';
                if (btnAnal) btnAnal.style.display  = 'none';
                if (result)  result.style.display   = 'none';

                // ── Tampilkan box jadwal ───────────────────────────────
                if (boxJadwal) boxJadwal.style.display = 'block';

                // ── Update judul ───────────────────────────────────────
                var modeTitle = document.getElementById('modeTitle');
                if (modeTitle) {
                    modeTitle.innerText = '📅 Jadwal Kegiatan Tani';
                    modeTitle.style.color = WARNA_JADWAL;
                }

                // ── Sembunyikan subtitle ───────────────────────────────
                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) subEl.style.display = 'none';

                // ── Update kelas aktif tab ─────────────────────────────
                document.querySelectorAll('.tab-btn').forEach(function(btn) {
                    btn.classList.remove('active');
                });
                var tabJadwal = document.getElementById('tabJadwalTanam');
                if (tabJadwal) tabJadwal.classList.add('active');

                return; // Jangan teruskan ke switchMode asli
            }

            // Sembunyikan box jadwal saat mode lain aktif
            if (boxJadwal) boxJadwal.style.display = 'none';

            // Jalankan switchMode asli
            if (typeof _switchModeAsli === 'function') {
                _switchModeAsli.apply(this, arguments);
            }
        };
    }

    // =========================================================================
    //  LANGKAH 6: HAPUS TOMBOL LAMA DARI boxKalender (injeksi patch sebelumnya)
    // =========================================================================
    function hapusTombolLama() {
        // patch_kalender_tanam_cerdas.js menyuntikkan #btnJadwalTanam ke boxKalender
        // Kita hapus agar tidak muncul duplikat
        var btnLama = document.getElementById('btnJadwalTanam');
        if (btnLama) {
            var wrapper = btnLama.closest('div[style*="margin-top"]') || btnLama;
            if (wrapper && wrapper !== btnLama && wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            } else if (btnLama.parentNode) {
                btnLama.parentNode.removeChild(btnLama);
            }
        }

        // Override switchMode dari patch_kalender_tanam_cerdas.js
        // agar tidak mencoba inject ulang ke boxKalender
        var _switchKT = window.switchMode;
        if (typeof _switchKT === 'function') {
            var _wrapped = _switchKT;
            window.switchMode = function(mode) {
                // Cegah re-injeksi tombol lama ke boxKalender
                if (mode === 'kalender') {
                    // Panggil asli tapi blokir injeksi setelahnya
                    _wrapped.apply(this, arguments);
                    setTimeout(function() {
                        var b = document.getElementById('btnJadwalTanam');
                        if (b) {
                            var w = b.closest('div[style*="margin-top"]') || b;
                            if (w && w !== b && w.parentNode) w.parentNode.removeChild(w);
                            else if (b.parentNode) b.parentNode.removeChild(b);
                        }
                    }, 200);
                    return;
                }
                _wrapped.apply(this, arguments);
            };
        }
    }

    // =========================================================================
    //  LANGKAH 7: CSS TAMBAHAN
    // =========================================================================
    function injeksiCSS() {
        if (document.getElementById('jadwalMandiriCSS')) return;
        var style = document.createElement('style');
        style.id = 'jadwalMandiriCSS';
        style.textContent =
            '#tabJadwalTanam.active { background: ' + WARNA_JADWAL + ' !important; color: #fff !important; }' +
            '#tabJadwalTanam:not(.active) { color: #708099; }' +
            '#btnBuatJadwalTanam:hover { opacity: 0.9; }' +
            '#btnBuatJadwalTanam:active { transform: scale(0.99); }' +
            /* Light mode overrides untuk box jadwal */
            'body.light-mode #boxJadwalTanam { background: #fff; color: #0f172a; }' +
            'body.light-mode #boxJadwalTanam .kt-detail-mnd { background: #f8fafc; }' +
            'body.light-mode #hasilJadwalTanam { color: #0f172a; }';
        document.head.appendChild(style);
    }

    // =========================================================================
    //  INISIALISASI
    // =========================================================================
    function init() {
        injeksiCSS();
        injeksiTabBaru();
        injeksiBoxJadwal();
        patchSwitchMode();

        // Hapus tombol lama setelah DOM stabil
        setTimeout(hapusTombolLama, 300);
        setTimeout(hapusTombolLama, 800); // Jalankan 2x karena patch lama async

        console.log(
            '%c✅ patch_kalender_menu_mandiri.js aktif — Jadwal Tanam sebagai Tab Mandiri',
            'color: ' + WARNA_JADWAL + '; font-weight: bold;'
        );
    }

    // Tunggu DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
