// Postinstall script: patch @hot-labs/kit and @hot-labs/near-connect
const fs = require("fs");
const path = require("path");

// 1. Patch @hot-labs/kit package.json type
const kitPkgPath = path.join(__dirname, "..", "node_modules", "@hot-labs", "kit", "package.json");
try {
    if (fs.existsSync(kitPkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(kitPkgPath, "utf-8"));
        if (pkg.type === "commonjs") {
            pkg.type = "module";
            fs.writeFileSync(kitPkgPath, JSON.stringify(pkg, null, 2) + "\n");
            console.log("✅ Patched @hot-labs/kit: type changed from 'commonjs' to 'module'");
        }
    }
} catch (err) {
    console.warn("⚠️  Could not patch @hot-labs/kit package.json:", err.message);
}

// 2. Patch @hot-labs/near-connect NearConnector.js to eliminate unhandled 'No wallet selected' runtime error and default to testnet
const nearConnectPath = path.join(__dirname, "..", "node_modules", "@hot-labs", "near-connect", "build", "NearConnector.js");
try {
    if (fs.existsSync(nearConnectPath)) {
        let code = fs.readFileSync(nearConnectPath, "utf-8");
        let modified = false;
        if (code.includes('throw new Error("No wallet selected");')) {
            code = code.replace(
                'throw new Error("No wallet selected");',
                'return { wallet: null, accounts: [] };'
            );
            modified = true;
            console.log("✅ Patched @hot-labs/near-connect: suppressed unhandled 'No wallet selected' exception");
        }
        if (code.includes('this.network = options?.network ?? "mainnet";')) {
            code = code.replace(
                'this.network = options?.network ?? "mainnet";',
                'this.network = options?.network || ((typeof window !== "undefined" && window.localStorage?.getItem("neptune_near_network") === "mainnet") ? "mainnet" : "testnet");'
            );
            modified = true;
            console.log("✅ Patched @hot-labs/near-connect: dynamic network default (defaults to testnet)");
        }
        if (code.includes('network = "mainnet";')) {
            code = code.replace(
                'network = "mainnet";',
                'network = "testnet";'
            );
            modified = true;
        }
        if (modified) {
            fs.writeFileSync(nearConnectPath, code, "utf-8");
        }
    }
} catch (err) {
    console.warn("⚠️  Could not patch NearConnector.js:", err.message);
}

// 3. Patch @hot-labs/kit connector.js: safe rejection handler & Testnet default network
const kitNearConnectorPath = path.join(__dirname, "..", "node_modules", "@hot-labs", "kit", "build", "near", "connector.js");
try {
    if (fs.existsSync(kitNearConnectorPath)) {
        let kitCode = fs.readFileSync(kitNearConnectorPath, "utf-8");
        if (kitCode.includes('this.connector.getConnectedWallet().then(async ({ wallet }) => {')) {
            kitCode = kitCode.replace(
                'this.connector.getConnectedWallet().then(async ({ wallet }) => {',
                'this.connector.getConnectedWallet().then(async (payload) => {\n            if (!payload || !payload.wallet) return;\n            const { wallet } = payload;'
            );
        }
        if (!kitCode.includes('.catch(() => {})')) {
            kitCode = kitCode.replace(
                'isNew: false });\n        });',
                'isNew: false });\n        }).catch(() => {});'
            );
        }
        // Force default network to testnet unless explicitly set in localStorage
        if (kitCode.includes('network: "mainnet",')) {
            kitCode = kitCode.replace(
                'network: "mainnet",',
                'network: (typeof window !== "undefined" && window.localStorage?.getItem("neptune_near_network") === "mainnet") ? "mainnet" : "testnet",'
            );
            console.log("✅ Patched @hot-labs/kit: configured dynamic network default to testnet");
        }
        fs.writeFileSync(kitNearConnectorPath, kitCode, "utf-8");
        console.log("✅ Patched @hot-labs/kit connector.js successfully");
    }
} catch (err) {
    console.warn("⚠️  Could not patch kit connector.js:", err.message);
}
