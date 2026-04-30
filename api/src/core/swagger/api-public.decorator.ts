import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IS_PUBLIC_KEY } from '../auth/auth.constants';

export function ApiPublic(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiOperation({ security: [] }),
  );
}
