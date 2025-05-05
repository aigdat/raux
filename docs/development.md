# RAUX Development Workflow

This document provides detailed instructions for developers working on the RAUX installation components and testing installer changes.

## Installation Development Overview

The RAUX installer has been updated to eliminate conda dependency and now uses a standalone Python 3.11.8 installation, similar to GAIA's installer approach. This document focuses on how to test installer changes during development.

## Testing Installer Changes

When working on the RAUX installer, you'll need to test your changes without creating actual release builds. The workflow follows these steps:

### 1. Make Changes to Installer Files

Modify the necessary files in the installer directory:
- `Installer-UX.nsi` - The main NSIS installer script
- `install.py` - Handles the installation process
- `launch_raux.ps1` and `launch_raux.cmd` - Launcher scripts
- Any other related files

### 2. Create a Pull Request

After making your changes, create a Pull Request. This will trigger GitHub Actions to build artifacts for testing.

### 3. Download Artifacts from GitHub Actions

1. Navigate to your PR page in GitHub
2. Click on the "Checks" tab at the top of the PR
3. Find the "Build and package solution (pr)" workflow run
4. When the workflow completes successfully, click on the "Artifacts" dropdown
5. Download the "raux-installer-package" artifact
6. Extract the downloaded zip file to a known location on your machine
   - Recommended location: `${workspaceFolder}/artifacts/`

### 4. Build and Test the Installer Locally

1. Build the local installer:
   ```
   VS Code Task: "Build RAUX Installer"
   ```

2. Test with the downloaded artifact:
   ```
   VS Code Task: "Run RAUX Installer with Local Release"
   ```
   
   When prompted, provide the path to the downloaded setup zip file.

   Alternatively, run directly from the command line:
   ```
   Installer-UX.exe /LOCAL_RELEASE=path/to/raux-setup.zip
   ```

3. Clean up after testing:
   ```
   VS Code Task: "Clean RAUX Environment: AppData"
   ```
   This ensures a clean state for subsequent tests.

## Testing Installer Changes with Local Releases

If you need to test installer changes without creating a GitHub release, you can use the `/LOCAL_RELEASE` parameter to specify a local ZIP file instead of downloading from GitHub.

### Using the LOCAL_RELEASE Parameter

1. **Create a local release package:**
   
   Create a ZIP file with the necessary installer components. The structure should match what would normally be included in a GitHub release.

2. **Running the installer with a local release:**

   ```powershell
   # Run the installer with a local release file
   .\Installer.exe /LOCAL_RELEASE="C:\path\to\your\release.zip"
   ```

3. **Important considerations:**
   
   - The specified path must be an absolute path to an existing ZIP file
   - Paths with spaces should be properly quoted
   - The ZIP file structure should match the expected release structure
   - The installer will log the local file path and skip GitHub download entirely

### Debugging LOCAL_RELEASE Issues

If you encounter issues with the `/LOCAL_RELEASE` parameter:

1. Check the installer log file at `%LOCALAPPDATA%\RAUX\raux_install.log`
2. Verify the local file exists and is accessible
3. Ensure the ZIP file contains all required components
4. Try using a path without spaces or special characters

This feature is particularly useful for:
- Testing installer changes without creating GitHub releases
- Working in offline environments
- Testing with custom builds or configurations

## Local Release Parameter

The installer includes a `/LOCAL_RELEASE` parameter that allows you to specify a local release file instead of downloading from GitHub. This is particularly useful during development and testing.

### Using the Local Release Parameter

```
Installer-UX.exe /LOCAL_RELEASE=path/to/raux-setup.zip
```

When this parameter is provided, the installer will:
1. **Skip** downloading any files from GitHub
2. Use **only** the specified local release file
3. Copy the file to a temporary location and extract it
4. Proceed with installation using the local files

This completely bypasses the GitHub release download mechanism, allowing you to test installer changes without any internet dependency or GitHub access.

### Example Workflow

1. Make changes to installer scripts
2. Build the installer with VS Code task: "Build RAUX Installer"
3. Download PR artifacts from GitHub Actions
4. Test your changes using:
   ```
   Installer-UX.exe /LOCAL_RELEASE=C:\path\to\artifacts\raux-setup.zip
   ```
5. Verify the installer log shows: "Using local release file: [your-path]" instead of attempting any GitHub downloads

## Build Artifacts

The GitHub Actions workflow for PR builds creates artifacts with the following contents:

- `raux-[version]-[commit]-setup.exe`: The installer executable
- `raux-[version]-[commit]-setup.exe.sha256`: Checksum file
- `raux-[version]-[commit]-setup.zip`: Packaged installer with all components
- `README.txt`: Instructions for using the artifacts

These artifacts are retained for 7 days after the PR build.

## Common Issues and Troubleshooting

### Installer Not Finding Python

If the installer fails to locate Python, check that:
- You're using the correct path format (`%LOCALAPPDATA%\RAUX\python\python.exe`)
- The Python download URL in the installer script is valid
- The version constant (`PYTHON_VERSION`) is set correctly to 3.11.8

### Failed Package Installation

If Python packages fail to install:
- Check pip is properly installed and working
- Verify internet connectivity
- Ensure required packages are listed correctly in the installer

### Testing on Different Windows Versions

Remember to test the installer on:
- Windows 10
- Windows 11
- Different user permission levels (standard user vs administrator)

## Best Practices

1. **Keep Changes Focused**: Make small, targeted changes to the installer code to simplify testing and troubleshooting.

2. **Test Thoroughly**: Always test your changes with different scenarios before creating a PR.

3. **Use Local Release Parameter**: Always test using the local release parameter to ensure your changes work properly.

4. **Document Changes**: Update the plan.md file with your changes and progress.

5. **Update Tests**: If you add new functionality, make sure to update any relevant test procedures. 