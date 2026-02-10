const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// --- COSTANTI E CONFIGURAZIONE SCRAPER ---

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    'Connection': 'keep-alive'
};

const VIDEASY_API = 'https://enc-dec.app/api';
// Nota: La chiave API TMDB qui sotto è quella pubblica dello script originale. 
// Puoi rimettere la tua (process.env.TMDB_API_KEY) se preferisci, ma questa funziona per lo scraper.
const TMDB_API_KEY_SCRAPER = 'd131017ccc6e5462a81c9304d21476de'; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Configurazione Server Videasy
const SERVERS = {
    'Harbor': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'Italian', params: { language: 'italian' } },
    'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title', language: 'Original' },
    'Sage': { url: 'https://api.videasy.net/1movies/sources-with-title', language: 'Original' },
    'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title', language: 'Original' },
    'Yoru': { url: 'https://api.videasy.net/cdn/sources-with-title', language: 'Original', moviesOnly: true },
    'Reyna': { url: 'https://api2.videasy.net/primewire/sources-with-title', language: 'Original' },
    'Omen': { url: 'https://api.videasy.net/onionplay/sources-with-title', language: 'Original' },
    'Breach': { url: 'https://api.videasy.net/m4uhd/sources-with-title', language: 'Original' },
    'Vyse': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Original' },
    'Killjoy': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'German', params: { language: 'german' } },
    'Chamber': { url: 'https://api.videasy.net/meine/sources-with-title', language: 'French', params: { language: 'french' }, moviesOnly: true },
    'Fade': { url: 'https://api.videasy.net/hdmovie/sources-with-title', language: 'Hindi' },
    'Gekko': { url: 'https://api2.videasy.net/cuevana-latino/sources-with-title', language: 'Latin' },
    'Kayo': { url: 'https://api2.videasy.net/cuevana-spanish/sources-with-title', language: 'Spanish' },
    'Raze': { url: 'https://api.videasy.net/superflix/sources-with-title', language: 'Portuguese' },
    'Phoenix': { url: 'https://api2.videasy.net/overflix/sources-with-title', language: 'Portuguese' },
    'Astra': { url: 'https://api.videasy.net/visioncine/sources-with-title', language: 'Portuguese' }
};

// --- HELPER FUNCTIONS DELLO SCRAPER (Adattate per Node.js) ---

async function requestRaw(method, urlString, options) {
    const response = await fetch(urlString, {
        method: method,
        headers: (options && options.headers) || {},
        body: (options && options.body) || undefined
    });
    const body = await response.text();
    if (response.ok) {
        return { status: response.status, headers: response.headers, body: body };
    } else {
        throw new Error(`HTTP ${response.status}: ${body}`);
    }
}

async function getText(url) {
    const res = await requestRaw('GET', url, { headers: HEADERS });
    return res.body;
}

async function getJson(url) {
    const res = await requestRaw('GET', url, { headers: HEADERS });
    try { return JSON.parse(res.body); } 
    catch (e) { throw new Error(`Invalid JSON from GET ${url}: ${e.message}`); }
}

async function postJson(url, jsonBody, extraHeaders) {
    const body = JSON.stringify(jsonBody);
    const headers = Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }, extraHeaders || {});
    const res = await requestRaw('POST', url, { headers, body });
    try { return JSON.parse(res.body); } 
    catch (e) { throw new Error(`Invalid JSON from POST ${url}: ${e.message}`); }
}

async function decryptVideoEasy(encryptedText, tmdbId) {
    // Chiama l'API esterna per decriptare
    const response = await postJson(`${VIDEASY_API}/dec-videasy`, { text: encryptedText, id: tmdbId });
    return response.result;
}

