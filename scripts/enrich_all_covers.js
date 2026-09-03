const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '../data/metadata_cache.json');
const OMEN_META_PATH = '\\\\100.95.217.45\\omen D\\03_Trabajo\\Musica\\data\\metadata_cache.json';

const isCompilation = (title) => /greatest hits|best of|essential|compilation|singles|collection|top hits|remix|recopilatorio|exitos|various artists|hit parade|los nº1|remember/i.test(title);

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    return rawTitle
        .replace(/^\s*\.\.\.\s*/, '')
        .replace(/\s*\(.*official.*\)/gi, '')
        .replace(/\s*\[.*official.*\]/gi, '')
        .replace(/\s*\(.*video.*\)/gi, '')
        .replace(/\s*\[.*video.*\]/gi, '')
        .replace(/\s*-\s*official.*/gi, '')
        .replace(/\s*-\s*video.*/gi, '')
        .replace(/\s*-\s*\d{4}\s*remaster.*/gi, '')
        .replace(/\s*\(.*remaster.*\)/gi, '')
        .replace(/\s*-\s*remaster.*/gi, '')
        .replace(/\s*-\s*single version.*/gi, '')
        .replace(/\s*\(.*radio edit.*\)/gi, '')
        .replace(/\s*-\s*radio edit.*/gi, '')
        .replace(/\s*\(.*album version.*\)/gi, '')
        .replace(/\s*-\s*album version.*/gi, '')
        .replace(/\s*\(.*lp version.*\)/gi, '')
        .replace(/\s*-\s*lp version.*/gi, '')
        .replace(/^[(\[]+([^)]+)[)\]]\s*/, '$1 ')
        .trim();
}

async function fetchBestCover(artist, title, preferredAlbum) {
    const cleanT = cleanTrackTitle(title);
    
    // 1. Deezer API (Portadas 1000x1000 permanentes)
    try {
        const q = encodeURIComponent(`${artist} ${cleanT}`);
        const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=10`);
        if (res.ok) {
            const d = await res.json();
            if (d.data && d.data.length > 0) {
                // Primero: coincidencia con el álbum preferido si no es recopilatorio
                if (preferredAlbum) {
                    const albumMatch = d.data.find(t => t.album && t.album.title && t.album.title.toLowerCase() === preferredAlbum.toLowerCase());
                    if (albumMatch && albumMatch.album && (albumMatch.album.cover_xl || albumMatch.album.cover_big)) {
                        return { coverUrl: albumMatch.album.cover_xl || albumMatch.album.cover_big, album: albumMatch.album.title };
                    }
                }
                // Segundo: primer resultado que NO sea recopilatorio
                const nonComp = d.data.find(t => t.album && t.album.title && !isCompilation(t.album.title));
                if (nonComp && nonComp.album && (nonComp.album.cover_xl || nonComp.album.cover_big)) {
                    return { coverUrl: nonComp.album.cover_xl || nonComp.album.cover_big, album: nonComp.album.title };
                }
                // Tercero: fallback al primer resultado con portada
                const anyMatch = d.data.find(t => t.album && (t.album.cover_xl || t.album.cover_big));
                if (anyMatch) {
                    return { coverUrl: anyMatch.album.cover_xl || anyMatch.album.cover_big, album: anyMatch.album.title };
                }
            }
        }
    } catch(e) {}

    // 2. iTunes API (Portadas 1000x1000)
    try {
        const q = encodeURIComponent(`${artist} ${cleanT}`);
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10`);
        if (res.ok) {
            const d = await res.json();
            if (d.results && d.results.length > 0) {
                const nonComp = d.results.find(r => r.collectionName && !isCompilation(r.collectionName)) || d.results[0];
                if (nonComp && nonComp.artworkUrl100) {
                    return { coverUrl: nonComp.artworkUrl100.replace('100x100bb', '1000x1000bb'), album: nonComp.collectionName };
                }
            }
        }
    } catch(e) {}

    return null;
}

(async () => {
    console.log("==========================================================");
    console.log("🖼️ AUDITORÍA Y ENRIQUECIMIENTO MASIVO DE CARÁTULAS HD");
    console.log("==========================================================");

    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

    // Obtener todas las playlists
    let playlists = {};
    try {
        const res = await fetch('http://100.95.217.45:8087/api/playlists');
        playlists = await res.json();
    } catch(e) {
        console.error("Error conectando a OMEN, usando metadata local.");
    }

    const allTracks = [];
    const seen = new Set();

    for (const [listName, tracks] of Object.entries(playlists)) {
        for (const t of tracks) {
            const artist = t.artist || '';
            const title = t.title || t.rawTitle || '';
            const key = `${artist} - ${title}`.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                allTracks.push({ artist, title, rawTitle: t.rawTitle || title, list: listName });
            }
        }
    }

    console.log(`📋 Total de canciones analizadas en las listas: ${allTracks.length}`);

    let updated = 0;
    let checked = 0;

    for (let i = 0; i < allTracks.length; i++) {
        const t = allTracks[i];
        const cleanT = cleanTrackTitle(t.title);
        const k1 = `${t.artist} - ${t.title}`.toLowerCase();
        const k2 = `${t.artist} - ${cleanT}`.toLowerCase();
        const kRaw = `${t.artist} - ${t.rawTitle}`.toLowerCase();
        const normKey = `${t.artist}${cleanT}`.toLowerCase().replace(/[^a-z0-9]/g, '');

        let entry = meta[k1] || meta[k2] || meta[kRaw] || meta[normKey];

        let needsCover = false;
        if (!entry || !entry.coverUrl || entry.coverUrl.trim() === '' || entry.coverUrl.includes('undefined')) {
            needsCover = true;
        } else if (entry.coverUrl.includes('mzstatic.com')) {
            // Comprobar si el enlace de Apple Music da 404
            try {
                const headRes = await fetch(entry.coverUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
                if (!headRes.ok) needsCover = true;
            } catch(e) {
                needsCover = true;
            }
        }

        if (needsCover) {
            const preferredAlbum = entry ? entry.album : null;
            const coverData = await fetchBestCover(t.artist, cleanT, preferredAlbum);
            if (coverData && coverData.coverUrl) {
                if (!entry) {
                    entry = {
                        title: cleanT,
                        artist: t.artist,
                        album: coverData.album || 'Álbum',
                        coverUrl: coverData.coverUrl
                    };
                } else {
                    entry.coverUrl = coverData.coverUrl;
                    if (!entry.album || entry.album === 'Álbum' || entry.album === 'Álbum Desconocido') {
                        entry.album = coverData.album;
                    }
                }

                // Guardar en todas las claves posibles
                meta[k1] = entry;
                meta[k2] = entry;
                meta[kRaw] = entry;
                meta[normKey] = entry;

                updated++;
                console.log(`[${updated}] 🎨 Carátula HD asignada: "${t.artist} - ${cleanT}" -> Álbum: ${entry.album}`);
            }
            await new Promise(r => setTimeout(r, 60)); // Pausa suave
        }

        checked++;
        if (checked % 100 === 0) {
            fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
            console.log(`⏳ Progreso: ${checked}/${allTracks.length} canciones revisadas... (${updated} carátulas recuperadas)`);
        }
    }

    fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
    try {
        fs.copyFileSync(META_PATH, OMEN_META_PATH);
    } catch(e){}

    console.log(`\n🎉 PROCESO COMPLETADO: ${updated} carátulas HD recuperadas y guardadas.`);
})();
