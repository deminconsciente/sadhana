-- Origen del contacto (UTM, fbclid, referrer) que manda la landing con cada reserva.
-- JSON: {"utm_source":"instagram","utm_medium":"paid","utm_campaign":"enero",...}
ALTER TABLE reservas ADD COLUMN utm TEXT;
