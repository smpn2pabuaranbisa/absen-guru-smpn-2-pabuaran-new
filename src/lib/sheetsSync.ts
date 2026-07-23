/**
 * MODULE SINKRONISASI GOOGLE SHEETS VIA GOOGLE APPS SCRIPT (GAS)
 * 
 * Sistem ini menggunakan Google Sheets secara langsung sebagai database utama.
 * Menyediakan sinkronisasi hibrida: local-first (menyimpan di localStorage secara instan)
 * dan cloud-sync (menyinkronkan ke Google Sheets di latar belakang secara asinkron).
 */

// Pemetaan Nama Koleksi Internal <-> Nama Sheet Bahasa Indonesia
const SHEET_NAME_MAP: Record<string, string> = {
  teachers: 'Data_Guru',
  students: 'Data_Siswa',
  studentRecords: 'Presensi_Siswa',
  teachingSessions: 'Sesi_Mengajar',
  izinRequests: 'Pengajuan_Izin',
  teachingSchedule: 'Jadwal_Mengajar',
  attendanceRecords: 'Presensi_Guru',
  systemSettings: 'Pengaturan_Sistem',
  holidays: 'Hari_Libur',
  piketSchedule: 'Jadwal_Piket',
  classSubstitutions: 'Guru_Pengganti'
};

// Pemetaan Kunci Utama per Koleksi
const PRIMARY_KEY_MAP: Record<string, string> = {
  teachers: 'nip',
  students: 'nis',
  studentRecords: 'id',
  teachingSessions: 'id',
  izinRequests: 'id',
  teachingSchedule: 'id',
  attendanceRecords: 'id',
  systemSettings: 'kunci',
  holidays: 'id',
  piketSchedule: 'id',
  classSubstitutions: 'id'
};

// Konversi Nama Koleksi ke Nama Sheet Bahasa Indonesia
export function toIndonesianSheetName(colName: string): string {
  return SHEET_NAME_MAP[colName] || colName;
}

/**
 * Membersihkan dan memformat string koordinat Latitude/Longitude
 * Mencegah kesalahan format akibat pemisah ribuan (titik berulang dari Google Sheets) atau koma.
 * Contoh:
 * Latitude:  "-6.114.196.248.039.070" -> "-6.114196248039070"
 * Longitude: "1.062.276.108.127.060" -> "106.2276108127060"
 */
export function cleanCoordinate(val: any, type: 'lat' | 'lng' = 'lat'): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim().replace(',', '.');
  if (!str) return '';

  const isNegative = str.startsWith('-');
  const dotCount = (str.match(/\./g) || []).length;

  if (dotCount > 1 || (dotCount === 0 && str.replace(/\D/g, '').length > 5)) {
    const digits = str.replace(/\D/g, '');
    if (!digits) return str;

    let intLen = 1;
    if (type === 'lat') {
      intLen = (digits.startsWith('10') || digits.startsWith('11')) ? 2 : 1;
    } else {
      intLen = digits.startsWith('1') ? 3 : 2;
    }

    const prefix = isNegative ? '-' : '';
    str = prefix + digits.substring(0, intLen) + '.' + digits.substring(intLen);
  }

  return str;
}

/**
 * Membersihkan dan memformat NIP, NIS, No HP, dan ID numerik panjang.
 * Mengubah notasi ilmiah (misal 1,97601E+17 atau 1.97601e17) menjadi string digit lengkap.
 */
export function cleanNipOrNis(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Buang petik tunggal jika ada di awal
  str = str.replace(/^'/, '');

  // Jika berbentuk notasi ilmiah (seperti 1,97601E+17, 1.97601e+17, 1.96503E+17)
  if (/^[0-9]+[.,]?[0-9]*[eE]\+?[0-9]+$/i.test(str)) {
    try {
      const num = Number(str.replace(',', '.'));
      if (!isNaN(num) && isFinite(num)) {
        str = BigInt(Math.round(num)).toString();
      }
    } catch (e) {
      // Fallback
    }
  }

  return str;
}

/**
 * Membersihkan dan memformat string Jam (misal "07:00", "15:00")
 * Mencegah kesalahan format akibat konversi ISO Date (seperti "1899-12-29T23:52:48.000Z" atau "1899-12-30T07:52:48.000Z")
 */
export function cleanTimeString(val: any): string {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Buang petik tunggal jika ada di awal
  str = str.replace(/^'/, '');

  // Jika sudah berformat HH:mm atau H:mm atau HH:mm:ss
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(':');
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  }

  // Jika berupa string ISO date (seperti "1899-12-29T23:52:48.000Z" atau "1899-12-30T07:52:48.000Z" atau ISO timestamp)
  if (str.includes('T') || str.includes('1899') || str.includes('1900') || str.includes('Z')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        let totalSeconds = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
        if (str.includes('1899')) {
          totalSeconds += (7 * 3600 + 7 * 60 + 12); // Offset LMT Jakarta 1899
        } else {
          totalSeconds += (7 * 3600); // Standard WIB offset (+7 Jam)
        }

        let totalMinutes = Math.round(totalSeconds / 60);
        let hours = Math.floor(totalMinutes / 60) % 24;
        let minutes = totalMinutes % 60;
        if (hours < 0) hours += 24;

        const hStr = String(hours).padStart(2, '0');
        const mStr = String(minutes).padStart(2, '0');
        return `${hStr}:${mStr}`;
      }
    } catch (e) {
      // Fallback
    }
  }

  return str;
}

