-- Datos para la muestra en vivo del coloquio.
--
-- Deja la red armada (organizaciones y un usuario por perfil) y cuatro
-- emergencias REGISTRADAS con sus lotes ya cargados, una por cada curso de
-- accion que hay que mostrar. Cada una arranca su caso en Bonita al publicar
-- la convocatoria, asi que no hace falta tocar el motor de antemano.
--
--   1. Camino feliz            los lotes se cubren completos
--   2. Reabrir convocatoria    la primera ronda no alcanza, se reabre igual
--   3. Reformular lotes        un lote pide mas de lo que hay en el pais
--   4. Cobertura parcial       se sigue con lo que se consiguio
--
-- Los codigos nacionales, las certificaciones y el stock son los del seed del
-- Sistema Nacional: las cantidades de cada lote estan pensadas para que el
-- compromiso entre en el stock disponible.
--
-- Es idempotente: si los datos ya estan (por el seed o por una corrida
-- anterior) no se duplican. Contrasena de todos los usuarios: Rescue2026!

DO $$
DECLARE
  -- bcrypt de 'Rescue2026!', la misma contrasena que usa prisma/seed.ts
  clave CONSTANT TEXT := '$2a$10$/xOmDJdzgMeBFS9eYTijp.8f/WDA5BnJOP/y2mNYmQWlXNEVgNpVm';
  municipio_id INT;
  operador_id  INT;
  emergencia_id INT;
