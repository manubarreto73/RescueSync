-- CreateEnum
CREATE TYPE "EstadoOferta" AS ENUM ('BORRADOR', 'PRESENTADA', 'VALIDADA', 'ADJUDICADA', 'NO_ADJUDICADA', 'FINALIZADA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "CaracterOferta" AS ENUM ('PRINCIPAL', 'APOYO_SECUNDARIO');

-- CreateTable
CREATE TABLE "ofertas" (
    "id" SERIAL NOT NULL,
    "emergencia_id" INTEGER NOT NULL,
    "estado" "EstadoOferta" NOT NULL DEFAULT 'BORRADOR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "observaciones" VARCHAR(1000),
    "organizacion_lider_id" INTEGER NOT NULL,
    "presentada_por_id" INTEGER NOT NULL,
    "fecha_presentacion" TIMESTAMP(3),
    "fecha_adjudicacion" TIMESTAMP(3),
    "motivo_no_adjudicacion" VARCHAR(500),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_participantes" (
    "id" SERIAL NOT NULL,
    "oferta_id" INTEGER NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "es_lider" BOOLEAN NOT NULL DEFAULT false,
    "finalizado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_finalizacion" TIMESTAMP(3),

    CONSTRAINT "oferta_participantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_lineas" (
    "id" SERIAL NOT NULL,
    "oferta_id" INTEGER NOT NULL,
    "lote_id" INTEGER NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "caracter" "CaracterOferta" NOT NULL DEFAULT 'PRINCIPAL',
    "perfil_competencia" VARCHAR(200),

    CONSTRAINT "oferta_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_versiones" (
    "id" SERIAL NOT NULL,
    "oferta_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "modificada_por_id" INTEGER NOT NULL,
    "fecha_cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oferta_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ofertas_emergencia_id_idx" ON "ofertas"("emergencia_id");

-- CreateIndex
CREATE INDEX "ofertas_estado_idx" ON "ofertas"("estado");

-- CreateIndex
CREATE INDEX "ofertas_organizacion_lider_id_idx" ON "ofertas"("organizacion_lider_id");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_participantes_oferta_id_organizacion_id_key" ON "oferta_participantes"("oferta_id", "organizacion_id");

-- CreateIndex
CREATE INDEX "oferta_lineas_lote_id_idx" ON "oferta_lineas"("lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_lineas_oferta_id_lote_id_organizacion_id_key" ON "oferta_lineas"("oferta_id", "lote_id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_versiones_oferta_id_version_key" ON "oferta_versiones"("oferta_id", "version");

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_emergencia_id_fkey" FOREIGN KEY ("emergencia_id") REFERENCES "emergencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_organizacion_lider_id_fkey" FOREIGN KEY ("organizacion_lider_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_presentada_por_id_fkey" FOREIGN KEY ("presentada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_participantes" ADD CONSTRAINT "oferta_participantes_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_participantes" ADD CONSTRAINT "oferta_participantes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_lineas" ADD CONSTRAINT "oferta_lineas_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_lineas" ADD CONSTRAINT "oferta_lineas_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_lineas" ADD CONSTRAINT "oferta_lineas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_versiones" ADD CONSTRAINT "oferta_versiones_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_versiones" ADD CONSTRAINT "oferta_versiones_modificada_por_id_fkey" FOREIGN KEY ("modificada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