/**
 * Membersihkan objek jam kerja / workDays / daySchedules / systemSettings
 */
export function cleanWorkDaysOrSettings(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;

  const copy = { ...settings };

  const cleanScheduleObj = (obj: any) => {
    if (!obj) return obj;
    let parsed = obj;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {}
    }
    if (parsed && typeof parsed === 'object') {
      const cleaned: any = {};
      for (const key of Object.keys(parsed)) {
        const item = parsed[key];
        if (item && typeof item === 'object') {
          cleaned[key] = {
            ...item,
            entryLimit: cleanTimeString(item.entryLimit || '07:00'),
            exitLimit: cleanTimeString(item.exitLimit || '15:00'),
            lateTolerance: parseInt(String(item.lateTolerance || 15)) || 15
          };
        } else {
          cleaned[key] = item;
        }
      }
      return cleaned;
    }
    return parsed;
  };

  if (copy.workDays) {
    copy.workDays = cleanScheduleObj(copy.workDays);
  }
  if (copy.daySchedules) {
    copy.daySchedules = cleanScheduleObj(copy.daySchedules);
  }

  if (copy.entryLimit) copy.entryLimit = cleanTimeString(copy.entryLimit);
  if (copy.exitLimit) copy.exitLimit = cleanTimeString(copy.exitLimit);

  return copy;
}

// Konversi Item Internal ke Format Kolom Bahasa Indonesia untuk Sheets
export function toIndonesianRecord(colName: string, item: any): any {
  if (!item || typeof item !== 'object') return item;
  const copy = { ...item };

  switch (colName) {
    case 'teachers':
      return {
        nip: cleanNipOrNis(copy.nip),
        nama: copy.name || copy.nama || '',
        peran: copy.role || copy.peran || 'guru',
        mapel: copy.mapel || '',
        status: copy.status || 'Aktif',
        noHp: cleanNipOrNis(copy.phone || copy.noHp),
        email: copy.email || ''
      };
    case 'students':
      return {
        nis: cleanNipOrNis(copy.nis),
        nama: copy.name || copy.nama || '',
        kelas: copy.kelas || '',
        barcode: cleanNipOrNis(copy.barcode || copy.nis)
      };
    case 'studentRecords':
      return {
        id: copy.id || '',
        nama: copy.name || copy.nama || '',
        nis: cleanNipOrNis(copy.nis),
        kelas: copy.kelas || '',
        waktu: cleanTimeString(copy.time || copy.waktu || ''),
        status: copy.status || '',
        tanggal: copy.date || copy.tanggal || new Date().toISOString().split('T')[0],
        idSesi: copy.sessionId || copy.idSesi || '',
        mapel: copy.mapel || '',
        guru: copy.guru || ''
      };
    case 'teachingSessions':
      return {
        id: copy.id || '',
        nama: copy.name || copy.nama || '',
        nip: cleanNipOrNis(copy.nip),
        mapel: copy.mapel || '',
        kelas: copy.kelas || '',
        jam: cleanTimeString(copy.jam || copy.time || ''),
        status: copy.status || '',
        waktuMulai: copy.timeStarted || copy.waktuMulai || '',
        waktuSelesai: copy.timeEnded || copy.waktuSelesai || '',
        linkFoto: copy.photoLink || copy.photo || copy.linkFoto || '',
        tanggal: copy.date || copy.tanggal || new Date().toISOString().split('T')[0]
      };
    case 'izinRequests':
      return {
        id: copy.id || '',
        nama: copy.name || copy.nama || '',
        nip: cleanNipOrNis(copy.nip),
        tipe: copy.tipe || '',
        tanggalMulai: copy.tanggalMulai || '',
        tanggalSelesai: copy.tanggalSelesai || '',
        alasan: copy.alasan || '',
        status: copy.status || 'Menunggu',
        linkLampiran: copy.attachmentDriveLink || copy.attachment || copy.linkLampiran || ''
      };
    case 'teachingSchedule':
      return {
        id: copy.id || '',
        hari: copy.day || copy.hari || '',
        kelas: copy.class || copy.kelas || '',
        jam: cleanTimeString(copy.time || copy.jam || ''),
        mapel: copy.subject || copy.mapel || '',
        nipGuru: cleanNipOrNis(copy.teacherNip || copy.nipGuru)
      };
    case 'attendanceRecords':
      return {
        id: copy.id || '',
        tipe: copy.type || copy.tipe || '',
        tanggal: copy.date || copy.tanggal || '',
        waktu: cleanTimeString(copy.time || copy.waktu || ''),
        nip: cleanNipOrNis(copy.nip),
        nama: copy.nama || copy.name || '',
        linkFoto: copy.photoLink || copy.photo || copy.linkFoto || '',
        jarak: copy.distance !== undefined ? copy.distance : (copy.jarak !== undefined ? copy.jarak : '')
      };
    case 'holidays':
      return {
        id: copy.id || '',
        tanggal: copy.date || copy.tanggal || '',
        nama: copy.name || copy.nama || ''
      };
    case 'piketSchedule':
      return {
        id: copy.id || '',
        hari: copy.day || copy.hari || '',
        nipGuru: Array.isArray(copy.teacherNips) ? JSON.stringify(copy.teacherNips) : (copy.teacherNips || copy.nipGuru || '')
      };
    case 'classSubstitutions':
      return {
        id: copy.id || '',
        tanggal: copy.date || copy.tanggal || '',
        kelas: copy.class || copy.kelas || '',
        mapel: copy.subject || copy.mapel || '',
        jam: copy.hours || copy.jam || '',
        nipAbsen: copy.absentNip || copy.nipAbsen || '',
        nipPengganti: copy.subNip || copy.nipPengganti || '',
        tugas: copy.task || copy.tugas || '',
        status: copy.status || 'Perlu Inval',
        catatan: copy.notes || copy.catatan || ''
      };
    default:
      return copy;
  }
}

