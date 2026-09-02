const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_CACHE_PATH = path.join(DATA_DIR, 'metadata_cache.json');
const ANALYSES_DB_PATH = path.join(DATA_DIR, 'analyses_db.json');

let metaCache = {};
try { metaCache = JSON.parse(fs.readFileSync(METADATA_CACHE_PATH, 'utf8')); } catch(e){}

let analysesDb = {};
try { analysesDb = JSON.parse(fs.readFileSync(ANALYSES_DB_PATH, 'utf8')); } catch(e){}

const NON_ORIGINAL_PATTERN = /\b(remix|remaster|remastered|live|acoustic|unplugged|demo|mono|stereo|sped up|slowed|revisited|version \d{4}|dub|radio edit|club edit|extended mix)\b/i;
const COMPILATION_OR_DERIVATIVE = /karaoke|tribute|greatest hits|best of|anniversary|deluxe|edition|remastered|remixes|acoustic|live|the best|gold|platinum|collection|definitive|anthology/i;

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    return rawTitle
        .replace(/\s*-\s*\d{4}\s*Remaster.*/i, '').replace(/\s*-\s*Remastered.*/i, '').replace(/\s*-\s*Remaster\b.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '').replace(/\s*-\s*Remix.*/i, '').replace(/\s*\(.*remix.*\)/i, '')
        .replace(/\s*-\s*Club Mix.*/i, '').replace(/\s*-\s*Extended Mix.*/i, '').replace(/\s*-\s*Radio Mix.*/i, '')
        .replace(/\s*-\s*Mix\b.*/i, '').replace(/\s*-\s*Club Edit.*/i, '').replace(/\s*-\s*Radio Edit.*/i, '')
        .replace(/\s*\(.*radio edit.*\)/i, '').replace(/\s*-\s*Extended\b.*/i, '').replace(/\s*-\s*Mono\b.*/i, '')
        .replace(/\s*-\s*Stereo\b.*/i, '').replace(/\s*-\s*Live\b.*/i, '').replace(/\s*\(Live.*\)/i, '')
        .replace(/\s*-\s*Acoustic.*/i, '').replace(/\s*\(.*acoustic.*\)/i, '').replace(/\s*-\s*Unplugged.*/i, '')
        .replace(/\s*-\s*Demo\b.*/i, '').replace(/\s*-\s*Single Version.*/i, '').replace(/\s*-\s*Album Version.*/i, '')
        .replace(/\s*\(.*deluxe.*\)/i, '').replace(/\s*-\s*Original\b.*/i, '').replace(/\s*-\s*From\s+".*?".*/i, '')
        .replace(/\s*\(.*Sped Up.*\)/i, '').replace(/\s*\(.*Slowed.*\)/i, '').replace(/\s*-\s*Version\s+\d{4}.*/i, '')
        .replace(/\s*\(.*Version\s+\d{4}.*\)/i, '').replace(/\s*\(.*Revisited.*\)/i, '').replace(/\s*\(.*Edit\)/i, '')
        .replace(/\s*\(.*Mixed\)/i, '').replace(/\s*\(feat\.?\s+.*\)$/i, '').replace(/\s*\(featuring\s+.*\)$/i, '')
        .replace(/\s*\(with\s+.*\)$/i, '').replace(/\s*-\s*feat\.?\s+.*$/i, '').replace(/^\s*\.\.\./, '')
        .replace(/^[(\[]+([^)]+)[)\]]\s*/, '$1 ').replace(/\s+/g, ' ').trim();
}

