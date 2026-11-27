-- Sala única de Sadhana: cada renta por hora (o evento privado) ocupa un rango del día.
-- Las clases fijas no viven aquí: salen del directorio (/equipo → Directorio) y de los bloques base de src/sala.js.
-- `a` y `b` son minutos desde la medianoche, hora de Monterrey. Una renta cancelada, o pendiente de pago
-- por más de 24 h, libera la sala (se cruza con `reservas.estado`).
CREATE TABLE IF NOT EXISTS sala_ocupacion (
  folio  TEXT PRIMARY KEY,           -- = reservas.folio
  fecha  TEXT NOT NULL,              -- YYYY-MM-DD
  a      INTEGER NOT NULL,           -- inicio, minutos desde las 0:00
  b      INTEGER NOT NULL,           -- fin, minutos desde las 0:00
  uso    TEXT,                       -- sesión 1:1, taller, ensayo…
  creado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sala_ocupacion_fecha ON sala_ocupacion(fecha);
