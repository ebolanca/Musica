const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Cargar variables de entorno desde .env si existe
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
    try {
        const envLines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
        for (const l of envLines) {
            const trimmed = l.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [k, ...v] = trimmed.split('=');
                process.env[k.trim()] = v.join('=').trim();
            }
        }
    } catch(e){}
}

const LYRICS_DB_PATH = path.join(__dirname, 'data', 'lyrics_db.json');
let cachedLyricsDb = {};

function cleanTrackKey(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function loadLyricsDb() {
    if (fs.existsSync(LYRICS_DB_PATH)) {
        try { cachedLyricsDb = JSON.parse(fs.readFileSync(LYRICS_DB_PATH, 'utf8')); } catch(e){}
    }
}
loadLyricsDb();

function findLyricsForTrack(artist, title) {
    if (!cachedLyricsDb || Object.keys(cachedLyricsDb).length === 0) {
        loadLyricsDb();
    }
    const cleanT = cleanTrackTitle(title);
    if (cachedLyricsDb[`${artist} - ${title}`]) return cachedLyricsDb[`${artist} - ${title}`];
    if (cachedLyricsDb[`${artist} - ${cleanT}`]) return cachedLyricsDb[`${artist} - ${cleanT}`];
    if (cachedLyricsDb[cleanT]) return cachedLyricsDb[cleanT];
    if (cachedLyricsDb[title]) return cachedLyricsDb[title];

    const normTarget = `${artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(cachedLyricsDb)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normTarget || (normK.length > 5 && (normK.includes(normTarget) || normTarget.includes(normK)))) {
            return v;
        }
    }
    return null;
}




const LYRICS_CACHE_FILE = path.join(__dirname, 'data', 'lyrics_cache.json');
let lyricsTransCache = {};
if (fs.existsSync(LYRICS_CACHE_FILE)) {
    try { lyricsTransCache = JSON.parse(fs.readFileSync(LYRICS_CACHE_FILE, 'utf8')); } catch(e){}
}

async function translateLyricsBatch(lines) {
    if (!lines || lines.length === 0) return lines;
    
    // Check if song is already in Spanish
    const fullSample = lines.slice(0, 15).map(l => l.text).join(' ').toLowerCase();
    const spanishWords = fullSample.match(/\b(que|para|estoy|corazón|noche|nada|amor|vida|todo|cuando|tiempo|quiero|tengo|hacer|siento|solo)\b/gi) || [];
    if (spanishWords.length >= 4) {
        return lines;
    }

    // Process in contextual stanzas/blocks of 15 lines to preserve contextual meaning and idioms
    const blockSize = 15;
    for (let i = 0; i < lines.length; i += blockSize) {
        const block = lines.slice(i, i + blockSize);
        const needsTrans = block.some(l => {
            const t = (l.text || '').trim();
            return t.length > 1 && (!lyricsTransCache[t] || lyricsTransCache[t].includes("MYMEMORY WARNING"));
        });

        if (!needsTrans) {
            block.forEach(l => {
                const t = (l.text || '').trim();
                if (lyricsTransCache[t]) l.translation = lyricsTransCache[t];
            });
            continue;
        }

        const blockText = block.map(l => (l.text || '').trim()).join('\n');
        try {
            const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=es&q=${encodeURIComponent(blockText)}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: AbortSignal.timeout(3500)
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data[0]) {
                    const raw = Array.isArray(data[0]) ? data[0][0] : String(data[0]);
                    const cleanRaw = raw.replace(/,[a-zA-Z-]{2,5}$/, '').trim();
                    const transLines = cleanRaw.split('\n');
                    
                    block.forEach((item, idx) => {
                        const orig = (item.text || '').trim();
                        const trans = (transLines[idx] || '').trim();
                        if (trans && trans.length > 0) {
                            item.translation = trans;
                            lyricsTransCache[orig] = trans;
                        } else if (lyricsTransCache[orig]) {
                            item.translation = lyricsTransCache[orig];
                        }
                    });
                }
            }
        } catch(e) {}
    }

    try {
        fs.writeFileSync(LYRICS_CACHE_FILE, JSON.stringify(lyricsTransCache, null, 2), 'utf8');
    } catch(e){}

    return lines;
}








async function fetchWikiSummary(artist, title) {
    try {
        const query = encodeURIComponent(`${title} ${artist} song`);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`;
        const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.query && data.query.search && data.query.search.length > 0) {
            const pageTitle = data.query.search[0].title;
            const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
            const pRes = await fetch(pageUrl, { signal: AbortSignal.timeout(3500) });
            if (!pRes.ok) return null;
            const pData = await pRes.json();
            const pages = pData.query.pages;
            const pageId = Object.keys(pages)[0];
            return pages[pageId].extract || null;
        }
    } catch (e) {
        return null;
    }
    return null;
}

function isGenericAnalysis(analysis) {
    if (!analysis) return true;
    if (!analysis.sections || analysis.sections.length === 0) return true;
    if (analysis.synopsis && analysis.synopsis.includes("es una pieza fundamental dentro de su género")) return true;
    if (analysis.sections[0] && analysis.sections[0].points && analysis.sections[0].points[0] && analysis.sections[0].points[0].name === "El punto de inflexión creativo") return true;
    return false;
}

