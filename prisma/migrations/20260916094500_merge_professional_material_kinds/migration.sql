UPDATE "Material"
SET "kind" = '岗位相关专业问题与知识点', "category" = '岗位特有'
WHERE "kind" IN ('岗位常识与知识点', '岗位相关专业问题', '岗位专业问题');
