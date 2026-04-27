document.addEventListener('DOMContentLoaded', () => {
    // API Base URL
    const API_URL = 'http://localhost:3000/api';

    // Elements
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Status Elements
    const statusDot = document.getElementById('status-dot');
    const statusHeading = document.getElementById('status-heading');
    const statusDesc = document.getElementById('status-desc');
    
    // QR Elements
    const qrContainer = document.getElementById('qr-container');
    const connectedContainer = document.getElementById('connected-container');
    const qrImage = document.getElementById('qr-image');
    
    // Forms
    const sendForm = document.getElementById('send-form');
    const scheduleForm = document.getElementById('schedule-form');
    const groupSelect = document.getElementById('group-select');
    const schedGroupSelect = document.getElementById('sched-group-select');
    const btnSend = document.getElementById('btn-send');

    // Global State
    let isConnected = false;
    let groups = [];

    // --- Tab Navigation ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');
            
            // Update active nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Update active tab pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(`tab-${targetTab}`).classList.add('active');

            // Load data based on tab
            if (targetTab === 'schedule') loadJobs();
            if (targetTab === 'history') loadHistory();
        });
    });

    // --- Toast Notifications ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // --- Polling WhatsApp Status ---
    async function checkStatus() {
        try {
            const res = await fetch(`${API_URL}/status`);
            const data = await res.json();

            if (data.isConnected) {
                if (!isConnected) {
                    isConnected = true;
                    updateStatusUI('green', 'Connected', 'Ready to send');
                    qrContainer.style.display = 'none';
                    connectedContainer.style.display = 'block';
                    loadGroups(); // Load groups once connected
                }
            } else {
                isConnected = false;
                connectedContainer.style.display = 'none';
                if (data.qr) {
                    qrImage.src = data.qr;
                    qrContainer.style.display = 'block';
                    updateStatusUI('yellow', 'Scan QR Code', 'Waiting for scan...');
                } else {
                    qrContainer.style.display = 'none';
                    updateStatusUI('red', 'Disconnected', 'Starting up...');
                }
            }
        } catch (error) {
            console.error('Status check failed:', error);
            updateStatusUI('red', 'Server Offline', 'Cannot reach backend');
        }
    }

    function updateStatusUI(color, heading, desc) {
        statusDot.className = `status-indicator ${color}`;
        statusHeading.textContent = heading;
        statusDesc.textContent = desc;
    }

    // --- Load WhatsApp Groups ---
    async function loadGroups() {
        try {
            const res = await fetch(`${API_URL}/groups`);
            groups = await res.json();
            
            // Populate select dropdowns
            const optionsHtml = `<option value="" disabled selected>Select a group...</option>` + 
                groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            
            groupSelect.innerHTML = optionsHtml;
            schedGroupSelect.innerHTML = optionsHtml;
        } catch (error) {
            console.error('Failed to load groups:', error);
            showToast('Failed to load groups', 'error');
        }
    }

    // --- Send Message Now ---
    sendForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isConnected) return showToast('WhatsApp is not connected!', 'error');

        const groupId = groupSelect.value;
        const groupName = groupSelect.options[groupSelect.selectedIndex].text;
        const message = document.getElementById('message-text').value;

        btnSend.disabled = true;
        btnSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

        try {
            const res = await fetch(`${API_URL}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId, groupName, message })
            });
            const data = await res.json();

            if (res.ok) {
                showToast('Message added to send queue!');
                document.getElementById('message-text').value = ''; // Clear form
            } else {
                showToast(data.error || 'Failed to send message', 'error');
            }
        } catch (error) {
            showToast('Server error', 'error');
        } finally {
            btnSend.disabled = false;
            btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Now';
        }
    });

    // --- Schedule Message ---
    scheduleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const groupId = schedGroupSelect.value;
        const groupName = schedGroupSelect.options[schedGroupSelect.selectedIndex].text;
        const cronExpression = document.getElementById('cron-input').value;
        const message = document.getElementById('sched-message-text').value;

        try {
            const res = await fetch(`${API_URL}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId, groupName, message, cronExpression })
            });
            const data = await res.json();

            if (res.ok) {
                showToast('Job scheduled successfully!');
                scheduleForm.reset();
                loadJobs(); // Refresh list
            } else {
                showToast(data.error || 'Failed to schedule job', 'error');
            }
        } catch (error) {
            showToast('Server error', 'error');
        }
    });

    // --- Load Jobs ---
    async function loadJobs() {
        try {
            const res = await fetch(`${API_URL}/jobs`);
            const jobs = await res.json();
            const container = document.getElementById('jobs-container');
            
            if (jobs.length === 0) {
                container.innerHTML = '<p class="text-muted">No active scheduled jobs.</p>';
                return;
            }

            container.innerHTML = jobs.map(job => `
                <div class="job-item">
                    <div class="job-info">
                        <h4>${job.group_name}</h4>
                        <p>${job.message.substring(0, 30)}${job.message.length > 30 ? '...' : ''}</p>
                        <div class="job-cron"><i class="fa-regular fa-clock"></i> ${job.cron_expression}</div>
                    </div>
                    <button class="btn btn-danger" onclick="deleteJob(${job.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load jobs:', error);
        }
    }

    // Global function for onclick
    window.deleteJob = async function(id) {
        if (!confirm('Delete this scheduled job?')) return;
        try {
            await fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE' });
            showToast('Job deleted');
            loadJobs();
        } catch (error) {
            showToast('Failed to delete job', 'error');
        }
    };

    // --- Load History ---
    async function loadHistory() {
        try {
            const res = await fetch(`${API_URL}/history`);
            const history = await res.json();
            const tbody = document.getElementById('history-table-body');
            
            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No messages sent yet.</td></tr>';
                return;
            }

            tbody.innerHTML = history.map(row => {
                const date = new Date(row.sent_at).toLocaleString();
                const statusClass = row.status === 'sent' ? 'sent' : 'failed';
                
                return `
                <tr>
                    <td><span class="status-badge ${statusClass}">${row.status}</span></td>
                    <td><strong>${row.group_name}</strong></td>
                    <td title="${row.message}">${row.message.substring(0, 40)}${row.message.length > 40 ? '...' : ''}</td>
                    <td class="text-muted text-sm">${date}</td>
                </tr>
            `}).join('');
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }

    // --- Init ---
    // Poll status every 3 seconds
    setInterval(checkStatus, 3000);
    checkStatus(); // Initial check
});