// Funzioni per ottenere dettagli TMDB (Necessarie per lo scraper)
async function fetchMediaDetails(tmdbId, mediaType) {
    // Nota: usiamo la chiave dello scraper qui perché le funzioni interne la richiedono
    const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY_SCRAPER}&append_to_response=external_ids`;
    const data = await getJson(url);
    
    // Normalizza output per movie e tv
    return {
        id: data.id,
        title: data.title || data.name,
        year: (data.release_date || data.first_air_date || '').split('-')[0],
        imdbId: data.external_ids?.imdb_id || '',
        mediaType: mediaType,
        numberOfSeasons: data.number_of_seasons,
        numberOfEpisodes: data.number_of_episodes
    };
}

function buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId = null, episodeId = null) {
    const params = {
        title: title,
        mediaType: mediaType,
        year: year,
        tmdbId: tmdbId,
        imdbId: imdbId
    };

    if (serverConfig.params) Object.assign(params, serverConfig.params);
    if (mediaType === 'tv' && seasonId && episodeId) {
        params.seasonId = seasonId;
        params.episodeId = episodeId;
    }

    const queryString = Object.keys(params)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
        .join('&');

    return `${serverConfig.url}?${queryString}`;
}

function extractQualityFromUrl(url) {
    if (url.includes('1080') || url.includes('1920')) return '1080p';
    if (url.includes('720') || url.includes('1280')) return '720p';
    if (url.includes('480')) return '480p';
    if (url.includes('360')) return '360p';
    return 'Unknown';
}

function formatStreams(mediaData, serverName, serverConfig) {
    if (!mediaData || !mediaData.sources) return [];
    
    const streams = [];
    mediaData.sources.forEach(source => {
        if (!source.url) return;
        
        let quality = source.quality || extractQualityFromUrl(source.url);
        if (quality === 'auto' || quality === 'adaptive') quality = 'Adaptive';
        
        // Determina se è italiano
        const isItalian = serverConfig.language === 'Italian' || (source.language && source.language.toLowerCase().includes('ita'));

        streams.push({
            url: source.url,
            quality: quality,
            server: serverName,
            language: serverConfig.language,
            isItalian: isItalian,
            type: source.url.includes('.m3u8') ? 'hls' : 'mp4'
        });
    });
    return streams;
}

async function fetchFromServer(serverName, serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId) {
    if (mediaType === 'tv' && serverConfig.moviesOnly) return [];

    try {
        const url = buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId);
        const encryptedData = await getText(url);
        if (!encryptedData || encryptedData.trim() === '') return [];
        
        const decryptedData = await decryptVideoEasy(encryptedData, tmdbId);
        return formatStreams(decryptedData, serverName, serverConfig);
    } catch (error) {
        // console.log(`Errore ${serverName}: ${error.message}`); // Decommenta per debug
        return [];
    }
}

// --- LOGICA PRINCIPALE ADDON ---

const manifest = {
    id: 'community.videasy.advanced',
    version: '3.0.0', // Versione Major per il cambio logica
    name: 'Videasy Advanced',
    description: 'Videasy Scraper con supporto Multi-Server e Decrypt automatico. Priorità ITA.',
    resources: ['stream'],
    types: ['movie', 'series', 'anime'],
    catalogs: [], 
    idPrefixes: ['tt'],
    behaviorHints: { configurable: false }
};

const builder = new addonBuilder(manifest);

// Helper per convertire l'input Stremio (IMDB) in TMDB ID
// (Serve perché l'input dell'addon è tt123, ma lo scraper vuole ID numerici TMDB)
async function getTmdbIdFromImdb(imdbId) {
    const apiKey = process.env.TMDB_API_KEY || TMDB_API_KEY_SCRAPER;
    try {
        const url = `${TMDB_BASE_URL}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
        const data = await getJson(url);
        if (data.movie_results?.[0]) return { id: data.movie_results[0].id.toString(), type: 'movie' };
        if (data.tv_results?.[0]) return { id: data.tv_results[0].id.toString(), type: 'tv' };
        return null;
    } catch (e) { return null; }
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`🎬 Richiesta Stream: ${type} ${id}`);
    
    let imdbId = id;
    let season = null;
    let episode = null;

    if (id.includes(':')) {
        const parts = id.split(':');
        imdbId = parts[0];
        season = parts[1];
        episode = parts[2];
    }

    // 1. Converti IMDB -> TMDB
    const tmdbData = await getTmdbIdFromImdb(imdbId);
    if (!tmdbData) {
        console.log('❌ TMDB ID non trovato');
        return { streams: [] };
    }
    const tmdbId = tmdbData.id;
    // Sovrascrivi il tipo se necessario (es. Stremio dice 'series' ma TMDB dice 'tv')
    const mediaType = type === 'series' || type === 'anime' ? 'tv' : 'movie';

    console.log(`🔍 Scraping per TMDB: ${tmdbId} (${mediaType}) S:${season} E:${episode}`);

    // 2. Ottieni Dettagli Media (Titolo, Anno)
    const details = await fetchMediaDetails(tmdbId, mediaType);

    // 3. Esegui scraping parallelo su tutti i server
    const promises = Object.keys(SERVERS).map(serverName => 
        fetchFromServer(serverName, SERVERS[serverName], mediaType, details.title, details.year, tmdbId, imdbId, season, episode)
    );

    const results = await Promise.all(promises);
    
    // Appiattisci l'array di risultati
    let allStreams = results.flat();

    // 4. Rimuovi duplicati (basati su URL)
    const uniqueStreams = [];
    const seenUrls = new Set();
    allStreams.forEach(s => {
        if (!seenUrls.has(s.url)) {
            seenUrls.add(s.url);
            uniqueStreams.push(s);
        }
    });

    // 5. Ordinamento Intelligente
    // Priorità: 1. Lingua Italiana (Harbor/ITA) 2. Risoluzione Alta 3. Resto
    uniqueStreams.sort((a, b) => {
        // Se uno è italiano e l'altro no, vince l'italiano
        if (a.isItalian && !b.isItalian) return -1;
        if (!a.isItalian && b.isItalian) return 1;

        // Se entrambi ITA o entrambi stranieri, ordina per qualità
        const getVal = (q) => {
            if (q.includes('4k')) return 2160;
            if (q.includes('1080')) return 1080;
            if (q.includes('720')) return 720;
            if (q.includes('480')) return 480;
            return 0;
        };
        return getVal(b.quality) - getVal(a.quality);
    });

    console.log(`✅ Trovati ${uniqueStreams.length} stream totali.`);

    // 6. Mappa per Stremio
    const stremioStreams = uniqueStreams.map(s => {
        const flag = s.isItalian ? '🇮🇹' : (s.language === 'Original' ? '🇺🇸' : '🌐');
        const serverName = s.server === 'Harbor' ? 'ITA' : s.server;
        
        return {
            name: `${flag} ${serverName}`,
            title: `${s.quality} - ${s.language}\nServer: ${s.server}`,
            url: s.url,
            behaviorHints: {
                bingeGroup: `videasy-${s.server}-${s.quality}`,
                notWebReady: false
            }
        };
    });

    // Aggiungi un fallback al browser se tutto fallisce (opzionale)
    /*
    if (stremioStreams.length === 0) {
        stremioStreams.push({
            name: '🌐 Web',
            title: 'Nessun flusso diretto trovato. Apri nel browser',
            externalUrl: `https://player.videasy.net/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`
        });
    }
    */

    return { streams: stremioStreams };
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`🚀 Addon Videasy Advanced avviato su http://localhost:${PORT}`);
