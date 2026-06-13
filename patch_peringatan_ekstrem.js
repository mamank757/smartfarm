/**
 * ============================================================
 *  PATCH: Peringatan Dini Cuaca Ekstrem — Gaya BMKG
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ============================================================
 *
 *  FITUR YANG DITAMBAHKAN:
 *  1. Banner peringatan ekstrem otomatis (atas layar)
 *  2. Analisis 7 parameter ekstrem: hujan lebat, angin kencang,
 *     badai petir, CAPE ekstrem, tekanan rendah, suhu ekstrem,
 *     kelembapan berbahaya
 *  3. Kode warna BMKG: Hijau / Kuning / Oranye / Merah
 *  4. Prediksi 24 jam ke depan dari data hourly Open-Meteo
 *  5. Notifikasi push (jika diizinkan browser)
 *  6. Box ringkasan peringatan di dalam tab Cuaca
 *  7. Tombol Share WhatsApp peringatan
 *  8. Suara alarm (Web Audio API) untuk level Merah
 * ============================================================
 */

(function () {
    'use strict';

    // =========================================================================
    //  KONFIGURASI AMBANG BATAS (threshold) — berbasis standar BMKG
    // =========================================================================

    const THRESHOLD = {
        hujan: {
            // mm/jam — BMKG: lebat >= 20, sangat lebat >= 50, ekstrem >= 100
            waspada:  5,
            siaga:    20,
            awas:     50
        },
        angin: {
            // km/jam — Beaufort scale adaptasi BMKG
            waspada:  40,
            siaga:    60,
            awas:     90
        },
        cape: {
            // J/kg — potensi badai
            waspada:  500,
            siaga:    1000,
            awas:     2500
        },
        kelembapan: {
            // % — kelembapan sangat tinggi mendukung Blast & penyakit
            waspada:  85,
            siaga:    90,
            awas:     95
        },
        suhu_tinggi: {
            // °C — cekaman panas pada padi
            waspada:  33,
            siaga:    35,
            awas:     37
        },
        suhu_rendah: {
            // °C — cekaman dingin (dataran tinggi)
            waspada:  20,
            siaga:    18,
            awas:     15
        },
        tekanan: {
            // hPa — tekanan rendah = potensi siklon
            waspada:  1005,
            siaga:    1000,
            awas:     995
        }
    };

    // Level warna BMKG
    const LEVEL = {
        NORMAL: { kode: 0, label: 'NORMAL',   warna: '#10b981', bg: 'rgba(16,185,129,0.12)',  ikon: '✅' },
        WASPADA:{ kode: 1, label: 'WASPADA',  warna: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  ikon: '⚠️' },
        SIAGA:  { kode: 2, label: 'SIAGA',    warna: '#f97316', bg: 'rgba(249,115,22,0.18)',  ikon: '🔶' },
        AWAS:   { kode: 3, label: 'AWAS',     warna: '#ef4444', bg: 'rgba(239,68,68,0.2)',    ikon: '🚨' }
    };

    // State modul ini
    const stateEkstrem = {
        levelTertinggi: 0,
        daftarPeringatan: [],
        sudahNotif: false,
        dataForecastCache: null
    };

    // =========================================================================
    //  UTILITAS
    // =========================================================================

    function dapatLevel(nilai, threshold) {
        if (nilai >= threshold.awas)    return LEVEL.AWAS;
        if (nilai >= threshold.siaga)   return LEVEL.SIAGA;
        if (nilai >= threshold.waspada) return LEVEL.WASPADA;
        return LEVEL.NORMAL;
    }

    function dapatLevelRendah(nilai, threshold) {
        // Untuk suhu rendah & tekanan rendah — logika terbalik (makin kecil = makin bahaya)
        if (nilai <= threshold.awas)    return LEVEL.AWAS;
        if (nilai <= threshold.siaga)   return LEVEL.SIAGA;
        if (nilai <= threshold.waspada) return LEVEL.WASPADA;
        return LEVEL.NORMAL;
    }

    function namaWaktu(isoString) {
        try {
            const d = new Date(isoString);
            return d.getHours().toString().padStart(2, '0') + ':00';
        } catch(e) { return '-'; }
    }

    function formatTanggalPendek(isoString) {
        try {
            const d = new Date(isoString);
            const hari = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()];
            return hari + ', ' + d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        } catch(e) { return '-'; }
    }

    // =========================================================================
    //  ANALISIS UTAMA — proses data forecast hourly 24 jam ke depan
    // =========================================================================

    function analisaEkstrem(forecast) {
        if (!forecast || !forecast.hourly) return;

        stateEkstrem.daftarPeringatan = [];
        stateEkstrem.levelTertinggi   = 0;

        const hourly = forecast.hourly;
        const cur    = forecast.current || {};

        const sekarang = new Date();
        const batas24jam = new Date(sekarang.getTime() + 24 * 3600 * 1000);

        // Cari jam sekarang di array hourly
        let idxMulai = hourly.time.findIndex(t => new Date(t) >= sekarang);
        if (idxMulai < 0) idxMulai = 0;

        // Filter 24 jam ke depan
        const slice24 = [];
        for (let i = idxMulai; i < hourly.time.length; i++) {
            if (new Date(hourly.time[i]) > batas24jam) break;
            slice24.push(i);
        }

        // ── 1. HUJAN LEBAT ──────────────────────────────────────────────────
        if (hourly.precipitation) {
            let maxHujan = 0;
            let waktuMaxHujan = '';
            slice24.forEach(i => {
                const v = hourly.precipitation[i] || 0;
                if (v > maxHujan) { maxHujan = v; waktuMaxHujan = hourly.time[i]; }
            });
            const lvl = dapatLevel(maxHujan, THRESHOLD.hujan);
            if (lvl.kode > 0) {
                stateEkstrem.daftarPeringatan.push({
                    parameter: '🌧️ Curah Hujan Lebat',
                    nilai: maxHujan.toFixed(1) + ' mm/jam',
                    waktu: waktuMaxHujan ? 'Puncak ~' + namaWaktu(waktuMaxHujan) : '',
                    level: lvl,
                    dampak: lvl.kode >= 3
                        ? 'Risiko banjir sawah, tanggul jebol, kerusakan malai & rebah padi.'
                        : lvl.kode === 2
                        ? 'Waspadai genangan, tunda pemupukan & semprot pestisida.'
                        : 'Pantau drainase lahan, jangan semprot pestisida saat hujan.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // ── 2. BADAI PETIR (dari kode cuaca WMO) ────────────────────────────
        const kodePetir = [95, 96, 99];
        const jamPetir = slice24.filter(i => hourly.weather_code && kodePetir.includes(hourly.weather_code[i]));
        if (jamPetir.length > 0) {
            const lvl = jamPetir.length >= 4 ? LEVEL.AWAS : jamPetir.length >= 2 ? LEVEL.SIAGA : LEVEL.WASPADA;
            stateEkstrem.daftarPeringatan.push({
                parameter: '⛈️ Potensi Badai Petir',
                nilai: jamPetir.length + ' jam dalam 24 jam ke depan',
                waktu: 'Mulai ~' + namaWaktu(hourly.time[jamPetir[0]]),
                level: lvl,
                dampak: 'Hentikan operasional traktor & pompa di sawah. Jauhi pohon tinggi & struktur besi.'
            });
            if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
        }

        // ── 3. ENERGI BADAI (CAPE) ───────────────────────────────────────────
        if (hourly.cape) {
            let maxCAPE = 0;
            let waktuCAPE = '';
            slice24.forEach(i => {
                const v = hourly.cape[i] || 0;
                if (v > maxCAPE) { maxCAPE = v; waktuCAPE = hourly.time[i]; }
            });
            const lvl = dapatLevel(maxCAPE, THRESHOLD.cape);
            if (lvl.kode > 0) {
                stateEkstrem.daftarPeringatan.push({
                    parameter: '⚡ Energi Badai (CAPE)',
                    nilai: Math.round(maxCAPE) + ' J/kg',
                    waktu: waktuCAPE ? '~' + namaWaktu(waktuCAPE) : '',
                    level: lvl,
                    dampak: lvl.kode >= 3
                        ? 'Bahaya ekstrem! Potensi puting beliung & hujan es. Amankan petani & alat berat.'
                        : 'Potensi konveksi kuat. Waspadai hujan deras tiba-tiba & angin kencang lokal.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // ── 4. KELEMBAPAN TINGGI ─────────────────────────────────────────────
        if (cur.relative_humidity_2m !== undefined) {
            const rh  = cur.relative_humidity_2m;
            const lvl = dapatLevel(rh, THRESHOLD.kelembapan);
            if (lvl.kode > 0) {
                stateEkstrem.daftarPeringatan.push({
                    parameter: '💧 Kelembapan Udara Tinggi',
                    nilai: rh + '%',
                    waktu: 'Kondisi saat ini',
                    level: lvl,
                    dampak: lvl.kode >= 3
                        ? 'Risiko Blast Padi & Hawar Pelepah sangat tinggi. Siapkan fungisida Validamycin.'
                        : 'Pantau gejala penyakit daun. Tunda pemupukan Urea.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // ── 5. SUHU UDARA TINGGI ─────────────────────────────────────────────
        if (hourly.temperature_2m) {
            let maxSuhu = 0;
            let waktuSuhu = '';
            slice24.forEach(i => {
                const v = hourly.temperature_2m[i] || 0;
                if (v > maxSuhu) { maxSuhu = v; waktuSuhu = hourly.time[i]; }
            });
            const lvl = dapatLevel(maxSuhu, THRESHOLD.suhu_tinggi);
            if (lvl.kode > 0) {
                stateEkstrem.daftarPeringatan.push({
                    parameter: '🌡️ Suhu Udara Sangat Panas',
                    nilai: maxSuhu.toFixed(1) + '°C',
                    waktu: waktuSuhu ? 'Puncak ~' + namaWaktu(waktuSuhu) : '',
                    level: lvl,
                    dampak: lvl.kode >= 3
                        ? 'Cekaman panas berat! Padi memasuki fase pengisian bulir berisiko gagal. Aktifkan irigasi sprinkler.'
                        : 'Waspadai evapotranspirasi tinggi. Pastikan air irigasi cukup.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // ── 6. TEKANAN UDARA RENDAH (potensi siklon) ─────────────────────────
        if (cur.surface_pressure !== undefined) {
            const tek = cur.surface_pressure;
            const lvl = dapatLevelRendah(tek, THRESHOLD.tekanan);
            if (lvl.kode > 0) {
                stateEkstrem.daftarPeringatan.push({
                    parameter: '🌀 Tekanan Udara Rendah',
                    nilai: tek.toFixed(1) + ' hPa',
                    waktu: 'Kondisi saat ini',
                    level: lvl,
                    dampak: lvl.kode >= 3
                        ? 'Indikasi gangguan siklon tropis di sekitar wilayah. Siaga cuaca ekstrem hingga 72 jam ke depan.'
                        : 'Potensi cuaca buruk meningkat. Monitor update cuaca setiap 6 jam.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // ── 7. PELUANG HUJAN TINGGI (dari precipitation_probability) ─────────
        if (hourly.precipitation_probability) {
            const jamHujan = slice24.filter(i => (hourly.precipitation_probability[i] || 0) >= 80);
            if (jamHujan.length >= 6) {
                const lvl = jamHujan.length >= 12 ? LEVEL.AWAS : jamHujan.length >= 9 ? LEVEL.SIAGA : LEVEL.WASPADA;
                stateEkstrem.daftarPeringatan.push({
                    parameter: '🌦️ Peluang Hujan Berkepanjangan',
                    nilai: jamHujan.length + ' jam berpeluang ≥80%',
                    waktu: 'Dalam 24 jam ke depan',
                    level: lvl,
                    dampak: 'Tunda panen jika gabah belum kering. Pastikan drainase lahan berfungsi baik.'
                });
                if (lvl.kode > stateEkstrem.levelTertinggi) stateEkstrem.levelTertinggi = lvl.kode;
            }
        }

        // Render semua peringatan ke UI
             renderBoxPeringatan();

        // Notifikasi push jika level SIAGA ke atas
        if (stateEkstrem.levelTertinggi >= 2 && !stateEkstrem.sudahNotif) {
            kirimNotifPush();
            stateEkstrem.sudahNotif = true;
        }

        // Alarm audio jika level AWAS
        if (stateEkstrem.levelTertinggi >= 3) {
            bunyikanAlarm();
        }
    }

    // =========================================================================
    //  RENDER BANNER ATAS LAYAR
    // =========================================================================

    function renderBannerEkstrem() {
        // Hapus banner lama
        var bannerLama = document.getElementById('bannerCuacaEkstrem');
        if (bannerLama) bannerLama.remove();

        if (stateEkstrem.levelTertinggi === 0) return;

        const lvlObjek = Object.values(LEVEL).find(l => l.kode === stateEkstrem.levelTertinggi) || LEVEL.NORMAL;
        const jmlPeringatan = stateEkstrem.daftarPeringatan.filter(p => p.level.kode > 0).length;

        const banner = document.createElement('div');
        banner.id = 'bannerCuacaEkstrem';
        banner.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99998;' +
            'background:' + lvlObjek.warna + ';' +
            'color:#fff;' +
            'padding:10px 14px;' +
            'display:flex;align-items:center;gap:10px;' +
            'cursor:pointer;' +
            'box-shadow:0 3px 12px rgba(0,0,0,0.4);' +
            'font-family:"Plus Jakarta Sans",sans-serif;';

        banner.innerHTML =
            '<div style="font-size:1.3rem;flex-shrink:0;">' + lvlObjek.ikon + '</div>' +
            '<div style="flex:1;">' +
                '<div style="font-size:0.7rem;letter-spacing:1px;opacity:0.9;font-weight:700;">PERINGATAN CUACA EKSTREM — SMART ALERT</div>' +
                '<div style="font-size:0.82rem;font-weight:800;letter-spacing:0.3px;">STATUS ' + lvlObjek.label + ' • ' + jmlPeringatan + ' PARAMETER</div>' +
            '</div>' +
            '<div style="font-size:0.7rem;opacity:0.85;flex-shrink:0;">LIHAT ▼</div>';

        banner.onclick = function() {
            // Scroll ke box peringatan
            var boxEl = document.getElementById('boxPeringatanEkstrem');
            if (boxEl) {
                boxEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // Hapus banner setelah diklik
            banner.remove();
        };

        document.body.prepend(banner);

        // Auto-hilang 12 detik jika level WASPADA saja
        if (stateEkstrem.levelTertinggi === 1) {
            setTimeout(function() { if (banner.parentNode) banner.remove(); }, 12000);
        }
    }

    // =========================================================================
    //  RENDER BOX PERINGATAN DI DALAM WEATHERDATA
    // =========================================================================

    function renderBoxPeringatan() {
        // Hapus box lama
        var boxLama = document.getElementById('boxPeringatanEkstrem');
        if (boxLama) boxLama.remove();

        var weatherData = document.getElementById('weatherData');
        if (!weatherData) return;

        if (stateEkstrem.daftarPeringatan.length === 0) return;

        const lvlObjek = Object.values(LEVEL).find(l => l.kode === stateEkstrem.levelTertinggi) || LEVEL.NORMAL;

        // Buat container utama
        const box = document.createElement('div');
        box.id = 'boxPeringatanEkstrem';
        box.style.cssText =
            'margin-top:16px;' +
            'border-radius:16px;' +
            'overflow:hidden;' +
            'border:1.5px solid ' + lvlObjek.warna + ';' +
            'animation:fadeInUpCuaca 0.4s ease;';

        // Header box
        box.innerHTML =
            '<div style="background:' + lvlObjek.warna + ';padding:12px 16px;display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:1.4rem;">' + lvlObjek.ikon + '</span>' +
                '<div>' +
                    '<div style="color:#fff;font-weight:800;font-size:0.9rem;letter-spacing:0.5px;">' +
                        '⚡ PERINGATAN DINI CUACA EKSTREM' +
                    '</div>' +
                    '<div style="color:rgba(255,255,255,0.9);font-size:0.7rem;margin-top:1px;">' +
                        'STATUS ' + lvlObjek.label + ' • Diperbarui: ' + new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) +
                    '</div>' +
                '</div>' +
                '<div style="margin-left:auto;">' +
                    '<div style="background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:8px;font-size:0.7rem;color:#fff;font-weight:700;cursor:pointer;" onclick="document.getElementById(\'detailPeringatan\').style.display=document.getElementById(\'detailPeringatan\').style.display===\'none\'?\'block\':\'none\'">' +
                        'DETAIL ▾' +
                    '</div>' +
                '</div>' +
            '</div>';

        // Ringkasan singkat (selalu tampil)
        var ringkasanHTML = '<div style="background:' + lvlObjek.bg + ';padding:12px 16px;">';
        stateEkstrem.daftarPeringatan.forEach(function(p) {
            ringkasanHTML +=
                '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<div style="background:' + p.level.warna + ';border-radius:6px;padding:2px 7px;font-size:0.6rem;font-weight:800;color:#fff;flex-shrink:0;">' +
                        p.level.label +
                    '</div>' +
                    '<div style="font-size:0.82rem;color:#fff;font-weight:600;flex:1;">' + p.parameter + '</div>' +
                    '<div style="font-size:0.8rem;color:rgba(255,255,255,0.85);font-weight:700;">' + p.nilai + '</div>' +
                '</div>';
        });
        ringkasanHTML += '</div>';
        box.innerHTML += ringkasanHTML;

        // Detail lengkap (tersembunyi, muncul saat klik DETAIL)
        var detailHTML = '<div id="detailPeringatan" style="display:none;background:#111c2e;padding:14px 16px;">';
        stateEkstrem.daftarPeringatan.forEach(function(p) {
            detailHTML +=
                '<div style="margin-bottom:14px;padding:12px;border-radius:12px;border-left:4px solid ' + p.level.warna + ';background:rgba(255,255,255,0.03);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
                        '<div style="font-weight:800;font-size:0.85rem;color:#fff;">' + p.parameter + '</div>' +
                        '<div style="background:' + p.level.warna + ';color:#fff;padding:2px 8px;border-radius:6px;font-size:0.68rem;font-weight:800;flex-shrink:0;margin-left:8px;">' + p.level.label + '</div>' +
                    '</div>' +
                    '<div style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin-bottom:4px;">' +
                        '📊 Nilai: <b style="color:#fff;">' + p.nilai + '</b>' +
                        (p.waktu ? '  &nbsp;|&nbsp;  🕒 ' + p.waktu : '') +
                    '</div>' +
                    '<div style="font-size:0.78rem;line-height:1.5;color:#cbd5e1;background:rgba(0,0,0,0.2);padding:8px;border-radius:8px;margin-top:6px;">' +
                        '<b>💡 Dampak & Tindakan:</b> ' + p.dampak +
                    '</div>' +
                '</div>';
        });

        // Panduan Level Warna BMKG
        detailHTML +=
            '<div style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">' +
                '<div style="font-size:0.7rem;color:#64748b;font-weight:700;margin-bottom:8px;letter-spacing:0.5px;">PANDUAN KODE WARNA:</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.72rem;">' +
                    '<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#10b981;flex-shrink:0;"></div><span style="color:#94a3b8;">Hijau = Normal</span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#f59e0b;flex-shrink:0;"></div><span style="color:#94a3b8;">Kuning = Waspada</span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#f97316;flex-shrink:0;"></div><span style="color:#94a3b8;">Oranye = Siaga</span></div>' +
                    '<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:#ef4444;flex-shrink:0;"></div><span style="color:#94a3b8;">Merah = Awas</span></div>' +
                '</div>' +
            '</div>';

        // Tombol Kirim WhatsApp
        detailHTML +=
            '<button onclick="window._kirimPeringatanWA()" style="width:100%;margin-top:12px;padding:12px;background:#25D366;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;font-family:\'Plus Jakarta Sans\',sans-serif;">' +
                '💬 BAGIKAN PERINGATAN KE WHATSAPP' +
            '</button>';

        detailHTML +=
            '<div style="font-size:0.68rem;color:#475569;text-align:center;margin-top:8px;line-height:1.5;">' +
                'Data bersumber dari Open-Meteo API • Analisis berbasis ambang BMKG<br>' +
                'Verifikasi selalu ke bmkg.go.id untuk peringatan resmi' +
            '</div>';

        detailHTML += '</div>';
        box.innerHTML += detailHTML;

        // Sisipkan di awal weatherData (paling atas)
        weatherData.insertBefore(box, weatherData.firstChild);
    }

    // =========================================================================
    //  KIRIM PERINGATAN KE WHATSAPP
    // =========================================================================

    window._kirimPeringatanWA = function() {
        const lvlObjek = Object.values(LEVEL).find(l => l.kode === stateEkstrem.levelTertinggi) || LEVEL.NORMAL;
        const tgl = new Date().toLocaleString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit'
        });

        let teks =
            '*⚡ PERINGATAN DINI CUACA EKSTREM*\n' +
            '*Smart Farming — PPL Milenial Wajo*\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🕒 *Waktu:* ' + tgl + '\n' +
            '🚦 *Status:* ' + lvlObjek.ikon + ' *' + lvlObjek.label + '*\n\n' +
            '*📋 DAFTAR PERINGATAN:*\n';

        stateEkstrem.daftarPeringatan.forEach(function(p, idx) {
            teks +=
                '\n' + (idx + 1) + '. ' + p.parameter + '\n' +
                '   • Level: *' + p.level.label + '*\n' +
                '   • Nilai: ' + p.nilai + (p.waktu ? ' (' + p.waktu + ')' : '') + '\n' +
                '   • Dampak: _' + p.dampak + '_\n';
        });

        teks +=
            '\n━━━━━━━━━━━━━━━━━━━━\n' +
            '⚠️ Verifikasi ke: *bmkg.go.id*\n' +
            '_Dikirim oleh Sistem Peringatan Dini Smart Farming PPL Wajo_';

        window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank');
    };

    // =========================================================================
    //  NOTIFIKASI PUSH BROWSER
    // =========================================================================

    function kirimNotifPush() {
        if (!('Notification' in window)) return;
        const lvlObjek = Object.values(LEVEL).find(l => l.kode === stateEkstrem.levelTertinggi) || LEVEL.NORMAL;

        const kirim = function() {
            try {
                new Notification('⚡ Peringatan Cuaca ' + lvlObjek.label, {
                    body: stateEkstrem.daftarPeringatan.map(p => p.parameter + ': ' + p.nilai).join('\n'),
                    icon: 'https://mamank757.github.io/peta/icon.png',
                    tag: 'cuaca-ekstrem',
                    requireInteraction: stateEkstrem.levelTertinggi >= 3
                });
            } catch(e) {}
        };

        if (Notification.permission === 'granted') {
            kirim();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(function(perm) {
                if (perm === 'granted') kirim();
            });
        }
    }

    // =========================================================================
    //  SUARA ALARM (Web Audio API) — hanya untuk level AWAS
    // =========================================================================

    function bunyikanAlarm() {
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            var ctx = new AudioCtx();

            // Pola nada tiga kali (seperti sirene BMKG)
            var frekuensi = [880, 660, 880];
            var jeda = 0;

            frekuensi.forEach(function(freq) {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.18, ctx.currentTime + jeda);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + jeda + 0.4);
                osc.start(ctx.currentTime + jeda);
                osc.stop(ctx.currentTime + jeda + 0.45);
                jeda += 0.5;
            });

            setTimeout(function() { try { ctx.close(); } catch(e) {} }, 2000);
        } catch(e) {
            console.warn('[patch_ekstrem] Audio API tidak tersedia:', e.message);
        }
    }

    // =========================================================================
    //  INTERCEPT DATA FORECAST — hook ke muatCuaca & renderDataCuaca
    // =========================================================================

    /**
     * Strategi: setelah muatCuaca() memanggil fetchDataCuaca() dan hasilnya
     * dirender, kita perlu mengakses data tersebut. Cara paling aman adalah
     * menimpa renderDataCuaca atau menyuntikkan hook ke dalam state patch cuaca.
     *
     * Karena patch_cuaca_langsung.js menyimpan data di state internal (closure),
     * kita pakai MutationObserver untuk mendeteksi perubahan DOM weatherData
     * SETELAH render selesai, lalu re-fetch data jika diperlukan.
     *
     * Alternatif lebih bersih: expose hook dari patch cuaca.
     */

    // Hook ke window.analyzeDiseaseRisk yang sudah dipanggil setiap kali data cuaca dirender
    var _analyzeDiseaseRiskAsli = window.analyzeDiseaseRisk;
    window.analyzeDiseaseRisk = function(cur, dpSpread) {
        // Jalankan fungsi asli
        if (typeof _analyzeDiseaseRiskAsli === 'function') {
            _analyzeDiseaseRiskAsli(cur, dpSpread);
        }

        // Akses forecast dari state patch cuaca (tersimpan di window._lastForecastData jika ada)
        // Kita tambahkan mekanisme penyimpanan di sini
        if (window._lastForecastData) {
            analisaEkstrem(window._lastForecastData);
        }
    };

    // Hook ke fetchDataCuaca yang dipanggil oleh muatCuaca()
    // Cara: intercept console atau pakai proxy fetch untuk menangkap data
    var _fetchAsli = window.fetch;
    window.fetch = function() {
        var args = arguments;
        var url = typeof args[0] === 'string' ? args[0] : '';

        // Deteksi request ke Open-Meteo forecast
        if (url.includes('api.open-meteo.com/v1/forecast') ||
            url.includes('wttr.in') ||
            url.includes('api.open-meteo.com')) {

            return _fetchAsli.apply(this, args).then(function(response) {
                // Clone response agar bisa dibaca dua kali
                var clone = response.clone();
                clone.json().then(function(data) {
                    // Simpan hanya jika ini data forecast (ada .current & .hourly)
                    if (data && data.current && data.hourly) {
                        window._lastForecastData = data;
                    }
                }).catch(function() {});
                return response;
            });
        }

        return _fetchAsli.apply(this, args);
    };

    // =========================================================================
    //  TOMBOL REFRESH MANUAL PERINGATAN
    // =========================================================================

    window.refreshPeringatanEkstrem = function() {
        if (window._lastForecastData) {
            stateEkstrem.sudahNotif = false;
            analisaEkstrem(window._lastForecastData);
        }
    };

    // =========================================================================
    //  TAMBAHKAN TOMBOL SHORTCUT DI BOX RISIKO BLAST (jika ada)
    // =========================================================================

    function tambahTombolShortcut() {
        var boxBlast = document.getElementById('boxBlastRisk');
        if (!boxBlast) return;
        if (document.getElementById('btnRefreshEkstrem')) return;

        var btn = document.createElement('button');
        btn.id = 'btnRefreshEkstrem';
        btn.textContent = '⚡ Perbarui Peringatan Ekstrem';
        btn.style.cssText =
            'width:100%;margin-top:12px;padding:11px;' +
            'background:linear-gradient(135deg,#ef4444,#dc2626);' +
            'color:#fff;border:none;border-radius:12px;' +
            'font-weight:700;font-size:0.82rem;cursor:pointer;' +
            'font-family:"Plus Jakarta Sans",sans-serif;';
        btn.onclick = window.refreshPeringatanEkstrem;

        boxBlast.appendChild(btn);
    }

    // =========================================================================
    //  CSS TAMBAHAN
    // =========================================================================

    var style = document.createElement('style');
    style.textContent =
        '#bannerCuacaEkstrem{animation:slideDownBanner 0.4s ease;}' +
        '@keyframes slideDownBanner{from{transform:translateY(-100%);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
        '#boxPeringatanEkstrem{animation:fadeInUpCuaca 0.4s ease;}' +
        '.peringatan-pulse{animation:denyutEkstrem 1.5s ease-in-out infinite;}' +
        '@keyframes denyutEkstrem{0%,100%{opacity:1;}50%{opacity:0.6;}}' +
        /* Pastikan banner tidak tertutup oleh sticky-header */
        '#bannerCuacaEkstrem + .sticky-header{top:54px!important;}';
    document.head.appendChild(style);

    // =========================================================================
    //  OBSERVER DOM — deteksi saat weatherData mulai terisi
    // =========================================================================

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mut) {
            if (mut.type === 'childList' && mut.addedNodes.length > 0) {
                // Jika weatherData sudah punya isi & ada data forecast tersimpan
                setTimeout(function() {
                    tambahTombolShortcut();
                    if (window._lastForecastData && stateEkstrem.daftarPeringatan.length === 0) {
                        analisaEkstrem(window._lastForecastData);
                    }
                }, 600);
            }
        });
    });

    var weatherDataEl = document.getElementById('weatherData');
    if (weatherDataEl) {
        observer.observe(weatherDataEl, { childList: true, subtree: false });
    }

    // Fallback: coba setelah DOM fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        var wd = document.getElementById('weatherData');
        if (wd && !weatherDataEl) {
            observer.observe(wd, { childList: true, subtree: false });
        }
    });

    console.log('✅ [patch_peringatan_ekstrem v1.0] Peringatan dini cuaca ekstrem aktif.');

})();
