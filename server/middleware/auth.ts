import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth";

export interface AuthenticatedRequest extends Request {
  user?: authService.SessionUser;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.auth_token ?? req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  authService.verifyJwtToken(token).then((user) => {
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.user = user;
    next();
  });
}
