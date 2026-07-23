import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  LogIn, LogOut, BookOpen, UserMinus, 
  CheckCircle2, Clock, User, Mail, Phone, MapPin, 
  LayoutDashboard, Bell, Search, Activity, Sparkles, Plus, Camera, X, Navigation,
  GraduationCap, ChevronDown, FileText, Coffee, Image as ImageIcon,
  Lock, Shield, QrCode, Users, Check, Trash2, Edit, AlertCircle, XCircle, Upload, Calendar, Download, FileSpreadsheet, Settings, Building, Hash, FolderDown, RefreshCw,
  Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  getTeachersSync,
  saveTeacherSync,
  deleteTeacherSync,
  getStudentsSync,
  saveStudentSync,
  deleteStudentSync,
  saveStudentsSyncBatch,
  saveTeachersSyncBatch,
  getStudentRecordsSync,
  saveStudentRecordSync,
  getTeachingSessionsSync,
  saveTeachingSessionSync,
  getIzinRequestsSync,
  saveIzinRequestSync,
  getTeachingScheduleSync,
  saveTeachingScheduleSync,
  deleteTeachingScheduleSync,
  getAttendanceRecordsSync,
  saveAttendanceRecordSync,
  clearCollectionSync,
  getSystemSettingsSync,
  saveSystemSettingsSync,
  cleanCoordinate,
  cleanNipOrNis,
  cleanTimeString,
  cleanWorkDaysOrSettings,
  getHolidaysSync,
  saveHolidaySync,
  deleteHolidaySync,
  getPiketScheduleSync,
  savePiketScheduleSync,
  getClassSubstitutionsSync,
  saveClassSubstitutionSync,
  deleteClassSubstitutionSync,
  initialSyncWithGoogleSheets,
  uploadAllLocalDataToGoogleSheets,
  isSameDay,
  normalizeDateToYYYYMMDD
} from './lib/sheetsSync';

type AttendanceRecord = {
  id: string;
  type: string;
  date: string;
  time: string;
  color: string;
  bg: string;
  glow: string;
  iconName: string;
  nip?: string;
  nama?: string;
  photo?: string | null;
  distance?: number;
};

const attendanceButtons = [
  { id: 'datang', label: 'Absen Datang', icon: LogIn, iconName: 'LogIn', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', shadow: 'hover:shadow-[0_0_30px_rgba(52,211,153,0.3)]', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.4)]' },
  { id: 'pulang', label: 'Absen Pulang', icon: LogOut, iconName: 'LogOut', color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/30', shadow: 'hover:shadow-[0_0_30px_rgba(251,113,133,0.3)]', glow: 'shadow-[0_0_15px_rgba(251,113,133,0.4)]' },
  { id: 'mengajar', label: 'Mulai Mengajar', icon: BookOpen, iconName: 'BookOpen', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30', shadow: 'hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.4)]' },
  { id: 'izin', label: 'Izin / Sakit', icon: UserMinus, iconName: 'UserMinus', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30', shadow: 'hover:shadow-[0_0_30px_rgba(251,191,36,0.3)]', glow: 'shadow-[0_0_15px_rgba(251,191,36,0.4)]' },
];

// Helper function to calculate distance using Haversine formula
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in m
}

function getScheduleForDate(dateStr: string | null | undefined, settings: any) {
  const dateObj = dateStr ? new Date(dateStr) : new Date();
  const dayIndex = dateObj.getDay();
  if (settings.daySchedules && settings.daySchedules[dayIndex]) {
    return {
      ...settings.daySchedules[dayIndex],
      lateTolerance: settings.lateTolerance || 0 // Selalu gunakan toleransi global
    };
  }
  return {
    entryLimit: settings.entryLimit || "07:00",
    exitLimit: settings.exitLimit || "15:00",
    lateTolerance: settings.lateTolerance || 0
  };
}

