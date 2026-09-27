-- CreateEnum
CREATE TYPE "TipoDesastre" AS ENUM ('INUNDACION', 'INCENDIO', 'TERREMOTO', 'DESLIZAMIENTO', 'TORMENTA_SEVERA', 'OTRO');

-- CreateEnum
CREATE TYPE "NivelGravedad" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EstadoEmergencia" AS ENUM ('REGISTRADA', 'CONVOCATORIA_ABIERTA', 'CONVOCATORIA_CERRADA', 'EN_ADJUDICACION', 'EN_EJECUCION', 'FINALIZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "emergencias" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoDesastre" NOT NULL,
    "gravedad" "NivelGravedad" NOT NULL,
    "zona_afectada" VARCHAR(200) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "personas_afectadas" INTEGER,
    "fecha_ocurrencia" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoEmergencia" NOT NULL DEFAULT 'REGISTRADA',
    "fecha_cierre_convocatoria" TIMESTAMP(3),
    "motivo_cancelacion" VARCHAR(500),
    "bonita_case_id" VARCHAR(50),
    "municipio_id" INTEGER NOT NULL,
    "registrada_por_id" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emergencias_estado_idx" ON "emergencias"("estado");

-- CreateIndex
CREATE INDEX "emergencias_municipio_id_idx" ON "emergencias"("municipio_id");

-- CreateIndex
CREATE INDEX "emergencias_gravedad_idx" ON "emergencias"("gravedad");

-- AddForeignKey
ALTER TABLE "emergencias" ADD CONSTRAINT "emergencias_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergencias" ADD CONSTRAINT "emergencias_registrada_por_id_fkey" FOREIGN KEY ("registrada_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
