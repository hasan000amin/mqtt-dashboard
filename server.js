const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Konfigurasi
const PORT = 3001;
const MQTT_BROKER = 'mqtt://10.211.29.242';
const MQTT_TOPIC = '#'; // Subscribe ke semua topic

// Serve static files
app.use(express.static('public'));

// Data storage - grouped by topic
let allTopicsData = new Map(); // Map of topic -> array of data
let topicsList = []; // List of unique topics
let messageCount = 0;

const MAX_DATA_POINTS_PER_TOPIC = 100;

// Load existing data from file
const dataFile = path.join(__dirname, 'logs', 'all_sensors_data.json');
if (fs.existsSync(dataFile)) {
    try {
        const rawData = fs.readFileSync(dataFile);
        const savedData = JSON.parse(rawData);
        allTopicsData = new Map(Object.entries(savedData));
        topicsList = Array.from(allTopicsData.keys());
        console.log(`Loaded ${topicsList.length} topics from file`);
    } catch (e) {
        console.log('No existing data file');
    }
}

// Save data to file periodically
setInterval(() => {
    try {
        const dataToSave = Object.fromEntries(allTopicsData);
        fs.writeFileSync(dataFile, JSON.stringify(dataToSave, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}, 10000); // Save every 10 seconds

// Koneksi ke MQTT broker
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log(`Connected to MQTT broker: ${MQTT_BROKER}`);
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(`Subscribed to all topics (#)`);
        }
    });
});

mqttClient.on('message', (topic, message) => {
    try {
        let data;
        const messageStr = message.toString();

        // Try to parse as JSON
        try {
            data = JSON.parse(messageStr);
        } catch (e) {
            // If not JSON, create object with raw message
            data = {
                raw_message: messageStr,
                timestamp: Math.floor(Date.now() / 1000)
            };
        }

        // Ensure timestamp exists
        if (!data.timestamp) {
            data.timestamp = Math.floor(Date.now() / 1000);
        }

        // Add topic and readable timestamp
        const enrichedData = {
            ...data,
            topic: topic,
            timestamp_readable: new Date().toLocaleString('id-ID'),
            received_at: new Date().toLocaleString('id-ID')
        };

        // Store data for this topic
        if (!allTopicsData.has(topic)) {
            allTopicsData.set(topic, []);
            topicsList.push(topic);
            console.log(`New topic detected: ${topic}`);
        }

        const topicData = allTopicsData.get(topic);
        topicData.push(enrichedData);

        // Keep only last MAX_DATA_POINTS_PER_TOPIC
        if (topicData.length > MAX_DATA_POINTS_PER_TOPIC) {
            topicData.shift();
        }

        messageCount++;

        // Emit to all connected clients
        io.emit('sensor-data', {
            topic: topic,
            data: enrichedData,
            allTopics: Object.fromEntries(allTopicsData),
            topicsList: topicsList,
            messageCount: messageCount
        });

        console.log(`[${new Date().toLocaleTimeString()}] Topic: ${topic} | Data: ${messageStr.substring(0, 100)}`);

    } catch (e) {
        console.error('Error parsing MQTT message:', e);
    }
});

mqttClient.on('error', (err) => {
    console.error('MQTT Error:', err);
});

// API endpoints
app.get('/api/data', (req, res) => {
    const { topic } = req.query;
    if (topic && allTopicsData.has(topic)) {
        res.json(allTopicsData.get(topic));
    } else {
        res.json(Object.fromEntries(allTopicsData));
    }
});

app.get('/api/topics', (req, res) => {
    res.json(topicsList);
});

app.get('/api/latest', (req, res) => {
    const latest = {};
    for (const [topic, data] of allTopicsData) {
        if (data.length > 0) {
            latest[topic] = data[data.length - 1];
        }
    }
    res.json(latest);
});

app.get('/api/stats', (req, res) => {
    const stats = {};
    for (const [topic, data] of allTopicsData) {
        if (data.length > 0 && data[0].suhu !== undefined) {
            const suhuValues = data.map(d => d.suhu).filter(v => v !== undefined);
            const kelembapanValues = data.map(d => d.kelembapan).filter(v => v !== undefined);

            if (suhuValues.length > 0) {
                stats[topic] = {
                    suhu_avg: suhuValues.reduce((a, b) => a + b, 0) / suhuValues.length,
                    suhu_min: Math.min(...suhuValues),
                    suhu_max: Math.max(...suhuValues),
                    kelembapan_avg: kelembapanValues.length > 0 ? kelembapanValues.reduce((a, b) => a + b, 0) / kelembapanValues.length : null,
                    kelembapan_min: kelembapanValues.length > 0 ? Math.min(...kelembapanValues) : null,
                    kelembapan_max: kelembapanValues.length > 0 ? Math.max(...kelembapanValues) : null
                };
            }
        }
    }
    res.json(stats);
});

server.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
    console.log(`Monitoring all MQTT topics from ${MQTT_BROKER}`);
});