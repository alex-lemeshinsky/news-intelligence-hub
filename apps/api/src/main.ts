import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getWebOrigin } from './auth/auth.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: getWebOrigin(),
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
