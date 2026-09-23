const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOCAL_OMEN_MUSIC = "D:\\media-library\\music";
const REMOTE_OMEN_MUSIC = "\\\\100.95.217.45\\omen D\\media-library\\music";
const OMEN_MUSIC_DIR = fs.existsSync(LOCAL_OMEN_MUSIC) ? LOCAL_OMEN_MUSIC : REMOTE_OMEN_MUSIC;
const FFMPEG = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\bin\\ffmpeg.exe";
const OUTPUT_FILE = path.join(__dirname, '../data/audio_quality_audit.json');

console.log('🎵 Iniciando Auditoría de Calidad de Audio (Bitrate y Volumen)...');
console.log('📂 Directorio de música:', OMEN_MUSIC_DIR);
console.log('⚙️ Binario FFmpeg:', FFMPEG);

if (!fs.existsSync(OMEN_MUSIC_DIR)) {
    console.error('❌ Error: No se puede acceder a OMEN_MUSIC_DIR');
    process.exit(1);
}

// 1. Recolectar todos los archivos
const folders = fs.readdirSync(OMEN_MUSIC_DIR, { withFileTypes: true });
const allTasks = [];

for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    const category = folder.name;
    const folderPath = path.join(OMEN_MUSIC_DIR, category);
    try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (['.mp3', '.m4a', '.flac', '.ogg'].includes(ext)) {
                allTasks.push({
                    category,
                    file,
                    fullPath: path.join(folderPath, file),
                    ext
                });
            }
        }
    } catch(e) {
        console.warn(`Aviso leyendo ${category}:`, e.message);
    }
}

console.log(`📊 Total de archivos encontrados para auditar: ${allTasks.length}`);

// 2. Función de análisis individual con FFmpeg
function analyzeAudio(task) {
    return new Promise((resolve) => {
        let sizeBytes = 0;
        try {
            sizeBytes = fs.statSync(task.fullPath).size;
        } catch(e){}

        const sizeMB = +(sizeBytes / (1024 * 1024)).toFixed(2);

        // Analizamos muestra de 60 segundos saltando los primeros 25s
        const args = [
            '-ss', '25',
            '-t', '60',
            '-i', task.fullPath,
            '-filter:a', 'volumedetect',
            '-f', 'null',
            '-'
        ];

        const proc = spawn(FFMPEG, args, { windowsHide: true });
        let stderr = '';

        proc.stderr.on('data', (d) => {
            stderr += d.toString();
        });

        const timer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch(e){}
            resolve({
                category: task.category,
                file: task.file,
                sizeMB,
                ext: task.ext,
                bitrate: 0,
                maxVolume: null,
                meanVolume: null,
                error: 'Timeout'
            });
        }, 12000);

        proc.on('close', () => {
            clearTimeout(timer);

            // Bitrate
            const bitrateMatch = stderr.match(/bitrate:\s*([0-9]+)\s*kb\/s/i);
            const bitrate = bitrateMatch ? parseInt(bitrateMatch[1], 10) : 0;

            // Duration
            const durMatch = stderr.match(/Duration:\s*([0-9:]+\.[0-9]+)/i);
            const durationStr = durMatch ? durMatch[1] : '';

            // Volume
            const maxVolMatch = stderr.match(/max_volume:\s*([-0-9.]+)\s*dB/i);
            const meanVolMatch = stderr.match(/mean_volume:\s*([-0-9.]+)\s*dB/i);

            const maxVolume = maxVolMatch ? parseFloat(maxVolMatch[1]) : null;
            const meanVolume = meanVolMatch ? parseFloat(meanVolMatch[1]) : null;

            resolve({
                category: task.category,
                file: task.file,
                sizeMB,
                ext: task.ext,
                duration: durationStr,
                bitrate,
                maxVolume,
                meanVolume
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                category: task.category,
                file: task.file,
                sizeMB,
                ext: task.ext,
                bitrate: 0,
                maxVolume: null,
                meanVolume: null,
                error: err.message
            });
        });
    });
}