// Konversi Item dari Google Sheets (Header Indonesia) Kembali ke Object Internal Aplikasi
export function fromIndonesianRecord(colName: string, item: any): any {
  if (!item || typeof item !== 'object') return item;

  switch (colName) {
    case 'teachers':
      return {
        nip: cleanNipOrNis(item.nip),
        name: item.nama || item.name || '',
        role: item.peran || item.role || 'guru',
        mapel: item.mapel || '',
        status: item.status || 'Aktif',
        phone: cleanNipOrNis(item.noHp || item.phone),
        email: item.email || ''
      };
    case 'students':
      return {
        nis: cleanNipOrNis(item.nis),
        name: item.nama || item.name || '',
        kelas: item.kelas || '',
        barcode: cleanNipOrNis(item.barcode || item.nis)
      };
    case 'studentRecords':
      return {
        id: String(item.id || ''),
        name: item.nama || item.name || '',
        nis: cleanNipOrNis(item.nis),
        kelas: item.kelas || '',
        time: cleanTimeString(item.waktu || item.time || ''),
        status: item.status || '',
        date: item.tanggal || item.date || '',
        sessionId: String(item.idSesi || item.sessionId || ''),
        mapel: item.mapel || '',
        guru: item.guru || ''
      };
    case 'teachingSessions':
      return {
        id: String(item.id || ''),
        name: item.nama || item.name || '',
        nip: cleanNipOrNis(item.nip),
        mapel: item.mapel || '',
        kelas: item.kelas || '',
        jam: cleanTimeString(item.jam || item.time || ''),
        status: item.status || '',
        timeStarted: item.waktuMulai || item.timeStarted || '',
        timeEnded: item.waktuSelesai || item.timeEnded || '',
        photoLink: item.linkFoto || item.photoLink || item.photo || null,
        photo: item.linkFoto || item.photoLink || item.photo || null,
        date: item.tanggal || item.date || ''
      };
    case 'izinRequests':
      return {
        id: String(item.id || ''),
        name: item.nama || item.name || '',
        nip: cleanNipOrNis(item.nip),
        tipe: item.tipe || '',
        tanggalMulai: item.tanggalMulai || '',
        tanggalSelesai: item.tanggalSelesai || '',
        alasan: item.alasan || '',
        status: item.status || 'Menunggu',
        attachmentDriveLink: item.linkLampiran || item.attachmentDriveLink || item.attachment || null,
        attachment: item.linkLampiran || item.attachmentDriveLink || item.attachment || null
      };
    case 'teachingSchedule':
      return {
        id: String(item.id || ''),
        day: item.hari || item.day || '',
        class: item.kelas || item.class || '',
        time: cleanTimeString(item.jam || item.time || ''),
        subject: item.mapel || item.subject || '',
        teacherNip: cleanNipOrNis(item.nipGuru || item.teacherNip)
      };
    case 'attendanceRecords':
      return {
        id: String(item.id || ''),
        type: item.tipe || item.type || '',
        date: item.tanggal || item.date || '',
        time: cleanTimeString(item.waktu || item.time || ''),
        nip: cleanNipOrNis(item.nip),
        nama: item.nama || item.name || '',
        photoLink: item.linkFoto || item.photoLink || item.photo || null,
        photo: item.linkFoto || item.photoLink || item.photo || null,
        distance: typeof item.jarak === 'number' ? item.jarak : (typeof item.distance === 'number' ? item.distance : parseFloat(item.jarak || item.distance || '0'))
      };
    case 'holidays':
      return {
        id: String(item.id || ''),
        date: item.tanggal || item.date || '',
        name: item.nama || item.name || ''
      };
    case 'piketSchedule': {
      let nips: string[] = [];
      const rawNips = item.nipGuru || item.teacherNips;
      if (Array.isArray(rawNips)) {
        nips = rawNips;
      } else if (typeof rawNips === 'string' && rawNips.trim()) {
        try {
          nips = JSON.parse(rawNips);
        } catch (e) {
          nips = rawNips.split(',').map(s => s.trim());
        }
      }
      return {
        id: String(item.id || ''),
        day: item.hari || item.day || '',
        teacherNips: nips
      };
    }
    case 'classSubstitutions':
      return {
        id: String(item.id || ''),
        date: item.tanggal || item.date || '',
        class: item.kelas || item.class || '',
        subject: item.mapel || item.subject || '',
        hours: item.jam || item.hours || '',
        absentNip: String(item.nipAbsen || item.absentNip || ''),
        subNip: String(item.nipPengganti || item.subNip || ''),
        task: item.tugas || item.task || '',
        status: item.status || 'Perlu Inval',
        notes: item.catatan || item.notes || ''
      };
    default:
      return item;
  }
}

