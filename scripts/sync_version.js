const { execSync } = require('child_process');
const fs = require('fs');

const candidates = [
    'C:\\Users\\ebola\\AppData\\Local\\Programs\\Python',
    'C:\\Program Files\\Python310',
    'C:\\Program Files\\Python311',
    'C:\\Program Files\\Python312',
    'C:\\Python310',
    'C:\\Python311',
    'C:\\Python312',
    'D:\\Python'
];

const found = [];
for (const c of candidates) {
    if (fs.existsSync(c)) {
        found.push(c);
    }
}

fs.writeFileSync('d:\\03_Trabajo\\Musica\\scripts\\omen_python_paths.log', found.join('\n'), 'utf8');
