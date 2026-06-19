/**
 * ============================================================
 *  PATCH: Tombol "Simpan ke Kalender Google" di Pop-Up Pengingat
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 2.0
 * ============================================================
 *
 *  CARA PASANG:
 *  Letakkan file ini di folder yang sama dengan index.html,
 *  lalu tambahkan baris ini sebelum </body> di index.html,
 *  SETELAH baris patch_smartfarming.js:
 *
 *    <script src="patch_kalender_google.js"></script>
 *
 *  CARA KERJA:
 *  Patch ini menggantikan fungsi cekPengingatHariIni() agar
 *  pop-up pengingat pemupukan langsung menampilkan tombol
 *  "📅 Simpan ke Google Calendar" di bawah tombol tutup.
 *  Petani tidak perlu buka menu lain — langsung dari notifikasi.
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

    // ─── HELPER: Buat URL Google Calendar untuk satu event ───────────────────
    function buatUrlKalender(namaLahan, jadwal, tglTanamStr) {
        const tglTanam = new Date(tglTanamStr);
        tglTanam.setHours(7, 0, 0, 0);

        const tglEvent = new Date(tglTanam);
        tglEvent.setDate(tglEvent.getDate() + jadwal.hari);

        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) =>
            `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
            `T${pad(d.getHours())}${pad(d.getMinutes())}00`;

        const tglMulai = fmt(tglEvent);
        const tglSelesai = (() => {
            const akhir = new Date(tglEvent);
            akhir.setHours(8, 0, 0, 0);
            return fmt(akhir);
        })();

        const judul = `${jadwal.judul} — ${namaLahan}`;
        const deskripsi =
            `${jadwal.pesan}\n\nHari ke-${jadwal.hari} HST\nLahan: ${namaLahan}\n\n` +
            `📱 Buka Smart Farming PPL Milenial Wajo untuk detail dosis.`;

        return (
            `https://calendar.google.com/calendar/render?action=TEMPLATE` +
            `&text=${encodeURIComponent(judul)}` +
            `&dates=${tglMulai}/${tglSelesai}` +
            `&details=${encodeURIComponent(deskripsi)}` +
            `&reminder=1440`
        );
    }

    // ─── OVERRIDE cekPengingatHariIni ────────────────────────────────────────
    // Simpan referensi asli (dari patch_smartfarming.js)
    const _cekPengingatAsli = window.cekPengingatHariIni;

    window.cekPengingatHariIni = function () {
        const lahan = (typeof getLahanAktif === 'function') ? getLahanAktif() : null;
        if (!lahan || !lahan.tglTanam) {
            // Tidak ada lahan aktif — jalankan fungsi asli saja
            if (typeof _cekPengingatAsli === 'function') _cekPengingatAsli();
            return;
        }

        const awal = new Date(lahan.tglTanam);
        awal.setHours(0, 0, 0, 0);
        const sekarang = new Date();
        sekarang.setHours(0, 0, 0, 0);
        const hariIni = Math.round((sekarang - awal) / 86400000);

        // Cari jadwal yang cocok dengan hari ini
        // Toleransi ±2 hari agar tidak terlewat jika petani jarang buka app
        const jadwalHariIni = JADWAL.find(j => Math.abs(j.hari - hariIni) <= 2);

        if (!jadwalHariIni) {
            // Tidak ada jadwal hari ini — jalankan fungsi asli
            if (typeof _cekPengingatAsli === 'function') _cekPengingatAsli();
            return;
        }

        const modal   = document.getElementById('customAlertModal');
        const icon    = document.getElementById('customAlertIcon');
        const message = document.getElementById('customAlertMessage');
        if (!modal) return;

        // Tentukan warna berdasarkan jadwal
        const warnaMap = {
            7: '#10b981', 21: '#3b82f6', 45: '#f59e0b', 60: '#d946ef', 90: '#10b981'
        };
        const warna = warnaMap[jadwalHariIni.hari] || '#3b82f6';

        // Selisih hari (positif = belum tiba, negatif = sudah lewat, 0 = hari ini)
        const selisih = jadwalHariIni.hari - hariIni;
        const labelWaktu = selisih === 0
            ? `hari ini (Hari ke-${hariIni} HST)`
            : selisih > 0
                ? `${selisih} hari lagi (Hari ke-${jadwalHariIni.hari} HST)`
                : `${Math.abs(selisih)} hari lalu (Hari ke-${jadwalHariIni.hari} HST)`;

        // Buat URL kalender khusus untuk jadwal ini saja
        const urlKalender = buatUrlKalender(lahan.nama, jadwalHariIni, lahan.tglTanam);

        icon.innerHTML = '🚨';
        message.innerHTML = `
            <span style="display:block; font-size:1.15rem; font-weight:800;
                         color:${warna}; text-shadow:0 0 10px ${warna}66;
                         margin-bottom:10px; letter-spacing:1px;">
                ${jadwalHariIni.judul.toUpperCase()}
            </span>

            <span style="display:block; color:#cbd5e1; font-size:0.88rem;
                         line-height:1.65; margin-bottom:16px;">
                Untuk lahan <strong style="color:#fff;">"${lahan.nama}"</strong>
                — jadwal ini jatuh <b style="color:${warna};">${labelWaktu}</b>.<br><br>
                ${jadwalHariIni.pesan}
            </span>

            <!-- Tombol utama: Simpan ke Google Calendar -->
            <a href="${urlKalender}" target="_blank" rel="noopener"
               onclick="document.getElementById('customAlertModal').style.display='none'"
               style="display:block; width:100%; box-sizing:border-box;
                      background:linear-gradient(135deg,rgba(217,70,239,0.25),rgba(139,92,246,0.25));
                      border:1px solid rgba(217,70,239,0.6); border-radius:12px;
                      color:#d946ef; padding:14px; font-weight:800; font-size:0.88rem;
                      text-decoration:none; text-align:center; letter-spacing:0.3px;
                      margin-bottom:10px; cursor:pointer;">
                📅 SIMPAN KE GOOGLE CALENDAR
            </a>

            <!-- Info kecil di bawah tombol kalender -->
            <div style="font-size:0.7rem; color:#64748b; text-align:center;
                        margin-bottom:14px; line-height:1.5;">
                Notifikasi otomatis di HP walau app ditutup.<br>
                Pastikan izin notifikasi Google Calendar aktif.
            </div>

            <!-- Tombol tutup -->
            <button onclick="document.getElementById('customAlertModal').style.display='none'"
                    style="background:transparent; border:1px solid ${warna};
                           color:${warna}; padding:11px 20px; border-radius:10px;
                           font-weight:700; cursor:pointer; width:100%;
                           font-family:inherit; font-size:0.85rem; transition:all 0.2s;">
                TUTUP PENGINGAT
            </button>
        `;

        modal.style.display = 'flex';

        // Getar HP
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

    console.log('✅ Patch Kalender Google v2.0: Tombol Calendar langsung di pop-up pengingat aktif.');

})();
