import { config } from 'dotenv';

/**
 * Se ejecuta ANTES de que Jest cargue los archivos de test.
 *
 * Carga .env.test pisando cualquier variable que ya estuviera en el entorno
 * (override: true). Sin eso, si tenes la app corriendo en otra terminal, su
 * DATABASE_URL podria filtrarse y la suite te truncaria la base de desarrollo.
 */
config({ path: '.env.test', override: true });
