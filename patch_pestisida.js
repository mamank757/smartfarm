/**
 * PATCH PESTISIDA v2 - TERINTEGRASI PENUH DENGAN INDEX.HTML
 * Kelas CSS dan layout menggunakan standar native web Anda.
 */

(function() {
  // ==========================================
  // 1. DATABASE PESTISIDA (Pastikan Anda memasukkan 40 data lengkap di sini)
  // ==========================================
 const databasePestisida = [
  // --- GRUP 1: PENGHAMBAT ASETILKOLINESTERASE (SARAF) ---
  {
    "id": 1,
    "bahanAktif": "Metomil",
    "merekPopuler": "Lannate 25 WP",
    "grupIrac": "1A",
    "targetHama": ["Ulat Grayak", "Kutu Daun", "Thrips", "Penggerek Polong"]
  },
  {
    "id": 2,
    "bahanAktif": "Karbofuran",
    "merekPopuler": "Furadan 3 GR",
    "grupIrac": "1A",
    "targetHama": ["Penggerek Batang Padi", "Nematoda", "Ulat Tanah", "Orong-orong"]
  },
  {
    "id": 3,
    "bahanAktif": "BPMC (Fenobukarb)",
    "merekPopuler": "Bassa 50 EC",
    "grupIrac": "1A",
    "targetHama": ["Wereng Coklat", "Walang Sangit", "Kepik Hijau"]
  },
  {
    "id": 4,
    "bahanAktif": "Klorpirifos",
    "merekPopuler": "Dursban 200 EC",
    "grupIrac": "1B",
    "targetHama": ["Kutu Putih", "Ulat Grayak", "Wereng Coklat", "Semut"]
  },
  {
    "id": 5,
    "bahanAktif": "Profenofos",
    "merekPopuler": "Curacron 500 EC",
    "grupIrac": "1B",
    "targetHama": ["Ulat Grayak", "Kutu Daun", "Thrips", "Kutu Kebul"]
  },
  {
    "id": 6,
    "bahanAktif": "Dimetoat",
    "merekPopuler": "Perfekthion 400 EC",
    "grupIrac": "1B",
    "targetHama": ["Kutu Daun", "Thrips", "Lalat Buah"]
  },

  // --- GRUP 2: PEMBLOKIR SALURAN KLORIDA (SARAF) ---
  {
    "id": 7,
    "bahanAktif": "Fipronil",
    "merekPopuler": "Regent 50 SC",
    "grupIrac": "2B",
    "targetHama": ["Wereng Coklat", "Penggerek Batang Padi", "Orong-orong", "Rayap"]
  },

  // --- GRUP 3: MODULATOR SALURAN NATRIUM (SARAF - KNOCKDOWN) ---
  {
    "id": 8,
    "bahanAktif": "Sipermetrin",
    "merekPopuler": "Ripcord 50 EC",
    "grupIrac": "3A",
    "targetHama": ["Ulat Grayak", "Wereng Coklat", "Walang Sangit"]
  },
  {
    "id": 9,
    "bahanAktif": "Deltametrin",
    "merekPopuler": "Decis 25 EC",
    "grupIrac": "3A",
    "targetHama": ["Ulat Grayak", "Walang Sangit", "Kutu Daun", "Kepik"]
  },
  {
    "id": 10,
    "bahanAktif": "Lamda-Sihalotrin",
    "merekPopuler": "Matador 25 EC",
    "grupIrac": "3A",
    "targetHama": ["Ulat Grayak", "Kutu Daun", "Lalat Buah", "Kutu Kebul"]
  },
  {
    "id": 11,
    "bahanAktif": "Alfametrin",
    "merekPopuler": "Fastac 15 EC",
    "grupIrac": "3A",
    "targetHama": ["Ulat Grayak", "Kutu Daun", "Penghisap Buah"]
  },

  // --- GRUP 4: ANTAGONIS RESEPTOR ASETILKOLIN (SARAF - SISTEMIK) ---
  {
    "id": 12,
    "bahanAktif": "Imidakloprid",
    "merekPopuler": "Confidor 5 WP",
    "grupIrac": "4A",
    "targetHama": ["Wereng Coklat", "Kutu Kebul", "Thrips", "Kutu Daun"]
  },
  {
    "id": 13,
    "bahanAktif": "Tiametoksam",
    "merekPopuler": "Actara 25 WG",
    "grupIrac": "4A",
    "targetHama": ["Wereng Coklat", "Kutu Kebul", "Thrips"]
  },
  {
    "id": 14,
    "bahanAktif": "Dinotefuran",
    "merekPopuler": "Oshin 20 WP",
    "grupIrac": "4A",
    "targetHama": ["Wereng Coklat", "Kutu Kebul", "Kepik Hijau"]
  },
  {
    "id": 15,
    "bahanAktif": "Nitenpiram",
    "merekPopuler": "Tenchu 20 SG",
    "grupIrac": "4A",
    "targetHama": ["Wereng Coklat", "Wereng Punggung Putih"]
  },

  // --- GRUP 5: MODULATOR RESEPTOR ASETILKOLIN ALOSTERIK (SARAF) ---
  {
    "id": 16,
    "bahanAktif": "Spinosad",
    "merekPopuler": "Tracer 120 SC",
    "grupIrac": "5",
    "targetHama": ["Ulat Grayak", "Penggorok Daun", "Thrips"]
  },
  {
    "id": 17,
    "bahanAktif": "Spinetoram",
    "merekPopuler": "Endure 120 SC",
    "grupIrac": "5",
    "targetHama": ["Ulat Grayak", "Penggorok Daun", "Thrips", "Ulat Kubis"]
  },

  // --- GRUP 6: AKTIVATOR SALURAN KLORIDA (PELUMPUH OTOT/SARAF) ---
  {
    "id": 18,
    "bahanAktif": "Abamektin",
    "merekPopuler": "Demolish 18 EC",
    "grupIrac": "6",
    "targetHama": ["Ulat Grayak", "Penggorok Daun", "Tungau", "Thrips"]
  },
  {
    "id": 19,
    "bahanAktif": "Emamektin Benzoat",
    "merekPopuler": "Proclaim 5 SG",
    "grupIrac": "6",
    "targetHama": ["Ulat Grayak", "Penggorok Daun", "Ulat Pelipat Daun"]
  },

  // --- GRUP 9: PENGHAMBAT MAKAN HOMOPTERA (MODULATOR CHORDOTONAL) ---
  {
    "id": 20,
    "bahanAktif": "Pimetrozin",
    "merekPopuler": "Chess 50 WG",
    "grupIrac": "9B",
    "targetHama": ["Wereng Coklat", "Kutu Kebul", "Kutu Daun"]
  },

  // --- GRUP 10: PENGHAMBAT PERTUMBUHAN TUNGAU ---
  {
    "id": 21,
    "bahanAktif": "Heksitiazoks",
    "merekPopuler": "Nissorun 50 EC",
    "grupIrac": "10A",
    "targetHama": ["Tungau Merah", "Tungau Kuning"]
  },

  // --- GRUP 11: MIKROBA PATOGEN (BIOLOGIS) ---
  {
    "id": 22,
    "bahanAktif": "Bacillus thuringiensis",
    "merekPopuler": "Turex 50 WP",
    "grupIrac": "11A",
    "targetHama": ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"]
  },

  // --- GRUP 12: PENGHAMBAT SINTESIS ATP (ENZIM PERNAPASAN) ---
  {
    "id": 23,
    "bahanAktif": "Diafentiuron",
    "merekPopuler": "Pegasus 500 SC",
    "grupIrac": "12A",
    "targetHama": ["Kutu Kebul", "Thrips", "Tungau", "Kutu Daun"]
  },

  // --- GRUP 13: PELEPAS FOSFORILASI OKSIDATIF (GANGGUAN SEL) ---
  {
    "id": 24,
    "bahanAktif": "Klorfenapir",
    "merekPopuler": "Arjuna 200 EC",
    "grupIrac": "13",
    "targetHama": ["Ulat Grayak", "Thrips", "Kutu Daun", "Tungau"]
  },

  // --- GRUP 14: PEMBLOKIR SALURAN RESEPTOR ASETILKOLIN (SARAF PUSAT) ---
  {
    "id": 25,
    "bahanAktif": "Dimehipo",
    "merekPopuler": "Spontan 400 SL",
    "grupIrac": "14",
    "targetHama": ["Penggerek Batang Padi", "Wereng Coklat", "Ulat Pelipat Daun", "Lalat Bibit"]
  },
  {
    "id": 26,
    "bahanAktif": "Kartap Hidroklorida",
    "merekPopuler": "Padan 50 SP",
    "grupIrac": "14",
    "targetHama": ["Penggerek Batang Padi", "Ulat Pelipat Daun", "Wereng Coklat"]
  },

  // --- GRUP 15: PENGHAMBAT BIOSINTESIS KITIN TIPE 0 (IGR - KULIT) ---
  {
    "id": 27,
    "bahanAktif": "Lufenuron",
    "merekPopuler": "Match 50 EC",
    "grupIrac": "15",
    "targetHama": ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Kubis"]
  },
  {
    "id": 28,
    "bahanAktif": "Klorfluazuron",
    "merekPopuler": "Atabron 50 EC",
    "grupIrac": "15",
    "targetHama": ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Polong"]
  },
  {
    "id": 29,
    "bahanAktif": "Novaluron",
    "merekPopuler": "Rimon 100 EC",
    "grupIrac": "15",
    "targetHama": ["Ulat Grayak", "Ulat Pelipat Daun", "Penggorok Daun"]
  },

  // --- GRUP 16: PENGHAMBAT BIOSINTESIS KITIN TIPE 1 (IGR - HOMOPTERA) ---
  {
    "id": 30,
    "bahanAktif": "Buprofezin",
    "merekPopuler": "Applaud 10 WP",
    "grupIrac": "16",
    "targetHama": ["Wereng Coklat (Nimfa)", "Kutu Kebul", "Kutu Putih"]
  },

  // --- GRUP 18: AGONIS RESEPTOR EKDISON (IGR - HORMON GANTI KULIT) ---
  {
    "id": 31,
    "bahanAktif": "Metoksifenozida",
    "merekPopuler": "Intrepid 250 SC",
    "grupIrac": "18",
    "targetHama": ["Ulat Grayak", "Ulat Krop", "Ulat Penggerek Buah"]
  },
  {
    "id": 32,
    "bahanAktif": "Tebufenozida",
    "merekPopuler": "Mimic 20 F",
    "grupIrac": "18",
    "targetHama": ["Ulat Grayak", "Ulat Penggerek Buah"]
  },

  // --- GRUP 21: PENGHAMBAT TRANSPORT ELEKTRON (ENZIM) ---
  {
    "id": 33,
    "bahanAktif": "Piridaben",
    "merekPopuler": "Samite 135 EC",
    "grupIrac": "21A",
    "targetHama": ["Tungau", "Kutu Kebul", "Thrips"]
  },

  // --- GRUP 22: PEMBLOKIR SALURAN NATRIUM BERGANTUNG VOLTASE (SARAF) ---
  {
    "id": 34,
    "bahanAktif": "Indoksakarb",
    "merekPopuler": "Ammate 150 EC",
    "grupIrac": "22A",
    "targetHama": ["Ulat Grayak", "Ulat Krop", "Ulat Buah"]
  },

  // --- GRUP 28: MODULATOR RESEPTOR RYANODINE (PELUMPUH OTOT TINGKAT TINGGI) ---
  {
    "id": 35,
    "bahanAktif": "Tetraniliprol",
    "merekPopuler": "Vayego 200 SC",
    "grupIrac": "28",
    "targetHama": ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Buah"]
  },
  {
    "id": 36,
    "bahanAktif": "Klorantraniliprol",
    "merekPopuler": "Prevathon 50 SC",
    "grupIrac": "28",
    "targetHama": ["Penggerek Batang Padi", "Ulat Grayak", "Ulat Pelipat Daun"]
  },
  {
    "id": 37,
    "bahanAktif": "Flubendiamida",
    "merekPopuler": "Belt 480 SC",
    "grupIrac": "28",
    "targetHama": ["Ulat Grayak", "Penggerek Batang Padi", "Ulat Penggerek Polong"]
  },
  {
    "id": 38,
    "bahanAktif": "Sianantraniliprol",
    "merekPopuler": "Exirel 100 SE",
    "grupIrac": "28",
    "targetHama": ["Kutu Kebul", "Penggorok Daun", "Ulat Grayak", "Thrips"]
  },

  // --- GRUP 29: MODULATOR ORGAN CHORDOTONAL (PENGHAMBAT MAKAN SPESIFIK) ---
  {
    "id": 39,
    "bahanAktif": "Flonikamid",
    "merekPopuler": "Ulala 50 WG",
    "grupIrac": "29",
    "targetHama": ["Wereng Coklat", "Kutu Daun", "Thrips", "Kutu Kebul"]
  },

  // --- GRUP 30: MODULATOR ALOSTERIK SALURAN KLORIDA (SARAF - GENERASI TERBARU) ---
  {
    "id": 40,
    "bahanAktif": "Broflanilida",
    "merekPopuler": "Brofreya 53 SC",
    "grupIrac": "30",
    "targetHama": ["Ulat Grayak", "Ulat Kubis", "Ulat Penggerek Buah"]
  }
];

  // ==========================================
  // 2. INJEKSI TOMBOL KE TAB CONTAINER
  // ==========================================
  const tabContainer = document.querySelector('.tab-container');
  if (tabContainer) {
    const btnTab = document.createElement('button');
    btnTab.className = 'tab-btn';
    btnTab.id = 'tabRotasi';
    btnTab.innerText = 'ROTASI RACUN'; // Menggunakan teks tulisan standar
    
    // Memberikan event listener yang akan kita integrasikan ke switchMode
    btnTab.onclick = function() { window.switchMode('rotasi'); };
    tabContainer.appendChild(btnTab);
  }

  // ==========================================
  // 3. INJEKSI KONTEN KE DALAM .card 
  // Menggunakan elemen dan styling asli index.html
  // ==========================================
  const cardContainer = document.querySelector('.card');
  if (cardContainer) {
    const boxRotasi = document.createElement('div');
    boxRotasi.id = 'boxRotasi';
    boxRotasi.style.display = 'none';
    
    boxRotasi.innerHTML = `
      <div class="info-box" style="border-left-color: var(--accent-hama); background: rgba(239, 68, 68, 0.05); margin-bottom: 20px;">
        <strong style="color:var(--accent-hama);">♻️ Kalkulator Rotasi (IRAC)</strong><br>
        <span style="font-size: 0.8rem; color: var(--text-muted);">
          Mencegah hama kebal dengan menyaring dan menghindari golongan cara kerja bahan aktif yang sama.
        </span>
      </div>

      <div class="form-lahan">
        <div class="form-group">
          <label>🐛 TARGET HAMA SAAT INI</label>
          <select id="patch-hama" class="form-select" style="margin-bottom: 0;">
            <option value="Penggerek Batang Padi">Penggerek Batang Padi (Sundep/Beluk)</option>
            <option value="Wereng Coklat">Wereng Coklat</option>
            <option value="Ulat Grayak">Ulat Grayak</option>
            <option value="Kutu Daun">Kutu Daun / Aphids</option>
            <option value="Thrips">Thrips</option>
            <option value="Kutu Kebul">Kutu Kebul</option>
          </select>
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label>🧪 BAHAN AKTIF TERAKHIR DIPAKAI</label>
          <select id="patch-racun" class="form-select" style="margin-bottom: 0;">
            <option value="">-- Pilih Bahan Aktif --</option>
          </select>
        </div>
      </div>

      <button class="btn-main" id="btnHitungRotasi" style="background: var(--accent-hama); color: #fff; margin-bottom: 12px;">
        🔄 HITUNG ROTASI REKOMENDASI
      </button>

      <div id="patch-hasil" style="display:none; margin-top: 15px;"></div>
    `;
    
    cardContainer.appendChild(boxRotasi);
    
    // Populasi data dropdown racun
    const selectRacun = document.getElementById('patch-racun');
    databasePestisida.forEach(item => {
      let opt = document.createElement('option');
      opt.value = item.bahanAktif;
      opt.innerText = `${item.bahanAktif} (Grup ${item.grupIrac}) - cth: ${item.merekPopuler}`;
      selectRacun.appendChild(opt);
    });
    
    // Binding Fungsi Hitung
    document.getElementById('btnHitungRotasi').addEventListener('click', hitungRotasiPestisida);
  }

  // ==========================================
  // 4. LOGIKA PERHITUNGAN
  // ==========================================
  function hitungRotasiPestisida() {
    const hamaTerpilih = document.getElementById('patch-hama').value;
    const racunTerpilih = document.getElementById('patch-racun').value;
    const divHasil = document.getElementById('patch-hasil');

    if(!racunTerpilih) {
        // Menggunakan custom alert bawaan web Anda
        if (typeof alert === 'function') alert("Pilih bahan aktif sebelumnya terlebih dahulu!");
        return;
    }

    const dataSebelumnya = databasePestisida.find(item => item.bahanAktif === racunTerpilih);
    const grupTerlarang = dataSebelumnya ? dataSebelumnya.grupIrac : "";

    const rekomendasi = databasePestisida.filter(item => {
      return item.targetHama.includes(hamaTerpilih) && item.grupIrac !== grupTerlarang;
    });

    divHasil.innerHTML = "";
    if (rekomendasi.length === 0) {
      divHasil.innerHTML = `<div class="info-box" style="border-left-color: var(--red-alert);">Tidak ada rotasi alternatif di database untuk hama ini.</div>`;
    } else {
      let html = `<div class="info-box" style="border-left-color: var(--accent-green); background: rgba(16, 185, 129, 0.05);">`;
      html += `<strong style="color:var(--accent-green);">✅ Rekomendasi Opsi (Selain Grup ${grupTerlarang})</strong><br><br>`;
      
      rekomendasi.forEach(rek => {
        html += `
          <div style="border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 10px;">
            <div style="font-size:1.05rem; font-weight:700; color:var(--text-main);">${rek.bahanAktif} <span class="badge" style="background:var(--accent-green); color:#fff; font-size:0.6rem; margin-left:5px;">Grup ${rek.grupIrac}</span></div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Contoh Merek di Kios: <b>${rek.merekPopuler}</b></div>
          </div>
        `;
      });
      html += `</div>`;
      divHasil.innerHTML = html;
    }
    divHasil.style.display = 'block';
  }

  // ==========================================
  // 5. PENCEGATAN FUNGSI NATIVE (MONKEY PATCHING)
  // Memastikan tab baru saling sinkron saat di-klik dengan menu lama
  // ==========================================
  if (typeof window.switchMode === 'function') {
    const fungsiSwitchModeAsli = window.switchMode;
    
    window.switchMode = function(mode) {
      const boxRotasi = document.getElementById('boxRotasi');
      const tabRotasi = document.getElementById('tabRotasi');
      
      // Sembunyikan milik kita secara default sebelum mengeksekusi fungsi lama
      if (boxRotasi) boxRotasi.style.display = 'none';

      if (mode === 'rotasi') {
        // Jika mode kita yang di-klik, eksekusi fungsi bawaan dengan nilai dummy agar menu lain tertutup
        fungsiSwitchModeAsli('dummy_sembunyikan_semua');
        
        // Paksa hilangkan class active di seluruh tab
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        // Tampilkan Tab Rotasi
        if (boxRotasi) boxRotasi.style.display = 'block';
        if (tabRotasi) tabRotasi.classList.add('active');
        
        // Ganti Judul
        document.getElementById('modeTitle').innerText = 'Rotasi & Smart Mixing';
        document.getElementById('tabSubtitleDisplay').style.display = 'none';
      } else {
        // Biarkan web menangani tab aslinya seperti biasa
        fungsiSwitchModeAsli(mode);
      }
    };
  }

})();
