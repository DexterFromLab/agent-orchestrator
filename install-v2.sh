#!/bin/bash
set -euo pipefail

# BTerminal v2 installer — builds from source
# Requires: Node.js 20+, Rust toolchain, system libs (WebKit2GTK, etc.)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
DESKTOP_DIR="$HOME/.local/share/applications"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}!${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }

echo "=== BTerminal v2 Installer ==="
echo ""

# ─── 1. Check Node.js ────────────────────────────────────────────────────────

echo "[1/6] Checking Node.js..."

if ! command -v node &>/dev/null; then
    fail "Node.js not found. Install Node.js 20+ (https://nodejs.org)"
fi

NODE_VER=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
    fail "Node.js $NODE_VER found, need 20+. Upgrade at https://nodejs.org"
fi
info "Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
    fail "npm not found. Install Node.js with npm."
fi
info "npm $(npm -v)"

# ─── 2. Check Rust toolchain ─────────────────────────────────────────────────

echo "[2/6] Checking Rust toolchain..."

if ! command -v rustc &>/dev/null; then
    fail "Rust not found. Install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

RUST_VER=$(rustc --version | awk '{print $2}')
RUST_MAJOR=$(echo "$RUST_VER" | cut -d. -f1)
RUST_MINOR=$(echo "$RUST_VER" | cut -d. -f2)
if [ "$RUST_MAJOR" -lt 1 ] || { [ "$RUST_MAJOR" -eq 1 ] && [ "$RUST_MINOR" -lt 77 ]; }; then
    fail "Rust $RUST_VER found, need 1.77+. Run: rustup update"
fi
info "Rust $RUST_VER"

if ! command -v cargo &>/dev/null; then
    fail "Cargo not found. Reinstall Rust toolchain."
fi
info "Cargo $(cargo --version | awk '{print $2}')"

# ─── 3. Check system libraries ───────────────────────────────────────────────

echo "[3/6] Checking system libraries..."

MISSING_PKGS=()

# WebKit2GTK 4.1 (required by Tauri 2.x on Linux)
if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    MISSING_PKGS+=("libwebkit2gtk-4.1-dev")
fi

# GTK3
if ! pkg-config --exists gtk+-3.0 2>/dev/null; then
    MISSING_PKGS+=("libgtk-3-dev")
fi

# GLib/GIO
if ! pkg-config --exists gio-2.0 2>/dev/null; then
    MISSING_PKGS+=("libglib2.0-dev")
fi

# libayatana-appindicator (system tray)
if ! pkg-config --exists ayatana-appindicator3-0.1 2>/dev/null; then
    MISSING_PKGS+=("libayatana-appindicator3-dev")
fi

# librsvg (SVG icon rendering)
if ! pkg-config --exists librsvg-2.0 2>/dev/null; then
    MISSING_PKGS+=("librsvg2-dev")
fi

# libssl (TLS)
if ! pkg-config --exists openssl 2>/dev/null; then
    MISSING_PKGS+=("libssl-dev")
fi

# Build essentials
if ! command -v cc &>/dev/null; then
    MISSING_PKGS+=("build-essential")
fi

# pkg-config itself
if ! command -v pkg-config &>/dev/null; then
    MISSING_PKGS+=("pkg-config")
fi

# curl (needed for some build steps)
if ! command -v curl &>/dev/null; then
    MISSING_PKGS+=("curl")
fi

# wget (needed for AppImage tools)
if ! command -v wget &>/dev/null; then
    MISSING_PKGS+=("wget")
fi

# FUSE (needed for AppImage)
if ! dpkg -s libfuse2t64 &>/dev/null 2>&1 && ! dpkg -s libfuse2 &>/dev/null 2>&1; then
    # Try the newer package name first (Debian trixie+), fall back to older
    if apt-cache show libfuse2t64 &>/dev/null 2>&1; then
        MISSING_PKGS+=("libfuse2t64")
    else
        MISSING_PKGS+=("libfuse2")
    fi
fi

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo ""
    warn "Missing system packages: ${MISSING_PKGS[*]}"
    echo ""
    read -rp "  Install with apt? [Y/n] " REPLY
    REPLY=${REPLY:-Y}
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        sudo apt update
        sudo apt install -y "${MISSING_PKGS[@]}"
        info "System packages installed"
    else
        fail "Cannot continue without: ${MISSING_PKGS[*]}"
    fi
else
    info "All system libraries present"
fi

# ─── 4. Install npm dependencies ─────────────────────────────────────────────

echo "[4/6] Installing npm dependencies..."

cd "$SCRIPT_DIR/v2"
npm ci --legacy-peer-deps
info "npm dependencies installed"

# ─── 5. Build Tauri app ──────────────────────────────────────────────────────

echo "[5/6] Building BTerminal (this may take a few minutes on first build)..."

npx tauri build 2>&1 | tail -5
info "Build complete"

# Locate built artifacts
BUNDLE_DIR="$SCRIPT_DIR/v2/src-tauri/target/release/bundle"
DEB_FILE=$(find "$BUNDLE_DIR/deb" -name "*.deb" 2>/dev/null | head -1)
APPIMAGE_FILE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" 2>/dev/null | head -1)
BINARY="$SCRIPT_DIR/v2/src-tauri/target/release/bterminal"

# ─── 6. Install ──────────────────────────────────────────────────────────────

echo "[6/6] Installing..."

mkdir -p "$BIN_DIR" "$ICON_DIR" "$DESKTOP_DIR"

# Copy binary
cp "$BINARY" "$BIN_DIR/bterminal-v2"
chmod +x "$BIN_DIR/bterminal-v2"
info "Binary: $BIN_DIR/bterminal-v2"

# Copy icon
if [ -f "$SCRIPT_DIR/bterminal.svg" ]; then
    cp "$SCRIPT_DIR/bterminal.svg" "$ICON_DIR/bterminal.svg"
    info "Icon: $ICON_DIR/bterminal.svg"
fi

# Desktop entry
cat > "$DESKTOP_DIR/bterminal-v2.desktop" << EOF
[Desktop Entry]
Name=BTerminal v2
Comment=Multi-session Claude agent dashboard
Exec=$BIN_DIR/bterminal-v2
Icon=bterminal
Type=Application
Categories=System;TerminalEmulator;Development;
Terminal=false
StartupNotify=true
EOF
info "Desktop entry created"

echo ""
echo "=== Installation complete ==="
echo ""

if [ -n "${DEB_FILE:-}" ]; then
    echo "  .deb package:  $DEB_FILE"
fi
if [ -n "${APPIMAGE_FILE:-}" ]; then
    echo "  AppImage:      $APPIMAGE_FILE"
fi
echo "  Binary:        $BIN_DIR/bterminal-v2"
echo ""
echo "Run: bterminal-v2"
echo ""
echo "Make sure $BIN_DIR is in your PATH."
echo "If not, add to ~/.bashrc:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
