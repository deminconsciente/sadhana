-- CRM ligero de Sadhana. Vive junto a `reservas` (0001) sin cambiarla:
-- cada visita sigue siendo una fila de `reservas` (web o alta manual del equipo),
-- y estas tablas agregan a la persona, sus membresías y quién del equipo hizo qué.

-- Una ficha por persona. El teléfono (solo dígitos) es la llave que la liga con sus reservas.
CREATE TABLE IF NOT EXISTS alumnos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tel         TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  email       TEXT,
  origen      TEXT,                 -- web, manual, instagram, om, recomendación…
  etiquetas   TEXT,                 -- separadas por coma: yoga, om, terapia, residente…
  nota        TEXT,
  acepta_comunidad INTEGER NOT NULL DEFAULT 0,
  creado      TEXT NOT NULL,
  actualizado TEXT
);

-- Membresías y paquetes vendidos. `clases` NULL = ilimitada.
-- Las clases usadas se cuentan de `reservas` con metodo = 'membresia' dentro de la vigencia.
CREATE TABLE IF NOT EXISTS membresias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alumno_id   INTEGER NOT NULL REFERENCES alumnos(id),
  plan        TEXT NOT NULL,        -- "Membresía ilimitada 6 meses", "Paquete 8 clases"…
  inicio      TEXT NOT NULL,        -- YYYY-MM-DD
  fin         TEXT NOT NULL,        -- YYYY-MM-DD (incluido)
  clases      INTEGER,
  monto       INTEGER NOT NULL DEFAULT 0,
  metodo      TEXT,
  estado      TEXT NOT NULL DEFAULT 'activa', -- activa, pausada, cancelada
  nota        TEXT,
  registrado_por TEXT,
  creado      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS membresias_alumno ON membresias(alumno_id);
CREATE INDEX IF NOT EXISTS membresias_fin ON membresias(fin);

-- Personas del equipo que entran al panel /equipo con usuario y clave propios.
-- (La clave maestra ADMIN_CLAVE sigue entrando como administrador.)
CREATE TABLE IF NOT EXISTS equipo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario     TEXT NOT NULL UNIQUE, -- en minúsculas: diane, isa, diego
  nombre      TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'maestro', -- maestro, admin
  clave_hash  TEXT NOT NULL,        -- PBKDF2-SHA256, nunca la clave
  activo      INTEGER NOT NULL DEFAULT 1,
  creado      TEXT NOT NULL
);

-- Datos del CRM por reserva: quién la dio de alta, quién da la clase
-- y la confirmación de asistencia que el cliente responde en línea.
CREATE TABLE IF NOT EXISTS reserva_crm (
  folio       TEXT PRIMARY KEY,     -- = reservas.folio
  origen      TEXT NOT NULL DEFAULT 'web', -- web, manual
  registrado_por TEXT,
  maestro     TEXT,
  token       TEXT UNIQUE,          -- para /confirmar/?f=FOLIO&t=TOKEN
  asistencia  TEXT,                 -- NULL, confirmada, no_ira
  recordado   TEXT,                 -- cuándo se mandó el recordatorio
  respondido  TEXT
);
