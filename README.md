# 🎬 Stremio Videasy Player Addon

Un addon per Stremio che integra il **player Videasy** per guardare film, serie TV e anime direttamente all'interno di Stremio.

## ✨ Caratteristiche

- 🎬 **Film**: Streaming di film in HD tramite Videasy Player
- 📺 **Serie TV**: Supporto completo con autoplay, selettore episodi e pulsante "prossimo episodio"
- 🎨 **Personalizzazione**: Player con overlay Netflix-style e tema personalizzato
- 🔄 **Autoplay**: Riproduzione automatica dell'episodio successivo
- 🎯 **Zero configurazione Videasy**: Non serve API key di Videasy!
- 🌍 **Funziona con ID IMDB**: Compatibile con tutti i contenuti di Stremio

## 🚀 Come Funziona

L'addon converte automaticamente gli ID IMDB dei contenuti in URL del player Videasy:
- **Film**: `https://player.videasy.net/movie/[TMDB_ID]`
- **Serie TV**: `https://player.videasy.net/tv/[TMDB_ID]/[season]/[episode]`

Il player Videasy è un servizio di embed iframe che fornisce stream diretti senza bisogno di API key!

## 📋 Prerequisiti

- **Node.js** (versione 14 o superiore)
- **API Key TMDB** (opzionale ma consigliata) - [Ottieni qui gratuitamente](https://www.themoviedb.org/settings/api)

> 💡 **Nota**: L'API key TMDB serve solo per convertire IMDB ID → TMDB ID. L'addon funziona anche senza, ma con limitazioni.

## 🛠️ Installazione

### 1. Scarica e installa dipendenze

```bash
# Clona o scarica il progetto
cd stremio-videasy-addon

# Installa le dipendenze
npm install
```

### 2. Configura (Opzionale)

Crea un file `.env` dalla copia di `.env.example`:

```bash
cp .env.example .env
```

Modifica `.env` e aggiungi la tua API key TMDB:

```env
TMDB_API_KEY=la_tua_api_key_qui
PORT=7000
```

**Come ottenere l'API key TMDB:**
1. Vai su [themoviedb.org](https://www.themoviedb.org/)
2. Crea un account gratuito
3. Vai su Impostazioni → API
4. Richiedi una chiave API (seleziona "Developer")
5. Copia la chiave "API Key (v3 auth)"

### 3. Avvia l'addon

```bash
# Avvio normale
npm start

# Oppure con auto-reload per sviluppo
npm run dev
```

Vedrai questo output:
```
🚀 Addon Videasy avviato su http://localhost:7000
📦 Manifest disponibile su http://localhost:7000/manifest.json
🔗 Installa l'addon su: http://localhost:7000/configure
```

## 📲 Installazione in Stremio

### Metodo 1: Link diretto (Consigliato)

1. Con il server avviato, apri Stremio
2. Vai su **⚙️ Addons**
3. Clicca su **Community Addons** in basso
4. Incolla questo URL: `http://localhost:7000/manifest.json`
5. Clicca **Install**

### Metodo 2: Da browser

1. Apri nel browser: `http://localhost:7000/configure`
2. Clicca sul pulsante di installazione

## 🎯 Utilizzo

Una volta installato:

1. **Cerca un film o una serie** nella ricerca di Stremio
2. **Apri il contenuto** che vuoi guardare
3. **Clicca su "Watch"**
4. **Seleziona "Videasy Player"** dalla lista degli stream
5. **Goditi lo streaming!** 🎉

### Funzionalità del Player

**Per i Film:**
- Overlay Netflix-style
- Qualità HD
- Tema viola personalizzato

**Per le Serie TV:**
- ⏭️ Pulsante "Prossimo episodio"
- 🔄 Autoplay episodio successivo
- 📋 Selettore stagioni/episodi integrato
- 🎨 Overlay Netflix-style

## ⚙️ Personalizzazione

### Cambiare il colore del player

Nel file `server.js`, modifica la proprietà `color`:

```javascript
const playerOptions = {
    color: '3B82F6', // Blu (default: 8B5CF6 viola)
    overlay: true
};
```

Colori disponibili (senza #):
- `8B5CF6` - Viola (default)
- `3B82F6` - Blu
- `EF4444` - Rosso
- `10B981` - Verde
- `F59E0B` - Arancione

### Modificare le feature del player

Nel file `server.js`, sezione serie TV:

```javascript
const seriesOptions = {
    color: '8B5CF6',
    overlay: true,
    nextEpisode: true,              // Mostra pulsante "prossimo episodio"
    autoplayNextEpisode: true,      // Autoplay automatico
    episodeSelector: true           // Selettore episodi
};
```

## 🔧 Troubleshooting

### ❌ Nessuno stream disponibile

**Causa**: L'addon non riesce a convertire IMDB ID → TMDB ID

**Soluzioni:**
1. Assicurati di aver configurato `TMDB_API_KEY` nel file `.env`
2. Verifica che la chiave API sia valida
3. Controlla i log del server per errori

### ❌ Il player non carica

**Causa**: Il contenuto potrebbe non essere disponibile su Videasy

**Soluzioni:**
1. Prova con un altro contenuto
2. Verifica che l'ID TMDB sia corretto nei log
3. Alcuni contenuti molto recenti potrebbero non essere disponibili

### ❌ Errore di rete

**Causa**: Problemi di connessione con TMDB o Videasy

**Soluzioni:**
1. Verifica la connessione internet
2. Controlla se TMDB API è raggiungibile
3. Prova a riavviare l'addon

### 📝 Debug Mode

Per vedere i log dettagliati:

```bash
# Avvia con output verboso
npm start
```

Nei log vedrai:
- `🎬 Stream richiesto` - Quando viene richiesto uno stream
- `✅ TMDB ID trovato` - Conversione riuscita
- `✅ X stream generati` - Stream creati con successo
- `❌` - Errori vari

## 🚀 Deploy in Produzione

### Heroku

```bash
# Login
heroku login

# Crea app
heroku create nome-addon-videasy

# Imposta variabili
heroku config:set TMDB_API_KEY=la_tua_key

# Deploy
git push heroku main

# Usa l'URL Heroku in Stremio
# https://nome-addon-videasy.herokuapp.com/manifest.json
```

### Railway / Render

1. Connetti il repository GitHub
2. Imposta `TMDB_API_KEY` nelle variabili d'ambiente
3. Deploy automatico
4. Usa l'URL pubblico per installare l'addon

### Docker

```dockerfile
FROM node:14-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 7000
CMD ["npm", "start"]
```

Build e run:
```bash
docker build -t videasy-addon .
docker run -p 7000:7000 -e TMDB_API_KEY=tua_key videasy-addon
```

## 📚 Risorse

- 🎬 [Videasy Player Docs](https://videasy.co/docs)
- 🎭 [TMDB API Docs](https://developers.themoviedb.org/3)
- 📦 [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- 💬 [Stremio Discord](https://discord.gg/zNRf6YF)

## 🤝 Contributi

I contributi sono benvenuti! Sentiti libero di:
- Aprire issue per bug o suggerimenti
- Creare pull request per miglioramenti
- Condividere l'addon con altri utenti Stremio

## ⚠️ Note Legali

- Questo addon è solo per scopo educativo
- Non ospita né distribuisce contenuti protetti da copyright
- Fornisce solo link al player Videasy
- Rispetta i termini di servizio di Videasy e TMDB
- L'utente è responsabile dell'utilizzo dell'addon

## 📄 Licenza

MIT License - Vedi file LICENSE

## 🎉 Crediti

- Sviluppato per la community di Stremio
- Utilizza [Videasy Player](https://videasy.co) per lo streaming
- Metadati da [The Movie Database (TMDB)](https://www.themoviedb.org/)

---

**Buona visione! 🍿**