// Mendapatkan URL Apps Script dari localStorage atau Pengaturan Sistem
export function getAppsScriptUrl(): string {
  const activeUrl = 'https://script.google.com/macros/s/AKfycbzJrqmzd0DrlDeMx_PM-VPokbR9GbbsBthG0y1nvNaED9EZmmqH32T__CxBI4tfiKCJBA/exec';

  const isOldUrl = (u: string | null) => {
    if (!u) return true;
    return (
      u.includes('AKfycbyulNiQG-YcSXqe1SyaaQbfEg32BaNcdt7IaaNAY-DL2dZhhujnfjYMiYFy0Fwlc7M4sA') ||
      u.includes('AKfycbz3jk_at9mWRFJ2Vmu7uSbR8mhAPAoTTYQToWCn42PbX_XZ583zZDdLahc5eS_2_GK3') ||
      u.includes('AKfycbyJDEN5WXWQli5I919-3mcN5GoCzO4DRDMcTyEQSIHwZa8MZiKe25wPTXuriRPVtYlJ')
    );
  };

  // 1. Coba ambil dari Environment Variable
  const envUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (envUrl && !isOldUrl(envUrl)) return envUrl;

  let localUrl = localStorage.getItem('appsScriptUrl');
  if (localUrl && isOldUrl(localUrl)) {
    localStorage.removeItem('appsScriptUrl');
    localUrl = null;
  }
  if (localUrl) return localUrl;
  
  try {
    const settingsStr = localStorage.getItem('absensi_systemSettings');
    if (settingsStr) {
      const settingsList = JSON.parse(settingsStr);
      const settings = settingsList[0] || settingsList;
      if (settings && settings.appsScriptUrl) {
        if (isOldUrl(settings.appsScriptUrl)) {
          settings.appsScriptUrl = activeUrl;
          localStorage.setItem('absensi_systemSettings', JSON.stringify([settings]));
        } else {
          return settings.appsScriptUrl;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return activeUrl;
}

// Fungsi pembantu untuk memanggil API Google Apps Script secara asinkron
async function callAppsScript(payload: any): Promise<any> {
  const url = getAppsScriptUrl();
  if (!url) return null;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // Menghindari isu preflight CORS di beberapa server GAS
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  } catch (error) {
    console.warn('Google Sheets sync request failed:', error);
    return null;
  }
}

// Helper Cache Lokal (localStorage)
function getLocalCache<T>(key: string, defaultValue: T[]): T[] {
  try {
    const data = localStorage.getItem(`absensi_${key}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn(`Gagal membaca cache lokal untuk ${key}:`, e);
  }
  saveLocalCache(key, defaultValue);
  return defaultValue;
}

function saveLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`absensi_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`Gagal menulis cache lokal untuk ${key}:`, e);
  }
}

// Pencatat status apakah inisiasi sinkronisasi penuh sudah selesai
let isInitialSyncDone = false;

// Helper untuk menyinkronkan data dari awan secara aman (melindungi data lokal jika awan kosong)
function safeSyncCollection(key: string, rawCloudItems: any[]): void {
  if (!rawCloudItems) return;
  const convertedCloudItems = rawCloudItems.map(item => fromIndonesianRecord(key, item));
  const localItems = getLocalCache(key, []);
  
  if (convertedCloudItems.length > 0 || localItems.length === 0) {
    saveLocalCache(key, convertedCloudItems);
  } else {
    console.log(`Menjaga data lokal untuk [${key}] karena data awan kosong.`);
  }
}

/**
 * Melakukan sinkronisasi penuh dengan Google Sheets di awal aplikasi dimuat.
 * Mengambil seluruh koleksi data sekaligus dalam satu request (SANGAT CEPAT!)
 * lalu memperbarui cache lokal localStorage agar performa aplikasi sangat mulus.
 */
export async function initialSyncWithGoogleSheets(): Promise<boolean> {
  const url = getAppsScriptUrl();
  if (!url) {
    console.log('Google Sheets URL tidak dikonfigurasi. Berjalan dalam mode Local Cache.');
    return false;
  }
  if (isInitialSyncDone) return true;
  
  try {
    console.log('Memulai sinkronisasi awal penuh dengan Google Sheets...');
    const result = await callAppsScript({ action: 'getAll' });
    if (result && result.status === 'success' && result.data) {
      const allData = result.data;
      
      // Sinkronisasikan setiap tabel secara aman (mendukung nama sheet Indonesia dan Inggris)
      safeSyncCollection('teachers', allData.Data_Guru || allData.teachers);
      safeSyncCollection('students', allData.Data_Siswa || allData.students);
      safeSyncCollection('studentRecords', allData.Presensi_Siswa || allData.studentRecords);
      safeSyncCollection('teachingSessions', allData.Sesi_Mengajar || allData.teachingSessions);
      safeSyncCollection('izinRequests', allData.Pengajuan_Izin || allData.izinRequests);
      safeSyncCollection('teachingSchedule', allData.Jadwal_Mengajar || allData.teachingSchedule);
      safeSyncCollection('attendanceRecords', allData.Presensi_Guru || allData.attendanceRecords);
      safeSyncCollection('holidays', allData.Hari_Libur || allData.holidays);
      safeSyncCollection('piketSchedule', allData.Jadwal_Piket || allData.piketSchedule);
      safeSyncCollection('classSubstitutions', allData.Guru_Pengganti || allData.classSubstitutions);
      
      const rawSettings = allData.Pengaturan_Sistem || allData.systemSettings;
      if (rawSettings) {
        const settings: any = {};
        rawSettings.forEach((item: any) => {
          const keyName = item.kunci || item.key;
          const valStr = item.nilai !== undefined ? item.nilai : item.value;
          if (keyName) {
            try {
              settings[keyName] = JSON.parse(valStr);
            } catch (e) {
              if (keyName === 'latitude') {
                settings[keyName] = cleanCoordinate(valStr, 'lat');
              } else if (keyName === 'longitude') {
                settings[keyName] = cleanCoordinate(valStr, 'lng');
              } else if (keyName === 'entryLimit' || keyName === 'exitLimit') {
                settings[keyName] = cleanTimeString(valStr);
              } else {
                settings[keyName] = valStr;
              }
            }
          }
        });
        const cleaned = cleanWorkDaysOrSettings(settings);
        if (Object.keys(cleaned).length > 0) {
          const cachedList = getLocalCache('systemSettings', []);
          const cachedSettings = cachedList[0] || cachedList;
          if (!cachedSettings || Object.keys(cachedSettings).length === 0) {
            saveLocalCache('systemSettings', [cleaned]);
          } else {
            const merged = cleanWorkDaysOrSettings({ ...cachedSettings, ...cleaned });
            saveLocalCache('systemSettings', [merged]);
          }
        }
      }
      isInitialSyncDone = true;
      console.log('Sinkronisasi penuh Google Sheets berhasil!');
      return true;
    }
  } catch (error) {
    console.warn('Gagal melakukan sinkronisasi awal penuh:', error);
  }
  return false;
}

/**
 * Mengunggah semua data lokal yang ada di localStorage ke Google Sheets secara manual.
 * Berguna saat pertama kali menghubungkan Google Sheets agar data lokal tidak hilang dan langsung terisi di lembar bentang.
 */
export async function uploadAllLocalDataToGoogleSheets(activeState?: {
  teachers?: any[];
  students?: any[];
  studentRecords?: any[];
  teachingSessions?: any[];
  izinRequests?: any[];
  teachingSchedule?: any[];
  attendanceRecords?: any[];
  holidays?: any[];
  piketSchedule?: any[];
  classSubstitutions?: any[];
  systemSettings?: any;
}): Promise<boolean> {
  const collections = [
    'teachers',
    'students',
    'studentRecords',
    'teachingSessions',
    'izinRequests',
    'teachingSchedule',
    'attendanceRecords',
    'holidays',
    'piketSchedule',
    'classSubstitutions'
  ];

  try {
    const payloadData: Record<string, any[]> = {};

    for (const col of collections) {
      let localData: any[] = [];
      const stateData = activeState && (activeState as any)[col];
      
      if (Array.isArray(stateData) && stateData.length > 0) {
        localData = stateData;
        saveLocalCache(col, localData);
      } else {
        localData = getLocalCache(col, []);
      }

      if (localData && localData.length > 0) {
        const indonesianSheet = toIndonesianSheetName(col);
        const formattedData = localData.map(item => toIndonesianRecord(col, item));
        payloadData[indonesianSheet] = formattedData;
      }
    }
    
    // Juga sertakan Pengaturan Sistem
    const cachedList = getLocalCache('systemSettings', []);
    const rawCached = (activeState && activeState.systemSettings) || cachedList[0] || cachedList;
    const cachedSettings = cleanWorkDaysOrSettings(rawCached);
    if (cachedSettings && Object.keys(cachedSettings).length > 0) {
      const flatSettings = Object.keys(cachedSettings).map(key => {
        let val = cachedSettings[key];
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        } else {
          val = String(val);
          if (key === 'latitude') {
            val = cleanCoordinate(val, 'lat');
          } else if (key === 'longitude') {
            val = cleanCoordinate(val, 'lng');
          } else if (key === 'headmasterNip' || /nip|nis|phone|nohp/i.test(key)) {
            val = cleanNipOrNis(val);
          } else if (key === 'entryLimit' || key === 'exitLimit') {
            val = cleanTimeString(val);
          }
        }
        return {
          kunci: key,
          nilai: val
        };
      });
      payloadData['Pengaturan_Sistem'] = flatSettings;
    }

    if (Object.keys(payloadData).length === 0) {
      console.warn('Tidak ada data lokal untuk diunggah.');
      return true;
    }

    console.log('Mengunggah seluruh data lokal ke Google Sheets...', Object.keys(payloadData));
    
    // Coba kirim batch gabungan sekaligus (action: uploadAll)
    const res = await callAppsScript({
      action: 'uploadAll',
      data: payloadData
    });

    if (res && res.status === 'success') {
      console.log('Unggah seluruh data berhasil via action uploadAll!');
      return true;
    }

    console.warn('Gagal mengunggah via uploadAll, mencoba fallback per-koleksi (saveBatch)...', res);
    
    // Fallback: mengunggah per-koleksi (saveBatch) satu per satu
    let anySuccess = false;
    for (const sheetName of Object.keys(payloadData)) {
      if (sheetName === 'Pengaturan_Sistem') {
        const resSet = await callAppsScript({
          action: 'saveSettings',
          data: payloadData[sheetName]
        });
        if (resSet && resSet.status === 'success') anySuccess = true;
      } else {
        const resBatch = await callAppsScript({
          action: 'saveBatch',
          collection: sheetName,
          data: payloadData[sheetName]
        });
        if (resBatch && resBatch.status === 'success') anySuccess = true;
      }
    }

    return anySuccess;
  } catch (error) {
    console.error('Gagal mengunggah data lokal ke Google Sheets:', error);
    return false;
  }
}

// 1. Sinkronisasi Data Guru
export async function getTeachersSync(defaultTeachers: any[]): Promise<any[]> {
  return getLocalCache('teachers', defaultTeachers);
}

export async function saveTeacherSync(teacher: any): Promise<void> {
  const list = getLocalCache('teachers', []);
  const index = list.findIndex(t => t.nip === teacher.nip);
  if (index >= 0) {
    list[index] = teacher;
  } else {
    list.push(teacher);
  }
  saveLocalCache('teachers', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('teachers'),
    key: 'nip',
    data: toIndonesianRecord('teachers', teacher)
  });
}

export async function saveTeachersSyncBatch(teachers: any[]): Promise<void> {
  const currentList = getLocalCache('teachers', []);
  const mergedList = [...currentList];
  teachers.forEach(t => {
    const idx = mergedList.findIndex(existing => existing.nip === t.nip);
    if (idx >= 0) {
      mergedList[idx] = t;
    } else {
      mergedList.push(t);
    }
  });
  saveLocalCache('teachers', mergedList);
  
  callAppsScript({
    action: 'saveBatch',
    collection: toIndonesianSheetName('teachers'),
    data: mergedList.map(item => toIndonesianRecord('teachers', item))
  });
}

export async function deleteTeacherSync(nip: string): Promise<void> {
  const list = getLocalCache('teachers', []);
  const filtered = list.filter(t => t.nip !== nip);
  saveLocalCache('teachers', filtered);
  
  callAppsScript({
    action: 'deleteItem',
    collection: toIndonesianSheetName('teachers'),
    key: 'nip',
    id: nip
  });
}

// 2. Sinkronisasi Data Siswa
export async function getStudentsSync(defaultStudents: any[]): Promise<any[]> {
  return getLocalCache('students', defaultStudents);
}

export async function saveStudentSync(student: any): Promise<void> {
  const list = getLocalCache('students', []);
  const index = list.findIndex(s => s.nis === student.nis);
  if (index >= 0) {
    list[index] = student;
  } else {
    list.push(student);
  }
  saveLocalCache('students', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('students'),
    key: 'nis',
    data: toIndonesianRecord('students', student)
  });
}

