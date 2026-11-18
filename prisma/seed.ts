import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || password.length < 10) throw new Error("Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of 10+ characters");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return console.log(`Owner ${email} already exists, nothing changed.`);
  await db.user.create({
    data: { email, name: process.env.SEED_ADMIN_NAME || "Owner", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Created owner account ${email}`);
}

main().finally(() => db.$disconnect());
