import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({ origin: '*' });

  const config = new DocumentBuilder()
    .setTitle('Lords Valley Core API')
    .setDescription(
      'Monolito de alto rendimiento: Settlement Aggregate Root, simulación determinista y Event Bus WebSocket para Lords Valley MVP. Ver prisma/context.md y src/*/context.md',
    )
    .setVersion('1.0.0')
    .addTag('settlements', 'Aggregate Root: creación,consulta y simulación')
    .addTag('health', 'Healthcheck')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Lords Valley API Docs',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