export async function saveStudentsSyncBatch(students: any[]): Promise<void> {
  const currentList = getLocalCache('students', []);
  const mergedList = [...currentList];
  students.forEach(s => {
    const idx = mergedList.findIndex(existing => existing.nis === s.nis);
    if (idx >= 0) {
      mergedList[idx] = s;
    } else {
      mergedList.push(s);
    }
  });
  saveLocalCache('students', mergedList);
  
  callAppsScript({
    action: 'saveBatch',
    collection: toIndonesianSheetName('students'),
    data: mergedList.map(item => toIndonesianRecord('students', item))
  });
}

export async function deleteStudentSync(nis: string): Promise<void> {
  const list = getLocalCache('students', []);
  const filtered = list.filter(s => s.nis !== nis);
  saveLocalCache('students', filtered);
  
  callAppsScript({
    action: 'deleteItem',
    collection: toIndonesianSheetName('students'),
    key: 'nis',
    id: nis
  });
}

// 3. Sinkronisasi Presensi Barcode Siswa (Scan Presensi)
export async function getStudentRecordsSync(defaultRecords: any[]): Promise<any[]> {
  return getLocalCache('studentRecords', defaultRecords);
}

export async function saveStudentRecordSync(record: any): Promise<void> {
  const list = getLocalCache('studentRecords', []);
  const index = list.findIndex(r => r.id === record.id);
  if (index >= 0) {
    list[index] = record;
  } else {
    list.push(record);
  }
  saveLocalCache('studentRecords', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('studentRecords'),
    key: 'id',
    data: toIndonesianRecord('studentRecords', record)
  });
}

