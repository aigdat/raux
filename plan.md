# Lemonade Status Indicator Implementation Plan

## Overview
Implement visible status indicators for Lemonade server in the RAUX Electron app UI to provide users with real-time feedback about Lemonade availability and health.

## Problem Statement
- The backend already has comprehensive Lemonade status monitoring (`lemonadeStatusMonitor`, `lemonadeClient`)
- Status updates are being sent via IPC channel `lemonade:status`
- The loading page and main UI are NOT displaying Lemonade status information
- Users have no visual indication of Lemonade server status (running, stopped, error, etc.)

## Current Backend Implementation (COMPLETED)
✅ **Status Monitoring**: `lemonadeStatusMonitor.ts` - Monitors health and status
✅ **IPC Communication**: Sends status updates via `LEMONADE_STATUS` channel
✅ **Window Title Updates**: Shows status in window title bar
✅ **Health Checks**: Regular health checks via `/api/v0/health` endpoint
✅ **Process Management**: Start/stop Lemonade server processes

## Missing Frontend Implementation
❌ **Loading Page**: Not listening to `lemonade:status` IPC channel
❌ **Status Display**: No visual indicator for Lemonade status in UI
❌ **Status Messages**: Lemonade status not shown in status messages area

## Implementation Plan

### 1. Update Loading Page Status Display
**File**: `raux-electron/src/pages/loading/loading.html`

- [ ] Add `lemonade:status` to the IPC channel listeners array
- [ ] Create Lemonade-specific status message handling
- [ ] Add visual indicators for Lemonade status (icon, color coding)
- [ ] Include Lemonade status in the status messages area

**Example Status Messages**:
```
- "Checking Lemonade availability..."
- "Lemonade Server: Starting..."
- "Lemonade Server: Ready ✓"
- "Lemonade Server: Unavailable (Generic mode)"
- "Lemonade Server: Error - Check connection"
```

### 2. Add Lemonade Status Icon/Badge
**Location**: Loading page status area

- [ ] Add a dedicated Lemonade status indicator section
- [ ] Use color coding: Green (healthy), Yellow (starting), Red (error), Gray (unavailable)
- [ ] Show status text with appropriate styling
- [ ] Position near other status information

### 3. Enhance Status Message Formatting
**Enhancement**: Better visual hierarchy for different service statuses

- [ ] Categorize messages by service (RAUX vs Lemonade)
- [ ] Use different styling for different message types
- [ ] Add icons or badges for different services
- [ ] Implement status persistence (show last known status)

### 4. Testing Scenarios
- [ ] **Generic Mode**: Verify "Lemonade unavailable" message appears
- [ ] **Hybrid Mode**: Verify Lemonade startup sequence is visible
- [ ] **Health Check Failures**: Verify error states are displayed
- [ ] **Status Transitions**: Verify status changes are reflected in real-time

## Implementation Details

### Required Code Changes

#### 1. Loading Page IPC Listener Update
**File**: `raux-electron/src/pages/loading/loading.html` (line ~190)

Current:
```javascript
['installation:status', 'installation:progress', 'installation:error'].forEach(channel => {
```

Updated:
```javascript
['installation:status', 'installation:progress', 'installation:error', 'lemonade:status'].forEach(channel => {
```

#### 2. Lemonade Status Message Handler
**File**: `raux-electron/src/pages/loading/loading.html`

Add specialized handling for `lemonade:status` messages:
```javascript
window.ipc?.on('lemonade:status', (status) => {
  if (status) {
    const message = formatLemonadeStatus(status);
    messages.push({ type: 'lemonade', message });
    renderMessages();
  }
});
```

#### 3. Status Formatting Function
Add function to format Lemonade status appropriately:
```javascript
function formatLemonadeStatus(status) {
  const icon = status.isHealthy ? '✓' : '⚠';
  const statusText = status.status.charAt(0).toUpperCase() + status.status.slice(1);
  return `Lemonade Server: ${statusText} ${icon}`;
}
```

### Backend Status Types (Reference)
**From**: `ipc/ipcTypes.ts`
```typescript
export interface LemonadeStatus {
  status: 'unknown' | 'unavailable' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  isHealthy: boolean;
  lastHealthCheck?: LemonadeHealthCheck;
  processManaged: boolean;
  timestamp: number;
}
```

## Success Criteria
- [ ] Loading page shows Lemonade status messages in real-time
- [ ] Users can see when Lemonade is starting, running, or unavailable
- [ ] Error states are clearly communicated to users
- [ ] Status updates appear in the status messages area
- [ ] Visual indicators help distinguish between RAUX and Lemonade status

## Notes
- Backend implementation is already complete and robust
- Only frontend display changes are needed
- Changes should be minimal and focused on the loading page UI
- Consider adding status indicators to other parts of UI in future iterations
