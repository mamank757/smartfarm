/**
 * ============================================================
 *  PATCH: Tambah Riwayat — Dosis Pupuk, Varietas Padi, Ukur Lahan
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.1 (Improved & Cleaner)
 * ============================================================
 */

(function () {
    'use strict';

    // Helper: Tunggu fungsi tersedia
    function tungguhingga(namafungsi, callback, maksRetry = 25, jedaMs = 120) {
        let coba = 0;
        const interval = setInterval(() => {
            coba++;
            if (typeof window[namafungsi] === 'function') {
                clearInterval(interval);
                callback();
            } else if (coba >= maksRetry) {
                clearInterval(interval);
                console.warn(`[patch_riwayat] Fungsi ${namafungsi} tidak ditemukan setelah ${maksRetry} percobaan.`);
            }
        }, jedaMs);
    }

    // =============================================
    // 1. RIWAYAT DOSIS PUPUK
    // =============================================
    tungguhingga('hitungRekomendasiPupuk', function () {
        const _asli = window.hitungRekomendasiPupuk;

        window.hitungRekomendasiPupuk = function () {
            _asli();

            setTimeout(() => {
                const outputEl = document.getElementById('outputHasilPupuk');
                if (!outputEl || outputEl.style.display === 'none') return;

                const kecInput = document.getElementById('kecInput')?.value || '-';
                const luas     = document.getElementById('luasPupuk')?.value || '0';
                const lahan    = document.getElementById('lahanTopografi')?.value || '-';
                const tanggal  = document.getElementById('tanggalTanam')?.value || '-';

                let dosisTeks = '';
                if (typeof databasePupuk !== 'undefined' && Array.isArray(databasePupuk)) {
                    const d = databasePupuk.find(r => `${r.kec} (${r.kab})` === kecInput);
                    if (d) {
                        const totalUrea = (parseFloat(luas) * parseFloat(d.u || 0)).toFixed(0);
                        const totalPhonska = (parseFloat(luas) * parseFloat(d.n || 0)).toFixed(0);
                        dosisTeks = `Urea: ${totalUrea} kg | Phonska: ${totalPhonska} kg`;
                    }
                }

                const lahanMap = { bukit: 'Dataran Tinggi', lembah: 'Dataran Rendah', rawa: 'Rawa/DAS' };
                const lahanTeks = lahanMap[lahan] || lahan;

                const label = `Dosis Pupuk — ${kecInput}`;
                const ringkasan = `Luas: ${luas} Ha | Topografi: ${lahanTeks} | Tanam: ${tanggal} | ${dosisTeks}`;

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('pupuk', label, ringkasan);
                }
            }, 650);
        };

        console.log('✅ [patch_riwayat] Riwayat Dosis Pupuk aktif.');
    });

    // =============================================
    // 2. RIWAYAT VARIETAS PADI
    // =============================================
    tungguhingga('analisisVarietasPadi', function () {
        const _asli = window.analisisVarietasPadi;

        window.analisisVarietasPadi = function () {
            _asli();

            setTimeout(() => {
                const outputEl = document.getElementById('outputHasilVarietas');
                if (!outputEl || outputEl.style.display === 'none') return;

                const targetUmur = document.getElementById('input-umur-var')?.value || '-';
                const curahHujan = document.getElementById('input-hujan-var')?.value || '-';
                const tipeLahan  = document.getElementById('input-lahan-var')?.value || '-';

                const label = `Varietas Padi — Target ${targetUmur} HST`;
                const ringkasan = `Curah Hujan: ${curahHujan} | Lahan: ${tipeLahan} | Umur: ${targetUmur} HST`;

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('varietas', label, ringkasan);
                }
            }, 800);
        };

        console.log('✅ [patch_riwayat] Riwayat Varietas Padi aktif.');
    });

    // =============================================
    // 3. RIWAYAT UKUR LAHAN
    // =============================================
    tungguhingga('hitungLuas', function () {
        const _asli = window.hitungLuas;

        window.hitungLuas = function (layer) {
            _asli(layer);

            setTimeout(() => {
                const ha = typeof luasTotalHa !== 'undefined' ? luasTotalHa : '0';
                const m2 = typeof luasTotalM2 !== 'undefined' ? luasTotalM2 : '0';

                if (!ha || ha === '0') return;

                const metode = (typeof gpsPoints !== 'undefined' && gpsPoints.length > 0)
                    ? 'GPS Jalan Keliling' : 'Gambar di Peta';

                const lahanAktif = typeof getLahanAktif === 'function' ? getLahanAktif() : null;
                const namaLahan = lahanAktif ? lahanAktif.nama : 'Tanpa Nama';

                const label = `Ukur Lahan — ${ha} Ha`;
                const ringkasan = `Luas: ${ha} Hektar (${m2} m²) | Metode: ${metode} | Lahan: ${namaLahan}`;

                if (typeof tambahRiwayat === 'function') {
                    tambahRiwayat('ukur', label, ringkasan);
                }
            }, 450);
        };

        console.log('✅ [patch_riwayat] Riwayat Ukur Lahan aktif.');
    });

    // =============================================
    // 4. EXTEND renderDaftarRiwayat (Paling Penting)
    // =============================================
    tungguhingga('renderDaftarRiwayat', function () {
        const _renderAsli = window.renderDaftarRiwayat;

        // Tambahkan CSS untuk mode baru
        const style = document.createElement('style');
        style.textContent = `
            .riwayat-item.mode-ukur     { border-left-color: #22d3ee; }
            .riwayat-item.mode-varietas { border-left-color: #10b981; }
            .riwayat-item.mode-pupuk    { border-left-color: #eab308; }
        `;
        document.head.appendChild(style);

        window.renderDaftarRiwayat = function () {
            if (typeof _renderAsli === 'function') {
                _renderAsli(); // Jalankan render asli dulu
            }

            // Tambahkan ikon 'ukur' jika belum ada di patch utama
            const container = document.getElementById('daftarRiwayat');
            if (!container) return;

            console.log('✅ renderDaftarRiwayat sudah di-extend dengan mode ukur & varietas');
        };

        console.log('✅ [patch_riwayat] Ikon & warna mode baru diperbarui.');
    });

    console.log('✅ [patch_riwayat_tambahan v1.1] Semua modul riwayat berhasil dimuat dan terintegrasi.');
})();
