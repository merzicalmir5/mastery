import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export type JwtUser = {
  sub: string;
  email: string;
  companyName: string;
};

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): JwtUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: JwtUser }>();
  return request.user;
});
