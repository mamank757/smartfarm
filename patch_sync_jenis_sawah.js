/**
 * patch_sync_jenis_sawah.js
 * Sinkronkan #selectJenisSawahRisiko (tab Risiko Iklim) dan
 * #selectJenisSawahJTO (tab Kalender TNM) agar selalu sama.
 * Muat SETELAH patch_sawah_rawa_v1.3.js
 */
(function () {
    'use strict';
    if (window.__syncJenisSawahAktif) return;

    var KEY = 'sf_jenis_sawah_global';

    function ambilTersimpan() {
        try { return localStorage.getItem(KEY) || 'irigasi'; } catch (e) { return 'irigasi'; }
    }
    function simpan(val) {
        try { localStorage.setItem(KEY, val); } catch (e) {}
    }

    function terapkanKeSemuaSelect(val, kecuali) {
        ['selectJenisSawahRisiko', 'selectJenisSawahJTO'].forEach(function (id) {
            if (id === kecuali) return;
            var el = document.getElementById(id);
            if (el && el.value !== val) {
                el.value = val;
                el.dispatchEvent(new Event('change'));
            }
        });
    }

    function pasangListener() {
        var elRisiko = document.getElementById('selectJenisSawahRisiko');
        var elJTO    = document.getElementById('selectJenisSawahJTO');

        if (elRisiko && !elRisiko._syncAttached) {
            elRisiko._syncAttached = true;
            elRisiko.value = ambilTersimpan();
            if (typeof window.__rawaOnChange === 'function') window.__rawaOnChange();
            elRisiko.addEventListener('change', function () {
                simpan(elRisiko.value);
                terapkanKeSemuaSelect(elRisiko.value, 'selectJenisSawahRisiko');
            });
        }

        if (elJTO && !elJTO._syncAttached) {
            elJTO._syncAttached = true;
            elJTO.value = ambilTersimpan();
            if (typeof window.__rawaOnChangeJTO === 'function') window.__rawaOnChangeJTO();
            elJTO.addEventListener('change', function () {
                simpan(elJTO.value);
                terapkanKeSemuaSelect(elJTO.value, 'selectJenisSawahJTO');
            });
        }
    }

    // Dropdown diinjeksi on-demand saat switchMode ke kalender/jadwaltanam,
    // jadi kita observe body agar begitu muncul langsung disinkronkan.
    var observer = new MutationObserver(function () { pasangListener(); });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(pasangListener, 1000);
    window.__syncJenisSawahAktif = true;
    console.log('%c✅ patch_sync_jenis_sawah.js aktif — dropdown Risiko Iklim & Kalender TNM disinkronkan', 'color:#10b981;font-weight:bold;');
})();
