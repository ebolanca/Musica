const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OMEN_CACHE_PATH = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_VIDEOS_DIR = "\\\\100.95.217.45\\omen D\\media-library\\music-videos";
const ANALYSES_DB_PATH = path.join(__dirname, 'data', 'analyses_db.json');

// Servir la carpeta de videoclips de OMEN como estática si está disponible
if (fs.existsSync(OMEN_VIDEOS_DIR)) {
    app.use('/media-videos', express.static(OMEN_VIDEOS_DIR));
}

let cachedAnalyses = {};
if (fs.existsSync(ANALYSES_DB_PATH)) {
    try {
        cachedAnalyses = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8'));
    } catch (e) {
        console.error("Error cargando analyses_db.json:", e.message);
    }
}

// Función auxiliar para escanear archivos de vídeo y letras
function scanVideoFiles() {
    const videoFilesMap = new Map();
    if (!fs.existsSync(OMEN_VIDEOS_DIR)) return videoFilesMap;

    try {
        const folders = fs.readdirSync(OMEN_VIDEOS_DIR, { withFileTypes: true });
        for (const folder of folders) {
            if (!folder.isDirectory()) continue;
            const category = folder.name;
            const folderPath = path.join(OMEN_VIDEOS_DIR, category);
            const files = fs.readdirSync(folderPath);

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const baseName = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
                
                if (!videoFilesMap.has(baseName)) {
                    videoFilesMap.set(baseName, { category, mp4: null, srt: null, lrc: null, rawName: file });
                }
                const entry = videoFilesMap.get(baseName);
                if (ext === '.mp4') entry.mp4 = path.join(category, file);
                if (ext === '.srt') entry.srt = path.join(category, file);
                if (ext === '.lrc') entry.lrc = path.join(category, file);
            }
        }
    } catch (e) {
        console.error("Error escaneando carpeta de videoclips:", e.message);
    }
    return videoFilesMap;
}

// API: Obtener todas las playlists y sus canciones
app.get('/api/playlists', (req, res) => {
    let playlistsData = {};

    if (fs.existsSync(OMEN_CACHE_PATH)) {
        try {
            playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
        } catch (e) {
            console.error("Error leyendo tracks_cache.json de OMEN:", e.message);
        }
    }

    // Datos por defecto/backup si no se puede leer el caché remoto
    if (Object.keys(playlistsData).length === 0) {
        playlistsData = {
            "Música viejuna": [
                ["Michael Jackson", "Beat It"],
                ["The Corrs", "Runaway"],
                ["The Connells", "74-75"],
                ["Simple Minds", "Don't You (Forget About Me)"],
                ["Roxette", "The Look"]
            ],
            "Siglo XXI": [
                ["Coldplay", "Yellow"],
                ["The Killers", "Mr. Brightside"],
                ["OneRepublic", "Counting Stars"],
                ["Twenty One Pilots", "Stressed Out"],
                ["Gotye, Kimbra", "Somebody That I Used To Know"]
            ],
            "Dance": [
                ["Gala", "Freed from Desire"],
                ["Corona", "The Rhythm of the Night"],
                ["Gigi D'Agostino", "L'Amour Toujours"],
                ["Alice Deejay", "Better Off Alone"]
            ],
            "Española": [
                ["Fito & Fitipaldis", "Soldadito Marinero"],
                ["El Canto del Loco", "Zapatillas"],
                ["Amaral", "Sin Ti No Soy Nada"],
                ["La Oreja de Van Gogh", "Rosas"]
            ],
            "Música latina": [
                ["Juanes", "La Camisa Negra"],
                ["Shakira", "Whenever, Wherever"],
                ["Maná", "Clavado En Un Bar"],
                ["Carlos Vives", "La Gota Fría"]
            ]
        };
    }

    const videoMap = scanVideoFiles();

    // Enriquecer cada canción con el estado del videoclip y letras
    const response = {};
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        response[listName] = tracks.map(item => {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const title = Array.isArray(item) ? item[1] : item.title;
            const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');

            let videoInfo = videoMap.get(cleanKey);
            if (!videoInfo) {
                // Intento de emparejamiento por título si el nombre de archivo es ligeramente distinto
                const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const [k, v] of videoMap.entries()) {
                    if (k.includes(titleKey)) {
                        videoInfo = v;
                        break;
                    }
                }
            }

            return {
                artist: artist,
                title: title,
                hasVideo: !!(videoInfo && videoInfo.mp4),
                hasLyrics: !!(videoInfo && (videoInfo.srt || videoInfo.lrc)),
                videoPath: videoInfo && videoInfo.mp4 ? `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}` : null,
                srtPath: videoInfo && videoInfo.srt ? `/media-videos/${videoInfo.srt.replace(/\\/g, '/')}` : null,
                lrcPath: videoInfo && videoInfo.lrc ? `/media-videos/${videoInfo.lrc.replace(/\\/g, '/')}` : null,
                hasAnalysis: !!cachedAnalyses[`${artist} - ${title}`]
            };
        });
    }

    res.json(response);
});

