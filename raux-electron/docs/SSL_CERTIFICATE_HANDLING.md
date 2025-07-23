# SSL Certificate Handling in RAUX

## Overview

GAIA UI includes automatic SSL certificate handling to support installations in corporate environments that use custom Certificate Authorities (CAs) or SSL inspection proxies. In most cases, no manual configuration is required.

## How It Works

### Automatic Certificate Handling

GAIA UI automatically uses your operating system's trusted certificates:

1. **Windows**: Uses the Windows Certificate Store automatically
2. **Linux**: Uses system-installed certificates

**No manual configuration required** - If your browser can access HTTPS sites, GAIA UI will work too.

### How It Works

- When an SSL error is detected, GAIA UI automatically retries using enhanced certificate handling
- The system leverages Node.js's built-in ability to use OS certificate stores
- Corporate certificates installed by your IT department are automatically used

### Manual Configuration (Rarely Needed)

If automatic detection doesn't work, you have two options:

#### Option 1: Environment Variable

Set the `NODE_EXTRA_CA_CERTS` environment variable to point to your CA bundle:

**Windows:**
```cmd
set NODE_EXTRA_CA_CERTS=C:\path\to\your\ca-bundle.crt
```

**Linux:**
```bash
export NODE_EXTRA_CA_CERTS=/path/to/your/ca-bundle.crt
```

#### Option 2: Application Certificate Directory

Place your CA bundle file (`ca-bundle.crt`) in the GAIA UI runtime directory:
- Windows: `%LOCALAPPDATA%\GaiaUi\runtime\certificates\`
- Linux: `~/.config/GaiaUi/runtime/certificates/`

## Troubleshooting

### Common SSL Errors

**"unable to get local issuer certificate"**
- GAIA UI will automatically retry using your OS certificate store
- If the error persists, your IT department may need to install the corporate CA certificates on your system
- As a last resort, you can manually configure certificates using the options above

### If Problems Persist

1. **Check with IT**: Ensure your corporate CA certificates are properly installed in your OS
2. **Test with Browser**: If your browser can access HTTPS sites, GAIA UI should work too
3. **Manual Certificate**: As a last resort, ask IT for your organization's CA bundle file

### Testing Only - Disable Certificate Verification

⚠️ **WARNING**: This is insecure and should only be used for testing!

```cmd
set NODE_TLS_REJECT_UNAUTHORIZED=0
```

This completely disables certificate verification and should never be used in production.

## Technical Details

The SSL certificate handling uses a smart fallback system:

1. First attempts standard HTTPS connection
2. On SSL error, automatically retries with OS certificate store
3. Falls back to any manually configured certificates

This approach ensures compatibility with corporate environments while maintaining security.

## Security Best Practices

1. Always keep certificate verification enabled
2. Let GAIA UI use the OS certificate store (default behavior)
3. Only provide custom certificates when absolutely necessary
4. Never use `NODE_TLS_REJECT_UNAUTHORIZED=0` in production