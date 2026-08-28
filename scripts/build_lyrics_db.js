const fs = require('fs');
const path = require('path');

const LYRICS_DB_PATH = path.join(__dirname, '../data/lyrics_db.json');
const LYRICS_CACHE_FILE = path.join(__dirname, '../data/lyrics_cache.json');
const LOCAL_OMEN_CACHE = "D:\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const REMOTE_OMEN_CACHE = "\\\\100.95.217.45\\omen D\\Docker\\media-server\\spotdl-sync\\cache\\tracks_cache.json";
const OMEN_CACHE_PATH = fs.existsSync(LOCAL_OMEN_CACHE) ? LOCAL_OMEN_CACHE : REMOTE_OMEN_CACHE;

const LOCAL_OMEN_VIDEOS = "D:\\media-library\\music-videos";
const REMOTE_OMEN_VIDEOS = "\\\\100.95.217.45\\omen D\\media-library\\music-videos";
const OMEN_VIDEOS_DIR = fs.existsSync(LOCAL_OMEN_VIDEOS) ? LOCAL_OMEN_VIDEOS : REMOTE_OMEN_VIDEOS;

let lyricsDb = {};
if (fs.existsSync(LYRICS_DB_PATH)) {
    try { lyricsDb = JSON.parse(fs.readFileSync(LYRICS_DB_PATH, 'utf8')); } catch(e){}
}

let transCache = {};
if (fs.existsSync(LYRICS_CACHE_FILE)) {
    try { transCache = JSON.parse(fs.readFileSync(LYRICS_CACHE_FILE, 'utf8')); } catch(e){}
}

function cleanTrackTitle(rawTitle) {
    if (!rawTitle) return '';
    let clean = rawTitle
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

function parseLrc(content) {
    if (!content) return [];
    const lines = content.split('\n');
    const result = [];
    const lrcRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
    for (let line of lines) {
        const match = line.match(lrcRegex);
        if (match) {
            const m = match[1];
            const s = match[2];
            const text = match[4].trim();
            if (text) {
                result.push({ time: `${m}:${s}`, text: text });
            }
        }
    }
    return result;
}

function parseLyricsFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const result = [];

    const lrcRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\](.*)/;
    const srtRegex = /(\d{2}):(\d{2}):(\d{2})[,.]\d{3}\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.]\d{3}/;

    let currentTime = null;
    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        const srtMatch = line.match(srtRegex);
        if (srtMatch) {
            const m = srtMatch[2];
            const s = srtMatch[3];
            currentTime = `${m}:${s}`;
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

    return result.length > 0 ? result : null;
}

