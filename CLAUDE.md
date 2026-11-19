# CLAUDE.md · Sadhana

Contexto para cualquier sesión que trabaje en este repo (sitio sadhanaholistics.com y su backend).
Responder siempre en español. Lo técnico del deploy y del CRM está en `README.md`.

## Qué es Sadhana

Centro holístico en Satélite Acueducto, Monterrey (P.º del Acueducto 430, Local 18, Satélite Acueducto,
Sexto Sector, 64979 Monterrey, N.L.). Creado por Isa (Isabela Arciniega, lo creativo) y Diego (Demin
Consciente: estructura, organización y contenido). Diane es maestra de yoga. Posturalia (Diego y Fernando)
es aliado certificador: Agente Capacitador Externo STPS vía CELAM, con alcance en EC1375, EC0076 y EC0217.

Visión: Sadhana es una marca y un equipo, no un lugar. Debe sostenerse sola (egresados se vuelven
supervisores y formadores) y replicarse en LatAm con operación remota y automatizada.

- WhatsApp Business oficial: 81 1545 8500 (`528115458500`). Usarlo en todo el sitio.
- Ficha de Google Maps: https://maps.app.goo.gl/vaXKCNu2pZtEAvrr9 ("Cómo llegar" abre la ficha, no una búsqueda).

## Posicionamiento

Sadhana **no es un shala de yoga tradicional**: es un centro holístico con variedad de clases presenciales
de distintas disciplinas, más terapias y terapias de movimiento.

- **Hilo conductor:** "Todo lo que enseñamos sirve para regular tu sistema nervioso".
- **Por qué funciona:** el cuerpo no regula con una sola herramienta. Una persona con tensión crónica suele
  necesitar movimiento (fascia y sistema nervioso), respiración (tono vagal) y una intervención más suave
  (toque, sonido). Un centro con variedad ofrece esa progresión; un shala tradicional solo ofrece más yoga.

## Oferta

- **Catálogo de clases (en construcción):** yoga por categorías (embodiment, yin, vinyasa, la mezcla
  "yogasthenics"), pranayama, meditación en varias formas, chi kung, consciencia corporal, y más por sumar.
  La variedad es lo que hace atractiva la membresía ilimitada.
  Maestros de arranque: Melanie Valero (chi kung), Isa (yin yoga), Diego (yogasthenics y consciencia
  corpórea, métodos propios), Diane (yoga). Un horario por clase al inicio; se abren más por demanda.
- **Directorio:** clases activas + clases "Próximamente" con "Avísame cuando abra" (mide demanda).
- **Precio fundador:** precio especial de por vida mientras el pago sea recurrente y sin interrupción
  (cupo y reglas exactas por confirmar en el plan maestro).
- **Terapias 1:1:** Isa (reiki, craneosacral, tameana, sound healing, tarot terapéutico); Diego
  (biodescodificación, breathwork, hipnosis no clínica, coaching ontológico, PNL, transgeneracional).
- **Modalidades:** A) renta a terceros (residentes, renta por hora, facilitadores); B) servicios propios
  (sesiones, programas, clases grupales, sound healing, ceremonias); C) formación (talleres, formaciones,
  preparación EC1375, Residencia Sadhana de 6 meses, clínica escuela).
- **4 escuelas:** cuerpo y sistema nervioso; energía y símbolo; mente y lenguaje; linaje y transversal.
  Teoría en línea y asíncrona; prácticas en el espacio físico.
- **Paquetes de alumno:** máximo 3 opciones visibles (clase suelta, paquete, membresía ilimitada 3/6/9/12 meses).

## Modelo de clase: presencial + en línea + activo grabado

Toda clase es presencial y tiene versión asíncrona. Por cada clase:
1. Contenido en redes que muestra cómo se maneja la sesión.
2. Opción de "ampliar la sala" a en línea (en vivo) o versión grabada.
3. Una clase grabada profesional como activo digital, que además sirve de evidencia/preparación para que,
   con Posturalia, los maestros se certifiquen en **EC0217** (impartir cursos) y **EC0076** (evaluar con fines
   de certificación) y puedan dar formaciones. Según el taller aplica el EC correspondiente (p. ej. EC1375).

Operación diaria: una sala de Zoom recurrente por clase; celular dedicado o DJI Osmo en trípode fijo y dos
micrófonos DJI que se alternan (uno en uso, otro cargando). El curso grabado es de Sadhana y el maestro cobra
comisión permanente mientras se venda. Evento mensual fechado según quincenas y clase gratis semanal en
Parque Río La Silla. Plan maestro: https://claude.ai/artifact/ATAC9m6veK9DMQU653VgX6

## Embudo

1. Captación orgánica presencial (Parque Río La Silla) + contenido gratuito en Instagram, Facebook y TikTok.
2. A inscritos: terapias alternativas 1:1.
3. Invitación a talleres o certificaciones de esa terapia u otras, más el evento fijo de sábado y domingo.
4. Graduados pueden salir con EC adicionales: EC0217 (capital humano o en línea), EC0076, EC1375.

## Sitio web: reglas de producto

- **Directorio de clases (planeado):** dentro de la agenda, en carrusel horizontal; cada clase con maestro,
  descripción, horarios disponibles. Muy ordenado y atractivo. Los datos viven hoy en `CLASES`, `CATS`,
  `EVENTOS` y `TERAPEUTAS` dentro de `public/index.html`.
- Mobile first y lean: una idea por sección, secciones desplegables; lo que no tiene función se quita.
- Listas de tarjetas en celular: carrusel horizontal con la siguiente tarjeta asomándose.
- Diseño aprobado: paleta incienso con degradado ámbar→incienso y toque vino/rosa; letra Glacial
  Indifference (`public/assets/fonts`); foto de velas con fade; barras en píldora translúcida.
- Nunca dos botones de Reservar juntos. Nada fijo arriba en landings de evento.
- Un solo flujo de reserva y pago. El ticket dice "pendiente" hasta verificar el pago; nunca un
  "Confirmado" falso. Presencial: transferencia a Isa (Banorte, verificación manual). En línea: Stripe de
  Diego vía deminconsciente.com.
- Prueba social solo real y con su origen. Nunca inventar testimonios.
- Dirección idéntica en pie, Visítanos, calendario, legales y JSON-LD.

## Lenguaje aprobado

- Decir "certificado oficial SEP-CONOCER", no "egresado ante la SEP".
- Terapias complementarias: no diagnostican ni tratan enfermedades.
- Evitar frases vacías o motivacionales; preferir principios biológicos y datos concretos.

## Cómo se trabaja

- **Solo publicar con un "publica" explícito de Diego.** Se itera primero en artefacto o vista previa.
- Cambiar solo la página que se pidió (`/` o `/om`; aclarar si hay duda).
- PR en borrador por defecto. Push a `main` **no** despliega: tras el merge correr
  `CLOUDFLARE_ACCOUNT_ID=db07323b6cd94574774c89707b0b4edc npm run deploy` (token en los secretos del entorno).
- Secretos en el Worker o en el entorno, nunca en el repo ni en el chat. No borrar registros DNS de correo.
- Seguimiento del proyecto: todo pendiente se carga en el artefacto "Proyección Sadhana"
  (https://claude.ai/artifact/4aeMxGHHcb4cTkutGk22KP), pestaña "Pendientes y riesgos" y Cronograma.
- Cerrar cada entrega con propuestas de mejora y siguientes pasos ligados al objetivo.