// 4. Sinkronisasi Sesi Mengajar Hari Ini (KBM Hari Ini)
export async function getTeachingSessionsSync(defaultSessions: any[]): Promise<any[]> {
  return getLocalCache('teachingSessions', defaultSessions);
}

export async function saveTeachingSessionSync(session: any): Promise<void> {
  const list = getLocalCache('teachingSessions', []);
  const index = list.findIndex(s => s.id === session.id);
  if (index >= 0) {
    list[index] = session;
  } else {
    list.push(session);
  }
  saveLocalCache('teachingSessions', list);
  
  const res = await callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('teachingSessions'),
    key: 'id',
    data: toIndonesianRecord('teachingSessions', session)
  });

  if (res && res.record && res.record.linkFoto && typeof res.record.linkFoto === 'string' && res.record.linkFoto.startsWith('http')) {
    const updatedList = getLocalCache('teachingSessions', []);
    const idx = updatedList.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      updatedList[idx].photoLink = res.record.linkFoto;
      updatedList[idx].linkFoto = res.record.linkFoto;
      updatedList[idx].photo = res.record.linkFoto;
      saveLocalCache('teachingSessions', updatedList);
    }
  }
}

// 5. Sinkronisasi Surat Pengajuan Izin
export async function getIzinRequestsSync(defaultRequests: any[]): Promise<any[]> {
  return getLocalCache('izinRequests', defaultRequests);
}

