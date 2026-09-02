const fs = require('fs');
const path = require('path');

const baseDir = '\\\\100.95.217.45\\omen D\\media-library\\music';
const folders = fs.readdirSync(baseDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !/dance/i.test(d.name))
  .map(d => d.name);

function cleanFileName(fileName) {
    const ext = path.extname(fileName);
    let name = path.basename(fileName, ext);
    name = name
        .replace(/\s*-\s*\d{4}\s*Remaster.*/i, '')
        .replace(/\s*-\s*Remastered\s*\d{4}.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .replace(/\s*-\s*Remaster.*/i, '')
        .replace(/\s*-\s*Live\s*In\s+.*$/i, '')
        .replace(/\s*-\s*Live\b.*/i, '')
        .replace(/\s*-\s*Acoustic.*/i, '')
        .replace(/\s*-\s*Radio Edit.*/i, '')
        .replace(/\s*-\s*Radio Mix.*/i, '')
        .replace(/\s*-\s*Single Version.*/i, '')
        .replace(/\s*-\s*\d{4}\s*Version.*/i, '')
        .replace(/\s*-\s*\d{4}\s*Remastered\s*Version.*/i, '')
        .replace(/\s*-\s*Edit\b.*/i, '')
        .trim();
    return name + ext;
}

let renamedCount = 0;
for (const f of folders) {
  const fPath = path.join(baseDir, f);
  const files = fs.readdirSync(fPath);
  for (const file of files) {
    const cleaned = cleanFileName(file);
    if (cleaned !== file && cleaned.length > 5) {
      const oldPath = path.join(fPath, file);
      const newPath = path.join(fPath, cleaned);
      try {
        if (fs.existsSync(newPath)) {
          // Si ya existe la versión original limpia, eliminamos el archivo con sufijo de remaster/edit
          fs.unlinkSync(oldPath);
          console.log(`🗑️ Eliminado duplicado remaster: [${f}] ${file}`);
        } else {
          fs.renameSync(oldPath, newPath);
          console.log(`✅ Renombrado a original: [${f}] ${file} => ${cleaned}`);
        }
        renamedCount++;
      } catch(err) {
        console.error(`Error procesando ${file}:`, err.message);
      }
    }
  }
}
console.log(`\n🎉 Limpieza de archivos MP3 completada: ${renamedCount} archivos procesados.`);
