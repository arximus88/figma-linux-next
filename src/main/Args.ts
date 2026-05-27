 
import { version } from "./../package.json";

export interface AppArgs {
  figmaUrl: string;
  newFileType?: "design" | "figjam";
  newWindow: boolean;
}

export default (argv: string[] = process.argv): AppArgs => {
  let figmaUrl = "";
  let newFileType: "design" | "figjam" | undefined;

  if (argv.indexOf("-v") != -1 || argv.indexOf("--version") != -1) {
    console.log(typeof version === "string" ? version : "0.12.0");
    process.exit(0);
  }

  // Check for new file actions from desktop entry
  const newFileArg = argv.find((arg) => arg.startsWith("--new-file="));
  if (newFileArg) {
    const fileType = newFileArg.split("=")[1];
    if (fileType === "design" || fileType === "figjam") {
      newFileType = fileType;
      figmaUrl = `https://www.figma.com/file/new?editor_type=${fileType}`;
    }
  }

  const newWindow = argv.includes("--new-window");

  const urlIndex = argv.findIndex((i) => /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com)/.test(i));
  if (urlIndex !== -1) {
    figmaUrl = argv[urlIndex];
  }

  if (argv.indexOf("-h") != -1 || argv.indexOf("--help") != -1) {
    const help = `
Figma Linux Next v${version}

Optimized Figma desktop application for Linux with native Wayland support and GPU acceleration.

Usage:
    figma-linux-next [options] [URL]

Arguments:
    URL                     Open a specific Figma URL or file (figma:// or https://figma.com/...)

Options:
    -h, --help             Show this help message
    -v, --version          Show application version
    --new-file=TYPE        Create a new file (TYPE: design or figjam)
    --new-window           Open a new application window

Examples:
    figma-linux-next                                    # Launch application
    figma-linux-next --new-window                       # Open a new window
    figma-linux-next --new-file=design                  # Create new design file
    figma-linux-next figma://file/abc123                # Open specific file
    figma-linux-next https://www.figma.com/file/xyz     # Open from URL

For more information, visit: https://github.com/arximus88/figma-linux-next
    `;

    console.log(help);
    process.exit(0);
  }

  return {
    figmaUrl,
    newFileType,
    newWindow,
  };
};