export async function saveIzinRequestSync(request: any): Promise<void> {
  const list = getLocalCache('izinRequests', []);
  const index = list.findIndex(r => r.id === request.id);
  if (index >= 0) {
    list[index] = request;
  } else {
    list.push(request);
  }
  saveLocalCache('izinRequests', list);
  
  const res = await callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('izinRequests'),
    key: 'id',
    data: toIndonesianRecord('izinRequests', request)
  });

  if (res && res.record && res.record.linkLampiran && typeof res.record.linkLampiran === 'string' && res.record.linkLampiran.startsWith('http')) {
    const updatedList = getLocalCache('izinRequests', []);
    const idx = updatedList.findIndex(r => r.id === request.id);
    if (idx >= 0) {
      updatedList[idx].attachmentDriveLink = res.record.linkLampiran;
      updatedList[idx].linkLampiran = res.record.linkLampiran;
      updatedList[idx].attachment = res.record.linkLampiran;
      saveLocalCache('izinRequests', updatedList);
    }
  }
}

// 6. Sinkronisasi Jadwal Mengajar Guru
export async function getTeachingScheduleSync(defaultSchedule: any[]): Promise<any[]> {
  return getLocalCache('teachingSchedule', defaultSchedule);
}

export async function saveTeachingScheduleSync(schedule: any): Promise<void> {
  const list = getLocalCache('teachingSchedule', []);
  const index = list.findIndex(s => s.id === schedule.id);
  if (index >= 0) {
    list[index] = schedule;
  } else {
    list.push(schedule);
  }
  saveLocalCache('teachingSchedule', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('teachingSchedule'),
    key: 'id',
    data: toIndonesianRecord('teachingSchedule', schedule)
  });
}

export async function deleteTeachingScheduleSync(id: string | number): Promise<void> {
  const list = getLocalCache('teachingSchedule', []);
  const filtered = list.filter(s => String(s.id) !== String(id));
  saveLocalCache('teachingSchedule', filtered);
  
  callAppsScript({
    action: 'deleteItem',
    collection: toIndonesianSheetName('teachingSchedule'),
    key: 'id',
    id: String(id)
  });
}

// 7. Sinkronisasi Presensi Datang/Pulang Guru
export async function getAttendanceRecordsSync(): Promise<any[]> {
  return getLocalCache('attendanceRecords', []);
}

export async function saveAttendanceRecordSync(record: any): Promise<void> {
  const list = getLocalCache('attendanceRecords', []);
  const index = list.findIndex(r => r.id === record.id);
  if (index >= 0) {
    list[index] = record;
  } else {
    list.push(record);
  }
  saveLocalCache('attendanceRecords', list);
  
  const res = await callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('attendanceRecords'),
    key: 'id',
    data: toIndonesianRecord('attendanceRecords', record)
  });

  if (res && res.record && res.record.linkFoto && typeof res.record.linkFoto === 'string' && res.record.linkFoto.startsWith('http')) {
    const updatedList = getLocalCache('attendanceRecords', []);
    const idx = updatedList.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      updatedList[idx].photoLink = res.record.linkFoto;
      updatedList[idx].linkFoto = res.record.linkFoto;
      updatedList[idx].photo = res.record.linkFoto;
      saveLocalCache('attendanceRecords', updatedList);
    }
  }
}

// 8. Pembersihan Koleksi Data
export async function clearCollectionSync(collectionName: string): Promise<void> {
  saveLocalCache(collectionName, []);
  
  callAppsScript({
    action: 'clearCollection',
    collection: toIndonesianSheetName(collectionName)
  });
}

// 9. Kalender Akademik (Hari Libur)
export async function getHolidaysSync(): Promise<any[]> {
  return getLocalCache('holidays', []);
}

export async function saveHolidaySync(holiday: any): Promise<void> {
  const list = getLocalCache('holidays', []);
  const index = list.findIndex(h => h.id === holiday.id);
  if (index >= 0) {
    list[index] = holiday;
  } else {
    list.push(holiday);
  }
  saveLocalCache('holidays', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('holidays'),
    key: 'id',
    data: toIndonesianRecord('holidays', holiday)
  });
}

export async function deleteHolidaySync(id: string): Promise<void> {
  const list = getLocalCache('holidays', []);
  const filtered = list.filter(h => h.id !== id);
  saveLocalCache('holidays', filtered);
  
  callAppsScript({
    action: 'deleteItem',
    collection: toIndonesianSheetName('holidays'),
    key: 'id',
    id: id
  });
}

