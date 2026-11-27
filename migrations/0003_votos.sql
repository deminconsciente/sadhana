-- Votos por horarios de clases nuevas (sección «Vota tu horario» de la página).
-- Una fila por persona y clase: si vuelve a votar, se actualizan sus días y horas.
-- El Worker también la crea sola la primera vez (CREATE TABLE IF NOT EXISTS en src/api.js).
CREATE TABLE IF NOT EXISTS votos (
  clase       TEXT NOT NULL,              -- id del directorio (yin, conciencia…)
  tel         TEXT NOT NULL,              -- solo dígitos
  titulo      TEXT,
  nombre      TEXT NOT NULL,
  dias        TEXT NOT NULL,              -- JSON [1,3] (0 domingo … 6 sábado)
  horas       TEXT NOT NULL,              -- JSON [7,19] (hora de inicio, 24 h)
  modalidad   TEXT,                       -- Presencial, En línea, Cualquiera
  acepta_comunidad INTEGER NOT NULL DEFAULT 0,
  creado      TEXT NOT NULL,
  actualizado TEXT NOT NULL,
  PRIMARY KEY (clase, tel)
);
