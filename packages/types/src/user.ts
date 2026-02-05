export interface User {
  id: string;
  netId: string;
  email?: string | null;
  name?: string | null;
  college?: string | null;
  year?: number | null;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface DonatedSession {
  id: string;
  donorNetId: string;
  encryptedCookies: string;
  targetSystems: string[];
  status: "active" | "expired" | "revoked";
  expiresAt: string;
}
