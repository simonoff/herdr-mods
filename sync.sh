#!/bin/sh
set -eu

repo=$(cd "$(dirname "$0")" && pwd)
herdr="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mods="space-tree side-toast backlog"
layouts="tree"

copy() {
  mkdir -p "$2"
  cp -R "$1/." "$2/"
}

case "${1:-to-herdr}" in
  to-herdr)
    for m in $mods; do
      copy "$repo/$m/mods/$m" "$herdr/mods/$m"
      herdr-app check "$herdr/mods/$m"
    done
    for l in $layouts; do
      mkdir -p "$herdr/layouts"
      cp "$repo/$l/layouts/$l.json" "$herdr/layouts/$l.json"
    done
    ;;
  from-herdr)
    for m in $mods; do
      copy "$herdr/mods/$m" "$repo/$m/mods/$m"
    done
    for l in $layouts; do
      cp "$herdr/layouts/$l.json" "$repo/$l/layouts/$l.json"
    done
    ;;
  *)
    echo "usage: $0 [to-herdr | from-herdr]" >&2
    exit 2
    ;;
esac
