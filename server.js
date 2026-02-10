const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// Configurazione Videasy Player
const VIDEASY_PLAYER_BASE = 'https://player.videasy.net';

// Configurazione TMDB per i cataloghi (opzionale, ma consigliato)
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

// Manifest dell'addon
const manifest = {
    id: 'community.videasy.player',
    version: '2.0.0',
    name: 'Videasy Player',
    description: 'Addon Stremio che usa il player Videasy per streaming di film, serie TV e anime',
    resources: ['stream'],
    types: ['movie', 'series', 'anime'],
    catalogs: [],  // Array vuoto richiesto da Stremio
    idPrefixes: ['tt'],
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    }
};

const builder = new addonBuilder(manifest);

// Helper function per convertire IMDB ID in TMDB ID
async function imdbToTmdb(imdbId, type) {
    if (!TMDB_API_KEY) {
        // Se non c'è API key, prova a estrarre solo i numeri dall'IMDB ID
        return imdbId.replace('tt', '');
    }
    
    try {
        const url = `${TMDB_API_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (type === 'movie' && data.movie_results && data.movie_results.length > 0) {
            return data.movie_results[0].id.toString();
        } else if (type === 'series' && data.tv_results && data.tv_results.length > 0) {
            return data.tv_results[0].id.toString();
        }
        
        return null;
    } catch (error) {
        console.error('Errore conversione IMDB->TMDB:', error);
        return null;
    }
}

// Helper per generare URL Videasy
function generateVideasyUrl(tmdbId, type, season = null, episode = null, options = {}) {
    let url = VIDEASY_PLAYER_BASE;
    
    if (type === 'movie') {
        url += `/movie/${tmdbId}`;
    } else if (type === 'series') {
        if (season && episode) {
            url += `/tv/${tmdbId}/${season}/${episode}`;
        } else {
            return null;
        }
    } else if (type === 'anime') {
        if (episode) {
            url += `/anime/${tmdbId}/${episode}`;
        } else {
            url += `/anime/${tmdbId}`;
        }
    }
    
    // Aggiungi parametri opzionali
    const params = new URLSearchParams();
    
    if (options.color) params.append('color', options.color);
    if (options.autoplayNextEpisode) params.append('autoplayNextEpisode', 'true');
    if (options.nextEpisode) params.append('nextEpisode', 'true');
    if (options.episodeSelector) params.append('episodeSelector', 'true');
    if (options.overlay) params.append('overlay', 'true');
    
    const queryString = params.toString();
    if (queryString) {
        url += '?' + queryString;
    }
    
    return url;
}

// STREAM Handler - Il cuore dell'addon
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`🎬 Stream richiesto: type=${type}, id=${id}`);
    
    try {
        let imdbId = id;
        let season = null;
        let episode = null;

        // Parse ID per serie TV (formato: imdbId:season:episode)
        if (id.includes(':')) {
            const parts = id.split(':');
            imdbId = parts[0];
            if (parts.length >= 3) {
                season = parseInt(parts[1]);
                episode = parseInt(parts[2]);
            }
        }

        // Converti IMDB ID in TMDB ID
        const tmdbId = await imdbToTmdb(imdbId, type);
        
        if (!tmdbId) {
            console.log(`❌ Impossibile trovare TMDB ID per ${imdbId}`);
            return { streams: [] };
        }

        console.log(`✅ TMDB ID trovato: ${tmdbId} per IMDB ID: ${imdbId}`);

        const streams = [];
        
        // Configurazione player predefinita
        const playerOptions = {
            color: '8B5CF6', // Viola
            overlay: true
        };

        if (type === 'movie') {
            // URL per film
            const movieUrl = generateVideasyUrl(tmdbId, 'movie', null, null, playerOptions);
            
            streams.push({
                name: '🎬 Videasy',
                title: 'Videasy Player\n🎨 HD Quality',
                url: movieUrl,
                behaviorHints: {
                    bingeGroup: 'videasy-' + tmdbId
                }
            });
            
        } else if (type === 'series') {
            if (!season || !episode) {
                console.log(`❌ Mancano stagione/episodio per la serie`);
                return { streams: [] };
            }
            
            // URL per serie TV con features extra
            const seriesOptions = {
                ...playerOptions,
                nextEpisode: true,
                autoplayNextEpisode: true,
                episodeSelector: true
            };
            
            const seriesUrl = generateVideasyUrl(tmdbId, 'series', season, episode, seriesOptions);
            
            if (seriesUrl) {
                streams.push({
                    name: '📺 Videasy',
                    title: `Videasy Player\n📺 S${season}E${episode} - HD Quality\n⏭️ Autoplay Next Episode`,
                    url: seriesUrl,
                    behaviorHints: {
                        bingeGroup: 'videasy-' + tmdbId
                    }
                });
            }
        }

        // Aggiungi stream di backup senza personalizzazioni
        if (streams.length > 0) {
            const basicUrl = type === 'movie' 
                ? generateVideasyUrl(tmdbId, 'movie')
                : generateVideasyUrl(tmdbId, 'series', season, episode, { nextEpisode: true });
            
            if (basicUrl) {
                streams.push({
                    name: '🎬 Videasy Basic',
                    title: 'Videasy Player (Basic)\n🎬 Standard Quality',
                    url: basicUrl,
                    behaviorHints: {
                        bingeGroup: 'videasy-' + tmdbId
                    }
                });
            }
        }

        console.log(`✅ ${streams.length} stream generati`);
        return { streams };
        
    } catch (error) {
        console.error('❌ Errore nello stream handler:', error);
        return { streams: [] };
    }
});

// Avvio del server
const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });

console.log(`🚀 Addon Videasy avviato su http://localhost:${PORT}`);
console.log(`📦 Manifest disponibile su http://localhost:${PORT}/manifest.json`);
console.log(`🔗 Installa l'addon su: http://localhost:${PORT}/configure`);
