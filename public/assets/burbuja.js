/* Burbuja flotante de Sadhana: sello + insignia de WhatsApp, abajo a la derecha.
   Al tocarla abre un mini menú: mensaje directo, comunidad y redes (con ubicación
   como ícono). Para agregar una red o el enlace de la comunidad, edita CONTACTO. Se incluye con
   una etiqueta script con src="/assets/burbuja.js" (defer) en cualquier página.
   Reglas: aparece al bajar o a los pocos segundos, se coloca encima de cualquier barra fija
   inferior (.dock) y se esconde mientras hay un flujo o práctica abiertos. */
(() => {
  const CONTACTO = {
    whatsapp: '528115458500', // WhatsApp Business de Sadhana (81 1545 8500)
    comunidad: 'https://chat.whatsapp.com/E3bSUz1NS2P48ZwU0xkWtv', // Enlace de la Comunidad de WhatsApp. Vacío = aparece como «Pronto».
    redes: [                  // Las que no tengan url no se muestran.
      { red: 'instagram', nombre: 'Instagram', url: 'https://www.instagram.com/sadhana.holistics/' },
      { red: 'facebook', nombre: 'Facebook', url: '' },
      { red: 'tiktok', nombre: 'TikTok', url: '' },
      { red: 'youtube', nombre: 'YouTube', url: '' },
      { red: 'mapa', nombre: 'Ubicación', url: 'https://maps.app.goo.gl/vaXKCNu2pZtEAvrr9' },
    ],
  };
  const WA = CONTACTO.whatsapp;
  const enOM = location.pathname.startsWith('/om');
  const msg = enOM
    ? 'Hola, vengo de la página de El Poder del OM y me gustaría recibir información.'
    : 'Hola, vengo de la página de Sadhana y me gustaría recibir información.';
  const waUrl = `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

  const css = `
.sb{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:var(--sb-b,calc(18px + env(safe-area-inset-bottom,0px)));z-index:45;
  display:flex;flex-direction:column;align-items:flex-end;gap:12px;font-family:"Glacial Indifference",system-ui,sans-serif;
  transition:opacity .35s ease,transform .35s ease,bottom .3s ease}
.sb.oculta{opacity:0;transform:translateY(16px) scale(.9);pointer-events:none}
.sb-fab{position:relative;width:62px;height:62px;border-radius:50%;border:0;padding:0;cursor:pointer;
  background:radial-gradient(120% 120% at 30% 20%,#d79a6a 0%,#a45a2a 52%,#7a2f3c 100%);
  box-shadow:0 0 0 2px rgba(255,240,226,.55),0 0 0 6px rgba(201,135,90,.18),0 14px 30px -10px rgba(60,20,10,.7);
  display:grid;place-items:center;-webkit-tap-highlight-color:transparent;transition:transform .2s ease}
.sb-fab:hover{transform:scale(1.05)}
.sb-fab:focus-visible{outline:2px solid #fff;outline-offset:4px}
.sb-fab img{width:44px;height:44px;object-fit:contain;transition:transform .4s ease}
.sb-fab::before{content:"";position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(236,196,160,.55);animation:sb-resp 10s cubic-bezier(.45,0,.35,1) infinite}
@keyframes sb-resp{0%,100%{transform:scale(1);opacity:.25}40%{transform:scale(1.14);opacity:.8}}
.sb-wa{position:absolute;right:-3px;bottom:-3px;width:24px;height:24px;border-radius:50%;background:#25d366;display:grid;place-items:center;
  box-shadow:0 0 0 2px #fff4ea,0 4px 10px rgba(0,0,0,.3);transition:opacity .2s}
.sb-wa svg{width:14px;height:14px;fill:#fff}
.sb-x{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:28px;line-height:1;opacity:0;transition:opacity .2s}
.sb.abierta .sb-fab img{transform:rotate(90deg) scale(.6);opacity:0}
.sb.abierta .sb-wa{opacity:0}
.sb.abierta .sb-x{opacity:1}
.sb-menu{width:min(300px,calc(100vw - 32px));padding:16px;border-radius:24px;color:#fff4ea;
  background:rgba(48,22,14,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border:1px solid rgba(255,240,226,.22);box-shadow:0 22px 50px -18px rgba(0,0,0,.7);
  display:grid;gap:10px;transform-origin:100% 100%;transition:opacity .25s ease,transform .25s ease}
.sb:not(.abierta) .sb-menu{opacity:0;transform:translateY(8px) scale(.94);pointer-events:none;visibility:hidden}
.sb-menu p{margin:0 4px 4px;font-size:.95rem;line-height:1.35;color:rgba(255,240,226,.85)}
.sb-menu p b{display:block;font-size:1.05rem;color:#fff;letter-spacing:.02em}
.sb-menu a{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:.9rem;white-space:nowrap;
  color:#fff;background:rgba(255,240,226,.1);border:1px solid rgba(255,240,226,.24);transition:background .2s}
.sb-menu a:hover{background:rgba(255,240,226,.2)}
.sb-menu a.p{background:linear-gradient(100deg,#c9875a,#a45a2a 60%,#8f4a25);border-color:transparent}
.sb-menu a svg,.sb-menu .sb-off svg{width:18px;height:18px;flex:none;fill:currentColor}
.sb-off{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 18px;border-radius:999px;font-weight:700;font-size:.9rem;
  color:rgba(255,240,226,.55);border:1px dashed rgba(255,240,226,.24)}
.sb-off small{margin-left:auto;font-weight:700;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(255,240,226,.12);color:rgba(255,240,226,.8)}
.sb-red{display:flex;justify-content:space-around;gap:6px;margin-top:4px;padding-top:12px;border-top:1px solid rgba(255,240,226,.16)}
.sb-menu .sb-red a{flex-direction:column;justify-content:center;gap:5px;min-height:0;padding:0;border:0;background:none;font-size:.72rem;font-weight:400;color:rgba(255,240,226,.85)}
.sb-menu .sb-red a span{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,240,226,.1);border:1px solid rgba(255,240,226,.24);transition:background .2s,transform .2s}
.sb-menu .sb-red a:hover{background:none}
.sb-menu .sb-red a:hover span{background:rgba(255,240,226,.22);transform:translateY(-2px)}
.sb-menu .sb-red svg{width:20px;height:20px}
body.lock .sb,body.practicando .sb{opacity:0;pointer-events:none}
@media (prefers-reduced-motion:reduce){.sb-fab::before{animation:none}.sb,.sb-menu,.sb-fab img{transition:none}}
@media print{.sb{display:none}}`;

  const icoWA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3Z"/></svg>';
  const icoMapa = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';

  const icoCom = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 13c-3.3 0-6 1.7-6 4v2h12v-2c0-2.3-2.7-4-6-4Zm7.5.3c-.6 0-1.2.1-1.7.2 1.3.9 2.2 2.1 2.2 3.5v2h5v-2c0-2-2.5-3.7-5.5-3.7Z"/></svg>';
  const ICO = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21.9 8c0-1.6-.4-3-1.6-4.2C19.1 2.6 17.6 2.2 16 2.1 14.4 2 9.6 2 8 2.1c-1.6.1-3 .5-4.2 1.7C2.6 4.9 2.2 6.4 2.1 8 2 9.6 2 14.4 2.1 16c.1 1.6.5 3 1.7 4.2 1.2 1.2 2.6 1.6 4.2 1.7 1.6.1 6.4.1 8 0 1.6-.1 3-.5 4.2-1.7 1.2-1.2 1.6-2.6 1.7-4.2.1-1.6.1-6.4 0-8Zm-2 9.8a3.3 3.3 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.7.4s-4.4.1-5.7-.4a3.3 3.3 0 0 1-1.8-1.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.4.4-5.7a3.3 3.3 0 0 1 1.8-1.8C6 4.1 9 4.2 12 4.2s4.4-.1 5.7.4c.8.3 1.5 1 1.8 1.8.5 1.3.4 4.3.4 5.7s.1 4.4-.4 5.7Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3C16.7 2.2 15.6 2 14.4 2 11.8 2 10 3.6 10 6.5v2H7.3v3.6H10V22h4v-9.9h2.9l.4-3.6H14Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 8.3a6.5 6.5 0 0 1-3.8-1.2v5.6a5.4 5.4 0 1 1-4.7-5.4v2.9a2.6 2.6 0 1 0 1.8 2.5V2h2.9a3.8 3.8 0 0 0 3.8 3.4v2.9Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"/></svg>',
    mapa: icoMapa,
  };

  function init() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    const sb = document.createElement('div');
    sb.className = 'sb oculta';
    sb.innerHTML = `
      <div class="sb-menu" id="sbMenu" role="dialog" aria-label="Contacto Sadhana">
        <p><b>Sādhana</b>¿En qué te acompañamos? Te respondemos personalmente.</p>
        <a class="p" href="${waUrl}" target="_blank" rel="noopener">${icoWA}Mensaje directo</a>
        ${CONTACTO.comunidad
          ? `<a href="${CONTACTO.comunidad}" target="_blank" rel="noopener">${icoCom}Únete a la comunidad</a>`
          : `<div class="sb-off" aria-disabled="true">${icoCom}Comunidad<small>Pronto</small></div>`}
        <nav class="sb-red" aria-label="Redes de Sadhana">${CONTACTO.redes.filter((r) => r.url).map((r) =>
          `<a href="${r.url}" target="_blank" rel="noopener" aria-label="${r.nombre}"><span>${ICO[r.red] || ''}</span>${r.nombre}</a>`).join('')}</nav>
      </div>
      <button class="sb-fab" type="button" aria-expanded="false" aria-controls="sbMenu" aria-label="Contacto Sadhana">
        <img src="/assets/img/sello-ojo.png" alt="" width="44" height="44">
        <span class="sb-wa">${icoWA}</span>
        <span class="sb-x" aria-hidden="true">×</span>
      </button>`;
    document.body.appendChild(sb);

    const fab = sb.querySelector('.sb-fab');
    const toggle = (abrir) => {
      sb.classList.toggle('abierta', abrir);
      fab.setAttribute('aria-expanded', String(abrir));
    };
    fab.addEventListener('click', (e) => { e.stopPropagation(); toggle(!sb.classList.contains('abierta')); });
    sb.querySelectorAll('.sb-menu a').forEach((a) => a.addEventListener('click', () => toggle(false)));
    document.addEventListener('click', (e) => { if (!sb.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

    // Posición: encima de cualquier barra fija inferior visible; aparece al hacer scroll o tras 3.5 s.
    let pend = false, listo = false;
    setTimeout(() => { listo = true; pedir(); }, 3500); // aparece tras unos segundos o al hacer scroll
    const ajustar = () => {
      pend = false;
      const vh = innerHeight;
      let alto = 0;
      // Barras fijas de abajo (.dock) y el botón de Opciones si cae en la esquina derecha.
      document.querySelectorAll('.dock, .opt-fab').forEach((d) => {
        const cs = getComputedStyle(d);
        if (cs.display === 'none' || cs.visibility === 'hidden' || d.hidden) return;
        const r = d.getBoundingClientRect();
        if (r.height && r.top < vh - 2 && r.right > innerWidth - 100) alto = Math.max(alto, vh - r.top);
      });
      sb.style.setProperty('--sb-b', alto ? `${Math.round(alto + 12)}px` : 'calc(18px + env(safe-area-inset-bottom,0px))');
      const visible = listo || scrollY > vh * 0.5;
      sb.classList.toggle('oculta', !visible);
      if (!visible) toggle(false);
    };
    const pedir = () => { if (!pend) { pend = true; requestAnimationFrame(ajustar); } };
    addEventListener('scroll', pedir, { passive: true });
    addEventListener('resize', pedir);
    // La barra de /om entra con transición: re-medir cuando termina.
    document.addEventListener('transitionend', (e) => { if (e.target.classList && e.target.classList.contains('dock')) pedir(); });
    ajustar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
