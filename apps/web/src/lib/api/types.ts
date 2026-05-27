export interface AuthUser {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface RegisterResponse extends AuthResponse {
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

export interface ResendConfirmationResponse {
  ok: true;
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}