// Helper para parsear archivos .srt o .lrc a array de objetos { time, text }
function parseLyricsFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const result = [];

    const srtRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    let currentTime = null;
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const srtMatch = line.match(srtRegex);
        if (srtMatch) {
            const h = parseInt(srtMatch[1], 10);
            const m = parseInt(srtMatch[2], 10);
            const s = parseInt(srtMatch[3], 10);
            currentTime = `${String(h * 60 + m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            continue;
        }

        const lrcMatch = line.match(lrcRegex);
        if (lrcMatch) {
            const m = lrcMatch[1];
            const s = lrcMatch[2];
            const text = lrcMatch[4].trim();
            if (text) {
                result.push({ time: `${m}:${s}`, text });
            }
            continue;
        }

        if (currentTime && !/^\d+$/.test(line)) {
            result.push({ time: currentTime, text: line });
            currentTime = null;
        }
    }

    return result.length > 0 ? result : [{ time: '00:00', text: content }];
}

// API: Obtener detalle completo de una canción (Créditos, Letras, Análisis 4 Puntos)
app.get('/api/track/detail', (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) {
        return res.status(400).json({ error: 'Se requieren los parámetros artist y title' });
    }

    const key = `${artist} - ${title}`;
    let analysis = cachedAnalyses[key];

    // Buscar coincidencia parcial si no es exacta
    if (!analysis) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [k, v] of Object.entries(cachedAnalyses)) {
            if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey) {
                analysis = v;
                break;
            }
        }
    }

    // Generador dinámico enriquecido de análisis si no existe un análisis pre-creado
    if (!analysis) {
        analysis = {
            title: title,
            artist: artist,
            year: "Clásico de Radio",
            album: "Colección Éxitos",
            label: "Sello Discográfico Principal",
            composers: [artist],
            producers: ["Productor de Radio"],
            synopsis: `Análisis sónico e histórico de "${title}", uno de los himnos indispensables de ${artist} en la historia de la radiofórmula española.`,
            origin_story: `"${title}" representa un punto de inflexión en la trayectoria musical de ${artist}. Compuesta con una visión de gran calado sonoro y grabada bajo estándares de producción de primer nivel, la canción logró una rotación masiva en emisoras como Los 40 Principales, Cadena 100 y Kiss FM, convirtiéndose en un referente sonoro de su época.\n\nAnalizamos esta pieza clave a través de nuestro microscopio sónico de cuatro puntos.`,
            section1_title: "1. La Anatomía Musical: Arquitectura e Instrumental",
            section1_text: `La producción de "${title}" destaca por una instrumentación equilibrada y hooks melódicos memorables:`,
            section1_points: [
                {
                    name: "Base Rítmica y Grooves",
                    desc: `El tema se apoya en una sección rítmica sólida que marca la pulsación del sonido característico de ${artist}, combinando baterías acústicas o electrónicas con líneas de bajo envolventes.`
                },
                {
                    name: "Arreglos y Capas de Producción",
                    desc: "La mezcla mantiene las frecuencias limpias permitiendo que las guitarras, sintetizadores y arreglos de viento o cuerdas destaquen sin saturar el espectro."
                }
            ],
            section2_title: "2. El Análisis Lírico: Significado Profundo, Metáforas y Desglose",
            section2_text: `La letra de "${title}" explora emociones profundas y vivencias personales que conectan de forma directa con el oyente:`,
            section2_points: [
                {
                    name: "Estrofas Principales: El conflicto y la narrativa",
                    quote: `Texto original de "${title}"`,
                    analysis: `En el desarrollo lírico, ${artist} utiliza metáforas sobre la superación, las relaciones humanas o las vivencias de la calle, construyendo una atmósfera lírica íntima y directa.`
                },
                {
                    name: "El Estribillo: El clímax emocional",
                    vocab: "Expresiones clave y recursos poéticos del tema.",
                    analysis: "El estribillo funciona como la resolución del conflicto, reforzando la idea central del tema con una melodía vocal expansiva y memorable."
                }
            ],
            section3_title: "3. El Videoclip: Narrativa Visual y Dirección Artística",
            section3_text: `La producción audiovisual de "${title}" complementa la carga emocional de la canción:`,
            section3_points: [
                {
                    name: "Estética y Rodaje",
                    desc: "El tratamiento de color, la iluminación y los planos cinematográficos refuerzan el concepto del tema, convirtiendo el videoclip en una pieza emblemática de la televisión musical."
                }
            ],
            section4_title: "4. El Impacto Cultural: Recepción y Legado en Radios",
            section4_text: `"${title}" se consolidó como un éxito duradero en la memoria musical colectiva:`,
            section4_points: [
                {
                    name: "Resonancia Radiofónica",
                    desc: "La canción alcanzó los puestos más altos en las listas de éxitos de España y mantiene una presencia constante en programaciones de clásicos e himnos generacionales."
                }
            ]
        };
    }

    // Buscar letra sincronizada real si existe en el sistema
    let parsedLyrics = null;
    const videoMap = scanVideoFiles();
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const videoInfo = videoMap.get(cleanKey);

    if (videoInfo) {
        if (videoInfo.srt) {
            parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.srt));
        } else if (videoInfo.lrc) {
            parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.lrc));
        }
    }

    if (!parsedLyrics) {
        parsedLyrics = [
            { time: "00:05", text: `Letra de ${title} por ${artist}` },
            { time: "00:15", text: "Escuchando música y disfrutando de los videoclips..." },
            { time: "00:30", text: "Para añadir las letras sincronizadas (.srt/.lrc), usa el botón de refresco." }
        ];
    }

    res.json({
        artist: artist,
        title: title,
        year: analysis.year || 2000,
        album: analysis.album || "Álbum de Éxitos",
        label: analysis.label || "Discográfica",
        composers: analysis.composers || [artist],
        producers: analysis.producers || ["Productor"],
        analysis: analysis,
        lyrics: parsedLyrics,
        videoUrl: videoInfo && videoInfo.mp4 ? `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}` : null
    });
});

// API: Refrescar biblioteca de Jellyfin
app.post('/api/jellyfin/refresh', (req, res) => {
    const jellyfinUrl = 'http://192.168.1.39:8096/Library/Refresh';
    const reqOpts = {
        method: 'POST',
        headers: {
            'X-Emby-Token': '128c3d9a51bd4b22bacaccad03ef9328'
        }
    };

    const jReq = http.request(jellyfinUrl, reqOpts, (jRes) => {
        res.json({ success: true, status: jRes.statusCode, message: 'Biblioteca de Jellyfin refrescada con éxito.' });
    });

    jReq.on('error', (e) => {
        console.error("Error llamando API de Jellyfin:", e.message);
        res.json({ success: false, message: `No se pudo conectar con Jellyfin (192.168.1.39): ${e.message}` });
    });

    jReq.end();
});

const PORT = 8087;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Música corriendo en http://localhost:${PORT}`);
});
