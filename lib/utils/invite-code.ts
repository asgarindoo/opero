import { randomBytes, randomInt } from "crypto";

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Hindari karakter ambigu I, O, 0, 1
  const segment = () => {
    let res = "";
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(randomInt(chars.length));
    }
    return res;
  };

  return `OP-${segment()}-${segment()}`;
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}
