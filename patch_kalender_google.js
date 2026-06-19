/**
 * ============================================================
 * PATCH: Tombol "Simpan ke Kalender Google" di Pop-Up Pengingat
 * PPL Milenial Wajo — Smart Farming
 * Versi: 3.2 (Hapus opsi simpan 1 jadwal, sisa simpan semua)
 * ============================================================
 *
 * CARA PASANG:
 * Letakkan file ini di folder yang sama dengan index.html,
 * lalu tambahkan baris ini sebelum </body> di index.html,
 * SETELAH baris patch_smartfarming.js:
 *
 * <script src="patch_kalender_google.js"></script>
 *
 * CARA KERJA:
 * Menggunakan window.open() bukan <a href> — di Android WebView,
 * URL calendar.google.com yang dibuka via window.open() akan
 * ditangkap sistem Android dan diteruskan ke app Google Calendar
 * yang sudah terinstall, bukan ke browser.
 * ============================================================
 */

(function () {

    // ─── JADWAL (sinkron dengan JADWAL_PEMUPUKAN di patch utama) ──────────────
    const JADWAL = [
        { hari: 7,  judul: '🌱 Pemupukan Tahap I',   pesan: 'Aplikasi Urea + Phonska (7-10 HST). Cek menu Dosis Pupuk untuk takaran.' },
        { hari: 21, judul: '🧪 Pemupukan Tahap II',  pesan: 'Fase anakan aktif. Pemupukan kedua (21-25 HST). Cek menu Dosis Pupuk.' },
        { hari: 45, judul: '🌾 Pemupukan Tahap III', pesan: 'Fase primordia/bunting awal. Cek BWD! Jika skala < 4, berikan Urea.' },
        { hari: 60, judul: '🌸 Fase Bunting',        pesan: 'Padi memasuki fase bunting. Jaga ketersediaan air & waspada hama WBC.' },
        { hari: 90, judul: '🚜 Persiapan Panen',     pesan: 'Kurangi pengairan lahan. Siapkan jadwal Combine Harvester.' },
    ];

    // ─── HELPER: Buat URL Google Calendar ────────────────────────────────────
    function buatUrlKalender(namaLahan, jadwal, tglTanamStr) {
        const tglTanam = new Date(tglTanamStr);
        tglTanam.setHours(7, 0, 0, 0);

        const tglEvent = new Date(tglTanam);
        tglEvent.setDate(tglEvent.getDate() + jadwal.hari);

        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) =>
            `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
            `T${pad(d.getHours())}${pad(d.getMinutes())}00`;

        const tglSelesai = new Date(tglEvent);
        tglSelesai.setHours(8, 0, 0, 0);

        const judul = `${jadwal.judul} — ${namaLahan}`;
        const deskripsi =
            `${jadwal.pesan}\n\nHari ke-${jadwal.hari} HST\nLahan: ${namaLahan}\n\n` +
            `📱 Buka Smart Farming PPL Milenial Wajo untuk detail dosis.`;

        return (
            `https://calendar.google.com/calendar/render?action=TEMPLATE` +
            `&text=${encodeURIComponent(judul)}` +
            `&dates=${fmt(tglEvent)}/${fmt(tglSelesai)}` +
            `&details=${encodeURIComponent(deskripsi)}` +
            `&reminder=1440`
        );
    }

    // ─── BUKA KALENDER VIA window.open() ─────────────────────────────────────
    window.bukaKalenderEvent = function (urlKalender) {
        window.open(urlKalender, '_blank');
    };

    // ─── FUNGSI: Tampilkan daftar semua jadwal untuk dipilih ─────────────────
    window.tampilkanPilihJadwal = function (namaLahan, tglTanam, warna) {
        const modal   = document.getElementById('customAlertModal');
        const icon    = document.getElementById('customAlertIcon');
        const message = document.getElementById('customAlertMessage');
        if (!modal) return;

        const items = JADWAL.map((j, i) => {
            const tgl = new Date(tglTanam);
            tgl.setDate(tgl.getDate() + j.hari);
            const tglStr = tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const url = buatUrlKalender(namaLahan, j, tglTanam);
            return `
                <button onclick="bukaKalenderEvent('${url}')"
                    style="width:100%; box-sizing:border-box; display:flex; align-items:center;
                           gap:10px; background:#111c2e; border:1px solid rgba(255,255,255,0.07);
                           border-radius:10px; padding:11px 12px; color:#fff; cursor:pointer;
                           font-family:inherit; font-size:0.8rem; font-weight:600;
                           text-align:left; margin-bottom:8px;">
                    <span style="font-size:1.1rem; flex-shrink:0;">📅</span>
                    <span style="flex:1; line-height:1.4;">
                        ${j.judul}<br>
                        <span style="font-size:0.7rem; color:#64748b; font-weight:400;">${tglStr} (Hari ke-${j.hari})</span>
                    </span>
                    <span style="font-size:0.7rem; color:#3b82f6; flex-shrink:0;">Simpan →</span>
                </button>
            `;
        }).join('');

        icon.innerHTML = '📅';
        message.innerHTML = `
            <div style="font-size:1rem; font-weight:800; color:${warna};
                        margin-bottom:12px; text-align:center; letter-spacing:0.5px;">
                PILIH JADWAL YANG AKAN DISIMPAN
            </div>
            <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:14px;
                        line-height:1.5; text-align:center;">
                Ketuk jadwal → Google Calendar terbuka → klik <b style="color:#10b981;">Simpan</b>
            </div>
            ${items}
            <button onclick="document.getElementById('customAlertModal').style.display='none'"
                    style="width:100%; box-sizing:border-box; background:transparent;
                           border:1px solid rgba(255,255,255,0.15); color:#64748b;
                           padding:11px; border-radius:10px; font-weight:700;
                           cursor:pointer; font-family:inherit; font-size:0.82rem;
                           margin-top:4px;">
                ✕ TUTUP
            </button>
        `;
        modal.style.display = 'flex';
    };

    // ─── OVERRIDE cekPengingatHariIni ────────────────────────────────────────
    const _cekPengingatAsli = window.cekPengingatHariIni;

    window.cekPengingatHariIni = function () {
        const lahan = (typeof getLahanAktif === 'function') ? getLahanAktif() : null;
        if (!lahan || !lahan.tglTanam) {
            if (typeof _cekPengingatAsli === 'function') _cekPengingatAsli();
            return;
        }

        const awal = new Date(lahan.tglTanam);
        awal.setHours(0, 0, 0, 0);
        const sekarang = new Date();
        sekarang.setHours(0, 0, 0, 0);
        const hariIni = Math.round((sekarang - awal) / 86400000);

        // Toleransi ±2 hari agar tidak terlewat
        const jadwalHariIni = JADWAL.find(j => Math.abs(j.hari - hariIni) <= 2);

        if (!jadwalHariIni) {
            if (typeof _cekPengingatAsli === 'function') _cekPengingatAsli();
            return;
        }

        const modal   = document.getElementById('customAlertModal');
        const icon    = document.getElementById('customAlertIcon');
        const message = document.getElementById('customAlertMessage');
        if (!modal) return;

        const warnaMap = {
            7: '#10b981', 21: '#3b82f6', 45: '#f59e0b', 60: '#d946ef', 90: '#10b981'
        };
        const warna = warnaMap[jadwalHariIni.hari] || '#3b82f6';

        const selisih = jadwalHariIni.hari - hariIni;
        const labelWaktu = selisih === 0
            ? `hari ini (Hari ke-${hariIni} HST)`
            : selisih > 0
                ? `${selisih} hari lagi (Hari ke-${jadwalHariIni.hari} HST)`
                : `${Math.abs(selisih)} hari lalu (Hari ke-${jadwalHariIni.hari} HST)`;

        icon.innerHTML = '🚨';
        message.innerHTML = `
            <span style="display:block; font-size:1.15rem; font-weight:800;
                         color:${warna}; text-shadow:0 0 10px ${warna}66;
                         margin-bottom:10px; letter-spacing:1px;">
                ${jadwalHariIni.judul.toUpperCase()}
            </span>

            <span style="display:block; color:#cbd5e1; font-size:0.88rem;
                         line-height:1.65; margin-bottom:16px;">
                Lahan <strong style="color:#fff;">"${lahan.nama}"</strong>
                — jadwal ini <b style="color:${warna};">${labelWaktu}</b>.<br><br>
                ${jadwalHariIni.pesan}
            </span>

            <button onclick="tampilkanPilihJadwal('${lahan.nama.replace(/'/g,"\\'")}','${lahan.tglTanam}','${warna}')"
                style="width:100%; box-sizing:border-box;
                       background:linear-gradient(135deg,rgba(217,70,239,0.25),rgba(139,92,246,0.25));
                       border:1px solid rgba(217,70,239,0.6); border-radius:12px;
                       color:#d946ef; padding:14px; font-weight:800; font-size:0.9rem;
                       cursor:pointer; font-family:inherit; letter-spacing:0.3px;
                       margin-bottom:12px; display:block;">
                📋 SIMPAN SEMUA 5 JADWAL SEKALIGUS
            </button>

            <div style="font-size:0.7rem; color:#64748b; text-align:center;
                        margin-bottom:14px; line-height:1.5;">
                Notifikasi otomatis muncul di HP walau app ditutup.<br>
                Pastikan notifikasi Google Calendar diizinkan.
            </div>

            <button onclick="document.getElementById('customAlertModal').style.display='none'"
                    style="background:transparent; border:1px solid ${warna};
                           color:${warna}; padding:11px 20px; border-radius:10px;
                           font-weight:700; cursor:pointer; width:100%; box-sizing:border-box;
                           font-family:inherit; font-size:0.85rem;">
                TUTUP PENGINGAT
            </button>
        `;

        modal.style.display = 'flex';

        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        // Badge merah di navbar bawah
        const fabNotif = document.getElementById('fabNotifBtn');
        if (fabNotif && !fabNotif.querySelector('.badge-notif')) {
            const badge = document.createElement('span');
            badge.className = 'badge-notif';
            badge.textContent = '!';
            fabNotif.appendChild(badge);
        }
    };

    console.log('✅ Patch Kalender Google v3.2: Tombol Simpan 1 Jadwal dihapus. Sisa Simpan Semua.');

})();
