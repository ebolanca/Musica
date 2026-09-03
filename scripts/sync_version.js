const fs = require('fs');
const path = require('path');
const os = require('os');

const logFile = path.join(__dirname, 'omen_startup_debug.log');
fs.writeFileSync(logFile, `Iniciando sync_version.js en Host: ${os.hostname()} a las ${new Date().toISOString()}\n`, { flag: 'a' });

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const newVersion = process.argv[2];
if (newVersion) {
    pkg.version = newVersion.replace('v', '');
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

fs.writeFileSync(logFile, `Versión fijada a: ${pkg.version}\n`, { flag: 'a' });

// Ejecutar levantamiento PM2
const { execSync } = require('child_process');
try {
    fs.writeFileSync(logFile, 'Ejecutando pm2 start...\n', { flag: 'a' });
    // Probar npx pm2 o ruta completa
    const out = execSync('npx pm2 start server.js --name musica || pm2 start server.js --name musica || pm2 restart musica', {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
    });
    fs.writeFileSync(logFile, `Resultado PM2 Start: ${out}\n`, { flag: 'a' });
    const saveOut = execSync('npx pm2 save || pm2 save', { encoding: 'utf8' });
    fs.writeFileSync(logFile, `Resultado PM2 Save: ${saveOut}\n`, { flag: 'a' });
} catch(e) {
    fs.writeFileSync(logFile, `ERROR en PM2: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}\n`, { flag: 'a' });
}
