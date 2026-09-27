-- CreateEnum
CREATE TYPE "TipoOrganizacion" AS ENUM ('MUNICIPIO', 'ONG', 'ORGANISMO_RESCATE', 'ENTE_GUBERNAMENTAL', 'CENTRO_COORDINADOR');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "organizacion_id" INTEGER;

-- CreateTable
CREATE TABLE "organizaciones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "tipo" "TipoOrganizacion" NOT NULL,
    "cuit" VARCHAR(13),
    "codigo_nacional" VARCHAR(50),
    "email_contacto" VARCHAR(120),
    "telefono_contacto" VARCHAR(30),
    "localidad" VARCHAR(120),
    "provincia" VARCHAR(120),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_nombre_key" ON "organizaciones"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_cuit_key" ON "organizaciones"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_codigo_nacional_key" ON "organizaciones"("codigo_nacional");

-- CreateIndex
CREATE INDEX "organizaciones_tipo_idx" ON "organizaciones"("tipo");

-- CreateIndex
CREATE INDEX "organizaciones_activo_idx" ON "organizaciones"("activo");

-- CreateIndex
CREATE INDEX "usuarios_organizacion_id_idx" ON "usuarios"("organizacion_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
