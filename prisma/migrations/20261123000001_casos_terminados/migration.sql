-- Casos ya terminados, para que el tablero de indicadores tenga que mostrar.
--
-- Cuatro emergencias FINALIZADAS y una CANCELADA, con todo lo que deja un caso
-- real al cerrarse: lotes, ofertas adjudicadas y no adjudicadas, consorcios,
-- lineas validadas con su caracter, historial de versiones, participantes que
-- marcaron su parte como finalizada y las notificaciones de cada etapa.
--
-- Las fechas son relativas al momento en que corre la migracion, asi el mes
-- actual y el anterior tienen datos:
--
--   H1  hace ~6 semanas   inundacion,  consorcio, cobertura total
--   H2  hace ~4 semanas   incendio,    dos ofertas individuales, total
--   H3  hace ~2 semanas   terremoto,   consorcio, cobertura PARCIAL
--   H4  hace ~1 semana    tormenta,    consorcio, cobertura total
--   H5  hace ~10 dias     cancelada antes de la convocatoria
--
-- Todos estan finalizados, asi que en el Sistema Nacional no queda nada
-- comprometido por ellos: la base local y la nacional siguen consistentes.
-- No tienen caso en Bonita (bonita_case_id NULL); los tiempos por etapa del
-- tablero salen de los casos que se corran de verdad contra el motor.
--
-- Depende de 20261123000000_datos_demo (organizaciones y usuarios). Es
-- idempotente: si ya hay emergencias [HISTORICO], no hace nada.

DO $$
DECLARE
  municipio_id INT; operador_id INT;
  cruz INT; bomberos INT; red INT;
  u_cruz INT; u_bomberos INT; u_red INT;
  e INT; l1 INT; l2 INT; l3 INT; o INT;
  base TIMESTAMP;
  ids INT[] := '{}';
