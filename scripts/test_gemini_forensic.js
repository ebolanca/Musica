const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
const geminiKey = keyMatch ? keyMatch[1].trim() : '';

const artist = 'Whitney Houston';
const cleanT = 'I Will Always Love You';
const album = 'The Bodyguard';
const year = '1992';

const prompt = `Instrucciones para análisis técnico y forense de canciones:
Actúa como un productor musical e ingeniero de sonido experto. Realiza un análisis exhaustivo y técnico en profundidad de la canción "${cleanT}" de ${artist} (álbum: ${album}, año: ${year}).
Prohibido hacer resúmenes superficiales, omitir bloques o rebajar el nivel de detalle. Tono directo, analítico, profesional y técnico. Cero relleno, entra directamente a la materia en la primera línea.

Protocolo de verificación y cero alucinaciones (Estricto):
- Prohibido inventar datos técnicos: Si no hay registros documentados sobre estudio exacto, modelos de micrófonos o consolas, haz un análisis acústico deductivo indicando con claridad que es una deducción basada en la escucha.
- Honestidad sobre repercusión: Si el tema es independiente o de nicho, dilo abiertamente en lugar de fabricar un impacto ficticio.
- Veracidad de la letra: Cita textualmente fragmentos reales en su idioma original con lecciones de vocabulario o dobles sentidos.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta de 4 apartados:
{
  "title": "${cleanT}",
  "artist": "${artist}",
  "year": "${year}",
  "album": "${album}",
  "synopsis": "Sinopsis técnica de entrada directa (3-5 líneas) resumiendo la tesis sónica y la trascendencia de la obra...",
  "sections": [
    {
      "title": "1. Anatomía Musical y Producción de Estudio",
      "icon": "fa-sliders",
      "text": "Análisis exhaustivo de instrumentos clave, capas de pistas, arreglos, frecuencias (subgraves, medios, agudos), técnicas de grabación, procesadores, compresión, reverberación, saturación y labor del productor David Foster e ingenieros..."
    },
    {
      "title": "2. Análisis Lírico y Desglose Verso a Verso",
      "icon": "fa-align-left",
      "text": "Temática central, trasfondo psicológico. Selección de estrofas clave (apertura a capella, estribillo, puente/coda) citadas textualmente en su idioma original con lecciones de vocabulario, dobles sentidos y autopsia verso a verso..."
    },
    {
      "title": "3. Narrativa Visual y Videoclip",
      "icon": "fa-film",
      "text": "Dirección, fotografía, concepto artístico y simbolismo del vídeo oficial..."
    },
    {
      "title": "4. Impacto Cultural y Curiosidades",
      "icon": "fa-award",
      "text": "Rendimiento comercial, listas, sincronizaciones, anécdotas documentadas..."
    }
  ]
}`;

(async () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + geminiKey;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
        })
    });
    console.log('Status Gemini:', response.status);
    if (response.ok) {
        const data = await response.json();
        const json = JSON.parse(data.candidates[0].content.parts[0].text);
        console.log('\n✅ SINOPSIS:\n', json.synopsis);
        console.log('\n✅ SECCIONES GENERADAS:');
        json.sections.forEach(s => {
            console.log(`\n--- ${s.title} --- (${s.text.length} caracteres)`);
            console.log(s.text.substring(0, 300) + '...');
        });
    } else {
        const err = await response.text();
        console.error('Error Gemini:', err);
    }
})();
