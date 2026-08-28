const fs = require('fs');
const path = require('path');

const db = {
  "Michael Jackson - Beat It": {
    "title": "Beat It",
    "artist": "Michael Jackson",
    "year": 1982,
    "album": "Thriller",
    "label": "Epic Records",
    "composers": ["Michael Jackson"],
    "producers": ["Quincy Jones", "Michael Jackson"],
    "synopsis": "Nos plantamos de nuevo en el año 1982 dentro del huracán de Thriller para abrir en canal \"Beat It\", la canción con la que Michael Jackson demolió los muros segregacionistas de las radios americanas y fusionó el pop bailable con el hard rock más callejero.",
    "origin_story": "Esta canción nació de un encargo directo y una frustración. El productor Quincy Jones le dijo a Michael: \"Necesitamos una canción de rock con un ritmo negro en este disco, algo al estilo de 'My Sharona' de The Knack, un tema gamberro que escuchen los chavales blancos en sus coches\". Michael, que nunca había escrito rock duro en su vida, se encerró en su estudio y compuso un tema con un riff tan pesado y una letra tan cruda sobre la violencia de las pandillas que dejó a Quincy con la boca abierta.\n\nDetrás de su icónico golpe de batería y su ritmo tenso, se esconde una arquitectura instrumental donde tocó el mismísimo Eddie Van Halen de incógnito, una letra que es una bofetada al falso machismo de las calles y un videoclip que cambió la historia de la telerrealidad musical.\n\nPasamos este clásico imperecedero por nuestro microscopio de cuatro puntos.",
    "section1_title": "1. La Anatomía Musical: El Synclavier, la guitarra de Lukather y el milagro de Van Halen",
    "section1_text": "Bajo la ingeniería de Bruce Swedien y la producción de Quincy Jones, \"Beat It\" es una obra maestra de la hibridación sónica. Consiguieron que las guitarras distorsionadas sonaran tan limpias y rítmicas que se podían bailar en una discoteca de música funk:",
    "section1_points": [
      {
        "name": "La intro del Synclavier (El aviso de la sirena)",
        "desc": "La canción arranca con unos golpes digitales terroríficos y metálicos que suenan a película de terror de ciencia ficción. Ese sonido se generó con un Synclavier, uno de los primeros sintetizadores y muestreadores digitales de la historia, que costaba una fortuna. Esos acordes de sintetizador funcionan como una alarma de toque de queda antes de que entre la banda."
      },
      {
        "name": "El Riff de Steve Lukather (El motor de acero)",
        "desc": "Mucha gente piensa que el riff principal lo tocó Eddie Van Halen, pero la realidad es que lo grabó Steve Lukather (el guitarrista de Toto) junto a Jeff Porcaro en la batería. Lukather utilizó una guitarra distorsionada pero muy seca y comprimida para hacer esa línea machacona (\"tan-tan-tán, tan-tan-tán\"). Lo genial es que el bajo (tocado también por Lukather) va calcando milimétricamente el ritmo de la guitarra, creando un muro de hormigón sónico."
      },
      {
        "name": "El solo histórico de Eddie Van Halen (La explosión de genio)",
        "desc": "Quincy Jones llamó a Eddie Van Halen para que metiera un solo de guitarra. Eddie aceptó, fue al estudio gratis (a cambio de una caja de cervezas) y grabó su solo en dos tomas. Utilizó su mítica guitarra Frankenstrat y revolucionó el tema metiendo técnicas de tapping, armónicos artificiales y un uso salvaje de la palanca de trémolo. El solo es tan rápido y tiene tanta ganancia que, durante la mezcla, el sonido del amplificador hizo que un altavoz del estudio se prendiera fuego literalmente, obligando a los ingenieros a gritar: \"¡Esto es historia pura!\"."
      },
      {
        "name": "El crujido de la puerta de los Jackson 5",
        "desc": "Hay un detalle analógico maravilloso justo antes de que empiece el solo de Eddie Van Halen. Se escucha un golpe seco (\"¡clac!\"). Durante años se pensó que era un error de edición, pero en realidad fue alguien que llamó a la puerta del estudio sin saber que estaban grabando. A Michael y a Quincy les pareció que ese golpe sonaba callejero, como si alguien entrara por la fuerza a la habitación, y decidieron dejarlo en la mezcla final."
      }
    ],
    "section2_title": "2. El Análisis Lírico: La autopsia del machismo y la huida por la supervivencia",
    "section2_text": "La letra, escrita íntegramente por Michael Jackson, es una crítica feroz y cínica a la cultura de la violencia callejera, el falso honor de las pandillas y la masculinidad tóxica que imperaba en los suburbios americanos a principios de los 80. El título \"Beat It\" es una expresión coloquial que significa \"lárgate\", \"huye\", \"esfúmate\" o \"pirate\".",
    "section2_points": [
      {
        "name": "Primera Estrofa: La ley del asfalto",
        "quote": "They told him, 'Don't you ever come around here' / 'Don't wanna see your face, you better disappear' / The fire's in their eyes and their words are really clear / So beat it, just beat it",
        "analysis": "El arranque nos mete de lleno en el territorio de la amenaza: \"Le dijeron: 'No vuelvas por aquí, no queremos ver tu cara, es mejor que desaparezcas'\". Describe la intimidación de una banda rival en una esquina. Y lanza la orden de supervivencia del narrador: \"El fuego está en sus ojos y sus palabras son muy claras, así que lárgate, simplemente lárgate\". Michael no te pide que luches por tu honor; te pide que uses la cabeza y huyas del peligro."
      },
      {
        "name": "Segunda Estrofa: El mito de la valentía estúpida",
        "quote": "You better run, you better do what you can / Don't wanna see no blood, don't be a macho man / You wanna be tough, better do what you can / So beat it, but you wanna be bad",
        "vocab": "\"Macho man\" aquí se utiliza con un tono despectivo y sarcástico para referirse al tipo que se cree fuerte o valiente por meterse en peleas. \"Bad\" juega con el doble sentido de ser malo o gamberro.",
        "analysis": "El texto se vuelve un consejo directo e incómodo: \"Es mejor que corras, mejor haz lo que puedas. No quiero ver sangre, no vayas de 'macho man'\". Michael desmonta el orgullo del pandillero: \"Quieres ser el tipo duro, mejor haz lo que puedas... pero tú lo que quieres es ir de malo\". Te está diciendo que la búsqueda de respeto a través de los puños o las navajas es una idiota inmadurez que solo conduce a la morgue."
      },
      {
        "name": "El Estribillo: La victoria de la retirada",
        "quote": "Beat it, beat it, beat it, beat it / No one wants to be defeated / Showin' how funky and strong is your fight / It doesn't matter who's wrong or right / Just beat it, just beat it / Just beat it, just beat it",
        "vocab": "\"Defeated\" significa derrotado o vencido.",
        "analysis": "El estribillo explota con un ritmo funk arrollador: \"Lárgate, lárgate... Nadie quiere ser derrotado\". Expone la paradoja del orgullo: los dos bandos tienen miedo de perder la cara frente a sus amigos. Y lanza la gran lección de pacificación de la canción: \"Mostrando cómo de moderna y fuerte es tu lucha, no importa quién tenga la razón o esté equivocado, simplemente lárgate\". Michael afirma que el verdadero valiente no es el que se queda a sangrar por una esquina, sino el que tiene la madurez de dar la vuelta y marcharse porque sabe que esa guerra no tiene sentido."
      }
    ],
    "section3_title": "3. El Videoclip: Los pandilleros reales y la tregua coreografiada",
    "section3_text": "El video musical, dirigido por Bob Giraldi y coreografiado por Michael Peters, es una de las piezas visuales más icónicas de la televisión mundial y un hito de la telerrealidad:",
    "section3_points": [
      {
        "name": "La inclusión de las bandas reales",
        "desc": "Para darle un aire de peligro auténtico al videoclip, Michael Jackson exigió contratar a miembros reales de las dos pandillas rivales más famosas de Los Ángeles de la época: los Crips y los Bloods. La policía intentó cancelar el rodaje advirtiendo de que si se juntaban en una sala cerrada podía haber un tiroteo. Michael se plantó, pasó los dos días de rodaje charlando con ellos y consiguió que los delincuentes reales convivieran en paz."
      },
      {
        "name": "El baile como desahogo",
        "desc": "El clímax del video es historia pura de la danza pop. En lugar de resolver la pelea de navajas en un callejón oscuro con sangre, las dos bandas se unen en un almacén y resuelven su conflicto ejecutando una coreografía perfectamente sincronizada detrás de Michael. El video traduce la letra visualmente: la agresividad y el ritmo de la calle se canalizan a través del arte y el baile, transformando la violencia en energía creativa."
      }
    ],
    "section4_title": "4. El Impacto Cultural: El derribo de la barrera del Rock Blanco",
    "section4_text": "\"Beat It\" fue un tsunami comercial inapelable: llegó al número 1 de la lista Billboard Hot 100 de forma simultánea con \"Billie Jean\", una hazaña casi inédita en la historia de la música, impulsando a Thriller hacia el Olimpo de las listas mundiales.",
    "section4_points": [
      {
        "name": "Ruptura de la segregación radiofónica",
        "desc": "A principios de los 80, las emisoras de radio de Estados Unidos estaban completamente segregadas: las radios de formato AOR (Album Oriented Rock) solo pinchaban a bandas de rock blanco como Journey o Van Halen, y las radios urbanas solo pinchaban música negra. Con \"Beat It\", gracias a la presencia del solo de guitarra de Eddie Van Halen y al riff pesado de Steve Lukather, las radios de rock blanco se vieron obligadas por primera vez a pinchar en bucle a un artista negro. La canción tendió un puente indestructible entre dos mundos culturales que se daban la espalda, demostrando que el ritmo y la distorsión son un lenguaje universal."
      },
      {
        "name": "Conclusión Sónica",
        "desc": "Al final, \"Beat It\" funciona como un mecanismo sónico perfecto: una intro de suspense con el Synclavier digital que da paso al riff de hormigón de Steve Lukather, empujados por el solo de guitarra incendiario de Eddie Van Halen y la voz rabiosa de Michael, envolviendo una de las letras más valientes, directas y reales sobre el desprecio a la violencia callejera, la deconstrucción del \"macho man\" y la victoria de saber retirarse a tiempo."
      }
    ]
  }
};

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'analyses_db.json'), JSON.stringify(db, null, 2), 'utf8');
console.log('SUCCESS');