BEGIN
  IF EXISTS (SELECT 1 FROM "emergencias" WHERE "zona_afectada" LIKE '[HISTORICO]%') THEN
    RETURN;
  END IF;

  SELECT "id" INTO municipio_id FROM "organizaciones" WHERE "nombre" = 'Municipalidad de Villa Carlos Paz';
  SELECT "id" INTO cruz         FROM "organizaciones" WHERE "codigo_nacional" = 'ONG-0001';
  SELECT "id" INTO bomberos     FROM "organizaciones" WHERE "codigo_nacional" = 'ORG-0002';
  SELECT "id" INTO red          FROM "organizaciones" WHERE "codigo_nacional" = 'ONG-0003';
  SELECT "id" INTO operador_id  FROM "usuarios" WHERE "email" = 'municipio@rescuesync.ar';
  SELECT "id" INTO u_cruz       FROM "usuarios" WHERE "email" = 'ong@rescuesync.ar';
  SELECT "id" INTO u_bomberos   FROM "usuarios" WHERE "email" = 'bomberos@rescuesync.ar';
  SELECT "id" INTO u_red        FROM "usuarios" WHERE "email" = 'redsolidaria@rescuesync.ar';

  IF municipio_id IS NULL OR cruz IS NULL OR bomberos IS NULL OR red IS NULL
     OR operador_id IS NULL OR u_cruz IS NULL OR u_bomberos IS NULL OR u_red IS NULL THEN
    RAISE NOTICE 'Faltan organizaciones o usuarios de la demo: no se cargan los casos terminados';
    RETURN;
  END IF;

  -- ==================================================================
  -- H1. Inundacion ALTA. Consorcio Cruz Solidaria + Bomberos, cobertura
  --     total. Red Solidaria tambien oferto y no fue elegida.
  -- ==================================================================
  base := now() - interval '45 days';

  INSERT INTO "emergencias"
    ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
     "estado", "fecha_cierre_convocatoria", "municipio_id", "registrada_por_id", "fecha_creacion", "fecha_actualizacion")
  VALUES
    ('INUNDACION', 'ALTA', '[HISTORICO] Barrio Villa del Lago',
     'Desborde del lago San Roque tras lluvias intensas. 200 familias evacuadas.',
     600, base, 'FINALIZADA', base + interval '2 days', municipio_id, operador_id,
     base + interval '2 hours', base + interval '12 days')
  RETURNING "id" INTO e;
  ids := ids || e;

  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'PERSONAL', 'Rescatistas acuaticos', 10, 'personas', base + interval '5 hours', base + interval '5 hours')
  RETURNING "id" INTO l1;
  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'ALIMENTOS', 'Raciones de comida', 2000, 'raciones', base + interval '5 hours', base + interval '5 hours')
  RETURNING "id" INTO l2;

  -- Oferta ganadora, en consorcio, editada una vez dentro de la ventana.
  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 2, 'Consorcio con Bomberos de Cosquin: ellos aportan los rescatistas.', cruz, u_cruz,
     base + interval '20 hours', base + interval '3 days', base + interval '12 hours', base + interval '12 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, cruz, true, true, base + interval '11 days'),
         (o, bomberos, false, true, base + interval '12 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l2, cruz, 2000, 'PRINCIPAL', 'Manipulacion de alimentos nivel 4 - habilitada hasta gravedad CRITICA'),
         (o, l1, bomberos, 10, 'PRINCIPAL', 'Rescate acuatico nivel 4 - habilitada hasta gravedad CRITICA');

  -- Oferta perdedora.
  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "motivo_no_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'NO_ADJUDICADA', 1, NULL, red, u_red, base + interval '30 hours',
     'El lote de rescatistas ya quedo cubierto por el consorcio.', base + interval '28 hours', base + interval '3 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider") VALUES (o, red, true);
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l1, red, 4, 'APOYO_SECUNDARIO', 'Primeros auxilios nivel 1 - habilitada hasta gravedad BAJA (la emergencia es ALTA)');

  -- ==================================================================
  -- H2. Incendio MEDIA. Dos ofertas individuales, cobertura total.
  -- ==================================================================
  base := now() - interval '28 days';

  INSERT INTO "emergencias"
    ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
     "estado", "fecha_cierre_convocatoria", "municipio_id", "registrada_por_id", "fecha_creacion", "fecha_actualizacion")
  VALUES
    ('INCENDIO', 'MEDIA', '[HISTORICO] Cerro La Cruz, Tanti',
     'Incendio de pastizales que llego a la zona de cabanas. Sin heridos.',
     40, base, 'FINALIZADA', base + interval '1 day', municipio_id, operador_id,
     base + interval '1 hour', base + interval '6 days')
  RETURNING "id" INTO e;
  ids := ids || e;

  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'PERSONAL', 'Brigadistas', 15, 'personas', base + interval '3 hours', base + interval '3 hours')
  RETURNING "id" INTO l1;
  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'AGUA_POTABLE', 'Agua para las lineas de defensa', 5000, 'litros', base + interval '3 hours', base + interval '3 hours')
  RETURNING "id" INTO l2;

  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 1, 'Dotacion completa con autobomba.', bomberos, u_bomberos,
     base + interval '8 hours', base + interval '30 hours', base + interval '7 hours', base + interval '6 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, bomberos, true, true, base + interval '5 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l1, bomberos, 15, 'PRINCIPAL', 'Rescate acuatico nivel 4 - habilitada hasta gravedad CRITICA');

  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 2, 'Camion cisterna propio.', red, u_red,
     base + interval '10 hours', base + interval '30 hours', base + interval '9 hours', base + interval '6 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, red, true, true, base + interval '6 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l2, red, 5000, 'PRINCIPAL', 'Potabilizacion y distribucion de agua nivel 2 - habilitada hasta gravedad MEDIA');

  -- ==================================================================
  -- H3. Terremoto CRITICA. Los medicamentos no se cubrieron y el
  --     Coordinador siguio con cobertura parcial.
  -- ==================================================================
  base := now() - interval '15 days';

  INSERT INTO "emergencias"
    ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
     "estado", "fecha_cierre_convocatoria", "municipio_id", "registrada_por_id", "fecha_creacion", "fecha_actualizacion")
  VALUES
    ('TERREMOTO', 'CRITICA', '[HISTORICO] Centro de Villa Carlos Paz',
     'Sismo de magnitud 5.8. Derrumbes parciales en edificios antiguos del centro.',
     1200, base, 'FINALIZADA', base + interval '1 day', municipio_id, operador_id,
     base + interval '1 hour', base + interval '10 days')
  RETURNING "id" INTO e;
  ids := ids || e;

  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'PERSONAL', 'Rescatistas en estructuras colapsadas', 12, 'personas', base + interval '2 hours', base + interval '2 hours')
  RETURNING "id" INTO l1;
  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'MEDICAMENTOS', 'Insumos sanitarios', 300, 'unidades', base + interval '2 hours', base + interval '2 hours')
  RETURNING "id" INTO l2;
  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'ABRIGO_Y_REFUGIO', 'Frazadas', 200, 'frazadas', base + interval '2 hours', base + interval '2 hours')
  RETURNING "id" INTO l3;

  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 1, 'Consorcio con Red Solidaria para los insumos sanitarios.', cruz, u_cruz,
     base + interval '9 hours', base + interval '2 days', base + interval '8 hours', base + interval '10 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, cruz, true, true, base + interval '9 days'),
         (o, red, false, true, base + interval '10 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l1, cruz, 6, 'APOYO_SECUNDARIO', 'Primeros auxilios nivel 3 - habilitada hasta gravedad ALTA (la emergencia es CRITICA)'),
         (o, l3, cruz, 200, 'APOYO_SECUNDARIO', 'Gestion de refugios y evacuados nivel 2 - habilitada hasta gravedad MEDIA (la emergencia es CRITICA)'),
         (o, l2, red, 150, 'APOYO_SECUNDARIO', 'Gestion de medicamentos e insumos sanitarios vencida: sin habilitacion vigente para MEDICAMENTOS');

  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 1, NULL, bomberos, u_bomberos,
     base + interval '6 hours', base + interval '2 days', base + interval '5 hours', base + interval '9 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, bomberos, true, true, base + interval '9 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l1, bomberos, 6, 'PRINCIPAL', 'Rescate en estructuras colapsadas nivel 3 - habilitada hasta gravedad ALTA (la emergencia es CRITICA)');

  -- ==================================================================
  -- H4. Tormenta BAJA. Consorcio liderado por los Bomberos, total.
  -- ==================================================================
  base := now() - interval '8 days';

  INSERT INTO "emergencias"
    ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
     "estado", "fecha_cierre_convocatoria", "municipio_id", "registrada_por_id", "fecha_creacion", "fecha_actualizacion")
  VALUES
    ('TORMENTA_SEVERA', 'BAJA', '[HISTORICO] Barrio Playas de Oro',
     'Tormenta con caida de arboles sobre calles y tendido electrico.',
     150, base, 'FINALIZADA', base + interval '20 hours', municipio_id, operador_id,
     base + interval '1 hour', base + interval '5 days')
  RETURNING "id" INTO e;
  ids := ids || e;

  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'ALIMENTOS', 'Viandas para las familias sin luz', 800, 'raciones', base + interval '2 hours', base + interval '2 hours')
  RETURNING "id" INTO l1;
  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'TRANSPORTE_Y_LOGISTICA', 'Camionetas para el reparto', 3, 'vehiculos', base + interval '2 hours', base + interval '2 hours')
  RETURNING "id" INTO l2;

  INSERT INTO "ofertas"
    ("emergencia_id", "estado", "version", "observaciones", "organizacion_lider_id", "presentada_por_id",
     "fecha_presentacion", "fecha_adjudicacion", "fecha_creacion", "fecha_actualizacion")
  VALUES
    (e, 'FINALIZADA', 2, 'Nosotros repartimos lo que cocina Cruz Solidaria.', bomberos, u_bomberos,
     base + interval '6 hours', base + interval '1 day', base + interval '4 hours', base + interval '5 days')
  RETURNING "id" INTO o;
  INSERT INTO "oferta_participantes" ("oferta_id", "organizacion_id", "es_lider", "finalizado", "fecha_finalizacion")
  VALUES (o, bomberos, true, true, base + interval '4 days'),
         (o, cruz, false, true, base + interval '5 days');
  INSERT INTO "oferta_lineas" ("oferta_id", "lote_id", "organizacion_id", "cantidad", "caracter", "perfil_competencia")
  VALUES (o, l2, bomberos, 3, 'PRINCIPAL', 'Logistica y transporte en emergencias nivel 3 - habilitada hasta gravedad ALTA'),
         (o, l1, cruz, 800, 'PRINCIPAL', 'Manipulacion de alimentos nivel 4 - habilitada hasta gravedad CRITICA');

  -- ==================================================================
  -- H5. Cancelada antes de publicar la convocatoria.
  -- ==================================================================
  base := now() - interval '10 days';

  INSERT INTO "emergencias"
    ("tipo", "gravedad", "zona_afectada", "descripcion", "personas_afectadas", "fecha_ocurrencia",
     "estado", "motivo_cancelacion", "municipio_id", "registrada_por_id", "fecha_creacion", "fecha_actualizacion")
  VALUES
    ('OTRO', 'MEDIA', '[HISTORICO] Planta potabilizadora de Bialet Masse',
     'Posible contaminacion del agua de red por falla en la planta.',
     3000, base, 'CANCELADA', 'Falsa alarma: los analisis del agua dieron normales.', municipio_id, operador_id,
     base + interval '1 hour', base + interval '4 hours')
  RETURNING "id" INTO e;

  INSERT INTO "lotes" ("emergencia_id", "categoria", "descripcion", "cantidad_requerida", "unidad", "fecha_creacion", "fecha_actualizacion")
  VALUES (e, 'AGUA_POTABLE', 'Agua envasada', 20000, 'litros', base + interval '2 hours', base + interval '2 hours');

  -- ==================================================================
  -- Lo que se deriva de lo anterior, igual que lo arma la aplicacion
  -- ==================================================================

  -- Historial de versiones: el detalle de cada oferta tal como lo guarda
  -- OfertasService al crear o editar.
  INSERT INTO "oferta_versiones" ("oferta_id", "version", "snapshot", "modificada_por_id", "fecha_cambio")
  SELECT o."id", o."version",
    jsonb_build_object(
      'observaciones', o."observaciones",
      'participantes', (SELECT jsonb_agg(jsonb_build_object('organizacionId', p."organizacion_id", 'esLider', p."es_lider") ORDER BY p."id")
                        FROM "oferta_participantes" p WHERE p."oferta_id" = o."id"),
      'lineas', (SELECT jsonb_agg(jsonb_build_object(
                          'loteId', l."lote_id", 'loteDescripcion', lo."descripcion",
                          'organizacionId', l."organizacion_id", 'organizacionNombre', org."nombre",
                          'cantidad', l."cantidad", 'unidad', lo."unidad") ORDER BY l."id")
                 FROM "oferta_lineas" l
                 JOIN "lotes" lo ON lo."id" = l."lote_id"
                 JOIN "organizaciones" org ON org."id" = l."organizacion_id"
                 WHERE l."oferta_id" = o."id")),
    o."presentada_por_id", o."fecha_presentacion" - interval '30 minutes'
  FROM "ofertas" o WHERE o."emergencia_id" = ANY(ids);

  -- Las ofertas en version 2 se editaron una vez: la version 1 ofrecia la
  -- mitad en su primera linea.
  INSERT INTO "oferta_versiones" ("oferta_id", "version", "snapshot", "modificada_por_id", "fecha_cambio")
  SELECT v."oferta_id", 1,
    jsonb_set(v."snapshot", '{lineas,0,cantidad}', to_jsonb((v."snapshot" #>> '{lineas,0,cantidad}')::int / 2)),
    v."modificada_por_id", v."fecha_cambio" - interval '3 hours'
  FROM "oferta_versiones" v
  JOIN "ofertas" o ON o."id" = v."oferta_id"
  WHERE o."emergencia_id" = ANY(ids) AND v."version" = 2;

  -- Notificaciones de cada etapa, ya leidas: convocatoria abierta a toda la
  -- red, y el resultado de su oferta a cada participante.
  INSERT INTO "notificaciones" ("organizacion_id", "emergencia_id", "tipo", "mensaje", "leida", "fecha_creacion")
  SELECT org."id", em."id", 'CONVOCATORIA_ABIERTA',
         format('Se abrió una convocatoria para la emergencia en %s.', em."zona_afectada"),
         true, em."fecha_creacion" + interval '4 hours'
  FROM "emergencias" em
  CROSS JOIN "organizaciones" org
  WHERE em."id" = ANY(ids) AND org."tipo" IN ('ONG', 'ORGANISMO_RESCATE') AND org."activo";

  INSERT INTO "notificaciones" ("organizacion_id", "emergencia_id", "tipo", "mensaje", "leida", "fecha_creacion")
  SELECT p."organizacion_id", o."emergencia_id",
         CASE WHEN o."estado" = 'NO_ADJUDICADA' THEN 'OFERTA_NO_ADJUDICADA' ELSE 'OFERTA_ADJUDICADA' END::"TipoNotificacion",
         CASE WHEN o."estado" = 'NO_ADJUDICADA'
              THEN format('Tu oferta #%s no fue seleccionada.', o."id")
              ELSE format('Tu oferta #%s fue seleccionada: tu organización es responsable dentro del proyecto.', o."id")
         END,
         true, COALESCE(o."fecha_adjudicacion", o."fecha_actualizacion")
  FROM "ofertas" o
  JOIN "oferta_participantes" p ON p."oferta_id" = o."id"
  WHERE o."emergencia_id" = ANY(ids);
END $$;
