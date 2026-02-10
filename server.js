const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// --- CONFIGURAZIONE ---
const PORT = process.env.PORT || 7000;
const VIDEASY_API_DECRYPT = 'https://enc-dec.app/api/dec-videasy';
const TMDB_KEY = process.env.TMDB_API_KEY || 'd131017ccc6e5462a81c9304d21476de'; // Fallback key
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Headers per simulare un browser reale ed evitare blocchi 403
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://videasy.net/',
    'Origin': 'https://videasy.net',
    'Accept': '*/*',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
};

// Server Videasy (Priorità: Harbor è quello Italiano)
const TARGET_SERVERS = {
    'Harbor (ITA)': { 
        url: 'https://api.videasy.net/meine/sources-with-title', 
        params: { language: 'italian' } 
    },
    'Neon (Backup)': { 
        url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', 
        params: {} 
    }
};

// --- HELPER FUNCTIONS ---

// 1. Fetch con gestione errori e timeout
async function fetchSafe(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 secondi timeout

    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: { ...BROWSER_HEADERS, ...(options.headers || {}) }
        });
        clearTimeout(timeout);
        return res;
    } catch (error) {
        clearTimeout(timeout);
        // console.log(`⚠️ Fetch Error su ${url}: ${error.message}`);
        return null;
    }
}

// 2. Ottieni ID e Dettagli da TMDB
async function getMediaDetails(imdbId, type) {
    // A. Trova TMDB ID
    const findUrl = `${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`;
    const findRes = await fetchSafe(findUrl);
    if (!findRes || !findRes.ok) return null;
    
    const findData = await findRes.json();
    const result = findData.movie_results?.[0] || findData.tv_results?.[0];
    
    if (!result) return null;

    const tmdbId = result.id.toString();
    // Determina tipo corretto (Stremio a volte sbaglia 'series' vs 'tv')
    const mediaType = findData.movie_results?.length > 0 ? 'movie' : 'tv';

    // B. Ottieni Titolo e Anno (necessari per l'API Videasy)
    const detailUrl = `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}`;
    const detRes = await fetchSafe(detailUrl);
    const details = detRes ? await detRes.json() : result;

    return {
        tmdbId,
        mediaType,
        title: details.title || details.name,
        year: (details.release_date || details.first_air_date || '').split('-')[0]
    };
}

// 3. Decripta la stringa ottenuta da Videasy
async function decryptSource(encryptedText, tmdbId) {
    if (!encryptedText || encryptedText.length < 50) return null;

    const res = await fetchSafe(VIDEASY_API_DECRYPT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: encryptedText, id: tmdbId })
    });

    if (res && res.ok) {
        const json = await res.json();
        return json.result; // Ritorna l'oggetto con le 'sources'
    }
    return null;
}

// 4. Logica Core: Interroga un server specifico
async function scrapeServer(serverName, serverConfig, mediaInfo) {
    const { mediaType, title, year, tmdbId, imdbId, season, episode } = mediaInfo;

    // Costruisci URL API Videasy
    const params = new URLSearchParams({
        title, mediaType, year, tmdbId, imdbId,
        ...serverConfig.params
    });

    if (mediaType === 'tv' && season && episode) {
        params.append('seasonId', season);
        params.append('episodeId', episode);
    }

    const apiUrl = `${serverConfig.url}?${params.toString()}`;
    // console.log(`🔍 Checking ${serverName}...`);

    // A. Scarica il blob criptato
    const res = await fetchSafe(apiUrl);
    if (!res || !res.ok) return [];
    
    const encryptedText = await res.text();
    if (!encryptedText || encryptedText.trim() === '') return [];

    // B. Decripta
    const data = await decryptSource(encryptedText, tmdbId);
    
    // C. Estrai i link
    if (data && data.sources && data.sources.length > 0) {
        return data.sources.map(source => ({
            url: source.url,
            quality: source.quality || 'HD',
            server: serverName,
            isHls: source.url.includes('.m3u8')
        }));
    }

    return [];
}

// --- ADDON DEFINITION ---
const manifest = {
    id: 'community.videasy.direct',
    version: '3.2.0',
    name: 'Videasy ITA (Direct)',
    description: 'Tenta la riproduzione diretta. Fallback su browser se fallisce.',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`🎬 Richiesta: ${type} ${id}`);
    
    let [imdbId, season, episode] = id.split(':');
    
    // 1. Ottieni Dettagli
    const mediaInfo = await getMediaDetails(imdbId, type);
    if (!mediaInfo) {
        console.log('❌ Film non trovato su TMDB');
        return { streams: [] };
    }
    
    // Aggiungi season/episode all'oggetto info
    mediaInfo.season = season;
    mediaInfo.episode = episode;
    mediaInfo.imdbId = imdbId;

    console.log(`✅ Trovato: ${mediaInfo.title} (${mediaInfo.year})`);

    // 2. Scraping Parallelo (Solo su Harbor e Neon per velocità)
    const promises = Object.entries(TARGET_SERVERS).map(([name, config]) => 
        scrapeServer(name, config, mediaInfo)
    );

    const results = await Promise.all(promises);
    const directStreams = results.flat();

    const streams = [];

    // 3. Formatta i risultati per Stremio
    if (directStreams.length > 0) {
        console.log(`🎉 Trovati ${directStreams.length} stream diretti!`);
        
        directStreams.forEach(s => {
            streams.push({
                name: `🇮🇹 ${s.server}`,
                title: `Direct Play\nQualità: ${s.quality}`,
                url: s.url,
                behaviorHints: {
                    bingeGroup: `videasy-${s.server}`,
                    notWebReady: false // Importante per dire a Stremio "è un video vero"
                }
            });
        });
    } else {
        console.log('⚠️ Nessun stream diretto trovato (API bloccata o nessun link).');
    }

    // 4. Aggiungi SEMPRE il fallback Web (se il direct play fallisce, l'utente non rimane a piedi)
    let webUrl = 'https://player.videasy.net';
    if (mediaInfo.mediaType === 'movie') webUrl += `/movie/${mediaInfo.tmdbId}?lang=it`;
    else webUrl += `/tv/${mediaInfo.tmdbId}/${season}/${episode}?lang=it`;

    streams.push({
        name: '🌐 Web Fallback',
        title: 'Clicca qui se il Direct Play non carica',
        externalUrl: webUrl
    });

    return { streams };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 Addon pronto su porta ${PORT}`);