async function generateGeminiAnalysis(artist, title, album, year) {
    const cleanT = cleanTrackTitle(title);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
        const prompt = `Actúa como un crítico musical y musicólogo apasionado y de altísimo nivel.
Genera un análisis sónico, musical e histórico profundo, vibrante, apasionado y revelador para la canción "${cleanT}" de ${artist} (álbum: ${album || 'Desconocido'}, año: ${year || 'Clásico'}).

NORMAS ESTRICTAS DE CALIDAD Y REALISMO (CERO RELLENO):
1. NUNCA inventes ni uses frases genéricas de plantilla ("marcó un hito", "pieza fundamental dentro de su género").
2. ADAPTA LAS SECCIONES A LA REALIDAD DE LA CANCIÓN (genera entre 2 y 4 secciones que tengan sentido real):
   - Si la canción es INSTRUMENTAL (o sin letra significativa), NO incluyas sección lírica; profundiza en la armonía, instrumentos, arreglos y texturas.
   - Si la canción NO tuvo un impacto cultural, cinematográfico o premios destacables, NO inventes ni fuerces una sección de legado; omítela o reemplázala por anécdotas reales de la grabación o de los músicos.
3. DATOS ESPECÍFICOS Y TÉCNICOS: Menciona instrumentos reales, sintetizadores, pedales de efectos, afinaciones, colaboraciones, samples, baterías, o técnicas de producción si aplican.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura:
{
  "title": "${cleanT}",
  "artist": "${artist}",
  "year": "${year || '2000'}",
  "album": "${album || 'Álbum'}",
  "synopsis": "Una sinopsis vibrante y reveladora de 3-5 líneas con datos concretos y contexto real...",
  "sections": [
    {
      "title": "Título descriptivo de la sección (ej: El Origen & Trayectoria / La Anatomía Musical / etc.)",
      "icon": "fa-book-open",
      "text": "Explicación fluida y fundamentada...",
      "points": [
        { "name": "Nombre del detalle concreto", "desc": "Descripción técnica o anécdota real..." }
      ]
    }
  ]
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`;
        const payload = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                signal: AbortSignal.timeout(25000)
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    const parsed = JSON.parse(text);
                    if (parsed && parsed.synopsis && parsed.sections) {
                        return parsed;
                    }
                }
            } else {
                const errText = await response.text();
                console.error(`[Gemini API error ${response.status}]:`, errText);
            }
        } catch (e) {
            console.error(`[Gemini API catch]:`, e.message);
        }
    }

    // Fallback to Ollama if OMEN is reachable
    try {
        const ollamaRes = await fetch('http://100.95.217.45:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3.2:latest",
                prompt: `Genera análisis musical profundo en formato JSON para "${cleanT}" de ${artist} con title, artist, year, album, synopsis, sections (title, icon, text, points).`,
                stream: false,
                format: "json"
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (ollamaRes.ok) {
            const odata = await ollamaRes.json();
            if (odata.response) {
                const parsed = JSON.parse(odata.response);
                if (parsed && parsed.synopsis && parsed.sections) return parsed;
            }
        }
    } catch(e) {}

    return generateDeepModularAnalysis(artist, cleanT, album, year);
}

function generateDeepModularAnalysis(artist, title, album, year, wikiExtract) {
    const cleanT = cleanTrackTitle(title);
    let synopsis = `"${cleanT}" (${year || 'Clásico'}) de ${artist} es una pieza fundamental dentro de su género, destacando por su precisión melódica, su arquitectura sonora y un impacto duradero que la mantiene como referencia imprescindible.`;
    
    if (wikiExtract && wikiExtract.length > 80) {
        const firstSentence = wikiExtract.split('.')[0] + '.';
        synopsis = `"${cleanT}" (${year || 'Clásico'}) de ${artist}: ${firstSentence} Un tema indispensable que marcó una etapa definitoria en la evolución musical de su época.`;
    }

    const sections = [
        {
            title: `El Origen & Trayectoria: La consagración de ${artist}`,
            icon: "fa-book-open",
            text: `Compuesta en un momento crucial en la carrera de ${artist}, "${cleanT}" surgió de la necesidad de consolidar una identidad sonora propia. Las sesiones de grabación combinaron ideas melódicas directas con una búsqueda obsesiva por un sonido memorable y reconocible desde los primeros compases.`,
            points: [
                {
                    name: "El punto de inflexión creativo",
                    desc: `El tema no solo definió el álbum en el que fue incluido, sino que redefinió las expectativas comerciales de la banda, convirtiéndose en el estándar con el que se medirían sus producciones posteriores.`
                }
            ]
        },
        {
            title: "La Anatomía Musical: Estructura, Texturas & Producción",
            icon: "fa-drum",
            text: `La producción de "${cleanT}" destaca por un equilibrio quirúrgico entre la pegada rítmica y la elegancia armónica:`,
            points: [
                {
                    name: "La base rítmica y el tempo",
                    desc: `Construida sobre una línea rítmica envolvente, la canción utiliza dinámicas de tensión y desahogo que atrapan al oyente desde la introducción hasta el clímax final.`
                },
                {
                    name: "Capas de instrumentación y arreglos",
                    desc: `El uso contrastado de instrumentos orgánicos y texturas contemporáneas genera una calidez sonora que resiste el paso del tiempo sin sonar desfasada.`
                },
                {
                    name: "El gancho melódico (Hook)",
                    desc: `El estribillo explota con una melodía vocal expansiva y sumamente adictiva, diseñada milimétricamente para conectar con el público y resonar en grandes recintos.`
                }
            ]
        },
        {
            title: "La Lírica y el Mensaje: Emoción y Resonancia Universal",
            icon: "fa-quote-left",
            text: `Líricamente, "${cleanT}" aborda vivencias y emociones con las que el oyente conecta de forma inmediata, alejándose de los tópicos superficiales para profundizar en el anhelo, la resiliencia y la experiencia humana.`,
            points: [
                {
                    name: "La narrativa vocal",
                    desc: `La interpretación de ${artist} aporta una autenticidad cruda donde cada verso refuerza la carga emotiva de la instrumentación.`
                }
            ]
        },
        {
            title: "El Impacto Cultural & Legado",
            icon: "fa-trophy",
            text: `Con millones de reproducciones en radio y plataformas de streaming, "${cleanT}" se mantiene como un himno atemporal dentro de la discografía de ${artist} y una de las composiciones más celebradas de su generación.`,
            points: [
                {
                    name: "Permanencia en el imaginario colectivo",
                    desc: `El tema ha trascendido su época de lanzamiento, siendo versionado, sampleado y celebrado en directo como uno de los momentos cumbre en los conciertos de ${artist}.`
                }
            ]
        }
    ];

    return {
        title: cleanT,
        artist: artist,
        year: year || "2000",
        album: album || "Álbum Principal",
        synopsis: synopsis,
        sections: sections
    };
}

