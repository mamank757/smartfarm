/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_terpadu.js
 * Versi: 2.0 — Menu Jadwal Tanam Mandiri & Terpadu
 * ============================================================
 */
(function () {
    'use strict';

    var WARNA_JADWAL = '#06b6d4'; // Tema warna Cyan
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;

    var NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    // --- 1. INISIALISASI UI (TAB & BOX) ---
    function initUI() {
        var tabContainer = document.querySelector('.tab-container');
        if (tabContainer && !document.getElementById('tabJadwalTanam')) {
            var btnTab = document.createElement('button');
            btnTab.className = 'tab-btn';
            btnTab.id = 'tabJadwalTanam';
            btnTab.textContent = 'JADWAL TANAM';
            btnTab.onclick = function () { window.switchMode('jadwaltanam'); };
            tabContainer.appendChild(btnTab);
        }

        var card = document.querySelector('.card');
        if (card && !document.getElementById('boxJadwalTanam')) {
            var boxJadwal = document.createElement('div');
            boxJadwal.id = 'boxJadwalTanam';
            boxJadwal.style.display = 'none';
            boxJadwal.innerHTML = `
                <div class="info-box" style="border-left-color: ${WARNA_JADWAL}; background: rgba(6,182,212,0.07); margin-bottom: 20px;">
                    <strong style="color:${WARNA_JADWAL};">📅 Kalender Tanam Berbasis Iklim</strong><br>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Menghitung jadwal kegiatan tani terintegrasi dengan fase bulan, ENSO/IOD, dan data koordinat cuaca lokal.</span>
                </div>
                <div class="form-group">
                    <label>📅 TANGGAL RENCANA TANAM</label>
                    <input type="date" id="inputTglTanamJadwal" class="form-input">
                </div>
                <div class="form-group">
                    <label>🌱 UMUR VARIETAS PADI</label>
                    <select id="umurVarietasJadwal" class="form-select">
                        <option value="genjah">Genjah (< 95 Hari) — Cakrabuana, M70D</option>
                        <option value="sedang" selected>Sedang (95–115 Hari) — Ciherang, Inpari</option>
                        <option value="dalam">Dalam (≥ 116 Hari) — Varietas Lokal</option>
                    </select>
                </div>
                <button id="btnEksekusiJadwal" class="btn-main" style="background: ${WARNA_JADWAL}; color: #fff; font-weight: 700;">
                    BUAT JADWAL TANAM
                </button>
                <div id="hasilJadwalTanam" style="margin-top: 24px; display: none;"></div>
            `;
            card.appendChild(boxJadwal);

            document.getElementById('btnEksekusiJadwal').addEventListener('click', prosesJadwalMandiri);
        }
    }

    // --- 2. OVERRIDE SWITCHMODE AMAN ---
    var originalSwitchMode = window.switchMode;
    window.switchMode = function(mode) {
        if (typeof originalSwitchMode === 'function') {
            originalSwitchMode.apply(this, arguments);
        }
        
        var boxJadwal = document.getElementById('boxJadwalTanam');
        var tabJadwal = document.getElementById('tabJadwalTanam');
        var modeTitle = document.getElementById('modeTitle');
        var subtitleDisplay = document.getElementById('tabSubtitleDisplay');

        if (boxJadwal && tabJadwal) {
            if (mode === 'jadwaltanam') {
                // Sembunyikan semua box anak dari .card secara manual jika perlu
                Array.from(document.querySelector('.card').children).forEach(el => {
                    if (el.id && el.id.startsWith('box')) el.style.display = 'none';
                });
                
                boxJadwal.style.display = 'block';
                tabJadwal.classList.add('active');
                if (modeTitle) modeTitle.innerText = "Jadwal Tanam Cerdas";
                if (subtitleDisplay) subtitleDisplay.style.display = 'none';
            } else {
                boxJadwal.style.display = 'none';
                tabJadwal.classList.remove('active');
            }
        }
    };

    // --- 3. UTILITAS LOGIKA IKLIM & FASE BULAN ---
    function hitungFaseBulan(tgl) {
        var selisih = (tgl.getTime() - EPOCH_BULAN_MATI.getTime()) / (1000 * 60 * 60 * 24);
        var hari = selisih % SIKLUS_SINODIS;
        return hari < 0 ? hari + SIKLUS_SINODIS : hari;
    }

    function tambahHari(d, n) {
        var hasil = new Date(d);
        hasil.setDate(hasil.getDate() + n);
        return hasil;
    }

    async function prosesJadwalMandiri() {
        var tglInput = document.getElementById('inputTglTanamJadwal').value;
        var varInput = document.getElementById('umurVarietasJadwal').value;
        var hasilContainer = document.getElementById('hasilJadwalTanam');

        if (!tglInput) {
            alert('Silakan isi tanggal rencana tanam terlebih dahulu.');
            return;
        }

        hasilContainer.style.display = 'block';
        hasilContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: ${WARNA_JADWAL}; font-weight: bold;">⏳ Mengambil data koordinat & satelit cuaca...</div>`;

        try {
            var lat = -4.0, lon = 120.0; // Default jika gagal baca GPS
            if (window._koordinatTerakhir) {
                lat = window._koordinatTerakhir.coords.latitude;
                lon = window._koordinatTerakhir.coords.longitude;
            } else {
                try {
                    var pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout: 5000}));
                    lat = pos.coords.latitude; lon = pos.coords.longitude;
                } catch(e) { console.warn('GPS tidak aktif, menggunakan koordinat fallback.'); }
            }

            var ensoVal = typeof window.getENSOAnomaly === 'function' ? (await window.getENSOAnomaly()).latestAnomaly : 0;
            var iodVal = typeof window.getIODAnomaly === 'function' ? (await window.getIODAnomaly()).latestAnomaly : 0;

            var jadwalHTML = bangunHTMLJadwal(new Date(tglInput), varInput, ensoVal, iodVal);
            hasilContainer.innerHTML = jadwalHTML;

        } catch (err) {
            hasilContainer.innerHTML = `<div style="color: #ef4444; padding: 15px; background: rgba(239,68,68,0.1); border-radius: 8px;">Gagal memproses data: ${err.message}</div>`;
        }
    }

    // --- 4. PEMBENTUKAN JADWAL (Logika Hama & Fase) ---
    function bangunHTMLJadwal(tglTanam, varietas, ensoVal, iodVal) {
        var offset = {
            genjah: { pupuk1:7, pupuk2:28, pupuk3:45, insekt:20, fungisida:55, panen:90 },
            sedang: { pupuk1:7, pupuk2:30, pupuk3:55, insekt:25, fungisida:65, panen:110 },
            dalam:  { pupuk1:7, pupuk2:35, pupuk3:65, insekt:30, fungisida:75, panen:125 }
        }[varietas];

        var tglTikus = tambahHari(tglTanam, -10);
        var faseTikus = hitungFaseBulan(tglTikus);
        var peringatanTikus = (faseTikus > 13 && faseTikus < 18) ? 
            "Bulan terang, aktivitas tikus di luar liang menurun. Fokus umpan di mulut liang." : 
            "Bulan gelap, tikus sangat aktif. Efektivitas gropyokan & umpan racun maksimal.";

        var tglInsekt = tambahHari(tglTanam, offset.insekt);
        var faseInsekt = hitungFaseBulan(tglInsekt);
        var peringatanInsekt = (faseInsekt > 12 && faseInsekt < 17) ?
            "Puncak penerbangan ngengat Penggerek Batang Padi (PBP) karena bulan penuh. Waspada & tambah perangkap lampu!" :
            "Fase aman dari puncak migrasi ngengat PBP malam hari.";

        var daftarKegiatan = [
            { ikon: '🚜', nama: 'Pengolahan Lahan', tgl: tambahHari(tglTanam, -14), tips: 'Pastikan drainase dan luku siap.' },
            { ikon: '🐀', nama: 'Pengendalian Tikus Dasar', tgl: tglTikus, tips: peringatanTikus },
            { ikon: '🌾', nama: 'Tanam / Hambur', tgl: tglTanam, tips: 'Perhatikan ketersediaan air makro.' },
            { ikon: '🧪', nama: 'Pemupukan Tahap I', tgl: tambahHari(tglTanam, offset.pupuk1), tips: 'Kombinasi Urea & Phonska.' },
            { ikon: '💊', nama: 'Penyemprotan Insektisida', tgl: tglInsekt, tips: peringatanInsekt },
            { ikon: '🧪', nama: 'Pemupukan Tahap II', tgl: tambahHari(tglTanam, offset.pupuk2), tips: 'Pacu anakan maksimal, gunakan BWD.' },
            { ikon: '🍄', nama: 'Penyemprotan Fungisida', tgl: tambahHari(tglTanam, offset.fungisida), tips: 'Pencegahan Blast menjelang masa bunting.' },
            { ikon: '🌟', nama: 'Estimasi Panen', tgl: tambahHari(tglTanam, offset.panen), tips: 'Keringkan petakan seminggu sebelum taksiran.' }
        ];

        window._dataExportJadwal = daftarKegiatan;

        var html = '<div style="display:flex; flex-direction:column; gap:12px;">';
        daftarKegiatan.forEach((k, i) => {
            html += `
                <div style="background: var(--card-bg); border: 1px solid rgba(255,255,255,0.05); padding: 14px; border-radius: 12px; border-left: 4px solid ${WARNA_JADWAL};">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="font-size: 22px;">${k.ikon}</div>
                        <div>
                            <div style="font-size: 0.75rem; color: ${WARNA_JADWAL}; font-weight: 700;">KEGIATAN ${i+1}</div>
                            <div style="font-size: 1rem; color: #fff; font-weight: 600; margin: 4px 0;">${k.nama}</div>
                            <div style="font-size: 0.85rem; color: #10b981; margin-bottom: 6px;">📅 ${k.tgl.getDate()} ${NAMA_BULAN[k.tgl.getMonth()]} ${k.tgl.getFullYear()}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">${k.tips}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `<button onclick="window._salinJadwalTanam()" class="btn-main" style="background: transparent; color: ${WARNA_JADWAL}; border: 1px solid ${WARNA_JADWAL}; margin-top: 10px;">SALIN JADWAL KE TEKS</button>`;
        html += '</div>';
        return html;
    }

    window._salinJadwalTanam = function() {
        if (!window._dataExportJadwal) return;
        var teks = "*JADWAL KEGIATAN TANI DIGITAL*\n\n";
        window._dataExportJadwal.forEach(function(k, i) {
            teks += (i+1) + ". " + k.nama + "\n";
            teks += "   Tanggal: " + k.tgl.getDate() + " " + NAMA_BULAN[k.tgl.getMonth()] + " " + k.tgl.getFullYear() + "\n";
            teks += "   Catatan: " + k.tips + "\n\n";
        });
        navigator.clipboard.writeText(teks).then(() => {
            alert("Jadwal berhasil disalin!");
        }).catch(() => {
            alert("Gagal menyalin jadwal.");
        });
    };

    // --- JALANKAN INISIALISASI SETELAH DOM SIAP ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();
