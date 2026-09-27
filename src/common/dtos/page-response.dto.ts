import { ApiProperty } from '@nestjs/swagger';

/** Equivalente al Page<T> de Spring Data. */
export class PageResponse<T> {
  @ApiProperty({ isArray: true })
  content: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  totalElements: number;

  @ApiProperty()
  totalPages: number;

  constructor(content: T[], page: number, size: number, totalElements: number) {
    this.content = content;
    this.page = page;
    this.size = size;
    this.totalElements = totalElements;
    this.totalPages = size > 0 ? Math.ceil(totalElements / size) : 0;
  }

  /** Construye la pagina a partir del [datos, total] que devuelve findAndCount de TypeORM. */
  static of<E, R>(
    resultado: [E[], number],
    page: number,
    size: number,
    mapper: (entidad: E) => R,
  ): PageResponse<R> {
    const [entidades, total] = resultado;
    return new PageResponse(entidades.map(mapper), page, size, total);
  }
}
