/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_otomatis.js
 * Versi: 3.0 — Rekomendasi Otomatis Tanpa Input Manual & Kamera
 * ============================================================
 */
(function () {
    'use strict';

    var WARNA_TEMA = '#0ea5e9'; // Tema Biru Langit Cerdas
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_BULAN = [
        'Januari','Februari','Maret','April','Mei','Juni',
        'Juli','Agustus','September','Oktober','November','Desember'
    ];

    // =========================================================================
    //  1. INISIALISASI TAMPILAN (TANPA FORM INPUT)
    // =========================================================================
    function inisialisasiUI() {
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
                    <strong style="color: ${WARNA_TEMA}; display: block; margin-bottom: 4px; font-size: 15px;">🤖 Sistem Rekomendasi Pintar Petani</strong>
                    <span style="font-size: 13px; color: var(--color-text-secondary, #64748b); line-height: 1.4; display: block;">
                        Sistem mendeteksi koordinat lokasi sawah, tanggal hari ini, serta parameter iklim makro secara otomatis untuk menyusun kalender pengerjaan lahan dan antisipasi hama.
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
    //  2. INTEGRASI SWITCHMODE (LANGSUNG PROSES SAAT DIKLIK)
    // =========================================================================
    var switchModeAsli = window.switchMode;
    window.switchMode = function(mode) {
        if (typeof switchModeAsli === 'function') {
            switchModeAsli.apply(this, arguments);
        }

        var box = document.getElementById('boxJadwalOtomatis');
        var tab = document.getElementById('tabJadwalOtomatis');
        var modeTitle = document.getElementById('modeTitle');

        if (box && tab) {
            if (mode === 'jadwalotomatis') {
                // Sembunyikan kontainer tab lain
                Array.from(document.querySelector('.card').children).forEach(function(el) {
                    if (el.id && el.id.startsWith('box')) el.style.display = 'none';
                });
                box.style.display = 'block';
                tab.classList.add('active');
                if (modeTitle) modeTitle.innerText = "Rekomendasi Jadwal Kegiatan Tani";
                
                // Eksekusi otomatis tanpa menunggu klik tombol lagi
                prosesKalkulasiOtomatis();
            } else {
                box.style.display = 'none';
                tab.classList.remove('active');
            }
        }
    };

    // =========================================================================
    //  3. PROSES REKOMENDASI OTOMATIS BERBASIS DATA IKLIM & KOORDINAT
    // =========================================================================
    async function prosesKalkulasiOtomatis() {
        var loading = document.getElementById('loadingJadwalOtomatis');
        var konten = document.getElementById('kontenJadwalOtomatis');
        if (!loading || !konten) return;

        loading.style.display = 'block';
        konten.innerHTML = '';

        try {
            // Ambil titik koordinat otomatis
            var lat = -4.0, lon = 120.0;
            if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                try {
                    var pos = await new Promise(function(res, rej) {
                        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 });
                    });
                    lat = pos.coords.latitude;
                    lon = pos.coords.longitude;
                } catch (e) {
                    console.warn('[SmartJadwal] GPS delayed, menggunakan default koordinat regional.');
                }
            }

            // Tarik parameter anomali iklim global (ENSO / IOD)
            var ensoVal = 0, iodVal = 0;
            if (typeof window.getENSOAnomaly === 'function') {
                var enso = await window.getENSOAnomaly();
                ensoVal = enso.latestAnomaly || 0;
            }
            if (typeof window.getIODAnomaly === 'function') {
                var iod = await window.getIODAnomaly();
                iodVal = iod.latestAnomaly || 0;
            }

            // Ambil tanggal hari ini secara otomatis sebagai referensi acuan tanam
            var tglHariIni = new Date();
            
            // Hitung kalkulasi perkiraan kelembapan (Skor 0 - 100)
            var skorIklim = Math.round(50 - ((ensoVal + iodVal) * 22));
            skorIklim = Math.max(0, Math.min(100, skorIklim));

            // KEPUTUSAN VARIETAS OTOMATIS BERDASARKAN KONDISI NYATA
            var varietasTerpilih = 'sedang';
            var narasiVarietas = 'Kondisi curah hujan terpantau normal. Sistem merekomendasikan penggunaan *Varietas Sedang* (95-115 HST) seperti Ciherang atau Inpari untuk hasil produksi optimal.';

            if (skorIklim < 40) {
                varietasTerpilih = 'genjah';
                narasiVarietas = '⚠️ **PERINGATAN KERING:** Parameter cuaca menunjukkan kecenderungan minim air/kemarau. Sistem otomatis memilih **Varietas Genjah (< 95 HST)** seperti Cakrabuana atau M70D untuk menghemat fase pengairan dan menghindari risiko puso.';
            } else if (skorIklim > 78) {
                varietasTerpilih = 'dalam';
                narasiVarietas = '🌧️ **PERINGATAN GENANGAN:** Curah hujan terdeteksi sangat tinggi. Sistem otomatis merekomendasikan **Varietas Tahan Genangan / Umur Dalam** guna meminimalkan kerusakan tanaman akibat luapan air sawah.';
            }

            // Olah urutan kalender tani
            var htmlHasil = produksiHTMLJadwal(tglHariIni, varietasTerpilih, narasiVarietas, skorIklim, lat, lon);
            
            loading.style.display = 'none';
            konten.innerHTML = htmlHasil;

        } catch (err) {
            loading.style.display = 'none';
            konten.innerHTML = `<div style="color: #ef4444; padding: 12px; font-size: 13px; background: rgba(239,68,68,0.08); border-radius: 6px;">Gagal memetakan jadwal: ${err.message}</div>`;
        }
    }

    // =========================================================================
    //  4. ALGORITMA SIKLUS HAMA & TIMING KEGIATAN
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

        // Analisis Fase Bulan untuk Penggerek Batang Padi (PBP) saat penyemprotan
        var tglInsektisida = tambahHari(tglTanam, konfigHST.insektisida);
        var faseBulanInsekt = hariFaseBulan(tglInsektisida);
        var tipsPHT = (faseBulanInsekt > 12.5 && faseBulanInsekt < 16.5) ?
            "🛑 **Waspada Ledakan Hama:** Jatuh pada fase Bulan Purnama. Ngengat Penggerek Batang sangat aktif bertelur malam hari. Gunakan insektisida sistemik dan pasang lampu perangkap (light trap) massal!" :
            "✅ **Fase Aman Hama Terbang:** Kondisi bulan gelap/redup, aktivitas penerbangan imago malam hari rendah. Fokus pemantauan bawah batang rumpun.";

        var susunanLangkah = [
            { ikon: '🚜', nama: 'Pengolahan Tanah Maksimal', tgl: tambahHari(tglTanam, -14), detail: 'Lakukan pembajakan sedalam 15-20 cm untuk mengubur singgang, memutus siklus hidup wereng, dan membenamkan gulma secara sempurna.' },
            { ikon: '🐀', nama: 'Gropyokan & Umpan Tikus Massal', tgl: tambahHari(tglTanam, -7), detail: 'Bersihkan semak pematang. Pasang sistem bubu perangkap TBS (Trap Barrier System) di wilayah perimeter sebelum penanaman serempak.' },
            { ikon: '🌾', nama: 'Hari Penanaman Padi (Acuan Hari Ini)', tgl: tglTanam, detail: 'Lakukan penanaman bibit secara serempak. Gunakan jarak tanam teratur seperti sistem Jajar Legowo untuk mengoptimalkan paparan sinar matahari.' },
            { ikon: '🧪', nama: 'Pemupukan Tahap I (Dasar)', tgl: tambahHari(tglTanam, konfigHST.pupuk1), detail: 'Taburkan pupuk Nitrogen (Urea) dan NPK saat kondisi air macak-macak di petakan sawah agar unsur hara melekat sempurna ke dalam tanah lumpur.' },
            { ikon: '💊', nama: 'Penyemprotan Insektisida Berkala (PHT)', tgl: tglInsektisida, detail: tipsPHT },
            { ikon: '🧪', nama: 'Pemupukan Tahap II (Susulan)', tgl: tambahHari(tglTanam, konfigHST.pupuk2), detail: 'Pemberian pupuk susulan demi memicu pembentukan anakan produktif yang maksimal. Gunakan alat Bagan Warna Daun (BWD) sebagai indikator dosis.' },
            { ikon: '🍄', nama: 'Aplikasi Fungisida Preventif (Blast)', tgl: tambahHari(tglTanam, konfigHST.fungisida), detail: 'Lakukan penyemprotan pelindung jamur sebelum padi memasuki fase bunting penuh guna mencegah serangan penyakit potong leher malai.' },
            { ikon: '🌟', nama: 'Estimasi Pemanenan Raya', tgl: tambahHari(tglTanam, konfigHST.panen), detail: 'Panen siap dilakukan ketika 90-95% gabah pada malai telah menguning merata. Buang air petakan sawah 7 hari sebelum panen agar tanah mengeras.' }
        ];

        var html = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5;">
                📌 <strong>Lokasi Koordinat Lahan:</strong> ${lat.toFixed(4)}°, ${lon.toFixed(4)}°<br>
                📊 <strong>Indeks Basah Iklim:</strong> ${skorIklim} / 100<br>
                💡 <strong>Keputusan Sistem Cerdas:</strong> ${deskripsiSistem}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
        `;

        susunanLangkah.forEach(function(item, indeks) {
            var stringTanggal = item.tgl.getDate() + ' ' + NAMA_BULAN[item.tgl.getMonth()] + ' ' + item.tgl.getFullYear();
            html += `
                <div style="background: var(--color-background-secondary, #1e293b); padding: 14px; border-radius: 10px; border-left: 4px solid ${WARNA_TEMA}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="font-size: 24px; padding-top: 2px;">${item.ikon}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 11px; color: ${WARNA_TEMA}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">LANGKAH ${indeks + 1}</div>
                            <div style="font-size: 15px; font-weight: 600; color: var(--color-text-primary, #fff); margin: 2px 0;">${item.nama}</div>
                            <div style="font-size: 13px; color: #10b981; font-weight: 600; margin-bottom: 6px;">📅 ${stringTanggal}</div>
                            <div style="font-size: 12.5px; color: var(--color-text-secondary, #94a3b8); line-height: 1.5;">${item.detail}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    // Jalankan inisialisasi awal saat siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inisialisasiUI);
    } else {
        inisialisasiUI();
    }
})();
