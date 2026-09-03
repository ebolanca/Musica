const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const outLog = path.join(home, '.pm2/logs/musica-out.log');
const errLog = path.join(home, '.pm2/logs/musica-error.log');

const logFile = path.join(__dirname, 'omen_startup_debug.log');

if (fs.existsSync(errLog)) {
    const errContent = fs.readFileSync(errLog, 'utf8').split('\n').slice(-30).join('\n');
    fs.writeFileSync(logFile, `\n--- ÚLTIMAS LÍNEAS DE ERROR ---\n${errContent}\n`, { flag: 'a' });
}
if (fs.existsSync(outLog)) {
    const outContent = fs.readFileSync(outLog, 'utf8').split('\n').slice(-30).join('\n');
    fs.writeFileSync(logFile, `\n--- ÚLTIMAS LÍNEAS DE OUT ---\n${outContent}\n`, { flag: 'a' });
}
