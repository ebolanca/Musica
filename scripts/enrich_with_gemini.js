const fs = require('fs');
const path = require('path');

// Cargar .env
const ENV_PATH = path.join(__dirname, '..', '.env');
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

const DB_PATH = path.join(__dirname, '..', 'data', 'analyses_db.json');
const geminiKey = process.env.GEMINI_API_KEY;

if (!geminiKey) {
    console.error("❌ No se encontró GEMINI_API_KEY en el entorno o en .env");
    process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
    console.error("❌ No se encontró analyses_db.json");
    process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

function isGeneric(analysis) {
    if (!analysis) return true;
    if (!analysis.sections || analysis.sections.length === 0) return true;
    if (analysis.synopsis && analysis.synopsis.includes("es una pieza fundamental dentro de su género")) return true;
    if (analysis.sections[0] && analysis.sections[0].points && analysis.sections[0].points[0] && analysis.sections[0].points[0].name === "El punto de inflexión creativo") return true;
    return false;
}

async function analyzeSong(artist, title, year, album) {
    const prompt = `Actúa como un crítico musical y musicólogo apasionado y de altísimo nivel.
Genera un análisis sónico, musical e histórico profundo, vibrante, apasionado y revelador para la canción "${title}" de ${artist} (álbum: ${album || 'Desconocido'}, año: ${year || 'Clásico'}).

NORMAS ESTRICTAS DE CALIDAD Y REALISMO (CERO RELLENO):
1. NUNCA inventes ni uses frases genéricas de plantilla ("marcó un hito", "pieza fundamental dentro de su género").
2. ADAPTA LAS SECCIONES A LA REALIDAD DE LA CANCIÓN (genera entre 2 y 4 secciones que tengan sentido real):
   - Si la canción es INSTRUMENTAL (o sin letra significativa), NO incluyas sección lírica; profundiza en la armonía, instrumentos, arreglos y texturas.
   - Si la canción NO tuvo un impacto cultural, cinematográfico o premios destacables, NO inventes ni fuerces una sección de legado; omítela o reemplázala por anécdotas reales de la grabación o de los músicos.
3. DATOS ESPECÍFICOS Y TÉCNICOS: Menciona instrumentos reales, sintetizadores, pedales de efectos, afinaciones, colaboraciones, samples, baterías, o técnicas de producción si aplican.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura:
{
  "title": "${title}",
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

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Respuesta vacía de Gemini");
    return JSON.parse(text);
}

async function main() {
    const limit = parseInt(process.argv[2], 10) || 10;
    const delayMs = (parseInt(process.argv[3], 10) || 5) * 1000; // 5 segundos por defecto (12 peticiones/min)

    console.log(`🎵 Buscando canciones con análisis genéricos para enriquecer con Gemini AI (Límite: ${limit})...`);

    // Recolectar canciones únicas pendientes
    const pendingTracks = new Map();
    for (const [key, v] of Object.entries(db)) {
        if (isGeneric(v)) {
            const trackKey = `${v.artist || ''} - ${v.title || ''}`.trim();
            if (!pendingTracks.has(trackKey) && v.title && v.artist) {
                pendingTracks.set(trackKey, v);
            }
        }
    }

    const list = Array.from(pendingTracks.values()).slice(0, limit);
    console.log(`📋 Total pendientes en este lote: ${list.length}`);

    let completed = 0;
    for (const item of list) {
        console.log(`\n[${completed + 1}/${list.length}] Analizando: "${item.title}" - ${item.artist}...`);
        try {
            const analysis = await analyzeSong(item.artist, item.title, item.year, item.album);
            if (analysis && analysis.sections && analysis.sections.length > 0) {
                const key1 = `${item.artist} - ${item.title}`;
                const key2 = item.title;
                db[key1] = analysis;
                db[key2] = analysis;
                fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
                console.log(`  ✅ Guardado con éxito: ${analysis.sections.length} secciones detalladas.`);
                completed++;
            }
        } catch(e) {
            console.error(`  ❌ Error:`, e.message);
        }

        if (completed < list.length) {
            console.log(`  ⏳ Esperando ${delayMs / 1000}s para respetar el Free Tier de Google...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    console.log(`\n🎉 Lote completado: ${completed} canciones analizadas con Gemini AI.`);
}

main();
