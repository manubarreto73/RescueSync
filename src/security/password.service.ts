import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

/** Equivalente al bean PasswordEncoder (BCryptPasswordEncoder) de Spring Security. */
@Injectable()
export class PasswordService {
  private readonly saltRounds: number;

  constructor(private readonly config: ConfigService) {
    this.saltRounds = this.config.get<number>('jwt.bcryptSaltRounds', 10);
  }

  hash(plano: string): Promise<string> {
    return bcrypt.hash(plano, this.saltRounds);
  }

  compare(plano: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plano, hash);
  }
}
