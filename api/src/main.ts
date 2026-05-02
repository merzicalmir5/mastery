import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FileLogger } from './core/logging/file-logger.service';
import { PrismaService } from './core/prisma/prisma.service';
import { AppModule } from './app.module';

async function bootstrap() {


  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new FileLogger('NestApplication'));
  app.enableCors({
    origin: process.env.FRONTEND_BASE_URL ?? 'http://localhost:4200',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const docsPath = 'docs';

  const httpServer = app.getHttpAdapter().getInstance();
  if (typeof httpServer?.set === 'function') {
    httpServer.set('trust proxy', 1);
  }

  app.getHttpAdapter().get('/', (req, res) => {
    const accept =
      typeof req.headers.accept === 'string' ? req.headers.accept : '';
    if (accept.includes('text/html')) {
      res.redirect(`/${docsPath}`);
      return;
    }
    res.status(200).json({
      ok: true,
      service: 'mastery-api',
      docs: `/${docsPath}`,
      health: '/health',
    });
  });
  app.getHttpAdapter().get('/api/docs', (_req, res) => {
    res.redirect(`/${docsPath}`);
  });

  try {
    const appBase = process.env.APP_BASE_URL?.replace(/\/$/, '');
    const swaggerBuilder = new DocumentBuilder()
      .setTitle('Mastery API')
      .setDescription('Smart Document Processing API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Access token from POST /auth/login (paste without "Bearer " prefix).',
        },
        'access-token',
      );
    if (appBase) {
      swaggerBuilder.addServer(appBase, 'Configured server');
    }
    const swaggerConfig = swaggerBuilder.build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    swaggerDocument.security = [{ 'access-token': [] }];
    SwaggerModule.setup(docsPath, app, swaggerDocument);
    console.log(`[bootstrap] Swagger UI at /${docsPath} (open the Railway API URL, not the Vercel app)`);
  } catch (err: unknown) {
    console.error('[bootstrap] Swagger setup failed (HTTP API still up)', err);
  }

  const parsed = Number.parseInt(process.env.PORT ?? '3000', 10);
  const listenPort = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
  await app.listen(listenPort, '0.0.0.0');
  console.log(
    `[bootstrap] listening on 0.0.0.0:${listenPort} (process.env.PORT=${JSON.stringify(process.env.PORT)})`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('[bootstrap] fatal', err);
  process.exit(1);
});
