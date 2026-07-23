// ==============================================================================
// GOOGLE APPS SCRIPT - SISTEM PRESENSI DIGITAL SMPN 2 PABUARAN
// ==============================================================================
// Petunjuk Penggunaan:
// 1. Buka Google Sheets Anda (tempat menampung data absensi).
// 2. Klik menu "Ekstensi" -> "Apps Script".
// 3. Hapus semua isi file Code.gs yang lama, lalu tempelkan seluruh kode ini.
// 4. Jalankan fungsi setupDatabase() sekali saja untuk membuat sheet & header otomatis.
// 5. Klik tombol "Terapkan" (Deploy) -> "Terapkan baru" (New deployment).
//    - Jenis Deployment: "Aplikasi Web" (Web app)
//    - Jalankan sebagai: "Saya" (Me)
//    - Siapa yang memiliki akses: "Siapa saja" (Anyone)
// 6. Salin URL Aplikasi Web yang dihasilkan dan masukkan ke Pengaturan Aplikasi Absensi.
// ==============================================================================

const FOLDER_NAME = "Presensi_Foto_SMPN2Pabuaran";

// Pemetaan Nama Sheet dan Header Kolom Berbahasa Indonesia
const TABLES = [
  { name: "Data_Guru", headers: ["nip", "nama", "peran", "mapel", "status", "noHp", "email"] },
  { name: "Data_Siswa", headers: ["nis", "nama", "kelas", "barcode"] },
  { name: "Presensi_Siswa", headers: ["id", "nama", "nis", "kelas", "waktu", "status", "tanggal", "idSesi", "mapel", "guru"] },
  { name: "Sesi_Mengajar", headers: ["id", "nama", "nip", "mapel", "kelas", "jam", "status", "waktuMulai", "waktuSelesai", "linkFoto", "tanggal"] },
  { name: "Pengajuan_Izin", headers: ["id", "nama", "nip", "tipe", "tanggalMulai", "tanggalSelesai", "alasan", "status", "linkLampiran"] },
  { name: "Jadwal_Mengajar", headers: ["id", "hari", "kelas", "jam", "mapel", "nipGuru"] },
  { name: "Presensi_Guru", headers: ["id", "tipe", "tanggal", "waktu", "nip", "nama", "linkFoto", "jarak"] },
  { name: "Pengaturan_Sistem", headers: ["kunci", "nilai"] },
  { name: "Hari_Libur", headers: ["id", "tanggal", "nama"] },
  { name: "Jadwal_Piket", headers: ["id", "hari", "nipGuru"] },
  { name: "Guru_Pengganti", headers: ["id", "tanggal", "kelas", "mapel", "jam", "nipAbsen", "nipPengganti", "tugas", "status", "catatan"] }
];

// Pemetaan Nama Lama (Bahasa Inggris) ke Nama Baru (Bahasa Indonesia)
const ALIAS_COLLECTIONS = {
  "teachers": "Data_Guru",
  "students": "Data_Siswa",
  "studentrecords": "Presensi_Siswa",
  "teachingsessions": "Sesi_Mengajar",
  "izinrequests": "Pengajuan_Izin",
  "teachingschedule": "Jadwal_Mengajar",
  "attendancerecords": "Presensi_Guru",
  "systemsettings": "Pengaturan_Sistem",
  "holidays": "Hari_Libur",
  "piketschedule": "Jadwal_Piket",
  "classsubstitutions": "Guru_Pengganti"
};

// Inisialisasi Sheet & Folder Google Drive
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  TABLES.forEach(table => {
    let sheet = getSheetCaseInsensitive(ss, table.name);
    if (!sheet) {
      sheet = ss.insertSheet(table.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]);
      sheet.getRange(1, 1, 1, table.headers.length).setFontWeight("bold").setBackground("#e2e8f0");
      sheet.setFrozenRows(1);
    }
  });

  getOrCreateMonthlyFolder();
  Logger.log("Database & Folder Google Drive berhasil disiapkan!");
}

// Mendapatkan atau membuat folder induk penyimpanan foto di Google Drive
function getOrCreateParentFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    const folder = DriveApp.createFolder(FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  }
}

