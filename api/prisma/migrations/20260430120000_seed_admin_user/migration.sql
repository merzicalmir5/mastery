-- Seed local admin (email: admin@mastery.local, password: admin123). Idempotent: skips if email exists.
INSERT INTO "User" ("id", "email", "passwordHash", "companyName", "isEmailVerified", "createdAt", "updatedAt")
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'admin@mastery.local',
  '$2b$10$h9B6tdrElqxZo6nTs9K6NOHNv1CG16dioueKyA0GPHYOcuYz2IRIe',
  'Mastery',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;
