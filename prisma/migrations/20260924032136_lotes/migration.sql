-- CreateEnum
CREATE TYPE "CategoriaRecurso" AS ENUM ('PERSONAL', 'ALIMENTOS', 'AGUA_POTABLE', 'MEDICAMENTOS', 'ABRIGO_Y_REFUGIO', 'EQUIPAMIENTO', 'TRANSPORTE_Y_LOGISTICA', 'OTRO');

-- CreateTable
CREATE TABLE "lotes" (
    "id" SERIAL NOT NULL,
    "emergencia_id" INTEGER NOT NULL,
    "categoria" "CategoriaRecurso" NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "cantidad_requerida" INTEGER NOT NULL,
    "unidad" VARCHAR(30) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_emergencia_id_idx" ON "lotes"("emergencia_id");

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_emergencia_id_fkey" FOREIGN KEY ("emergencia_id") REFERENCES "emergencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
