const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// --- CONFIGURAZIONE ---
const PORT = process.env.PORT || 7000;
const VIDEASY_API_DEC = 'https://enc-dec.app/api';
// Chiave pubblica di fallback se la tua ENV non è settata
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'd131017ccc6e5462a81c9304d21476de'; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// HEADERS FONDAMENTALI per evitare blocchi (403 Forbidden)
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://videasy.net/',
    'Origin': 'https://videasy.net',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive'
};

// Lista Server
const SERVERS = {
    'Harbor': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'Italian', params: { language: 'italian' } },
    'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', language: 'Original' },
    'Sage': { url: 'https://api.videasy.net/1movies/sources-with-title', language: 'Original' },
    'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title', language: 'Original' },
    'Yoru': { url: 'https://api.videasy.net/cdn/sources-with-title', language: 'Original', moviesOnly: true },
    'Reyna': { url: 'https://api2.videasy.net/primewire/sources-with-title', language: 'Original' },
    'Vyse': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Original' },
    'Killjoy': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'German', params: { language: 'german' } }
};

// --- HELPER FUNCTIONS ---

async function requestRaw(method, urlString, options = {}) {
    const opts = {
        method: method,
        headers: { ...HEADERS, ...(options.headers || {}) },
        body: options.body
    };
    
    // console.log(`📡 Richiesta ${method}: ${urlString}`); // Decommenta per debug estremo
    
    const response = await fetch(urlString, opts);
    const body = await response.text();
    
    if (!response.ok) {
        throw new Error(`HTTP Error ${response.status} su ${urlString}`);
    }
    return { status: response.status, body };
}

async function getJson(url) {
    try {
        const res = await requestRaw('GET', url);
        return JSON.parse(res.body);
    } catch (e) {
        console.error(`❌ Errore JSON ${url}:`, e.message);
        return null;
    }
}

async function postJson(url, jsonBody) {
    try {
        const res = await requestRaw('POST', url, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonBody)
        });
        return JSON.parse(res.body);
    } catch (e) {
        console.error(`❌ Errore POST ${url}:`, e.message);
        return null;
    }
}

// 1. Decriptazione tramite API esterna
async function decryptVideoEasy(encryptedText, tmdbId) {
    if (!encryptedText || encryptedText.length < 10) return null;
    
    const data = await postJson(`${VIDEASY_API_DEC}/dec-videasy`, { 
        text: encryptedText, 
        id: tmdbId 
    });
    
    return data ? data.result : null;
}

// 2. Costruzione URL Videasy
function buildUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, season = null, episode = null) {
    const params = new URLSearchParams({
        title, mediaType, year, tmdbId, imdbId
    });
    
    if (serverConfig.params) {
        Object.keys(serverConfig.params).forEach(k => params.append(k, serverConfig.params[k]));
    }
    
    if (mediaType === 'tv' && season && episode) {
        params.append('seasonId', season);
        params.append('episodeId', episode);
    }
    
    return `${serverConfig.url}?${params.toString()}`;
}

// 3. Estrazione Stream dal singolo server
async function fetchFromServer(serverName, config, mediaInfo) {
    const { mediaType, title, year, tmdbId, imdbId, season, episode } = mediaInfo;
    
    if (mediaType === 'tv' && config.moviesOnly) return [];

    try {
        const url = buildUrl(config, mediaType, title, year, tmdbId, imdbId, season, episode);
        
        // Scarica i dati criptati
        const res = await requestRaw('GET', url);
        if (!res.body || res.body.trim().length === 0) return [];

        // Decripta
        const decrypted = await decryptVideoEasy(res.body, tmdbId);
        if (!decrypted || !decrypted.sources) return [];

        // Formatta
        return decrypted.sources.map(source => ({
            url: source.url,
            quality: source.quality || 'Auto',
            server: serverName,
            isItalian: config.language === 'Italian',
            language: config.language
        })).filter(s => s.url); // Rimuovi URL vuoti

    } catch (e) {
        // console.log(`⚠️ ${serverName} fallito: ${e.message}`); // Normale che alcuni falliscano
        return [];
    }
}

// --- ADDON MANIFEST ---
const builder = new addonBuilder({
    id: 'community.videasy.debug',
    version: '3.1.0',
    name: 'Videasy ITA (Fix)',
    description: 'Videasy con log migliorati e fallback web',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [], 
    idPrefixes: ['tt']
});

// --- STREAM HANDLER ---
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n🎬 NUOVA RICHIESTA: ${type} ${id}`);
    
    let imdbId = id;
    let season = null;
    let episode = null;

    if (id.includes(':')) {
        [imdbId, season, episode] = id.split(':');
    }

    // A. Converti IMDB -> TMDB
    const findUrl = `${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const tmdbData = await getJson(findUrl);
    
    let tmdbId = null;
    let mediaType = type === 'series' ? 'tv' : 'movie';
    let title = '';
    let year = '';

    if (tmdbData) {
        const result = (tmdbData.movie_results?.[0]) || (tmdbData.tv_results?.[0]);
        if (result) {
            tmdbId = result.id.toString();
            title = result.title || result.name;
            year = (result.release_date || result.first_air_date || '').split('-')[0];
            // Forza il tipo corretto in base al risultato TMDB
            mediaType = tmdbData.movie_results?.length > 0 ? 'movie' : 'tv';
        }
    }

    if (!tmdbId) {
        console.log('❌ TMDB ID non trovato. Interrompo.');
        return { streams: [] };
    }

    console.log(`✅ Info trovate: ${title} (${year}) [ID: ${tmdbId}]`);

    // B. Esegui Scraping
    const mediaInfo = { mediaType, title, year, tmdbId, imdbId, season, episode };
    
    // Cerca su Harbor (ITA) per primo
    const tasks = Object.keys(SERVERS).map(name => fetchFromServer(name, SERVERS[name], mediaInfo));
    const results = await Promise.all(tasks);
    const allStreams = results.flat();

    // C. Crea array per Stremio
    let stremioStreams = [];

    // Se abbiamo trovato link diretti
    if (allStreams.length > 0) {
        console.log(`🎉 Trovati ${allStreams.length} stream diretti!`);
        
        // Ordina: ITA prima, poi qualità
        allStreams.sort((a, b) => {
            if (a.isItalian && !b.isItalian) return -1;
            if (!a.isItalian && b.isItalian) return 1;
            return 0; 
        });

        stremioStreams = allStreams.map(s => ({
            name: `${s.isItalian ? '🇮🇹' : '🌍'} ${s.server}`,
            title: `${s.quality} - Direct Play`,
            url: s.url,
            behaviorHints: { bingeGroup: `videasy-${s.server}` }
        }));
    } else {
        console.log('⚠️ Nessuno stream diretto trovato. Attivo fallback Web.');
    }

    // D. AGGIUNGI SEMPRE IL FALLBACK WEB (Salvavita)
    // Se lo scraper fallisce, almeno l'utente può aprire il browser
    let webUrl = 'https://player.videasy.net';
    if (mediaType === 'movie') webUrl += `/movie/${tmdbId}?lang=it`;
    else webUrl += `/tv/${tmdbId}/${season}/${episode}?lang=it`;

    stremioStreams.push({
        name: '🌐 Videasy Web',
        title: 'Clicca qui se gli altri non vanno (Apri Browser)',
        externalUrl: webUrl
    });

    return { streams: stremioStreams };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 Addon Fix avviato su http://localhost:${PORT}`);
