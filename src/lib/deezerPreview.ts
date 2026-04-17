export async function getDeezerPreview(
  trackName: string,
  artistName: string,
): Promise<string | null> {
  if (typeof window !== 'undefined') {
    const res = await fetch(
      `${window.location.origin}/api/deezer-track-preview?track=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { preview?: string | null };
    return body.preview ?? null;
  }

  const query = encodeURIComponent(`${trackName} ${artistName}`);
  const res = await fetch(`https://api.deezer.com/search?q=${query}`);
  const data = await res.json();

  if (!data.data || data.data.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const match = data.data.find(
    (item: { title: string; artist: { name: string }; preview?: string }) => {
      const titleMatch = normalize(item.title).includes(normalize(trackName));
      const artistMatch = normalize(item.artist.name).includes(normalize(artistName));
      return titleMatch && artistMatch;
    },
  );

  return match?.preview || data.data[0]?.preview || null;
}