// Mendapatkan atau membuat subfolder bulanan (contoh: 2026_07_Juli) di dalam folder induk
function getOrCreateMonthlyFolder() {
  const parentFolder = getOrCreateParentFolder();
  const now = new Date();
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const year = now.getFullYear();
  const monthNum = String(now.getMonth() + 1).padStart(2, "0");
  const monthName = monthNames[now.getMonth()];
  const monthlyFolderName = `${year}_${monthNum}_${monthName}`; // Contoh: 2026_07_Juli

  const subFolders = parentFolder.getFoldersByName(monthlyFolderName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  } else {
    const subFolder = parentFolder.createFolder(monthlyFolderName);
    subFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return subFolder;
  }
}

// Menyimpan gambar Base64 dari kamera/bukti ke subfolder bulanan Google Drive
function saveBase64ImageToDrive(base64Data, collectionName, record) {
  if (!base64Data || typeof base64Data !== "string" || !base64Data.startsWith("data:image")) {
    return base64Data || ""; 
  }
  try {
    const folder = getOrCreateMonthlyFolder();
    const splitData = base64Data.split(",");
    const contentTypeMatch = splitData[0].match(/:(.*?);/);
    const contentType = contentTypeMatch ? contentTypeMatch[1] : "image/jpeg";
    const decodedData = Utilities.base64Decode(splitData[1]);
    
    // Format Penamaan Opsi A: [NamaTabel]_[NIP/NIS/Nama/ID]_[Tanggal_Waktu].jpg
    let identifier = "";
    if (record && typeof record === "object") {
      identifier = record.nip || record.nama || record.name || record.nis || record.id || "";
    }
    identifier = String(identifier).replace(/[^a-zA-Z0-9_\-]/g, "_").trim();
    if (!identifier) identifier = "Data";

    const now = new Date();
    const timeZone = Session.getScriptTimeZone() || "GMT+7";
    const dateStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd_HHmmss");

    const fileName = `${collectionName || "Foto"}_${identifier}_${dateStr}.jpg`;

    const blob = Utilities.newBlob(decodedData, contentType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log("Error saving image to Drive: " + err.toString());
    return "";
  }
}

// Helper untuk mengolah semua gambar Base64 di dalam record
function processBase64ImagesInRecord(record, collectionName) {
  if (!record || typeof record !== "object") return record;

  // 1. Cek bidang foto presensi/KBM (photo, photoLink, linkFoto)
  let photoVal = record.photo || record.photoLink || record.linkFoto;
  if (photoVal && typeof photoVal === "string" && photoVal.indexOf("data:image") === 0) {
    const driveUrl = saveBase64ImageToDrive(photoVal, collectionName, record);
    if (driveUrl) {
      record.linkFoto = driveUrl;
      if (record.photo) delete record.photo;
      if (record.photoLink) delete record.photoLink;
    }
  }

  // 2. Cek bidang lampiran surat izin (attachment, attachmentDriveLink, linkLampiran)
  let attachVal = record.attachment || record.attachmentDriveLink || record.linkLampiran;
  if (attachVal && typeof attachVal === "string" && attachVal.indexOf("data:image") === 0) {
    const driveUrl = saveBase64ImageToDrive(attachVal, "Pengajuan_Izin", record);
    if (driveUrl) {
      record.linkLampiran = driveUrl;
      if (record.attachment) delete record.attachment;
      if (record.attachmentDriveLink) delete record.attachmentDriveLink;
    }
  }

  return record;
}

// Helper untuk mengambil sheet tanpa memedulikan huruf besar/kecil & alias
function getSheetCaseInsensitive(ss, sheetName) {
  if (!sheetName) return null;
  const targetName = ALIAS_COLLECTIONS[sheetName.toLowerCase().trim()] || sheetName;
  const sheets = ss.getSheets();
  const targetLower = targetName.toLowerCase().trim();
  
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === targetLower) {
      return sheets[i];
    }
  }
  return ss.insertSheet(targetName);
}

