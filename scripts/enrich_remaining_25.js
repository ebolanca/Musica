const fs = require('fs');
const path = require('path');

const META_PATH = "C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\data\\metadata_cache.json";
const OMEN_META = "\\\\100.95.217.45\\omen D\\03_Trabajo\\Musica\\data\\metadata_cache.json";
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

const env = fs.readFileSync('C:\\Users\\MSI Roberto\\Documents\\GitHub\\Musica\\.env', 'utf8');
const keyMatch = env.match(/GEMINI_API_KEY=([^\r\n]+)/);
const geminiKey = keyMatch ? keyMatch[1].trim() : '';

const missing = [
    { artist: "Jax Jones, Ina Wroldsen", title: "Breathe" },
    { artist: "Jax Jones, RAYE", title: "You Don't Know Me" },
    { artist: "Lady Gaga", title: "Bad Romance" },
    { artist: "Flo Rida", title: "My House" },
    { artist: "Martin Garrix, Bebe Rexha", title: "In the Name of Love" },
    { artist: "Rosa Linn", title: "SNAP" },
    { artist: "Martin Garrix", title: "Animals" },
    { artist: "Calvin Harris, Disciples", title: "How Deep Is Your Love" },
    { artist: "BTS", title: "Butter" },
    { artist: "BLACKPINK", title: "Kill This Love" },
    { artist: "Kiesza", title: "Hideaway" },
    { artist: "Thirty Seconds To Mars", title: "Stay" },
    { artist: "Otto Knows", title: "Million Voices" },
    { artist: "Topic, A7S", title: "Breaking Me" },
    { artist: "Olivia Dean", title: "So Easy (To Fall In Love)" },
    { artist: "HUGEL, SOLTO (FR)", title: "Jamaican (Bam Bam)" },
    { artist: "Joe Cocker", title: "Unchain My Heart" },
    { artist: "Juliana Oneal", title: "Estúpido" },
    { artist: "Milk Inc.", title: "In My Eyes" },
    { artist: "Milk Inc.", title: "Never Again" },
    { artist: "Spanic", title: "Sister Golden Hair" },
    { artist: "Terminal", title: "Poem Without Words" },
    { artist: "New Limit", title: "Scream" },
    { artist: "Cascada, Maurice West", title: "Everytime We Touch" }
];

async function fetchDeezerCover(artist, album) {
    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await fetch(`https://api.deezer.com/search/album?q=${query}&limit=3`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const data = await res.json();
            const alb = data.data?.[0];
            if (alb && (alb.cover_xl || alb.cover_big)) return alb.cover_xl || alb.cover_big;
        }
    } catch(e) {}
    return null;
}

async function run() {
    console.log(`🚀 Enriqueciendo las ${missing.length} canciones con Gemini 3.5 Flash Lite...`);
    let enriched = 0;

    for (const item of missing) {
        const { artist, title } = item;
        const prompt = `Actúa como musicólogo y documentalista musical experto.
Para la canción "${title}" del artista "${artist}":
Determina:
1. "originalAlbum": Nombre exacto del ÁLBUM DE ESTUDIO ORIGINAL (o EP oficial si debutó en EP, o Álbum homónimo).
2. "releaseYear": Año exacto de lanzamiento original.
3. "releaseDate": Fecha de lanzamiento (YYYY-MM-DD o YYYY-01-01).
4. "composers": Nombres de los compositores reales.
5. "label": Sello discográfico original.
6. "genre": Género musical preciso.

Responde ÚNICAMENTE en JSON válido:
{
  "artist": "${artist}",
  "title": "${title}",
  "originalAlbum": "...",
  "releaseYear": "...",
  "releaseDate": "...",
  "composers": "...",
  "label": "...",
  "genre": "..."
}`;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                }),
                signal: AbortSignal.timeout(10000)
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    const parsed = JSON.parse(text);
                    const cleanAlbum = parsed.originalAlbum || parsed.album;
                    const year = parsed.releaseYear || parsed.year;
                    const date = parsed.releaseDate || `${year}-01-01`;
                    const composers = parsed.composers || artist;
                    const label = parsed.label || 'Sello Discográfico Principal';
                    const genre = parsed.genre || 'Pop / Rock / Dance';

                    const primaryArt = artist.split(/[,&]/)[0].trim();
                    let cover = await fetchDeezerCover(primaryArt, cleanAlbum) || await fetchDeezerCover(artist, cleanAlbum);

                    const mKey1 = `${artist} - ${title}`.toLowerCase();
                    const mKey2 = `${primaryArt} - ${title}`.toLowerCase();
                    const mKey3 = `${title}`.toLowerCase();

                    const current = meta[mKey1] || meta[mKey2] || meta[mKey3] || {};

                    const updated = {
                        ...current,
                        artist,
                        title,
                        displayTitle: title,
                        album: cleanAlbum,
                        releaseYear: String(year),
                        year: String(year),
                        releaseDate: String(date),
                        date: String(date),
                        composers: String(composers),
                        label: String(label),
                        genre: String(genre),
                        coverUrl: cover || current.coverUrl || null,
                        geminiEnriched: true
                    };

                    meta[mKey1] = updated;
                    meta[mKey2] = updated;
                    meta[mKey3] = updated;

                    console.log(`✅ [${artist} - ${title}] -> Álbum: "${cleanAlbum}" (${year}) | Sello: ${label}`);
                    enriched++;
                }
            } else {
                console.log(`⚠️ Error en ${artist} - ${title}: ${res.status}`);
            }
        } catch(e) {
            console.error(`❌ Error en ${artist} - ${title}:`, e.message);
        }

        await new Promise(r => setTimeout(r, 600));
    }

    const dataStr = JSON.stringify(meta, null, 2);
    fs.writeFileSync(META_PATH, dataStr, 'utf8');
    try {
        fs.writeFileSync(OMEN_META, dataStr, 'utf8');
    } catch(e){}

    console.log(`\n🎉 Finalizado: ${enriched}/${missing.length} canciones enriquecidas y guardadas en metadata_cache.json.`);
}

run();
