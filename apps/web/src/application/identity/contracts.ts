export interface AuthUser {
  id: string;
}

export interface AuthSession {
  user: AuthUser;
  token?: string | null;
}

export interface AuthenticationGateway {
  signUpEmail(input: { email: string; password: string }): Promise<AuthSession>;
  signInEmail(input: { email: string; password: string }): Promise<AuthSession>;
  getSession(headers: Headers): Promise<AuthSession | null>;
  resetPassword(authUserId: string, newPassword: string): Promise<void>;
  hasPasswordCredential(authUserId: string): Promise<boolean>;
  setPassword(authUserId: string, newPassword: string, headers: Headers): Promise<string>;
  removePasswordCredential(authUserId: string, credentialId: string): Promise<void>;
  close(): Promise<void>;
}
