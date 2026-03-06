const fs = require('fs');

const file = 'src/main/Fonts/index.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /import \{ spawnSync \} from "node:child_process";/,
  `import { spawn } from "node:child_process";`
);

code = code.replace(
  /private find = async \(path: string, wilecard: string\) => \{[\s\S]*?\}\n  \};\n\}/,
  `private find = async (path: string, wildcard: string) => {
    return new Promise<string[]>((resolve) => {
      try {
        statSync(path);
      } catch (error) {
        resolve([]);
        return;
      }

      const args = [path, "-type", "f"];

      const match = wildcard.match(/\\*\\.\\{([^}]+)\\}/);
      if (match) {
        const extensions = match[1].split(",");
        args.push("(");
        extensions.forEach((ext, index) => {
          if (index > 0) args.push("-o");
          args.push("-name", \`*.\${ext}\`);
        });
        args.push(")");
      } else {
        args.push("-name", wildcard);
      }

      const find = spawn("find", args);
      let stdout = "";
      let stderr = "";

      find.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      find.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      find.on("error", (error) => {
        logger.warn(\`find process error: \`, error.message);
        resolve([]);
      });

      find.on("close", (code) => {
        if (code !== 0 && code !== null) {
          logger.warn(\`find process exited with code \${code}: \${stderr}\`);
          // Note: we still resolve stdout because find often exits with code 1 due to permission denied on subdirs
        }
        resolve(
          stdout
            .split("\\n")
            .filter((s) => !!s),
        );
      });
    });
  };
}`
);

// We also need to fix the spelling `wilecard` -> `wildcard` where it is called.
code = code.replace(
  /this\.find\(dir, "\*\.\{ttf,otf,ttc,otc\}"\)\),/,
  `this.find(dir, "*.{ttf,otf,ttc,otc}")),`
);

fs.writeFileSync(file, code);
