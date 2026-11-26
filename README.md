# sadhanaholistics.com

Sitio de Sadhana en un Cloudflare Worker, con el mismo flujo que www.deminconsciente.com:
**publicar = `git push` a `main`** (Cloudflare Workers Builds construye y publica en ~1 min).

## Páginas

| URL | Archivo |
|---|---|
| sadhanaholistics.com/ | `public/index.html` (landing oficial de Sadhana) |
| sadhanaholistics.com/om/ | `public/om/index.html` (El Poder del OM) |
| sadhanaholistics.com/reservar/ | enlace corto que abre la renta de la sala en el sitio (`/?renta=sala`), conservando los utm_* |
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
- Entrar: sadhanaholistics.com/entrar (o abre /equipo, /proyeccion o /admin y te lleva ahí). Tu nombre o correo + la clave maestra `ADMIN_CLAVE` (secreto del Worker) entra como administración; cada maestro entra con su usuario y clave propia (se crean en la pestaña Equipo). Queda una cookie firmada de 90 días que se renueva sola con el uso; /salir la borra. El formulario es normal, así que el navegador ofrece guardar la clave. Cambiar `ADMIN_CLAVE` cierra todas las sesiones de clave maestra; cambiar la clave de un maestro o desactivarlo cierra la suya. El acceso viejo por Basic Auth sigue funcionando (`src/sesion.js`).
- Local: `printf 'ADMIN_CLAVE=prueba\n' > .dev.vars && npx wrangler d1 migrations apply sadhana_crm --local && npm run dev`.

## Sala única y renta por hora (`src/sala.js`)

- Hay una sola sala. La sección **«Soy terapeuta»** de `public/index.html` (mismo flujo de reserva, datos, pago y ticket que el resto del sitio) pide la disponibilidad a `GET /api/sala/disponibilidad` y aparta con `POST /api/sala/reservar`. Cuentan como ocupado: clases (directorio activo + bloques base), eventos y bloqueos propios, terapias 1:1 y rentas apartadas, con 15 min de margen; lunes a viernes.
- El apartado es atómico en D1 (`sala_ocupacion`, migración `0005_sala.sql`; el Worker también la crea sola). Una renta pendiente libera la sala a las 24 h; cancelarla en /equipo la libera de inmediato.
- **Paquetes de horas**: se compran como reserva («Paquete de horas»); al confirmar el pago en /equipo se abre una membresía «Paquete N h de sala» (clases = horas). Al rentar, «Tengo un paquete de horas» descuenta de ahí con el mismo WhatsApp.
- **/equipo → Directorio → Sala y rentas** edita todo en el documento `_sala` (`proyeccion_docs`, col `catalogo`): precios por hora, bloque mensual, paquetes de horas, horario, fines de semana, días cerrados, bloqueos y eventos, clave del calendario. Lo público sale en `/api/catalogo` (`sala`).
- **Calendario** `GET /api/sala/calendario.ics?t=CLAVE`: se suscribe una vez en Google Calendar («Desde URL») y trae rentas, terapias, clases y eventos de la sala. Sin clave configurada responde 404.
- `salaKpis(env, desde, hasta)` (exportada) da horas libres, ocupación e ingreso por renta para el tablero de KPIs. El origen UTM de cada renta va en `reservas.utm`.
