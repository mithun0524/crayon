import fs from "fs";
import path from "path";

const dir = process.cwd();

function walk(currentDir) {
  const files = fs.readdirSync(currentDir);
  for (const file of files) {
    const fullPath = path.join(currentDir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!["node_modules", ".git", "dist", ".crayon", ".next"].includes(file)) {
        walk(fullPath);
      }
    } else {
      if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") || fullPath.endsWith(".json") || fullPath.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("@crayon/")) {
          const newContent = content.replace(/@crayon\//g, "crayon-");
          fs.writeFileSync(fullPath, newContent, "utf8");
          console.log(`Updated: ${fullPath}`);
        }
      }
    }
  }
}

walk(dir);
console.log("Renaming complete.");