// 3. Pool de concurrencia (8 tareas simultáneas)
async function runAudit() {
    const CONCURRENCY = 8;
    const results = [];
    let completed = 0;
    const total = allTasks.length;
    const startTime = Date.now();

    console.log(`🚀 Ejecutando análisis con concurrencia ${CONCURRENCY}...`);

    let taskIndex = 0;

    async function worker() {
        while (taskIndex < allTasks.length) {
            const currentIndex = taskIndex++;
            const task = allTasks[currentIndex];
            const res = await analyzeAudio(task);

            // Clasificación
            // Consideramos bitrate bajo si es inferior a 315 kbps (para dar margen a VBR de ~318k)
            const isLowBitrate = res.bitrate > 0 && res.bitrate < 315;
            // Consideramos volumen bajo si max_volume <= -4.0 dB o mean_volume <= -21.0 dB
            const isCriticalLowVol = res.maxVolume !== null && (res.maxVolume <= -5.5 || res.meanVolume <= -23.0);
            const isModerateLowVol = res.maxVolume !== null && !isCriticalLowVol && (res.maxVolume <= -3.8 || res.meanVolume <= -20.5);

            res.isLowBitrate = isLowBitrate;
            res.lowVolumeLevel = isCriticalLowVol ? 'CRITICAL' : (isModerateLowVol ? 'MODERATE' : 'NORMAL');
            res.needsReplacement = isLowBitrate || isCriticalLowVol || isModerateLowVol;

            results.push(res);
            completed++;

            if (completed % 100 === 0 || completed === total) {
                const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
                const percent = ((completed / total) * 100).toFixed(1);
                console.log(`⏱️ [${elapsedSec}s] Progreso: ${completed}/${total} (${percent}%) analizadas`);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Auditoría completa en ${totalTimeSec} segundos.`);

    // 4. Estadísticas
    const stats = {
        totalAudited: results.length,
        auditDate: new Date().toISOString(),
        categories: {},
        bitrateStats: {
            exactOrOver320: 0,
            between256and315: 0,
            between192and255: 0,
            between128and191: 0,
            below128: 0,
            unknown: 0
        },
        volumeStats: {
            normal: 0,
            moderateLow: 0,
            criticalLow: 0,
            unknown: 0
        },
        combinedIssues: {
            bothLowBitrateAndLowVolume: 0,
            onlyLowBitrate: 0,
            onlyLowVolume: 0,
            cleanAndPerfect: 0
        }
    };

    results.forEach(r => {
        // Categorías
        if (!stats.categories[r.category]) {
            stats.categories[r.category] = { total: 0, lowBitrate: 0, lowVolume: 0, both: 0 };
        }
        stats.categories[r.category].total++;

        // Bitrates
        const br = r.bitrate;
        if (br >= 315) stats.bitrateStats.exactOrOver320++;
        else if (br >= 256) stats.bitrateStats.between256and315++;
        else if (br >= 192) stats.bitrateStats.between192and255++;
        else if (br >= 128) stats.bitrateStats.between128and191++;
        else if (br > 0) stats.bitrateStats.below128++;
        else stats.bitrateStats.unknown++;

        // Volumen
        if (r.lowVolumeLevel === 'CRITICAL') stats.volumeStats.criticalLow++;
        else if (r.lowVolumeLevel === 'MODERATE') stats.volumeStats.moderateLow++;
        else if (r.maxVolume !== null) stats.volumeStats.normal++;
        else stats.volumeStats.unknown++;

        // Combinado
        const lowVol = r.lowVolumeLevel !== 'NORMAL';
        if (r.isLowBitrate && lowVol) {
            stats.combinedIssues.bothLowBitrateAndLowVolume++;
            stats.categories[r.category].both++;
            stats.categories[r.category].lowBitrate++;
            stats.categories[r.category].lowVolume++;
        } else if (r.isLowBitrate) {
            stats.combinedIssues.onlyLowBitrate++;
            stats.categories[r.category].lowBitrate++;
        } else if (lowVol) {
            stats.combinedIssues.onlyLowVolume++;
            stats.categories[r.category].lowVolume++;
        } else {
            stats.combinedIssues.cleanAndPerfect++;
        }
    });

    // Guardar archivo completo
    const finalReport = {
        summary: stats,
        tracks: results
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');
    console.log(`💾 Reporte guardado con éxito en: ${OUTPUT_FILE}`);
}

runAudit();
