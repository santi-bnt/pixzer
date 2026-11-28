import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const source = path.join(repoRoot, "supabase");
const target = await mkdtemp(path.join(os.tmpdir(), "pixzer-db-ci-"));
const project = path.join(target, "supabase");
const migrations = path.join(project, "migrations");
const tests = path.join(project, "tests");

const migrationMap = [
  ["0001_initial_schema.sql", "20261123213938_initial_schema.sql"],
  [
    "0002_invited_profile_provisioning.sql",
    "20261123221515_invited_profile_provisioning.sql",
  ],
  ["0003_private_game_uploads.sql", "20261125000001_private_game_uploads.sql"],
  ["0004_google_drive_storage.sql", "20261125000002_google_drive_storage.sql"],
  ["0005_google_drive_upload_leases.sql", "20261125000003_google_drive_upload_leases.sql"],
];

const existing = (await readdir(path.join(source, "migrations"))).sort();
const expected = migrationMap.map(([name]) => name);
if (JSON.stringify(existing) !== JSON.stringify(expected)) {
  throw new Error(
    `Expected migration order ${expected.join(", ")}; found ${existing.join(", ")}`,
  );
}

await mkdir(migrations, { recursive: true });
await mkdir(tests, { recursive: true });
await cp(path.join(source, "config.toml"), path.join(project, "config.toml"));
for (const [from, to] of migrationMap) {
  await cp(path.join(source, "migrations", from), path.join(migrations, to));
}
for (const name of [
  "0002_auth_rls.test.sql",
  "0003_profile_provisioning.test.sql",
  "0004_private_game_uploads.test.sql",
  "0005_google_drive_storage.test.sql",
  "0006_google_drive_upload_leases.test.sql",
]) {
  await cp(path.join(source, "tests", name), path.join(tests, name));
}

const configPath = path.join(project, "config.toml");
const config = await readFile(configPath, "utf8");
if (!/^project_id\s*=\s*"PocketArcade"\s*$/m.test(config)) {
  throw new Error(
    "Unexpected source project_id; refusing to prepare a CI database copy",
  );
}
await writeFile(
  configPath,
  config.replace(
    /^project_id\s*=\s*"PocketArcade"\s*$/m,
    'project_id = "pixzerci"',
  ),
);

const migrationNames = (await readdir(migrations)).sort();
if (
  migrationNames.length !== migrationMap.length ||
  migrationNames.some((name, i) => name !== migrationMap[i][1])
) {
  throw new Error(
    "Temporary migration mapping did not produce the expected ordered schema",
  );
}

console.log(target);
