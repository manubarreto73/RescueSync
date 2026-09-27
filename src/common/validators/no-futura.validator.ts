import { ValidationOptions, registerDecorator } from 'class-validator';

/**
 * Validador propio: la fecha no puede estar en el futuro.
 *
 * class-validator trae @MaxDate, pero recibe la fecha tope como valor fijo al
 * cargar la clase, no al validar cada request. Con @MaxDate(new Date()) el
 * tope quedaria congelado en el momento en que arranco el proceso, y despues
 * de un rato empezaria a rechazar fechas legitimas.
 *
 * Asi se escribe un decorador de validacion a medida en Nest: es el
 * equivalente a implementar ConstraintValidator en Bean Validation.
 */
export function NoFutura(opciones?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: 'noFutura',
      target: objeto.constructor,
      propertyName: propiedad,
      options: opciones,
      validator: {
        validate(valor: unknown) {
          if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) return false;
          return valor.getTime() <= Date.now();
        },
        defaultMessage() {
          return `${propiedad} no puede estar en el futuro`;
        },
      },
    });
  };
}
