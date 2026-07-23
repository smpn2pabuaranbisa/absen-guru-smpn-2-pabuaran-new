const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  `    lateTolerance: 15,
    latitude: "-6.123456",`,
  `    lateTolerance: 15,
    daySchedules: {
      0: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Minggu
      1: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Senin
      2: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Selasa
      3: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Rabu
      4: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Kamis
      5: { entryLimit: "07:00", exitLimit: "11:10", lateTolerance: 15 }, // Jumat
      6: { entryLimit: "07:00", exitLimit: "15:00", lateTolerance: 15 }, // Sabtu
    },
    latitude: "-6.123456",`
);
fs.writeFileSync('src/App.tsx', code);
