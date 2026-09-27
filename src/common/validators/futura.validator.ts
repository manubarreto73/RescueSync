import { ValidationOptions, registerDecorator } from 'class-validator';

/** La fecha tiene que estar en el futuro. Contraparte de NoFutura. */
export function Futura(opciones?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: 'futura',
      target: objeto.constructor,
      propertyName: propiedad,
      options: opciones,
      validator: {
        validate(valor: unknown) {
          if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) return false;
          return valor.getTime() > Date.now();
        },
        defaultMessage() {
          return `${propiedad} tiene que estar en el futuro`;
        },
      },
    });
  };
}
