const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'analyses_db.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// El esquema "legacy" (usado p.ej. por scripts/build_db.js) no tiene un array `sections`,
// sino claves sueltas section1_title/section1_points/section2_title/... Hay que reconocerlo
// como válido o se purgan por error reseñas reales solo por no tener el esquema nuevo.
function hasLegacySections(analysis) {
    return !!(analysis.section1_title || analysis.section1_points);
}

function isGeneric(analysis) {
    if (!analysis) return true;
    if (hasLegacySections(analysis)) return false;
    if (!analysis.sections || analysis.sections.length === 0) return true;
    if (analysis.synopsis && analysis.synopsis.includes("es una pieza fundamental dentro de su género")) return true;
    if (analysis.sections[0] && analysis.sections[0].points && analysis.sections[0].points[0] && analysis.sections[0].points[0].name === "El punto de inflexión creativo") return true;
    return false;
}

let deleted = 0;
let kept = 0;
const cleanDb = {};

for (const [key, val] of Object.entries(db)) {
    if (isGeneric(val)) {
        deleted++;
    } else {
        cleanDb[key] = val;
        kept++;
    }
}

console.log(`Reseñas ficticias / genéricas a eliminar: ${deleted}`);
console.log(`Reseñas reales a conservar: ${kept}`);

// Backup de seguridad antes de sobrescribir, por si el resultado no es el esperado.
const backupPath = DB_PATH.replace(/\.json$/, `.purge_backup_${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`💾 Backup guardado en: ${backupPath}`);

fs.writeFileSync(DB_PATH, JSON.stringify(cleanDb, null, 2), 'utf8');
console.log('✅ Base de datos limpiada con éxito.');
