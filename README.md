# sadhanaholistics.com

Sitio de Sadhana en un Cloudflare Worker, con el mismo flujo que www.deminconsciente.com:
**publicar = `git push` a `main`** (Cloudflare Workers Builds construye y publica en ~1 min).

## Páginas

| URL | Archivo |
|---|---|
| sadhanaholistics.com/ | `public/index.html` (landing oficial de Sadhana) |
| sadhanaholistics.com/om/ | `public/om/index.html` (El Poder del OM) |
| sadhanaholistics.com/reservar/ | `public/reservar/index.html` (reserva del espacio: clase o evento, y renta de la sala por hora con disponibilidad real) |
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

## Reservas, CRM y panel del equipo (base D1 `sadhana_crm`)

| URL | Para quién | Archivo |
|---|---|---|
| /equipo | Diego, Isa, Diane y quien tenga acceso: agenda del día, pagos por verificar, alta manual, fichas de alumno, membresías y accesos | `src/equipo.html` + `src/crm.js` |
| /confirmar/?f=FOLIO&t=TOKEN | El cliente confirma o avisa que no va (el enlace sale del botón "Pedir confirmación") | `public/confirmar/index.html` |
| /admin | Panel anterior de reservas (solo clave maestra) | `src/admin.html` + `src/api.js` |
| /api/crm/resumen?mes=YYYY-MM | Números del mes para Proyección Sadhana (solo administración) | `src/crm.js` |

- Esquema: `migrations/0001_reservas.sql` y `0002_crm.sql`. Cada visita es una fila de `reservas`; las fichas (`alumnos`) se ligan por teléfono.
- Entrar: usuario `admin` (o tu nombre) + la clave maestra `ADMIN_CLAVE` (secreto del Worker). Desde la pestaña Equipo se crean usuarios con clave propia para cada maestro.
- Local: `printf 'ADMIN_CLAVE=prueba\n' > .dev.vars && npx wrangler d1 migrations apply sadhana_crm --local && npm run dev`.

## Sala única y renta por hora (`src/sala.js`)

- Hay una sola sala. `/reservar/` pinta, por día, las clases (directorio activo + bloques base de `BASE.bloques`), los eventos y las rentas ya apartadas, y solo deja rentar lo libre (con 15 min de margen entre bloques, de lunes a viernes).
- `GET /api/sala/disponibilidad` y `POST /api/sala/reservar`. El apartado es atómico en D1 (`sala_ocupacion`, migración `0005_sala.sql`; el Worker también la crea sola). Una renta pendiente libera la sala a las 24 h; cancelarla en /equipo la libera de inmediato.
- Lo editable (precio por hora, horario, bloques extra, eventos de fin de semana, días cerrados, `rentaFinSemana`) vive en `proyeccion_docs` (col `catalogo`, id `_sala`); lo que falte usa `BASE`. El precio de $400/h es un supuesto (competencia: $380–$420).
- `salaKpis(env, desde, hasta)` (exportada en `src/sala.js`) da horas libres, ocupación e ingreso por renta para el tablero de KPIs. El origen UTM de cada renta se guarda en `reservas.utm`, igual que las demás reservas.
