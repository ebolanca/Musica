
function normalizePlaylistKey(name) {
    if (!name) return 'Música viejuna';
    const clean = name.trim();
    if (/viejuna/i.test(clean)) return 'Música viejuna';
    if (/siglo\s*xxi/i.test(clean)) return 'Siglo XXI';
    if (/española|espanola/i.test(clean)) return 'Española';
    if (/latina/i.test(clean)) return 'Música latina';
    if (/dance/i.test(clean)) return 'Dance';
    return clean;
}

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

    // Primero: aplicar instantáneamente desde la caché en memoria (0ms)
    lines.forEach(l => {
        const t = (l.text || '').trim();
        if (!l.translation && lyricsTransCache[t]) {
            l.translation = lyricsTransCache[t];
        }
    });

    const needsTrans = lines.some(l => {
        const t = (l.text || '').trim();
        return t.length > 1 && !l.translation;
    });

    if (!needsTrans) return lines;

    // Traducir las líneas pendientes en 1 o 2 llamadas ultra-rápidas a Google Translate
    const blockSize = 30;
    for (let i = 0; i < lines.length; i += blockSize) {
        const block = lines.slice(i, i + blockSize);
        const blockText = block.map(l => (l.text || '').trim()).join('\n');
        try {
            const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=es&q=${encodeURIComponent(blockText)}`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: AbortSignal.timeout(2000)
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
        const prompt = `Instrucciones para análisis técnico y forense de canciones:
Actúa como un productor musical e ingeniero de sonido experto. Realiza un análisis exhaustivo y técnico en profundidad de la canción "${cleanT}" de ${artist} (álbum: ${album || 'Álbum oficial'}, año: ${year || 'Histórico'}).
Prohibido hacer resúmenes superficiales, omitir bloques o rebajar el nivel de detalle. Tono directo, analítico, profesional y técnico. Cero relleno, entra directamente a la materia en la primera línea.

Protocolo de verificación y cero alucinaciones (Estricto):
- Prohibido inventar datos técnicos: Si no hay registros documentados sobre estudio exacto, modelos de micrófonos o consolas, haz un análisis acústico deductivo indicando con claridad que es una deducción basada en la escucha.
- Honestidad sobre repercusión: Si el tema es independiente o de nicho, dilo abiertamente en lugar de fabricar un impacto ficticio.
- Veracidad de la letra: Cita textualmente fragmentos reales en su idioma original con lecciones de vocabulario o dobles sentidos.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta de 4 apartados:
{
  "title": "${cleanT}",
  "artist": "${artist}",
  "year": "${year || '2000'}",
  "album": "${album || 'Álbum oficial'}",
  "synopsis": "Sinopsis técnica de entrada directa (3-5 líneas) resumiendo la tesis sónica y la trascendencia de la obra...",
  "sections": [
    {
      "title": "1. Anatomía Musical y Producción de Estudio",
      "icon": "fa-sliders",
      "text": "Análisis de instrumentos clave, capas de pistas, arreglos, frecuencias (subgraves, medios, agudos), técnicas de grabación, procesadores, compresión, reverberación, saturación y labor del productor e ingenieros..."
    },
    {
      "title": "2. Análisis Lírico y Desglose Verso a Verso",
      "icon": "fa-align-left",
      "text": "Temática central, trasfondo psicológico o contexto real. Selección de estrofas clave (apertura, estribillo, puente/coda) citadas textualmente en su idioma original con lecciones de vocabulario, dobles sentidos y autopsia verso a verso..."
    },
    {
      "title": "3. Narrativa Visual y Videoclip",
      "icon": "fa-film",
      "text": "Dirección, fotografía, concepto artístico y simbolismo del vídeo oficial. (Si no existe, indícalo de forma explícita y analiza la identidad visual, portada o estética)..."
    },
    {
      "title": "4. Impacto Cultural y Curiosidades",
      "icon": "fa-award",
      "text": "Rendimiento comercial, listas, sincronizaciones, anécdotas documentadas y honestidad sobre repercusión real..."
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
                    newEntriesCount++;

                    // Auto-resolver fecha de lanzamiento con Apple Music / iTunes si la canción es nueva
                    const mKey1 = `${artist} - ${rawTitle}`.toLowerCase();
                    const mKey2 = `${artist} - ${cleanT}`.toLowerCase();
                    if (!metadataCache[mKey1] && !metadataCache[mKey2]) {
                        try {
                            const q = encodeURIComponent(`${artist} ${cleanT}`.trim());
                            const itRes = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=5`, { signal: AbortSignal.timeout(4000) });
                            if (itRes.ok) {
                                const itData = await itRes.json();
                                if (itData.results && itData.results.length > 0) {
                                    const best = itData.results[0];
                                    const rDate = (best.releaseDate || '').split('T')[0];
                                    const rYear = rDate.split('-')[0];
                                    const metaObj = {
                                        title: cleanT,
                                        displayTitle: cleanT,
                                        artist: artist,
                                        album: best.collectionName || 'Álbum',
                                        year: rYear,
                                        date: rDate,
                                        releaseYear: rYear,
                                        releaseDate: rDate,
                                        coverUrl: best.artworkUrl100 ? best.artworkUrl100.replace('100x100bb', '600x600bb') : null,
                                        durationMs: best.trackTimeMillis || 0,
                                        source: 'Apple Music / iTunes Auto-Resolver'
                                    };
                                    metadataCache[mKey1] = metaObj;
                                    metadataCache[mKey2] = metaObj;
                                    try { fs.writeFileSync(METADATA_CACHE_FILE, JSON.stringify(metadataCache, null, 2), 'utf8'); } catch(e){}
                                }
                            }
                        } catch(e) {}
                    }

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
        .replace(/\s*\(.*remaster.*\)/i, '')
        .replace(/\s*\(.*acoustic.*\)/i, '')
        .replace(/\s*\(.*remix.*\)/i, '')
        .replace(/\s*\(.*live.*\)/i, '')
        .replace(/\s*-\s*Deluxe.*/i, '')
        .replace(/\s*-\s*Expanded.*/i, '')
        .replace(/\s*-\s*Remastered.*/i, '')
        .replace(/\s*-\s*Remaster.*/i, '')
        .replace(/\s*-\s*\d{4}\s*remaster.*/i, '')
        .replace(/\s*-\s*Live.*/i, '')
        .replace(/\s*-\s*Acoustic.*/i, '')
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
    if (metadataCache[key1] && metadataCache[key1].coverUrl) return metadataCache[key1];

    let key2 = `${artist} - ${cleanTitle}`.toLowerCase();
    if (metadataCache[key2] && metadataCache[key2].coverUrl) return metadataCache[key2];

    let normArt = (artist || '').toLowerCase().replace(/,/g, ' ').replace(/&/g, ' ').replace(/[^a-z0-9]/g, '');
    let normTit = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    let normTarget = `${normArt}${normTit}`;

    for (const [k, meta] of Object.entries(metadataCache)) {
        if (!meta || !meta.coverUrl) continue;
        let normK = k.toLowerCase().replace(/,/g, ' ').replace(/&/g, ' ').replace(/[^a-z0-9]/g, '');
        if (normK === normTarget || (normK.length > 5 && (normK.includes(normTarget) || normTarget.includes(normK)))) {
            return meta;
        }
    }

    // Secondary match: title match + primary artist word match
    const primaryArtist = normArt.split(' ')[0] || '';
    if (normTit.length > 3) {
        for (const [k, meta] of Object.entries(metadataCache)) {
            if (!meta || !meta.coverUrl) continue;
            let normK = k.toLowerCase().replace(/,/g, ' ').replace(/&/g, ' ').replace(/[^a-z0-9]/g, '');
            if (normK.includes(normTit) && (primaryArtist.length < 3 || normK.includes(primaryArtist))) {
                return meta;
            }
        }
    }

    if (metadataCache[key1]) return metadataCache[key1];
    if (metadataCache[key2]) return metadataCache[key2];

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
        // Quitar colaboraciones/features
        .replace(/\s*-\s*[A-Za-z0-9\s]+\s+featuring\s+.*$/i, '')
        .replace(/\s*-\s*[A-Za-z0-9\s]+\s+feat\.?\s+.*$/i, '')
        .replace(/\s*\([A-Za-z0-9\s]+\s+featuring\s+.*\)$/i, '')
        .replace(/\s*\([A-Za-z0-9\s]+\s+feat\.?\s+.*\)$/i, '')
        .replace(/\s*\(feat\.?\s+.*\)$/i, '')
        .replace(/\s*\(featuring\s+.*\)$/i, '')
        .replace(/\s*\(with\s+.*\)$/i, '')
        .replace(/^\s*\.\.\.\s*/, '')
        // Quitar cualquier sufijo entre paréntesis que sea versión, remaster, edit, mix, etc.
        .replace(/\s*\([^)]*(radio version|album version|single version|\d{4} version|short version|extended version|original version|version)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*(radio edit|club edit|extended mix|club mix|radio mix|dance vault|re-edit|edit|mixed)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*(remastered|\d{4} remaster|remaster|20\d\d remaster|19\d\d remaster)[^)]*\)/gi, '')
        .replace(/\s*\([^)]*(remix|revisited|dub|vip mix|acoustic|unplugged|live|demo|deluxe|evolutions)[^)]*\)/gi, '')
        // Quitar sufijos precedidos por guión
        .replace(/\s*-\s*(radio version|album version|single version|\d{4} version|short version|original version|version).*/gi, '')
        .replace(/\s*-\s*(radio edit|club edit|extended mix|club mix|radio mix|edit).*/gi, '')
        .replace(/\s*-\s*(remastered|\d{4} remaster|remaster|20\d\d remaster|19\d\d remaster).*/gi, '')
        .replace(/\s*-\s*(remix|acoustic|unplugged|live|demo|extended|mono|stereo|original).*/gi, '')
        .replace(/\s*-\s*From\s+".*?".*/i, '')
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
    app.use('/media-music', (req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    }, express.static(OMEN_MUSIC_DIR, {
        setHeaders: (res) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Accept-Ranges', 'bytes');
        }
    }));
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
                    let sizeBytes = 0;
                    try { sizeBytes = fs.statSync(path.join(folderPath, file)).size; } catch(e){}
                    const isTruncated = sizeBytes > 0 && sizeBytes < 2.5 * 1024 * 1024; // < 2.5MB is truncated/preview
                    audioMap.set(baseName, {
                        category,
                        fileName: file,
                        sizeBytes,
                        isTruncated,
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
    for (const [rawListName, rawTracks] of Object.entries(playlistsData)) {
        const listName = normalizePlaylistKey(rawListName);
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
            // Si el archivo de audio está truncado (<2.5MB) pero tenemos videoclip completo, usar el videoclip como audio
            if (audioInfo && audioInfo.isTruncated) {
                if (videoInfo && videoInfo.mp4) {
                    audioUrl = `/media-videos/${videoInfo.mp4.replace(/\\/g, '/')}`;
                } else if (jellyVideo && jellyVideo.streamUrl) {
                    audioUrl = jellyVideo.streamUrl;
                }
            }
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

            let releaseYear = meta.releaseYear || meta.year || '2000';
            let releaseDate = meta.releaseDate || meta.date || `${releaseYear}-01-01`;

            // Check iconic album dates
            const normAlbum = (meta.album || '').toLowerCase().trim();
            if (iconicAlbumDates[normAlbum]) {
                releaseYear = iconicAlbumDates[normAlbum].year;
                releaseDate = iconicAlbumDates[normAlbum].date;
            }

            // Regla de coherencia estructural por tipo de Playlist (cero contaminación cruzada)
            const yrNum = parseInt(releaseYear, 10) || 0;
            if (/siglo\s*xxi/i.test(listName)) {
                // Siglo XXI: La música es por definición del año 2000 en adelante
                if (yrNum > 0 && yrNum < 2000) {
                    if (meta.year && parseInt(meta.year, 10) >= 2000) {
                        releaseYear = meta.year;
                        releaseDate = meta.date || `${releaseYear}-01-01`;
                    } else {
                        releaseYear = '2000';
                        releaseDate = '2000-01-01';
                    }
                }
            } else if (/viejuna/i.test(listName)) {
                // Música viejuna: Clásicos anteriores a 2003
                if (yrNum > 2003) {
                    if (analysis && analysis.year && parseInt(analysis.year, 10) <= 2003) {
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
                title: (/dance/i.test(listName)) ? (meta.displayTitle || cleanTitle) : cleanTrackTitle(meta.displayTitle || cleanTitle),
                rawTitle: title,
                album: (/dance/i.test(listName)) ? (meta.album || 'Álbum Desconocido') : cleanAlbumTitle(meta.album),
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

        if (!response[listName]) { response[listName] = []; } response[listName] = response[listName].concat(enrichedTracks);
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

    // Normalized search: solo si coinciden tanto el artista como el título juntos
    const normTarget = `${artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(cachedAnalyses)) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normTarget) {
            return v;
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

        // Traducir inmediatamente con caché en memoria y guardar
        if (parsedLyrics && parsedLyrics.length > 0) {
            try {
                parsedLyrics = await translateLyricsBatch(parsedLyrics);
            } catch(e){}
            const cleanT = cleanTrackTitle(title);
            cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
            cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
            cachedLyricsDb[cleanT] = parsedLyrics;
            try {
                fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
            } catch(e){}
        }
    }

    if (parsedLyrics && parsedLyrics.length > 0) {
        const hasUntranslated = parsedLyrics.some(l => (l.text || '').trim().length > 3 && !l.translation);
        if (hasUntranslated) {
            try {
                parsedLyrics = await translateLyricsBatch(parsedLyrics);
                const cleanT = cleanTrackTitle(title);
                cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
                cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
                cachedLyricsDb[cleanT] = parsedLyrics;
                try {
                    fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
                } catch(e){}
            } catch(e){}
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
// 🔄 Rotar y Escoger Otra Versión de Subtítulos (LRCLIB)
// ==========================================================================
let lyricsCycleMap = {};

app.post('/api/lyrics/cycle-version', async (req, res) => {
    try {
        const { artist, title } = req.body;
        if (!artist || !title) {
            return res.status(400).json({ error: 'Faltan parámetros artist y title' });
        }

        const cleanT = cleanTrackTitle(title);
        const searchTerms = [
            `${artist} ${cleanT}`,
            cleanT,
            `${artist} ${title}`
        ];

        let allCandidates = [];
        const seenLrc = new Set();

        for (const term of searchTerms) {
            try {
                const url = `https://lrclib.net/api/search?q=${encodeURIComponent(term)}`;
                const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            if (item.syncedLyrics && item.syncedLyrics.trim().length > 30) {
                                const firstLine = item.syncedLyrics.split('\n')[0].trim();
                                const sig = `${item.duration || 0}_${firstLine}`;
                                if (!seenLrc.has(sig)) {
                                    seenLrc.add(sig);
                                    allCandidates.push(item);
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
            if (allCandidates.length >= 6) break;
        }

        if (allCandidates.length === 0) {
            return res.status(404).json({ error: 'No se encontraron versiones alternativas de subtítulos' });
        }

        const cycleKey = `${artist} - ${cleanT}`.toLowerCase();
        const currentIdx = lyricsCycleMap[cycleKey] || 0;
        const chosenCandidate = allCandidates[currentIdx % allCandidates.length];
        lyricsCycleMap[cycleKey] = currentIdx + 1;

        let parsedLyrics = parseLrc(chosenCandidate.syncedLyrics);
        if (!parsedLyrics || parsedLyrics.length === 0) {
            return res.status(500).json({ error: 'Error procesando los subtítulos seleccionados' });
        }

        // Traducir subtítulos al español por lotes
        parsedLyrics = await translateLyricsBatch(parsedLyrics);

        // Guardar en la base de datos de subtítulos permanente
        cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
        cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
        cachedLyricsDb[cleanT] = parsedLyrics;
        cachedLyricsDb[title] = parsedLyrics;

        try {
            fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
        } catch(e) {
            console.error('Error escribiendo en LYRICS_DB_PATH:', e.message);
        }

        // Calcular duración del último subtítulo
        const lastLine = parsedLyrics[parsedLyrics.length - 1];
        let subsDurSec = 0;
        if (lastLine) {
            if (typeof lastLine.seconds === 'number') subsDurSec = lastLine.seconds;
            else if (lastLine.time) {
                const parts = lastLine.time.split(':');
                subsDurSec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1] || 0);
            }
        }
        const mins = Math.floor(subsDurSec / 60);
        const secs = Math.floor(subsDurSec % 60);
        const formattedSubsDur = `${mins}:${secs.toString().padStart(2, '0')}`;

        console.log(`[LYRICS CYCLE] Versión alternativa ${(currentIdx % allCandidates.length) + 1}/${allCandidates.length} aplicada para ${artist} - ${cleanT} (Duración subtítulos: ${formattedSubsDur})`);

        res.json({
            success: true,
            lyrics: parsedLyrics,
            candidateIndex: (currentIdx % allCandidates.length) + 1,
            totalCandidates: allCandidates.length,
            subsDuration: formattedSubsDur,
            subsDurationSec: subsDurSec,
            trackName: chosenCandidate.trackName,
            duration: chosenCandidate.duration
        });
    } catch(err) {
        console.error('Error en /api/lyrics/cycle-version:', err);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================================================
// 🔄 Reemplazar pista por Versión Limpia Oficial de Estudio
// ==========================================================================
let versionCycleIndex = {};

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
        const tempOutput = path.join(__dirname, 'data', `temp_clean_${Date.now()}.mp3`);

        const { exec } = require('child_process');
        const binDir = path.join(__dirname, 'bin');
        const ytdlpBin = fs.existsSync(path.join(binDir, 'yt-dlp.exe')) ? `"${path.join(binDir, 'yt-dlp.exe')}"` : 'python -m yt_dlp';
        const ffmpegDir = fs.existsSync(path.join(binDir, 'ffmpeg.exe')) ? binDir : 'C:\\Users\\MSI Roberto\\.spotdl';

        console.log(`[CLEAN DOWNLOAD] Buscando versión limpia y exacta de estudio para: ${artist} - ${cleanT}`);

        // 1. Obtener duración esperada de estudio (en segundos)
        let expectedDurationSec = null;
        const meta = getTrackMetadata(artist, title);
        if (meta && meta.durationMs) {
            expectedDurationSec = Math.round(meta.durationMs / 1000);
        } else {
            try {
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + cleanT)}&entity=song&limit=5`, { signal: AbortSignal.timeout(3500) });
                if (itunesRes.ok) {
                    const itunesData = await itunesRes.json();
                    if (itunesData.results && itunesData.results.length > 0) {
                        const match = itunesData.results.find(r => (r.artistName || '').toLowerCase().includes(artist.toLowerCase().split(/[,&]/)[0].trim())) || itunesData.results[0];
                        if (match && match.trackTimeMillis) {
                            expectedDurationSec = Math.round(match.trackTimeMillis / 1000);
                        }
                    }
                }
            } catch(e) {}
        }

        console.log(`[CLEAN DOWNLOAD] Duración oficial de estudio esperada: ${expectedDurationSec ? expectedDurationSec + 's (' + Math.floor(expectedDurationSec/60) + ':' + (expectedDurationSec%60).toString().padStart(2, '0') + ')' : 'No especificada'}`);

        // 2. Buscar candidatos en SoundCloud y YouTube con yt-dlp dump-json
        const searchQueries = [
            `scsearch25:${artist} - ${cleanT}`,
            `scsearch25:${artist} ${cleanT}`
        ];

        let bestCandidate = null;
        let allValidCandidates = [];

        for (const q of searchQueries) {
            try {
                const dumpCmd = `${ytdlpBin} --dump-json --flat-playlist "${q}"`;
                const dumpOutput = await new Promise((resolve) => {
                    exec(dumpCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000, windowsHide: true }, (err, stdout) => {
                        resolve(stdout || '');
                    });
                });

                if (!dumpOutput) continue;

                const lines = dumpOutput.trim().split('\n');

                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        const dur = item.duration;
                        if (!dur || dur < 60) continue;

                        const itemTitle = (item.title || '').toLowerCase();
                        if (itemTitle.includes('preview') || itemTitle.includes('teaser') || itemTitle.includes('trailer') || itemTitle.includes('snippet')) continue;

                        // Descartar remixes, mashups, covers o sped up si el tema original no los tiene
                        const isRemixWord = /remix|club mix|extended|tribute|cover by|sped up|slowed|mashup|parody/i.test(itemTitle);
                        if (isRemixWord && !/remix|club/i.test(title)) continue;

                        // Penalizar o descartar colaboradores ajenos
                        let collabPenalty = 0;
                        const hasOriginalCollab = title.toLowerCase().includes('feat') || title.toLowerCase().includes('con ') || title.toLowerCase().includes('ft.');
                        if (!hasOriginalCollab && (itemTitle.includes('feat.') || itemTitle.includes('ft.') || itemTitle.includes(' con '))) {
                            collabPenalty = 15;
                        }

                        // REGLA ESTRICTA SOLICITADA POR EL USUARIO: solo aceptar diferencia de +- 10 segundos
                        if (expectedDurationSec) {
                            const rawDiff = Math.abs(dur - expectedDurationSec);
                            if (rawDiff > 10) {
                                continue; // Descartado por no estar dentro de +-10s
                            }
                        }

                        const diff = (expectedDurationSec ? Math.abs(dur - expectedDurationSec) : 0) + collabPenalty;

                        allValidCandidates.push({
                            url: item.webpage_url || item.url,
                            duration: dur,
                            title: item.title,
                            diff: diff
                        });
                    } catch(e) {}
                }

                if (allValidCandidates.length >= 3) break;
            } catch(e) {
                console.warn(`Aviso buscando con ${q}:`, e.message);
            }
        }

        // Eliminar duplicados por URL
        const uniqueCandidates = [];
        const seenUrls = new Set();
        for (const c of allValidCandidates) {
            if (!seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                uniqueCandidates.push(c);
            }
        }

        if (uniqueCandidates.length > 0) {
            uniqueCandidates.sort((a, b) => a.diff - b.diff);

            // ROTACIÓN DE VERSIONES: ordenar candidatos empezando por la siguiente opción
            const trackCycleKey = `${artist} - ${cleanT}`.toLowerCase();
            const cycle = versionCycleIndex[trackCycleKey] || 0;
            const startIdx = cycle % uniqueCandidates.length;
            versionCycleIndex[trackCycleKey] = cycle + 1;

            // Reorganizar lista para probar primero la opción elegida por rotación, luego las demás como fallback
            const orderedCandidates = [
                ...uniqueCandidates.slice(startIdx),
                ...uniqueCandidates.slice(0, startIdx)
            ];

            console.log(`[CLEAN DOWNLOAD] Probando ${orderedCandidates.length} candidatos válidos (iniciando en opción ${startIdx + 1})...`);

            let downloadedSuccess = false;
            let finalStats = null;

            for (let i = 0; i < orderedCandidates.length; i++) {
                const cand = orderedCandidates[i];
                console.log(`[CLEAN DOWNLOAD] Intentando candidato [${i + 1}/${orderedCandidates.length}]: "${cand.title}" (${cand.duration}s) -> ${cand.url}`);

                const downloadCmd = `${ytdlpBin} --ffmpeg-location "${ffmpegDir}" "${cand.url}" -x --audio-format mp3 --audio-quality 0 -o "${tempOutput}"`;

                const result = await new Promise((resolve) => {
                    exec(downloadCmd, { timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
                        if (fs.existsSync(tempOutput)) {
                            try {
                                const stats = fs.statSync(tempOutput);
                                if (stats.size >= 900000) {
                                    return resolve({ success: true, stats });
                                } else {
                                    try { fs.unlinkSync(tempOutput); } catch(e){}
                                }
                            } catch(e) {}
                        }
                        console.warn(`⚠️ Candidato "${cand.title}" falló (DRM/bloqueo/peso inválido). Probando siguiente...`);
                        resolve({ success: false });
                    });
                });

                if (result.success) {
                    downloadedSuccess = true;
                    finalStats = result.stats;
                    bestCandidate = cand;
                    break;
                }
            }

            if (!downloadedSuccess || !finalStats) {
                return res.status(500).json({ error: 'Ninguno de los candidatos disponibles pudo descargarse (posible protección DRM o restricción).' });
            }

            try {
                fs.copyFileSync(tempOutput, targetFilePath);
                fs.unlinkSync(tempOutput);
                console.log(`✅ [CLEAN DOWNLOAD] Pista reemplazada con éxito (${finalStats.size} bytes) en: ${targetFilePath}`);

                // Restablecer retardo a 0.0s y sincronizar letras limpias
                try {
                    const lrcurl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(cleanT)}`;
                    const lrcres = await fetch(lrcurl, { signal: AbortSignal.timeout(3000) });
                    if (lrcres.ok) {
                        const lrcdata = await lrcres.json();
                        if (lrcdata.syncedLyrics) {
                            let freshLyrics = parseLrc(lrcdata.syncedLyrics);
                            if (freshLyrics) {
                                freshLyrics = await translateLyricsBatch(freshLyrics);
                                cachedLyricsDb[`${artist} - ${title}`] = freshLyrics;
                                cachedLyricsDb[`${artist} - ${cleanT}`] = freshLyrics;
                                cachedLyricsDb[cleanT] = freshLyrics;
                                fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
                                console.log(`✅ Letras sincronizadas restablecidas automáticamente a 0.0s para ${artist} - ${cleanT}`);
                            }
                        }
                    }
                } catch(e) {}

                return res.json({
                    success: true,
                    size: finalStats.size,
                    candidate: bestCandidate
                });
            } catch (copyErr) {
                return res.status(500).json({ error: 'Error guardando archivo reemplazado: ' + copyErr.message });
            }
        } else {
            return res.status(404).json({ error: 'No se encontraron candidatos válidos dentro de +-10s.' });
        }
    } catch(e) {
        console.error('Error en replace-clean-audio:', e);
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

        // Traducir inmediatamente con caché en memoria y guardar
        if (parsedLyrics && parsedLyrics.length > 0) {
            try {
                parsedLyrics = await translateLyricsBatch(parsedLyrics);
            } catch(e){}
            const cleanT = cleanTrackTitle(title);
            cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
            cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
            cachedLyricsDb[cleanT] = parsedLyrics;
            try {
                fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
            } catch(e){}
        }
    }

    if (parsedLyrics && parsedLyrics.length > 0) {
        const hasUntranslated = parsedLyrics.some(l => (l.text || '').trim().length > 3 && !l.translation);
        if (hasUntranslated) {
            try {
                parsedLyrics = await translateLyricsBatch(parsedLyrics);
                const cleanT = cleanTrackTitle(title);
                cachedLyricsDb[`${artist} - ${title}`] = parsedLyrics;
                cachedLyricsDb[`${artist} - ${cleanT}`] = parsedLyrics;
                cachedLyricsDb[cleanT] = parsedLyrics;
                try {
                    fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(cachedLyricsDb, null, 2), 'utf8');
                } catch(e){}
            } catch(e){}
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
// 📻 DESCUBRIDOR DE ÉXITOS DE ESPAÑA (1970-1999) & RADAR DE RADIO CLÁSICA
// ==========================================================================

const SPANISH_RETRO_HITS_FILE = path.join(__dirname, 'data', 'spanish_retro_hits.json');
let cachedRetroHits = null;

function loadSpanishRetroHits() {
    if (!cachedRetroHits && fs.existsSync(SPANISH_RETRO_HITS_FILE)) {
        try {
            cachedRetroHits = JSON.parse(fs.readFileSync(SPANISH_RETRO_HITS_FILE, 'utf8'));
        } catch(e) {
            console.error('Error cargando spanish_retro_hits.json:', e.message);
            cachedRetroHits = [];
        }
    }
    return cachedRetroHits || [];
}

function getViejunaTracksSet() {
    const set = new Set();
    const folder = path.join(OMEN_MUSIC_DIR, 'Música viejuna');
    if (fs.existsSync(folder)) {
        try {
            const files = fs.readdirSync(folder);
            for (const f of files) {
                const ext = path.extname(f).toLowerCase();
                if (ext === '.mp3' || ext === '.m4a' || ext === '.flac') {
                    const cleanName = f.replace(/\.[^.]+$/, '')
                        .toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]/g, '');
                    set.add(cleanName);
                }
            }
        } catch(e){}
    }
    return set;
}

function isHitOwned(artist, title, viejunaSet) {
    const cleanArt = (artist || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const cleanTit = (title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const combo = cleanArt + cleanTit;
    const comboRev = cleanTit + cleanArt;

    for (const owned of viejunaSet) {
        if (owned.includes(combo) || owned.includes(comboRev)) return true;
        if (cleanArt.length >= 4 && cleanTit.length >= 4 && owned.includes(cleanArt) && owned.includes(cleanTit)) return true;
    }
    return false;
}

// 1. Catálogo histórico de éxitos con estadísticas por año
app.get('/api/retro-hits/catalog', (req, res) => {
    try {
        const hits = loadSpanishRetroHits();
        const viejunaSet = getViejunaTracksSet();
        const { year, filter } = req.query; // filter: 'missing', 'owned', or undefined

        const yearsStats = {};
        for (let y = 1970; y <= 1999; y++) {
            yearsStats[y] = { year: y, total: 0, owned: 0, missing: 0, percentage: 0 };
        }

        let totalHits = 0;
        let totalOwned = 0;

        const enrichedHits = hits.map(h => {
            const owned = isHitOwned(h.artist, h.title, viejunaSet);
            if (yearsStats[h.year]) {
                yearsStats[h.year].total++;
                if (owned) yearsStats[h.year].owned++;
                else yearsStats[h.year].missing++;
            }
            totalHits++;
            if (owned) totalOwned++;

            return {
                ...h,
                isOwned: owned
            };
        });

        // Calcular porcentajes
        Object.values(yearsStats).forEach(s => {
            s.percentage = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
        });

        let filteredHits = enrichedHits;
        if (year && parseInt(year, 10)) {
            const yNum = parseInt(year, 10);
            filteredHits = filteredHits.filter(h => h.year === yNum);
        }
        if (filter === 'missing') {
            filteredHits = filteredHits.filter(h => !h.isOwned);
        } else if (filter === 'owned') {
            filteredHits = filteredHits.filter(h => h.isOwned);
        }

        res.json({
            summary: {
                totalHits,
                totalOwned,
                totalMissing: totalHits - totalOwned,
                globalPercentage: totalHits > 0 ? Math.round((totalOwned / totalHits) * 100) : 0
            },
            yearsStats: Object.values(yearsStats),
            hits: filteredHits
        });
    } catch(e) {
        console.error('Error en /api/retro-hits/catalog:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 2. Preescucha instantánea oficial (iTunes Search API 30s)
app.get('/api/retro-hits/preview', async (req, res) => {
    try {
        const { artist, title } = req.query;
        if (!artist || !title) return res.status(400).json({ error: 'Falta artist o title' });

        const query = encodeURIComponent(`${artist} ${cleanTrackTitle(title)}`);
        const itunesUrl = `https://itunes.apple.com/search?term=${query}&media=music&limit=5`;

        const response = await fetch(itunesUrl, { signal: AbortSignal.timeout(4000) });
        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const cleanArt = artist.toLowerCase();
                const match = data.results.find(r => (r.artistName || '').toLowerCase().includes(cleanArt.split(/[,&]/)[0].trim())) || data.results[0];
                return res.json({
                    previewUrl: match.previewUrl || null,
                    artworkUrl: (match.artworkUrl100 || '').replace('100x100bb.jpg', '400x400bb.jpg'),
                    trackName: match.trackName,
                    artistName: match.artistName,
                    durationSec: match.trackTimeMillis ? Math.round(match.trackTimeMillis / 1000) : null,
                    releaseDate: match.releaseDate ? match.releaseDate.split('T')[0] : null
                });
            }
        }
        res.json({ previewUrl: null });
    } catch(e) {
        res.json({ previewUrl: null, error: e.message });
    }
});

// 3. Radar de Emisoras Españolas de Clásicos (Los 40 Classic en Vivo)
app.get('/api/retro-hits/radio-radar', async (req, res) => {
    try {
        const tritonUrl = 'https://np.tritondigital.com/public/nowplaying?mountName=LOS40_CLASSIC&numberToFetch=50';
        const tritonRes = await fetch(tritonUrl, { signal: AbortSignal.timeout(5000) });
        if (!tritonRes.ok) {
            return res.status(500).json({ error: 'Error conectando con emisión de Los 40 Classic' });
        }

        const xmlText = await tritonRes.text();
        const viejunaSet = getViejunaTracksSet();

        function getXmlProp(block, propName) {
            const startTag = `<property name="${propName}"><![CDATA[`;
            const endTag = ']]></property>';
            const sIdx = block.indexOf(startTag);
            if (sIdx === -1) return '';
            const eIdx = block.indexOf(endTag, sIdx + startTag.length);
            if (eIdx === -1) return '';
            return block.substring(sIdx + startTag.length, eIdx).trim();
        }

        const items = [];
        const blocks = xmlText.split('</nowplaying-info>');
        for (const block of blocks) {
            if (!block.includes('<nowplaying-info')) continue;
            const title = getXmlProp(block, 'cue_title');
            const artist = getXmlProp(block, 'track_artist_name');
            const album = getXmlProp(block, 'track_album_name');
            const coverUrl = getXmlProp(block, 'track_cover_url');
            const timestamp = getXmlProp(block, 'cue_time_start');

            if (title && artist && !title.toLowerCase().includes('publicidad') && !title.toLowerCase().includes('los40 classic')) {
                const isOwned = isHitOwned(artist, title, viejunaSet);
                items.push({
                    artist,
                    title,
                    album,
                    coverUrl,
                    timestamp: timestamp ? parseInt(timestamp, 10) : null,
                    isOwned
                });
            }
        }

        const unique = [];
        const seen = new Set();
        for (const it of items) {
            const k = `${it.artist}-${it.title}`.toLowerCase();
            if (!seen.has(k)) {
                seen.add(k);
                unique.push(it);
            }
        }

        res.json({
            station: 'LOS40 Classic',
            slogan: 'Los Números 1 de Tu Vida',
            count: unique.length,
            missingCount: unique.filter(i => !i.isOwned).length,
            tracks: unique
        });
    } catch(e) {
        console.error('Error en /api/retro-hits/radio-radar:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 4. Descarga directa en calidad de estudio hacia 'Música viejuna'
app.post('/api/retro-hits/add-to-viejuna', async (req, res) => {
    try {
        const { artist, title, expectedDurationSec } = req.body;
        if (!artist || !title) {
            return res.status(400).json({ error: 'Falta artist o title' });
        }

        const cleanT = cleanTrackTitle(title);
        const targetFolder = path.join(OMEN_MUSIC_DIR, 'Música viejuna');
        if (!fs.existsSync(targetFolder)) {
            try { fs.mkdirSync(targetFolder, { recursive: true }); } catch(e){}
        }

        const targetFileName = `${artist} - ${cleanT}.mp3`;
        const targetFilePath = path.join(targetFolder, targetFileName);
        const tempOutput = path.join(__dirname, 'data', `temp_retro_${Date.now()}.mp3`);

        const { exec } = require('child_process');
        const binDir = path.join(__dirname, 'bin');
        const ytdlpBin = fs.existsSync(path.join(binDir, 'yt-dlp.exe')) ? `"${path.join(binDir, 'yt-dlp.exe')}"` : 'python -m yt_dlp';
        const ffmpegDir = fs.existsSync(path.join(binDir, 'ffmpeg.exe')) ? binDir : 'C:\\Users\\MSI Roberto\\.spotdl';

        console.log(`[RETRO DOWNLOAD] Añadiendo a Viejuna: ${artist} - ${cleanT}`);

        // 1. Duración esperada
        let expectedDur = expectedDurationSec || null;
        if (!expectedDur) {
            try {
                const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + cleanT)}&entity=song&limit=5`, { signal: AbortSignal.timeout(3500) });
                if (itunesRes.ok) {
                    const itunesData = await itunesRes.json();
                    if (itunesData.results && itunesData.results.length > 0) {
                        const match = itunesData.results.find(r => (r.artistName || '').toLowerCase().includes(artist.toLowerCase().split(/[,&]/)[0].trim())) || itunesData.results[0];
                        if (match && match.trackTimeMillis) {
                            expectedDur = Math.round(match.trackTimeMillis / 1000);
                        }
                    }
                }
            } catch(e) {}
        }

        // 2. Búsqueda con yt-dlp
        const searchQueries = [
            `scsearch25:${artist} - ${cleanT}`,
            `scsearch25:${artist} ${cleanT}`,
            `ytsearch10:${artist} - ${cleanT} audio`
        ];

        let validCandidates = [];
        for (const q of searchQueries) {
            try {
                const dumpCmd = `${ytdlpBin} --dump-json --flat-playlist "${q}"`;
                const dumpOutput = await new Promise((resolve) => {
                    exec(dumpCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000, windowsHide: true }, (err, stdout) => {
                        resolve(stdout || '');
                    });
                });

                if (!dumpOutput) continue;
                const lines = dumpOutput.trim().split('\n');

                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        const dur = item.duration;
                        if (!dur || dur < 50) continue;

                        const itemTitle = (item.title || '').toLowerCase();
                        if (itemTitle.includes('remix') || itemTitle.includes('extended') || 
                            itemTitle.includes('cover') || itemTitle.includes('tribute') || 
                            itemTitle.includes('karaoke') || itemTitle.includes('parody')) {
                            continue;
                        }

                        let diff = 0;
                        if (expectedDur) {
                            diff = Math.abs(dur - expectedDur);
                            if (diff > 12) continue; // Tolerancia estricta de 12 segundos
                        }

                        validCandidates.push({
                            id: item.id,
                            url: item.url || item.webpage_url || item.id,
                            title: item.title,
                            duration: dur,
                            diff: diff
                        });
                    } catch(e) {}
                }

                if (validCandidates.length > 0) break;
            } catch(e) {}
        }

        if (validCandidates.length === 0) {
            return res.status(404).json({ error: `No se encontró versión de estudio limpia (±10s de duración oficial)` });
        }

        validCandidates.sort((a, b) => a.diff - b.diff);
        const bestCandidate = validCandidates[0];

        // 3. Descargar candidato
        const downloadUrl = bestCandidate.url.startsWith('http') ? bestCandidate.url : `https://www.youtube.com/watch?v=${bestCandidate.id}`;
        const dlCmd = `${ytdlpBin} --ffmpeg-location "${ffmpegDir}" -x --audio-format mp3 --audio-quality 0 -o "${tempOutput}" "${downloadUrl}"`;

        const dlSuccess = await new Promise((resolve) => {
            exec(dlCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 45000, windowsHide: true }, (err) => {
                if (!err && fs.existsSync(tempOutput)) {
                    const stats = fs.statSync(tempOutput);
                    if (stats.size >= 800000) return resolve(true);
                }
                resolve(false);
            });
        });

        if (!dlSuccess) {
            return res.status(500).json({ error: 'Error durante la descarga o archivo corrupto' });
        }

        fs.copyFileSync(tempOutput, targetFilePath);
        try { fs.unlinkSync(tempOutput); } catch(e){}

        console.log(`✅ [RETRO DOWNLOAD] Canción guardada exitosamente en Viejuna: ${targetFilePath}`);

        // Invalida la caché del catálogo
        cachedRetroHits = null;

        res.json({
            success: true,
            fileName: targetFileName,
            artist,
            title: cleanT,
            duration: bestCandidate.duration
        });
    } catch(e) {
        console.error('Error en /api/retro-hits/add-to-viejuna:', e.message);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 8087;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Música corriendo en http://localhost:${PORT}`);
});
