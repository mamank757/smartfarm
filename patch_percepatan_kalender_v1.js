/**
 * patch_percepatan_kalender_v1.js — VERSI BERSIH
 * Logika percepatan untuk ENSO, IOD, dan SST (MJO dihapus agar tidak bentrok)
 */
(function () {
    'use strict';

    if (window.__percepatanKalenderV1Aktif) return;

    var TTL = {
        enso: 6 * 3600 * 1000,
        iod: 6 * 3600 * 1000,
        sst: 12 * 3600 * 1000,
        dedup: 30 * 1000
    };

    var _mem = {};

    function mSet(key, val, ttlKey) { _mem[key] = { v: val, ts: Date.now(), ttl: TTL[ttlKey] || TTL.enso }; }
    function mGet(key) {
        var e = _mem[key];
        if (!e) return null;
        if (Date.now() - e.ts > e.ttl) { delete _mem[key]; return null; }
        return e.v;
    }
    function mDel(key) { delete _mem[key]; }

    // [PERF-1] Cache ENSO & IOD
    function wrapCache(fnName, cacheKey) {
        var asli = window[fnName];
        if (typeof asli !== 'function') { setTimeout(function () { wrapCache(fnName, cacheKey); }, 500); return; }
        if (window[fnName].__cached) return;

        window[fnName] = async function () {
            var hit = mGet(cacheKey);
            if (hit) return hit;
            var hasil = await asli.apply(this, arguments);
            if (hasil) mSet(cacheKey, hasil, cacheKey);
            return hasil;
        };
        window[fnName].__cached = true;
    }

    // [PERF-3] Guard loadGlobalClimateIndices
    function wrapGuardLoadGlobal() {
        var asliLoadGlobal = window.loadGlobalClimateIndices;
        if (typeof asliLoadGlobal !== 'function') { setTimeout(wrapGuardLoadGlobal, 500); return; }
        if (window.loadGlobalClimateIndices.__guarded) return;

        window.loadGlobalClimateIndices = async function () {
            var hit = mGet('dedup_loadglobal');
            if (hit) return;
            mSet('dedup_loadglobal', true, 'dedup');
            return await asliLoadGlobal.apply(this, arguments);
        };
        window.loadGlobalClimateIndices.__guarded = true;
    }

    function pasangResetGuardPadaTombol() {
        var asliProses = window.prosesAnalisisKalender;
        if (typeof asliProses === 'function' && !asliProses.__resetGuard) {
            window.prosesAnalisisKalender = async function () {
                mDel('dedup_loadglobal');
                return await asliProses.apply(this, arguments);
            };
            window.prosesAnalisisKalender.__resetGuard = true;
        }
    }

    // [PERF-4] Cache getNOAASST
    function wrapCacheSST() {
        var asliSST = window.getNOAASST;
        if (typeof asliSST !== 'function') { setTimeout(wrapCacheSST, 500); return; }
        if (window.getNOAASST.__cached) return;

        window.getNOAASST = async function (lat, lon, date) {
            var y = date.getFullYear();
            var m = String(date.getMonth() + 1).padStart(2, '0');
            var d2 = String(date.getDate()).padStart(2, '0');
            var key = 'sst_' + lat.toFixed(2) + '_' + lon.toFixed(2) + '_' + y + m + d2;

            var hit = mGet(key);
            if (hit !== null) return hit;

            var hasil = await asliSST.apply(this, arguments);
            if (hasil !== null && hasil !== undefined && isFinite(hasil)) mSet(key, hasil, 'sst');
            return hasil;
        };
        window.getNOAASST.__cached = true;
    }

    function init() {
        wrapCache('getENSOAnomaly', 'enso');
        wrapCache('getIODAnomaly', 'iod');
        wrapGuardLoadGlobal();
        wrapCacheSST();
        pasangResetGuardPadaTombol();
        window.__percepatanKalenderV1Aktif = true;
        console.log('%c✅ patch_percepatan_kalender_v1.js (BERSIH) AKTIF', 'color:#10b981; font-weight:bold;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 700); });
    } else {
        setTimeout(init, 700);
    }
})();
