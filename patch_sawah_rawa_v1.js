/**
 * ============================================================
 * patch_sawah_rawa_v1.js
 * Diferensiasi Jenis Sawah — PPL Milenial Wajo
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__sawahRawaV1Aktif) return;

    // --- HELPER ---
    function getJenisSawah() {
        var el = document.getElementById('selectJenisSawahRisiko')
              || document.getElementById('selectJenisSawahKalender')
              || document.getElementById('selectJenisSawahJTO');
        return el ? el.value : 'irigasi';
    }

    function isBulanBanjir(baselineData, bulanIndex) {
        if (!baselineData || baselineData.length < 12) return false;
        var sorted = baselineData.slice().sort(function(a, b){ return b - a; });
        var threshold = sorted[2];
        var bulanIni = baselineData[bulanIndex];
        var bulanSebelum = baselineData[(bulanIndex - 1 + 12) % 12];
        return bulanIni >= threshold || bulanSebelum >= threshold;
    }

    function skorBanjir(baselineData, bulanIndex) {
        if (!baselineData || baselineData.length < 12) return 50;
        var max = Math.max.apply(null, baselineData);
        var min = Math.min.apply(null, baselineData);
        var range = max - min || 1;
        return Math.round(((baselineData[bulanIndex] - min) / range) * 100);
    }

    // --- UI INJECTION ---
    var HTML_DROPDOWN_RISIKO = '<div class="form-group" id="groupJenisSawahRisiko" style="margin-bottom:14px;"><label>🌊 JENIS LAHAN SAWAH</label><select id="selectJenisSawahRisiko" class="form-select" onchange="window.__rawaOnChange(event)"><option value="irigasi">💧 Irigasi / Tadah Hujan</option><option value="rawa">🌿 Sawah Rawa / Lebak / DAS</option></select><div id="infoJenisSawahRisiko" style="margin-top:8px;padding:10px;border-radius:8px;font-size:0.78rem;display:none;background:rgba(59,130,246,0.1);border-left:3px solid #3b82f6;"></div></div>';
    var HTML_DROPDOWN_JTO = '<div class="form-group" id="groupJenisSawahJTO" style="margin-bottom:14px;"><label>🌊 JENIS LAHAN SAWAH</label><select id="selectJenisSawahJTO" class="form-select" onchange="window.__rawaOnChange(event)"><option value="irigasi">💧 Irigasi / Tadah Hujan</option><option value="rawa">🌿 Sawah Rawa / Lebak / DAS</option></select></div>';
    
    function injectDropdowns() {
        var boxKalender = document.getElementById('boxKalender');
        if (boxKalender && !document.getElementById('groupJenisSawahRisiko')) {
            boxKalender.insertAdjacentHTML('afterbegin', HTML_DROPDOWN_RISIKO);
        }
        var boxJTO = document.getElementById('boxJadwalTanam');
        if (boxJTO && !document.getElementById('groupJenisSawahJTO')) {
            boxJTO.insertAdjacentHTML('afterbegin', HTML_DROPDOWN_JTO);
        }
    }

    window.__rawaOnChange = function(event) {
        var val = event.target.value;
        ['selectJenisSawahRisiko', 'selectJenisSawahJTO'].forEach(function(id){
            var el = document.getElementById(id);
            if (el) el.value = val;
        });
        var info = document.getElementById('infoJenisSawahRisiko');
        if (info) {
            info.style.display = (val === 'rawa' ? 'block' : 'none');
            info.innerHTML = '<b>Sawah Rawa:</b> Sistem mencari jendela aman antara dua periode banjir.';
        }
    };

    // --- OVERRIDE RISIKO DINAMIS ---
    var _hitungRisikoDinamisAsli = window.hitungRisikoDinamis;
    window.hitungRisikoDinamis = function(bulanIndex, fase, ensoVal, iodVal, baselineData) {
        if (getJenisSawah() === 'rawa') {
            var sb = skorBanjir(baselineData, bulanIndex);
            var banjirAktif = isBulanBanjir(baselineData, bulanIndex);
            var skor = banjirAktif ? 90 : sb;
            return { skor: skor, statusCuaca: banjirAktif ? 'Banjir' : 'Normal', masalah: '-', tipeBahaya: banjirAktif ? 'banjir' : 'aman' };
        }
        return _hitungRisikoDinamisAsli ? _hitungRisikoDinamisAsli(bulanIndex, fase, ensoVal, iodVal, baselineData) : { skor: 50 };
    };

    // --- OVERRIDE WINDOW TANAM (WRAPPER AMAN) ---
    var _rekomendasiWindowTanamAsli = window.rekomendasiWindowTanam;

    function rekomendasiRawa(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        var now = new Date();
        var tahun = now.getFullYear();
        var sorted = rawZOM.map(function(v, i){ return { v: v, i: i }; }).sort(function(a, b){ return b.v - a.v; });
        var banjirSet = {};
        for (var k = 0; k < 3; k++) {
            banjirSet[sorted[k].i] = true;
            banjirSet[(sorted[k].i + 1) % 12] = true; 
        }
        var bulanAman = [];
        for (var m = 0; m < 12; m++) { if (!banjirSet[m]) bulanAman.push(m); }
        if (bulanAman.length === 0) bulanAman = [0, 6]; 

        var varianArr = [
            { kode: 'genjah', label: 'Genjah (< 95 HST)', panen: 90 },
            { kode: 'sedang', label: 'Sedang (95–115 HST)', panen: 110 }
        ];

        var kandidat = [];
        bulanAman.forEach(function(bOlah) {
            varianArr.forEach(function(v) {
                var tglOlah = new Date(tahun, bOlah, 15);
                var tglTanam = new Date(tglOlah); tglTanam.setDate(tglTanam.getDate() + 20);
                var tglPanen = new Date(tglTanam); tglPanen.setDate(tglPanen.getDate() + v.panen);
                var bPanen = tglPanen.getMonth();

                if (!banjirSet[bPanen] && !banjirSet[(bPanen + 1) % 12]) {
                    kandidat.push({
                        tglOlahTanah: tglOlah, tglTanam: tglTanam, tglPanen: tglPanen,
                        varietas: v.kode, labelVar: v.label,
                        nilaiTotal: 100 - skorBulan[bPanen]
                    });
                }
            });
        });

        kandidat.sort(function(a, b){ return b.nilaiTotal - a.nilaiTotal; });
        var hasil = [];
        kandidat.forEach(function(k) {
            if (hasil.length < 2) hasil.push({
                musimNama: hasil.length === 0 ? 'MT I Rawa' : 'MT II Rawa',
                tglOlahTanah: k.tglOlahTanah, tglTanam: k.tglTanam, tglPanen: k.tglPanen,
                varietas: k.varietas, labelVar: k.labelVar
            });
        });
        return hasil;
    }

    // Fungsi Pengganti yang Aman
    window.rekomendasiWindowTanam = function(skorBulan, rawZOM, zona, ensoVal, iodVal) {
        // Cek apakah mode Rawa
        if (getJenisSawah() === 'rawa') {
            console.log('✅ [RAWA] Mode Rawa Aktif');
            return rekomendasiRawa(skorBulan, rawZOM, zona, ensoVal || 0, iodVal || 0);
        }
        
        // PENTING: Jika bukan Rawa, kembalikan ke fungsi asli 100%
        if (typeof _rekomendasiWindowTanamAsli === 'function') {
            return _rekomendasiWindowTanamAsli(skorBulan, rawZOM, zona, ensoVal, iodVal);
        }
        return [];
    };

    // --- INIT ---
    function init() {
        injectDropdowns();
        window.__sawahRawaV1Aktif = true;
        console.log('✅ [RAWA] Patched - Tadah Hujan/Irigasi Safe');
    }
    
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
