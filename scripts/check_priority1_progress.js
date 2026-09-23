const fs = require('fs');
const PROGRESS_FILE = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\data\\priority1_progress.json";

if (!fs.existsSync(PROGRESS_FILE)) {
    console.log('No se ha iniciado aún el proceso.');
    process.exit(0);
}

const state = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
const completedKeys = Object.keys(state.completed || {});
const failedKeys = Object.keys(state.failed || {});

console.log('=== ESTADO DEL PROCESO DE PRIORIDAD 1 ===');
console.log(`✅ Completadas: ${completedKeys.length}`);
console.log(`⚠️ Fallidas: ${failedKeys.length}`);

if (completedKeys.length > 0) {
    console.log('\nÚltimas 5 canciones completadas:');
    completedKeys.slice(-5).forEach(k => {
        const item = state.completed[k];
        const name = k.split(':::')[1] || k;
        console.log(`- ${name} | Ganancia: +${item.gain || 0} dB | Nuevo volumen: ${item.newMean} dB`);
    });
}
