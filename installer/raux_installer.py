#!/usr/bin/env python3
import logging
import os
import sys
import subprocess
import tempfile
import time
import zipfile
import shutil
from datetime import datetime
import requests

# Remove conda-related constants and replace with Python-specific ones
PYTHON_VERSION = "3.11.8"  # Specific version for consistency
PYTHON_DIR = "python"  # Directory name for standalone Python

# Create a custom FileHandler that logs debug info
class DebugFileHandler(logging.FileHandler):
    def __init__(self, filename, mode='a', encoding=None, delay=False):
        print(f"DEBUG-HANDLER: Creating file handler for {filename} with mode {mode}")
        
        # Force append mode if file exists, regardless of what mode was requested
        if os.path.exists(filename) and mode == 'w':
            print(f"DEBUG-HANDLER: File exists but 'w' mode specified - FORCING append mode")
            mode = 'a'  # Force append mode if file exists
        
        with open(filename, mode="r" if os.path.exists(filename) and mode != "w" else "a") as f:
            if mode == "a" and os.path.exists(filename):
                print(f"DEBUG-HANDLER: File already exists, contents start with: {f.read(100)}")
            else:
                print(f"DEBUG-HANDLER: File doesn't exist or being opened in write mode: {mode}")
        
        super().__init__(filename, mode, encoding, delay)
        
    def emit(self, record):
        print(f"DEBUG-HANDLER: Writing to log file: {self.baseFilename}")
        super().emit(record)


