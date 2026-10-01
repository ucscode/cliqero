export interface AuthUser {
  id: string;
}

export interface AuthSession {
  user: AuthUser;
  token?: string | null;
}

export interface AuthenticationGateway {
  signUpEmail(input: { email: string; password: string }): Promise<AuthSession>;
  createUserWithoutPassword(input: { email: string }): Promise<AuthUser>;
  createOperatorUserWithPassword(input: { email: string; password: string }): Promise<AuthUser>;
  sendOperatorAccountCreatedEmail(input: { email: string; username: string }): Promise<void>;
  signInEmail(input: { email: string; password: string }): Promise<AuthSession>;
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void>;
  getSession(headers: Headers): Promise<AuthSession | null>;
  resetPassword(authUserId: string, newPassword: string): Promise<void>;
  hasPasswordCredential(authUserId: string): Promise<boolean>;
  setPassword(authUserId: string, newPassword: string, headers: Headers): Promise<string>;
  removePasswordCredential(authUserId: string, credentialId: string): Promise<void>;
  close(): Promise<void>;
}
