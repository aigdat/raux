// Listen for IPC messages and update the status messages container
const statusDiv = document.getElementById('status-messages');

// Store all messages
const messages = [];

// Helper to render all messages
function renderMessages() {
  statusDiv.innerHTML = messages.map(msg => {

    if (msg.type === 'error') {
      return `<div style="color:#c0392b">${msg.message}</div>`;
    }

    // if (msg.type === 'success') color = '#27ae60';
    // if (msg.type === 'info') color = '#2980b9';
    // if (msg.type === 'progress') color = '#f39c12';

    return `<div>${msg.message}</div>`;
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