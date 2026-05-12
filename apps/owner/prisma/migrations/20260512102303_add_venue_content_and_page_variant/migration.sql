/*
  Warnings:

  - Added the required column `imageKind` to the `venues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageValue` to the `venues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `venues` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `venues` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "page_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "visitorType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "page_variants_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_venues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageKind" TEXT NOT NULL,
    "imageValue" TEXT NOT NULL,
    "publishState" TEXT NOT NULL DEFAULT 'draft',
    "slugLockedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "venues_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_venues" ("createdAt", "id", "ownerId", "updatedAt") SELECT "createdAt", "id", "ownerId", "updatedAt" FROM "venues";
DROP TABLE "venues";
ALTER TABLE "new_venues" RENAME TO "venues";
CREATE UNIQUE INDEX "venues_ownerId_key" ON "venues"("ownerId");
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "page_variants_venueId_idx" ON "page_variants"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "page_variants_venueId_visitorType_key" ON "page_variants"("venueId", "visitorType");
