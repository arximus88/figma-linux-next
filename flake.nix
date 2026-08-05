{
  description = "Unofficial Electron-based Figma desktop client for Linux";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkg = builtins.fromJSON (builtins.readFile ./package.json);

      # The release this flake installs. Rewritten as a unit by
      # scripts/update_flake_release.py, which the `flake` job in
      # .github/workflows/release.yml runs after every tagged release.
      #
      # The version is pinned here rather than read from package.json on
      # purpose: the hashes only exist once the release binaries are built, so a
      # version bump would otherwise leave the flake pointing at a tarball whose
      # hash it cannot know, and every `nix build` would fail until someone
      # recomputed them by hand. Kept together, the two can never drift — the
      # flake simply trails package.json by at most one release.
      release = {
        version = "0.15.0";
        hashes = {
          x86_64-linux  = "sha256-rQlR8xFweb3Fuu6XwfVTRpFoBg5hPOTvcRIHKePSovE=";
          aarch64-linux = "sha256-Yohvssbw3k16iDIyK+2Fv7Rw6T49HeWozGFQ1o2QoYI=";
        };
      };

      mkFigmaLinuxNext = pkgs:
        let
          arch = {
            x86_64-linux  = "x64";
            aarch64-linux = "arm64";
          }.${pkgs.stdenv.hostPlatform.system};

          hash = release.hashes.${pkgs.stdenv.hostPlatform.system};

          nativeLibs = with pkgs; [
            alsa-lib
            at-spi2-atk
            at-spi2-core
            cairo
            cups
            dbus
            expat
            fontconfig
            freetype
            gdk-pixbuf
            glib
            gtk3
            libdrm
            libGL
            libnotify
            libxkbcommon
            mesa
            nss
            nspr
            pango
            stdenv.cc.cc.lib
            systemd
            wayland
            libx11
            libxcomposite
            libxcursor
            libxdamage
            libxext
            libxfixes
            libxi
            libxrandr
            libxrender
            libxscrnsaver
            libxtst
            libxcb
            libxshmfence
            zlib
          ];
        in
        pkgs.stdenv.mkDerivation {
          pname = pkg.name;
          version = release.version;

          src = pkgs.fetchurl {
            url = "${pkg.homepage}/releases/download/v${release.version}/${pkg.name}_${release.version}_linux_${arch}.zip";
            inherit hash;
          };

          nativeBuildInputs = with pkgs; [ unzip autoPatchelfHook makeWrapper ];
          buildInputs = nativeLibs;

          dontBuild = true;
          dontStrip = true;

          unpackPhase = ''
            unzip "$src" -d unpacked
          '';

          installPhase = ''
            runHook preInstall

            appDir="$out/opt/figma-linux-next"
            install -d "$appDir"

            cp -r unpacked/. "$appDir/"

            install -Dm644 ${./figma-linux-next.desktop} \
              "$out/share/applications/figma-linux-next.desktop"

            for size in 24 36 48 64 72 96 128 192 256 384 512; do
              icon="$appDir/icons/$size"x"$size.png"
              if [ -f "$icon" ]; then
                install -Dm644 "$icon" \
                  "$out/share/icons/hicolor/$size"x"$size/apps/figma-linux-next.png"
              fi
            done

            runHook postInstall
          '';

          postInstall = ''
            addAutoPatchelfSearchPath "$out/opt/figma-linux-next"

            # xdg-open shim: clears LD_LIBRARY_PATH before delegating so that
            # the subprocess chain (gio → gio-launch-desktop → browser) loads
            # its own libraries rather than Electron's nativeLibs set.
            # (Thanks Claude!)
            mkdir -p "$out/libexec"
            cat > "$out/libexec/xdg-open" <<'EOF'
#!/bin/sh
unset LD_LIBRARY_PATH
exec ${pkgs.xdg-utils}/bin/xdg-open "$@"
EOF
            chmod +x "$out/libexec/xdg-open"

            install -d "$out/bin"
            makeWrapper "$out/opt/figma-linux-next/figma-linux-next" "$out/bin/figma-linux-next" \
              --prefix PATH : "$out/libexec" \
              --prefix LD_LIBRARY_PATH : ${pkgs.lib.makeLibraryPath nativeLibs}
          '';

          meta = with pkgs.lib; {
            description = pkg.description;
            homepage = pkg.homepage;
            license = licenses.gpl2Only;
            platforms = [ "x86_64-linux" "aarch64-linux" ];
            mainProgram = "figma-linux-next";
            sourceProvenance = [ sourceTypes.binaryNativeCode ];
          };
        };
    in
    {
      packages.x86_64-linux.default  = mkFigmaLinuxNext nixpkgs.legacyPackages.x86_64-linux;
      packages.aarch64-linux.default = mkFigmaLinuxNext nixpkgs.legacyPackages.aarch64-linux;

      nixosModules.default = { config, pkgs, lib, ... }: {
        options.programs.figma-linux-next.enable = lib.mkEnableOption "figma-linux-next";
        config = lib.mkIf config.programs.figma-linux-next.enable {
          environment.systemPackages = [ self.packages.${pkgs.stdenv.hostPlatform.system}.default ];

          # figma:// scheme handling is necessary for login redirects
          xdg.mime.defaultApplications."x-scheme-handler/figma" = "figma-linux-next.desktop";
        };
      };
    };
}
