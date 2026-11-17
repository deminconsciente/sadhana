-- Reservas de sadhanaholistics.com. Cada ticket que emite la landing llega aquí.
CREATE TABLE IF NOT EXISTS reservas (
  folio       TEXT PRIMARY KEY,           -- SAD-XXXX-0000, lo genera la landing
  creado      TEXT NOT NULL,              -- ISO, hora del servidor
  tipo        TEXT,                       -- Clase, Terapia, Evento, Paquete…
  titulo      TEXT NOT NULL,
  ini         TEXT,                       -- fecha y hora de la cita (ISO) si aplica
  detalle     TEXT,                       -- JSON con los pares que muestra el ticket
  nombre      TEXT NOT NULL,
  tel         TEXT NOT NULL,              -- solo dígitos
  email       TEXT,
  monto       INTEGER NOT NULL DEFAULT 0, -- MXN
  metodo      TEXT,                       -- transferencia, credito, sin costo…
  estado      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente, confirmado, cancelado, asistio
  nota        TEXT,                       -- nota interna de Isa o Diego
  actualizado TEXT,
  acepta_privacidad INTEGER NOT NULL DEFAULT 0,
  acepta_comunidad  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reservas_creado ON reservas(creado);
CREATE INDEX IF NOT EXISTS reservas_ini ON reservas(ini);
CREATE INDEX IF NOT EXISTS reservas_tel ON reservas(tel);
