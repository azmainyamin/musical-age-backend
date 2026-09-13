// server.js
// This is the "middleman" server between your webpage and Spotify.
// It keeps your secret keys safe and answers requests from your frontend.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Note: no node-fetch import needed — Node.js 18+ has fetch() built in.

const app = express();
app.use(cors()); // allows your webpage (running on a different port) to talk to this server

const PORT = 3001;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// We cache the Spotify access token in memory so we don't ask for a new one on every request.
let accessToken = null;
let tokenExpiresAt = 0;

// Gets a fresh Spotify access token using the Client Credentials flow.
async function getAccessToken() {
  // If we already have a valid token, reuse it.
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Spotify token error:', data);
    throw new Error('Failed to get Spotify access token');
  }

  accessToken = data.access_token;
  // data.expires_in is in seconds (usually 3600 = 1 hour). We subtract a small buffer for safety.
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return accessToken;
}

// ---- ROUTE 1: Search for songs/artists (used for autocomplete) ----
// Example: GET http://localhost:3001/search?q=weeknd
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Missing search query (?q=...)' });
    }

    const token = await getAccessToken();

    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await spotifyRes.json();

    if (!spotifyRes.ok) {
      console.error('Spotify search error:', data);
      return res.status(spotifyRes.status).json({ error: 'Spotify search failed' });
    }

    const rawTracks = data.tracks?.items || [];

    // Simplify the results so the frontend gets only what it needs.
    // Note: Spotify no longer reliably returns genre data, so we rely on
    // release year / decade for the age and persona logic instead.
    const tracks = rawTracks.map((track) => ({
      type: 'track',
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      artistId: track.artists?.[0]?.id,
      artistName: track.artists?.[0]?.name,
      releaseYear: track.album?.release_date
        ? parseInt(track.album.release_date.slice(0, 4))
        : null,
    }));

    const artists = (data.artists?.items || []).map((artist) => ({
      type: 'artist',
      id: artist.id,
      name: artist.name,
      genres: artist.genres,
    }));

    res.json({ tracks, artists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  }
});

// ---- ROUTE 2: Get more songs by the same artist (used for the suggestion panel) ----
// Note: Spotify's old "artist top tracks" endpoint (used here previously) was
// restricted by Spotify in late 2024 for new developer apps and now returns
// a 403 error no matter what we do. As a working replacement, we instead
// search for more tracks by this artist's name using the same /search
// approach that already works reliably.
// Example: GET http://localhost:3001/related?artistName=The%20Weeknd
app.get('/related', async (req, res) => {
  try {
    const artistName = req.query.artistName;
    if (!artistName) {
      return res.status(400).json({ error: 'Missing artistName (?artistName=...)' });
    }

    const token = await getAccessToken();

    // Spotify's search supports field filters like artist:"Name" for more precise results.
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=track&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await spotifyRes.json();

    if (!spotifyRes.ok) {
      console.error('Spotify related (search-based) error:', data);
      return res.status(spotifyRes.status).json({ error: 'Spotify related-tracks request failed' });
    }

    const rawTracks = data.tracks?.items || [];

    const tracks = rawTracks.map((track) => ({
      type: 'track',
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      artistId: track.artists?.[0]?.id,
      artistName: track.artists?.[0]?.name,
      releaseYear: track.album?.release_date
        ? parseInt(track.album.release_date.slice(0, 4))
        : null,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  }
});

// Simple test route to confirm the server is alive.
app.get('/', (req, res) => {
  res.send('Musical Age backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});