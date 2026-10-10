#!/usr/bin/env node
// Turn a content file into idempotent SQL for the companion tables.
//
//   node scripts/companion-import.mjs content.json [--staging] > content.sql
//
// Input: { daily:[{date,title,body,title_es,body_es,question,question_es}],
//          quests:[{id,title,description,title_es,description_es,start_date,end_date}] }
//
// Prints SQL to stdout and makes no remote calls. Statements are upserts, so
// running the file twice (or after editing the JSON) leaves one row per
// date/id. Nothing is ever deleted. Review the file, then apply it yourself
// (the command is in the header comment of the output).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAILY = { date: 1, title: 200, body: 3000, title_es: 200, body_es: 3000, question: 1000, question_es: 1000 };
const QUEST = { id: 1, title: 200, description: 3000, title_es: 200, description_es: 3000, start_date: 1, end_date: 1 };

const isDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const quote = (value) => (value == null || value === "" ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);

function checkText(row, limits, where, required) {
  for (const key of Object.keys(row)) if (!(key in limits)) throw new Error(`${where}: unknown field "${key}"`);
  for (const [key, max] of Object.entries(limits)) {
    const value = row[key];
    if (value == null || value === "") {
      if (required.includes(key)) throw new Error(`${where}: ${key} is required`);
      continue;
    }
    if (typeof value !== "string") throw new Error(`${where}: ${key} must be text`);
    if (max > 1 && Array.from(value).length > max) throw new Error(`${where}: ${key} is over ${max} characters`);
  }
}

export function generateSql(input, { staging = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object with daily and/or quests");
  for (const key of Object.keys(input)) if (key !== "daily" && key !== "quests") throw new Error(`unknown top-level key "${key}"`);
  const daily = input.daily ?? [], quests = input.quests ?? [];
  if (!Array.isArray(daily)) throw new Error("daily must be an array");
  if (!Array.isArray(quests)) throw new Error("quests must be an array");

  const seen = new Set();
  const statements = [];
  daily.forEach((row, index) => {
    const where = `daily[${index}]`;
    if (!row || typeof row !== "object") throw new Error(`${where}: must be an object`);
    if (!isDate(row.date)) throw new Error(`${where}: date must be a real YYYY-MM-DD date`);
    if (seen.has(`d${row.date}`)) throw new Error(`${where}: duplicate date ${row.date}`);
    seen.add(`d${row.date}`);
    checkText(row, DAILY, where, ["title"]);
    statements.push(
      `INSERT INTO companion_daily(date,title,body,title_es,body_es,question,question_es) VALUES (${quote(row.date)},${quote(row.title)},${quote(row.body ?? "")},${quote(row.title_es)},${quote(row.body_es)},${quote(row.question)},${quote(row.question_es)})\n` +
        "ON CONFLICT(date) DO UPDATE SET title=excluded.title,body=excluded.body,title_es=excluded.title_es,body_es=excluded.body_es,question=excluded.question,question_es=excluded.question_es;",
    );
  });
  quests.forEach((row, index) => {
    const where = `quests[${index}]`;
    if (!row || typeof row !== "object") throw new Error(`${where}: must be an object`);
    if (typeof row.id !== "string" || row.id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new Error(`${where}: id must be letters, digits, - or _ (max 80)`);
    if (seen.has(`q${row.id}`)) throw new Error(`${where}: duplicate id ${row.id}`);
    seen.add(`q${row.id}`);
    if (!isDate(row.start_date)) throw new Error(`${where}: start_date must be a real YYYY-MM-DD date`);
    if (!isDate(row.end_date)) throw new Error(`${where}: end_date must be a real YYYY-MM-DD date`);
    if (row.end_date < row.start_date) throw new Error(`${where}: end_date is before start_date (window)`);
    checkText(row, QUEST, where, ["title"]);
    statements.push(
      `INSERT INTO companion_quests(id,title,description,title_es,description_es,start_date,end_date) VALUES (${quote(row.id)},${quote(row.title)},${quote(row.description ?? "")},${quote(row.title_es)},${quote(row.description_es)},${quote(row.start_date)},${quote(row.end_date)})\n` +
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,title_es=excluded.title_es,description_es=excluded.description_es,start_date=excluded.start_date,end_date=excluded.end_date;",
    );
  });

  const target = staging ? "cohere-staging" : "cohere";
  const header = [
    `-- COhere companion content: ${daily.length} daily, ${quests.length} quests. Upserts only; safe to re-run.`,
    `-- Review, then apply (not run by this script):`,
    `--   npx wrangler d1 execute ${target} --remote --file=<this file>${staging ? " --config wrangler.staging.jsonc" : ""}`,
    "",
  ];
  return header.join("\n") + "\n" + statements.join("\n") + (statements.length ? "\n" : "");
}

function main(argv) {
  const staging = argv.includes("--staging");
  const files = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = argv.filter((arg) => arg.startsWith("--") && arg !== "--staging");
  if (files.length !== 1 || unknown.length) {
    console.error("usage: node scripts/companion-import.mjs <file.json> [--staging]");
    return 1;
  }
  try {
    process.stdout.write(generateSql(JSON.parse(readFileSync(files[0], "utf8")), { staging }));
    return 0;
  } catch (error) {
    console.error(`companion-import: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
