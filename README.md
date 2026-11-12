# sadhanaholistics.com

Sitio de Sadhana en un Cloudflare Worker, con el mismo flujo que www.deminconsciente.com:
**publicar = `git push` a `main`** (Cloudflare Workers Builds construye y publica en ~1 min).

## Páginas

| URL | Archivo |
|---|---|
| sadhanaholistics.com/ | `public/index.html` (landing oficial de Sadhana) |
| sadhanaholistics.com/om/ | `public/om/index.html` (El Poder del OM) |
| audio de la prueba | `public/audios/om-prueba-1min.mp3` |
| recursos compartidos | `public/assets/` (Glacial Indifference, logo secundario, sello, foto de velas) |

Página nueva = carpeta nueva en `public/` con su `index.html` (ej. `public/residencia/index.html` → `/residencia/`).
www.sadhanaholistics.com redirige al dominio sin www. Los audios pasan por `src/range.js`
para responder 206, porque Safari no reproduce audio sin Range.

## Workers Builds (configuración en el dashboard)

- Repositorio: este, rama `main`. Directorio raíz: `/`
- Build: `npm ci` · Deploy: `npm run deploy` · Ramas que no son main: `npm run preview`

## Correo (Google Workspace): NO BORRAR estos registros DNS

- MX `@` → `smtp.google.com` (prioridad 1)
- TXT `@` → `v=spf1 include:_spf.google.com ~all`
- TXT `google._domainkey` → `v=DKIM1; k=rsa; p=…` (DKIM de Workspace)
- Cualquier TXT `google-site-verification=…` y `_dmarc` si existen
- Todos en "DNS only" (nube gris).

Los A de Squarespace (198.185.159.144/145, 198.49.23.144/145) y el CNAME `www → ext-sq.squarespace.com`
se borran: los reemplazan los dominios personalizados del Worker.

## Probar en local

`npm install && npm run dev` → http://localhost:8787 · `npm run check` = dry-run del deploy.
