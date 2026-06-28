(function () {
    'use strict';

    // Interval untuk memastikan label selalu benar, meskipun tertimpa skrip lain
    var intervalLabel = setInterval(function () {
        // 1. Ambil data zona dari patch_iklim_terpadu_v1
        var gps = (window._bacaKoordinatGPS) ? window._bacaKoordinatGPS() : {lat: -7.5, lon: 112.5};
        var zona = (window._deteksiPerairan) ? window._deteksiPerairan(gps.lat, gps.lon) : null;

        if (!zona) return;

        // 2. FORCE UPDATE CHART DATASETS (Jika grafik sudah ada)
        if (typeof localChartInstance !== 'undefined' && localChartInstance) {
            var ds = localChartInstance.data.datasets;
            if (ds[0] && ds[0].label !== zona.nama1) {
                ds[0].label = zona.nama1;
                ds[1].label = zona.nama2;
                localChartInstance.update('none');
            }
        }

        // 3. FORCE UPDATE TEXT HEADER (Di atas grafik)
        // Mencari elemen berdasarkan kemiripan teks agar tidak bergantung ID
        var h4s = document.querySelectorAll('div, span, h4, p');
        for (var i = 0; i < h4s.length; i++) {
            var el = h4s[i];
            var teks = el.innerText;
            // Jika elemen mengandung kata "Laut Jawa" atau "Teluk Bone" tapi bukan label yang benar, ganti!
            if (teks.includes('Laut Jawa') || teks.includes('Teluk Bone') || teks.includes('Selat Makassar')) {
                if (teks.includes('°C')) { // Hanya target elemen yang menampilkan angka suhu
                    el.innerHTML = teks
                        .replace(/Laut Jawa|Teluk Bone/g, zona.nama1)
                        .replace(/Samudra Hindia Selatan Jawa|Selat Makassar/g, zona.nama2);
                }
            }
        }
    }, 800); // Cek setiap 800ms
})();
