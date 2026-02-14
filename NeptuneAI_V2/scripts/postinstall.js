// Postinstall script: patch @hot-labs/kit to fix CJS/ESM mismatch
// The package declares "type": "commonjs" but ships ESM code
const fs = require("fs");
const path = require("path");

const kitPkgPath = path.join(__dirname, "..", "node_modules", "@hot-labs", "kit", "package.json");

try {
    if (fs.existsSync(kitPkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(kitPkgPath, "utf-8"));
        if (pkg.type === "commonjs") {
            pkg.type = "module";
            fs.writeFileSync(kitPkgPath, JSON.stringify(pkg, null, 2) + "\n");
            console.log("✅ Patched @hot-labs/kit: type changed from 'commonjs' to 'module'");
        } else {
            console.log("ℹ️  @hot-labs/kit already has correct module type:", pkg.type);
        }
    } else {
        console.log("ℹ️  @hot-labs/kit not found, skipping patch");
    }
} catch (err) {
    console.warn("⚠️  Could not patch @hot-labs/kit:", err.message);
}

console.log("Postinstall complete.");