function normalize(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findOriginalStudioTrack(artist, title) {
    const cleanT = cleanTrackTitle(title);
    const primaryArtist = artist.split(/[,&]/)[0].trim();
    const normArt = normalize(primaryArtist);
    const normTitle = normalize(cleanT);

    if (!normTitle || normTitle.length < 2) return null;

    try {
        const query = encodeURIComponent(`${primaryArtist} ${cleanT}`);
        const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=25`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;

        // 1. Filtrar coincidencias estrictas de artista
        const matchingArtist = data.results.filter(r => {
            const rArt = normalize(r.artistName || '');
            return rArt.includes(normArt) || normArt.includes(rArt);
        });

        const pool = matchingArtist.length > 0 ? matchingArtist : data.results;

        // 2. Filtrar ESTRICTAMENTE que el título coincida con la canción buscada
        const matchingTitle = pool.filter(r => {
            const rClean = cleanTrackTitle(r.trackName || '');
            const rNorm = normalize(rClean);
            return rNorm === normTitle || (rNorm.length > 4 && (rNorm.includes(normTitle) || normTitle.includes(rNorm)));
        });

        if (matchingTitle.length === 0) return null;

        // 3. Filtrar tracks que NO tengan "remix", "acoustic", "live", etc. en el título
        const cleanTracks = matchingTitle.filter(r => {
            return !NON_ORIGINAL_PATTERN.test(r.trackName || '');
        });

        const candidatePool = cleanTracks.length > 0 ? cleanTracks : matchingTitle;

        // 4. Ordenar candidatos: primero álbumes de estudio (no compilaciones/deluxe), luego fecha más antigua
        candidatePool.sort((a, b) => {
            const aComp = COMPILATION_OR_DERIVATIVE.test(a.collectionName || '');
            const bComp = COMPILATION_OR_DERIVATIVE.test(b.collectionName || '');
            if (aComp !== bComp) return aComp ? 1 : -1;

            const aDate = a.releaseDate || '9999';
            const bDate = b.releaseDate || '9999';
            return aDate.localeCompare(bDate);
        });

        const best = candidatePool[0];
        if (best) {
            const releaseDate = best.releaseDate ? best.releaseDate.split('T')[0] : '2000-01-01';
            const releaseYear = releaseDate.split('-')[0];
            const coverHd = (best.artworkUrl100 || '').replace('100x100bb', '1000x1000bb');
            const durMs = best.trackTimeMillis || 210000;
            const m = Math.floor(durMs / 60000);
            const s = Math.floor((durMs % 60000) / 1000);
            const durFmt = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

            return {
                title: cleanTrackTitle(best.trackName || cleanT),
                displayTitle: cleanTrackTitle(best.trackName || cleanT),
                album: best.collectionName || 'Álbum Desconocido',
                coverUrl: coverHd || null,
                releaseDate: releaseDate,
                releaseYear: releaseYear,
                durationMs: durMs,
                durationFmt: durFmt
            };
        }
    } catch(e) {}
    return null;
}

async function main() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Auditoría & Sustitución Estricta de Versiones a Estudio");
    console.log("═══════════════════════════════════════════════════════════════\n");

    let updated = 0;
    const entries = Object.entries(metaCache);
    console.log(`Total entradas en metadata_cache: ${entries.length}\n`);

    for (let i = 0; i < entries.length; i++) {
        const [key, meta] = entries[i];
        if (!meta) continue;

        const rawTitle = meta.displayTitle || meta.title || key.split(' - ')[1] || '';
        const rawAlbum = meta.album || '';
        const isProblematic = NON_ORIGINAL_PATTERN.test(rawTitle) || 
                              NON_ORIGINAL_PATTERN.test(rawAlbum) || 
                              /remix|remaster|acoustic|live|revisited/i.test(key);

        if (isProblematic) {
            const parts = key.split(' - ');
            const artist = meta.artist || parts[0];
            const cleanT = cleanTrackTitle(rawTitle);

            const orig = await findOriginalStudioTrack(artist, cleanT);
            if (orig) {
                console.log(`✨ [${artist} - ${cleanT}]:`);
                console.log(`   Antes: "${rawTitle}" (${rawAlbum}, ${meta.releaseYear || 's/f'})`);
                console.log(`   Ahora: "${orig.displayTitle}" (${orig.album}, ${orig.releaseYear})`);

                metaCache[key] = {
                    ...meta,
                    title: orig.title,
                    displayTitle: orig.displayTitle,
                    album: orig.album,
                    coverUrl: orig.coverUrl || meta.coverUrl,
                    releaseDate: orig.releaseDate,
                    releaseYear: orig.releaseYear,
                    durationMs: orig.durationMs,
                    durationFmt: orig.durationFmt,
                    source: "iTunes / Apple Music Original Studio Master"
                };

                const keyClean = `${artist} - ${cleanT}`.toLowerCase();
                metaCache[keyClean] = metaCache[key];

                if (analysesDb[key]) analysesDb[key].year = orig.releaseYear;
                if (analysesDb[keyClean]) analysesDb[keyClean].year = orig.releaseYear;

                updated++;
                if (updated % 20 === 0) {
                    fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metaCache, null, 2), 'utf8');
                    fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(analysesDb, null, 2), 'utf8');
                }
            } else {
                metaCache[key].displayTitle = cleanT;
            }

            await sleep(80);
        }
    }

    fs.writeFileSync(METADATA_CACHE_PATH, JSON.stringify(metaCache, null, 2), 'utf8');
    fs.writeFileSync(ANALYSES_DB_PATH, JSON.stringify(analysesDb, null, 2), 'utf8');
    console.log(`\n🎉 Auditoría completada con éxito: ${updated} canciones actualizadas a versión y portada original de estudio.`);
}

main().catch(console.error);
