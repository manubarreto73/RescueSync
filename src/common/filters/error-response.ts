/** Forma unica de todos los errores que devuelve la API. */
export interface ErrorResponse {
  status: number;
  message: string | string[];
  path: string;
  timestamp: string;
}
