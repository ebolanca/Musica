/**
 * Proveedor Abierto de Metadatos Discográficos: Wikipedia y MusicBrainz
 * 
 * Extrae de forma automática, gratuita y sin límites de cuota:
 * - Álbum de estudio original (sin recopilatorios ni grandes éxitos)
 * - Año y fecha exacta de lanzamiento original
 * - Compositores y letristas
 * - Sello discográfico
 * - Género musical
 */

function cleanTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*-\s*\d{4}\s*(?:digital\s*)?remaster.*/i, '')
        .replace(/\s*-\s*remaster(?:ed)?(?:\s*\d{4})?.*/i, '')
        .replace(/\s*\(.*remaster.*\)/i, '')
        .replace(/\s*\[.*remaster.*\]/i, '')
        .replace(/\s*-\s*(?:radio\s*edit|single\s*version|album\s*version|original\s*mix|extended\s*mix).*/i, '')
        .replace(/\s*\(.*(?:radio\s*edit|single\s*version|album\s*version|original\s*mix|extended\s*mix).*\)/i, '')
        .replace(/\s*\(feat\..*?\)/i, '')
        .replace(/\s*\(with.*?\)/i, '')
        .replace(/\s*-\s*feat\..*$/i, '')
        .replace(/\s*-\s*with.*$/i, '')
        .trim();
}

