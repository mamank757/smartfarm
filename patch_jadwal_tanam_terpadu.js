/**
 * ============================================================
 * PATCH: patch_jadwal_tanam_otomatis.js
 * Versi: 9.2 — SKALA NASIONAL (PURE DYNAMIC ZOM READER)
 * ============================================================
 */
(function () {
    'use strict';

    var WARNA_TEMA = '#0ea5e9'; 
    var EPOCH_BULAN_MATI = new Date('2026-01-29T12:36:00Z');
    var SIKLUS_SINODIS   = 29.53059;
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    // =========================================================================
    //  1. PEMBACA PARAMETER ZOM NASIONAL DARI HTML
    // =========================================================================
    function bacaZOMDariDOM() {
        // Cek elemen HTML penampung data iklim/ZOM dari patch BMKG
        // Sesuaikan ID elemen ini dengan yang ada di aplikasimu!
        var containerIklim = document.getElementById('data-iklim-nasional'); 
        
        var defaultData = {
            tglAnchor: new Date(), // Fallback ke hari ini jika gagal
            curahHujan: 50,
            hama: "Hama Umum",
            varietas: "sedang",
            narasi: "Menunggu data ZOM lokal..."
        };

        if (!containerIklim) {
            console.warn("⚠️ Elemen #data-iklim-nasional tidak ditemukan. Pastikan patch API BMKG/BOM sudah memuat data ke DOM.");
            return defaultData;
        }

        // Ekstraksi atribut data dari HTML
        var tglTanamZOM = containerIklim.getAttribute('data-tgl-tanam-ideal'); // Format: YYYY-MM-DD
        var curahHujan = parseInt(containerIklim.getAttribute('data-curah-hujan-persen')) || 50;
        var risikoHama = containerIklim.getAttribute('data-risiko-hama') || "Ulat Grayak, Hama Putih Palsu";
        var rekomVarietas = containerIklim.getAttribute('data-rekomendasi-varietas') || "sedang";
        var narasiZOM = containerIklim.getAttribute('data-narasi-zom') || "Patuhi kalender tanam lokal.";

        return {
            tglAnchor: tglTanamZOM ? new Date(tglTanamZOM) : new Date(),
            curahHujan: curahHujan,
            hama: risikoHama,
            varietas: rekomVarietas,
            narasi: narasiZOM
        };
    }

    // =========================================================================
    //  2. KALKULASI FASE BULAN (MICRO-TIMING)
    // =========================================================================
    function hariFaseBulan(tanggal) {
        var selisih = (tanggal.getTime() - EPOCH_BULAN_MATI.getTime()) / (1000 * 60 * 60 * 24);
        var hari = selisih % SIKLUS_SINODIS; return hari < 0 ? hari + SIKLUS_SINODIS : hari;
    }
    function tambahHari(d, n) { var hasil = new Date(d); hasil.setDate(hasil.getDate() + n); return hasil; }

    function sinkronisasiFaseBulan(tglAnchor, varietasTerpilih) {
        var offsetInsek = { genjah: 20, sedang: 25, dalam: 30 }[varietasTerpilih] || 25;
        var tglTanamSistem = tglAnchor;
        
        // Cukup geser 0 - 15 hari dari tanggal ideal ZOM untuk mencari fase bulan yang aman
        for(var i = 0; i <= 15; i++) {
            var ujiTglTanam = tambahHari(tglAnchor, i);
            var ujiTglInsek = tambahHari(ujiTglTanam, offsetInsek);
            var faseBulanSaatInsek = hariFaseBulan(ujiTglInsek);
            
            // Fase gelap (0-11 atau 18-29), hindari purnama (12-17)
            if (faseBulanSaatInsek <= 11 || faseBulanSaatInsek >= 18) {
                tglTanamSistem = ujiTglTanam;
                break; 
            }
        }
        return tglTanamSistem;
    }

    // =========================================================================
    //  3. EKSEKUSI & RENDER UI
    // =========================================================================
    function prosesKalkulasiOtomatis() {
        var konten = document.getElementById('kontenJadwalOtomatis');
        if (!konten) return;

        try {
            // 1. Tarik parameter iklim spesifik koordinat manapun di Indonesia dari DOM
            var dataZOM = bacaZOMDariDOM();
            
            // 2. Kalibrasi tanggal jangkar ZOM dengan siklus bulan
            var tanggalTanamFinal = sinkronisasiFaseBulan(dataZOM.tglAnchor, dataZOM.varietas);
            
            // 3. Render
            konten.innerHTML = produksiHTMLJadwal(tanggalTanamFinal, dataZOM);

        } catch (err) {
            konten.innerHTML = `<div style="color: #ef4444; padding: 12px;">Gagal memproses data ZOM Nasional: ${err.message}</div>`;
        }
    }

    function produksiHTMLJadwal(tglTanam, dataLokal) {
        var konfigHST = {
            genjah: { pupuk1: 7, pupuk2: 28, insektisida: 20, fungisida: 55, panen: 90 },
            sedang: { pupuk1: 7, pupuk2: 30, insektisida: 25, fungisida: 65, panen: 110 },
            dalam:  { pupuk1: 7, pupuk2: 35, insektisida: 30, fungisida: 75, panen: 125 }
        }[dataLokal.varietas] || { pupuk1: 7, pupuk2: 30, insektisida: 25, fungisida: 65, panen: 110 };

        var tglOlahLahan = tambahHari(tglTanam, -14);
        var tglGropyokan = tambahHari(tglTanam, -7);
        var hariIni = new Date(); hariIni.setHours(0,0,0,0);

        var susunanLangkah = [
            { ikon: '🚜', nama: 'Pengolahan Lahan', tgl: tglOlahLahan, detail: 'Lakukan pembajakan dalam membalik tanah.' },
            { ikon: '🐀', nama: 'Mitigasi Hama Dasar', tgl: tglGropyokan, detail: `Fokus: <strong>${dataLokal.hama.split(',')[0]}</strong>.` },
            { ikon: '🌾', nama: 'Penanaman Serempak', tgl: tglTanam, detail: 'Ketat mengikuti batas ZOM & siklus sinodis.' },
            { ikon: '🧪', nama: 'Pemupukan NPK (Dasar)', tgl: tambahHari(tglTanam, konfigHST.pupuk1), detail: 'Pemberian pupuk dasar.' },
            { ikon: '💊', nama: 'Fase Kritis & Insektisida', tgl: tambahHari(tglTanam, konfigHST.insektisida), detail: `Waspada <strong>${dataLokal.hama}</strong>.` },
            { ikon: '🧪', nama: 'Pemupukan Tahap II', tgl: tambahHari(tglTanam, konfigHST.pupuk2), detail: 'Gunakan Bagan Warna Daun (BWD).' },
            { ikon: '🍄', nama: 'Fungisida & Pencegahan', tgl: tambahHari(tglTanam, konfigHST.fungisida), detail: 'Semprot anti-jamur sistemik.' },
            { ikon: '🌟', nama: 'Estimasi Panen', tgl: tambahHari(tglTanam, konfigHST.panen), detail: 'Keringkan sawah 10 hari sebelum panen.' }
        ];

        var html = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
                🌍 <strong>Parameter ZOM Aktif:</strong><br>
                💡 <strong>Rekomendasi Agronomi:</strong> ${dataLokal.narasi}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
        `;

        susunanLangkah.forEach(function(item, indeks) {
            // ... [Kode render susunan langkah sama seperti versi sebelumnya] ...
            var strTgl = ("0" + item.tgl.getDate()).slice(-2) + ' ' + NAMA_BULAN[item.tgl.getMonth()] + ' ' + item.tgl.getFullYear();
            var isTerlambat = (item.tgl < hariIni);
            var styleBorder = isTerlambat ? 'border-left: 4px solid #ef4444; opacity: 0.85;' : (indeks === 2 ? 'border-left: 6px solid #f59e0b; background: rgba(245, 158, 11, 0.08);' : `border-left: 4px solid ${WARNA_TEMA};`);
            var labelLangkah = isTerlambat ? `⚠️ TERLEWAT ${Math.round((hariIni - item.tgl) / 86400000)} HARI` : `LANGKAH ${indeks + 1}`;
            var warnaLabel = isTerlambat ? '#ef4444' : (indeks === 2 ? '#f59e0b' : WARNA_TEMA);

            html += `
                <div style="padding: 14px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); background: var(--color-background-secondary, #1e293b); ${styleBorder}">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="font-size: 24px; padding-top: 2px;">${item.ikon}</div>
                        <div style="flex: 1;">
                            <div style="font-size: 11px; color: ${warnaLabel}; font-weight: 700;">${labelLangkah}</div>
                            <div style="font-size: 15px; font-weight: 600; color: #fff; margin: 2px 0;">${item.nama}</div>
                            <div style="font-size: 13px; color: #10b981; font-weight: 600; margin-bottom: 6px;">📅 ${strTgl}</div>
                            <div style="font-size: 12.5px; color: #94a3b8;">${item.detail}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>'; return html;
    }
})();
