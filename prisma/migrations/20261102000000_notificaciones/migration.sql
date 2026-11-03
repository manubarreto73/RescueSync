-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('CONVOCATORIA_ABIERTA', 'OFERTA_ADJUDICADA', 'OFERTA_NO_ADJUDICADA');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "emergencia_id" INTEGER NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_organizacion_id_leida_idx" ON "notificaciones"("organizacion_id", "leida");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_emergencia_id_fkey" FOREIGN KEY ("emergencia_id") REFERENCES "emergencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
