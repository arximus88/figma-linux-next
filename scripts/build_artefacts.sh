#!/bin/bash

if [[ ! "$1" == "local" && ! "$1" == "repo" ]]; then
  echo "Invalid arg: "$1". Pass 'local' or 'repo' value"
  exit 1
fi

from="$1"

docker build -t figma-linux-next-artefacts -f "./docker/Build_artefacts_$from" .

rm -rf ./build/installers
mkdir -p ./build/installers

# copy artefacts from image
docker cp $(docker create figma-linux-next-artefacts:latest)://usr/src/figma-linux-next/build/installers/. ./build/installers
