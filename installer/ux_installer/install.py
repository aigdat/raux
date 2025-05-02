#!/usr/bin/env python3
# Copyright(C) 2024-2025 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""
RAUX Installer

This module provides functionality to install RAUX (Open WebUI).
Similar to lemonade-install, it can be invoked from the command line.
"""

import argparse
import os
import sys
import json
import datetime
import subprocess
import tempfile
import traceback
import shutil

try:
    import requests
except ImportError:
    print("ERROR: Required package 'requests' is not installed")
    print("Installing requests package...")
    subprocess.check_call(["python", "-m", "pip", "install", "requests"])
    import requests

# Global constants
PRODUCT_NAME = "RAUX"
PRODUCT_NAME_CONCAT = "raux"
GITHUB_REPO = "https://github.com/aigdat/raux.git"
PYTHON_VERSION = "3.11"
ICON_FILE = "raux.ico"

# Global log file path
LOG_FILE_PATH = None


def log(message, print_to_console=True):
    """
    Logs a message to both stdout and the log file if specified.

    Args:
        message: The message to log
        print_to_console: Whether to print the message to console
    """
    # Get current timestamp
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted_message = f"[{timestamp}] [{PRODUCT_NAME}-Installer] {message}"

    # Print to console if requested
    if print_to_console:
        print(formatted_message)

    # Write to log file if it's set
    if LOG_FILE_PATH:
        try:
            # Open the log file in append mode
            with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
                f.write(formatted_message + "\n")
        except Exception as e:
            print(f"WARNING: Failed to write to log file: {str(e)}")


def download_latest_wheel(output_folder, output_filename=None):
    """
    Downloads the latest RAUX wheel from GitHub releases.

    Args:
        output_folder: Directory where to save the wheel
        output_filename: Optional name for the downloaded file

    Returns:
        str: Path to the downloaded wheel file
    """
    log("------------------")
    log("- Download Wheel -")
    log("------------------")

    try:
        # Get the latest release from GitHub
        log("Fetching latest release information...")
        response = requests.get(
            "https://api.github.com/repos/aigdat/raux/releases/latest", timeout=30
        )
        response.raise_for_status()
        release_info = response.json()

        # Find the wheel asset
        wheel_asset = None
        for asset in release_info.get("assets", []):
            if asset["name"].endswith(".whl"):
                wheel_asset = asset
                break

        if not wheel_asset:
            log("ERROR: No wheel file found in the latest release")
            return None

        # Download the wheel
        wheel_url = wheel_asset["browser_download_url"]
        if not output_filename:
            output_filename = wheel_asset["name"]

        output_path = os.path.join(output_folder, output_filename)
        log(f"Downloading wheel from: {wheel_url}")
        log(f"Saving to: {output_path}")

        response = requests.get(wheel_url, stream=True)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        log("Wheel downloaded successfully")
        return output_path

    except Exception as e:
        log(f"Error downloading wheel: {str(e)}")
        return None


def install_wheel(wheel_path, python_path):
    """
    Installs the RAUX wheel using pip.

    Args:
        wheel_path: Path to the wheel file
        python_path: Path to the Python executable

    Returns:
        bool: True if installation was successful, False otherwise
    """
    log("-----------------")
    log("- Install Wheel -")
    log("-----------------")

    try:
        # Install the wheel using pip
        log(f"Installing wheel: {wheel_path}")
        cmd = [python_path, "-m", "pip", "install", "--no-deps", wheel_path]
        result = subprocess.run(cmd, check=False, capture_output=True, text=True)

        if result.returncode != 0:
            log(f"ERROR: Failed to install wheel. Exit code: {result.returncode}")
            log(f"Error output: {result.stderr}")
            return False

        log("Wheel installed successfully")
        return True

    except Exception as e:
        log(f"Error installing wheel: {str(e)}")
        return False


def create_shortcuts(install_dir):
    """
    Creates desktop shortcuts for RAUX.

    Args:
        install_dir: Installation directory
    """
    log("------------------")
    log("- Create Shortcuts -")
    log("------------------")

    try:
        # Get the desktop directory
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")

        # Create shortcut to launch RAUX
        shortcut_path = os.path.join(desktop, f"{PRODUCT_NAME}.lnk")
        target_path = os.path.join(install_dir, "launch_raux.cmd")
        icon_path = os.path.join(install_dir, ICON_FILE)

        # Create the shortcut using PowerShell
        ps_script = f"""
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
        $Shortcut.TargetPath = "{target_path}"
        $Shortcut.WorkingDirectory = "{install_dir}"
        $Shortcut.IconLocation = "{icon_path}"
        $Shortcut.Save()
        """

        subprocess.run(["powershell", "-Command", ps_script], check=True)
        log(f"Created shortcut at: {shortcut_path}")

    except Exception as e:
        log(f"Error creating shortcuts: {str(e)}")


def main():
    """
    Main function to handle the installation process.
    """
    # Parse command line arguments
    parser = argparse.ArgumentParser(description=f"{PRODUCT_NAME} Installer")
    parser.add_argument(
        "--install-dir",
        help="Installation directory",
        default=os.path.join(os.environ.get("LOCALAPPDATA", ""), PRODUCT_NAME),
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompts")
    parser.add_argument("--force", action="store_true", help="Force installation")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    # Set up logging
    global LOG_FILE_PATH
    LOG_FILE_PATH = os.path.join(args.install_dir, f"{PRODUCT_NAME_CONCAT}_install.log")

    # Create installation directory if it doesn't exist
    os.makedirs(args.install_dir, exist_ok=True)

    # Start installation
    log("====================")
    log(f"{PRODUCT_NAME} Installation")
    log("====================")
    log(f"Installation directory: {args.install_dir}")

    try:
        # Get the Python executable path
        python_path = os.path.join(args.install_dir, "python", "python.exe")
        if not os.path.exists(python_path):
            log(f"ERROR: Python not found at: {python_path}")
            return 1

        # Create temporary directory for downloads
        temp_dir = os.path.join(args.install_dir, "temp")
        os.makedirs(temp_dir, exist_ok=True)

        # Download the wheel
        wheel_path = download_latest_wheel(temp_dir)
        if not wheel_path:
            log("ERROR: Failed to download wheel")
            return 1

        # Install the wheel
        if not install_wheel(wheel_path, python_path):
            log("ERROR: Failed to install wheel")
            return 1

        # Create shortcuts
        create_shortcuts(args.install_dir)

        log("Installation completed successfully")
        return 0

    except Exception as e:
        log(f"Unexpected error during installation: {str(e)}")
        log(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(main())