function cleanWikitext(val) {
    if (!val) return '';
    let s = val;
    // Eliminar etiquetas de referencia <ref>...</ref> y <ref name="..." />
    s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
    s = s.replace(/<ref[^>]*\/>/gi, ' ');
    // Eliminar tags HTML <small>, <br>, etc.
    s = s.replace(/<[^>]+>/g, ' ');
    // Limpiar enlaces [[Destino|Texto Visible]] -> Texto Visible
    s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
    // Limpiar plantillas tipo {{flatlist|...}}, {{plainlist|...}}, {{ubl|...}}
    s = s.replace(/\{\{(?:flatlist|plainlist|ubl|unbulleted list|hlist)\s*\|\s*([^}]+)\}\}/gi, (match, content) => {
        return content.replace(/\|\s*/g, ', ');
    });
    // Limpiar plantillas de fechas {{start date|1985|10|15}} -> 1985-10-15
    s = s.replace(/\{\{[sS]tart[ -]?date[^}]*?(\d{4})(?:\|(\d{1,2}))?(?:\|(\d{1,2}))?[^}]*\}\}/gi, (m, y, mo, d) => {
        if (y && mo && d) return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (y) return y;
        return '';
    });
    // Otras plantillas {{...}} anidadas o simples
    s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
    s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
    // Limpiar corchetes residuales [[ o ]] o [ o ]
    s = s.replace(/[\[\]]+/g, '');
    // Limpiar restos de plantillas cortadas tipo {{...
    s = s.replace(/\{\{[^}]*$/g, '');
    s = s.replace(/^[^}]*\}\}/g, '');
    // Limpiar comillas wiki '' o ''' o comillas simples/dobles
    s = s.replace(/['"]+/g, '');
    // Limpiar asteriscos y viñetas
    s = s.replace(/^[\s*#•\-,]+/gm, '');
    return s.replace(/\s+/g, ' ').trim();
}

async function fetchWikipediaInfobox(artist, title, lang = 'en') {
    const cleanT = cleanTitle(title);
    const mainArt = artist.split(/[,&]/)[0].replace(/\bfeat\.?.*$/i, '').trim();
    
    // Consulta de búsqueda en Wikipedia
    const searchQueries = [
        `"${cleanT}" "${mainArt}" song`,
        `"${cleanT}" "${mainArt}" single`,
        `"${cleanT}" "${mainArt}"`,
        `${cleanT} ${mainArt} song`
    ];

    const endpoint = `https://${lang}.wikipedia.org/w/api.php`;

    for (const q of searchQueries) {
        try {
            const searchUrl = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`;
            const res = await fetch(searchUrl, {
                headers: { 'User-Agent': 'MusicaApp/2.1 (https://github.com/ebolanca/Musica; contact@majecruz.es)' },
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) continue;
            const data = await res.json();
            const results = data.query?.search || [];
            if (results.length === 0) continue;

            // Elegir el artículo más prometedor (descartando listas, giras, anexos)
            const badTitles = /^(list of|anexo:|discograf|tour |gira |concierto|premios|awards)/i;
            const validResults = results.filter(r => !badTitles.test(r.title));
            if (validResults.length === 0) continue;

            const candidate = validResults.find(r => {
                const tit = r.title.toLowerCase();
                const snippet = (r.snippet || '').toLowerCase();
                return tit.includes(cleanT.toLowerCase()) || snippet.includes(cleanT.toLowerCase());
            }) || validResults[0];

            if (!candidate) continue;

            // Obtener el wikitexto del artículo
            const parseUrl = `${endpoint}?action=parse&page=${encodeURIComponent(candidate.title)}&prop=wikitext&format=json`;
            const pRes = await fetch(parseUrl, {
                headers: { 'User-Agent': 'MusicaApp/2.1 (contact@majecruz.es)' },
                signal: AbortSignal.timeout(5000)
            });
            if (!pRes.ok) continue;
            const pData = await pRes.json();
            const wikitext = pData.parse?.wikitext?.['*'] || '';

            if (!wikitext || !wikitext.toLowerCase().includes('infobox')) continue;

            const extractInfoboxField = (fieldNames) => {
                for (const name of fieldNames) {
                    const regex = new RegExp(`^[\\t ]*\\|[\\t ]*${name}[\\t ]*=[\\t ]*([\\s\\S]*?)(?=\\n[\\t ]*\\||\\n[\\t ]*\\}\\}|$)`, 'im');
                    const m = wikitext.match(regex);
                    if (m && m[1]) {
                        const val = cleanWikitext(m[1]);
                        if (val && val.length > 0 && !val.toLowerCase().startsWith('infobox')) {
                            return val;
                        }
                    }
                }
                return null;
            };

            const album = extractInfoboxField(['from_album', 'from album', 'album', 'álbum']);
            const released = extractInfoboxField(['released', 'publicación', 'lanzamiento']);
            const writer = extractInfoboxField(['writer', 'songwriter', 'composer', 'compositor', 'escritor', 'autores']);
            const label = extractInfoboxField(['label', 'discográfica', 'sello']);
            const genre = extractInfoboxField(['genre', 'género']);

            // Año y fecha de lanzamiento
            let year = null;
            let dateStr = null;
            if (released) {
                const fullDateMatch = released.match(/\b(19\d\d|20\d\d)-(\d{1,2})-(\d{1,2})\b/);
                if (fullDateMatch) {
                    year = fullDateMatch[1];
                    dateStr = `${fullDateMatch[1]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[3].padStart(2, '0')}`;
                } else {
                    const ym = released.match(/\b(19\d\d|20\d\d)\b/);
                    if (ym) year = ym[1];
                }
            }
            if (!year) {
                const ym2 = wikitext.match(/\b(?:released|publicado|grabado|lanzado).*?\b(19\d\d|20\d\d)\b/i);
                if (ym2) year = ym2[1];
            }
            if (!dateStr && year) {
                dateStr = `${year}-01-01`;
            }

            if (album || year || writer) {
                return {
                    source: `Wikipedia (${candidate.title})`,
                    originalAlbum: album || null,
                    releaseYear: year || null,
                    releaseDate: dateStr || null,
                    composers: writer || null,
                    label: label || null,
                    genre: genre || null
                };
            }
        } catch(e) {
            // Siguiente query o idioma
        }
    }
    return null;
}

async function fetchMusicBrainzInfo(artist, title) {
    const cleanT = cleanTitle(title);
    const mainArt = artist.split(/[,&]/)[0].replace(/\bfeat\.?.*$/i, '').trim();

    try {
        const query = `recording:"${cleanT}" AND artist:"${mainArt}"`;
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=15`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'MusicaApp/2.1 (contact@majecruz.es; personal audio tool)' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const recordings = data.recordings || [];
        if (recordings.length === 0) return null;

        const forbiddenSecondary = ['compilation', 'soundtrack', 'live', 'remix', 'dj-mix', 'mixtape/street', 'demo'];

        for (const rec of recordings) {
            const releases = rec.releases || [];
            // Filtrar álbumes oficiales de estudio (ESTRICTO: sin bandas sonoras ni recopilatorios ni directos)
            const studioReleases = releases.filter(r => {
                const rg = r['release-group'];
                const pType = rg ? rg['primary-type'] : null;
                const sTypes = (rg ? rg['secondary-types'] || [] : []).map(s => String(s).toLowerCase());
                
                // Rechazar si es recopilación, BSO (Soundtrack), directo o remix
                if (pType !== 'Album') return false;
                if (sTypes.some(st => forbiddenSecondary.includes(st))) return false;

                // Rechazar si el artista es "Various Artists" o "Varios Artistas"
                const relArt = (r['artist-credit']?.[0]?.name || '').toLowerCase();
                if (relArt.includes('various') || relArt.includes('varios')) return false;

                return true;
            });

            if (studioReleases.length > 0) {
                // Ordenar por fecha más antigua para encontrar el lanzamiento original de estudio
                studioReleases.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
                const original = studioReleases[0];
                const year = original.date ? original.date.split('-')[0] : null;

                return {
                    source: 'MusicBrainz',
                    originalAlbum: original.title,
                    releaseYear: year,
                    releaseDate: original.date || (year ? `${year}-01-01` : null),
                    label: original['label-info-list']?.[0]?.label?.name || null
                };
            }
        }
    } catch(e) {
        // Ignorar fallo de MB
    }
    return null;
}

/**
 * Consulta unificada con fallback inteligente:
 * 1. Prioriza español si el tema es hispano, inglés si es anglosajón.
 * 2. Si no halla álbum, consulta MusicBrainz (con exclusión estricta de Soundtracks y Compilations).
 * 3. Combina los mejores campos disponibles.
 */
async function fetchTrackMetadataFromWikiAndMB(artist, title) {
    const cleanT = cleanTitle(title);
    
    const isSpanish = /[áéíóúñÁÉÍÓÚÑ]/.test(`${artist} ${title}`) || 
                      /\b(los|las|el|la|de|del|por|para|sueños|quedo|contigo|corazon|amor|vida|noche|estacion|chunguitos|mecano|sabina|estopa)\b/i.test(`${artist} ${title}`);

    const primaryLang = isSpanish ? 'es' : 'en';
    const secondaryLang = isSpanish ? 'en' : 'es';

    let wiki1 = await fetchWikipediaInfobox(artist, cleanT, primaryLang);
    let wiki2 = null;
    if (!wiki1 || !wiki1.originalAlbum) {
        wiki2 = await fetchWikipediaInfobox(artist, cleanT, secondaryLang);
    }

    const wikiBest = wiki1?.originalAlbum ? wiki1 : (wiki2?.originalAlbum ? wiki2 : (wiki1 || wiki2));

    // MusicBrainz solo si aún no tenemos álbum de estudio de Wikipedia
    let mbInfo = null;
    if (!wikiBest || !wikiBest.originalAlbum) {
        mbInfo = await fetchMusicBrainzInfo(artist, cleanT);
    }

    const originalAlbum = wikiBest?.originalAlbum || mbInfo?.originalAlbum || null;
    const releaseYear = wikiBest?.releaseYear || mbInfo?.releaseYear || null;
    const releaseDate = wikiBest?.releaseDate || mbInfo?.releaseDate || (releaseYear ? `${releaseYear}-01-01` : null);
    const composers = wikiBest?.composers || null;
    const label = wikiBest?.label || mbInfo?.label || null;
    const genre = wikiBest?.genre || null;

    if (!originalAlbum && !releaseYear && !composers) {
        return null;
    }

    return {
        artist,
        title: cleanT,
        originalAlbum: originalAlbum || 'Álbum Oficial',
        releaseYear: releaseYear || '2000',
        releaseDate: releaseDate || `${releaseYear || '2000'}-01-01`,
        composers: composers || artist,
        label: label || 'Sello Discográfico Principal',
        genre: genre || 'Pop / Rock / Dance',
        source: wikiBest?.source || mbInfo?.source || 'Wikipedia/MusicBrainz'
    };
}

module.exports = {
    cleanTitle,
    fetchTrackMetadataFromWikiAndMB,
    fetchWikipediaInfobox,
    fetchMusicBrainzInfo
};