export default function App() {
  const [userRole, setUserRole] = useState<'guest' | 'guru' | 'siswa' | 'admin'>('guest');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Directory lists (Guru & Staff)
  const [teachers, setTeachers] = useState<{name: string, nip: string, role: string, mapel: string, status: string}[]>([]);

  const [students, setStudents] = useState<{name: string, nis: string, kelas: string, barcode: string}[]>([]);

  const [studentRecords, setStudentRecords] = useState<{id: string, name: string, nis: string, kelas: string, time: string, status: string}[]>([]);

  const [holidays, setHolidays] = useState<{id: string, date: string, name: string}[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const [teachingSessionsToday, setTeachingSessionsToday] = useState<{id: string, name: string, nip: string, mapel: string, kelas: string, jam: string, status: string, timeStarted: string, timeEnded: string, photo?: string | null, photoLink?: string | null}[]>([]);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'semua' | 'hadir' | 'belum' | 'izin'>('semua');
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);

  const [izinRequests, setIzinRequests] = useState<{id: string, name: string, nip: string, tipe: string, tanggalMulai: string, tanggalSelesai: string, alasan: string, status: string, attachment: string | null, attachmentDriveLink?: string | null}[]>([]);

  // Guru Piket & Substitusi Kelas
  const [piketSchedule, setPiketSchedule] = useState<{ id: string; day: string; teacherNips: string[] }[]>([]);
  const [classSubstitutions, setClassSubstitutions] = useState<any[]>([]);
  const [showAddSubstitutionModal, setShowAddSubstitutionModal] = useState(false);
  const [newSubDate, setNewSubDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [newSubClass, setNewSubClass] = useState('');
  const [newSubSubject, setNewSubSubject] = useState('');
  const [newSubHours, setNewSubHours] = useState('');
  const [newSubAbsentNip, setNewSubAbsentNip] = useState('');
  const [newSubSubNip, setNewSubSubNip] = useState('');
  const [newSubTask, setNewSubTask] = useState('');

  const [editingPiketDay, setEditingPiketDay] = useState<any | null>(null);
  const [showEditPiketModal, setShowEditPiketModal] = useState(false);
  const [reportingSubId, setReportingSubId] = useState<string | null>(null);
  const [showReportSubModal, setShowReportSubModal] = useState(false);
  const [reportSubNotes, setReportSubNotes] = useState('');
  const [piketInnerTab, setPiketInnerTab] = useState<'substitusi' | 'jadwal' | 'riwayat'>('substitusi');

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [confirmDeleteTeacherRecords, setConfirmDeleteTeacherRecords] = useState(false);
  const [confirmDeleteSessions, setConfirmDeleteSessions] = useState(false);
  const [confirmDeleteStudentRecords, setConfirmDeleteStudentRecords] = useState(false);
  const [confirmDeleteIzinRequests, setConfirmDeleteIzinRequests] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const handleClearTeacherRecords = async () => {
    try {
      await clearCollectionSync('attendanceRecords');
      setRecords([]);
      showNotification('Semua riwayat absensi guru berhasil dihapus!', 'text-emerald-400');
      setConfirmDeleteTeacherRecords(false);
    } catch (e) {
      showNotification('Gagal menghapus data absensi guru.', 'text-rose-400');
    }
  };

  const handleClearSessions = async () => {
    try {
      await clearCollectionSync('teachingSessions');
      setTeachingSessionsToday([]);
      showNotification('Sesi mengajar hari ini berhasil dikosongkan!', 'text-emerald-400');
      setConfirmDeleteSessions(false);
    } catch (e) {
      showNotification('Gagal mengosongkan sesi mengajar.', 'text-rose-400');
    }
  };

  const handleClearStudentRecords = async () => {
    try {
      await clearCollectionSync('studentRecords');
      setStudentRecords([]);
      showNotification('Semua presensi barcode siswa berhasil dihapus!', 'text-emerald-400');
      setConfirmDeleteStudentRecords(false);
    } catch (e) {
      showNotification('Gagal menghapus presensi siswa.', 'text-rose-400');
    }
  };

  const handleClearIzinRequests = async () => {
    try {
      await clearCollectionSync('izinRequests');
      setIzinRequests([]);
      showNotification('Semua data pengajuan izin guru berhasil dihapus!', 'text-emerald-400');
      setConfirmDeleteIzinRequests(false);
    } catch (e) {
      showNotification('Gagal menghapus data pengajuan izin.', 'text-rose-400');
    }
  };

  const handleResetAllActivity = async () => {
    try {
      await Promise.all([
        clearCollectionSync('attendanceRecords'),
        clearCollectionSync('teachingSessions'),
        clearCollectionSync('studentRecords'),
        clearCollectionSync('izinRequests')
      ]);
      setRecords([]);
      setTeachingSessionsToday([]);
      setStudentRecords([]);
      setIzinRequests([]);
      showNotification('Seluruh data aktivitas berhasil direset!', 'text-emerald-400');
      setConfirmResetAll(false);
    } catch (e) {
      showNotification('Gagal melakukan reset seluruh data aktivitas.', 'text-rose-400');
    }
  };

  const [notification, setNotification] = useState<{ message: string; show: boolean; color: string }>({ message: '', show: false, color: '' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [schoolSettings, setSchoolSettings] = useState({
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbzJrqmzd0DrlDeMx_PM-VPokbR9GbbsBthG0y1nvNaED9EZmmqH32T__CxBI4tfiKCJBA/exec",
    schoolName: "SMPN 2 Pabuaran",
    academicYear: "2026/2027",
    headmasterName: "Drs. H. Ahmad Sunarya, M.Pd",
    headmasterNip: "196503121989021003",
    schoolAddress: "Jl. Raya Pabuaran No. 45, Kec. Pabuaran, Kab. Serang, Banten 42163",
    entryLimit: "07:00",
    exitLimit: "15:00",
    lateTolerance: 15,
    daySchedules: {
      0: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Minggu
      1: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Senin
      2: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Selasa
      3: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Rabu
      4: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Kamis
      5: { entryLimit: "07:00", exitLimit: "11:10", lateTolerance: 15 }, // Jumat
      6: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Sabtu
    },
    latitude: "-6.114196248039070",
    longitude: "106.2276108127060",
    maxRadius: 100,
    waGatewayEnabled: false,
    waGatewayProvider: "fonnte", // "fonnte" | "wablas" | "starsender"
    waGatewayToken: "",
    waGatewayDevice: "",
    waAdminNumber: "",
    waAdminNotificationsEnabled: false,
    waTemplateDatang: "🔔 *NOTIFIKASI ABSENSI GURU*\n\nYth. Bapak/Ibu *{nama}*,\nAbsensi *DATANG* Anda telah berhasil terekam pada:\n📅 Tanggal: {tanggal}\n⏰ Waktu: {waktu}\n📍 Jarak: {jarak} meter dari koordinat sekolah\n\nStatus: Hadir / Tepat Waktu.\nTerima kasih atas dedikasi Anda hari ini!\n~ *{nama_sekolah}*",
    waTemplatePulang: "🔔 *NOTIFIKASI ABSENSI GURU*\n\nYth. Bapak/Ibu *{nama}*,\nAbsensi *PULANG* Anda telah berhasil terekam pada:\n📅 Tanggal: {tanggal}\n⏰ Waktu: {waktu}\n\nSelamat beristirahat dan sampai jumpa esok hari!\n~ *{nama_sekolah}*",
    waTemplateIzin: "🔔 *NOTIFIKASI PENGAJUAN IZIN*\n\nYth. Bapak/Ibu *{nama}*,\nPengajuan *{jenis_izin}* Anda telah berhasil diajukan pada:\n📅 Tanggal Pengisian: {tanggal} {waktu}\n📅 Periode Izin: {izin_mulai} s/d {izin_selesai}\n📝 Alasan: {alasan}\n⚡ Status: Pending (Menunggu Persetujuan Admin/Kepsek)\n\n~ *{nama_sekolah}*",
    waTemplateAdmin: "📢 *LAPORAN ABSENSI PEGAWAI*\n\nNama Pegawai: *{nama}*\nNIP: {nip}\nAktivitas: *{aktivitas}*\nTanggal/Waktu: {tanggal} {waktu}\nDetail: {detail}\n~ *{nama_sekolah}*"
  });
  const [modalState, setModalState] = useState<{ show: boolean; type: typeof attendanceButtons[0] | null }>({ show: false, type: null });
  const [location, setLocation] = useState<string>('Mencari lokasi...');
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);
  const [nama, setNama] = useState('');
  const [nip, setNip] = useState('');
  const [userJabatan, setUserJabatan] = useState('');
  const isTeacherRole = userRole === 'admin' || (userJabatan === 'Guru Mapel' || userJabatan === 'Wakasek Kurikulum' || userJabatan === 'Kepala Sekolah');
  const [jamMulai, setJamMulai] = useState(() => {
    const saved = localStorage.getItem('jamMulai');
    if (saved) return saved;
    const now = new Date();
    const h = now.getHours();
    return `${String(h).padStart(2, '0')}.00`;
  });
  const [jamSelesai, setJamSelesai] = useState(() => {
    const saved = localStorage.getItem('jamSelesai');
    if (saved) return saved;
    const now = new Date();
    const h = (now.getHours() + 2) % 24;
    return `${String(h).padStart(2, '0')}.00`;
  });
  const [ruangKelas, setRuangKelas] = useState(() => localStorage.getItem('ruangKelas') || '');
  const [mataPelajaran, setMataPelajaran] = useState(() => localStorage.getItem('mataPelajaran') || '');
  const [isSesiMengajarAktif, setIsSesiMengajarAktif] = useState(() => {
    return localStorage.getItem('isSesiMengajarAktif') === 'true';
  });
  const [sesiMengajarTanggal, setSesiMengajarTanggal] = useState(() => {
    return localStorage.getItem('sesiMengajarTanggal') || '';
  });
  const [filterClassOnly, setFilterClassOnly] = useState(true);

  const isSessionTimeActive = () => {
    if (!isSesiMengajarAktif) return false;
    
    // Check if the session was started today
    const now = currentTime;
    const formattedDate = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    if (sesiMengajarTanggal && sesiMengajarTanggal !== formattedDate) {
      return false;
    }
    
    try {
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();

      const cleanJamSelesai = jamSelesai.replace(':', '.');
      const [endHourStr, endMinStr] = cleanJamSelesai.split('.');
      const endHour = parseInt(endHourStr, 10);
      const endMin = parseInt(endMinStr, 10);

      if (isNaN(endHour) || isNaN(endMin)) return true;

      if (currentHour > endHour) {
        return false;
      } else if (currentHour === endHour && currentMin >= endMin) {
        return false;
      }

      const cleanJamMulai = jamMulai.replace(':', '.');
      const [startHourStr, startMinStr] = cleanJamMulai.split('.');
      const startHour = parseInt(startHourStr, 10);
      const startMin = parseInt(startMinStr, 10);
      if (!isNaN(startHour) && !isNaN(startMin)) {
        if (currentHour < startHour) {
          return false;
        } else if (currentHour === startHour && currentMin < startMin) {
          return false;
        }
      }

      return true;
    } catch (e) {
      return true;
    }
  };

  // Automatically end teaching session when time runs out or day changes
  useEffect(() => {
    if (isSesiMengajarAktif) {
      const checkActive = () => {
        const now = currentTime;
        const formattedDate = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        if (sesiMengajarTanggal && sesiMengajarTanggal !== formattedDate) {
          return false;
        }
        try {
          const currentHour = now.getHours();
          const currentMin = now.getMinutes();

          const cleanJamSelesai = jamSelesai.replace(':', '.');
          const [endHourStr, endMinStr] = cleanJamSelesai.split('.');
          const endHour = parseInt(endHourStr, 10);
          const endMin = parseInt(endMinStr, 10);

          if (isNaN(endHour) || isNaN(endMin)) return true;

          if (currentHour > endHour) {
            return false;
          } else if (currentHour === endHour && currentMin >= endMin) {
            return false;
          }

          const cleanJamMulai = jamMulai.replace(':', '.');
          const [startHourStr, startMinStr] = cleanJamMulai.split('.');
          const startHour = parseInt(startHourStr, 10);
          const startMin = parseInt(startMinStr, 10);
          if (!isNaN(startHour) && !isNaN(startMin)) {
            if (currentHour < startHour) {
              return false;
            } else if (currentHour === startHour && currentMin < startMin) {
              return false;
            }
          }

          return true;
        } catch (e) {
          return true;
        }
      };

      if (!checkActive()) {
        setIsSesiMengajarAktif(false);
        localStorage.setItem('isSesiMengajarAktif', 'false');
      }
    }
  }, [currentTime, isSesiMengajarAktif, sesiMengajarTanggal, jamMulai, jamSelesai]);
  const [izinType, setIzinType] = useState<'Izin' | 'Sakit' | 'Dinas'>('Izin');
  const [izinMulai, setIzinMulai] = useState('');
  const [izinSelesai, setIzinSelesai] = useState('');
  const [izinAlasan, setIzinAlasan] = useState('');
  const [izinAttachment, setIzinAttachment] = useState<string | null>(null);
  
  // Schedule states
  const [teachingSchedule, setTeachingSchedule] = useState<{ id: number; day: string; time: string; class: string; subject: string }[]>([]);
  const [scheduleDay, setScheduleDay] = useState('Senin');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<{ id: number | null, day: string, time: string, class: string, subject: string }>({ id: null, day: 'Senin', time: '', class: '', subject: '' });

  // Class Attendance states
  const [selectedClassAttendance, setSelectedClassAttendance] = useState('VII A');
  const [attendanceDate, setAttendanceDate] = useState('2026-06-27');
  const [searchAttendanceSiswaQuery, setSearchAttendanceSiswaQuery] = useState('');
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('all');
  const [personalHistoryMonth, setPersonalHistoryMonth] = useState('06-2026');

  useEffect(() => {
    setSelectedSessionFilter('all');
  }, [selectedClassAttendance, attendanceDate]);

  const classSessionsOnDate = useMemo(() => {
    const normalizeClass = (c: string) => (c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetClassNorm = normalizeClass(selectedClassAttendance);
    
    return teachingSessionsToday.filter(session => {
      const sessionDate = session.date;
      
      const formatToYYYYMMDD = (dStr: string) => {
        try {
          if (!dStr) return '';
          if (dStr.includes('-')) return dStr;
          const parts = dStr.split(' ');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const months: {[key: string]: string} = {
              'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
              'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
              'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04', 'Mei': '05', 'Juni': '06',
              'Juli': '07', 'Agustus': '08', 'September': '09', 'Okt': '10', 'November': '11', 'Desember': '12'
            };
            const month = months[parts[1]] || '01';
            const year = parts[2];
            return `${year}-${month}-${day}`;
          }
          return dStr;
        } catch {
          return dStr;
        }
      };

      const normalizedSessionDate = formatToYYYYMMDD(sessionDate || '');
      return normalizeClass(session.kelas) === targetClassNorm && normalizedSessionDate === attendanceDate;
    });
  }, [teachingSessionsToday, selectedClassAttendance, attendanceDate]);

  const classStudents = useMemo(() => {
    const normalizeClass = (c: string) => (c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const currentClassNormalized = normalizeClass(selectedClassAttendance);
    
    // Filter registered students belonging to this class
    let registeredInClass = students.filter(s => normalizeClass(s.kelas) === currentClassNormalized);
    
    // Apply search query if not empty
    if (searchAttendanceSiswaQuery.trim()) {
      const q = searchAttendanceSiswaQuery.toLowerCase().trim();
      registeredInClass = registeredInClass.filter(s => 
        s.name.toLowerCase().includes(q) || s.nis.includes(q)
      );
    }
    
    return registeredInClass.map(student => {
      const record = studentRecords.find(r => {
        const isNisMatch = r.nis === student.nis;
        const recordDate = r.date || '2026-06-27';
        const isDateMatch = recordDate === attendanceDate;
        
        const isSessionMatch = selectedSessionFilter === 'all'
          ? !r.sessionId
          : r.sessionId === selectedSessionFilter;
          
        return isNisMatch && isDateMatch && isSessionMatch;
      });
      
      return {
        name: student.name,
        nis: student.nis,
        kelas: student.kelas,
        status: record ? record.status : 'Alpa',
        time: record ? record.time : '-',
        sessionId: record ? record.sessionId : '',
        mapel: record ? record.mapel : '',
        guru: record ? record.guru : ''
      };
    });
  }, [students, studentRecords, selectedClassAttendance, searchAttendanceSiswaQuery, attendanceDate, selectedSessionFilter]);

  const activeSessionStudents = useMemo(() => {
    if (!isSesiMengajarAktif) return [];
    const normalizeClass = (c: string) => (c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const activeClassNormalized = normalizeClass(ruangKelas);
    
    let registeredInClass = students.filter(s => normalizeClass(s.kelas) === activeClassNormalized);
    
    const activeSession = teachingSessionsToday.find(s => 
      s.nip === nip && 
      s.kelas === ruangKelas && 
      s.mapel === mataPelajaran &&
      s.status === 'Mengajar'
    );
    const activeSessionId = activeSession ? activeSession.id : 'default';

    const nowStr = new Date().toLocaleDateString('en-CA');

    return registeredInClass.map(student => {
      const record = studentRecords.find(r => 
        r.nis === student.nis && 
        r.sessionId === activeSessionId &&
        (r.date === nowStr || !r.date)
      );
      return {
        name: student.name,
        nis: student.nis,
        kelas: student.kelas,
        status: record ? record.status : 'Alpa',
        time: record ? record.time : '-'
      };
    });
  }, [students, studentRecords, isSesiMengajarAktif, ruangKelas, mataPelajaran, teachingSessionsToday, nip]);

  const currentClassAttendanceSummary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let sick = 0;
    let permission = 0;
    
    classStudents.forEach(student => {
      if (student.status === 'Hadir') present++;
      else if (student.status === 'Sakit') sick++;
      else if (student.status === 'Izin' || student.status === 'Dinas') permission++;
      else absent++;
    });
    
    return {
      present,
      absent,
      sick,
      permission,
      total: classStudents.length
    };
  }, [classStudents]);

  const teacherAttendanceHistory = useMemo(() => {
    const userRecords = records.filter(rec => rec.nip === nip);
    
    return userRecords.map(rec => {
      let status = 'Tepat Waktu';
      if (rec.type === 'Sakit') status = 'Sakit';
      else if (rec.type === 'Izin') status = 'Izin';
      else if (rec.type === 'Dinas') status = 'Dinas';
      else if (rec.type === 'Absen Datang') {
        const schedule = getScheduleForDate(rec.date, schoolSettings);
        const [limitHour, limitMinute] = schedule.entryLimit.split(':').map(Number);
        const tolerance = schedule.lateTolerance || 0;
        const totalLimitMinutes = limitHour * 60 + limitMinute + tolerance;
        
        const timeParts = rec.time ? rec.time.split(/[:.]/) : [];
        const hour = timeParts[0] ? parseInt(timeParts[0]) : 0;
        const minute = timeParts[1] ? parseInt(timeParts[1]) : 0;
        const totalMinutes = hour * 60 + minute;
        
        if (totalMinutes > totalLimitMinutes) {
          status = 'Terlambat';
        } else {
          status = 'Tepat Waktu';
        }
      } else if (rec.type === 'Absen Pulang') {
        status = 'Pulang';
      } else {
        status = rec.type;
      }
      
      let distanceDisplay = '-';
      if (rec.type === 'Absen Datang' || rec.type === 'Absen Pulang') {
        if (rec.distance !== undefined) {
          distanceDisplay = `${rec.distance} m`;
        } else {
          // Stable fallback based on ID seed
          const seed = rec.id ? rec.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
          const randomDist = (seed % 15) + 4; // between 4m and 18m
          distanceDisplay = `${randomDist} m`;
        }
      }
      
      return {
        id: rec.id,
        type: rec.type,
        date: rec.date,
        time: rec.time,
        status: status,
        location: distanceDisplay
      };
    });
  }, [records, nip, schoolSettings.entryLimit, schoolSettings.lateTolerance, schoolSettings.daySchedules]);

  const filteredTeacherAttendanceHistory = useMemo(() => {
    return teacherAttendanceHistory.filter(h => {
      if (personalHistoryMonth === 'all') return true;
      const [m, y] = personalHistoryMonth.split('-');
      const monthsMap: { [key: string]: string[] } = {
        '01': ['Jan'], '02': ['Feb'], '03': ['Mar'], '04': ['Apr'],
        '05': ['Mei', 'May'], '06': ['Jun'], '07': ['Jul'], '08': ['Agu', 'Aug'],
        '09': ['Sep'], '10': ['Okt', 'Oct'], '11': ['Nov'], '12': ['Des', 'Dec']
      };
      const abbrs = monthsMap[m] || [];
      const lowerDate = (h.date || '').toLowerCase();
      return lowerDate.includes(y) && abbrs.some(abbr => lowerDate.includes(abbr.toLowerCase()));
    });
  }, [teacherAttendanceHistory, personalHistoryMonth]);

  const uniqueAttendanceDaysCount = useMemo(() => {
    const presentRecords = filteredTeacherAttendanceHistory.filter(h => 
      h.type === 'Absen Datang' || h.type === 'Absen Pulang' || h.type === 'Dinas'
    );
    const uniqueDates = new Set(presentRecords.map(h => h.date));
    return uniqueDates.size;
  }, [filteredTeacherAttendanceHistory]);

  const activeTeachersCount = useMemo(() => {
    const todayRecords = records.filter(r => 
      isSameDay(r.date) && 
      (r.type === 'Absen Datang' || r.type === 'Absen Pulang')
    );
    const uniqueNips = new Set(todayRecords.map(r => r.nip).filter(Boolean));
    return uniqueNips.size;
  }, [records]);

  const todayTeacherRecords = useMemo(() => {
    return records.filter(r => 
      isSameDay(r.date) && 
      (r.type === 'Absen Datang' || r.type === 'Absen Pulang')
    );
  }, [records]);

  const mappedTeachersToday = useMemo(() => {
    return teachers.map(teacher => {
      const teacherRecords = records.filter(r => 
        r.nip === teacher.nip && 
        isSameDay(r.date)
      );
      
      const datangRec = teacherRecords.find(r => r.type === 'Absen Datang');
      const pulangRec = teacherRecords.find(r => r.type === 'Absen Pulang');
      const izinRec = teacherRecords.find(r => ['Izin', 'Sakit', 'Dinas'].includes(r.type));
      
      const approvedIzin = izinRequests.find(req => 
        req.nip === teacher.nip && 
        req.status === 'Disetujui'
      );

      let statusType: 'belum' | 'hadir' | 'pulang' | 'izin' = 'belum';
      let statusLabel = 'Belum Absen';
      let recordTime = '-';
      let recordStatus = '';
      let photo: string | null = null;
      let distance: number | undefined = undefined;

      if (pulangRec) {
        statusType = 'pulang';
        statusLabel = 'Sudah Pulang';
        recordTime = pulangRec.time;
        photo = pulangRec.photoDriveLink || pulangRec.photo || null;
      } else if (datangRec) {
        statusType = 'hadir';
        statusLabel = 'Hadir';
        recordTime = datangRec.time;
        photo = datangRec.photoDriveLink || datangRec.photo || null;
        distance = datangRec.distance;
        
        const schedule = getScheduleForDate(datangRec.date, schoolSettings);
        const [limitHour, limitMinute] = schedule.entryLimit.split(':').map(Number);
        const tolerance = schedule.lateTolerance || 0;
        const totalLimitMinutes = limitHour * 60 + limitMinute + tolerance;
        
        const timeParts = datangRec.time ? datangRec.time.split(/[:.]/) : [];
        const hour = timeParts[0] ? parseInt(timeParts[0]) : 0;
        const minute = timeParts[1] ? parseInt(timeParts[1]) : 0;
        const totalMinutes = hour * 60 + minute;
        
        if (totalMinutes > totalLimitMinutes) {
          recordStatus = 'Terlambat';
        } else {
          recordStatus = 'Tepat Waktu';
        }
      } else if (izinRec || approvedIzin) {
        statusType = 'izin';
        statusLabel = izinRec ? izinRec.type : (approvedIzin ? approvedIzin.tipe : 'Izin');
        recordTime = izinRec ? izinRec.time : 'Disetujui';
      }

      return {
        ...teacher,
        statusType,
        statusLabel,
        recordTime,
        recordStatus,
        photo,
        distance
      };
    });
  }, [teachers, records, izinRequests, schoolSettings.entryLimit, schoolSettings.lateTolerance, schoolSettings.daySchedules]);

  const filteredTeachersToday = useMemo(() => {
    const list = mappedTeachersToday.filter(teacher => {
      const nameMatch = teacher.name.toLowerCase().includes(teacherSearchQuery.toLowerCase()) || 
                        teacher.nip.includes(teacherSearchQuery);
                        
      if (!nameMatch) return false;
      
      if (teacherStatusFilter === 'semua') return true;
      if (teacherStatusFilter === 'hadir') return teacher.statusType === 'hadir' || teacher.statusType === 'pulang';
      if (teacherStatusFilter === 'belum') return teacher.statusType === 'belum';
      if (teacherStatusFilter === 'izin') return teacher.statusType === 'izin';
      return true;
    });

    return [...list].sort((a, b) => {
      const aIsBelum = a.statusType === 'belum';
      const bIsBelum = b.statusType === 'belum';

      // 1. Taruh guru yang Belum Absen di bagian paling bawah
      if (aIsBelum && !bIsBelum) return 1;
      if (!aIsBelum && bIsBelum) return -1;
      if (aIsBelum && bIsBelum) {
        return a.name.localeCompare(b.name);
      }

      // 2. Untuk guru yang sudah absen, urutkan berdasarkan waktu absen (paling awal -> paling akhir)
      const getSortTime = (teacher: typeof a) => {
        const time = teacher.recordTime;
        if (!time || time === '-' || time === 'Disetujui') {
          return '99:99'; // Taruh izin/tanpa waktu spesifik di bagian bawah grup yang sudah absen
        }
        return time;
      };

      const timeA = getSortTime(a);
      const timeB = getSortTime(b);

      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }

      // Jika waktu sama, urutkan berdasarkan nama
      return a.name.localeCompare(b.name);
    });
  }, [mappedTeachersToday, teacherSearchQuery, teacherStatusFilter]);

  const filteredTeachingSessionsToday = useMemo(() => {
    return teachingSessionsToday.filter(session => 
      isSameDay(session.date)
    );
  }, [teachingSessionsToday]);

  const getPlaceSignature = () => {
    const name = schoolSettings.schoolName;
    const addr = schoolSettings.schoolAddress;
    if (name.toLowerCase().includes('pabuaran') || addr.toLowerCase().includes('pabuaran')) {
      return 'Pabuaran';
    }
    const kecMatch = addr.match(/Kec\.\s*([^,]+)/i);
    if (kecMatch && kecMatch[1]) return kecMatch[1].trim();
    const kabMatch = addr.match(/Kab\.\s*([^,]+)/i);
    if (kabMatch && kabMatch[1]) return kabMatch[1].trim();
    return 'Serang';
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Laporan Absensi Kelas ${selectedClassAttendance}`, 14, 22);
    
    const activeSessionObj = classSessionsOnDate.find(s => s.id === selectedSessionFilter);
    const sessionText = activeSessionObj 
      ? ` | Sesi Pelajaran: ${activeSessionObj.mapel} (${activeSessionObj.name})` 
      : ' | Sesi Pelajaran: Presensi Harian / Barcode';

    doc.setFontSize(11);
    doc.text(`Tanggal: ${attendanceDate}${sessionText}`, 14, 30);
    doc.text(`Dicetak pada: ${new Date().toLocaleString()}`, 14, 36);
 
    const summary = currentClassAttendanceSummary;
    if (summary) {
      doc.text(`Hadir: ${summary.present} | Alpa: ${summary.absent} | Sakit: ${summary.sick} | Izin: ${summary.permission}`, 14, 44);
    }
    
    const tableColumn = ["No", "NIS", "Nama Siswa", "Status", "Waktu Absen"];
    const tableRows = classStudents.map((student, idx) => [
      (idx + 1).toString(),
      student.nis,
      student.name,
      student.status,
      student.status === 'Hadir' ? student.time : '-'
    ]);
 
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });
 
    const finalY1 = (doc as any).lastAutoTable.finalY || 100;
    doc.text(`${getPlaceSignature()}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, finalY1 + 20);
    doc.text('Kepala Sekolah', 130, finalY1 + 28);
    doc.text(schoolSettings.headmasterName, 130, finalY1 + 50);
    doc.text(`NIP. ${schoolSettings.headmasterNip}`, 130, finalY1 + 56);
 
    const sessionNameClean = activeSessionObj ? `_Sesi_${activeSessionObj.mapel.replace(/\s+/g, '_')}` : '';
    doc.save(`Rekap_Absensi_${selectedClassAttendance}_${attendanceDate}${sessionNameClean}.pdf`);
  };
 
  const handleExportExcel = () => {
    const activeSessionObj = classSessionsOnDate.find(s => s.id === selectedSessionFilter);
    const headers = ['No', 'NIS', 'Nama Siswa', 'Status', 'Waktu Absen'];
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    classStudents.forEach((student, idx) => {
      const row = [
        idx + 1,
        student.nis,
        `"${student.name}"`,
        student.status,
        student.status === 'Hadir' ? student.time : '-'
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const sessionNameClean = activeSessionObj ? `_Sesi_${activeSessionObj.mapel.replace(/\s+/g, '_')}` : '';
    link.setAttribute('href', url);
    link.setAttribute('download', `Rekap_Absensi_${selectedClassAttendance}_${attendanceDate}${sessionNameClean}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMonthlyPDF = () => {
    const doc = new jsPDF();
    const month = new Date(attendanceDate).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    
    doc.setFontSize(16);
    doc.text(`Laporan Absensi Bulanan Kelas ${selectedClassAttendance}`, 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Bulan: ${month}`, 14, 30);
    doc.text(`Dicetak pada: ${new Date().toLocaleString()}`, 14, 36);

    const tableColumn = ["No", "NIS", "Nama Siswa", "Hadir", "Sakit", "Izin", "Alpa", "Persentase"];
    const tableRows = classStudents.map((student, idx) => [
      (idx + 1).toString(),
      student.nis,
      student.name,
      student.status === 'Hadir' ? '22' : '20',
      student.status === 'Sakit' ? '1' : '0',
      student.status === 'Izin' ? '1' : '0',
      student.status === 'Alpa' ? '1' : '0',
      student.status === 'Hadir' ? '100%' : '90%'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    const finalY2 = (doc as any).lastAutoTable.finalY || 100;
    doc.text(`${getPlaceSignature()}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, finalY2 + 20);
    doc.text('Kepala Sekolah', 130, finalY2 + 28);
    doc.text(schoolSettings.headmasterName, 130, finalY2 + 50);
    doc.text(`NIP. ${schoolSettings.headmasterNip}`, 130, finalY2 + 56);

    doc.save(`Rekap_Bulanan_${selectedClassAttendance}_${month.replace(' ', '_')}.pdf`);
  };

  const handleExportMonthlyExcel = () => {
    const month = new Date(attendanceDate).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const headers = ["No", "NIS", "Nama Siswa", "Hadir", "Sakit", "Izin", "Alpa", "Persentase Kehadiran"];
    const csvRows = [];
    
    csvRows.push(headers.join(','));
    
    classStudents.forEach((student, idx) => {
      const row = [
        idx + 1,
        student.nis,
        `"${student.name}"`,
        student.status === 'Hadir' ? '22' : '20',
        student.status === 'Sakit' ? '1' : '0',
        student.status === 'Izin' ? '1' : '0',
        student.status === 'Alpa' ? '1' : '0',
        student.status === 'Hadir' ? '100%' : '90%'
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Rekap_Bulanan_${selectedClassAttendance}_${month.replace(' ', '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPhotos = async (monthYearStr: string) => { // format MM-YYYY
    const zip = new JSZip();
    const photoFolder = zip.folder(`Foto_Absensi_Guru_${monthYearStr}`);
    
    if (!photoFolder) {
      showNotification('Gagal membuat folder ZIP.', 'text-rose-400');
      return;
    }

    // records are AttendanceRecord
    // Filter records by month
    const filteredRecords = monthYearStr === 'all' 
      ? records 
      : records.filter(r => {
        // Date format: DD MMM YYYY, we need to extract Month and Year
        const [day, monthStr, year] = r.date.split(' ');
        const monthMap: Record<string, string> = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mei': '05', 'Jun': '06',
          'Jul': '07', 'Ags': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12'
        };
        const rMonthStr = `${monthMap[monthStr] || '01'}-${year}`;
        return rMonthStr === monthYearStr;
      });

    const recordsWithPhotos = filteredRecords.filter(r => r.photo);

    if (recordsWithPhotos.length === 0) {
      showNotification('Tidak ada foto absensi pada periode ini.', 'text-amber-400');
      return;
    }

    recordsWithPhotos.forEach((record, index) => {
      // photo is base64: data:image/jpeg;base64,...
      if (record.photo) {
        const base64Data = record.photo.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
        const safeName = (record.nama || 'TanpaNama').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${safeName}_${record.date.replace(/ /g, '_')}_${record.time.replace(/:/g, '')}_${index}.jpg`;
        photoFolder.file(filename, base64Data, { base64: true });
      }
    });

    try {
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `Foto_Absensi_Guru_${monthYearStr}.zip`);
      showNotification('Foto absensi berhasil diunduh (ZIP)!', 'text-emerald-400');
    } catch (error) {
      showNotification('Gagal mengemas file ZIP.', 'text-rose-400');
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  // Student portal specific states
  const [selectedStudentCard, setSelectedStudentCard] = useState('24001');
  const [scannedStudent, setScannedStudent] = useState<typeof students[0] | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [manualNis, setManualNis] = useState('');
  const [isCameraScannerActive, setIsCameraScannerActive] = useState(false);
  const [cameraScannerError, setCameraScannerError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<any> | null>(null);
  const stopPromiseRef = useRef<Promise<any> | null>(null);
  const startTimeoutRef = useRef<any>(null);
  const scanTimeoutRef = useRef<any>(null);
  const recentlyScannedRef = useRef<Record<string, number>>({});
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Refs to avoid stale closures in camera scanning callback
  const studentRecordsRef = useRef(studentRecords);
  const teachingSessionsTodayRef = useRef(teachingSessionsToday);
  const ruangKelasRef = useRef(ruangKelas);
  const mataPelajaranRef = useRef(mataPelajaran);
  const nipRef = useRef(nip);

  useEffect(() => {
    studentRecordsRef.current = studentRecords;
  }, [studentRecords]);

  useEffect(() => {
    teachingSessionsTodayRef.current = teachingSessionsToday;
  }, [teachingSessionsToday]);

  useEffect(() => {
    ruangKelasRef.current = ruangKelas;
  }, [ruangKelas]);

  useEffect(() => {
    mataPelajaranRef.current = mataPelajaran;
  }, [mataPelajaran]);

  useEffect(() => {
    nipRef.current = nip;
  }, [nip]);
  const fileInputGuruRef = useRef<HTMLInputElement>(null);
  const fileInputSiswaRef = useRef<HTMLInputElement>(null);

  // Admin specific states
  const [searchGuruQuery, setSearchGuruQuery] = useState('');
  const [searchSiswaQuery, setSearchSiswaQuery] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherNip, setNewTeacherNip] = useState('');
  const [newTeacherMapel, setNewTeacherMapel] = useState('');
  const [newTeacherRole, setNewTeacherRole] = useState('Guru Mapel');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentNis, setNewStudentNis] = useState('');
  const [newStudentKelas, setNewStudentKelas] = useState('');
  const [exportTeacherMonth, setExportTeacherMonth] = useState('06-2026');
  const [exportStudentClass, setExportStudentClass] = useState('all');
  const [exportStudentMonth, setExportStudentMonth] = useState('06-2026');
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showStaffSelector, setShowStaffSelector] = useState(false);

  // Filter & Edit states for Admin "Daftar Guru & Siswa"
  const [filterGuruMapel, setFilterGuruMapel] = useState('');
  const [filterSiswaKelas, setFilterSiswaKelas] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<any>(null);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [showEditTeacherModal, setShowEditTeacherModal] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<any>(null);
  const [studentToDelete, setStudentToDelete] = useState<any>(null);
  
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editingProfileData, setEditingProfileData] = useState<any>(null);

  // Load initial data from Firebase/Google Sheets on mount
  const handleManualSyncData = async () => {
    setIsLoading(true);
    try {
      showNotification('Menghubungi Google Sheets untuk memperbarui data...', 'text-blue-400');
      await initialSyncWithGoogleSheets(true);

      const loadedTeachers = await getTeachersSync(teachers);
      setTeachers(loadedTeachers || []);

      const loadedStudents = await getStudentsSync(students);
      setStudents(loadedStudents || []);

      const loadedStudentRecords = await getStudentRecordsSync(studentRecords);
      setStudentRecords(loadedStudentRecords || []);

      const loadedSessions = await getTeachingSessionsSync(teachingSessionsToday);
      setTeachingSessionsToday(loadedSessions || []);

      const loadedIzinRequests = await getIzinRequestsSync(izinRequests);
      setIzinRequests(loadedIzinRequests || []);

      const loadedSchedule = await getTeachingScheduleSync(teachingSchedule);
      setTeachingSchedule(loadedSchedule || []);

      const loadedRecords = await getAttendanceRecordsSync();
      setRecords(loadedRecords || []);

      const loadedHolidays = await getHolidaysSync();
      if (loadedHolidays) {
        setHolidays(loadedHolidays);
      }

      const loadedPiketSchedule = await getPiketScheduleSync([
        { id: 'Senin', day: 'Senin', teacherNips: [] },
        { id: 'Selasa', day: 'Selasa', teacherNips: [] },
        { id: 'Rabu', day: 'Rabu', teacherNips: [] },
        { id: 'Kamis', day: 'Kamis', teacherNips: [] },
        { id: 'Jumat', day: 'Jumat', teacherNips: [] },
        { id: 'Sabtu', day: 'Sabtu', teacherNips: [] }
      ]);
      setPiketSchedule(loadedPiketSchedule);

      const loadedSubstitutions = await getClassSubstitutionsSync();
      setClassSubstitutions(loadedSubstitutions || []);

      const loadedSettings = await getSystemSettingsSync(schoolSettings);
      if (loadedSettings) {
        setSchoolSettings(prev => ({ ...prev, ...loadedSettings }));
      }

      showNotification('Sinkronisasi data Google Sheets berhasil!', 'text-emerald-400');
    } catch (e) {
      console.error('Error syncing:', e);
      showNotification('Gagal memperbarui data dari Google Sheets', 'text-rose-400');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleManualSyncData();
  }, []);

  // Handlers for Guru Piket & Substitusi Kelas
  const handleAddSubstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubDate || !newSubClass || !newSubSubject || !newSubHours || !newSubAbsentNip || !newSubSubNip) {
      showNotification('Mohon lengkapi seluruh kolom wajib!', 'text-rose-400');
      return;
    }
    const absentTeacherObj = teachers.find(t => t.nip === newSubAbsentNip);
    const subTeacherObj = teachers.find(t => t.nip === newSubSubNip);
    const newSub = {
      id: 'sub_' + Math.random().toString(36).substr(2, 9),
      date: newSubDate,
      class: newSubClass,
      subject: newSubSubject,
      hours: newSubHours,
      absentTeacherNip: newSubAbsentNip,
      absentTeacherName: absentTeacherObj?.name || '',
      substituteTeacherNip: newSubSubNip,
      substituteTeacherName: subTeacherObj?.name || '',
      taskDescription: newSubTask,
      status: 'Pending',
      notes: '',
      createdAt: new Date().toISOString()
    };
    try {
      await saveClassSubstitutionSync(newSub);
      setClassSubstitutions(prev => [newSub, ...prev]);
      showNotification('Tugas substitusi kelas berhasil dibuat!', 'text-emerald-400');
      setShowAddSubstitutionModal(false);
      
      // WhatsApp Notification to substitute teacher
      if (subTeacherObj?.phone) {
        const waMsg = `🔔 *NOTIFIKASI TUGAS GURU PENGGANTI*\n\nYth. Bapak/Ibu *${subTeacherObj.name}*,\nAnda ditugaskan sebagai Guru Pengganti (Substitusi) oleh Guru Piket pada:\n📅 Tanggal: ${newSubDate}\n🏫 Kelas: ${newSubClass}\n📚 Mata Pelajaran: ${newSubSubject}\n⏰ Jam Pelajaran: ${newSubHours}\n👤 Menggantikan: Bapak/Ibu *${absentTeacherObj?.name || ''}* (Berhalangan)\n\n📝 Tugas/Instruksi Kelas:\n"${newSubTask || '-'}"\n\nHarap hadir tepat waktu dan memandu kelas tersebut.\nLaporan penyelesaian tugas dapat dikirimkan melalui aplikasi Absensi.\n\nTerima kasih atas dedikasi Anda!\n~ *${schoolSettings.schoolName}*`;
        await sendWhatsAppNotification(subTeacherObj.phone, waMsg, true);
      }
      
      // Reset form states
      setNewSubClass('');
      setNewSubSubject('');
      setNewSubHours('');
      setNewSubAbsentNip('');
      setNewSubSubNip('');
      setNewSubTask('');
    } catch (err) {
      showNotification('Gagal membuat tugas substitusi kelas.', 'text-rose-400');
    }
  };

  const handleReportSubstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingSubId || !reportSubNotes) {
      showNotification('Mohon isi catatan laporan!', 'text-rose-400');
      return;
    }
    const targetSub = classSubstitutions.find(s => s.id === reportingSubId);
    if (!targetSub) return;
    const updatedSub = {
      ...targetSub,
      status: 'Selesai',
      notes: reportSubNotes,
      updatedAt: new Date().toISOString()
    };
    try {
      await saveClassSubstitutionSync(updatedSub);
      setClassSubstitutions(prev => prev.map(s => s.id === reportingSubId ? updatedSub : s));
      showNotification('Laporan substitusi kelas berhasil dikirim!', 'text-emerald-400');
      setShowReportSubModal(false);
      setReportSubNotes('');
      setReportingSubId(null);

      // Notify original teacher or admin via WA
      const absentTeacherObj = teachers.find(t => t.nip === targetSub.absentTeacherNip);
      if (absentTeacherObj?.phone) {
        const waMsg = `📢 *LAPORAN PENYELESAIAN SUBSTITUSI*\n\nYth. Bapak/Ibu *${absentTeacherObj.name}*,\nTugas substitusi kelas Anda telah diselesaikan oleh Guru Pengganti:\n📅 Tanggal: ${targetSub.date}\n🏫 Kelas: ${targetSub.class}\n📚 Mata Pelajaran: ${targetSub.subject}\n👤 Guru Pengganti: Bapak/Ibu *${targetSub.substituteTeacherName}*\n\n📝 Catatan Pelaksanaan:\n"${reportSubNotes}"\n\nSesi kelas Anda telah terisi dengan aman.\nTerima kasih!\n~ *${schoolSettings.schoolName}*`;
        await sendWhatsAppNotification(absentTeacherObj.phone, waMsg, true);
      }
    } catch (err) {
      showNotification('Gagal mengirim laporan substitusi.', 'text-rose-400');
    }
  };

  const handleDeleteSubstitution = async (id: string) => {
    try {
      await deleteClassSubstitutionSync(id);
      setClassSubstitutions(prev => prev.filter(s => s.id !== id));
      showNotification('Tugas substitusi kelas berhasil dihapus!', 'text-emerald-400');
    } catch (err) {
      showNotification('Gagal menghapus tugas substitusi.', 'text-rose-400');
    }
  };

  const handleSavePiketSchedule = async (dayId: string, selectedNips: string[]) => {
    const updatedDay = {
      id: dayId,
      day: dayId,
      teacherNips: selectedNips
    };
    try {
      await savePiketScheduleSync(updatedDay);
      setPiketSchedule(prev => prev.map(p => p.id === dayId ? updatedDay : p));
      showNotification(`Jadwal guru piket Hari ${dayId} berhasil diperbarui!`, 'text-emerald-400');
      setShowEditPiketModal(false);
      setEditingPiketDay(null);
    } catch (err) {
      showNotification('Gagal memperbarui jadwal guru piket.', 'text-rose-400');
    }
  };

  // Login Handlers
  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const userLower = username.trim().toLowerCase();
    const passLower = password.trim().toLowerCase();

    const foundTeacher = teachers.find(t => {
      // Ambil 7 digit pertama NIP
      const first7Nip = t.nip.slice(0, 7);
      
      // Cek kecocokan username (bisa nama, NIP lengkap, atau 7 digit pertama NIP)
      const isUsernameMatch = t.nip === username || t.name.toLowerCase() === userLower || first7Nip === userLower;
      
      // Cek kecocokan password (harus 7 digit pertama NIP)
      const isPasswordMatch = passLower === first7Nip;
      
      return isUsernameMatch && isPasswordMatch;
    });

    if (userLower === 'admin' && passLower === 'admin') {
      setUserRole('admin');
      setActiveTab('analytics');
      showNotification('Berhasil masuk sebagai Administrator', 'text-purple-400');
    } else if (foundTeacher) {
      setUserRole('guru');
      setNama(foundTeacher.name);
      setNip(foundTeacher.nip);
      setUserJabatan(foundTeacher.role || 'Guru Mapel');
      setActiveTab('dashboard');
      showNotification(`Berhasil masuk sebagai ${foundTeacher.name} (${foundTeacher.role || 'Guru Mapel'})`, 'text-emerald-400');
    } else {
      setLoginError('Username atau password salah. Silakan periksa kembali kredensial Anda.');
    }
  };

  const handleUpdateStudentStatus = (
    nis: string, 
    studentName: string, 
    studentKelas: string, 
    newStatus: string,
    sessionId: string = '',
    mapel: string = '',
    guru: string = ''
  ) => {
    const now = new Date();
    const recordTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let targetDate = attendanceDate;
    if (sessionId) {
      const sess = teachingSessionsToday.find(s => s.id === sessionId);
      if (sess && sess.date) {
        const formatToYYYYMMDD = (dStr: string) => {
          try {
            if (!dStr) return '';
            if (dStr.includes('-')) return dStr;
            const parts = dStr.split(' ');
            if (parts.length === 3) {
              const day = parts[0].padStart(2, '0');
              const months: {[key: string]: string} = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
                'Januari': '01', 'Februari': '02', 'Maret': '03', 'April': '04', 'Mei': '05', 'Juni': '06',
                'Juli': '07', 'Agustus': '08', 'September': '09', 'Okt': '10', 'November': '11', 'Desember': '12'
              };
              const month = months[parts[1]] || '01';
              const year = parts[2];
              return `${year}-${month}-${day}`;
            }
            return dStr;
          } catch {
            return dStr;
          }
        };
        targetDate = formatToYYYYMMDD(sess.date);
      } else {
        targetDate = now.toLocaleDateString('en-CA');
      }
    }

    const existingIndex = studentRecords.findIndex(r => {
      const isNisMatch = r.nis === nis;
      const rDate = r.date || '2026-06-27';
      const isDateMatch = rDate === targetDate;
      const isSessionMatch = (r.sessionId || '') === (sessionId || '');
      return isNisMatch && isDateMatch && isSessionMatch;
    });

    if (existingIndex >= 0) {
      const updatedRecords = [...studentRecords];
      const updatedRec = {
        ...updatedRecords[existingIndex],
        status: newStatus,
        time: newStatus === 'Hadir' ? recordTimeStr : '-',
        sessionId: sessionId || '',
        mapel: mapel || '',
        guru: guru || '',
        date: targetDate
      };
      updatedRecords[existingIndex] = updatedRec;
      setStudentRecords(updatedRecords);
      saveStudentRecordSync(updatedRec);
    } else {
      const newRec = {
        id: 'sr_' + Math.random().toString(36).substr(2, 9),
        name: studentName,
        nis: nis,
        kelas: studentKelas,
        time: newStatus === 'Hadir' ? recordTimeStr : '-',
        status: newStatus,
        sessionId: sessionId || '',
        mapel: mapel || '',
        guru: guru || '',
        date: targetDate
      };
      setStudentRecords(prev => [newRec, ...prev]);
      saveStudentRecordSync(newRec);
    }
    showNotification(`Status kehadiran ${studentName} diubah menjadi ${newStatus}`, 'text-emerald-400');
  };

  const handleEndTeachingSession = () => {
    setIsSesiMengajarAktif(false);
    localStorage.setItem('isSesiMengajarAktif', 'false');
    
    const activeSessionIndex = teachingSessionsToday.findIndex(s => 
      s.nip === nip && 
      s.kelas === ruangKelas && 
      s.mapel === mataPelajaran &&
      s.status === 'Mengajar'
    );
    
    if (activeSessionIndex >= 0) {
      const now = new Date();
      const formattedTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const updatedSessions = [...teachingSessionsToday];
      const updatedSess = {
        ...updatedSessions[activeSessionIndex],
        status: 'Selesai',
        timeEnded: formattedTime
      };
      updatedSessions[activeSessionIndex] = updatedSess;
      setTeachingSessionsToday(updatedSessions);
      saveTeachingSessionSync(updatedSess);
    }
    
    showNotification('Sesi mengajar telah diakhiri.', 'text-rose-400');
  };

  // Beep Audio Feedback for scanning simulation
  const playBeep = (type: 'success' | 'warning' | 'error' = 'success') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (type === 'success') {
        // High quality pleasant double-chime (ascending G5 to C6)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(783.99, audioCtx.currentTime); // G5
        gain1.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.12);

        setTimeout(() => {
          try {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
            gain2.gain.setValueAtTime(0.06, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.18);
          } catch (e) {}
        }, 80);
      } else if (type === 'warning') {
        // Two flat alert tones (warning already scanned)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
        gain1.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.1);

        setTimeout(() => {
          try {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
            gain2.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.1);
          } catch (e) {}
        }, 140);
      } else if (type === 'error') {
        // Dual-tone dissonant buzzer for "not found"
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        
        osc1.frequency.setValueAtTime(150, audioCtx.currentTime); 
        osc2.frequency.setValueAtTime(155, audioCtx.currentTime); // Dissonant beat frequency
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.3);
        osc2.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      console.log('Audio feedback not supported', e);
    }
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', aspectRatio: 3/4 } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera access denied", err);
      setCameraError("Akses kamera ditolak atau tidak tersedia.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocation(`Lat: ${lat.toFixed(4)}, Long: ${lng.toFixed(4)}`);
          setCurrentCoords({lat, lng});
        },
        () => {
          setLocation('Lokasi tidak ditemukan');
          setCurrentCoords(null);
        }
      );
    }
  };

  const openAttendanceModal = (btn: typeof attendanceButtons[0]) => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

    if (btn.id === 'datang') {
      const hasCheckedInToday = records.some(
        r => r.nip === nip && isSameDay(r.date) && r.type === 'Absen Datang'
      );
      if (hasCheckedInToday) {
        showNotification('Gagal: Anda sudah melakukan Absen Datang hari ini.', 'text-rose-400');
        return;
      }
    }

    if (btn.id === 'pulang') {
      const hasCheckedInToday = records.some(
        r => r.nip === nip && isSameDay(r.date) && r.type === 'Absen Datang'
      );
      if (!hasCheckedInToday) {
        showNotification('Gagal: Anda belum melakukan Absen Datang hari ini. Silakan lakukan Absen Datang terlebih dahulu.', 'text-rose-400');
        return;
      }

      const hasCheckedOutToday = records.some(
        r => r.nip === nip && isSameDay(r.date) && r.type === 'Absen Pulang'
      );
      if (hasCheckedOutToday) {
        showNotification('Gagal: Anda sudah melakukan Absen Pulang hari ini.', 'text-rose-400');
        return;
      }

      const schedule = getScheduleForDate(null, schoolSettings);
      const [limitHour, limitMinute] = schedule.exitLimit.split(':').map(Number);
      if (!isNaN(limitHour) && !isNaN(limitMinute)) {
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        if (currentHour < limitHour || (currentHour === limitHour && currentMinute < limitMinute)) {
          showNotification(`Gagal: Belum waktunya absen pulang. Sesuai jam kerja, absen pulang dimulai pukul ${schedule.exitLimit}.`, 'text-rose-400');
          return;
        }
      }
    }

    if (btn.id === 'datang' || btn.id === 'pulang' || btn.id === 'mengajar' || btn.id === 'izin') {
      if (btn.id === 'mengajar') {
        if (!ruangKelas) {
          setRuangKelas('VII - A');
          localStorage.setItem('ruangKelas', 'VII - A');
        }
        if (!mataPelajaran) {
          setMataPelajaran('PAI');
          localStorage.setItem('mataPelajaran', 'PAI');
        }
      }
      setModalState({ show: true, type: btn });
      if (btn.id !== 'izin') {
        startCamera();
        if (btn.id !== 'mengajar') {
          getLocation();
        }
      }
    } else {
      handleAttendance(btn);
    }
  };

  const closeAttendanceModal = () => {
    setModalState({ show: false, type: null });
    stopCamera();
    setLocation('Mencari lokasi...');
    setCurrentCoords(null);
    setPhoto(null);
    setIzinAlasan('');
    setIzinAttachment(null);
  };

  const confirmAttendance = () => {
    if (modalState.type) {
      if (modalState.type.id === 'pulang') {
        const now = new Date();
        const schedule = getScheduleForDate(null, schoolSettings);
        const [limitHour, limitMinute] = schedule.exitLimit.split(':').map(Number);
        if (!isNaN(limitHour) && !isNaN(limitMinute)) {
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          if (currentHour < limitHour || (currentHour === limitHour && currentMinute < limitMinute)) {
            showNotification(`Gagal: Belum waktunya absen pulang. Sesuai jam kerja, absen pulang dimulai pukul ${schedule.exitLimit}.`, 'text-rose-400');
            return;
          }
        }
      }

      let calculatedDistance: number | undefined = undefined;

      if ((modalState.type.id === 'datang' || modalState.type.id === 'pulang')) {
        if (!currentCoords) {
          showNotification('Gagal: Menunggu lokasi atau akses lokasi ditolak. Aktifkan GPS / Izinkan akses lokasi browser Anda.', 'text-rose-400');
          return;
        }
        
        const targetLat = parseFloat(cleanCoordinate(schoolSettings.latitude, 'lat'));
        const targetLng = parseFloat(cleanCoordinate(schoolSettings.longitude, 'lng'));

        if (isNaN(targetLat) || isNaN(targetLng)) {
          showNotification('Gagal: Koordinat sekolah tidak valid. Harap periksa Pengaturan Sistem.', 'text-rose-400');
          return;
        }

        const distance = getDistanceFromLatLonInM(
          currentCoords.lat, 
          currentCoords.lng, 
          targetLat, 
          targetLng
        );
        
        if (distance > schoolSettings.maxRadius) {
          showNotification(`Gagal: Anda berada di luar radius sekolah (${Math.round(distance)} meter). Radius maksimal: ${schoolSettings.maxRadius} meter.`, 'text-rose-400');
          return;
        }
        calculatedDistance = distance;
      }
      handleAttendance(modalState.type, calculatedDistance);
      closeAttendanceModal();
    }
  };

  // Simulate loading state on tab switch
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Auto-focus scan input when tab loading finishes
  useEffect(() => {
    if (!isLoading && activeTab === 'scan') {
      const focusTimer = setTimeout(() => {
        if (scanInputRef.current) {
          scanInputRef.current.focus();
        }
      }, 150);
      return () => clearTimeout(focusTimer);
    }
  }, [isLoading, activeTab]);

  // Update live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAttendance = (btn: typeof attendanceButtons[0], distance?: number) => {
    const now = new Date();
    
    // Check for holidays
    const todayStr = now.toISOString().split('T')[0];
    const todayHoliday = holidays.find(h => h.date === todayStr);
    
    if (todayHoliday && btn.id !== 'izin') {
      showNotification(`Hari ini adalah hari libur: ${todayHoliday.name}. Absensi reguler ditutup.`, 'text-amber-400');
      return;
    }
    
    const formattedDate = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
 
    const recordType = btn.id === 'mengajar' 
      ? `Mengajar Kelas ${ruangKelas} (${mataPelajaran})` 
      : btn.id === 'izin'
      ? `Pengajuan ${izinType}: ${izinAlasan || 'Tanpa keterangan'}`
      : btn.label;
 
    const newRecord: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      type: recordType,
      date: formattedDate,
      time: formattedTime,
      color: btn.id === 'izin' ? (izinType === 'Sakit' ? 'text-red-400' : 'text-indigo-400') : btn.color,
      bg: btn.bg,
      glow: btn.glow,
      iconName: btn.iconName,
      nip: nip || '',
      nama: nama || '',
      photo: photo || null,
      distance: distance !== undefined ? Math.round(distance) : undefined
    };

    setRecords((prev) => [newRecord, ...prev]);
    saveAttendanceRecordSync(newRecord);
    playBeep('success');
    if (btn.id === 'mengajar') {
      setIsSesiMengajarAktif(true);
      setSesiMengajarTanggal(formattedDate);
      localStorage.setItem('isSesiMengajarAktif', 'true');
      localStorage.setItem('sesiMengajarTanggal', formattedDate);
      localStorage.setItem('ruangKelas', ruangKelas);
      localStorage.setItem('mataPelajaran', mataPelajaran);
      localStorage.setItem('jamMulai', jamMulai);
      localStorage.setItem('jamSelesai', jamSelesai);
      
      showNotification(`Sesi Mengajar Kelas ${ruangKelas} (${mataPelajaran}) telah dimulai!`, btn.color);
      
      const currentTeacherSession = {
        id: 'ts_self_' + Math.random().toString(36).substr(2, 9),
        name: nama,
        nip: nip,
        mapel: mataPelajaran,
        kelas: ruangKelas,
        jam: `${jamMulai} - ${jamSelesai}`,
        status: 'Mengajar',
        timeStarted: formattedTime,
        timeEnded: '-',
        date: formattedDate,
        photo: photo || null
      };
      setTeachingSessionsToday(prev => [currentTeacherSession, ...prev]);
      saveTeachingSessionSync(currentTeacherSession);
    } else if (btn.id === 'izin') {
      const newRequest = {
        id: Math.random().toString(36).substr(2, 9),
        name: nama,
        nip: nip,
        tipe: izinType,
        tanggalMulai: izinMulai,
        tanggalSelesai: izinSelesai,
        alasan: izinAlasan || 'Tanpa keterangan',
        status: 'Pending',
        attachment: izinAttachment
      };
      setIzinRequests(prev => [newRequest, ...prev]);
      saveIzinRequestSync(newRequest);
      showNotification(`Pengajuan ${izinType} untuk ${nama} berhasil dikirim!`, btn.color);
    } else {
      showNotification(`Berhasil mencatat: ${btn.label} untuk ${nama}`, btn.color);
    }

    // Kirim notifikasi WhatsApp otomatis jika diaktifkan
    if (schoolSettings.waGatewayEnabled && btn.id !== 'mengajar') {
      const activeTeacher = teachers.find(t => t.nip === nip);
      const recipientPhone = activeTeacher?.phone || '';

      const replaceTemplateVariables = (template: string, vars: Record<string, string | number>) => {
        let result = template;
        Object.entries(vars).forEach(([key, value]) => {
          result = result.split(`{${key}}`).join(String(value));
        });
        return result;
      };

      if (recipientPhone) {
        let waMessage = '';
        const commonVars = {
          nama: nama,
          nip: nip,
          tanggal: formattedDate,
          waktu: formattedTime,
          nama_sekolah: schoolSettings.schoolName,
          jarak: distance !== undefined ? Math.round(distance) : '-',
          jenis_izin: izinType || '',
          izin_mulai: izinMulai || '',
          izin_selesai: izinSelesai || '',
          alasan: izinAlasan || 'Tanpa keterangan'
        };

        if (btn.id === 'datang') {
          const template = schoolSettings.waTemplateDatang || 
            "🔔 *NOTIFIKASI ABSENSI GURU*\n\nYth. Bapak/Ibu *{nama}*,\nAbsensi *DATANG* Anda telah berhasil terekam pada:\n📅 Tanggal: {tanggal}\n⏰ Waktu: {waktu}\n📍 Jarak: {jarak} meter dari koordinat sekolah\n\nStatus: Hadir / Tepat Waktu.\nTerima kasih atas dedikasi Anda hari ini!\n~ *{nama_sekolah}*";
          waMessage = replaceTemplateVariables(template, commonVars);
        } else if (btn.id === 'pulang') {
          const template = schoolSettings.waTemplatePulang ||
            "🔔 *NOTIFIKASI ABSENSI GURU*\n\nYth. Bapak/Ibu *{nama}*,\nAbsensi *PULANG* Anda telah berhasil terekam pada:\n📅 Tanggal: {tanggal}\n⏰ Waktu: {waktu}\n\nSelamat beristirahat dan sampai jumpa esok hari!\n~ *${schoolSettings.schoolName}*";
          waMessage = replaceTemplateVariables(template, commonVars);
        } else if (btn.id === 'izin') {
          const template = schoolSettings.waTemplateIzin ||
            "🔔 *NOTIFIKASI PENGAJUAN IZIN*\n\nYth. Bapak/Ibu *{nama}*,\nPengajuan *{jenis_izin}* Anda telah berhasil diajukan pada:\n📅 Tanggal Pengisian: {tanggal} {waktu}\n📅 Periode Izin: {izin_mulai} s/d {izin_selesai}\n📝 Alasan: {alasan}\n⚡ Status: Pending (Menunggu Persetujuan Admin/Kepsek)\n\n~ *{nama_sekolah}*";
          waMessage = replaceTemplateVariables(template, commonVars);
        }

        if (waMessage) {
          sendWhatsAppNotification(recipientPhone, waMessage, true);
        }
      }

      // Kirim salinan ke nomor WhatsApp Admin jika diaktifkan
      if (schoolSettings.waAdminNotificationsEnabled && schoolSettings.waAdminNumber) {
        const detailStr = btn.id === 'datang' ? `Jarak ${distance !== undefined ? Math.round(distance) : '-'}m` : '-';
        const adminVars = {
          nama: nama,
          nip: nip,
          aktivitas: recordType,
          tanggal: formattedDate,
          waktu: formattedTime,
          detail: detailStr,
          nama_sekolah: schoolSettings.schoolName
        };
        const template = schoolSettings.waTemplateAdmin ||
          "📢 *LAPORAN ABSENSI PEGAWAI*\n\nNama Pegawai: *{nama}*\nNIP: {nip}\nAktivitas: *{aktivitas}*\nTanggal/Waktu: {tanggal} {waktu}\nDetail: {detail}\n~ *{nama_sekolah}*";
        const adminMessage = replaceTemplateVariables(template, adminVars);
        sendWhatsAppNotification(schoolSettings.waAdminNumber, adminMessage, true);
      }
    }
  };

  const handleFileUploadGuru = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          let text = event.target?.result as string;
          if (text) {
            // Remove UTF-8 BOM if present
            text = text.replace(/^\uFEFF/, '');
            const lines = text.split(/\r?\n/);
            const newTeachers = [];
            const cleanValue = (val: string) => {
              if (!val) return '';
              return val.trim().replace(/^["']|["']$/g, '').trim();
            };

            for (let i = 1; i < lines.length; i++) { // Skip header
              const line = lines[i].trim();
              if (line) {
                const separator = line.includes(';') ? ';' : ',';
                const parts = line.split(separator);
                if (parts.length >= 3) {
                  const name = cleanValue(parts[0]);
                  const nip = cleanValue(parts[1]);
                  const mapel = cleanValue(parts[2]);
                  const roleRaw = parts[3] ? cleanValue(parts[3]) : 'Guru Mapel';
                  const status = parts[4] ? cleanValue(parts[4]) : 'Aktif';

                  let role = roleRaw;
                  const roleLower = roleRaw.toLowerCase();
                  if (roleLower === 'guru' || roleLower === 'guru mapel') {
                    role = 'Guru Mapel';
                  } else if (roleLower === 'kepala sekolah' || roleLower === 'kepsek') {
                    role = 'Kepala Sekolah';
                  } else if (roleLower === 'wakasek' || roleLower === 'wakasek kurikulum' || roleLower === 'waka') {
                    role = 'Wakasek Kurikulum';
                  } else if (roleLower === 'operator' || roleLower === 'operator sekolah' || roleLower === 'ops') {
                    role = 'Operator Sekolah';
                  } else if (roleLower === 'admin' || roleLower === 'administrator') {
                    role = 'Admin';
                  } else if (roleLower === 'kebersihan' || roleLower === 'pegawai kebersihan' || roleLower === 'ob' || roleLower === 'penjaga' || roleLower === 'penjaga sekolah') {
                    role = 'Pegawai Kebersihan';
                  } else if (roleLower === 'satpam' || roleLower === 'security' || roleLower === 'keamanan') {
                    role = 'Petugas Keamanan (Satpam)';
                  } else if (roleLower === 'tu' || roleLower === 'staff tu' || roleLower === 'tata usaha') {
                    role = 'Staff Tata Usaha (TU)';
                  }

                  if (name && nip) {
                    newTeachers.push({
                      name,
                      nip,
                      role,
                      mapel: mapel || '-',
                      status
                    });
                  }
                }
              }
            }

            if (newTeachers.length > 0) {
              setTeachers(prev => [...newTeachers, ...prev]);
              saveTeachersSyncBatch(newTeachers).catch(console.error);
              showNotification(`Berhasil mengunggah ${newTeachers.length} data pegawai/staf`, 'text-emerald-400');
            } else {
              showNotification('Format data CSV Pegawai tidak sesuai atau kosong. Pastikan berisi Nama, NIP, Mapel, Jabatan, Status.', 'text-rose-400');
            }
          }
        } catch (error) {
          console.error('Error parsing Guru CSV:', error);
          showNotification('Gagal memproses file CSV Guru.', 'text-rose-400');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (fileInputGuruRef.current) {
      fileInputGuruRef.current.value = '';
    }
  };

  const handleFileUploadSiswa = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          let text = event.target?.result as string;
          if (text) {
            // Remove UTF-8 BOM if present
            text = text.replace(/^\uFEFF/, '');
            const lines = text.split(/\r?\n/);
            const newStudents = [];
            const cleanValue = (val: string) => {
              if (!val) return '';
              return val.trim().replace(/^["']|["']$/g, '').trim();
            };

            for (let i = 1; i < lines.length; i++) { // Skip header
              const line = lines[i].trim();
              if (line) {
                const separator = line.includes(';') ? ';' : ',';
                const parts = line.split(separator);
                if (parts.length >= 3) {
                  const name = cleanValue(parts[0]);
                  const nis = cleanValue(parts[1]);
                  const kelas = cleanValue(parts[2]);

                  if (name && nis) {
                    newStudents.push({
                      name,
                      nis,
                      kelas,
                      barcode: `SIS-${nis}`
                    });
                  }
                }
              }
            }

            if (newStudents.length > 0) {
              setStudents(prev => [...newStudents, ...prev]);
              saveStudentsSyncBatch(newStudents).catch(console.error);
              showNotification(`Berhasil mengunggah ${newStudents.length} data siswa`, 'text-blue-400');
            } else {
              showNotification('Format data CSV Siswa tidak sesuai atau kosong. Pastikan berisi Nama, NIS, dan Kelas.', 'text-rose-400');
            }
          }
        } catch (error) {
          console.error('Error parsing Siswa CSV:', error);
          showNotification('Gagal memproses file CSV Siswa.', 'text-rose-400');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (fileInputSiswaRef.current) {
      fileInputSiswaRef.current.value = '';
    }
  };

  const handleSaveSchedule = () => {
    if (!editingSchedule.time || !editingSchedule.class || !editingSchedule.subject) {
      showNotification('Lengkapi semua data jadwal!', 'text-amber-400');
      return;
    }

    if (editingSchedule.id) {
      setTeachingSchedule(prev => prev.map(s => s.id === editingSchedule.id ? { ...editingSchedule, id: s.id } as any : s));
      saveTeachingScheduleSync({ ...editingSchedule, id: editingSchedule.id });
      showNotification('Jadwal berhasil diperbarui!', 'text-emerald-400');
    } else {
      const newSchedule = {
        ...editingSchedule,
        id: Date.now()
      };
      setTeachingSchedule(prev => [...prev, newSchedule as any]);
      saveTeachingScheduleSync(newSchedule);
      showNotification('Jadwal baru berhasil ditambahkan!', 'text-emerald-400');
    }
    setShowScheduleModal(false);
  };

  const handleDeleteSchedule = (id: number) => {
    setTeachingSchedule(prev => prev.filter(s => s.id !== id));
    deleteTeachingScheduleSync(id);
    showNotification('Jadwal berhasil dihapus.', 'text-rose-400');
  };

  const openEditSchedule = (schedule: any) => {
    setEditingSchedule(schedule);
    setShowScheduleModal(true);
  };

  const showNotification = (message: string, color: string) => {
    setNotification({ message, show: true, color });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  const sendWhatsAppNotification = async (phoneNumber: string, message: string, silent: boolean = false) => {
    if (!schoolSettings.waGatewayEnabled || !schoolSettings.waGatewayToken) {
      console.log("WhatsApp Gateway is disabled or Token is missing.");
      return false;
    }

    let cleanPhone = phoneNumber.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('8')) {
      cleanPhone = '62' + cleanPhone;
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      console.warn("Invalid phone number format for WhatsApp");
      if (!silent) showNotification("Format nomor telepon/WhatsApp tidak valid!", "text-rose-400");
      return false;
    }

    try {
      let url = '';
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: any = null;

      if (schoolSettings.waGatewayProvider === 'fonnte') {
        url = 'https://api.fonnte.com/send';
        headers['Authorization'] = schoolSettings.waGatewayToken;
        body = JSON.stringify({
          target: cleanPhone,
          message: message,
        });
      } else if (schoolSettings.waGatewayProvider === 'wablas') {
        url = 'https://api.wablas.com/api/send-message';
        headers['Authorization'] = schoolSettings.waGatewayToken;
        body = JSON.stringify({
          phone: cleanPhone,
          message: message,
        });
      } else if (schoolSettings.waGatewayProvider === 'starsender') {
        url = 'https://starsender.id/api/v2/send';
        headers['Authorization'] = `Bearer ${schoolSettings.waGatewayToken}`;
        body = JSON.stringify({
          to: cleanPhone,
          message: message,
        });
      }

      if (url) {
        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: body,
        });
        const result = await response.json();
        console.log("WhatsApp Gateway Response:", result);
        if (result.status === true || result.status === 'success' || result.status === 200 || result.status === 'pending' || result.status === 'sent') {
          if (!silent) showNotification(`Notifikasi WhatsApp terkirim ke ${cleanPhone}!`, 'text-emerald-400');
          return true;
        } else {
          if (!silent) showNotification(`Gateway WA: ${result.reason || result.message || 'Error'}`, 'text-amber-400');
          return false;
        }
      }
    } catch (error) {
      console.error("Error sending WhatsApp notification:", error);
      if (!silent) showNotification("Gagal menghubungi server WhatsApp Gateway.", "text-rose-400");
      return false;
    }
    return false;
  };

  const getIcon = (name: string, className: string) => {
    switch (name) {
      case 'LogIn': return <LogIn className={className} />;
      case 'LogOut': return <LogOut className={className} />;
      case 'BookOpen': return <BookOpen className={className} />;
      case 'UserMinus': return <UserMinus className={className} />;
      default: return <Activity className={className} />;
    }
  };

  const startCameraScanning = async () => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
    }
    setIsCameraScannerActive(true);
    setCameraScannerError(null);
    
    // Allow small delay for React to mount the #camera-reader container
    startTimeoutRef.current = setTimeout(() => {
      try {
        // Explicitly list standard barcode and QR formats to guarantee maximum scanning sensitivity
        const formats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF
        ];

        const html5QrCode = new Html5Qrcode("camera-reader", {
          formatsToSupport: formats,
          verbose: false
        });
        html5QrCodeRef.current = html5QrCode;
        
        const startPromise = html5QrCode.start(
          { facingMode: "environment" }, // back camera on mobile
          {
            fps: 15,
            qrbox: (width, height) => {
              // Wide rectangular box for barcodes rather than a square box
              const boxWidth = Math.min(width, 320) * 0.9;
              const boxHeight = boxWidth * 0.45; // wide aspect ratio (approx 2:1)
              return { width: boxWidth, height: boxHeight };
            },
            aspectRatio: 1.333333 // prefer standard 4:3 view for better focus
          },
          (decodedText) => {
            // Found NIS/Barcode!
            const success = executeStudentScan(decodedText);
            if (success) {
              showNotification(`Scan sukses: ${decodedText}`, 'text-emerald-400');
            }
          },
          () => {
            // silent frame error
          }
        );

        startPromiseRef.current = startPromise;

        startPromise.then(() => {
          if (startPromiseRef.current === startPromise) {
            startPromiseRef.current = null;
          }
        }).catch(err => {
          console.error("Camera start promise rejected:", err);
          if (startPromiseRef.current === startPromise) {
            startPromiseRef.current = null;
          }
          setCameraScannerError("Gagal mengakses Kamera HP. Pastikan Anda membuka aplikasi ini di Tab Baru (klik tombol panah kanan di pojok kanan atas) agar izin kamera aktif.");
          setIsCameraScannerActive(false);
        });
      } catch (e: any) {
        console.error("Camera creation failed:", e);
        setCameraScannerError(e.message || "Gagal membuat scanner kamera.");
        setIsCameraScannerActive(false);
      }
    }, 300);
  };

  const stopCameraScanning = async () => {
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }

    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch (e) {
        // ignore start failures when waiting to stop
      }
      startPromiseRef.current = null;
    }

    if (stopPromiseRef.current) {
      try {
        await stopPromiseRef.current;
      } catch (e) {
        // ignore concurrent stop failures
      }
      return;
    }

    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          const stopPromise = html5QrCodeRef.current.stop();
          stopPromiseRef.current = stopPromise;
          await stopPromise;
        }
      } catch (err: any) {
        const errMsg = err ? (err.message || err.toString()) : "";
        if (errMsg && errMsg.includes("already under transition")) {
          console.warn("Camera stop ignored: already under transition state.");
        } else {
          console.error("Error stopping camera scan:", err);
        }
      } finally {
        stopPromiseRef.current = null;
        html5QrCodeRef.current = null;
      }
    }
    setIsCameraScannerActive(false);
  };

  useEffect(() => {
    if (activeTab !== 'scan') {
      stopCameraScanning();
    }
    return () => {
      // Cleanup on unmount - call the fully guarded stopCameraScanning
      stopCameraScanning();
    };
  }, [activeTab]);

  const executeStudentScan = (inputVal: string, overrideStatus?: string) => {
    const trimmed = inputVal.trim();
    if (!trimmed) return false;

    const now = new Date();
    // Check for holidays
    const todayStr = now.toISOString().split('T')[0];
    const todayHoliday = holidays.find(h => h.date === todayStr);
    
    if (todayHoliday) {
      playBeep('error');
      showNotification(`Hari ini adalah hari libur: ${todayHoliday.name}. Absensi ditutup.`, 'text-amber-400');
      return false;
    }

    // Find student by NIS, Barcode, or exact Name (case insensitive)
    const found = students.find(s => 
      s.nis === trimmed || 
      (s.barcode && s.barcode.toUpperCase() === trimmed.toUpperCase()) ||
      s.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (found) {
      // Prevent rapid double-scan within 5 seconds for the same student (camera read duplication)
      const lastScanTime = recentlyScannedRef.current[found.nis] || 0;
      const nowMs = Date.now();
      if (nowMs - lastScanTime < 5000) {
        // Silently return true to let the scanner proceed, without duplicating notification or database writes
        return true;
      }
      recentlyScannedRef.current[found.nis] = nowMs;

      setScannedStudent(found);
      setScanSuccess(true);

      const now = new Date();
      const recordTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Avoid duplication
      const activeSession = teachingSessionsTodayRef.current.find(s => 
        s.nip === nipRef.current && 
        s.kelas === ruangKelasRef.current && 
        s.mapel === mataPelajaranRef.current &&
        s.status === 'Mengajar'
      );
      const activeSessionId = activeSession ? activeSession.id : '';
      const activeSessionMapel = activeSession ? activeSession.mapel : '';
      const activeSessionGuru = activeSession ? activeSession.name : '';
      const todayStr = now.toLocaleDateString('en-CA');

      const isAlreadyScanned = studentRecordsRef.current.some(rec => 
        rec.nis === found.nis && 
        (rec.date === todayStr) && 
        (rec.sessionId || '') === activeSessionId
      );

      if (isAlreadyScanned) {
        playBeep('warning');
        showNotification(`${found.name} sudah melakukan presensi untuk sesi ini/hari ini.`, 'text-amber-400');
      } else {
        playBeep('success');
        const newRec = {
          id: 'sr_' + Math.random().toString(36).substr(2, 9),
          name: found.name,
          nis: found.nis,
          kelas: found.kelas,
          time: recordTimeStr,
          status: overrideStatus || 'Hadir',
          sessionId: activeSessionId,
          mapel: activeSessionMapel,
          guru: activeSessionGuru,
          date: todayStr
        };
        setStudentRecords(prev => [newRec, ...prev]);
        saveStudentRecordSync(newRec);
        showNotification(`Presensi barcode ${found.name} berhasil tercatat!`, 'text-emerald-400');
      }

      // Auto-focus input again
      setTimeout(() => {
        if (scanInputRef.current) {
          scanInputRef.current.focus();
        }
      }, 50);

      // Handle scanner overlay transition
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      scanTimeoutRef.current = setTimeout(() => {
        setScannedStudent(null);
      }, 3000);

      return true;
    } else {
      playBeep('error');
      showNotification(`Siswa dengan NIS/Barcode "${trimmed}" tidak ditemukan!`, 'text-rose-400');
      return false;
    }
  };

  if (userRole === 'guest') {
    return (
      <div className="min-h-screen bg-[#05050A] text-gray-100 font-sans flex items-center justify-center p-4 relative overflow-hidden selection:bg-blue-500/30 animate-[fadeIn_0.5s_ease-out]">
        {/* Background Ambient Glows */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[120px]"></div>
        </div>

        <div className="relative z-10 w-full max-w-md">
          {/* Card Wrapper */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-[0_15px_50px_rgba(0,0,0,0.5)] overflow-hidden relative"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

            {/* Header / Logo */}
            <div className="text-center mb-8">
              <div className="inline-flex mb-4">
                <img src="https://iili.io/CRQazj1.png" alt="Logo Sekolah" className="w-20 h-20 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
              </div>
              <h1 className="text-2xl font-normal text-white tracking-tight">{schoolSettings.schoolName}</h1>
              <p className="text-sm text-gray-400 mt-1 font-normal">Sistem Absensi Integrasi Sekolah</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleManualLogin} className="space-y-4">
              {loginError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-normal flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1.5 uppercase tracking-wider">Username / NIP</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username"
                    className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/5 rounded-2xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-normal"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-12 py-3 bg-white/[0.03] border border-white/5 rounded-2xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-normal"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-normal transition-all shadow-[0_4px_25px_rgba(37,99,235,0.3)] active:scale-95 text-sm cursor-pointer"
              >
                Masuk ke Portal
              </button>
            </form>


          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05050A] text-gray-100 font-sans flex overflow-hidden selection:bg-blue-500/30">
      
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px]"></div>
        <div className="absolute top-[40%] right-[-10%] w-[30%] h-[30%] rounded-full bg-emerald-600/10 blur-[120px]"></div>
      </div>

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 bg-white/[0.02] backdrop-blur-2xl border-r border-white/5 h-screen sticky top-0 z-20">
        <div className="p-8 flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-xl blur-md opacity-50"></div>
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-800 flex items-center justify-center border border-white/20 overflow-hidden">
              <img src="https://iili.io/CRQazj1.png" alt="Logo Sekolah" className="w-full h-full object-contain p-1" />
            </div>
          </div>
          <div>
            <h1 className="font-normal text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">{schoolSettings.schoolName}</h1>
            <p className="text-xs text-blue-400 font-normal tracking-wider uppercase mt-0.5">Premium Portal</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {userRole === 'guru' && (
            <>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'dashboard' 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="font-normal">{isTeacherRole ? 'Dashboard Guru' : 'Dashboard Staff'}</span>
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'schedule' 
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Calendar className="w-5 h-5" />
                <span className="font-normal">{isTeacherRole ? 'Jadwal Mengajar' : 'Jadwal Tugas / Shift'}</span>
              </button>
              <button
                onClick={() => setActiveTab('class-attendance')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'class-attendance' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span className="font-normal">{isTeacherRole ? 'Riwayat Absensi Kelas' : 'Laporan Absensi Siswa'}</span>
              </button>
              <button
                onClick={() => setActiveTab('teacher-attendance')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'teacher-attendance' 
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span className="font-normal">Riwayat Absen Pribadi</span>
              </button>
              <button
                onClick={() => setActiveTab('scan')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'scan' 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span className="font-normal">Scan Barcode Siswa</span>
              </button>
              <button
                onClick={() => setActiveTab('piket')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'piket' 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Shield className="w-5 h-5" />
                <span className="font-normal">Guru Piket & Substitusi</span>
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'profile' 
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <User className="w-5 h-5" />
                <span className="font-normal">{isTeacherRole ? 'Profil Guru' : 'Profil Staff'}</span>
              </button>
            </>
          )}

          {userRole === 'siswa' && (
            <>
              <button
                onClick={() => setActiveTab('scan')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'scan' 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span className="font-normal">Absen Barcode</span>
              </button>
              <button
                onClick={() => setActiveTab('card')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'card' 
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <User className="w-5 h-5" />
                <span className="font-normal">Kartu Siswa</span>
              </button>
            </>
          )}

          {userRole === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'analytics' 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Activity className="w-5 h-5" />
                <span className="font-normal">Analisis Data</span>
              </button>
              <button
                onClick={() => setActiveTab('izin')}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'izin' 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Coffee className="w-5 h-5" />
                  <span className="font-normal">Persetujuan Izin</span>
                </div>
                {izinRequests.filter(r => r.status === 'Pending').length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-normal bg-amber-500 text-[#05050A] rounded-full">
                    {izinRequests.filter(r => r.status === 'Pending').length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('piket')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'piket' 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Shield className="w-5 h-5" />
                <span className="font-normal">Guru Piket & Substitusi</span>
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'users' 
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="font-normal">Daftar Guru & Siswa</span>
              </button>
              <button
                onClick={() => setActiveTab('academic-calendar')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'academic-calendar' 
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Calendar className="w-5 h-5" />
                <span className="font-normal">Kalender & Libur</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'settings' 
                    ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20 shadow-[0_0_20px_rgba(100,116,139,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span className="font-normal">Pengaturan Sistem</span>
              </button>
              <button
                onClick={() => setActiveTab('export')}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                  activeTab === 'export' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <FolderDown className="w-5 h-5" />
                <span className="font-normal">Pusat Laporan</span>
              </button>
            </>
          )}
        </nav>

        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-blue-800 flex items-center justify-center">
                {userRole === 'admin' ? (
                  <Shield className="w-5 h-5 text-white" />
                ) : userRole === 'siswa' ? (
                  <User className="w-5 h-5 text-white" />
                ) : (
                  <GraduationCap className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-normal text-white truncate">
                  {userRole === 'admin' ? 'Administrator' : userRole === 'siswa' ? 'Siswa Portal' : nama}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                  {userRole === 'admin' ? 'Full Access' : userRole === 'siswa' ? 'Absen Barcode' : userJabatan}
                </p>
              </div>
            </div>
          </div>
          <button 
            onClick={() => {
              setShowLogoutConfirm(true);
            }}
            className="w-full py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20 flex items-center justify-center gap-2 font-normal cursor-pointer"
          >
            <LogOut className="w-5 h-5" /> Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col h-screen overflow-y-auto">
        
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 bg-[#05050A]/80 backdrop-blur-xl border-b border-white/5 px-6 sm:px-10 py-5 flex items-center justify-between">
          <div className="md:hidden flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-blue-800 flex items-center justify-center overflow-hidden">
              <img src="https://iili.io/CRQazj1.png" alt="Logo Sekolah" className="w-full h-full object-contain p-0.5" />
            </div>
            <h1 className="font-normal text-lg">{schoolSettings.schoolName}</h1>
          </div>
          <div className="hidden md:block">
            <h2 className="text-xl font-normal capitalize text-gray-100">
              {activeTab === 'dashboard' && (isTeacherRole ? 'Dashboard Guru' : 'Dashboard Staff')}
              {activeTab === 'schedule' && (isTeacherRole ? 'Jadwal Mengajar' : 'Jadwal Tugas / Shift')}
              {activeTab === 'class-attendance' && (isTeacherRole ? 'Riwayat Absensi Kelas' : 'Laporan Absensi Siswa')}
              {activeTab === 'teacher-attendance' && 'Riwayat Absensi Pribadi'}
              {activeTab === 'profile' && (isTeacherRole ? 'Profil Guru' : 'Profil Staff')}
              {activeTab === 'scan' && 'Portal Absensi Barcode'}
              {activeTab === 'card' && 'Kartu Anggota Virtual'}
              {activeTab === 'analytics' && 'Analisis Data Presensi'}
              {activeTab === 'izin' && 'Persetujuan Izin & Sakit'}
              {activeTab === 'piket' && 'Guru Piket & Substitusi Kelas'}
              {activeTab === 'users' && 'Manajemen Guru & Siswa'}
              {activeTab === 'academic-calendar' && 'Kalender Akademik & Hari Libur'}
              {activeTab === 'settings' && 'Pengaturan Sistem Sekolah'}
              {activeTab === 'export' && 'Pusat Laporan Menyeluruh'}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualSyncData}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all cursor-pointer text-xs font-normal active:scale-95 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
              title="Sinkronkan Data Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sinkronkan Data</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
              <Search className="w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search..." className="bg-transparent border-none outline-none text-sm w-32 text-gray-200 placeholder-gray-500" />
            </div>

            <button
              onClick={() => {
                setShowLogoutConfirm(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/15 transition-all cursor-pointer text-xs font-normal active:scale-95"
              title="Keluar dari Akun"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden xs:inline">Keluar</span>
            </button>
          </div>
        </header>

        <div className="flex-1 p-6 sm:p-10 max-w-6xl w-full mx-auto pb-32 md:pb-10">
          
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Greeting & Clock */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-3xl font-normal tracking-tight text-white">Selamat Datang,</h2>
                      {isSessionTimeActive() && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-normal tracking-wider bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
                          {ruangKelas} • {mataPelajaran}
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-normal mt-1 mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                      {nama || 'Guru'}
                    </div>
                    <p className="text-gray-400 text-sm">Pilih tindakan kehadiran Anda untuk hari ini.</p>
                  </div>
                  <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Clock className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400 font-normal mb-0.5">Waktu Server</div>
                      <div className="font-mono text-xl font-normal tracking-wider text-gray-100">
                        {currentTime.toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-4 sm:gap-5">
                  {isLoading ? (
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="h-36 rounded-2xl bg-white/5 border border-white/5 animate-pulse relative overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
                      </div>
                    ))
                  ) : (
                    <>
                      {attendanceButtons.map((btn) => (
                        <motion.button
                          key={btn.id}
                          whileHover={{ scale: 1.02, y: -4 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => openAttendanceModal(btn)}
                          className={`group relative ${btn.bg} backdrop-blur-md border ${btn.border} p-4 sm:p-6 rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-3 overflow-hidden h-32 sm:h-36 ${btn.shadow}`}
                        >
                          <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${btn.bg} blur-2xl group-hover:opacity-70 opacity-30 transition-opacity`}></div>
                          <div className={`p-2.5 sm:p-3 rounded-xl bg-[#05050A]/50 border border-white/5 shadow-inner ${btn.glow}`}>
                            {getIcon(btn.iconName, `w-5 h-5 sm:w-6 sm:h-6 ${btn.color}`)}
                          </div>
                          <div className="flex flex-col items-center gap-1 z-10 text-center">
                            <span className={`font-normal text-sm sm:text-base ${btn.color} tracking-wide leading-snug`}>
                              {btn.id === 'mengajar' ? (isTeacherRole ? 'Mulai Mengajar' : 'Mulai Tugas / Shift') : btn.label}
                            </span>
                            {btn.id === 'mengajar' && isSessionTimeActive() && (
                              <span className="text-[10px] font-normal text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full mt-0.5">
                                {ruangKelas} • {mataPelajaran}
                              </span>
                            )}
                          </div>
                        </motion.button>
                      ))}
                      <motion.button
                        key="riwayat-absensi"
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveTab('teacher-attendance')}
                        className={`group relative bg-purple-400/10 backdrop-blur-md border border-purple-400/30 p-4 sm:p-6 rounded-2xl transition-all duration-300 flex flex-col items-center justify-center gap-3 overflow-hidden h-32 sm:h-36 hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]`}
                      >
                        <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-purple-400/10 blur-2xl group-hover:opacity-70 opacity-30 transition-opacity`}></div>
                        <div className={`p-2.5 sm:p-3 rounded-xl bg-[#05050A]/50 border border-white/5 shadow-inner shadow-[0_0_15px_rgba(168,85,247,0.4)]`}>
                          <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
                        </div>
                        <div className="flex flex-col items-center gap-1 z-10 text-center">
                          <span className={`font-normal text-sm sm:text-base text-purple-400 tracking-wide leading-snug`}>
                            Riwayat Absensi
                          </span>
                        </div>
                      </motion.button>
                    </>
                  )}
                </div>

                {isTeacherRole && isSessionTimeActive() && (
                  <div className="bg-white/[0.02] border border-cyan-500/20 rounded-3xl p-6 relative overflow-hidden mt-6 shadow-[0_0_25px_rgba(34,211,238,0.05)]">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-normal text-lg text-white">Sesi Mengajar Aktif: Kelas {ruangKelas}</h4>
                          <p className="text-xs text-cyan-400 mt-0.5">Mata Pelajaran: {mataPelajaran} • Guru: {nama}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-lg">
                          Sesi: {jamMulai} - {jamSelesai}
                        </span>
                        <button
                          onClick={handleEndTeachingSession}
                          className="text-xs font-normal text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/20 cursor-pointer active:scale-95 transition-all"
                        >
                          Akhiri Sesi
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="text-sm font-normal text-white">Daftar Kehadiran Siswa Sesi Ini</h5>
                        <span className="text-xs text-gray-400 font-mono">
                          {activeSessionStudents.filter(s => s.status === 'Hadir').length} / {activeSessionStudents.length} Siswa Hadir
                        </span>
                      </div>

                      {activeSessionStudents.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">Tidak ada data siswa untuk kelas {ruangKelas}.</p>
                      ) : (
                        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                          {activeSessionStudents.map(student => (
                            <div key={student.nis} className="flex items-center justify-between p-3.5 bg-[#05050A]/40 border border-white/5 rounded-2xl hover:bg-white/[0.02] transition-colors">
                              <div>
                                <h6 className="text-sm font-normal text-white">{student.name}</h6>
                                <p className="text-xs text-gray-400 mt-0.5 font-mono">NIS {student.nis} {student.time !== '-' && `• Hadir: ${student.time}`}</p>
                              </div>
                              <div className="flex gap-1.5">
                                {['Hadir', 'Sakit', 'Izin', 'Alpa'].map(st => {
                                  let bgClass = 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent';
                                  if (student.status === st) {
                                    if (st === 'Hadir') bgClass = 'bg-emerald-500 text-white font-normal shadow-[0_0_12px_rgba(16,185,129,0.3)]';
                                    if (st === 'Sakit') bgClass = 'bg-yellow-500 text-black font-normal shadow-[0_0_12px_rgba(234,179,8,0.3)]';
                                    if (st === 'Izin') bgClass = 'bg-blue-500 text-white font-normal shadow-[0_0_12px_rgba(59,130,246,0.3)]';
                                    if (st === 'Alpa') bgClass = 'bg-rose-500 text-white font-normal shadow-[0_0_12px_rgba(244,63,94,0.3)]';
                                  }
                                  
                                  const activeSession = teachingSessionsToday.find(s => 
                                    s.nip === nip && 
                                    s.kelas === ruangKelas && 
                                    s.mapel === mataPelajaran &&
                                    s.status === 'Mengajar'
                                  );
                                  const activeSessionId = activeSession ? activeSession.id : 'default';

                                  return (
                                    <button
                                      key={st}
                                      onClick={() => handleUpdateStudentStatus(
                                        student.nis, 
                                        student.name, 
                                        student.kelas, 
                                        st, 
                                        activeSessionId, 
                                        mataPelajaran, 
                                        nama
                                      )}
                                      className={`px-2.5 py-1 rounded-xl text-[10px] font-normal transition-all cursor-pointer ${bgClass}`}
                                    >
                                      {st}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'schedule' && (
              <motion.div 
                key="schedule"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                  <div>
                    <h2 className="text-2xl font-normal text-white">{isTeacherRole ? 'Jadwal Mengajar' : 'Jadwal Tugas / Shift Kerja'}</h2>
                    <p className="text-gray-400 text-sm mt-1">{isTeacherRole ? 'Manajemen jadwal mengajar mingguan dan harian Anda.' : 'Manajemen jadwal tugas, patroli, atau shift kerja harian Anda.'}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <button
                      onClick={() => {
                        setEditingSchedule({ id: null, day: scheduleDay, time: '', class: '', subject: '' });
                        setShowScheduleModal(true);
                      }}
                      className="px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-xl hover:bg-orange-500/20 transition-colors flex items-center gap-2 w-full sm:w-auto cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">Tambah Jadwal</span>
                    </button>
                    <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 w-fit overflow-x-auto">
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day) => (
                        <button
                          key={day}
                          onClick={() => setScheduleDay(day)}
                          className={`px-4 py-2 rounded-lg text-sm font-normal transition-all ${
                            scheduleDay === day 
                              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' 
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teachingSchedule.filter(s => s.day === scheduleDay).length > 0 ? (
                    teachingSchedule.filter(s => s.day === scheduleDay).map((schedule, idx) => (
                      <div key={schedule.id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-orange-500/30 transition-colors">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-purple-500/10 rounded-full blur-2xl -mr-16 -mt-16 transition-all group-hover:scale-150"></div>
                        <div className="flex items-start justify-between relative z-10">
                          <div>
                            <div className="flex items-center gap-2 text-orange-400 mb-1">
                              <Clock className="w-4 h-4" />
                              <span className="font-normal text-sm">{schedule.time}</span>
                            </div>
                            <h3 className="text-xl font-normal text-white">{schedule.subject}</h3>
                            <div className="flex items-center gap-2 text-gray-400 mt-2">
                              <MapPin className="w-4 h-4" />
                              <span className="text-sm font-normal">{isTeacherRole ? `Kelas ${schedule.class}` : `Lokasi: ${schedule.class}`}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button onClick={() => openEditSchedule(schedule)} className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteSchedule(schedule.id)} className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                      <Calendar className="w-12 h-12 text-gray-500 mb-3" />
                      <p className="text-gray-400 font-normal">Tidak ada {isTeacherRole ? 'jadwal mengajar' : 'jadwal tugas / shift kerja'} pada hari {scheduleDay}.</p>
                    </div>
                  )}
                </div>

                <div className="mt-8 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl">
                      <Sparkles className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-normal text-lg mb-1">Ringkasan Mingguan</h4>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        Anda memiliki total <span className="text-white font-normal">{teachingSchedule.length} {isTeacherRole ? 'sesi mengajar' : 'tugas harian'}</span> minggu ini. Pastikan untuk mengisi absensi tepat waktu 15 menit sebelum setiap sesi dimulai.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'teacher-attendance' && (
              <motion.div 
                key="teacher-attendance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                  <div>
                    <h2 className="text-2xl font-normal text-white">Riwayat Absensi Pribadi</h2>
                    <p className="text-gray-400 text-sm mt-1">Rekapitulasi kehadiran Anda di sekolah.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <select 
                        value={personalHistoryMonth}
                        onChange={(e) => setPersonalHistoryMonth(e.target.value)}
                        className="w-full sm:w-auto appearance-none bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-colors cursor-pointer"
                      >
                        <option value="12-2026">Desember 2026</option>
                        <option value="11-2026">November 2026</option>
                        <option value="10-2026">Oktober 2026</option>
                        <option value="09-2026">September 2026</option>
                        <option value="08-2026">Agustus 2026</option>
                        <option value="07-2026">Juli 2026</option>
                        <option value="06-2026">Juni 2026</option>
                        <option value="05-2026">Mei 2026</option>
                        <option value="04-2026">April 2026</option>
                        <option value="03-2026">Maret 2026</option>
                        <option value="02-2026">Februari 2026</option>
                        <option value="01-2026">Januari 2026</option>
                        <option value="all">Semua Data (Tahun Ajaran Aktif)</option>
                      </select>
                      <Calendar className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const doc = new jsPDF();
                          doc.setFontSize(16);
                          doc.text('Laporan Absensi Bulanan', 14, 22);
                          doc.setFontSize(11);
                          doc.text(`Nama : ${nama}`, 14, 32);
                          doc.text(`NIP  : ${nip}`, 14, 38);

                          let bulanLabel = 'Semua Data';
                          if (personalHistoryMonth !== 'all') {
                            const [m, y] = personalHistoryMonth.split('-');
                            const nameMap: { [key: string]: string } = {
                              '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
                              '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
                              '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
                            };
                            bulanLabel = `${nameMap[m] || ''} ${y}`;
                          }

                          doc.text(`Bulan: ${bulanLabel}`, 14, 44);
                          doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 50);
                          
                          const tableData = filteredTeacherAttendanceHistory.map(h => [
                            h.date,
                            h.type || 'Absen',
                            h.time || '-',
                            h.status,
                            h.location
                          ]);
                          
                          autoTable(doc, {
                            startY: 56,
                            head: [['Tanggal', 'Tipe Absen', 'Waktu Absen', 'Status', 'Jarak Absen']],
                            body: tableData,
                            theme: 'grid',
                            headStyles: { fillColor: [168, 85, 247] },
                          });
                          
                          const finalY3 = (doc as any).lastAutoTable.finalY || 100;
                          doc.text(`${getPlaceSignature()}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, finalY3 + 20);
                          doc.text('Kepala Sekolah', 130, finalY3 + 28);
                          doc.text(schoolSettings.headmasterName, 130, finalY3 + 50);
                          doc.text(`NIP. ${schoolSettings.headmasterNip}`, 130, finalY3 + 56);

                          doc.save(`Riwayat_Absen_${nama.replace(/[^a-zA-Z0-9]/g, '_')}_${bulanLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
                          showNotification('Laporan PDF berhasil diunduh!', 'text-emerald-400');
                        }}
                        className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm transition-all cursor-pointer flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">PDF Bulanan</span>
                        <span className="sm:hidden">PDF</span>
                      </button>
                      <button 
                        onClick={() => {
                          const headers = ['Tanggal', 'Tipe Absen', 'Waktu Absen', 'Status', 'Jarak Absen'];
                          const csvContent = [
                            headers.join(','),
                            ...filteredTeacherAttendanceHistory.map(h => `"${h.date}","${h.type || 'Absen'}","${h.time || '-'}","${h.status}","${h.location}"`)
                          ].join('\n');
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          
                          let bulanLabel = 'Semua_Data';
                          if (personalHistoryMonth !== 'all') {
                            const [m, y] = personalHistoryMonth.split('-');
                            const nameMap: { [key: string]: string } = {
                              '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
                              '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
                              '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
                            };
                            bulanLabel = `${nameMap[m] || ''}_${y}`;
                          }

                          link.download = `Riwayat_Absen_${nama.replace(/[^a-zA-Z0-9]/g, '_')}_${bulanLabel}.csv`;
                          link.click();
                          showNotification('Laporan Excel (CSV) berhasil diunduh!', 'text-emerald-400');
                        }}
                        className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm transition-all cursor-pointer flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span className="hidden sm:inline">Excel Bulanan</span>
                        <span className="sm:hidden">Excel</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                    <p className="text-emerald-400 text-sm mb-1">Hadir (Hari)</p>
                    <p className="text-2xl font-normal text-white">
                      {uniqueAttendanceDaysCount}
                    </p>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                    <p className="text-rose-400 text-sm mb-1">Alpa</p>
                    <p className="text-2xl font-normal text-white">
                      {filteredTeacherAttendanceHistory.filter(h => h.status === 'Alpa').length}
                    </p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
                    <p className="text-yellow-400 text-sm mb-1">Sakit</p>
                    <p className="text-2xl font-normal text-white">
                      {filteredTeacherAttendanceHistory.filter(h => h.status === 'Sakit').length}
                    </p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
                    <p className="text-blue-400 text-sm mb-1">Izin / Dinas</p>
                    <p className="text-2xl font-normal text-white">
                      {filteredTeacherAttendanceHistory.filter(h => h.status === 'Izin' || h.status === 'Dinas').length}
                    </p>
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden mt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          <th className="py-4 px-6 text-xs font-normal text-gray-400 uppercase tracking-wider">Tanggal</th>
                          <th className="py-4 px-6 text-xs font-normal text-gray-400 uppercase tracking-wider">Tipe Absen</th>
                          <th className="py-4 px-6 text-xs font-normal text-gray-400 uppercase tracking-wider">Waktu Absen</th>
                          <th className="py-4 px-6 text-xs font-normal text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="py-4 px-6 text-xs font-normal text-gray-400 uppercase tracking-wider">Jarak Absen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-sm">
                        {filteredTeacherAttendanceHistory.map((history) => (
                          <tr key={history.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-4 px-6 text-white font-normal">{history.date}</td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-normal ${
                                history.type === 'Absen Datang' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                                history.type === 'Absen Pulang' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
                                history.type === 'Dinas' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/10' :
                                'bg-amber-500/10 text-amber-400 border border-amber-500/10'
                              }`}>
                                {history.type || 'Absen'}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-gray-300 font-mono">{history.time || '-'}</td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-normal ${
                                history.status === 'Tepat Waktu' || history.status === 'Hadir' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                history.status === 'Terlambat' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 
                                history.status === 'Sakit' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                history.status === 'Izin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                history.status === 'Pulang' || history.status === 'Selesai' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                                'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {history.status}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-gray-400 text-sm">{history.location}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'class-attendance' && (
              <motion.div 
                key="class-attendance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                  <div>
                    <h2 className="text-2xl font-normal text-white">Riwayat Absensi Kelas</h2>
                    <p className="text-gray-400 text-sm mt-1">Rekapitulasi presensi siswa per kelas.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <select 
                        value={selectedClassAttendance}
                        onChange={(e) => setSelectedClassAttendance(e.target.value)}
                        className="w-full sm:w-auto appearance-none bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                      >
                        <option value="VII A">Kelas VII A</option>
                        <option value="VII B">Kelas VII B</option>
                        <option value="VII C">Kelas VII C</option>
                        <option value="VII D">Kelas VII D</option>
                        <option value="VIII A">Kelas VIII A</option>
                        <option value="VIII B">Kelas VIII B</option>
                        <option value="VIII C">Kelas VIII C</option>
                        <option value="VIII D">Kelas VIII D</option>
                        <option value="IX A">Kelas IX A</option>
                        <option value="IX B">Kelas IX B</option>
                        <option value="IX C">Kelas IX C</option>
                        <option value="IX D">Kelas IX D</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={attendanceDate}
                        onChange={(e) => setAttendanceDate(e.target.value)}
                        className="w-full sm:w-auto bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <select 
                        value={selectedSessionFilter}
                        onChange={(e) => setSelectedSessionFilter(e.target.value)}
                        className="w-full sm:w-auto appearance-none bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                      >
                        <option value="all">Presensi Barcode / Harian</option>
                        {classSessionsOnDate.map(session => (
                          <option key={session.id} value={session.id}>
                            Sesi: {session.mapel} ({session.name})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                    <p className="text-emerald-400 text-sm mb-1">Hadir</p>
                    <p className="text-2xl font-normal text-white">
                      {currentClassAttendanceSummary.present}
                    </p>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                    <p className="text-rose-400 text-sm mb-1">Alpa</p>
                    <p className="text-2xl font-normal text-white">
                      {currentClassAttendanceSummary.absent}
                    </p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5">
                    <p className="text-yellow-400 text-sm mb-1">Sakit</p>
                    <p className="text-2xl font-normal text-white">
                      {currentClassAttendanceSummary.sick}
                    </p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
                    <p className="text-blue-400 text-sm mb-1">Izin</p>
                    <p className="text-2xl font-normal text-white">
                      {currentClassAttendanceSummary.permission}
                    </p>
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden mt-6">
                  <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-lg font-normal text-white">Daftar Siswa</h3>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 sm:flex-none">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text" 
                          placeholder="Cari siswa..." 
                          value={searchAttendanceSiswaQuery}
                          onChange={(e) => setSearchAttendanceSiswaQuery(e.target.value)}
                          className="bg-black/20 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/30 w-full sm:w-64"
                        />
                      </div>
                      <div className="flex bg-white/5 rounded-lg border border-white/10 p-0.5">
                        <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer">
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">PDF Harian</span>
                        </button>
                        <button onClick={handleExportMonthlyPDF} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer border-l border-white/10">
                          <span className="hidden sm:inline">Bulanan</span>
                        </button>
                      </div>
                      <div className="flex bg-emerald-500/10 rounded-lg border border-emerald-500/20 p-0.5">
                        <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 rounded-md transition-colors cursor-pointer">
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Excel Harian</span>
                        </button>
                        <button onClick={handleExportMonthlyExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 rounded-md transition-colors cursor-pointer border-l border-emerald-500/20">
                          <span className="hidden sm:inline">Bulanan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-gray-400 text-sm">
                          <th className="py-3 px-5 font-normal">NIS</th>
                          <th className="py-3 px-5 font-normal">Nama Siswa</th>
                          <th className="py-3 px-5 font-normal">Status</th>
                          <th className="py-3 px-5 font-normal">Waktu Absen</th>
                          <th className="py-3 px-5 font-normal">Ubah Status (Aksi)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStudents.map((student, idx) => {
                          const currentSession = classSessionsOnDate.find(s => s.id === selectedSessionFilter);
                          const sId = selectedSessionFilter === 'all' ? '' : selectedSessionFilter;
                          const sMapel = currentSession ? currentSession.mapel : '';
                          const sGuru = currentSession ? currentSession.name : '';

                          return (
                            <tr key={idx} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                              <td className="py-3 px-5 text-gray-300 text-sm">{student.nis}</td>
                              <td className="py-3 px-5 text-white text-sm">{student.name}</td>
                              <td className="py-3 px-5">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs ${
                                  student.status === 'Hadir' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  student.status === 'Alpa' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                  student.status === 'Sakit' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}>
                                  {student.status}
                                </span>
                              </td>
                              <td className="py-3 px-5 text-gray-400 text-sm">
                                {student.status === 'Hadir' ? student.time : '-'}
                              </td>
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => handleUpdateStudentStatus(student.nis, student.name, student.kelas || '', 'Hadir', sId, sMapel, sGuru)}
                                    title="Set Hadir"
                                    className={`px-2 py-1 rounded text-[10px] font-normal transition-all cursor-pointer ${
                                      student.status === 'Hadir' 
                                        ? 'bg-emerald-500 text-white font-medium shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                                        : 'bg-white/5 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                                    }`}
                                  >
                                    Hadir
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStudentStatus(student.nis, student.name, student.kelas || '', 'Sakit', sId, sMapel, sGuru)}
                                    title="Set Sakit"
                                    className={`px-2 py-1 rounded text-[10px] font-normal transition-all cursor-pointer ${
                                      student.status === 'Sakit' 
                                        ? 'bg-yellow-500 text-black font-medium shadow-[0_0_12px_rgba(234,179,8,0.3)]' 
                                        : 'bg-white/5 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
                                    }`}
                                  >
                                    Sakit
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStudentStatus(student.nis, student.name, student.kelas || '', 'Izin', sId, sMapel, sGuru)}
                                    title="Set Izin"
                                    className={`px-2 py-1 rounded text-[10px] font-normal transition-all cursor-pointer ${
                                      student.status === 'Izin' 
                                        ? 'bg-blue-500 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.3)]' 
                                        : 'bg-white/5 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20'
                                    }`}
                                  >
                                    Izin
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStudentStatus(student.nis, student.name, student.kelas || '', 'Alpa', sId, sMapel, sGuru)}
                                    title="Set Alpa"
                                    className={`px-2 py-1 rounded text-[10px] font-normal transition-all cursor-pointer ${
                                      student.status === 'Alpa' 
                                        ? 'bg-rose-500 text-white font-medium shadow-[0_0_12px_rgba(244,63,94,0.3)]' 
                                        : 'bg-white/5 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                                    }`}
                                  >
                                    Alpa
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-3xl mx-auto space-y-6"
              >
                {isLoading ? (
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-10 animate-pulse">
                    <div className="flex flex-col items-center">
                      <div className="w-28 h-28 rounded-full bg-white/5 mb-6"></div>
                      <div className="w-48 h-6 bg-white/5 rounded mb-3"></div>
                      <div className="w-32 h-4 bg-white/5 rounded mb-4"></div>
                      <div className="w-24 h-6 bg-white/5 rounded-full"></div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                    <div className="relative h-32 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-white/5 overflow-hidden">
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    </div>
                    <div className="px-10 pb-10 relative">
                      <div className="absolute -top-16 left-1/2 -translate-x-1/2">
                        <div className="w-32 h-32 rounded-full p-2 bg-[#05050A] border border-white/10 shadow-2xl relative">
                          <div className="absolute inset-0 rounded-full border border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-[spin_10s_linear_infinite]"></div>
                          <div className="w-full h-full bg-gradient-to-br from-blue-900 to-purple-900 rounded-full flex items-center justify-center">
                            <User className="w-12 h-12 text-blue-200" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-20 text-center relative">
                        {userRole === 'guru' && (
                          <button
                            onClick={() => {
                              const t = teachers.find(x => x.nip === nip);
                              if (t) {
                                setEditingProfileData(t);
                                setShowEditProfileModal(true);
                              }
                            }}
                            className="absolute top-16 right-0 md:top-0 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-gray-300 transition-colors flex items-center gap-2"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit Profil
                          </button>
                        )}
                        <h2 className="text-3xl font-normal text-white tracking-tight mb-1">{nama}</h2>
                        <p className="text-blue-400 font-mono text-sm mb-4">NIP: {nip}</p>
                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-normal bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          {teachers.find(t => t.nip === nip)?.role || 'Guru Mapel Aktif'}
                        </span>
                      </div>

                      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Email Resmi</p>
                              <p className="text-sm font-normal text-gray-200">
                                {teachers.find(t => t.nip === nip)?.email || '-'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                              <Phone className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Telepon</p>
                              <p className="text-sm font-normal text-gray-200">
                                {teachers.find(t => t.nip === nip)?.phone || '-'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                              <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Satuan Kerja</p>
                              <p className="text-sm font-normal text-gray-200">{schoolSettings.schoolName}</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Mata Pelajaran Utama</p>
                              <p className="text-sm font-normal text-gray-200">
                                {teachers.find(t => t.nip === nip)?.mapel || '-'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'scan' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/[0.01] border border-white/5 p-6 rounded-3xl">
                  <div>
                    <h3 className="text-2xl font-normal text-white tracking-tight">Portal Absensi Mandiri Siswa</h3>
                    <p className="text-sm text-gray-400 mt-1">Gunakan Barcode atau ketik NIS untuk mencatat kehadiran siswa hari ini.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-xl">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <span className="font-mono font-normal text-blue-400">{currentTime.toLocaleTimeString('id-ID')}</span>
                  </div>
                </div>

                {isSessionTimeActive() ? (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                        <BookOpen className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-normal tracking-wider uppercase">Sesi Mengajar Aktif</p>
                        <p className="text-sm font-normal text-white">Kelas {ruangKelas} • {mataPelajaran}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">Jam Mengajar:</span>
                      <span className="font-mono font-normal text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded-md">{jamMulai} - {jamSelesai}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-amber-500/10 rounded-lg animate-pulse">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-normal tracking-wider uppercase">Sesi Mengajar Selesai / Tidak Aktif</p>
                        <p className="text-sm font-normal text-white">Silakan mulai sesi baru untuk mengaktifkan filter & otomatisasi</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('dashboard');
                        showNotification("Silakan klik 'Mulai Mengajar' di dashboard.", "text-amber-400");
                      }}
                      className="text-xs font-normal text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-1.5 rounded-xl border border-amber-500/20 cursor-pointer active:scale-95 transition-all"
                    >
                      Mulai Sesi Mengajar
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column */}
                  <div className="lg:col-span-7 bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative flex flex-col justify-between">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                    
                    <div className="mb-4">
                      <h4 className="font-normal text-lg text-white mb-1">Scanner Presensi Barcode & QR</h4>
                      <p className="text-xs text-gray-400">Posisikan barcode kartu pelajar siswa di depan kamera atau ketik NIS secara manual.</p>
                    </div>

                    <div className="relative w-full aspect-[4/3] max-w-md mx-auto rounded-2xl bg-black border border-white/10 overflow-hidden flex flex-col items-center justify-center group mb-5">
                      {isCameraScannerActive && (
                        <div id="camera-reader" className="absolute inset-0 w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-cover"></div>
                      )}

                      <div className="absolute left-0 right-0 h-0.5 bg-red-500/80 shadow-[0_0_15px_rgba(239,68,68,1)] top-1/2 animate-[bounce_3s_infinite] z-10"></div>
                      
                      <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-md"></div>
                      <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-md"></div>
                      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-md"></div>
                      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-md"></div>

                      <div className="text-center p-6 z-10 relative">
                        {scannedStudent ? (
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-emerald-500/90 backdrop-blur-md border border-emerald-400 p-6 rounded-2xl max-w-xs mx-auto shadow-2xl"
                          >
                            <CheckCircle2 className="w-12 h-12 text-white mx-auto mb-3 animate-bounce" />
                            <h5 className="font-normal text-white truncate text-base">{scannedStudent.name}</h5>
                            <p className="text-xs text-white/80 mt-1">NIS: {scannedStudent.nis} • Kelas {scannedStudent.kelas}</p>
                            <span className="inline-block mt-3 px-3 py-1 bg-white text-emerald-600 font-normal text-[10px] rounded-full uppercase tracking-wider">Hadir Terdaftar</span>
                          </motion.div>
                        ) : (
                          <>
                            {!isCameraScannerActive ? (
                              <>
                                <QrCode className="w-16 h-16 text-blue-500/40 mx-auto mb-3 animate-pulse" />
                                <p className="text-xs font-normal text-gray-500 uppercase tracking-widest">Scanner Siaga</p>
                              </>
                            ) : (
                              <div className="bg-black/40 backdrop-blur-xs px-4 py-2 rounded-lg text-white text-[11px] font-normal uppercase tracking-widest">
                                Kamera Sedang Memindai...
                              </div>
                            )}
                          </>
                        )}
                        {cameraScannerError && (
                          <div className="bg-rose-500/90 backdrop-blur-md border border-rose-400 p-4 rounded-xl max-w-xs mx-auto text-white text-xs font-normal mt-2">
                            {cameraScannerError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                          ref={scanInputRef}
                          type="text"
                          placeholder="Arahkan barcode / ketik NIS atau Nama lalu Enter untuk Hadir..."
                          value={manualNis}
                          onChange={(e) => setManualNis(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              executeStudentScan(manualNis, 'Hadir');
                              setManualNis('');
                            }
                          }}
                          className="w-full pl-12 pr-4 py-4 bg-[#05050A]/80 border border-white/10 rounded-2xl text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
                        />
                      </div>

                      {manualNis.trim().length > 0 && (
                        <div className="flex gap-2 justify-center mt-2 animate-in fade-in slide-in-from-top-2">
                          <button
                            onClick={() => { executeStudentScan(manualNis, 'Hadir'); setManualNis(''); }}
                            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium transition-all cursor-pointer"
                          >Hadir</button>
                          <button
                            onClick={() => { executeStudentScan(manualNis, 'Sakit'); setManualNis(''); }}
                            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-medium transition-all cursor-pointer"
                          >Sakit</button>
                          <button
                            onClick={() => { executeStudentScan(manualNis, 'Izin'); setManualNis(''); }}
                            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-medium transition-all cursor-pointer"
                          >Izin</button>
                          <button
                            onClick={() => { executeStudentScan(manualNis, 'Alpa'); setManualNis(''); }}
                            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-medium transition-all cursor-pointer"
                          >Alpa</button>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-500 text-center leading-normal">
                        💡 Scanner ini <span className="text-blue-400 font-normal">Selalu Siaga</span>. Ketik NIS siswa di atas untuk merekam presensi manual.
                      </p>

                      <div className="flex justify-center pt-1 pb-2">
                        {isCameraScannerActive ? (
                          <button
                            type="button"
                            onClick={stopCameraScanning}
                            className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-normal transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/20"
                          >
                            <Camera className="w-4 h-4 text-rose-400 animate-pulse" /> Nonaktifkan Kamera HP
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={startCameraScanning}
                            className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-normal transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-950/20"
                          >
                            <Camera className="w-4 h-4 text-blue-400" /> Aktifkan Kamera HP Guru
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative">
                      <h4 className="font-normal text-lg text-white mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-400" /> Log Presensi Siswa Hari Ini
                      </h4>
                      
                      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                        {(() => {
                          const todayStr = new Date().toLocaleDateString('en-CA');
                          const todayRecords = studentRecords.filter(rec => (rec.date || '2026-06-27') === todayStr);
                          if (todayRecords.length === 0) {
                            return (
                              <div className="text-center py-10">
                                <UserMinus className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">Belum ada siswa absen hari ini.</p>
                              </div>
                            );
                          }
                          return todayRecords.map(rec => (
                            <div key={rec.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.04] transition-all animate-[fadeIn_0.3s_ease-out]">
                              <div>
                                <p className="text-sm font-normal text-white">{rec.name}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">NIS {rec.nis} • Kelas {rec.kelas}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-mono font-normal text-blue-400">{rec.time}</p>
                                <span className={`inline-block mt-1 px-2 py-0.5 text-[9px] font-normal rounded ${
                                  rec.status === 'Hadir' || rec.status === 'Tepat Waktu' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                                }`}>
                                  {rec.status}
                                </span>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'card' && (
              <motion.div
                key="card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-2xl mx-auto space-y-6"
              >
                <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
                  <div>
                    <h3 className="font-normal text-lg text-white">Kartu Pelajar Digital</h3>
                    <p className="text-xs text-gray-400 mt-1">Pilih siswa untuk menghasilkan visual ID card dengan barcode-nya.</p>
                  </div>
                  <select
                    value={selectedStudentCard}
                    onChange={(e) => setSelectedStudentCard(e.target.value)}
                    className="px-4 py-2.5 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white focus:outline-none"
                  >
                    {students.map(s => (
                      <option key={s.nis} value={s.nis}>{s.name} ({s.kelas})</option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const s = students.find(x => x.nis === selectedStudentCard) || students[0];
                  return (
                    <motion.div
                      initial={{ scale: 0.95 }}
                      animate={{ scale: 1 }}
                      className="bg-gradient-to-br from-[#121225] via-[#0A0A16] to-[#121225] border border-white/15 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative group"
                    >
                      <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500"></div>
                      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all duration-500"></div>

                      <div className="p-8">
                        <div className="flex justify-between items-start border-b border-white/10 pb-6">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-tr from-blue-600 to-blue-800 rounded-xl">
                              <GraduationCap className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <h4 className="text-base font-normal text-white tracking-wide">{schoolSettings.schoolName}</h4>
                              <p className="text-[9px] text-blue-400 uppercase tracking-widest font-normal mt-0.5">Kabupaten Serang</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-normal px-3 py-1 bg-white/5 border border-white/10 rounded-full text-gray-300">KARTU PELAJAR</span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-6 py-8">
                          <div className="w-28 h-36 rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-white/10 overflow-hidden shrink-0 mx-auto flex items-center justify-center relative">
                            <User className="w-14 h-14 text-white/20" />
                            <div className="absolute bottom-2 inset-x-2 py-1 text-[9px] font-normal bg-blue-600 text-white rounded text-center">AKTIF</div>
                          </div>
                          
                          <div className="flex-1 space-y-4 text-center sm:text-left">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-normal tracking-wider mb-1">Nama Lengkap</p>
                              <h5 className="text-xl font-normal text-white">{s.name}</h5>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] text-gray-500 uppercase font-normal tracking-wider mb-1">NIS (Nomor Induk)</p>
                                <p className="font-mono text-sm font-normal text-gray-200">{s.nis}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-500 uppercase font-normal tracking-wider mb-1">Tingkat / Kelas</p>
                                <p className="text-sm font-normal text-gray-200">{s.kelas}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-6 flex flex-col items-center">
                          <p className="text-[10px] text-gray-500 font-normal uppercase tracking-widest mb-3">Barcode Scan Terintegrasi</p>
                          
                          <div className="p-3 bg-white rounded-xl shadow-lg flex flex-col items-center">
                            <div className="flex items-center justify-center gap-[2px] h-12 w-64 bg-white px-2">
                              {Array.from({ length: 32 }).map((_, i) => {
                                const widths = [1, 2, 3, 4];
                                const width = widths[Math.floor(Math.sin(i * 123) * 2 + 2)];
                                return (
                                  <div 
                                    key={i} 
                                    className="bg-black h-full" 
                                    style={{ width: `${width}px` }}
                                  />
                                );
                              })}
                            </div>
                            <span className="font-mono text-[10px] text-black font-normal mt-1.5 tracking-[6px] pl-[6px]">
                              {s.barcode}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              const now = new Date();
                              const todayStr = now.toLocaleDateString('en-CA');
                              const isAlreadyScanned = studentRecords.some(rec => rec.nis === s.nis && rec.date === todayStr);
                              if (isAlreadyScanned) {
                                playBeep('warning');
                                showNotification(`${s.name} sudah melakukan presensi hari ini.`, 'text-amber-400');
                                return;
                              }
                              playBeep('success');
                              const recordTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                              
                              const newRec = {
                                id: 'sr_' + Math.random().toString(36).substr(2, 9),
                                name: s.name,
                                nis: s.nis,
                                kelas: s.kelas,
                                time: recordTimeStr,
                                status: 'Hadir',
                                date: todayStr
                              };
                              setStudentRecords(prev => [newRec, ...prev]);
                              saveStudentRecordSync(newRec);
                              showNotification(`Kehadiran ${s.name} terabsen sukses!`, 'text-emerald-400');
                            }}
                            className="mt-6 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-normal text-white flex items-center gap-2 transition-all cursor-pointer hover:border-blue-500/30"
                          >
                            <QrCode className="w-3.5 h-3.5 text-blue-400 animate-pulse" /> Ketuk untuk Cek-In Cepat
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </motion.div>
            )}

            {activeTab === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl"></div>
                    <div className="p-2.5 bg-emerald-500/10 rounded-xl inline-flex mb-3 text-emerald-400">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-gray-500 font-normal">Guru Mengajar Aktif</p>
                    <p className="text-2xl font-normal text-white mt-1">{activeTeachersCount} / {teachers.length}</p>
                    <p className="text-[10px] text-emerald-400 mt-2 flex items-center gap-1">
                      {teachers.length > 0 ? Math.round((activeTeachersCount / teachers.length) * 100) : 0}% Kehadiran
                    </p>
                  </div>

                  {(() => {
                    const todayStr = new Date().toLocaleDateString('en-CA');
                    const todayRecords = studentRecords.filter(rec => 
                      (rec.date || '2026-06-27') === todayStr && 
                      (rec.status === 'Hadir' || rec.status === 'Terlambat')
                    );
                    const uniqueNisCount = new Set(todayRecords.map(rec => rec.nis)).size;
                    const participationPercent = students.length > 0 ? Math.round((uniqueNisCount / students.length) * 100) : 0;
                    return (
                      <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full blur-xl"></div>
                        <div className="p-2.5 bg-blue-500/10 rounded-xl inline-flex mb-3 text-blue-400">
                          <QrCode className="w-5 h-5" />
                        </div>
                        <p className="text-xs text-gray-500 font-normal">Siswa Hadir Hari Ini</p>
                        <p className="text-2xl font-normal text-white mt-1">{uniqueNisCount} / {students.length}</p>
                        <p className="text-[10px] text-blue-400 mt-2">
                          {participationPercent}% Partisipasi
                        </p>
                      </div>
                    );
                  })()}

                  <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-xl"></div>
                    <div className="p-2.5 bg-amber-500/10 rounded-xl inline-flex mb-3 text-amber-400">
                      <Coffee className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-gray-500 font-normal">Guru Cuti / Izin</p>
                    <p className="text-2xl font-normal text-white mt-1">
                      {izinRequests.filter(r => r.status === 'Disetujui').length}
                    </p>
                    <p className="text-[10px] text-amber-400 mt-2">
                      {izinRequests.filter(r => r.status === 'Pending').length} Pending Persetujuan
                    </p>
                  </div>

                  <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-xl"></div>
                    <div className="p-2.5 bg-purple-500/10 rounded-xl inline-flex mb-3 text-purple-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-gray-500 font-normal">Total Akun Terdaftar</p>
                    <p className="text-2xl font-normal text-white mt-1">
                      {teachers.length + students.length}
                    </p>
                    <p className="text-[10px] text-purple-400 mt-2">Sistem Terintegrasi</p>
                  </div>
                </div>



                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Sesi Mengajar Hari Ini */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <GraduationCap className="w-5 h-5 text-cyan-400" />
                        <h4 className="font-normal text-lg text-white">{isTeacherRole ? 'Sesi Mengajar Hari Ini' : 'Sesi Tugas & Pekerjaan Hari Ini'}</h4>
                      </div>
                      <span className="text-[11px] text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full border border-cyan-400/20 font-normal">
                        Live Update
                      </span>
                    </div>

                    <div className="space-y-4">
                      {filteredTeachingSessionsToday.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 text-sm font-normal">
                          Belum ada aktivitas sesi mengajar hari ini.
                        </div>
                      ) : (
                        filteredTeachingSessionsToday.map(session => (
                          <div key={session.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.04] transition-all duration-300">
                            <div className="flex items-start gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-normal text-xs ${
                                session.status === 'Mengajar' ? 'bg-cyan-500/10 text-cyan-400' :
                                session.status === 'Selesai' ? 'bg-emerald-500/10 text-emerald-400' :
                                'bg-gray-500/10 text-gray-400'
                              }`}>
                                {session.name.substring(0, 2)}
                              </div>
                              <div>
                                <p className="text-sm font-normal text-white">{session.name}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {isTeacherRole ? (
                                    <>Mapel: <span className="text-gray-300">{session.mapel}</span> • Kelas: <span className="text-gray-300">{session.kelas}</span></>
                                  ) : (
                                    <>Tugas: <span className="text-gray-300">{session.mapel}</span> • Lokasi: <span className="text-gray-300">{session.kelas}</span></>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] text-gray-500">
                                  <span>Rencana: {session.jam}</span>
                                  {session.timeStarted !== '-' && (
                                    <>
                                      <span className="text-gray-600">•</span>
                                      <span className="text-cyan-400/80">Mulai: {session.timeStarted}</span>
                                    </>
                                  )}
                                  {session.timeEnded !== '-' && (
                                    <>
                                      <span className="text-gray-600">•</span>
                                      <span className="text-emerald-400/80">Selesai: {session.timeEnded}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {(session.photoLink || session.photo) && (
                                <button
                                  onClick={() => setSelectedPhotoUrl(session.photoLink || session.photo || null)}
                                  className="p-1.5 bg-white/5 hover:bg-white/10 text-cyan-400 hover:text-cyan-300 rounded-lg transition-all border border-white/5 flex items-center justify-center"
                                  title="Lihat Foto Mengajar"
                                >
                                  <Camera className="w-4 h-4" />
                                </button>
                              )}
                              <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-normal border ${
                                  session.status === 'Mengajar' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
                                  session.status === 'Selesai' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                  'bg-gray-500/15 text-gray-400 border-white/10'
                                }`}>
                                  {session.status === 'Mengajar' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                                  )}
                                  {session.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Kehadiran Absensi Guru Hari Ini */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative overflow-hidden flex flex-col h-full">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                    
                    {/* Header with Title & Live Stats */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                      <div className="flex items-center gap-2.5">
                        <Activity className="w-5 h-5 text-blue-400" />
                        <div>
                          <h4 className="font-normal text-lg text-white">Kehadiran Absensi Guru Hari Ini</h4>
                          <p className="text-xs text-gray-400 mt-0.5">Live status presensi & check-in seluruh guru</p>
                        </div>
                      </div>
                      <span className="self-start sm:self-center text-[11px] text-blue-400 bg-blue-400/10 px-3 py-1 rounded-full border border-blue-400/20 font-normal">
                        {mappedTeachersToday.filter(t => t.statusType === 'hadir' || t.statusType === 'pulang').length} / {teachers.length} Hadir
                      </span>
                    </div>

                    {/* Search & Status Filters */}
                    <div className="space-y-3 mb-5">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          type="text"
                          value={teacherSearchQuery}
                          onChange={(e) => setTeacherSearchQuery(e.target.value)}
                          placeholder="Cari nama guru atau NIP..."
                          className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all font-normal"
                        />
                        {teacherSearchQuery && (
                          <button 
                            onClick={() => setTeacherSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filter Buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'semua', label: 'Semua' },
                          { id: 'hadir', label: 'Hadir' },
                          { id: 'belum', label: 'Belum Absen' },
                          { id: 'izin', label: 'Izin / Sakit' }
                        ].map(btn => (
                          <button
                            key={btn.id}
                            onClick={() => setTeacherStatusFilter(btn.id as any)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-normal transition-all cursor-pointer border ${
                              teacherStatusFilter === btn.id
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'bg-transparent text-gray-400 border-white/5 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Teachers List */}
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {filteredTeachersToday.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 text-xs font-normal">
                          Tidak ada guru yang cocok dengan filter atau pencarian.
                        </div>
                      ) : (
                        filteredTeachersToday.map(teacher => (
                          <div 
                            key={teacher.nip} 
                            className="p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.04] transition-all duration-300"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Avatar with Status Color Border */}
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-normal text-xs shrink-0 relative ${
                                teacher.statusType === 'pulang' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                teacher.statusType === 'hadir' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                teacher.statusType === 'izin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-gray-500/10 text-gray-400 border border-white/5'
                              }`}>
                                {teacher.name.substring(0, 2).toUpperCase()}
                                {/* Real-time presence pulse dot */}
                                {(teacher.statusType === 'hadir' || teacher.statusType === 'pulang') && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#05050A]"></span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-xs font-normal text-white truncate">{teacher.name}</p>
                                <p className="text-[10px] text-gray-400 font-normal truncate">
                                  NIP {teacher.nip} • <span className="text-gray-500">{teacher.mapel || 'Staff'}</span>
                                </p>
                              </div>
                            </div>

                            {/* Status Badge & Actions */}
                            <div className="flex items-center gap-2">
                              {/* Show Photo Preview if available */}
                              {teacher.photo && (
                                <button
                                  onClick={() => setSelectedPhotoUrl(teacher.photo)}
                                  className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-all border border-white/5"
                                  title="Lihat Foto Selfie"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <div className="flex flex-col items-end">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal border ${
                                  teacher.statusType === 'pulang' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                  teacher.statusType === 'hadir' && teacher.recordStatus === 'Terlambat' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                  teacher.statusType === 'hadir' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  teacher.statusType === 'izin' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                  'bg-gray-500/5 text-gray-500 border-white/5'
                                }`}>
                                  {teacher.statusType === 'hadir' && teacher.recordStatus === 'Terlambat' ? (
                                    <>
                                      <Clock className="w-2.5 h-2.5" />
                                      Terlambat
                                    </>
                                  ) : teacher.statusType === 'hadir' ? (
                                    <>
                                      <Check className="w-2.5 h-2.5" />
                                      Hadir
                                    </>
                                  ) : teacher.statusType === 'pulang' ? (
                                    <>
                                      <LogOut className="w-2.5 h-2.5" />
                                      Pulang
                                    </>
                                  ) : teacher.statusType === 'izin' ? (
                                    <>
                                      <UserMinus className="w-2.5 h-2.5" />
                                      {teacher.statusLabel}
                                    </>
                                  ) : (
                                    'Belum Absen'
                                  )}
                                </span>
                                
                                {teacher.statusType !== 'belum' && (
                                  <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] text-gray-500">
                                    <span>{teacher.recordTime}</span>
                                    {teacher.distance !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 text-gray-400">
                                          <MapPin className="w-2 h-2 text-blue-400" />
                                          {teacher.distance}m
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'izin' && (
              <motion.div
                key="izin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-normal text-white tracking-tight">Persetujuan Absen Guru (Izin / Sakit)</h3>
                    <p className="text-sm text-gray-400 mt-1">Review, setujui, atau tolak surat pengajuan izin dan dinas luar dari para guru.</p>
                  </div>
                  {izinRequests.length > 0 && (
                    <div className="shrink-0">
                      {confirmDeleteIzinRequests ? (
                        <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 p-1.5 rounded-xl">
                          <span className="text-[10px] text-rose-400 px-1 font-medium">Yakin hapus semua?</span>
                          <button 
                            onClick={handleClearIzinRequests}
                            className="px-2.5 py-1.5 bg-rose-600 text-white text-xs font-normal rounded-lg hover:bg-rose-500 transition-all cursor-pointer"
                          >
                            Ya, Hapus
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteIzinRequests(false)}
                            className="px-2.5 py-1.5 bg-white/5 text-gray-300 text-xs font-normal rounded-lg hover:bg-white/10 transition-all cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeleteIzinRequests(true)}
                          className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-normal rounded-xl hover:bg-rose-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus Semua Pengajuan
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {izinRequests.length === 0 ? (
                    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-12 text-center">
                      <Coffee className="w-12 h-12 text-gray-600 mx-auto mb-3 animate-pulse" />
                      <p className="text-gray-400 font-normal">Semua pengajuan perizinan guru telah diselesaikan.</p>
                    </div>
                  ) : (
                    izinRequests.map(req => (
                      <motion.div
                        key={req.id}
                        layoutId={`req-card-${req.id}`}
                        className="p-6 bg-white/[0.02] border border-white/10 rounded-3xl relative overflow-hidden"
                      >
                        <div className="absolute top-6 right-6">
                          <span className={`px-4 py-1.5 rounded-full text-xs font-normal uppercase tracking-wider ${
                            req.tipe === 'Sakit' ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                            req.tipe === 'Izin' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                            'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                          }`}>
                            {req.tipe}
                          </span>
                        </div>

                        <div className="flex flex-col md:flex-row items-start gap-5">
                          <div className="p-3.5 bg-white/5 rounded-2xl text-gray-300">
                            <FileText className="w-8 h-8" />
                          </div>
                          
                          <div className="flex-1 space-y-4">
                            <div>
                              <h4 className="font-normal text-lg text-white">{req.name}</h4>
                              <p className="text-xs font-mono text-gray-400">NIP: {req.nip}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 max-w-md bg-white/[0.01] p-3 rounded-2xl border border-white/5">
                              <div>
                                <span className="text-[10px] uppercase font-normal text-gray-500">Tanggal Mulai</span>
                                <p className="text-xs font-normal text-gray-300 mt-0.5">{req.tanggalMulai}</p>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-normal text-gray-500">Tanggal Selesai</span>
                                <p className="text-xs font-normal text-gray-300 mt-0.5">{req.tanggalSelesai}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-[10px] uppercase font-normal text-gray-500 block">Alasan Pengajuan</span>
                              <p className="text-sm text-gray-300 leading-relaxed bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                "{req.alasan}"
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/5">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] uppercase font-normal text-gray-500">Status:</span>
                                  <span className={`px-3 py-1 text-xs font-normal rounded-lg ${
                                    req.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' :
                                    req.status === 'Disetujui' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                                    'bg-red-500/10 text-red-400 border border-red-500/10'
                                  } border`}>
                                    {req.status}
                                  </span>
                                </div>

                                {(req.attachmentDriveLink || req.attachment) && (
                                  <button
                                    onClick={() => setSelectedPhotoUrl(req.attachmentDriveLink || req.attachment)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 text-xs font-normal rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
                                    title="Lihat Dokumen Surat Izin"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Lihat Lampiran</span>
                                  </button>
                                )}
                              </div>

                              {req.status === 'Pending' && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setIzinRequests(prev => prev.map(p => p.id === req.id ? { ...p, status: 'Ditolak' } : p));
                                      saveIzinRequestSync({ ...req, status: 'Ditolak' });
                                      showNotification(`Pengajuan ${req.name} ditolak.`, 'text-red-400');
                                    }}
                                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-normal rounded-xl border border-red-500/20 transition-all cursor-pointer"
                                  >
                                    Tolak
                                  </button>
                                  <button
                                    onClick={() => {
                                      setIzinRequests(prev => prev.map(p => p.id === req.id ? { ...p, status: 'Disetujui' } : p));
                                      saveIzinRequestSync({ ...req, status: 'Disetujui' });
                                      showNotification(`Pengajuan ${req.name} disetujui!`, 'text-emerald-400');
                                    }}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#05050A] text-xs font-normal rounded-xl transition-all cursor-pointer"
                                  >
                                    Setujui Izin
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'users' && (
              <motion.div
                key="users"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Guru */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-normal text-lg text-white flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-emerald-400" /> Direktori Guru ({teachers.length})
                      </h4>
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          accept=".csv" 
                          className="hidden" 
                          ref={fileInputGuruRef}
                          onChange={handleFileUploadGuru}
                        />
                        <button
                          onClick={() => fileInputGuruRef.current?.click()}
                          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal text-xs rounded-lg flex items-center gap-1 hover:bg-emerald-500/20 transition-all cursor-pointer"
                          title="Upload Data Guru dari CSV"
                        >
                          <Upload className="w-3.5 h-3.5" /> Upload Data
                        </button>
                        <button
                          onClick={() => {
                            setNewTeacherName('');
                            setNewTeacherNip('');
                            setNewTeacherMapel('');
                            setShowAddTeacherModal(true);
                          }}
                          className="px-3 py-1.5 bg-emerald-500 text-black font-normal text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tambah Guru
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Cari guru..."
                          value={searchGuruQuery}
                          onChange={(e) => setSearchGuruQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-[#05050A] border border-white/5 rounded-xl text-xs text-white outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div className="relative">
                        <select
                          value={filterGuruMapel}
                          onChange={(e) => setFilterGuruMapel(e.target.value)}
                          className="w-full appearance-none pl-4 pr-10 py-2.5 bg-[#05050A] border border-white/5 rounded-xl text-xs text-white outline-none focus:border-emerald-500/50"
                        >
                          <option value="">Semua Mata Pelajaran</option>
                          {Array.from(new Set(teachers.map(t => t.mapel))).filter(Boolean).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 px-1 mb-2">
                      <span>Daftar Guru</span>
                      <button 
                        onClick={() => {
                          const csvContent = "Nama,NIP,Mapel,Jabatan,Status\nTb. Saiful Bahri S.Pd,198501142010011002,Matematika,Guru Mapel,Aktif\nDr. H. Ahmad Fauzi M.Pd,197403152000031001,-,Kepala Sekolah,Aktif\nAndi Wijaya,199208102020011005,Administrasi,Operator Sekolah,Aktif\nSiti Rahmah,198812052015032002,-,Admin,Aktif\nKarsa,198004122008011003,-,Pegawai Kebersihan,Aktif\n";
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = 'Template_Upload_Pegawai.csv';
                          link.click();
                          showNotification('Template CSV Pegawai & Guru berhasil diunduh!', 'text-emerald-400');
                        }}
                        className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none transition-colors"
                      >
                        <Download className="w-3 h-3" /> Unduh Template CSV
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                      {teachers
                        .filter(t => {
                          const matchQuery = t.name.toLowerCase().includes(searchGuruQuery.toLowerCase()) || t.nip.includes(searchGuruQuery);
                          const matchMapel = !filterGuruMapel || t.mapel === filterGuruMapel;
                          return matchQuery && matchMapel;
                        })
                        .map((t, idx) => (
                          <div key={idx} className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.03] transition-all">
                            <div>
                              <p className="text-sm font-normal text-white">{t.name}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">NIP: {t.nip} • {t.role || 'Guru Mapel'} • Mapel: {t.mapel}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingTeacher(t);
                                  setShowEditTeacherModal(true);
                                }}
                                className="p-2 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all cursor-pointer"
                                title="Edit Data Guru"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setTeacherToDelete(t);
                                }}
                                className="p-2 text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                                title="Hapus Guru"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Right Column: Siswa */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-normal text-lg text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-400" /> Roster Siswa ({students.length})
                      </h4>
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          accept=".csv" 
                          className="hidden" 
                          ref={fileInputSiswaRef}
                          onChange={handleFileUploadSiswa}
                        />
                        <button
                          onClick={() => fileInputSiswaRef.current?.click()}
                          className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-normal text-xs rounded-lg flex items-center gap-1 hover:bg-blue-500/20 transition-all cursor-pointer"
                          title="Upload Data Siswa dari CSV"
                        >
                          <Upload className="w-3.5 h-3.5" /> Upload Data
                        </button>
                        <button
                          onClick={() => {
                            setNewStudentName('');
                            setNewStudentNis('');
                            setNewStudentKelas('');
                            setShowAddStudentModal(true);
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white font-normal text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Tambah Siswa
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Cari siswa..."
                          value={searchSiswaQuery}
                          onChange={(e) => setSearchSiswaQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-[#05050A] border border-white/5 rounded-xl text-xs text-white outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="relative">
                        <select
                          value={filterSiswaKelas}
                          onChange={(e) => setFilterSiswaKelas(e.target.value)}
                          className="w-full appearance-none pl-4 pr-10 py-2.5 bg-[#05050A] border border-white/5 rounded-xl text-xs text-white outline-none focus:border-blue-500/50"
                        >
                          <option value="">Semua Kelas</option>
                          {Array.from(new Set(students.map(s => s.kelas))).filter(Boolean).map(k => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 px-1 mb-2">
                      <span>Daftar Roster</span>
                      <button 
                        onClick={() => {
                          const csvContent = "Nama,NIS,Kelas\n";
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = 'Template_Upload_Siswa.csv';
                          link.click();
                          showNotification('Template CSV Siswa berhasil diunduh!', 'text-blue-400');
                        }}
                        className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none transition-colors"
                      >
                        <Download className="w-3 h-3" /> Unduh Template CSV
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                      {students
                        .filter(s => {
                          const matchQuery = s.name.toLowerCase().includes(searchSiswaQuery.toLowerCase()) || s.nis.includes(searchSiswaQuery);
                          const matchKelas = !filterSiswaKelas || s.kelas === filterSiswaKelas;
                          return matchQuery && matchKelas;
                        })
                        .map((s, idx) => (
                          <div key={idx} className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.03] transition-all">
                            <div>
                              <p className="text-sm font-normal text-white">{s.name}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">NIS: {s.nis} • Kelas {s.kelas}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingStudent(s);
                                  setShowEditStudentModal(true);
                                }}
                                className="p-2 text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all cursor-pointer"
                                title="Edit Data Siswa"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setStudentToDelete(s);
                                }}
                                className="p-2 text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                                title="Hapus Siswa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>


              </motion.div>
            )}

            {activeTab === 'academic-calendar' && (
              <motion.div
                key="academic-calendar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl -z-10"></div>
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                      <h3 className="text-xl font-normal text-white">Kelola Hari Libur</h3>
                      <p className="text-sm text-gray-400 mt-1">Tambahkan tanggal merah atau kegiatan khusus sekolah yang meliburkan absensi.</p>
                    </div>
                  </div>

                  <form className="bg-white/5 border border-white/10 p-5 rounded-2xl mb-8 flex flex-col md:flex-row gap-4 items-end" onSubmit={async (e) => {
                    e.preventDefault();
                    if(!newHolidayDate || !newHolidayName) return;
                    const newHoliday = {
                      id: String(Date.now()),
                      date: newHolidayDate,
                      name: newHolidayName
                    };
                    await saveHolidaySync(newHoliday);
                    setHolidays(prev => [...prev, newHoliday].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
                    setNewHolidayDate('');
                    setNewHolidayName('');
                    showNotification('Hari libur berhasil ditambahkan!', 'text-emerald-400');
                  }}>
                    <div className="w-full md:w-1/3">
                      <label className="text-xs text-gray-400 ml-1 mb-1 block">Tanggal Libur</label>
                      <input 
                        type="date"
                        value={newHolidayDate}
                        onChange={(e) => setNewHolidayDate(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
                        required
                      />
                    </div>
                    <div className="w-full md:flex-1">
                      <label className="text-xs text-gray-400 ml-1 mb-1 block">Keterangan / Nama Libur</label>
                      <input 
                        type="text"
                        value={newHolidayName}
                        onChange={(e) => setNewHolidayName(e.target.value)}
                        placeholder="Contoh: Idul Fitri, Libur Semester"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500/50"
                        required
                      />
                    </div>
                    <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-sm hover:bg-rose-500/30 transition-colors flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> Tambah
                    </button>
                  </form>

                  <div className="space-y-3">
                    {holidays.length === 0 ? (
                      <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5">
                        <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 font-normal">Belum ada hari libur yang ditambahkan.</p>
                      </div>
                    ) : (
                      holidays.map(holiday => (
                        <div key={holiday.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400 font-medium">
                              {new Date(holiday.date).getDate()}
                            </div>
                            <div>
                              <div className="text-white font-normal">{holiday.name}</div>
                              <div className="text-xs text-gray-400">
                                {new Date(holiday.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if(window.confirm('Hapus hari libur ini?')) {
                                await deleteHolidaySync(holiday.id);
                                setHolidays(prev => prev.filter(h => h.id !== holiday.id));
                                showNotification('Hari libur dihapus.', 'text-rose-400');
                              }
                            }}
                            className="p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Profil Sekolah */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 lg:col-span-2">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-slate-500/10 flex items-center justify-center">
                        <Building className="w-6 h-6 text-slate-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Profil Sekolah</h3>
                        <p className="text-sm text-gray-400 mt-1">Kelola informasi identitas institusi.</p>
                      </div>
                    </div>

                    <form className="space-y-5" onSubmit={(e) => {
                      e.preventDefault();
                      const cleanedNip = cleanNipOrNis(schoolSettings.headmasterNip);
                      const updated = { ...schoolSettings, headmasterNip: cleanedNip };
                      setSchoolSettings(updated);
                      saveSystemSettingsSync(updated);
                      showNotification('Pengaturan sistem berhasil disimpan!', 'text-emerald-400');
                    }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">Nama Sekolah</label>
                          <input 
                            type="text" 
                            value={schoolSettings.schoolName}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, schoolName: e.target.value}))}
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-slate-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">Tahun Ajaran Aktif</label>
                          <input 
                            type="text" 
                            value={schoolSettings.academicYear}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, academicYear: e.target.value}))}
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-slate-500/50"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">Nama Kepala Sekolah</label>
                          <input 
                            type="text" 
                            value={schoolSettings.headmasterName}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, headmasterName: e.target.value}))}
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-slate-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">NIP Kepala Sekolah</label>
                          <input 
                            type="text" 
                            value={schoolSettings.headmasterNip}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, headmasterNip: e.target.value}))}
                            onBlur={(e) => setSchoolSettings(prev => ({...prev, headmasterNip: cleanNipOrNis(e.target.value)}))}
                            placeholder="196503121989021003"
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-slate-500/50 font-mono"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs text-gray-400 ml-1">Alamat Sekolah</label>
                        <input 
                          type="text" 
                          value={schoolSettings.schoolAddress}
                          onChange={(e) => setSchoolSettings(prev => ({...prev, schoolAddress: e.target.value}))}
                          className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-slate-500/50"
                        />
                      </div>

                      <button type="submit" className="w-full py-3 bg-emerald-500 text-black font-medium rounded-xl text-sm">Simpan Perubahan</button>
                    </form>
                  </div>

                  {/* Pengaturan Jam Kerja */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Pengaturan Jam Kerja</h3>
                        <p className="text-sm text-gray-400 mt-1">Batas waktu absensi harian.</p>
                      </div>
                    </div>

                    <form className="space-y-5" onSubmit={(e) => {
                      e.preventDefault();
                      const cleaned = cleanWorkDaysOrSettings(schoolSettings);
                      setSchoolSettings(cleaned);
                      saveSystemSettingsSync(cleaned);
                      showNotification('Pengaturan jam kerja berhasil disimpan!', 'text-emerald-400');
                    }}>
                      <div className="space-y-2">
                        <label className="text-xs text-gray-400 ml-1">Toleransi Keterlambatan (Menit)</label>
                        <input 
                          type="number" 
                          value={schoolSettings.lateTolerance}
                          onChange={(e) => setSchoolSettings(prev => ({...prev, lateTolerance: parseInt(e.target.value) || 0}))}
                          min="0"
                          className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-blue-500/50"
                        />
                        <p className="text-[10px] text-gray-500 ml-1 mt-1">Siswa/Guru dianggap terlambat jika absen melebihi batas jam masuk + toleransi.</p>
                      </div>

                      <div className="mt-6 space-y-4">
                        <label className="text-sm text-gray-300 font-medium ml-1">Jadwal Per Hari</label>
                        <div className="space-y-2">
                          {[
                            { id: 1, name: 'Senin' },
                            { id: 2, name: 'Selasa' },
                            { id: 3, name: 'Rabu' },
                            { id: 4, name: 'Kamis' },
                            { id: 5, name: 'Jumat' },
                            { id: 6, name: 'Sabtu' }
                          ].map(day => (
                            <div key={day.id} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-[#05050A] border border-white/5 p-3 rounded-xl">
                              <div className="text-sm text-gray-400 font-medium md:pl-2">{day.name}</div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">Jam Masuk</label>
                                <input 
                                  type="time" 
                                  value={cleanTimeString(schoolSettings.daySchedules?.[day.id as keyof typeof schoolSettings.daySchedules]?.entryLimit || schoolSettings.workDays?.[day.id as keyof typeof schoolSettings.workDays]?.entryLimit || schoolSettings.entryLimit || '07:00')}
                                  onChange={(e) => {
                                    const newSchedules = { ...(schoolSettings.daySchedules || {}) };
                                    if (!newSchedules[day.id as keyof typeof schoolSettings.daySchedules]) {
                                      // @ts-ignore
                                      newSchedules[day.id as keyof typeof schoolSettings.daySchedules] = { entryLimit: schoolSettings.entryLimit, exitLimit: schoolSettings.exitLimit, lateTolerance: schoolSettings.lateTolerance };
                                    }
                                    // @ts-ignore
                                    newSchedules[day.id as keyof typeof schoolSettings.daySchedules].entryLimit = cleanTimeString(e.target.value);
                                    setSchoolSettings(prev => ({ ...prev, daySchedules: newSchedules as any }));
                                  }}
                                  className="w-full px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-500">Jam Pulang</label>
                                <input 
                                  type="time" 
                                  value={cleanTimeString(schoolSettings.daySchedules?.[day.id as keyof typeof schoolSettings.daySchedules]?.exitLimit || schoolSettings.workDays?.[day.id as keyof typeof schoolSettings.workDays]?.exitLimit || schoolSettings.exitLimit || '15:00')}
                                  onChange={(e) => {
                                    const newSchedules = { ...(schoolSettings.daySchedules || {}) };
                                    if (!newSchedules[day.id as keyof typeof schoolSettings.daySchedules]) {
                                      // @ts-ignore
                                      newSchedules[day.id as keyof typeof schoolSettings.daySchedules] = { entryLimit: schoolSettings.entryLimit, exitLimit: schoolSettings.exitLimit, lateTolerance: schoolSettings.lateTolerance };
                                    }
                                    // @ts-ignore
                                    newSchedules[day.id as keyof typeof schoolSettings.daySchedules].exitLimit = cleanTimeString(e.target.value);
                                    setSchoolSettings(prev => ({ ...prev, daySchedules: newSchedules as any }));
                                  }}
                                  className="w-full px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2">
                        <button 
                          type="submit"
                          className="w-full py-3.5 bg-blue-500/10 text-blue-400 font-medium rounded-xl hover:bg-blue-500/20 border border-blue-500/20 transition-colors cursor-pointer"
                        >
                          Simpan Jam Kerja
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Pengaturan Geofencing */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Lokasi & Geofencing</h3>
                        <p className="text-sm text-gray-400 mt-1">Koordinat dan radius absensi.</p>
                      </div>
                    </div>

                    <form className="space-y-5" onSubmit={(e) => {
                      e.preventDefault();
                      const cleanedLat = cleanCoordinate(schoolSettings.latitude, 'lat');
                      const cleanedLng = cleanCoordinate(schoolSettings.longitude, 'lng');
                      const updated = {
                        ...schoolSettings,
                        latitude: cleanedLat,
                        longitude: cleanedLng
                      };
                      setSchoolSettings(updated);
                      saveSystemSettingsSync(updated);
                      showNotification('Pengaturan lokasi berhasil disimpan!', 'text-emerald-400');
                    }}>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">Latitude</label>
                          <input 
                            type="text" 
                            value={schoolSettings.latitude}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, latitude: e.target.value}))}
                            onBlur={(e) => setSchoolSettings(prev => ({...prev, latitude: cleanCoordinate(e.target.value, 'lat')}))}
                            placeholder="-6.114196248039070"
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-amber-500/50 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">Longitude</label>
                          <input 
                            type="text" 
                            value={schoolSettings.longitude}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, longitude: e.target.value}))}
                            onBlur={(e) => setSchoolSettings(prev => ({...prev, longitude: cleanCoordinate(e.target.value, 'lng')}))}
                            placeholder="106.2276108127060"
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-amber-500/50 font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-gray-400 ml-1">Radius Maksimal (Meter)</label>
                        <input 
                          type="number" 
                          value={schoolSettings.maxRadius}
                          onChange={(e) => setSchoolSettings(prev => ({...prev, maxRadius: parseInt(e.target.value) || 0}))}
                          min="10"
                          className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-amber-500/50"
                        />
                        <p className="text-[10px] text-gray-500 ml-1 mt-1">Jarak maksimum dari titik koordinat sekolah agar bisa melakukan absensi online.</p>
                      </div>

                      <div className="pt-2">
                        <button 
                          type="submit"
                          className="w-full py-3.5 bg-amber-500/10 text-amber-400 font-medium rounded-xl hover:bg-amber-500/20 border border-amber-500/20 transition-colors cursor-pointer"
                        >
                          Simpan Geofencing
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* WhatsApp Gateway & Otomatisasi Notifikasi */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 lg:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.02] rounded-full blur-3xl"></div>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                        <Phone className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Integrasi WhatsApp Gateway</h3>
                        <p className="text-sm text-gray-400 mt-1">Kirim notifikasi otomatis secara real-time ke WhatsApp guru dan admin.</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                        <div>
                          <p className="text-sm font-medium text-white">Aktifkan WhatsApp Gateway</p>
                          <p className="text-xs text-gray-400 mt-0.5">Sistem akan otomatis mengirim pesan konfirmasi ketika guru absen atau izin.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={schoolSettings.waGatewayEnabled || false} 
                            onChange={(e) => setSchoolSettings(prev => ({...prev, waGatewayEnabled: e.target.checked}))}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                        </label>
                      </div>

                      {(schoolSettings.waGatewayEnabled || false) && (
                        <div className="space-y-5 border-t border-white/5 pt-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                              <label className="text-xs text-gray-400 ml-1">Penyedia Gateway (Provider)</label>
                              <select 
                                value={schoolSettings.waGatewayProvider || 'fonnte'}
                                onChange={(e) => setSchoolSettings(prev => ({...prev, waGatewayProvider: e.target.value}))}
                                className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-emerald-500/50 appearance-none"
                              >
                                <option value="fonnte">Fonnte (Rekomendasi - fonnte.com)</option>
                                <option value="wablas">Wablas (wablas.com)</option>
                                <option value="starsender">Starsender (starsender.id)</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-gray-400 ml-1">API Token / Auth Key</label>
                              <input 
                                type="text" 
                                placeholder="Masukkan Token API Gateway Anda"
                                value={schoolSettings.waGatewayToken || ''}
                                onChange={(e) => setSchoolSettings(prev => ({...prev, waGatewayToken: e.target.value}))}
                                className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-emerald-500/50"
                              />
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-5 space-y-4">
                            <h4 className="text-sm font-medium text-white">Notifikasi Salinan Admin (Laporan Real-time)</h4>
                            
                            <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                              <div>
                                <p className="text-xs font-medium text-white">Kirim Laporan Semua Kehadiran ke Nomor Admin</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Setiap kali guru melakukan absen datang/pulang/mengajar, admin juga akan menerima laporannya.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={schoolSettings.waAdminNotificationsEnabled || false} 
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waAdminNotificationsEnabled: e.target.checked}))}
                                  className="sr-only peer" 
                                />
                                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                              </label>
                            </div>

                            {(schoolSettings.waAdminNotificationsEnabled || false) && (
                              <div className="space-y-2">
                                <label className="text-xs text-gray-400 ml-1">Nomor WhatsApp Admin</label>
                                <input 
                                  type="text" 
                                  placeholder="Contoh: 08123456789"
                                  value={schoolSettings.waAdminNumber || ''}
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waAdminNumber: e.target.value}))}
                                  className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-emerald-500/50"
                                />
                              </div>
                            )}
                          </div>

                          <div className="border-t border-white/5 pt-5 space-y-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              <h4 className="text-sm font-medium text-white">Kustomisasi Template Pesan WhatsApp</h4>
                            </div>
                            <p className="text-xs text-gray-400">Gunakan tag variabel di dalam kurung kurawal <code className="text-emerald-400 font-mono">{"{...}"}</code> agar informasi diisi secara otomatis.</p>
                            
                            <div className="space-y-4 pt-2">
                              <div className="space-y-2">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                                  <label className="text-xs text-gray-300 font-medium">Template Absen Datang (Guru)</label>
                                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded">Variabel: {"{nama}"}, {"{tanggal}"}, {"{waktu}"}, {"{jarak}"}, {"{nama_sekolah}"}</span>
                                </div>
                                <textarea
                                  rows={4}
                                  value={schoolSettings.waTemplateDatang || ''}
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waTemplateDatang: e.target.value}))}
                                  className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-xs text-gray-200 outline-none focus:border-emerald-500/50 font-mono leading-relaxed"
                                  placeholder="Tulis format pesan untuk absen datang di sini..."
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                                  <label className="text-xs text-gray-300 font-medium">Template Absen Pulang (Guru)</label>
                                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded">Variabel: {"{nama}"}, {"{tanggal}"}, {"{waktu}"}, {"{nama_sekolah}"}</span>
                                </div>
                                <textarea
                                  rows={4}
                                  value={schoolSettings.waTemplatePulang || ''}
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waTemplatePulang: e.target.value}))}
                                  className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-xs text-gray-200 outline-none focus:border-emerald-500/50 font-mono leading-relaxed"
                                  placeholder="Tulis format pesan untuk absen pulang di sini..."
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                                  <label className="text-xs text-gray-300 font-medium">Template Pengajuan Izin (Guru)</label>
                                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded">Variabel: {"{nama}"}, {"{jenis_izin}"}, {"{tanggal}"}, {"{waktu}"}, {"{izin_mulai}"}, {"{izin_selesai}"}, {"{alasan}"}, {"{nama_sekolah}"}</span>
                                </div>
                                <textarea
                                  rows={5}
                                  value={schoolSettings.waTemplateIzin || ''}
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waTemplateIzin: e.target.value}))}
                                  className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-xs text-gray-200 outline-none focus:border-emerald-500/50 font-mono leading-relaxed"
                                  placeholder="Tulis format pesan untuk pengajuan izin di sini..."
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                                  <label className="text-xs text-gray-300 font-medium">Template Salinan Kehadiran (Admin)</label>
                                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded">Variabel: {"{nama}"}, {"{nip}"}, {"{aktivitas}"}, {"{tanggal}"}, {"{waktu}"}, {"{detail}"}, {"{nama_sekolah}"}</span>
                                </div>
                                <textarea
                                  rows={4}
                                  value={schoolSettings.waTemplateAdmin || ''}
                                  onChange={(e) => setSchoolSettings(prev => ({...prev, waTemplateAdmin: e.target.value}))}
                                  className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-xs text-gray-200 outline-none focus:border-emerald-500/50 font-mono leading-relaxed"
                                  placeholder="Tulis format pesan untuk salinan admin di sini..."
                                />
                              </div>
                            </div>
                          </div>

                          {/* Uji Coba Kirim WA */}
                          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 mt-4 space-y-3">
                            <h5 className="text-xs font-medium text-emerald-400">Uji Coba Pengiriman Notifikasi</h5>
                            <p className="text-[11px] text-gray-400">Masukkan nomor WhatsApp aktif Anda untuk menguji apakah integrasi gateway sudah terhubung dengan benar.</p>
                            <div className="flex gap-2">
                              <input 
                                id="testWaNumberInput"
                                type="text" 
                                placeholder="Contoh: 08123456789"
                                className="flex-1 px-3 py-2 bg-[#05050A] border border-white/10 rounded-xl text-xs text-white outline-none focus:border-emerald-500/50"
                              />
                              <button 
                                type="button"
                                onClick={async () => {
                                  const numInput = document.getElementById('testWaNumberInput') as HTMLInputElement;
                                  const num = numInput?.value?.trim();
                                  if (!num) {
                                    showNotification('Masukkan nomor untuk tes!', 'text-amber-400');
                                    return;
                                  }
                                  showNotification('Sedang mengirim tes...', 'text-white');
                                  const textMsg = `🧪 *TES KONEKSI GATEWAY WHATSAPP*\n\n` +
                                    `Halo! Notifikasi ini dikirim dari Aplikasi Absensi *${schoolSettings.schoolName}*.\n` +
                                    `Koneksi dengan server WhatsApp Gateway (${(schoolSettings.waGatewayProvider || 'fonnte').toUpperCase()}) berhasil terhubung dengan sukses!\n\n` +
                                    `Waktu Tes: ${new Date().toLocaleTimeString('id-ID')}`;
                                  const ok = await sendWhatsAppNotification(num, textMsg);
                                  if (ok) {
                                    showNotification('Pesan uji coba berhasil dikirim!', 'text-emerald-400');
                                  }
                                }}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl text-xs font-medium cursor-pointer transition-colors"
                              >
                                Kirim Tes WA
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="pt-2">
                        <button 
                          onClick={() => {
                            saveSystemSettingsSync(schoolSettings);
                            showNotification('Pengaturan WhatsApp Gateway berhasil disimpan!', 'text-emerald-400');
                          }}
                          className="w-full py-3.5 bg-emerald-500/10 text-emerald-400 font-medium rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
                        >
                          Simpan Konfigurasi WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Integrasi Google Spreadsheet & Apps Script */}
                  <div id="google-sheets-integration" className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 lg:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/[0.02] rounded-full blur-3xl"></div>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Integrasi Google Spreadsheet (GAS)</h3>
                        <p className="text-sm text-gray-400 mt-1">Gunakan Google Sheets sebagai basis data awan Anda menggantikan Firebase.</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="p-4 bg-[#05050A] border border-white/5 rounded-2xl space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-3">
                          <div>
                            <span className="text-xs text-gray-400">Status Sinkronisasi</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {schoolSettings.appsScriptUrl ? (
                                <>
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-sm text-emerald-400 font-medium">Terkoneksi ke Google Sheets</span>
                                </>
                              ) : (
                                <>
                                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                  <span className="text-sm text-amber-400 font-medium">Mode Lokal (Local Cache / Offline)</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 self-start md:self-auto w-full md:w-auto">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!schoolSettings.appsScriptUrl) {
                                  showNotification('Harap masukkan URL Google Apps Script terlebih dahulu!', 'text-amber-400');
                                  return;
                                }
                                showNotification('Sedang mensinkronisasikan seluruh data...', 'text-white');
                                localStorage.setItem('appsScriptUrl', schoolSettings.appsScriptUrl);
                                const ok = await initialSyncWithGoogleSheets();
                                if (ok) {
                                  showNotification('Sinkronisasi penuh Google Sheets BERHASIL! Me-refresh halaman...', 'text-emerald-400');
                                  setTimeout(() => window.location.reload(), 1500);
                                } else {
                                  showNotification('Gagal terhubung ke Google Apps Script. Periksa kembali URL Anda.', 'text-rose-400');
                                }
                              }}
                              className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-2"
                              title="Ambil data dari Google Sheets untuk mengganti data di aplikasi ini"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Ambil Data Cloud
                            </button>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                if (!schoolSettings.appsScriptUrl) {
                                  showNotification('Harap masukkan URL Google Apps Script terlebih dahulu!', 'text-amber-400');
                                  return;
                                }
                                if (!window.confirm('Tindakan ini akan mengunggah seluruh data lokal (Guru, Siswa, Riwayat Absensi, dll.) ke Google Sheets Anda dan akan menimpa data di sana. Lanjutkan?')) {
                                  return;
                                }
                                showNotification('Sedang mengunggah seluruh data ke Google Sheets...', 'text-white');
                                localStorage.setItem('appsScriptUrl', schoolSettings.appsScriptUrl);
                                const ok = await uploadAllLocalDataToGoogleSheets({
                                  teachers,
                                  students,
                                  studentRecords,
                                  teachingSessions: teachingSessionsToday,
                                  izinRequests,
                                  teachingSchedule,
                                  attendanceRecords: records,
                                  holidays,
                                  piketSchedule,
                                  classSubstitutions,
                                  systemSettings: schoolSettings
                                });
                                if (ok) {
                                  showNotification('Unggah seluruh data ke Google Sheets BERHASIL!', 'text-emerald-400');
                                } else {
                                  showNotification('Gagal mengunggah data ke Google Sheets. Periksa kembali URL Anda.', 'text-rose-400');
                                }
                              }}
                              className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-2"
                              title="Unggah semua data yang ada di aplikasi ini ke Google Sheets Anda"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Unggah Data Lokal ke Cloud
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs text-gray-400 ml-1">URL Google Apps Script Web App</label>
                          <input 
                            type="text" 
                            placeholder="https://script.google.com/macros/s/.../exec"
                            value={schoolSettings.appsScriptUrl || ''}
                            onChange={(e) => setSchoolSettings(prev => ({...prev, appsScriptUrl: e.target.value.trim()}))}
                            className="w-full px-4 py-3 bg-[#05050A] border border-white/10 rounded-xl text-sm text-white outline-none focus:border-blue-500/50"
                          />
                          <p className="text-[10px] text-gray-500 ml-1 mt-1">Masukkan URL Aplikasi Web yang Anda peroleh setelah melakukan "Deploy" / "Penerapan Baru" sebagai Web App di Google Apps Script.</p>
                        </div>
                      </div>

                      {/* COPYABLE GOOGLE APPS SCRIPT CODE */}
                      <div className="bg-[#05050A] border border-white/5 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-medium text-white uppercase tracking-wider">Kode Google Apps Script</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5">Salin kode ini ke editor Google Apps Script di Google Sheets Anda.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const code = getGoogleAppsScriptCode();
                              navigator.clipboard.writeText(code);
                              showNotification('Kode Apps Script berhasil disalin ke clipboard!', 'text-emerald-400');
                            }}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-gray-300 rounded-lg cursor-pointer transition-all"
                          >
                            Salin Kode
                          </button>
                        </div>

                        <div className="bg-[#020204] border border-white/5 rounded-xl p-3 max-h-48 overflow-y-auto">
                          <pre className="text-[9px] text-gray-400 font-mono leading-relaxed select-all">
                            {getGoogleAppsScriptCode()}
                          </pre>
                        </div>

                        <div className="text-[11px] text-gray-400 space-y-2 leading-relaxed bg-blue-500/5 border border-blue-500/10 p-3 rounded-xl">
                          <p className="font-medium text-blue-400">📋 Langkah-Langkah Pemasangan:</p>
                          <ol className="list-decimal list-inside space-y-1 text-gray-300">
                            <li>Buat lembar bentang baru di <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Google Sheets</a>.</li>
                            <li>Buka menu <span className="font-semibold text-white">Ekstensi (Extensions)</span> &gt; <span className="font-semibold text-white">Apps Script</span>.</li>
                            <li>Hapus semua kode bawaan, lalu <span className="font-semibold text-white">Tempel (Paste)</span> kode di atas.</li>
                            <li>Klik tombol <span className="font-semibold text-white">Simpan (Save)</span> (ikon disket).</li>
                            <li>Klik tombol <span className="font-semibold text-white">Terapkan (Deploy)</span> &gt; <span className="font-semibold text-white">Penerapan baru (New deployment)</span>.</li>
                            <li>Pilih jenis <span className="font-semibold text-white">Aplikasi web (Web app)</span>. Isikan Deskripsi, Jalankan sebagai <span className="font-semibold text-white">Saya (Me)</span>, dan akses ke <span className="font-semibold text-white">Siapa saja (Anyone)</span>.</li>
                            <li>Klik <span className="font-semibold text-white">Terapkan</span>, setujui izin akun Google Anda, lalu salin URL Web App yang muncul.</li>
                            <li>Tempelkan URL tersebut ke kolom di atas dan klik tombol <span className="font-semibold text-white">Simpan Semua Pengaturan</span>.</li>
                          </ol>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button 
                          onClick={() => {
                            saveSystemSettingsSync(schoolSettings);
                            showNotification('Pengaturan Google Sheets berhasil disimpan!', 'text-emerald-400');
                          }}
                          className="w-full py-3.5 bg-blue-500/10 text-blue-400 font-medium rounded-xl hover:bg-blue-500/20 border border-blue-500/20 transition-colors cursor-pointer"
                        >
                          Simpan Semua Pengaturan Google Sheets
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pembersihan & Manajemen Data */}
                  <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 lg:col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/[0.02] rounded-full blur-3xl"></div>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                        <Trash2 className="w-6 h-6 text-rose-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-normal text-white">Pemeliharaan & Pembersihan Data</h3>
                        <p className="text-sm text-gray-400 mt-1">Kelola dan bersihkan data transaksi sistem untuk memulai periode baru.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Section 1: Data Absensi Guru */}
                      <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                            Data Absensi Guru (Analisis)
                          </h4>
                          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                            Menghapus seluruh riwayat absensi guru harian (Absen Datang/Pulang/Sakit/Izin) yang tersimpan di basis data. Tindakan ini akan mengosongkan statistik kehadiran guru pada tab Analisis Data.
                          </p>
                        </div>
                        <div className="mt-5">
                          {confirmDeleteTeacherRecords ? (
                            <div className="flex items-center gap-2 w-full">
                              <button 
                                onClick={handleClearTeacherRecords}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95"
                              >
                                Ya, Hapus Sekarang
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteTeacherRecords(false)}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteTeacherRecords(true)}
                              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium rounded-xl transition-all cursor-pointer"
                            >
                              Hapus Semua Absensi Guru
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Section 2: Sesi Mengajar Hari Ini */}
                      <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            Sesi Mengajar & Tugas Guru
                          </h4>
                          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                            Mengosongkan daftar riwayat sesi mengajar aktif dan tugas harian para guru untuk hari ini. Tindakan ini akan mereset tampilan aktivitas live sesi mengajar guru.
                          </p>
                        </div>
                        <div className="mt-5">
                          {confirmDeleteSessions ? (
                            <div className="flex items-center gap-2 w-full">
                              <button 
                                onClick={handleClearSessions}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95"
                              >
                                Ya, Kosongkan Sesi
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteSessions(false)}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteSessions(true)}
                              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium rounded-xl transition-all cursor-pointer"
                            >
                              Kosongkan Sesi Mengajar Hari Ini
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Section 3: Presensi Barcode Siswa */}
                      <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            Data Presensi Barcode Siswa
                          </h4>
                          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                            Menghapus seluruh riwayat pemindaian barcode presensi kelas siswa. Tindakan ini akan mengosongkan statistik partisipasi kehadiran siswa pada tab Analisis Data.
                          </p>
                        </div>
                        <div className="mt-5">
                          {confirmDeleteStudentRecords ? (
                            <div className="flex items-center gap-2 w-full">
                              <button 
                                onClick={handleClearStudentRecords}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95"
                              >
                                Ya, Hapus Sekarang
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteStudentRecords(false)}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteStudentRecords(true)}
                              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium rounded-xl transition-all cursor-pointer"
                            >
                              Hapus Semua Presensi Siswa
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Section 4: Surat Pengajuan Izin */}
                      <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Data Persetujuan Izin & Sakit
                          </h4>
                          <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                            Menghapus seluruh surat pengajuan izin, sakit, dan dinas dari para guru. Tindakan ini akan membersihkan antrean persetujuan pada tab Persetujuan Izin.
                          </p>
                        </div>
                        <div className="mt-5">
                          {confirmDeleteIzinRequests ? (
                            <div className="flex items-center gap-2 w-full">
                              <button 
                                onClick={handleClearIzinRequests}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95"
                              >
                                Ya, Hapus Sekarang
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteIzinRequests(false)}
                                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmDeleteIzinRequests(true)}
                              className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium rounded-xl transition-all cursor-pointer"
                            >
                              Hapus Semua Pengajuan Izin
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Section 5: Reset Total (Full-width inside section) */}
                      <div className="md:col-span-2 p-6 rounded-2xl bg-rose-500/[0.02] border border-rose-500/10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-rose-400 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                              Reset Seluruh Data Transaksi Aktivitas
                            </h4>
                            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                              Tindakan ini akan menghapus sekaligus seluruh data Absensi Guru, Sesi Mengajar, Presensi Siswa, dan Pengajuan Izin. Data direktori Master Guru dan Siswa tidak akan terhapus.
                            </p>
                          </div>
                          <div className="min-w-[200px]">
                            {confirmResetAll ? (
                              <div className="flex items-center gap-2 w-full">
                                <button 
                                  onClick={handleResetAllActivity}
                                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 shadow-lg shadow-red-600/25"
                                >
                                  Konfirmasi Reset Total
                                </button>
                                <button 
                                  onClick={() => setConfirmResetAll(false)}
                                  className="px-4 py-3 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setConfirmResetAll(true)}
                                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/10"
                              >
                                Reset Semua Data Aktivitas
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'piket' && (
              <motion.div
                key="piket"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-6 sm:p-10 space-y-6 text-gray-200"
              >
                {/* Header KPI Stats Cards */}
                {(() => {
                  const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                  const todayDayName = indonesianDays[new Date().getDay()];
                  const todayPiketObj = piketSchedule.find(p => p.day === todayDayName);
                  const todayPiketTeachers = todayPiketObj?.teacherNips?.map(n => teachers.find(t => t.nip === n)).filter(Boolean) || [];
                  
                  // Absent teachers today (approved Izin / Sakit on today's date)
                  const todayStr = new Date().toISOString().split('T')[0];
                  const absentTeachersList = izinRequests.filter(req => {
                    return req.status === 'Disetujui' && todayStr >= req.tanggalMulai && todayStr <= req.tanggalSelesai;
                  });
                  
                  // Active class substitutions today
                  const activeSubsToday = classSubstitutions.filter(sub => sub.date === todayStr);
                  const pendingSubsTodayCount = activeSubsToday.filter(sub => sub.status === 'Pending').length;

                  return (
                    <>
                      {/* STATS HEADER */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* CARD 1: GURU PIKET HARI INI */}
                        <div className="bg-[#0D0D15]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Shield className="w-24 h-24 text-amber-500" />
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                              <Shield className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-normal">Guru Piket Hari Ini ({todayDayName})</h4>
                              <p className="text-sm font-medium mt-1 text-white">
                                {todayPiketTeachers.length > 0 
                                  ? todayPiketTeachers.map((t: any) => t.name).join(', ') 
                                  : 'Belum ada jadwal hari ini'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* CARD 2: GURU BERHALANGAN */}
                        <div className="bg-[#0D0D15]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            <UserMinus className="w-24 h-24 text-rose-500" />
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                              <UserMinus className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-normal">Berhalangan Hadir Hari Ini</h4>
                              <p className="text-xl font-normal mt-1 text-white">
                                {absentTeachersList.length} <span className="text-xs text-gray-400">Guru (Izin / Sakit)</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* CARD 3: TOTAL SUBSTITUSI */}
                        <div className="bg-[#0D0D15]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Activity className="w-24 h-24 text-blue-500" />
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                              <Activity className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-normal">Tugas Substitusi Kelas Hari Ini</h4>
                              <p className="text-xl font-normal mt-1 text-white">
                                {pendingSubsTodayCount} <span className="text-xs text-gray-400">Menunggu Pelaksanaan</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* INNER NAVIGATION TABS */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
                        <div className="flex items-center gap-2 bg-[#0D0D15]/60 p-1 rounded-xl border border-white/5 w-fit">
                          <button
                            onClick={() => setPiketInnerTab('substitusi')}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              piketInnerTab === 'substitusi'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Substitusi Kelas Active
                          </button>
                          <button
                            onClick={() => setPiketInnerTab('jadwal')}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              piketInnerTab === 'jadwal'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Jadwal Piket Mingguan
                          </button>
                          <button
                            onClick={() => setPiketInnerTab('riwayat')}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              piketInnerTab === 'riwayat'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Riwayat Arsip Substitusi
                          </button>
                        </div>

                        {/* Action buttons (only for admin or today's piket teachers) */}
                        {piketInnerTab === 'substitusi' && (userRole === 'admin' || todayPiketObj?.teacherNips?.includes(nip)) && (
                          <button
                            onClick={() => {
                              setNewSubDate(new Date().toISOString().split('T')[0]);
                              setShowAddSubstitutionModal(true);
                            }}
                            className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-normal transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-amber-600/10 border border-amber-500/35 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" /> Buat Substitusi Kelas
                          </button>
                        )}
                      </div>

                      {/* SUB-VIEW 1: ACTIVE SUBSTITUSI */}
                      {piketInnerTab === 'substitusi' && (
                        <div className="space-y-4">
                          <h3 className="text-sm font-normal text-gray-400">Tugas Substitusi Hari Ini ({new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})</h3>
                          
                          {activeSubsToday.length === 0 ? (
                            <div className="bg-[#0D0D15]/60 border border-white/5 rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-3">
                              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                                <BookOpen className="w-6 h-6" />
                              </div>
                              <h4 className="text-sm font-normal text-white">Tidak Ada Tugas Substitusi Hari Ini</h4>
                              <p className="text-xs text-gray-500 max-w-sm">Seluruh guru utama terjadwal mengajar dengan lancar atau belum ada pelaporan guru pengganti yang diinput.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                              {activeSubsToday.map((sub: any) => {
                                const isUserSubstitute = sub.substituteTeacherNip === nip;
                                return (
                                  <div 
                                    key={sub.id} 
                                    className={`bg-[#0D0D15]/80 backdrop-blur-xl border rounded-2xl p-6 space-y-4 shadow-xl transition-all relative ${
                                      isUserSubstitute && sub.status === 'Pending'
                                        ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.05)] ring-1 ring-amber-500/20'
                                        : 'border-white/5'
                                    }`}
                                  >
                                    {isUserSubstitute && sub.status === 'Pending' && (
                                      <span className="absolute top-0 right-0 mt-4 mr-4 px-2 py-0.5 text-[9px] font-medium bg-amber-500 text-[#05050A] rounded-full animate-pulse uppercase tracking-wider">
                                        Tugas Anda!
                                      </span>
                                    )}

                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
                                            Kelas {sub.class}
                                          </span>
                                          <span className="text-xs text-gray-500 font-normal">
                                            Jam: {sub.hours}
                                          </span>
                                        </div>
                                        <h4 className="text-base font-normal text-white mt-2">{sub.subject}</h4>
                                      </div>

                                      <span className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg uppercase tracking-wider ${
                                        sub.status === 'Selesai'
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      }`}>
                                        {sub.status}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-white/5">
                                      <div>
                                        <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Guru Berhalangan</span>
                                        <p className="text-xs text-rose-400 font-medium mt-0.5">{sub.absentTeacherName}</p>
                                        <span className="text-[9px] text-gray-500 block">NIP: {sub.absentTeacherNip}</span>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Guru Pengganti</span>
                                        <p className="text-xs text-emerald-400 font-medium mt-0.5">{sub.substituteTeacherName}</p>
                                        <span className="text-[9px] text-gray-500 block">NIP: {sub.substituteTeacherNip}</span>
                                      </div>
                                    </div>

                                    <div className="space-y-1.5">
                                      <span className="text-[10px] text-gray-500 block uppercase tracking-wider">Tugas / Materi Pembelajaran:</span>
                                      <p className="text-xs text-gray-300 bg-white/5 border border-white/5 rounded-xl p-3.5 italic leading-relaxed">
                                        "{sub.taskDescription || 'Mengerjakan tugas mandiri atau membaca buku paket.'}"
                                      </p>
                                    </div>

                                    {sub.notes && (
                                      <div className="space-y-1.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3.5">
                                        <span className="text-[10px] text-emerald-400 block uppercase tracking-wider font-semibold">Laporan Penyelesaian Kelas:</span>
                                        <p className="text-xs text-emerald-300 italic">
                                          "{sub.notes}"
                                        </p>
                                      </div>
                                    )}

                                    {/* Action items */}
                                    <div className="flex items-center justify-between pt-2">
                                      <div>
                                        {userRole === 'admin' && (
                                          <button
                                            onClick={() => {
                                              if (confirm('Apakah Anda yakin ingin menghapus tugas substitusi ini?')) {
                                                handleDeleteSubstitution(sub.id);
                                              }
                                            }}
                                            className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                                          >
                                            <Trash2 className="w-4 h-4" /> Hapus
                                          </button>
                                        )}
                                      </div>

                                      {isUserSubstitute && sub.status === 'Pending' && (
                                        <button
                                          onClick={() => {
                                            setReportingSubId(sub.id);
                                            setReportSubNotes('');
                                            setShowReportSubModal(true);
                                          }}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-[#05050A] rounded-xl text-xs font-semibold shadow-lg shadow-amber-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <Check className="w-4 h-4" /> Selesaikan & Lapor
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SUB-VIEW 2: WEEKLY PIKET GRID */}
                      {piketInnerTab === 'jadwal' && (
                        <div className="space-y-4">
                          <h3 className="text-sm font-normal text-gray-400">Jadwal Tugas Guru Piket Mingguan</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map(day => {
                              const daySched = piketSchedule.find(p => p.day === day);
                              const assignedNips = daySched?.teacherNips || [];
                              const assignedTeachers = assignedNips.map(n => teachers.find(t => t.nip === n)).filter(Boolean);

                              return (
                                <div key={day} className="bg-[#0D0D15]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xl min-h-[180px]">
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                      <span className="font-semibold text-sm text-white flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-amber-400" />
                                        Hari {day}
                                      </span>
                                      <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full font-normal">
                                        {assignedTeachers.length} Guru
                                      </span>
                                    </div>

                                    {assignedTeachers.length === 0 ? (
                                      <p className="text-xs text-gray-500 italic">Belum ada guru piket ditugaskan</p>
                                    ) : (
                                      <ul className="space-y-2">
                                        {assignedTeachers.map((t: any) => (
                                          <li key={t.nip} className="flex items-center gap-2 text-xs text-gray-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                            <div>
                                              <p className="font-medium text-white">{t.name}</p>
                                              <p className="text-[10px] text-gray-500">NIP: {t.nip}</p>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>

                                  {userRole === 'admin' && (
                                    <button
                                      onClick={() => {
                                        setEditingPiketDay(daySched || { id: day, day: day, teacherNips: [] });
                                        setShowEditPiketModal(true);
                                      }}
                                      className="w-full mt-3 py-2 border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 text-amber-400 rounded-xl text-xs font-normal transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <Edit className="w-3.5 h-3.5" /> Kelola Guru Piket
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* SUB-VIEW 3: RIWAYAT ARCHIVE */}
                      {piketInnerTab === 'riwayat' && (
                        <div className="bg-[#0D0D15]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 space-y-4 shadow-xl">
                          <div className="flex items-center justify-between pb-4 border-b border-white/5">
                            <h3 className="text-sm font-normal text-white">Arsip Historis Substitusi Kelas</h3>
                            <span className="text-xs text-gray-400">{classSubstitutions.length} Total Catatan</span>
                          </div>

                          {classSubstitutions.length === 0 ? (
                            <div className="py-12 text-center text-gray-500 text-xs italic">
                              Belum ada riwayat tugas substitusi kelas yang tercatat dalam sistem.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs text-gray-300">
                                <thead className="bg-[#05050A] text-gray-400 uppercase tracking-wider text-[10px] border-b border-white/5">
                                  <tr>
                                    <th className="py-3.5 px-4 font-normal">Tanggal</th>
                                    <th className="py-3.5 px-4 font-normal">Kelas & Mapel</th>
                                    <th className="py-3.5 px-4 font-normal">Guru Utama</th>
                                    <th className="py-3.5 px-4 font-normal">Guru Pengganti</th>
                                    <th className="py-3.5 px-4 font-normal">Status</th>
                                    <th className="py-3.5 px-4 font-normal">Laporan / Catatan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {classSubstitutions.map((sub: any) => (
                                    <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                                      <td className="py-4 px-4 font-normal">{sub.date}</td>
                                      <td className="py-4 px-4 font-normal">
                                        <p className="font-semibold text-white">Kelas {sub.class}</p>
                                        <p className="text-[10px] text-gray-500">{sub.subject}</p>
                                      </td>
                                      <td className="py-4 px-4 font-normal text-rose-400/95">{sub.absentTeacherName}</td>
                                      <td className="py-4 px-4 font-normal text-emerald-400/95">{sub.substituteTeacherName}</td>
                                      <td className="py-4 px-4 font-normal">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                                          sub.status === 'Selesai'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-amber-500/10 text-amber-400'
                                        }`}>
                                          {sub.status}
                                        </span>
                                      </td>
                                      <td className="py-4 px-4 font-normal max-w-xs truncate" title={sub.notes || sub.taskDescription}>
                                        {sub.status === 'Selesai' ? (
                                          <p className="text-gray-300">{sub.notes || '-'}</p>
                                        ) : (
                                          <p className="text-gray-500 italic">Task: {sub.taskDescription || '-'}</p>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </motion.div>
            )}

            {activeTab === 'export' && (
              <motion.div
                key="export"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <FolderDown className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-normal text-white">Pusat Laporan Menyeluruh</h3>
                      <p className="text-sm text-gray-400 mt-1">Unduh rekapitulasi data absensi seluruh guru dan siswa.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Guru Export Card */}
                    <div className="bg-[#05050A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-opacity opacity-0 group-hover:opacity-100" />
                      
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                            <Users className="w-5 h-5 text-purple-400" />
                          </div>
                          <h4 className="text-lg font-medium text-white mb-1">Laporan Absensi Guru</h4>
                          <p className="text-sm text-gray-400">Rekap kehadiran seluruh guru, termasuk status izin, sakit, dan tanpa keterangan.</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="relative">
                          <select 
                            value={exportTeacherMonth}
                            onChange={(e) => setExportTeacherMonth(e.target.value)}
                            className="w-full appearance-none bg-[#0D0D19] border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-colors cursor-pointer shadow-lg font-medium">
                            <option value="12-2026" className="bg-[#0d0d19] text-white">Desember 2026</option>
                            <option value="11-2026" className="bg-[#0d0d19] text-white">November 2026</option>
                            <option value="10-2026" className="bg-[#0d0d19] text-white">Oktober 2026</option>
                            <option value="09-2026" className="bg-[#0d0d19] text-white">September 2026</option>
                            <option value="08-2026" className="bg-[#0d0d19] text-white">Agustus 2026</option>
                            <option value="07-2026" className="bg-[#0d0d19] text-white">Juli 2026</option>
                            <option value="06-2026" className="bg-[#0d0d19] text-white">Juni 2026</option>
                            <option value="05-2026" className="bg-[#0d0d19] text-white">Mei 2026</option>
                            <option value="04-2026" className="bg-[#0d0d19] text-white">April 2026</option>
                            <option value="03-2026" className="bg-[#0d0d19] text-white">Maret 2026</option>
                            <option value="02-2026" className="bg-[#0d0d19] text-white">Februari 2026</option>
                            <option value="01-2026" className="bg-[#0d0d19] text-white">Januari 2026</option>
                            <option value="all" className="bg-[#0d0d19] text-white">Semua Data (Tahun Ajaran Aktif)</option>
                          </select>
                          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              const doc = new jsPDF();
                              const getMonthLabel = (val: string) => {
                                if (val === 'all') return 'Semua Data';
                                const [m, y] = val.split('-');
                                const monthsMap: { [key: string]: string } = {
                                  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
                                  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
                                  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
                                };
                                return `${monthsMap[m] || m} ${y}`;
                              };

                              doc.setFontSize(16);
                              doc.text('Laporan Rekapitulasi Absensi Guru', 14, 22);
                              doc.setFontSize(11);
                              doc.text(`Periode: ${getMonthLabel(exportTeacherMonth)}`, 14, 30);
                              doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 36);
                              
                              const tableData = teachers.map((teacher, idx) => {
                                const teacherRecords = records.filter(r => {
                                  if (r.nip !== teacher.nip) return false;
                                  if (exportTeacherMonth === 'all') return true;
                                  
                                  const [m, y] = exportTeacherMonth.split('-');
                                  const monthsMap: { [key: string]: string[] } = {
                                    '01': ['Jan'], '02': ['Feb'], '03': ['Mar'], '04': ['Apr'],
                                    '05': ['Mei', 'May'], '06': ['Jun'], '07': ['Jul'], '08': ['Agu', 'Aug'],
                                    '09': ['Sep'], '10': ['Okt', 'Oct'], '11': ['Nov'], '12': ['Des', 'Dec']
                                  };
                                  const abbrs = monthsMap[m] || [];
                                  const lowerDate = (r.date || '').toLowerCase();
                                  return lowerDate.includes(y) && abbrs.some(abbr => lowerDate.includes(abbr.toLowerCase()));
                                });

                                const totalDays = 20;
                                const sakit = teacherRecords.filter(r => r.type === 'Sakit').length;
                                const izin = teacherRecords.filter(r => r.type === 'Izin' || r.type === 'Dinas').length;
                                const hadir = teacherRecords.filter(r => r.type === 'Absen Datang' || r.type === 'Absen Pulang').length;
                                const alpa = Math.max(0, totalDays - hadir - sakit - izin);
                                const pct = totalDays > 0 ? Math.round(((hadir + sakit + izin) / totalDays) * 100) : 100;
                                return [
                                  (idx + 1).toString(),
                                  teacher.name,
                                  teacher.nip,
                                  `${pct}%`,
                                  izin.toString(),
                                  sakit.toString(),
                                  alpa.toString()
                                ];
                              });

                              autoTable(doc, {
                                startY: 45,
                                head: [['No', 'Nama Guru', 'NIP', 'Kehadiran (%)', 'Izin', 'Sakit', 'Alpa']],
                                body: tableData,
                                theme: 'grid',
                                headStyles: { fillColor: [168, 85, 247] },
                              });
                              
                              const finalY4 = (doc as any).lastAutoTable.finalY || 100;
                              doc.text(`${getPlaceSignature()}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, finalY4 + 20);
                              doc.text('Kepala Sekolah', 130, finalY4 + 28);
                              doc.text(schoolSettings.headmasterName, 130, finalY4 + 50);
                              doc.text(`NIP. ${schoolSettings.headmasterNip}`, 130, finalY4 + 56);

                              doc.save(`Rekap_Absen_Guru_${exportTeacherMonth}.pdf`);
                              showNotification('Laporan Guru (PDF) berhasil diunduh!', 'text-emerald-400');
                            }}
                            className="flex-1 px-2 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
                          >
                            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>PDF</span>
                          </button>
                          <button 
                            onClick={() => {
                              const headers = ['No', 'Nama Guru', 'NIP', 'Kehadiran (%)', 'Izin', 'Sakit', 'Alpa'];
                              const data = teachers.map((teacher, idx) => {
                                const teacherRecords = records.filter(r => {
                                  if (r.nip !== teacher.nip) return false;
                                  if (exportTeacherMonth === 'all') return true;
                                  
                                  const [m, y] = exportTeacherMonth.split('-');
                                  const monthsMap: { [key: string]: string[] } = {
                                    '01': ['Jan'], '02': ['Feb'], '03': ['Mar'], '04': ['Apr'],
                                    '05': ['Mei', 'May'], '06': ['Jun'], '07': ['Jul'], '08': ['Agu', 'Aug'],
                                    '09': ['Sep'], '10': ['Okt', 'Oct'], '11': ['Nov'], '12': ['Des', 'Dec']
                                  };
                                  const abbrs = monthsMap[m] || [];
                                  const lowerDate = (r.date || '').toLowerCase();
                                  return lowerDate.includes(y) && abbrs.some(abbr => lowerDate.includes(abbr.toLowerCase()));
                                });

                                const totalDays = 20;
                                const sakit = teacherRecords.filter(r => r.type === 'Sakit').length;
                                const izin = teacherRecords.filter(r => r.type === 'Izin' || r.type === 'Dinas').length;
                                const hadir = teacherRecords.filter(r => r.type === 'Absen Datang' || r.type === 'Absen Pulang').length;
                                const alpa = Math.max(0, totalDays - hadir - sakit - izin);
                                const pct = totalDays > 0 ? Math.round(((hadir + sakit + izin) / totalDays) * 100) : 100;
                                return [
                                  (idx + 1).toString(),
                                  teacher.name,
                                  teacher.nip,
                                  `${pct}%`,
                                  izin.toString(),
                                  sakit.toString(),
                                  alpa.toString()
                                ];
                              });
                              const csvContent = [
                                headers.join(','),
                                ...data.map(row => row.join(','))
                              ].join('\n');
                              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(blob);
                              link.download = `Rekap_Absen_Guru_${exportTeacherMonth}.csv`;
                              link.click();
                              showNotification('Laporan Guru (Excel/CSV) berhasil diunduh!', 'text-emerald-400');
                            }}
                            className="flex-1 px-2 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Excel</span>
                          </button>
                          <button 
                            onClick={() => handleDownloadPhotos(exportTeacherMonth)}
                            className="flex-1 px-2 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
                          >
                            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden sm:inline">Foto (ZIP)</span>
                            <span className="sm:hidden">ZIP</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Siswa Export Card */}
                    <div className="bg-[#05050A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-opacity opacity-0 group-hover:opacity-100" />
                      
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                            <GraduationCap className="w-5 h-5 text-blue-400" />
                          </div>
                          <h4 className="text-lg font-medium text-white mb-1">Laporan Absensi Siswa</h4>
                          <p className="text-sm text-gray-400">Rekap kehadiran siswa per kelas atau seluruh siswa secara kumulatif.</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="relative">
                            <select 
                              value={exportStudentClass}
                              onChange={(e) => setExportStudentClass(e.target.value)}
                              className="w-full appearance-none bg-[#0D0D19] border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer shadow-lg font-medium">
                              <option value="all" className="bg-[#0d0d19] text-white">Semua Kelas</option>
                              {Array.from(new Set(students.map(s => s.kelas))).filter(Boolean).sort().map(cls => (
                                <option key={cls} value={cls} className="bg-[#0d0d19] text-white">Kelas {cls}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <div className="relative">
                            <select 
                              value={exportStudentMonth}
                              onChange={(e) => setExportStudentMonth(e.target.value)}
                              className="w-full appearance-none bg-[#0D0D19] border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer shadow-lg font-medium">
                              <option value="12-2026" className="bg-[#0d0d19] text-white">Desember 2026</option>
                              <option value="11-2026" className="bg-[#0d0d19] text-white">November 2026</option>
                              <option value="10-2026" className="bg-[#0d0d19] text-white">Oktober 2026</option>
                              <option value="09-2026" className="bg-[#0d0d19] text-white">September 2026</option>
                              <option value="08-2026" className="bg-[#0d0d19] text-white">Agustus 2026</option>
                              <option value="07-2026" className="bg-[#0d0d19] text-white">Juli 2026</option>
                              <option value="06-2026" className="bg-[#0d0d19] text-white">Juni 2026</option>
                              <option value="05-2026" className="bg-[#0d0d19] text-white">Mei 2026</option>
                              <option value="04-2026" className="bg-[#0d0d19] text-white">April 2026</option>
                              <option value="03-2026" className="bg-[#0d0d19] text-white">Maret 2026</option>
                              <option value="02-2026" className="bg-[#0d0d19] text-white">Februari 2026</option>
                              <option value="01-2026" className="bg-[#0d0d19] text-white">Januari 2026</option>
                              <option value="all" className="bg-[#0d0d19] text-white">Semua Data (Tahun Ajaran Aktif)</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <button 
                            onClick={() => {
                              const doc = new jsPDF();
                              const getMonthLabel = (val: string) => {
                                if (val === 'all') return 'Semua Data';
                                const [m, y] = val.split('-');
                                const monthsMap: { [key: string]: string } = {
                                  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
                                  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
                                  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
                                };
                                return `${monthsMap[m] || m} ${y}`;
                              };

                              doc.setFontSize(16);
                              doc.text('Laporan Rekapitulasi Absensi Siswa', 14, 22);
                              doc.setFontSize(11);
                              doc.text(`Kelas: ${exportStudentClass === 'all' ? 'Semua Kelas' : `Kelas ${exportStudentClass}`}`, 14, 30);
                              doc.text(`Periode: ${getMonthLabel(exportStudentMonth)}`, 14, 36);
                              doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 42);
                              
                              const filteredStudents = students.filter(student => {
                                return exportStudentClass === 'all' || student.kelas === exportStudentClass;
                              });

                              const tableData = filteredStudents.map((student, idx) => {
                                const recs = studentRecords.filter(r => {
                                  if (r.nis !== student.nis) return false;
                                  if (exportStudentMonth === 'all') return true;
                                  
                                  const [m, y] = exportStudentMonth.split('-');
                                  const monthsMap: { [key: string]: string[] } = {
                                    '01': ['Jan'], '02': ['Feb'], '03': ['Mar'], '04': ['Apr'],
                                    '05': ['Mei', 'May'], '06': ['Jun'], '07': ['Jul'], '08': ['Agu', 'Aug'],
                                    '09': ['Sep'], '10': ['Okt', 'Oct'], '11': ['Nov'], '12': ['Des', 'Dec']
                                  };
                                  const abbrs = monthsMap[m] || [];
                                  const lowerDate = (r.date || '').toLowerCase();
                                  return lowerDate.includes(y) && abbrs.some(abbr => lowerDate.includes(abbr.toLowerCase()));
                                });

                                const isHadir = recs.filter(r => r.status === 'Hadir').length;
                                const isIzin = recs.filter(r => r.status === 'Izin' || r.status === 'Dinas').length;
                                const isSakit = recs.filter(r => r.status === 'Sakit').length;
                                const isAlpa = recs.filter(r => r.status === 'Alpa').length;

                                return [
                                  (idx + 1).toString(),
                                  student.name,
                                  student.nis,
                                  student.kelas,
                                  isHadir.toString(),
                                  isIzin.toString(),
                                  isSakit.toString(),
                                  isAlpa.toString()
                                ];
                              });

                              autoTable(doc, {
                                startY: 50,
                                head: [['No', 'Nama Siswa', 'NIS', 'Kelas', 'H', 'I', 'S', 'A']],
                                body: tableData,
                                theme: 'grid',
                                headStyles: { fillColor: [59, 130, 246] },
                              });
                              
                              const finalY5 = (doc as any).lastAutoTable.finalY || 100;
                              doc.text(`${getPlaceSignature()}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 130, finalY5 + 20);
                              doc.text('Kepala Sekolah', 130, finalY5 + 28);
                              doc.text(schoolSettings.headmasterName, 130, finalY5 + 50);
                              doc.text(`NIP. ${schoolSettings.headmasterNip}`, 130, finalY5 + 56);
 
                              doc.save(`Rekap_Absen_Siswa_${exportStudentClass}_${exportStudentMonth}.pdf`);
                              showNotification('Laporan Siswa (PDF) berhasil diunduh!', 'text-emerald-400');
                            }}
                            className="flex-1 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>PDF</span>
                          </button>
                          <button 
                            onClick={() => {
                              const headers = ['No', 'Nama Siswa', 'NIS', 'Kelas', 'Hadir', 'Izin', 'Sakit', 'Alpa'];
                              const filteredStudents = students.filter(student => {
                                return exportStudentClass === 'all' || student.kelas === exportStudentClass;
                              });

                              const data = filteredStudents.map((student, idx) => {
                                const recs = studentRecords.filter(r => {
                                  if (r.nis !== student.nis) return false;
                                  if (exportStudentMonth === 'all') return true;
                                  
                                  const [m, y] = exportStudentMonth.split('-');
                                  const monthsMap: { [key: string]: string[] } = {
                                    '01': ['Jan'], '02': ['Feb'], '03': ['Mar'], '04': ['Apr'],
                                    '05': ['Mei', 'May'], '06': ['Jun'], '07': ['Jul'], '08': ['Agu', 'Aug'],
                                    '09': ['Sep'], '10': ['Okt', 'Oct'], '11': ['Nov'], '12': ['Des', 'Dec']
                                  };
                                  const abbrs = monthsMap[m] || [];
                                  const lowerDate = (r.date || '').toLowerCase();
                                  return lowerDate.includes(y) && abbrs.some(abbr => lowerDate.includes(abbr.toLowerCase()));
                                });

                                const isHadir = recs.filter(r => r.status === 'Hadir').length;
                                const isIzin = recs.filter(r => r.status === 'Izin' || r.status === 'Dinas').length;
                                const isSakit = recs.filter(r => r.status === 'Sakit').length;
                                const isAlpa = recs.filter(r => r.status === 'Alpa').length;

                                return [
                                  (idx + 1).toString(),
                                  student.name,
                                  student.nis,
                                  student.kelas,
                                  isHadir.toString(),
                                  isIzin.toString(),
                                  isSakit.toString(),
                                  isAlpa.toString()
                                ];
                              });
                              const csvContent = [
                                headers.join(','),
                                ...data.map(row => row.join(','))
                              ].join('\n');
                              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(blob);
                              link.download = `Rekap_Absen_Siswa_${exportStudentClass}_${exportStudentMonth}.csv`;
                              link.click();
                              showNotification('Laporan Siswa (Excel/CSV) berhasil diunduh!', 'text-emerald-400');
                            }}
                            className="flex-1 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Excel</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-6 left-6 right-6 bg-[#05050A]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 z-50 flex justify-around items-center shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        {userRole === 'guru' && (
          <>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'dashboard' 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LayoutDashboard className={`w-5 h-5 mb-1 ${activeTab === 'dashboard' ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'schedule' 
                  ? 'bg-orange-500/10 text-orange-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Calendar className={`w-5 h-5 mb-1 ${activeTab === 'schedule' ? 'drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Jadwal</span>
            </button>
            <button
              onClick={() => setActiveTab('class-attendance')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'class-attendance' 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FileText className={`w-5 h-5 mb-1 ${activeTab === 'class-attendance' ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Riwayat</span>
            </button>
            <button
              onClick={() => setActiveTab('scan')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'scan' 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <QrCode className={`w-5 h-5 mb-1 ${activeTab === 'scan' ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Scan Siswa</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'profile' 
                  ? 'bg-purple-500/10 text-purple-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <User className={`w-5 h-5 mb-1 ${activeTab === 'profile' ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Profile</span>
            </button>
          </>
        )}

        {userRole === 'siswa' && (
          <>
            <button
              onClick={() => setActiveTab('scan')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'scan' 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <QrCode className={`w-5 h-5 mb-1 ${activeTab === 'scan' ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Absen</span>
            </button>
            <button
              onClick={() => setActiveTab('card')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'card' 
                  ? 'bg-purple-500/10 text-purple-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <User className={`w-5 h-5 mb-1 ${activeTab === 'card' ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Kartu</span>
            </button>
          </>
        )}

        {userRole === 'admin' && (
          <>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'analytics' 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LayoutDashboard className={`w-5 h-5 mb-1 ${activeTab === 'analytics' ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Analisis</span>
            </button>
            <button
              onClick={() => setActiveTab('izin')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'izin' 
                  ? 'bg-amber-500/10 text-amber-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Coffee className={`w-5 h-5 mb-1 ${activeTab === 'izin' ? 'drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Izin</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'users' 
                  ? 'bg-purple-500/10 text-purple-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Users className={`w-5 h-5 mb-1 ${activeTab === 'users' ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Daftar</span>
            </button>
            <button
              onClick={() => setActiveTab('academic-calendar')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'academic-calendar' 
                  ? 'bg-rose-500/10 text-rose-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Calendar className={`w-5 h-5 mb-1 ${activeTab === 'academic-calendar' ? 'drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Kalender</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'settings' 
                  ? 'bg-slate-500/10 text-slate-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Settings className={`w-5 h-5 mb-1 ${activeTab === 'settings' ? 'drop-shadow-[0_0_8px_rgba(100,116,139,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Sistem</span>
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all ${
                activeTab === 'export' 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <FolderDown className={`w-5 h-5 mb-1 ${activeTab === 'export' ? 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`} />
              <span className="text-[10px] font-normal">Laporan</span>
            </button>
          </>
        )}
      </nav>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#05050A]/90 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
          >
            <div className={`p-1 rounded-full bg-[#05050A] shadow-inner ${notification.color}`}>
              {notification.color.includes('rose') || notification.color.includes('red') ? (
                <XCircle className="w-5 h-5" />
              ) : notification.color.includes('amber') || notification.color.includes('yellow') ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
            <span className="font-normal text-sm text-gray-100">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Edit/Add Schedule */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl">
            <h5 className="font-normal text-white text-lg mb-4">{editingSchedule.id ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">HARI</label>
                <select 
                  value={editingSchedule.day} 
                  onChange={(e) => setEditingSchedule({...editingSchedule, day: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-orange-500 appearance-none"
                >
                  <option value="Senin">Senin</option>
                  <option value="Selasa">Selasa</option>
                  <option value="Rabu">Rabu</option>
                  <option value="Kamis">Kamis</option>
                  <option value="Jumat">Jumat</option>
                  <option value="Sabtu">Sabtu</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">{isTeacherRole ? 'JAM MENGAJAR' : 'JAM TUGAS'}</label>
                <input type="text" value={editingSchedule.time} onChange={(e) => setEditingSchedule({...editingSchedule, time: e.target.value})} placeholder={isTeacherRole ? "Contoh: 07:30 - 09:00" : "Contoh: 08:00 - 16:00"} className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">{isTeacherRole ? 'MATA PELAJARAN' : 'URAIAN TUGAS'}</label>
                <input type="text" value={editingSchedule.subject} onChange={(e) => setEditingSchedule({...editingSchedule, subject: e.target.value})} placeholder={isTeacherRole ? "Contoh: Matematika" : "Contoh: Administrasi TU / Patroli"} className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">{isTeacherRole ? 'KELAS' : 'AREA / LOKASI TUGAS'}</label>
                <input type="text" value={editingSchedule.class} onChange={(e) => setEditingSchedule({...editingSchedule, class: e.target.value})} placeholder={isTeacherRole ? "Contoh: VII A" : "Contoh: Kantor TU / Gerbang Depan"} className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowScheduleModal(false)} className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-sm transition-colors cursor-pointer border border-white/10">Batal</button>
                <button onClick={handleSaveSchedule} className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm shadow-lg shadow-orange-500/25 transition-all cursor-pointer">Simpan Jadwal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Adding data */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl">
            <h5 className="font-normal text-white text-lg mb-4">Form Tambah Guru / Staff Baru</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NAMA LENGKAP PEGAWAI</label>
                <input type="text" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} placeholder="Contoh: Tb. Saiful Bahri, S.Pd." className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NIP (NOMOR INDUK PEGAWAI)</label>
                <input type="text" value={newTeacherNip} onChange={(e) => setNewTeacherNip(e.target.value)} placeholder="Contoh: 198501142010..." className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">JABATAN / ROLE</label>
                <select 
                  value={newTeacherRole} 
                  onChange={(e) => setNewTeacherRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  <option value="Guru Mapel">Guru Mapel</option>
                  <option value="Kepala Sekolah">Kepala Sekolah</option>
                  <option value="Wakasek Kurikulum">Wakasek Kurikulum</option>
                  <option value="Staff Tata Usaha (TU)">Staff Tata Usaha (TU)</option>
                  <option value="Operator Sekolah">Operator Sekolah</option>
                  <option value="Admin">Admin</option>
                  <option value="Pegawai Kebersihan">Pegawai Kebersihan</option>
                  <option value="Penjaga Sekolah / OB">Penjaga Sekolah / OB</option>
                  <option value="Petugas Keamanan (Satpam)">Petugas Keamanan (Satpam)</option>
                  <option value="Lain-lain">Lain-lain</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">BIDANG TUGAS / MAPEL</label>
                <input type="text" value={newTeacherMapel} onChange={(e) => setNewTeacherMapel(e.target.value)} placeholder="Contoh: Matematika / Administrasi" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">TELEPON / WHATSAPP</label>
                <input type="text" value={newTeacherPhone} onChange={(e) => setNewTeacherPhone(e.target.value)} placeholder="Contoh: 08123456789" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">EMAIL RESMI</label>
                <input type="email" value={newTeacherEmail} onChange={(e) => setNewTeacherEmail(e.target.value)} placeholder="Contoh: nama@sekolah.sch.id" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddTeacherModal(false)} className="px-4 py-2 text-gray-400 hover:text-white text-xs font-normal cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  if (!newTeacherName || !newTeacherNip) return;
                  const newTeacher = { 
                    name: newTeacherName, 
                    nip: newTeacherNip, 
                    role: newTeacherRole, 
                    mapel: newTeacherMapel || 'Umum', 
                    phone: newTeacherPhone || '',
                    email: newTeacherEmail || '',
                    status: 'Aktif' 
                  };
                  setTeachers(prev => [newTeacher, ...prev]);
                  saveTeacherSync(newTeacher);
                  showNotification(`Pegawai ${newTeacherName} berhasil didaftarkan!`, 'text-emerald-400');
                  setNewTeacherName('');
                  setNewTeacherNip('');
                  setNewTeacherMapel('');
                  setNewTeacherRole('Guru Mapel');
                  setNewTeacherPhone('');
                  setNewTeacherEmail('');
                  setShowAddTeacherModal(false);
                }}
                className="px-4 py-2 bg-emerald-500 text-black rounded-lg text-xs font-normal cursor-pointer"
              >
                Simpan Pegawai
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl">
            <h5 className="font-normal text-white text-lg mb-4">Form Tambah Siswa Baru</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NAMA LENGKAP SISWA</label>
                <input type="text" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Contoh: Ahmad Zakaria" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NIS (NOMOR INDUK SISWA)</label>
                <input type="text" value={newStudentNis} onChange={(e) => setNewStudentNis(e.target.value)} placeholder="Contoh: 24009" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">KELAS</label>
                <input type="text" value={newStudentKelas} onChange={(e) => setNewStudentKelas(e.target.value)} placeholder="Contoh: VII - B" className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddStudentModal(false)} className="px-4 py-2 text-gray-400 hover:text-white text-xs font-normal cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  if (!newStudentName || !newStudentNis) return;
                  const newStudent = { name: newStudentName, nis: newStudentNis, kelas: newStudentKelas || 'VII - A', barcode: `SIS-${newStudentNis}` };
                  setStudents(prev => [newStudent, ...prev]);
                  saveStudentSync(newStudent);
                  showNotification(`Siswa ${newStudentName} berhasil didaftarkan!`, 'text-blue-400');
                  setNewStudentName('');
                  setNewStudentNis('');
                  setNewStudentKelas('');
                  setShowAddStudentModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-normal cursor-pointer"
              >
                Simpan Siswa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Substitusi Kelas */}
      {showAddSubstitutionModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-lg relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button 
              type="button"
              onClick={() => setShowAddSubstitutionModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h5 className="font-normal text-white text-lg mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-500" />
              Buat Tugas Substitusi Kelas
            </h5>
            <form onSubmit={handleAddSubstitution} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-normal text-gray-400 mb-1">TANGGAL TUGAS *</label>
                  <input 
                    type="date" 
                    value={newSubDate} 
                    onChange={(e) => setNewSubDate(e.target.value)} 
                    required
                    className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-amber-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-normal text-gray-400 mb-1">JAM PELAJARAN *</label>
                  <input 
                    type="text" 
                    value={newSubHours} 
                    onChange={(e) => setNewSubHours(e.target.value)} 
                    placeholder="Contoh: Jam 3 s/d 4" 
                    required
                    className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-amber-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-normal text-gray-400 mb-1">RUANG KELAS *</label>
                  <select 
                    value={newSubClass} 
                    onChange={(e) => setNewSubClass(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-[#0D0D19] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 appearance-none"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {Array.from(new Set(students.map(s => s.kelas).filter(Boolean))).sort().map(kls => (
                      <option key={kls} value={kls}>{kls}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-normal text-gray-400 mb-1">MATA PELAJARAN *</label>
                  <input 
                    type="text" 
                    value={newSubSubject} 
                    onChange={(e) => setNewSubSubject(e.target.value)} 
                    placeholder="Contoh: Matematika" 
                    required
                    className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-amber-500" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">GURU YANG BERHALANGAN *</label>
                <select 
                  value={newSubAbsentNip} 
                  onChange={(e) => setNewSubAbsentNip(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-[#0D0D19] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 appearance-none"
                >
                  <option value="">-- Pilih Guru Utama --</option>
                  {teachers.map(t => (
                    <option key={t.nip} value={t.nip}>{t.name} (NIP: {t.nip})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">GURU PENGGANTI (SUBSTITUTE) *</label>
                <select 
                  value={newSubSubNip} 
                  onChange={(e) => setNewSubSubNip(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-[#0D0D19] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 appearance-none"
                >
                  <option value="">-- Pilih Guru Pengganti --</option>
                  {teachers
                    .filter(t => t.nip !== newSubAbsentNip)
                    .map(t => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isPresent = records.some(r => r.nip === t.nip && r.type === 'datang' && r.date === todayStr);
                      return (
                        <option key={t.nip} value={t.nip}>
                          {t.name} {isPresent ? '🟢 (Hadir di Sekolah)' : '⚪ (Belum Check-in)'}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">TUGAS / MATERI PEMBELAJARAN *</label>
                <textarea 
                  value={newSubTask} 
                  onChange={(e) => setNewSubTask(e.target.value)} 
                  placeholder="Instruksi tugas untuk siswa..." 
                  required
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-amber-500 resize-none" 
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddSubstitutionModal(false)}
                  className="flex-1 py-3 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-normal text-white transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-amber-600/10 cursor-pointer"
                >
                  Buat Tugas & Kirim WA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lapor Penyelesaian Substitusi */}
      {showReportSubModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl">
            <button 
              type="button"
              onClick={() => {
                setShowReportSubModal(false);
                setReportingSubId(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h5 className="font-normal text-white text-lg mb-2 flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-400" />
              Laporan Penyelesaian Kelas
            </h5>
            <p className="text-xs text-gray-400 mb-4">Silakan masukkan laporan singkat mengenai situasi kelas dan materi yang telah diselesaikan.</p>
            <form onSubmit={handleReportSubstitution} className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">CATATAN DAN LAPORAN KELAS *</label>
                <textarea 
                  value={reportSubNotes} 
                  onChange={(e) => setReportSubNotes(e.target.value)} 
                  placeholder="Contoh: Siswa kondusif, tugas LKS hal 25 telah dikerjakan lengkap..." 
                  required
                  rows={4}
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500 resize-none" 
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowReportSubModal(false);
                    setReportingSubId(null);
                  }}
                  className="flex-1 py-3 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-normal text-white transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-emerald-600/10 cursor-pointer"
                >
                  Kirim Laporan & Selesaikan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kelola Guru Piket Mingguan */}
      {showEditPiketModal && editingPiketDay && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl max-h-[85vh] flex flex-col">
            <button 
              type="button"
              onClick={() => {
                setShowEditPiketModal(false);
                setEditingPiketDay(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h5 className="font-normal text-white text-lg mb-1 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              Kelola Guru Piket Hari {editingPiketDay.day}
            </h5>
            <p className="text-xs text-gray-400 mb-4">Centang pegawai/guru yang ditugaskan sebagai guru piket pada hari ini.</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2">
              {teachers.map((t: any) => {
                const isSelected = editingPiketDay.teacherNips?.includes(t.nip);
                return (
                  <label 
                    key={t.nip} 
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-500/10 border-amber-500/30 text-white' 
                        : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{t.name}</span>
                      <span className="text-[10px] text-gray-500">NIP: {t.nip} - {t.mapel || 'Staf'}</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        let updatedNips = [...(editingPiketDay.teacherNips || [])];
                        if (isChecked) {
                          if (!updatedNips.includes(t.nip)) {
                            updatedNips.push(t.nip);
                          }
                        } else {
                          updatedNips = updatedNips.filter((n: string) => n !== t.nip);
                        }
                        setEditingPiketDay({
                          ...editingPiketDay,
                          teacherNips: updatedNips
                        });
                      }}
                      className="w-4 h-4 rounded text-amber-500 bg-[#0D0D19] border-white/10 focus:ring-amber-500/20 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4 border-t border-white/5 mt-2">
              <button 
                type="button" 
                onClick={() => {
                  setShowEditPiketModal(false);
                  setEditingPiketDay(null);
                }}
                className="flex-1 py-3 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-normal text-white transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={() => handleSavePiketSchedule(editingPiketDay.id, editingPiketDay.teacherNips || [])}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-amber-600/10 cursor-pointer"
              >
                Simpan Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Teacher Modal */}
      {showEditTeacherModal && editingTeacher && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <h5 className="font-normal text-white text-lg mb-4">Edit Data Guru / Staff</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NAMA LENGKAP PEGAWAI</label>
                <input 
                  type="text" 
                  value={editingTeacher.name} 
                  onChange={(e) => setEditingTeacher({...editingTeacher, name: e.target.value})} 
                  placeholder="Contoh: Tb. Saiful Bahri, S.Pd." 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NIP (NOMOR INDUK PEGAWAI)</label>
                <input 
                  type="text" 
                  value={editingTeacher.nip} 
                  disabled
                  title="NIP tidak dapat diubah"
                  className="w-full px-4 py-2.5 bg-white/5 opacity-50 rounded-xl text-sm border border-white/10 text-gray-400 outline-none cursor-not-allowed" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">JABATAN / ROLE</label>
                <select 
                  value={editingTeacher.role || 'Guru Mapel'} 
                  onChange={(e) => setEditingTeacher({...editingTeacher, role: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  <option value="Guru Mapel">Guru Mapel</option>
                  <option value="Kepala Sekolah">Kepala Sekolah</option>
                  <option value="Wakasek Kurikulum">Wakasek Kurikulum</option>
                  <option value="Staff Tata Usaha (TU)">Staff Tata Usaha (TU)</option>
                  <option value="Operator Sekolah">Operator Sekolah</option>
                  <option value="Admin">Admin</option>
                  <option value="Pegawai Kebersihan">Pegawai Kebersihan</option>
                  <option value="Penjaga Sekolah / OB">Penjaga Sekolah / OB</option>
                  <option value="Petugas Keamanan (Satpam)">Petugas Keamanan (Satpam)</option>
                  <option value="Lain-lain">Lain-lain</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">BIDANG TUGAS / MAPEL</label>
                <input 
                  type="text" 
                  value={editingTeacher.mapel} 
                  onChange={(e) => setEditingTeacher({...editingTeacher, mapel: e.target.value})} 
                  placeholder="Contoh: Matematika" 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">TELEPON / WHATSAPP</label>
                <input 
                  type="text" 
                  value={editingTeacher.phone || ''} 
                  onChange={(e) => setEditingTeacher({...editingTeacher, phone: e.target.value})} 
                  placeholder="Contoh: 08123456789" 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">EMAIL RESMI</label>
                <input 
                  type="email" 
                  value={editingTeacher.email || ''} 
                  onChange={(e) => setEditingTeacher({...editingTeacher, email: e.target.value})} 
                  placeholder="Contoh: nama@sekolah.sch.id" 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-emerald-500" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditTeacherModal(false); setEditingTeacher(null); }} className="px-4 py-2 text-gray-400 hover:text-white text-xs font-normal cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  if (!editingTeacher.name) return;
                  setTeachers(prev => prev.map(t => t.nip === editingTeacher.nip ? { ...t, ...editingTeacher } : t));
                  saveTeacherSync(editingTeacher);
                  showNotification(`Data Pegawai ${editingTeacher.name} berhasil diperbarui!`, 'text-emerald-400');
                  setShowEditTeacherModal(false);
                  setEditingTeacher(null);
                }}
                className="px-4 py-2 bg-emerald-500 text-black rounded-lg text-xs font-normal cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal (for Guru) */}
      {showEditProfileModal && editingProfileData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <h5 className="font-normal text-white text-lg mb-4">Edit Profil Anda</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NAMA LENGKAP</label>
                <input 
                  type="text" 
                  value={editingProfileData.name} 
                  onChange={(e) => setEditingProfileData({...editingProfileData, name: e.target.value})} 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">EMAIL RESMI</label>
                <input 
                  type="email" 
                  value={editingProfileData.email || ''} 
                  onChange={(e) => setEditingProfileData({...editingProfileData, email: e.target.value})} 
                  placeholder="emailanda@sekolah.sch.id"
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">TELEPON / WHATSAPP</label>
                <input 
                  type="text" 
                  value={editingProfileData.phone || ''} 
                  onChange={(e) => setEditingProfileData({...editingProfileData, phone: e.target.value})} 
                  placeholder="+62 8..."
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-purple-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">MATA PELAJARAN UTAMA</label>
                <input 
                  type="text" 
                  value={editingProfileData.mapel} 
                  onChange={(e) => setEditingProfileData({...editingProfileData, mapel: e.target.value})} 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-purple-500" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditProfileModal(false); setEditingProfileData(null); }} className="px-4 py-2 text-gray-400 hover:text-white text-xs font-normal cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  if (!editingProfileData.name) return;
                  setTeachers(prev => prev.map(t => t.nip === editingProfileData.nip ? editingProfileData : t));
                  saveTeacherSync(editingProfileData);
                  setNama(editingProfileData.name);
                  showNotification(`Profil Anda berhasil diperbarui!`, 'text-emerald-400');
                  setShowEditProfileModal(false);
                  setEditingProfileData(null);
                }}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-lg text-xs font-normal cursor-pointer transition-colors"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditStudentModal && editingStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[105] animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#0D0D19] border border-white/10 rounded-3xl p-6 w-full max-w-md relative shadow-2xl">
            <h5 className="font-normal text-white text-lg mb-4">Edit Data Siswa</h5>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NAMA LENGKAP SISWA</label>
                <input 
                  type="text" 
                  value={editingStudent.name} 
                  onChange={(e) => setEditingStudent({...editingStudent, name: e.target.value})} 
                  placeholder="Contoh: Ahmad Zakaria" 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">NIS (NOMOR INDUK SISWA)</label>
                <input 
                  type="text" 
                  value={editingStudent.nis} 
                  disabled
                  title="NIS tidak dapat diubah"
                  className="w-full px-4 py-2.5 bg-white/5 opacity-50 rounded-xl text-sm border border-white/10 text-gray-400 outline-none cursor-not-allowed" 
                />
              </div>
              <div>
                <label className="block text-xs font-normal text-gray-400 mb-1">KELAS</label>
                <input 
                  type="text" 
                  value={editingStudent.kelas} 
                  onChange={(e) => setEditingStudent({...editingStudent, kelas: e.target.value})} 
                  placeholder="Contoh: VII - B" 
                  className="w-full px-4 py-2.5 bg-white/5 rounded-xl text-sm border border-white/10 text-white focus:outline-none focus:border-blue-500" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditStudentModal(false); setEditingStudent(null); }} className="px-4 py-2 text-gray-400 hover:text-white text-xs font-normal cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  if (!editingStudent.name) return;
                  setStudents(prev => prev.map(s => s.nis === editingStudent.nis ? editingStudent : s));
                  saveStudentSync(editingStudent);
                  showNotification(`Data Siswa ${editingStudent.name} berhasil diperbarui!`, 'text-blue-400');
                  setShowEditStudentModal(false);
                  setEditingStudent(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-normal cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Teacher Confirmation Modal */}
      <AnimatePresence>
        {teacherToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-[#0a0a0f] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl p-6 relative"
            >
              <button 
                onClick={() => setTeacherToDelete(null)}
                className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-full transition-colors backdrop-blur-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 shadow-[0_0_30px_rgba(244,63,94,0.15)] animate-pulse">
                  <Trash2 className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-normal text-white tracking-tight">Hapus Data Guru</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">
                  Apakah Anda yakin ingin menghapus data guru <span className="text-white font-medium">{teacherToDelete.name}</span> (NIP: {teacherToDelete.nip})? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setTeacherToDelete(null)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 font-normal transition-all border border-white/5 text-sm cursor-pointer active:scale-[0.98]"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    setTeachers(prev => prev.filter(x => x.nip !== teacherToDelete.nip));
                    deleteTeacherSync(teacherToDelete.nip);
                    showNotification(`Guru ${teacherToDelete.name} berhasil dihapus.`, 'text-red-400');
                    setTeacherToDelete(null);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-normal transition-all shadow-[0_4px_25px_rgba(225,29,72,0.3)] text-sm cursor-pointer active:scale-[0.98]"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Student Confirmation Modal */}
      <AnimatePresence>
        {studentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-[#0a0a0f] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl p-6 relative"
            >
              <button 
                onClick={() => setStudentToDelete(null)}
                className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-full transition-colors backdrop-blur-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 shadow-[0_0_30px_rgba(244,63,94,0.15)] animate-pulse">
                  <Trash2 className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-normal text-white tracking-tight">Hapus Data Siswa</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">
                  Apakah Anda yakin ingin menghapus data siswa <span className="text-white font-medium">{studentToDelete.name}</span> (NIS: {studentToDelete.nis})? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setStudentToDelete(null)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 font-normal transition-all border border-white/5 text-sm cursor-pointer active:scale-[0.98]"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    setStudents(prev => prev.filter(x => x.nis !== studentToDelete.nis));
                    deleteStudentSync(studentToDelete.nis);
                    showNotification(`Siswa ${studentToDelete.name} berhasil dihapus.`, 'text-red-400');
                    setStudentToDelete(null);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-normal transition-all shadow-[0_4px_25px_rgba(225,29,72,0.3)] text-sm cursor-pointer active:scale-[0.98]"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-[#0a0a0f] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl p-6 relative"
            >
              <button 
                onClick={() => setShowLogoutConfirm(false)}
                className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-full transition-colors backdrop-blur-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 shadow-[0_0_30px_rgba(244,63,94,0.15)] animate-pulse">
                  <LogOut className="w-8 h-8" />
                </div>
                
                <h3 className="text-xl font-normal text-white tracking-tight">Konfirmasi Keluar</h3>
                <p className="text-sm text-gray-400 mt-2.5 leading-relaxed">
                  Apakah Anda yakin ingin keluar dari akun ini? Anda harus memasukkan kredensial kembali untuk mengakses portal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 font-normal transition-all border border-white/5 text-sm cursor-pointer active:scale-[0.98]"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    setUserRole('guest');
                    showNotification('Berhasil keluar (logout) dari aplikasi', 'text-rose-400');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-normal transition-all shadow-[0_4px_25px_rgba(225,29,72,0.3)] text-sm cursor-pointer active:scale-[0.98]"
                >
                  Ya, Keluar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attendance Modal */}
      <AnimatePresence>
        {modalState.show && modalState.type && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`w-full ${modalState.type.id === 'mengajar' || modalState.type.id === 'izin' ? 'max-w-[420px]' : 'max-w-sm'} bg-[#0a0a0f] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative transition-all duration-300`}
            >
              {/* Close Button */}
              <button 
                onClick={closeAttendanceModal}
                className="absolute top-5 right-5 z-20 p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-full transition-colors backdrop-blur-md"
              >
                <X className="w-5 h-5" />
              </button>

              {modalState.type.id === 'izin' ? (
                /* CUSTOM HEADER FOR PENGAJUAN IZIN */
                <div className="p-6 pb-2 flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-2xl">
                    <Coffee className="w-6 h-6" />
                  </div>
                  <h3 className="font-normal text-2xl text-white tracking-tight">Pengajuan Izin</h3>
                </div>
              ) : modalState.type.id === 'mengajar' ? (
                /* CUSTOM HEADER FOR SESI MENGAJAR */
                <div className="p-6 pb-2 flex items-center gap-3">
                  <GraduationCap className="w-7 h-7 text-amber-500" />
                  <h3 className="font-normal text-2xl text-white tracking-tight">Sesi Mengajar</h3>
                </div>
              ) : (
                /* REGULAR HEADER FOR ABSEN */
                <div className="p-5 border-b border-white/10 bg-white/5 flex items-center gap-3">
                  <div className={`p-2 rounded-xl bg-black/50 ${modalState.type.glow}`}>
                    {getIcon(modalState.type.iconName, `w-5 h-5 ${modalState.type.color}`)}
                  </div>
                  <div>
                    <h3 className="font-normal text-lg text-white">{modalState.type.label}</h3>
                    <p className="text-xs text-gray-400">Verifikasi kehadiran Anda</p>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
                {modalState.type.id === 'mengajar' ? (
                  /* =======================================================
                     SESI MENGAJAR FORM
                     ======================================================= */
                  <>
                    {/* Read-Only Identity Card Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col justify-center min-h-[72px]">
                        <span className="text-[10px] tracking-wider uppercase font-normal text-gray-500">IDENTITAS GURU</span>
                        <span className="text-sm font-normal text-white truncate mt-1">{nama}</span>
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col justify-center min-h-[72px]">
                        <span className="text-[10px] tracking-wider uppercase font-normal text-gray-500">NIP (VERIFIED)</span>
                        <span className="text-sm font-normal font-mono text-white truncate mt-1">{nip}</span>
                      </div>
                    </div>

                    {/* Time fields (Jam Mulai / Jam Selesai) Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-blue-400 font-normal tracking-wider text-[10px] uppercase">
                          <Clock className="w-3.5 h-3.5" />
                          <span>JAM MULAI</span>
                        </div>
                        <div className="relative">
                          <select 
                            value={jamMulai} 
                            onChange={(e) => setJamMulai(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-4 pr-10 py-3.5 text-xl font-normal text-white focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer"
                          >
                            {["07.00", "07.30", "08.00", "08.30", "08.53", "09.00", "09.30", "10.00", "10.30", "11.00", "11.30", "12.00", "12.30", "13.00", "13.30", "14.00"].map((t) => (
                              <option key={t} value={t} className="bg-[#0a0a0f] text-white font-normal">{t}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-blue-400 font-normal tracking-wider text-[10px] uppercase">
                          <Clock className="w-3.5 h-3.5" />
                          <span>JAM SELESAI</span>
                        </div>
                        <div className="relative">
                          <select 
                            value={jamSelesai} 
                            onChange={(e) => setJamSelesai(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-4 pr-10 py-3.5 text-xl font-normal text-white focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer"
                          >
                            {["07.30", "08.00", "08.30", "09.00", "09.30", "09.53", "10.00", "10.30", "11.00", "11.30", "12.00", "12.30", "13.00", "13.30", "14.00", "14.30", "15.00"].map((t) => (
                              <option key={t} value={t} className="bg-[#0a0a0f] text-white font-normal">{t}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* Room and Subject (Ruang Kelas / Mata Pelajaran) Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-blue-400 font-normal tracking-wider text-[10px] uppercase">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>RUANG / KELAS</span>
                        </div>
                        <div className="relative">
                          <select 
                            value={ruangKelas} 
                            onChange={(e) => setRuangKelas(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-4 pr-10 py-3 text-base font-normal text-white focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer"
                          >
                            {["VII - A", "VII - B", "VII - C", "VII - D", "VIII - A", "VIII - B", "VIII - C", "VIII - D", "IX - A", "IX - B", "IX - C", "IX - D"].map((r) => (
                              <option key={r} value={r} className="bg-[#0a0a0f] text-white font-normal">{r}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-blue-400 font-normal tracking-wider text-[10px] uppercase">
                          <FileText className="w-3.5 h-3.5" />
                          <span>MATA PELAJARAN</span>
                        </div>
                        <div className="relative">
                          <select 
                            value={mataPelajaran} 
                            onChange={(e) => setMataPelajaran(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-4 pr-10 py-3 text-base font-normal text-white focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer"
                          >
                            {["PAI", "Matematika", "Bahasa Indonesia", "Bahasa Inggris", "IPA", "IPS", "PJOK", "Seni Budaya", "PPKn"].map((m) => (
                              <option key={m} value={m} className="bg-[#0a0a0f] text-white font-normal">{m}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* Camera Photo section with floating pill button "BUKTI NGAJAR" */}
                    <div className="space-y-1">
                      <div className="relative rounded-[28px] overflow-hidden bg-black aspect-[3/4] border border-white/10 flex flex-col items-center justify-center text-center shadow-lg">
                        {photo ? (
                          <img src={photo} alt="Bukti Mengajar" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <>
                            {!stream && !cameraError && (
                              <div className="flex flex-col items-center gap-2">
                                <Camera className="w-8 h-8 text-gray-600 animate-pulse" />
                                <p className="text-xs text-gray-500">Menghubungkan kamera...</p>
                              </div>
                            )}
                            {cameraError && (
                              <div className="flex flex-col items-center gap-2 p-4">
                                <Camera className="w-8 h-8 text-red-500/50" />
                                <p className="text-xs text-red-400 font-normal">{cameraError}</p>
                              </div>
                            )}
                            <video 
                              ref={videoRef} 
                              autoPlay 
                              playsInline 
                              muted 
                              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${stream ? 'opacity-100' : 'opacity-0'}`}
                            />
                          </>
                        )}
                        
                        {/* Elegant Guide border overlay */}
                        <div className="absolute inset-4 border border-amber-500/20 rounded-[20px] pointer-events-none"></div>

                        {/* Floating BUKTI NGAJAR Button overlay */}
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 w-full px-6 flex justify-center">
                          {photo ? (
                            <button 
                              type="button"
                              onClick={retakePhoto}
                              className="py-3 px-6 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs uppercase tracking-wider font-normal shadow-[0_4px_20px_rgba(245,158,11,0.4)] flex items-center gap-2 transition-all active:scale-95"
                            >
                              <Camera className="w-4 h-4 shrink-0" /> Ulangi Bukti Ngajar
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={takePhoto}
                              disabled={!stream}
                              className="py-3 px-6 rounded-full bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-400 text-black text-xs uppercase tracking-wider font-normal shadow-[0_4px_20px_rgba(245,158,11,0.4)] flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Camera className="w-4 h-4 shrink-0" /> Bukti Ngajar
                            </button>
                          )}
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    </div>

                    {/* Bottom orange-yellow action button */}
                    <button
                      onClick={confirmAttendance}
                      disabled={!photo}
                      className="w-full py-4 mt-2 rounded-[20px] bg-[#F59E0B] hover:bg-amber-500 text-black font-normal transition-all shadow-[0_4px_25px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-base active:scale-[0.98]"
                    >
                      Konfirmasi Sesi Mengajar
                    </button>
                  </>
                ) : modalState.type.id === 'izin' ? (
                  /* =======================================================
                     PENGAJUAN IZIN FORM (Izin / Sakit / Dinas)
                     ======================================================= */
                  <>
                    {/* Read-Only Identity Card Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col justify-center min-h-[72px]">
                        <span className="text-[10px] tracking-wider uppercase font-normal text-gray-500">IDENTITAS GURU</span>
                        <span className="text-sm font-normal text-white truncate mt-1">{nama}</span>
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col justify-center min-h-[72px]">
                        <span className="text-[10px] tracking-wider uppercase font-normal text-gray-500">NIP (VERIFIED)</span>
                        <span className="text-sm font-normal font-mono text-white truncate mt-1">{nip}</span>
                      </div>
                    </div>

                    {/* Type selection: Izin, Sakit, Dinas */}
                    <div className="grid grid-cols-3 bg-white/[0.03] p-1.5 rounded-2xl border border-white/5">
                      {(['Izin', 'Sakit', 'Dinas'] as const).map((tab) => {
                        const isActive = izinType === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setIzinType(tab)}
                            className={`py-2.5 rounded-xl text-sm font-normal tracking-wide transition-all ${
                              isActive 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                            }`}
                          >
                            {tab}
                          </button>
                        );
                      })}
                    </div>

                    {/* Date Pickers */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-normal tracking-wider text-gray-500 uppercase">TANGGAL MULAI</span>
                        <div className="relative">
                          <input 
                            type="date"
                            value={izinMulai} 
                            onChange={(e) => setIzinMulai(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3.5 text-sm font-normal text-white focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer [color-scheme:dark]"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] font-normal tracking-wider text-gray-500 uppercase">TANGGAL SELESAI</span>
                        <div className="relative">
                          <input 
                            type="date"
                            value={izinSelesai} 
                            onChange={(e) => setIzinSelesai(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3.5 text-sm font-normal text-white focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer [color-scheme:dark]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Alasan Textarea */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-normal tracking-wider text-gray-500 uppercase">ALASAN PENGAJUAN</span>
                      <textarea
                        value={izinAlasan}
                        onChange={(e) => setIzinAlasan(e.target.value)}
                        placeholder="Tuliskan detail alasan..."
                        rows={4}
                        className="w-full bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-normal resize-none"
                      />
                    </div>

                    {/* Lampiran Upload (Optional) */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-normal tracking-wider text-indigo-400 uppercase">LAMPIRAN (OPTIONAL)</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        id="izin-file-input" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setIzinAttachment(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label 
                        htmlFor="izin-file-input"
                        className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-indigo-500/40 bg-white/[0.02] hover:bg-white/[0.04] p-6 rounded-2xl cursor-pointer transition-all gap-2 group min-h-[140px]"
                      >
                        {izinAttachment ? (
                          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/10">
                            <img src={izinAttachment} alt="Lampiran" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-xs font-normal text-white bg-black/60 px-3 py-1.5 rounded-full">Ganti File</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="p-3 bg-white/5 rounded-full text-gray-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                            <span className="text-xs text-gray-400 font-normal group-hover:text-gray-300">Klik untuk pilih foto dari galeri</span>
                          </>
                        )}
                      </label>
                    </div>

                    {/* Send Button */}
                    <button
                      onClick={confirmAttendance}
                      className="w-full py-4 rounded-[20px] bg-indigo-600 hover:bg-indigo-500 text-white font-normal transition-all shadow-[0_4px_25px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2 text-base active:scale-[0.98] mt-2"
                    >
                      Kirim Pengajuan
                    </button>
                  </>
                ) : (
                  /* =======================================================
                     REGULAR ATTENDANCE FORM (ABSEN DATANG / ABSEN PULANG)
                     ======================================================= */
                  <>
                    {/* Form Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-normal text-gray-400 mb-1">Nama Lengkap</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                          <input 
                            type="text" 
                            value={nama} 
                            onChange={(e) => setNama(e.target.value)} 
                            placeholder="Masukkan nama lengkap" 
                            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-normal"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-normal text-gray-400 mb-1">NIP</label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-normal font-mono text-gray-500">NIP</div>
                          <input 
                            type="text" 
                            value={nip} 
                            onChange={(e) => setNip(e.target.value)} 
                            placeholder="Masukkan NIP" 
                            className="w-full pl-12 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono font-normal"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Live GPS Info */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-normal text-gray-400">Live GPS</span>
                        <button 
                          type="button"
                          onClick={getLocation}
                          className="text-[10px] font-normal text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                          <Navigation className="w-2.5 h-2.5" /> Perbarui GPS
                        </button>
                      </div>
                      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="relative flex-shrink-0">
                          <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-normal text-gray-200 truncate">{location}</p>
                        </div>
                      </div>
                    </div>

                    {/* Live Selfie Section */}
                    <div className="space-y-1">
                      <span className="text-xs font-normal text-gray-400 block">Live Selfie</span>
                      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] border border-white/10 flex flex-col items-center justify-center text-center">
                        {photo ? (
                          <img src={photo} alt="Foto Absen" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <>
                            {!stream && !cameraError && (
                              <div className="flex flex-col items-center gap-1">
                                <Camera className="w-6 h-6 text-gray-600 animate-pulse" />
                                <p className="text-[10px] text-gray-500">Kamera dinonaktifkan</p>
                              </div>
                            )}
                            {cameraError && (
                              <div className="flex flex-col items-center gap-1 p-2">
                                <Camera className="w-6 h-6 text-red-500/50" />
                                <p className="text-[10px] text-red-400 font-normal">{cameraError}</p>
                              </div>
                            )}
                            <video 
                              ref={videoRef} 
                              autoPlay 
                              playsInline 
                              muted 
                              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${stream ? 'opacity-100' : 'opacity-0'}`}
                            />
                          </>
                        )}
                        {/* Overlay Guides */}
                        <div className="absolute inset-0 border-[2px] border-white/20 rounded-2xl m-3 pointer-events-none"></div>
                        <canvas ref={canvasRef} className="hidden" />
                      </div>

                      {/* Photo Actions */}
                      <div className="flex justify-center pt-1.5">
                        {photo ? (
                          <button 
                            type="button"
                            onClick={retakePhoto}
                            className="py-1.5 px-3.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-normal text-white transition-colors border border-white/5 flex items-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5" /> Ulangi Foto
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={takePhoto}
                            disabled={!stream}
                            className="py-1.5 px-3.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs font-normal text-blue-400 transition-colors border border-blue-500/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Camera className="w-3.5 h-3.5" /> Ambil Selfie
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={confirmAttendance}
                      disabled={!photo || !nama.trim() || !nip.trim()}
                      className={`w-full py-3 rounded-xl font-normal text-white transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                        modalState.type.id === 'datang' 
                          ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' 
                          : 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Kirim Kehadiran
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedPhotoUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05050A]/95 backdrop-blur-md p-4"
            onClick={() => setSelectedPhotoUrl(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-md w-full bg-[#0D0D15] border border-white/10 rounded-3xl p-3 overflow-hidden shadow-2xl" 
              onClick={e => e.stopPropagation()}
            >
              <button 
                className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-colors z-10 cursor-pointer"
                onClick={() => setSelectedPhotoUrl(null)}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-white/5 bg-black">
                <img src={selectedPhotoUrl} alt="Selfie Absensi Guru" className="w-full h-full object-cover" />
              </div>
              <div className="mt-3 text-center text-xs text-gray-400 font-normal">
                Foto Selfie Kehadiran Guru
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function getGoogleAppsScriptCode(): string {
  return `/**
 * GOOGLE APPS SCRIPT - SINKRONISASI ABSENSI SEKOLAH
 * 
 * Petunjuk Penyebaran (Deployment):
 * 1. Buka Google Sheets baru di https://sheets.new
 * 2. Klik menu 'Ekstensi' -> 'Apps Script'.
 * 3. Hapus semua kode default, lalu tempelkan seluruh kode ini.
 * 4. Klik ikon Simpan (disket).
 * 5. Klik tombol 'Terapkan' (Deploy) -> 'Penerapan baru' (New deployment).
 * 6. Pilih jenis penerapan: 'Aplikasi web' (Web app).
 * 7. Konfigurasikan:
 *    - Deskripsi: Absensi Sync
 *    - Jalankan sebagai: Saya (email Anda)
 *    - Siapa yang memiliki akses: Siapa saja (Anyone) -> SANGAT PENTING!
 * 8. Klik 'Terapkan' (Deploy), setujui izin akun Google Anda.
 * 9. Salin URL Aplikasi Web yang diberikan, lalu tempel di kolom "URL Google Apps Script" di Pengaturan Sistem aplikasi ini.
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const collection = payload.collection;
    const key = payload.key;
    const data = payload.data;
    const id = payload.id;
    
    let responseData = null;
    
    if (action === 'getAll') {
      responseData = getAllCollections();
    } else if (action === 'saveItem') {
      saveItem(collection, key, data);
      responseData = { status: 'success' };
    } else if (action === 'saveBatch') {
      saveBatch(collection, data);
      responseData = { status: 'success' };
    } else if (action === 'deleteItem') {
      deleteItem(collection, key, id);
      responseData = { status: 'success' };
    } else if (action === 'clearCollection') {
      clearCollection(collection);
      responseData = { status: 'success' };
    } else if (action === 'saveSettings') {
      saveSettings(data);
      responseData = { status: 'success' };
    } else {
      throw new Error('Action tidak dikenal: ' + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: responseData }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const data = getAllCollections();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: data }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

const COLLECTION_MAP = {
  'teachers': {
    sheetName: 'Data_Guru',
    headers: ['NIP', 'Nama', 'Peran', 'Mapel', 'Status']
  },
  'students': {
    sheetName: 'Data_Siswa',
    headers: ['NIS', 'Nama', 'Kelas', 'Barcode']
  },
  'studentRecords': {
    sheetName: 'Presensi_Siswa',
    headers: ['ID', 'Nama', 'NIS', 'Kelas', 'Waktu', 'Status']
  },
  'teachingSessions': {
    sheetName: 'KBM_Hari_Ini',
    headers: ['ID', 'Nama', 'NIP', 'Mapel', 'Kelas', 'Jam', 'Status', 'Waktu_Mulai', 'Waktu_Selesai', 'Foto_Base64', 'Link_Foto_Mengajar']
  },
  'izinRequests': {
    sheetName: 'Pengajuan_Izin',
    headers: ['ID', 'Nama', 'NIP', 'Tipe', 'Tanggal_Mulai', 'Tanggal_Selesai', 'Alasan', 'Status', 'Lampiran_Base64', 'Link_Lampiran_Drive']
  },
  'teachingSchedule': {
    sheetName: 'Jadwal_Mengajar',
    headers: ['ID', 'Hari', 'Jam', 'Kelas', 'Mapel']
  },
  'attendanceRecords': {
    sheetName: 'Presensi_Guru',
    headers: ['ID', 'Tipe', 'Tanggal', 'Waktu', 'Warna', 'Bg', 'Glow', 'Nama_Ikon', 'NIP', 'Nama', 'Foto_Base64', 'Link_Foto_Drive', 'Jarak_Lokasi', 'Status']
  },
  'holidays': {
    sheetName: 'Kalender_Akademik',
    headers: ['ID', 'Tanggal', 'Nama_Libur']
  },
  'piketSchedule': {
    sheetName: 'Jadwal_Piket',
    headers: ['ID', 'Hari', 'Daftar_NIP']
  },
  'classSubstitutions': {
    sheetName: 'Substitusi_Kelas',
    headers: ['ID', 'Tanggal', 'Kelas', 'Mapel', 'Jam', 'NIP_Absen', 'NIP_Substitusi', 'Tugas', 'Catatan', 'Status']
  },
  'systemSettings': {
    sheetName: 'Pengaturan_Sistem',
    headers: ['Kunci', 'Nilai']
  }
};

function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#0f172a')
               .setFontColor('#ffffff')
               .setFontWeight('bold')
               .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  } else {
    // Check and automatically append missing headers to preserve existing user databases
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const updatedHeaders = [...existingHeaders];
    let changed = false;
    headers.forEach(h => {
      if (existingHeaders.indexOf(h) === -1) {
        updatedHeaders.push(h);
        changed = true;
      }
    });
    if (changed) {
      sheet.getRange(1, 1, 1, updatedHeaders.length).setValues([updatedHeaders]);
      const headerRange = sheet.getRange(1, 1, 1, updatedHeaders.length);
      headerRange.setBackground('#0f172a')
                 .setFontColor('#ffffff')
                 .setFontWeight('bold')
                 .setHorizontalAlignment('center');
    }
  }
  return sheet;
}

function uploadBase64ToDrive(base64Data, fileName, folderName) {
  if (!base64Data || base64Data.indexOf('base64,') === -1) {
    return '';
  }
  try {
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    const parts = base64Data.split('base64,');
    const contentType = parts[0].split(':')[1].split(';')[0];
    const decoded = Utilities.base64Decode(parts[1]);
    const blob = Utilities.newBlob(decoded, contentType, fileName);
    
    const file = folder.createFile(blob);
    
    // Set file permission so anyone with the link can view it (important for direct rendering on client)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Generate a web-friendly direct link that can be rendered directly by browser img tags
    const fileId = file.getId();
    const directUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
    return directUrl;
  } catch (err) {
    return 'Error upload: ' + err.toString();
  }
}

function objectToRow(headers, data) {
  const row = [];
  headers.forEach(header => {
    const reactKey = getReactKeyForHeader(header);
    let val = data[reactKey];
    if (reactKey === 'name' && (val === undefined || val === null || val === '')) {
      val = data['nama'];
    }
    if (reactKey === 'nama' && (val === undefined || val === null || val === '')) {
      val = data['name'];
    }
    if (val === undefined || val === null) {
      val = '';
    } else if (typeof val === 'object') {
      val = JSON.stringify(val);
    }
    row.push("'" + String(val));
  });
  return row;
}

function getReactKeyForHeader(header) {
  const map = {
    'NIP': 'nip', 'Nama': 'name', 'Peran': 'role', 'Mapel': 'mapel', 'Status': 'status',
    'NIS': 'nis', 'Kelas': 'kelas', 'Barcode': 'barcode',
    'ID': 'id', 'Waktu': 'time',
    'Waktu_Mulai': 'timeStarted', 'Waktu_Selesai': 'timeEnded', 'Jam': 'jam',
    'Tipe': 'type', 'Tanggal_Mulai': 'tanggalMulai', 'Tanggal_Selesai': 'tanggalSelesai', 'Alasan': 'alasan', 'Lampiran_Base64': 'attachment',
    'Link_Lampiran_Drive': 'attachmentDriveLink',
    'Hari': 'day',
    'Tanggal': 'date', 'Warna': 'color', 'Bg': 'bg', 'Glow': 'glow', 'Nama_Ikon': 'iconName', 'Foto_Base64': 'photo',
    'Link_Foto_Drive': 'photoDriveLink',
    'Link_Foto_Mengajar': 'photoLink',
    'Jarak_Lokasi': 'location',
    'Nama_Libur': 'name',
    'Daftar_NIP': 'teacherNips',
    'NIP_Absen': 'absentTeacherNip', 'NIP_Substitusi': 'substituteTeacherNip', 'Tugas': 'task', 'Catatan': 'notes',
    'Kunci': 'kunci', 'Nilai': 'nilai'
  };
  return map[header] || header.toLowerCase();
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    const reactKey = getReactKeyForHeader(header);
    let val = row[index];
    if (val === undefined || val === null) {
      val = '';
    } else {
      const valStr = String(val).trim();
      if ((valStr.startsWith('{') && valStr.endsWith('}')) || (valStr.startsWith('[') && valStr.endsWith(']'))) {
        try {
          val = JSON.parse(valStr);
        } catch (e) {
          // keep as string
        }
      }
    }
    obj[reactKey] = val;
    if (reactKey === 'name') {
      obj['nama'] = val;
    }
    if (reactKey === 'nama') {
      obj['name'] = val;
    }
  });
  return obj;
}

function getAllCollections() {
  const data = {};
  Object.keys(COLLECTION_MAP).forEach(colKey => {
    const colInfo = COLLECTION_MAP[colKey];
    const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      items.push(rowToObject(headers, rows[i]));
    }
    data[colKey] = items;
  });
  return data;
}

function saveItem(collection, keyName, itemData) {
  const colInfo = COLLECTION_MAP[collection];
  if (!colInfo) return;

  // -- AUTOMATIC GOOGLE DRIVE BASE64 IMAGE UPLOADER --
  if (collection === 'attendanceRecords' && itemData.photo) {
    if (String(itemData.photo).startsWith('data:image/')) {
      const fileName = 'Selfie_' + (itemData.nip || '') + '_' + (itemData.nama || itemData.name || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (itemData.date || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (itemData.time || '').replace(/[^a-zA-Z0-9]/g, '-') + '.jpg';
      const driveUrl = uploadBase64ToDrive(itemData.photo, fileName, 'Foto_Absensi_Sekolah');
      itemData.photoDriveLink = driveUrl;
    }
  }
  
  if (collection === 'teachingSessions' && itemData.photo) {
    if (String(itemData.photo).startsWith('data:image/')) {
      const fileName = 'KBM_' + (itemData.nip || '') + '_' + (itemData.name || itemData.nama || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (itemData.date || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (itemData.timeStarted || '').replace(/[^a-zA-Z0-9]/g, '-') + '.jpg';
      const driveUrl = uploadBase64ToDrive(itemData.photo, fileName, 'Foto_Absensi_KBM');
      itemData.photoLink = driveUrl;
    }
  }
  
  if (collection === 'izinRequests' && itemData.attachment) {
    if (String(itemData.attachment).startsWith('data:image/')) {
      const fileName = 'Izin_' + (itemData.nip || '') + '_' + (itemData.name || itemData.nama || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (itemData.tanggalMulai || '').replace(/[^a-zA-Z0-9]/g, '_') + '.jpg';
      const driveUrl = uploadBase64ToDrive(itemData.attachment, fileName, 'Lampiran_Izin_Sekolah');
      itemData.attachmentDriveLink = driveUrl;
    }
  }
  
  const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  
  const keyIndex = headers.indexOf(getKeyHeaderInIndonesian(keyName));
  const rowData = objectToRow(headers, itemData);
  
  if (keyIndex >= 0 && rows.length > 1) {
    const lookupVal = String(itemData[keyName]).trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][keyIndex]).trim() === lookupVal) {
        const range = sheet.getRange(i + 1, 1, 1, headers.length);
        range.setNumberFormat("@");
        range.setValues([rowData]);
        return;
      }
    }
  }
  const appendRange = sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowData.length);
  appendRange.setNumberFormat("@");
  appendRange.setValues([rowData]);
}

function getKeyHeaderInIndonesian(keyName) {
  const map = {
    'nip': 'NIP',
    'nis': 'NIS',
    'id': 'ID',
    'kunci': 'Kunci'
  };
  return map[keyName] || keyName.toUpperCase();
}

function saveBatch(collection, batchData) {
  const colInfo = COLLECTION_MAP[collection];
  if (!colInfo) return;
  
  const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, colInfo.headers.length).clearContent();
  }
  
  if (batchData && batchData.length > 0) {
    const headers = colInfo.headers;
    const rowsToAppend = batchData.map(item => objectToRow(headers, item));
    const currentMaxRows = sheet.getMaxRows();
    const neededRows = rowsToAppend.length + 1;
    if (currentMaxRows < neededRows) {
      sheet.insertRowsAfter(currentMaxRows, neededRows - currentMaxRows);
    }
    const range = sheet.getRange(2, 1, rowsToAppend.length, headers.length);
    range.setNumberFormat("@");
    range.setValues(rowsToAppend);
  }
}

function deleteItem(collection, keyName, idValue) {
  const colInfo = COLLECTION_MAP[collection];
  if (!colInfo) return;
  
  const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  
  const keyIndex = headers.indexOf(getKeyHeaderInIndonesian(keyName));
  if (keyIndex >= 0 && rows.length > 1) {
    const lookupVal = String(idValue).trim();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][keyIndex]).trim() === lookupVal) {
        sheet.deleteRow(i + 1);
      }
    }
  }
}

function clearCollection(collection) {
  const colInfo = COLLECTION_MAP[collection];
  if (!colInfo) return;
  
  const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, colInfo.headers.length).clearContent();
  }
}

function saveSettings(settingsList) {
  const colInfo = COLLECTION_MAP['systemSettings'];
  const sheet = getOrCreateSheet(colInfo.sheetName, colInfo.headers);
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }
  
  if (settingsList && settingsList.length > 0) {
    const rowsToAppend = settingsList.map(item => [item.kunci, "'" + String(item.nilai)]);
    const currentMaxRows = sheet.getMaxRows();
    const neededRows = rowsToAppend.length + 1;
    if (currentMaxRows < neededRows) {
      sheet.insertRowsAfter(currentMaxRows, neededRows - currentMaxRows);
    }
    const range = sheet.getRange(2, 1, rowsToAppend.length, 2);
    range.setNumberFormat("@");
    range.setValues(rowsToAppend);
  }
}
`;
}

