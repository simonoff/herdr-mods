#!/bin/sh
input=$(cat)
file="$HOME/.cache/claude-rate-limits.json"
if echo "$input" | jq -e '.rate_limits.five_hour // .rate_limits.seven_day' >/dev/null 2>&1; then
  mkdir -p "$(dirname "$file")"
  echo "$input" | jq -c '{rate_limits, at: (now | floor)}' > "$file.$$" && mv "$file.$$" "$file"
fi
