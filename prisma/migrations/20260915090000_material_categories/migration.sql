ALTER TABLE "Material"
ADD COLUMN "category" TEXT NOT NULL DEFAULT '待确认',
ADD COLUMN "roleScope" TEXT NOT NULL DEFAULT '';

UPDATE "Material"
SET "category" = CASE
  WHEN "kind" IN ('自我介绍', '岗位专业问题', '项目经历') THEN '岗位特有'
  WHEN "kind" = '行为问题' THEN '通用问题'
  ELSE '待确认'
END;
