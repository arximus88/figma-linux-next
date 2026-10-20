# Native Termux setup

Source: [issue #22 — Notes on how I got this working in native Termux](https://github.com/arximus88/figma-linux-next/issues/22).
Reported by [@tylandercasper](https://github.com/tylandercasper) on 2026-04-08.
Captured on 2026-10-14. The issue had no follow-up comments at capture time.

These are archived community observations from a Fold 7 phone, using a
Termux-specific Electron 39 build. They have not been independently verified
against the project's current Electron version.

## Electron runtime

The reporter used Termux's native `electron-for-code-oss` package from
[the Termux X11 package directory](https://repository.su/termux/termux-x11/pool/main/e/electron-for-code-oss/).
They downloaded the package for the device architecture (likely aarch64),
extracted it, and substituted that runtime for the app's bundled Electron.

Their executable name depended on the setup:

- Prebuilt app: rename `code-oss` to `figma-linux-next`.
- Source checkout: rename it to `electron` and replace the runtime files under
  `node_modules/electron/dist`.

## GPU flags

The reporter identified `--enable-features=Vulkan` as the main flag needed for
their setup, and also used `--enable-unsafe-webgpu`.

They mentioned `DefaultANGLEVulkan` and `VulkanFromANGLE` as possible additional
`enable-features` entries, but did not establish that those improved performance.
They had also followed the
[Termux hardware acceleration guide](https://github.com/LinuxDroidMaster/Termux-Desktops/blob/main/Documentation/HardwareAcceleration.md)
and did not know which of its steps were necessary.

These flags describe that historical setup; they are not project defaults.

## Building and launching

The reporter used [Happ1ness-dev/bun-termux](https://github.com/Happ1ness-dev/bun-termux).
Launching through that Bun build reportedly left hardware acceleration disabled,
even when GPU flags were supplied.

Their workaround was to:

1. Run `bun run build`, then `bun run start`.
2. Open Settings → Help → GPU and copy the reported command line.
3. Put that command in a `launch.sh` script in the checkout and launch it directly.
4. Check the GPU page again; hardware acceleration was then reported as enabled.

They used a Termux shell shebang but did not determine whether it mattered.
The cause of the difference between Bun launch and direct launch remained unknown.

## Login workaround

With an older Electron runtime, the login button did not open the browser.
The reporter reached a working login link by clicking Figma's icon in the upper
left corner and using the login link on the resulting page. They did not confirm
whether the newer runtime eliminated this problem.

## Reported performance

On the Fold 7, the home screen appeared about 10 seconds after launch, and a file
took about another 10 seconds to load. The reporter compared this with roughly
4 seconds to launch and 5 seconds to load a file in the official Android app.
No controlled benchmark or follow-up tuning results were provided.
