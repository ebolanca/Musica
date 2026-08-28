const testSongs = [
  ['Edwyn Collins', 'A Girl Like You'],
  ['Billy Ray Cyrus', 'Achy Breaky Heart'],
  ['Marvin Gaye', 'Ain\'t No Mountain High Enough'],
  ['Lutricia McNeal', 'Ain\'t That Just the Way'],
  ['Smash Mouth', 'All Star']
];

async function getMusicBrainzYear(artist, title) {
    try {
        const url = `https://musicbrainz.org/ws/2/recording/?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"&fmt=json`;
        const res = await fetch(url, { headers: { 'User-Agent': 'MusicaApp/1.0.0 (contact@example.com)' } });
        const data = await res.json();
        let years = [];
        if (data.recordings) {
            for (const rec of data.recordings) {
                if (rec['first-release-date']) {
                    const y = parseInt(rec['first-release-date'].substring(0, 4), 10);
                    if (y >= 1950 && y <= 2026) years.push(y);
                }
                if (rec.releases) {
                    for (const rel of rec.releases) {
                        if (rel.date) {
                            const y = parseInt(rel.date.substring(0, 4), 10);
                            if (y >= 1950 && y <= 2026) years.push(y);
                        }
                    }
                }
            }
        }
        if (years.length > 0) return Math.min(...years).toString();
    } catch(e) {
        console.error(e.message);
    }
    return null;
}

async function run() {
    for (const [artist, title] of testSongs) {
        const year = await getMusicBrainzYear(artist, title);
        console.log(`${artist} - ${title} ===> Año MusicBrainz: ${year}`);
        await new Promise(r => setTimeout(r, 1100)); // Rate limit MusicBrainz
    }
}

run();