// Memproses POST Request dari aplikasi web
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: "error", message: "Payload kosong" });
    }

    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. ACTION: getAll (Mengambil semua data sekaligus)
    if (action === "getAll") {
      const allData = getAllCollectionsData(ss);
      return responseJSON({ status: "success", data: allData });
    }

    // 2. ACTION: saveItem (Menyimpan/Memperbarui 1 baris item)
    if (action === "saveItem") {
      const rawCollection = contents.collection || contents.sheet;
      const keyName = contents.key || "id";
      let record = contents.data;

      if (!rawCollection || !record) {
        return responseJSON({ status: "error", message: "Collection atau data tidak valid" });
      }

      const collectionName = ALIAS_COLLECTIONS[rawCollection.toLowerCase().trim()] || rawCollection;

      // Olah foto jika berupa base64
      record = processBase64ImagesInRecord(record, collectionName);

      const sheet = getSheetCaseInsensitive(ss, collectionName);
      upsertRecordInSheet(sheet, record, keyName);

      return responseJSON({ status: "success", message: "Item berhasil disimpan", record });
    }

    // 3. ACTION: saveBatch / uploadAll / syncAll (Menyimpan seluruh data koleksi)
    if (action === "saveBatch" || action === "uploadAll" || action === "syncAll") {
      if (action === "saveBatch" && contents.collection && contents.data) {
        const collectionName = ALIAS_COLLECTIONS[contents.collection.toLowerCase().trim()] || contents.collection;
        const sheet = getSheetCaseInsensitive(ss, collectionName);
        overwriteSheetData(sheet, contents.data, collectionName);
      } else if (contents.data && typeof contents.data === "object") {
        Object.keys(contents.data).forEach(colKey => {
          const items = contents.data[colKey];
          if (Array.isArray(items)) {
            const collectionName = ALIAS_COLLECTIONS[colKey.toLowerCase().trim()] || colKey;
            const sheet = getSheetCaseInsensitive(ss, collectionName);
            overwriteSheetData(sheet, items, collectionName);
          }
        });
      }
      return responseJSON({ status: "success", message: "Batch data berhasil disimpan" });
    }

    // 4. ACTION: deleteItem (Menghapus 1 item berdasarkan ID/NIP/NIS)
    if (action === "deleteItem") {
      const rawCollection = contents.collection;
      const keyName = contents.key || "id";
      const targetId = String(contents.id);

      if (rawCollection && targetId) {
        const collectionName = ALIAS_COLLECTIONS[rawCollection.toLowerCase().trim()] || rawCollection;
        const sheet = getSheetCaseInsensitive(ss, collectionName);
        deleteRecordFromSheet(sheet, keyName, targetId);
      }
      return responseJSON({ status: "success", message: "Item berhasil dihapus" });
    }

    // 5. ACTION: clearCollection (Mengosongkan sheet)
    if (action === "clearCollection") {
      const rawCollection = contents.collection;
      if (rawCollection) {
        const collectionName = ALIAS_COLLECTIONS[rawCollection.toLowerCase().trim()] || rawCollection;
        const sheet = getSheetCaseInsensitive(ss, collectionName);
        if (sheet && sheet.getLastRow() > 1) {
          sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
        }
      }
      return responseJSON({ status: "success", message: "Koleksi berhasil dikosongkan" });
    }

    // 6. ACTION: saveSettings (Menyimpan Pengaturan Sistem)
    if (action === "saveSettings") {
      const settingsData = contents.data;
      if (Array.isArray(settingsData)) {
        const sheet = getSheetCaseInsensitive(ss, "Pengaturan_Sistem");
        overwriteSheetData(sheet, settingsData, "Pengaturan_Sistem");
      }
      return responseJSON({ status: "success", message: "Pengaturan berhasil disimpan" });
    }

    // 7. ACTION: saveRecord (Fallback)
    if (action === "saveRecord") {
      const rawSheet = contents.sheet || "Presensi_Guru";
      const collectionName = ALIAS_COLLECTIONS[rawSheet.toLowerCase().trim()] || rawSheet;
      let record = contents.record;

      if (record.photo && typeof record.photo === "string" && record.photo.startsWith("data:image")) {
        record.linkFoto = saveBase64ImageToDrive(record.photo, collectionName, record);
        delete record.photo;
      }
      if (record.attachment && typeof record.attachment === "string" && record.attachment.startsWith("data:image")) {
        record.linkLampiran = saveBase64ImageToDrive(record.attachment, "Pengajuan_Izin", record);
        delete record.attachment;
      }
      const sheet = getSheetCaseInsensitive(ss, collectionName);
      upsertRecordInSheet(sheet, record, "id");
      return responseJSON({ status: "success", message: "Record berhasil disimpan", record });
    }

    return responseJSON({ status: "error", message: "Action tidak dikenal: " + action });

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

