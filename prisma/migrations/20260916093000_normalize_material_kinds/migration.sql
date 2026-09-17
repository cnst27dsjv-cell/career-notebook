UPDATE "Material"
SET "kind" = '岗位相关专业问题', "category" = '岗位特有'
WHERE "kind" = '岗位专业问题';

UPDATE "Material"
SET "kind" = 'Case', "category" = '岗位特有'
WHERE "kind" = '项目经历';

UPDATE "Material"
SET "kind" = '边界或分类待确认', "category" = '待确认'
WHERE "kind" IN ('问题回答', '其他');
