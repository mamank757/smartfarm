(function () {
    'use strict';

    // Interval untuk memantau apakah grafik sudah ada
    var interval = setInterval(function () {
        // 1. Cek apakah chart dan data iklim tersedia
        if (typeof localChartInstance !== 'undefined' && 
            typeof window._deteksiPerairan === 'function') {
            
            // 2. Ambil koordinat saat ini
            var gps = (window._bacaKoordinatGPS) ? window._bacaKoordinatGPS() : {lat: -5.0, lon: 120.0};
            
            // 3. Ambil nama wilayah dinamis dari patch_iklim_terpadu
            var zona = window._deteksiPerairan(gps.lat, gps.lon);
            var n1 = zona.nama1;
            var n2 = zona.nama2;

            // 4. Update label dataset Chart.js secara paksa
            var ds = localChartInstance.data.datasets;
            if (ds[0].label !== n1 || ds[1].label !== n2) {
                ds[0].label = n1;
                ds[1].label = n2;
                localChartInstance.update('none'); // Update tanpa animasi agar cepat
                console.log("✅ [Fix Label] Label grafik berhasil diupdate ke: " + n1 + " & " + n2);
            }

            // 5. Update legend HTML (jika ada elemen span di bawah grafik)
            var legends = document.querySelectorAll('#localSstBox span');
            if (legends.length >= 2) {
                // Asumsi: span 0 untuk legend 1, span 1 untuk legend 2
                // Sesuaikan index jika HTML Anda memiliki span lain
                if(legends[0].textContent.includes('Bone') || legends[0].textContent.includes('Makassar')) legends[0].textContent = n1;
                if(legends[1].textContent.includes('Bone') || legends[1].textContent.includes('Makassar')) legends[1].textContent = n2;
            }
        }
    }, 1000); // Cek setiap 1 detik

    // Berhenti setelah 10 detik agar tidak membebani memori
    setTimeout(function() { clearInterval(interval); }, 10000);
})();