// Memproses GET Request dari browser / cURL
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allData = getAllCollectionsData(ss);
    return responseJSON({ status: "success", data: allData });
  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

// Helper untuk memformat jam / Date objek dari Google Sheets ke format HH:mm
function cleanTimeValueAppsScript(val, tz) {
  if (val === null || val === undefined) return val;
  var targetTz = tz || "Asia/Jakarta";

  // Objek Date langsung dari Google Sheets
  if (Object.prototype.toString.call(val) === '[object Date]') {
    var yr = val.getFullYear();
    if (yr === 1899 || yr === 1900) {
      return Utilities.formatDate(val, targetTz, "HH:mm");
    }
    return Utilities.formatDate(val, targetTz, "yyyy-MM-dd HH:mm:ss");
  }

  // String bernilai ISO Date seperti "1899-12-29T23:52:48.000Z" atau "1899-12-30T07:52:48.000Z"
  if (typeof val === "string" && (val.indexOf("1899-") !== -1 || val.indexOf("1900-") !== -1)) {
    try {
      var d = new Date(val);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, targetTz, "HH:mm");
      }
    } catch(e) {}
  }

  // Jika berbentuk Objek / Array (misal workDays)
  if (typeof val === "object") {
    for (var k in val) {
      val[k] = cleanTimeValueAppsScript(val[k], targetTz);
    }
  }

  return val;
}

// Helper untuk memformat sel sebelum ditulis ke Google Sheets
function formatCellForSheet(val, headerName) {
  if (val === undefined || val === null) return "";
  if (typeof val === "object") return JSON.stringify(val);

  var strVal = String(val).trim();
  if (strVal === "") return "";

  // Lepaskan petik tunggal jika ada
  if (strVal.indexOf("'") === 0) {
    strVal = strVal.substring(1);
  }

  // Jika nilai datang berupa notasi ilmiah (misal 1,97601E+17 atau 1.97601e17)
  if (/^[0-9]+[.,]?[0-9]*[eE]\+?[0-9]+$/i.test(strVal)) {
    try {
      var num = Number(strVal.replace(',', '.'));
      if (!isNaN(num) && isFinite(num)) {
        strVal = Math.round(num).toLocaleString('fullwide', {useGrouping:false});
      }
    } catch(e) {}
  }

  var lowerHeader = (headerName || "").toLowerCase();
  var isTextIdField = /^(nip|nis|nohp|phone|barcode|nik|telepon|kunci|nilai|headmasternip|nipguru|nipabsen|nippengganti)/i.test(lowerHeader) || lowerHeader.indexOf("nip") !== -1 || lowerHeader.indexOf("nis") !== -1;
  var isLongDigits = /^\d{8,}$/.test(strVal);

  if (isTextIdField || isLongDigits) {
    // Tambahkan tanda petik tunggal (') di awal agar Google Sheets menyimpannya sebagai TEKS murni tanpa notasi ilmiah
    return "'" + strVal;
  }

  return val;
}

