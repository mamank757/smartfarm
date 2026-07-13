/**
 * ============================================================
 * patch_kalkulator_panen.js  (v2.0 — retema mengikuti tema gelap app)
 * Tab baru: KALKULATOR PANEN — Prediksi Hasil Panen Padi
 * ------------------------------------------------------------
 * Diadaptasi dari halaman mandiri "Kalkulator Prediksi Panen Padi"
 * (model kehilangan hasil multiplikatif — air, tanah, Wereng Batang
 * Coklat, Tikus, Penggerek Batang/Beluk, Hawar Daun Bakteri).
 * Rujukan ilmiah tetap dipertahankan persis seperti aslinya
 * (Savary & Willocquet — RICEPEST; Suparyono & Sudir 1992; BB Padi;
 * Cybex Pertanian; Pusdatin).
 *
 * [v2.0] RETEMA — versi v1.0 memakai tema "kertas/terrace" (krem,
 * hijau tua, font Fraunces+IBM Plex) bawaan halaman mandiri aslinya.
 * Versi ini disesuaikan penuh ke tema gelap aplikasi:
 *   - Font: 'Plus Jakarta Sans' (SUDAH dimuat oleh index.html sendiri
 *     — tidak perlu lagi injeksi Google Fonts Fraunces/IBM Plex)
 *   - Background kartu: #111c2e (sama seperti .info-box bawaan app)
 *     mewarisi background gelap .card, bukan panel krem sendiri
 *   - Bingkai: border-left 4px warna aksen (pola .info-box bawaan
 *     app), bukan border penuh gaya "kertas"
 *   - Badge status: rgba(warna,0.15) + border rgba(warna,0.3~0.4)
 *     — pola yang sama dipakai di badge "🟢 Aktif" pada Kalender TNM
 *
 * ARSITEKTUR mekanis (tab/box/switchMode) TIDAK berubah dari v1.0.
 *
 * CARA PASANG:
 *   <script src="patch_kalkulator_panen.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__kalkulatorPanenAktif) {
        console.warn('[kalkulator_panen] sudah aktif, skip.');
        return;
    }

    var WARNA = '#65a30d'; // hijau-lime — belum dipakai accent lain di app ini

    // ============================================================
    //  0. RESOURCE BERSAMA — hanya Tailwind CDN (font Plus Jakarta
    //  Sans SUDAH dimuat index.html sendiri, tidak perlu diinjeksi
    //  lagi). Guard anti-duplikat sama dengan patch_kalkulator_tanam.js.
    // ============================================================
    function muatResourceBersama() {
        if (!window.__tailwindCDNKalkulatorDimuat) {
            var s = document.createElement('script');
            s.src = 'https://cdn.tailwindcss.com';
            s.id = 'tailwindCDNKalkulator';
            document.head.appendChild(s);
            window.__tailwindCDNKalkulatorDimuat = true;
        }
    }

    // ============================================================
    //  1. CSS — di-scope ke #boxKalkulatorPanen, memakai variabel &
    //  konvensi warna yang SAMA dengan .info-box / .card bawaan app.
    // ============================================================
    function injeksiCSS() {
        if (document.getElementById('cssKalkulatorPanen')) return;
        var css = `
#boxKalkulatorPanen{
  --kp-dalam:#10b981; --kp-dalam-soft:rgba(16,185,129,0.15);
  --kp-rain:#38b6ff;  --kp-rain-soft:rgba(56,182,255,0.15);
  --kp-soil:#f59e0b;  --kp-soil-soft:rgba(245,158,11,0.15);
  --kp-warn:#ef4444;  --kp-warn-soft:rgba(239,68,68,0.15);
  --kp-gold:#fbbf24;  --kp-gold-soft:rgba(251,191,36,0.15);
  font-family:'Plus Jakarta Sans',sans-serif;
  color: var(--text-main,#fff);
}
#boxKalkulatorPanen *{ box-sizing:border-box; }
#boxKalkulatorPanen .kp-eyebrow{
  font-size:.66rem; letter-spacing:.08em; text-transform:uppercase;
  font-weight:700; color: var(--text-muted,#94a3b8);
}
#boxKalkulatorPanen .kp-intro{
  background: rgba(101,163,13,0.08); border:1px solid rgba(101,163,13,0.25);
  border-left:4px solid ${WARNA}; border-radius:14px; padding:13px 15px; margin-bottom:16px;
}
#boxKalkulatorPanen .kp-panel{
  background: var(--card-bg,#1b273a); border-radius:22px; padding:18px;
}
#boxKalkulatorPanen .kp-factor-card{
  background:#111c2e; border-radius:16px; border-left:4px solid var(--kp-card-accent,#3b82f6);
  padding:14px 16px;
}
#boxKalkulatorPanen .kp-cite{ font-size:.68rem; color: var(--text-muted,#64748b); font-style:italic; line-height:1.5; }
#boxKalkulatorPanen .kp-threshold-band{ position:relative; }
#boxKalkulatorPanen .kp-threshold-marker{ position:absolute; top:-2px; bottom:-2px; width:2px; background:var(--kp-warn); opacity:.65; }

#boxKalkulatorPanen input[type=range]{
  -webkit-appearance:none; appearance:none; width:100%; height:7px;
  border-radius:999px; background: rgba(255,255,255,0.1); cursor:pointer;
}
#boxKalkulatorPanen input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none; height:20px; width:20px; border-radius:50%;
  background: var(--kp-thumb-color, #3b82f6); border:3px solid #0b1528;
  box-shadow:0 1px 4px rgba(0,0,0,.5); cursor:pointer; margin-top:-7px; transition: transform .15s ease;
}
#boxKalkulatorPanen input[type=range]::-webkit-slider-thumb:hover{ transform: scale(1.1); }
#boxKalkulatorPanen input[type=range]::-moz-range-thumb{
  height:15px; width:15px; border-radius:50%;
  background: var(--kp-thumb-color, #3b82f6); border:3px solid #0b1528;
  box-shadow:0 1px 4px rgba(0,0,0,.5); cursor:pointer;
}
#boxKalkulatorPanen input[type=range]::-moz-range-track{ height:7px; border-radius:999px; background: rgba(255,255,255,0.1); }

#boxKalkulatorPanen .kp-result-circle{
  border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center;
  border-width:8px; border-style:solid; width:11rem; height:11rem; margin:12px auto;
  background:#111c2e;
}
#boxKalkulatorPanen .kp-status-box{
  border-radius:14px; padding:14px 16px; margin-top:18px; border-left:4px solid transparent;
  font-size:0.85rem; line-height:1.6;
}

body.light-mode #boxKalkulatorPanen{ color:#0f172a; }
body.light-mode #boxKalkulatorPanen .kp-eyebrow{ color:#475569; }
body.light-mode #boxKalkulatorPanen .kp-panel{ background:#fff; }
body.light-mode #boxKalkulatorPanen .kp-factor-card{ background:#f1f5f9; }
body.light-mode #boxKalkulatorPanen .kp-cite{ color:#64748b; }
body.light-mode #boxKalkulatorPanen .kp-result-circle{ background:#f1f5f9; }

@media (prefers-reduced-motion: reduce){ #boxKalkulatorPanen *{ transition:none !important; } }
`;
        var style = document.createElement('style');
        style.id = 'cssKalkulatorPanen';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================================
    //  2. HTML — struktur sama, palet & bingkai mengikuti tema app
    //  (.info-box style: background gelap + border-left aksen).
    // ============================================================
    function htmlKonten() {
        return `
  <div class="kp-intro">
    <strong style="color:${WARNA};display:block;margin-bottom:5px;">🌾 Kalkulator Prediksi Panen Padi</strong>
    <span style="font-size:0.78rem;color:#cbd5e1;line-height:1.6;">
      Model multiplikatif kerusakan lapangan &mdash; potensi maksimum 10 Ton/Ha, target aman 8 Ton/Ha.
      Koefisien tiap faktor dikalibrasi dari studi hama/penyakit padi (rujukan di tiap kartu &amp; catatan di bawah).
    </span>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div class="lg:col-span-2 space-y-3">
      <div>
        <span class="kp-eyebrow">Faktor Penentu &amp; Kerusakan</span>
        <h2 class="text-lg font-bold mt-0.5" style="color:var(--text-main,#fff);">Kondisi Lapangan</h2>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-rain);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#128167; Ketersediaan Air/Irigasi</label>
          <span id="kpValAir" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-rain); background:var(--kp-rain-soft);">100%</span>
        </div>
        <input type="range" id="kpAir" min="0" max="100" value="100" style="--kp-thumb-color:var(--kp-rain);">
        <p class="text-xs mt-1.5" style="color:#94a3b8;">
          Faktor pembatas mutlak (Hukum Minimum Liebig) &mdash; 0% air = puso otomatis, karena berlaku
          sebagai pengali terhadap seluruh hasil, bukan sekadar pengurang.
        </p>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-dalam);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#127793; Tingkat Kesuburan Tanah</label>
          <span id="kpValTanah" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-dalam); background:var(--kp-dalam-soft);">100%</span>
        </div>
        <input type="range" id="kpTanah" min="60" max="100" value="100" style="--kp-thumb-color:var(--kp-dalam);">
        <p class="text-xs mt-1.5" style="color:#94a3b8;">Keterbatasan hara memangkas potensi (batas bawah indeks kesuburan 60%).</p>
      </div>

      <div class="pt-1">
        <span class="kp-eyebrow">4 Faktor Hama &amp; Penyakit Paling Merusak</span>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-warn);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#129433; Populasi Wereng Batang Coklat</label>
          <span id="kpValWbc" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-warn); background:var(--kp-warn-soft);">0 ekor/rumpun</span>
        </div>
        <div class="kp-threshold-band">
          <input type="range" id="kpWbc" min="0" max="30" value="0" style="--kp-thumb-color:var(--kp-warn);">
          <div class="kp-threshold-marker" style="left:33.3%;" title="Ambang ekonomi ~10 ekor/rumpun"></div>
          <div class="kp-threshold-marker" style="left:66.7%;" title="Ambang puso ~20 ekor/rumpun"></div>
        </div>
        <p class="text-xs mt-1.5" style="color:#94a3b8;">
          Diukur populasi/rumpun (bukan persen) &mdash; begitu cara PPL/petani benar-benar memutuskan
          di lapangan. Ambang ekonomi &plusmn;10 ekor/rumpun (garis pertama), di atas &plusmn;20 ekor/rumpun berisiko puso total (garis kedua).
        </p>
        <p class="kp-cite mt-1">Ambang kendali bervariasi 4&ndash;20 ekor/rumpun tergantung fase tanaman (BB Padi; Cybex Pertanian). Kurva kerusakan berbentuk S, bukan linear &mdash; sesuai sifat ledakan populasi WBC (satu betina bertelur 100&ndash;600 butir, menetas 7&ndash;10 hari) begitu ambang terlampaui.</p>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-warn);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#128000; Serangan Hama Tikus</label>
          <span id="kpValTikus" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-warn); background:var(--kp-warn-soft);">0%</span>
        </div>
        <input type="range" id="kpTikus" min="0" max="100" value="0" style="--kp-thumb-color:var(--kp-warn);">
        <p class="text-xs mt-1.5" style="color:#94a3b8;">Koefisien 1:1, langsung memotong sisa hasil.</p>
        <p class="kp-cite mt-1">Kerugian tikus nasional 15&ndash;20%/tahun, bisa puso di petak terparah (BB Padi/Pusdatin). Slider ini memodelkan satu petak spesifik, bukan rerata nasional.</p>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-warn);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#128027; Gejala Beluk (Penggerek Batang)</label>
          <span id="kpValPenggerek" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-warn); background:var(--kp-warn-soft);">0%</span>
        </div>
        <input type="range" id="kpPenggerek" min="0" max="80" value="0" style="--kp-thumb-color:var(--kp-warn);">
        <p class="text-xs mt-1.5" style="color:#94a3b8;">Koefisien 1:1,2 &mdash; setiap 1% malai hampa (beluk) = kehilangan 1,2% hasil.</p>
        <p class="kp-cite mt-1">Beluk terjadi di fase generatif: anakan sudah final, tidak ada kompensasi tunas baru
          (berbeda dari sundep fase vegetatif yang masih bisa dikompensasi di bawah ~5% serangan) &mdash; karena itu model linear tanpa ambang di sini tepat.</p>
      </div>

      <div class="kp-factor-card" style="--kp-card-accent:var(--kp-gold);">
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium flex items-center gap-1.5">&#129440; Hawar Daun Bakteri (keparahan daun)</label>
          <span id="kpValHdb" class="text-sm font-semibold px-2 py-0.5 rounded" style="color:var(--kp-gold); background:var(--kp-gold-soft);">0%</span>
        </div>
        <div class="kp-threshold-band">
          <input type="range" id="kpHdb" min="0" max="100" value="0" style="--kp-thumb-color:var(--kp-gold);">
          <div class="kp-threshold-marker" style="left:20%;" title="Ambang toleransi 20%"></div>
        </div>
        <p class="text-xs mt-1.5" style="color:#94a3b8;">
          <strong>Ada ambang toleransi &plusmn;20%</strong> (garis merah pada slider) &mdash; di bawahnya kerugian
          &asymp;0% karena daun sehat sisa masih menopang fotosintesis. Di atasnya, tiap kenaikan 10% keparahan
          baru memotong hasil &asymp;6%.
        </p>
        <p class="kp-cite mt-1">Suparyono &amp; Sudir (1992): ambang kerusakan HDB &asymp;20% (2 minggu sebelum panen); di atas ambang, tiap kenaikan keparahan 10% &rarr; kehilangan hasil 5&ndash;7%. Slider ini memodelkan keparahan hawar daun kronis, bukan kresek akut (layu fase muda) yang sifatnya skenario biner, bukan fungsi kontinu.</p>
      </div>
    </div>

    <div class="kp-panel flex flex-col items-center text-center" style="align-self:flex-start;">
      <span class="kp-eyebrow mb-2">Prediksi Hasil Akhir</span>

      <div id="kpResultCircle" class="kp-result-circle" style="border-color:var(--kp-dalam);">
        <span id="kpHasilTon" class="text-4xl font-extrabold" style="color:var(--text-main,#fff);">10.00</span>
        <span class="text-sm font-medium mt-1" style="color:#94a3b8;">Ton/Ha</span>
      </div>

      <div class="w-full mt-2">
        <div class="flex justify-between text-sm font-semibold mb-1">
          <span style="color:#94a3b8;">Tingkat Keberhasilan:</span>
          <span id="kpHasilPersen">100.0%</span>
        </div>
        <div class="w-full rounded-full h-3 mb-2 relative" style="background:rgba(255,255,255,0.1);">
          <div id="kpProgressBar" class="h-3 rounded-full transition-all duration-300" style="width:100%; background:var(--kp-dalam);"></div>
          <div class="absolute top-0 bottom-0 border-l-2 border-dashed" style="left:80%; border-color:#cbd5e1;" title="Target 8 Ton (80%)"></div>
        </div>
        <p class="text-xs text-left" style="color:#94a3b8;">Garis putus-putus = target batas aman (8 Ton).</p>
      </div>

      <div id="kpStatusMessage" class="kp-status-box w-full text-left" style="background:var(--kp-dalam-soft); border-left-color:var(--kp-dalam); color:var(--kp-dalam);">
        <strong>Status: Aman!</strong> Target tercapai. Faktor pembatas utama: <span id="kpPrimaryConstraint" class="font-bold underline">-</span>
      </div>
    </div>
  </div>

  <div class="kp-panel mt-4">
    <span class="kp-eyebrow">Dasar Model</span>
    <h2 class="text-lg font-bold mt-0.5 mb-2" style="color:var(--text-main,#fff);">Kenapa Perkalian, Bukan Penjumlahan?</h2>
    <p class="text-sm leading-relaxed" style="color:#cbd5e1;">
      Model kehilangan hasil multi-faktor pada padi (mis. kerangka <em>RICEPEST</em>, Savary &amp; Willocquet
      untuk Asia Tropis) menggabungkan faktor kerusakan secara terstruktur karena tiap faktor menyerang
      bagian tanaman berbeda (akar/daun/batang/malai) dan bekerja semi-independen. Perkalian mencegah dua
      kerusakan besar terjumlah melebihi 100% dan otomatis menegakkan Hukum Minimum Liebig untuk faktor
      mutlak seperti air. Namun riset yang sama juga menunjukkan fungsi kerusakan sering punya
      <strong> ambang toleransi</strong> (bukan garis lurus dari nol) &mdash; itu sebabnya HDB di kalkulator ini
      memakai model ambang, sementara Beluk (tanpa kompensasi di fase generatif) tetap linear.
    </p>
    <p class="text-sm leading-relaxed mt-3" style="color:#cbd5e1;">
      <strong>Kenapa WBC pakai satuan ekor/rumpun, bukan persen?</strong> Karena begitu cara PPL dan petani
      benar-benar mengambil keputusan di lapangan (ambang ekonomi resmi dalam populasi, bukan skor visual).
      Kurvanya juga sengaja berbentuk-S, bukan garis lurus seperti HDB &mdash; sifat WBC adalah ledakan populasi
      eksponensial begitu ambang terlampaui (satu betina bertelur 100&ndash;600 butir, menetas 7&ndash;10 hari),
      sehingga kerusakan nyaris nol lalu melonjak cepat mendekati ambang puso, bukan naik bertahap merata.
    </p>
    <p class="text-xs mt-3" style="color:#64748b;">
      Rujukan: Savary &amp; Willocquet (RICEPEST, Asia Tropis) &middot; Suparyono &amp; Sudir (1992, ambang HDB)
      &middot; BB Padi &amp; Cybex Pertanian (ambang ekonomi WBC, kerugian tikus &amp; penggerek batang).
    </p>
  </div>`;
    }

    // ============================================================
    //  3. LOGIKA KALKULASI — tidak berubah dari v1.0 (rumus/koefisien
    //  identik dengan halaman asli).
    // ============================================================
    var POTENSI_MAKSIMAL = 10; // Ton/Ha
    var TARGET_MINIMAL = 8;    // Ton/Ha

    var AMBANG_WBC = 10;  // ekor/rumpun
    var PUSO_WBC = 20;    // ekor/rumpun

    function getPenaltiWBC(populasi) {
        if (populasi <= AMBANG_WBC) return 0;
        if (populasi >= PUSO_WBC) return 1;
        var t = (populasi - AMBANG_WBC) / (PUSO_WBC - AMBANG_WBC);
        return t * t * (3 - 2 * t);
    }

    var AMBANG_HDB = 20;
    var LAJU_HDB = 0.006;

    function getPenaltiHDB(severity) {
        if (severity <= AMBANG_HDB) return 0;
        return Math.min(1, LAJU_HDB * (severity - AMBANG_HDB));
    }

    function kpCalculateYield() {
        var air = parseFloat(document.getElementById('kpAir').value);
        var tanah = parseFloat(document.getElementById('kpTanah').value);
        var wbc = parseFloat(document.getElementById('kpWbc').value);
        var tikus = parseFloat(document.getElementById('kpTikus').value);
        var penggerek = parseFloat(document.getElementById('kpPenggerek').value);
        var hdb = parseFloat(document.getElementById('kpHdb').value);

        document.getElementById('kpValAir').textContent = air + "%";
        document.getElementById('kpValTanah').textContent = tanah + "%";
        document.getElementById('kpValWbc').textContent = wbc + " ekor/rumpun";
        document.getElementById('kpValTikus').textContent = tikus + "%";
        document.getElementById('kpValPenggerek').textContent = penggerek + "%";
        document.getElementById('kpValHdb').textContent = hdb + "%";

        var f_air = air / 100;
        var f_tanah = tanah / 100;
        var f_wbc = 1 - getPenaltiWBC(wbc);
        var f_tikus = 1 - (tikus / 100);
        var f_penggerek = 1 - Math.min((penggerek * 1.2) / 100, 1);
        var f_hdb = 1 - getPenaltiHDB(hdb);

        var totalPersen = (f_air * f_tanah * f_wbc * f_tikus * f_penggerek * f_hdb) * 100;
        var totalTon = (totalPersen / 100) * POTENSI_MAKSIMAL;

        var losses = [
            { name: "Kekeringan / Irigasi Kurang", loss: 100 - air },
            { name: "Tanah Kurang Subur", loss: 100 - tanah },
            { name: "Wereng Batang Coklat", loss: getPenaltiWBC(wbc) * 100 },
            { name: "Hama Tikus", loss: tikus },
            { name: "Penggerek Batang (Beluk)", loss: Math.min(penggerek * 1.2, 100) },
            { name: "Hawar Daun Bakteri", loss: getPenaltiHDB(hdb) * 100 }
        ];
        losses.sort(function (a, b) { return b.loss - a.loss; });
        var primaryConstraint = losses[0].loss > 0 ? losses[0].name : "Tidak ada hambatan berarti";

        document.getElementById('kpHasilTon').textContent = totalTon.toFixed(2);
        document.getElementById('kpHasilPersen').textContent = totalPersen.toFixed(1) + "%";
        document.getElementById('kpProgressBar').style.width = totalPersen + "%";
        document.getElementById('kpPrimaryConstraint').textContent = primaryConstraint;

        var circle = document.getElementById('kpResultCircle');
        var pBar = document.getElementById('kpProgressBar');
        var statusBox = document.getElementById('kpStatusMessage');

        if (totalTon >= TARGET_MINIMAL) {
            circle.style.borderColor = '#10b981';
            pBar.style.background = '#10b981';
            statusBox.style.background = 'rgba(16,185,129,0.15)';
            statusBox.style.borderLeftColor = '#10b981';
            statusBox.style.color = '#10b981';
            statusBox.innerHTML = '<strong>&#128994; Status: Aman!</strong> Target tercapai. Faktor pembatas utama: <span class="font-bold underline">' + primaryConstraint + '</span>';
        } else if (totalTon > 4) {
            circle.style.borderColor = '#fbbf24';
            pBar.style.background = '#fbbf24';
            statusBox.style.background = 'rgba(251,191,36,0.15)';
            statusBox.style.borderLeftColor = '#fbbf24';
            statusBox.style.color = '#fbbf24';
            statusBox.innerHTML = '<strong>&#128993; Status: Waspada!</strong> Hasil di bawah target 8 Ton. Segera atasi: <span class="font-bold underline">' + primaryConstraint + '</span>';
        } else {
            circle.style.borderColor = '#ef4444';
            pBar.style.background = '#ef4444';
            statusBox.style.background = 'rgba(239,68,68,0.15)';
            statusBox.style.borderLeftColor = '#ef4444';
            statusBox.style.color = '#ef4444';
            statusBox.innerHTML = '<strong>&#128992; Status: Kritis/Gagal Panen!</strong> Kerugian sangat parah. Penyebab utama: <span class="font-bold underline">' + primaryConstraint + '</span>';
        }
    }

    // ============================================================
    //  4. INJEKSI BOX + PASANG EVENT LISTENER
    // ============================================================
    function injeksiBox() {
        if (document.getElementById('boxKalkulatorPanen')) return;
        var card = document.querySelector('.card');
        if (!card) return;

        var box = document.createElement('div');
        box.id = 'boxKalkulatorPanen';
        box.style.display = 'none';
        box.innerHTML = htmlKonten();
        card.appendChild(box);

        ['kpAir', 'kpTanah', 'kpWbc', 'kpTikus', 'kpPenggerek', 'kpHdb'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', kpCalculateYield);
        });
        kpCalculateYield();
    }

    // ============================================================
    //  5. TAB BUTTON
    // ============================================================
    function injeksiTab() {
        if (document.getElementById('tabKalkulatorPanen')) return;
        var tabContainer = document.querySelector('.tab-container');
        if (!tabContainer) return;
        var btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.id = 'tabKalkulatorPanen';
        btn.textContent = 'FAKTOR PANEN';
        btn.onclick = function () { window.switchMode('kalkulatorpanen'); };

        // [POSISI] Disisipkan tepat SETELAH tab "RISIKO CUACA" (#tabCuaca),
        // supaya tab ini konsisten muncul di urutan ke-3 — setelah
        // "KALENDER TNM" (disisipkan patch lain di posisi paling awal)
        // dan "RISIKO CUACA" (tab statis pertama di index.html), tapi
        // SEBELUM "RISIKO IKLIM"/"BIAYA TANI" dst. #tabCuaca dipakai
        // sebagai jangkar karena statis & selalu ada — lebih andal
        // daripada menghitung index posisi (yang bisa berubah tergantung
        // urutan patch lain selesai jalan).
        var jangkar = document.getElementById('tabCuaca');
        if (jangkar) {
            tabContainer.insertBefore(btn, jangkar.nextSibling);
        } else {
            tabContainer.appendChild(btn);
        }
    }

    // ============================================================
    //  6. WRAP switchMode
    // ============================================================
    var ELEMEN_TERSEMBUNYI = [
        'result', 'btnCamera', 'scanWindow', 'btnAnalisis',
        'boxCuaca', 'boxPenyakit', 'boxHama', 'boxGulma',
        'boxTanah', 'boxBWD', 'boxMalai', 'boxBiayaTani',
        'boxKalkulatorPupuk', 'boxKalender', 'boxVarietasPadi',
        'boxUkurLahan', 'boxPestisida', 'boxGabah',
        'formParameterLahan', 'tabSubtitleDisplay',
        'loader', 'cameraWarning'
    ];

    function sembunyikanSemua() {
        ELEMEN_TERSEMBUNYI.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.info-box-dynamic').forEach(function (el) { el.style.display = 'none'; });
        document.querySelectorAll('.card > div[id^="box"]').forEach(function (b) {
            if (b.id !== 'boxKalkulatorPanen') b.style.display = 'none';
        });
    }

    function pasangSwitchMode() {
        var asli = window.switchMode;
        if (typeof asli === 'function' && asli.__kalkulatorPanenWrapped) return;

        var dibungkus = function (mode) {
            var box = document.getElementById('boxKalkulatorPanen');
            var tab = document.getElementById('tabKalkulatorPanen');

            if (mode === 'kalkulatorpanen') {
                if (typeof window.stopCamera === 'function') window.stopCamera();
                sembunyikanSemua();
                if (box) box.style.display = 'block';

                var titleEl = document.getElementById('modeTitle');
                if (titleEl) { titleEl.innerText = '🌾 Kalkulator Prediksi Panen'; titleEl.style.color = WARNA; }
                var subEl = document.getElementById('tabSubtitleDisplay');
                if (subEl) { subEl.innerText = ''; subEl.style.display = 'none'; }

                document.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
                if (tab) tab.classList.add('active');

                try { if (typeof currentMode !== 'undefined') currentMode = 'kalkulatorpanen'; } catch (e) {}
                return;
            }

            if (box) box.style.display = 'none';
            if (tab) tab.classList.remove('active');
            if (typeof asli === 'function') asli.apply(this, arguments);
        };

        dibungkus.__kalkulatorPanenWrapped = true;
        window.switchMode = dibungkus;
    }

    // ============================================================
    //  7. INIT (dengan retry)
    // ============================================================
    function init(tick) {
        tick = tick || 0;
        var siap = typeof window.switchMode === 'function' &&
            document.querySelector('.tab-container') &&
            document.querySelector('.card');
        if (!siap) {
            if (tick >= 80) {
                console.error('[kalkulator_panen] DOM utama (.tab-container/.card/switchMode) tidak ditemukan setelah 8 detik — cek urutan <script>.');
                return;
            }
            setTimeout(function () { init(tick + 1); }, 100);
            return;
        }

        muatResourceBersama();
        injeksiCSS();
        injeksiBox();
        injeksiTab();
        pasangSwitchMode();

        window.__kalkulatorPanenAktif = true;
        console.log(
            '%c✅ patch_kalkulator_panen.js v2.0 aktif — tab baru "KALKULATOR PANEN" (tema gelap mengikuti app)',
            'color:#65a30d;font-weight:bold;'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { init(); }, 500); });
    } else {
        setTimeout(function () { init(); }, 500);
    }

})();
