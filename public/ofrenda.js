'use strict';

// Builds the finished ofrenda page as ONE self-contained HTML file:
// no scripts, no external requests, photos embedded. Everything the writer typed is escaped.

(function (root) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Only accept the JPEG data URLs this app makes itself.
  function safePhotoUrl(url) {
    return typeof url === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url) ? url : '';
  }

  function fileSlug(name) {
    const slug = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return slug || 'remembrance';
  }

  function buildOfrendaHtml(data) {
    const name = String(data.name || '').trim();
    const details = [data.relation, data.years].map((v) => String(v || '').trim()).filter(Boolean).join('  ·  ');
    const paragraphs = String(data.text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const items = (data.items || []).map((i) => String(i).trim()).filter(Boolean);
    const photos = (data.photos || [])
      .map((p) => ({ url: safePhotoUrl(p.url), caption: String(p.caption || '').trim() }))
      .filter((p) => p.url);
    const madeOn = data.madeOn ? String(data.madeOn) : '';

    const photoHtml = photos.map((p) => `
      <figure>
        <img src="${p.url}" alt="${escapeHtml(p.caption || 'A photo of ' + name)}">
        ${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}
      </figure>`).join('');

    const itemHtml = items.map((i) => `<li><span class="bloom"></span>${escapeHtml(i)}</li>`).join('');
    const textHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n      ');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.title || 'Remembering ' + name)}</title>
<style>
  :root { --bg:#150f0b; --card:#221810; --text:#f3e7d6; --muted:#b9a58c; --gold:#f2a33a; --serif:Georgia,'Times New Roman',serif; }
  * { box-sizing: border-box; }
  body { margin:0; background: radial-gradient(ellipse at 50% 0%, rgba(242,163,58,.18), transparent 60%), var(--bg);
         color:var(--text); font-family:var(--serif); line-height:1.7; }
  .garland { height:34px; background:
      radial-gradient(circle at 17px 17px, #f7b733 0 9px, #e8891d 10px 14px, transparent 15px) 0 0/34px 34px repeat-x; }
  main { max-width:720px; margin:0 auto; padding:34px 22px 70px; text-align:center; }
  .candles { display:flex; justify-content:center; gap:26px; margin-bottom:10px; }
  .candle { width:18px; height:54px; background:linear-gradient(#f4ead8,#d9c9a8); border-radius:3px; position:relative; margin-top:26px; }
  .candle::before { content:''; position:absolute; left:50%; top:-26px; width:14px; height:26px; transform:translateX(-50%);
      border-radius:50% 50% 50% 50% / 62% 62% 38% 38%; background:radial-gradient(circle at 50% 70%, #fff3c4, #f7b733 55%, #e8751d);
      box-shadow:0 0 22px 8px rgba(247,183,51,.45); animation:flicker 2.4s infinite ease-in-out; transform-origin:50% 90%; }
  .candle:nth-child(2) { height:68px; } .candle:nth-child(2)::before { animation-delay:.6s; }
  .candle:nth-child(3)::before { animation-delay:1.1s; }
  @keyframes flicker { 0%,100% { transform:translateX(-50%) scale(1,1); opacity:1; } 45% { transform:translateX(-50%) scale(.93,1.07); opacity:.9; } 70% { transform:translateX(-52%) scale(1.04,.96); } }
  @media (prefers-reduced-motion: reduce) { .candle::before { animation:none; } }
  h1 { font-weight:normal; font-size:clamp(34px,7vw,52px); margin:14px 0 4px; letter-spacing:.02em; }
  .details { color:var(--gold); margin:0 0 30px; font-size:18px; white-space:pre; }
  .photos { display:flex; flex-wrap:wrap; justify-content:center; gap:18px; margin:0 0 34px; }
  figure { margin:0; background:var(--card); border:1px solid #4a3722; padding:10px 10px 12px; border-radius:6px; width:210px; box-shadow:0 8px 24px rgba(0,0,0,.4); }
  figure img { display:block; width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:3px; }
  figcaption { margin-top:8px; font-size:15px; color:var(--muted); font-style:italic; }
  .words { text-align:left; font-size:20px; background:var(--card); border:1px solid #3b2c20; border-radius:12px; padding:22px 26px; }
  .words p { margin:0 0 14px; } .words p:last-child { margin:0; }
  h2 { font-weight:normal; color:var(--gold); font-size:22px; margin:38px 0 12px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; justify-content:center; gap:12px; }
  li { display:flex; align-items:center; gap:9px; background:var(--card); border:1px solid #4a3722; border-radius:999px; padding:7px 16px; font-size:17px; }
  .bloom { width:12px; height:12px; border-radius:50%; background:radial-gradient(circle,#f7b733 40%,#e8751d); }
  footer { margin-top:46px; color:var(--muted); font-size:14px; }
  @media print { body { background:#fff; color:#222; } .words, figure, li { background:#fff; border-color:#ccc; } .garland, .candles { display:none; } h1, h2, .details { color:#222; } }
</style>
</head>
<body>
<div class="garland" aria-hidden="true"></div>
<main>
  <div class="candles" aria-hidden="true"><div class="candle"></div><div class="candle"></div><div class="candle"></div></div>
  <h1>${escapeHtml(name)}</h1>
  ${details ? `<p class="details">${escapeHtml(details)}</p>` : ''}
  ${photoHtml ? `<div class="photos">${photoHtml}\n  </div>` : ''}
  <section class="words">
      ${textHtml}
  </section>
  ${itemHtml ? `<h2>On the ofrenda</h2>\n  <ul>${itemHtml}</ul>` : ''}
  <footer>Made${madeOn ? ' on ' + escapeHtml(madeOn) : ''} on my own computer with a local open model. Nothing was uploaded.</footer>
</main>
</body>
</html>
`;
  }

  const api = { buildOfrendaHtml, escapeHtml, safePhotoUrl, fileSlug };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Ofrenda = api;
})(typeof window !== 'undefined' ? window : globalThis);
