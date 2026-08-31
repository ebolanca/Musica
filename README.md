# 🎵 Plataforma Musical & Centro Multimedia

Plataforma web de streaming de música local y radios en directo con interfaz estilo **Spotify / Apple Music**, modo cine interactivo con **Karaoke sincronizado y traducción en tiempo real**, **normalización inteligente de audio (-14 LUFS)** y **análisis sonoro/histórico impulsado por Inteligencia Artificial (Google Gemini 3.7 Flash & Ollama)**.

---

## 🌟 Características Principales

### 🎧 Reproductor & Catálogo
* **Exploración por Playlists:** Categorías organizadas (*Dance, Española, Música Latina, Música Viejuna, Siglo XXI*).
* **Radios en Directo:** Emisoras nacionales de España con metadatos de emisión en tiempo real.
* **Party DJ / Shuffle Inteligente:** Reproducción aleatoria continua con transiciones fluidas.
* **Búsqueda Dinámica:** Filtrado instantáneo por título, artista o álbum.
* **Audio Puro de Estudio:** Reproducción directa de archivos MP3 optimizados a 128 kbps.

### 🎙️ Modo Cine & Karaoke Sincronizado
* **Estética Vinilo:** Carátula giratoria de alta resolución con fondo dinámico inmersivo (*Glassmorphism*).
* **Karaoke en Tiempo Real:** Seguimiento automático y scroll centrado de cada estrofa.
* **Doble Idioma:** Letra original junto con su traducción al español.
* **Ajuste Fino de Sincronía:**
  * Clic en cualquier estrofa para alinear el karaoke al instante.
  * Botones de ajuste milimétrico (`▲` / `▼` de 0.1s) y barra deslizadora.
  * Botón 💾 para grabar el desfase permanentemente en la base de datos de letras.
* **Versión Limpia Oficial:** Herramienta integrada para descargar y sustituir al vuelo pistas que contengan intros o diálogos de videoclips por versiones de estudio.

### 🎚️ Normalización de Audio Inteligente (Web Audio API)
* Procesamiento en tiempo real en el cliente mediante **Dynamics Compressor** y **Gain Leveler**.
* Nivelación constante al estándar de sonoridad comercial **-14 LUFS** (evita saltos bruscos de volumen entre canciones de distintas épocas).

### 🤖 Análisis Sónico & Cultural con IA (Gemini & Ollama)
* Pestaña interactiva de análisis contextual para cada canción:
  1. **Contexto & Época:** Momento histórico y relevancia del lanzamiento.
  2. **Arquitectura Sónica:** Instrumentación, ritmo, tonalidad y arreglos de producción.
  3. **Impacto & Huella Cultural:** Premios, listas de éxitos e influencia cultural (solo si aplica).
  4. **Detalles de Producción & Curiosidades:** Anécdotas de grabación y datos técnicos.
* **Cero Relleno:** Si una canción es instrumental, omite análisis líricos forzados; secciones dinámicas y concisas.
* **Botón ⚡ Re-analizar con IA:** Regeneración en vivo bajo demanda utilizando `gemini-3.7-flash` (con fallback local a Ollama).

---

## 🏗️ Arquitectura y Estructura del Proyecto

```
Musica/
├── server.js               # Servidor Express, endpoints API, caché y puente IA
├── package.json            # Dependencias y scripts del proyecto
├── data/
│   ├── analyses_db.json    # Base de datos de análisis musicales enriquecidos
│   └── lyrics_db.json      # Base de datos de letras y marcas de tiempo
├── public/
│   ├── index.html          # Interfaz principal Single Page Application
│   ├── css/
│   │   └── style.css       # Sistema de diseño, Glassmorphism, animaciones y responsive
│   └── js/
│       └── app.js          # Lógica frontend, Web Audio API, Karaoke engine y UI
└── scripts/
    ├── sync_version.js     # Script para sincronización de versiones (package.json e index.html)
    └── enrich_with_gemini.js # Script de enriquecimiento por lotes con Gemini API
```

---

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos
* **Node.js** v18 o superior
* **FFmpeg** instalado y accesible en el `PATH`
* **Python** (para utilidades de descarga de audio limpio)

### Configuración
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/ebolanca/Musica.git
   cd Musica
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno en un archivo `.env`:
   ```env
   PORT=8087
   GEMINI_API_KEY=tu_api_key_de_gemini
   OLLAMA_HOST=http://100.95.217.45:11434
   ```

4. Iniciar el servidor:
   ```bash
   npm start
   # o en modo desarrollo:
   node server.js
   ```

La aplicación estará disponible en `http://localhost:8087`.

---

## 🖥️ Infraestructura Multi-PC

| Entorno | Host / IP | Puerto | Función |
| :--- | :--- | :--- | :--- |
| **PC Desarrollo (MSI)** | `localhost` | `8087` | Desarrollo local y pruebas |
| **Servidor Central (OMEN)** | `100.95.217.45` | `8087` | Servicio 24/7 y almacenamiento multimedia (`D:\media-library\music`) |

### Despliegue y Sincronización
Para actualizar la versión y sincronizar con el servidor OMEN:
```bash
# 1. Incrementar versión
node scripts/sync_version.js

# 2. Subir a GitHub
git add .
git commit -m "vX.X.XX: <Resumen de cambios>"
git push origin main

# 3. Sincronizar en OMEN (vía red Tailscale)
git -C "\\100.95.217.45\omen D\03_Trabajo\Musica" reset --hard origin/main
```

---

## 📄 Licencia

Uso personal y privado. Todos los derechos reservados.
