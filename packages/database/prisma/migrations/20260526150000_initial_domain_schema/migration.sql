-- CreateEnum
CREATE TYPE "FeedStatus" AS ENUM ('ACTIVE', 'PAUSED', 'PULL_ERROR');

-- CreateEnum
CREATE TYPE "ArticleProcessingStatus" AS ENUM ('PENDING', 'FILTERED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ArticleImportance" AS ENUM ('HIGH', 'NORMAL', 'JUNK');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'COMPANY', 'PRODUCT', 'TECHNOLOGY', 'LOCATION');

-- CreateEnum
CREATE TYPE "SimilarityKind" AS ENUM ('URL', 'CONTENT_HASH', 'SEMANTIC');

-- CreateEnum
CREATE TYPE "GraphEdgeKind" AS ENUM ('MENTIONS', 'CO_MENTION', 'SIMILAR');

-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('OPENAI', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "LlmOperation" AS ENUM ('ARTICLE_ANALYSIS', 'ENTITY_MATCH', 'DIGEST', 'REGENERATION');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackgroundStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "status" "FeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificationAxis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassificationAxis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailConfirmationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailConfirmationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rawContent" TEXT,
    "extractedText" TEXT,
    "language" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedArticle" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "externalId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleLabel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "status" "ArticleProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "importance" "ArticleImportance",
    "summary" TEXT,
    "preFilterReason" TEXT,
    "llmCacheId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleCategoryAssignment" (
    "id" TEXT NOT NULL,
    "articleLabelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ArticleCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleAxisAssignment" (
    "id" TEXT NOT NULL,
    "articleLabelId" TEXT NOT NULL,
    "axisId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ArticleAxisAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "firstSeen" INTEGER,
    "lastSeen" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleEntityMention" (
    "id" TEXT NOT NULL,
    "articleLabelId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "ArticleEntityMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSimilarity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "similarArticleId" TEXT NOT NULL,
    "kind" "SimilarityKind" NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSimilarity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "kind" "GraphEdgeKind" NOT NULL,
    "weight" INTEGER,
    "score" DOUBLE PRECISION,
    "categoryId" TEXT,
    "ts" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCache" (
    "id" TEXT NOT NULL,
    "operation" "LlmOperation" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmTelemetry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "operation" "LlmOperation" NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DigestStatus" NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "overview" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegenerationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueJobRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT,
    "jobName" TEXT NOT NULL,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueJobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Feed_userId_url_key" ON "Feed"("userId", "url");

-- CreateIndex
CREATE INDEX "Feed_userId_idx" ON "Feed"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificationAxis_userId_name_key" ON "ClassificationAxis"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConfirmationToken_tokenHash_key" ON "EmailConfirmationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailConfirmationToken_userId_idx" ON "EmailConfirmationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailConfirmationToken_expiresAt_idx" ON "EmailConfirmationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_normalizedUrl_key" ON "Article"("normalizedUrl");

-- CreateIndex
CREATE INDEX "Article_contentHash_idx" ON "Article"("contentHash");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedArticle_feedId_articleId_key" ON "FeedArticle"("feedId", "articleId");

-- CreateIndex
CREATE INDEX "FeedArticle_articleId_idx" ON "FeedArticle"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleLabel_userId_articleId_key" ON "ArticleLabel"("userId", "articleId");

-- CreateIndex
CREATE INDEX "ArticleLabel_userId_status_idx" ON "ArticleLabel"("userId", "status");

-- CreateIndex
CREATE INDEX "ArticleLabel_userId_importance_idx" ON "ArticleLabel"("userId", "importance");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleCategoryAssignment_articleLabelId_categoryId_key" ON "ArticleCategoryAssignment"("articleLabelId", "categoryId");

-- CreateIndex
CREATE INDEX "ArticleCategoryAssignment_categoryId_idx" ON "ArticleCategoryAssignment"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAxisAssignment_articleLabelId_axisId_key" ON "ArticleAxisAssignment"("articleLabelId", "axisId");

-- CreateIndex
CREATE INDEX "ArticleAxisAssignment_axisId_idx" ON "ArticleAxisAssignment"("axisId");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_userId_canonicalName_type_key" ON "Entity"("userId", "canonicalName", "type");

-- CreateIndex
CREATE INDEX "Entity_userId_type_idx" ON "Entity"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleEntityMention_articleLabelId_entityId_key" ON "ArticleEntityMention"("articleLabelId", "entityId");

-- CreateIndex
CREATE INDEX "ArticleEntityMention_entityId_idx" ON "ArticleEntityMention"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSimilarity_userId_articleId_similarArticleId_kind_key" ON "ArticleSimilarity"("userId", "articleId", "similarArticleId", "kind");

-- CreateIndex
CREATE INDEX "ArticleSimilarity_userId_articleId_idx" ON "ArticleSimilarity"("userId", "articleId");

-- CreateIndex
CREATE INDEX "ArticleSimilarity_userId_similarArticleId_idx" ON "ArticleSimilarity"("userId", "similarArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphEdge_userId_fromNodeId_toNodeId_kind_key" ON "GraphEdge"("userId", "fromNodeId", "toNodeId", "kind");

-- CreateIndex
CREATE INDEX "GraphEdge_userId_kind_idx" ON "GraphEdge"("userId", "kind");

-- CreateIndex
CREATE INDEX "GraphEdge_categoryId_idx" ON "GraphEdge"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCache_cacheKey_key" ON "LlmCache"("cacheKey");

-- CreateIndex
CREATE INDEX "LlmCache_operation_contentHash_idx" ON "LlmCache"("operation", "contentHash");

-- CreateIndex
CREATE INDEX "LlmTelemetry_userId_operation_idx" ON "LlmTelemetry"("userId", "operation");

-- CreateIndex
CREATE INDEX "LlmTelemetry_createdAt_idx" ON "LlmTelemetry"("createdAt");

-- CreateIndex
CREATE INDEX "Digest_userId_status_idx" ON "Digest"("userId", "status");

-- CreateIndex
CREATE INDEX "Digest_periodStart_periodEnd_idx" ON "Digest"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "RegenerationRun_userId_status_idx" ON "RegenerationRun"("userId", "status");

-- CreateIndex
CREATE INDEX "QueueJobRecord_queueName_status_idx" ON "QueueJobRecord"("queueName", "status");

-- CreateIndex
CREATE INDEX "QueueJobRecord_userId_idx" ON "QueueJobRecord"("userId");

-- AddForeignKey
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationAxis" ADD CONSTRAINT "ClassificationAxis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConfirmationToken" ADD CONSTRAINT "EmailConfirmationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedArticle" ADD CONSTRAINT "FeedArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedArticle" ADD CONSTRAINT "FeedArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLabel" ADD CONSTRAINT "ArticleLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLabel" ADD CONSTRAINT "ArticleLabel_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLabel" ADD CONSTRAINT "ArticleLabel_llmCacheId_fkey" FOREIGN KEY ("llmCacheId") REFERENCES "LlmCache"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCategoryAssignment" ADD CONSTRAINT "ArticleCategoryAssignment_articleLabelId_fkey" FOREIGN KEY ("articleLabelId") REFERENCES "ArticleLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCategoryAssignment" ADD CONSTRAINT "ArticleCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAxisAssignment" ADD CONSTRAINT "ArticleAxisAssignment_articleLabelId_fkey" FOREIGN KEY ("articleLabelId") REFERENCES "ArticleLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAxisAssignment" ADD CONSTRAINT "ArticleAxisAssignment_axisId_fkey" FOREIGN KEY ("axisId") REFERENCES "ClassificationAxis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntityMention" ADD CONSTRAINT "ArticleEntityMention_articleLabelId_fkey" FOREIGN KEY ("articleLabelId") REFERENCES "ArticleLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntityMention" ADD CONSTRAINT "ArticleEntityMention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSimilarity" ADD CONSTRAINT "ArticleSimilarity_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSimilarity" ADD CONSTRAINT "ArticleSimilarity_similarArticleId_fkey" FOREIGN KEY ("similarArticleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmTelemetry" ADD CONSTRAINT "LlmTelemetry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegenerationRun" ADD CONSTRAINT "RegenerationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueJobRecord" ADD CONSTRAINT "QueueJobRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
