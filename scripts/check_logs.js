const fs = require('fs');

try {
    const lines = fs.readFileSync('C:\\Users\\ebola\\.pm2\\logs\\musica-out.log', 'utf8').split('\n').slice(-40);
    console.log('--- OMEN OUT LOG ---');
    console.log(lines.join('\n'));

    const errLines = fs.readFileSync('C:\\Users\\ebola\\.pm2\\logs\\musica-error.log', 'utf8').split('\n').slice(-40);
    console.log('--- OMEN ERR LOG ---');
    console.log(errLines.join('\n'));
} catch(e) {
    console.log('Error leyendo logs:', e.message);
}
