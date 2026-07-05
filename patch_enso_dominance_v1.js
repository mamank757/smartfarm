/**
 * ============================================================
 * patch_enso_dominance_v1.js  (VERSI PERBAIKAN — rewrite penuh)
 * Perbaiki label "Skor Terpadu" di panel 6-faktor agar
 * konsisten dengan wsTotal di hitungRisikoDinamis
 * ------------------------------------------------------------
 * ROOT CAUSE yang sebenarnya:
 *   hitungSkor6Faktor() di patch_skor_6faktor_v1.js
 *   menormalisasi ENSO ÷1.5 dan SST ÷1.0. Saat ENSO +1.80
 *   dan SST +2.00 keduanya HIT CAP (1.0), sehingga ENSO -0.30
 *   vs SST +0.18 → net = -0.12 saja → NETRAL.
 *
 *   Tapi hitungRisikoDinamis() (yang menentukan skor 0-100 di
 *   chart) SUDAH BENAR: pakai amplifikasi ×5 dan bobot bulanan,
 *   ENSO +1.80 di Juli (lokal) menghasilkan wsTotal ≈ -3.8 →
 *   skor BAHAYA/KRITIS di chart.
 *
 *   Jadi: chart sudah benar, HANYA LABEL PANEL yang salah.
 *
 * SOLUSI:
 *   [A] Post-process DOM panel 6-faktor setelah render:
 *       Ambil wsTotal dari hitungRisikoDinamis (field hasil.ws),
 *       normalisasi ke skala -1..+1, dan ganti teks
 *       "Skor Terpadu: X → LABEL" di panel dengan nilai wsTotal.
 *
 *   [B] Tambahkan baris "Catatan ENSO Dominan" di panel ketika
 *       |ONI| > 1.0, agar user tahu bahwa ENSO mendominasi.
 *
 * TIDAK mengubah hitungRisikoDinamis sama sekali (sudah benar).
 * TIDAK mengubah skor 0-100 di chart (sudah benar).
 * HANYA memperbaiki label teks di panel display.
 *
 * CARA PASANG — setelah patch_bugfix_b1b3_v1.js:
 *   <script src="patch_bugfix_b1b3_v1.js"></script>
 *   <script src="patch_enso_dominance_v1.js"></script>
 * ============================================================
 */

