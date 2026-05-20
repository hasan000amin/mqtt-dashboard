const socket = io();

// State management
let currentTopic = 'all';
let currentTab = 'allTopics';
let allData = new Map(); // topic -> array of data
let topicsList = [];
let messageCount = 0;
let messageTimestamps = [];

// Charts
let multiSuhuChart, multiKelembapanChart, trendChart;
let suhuChart, kelembapanChart, numericChart;

// Initialize all charts
function initCharts() {
    // Multi Topic Bar Charts
    const ctxMultiSuhu = document.getElementById('multiSuhuChart')?.getContext('2d');
    const ctxMultiKelembapan = document.getElementById('multiKelembapanChart')?.getContext('2d');
    const ctxTrend = document.getElementById('trendChart')?.getContext('2d');

    const darkThemeConfig = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                labels: { color: '#9ca3af', font: { size: 12 } }
            }
        },
        scales: {
            y: {
                grid: { color: '#374151' },
                ticks: { color: '#9ca3af' }
            },
            x: {
                grid: { color: '#374151' },
                ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 45 }
            }
        }
    };

    if (ctxMultiSuhu) {
        multiSuhuChart = new Chart(ctxMultiSuhu, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Suhu (°C)', data: [], backgroundColor: 'rgba(249, 115, 22, 0.7)', borderColor: '#f97316', borderWidth: 1 }] },
            options: darkThemeConfig
        });
    }

    if (ctxMultiKelembapan) {
        multiKelembapanChart = new Chart(ctxMultiKelembapan, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Kelembapan (%)', data: [], backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: '#3b82f6', borderWidth: 1 }] },
            options: darkThemeConfig
        });
    }

    if (ctxTrend) {
        trendChart = new Chart(ctxTrend, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                ...darkThemeConfig,
                scales: {
                    ...darkThemeConfig.scales,
                    y: { ...darkThemeConfig.scales.y, title: { display: true, text: 'Temperature (°C)', color: '#9ca3af' } }
                }
            }
        });
    }

    // Detail charts
    const ctxSuhu = document.getElementById('suhuChart')?.getContext('2d');
    const ctxKelembapan = document.getElementById('kelembapanChart')?.getContext('2d');
    const ctxNumeric = document.getElementById('numericChart')?.getContext('2d');

    if (ctxSuhu) {
        suhuChart = new Chart(ctxSuhu, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Suhu (°C)', data: [], borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', tension: 0.3, fill: true }] },
            options: darkThemeConfig
        });
    }

    if (ctxKelembapan) {
        kelembapanChart = new Chart(ctxKelembapan, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Kelembapan (%)', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 242, 0.1)', tension: 0.3, fill: true }] },
            options: darkThemeConfig
        });
    }

    if (ctxNumeric) {
        numericChart = new Chart(ctxNumeric, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: darkThemeConfig
        });
    }
}

// Update message rate
function updateMessageRate() {
    const now = Date.now();
    messageTimestamps = messageTimestamps.filter(t => now - t < 60000);
    const rate = messageTimestamps.length;
    document.getElementById('messageRate').textContent = rate;
}

// Update topic buttons
function updateTopicButtons() {
    const container = document.getElementById('topicButtons');
    const buttons = topicsList.map(topic => `
        <button class="topic-btn px-4 py-2 rounded-lg text-sm font-medium transition ${currentTopic === topic ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" data-topic="${topic}">
            <span>${topic} (${allData.get(topic)?.length || 0})</span>
        </button>
    `).join('');

    container.innerHTML = buttons;

    document.querySelectorAll('.topic-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTopic = btn.dataset.topic;
            updateTopicButtons();
            updateTopicDetailDisplay();
            document.getElementById('activeTopic').textContent = currentTopic;
        });
    });
}

