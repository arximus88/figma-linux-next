#!/bin/perl

my $version = "$ARGV[0]";

if ($version eq "") {
  print "Need pass version.\n";
  exit 1;
}

my $prevVersion = `git tag --sort=version:refname | tail -n1 | tr -d 'v' | tr -d '\n'`;

printf("Bump %s to %s version.\n", $prevVersion, $version);

system("sed -i \"s/$prevVersion/$version/\" ./package.json");
system("sed -i \"s/$prevVersion/$version/\" ./src/package.json");

# The Flatpak manifest names the tag it builds. Left stale it still builds fine —
# it just packages the previous release — so it is rewritten here, not by hand.
if (system("python3 ./scripts/sync_flatpak_release.py --version $version") != 0) {
  print "Flatpak metadata could not be updated — nothing committed.\n";
  exit 1;
}

# Commit only what this script wrote: `git add .` used to sweep unrelated
# work-in-progress from the tree into the release commit.
my $files = join(" ", qw(
  package.json
  src/package.json
  flatpak/package.json
  flatpak/app.borys.FigmaLinuxNext.yml
  flatpak/app.borys.FigmaLinuxNext.metainfo.xml
));
system("git commit -m 'chore(release): bump version to $version' -- $files");
system("git tag -a v$version -m 'Publish v$version release'");
