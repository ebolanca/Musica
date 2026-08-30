const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'analyses_db.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

function isGeneric(analysis) {
    if (!analysis) return true;
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

console.log(`Reseñas ficticias / genéricas eliminadas: ${deleted}`);
console.log(`Reseñas reales conservadas intactas: ${kept}`);

fs.writeFileSync(DB_PATH, JSON.stringify(cleanDb, null, 2), 'utf8');
console.log('✅ Base de datos limpiada con éxito.');
