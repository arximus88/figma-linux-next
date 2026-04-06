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

system("git add .");
system("git commit -m 'chore(release): bump version to $version'");
system("git tag -a v$version -m 'Publish v$version release'");
