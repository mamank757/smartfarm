/**
 * ============================================================
 *  PATCH: Tombol "Simpan ke Kalender Google"
 *  PPL Milenial Wajo — Smart Farming
 *  Versi: 1.0
 * ============================================================
 *
 *  CARA PASANG:
 *  Letakkan file ini di folder yang sama dengan index.html,
 *  lalu tambahkan baris ini sebelum tag </body> di index.html:
 *    <script src="patch_kalender_google.js"></script>
 *
 *  CARA KERJA:
 *  Patch ini membaca data lahan aktif (tanggal tanam, nama lahan)
 *  yang sudah tersimpan di localStorage oleh patch_smartfarming.js,
 *  lalu menambahkan tombol "📅 Simpan Semua ke Kalender Google"
 *  di dalam panel notifikasi (panelNotif) yang sudah ada.
 *
 *  Saat tombol ditekan, browser membuka Google Calendar
 *  dengan jadwal pemupukan yang sudah terisi otomatis.
 *  Petani tinggal klik SIMPAN di Google Calendar — selesai.
 *  Notifikasi otomatis akan muncul dari Google Calendar,
 *  bahkan saat aplikasi ditutup.
 *
 *  TIDAK butuh server, TIDAK butuh upgrade Median.
 * ============================================================
 */