async function translateLinesParallel(lines) {
    if (!lines || lines.length === 0) return lines;

    const fullSample = lines.slice(0, 15).map(l => l.text).join(' ').toLowerCase();
    const spanishWords = fullSample.match(/\b(que|para|estoy|corazón|noche|nada|amor|vida|todo|cuando|tiempo|quiero|tengo|hacer|siento|solo)\b/gi) || [];
    if (spanishWords.length >= 4) {
        return lines;
    }

    const untranslated = Array.from(new Set(
        lines.map(l => (l.text || '').trim()).filter(t => t.length > 1 && !transCache[t])
    ));

    if (untranslated.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < untranslated.length; i += batchSize) {
            const chunk = untranslated.slice(i, i + batchSize);
            await Promise.allSettled(chunk.map(async (txt) => {
                try {
                    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(txt)}&langpair=en|es`;
                    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
                    if (res.ok) {
                        const data = await res.json();
                        const trans = data.responseData?.translatedText;
                        if (trans && !trans.startsWith("MYMEMORY WARNING")) {
                            transCache[txt] = trans;
                        }
                    }
                } catch(e) {}
            }));
        }
    }

    return lines.map(item => {
        const txt = (item.text || '').trim();
        return {
            time: item.time || '',
            text: item.text,
            translation: transCache[txt] || ''
        };
    });
}

async function fetchLyricsForTrack(artist, title) {
    const cleanT = cleanTrackTitle(title);
    
    // 1. Try local video subtitle files
    if (fs.existsSync(OMEN_VIDEOS_DIR)) {
        try {
            const cleanKey = `${artist} - ${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            const files = fs.readdirSync(OMEN_VIDEOS_DIR);
            for (const f of files) {
                const fClean = f.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (fClean.includes(cleanKey) && (f.endsWith('.srt') || f.endsWith('.lrc'))) {
                    const parsed = parseLyricsFile(path.join(OMEN_VIDEOS_DIR, f));
                    if (parsed && parsed.length > 0) return parsed;
                }
            }
        } catch(e) {}
    }

    // 2. Try LRCLIB API
    try {
        const lrcurl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(cleanT)}`;
        const lrcres = await fetch(lrcurl, { signal: AbortSignal.timeout(3000) });
        if (lrcres.ok) {
            const lrcdata = await lrcres.json();
            if (lrcdata.syncedLyrics) return parseLrc(lrcdata.syncedLyrics);
            if (lrcdata.plainLyrics) return lrcdata.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
        }

        const searchurl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + cleanT)}`;
        const sres = await fetch(searchurl, { signal: AbortSignal.timeout(3000) });
        if (sres.ok) {
            const sdata = await sres.json();
            if (sdata && sdata.length > 0) {
                const item = sdata[0];
                if (item.syncedLyrics) return parseLrc(item.syncedLyrics);
                if (item.plainLyrics) return item.plainLyrics.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));
            }
        }
    } catch(e) {}

    return null;
}

async function buildLyricsDb(limit = 9999) {
    console.log(`Iniciando pre-compilación de letras bilingües pre-guardadas en lyrics_db.json...`);
    let playlistsData = {};
    if (fs.existsSync(OMEN_CACHE_PATH)) {
        playlistsData = JSON.parse(fs.readFileSync(OMEN_CACHE_PATH, 'utf8'));
    }

    let processed = 0;
    for (const [listName, tracks] of Object.entries(playlistsData)) {
        console.log(`\n📂 Playlist: [${listName}] (${tracks.length} temas)...`);
        for (const item of tracks) {
            if (processed >= limit) break;

            const artist = Array.isArray(item) ? item[0] : item.artist;
            const rawTitle = Array.isArray(item) ? item[1] : item.title;
            const cleanT = cleanTrackTitle(rawTitle);

            const key1 = `${artist} - ${rawTitle}`;
            const key2 = `${artist} - ${cleanT}`;

            if (lyricsDb[key1] || lyricsDb[key2]) {
                continue;
            }

            const rawLyrics = await fetchLyricsForTrack(artist, rawTitle);
            if (rawLyrics && rawLyrics.length > 0) {
                const bilingualLyrics = await translateLinesParallel(rawLyrics);
                lyricsDb[key1] = bilingualLyrics;
                lyricsDb[key2] = bilingualLyrics;
                lyricsDb[cleanT] = bilingualLyrics;
                processed++;

                if (processed % 20 === 0) {
                    console.log(`💾 Guardando lyrics_db.json: ${processed} canciones con letra bilingüe guardadas...`);
                    fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(lyricsDb, null, 2), 'utf8');
                    fs.writeFileSync(LYRICS_CACHE_FILE, JSON.stringify(transCache, null, 2), 'utf8');
                }
                await new Promise(r => setTimeout(r, 60));
            }
        }
        if (processed >= limit) break;
    }

    fs.writeFileSync(LYRICS_DB_PATH, JSON.stringify(lyricsDb, null, 2), 'utf8');
    fs.writeFileSync(LYRICS_CACHE_FILE, JSON.stringify(transCache, null, 2), 'utf8');
    console.log(`\n🎉 ¡Completado! Total letras en lyrics_db.json: ${Object.keys(lyricsDb).length}`);
}

const limit = parseInt(process.argv[2], 10) || 9999;
buildLyricsDb(limit);
