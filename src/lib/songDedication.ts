import { getDeezerPreview } from './deezerPreview';

/** Same audio URL as after you pick a song — for “listen before you choose” on search results. */
export async function getProxiedDeezerPreviewUrl(
  trackName: string,
  artistName: string,
): Promise<string | null> {
  const raw = await getDeezerPreview(trackName, artistName);
  if (!raw) return null;
  return `/api/preview?url=${encodeURIComponent(raw)}`;
}

export type SongDedication = {
  title: string;
  artist: string;
  albumArt: string;
  spotifyUrl: string;
  previewUrl: string | null;
};

export const SONG_DEDICATION_PLACEHOLDER_ART =
  'https://placehold.co/200x200/1a1a1a/ffffff/png?text=%E2%99%AA';

/** After the guest picks a song from Spotify search results, attach a Deezer preview URL. */
export async function songDedicationFromSpotifyTrack(track: {
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_urls: { spotify: string };
}): Promise<SongDedication> {
  const artist = track.artists[0]?.name ?? '';
  const previewUrlRaw = await getDeezerPreview(track.name, artist);
  const proxiedPreviewUrl = previewUrlRaw
    ? `/api/preview?url=${encodeURIComponent(previewUrlRaw)}`
    : null;

  return {
    title: track.name,
    artist,
    albumArt: track.album.images[0]?.url ?? SONG_DEDICATION_PLACEHOLDER_ART,
    spotifyUrl: track.external_urls.spotify,
    previewUrl: proxiedPreviewUrl,
  };
}

/** Row from `/api/spotify/search` — Spotify metadata + Deezer 30s preview for playback. */
export async function songDedicationFromGuestSearchRow(r: {
  id: string;
  name: string;
  artist_name: string;
  album_art_url: string | null;
}): Promise<SongDedication> {
  const previewUrlRaw = await getDeezerPreview(r.name, r.artist_name);
  const proxiedPreviewUrl = previewUrlRaw
    ? `/api/preview?url=${encodeURIComponent(previewUrlRaw)}`
    : null;

  return {
    title: r.name,
    artist: r.artist_name,
    albumArt: r.album_art_url ?? SONG_DEDICATION_PLACEHOLDER_ART,
    spotifyUrl: `https://open.spotify.com/track/${r.id}`,
    previewUrl: proxiedPreviewUrl,
  };
}
