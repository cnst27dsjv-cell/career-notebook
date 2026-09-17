CREATE TABLE "MaterialRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialRole_userId_name_key" ON "MaterialRole"("userId", "name");
CREATE INDEX "MaterialRole_userId_idx" ON "MaterialRole"("userId");

UPDATE "Material"
SET "category" = '岗位特有', "kind" = '求职动机'
WHERE "kind" = '个性与求职动机'
  AND (
    "title" ~ '(求职|申请|为什么.*(岗位|公司|行业)|选择.*(岗位|公司|行业))'
    OR "content" ~ '(为什么.*(岗位|公司|行业)|选择.*(岗位|公司|行业)|申请.*(岗位|公司))'
  );

UPDATE "Material"
SET "category" = '通用问题', "kind" = '个性问题', "roleScope" = ''
WHERE "kind" = '个性与求职动机';

UPDATE "Material"
SET "kind" = '个性问题', "roleScope" = ''
WHERE "category" = '通用问题' AND "kind" = '个性与求职动机';

INSERT INTO "MaterialRole" ("id", "userId", "name")
SELECT md5(random()::text || clock_timestamp()::text || "userId" || "roleScope"),
       "userId",
       "roleScope"
FROM "Material"
WHERE "category" = '岗位特有' AND btrim("roleScope") <> ''
GROUP BY "userId", "roleScope"
ON CONFLICT ("userId", "name") DO NOTHING;
