const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'analyses_db.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Africa (Toto) bien estructurado
db['Africa'] = {
  "title": "Africa",
  "artist": "Toto",
  "year": "1982",
  "album": "Toto IV",
  "synopsis": "¡Nos plantamos ante el Santo Grial de los músicos de sesión de Los Ángeles! Publicada en 1982 en el multipremiado álbum 'Toto IV', 'Africa' es una obra cumbre del pop-rock que estuvo a punto de ser descartada por la propia banda. Una arquitectura sónica monumental construida sobre polirritmias de ensueño, sintetizadores de vanguardia y armonías vocales estratosféricas.",
  "sections": [
    {
      "title": "El Origen & Trayectoria: El rechazo inicial de Steve Lukather",
      "icon": "fa-book-open",
      "text": "David Paich compuso la base y la letra encerrado en su estudio tras experimentar con un nuevo teclado, inspirado por los relatos de misioneros católicos. Irónicamente, el guitarrista Steve Lukather odiaba el tema al principio y amenazó con 'correr desnudo por Hollywood' si la canción tenía éxito.",
      "points": [
        {
          "name": "La intuición de David Hungate",
          "desc": "El bajista y el resto del grupo insistieron en incluirla en el último minuto antes de cerrar el álbum 'Toto IV', convirtiéndose en su mayor himno global."
        },
        {
          "name": "Mercenarios de sesión al servicio del pop",
          "desc": "Los miembros de Toto eran los instrumentistas de élite que habían grabado 'Thriller' y 'Beat It' para Michael Jackson, aplicando su maestría de microfonía y arreglos."
        }
      ]
    },
    {
      "title": "La Anatomía Musical: Bucle Analógico, Yamaha CS-80 & Coros Triplicados",
      "icon": "fa-drum",
      "text": "La producción es un reloj suizo de precisión acústica y analógica:",
      "points": [
        {
          "name": "El bucle de percusión de Jeff Porcaro (El Latido)",
          "desc": "Porcaro y Lenny Castro grabaron congas, timbales, maracas y cencerros durante horas; luego cortaron físicamente la cinta de magnetófono con cuchilla para crear un loop analógico de dos compases hipnótico."
        },
        {
          "name": "Los vientos del Yamaha CS-80",
          "desc": "David Paich utilizó el sintetizador polifónico más avanzado de la época para crear ese colchón etéreo y melancólico que evoca los vientos de la sabana."
        },
        {
          "name": "El bajo andante sincopado",
          "desc": "David Hungate clava notas sincopadas a contratiempo en el bombo de Porcaro, dotando a la balada de un caminar ágil y elegante."
        },
        {
          "name": "Arquitectura vocal a tres voces",
          "desc": "La voz grave y cercana de David Paich en la estrofa contrasta con el estallido tenor de Bobby Kimball en el coro, arropado por capas de coros triplicadas por Steve Lukather."
        }
      ]
    },
    {
      "title": "La Lírica y el Mensaje: El Dilema Geográfico y la Mitología Pop",
      "icon": "fa-quote-left",
      "text": "La letra no describe la realidad política de África, sino la fantasía cinematográfica y el conflicto interno de un hombre que debe elegir entre su carrera urbana y un amor salvaje y lejano.",
      "points": [
        {
          "name": "La estampa visual nocturna",
          "desc": "'I hear the drums echoing tonight / She hears only whispers of some quiet conversation': la distancia física y emocional se retrata desde los primeros versos."
        },
        {
          "name": "La bendición de las lluvias",
          "desc": "'I bless the rains down in Africa' se convirtió en una de las frases más coreadas de la historia del pop, simbolizando la redención y la entrega pasional."
        }
      ]
    },
    {
      "title": "El Impacto Cultural & Inmortalidad",
      "icon": "fa-trophy",
      "text": "Número 1 en el Billboard Hot 100 en 1983 y ganadora de múltiples premios Grammy, 'Africa' ha experimentado un renacimiento apoteósico en el siglo XXI gracias a la cultura digital y versiones de bandas como Weezer.",
      "points": [
        {
          "name": "Patrimonio de la cultura digital",
          "desc": "Es una de las canciones de los años 80 más reproducidas en la historia de Spotify con miles de millones de streams."
        }
      ]
    }
  ]
};

db['Toto - Africa'] = db['Africa'];
db['toto - Africa'] = db['Africa'];
db['TOTO - Africa'] = db['Africa'];

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log('✅ Africa formateada con estructura visual perfecta.');