// Helper untuk mengambil seluruh data dari semua Sheet
function getAllCollectionsData(ss) {
  const sheets = ss.getSheets();
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Jakarta";
  let result = {};

  sheets.forEach(sheet => {
    const name = sheet.getName();
    const data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const rows = data.slice(1).map(row => {
        let obj = {};
        headers.forEach((h, idx) => {
          let val = row[idx];
          val = cleanTimeValueAppsScript(val, tz);

          if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
            try { 
              val = JSON.parse(val); 
              val = cleanTimeValueAppsScript(val, tz);
            } catch(e) {}
          }
          if (typeof val === "string" && val.indexOf("'") === 0) {
            val = val.substring(1);
          }
          // Jika terbaca sebagai number/scientific string untuk NIP/NIS/ID
          if (typeof val === "number" && val > 1e10) {
            val = Math.round(val).toLocaleString('fullwide', {useGrouping:false});
          } else if (typeof val === "string" && /^[0-9]+[.,]?[0-9]*[eE]\+?[0-9]+$/i.test(val)) {
            try {
              var num = Number(val.replace(',', '.'));
              if (!isNaN(num) && isFinite(num)) {
                val = Math.round(num).toLocaleString('fullwide', {useGrouping:false});
              }
            } catch(e) {}
          }
          obj[h] = val;
        });
        return obj;
      });
      result[name] = rows;
    } else {
      result[name] = [];
    }
  });

  return result;
}

// Helper untuk menyisipkan/memperbarui baris data (Upsert)
function upsertRecordInSheet(sheet, record, keyName) {
  if (sheet.getLastRow() === 0) {
    const headers = Object.keys(record);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
  }

  const data = sheet.getDataRange().getValues();
  let headers = data[0];
  
  // Pastikan semua kolom record ada di header
  const recordKeys = Object.keys(record);
  recordKeys.forEach(k => {
    if (headers.indexOf(k) === -1) {
      headers.push(k);
      sheet.getRange(1, headers.length).setValue(k).setFontWeight("bold").setBackground("#e2e8f0");
    }
  });

  // Cari keyIndex berdasarkan keyName atau pemetaan kuncinya
  let keyIndex = headers.indexOf(keyName);
  if (keyIndex === -1 && keyName === "key") keyIndex = headers.indexOf("kunci");
  if (keyIndex === -1 && keyName === "kunci") keyIndex = headers.indexOf("key");
  if (keyIndex === -1 && keyName === "name") keyIndex = headers.indexOf("nama");
  if (keyIndex === -1 && keyName === "nama") keyIndex = headers.indexOf("name");

  const keyValue = record[keyName] !== undefined ? record[keyName] : (record["kunci"] || record["nama"]);
  let targetRowIndex = -1;

  if (keyIndex !== -1 && keyValue !== undefined && keyValue !== null) {
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][keyIndex]) === String(keyValue)) {
        targetRowIndex = r + 1; // 1-indexed
        break;
      }
    }
  }

  const rowValues = headers.map(h => formatCellForSheet(record[h], h));

  if (targetRowIndex > 0) {
    sheet.getRange(targetRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

// Helper untuk menulis/menimpa seluruh isi sheet dari array data
function overwriteSheetData(sheet, items, collectionName) {
  if (!sheet) return;
  if (!items || !Array.isArray(items) || items.length === 0) {
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(1, sheet.getLastColumn())).clearContent();
    }
    return;
  }

  // Olah foto untuk seluruh array item
  items.forEach((item, index) => {
    items[index] = processBase64ImagesInRecord(item, collectionName);
  });

  // Tentukan susunan header dari TABLES + key tambahan pada items
  let headers = [];
  const tableDef = TABLES.find(t => t.name.toLowerCase() === collectionName.toLowerCase());
  if (tableDef && tableDef.headers) {
    headers = tableDef.headers.slice();
  }

  items.forEach(item => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach(key => {
        if (!headers.includes(key)) {
          headers.push(key);
        }
      });
    }
  });

  if (headers.length === 0) return;

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
  sheet.setFrozenRows(1);

  const rows = items.map(item => headers.map(h => formatCellForSheet(item[h], h)));

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

// Helper untuk menghapus baris data
function deleteRecordFromSheet(sheet, keyName, targetId) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headers = data[0];
  let keyIndex = headers.indexOf(keyName);
  if (keyIndex === -1 && keyName === "key") keyIndex = headers.indexOf("kunci");
  if (keyIndex === -1 && keyName === "kunci") keyIndex = headers.indexOf("key");

  if (keyIndex === -1) return;

  for (let r = data.length - 1; r >= 1; r--) {
    if (String(data[r][keyIndex]) === String(targetId)) {
      sheet.deleteRow(r + 1);
      break;
    }
  }
}

// Helper Response JSON dengan CORS Header
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
