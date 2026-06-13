/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_otomatis.js
 * Versi: 7.0 — PURE AGRONOMIC LOGIC (Alam Mendikte Petani)
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
    //  0. INJEKSI CSS KARANTINA (MEMBUNUH KAMERA)
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
                    <strong style="color: ${WARNA_TEMA}; display: block; margin-bottom: 4px; font-size: 15px;">🤖 Algoritma Tanam Berbasis Alam</strong>
                    <span style="font-size: 13px; color: var(--color-text-secondary, #64748b); line-height: 1.4; display: block;">
                        Sistem memprioritaskan keamanan dari ledakan hama dan anomali cuaca. Jadwal pengolahan lahan harus menyesuaikan ketetapan alam, bukan sebaliknya.
                    </span>
                </div>
                <div id="loadingJadwalOtomatis" style="text-align: center; padding: 40px var(--card-padding); display: none;">
                    <span style="color: ${WARNA_TEMA}; font-weight: 600; font-size: 14px;">⏳ Membaca siklus alam & mencari titik tanam paling aman...</span>
                </div>
                <div id="kontenJadwalOtomatis"></div>
            `;
            card.appendChild(box);
        }
    }

    // =========================================================================
    //  2. OVERRIDE SWITCHMODE
    // =========================================================================
    var switchModeAsli = window.switchMode;
    window.switchMode = function(mode) {
        if (typeof switchModeAsli === 'function') {
            switchModeAsli.apply(this, arguments);
        }
        var tab = document.getElementById('tabJadwalOtomatis');
        var modeTitle = document.getElementById('modeTitle');

        if (mode === 'jadwalotomatis') {
            document.body.classList.add('mode-jadwal');
            if (tab) tab.classList.add('active');
            if (modeTitle) modeTitle.innerText = "Rekomendasi Jadwal Kegiatan Tani";
            prosesKalkulasiOtomatis();
        } else {
            document.body.classList.remove('mode-jadwal');
            if (tab) tab.classList.remove('active');
        }
    };

    // =========================================================================
    //  3. ALGORITMA PENCARI TANGGAL OPTIMAL MUTLAK MURNI
    // =========================================================================
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

    function cariTanggalTanamOptimalMurni(varietasTerpilih) {
        var hariIni = new Date();
        var offsetInsek = { genjah: 20, sedang: 25, dalam: 30 }[varietasTerpilih];
        var tglTanamSistem = hariIni; // Fallback awal
        
        // Scan maksimal 1 siklus bulan (30 hari) ke depan dari hari ini.
        // Cari titik di mana fase penyemprotan insektisida BUKAN jatuh di bulan purnama.
        for(var i = 0; i <= 30; i++) {
            var ujiTglTanam = tambahHari(hariIni, i);
            var ujiTglInsek = tambahHari(ujiTglTanam, offsetInsek);
            var faseBulanSaatInsek = hariFaseBulan(ujiTglInsek);
            
            // Bulan gelap / aman adalah fase sebelum 11 atau sesudah 18.
            if (faseBulanSaatInsek <= 11 || faseBulanSaatInsek >= 18) {
                tglTanamSistem = ujiTglTanam; // Ketemu tanggal paling aman menurut iklim/hama
                break;
            }
        }
        return tglTanamSistem;
    }

    async function prosesKalkulasiOtomatis() {
        var loading = document.getElementById('loadingJadwalOtomatis');
        var konten = document.getElementById('kontenJadwalOtomatis');
        if (!loading || !konten) return;

        loading.style.display = 'block';
        konten.innerHTML = '';

        try {
            var lat = -4.0, lon = 120.0;
            if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                try {
                    var pos = await new Promise(function(res, rej) { navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }); });
                    lat = pos.coords.latitude; lon = pos.coords.longitude;
                } catch (e) { console.warn('Gagal membaca GPS.'); }
            }

            var ensoVal = typeof window.getENSOAnomaly === 'function' ? (await window.getENSOAnomaly()).latestAnomaly : 0;
            var iodVal = typeof window.getIODAnomaly === 'function' ? (await window.getIODAnomaly()).latestAnomaly : 0;
            
            var skorIklim = Math.round(50 - ((ensoVal + iodVal) * 22));
            skorIklim = Math.max(0, Math.min(100, skorIklim));

            var varietasTerpilih = 'sedang';
            var narasiVarietas = 'Curah hujan stabil. Direkomendasikan *Varietas Sedang* (95-115 HST).';

            if (skorIklim < 40) {
                varietasTerpilih = 'genjah';
                narasiVarietas = '⚠️ **KEMARAU:** Parameter global defisit air. Wajib gunakan *Varietas Genjah (< 95 HST)*.';
            } else if (skorIklim > 78) {
                varietasTerpilih = 'dalam';
                narasiVarietas = '🌧️ **BANJIR:** Curah hujan ekstrem. Wajib gunakan *Varietas Umur Dalam / Tahan Genangan*.';
            }

            // EKSEKUSI PENCARIAN TANGGAL BERDASARKAN ALAM
            var tanggalKeputusanSistem = cariTanggalTanamOptimalMurni(varietasTerpilih);
            
            var htmlHasil = produksiHTMLJadwal(tanggalKeputusanSistem, varietasTerpilih, narasiVarietas, skorIklim, lat, lon);
            
            loading.style.display = 'none';
            konten.innerHTML = htmlHasil;

        } catch (err) {
            loading.style.display = 'none';
            konten.innerHTML = `<div style="color: #ef4444; padding: 12px;">Gagal memetakan jadwal: ${err.message}</div>`;
        }
    }

    // =========================================================================
    //  4. PEMBENTUKAN ANTARMUKA JADWAL (UI)
    // =========================================================================
    function produksiHTMLJadwal(tglTanam, varietas, deskripsiSistem, skorIklim, lat, lon) {
        var konfigHST = {
            genjah: { pupuk1: 7, pupuk2: 28, insektisida: 20, fungisida: 55, panen: 90 },
            sedang: { pupuk1: 7, pupuk2: 30, insektisida: 25, fungisida: 65, panen: 110 },
            dalam:  { pupuk1: 7, pupuk2: 35, insektisida: 30, fungisida: 75, panen: 125 }
        }[varietas];

        var tglInsektisida = tambahHari(tglTanam, konfigHST.insektisida);
        var tglOlahLahan = tambahHari(tglTanam, -14);
        var tglGropyokan = tambahHari(tglTanam, -7);
        var hariIni = new Date();
        hariIni.setHours(0,0,0,0);

        // Evaluasi keterlambatan petani
        var peringatanLahan = 'Lakukan pembajakan sedalam 15-20cm untuk memutus siklus wereng.';
        if (tglOlahLahan < hariIni) {
            var telatHari = Math.round((hariIni - tglOlahLahan) / (1000 * 60 * 60 * 24));
            peringatanLahan = `🚨 <strong>ANDA TERLAMBAT ${telatHari} HARI!</strong> Segera percepat pengolahan lahan dengan traktor roda empat untuk mengejar ketetapan jadwal tanam dari sistem!`;
        }

        var susunanLangkah = [
            { ikon: '🚜', nama: 'Pengolahan Lahan', tgl: tglOlahLahan, detail: peringatanLahan },
            { ikon: '🐀', nama: 'Gropyokan Tikus Massal', tgl: tglGropyokan, detail: 'Bersihkan semak pematang dan pasang Trap Barrier System (TBS).' },
            { ikon: '🌾', nama: 'Penanaman Serempak', tgl: tglTanam, detail: 'Ketetapan mutlak sistem berdasar fase bulan & iklim. Patuhi tanggal ini.' },
            { ikon: '🧪', nama: 'Pemupukan Tahap I (Dasar)', tgl: tambahHari(tglTanam, konfigHST.pupuk1), detail: 'Berikan pupuk Urea + NPK saat kondisi petakan macak-macak.' },
            { ikon: '💊', nama: 'Fase Kritis & Insektisida', tgl: tglInsektisida, detail: '✅ Berkat sinkronisasi sistem, tanggal penyemprotan jatuh di luar masa purnama. Risiko hama terbang rendah.' },
            { ikon: '🧪', nama: 'Pemupukan Tahap II (Susulan)', tgl: tambahHari(tglTanam, konfigHST.pupuk2), detail: 'Gunakan Bagan Warna Daun (BWD) untuk menakar dosis.' },
            { ikon: '🍄', nama: 'Aplikasi Fungisida', tgl: tambahHari(tglTanam, konfigHST.fungisida), detail: 'Semprotkan anti-jamur tepat sebelum malai keluar.' },
            { ikon: '🌟', nama: 'Estimasi Panen Raya', tgl: tambahHari(tglTanam, konfigHST.panen), detail: 'Panen direkomendasikan saat 90-95% gabah menguning.' }
        ];

        var html = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5;">
                📊 <strong>Indeks Basah Iklim:</strong> ${skorIklim} / 100<br>
                💡 <strong>Keputusan Sistem Cerdas:</strong> ${deskripsiSistem}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
        `;

        susunanLangkah.forEach(function(item, indeks) {
            var strTgl = item.tgl.getDate() + ' ' + NAMA_BULAN[item.tgl.getMonth()] + ' ' + item.tgl.getFullYear();
            
            // Penanda visual jika petani terlambat (tanggal sudah lewat)
            var isTerlambat = (item.tgl < hariIni) ? 'border-left: 4px solid #ef4444; opacity: 0.85;' : `border-left: 4px solid ${WARNA_TEMA};`;
            var isTanam = (indeks === 2) ? 'border-left: 6px solid #f59e0b; background: rgba(245, 158, 11, 0.08);' : `${isTerlambat} background: var(--color-background-secondary, #1e293b);`;

            var labelLangkah = (item.tgl < hariIni && indeks < 2) ? '⚠️ TERLEWAT' : `LANGKAH ${indeks + 1}`;
            var warnaLabel = (item.tgl < hariIni && indeks < 2) ? '#ef4444' : ((indeks===2) ? '#f59e0b' : WARNA_TEMA);

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inisialisasiUI);
    } else {
        inisialisasiUI();
    }
})();
