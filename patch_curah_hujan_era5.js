// ============================================================
//  PATCH: Perbaikan Akumulasi Curah Hujan ERA5
//
//  MASALAH YANG DIPERBAIKI:
//  1. ERA5 punya delay 5-7 hari → end_date=kemarin sering null
//  2. (nilai || 0) menyamakan null dengan "tidak hujan"
//     → Total akumulasi jadi lebih kecil dari kenyataan
//
//  CARA PASANG:
//  Tambahkan tag <script src="patch_curah_hujan_era5.js"></script>
//  di bagian bawah HTML, SETELAH semua script lain.
//  Patch ini akan override fungsi loadWeather() secara otomatis
//  hanya pada bagian urlArchive dan kalkulasi rainMonthly.
//
//  TIDAK PERLU mengubah apapun di file HTML utama.
// ============================================================

(function() {

    // ── KONSTANTA DELAY ERA5 ────────────────────────────────
    // ERA5 diperbarui dengan keterlambatan 5-7 hari dari ECMWF
    // Kita pakai 8 hari sebagai batas aman (buffer +1 hari)
    const ERA5_DELAY_HARI = 8;

    // Rentang data yang diambil: 30 hari valid ERA5
    // start = 30 hari + delay dari hari ini
    // end   = delay hari dari hari ini (batas aman tersedia)
    const ERA5_RENTANG_HARI = 30;

    // ── FUNGSI BANTU: Format Tanggal ───────────────────────
    // Sama persis dengan getFormatTanggal() di HTML utama
    // tapi dibuat lokal agar patch berdiri sendiri
    function formatTanggalERA5(selisihHari) {
        const d = new Date();
        d.setDate(d.getDate() - selisihHari);
        return d.toISOString().split('T')[0];
    }

    // ── FUNGSI BANTU: Hitung Akumulasi Aman ───────────────
    // Filter null/undefined sebelum menjumlahkan
    // Kembalikan objek { total, jumlahHari, persenData }
    function hitungAkumulasiAman(listHujan) {
        if (!Array.isArray(listHujan) || listHujan.length === 0) {
            return { total: 0, jumlahHari: 0, persenData: 0 };
        }

        const dataValid = listHujan.filter(
            v => v !== null && v !== undefined && !isNaN(v)
        );

        const total = dataValid.reduce((acc, val) => acc + val, 0);
        const jumlahHari = dataValid.length;
        const persenData = Math.round((jumlahHari / listHujan.length) * 100);

        return { total, jumlahHari, persenData };
    }

    // ── FUNGSI BANTU: Render Label Akumulasi ──────────────
    // Tampilkan total + info hari valid + badge kelengkapan data
    function renderLabelAkumulasi(total, jumlahHari, persenData) {
        // Warna badge berdasarkan kelengkapan data
        let warnaBadge, labelBadge;
        if (persenData >= 90) {
            warnaBadge = 'var(--accent-green)';
            labelBadge = `${persenData}% data lengkap`;
        } else if (persenData >= 70) {
            warnaBadge = 'var(--accent-soil)';
            labelBadge = `${persenData}% data tersedia`;
        } else {
            warnaBadge = 'var(--red-alert)';
            labelBadge = `${persenData}% — data parsial`;
        }

        return `<b>${total.toFixed(1)} mm</b>` +
            `<br><small style="` +
                `display:inline-block;` +
                `margin-top:3px;` +
                `font-size:0.65rem;` +
                `color:${warnaBadge};` +
                `opacity:0.8;` +
            `">` +
            `${jumlahHari} hari • ${labelBadge}` +
            `</small>`;
    }

    // ── OVERRIDE UTAMA ─────────────────────────────────────
    // Kita intercept window.fetch khusus untuk request archive
    // agar tidak perlu mengubah loadWeather() secara langsung.
    //
    // Cara kerja:
    // 1. Simpan fetch asli
    // 2. Bungkus dengan versi baru
    // 3. Jika URL mengandung "archive-api.open-meteo.com",
    //    ganti start_date dan end_date sebelum dikirim
    // 4. Setelah response diterima, proses rainMonthly
    //    dengan kalkulasi yang benar
    // ──────────────────────────────────────────────────────
    const _fetchAsli = window.fetch;

    window.fetch = async function(input, init) {
        let url = (typeof input === 'string') ? input : input.url || String(input);

        // Hanya intercept request ke Open-Meteo Archive
        if (url.includes('archive-api.open-meteo.com')) {

            // ── Ganti tanggal agar selalu dalam rentang aman ERA5
            const startBaru = formatTanggalERA5(ERA5_RENTANG_HARI + ERA5_DELAY_HARI);
            const endBaru   = formatTanggalERA5(ERA5_DELAY_HARI);

            // Parse URL dan ganti parameter tanggal
            try {
                const urlObj = new URL(url);
                urlObj.searchParams.set('start_date', startBaru);
                urlObj.searchParams.set('end_date',   endBaru);
                url = urlObj.toString();

                console.log(
                    '%c📅 [ERA5] URL tanggal diperbarui (delay-safe)',
                    'color:#3b82f6; font-weight:bold;'
                );
                console.log(`   Start: ${startBaru}  →  End: ${endBaru}`);
                console.log(`   (${ERA5_RENTANG_HARI} hari valid, buffer ${ERA5_DELAY_HARI} hari dari hari ini)`);
            } catch(e) {
                console.warn('[ERA5 patch] Gagal parse URL:', e.message);
            }

            // Panggil fetch asli dengan URL yang sudah diperbaiki
            const response = await _fetchAsli(url, init);

            // Clone response agar bisa dibaca dua kali
            // (sekali oleh patch ini, sekali oleh loadWeather asli)
            const responseClone = response.clone();

            // Proses data secara async, lalu update UI rainMonthly
            responseClone.json().then(data => {
                const listHujan = data?.daily?.precipitation_sum;
                if (!listHujan) return;

                const { total, jumlahHari, persenData } =
                    hitungAkumulasiAman(listHujan);

                // Tunggu sebentar agar loadWeather() selesai dulu
                // render elemen rainMonthly sebelum kita override
                setTimeout(() => {
                    const elRain = document.getElementById('rainMonthly');
                    if (elRain) {
                        elRain.innerHTML = renderLabelAkumulasi(
                            total, jumlahHari, persenData
                        );

                        console.log(
                            '%c🌧️ [ERA5] Akumulasi curah hujan diperbarui',
                            'color:#10b981; font-weight:bold;'
                        );
                        console.table({
                            'Total (mm)':       total.toFixed(1),
                            'Hari valid':        jumlahHari,
                            'Kelengkapan data':  persenData + '%',
                            'Rentang':           `${startBaru} s/d ${endBaru}`
                        });
                    }
                }, 800); // 800ms: cukup untuk loadWeather() selesai render
            }).catch(e => {
                console.warn('[ERA5 patch] Gagal parse JSON archive:', e.message);
            });

            return response; // Kembalikan response asli ke loadWeather()
        }

        // Semua request lain: lewatkan tanpa perubahan
        return _fetchAsli(input, init);
    };

    console.log(
        '%c✅ [patch_curah_hujan_era5.js] Aktif',
        'color:#10b981; font-weight:bold; font-size:12px;',
        `\n   ERA5 delay buffer: ${ERA5_DELAY_HARI} hari`,
        `\n   Rentang data: ${ERA5_RENTANG_HARI} hari valid`
    );

})(); // IIFE — tidak mencemari global scope