let isEnrichingCatalog = false;
async function autoEnrichCatalogInBackground() {
    if (isEnrichingCatalog) return;
    isEnrichingCatalog = true;
    try {
        let playlistsData = {};
        if (fs.existsSync(OMEN_CACHE_PATH)) {
            playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
        }
        
        let newEntriesCount = 0;
        for (const [listName, tracks] of Object.entries(playlistsData)) {
            for (const item of tracks) {
                const artist = Array.isArray(item) ? item[0] : item.artist;
                const rawTitle = Array.isArray(item) ? item[1] : item.title;
                const cleanT = cleanTrackTitle(rawTitle);
                
                if (!findAnalysisForTrack(artist, rawTitle) && !findAnalysisForTrack(artist, cleanT)) {
                    const wiki = await fetchWikiSummary(artist, cleanT);
                    const analysis = generateDeepModularAnalysis(artist, cleanT, "Álbum", "2000", wiki);
                    
                    const key = `${artist} - ${cleanT}`;
                    cachedAnalyses[key] = analysis;
                    cachedAnalyses[`${artist} - ${rawTitle}`] = analysis;
                    cachedAnalyses[cleanT] = analysis;
                    newEntriesCount++;

                    // Save batch every 20 entries
                    if (newEntriesCount % 20 === 0) {
                        try {
                            fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
                        } catch(e) {}
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }

        if (newEntriesCount > 0) {
            fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
            console.log(`✅ Auto-enriquecimiento de fondo finalizado: ${newEntriesCount} nuevas canciones analizadas e integradas.`);
        }
    } catch(e) {
        console.error("Error en autoEnrichCatalogInBackground:", e.message);
    } finally {
        isEnrichingCatalog = false;
    }
}

function cleanAlbumTitle(rawAlbum) {
    if (!rawAlbum) return 'Álbum Desconocido';
    let clean = rawAlbum
        .replace(/\s*\(Digital Deluxe.*?\)/i, '')
        .replace(/\s*\(Deluxe.*?\)/i, '')
        .replace(/\s*\(Expanded.*?\)/i, '')
        .replace(/\s*\(Remastered.*?\)/i, '')
        .replace(/\s*\(Super Deluxe.*?\)/i, '')
        .replace(/\s*\(Anniversary.*?\)/i, '')
        .replace(/\s*\(Special Edition.*?\)/i, '')
        .replace(/\s*\(Bonus.*?\)/i, '')
        .replace(/\s*-\s*Deluxe.*/i, '')
        .replace(/\s*-\s*Expanded.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .trim();
    return clean || rawAlbum;
}

function parseLrc(lrcText) {
    if (!lrcText) return null;
    const lines = lrcText.split(/\r?\n/);
    const result = [];
    const lrcRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
    for (let line of lines) {
        const match = line.match(lrcRegex);
        if (match) {
            const m = parseInt(match[1], 10);
            const s = parseFloat(match[2] + '.' + (match[3] || '0'));
            const text = match[4].trim();
            if (text) {
                const totalSec = m * 60 + s;
                result.push({ 
                    time: (m < 10 ? '0' : '') + m + ':' + (Math.floor(s) < 10 ? '0' : '') + Math.floor(s), 
                    seconds: totalSec,
                    text: text 
                });
            }
        }
    }
    return result.length > 0 ? result : null;
}

function getTrackMetadata(artist, title) {
    if (!metadataCache || Object.keys(metadataCache).length === 0) {
        loadMetadataCache();
    }
    const cleanTitle = cleanTrackTitle(title);
    let key1 = `${artist} - ${title}`.toLowerCase();
    if (metadataCache[key1]) return metadataCache[key1];

    let key2 = `${artist} - ${cleanTitle}`.toLowerCase();
    if (metadataCache[key2]) return metadataCache[key2];

    let normTarget = `${artist}${cleanTitle}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, meta] of Object.entries(metadataCache)) {
        let normK = k.replace(/[^a-z0-9]/g, '');
        if (normK.length > 5 && (normK === normTarget || normK.includes(normTarget) || normTarget.includes(normK))) {
            return meta;
        }
    }

    return {};
}



let metadataCache = {};
function loadMetadataCache() {
    const METADATA_CACHE_FILE = path.join(__dirname, 'data', 'metadata_cache.json');
    if (fs.existsSync(METADATA_CACHE_FILE)) {
        try { metadataCache = JSON.parse(fs.readFileSync(METADATA_CACHE_FILE, 'utf8')); } catch(e){}
    }
}
loadMetadataCache();

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    let clean = rawTitle
        .replace(/\s*-\s*[A-Za-z0-9\s]+\s+featuring\s+.*$/i, '')
        .replace(/\s*-\s*[A-Za-z0-9\s]+\s+feat\.?\s+.*$/i, '')
        .replace(/\s*\([A-Za-z0-9\s]+\s+featuring\s+.*\)$/i, '')
        .replace(/\s*\([A-Za-z0-9\s]+\s+feat\.?\s+.*\)$/i, '')
        .replace(/\s*\(feat\.?\s+.*\)$/i, '')
        .replace(/\s*\(featuring\s+.*\)$/i, '')
        .replace(/\s*\(with\s+.*\)$/i, '')
        .replace(/^\s*\.\.\.\s*/, '')
        .replace(/\s*-\s*Club Mix.*/i, '')
        .replace(/\s*-\s*Extended Mix.*/i, '')
        .replace(/\s*-\s*Mix.*/i, '')
        .replace(/\s*-\s*Club Edit.*/i, '')
        .replace(/\s*-\s*Remix.*/i, '')
        .replace(/\s*\(.*remix.*\)/i, '')
        .replace(/\s*-\s*Extended.*/i, '')
        .replace(/\s*-\s*Radio Mix.*/i, '')
        .replace(/\s*-\s*Mono.*/i, '')
        .replace(/\s*-\s*Stereo.*/i, '')
        .replace(/\s*-\s*From\s+".*?".*/i, '')
        .replace(/\s*-\s*\d{4}\s*Remaster.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .replace(/\s*-\s*Remaster.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '')
        .replace(/\s*-\s*Radio Edit.*/i, '')
        .replace(/\s*\(.*radio edit.*\)/i, '')
        .replace(/\s*-\s*Single Version.*/i, '')
        .replace(/\s*\(.*deluxe.*\)/i, '')
        .replace(/\s*-\s*Original.*/i, '')
        .trim();

    clean = clean.replace(/^[(\[]+([^)]+)[)\]]\s*/, '$1 ');
    return clean.replace(/\s+/g, ' ').trim();
}



const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rutas compatibles tanto en local OMEN (D:\) como remoto MSI (red Tailscale)
const LOCAL_OMEN_CACHE = "D:\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const REMOTE_OMEN_CACHE = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_CACHE_PATH = fs.existsSync(LOCAL_OMEN_CACHE) ? LOCAL_OMEN_CACHE : REMOTE_OMEN_CACHE;


const LOCAL_OMEN_MUSIC = "D:\\media-library\\music";
const REMOTE_OMEN_MUSIC = "\\\\100.95.217.45\\omen D\\media-library\\music";
const OMEN_MUSIC_DIR = fs.existsSync(LOCAL_OMEN_MUSIC) ? LOCAL_OMEN_MUSIC : REMOTE_OMEN_MUSIC;

if (fs.existsSync(OMEN_MUSIC_DIR)) {
    app.use('/media-music', express.static(OMEN_MUSIC_DIR));
}

function scanAudioFiles() {
    const audioMap = new Map();
    if (!fs.existsSync(OMEN_MUSIC_DIR)) return audioMap;

    try {
        const folders = fs.readdirSync(OMEN_MUSIC_DIR, { withFileTypes: true });
        for (const folder of folders) {
            if (!folder.isDirectory()) continue;
            const category = folder.name;
            const folderPath = path.join(OMEN_MUSIC_DIR, category);
            const files = fs.readdirSync(folderPath);

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (ext === '.mp3' || ext === '.m4a' || ext === '.flac' || ext === '.ogg') {
                    const baseName = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
                    audioMap.set(baseName, {
                        category,
                        fileName: file,
                        relUrl: `/media-music/${encodeURIComponent(category)}/${encodeURIComponent(file)}`
                    });
                }
            }
        }
    } catch(e) {
        console.error("Error escaneando archivos de audio:", e.message);
    }
    return audioMap;
}

const LOCAL_OMEN_VIDEOS = "D:\\media-library\\music-videos";
const REMOTE_OMEN_VIDEOS = "\\\\100.95.217.45\\omen D\\media-library\\music-videos";
const OMEN_VIDEOS_DIR = fs.existsSync(LOCAL_OMEN_VIDEOS) ? LOCAL_OMEN_VIDEOS : REMOTE_OMEN_VIDEOS;
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

let cachedLocalVideoMap = new Map();
let lastVideoScanTime = 0;

function getCachedVideoFiles() {
    const now = Date.now();
    if (cachedLocalVideoMap.size === 0 || (now - lastVideoScanTime > 300000)) { // 5 minutos de caché
        cachedLocalVideoMap = scanAudioFilesAndVideos();
        lastVideoScanTime = now;
    }
    return cachedLocalVideoMap;
}

function scanAudioFilesAndVideos() {
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

    const videoMap = getCachedVideoFiles();
    const audioMap = scanAudioFiles();
    const iconicAlbumDates = {
        "appetite for destruction": {
                "year": "1987",
                "date": "1987-07-21"
        },
        "use your illusion i": {
                "year": "1991",
                "date": "1991-09-17"
        },
        "use your illusion ii": {
                "year": "1991",
                "date": "1991-09-17"
        },
        "united": {
                "year": "1967",
                "date": "1967-04-20"
        },
        "thriller": {
                "year": "1982",
                "date": "1982-11-30"
        },
        "bad": {
                "year": "1987",
                "date": "1987-08-31"
        },
        "joyride": {
                "year": "1991",
                "date": "1991-03-28"
        },
        "look sharp!": {
                "year": "1988",
                "date": "1988-10-21"
        },
        "toto iv": {
                "year": "1982",
                "date": "1982-04-08"
        },
        "hybrid theory": {
                "year": "2000",
                "date": "2000-10-24"
        },
        "meteora": {
                "year": "2003",
                "date": "2003-03-25"
        },
        "night visions": {
                "year": "2012",
                "date": "2012-09-04"
        },
        "smoke + mirrors": {
                "year": "2015",
                "date": "2015-02-17"
        },
        "evolve": {
                "year": "2017",
                "date": "2017-06-23"
        },
        "a night at the opera": {
                "year": "1975",
                "date": "1975-10-31"
        },
        "native": {
                "year": "2013",
                "date": "2013-03-22"
        },
        "hopes and fears": {
                "year": "2004",
                "date": "2004-05-10"
        },
        "american idiot": {
                "year": "2004",
                "date": "2004-09-21"
        },
        "viva la vida": {
                "year": "2008",
                "date": "2008-06-12"
        },
        "parachutes": {
                "year": "2000",
                "date": "2000-07-10"
        },
        "a rush of blood to the head": {
                "year": "2002",
                "date": "2002-08-26"
        },
        "ghost stories": {
                "year": "2014",
                "date": "2014-05-16"
        }
};

    // Enriquecer cada canción con el estado del videoclip, letras y DEDUPLICACIÓN
    const response = {};
    for (const [listName, rawTracks] of Object.entries(playlistsData)) {
        const seenKeys = new Set();
        const enrichedTracks = [];

        for (const item of rawTracks) {
            const artist = Array.isArray(item) ? item[0] : item.artist;
            const title = Array.isArray(item) ? item[1] : item.title;
            const cleanTitle = cleanTrackTitle(title);
            
            // Deduplication by normalized artist and clean title
            const normArt = (artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const normTit = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
            const dedupKey = `${normArt}_${normTit}`;
            if (seenKeys.has(dedupKey)) {
                continue; // Skip duplicated song in playlist
            }
            seenKeys.add(dedupKey);

            const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanKey2 = `${artist} ${cleanTitle}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            let audioInfo = audioMap.get(cleanKey) || audioMap.get(cleanKey2);
            
            // Fuzzy search for audio files if exact match failed
            if (!audioInfo) {
                const titleKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
                const artistKey = (artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (titleKey.length >= 4) {
                    for (const [k, v] of audioMap.entries()) {
                        if (k.includes(titleKey) && (artistKey.length < 4 || k.includes(artistKey.slice(0, 8)) || artistKey.includes(k.slice(0, 8)))) {
                            audioInfo = v;
                            break;
                        }
                    }
                }
            }

            let videoInfo = videoMap.get(cleanKey) || videoMap.get(cleanKey2);
            if (!videoInfo) {
                const titleKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
                const artistKey = (artist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (titleKey.length >= 4) {
                    for (const [k, v] of videoMap.entries()) {
                        if (k.includes(titleKey) && (artistKey.length < 4 || k.includes(artistKey.slice(0, 8)) || artistKey.includes(k.slice(0, 8)))) {
                            videoInfo = v;
                            break;
                        }
                    }
                }
            }

            // Buscar videoclip en catálogo de Jellyfin
            const jellyVideo = jellyfinVideosLookup.get(cleanTrackKey(`${artist} ${cleanTitle}`)) || 
                               jellyfinVideosLookup.get(cleanTrackKey(cleanTitle)) || 
                               jellyfinVideosLookup.get(cleanTrackKey(`${artist} - ${title}`)) || null;

            let audioUrl = audioInfo ? audioInfo.relUrl : null;
            // Si no hay MP3 pero hay videoclip en local o Jellyfin, usar como audio stream de respaldo
            if (!audioUrl) {
                if (videoInfo && videoInfo.mp4) {
                    audioUrl = `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}`;
                } else if (jellyVideo && jellyVideo.streamUrl) {
                    audioUrl = jellyVideo.streamUrl;
                }
            }

            const meta = getTrackMetadata(artist, title);
            const analysis = findAnalysisForTrack(artist, title);

            let releaseYear = meta.releaseYear || '2000';
            let releaseDate = meta.releaseDate || `${releaseYear}-01-01`;

            // Check iconic album dates
            const normAlbum = (meta.album || '').toLowerCase().trim();
            if (iconicAlbumDates[normAlbum]) {
                releaseYear = iconicAlbumDates[normAlbum].year;
                releaseDate = iconicAlbumDates[normAlbum].date;
            } else if (analysis && analysis.year && analysis.year !== '2000') {
                const aYr = parseInt(analysis.year, 10);
                const mYr = parseInt(releaseYear, 10) || 0;
                if (mYr > aYr || mYr > 2024 || mYr === 2000 || (listName === 'Música viejuna' && mYr > 1999 && aYr <= 1999)) {
                    releaseYear = analysis.year;
                    releaseDate = `${analysis.year}-01-01`;
                }
            }

            // Strict guarantee for Música viejuna: prior studio release over modern remasters
            if (listName === 'Música viejuna') {
                const yr = parseInt(releaseYear, 10) || 0;
                if (yr > 1999) {
                    if (analysis && analysis.year && parseInt(analysis.year, 10) <= 1999) {
                        releaseYear = analysis.year;
                        releaseDate = `${analysis.year}-01-01`;
                    }
                }
            }

            // Ensure releaseDate year matches releaseYear
            if (releaseDate && releaseYear) {
                const dYear = releaseDate.split('-')[0];
                if (dYear !== releaseYear) {
                    const parts = releaseDate.split('-');
                    releaseDate = `${releaseYear}-${parts[1] || '01'}-${parts[2] || '01'}`;
                }
            }

            enrichedTracks.push({
                artist: artist,
                title: meta.displayTitle || cleanTitle,
                rawTitle: title,
                album: cleanAlbumTitle(meta.album),
                coverUrl: meta.coverUrl || null,
                releaseDate: releaseDate,
                releaseYear: releaseYear,
                durationMs: meta.durationMs || 210000,
                durationFmt: meta.durationFmt || '03:30',
                hasVideo: !!(videoInfo && videoInfo.mp4),
                hasLyrics: true,
                videoPath: videoInfo && videoInfo.mp4 ? `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}` : null,
                srtPath: videoInfo && videoInfo.srt ? `/media-videos/${videoInfo.srt.replace(/\\/g, '/')}` : null,
                lrcPath: videoInfo && videoInfo.lrc ? `/media-videos/${videoInfo.lrc.replace(/\\/g, '/')}` : null,
                hasAnalysis: !!analysis,
                hasAudio: !!audioUrl,
                audioUrl: audioUrl
            });
        }

        response[listName] = enrichedTracks;
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

function findAnalysisForTrack(artist, title) {
    if (!cachedAnalyses || Object.keys(cachedAnalyses).length === 0) {
        loadAnalysesDb();
    }
    const cleanT = cleanTrackTitle(title);
    const key1 = `${artist} - ${title}`;
    if (cachedAnalyses[key1]) return cachedAnalyses[key1];

    const key2 = `${artist} - ${cleanT}`;
    if (cachedAnalyses[key2]) return cachedAnalyses[key2];

    const key3 = title;
    if (cachedAnalyses[key3]) return cachedAnalyses[key3];

    const key4 = cleanT;
    if (cachedAnalyses[key4]) return cachedAnalyses[key4];

    // Normalized search
    const normTarget = `${artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(cachedAnalyses)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normTarget || (normK.length > 5 && (normK.includes(normTarget) || normTarget.includes(normK)))) {
            return v;
        }
    }

    // Match by title alone
    const normTitle = cleanT.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normTitle.length > 3) {
        for (const [k, v] of Object.entries(cachedAnalyses)) {
            const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normK.includes(normTitle) || normTitle.includes(normK)) {
                return v;
            }
        }
    }

    return null;
}

function loadAnalysesDb() {
    if (fs.existsSync(ANALYSES_DB_PATH)) {
        try {
            cachedAnalyses = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8'));
        } catch (e) {
            console.error("Error cargando analyses_db.json:", e.message);
        }
    }
}

// API: Obtener detalle completo de una canción (Créditos, Letras, Análisis Sónico Profundo)

// ==========================================================================
// 🎬 Jellyfin Music Videos Integration (OMEN :8096)
// ==========================================================================
const JELLYFIN_HOST = process.env.JELLYFIN_HOST || 'http://100.95.217.45:8096';
const JELLYFIN_TOKEN = '128c3d9a51bd4b22bacaccad03ef9328';
const JELLYFIN_USER_ID = '9f5ea2fca2c7415ba5a030c05821e9f9';

let cachedJellyfinVideos = [];
let jellyfinVideosLookup = new Map();

async function fetchJellyfinVideos() {
    try {
        const url = `${JELLYFIN_HOST}/Users/${JELLYFIN_USER_ID}/Items?IncludeItemTypes=MusicVideo,Video&Recursive=true`;
        const res = await fetch(url, {
            headers: { 'X-Emby-Token': JELLYFIN_TOKEN },
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) {
            console.warn(`Jellyfin API respondió con status ${res.status}`);
            return cachedJellyfinVideos;
        }
        const data = await res.json();
        const items = data.Items || [];
        
        cachedJellyfinVideos = items.map(item => {
            const rawName = item.Name || '';
            let parsedArtist = '';
            let parsedTitle = rawName;
            
            if (rawName.includes(' - ')) {
                const parts = rawName.split(' - ');
                parsedArtist = parts[0].trim();
                parsedTitle = parts.slice(1).join(' - ').trim();
            }

            const streamUrl = `${JELLYFIN_HOST}/Videos/${item.Id}/stream?static=true&api_key=${JELLYFIN_TOKEN}`;
            const thumbUrl = `${JELLYFIN_HOST}/Items/${item.Id}/Images/Primary?fillWidth=480&fillHeight=270&quality=90`;
            const webClientUrl = `${JELLYFIN_HOST}/web/index.html#!/details?id=${item.Id}&serverId=${item.ServerId}`;

            return {
                id: item.Id,
                name: rawName,
                artist: parsedArtist || 'Varios Artistas',
                title: parsedTitle,
                year: item.ProductionYear || null,
                container: item.Container,
                runTimeTicks: item.RunTimeTicks,
                durationSec: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000000) : 0,
                streamUrl: streamUrl,
                thumbUrl: thumbUrl,
                webClientUrl: webClientUrl
            };
        });

        // Construir mapa de búsqueda rápida normalizada
        jellyfinVideosLookup.clear();
        cachedJellyfinVideos.forEach(v => {
            const normName = cleanTrackKey(v.name);
            const normTitle = cleanTrackKey(v.title);
            const normArtTit = cleanTrackKey(`${v.artist} ${v.title}`);
            
            jellyfinVideosLookup.set(normName, v);
            jellyfinVideosLookup.set(normTitle, v);
            jellyfinVideosLookup.set(normArtTit, v);
        });

        console.log(`✅ Jellyfin: ${cachedJellyfinVideos.length} videoclips cargados y sincronizados correctamente.`);
        return cachedJellyfinVideos;
    } catch(e) {
        console.warn('No se pudo conectar a Jellyfin en OMEN:', e.message);
        return cachedJellyfinVideos;
    }
}

// Cargar videoclips en el arranque
fetchJellyfinVideos();

// Endpoint: Obtener catálogo completo de videoclips de Jellyfin
app.get('/api/jellyfin/videos', async (req, res) => {
    if (cachedJellyfinVideos.length === 0) {
        await fetchJellyfinVideos();
    }
    res.json({
        total: cachedJellyfinVideos.length,
        server: JELLYFIN_HOST,
        videos: cachedJellyfinVideos
    });
});

// Endpoint: Refrescar catálogo en caliente
app.post('/api/jellyfin/refresh', async (req, res) => {
    try {
        await fetch(`${JELLYFIN_HOST}/Library/Refresh`, {
            method: 'POST',
            headers: { 'X-Emby-Token': JELLYFIN_TOKEN },
            signal: AbortSignal.timeout(5000)
        }).catch(() => {});
        
        await fetchJellyfinVideos();
        res.json({ success: true, count: cachedJellyfinVideos.length });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint: Generar o re-analizar pista con Gemini AI
app.post('/api/analysis/generate', async (req, res) => {
    const { artist, title, force } = req.body;
    if (!artist || !title) {
        return res.status(400).json({ error: 'artist y title son obligatorios' });
    }

    try {
        const cleanT = cleanTrackTitle(title);
        const meta = getTrackMetadata(artist, title);
        const analysis = await generateGeminiAnalysis(artist, cleanT, meta.album, meta.releaseYear);

        if (analysis) {
            const key = `${artist} - ${cleanT}`;
            cachedAnalyses[key] = analysis;
            cachedAnalyses[`${artist} - ${title}`] = analysis;
            cachedAnalyses[cleanT] = analysis;
            try {
                fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
            } catch(e) {
                console.error("Error persistiendo analysis en DB:", e.message);
            }
            return res.json({ success: true, analysis });
        }
        res.status(500).json({ error: 'No se pudo generar el análisis sónico' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/track/detail', async (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) {
        return res.status(400).json({ error: 'Se requieren los parámetros artist y title' });
    }

    let analysis = findAnalysisForTrack(artist, title);

    // Si no hay análisis, lanzar la generación con IA en segundo plano sin bloquear la respuesta de letras
    if (!analysis || isGenericAnalysis(analysis)) {
        const cleanT = cleanTrackTitle(title);
        const meta = getTrackMetadata(artist, title);
        generateGeminiAnalysis(artist, cleanT, meta.album, meta.releaseYear).then(aiAnalysis => {
            if (aiAnalysis && !isGenericAnalysis(aiAnalysis)) {
                const key = `${artist} - ${cleanT}`;
                cachedAnalyses[key] = aiAnalysis;
                cachedAnalyses[`${artist} - ${title}`] = aiAnalysis;
                cachedAnalyses[cleanT] = aiAnalysis;
                try {
                    fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(cachedAnalyses, null, 2), 'utf8');
                } catch(e){}
            }
        }).catch(()=>{});
    }

    let parsedLyrics = findLyricsForTrack(artist, title);
    // Si la letra en caché era solo texto plano sin marcas de tiempo, intentar mejorarla con letra sincronizada
    if (parsedLyrics && parsedLyrics.length > 0 && !parsedLyrics.some(l => l.seconds !== undefined || l.time !== undefined)) {
        parsedLyrics = null;
    }
    const videoMap = scanVideoFiles();
    const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    const videoInfo = videoMap.get(cleanKey);

    if (!parsedLyrics) {
        if (videoInfo) {
            if (videoInfo.srt) parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.srt));
            else if (videoInfo.lrc) parsedLyrics = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, videoInfo.lrc));
        }

        if (!parsedLyrics) {
            try {
                const cleanT = cleanTrackTitle(title);
                const lrcurl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(cleanT)}`;
                const lrcres = await fetch(lrcurl, { signal: AbortSignal.timeout(3000) });
                if (lrcres.ok) {
                    const lrcdata = await lrcres.json();
                    if (lrcdata.syncedLyrics) {
                        parsedLyrics = parseLrc(lrcdata.syncedLyrics);
                    } else if (lrcdata.plainLyrics) {
                        parsedLyrics = lrcdata.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
                    }
                } else {
                    const searchurl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + cleanT)}`;
                    const sres = await fetch(searchurl, { signal: AbortSignal.timeout(3000) });
                    if (sres.ok) {
                        const sdata = await sres.json();
                        if (sdata && sdata.length > 0) {
                            // Priorizar siempre el resultado con letra sincronizada (syncedLyrics)
                            const item = sdata.find(i => i.syncedLyrics) || sdata[0];
                            if (item.syncedLyrics) {
                                parsedLyrics = parseLrc(item.syncedLyrics);
                            } else if (item.plainLyrics) {
                                parsedLyrics = item.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('Error buscando letra en LRCLIB:', e.message);
            }
        }

        // Si se acaba de obtener, guardar en caché inmediatamente y traducir en segundo plano
        if (parsedLyrics && parsedLyrics.length > 0) {
            const cleanT = cleanTrackTitle(title);
            cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
            cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
            cachedLyricsDb[cleanT] = parsedLyrics;
            try {
                fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
            } catch(e){}

            // Traducir en segundo plano sin congelar la respuesta del usuario
            translateLyricsBatch(parsedLyrics).then(translated => {
                if (translated) {
                    cachedLyricsDb[`${artist} - ${title}`] = translated;
                    cachedLyricsDb[`${artist} - ${cleanT}`] = translated;
                    cachedLyricsDb[cleanT] = translated;
                    try { fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8'); } catch(e){}
                }
            }).catch(()=>{});
        }
    }

    if (parsedLyrics && parsedLyrics.length > 0) {
        const hasUntranslated = parsedLyrics.some(l => (l.text || '').trim().length > 3 && !l.translation);
        if (hasUntranslated) {
            translateLyricsBatch(parsedLyrics).then(translated => {
                if (translated) {
                    const cleanT = cleanTrackTitle(title);
                    cachedLyricsDb[`${artist} - ${title}`] = translated;
                    cachedLyricsDb[`${artist} - ${cleanT}`] = translated;
                    cachedLyricsDb[cleanT] = translated;
                    try {
                        fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
                    } catch(e){}
                }
            }).catch(()=>{});
        }
    }

    const meta = getTrackMetadata(artist, title);

    let finalYear = meta.releaseYear || '2000';
    let finalDate = meta.releaseDate || `${finalYear}-01-01`;
    if (analysis && analysis.year && analysis.year !== '2000') {
        const aYr = parseInt(analysis.year, 10);
        const mYr = parseInt(finalYear, 10) || 0;
        if (mYr > aYr || mYr > 2024 || mYr === 2000) {
            finalYear = analysis.year;
            finalDate = `${analysis.year}-01-01`;
        }
    }

    res.json({
        artist: artist,
        title: meta.displayTitle || cleanTrackTitle(title),
        album: cleanAlbumTitle(meta.album),
        releaseDate: finalDate,
        releaseYear: finalYear,
        durationFmt: meta.durationFmt || '03:30',
        label: meta.label || 'Sello Discográfico Principal',
        genre: meta.genre || 'Pop / Rock / Dance',
        audioUrl: (scanAudioFiles().get(`${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '')) || {}).relUrl || null,
        videoItem: jellyfinVideosLookup.get(cleanTrackKey(`${artist} ${title}`)) || 
                   jellyfinVideosLookup.get(cleanTrackKey(title)) || 
                   jellyfinVideosLookup.get(cleanTrackKey(`${artist} - ${title}`)) || null,
        composers: meta.composers || artist,
        lyrics: (parsedLyrics || []).map(l => ({
            ...l,
            translation: (l.translation && l.translation.trim().toLowerCase() !== (l.text || '').trim().toLowerCase()) ? l.translation : null
        })),
        analysis: analysis
    });
});




// ==========================================================================
// API: Ahora suena en la radio (Extracción de metadatos ICY en tiempo real)
// ==========================================================================
const httpsLib = require('https');
const radioNowPlayingCache = new Map();

function fetchIcyMetadata(streamUrl) {
    return new Promise((resolve) => {
        try {
            const parsed = new URL(streamUrl);
            const lib = parsed.protocol === 'https:' ? httpsLib : http;
            const req = lib.get(streamUrl, {
                headers: {
                    'Icy-MetaData': '1',
                    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
                }
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return resolve(fetchIcyMetadata(res.headers.location));
                }
                const icyMetaInt = parseInt(res.headers['icy-metaint'], 10);
                if (!icyMetaInt || isNaN(icyMetaInt)) {
                    res.destroy();
                    return resolve(null);
                }
                let byteCount = 0;
                let metaLength = 0;
                let metaBuffer = Buffer.alloc(0);
                let readingMeta = false;

                res.on('data', (chunk) => {
                    if (!readingMeta) {
                        byteCount += chunk.length;
                        if (byteCount >= icyMetaInt) {
                            readingMeta = true;
                            const metaLenIndex = chunk.length - (byteCount - icyMetaInt);
                            if (metaLenIndex < chunk.length) {
                                metaLength = chunk[metaLenIndex] * 16;
                                if (metaLength > 0) {
                                    metaBuffer = Buffer.concat([metaBuffer, chunk.slice(metaLenIndex + 1)]);
                                } else {
                                    res.destroy();
                                    return resolve(null);
                                }
                            }
                        }
                    } else {
                        metaBuffer = Buffer.concat([metaBuffer, chunk]);
                    }

                    if (readingMeta && metaBuffer.length >= metaLength) {
                        res.destroy();
                        const metaStr = metaBuffer.slice(0, metaLength).toString('utf8');
                        const match = metaStr.match(/StreamTitle='([^']*)'/i);
                        const title = match ? match[1].trim() : null;
                        return resolve(title);
                    }
                });

                res.on('error', () => { res.destroy(); resolve(null); });
                setTimeout(() => { res.destroy(); resolve(null); }, 3500);
            });
            req.on('error', () => resolve(null));
            req.setTimeout(3500, () => { req.destroy(); resolve(null); });
        } catch(e) {
            resolve(null);
        }
    });
}

app.get('/api/radio/now-playing', async (req, res) => {
    const { streamUrl, id } = req.query;
    if (!streamUrl && !id) {
        return res.status(400).json({ error: 'Falta streamUrl o id' });
    }

    const cacheKey = id || streamUrl;
    const cached = radioNowPlayingCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 15000)) {
        return res.json({ nowPlaying: cached.title, cached: true });
    }

    let title = null;
    if (streamUrl) {
        title = await fetchIcyMetadata(streamUrl);
    }
    
    if (title) {
        title = title.replace(/\s*-\s*$/, '').trim();
    }

    radioNowPlayingCache.set(cacheKey, { title, timestamp: Date.now() });
    res.json({ nowPlaying: title, cached: false });
});


// ==========================================================================
// 💾 Grabar Desfase Permanente de Letras / Subtítulos
// ==========================================================================
app.post('/api/lyrics/save-offset', (req, res) => {
    try {
        const { artist, title, offsetSec, lyricsArray } = req.body;
        if (!artist || !title) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos (artist, title)' });
        }

        const effectiveOffset = (typeof offsetSec === 'number') ? offsetSec : 0;
        const cleanT = cleanTrackTitle(title);
        const keysToTry = [
            `${artist} - ${title}`,
            `${artist} - ${cleanT}`,
            cleanT,
            `${artist} ${cleanT}`,
            title
        ];

        let sourceLyrics = null;
        if (lyricsArray && Array.isArray(lyricsArray) && lyricsArray.length > 0) {
            sourceLyrics = lyricsArray;
        } else {
            for (const k of keysToTry) {
                if (cachedLyricsDb[k] && Array.isArray(cachedLyricsDb[k])) {
                    sourceLyrics = cachedLyricsDb[k];
                    break;
                }
            }
            if (!sourceLyrics) {
                const normTarget = `${artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const [k, v] of Object.entries(cachedLyricsDb)) {
                    const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (normK === normTarget || (normK.length > 5 && (normK.includes(normTarget) || normTarget.includes(normK)))) {
                        sourceLyrics = v;
                        break;
                    }
                }
            }
        }

        if (!sourceLyrics) {
            return res.status(404).json({ error: 'No se encontraron letras en la base de datos para esta canción' });
        }

        // Aplicar el desfase a todas las líneas y formatear
        const updatedLyrics = sourceLyrics.map(l => {
            let currSec = 0;
            if (typeof l.seconds === 'number') currSec = l.seconds;
            else if (l.time) {
                const parts = l.time.split(':');
                currSec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1] || 0);
            }

            const newSec = Math.max(0, parseFloat((currSec - effectiveOffset).toFixed(2)));
            const mins = Math.floor(newSec / 60);
            const secs = Math.floor(newSec % 60);
            const newTimeFmt = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            return {
                text: l.text || '',
                translation: l.translation || '',
                seconds: newSec,
                time: newTimeFmt
            };
        });

        // Guardar en todas las variantes de clave en memoria
        keysToTry.forEach(k => {
            cachedLyricsDb[k] = updatedLyrics;
        });
        cachedLyricsDb[`${artist} - ${title}`] = updatedLyrics;
        cachedLyricsDb[`${artist} - ${cleanT}`] = updatedLyrics;
        cachedLyricsDb[cleanT] = updatedLyrics;

        // Guardar permanentemente en disco
        try {
            fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
        } catch(e) {
            console.error('Error escribiendo en LYRICS_DB_PATH:', e.message);
        }

        console.log(`[LYRICS SYNC] Desfase de ${offsetSec}s guardado permanentemente para ${artist} - ${title}`);
        res.json({ success: true, lyrics: updatedLyrics });
    } catch(err) {
        console.error('Error en /api/lyrics/save-offset:', err);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================================================
// 🔄 Reemplazar pista por Versión Limpia Oficial de Estudio
// ==========================================================================
app.post('/api/track/replace-clean-audio', async (req, res) => {
    try {
        const { artist, title, category } = req.body;
        if (!artist || !title) {
            return res.status(400).json({ error: 'Faltan parámetros requeridos (artist, title)' });
        }

        const cleanT = cleanTrackTitle(title);
        const targetCategory = category || 'Siglo XXI';
        const targetFolder = path.join(OMEN_MUSIC_DIR, targetCategory);
        
        if (!fs.existsSync(targetFolder)) {
            try { fs.mkdirSync(targetFolder, { recursive: true }); } catch(e){}
        }

        const targetFileName = `${artist} - ${title}.mp3`;
        const targetFilePath = path.join(targetFolder, targetFileName);
        const tempOutput = path.join(__dirname, 'data', `temp_clean_${Date.now()}.${'mp3'}`);

        const { spawn } = require('child_process');
        const ffmpegDir = 'C:\\Users\\MSI Roberto\\.spotdl';
        const query = `scsearch1:${artist} - ${cleanT}`;

        console.log(`[CLEAN DOWNLOAD] Descargando versión limpia para: ${artist} - ${cleanT}`);

        const args = [
            '-m', 'yt_dlp',
            '--ffmpeg-location', ffmpegDir,
            query,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', tempOutput
        ];

        const proc = spawn('python', args);

        let stdErr = '';
        proc.stderr.on('data', d => { stdErr += d.toString(); });

        proc.on('close', (code) => {
            if (fs.existsSync(tempOutput)) {
                try {
                    fs.copyFileSync(tempOutput, targetFilePath);
                    fs.unlinkSync(tempOutput);
                    console.log(`✅ [CLEAN DOWNLOAD] Pista reemplazada con éxito en: ${targetFilePath}`);
                    return res.json({ 
                        success: true, 
                        message: `Versión oficial limpia de estudio descargada y reemplazada correctamente.`,
                        fileName: targetFileName,
                        relUrl: `/media-music/${encodeURIComponent(targetCategory)}/${encodeURIComponent(targetFileName)}?t=${Date.now()}`
                    });
                } catch(e) {
                    return res.status(500).json({ error: 'Error copiando archivo de audio reemplazado: ' + e.message });
                }
            } else {
                console.error(`❌ [CLEAN DOWNLOAD] Falló la descarga: ${stdErr.slice(0, 300)}`);
                return res.status(500).json({ error: 'No se pudo descargar la versión de audio limpia: ' + stdErr.slice(0, 150) });
            }
        });
    } catch(err) {
        console.error('Error en /api/track/replace-clean-audio:', err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 8087;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Música corriendo en http://localhost:${PORT}`);
});
