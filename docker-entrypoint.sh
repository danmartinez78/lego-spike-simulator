#!/bin/sh
# Download the LDraw parts library once, so robots and scenes load their
# bricks from this server instead of asking each visitor for complete.zip.
set -e

if [ -n "$LDRAW_URL" ] && [ ! -f "$LDRAW_DIR/parts.lst" ]; then
    echo "Downloading LDraw parts library from $LDRAW_URL"
    parent=$(dirname "$LDRAW_DIR")
    mkdir -p "$parent"
    if wget -q -O /tmp/complete.zip "$LDRAW_URL"; then
        rm -rf "$parent/ldraw.new"
        mkdir -p "$parent/ldraw.new"
        unzip -q /tmp/complete.zip -d "$parent/ldraw.new"
        rm -f /tmp/complete.zip
        rm -rf "$LDRAW_DIR"
        mv "$parent/ldraw.new/ldraw" "$LDRAW_DIR"
        rm -rf "$parent/ldraw.new"
        (cd "$LDRAW_DIR" && find parts p -type f -iname '*.dat' > parts.lst.tmp && mv parts.lst.tmp parts.lst)
        echo "LDraw library ready: $(wc -l < "$LDRAW_DIR/parts.lst") parts"
    else
        echo "Could not download the LDraw library; visitors will be asked for complete.zip"
        rm -f /tmp/complete.zip
    fi
fi

exec node /app/server/server.mjs
