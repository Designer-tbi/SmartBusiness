import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "smart-business-secret-key";

// Auth middleware
export const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};