// 10. Pengaturan Sistem
export async function getSystemSettingsSync(defaultSettings: any): Promise<any> {
  const cachedList = getLocalCache('systemSettings', []);
  const cachedSettings = cachedList[0] || cachedList;
  if (cachedSettings && Object.keys(cachedSettings).length > 0) {
    let merged = cleanWorkDaysOrSettings({ ...defaultSettings, ...cachedSettings });
    if (
      !merged.appsScriptUrl ||
      merged.appsScriptUrl.includes('AKfycbyulNiQG-YcSXqe1SyaaQbfEg32BaNcdt7IaaNAY-DL2dZhhujnfjYMiYFy0Fwlc7M4sA') ||
      merged.appsScriptUrl.includes('AKfycbz3jk_at9mWRFJ2Vmu7uSbR8mhAPAoTTYQToWCn42PbX_XZ583zZDdLahc5eS_2_GK3') ||
      merged.appsScriptUrl.includes('AKfycbyJDEN5WXWQli5I919-3mcN5GoCzO4DRDMcTyEQSIHwZa8MZiKe25wPTXuriRPVtYlJ')
    ) {
      merged.appsScriptUrl = 'https://script.google.com/macros/s/AKfycbzJrqmzd0DrlDeMx_PM-VPokbR9GbbsBthG0y1nvNaED9EZmmqH32T__CxBI4tfiKCJBA/exec';
    }
    
    // Normalisasi koordinat, NIP, jam, angka, dan boolean dari spreadsheet / cache lokal
    if (merged.headmasterNip) {
      merged.headmasterNip = cleanNipOrNis(merged.headmasterNip);
    }
    if (merged.entryLimit) {
      merged.entryLimit = cleanTimeString(merged.entryLimit);
    }
    if (merged.exitLimit) {
      merged.exitLimit = cleanTimeString(merged.exitLimit);
    }
    if (merged.latitude !== undefined) {
      merged.latitude = cleanCoordinate(merged.latitude, 'lat');
    }
    if (merged.longitude !== undefined) {
      merged.longitude = cleanCoordinate(merged.longitude, 'lng');
    }
    if (merged.maxRadius !== undefined) {
      merged.maxRadius = parseInt(String(merged.maxRadius).replace(',', '.')) || defaultSettings.maxRadius;
    }
    if (merged.lateTolerance !== undefined) {
      merged.lateTolerance = parseInt(String(merged.lateTolerance).replace(',', '.')) || defaultSettings.lateTolerance;
    }
    if (merged.waGatewayEnabled !== undefined) {
      merged.waGatewayEnabled = String(merged.waGatewayEnabled) === 'true';
    }
    if (merged.waAdminNotificationsEnabled !== undefined) {
      merged.waAdminNotificationsEnabled = String(merged.waAdminNotificationsEnabled) === 'true';
    }
    
    return merged;
  }
  return cleanWorkDaysOrSettings(defaultSettings);
}

export async function saveSystemSettingsSync(settings: any): Promise<void> {
  const cleaned = cleanWorkDaysOrSettings(settings);
  saveLocalCache('systemSettings', [cleaned]);
  
  if (cleaned.appsScriptUrl) {
    localStorage.setItem('appsScriptUrl', cleaned.appsScriptUrl);
  } else {
    localStorage.removeItem('appsScriptUrl');
  }

  const flatSettings = Object.keys(cleaned).map(key => {
    let val = cleaned[key];
    if (typeof val === 'object') {
      val = JSON.stringify(val);
    } else {
      val = String(val);
      if (key === 'latitude') {
        val = cleanCoordinate(val, 'lat');
      } else if (key === 'longitude') {
        val = cleanCoordinate(val, 'lng');
      } else if (key === 'headmasterNip' || /nip|nis|phone|nohp/i.test(key)) {
        val = cleanNipOrNis(val);
      } else if (key === 'entryLimit' || key === 'exitLimit') {
        val = cleanTimeString(val);
      }
    }
    return {
      kunci: key,
      nilai: val
    };
  });

  callAppsScript({
    action: 'saveSettings',
    data: flatSettings
  });
}

// 11. Jadwal Piket
export async function getPiketScheduleSync(defaultSchedule: any[]): Promise<any[]> {
  return getLocalCache('piketSchedule', defaultSchedule);
}

export async function savePiketScheduleSync(piketDay: any): Promise<void> {
  const list = getLocalCache('piketSchedule', []);
  const index = list.findIndex(p => p.id === piketDay.id);
  if (index >= 0) {
    list[index] = piketDay;
  } else {
    list.push(piketDay);
  }
  saveLocalCache('piketSchedule', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('piketSchedule'),
    key: 'id',
    data: toIndonesianRecord('piketSchedule', piketDay)
  });
}

// 12. Substitusi Kelas / Inval
export async function getClassSubstitutionsSync(): Promise<any[]> {
  return getLocalCache('classSubstitutions', []);
}

export async function saveClassSubstitutionSync(substitution: any): Promise<void> {
  const list = getLocalCache('classSubstitutions', []);
  const index = list.findIndex(s => s.id === substitution.id);
  if (index >= 0) {
    list[index] = substitution;
  } else {
    list.push(substitution);
  }
  saveLocalCache('classSubstitutions', list);
  
  callAppsScript({
    action: 'saveItem',
    collection: toIndonesianSheetName('classSubstitutions'),
    key: 'id',
    data: toIndonesianRecord('classSubstitutions', substitution)
  });
}

export async function deleteClassSubstitutionSync(id: string): Promise<void> {
  const list = getLocalCache('classSubstitutions', []);
  const filtered = list.filter(s => s.id !== id);
  saveLocalCache('classSubstitutions', filtered);
  
  callAppsScript({
    action: 'deleteItem',
    collection: toIndonesianSheetName('classSubstitutions'),
    key: 'id',
    id: id
  });
}
