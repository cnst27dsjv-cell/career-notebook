import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import archiver from "archiver";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
export async function GET(r: Request) {
  try {
    const u = await userFor(r);
    const w = { userId: u.id };
    const format = new URL(r.url).searchParams.get("format");
    const applications = await db.application.findMany({ where: w });
    if (format === "csv") {
      const safe = (v: unknown) => {
        let s = String(v ?? "");
        if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      const csv =
        "\uFEFF" +
        [
          ["公司", "岗位", "城市", "批次", "阶段", "阶段状态", "投递时间"],
          ...applications.map((a) => [
            a.company,
            a.role,
            a.city,
            a.batch,
            a.stage,
            a.stageStatus,
            a.appliedAt?.toISOString(),
          ]),
        ]
          .map((row) => row.map(safe).join(","))
          .join("\r\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="applications.csv"',
        },
      });
    }
    const [events, resumes, preparations, materials, interviews, files] =
      await Promise.all([
        db.event.findMany({ where: w }),
        db.resume.findMany({ where: w }),
        db.preparation.findMany({ where: w }),
        db.material.findMany({ where: w }),
        db.interview.findMany({ where: w }),
        db.fileAsset.findMany({ where: w }),
      ]);
    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date(),
        applications,
        events,
        resumes,
        preparations,
        materials,
        interviews,
        files: files.map(({ key, ...f }) => f),
      },
      null,
      2,
    );
    if (format === "zip") {
      const stream = new PassThrough();
      const archive = archiver("zip");
      archive.on("error", (e) => stream.destroy(e));
      archive.pipe(stream);
      archive.append(json, { name: "data.json" });
      for (const f of files)
        archive.file(path.resolve("storage", f.key), {
          name: `files/${f.id}-${path.basename(f.name)}`,
        });
      void archive.finalize();
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="career-backup.zip"',
        },
      });
    }
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="career-data.json"',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