// Update All Topics Overview
function updateAllTopicsOverview() {
    const totalMessages = Array.from(allData.values()).reduce((sum, data) => sum + data.length, 0);
    document.getElementById('totalTopics').textContent = topicsList.length;
    document.getElementById('totalMessages').textContent = totalMessages;

    // Update bar charts
    const topicsWithTemp = [];
    const tempValues = [];
    const topicsWithHum = [];
    const humValues = [];

    for (const [topic, data] of allData.entries()) {
        if (data.length > 0) {
            const latest = data[data.length - 1];
            if (latest.suhu !== undefined) {
                topicsWithTemp.push(topic.length > 20 ? topic.substring(0, 20) + '...' : topic);
                tempValues.push(latest.suhu);
            }
            if (latest.kelembapan !== undefined) {
                topicsWithHum.push(topic.length > 20 ? topic.substring(0, 20) + '...' : topic);
                humValues.push(latest.kelembapan);
            }
        }
    }

    if (multiSuhuChart && topicsWithTemp.length > 0) {
        multiSuhuChart.data.labels = topicsWithTemp;
        multiSuhuChart.data.datasets[0].data = tempValues;
        multiSuhuChart.update();
    }

    if (multiKelembapanChart && topicsWithHum.length > 0) {
        multiKelembapanChart.data.labels = topicsWithHum;
        multiKelembapanChart.data.datasets[0].data = humValues;
        multiKelembapanChart.update();
    }

    // Update trend chart (last 20 data points for each topic)
    updateTrendChart();

    // Update summary table
    updateTopicsSummaryTable();
}

// Update trend chart
function updateTrendChart() {
    if (!trendChart) return;

    const datasets = [];
    const colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec489a', '#06b6d4', '#f59e0b', '#ef4444'];

    let maxDataPoints = 0;
    for (const [topic, data] of allData.entries()) {
        const tempData = data.filter(d => d.suhu !== undefined).slice(-30);
        if (tempData.length > 0) {
            maxDataPoints = Math.max(maxDataPoints, tempData.length);
        }
    }

    let colorIndex = 0;
    for (const [topic, data] of allData.entries()) {
        const tempData = data.filter(d => d.suhu !== undefined).slice(-30);
        if (tempData.length > 3) {
            const labels = tempData.map(d => {
                const date = new Date(d.timestamp * 1000);
                return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            });

            datasets.push({
                label: topic,
                data: tempData.map(d => d.suhu),
                borderColor: colors[colorIndex % colors.length],
                backgroundColor: 'transparent',
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                pointHoverRadius: 5
            });
            colorIndex++;

            if (colorIndex === 1 && trendChart.data.labels.length === 0) {
                trendChart.data.labels = labels;
            }
        }
    }

    trendChart.data.datasets = datasets;
    trendChart.update();
}

// Update topics summary table
function updateTopicsSummaryTable() {
    const tbody = document.getElementById('topicsSummaryTable');
    if (!tbody) return;

    if (topicsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No topics yet...</td></tr>';
        return;
    }

    const rows = [];
    for (const topic of topicsList) {
        const data = allData.get(topic) || [];
        if (data.length === 0) continue;

        const latest = data[data.length - 1];
        const tempData = data.filter(d => d.suhu !== undefined).map(d => d.suhu);
        const humData = data.filter(d => d.kelembapan !== undefined).map(d => d.kelembapan);

        const avgTemp = tempData.length > 0 ? (tempData.reduce((a, b) => a + b, 0) / tempData.length).toFixed(1) : '-';
        const minTemp = tempData.length > 0 ? Math.min(...tempData).toFixed(1) : '-';
        const maxTemp = tempData.length > 0 ? Math.max(...tempData).toFixed(1) : '-';
        const avgHum = humData.length > 0 ? (humData.reduce((a, b) => a + b, 0) / humData.length).toFixed(1) : '-';

        rows.push(`
            <tr class="hover:bg-gray-800/30">
                <td class="px-4 py-3 text-sm font-mono text-cyan-400">${topic}</td>
                <td class="px-4 py-3 text-sm text-gray-300">${latest.timestamp_readable || '-'}</td>
                <td class="px-4 py-3 text-sm text-orange-400">${avgTemp}°C</td>
                <td class="px-4 py-3 text-sm text-gray-300">${minTemp}°C / ${maxTemp}°C</td>
                <td class="px-4 py-3 text-sm text-blue-400">${avgHum}%</td>
                <td class="px-4 py-3 text-sm text-gray-300">${data.length}</td>
            </tr>
        `);
    }

    tbody.innerHTML = rows.join('');
}

