/**
 * patch_fix01_terapkan_tapin_tabela.js
 * Poin 1 — patch_jadwal_tapin_tabela_fix.js tidak pernah ter-apply
 * karena window.prosesJadwalOtomatis belum ada saat file itu load
 * (tanpa retry). File ini memasang ulang override tsb dengan retry,
 * memakai window._bangunKegiatanFix yang SUDAH diekspor oleh
 * patch_jadwal_tapin_tabela_fix.js.
 *
 * PASANG: paling akhir, setelah patch_jadwal_tapin_tabela_fix.js
 */
(function () {
    'use strict';
    if (window.__fix01TapinTabelaAktif) return;

    var NAMA_HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var NAMA_BULAN_PENDEK = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    function fmtL(d) { return NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear(); }
    function fmtP(d) { return d.getDate() + ' ' + NAMA_BULAN_PENDEK[d.getMonth()] + ' ' + d.getFullYear(); }

    function renderKartu(k, nomor, isLewat) {
        var now   = new Date();
        var lewat = isLewat || k.tglSelesai < now;
        var w     = lewat ? '#64748b' : (k.risiko && k.risiko.warna ? k.risiko.warna : '#10b981');
        var badge = lewat
            ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;">📋 Referensi</span>'
            : '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:' + w + '22;color:' + w + ';">' + (k.risiko && k.risiko.level ? k.risiko.level : 'OK') + '</span>';
        var tips = (k.tips || []).map(function (t) {
            return '<li style="margin-bottom:5px;color:' + (lewat ? '#475569' : '#cbd5e1') + ';line-height:1.5;">' + t + '</li>';
        }).join('');
        var catatan = '<div style="background:#111c2e;border-radius:10px;padding:9px 11px;margin:10px 0;border-left:3px solid ' + w + ';">' +
            '<div style="font-size:11px;font-weight:700;color:' + w + ';margin-bottom:2px;">Catatan</div>' +
            '<div style="font-size:12px;color:#cbd5e1;">' + (k.risiko && k.risiko.catatan ? k.risiko.catatan : '') + '</div></div>';

        return '<div style="background:#1b273a;border:0.5px solid rgba(255,255,255,0.07);border-radius:16px;margin-bottom:9px;overflow:hidden;">' +
            '<div style="padding:12px 14px;display:flex;align-items:flex-start;gap:12px;cursor:pointer;border-left:3px solid ' + w + ';" onclick="window._jtoToggle(this)">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:#111c2e;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">' + k.ikon + '</div>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
            '<div><div style="font-size:10px;color:#64748b;font-weight:600;">Kegiatan ' + nomor + '</div>' +
            '<div style="font-size:14px;font-weight:700;color:' + (lewat ? '#64748b' : '#fff') + ';">' + k.nama + '</div></div>' + badge + '</div>' +
            '<div style="font-size:12px;color:#94a3b8;margin-top:3px;"><strong style="color:' + (lewat ? '#475569' : '#e2e8f0') + ';">' + fmtL(k.tglMulai) + '</strong> s/d ' + fmtP(k.tglSelesai) + '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + (k.deskripsi || '') + '</div>' +
            '</div><span class="jto-chevron" style="font-size:12px;color:#64748b;flex-shrink:0;margin-top:8px;">▼</span></div>' +
            '<div class="jto-detail" style="display:none;padding:0 14px 14px;border-top:0.5px solid rgba(255,255,255,0.05);">' +
            catatan +
            '<div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;">Tips Lapangan</div>' +
            '<ul style="margin:0;padding-left:15px;font-size:12px;">' + tips + '</ul></div></div>';
    }

    function rerenderJTO(multiJadwal, teksEl) {
        var html = '';
        multiJadwal.forEach(function (jadwal) {
            var rek = jadwal.rekomendasi;
            var keg = jadwal.kegiatan;
            var opacity = rek.isLewat ? '0.55' : '1';
            var badge = rek.isLewat
                ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:#1e293b;color:#64748b;border:1px solid #334155;margin-left:10px;">📋 Blueprint</span>'
                : rek.isBerjalan
                    ? '<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:8px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.4);margin-left:10px;">🟢 Aktif</span>'
                    : '';
            html += '<div style="margin-top:20px;margin-bottom:10px;font-size:15px;font-weight:bold;color:#fff;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;opacity:' + opacity + ';">🌾 ' + rek.musimNama.toUpperCase() + badge + '</div>';

            var metodeTanam = window._jtoMetodeTanam || 'tapin';
            var offset = window._OFFSET_STAGNASI || 8;
            var labelMasuk = (metodeTanam === 'tabela')
                ? fmtL(rek.tglTanam)
                : fmtL(rek.tglTanam);
            var labelTabela = (metodeTanam === 'tapin')
                ? ' &nbsp;|&nbsp; <span style="color:#64748b;font-size:11px;">Tabela sebar: ' + fmtP(new Date(rek.tglTanam.getTime() + offset * 86400000)) + '</span>'
                : '';

            html += '<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px;opacity:' + opacity + ';">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
                '<div><span style="color:#64748b;">Masuk Lahan' + (metodeTanam === 'tapin' ? ' (Tapin)' : ' (Tabela)') + '</span><br>' +
                '<strong style="color:#10b981;font-size:13px;">' + labelMasuk + '</strong>' + labelTabela + '</div>' +
                '<div><span style="color:#64748b;">Varietas</span><br><strong style="color:#fff;font-size:13px;">' + (rek.labelVar || '-') + '</strong></div></div>' +
                '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11px;color:#94a3b8;line-height:1.5;">💡 ' + rek.alasan + '</div></div>';

            keg.forEach(function (k, i) { html += renderKartu(k, i + 1, rek.isLewat); });
        });

        html += '<div style="margin-top:16px;background:rgba(100,116,139,0.1);border-radius:10px;padding:10px 12px;font-size:10px;color:#64748b;line-height:1.6;border:1px solid rgba(255,255,255,0.04);">' +
            '⚠️ Tapin ditanam ' + (window._OFFSET_STAGNASI || 8) + ' hari lebih awal dari Tabela agar panen serentak (kompensasi stagnasi transplanting).</div>' +
            '<button onclick="window._jtoKirimWA()" style="width:100%;margin-top:10px;padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">📲 Kirim Jadwal ke WhatsApp ↗</button>';

        teksEl.innerHTML = html;
    }

    function pasang(tick) {
        tick = tick || 0;
        var asli = window.prosesJadwalOtomatis;
        var bangunFix = window._bangunKegiatanFix;

        if (typeof asli !== 'function' || typeof bangunFix !== 'function') {
            if (tick >= 80) {
                console.error('[fix01] window.prosesJadwalOtomatis / window._bangunKegiatanFix tidak tersedia — pastikan patch_jadwal_tapin_tabela_fix.js dimuat sebelum file ini.');
                return;
            }
            setTimeout(function () { pasang(tick + 1); }, 100);
            return;
        }
        if (asli.__fix01Applied) return;

        window.prosesJadwalOtomatis = async function () {
            await asli.apply(this, arguments);

            var multiJadwal = window._jtoData;
            var metodeTanam = window._jtoMetodeTanam || 'tapin';
            var teksEl      = document.getElementById('jtoTeks');
            if (!multiJadwal || !multiJadwal.length || !teksEl) return;

            multiJadwal.forEach(function (jadwal) {
                var skor = jadwal._skorBulan || new Array(12).fill(50);
                jadwal.kegiatan = window._bangunKegiatanFix(jadwal.rekomendasi, skor, metodeTanam);
            });
            window._jtoData = multiJadwal;
            rerenderJTO(multiJadwal, teksEl);

            console.log('%c✅ [fix01] Jadwal Tapin/Tabela berhasil dihitung ulang (panen serentak)', 'color:#10b981;font-weight:bold;');
        };
        window.prosesJadwalOtomatis.__fix01Applied = true;
        window.__fix01TapinTabelaAktif = true;
        console.log('%c✅ patch_fix01_terapkan_tapin_tabela.js aktif — override berhasil dipasang', 'color:#10b981;font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(pasang, 1500); });
    } else {
        setTimeout(pasang, 1500);
    }
})();
