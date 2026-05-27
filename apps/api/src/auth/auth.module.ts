import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { getJwtModuleOptions } from './auth.config';
import { CookieAuthGuard } from './cookie-auth.guard';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    JwtModule.register(getJwtModuleOptions()),
  ],
  controllers: [AuthController],
  providers: [AuthService, CookieAuthGuard],
  exports: [AuthService, CookieAuthGuard],
})
export class AuthModule {}
