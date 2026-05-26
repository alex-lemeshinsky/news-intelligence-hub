import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { LoginInput, RegisterInput } from './auth.service';

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
  confirmEmail(@Body() body: ConfirmEmailInput) {
    return this.authService.confirmEmail(body.token);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body);
    response.cookie('nih_access_token', result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('nih_access_token');
    return { ok: true };
  }
}