def install_raux(install_dir, debug=False, log_file=None, version=None, local_release=None):
    """
    Install RAUX (Windows-only).

    Args:
        install_dir (str): Directory where RAUX will be installed
        debug (bool): Enable debug logging
        log_file (str): Custom log file path
        version (str): Specific version to install (e.g., "v0.6.5+raux.0.1.0.ab30cdb")
        local_release (str): Path to a local release file to use instead of downloading

    Returns:
        int: Exit code (0 for success, non-zero for failure)
    """
    # Setup logging to both console and file
    if log_file is None or not log_file.strip():
        log_file = os.path.join(install_dir, "raux_install.log")
        print(f"*** DEBUG: No log file specified, using default: {log_file}")
    else:
        # Ensure the log file doesn't have any unexpected characters
        log_file = log_file.strip()
        print(f"*** DEBUG: Log file specified: {log_file}")
        # Make sure the parent directory exists
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        print(f"*** DEBUG: Created parent directory: {os.path.dirname(log_file)}")

    # Ensure the log file path is absolute
    if not os.path.isabs(log_file):
        old_log_file = log_file
        log_file = os.path.abspath(log_file)
        print(f"*** DEBUG: Converted relative log path {old_log_file} to absolute: {log_file}")
        
    # Check if log file already exists - if it does, append to it
    append_mode = os.path.exists(log_file)
    log_mode = "a" if append_mode else "w"
    
    # Add explicit print statements that will show up in the console output
    print(f"*** DEBUG: Log file exists check: {append_mode}")
    print(f"*** DEBUG: Log mode selected: {log_mode}")
    print(f"*** DEBUG: Log file path: {log_file}")
    
    log_level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="[%(asctime)s] [RAUX-Installer] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            DebugFileHandler(log_file, mode=log_mode),
            logging.StreamHandler(sys.stdout),
        ],
    )

    # Start installation
    if append_mode:
        logging.info("\n\n===== RAUX INSTALLER CONTINUING =====")
    else:
        logging.info("===== RAUX INSTALLER =====")
    logging.info(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logging.info(f"Current directory: {os.getcwd()}")
    logging.info(f"Using log file: {log_file} (in {log_mode} mode)")
    if version:
        logging.info(f"Requested specific version: {version}")

    # Verify parameters
    logging.info("Verifying parameters...")
    logging.info(f"INSTALL_DIR set to: {install_dir}")
    logging.info(f"Using Python {PYTHON_VERSION} for installation")

    if not install_dir:
        logging.error("ERROR: Installation directory parameter is missing")
        raise ValueError("Installation directory parameter is missing")

    # Check if installation directory exists and is writable
    logging.info(
        f"Checking if installation directory exists and is writable: {install_dir}"
    )
    if not os.path.exists(install_dir):
        logging.error(f"ERROR: Installation directory does not exist: {install_dir}")
        raise ValueError(f"Installation directory does not exist: {install_dir}")

    # Test write permissions
    logging.info("Testing write permissions in installation directory...")
    try:
        test_file = os.path.join(install_dir, "write_test.txt")
        with open(test_file, "w") as f:
            f.write("Test")
        os.remove(test_file)
    except Exception as e:
        logging.error(f"ERROR: Cannot write to installation directory: {install_dir}")
        logging.error(f"Exception: {str(e)}")
        raise ValueError(
            f"Cannot write to installation directory: {install_dir}. Exception: {str(e)}"
        )

    logging.info("Starting RAUX download and installation...")
    logging.info(f"Installation directory: {install_dir}")

    # Just use the current directory - no need to create a new temp directory
    # This avoids any cleanup issues
    temp_dir = os.getcwd()
    logging.info(f"Using current directory for installation: {temp_dir}")

    try:
        # Test file creation in temp directory
        logging.info("Creating a simple test file...")
        try:
            with open("test_file.txt", "w") as f:
                f.write("Test")
            if not os.path.exists("test_file.txt"):
                logging.error("ERROR: Cannot create test file in temporary directory")
                raise ValueError("Cannot create test file in temporary directory")
        except Exception as e:
            logging.error(
                f"ERROR: Cannot create test file in temporary directory: {str(e)}"
            )
            raise ValueError(
                f"Cannot create test file in temporary directory: {str(e)}"
            )

        # Get the URL based on version parameter or latest release
        logging.info("Determining download URL...")
        
        if local_release:
            logging.info(f"Using local release file: {local_release}")
            logging.info(f"Local file exists check: {os.path.exists(local_release)}")
            logging.info(f"Local file absolute path: {os.path.abspath(local_release)}")
            # Skip download entirely and just copy the local file
            try:
                if not os.path.exists(local_release):
                    logging.error(f"ERROR: Local release file does not exist: {local_release}")
                    raise ValueError(f"Local release file does not exist: {local_release}")
                
                shutil.copy2(local_release, "raux.zip")
                logging.info(f"Copied local release file to raux.zip")
                logging.info(f"Destination file exists: {os.path.exists('raux.zip')}")
                logging.info(f"Destination file size: {os.path.getsize('raux.zip')} bytes")
            except Exception as e:
                logging.error(f"ERROR: Failed to copy local release file: {str(e)}")
                raise ValueError(f"Failed to copy local release file: {str(e)}")
        else:
            if version:
                # Use specific version instead of fetching latest
                download_url = get_specific_version_url(version)
            else:
                # Fallback to latest release if no version specified
                download_url = get_latest_release_url()
                
            logging.info(f"Using download URL: {download_url}")

            # Download the zip file
            logging.info(f"Downloading from {download_url}")

            try:
                # Install requests if not already installed
                try:
                    subprocess.run(
                        ["python", "-m", "pip", "install", "requests"],
                        check=True,
                        capture_output=True,
                    )
                    logging.info("Installed requests package")
                except Exception as e:
                    logging.error(f"ERROR: Failed to install requests package: {str(e)}")
                    raise ValueError(f"Failed to install requests package: {str(e)}")

                response = requests.get(download_url, stream=True, timeout=60)
                response.raise_for_status()

                with open("raux.zip", "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)

            except Exception as e:
                logging.error(f"ERROR: Failed to download RAUX zip file: {str(e)}")
                raise ValueError(f"Failed to download RAUX zip file: {str(e)}")

        # Check if zip file exists
        if not os.path.exists("raux.zip"):
            logging.error("ERROR: Failed to download RAUX zip file")
            raise ValueError("Failed to download RAUX zip file")

        # Create extracted_files directory
        extract_dir = os.path.join(temp_dir, "extracted_files")
        os.makedirs(extract_dir, exist_ok=True)

        # Extract files
        logging.info("Extracting files...")

        try:
            with zipfile.ZipFile("raux.zip", "r") as zip_ref:
                zip_ref.extractall(extract_dir)
        except Exception as e:
            logging.error(f"ERROR: Failed to extract RAUX zip file: {str(e)}")
            raise ValueError(f"Failed to extract RAUX zip file: {str(e)}")

        # Look for .env.example in the extracted files and copy it to python/Lib/.env
        logging.info("Looking for .env.example file...")
        env_example_path = None
        for root, dirs, files in os.walk(extract_dir):
            if ".env.example" in files:
                env_example_path = os.path.join(root, ".env.example")
                break
                    
        if env_example_path:
            logging.info(f"Found .env.example at: {env_example_path}")
            env_dest_dir = os.path.join(install_dir, PYTHON_DIR, "Lib")
            os.makedirs(env_dest_dir, exist_ok=True)
            env_dest_path = os.path.join(env_dest_dir, ".env")
            try:
                shutil.copy2(env_example_path, env_dest_path)
                logging.info(f"Copied .env.example to {env_dest_path}")
            except Exception as e:
                logging.warning(f"WARNING: Failed to copy .env.example to {env_dest_path}: {str(e)}")
        else:
            logging.warning("WARNING: Could not find .env.example in the extracted files")
                
        # List extracted files for debugging
        logging.info("Listing extracted files for debugging:")
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                logging.debug(f"  {os.path.join(root, file)}")

        # Find the install.py script
        install_script = None
        for root, dirs, files in os.walk(extract_dir):
            if "install.py" in files and "ux_installer" in root:
                install_script = os.path.join(root, "install.py")
                break

        if not install_script:
            # Look for any install.py
            for root, dirs, files in os.walk(extract_dir):
                if "install.py" in files:
                    install_script = os.path.join(root, "install.py")
                    break

        if not install_script:
            logging.error("ERROR: Could not find install.py in extracted files")
            raise ValueError("Could not find install.py in extracted files")

        # Run installation script using the standalone Python
        logging.info(f"Found install script: {install_script}")

        # Close log handlers to prevent file locking issues
        logging.info("Closing log handlers to prevent file locking issues...")
        for handler in logging.root.handlers[:]:
            handler.close()
            logging.root.removeHandler(handler)

        # Print that we're reinitializing logging
        print(f"*** DEBUG: Reinitializing logging for file: {log_file}")
        print(f"*** DEBUG: Using forced append mode")
        
        # IMPORTANT: Always verify log file still exists before continuing
        if os.path.exists(log_file):
            print(f"*** DEBUG: Log file still exists at: {log_file}")
            # If the file exists but is empty, write an initial header
            if os.path.getsize(log_file) == 0:
                print(f"*** DEBUG: Log file exists but is empty, writing initial header")
                with open(log_file, "a") as f:
                    f.write("=== RAUX Installer Log ===\n")
        else:
            print(f"*** DEBUG: Log file no longer exists at: {log_file} - creating new file")
            # Create directory if needed
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            with open(log_file, "a") as f:
                f.write("=== RAUX Installer Log (Recreated) ===\n")
        
        # Reinitialize logging with append mode - always use append at this point
        # since we've already been logging to the file
        logging.basicConfig(
            level=log_level,
            format="[%(asctime)s] [RAUX-Installer] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            handlers=[
                DebugFileHandler(log_file, mode="a"),  # Always use append mode here
                logging.StreamHandler(sys.stdout),
            ],
        )
        
        logging.info("\n===== RAUX INSTALLER CONTINUING AFTER HANDLER RESET =====")

        # Build the command using the standalone Python
        python_path = os.path.join(install_dir, PYTHON_DIR, "python.exe")
        cmd = [
            python_path,
            install_script,
            "--install-dir",
            install_dir,
            "--yes",
            "--force",
        ]

        if debug:
            cmd.append("--debug")

        logging.info(f"Running: {' '.join(cmd)}")
        try:
            # Run the command directly
            process = subprocess.run(cmd, check=False, capture_output=True, text=True)
            exit_code = process.returncode

            # Log the output from the installation script
            if process.stdout:
                logging.info("Installation script output:")
                for line in process.stdout.splitlines():
                    logging.info(f"  {line}")

            if process.stderr:
                logging.warning("Installation script errors:")
                for line in process.stderr.splitlines():
                    logging.warning(f"  {line}")

            logging.info(f"Exit code from install.py: {exit_code}")
        except Exception as e:
            logging.error(f"ERROR: Failed to run installation script: {str(e)}")
            raise ValueError(f"Failed to run installation script: {str(e)}")

        # Copy launcher scripts to the installation directory
        logging.info("Copying launcher scripts to the installation directory...")

        # Look for launcher scripts in the extracted files
        launcher_ps1_found = False
        launcher_cmd_found = False

        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file == "launch_raux.ps1":
                    launcher_ps1_path = os.path.join(root, file)
                    launcher_ps1_found = True
                    logging.info(f"Found launch_raux.ps1 at: {launcher_ps1_path}")
                    try:
                        shutil.copy2(
                            launcher_ps1_path,
                            os.path.join(install_dir, "launch_raux.ps1"),
                        )
                        logging.info(f"Copied launch_raux.ps1 to {install_dir}")
                    except Exception as e:
                        logging.error(
                            f"ERROR: Failed to copy launch_raux.ps1: {str(e)}"
                        )
                        raise ValueError(f"Failed to copy launch_raux.ps1: {str(e)}")

                if file == "launch_raux.cmd":
                    launcher_cmd_path = os.path.join(root, file)
                    launcher_cmd_found = True
                    logging.info(f"Found launch_raux.cmd at: {launcher_cmd_path}")
                    try:
                        shutil.copy2(
                            launcher_cmd_path,
                            os.path.join(install_dir, "launch_raux.cmd"),
                        )
                        logging.info(f"Copied launch_raux.cmd to {install_dir}")
                    except Exception as e:
                        logging.error(
                            f"ERROR: Failed to copy launch_raux.cmd: {str(e)}"
                        )
                        raise ValueError(f"Failed to copy launch_raux.cmd: {str(e)}")

        # Check if we found and copied the launcher scripts
        if not launcher_ps1_found:
            logging.warning(
                "WARNING: Could not find launch_raux.ps1 in the extracted files"
            )

        if not launcher_cmd_found:
            logging.warning(
                "WARNING: Could not find launch_raux.cmd in the extracted files"
            )

        # Also look for the launcher scripts in the current directory (they might be included separately)
        if not launcher_ps1_found and os.path.exists("launch_raux.ps1"):
            try:
                shutil.copy2(
                    "launch_raux.ps1", os.path.join(install_dir, "launch_raux.ps1")
                )
                logging.info(
                    f"Copied launch_raux.ps1 from current directory to {install_dir}"
                )
                launcher_ps1_found = True
            except Exception as e:
                logging.error(
                    f"ERROR: Failed to copy launch_raux.ps1 from current directory: {str(e)}"
                )
                raise ValueError(
                    f"Failed to copy launch_raux.ps1 from current directory: {str(e)}"
                )

        if not launcher_cmd_found and os.path.exists("launch_raux.cmd"):
            try:
                shutil.copy2(
                    "launch_raux.cmd", os.path.join(install_dir, "launch_raux.cmd")
                )
                logging.info(
                    f"Copied launch_raux.cmd from current directory to {install_dir}"
                )
                launcher_cmd_found = True
            except Exception as e:
                logging.error(
                    f"ERROR: Failed to copy launch_raux.cmd from current directory: {str(e)}"
                )
                raise ValueError(
                    f"Failed to copy launch_raux.cmd from current directory: {str(e)}"
                )

        # Installation summary
        logging.info(f"Installation completed with exit code: {exit_code}")

        if exit_code != 0:
            logging.error(f"Installation failed with error code: {exit_code}")
            logging.error(
                "Please ensure all RAUX applications are closed and try again."
            )
            logging.error(
                "If the problem persists, you may need to restart your computer."
            )
            raise ValueError(f"Installation failed with error code: {exit_code}")
        else:
            logging.info("Installation completed successfully.")
            logging.info("You can start RAUX by running:")
            logging.info("  raux")
            logging.info("Or by using the desktop shortcut if created.")

        logging.info("===== INSTALLATION SUMMARY =====")
        logging.info(f"Installation directory: {install_dir}")
        logging.info(f"Python version: {PYTHON_VERSION}")
        logging.info(
            f"Launcher scripts copied: PS1={launcher_ps1_found}, CMD={launcher_cmd_found}"
        )
        logging.info(f"Final exit code: {exit_code}")
        logging.info(f"End time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logging.info("===============================")

        # Note: We're intentionally NOT cleaning up the temp directory
        logging.info(
            "Temporary directory will not be cleaned up to prevent file-in-use errors"
        )

        return exit_code

    except Exception as e:
        logging.error(f"Unexpected error during installation: {str(e)}")
        raise ValueError(f"Unexpected error during installation: {str(e)}")


def get_latest_release_url():
    """
    Get the URL for the latest release of RAUX.

    Returns:
        str: URL to download the latest release
    """
    try:
        response = requests.get(
            "https://api.github.com/repos/aigdat/raux/releases/latest", timeout=30
        )

        if response.status_code == 200:
            release_info = response.json()
            assets = release_info.get("assets", [])

            # Look for Windows-specific assets first
            for asset in assets:
                if asset["name"].endswith(".zip") and (
                    "win" in asset["name"].lower() or "windows" in asset["name"].lower()
                ):
                    return asset["browser_download_url"]

            # If no Windows-specific zip found, look for any zip
            for asset in assets:
                if asset["name"].endswith(".zip"):
                    return asset["browser_download_url"]

            # If no zip found, use zipball URL
            if "zipball_url" in release_info:
                return release_info["zipball_url"]

        # If we get here, we didn't find a suitable asset
        logging.warning("No suitable release assets found, using default URL")

        return "https://github.com/aigdat/raux/archive/refs/heads/main.zip"

    except Exception as e:
        logging.error(f"Error fetching release info: {str(e)}")

        # Note: When we raise an exception here, the function will exit immediately
        # and the calling code will need to handle the exception.
        # The NSIS installer will see this as a non-zero exit code.
        raise ValueError(f"Error fetching release info: {str(e)}")


def get_specific_version_url(version):
    """
    Construct the download URL for a specific version.
    
    Args:
        version (str): The version string (e.g., "v0.6.5+raux.0.1.0.ab30cdb")
        
    Returns:
        str: The download URL
    """
    # Remove leading 'v' if present for filename
    filename_version = version[1:] if version.startswith('v') else version
    
    # Construct full URL
    return f"https://github.com/aigdat/raux/releases/download/{version}/raux-{filename_version}-setup.zip"


if __name__ == "__main__":
    # Add debug logging for command line arguments
    print("\n========== DEBUG: COMMAND LINE ARGUMENTS ==========")
    print(f"Script path: {sys.argv[0]}")
    print("Arguments received:")
    for i, arg in enumerate(sys.argv[1:], 1):
        print(f"  Arg {i}: {arg}")
    print("==================================================\n")
    
    # If run directly, parse command line arguments
    import argparse

    parser = argparse.ArgumentParser(description="RAUX Installer (Windows-only)")
    parser.add_argument("--install-dir", required=True, help="Installation directory")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--log-file", help="Custom log file path")
    parser.add_argument("--version", help="Specific version to install")
    parser.add_argument("--local-release", help="Path to a local release file to use instead of downloading")

    args = parser.parse_args()
    
    # Log the parsed arguments as well
    if args.local_release:
        print(f"DEBUG: Local release path after parsing: {args.local_release}")
        print(f"DEBUG: Local release path exists: {os.path.exists(args.local_release)}")

    exit_code = install_raux(args.install_dir, args.debug, args.log_file, args.version, args.local_release)
    sys.exit(exit_code)