BEGIN
  -- ------------------------------------------------------------------
  -- Organizaciones
  -- ------------------------------------------------------------------
  INSERT INTO "organizaciones"
    ("nombre", "tipo", "cuit", "codigo_nacional", "email_contacto", "localidad", "provincia", "fecha_actualizacion")
  VALUES
    ('Municipalidad de Villa Carlos Paz', 'MUNICIPIO', '30700000001', NULL,
     'defensacivil@carlospaz.gob.ar', 'Villa Carlos Paz', 'Cordoba', now()),
    ('Cruz Solidaria', 'ONG', '30700000002', 'ONG-0001',
     'contacto@cruzsolidaria.org', 'Cordoba', 'Cordoba', now()),
    ('Bomberos Voluntarios de Cosquin', 'ORGANISMO_RESCATE', '30700000003', 'ORG-0002',
     'guardia@bvcosquin.org.ar', 'Cosquin', 'Cordoba', now()),
    ('Centro Coordinador Regional Centro', 'CENTRO_COORDINADOR', '30700000004', NULL,
     NULL, 'Cordoba', 'Cordoba', now()),
    -- Certificaciones de nivel bajo y una vencida en el Sistema Nacional: sus
    -- lineas vuelven como APOYO_SECUNDARIO.
    ('Red Solidaria Sierras Chicas', 'ONG', '30700000005', 'ONG-0003',
     'info@redsierraschicas.org', 'Rio Ceballos', 'Cordoba', now()),
    -- SUSPENDIDA en el Sistema Nacional: todo lo que oferte es apoyo secundario.
    ('Manos Unidas Punilla', 'ONG', '30700000006', 'ONG-0004',
     'contacto@manosunidaspunilla.org', 'La Falda', 'Cordoba', now())
  ON CONFLICT DO NOTHING;

  -- ------------------------------------------------------------------
  -- Usuarios: uno por perfil, y uno por cada ONG para armar consorcios
  -- ------------------------------------------------------------------
  INSERT INTO "usuarios"
    ("email", "password", "nombre_completo", "telefono", "rol", "organizacion_id", "fecha_actualizacion")
  SELECT u.email, clave, u.nombre, u.telefono, u.rol::"Rol", o."id", now()
  FROM (VALUES
    ('municipio@rescuesync.ar',   'Laura Fernandez', '+54 9 351 555-0001', 'OPERADOR_MUNICIPAL', 'Municipalidad de Villa Carlos Paz'),
    ('coordinador@rescuesync.ar', 'Martin Sosa',     '+54 9 351 555-0002', 'CENTRO_COORDINADOR', NULL),
    ('ong@rescuesync.ar',         'Ana Diaz',        '+54 9 351 555-0003', 'REPRESENTANTE_ONG',  'Cruz Solidaria'),
    ('auditor@rescuesync.ar',     'Jorge Medina',    '+54 9 351 555-0004', 'AUDITOR',            NULL),
    ('bomberos@rescuesync.ar',    'Carlos Peralta',  '+54 9 351 555-0005', 'REPRESENTANTE_ONG',  'Bomberos Voluntarios de Cosquin'),
    ('redsolidaria@rescuesync.ar','Sofia Gimenez',   '+54 9 351 555-0006', 'REPRESENTANTE_ONG',  'Red Solidaria Sierras Chicas'),
    ('manosunidas@rescuesync.ar', 'Pablo Ruiz',      '+54 9 351 555-0007', 'REPRESENTANTE_ONG',  'Manos Unidas Punilla')
  ) AS u(email, nombre, telefono, rol, organizacion)
  LEFT JOIN "organizaciones" o ON o."nombre" = u.organizacion
  ON CONFLICT DO NOTHING;

  -- ------------------------------------------------------------------
  -- Emergencias REGISTRADAS con sus lotes, una por curso de accion
  -- ------------------------------------------------------------------
  SELECT "id" INTO municipio_id FROM "organizaciones" WHERE "nombre" = 'Municipalidad de Villa Carlos Paz';
  SELECT "id" INTO operador_id  FROM "usuarios"       WHERE "email"  = 'municipio@rescuesync.ar';

  -- 1. Camino feliz. Cruz Solidaria y los Bomberos en consorcio cubren todo.
  IF NOT EXISTS (SELECT 1 FROM "emergencias" WHERE "zona_afectada" = '[DEMO 1] Barrio La Costanera, margen del rio San Antonio') THEN
    INSERT INTO "emergencias"
      ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
       "municipio_id", "registrada_por_id", "fecha_actualizacion")
    VALUES
      ('INUNDACION', 'ALTA', '[DEMO 1] Barrio La Costanera, margen del rio San Antonio',
       'Crecida del rio tras 48 horas de lluvia. 120 viviendas anegadas y corte del acceso norte. '
       'Se necesita evacuar y asistir a las familias en el polideportivo municipal.',
       450, now() - interval '1 day', municipio_id, operador_id, now())
    RETURNING "id" INTO emergencia_id;

    INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_actualizacion")
    VALUES
      (emergencia_id, 'PERSONAL',               'Rescatistas y paramedicos para la evacuacion', 8,    'personas',  now()),
      (emergencia_id, 'ALIMENTOS',              'Raciones de comida no perecedera',              1500, 'raciones',  now()),
      (emergencia_id, 'ABRIGO_Y_REFUGIO',       'Frazadas para el centro de evacuados',          100,  'frazadas',  now()),
      (emergencia_id, 'TRANSPORTE_Y_LOGISTICA', 'Vehiculos 4x4 para el traslado',                2,    'vehiculos', now());
  END IF;

  -- 2. Reabrir. En la primera ronda solo ofertan los Bomberos (10 brigadistas)
  --    y nadie el agua. Al reabrir con los mismos lotes completan Cruz
  --    Solidaria (10 brigadistas) y Red Solidaria (agua).
  IF NOT EXISTS (SELECT 1 FROM "emergencias" WHERE "zona_afectada" = '[DEMO 2] Faldeo de las Sierras Chicas, Rio Ceballos') THEN
    INSERT INTO "emergencias"
      ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
       "municipio_id", "registrada_por_id", "fecha_actualizacion")
    VALUES
      ('INCENDIO', 'MEDIA', '[DEMO 2] Faldeo de las Sierras Chicas, Rio Ceballos',
       'Incendio forestal con frente activo de 3 km avanzando hacia la zona de quintas. '
       'Se requieren brigadistas y agua para las lineas de defensa.',
       80, now() - interval '6 hours', municipio_id, operador_id, now())
    RETURNING "id" INTO emergencia_id;

    INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_actualizacion")
    VALUES
      (emergencia_id, 'PERSONAL',     'Brigadistas forestales',               20,   'personas', now()),
      (emergencia_id, 'AGUA_POTABLE', 'Agua para hidratacion de brigadistas', 3000, 'litros',   now());
  END IF;

  -- 3. Reformular. Se piden 8000 raciones y en todo el pais hay 5250: ninguna
  --    combinacion de ofertas cubre el lote. El Coordinador lo baja a lo que
  --    se ofrecio (por ejemplo 3000) y relanza.
  IF NOT EXISTS (SELECT 1 FROM "emergencias" WHERE "zona_afectada" = '[DEMO 3] Barrios del oeste de Villa Carlos Paz') THEN
    INSERT INTO "emergencias"
      ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
       "municipio_id", "registrada_por_id", "fecha_actualizacion")
    VALUES
      ('TORMENTA_SEVERA', 'MEDIA', '[DEMO 3] Barrios del oeste de Villa Carlos Paz',
       'Tormenta con granizo y rafagas de 100 km/h. Techos volados y cortes de luz en 6 barrios. '
       'Familias sin poder cocinar ni calefaccionarse.',
       900, now() - interval '12 hours', municipio_id, operador_id, now())
    RETURNING "id" INTO emergencia_id;

    INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_actualizacion")
    VALUES
      (emergencia_id, 'ALIMENTOS',        'Raciones calientes y viandas', 8000, 'raciones', now()),
      (emergencia_id, 'ABRIGO_Y_REFUGIO', 'Frazadas',                     150,  'frazadas', now());
  END IF;

  -- 4. Cobertura parcial. Los Bomberos cubren personal y equipamiento; de
  --    medicamentos solo hay una oferta chica de Red Solidaria (certificacion
  --    vencida: apoyo secundario). El Coordinador sigue con lo que hay.
  IF NOT EXISTS (SELECT 1 FROM "emergencias" WHERE "zona_afectada" = '[DEMO 4] Ruta 38, acceso a Cosquin') THEN
    INSERT INTO "emergencias"
      ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
       "municipio_id", "registrada_por_id", "fecha_actualizacion")
    VALUES
      ('DESLIZAMIENTO', 'BAJA', '[DEMO 4] Ruta 38, acceso a Cosquin',
       'Deslizamiento de tierra sobre la ruta y dos casas afectadas. Hay que despejar la calzada '
       'y atender a los vecinos evacuados en la escuela.',
       25, now() - interval '3 hours', municipio_id, operador_id, now())
    RETURNING "id" INTO emergencia_id;

    INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_actualizacion")
    VALUES
      (emergencia_id, 'PERSONAL',     'Operarios para despejar la calzada', 6,   'personas', now()),
      (emergencia_id, 'EQUIPAMIENTO', 'Motosierras y equipos de corte',     4,   'unidades', now()),
      (emergencia_id, 'MEDICAMENTOS', 'Botiquines e insumos sanitarios',    500, 'unidades', now());
  END IF;
END $$;
