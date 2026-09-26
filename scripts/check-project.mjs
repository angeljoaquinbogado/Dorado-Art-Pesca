import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const ok = [];

function fail(message) {
  errors.push(message);
}

function pass(message) {
  ok.push(message);
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function walk(dir, predicate = () => true) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];

  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, predicate));
    else if (predicate(rel)) out.push(rel);
  }

  return out;
}

const required = [
  "index.html",
  "admin.html",
  "pedido.html",
  "politicas.html",
  "vercel.json",
  "manifest.webmanifest",
  ".env.example",
  "assets/js/site.js",
  "assets/js/admin.js",
  "assets/css/site.css",
  "assets/css/dorado-theme.css",
  "api/checkout.js",
  "api/products.js",
  "api/best-sellers.js",
  "database/dorado-complete-setup.sql",
  "database/shipping-tracking.sql"
];

for (const rel of required) {
  if (!exists(rel)) fail(`Falta archivo requerido: ${rel}`);
}
if (!errors.length) pass("Archivos requeridos presentes");

for (const rel of ["package.json", "manifest.webmanifest", "vercel.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
    pass(`JSON válido: ${rel}`);
  } catch (error) {
    fail(`JSON inválido en ${rel}: ${error.message}`);
  }
}

const jsFiles = [
  ...walk("api", rel => rel.endsWith(".js")),
  ...walk("lib", rel => rel.endsWith(".js")),
  ...walk(path.join("assets", "js"), rel => rel.endsWith(".js")),
  ...walk("scripts", rel => rel.endsWith(".mjs"))
].filter(rel => !rel.endsWith("check-project.mjs"));

for (const rel of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, rel)], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`Sintaxis JS inválida: ${rel}\n${result.stderr.trim()}`);
  }
}
if (jsFiles.length && !errors.some(e => e.startsWith("Sintaxis JS"))) {
  pass(`Sintaxis JavaScript validada (${jsFiles.length} archivos)`);
}

function stripCssNoise(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

for (const rel of walk(path.join("assets", "css"), rel => rel.endsWith(".css"))) {
  const css = stripCssNoise(fs.readFileSync(path.join(root, rel), "utf8"));
  let depth = 0;
  let invalid = false;

  for (const char of css) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth < 0) {
      invalid = true;
      break;
    }
  }

  if (invalid || depth !== 0) fail(`Llaves CSS desbalanceadas: ${rel}`);
}
if (!errors.some(e => e.startsWith("Llaves CSS"))) {
  pass("CSS con llaves balanceadas");
}

const htmlFiles = ["index.html", "admin.html", "pedido.html", "politicas.html", "404.html"];
const attrRegex = /\b(?:src|href)=["']([^"'#]+)["']/gi;

for (const rel of htmlFiles) {
  if (!exists(rel)) continue;
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  for (const match of html.matchAll(attrRegex)) {
    const raw = match[1].trim();
    if (
      !raw ||
      /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw) ||
      raw.startsWith("/api/")
    ) continue;

    const clean = raw.split("?")[0].split("#")[0];
    if (!clean || clean === "/") continue;

    const candidate = clean.startsWith("/")
      ? clean.slice(1)
      : path.normalize(path.join(path.dirname(rel), clean));

    if (
      /\.(?:css|js|png|jpe?g|webp|svg|ico|webmanifest)$/i.test(candidate) &&
      !exists(candidate)
    ) {
      fail(`Referencia local faltante: ${rel} -> ${raw}`);
    }
  }
}

if (!errors.some(e => e.startsWith("Referencia local"))) {
  pass("Referencias locales principales válidas");
}

for (const forbidden of [".env", ".env.local", ".env.production"]) {
  if (exists(forbidden)) fail(`No debe versionarse ${forbidden}`);
}
if (!errors.some(e => e.includes("No debe versionarse"))) {
  pass("No se detectaron archivos .env reales");
}

const searchable = [
  ...htmlFiles.filter(exists),
  ...walk(path.join("assets", "js"), rel => rel.endsWith(".js")),
  ...walk(path.join("assets", "css"), rel => rel.endsWith(".css"))
];

for (const rel of searchable) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  if (/FER\s*ELECTRO/i.test(text)) {
    fail(`Referencia heredada de FER ELECTRO en ${rel}`);
  }
}
if (!errors.some(e => e.includes("FER ELECTRO"))) {
  pass("Sin referencias heredadas de FER ELECTRO");
}


// Seguridad: evita que credenciales reales lleguen al repositorio.
const secretScanFiles = [
  ...walk("api", rel => rel.endsWith(".js")),
  ...walk("lib", rel => rel.endsWith(".js")),
  ...walk(path.join("assets", "js"), rel => rel.endsWith(".js")),
  ...walk("database", rel => rel.endsWith(".sql")),
  ...walk("docs", rel => /\.(?:md|txt)$/i.test(rel)),
  ...["README.md", ".github/SECURITY.md", "vercel.json", ".env.example"].filter(exists)
];

const secretPatterns = [
  ["Mercado Pago access token", /\b(?:APP_USR|TEST)-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["OpenAI/API-style secret", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["JWT hardcodeado", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Credencial de base de datos", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]+/gi]
];

for (const rel of [...new Set(secretScanFiles)]) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) fail(`Posible secreto expuesto (${label}) en ${rel}`);
  }
  if (/\b(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)(?:SUPABASE_SERVICE_ROLE_KEY|MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET|GMAIL_APP_PASSWORD|RATE_LIMIT_SECRET)\b/.test(text)) {
    fail(`Variable privada marcada como pública en ${rel}`);
  }
}
if (!errors.some(e => e.includes("secreto expuesto") || e.includes("marcada como pública"))) {
  pass("Sin patrones conocidos de secretos expuestos");
}

// .env.example debe documentar nombres, nunca contener secretos privados reales.
if (exists(".env.example")) {
  const envText = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const sensitiveNames = new Set([
    "SUPABASE_SERVICE_ROLE_KEY",
    "RATE_LIMIT_SECRET",
    "MERCADOPAGO_ACCESS_TOKEN",
    "MERCADOPAGO_WEBHOOK_SECRET",
    "GMAIL_APP_PASSWORD"
  ]);

  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !sensitiveNames.has(match[1])) continue;
    const value = match[2].replace(/^['"]|['"]$/g, "").trim();
    if (value && !/^(?:changeme|example|your[_-].*|<.*>)$/i.test(value)) {
      fail(`.env.example contiene un valor no vacío para ${match[1]}`);
    }
  }
}
if (!errors.some(e => e.includes(".env.example contiene"))) {
  pass(".env.example sin secretos privados");
}

console.log("\nDorado Artículos de Pesca — Quality Check\n");
for (const message of ok) console.log(`✓ ${message}`);

if (errors.length) {
  console.error("\nErrores:\n");
  for (const message of errors) console.error(`✗ ${message}`);
  process.exit(1);
}

console.log("\n✓ Proyecto validado correctamente\n");
