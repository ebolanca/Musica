const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/analyses_db.json');
const OMEN_DB_PATH = '\\\\100.95.217.45\\omen D\\03_Trabajo\\Musica\\data\\analyses_db.json';
const ENV_PATH = path.join(__dirname, '../.env');

// Obtener GEMINI_API_KEY
let geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey && fs.existsSync(ENV_PATH)) {
    const env = fs.readFileSync(ENV_PATH, 'utf8');
    const m = env.match(/GEMINI_API_KEY=([^\r\n]+)/);
    if (m) geminiKey = m[1].trim();
}

if (!geminiKey) {
    console.error("❌ ERROR: No se encontró GEMINI_API_KEY en .env ni en variables de entorno.");
    process.exit(1);
}

const ORDERED_LISTS = [
    'Música viejuna',
    'Siglo XXI',
    'Española',
    'Música latina',
    'Dance'
];

function loadDb() {
    if (fs.existsSync(DB_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch(e) {}
    }
    return {};
}

function saveDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    // Sincronizar en OMEN si está accesible
    try {
        if (fs.existsSync(path.dirname(OMEN_DB_PATH))) {
            fs.copyFileSync(DB_PATH, OMEN_DB_PATH);
        }
    } catch(e) {}
}

function cleanTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\(.*radio version.*\)/i, '')
        .replace(/\s*\(.*album version.*\)/i, '')
        .replace(/\s*\(.*single version.*\)/i, '')
        .replace(/\s*\(.*from ".*?".*\)/i, '')
        .replace(/\s*-\s*from ".*?".*/i, '')
        .replace(/\s*-\s*radio version.*/i, '')
        .replace(/\s*-\s*remaster.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '')
        .trim();
}

async function analyzeTrack(artist, title, album, year) {
    const cleanT = cleanTitle(title);
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
      "text": "Análisis exhaustivo de instrumentos clave, capas de pistas, arreglos, frecuencias (subgraves, medios, agudos), técnicas de grabación, procesadores, compresión, reverberación, saturación y labor del productor e ingenieros..."
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

    // Lista de modelos a rotar automáticamente en orden de preferencia
    const availableModels = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite'
    ];

    for (const model of availableModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
                })
            });

            if (res.status === 429) {
                console.warn(`⚠️ Cuota agotada en modelo [${model}]. Probando siguiente modelo disponible...`);
                continue; // Probar siguiente modelo
            }

            if (!res.ok) {
                const txt = await res.text();
                console.warn(`Aviso en modelo ${model} (${res.status}): ${txt.substring(0, 80)}`);
                continue;
            }

            const d = await res.json();
            const rawAnswer = d.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawAnswer) {
                const parsed = JSON.parse(rawAnswer);
                parsed._aiModel = model;
                return parsed;
            }
        } catch(e) {
            console.warn(`Error llamando a ${model}:`, e.message);
        }
    }

    // Si todos los modelos dieron 429
    throw new Error("ALL_QUOTAS_EXHAUSTED");
}

(async () => {
    console.log("==========================================================");
    console.log("🚀 WORKER DE ANÁLISIS FORENSE MUSICAL POR IA (GEMINI)");
    console.log("==========================================================");

    // 1. Obtener playlists desde OMEN
    let playlists = {};
    try {
        const res = await fetch('http://100.95.217.45:8087/api/playlists');
        playlists = await res.json();
    } catch(e) {
        console.error("No se pudo conectar con OMEN:8087, cargando metadatos locales...");
        const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/metadata_cache.json'), 'utf8'));
        playlists = { 'Biblioteca': Object.values(meta) };
    }

    const db = loadDb();
    console.log(`📚 Canciones ya analizadas actualmente en DB: ${Object.keys(db).length}`);

    // Procesar en el orden estricto solicitado
    for (const listName of ORDERED_LISTS) {
        const tracks = playlists[listName] || [];
        if (tracks.length === 0) continue;

        console.log(`\n==========================================================`);
        console.log(`▶️ INICIANDO LISTA: [ ${listName.toUpperCase()} ] (${tracks.length} canciones)`);
        console.log(`==========================================================`);

        let processedInList = 0;
        let skippedInList = 0;

        for (let i = 0; i < tracks.length; i++) {
            const t = tracks[i];
            const cleanT = cleanTitle(t.title || t.rawTitle);
            const artist = t.artist || 'Desconocido';
            const album = t.album || 'Álbum';
            const year = t.releaseYear || t.year || '';

            const keyExact = `${artist} - ${cleanT}`;
            const keyRaw = `${artist} - ${t.rawTitle || t.title}`;

            // Si ya existe (ej. una de las 96 originales o ya analizada) -> SALTAR
            if (db[keyExact] || db[keyRaw]) {
                skippedInList++;
                continue;
            }

            console.log(`\n[${i+1}/${tracks.length}] 🎵 Analizando: "${artist} - ${cleanT}" (${year})...`);

            let success = false;
            let attempts = 0;

            while (!success && attempts < 3) {
                attempts++;
                try {
                    const analysis = await analyzeTrack(artist, cleanT, album, year);
                    if (analysis && analysis.sections && analysis.sections.length >= 4) {
                        db[keyExact] = analysis;
                        saveDb(db);
                        console.log(`✅ [GUARDADO] "${artist} - ${cleanT}" -> ${analysis.sections.length} secciones completas.`);
                        processedInList++;
                        success = true;
                    } else {
                        console.warn(`⚠️ Respuesta incompleta para ${cleanT}, reintentando...`);
                    }
                } catch(err) {
                    if (err.message === 'ALL_QUOTAS_EXHAUSTED' || err.message === 'RATE_LIMIT') {
                        console.warn('⏸️ [CUOTA DIARIA AGOTADA EN TODOS LOS MODELOS]. El worker pausará 30 minutos antes del próximo sondeo...');
                        await new Promise(r => setTimeout(r, 30 * 60 * 1000));
                    } else {
                        console.error(`❌ Error analizando "${cleanT}":`, err.message);
                        break;
                    }
                }
            }

            // Pausa de seguridad de 8 segundos entre canciones para respetar el Free Tier
            await new Promise(r => setTimeout(r, 8000));
        }

        console.log(`\n🏁 FIN DE LISTA [${listName}]: ${processedInList} nuevas analizadas, ${skippedInList} ya estaban en la base de datos.`);
    }

    console.log("\n🎉 ¡TODAS LAS LISTAS HAN SIDO COMPLETADAS CON ÉXITO!");
})();
