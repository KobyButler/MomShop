-- CreateTable
CREATE TABLE "SanmarCatalogProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "style" TEXT NOT NULL,
    "colorName" TEXT NOT NULL DEFAULT '',
    "sizeName" TEXT NOT NULL DEFAULT '',
    "title" TEXT,
    "description" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "inventoryQty" INTEGER NOT NULL DEFAULT 0,
    "colorSwatchImage" TEXT,
    "productImage" TEXT,
    "weightLbs" REAL,
    "inventoryKey" TEXT,
    "rawData" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SanmarSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rowsProcessed" INTEGER,
    "rowsTotal" INTEGER,
    "fileSizeBytes" INTEGER,
    "error" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SanmarCatalogProduct_style_idx" ON "SanmarCatalogProduct"("style");

-- CreateIndex
CREATE INDEX "SanmarCatalogProduct_category_idx" ON "SanmarCatalogProduct"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SanmarCatalogProduct_style_colorName_sizeName_key" ON "SanmarCatalogProduct"("style", "colorName", "sizeName");
