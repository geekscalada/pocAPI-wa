import fs from "fs";
import path from "path";

const envFile = process.env.ENV_FILE || ".env";
const sourcePath = path.resolve(__dirname, ".", envFile);
const envDir = path.resolve(__dirname, ".", "env");
const destPath = path.join(envDir, ".env");

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: ${envFile} not found at ${sourcePath}`);
  process.exit(1);
}

if (!fs.existsSync(envDir)) {
  console.log(`Creating directory: ${envDir}`);
  fs.mkdirSync(envDir, { recursive: true });
}

fs.copyFileSync(sourcePath, destPath);
console.log(`Copied ${envFile} to ${destPath}`);
