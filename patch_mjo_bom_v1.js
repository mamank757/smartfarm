/**
 * ============================================================
 * patch_mjo_bom_v1_FINAL.js
 * Data MJO Real-Time — Terkoneksi ke Backend GAS (Eviden LCS Digital)
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__mjoBomV1Aktif) return;

    // MASUKKAN URL WEB APP GAS ANDA DI SINI
    var GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbzVgsGCNLt1fTt99GHt4AlYO8FI55n51gyVdriHzSnxHhHPUyPXp1qLP1tp-b17k0qQnQ/exec';

    // ── Label & Dampak (Logika tetap di frontend) ────────────────
    var LABEL_FASE = {
        1: { nama: 'Fase 1 — Samudra Hindia Barat', ikon: '🌐' },
        2: { nama: 'Fase 2 — Samudra Hindia', ikon: '🌐' },
        3: { nama: 'Fase 3 — Samudra Hindia Timur', ikon: '🌧️' },
        4: { nama: 'Fase 4 — Laut Maritim & Jawa', ikon: '🌧️' },
        5: { nama: 'Fase 5 — Sulawesi & Kalimantan', ikon: '🌩️' },
        6: { nama: 'Fase 6 — Pasifik Barat', ikon: '⛈️' },
        7: { nama: 'Fase 7 — Pasifik Tengah', ikon: '☀️' },
        8: { nama: 'Fase 8 — Pasifik Timur–Hindia Barat', ikon: '🌤️' }
    };

    var DAMPAK_PER_FASE = {
        sumatera: [-0.1, 0.3, 0.7, 0.6, 0.1, -0.4, -0.7, -0.4],
        jawa: [0.0, 0.2, 0.6, 0.8, 0.3, -0.3, -0.7, -0.4],
        sulawesi: [-0.2, -0.1, 0.2, 0.5, 0.8, 0.6, -0.2, -0.5],
        kalimantan: [-0.1, 0.0, 0.3, 0.6, 0.9, 0.5, -0.3, -0.5],
        nusra: [-0.3, -0.1, 0.2, 0.4, 0.5, 0.2, -0.4, -0.7],
        papua: [-0.2, 0.0, 0.1, 0.3, 0.6, 0.8, 0.1, -0.4]
    };

    function tentukanWilayah(lat, lon) {
        if (lon >= 130) return 'papua';
        if (lon >= 108 && lat >= -4) return 'kalimantan';
        if (lat < -7 && lon > 118) return 'nusra';
        if (lon >= 118 && lon < 130 && lat >= -6) return 'sulawesi';
        if (lon >= 105 && lon < 118 && lat < -5.5) return 'jawa';
        if (lon >= 95 && lon < 106) return 'sumatera';
        return 'sulawesi';
    }

    // ── Fungsi utama: Mengambil data dari GAS ───────────────────
    async function getMJOData() {
        try {
            // Kita fetch JSON langsung dari GAS Anda
            const response = await fetch(GAS_PROXY_URL);
            if (!response.ok) throw new Error('Gagal akses GAS');
            const data = await response.json();

            // Mapping data GAS ke format yang dibutuhkan UI
            const hasil = {
                fase: data.fase,
                amplitudo: data.amplitudo,
                tanggal: data.tanggal,
                aktif: data.amplitudo >= 1.0,
                labelFase: data.labelFase,
                ikonFase: data.ikonFase,
                sumber: 'Eviden LCS Digital Backend',
                _cacheTime: Date.now()
            };

            window.mjoData = hasil;
            window.mjoFase = hasil.fase;
            window.mjoAmplitudo = hasil.amplitudo;
            
            return hasil;
        } catch (err) {
            console.error('[MJO Error] Gagal ambil data dari GAS:', err);
            return { fase: 0, amplitudo: 0, aktif: false, labelFase: 'Data Gagal Dimuat', ikonFase: '⚠️' };
        }
    }

    function hitungDampakMJOLokal(lat, lon, fase, amplitudo) {
        if (!fase || fase < 1 || fase > 8 || amplitudo < 1.0) return 0;
        var wilayah = tentukanWilayah(lat, lon);
        var tabel = DAMPAK_PER_FASE[wilayah];
        var dampak = tabel[fase - 1];
        var skala = Math.min(1.0, (amplitudo - 1.0) / 1.5 * 1.0 + 0.7);
        return Math.max(-1, Math.min(1, dampak * skala));
    }

    function tampilkanStatusMJO(data) {
        var el = document.getElementById('mjoStatus');
        if (!el) return;
        el.innerHTML = `${data.ikonFase} MJO: <b>${data.labelFase}</b> <small>(Amp: ${data.amplitudo.toFixed(2)})</small>`;
    }

    // Init
    window.getMJOData = getMJOData;
    window.hitungDampakMJOLokal = hitungDampakMJOLokal;
    window.tentukanWilayahMJO = tentukanWilayah;

    
    window.__mjoBomV1Aktif = true;
    console.log('%c✅ MJO Backend Terhubung!', 'color:#10b981; font-weight:bold;');
})();
