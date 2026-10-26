'use strict';

const LIMITS = {
  name: 60,
  relation: 60,
  years: 20,
  favourites: 120,
  memory: 400,
  caption: 120,
  memories: 8,
  photos: 4,
  photoChars: 4000000, // base64 characters per photo (about 3 MB)
};

// Remove control characters and cut to the allowed length.
function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

// Check what the browser sent. Never trust it: clean everything, and refuse anything odd.
function validateRemember(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Nothing was sent.' };
  }

  const name = clean(body.name, LIMITS.name);
  if (!name) return { ok: false, error: 'Please add their name.' };

  if (body.memories !== undefined && !Array.isArray(body.memories)) {
    return { ok: false, error: 'Memories must be a list.' };
  }
  if (body.photos !== undefined && !Array.isArray(body.photos)) {
    return { ok: false, error: 'Photos must be a list.' };
  }

  const memories = (body.memories || [])
    .map((m) => clean(m, LIMITS.memory))
    .filter((m) => m.length > 0);
  if (memories.length > LIMITS.memories) {
    return { ok: false, error: `Please use at most ${LIMITS.memories} memories.` };
  }

  const rawPhotos = body.photos || [];
  if (rawPhotos.length > LIMITS.photos) {
    return { ok: false, error: `Please use at most ${LIMITS.photos} photos.` };
  }

  const photos = [];
  for (const photo of rawPhotos) {
    const data = photo && typeof photo.data === 'string' ? photo.data : '';
    if (!data || data.length > LIMITS.photoChars) {
      return { ok: false, error: 'One of the photos is missing or too large.' };
    }
    // The page always sends resized JPEGs. A JPEG in base64 starts with "/9j/".
    if (!/^[A-Za-z0-9+/=]+$/.test(data) || !data.startsWith('/9j/')) {
      return { ok: false, error: 'One of the photos is not a valid JPEG.' };
    }
    photos.push({ data, caption: clean(photo.caption, LIMITS.caption) });
  }

  if (memories.length === 0 && photos.length === 0) {
    return { ok: false, error: 'Please add at least one memory or photo.' };
  }

  return {
    ok: true,
    value: {
      name,
      relation: clean(body.relation, LIMITS.relation),
      years: clean(body.years, LIMITS.years),
      favourites: clean(body.favourites, LIMITS.favourites),
      memories,
      photos,
    },
  };
}

module.exports = { validateRemember, clean, LIMITS };
