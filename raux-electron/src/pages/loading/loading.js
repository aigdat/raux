// Listen for IPC messages and update the status messages container
const statusDiv = document.getElementById('status-messages');

// Store all messages
const messages = [];

// Helper to render all messages
function renderMessages() {
  statusDiv.innerHTML = messages.map(msg => {
    let color = '#222';
    if (msg.type === 'error') color = '#c0392b';
    if (msg.type === 'success') color = '#27ae60';
    if (msg.type === 'info') color = '#2980b9';
    if (msg.type === 'progress') color = '#f39c12';
    return `<div style="margin-bottom:6px;color:${color}">${msg.message}</div>`;
  }).join('');
}

// Listen for all relevant channels
['installation:status', 'installation:progress', 'installation:error'].forEach(channel => {
  window.ipc?.on(channel, (msg) => {
    if (msg && msg.message) {
      messages.push(msg);
      renderMessages();
    }
  });
});

// Optionally, scroll to bottom on new message
const observer = new MutationObserver(() => {
  statusDiv.scrollTop = statusDiv.scrollHeight;
});

observer.observe(statusDiv, { childList: true }); 