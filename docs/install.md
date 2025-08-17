# RAUX Installation

Install RAUX on Windows and Ubuntu using the packages from the GitHub [Releases](https://github.com/aigdat/raux/releases) page.

## Supported platforms
- Windows 10/11 (64-bit)
- Ubuntu 22.04 LTS or 24.04 LTS (64-bit)

## Windows (.exe)
1. Download the latest `raux-setup.exe` from [Releases](https://github.com/aigdat/raux/releases).
2. Double-click `raux-setup.exe` and follow the prompts.
3. Launch GAIA UI from the Start Menu (search for “GAIA UI”) or the desktop shortcut.
4. On first launch, setup may take a moment. An internet connection is required the first time.
5. Updating: download the newer `raux-setup.exe` from [Releases](https://github.com/aigdat/raux/releases) and run it.
6. Uninstalling: Windows Settings → Apps → Installed apps → find “GAIA UI” → Uninstall.

## Ubuntu (.deb)
1. Download the latest `raux-setup.deb` (amd64) from [Releases](https://github.com/aigdat/raux/releases).
2. Open a terminal in the folder where you downloaded `raux-setup.deb`, then install with apt:
```bash
sudo apt update
sudo apt install ./raux-setup.deb
```
3. Launch GAIA UI from your application menu (search for “GAIA UI”).
4. On first launch, setup may take a moment. An internet connection is required the first time.
5. Updating: download the newer `raux-setup.deb` from [Releases](https://github.com/aigdat/raux/releases) and install it again with apt (same command as above).
6. Uninstalling:
```bash
sudo apt remove gaiaui
```