#!/bin/perl

my $isHtml = 0;
my $latest = 0;

for my $param (@ARGV) {
  if ($param eq "--html") {
    $isHtml = 1;
  }
  if ($param eq "--latest") {
    $latest = 1;
  }
}

# Range between second-to-last and last tag (default: last two tags)
# --latest: same range but capped at the latest tag (works correctly in CI where HEAD = tag)
my $from = `git tag --sort=version:refname | tail -n2 | head -n1 | tr -d '\n'`;
my $to   = $latest
  ? `git tag --sort=version:refname | tail -n1 | tr -d '\n'`
  : "HEAD";

my $log_cmd = "git log ${from}..${to} --no-merges --oneline";

# Match both plain (fix:) and scoped (fix(scope):) conventional commits
my $features = `$log_cmd | grep -Eo "feat(\\([^)]*\\))?:.*" | uniq`;
my $fixes    = `$log_cmd | grep -Eo "fix(\\([^)]*\\))?:.*"  | uniq`;
my $perf     = `$log_cmd | grep -Eo "perf(\\([^)]*\\))?:.*" | uniq`;
my $other    = `$log_cmd | grep -Eo "(chore|impr|refactor|test|ci)(\\([^)]*\\))?:.*" | uniq`;

my @featureList = grep { $_ ne "" } split /\n/, $features;
my @fixList     = grep { $_ ne "" } split /\n/, $fixes;
my @perfList    = grep { $_ ne "" } split /\n/, $perf;
my @otherList   = grep { $_ ne "" } split /\n/, $other;

my $baseUrl = "https://github.com/arximus88/figma-linux-next/issues";
my $release_note_file_path = "./release_notes";

`echo '' > $release_note_file_path`;

sub strip_prefix {
  my ($msg) = @_;
  # Strip conventional commit prefix: type(scope): or type:
  $msg =~ s/^\w+(\([^)]*\))?:\s*//;
  return $msg;
}

sub generate {
  my ($title, $listref) = @_;
  `echo "$title" >> $release_note_file_path`;

  for my $msg (@$listref) {
    my $issue = `echo "$msg" | grep -Eo "#[0-9]+" | tr -d '\n'`;
    $msg = strip_prefix($msg);
    $msg =~ s/ ?(Close|#).*$//gi if $issue ne "";

    if ($issue ne "") {
      my $issueId = substr $issue, 1;
      if ($isHtml) {
        `echo '<li>$msg <a href="$baseUrl/$issueId" target="_blank">$issue</a></li>' >> $release_note_file_path`;
      } else {
        `echo "* $msg [$issue]($baseUrl/$issueId)" >> $release_note_file_path`;
      }
    } else {
      if ($isHtml) {
        `echo "<li>$msg</li>" >> $release_note_file_path`;
      } else {
        `echo "* $msg" >> $release_note_file_path`;
      }
    }
  }

  if ($isHtml) {
    `echo "<li></li>" >> $release_note_file_path`;
  }
}

if (@featureList) {
  generate($isHtml ? "<li>Features:</li>" : "## Features:", \@featureList);
  `echo '' >> $release_note_file_path` if @fixList || @perfList || @otherList;
}

if (@fixList) {
  generate($isHtml ? "<li>Bug Fixes:</li>" : "## Bug Fixes:", \@fixList);
  `echo '' >> $release_note_file_path` if @perfList || @otherList;
}

if (@perfList) {
  generate($isHtml ? "<li>Performance:</li>" : "## Performance:", \@perfList);
  `echo '' >> $release_note_file_path` if @otherList;
}

if (@otherList) {
  generate($isHtml ? "<li>Other Changes:</li>" : "## Other Changes:", \@otherList);
}
