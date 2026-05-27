import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  getAuthClearCookieOptions,
  getAuthCookieName,
  getAuthCookieOptions,
} from './auth.config';
import { AuthService } from './auth.service';
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  ResendConfirmationInput,
} from './auth.service';
import { CookieAuthGuard } from './cookie-auth.guard';
import { CurrentUser } from './current-user.decorator';

interface ConfirmEmailInput {
  token: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterInput) {
    return this.authService.register(body);
  }

  @Post('confirm-email')
  async confirmEmail(
    @Body() body: ConfirmEmailInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.confirmEmail(body.token);
    this.setAuthCookie(response, result.accessToken);
    return { user: result.user };
  }

  @Post('resend-confirmation')
  @HttpCode(200)
  resendConfirmation(@Body() body: ResendConfirmationInput) {
    return this.authService.resendConfirmation(body);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body);
    this.setAuthCookie(response, result.accessToken);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(getAuthCookieName(), getAuthClearCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(CookieAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  private setAuthCookie(response: Response, accessToken: string): void {
    response.cookie(getAuthCookieName(), accessToken, getAuthCookieOptions());
  }
}
