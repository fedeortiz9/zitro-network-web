function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRefPage(rawCode) {
  const safeCode = escapeHtml(rawCode);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fuiste invitado a Zitro Network</title>
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2307080a'/%3E%3Ctext x='16' y='23' font-family='Arial, sans-serif' font-weight='700' font-size='18' fill='%23dcfc04' text-anchor='middle'%3EZ%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#07080a;
  --bg-elev:#101216;
  --fg:#f3f4ef;
  --fg-muted:#9a9d97;
  --accent:#dcfc04;
  --border:rgba(255,255,255,.08);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg);
  color:var(--fg);
  font-family:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
  min-height:100dvh;
  display:flex;
  flex-direction:column;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}
.site-header{
  display:flex;align-items:center;
  padding:1.25rem clamp(1.5rem,5vw,4rem);
  border-bottom:1px solid var(--border);
}
.wordmark{font-weight:700;letter-spacing:-.02em;font-size:1.05rem}
.wordmark span{color:var(--accent);margin-left:.15em;font-weight:500;letter-spacing:.05em}
.ref-page{
  flex:1;display:flex;align-items:center;justify-content:center;
  padding:clamp(2rem,6vw,4rem) 1.5rem;
}
.ref-card{
  max-width:480px;width:100%;
  border:1px solid var(--border);border-radius:28px;
  background:var(--bg-elev);
  padding:clamp(2rem,5vw,3rem);
  box-shadow:0 20px 40px -15px rgba(0,0,0,.4);
  animation:fadeUp .6s cubic-bezier(.16,1,.3,1) both;
}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(14px)}
  to{opacity:1;transform:translateY(0)}
}
@media (prefers-reduced-motion:reduce){
  .ref-card{animation:none}
}
.ref-card .eyebrow{
  display:inline-block;color:var(--accent);font-size:.8rem;
  text-transform:uppercase;letter-spacing:.15em;font-weight:500;
  margin-bottom:1rem;
}
.ref-card h1{font-size:clamp(1.5rem,4vw,2rem);letter-spacing:-.02em;line-height:1.15;margin:0 0 .75rem}
.ref-card .lead{color:var(--fg-muted);line-height:1.6;margin:0 0 1.75rem;font-size:.95rem}
.ref-code-box{
  display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;
  padding:1rem 1.25rem;border:1px dashed var(--border);border-radius:16px;
  margin-bottom:1.75rem;
}
.ref-code{
  font-family:'Space Grotesk',monospace;font-size:1.1rem;font-weight:700;
  letter-spacing:.05em;color:var(--accent);word-break:break-all;flex:1;
}
.ref-actions{display:flex;gap:.75rem;flex-wrap:wrap}
.btn{
  display:inline-flex;align-items:center;justify-content:center;
  padding:.85rem 1.5rem;border-radius:999px;font-size:.9rem;font-weight:500;
  border:1px solid var(--border);cursor:pointer;white-space:nowrap;
  transition:transform .2s cubic-bezier(.16,1,.3,1),background .3s,border-color .3s;
}
.btn:active{transform:scale(.97)}
.btn-accent{background:var(--accent);color:#07080a;border-color:var(--accent)}
.btn-accent:hover{background:#c8e604}
.btn-ghost{background:transparent;color:var(--fg)}
.btn-ghost:hover{border-color:rgba(255,255,255,.25)}
.site-footer{
  border-top:1px solid var(--border);
  padding:2rem clamp(1.5rem,5vw,4rem);
  display:flex;flex-wrap:wrap;gap:1rem;
  align-items:center;justify-content:space-between;
  color:var(--fg-muted);font-size:.85rem;
}
.site-footer nav{display:flex;gap:1.5rem;flex-wrap:wrap}
.site-footer nav a{color:var(--fg-muted);transition:color .3s cubic-bezier(.16,1,.3,1)}
.site-footer nav a:hover{color:var(--fg)}
</style>
</head>
<body>
<header class="site-header">
  <a class="wordmark" href="/">ZITRO<span>NETWORK</span></a>
</header>

<main class="ref-page">
  <section class="ref-card">
    <span class="eyebrow">Invitación</span>
    <h1>Fuiste invitado a Zitro Network.</h1>
    <p class="lead">La app estará disponible próximamente. Guardá tu código de referido para usarlo apenas puedas registrarte.</p>
    <div class="ref-code-box">
      <span class="ref-code" id="ref-code" data-code="${safeCode}">${safeCode}</span>
      <button type="button" id="copy-btn" class="btn btn-accent">Copiar código</button>
    </div>
    <div class="ref-actions">
      <a href="/" class="btn btn-ghost">Volver al inicio</a>
    </div>
  </section>
</main>

<footer class="site-footer">
  <p>© 2026 Zitro Network. Todos los derechos reservados.</p>
  <nav>
    <a href="https://fedeortiz9.github.io/zitro-privacy-policy/">Privacy Policy</a>
    <a href="URL_TERMS">Terms and Conditions</a>
    <a href="https://fedeortiz9.github.io/zitro-whitepaper/">Whitepaper</a>
  </nav>
</footer>

<script>
(function () {
  var btn = document.getElementById('copy-btn');
  var codeEl = document.getElementById('ref-code');
  if (!btn || !codeEl) return;
  btn.addEventListener('click', function () {
    var code = codeEl.dataset.code || codeEl.textContent;
    navigator.clipboard.writeText(code).then(function () {
      var original = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(function () { btn.textContent = original; }, 1500);
    });
  });
})();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ref/")) {
      let rawCode = url.pathname.slice("/ref/".length).replace(/\/+$/, "");
      try {
        rawCode = decodeURIComponent(rawCode);
      } catch {
        // deja rawCode tal cual si el porcentaje-encoding es inválido
      }
      rawCode = rawCode.slice(0, 64);

      if (rawCode) {
        return new Response(renderRefPage(rawCode), {
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