(function () {

    // ─── JADWAL (sinkron dengan JADWAL_PEMUPUKAN di patch utama) ──────────────
    const JADWAL = [
        { hari: 7,  judul: '🌱 Pemupukan Tahap I',    ringkasan: 'Aplikasi Urea + Phonska (7-10 HST). Cek menu Dosis Pupuk untuk takaran.' },
        { hari: 21, judul: '🧪 Pemupukan Tahap II',   ringkasan: 'Fase anakan aktif. Pemupukan kedua (21-25 HST). Cek menu Dosis Pupuk.' },
        { hari: 45, judul: '🌾 Pemupukan Tahap III',  ringkasan: 'Fase primordia/bunting awal. Cek BWD! Jika skala < 4, berikan Urea.' },
        { hari: 60, judul: '🌸 Fase Bunting',         ringkasan: 'Padi memasuki fase bunting. Jaga ketersediaan air & waspada hama WBC.' },
        { hari: 90, judul: '🚜 Persiapan Panen',      ringkasan: 'Kurangi pengairan lahan. Siapkan jadwal Combine Harvester.' },
    ];

    // ─── HELPER: Buat URL Google Calendar untuk satu event ───────────────────
    function buatUrlKalender(namaLahan, jadwal, tglTanamStr) {
        const tglTanam = new Date(tglTanamStr);
        tglTanam.setHours(7, 0, 0, 0); // Set jam 07:00 pagi

        const tglEvent = new Date(tglTanam);
        tglEvent.setDate(tglEvent.getDate() + jadwal.hari);

        // Format YYYYMMDDTHHMMSS (lokal)
        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) =>
            `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
            `T${pad(d.getHours())}${pad(d.getMinutes())}00`;

        const tglMulai = fmt(tglEvent);
        const tglSelesai = (() => {
            const akhir = new Date(tglEvent);
            akhir.setHours(8, 0, 0, 0); // Durasi 1 jam
            return fmt(akhir);
        })();

        const judul = `${jadwal.judul} — ${namaLahan}`;
        const deskripsi = `${jadwal.ringkasan}\n\nHari ke-${jadwal.hari} HST\nLahan: ${namaLahan}\n\n📱 Buka Smart Farming PPL Milenial Wajo untuk detail.`;

        return (
            `https://calendar.google.com/calendar/render?action=TEMPLATE` +
            `&text=${encodeURIComponent(judul)}` +
            `&dates=${tglMulai}/${tglSelesai}` +
            `&details=${encodeURIComponent(deskripsi)}` +
            `&reminder=1440` // Ingatkan 1 hari (1440 menit) sebelumnya
        );
    }

    // ─── FUNGSI UTAMA: Simpan satu per satu dengan jeda ─────────────────────
    // Google Calendar tidak mendukung buka banyak tab sekaligus di mobile,
    // jadi kita buka satu event dulu, beri jeda, lalu tampilkan panduan.
    window.simpanSemuaKeKalender = function () {
        const lahan = getLahanAktif ? getLahanAktif() : null;

        if (!lahan || !lahan.tglTanam) {
            tampilkanToast('⚠️', 'Pilih Lahan Dulu', 'Aktifkan lahan sawah terlebih dahulu di menu Daftar Sawah.', '#ef4444');
            return;
        }

        const modal = document.getElementById('customAlertModal');
        const icon  = document.getElementById('customAlertIcon');
        const msg   = document.getElementById('customAlertMessage');
        if (!modal) return;

        // Buat semua URL terlebih dahulu
        const urls = JADWAL.map(j => ({
            label: `${j.judul} (Hari ke-${j.hari})`,
            url: buatUrlKalender(lahan.nama, j, lahan.tglTanam)
        }));

        // Tampilkan daftar link di modal ─────────────────────────────────────
        icon.innerHTML = '📅';
        msg.innerHTML = `
            <div style="text-align:left;">
                <div style="font-size:1rem; font-weight:800; color:#d946ef; margin-bottom:12px; text-align:center;">
                    SIMPAN JADWAL KE GOOGLE CALENDAR
                </div>
                <div style="font-size:0.78rem; color:#94a3b8; line-height:1.6; margin-bottom:14px; background:rgba(0,0,0,0.2); border-radius:8px; padding:10px;">
                    🌾 <b style="color:#fff;">Lahan: ${lahan.nama}</b><br>
                    📅 Tanam: <b style="color:#fff;">${new Date(lahan.tglTanam).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}</b><br><br>
                    Ketuk setiap tombol di bawah. Google Calendar akan terbuka dengan jadwal yang sudah terisi — Anda tinggal klik <b style="color:#10b981;">Simpan</b>.
                </div>
                <div id="daftarLinkKalender" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
                    ${urls.map((item, i) => `
                        <a href="${item.url}" target="_blank" rel="noopener"
                           style="display:flex; align-items:center; gap:10px;
                                  background:#111c2e; border:1px solid rgba(217,70,239,0.25);
                                  border-radius:10px; padding:10px 12px;
                                  color:#fff; text-decoration:none; font-size:0.8rem; font-weight:600;"
                           onclick="tandaiTersimpan(${i})">
                            <span id="iconKal_${i}" style="font-size:1.1rem;">📅</span>
                            <span>${item.label}</span>
                            <span id="statusKal_${i}" style="margin-left:auto; font-size:0.7rem; color:#64748b;">Belum</span>
                        </a>
                    `).join('')}
                </div>
                <div style="font-size:0.72rem; color:#64748b; line-height:1.6; margin-bottom:14px;">
                    💡 <b style="color:#94a3b8;">Tips:</b> Setelah simpan di Google Calendar, notifikasi akan muncul otomatis di HP Anda walau aplikasi ini ditutup. Pastikan notifikasi Google Calendar diaktifkan di HP.
                </div>
                <button onclick="document.getElementById('customAlertModal').style.display='none'"
                        style="width:100%; background:rgba(217,70,239,0.15); border:1px solid rgba(217,70,239,0.4);
                               color:#d946ef; padding:12px; border-radius:10px; font-weight:700; cursor:pointer;
                               font-family:inherit; font-size:0.85rem;">
                    ✅ SELESAI
                </button>
            </div>
        `;
        modal.style.display = 'flex';
    };

    // ─── Tandai link yang sudah dibuka ───────────────────────────────────────
    window.tandaiTersimpan = function (index) {
        setTimeout(() => {
            const icon   = document.getElementById(`iconKal_${index}`);
            const status = document.getElementById(`statusKal_${index}`);
            if (icon)   icon.textContent   = '✅';
            if (status) {
                status.textContent = 'Dibuka';
                status.style.color = '#10b981';
            }
        }, 500);
    };

    // ─── INJECT TOMBOL KE PANEL NOTIF ────────────────────────────────────────
    // Menunggu hingga renderJadwalNotif() dipanggil, lalu sisipkan tombol
    const _renderJadwalNotifAsli = window.renderJadwalNotif;

    window.renderJadwalNotif = function () {
        // Jalankan fungsi asli dulu
        if (typeof _renderJadwalNotifAsli === 'function') {
            _renderJadwalNotifAsli();
        }

        // Tambahkan tombol setelah konten render selesai
        const container = document.getElementById('kontenNotif');
        if (!container) return;

        // Hindari duplikat jika render dipanggil berkali-kali
        if (container.querySelector('#btnSimpanKalender')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-top: 16px;';
        wrapper.innerHTML = `
            <button id="btnSimpanKalender"
                onclick="simpanSemuaKeKalender()"
                style="
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, rgba(217,70,239,0.2), rgba(139,92,246,0.2));
                    border: 1px solid rgba(217,70,239,0.5);
                    border-radius: 14px;
                    color: #d946ef;
                    font-weight: 700;
                    font-size: 0.88rem;
                    cursor: pointer;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    letter-spacing: 0.3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                ">
                📅 SIMPAN SEMUA JADWAL KE GOOGLE CALENDAR
            </button>
            <div style="text-align:center; margin-top:8px; font-size:0.7rem; color:#64748b; line-height:1.5;">
                Notifikasi otomatis via Google Calendar — gratis, tanpa server
            </div>
        `;
        container.appendChild(wrapper);
    };

    // ─── JUGA TAMBAHKAN TOMBOL di outputHasilPupuk (setelah hitung pupuk) ───
    // Setiap kali hasil rekomendasi pupuk ditampilkan, tambahkan tombol kalender
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            const output = document.getElementById('outputHasilPupuk');
            if (!output || output.style.display === 'none') return;
            if (output.querySelector('#btnKalenderPupuk')) return;

            const lahan = getLahanAktif ? getLahanAktif() : null;
            const tgl   = document.getElementById('tanggalTanam')
                          ? document.getElementById('tanggalTanam').value
                          : (lahan ? lahan.tglTanam : '');

            if (!tgl) return;

            // Gunakan nama lahan jika ada, atau teks generik
            const namaLahan = lahan ? lahan.nama : 'Sawah Saya';

            const div = document.createElement('div');
            div.style.cssText = 'margin-top: 16px;';
            div.innerHTML = `
                <button id="btnKalenderPupuk"
                    onclick="simpanDariPupuk()"
                    style="
                        width: 100%;
                        padding: 14px;
                        background: linear-gradient(135deg, rgba(217,70,239,0.2), rgba(139,92,246,0.2));
                        border: 1px solid rgba(217,70,239,0.5);
                        border-radius: 14px;
                        color: #d946ef;
                        font-weight: 700;
                        font-size: 0.85rem;
                        cursor: pointer;
                        font-family: 'Plus Jakarta Sans', sans-serif;
                        gap: 8px;
                        margin-top: 4px;
                    ">
                    📅 SIMPAN JADWAL INI KE GOOGLE CALENDAR
                </button>
                <div style="text-align:center; margin-top:6px; font-size:0.7rem; color:#64748b;">
                    Supaya HP Anda mengingatkan otomatis tanpa buka aplikasi
                </div>
            `;
            output.appendChild(div);
        });
    });

    // Mulai observasi saat DOM siap
    document.addEventListener('DOMContentLoaded', function () {
        const target = document.getElementById('outputHasilPupuk');
        if (target) {
            observer.observe(target, { attributes: true, attributeFilter: ['style'] });
        }
    });

    // Fallback jika DOM sudah siap sebelum script ini dijalankan
    if (document.readyState !== 'loading') {
        const target = document.getElementById('outputHasilPupuk');
        if (target) {
            observer.observe(target, { attributes: true, attributeFilter: ['style'] });
        }
    }

    // ─── Fungsi untuk tombol di halaman pupuk ────────────────────────────────
    window.simpanDariPupuk = function () {
        // Ambil tanggal dari field pupuk jika lahan aktif belum ada
        const lahan     = getLahanAktif ? getLahanAktif() : null;
        const tglField  = document.getElementById('tanggalTanam');
        const tglTanam  = tglField ? tglField.value : (lahan ? lahan.tglTanam : '');
        const namaLahan = lahan ? lahan.nama : (tglTanam ? 'Sawah Saya' : null);

        if (!tglTanam) {
            tampilkanToast('⚠️', 'Tanggal Belum Diisi', 'Isi tanggal tanam terlebih dahulu.', '#ef4444');
            return;
        }

        // Simpan sementara agar simpanSemuaKeKalender bisa membacanya
        window._tempLahanKalender = { nama: namaLahan || 'Sawah Saya', tglTanam };

        // Override getLahanAktif sementara jika lahan belum terset
        const _getLahanAsli = window.getLahanAktif;
        if (!lahan) {
            window.getLahanAktif = () => window._tempLahanKalender;
        }

        simpanSemuaKeKalender();

        // Kembalikan fungsi asli
        if (!lahan) {
            window.getLahanAktif = _getLahanAsli;
        }
    };

    console.log('✅ Patch Kalender Google berhasil dimuat: Tombol Simpan ke Google Calendar aktif.');

})();