// Update topic detail display
function updateTopicDetailDisplay() {
    const topicData = allData.get(currentTopic) || [];
    const latestData = topicData[topicData.length - 1];

    if (latestData && (latestData.suhu !== undefined || latestData.kelembapan !== undefined)) {
        document.getElementById('sensorContent')?.classList.remove('hidden');
        document.getElementById('customContent')?.classList.add('hidden');
        updateSensorCharts(currentTopic, topicData);
    } else if (latestData && Object.keys(latestData).length > 0) {
        document.getElementById('sensorContent')?.classList.add('hidden');
        document.getElementById('customContent')?.classList.remove('hidden');
        updateCustomDisplay(currentTopic, topicData);
    } else {
        document.getElementById('sensorContent')?.classList.add('hidden');
        document.getElementById('customContent')?.classList.add('hidden');
    }
}

function updateSensorCharts(topic, data) {
    if (!suhuChart || !kelembapanChart) return;

    const labels = data.map(d => {
        const date = new Date(d.timestamp * 1000);
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    const suhuData = data.map(d => d.suhu || 0);
    const kelembapanData = data.map(d => d.kelembapan || 0);

    suhuChart.data.labels = labels;
    suhuChart.data.datasets[0].data = suhuData;
    suhuChart.update();

    kelembapanChart.data.labels = labels;
    kelembapanChart.data.datasets[0].data = kelembapanData;
    kelembapanChart.update();
}

function updateCustomDisplay(topic, data) {
    const latestData = data[data.length - 1];
    if (!latestData) return;

    const displayDiv = document.getElementById('customDataDisplay');
    const excludeFields = ['topic', 'timestamp', 'timestamp_readable', 'received_at'];
    const dataFields = Object.keys(latestData).filter(k => !excludeFields.includes(k));

    displayDiv.innerHTML = dataFields.map(field => `
        <div class="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div class="text-gray-400 text-sm mb-1">${field}</div>
            <div class="text-xl font-bold text-gray-200 break-all">${typeof latestData[field] === 'object' ? JSON.stringify(latestData[field]) : latestData[field]}</div>
        </div>
    `).join('');

    if (numericChart) {
        const numericFields = dataFields.filter(field => typeof latestData[field] === 'number');
        if (numericFields.length > 0) {
            const labels = data.map(d => {
                const date = new Date(d.timestamp * 1000);
                return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            });

            const datasets = numericFields.map((field, idx) => ({
                label: field,
                data: data.map(d => d[field] || 0),
                borderColor: `hsl(${idx * 360 / numericFields.length}, 70%, 60%)`,
                tension: 0.3,
                fill: false,
                pointRadius: 2
            }));

            numericChart.data.labels = labels;
            numericChart.data.datasets = datasets;
            numericChart.update();
            document.getElementById('numericChart')?.parentElement.classList.remove('hidden');
        } else {
            document.getElementById('numericChart')?.parentElement.classList.add('hidden');
        }
    }
}

function updateLogTable() {
    const tbody = document.getElementById('logTableBody');
    let allMessages = [];

    for (const [topic, data] of allData.entries()) {
        allMessages.push(...data.slice(-20).map(d => ({ ...d, topic })));
    }

    allMessages.sort((a, b) => b.timestamp - a.timestamp);
    const recentMessages = allMessages.slice(0, 50);

    if (recentMessages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">No data yet...</td></tr>';
        return;
    }

    tbody.innerHTML = recentMessages.map((item, index) => {
        let displayData = { ...item };
        delete displayData.topic;
        delete displayData.timestamp;
        delete displayData.timestamp_readable;
        delete displayData.received_at;

        return `
            <tr class="hover:bg-gray-800/30">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${index + 1}</td>
                <td class="px-4 py-3 text-sm font-mono text-xs text-cyan-400 break-all">${item.topic}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-400">${item.timestamp_readable}</td>
                <td class="px-4 py-3 text-sm text-gray-300 break-all">${JSON.stringify(displayData).substring(0, 150)}${JSON.stringify(displayData).length > 150 ? '...' : ''}</td>
            </tr>
        `;
    }).join('');
}

// Tab switching
function switchTab(tab) {
    currentTab = tab;

    if (tab === 'allTopics') {
        document.getElementById('allTopicsTab')?.classList.remove('hidden');
        document.getElementById('topicDetailTab')?.classList.add('hidden');
        document.getElementById('topicSelectorContainer')?.classList.add('hidden');
        document.getElementById('tabAllTopics').className = 'tab-active px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2';
        document.getElementById('tabTopicDetail').className = 'tab-inactive px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2';
        document.getElementById('activeTopic').textContent = 'All Topics';
        updateAllTopicsOverview();
    } else {
        document.getElementById('allTopicsTab')?.classList.add('hidden');
        document.getElementById('topicDetailTab')?.classList.remove('hidden');
        document.getElementById('topicSelectorContainer')?.classList.remove('hidden');
        document.getElementById('tabAllTopics').className = 'tab-inactive px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2';
        document.getElementById('tabTopicDetail').className = 'tab-active px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2';
        if (topicsList.length > 0 && !currentTopic) {
            currentTopic = topicsList[0];
        }
        updateTopicButtons();
        updateTopicDetailDisplay();
        document.getElementById('activeTopic').textContent = currentTopic || 'None';
    }
}

// Socket event listener
socket.on('sensor-data', (data) => {
    allData = new Map(Object.entries(data.allTopics));
    topicsList = data.topicsList;
    messageCount = data.messageCount;
    messageTimestamps.push(Date.now());

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('id-ID');
    document.getElementById('totalMessages').textContent = messageCount;
    document.getElementById('totalTopics').textContent = topicsList.length;

    updateMessageRate();

    if (currentTab === 'allTopics') {
        updateAllTopicsOverview();
    } else {
        updateTopicButtons();
        if (currentTopic && allData.has(currentTopic)) {
            updateTopicDetailDisplay();
        } else if (topicsList.length > 0) {
            currentTopic = topicsList[0];
            updateTopicButtons();
            updateTopicDetailDisplay();
        }
        document.getElementById('activeTopic').textContent = currentTopic || 'None';
    }

    updateLogTable();
});

// Load initial data and setup
fetch('/api/topics')
    .then(response => response.json())
    .then(topics => {
        topicsList = topics;
        return Promise.all(topics.map(topic =>
            fetch(`/api/data?topic=${encodeURIComponent(topic)}`).then(r => r.json())
        ));
    })
    .then(allTopicData => {
        allData.clear();
        topicsList.forEach((topic, idx) => {
            allData.set(topic, allTopicData[idx]);
        });
        initCharts();

        if (topicsList.length > 0) {
            currentTopic = topicsList[0];
        }

        updateAllTopicsOverview();
        updateLogTable();

        // Setup tab listeners
        document.getElementById('tabAllTopics')?.addEventListener('click', () => switchTab('allTopics'));
        document.getElementById('tabTopicDetail')?.addEventListener('click', () => switchTab('topicDetail'));
    })
    .catch(err => {
        console.error('Error loading initial data:', err);
        initCharts();
    });