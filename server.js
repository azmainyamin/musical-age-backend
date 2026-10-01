
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
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
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return accessToken;
}

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

app.get('/related', async (req, res) => {
  try {
    const artistName = req.query.artistName;
    if (!artistName) {
      return res.status(400).json({ error: 'Missing artistName (?artistName=...)' });
    }

    const token = await getAccessToken();

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

app.get('/', (req, res) => {
  res.send('Musical Age backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});