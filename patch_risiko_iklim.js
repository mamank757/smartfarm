/**
 * ============================================================
 * patch_risiko_iklim_v2.js
 * Versi: 2.0.2 — Risiko Curah Hujan Murni + Keterangan Label Dinamis
 * ------------------------------------------------------------
 * Menimpa fungsi di patch_risiko_iklim.js (versi sebelumnya)
 *
 * PERUBAHAN UTAMA:
 * ✅ Label grafik sekarang otomatis menambahkan "(AMAN)", 
 * "(WASPADA)", "(BAHAYA)", atau "(KRITIS)" berdasarkan skor.
 * ✅ Seluruh logika IIFE dan pencegahan bentrok tetap aman.
 * ============================================================
 */

(function () {
    'use strict';
    
    // ============================================================
    //  1. TABEL BOBOT KORELASI PER ZONA PER BULAN
    // ============================================================
    var BOBOT_IKLIM = {
        monsunal: {
            enso: [0.15, 0.15, 0.12, 0.10, 0.18, 0.35,
                   0.45, 0.50, 0.45, 0.35, 0.20, 0.15],
            iod:  [0.10, 0.10, 0.08, 0.08, 0.12, 0.20,
                   0.28, 0.38, 0.40, 0.30, 0.15, 0.10]
        },
        ekuatorial: {
            enso: [0.10, 0.10, 0.08, 0.08, 0.10, 0.15,
                   0.18, 0.20, 0.18, 0.15, 0.10, 0.10],
            iod:  [0.20, 0.18, 0.15, 0.12, 0.15, 0.22,
                   0.30, 0.42, 0.48, 0.38, 0.25, 0.20]
        },
        lokal: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.28, 0.25, 0.20, 0.15, 0.12],
            iod:  [0.08, 0.08, 0.08, 0.08, 0.10, 0.12,
                   0.15, 0.20, 0.22, 0.18, 0.12, 0.08]
        },
        peralihan: {
            enso: [0.12, 0.12, 0.10, 0.10, 0.14, 0.22,
                   0.30, 0.35, 0.30, 0.25, 0.16, 0.12],
            iod:  [0.14, 0.12, 0.10, 0.10, 0.12, 0.18,
                   0.22, 0.30, 0.33, 0.25, 0.18, 0.14]
        }
    };
    
    // ============================================================
    //  2. PENENTUAN ZONA IKLIM BERDASARKAN KOORDINAT GPS
    // ============================================================
    function tentukanZonaIklim(lat, lon) {
        if (lon >= 128) return 'lokal';
        if (lat >= -6 && lat <= 6 && lon >= 95 && lon <= 119) return 'ekuatorial';
        if (lat >= -4 && lat <= 2 && lon >= 119 && lon <= 128) return 'peralihan';
        return 'monsunal';
    }
    
    // ============================================================
    //  3. HITUNG WETNESS SCORE (VERSI REVISI LEBIH SENSITIF)
    // ============================================================
    var AMPLIFIKASI_IKLIM = 5; 
    
    function hitungWetnessScore(baselineZOM, ensoVal, iodVal, lat, lon, bulanIndex) {
        const zona   = tentukanZonaIklim(lat, lon);
        const w_enso = BOBOT_IKLIM[zona].enso[bulanIndex];
        const w_iod  = BOBOT_IKLIM[zona].iod[bulanIndex];
    
        const ensoNorm = (ensoVal / 0.5) * AMPLIFIKASI_IKLIM; 
        const iodNorm  = (iodVal  / 0.5) * AMPLIFIKASI_IKLIM; 
    
        const totalBobot = w_enso + w_iod;
        const penguatBobot = totalBobot < 0.25 ? 1.5 : 1.0;
    
        const koreksi = totalBobot > 0 
            ? ((ensoNorm * w_enso) + (iodNorm * w_iod)) * penguatBobot
            : 0;
    
        const score = baselineZOM - koreksi;
        return score;
    }
    
    // ============================================================
    //  4. FUNGSI UTAMA — hitungRisikoDinamis() VERSI BARU
    // ============================================================
    function hitungRisikoDinamis(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        const lat = (window._lokasiKalender && window._lokasiKalender.lat) || -5.0;
        const lon = (window._lokasiKalender && window._lokasiKalender.lon) || 120.0;
    
        let baselineBulanIni = parseFloat(baselineData[bulanIndex]);
    
        if (baselineBulanIni > 10) {
            baselineBulanIni = normalisasiCurahHujan(baselineBulanIni, bulanIndex);
        }
    
        const ws = hitungWetnessScore(baselineBulanIni, ensoVal, iodVal, lat, lon, bulanIndex);
    
        // UBAH BAGIAN INI (Lebih sensitif terhadap penyimpangan kecil)
        let statusCuaca;
        if      (ws <= -1.0) statusCuaca = 'Sangat Kering Ekstrem'; // Asalnya -1.5
        else if (ws <= -0.5) statusCuaca = 'Kering';                // Asalnya -0.8
        else if (ws <= -0.2) statusCuaca = 'Cenderung Kering';      // Asalnya -0.3
        else if (ws <=  0.2) statusCuaca = 'Normal';                // Asalnya 0.3
        else if (ws <=  0.5) statusCuaca = 'Cenderung Basah';       // Asalnya 0.8
        else if (ws <=  1.0) statusCuaca = 'Basah';                 // Asalnya 1.5
        else                 statusCuaca = 'Sangat Basah Ekstrem';
        
        let tipeBahaya = 'aman'; 
        if (ws < -0.2) tipeBahaya = 'kekeringan'; // Dibuat lebih cepat waspada
        else if (ws > 0.2) tipeBahaya = 'banjir'; // Dibuat lebih cepat waspada    
        let skor    = 15;
        let masalah = 'Kondisi air optimal.';
    
        if (fase === 'Tanam') {
            if (ws <= -1.5) {
                skor    = 90;
                masalah = 'KRITIS: Tanah retak parah, tidak bisa olah lahan. Tunda tanam atau pompanisasi penuh.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 65;
                masalah = 'Hujan kurang. Perlu pompanisasi tambahan agar lahan bisa dibajak.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 35;
                masalah = 'Curah hujan sedikit di bawah normal. Pantau ketersediaan air irigasi.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.8) {
                skor    = 15;
                masalah = 'Curah hujan cukup. Kondisi air ideal untuk olah lahan dan tanam.';
            } else if (ws <= 1.5) {
                skor    = 45;
                masalah = 'Curah hujan di atas normal. Waspada genangan di lahan yang drainase-nya buruk.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 70;
                masalah = 'Hujan sangat lebat. Risiko pesemaian terendam. Pertimbangkan tapin atau tunda sebar benih.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Vegetatif') {
            if (ws <= -1.5) {
                skor    = 80;
                masalah = 'KRITIS: Kekeringan parah. Anakan padi tidak tumbuh, jumlah malai sangat sedikit.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 55;
                masalah = 'Kekeringan. Pertumbuhan anakan terhambat. Segera cek debit saluran irigasi.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 28;
                masalah = 'Sedikit kekurangan air. Pantau tinggi air di petak sawah, pertahankan 3–5 cm.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.8) {
                skor    = 12;
                masalah = 'Curah hujan normal. Kondisi air ideal untuk pertumbuhan anakan produktif.';
            } else if (ws <= 1.5) {
                skor    = 38;
                masalah = 'Curah hujan lebat. Jika tergenang > 7 hari berturut-turut, segera buka saluran drainase.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 62;
                masalah = 'Hujan sangat lebat. Risiko genangan panjang, akar busuk dan anakan produktif berkurang.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Generatif') {
            if (ws <= -1.5) {
                skor    = 95;
                masalah = 'KRITIS PUSO: Kekeringan parah saat bunting. Malai hampa massal, potensi gagal panen total.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.8) {
                skor    = 75;
                masalah = 'BAHAYA: Kekurangan air saat pengisian malai. Bulir tidak terisi penuh, hasil anjlok 30–60%.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= -0.3) {
                skor    = 42;
                masalah = 'Waspada kekurangan air. Pastikan tinggi air sawah minimal 5 cm saat fase bunting.';
                tipeBahaya = 'kekeringan';
            } else if (ws <= 0.5) {
                skor    = 12;
                masalah = 'Kondisi curah hujan sangat ideal untuk penyerbukan dan pengisian bulir.';
            } else if (ws <= 1.2) {
                skor    = 40;
                masalah = 'Hujan lebat saat berbunga. Serbuk sari berpotensi rontok, amati persentase malai kosong.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 72;
                masalah = 'BAHAYA: Hujan deras dan angin kencang saat berbunga. Risiko rebah dan penyerbukan gagal massal.';
                tipeBahaya = 'banjir';
            }
        } else if (fase === 'Panen') {
            if (ws <= -0.8) {
                skor    = 8;
                masalah = 'Kondisi terik dan kering. Sangat ideal untuk panen dan pengeringan gabah.';
            } else if (ws <= 0.3) {
                skor    = 18;
                masalah = 'Kondisi curah hujan normal. Panen aman, siapkan pengering cadangan (terpal/dryer).';
            } else if (ws <= 0.8) {
                skor    = 48;
                masalah = 'Curah hujan di atas normal. Lahan berpotensi becek, sulit diakses Combine Harvester.';
                tipeBahaya = 'banjir';
            } else if (ws <= 1.5) {
                skor    = 75;
                masalah = 'BAHAYA: Hujan lebat saat panen. Gabah berisiko tumbuh di malai. Percepat panen atau siapkan dryer.';
                tipeBahaya = 'banjir';
            } else {
                skor    = 92;
                masalah = 'KRITIS: Banjir saat panen. Lahan tidak bisa diakses mesin. Gabah rusak dan rebah. Percepat panen manual segera!';
                tipeBahaya = 'banjir';
            }
        }
    
        skor = Math.round(Math.max(0, Math.min(100, skor)));
        return { skor, statusCuaca, masalah, tipeBahaya };
    }
    
    // ============================================================
    //  5. OVERRIDE prosesAnalisisKalender()
    // ============================================================
    window.prosesAnalisisKalender = async function prosesAnalisisKalender() {
        const tglInput = document.getElementById('inputTglTanam').value;
        if (!tglInput) {
            alert('Silakan masukkan tanggal awal tanam terlebih dahulu!');
            return;
        }
    
        const containerUtama = document.getElementById('hasilProyeksiIklim');
        const kontainerTeks  = document.getElementById('teksAnalisisFase');
        const judulChart     = containerUtama.querySelector('h4');
        const bungkusChart   = containerUtama.querySelector('div');
    
        containerUtama.style.display = 'block';
    
        if (!judulChart.dataset.asli) {
            judulChart.dataset.asli = '<span style="color:#38b6ff;">💧 Grafik Risiko Ketersediaan Air per Fase Tanam</span>';
        }
    
        judulChart.innerHTML = `<div class="animasi-loading-kalender">📡 MEMBACA GPS & MENYINKRONKAN...</div>`;
        bungkusChart.style.display = 'none';
        kontainerTeks.innerHTML    = '';
    
        try {
            const lokasi = await dapatkanLokasiOtomatis();
            window._lokasiKalender = { lat: lokasi.lat, lon: lokasi.lon };
    
            const lokasiSawahEl = document.getElementById('lokasiSawah');
            if (lokasiSawahEl && lokasiSawahEl.innerText === '-') {
                lokasiSawahEl.innerText = `${lokasi.lat.toFixed(5)}, ${lokasi.lon.toFixed(5)}`;
            }
    
            const [ensoData, iodData, resPola, resZom] = await Promise.all([
                getENSOAnomaly(),
                getIODAnomaly(),
                fetch(URL_POLA_HUJAN),
                fetch(URL_ZOM_LOKAL).catch(() => null)
            ]);
    
            const dbPola  = await resPola.json();
            let   dataZom = null;
            if (resZom) dataZom = await resZom.json();
    
            const ensoVal = ensoData.latestAnomaly;
            const iodVal  = iodData.latestAnomaly;
    
            let baselineData = [];
            let namaZona     = '';
            let jarakTerdekat = Infinity;
            let kabTerpilih   = null;
    
            let arrayZom = null;
            if (dataZom && Array.isArray(dataZom.data)) {
                arrayZom = dataZom.data;
            } else if (Array.isArray(dataZom)) {
                arrayZom = dataZom;
            }
    
            if (arrayZom) {
                arrayZom.forEach(kab => {
                    const latKab = parseFloat(kab.lat);
                    const lonKab = parseFloat(kab.lon);
                    if (!isNaN(latKab) && !isNaN(lonKab)) {
                        const jarak = hitungJarakHaversine(lokasi.lat, lokasi.lon, latKab, lonKab);
                        if (jarak < jarakTerdekat) {
                            jarakTerdekat = jarak;
                            kabTerpilih   = kab;
                        }
                    }
                });
            }
    
            if (kabTerpilih && jarakTerdekat <= 150) {
                namaZona = `WIL. ${kabTerpilih.kabupaten_kota.toUpperCase()} (${jarakTerdekat.toFixed(1)} km) — Zona: ${tentukanZonaIklim(lokasi.lat, lokasi.lon).toUpperCase()}`;
                baselineData = [
                    parseFloat(kabTerpilih.jan), parseFloat(kabTerpilih.feb), parseFloat(kabTerpilih.mar), parseFloat(kabTerpilih.apr),
                    parseFloat(kabTerpilih.mei), parseFloat(kabTerpilih.jun), parseFloat(kabTerpilih.jul), parseFloat(kabTerpilih.agu),
                    parseFloat(kabTerpilih.sep), parseFloat(kabTerpilih.okt), parseFloat(kabTerpilih.nov), parseFloat(kabTerpilih.des)
                ];
            } else {
                const zona = tentukanZonaIklim(lokasi.lat, lokasi.lon);
                const peta = { monsunal: 'monsunal', ekuatorial: 'ekuatorial', lokal: 'lokal', peralihan: 'peralihan' };
                const polaTerpilih = dbPola.find(p => p.pola.toLowerCase().includes(peta[zona])) || dbPola.find(p => p.pola.toLowerCase().includes('monsunal'));
                namaZona     = `[FALLBACK] POLA MAKRO — ZONA: ${zona.toUpperCase()}`;
                baselineData = polaTerpilih.baseline;
            }
    
            const umurPilihan = document.getElementById('umurVarietasKalender').value;
            let offsetVeg = 35, offsetGen = 50, offsetPanen = 110;
            if      (umurPilihan === 'genjah') { offsetVeg = 25; offsetGen = 40; offsetPanen = 90;  }
            else if (umurPilihan === 'dalam')  { offsetVeg = 40; offsetGen = 60; offsetPanen = 125; }
    
            const awalTanam    = new Date(tglInput);
            const tglVegetatif = new Date(awalTanam); tglVegetatif.setDate(tglVegetatif.getDate() + offsetVeg);
            const tglGeneratif = new Date(awalTanam); tglGeneratif.setDate(tglGeneratif.getDate() + offsetGen);
            const tglPanen     = new Date(awalTanam); tglPanen.setDate(tglPanen.getDate() + offsetPanen);
    
            const formatTgl = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    
            const labels = [
                `Tanam\n(${formatTgl(awalTanam)})`, `Vegetatif\n(${formatTgl(tglVegetatif)})`,
                `Generatif\n(${formatTgl(tglGeneratif)})`, `Panen\n(${formatTgl(tglPanen)})`
            ];
    
            const riskTanam = hitungRisikoDinamis(awalTanam.getMonth(),    'Tanam',      ensoVal, iodVal, baselineData);
            const riskVeg   = hitungRisikoDinamis(tglVegetatif.getMonth(), 'Vegetatif',  ensoVal, iodVal, baselineData);
            const riskGen   = hitungRisikoDinamis(tglGeneratif.getMonth(), 'Generatif',  ensoVal, iodVal, baselineData);
            const riskPanen = hitungRisikoDinamis(tglPanen.getMonth(),     'Panen',      ensoVal, iodVal, baselineData);
    
            const dataSkor   = [riskTanam.skor, riskVeg.skor, riskGen.skor, riskPanen.skor];
            const dataStatus = [riskTanam.statusCuaca, riskVeg.statusCuaca, riskGen.statusCuaca, riskPanen.statusCuaca];
            const dataTipe   = [riskTanam.tipeBahaya,   riskVeg.tipeBahaya,  riskGen.tipeBahaya,  riskPanen.tipeBahaya];
    
            judulChart.innerHTML    = judulChart.dataset.asli;
            bungkusChart.style.display = 'block';
    
            renderKalenderChartV2(labels, dataSkor, dataStatus, dataTipe);
            loadGlobalClimateIndices();
    
            const zonaLabel = tentukanZonaIklim(lokasi.lat, lokasi.lon).toUpperCase();
    
            function ikonTipe(tipe) {
                if (tipe === 'kekeringan') return '☀️';
                if (tipe === 'banjir')     return '🌊';
                return '✅';
            }
    
            kontainerTeks.innerHTML = `
                <div style="text-align:center; font-size:0.8rem; margin-bottom:15px; color:#38b6ff; border-bottom:1px dashed rgba(255,255,255,0.1); padding-bottom:8px;">
                    📍 Zona Iklim: <b>${zonaLabel}</b><br>
                    <span style="font-size:0.72rem; color:#64748b;">${namaZona}</span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskVeg.skor, riskVeg.tipeBahaya)};">
                    <strong>${ikonTipe(riskVeg.tipeBahaya)} Vegetatif (${tglVegetatif.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskVeg.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;">${riskVeg.masalah}</span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskGen.skor, riskGen.tipeBahaya)};">
                    <strong>${ikonTipe(riskGen.tipeBahaya)} Generatif / Bunting (${tglGeneratif.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskGen.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;"><b>${riskGen.masalah}</b></span>
                </div>
                <div class="info-box" style="border-left-color:${getWarnaRisikoAir(riskPanen.skor, riskPanen.tipeBahaya)};">
                    <strong>${ikonTipe(riskPanen.tipeBahaya)} Panen (${tglPanen.toLocaleDateString('id-ID',{month:'long'})})</strong><br>
                    <span style="color:#38b6ff; font-size:0.75rem; font-weight:bold;">Curah Hujan: ${riskPanen.statusCuaca}</span><br>
                    <span style="color:#cbd5e1; font-size:0.8rem;">${riskPanen.masalah}</span>
                </div>
                <div style="margin-top:12px; padding:10px 12px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px solid rgba(255,255,255,0.05); font-size:0.72rem; color:#64748b; line-height:1.6;">
                    ☀️ = Risiko Kekeringan &nbsp;&nbsp; 🌊 = Risiko Banjir/Genangan &nbsp;&nbsp; ✅ = Kondisi Aman<br>
                    📚 Sumber: Aldrian & Susanto (2003) • Nur'utami & Hidayat (2016)
                </div>
            `;
        } catch (errorMesej) {
            console.error('[patch_risiko_iklim_v2]', errorMesej);
            alert('Gagal Membaca Lokasi!\n\n' + errorMesej);
            judulChart.innerHTML       = judulChart.dataset.asli || '💧 Grafik Risiko Air per Fase Tanam';
            bungkusChart.style.display = 'none';
            kontainerTeks.innerHTML = `
                <div class="info-box" style="border-left-color:var(--red-alert); text-align:center;">
                    <strong>⚠️ Akses Lokasi Ditolak / Gagal</strong><br>
                    <span style="font-size:0.85rem; color:#cbd5e1;">Aplikasi memerlukan koordinat GPS untuk menganalisis risiko curah hujan di hamparan lahanmu. Coba muat ulang halaman.</span>
                </div>`;
        }
    }
    
    // ============================================================
    //  6. HELPER: warna garis berdasarkan tipe bahaya & skor
    // ============================================================
    function getWarnaRisikoAir(skor, tipeBahaya) {
        if (skor < 25) return '#10b981';          
        if (tipeBahaya === 'kekeringan') {
            if (skor >= 70) return '#ef4444';                  
            if (skor >= 45) return '#f97316';                  
            return '#f59e0b';                                  
        }
        if (tipeBahaya === 'banjir') {
            if (skor >= 70) return '#3b82f6';                  
            if (skor >= 45) return '#38b6ff';                  
            return '#67e8f9';                                  
        }
        return '#10b981';
    }
    
    // ============================================================
    //  7. renderKalenderChartV2()
    // ============================================================
    function renderKalenderChartV2(labels, dataSkor, dataStatus, dataTipe) {
        const ctx = document.getElementById('kalenderChart').getContext('2d');
    
        if (typeof kalenderChartInstance !== 'undefined' && kalenderChartInstance !== null) {
            kalenderChartInstance.destroy();
        }
    
        const bgColors = dataSkor.map((skor, i) => {
            const tipe = dataTipe ? dataTipe[i] : 'aman';
            return getWarnaRisikoAir(skor, tipe);
        });
    
        const singkatkanStatus = (status) => {
            if (!status) return '';
            const s = status.toLowerCase();
            if (s.includes('sangat kering')) return 'Kering Ekstrem';
            if (s.includes('cenderung kering')) return 'Kering';
            if (s.includes('kering'))          return 'Kering';
            if (s.includes('sangat basah'))    return 'Basah Ekstrem';
            if (s.includes('cenderung basah')) return 'Basah';
            if (s.includes('basah'))           return 'Basah';
            return 'Normal';
        };
        const labelSingkat = dataStatus ? dataStatus.map(singkatkanStatus) : [];
    
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
        gradientFill.addColorStop(0,   'rgba(56, 182, 255, 0.55)');
        gradientFill.addColorStop(0.8, 'rgba(56, 182, 255, 0.00)');
    
        const neonGlowPlugin = {
            id: 'neonGlowWater',
            beforeDatasetsDraw: (chart) => {
                chart.ctx.save();
                chart.ctx.shadowColor  = 'rgba(56, 182, 255, 0.5)';
                chart.ctx.shadowBlur   = 14;
                chart.ctx.shadowOffsetX = 0;
                chart.ctx.shadowOffsetY = 4;
            },
            afterDatasetsDraw: (chart) => { chart.ctx.restore(); }
        };
    
        kalenderChartInstance = new Chart(ctx, {
            type: 'line',
            plugins: [neonGlowPlugin, ChartDataLabels],
            data: {
                labels: labels,
                datasets: [{
                    label     : 'Risiko Air',
                    data      : dataSkor,
                    borderColor         : '#38b6ff',
                    backgroundColor     : gradientFill,
                    borderWidth         : 3,
                    tension             : 0.4,
                    fill                : true,
                    pointBackgroundColor: '#0b1528',
                    pointBorderColor    : bgColors,
                    pointBorderWidth    : 3,
                    pointRadius         : 7,
                    pointHoverRadius    : 10,
                    pointHoverBackgroundColor: bgColors,
                    pointHoverBorderColor   : '#ffffff',
                    pointHoverBorderWidth   : 2
                }]
            },
            options: {
                responsive          : true,
                maintainAspectRatio : false,
                layout: { padding: { top: 28, right: 10, left: 10 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor  : 'rgba(11, 21, 40, 0.9)',
                        titleColor       : '#38b6ff',
                        bodyColor        : '#ffffff',
                        borderColor      : 'rgba(56, 182, 255, 0.35)',
                        borderWidth      : 1,
                        padding          : 12,
                        displayColors    : false,
                        cornerRadius     : 12,
                        callbacks: {
                            title: function(ctx) {
                                return ctx[0].label.replace('\n', ' ');
                            },
                            label: function(ctx) {
                                const i    = ctx.dataIndex;
                                const skor = Math.round(ctx.raw);
                                const tipe = dataTipe ? dataTipe[i] : '';
                                const ikonTipe = tipe === 'kekeringan' ? '☀️ Kekeringan'
                                               : tipe === 'banjir'     ? '🌊 Banjir/Genangan'
                                               : '✅ Aman';
                                const st = dataStatus ? dataStatus[i] : '';
                                return [
                                    ` Skor Risiko Air: ${skor}%`,
                                    ` Tipe: ${ikonTipe}`,
                                    ` Curah Hujan: ${st}`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        color     : bgColors,
                        anchor    : 'end',
                        align     : 'top',
                        offset    : 4,
                        font      : {
                            family : "'Plus Jakarta Sans', sans-serif",
                            weight : '800',
                            size   : 10
                        },
                        textAlign  : 'center',
                        formatter: function(value, context) {
    const skor = Math.round(value);
    const persen = skor + '%';
    const status = labelSingkat[context.dataIndex] || 'Normal';
    
    // 🔥 Tambahan Logika Keterangan Dinamis (Title Case)
    let tingkat = '(Aman)';
    if (skor >= 70) {
        tingkat = '(Kritis)';
    } else if (skor >= 45) {
        tingkat = '(Bahaya)';
    } else if (skor >= 25) {
        tingkat = '(Waspada)';
    }
    
    // Hapus .toUpperCase() agar status tetap Title Case
    // Hasil: "Kering (Waspada)", "Basah Ekstrem (Kritis)", dll.
    return [persen, `${status} ${tingkat}`];
}
                    }
                },
                scales: {
                    y: {
                        beginAtZero : true,
                        max         : 110,
                        title: {
                            display : true,
                            text    : 'Skor Risiko Air (%)',
                            color   : '#64748b',
                            font    : { size: 10 }
                        },
                        grid : { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5] },
                        ticks: { color: '#64748b', font: { size: 9, weight: '200' } }
                    },
                    x: {
                        grid : { display: false },
                        ticks: { color: '#8da2be', font: { size: 9, weight: '200' } }
                    }
                }
            }
        });
    }
    
    // ============================================================
    //  8. Backward Compat
    // ============================================================
    function getWarnaRisiko(skor) {
        if (skor >= 70) return 'var(--red-alert)';
        if (skor >= 40) return 'var(--accent-soil)';
        return 'var(--accent-green)';
    }
    
    console.log(
        '%c✅ patch_risiko_iklim_v2.js v2.0.2 aktif — Keterangan Level Otomatis',
        'color:#38b6ff; font-weight:bold;'
    );
    
    // ============================================================
    //  EKSPOR EKSPLISIT
    // ============================================================
    window.tentukanZonaIklim      = tentukanZonaIklim;
    window.hitungRisikoDinamis    = hitungRisikoDinamis;
    window.getWarnaRisikoAir      = getWarnaRisikoAir;
    window.renderKalenderChartV2  = renderKalenderChartV2;
    if (typeof window.getWarnaRisiko !== 'function') {
        window.getWarnaRisiko = getWarnaRisiko;
    }
    
})();
