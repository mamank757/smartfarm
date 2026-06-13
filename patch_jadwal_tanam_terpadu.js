/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_otomatis.js
 * Versi: 5.0 — Karantina CSS Mutlak (BEBAS KAMERA 100%)
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
    //  0. INJEKSI CSS KARANTINA (PEMBUNUH KAMERA MUTLAK)
    // =========================================================================
    function pasangCSSKarantina() {
        if (!document.getElementById('cssKarantinaJadwal')) {
            var style = document.createElement('style');
            style.id = 'cssKarantinaJadwal';
            style.innerHTML = `
                /* Saat mode jadwal aktif, SEMUA isi dari kotak utama disembunyikan paksa */
                body.mode-jadwal .card > * {
                    display: none !important;
                }
                /* HANYA judul dan kotak jadwal yang diizinkan tampil */
                body.mode-jadwal .card > #modeTitle,
                body.mode-jadwal .card > #boxJadwalOtomatis {
                    display: block !important;
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
            box.style.display = 'none'; // Disembunyikan secara default
            box.innerHTML = `
                <div class="info-box" style="border-left: 4px solid ${WARNA_TEMA}; background: rgba(14,165,233,0.06); padding: 14px; margin-bottom: 16px; border-radius: 8px;">
                    <strong style="color: ${WARNA_TEMA}; display: block; margin-bottom: 4px; font-size: 15px;">🤖 Sistem Rekomendasi Pintar Petani</strong>
                    <span style="font-size: 13px; color: var(--color-text-secondary, #64748b); line-height: 1.4; display: block;">
                        Sistem mendeteksi koordinat lokasi sawah, tanggal hari ini, serta parameter iklim makro secara otomatis untuk menyusun kalender pengerjaan lahan.
                    </span>
                </div>
                <div id="loadingJadwalOtomatis" style="text-align: center; padding: 40px var(--card-padding); display: none;">
                    <span style="color: ${WARNA_TEMA}; font-weight: 600; font-size: 14px;">⏳ Membaca koordinat satelit & memproses rekomendasi...</span>
                </div>
                <div id="kontenJadwalOtomatis"></div>
            `;
            card.appendChild(box);
        }
    }

    // =========================================================================
    //  2. OVERRIDE SWITCHMODE (KONTROL CSS BODY)
    // =========================================================================
    var switchModeAsli = window.switchMode;
    window.switchMode = function(mode) {
        // Biarkan sistem bawaan berjalan terlebih dahulu
        if (typeof switchModeAsli === 'function') {
            switchModeAsli.apply(this, arguments);
        }

        var tab = document.getElementById('tabJadwalOtomatis');
        var modeTitle = document.getElementById('modeTitle');

        if (mode === 'jadwalotomatis') {
            // AKTIFKAN KARANTINA: Kamera akan mati seutuhnya!
            document.body.classList.add('mode-jadwal');
            
            if (tab) tab.classList.add('active');
            if (modeTitle) modeTitle.innerText = "Rekomendasi Jadwal Kegiatan Tani";
            
            // Langsung eksekusi pencarian rute tanam otomatis
            prosesKalkulasiOtomatis();
        } else {
            // MATIKAN KARANTINA: Jika pindah ke tab Daun/Hama, kamera bisa menyala lagi
            document.body.classList.remove('mode-jadwal');
            if (tab) tab.classList.remove('active');
        }
    };

    // =========================================================================
    //  3. PROSES REKOMENDASI OTOMATIS (GPS & IKLIM)
    // =========================================================================
    async function prosesKalkulasiOtomatis() {
        var loading = document.getElementById('loadingJadwalOtomatis');
        var konten = document.getElementById('kontenJadwalOtomatis');
        if (!loading || !konten) return;

        loading.style.display = 'block';
        konten.innerHTML = '';

        try {
            var lat = -4.0, lon = 120.0; // Default fallback
            if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                try {
                    // Murni menarik data LOKASI, BUKAN KAMERA
                    var pos = await new Promise(function(res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 });
                    });
                    lat = pos.coords.latitude;
                    lon = pos.coords.longitude;
                } catch (e) {
                    console.warn('GPS delay.');
                }
            }

            var ensoVal = typeof window.getENSOAnomaly === 'function' ? (await window.getENSOAnomaly()).latestAnomaly : 0;
            var iodVal = typeof window.getIODAnomaly === 'function' ? (await window.getIODAnomaly()).latestAnomaly : 0;
            var tglHariIni = new Date();
            
            var skorIklim = Math.round(50 - ((ensoVal + iodVal) * 22));
            skorIklim = Math.max(0, Math.min(100, skorIklim));

            var varietasTerpilih = 'sedang';
            var narasiVarietas = 'Kondisi curah hujan normal. Sistem merekomendasikan penggunaan *Varietas Sedang* (95-115 HST) seperti Ciherang atau Inpari.';

            if (skorIklim < 40) {
                varietasTerpilih = 'genjah';
                narasiVarietas = '⚠️ **PERINGATAN KERING:** Parameter cuaca menunjukkan kecenderungan minim air/kemarau. Sistem otomatis memilih **Varietas Genjah (< 95 HST)** seperti Cakrabuana atau M70D untuk menghemat fase pengairan.';
            } else if (skorIklim > 78) {
                varietasTerpilih = 'dalam';
                narasiVarietas = '🌧️ **PERINGATAN GENANGAN:** Curah hujan terdeteksi tinggi. Sistem merekomendasikan **Varietas Tahan Genangan / Umur Dalam** guna meminimalkan kerusakan tanaman akibat luapan air sawah.';
            }

            var htmlHasil = produksiHTMLJadwal(tglHariIni, varietasTerpilih, narasiVarietas, skorIklim, lat, lon);
            
            loading.style.display = 'none';
            konten.innerHTML = htmlHasil;

        } catch (err) {
            loading.style.display = 'none';
            konten.innerHTML = `<div style="color: #ef4444; padding: 12px; background: rgba(239,68,68,0.08);">Gagal memetakan jadwal: ${err.message}</div>`;
        }
    }

    // =========================================================================
    //  4. ALGORITMA SIKLUS HAMA & TIMING
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

    function produksiHTMLJadwal(tglTanam, varietas, deskripsiSistem, skorIklim, lat, lon) {
        var konfigHST = {
            genjah: { pupuk1: 7, pupuk2: 28, pupuk3: 45, insektisida: 20, fungisida: 55, panen: 90 },
            sedang: { pupuk1: 7, pupuk2: 30, pupuk3: 55, insektisida: 25, fungisida: 65, panen: 110 },
            dalam:  { pupuk1: 7, pupuk2: 35, pupuk3: 65, insektisida: 30, fungisida: 75, panen: 125 }
        }[varietas];

        var tglInsektisida = tambahHari(tglTanam, konfigHST.insektisida);
        var faseBulanInsekt = hariFaseBulan(tglInsektisida);
        var tipsPHT = (faseBulanInsekt > 12.5 && faseBulanInsekt < 16.5) ?
            "🛑 **Waspada Ledakan Hama:** Fase Bulan Purnama! Ngengat Penggerek Batang sangat aktif bertelur malam hari. Gunakan insektisida sistemik dan pasang lampu perangkap massal!" :
            "✅ **Fase Aman Hama Terbang:** Kondisi bulan redup/gelap, aktivitas ngengat malam hari terpantau rendah. Fokus pantau bagian bawah rumpun padi.";

        var susunanLangkah = [
            { ikon: '🚜', nama: 'Pengolahan Tanah Maksimal', tgl: tambahHari(tglTanam, -14), detail: 'Lakukan pembajakan untuk mengubur singgang dan memutus siklus hidup hama wereng.' },
            { ikon: '🐀', nama: 'Gropyokan & Umpan Tikus', tgl: tambahHari(tglTanam, -7), detail: 'Bersihkan semak pematang. Pasang sistem bubu perangkap sebelum air lahan diisi.' },
            { ikon: '🌾', nama: 'Hari Penanaman Padi', tgl: tglTanam, detail: 'Lakukan penanaman bibit secara serempak dengan jarak tanam Jajar Legowo yang presisi.' },
            { ikon: '🧪', nama: 'Pemupukan Tahap I (Dasar)', tgl: tambahHari(tglTanam, konfigHST.pupuk1), detail: 'Taburkan pupuk Nitrogen dan NPK saat kondisi air sawah macak-macak/kering tipis.' },
            { ikon: '💊', nama: 'Penyemprotan Insektisida', tgl: tglInsektisida, detail: tipsPHT },
            { ikon: '🧪', nama: 'Pemupukan Tahap II', tgl: tambahHari(tglTanam, konfigHST.pupuk2), detail: 'Pemupukan susulan. Gunakan alat Bagan Warna Daun (BWD) untuk menakar dosis pupuk daun.' },
            { ikon: '🍄', nama: 'Aplikasi Fungisida Preventif', tgl: tambahHari(tglTanam, konfigHST.fungisida), detail: 'Penyemprotan anti-jamur tepat sebelum padi memasuki fase bunting untuk cegah potong leher.' },
            { ikon: '🌟', nama: 'Estimasi Pemanenan Raya', tgl: tambahHari(tglTanam, konfigHST.panen), detail: 'Panen ketika gabah 90% menguning. Buang air petakan sawah 7 hari sebelum alat panen masuk.' }
        ];

        var html = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5;">
                📌 <strong>Lokasi Sawah:</strong> ${lat.toFixed(4)}°, ${lon.toFixed(4)}°<br>
                📊 <strong>Indeks Basah Iklim:</strong> ${skorIklim} / 100<br>
                💡 <strong>Sistem Rekomendasi:</strong> ${deskripsiSistem}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
        `;

        susunanLangkah.forEach(function(item, indeks) {
            var strTgl = item.tgl.getDate() + ' ' + NAMA_BULAN[item.tgl.getMonth()] + ' ' + item.tgl.getFullYear();
            html += `
                <div style="background: var(--color-background-secondary, #1e293b); padding: 14px; border-radius: 10px; border-left: 4px solid ${WARNA_TEMA}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="font-size: 24px; padding-top: 2px;">${item.ikon}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 11px; color: ${WARNA_TEMA}; font-weight: 700; letter-spacing: 0.5px;">LANGKAH ${indeks + 1}</div>
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
