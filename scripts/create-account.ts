import { createInterface } from "node:readline/promises";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
try {
  const name = await prompt.question("姓名：");
  const email = await prompt.question("登录邮箱：");
  const password = process.env.NEW_ACCOUNT_PASSWORD;
  if (!password || password.length < 10)
    throw Error(
      "请在本地环境 NEW_ACCOUNT_PASSWORD 设置至少 10 位密码后运行。不要把密码写进文档。",
    );
  await auth.api.signUpEmail({ body: { name, email, password } });
  console.log("个人空白手账已创建，可以登录。");
} finally {
  prompt.close();
  await db.$disconnect();
}
