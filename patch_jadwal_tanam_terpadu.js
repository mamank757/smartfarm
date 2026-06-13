/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_otomatis.js
 * Versi: 8.0 — SPATIAL CLIMATE & PEST MATRIX LOGIC
 * ============================================================
 */
(function () {
    'use strict';

    var WARNA_TEMA = '#0ea5e9'; 
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_BULAN = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    // =========================================================================
    //  0. INJEKSI CSS KARANTINA
    // =========================================================================
    function pasangCSSKarantina() {
        if (!document.getElementById('cssKarantinaJadwal')) {
            var style = document.createElement('style');
            style.id = 'cssKarantinaJadwal';
            style.innerHTML = `
                body.mode-jadwal .card > * { display: none !important; }
                body.mode-jadwal .card > #modeTitle,
                body.mode-jadwal .card > #boxJadwalOtomatis { display: block !important; }
                body.mode-jadwal video, body.mode-jadwal canvas, body.mode-jadwal #btnCamera, body.mode-jadwal #scanWindow { 
                    display: none !important; opacity: 0 !important; pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // =========================================================================
    //  1. INISIALISASI TAMPILAN
    // =========================================================================
    function inisialisasiUI() {
        pasangCSSKarantina();

        var tabContainer = document.querySelector('.tab-container');
        if (tabContainer && !document.getElementById('tabJadwalOtomatis')) {
            var btnTab = document.createElement('button');
            btnTab.className = 'tab-btn';
            btnTab.id = 'tabJadwalOtomatis';
            btnTab.textContent = '📅 JADWAL TANAM';
            btnTab.onclick = function () { window.switchMode('jadwalotomatis'); };
            tabContainer.appendChild(btnTab);
        }

        var card = document.querySelector('.card');
        if (card && !document.getElementById('boxJadwalOtomatis')) {
            var box = document.createElement('div');
            box.id = 'boxJadwalOtomatis';
            box.style.display = 'none';
            box.innerHTML = `
                <div class="info-box" style="border-left: 4px solid ${WARNA_TEMA}; background: rgba(14,165,233,0.06); padding: 14px; margin-bottom: 16px; border-radius: 8px;">
                    <strong style="color: ${WARNA_TEMA}; display: block; margin-bottom: 4px; font-size: 15px;">🌍 Algoritma Iklim Spasial & Matriks Hama</strong>
                    <span style="font-size: 13px; color: var(--color-text-secondary, #64748b); line-height: 1.4; display: block;">
                        Jadwal dikalibrasi berdasarkan koordinat spesifik (Latitude/Longitude), pola curah hujan lokal, indeks anomali global, dan siklus hama spesifik lokasi.
                    </span>
                </div>
                <div id="loadingJadwalOtomatis" style="text-align: center; padding: 40px var(--card-padding); display: none;">
                    <span style="color: ${WARNA_TEMA}; font-weight: 600; font-size: 14px;">⏳ Membaca koordinat, iklim lokal, & matriks hama...</span>
                </div>
                <div id="kontenJadwalOtomatis"></div>
            `;
            card.appendChild(box);
        }
    }

    var switchModeAsli = window.switchMode;
    window.switchMode = function(mode) {
        if (typeof switchModeAsli === 'function') switchModeAsli.apply(this, arguments);
        var tab = document.getElementById('tabJadwalOtomatis');
        var modeTitle = document.getElementById('modeTitle');

        if (mode === 'jadwalotomatis') {
            document.body.classList.add('mode-jadwal');
            if (tab) tab.classList.add('active');
            if (modeTitle) modeTitle.innerText = "Rekomendasi Jadwal Tani Presisi";
            prosesKalkulasiOtomatis();
        } else {
            document.body.classList.remove('mode-jadwal');
            if (tab) tab.classList.remove('active');
        }
    };

    // =========================================================================
    //  2. ALGORITMA IKLIM LOKAL & MATRIKS HAMA
    // =========================================================================
    function analisisSistemSpasial(lat, bulan, ensoVal, iodVal) {
        // Asumsi model iklim Indonesia:
        // Selatan Ekuator (Lat < -1): Kemarau kuat Mei-Okt, Hujan Nov-Apr
        // Utara Ekuator (Lat > 1): Curah hujan lebih merata, puncak beda (bimodal)
        var isSelatan = lat <= -1.0; 
        var isUtara = lat >= 1.0;
        
        var curahHujanDasar = 50; // Skala 0-100
        
        if (isSelatan) {
            if (bulan >= 4 && bulan <= 9) curahHujanDasar = 20; // Kemarau
            else curahHujanDasar = 80; // Penghujan
        } else if (isUtara) {
            if ((bulan >= 1 && bulan <= 2) || (bulan >= 5 && bulan <= 7)) curahHujanDasar = 40;
            else curahHujanDasar = 75;
        }

        // Koreksi Anomali Global (ENSO & IOD)
        // ENSO > 0.5 (El Nino) mengurangi hujan. IOD > 0.4 (Positif) mengurangi hujan di barat/tengah.
        var faktorAnomali = (ensoVal * -15) + (iodVal * -10);
        var curahHujanAkhir = Math.max(0, Math.min(100, curahHujanDasar + faktorAnomali));

        // Matriks Risiko Hama Penyakit
        var hamaUtama = "";
        var varietas = "sedang";
        var narasi = "";

        if (curahHujanAkhir > 75) {
            hamaUtama = "Wereng Cokelat (BPH), Hawar Daun Bakteri (Kresek), dan Blast.";
            varietas = "dalam";
            narasi = "🌧️ **AWAS GENANGAN & KELEMBAPAN TINGGI:** Varietas tahan genangan dan tahan hama wereng wajib digunakan. Kurangi pupuk Urea (N) untuk mencegah jamur blast.";
        } else if (curahHujanAkhir < 35) {
            hamaUtama = "Tikus Sawah, Penggerek Batang (Sundep), dan Ganjur.";
            varietas = "genjah";
            narasi = "⚠️ **DEFISIT AIR LOKAL:** Gunakan varietas genjah super cepat (<90 HST). Prioritaskan Gropyokan Tikus dan pemasangan TBS sebelum olah lahan.";
        } else {
            hamaUtama = "Ulat Grayak dan Hama Putih Palsu.";
            varietas = "sedang";
            narasi = "✅ **IKLIM IDEAL:** Curah hujan cukup. Kondisi optimal untuk pertumbuhan vegetatif padi. Gunakan varietas menengah (95-115 HST).";
        }

        return { curahHujan: curahHujanAkhir, hama: hamaUtama, varietas: varietas, narasi: narasi };
    }

    function hariFaseBulan(tanggal) {
        var selisih = (tanggal.getTime() - EPOCH_BULAN_MATI.getTime()) / (1000 * 60 * 60 * 24);
        var hari = selisih % SIKLUS_SINODIS;
        return hari < 0 ? hari + SIKLUS_SINODIS : hari;
    }

    function tambahHari(d, n) {
        var hasil = new Date(d);
        hasil.setDate(hasil.getDate() + n);
        return hasil;
    }

    // Micro-Timing: Mencari titik aman berdasarkan iklim HARI INI dan siklus hama
    function cariTanggalTanamSinkron(varietasTerpilih) {
        var hariIni = new Date();
        hariIni.setHours(0,0,0,0);
        var offsetInsek = { genjah: 20, sedang: 25, dalam: 30 }[varietasTerpilih];
        
        var tglTanamSistem = hariIni;
        var jarakTerdekat = 999;
        
        // Scan -15 hingga +15 hari untuk memposisikan fase kritis (penyemprotan insek) 
        // JAUH dari bulan purnama (karena serangga aktif kawin/migrasi saat purnama).
        for(var i = -15; i <= 15; i++) {
            var ujiTglTanam = tambahHari(hariIni, i);
            var ujiTglInsek = tambahHari(ujiTglTanam, offsetInsek);
            var faseBulanSaatInsek = hariFaseBulan(ujiTglInsek);
            
            if (faseBulanSaatInsek <= 11 || faseBulanSaatInsek >= 18) {
                if (Math.abs(i) < Math.abs(jarakTerdekat)) {
                    jarakTerdekat = i;
                    tglTanamSistem = ujiTglTanam;
                }
            }
        }
        return tglTanamSistem;
    }

    // =========================================================================
    //  3. EKSEKUSI UTAMA
    // =========================================================================
    async function prosesKalkulasiOtomatis() {
        var loading = document.getElementById('loadingJadwalOtomatis');
        var konten = document.getElementById('kontenJadwalOtomatis');
        if (!loading || !konten) return;

        loading.style.display = 'block';
        konten.innerHTML = '';

        try {
            // Ambil GPS Real
            var lat = -5.14, lon = 119.43; // Default Makassar fallback
            if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                try {
                    var pos = await new Promise(function(res, rej) { navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }); });
                    lat = pos.coords.latitude; lon = pos.coords.longitude;
                } catch (e) { console.warn('Gagal membaca GPS, menggunakan lokasi fallback.'); }
            }

            var hariIni = new Date();
            var bulanSekarang = hariIni.getMonth(); // 0 - 11

            var ensoVal = typeof window.getENSOAnomaly === 'function' ? (await window.getENSOAnomaly()).latestAnomaly : 0;
            var iodVal = typeof window.getIODAnomaly === 'function' ? (await window.getIODAnomaly()).latestAnomaly : 0;
            
            // Masukkan parameter spesifik ke dalam sistem spasial
            var dataLokal = analisisSistemSpasial(lat, bulanSekarang, ensoVal, iodVal);
            var tanggalTanam = cariTanggalTanamSinkron(dataLokal.varietas);
            
            var htmlHasil = produksiHTMLJadwal(tanggalTanam, dataLokal, lat, lon);
            
            loading.style.display = 'none';
            konten.innerHTML = htmlHasil;

        } catch (err) {
            loading.style.display = 'none';
            konten.innerHTML = `<div style="color: #ef4444; padding: 12px;">Kesalahan Algoritma: ${err.message}</div>`;
        }
    }

    // =========================================================================
    //  4. PEMBENTUKAN ANTARMUKA (UI)
    // =========================================================================
    function produksiHTMLJadwal(tglTanam, dataLokal, lat, lon) {
        var konfigHST = {
            genjah: { pupuk1: 7, pupuk2: 28, insektisida: 20, fungisida: 55, panen: 90 },
            sedang: { pupuk1: 7, pupuk2: 30, insektisida: 25, fungisida: 65, panen: 110 },
            dalam:  { pupuk1: 7, pupuk2: 35, insektisida: 30, fungisida: 75, panen: 125 }
        }[dataLokal.varietas];

        var tglInsektisida = tambahHari(tglTanam, konfigHST.insektisida);
        var tglOlahLahan = tambahHari(tglTanam, -14);
        var tglGropyokan = tambahHari(tglTanam, -7);
        var hariIni = new Date(); hariIni.setHours(0,0,0,0);

        var peringatanLahan = 'Lakukan pembajakan dalam membalik tanah untuk membunuh sisa telur penggerek batang.';
        if (tglOlahLahan < hariIni) {
            var telatLahanHari = Math.round((hariIni - tglOlahLahan) / (1000 * 60 * 60 * 24));
            peringatanLahan = `🚨 <strong>TERLAMBAT ${telatLahanHari} HARI!</strong> Percepat olah lahan. Siklus air dan hama tidak akan menunggu!`;
        }

        var peringatanTanam = 'Sinkronisasi mikroklimat & fase bulan (hindari serangga hama).';
        if (tglTanam < hariIni) {
            var telatTanamHari = Math.round((hariIni - tglTanam) / (1000 * 60 * 60 * 24));
            peringatanTanam = `⚠️ <strong>TERLAMBAT TANAM ${telatTanamHari} HARI!</strong> Risiko ketidaktepatan panen dengan curah hujan lokal meningkat.`;
        }

        var susunanLangkah = [
            { ikon: '🚜', nama: 'Pengolahan Lahan', tgl: tglOlahLahan, detail: peringatanLahan },
            { ikon: '🐀', nama: 'Mitigasi Hama Dasar', tgl: tglGropyokan, detail: `Fokus pengendalian: <strong>${dataLokal.hama.split(',')[0]}</strong> sebelum sebar benih.` },
            { ikon: '🌾', nama: 'Penanaman Serempak', tgl: tglTanam, detail: peringatanTanam },
            { ikon: '🧪', nama: 'Pemupukan NPK (Dasar)', tgl: tambahHari(tglTanam, konfigHST.pupuk1), detail: (dataLokal.curahHujan > 75 ? 'Hujan tinggi: Kurangi dosis Nitrogen (Urea) untuk tekan risiko blast.' : 'Pemberian pupuk standar.') },
            { ikon: '💊', nama: 'Fase Kritis & Insektisida', tgl: tglInsektisida, detail: `Waspada serangan <strong>${dataLokal.hama}</strong>. Aplikasi pestisida jatuh di fase bulan aman.` },
            { ikon: '🧪', nama: 'Pemupukan Tahap II', tgl: tambahHari(tglTanam, konfigHST.pupuk2), detail: 'Gunakan Bagan Warna Daun (BWD) untuk menakar dosis.' },
            { ikon: '🍄', nama: 'Fungisida & Pencegahan', tgl: tambahHari(tglTanam, konfigHST.fungisida), detail: 'Semprotkan anti-jamur sistemik tepat sebelum malai keluar.' },
            { ikon: '🌟', nama: 'Estimasi Panen', tgl: tambahHari(tglTanam, konfigHST.panen), detail: 'Keringkan sawah 10 hari sebelum tanggal ini.' }
        ];

        var garisLintang = lat.toFixed(2);
        var garisBujur = lon.toFixed(2);

        var html = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5;">
                📍 <strong>Koordinat Lahan:</strong> ${garisLintang}, ${garisBujur}<br>
                📊 <strong>Potensi Curah Hujan Lokal:</strong> ${Math.round(dataLokal.curahHujan)}%<br>
                🐛 <strong>Risiko Hama Dominan:</strong> <span style="color:#f43f5e;">${dataLokal.hama}</span><br>
                💡 <strong>Rekomendasi Agronomi:</strong> ${dataLokal.narasi}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
        `;

        susunanLangkah.forEach(function(item, indeks) {
            var strTgl = item.tgl.getDate() + ' ' + NAMA_BULAN[item.tgl.getMonth()] + ' ' + item.tgl.getFullYear();
            
            var isTerlambat = (item.tgl < hariIni) ? 'border-left: 4px solid #ef4444; opacity: 0.85;' : `border-left: 4px solid ${WARNA_TEMA};`;
            var isTanam = (indeks === 2) ? 'border-left: 6px solid #f59e0b; background: rgba(245, 158, 11, 0.08);' : `${isTerlambat} background: var(--color-background-secondary, #1e293b);`;

            var labelLangkah = (item.tgl < hariIni && indeks <= 2) ? '⚠️ TERLEWAT' : `LANGKAH ${indeks + 1}`;
            var warnaLabel = (item.tgl < hariIni && indeks <= 2) ? '#ef4444' : ((indeks===2) ? '#f59e0b' : WARNA_TEMA);

            html += `
                <div style="padding: 14px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); ${isTanam}">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="font-size: 24px; padding-top: 2px;">${item.ikon}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 11px; color: ${warnaLabel}; font-weight: 700; letter-spacing: 0.5px;">${labelLangkah}</div>
                            <div style="font-size: 15px; font-weight: 600; color: var(--color-text-primary, #fff); margin: 2px 0;">${item.nama}</div>
                            <div style="font-size: 13px; color: #10b981; font-weight: 600; margin-bottom: 6px;">📅 ${strTgl}</div>
                            <div style="font-size: 12.5px; color: var(--color-text-secondary, #94a3b8); line-height: 1.5;">${item.detail}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inisialisasiUI);
    else inisialisasiUI();
})();
