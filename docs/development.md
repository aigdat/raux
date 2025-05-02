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

## Local Release Parameter

The installer includes a `/LOCAL_RELEASE` parameter that allows you to specify a local release file instead of downloading from GitHub. This is particularly useful during development and testing.

### Using the Local Release Parameter

```
Installer-UX.exe /LOCAL_RELEASE=path/to/raux-setup.zip
```

This parameter tells the installer to use the local file instead of attempting to download from GitHub, allowing you to test changes without publishing releases.

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