(function () {
    'use strict';

    if (window.__enskoDominanceV1Aktif) {
        console.warn('[enso_dominance] sudah aktif, skip.');
        return;
    }

    // ── Normalisasi wsTotal (-inf..+inf) ke -1..+1 untuk display ──
    // wsTotal khas: -4 s.d. +4 (dari amplifikasi ×5 + baseline ZOM)
    // Kita pakai tanh(wsTotal / 2) → mendekati ±1 tapi tidak hard-clip
    function normalisasiWS(ws) {
        // tanh: lembut, simetris, 0 di tengah, mendekati ±1 di ekstrem
        return Math.tanh(ws / 2.0);
    }

    // ── Label dari skorWS yang sudah dinormalisasi (-1..+1) ──
    function labelDariWS(sws) {
        if      (sws >= 0.60) return { teks: '🌊 BASAH EKSTREM',    warna: '#3b82f6' };
        else if (sws >= 0.30) return { teks: '🌧️ BASAH',             warna: '#38b6ff' };
        else if (sws >= 0.10) return { teks: '🌦️ CENDERUNG BASAH',   warna: '#34d399' };
        else if (sws >= -0.10)return { teks: '⚖️ NETRAL',            warna: '#10b981' };
        else if (sws >= -0.30)return { teks: '🌤️ CENDERUNG KERING',  warna: '#f59e0b' };
        else if (sws >= -0.60)return { teks: '☀️ KERING',             warna: '#ef4444' };
        else                   return { teks: '🔥 KERING EKSTREM',    warna: '#7f1d1d' };
    }

    // ── Simpan wsTotal terakhir dari hitungRisikoDinamis ──────────
    // Wrap tipis hanya untuk menyimpan hasil.ws — tidak mengubah apapun
    function pasangInterceptorWS(tick) {
        tick = tick || 0;
        if (typeof window.hitungRisikoDinamis !== 'function') {
            if (tick >= 80) return;
            setTimeout(function () { pasangInterceptorWS(tick + 1); }, 100);
            return;
        }
        if (window.hitungRisikoDinamis.__wsIntercepted) return;

        var asli = window.hitungRisikoDinamis;
        window.hitungRisikoDinamis = function () {
            var hasil = asli.apply(this, arguments);
            // Simpan wsTotal terakhir untuk dipakai koreksi panel
            if (hasil && hasil.ws !== undefined) {
                window._wsTotal_terakhir = hasil.ws;
                window._wsENSO_terakhir  = arguments[2]; // ensoVal
            }
            return hasil;
        };
        window.hitungRisikoDinamis.__wsIntercepted = true;
        console.log('%c[enso_dominance] interceptor wsTotal terpasang', 'color:#d946ef;');
    }

    // ── Perbaiki label panel setelah render ───────────────────────
    function perbaikiLabelPanel() {
        // Cari elemen yang menampilkan "Skor Terpadu: ..."
        // di dalam panel 6-faktor (#box6Faktor atau .panel-6faktor)
        var kandidat = document.querySelectorAll('span[style*="font-weight:700"]');
        var el = null;
        kandidat.forEach(function (s) {
            if ((s.textContent || '').includes('Skor Terpadu')) el = s;
        });
        if (!el) return; // panel belum tampil

        var ws    = window._wsTotal_terakhir;
        var enso  = window._wsENSO_terakhir;
        if (ws === undefined || ws === null) return;

        var oniAbs = Math.abs(enso || 0);
        if (oniAbs <= 0.5) return; // ENSO lemah, tidak perlu koreksi

        var swsKoreksi = normalisasiWS(ws);
        var info       = labelDariWS(swsKoreksi);

        // Ganti teks label saja, pertahankan skor angka asli agar
        // user bisa membandingkan tapi label yang keluar benar
        var teksLama = el.textContent || '';

        // Ambil nilai skor angka dari teks lama (e.g. "-0.156")
        var matchSkor = teksLama.match(/Skor Terpadu:\s*([+-]?\d+\.\d+)/);
        var skorAngka = matchSkor ? matchSkor[1] : '?';

        var teksKoreksi =
            'Skor Terpadu: ' + skorAngka +
            ' → ' + info.teks +
            ' <span style="font-size:0.65em;opacity:0.7;font-weight:400;">' +
            '(wsTotal=' + ws.toFixed(2) + ', dikoreksi dari display)</span>';

        el.style.color = info.warna;
        el.innerHTML   = teksKoreksi;

        // Tambahkan catatan ENSO dominan jika belum ada
        var boxEl = el.closest('div');
        if (boxEl && !boxEl.querySelector('.enso-dominance-note')) {
            var noteEl = document.createElement('div');
            noteEl.className = 'enso-dominance-note';
            noteEl.style.cssText =
                'margin-top:6px;padding:4px 8px;background:rgba(239,68,68,0.12);' +
                'border-left:2px solid #ef4444;border-radius:4px;' +
                'font-size:0.68rem;color:#ef4444;line-height:1.5;';
            noteEl.textContent =
                '⚠️ ENSO Dominan (ONI ' + (enso > 0 ? '+' : '') +
                parseFloat(enso).toFixed(2) + '): ' +
                'Skor display (-0 hingga ±1) menyederhanakan dampak El Niño/La Niña. ' +
                'Lihat chart risiko per fase untuk penilaian aktual (wsTotal = ' +
                ws.toFixed(2) + ').';
            boxEl.appendChild(noteEl);
        }

        console.log(
            '%c[enso_dominance] Label panel diperbaiki: wsTotal=' + ws.toFixed(2) +
            ' → normWS=' + swsKoreksi.toFixed(3) + ' → ' + info.teks,
            'color:#d946ef;font-weight:bold;'
        );
    }

    // ── Observer: pantau DOM untuk mendeteksi panel 6-faktor render ─
    function pasangObserver() {
        var observer = new MutationObserver(function () {
            // Tunggu sebentar agar render selesai
            if (window._wsTotal_terakhir !== undefined) {
                setTimeout(perbaikiLabelPanel, 150);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Simulasi verifikasi (panggil dari console) ────────────────
    /**
     * Simulasi dengan nilai screenshot:
     *   simulasiWSTerpadu(-4.185, 1.80)
     * (wsTotal dihitung dari formula _hitungWSMandiri:
     *  baseline ZOM=0, wE=0.22 (lokal Juli), amplif=5, ENSO=1.80
     *  koreksi = ((1.80/0.5)*5 * 0.22) = 3.96
     *  ws = 0 - 3.96 = -3.96, + SST*0.20 = +0.40 → wsTotal ≈ -3.56)
     */
    window.simulasiWSTerpadu = function (wsTotal, ensoONI) {
        var sws  = normalisasiWS(wsTotal);
        var info = labelDariWS(sws);
        console.log('%c=== SIMULASI LABEL PANEL (setelah koreksi) ===', 'color:#d946ef;font-weight:bold;');
        console.log('wsTotal     :', wsTotal);
        console.log('normWS      :', sws.toFixed(4), '(tanh(wsTotal/2))');
        console.log('Label BENAR :', info.teks);
        console.log('ENSO ONI    :', ensoONI, '|', Math.abs(ensoONI) >= 1.5 ? 'KUAT' : Math.abs(ensoONI) >= 1.0 ? 'MODERAT' : 'LEMAH');
        console.log('');
        console.log('Perbandingan:');
        console.log('  Skor display (hitungSkor6Faktor, SALAH) → -0.156 → NETRAL');
        console.log('  wsTotal (hitungRisikoDinamis, BENAR)    →', wsTotal.toFixed(3), '→', info.teks);
        console.log('%c=============================================', 'color:#d946ef;font-weight:bold;');
        return { wsTotal, sws, label: info.teks };
    };

    // ── INIT ──────────────────────────────────────────────────────
    function init() {
        pasangInterceptorWS();
        pasangObserver();
        window.__enskoDominanceV1Aktif = true;
        console.log(
            '%c✅ patch_enso_dominance_v1.js aktif\n' +
            '   Root cause: hitungSkor6Faktor normalisasi cap ±1 menyebabkan\n' +
            '   SST dan ENSO keduanya saturated → label NETRAL.\n' +
            '   Fix: setelah panel render, label diganti dari wsTotal yang benar.\n' +
            '   Ketik simulasiWSTerpadu(-3.56, 1.80) untuk verifikasi.',
            'color:#10b981;font-weight:bold;'
        );
        // Langsung cek jika panel sudah tampil
        setTimeout(perbaikiLabelPanel, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1100); });
    } else {
        setTimeout(init, 1100);
    }

})();
