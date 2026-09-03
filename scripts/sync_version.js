const fs = require('fs');
const path = require('path');
const os = require('os');

const logFile = path.join(__dirname, 'omen_startup_debug.log');

try {
    const errPath = 'C:\\Users\\ebola\\.pm2\\logs\\musica-error.log';
    if (fs.existsSync(errPath)) {
        const lines = fs.readFileSync(errPath, 'utf8').split('\n').slice(-30).join('\n');
        fs.writeFileSync(logFile, `\n=== ERROR REAL DE CRASH EN OMEN ===\n${lines}\n`, { flag: 'a' });
    } else {
        fs.writeFileSync(logFile, `\nNo existe ${errPath}\n`, { flag: 'a' });
    }
} catch(e) {
    fs.writeFileSync(logFile, `Excepción leyendo log: ${e.message}\n`, { flag: 'a' });
}
