// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("./../package.json");

export interface AppArgs {
  figmaUrl: string;
  newFileType?: 'design' | 'figjam';
}

export default (): AppArgs => {
  const argv = process.argv;

  let figmaUrl = "";
  let newFileType: 'design' | 'figjam' | undefined;

  if (argv.indexOf("-v") != -1 || argv.indexOf("--version") != -1) {
    console.log(typeof version === "string" ? version : "0.12.0");
    process.exit(0);
  }

  // Check for new file actions from desktop entry
  const newFileArg = argv.find(arg => arg.startsWith('--new-file='));
  if (newFileArg) {
    const fileType = newFileArg.split('=')[1];
    if (fileType === 'design' || fileType === 'figjam') {
      newFileType = fileType;
      figmaUrl = `https://www.figma.com/file/new?editor_type=${fileType}`;
    }
  }

  const urlIndex = argv.findIndex((i) => /^(figma:\/\/|https?:\/\/w{0,3}?\.?figma\.com)/.test(i));
  if (urlIndex !== -1) {
    figmaUrl = argv[urlIndex];
  }

  if (argv.indexOf("-h") != -1 || argv.indexOf("--help") != -1) {
    const help = `
Figma-Linux v${version}

Optimized Figma desktop application for Linux with native Wayland support and GPU acceleration.

Usage:
    figma-linux [options] [URL]

Arguments:
    URL                     Open a specific Figma URL or file (figma:// or https://figma.com/...)

Options:
    -h, --help             Show this help message
    -v, --version          Show application version
    --new-file=TYPE        Create a new file (TYPE: design or figjam)

Examples:
    figma-linux                                    # Launch application
    figma-linux --new-file=design                  # Create new design file
    figma-linux figma://file/abc123                # Open specific file
    figma-linux https://www.figma.com/file/xyz     # Open from URL

Environment Variables:
    ELECTRON_OZONE_PLATFORM_HINT    Force display backend (wayland or x11)
    ELECTRON_ENABLE_LOGGING         Enable verbose logging

For more information, visit: https://github.com/Figma-Linux/figma-linux
    `;

    console.log(help);
    process.exit(0);
  }

  return {
    figmaUrl,
    newFileType,
  };
};
